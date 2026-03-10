/* ============================================================
   NEON BLOCKS – script.js
   Full arcade block puzzle game
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────────
const COLS       = 10;
const ROWS       = 20;
const CELL       = 30;          // px per cell
const CLEAR_THRESH = 0.8;       // 80% fill = row clear
const SCORE_PER_ROW = 100;
const POINTS_PER_LEVEL = 500;

// Block shape definitions [rotations][rows][cols]
const SHAPES = {
  I: {
    color: '#00ffff',
    shadow: '#00ffffff',
    cells: [
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
      [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
    ]
  },
  O: {
    color: '#ffee00',
    shadow: '#ffee00ff',
    cells: [
      [[1,1],[1,1]],
    ]
  },
  T: {
    color: '#aa00ff',
    shadow: '#aa00ffff',
    cells: [
      [[0,1,0],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,1],[0,1,0]],
      [[0,0,0],[1,1,1],[0,1,0]],
      [[0,1,0],[1,1,0],[0,1,0]],
    ]
  },
  S: {
    color: '#00ff88',
    shadow: '#00ff88ff',
    cells: [
      [[0,1,1],[1,1,0],[0,0,0]],
      [[0,1,0],[0,1,1],[0,0,1]],
      [[0,0,0],[0,1,1],[1,1,0]],
      [[1,0,0],[1,1,0],[0,1,0]],
    ]
  },
  Z: {
    color: '#ff2244',
    shadow: '#ff2244ff',
    cells: [
      [[1,1,0],[0,1,1],[0,0,0]],
      [[0,0,1],[0,1,1],[0,1,0]],
      [[0,0,0],[1,1,0],[0,1,1]],
      [[0,1,0],[1,1,0],[1,0,0]],
    ]
  },
  L: {
    color: '#ff6600',
    shadow: '#ff6600ff',
    cells: [
      [[0,0,1],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,0],[0,1,1]],
      [[0,0,0],[1,1,1],[1,0,0]],
      [[1,1,0],[0,1,0],[0,1,0]],
    ]
  },
  J: {
    color: '#ff00aa',
    shadow: '#ff00aaff',
    cells: [
      [[1,0,0],[1,1,1],[0,0,0]],
      [[0,1,1],[0,1,0],[0,1,0]],
      [[0,0,0],[1,1,1],[0,0,1]],
      [[0,1,0],[0,1,0],[1,1,0]],
    ]
  }
};

const SHAPE_KEYS = Object.keys(SHAPES);

// Difficulty presets
const DIFFICULTIES = {
  easy:   { baseSpeed: 800,  multiplier: 1,   label: '×1'   },
  medium: { baseSpeed: 500,  multiplier: 1.5, label: '×1.5' },
  hard:   { baseSpeed: 280,  multiplier: 2,   label: '×2'   },
  expert: { baseSpeed: 130,  multiplier: 3,   label: '×3'   }
};

// ── State ───────────────────────────────────────────────────────
let board       = [];       // 2D grid, 0 = empty, string = color
let current     = null;     // {shape, rotation, x, y, color}
let nextPiece   = null;
let score       = 0;
let highScore   = parseInt(localStorage.getItem('neonHighScore') || '0');
let level       = 1;
let lines       = 0;
let combo       = 0;
let gameRunning = false;
let gamePaused  = false;
let dropTimer   = 0;
let lastTime    = 0;
let animFrame   = null;
let difficulty  = 'medium';
let particles   = [];
let flashRows   = [];       // rows currently flashing
let flashTimer  = 0;
let pendingClear = [];      // rows to remove after flash

// ── DOM refs ────────────────────────────────────────────────────
const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const pCanvas   = document.getElementById('particleCanvas');
const pCtx      = pCanvas.getContext('2d');
const nextCv    = document.getElementById('nextCanvas');
const nCtx      = nextCv.getContext('2d');

const elScore   = document.getElementById('score');
const elHigh    = document.getElementById('highscore');
const elLevel   = document.getElementById('level');
const elLines   = document.getElementById('lines');
const elCombo   = document.getElementById('combo');
const elMult    = document.getElementById('multiplier');
const elFinal   = document.getElementById('finalScore');
const elDiff    = document.getElementById('difficulty');
const elLb      = document.getElementById('leaderboard');

const startOverlay   = document.getElementById('startOverlay');
const pauseOverlay   = document.getElementById('pauseOverlay');
const gameoverOverlay= document.getElementById('gameoverOverlay');

// ── Audio (Web Audio API synthesized sounds) ────────────────────
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, type, duration, vol = 0.18, decay = 0.15) {
  try {
    const ac  = getAudio();
    const osc = ac.createOscillator();
    const gain= ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + duration);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration + decay);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration + decay + 0.05);
  } catch(e) { /* silent fail */ }
}

function sndDrop()     { playTone(180, 'sine', 0.08, 0.12); }
function sndRotate()   { playTone(440, 'triangle', 0.05, 0.1); }
function sndClear()    {
  playTone(880, 'sine', 0.1, 0.2);
  setTimeout(() => playTone(1100, 'sine', 0.12, 0.2), 80);
  setTimeout(() => playTone(1320, 'sine', 0.15, 0.25), 160);
}
function sndLevelUp()  {
  [330,440,550,660,880].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.1, 0.18), i * 60));
}
function sndGameOver() {
  [440,330,220,110].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.25, 0.22), i * 120));
}
function sndHardDrop() { playTone(120, 'square', 0.05, 0.15); }

// ── Board Helpers ───────────────────────────────────────────────
function initBoard() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function getShape(piece) {
  return SHAPES[piece.shape].cells[piece.rotation % SHAPES[piece.shape].cells.length];
}

function forEachCell(piece, fn) {
  const shape = getShape(piece);
  shape.forEach((row, r) => {
    row.forEach((v, c) => {
      if (v) fn(piece.x + c, piece.y + r, piece.color);
    });
  });
}

function isValid(piece, dx = 0, dy = 0, rot = null) {
  const testRot = rot !== null ? rot : piece.rotation;
  const shape = SHAPES[piece.shape].cells[testRot % SHAPES[piece.shape].cells.length];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = piece.x + c + dx;
      const ny = piece.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

// ── createBlock ─────────────────────────────────────────────────
function createBlock() {
  const key  = SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
  const def  = SHAPES[key];
  const rot  = (difficulty === 'expert') ? Math.floor(Math.random() * 4) : 0;
  return {
    shape:    key,
    color:    def.color,
    rotation: rot,
    x: Math.floor(COLS / 2) - 2,
    y: -2
  };
}

function spawnPiece() {
  current   = nextPiece || createBlock();
  nextPiece = createBlock();
  if (!isValid(current)) {
    triggerGameOver();
  }
}

// ── moveBlock ───────────────────────────────────────────────────
function moveBlock(dx, dy) {
  if (!gameRunning || gamePaused || flashRows.length) return false;
  if (isValid(current, dx, dy)) {
    current.x += dx;
    current.y += dy;
    return true;
  }
  return false;
}

// ── rotateBlock ─────────────────────────────────────────────────
function rotateBlock() {
  if (!gameRunning || gamePaused || flashRows.length) return;
  const rotations = SHAPES[current.shape].cells.length;
  const newRot = (current.rotation + 1) % rotations;
  // Wall-kick attempts
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (isValid(current, kick, 0, newRot)) {
      current.x += kick;
      current.rotation = newRot;
      sndRotate();
      return;
    }
  }
}

// ── Hard drop ───────────────────────────────────────────────────
function hardDrop() {
  if (!gameRunning || gamePaused || flashRows.length) return;
  let dropped = 0;
  while (isValid(current, 0, 1)) {
    current.y++;
    dropped++;
  }
  score += dropped * 2;
  sndHardDrop();
  lockPiece();
}

// ── Lock piece & check rows ──────────────────────────────────────
function lockPiece() {
  forEachCell(current, (x, y, color) => {
    if (y >= 0) board[y][x] = color;
  });
  sndDrop();
  checkRows();
}

// ── checkRows ───────────────────────────────────────────────────
function checkRows() {
  const toFlash = [];
  for (let r = 0; r < ROWS; r++) {
    const filled = board[r].filter(v => v !== 0).length;
    if (filled / COLS >= CLEAR_THRESH) {
      toFlash.push(r);
    }
  }

  if (toFlash.length === 0) {
    combo = 0;
    updateCombo();
    spawnPiece();
    return;
  }

  flashRows   = toFlash;
  flashTimer  = 0;
  pendingClear = toFlash;

  // Spawn particles for each row
  toFlash.forEach(r => spawnParticles(r));
  sndClear();
}

// ── removeRow ───────────────────────────────────────────────────
function removeRow(r) {
  board.splice(r, 1);
  board.unshift(Array(COLS).fill(0));
}

function clearPendingRows() {
  // Sort descending so indices stay valid
  pendingClear.sort((a, b) => b - a);
  pendingClear.forEach(r => removeRow(r));

  const cleared = pendingClear.length;
  lines += cleared;

  // updateScore
  let pts = 0;
  if (cleared === 1) pts = SCORE_PER_ROW;
  else if (cleared === 2) pts = 250;
  else if (cleared >= 3) pts = 500 * (cleared - 1);

  combo++;
  if (combo > 1) pts += 50 * combo;

  const mult = DIFFICULTIES[difficulty].multiplier;
  pts = Math.round(pts * mult);
  updateScore(pts);
  updateCombo();

  // Level progression
  const newLevel = Math.floor(lines / 5) + 1;
  if (newLevel > level) {
    level = newLevel;
    elLevel.textContent = level;
    sndLevelUp();
  }

  flashRows   = [];
  pendingClear = [];
  spawnPiece();
}

// ── updateScore ──────────────────────────────────────────────────
function updateScore(pts) {
  score += pts;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('neonHighScore', highScore);
    elHigh.textContent = highScore;
  }
  elScore.textContent = score;
  elLines.textContent = lines;

  // Flash animation
  elScore.classList.remove('score-flash');
  void elScore.offsetWidth;
  elScore.classList.add('score-flash');
}

function updateCombo() {
  elCombo.textContent = combo > 1 ? `×${combo}` : '×1';
}

// ── increaseLevel ────────────────────────────────────────────────
function getDropInterval() {
  const base = DIFFICULTIES[difficulty].baseSpeed;
  return Math.max(60, base - (level - 1) * 40);
}

// ── Particle effects ─────────────────────────────────────────────
function spawnParticles(row) {
  const y = row * CELL + CELL / 2;
  for (let c = 0; c < COLS; c++) {
    const color = board[row][c] || '#ffffff';
    const x = c * CELL + CELL / 2;
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        color,
        alpha: 1,
        size: 2 + Math.random() * 3,
        life: 0.8 + Math.random() * 0.4
      });
    }
  }
}

function updateParticles(dt) {
  particles = particles.filter(p => p.alpha > 0.01);
  particles.forEach(p => {
    p.x  += p.vx * dt * 60;
    p.y  += p.vy * dt * 60;
    p.vy += 0.15 * dt * 60; // gravity
    p.alpha -= (dt / p.life);
    if (p.alpha < 0) p.alpha = 0;
  });
}

function drawParticles() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  particles.forEach(p => {
    pCtx.save();
    pCtx.globalAlpha = p.alpha;
    pCtx.shadowColor = p.color;
    pCtx.shadowBlur  = 8;
    pCtx.fillStyle   = p.color;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.restore();
  });
}

// ── drawBoard ────────────────────────────────────────────────────
function drawBoard() {
  ctx.fillStyle = '#010509';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(0,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, ROWS * CELL);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(COLS * CELL, r * CELL);
    ctx.stroke();
  }

  // Draw locked cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = board[r][c];
      if (color) {
        // Flash effect
        const flash = flashRows.includes(r) ? Math.sin(flashTimer * 25) * 0.5 + 0.5 : 0;
        drawCell(ctx, c, r, color, flash);
      }
    }
  }

  // Draw ghost piece
  if (current && gameRunning && !gamePaused) {
    let ghostY = current.y;
    while (isValid(current, 0, ghostY - current.y + 1)) ghostY++;
    if (ghostY !== current.y) {
      const ghost = { ...current, y: ghostY };
      forEachCell(ghost, (x, y, color) => {
        if (y >= 0) drawGhostCell(ctx, x, y, color);
      });
    }
  }

  // Draw current piece
  if (current && gameRunning && !gamePaused) {
    forEachCell(current, (x, y, color) => {
      if (y >= 0) drawCell(ctx, x, y, color, 0);
    });
  }
}

function drawCell(ctx, col, row, color, flashMix = 0) {
  const x = col * CELL + 1;
  const y = row * CELL + 1;
  const s = CELL - 2;

  // Glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur  = 12 + flashMix * 20;

  // Base gradient (3D look)
  const grad = ctx.createLinearGradient(x, y, x + s, y + s);
  grad.addColorStop(0,   lighten(color, 0.4));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1,   darken(color, 0.4));
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, s, s);

  // Top-left highlight
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, s, 3);
  ctx.fillRect(x, y, 3, s);

  // Bottom-right shadow
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y + s - 3, s, 3);
  ctx.fillRect(x + s - 3, y, 3, s);

  if (flashMix > 0) {
    ctx.globalAlpha = flashMix * 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, s, s);
  }

  ctx.restore();
}

function drawGhostCell(ctx, col, row, color) {
  const x = col * CELL + 1;
  const y = row * CELL + 1;
  const s = CELL - 2;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 6;
  ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
  ctx.restore();
}

function lighten(hex, amt) {
  return adjustColor(hex, amt);
}
function darken(hex, amt) {
  return adjustColor(hex, -amt);
}
function adjustColor(hex, amt) {
  let c = hex.replace('#','');
  if (c.length === 3) c = c.split('').map(x=>x+x).join('');
  let r = parseInt(c.slice(0,2),16);
  let g = parseInt(c.slice(2,4),16);
  let b = parseInt(c.slice(4,6),16);
  r = Math.max(0,Math.min(255,Math.round(r + 255*amt)));
  g = Math.max(0,Math.min(255,Math.round(g + 255*amt)));
  b = Math.max(0,Math.min(255,Math.round(b + 255*amt)));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ── Draw Next Block Preview ───────────────────────────────────────
function drawNext() {
  nCtx.fillStyle = 'rgba(1,5,9,0.9)';
  nCtx.fillRect(0, 0, nextCv.width, nextCv.height);
  if (!nextPiece) return;

  const shape  = getShape(nextPiece);
  const rows   = shape.length;
  const cols   = shape[0].length;
  const cellSz = 24;
  const offX   = (nextCv.width  - cols * cellSz) / 2;
  const offY   = (nextCv.height - rows * cellSz) / 2;

  shape.forEach((row, r) => {
    row.forEach((v, c) => {
      if (!v) return;
      const x = offX + c * cellSz + 1;
      const y = offY + r * cellSz + 1;
      const s = cellSz - 2;
      nCtx.save();
      nCtx.shadowColor = nextPiece.color;
      nCtx.shadowBlur  = 10;
      const grad = nCtx.createLinearGradient(x, y, x+s, y+s);
      grad.addColorStop(0, lighten(nextPiece.color, 0.4));
      grad.addColorStop(1, darken(nextPiece.color, 0.3));
      nCtx.fillStyle = grad;
      nCtx.fillRect(x, y, s, s);
      nCtx.restore();
    });
  });
}

// ── Game Loop ────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!gameRunning) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  if (!gamePaused) {
    // Flash timer
    if (flashRows.length > 0) {
      flashTimer += dt;
      if (flashTimer >= 0.45) {
        clearPendingRows();
      }
    } else {
      // Normal drop
      dropTimer += dt * 1000;
      const interval = getDropInterval();
      if (dropTimer >= interval) {
        dropTimer = 0;
        if (!moveBlock(0, 1)) {
          lockPiece();
        }
      }
    }

    updateParticles(dt);
  }

  drawBoard();
  drawParticles();
  drawNext();

  animFrame = requestAnimationFrame(gameLoop);
}

// ── Game Over ────────────────────────────────────────────────────
function triggerGameOver() {
  gameRunning = false;
  cancelAnimationFrame(animFrame);
  sndGameOver();

  // Final draw
  drawBoard();

  elFinal.textContent = score;
  gameoverOverlay.classList.remove('hidden');

  // Save to leaderboard
  saveLeaderboard(score);
  renderLeaderboard();
}

// ── Leaderboard ───────────────────────────────────────────────────
function saveLeaderboard(s) {
  let lb = JSON.parse(localStorage.getItem('neonLeaderboard') || '[]');
  lb.push(s);
  lb.sort((a,b) => b - a);
  lb = lb.slice(0, 5);
  localStorage.setItem('neonLeaderboard', JSON.stringify(lb));
}

function renderLeaderboard() {
  const lb = JSON.parse(localStorage.getItem('neonLeaderboard') || '[]');
  elLb.innerHTML = lb.map((s, i) =>
    `<li><span>#${i+1} PLAYER</span><span>${s.toLocaleString()}</span></li>`
  ).join('') || '<li><span colspan="2">No scores yet</span></li>';
}

// ── Start / Pause / Restart ───────────────────────────────────────
function startGame() {
  difficulty  = elDiff.value;
  score       = 0;
  level       = 1;
  lines       = 0;
  combo       = 0;
  particles   = [];
  flashRows   = [];
  pendingClear= [];
  dropTimer   = 0;
  gameRunning = true;
  gamePaused  = false;

  elScore.textContent       = 0;
  elHigh.textContent        = highScore;
  elLevel.textContent       = 1;
  elLines.textContent       = 0;
  elCombo.textContent       = '×1';
  elMult.textContent        = DIFFICULTIES[difficulty].label;

  initBoard();
  nextPiece = createBlock();
  spawnPiece();

  startOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');

  lastTime = performance.now();
  cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (!gameRunning) return;
  gamePaused = !gamePaused;
  if (gamePaused) {
    pauseOverlay.classList.remove('hidden');
    cancelAnimationFrame(animFrame);
  } else {
    pauseOverlay.classList.add('hidden');
    lastTime  = performance.now();
    dropTimer = 0;
    animFrame = requestAnimationFrame(gameLoop);
  }
}

function restartGame() {
  cancelAnimationFrame(animFrame);
  gameRunning = false;
  startGame();
}

// ── Keyboard Controls ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!gameRunning) return;
  switch (e.code) {
    case 'ArrowLeft':  e.preventDefault(); moveBlock(-1, 0); break;
    case 'ArrowRight': e.preventDefault(); moveBlock(1, 0);  break;
    case 'ArrowDown':  e.preventDefault(); if (moveBlock(0,1)) { score++; elScore.textContent = score; } break;
    case 'ArrowUp':    e.preventDefault(); rotateBlock();    break;
    case 'Space':      e.preventDefault(); hardDrop();       break;
    case 'KeyP':       pauseGame(); break;
  }
});

// ── Button wiring ─────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('btnStart2').addEventListener('click', () => {
  if (!gameRunning) startGame();
});
document.getElementById('resumeBtn').addEventListener('click', pauseGame);
document.getElementById('btnPause').addEventListener('click', pauseGame);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('btnRestart').addEventListener('click', restartGame);

elDiff.addEventListener('change', () => {
  elMult.textContent = DIFFICULTIES[elDiff.value].label;
});

// ── Mobile touch controls ──────────────────────────────────────
document.getElementById('mobLeft').addEventListener('click', () => moveBlock(-1, 0));
document.getElementById('mobRight').addEventListener('click', () => moveBlock(1, 0));
document.getElementById('mobRotate').addEventListener('click', rotateBlock);
document.getElementById('mobDown').addEventListener('click', () => {
  if (moveBlock(0,1)) { score++; elScore.textContent = score; }
});
document.getElementById('mobDrop').addEventListener('click', hardDrop);

// Touch swipe on canvas
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < 10 && absDy < 10) {
    rotateBlock();
  } else if (absDx > absDy) {
    if (dx < 0) moveBlock(-1, 0);
    else         moveBlock(1, 0);
  } else {
    if (dy > 30) hardDrop();
  }
}, { passive: true });

// ── Init ──────────────────────────────────────────────────────
elHigh.textContent = highScore;
elMult.textContent = DIFFICULTIES['medium'].label;
renderLeaderboard();

// Draw empty board on load
initBoard();
drawBoard();
drawNext();
