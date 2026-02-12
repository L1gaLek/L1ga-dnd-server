/* char_sheet/sheet-db-static.js */
(function(){
  const CS = window.CharSheet = window.CharSheet || {};

  // В монолитной версии `sheetContent` был в общей области видимости.
  // После разбиения на модули получаем его напрямую из DOM.
  const sheetContent = document.getElementById('sheet-content');

  function canEditPlayerProxy(player){
    try { return !!(CS.runtime && typeof CS.runtime.canEditPlayer === "function" && CS.runtime.canEditPlayer(player)); }
    catch { return false; }
  }
  function getOpenedPlayerSafeProxy(){
    try { return (CS.runtime && typeof CS.runtime.getOpenedPlayerSafe === "function") ? CS.runtime.getOpenedPlayerSafe() : null; }
    catch { return null; }
  }
  const CONDITIONS_DB = [
    { name: "Ослеплённое", desc: "Ослепленное существо не может видеть и автоматически проваливает любую проверку характеристик, зависящую от зрения.\nБроски атаки против существа совершаются с преимуществом, а броски атаки существа совершаются с помехой." },
    { name: "Заворожённое", desc: "Заворожённое существо не может напасть на заклинателя или использовать против заклинателя вредоносную способность или магические эффекты.\nЗаклинатель совершает с преимуществом любую проверку характеристик связанную с социальным взаимодействием с существом." },
    { name: "Оглохшее", desc: "Оглохшее существо не может слышать и автоматически проваливает любую проверку характеристики, которая связана со слухом." },
    { name: "Испуганное", desc: "Испуганное существо совершает с помехой проверки характеристик и броски атаки если источник его страха находится в пределах прямой видимости существа.\nСущество не может добровольно приблизиться к источнику своего страха." },
    { name: "Схваченное", desc: "Скорость схваченного существа становится 0, и он не может извлечь выгоду из какого-либо бонуса к своей скорости.\nПерсонаж выходит из состояния \"схвачен\", если схватившее его существо недееспособно (см. состояние).\nСостояние также заканчивается, если эффект удаляет схваченное существо из досягаемости захвата или эффекта захвата, например, когда существо отбрасывается заклинанием Громовой волны." },
    { name: "Недееспособное", desc: "Недееспособное существо не может предпринимать ни действия, ни реакции." },
    { name: "Невидимое", desc: "Невидимое существо невозможно увидеть без помощи магии или особых чувств. Для определения возможности Скрыться невидимого существа считается что оно находится в местности, видимость которого крайне затруднена. Местоположение существа можно определить по любому шуму, который оно издает, или по следам, которые оно оставляет.\nБроски атаки против существа совершаются с помехой, а броски атаки существа - с преимуществом." },
    { name: "Парализованное", desc: "Парализованное существо недееспособно (см. состояние) и не может двигаться или говорить.\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nБроски атаки против существа совершаются с преимуществом.\nЛюбая атака, которая поражает существо, является критическим попаданием, если нападающий находится в пределах 5 футов от существа." },
    { name: "Окаменевшее", desc: "Окаменевшее существо превращается вместе с любыми неволшебными предметами, который оно носит или несет, в твердую неодушевленную субстанцию (обычно камень). Его вес увеличивается в десять раз и оно перестает стареть.\nСущество недееспособно (см. состаяние), не может двигаться или говорить и не знает о своем окружении.\nБроски атаки против существа совершаются с преимуществом.\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nУ окаменевшего существа устойчивость ко всем повреждениям.\nСущество невосприимчиво к яду и болезням, хотя яд или болезнь уже в его организме приостановлены, а не нейтрализованы." },
    { name: "Отравленное", desc: "Отравленное существо совершает с помехой броски атаки и проверки характеристик." },
    { name: "Распластанное", desc: "Если существо не поднимается на ноги и не оканчивает таким образом действие этого состояния, то единственный вариант движения распластанного существа это ползание.\nСущество совершает броски атаки с помехой.\nБроски атаки против существа совершаются с преимуществом, если нападающий находится в пределах 5 футов от существа. В противном случае, броски атаки совершаются с помехой." },
    { name: "Обездвиженное", desc: "Скорость обездвиженного существа становится 0 и никакие эффекты не могут повысить его скорость.\nБроски атаки против существа совершаются с преимуществом, а броски атаки существа совершаются с помехой.\nСущество совершает спасброски Ловкости с помехой." },
    { name: "Оглушенное", desc: "Оглушенное существо недееспособно (см. состояние), не может двигаться и может говорить только запинаясь.\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nБроски атаки против существа совершаются с преимуществом." },
    { name: "Без сознания", desc: "Бессознательное существо недееспособно (см. состояние), не может двигаться или говорить и не осознает своего окружения.\nСущество роняет то, что держало, и падает ничком, получая состояние \"Распластанное\".\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nБроски атаки против существа совершаются с преимуществом.\nЛюбая атака, которая поражает существо, является критическим попаданием, если нападающий находится в пределах 5 футов от существа." }
  ];

// ================== LANGUAGES (Learn popup) ==================
const LANGUAGES_DB = {
  common: [
    { id: "giant", name: "Великаний", typical: "Огры, великаны", script: "Дварфская" },
    { id: "gnomish", name: "Гномий", typical: "Гномы", script: "Дварфская" },
    { id: "goblin", name: "Гоблинский", typical: "Гоблиноиды", script: "Дварфская" },
    { id: "dwarvish", name: "Дварфский", typical: "Дварфы", script: "Дварфская" },
    { id: "common", name: "Общий", typical: "Люди", script: "Общая" },
    { id: "orc", name: "Орочий", typical: "Орки", script: "Дварфская" },
    { id: "halfling", name: "Полуросликов", typical: "Полурослики", script: "Общая" },
    { id: "elvish", name: "Эльфийский", typical: "Эльфы", script: "Эльфийская" }
  ],
  exotic: [
    { id: "abyssal", name: "Бездны", typical: "Демоны", script: "Инфернальная" },
    { id: "deep_speech", name: "Глубинная Речь", typical: "Иллитиды, бехолдеры", script: "-" },
    { id: "draconic", name: "Драконий", typical: "Драконы, драконорождённые", script: "Драконья" },
    { id: "infernal", name: "Инфернальный", typical: "Дьяволы", script: "Инфернальная" },
    { id: "celestial", name: "Небесный", typical: "Небожители", script: "Небесная" },
    { id: "primordial", name: "Первичный", typical: "Элементали", script: "Дварфская" },
    { id: "undercommon", name: "Подземный", typical: "Купцы Подземья", script: "Эльфийская" },
    { id: "sylvan", name: "Сильван", typical: "Фейские существа", script: "Эльфийская" }
  ]
};

function extractLanguagesHint(profText) {
  const t = String(profText || "");
  const m = t.match(/Знание\s+языков\s*:\s*([^\n\r]+)/i);
  return (m && m[1]) ? String(m[1]).trim() : "";
}

function normalizeLanguagesLearned(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(x => x && typeof x === "object")
    .map(x => ({
      id: String(x.id || ""),
      name: String(x.name || ""),
      typical: String(x.typical || ""),
      script: String(x.script || ""),
      category: String(x.category || "")
    }))
    .filter(x => x.name);
}

  // Expose helpers for other modules (monolith/backward-compat)
  CS.utils = CS.utils || {};
  CS.utils.extractLanguagesHint = extractLanguagesHint;
  CS.utils.normalizeLanguagesLearned = normalizeLanguagesLearned;
  // Some modules still reference these as globals
  window.extractLanguagesHint = extractLanguagesHint;
  window.normalizeLanguagesLearned = normalizeLanguagesLearned;


function openLanguagesPopup(player) {
  if (!player?.sheet?.parsed) return;
  if (!canEditPlayerProxy(player)) return;

  // Важно: после refresh(players) объект player может стать устаревшей ссылкой.
  // Из-за этого при добавлении языка UI мог «прыгать»: языки пропадают/появляются
  // после повторного захода во вкладку. Поэтому всегда работаем с актуальным
  // объектом открытого персонажа из последнего snapshot.
  const getLivePlayer = () => {
    try { return getOpenedPlayerSafeProxy() || player; } catch { return player; }
  };

  const renderCol = (title, items, category) => {
    const rows = items.map(l => `
      <div class="lss-lang-row" data-lang-id="${CS.utils.escapeHtml(l.id)}">
        <div class="lss-lang-row-head">
          <div class="lss-lang-row-name">${CS.utils.escapeHtml(l.name)}</div>
          <button class="popup-btn primary" type="button"
            data-lang-learn="${CS.utils.escapeHtml(l.id)}"
            data-lang-cat="${CS.utils.escapeHtml(category)}">Выучить</button>
        </div>
        <div class="lss-lang-row-meta">Типичный представитель - ${CS.utils.escapeHtml(l.typical)}; Письменность - ${CS.utils.escapeHtml(l.script)}</div>
      </div>
    `).join("");

    return `
      <div class="lss-lang-col">
        <div class="lss-lang-col-title">${CS.utils.escapeHtml(title)}</div>
        ${rows}
      </div>
    `;
  };

  const { overlay, close } = CS.bindings.openPopup({
    title: "Выучить язык",
    bodyHtml: `
      <div class="lss-lang-popup-grid">
        ${renderCol("Обычные языки", LANGUAGES_DB.common, "common")}
        ${renderCol("Экзотические языки", LANGUAGES_DB.exotic, "exotic")}
      </div>
    `
  });

  overlay.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-lang-learn]");
    if (!btn) return;

    const id = String(btn.getAttribute("data-lang-learn") || "").trim();
    const cat = String(btn.getAttribute("data-lang-cat") || "").trim();

    const all = [
      ...LANGUAGES_DB.common.map(x => ({ ...x, category: "common" })),
      ...LANGUAGES_DB.exotic.map(x => ({ ...x, category: "exotic" }))
    ];
    const found = all.find(x => x.id === id);
    if (!found) return;

    const live = getLivePlayer();
    if (!live?.sheet?.parsed) return;
    const sheet = live.sheet.parsed;
    if (!sheet.info || typeof sheet.info !== "object") sheet.info = {};
    if (!Array.isArray(sheet.info.languagesLearned)) sheet.info.languagesLearned = [];

    const already = sheet.info.languagesLearned.some(x =>
      String(x?.id || "") === id || String(x?.name || "") === found.name
    );

    if (!already) {
      sheet.info.languagesLearned.push({
        id: found.id,
        name: found.name,
        typical: found.typical,
        script: found.script,
        category: cat || found.category || ""
      });
    }

    markModalInteracted(live.id);
    scheduleSheetSave(live);
    close();
    renderSheetModal(live, { force: true });
  });
}

function bindLanguagesUi(root, player, canEdit) {
  if (!root) return;
  if (root.__langWired) return;
  root.__langWired = true;

  // см. комментарий в openLanguagesPopup — всегда берём актуальную ссылку
  const getLivePlayer = () => {
    try { return getOpenedPlayerSafeProxy() || player; } catch { return player; }
  };

  // Делегирование: кнопка открытия попапа + удаление выученного языка
  root.addEventListener("click", (e) => {
    const openBtn = e.target?.closest?.("[data-lang-popup-open]");
    if (openBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit) return;
      openLanguagesPopup(getLivePlayer());
      return;
    }

    const rm = e.target?.closest?.("[data-lang-remove-id]");
    if (rm) {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit) return;
      const id = String(rm.getAttribute("data-lang-remove-id") || "").trim();
      if (!id) return;
      const live = getLivePlayer();
      const sheet = live?.sheet?.parsed;
      if (!sheet?.info || typeof sheet.info !== "object") return;
      if (!Array.isArray(sheet.info.languagesLearned)) return;

      sheet.info.languagesLearned = sheet.info.languagesLearned.filter(x => {
        const xid = String(x?.id || x?.name || "");
        return xid !== id;
      });

      markModalInteracted(live.id);
      scheduleSheetSave(live);
      renderSheetModal(live, { force: true });
    }
  });
}



  function parseCondList(s) {
    if (!s || typeof s !== "string") return [];
    return s.split(",").map(x => x.trim()).filter(Boolean);
  }
  function setCondList(sheet, arr) {
    const s = Array.from(new Set(arr.map(x => String(x).trim()).filter(Boolean))).join(", ");
    sheet.conditions = s;
    return s;
  }
  // ВАЖНО: "Истощение" и "Состояние" не связаны.
  // sheet.exhaustion хранит только уровень (0..6),
  // sheet.conditions хранит выбранное состояние (строка) или пусто.

  function ensureExhPopup() {
    if (exhPopupEl) return exhPopupEl;
    exhPopupEl = document.createElement("div");
    exhPopupEl.className = "mini-popover hidden";
    exhPopupEl.innerHTML = `
      <div class="mini-popover__backdrop" data-exh-close></div>
      <div class="mini-popover__panel mini-popover__panel--wide" role="dialog" aria-label="Истощение">
        <div class="mini-popover__head">
          <div class="mini-popover__title">Истощение</div>
          <button class="mini-popover__x" type="button" data-exh-close>✕</button>
        </div>
        <div class="mini-popover__body">
          <div class="exh-table">
            <div class="exh-row exh-row--head">
              <div>Уровень</div><div>Эффект</div>
            </div>
            ${EXHAUSTION_LEVELS.map(r => `
              <button class="exh-row" type="button" data-exh-set="${r.lvl}">
                <div class="exh-lvl">${r.lvl}</div>
                <div class="exh-txt">${CS.utils.escapeHtml(r.text)}</div>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    sheetModal?.appendChild(exhPopupEl);

    exhPopupEl.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-exh-close]")) { hideExhPopup(); return; }
      const btn = t.closest("[data-exh-set]");
      if (btn) {
        const lvl = Math.max(0, Math.min(6, CS.utils.safeInt(btn.getAttribute("data-exh-set"), 0)));
        const player = getOpenedPlayerSafeProxy();
        if (!player) return;
        if (!canEditPlayerProxy(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;
        sheet.exhaustion = lvl;
        // sync visible input without full re-render
        try {
          const exInput = sheetContent?.querySelector('[data-sheet-path="exhaustion"]');
          if (exInput && exInput instanceof HTMLInputElement) exInput.value = String(lvl);
        } catch {}

        markModalInteracted(player.id);
        scheduleSheetSave(player);
        hideExhPopup();
      }
    });

    exhPopupEl.addEventListener("keydown", (e) => { if (e.key === "Escape") hideExhPopup(); });
    return exhPopupEl;
  }

  function showExhPopup() { ensureExhPopup().classList.remove("hidden"); }
  function hideExhPopup() { exhPopupEl?.classList.add("hidden"); }

  function ensureCondPopup() {
    if (condPopupEl) return condPopupEl;
    condPopupEl = document.createElement("div");
    condPopupEl.className = "mini-popover hidden";
    condPopupEl.innerHTML = `
      <div class="mini-popover__backdrop" data-cond-close></div>
      <div class="mini-popover__panel mini-popover__panel--wide" role="dialog" aria-label="Состояния">
        <div class="mini-popover__head">
          <div class="mini-popover__title">Состояния</div>
          <button class="mini-popover__x" type="button" data-cond-close>✕</button>
        </div>
        <div class="mini-popover__body">
          <button class="cond-clear" type="button" data-cond-clear>Убрать состояние</button>
          <div class="cond-list">
            ${CONDITIONS_DB.map((c, i) => `
              <div class="cond-item" data-cond-name="${CS.utils.escapeHtml(c.name)}">
                <div class="cond-item__row">
                  <button class="cond-item__name" type="button" data-cond-toggle="${CS.utils.escapeHtml(c.name)}">${CS.utils.escapeHtml(c.name)}</button>
                  <button class="cond-item__descbtn" type="button" data-cond-desc="${i}">Описание</button>
                </div>
                <div class="cond-item__desc hidden" data-cond-descbox="${i}">${CS.utils.escapeHtml(c.desc).replace(/\n/g, "<br>")}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    sheetModal?.appendChild(condPopupEl);

    condPopupEl.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-cond-close]")) { hideCondPopup(); return; }

      if (t.closest("[data-cond-clear]")) {
        const player = getOpenedPlayerSafeProxy();
        if (!player) return;
        if (!canEditPlayerProxy(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;

        // очищаем только состояние (истощение не трогаем)
        sheet.conditions = "";

        markModalInteracted(player.id);
        scheduleSheetSave(player);

        try {
          const input = sheetContent?.querySelector('[data-sheet-path="conditions"]');
          if (input && input instanceof HTMLInputElement) input.value = sheet.conditions || "";
          const condChip = sheetContent?.querySelector('[data-cond-open]');
          if (condChip) condChip.classList.toggle('has-value', !!String(sheet.conditions || '').trim());
        } catch {}
        return;
      }

      const descBtn = t.closest("[data-cond-desc]");
      if (descBtn) {
        const i = descBtn.getAttribute("data-cond-desc");
        const box = condPopupEl.querySelector(`[data-cond-descbox="${i}"]`);
        if (box) box.classList.toggle("hidden");
        return;
      }

      const tog = t.closest("[data-cond-toggle]");
      if (tog) {
        const name = (tog.getAttribute("data-cond-toggle") || "").trim();
        if (!name) return;
        const player = getOpenedPlayerSafeProxy();
        if (!player) return;
        if (!canEditPlayerProxy(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;

        // одиночный выбор: повторный клик по выбранному состоянию = снять
        const cur = String(sheet.conditions || "").trim();
        const already = cur.toLowerCase() === name.toLowerCase();
        sheet.conditions = already ? "" : name;

        markModalInteracted(player.id);
        scheduleSheetSave(player);

        try {
          const input = sheetContent?.querySelector('[data-sheet-path="conditions"]');
          if (input && input instanceof HTMLInputElement) input.value = sheet.conditions || "";
          const condChip = sheetContent?.querySelector('[data-cond-open]');
          if (condChip) condChip.classList.toggle('has-value', !!String(sheet.conditions || '').trim());
        } catch {}
        return;
      }
    });

    condPopupEl.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCondPopup(); });
    return condPopupEl;
  }

  function showCondPopup() { ensureCondPopup().classList.remove("hidden"); }
  function hideCondPopup() { condPopupEl?.classList.add("hidden"); }
  function ensureWiredCloseHandlers() {
    const sheetClose = CS.dom?.sheetClose;
    const sheetModal = CS.dom?.sheetModal;
    const sheetContent = CS.dom?.sheetContent;
    const close = () => CS.modal?.closeModal?.();

    sheetClose?.addEventListener('click', close);

    // клик по фону закрывает
    sheetModal?.addEventListener('click', (e) => {
      if (e.target === sheetModal) close();
    });

    // ESC закрывает
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sheetModal && !sheetModal.classList.contains('hidden')) {
        close();
      }
    });

    // HP chip -> popup (делегирование, без привязки к старым player)
    sheetContent?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const chip = t.closest('[data-hp-open]');
      if (chip) CS.modal?.showHpPopup?.();
    });

    sheetContent?.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const chip = t.closest('[data-hp-open]');
      if (!chip) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        CS.modal?.showHpPopup?.();
      }
    });

    // Inspiration chip toggle
    sheetContent?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const chip = t.closest('[data-hero="insp"]');
      if (!chip) return;
      const player = getOpenedPlayerSafeProxy();
      if (!player) return;
      if (!canEditPlayerProxy(player)) return;
      const sheet = player.sheet?.parsed;
      if (!sheet) return;
      sheet.inspiration = CS.utils.safeInt(sheet.inspiration, 0) ? 0 : 1;
      markModalInteracted(player.id);
      scheduleSheetSave(player);
      updateHeroChips(sheetContent, sheet);
    });

    // Exhaustion/Conditions popups
    sheetContent?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      const ex = t.closest('[data-exh-open]');
      if (ex) { showExhPopup(); return; }

      const co = t.closest('[data-cond-open]');
      if (co) { showCondPopup(); return; }
    });
  }

  // Прямая привязка кликов к текущему DOM (на случай, если делегирование не сработало
  // из-за disabled input / особенностей браузера). Вызывается после каждого рендера модалки.
  function wireQuickBasicInteractions(root) {
    if (!root || root.__basicQuickWired) return;
    root.__basicQuickWired = true;

    // Вдохновение (звезда)
    const inspChip = root.querySelector('[data-hero="insp"]');
    if (inspChip) {
      inspChip.addEventListener('click', (e) => {
        e.stopPropagation();
        const player = getOpenedPlayerSafeProxy();
        if (!player) return;
        if (!canEditPlayerProxy(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;
        sheet.inspiration = CS.utils.safeInt(sheet.inspiration, 0) ? 0 : 1;
        markModalInteracted(player.id);
        scheduleSheetSave(player);
        updateHeroChips(root, sheet);
      });
    }

    // Истощение/Состояние: открытие попапов кликом по рамке
    const exhChip = root.querySelector('[data-exh-open]');
    if (exhChip) exhChip.addEventListener('click', (e) => { e.stopPropagation(); showExhPopup(); });

    const condChip = root.querySelector('[data-cond-open]');
    if (condChip) condChip.addEventListener('click', (e) => { e.stopPropagation(); showCondPopup(); });
  }

  // keep condition chip highlight in sync when user edits the field manually
  sheetContent?.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const inp = t.closest('[data-sheet-path="conditions"]');
    if (!inp) return;
    const chip = sheetContent?.querySelector('[data-cond-open]');
    if (chip) chip.classList.toggle('has-value', !!String(inp.value || '').trim());
  });



  // ================== POPUP HELPERS (внутренние окна) ==================


  CS.db = CS.db || {};
  CS.db.CONDITIONS_DB = CONDITIONS_DB;
  CS.db.LANGUAGES_DB = LANGUAGES_DB;
  CS.db.openLanguagesPopup = openLanguagesPopup;
  CS.db.bindLanguagesUi = bindLanguagesUi;
  // Используется из sheet-modal.js
  CS.db.ensureWiredCloseHandlers = ensureWiredCloseHandlers;
  // Используется из sheet-modal.js для закрытия
  CS.db.hideExhPopup = hideExhPopup;
  CS.db.hideCondPopup = hideCondPopup;
  CS.db.showExhPopup = showExhPopup;
  CS.db.showCondPopup = showCondPopup;


  // Also expose languages binder as global (backward-compat)
  window.bindLanguagesUi = bindLanguagesUi;

})();
