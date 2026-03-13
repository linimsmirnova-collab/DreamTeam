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

    getProjects() {
        this.#DB.all(`SELECT * FROM projects`, [], (err, rows) => {
            if (err) {
                console.error(err.message);
            } else {
                return rows;
            }
        });
    }
}

module.exports = DataStorage;