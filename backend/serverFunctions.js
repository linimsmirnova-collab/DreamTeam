//finalTargetSize - реальное колво игроков которое получится оставить (то есть зависит от того сколько в комнате)
//currentPlayers - текущее количество игроков
//rounds - раунды
//targetTeamSize - сколько останется в конце игры 

const crypto = require("crypto");
const fs = require('fs');
const path = require('path');

const activeManagers = require("./server");

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

function generateRoomId() {
    // в будущем добавить проверку на уникальность
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex символов в верхнем регистре
}

// Вспомогательная функция для установки httpOnly cookie с данными игрока
function setPlayerSessionCookie(res, playerId, roomId) {
    res.cookie('playerSession', JSON.stringify({ playerId, roomId }), {
        httpOnly: true,
        secure: false,  // принудительно false для разработки
        //sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000
    });
    console.log(`cookie отправлен румкод: ${roomId}, игрок айди ${playerId}`);
}

function generateRandomEvent() {
    const filePath = path.join(__dirname, 'events.json'); // поправьте путь, если нужно
    const events = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const randomIndex = Math.floor(Math.random() * events.length);
    return events[randomIndex];
}


module.exports = {
    calculateGameParams,
    canStartGame,
    generateRoomId,
    setPlayerSessionCookie,
    generateRandomEvent,
};