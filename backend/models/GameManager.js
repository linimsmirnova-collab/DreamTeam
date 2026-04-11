const GameSession = require('./GameSession');
const DataStorage = require('../db/DataStorage');
const Player = require('./Player');

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
    async CreateGameSession (roomCode, creater, events, playersCount, final_players_count, rounds, project) {
        this.#gameSession = new GameSession(roomCode, creater, events, playersCount, final_players_count, rounds, project);
        console.log(creater.nickname)
    }

    AddPlayerToGameSession (player) {
        this.#gameSession.players_list.push(player)
    }

    CompleteRound() {
        this.#gameSession.current_round += 1;
    }
}

module.exports = GameManager;