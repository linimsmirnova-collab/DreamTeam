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
        if (!session) return;

        // 1. Собираем активных игроков
        const activePlayers = session.players_list.filter(p => p.active);
        if (activePlayers.length === 0) return;

        // 2. Подсчёт голосов ТОЛЬКО за реальных игроков (игнорируем пропуски)
        const voteCounts = new Map(); // key: uuid игрока, value: количество голосов

        for (const player of session.players_list) {
            if (player.isVoted && player.votedOnPlayer !== null) {
                const targetUuid = player.votedOnPlayer.uuid;
                voteCounts.set(targetUuid, (voteCounts.get(targetUuid) || 0) + 1);
            }
        }

        // 3. Если никто ни за кого не голосовал (все пропустили) – просто переходим к следующему раунду
        if (voteCounts.size === 0) {
            console.log('Никто ни за кого не проголосовал (все скип), исключения нет');
            // Сбрасываем состояние голосования для всех
            for (const player of session.players_list) {
                player.isVoted = false;
                player.votedOnPlayer = null;
            }
            session.current_round += 1;
            // количество раундов увеличивается так как голосование пропущено
            session.rounds_count += 1;
            return null;
        }

        // 4. Находим максимальное количество голосов среди активных игроков
        let maxVotes = -1;
        for (const player of activePlayers) {
            const votes = voteCounts.get(player.uuid) || 0;
            if (votes > maxVotes) maxVotes = votes;
        }

        // 5. Собираем кандидатов (активные игроки с maxVotes)
        const candidates = activePlayers.filter(p => (voteCounts.get(p.uuid) || 0) === maxVotes);
        if (candidates.length === 0) return;

        // 6. Случайный выбор среди кандидатов
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const excludedPlayer = candidates[randomIndex];
        excludedPlayer.active = false;
        console.log(`Игрок ${excludedPlayer.nickname} исключён (получил ${maxVotes} голосов)`);

        // 7. Сбрасываем состояние голосования для всех
        for (const player of session.players_list) {
            player.isVoted = false;
            player.votedOnPlayer = null;
        }

        // 8. Переход к следующему раунду
        session.current_round += 1;
        session.players_count -= 1;

        // Возрат исключённого игрока
        return excludedPlayer;
    }
}

module.exports = GameManager;