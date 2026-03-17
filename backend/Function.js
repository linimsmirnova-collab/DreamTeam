//targetPlayer - колво игроков которое хотел оставить пользователь при создании комнаты (от фронта)
//finalTargetSize - реальное колво игроков которое получится оставить (то есть зависит от того сколько в комнате)
//currentPlayers - текущее количество игроков
//rounds - раунды
//targetTeamSize - сколько останется в конце игры 

function calculateGameParams({ 
    currentPlayers, 
    targetPlayers, 
    minPlayers = 4, 
    maxPlayers = 16 
}) {
    if (typeof currentPlayers !== 'number' || currentPlayers < 0) {
        throw new Error('Некорректное количество текущих игроков');
    }

    if (typeof targetPlayers !== 'number' || targetPlayers < 1) {
        throw new Error('Некорректное целевое количество игроков');
    }
    const enoughPlayers = currentPlayers >= minPlayers;

    const tooManyPlayers = currentPlayers > maxPlayers;
    
    let finalTargetSize = targetPlayers;
    

    if (targetPlayers > currentPlayers) {
        finalTargetSize = currentPlayers;
    }
    if (finalTargetSize < 1) {
        finalTargetSize = 1;
    }
    
    // расчет раундов
    const rounds = currentPlayers - finalTargetSize;

    return {
        // убрал ненужное ок ок ок
        rounds: rounds,
        targetTeamSize: finalTargetSize,
    };
}

function canStartGame({ playerId, creatorId, currentPlayers, minPlayers = 4 }) {
    // права
    const isCreator = playerId === creatorId;
    
    // колво
    const hasEnoughPlayers = currentPlayers >= minPlayers;
    
    return {
        canStart: isCreator && hasEnoughPlayers,
        reason: !isCreator ? 'Только создатель может начать игру' :
                !hasEnoughPlayers ? `Нужно минимум ${minPlayers} игроков` :
                null
    };
}

// валидация для старта игры (проверки там)
function validateGameStart({ playerId, creatorId, currentPlayers, targetPlayers, minPlayers = 4, maxPlayers = 16 }) {
    const startCheck = canStartGame({ playerId, creatorId, currentPlayers, minPlayers });

    // если нельзя начать то прчина
    if (!startCheck.canStart) {
        return startCheck;
    }
    
    // если можно начать то расчитываемые параметры
    const gameParams = calculateGameParams({ currentPlayers, targetPlayers, minPlayers, maxPlayers });


    return {
      ...startCheck,
      ...gameParams
    }
}

module.exports = {
    calculateGameParams,
    canStartGame,
    validateGameStart
};