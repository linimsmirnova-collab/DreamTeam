const sqlite3 = require('sqlite3');
const Card = require('../models/Card');

// взаимодействие с БД
class DataStorage {
    #connectionDB = ''
    #DB = null

    constructor(connection) {
        // путь к базе данных (например: ./db/main.db)
        this.#connectionDB = connection;
        this.#DB = this.#connectToDB()
    }

    #connectToDB() {
        return new sqlite3.Database(this.#connectionDB, (err) => {
            if (err) {
                console.error('Ошибка при открытии базы данных:', err.message);
            } else {
                console.log('Подключение к SQLite базе данных установлено.');
            }
        });
    }

    // выдаёт список всех тем проектов из БД
    getProject() {
        return new Promise((resolve, reject) => {
            this.#DB.all(`SELECT * FROM projects ORDER BY RANDOM() LIMIT 1;`, (err, rows) => {
                if (err) {
                    console.error(err.message);
                    reject(err); // пробрасываем ошибку дальше
                } else {
                    resolve(rows[0]); // возвращаем строки
                }
            });
        });
    }
    // будет выдавать подборку карт для игрока
    getPlayerCards(){
        return new Promise((resolve, reject) => {
            this.#DB.all('SELECT id, cat_card AS cardType, text AS name FROM all_cards', (err, rows) => {
                if (err) {
                    console.error('Ошибка получения карт из БД:', err.message);
                    reject(err);
                    return;
                }
                const cards = rows.map(row => new Card(row.id, row.cardType, row.name));
                resolve(cards);
            });
        })
    }
    // Получение послденего айди игрока
    getLastPlayerId() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT MAX(id) as lastId FROM Players", (err, row) => {
                if (err) {
                    console.error('Ошибка получения последнего ID игрока:', err.message);
                    reject(err);
                } else {
                    resolve(row?.lastId || null);
                }
            });
        });
    }
    // сохранение данных об игровой сессии
    saveGameState(gameSession) {
        return new Promise(async (resolve, reject) => {
            const db = this.#DB;

            // Вспомогательная функция-обертка для выполнения запросов через async/await
            const runQuery = (query, params = []) => {
                return new Promise((res, rej) => {
                    // Используем function(err) вместо стрелочной, чтобы сохранить контекст this от sqlite3
                    db.run(query, params, function(err) {
                        if (err) rej(err);
                        else res(this); // this содержит lastID (сгенерированный PK) и changes
                    });
                });
            };

            try {
                // Начинаем транзакцию. Если на любом этапе будет ошибка, ни одна таблица не запишется наполовину.
                await runQuery('BEGIN TRANSACTION');

                // Получаем ID проекта (поддержка разных регистров, если в БД ID капсом или строчными)
                const projectId = gameSession.project.ID || gameSession.project.id;
                const roomCode = gameSession.roomCode;
                const randomEvents = gameSession.randomEvents;
                const gameState = gameSession.game_state
                const currentRound = gameState.current_round;

                // Проходимся по каждому игроку в списке
                for (const player of gameSession.players_list) {

                    // 1. Сохраняем игрока (таблица players)
                    // Если игрок с таким uuid уже есть, IGNORE предотвратит ошибку дублирования
                    await runQuery(
                        'INSERT OR IGNORE INTO players (id, nickname) VALUES (?, ?)',
                        [player.uuid, player.nickname]
                    );

                    // 2. Сохраняем сессию для КОНКРЕТНОГО игрока (таблица game_session)
                    // Определяем роль: 1 - создатель, 2 - обычный участник
                    const roleId = player.be_creator ? 1 : 2;

                    const sessionResult = await runQuery(
                        'INSERT INTO game_session (id_player, id_project, id_role, room_code, onoff_events, stage, current_round) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [player.uuid, projectId, roleId, roomCode, randomEvents, gameState, currentRound]
                    );

                    // Получаем ID только что созданной записи game_session именно для этого игрока
                    const playerSessionId = sessionResult.lastID;

                    // 3. Сохраняем карты игрока (таблица player_cards)
                    if (player.hand && player.hand.length > 0) {
                        for (const card of player.hand) {
                            await runQuery(
                                'INSERT INTO player_cards (id_session, id_player, id_card) VALUES (?, ?, ?)',
                                [playerSessionId, player.uuid, card.id]
                            );
                        }
                    }
                }

                // Если весь цикл прошел без ошибок — фиксируем изменения в БД
                await runQuery('COMMIT');
                resolve({ success: true, roomCode: roomCode });

            } catch (error) {
                // Если где-то произошла ошибка (например, нет нужной карты в all_cards), откатываем ВСЕ изменения
                await runQuery('ROLLBACK');
                console.error('Ошибка в saveGameState:', error.message);
                reject(new Error('Не удалось сохранить данные игры: ' + error.message));
            }
        });
    }
    // загрузка сессии из бд по коду комнаты
    loadGameState(roomCode) {
        return new Promise(async (resolve, reject) => {
            const db = this.#DB;

            // Вспомогательная функция для выполнения SELECT запросов через async/await
            const allQuery = (query, params = []) => {
                return new Promise((res, rej) => {
                    db.all(query, params, (err, rows) => {
                        if (err) rej(err);
                        else res(rows);
                    });
                });
            };

            try {
                // 1. Получаем все записи сессии для этой комнаты
                // JOIN-им игроков и проекты, чтобы получить полные данные за один запрос
                const sessionRows = await allQuery(`
                    SELECT gs.id as sessionId, gs.id_player, gs.id_role, gs.onoff_events as random_events, gs.stage as game_state, gs.current_round,
                           p.nickname,
                           prj.id as projectId, prj.name as projectName, prj.description as projectDescription
                    FROM game_session gs
                             JOIN players p ON gs.id_player = p.ID
                             JOIN projects prj ON gs.id_project = prj.ID
                    WHERE gs.room_code = ?
                `, [roomCode]);

                if (!sessionRows || sessionRows.length === 0) {
                    return reject(new Error(`Сессия с кодом ${roomCode} не найдена в базе данных`));
                }

                // Подгружаем классы для воссоздания структуры (Card уже импортирован в начале DataStorage.js)
                const Player = require('../models/Player');
                const GameManager = require('../models/GameManager');

                const loadedPlayers = [];
                let creatorPlayer = null;

                // Берем общие данные сессии из первой строки (они идентичны для всех участников этой комнаты)
                const firstRow = sessionRows[0];
                const project = {
                    id: firstRow.projectId,
                    name: firstRow.projectName,
                    description: firstRow.projectDescription
                };
                const randomEvents = Boolean(firstRow.random_events);
                const gameState = firstRow.game_state;
                const currentRound = firstRow.current_round;

                // 2. Восстанавливаем каждого игрока и его "руку" (карты)
                for (const row of sessionRows) {
                    const isCreator = row.id_role === 1;
                    const player = new Player(row.id_player, isCreator, row.nickname);

                    // Загружаем карты, привязанные именно к этой записи сессии и этому игроку
                    const cardRows = await allQuery(`
                        SELECT ac.id, ac.cat_card as cardType, ac.text as name
                        FROM player_cards pc
                        JOIN all_cards ac ON pc.id_card = ac.id
                        WHERE pc.id_session = ? AND pc.id_player = ?
                    `, [row.sessionId, row.id_player]);

                    // Мапим данные из БД в объекты класса Card
                    player.hand = cardRows.map(c => new Card(c.id, c.cardType, c.name));

                    loadedPlayers.push(player);
                    if (isCreator) creatorPlayer = player;
                }

                // 3. Расчитываем параметры игры на основе количества загруженных игроков
                const playersCount = loadedPlayers.length;
                const finalPlayersCount = Math.floor(playersCount / 2); // Логика из /api/room/create
                const roundsCount = playersCount - finalPlayersCount;

                // 4. Создаем менеджер и инициализируем в нем объект GameSession
                const manager = new GameManager(this);

                // Используем существующий метод CreateGameSession для базовой настройки
                await manager.CreateGameSession(
                    roomCode,
                    creatorPlayer,
                    randomEvents,
                    playersCount,
                    finalPlayersCount,
                    roundsCount,
                    project
                );

                // 5. Заполняем созданную сессию детальными данными
                const session = manager.GameSession;
                session.players_list = loadedPlayers;
                session.game_state = gameState;
                session.current_round = currentRound;

                resolve(manager);

            } catch (error) {
                console.error('Ошибка при загрузке состояния игры из БД:', error);
                reject(error);
            }
        });
    }
}

module.exports = DataStorage;