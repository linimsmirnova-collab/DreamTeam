//finalTargetSize - реальное колво игроков которое получится оставить (то есть зависит от того сколько в комнате)
//currentPlayers - текущее количество игроков
//rounds - раунды
//targetTeamSize - сколько останется в конце игры 

function calculateGameParams(currentPlayers) {
    // расчёт целевого количества игроков
    const finalTargetSize = Math.floor(currentPlayers / 2);
    
    // расчет раундов
    const rounds = currentPlayers - finalTargetSize;

    return {
        rounds: rounds,
        targetTeamSize: finalTargetSize,
    };
}

function canStartGame({ playerId, creatorId, currentPlayers, minPlayers = 4 }) {
    // права
    const isCreator = playerId === creatorId;
    
    // колво
    const hasEnoughPlayers = currentPlayers === minPlayers;
    
    return {
        canStart: isCreator && hasEnoughPlayers,
        reason: !isCreator ? 'Только создатель может начать игру' :
                !hasEnoughPlayers ? `Нужно ${minPlayers} игроков` :
                null
    };
}

module.exports = {
    calculateGameParams,
    canStartGame
};