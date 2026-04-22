let socket = null;
let cardHandlersAdded = false;
let timerInterval = null;
let currentTurnPlayerUuid = null;
let currentSelectedCard = null;
let currentSelectedIndex = null; 
let isModalOpen = false;  

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

// ===== СОПОСТАВЛЕНИЕ ТИПОВ КАРТ =====
const CARD_TYPE_TO_LABEL = {
        1: 'Роль',
        2: 'Стаж',
        3: 'Черта характера',
        4: 'Качество',
        5: 'Особенность',
        6: 'Языки и среды'
    };

// Показывает всплывающее уведомление
function showToast(message, type = 'info') {
    const oldToast = document.querySelector('.custom-toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `custom-toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #F17BAB;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        font-family: 'Nunito', sans-serif;
        text-shadow: 1px 0 0 #7F375A, -1px 0 0 #7F375A, 0 1px 0 #7F375A, 0 -1px 0 #7F375A, 1px 1px 0 #7F375A, -1px -1px 0 #7F375A, 1px -1px 0 #7F375A, -1px 1px 0 #7F375A;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Обновление карты на странице всех игроков
function updateRevealedCardInAllPlayers(playerUuid, openCard) {
    console.log('updateRevealedCardInAllPlayers вызвана:', playerUuid, openCard);
    
    const targetUuid = String(playerUuid);
    const allBlocks = document.querySelectorAll('.player-card-block');
    console.log('Всего блоков игроков:', allBlocks.length);
    
    for (const block of allBlocks) {
        const blockUuid = block.getAttribute('data-player-uuid');
        if (String(blockUuid) === targetUuid) {
            // Ищем карту по data-card-index
            const cards = block.querySelectorAll('.mini-card');
            const targetCard = cards[openCard.index];
            
            if (targetCard) {
                const valueEl = targetCard.querySelector('.mini-card-value');
                if (valueEl && valueEl.textContent === '?') {
                    valueEl.textContent = openCard.name;
                    valueEl.style.color = '#F17BAB';
                    valueEl.style.fontWeight = 'bold';
                    valueEl.dataset.revealed = 'true';
                    console.log(`Обновлена карта индекс ${openCard.index} -> ${openCard.name}`);
                }
            } else {
                // fallback: ищем по лейблу
                const label = CARD_TYPE_TO_LABEL[openCard.cardType];
                if (label) {
                    for (const card of cards) {
                        const labelEl = card.querySelector('.mini-card-label');
                        if (labelEl && labelEl.textContent.trim() === label) {
                            const valueEl = card.querySelector('.mini-card-value');
                            if (valueEl && valueEl.textContent === '?') {
                                valueEl.textContent = openCard.name;
                                valueEl.style.color = '#F17BAB';
                                valueEl.style.fontWeight = 'bold';
                                console.log(`Обновлена карта ${label} -> ${openCard.name}`);
                            }
                            break;
                        }
                    }
                }
            }
            break;
        }
    }
}

//Показывает модальное окно подтверждения вскрытия карты
function showCardModal(callback, targetCard) {
    const modal = document.getElementById('cardModal');
    const yesBtn = document.getElementById('cardModalYes');
    
    if (!modal) {
        const result = confirm('Вскрыть карту?');
        callback(result);
        return;
    }
    
    // Позиционируем модальное окно поверх карточки
    if (targetCard) {
        const rect = targetCard.getBoundingClientRect();
        const containerRect = document.querySelector('.container').getBoundingClientRect();
        
        modal.style.position = 'absolute';
        modal.style.left = (rect.left - containerRect.left) + 'px';
        modal.style.top = (rect.top - containerRect.top-2) + 'px';
        modal.style.width = rect.width + 'px';
        modal.style.height = rect.height + 'px';
        modal.style.transform = 'translateX(-2px)';
    }
    
    modal.style.display = 'block';
    
    // Убираем старый обработчик, если есть
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
    
    const handleYes = () => {
        modal.style.display = 'none';
        callback(true);
    };
    
    newYesBtn.addEventListener('click', handleYes);
}

// Загружает карты текущего игрока с сервера
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

// Активирует иконку в нижней панели навигации
function setActiveIcon(container, activeClass, iconClass) {
    // Ищем иконки по всей странице
    const icons = document.querySelectorAll(`.${iconClass}`);
    icons.forEach(icon => {
        icon.classList.remove('active');
    });
    
    // Ищем активную иконку по классу (не по container)
    const activeIcon = document.querySelector(`.${activeClass}`);
    if (activeIcon) {
        activeIcon.classList.add('active');
    }
}

// Отрисовывает карты на странице профиля
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
    hand.forEach((card, idx) => {
        const label = CARD_TYPE_TO_LABEL[card.cardType];
        if (!label) {
            console.warn('Неизвестный тип карты:', card.cardType);
            return;
        }
        
        const cardDiv = document.createElement('div');
        cardDiv.className = 'profile-card';
        cardDiv.setAttribute('data-index', idx);
        
        // ВСЕГДА показываем название карты (свои карты видно полностью)
        const isOpen = card.isOpen === true;
        
        cardDiv.innerHTML = `
            <div class="profile-card-badge"></div>
            <div class="profile-card-label">${label}</div>
            <div class="profile-card-value">${card.name.replace(/\n/g, '<br>')}</div>
        `;
        
        if (isOpen) {
            cardDiv.classList.add('card-opened');
            cardDiv.style.background = '#FFCBE5';
            cardDiv.style.backgroundColor = '#FFCBE5';
            cardDiv.style.borderRadius = '50px';
            cardDiv.style.pointerEvents = 'none';
            cardDiv.style.opacity = '0.7';
            
            const valueEl = cardDiv.querySelector('.profile-card-value');
            if (valueEl) {
                valueEl.dataset.revealed = 'true';
            }
        }
        
        cardsContainer.appendChild(cardDiv);
        console.log(`Создана карта: ${label} -> ${card.name}`);
    });
}

// Генерирует случайный 6-значный код комнаты (только для тестового режима)
function generateRoomCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// Инициализирует приложение после полной загрузки страницы
window.onload = function() {
    
    const container = document.querySelector('.container');
    const roomCode = sessionStorage.getItem('currentRoomCode');
    const currentPlayer = sessionStorage.getItem('currentPlayer');

    // ===== ПОДКЛЮЧЕНИЕ WEBSOCKET ДЛЯ ВСЕХ ИГРОКОВ =====
    if (!IS_TEST_MODE && !socket) {
        socket = io({ withCredentials: true });
        
        // Глобальный обработчик для stop_timer
        socket.on('stop_timer', () => {
            console.log('Таймер остановлен (карта открыта вовремя)');
        });

        socket.on('connect', () => {
            console.log(`WebSocket подключен (id: ${socket.id})`);
            
            // Регистрируем игрока в комнате - берем актуальные данные из sessionStorage
            const playerUuid = sessionStorage.getItem('currentPlayerUuid');
            const currentRoomCode = sessionStorage.getItem('currentRoomCode'); // Берем заново!
            
            console.log('Данные для регистрации:', { playerUuid, currentRoomCode });
            
            if (playerUuid && currentRoomCode) {
                socket.emit('register', { playerUuid, roomCode: currentRoomCode });
                console.log('Зарегистрирован в комнате:', currentRoomCode);

                setTimeout(() => {
                    if (typeof fetchCurrentTurn === 'function') {
                        fetchCurrentTurn();
                    }
                }, 500);

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

        socket.on('complete-round', (data) => {
            console.log('Раунд завершен:', data);
            showToast('Пора обсудить, кого выгнать, и проголосовать', 'warning');
            
            // Останавливаем таймер вскрытия карт
            if (socket && socket.connected) {
                socket.emit('stop_timer');      // останавливаем текущий таймер (60 сек)
                socket.emit('start_timer5');    // запускаем таймер голосования (5 мин)
            }
            
            // Переход на страницу голосования
            loadPage('vote.html', container);
        });

        socket.on('update_timer5', (data) => {
            console.log('Обновление таймера голосования:', data.timeLeft);
            const timerText = document.querySelector('.vote-timer-text, .profile-timer-text');
            if (timerText && data.timeLeft !== undefined) {
                const minutes = Math.floor(data.timeLeft / 60);
                const seconds = data.timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });

        socket.on('timer5_end', (data) => {
            console.log('Таймер голосования закончился:', data);
            showToast('Время голосования истекло!', 'warning');
        });

        socket.on('force-reveal-card', (data) => {
            console.log('force-reveal-card:', data);
            
            // Сохраняем состояние в sessionStorage для любого принудительного вскрытия
            const revealedCards = JSON.parse(sessionStorage.getItem('revealedCards') || '{}');
            revealedCards[data.openCard.index] = true;
            sessionStorage.setItem('revealedCards', JSON.stringify(revealedCards));
            console.log('💾 Сохранено в sessionStorage:', revealedCards); 
            
            // Показываем уведомление
            showToast(data.message || `Карта "${data.openCard.name}" вскрыта принудительно!`, 'warning');
            
            // Если страница профиля открыта - обновляем визуал
            if (document.querySelector('.profile-container')) {
                const playerUuid = sessionStorage.getItem('currentPlayerUuid');
                if (String(data.player.uuid) === String(playerUuid)) {
                    const cardEl = document.querySelector(`.profile-card[data-index="${data.openCard.index}"]`);
                    if (cardEl) {
                        cardEl.style.background = '#FFCBE5';
                        cardEl.style.backgroundColor = '#FFCBE5';
                        cardEl.style.borderRadius = '50px';
                        cardEl.classList.add('card-opened');
                        cardEl.style.pointerEvents = 'none';
                        cardEl.style.opacity = '0.7';
                        cardEl.style.cursor = 'default';
                    }
                }
            }
            
            // Обновляем страницу всех игроков, если она открыта
            if (typeof updateRevealedCardInAllPlayers === 'function') {
                updateRevealedCardInAllPlayers(data.player.uuid, data.openCard);
            }
        });
    }
    
    // проверка на то что игрок уже является членом комнаты
    if (roomCode && currentPlayer) {
        loadPage('player-list.html', container);
    } else {
        loadPage('main-page-content.html', container);
    }
}

// Загружает HTML страницу в контейнер
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

            // Сбрасываем активные иконки при загрузке новой страницы
            document.querySelectorAll('.icon-left, .icon-center, .icon-right').forEach(icon => {
                icon.classList.remove('active');
            });
            
            // Добавляем обработчики
            addPageHandlers(container);
        })
        .catch(error => {
            console.error('Ошибка загрузки:', error);
            container.innerHTML = '<h1>404</h1><p>Страница не найдена</p>';
        });
}

// Добавляет обработчики событий для загруженной страницы
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


                            sessionStorage.setItem('isCreator', 'true');// для создателя
                            sessionStorage.setItem('currentRound', '1');
                            const initialPlayers = parseInt(data.maxPlayers);
                            const targetTeamSize = Math.floor(initialPlayers / 2);
                            const roundsCount = initialPlayers - targetTeamSize;

                            sessionStorage.setItem('maxRounds', roundsCount);
                            sessionStorage.setItem('targetTeamSize', targetTeamSize);

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
                            // Добавить сохранение проекта
                            alert('Вы успешно вошли в комнату!');

                            // 1. Сначала сохраняем всё в sessionStorage
                            sessionStorage.setItem('currentRoomCode', data.roomId);
                            sessionStorage.setItem('currentPlayer', data.nickname);
                            sessionStorage.setItem('maxPlayers', data.maxPlayers);
                            sessionStorage.setItem('currentPlayerUuid', data.playerId);
                            
                            // 2. Сохраняем проект (если есть)
                            if (data.project) {
                                sessionStorage.setItem('project', JSON.stringify(data.project));
                            }
                            //инициализация раундов
                            sessionStorage.setItem('currentRound', '1');
                            const initialPlayers = parseInt(data.maxPlayers);
                            const targetTeamSize = Math.floor(initialPlayers / 2);
                            const roundsCount = initialPlayers - targetTeamSize;

                            sessionStorage.setItem('maxRounds', roundsCount);
                            sessionStorage.setItem('targetTeamSize', targetTeamSize);
                            
                            // 3. Потом переходим на страницу
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
     
    // ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ СПИСКА ИГРОКОВ (player-list.html)=====
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
            console.log('Зарегистрирован в комнате:', roomCode);
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

    if (isProfilePage) {
        console.log('страница профиля загружена');
        
        // получаем данные из sessionStorage
        const roomCode = sessionStorage.getItem('currentRoomCode');
        const playerUuid = sessionStorage.getItem('currentPlayerUuid');
        const currentPlayer = sessionStorage.getItem('currentPlayer');
        const maxPlayers = parseInt(sessionStorage.getItem('maxPlayers')) || 4;//если ложь то по умолчанию 4 тк мин 4
        
        // Состояние для таймера и хода
        let currentTurnPlayerUuid = null;   // Чей сейчас ход (UUID)
        let currentSelectedCard = null;     // Текущая выбранная карта
        let currentSelectedIndex = null;    // Индекс текущей выбранной карты
        let isModalOpen = false;            // Флаг открытого модального окна
        let timerInterval = null;           // ID таймера (чтобы остановить)

        // Отображаем имя текущего игрока
        const nickEl = container.querySelector('.profile-nick-text');
        if (nickEl && currentPlayer) {
            nickEl.textContent = currentPlayer;
        }
        
        // Регистрация в WebSocket
        if (!IS_TEST_MODE && socket && roomCode && playerUuid) {
            // Регистрируемся в комнате
            socket.emit('register', { playerUuid, roomCode });
            console.log('зарегистрирован в сокете:', playerUuid, roomCode);
        }
        
        // Получение текущего хода
        async function fetchCurrentTurn() {
            if (IS_TEST_MODE) return;

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
                }
                
                return data;
            } catch (err) {
                console.error('Ошибка получения текущего хода:', err);
            }
        }

        // Индикатор хода и таймер
        function updateTurnIndicator(currentPlayerUuid, timeLeft) {
            const turnText = container.querySelector('.profile-turn-text');
            const timerText = container.querySelector('.profile-timer-text');
            const turnBadge = container.querySelector('.profile-turn-badge');
            
            const isMyTurn = String(currentPlayerUuid) === String(playerUuid);
            console.log('updateTurnIndicator - мой ход?', isMyTurn, 'current:', currentPlayerUuid, 'мой:', playerUuid);

            // Обновляем текст статуса хода
            if (turnText) {
                turnText.textContent = isMyTurn ? 'Ваш ход' : 'Ход другого игрока';
                turnText.style.color = isMyTurn ? '#FE5499' : '#999';
            }

            // Если сменился игрок
            if (currentTurnPlayerUuid !== currentPlayerUuid) {
                console.log('Смена хода! Был:', currentTurnPlayerUuid, 'Стал:', currentPlayerUuid);
                currentTurnPlayerUuid = currentPlayerUuid;
                
                // Управление блокировкой/разблокировкой карт
                const allCards = document.querySelectorAll('.profile-card');
                
                if (isMyTurn) {
                    // Мой ход - разблокируем только НЕоткрытые карты
                    console.log('Мой ход, разблокируем карты');
                    allCards.forEach(card => {
                        if (!card.classList.contains('card-opened')) {
                            card.style.opacity = '1';
                            card.style.pointerEvents = 'auto';
                            card.style.cursor = 'pointer';
                        }
                    });
                    
                    // Запускаем серверный таймер
                    if (socket && socket.connected) {
                        console.log('Запуск серверного таймера (мой ход)');
                        socket.emit('start_timer');
                    }
                } else {
                    // Не мой ход - блокируем все НЕоткрытые карты
                    console.log('Не мой ход, блокируем карты');
                    allCards.forEach(card => {
                        if (!card.classList.contains('card-opened')) {
                            card.style.pointerEvents = 'none';
                            card.style.opacity = '0.6';
                        }
                    });
                }
            }
            
            // Обновляем таймер
            if (timerText && timeLeft !== undefined) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Подсветка при остатке 10 секунд
                if (isMyTurn && timeLeft <= 10) {
                    timerText.style.color = '#ff0000';
                    timerText.style.fontWeight = 'bold';
                } else {
                    timerText.style.color = '';
                    timerText.style.fontWeight = '';
                }
            }
            
            // Обновляем бейдж
            if (turnBadge) {
                turnBadge.style.background = isMyTurn ? '#FFFFFF' : '#DADADA';
                turnBadge.style.borderColor = isMyTurn ? '#FFCBE5' : '#999';
            }
        }

        // Обновление вскрытой карты на странице профиля
        function updateRevealedCard(playerUuidFromEvent, openCard) {
            console.log('updateRevealedCard вызвана');
            console.log('playerUuidFromEvent:', playerUuidFromEvent, 'тип:', typeof playerUuidFromEvent);
            console.log('playerUuid (мой):', playerUuid, 'тип:', typeof playerUuid);
            
            // Обновляем только если это карта текущего игрока
            if (String(playerUuidFromEvent) !== String(playerUuid)) {
                console.log('Событие для другого игрока, пропускаем обновление профиля');
                return;
            }
            
            console.log('Это моя карта! Обновляем на странице профиля...', openCard);
            
            // Ищем карту по data-index (индекс в массиве карт)
            let cardEl = document.querySelector(`.profile-card[data-index="${openCard.index}"]`);
            
            // Если не нашли по data-index, ищем по лейблу
            if (!cardEl && openCard.cardType) {
                const label = CARD_TYPE_TO_LABEL[openCard.cardType];
                if (label) {
                    const cards = document.querySelectorAll('.profile-card');
                    for (const card of cards) {
                        const labelEl = card.querySelector('.profile-card-label');
                        if (labelEl && labelEl.textContent.trim() === label) {
                            cardEl = card;
                            break;
                        }
                    }
                }
            }
            
            if (cardEl) {
                // На странице профиля название карты уже видно, меняем только визуал
                cardEl.style.background = '#FFCBE5';
                cardEl.style.backgroundColor = '#FFCBE5';
                cardEl.style.borderRadius = '50px';
                cardEl.classList.add('card-opened');
                cardEl.style.pointerEvents = 'none';
                cardEl.style.opacity = '0.7';
                cardEl.style.cursor = 'default';

                // Сохраняем состояние в sessionStorage
                const revealedCards = JSON.parse(sessionStorage.getItem('revealedCards') || '{}');
                revealedCards[openCard.index] = true;
                sessionStorage.setItem('revealedCards', JSON.stringify(revealedCards));
                
                console.log(`Карта "${openCard.name}" на странице профиля обновлена (фон изменён)`);
            } else {
                console.error(`Карта с индексом ${openCard.index} не найдена на странице профиля`);
            }
        }

        // Обработчик принудительного вскрытия
        function handleForceRevealCard(data) {
            console.log('Принудительное вскрытие карты:', data);
            
            // Показываем уведомление
            showToast(data.message || `Карта "${data.openCard.name}" вскрыта принудительно!`, 'warning');
            
            // Обновляем карту на странице профиля (если это карта текущего игрока)
            if (String(data.player.uuid) === String(playerUuid)) {
                // Ищем карту по индексу
                let cardEl = document.querySelector(`.profile-card[data-index="${data.openCard.index}"]`);
                
                if (!cardEl && data.openCard.cardType) {
                    const label = CARD_TYPE_TO_LABEL[data.openCard.cardType];
                    if (label) {
                        const cards = document.querySelectorAll('.profile-card');
                        for (const card of cards) {
                            const labelEl = card.querySelector('.profile-card-label');
                            if (labelEl && labelEl.textContent.trim() === label) {
                                cardEl = card;
                                break;
                            }
                        }
                    }
                }
                
                if (cardEl) {
                    cardEl.style.background = '#FFCBE5';
                    cardEl.style.backgroundColor = '#FFCBE5';
                    cardEl.style.borderRadius = '50px';
                    cardEl.classList.add('card-opened');
                    cardEl.style.pointerEvents = 'none';
                    cardEl.style.opacity = '0.7';
                    cardEl.style.cursor = 'default';

                    const revealedCards = JSON.parse(sessionStorage.getItem('revealedCards') || '{}');
                    revealedCards[data.openCard.index] = true;
                    sessionStorage.setItem('revealedCards', JSON.stringify(revealedCards));
                    
                    console.log(`Принудительно открыта карта: ${data.openCard.name}`);
                }
            }
            
            // Обновляем на странице всех игроков (если она открыта)
            if (typeof updateRevealedCardInAllPlayers === 'function') {
                updateRevealedCardInAllPlayers(data.player.uuid, data.openCard);
            }
        }

        // Обработчик окончания таймера
        function handleTimerEnd(data) {
            console.log('Таймер закончился:', data);
            showToast('Время вышло! Ход переходит другому игроку', 'warning');
            
            // Запрашиваем новый ход
            fetchCurrentTurn();
        }

        // Обновление таймера
        function handleUpdateTimer(data) {
            const timerText = container.querySelector('.profile-timer-text');
            if (timerText && data.timeLeft !== undefined) {
                const minutes = Math.floor(data.timeLeft / 60);
                const seconds = data.timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Подсветка при остатке 10 секунд
                const isMyTurn = String(currentTurnPlayerUuid) === String(playerUuid);
                if (isMyTurn && data.timeLeft <= 10) {
                    timerText.style.color = '#ff0000';
                    timerText.style.fontWeight = 'bold';
                } else {
                    timerText.style.color = '';
                    timerText.style.fontWeight = '';
                }
            }
        }

        // Настройка WEBSOCKET обработчиков (только для профиля)
        if (!IS_TEST_MODE && socket) {
            // Удаляем старые обработчики, чтобы не дублировать
            socket.off('reveal-card');
            //socket.off('force-reveal-card');
            socket.off('timer_end');
            socket.off('update_timer');
            socket.off('turn-update');
        
            // Добавляем новые
            socket.on('reveal-card', (data) => {
                console.log('reveal-card событие на profile:', data);
                updateRevealedCard(data.player.uuid, data.openCard);
                
                // Также обновляем на странице всех игроков
                if (typeof updateRevealedCardInAllPlayers === 'function') {
                    updateRevealedCardInAllPlayers(data.player.uuid, data.openCard);
                }
            });
            

            socket.on('force-reveal-card', handleForceRevealCard);
            socket.on('timer_end', handleTimerEnd);
            socket.on('update_timer', handleUpdateTimer);
            socket.on('turn-update', (data) => {
                console.log('turn-update на profile:', data);
                updateTurnIndicator(data.currentPlayerUuid, data.timeLeft);
            });
        }

        // Настройка кликов по картам
        function setupCardClickHandlers() {
            const cards = document.querySelectorAll('.profile-card');
            console.log('Найдено карт для обработчика:', cards.length);
            
            if (cards.length === 0) {
                console.log('Карты ещё не созданы, повторная попытка через 500ms');
                setTimeout(setupCardClickHandlers, 500);
                return;
            }
            
            cards.forEach((card, index) => {
                // Удаляем старый обработчик, если есть
                const newCard = card.cloneNode(true);
                card.parentNode.replaceChild(newCard, card);
                
                newCard.addEventListener('click', () => {
                    // 1. Проверяем WebSocket соединение
                    if (!IS_TEST_MODE && (!socket || !socket.connected)) {
                        console.error('WebSocket не подключен');
                        showToast('Потеряно соединение с сервером. Обновите страницу.', 'error');
                        return;
                    }
                    
                    // 2. Проверяем, что сейчас ход игрока
                    const isMyTurn = String(currentTurnPlayerUuid) === String(playerUuid);
                    if (!isMyTurn) {
                        showToast('Сейчас не ваш ход!', 'warning');
                        return;
                    }
                    
                    // 3. Проверяем, что карта ещё не вскрыта
                    if (newCard.classList.contains('card-opened')) {
                        showToast('Эта карта уже вскрыта', 'info');
                        return;
                    }
                    
                    // Сохраняем текущую выбранную карту
                    currentSelectedCard = newCard;
                    currentSelectedIndex = index;
                    
                    // Если модальное окно уже открыто - обновляем его позицию
                    if (isModalOpen) {
                        updateModalPosition(currentSelectedCard);
                        console.log(`Переключено на карту ${index + 1}`);
                        return;
                    }
                    
                    // Открываем модальное окно
                    isModalOpen = true;
                    showCardModal(async (confirmed) => {
                        isModalOpen = false;
                        
                        if (!confirmed) {
                            console.log('Вскрытие карты отменено');
                            currentSelectedCard = null;
                            currentSelectedIndex = null;
                            return;
                        }
                        
                        // Вскрываем выбранную карту
                        if (currentSelectedIndex !== null) {
                            const cardType = currentSelectedIndex + 1;
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
                                    // Визуально блокируем карту сразу (сервер подтвердит через WebSocket)
                                    currentSelectedCard.style.background = '#FFCBE5';
                                    currentSelectedCard.style.backgroundColor = '#FFCBE5';
                                    currentSelectedCard.style.borderRadius = '50px';
                                    currentSelectedCard.classList.add('card-opened');
                                    currentSelectedCard.style.pointerEvents = 'none';
                                    currentSelectedCard.style.opacity = '0.7';
                                } else {
                                    const error = await res.json();
                                    console.error(error.error || 'Ошибка при вскрытии карты');
                                    showToast(error.error || 'Не удалось вскрыть карту', 'error');
                                }
                            } catch (err) {
                                console.error('Ошибка:', err);
                                showToast('Не удалось вскрыть карту. Проверьте соединение.', 'error');
                            }
                        }
                        
                        currentSelectedCard = null;
                        currentSelectedIndex = null;
                    }, currentSelectedCard);
                });
                
                // Устанавливаем data-index
                newCard.setAttribute('data-index', index);
            });
        }

        // Подстраивает модальное окно под позицию выбранной карты (накладывает поверх)
        function updateModalPosition(targetCard) {
            const modal = document.getElementById('cardModal');
            if (!modal || modal.style.display !== 'block') return;
            
            const rect = targetCard.getBoundingClientRect();
            const containerRect = document.querySelector('.container').getBoundingClientRect();
            
            modal.style.position = 'absolute';
            modal.style.left = (rect.left - containerRect.left) + 'px';
            modal.style.top = (rect.top - containerRect.top - 2) + 'px';
            modal.style.width = rect.width + 'px';
            modal.style.height = rect.height + 'px';
            modal.style.transform = 'translateX(-2px)';
        }

        // Загрузка карт
        async function loadProfileCards() {
            if (IS_TEST_MODE) {
                const testCards = [
                    { cardType: 1, name: 'Проект-менеджер', isOpen: false },
                    { cardType: 2, name: 'Стаж', isOpen: false },
                    { cardType: 3, name: 'Надёжный', isOpen: false },
                    { cardType: 4, name: 'Адаптивность', isOpen: false },
                    { cardType: 5, name: 'Подогревает рыбу в офисной микроволновке каждую среду', isOpen: false },
                    { cardType: 6, name: 'C#', isOpen: false },
                    { cardType: 6, name: 'Kotlin', isOpen: false },
                    { cardType: 6, name: 'Figma', isOpen: false }
                ];
                renderProfileCards(testCards);
                return;
            }
            
            try {
                console.log('запрос карт с сервера...');
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
                showToast('Не удалось загрузить карты. Обновите страницу.', 'error');
            }
        }
        
        // Отрисовка карт
        function renderProfileCards(hand) {
            console.log('отрисовка карт:', hand);
            
            let cardsContainer = document.querySelector('.profile-cards-container');
            if (!cardsContainer) {
                cardsContainer = document.createElement('div');
                cardsContainer.className = 'profile-cards-container';
                const nickField = container.querySelector('.profile-nick-field');
                if (nickField && nickField.parentNode) {
                    nickField.parentNode.insertBefore(cardsContainer, nickField.nextSibling);
                } else {
                    container.appendChild(cardsContainer);
                }
            }
            
            cardsContainer.innerHTML = '';
            
            hand.forEach((card, idx) => {
                const label = CARD_TYPE_TO_LABEL[card.cardType];
                if (!label) {
                    console.warn('неизвестный тип карты:', card.cardType);
                    return;
                }
                
                const cardDiv = document.createElement('div');
                cardDiv.className = 'profile-card';
                cardDiv.setAttribute('data-index', idx);
                
                // Всегда показываем название карты (свои карты видны полностью)
                cardDiv.innerHTML = `
                    <div class="profile-card-badge"></div>
                    <div class="profile-card-label">${label}</div>
                    <div class="profile-card-value">${card.name.replace(/\n/g, '<br>')}</div>
                `;
                
                // Если карта уже открыта
                if (card.isOpen) {
                    cardDiv.classList.add('card-opened');
                    cardDiv.style.background = '#FFCBE5';
                    cardDiv.style.backgroundColor = '#FFCBE5';
                    cardDiv.style.borderRadius = '50px';
                    cardDiv.style.pointerEvents = 'none';
                    cardDiv.style.opacity = '0.7';
                }
                
                cardsContainer.appendChild(cardDiv);
            });

            // Восстанавливаем состояние из sessionStorage (для карт, открытых ранее в этой же вкладке браузера)
            const revealedCards = JSON.parse(sessionStorage.getItem('revealedCards') || '{}');
            console.log('sessionStorage revealedCards:', revealedCards);

            const allCards = cardsContainer.querySelectorAll('.profile-card');
            allCards.forEach((card, idx) => {
                // Если карта помечена как открытая в sessionStorage И ещё не открыта
                if (revealedCards[idx] && !card.classList.contains('card-opened')) {
                    card.style.background = '#FFCBE5';
                    card.style.backgroundColor = '#FFCBE5';
                    card.style.borderRadius = '50px';
                    card.classList.add('card-opened');
                    card.style.pointerEvents = 'none';
                    card.style.opacity = '0.7';
                    card.style.cursor = 'default';
                    console.log(`Восстановлено состояние карты ${idx} (розовый фон)`);
                }
            });
            
            // Настраиваем обработчики кликов после создания карт
            setTimeout(setupCardClickHandlers, 100);
        }

        // ===== НАВИГАЦИЯ =====
        // Иконка "Карточки всех игроков"
         const iconCenter = document.querySelector('.icon-center');
        if (iconCenter) {
            const newIconCenter = iconCenter.cloneNode(true);
            iconCenter.parentNode.replaceChild(newIconCenter, iconCenter);
            
            newIconCenter.addEventListener('click', () => {
                console.log('переход на cards-all-players');
                if (timerInterval) clearInterval(timerInterval);
                loadPage('cards-all-players.html', container);
            });
        }

        // Иконка "Профиль" (обновление)
        const iconRight = document.querySelector('.icon-right');
        if (iconRight) {
            const newIconRight = iconRight.cloneNode(true);
            iconRight.parentNode.replaceChild(newIconRight, iconRight);
            
            newIconRight.addEventListener('click', () => {
                console.log('обновление профиля');
                loadProfileCards();
                fetchCurrentTurn();
            });
        }

        // Иконка "Выгнать" (голосование)
        const iconLeft = document.querySelector('.icon-left');
        if (iconLeft) {
            const newIconLeft = iconLeft.cloneNode(true);
            iconLeft.parentNode.replaceChild(newIconLeft, iconLeft);
            
            newIconLeft.addEventListener('click', () => {
                console.log('переход на vote');
                if (timerInterval) clearInterval(timerInterval);
                loadPage('vote.html', container);
            });
        }

        // Активируем иконку профиля
        setTimeout(() => {
            setActiveIcon(null, 'icon-right', 'profile-icon');
            console.log('активирована вкладка "me"');
        }, 100);
        
        // Запускаем загрузку
        setTimeout(() => {
            loadProfileCards();
        }, 200);
        
        setTimeout(() => {
            fetchCurrentTurn();
        }, 500);

        // Периодическая проверка хода
        const turnCheckInterval = setInterval(() => {
            if (document.querySelector('.profile-container')) {
                fetchCurrentTurn();
            } else {
                clearInterval(turnCheckInterval);
            }
        }, 5000);
        
        console.log('Profile готово');
    }

    // ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ ВСЕХ ИГРОКОВ (cards-all-players.html) =====
    // Проверяем наличие контейнера для карточек игроков
    const playersContainerCheck = container.querySelector('.players-cards-container');

    if (playersContainerCheck) {
        console.log('cards-all-players загружен');
        
        // Данные из sessionStorage
        const roomCode = sessionStorage.getItem('currentRoomCode');
        const playerUuid = sessionStorage.getItem('currentPlayerUuid');
        const currentPlayer = sessionStorage.getItem('currentPlayer');
        const project = JSON.parse(sessionStorage.getItem('project') || '{}');
        const maxPlayers = parseInt(sessionStorage.getItem('maxPlayers')) || 4;
        
        // Маппинг типов карт (8 карт: 1-6 + дополнительные языки)
        const CARD_TYPES = [
            { type: 1, label: 'Роль' },           // строка 1, колонка 1
            { type: 2, label: 'Стаж' },           // строка 1, колонка 2
            { type: 3, label: 'Черта характера' }, // строка 2, колонка 1
            { type: 4, label: 'Качество' },        // строка 2, колонка 2
            { type: 5, label: 'Особенность' },     // строка 3, колонка 1
            { type: 6, label: 'Языки и среды' },   // строка 3, колонка 2
            { type: 6, label: 'Языки и среды' },   // строка 4, колонка 1
            { type: 6, label: 'Языки и среды' }    // строка 4, колонка 2
        ];
        
        // Ищем контейнер для карточек всех игроков
        let playersContainer = container.querySelector('.players-cards-container');

        // Если контейнера нет - создаём его
        if (!playersContainer) {
            playersContainer = document.createElement('div');
            playersContainer.className = 'players-cards-container';
            
            // Вставляем после блока с вопросом или в нужное место
            const groupThree = container.querySelector('.group-three');
            if (groupThree && groupThree.parentNode) {
                groupThree.parentNode.insertBefore(playersContainer, groupThree.nextSibling);
            } else {
                container.appendChild(playersContainer);
            }
            console.log('Создан новый контейнер .players-cards-container');
        }

        // Применяем стили к контейнеру через JS
        if (playersContainer) {
            playersContainer.style.position = 'absolute';
            playersContainer.style.height = 'auto';
            playersContainer.style.minHeight = '600px';
            playersContainer.style.maxHeight = '800px';  // ограничиваем высоту
            playersContainer.style.left = '17px';
            playersContainer.style.right = '17px';
            playersContainer.style.top = '100px';
            playersContainer.style.bottom = '80px';
            playersContainer.style.overflowY = 'auto';
            playersContainer.style.overflowX = 'hidden';
            playersContainer.style.display = 'flex';
            playersContainer.style.flexDirection = 'column';
            playersContainer.style.gap = '20px';
            playersContainer.style.paddingRight = '5px';
        }

        // Стилизация - скрываем ползунок скролла во всех браузерах
        const style = document.createElement('style');
        style.textContent = `
            .players-cards-container {
                scrollbar-width: none !important; 
                -ms-overflow-style: none !important;  
            }
            .players-cards-container::-webkit-scrollbar {
                width: 0 !important;
                height: 0 !important;
                display: none !important;  
            }
        `;
        document.head.appendChild(style);

        const cardBlockStyle = document.createElement('style');
        cardBlockStyle.textContent = `
            .player-card-block {
                height: auto !important;
                min-height: auto !important;
                overflow: visible !important;
                padding-bottom: 5px !important;
            }
            .player-cards-grid {
                overflow: visible !important;
            }
            .mini-card {
                overflow: visible !important;
            }
        `;
        document.head.appendChild(cardBlockStyle);

        // Очищаем контейнер перед заполнением
        playersContainer.innerHTML = '';
        
        // Название проекта
        const titleEl = container.querySelector('.cards-title');
        if (titleEl && project.name) {
            titleEl.textContent = project.name;
        }
        
        // Счётчик игроков
        const votedCountEl = container.querySelector('.voted-count');
        if (votedCountEl) {
            votedCountEl.textContent = `0`; 
        }
        
        // Принудительная установка позиции для блока "Количество человек в проекте"
        const votedBlock = container.querySelector('.voted-block');
        if (votedBlock) {
            votedBlock.style.position = 'absolute';
            votedBlock.style.right = '15px';
            votedBlock.style.left = '255px';
            votedBlock.style.top = '10px';
            votedBlock.style.width = '65px';
            votedBlock.style.height = '65px';
        }

        // Модальное окно с описанием проекта
        const questionBtn = container.querySelector('.group-three');
        const projectOverlay = container.querySelector('.project-overlay');
        let isOverlayOpen = false;

        if (questionBtn && projectOverlay) {
            questionBtn.style.cursor = 'pointer';
            questionBtn.style.transition = 'transform 0.3s ease';
            
            // Применяем правильные стили к оверлею через JS
            projectOverlay.style.position = 'absolute';
            projectOverlay.style.width = '389px';
            projectOverlay.style.height = '687px';
            projectOverlay.style.bottom = 'auto';
            projectOverlay.style.left = '0px';
            projectOverlay.style.top = '80px';
            projectOverlay.style.backgroundColor = '#FFCBE5';
            projectOverlay.style.flexDirection = 'column';
            projectOverlay.style.alignItems = 'center';

            
            // Применяем стили к описанию
            const descEl = container.querySelector('.project-description');
            if (descEl) {
                descEl.style.position = 'relative';
                descEl.style.width = '100%';
                descEl.style.height = 'auto';
                descEl.style.fontFamily = "'Inria Serif'";
                descEl.style.fontSize = '16px';
                descEl.style.lineHeight = '19px';
                descEl.style.color = '#7F375A';
                descEl.style.textAlign = 'left';
                descEl.style.marginLeft = '0';
                descEl.style.padding = '10px';
            }
            
            const newQuestionBtn = questionBtn.cloneNode(true);
            questionBtn.parentNode.replaceChild(newQuestionBtn, questionBtn);
            
            newQuestionBtn.onclick = () => {
                isOverlayOpen = !isOverlayOpen;
                
                if (isOverlayOpen) {
                    projectOverlay.style.display = 'flex';
                    // Опускаем значок вопроса вниз
                    newQuestionBtn.style.transform = 'translateY(625px)';
                    
                    if (descEl && project.description) {
                        descEl.textContent = project.description;
                    }
                } else {
                    projectOverlay.style.display = 'none';
                    // Возвращаем значок вопроса на место
                    newQuestionBtn.style.transform = 'translateY(0)';
                }
            };
            
            projectOverlay.onclick = (e) => {
                if (e.target === projectOverlay) {
                    isOverlayOpen = false;
                    projectOverlay.style.display = 'none';
                    newQuestionBtn.style.transform = 'translateY(0)';
                }
            };
        }
        // Функция для получения карт игрока с группировкой языков
        function getPlayerCards(player) {
            const cards = player.hand || [];
            
            // Разделяем карты по типам
            const cardsByType = {
                1: null, // Роль
                2: null, // Стаж
                3: null, // Черта характера
                4: null, // Качество
                5: null, // Особенность
                6: []   // Языки и среды (массив из 3 карт)
            };
            
            cards.forEach(card => {
                if (card.cardType === 6) {
                    cardsByType[6].push(card);
                } else {
                    cardsByType[card.cardType] = card;
                }
            });
            
            const result = [];
            
            for (let i = 0; i < CARD_TYPES.length; i++) {
                const cardTypeDef = CARD_TYPES[i];
                
                if (cardTypeDef.type === 6) {
                    // Для языков берем следующую карту из массива
                    const langCard = cardsByType[6].shift();
                    result.push({
                        label: cardTypeDef.label,
                        value: langCard?.isOpen ? langCard.name : '?',
                        isOpen: langCard?.isOpen || false,
                        cardType: 6,
                        originalCard: langCard || null
                    });
                } else {
                    // Для уникальных карт
                    const card = cardsByType[cardTypeDef.type];
                    result.push({
                        label: cardTypeDef.label,
                        value: card?.isOpen ? card.name : '?',
                        isOpen: card?.isOpen || false,
                        cardType: cardTypeDef.type,
                        originalCard: card || null
                    });
                }
            }
            
            return result;
        }
        
        // Загрузка и отрисовка игроков
        let playersData = [];
        
        async function loadPlayersList() {
            if (IS_TEST_MODE) {
                // Тестовые данные с 8 картами
                playersData = [
                    { 
                        uuid: 'test-1', 
                        nickname: currentPlayer || 'МойНик', 
                        be_creator: true, 
                        hand: [
                            { cardType: 1, name: 'Проект-менеджер', isOpen: true },
                            { cardType: 2, name: '3 года', isOpen: false },
                            { cardType: 3, name: 'Надёжный', isOpen: false },
                            { cardType: 4, name: 'Адаптивность', isOpen: false },
                            { cardType: 5, name: 'Подогревает рыбу', isOpen: false },
                            { cardType: 6, name: 'JavaScript', isOpen: false },
                            { cardType: 6, name: 'Python', isOpen: false },
                            { cardType: 6, name: 'Java', isOpen: false }
                        ] 
                    },
                    { 
                        uuid: 'test-2', 
                        nickname: 'РандомНик1', 
                        be_creator: false, 
                        hand: [
                            { cardType: 1, name: 'Разработчик', isOpen: false },
                            { cardType: 2, name: '1 год', isOpen: false },
                            { cardType: 3, name: 'Креативный', isOpen: false },
                            { cardType: 4, name: 'Командный', isOpen: false },
                            { cardType: 5, name: 'Любит кофе', isOpen: false },
                            { cardType: 6, name: 'C++', isOpen: false },
                            { cardType: 6, name: 'Rust', isOpen: false }
                        ] 
                    }
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
                    votedCountEl.textContent = playersData.length; 
                }
                
                renderPlayersList(playersData);
                
            } catch (err) {
                console.error('Ошибка загрузки игроков:', err);
            }
        }
        
        function renderPlayersList(players) {
            if (!playersContainer) return;
    
            playersContainer.innerHTML = '';
            
            players.forEach(player => {
                const playerBlock = document.createElement('div');
                playerBlock.className = 'player-card-block';
                // Сохраняем UUID как строку
                playerBlock.dataset.playerUuid = String(player.uuid);
                
                // Получаем карты игрока в правильном порядке (8 карт)
                const playerCards = getPlayerCards(player);
                
                // Создаем HTML для сетки 4x2
                let cardsHTML = '<div class="player-cards-grid">';
                
                playerCards.forEach((card, idx) => {
                    const isRevealed = card.isOpen;
                    const valueClass = isRevealed ? 'revealed-value' : '';
                    
                    cardsHTML += `
                        <div class="mini-card" data-card-type="${card.cardType}" data-card-index="${idx}">
                            <div class="mini-card-label">${card.label}</div>
                            <div class="mini-card-value ${valueClass}">${card.value}</div>
                        </div>
                    `;
                });
                
                cardsHTML += '</div>';
                
                playerBlock.innerHTML = `
                    <div class="player-name">${player.nickname}</div>
                    ${cardsHTML}
                `;
                
                // Карточки всегда видны, клик отключён
                const cardsGrid = playerBlock.querySelector('.player-cards-grid');
                const playerName = playerBlock.querySelector('.player-name');

                // Карточки всегда видны
                cardsGrid.style.display = 'grid';
                playerBlock.style.border = '2px solid #7F375A';
                if (playerName) playerName.style.color = '#FE5499';

                // Убираем курсор pointer и onclick
                playerBlock.style.cursor = 'default';
                if (playerName) {
                    playerName.style.cursor = 'default';
                }
                
                playersContainer.appendChild(playerBlock);
            });
        }
        
        // WebSocket слушатели для обновления карт
        if (!IS_TEST_MODE && socket && playerUuid && roomCode) {
            socket.emit('register', { playerUuid, roomCode });
            
            // Удаляем старые обработчики, чтобы избежать дублирования
            socket.off('reveal-card');
            socket.off('force-reveal-card');

            // Обработчик добровольного вскрытия
            socket.on('reveal-card', (data) => {
                console.log('reveal-card на cards-all-players:', data);
                
                // Обновляем данные в playersData
                const targetPlayer = playersData.find(p => p.uuid === data.player.uuid);
                if (targetPlayer && targetPlayer.hand) {
                    const cardToUpdate = targetPlayer.hand[data.openCard.index];
                    if (cardToUpdate && !cardToUpdate.isOpen) {
                        cardToUpdate.isOpen = true;
                        cardToUpdate.name = data.openCard.name;
                    }
                }
                
                updateRevealedCardInAllPlayers(data.player.uuid, data.openCard);
                // Принудительно перерисовываем
                renderPlayersList(playersData);
            });

            // Обработчик принудительного вскрытия
           socket.on('force-reveal-card', (data) => {
                console.log('force-reveal-card на cards-all-players:', data);

                // Обновляем данные в playersData
                const targetPlayer = playersData.find(p => p.uuid === data.player.uuid);
                if (targetPlayer && targetPlayer.hand) {
                    const cardToUpdate = targetPlayer.hand[data.openCard.index];
                    if (cardToUpdate && !cardToUpdate.isOpen) {
                        cardToUpdate.isOpen = true;
                        cardToUpdate.name = data.openCard.name;
                    }
                }

                // Обновляем визуал
                updateRevealedCardInAllPlayers(data.player.uuid, data.openCard);

                // Принудительно обновляем конкретную карту в DOM
                const allBlocks = document.querySelectorAll('.player-card-block');
                for (const block of allBlocks) {
                    const blockUuid = block.getAttribute('data-player-uuid');
                    if (String(blockUuid) === String(data.player.uuid)) {
                        const cards = block.querySelectorAll('.mini-card');
                        const targetCard = cards[data.openCard.index];
                        if (targetCard) {
                            const valueEl = targetCard.querySelector('.mini-card-value');
                            if (valueEl) {
                                valueEl.textContent = data.openCard.name;
                                valueEl.style.color = '#F17BAB';
                                valueEl.style.fontWeight = 'bold';
                            }
                        }
                        break;
                    }
                }
            });

            // Обработчик смены хода
            socket.on('turn-update', (data) => {
                console.log('turn-update на cards-all-players:', data);
                if (typeof updateTurnIndicator === 'function') {
                    updateTurnIndicator(data.currentPlayerUuid, data.timeLeft);
                }
            });
            
            // Обработчик обновления таймера
            socket.on('update_timer', (data) => {
                const timerText = container.querySelector('.cards-timer-text');
                if (timerText && data.timeLeft !== undefined) {
                    const minutes = Math.floor(data.timeLeft / 60);
                    const seconds = data.timeLeft % 60;
                    timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            });
        }
        
        // Индикатор хода
        function updateTurnIndicator(currentPlayerUuid, timeLeft) {
            const turnText = container.querySelector('.cards-turn-text');
            const timerText = container.querySelector('.cards-timer-text');
            const turnBadge = container.querySelector('.cards-turn-badge');
            
            const isMyTurn = currentPlayerUuid == playerUuid;
            
            // Обновляем текст статуса хода
            if (turnText) {
                turnText.textContent = isMyTurn ? 'Ваш ход' : 'Ход другого игрока';
                turnText.style.color = isMyTurn ? '#FE5499' : '#999';
            }
            
            // Обновляем таймер
            if (timerText && timeLeft !== undefined) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
                // Подсветка при остатке 10 секунд
                if (isMyTurn && timeLeft <= 10) {
                    timerText.style.color = '#ff0000';
                    timerText.style.fontWeight = 'bold';
                } else {
                    timerText.style.color = '';
                    timerText.style.fontWeight = '';
                }
            }
            
            // Обновляем бейдж
            if (turnBadge) {
                turnBadge.style.background = isMyTurn ? '#FFFFFF' : '#DADADA';
                turnBadge.style.borderColor = isMyTurn ? '#FFCBE5' : '#999';
            }
        }
        
        // Навигация - обновляем обработчики иконок
        const iconRight = document.querySelector('.icon-right');
        if (iconRight) {
            const newIconRight = iconRight.cloneNode(true);
            iconRight.parentNode.replaceChild(newIconRight, iconRight);
            
            newIconRight.addEventListener('click', () => {
                console.log('Возврат на profile.html');
                if (window.cardsAllInterval) {
                    clearInterval(window.cardsAllInterval);
                    window.cardsAllInterval = null;
                }
               loadPage('profile.html', container);
            });
        }
        
        const iconCenter = document.querySelector('.icon-center');
        if (iconCenter) {
            const newIconCenter = iconCenter.cloneNode(true);
            iconCenter.parentNode.replaceChild(newIconCenter, iconCenter);
            
            newIconCenter.addEventListener('click', () => {
                console.log('Уже на странице всех игроков');
                setActiveIcon(null, 'icon-center', 'cards-icon');
            });
        }
        
        const iconLeft = document.querySelector('.icon-left');
        if (iconLeft) {
            const newIconLeft = iconLeft.cloneNode(true);
            iconLeft.parentNode.replaceChild(newIconLeft, iconLeft);
            
            newIconLeft.addEventListener('click', () => {
                console.log('Переход на vote.html');
                if (window.cardsAllInterval) {
                    clearInterval(window.cardsAllInterval);
                    window.cardsAllInterval = null;
                }
                loadPage('vote.html', container);
            });
        }
        
        // Активируем центральную иконку
        setTimeout(() => {
            setActiveIcon(null, 'icon-center', 'cards-icon');
            console.log('Активирована вкладка "users"');
        }, 100);
        
        // Инициализация
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
                alert('Ответы сохранены! Теперь можно посмотреть итоговый отчёт.');
                loadPage('results.html', container);
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

// ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ ИТОГОВ (final-team.html) =====
const finalContainer = container.querySelector('.final-players-list, [data-page="final-team"]');

if (finalContainer) {
    console.log('Final-team: страница загружена');
    
    // Данные из sessionStorage
    const roomCode = sessionStorage.getItem('currentRoomCode');
    const playerUuid = sessionStorage.getItem('currentPlayerUuid');
    const currentPlayer = sessionStorage.getItem('currentPlayer');
    const isCreator = sessionStorage.getItem('isCreator') === 'true'; 
    
    const maxRounds = parseInt(sessionStorage.getItem('maxRounds')) || 3;
const currentRound = parseInt(sessionStorage.getItem('currentRound')) || 1;

const roundsCompletedEl = container.querySelector('#rounds-completed');//css селектор
const maxRoundsEl = container.querySelector('#max-rounds');

if (roundsCompletedEl) {
    roundsCompletedEl.textContent = currentRound - 1; // Прошедших раундов
}
if (maxRoundsEl) {
    maxRoundsEl.textContent = maxRounds; // Всего раундов
}
    // прокрутка страницы 
    
    // загрузка списка игроков с сервера 
    let finalPlayers = [];  // Игроки в финале
    let kickedPlayers = []; // Выгнанные игроки
    
    async function loadFinalTeam() {
        if (IS_TEST_MODE) {
    //для теста
            finalPlayers = [
                { uuid: 'test-1', nickname: currentPlayer || 'МойНик', be_creator: true, hand: [
                    { cardType: 1, name: 'Проектировщик-тестировщик', isOpen: false },
                    { cardType: 2, name: 'Агрессивный', isOpen: false },
                    { cardType: 3, name: '1', isOpen: false },
                    { cardType: 4, name: 'Тайм-менеджмент', isOpen: false },
                    { cardType: 5, name: 'Рисует схемы на салфетках', isOpen: false },
                    { cardType: 6, name: 'Figma\nC++', isOpen: false }
                ]},
                { uuid: 'test-2', nickname: 'РандомНик1', be_creator: false, hand: [] },
                { uuid: 'test-3', nickname: 'РандомНик2', be_creator: false, hand: [] },
                { uuid: 'test-4', nickname: 'РандомНик3', be_creator: false, hand: [] }
            ];
            kickedPlayers = [
                { uuid: 'test-5', nickname: 'РандомНик4' },
                { uuid: 'test-6', nickname: 'РандомНик5' }
            ];
            renderFinalTeam(finalPlayers, kickedPlayers);
            return;
        }
        
        try {
            // Запрашиваем финальный состав с сервера
            const res = await fetch(`/api/game/final-team?code=${roomCode}`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            finalPlayers = data.finalPlayers || [];
            kickedPlayers = data.kickedPlayers || [];
            
            renderFinalTeam(finalPlayers, kickedPlayers);
            
        } catch (err) {
            console.error('ошибка загрузки финала:', err);
        }
    }
    
    // отрисовка списка игроков
    function renderFinalTeam(players, kicked) {
        const playersList = container.querySelector('.final-players-list');
        const statsCount = container.querySelector('.final-stats-count');
        
        if (!playersList) return;
        
        // обновляем счётчик 
        if (statsCount) {
            statsCount.textContent = players.length;
        }
        
        // очищаем и перерисовываем список
        playersList.innerHTML = '';
        
        // Рендерим игроков в команде
        players.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = 'final-player-item';
            playerItem.dataset.playerUuid = player.uuid;
            
            // Генерируем карточки (вскрытые или скрытые)
            let cardsHTML = '';
            if (player.hand && player.hand.length > 0) {
                const allRevealed = player.hand.every(c => c.isOpen);
                
                if (allRevealed || isCreator) {
                    // Показываем карты
                    player.hand.forEach(card => {
                        const label = CARD_TYPE_TO_LABEL[card.cardType];
                        cardsHTML += `
                            <div class="mini-card">
                                <div class="mini-card-label">${label}</div>
                                <div class="mini-card-value">${card.name.replace(/\n/g, '<br>')}</div>
                            </div>
                        `;
                    });
                }
            }
            
            playerItem.innerHTML = `
                <div class="final-player-badge"></div>
                <div class="final-player-name">${player.nickname}</div>
                ${cardsHTML ? `<div class="player-cards-expanded"><div class="player-cards-grid">${cardsHTML}</div></div>` : ''}
            `;
            
            // клик по нику - показать/скрыть карты (для не-создателя)
            if (!isCreator && cardsHTML) {
                const nameEl = playerItem.querySelector('.final-player-name');
                const cardsExpanded = playerItem.querySelector('.player-cards-expanded');
                
                if (nameEl && cardsExpanded) {
                    nameEl.style.cursor = 'pointer';
                    nameEl.onclick = () => {
                        if (cardsExpanded.style.display === 'none' || !cardsExpanded.style.display) {
                            cardsExpanded.style.display = 'flex';
                            playerItem.classList.add('open');
                            nameEl.style.color = '#F17BAB';
                        } else {
                            cardsExpanded.style.display = 'none';
                            playerItem.classList.remove('open');
                            nameEl.style.color = '#FE5499';
                        }
                    };
                }
            }
            
            playersList.appendChild(playerItem);
        });
        
        // рендер выгнанных игроков 
        kicked.forEach(player => {
            const kickedItem = document.createElement('div');
            kickedItem.className = 'final-player-item eliminated';
            kickedItem.dataset.playerUuid = player.uuid;
            
            kickedItem.innerHTML = `
                <div class="final-player-badge"></div>
                <div class="final-player-name">${player.nickname}</div>
            `;
            
            playersList.appendChild(kickedItem);
        });
    }
    
    // вскрытие карт
    if (!IS_TEST_MODE && playerUuid && roomCode) {
        if (!socket) {
            socket = io();
        }
        
        socket.emit('register', { playerUuid, roomCode });
        
        socket.on('reveal-all-cards', (data) => {
            console.log('все карты вскрыты:', data);
            renderFinalTeam(finalPlayers, kickedPlayers);
        });
    }
    
    // вскрыть "вскрыть все карты" 
    const revealBtn = container.querySelector('.final-reveal-btn');
    
    if (revealBtn) {
        if (isCreator) {
            //показывается кнопка только создателю
            revealBtn.style.display = 'block';
            revealBtn.style.cursor = 'pointer';
            
            revealBtn.onclick = async () => {
                if (IS_TEST_MODE) {
                    finalPlayers.forEach(p => {
                        if (p.hand) p.hand.forEach(c => c.isOpen = true);
                    });
                    renderFinalTeam(finalPlayers, kickedPlayers);
                    if (socket) {
                        socket.emit('reveal-all-cards', { roomCode, finalPlayers });
                    }
                    return;
                }
                
                try {
                    // запрос на сервер
                    const res = await fetch('/api/game/reveal-all-cards', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ roomCode })
                    });
                    
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    
                    console.log('все карты вскрыты');
                    // Сервер сам разошлёт событие всем игрокам
                    
                } catch (err) {
                    console.error('ошибка вскрытия:', err);
                    alert('Не удалось вскрыть карты');
                }
            };
        } else {
            // Скрываем кнопку для не-создателя
            revealBtn.style.display = 'none';
        }
    }
    
    // кнопка "Посмотреть результаты" 
    const resultsBtn = container.querySelector('.final-results-btn');
    
    if (resultsBtn) {
        if (isCreator) {
            // только для создателя
            resultsBtn.style.display = 'block';
            resultsBtn.style.cursor = 'pointer';
            
            const badge = resultsBtn.querySelector('.final-results-badge');
            const text = resultsBtn.querySelector('.final-results-text');
            if (badge) {
                badge.style.background = '#F17BAB';
                badge.style.borderColor = '#7F375A';
            }
            if (text) {
                text.style.color = '#FFFFFF';
                text.style.textShadow = `1px 0 0 #7F375A, -1px 0 0 #7F375A, 0 1px 0 #7F375A, 0 -1px 0 #7F375A`;
            }
            
            resultsBtn.onclick = () => {
                // финальные данные для страницы ответов
                sessionStorage.setItem('finalResults', JSON.stringify({
                    finalPlayers,
                    kickedPlayers,
                    roomCode
                }));
                
                // Переход на answers.html (или results.html)
                loadPage('answers.html', container);
            };
        } else {
            // Для не-создателя: кнопка видна, но неактивна (серая)
            resultsBtn.style.display = 'block';
            resultsBtn.style.cursor = 'not-allowed';
            
            const badge = resultsBtn.querySelector('.final-results-badge');
            const text = resultsBtn.querySelector('.final-results-text');
            if (badge) {
                badge.style.background = '#DADADA';
                badge.style.borderColor = '#9B3D63';
            }
            if (text) {
                text.style.color = '#9B3D63';
                text.style.textShadow = 'none';
            }
            

            text.textContent = 'Ожидание создателя';
            
            resultsBtn.onclick = null;
        }
    }
    
    // На финальной странице иконки обычно не нужны, но если есть:
    container.querySelector('.icon-left')?.addEventListener('click', () => {
        if (confirm('Покинуть комнату?')) {
            if (socket) socket.disconnect();
            sessionStorage.clear();
            loadPage('main-page-content.html', container);
        }
    });
    
    loadFinalTeam();
    
    console.log('Final-team: логика инициализирована');
}

// ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ ГОЛОСОВАНИЯ (vote.html) =====
const voteContainer = container.querySelector('.vote-players-list, [data-page="vote"]');

if (voteContainer) {
    console.log('Vote: страница загружена');
    const roomCode = sessionStorage.getItem('currentRoomCode');
    const playerUuid = sessionStorage.getItem('currentPlayerUuid');
    const currentPlayer = sessionStorage.getItem('currentPlayer');
    const maxPlayers = parseInt(sessionStorage.getItem('maxPlayers')) || 4;
    
    const currentRound = parseInt(sessionStorage.getItem('currentRound')) || 1;
    const maxRounds = parseInt(sessionStorage.getItem('maxRounds')) || 3;// данные у раунде

    const roundNumberEl = container.querySelector('#round-number');
    const maxRoundsEl = container.querySelector('#max-rounds');
    if (roundNumberEl) roundNumberEl.textContent = currentRound;
    if (maxRoundsEl) maxRoundsEl.textContent = maxRounds;

    // Состояние голосования
    let voteState = {
        voters: [],           // UUID игроков, которые уже проголосовали
        votes: {},            // { targetUuid: [voterUuid, ...] }
        kickedPlayer: null,   // UUID выгнанного игрока
        isFinished: false     // Закончено ли голосование
    };
    
    // загрузка игроков для голосования
    async function loadVotePlayers() {
        if (IS_TEST_MODE) {
            // Тестовые данные
            const testPlayers = [
                { uuid: 'test-1', nickname: currentPlayer || 'МойНик', be_creator: true },
                { uuid: 'test-2', nickname: 'РандомНик1', be_creator: false },
                { uuid: 'test-3', nickname: 'РандомНик2', be_creator: false },
                { uuid: 'test-4', nickname: 'РандомНик3', be_creator: false },
                { uuid: 'test-5', nickname: 'РандомНик4', be_creator: false },
                { uuid: 'test-6', nickname: 'РандомНик5', be_creator: false }
            ];
            renderVotePlayers(testPlayers);
            return;
        }
        
        try {
            const res = await fetch(`/api/vote/players?code=${roomCode}`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            renderVotePlayers(data.players || []);
            
        } catch (err) {
            console.error('Ошибка загрузки игроков:', err);
        }
    }
    
    //  отрисовка списка игроков 
    function renderVotePlayers(players) {
        const playersList = container.querySelector('.vote-players-list');
        const voteCounter = container.querySelector('.vote-stats-count');
        
        if (!playersList) return;
        
        // Сортировка сначала текущий игрок 
        const sortedPlayers = [...players].sort((a, b) => {
            if (a.uuid === playerUuid) return -1;
            if (b.uuid === playerUuid) return 1;
            return 0;
        });
        
        playersList.innerHTML = '';
        
        sortedPlayers.forEach(player => {
            const isVoter = voteState.voters.includes(player.uuid);
            const isKicked = player.uuid === voteState.kickedPlayer;
            const isMyself = player.uuid === playerUuid;
            
            const playerItem = document.createElement('div');
            playerItem.className = `vote-player-item${isKicked ? ' kicked' : ''}${isVoter ? ' voted' : ''}`;
            playerItem.dataset.playerUuid = player.uuid;
            
            // Крестик только для не-себя и не-выгнанных и не-проголосовавших
            const crossHTML = (!isMyself && !isKicked && !isVoter) 
                ? `<div class="vote-player-icon" 
                    style="position: absolute; width: 50px; height: 50px; right: 8px; top: 50%; transform: translateY(-50%); background: url('../images/x.png'); background-size: contain; background-repeat: no-repeat; background-position: center; cursor: pointer;" 
                    data-target="${player.uuid}" 
                    data-target-name="${player.nickname}"></div>` 
                : '';

            playerItem.innerHTML = `
                <div class="vote-player-badge"></div>
                <div class="vote-player-name">${player.nickname}${isMyself ? ' (вы)' : ''}</div>
                ${crossHTML}
            `;
            
            // обработчик клика на крестик 
            const cross = playerItem.querySelector('.vote-player-icon');
            if (cross) {
                cross.onclick = (e) => {
                    e.stopPropagation();
                    const targetUuid = cross.dataset.target;
                    const targetName = cross.dataset.targetName;
                    showKickModal(targetUuid, targetName);
                };
            }
            
            playersList.appendChild(playerItem);
        });
        
        // счётчик обновление
        if (voteCounter) {
            voteCounter.textContent = `${voteState.voters.length} из ${players.length}`;
        }
        
        // проверка закончено ли голосование
        if (voteState.voters.length >= players.length && !voteState.isFinished) {
            finishVoting(players);
        }
    }
    
    // модальное окно подтверждения 
    let pendingKickUuid = null;
    
    function showKickModal(targetUuid, targetName) {
        const modal = container.querySelector('.vote-modal');
        const question = container.querySelector('.vote-modal-question');
        const yesBtn = container.querySelector('.vote-modal-yes');
        const noBtn = container.querySelector('.vote-modal-no');
        
        if (!modal) return;
        
        // Обновляем текст вопроса
        if (question) {
            question.textContent = `Вы действительно хотите выгнать игрока "${targetName}"?`;
        }
        
        // модальное окно
        modal.style.display = 'flex';
        pendingKickUuid = targetUuid;
        
        // Обработчик "Да"
        const handleYes = () => {
            if (pendingKickUuid) {
                submitVote(pendingKickUuid);
            }
            closeModal();
        };
        
        // обработчик "Нет"
        const handleNo = () => {
            closeModal();
        };
        // далее
        if (yesBtn) {
            const newYesBtn = yesBtn.cloneNode(true);
            yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
            newYesBtn.addEventListener('click', handleYes);
        }
        
        if (noBtn) {
            const newNoBtn = noBtn.cloneNode(true);
            noBtn.parentNode.replaceChild(newNoBtn, noBtn);
            newNoBtn.addEventListener('click', handleNo);
        }
        
        // Закрытие по клику на фон
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };
    }
    
    function closeModal() {
        const modal = container.querySelector('.vote-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        pendingKickUuid = null;
    }
    
    // отправка голоса на сервер
    async function submitVote(targetUuid) {
        if (IS_TEST_MODE) {
            // Тест локальное обновление
            voteState.voters.push(playerUuid);
            if (!voteState.votes[targetUuid]) {
                voteState.votes[targetUuid] = [];
            }
            voteState.votes[targetUuid].push(playerUuid);
            renderVotePlayers(getCurrentPlayers());
            
            if (socket) {
                socket.emit('vote-cast', {
                    roomCode,
                    voterUuid: playerUuid,
                    targetUuid
                });
            }
            return;
        }
        
        try {
            const res = await fetch('/api/vote/cast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    roomCode,
                    voterUuid: playerUuid,
                    targetUuid
                })
            });
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            console.log('Голос засчитан');
            
        } catch (err) {
            console.error('Ошибка отправки голоса:', err);
            alert('Не удалось проголосовать');
        }
    }
    
    // Вспомогательная функция для теста
    function getCurrentPlayers() {
        return [
            { uuid: 'test-1', nickname: currentPlayer || 'МойНик' },
            { uuid: 'test-2', nickname: 'РандомНик1' },
            { uuid: 'test-3', nickname: 'РандомНик2' },
            { uuid: 'test-4', nickname: 'РандомНик3' },
            { uuid: 'test-5', nickname: 'РандомНик4' },
            { uuid: 'test-6', nickname: 'РандомНик5' }
        ];
    }
    
    // завершение голосования
    function finishVoting(players) {
    voteState.isFinished = true;
    
    // 1. Поиск игрока с наибольшим количеством голосов
    let maxVotes = 0;
    let kickedUuid = null;
    
    for (const [targetUuid, voters] of Object.entries(voteState.votes)) {
        if (voters.length > maxVotes) {
            maxVotes = voters.length;
            kickedUuid = targetUuid;
        }
    }
    
    // 2. Основная логика: если кого-то выгнали
    if (kickedUuid) {
        voteState.kickedPlayer = kickedUuid;
        
        // UI: уведомление и пометка в списке
        const kickedPlayer = players.find(p => p.uuid === kickedUuid);
        if (kickedPlayer) {
            showToast(`${kickedPlayer.nickname} выгнан из команды!`, 'warning');
            const kickedItem = container.querySelector(`.vote-player-item[data-player-uuid="${kickedUuid}"]`);
            if (kickedItem) {
                kickedItem.classList.add('kicked');
                const icon = kickedItem.querySelector('.vote-player-icon');
                if (icon) icon.remove();
            }
        }
        
        // Отправка на сервер
        if (!IS_TEST_MODE) {
            fetch('/api/vote/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ roomCode, kickedUuid })
            }).catch(err => console.error('Ошибка завершения:', err));
        }
        
        // 3. Переход: следующий раунд или финал
        if (currentRound < maxRounds) {
            setTimeout(() => {
                const nextRound = currentRound + 1;
                sessionStorage.setItem('currentRound', nextRound.toString());
                showToast(`Раунд ${nextRound} начинается...`, 'info');
                loadPage('vote.html', container);
            }, 2000);
        } else {
            // Раунды кончились - финал
            setTimeout(() => {
                loadPage('final-team.html', container);
            }, 1500);
        }
        
    } else {
        // 4. Если никто не набрал голосов (kickedUuid === null)
        setTimeout(() => {
            loadPage('final-team.html', container);
        }, 1500);
    }
} 
    
    // WebSocket: синхронизация голосования
    if (!IS_TEST_MODE && playerUuid && roomCode) {
        if (!socket) {
            socket = io();
        }
        
        socket.emit('register', { playerUuid, roomCode });

        socket.on('vote-timer-update', (data) => {
        console.log('Синхронизация таймера голосования:', data.timeLeft);
        timeLeft = data.timeLeft;
        
        const timerText = container.querySelector('.vote-timer-text');
        if (timerText) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    });

        socket.on('vote-cast', (data) => {
            console.log('Новый голос:', data);
            if (!voteState.voters.includes(data.voterUuid)) {
                voteState.voters.push(data.voterUuid);
            }
            if (!voteState.votes[data.targetUuid]) {
                voteState.votes[data.targetUuid] = [];
            }
            voteState.votes[data.targetUuid].push(data.voterUuid);
            
            // Перерисовываем
            loadVotePlayers();
        });
        
        // Слушаем завершение голосования
        socket.on('vote-finished', (data) => {
            console.log('Голосование завершено:', data);
            voteState.kickedPlayer = data.kickedUuid;
            loadVotePlayers();
        });
    }
    
    // кнопка "пропустить" 
    const skipBtn = container.querySelector('.vote-skip');
    if (skipBtn) {
        skipBtn.style.cursor = 'pointer';
        skipBtn.onclick = () => {
            if (voteState.voters.includes(playerUuid)) {
                showToast('Вы уже проголосовали!', 'info');
                return;
            }
            
            if (confirm('Пропустить голосование?')) {
                // Отправляем голос "пропуск"
                submitVote(null);  // null = пропуск
            }
        };
    }
    let timeLeft = 60;
    // Таймер 
    let voteTimerInterval = null;
    
    function startVoteTimer() {
        const timerText = container.querySelector('.vote-timer-text');

        if (voteTimerInterval) {
        clearInterval(voteTimerInterval);
        voteTimerInterval = null;
    }

        timeLeft = 60;

        if (timerText) {
            timerText.textContent = '1:00'
        }
        
        voteTimerInterval = setInterval(() => {
            timeLeft--;
            
            if (timerText) {

                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Подсветка при остатке 10 секунд
                if (timeLeft <= 10) {
                    timerText.style.color = '#ff0000';
                    timerText.style.fontWeight = 'bold';
                }
            }
            
            if (timeLeft <= 0) {
                clearInterval(voteTimerInterval);
                showToast('Время вышло!', 'warning');
                if (!voteState.isFinished) {
                    finishVoting(getCurrentPlayers());
                }
            }
        }, 1000);
    }
    
    // подсветка активной вкладки "kickout" 
    setTimeout(() => {
        if (typeof setActiveIcon === 'function') {
            setActiveIcon(container, 'icon-left', 'vote-icon');
        } else {
            // Если setActiveIcon нет — подсвечиваем вручную
            const icons = container.querySelectorAll('.vote-icon');
            icons.forEach(icon => icon.classList.remove('vote-active'));
            const leftIcon = container.querySelector('.icon-left');
            if (leftIcon) leftIcon.classList.add('vote-active');
        }
        console.log('активирована "kickout"');
    }, 100);
    
    // навигация по нижней панели 
    container.querySelector('.icon-left')?.addEventListener('click', () => {
        console.log('Уже на странице голосования');
    });
    
    container.querySelector('.icon-center')?.addEventListener('click', () => {
        console.log('Переход на cards-all-players');
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        loadPage('cards-all-players.html', container);
    });
    
    container.querySelector('.icon-right')?.addEventListener('click', () => {
        console.log('Переход на profile');
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        loadPage('profile.html', container);
    });
    
    loadVotePlayers();
   // startVoteTimer();
    
    console.log('Vote: логика инициализирована');
    
}
    // ===== ОБРАБОТЧИК ДЛЯ СТРАНИЦЫ РЕЗУЛЬТАТОВ (results.html) =====
    if (container.querySelector('.results-header')) {
        console.log('Страница результатов загружена');

        // Тестовые данные (10 вопросов + вердикт)
        const mockReport = {
            totalScore: 65,
            verdict: 'Ладно, бывает',
            answers: [
                { questionId: 1, answerText: 'У всех разработчиков релевантные языки', score: 18, comment: 'Пишем на том, что надо. Быстро, красиво, без костылей.' },
                { questionId: 2, answerText: 'Есть все 6 ролей', score: 20, comment: 'У нас полный комплект, каждый занимается своим делом.' },
                { questionId: 3, answerText: '1 странная особенность', score: 2, comment: 'В команде есть один «интересный» товарищ.' },
                { questionId: 4, answerText: 'Нет неподходящих ролей', score: 12, comment: 'Все при деле, никто не мешает разработке.' },
                { questionId: 5, answerText: 'Лидерство у PM', score: 6, comment: 'Идеально. Менеджер ставит цели и ведет команду за собой.' },
                { questionId: 6, answerText: 'Стаж разный (от 0 до 4)', score: 5, comment: 'Микс опыта и молодости. Есть на кого опереться.' },
                { questionId: 7, answerText: 'Нет юных талантов', score: 0, comment: 'Очень жаль.' },
                { questionId: 8, answerText: 'Нет вредителей', score: 10, comment: 'Все адекваты. Редкость, но бывает.' },
                { questionId: 9, answerText: 'Нет ленивых', score: 9, comment: 'Все горят проектом, пашут как звери.' },
                { questionId: 10, answerText: 'Ни одной пары противоположностей', score: 0, comment: 'Ну и ладно.' }
            ]
        };

        // Загрузка отчёта (реальный или тестовый)
        async function loadFinalReport() {
            if (IS_TEST_MODE) {
                console.log('Тестовый режим: используем заглушку отчёта');
                renderResults(mockReport);
                return;
            }
            try {
                const res = await fetch('/api/game/final-report', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                console.log('Отчёт получен:', data);
                renderResults(data);
            } catch (err) {
                console.error('Ошибка загрузки отчёта:', err);
                showToast('Не удалось загрузить итоговый отчёт', 'error');
                renderResults(mockReport);
            }
        }

        function renderResults(data) {
            const containerCards = document.querySelector('.results-cards-container');
            if (!containerCards) return;
            containerCards.innerHTML = '';

            const answersSorted = data.answers.sort((a, b) => a.questionId - b.questionId);

            answersSorted.forEach(ans => {
                const card = document.createElement('div');
                card.className = 'results-card';
                const questionText = ans.questionText || `Вопрос ${ans.questionId}`;
                card.innerHTML = `
                <div class="results-question">${questionText}</div>
                <div class="results-description">${ans.comment || ''}</div>
                <div class="results-answer">
                    <div class="results-text">${ans.answerText}</div>
                    <div class="results-score">${ans.score > 0 ? `+${ans.score}` : ans.score}</div>
                </div>
            `;
                containerCards.appendChild(card);
            });

            const verdictCard = document.createElement('div');
            verdictCard.className = 'results-verdict';
            verdictCard.innerHTML = `
            <div class="verdict-title">Вердикт</div>
            <div class="verdict-score">${data.totalScore}</div>
            <div class="verdict-label">${data.verdict}</div>
            <div class="verdict-text">${data.verdict}</div>
        `;
            containerCards.appendChild(verdictCard);
        }

        // Кнопка "Вернуться в главное меню"
        const backBtn = container.querySelector('.results-back-btn');
        if (backBtn) {
            // Убираем старые обработчики
            const newBackBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBackBtn, backBtn);

            newBackBtn.onclick = async () => {
                if (!IS_TEST_MODE) {
                    try {
                        await fetch('/api/logout', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' }
                        });
                    } catch (err) {
                        console.error('Ошибка выхода:', err);
                    }
                }
                sessionStorage.clear();
                if (socket) socket.disconnect();
                loadPage('main-page-content.html', container);
            };
        } else {
            console.error('Кнопка .results-back-btn не найдена в DOM');
        }

        // Запускаем загрузку отчёта
        loadFinalReport();
    }
}