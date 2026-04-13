const GameSession = require("./GameSession");
const DataStorage = require("../db/DataStorage");
const path = require("path");

// Игрок
class Player {
    uuid = 0
    nickname = ''
    be_creator = false
    active = true
    hand = []
    openCards = []
    isVoted = false
    votedOnPlayer = null

    constructor (uuid, be_creator, nick) {
        this.uuid = uuid
        this.nickname = nick
        this.be_creator = be_creator
    }

    static #nextId = 0;
    // Метод для последнего получения nextId из базы данных при запуске сервера, для корректного присваивания и хранения айди игроков
    static async nestId_on_dataBase(db) {
        const lastId = await db.getLastPlayerId();
        Player.#nextId = (lastId === null || lastId === undefined) ? 0 : lastId;
    }
    static nextId_next () {
        Player.#nextId = Player.#nextId + 1
        return Player.#nextId
    }
}

module.exports = Player;