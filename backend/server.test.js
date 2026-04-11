const request = require('supertest');
const ioClient = require('socket.io-client');
const { app, server, activeManagers } = require('./server');
const DataStorage = require('./db/DataStorage');

// Мокаем модули, чтобы не зависеть от реальной БД и генерации
jest.mock('./db/DataStorage');
jest.mock('./serverFunctions', () => ({
    ...jest.requireActual('./serverFunctions'),
    generateRoomId: jest.fn(() => 'TEST12'),
    setPlayerSessionCookie: jest.fn((res, playerId, roomId) => {
        res.cookie('playerSession', JSON.stringify({ playerId, roomId }), { httpOnly: true });
    }),
}));

// Импортируем замоканные функции
const { generateRoomId, setPlayerSessionCookie } = require('./serverFunctions');

// Подготавливаем мок для DataStorage
const mockGetProject = jest.fn().mockResolvedValue({ id: 1, name: 'Test Project' });
const mockGetPlayerCards = jest.fn().mockResolvedValue([
    { id: 1, cardType: 1, name: 'Project Manager' },
    { id: 2, cardType: 2, name: '3 years' },
    { id: 3, cardType: 3, name: 'Diligent' },
    { id: 4, cardType: 4, name: 'Communication' },
    { id: 5, cardType: 5, name: 'Project Manager: work hard' },
    { id: 6, cardType: 6, name: 'JavaScript' },
    { id: 7, cardType: 1, name: 'Team Lead' },
    { id: 8, cardType: 5, name: 'Общая: lazy' },
    { id: 9, cardType: 2, name: '5 years' },
    { id: 10, cardType: 3, name: 'Creative' },
    { id: 11, cardType: 4, name: 'Leadership' },
    { id: 12, cardType: 6, name: 'Python' },
]);

DataStorage.mockImplementation(() => ({
    getProject: mockGetProject,
    getPlayerCards: mockGetPlayerCards,
}));

// Вспомогательная функция для ожидания WebSocket-события
const waitForEvent = (socket, event, timeout = 2000) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Event ${event} not received`)), timeout);
        socket.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
};

describe('DreamTeam Server Integration Tests', () => {
    // Очищаем активные менеджеры перед каждым тестом
    beforeEach(() => {
        activeManagers.clear();
    });

    afterAll((done) => {
        server.close(done);
    });

    // --------------------------------------------------------------
    // HTTP Эндпоинты
    // --------------------------------------------------------------
    describe('HTTP Endpoints', () => {
        let agent;
        let roomCode;
        let player1Id, player2Id;
        let cookie1, cookie2;

        test('POST /api/room/create – создание комнаты', async () => {
            const res = await request(app)
                .post('/api/room/create')
                .send({ nickname: 'Creator', maxPlayers: 4, randomEvents: false });
            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('roomId', 'TEST12');
            expect(res.body).toHaveProperty('nickname', 'Creator');
            expect(res.body).toHaveProperty('playerId');
            roomCode = res.body.roomId;
            player1Id = res.body.playerId;
            cookie1 = res.headers['set-cookie'];
        });

        test('POST /api/room/join – присоединение второго игрока', async () => {
            const res = await request(app)
                .post('/api/room/join')
                .send({ roomCode, nickname: 'Joiner' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.nickname).toBe('Joiner');
            expect(res.body).toHaveProperty('playerId');
            player2Id = res.body.playerId;
            cookie2 = res.headers['set-cookie'];
        });

        test('GET /api/room/players – получение списка игроков', async () => {
            const res = await request(app)
                .get(`/api/room/players?code=${roomCode}`)
                .set('Cookie', cookie1);
            expect(res.status).toBe(200);
            expect(res.body.players).toHaveLength(2);
            expect(res.body.maxPlayers).toBe(4);
        });

        test('POST /api/room/can-start – проверка старта (не хватает игроков)', async () => {
            const res = await request(app)
                .post('/api/room/can-start')
                .set('Cookie', cookie1)
                .send({ roomCode });
            expect(res.status).toBe(200);
            expect(res.body.canStart).toBe(false);
            expect(res.body.reason).toMatch(/недостаточно/i);
        });

        test('POST /api/game/start – старт игры (только создатель)', async () => {
            const res = await request(app)
                .post('/api/game/start')
                .set('Cookie', cookie1);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test('GET /api/game/my-cards – получение карт', async () => {
            const res = await request(app)
                .get('/api/game/my-cards')
                .set('Cookie', cookie1);
            expect(res.status).toBe(200);
            expect(res.body.hand).toHaveLength(6);
            expect(res.body.hand[0].cardType).toBe(1);
            expect(res.body.hand[1].cardType).toBe(2);
        });

        test('GET /api/game/moved_player – определение текущего ходящего', async () => {
            const res = await request(app)
                .get('/api/game/moved_player')
                .set('Cookie', cookie1);
            expect(res.status).toBe(200);
            expect(res.body).toBeDefined();
        });

        test('POST /api/game/reveal-card – вскрытие карты', async () => {
            const res = await request(app)
                .post('/api/game/reveal-card')
                .set('Cookie', cookie1)
                .send({ cat_card: 1 });
            expect(res.status).toBe(200);
        });

        test('POST /api/game/create – голосование за другого игрока', async () => {
            const res = await request(app)
                .post('/api/game/create')
                .set('Cookie', cookie1)
                .send({ vote_id: player2Id });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test('POST /api/game/create – повторное голосование (ошибка)', async () => {
            const res = await request(app)
                .post('/api/game/create')
                .set('Cookie', cookie1)
                .send({ vote_id: player2Id });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/уже проголосовали/);
        });

        test('POST /api/game/create – голосование за себя (ошибка)', async () => {
            // Создаём отдельную комнату, чтобы сбросить состояние isVoted
            const createRes = await request(app)
                .post('/api/room/create')
                .send({ nickname: 'Self', maxPlayers: 4, randomEvents: false });
            const selfCookie = createRes.headers['set-cookie'];
            const selfId = createRes.body.playerId;
            const voteRes = await request(app)
                .post('/api/game/create')
                .set('Cookie', selfCookie)
                .send({ vote_id: selfId });
            expect(voteRes.status).toBe(400);
            expect(voteRes.body.error).toMatch(/Нельзя голосовать за самого себя/);
        });

        test('POST /api/game/create – пропуск голоса (skip)', async () => {
            const createRes = await request(app)
                .post('/api/room/create')
                .send({ nickname: 'Skip', maxPlayers: 4, randomEvents: false });
            const skipCookie = createRes.headers['set-cookie'];
            const voteRes = await request(app)
                .post('/api/game/create')
                .set('Cookie', skipCookie)
                .send({ vote_id: 'skip' });
            expect(voteRes.status).toBe(200);
            expect(voteRes.body.success).toBe(true);
        });
    });

    // --------------------------------------------------------------
    // WebSocket (socket.io) тесты
    // --------------------------------------------------------------
    describe('WebSocket Events', () => {
        let socket1, socket2;
        let roomCodeWs, player1Uuid, player2Uuid;
        let cookie1, cookie2;

        beforeAll(async () => {
            // Создаём комнату и двух игроков через HTTP
            const createRes = await request(app)
                .post('/api/room/create')
                .send({ nickname: 'WS1', maxPlayers: 4, randomEvents: false });
            roomCodeWs = createRes.body.roomId;
            player1Uuid = createRes.body.playerId;
            cookie1 = createRes.headers['set-cookie'];

            const joinRes = await request(app)
                .post('/api/room/join')
                .send({ roomCode: roomCodeWs, nickname: 'WS2' });
            player2Uuid = joinRes.body.playerId;
            cookie2 = joinRes.headers['set-cookie'];
        });

        afterEach(() => {
            if (socket1 && socket1.connected) socket1.disconnect();
            if (socket2 && socket2.connected) socket2.disconnect();
        });

        test('Клиенты подключаются и регистрируются в комнате', (done) => {
            socket1 = ioClient(`http://localhost:${server.address().port}`, { transports: ['websocket'] });
            socket2 = ioClient(`http://localhost:${server.address().port}`, { transports: ['websocket'] });

            let connected = 0;
            const onConnect = () => {
                connected++;
                if (connected === 2) {
                    socket1.emit('register', { playerUuid: player1Uuid, roomCode: roomCodeWs });
                    socket2.emit('register', { playerUuid: player2Uuid, roomCode: roomCodeWs });
                    setTimeout(() => {
                        expect(socket1.connected).toBe(true);
                        expect(socket2.connected).toBe(true);
                        done();
                    }, 500);
                }
            };
            socket1.on('connect', onConnect);
            socket2.on('connect', onConnect);
        });

        test('Событие game-start приходит всем игрокам в комнате', async () => {
            socket1 = ioClient(`http://localhost:${server.address().port}`, { transports: ['websocket'] });
            socket2 = ioClient(`http://localhost:${server.address().port}`, { transports: ['websocket'] });
            await Promise.all([
                new Promise(resolve => socket1.on('connect', resolve)),
                new Promise(resolve => socket2.on('connect', resolve)),
            ]);
            socket1.emit('register', { playerUuid: player1Uuid, roomCode: roomCodeWs });
            socket2.emit('register', { playerUuid: player2Uuid, roomCode: roomCodeWs });
            await new Promise(r => setTimeout(r, 200)); // даём время зарегистрироваться

            const promise1 = waitForEvent(socket1, 'game-start');
            const promise2 = waitForEvent(socket2, 'game-start');

            const startRes = await request(app)
                .post('/api/game/start')
                .set('Cookie', cookie1);
            expect(startRes.status).toBe(200);

            const data1 = await promise1;
            const data2 = await promise2;
            expect(data1.message).toBe('Игра началась! Переход на страницу профиля.');
            expect(data2.message).toBeDefined();
        });

        test('Событие reveal-card приходит всем в комнате', async () => {
            // Сначала получим карты для первого игрока
            await request(app)
                .get('/api/game/my-cards')
                .set('Cookie', cookie1);
            const promise1 = waitForEvent(socket1, 'reveal-card');
            const promise2 = waitForEvent(socket2, 'reveal-card');

            const revealRes = await request(app)
                .post('/api/game/reveal-card')
                .set('Cookie', cookie1)
                .send({ cat_card: 1 });
            expect(revealRes.status).toBe(200);

            const data1 = await promise1;
            const data2 = await promise2;
            expect(data1.player.uuid).toBe(player1Uuid);
            expect(data2.player.uuid).toBe(player1Uuid);
            expect(data1.openCard).toBeDefined();
        });

        test('Событие player-voted приходит всем в комнате', async () => {
            // Создаём новую чистую комнату для голосования
            const createRes = await request(app)
                .post('/api/room/create')
                .send({ nickname: 'VoteA', maxPlayers: 4, randomEvents: false });
            const roomCode = createRes.body.roomId;
            const playerA = createRes.body.playerId;
            const cookieA = createRes.headers['set-cookie'];
            const joinRes = await request(app)
                .post('/api/room/join')
                .send({ roomCode, nickname: 'VoteB' });
            const playerB = joinRes.body.playerId;
            const cookieB = joinRes.headers['set-cookie'];

            const sA = ioClient(`http://localhost:${server.address().port}`, { transports: ['websocket'] });
            const sB = ioClient(`http://localhost:${server.address().port}`, { transports: ['websocket'] });
            await Promise.all([
                new Promise(resolve => sA.on('connect', resolve)),
                new Promise(resolve => sB.on('connect', resolve)),
            ]);
            sA.emit('register', { playerUuid: playerA, roomCode });
            sB.emit('register', { playerUuid: playerB, roomCode });
            await new Promise(r => setTimeout(r, 200));

            const promiseA = waitForEvent(sA, 'player-voted');
            const promiseB = waitForEvent(sB, 'player-voted');

            const voteRes = await request(app)
                .post('/api/game/create')
                .set('Cookie', cookieA)
                .send({ vote_id: playerB });
            expect(voteRes.status).toBe(200);

            const dataA = await promiseA;
            const dataB = await promiseB;
            expect(dataA.voter.uuid).toBe(playerA);
            expect(dataA.target.uuid).toBe(playerB);
            expect(dataB.voter.uuid).toBe(playerA);
            sA.disconnect();
            sB.disconnect();
        });
    });
});