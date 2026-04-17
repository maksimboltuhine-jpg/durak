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
    players: {}, // { socketId: { hand: [], name: "" } }
    table: [],   // [[card1, card2], ...]
    trump: null
};

// Функция создания колоды
function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let s of suits) for (let v of values) deck.push({ suit: s, value: v });
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);

    socket.on('joinGame', (name) => {
        if (Object.keys(gameState.players).length === 0) {
            gameState.deck = createDeck();
            gameState.trump = gameState.deck.pop();
        }
        
        gameState.players[socket.id] = {
            name: name,
            hand: gameState.deck.splice(0, 6)
        };
        
        io.emit('updateState', gameState);
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('updateState', gameState);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));