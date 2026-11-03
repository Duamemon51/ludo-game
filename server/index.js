const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { registerHandlers } = require('./socket/rooms');

const app = express();
app.use(cors());

app.get('/', (req, res) => res.send('Ludo server is running'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000, // detect dropped connections within about 20 seconds
  pingTimeout: 10000,
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  registerHandlers(io, socket);
  socket.on('disconnect', () => console.log('Player left:', socket.id));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server running on port ' + PORT));