require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { registerHandlers } = require('./socket/rooms');

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '16kb' }));

app.use('/', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/player', require('./routes/player'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/master', require('./routes/master'));
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins },
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