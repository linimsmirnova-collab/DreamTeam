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

                // Проходимся по каждому игроку в списке
                for (const player of gameSession.players_list) {

                    // 1. Сохраняем игрока (таблица players)
                    // Если игрок с таким uuid уже есть, IGNORE предотвратит ошибку дублирования
                    await runQuery(
                        'INSERT OR IGNORE INTO players (ID, nickname) VALUES (?, ?)',
                        [player.uuid, player.nickname]
                    );

                    // 2. Сохраняем сессию для КОНКРЕТНОГО игрока (таблица game_session)
                    // Определяем роль: 1 - создатель, 2 - обычный участник
                    const roleId = player.be_creator ? 1 : 2;

                    const sessionResult = await runQuery(
                        'INSERT INTO game_session (id_player, id_project, id_role, room_code) VALUES (?, ?, ?, ?)',
                        [player.uuid, projectId, roleId, roomCode]
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

    }
}

module.exports = DataStorage;