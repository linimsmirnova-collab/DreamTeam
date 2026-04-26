const GameSession = require('./GameSession');
const DataStorage = require('../db/DataStorage');
const Player = require('./Player');
const Report = require('./Report');

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

    // Фискирует и возращает исключение игрока, фиксирует завершение раунда, если никто не исключён увеличивает количество раундов, и возращает null
    CompleteRound() {
        const session = this.#gameSession;
        if (!session) return null;

        const activePlayers = session.players_list.filter(p => p.active);
        if (activePlayers.length === 0) return null;

        const voteCounts = new Map();
        for (const player of session.players_list) {
            if (player.isVoted && player.votedOnPlayer !== null) {
                const targetUuid = player.votedOnPlayer.uuid;
                voteCounts.set(targetUuid, (voteCounts.get(targetUuid) || 0) + 1);
            }
        }

        // Все пропустили
        if (voteCounts.size === 0) {
            console.log('Никто ни за кого не проголосовал (все скип), исключения нет');
            for (const player of session.players_list) {
                player.isVoted = false;
                player.votedOnPlayer = null;
            }
            //session.current_round += 1;
            session.rounds_count += 1;
            return null;
        }

        let maxVotes = -1;
        for (const player of activePlayers) {
            const votes = voteCounts.get(player.uuid) || 0;
            if (votes > maxVotes) maxVotes = votes;
        }

        const candidates = activePlayers.filter(p => (voteCounts.get(p.uuid) || 0) === maxVotes);
        if (candidates.length === 0) return null;

        // Несколько кандидатов – ничья, пропускаем раунд
        if (candidates.length > 1) {
            console.log(`Несколько кандидатов (${candidates.length}) набрали одинаковое количество голосов (${maxVotes}), исключения нет`);
            for (const player of session.players_list) {
                player.isVoted = false;
                player.votedOnPlayer = null;
            }
            //session.current_round += 1;
            session.rounds_count += 1;
            return null;
        }

        // Единственный кандидат – исключаем
        const excludedPlayer = candidates[0];
        excludedPlayer.active = false;
        console.log(`Игрок ${excludedPlayer.nickname} исключён (получил ${maxVotes} голосов)`);

        for (const player of session.players_list) {
            player.isVoted = false;
            player.votedOnPlayer = null;
        }
        //session.current_round += 1;
        session.players_count -= 1;

        return excludedPlayer;
    }
}

module.exports = GameManager;