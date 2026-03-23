/**
 * Leela Game — Full frontend implementation
 * No backend, all logic and animations on client
 */

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLongHtml(text) {
  if (!text) return '';
  return escapeHtml(text).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
}

/** Краткое + развёрнутое описание клетки (без заголовка с номером) */
function cellInterpretationBodyHTML(cellNum) {
  const c = LEELA_CELLS[cellNum];
  if (!c) return '';
  const short = escapeHtml(c.desc);
  const longRaw = c.descLong && String(c.descLong).trim() ? String(c.descLong).trim() : '';
  if (!longRaw) return `<p class="cell-desc-short">${short}</p>`;
  return `<p class="cell-desc-short">${short}</p><details class="cell-desc-details"><summary class="cell-desc-summary">Полное описание клетки</summary><div class="cell-desc-long">${formatLongHtml(longRaw)}</div></details>`;
}

async function loadCellLongDescriptions() {
  const urls = ['assets/cell-long.json', 'assets/cell-long-deep.json'];
  for (let u = 0; u < urls.length; u++) {
    try {
      const r = await fetch(urls[u], { cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json();
      Object.keys(j).forEach((k) => {
        const n = Number(k);
        if (LEELA_CELLS[n]) LEELA_CELLS[n].descLong = j[k];
      });
    } catch (e) {
      console.warn('loadCellLongDescriptions', urls[u], e);
    }
  }
}

// Порядок обхода поля: номера клеток 1…72 подряд (змейка на доске — см. BOARD_LAYOUT в game-data.js).
// Ход: следующая клетка = текущая + значение кубика; затем применяются стрелы/змеи и ограничения 69–71.
const PATH = Array.from({ length: 72 }, (_, i) => i + 1);

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
    /** Намерение / вопрос для сеанса, по одному на игрока (индекс как у players) */
    this.intentions = [''];
    /** Какого игрока позицию и историю показываем на панели и на доске */
    this.viewingPlayerIndex = 0;
  }

  ensureIntentionsLength() {
    while (this.intentions.length < this.players.length) this.intentions.push('');
    this.intentions.length = this.players.length;
  }

  addPlayer() {
    const num = this.players.length + 1;
    this.players.push(`Игрок ${num}`);
    this.positions.push(68);
    this.intentions.push('');
  }

  removePlayer(index) {
    if (this.players.length <= 1) return;
    this.players.splice(index, 1);
    this.positions.splice(index, 1);
    this.intentions.splice(index, 1);
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
      const landing = this.moveForward(pos, 6);
      let newPos = this.applyCellEffect(landing);
      this.positions[playerIdx] = newPos;
      this.addHistory(playerName, newPos, 'Шесть!');
      return {
        success: true,
        rollAgain: true,
        newPosition: newPos,
        landingCell: landing,
        message: 'Шесть! Бросайте снова.',
        isArrow: !!ARROWS[landing],
        isSnake: !!SNAKES[landing]
      };
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
    this.intentions = [''];
    this.reset();
    this.gameStarted = false;
  }
}

// DOM & UI
let game;
let boardElement;
let piecesContainer;

function setupMobileNav() {
  const header = document.getElementById('siteHeader');
  const toggle = document.getElementById('headerMenuToggle');
  const nav = document.getElementById('headerNav');
  if (!header || !toggle || !nav) return;

  const mqDesktop = window.matchMedia('(min-width: 901px)');

  function closeNav() {
    header.classList.remove('header--nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Открыть меню');
    document.body.style.overflow = '';
  }

  function openNav() {
    header.classList.add('header--nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Закрыть меню');
    document.body.style.overflow = 'hidden';
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (header.classList.contains('header--nav-open')) closeNav();
    else openNav();
  });

  nav.querySelectorAll('a[href]').forEach((a) => {
    a.addEventListener('click', () => closeNav());
  });

  const resetBtn = document.getElementById('resetGameBtn');
  if (resetBtn) {
    resetBtn.addEventListener(
      'click',
      () => {
        closeNav();
      },
      true
    );
  }

  document.addEventListener('click', (e) => {
    if (mqDesktop.matches) return;
    if (!header.classList.contains('header--nav-open')) return;
    if (header.contains(e.target)) return;
    closeNav();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });

  window.addEventListener('resize', () => {
    if (mqDesktop.matches) closeNav();
  });
}

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
      game.intentions = [''];
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

  setupMobileNav();

  // startGame is triggered from focus popup (see index.html)
  const diceEl = document.getElementById('dice');
  if (diceEl) diceEl.addEventListener('click', rollDice);

  buildBoard();
  renderPlayersList();
  setupFocusPopup();
  setupPlayerIntentionInput();
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

  const playerIntentionBlock = document.getElementById('playerIntentionBlock');
  if (playerIntentionBlock) playerIntentionBlock.hidden = true;

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
  game.ensureIntentionsLength();

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
  updatePlayerIntentionUI();
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
        /* Просматриваемого игрока не переключаем на ходящего — только по вкладке */
        updateGameUI();
        renderPlayerViewTabs();
        updatePieces();
        updateBoardHighlight();
        if (!result.noMove) {
          if (game.viewingPlayerIndex === rollingPlayerIdx) {
            showInterpretation(result, rollingPlayerIdx);
          } else {
            updateInterpretationForViewingPlayer();
          }
        }
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

function setupFocusPopup() {
  const focusPopup = document.getElementById('focusPopup');
  const focusPopupStart = document.getElementById('focusPopupStart');
  const startGameBtn = document.getElementById('startGame');
  const focusQuestion = document.getElementById('focusQuestion');
  if (!focusPopup || !focusPopupStart || !startGameBtn || !focusQuestion) return;

  let focusStep = 0;

  function closeFocusPopup() {
    focusPopup.setAttribute('aria-hidden', 'true');
    focusPopup.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function applyFocusStep() {
    const focusTitle = document.getElementById('focusPopupTitle');
    const focusDesc = document.getElementById('focusPopupDesc');
    game.ensureIntentionsLength();
    const multi = isMultiplayerGame();
    focusQuestion.value = game.intentions[focusStep] || '';
    if (focusTitle) {
      focusTitle.textContent = multi
        ? `${game.players[focusStep]}: какой ваш запрос?`
        : 'Какой ваш запрос?';
    }
    if (focusDesc) {
      focusDesc.textContent = multi
        ? 'По очереди каждый игрок вводит своё намерение или вопрос для этой партии.'
        : 'Перед началом игры сформулируйте вопрос или намерение. На чём вы хотите сосредоточиться в этом сеансе?';
    }
    focusPopupStart.textContent = multi
      ? (focusStep < game.players.length - 1 ? 'Далее' : 'Начать игру')
      : 'Продолжить';
  }

  function openFocusPopup() {
    game.ensureIntentionsLength();
    focusStep = 0;
    applyFocusStep();
    focusPopup.setAttribute('aria-hidden', 'false');
    focusPopup.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  startGameBtn.addEventListener('click', openFocusPopup);

  focusPopupStart.addEventListener('click', () => {
    game.intentions[focusStep] = focusQuestion.value.trim();
    const multi = isMultiplayerGame();
    if (multi && focusStep < game.players.length - 1) {
      focusStep += 1;
      applyFocusStep();
      return;
    }
    closeFocusPopup();
    startGame();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focusPopup.classList.contains('is-open')) {
      game.intentions[focusStep] = focusQuestion.value.trim();
      closeFocusPopup();
    }
  });
}

function setupPlayerIntentionInput() {
  const input = document.getElementById('playerIntentionInput');
  if (!input) return;
  input.addEventListener('input', () => {
    if (!game || !game.gameStarted) return;
    game.ensureIntentionsLength();
    game.intentions[game.viewingPlayerIndex] = input.value;
  });
}

function updatePlayerIntentionUI() {
  const block = document.getElementById('playerIntentionBlock');
  const input = document.getElementById('playerIntentionInput');
  if (!block || !input || !game) return;
  if (!game.gameStarted) {
    block.hidden = true;
    return;
  }
  game.ensureIntentionsLength();
  block.hidden = false;
  const v = game.viewingPlayerIndex;
  input.value = game.intentions[v] ?? '';
}

function renderPlayerViewTabs() {
  const wrap = document.getElementById('playerViewTabs');
  if (!wrap || !game.gameStarted) return;

  if (!isMultiplayerGame()) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    updatePlayerIntentionUI();
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
      const intInput = document.getElementById('playerIntentionInput');
      if (intInput && game.gameStarted) {
        game.ensureIntentionsLength();
        game.intentions[game.viewingPlayerIndex] = intInput.value.trim();
      }
      game.viewingPlayerIndex = i;
      renderPlayerViewTabs();
      updateGameUI();
      updatePieces();
      updateBoardHighlight();
      updateHistory();
      updateInterpretationForViewingPlayer();
      updatePlayerIntentionUI();
    });
    wrap.appendChild(btn);
  });
  updatePlayerIntentionUI();
}

function updateInterpretationForViewingPlayer() {
  const interp = document.getElementById('cellInterpretation');
  if (!interp) return;
  const pos = game.positions[game.viewingPlayerIndex];
  const cellData = LEELA_CELLS[pos];
  if (!cellData) return;
  interp.innerHTML = `<div class="cell-interpretation-head"><strong>${pos}. ${escapeHtml(cellData.name)}</strong></div><div class="cell-interpretation-body">${cellInterpretationBodyHTML(pos)}</div>`;
}

function showInterpretation(result, moverPlayerIdx) {
  const interp = document.getElementById('cellInterpretation');
  const cell = result.newPosition;
  const cellData = LEELA_CELLS[cell];
  if (!cellData) return;

  let text = `<div class="cell-interpretation-head"><strong>${cell}. ${escapeHtml(cellData.name)}</strong></div><div class="cell-interpretation-body">${cellInterpretationBodyHTML(cell)}</div>`;

  if (result.isArrow && result.landingCell) {
    const landData = LEELA_CELLS[result.landingCell];
    text += `<p class="cell-move-note cell-move-note--arrow"><em>↑ Стрела с клетки ${result.landingCell} (${escapeHtml(landData?.name || '')}) подняла вас вверх!</em></p>`;
  }
  if (result.isSnake && result.landingCell) {
    const landData = LEELA_CELLS[result.landingCell];
    text += `<p class="cell-move-note cell-move-note--snake"><em>↓ Змея с клетки ${result.landingCell} (${escapeHtml(landData?.name || '')}) опустила вас вниз. Задумайтесь над этим уроком.</em></p>`;
  }
  game.ensureIntentionsLength();
  const intention = game.intentions[moverPlayerIdx] != null ? game.intentions[moverPlayerIdx].trim() : '';
  if (intention) {
    const who = escapeHtml(game.players[moverPlayerIdx] || '');
    text += `<p class="cell-intention-context">В контексте намерения (${who}): «${escapeHtml(intention)}» — обратите внимание на то, как эта клетка резонирует с этим запросом.</p>`;
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

  updatePlayerIntentionUI();
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

function historyRowHTML(h) {
  const cellData = LEELA_CELLS[h.cell];
  const player = escapeHtml(h.player);
  const note = escapeHtml(h.note);
  const cellName = escapeHtml(h.cellName || '');
  const longRaw = cellData && cellData.descLong ? String(cellData.descLong).trim() : '';
  let inner = `<div class="game-history-line">${player}: ${h.cell}. ${cellName} — ${note}</div>`;
  if (longRaw) {
    inner += `<details class="game-history-details"><summary class="game-history-summary">Полное описание клетки ${h.cell}</summary><div class="cell-desc-long">${formatLongHtml(longRaw)}</div></details>`;
  }
  return `<div class="game-history-row">${inner}</div>`;
}

function updateHistory() {
  const hist = document.getElementById('gameHistory');
  const viewerName = game.players[game.viewingPlayerIndex];
  const rows = game.history.filter(h => h.player === viewerName);
  hist.innerHTML = rows.map((h) => historyRowHTML(h)).join('');
}

window.addEventListener('resize', () => {
  if (game && game.gameStarted) updatePieces();
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadCellLongDescriptions();
  initGame();
});
