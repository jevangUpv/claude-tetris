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
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const overlayStats = document.getElementById('overlay-stats');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const recordsBox = document.getElementById('records-box');
const recordsList = document.getElementById('records-list');
const resetRecordsBtn = document.getElementById('reset-records-btn');

// combo: cadena actual de bloqueos consecutivos que limpian línea; bestCombo: mayor cadena de la partida.
// maxLines: mayor nº de líneas limpiadas de una vez en la partida.
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, spawnSpecialNext, combo, bestCombo, maxLines, recordSaved;

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

// Colores del canvas dependientes del tema; se leen de las variables CSS (única fuente de verdad).
let gridColor, blockHighlight;

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
    if (cleared > maxLines) maxLines = cleared;
    // Cada 5 líneas, la próxima pieza generada será especial.
    if (Math.floor(lines / 5) > Math.floor(prev / 5)) spawnSpecialNext = true;
    updateHUD();
  }
  return cleared;
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
  const cleared = clearLines();
  // El combo crece con cada bloqueo que limpia ≥1 línea; se rompe si no limpia ninguna.
  if (cleared > 0) {
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    updateHUD();
  } else {
    combo = 0;
  }
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
  bestComboEl.textContent = bestCombo;
  maxLinesEl.textContent = maxLines;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = blockHighlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawSpecialBadge(context, px, py, size, type) {
  context.font = `${size * 0.9}px serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(type === 'bomb' ? '💣' : '⚡', px, py);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
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

// ---- Tabla de récords (localStorage) ----
function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(r => r && typeof r.score === 'number')
      .map(r => ({
        name: String(r.name || 'ANÓNIMO').slice(0, 12),
        score: r.score,
        lines: typeof r.lines === 'number' ? r.lines : 0,
        combo: typeof r.combo === 'number' ? r.combo : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// ¿Entra la puntuación en el top 5?
function qualifies(value) {
  if (value <= 0) return false;
  const records = loadRecords();
  if (records.length < MAX_RECORDS) return true;
  return value > records[records.length - 1].score;
}

// Inserta una entrada y devuelve su posición final (o -1 si no entró en el top).
function addRecord(entry) {
  const records = loadRecords();
  records.push(entry);
  records.sort((a, b) => b.score - a.score);
  const trimmed = records.slice(0, MAX_RECORDS);
  saveRecords(trimmed);
  return trimmed.indexOf(entry);
}

// Pinta la lista de récords; resalta la fila highlightIndex (usar -1 para ninguna).
function renderRecords(highlightIndex) {
  const records = loadRecords();
  recordsList.innerHTML = '';
  if (!records.length) {
    const li = document.createElement('li');
    li.className = 'record-empty';
    li.textContent = 'Sin récords todavía';
    recordsList.appendChild(li);
    return;
  }
  records.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === highlightIndex) li.className = 'record-highlight';
    const rank = document.createElement('span');
    rank.className = 'record-rank';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'record-name';
    name.textContent = r.name; // textContent evita inyección de HTML
    const sc = document.createElement('span');
    sc.className = 'record-score';
    sc.textContent = r.score.toLocaleString();
    li.append(rank, name, sc);
    recordsList.appendChild(li);
  });
}

function saveScore() {
  if (recordSaved) return;
  const name = (nameInput.value.trim() || 'ANÓNIMO').slice(0, 12);
  const index = addRecord({ name, score, lines, combo: bestCombo });
  recordSaved = true;
  nameEntry.classList.add('hidden');
  renderRecords(index);
}

function resetRecords() {
  localStorage.removeItem(RECORDS_KEY);
  renderRecords(-1);
}

// Pantalla de inicio: muestra los récords y espera a que el jugador pulse Jugar.
function showStartScreen() {
  // Sin partida activa: bloquea los controles (los guardas comprueban gameOver).
  gameOver = true;
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = 'Pulsa Jugar para empezar';
  overlayStats.classList.add('hidden');
  nameEntry.classList.add('hidden');
  recordsBox.classList.remove('hidden');
  resetRecordsBtn.classList.remove('hidden');
  restartBtn.textContent = 'Jugar';
  renderRecords(-1);
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlayStats.textContent = `Mejor combo: ${bestCombo} · Máx. líneas de una vez: ${maxLines}`;
  overlayStats.classList.remove('hidden');
  recordsBox.classList.remove('hidden');
  resetRecordsBtn.classList.remove('hidden');
  restartBtn.textContent = 'Reiniciar';
  recordSaved = false;
  if (qualifies(score)) {
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    renderRecords(-1);
    overlay.classList.remove('hidden');
    nameInput.focus();
  } else {
    nameEntry.classList.add('hidden');
    renderRecords(-1);
    overlay.classList.remove('hidden');
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlayStats.classList.add('hidden');
    nameEntry.classList.add('hidden');
    recordsBox.classList.add('hidden');
    resetRecordsBtn.classList.add('hidden');
    restartBtn.textContent = 'Reiniciar';
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
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  spawnSpecialNext = false;
  combo = 0;
  bestCombo = 0;
  maxLines = 0;
  recordSaved = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
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
saveScoreBtn.addEventListener('click', saveScore);
resetRecordsBtn.addEventListener('click', resetRecords);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') {
    e.preventDefault();
    saveScore();
  }
});

readThemeColors();
applyThemeButton();
showStartScreen();
