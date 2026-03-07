const sqlite3 = require('sqlite3');

// взаимодействие с БД
class DataStorage {
    #connectionDB = ''
    #DB = this.#connectToDB

    constructor(connection) {
        // путь к базе данных (например: ./db/main.db)
        this.#connectionDB = connection;
    }

    #connectToDB() {
        let db = new sqlite3.Database(this.#connectionDB, (err) => {
            if (err) {
                console.error('Ошибка при открытии базы данных:', err.message);
            } else {
                console.log('Подключение к SQLite базе данных установлено.');
            }
        });
        return db;
    }


}

module.exports = DataStorage;