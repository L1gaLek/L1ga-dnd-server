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

    // ===== Campaign maps (GM): параметры / разделы / карты =====
    const paramsBtn = document.getElementById('campaign-params');
    const activeMapNameEl = document.getElementById('active-map-name');

    // controlbox управляет UI для карт, а сохранение/синхронизация делается через sendMessage
    let mapsModal = null;
    let mapsModalOpen = false;

    function ensureModal() {
      if (mapsModal) return mapsModal;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay hidden';
      overlay.id = 'campaignMapsModal';

      overlay.innerHTML = `
        <div class="modal" style="max-width: 880px;">
          <div class="modal-header">
            <div>
              <div class="modal-title">Параметры карт кампании</div>
              <div class="modal-subtitle">Разделы, создание и выбор карт</div>
            </div>
            <button class="modal-close" type="button" data-close>✕</button>
          </div>

          <div class="modal-body">
            <div class="campaign-tools">
              <button type="button" id="cm-create-section">Создать раздел</button>
              <button type="button" id="cm-create-map">Создать карту</button>
            </div>

            <div class="campaign-sections-grid" id="cm-sections"></div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
      overlay.querySelector('[data-close]')?.addEventListener('click', closeModal);

      mapsModal = overlay;
      return mapsModal;
    }

    function openModal() {
      if (!ctx.isGM?.()) return;
      const m = ensureModal();
      m.classList.remove('hidden');
      mapsModalOpen = true;
      rebuildModal();
    }

    function closeModal() {
      if (!mapsModal) return;
      mapsModal.classList.add('hidden');
      mapsModalOpen = false;
    }

    function safeText(s) {
      return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    function getSectionsAndMaps() {
      const st = ctx.getState?.() || {};
      const sections = Array.isArray(st.mapSections) ? st.mapSections : [];
      const maps = Array.isArray(st.maps) ? st.maps : [];
      const currentMapId = String(st.currentMapId || '');
      return { st, sections, maps, currentMapId };
    }

    function defaultSectionName(sections) {
      let n = 1;
      const names = new Set(sections.map(s => String(s?.name || '').trim().toLowerCase()));
      while (names.has((`раздел ${n}`).toLowerCase())) n++;
      return `Раздел ${n}`;
    }

    function defaultMapName(maps) {
      // "Карта1", "Карта2" ... (без пробела, как ты просил ранее)
      let n = 1;
      const names = new Set(maps.map(m => String(m?.name || '').trim().toLowerCase()));
      while (names.has((`карта${n}`).toLowerCase())) n++;
      return `Карта${n}`;
    }

    function renderSectionCard(sec, mapsInSection, currentMapId, sections) {
      const secId = String(sec?.id || '');
      const title = safeText(sec?.name || 'Раздел');

      const mapsRows = mapsInSection.map(m => {
        const mid = String(m?.id || '');
        const active = mid && mid === currentMapId;
        return `
          <div class="cm-map-row ${active ? 'is-active' : ''}">
            <div class="cm-map-name" title="${safeText(m?.name || '')}">${safeText(m?.name || 'Карта')}</div>
            <div class="cm-map-actions">
              <button type="button" data-action="select-map" data-map-id="${safeText(mid)}">Выбрать</button>
              <button type="button" data-action="delete-map" data-map-id="${safeText(mid)}">Удалить</button>
            </div>
          </div>
        `;
      }).join('') || `<div class="cm-empty">Нет карт</div>`;

      const canDelete = sections.length > 1 || mapsInSection.length > 0; // удалять можно всегда, но UX: покажем кнопку

      return `
        <div class="cm-section" data-section-id="${safeText(secId)}">
          <div class="cm-section-head">
            <div class="cm-section-title">${title}</div>
            <div class="cm-section-actions">
              <button type="button" data-action="rename-section" data-section-id="${safeText(secId)}" title="Переименовать">✎</button>
              ${canDelete ? `<button type="button" data-action="delete-section" data-section-id="${safeText(secId)}" title="Удалить">🗑</button>` : ''}
            </div>
          </div>
          <div class="cm-maps">
            ${mapsRows}
          </div>
        </div>
      `;
    }

    function rebuildModal() {
      const modal = ensureModal();
      const sectionsEl = modal.querySelector('#cm-sections');
      const createSectionBtn = modal.querySelector('#cm-create-section');
      const createMapBtn = modal.querySelector('#cm-create-map');
      if (!sectionsEl || !createSectionBtn || !createMapBtn) return;

      // bind top buttons once
      if (!createSectionBtn.dataset.bound) {
        createSectionBtn.dataset.bound = '1';
        createSectionBtn.addEventListener('click', () => {
          if (!ctx.isGM?.()) return;
          const { sections } = getSectionsAndMaps();
          const def = defaultSectionName(sections);
          const name = prompt('Название раздела:', def);
          if (!name) return;
          const finalName = String(name).trim();
          if (!finalName) return;
          ctx.sendMessage?.({ type: 'createMapSection', name: finalName });
          // через realtime state обновится, но перерисуем для отзывчивости
          setTimeout(rebuildModal, 50);
        });
      }

      if (!createMapBtn.dataset.bound) {
        createMapBtn.dataset.bound = '1';
        createMapBtn.addEventListener('click', () => {
          if (!ctx.isGM?.()) return;
          const { sections, maps } = getSectionsAndMaps();
          if (!sections.length) {
            alert('Сначала создайте раздел.');
            return;
          }

          // Выбор раздела (выпадающий список через prompt-подбор):
          // Чтобы реально было именно dropdown — делаем небольшой встроенный диалог.
          showCreateMapDialog(sections, maps);
        });
      }

      const { sections, maps, currentMapId } = getSectionsAndMaps();

      // 2 колонки раскладкой управляет CSS
      const html = sections.map(sec => {
        const secId = String(sec?.id || '');
        const mapsIn = maps.filter(m => String(m?.sectionId || '') === secId);
        return renderSectionCard(sec, mapsIn, currentMapId, sections);
      }).join('');

      sectionsEl.innerHTML = html || `<div class="cm-empty">Разделов нет</div>`;

      // делегирование событий внутри модалки
      if (!sectionsEl.dataset.bound) {
        sectionsEl.dataset.bound = '1';
        sectionsEl.addEventListener('click', (e) => {
          const btn = e.target.closest('button');
          if (!btn) return;
          const action = btn.dataset.action;
          if (!action) return;

          if (action === 'select-map') {
            const mapId = String(btn.dataset.mapId || '');
            if (!mapId) return;
            ctx.sendMessage?.({ type: 'switchCampaignMap', mapId });
            // закрываем, чтобы было понятно, что выбор применился
            closeModal();
            return;
          }

          if (action === 'delete-map') {
            const mapId = String(btn.dataset.mapId || '');
            if (!mapId) return;
            if (!confirm('Удалить эту карту?')) return;
            ctx.sendMessage?.({ type: 'deleteCampaignMap', mapId });
            setTimeout(rebuildModal, 80);
            return;
          }

          if (action === 'rename-section') {
            const sid = String(btn.dataset.sectionId || '');
            const { sections } = getSectionsAndMaps();
            const sec = sections.find(s => String(s?.id) === sid);
            if (!sec) return;
            const name = prompt('Новое название раздела:', sec.name || 'Раздел');
            if (!name) return;
            const finalName = String(name).trim();
            if (!finalName) return;
            ctx.sendMessage?.({ type: 'renameMapSection', sectionId: sid, name: finalName });
            setTimeout(rebuildModal, 80);
            return;
          }

          if (action === 'delete-section') {
            const sid = String(btn.dataset.sectionId || '');
            handleDeleteSection(sid);
            return;
          }
        });
      }
    }

    function showCreateMapDialog(sections, maps) {
      const modal = ensureModal();

      // удаляем старый диалог, если был
      modal.querySelector('#cm-create-map-dialog')?.remove();

      const wrap = document.createElement('div');
      wrap.id = 'cm-create-map-dialog';
      wrap.className = 'cm-dialog';

      const options = sections.map(s => `<option value="${safeText(String(s.id))}">${safeText(s.name)}</option>`).join('');
      const defName = defaultMapName(maps);

      wrap.innerHTML = `
        <div class="cm-dialog-card">
          <div class="cm-dialog-title">Создать карту</div>
          <label class="cm-field">
            <div class="cm-label">Раздел</div>
            <select id="cm-new-map-section">${options}</select>
          </label>
          <label class="cm-field">
            <div class="cm-label">Название карты</div>
            <input id="cm-new-map-name" type="text" value="${safeText(defName)}" />
          </label>
          <div class="cm-dialog-actions">
            <button type="button" id="cm-new-map-cancel">Отмена</button>
            <button type="button" id="cm-new-map-create">Создать</button>
          </div>
        </div>
      `;

      // вставим сверху списка
      modal.querySelector('.modal-body')?.prepend(wrap);

      wrap.querySelector('#cm-new-map-cancel')?.addEventListener('click', () => wrap.remove());
      wrap.querySelector('#cm-new-map-create')?.addEventListener('click', () => {
        if (!ctx.isGM?.()) return;
        const secId = String(wrap.querySelector('#cm-new-map-section')?.value || '').trim();
        const name = String(wrap.querySelector('#cm-new-map-name')?.value || '').trim();
        if (!secId) { alert('Выберите раздел'); return; }
        if (!name) { alert('Введите название карты'); return; }
        ctx.sendMessage?.({ type: 'createCampaignMap', sectionId: secId, name });
        wrap.remove();
        setTimeout(rebuildModal, 120);
      });
    }

    function handleDeleteSection(sectionId) {
      if (!ctx.isGM?.()) return;
      const { sections, maps } = getSectionsAndMaps();
      const sid = String(sectionId || '').trim();
      const sec = sections.find(s => String(s?.id) === sid);
      if (!sec) return;

      const mapsIn = maps.filter(m => String(m?.sectionId || '') === sid);

      if (!mapsIn.length) {
        if (!confirm(`Удалить раздел "${sec.name}"?`)) return;
        ctx.sendMessage?.({ type: 'deleteMapSection', sectionId: sid, moveToSectionId: null });
        setTimeout(rebuildModal, 120);
        return;
      }

      // есть карты: предложим перенос или удаление
      const other = sections.filter(s => String(s?.id) !== sid);
      const choice = confirm(
        `В разделе "${sec.name}" есть ${mapsIn.length} карт.\n\nOK — перенести карты в другой раздел\nОтмена — удалить раздел вместе с картами`
      );

      if (!choice) {
        if (!confirm('Точно удалить раздел и все карты в нём?')) return;
        ctx.sendMessage?.({ type: 'deleteMapSection', sectionId: sid, moveToSectionId: null });
        setTimeout(rebuildModal, 160);
        return;
      }

      // перенос
      const list = other.map((s, i) => `${i + 1}) ${s.name}`).join('\n');
      const nStr = prompt(`В какой раздел перенести карты?\n${list}\n\nВведите номер:`, '1');
      const n = Number(nStr);
      if (!Number.isFinite(n) || n < 1 || n > other.length) return;
      const target = other[n - 1];
      ctx.sendMessage?.({ type: 'deleteMapSection', sectionId: sid, moveToSectionId: String(target.id) });
      setTimeout(rebuildModal, 160);
    }

    function refreshActiveMapLabel() {
      if (!activeMapNameEl) return;
      const { st, maps } = getSectionsAndMaps();
      const curId = String(st.currentMapId || '');
      const cur = maps.find(m => String(m?.id) === curId) || maps[0] || null;
      activeMapNameEl.textContent = cur?.name || '—';
    }

    // Кнопка "Параметры" (только GM)
    paramsBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });

    // Обновляем подпись активной карты постоянно (дёшево, зато без правок client.js)
    refreshActiveMapLabel();
    const _mapsUiTimer = setInterval(() => {
      try {
        refreshActiveMapLabel();
        if (mapsModalOpen) rebuildModal();
      } catch {}
    }, 600);

    // ===== Viewport (персональная ширина/высота рамки) =====
    const LS_VW = "dnd_viewport_cols";
    const LS_VH = "dnd_viewport_rows";
    // По умолчанию рамка 10x10 (персональная настройка, хранится в localStorage)
    let viewportCols = clamp(readIntLs(LS_VW, Number(viewportWInput?.value) || 10), 5, 80);
    let viewportRows = clamp(readIntLs(LS_VH, Number(viewportHInput?.value) || 10), 5, 80);

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
      if (paramsBtn) paramsBtn.disabled = !gm;
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
    refreshActiveMapLabel();

    // обновление инпутов при каждом новом state
    window.ControlBox = {
      setViewport,
      refreshGmInputsFromState,
      openCampaignParams: openModal,
      refreshCampaignUI: () => { refreshActiveMapLabel(); if (mapsModalOpen) rebuildModal(); },
      getViewport: () => ({ cols: viewportCols, rows: viewportRows }),
      getZoom: () => zoom
    };
  };
})();
