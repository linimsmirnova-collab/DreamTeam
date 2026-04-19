let socket = null; // WebSocket соединение

// ===== РЕЖИМ РАБОТЫ =====
const IS_TEST_MODE = true; // true - тестовый режим (без бэкенда), false - с бэкендом

// ===== ХРАНИЛИЩЕ КОМНАТ (только для тестового режима) =====
const rooms = {};

// ===== ВОССТАНАВЛИВАЕМ КОМНАТЫ ИЗ localStorage (для тестового режима) =====
if (IS_TEST_MODE) {
    const savedRooms = localStorage.getItem('rooms');
    if (savedRooms) {
        Object.assign(rooms, JSON.parse(savedRooms));
        console.log('Восстановлены комнаты:', rooms);
    }
}
const CARD_TYPE_TO_LABEL = {
        1: 'Роль',
        2: 'Стаж',
        3: 'Черта характера',
        4: 'Качество',
        5: 'Особенность',
        6: 'Языки и среды'
    };

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ КАРТ =====
async function loadProfileCardsManually() {
    console.log('loadProfileCardsManually вызвана');
    console.log('IS_TEST_MODE =', IS_TEST_MODE);
    
    if (IS_TEST_MODE) {
        console.log('Тестовый режим, используем заглушку');
        const testCards = [
            { cardType: 1, name: 'Проект-менеджер' },
            { cardType: 2, name: 'Стаж' },
            { cardType: 3, name: 'Надёжный' },
            { cardType: 4, name: 'Адаптивность' },
            { cardType: 5, name: 'Особенность' },
            { cardType: 6, name: 'C#\nKotlin\nFigma' }
        ];
        renderProfileCardsGlobal(testCards);
        return;
    }
    
    try {
        console.log('Отправляем запрос на /api/game/my-cards');
        const res = await fetch('/api/game/my-cards', {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('Статус ответа:', res.status);
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        console.log('карты получены:', data.hand);
        console.log('Количество карт:', data.hand.length);
        
        if (data.hand && data.hand.length > 0) {
            renderProfileCardsGlobal(data.hand);
        } else {
            console.error('Сервер вернул пустой hand');
        }
        
    } catch (err) {
        console.error('ошибка загрузки карт:', err);
    }
}

function renderProfileCardsGlobal(hand) {
    const container = document.querySelector('.container');
    if (!container) {
        console.error('container не найден');
        return;
    }
    
    console.log('Динамическое создание карт, получено карт:', hand.length);
    
    // Ищем контейнер для карточек
    let cardsContainer = container.querySelector('.profile-cards-container');
    
    // Если контейнера нет - создаём его
    if (!cardsContainer) {
        cardsContainer = document.createElement('div');
        cardsContainer.className = 'profile-cards-container';
        // Вставляем после поля с ником
        const nickField = container.querySelector('.profile-nick-field');
        if (nickField && nickField.parentNode) {
            nickField.parentNode.insertBefore(cardsContainer, nickField.nextSibling);
        } else {
            container.appendChild(cardsContainer);
        }
    }
    
    // Очищаем контейнер
    cardsContainer.innerHTML = '';
    
    // Создаём карточки для каждой карты
    hand.forEach(card => {
        const label = CARD_TYPE_TO_LABEL[card.cardType];
        if (!label) {
            console.warn('Неизвестный тип карты:', card.cardType);
            return;
        }
        
        const cardDiv = document.createElement('div');
        cardDiv.className = 'profile-card';
        
        cardDiv.innerHTML = `
            <div class="profile-card-badge"></div>
            <div class="profile-card-label">${label}</div>
            <div class="profile-card-value">${card.name.replace(/\n/g, '<br>')}</div>
        `;
        
        cardsContainer.appendChild(cardDiv);
        console.log(`Создана карта: ${label} -> ${card.name}`);
    });
}

// ===== Функция для генерации тестового кода комнаты (только для тестового режима) =====
function generateRoomCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}
//вынес в одну функцию чтобы вторая не перезаписывала первую
function setActiveIcon(container, activeClass, iconClass) {
    const icons = container.querySelectorAll(`.${iconClass}`);
    icons.forEach(icon => {
        icon.style.border = 'none';
        icon.style.boxShadow = 'none';
        icon.style.borderRadius = '0';
    });
    
    const activeIcon = container.querySelector(`.${activeClass}`);
    if (activeIcon) {
        activeIcon.style.border = '3px solid #F17BAB';
        activeIcon.style.boxShadow = '0 0 10px rgba(241, 123, 171, 0.5)';
        activeIcon.style.borderRadius = '50%';
    }
}
// Выполнится, когда страница полностью загрузится (HTML, CSS..)
window.onload = function() {
    
    const container = document.querySelector('.container');
    const roomCode = sessionStorage.getItem('currentRoomCode');
    const currentPlayer = sessionStorage.getItem('currentPlayer');

    // ===== ПОДКЛЮЧЕНИЕ WEBSOCKET ДЛЯ ВСЕХ ИГРОКОВ =====
    if (!IS_TEST_MODE && !socket) {
        socket = io({ withCredentials: true });
        
        socket.on('connect', () => {
            console.log(`WebSocket подключен (id: ${socket.id})`);
            
            // Регистрируем игрока в комнате - берем актуальные данные из sessionStorage
            const playerUuid = sessionStorage.getItem('currentPlayerUuid');
            const currentRoomCode = sessionStorage.getItem('currentRoomCode'); // Берем заново!
            
            console.log('Данные для регистрации:', { playerUuid, currentRoomCode });
            
            if (playerUuid && currentRoomCode) {
                socket.emit('register', { playerUuid, roomCode: currentRoomCode });
                console.log('Зарегистрирован в комнате:', currentRoomCode);
            } else {
                console.log('Нет данных для регистрации, повторная попытка через 1 секунду');
                // Повторяем попытку через секунду
                setTimeout(() => {
                    const retryUuid = sessionStorage.getItem('currentPlayerUuid');
                    const retryRoomCode = sessionStorage.getItem('currentRoomCode');
                    if (retryUuid && retryRoomCode && socket.connected) {
                        socket.emit('register', { playerUuid: retryUuid, roomCode: retryRoomCode });
                        console.log('Зарегистрирован (повторно):', retryRoomCode);
                    }
                }, 1000);
            }
        });
        
        // Слушаем событие начала игры
        socket.on('game-start', (data) => {
            console.log(`ПОЛУЧЕНО game-start:`, data);
            
            // Останавливаем все интервалы при получении события
            if (window.canStartInterval) {
                clearInterval(window.canStartInterval);
                window.canStartInterval = null;
            }
            if (window.playersInterval) {
                clearInterval(window.playersInterval);
                window.playersInterval = null;
            }
            
            // Переход на страницу профиля
            loadPage('profile.html', container);

            // Принудительная загрузка данных после перехода
            setTimeout(() => {
                const profileContainer = document.querySelector('.profile-container');
                if (profileContainer) {
                    // Перевызываем инициализацию профиля
                    const currentPlayer = sessionStorage.getItem('currentPlayer');
                    const nickEl = document.querySelector('.profile-nick-text');
                    if (nickEl && currentPlayer) {
                        nickEl.textContent = currentPlayer;
                    }
                    
                    // Загружаем карты
                    loadProfileCardsManually();
                }
            }, 100);
        });
        
        socket.on('disconnect', () => {
            console.log('WebSocket отключен');
        });
    }
    
    // проверка на то что игрок уже является членом комнаты
    if (roomCode && currentPlayer) {
        loadPage('player-list.html', container);
    } else {
        loadPage('main-page-content.html', container);
    }
}

// Функция для загрузки HTML страницы
function loadPage(pageName, container) {

    console.log('loadPage вызвана:', pageName);
    console.log('container:', container); 

    if (!container) {
        console.error('container не найден!');
        return;
    }
    
    fetch(`/pages/${pageName}`)

        // Когда файл загрузился, читаем его как текст
        .then(response => response.text()) 
        
        
        // Вставляем этот текст в контейнер
        .then(html => { 
            container.innerHTML = html;
            
            // Добавляем обработчики
            addPageHandlers(container);
        })
        .catch(error => {
            console.error('Ошибка загрузки:', error);
            container.innerHTML = '<h1>404</h1><p>Страница не найдена</p>';
        });
}

// Функция для добавления обработчиков на загруженной странице
function addPageHandlers(container) {
    
    // ===== КНОПКИ НА ГЛАВНОЙ СТРАНИЦЕ =====
    const createBtn = container.querySelector('.btn.primary'); // Создать
    const joinBtn = container.querySelector('.btn.secondary'); // Присоединиться
    const logoutBtn = container.querySelector('.btn.logout'); // Выход
    
    if (createBtn) {
        createBtn.onclick = function() {
            loadPage('create-room.html', container);
        };
    }
    
    if (joinBtn) {
        joinBtn.onclick = function() {
            loadPage('join-room.html', container);
        };
    }
    
    if (logoutBtn) {
        logoutBtn.onclick = function() {
            if (confirm('Вы действительно хотите выйти и закрыть приложение?')) {
                window.close();
            }
        };
    }
    
    // ===== КНОПКА "НАЗАД" =====
    const backBtn = container.querySelector('[data-page="main-page"]');
    if (backBtn) {
        backBtn.onclick = function() {
            loadPage('main-page-content.html', container);
        }
    }
    
    // ===== КНОПКИ + И - =====
    const minusBtn = container.querySelector('.minus-btn');
    const plusBtn = container.querySelector('.plus-btn');
    const countSpan = container.querySelector('.players-count span');
    
    if (minusBtn && plusBtn && countSpan) {
        let count = parseInt(countSpan.textContent) || 6;
        
        minusBtn.onclick = function() {
            if (count > 4) {
                count--;
                countSpan.textContent = count;
            }
        };
        
        plusBtn.onclick = function() {
            if (count < 16) {
                count++;
                countSpan.textContent = count;
            }
        };
    }

    // ===== Генерация случайного ника (ОСТАВЛЯЕМ В ЛЮБОМ РЕЖИМЕ) =====
    const randomNickField = container.querySelector('.random-nick-text');
    const joinNickField = container.querySelector('.join-room-nick-text');

    // Общий список ников для всех полей
    const nicknames = [
        // Животные
        'СонныйКот', 'БодрыйПёс', 'ХитрыйЛис', 'МудрыйФилин', 'ШустрыйЗаяц',
        'ПушистыйЕнот', 'ВеселыйСуслик', 'ЛенивыйЛенивец', 'ДобрыйСлон', 'МаленькийПингвин',

        // Еда
        'ГолодныйПельмень', 'СмелыйБлин', 'КислыйЛимон', 'СладкийПончик', 'СоленыйОгурец',
        'ГорячийКофе', 'ХолодныйЧай', 'ВоздушныйЗефир', 'ТягучийМармелад', 'ШоколадныйБатончик',

        // IT-шные
        'БайтовыйЧервяк', 'ПиксельныйГном', 'СерверныйХомяк', 'КодовыйКот',
        'КоммитныйЛось', 'ПушнутыйКролик', 'ФреймворковыйВолк', 'АлгоритмическийЛис',

        // Смешные профессии
        'КотоПрограммист', 'ПёсоДизайнер', 'ЛисоАналитик', 'ЕноТестировщик',
        'ХомякоМенеджер', 'СусликоАрхитектор', 'УткоФронтенд', 'ЖабоБэкенд',

        // Хобби и действия
        'ЛюбительПиццы', 'ЦенительКофе', 'ИскательПриключений', 'ХранительПокоя', 'МастерСна',
        'ПрофессионалОтдыха', 'ЭкспертПоЕде', 'ГуруЛени', 'ЧемпионМемасов', 'КорольАнекдотов',

        // Просто смешные
        'ТотСамыйКот', 'Простофиля', 'Везунчик', 'Чудак', 'Фантазер',
        'Мечтатель', 'Прогульщик', 'Философ', 'Эстет','Оптимист', 'Реалист', 
        'Пессимист', 'Романтик',

        // Фруктово-овощные
        'БравыйБаклажан', 'СмелыйКабачок', 'ХрабрыйПомидор', 'МудрыйКартофель', 'БыстраяРедиска',
        'ВеселаяТыква', 'ДикийПерец', 'МилыйОгурец', 'ЯркийЛук', 'ТихаяКапуста',
    ];

    // Генерация для create-room
    if (randomNickField) {
        const randomIndex = Math.floor(Math.random() * nicknames.length);
        const randomNick = nicknames[randomIndex];
        randomNickField.textContent = randomNick;
    }

    // Генерация для join-room
    if (joinNickField) {
        const randomIndex = Math.floor(Math.random() * nicknames.length);
        const randomNick = nicknames[randomIndex];
        joinNickField.textContent = randomNick;
    }


    // ===== Кнопка "Подтвердить" для обеих страниц =====
    const confirmBtn = container.querySelector('.create-room-confirm, .join-room-confirm');
    const codeInput = container.querySelector('.join-room-code-input');

    if (confirmBtn) {
        confirmBtn.onclick = function() {
            
            // Определяем, на какой мы странице
            const isCreateRoom = container.querySelector('.create-room-confirm') !== null;
            const isJoinRoom = container.querySelector('.join-room-confirm') !== null;
            
            // Получаем ник (для обеих страниц)
            const nickField = container.querySelector('.random-nick-text, .join-room-nick-text');
            const nickname = nickField ? nickField.textContent : 'Неизвестный';
            
            if (isCreateRoom) {
                // ===== ЛОГИКА ДЛЯ CREATE-ROOM =====
                const checkboxChecked = container.querySelector('.checkbox')?.checked || false;
                const playersCount = container.querySelector('.players-count span')?.textContent || 6;
                
                if (IS_TEST_MODE) {
                    // ===== ТЕСТОВЫЙ РЕЖИМ (без сервера) =====
                    // Генерируем случайный код комнаты
                    const roomCode = generateRoomCode();
                    
                    // Сохраняем комнату в хранилище
                    rooms[roomCode] = {
                        creator: nickname,
                        players: [nickname],
                        playersCount: parseInt(playersCount),
                        maxPlayers: parseInt(playersCount),
                        randomEvents: checkboxChecked,
                        createdAt: new Date().toISOString()
                    };
                    
                    // Сохраняем в localStorage
                    localStorage.setItem('rooms', JSON.stringify(rooms));
                    
                    alert(`[ТЕСТ] Комната создана! Код: ${roomCode}`);
                    
                    sessionStorage.setItem('currentRoomCode', roomCode);
                    sessionStorage.setItem('currentPlayer', nickname);
                    sessionStorage.setItem('maxPlayers', playersCount);
                    
                    loadPage('player-list.html', container);
                } 
                else {
                    // ===== РАБОЧИЙ РЕЖИМ (с сервером) =====
                    
                    const roomData = {
                        nickname: nickname,
                        maxPlayers: parseInt(playersCount),
                        randomEvents: checkboxChecked
                    };

                    fetch('/api/room/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(roomData)
                    })
                    .then(response => response.json())
                    .then(data => {
                        // Бэк возвращает { roomId, nickname, project }
                        if (data.roomId) {
                            alert('Комната создана! Код комнаты: ' + data.roomId);
                            sessionStorage.setItem('currentRoomCode', data.roomId);
                            sessionStorage.setItem('currentPlayer', data.nickname);
                            sessionStorage.setItem('maxPlayers', data.maxPlayers);
                            sessionStorage.setItem('project', JSON.stringify(data.project)); // сохраняем проект
                            sessionStorage.setItem('currentPlayerUuid', data.playerId);
                            loadPage('player-list.html', container);
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось создать комнату'));
                        }
                    })
                    .catch(error => {
                        console.error('Ошибка:', error);
                        alert('Не удалось подключиться к серверу');
                    });
                }
            }
            
            else if (isJoinRoom) {
                // ===== ЛОГИКА ДЛЯ JOIN-ROOM =====
                const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
                
                // Проверяем, что код не пустой
                if (code.length === 0) {
                    alert('Введите код комнаты');
                    return;
                }

                // Проверки для join-room
                if (code.length !== 6) {
                    alert('Код комнаты должен содержать ровно 6 символов!');
                    return;
                }
                
                if (IS_TEST_MODE) {
                    // ===== ТЕСТОВЫЙ РЕЖИМ (без сервера) =====
                    const hasLetters = /[a-zA-Z]/.test(code);
                    const hasNumbers = /[0-9]/.test(code);
                    
                    if (!hasLetters || !hasNumbers) {
                        alert('Код комнаты должен содержать и буквы, и цифры!');
                        return;
                    }
                    
                    // Проверяем, существует ли комната с таким кодом
                    const room = rooms[code];
                    if (!room) {
                        alert('Комната с таким кодом не найдена!');
                        return;
                    }
                    
                    // Проверяем, есть ли свободные слоты
                    if (room.players.length >= room.maxPlayers) {
                        alert('Извините, в комнате нет свободных мест!');
                        return;
                    }
                    
                    // Добавляем игрока в комнату
                    room.players.push(nickname);
                    
                    // Сохраняем изменения
                    localStorage.setItem('rooms', JSON.stringify(rooms));
        
                    alert(`[ТЕСТ] Вы вошли в комнату ${code}!`);
                    
                    sessionStorage.setItem('currentRoomCode', code);
                    sessionStorage.setItem('currentPlayer', nickname);
                    
                    loadPage('player-list.html', container);
                } 
                else {
                    // ===== РАБОЧИЙ РЕЖИМ (с сервером) =====
                    
                    const joinData = {
                        nickname: nickname,
                        roomCode: code
                    };

                    fetch('/api/room/join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(joinData)
                    })
                    .then(response => response.json())
                    .then(data => {
                        // Бэк возвращает { true, nickname, roomId, maxPlayers }
                        if (data.success) {
                            alert('Вы успешно вошли в комнату!');
                            sessionStorage.setItem('currentRoomCode', data.roomId);
                            sessionStorage.setItem('currentPlayer', data.nickname);
                            sessionStorage.setItem('maxPlayers', data.maxPlayers);
                            sessionStorage.setItem('currentPlayerUuid', data.playerId);
                            loadPage('player-list.html', container);
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось войти в комнату'));
                        }
                    })
                    .catch(error => {
                        console.error('Ошибка:', error);
                        alert('Не удалось подключиться к серверу');
                    });
                }
            }
        };
    }


     // ===== Валидация для поля ввода кода комнаты =====
    if (codeInput) {
        // Ограничение длины до 6 символов
        codeInput.maxLength = 6;

        // Автоматически переводим в верхний регистр
        codeInput.oninput = function() {
            this.value = this.value.toUpperCase();
        };
    }
     
    // ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ СПИСКА ИГРОКОВ =====
    const playerListContainer = container.querySelector('.players-list');
    
    if (playerListContainer) {
        const roomCode = sessionStorage.getItem('currentRoomCode');
        const currentPlayer = sessionStorage.getItem('currentPlayer');
        
        // ===== РЕГИСТРАЦИЯ ВСЕХ ИГРОКОВ В WEBSOCKET (ВАЖНО!) =====
    if (!IS_TEST_MODE && socket && socket.connected) {
        const playerUuid = sessionStorage.getItem('currentPlayerUuid');
        console.log('Регистрация в сокете:', { playerUuid, roomCode });
        
        if (playerUuid && roomCode) {
            socket.emit('register', { playerUuid, roomCode: roomCode });
            console.log('✅ Зарегистрирован в комнате:', roomCode);
        }
    }
        if (IS_TEST_MODE) {
            // ===== ТЕСТОВЫЙ РЕЖИМ =====
            const room = rooms[roomCode];
            
            if (room) {
                // Обновляем отображение кода комнаты
                const roomCodeDisplay = container.querySelector('.room-code-display');
                if (roomCodeDisplay) {
                    roomCodeDisplay.textContent = `КОД КОМНАТЫ: ${roomCode}`;
                }
                
                // Обновляем счетчик
                const votingCount = container.querySelector('.voting-count');
                if (votingCount) {
                    votingCount.textContent = `${room.players.length} из ${room.maxPlayers}`;
                }
                
                // Очищаем список и заполняем игроками
                const playersList = container.querySelector('.players-list');
                if (playersList) {
                    playersList.innerHTML = '';
                    
                    // Добавляем всех игроков
                    room.players.forEach(player => {
                        const playerItem = document.createElement('div');
                        playerItem.className = 'player-item' + (player === currentPlayer ? ' current-player' : '');
                        playerItem.innerHTML = `
                            <div class="player-badge"></div>
                            <div class="player-name">${player}</div>
                        `;
                        playersList.appendChild(playerItem);
                    });
                    
                    // Добавляем пустые слоты
                    for (let i = room.players.length; i < room.maxPlayers; i++) {
                        const emptySlot = document.createElement('div');
                        emptySlot.className = 'player-item empty-slot';
                        emptySlot.innerHTML = `
                            <div class="player-badge"></div>
                            <div class="player-name">...</div>
                        `;
                        playersList.appendChild(emptySlot);
                    }
                }
            }
        } else {
            // ===== РАБОЧИЙ РЕЖИМ (запрос к серверу) =====
            
            console.log('Запрашиваем игроков для комнаты:', roomCode);
    
            if (!roomCode) {
                console.error('roomCode не найден в sessionStorage');
                return;
            }

            // Убираем старый интервал, если был
            if (window.playersInterval) clearInterval(window.playersInterval);

            // Функция загрузки игроков
            function loadPlayers() {
                const currentRoomCode = sessionStorage.getItem('currentRoomCode');
                const currentPlayer = sessionStorage.getItem('currentPlayer');
        
                if (!currentRoomCode) return;

                // Отображаем код комнаты сразу
                const roomCodeDisplay = container.querySelector('.room-code-display');
                if (roomCodeDisplay) {
                    roomCodeDisplay.textContent = `КОД КОМНАТЫ: ${roomCode}`;
                }

                fetch(`/api/room/players?code=${roomCode}`, {
                    credentials: 'include',
                    headers: {
                    'Content-Type': 'application/json'
                    }
                })
                .then(response => {
                    console.log('Статус ответа для players:', response.status);
                    if (response.status === 401) {
                        throw new Error('Не авторизован (ошибка 401)');
                    }
                    if (!response.ok) {
                        throw new Error(`HTTP ошибка ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Данные от сервера (players):', data);

                    // Возвращает объект { players: [...], maxPlayers: ... }
                    if (!data.players || !Array.isArray(data.players)) {
                        console.error('Сервер вернул неверный формат:', data);
                        return;
                    }
    
                    const players = data.players;
                    const serverMaxPlayers = data.maxPlayers;
    
                    // Получаем максимальное количество игроков (сначала из ответа сервера, потом из sessionStorage)
                    const maxPlayers = serverMaxPlayers || parseInt(sessionStorage.getItem('maxPlayers')) || 6;
    
                    // Сохраняем в sessionStorage
                    sessionStorage.setItem('maxPlayers', maxPlayers);
    
                    // Обновляем счетчик
                    const votingCount = container.querySelector('.voting-count');
                    if (votingCount) {
                        votingCount.textContent = `${players.length} из ${maxPlayers}`;
                    }

                    // Отображаем игроков
                    const playersList = container.querySelector('.players-list');
                    if (playersList) {
                        playersList.innerHTML = '';

                        // Добавляем всех реальных игроков
                        players.forEach(player => {
                            const playerItem = document.createElement('div');
                            playerItem.className = 'player-item' + (player.nickname === currentPlayer ? ' current-player' : '');
                            playerItem.innerHTML = `
                                <div class="player-badge"></div>
                                <div class="player-name">${player.nickname}</div>
                            `;
                            playersList.appendChild(playerItem);
                        });

                        // Добавляем пустые слоты
                        for (let i = players.length; i < maxPlayers; i++) {
                            const emptySlot = document.createElement('div');
                            emptySlot.className = 'player-item empty-slot';
                            emptySlot.innerHTML = `
                                <div class="player-badge"></div>
                                <div class="player-name">...</div>
                            `;
                            playersList.appendChild(emptySlot);
                        }
        
                        // ===== УПРАВЛЕНИЕ КНОПКОЙ "НАЧАТЬ" (с проверкой can-start) =====
                        const startBtn = container.querySelector('.player-list-start');
                        const waitingMessage = container.querySelector('.waiting-message');

                        // Определяем, является ли текущий игрок создателем
                        const isCreator = players.some(player => player.nickname === currentPlayer && player.be_creator === true);

                        if (isCreator) {
                            // ===== СОЗДАТЕЛЬ — показываем кнопку =====
                            if (startBtn) {
                                startBtn.style.display = 'block';
                                
                                // Флаг, чтобы запрос отправился только один раз
                                let gameStartRequested = false;
                                
                                function checkCanStart() {
                                    fetch('/api/room/can-start', {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ roomCode: roomCode })
                                    })
                                    .then(response => response.json())
                                    .then(canStartData => {
                                        console.log('can-start ответ:', canStartData);

                                        if (canStartData.canStart) {
                                            startBtn.style.opacity = '1';
                                            startBtn.style.pointerEvents = 'auto';

                                            const startBg = startBtn.querySelector('.start-background');
                                            if (startBg) {
                                                startBg.style.background = '#F17BAB';
                                                startBg.style.border = '2px solid #7F375A';  
                                            }

                                            const startText = startBtn.querySelector('.start-text');
                                            if (startText) {
                                                startText.style.color = '#FFFFFF';
                                                startText.style.textShadow = `
                                                    1px 0 0 #7F375A,
                                                    -1px 0 0 #7F375A,
                                                    0 1px 0 #7F375A,
                                                    0 -1px 0 #7F375A,
                                                    1px 1px 0 #7F375A,
                                                    -1px -1px 0 #7F375A,
                                                    1px -1px 0 #7F375A,
                                                    -1px 1px 0 #7F375A`;
                                            }

                                            startBtn.onclick = function() {
                                                // Предотвращаем повторные вызовы
                                                if (gameStartRequested) {
                                                    console.log('Запрос уже отправлен, игнорируем');
                                                    return;
                                                }
                                                gameStartRequested = true;
                                                
                                                if (IS_TEST_MODE) {
                                                    console.log('Тестовый режим: начало игры');
                                                    loadPage('profile.html', container);
                                                } else {
                                                    console.log('Отправляем запрос на /api/game/start');
                                                    
                                                    if (window.canStartInterval) {
                                                        clearInterval(window.canStartInterval);
                                                        window.canStartInterval = null;
                                                    }
                                                    
                                                    fetch('/api/game/start', {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                        headers: { 'Content-Type': 'application/json' }
                                                    })
                                                    .then(response => {
                                                        console.log('Статус:', response.status);
                                                        if (!response.ok) {
                                                            return response.json().then(data => {
                                                                throw new Error(data.error || `HTTP ${response.status}`);
                                                            });
                                                        }
                                                        return response.json();
                                                    })
                                                    .then(data => {
                                                        if (data.success) {
                                                            console.log('Игра успешно запущена на сервере');
                                                            // Прямой переход, так как WebSocket не работает
                                                            loadPage('profile.html', container);
                                                        }
                                                    })
                                                    .catch(error => {
                                                        console.error('Ошибка:', error);
                                                        alert('Не удалось начать игру: ' + error.message);
                                                        gameStartRequested = false; // Сбрасываем при ошибке
                                                    });
                                                }
                                            };
                                        } else {
                                            startBtn.style.opacity = '0.5';
                                            startBtn.style.pointerEvents = 'none';
                                            const startBg = startBtn.querySelector('.start-background');
                                            if (startBg) startBg.style.background = '#DADADA';
                                            if (canStartData.reason) startBtn.title = canStartData.reason;
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Ошибка проверки can-start:', error);
                                        startBtn.style.opacity = '0.5';
                                        startBtn.style.pointerEvents = 'none';
                                    });
                                }

                                checkCanStart();
                                if (window.canStartInterval) clearInterval(window.canStartInterval);
                                window.canStartInterval = setInterval(checkCanStart, 3000);
                            }
                            if (waitingMessage) waitingMessage.style.display = 'none';
                        } else {
                            // ===== НЕ СОЗДАТЕЛЬ — скрываем кнопку, показываем уведомление =====
                            if (startBtn) startBtn.style.display = 'none';
                            if (waitingMessage) waitingMessage.style.display = 'block';
                        }
                    }
                })
        
                .catch(error => {
                console.error('Ошибка при получении списка игроков:', error);
                });
            } 
            // Загружаем сразу
            loadPlayers();
    
            // Автообновление каждые 2 секунды
            window.playersInterval = setInterval(loadPlayers, 2000);      
        }  
    }

    // ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ ПРОФИЛЬ (profile.html) =====
    // Проверяем, что мы на странице profile.html (по наличию уникального элемента)
    const isProfilePage = container.querySelector('.profile-nick-field, .profile-card, .profile-turn');
    const profileContainer = isProfilePage ? container : null;

    if (profileContainer) {
        console.log('страница профиля загружена');
        
        // получаем данные из sessionStorage
        const roomCode = sessionStorage.getItem('currentRoomCode');
        const playerUuid = sessionStorage.getItem('currentPlayerUuid');
        const currentPlayer = sessionStorage.getItem('currentPlayer');
        const maxPlayers = parseInt(sessionStorage.getItem('maxPlayers')) || 4;//если ложь то по умолчанию 4 тк мин 4
        
        // обновляем ника
        const nickEl = container.querySelector('.profile-nick-text');
        if (nickEl && currentPlayer) {
            nickEl.textContent = currentPlayer;
        }
        
        // Используем глобальный socket (уже создан)
        if (!IS_TEST_MODE && socket && roomCode && playerUuid) {
            // Регистрируемся в комнате
            socket.emit('register', { playerUuid, roomCode });
            console.log('зарегистрирован в сокете:', playerUuid, roomCode);
            
            // Добавляем слушатели событий (если ещё не добавлены)
            if (!window._profileListenersAdded) {
                socket.on('reveal-card', (data) => {
                    console.log('карта вскрыта:', data);
                    updateRevealedCard(data.player.uuid, data.openCard);
                });
                
                socket.on('turn-update', (data) => {
                    console.log('ход обновлён:', data);
                    updateTurnIndicator(data.currentPlayerUuid, data.timeLeft);
                });
                
                window._profileListenersAdded = true;
            }
        }
        
        // карта типов карт для преобразования ID в название
        /*const CARD_TYPE_TO_LABEL = {
            1: 'Роль',
            2: '',
            3: 'Черта характера',
            4: 'Качество',
            5: 'Особенность',
            6: 'Языки и среды'
        };*/
        
        // поиск карточки по лейблу
        function findCardByLabel(container, label, isProfile) {
            const selector = isProfile ? '.profile-card' : '.mini-card';
            const labelSelector = isProfile ? '.profile-card-label' : '.mini-card-label';
            
            for (const card of container.querySelectorAll(selector)) {
                const labelEl = card.querySelector(labelSelector);
                if (labelEl && labelEl.textContent.trim() === label) {
                    return card;
                }
            }
            return null;
        }
        
        // загрузка карт игрока
        async function loadProfileCards() {
            if (IS_TEST_MODE) {
                const testCards = [
                    { cardType: 1, name: 'Проект-менеджер' },
                    { cardType: 2, name: 'Стаж' },
                    { cardType: 3, name: 'Надёжный' },
                    { cardType: 4, name: 'Адаптивность' },
                    { cardType: 5, name: 'Подогревает рыбу в офисной микроволновке каждую среду' },
                    { cardType: 6, name: 'C#\nKotlin\nFigma' }
                ];
                renderProfileCards(testCards);
                return;
            }
            
            try {
                console.log('запрос карт с сервера.........');
                const res = await fetch('/api/game/my-cards', {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const data = await res.json();
                console.log('карты получены:', data.hand);
                renderProfileCards(data.hand);
                
            } catch (err) {
                console.error('ошибка загрузки карт:', err);
                alert('Не удалось загрузить карты. Обновите страницу.');
            }
        }
        
        // отрисовка карт
        function renderProfileCards(hand) {
            console.log('отрисовка карт:', hand);
            
            hand.forEach(card => {
                const label = CARD_TYPE_TO_LABEL[card.cardType];
                if (!label) {
                    console.warn('неизвестный тип карты:', card.cardType);
                    return;
                }
                
                const cardEl = findCardByLabel(profileContainer, label, true);
                const valueEl = cardEl?.querySelector('.profile-card-value');
                
                if (valueEl) {
                    // Заменяем \n на <br> для переноса строк в HTML
                    valueEl.innerHTML = card.name.replace(/\n/g, '<br>');
                    valueEl.dataset.cardType = card.cardType;
                } else {
                    console.warn('не найдена карточка для', label);
                }
            });
        }    
        // Вскрытие карты отправка на сервер
    /* async function revealCard(cardType) {
            console.log('вскрытие карты типа', cardType);
            
            if (IS_TEST_MODE) {
                console.log('тест: карта вскрыта (без сервера)');
                const label = CARD_TYPE_TO_LABEL[cardType];
                const cardEl = findCardByLabel(profileContainer, label, true);
                if (cardEl) {
                    const valueEl = cardEl.querySelector('.profile-card-value');
                    if (valueEl) {
                        valueEl.dataset.revealed = 'true';
                        cardEl.style.opacity = '0.7';
                        cardEl.style.border = '3px solid #F17BAB';
                    }
                }
                return;
            }
            
            try {
                const res = await fetch('/api/game/reveal-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ cat_card: cardType })
                });
                
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                console.log('Карта вскрыта');
                
                // Визуально помечаем вскрытую карту
                const label = CARD_TYPE_TO_LABEL[cardType];
                const cardEl = findCardByLabel(profileContainer, label, true);
                if (cardEl) {
                    const valueEl = cardEl.querySelector('.profile-card-value');
                    if (valueEl) {
                        valueEl.dataset.revealed = 'true';
                        cardEl.style.opacity = '0.7';
                        cardEl.style.border = '3px solid #F17BAB';
                    }
                }
                
            } catch (err) {
                console.error('Ошибка вскрытия карты:', err);
                alert('Не удалось вскрыть карту');
            }
        }*/
        
        // Обновление при вскрытии карты другим игроком через WebSocket
        function updateRevealedCard(playerUuidFromEvent, openCard) {
            if (playerUuidFromEvent !== playerUuid) return;
            const label = CARD_TYPE_TO_LABEL[openCard.cardType];
            if (!label) return;
            
            const cardEl = findCardByLabel(profileContainer, label, true);
            const valueEl = cardEl?.querySelector('.profile-card-value');
            
            if (valueEl && !valueEl.dataset.revealed) {
                valueEl.textContent = openCard.name;
                valueEl.dataset.revealed = 'true';
                cardEl.style.opacity = '0.7';
                cardEl.style.border = '3px solid #F17BAB';
            }
        }
        
        // Таймер и индикатор хода
        let timerInterval = null;
        let currentTurnPlayerUuid = null;

        // Получение текущего игрока для хода
        async function fetchCurrentTurn() {
            try {
                const res = await fetch('/api/game/moved_player', {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const data = await res.json();
                console.log('Текущий ход (данные с сервера):', data);
                
                if (data && data.uuid) {
                    // Обновляем индикатор хода
                    updateTurnIndicator(data.uuid, 60);
                    
                    // Блокируем/разблокируем карты
                    const isMyTurn = data.uuid == playerUuid;
                    toggleCardsLock(!isMyTurn);
                    console.log('isMyTurn:', isMyTurn, 'playerUuid:', playerUuid, 'currentUuid:', data.uuid);
                }
                
                return data;
            } catch (err) {
                console.error('Ошибка получения текущего хода:', err);
            }
        }

        // Блокировка/разблокировка карт
        function toggleCardsLock(locked) {
            const cards = document.querySelectorAll('.profile-card');
            console.log('Блокировка карт:', locked);
            cards.forEach(card => {
                if (locked) {
                    card.style.opacity = '0.5';
                    card.style.pointerEvents = 'none';
                    card.style.cursor = 'not-allowed';
                } else {
                    card.style.opacity = '1';
                    card.style.pointerEvents = 'auto';
                    card.style.cursor = 'pointer';
                }
            });
        }

        function updateTurnIndicator(currentPlayerUuid, timeLeft) {
            const turnText = container.querySelector('.profile-turn-text');
            const timerText = container.querySelector('.profile-timer-text');
            const turnBadge = container.querySelector('.profile-turn-badge');
            
            const isMyTurn = currentPlayerUuid == playerUuid;
            console.log('updateTurnIndicator - текущий игрок:', currentPlayerUuid, 'мой UUID:', playerUuid, 'мой ход:', isMyTurn);
            
            // Если сменился игрок - перезапускаем таймер
            if (currentTurnPlayerUuid !== currentPlayerUuid) {
                console.log('Смена хода! Был:', currentTurnPlayerUuid, 'Стал:', currentPlayerUuid);
                currentTurnPlayerUuid = currentPlayerUuid;
                if (timerInterval) clearInterval(timerInterval);
                startTimer(timeLeft || 60);
            }
            
            if (turnText) {
                turnText.textContent = isMyTurn ? 'Ваш ход' : 'Ход другого игрока';
                turnText.style.color = isMyTurn ? '#FE5499' : '#999';
            }
            
            if (timerText && timeLeft !== undefined) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (turnBadge) {
                turnBadge.style.background = isMyTurn ? '#FFFFFF' : '#DADADA';
                turnBadge.style.borderColor = isMyTurn ? '#FFCBE5' : '#999';
            }
        }

        function startTimer(initialTime = 60) {
            if (timerInterval) clearInterval(timerInterval);
            
            let timeLeft = initialTime;
            console.log('Запуск таймера с начальным временем:', initialTime);
            
            // Обновляем таймер на UI
            const timerText = container.querySelector('.profile-timer-text');
            if (timerText) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            
            timerInterval = setInterval(() => {
                timeLeft--;
                
                // Обновляем таймер на UI
                if (timerText) {
                    const minutes = Math.floor(timeLeft / 60);
                    const seconds = timeLeft % 60;
                    timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    console.log('Время вышло для игрока:', currentTurnPlayerUuid);
                    // Можно отправить событие на сервер
                    fetch('/api/game/timeout', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' }
                    }).catch(err => console.error(err));
                }
            }, 1000);
        }

        // Периодически проверяем, чей ход
        const turnCheckInterval = setInterval(() => {
            if (document.querySelector('.profile-container')) {
                fetchCurrentTurn();
            } else {
                clearInterval(turnCheckInterval);
            }
        }, 3000);
        
        // Функция для обновления активной иконки профиля 
        function setActiveIcon(container, activeClass, iconClass) {
            const icons = container.querySelectorAll(`.${iconClass}`);
            icons.forEach(icon => {
                icon.classList.remove('active');  // удаляем класс active у всех
            });
            
            const activeIcon = container.querySelector(`.${activeClass}`);
            if (activeIcon) {
                activeIcon.classList.add('active');  // добавляем класс active активной иконке
            }
        }
        
        // Иконка "Все игроки" - переход на cards-all-players
        container.querySelector('.icon-center')?.addEventListener('click', () => {
            console.log('переход на cards-all-players');
            if (timerInterval) clearInterval(timerInterval);  // Останавливаем таймер
            loadPage('cards-all-players.html', container);
        });
        
        // Иконка "Профиль"  -  текущая страница, просто подсвечиваем
        container.querySelector('.icon-right')?.addEventListener('click', () => {
            console.log('уже на странице профиля');
            setActiveIcon(container,'icon-right', 'profile-icon');
        });
        
        // Иконка "Выход" - подтверждение выхода
        container.querySelector('.icon-left')?.addEventListener('click', () => {
            if (confirm('Покинуть комнату?')) {
                if (timerInterval) clearInterval(timerInterval);
                if (socket) socket.disconnect();
                sessionStorage.clear();
                loadPage('main-page-content.html', container);
            }
        });
        
        // При загрузке: активируем вкладку "me"
        // Вызываем после того, как страница вставлена в вёрстку
        setTimeout(() => {
            setActiveIcon(container,'icon-right', 'profile-icon');
            console.log('активирована вкладка "me"');
        }, 100);
        
        // загрузка карт и таймер 
        //используем глобальную функцию с задержкой
        setTimeout(() => {
            console.log('Загружаем карты через loadProfileCardsManually');
            if (typeof loadProfileCardsManually === 'function') {
                loadProfileCardsManually();
            } else {
                console.warn('loadProfileCardsManually не найдена, используем локальную');
                loadProfileCards();
            }
        }, 200);

        // после загрузки карт, получаем текущего игрока для хода
        setTimeout(() => {
            fetchCurrentTurn();
        }, 500);

        // Обработчик клика по карточке
        function setupCardClickHandlers() {
            const cards = document.querySelectorAll('.profile-card');
            console.log('Найдено карт для обработчика:', cards.length);
            cards.forEach((card, index) => {
                card.addEventListener('click', async () => {
                    // Проверяем, что сейчас ход игрока
                    const isMyTurn = currentTurnPlayerUuid == playerUuid;
                    if (!isMyTurn) {
                        alert('Сейчас не ваш ход!');
                        return;
                    }
                    
                    // Отправляем запрос на вскрытие карты
                    const cardType = index + 1; // карты нумеруются с 1
                    console.log('Вскрытие карты типа:', cardType);
                    try {
                        const res = await fetch('/api/game/reveal-card', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cat_card: cardType })
                        });
                        
                        if (res.ok) {
                            console.log('Карта успешно вскрыта');
                            // Блокируем карты после вскрытия (ход перейдёт другому)
                            toggleCardsLock(true);
                        } else {
                            const error = await res.json();
                            alert(error.error || 'Ошибка при вскрытии карты');
                        }
                    } catch (err) {
                        console.error('Ошибка:', err);
                        alert('Не удалось вскрыть карту');
                    }
                });
            });
        }

        // Вызвать после создания карт
        setTimeout(() => {
            setupCardClickHandlers();
        }, 800);

        console.log('Profile готово');
    }
    
    // ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ ВСЕХ ИГРОКОВ (cards-all-players.html) =====
    const cardsAllContainer = container.querySelector('.cards-all-container, [data-page="cards-all-players"]');

    if (cardsAllContainer) {
        console.log('cards-all-players загружен');
        
        // Данные из sessionStorage берутся
        const roomCode = sessionStorage.getItem('currentRoomCode');
        const playerUuid = sessionStorage.getItem('currentPlayerUuid');
        const currentPlayer = sessionStorage.getItem('currentPlayer');
        const project = JSON.parse(sessionStorage.getItem('project') || '{}');
        const maxPlayers = parseInt(sessionStorage.getItem('maxPlayers')) || 4;
        
        // название проекта 
        const titleEl = container.querySelector('.cards-title');
        if (titleEl && project.name) {
            titleEl.textContent = project.name;
        }
        
        // счётчик игроков "x из y" 
        const votedCountEl = container.querySelector('.voted-count');
        if (votedCountEl) {
            votedCountEl.textContent = `0 из ${maxPlayers}`;  // Пока 0, обновится после загрузки
        }
        
        // модальное окно (на знак вопроса)
        const questionBtn = container.querySelector('.group-three');
        const projectOverlay = container.querySelector('.project-overlay');
        let isOverlayOpen = false;
        
        if (questionBtn && projectOverlay) {
            questionBtn.style.cursor = 'pointer';
            
            questionBtn.onclick = () => {
                isOverlayOpen = !isOverlayOpen;
                
                if (isOverlayOpen) {
                    projectOverlay.style.display = 'flex';
                    questionBtn.style.transition = 'all 0.2s ease';
                    questionBtn.style.transform = 'translateY(550px)';
                    questionBtn.style.zIndex = '100';
                    
                    const descEl = container.querySelector('.project-description');
                    if (descEl && project.description) {
                        descEl.textContent = project.description;
                    }
                } else {
                    projectOverlay.style.display = 'none';
                    questionBtn.style.transform = 'translateY(0)';
                }
            };
            
            projectOverlay.onclick = (e) => {
                if (e.target === projectOverlay) {
                    isOverlayOpen = false;
                    projectOverlay.style.display = 'none';
                    questionBtn.style.transform = 'translateY(0)';
                }
            };
        }
        
        // карта типов карт
    /* const CARD_TYPE_TO_LABEL = {
            1: 'Роль',
            2: '',
            3: 'Черта характера',
            4: 'Качество',
            5: 'Особенность',
            6: 'Языки и среды'
        };*/
        
        // загрузка и отрисовка игроков 
        let playersData = [];
        
        async function loadPlayersList() {
            if (IS_TEST_MODE) {
                playersData = [
                    { uuid: 'test-1', nickname: currentPlayer || 'МойНик', be_creator: true, hand: [] },
                    { uuid: 'test-2', nickname: 'РандомНик1', be_creator: false, hand: [] },
                    { uuid: 'test-3', nickname: 'РандомНик2', be_creator: false, hand: [] },
                    { uuid: 'test-4', nickname: 'РандомНик3', be_creator: false, hand: [] }
                ];
                renderPlayersList(playersData);
                return;
            }
            
            try {
                const res = await fetch(`/api/room/players?code=${roomCode}`, {
                    credentials: 'include'
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const data = await res.json();
                playersData = data.players || [];
                
                if (votedCountEl) {
                    votedCountEl.textContent = `${playersData.length} из ${maxPlayers}`;
                }
                
                renderPlayersList(playersData);
                
            } catch (err) {
                console.error('Ошибка загрузки игроков:', err);
            }
        }
        
        function renderPlayersList(players) {
            const playersContainer = container.querySelector('.players-cards-container');
            if (!playersContainer) return;
            
            playersContainer.innerHTML = '';
            
            players.forEach(player => {
                const playerBlock = document.createElement('div');
                playerBlock.className = 'player-card-block';
                playerBlock.dataset.playerUuid = player.uuid;
                
                const revealedCards = player.hand?.filter(c => c.isOpen) || [];
                
                let cardsHTML = '';
                for (let type = 1; type <= 6; type++) {
                    const label = CARD_TYPE_TO_LABEL[type];
                    const revealedCard = revealedCards.find(c => c.cardType === type);
                    const value = revealedCard ? revealedCard.name : '?';
                    
                    cardsHTML += `
                        <div class="mini-card">
                            <div class="mini-card-label">${label}</div>
                            <div class="mini-card-value">${value}</div>
                        </div>
                    `;
                }
                
                playerBlock.innerHTML = `
                    <div class="player-name">${player.nickname}</div>
                    <div class="player-cards-grid">
                        ${cardsHTML}
                    </div>
                `;
                
                // клик по нику - показать/скрыть карты 
                const nameEl = playerBlock.querySelector('.player-name');
                const cardsGrid = playerBlock.querySelector('.player-cards-grid');
                
                if (nameEl && cardsGrid) {
                    nameEl.style.cursor = 'pointer';
                    nameEl.onclick = () => {
                        if (cardsGrid.style.display === 'none') {
                            cardsGrid.style.display = 'grid';
                            nameEl.style.color = '#FE5499';
                        } else {
                            cardsGrid.style.display = 'none';
                            nameEl.style.color = '#7F375A';
                        }
                    };
                }
                
                playersContainer.appendChild(playerBlock);
            });
        }
        
        // Используем глобальный socket
        if (!IS_TEST_MODE && socket && playerUuid && roomCode) {
            socket.emit('register', { playerUuid, roomCode });
            
            if (!window._cardsListenersAdded) {
                socket.on('reveal-card', (data) => {
                    console.log('карта вскрыта:', data);
                    updateRevealedCardInAllPlayers(data.player.uuid, data.openCard);
                });
                
                socket.on('turn-update', (data) => {
                    updateTurnIndicator(data.currentPlayerUuid, data.timeLeft);
                });
                
                window._cardsListenersAdded = true;
            }
        }
        
        function updateRevealedCardInAllPlayers(playerUuid, openCard) {
        //  if (playerUuid !== playerUuid) return; //на себя
            const playerBlock = container.querySelector(`.player-card-block[data-player-uuid="${playerUuid}"]`);
            if (!playerBlock) return;
            
            const label = CARD_TYPE_TO_LABEL[openCard.cardType];
            if (!label) return;
            
            const cards = playerBlock.querySelectorAll('.mini-card');
            
            for (const card of cards) {
                const labelEl = card.querySelector('.mini-card-label');
                if (labelEl && labelEl.textContent.trim() === label) {
                    const valueEl = card.querySelector('.mini-card-value');
                    if (valueEl) {
                        valueEl.style.transition = 'all 0.3s';
                        valueEl.textContent = openCard.name;
                        valueEl.style.color = '#F17BAB';
                        valueEl.style.fontWeight = 'bold';
                        valueEl.dataset.revealed = 'true';
                    }
                    break;
                }
            }
        }
        
        // таймер и индикатор хода
        let timerInterval = null;
        
        function updateTurnIndicator(currentPlayerUuid, timeLeft) {
            const turnText = container.querySelector('.cards-turn-text');
            const timerText = container.querySelector('.cards-timer-text');
            const turnBadge = container.querySelector('.cards-turn-badge');
            
            const isMyTurn = currentPlayerUuid == playerUuid;
            
            if (turnText) {
                turnText.textContent = isMyTurn ? 'Ваш ход' : 'Ход другого игрока';
                turnText.style.color = isMyTurn ? '#FE5499' : '#999';
            }
            
            if (timerText && timeLeft !== undefined) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (turnBadge) {
                turnBadge.style.background = isMyTurn ? '#FFFFFF' : '#DADADA';
                turnBadge.style.borderColor = isMyTurn ? '#FFCBE5' : '#999';
            }
        }
        
        function startTimer(initialTime = 60) {
            if (timerInterval) clearInterval(timerInterval);
            
            let timeLeft = initialTime;
            
            timerInterval = setInterval(() => {
                timeLeft--;
                updateTurnIndicator(playerUuid, timeLeft);
                
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    console.log('Время вышло!');
                    // Можно отправить событие на сервер о том, что время вышло
                    fetch('/api/game/timeout', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' }
                    }).catch(err => console.error(err));
                }
            }, 1000);
        }
        
        // активная вкладка users
    /* function setActiveIcon(activeClass) {
            const icons = container.querySelectorAll('.cards-icon');
            icons.forEach(icon => {
                icon.style.border = 'none';
                icon.style.boxShadow = 'none';
                icon.style.borderRadius = '0';
            });
            
            const activeIcon = container.querySelector(`.${activeClass}`);
            if (activeIcon) {
                activeIcon.style.border = '3px solid #F17BAB';
                activeIcon.style.boxShadow = '0 0 10px rgba(241, 123, 171, 0.5)';
                activeIcon.style.borderRadius = '50%';
            }
        }*/
        
        setTimeout(() => {
            setActiveIcon(container,'icon-center','cards-icon');
        }, 100);
        
        // Навигация 
        container.querySelector('.icon-right')?.addEventListener('click', () => {
            if (timerInterval) clearInterval(timerInterval);
            loadPage('profile.html', container);
        });
        
        container.querySelector('.icon-center')?.addEventListener('click', () => {
            setActiveIcon(container,'icon-center', 'cards-icon');
        });
        
        container.querySelector('.icon-left')?.addEventListener('click', () => {
            if (confirm('Покинуть комнату?')) {
                if (timerInterval) clearInterval(timerInterval);
                if (socket) socket.disconnect();
                sessionStorage.clear();
                loadPage('main-page-content.html', container);
            }
        });
        
        // инициализация
        loadPlayersList();
        
        if (!IS_TEST_MODE && roomCode) {
            window.cardsAllInterval = setInterval(loadPlayersList, 3000);
        }
        
        console.log('Cards-all-players: логика инициализирована');
    }
    // ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ answers.html (создатель отвечает на вопросы) =====
    const answersContainer = container.querySelector('.answers-card, .answers-header');
    if (answersContainer) {
        console.log('Страница ответов загружена');

        // Флаги и переменные
        let currentQuestions = [];          // массив вопросов с опциями
        let userAnswers = {};               // { questionId: { selectedOptions: [], answerText, score, comment } }
        let allQuestionsAnswered = false;
        let submitButton = null;
        let submitEnabled = false;

        // Функция для рендеринга вопросов на основе данных от сервера
        function renderQuestions(questionsData) {
            // Очищаем контейнер, оставляя только заголовок и кнопку (если они есть)
            const container = document.querySelector('.container');
            let answersContent = container.querySelector('.answers-content');
            if (!answersContent) {
                answersContent = document.createElement('div');
                answersContent.className = 'answers-content';
                container.appendChild(answersContent);
            }
            answersContent.innerHTML = '';

            questionsData.forEach(q => {
                const card = document.createElement('div');
                card.className = 'answers-card';
                card.dataset.qid = q.id;
                card.innerHTML = `
                <div class="answers-question">${q.text}</div>
                <div class="answers-options"></div>
            `;
                const optionsContainer = card.querySelector('.answers-options');

                q.options.forEach(opt => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'answers-option';
                    optionDiv.dataset.value = opt.text;
                    optionDiv.dataset.score = opt.score;
                    optionDiv.dataset.comment = opt.comment;
                    optionDiv.innerHTML = `
                    <div class="answers-option-badge"></div>
                    <div class="answers-option-text">${opt.text}</div>
                `;
                    optionsContainer.appendChild(optionDiv);
                });

                answersContent.appendChild(card);
            });

            // Добавляем кнопку "Перейти к итогам", если её нет
            if (!submitButton) {
                const footer = container.querySelector('.answers-next-btn');
                if (footer) submitButton = footer;
                else {
                    submitButton = document.createElement('div');
                    submitButton.className = 'answers-next-btn';
                    submitButton.innerHTML = `
                    <div class="answers-next-badge"></div>
                    <div class="answers-next-text">Перейти к итогам</div>
                `;
                    container.appendChild(submitButton);
                }
            }

            // Инициализируем userAnswers
            userAnswers = {};
            questionsData.forEach(q => {
                userAnswers[q.id] = { selectedOptions: [], answerText: '', score: 0, comment: '' };
            });

            // Добавляем обработчики кликов на опции
            attachOptionHandlers();
        }

        function attachOptionHandlers() {
            const cards = document.querySelectorAll('.answers-card');
            cards.forEach(card => {
                const qid = parseInt(card.dataset.qid);
                const options = card.querySelectorAll('.answers-option');

                if (qid === 2) {
                    // Множественный выбор: toggle стиль
                    options.forEach(opt => {
                        opt.style.cursor = 'pointer';
                        opt.onclick = () => {
                            const isSelected = opt.classList.contains('selected');
                            if (isSelected) {
                                opt.classList.remove('selected');
                            } else {
                                opt.classList.add('selected');
                            }
                            updateAnswerForQuestion(qid);
                            checkAllQuestionsAnswered();
                        };
                    });
                } else {
                    // Одиночный выбор: при клике сбрасываем остальные
                    options.forEach(opt => {
                        opt.style.cursor = 'pointer';
                        opt.onclick = () => {
                            options.forEach(o => o.classList.remove('selected'));
                            opt.classList.add('selected');
                            updateAnswerForQuestion(qid);
                            checkAllQuestionsAnswered();
                        };
                    });
                }
            });
        }

        function updateAnswerForQuestion(qid) {
            const card = document.querySelector(`.answers-card[data-qid="${qid}"]`);
            if (!card) return;
            const selected = card.querySelectorAll('.answers-option.selected');
            const selectedData = Array.from(selected).map(opt => ({
                text: opt.querySelector('.answers-option-text').innerText,
                score: parseInt(opt.dataset.score),
                comment: opt.dataset.comment
            }));

            if (selectedData.length === 0) {
                userAnswers[qid] = { selectedOptions: [], answerText: '', score: 0, comment: '' };
                return;
            }

            let answerText = '';
            let totalScore = 0;
            let comments = [];

            if (qid === 2) {
                // Вопрос 2: все ли роли присутствуют
                const selectedRoles = selectedData.map(s => s.text);
                if (selectedRoles.length === 6) {
                    answerText = "Есть все 6 ролей";
                    comments = ["У нас полный комплект, каждый занимается своим делом"];
                } else {
                    answerText = selectedRoles.join(', ');
                    comments = selectedData.map(s => s.comment);
                }
                totalScore = selectedData.reduce((sum, s) => sum + s.score, 0);
            } else {
                // Остальные вопросы - одиночный выбор
                const data = selectedData[0];
                answerText = data.text;
                totalScore = data.score;
                comments = [data.comment];
            }

            userAnswers[qid] = {
                selectedOptions: selectedData,
                answerText: answerText,
                score: totalScore,
                comment: comments.join(', ')
            };
        }

        function checkAllQuestionsAnswered() {
            const totalQuestions = currentQuestions.length;
            let answeredCount = 0;
            for (let i = 1; i <= totalQuestions; i++) {
                if (userAnswers[i] && userAnswers[i].selectedOptions.length > 0) answeredCount++;
            }
            allQuestionsAnswered = (answeredCount === totalQuestions);

            if (submitButton) {
                if (allQuestionsAnswered) {
                    submitButton.classList.add('active');
                } else {
                    submitButton.classList.remove('active');
                }
            }
        }

        // Запрос вопросов через WebSocket
        if (!IS_TEST_MODE && socket && socket.connected) {
            socket.emit('give-answers');
            socket.on('manual-questions', (data) => {
                console.log('Получены ручные вопросы:', data);
                currentQuestions = data.questions;
                renderQuestions(currentQuestions);
            });

            // Обработчик активации кнопки после сохранения ответов (если нужно)
            socket.on('activate-result-button', () => {
                console.log('Получено событие activate-result-button');
                // Можно перейти на страницу отчёта или показать сообщение
                alert('Ответы сохранены! Теперь можно посмотреть итоговый отчёт.');
                // Например, перейти на страницу итогового отчёта
                loadPage('final-report.html', container);
            });
        } else if (IS_TEST_MODE) {
            // Тестовый режим: заглушка
            const mockQuestions = [
                { id: 1, text: "Соответствуют ли языки и среды теме проекта?", options: [
                        { text: "У всех разработчиков релевантные языки", score: 18, comment: "Пишем на том, что надо" },
                        { text: "У 1 разработчика нерелевантный язык", score: 3, comment: "Один герой осваивает новый стек" },
                        { text: "У 2+ разработчиков нерелевантные языки", score: 0, comment: "Жесть" }
                    ]},
                { id: 2, text: "Все ли роли присутствуют в команде?", options: [
                        { text: "Есть аналитик", score: 3, comment: "Аналитик положил бубен на стол" },
                        { text: "Есть тестировщик", score: 3, comment: "Пользователи больше не находят баги" },
                        { text: "Есть проектировщик", score: 3, comment: "Нарисовал схему на 15 страницах" },
                        { text: "Есть тех. Писатель", score: 3, comment: "Документация написана так, что её читают" },
                        { text: "Есть PM", score: 3, comment: "Дедлайны перестали быть мемами" },
                        { text: "Есть разработчик", score: 5, comment: "Код пишется, фичи работают" }
                    ]},
                { id: 3, text: "Есть ли в команде люди со странными особенностями, мешающими работе?", options: [
                        { text: "Нет странных особенностей", score: 6, comment: "Все адекватные люди" },
                        { text: "1 странная особенность", score: 2, comment: "Один «интересный» товарищ" },
                        { text: "2+ людей со странными особенностями", score: -1, comment: "Цирк" }
                    ]},
                { id: 4, text: "Есть ли в команде неподходящие для разработки роли?", options: [
                        { text: "Нет неподходящих ролей", score: 12, comment: "Все при деле" },
                        { text: "1 неподходящая роль", score: 6, comment: "«Я просто хочу помочь!»" },
                        { text: "2+ неподходящие роли", score: -12, comment: "Группа поддержки" }
                    ]},
                { id: 5, text: "Есть ли в команде человек с Лидерством?", options: [
                        { text: "Лидерство у PM", score: 6, comment: "Идеально" },
                        { text: "Лидерство у разработчика", score: 5, comment: "Задачи ставятся криво" },
                        { text: "Лидерство у кого-то еще", score: 3, comment: "Странно, но работает" },
                        { text: "Нет Лидера", score: -2, comment: "Самоорганизация" },
                        { text: "2+ Лидеров", score: -5, comment: "Митинги длятся дольше" }
                    ]}
            ];
            currentQuestions = mockQuestions;
            renderQuestions(mockQuestions);
        }

        // Обработчик кнопки "Перейти к итогам"
        if (submitButton) {
            submitButton.onclick = async () => {
                if (!allQuestionsAnswered) {
                    alert('Ответьте на все вопросы');
                    return;
                }
                // Формируем массив ответов
                const answersArray = [];
                for (let i = 1; i <= currentQuestions.length; i++) {
                    const ans = userAnswers[i];
                    if (ans && ans.selectedOptions.length > 0) {
                        answersArray.push({
                            questionId: i,
                            answerText: ans.answerText,
                            score: ans.score,
                            comment: ans.comment
                        });
                    }
                }
                console.log('Отправка ответов:', answersArray);
                if (IS_TEST_MODE) {
                    alert('Тестовый режим: ответы сохранены локально');
                    console.log('Mock save:', answersArray);
                    // В тестовом режиме можно перейти к отчёту
                    loadPage('final-report.html', container);
                    return;
                }
                try {
                    const res = await fetch('/api/game/final-answers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ answers: answersArray })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        console.log('Ответы сохранены:', data);
                        // Не переходим сразу, ждём события activate-result-button
                    } else {
                        const err = await res.json();
                        alert('Ошибка: ' + (err.error || 'Не удалось сохранить ответы'));
                    }
                } catch (err) {
                    console.error('Ошибка отправки:', err);
                    alert('Не удалось отправить ответы');
                }
            };
        }
    }
}