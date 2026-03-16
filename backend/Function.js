//targetPlayer - колво игроков которое хотел оставить пользователь при создании комнаты (от фронта)
//finalTargetSize - реальное колво игроков которое получится оставить (то есть зависит от того сколько в комнате)
//currentPlayers - текущее количество игроков
//rounds - раунды
//targetTeamSize - сколько останется в конце игры 
//adjustedTarget - для регулировки чтобы не было больше текущих игроков

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
    
    // для финала
    if (finalTargetSize > currentPlayers) {
        finalTargetSize = currentPlayers;
    }
    
    if (finalTargetSize < 1) {
        finalTargetSize = 1;
    }
    
    // расчет раундов
    const rounds = currentPlayers - finalTargetSize;

    return {
        // основные параметры
        rounds: rounds,
        targetTeamSize: finalTargetSize,
        originalTarget: targetPlayers,
        
        // текущее состояние
        currentPlayers: currentPlayers,
        
        // границы
        minPlayers: minPlayers,
        maxPlayers: maxPlayers,
        
        eliminationCount: rounds,
        
        // флаги 
        enoughPlayers: enoughPlayers,
        tooManyPlayers: tooManyPlayers,
        isAdjusted: finalTargetSize !== targetPlayers,
        
        // сколько нужно доб/убр
        missingPlayers: enoughPlayers ? 0 : minPlayers - currentPlayers,
        extraPlayers: tooManyPlayers ? currentPlayers - maxPlayers : 0
    };
}

function canStartGame({ playerId, creatorId, currentPlayers, minPlayers = 4 }) {
    // права
    const isCreator = playerId === creatorId;
    
    // колво
    const hasEnoughPlayers = currentPlayers >= minPlayers;
    
    return {
        canStart: isCreator && hasEnoughPlayers,
        isCreator: isCreator,
        hasEnoughPlayers: hasEnoughPlayers,
        reason: !isCreator ? 'Только создатель может начать игру' :
                !hasEnoughPlayers ? `Нужно минимум ${minPlayers} игроков` :
                null
    };
}

// валидация для старта игры (проверки там)
function validateGameStart({ playerId, creatorId, currentPlayers, targetPlayers, minPlayers = 4, maxPlayers = 16 }) {
    const startCheck = canStartGame({ playerId, creatorId, currentPlayers, minPlayers });
    // если нельзя начать то информацию о блокировке
    if (!startCheck.canStart) {
        return {
            ...startCheck,// оператор копирования свойств в другой для удобва не писать каждый раз + gameparams перезапись
            gameParams: null
        };
    }
    
    // если можно начать то расчитываемые параметры
    const gameParams = calculateGameParams({ currentPlayers, targetPlayers, minPlayers, maxPlayers });
    
    return {
        ...startCheck,
        gameParams: gameParams
    };
}

module.exports = {
    calculateGameParams,
    canStartGame,
    validateGameStart
};