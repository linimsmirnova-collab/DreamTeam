// Карта
class Card {
    id = null
    cardType = null
    name = null
    #isOpen = false

    get isOpen(){
        return this.#isOpen
    }
    open() {
        this.#isOpen = true
    }

    constructor(id, cardType, name) {
        this.id = id;
        this.cardType = cardType;
        this.name = name;
    }
}

module.exports = Card;