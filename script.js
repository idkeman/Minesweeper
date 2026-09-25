(() => {
  "use strict";

  const DIFFICULTIES = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 }
  };

  const boardEl = document.querySelector("#board");
  const difficultyEl = document.querySelector("#difficulty");
  const newGameEl = document.querySelector("#new-game");
  const mineCounterEl = document.querySelector("#mine-counter");
  const timerEl = document.querySelector("#timer");
  const statusEl = document.querySelector("#status");

  let state = null;
  let timerId = null;

  function createState(level) {
    const config = DIFFICULTIES[level];
    return {
      ...config,
      cells: [],
      started: false,
      gameOver: false,
      won: false,
      elapsed: 0,
      flags: 0,
      revealed: 0
    };
  }

  function neighbors(index) {
    const row = Math.floor(index / state.cols);
    const col = index % state.cols;
    const result = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
          result.push(r * state.cols + c);
        }
      }
    }
    return result;
  }

  function buildBoard() {
    state.cells = Array.from({ length: state.rows * state.cols }, (_, i) => ({
      index: i,
      mine: false,
      adjacent: 0,
      revealed: false,
      flagged: false,
      exploded: false,
      el: null
    }));

    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + state.cols + ", var(--cell))";

    const fragment = document.createDocumentFragment();
    for (const cell of state.cells) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "cell";
      el.setAttribute("role", "gridcell");
      el.setAttribute("aria-label", "Hidden tile");
      el.dataset.index = cell.index;
      el.addEventListener("click", onReveal);
      el.addEventListener("contextmenu", onFlag);
      el.addEventListener("dblclick", onChord);
      cell.el = el;
      fragment.appendChild(el);
    }
    boardEl.appendChild(fragment);
  }

  function plantMines(firstIndex) {
    const safe = new Set([firstIndex, ...neighbors(firstIndex)]);
    const candidates = state.cells
      .map(c => c.index)
      .filter(i => !safe.has(i));

    // Fisher-Yates shuffle.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (let i = 0; i < state.mines; i++) {
      state.cells[candidates[i]].mine = true;
    }

    for (const cell of state.cells) {
      if (!cell.mine) {
        cell.adjacent = neighbors(cell.index)
          .reduce((count, i) => count + (state.cells[i].mine ? 1 : 0), 0);
      }
    }
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (!state.gameOver) {
        state.elapsed++;
        timerEl.textContent = String(Math.min(state.elapsed, 999)).padStart(3, "0");
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function renderCell(cell, showMine = false) {
    const el = cell.el;
    el.className = "cell";
    el.textContent = "";

    if (cell.flagged && !cell.revealed) {
      el.classList.add("flagged");
      el.textContent = "⚑";
      el.setAttribute("aria-label", "Flagged tile");
      return;
    }

    if (!cell.revealed && !showMine) {
      el.setAttribute("aria-label", "Hidden tile");
      return;
    }

    if (cell.mine) {
      el.classList.add("mine");
      if (cell.exploded) el.classList.add("exploded");
      el.textContent = "✹";
      el.setAttribute("aria-label", "Mine");
      return;
    }

    if (cell.revealed) {
      el.classList.add("revealed");
      if (cell.adjacent > 0) {
        el.classList.add("n" + cell.adjacent);
        el.textContent = cell.adjacent;
      }
      el.setAttribute("aria-label", cell.adjacent ? String(cell.adjacent) + " adjacent mines" : "Empty");
    }
  }

  function reveal(index) {
    const cell = state.cells[index];
    if (state.gameOver || cell.flagged || cell.revealed) return;

    if (!state.started) {
      plantMines(index);
      state.started = true;
      startTimer();
      statusEl.textContent = "Clear every safe tile.";
    }

    if (cell.mine) {
      cell.exploded = true;
      cell.revealed = true;
      endGame(false);
      return;
    }

    const queue = [index];
    const seen = new Set();

    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);

      const target = state.cells[current];
      if (target.flagged || target.mine || target.revealed) continue;

      target.revealed = true;
      state.revealed++;

      if (target.adjacent === 0) {
        for (const next of neighbors(current)) {
          const nextCell = state.cells[next];
          if (!nextCell.revealed && !nextCell.flagged && !nextCell.mine) queue.push(next);
        }
      }
    }

    updateAll();
    checkWin();
  }

  function onReveal(event) {
    reveal(Number(event.currentTarget.dataset.index));
  }

  function onFlag(event) {
    event.preventDefault();
    if (state.gameOver) return;

    const index = Number(event.currentTarget.dataset.index);
    const cell = state.cells[index];
    if (cell.revealed) return;

    if (!cell.flagged && state.flags >= state.mines) return;

    cell.flagged = !cell.flagged;
    state.flags += cell.flagged ? 1 : -1;
    updateAll();
  }

  function onChord(event) {
    event.preventDefault();
    if (state.gameOver) return;

    const index = Number(event.currentTarget.dataset.index);
    const cell = state.cells[index];
    if (!cell.revealed || cell.adjacent === 0) return;

    const around = neighbors(index);
    const flags = around.filter(i => state.cells[i].flagged).length;

    if (flags === cell.adjacent) {
      for (const next of around) {
        if (!state.cells[next].flagged) reveal(next);
        if (state.gameOver) break;
      }
    }
  }

  function checkWin() {
    const safeTiles = state.rows * state.cols - state.mines;
    if (!state.gameOver && state.revealed >= safeTiles) endGame(true);
  }

  function endGame(won) {
    state.gameOver = true;
    state.won = won;
    stopTimer();

    for (const cell of state.cells) {
      if (won && cell.mine && !cell.flagged) {
        cell.flagged = true;
        state.flags++;
      }
      renderCell(cell, !won);
    }

    statusEl.textContent = won
      ? "🎉 You cleared the field!"
      : "💥 Boom! Click New Game to try again.";
    updateCounter();
  }

  function updateCounter() {
    mineCounterEl.textContent = String(Math.max(0, state.mines - state.flags)).padStart(2, "0");
  }

  function updateAll() {
    for (const cell of state.cells) renderCell(cell);
    updateCounter();
  }

  function newGame() {
    stopTimer();
    state = createState(difficultyEl.value);
    timerEl.textContent = "000";
    mineCounterEl.textContent = String(state.mines).padStart(2, "0");
    statusEl.textContent = "Click a tile to begin";
    buildBoard();
  }

  difficultyEl.addEventListener("change", newGame);
  newGameEl.addEventListener("click", newGame);

  newGame();
})();
