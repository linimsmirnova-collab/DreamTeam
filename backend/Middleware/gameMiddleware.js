//файл валидации (промежуточных проверок)
// middleware/gameMiddleware.js
//по сути всё то же самое что и в серваке но тут ещё проверки

const gameMiddleware = {
    // проверка существования комнаты
    validateRoomExists: (activeManagers) => {
        return (req, res, next) => {
            const roomID = req.body.roomCode || req.body.sessionId;
            
            if (!roomID) {
                return res.status(400).json({ error: 'Не указан код комнаты' });
            }
            
            const manager = activeManagers.get(roomID);
            if (!manager) {
                return res.status(404).json({ error: 'Комната не найдена' });
            }
            
            req.manager = manager;
            req.gameSession = manager.GameSession;
            next();
        };
    },

    // аутентификация игрока
    authenticatePlayer: (activeManagers) => {
        return (req, res, next) => {
            const cookieData = req.cookies.playerSession;
            
            if (!cookieData) {
                return res.status(401).json({ error: 'Не авторизован' });
            }

            try {
                const { playerId, roomId } = JSON.parse(cookieData);
                const manager = activeManagers.get(roomId);
                
                if (!manager) {
                    return res.status(404).json({ error: 'Комната не найдена' });
                }

                const player = manager.GameSession.players_list.find(p => p.uuid === playerId);
                if (!player) {
                    return res.status(403).json({ error: 'Игрок не найден' });
                }

                req.player = player;
                req.manager = manager;
                req.gameSession = manager.GameSession;
                next();
                
            } catch (e) {
                return res.status(400).json({ error: 'Неверный формат cookie' });
            }
        };
    },

    // проверка прав создателя
    validateCreator: (req, res, next) => {
        if (!req.player || !req.player.be_creator) {
            return res.status(403).json({ error: 'Только создатель может выполнить это действие' });
        }
        next();
    },

    // проверка минимального количества игроков
    validateMinPlayers: (min = 4) => {
        return (req, res, next) => {
            if (!req.gameSession) {
                return res.status(404).json({ error: 'Сессия не найдена' });
            }
            
            const currentPlayers = req.gameSession.players_list.length;
            if (currentPlayers < min) {
                return res.status(400).json({ 
                    error: `Недостаточно игроков. Нужно минимум ${min}`,
                    currentPlayers,
                    required: min
                });
            }
            next();
        };
    },

    // проверка заполненности комнаты
    validateRoomNotFull: (req, res, next) => {
        if (!req.gameSession) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        const currentPlayers = req.gameSession.players_list.length;
        const maxPlayers = req.gameSession.players_count || 16;
        
        if (currentPlayers >= maxPlayers) {
            return res.status(400).json({ error: 'Комната заполнена' });
        }
        next();
    },

    // проверка уникальности ника
    validateNicknameUnique: (req, res, next) => {
        const { nickname } = req.body;
        
        if (!req.gameSession) {
            return res.status(404).json({ error: 'Сессия не найдена' });
        }
        
        const existingPlayer = req.gameSession.players_list.find(p => p.nickname === nickname);
        if (existingPlayer) {
            return res.status(400).json({ error: 'Никнейм уже занят' });
        }
        next();
    },

    // проверка состояния игры
    validateGameState: (allowedStates) => {
        return (req, res, next) => {
            if (!req.gameSession) {
                return res.status(404).json({ error: 'Сессия не найдена' });
            }
            
            const currentState = req.gameSession.game_state;
            const states = Array.isArray(allowedStates) ? allowedStates : [allowedStates];
            
            if (!states.includes(currentState)) {
                return res.status(400).json({ 
                    error: `Игра должна быть в состоянии: ${states.join(' или ')}`,
                    currentState
                });
            }
            next();
        };
    },

    // проверка обязательных полей
    validateRequired: (fields) => {
        return (req, res, next) => {
            const missing = fields.filter(field => !req.body[field]);
            
            if (missing.length > 0) {
                return res.status(400).json({ 
                    error: `Отсутствуют поля: ${missing.join(', ')}` 
                });
            }
            next();
        };
    }
};

module.exports = gameMiddleware;
    //const roomCode = req.body.roomCode || req.query.roomCode || roomCode.params.roomCode;

    //if (!roomCode) {
     //    return res.status(400).json({ error: 'Не указан код комнаты' });
    //}

 //   if (!session) {
   //         return res.status(404).json({ error: 'Комната не найдена' });
     //   }
    //try {
      //  const {roomCode, sessionID} = req,body;
        //const roomID = roomCode || sessionID;

        //const gameSession = await GameManager.getSession(roomID)
    //}