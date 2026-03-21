// ===== РЕЖИМ РАБОТЫ =====
const IS_TEST_MODE = false; // true - тестовый режим (без бэкенда), false - с бэкендом

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

// ===== Функция для генерации тестового кода комнаты (только для тестового режима) =====
function generateRoomCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// Выполнится, когда страница полностью загрузится (HTML, CSS..)
window.onload = function() {
    
    const container = document.querySelector('.container');
    
    // Загружаем главную страницу при старте
    loadPage('main-page-content.html', container);
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

                    fetch('http://localhost:3000/api/room/create', {
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

                    fetch('http://localhost:3000/api/room/join', {
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

                fetch(`http://localhost:3000/api/room/players?code=${roomCode}`, {
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
    
                                function checkCanStart() {
                                    fetch('http://localhost:3000/api/room/can-start', {
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

                                            // Меняем фон кнопки
                                            const startBg = startBtn.querySelector('.start-background');
                                            if (startBg) {
                                                startBg.style.background = '#F17BAB';
                                                startBg.style.border = '2px solid #7F375A';  
                                            }
                
                                            // Меняем цвет текста и добавляем обводку
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
                                                alert('Игра начинается!');
                                                loadPage('profile.html', container);
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
}