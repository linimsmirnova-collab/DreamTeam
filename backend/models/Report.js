class Report {
    // Атрибуты
    finalTeam = [];                     // List<Player>
    teamCharacteristics = new Map();    // Map<Player, List<Card>>
    questions = [];                     // List<Question> (объекты { id, text })
    totalScore = 0;
    answers = null; // здесь будет мапа с 10 ответами в формате вопросID - ответ - комент - очки
    verdict = '';

    /**
     * Конструктор принимает список активных игроков (финальную команду)
     * @param {Array} activePlayers - массив объектов Player (должны быть с полем hand)
     * @param {Array} questions - массив вопросов из БД (объекты { id, text })
     */
    constructor(activePlayers, questions) {
        this.finalTeam = activePlayers;
        this.questions = questions;

        // Заполняем teamCharacteristics: для каждого игрока все его карты
        for (const player of activePlayers) {
            this.teamCharacteristics.set(player, player.hand ? [...player.hand] : []);
        }
    }

    /**
     * Генерирует автоматические ответы на вопросы (6-10) на основе карт игроков
     * Заполняет answers (можно хранить отдельно, например, Map вопрос -> ответ)
     * @returns {Map} Map с ключом questionId и значением { answerText, score, comment }
     */
    generateAutoAnswers() {
        // Возвращает Map автоматических ответов.

        const autoAnswersMap = new Map();

        // Подготовка статистики по игрокам
        const stats = {
            experienceValues: [],
            hasPM: false,
            pmExperience: null,
            diligentJuniorCount: 0,
            pestCount: 0,
            lazyCount: 0,
            traitsList: [],
            hasPair: {
                hasCreativeAndPick: false,
                hasInfantileAndResponsible: false,
                hasPessimistAndEnterprising: false,
                hasTouchyAndAggressive: false
            }
        };

        // Словари (можно вынести в константы класса или отдельный файл)
        const positiveTraits = new Set([
            'Ответственный', 'Надежный', 'Находчивый', 'Наблюдательный',
            'Предприимчивый', 'Усидчивый', 'Терпеливый', 'Внимательный',
            'Стрессоустойчивый', 'Креативный'
        ]);
        const pestTraits = new Set([
            'Сварливый', 'Обидчивый', 'Конфликтный', 'Агрессивный', 'Инфантильный', 'Импульсивный'
        ]);
        const lazyTraits = new Set(['Ленивый', 'Медлительный']);
        const oppositePairs = [
            { pair: ['Креативный', 'Придирчивый'], condition: 'hasCreativeAndPick' },
            { pair: ['Инфантильный', 'Ответственный'], condition: 'hasInfantileAndResponsible' },
            { pair: ['Пессимист', 'Предприимчивый'], condition: 'hasPessimistAndEnterprising' },
            { pair: ['Обидчивый', 'Агрессивный'], condition: 'hasTouchyAndAggressive' }
        ];

        for (const player of this.finalTeam) {
            let playerExperience = null;
            let playerPositiveTraits = [];
            let playerRole = null;

            for (const card of player.hand) {
                const type = card.cardType;
                const name = card.name;

                if (type === 2) { // Стаж
                    const exp = parseInt(name, 10);
                    if (!isNaN(exp)) {
                        playerExperience = exp;
                        stats.experienceValues.push(exp);
                    }
                } else if (type === 1) { // Роль
                    if (name === 'Проект-менеджер') stats.hasPM = true;
                    playerRole = name;
                } else if (type === 3) { // Черта характера
                    stats.traitsList.push(name);
                    if (positiveTraits.has(name)) playerPositiveTraits.push(name);
                    if (pestTraits.has(name)) stats.pestCount++;
                    if (lazyTraits.has(name)) stats.lazyCount++;
                }
            }

            // Старательный джун: стаж 0-1 и есть положительная черта
            if (playerExperience !== null && playerExperience <= 1 && playerPositiveTraits.length > 0) {
                stats.diligentJuniorCount++;
            }
            if (stats.hasPM && playerRole === 'Проект-менеджер' && playerExperience !== null) {
                stats.pmExperience = playerExperience;
            }
        }

        // Вычисляем условия
        const highExperienceCount = stats.experienceValues.filter(exp => exp >= 3).length;
        const lowExperienceCount = stats.experienceValues.filter(exp => exp <= 1).length;
        const hasMixedExperience = lowExperienceCount > 0 && highExperienceCount > 0;
        const allLowExperience = stats.experienceValues.length > 0 && stats.experienceValues.every(exp => exp <= 1);
        const pmExperience0 = stats.hasPM && stats.pmExperience === 0;

        // Проверка пар противоположностей
        for (const pair of oppositePairs) {
            const [traitA, traitB] = pair.pair;
            if (stats.traitsList.includes(traitA) && stats.traitsList.includes(traitB)) {
                stats.hasPair[pair.condition] = true;
            }
        }

        // Правила для вопросов (id 6-10)
        const rules = {
            6: [
                { condition: () => highExperienceCount >= 3, answer: '3+ человека со стажем 3+ проекта', score: 10, comment: 'Опытные ребята, подскажут, направят, не дадут ошибиться' },
                { condition: () => hasMixedExperience, answer: 'Стаж разный (от 0 до 4)', score: 5, comment: 'Микс опыта и молодости. Есть на кого опереться' },
                { condition: () => allLowExperience, answer: 'Все со стажем 0-1 проект', score: 1, comment: 'Зелёные джуны. Учимся в бою, много ошибок' },
                { condition: () => pmExperience0, answer: 'У PMа стаж 0', score: -1, comment: 'Менеджер вообще не понимает, как управлять. Хаос' },
                { condition: () => true, answer: 'Стаж разный', score: 5, comment: 'Микс опыта и молодости' } // fallback
            ],
            7: [
                { condition: () => stats.diligentJuniorCount >= 2, answer: '2+ старательных джуна', score: 4, comment: 'Старательные котята. Ничего не умеют, но очень хотят' },
                { condition: () => stats.diligentJuniorCount === 1, answer: '1 старательный джун', score: 2, comment: 'Милый джун. Ничего не умеет, но очень старается' },
                { condition: () => true, answer: 'Нет юных талантов', score: 0, comment: 'Очень жаль' }
            ],
            8: [
                { condition: () => stats.pestCount === 0, answer: 'Нет вредителей', score: 10, comment: 'Все адекваты. Редкость, но бывает' },
                { condition: () => stats.pestCount === 1, answer: '1 вредитель', score: 2, comment: 'Главный злодей проекта. Иногда бывает невыносимо' },
                { condition: () => stats.pestCount >= 2, answer: '2+ вредителя', score: -8, comment: 'Совет злодеев. Проект — их игрушка' },
                { condition: () => true, answer: 'Нет вредителей', score: 10, comment: 'Все адекваты' }
            ],
            9: [
                { condition: () => stats.lazyCount === 0, answer: 'Нет ленивых', score: 9, comment: 'Все горят проектом, пашут как звери' },
                { condition: () => stats.lazyCount === 1, answer: '1 ленивый', score: 3, comment: 'Умело имитирует бурную деятельность' },
                { condition: () => stats.lazyCount >= 2, answer: '2+ ленивых', score: -6, comment: 'Эпидемия безделья. Проект стоит на месте' },
                { condition: () => true, answer: 'Нет ленивых', score: 9, comment: 'Все горят проектом' }
            ],
            10: [
                { condition: () => stats.hasPair.hasCreativeAndPick, answer: 'Креативный + Придирчивый', score: 3, comment: 'Креативный генерирует, Придирчивый отсеивает плохое и доводит до ума' },
                { condition: () => stats.hasPair.hasInfantileAndResponsible, answer: 'Инфантильный + Ответственный', score: -4, comment: 'Один ждёт, что всё сделают за него, второй всё делает. Рецепт выгорания' },
                { condition: () => stats.hasPair.hasPessimistAndEnterprising, answer: 'Пессимист + Предприимчивый', score: 4, comment: 'Пессимист видит риски, Предприимчивый видит возможности. Идеальное планирование' },
                { condition: () => stats.hasPair.hasTouchyAndAggressive, answer: 'Обидчивый + Агрессивный', score: -5, comment: 'Агрессивный кричит. Обидчивый обижается на неделю. Работа встаёт' },
                { condition: () => true, answer: 'Ни одной пары противоположностей', score: 0, comment: 'Ну и ладно' }
            ]
        };

        // Генерируем ответы только для вопросов 6-10
        for (const q of this.questions) {
            if (q.id >= 6 && q.id <= 10) {
                const ruleSet = rules[q.id];
                if (ruleSet) {
                    let selected = ruleSet.find(rule => rule.condition());
                    if (!selected) selected = ruleSet[ruleSet.length - 1];
                    autoAnswersMap.set(q.id, {
                        answerText: selected.answer,
                        score: selected.score,
                        comment: selected.comment
                    });
                }
            }
        }
        console.log('Автоматические ответы сгенерированы:\n', autoAnswersMap);
        return autoAnswersMap;
    }

    /**
     * Вычисляет общую сумму баллов и формирует вердикт.
     * Использует объединённую мапу ответов, хранящуюся в this.answers.
     * Каждый ответ должен содержать поле score.
     */
    calculateScore() {
        if (!this.answers || this.answers.size === 0) {
            this.totalScore = 0;
            this.verdict = 'Недостаточно данных для подсчёта баллов';
            return;
        }

        let total = 0;
        for (const [qId, answer] of this.answers.entries()) {
            total += answer.score || 0;
        }
        this.totalScore = total;

        // Формируем вердикт по шкале из вашего Excel
        if (total >= 86) this.verdict = 'Команда мечты – Идеальный баланс. Заказчик приносит пирожки';
        else if (total >= 70) this.verdict = 'Профи – Отличная работа. Мелкие шероховатости не испортили результат';
        else if (total >= 56) this.verdict = 'Справились – Нормально. Сделали, сдали, забыли';
        else if (total >= 35) this.verdict = 'Ладно, бывает – Кое-как доползли до релиза. Есть что улучшать';
        else if (total >= 20) this.verdict = 'Тревожненько – Проект на грани провала';
        else this.verdict = 'Бункер не выжил – Проект похоронен. Идём пить пиво и плакать';
    }
}

module.exports = Report;