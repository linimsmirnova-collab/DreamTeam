const Player = require('./Player');
const buffer = require("node:buffer");

// Игровая сессия
class GameSession {
    #room_code = null; // код комнаты в формате string
    #creater = null; // создатель Player
    players_list = []; // список игроков Player
    static max_players = 16;
    static min_players = 4;
    #random_events = false;
    players_count = 0;
    players_final_count = 0
    rounds_count = 0;
    current_round = 0;
    project = null
    game_state = null;
    usedFeatureIds = new Set();
    report = null;

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

    constructor(roomCode, creater, randomEvents, players_count, final_players_count, rounds, project) {
        this.roomCode = roomCode;
        this.creater = creater;
        this.randomEvents = randomEvents;
        this.players_count = players_count;
        this.players_list.push(creater);
        this.project = project;
        this.players_final_count = final_players_count;
        this.rounds_count = rounds;
    }
}

module.exports = GameSession;