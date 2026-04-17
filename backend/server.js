// сервер
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const socketIo = require('socket.io');

const getLocalIP = require('get-local-ip');
const GameManager = require('./models/GameManager');
const DataStorage = require('./db/DataStorage');
const Player = require('./models/Player');
const Card = require('./models/Card');
const Report = require('./models/Report');

const {
    calculateGameParams,
    canStartGame,
    generateRoomId,
    setPlayerSessionCookie,
    selectPlayerMove,
    generateRandomEvent,
} = require('./serverFunctions');
const player = require("./models/Player");

const test = false // если true, то тестовый режим, если false, то обычный режим
const app = express();
const PORT = 3000;

// app.use(cors({
//     origin: 'http://localhost:5500', //добавила адрес фронтенда
//     credentials: true
// }));
app.use(express.json());
app.use(cookieParser());

if (test) {
    // Раздача тестовых файла html из папки public
    app.use(express.static(path.join(__dirname, 'public', 'test-socket.html')));
    // эндпоинт для отображения тестовой страницы в корневой ссылке
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'test-socket.html'));
    });
}
else {
    // Раздача статики из папки WEB
    app.use(express.static(path.join(__dirname, '..', 'WEB')));
    // эндпоинт для отображения стартовой страницы в корневой ссылке
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'WEB', 'pages', 'main-page.html'));
    });
}

//const db = new DataStorage('./db/dream_team.db')
const db = new DataStorage(path.join(__dirname, 'db/dream_team_new.db'));
const activeManagers = new Map();

const gameState = Object.freeze({
    waiting: 'waiting',
    active: 'active',
    completed: 'completed'
})

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

// Эндпоинт создания комнаты
app.post('/api/room/create', async (req, res) => {
    try {
        const { randomEvents, maxPlayers, nickname } = req.body;

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

        const {rounds, targetTeamSize} = calculateGameParams(maxPlayers)

        console.log('target teamSize', targetTeamSize);

        // Создание игровой сессии
        await manager.CreateGameSession(roomCode, newPlayer, randomEvents, maxPlayers, targetTeamSize, rounds, project)

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
            maxPlayers: maxPlayers,
            playerId: creator.uuid,
        });

    } catch (error) {
        console.error('Ошибка создания комнаты:', error);
        res.status(500).json({ error: 'Не удалось создать комнату' });
    }
})

// Эндпоинт присоединения к комнате
app.post('/api/room/join', (req, res) => {
    try {
        const { roomCode, nickname } = req.body; // ожидаем поле roomCode

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

        // Создаём нового игрока
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
            maxPlayers: session.players_count, //добавила
            playerId: newPlayer.uuid,
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
        const { player, manager } = req;
        const session = manager.GameSession;
        
        // параметры из сессии соответственно
        const currentPlayers = session.players_list.length;
        const creatorId = session.creater?.uuid;
        
        const { canStart, reason } = canStartGame({
            playerId: player.uuid,
            creatorId: creatorId,
            currentPlayers: currentPlayers,
            minPlayers: session.players_count,
        })

        // информация для фронта
        res.status(200).json({
            success: true,          
            canStart: canStart,
            reason: reason,
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

// Эндпоинт выдающий игроку список его карт
app.get('/api/game/my-cards', authenticatePlayer, async (req, res) => {
    const manager = req.manager;
    const player = req.player;
    const session = manager.GameSession;

    // Если карты уже есть – возвращаем их
    if (player.hand && player.hand.length > 0) {
        return res.json({ hand: player.hand });
    }

    try {
        // Получаем все карты из базы данных
        const allCards = await db.getPlayerCards(); // массив объектов Card
        if (!allCards || allCards.length === 0) {
            res.status(500).json({ error: 'Нет карт в базе данных' });
        }

        // Группируем по cardType (1–6)
        const cardsByType = {};
        for (let i = 1; i <= 6; i++) cardsByType[i] = [];
        allCards.forEach(card => {
            if (cardsByType[card.cardType]) {
                cardsByType[card.cardType].push(card);
            }
        });

        // Для типа 5 (особенностей) ведём учёт использованных
        if (!session.usedFeatureIds) session.usedFeatureIds = new Set();

        // Функция получения доступных карт (с учётом used только для типа 5)
        const getAvailable = (type) => {
            let available = cardsByType[type];
            if (type === 5) {
                available = available.filter(c => !session.usedFeatureIds.has(c.id));
            }
            return available;
        };

        // Шаг 1: выбираем роль (тип 1)
        const availableRoles = getAvailable(1);
        if (availableRoles.length === 0) {
            return res.status(500).json({ error: 'Нет доступных ролей' });
        }
        const randomRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
        const roleName = randomRole.name;

        // Шаг 2: выбираем особенность (тип 5), совместимую с ролью
        const availableFeatures = getAvailable(5).filter(feature => {
            const colonIndex = feature.name.indexOf(':');
            if (colonIndex === -1) return false;
            const prefix = feature.name.substring(0, colonIndex).trim();
            return prefix === 'Общая' || prefix === roleName;
        });
        if (availableFeatures.length === 0) {
            return res.status(500).json({ error: 'Нет подходящей особенности для выбранной роли' });
        }
        const randomFeature = availableFeatures[Math.floor(Math.random() * availableFeatures.length)];

        // Обрезаем текст особенности (оставляем описание после двоеточия)
        const colonIdx = randomFeature.name.indexOf(':');
        const featureDesc = colonIdx !== -1 ? randomFeature.name.substring(colonIdx + 1).trim() : randomFeature.name;
        const featureCard = new Card(randomFeature.id, randomFeature.cardType, featureDesc);

        // Помечаем особенность как использованную (только для типа 5)
        session.usedFeatureIds.add(randomFeature.id);

        // Шаг 3: выбираем остальные типы (2,3,4,6) – без учёта уникальности
        const otherTypes = [2, 3, 4, 6];
        const selectedOthers = [];
        for (const type of otherTypes) {
            const available = getAvailable(type);
            if (available.length === 0) {
                return res.status(500).json({ error: `Недостаточно карт типа ${type}` });
            }
            const randomCard = available[Math.floor(Math.random() * available.length)];
            selectedOthers.push(randomCard);
        }

        // Собираем все карты
        const selectedCards = [randomRole, ...selectedOthers, featureCard];

        // Сортируем по типу (1,2,3,4,5,6) для удобства
        selectedCards.sort((a, b) => a.cardType - b.cardType);

        // Сохраняем в профиль игрока
        player.hand = selectedCards;

        // Обновляем игрока в сессии
        const playerIndex = session.players_list.findIndex(p => p.uuid === player.uuid);
        if (playerIndex !== -1) {
            session.players_list[playerIndex] = player;
        } else {
            session.players_list.push(player);
        }

        res.json({ hand: selectedCards });
    } catch (error) {
        console.error('Ошибка при выдаче карт:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Энпоинт выдающий вскрывающегося игрока
app.get('/api/game/moved_player', authenticatePlayer, async (req, res) => {
    const manager = req.manager;
    const session = manager.GameSession;
    try {
        const movePlayer = selectPlayerMove(session)
        res.json(movePlayer);
    } catch (error) {
        console.error('Ошибка при получении ходящего игрока:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
})

// изпользование websocket с помощью socket io
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*', // для теста разрешаем все источники
        credentials: true
    }
});

// Хранилище соответствия socket.id -> { playerUuid, roomCode }
const socketMap = new Map();

const playerSocketMap = new Map();

// создавние соединения с игроком с привязкой к коду комнаты
io.on('connection', (socket) => {
    console.log(`New socket connected: ${socket.id}`);

    // Клиент должен отправить событие 'register' с данными игрока
    socket.on('register', (data) => {
        const { playerUuid, roomCode } = data;
        if (!playerUuid || !roomCode) {
            console.error('Ошибка регистрации: не хватает данных');
            return;
        }
        socketMap.set(socket.id, { playerUuid, roomCode });
        playerSocketMap.set(playerUuid, socket);
        socket.join(roomCode);
        console.log(`Socket ${socket.id} registered to room ${roomCode} (player ${playerUuid})`);
    });

    // Обработка события открытия всех карт когда после завершения игры создатель нажимает соответствующую кнопку
    socket.on('open-cards', (data) => {
        const room = socketMap.get(socket.id).roomCode;
        const manager = activeManagers.get(room);
        const session = manager.GameSession;
        // проверяем, что игра завершена
        if (session.game_state !== 'completed') {
            console.log('open-cards: игра ещё не завершена');
            return;
        }

        // проверяем, что отправитель – создатель
        const creator = session.creater;
        const senderInfo = socketMap.get(socket.id);
        if (senderInfo.playerUuid !== creator.uuid) {
            console.log('open-cards: только создатель может вскрыть все карты');
            return;
        }

        // Получаем активных игроков
        const activePlayers = session.players_list.filter(p => p.active);

        // Для каждого активного игрока вскрываем все его карты
        for (const player of activePlayers) {
            if (!player.hand) continue;
            for (const card of player.hand) {
                // Если карта ещё не вскрыта
                if (!player.openCards.some(oc => oc.id === card.id)) {
                    card.open();                     // меняем внутреннее состояние
                    player.openCards.push(card);    // добавляем в список вскрытых
                }
            }
        }

        // Отправляем событие всем в комнате, чтобы клиенты обновили интерфейс
        io.to(room).emit('cards-opened', {
            players: activePlayers.map(p => ({
                uuid: p.uuid,
                nickname: p.nickname,
                openCards: p.openCards
            }))
        });
    });

    // Отправка вопросов для ручного ответа создателю
    socket.on('give-answers', async () => {
        try {
            // Загружаем все вопросы из БД
            const allQuestions = await db.getQuestions();
            // Берём первые 5 (id 1-5) для ручного ответа
            const manualQuestions = allQuestions.filter(q => q.id >= 1 && q.id <= 5);

            // Варианты ответов (ситуации) для каждого вопроса (по данным из Excel)
            const manualOptions = {
                1: [
                    { text: "У всех разработчиков релевантные языки", score: 18, comment: "Пишем на том, что надо. Быстро, красиво, без костылей. Заказчик плачет от счастья" },
                    { text: "У 1 разработчика нерелевантный язык", score: 3, comment: "Один герой осваивает новый стек на ходу. Код работает, но смотреть на него страшно" },
                    { text: "У 2+ разработчиков нерелевантные языки", score: 0, comment: "Мы мобильное приложение пишем на C++ и JS. Жесть" }
                ],
                2: [
                    { text: "Есть аналитик", score: 3, comment: "Аналитик положил бубен на стол. Команда смотрит на бубен. Заказчик смотрит на бубен. Бубен смотрит на всех. Тишина. Работа кипит. Магия" },
                    { text: "Есть тестировщик", score: 3, comment: "Пользователи больше не находят баги на проде первыми" },
                    { text: "Есть проектировщик", score: 3, comment: "Нарисовал схему на 15 страницах. Разработчики плачут (от счастья, конечно же)" },
                    { text: "Есть тех. Писатель", score: 3, comment: "Документация написана так, что её читают. Даже разработчики" },
                    { text: "Есть PM", score: 3, comment: "Дедлайны перестали быть мемами. Кто что делает — понятно" },
                    { text: "Есть разработчик", score: 5, comment: "Код пишется, фичи работают, магия случается" }
                ],
                3: [
                    { text: "Нет странных особенностей", score: 6, comment: "Все адекватные люди. Работа идёт спокойно" },
                    { text: "1 странная особенность", score: 2, comment: "В команде есть один «интересный» товарищ. Все уже привыкли, но иногда закрывают его в шкафу" },
                    { text: "2+ людей со странными особенностями", score: -1, comment: "Цирк, а не команда. Чудеса, что проект вообще идёт" }
                ],
                4: [
                    { text: "Нет неподходящих ролей", score: 12, comment: "Все при деле, никто не мешает разработке" },
                    { text: "1 неподходящая роль", score: 6, comment: "«Я просто хочу помочь!» — говорит он. Все хотят, чтобы он не хотел" },
                    { text: "2+ неподходящие роли", score: -12, comment: "В команде засела группа поддержки из другого отдела" }
                ],
                5: [
                    { text: "Лидерство у PM", score: 6, comment: "Идеально. Менеджер ставит цели и ведет команду за собой" },
                    { text: "Лидерство у разработчика", score: 5, comment: "Задачи ставятся криво, но код пишут хорошо" },
                    { text: "Лидерство у кого-то еще", score: 3, comment: "Странно, но работает. Берёт на себя управление, хотя формально не должен" },
                    { text: "Нет Лидера", score: -2, comment: "У нас «самоорганизация»" },
                    { text: "2+ Лидеров", score: -5, comment: "Митинги длятся дольше, чем разработка. У каждого своя правда" }
                ]
            };

            // Формируем ответ для клиента
            const questionsWithOptions = manualQuestions.map(q => ({
                id: q.id,
                text: q.text,
                options: manualOptions[q.id] || []
            }));

            socket.emit('manual-questions', { questions: questionsWithOptions });
        } catch (error) {
            console.error('Ошибка при отправке ручных вопросов:', error);
            socket.emit('error', { message: 'Ошибка сервера' });
        }
    });

    socket.on('disconnect', () => {
        const info = socketMap.get(socket.id);
        if (info) {
            console.log(`Socket ${socket.id} disconnected from room ${info.roomCode}`);
            socketMap.delete(socket.id);
        }
        for (let [uuid, s] of playerSocketMap.entries()) {
            if (s === socket) playerSocketMap.delete(uuid);
        }
    });
});

// Эндпоинт для старта игры
app.post('/api/game/start', authenticatePlayer, async (req, res) => {
    const manager = req.manager;
    const session = manager.GameSession;

    // Проверяем, что игра ещё не началась
    if (session.game_state !== gameState.waiting) {
        console.log('Состояние игры:', session.game_state);
        console.log('Код комнаты:', session.roomCode);
        return res.status(400). json({ error: 'Игра уже началась или завершена' });
    }

    // Меняем состояние игры
    session.game_state = gameState.active;
    session.current_round = 1;

    // Отправляем событие всем в комнате
    io.to(session.roomCode).emit('game-start', {
        message: 'Игра началась! Переход на страницу профиля.'
    });

    res.json({ success: true });
});

// Эндпоинт вскрытия карты, в body получает код карты для вскрытия(cat_card)
app.post('/api/game/reveal-card', authenticatePlayer, async (req, res) => {
    const player = req.player;
    const roomCode = req.roomId;
    let {cat_card} = req.body;

    cat_card -= 1; // приведение к удобному индексу для обращения к массиву

    if (player.isVoted) {
        return res.status(400).json({error: 'Ошибка, нельзя вскрыть карту в этом раунде после голосования'})
    }

    try {
        const openCard = player.hand[cat_card]
        if (!openCard) {
            return res.status(400).json({error: 'Карта не найдена'})
        }
        openCard.open()
        player.openCards.push(openCard);

        io.to(roomCode).emit('reveal-card', {
            player: player,
            openCard: openCard,
        });
        res.sendStatus(200);
    } catch (error) {
        console.error("Ошибка при вскрытии карты", error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
})

// Эндпоинт обрабатывающий голосование игроков, и включающий основную работу логики программы
app.post('/api/game/create', authenticatePlayer, async (req, res) => {
    try {
        const player = req.player;
        const roomCode = req.roomId;
        const { vote_id } = req.body;

        if (player.isVoted) {
            return res.status(400).json({ error: 'Вы уже проголосовали в этом раунде' });
        }

        const manager = req.manager;
        const session = manager.GameSession;
        let targetPlayer = null;

        // Обработка пропуска голоса
        if (vote_id !== 'skip') {
            // Ищем целевого игрока
            targetPlayer = session.players_list.find(p => p.uuid == vote_id);

            if (!targetPlayer || !targetPlayer.active) {
                return res.status(404).json({ error: 'Игрок, за которого вы пытаетесь голосовать, не найден или исключён' });
            }
            // Проверка, чтобы игрок не голосовал за себя
            if (targetPlayer.uuid === player.uuid) {
                return res.status(400).json({ error: 'Нельзя голосовать за самого себя' });
            }
            player.votedOnPlayer = targetPlayer;
        }

        player.isVoted = true;

        // Отправляем событие всем в комнате через WebSocket
        io.to(roomCode).emit('player-voted', {
            voter: {
                uuid: player.uuid,
                nickname: player.nickname
            },
            target: targetPlayer ? {
                uuid: targetPlayer.uuid,
                nickname: targetPlayer.nickname
            } : null
        });

        // Проверяем, все ли активные игроки проголосовали
        const activePlayers = session.players_list.filter(p => p.active);
        const allVoted = activePlayers.length > 0 && activePlayers.every(p => p.isVoted === true);
        if (allVoted) {
            // получение исключаемого игрока Player и фиксация завершения раунда, если никого не исключили то null
            const excludedPlayer = manager.CompleteRound();

            // Завершение игры
            // Если достигнуто нужное количество игроков, через вебсокет выдаёт итоговый список игроков которые остались, ещё выдаёт исключённого игрока
            if (session.players_count === session.players_final_count) {
                console.log('game complete');
                session.game_state = gameState.completed;
                io.to(roomCode).emit('complete-game', {
                    final_party: session.players_list.filter(p => p.active),
                    excludedPlayer: excludedPlayer,
                })

                if (player.be_creator) {
                    const targetSocket = playerSocketMap.get(player.uuid);
                    if (targetSocket) {
                        targetSocket.emit('allow-creator-buttons');
                    }
                }

                // Сохранение в бд после завершения игры
                try {
                    const result = await db.saveGameState(session);
                    console.log('Игра успешно сохранена! ID сессии в базе:', result.sessionId);
                } catch (error) {
                    console.error('Не удалось сохранить игру:', error);
                }
                return res.status(200).json({success: true})
            }

            // Завершение раунда
            console.log('round complete');
            io.to(roomCode).emit('complete-round', {
                player: excludedPlayer,
                current_round: session.current_round,
                rounds_count: session.rounds_count,
            })

            // Проверяем, нужно ли отправить случайное событие (ровно на половине раундов)
            const halfRounds = Math.floor(session.rounds_count / 2);
            if (session.current_round === halfRounds && !session.randomEvents) {
                const randomEvent = generateRandomEvent();
                io.to(roomCode).emit('random-event', randomEvent);
                console.log('Случайное событие отправлено:', randomEvent);
            }

            // Сохранение в бд после завершения раунда
            try {
                const result = await db.saveGameState(session);
                console.log('Игра успешно сохранена! ID сессии в базе:', result.sessionId);
            } catch (error) {
                console.error('Не удалось сохранить игру:', error);
            }

            return res.status(200).json({ success: true });
        }

        res.status(200).json({ success: true, message: 'Ваш голос учтён' });
    } catch (error) {
        console.error('Ошибка при обработке голосования:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Эндпоинт сохранения ответов на вопросы в бд и фиксации их в сессии
app.post('/api/game/final-answers', authenticatePlayer, async (req, res) => {
    try {
        const session = req.manager.GameSession;
        const roomCode = session.roomCode;
        const { answers: manualAnswers } = req.body; // массив [{ questionId, answerText, score, comment }]

        if (!req.player.be_creator) {
            return res.status(403).json({ error: 'Только создатель может отправлять ответы' });
        }

        const activePlayers = session.players_list.filter(p => p.active);
        const questions = await db.getQuestions();
        const reportHelper = new Report(activePlayers, questions);

        // Генерируем автоматические ответы (Map<id, { answerText, score, comment }>)
        const autoAnswersMap = reportHelper.generateAutoAnswers();

        // Преобразуем ручные ответы в Map
        const manualMap = new Map();
        if (Array.isArray(manualAnswers)) {
            for (const ans of manualAnswers) {
                manualMap.set(ans.questionId, {
                    answerText: ans.answerText,
                    score: ans.score,
                    comment: ans.comment,
                });
            }
        }

        // Объединяем: сначала автоматические, потом перезаписываем ручными
        const combinedAnswersMap = new Map();
        for (const [qId, data] of autoAnswersMap.entries()) {
            combinedAnswersMap.set(qId, { ...data});
        }
        for (const [qId, data] of manualMap.entries()) {
            combinedAnswersMap.set(qId, { ...data});
        }

        reportHelper.answers = combinedAnswersMap;
        session.report = reportHelper;

        // Сохраняем в БД только текст ответа
        const sessionRow = await db.getSessionIdByRoomCode(roomCode);
        if (!sessionRow) {
            return res.status(404).json({ error: 'Сессия не найдена в базе данных' });
        }

        const allAnswersForDB = Array.from(combinedAnswersMap.entries()).map(([qId, data]) => ({
            questionId: qId,
            answerText: data.answerText
        }));

        await db.saveAnswers(sessionRow.id, allAnswersForDB);

        io.to(roomCode).emit('activate-result-button')

        res.json({ success: true, message: 'Ответы сохранены' });
    } catch (error) {
        console.error('Ошибка при сохранении ответов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Эндпоинт передающий итоговый отчёт
app.post('/api/game/final-report', authenticatePlayer, async (req, res) => {
    try {
        const session = req.manager.GameSession;
        const report = session.report;

        if (!report) {
            return res.status(404).json({ error: 'Отчёт не найден. Сначала сохраните ответы.' });
        }

        report.calculateScore();

        // Преобразуем мапу answers в удобный для отправки формат (массив объектов)
        const answersArray = Array.from(report.answers.entries()).map(([questionId, data]) => ({
            questionId,
            answerText: data.answerText,
            score: data.score,
            comment: data.comment,
            isAuto: data.isAuto
        }));

        res.json({
            totalScore: report.totalScore,
            verdict: report.verdict,
            answers: answersArray
        });
    } catch (error) {
        console.error('Ошибка при формировании итогового отчёта:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Эндпоинт для восстановления состояния игры
app.get('/api/game/state', async (req, res) => {
    try {
        // 1. Извлекаем данные из куки
        const cookieData = req.cookies.playerSession;
        if (!cookieData) {
            return res.status(401).json({ error: 'Не авторизован' });
        }

        let sessionInfo;
        try {
            sessionInfo = JSON.parse(cookieData);
        } catch (e) {
            return res.status(400).json({ error: 'Неверный формат cookie' });
        }

        const { playerId, roomId } = sessionInfo;
        if (!playerId || !roomId) {
            return res.status(400). json({ error: 'Неполные данные в cookie' });
        }

        // 2. Ищем менеджер в активных или загружаем из БД
        let manager = activeManagers.get(roomId);
        if (!manager) {
            try {
                manager = await db.loadGameState(roomId);
                if (manager) {
                    activeManagers.set(roomId, manager);
                    console.log(`Комната ${roomId} загружена из БД (api/game/state)`);
                } else {
                    return res.status(404).json({ error: 'Комната не найдена' });
                }
            } catch (err) {
                console.error('Ошибка загрузки комнаты из БД:', err);
                return res.status(500).json({ error: 'Ошибка загрузки состояния' });
            }
        }

        const session = manager.GameSession;
        const currentPlayer = session.players_list.find(p => p.uuid == playerId);
        if (!currentPlayer) {
            return res.status(403).json({ error: 'Игрок не принадлежит этой комнате' });
        }

        // 3. Формируем ответ
        const response = {
            roomCode: session.roomCode,
            gameState: session.game_state,
            currentRound: session.current_round,
            totalRounds: session.rounds_count,
            randomEventsEnabled: session.randomEvents,
            project: session.project,
            players: session.players_list.map(p => ({
                uuid: p.uuid,
                nickname: p.nickname,
                active: p.active,
                isCreator: p.be_creator,
                openCards: p.openCards ? p.openCards.map(c => ({
                    id: c.id,
                    cardType: c.cardType,
                    name: c.name
                })) : []
            })),
            currentPlayer: {
                uuid: currentPlayer.uuid,
                nickname: currentPlayer.nickname,
                isCreator: currentPlayer.be_creator,
                hand: currentPlayer.hand ? currentPlayer.hand.map(c => ({
                    id: c.id,
                    cardType: c.cardType,
                    name: c.name,
                    isOpen: c.isOpen
                })) : [],
                openCards: currentPlayer.openCards ? currentPlayer.openCards.map(c => ({
                    id: c.id,
                    cardType: c.cardType,
                    name: c.name
                })) : []
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Ошибка в эндпоинте /api/game/state:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Эндпоинт для выхода из игры (очистка cookie)
app.post('/api/logout', authenticatePlayer, (req, res) => {
    res.cookie('playerSession', '', {
        httpOnly: true,
        maxAge: 0,          // истекает мгновенно
        secure: false,
        //sameSite: 'lax'
    });
    res.json({ success: true, message: 'Вы вышли из комнаты' });
});

// Асинхронная инициализация и запуск
(async () => {
    await Player.nestId_on_dataBase(db);
    console.log('Счётчик ID игроков инициализирован');
    if (process.env.NODE_ENV !== 'test') {
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Сервер запущен на порту ${PORT}`);
        });
    }
})();

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

module.exports = { app, server, io, db, activeManagers };