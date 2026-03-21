// сервер

const express = require('express');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const path = require('path');
const getLocalIP = require('get-local-ip');
const GameManager = require('./models/GameManager');
const DataStorage = require('./db/DataStorage');
const Player = require('./models/Player');

const gameMiddleware = require('./Middleware/gameMiddleware');// возможно ненадо
const { calculateGameParams, canStartGame } = require('./Function');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
     origin: 'http://localhost:5500', //добавила адрес фронтенда
     credentials: true
}));


app.use('/pages', express.static(path.join(__dirname, '../WEB/pages')));/////////////////////////

console.log(' __dirname:', __dirname);
console.log('Путь к WEB:', path.join(__dirname, '../WEB/pages'));



//const db = new DataStorage('./db/dream_team.db')
const db = new DataStorage(path.join(__dirname, 'db/dream_team.db'));////////////////////////
const activeManagers = new Map();

const gameState = Object.freeze({
    waiting: 'waiting',
    active: 'active',
    completed: 'completed'
})

function generateRoomId() {
    // в будущем добавить проверку на уникальность
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // 3 hex символов в верхнем регистре
}

// Вспомогательная функция для установки httpOnly cookie с данными игрока
/*
function setPlayerSessionCookie(res, playerId, roomId) {
    res.cookie('playerSession', JSON.stringify({ playerId, roomId }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // в разработке false
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 часа
    });
    console.log(`cookie отправлен румкод: ${roomId}, игрок айди ${playerId}`);
}
*/

function setPlayerSessionCookie(res, playerId, roomId) {
    res.cookie('playerSession', JSON.stringify({ playerId, roomId }), {
        httpOnly: true,
        secure: false,  // принудительно false для разработки
        //sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000
    });
    console.log(`cookie отправлен румкод: ${roomId}, игрок айди ${playerId}`);
}

// Middleware для аутентификации через cookie
function authenticatePlayer(req, res, next) {
    const cookieData = req.cookies.playerSession;
    if (!cookieData) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    let session;
    try {
        session = JSON.parse(cookieData);
    } catch (e) {
        return res.status(400).json({ error: 'Неверный формат cookie' });
    }

    const { playerId, roomId } = session;
    if (!playerId || !roomId) {
        return res.status(400).json({ error: 'Неполные данные cookie' });
    }

    const manager = activeManagers.get(roomId);
    if (!manager) {
        return res.status(404).json({ error: 'Комната не найдена' });
    }

    const player = manager.GameSession.players_list.find(p => p.uuid === playerId);
    if (!player) {
        return res.status(403).json({ error: 'Игрок не найден в комнате' });
    }

    req.player = player;
    req.manager = manager;
    req.roomId = roomId;
    next();
}

// // Тестовый эндпоинт, доступный только авторизованным игрокам
// app.post('/api/room/test', authenticatePlayer, (req, res) => {
//     res.json({
//         success: true,
//         message: 'Вы авторизованы в комнате',
//         player: {
//             id: req.player.id,
//             nickname: req.player.nickname,
//             isCreator: req.player.be_creator
//         },
//         roomId: req.roomId
//     });
// });

// Эндпоинт создания комнаты
const { validateGameStart } = require('./Function');
const { min_players } = require('./models/GameSession');
app.post('/api/room/create', async (req, res) => {
    try {
        const { randomEvents, maxPlayers, nickname } = req.body; //подправила на maxPlayers

        // Простейшие проверки
        if (maxPlayers < 4 || maxPlayers > 16) {
            return res.status(400).json({ error: 'Количество игроков должно быть от 4 до 16' });
        }

        // Генерация уникального кода комнаты
        const roomCode = generateRoomId().toString();

        // Создание менеджера с передачей DataStorage
        const manager = new GameManager(db);

        const newPlayer = new Player(Player.nextId_next(), true, nickname);

        const project = await db.getProject()

        // Создание игровой сессии (создатель будет создан автоматически)
        await manager.CreateGameSession(roomCode, newPlayer, randomEvents, maxPlayers, project)

        console.log(manager.GameSession.players_list);
        console.log(manager.GameSession.project);
        console.log('Создаётся комната с количеством игроков:', maxPlayers);//добавила


        // Получаем создателя, чтобы узнать его ID
        const creator = manager.GameSession.creater;
        console.log(`айдишник ${creator.uuid}`);

        // Устанавливаем статус комнаты
        manager.GameSession.game_state = gameState.waiting;

        // Сохраняем менеджера в активные
        activeManagers.set(roomCode, manager);

        // Устанавливаем httpOnly cookie с ID создателя и кодом комнаты
        setPlayerSessionCookie(res, creator.uuid, roomCode);

        // Отправляем клиенту код комнаты (и, возможно, никнейм создателя), и объект проекта({id: , name: ,description: })
        res.status(201).json({
            roomId: roomCode,
            nickname: creator.nickname,
            project: manager.GameSession.project,
            maxPlayers: maxPlayers
        });

    } catch (error) {
        console.error('Ошибка создания комнаты:', error);
        res.status(500).json({ error: 'Не удалось создать комнату' });
    }
})

// Эндпоинт присоединения к комнате
app.post('/api/room/join', (req, res) => {
    try {
        const { roomCode, nickname } = req.body; // ожидаем поле roomCode (можно и roomId)

        if (!roomCode) {
            return res.status(400).json({ error: 'Не указан код комнаты' });
        }

        // Ищем менеджера комнаты
        const manager = activeManagers.get(roomCode);
        if (!manager) {
            return res.status(404).json({ error: 'Комната не найдена' });
        }

        const session = manager.GameSession;

        // Проверка уникальности ника
        if (session.players_list.find(p => p.nickname === nickname)) {
            return res.status(400).json({ error: 'Игрок с этим ником уже есть в комнате, обновите страницу чтобы получить другой ник' });
        }

        // Проверка состояния игры
        if (session.game_state !== gameState.waiting) {
            return res.status(400).json({ error: 'Игра уже началась или завершена' });
        }

        // Проверка заполненности комнаты
        if (session.players_list.length >= session.players_count) {
            return res.status(400).json({ error: 'Комната заполнена' });
        }

        // Создаём нового игрока (не создатель)
        const newPlayer = new Player(Player.nextId_next(), false, nickname);

        // Добавляем игрока в сессию
        manager.AddPlayerToGameSession(newPlayer);

        // console.log("Список игроков")
        // session.players_list.forEach(element => {
        //     console.log(`id: ${element.uuid}, nick: ${element.nickname}`)
        // });

        // Устанавливаем cookie с ID нового игрока и кодом комнаты
        setPlayerSessionCookie(res, newPlayer.uuid, roomCode);

        // Отправляем подтверждение
        res.status(200).json({
            success: true,
            nickname: newPlayer.nickname,
            roomId: roomCode,
            maxPlayers: session.players_count //добавила
        });

    } catch (error) {
        console.error('Ошибка присоединения к комнате:', error);
        res.status(500).json({ error: 'Не удалось присоединиться к комнате' });
    }
});

// Эндпоинт выдачи списка игроков для лобби
app.get('/api/room/players', authenticatePlayer, (req, res) => {
    const manager = req.manager;

    res.json({
        players: manager.GameSession.players_list,
        maxPlayers: manager.GameSession.players_count  //добавила
    });
})

//тут эндпоинт can-start
//authenticatePlayer подрезал
app.post('/api/room/can-start', authenticatePlayer, (req, res) => {
    try {
        const { player, manager, roomId } = req;
        const session = manager.GameSession;
        
        // параметры из сессии соответственно
        const currentPlayers = session.players_list.length;
        const creatorId = session.creater?.uuid;
       // const targetPlayers = session.players_count; 

        
        const { canStart, reason } = canStartGame({
            playerId: player.uuid,
            creatorId: creatorId,
            currentPlayers: currentPlayers,
            minPlayers: session.players_count,
        })

        // параметры для валидации
       /* const validationParams = {
            playerId: player.uuid,
            creatorId: creatorId,
            currentPlayers: currentPlayers,
            targetPlayers: targetPlayers,
            minPlayers: 4,
            maxPlayers: 16
        };
        const result = validateGameStart(validationParams);     */  
        // информация для фронта
        res.status(200).json({
            success: true,          
            canStart: canStart,
            reason: reason,
            //ну и параметры если начать можн
            /*...(result.canStart && {
                rounds: result.rounds,
                targetTeamSize: result.targetTeamSize
            })*/
        });

    } catch (error) {
        console.error('Ошибка проверки can-start:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Не удалось проверить возможность старта',
            canStart: false 
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен:`);
    console.log(`- Локально: http://localhost:${PORT}`);
    console.log(`- В сети: http://${getLocalIP('192.168.0.1/24')}:${PORT}`);
});
// function getLocalIP() {
//     const nets = require('os').networkInterfaces();
//     for (const name of Object.keys(nets)) {
//         for (const net of nets[name]) {
//             if (net.family === 'IPv4' && !net.internal) {
//                 return net.address;
//             }
//         }
//     }
//     return '127.0.0.1';
// }
