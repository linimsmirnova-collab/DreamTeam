const Player = require('./Player');

// Игровая сессия
class GameSession {
    #room_code = null; // код комнаты в формате string
    #creater = null; // создатель Player
    players_list = []; // список игроков Player
    static max_players = 16;
    static min_players = 4;
    #random_events = false;
    players_count = GameSession.min_players;
    // round_count = 0;
    // current_round = 0;
    game_state = null;

    set roomCode(roomCode) {
        this.#room_code = roomCode;
    }
    set creater(player) {
        this.#creater = player;
    }
    set randomEvents(flag) {
        this.#random_events = flag;
    }

    get roomCode() {
        return this.#room_code;
    }
    get creater() {
        return this.#creater;
    }
    get randomEvents() {
        return this.#random_events;
    }

    constructor(roomCode, creater, randomEvents, players_count = GameSession.min_players) {
        this.roomCode = roomCode;
        this.creater = creater;
        this.randomEvents = randomEvents;
        this.players_count = players_count;
        this.players_list.push(creater);
    }
}

module.exports = GameSession;