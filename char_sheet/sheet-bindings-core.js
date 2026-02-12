/* char_sheet/sheet-bindings-core.js */
(function(){
  const CS = window.CharSheet = window.CharSheet || {};
  CS.utils = CS.utils || {};
  CS.bindings = CS.bindings || {};
  CS.dom = CS.dom || {};
  CS.modal = CS.modal || {};
  CS.db = CS.db || {};
  // DOM refs are owned by sheet-modal.js, but we keep safe fallbacks here.
  const getSheetModalEl = () => CS.dom?.sheetModal || document.getElementById('sheet-modal');
  const getSheetContentEl = () => CS.dom?.sheetContent || document.getElementById('sheet-content');
  const uiStateByPlayerId = new Map();

  // debounce save timers
  const sheetSaveTimers = new Map();

  // ================== UTILS ==================
  function openPopup({ title="", bodyHtml="" } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "popup-overlay";
    overlay.innerHTML = `
      <div class="popup-card" role="dialog" aria-modal="true">
        <div class="popup-head">
          <div class="popup-title">${CS.utils.escapeHtml(String(title||""))}</div>
          <button class="popup-close" type="button" data-popup-close>✕</button>
        </div>
        <div class="popup-body">${bodyHtml}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => {
      overlay.remove();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
      if (e.target?.closest?.("[data-popup-close]")) close();
    });
    document.addEventListener("keydown", function onEsc(ev){
      if (ev.key === "Escape") {
        document.removeEventListener("keydown", onEsc);
        if (overlay.isConnected) close();
      }
    });
    return { overlay, close };
  }

  // ================== UI STATE (tab/scroll/anti-jump) ==================
  function getUiState(playerId) {
    if (!playerId) return { activeTab: "basic", scrollTopByTab: {}, lastInteractAt: 0 };
    if (!uiStateByPlayerId.has(playerId)) {
      uiStateByPlayerId.set(playerId, { activeTab: "basic", scrollTopByTab: {}, lastInteractAt: 0 });
    }
    return uiStateByPlayerId.get(playerId);
  }

  function captureUiStateFromDom(player) {
    if (!player?.id) return;
    const st = getUiState(player.id);
    const activeTab = player._activeSheetTab || st.activeTab || "basic";
    st.activeTab = activeTab;

    const sheetContent = getSheetContentEl();
    const main = sheetContent?.querySelector?.("#sheet-main");
    if (main) {
      st.scrollTopByTab[activeTab] = main.scrollTop || 0;
    }
  }

  function restoreUiStateToDom(player) {
    if (!player?.id) return;
    const st = getUiState(player.id);
    const activeTab = player._activeSheetTab || st.activeTab || "basic";
    const sheetContent = getSheetContentEl();
    const main = sheetContent?.querySelector?.("#sheet-main");
    if (main && st.scrollTopByTab && typeof st.scrollTopByTab[activeTab] === "number") {
      main.scrollTop = st.scrollTopByTab[activeTab];
    }
  }

  function markModalInteracted(playerId) {
    if (!playerId) return;
    const st = getUiState(playerId);
    st.lastInteractAt = Date.now();
  }

  function isModalBusy(playerId) {
    const sheetModal = getSheetModalEl();
    if (!sheetModal || sheetModal.classList.contains('hidden')) return false;
    const activeEl = document.activeElement;
    if (activeEl && sheetModal.contains(activeEl)) return true;
    const st = getUiState(playerId);
    return (Date.now() - (st.lastInteractAt || 0)) < 900;
  }

  // ================== SHEET PARSER (Charbox/LSS) ==================
  function parseCharboxFileText(fileText) {
    const outer = JSON.parse(fileText);

    // Charbox LSS: outer.data — строка JSON
    let inner = null;
    if (outer && typeof outer.data === 'string') {
      try { inner = JSON.parse(outer.data); } catch { inner = null; }
    }

    return {
      source: "charbox",
      importedAt: Date.now(),
      raw: outer,
      parsed: inner || outer
    };
  }

  // ================== TIPTAP DOC PARSING ==================
  function tiptapToPlainLines(doc) {
    if (!doc || typeof doc !== "object") return [];
    const root = doc?.content;
    if (!Array.isArray(root)) return [];
    const lines = [];

    function walkNode(node, acc) {
      if (!node || typeof node !== "object") return acc;
      if (node.type === "text") {
        acc.push(String(node.text || ""));
        return acc;
      }
      if (Array.isArray(node.content)) {
        node.content.forEach(ch => walkNode(ch, acc));
      }
      return acc;
    }

    for (const block of root) {
      if (!block) continue;
      if (block.type === "paragraph") {
        const acc = [];
        walkNode(block, acc);
        const line = acc.join("").trim();
        if (line) lines.push(line);
      }
    }
    return lines;
  }

  function scheduleSheetSave(player) {
    if (!player?.id || !ctx?.sendMessage) return;

    const key = player.id;
    const prev = sheetSaveTimers.CS.utils.get(key);
    if (prev) clearTimeout(prev);

    const t = setTimeout(() => {
      ctx.sendMessage({ type: "setPlayerSheet", id: player.id, sheet: player.sheet });
      sheetSaveTimers.delete(key);
    }, 450);

    sheetSaveTimers.set(key, t);
  }

  // ===== Coins helpers =====
  const COIN_TO_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

  function coinsTotalCp(sheet) {
    const cp = CS.utils.safeInt(sheet?.coins?.cp?.value, 0);
    const sp = CS.utils.safeInt(sheet?.coins?.sp?.value, 0);
    const ep = CS.utils.safeInt(sheet?.coins?.ep?.value, 0);
    const gp = CS.utils.safeInt(sheet?.coins?.gp?.value, 0);
    const pp = CS.utils.safeInt(sheet?.coins?.pp?.value, 0);
    return cp * 1 + sp * 10 + ep * 50 + gp * 100 + pp * 1000;
  }

  function fmtCoinNumber(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "0";
    const rounded = Math.round(n * 100) / 100;
    return (Math.abs(rounded - Math.round(rounded)) < 1e-9)
      ? String(Math.round(rounded))
      : String(rounded);
  }

function bindEditableInputs(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    const inputs = root.querySelectorAll("[data-sheet-path]");
    inputs.forEach(inp => {
      const path = inp.getAttribute("data-sheet-path");
      if (!path) return;

      // если в json есть tiptap-профи, а plain пустой — заполняем plain один раз, чтобы было что редактировать
      if (path === "text.profPlain.value") {
        const curPlain = getByPath(player.sheet.parsed, "text.profPlain.value");
        if (!curPlain) {
          const profDoc = player.sheet.parsed?.text?.prof?.value?.data;
          const lines = tiptapToPlainLines(profDoc);
          if (lines && lines.length) {
            setByPath(player.sheet.parsed, "text.profPlain.value", lines.join("\n"));
          }
        }
      }

      const raw = getByPath(player.sheet.parsed, path);
      if (inp.type === "checkbox") inp.checked = !!raw;
      else inp.value = (raw ?? "");

      if (!canEdit) {
        inp.disabled = true;
        return;
      }

      const handler = () => {
        let val;
        if (inp.type === "checkbox") val = !!inp.checked;
        else if (inp.type === "number") val = inp.value === "" ? "" : Number(inp.value);
        else val = inp.value;

        setByPath(player.sheet.parsed, path, val);


        // Истощение (0..6) и Состояние (строка) не связаны
        if (path === "exhaustion") {
          const ex = Math.max(0, Math.min(6, CS.utils.safeInt(getByPath(player.sheet.parsed, "exhaustion"), 0)));
          setByPath(player.sheet.parsed, "exhaustion", ex);
        }

        if (path === "name.value") player.name = val || player.name;

        // keep hp popup synced after re-render
    try {
      if (hpPopupEl && !hpPopupEl.classList.contains('hidden')) {
        const pNow = getOpenedPlayerSafe();
        if (pNow?.sheet?.parsed) syncHpPopupInputs(pNow.sheet.parsed);
      }
    } catch {}

// live updates
if (path === "proficiency" || path === "proficiencyCustom") {
  // пересчитать навыки/пассивы + проверка/спасбросок (т.к. зависят от бонуса владения)
  updateSkillsAndPassives(root, player.sheet.parsed);
  try {
    ["str","dex","con","int","wis","cha"].forEach(k => updateDerivedForStat(root, player.sheet.parsed, k));
  } catch {}

  // обновить подсказку у кружков спасбросков
  root.querySelectorAll('.lss-save-dot[data-save-key]').forEach(d => {
    const statKey = d.getAttribute('data-save-key');
    if (statKey) d.title = `Владение спасброском: +${getProfBonus(player.sheet.parsed)} к спасброску`;
  });

  updateWeaponsBonuses(root, player.sheet.parsed);
}
        if (path === "vitality.ac.value" || path === "vitality.hp-max.value" || path === "vitality.hp-current.value" || path === "vitality.speed.value") {
          updateHeroChips(root, player.sheet.parsed);
        }

        // Если мы сейчас на вкладке "Заклинания" — пересчитываем метрики при изменении владения
        if (player?._activeSheetTab === "spells" && (path === "proficiency" || path === "proficiencyCustom")) {
          const s = player.sheet?.parsed;
          if (s) rerenderSpellsTabInPlace(root, player, s, canEdit);
        }

        // Монеты: обновляем пересчёт итога без полного ререндера
        if (path.startsWith("coins.") || path.startsWith("coinsView.")) {
          CS.tabs.updateCoinsTotal(root, player.sheet.parsed);
        }

        scheduleSheetSave(player);
      };

      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
    });
  }
  // ===== clickable dots binding (skills boost) =====
  function bindSkillBoostDots(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    const sheet = player.sheet.parsed;
    const dots = root.querySelectorAll(".lss-dot[data-skill-key]");
    dots.forEach(dot => {
      const skillKey = dot.getAttribute("data-skill-key");
      if (!skillKey) return;

      dot.classList.add("clickable");
      if (!canEdit) return;

      dot.addEventListener("click", (e) => {
        e.stopPropagation();

        const cur = getSkillBoostLevel(sheet, skillKey);
        const next = (cur === 0) ? 1 : (cur === 1) ? 2 : 0;

        setSkillBoostLevel(sheet, skillKey, next);

        dot.classList.remove("boost1", "boost2");
        if (next === 1) dot.classList.add("boost1");
        if (next === 2) dot.classList.add("boost2");

        const row = dot.closest(".lss-skill-row");
        if (row) {
          const valEl = row.querySelector(".lss-skill-val");
          if (valEl) {
            const v = CS.utils.formatMod(calcSkillBonus(sheet, skillKey));
            if (valEl.tagName === "INPUT" || valEl.tagName === "TEXTAREA") valEl.value = v;
            else valEl.textContent = v;
          }

          const nameEl = row.querySelector(".lss-skill-name");
          if (nameEl) {
            let boostSpan = nameEl.querySelector(".lss-boost");
            const stars = boostLevelToStars(next);

            if (!boostSpan) {
              boostSpan = document.createElement("span");
              boostSpan.className = "lss-boost";
              nameEl.appendChild(boostSpan);
            }
            boostSpan.textContent = stars ? ` ${stars}` : "";
          }
        }

        scheduleSheetSave(player);
      });
    });
  }

  // ===== clickable dot binding (saving throws proficiency) =====
  function bindSaveProfDots(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    const sheet = player.sheet.parsed;
    const dots = root.querySelectorAll('.lss-save-dot[data-save-key]');
    dots.forEach(dot => {
      const statKey = dot.getAttribute('data-save-key');
      if (!statKey) return;

      dot.classList.add('clickable');
      dot.classList.toggle('active', !!sheet?.saves?.[statKey]?.isProf);
      dot.title = `Владение спасброском: +${getProfBonus(sheet)} к спасброску`;

      if (!canEdit) return;

      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canEdit) return;

        if (!sheet.saves || typeof sheet.saves !== 'object') sheet.saves = {};
        if (!sheet.saves[statKey] || typeof sheet.saves[statKey] !== 'object') {
          sheet.saves[statKey] = { name: statKey, isProf: false, bonus: 0 };
        }

        sheet.saves[statKey].isProf = !sheet.saves[statKey].isProf;
        dot.classList.toggle('active', !!sheet.saves[statKey].isProf);
        dot.title = `Владение спасброском: +${getProfBonus(sheet)} к спасброску`;

        // обновить значение спасброска в UI
        const ability = dot.closest('.lss-ability');
        const saveInp = ability?.querySelector(`.lss-pill-val[data-kind="save"][data-stat-key="${CSS.escape(statKey)}"]`);
        if (saveInp) {
          const v = CS.utils.formatMod(calcSaveBonus(sheet, statKey));
          if (saveInp.tagName === 'INPUT' || saveInp.tagName === 'TEXTAREA') saveInp.value = v;
          else saveInp.textContent = v;
        }

        scheduleSheetSave(player);
      });
    });
  }

  // ===== dice buttons (checks/saves/skills) =====
  function bindStatRollButtons(root, player) {
    if (!root || !player?.sheet?.parsed) return;
    const sheet = player.sheet.parsed;

    const btns = root.querySelectorAll('.lss-dice-btn[data-roll-kind]');
    btns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const kind = btn.getAttribute('data-roll-kind');
        let bonus = 0;
        let kindText = 'Бросок d20';

        if (kind === 'skill') {
          const skillKey = btn.getAttribute('data-skill-key');
          if (!skillKey) return;
          bonus = calcSkillBonus(sheet, skillKey);
          const label = sheet?.skills?.[skillKey]?.label || skillKey;
          kindText = `${label}: d20${bonus ? CS.utils.formatMod(bonus) : ''}`;
        }

        if (kind === 'check') {
          const statKey = btn.getAttribute('data-stat-key');
          if (!statKey) return;
          bonus = calcCheckBonus(sheet, statKey);
          const label = sheet?.stats?.[statKey]?.label || statKey;
          kindText = `${label}: Проверка d20${bonus ? CS.utils.formatMod(bonus) : ''}`;
        }

        if (kind === 'save') {
          const statKey = btn.getAttribute('data-stat-key');
          if (!statKey) return;
          bonus = calcSaveBonus(sheet, statKey);
          const label = sheet?.stats?.[statKey]?.label || statKey;
          kindText = `${label}: Спасбросок d20${bonus ? CS.utils.formatMod(bonus) : ''}`;
        }

        // бросок в общую панель кубиков (и в лог/"Броски других")
        if (window.DicePanel?.roll) {
          await window.DicePanel.roll({ sides: 20, count: 1, bonus, kindText });
        }
      });
    });
  }

  // ===== editable abilities / checks / saves / skill values =====
  function bindAbilityAndSkillEditors(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;
    const sheet = player.sheet.parsed;

    // ---- ability score edits (score -> modifier -> recompute) ----
    const scoreInputs = root.querySelectorAll('.lss-ability-score-input[data-stat-key]');
    scoreInputs.forEach(inp => {
      const statKey = inp.getAttribute('data-stat-key');
      if (!statKey) return;

      if (!canEdit) { inp.disabled = true; return; }

      const handler = () => {
        const score = CS.utils.safeInt(inp.value, 10);
        if (!sheet.stats) sheet.stats = {};
        if (!sheet.stats[statKey]) sheet.stats[statKey] = {};
        sheet.stats[statKey].score = score;
        sheet.stats[statKey].modifier = CS.utils.scoreToModifier(score);

        // обновляем связанные значения на экране
        updateDerivedForStat(root, sheet, statKey);
        updateSkillsAndPassives(root, sheet);
         updateWeaponsBonuses(root, sheet);

        scheduleSheetSave(player);
      };

      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
    });

    // ---- check/save edits (меняем bonus-часть, чтобы итог стал нужным) ----
    const pillInputs = root.querySelectorAll('.lss-pill-val-input[data-stat-key][data-kind]');
    pillInputs.forEach(inp => {
      const statKey = inp.getAttribute('data-stat-key');
      const kind = inp.getAttribute('data-kind');
      if (!statKey || !kind) return;

      if (!canEdit) { inp.disabled = true; return; }

      const handler = () => {
        const desired = CS.utils.parseModInput(inp.value, 0);
        const prof = getProfBonus(sheet);
        const statMod = CS.utils.safeInt(sheet?.stats?.[statKey]?.modifier, 0);

        if (kind === "save") {
          if (!sheet.saves) sheet.saves = {};
          if (!sheet.saves[statKey]) sheet.saves[statKey] = {};
          const isProf = !!sheet.saves[statKey].isProf;
          const base = statMod + (isProf ? prof : 0);
          sheet.saves[statKey].bonus = desired - base;
        }

        if (kind === "check") {
          if (!sheet.stats) sheet.stats = {};
          if (!sheet.stats[statKey]) sheet.stats[statKey] = {};
          const check = CS.utils.safeInt(sheet.stats[statKey].check, 0); // 0/1/2
          let base = statMod;
          if (check === 1) base += prof;
          if (check === 2) base += prof * 2;
          sheet.stats[statKey].checkBonus = desired - base;
        }

        // сразу обновим вывод (на случай странного ввода)
        updateDerivedForStat(root, sheet, statKey);
        updateSkillsAndPassives(root, sheet);

        scheduleSheetSave(player);
      };

      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
    });

    // ---- skill bonus edits (меняем skill.bonus так, чтобы итог стал нужным) ----
    const skillInputs = root.querySelectorAll('.lss-skill-val-input[data-skill-key]');
    skillInputs.forEach(inp => {
      const skillKey = inp.getAttribute('data-skill-key');
      if (!skillKey) return;

      if (!canEdit) { inp.disabled = true; return; }

      const handler = () => {
        const desired = CS.utils.parseModInput(inp.value, 0);
        if (!sheet.skills) sheet.skills = {};
        if (!sheet.skills[skillKey]) sheet.skills[skillKey] = {};

        const baseStat = sheet.skills[skillKey].baseStat;
        const statMod = CS.utils.safeInt(sheet?.stats?.[baseStat]?.modifier, 0);
        const prof = getProfBonus(sheet);
        const boostLevel = getSkillBoostLevel(sheet, skillKey);
        const boostAdd = boostLevelToAdd(boostLevel, prof);

        // extra бонус внутри навыка
        sheet.skills[skillKey].bonus = desired - statMod - boostAdd;

        // обновляем навык и пассивки
        updateSkillsAndPassives(root, sheet);

        scheduleSheetSave(player);
      };

      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
    });
  }

  // ===== Notes tab: add / rename / toggle / delete, text editing =====

  // ================== EXPORTS ==================
  CS.bindings = CS.bindings || {};
  CS.bindings.openPopup = openPopup;
  CS.bindings.getUiState = getUiState;
  CS.bindings.markModalInteracted = markModalInteracted;
  CS.bindings.captureUiStateFromDom = captureUiStateFromDom;
  CS.bindings.isModalBusy = isModalBusy;
  CS.bindings.tiptapToPlainLines = tiptapToPlainLines;
  CS.bindings.scheduleSheetSave = scheduleSheetSave;
  CS.bindings.bindEditableInputs = bindEditableInputs;



  // Expose binding helpers for other modules (backward-compat)
  CS.bindings = CS.bindings || {};
  CS.bindings.captureUiStateFromDom = captureUiStateFromDom;
  CS.bindings.restoreUiStateToDom = restoreUiStateToDom;
  CS.bindings.isModalBusy = isModalBusy;
  CS.bindings.markModalInteracted = markModalInteracted;

  CS.bindings.bindEditableInputs = bindEditableInputs;
  CS.bindings.bindAbilityAndSkillEditors = bindAbilityAndSkillEditors;
  CS.bindings.bindSaveProfDots = bindSaveProfDots;
  CS.bindings.bindSkillBoostDots = bindSkillBoostDots;
  CS.bindings.bindStatRollButtons = bindStatRollButtons;

  // Some modules still reference these as globals
  window.captureUiStateFromDom = captureUiStateFromDom;
  window.restoreUiStateToDom = restoreUiStateToDom;
  window.isModalBusy = isModalBusy;
  window.markModalInteracted = markModalInteracted;

  window.bindEditableInputs = bindEditableInputs;
  window.bindAbilityAndSkillEditors = bindAbilityAndSkillEditors;
  window.bindSaveProfDots = bindSaveProfDots;
  window.bindSkillBoostDots = bindSkillBoostDots;
  window.bindStatRollButtons = bindStatRollButtons;

})();
