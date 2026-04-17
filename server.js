const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let gameState = {
    deck: [],
    players: {}, 
    table: [],   
    trump: null,
    turn: null
};

function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let s of suits) for (let v of values) deck.push({ suit: s, value: v });
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        if (Object.keys(gameState.players).length === 0) {
            gameState.deck = createDeck();
            gameState.trump = gameState.deck.pop();
            gameState.table = [];
        }
        
        gameState.players[socket.id] = {
            name: name,
            hand: gameState.deck.splice(0, 6)
        };
        
        gameState.turn = socket.id;
        io.emit('updateState', gameState);
    });

    socket.on('playCard', (cardIndex) => {
        const player = gameState.players[socket.id];
        if (player && player.hand[cardIndex]) {
            const card = player.hand.splice(cardIndex, 1)[0];
            gameState.table.push(card);
            
            // Простая логика: после твоего хода "ходит" бот (имитация)
            io.emit('updateState', gameState);
            
            setTimeout(() => {
                if (gameState.deck.length > 0) {
                    gameState.table.push(gameState.deck.pop()); // Бот кидает карту из колоды для примера
                    io.emit('updateState', gameState);
                }
            }, 1500);
        }
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Работает на порту ${PORT}`));