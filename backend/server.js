// сервер

const express = require('express');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const path = require('path');

const GameManager = require('./models/GameManager');
const DataStorage = require('./db/DataStorage');
const Player = require('./models/Player');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
// app.use(cors({
//     origin: 'http://localhost:8080',
//     credentials: true
// }));
app.use(express.json());
app.use(cookieParser());


const db = new DataStorage('./db/dream_team.db')
const activeManagers = new Map();

const gameState = Object.freeze({
    waiting: 'waiting',
    active: 'active',
    completed: 'completed'
})

function generateRoomId() {
    // в будущем добавить проверку на уникальность
    return crypto.randomBytes(10).toString('hex'); // 20 hex символов
}

// Вспомогательная функция для установки httpOnly cookie с данными игрока
function setPlayerSessionCookie(res, playerId, roomId) {
    res.cookie('playerSession', JSON.stringify({ playerId, roomId }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // в разработке false
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 часа
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
app.post('/api/room/create', (req, res) => {
    try {
        const { randomEvents, playersCount, nickname } = req.body;

        // Простейшие проверки
        if (playersCount < 4 || playersCount > 16) {
            return res.status(400).json({ error: 'Количество игроков должно быть от 4 до 16' });
        }

        // Генерация уникального кода комнаты
        const roomCode = generateRoomId().toString();

        // Создание менеджера с передачей DataStorage
        const manager = new GameManager(db);

        const newPlayer = new Player(Player.nextId_next(), true, nickname);

        // Создание игровой сессии (создатель будет создан автоматически)
        manager.CreateGameSession(roomCode, newPlayer, randomEvents, playersCount);

        console.log(manager.GameSession.players_list);

        // Получаем создателя, чтобы узнать его ID
        const creator = manager.GameSession.creater;
        console.log(`айдишник ${creator.uuid}`);

        // Устанавливаем статус комнаты
        manager.GameSession.game_state = gameState.waiting;

        // Сохраняем менеджера в активные
        activeManagers.set(roomCode, manager);

        // Устанавливаем httpOnly cookie с ID создателя и кодом комнаты
        setPlayerSessionCookie(res, creator.uuid, roomCode);

        // Отправляем клиенту код комнаты (и, возможно, никнейм создателя)
        res.status(201).json({
            roomId: roomCode,
            nickname: creator.nickname
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
            roomId: roomCode
        });

    } catch (error) {
        console.error('Ошибка присоединения к комнате:', error);
        res.status(500).json({ error: 'Не удалось присоединиться к комнате' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен:`);
    console.log(`- Локально: http://localhost:${PORT}`);
    console.log(`- В сети: http://${getLocalIP()}:${PORT}`);
});

function getLocalIP() {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}