const sqlite3 = require('sqlite3');

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
            // временная заглушка, так как не понятное тз = результат хз
            console.log("был запрос карт игрока у БД")
            resolve("абоба")
        })
    }
}

module.exports = DataStorage;