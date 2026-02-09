// controlbox.js — управление полем/фазами/окружением (выделено из client.js)
//
// Подключение: index.html должен загрузить этот файл ДО client.js.
// client.js после инициализации вызовет window.initControlBox({...})

(function () {
  const CELL = 50;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function readIntLs(key, fallback) {
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  function writeIntLs(key, n) {
    try { localStorage.setItem(key, String(n)); } catch {}
  }

  // ВАЖНО: controlbox не знает про Supabase/DB — он дергает sendMessage и дергает callback'и из client.js
  window.initControlBox = function initControlBox(ctx) {
    // ctx: { sendMessage, isGM, isSpectator, onViewportChange, getState, boardEl, boardWrapperEl, applyRoleToUI }
    if (!ctx || typeof ctx !== "object") return;

    const board = ctx.boardEl || document.getElementById('game-board');
    const boardWrapper = ctx.boardWrapperEl || document.getElementById('board-wrapper');

    const viewportWInput = document.getElementById('board-width');
    const viewportHInput = document.getElementById('board-height');
    const applyViewportBtn = document.getElementById('create-board');

    const gmWInput = document.getElementById('board-width-gm');
    const gmHInput = document.getElementById('board-height-gm');
    const applyGmBtn = document.getElementById('create-board-gm');

    // phases
    const startExplorationBtn = document.getElementById("start-exploration");
    const startInitiativeBtn = document.getElementById("start-initiative");
    const startCombatBtn = document.getElementById("start-combat");

    // env editor
    const editEnvBtn = document.getElementById('edit-environment');
    const addWallBtn = document.getElementById('add-wall');
    const removeWallBtn = document.getElementById('remove-wall');
    const clearBoardBtn = document.getElementById('clear-board');
    const resetGameBtn = document.getElementById('reset-game');

    // ===== Viewport (персональная ширина/высота рамки) =====
    const LS_VW = "dnd_viewport_cols";
    const LS_VH = "dnd_viewport_rows";
    let viewportCols = clamp(readIntLs(LS_VW, Number(viewportWInput?.value) || 20), 5, 80);
    let viewportRows = clamp(readIntLs(LS_VH, Number(viewportHInput?.value) || 20), 5, 80);

    if (viewportWInput) viewportWInput.value = String(viewportCols);
    if (viewportHInput) viewportHInput.value = String(viewportRows);

    // делаем полосу прокрутки (включаем overflow) + задаем размер рамки в пикселях
    function applyViewportToWrapper() {
      if (!boardWrapper) return;
      boardWrapper.style.overflow = 'auto';
      boardWrapper.style.width = `${viewportCols * CELL}px`;
      boardWrapper.style.height = `${viewportRows * CELL}px`;
    }

    function setViewport(cols, rows) {
      viewportCols = clamp(Number(cols) || viewportCols, 5, 80);
      viewportRows = clamp(Number(rows) || viewportRows, 5, 80);
      if (viewportWInput) viewportWInput.value = String(viewportCols);
      if (viewportHInput) viewportHInput.value = String(viewportRows);
      writeIntLs(LS_VW, viewportCols);
      writeIntLs(LS_VH, viewportRows);
      applyViewportToWrapper();
      try { ctx.onViewportChange?.({ cols: viewportCols, rows: viewportRows }); } catch {}
    }

    applyViewportToWrapper();

    applyViewportBtn?.addEventListener('click', () => {
      if (ctx.isSpectator?.()) return;
      const cols = Number(viewportWInput?.value);
      const rows = Number(viewportHInput?.value);
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
      setViewport(cols, rows);
    });

    // ===== GM Map Size (размер "внутреннего поля" в клетках) =====
    function refreshGmInputsFromState() {
      const st = ctx.getState?.();
      if (!st) return;
      if (gmWInput) gmWInput.value = String(st.boardWidth ?? 20);
      if (gmHInput) gmHInput.value = String(st.boardHeight ?? 20);
    }

    // эти инпуты видны только GM (в client.js applyRoleToUI), но логика тут
    applyGmBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      const w = clamp(Number(gmWInput?.value) || 20, 20, 150);
      const h = clamp(Number(gmHInput?.value) || 20, 20, 150);
      if (gmWInput) gmWInput.value = String(w);
      if (gmHInput) gmHInput.value = String(h);
      ctx.sendMessage?.({ type: 'resizeBoard', width: w, height: h });
    });

    // ===== Zoom (Ctrl + Wheel) =====
    let zoom = 1;
    function applyZoom() {
      if (!board) return;
      board.style.transformOrigin = '0 0';
      board.style.transform = `scale(${zoom})`;
    }
    applyZoom();

    boardWrapper?.addEventListener('wheel', (e) => {
      // Чтобы скролл работал нормально — зум только при зажатом Ctrl
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY || 0);
      const next = clamp(zoom + (delta > 0 ? -0.1 : 0.1), 0.4, 2.5);
      if (Math.abs(next - zoom) < 1e-6) return;
      zoom = next;
      applyZoom();
    }, { passive: false });

    // ===== World phases (GM only) =====
    startExplorationBtn?.addEventListener("click", () => {
      if (!ctx.isGM?.()) return;
      ctx.sendMessage?.({ type: "startExploration" });
    });
    startInitiativeBtn?.addEventListener("click", () => {
      if (!ctx.isGM?.()) return;
      ctx.sendMessage?.({ type: "startInitiative" });
    });
    startCombatBtn?.addEventListener("click", () => {
      if (!ctx.isGM?.()) return;
      ctx.sendMessage?.({ type: "startCombat" });
    });

    // ===== Environment editor (GM only) =====
    let editEnvironment = false;
    let wallMode = null;
    let mouseDown = false;

    // батч изменений за один drag
    let dragTouched = new Set(); // "x,y"
    function keyXY(x, y) { return `${x},${y}`; }

    function setEnvButtons() {
      const gm = !!ctx.isGM?.();
      if (editEnvBtn) editEnvBtn.disabled = !gm;
      if (addWallBtn) addWallBtn.disabled = !(gm && editEnvironment);
      if (removeWallBtn) removeWallBtn.disabled = !(gm && editEnvironment);
      if (clearBoardBtn) clearBoardBtn.disabled = !gm;
      if (resetGameBtn) resetGameBtn.disabled = !gm;
    }

    editEnvBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      editEnvironment = !editEnvironment;
      wallMode = null;
      dragTouched = new Set();
      if (editEnvBtn) {
        editEnvBtn.textContent = editEnvironment ? "Редактирование окружения: ВКЛ" : "Редактирование окружения: ВЫКЛ";
      }
      setEnvButtons();
    });

    addWallBtn?.addEventListener('click', () => { if (ctx.isGM?.()) wallMode = 'add'; });
    removeWallBtn?.addEventListener('click', () => { if (ctx.isGM?.()) wallMode = 'remove'; });

    clearBoardBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      ctx.sendMessage?.({ type: 'clearBoard' });
    });

    resetGameBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      ctx.sendMessage?.({ type: 'resetGame' });
    });

    function applyWallLocal(cell, mode) {
      if (!cell) return;
      if (mode === 'add') cell.classList.add('wall');
      if (mode === 'remove') cell.classList.remove('wall');
    }

    function touchCell(cell) {
      const x = Number(cell?.dataset?.x);
      const y = Number(cell?.dataset?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const k = keyXY(x, y);
      if (dragTouched.has(k)) return; // уже трогали в этом drag
      dragTouched.add(k);
      applyWallLocal(cell, wallMode);
    }

    board?.addEventListener('mousedown', (e) => {
      if (!ctx.isGM?.() || !editEnvironment || !wallMode) return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      mouseDown = true;
      dragTouched = new Set();
      touchCell(cell);
    });

    board?.addEventListener('mouseover', (e) => {
      if (!mouseDown || !ctx.isGM?.() || !editEnvironment || !wallMode) return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      touchCell(cell);
    });

    window.addEventListener('mouseup', () => {
      if (!mouseDown) return;
      mouseDown = false;

      // одним сообщением отправляем все изменения
      if (!ctx.isGM?.() || !editEnvironment || !wallMode) return;

      const changed = [];
      dragTouched.forEach((k) => {
        const [xs, ys] = String(k).split(',');
        const x = Number(xs), y = Number(ys);
        if (Number.isFinite(x) && Number.isFinite(y)) changed.push({ x, y });
      });

      if (changed.length) {
        ctx.sendMessage?.({ type: 'bulkWalls', mode: wallMode, cells: changed });
      }

      dragTouched = new Set();
    });

    // ===== initial =====
    setEnvButtons();
    refreshGmInputsFromState();

    // обновление инпутов при каждом новом state
    window.ControlBox = {
      setViewport,
      refreshGmInputsFromState,
      getViewport: () => ({ cols: viewportCols, rows: viewportRows }),
      getZoom: () => zoom
    };
  };
})();
