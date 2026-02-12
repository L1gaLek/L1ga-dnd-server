/* char_sheet/sheet-tab-inventory-and-notes.js */
(function(){
  const CS = window.CharSheet = window.CharSheet || {};
  function updateCoinsTotal(root, sheet) {
    if (!root || !sheet) return;
    const out = root.querySelector('[data-coins-total]');
    if (!out) return;

    let denom = String(sheet?.coinsView?.denom || "gp").toLowerCase();
    const denomSel = root.querySelector('[data-coins-total-denom]');
    if (denomSel && denomSel.value) denom = String(denomSel.value).toLowerCase();

    const base = CS.bindings.COIN_TO_CP[denom] || 100;
    const total = coinsTotalCp(sheet) / base;
    out.value = fmtCoinNumber(total);
  }

  
  // ===== LIVE UI UPDATERS (без полного ререндера) =====
  function bindNotesEditors(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    const sheet = player.sheet.parsed;
    if (!sheet.notes || typeof sheet.notes !== "object") sheet.notes = {};
    if (!sheet.notes.details || typeof sheet.notes.details !== "object") sheet.notes.details = {};
    if (!Array.isArray(sheet.notes.entries)) sheet.notes.entries = [];

    const main = root.querySelector("#sheet-main");
    if (!main) return;

    // add note button
    const addBtn = main.querySelector("[data-note-add]");
    if (addBtn) {
      if (!canEdit) addBtn.disabled = true;
      addBtn.addEventListener("click", () => {
        if (!canEdit) return;

        // choose next Заметка-N
        const titles = sheet.notes.entries.map(e => String(e?.title || "")).filter(Boolean);
        let maxN = 0;
        for (const t of titles) {
          const mm = /^Заметка-(\d+)$/i.exec(t.trim());
          if (mm) maxN = Math.max(maxN, parseInt(mm[1], 10) || 0);
        }
        const nextN = maxN + 1;

        sheet.notes.entries.push({ title: `Заметка-${nextN}`, text: "", collapsed: false });
        CS.bindings.scheduleSheetSave(player);

        // rerender current tab to show new note
        const freshVm = CS.viewmodel.toViewModel(sheet, player.name);
        main.innerHTML = renderNotesTab(freshVm);
        CS.bindings.bindEditableInputs(root, player, canEdit);
        bindSkillBoostDots(root, player, canEdit);
        bindAbilityAndSkillEditors(root, player, canEdit);
        bindNotesEditors(root, player, canEdit);
      });
    }

    // title edit
    const titleInputs = main.querySelectorAll("input[data-note-title]");
    titleInputs.forEach(inp => {
      const idx = parseInt(inp.getAttribute("data-note-title") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) { inp.disabled = true; return; }

      inp.addEventListener("input", () => {
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries[idx].title = inp.value;
        CS.bindings.scheduleSheetSave(player);
      });
    });

    // text edit
    const textAreas = main.querySelectorAll("textarea[data-note-text]");
    textAreas.forEach(ta => {
      const idx = parseInt(ta.getAttribute("data-note-text") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) { ta.disabled = true; return; }

      ta.addEventListener("input", () => {
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries[idx].text = ta.value;
        CS.bindings.scheduleSheetSave(player);
      });
    });

    // toggle collapse
    const toggleBtns = main.querySelectorAll("[data-note-toggle]");
    toggleBtns.forEach(btn => {
      const idx = parseInt(btn.getAttribute("data-note-toggle") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) btn.disabled = true;

      btn.addEventListener("click", () => {
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries[idx].collapsed = !sheet.notes.entries[idx].collapsed;
        CS.bindings.scheduleSheetSave(player);

        const freshVm = CS.viewmodel.toViewModel(sheet, player.name);
        main.innerHTML = renderNotesTab(freshVm);
        CS.bindings.bindEditableInputs(root, player, canEdit);
        bindSkillBoostDots(root, player, canEdit);
        bindAbilityAndSkillEditors(root, player, canEdit);
        bindNotesEditors(root, player, canEdit);
      });
    });

    // delete
    const delBtns = main.querySelectorAll("[data-note-del]");
    delBtns.forEach(btn => {
      const idx = parseInt(btn.getAttribute("data-note-del") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) btn.disabled = true;

      btn.addEventListener("click", () => {
        if (!canEdit) return;
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries.splice(idx, 1);
        CS.bindings.scheduleSheetSave(player);

        const freshVm = CS.viewmodel.toViewModel(sheet, player.name);
        main.innerHTML = renderNotesTab(freshVm);
        CS.bindings.bindEditableInputs(root, player, canEdit);
        bindSkillBoostDots(root, player, canEdit);
        bindAbilityAndSkillEditors(root, player, canEdit);
        bindNotesEditors(root, player, canEdit);
      });
    });
  }

  // ===== Inventory (coins) editors =====
  function bindInventoryEditors(root, player, canEdit) {
    if (!root) return;
    // как и в bindSlotEditors: root (sheetContent) переиспользуется.
    // Храним актуальные ссылки, чтобы монеты не писались в sheet старого игрока.
    root.__invCoinsState = { player, canEdit };
    const getState = () => root.__invCoinsState || { player, canEdit };

    if (root.__invCoinsBound) return;
    root.__invCoinsBound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-coin-op][data-coin-key]");
      if (!btn) return;

      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curCanEdit) return;

      const sheet = curPlayer?.sheet?.parsed;
      if (!sheet || typeof sheet !== "object") return;

      const op = btn.getAttribute("data-coin-op");
      const key = btn.getAttribute("data-coin-key");
      if (!key) return;

      const box = btn.closest(`[data-coin-box="${key}"]`) || root;
      const deltaInp = box.querySelector(`[data-coin-delta="${key}"]`);
      const coinInp = root.querySelector(`input[data-sheet-path="coins.${key}.value"]`);
      if (!coinInp) return;

      const delta = Math.max(0, CS.utils.safeInt(deltaInp?.value, 1));
      const cur = Math.max(0, CS.utils.safeInt(coinInp.value, 0));
      const next = (op === "plus") ? (cur + delta) : Math.max(0, cur - delta);

      setByPath(sheet, `coins.${key}.value`, next);
      coinInp.value = String(next);

      updateCoinsTotal(root, sheet);
      CS.bindings.scheduleSheetSave(curPlayer);
    });
  }

  // ===== Slots (spell slots) editors =====
  function renderInventoryTab(vm) {
    const denom = String(vm?.coinsViewDenom || "gp").toLowerCase();

    const exchangeTooltip = `
      <div class="exchange-tooltip" role="tooltip">
        <div class="exchange-title">Обменный курс</div>
        <div class="exchange-table">
          <div class="ex-row ex-head">
            <div class="ex-cell">Монета</div>
            <div class="ex-cell">ММ</div>
            <div class="ex-cell">СМ</div>
            <div class="ex-cell">ЭМ</div>
            <div class="ex-cell">ЗМ</div>
            <div class="ex-cell">ПМ</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell">Медная (мм)</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/10</div>
            <div class="ex-cell">1/50</div>
            <div class="ex-cell">1/100</div>
            <div class="ex-cell">1/1,000</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell">Серебряная (см)</div>
            <div class="ex-cell">10</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/5</div>
            <div class="ex-cell">1/10</div>
            <div class="ex-cell">1/100</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell">Электрумовая (эм)</div>
            <div class="ex-cell">50</div>
            <div class="ex-cell">5</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/2</div>
            <div class="ex-cell">1/20</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell">Золотая (зм)</div>
            <div class="ex-cell">100</div>
            <div class="ex-cell">10</div>
            <div class="ex-cell">2</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/10</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell">Платиновая (пм)</div>
            <div class="ex-cell">1,000</div>
            <div class="ex-cell">100</div>
            <div class="ex-cell">20</div>
            <div class="ex-cell">10</div>
            <div class="ex-cell">1</div>
          </div>
        </div>
      </div>
    `;


    const coinBox = (key, title, abbr, row) => `
      <div class="coin-box" data-coin-box="${CS.utils.escapeHtml(key)}" data-coin-row="${row}">
        <div class="coin-top">
          <div class="coin-pill coin-pill--${CS.utils.escapeHtml(key)}">${CS.utils.escapeHtml(title)} <span class="coin-pill__abbr">(${CS.utils.escapeHtml(abbr)})</span></div>
        </div>

        <div class="coin-line">
          <input
            class="coin-value"
            type="number"
            min="0"
            max="999999"
            data-sheet-path="coins.${CS.utils.escapeHtml(key)}.value"
          />

          <div class="coin-adjust">
            <button class="coin-btn coin-btn--minus" data-coin-op="minus" data-coin-key="${CS.utils.escapeHtml(key)}">-</button>
            <input class="coin-delta" type="number" min="0" max="999999" value="1" data-coin-delta="${CS.utils.escapeHtml(key)}" />
            <button class="coin-btn coin-btn--plus" data-coin-op="plus" data-coin-key="${CS.utils.escapeHtml(key)}">+</button>
          </div>
        </div>
      </div>
    `;

    const totalBox = `
      <div class="coin-box coin-box--total" data-coin-box="total">
        <div class="coin-top coin-top--between">
          <div class="coin-pill">Итог</div>
          <select class="coin-select" data-coins-total-denom data-sheet-path="coinsView.denom">
            <option value="cp" ${denom === "cp" ? "selected" : ""}>мм</option>
            <option value="sp" ${denom === "sp" ? "selected" : ""}>см</option>
            <option value="ep" ${denom === "ep" ? "selected" : ""}>эм</option>
            <option value="gp" ${denom === "gp" ? "selected" : ""}>зм</option>
            <option value="pp" ${denom === "pp" ? "selected" : ""}>пм</option>
          </select>
        </div>

        <div class="coin-line">
          <input class="coin-value coin-total" type="text" readonly data-coins-total value="0" />
          <div class="coin-total-hint">по курсу D&D</div>
        </div>
      </div>
    `;

    return `
      <div class="sheet-section">
        <h3>Инвентарь</h3>

        <div class="sheet-card fullwidth coins-card">
          <div class="coins-head">
            <h4 style="margin:0">Монеты</h4>
            <div class="exchange-pill" tabindex="0">
              Обменный курс
              ${exchangeTooltip}
            </div>
          </div>

          <div class="coins-grid coins-grid--row1">
            ${coinBox("cp", "Медная", "мм", 1)}
            ${coinBox("sp", "Серебряная", "см", 1)}
            ${coinBox("gp", "Золотая", "зм", 1)}
          </div>

          <div class="coins-grid coins-grid--row2">
            ${coinBox("ep", "Электрумовая", "эм", 2)}
            ${coinBox("pp", "Платиновая", "пм", 2)}
            ${totalBox}
          </div>
        </div>

        <div class="sheet-card fullwidth" style="margin-top:10px">
          <h4>Предметы</h4>
          <textarea class="sheet-textarea" rows="6" data-sheet-path="text.inventoryItems.value" placeholder="Список предметов (можно редактировать)..."></textarea>
        </div>

        <div class="sheet-card fullwidth" style="margin-top:10px">
          <h4>Сокровища</h4>
          <textarea class="sheet-textarea" rows="6" data-sheet-path="text.inventoryTreasures.value" placeholder="Сокровища, драгоценности, артефакты (можно редактировать)..."></textarea>
        </div>
      </div>
    `;
  }

  function renderNotesTab(vm) {
    const entries = Array.isArray(vm?.notesEntries) ? vm.notesEntries : [];
    const renderEntry = (e, idx) => {
      const title = (e && typeof e.title === "string" && e.title) ? e.title : `Заметка-${idx + 1}`;
      const text = (e && typeof e.text === "string") ? e.text : "";
      const collapsed = !!(e && e.collapsed);
      return `
        <div class="note-card" data-note-idx="${idx}">
          <div class="note-header">
            <input class="note-title" type="text" value="${CS.utils.escapeHtml(title)}" data-note-title="${idx}" />
            <div class="note-actions">
              <button class="note-btn" data-note-toggle="${idx}">${collapsed ? "Показать" : "Скрыть"}</button>
              <button class="note-btn danger" data-note-del="${idx}">Удалить</button>
            </div>
          </div>
          <div class="note-body ${collapsed ? "collapsed" : ""}">
            <textarea class="sheet-textarea note-text" rows="6" data-note-text="${idx}" placeholder="Текст заметки...">${CS.utils.escapeHtml(text)}</textarea>
          </div>
        </div>
      `;
    };

    return `
      <div class="sheet-section">
        <h3>Заметки</h3>

        <div class="sheet-card notes-fullwidth">
          <h4>Быстрые заметки</h4>
          <div class="notes-toolbar">
            <button class="note-add-btn" data-note-add>Добавить заметку</button>
          </div>
          <div class="notes-list">
            ${entries.length ? entries.map(renderEntry).join("") : `<div class="sheet-note">Пока нет заметок. Нажми «Добавить заметку».</div>`}
          </div>
        </div>
      </div>
    `;
  }




  CS.tabs = CS.tabs || {};
  CS.tabs.updateCoinsTotal = updateCoinsTotal;
  CS.tabs.bindNotesEditors = bindNotesEditors;
  CS.tabs.bindInventoryEditors = bindInventoryEditors;
  CS.tabs.renderInventoryTab = renderInventoryTab;
  CS.tabs.renderNotesTab = renderNotesTab;


  // Expose tab renderers for other modules (backward-compat)
  const CSX = window.CharSheet = window.CharSheet || {};
  CSX.tabs = CSX.tabs || {};
  CSX.tabs.renderInventoryTab = renderInventoryTab;
  window.renderInventoryTab = renderInventoryTab;
  CSX.tabs.renderNotesTab = renderNotesTab;
  window.renderNotesTab = renderNotesTab;


  // Also expose commonly-used tab binders as globals (backward-compat)
  window.bindInventoryEditors = bindInventoryEditors;
  window.bindNotesEditors = bindNotesEditors;

})();
