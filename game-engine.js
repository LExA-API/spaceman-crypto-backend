let currentMultiplier = 1.0;
let crashPoint = Math.random() * 10 + 1.5;

function startGame(io) {
  currentMultiplier = 1.0;
  crashPoint = Math.random() * 10 + 1.5;
  console.log('Crash Point:', crashPoint.toFixed(2));

  const interval = setInterval(() => {
    currentMultiplier += 0.1;
    io.emit('multiplier', currentMultiplier.toFixed(2));

    if (currentMultiplier >= crashPoint) {
      io.emit('crash', crashPoint.toFixed(2));
      clearInterval(interval);
    }
  }, 500);
}

module.exports = { startGame };