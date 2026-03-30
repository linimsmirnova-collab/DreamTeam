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
}