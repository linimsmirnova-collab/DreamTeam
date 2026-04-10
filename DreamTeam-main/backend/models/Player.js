const GameSession = require("./GameSession");

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

    static #nextId = 0; // в будущем будет браться последний id из базы данных
    static nextId_next () {
        Player.#nextId = Player.#nextId + 1
        return Player.#nextId
    }
}

module.exports = Player;