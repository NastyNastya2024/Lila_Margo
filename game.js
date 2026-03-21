/**
 * Leela Game — Full frontend implementation
 * No backend, all logic and animations on client
 */

// Path for snake movement (cell order on board)
const PATH = [
  1,2,3,4,5,6,7,8,9,
  18,17,16,15,14,13,12,11,10,
  19,20,21,22,23,24,25,26,27,
  36,35,34,33,32,31,30,29,28,
  37,38,39,40,41,42,43,44,45,
  54,53,52,51,50,49,48,47,46,
  55,56,57,58,59,60,61,62,63,
  72,71,70,69,68,67,66,65,64
];

const GOAL_CELL = 68;
const ENTRY_CELL = 6;

class LeelaGame {
  constructor() {
    this.players = ['Игрок 1'];
    this.positions = [68];
    this.currentPlayerIndex = 0;
    this.gameStarted = false;
    this.inGame = false;
    this.sixCount = 0;
    this.positionBeforeSixes = 68;
    this.history = [];
    this.question = '';
    /** Какого игрока позицию и историю показываем на панели и на доске */
    this.viewingPlayerIndex = 0;
  }

  addPlayer() {
    const num = this.players.length + 1;
    this.players.push(`Игрок ${num}`);
    this.positions.push(68);
  }

  removePlayer(index) {
    if (this.players.length <= 1) return;
    this.players.splice(index, 1);
    this.positions.splice(index, 1);
    if (this.currentPlayerIndex >= this.players.length) {
      this.currentPlayerIndex = 0;
    }
    if (this.viewingPlayerIndex >= this.players.length) {
      this.viewingPlayerIndex = Math.max(0, this.players.length - 1);
    }
  }

  rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }

  getPathIndex(cell) {
    return PATH.indexOf(cell);
  }

  getCellFromPathIndex(idx) {
    if (idx < 0) return PATH[0];
    if (idx >= PATH.length) return PATH[PATH.length - 1];
    return PATH[idx];
  }

  moveForward(fromCell, steps) {
    const idx = this.getPathIndex(fromCell);
    let newIdx = idx + steps;
    if (newIdx >= PATH.length) newIdx = PATH.length - 1;
    return this.getCellFromPathIndex(newIdx);
  }

  applyCellEffect(cell) {
    if (ARROWS[cell]) return ARROWS[cell];
    if (SNAKES[cell]) return SNAKES[cell];
    return cell;
  }

  canMoveFromCell(cell, diceValue) {
    if (cell === 69) return RESTRICTED_MOVES[69].includes(diceValue);
    if (cell === 70) return RESTRICTED_MOVES[70].includes(diceValue);
    if (cell === 71) return RESTRICTED_MOVES[71].includes(diceValue);
    return true;
  }

  makeMove(diceValue) {
    const playerIdx = this.currentPlayerIndex;
    let pos = this.positions[playerIdx];
    const playerName = this.players[playerIdx];

    // Not yet in game - need 6 to enter
    if (!this.inGame) {
      if (diceValue !== 6) {
        return { success: false, message: `${playerName}, бросайте кубик. Игра начнётся, если выпадет шесть.` };
      }
      this.inGame = true;
      this.positions[playerIdx] = ENTRY_CELL;
      this.addHistory(playerName, ENTRY_CELL, 'Вход в игру');
      return { success: true, rollAgain: true, newPosition: ENTRY_CELL, message: 'Шесть! Добро пожаловать в игру. Проследуйте в заблуждение. Бросайте снова.' };
    }

    // Check restricted moves (69, 70, 71) — can only move with specific numbers
    if (!this.canMoveFromCell(pos, diceValue)) {
      this.nextPlayer();
      return { success: true, noMove: true, message: `На клетке ${pos} можно ходить только на ${RESTRICTED_MOVES[pos].join(', ')}. Выпало ${diceValue}. Ход переходит к следующему игроку.` };
    }

    // Three sixes rule
    if (diceValue === 6) {
      this.sixCount++;
      if (this.sixCount === 1) {
        this.positionBeforeSixes = pos;
      }
      if (this.sixCount === 3) {
        return { success: true, rollAgain: true, message: 'Три шестёрки! Следующий бросок определит возврат. Бросайте снова.' };
      }
      if (this.sixCount >= 4) {
        return { success: true, rollAgain: true, message: 'Бросайте пока не выпадет другое число.' };
      }
      // 1 or 2 sixes - move and roll again
      let newPos = this.moveForward(pos, 6);
      newPos = this.applyCellEffect(newPos);
      this.positions[playerIdx] = newPos;
      this.addHistory(playerName, newPos, 'Шесть!');
      return { success: true, rollAgain: true, newPosition: newPos, message: 'Шесть! Бросайте снова.', isArrow: ARROWS[pos], isSnake: SNAKES[pos] };
    }

    // Non-6 after sixes
    if (this.sixCount > 0) {
      if (this.sixCount === 3) {
        pos = this.positionBeforeSixes;
        let newPos = this.moveForward(pos, diceValue);
        newPos = this.applyCellEffect(newPos);
        this.positions[playerIdx] = newPos;
        this.sixCount = 0;
        this.addHistory(playerName, newPos, `Возврат после 3 шестёрок, ход на ${diceValue}`);
        const won = newPos === GOAL_CELL;
        if (won) {
          return { success: true, newPosition: newPos, won: true, message: `${playerName} достиг Космическое Сознание!` };
        }
        this.nextPlayer();
        return { success: true, newPosition: newPos, rollAgain: false };
      }
      if (this.sixCount >= 4) {
        const totalSteps = this.sixCount * 6 + diceValue;
        let newPos = this.moveForward(this.positionBeforeSixes, totalSteps);
        newPos = this.applyCellEffect(newPos);
        this.positions[playerIdx] = newPos;
        this.sixCount = 0;
        this.addHistory(playerName, newPos, `Сумма ${totalSteps} шагов`);
        const won = newPos === GOAL_CELL;
        if (won) {
          return { success: true, newPosition: newPos, won: true, message: `${playerName} достиг Космическое Сознание!` };
        }
        this.nextPlayer();
        return { success: true, newPosition: newPos, rollAgain: false };
      }
      // 1 or 2 sixes - we already moved, now add diceValue from current position
      pos = this.positions[playerIdx];
    }

    this.sixCount = 0;

    let newPos = this.moveForward(pos, diceValue);
    const landingCell = newPos;
    const arrowTarget = ARROWS[newPos];
    const snakeTarget = SNAKES[newPos];

    if (arrowTarget) {
      newPos = arrowTarget;
      this.addHistory(playerName, newPos, `Стрела вверх!`);
    } else if (snakeTarget) {
      newPos = snakeTarget;
      this.addHistory(playerName, newPos, `Змея вниз!`);
    } else {
      this.addHistory(playerName, newPos, `Ход на ${diceValue}`);
    }

    this.positions[playerIdx] = newPos;

    const won = newPos === GOAL_CELL;
    if (won) {
      return { success: true, newPosition: newPos, won: true, message: `${playerName} достиг Космическое Сознание!` };
    }

    this.nextPlayer();
    return { success: true, newPosition: newPos, landingCell, rollAgain: false, isArrow: !!arrowTarget, isSnake: !!snakeTarget };
  }

  nextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  addHistory(playerName, cell, note) {
    this.history.unshift({
      player: playerName,
      cell,
      note,
      cellName: LEELA_CELLS[cell]?.name || ''
    });
    if (this.history.length > 1000) this.history.pop();
  }

  reset() {
    this.positions = this.players.map(() => 68);
    this.currentPlayerIndex = 0;
    this.inGame = false;
    this.sixCount = 0;
    this.history = [];
    this.viewingPlayerIndex = 0;
  }

  /** Соло, один игрок, позиции сброшены, вопрос и флаг партии очищены */
  resetAllSettings() {
    this.players = ['Игрок 1'];
    this.reset();
    this.gameStarted = false;
    this.question = '';
  }
}

// DOM & UI
let game;
let boardElement;
let piecesContainer;

function initGame() {
  game = new LeelaGame();
  boardElement = document.getElementById('gameBoard');
  piecesContainer = document.getElementById('gamePieces');

  document.getElementById('gameMode').addEventListener('change', (e) => {
    const multi = e.target.value === 'multi';
    document.getElementById('addPlayer').style.display = multi ? 'block' : 'none';
    document.getElementById('playersList').style.display = multi ? 'block' : 'none';
    if (!multi && game.players.length > 1) {
      game.players = ['Игрок 1'];
      game.positions = [68];
      renderPlayersList();
    }
  });

  document.getElementById('addPlayer').addEventListener('click', () => {
    game.addPlayer();
    renderPlayersList();
  });

  const resetGameBtn = document.getElementById('resetGameBtn');
  if (resetGameBtn) {
    resetGameBtn.addEventListener('click', () => {
      if (game.gameStarted) {
        if (!confirm('Сбросить игру и вернуться к настройкам?')) return;
      }
      resetGameFully();
    });
  }

  // startGame is triggered from focus popup (see index.html)
  const diceEl = document.getElementById('dice');
  if (diceEl) diceEl.addEventListener('click', rollDice);

  buildBoard();
  renderPlayersList();
}

function resetGameFully() {
  if (!game) return;

  const focusPopup = document.getElementById('focusPopup');
  if (focusPopup) {
    focusPopup.setAttribute('aria-hidden', 'true');
    focusPopup.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  game.resetAllSettings();

  const modeEl = document.getElementById('gameMode');
  if (modeEl) modeEl.value = 'solo';

  const addPlayerBtn = document.getElementById('addPlayer');
  if (addPlayerBtn) addPlayerBtn.style.display = 'none';

  const setup = document.getElementById('gameSetup');
  const controls = document.getElementById('gameControls');
  if (setup) setup.style.display = 'block';
  if (controls) controls.style.display = 'none';

  const diceEl = document.getElementById('dice');
  if (diceEl) {
    diceEl.removeAttribute('data-value');
    diceEl.classList.remove('dice-disabled', 'rolling');
  }

  const focusQuestion = document.getElementById('focusQuestion');
  if (focusQuestion) focusQuestion.value = '';

  const interp = document.getElementById('cellInterpretation');
  if (interp) interp.innerHTML = '';

  const nameEl = document.getElementById('currentPlayerName');
  if (nameEl) nameEl.textContent = '';

  const turnLine = document.getElementById('gameTurnLine');
  if (turnLine) {
    turnLine.textContent = '';
    turnLine.hidden = true;
  }

  const statusEl = document.getElementById('gameStatus');
  if (statusEl) statusEl.textContent = '';

  renderPlayersList();
  renderPlayerViewTabs();
  updatePieces();
  updateBoardHighlight();
  updateHistory();
}

function buildBoard() {
  boardElement.innerHTML = '';
  // BOARD_LAYOUT: row 0 = top (72…64), row 7 = bottom (1-9)
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 9; col++) {
      const cellNum = BOARD_LAYOUT[row][col];
      const cellData = LEELA_CELLS[cellNum];
      const isArrow = cellNum in ARROWS;
      const isSnake = cellNum in SNAKES;
      const isGoal = cellNum === GOAL_CELL;

      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.cell = cellNum;
      if (isArrow) cell.classList.add('arrow-cell');
      if (isSnake) cell.classList.add('snake-cell');
      if (isGoal) cell.classList.add('goal-cell');

      cell.innerHTML = `<span class="cell-num">${cellNum}</span>`;
      boardElement.appendChild(cell);
    }
  }
}

function renderPlayersList() {
  const list = document.getElementById('playersList');
  if (document.getElementById('gameMode').value === 'solo') {
    list.innerHTML = '';
    list.style.display = 'none';
    return;
  }
  list.style.display = 'block';
  list.innerHTML = game.players.map((name, i) => `
    <div class="player-row">
      <input type="text" value="${name}" data-idx="${i}" class="player-name-input">
      ${game.players.length > 1 ? `<button class="btn-remove" data-idx="${i}">×</button>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.player-name-input').forEach(input => {
    input.addEventListener('change', (e) => {
      game.players[+e.target.dataset.idx] = e.target.value;
    });
  });
  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      game.removePlayer(+e.target.dataset.idx);
      renderPlayersList();
    });
  });
}

function startGame() {
  game.gameStarted = true;
  game.reset();
  const focusInput = document.getElementById('focusQuestion');
  game.question = focusInput ? focusInput.value.trim() : '';

  const setup = document.getElementById('gameSetup');
  const controls = document.getElementById('gameControls');
  const diceEl = document.getElementById('dice');
  if (setup) setup.style.display = 'none';
  if (controls) controls.style.display = 'block';
  if (diceEl) diceEl.removeAttribute('data-value');

  updateGameUI();
  renderPlayerViewTabs();
  updatePieces();
  updateBoardHighlight();
  updateInterpretationForViewingPlayer();
}

function rollDice() {
  const diceEl = document.getElementById('dice');
  if (!diceEl || diceEl.classList.contains('dice-disabled')) return;

  const rollingPlayerIdx = game.currentPlayerIndex;

  diceEl.classList.add('dice-disabled', 'rolling');

  // Quick value changes during roll
  let rolls = 0;
  const rollInterval = setInterval(() => {
    diceEl.dataset.value = Math.floor(Math.random() * 6) + 1;
    rolls++;
    if (rolls > 8) {
      clearInterval(rollInterval);
      const value = game.rollDice();
      diceEl.dataset.value = value;

      const result = game.makeMove(value);

      if (result.success) {
        game.viewingPlayerIndex = rollingPlayerIdx;
        updateGameUI();
        renderPlayerViewTabs();
        updatePieces();
        updateBoardHighlight();
        if (!result.noMove) showInterpretation(result);
        document.getElementById('gameStatus').textContent = result.message;

        if (result.won) {
          setTimeout(() => {
            diceEl.classList.remove('dice-disabled', 'rolling');
            if (confirm(`${result.message} Хотите сыграть ещё раз?`)) {
              game.reset();
              const setup = document.getElementById('gameSetup');
              const controls = document.getElementById('gameControls');
              if (setup) setup.style.display = 'block';
              if (controls) controls.style.display = 'none';
              diceEl.removeAttribute('data-value');
            }
          }, 500);
        } else if (result.rollAgain) {
          updateHistory();
          setTimeout(() => {
            diceEl.classList.remove('dice-disabled', 'rolling');
          }, 400);
          return;
        }
      } else {
        document.getElementById('gameStatus').textContent = result.message;
      }
      updateHistory();
      setTimeout(() => {
        diceEl.classList.remove('dice-disabled', 'rolling');
      }, 450);
    }
  }, 70);
}

function isMultiplayerGame() {
  return document.getElementById('gameMode').value === 'multi' && game.players.length > 1;
}

function renderPlayerViewTabs() {
  const wrap = document.getElementById('playerViewTabs');
  if (!wrap || !game.gameStarted) return;

  if (!isMultiplayerGame()) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  wrap.innerHTML = '';
  game.players.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'player-view-tab' + (i === game.viewingPlayerIndex ? ' is-active' : '');
    btn.dataset.idx = String(i);
    btn.textContent = name;
    btn.setAttribute('aria-pressed', i === game.viewingPlayerIndex ? 'true' : 'false');
    btn.addEventListener('click', () => {
      game.viewingPlayerIndex = i;
      renderPlayerViewTabs();
      updateGameUI();
      updatePieces();
      updateBoardHighlight();
      updateHistory();
      updateInterpretationForViewingPlayer();
    });
    wrap.appendChild(btn);
  });
}

function updateInterpretationForViewingPlayer() {
  const interp = document.getElementById('cellInterpretation');
  if (!interp) return;
  const pos = game.positions[game.viewingPlayerIndex];
  const cellData = LEELA_CELLS[pos];
  if (!cellData) return;
  interp.innerHTML = `<strong>${pos}. ${cellData.name}</strong><br>${cellData.desc}`;
}

function showInterpretation(result) {
  const interp = document.getElementById('cellInterpretation');
  const cell = result.newPosition;
  const cellData = LEELA_CELLS[cell];
  if (!cellData) return;

  let text = `<strong>${cell}. ${cellData.name}</strong><br>${cellData.desc}`;

  if (result.isArrow && result.landingCell) {
    const landData = LEELA_CELLS[result.landingCell];
    text += `<br><em>↑ Стрела с клетки ${result.landingCell} (${landData?.name || ''}) подняла вас вверх!</em>`;
  }
  if (result.isSnake && result.landingCell) {
    const landData = LEELA_CELLS[result.landingCell];
    text += `<br><em>↓ Змея с клетки ${result.landingCell} (${landData?.name || ''}) опустила вас вниз. Задумайтесь над этим уроком.</em>`;
  }
  if (game.question) {
    text += `<br><br>В контексте вашего вопроса: "${game.question}" — обратите внимание на то, как эта клетка резонирует с вашим запросом.`;
  }

  interp.innerHTML = text;
}

function updateGameUI() {
  const v = game.viewingPlayerIndex;
  document.getElementById('currentPlayerName').textContent = game.players[v] || '';

  const turnLine = document.getElementById('gameTurnLine');
  if (turnLine) {
    if (isMultiplayerGame()) {
      turnLine.hidden = false;
      turnLine.textContent = `Сейчас ходит: ${game.players[game.currentPlayerIndex]}`;
    } else {
      turnLine.hidden = true;
      turnLine.textContent = '';
    }
  }

  document.getElementById('gameStatus').textContent = game.inGame
    ? 'Бросайте кубик'
    : 'Выбросьте 6 для входа в игру';
}

function updatePieces() {
  piecesContainer.innerHTML = '';
  const cells = boardElement.querySelectorAll('.cell');
  const wrapper = document.querySelector('.game-board-area');
  if (!wrapper) return;

  const wrapperRect = wrapper.getBoundingClientRect();
  const pieceSize = 12;

  game.positions.forEach((pos, i) => {
    const { row, col } = getCellPosition(pos);
    const cellIdx = row * 9 + col;
    const cellEl = cells[cellIdx];
    if (!cellEl) return;

    const rect = cellEl.getBoundingClientRect();
    const offsetX = rect.left - wrapperRect.left + rect.width / 2 - pieceSize;
    const offsetY = rect.top - wrapperRect.top + rect.height / 2 - pieceSize;

    const piece = document.createElement('div');
    piece.className = `piece piece-${i}${i === game.viewingPlayerIndex ? ' piece--viewing' : ''}`;
    piece.style.left = `${offsetX}px`;
    piece.style.top = `${offsetY}px`;
    piece.title = game.players[i];
    piecesContainer.appendChild(piece);
  });
}

function updateBoardHighlight() {
  boardElement.querySelectorAll('.cell').forEach(c => c.classList.remove('current'));
  const pos = game.positions[game.viewingPlayerIndex];
  const { row, col } = getCellPosition(pos);
  const cellIdx = row * 9 + col;
  const cells = boardElement.querySelectorAll('.cell');
  if (cells[cellIdx]) cells[cellIdx].classList.add('current');
}

function updateHistory() {
  const hist = document.getElementById('gameHistory');
  const viewerName = game.players[game.viewingPlayerIndex];
  const rows = game.history.filter(h => h.player === viewerName);
  hist.innerHTML = rows.map(h =>
    `<div class="game-history-row">${h.player}: ${h.cell}. ${h.cellName} — ${h.note}</div>`
  ).join('');
}

window.addEventListener('resize', () => {
  if (game && game.gameStarted) updatePieces();
});

document.addEventListener('DOMContentLoaded', initGame);
