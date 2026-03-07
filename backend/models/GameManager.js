const GameSession = require('./GameSession');
const DataStorage = require('../db/DataStorage');
const Player = require('./Player');
const nicknamesData = require('./nicknames.json');

// Игровой менеджер
class GameManager {
    #gameSession = null
    #dataStorage = null

    // set GameSession(value) {
    //     if (value !== null && !(value instanceof GameSession)) {
    //         throw new Error('нужен объект класса GameSession');
    //     }
    //     this.#gameSession = value
    // }
    set DataStorage(value) {
        if (value !== null && !(value instanceof DataStorage)) {
            throw new Error('нужен объект класса DataStorage');
        }
        this.#dataStorage = value
    }

    get GameSession() {return this.#gameSession}
    get DataStorage() {return this.#dataStorage}

    constructor(DataStorage) {
        this.DataStorage = DataStorage;
    }

    // Создаёт игровую сессию
    CreateGameSession (roomCode, creater, events, playersCount) {
        this.#gameSession = new GameSession(roomCode, creater, events, playersCount);
        console.log(creater.nickname)
    }
    GenerateNickname () {
        // в будущем добавить проверку на уникальность
        const nicknames = nicknamesData.nicknames;
        const randomIndex = Math.floor(Math.random() * nicknames.length);
        return nicknames[randomIndex];
    }
    AddPlayerToGameSession (player) {
        this.#gameSession.players_list.push(player)
    }
}

module.exports = GameManager;