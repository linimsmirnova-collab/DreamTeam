const request = require('supertest');
const io = require('socket.io-client');
const { server, activeManagers } = require('./server');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('DreamTeam – полный игровой цикл', () => {
    let creatorCookie;
    let botCookies = [];
    let sockets = [];
    let roomCode;
    let creatorUuid, botUuids = [];
    let httpServer;
    let port;

    beforeAll(async () => {
        httpServer = server.listen(0);
        port = httpServer.address().port;
        activeManagers.clear();
    });

    afterAll((done) => {
        for (let s of sockets) if (s && s.connected) s.disconnect();
        httpServer.close(done);
    });

    test('1. Создание комнаты', async () => {
        const res = await request(httpServer)
            .post('/api/room/create')
            .send({ nickname: 'Creator', maxPlayers: 4, randomEvents: false });
        expect(res.status).toBe(201);
        roomCode = res.body.roomId;
        creatorUuid = res.body.playerId;
        creatorCookie = res.headers['set-cookie'][0].split(';')[0];
    });

    test('2. Присоединение 3 ботов', async () => {
        for (let i = 1; i <= 3; i++) {
            const res = await request(httpServer)
                .post('/api/room/join')
                .send({ roomCode, nickname: `Bot${i}` });
            expect(res.status).toBe(200);
            botUuids.push(res.body.playerId);
            botCookies.push(res.headers['set-cookie'][0].split(';')[0]);
        }
    });

    test('3. Получение списка игроков', async () => {
        const res = await request(httpServer)
            .get(`/api/room/players?code=${roomCode}`)
            .set('Cookie', creatorCookie);
        expect(res.status).toBe(200);
        expect(res.body.players).toHaveLength(4);
    });

    test('4. Подключение WebSocket для всех игроков', (done) => {
        let connected = 0;
        const allPlayers = [
            { uuid: creatorUuid, cookie: creatorCookie },
            ...botUuids.map((uuid, idx) => ({ uuid, cookie: botCookies[idx] }))
        ];
        for (let p of allPlayers) {
            const sock = io(`http://localhost:${port}`, { transports: ['websocket'] });
            sock.on('connect', () => {
                sock.emit('register', { playerUuid: p.uuid, roomCode });
                connected++;
                if (connected === allPlayers.length) done();
            });
            sockets.push(sock);
        }
        setTimeout(() => done(new Error('WebSocket connect timeout')), 10000);
    });

    test('5. Старт игры и получение game-start', (done) => {
        let gameStartReceived = false;
        for (let sock of sockets) {
            sock.on('game-start', () => {
                if (!gameStartReceived) {
                    gameStartReceived = true;
                    done();
                }
            });
        }
        request(httpServer)
            .post('/api/game/start')
            .set('Cookie', creatorCookie)
            .expect(200)
            .catch(done);
        setTimeout(() => {
            if (!gameStartReceived) done(new Error('game-start not received'));
        }, 5000);
    });

    test('6. Получение карт', async () => {
        const creatorCards = await request(httpServer)
            .get('/api/game/my-cards')
            .set('Cookie', creatorCookie);
        expect(creatorCards.status).toBe(200);
        expect(creatorCards.body.hand).toHaveLength(6);
        for (let cookie of botCookies) {
            const res = await request(httpServer)
                .get('/api/game/my-cards')
                .set('Cookie', cookie);
            expect(res.status).toBe(200);
            expect(res.body.hand).toHaveLength(6);
        }
    });

    test('7. Вскрытие всех карт', async () => {
        const revealAll = async (cookie) => {
            const { body } = await request(httpServer)
                .get('/api/game/my-cards')
                .set('Cookie', cookie);
            for (let i = 0; i < body.hand.length; i++) {
                const res = await request(httpServer)
                    .post('/api/game/reveal-card')
                    .set('Cookie', cookie)
                    .send({ cat_card: i + 1 });
                expect(res.status).toBe(200);
                await delay(100);
            }
        };
        await revealAll(creatorCookie);
        for (let cookie of botCookies) await revealAll(cookie);
    });

    test('8. Голосование и ожидание завершения игры', async () => {
        let gameCompleted = false;
        let completeGameData = null;

        for (let sock of sockets) {
            sock.on('complete-game', (data) => {
                if (!gameCompleted) {
                    gameCompleted = true;
                    completeGameData = data;
                }
            });
        }

        const voteRound = async () => {
            const playersRes = await request(httpServer)
                .get(`/api/room/players?code=${roomCode}`)
                .set('Cookie', creatorCookie);
            const activePlayers = playersRes.body.players.filter(p => p.active);
            const activeUuids = activePlayers.map(p => p.uuid);
            const activeBots = activePlayers.filter(p => !p.be_creator);

            const creatorActive = activePlayers.some(p => p.uuid === creatorUuid);
            if (creatorActive && activeBots.length > 0) {
                const voteCreator = await request(httpServer)
                    .post('/api/game/create')
                    .set('Cookie', creatorCookie)
                    .send({ vote_id: activeBots[0].uuid });
                expect(voteCreator.status).toBe(200);
            }

            for (let i = 0; i < botCookies.length; i++) {
                const botUuid = botUuids[i];
                const botActive = activePlayers.some(p => p.uuid === botUuid);
                if (!botActive) continue;
                const possibleTargets = activeUuids.filter(u => u !== botUuid);
                if (possibleTargets.length === 0) continue;
                const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
                const res = await request(httpServer)
                    .post('/api/game/create')
                    .set('Cookie', botCookies[i])
                    .send({ vote_id: target });
                expect(res.status).toBe(200);
                await delay(100);
            }
        };

        let rounds = 0;
        const maxRounds = 10;
        while (!gameCompleted && rounds < maxRounds) {
            await voteRound();
            await delay(3000);
            rounds++;
        }

        expect(gameCompleted).toBe(true);
        expect(completeGameData).toHaveProperty('final_party');
        expect(completeGameData.final_party.length).toBe(2);
    }, 60000);
});