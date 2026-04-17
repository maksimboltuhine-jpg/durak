const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Веса карт для сравнения (кто кого бьет)
const CARD_WEIGHTS = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };

let game = {
    deck: [], trump: null, table: [], // table: [{attack: card, defense: null}]
    players: [], // [{id: socket.id, name: 'Player', hand: [], isBot: false}]
    attackerIndex: 0,
    status: 'waiting' // waiting, playing, gameover
};

function createDeck(size) {
    const suits = ['♠', '♣', '♥', '♦'];
    let values = [];
    if (size === 24) values = ['9', '10', 'J', 'Q', 'K', 'A'];
    if (size === 36) values = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    if (size === 52) values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    let deck = [];
    for (let s of suits) for (let v of values) deck.push({ suit: s, value: v, weight: CARD_WEIGHTS[v] });
    return deck.sort(() => Math.random() - 0.5);
}

function dealCards() {
    // Сначала добирает атакующий, потом защищающийся
    const order = [game.attackerIndex, 1 - game.attackerIndex];
    for (let i of order) {
        while (game.players[i].hand.length < 6 && game.deck.length > 0) {
            game.players[i].hand.push(game.deck.pop());
        }
    }
}

function canBeat(attackCard, defenseCard) {
    if (defenseCard.suit === attackCard.suit && defenseCard.weight > attackCard.weight) return true;
    if (defenseCard.suit === game.trump.suit && attackCard.suit !== game.trump.suit) return true;
    return false;
}

function canToss(card) {
    if (game.table.length === 0) return true; // Первая карта хода
    return game.table.some(pair => 
        pair.attack.value === card.value || (pair.defense && pair.defense.value === card.value)
    );
}

function botTurn() {
    if (game.status !== 'playing') return;
    const botIndex = game.players.findIndex(p => p.isBot);
    if (botIndex === -1) return;

    const bot = game.players[botIndex];
    const isAttacker = game.attackerIndex === botIndex;
    
    setTimeout(() => {
        if (isAttacker) {
            // Бот атакует или подкидывает
            let cardToPlay = bot.hand.find(c => canToss(c));
            if (cardToPlay) {
                let cIndex = bot.hand.indexOf(cardToPlay);
                bot.hand.splice(cIndex, 1);
                game.table.push({ attack: cardToPlay, defense: null });
            } else {
                // Нечего подкинуть -> Бито
                if (game.table.length > 0 && game.table.every(p => p.defense)) {
                    finishTurn(true);
                }
            }
        } else {
            // Бот защищается
            let unbeatPair = game.table.find(p => !p.defense);
            if (unbeatPair) {
                // Ищем самую слабую карту, чтобы побить
                let validCards = bot.hand.filter(c => canBeat(unbeatPair.attack, c)).sort((a,b) => a.weight - b.weight);
                if (validCards.length > 0) {
                    let cIndex = bot.hand.indexOf(validCards[0]);
                    unbeatPair.defense = bot.hand.splice(cIndex, 1)[0];
                    // Если бот отбился, проверяем, может ли игрок подкинуть
                } else {
                    // Бот не может побить -> Берет
                    finishTurn(false);
                }
            }
        }
        io.emit('updateState', game);
    }, 1500); // Задержка для реалистичности
}

function finishTurn(isBito) {
    const defenderIndex = 1 - game.attackerIndex;
    if (isBito) {
        game.table = []; // Карты в отбой (просто удаляем)
        dealCards();
        game.attackerIndex = defenderIndex; // Ход переходит
    } else {
        // Защищающийся берет карты
        game.table.forEach(p => {
            game.players[defenderIndex].hand.p


ush(p.attack);
            if (p.defense) game.players[defenderIndex].hand.push(p.defense);
        });
        game.table = [];
        dealCards();
        // Атакующий ходит снова (защищающийся пропускает ход)
    }
    botTurn();
}

io.on('connection', (socket) => {
    socket.on('startBotGame', (deckSize) => {
        game.players = [
            { id: socket.id, name: 'Вы', hand: [], isBot: false },
            { id: 'bot', name: 'Бот', hand: [], isBot: true }
        ];
        game.deck = createDeck(deckSize);
        game.trump = game.deck[0]; // Козырь - нижняя карта
        game.attackerIndex = 0; // Игрок ходит первым
        game.table = [];
        game.status = 'playing';
        dealCards();
        io.emit('updateState', game);
    });

    socket.on('playCard', (cardIndex) => {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1 || game.status !== 'playing') return;

        const player = game.players[playerIndex];
        const isAttacker = game.attackerIndex === playerIndex;
        const card = player.hand[cardIndex];

        if (isAttacker) {
            if (canToss(card) && game.table.length < 6) {
                player.hand.splice(cardIndex, 1);
                game.table.push({ attack: card, defense: null });
                botTurn();
            }
        } else {
            let unbeatPair = game.table.find(p => !p.defense);
            if (unbeatPair && canBeat(unbeatPair.attack, card)) {
                player.hand.splice(cardIndex, 1);
                unbeatPair.defense = card;
                botTurn();
            }
        }
        io.emit('updateState', game);
    });

    socket.on('actionBtn', (action) => { // 'take' или 'pass'
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) return;
        const isAttacker = game.attackerIndex === playerIndex;

        if (action === 'pass' && isAttacker && game.table.every(p => p.defense)) finishTurn(true);
        if (action === 'take' && !isAttacker && game.table.some(p => !p.defense)) finishTurn(false);
        io.emit('updateState', game);
    });

    socket.on('disconnect', () => {
        game.players = game.players.filter(p => p.id !== socket.id);
        if (game.players.length === 0) game.status = 'waiting';
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Game rules server running on ${PORT}`));