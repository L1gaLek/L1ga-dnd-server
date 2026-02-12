/* char_sheet/sheet-modal.js */
/* info-dnd-player.js
   UI/логика модалки "Инфа" вынесены сюда.
   Экспортирует window.InfoModal:
   - init(context)
   - open(player)
   - refresh(players)
*/

(function () {
  const CS = window.CharSheet = window.CharSheet || {};
  CS.utils = CS.utils || {};
  CS.bindings = CS.bindings || {};
  CS.dom = CS.dom || {};
  CS.modal = CS.modal || {};
  CS.db = CS.db || {};
  CS.viewmodel = CS.viewmodel || {};

  // ===== MODAL ELEMENTS =====
  const sheetModal = document.getElementById('sheet-modal');
  const sheetClose = document.getElementById('sheet-close');
  const sheetTitle = document.getElementById('sheet-title');
  const sheetSubtitle = document.getElementById('sheet-subtitle');
  const sheetActions = document.getElementById('sheet-actions');
  const sheetContent = document.getElementById('sheet-content');

  // publish DOM refs for other modules
  CS.dom.sheetModal = sheetModal;
  CS.dom.sheetClose = sheetClose;
  CS.dom.sheetTitle = sheetTitle;
  CS.dom.sheetSubtitle = sheetSubtitle;
  CS.dom.sheetActions = sheetActions;
  CS.dom.sheetContent = sheetContent;

  // context from client.js
  let ctx = null;

  function canEditPlayer(player) {
    // client.js передаёт в init() функции getMyRole()/getMyId().
    // Важно: не полагаемся на ctx.myRole/ctx.myId (их может не быть),
    // иначе у игроков отключаются клики/выборы в "Основное".
    const myRole = (typeof ctx?.getMyRole === "function")
      ? (ctx.getMyRole() || "")
      : (ctx?.myRole || ctx?.role || "");
    const myId = (typeof ctx?.getMyId === "function")
      ? (ctx.getMyId() ?? "")
      : (ctx?.myId ?? "");
    if (myRole === "GM") return true;
    const owner = player?.ownerId ?? "";
    return String(owner) && String(myId) && String(owner) === String(myId);
  }
  // expose runtime helpers for other modules
  CS.runtime = CS.runtime || {};
  CS.runtime.canEditPlayer = canEditPlayer;

  // состояние модалки
  let openedSheetPlayerId = null;
  let lastCanEdit = false; // GM или владелец текущего открытого персонажа

  // ===== Saved bases overlay state =====
  let savedBasesOverlay = null;
  let savedBasesListCache = [];
  let savedBasesOverlayPlayerId = null;

  function ensureSavedBasesOverlay() {
    if (savedBasesOverlay) return savedBasesOverlay;

    const overlay = document.createElement('div');
    overlay.className = 'saved-bases-overlay hidden';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="saved-bases-modal">
        <div class="saved-bases-head">
          <div>
            <div class="saved-bases-title">Мои сохранённые персонажи</div>
            <div class="saved-bases-sub">Список привязан к вашему уникальному id (не к никнейму).</div>
          </div>
          <button type="button" class="saved-bases-close" title="Закрыть">✕</button>
        </div>

        <div class="saved-bases-body">
          <div class="saved-bases-loading">Загружаю список…</div>
          <div class="saved-bases-empty hidden">Пока нет сохранённых персонажей. Нажмите «Сохранить основу».</div>

          <div class="saved-bases-list" role="list"></div>
        </div>

        <div class="saved-bases-footer">
          <button type="button" class="saved-bases-delete" disabled>Удалить</button>
          <div style="flex:1"></div>
          <button type="button" class="saved-bases-refresh">Обновить</button>
          <button type="button" class="saved-bases-apply" disabled>Загрузить</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    savedBasesOverlay = overlay;

    const closeBtn = overlay.querySelector('.saved-bases-close');
    closeBtn?.addEventListener('click', () => closeSavedBasesOverlay());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSavedBasesOverlay();
    });

    overlay.querySelector('.saved-bases-refresh')?.addEventListener('click', () => {
      try {
        openSavedBasesOverlay({ loading: true, playerId: savedBasesOverlayPlayerId });
        ctx?.sendMessage?.({ type: 'listSavedBases' });
      } catch {}
    });

    overlay.querySelector('.saved-bases-apply')?.addEventListener('click', () => {
      const sel = overlay.querySelector('input[name="savedBasePick"]:checked');
      const savedId = sel?.value;
      if (!savedId) return;
      if (!savedBasesOverlayPlayerId) return;
      try {
        ctx?.sendMessage?.({ type: 'applySavedBase', playerId: savedBasesOverlayPlayerId, savedId });
      } catch {}
    });

    overlay.querySelector('.saved-bases-delete')?.addEventListener('click', () => {
      const sel = overlay.querySelector('input[name="savedBasePick"]:checked');
      const savedId = sel?.value;
      if (!savedId) return;
      if (!confirm('Удалить сохранённого персонажа?')) return;
      try {
        ctx?.sendMessage?.({ type: 'deleteSavedBase', savedId });
      } catch {}
    });

    return overlay;
  }

  function openSavedBasesOverlay({ loading = false, playerId = null } = {}) {
    const overlay = ensureSavedBasesOverlay();
    savedBasesOverlayPlayerId = playerId;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    const loadingEl = overlay.querySelector('.saved-bases-loading');
    const emptyEl = overlay.querySelector('.saved-bases-empty');
    const listEl = overlay.querySelector('.saved-bases-list');
    const applyBtn = overlay.querySelector('.saved-bases-apply');
    const delBtn = overlay.querySelector('.saved-bases-delete');

    if (loadingEl) loadingEl.style.display = loading ? '' : 'none';
    emptyEl?.classList.add('hidden');
    if (listEl) listEl.innerHTML = '';
    if (applyBtn) applyBtn.disabled = true;
    if (delBtn) delBtn.disabled = true;
  }

  function closeSavedBasesOverlay() {
    if (!savedBasesOverlay) return;
    savedBasesOverlay.classList.add('hidden');
    savedBasesOverlay.setAttribute('aria-hidden', 'true');
    savedBasesOverlayPlayerId = null;
  }

  function renderSavedBasesList(list) {
    const overlay = ensureSavedBasesOverlay();
    const loadingEl = overlay.querySelector('.saved-bases-loading');
    const emptyEl = overlay.querySelector('.saved-bases-empty');
    const listEl = overlay.querySelector('.saved-bases-list');
    const applyBtn = overlay.querySelector('.saved-bases-apply');
    const delBtn = overlay.querySelector('.saved-bases-delete');

    if (loadingEl) loadingEl.style.display = 'none';
    if (!listEl) return;

    listEl.innerHTML = '';

    const arr = Array.isArray(list) ? list : [];
    savedBasesListCache = arr;

    if (!arr.length) {
      emptyEl?.classList.remove('hidden');
      if (applyBtn) applyBtn.disabled = true;
      if (delBtn) delBtn.disabled = true;
      return;
    }

    emptyEl?.classList.add('hidden');

    arr.forEach(item => {
      const row = document.createElement('label');
      row.className = 'saved-bases-row';
      const dt = item?.updatedAt ? new Date(item.updatedAt) : null;
      const when = dt && !isNaN(dt.getTime())
        ? dt.toLocaleString()
        : '';
      row.innerHTML = `
        <input type="radio" name="savedBasePick" value="${CS.utils.escapeHtml(String(item.id || ''))}">
        <div class="saved-bases-row-main">
          <div class="saved-bases-row-name">${CS.utils.escapeHtml(item.name || 'Персонаж')}</div>
          <div class="saved-bases-row-meta">${CS.utils.escapeHtml(when)}</div>
        </div>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('input[name="savedBasePick"]').forEach(inp => {
      inp.addEventListener('change', () => {
        if (applyBtn) applyBtn.disabled = false;
        if (delBtn) delBtn.disabled = false;
      });
    });

    // auto-select first
    const first = listEl.querySelector('input[name="savedBasePick"]');
    if (first) {
      first.checked = true;
      if (applyBtn) applyBtn.disabled = false;
      if (delBtn) delBtn.disabled = false;
    }
  }

  // UI-состояние модалки (чтобы обновления state не сбрасывали вкладку/скролл)
  // Map<playerId, { activeTab: string, scrollTopByTab: Record<string, number>, lastInteractAt: number }>
  function openModal() {
    if (!sheetModal) return;
    sheetModal.classList.remove('hidden');
    sheetModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!sheetModal) return;
    hideHpPopup();
    hideExhPopup();
    hideCondPopup();
    sheetModal.classList.add('hidden');
    sheetModal.setAttribute('aria-hidden', 'true');
    openedSheetPlayerId = null;

    if (sheetTitle) sheetTitle.textContent = "Информация о персонаже";
    if (sheetSubtitle) sheetSubtitle.textContent = "";
    if (sheetActions) sheetActions.innerHTML = "";
    if (sheetContent) sheetContent.innerHTML = "";
  }


  // ================== HP POPUP ==================
  let hpPopupEl = null;

  // snapshot of latest players array (to avoid stale closures after .json import / refresh)
  let lastPlayersSnapshot = [];

  function rememberPlayersSnapshot(players) {
    if (Array.isArray(players)) lastPlayersSnapshot = players;
  }

  function getOpenedPlayerSafe() {
    if (!openedSheetPlayerId) return null;
    return (lastPlayersSnapshot || []).find(x => x && x.id === openedSheetPlayerId) || null;
  }
  CS.runtime.getOpenedPlayerSafe = getOpenedPlayerSafe;

  function ensureHpPopup() {
    if (hpPopupEl) return hpPopupEl;

    hpPopupEl = document.createElement('div');
    hpPopupEl.className = 'hp-popover hidden';
    hpPopupEl.innerHTML = `
      <div class="hp-popover__backdrop" data-hp-close></div>
      <div class="hp-popover__panel" role="dialog" aria-label="Здоровье" aria-modal="false">
        <div class="hp-popover__head">
          <div class="hp-popover__title">Здоровье</div>
          <button class="hp-popover__x" type="button" data-hp-close title="Закрыть">✕</button>
        </div>

        <div class="hp-popover__grid">
          <div class="hp-row">
            <div class="hp-label">Здоровье макс.</div>
            <input class="hp-input" type="number" min="0" max="999" step="1" data-hp-field="max">
          </div>
          <div class="hp-row">
            <div class="hp-label">Здоровья осталось</div>
            <input class="hp-input" type="number" min="0" max="999" step="1" data-hp-field="cur">
          </div>
          <div class="hp-row">
            <div class="hp-label">Временное здоровье</div>
            <input class="hp-input" type="number" min="0" max="999" step="1" data-hp-field="temp">
          </div>

          <div class="hp-divider"></div>

          <div class="hp-row hp-row--delta">
            <div class="hp-label">Изменить здоровье</div>
            <div class="hp-delta">
              <button class="hp-delta__btn" type="button" data-hp-delta="-">−</button>
              <input class="hp-input hp-input--delta" type="number" min="0" max="999" step="1" value="0" data-hp-field="delta">
              <button class="hp-delta__btn" type="button" data-hp-delta="+">+</button>
            </div>
            <div class="hp-note">Ограничение: 0…максимум</div>
          </div>
        </div>
      </div>
    `;
    sheetModal?.appendChild(hpPopupEl);
    setHpPopupEditable(!!lastCanEdit);

    // close / delta buttons
    hpPopupEl.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      if (t.closest('[data-hp-close]')) {
        hideHpPopup();
        return;
      }

      const deltaBtn = t.closest('[data-hp-delta]');
      if (deltaBtn) {
        const sign = deltaBtn.getAttribute('data-hp-delta');
        applyHpDelta(sign === '+' ? +1 : -1);
      }
    });

    // escape closes
    hpPopupEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideHpPopup();
    });

    // inputs update sheet (always use current opened player from snapshot)
    hpPopupEl.addEventListener('input', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;

      const f = el.getAttribute('data-hp-field');
      if (!f || f === 'delta') return;
      if (!lastCanEdit) return;

      const player = getOpenedPlayerSafe();
      if (!player) return;
      const sheet = player.sheet?.parsed;
      if (!sheet) return;

      if (!sheet.vitality) sheet.vitality = {};
      if (!sheet.vitality["hp-max"]) sheet.vitality["hp-max"] = { value: 0 };
      if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
      if (!sheet.vitality["hp-temp"]) sheet.vitality["hp-temp"] = { value: 0 };

      const maxEl = hpPopupEl.querySelector('[data-hp-field="max"]');
      const curEl = hpPopupEl.querySelector('[data-hp-field="cur"]');
      const tempEl = hpPopupEl.querySelector('[data-hp-field="temp"]');

      const max = Number(maxEl?.value ?? sheet.vitality["hp-max"].value) || 0;
      const cur = Number(curEl?.value ?? sheet.vitality["hp-current"].value) || 0;
      const temp = Number(tempEl?.value ?? sheet.vitality["hp-temp"].value) || 0;

      const clampedMax = Math.max(0, Math.trunc(max));
      const clampedCur = Math.max(0, Math.min(clampedMax, Math.trunc(cur)));
      const clampedTemp = Math.max(0, Math.trunc(temp));

      sheet.vitality["hp-max"].value = clampedMax;
      sheet.vitality["hp-current"].value = clampedCur;
      sheet.vitality["hp-temp"].value = clampedTemp;

      syncHpPopupInputs(sheet);
      CS.bindings.markModalInteracted?.(player.id);
      CS.bindings.scheduleSheetSave(player);
      if (sheetContent) updateHeroChips(sheetContent, sheet);
    });

    return hpPopupEl;
  }

  function syncHpPopupInputs(sheet) {
    if (!hpPopupEl || !sheet) return;
    const max = Number(sheet?.vitality?.["hp-max"]?.value) || 0;
    const cur = Number(sheet?.vitality?.["hp-current"]?.value) || 0;
    const temp = Number(sheet?.vitality?.["hp-temp"]?.value) || 0;

    const maxEl = hpPopupEl.querySelector('[data-hp-field="max"]');
    const curEl = hpPopupEl.querySelector('[data-hp-field="cur"]');
    const tempEl = hpPopupEl.querySelector('[data-hp-field="temp"]');

    if (maxEl) maxEl.value = String(max);
    if (curEl) curEl.value = String(cur);
    if (tempEl) tempEl.value = String(temp);
  }

  function setHpPopupEditable(can) {
    if (!hpPopupEl) return;
    const inputs = hpPopupEl.querySelectorAll('input.hp-input');
    inputs.forEach(inp => {
      const isDelta = inp.getAttribute('data-hp-field') === 'delta';
      // delta input можно менять всем, но кнопки применения/изменения - только редактору
      if (!can && !isDelta) inp.setAttribute('disabled', 'disabled');
      else inp.removeAttribute('disabled');
    });

    const btns = hpPopupEl.querySelectorAll('.hp-delta__btn');
    btns.forEach(b => {
      if (!can) b.setAttribute('disabled', 'disabled');
      else b.removeAttribute('disabled');
    });
  }

  function showHpPopup() {
    const el = ensureHpPopup();
    const player = getOpenedPlayerSafe();
    if (!player) return;
    const sheet = player.sheet?.parsed;
    if (!sheet) return;

    if (!sheet.vitality) sheet.vitality = {};
    if (!sheet.vitality["hp-max"]) sheet.vitality["hp-max"] = { value: 0 };
    if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
    if (!sheet.vitality["hp-temp"]) sheet.vitality["hp-temp"] = { value: 0 };

    syncHpPopupInputs(sheet);
    setHpPopupEditable(!!lastCanEdit);
    el.classList.remove('hidden');

    const first = el.querySelector('[data-hp-field="cur"]');
    first?.focus?.();
  }

  function hideHpPopup() {
    hpPopupEl?.classList.add('hidden');
  }

  function applyHpDelta(mult) {
    if (!lastCanEdit) return;
    const player = getOpenedPlayerSafe();
    if (!player) return;
    const sheet = player.sheet?.parsed;
    if (!sheet?.vitality) return;

    const deltaEl = hpPopupEl?.querySelector('[data-hp-field="delta"]');
    const delta = Math.max(0, Math.trunc(Number(deltaEl?.value ?? 0) || 0));
    if (!delta) return;

    if (!sheet.vitality["hp-max"]) sheet.vitality["hp-max"] = { value: 0 };
    if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
    if (!sheet.vitality["hp-temp"]) sheet.vitality["hp-temp"] = { value: 0 };

    const max = Number(sheet?.vitality?.["hp-max"]?.value) || 0;
    const cur = Number(sheet?.vitality?.["hp-current"]?.value) || 0;
    const temp = Number(sheet?.vitality?.["hp-temp"]?.value) || 0;

    // mult: +1 = heal current (temp НЕ пополняется кнопкой "+")
    // mult: -1 = damage (сначала снимаем временные хиты, затем текущее здоровье)
    let nextCur = cur;
    let nextTemp = temp;

    if (mult > 0) {
      nextCur = Math.max(0, Math.min(max, cur + delta));
      // temp unchanged
    } else {
      const spentTemp = Math.min(temp, delta);
      nextTemp = Math.max(0, temp - delta);
      const remaining = Math.max(0, delta - spentTemp);
      nextCur = Math.max(0, Math.min(max, cur - remaining));
    }

    sheet.vitality["hp-current"].value = nextCur;
    sheet.vitality["hp-temp"].value = nextTemp;

    syncHpPopupInputs(sheet);
    CS.bindings.markModalInteracted?.(player.id);
    CS.bindings.scheduleSheetSave(player);
    if (sheetContent) updateHeroChips(sheetContent, sheet);
  }
  
  // ================== EXHAUSTION + CONDITIONS POPUPS ==================
  let exhPopupEl = null;
  let condPopupEl = null;

  const EXHAUSTION_LEVELS = [
    { lvl: 0, text: "Истощение отсутствует" },
    { lvl: 1, text: "Помеха на проверки характеристик" },
    { lvl: 2, text: "Скорость уменьшается вдвое" },
    { lvl: 3, text: "Помеха на броски атаки и спасброски" },
    { lvl: 4, text: "Максимальные хиты уменьшаются вдвое" },
    { lvl: 5, text: "Скорость уменьшается до 0" },
    { lvl: 6, text: "Смерть" }
  ];

  function updateHeroChips(root, sheet) {
    if (!root || !sheet) return;
    const ac = CS.utils.safeInt(sheet?.vitality?.ac?.value, 0);
    const hp = CS.utils.safeInt(sheet?.vitality?.["hp-max"]?.value, 0);
    const hpCur = CS.utils.safeInt(sheet?.vitality?.["hp-current"]?.value, 0);
    const spd = CS.utils.safeInt(sheet?.vitality?.speed?.value, 0);

    const acEl = root.querySelector('[data-hero-val="ac"]');
    if (acEl) {
      if (acEl.tagName === "INPUT" || acEl.tagName === "TEXTAREA") acEl.value = String(ac);
      else acEl.textContent = String(ac);
    }

    const hpEl = root.querySelector('[data-hero-val="hp"]');
    const hpTemp = CS.utils.safeInt(sheet?.vitality?.["hp-temp"]?.value, 0);
    if (hpEl) hpEl.textContent = (hpTemp > 0 ? `(${hpTemp}) ${hpCur}/${hp}` : `${hpCur}/${hp}`);

    // HP "liquid" fill in chip (shrinks right-to-left)
    const hpChip = root.querySelector('[data-hero="hp"]');
    if (hpChip) {
      const ratio = (hp > 0) ? Math.max(0, Math.min(1, hpCur / hp)) : 0;
      const pct = Math.round(ratio * 100);
      hpChip.style.setProperty('--hp-fill-pct', `${pct}%`);
    }


    // Inspiration star (SVG)
    const inspChip = root.querySelector('[data-hero="insp"] .insp-star');
    if (inspChip) {
      const on = !!CS.utils.safeInt(sheet?.inspiration, 0);
      inspChip.classList.toggle('on', on);
    }

    const spdEl = root.querySelector('[data-hero-val="speed"]');
    if (spdEl) {
      if (spdEl.tagName === "INPUT" || spdEl.tagName === "TEXTAREA") spdEl.value = String(spd);
      else spdEl.textContent = String(spd);
    }
  }

  function updateSkillsAndPassives(root, sheet) {
    if (!root || !sheet) return;

    // skills
    const dots = root.querySelectorAll('.lss-dot[data-skill-key]');
    dots.forEach(dot => {
      const key = dot.getAttribute('data-skill-key');
      if (!key) return;
      const row = dot.closest('.lss-skill-row');
      if (!row) return;
      const valEl = row.querySelector('.lss-skill-val');
      if (valEl) {
        const v = CS.utils.formatMod(calcSkillBonus(sheet, key));
        if (valEl.tagName === "INPUT" || valEl.tagName === "TEXTAREA") valEl.value = v;
        else valEl.textContent = v;
      }
    });

    // passives (10 + skill bonus)
    const passiveKeys = ["perception", "insight", "investigation"];
    passiveKeys.forEach(k => {
      const val = 10 + (sheet?.skills?.[k] ? calcSkillBonus(sheet, k) : 0);
      const el = root.querySelector(`.lss-passive-val[data-passive-val="${k}"]`);
      if (el) el.textContent = String(val);
    });
  }

function calcWeaponAttackBonus(sheet, weapon) {
  if (!sheet || !weapon) return 0;
  const ability = String(weapon.ability || "str");
  const statMod = CS.utils.safeInt(sheet?.stats?.[ability]?.modifier, 0);
  const prof = weapon.prof ? getProfBonus(sheet) : 0;
  const extra = CS.utils.safeInt(weapon.extraAtk, 0);
  return statMod + prof + extra;
}

function calcWeaponDamageBonus(sheet, weapon) {
  if (!sheet || !weapon) return 0;
  const ability = String(weapon.ability || "str");
  // В sheet.stats[ability] в наших json обычно есть modifier, но на всякий случай
  // вычислим из value, если modifier отсутствует.
  const direct = sheet?.stats?.[ability]?.modifier;
  if (direct !== undefined && direct !== null && direct !== "") return CS.utils.safeInt(direct, 0);
  const score = CS.utils.safeInt(sheet?.stats?.[ability]?.value, 10);
  return Math.floor((score - 10) / 2);
}

function weaponDamageText(weapon) {
  const n = Math.max(0, CS.utils.safeInt(weapon?.dmgNum, 1));
  const dice = String(weapon?.dmgDice || "к6");
  const type = String(weapon?.dmgType || "").trim();
  return `${n}${dice}${type ? ` ${type}` : ""}`.trim();
}

// Обновляем "Бонус атаки" и превью урона без полного ререндера
function updateWeaponsBonuses(root, sheet) {
  if (!root || !sheet) return;
  const list = Array.isArray(sheet?.weaponsList) ? sheet.weaponsList : [];

  const cards = root.querySelectorAll('.weapon-card[data-weapon-idx]');
  cards.forEach(card => {
    const idx = CS.utils.safeInt(card.getAttribute('data-weapon-idx'), -1);
    if (idx < 0) return;

    const w = list[idx];
    if (!w || typeof w !== "object") return;

    // Legacy оружие просто пропускаем
    const isNew = ("ability" in w || "prof" in w || "extraAtk" in w || "dmgNum" in w || "dmgDice" in w || "dmgType" in w || "desc" in w || "collapsed" in w);
    if (!isNew) return;

    const atkEl = card.querySelector('[data-weapon-atk]');
    if (atkEl) atkEl.textContent = CS.utils.formatMod(calcWeaponAttackBonus(sheet, w));

    const dmgEl = card.querySelector('[data-weapon-dmg]');
    if (dmgEl) dmgEl.textContent = weaponDamageText(w);

    const profDot = card.querySelector('[data-weapon-prof]');
    if (profDot) {
      profDot.classList.toggle('active', !!w.prof);
      profDot.title = `Владение: +${getProfBonus(sheet)} к бонусу атаки`;
    }

    const detailsWrap = card.querySelector('.weapon-details');
    if (detailsWrap) detailsWrap.classList.toggle('collapsed', !!w.collapsed);

    const head = card.querySelector('.weapon-head');
    if (head) {
      head.classList.toggle('is-collapsed', !!w.collapsed);
      head.classList.toggle('is-expanded', !w.collapsed);
    }

    const toggleBtn = card.querySelector('[data-weapon-toggle-desc]');
    if (toggleBtn) toggleBtn.textContent = w.collapsed ? "Показать" : "Скрыть";
  });
}


function rerenderCombatTabInPlace(root, player, canEdit) {
  const main = root?.querySelector('#sheet-main');
  if (!main || player?._activeSheetTab !== "combat") return;

  const freshSheet = player.sheet?.parsed || CS.viewmodel.createEmptySheet(player.name);
  const freshVm = CS.viewmodel.toViewModel(freshSheet, player.name);
  main.innerHTML = renderActiveTab("combat", freshVm, canEdit);

  CS.bindings.bindEditableInputs(root, player, canEdit);
  bindSkillBoostDots(root, player, canEdit);
  bindAbilityAndSkillEditors(root, player, canEdit);
  CS.tabs.bindNotesEditors(root, player, canEdit);
  CS.spells.bindSlotEditors(root, player, canEdit);
  bindCombatEditors(root, player, canEdit);

  updateWeaponsBonuses(root, player.sheet?.parsed);
}

function bindCombatEditors(root, player, canEdit) {
  if (!root || !player?.sheet?.parsed) return;
  const sheet = player.sheet.parsed;

  // кнопка "Добавить оружие"
  const addBtn = root.querySelector('[data-weapon-add]');
  if (addBtn) {
    if (!canEdit) addBtn.disabled = true;
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!canEdit) return;

      if (!Array.isArray(sheet.weaponsList)) sheet.weaponsList = [];

      sheet.weaponsList.push({
        name: "Новое оружие",
        ability: "str",
        prof: false,
        extraAtk: 0,
        dmgNum: 1,
        dmgDice: "к6",
        dmgType: "",
        desc: "",
        collapsed: false
      });

      CS.bindings.scheduleSheetSave(player);
      rerenderCombatTabInPlace(root, player, canEdit);
    });
  }

  const weaponCards = root.querySelectorAll('.weapon-card[data-weapon-idx]');
  weaponCards.forEach(card => {
    const idx = CS.utils.safeInt(card.getAttribute('data-weapon-idx'), -1);
    if (idx < 0) return;

    if (!Array.isArray(sheet.weaponsList)) sheet.weaponsList = [];
    const w = sheet.weaponsList[idx];
    if (!w || typeof w !== "object") return;

    // Legacy карточки не редактируем
    const isNew = ("ability" in w || "prof" in w || "extraAtk" in w || "dmgNum" in w || "dmgDice" in w || "dmgType" in w || "desc" in w || "collapsed" in w);
    if (!isNew) return;

    // редактирование полей
    const fields = card.querySelectorAll('[data-weapon-field]');
    fields.forEach(el => {
      const field = el.getAttribute('data-weapon-field');
      if (!field) return;

      if (!canEdit) {
        el.disabled = true;
        return;
      }

      const handler = () => {
        let val;
        if (el.tagName === "SELECT") val = el.value;
        else if (el.type === "number") val = el.value === "" ? 0 : Number(el.value);
        else val = el.value;

        if (field === "extraAtk" || field === "dmgNum") val = CS.utils.safeInt(val, 0);

        w[field] = val;

        updateWeaponsBonuses(root, sheet);
        // Авто-пересчёт метрик заклинаний при изменении бонуса мастерства
        if (player?._activeSheetTab === "spells" && (path === "proficiency" || path === "proficiencyCustom")) {
          const s = player.sheet?.parsed;
          if (s) CS.spells.rerenderSpellsTabInPlace(root, player, s, canEdit);
        }

        CS.bindings.scheduleSheetSave(player);
      };

      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    // владение (кружок)
    const profBtn = card.querySelector('[data-weapon-prof]');
    if (profBtn) {
      if (!canEdit) profBtn.disabled = true;
      profBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        w.prof = !w.prof;
        updateWeaponsBonuses(root, sheet);
        CS.bindings.scheduleSheetSave(player);
      });
    }

    // свернуть/развернуть описание
    const toggleDescBtn = card.querySelector('[data-weapon-toggle-desc]');
    if (toggleDescBtn) {
      if (!canEdit) toggleDescBtn.disabled = true;
      toggleDescBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        w.collapsed = !w.collapsed;
        updateWeaponsBonuses(root, sheet);
        CS.bindings.scheduleSheetSave(player);
      });
    }

    // удалить
    const delBtn = card.querySelector('[data-weapon-del]');
    if (delBtn) {
      if (!canEdit) delBtn.disabled = true;
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;

        sheet.weaponsList.splice(idx, 1);
        CS.bindings.scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }

    // 🎲 броски из оружия -> в панель кубиков
    const rollAtkBtn = card.querySelector('[data-weapon-roll-atk]');
    if (rollAtkBtn) {
      rollAtkBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const bonus = calcWeaponAttackBonus(sheet, w);
        if (window.DicePanel?.roll) {
          window.DicePanel.roll({ sides: 20, count: 1, bonus, kindText: `Атака: d20 ${CS.utils.formatMod(bonus)}` });
        }
      });
    }

    const rollDmgBtn = card.querySelector('[data-weapon-roll-dmg]');
    if (rollDmgBtn) {
      rollDmgBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const n = Math.max(0, CS.utils.safeInt(w?.dmgNum, 1));
        const diceStr = String(w?.dmgDice || "к6").trim().toLowerCase(); // "к8"
        const sides = CS.utils.safeInt(diceStr.replace("к", ""), 6);
        const bonus = calcWeaponDamageBonus(sheet, w);
        if (window.DicePanel?.roll) {
          const cnt = Math.max(1, n);
          window.DicePanel.roll({
            sides,
            count: cnt,
            bonus,
            kindText: `Урон: ${cnt}d${sides} ${CS.utils.formatMod(bonus)}`
          });
        }
      });
    }
  });

  updateWeaponsBonuses(root, sheet);
}

   
  function renderPersonalityTab(vm) {
    return `
      <div class="sheet-section">
        <h3>Личность</h3>

        <div class="sheet-grid-2">
          <div class="sheet-card">
            <h4>Внешность</h4>
            <div class="notes-details-grid">
              <div class="kv"><div class="k">Пол</div><div class="v"><input type="text" data-sheet-path="notes.details.gender.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Рост</div><div class="v"><input type="text" data-sheet-path="notes.details.height.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Вес</div><div class="v"><input type="text" data-sheet-path="notes.details.weight.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Возраст</div><div class="v"><input type="text" data-sheet-path="notes.details.age.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Глаза</div><div class="v"><input type="text" data-sheet-path="notes.details.eyes.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Кожа</div><div class="v"><input type="text" data-sheet-path="notes.details.skin.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Волосы</div><div class="v"><input type="text" data-sheet-path="notes.details.hair.value" style="width:140px"></div></div>
            </div>
          </div>

          <div class="sheet-card">
            <h4>Предыстория персонажа</h4>
            <textarea class="sheet-textarea" rows="6" data-sheet-path="personality.backstory.value" placeholder="Кратко опиши предысторию..."></textarea>
          </div>

          <div class="sheet-card">
            <h4>Союзники и организации</h4>
            <textarea class="sheet-textarea" rows="6" data-sheet-path="personality.allies.value" placeholder="Союзники, контакты, гильдии..."></textarea>
          </div>

          <div class="sheet-card">
            <h4>Черты характера</h4>
            <textarea class="sheet-textarea" rows="5" data-sheet-path="personality.traits.value"></textarea>
          </div>

          <div class="sheet-card">
            <h4>Идеалы</h4>
            <textarea class="sheet-textarea" rows="5" data-sheet-path="personality.ideals.value"></textarea>
          </div>

          <div class="sheet-card">
            <h4>Привязанности</h4>
            <textarea class="sheet-textarea" rows="5" data-sheet-path="personality.bonds.value"></textarea>
          </div>

          <div class="sheet-card">
            <h4>Слабости</h4>
            <textarea class="sheet-textarea" rows="5" data-sheet-path="personality.flaws.value"></textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderActiveTab(tabId, vm, canEdit) {
    if (tabId === "basic") return renderBasicTab(vm, canEdit);
    if (tabId === "spells") return CS.spells.renderSpellsTab(vm);
    if (tabId === "combat") return renderCombatTab(vm);
    if (tabId === "inventory") return CS.tabs.renderInventoryTab(vm);
    if (tabId === "personality") return renderPersonalityTab(vm);
    if (tabId === "notes") return CS.tabs.renderNotesTab(vm);
    return `<div class="sheet-note">Раздел в разработке</div>`;
  }

  // ================== RENDER MODAL ==================
  function renderSheetModal(player, opts = {}) {
    if (!sheetTitle || !sheetSubtitle || !sheetActions || !sheetContent) return;
    if (!ctx) return;

    const force = !!opts.force;
    // Если пользователь сейчас редактирует что-то внутри модалки — не перерисовываем, чтобы не прыгал скролл/вкладка.
    if (!force && player?.id && CS.bindings.isModalBusy?.(player.id)) {
      return;
    }

    // сохраняем текущую вкладку/скролл перед любым ререндером
    CS.bindings.captureUiStateFromDom?.(player);

    const myRole = ctx.getMyRole?.();
    const myId = ctx.getMyId?.();
    const canEdit = (myRole === "GM" || String(player.ownerId) === String(myId));
    lastCanEdit = !!canEdit;

    sheetTitle.textContent = `Инфа: ${player.name}`;
    sheetSubtitle.textContent = `Владелец: ${player.ownerName || 'Unknown'} • Тип: ${player.isBase ? 'Основа' : '-'}`;

    CS.viewmodel.ensurePlayerSheetWrapper?.(player);

    sheetActions.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'sheet-note';
    note.textContent = canEdit
      ? "Можно загрузить .json (Long Story Short/Charbox) или редактировать поля вручную — всё сохраняется."
      : "Просмотр. Редактировать может только владелец или GM.";
    sheetActions.appendChild(note);

    if (canEdit) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const sheet = parseCharboxFileText(text);
          player.sheet = sheet;
          ctx.sendMessage({ type: "setPlayerSheet", id: player.id, sheet });

          // Мгновенно обновляем UI (не ждём round-trip через сервер)
          // и при этом не сбрасываем вкладку/скролл.
          CS.bindings.markModalInteracted?.(player.id);
          renderSheetModal(player, { force: true });

          const tmp = document.createElement('div');
          tmp.className = 'sheet-note';
          tmp.textContent = "Файл отправлен. Сейчас обновится состояние…";
          sheetActions.appendChild(tmp);
        } catch (err) {
          alert("Не удалось прочитать/распарсить файл .json");
          console.error(err);
        } finally {
          fileInput.value = '';
        }
      });

      sheetActions.appendChild(fileInput);

      // ===== Мои сохранённые персонажи (привязка к уникальному userId) =====
      // Работает даже если пользователь заходит под разными никами.
      // Сохраняем/загружаем только для персонажа "Основа".
      const savedWrap = document.createElement('div');
      savedWrap.className = 'saved-bases-actions';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Сохранить основу';
      saveBtn.title = 'Сохранить текущую "Инфу" в ваш личный список (по userId)';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.textContent = 'Загрузить основу';
      loadBtn.title = 'Открыть список сохранённых персонажей и выбрать, кого загрузить';

      // доступно только если это действительно "Основа"
      if (!player.isBase) {
        saveBtn.disabled = true;
        loadBtn.disabled = true;
      }

      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!player.isBase) return;
        try {
          const sheet = player.sheet || { parsed: CS.viewmodel.createEmptySheet(player.name) };
          ctx?.sendMessage?.({
            type: 'saveSavedBase',
            playerId: player.id,
            sheet
          });
        } catch (err) {
          console.error(err);
          alert('Не удалось сохранить');
        }
      });

      loadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!player.isBase) return;
        openSavedBasesOverlay({ loading: true, playerId: player.id });
        try {
          ctx?.sendMessage?.({ type: 'listSavedBases' });
        } catch (err) {
          console.error(err);
        }
      });

      savedWrap.appendChild(saveBtn);
      savedWrap.appendChild(loadBtn);
      sheetActions.appendChild(savedWrap);
    }

    const sheet = player.sheet?.parsed || CS.viewmodel.createEmptySheet(player.name);
    const vm = CS.viewmodel.toViewModel(sheet, player.name);

    const tabs = [
      { id: "basic", label: "Основное" },
      { id: "spells", label: "Заклинания" },
      { id: "combat", label: "Бой" },
      { id: "inventory", label: "Инвентарь" },
      { id: "personality", label: "Личность" },
      { id: "notes", label: "Заметки" }
    ];

    // восстановление вкладки (если была)
    const st = player?.id ? CS.bindings.getUiState(player.id) : null;
    if (!player._activeSheetTab) player._activeSheetTab = (st?.activeTab || "basic");
    let activeTab = player._activeSheetTab;

    const hero = `
      <div class="sheet-hero">
        <div class="sheet-hero-top">
          <div>
            <div class="sheet-hero-title">${CS.utils.escapeHtml(vm.name)}</div>
            <div class="sheet-hero-sub">
              ${CS.utils.escapeHtml(vm.cls)} • lvl ${CS.utils.escapeHtml(vm.lvl)} • ${CS.utils.escapeHtml(vm.race)}
            </div>
          </div>
          <div class="sheet-chips">
            <div class="sheet-chip sheet-chip--insp" data-hero="insp" title="Вдохновение" ${canEdit ? "" : "data-readonly"}>
              <div class="k">Вдохновение</div>
              <svg class="insp-star ${vm.inspiration ? "on" : ""}" viewBox="0 0 24 24" aria-label="Вдохновение" role="img">
                <path d="M12 2.6l2.93 5.94 6.56.95-4.75 4.63 1.12 6.53L12 17.9l-5.86 3.08 1.12-6.53L2.5 9.49l6.56-.95L12 2.6z"></path>
              </svg>
            </div>
            <div class="sheet-chip" data-hero="prof" title="Бонус мастерства">
              <div class="k">Владение</div>
              <input class="sheet-chip-input" type="number" min="0" max="10" ${canEdit ? "" : "disabled"} data-sheet-path="proficiency" value="${CS.utils.escapeHtml(String(vm.profBonus))}">
            </div>

            <div class="sheet-chip" data-hero="ac">
              <div class="k">Броня</div>
              <input class="sheet-chip-input" type="number" min="0" max="40" ${canEdit ? "" : "disabled"} data-sheet-path="vitality.ac.value" data-hero-val="ac" value="${CS.utils.escapeHtml(String(vm.ac))}">
            </div>
            <div class="sheet-chip sheet-chip--hp" data-hero="hp" data-hp-open role="button" tabindex="0" style="--hp-fill-pct:${CS.utils.escapeHtml(String(vm.hp ? Math.max(0, Math.min(100, Math.round((Number(vm.hpCur) / Math.max(1, Number(vm.hp))) * 100))) : 0))}%">
              <div class="hp-liquid" aria-hidden="true"></div>
              <div class="k">Здоровье</div>
              <div class="v" data-hero-val="hp">${CS.utils.escapeHtml(String((Number(vm.hpTemp)||0)>0 ? `(${Number(vm.hpTemp)}) ${vm.hpCur}/${vm.hp}` : `${vm.hpCur}/${vm.hp}`))}</div>
            </div>
            <div class="sheet-chip" data-hero="speed">
              <div class="k">Скорость</div>
              <input class="sheet-chip-input" type="number" min="0" max="200" ${canEdit ? "" : "disabled"} data-sheet-path="vitality.speed.value" data-hero-val="speed" value="${CS.utils.escapeHtml(String(vm.spd))}">
            </div>
          </div>
          </div>
        </div>
      </div>
    `;

    const sidebarHtml = `
      <div class="sheet-sidebar">
        ${tabs.map(t => `
          <button class="sheet-tab ${t.id === activeTab ? "active" : ""}" data-tab="${t.id}">
            ${CS.utils.escapeHtml(t.label)}
          </button>
        `).join("")}
      </div>
    `;

    const mainHtml = `
      <div class="sheet-main" id="sheet-main">
        ${renderActiveTab(activeTab, vm, canEdit)}
      </div>
    `;

    sheetContent.innerHTML = `
      ${hero}
      <div class="sheet-layout">
        ${sidebarHtml}
        ${mainHtml}
      </div>
    `;

    // восстанавливаем скролл после рендера
    restoreUiStateToDom(player);

    // отмечаем взаимодействие, чтобы state-обновления не ломали скролл
    const mainEl = sheetContent.querySelector('#sheet-main');
    mainEl?.addEventListener('scroll', () => {
      CS.bindings.markModalInteracted?.(player.id);
      // и сохраняем текущий скролл в uiState
      CS.bindings.captureUiStateFromDom?.(player);
    }, { passive: true });

    sheetContent.addEventListener('pointerdown', () => CS.bindings.markModalInteracted?.(player.id), { passive: true });
    sheetContent.addEventListener('keydown', () => CS.bindings.markModalInteracted?.(player.id), { passive: true });

    CS.bindings.bindEditableInputs(sheetContent, player, canEdit);
    CS.db.bindLanguagesUi(sheetContent, player, canEdit);
    bindSkillBoostDots(sheetContent, player, canEdit);
    bindSaveProfDots(sheetContent, player, canEdit);
    bindStatRollButtons(sheetContent, player);
    bindAbilityAndSkillEditors(sheetContent, player, canEdit);
    CS.tabs.bindNotesEditors(sheetContent, player, canEdit);
    CS.spells.bindSlotEditors(sheetContent, player, canEdit);
    CS.spells.bindSpellAddAndDesc(sheetContent, player, canEdit);
    bindCombatEditors(sheetContent, player, canEdit);
    CS.tabs.bindInventoryEditors(sheetContent, player, canEdit);
    CS.tabs.updateCoinsTotal(sheetContent, player.sheet?.parsed);

    // важное: быстрые клики "Вдохновение" / "Истощение" / "Состояние"
    // (на некоторых браузерах клики по input могут не доходить, если он disabled)
    wireQuickBasicInteractions(sheetContent);

    const tabButtons = sheetContent.querySelectorAll(".sheet-tab");
    const main = sheetContent.querySelector("#sheet-main");

    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;
        if (!tabId) return;

        activeTab = tabId;
        player._activeSheetTab = tabId;
        if (player?.id) { const st = CS.bindings.getUiState(player.id); st.activeTab = tabId; }

        tabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        if (main) {
          const freshSheet = player.sheet?.parsed || CS.viewmodel.createEmptySheet(player.name);
          const freshVm = CS.viewmodel.toViewModel(freshSheet, player.name);
          main.innerHTML = renderActiveTab(activeTab, freshVm, canEdit);

          CS.bindings.bindEditableInputs(sheetContent, player, canEdit);
          bindSkillBoostDots(sheetContent, player, canEdit);
          bindSaveProfDots(sheetContent, player, canEdit);
          bindStatRollButtons(sheetContent, player);
          bindAbilityAndSkillEditors(sheetContent, player, canEdit);
          CS.tabs.bindNotesEditors(sheetContent, player, canEdit);
          CS.spells.bindSlotEditors(sheetContent, player, canEdit);
          CS.spells.bindSpellAddAndDesc(sheetContent, player, canEdit);
          bindCombatEditors(sheetContent, player, canEdit);
          CS.tabs.bindInventoryEditors(sheetContent, player, canEdit);
          CS.db.bindLanguagesUi(sheetContent, player, canEdit);
          CS.tabs.updateCoinsTotal(sheetContent, player.sheet?.parsed);
        }
      });
    });

    // (скролл/взаимодействия уже повешены выше)
  }

  // ================== PUBLIC API ==================
  function init(context) {
    ctx = context || null;
    ensureWiredCloseHandlers();
  }

  function open(player) {
    if (!player) return;
    openedSheetPlayerId = player.id;
    rememberPlayersSnapshot([player]);
    renderSheetModal(player);
    openModal();
  }

  function refresh(players) {
    if (!openedSheetPlayerId) return;
    if (!Array.isArray(players)) return;
    rememberPlayersSnapshot(players);
    const pl = players.find(x => x.id === openedSheetPlayerId);
    if (pl) renderSheetModal(pl);
  }

  // callbacks are called from client.js when server answers
  function onSavedBasesList(list) {
    // если модалка уже открыта — показываем список поверх
    openSavedBasesOverlay({ loading: false, playerId: savedBasesOverlayPlayerId || openedSheetPlayerId });
    renderSavedBasesList(list);
  }

  function onSavedBaseSaved(msg) {
    try {
      // лёгкое уведомление в actions
      const t = document.createElement('div');
      t.className = 'sheet-note';
      t.textContent = `Сохранено: ${msg?.name || 'Персонаж'}`;
      sheetActions?.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch {} }, 2600);
    } catch {}
  }

  function onSavedBaseApplied() {
    // сервер уже применил sheet и разошлёт state
    closeSavedBasesOverlay();
  }

  function onSavedBaseDeleted(msg) {
    // удалили — просто перезапросим список
    try {
      openSavedBasesOverlay({ loading: true, playerId: savedBasesOverlayPlayerId || openedSheetPlayerId });
      ctx?.sendMessage?.({ type: 'listSavedBases' });
    } catch {}
  }

  window.InfoModal = {
    init,
    open,
    refresh,
    close: closeModal,
    onSavedBasesList,
    onSavedBaseSaved,
    onSavedBaseApplied,
    onSavedBaseDeleted
  };
})();



