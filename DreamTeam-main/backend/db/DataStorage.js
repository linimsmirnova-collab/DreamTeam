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
}

module.exports = DataStorage;