# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Tetris en JavaScript vanilla (ES6+) con HTML5 Canvas. **Sin dependencias, sin build, sin `package.json`.** Tres archivos: `index.html`, `style.css`, `game.js`.

## Ejecutar

No hay que compilar. Abrir `index.html` directamente (`open index.html`) o servir con `python3 -m http.server 8000`. No hay tests ni linter configurados.

## Arquitectura (game.js)

Todo el juego vive en `game.js` en **ámbito global**, sin módulos ni clases. El estado de partida son variables `let` a nivel de módulo (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`). `init()` las reinicia todas y arranca el bucle; el botón de reinicio y el arranque inicial llaman a `init()`.

Puntos clave para orientarse:

- **`board`**: matriz `ROWS × COLS`; cada celda es `0` (vacía) o índice 1–7 en `COLORS`/`PIECES` que identifica el tipo de pieza.
- **Piezas**: matrices cuadradas en `PIECES` (índice 1–7). La rotación (`rotateCW`) es transposición + reverso de filas; `tryRotate` prueba wall kicks `[0,-1,1,-2,2]`.
- **`collide(shape, ox, oy)`**: única función de validación de posición; la usan movimiento, rotación, drops y `ghostY`. Toda comprobación de límites/solape pasa por aquí.
- **Bucle** (`loop`): `requestAnimationFrame`; acumula `dt` en `dropAccum` y baja una fila al superar `dropInterval`. Pausa/reanudar cancela y relanza el `animId`.
- **Progresión**: nivel = `floor(lines/10)+1`; velocidad = `max(100, 1000 - (level-1)*90)` ms. Puntuación en `LINE_SCORES` × nivel.

## Al modificar

- **`COLS`, `ROWS` y `BLOCK` en `game.js` están acoplados a los atributos `width`/`height` del `<canvas id="board">` en `index.html`** (deben ser `COLS*BLOCK` × `ROWS*BLOCK`). Cambiar uno sin el otro rompe el render.
- `game.js` obtiene todos sus nodos del DOM por `id` al cargar (líneas ~31-41): añadir/renombrar un elemento en el HUD implica actualizar tanto `index.html` como esas referencias.
- Respeta el estilo actual: funciones sueltas, `const`/`let`, sin punto y coma opcional omitido (se usan siempre), comentarios escasos y en español.
