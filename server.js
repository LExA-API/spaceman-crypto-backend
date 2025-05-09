require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { transferToken } = require('./solana-utils.js');
const { PublicKey } = require('@solana/web3.js');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = 'super_secret_key_change_this';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests. Try again later.'
});
app.use('/api/', apiLimiter);

// Allow public connections, but require auth for playing
function verifyToken(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    socket.user = { wallet: null }; // guest
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
}

io.use(verifyToken);

// Game State
const activePlayers = new Map();
const leaderboard = new Map();
const playerHistory = new Map();

let currentMultiplier = 1;
let gameRunning = false;

function startGameLoop() {
  setInterval(() => {
    if (gameRunning) return;

    io.emit('countdownStart');

    setTimeout(() => {
      gameRunning = true;
      currentMultiplier = 1;
      io.emit('gameStarted');

      let crashPoint = parseFloat((Math.random() * 3 + 1).toFixed(2));

      const interval = setInterval(() => {
        currentMultiplier += 0.01;
        currentMultiplier = parseFloat(currentMultiplier.toFixed(2));
        io.emit('multiplier', currentMultiplier);

        if (currentMultiplier >= crashPoint) {
          clearInterval(interval);
          io.emit('crash');
          activePlayers.clear();
          gameRunning = false;
        }
      }, 100);
    }, 30000);
  }, 45000);
}

startGameLoop();

io.on('connection', socket => {
  const walletAddress = socket.user.wallet;
  if (walletAddress) {
    console.log(`✅ Player connected: ${walletAddress}`);
  } else {
    console.log(`👀 Guest connected`);
  }

  socket.on('placeBet', ({ betAmount }) => {
    if (!walletAddress) return socket.emit('message', 'You must connect wallet to place a bet');
    if (!betAmount || betAmount <= 0) return socket.emit('message', 'Invalid bet');
    if (gameRunning) return socket.emit('message', 'Wait for next round to bet');
    if (activePlayers.has(walletAddress)) return socket.emit('message', 'Already placed bet');

    activePlayers.set(walletAddress, { cashedOut: false, betAmount });
    socket.emit('message', `Bet registered for ${betAmount} tokens`);
  });

  socket.on('cashOut', async ({ multiplier }) => {
    if (!walletAddress) return socket.emit('message', 'You must connect wallet to cash out');
    const player = activePlayers.get(walletAddress);
    if (!gameRunning || !player || player.cashedOut) return;

    try {
      const payoutAmount = Math.floor(player.betAmount * multiplier);
      await transferToken(payoutAmount, new PublicKey(walletAddress));

      socket.emit('payout', { success: true, amount: payoutAmount });
      player.cashedOut = true;

      const total = leaderboard.get(walletAddress) || 0;
      leaderboard.set(walletAddress, total + payoutAmount);

      const history = playerHistory.get(walletAddress) || [];
      history.push({ bet: player.betAmount, multiplier, won: payoutAmount });
      playerHistory.set(walletAddress, history);
    } catch (e) {
      console.error('Cashout error:', e);
      socket.emit('payout', { success: false });
    }
  });

  socket.on('getLeaderboard', () => {
    const sorted = Array.from(leaderboard.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    socket.emit('leaderboardData', sorted);
  });

  socket.on('getHistory', () => {
    if (!walletAddress) return socket.emit('historyData', []);
    const history = playerHistory.get(walletAddress) || [];
    socket.emit('historyData', history);
  });

  socket.on('disconnect', () => {
    if (walletAddress) {
      activePlayers.delete(walletAddress);
    }
  });
});

// JWT Token Issuer
app.post('/api/token', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'Wallet required' });

  const token = jwt.sign({ wallet }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
