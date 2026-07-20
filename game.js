'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#f06292', // + - pink (custom)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (custom)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Skins: cada una define su propia paleta (paralela a COLORS, índice 1-8) y su
// lógica de dibujo en drawBlock. Es un eje independiente del tema claro/oscuro.
const SKINS = ['retro', 'neon', 'pastel', 'pixel'];

const SKIN_COLORS = {
  retro: COLORS,
  neon: [
    null,
    '#00f0ff', '#faff00', '#d400ff', '#00ff85',
    '#ff003c', '#2962ff', '#ff8a00', '#ff00aa',
  ],
  pastel: [
    null,
    '#a0e7e5', '#faedcb', '#cdb4db', '#b9fbc0',
    '#ffadad', '#a3c4f3', '#ffd6a5', '#ffc6ff',
  ],
  pixel: COLORS,
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-btn');
const skinSelect = document.getElementById('skin-select');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const menuRestartBtn = document.getElementById('menu-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const menuControls = document.getElementById('menu-controls');
const startLevelSelect = document.getElementById('start-level');

const MAX_START_LEVEL = 10;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, spawnSpecialNext;

// Colores del canvas dependientes del tema; se leen de las variables CSS (única fuente de verdad).
let gridColor, blockHighlight;

// Skin activa y su paleta de colores de pieza. Eje independiente del tema.
let currentSkin, activeColors;

function setSkin(skin, repaint) {
  if (!SKINS.includes(skin)) skin = 'retro';
  currentSkin = skin;
  activeColors = SKIN_COLORS[skin];
  localStorage.setItem('tetris-skin', skin);
  if (skinSelect) skinSelect.value = skin;
  // Repintar sin recargar: el bucle puede estar pausado o parado (game over).
  if (repaint) {
    if (current) draw();
    if (next) drawNext();
  }
}

function initSkin() {
  const saved = localStorage.getItem('tetris-skin');
  setSkin(SKINS.includes(saved) ? saved : 'retro', false);
}

function readThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  gridColor = cs.getPropertyValue('--grid-line').trim() || '#22222e';
  blockHighlight = cs.getPropertyValue('--block-highlight').trim() || 'rgba(255,255,255,0.12)';
}

function applyThemeButton() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  themeBtn.textContent = light ? '☀️ Claro' : '🌙 Oscuro';
}

function toggleTheme() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  const nextTheme = light ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('tetris-theme', nextTheme);
  readThemeColors();
  applyThemeButton();
  // Repintar de inmediato: el bucle podría estar pausado o parado (game over).
  if (current) draw();
  if (next) drawNext();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0, special: null };
}

function randomEffect() {
  return Math.random() < 0.5 ? 'bomb' : 'lightning';
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    const prev = lines;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    // Cada 5 líneas, la próxima pieza generada será especial.
    if (Math.floor(lines / 5) > Math.floor(prev / 5)) spawnSpecialNext = true;
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (current.special) applySpecial(current);
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (spawnSpecialNext) {
    next.special = randomEffect();
    spawnSpecialNext = false;
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function applySpecial(piece) {
  const cx = piece.x + Math.floor(piece.shape[0].length / 2);
  const cy = piece.y + Math.floor(piece.shape.length / 2);
  let destroyed = 0;
  const wipe = (r, c) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c]) {
      board[r][c] = 0;
      destroyed++;
    }
  };
  if (piece.special === 'bomb') {
    for (let r = cy - 1; r <= cy + 1; r++)
      for (let c = cx - 1; c <= cx + 1; c++)
        wipe(r, c);
  } else { // lightning: fila + columna
    for (let c = 0; c < COLS; c++) wipe(cy, c);
    for (let r = 0; r < ROWS; r++) wipe(r, cx);
  }
  score += destroyed * 5;
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Traza un rectángulo con esquinas redondeadas (para la skin pastel).
function roundRectPath(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Fondo del canvas según skin: neon fuerza negro; el resto deja ver el board-bg del tema.
function paintBg(context, w, h) {
  if (currentSkin === 'neon') {
    context.fillStyle = '#000000';
    context.fillRect(0, 0, w, h);
  } else {
    context.clearRect(0, 0, w, h);
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = activeColors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.globalAlpha = alpha ?? 1;

  if (currentSkin === 'neon') {
    // Efecto glow con sombra del propio color.
    context.shadowBlur = size * 0.5;
    context.shadowColor = color;
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    context.shadowBlur = 0;
  } else if (currentSkin === 'pastel') {
    // Bloques suaves con esquinas redondeadas.
    context.fillStyle = color;
    roundRectPath(context, px, py, s, s, size * 0.28);
    context.fill();
    context.fillStyle = blockHighlight;
    roundRectPath(context, px, py, s, s * 0.4, size * 0.28);
    context.fill();
  } else if (currentSkin === 'pixel') {
    // Bloque plano + bisel de textura pixel-art (luz arriba/izq, sombra abajo/der).
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    const b = Math.max(2, Math.floor(size * 0.15));
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.fillRect(px, py, s, b);
    context.fillRect(px, py, b, s);
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(px, py + s - b, s, b);
    context.fillRect(px + s - b, py, b, s);
  } else {
    // Retro: cuadrado plano con highlight superior (estilo original).
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    context.fillStyle = blockHighlight;
    context.fillRect(px, py, s, 4);
  }

  context.globalAlpha = 1;
}

function drawSpecialBadge(context, px, py, size, type) {
  context.font = `${size * 0.9}px serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(type === 'bomb' ? '💣' : '⚡', px, py);
}

function drawGrid() {
  // En neon el fondo es negro fijo: rejilla tenue para que no destaque sobre el tema.
  ctx.strokeStyle = currentSkin === 'neon' ? 'rgba(255,255,255,0.06)' : gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  paintBg(ctx, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  if (current.special) {
    const px = (current.x + current.shape[0].length / 2) * BLOCK;
    const py = (current.y + current.shape.length / 2) * BLOCK;
    drawSpecialBadge(ctx, px, py, BLOCK, current.special);
  }
}

function drawNext() {
  const NB = 30;
  paintBg(nextCtx, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);

  if (next.special) {
    const px = (offX + shape[0].length / 2) * NB;
    const py = (offY + shape.length / 2) * NB;
    drawSpecialBadge(nextCtx, px, py, NB, next.special);
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

// Nivel con el que arranca la próxima partida (persistido en localStorage).
function readStartLevel() {
  const saved = parseInt(localStorage.getItem('tetris-start-level'), 10);
  return Number.isInteger(saved) && saved >= 1 && saved <= MAX_START_LEVEL ? saved : 1;
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    // Mostrar el menú de pausa y ocultar el botón de reinicio del game over.
    restartBtn.classList.add('hidden');
    menuControls.classList.add('hidden');
    pauseMenu.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver && !paused) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = readStartLevel();
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  spawnSpecialNext = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // P/Escape abren y cierran el menú de pausa (única navegación por teclado).
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // Con el menú abierto (o game over) se ignoran los inputs de pieza.
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeBtn.addEventListener('click', toggleTheme);
skinSelect.addEventListener('change', e => setSkin(e.target.value, true));

// Menú de pausa.
resumeBtn.addEventListener('click', togglePause);
menuRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => menuControls.classList.toggle('hidden'));
startLevelSelect.addEventListener('change', () => {
  localStorage.setItem('tetris-start-level', startLevelSelect.value);
});

readThemeColors();
applyThemeButton();
initSkin();
// Reflejar el nivel inicial persistido en el selector.
startLevelSelect.value = String(readStartLevel());
init();
