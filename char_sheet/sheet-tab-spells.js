/* char_sheet/sheet-tab-spells.js */
(function(){
  const CS = window.CharSheet = window.CharSheet || {};
function bindSlotEditors(root, player, canEdit) {
  if (!root || !player?.sheet) return;

  // IMPORTANT:
  // sheetContent (root) переиспользуется между открытиями модалки и при импорте .json.
  // Если повесить обработчики один раз и замкнуть player в closure — появится рассинхрон:
  // клики/правки будут менять sheet старого игрока, а UI будет рендериться по новому.
  // Поэтому храним актуальные ссылки на player/canEdit прямо на root и берём их в момент события.
  root.__spellSlotsState = { player, canEdit };

  const getState = () => root.__spellSlotsState || { player, canEdit };

  const getSheet = () => {
    const { player: curPlayer } = getState();
    const s = curPlayer?.sheet?.parsed;
    if (!s || typeof s !== "object") return null;
    if (!s.spells || typeof s.spells !== "object") s.spells = {};
    return s;
  };

  const inputs = root.querySelectorAll(".slot-current-input[data-slot-level]");
  inputs.forEach(inp => {
    const lvl = CS.utils.safeInt(inp.getAttribute("data-slot-level"), 0);
    if (!lvl) return;

    if (!canEdit) { inp.disabled = true; return; }

    const handler = () => {
      const sheet = getSheet();
      if (!sheet) return;

      // desired = итоговое число ячеек (0..12)
      // Требование: если уменьшаем число — лишние ячейки должны удаляться целиком (а не просто "разряжаться").
      // Если увеличиваем — новые ячейки считаем заряженными.
      const desiredTotal = Math.max(0, Math.min(12, CS.utils.safeInt(inp.value, 0)));

      const key = `slots-${lvl}`;
      if (!sheet.spells[key] || typeof sheet.spells[key] !== "object") {
        sheet.spells[key] = { value: 0, filled: 0 };
      }

      const totalPrev = CS.utils.numLike(sheet.spells[key].value, 0);
      const filledPrev = CS.utils.numLike(sheet.spells[key].filled, 0);
      const currentPrev = Math.max(0, totalPrev - filledPrev);

      // total slots = desiredTotal (уменьшение удаляет лишние)
      const total = desiredTotal;

      // current (заряжено): при увеличении — полностью заряжаем, при уменьшении — не больше total
      const current = (total > totalPrev) ? total : Math.min(currentPrev, total);

      CS.utils.setMaybeObjField(sheet.spells[key], "value", total);
      CS.utils.setMaybeObjField(sheet.spells[key], "filled", Math.max(0, total - current));

      // update dots in UI without full rerender
      const dotsWrap = root.querySelector(`.slot-dots[data-slot-dots="${lvl}"]`);
      if (dotsWrap) {
        const totalForUi = Math.max(0, Math.min(12, CS.utils.numLike(sheet.spells[key].value, 0)));
        const dots = Array.from({ length: totalForUi })
          .map((_, i) => `<span class="slot-dot${i < current ? " is-available" : ""}" data-slot-level="${lvl}"></span>`)
          .join("");
        dotsWrap.innerHTML = dots || `<span class="slot-dots-empty">—</span>`;
      }

      inp.value = String(total);
      const { player: curPlayer } = getState();
      CS.bindings.scheduleSheetSave(curPlayer);
    };

    inp.addEventListener("input", handler);
    inp.addEventListener("change", handler);
  });

  // кликабельные кружки: синий = доступно, пустой = использовано
  if (!root.__spellSlotsDotsBound) {
    root.__spellSlotsDotsBound = true;
    root.addEventListener("click", async (e) => {
      const { player: curPlayer, canEdit: curCanEdit } = getState();

      // ===== 🎲 Атака заклинанием (d20 + бонус атаки) =====
      // (должно работать независимо от клика по слотам)
      const rollHeaderBtn = e.target?.closest?.("[data-spell-roll-header]");
      const rollSpellBtn = e.target?.closest?.("[data-spell-roll]");

      if (rollHeaderBtn || rollSpellBtn) {
        const sheet = getSheet();
        if (!sheet) return;

        const bonus = CS.utils.computeSpellAttack(sheet);

        let lvl = 0;
        let title = "";
        if (rollSpellBtn) {
          const item = rollSpellBtn.closest(".spell-item");
          lvl = CS.utils.safeInt(item?.getAttribute?.("data-spell-level"), 0);
          title = (item?.querySelector?.(".spell-item-link")?.textContent || item?.querySelector?.(".spell-item-title")?.textContent || "").trim();
        }

        // Бонус для броска берём из видимого поля "Бонус атаки" (если есть),
        // чтобы итог в панели "Бросок" совпадал с тем, что видит игрок.
        const atkInput = root.querySelector('[data-spell-attack-bonus]');
        const uiBonus = atkInput ? CS.utils.safeInt(atkInput.value, bonus) : bonus;

        // В панели "Бросок" не показываем текст "Атака заклинанием" — только число.
        // А в журнал/другим игрокам отправляем отдельное событие с понятным названием.
        let rollRes = null;
        if (window.DicePanel?.roll) {
          rollRes = await window.DicePanel.roll({
            sides: 20,
            count: 1,
            bonus: uiBonus,
            // Показываем в панели "Бросок" так же, как атака оружием:
            // "Заклинания: d20+X" (X берётся из поля "Бонус атаки" в разделе Заклинаний)
            kindText: `Заклинания: d20${CS.utils.formatMod(uiBonus)}`,
            silent: true
          });
        }

        try {
          if (typeof sendMessage === 'function' && rollRes) {
            const r = rollRes.rolls?.[0];
            const b = Number(rollRes.bonus) || 0;
            const bonusTxt = b ? ` ${b >= 0 ? '+' : '-'} ${Math.abs(b)}` : '';
            const nameTxt = title ? ` (${title})` : '';
            sendMessage({
              type: 'log',
              text: `Атака заклинанием${nameTxt}: d20(${r})${bonusTxt} => ${rollRes.total}`
            });

            sendMessage({
              type: 'diceEvent',
              event: {
                kindText: `Атака заклинанием${nameTxt}`,
                sides: 20,
                count: 1,
                bonus: b,
                rolls: [r],
                total: rollRes.total,
                crit: (r === 1 ? 'crit-fail' : r === 20 ? 'crit-success' : '')
              }
            });
          }
        } catch {}

        // если бросок был из конкретного заклинания — тратим 1 ячейку соответствующего уровня (кроме заговоров)
        if (rollSpellBtn && lvl > 0) {
          if (!curCanEdit) return;

          if (!sheet.spells || typeof sheet.spells !== "object") sheet.spells = {};
          const key = `slots-${lvl}`;
          if (!sheet.spells[key] || typeof sheet.spells[key] !== "object") sheet.spells[key] = { value: 0, filled: 0 };

          const total = Math.max(0, Math.min(12, CS.utils.numLike(sheet.spells[key].value, 0)));
          const filled = Math.max(0, Math.min(total, CS.utils.numLike(sheet.spells[key].filled, 0)));
          const available = Math.max(0, total - filled);

          if (available > 0) {
            CS.utils.setMaybeObjField(sheet.spells[key], "filled", Math.min(total, filled + 1));

            // обновим UI кружков конкретного уровня без полного ререндера
            const dotsWrap = root.querySelector(`.slot-dots[data-slot-dots="${lvl}"]`);
            if (dotsWrap) {
              const filled2 = Math.max(0, Math.min(total, CS.utils.numLike(sheet.spells[key].filled, 0)));
              const available2 = Math.max(0, total - filled2);
              const dots = Array.from({ length: total })
                .map((_, i) => `<span class="slot-dot${i < available2 ? " is-available" : ""}" data-slot-level="${lvl}"></span>`)
                .join("");
              dotsWrap.innerHTML = dots || `<span class="slot-dots-empty">—</span>`;
            }

            CS.bindings.scheduleSheetSave(curPlayer);
          }
        }

        return;
      }

      // ===== слоты =====
      const dot = e.target?.closest?.(".slot-dot[data-slot-level]");
      if (!dot) return;

      if (!curCanEdit) return;

      const sheet = getSheet();
      if (!sheet) return;

      const lvl = CS.utils.safeInt(dot.getAttribute("data-slot-level"), 0);
      if (!lvl) return;

      const key = `slots-${lvl}`;
      if (!sheet.spells[key] || typeof sheet.spells[key] !== "object") {
        sheet.spells[key] = { value: 0, filled: 0 };
      }

      const total = Math.max(0, Math.min(12, CS.utils.numLike(sheet.spells[key].value, 0)));
      const filled = Math.max(0, Math.min(total, CS.utils.numLike(sheet.spells[key].filled, 0)));
      let available = Math.max(0, total - filled);

      // нажали на доступный -> используем 1; нажали на пустой -> возвращаем 1
      if (dot.classList.contains("is-available")) available = Math.max(0, available - 1);
      else available = Math.min(total, available + 1);

      CS.utils.setMaybeObjField(sheet.spells[key], "filled", Math.max(0, total - available));

      const inp = root.querySelector(`.slot-current-input[data-slot-level="${lvl}"]`);
      if (inp) inp.value = String(available);

      const dotsWrap = root.querySelector(`.slot-dots[data-slot-dots="${lvl}"]`);
      if (dotsWrap) {
        const dots = Array.from({ length: total })
          .map((_, i) => `<span class="slot-dot${i < available ? " is-available" : ""}" data-slot-level="${lvl}"></span>`)
          .join("");
        dotsWrap.innerHTML = dots || `<span class="slot-dots-empty">—</span>`;
      }

      CS.bindings.scheduleSheetSave(curPlayer);
    });
  }
}

// ===== add spells by URL + toggle descriptions =====
function normalizeDndSuUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  // accept dnd.su links only (spells)
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!parsed.hostname.endsWith("dnd.su")) return "";
    // normalize trailing slash
    let href = parsed.href;
    if (!href.endsWith("/")) href += "/";
    return href;
  } catch {
    return "";
  }
}

async function fetchSpellHtml(url) {
  // GitHub Pages = статик: прямой fetch к dnd.su блокируется CORS.
  // Поэтому порядок такой:
  // 1) Supabase Edge Function (invoke) если доступен
  // 2) Supabase Edge Function по полному URL (если так задано)
  // 3) Fallback через r.jina.ai (read-only прокси)
  // НИКАКИХ /api/fetch и НИКАКИХ прямых запросов к dnd.su на статике.

  const targetUrl = normalizeDndSuUrl(url);

  // --- 1) Supabase invoke по имени функции ---
  try {
    const fn = (typeof window !== "undefined" && window.SUPABASE_FETCH_FN) ? String(window.SUPABASE_FETCH_FN) : "";
    const sbGetter = (typeof window !== "undefined" && typeof window.getSbClient === "function") ? window.getSbClient : null;

    if (fn && !fn.startsWith("http") && sbGetter) {
      const sb = sbGetter();
      if (sb && sb.functions && typeof sb.functions.invoke === "function") {
        const { data, error } = await sb.functions.invoke(fn, { body: { url: targetUrl } });
        if (error) throw error;
        if (!data || typeof data.html !== "string") throw new Error("Supabase function returned no html");
        return data.html;
      }
    }
  } catch (e) {
    console.warn("Supabase invoke fetch failed, falling back to proxy:", e);
  }

  // --- 2) Supabase по полному URL (если задан) ---
  try {
    const fnUrl = (typeof window !== "undefined" && window.SUPABASE_FETCH_FN) ? String(window.SUPABASE_FETCH_FN) : "";
    if (fnUrl && fnUrl.startsWith("http")) {
      const r = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!j || typeof j.html !== "string") throw new Error("Function returned no html");
      return j.html;
    }
  } catch (e) {
    console.warn("Supabase URL fetch failed, falling back to proxy:", e);
  }

  // --- 3) r.jina.ai fallback ---
  const clean = targetUrl.replace(/^https?:\/\//i, "");
  const proxyUrl = `https://r.jina.ai/https://${clean}`;
  const resp = await fetch(proxyUrl, { method: "GET" });
  if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
  return await resp.text();
}


function cleanupSpellDesc(raw) {
  let s = String(raw || "");

  // normalize newlines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // remove injected commentsAccess tail (sometimes прилетает из html)
  s = s.replace(/window\.commentsAccess\s*=\s*\{[\s\S]*?\}\s*;?/g, "");
  s = s.replace(/window\.commentsAccess[\s\S]*?;?/g, "");

  // fix glued words like "вызовВремя" -> "вызов\nВремя"
  s = s.replace(/([0-9a-zа-яё])([A-ZА-ЯЁ])/g, "$1\n$2");

  // trim each line + collapse excessive blank lines
  s = s
    .split("\n")
    .map(l => l.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return s;
}

function extractSpellFromHtml(html) {
  const rawHtml = String(html || "");

  let name = "";
  let desc = "";

  try {
    const doc = new DOMParser().parseFromString(rawHtml, "text/html");

    // name
    name = (doc.querySelector('h2.card-title[itemprop="name"]')?.textContent || "").trim();

    // main description: from <ul class="params card__article-body"> ... until comments block
    const startEl = doc.querySelector('ul.params.card__article-body');
    if (startEl) {
      // best-effort: take text of this block (it usually contains all params + описание)
      desc = (startEl.innerText || startEl.textContent || "");
    }

    // fallback: slice between markers if DOM layout changed
    if (!desc) {
      const start = rawHtml.indexOf('<ul class="params card__article-body"');
      const end = rawHtml.indexOf('<section class="comments-block');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = rawHtml.slice(start, end);
        const wrap = document.createElement("div");
        wrap.innerHTML = slice;
        desc = (wrap.innerText || wrap.textContent || "");
      }
    }
  } catch {
    name = name || "";
    desc = desc || "";
  }

  desc = cleanupSpellDesc(desc);

  return { name: name || "(без названия)", desc: desc || "" };
}



function ensureSpellSaved(sheet, level, name, href, desc) {
  if (!sheet.text || typeof sheet.text !== "object") sheet.text = {};

  // store meta
  sheet.text[`spell-name:${href}`] = { value: String(name || "").trim() };
  sheet.text[`spell-desc:${href}`] = { value: cleanupSpellDesc(desc || "") };

  // append to plain list if absent
  const plainKey = `spells-level-${level}-plain`;
  const cur = String(sheet.text?.[plainKey]?.value ?? "");
  const lines = cur.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const already = lines.some(l => l.includes(href));
  if (!already) lines.push(`${name} | ${href}`);
  sheet.text[plainKey] = { value: lines.join("\n") };
}



function deleteSpellSaved(sheet, href) {
  if (!sheet || !href) return;

  if (!sheet.text || typeof sheet.text !== "object") sheet.text = {};

  // remove meta
  delete sheet.text[`spell-name:${href}`];
  delete sheet.text[`spell-desc:${href}`];

  // remove from all plain lists
  for (let lvl = 0; lvl <= 9; lvl++) {
    const plainKey = `spells-level-${lvl}-plain`;
    const cur = String(sheet.text?.[plainKey]?.value ?? "");
    if (!cur) continue;
    const lines = cur.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const next = lines.filter(l => !l.includes(href));
    if (next.length) sheet.text[plainKey] = { value: next.join("\n") };
    else delete sheet.text[plainKey];
  }
}

function makeManualHref() {
  // псевдо-ссылка для "ручных" заклинаний, чтобы хранить описание в sheet.text
  return `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rerenderSpellsTabInPlace(root, player, sheet, canEdit) {
  const main = root.querySelector("#sheet-main");
  if (!main) return;
  const scrollTop = main.scrollTop;

  const freshVm = CS.viewmodel.toViewModel(sheet, player.name);
  main.innerHTML = renderSpellsTab(freshVm);

  CS.bindings.bindEditableInputs(root, player, canEdit);
  bindSkillBoostDots(root, player, canEdit);
  bindSaveProfDots(root, player, canEdit);
  bindStatRollButtons(root, player);
  bindAbilityAndSkillEditors(root, player, canEdit);
  CS.tabs.bindNotesEditors(root, player, canEdit);
  bindSlotEditors(root, player, canEdit);
  bindSpellAddAndDesc(root, player, canEdit);
  bindCombatEditors(root, player, canEdit);

  main.scrollTop = scrollTop;
}

// ===== Spells DB parsing =====
const spellDbCache = {
  classes: null,            // [{value,label,url}]
  byClass: new Map(),       // value -> spells array
  descByHref: new Map()     // href -> {name,desc}
};

function parseSpellClassesFromHtml(html) {
  const out = [];
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

    // 0) актуальная разметка dnd.su (список классов):
    // <li class="if-list__item" data-value="21"><div class="if-list__item-title">Волшебник</div></li>
    // выбранный класс: class="if-list__item active"
    const liItems = Array.from(doc.querySelectorAll('li.if-list__item[data-value]'));
    if (liItems.length) {
      liItems.forEach(li => {
        const val = String(li.getAttribute('data-value') || '').trim();
        const label = (li.querySelector('.if-list__item-title')?.textContent || li.textContent || '').trim();
        if (!val || !label) return;
        out.push({ value: val, label, url: `https://dnd.su/spells/?class=${encodeURIComponent(val)}` });
      });
    }

    // 1) пробуем найти select с классами
    const sel = !out.length ? doc.querySelector('select[name="class"], select#class, select[class*="class"]') : null;
    if (sel) {
      sel.querySelectorAll("option").forEach(opt => {
        const val = (opt.getAttribute("value") || "").trim();
        const label = (opt.textContent || "").trim();
        if (!val) return;
        // часто есть "Все" — пропускаем
        if (/^все/i.test(label)) return;
        out.push({ value: val, label, url: `https://dnd.su/spells/?class=${encodeURIComponent(val)}` });
      });
    }

    // 2) fallback: ищем ссылки ?class=
    if (!out.length) {
      const seen = new Set();
      doc.querySelectorAll('a[href*="?class="]').forEach(a => {
        const href = a.getAttribute("href") || "";
        try {
          const u = new URL(href, "https://dnd.su");
          const val = u.searchParams.CS.utils.get("class");
          const label = (a.textContent || "").trim();
          if (!val || !label) return;
          if (seen.has(val)) return;
          seen.add(val);
          out.push({ value: val, label, url: `https://dnd.su/spells/?class=${encodeURIComponent(val)}` });
        } catch {}
      });
    }
  } catch {}

  // уникализация
  const uniq = new Map();
  out.forEach(c => {
    if (!c?.value) return;
    if (!uniq.has(c.value)) uniq.set(c.value, c);
  });
  return Array.from(uniq.values()).sort((a,b) => String(a.label||"").localeCompare(String(b.label||""), "ru"));
}

function getSpellLevelFromText(text) {
  const t = String(text || "").toLowerCase();

  // "заговор"
  if (t.includes("заговор")) return 0;

  // варианты "уровень 1", "1 уровень", "1-го уровня"
  const m1 = t.match(/уров(ень|ня|не)\s*([1-9])/i);
  if (m1 && m1[2]) return CS.utils.safeInt(m1[2], 0);

  const m2 = t.match(/\b([1-9])\s*уров/i);
  if (m2 && m2[1]) return CS.utils.safeInt(m2[1], 0);

  // иногда на карточках просто цифра уровня отдельно — берём самую "разумную"
  const m3 = t.match(/\b([1-9])\b/);
  if (m3 && m3[1]) return CS.utils.safeInt(m3[1], 0);

  return null;
}

function normalizeAnyUrlToAbs(href) {
  try {
    const u = new URL(String(href || ""), "https://dnd.su");
    let s = u.href;
    if (!s.endsWith("/")) s += "/";
    return s;
  } catch {
    return "";
  }
}

function parseSpellsFromClassHtml(html) {
  const spells = [];
  const seen = new Set();

  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

    // основной список обычно в main
    const scope = doc.querySelector("main") || doc.body || doc;

    // берём ссылки на страницы заклинаний (не на каталог)
    const links = Array.from(scope.querySelectorAll('a[href*="/spells/"]'))
      .filter(a => {
        const h = a.getAttribute("href") || "";
        if (!h) return false;
        if (h.includes("/spells/?")) return false;
        // исключим якоря/комменты
        if (h.includes("#")) return false;
        return true;
      });

    for (const a of links) {
      const abs = normalizeAnyUrlToAbs(a.getAttribute("href"));
      if (!abs || !abs.includes("/spells/")) continue;
      if (seen.has(abs)) continue;

      const name = (a.textContent || "").trim();
      if (!name) continue;

      const card = a.closest(".card") || a.closest("article") || a.parentElement;
      const lvl = getSpellLevelFromText(card ? card.textContent : a.textContent);

      seen.add(abs);
      spells.push({ name, href: abs, level: lvl });
    }
  } catch {}

  // сорт: сначала по level (0..9..unknown), затем по имени
  const lvlKey = (x) => (x.level == null ? 99 : x.level);
  spells.sort((a,b) => {
    const da = lvlKey(a), db = lvlKey(b);
    if (da !== db) return da - db;
    return String(a.name||"").localeCompare(String(b.name||""), "ru");
  });

  return spells;
}

async function ensureDbSpellDesc(href) {
  if (spellDbCache.descByHref.has(href)) return spellDbCache.descByHref.CS.utils.get(href);
  const html = await fetchSpellHtml(href);
  const parsed = extractSpellFromHtml(html);
  spellDbCache.descByHref.set(href, parsed);
  return parsed;
}

function openAddSpellPopup({ root, player, sheet, canEdit, level }) {
  const lvl = CS.utils.safeInt(level, 0);
  const title = (lvl === 0) ? "Добавить заговор" : `Добавить заклинание (уровень ${lvl})`;

  const { overlay, close } = CS.bindings.openPopup({
    title,
    bodyHtml: `
      <div class="sheet-note" style="margin-bottom:10px;">Выбери способ добавления.</div>
      <div class="popup-actions">
        <button class="popup-btn primary" type="button" data-add-mode="link">Добавить по ссылке</button>
        <button class="popup-btn" type="button" data-add-mode="manual">Вписать вручную</button>
      </div>
      <div style="margin-top:12px;" data-add-body></div>
    `
  });

  const body = overlay.querySelector("[data-add-body]");
  overlay.addEventListener("click", async (e) => {
    const modeBtn = e.target?.closest?.("[data-add-mode]");
    if (!modeBtn || !body) return;
    if (!canEdit) return;

    const mode = modeBtn.getAttribute("data-add-mode");
    if (mode === "link") {
      body.innerHTML = `
        <div class="sheet-note">Вставь ссылку на dnd.su (пример: https://dnd.su/spells/9-bless/)</div>
        <input class="popup-field" type="text" placeholder="https://dnd.su/spells/..." data-link-input>
        <div class="popup-actions" style="margin-top:10px;">
          <button class="popup-btn primary" type="button" data-link-ok>Добавить</button>
          <button class="popup-btn" type="button" data-popup-close>Отмена</button>
        </div>
      `;
      body.querySelector("[data-link-input]")?.focus?.();
      return;
    }

    if (mode === "manual") {
      body.innerHTML = `
        <div class="popup-grid">
          <div>
            <div class="sheet-note">Название</div>
            <input class="popup-field" type="text" placeholder="Например: Волшебная струна" data-manual-name>
          </div>
          <div>
            <div class="sheet-note">Уровень уже выбран: <b>${CS.utils.escapeHtml(String(lvl))}</b></div>
            <div class="sheet-note">Ссылка не нужна.</div>
          </div>
        </div>
        <div style="margin-top:10px;">
          <div class="sheet-note">Описание (как на сайте — с абзацами)</div>
          <textarea class="popup-field" style="min-height:180px; resize:vertical;" data-manual-desc></textarea>
        </div>
        <div class="popup-actions" style="margin-top:10px;">
          <button class="popup-btn primary" type="button" data-manual-ok>Добавить</button>
          <button class="popup-btn" type="button" data-popup-close>Отмена</button>
        </div>
      `;
      body.querySelector("[data-manual-name]")?.focus?.();
      return;
    }
  });

  overlay.addEventListener("click", async (e) => {
    const okLink = e.target?.closest?.("[data-link-ok]");
    if (okLink) {
      if (!canEdit) return;
      const inp = overlay.querySelector("[data-link-input]");
      const rawUrl = inp?.value || "";
      const href = normalizeDndSuUrl(rawUrl);
      if (!href || !href.includes("/spells/")) {
        alert("Нужна ссылка на dnd.su/spells/... (пример: https://dnd.su/spells/9-bless/)");
        return;
      }

      okLink.disabled = true;
      if (inp) inp.disabled = true;

      try {
        const html = await fetchSpellHtml(href);
        const { name, desc } = extractSpellFromHtml(html);
        ensureSpellSaved(sheet, lvl, name, href, desc);
        CS.bindings.scheduleSheetSave(player);
        rerenderSpellsTabInPlace(root, player, sheet, canEdit);
        close();
      } catch (err) {
        console.error(err);
        alert("Не удалось получить/распарсить описание с dnd.su. Проверь ссылку.");
      } finally {
        okLink.disabled = false;
        if (inp) inp.disabled = false;
      }
      return;
    }

    const okManual = e.target?.closest?.("[data-manual-ok]");
    if (okManual) {
      if (!canEdit) return;
      const name = (overlay.querySelector("[data-manual-name]")?.value || "").trim();
      const desc = (overlay.querySelector("[data-manual-desc]")?.value || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
      if (!name) {
        alert("Укажи название.");
        return;
      }
      const href = makeManualHref();
      ensureSpellSaved(sheet, lvl, name, href, desc || "");
      CS.bindings.scheduleSheetSave(player);
      rerenderSpellsTabInPlace(root, player, sheet, canEdit);
      close();
      return;
    }
  });
}

async function openSpellDbPopup({ root, player, sheet, canEdit }) {
  const { overlay, close } = CS.bindings.openPopup({
    title: "База заклинаний (SRD 5.1)",
    bodyHtml: `
      <div class="popup-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div>
          <div class="sheet-note">Класс</div>
          <select class="popup-field" data-db-class></select>
        </div>
        <div>
          <div class="sheet-note">Уровень</div>
          <select class="popup-field" data-db-filter-level>
            <option value="any" selected>Любой</option>
            ${Array.from({length:10}).map((_,i)=>`<option value="${i}">${i===0?"0 (заговоры)":`Уровень ${i}`}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="sheet-note">Школа</div>
          <select class="popup-field" data-db-filter-school>
            <option value="any" selected>Любая</option>
          </select>
        </div>
      </div>

      <div class="popup-grid" style="margin-top:10px; grid-template-columns: 1fr 1fr;">
        <div>
          <div class="sheet-note">Добавлять в уровень</div>
          <select class="popup-field" data-db-level>
            <option value="auto" selected>Авто (уровень заклинания)</option>
            ${Array.from({length:10}).map((_,i)=>`<option value="${i}">${i===0?"0 (заговоры)":`Уровень ${i}`}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="sheet-note">Поиск</div>
          <input class="popup-field" type="text" placeholder="Название..." data-db-search>
        </div>
      </div>

      <div style="margin-top:10px;" data-db-list>
        <div class="sheet-note">Загрузка базы…</div>
      </div>
    `
  });

  const classSel = overlay.querySelector("[data-db-class]");
  const filterLevelSel = overlay.querySelector("[data-db-filter-level]");
  const filterSchoolSel = overlay.querySelector("[data-db-filter-school]");
  const forceLevelSel = overlay.querySelector("[data-db-level]");
  const searchInp = overlay.querySelector("[data-db-search]");
  const listBox = overlay.querySelector("[data-db-list]");

  if (!classSel || !listBox) return;

  // ---- local SRD cache ----
  if (!window.__srdSpellDb) window.__srdSpellDb = { loaded: false, spells: [], byId: new Map() };
  const cache = window.__srdSpellDb;

  async function ensureLoaded() {
    if (cache.loaded && Array.isArray(cache.spells) && cache.spells.length) return;
    const res = await fetch("spells_srd_db.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`SRD spell DB load failed: ${res.status}`);
    const json = await res.json();
    cache.spells = Array.isArray(json?.spells) ? json.spells : [];
    cache.byId = new Map(cache.spells.map(s => [String(s.id || ""), s]));
    cache.loaded = true;
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function spellNameForUI(s) {
    return String(s?.name_ru || s?.name_en || "").trim();
  }

  function fmtSpellDetails(s) {
    const levelTxt = (s.level === 0) ? "Заговор" : `Уровень ${s.level}`;
    const school = String(s.school_ru || s.school_en || "").trim();
    const parts = [
      `${levelTxt}${school ? ` • ${school}` : ""}`,
      `Время накладывания: ${s.casting_time_ru || s.casting_time_en || "-"}`,
      `Дистанция: ${s.range_ru || s.range_en || "-"}`,
      `Компоненты: ${s.components_ru || s.components_en || "-"}`,
      `Длительность: ${s.duration_ru || s.duration_en || "-"}`,
      "",
      String(s.description_ru || s.description_en || "").trim() || "(описание пустое)",
    ];
    return parts.join("\n");
  }

  function render() {
    const cls = String(classSel.value || "");
    const search = String(searchInp?.value || "").trim().toLowerCase();
    const lvlFilterRaw = String(filterLevelSel?.value || "any");
    const lvlFilter = (lvlFilterRaw === "any") ? null : CS.utils.safeInt(lvlFilterRaw, 0);
    const schoolFilter = String(filterSchoolSel?.value || "any");
    const forceLevel = String(forceLevelSel?.value || "auto");

    const filtered = cache.spells.filter(s => {
      if (cls && Array.isArray(s.classes) && !s.classes.includes(cls)) return false;
      if (lvlFilter != null && s.level !== lvlFilter) return false;
      if (schoolFilter !== "any" && String(s.school_en || "").toLowerCase() !== schoolFilter) return false;
      if (search) {
        const nm = spellNameForUI(s).toLowerCase();
        if (!nm.includes(search)) return false;
      }
      return true;
    });

    // group by level
    const groups = new Map();
    for (const s of filtered) {
      const k = String(s.level ?? "?");
      if (!groups.has(k)) groups.set(k, []);
      groups.CS.utils.get(k).push(s);
    }
    const order = ["0","1","2","3","4","5","6","7","8","9","?"];
    const htmlGroups = order
      .filter(k => groups.has(k) && groups.CS.utils.get(k).length)
      .map(k => {
        const title = (k === "0") ? "Заговоры (0)" : (k === "?" ? "Уровень не определён" : `Уровень ${k}`);
        const rows = groups.CS.utils.get(k)
          .sort((a,b)=>spellNameForUI(a).localeCompare(spellNameForUI(b), "ru"))
          .map(s => {
            const safeId = CS.utils.escapeHtml(String(s.id || ""));
            const safeName = CS.utils.escapeHtml(spellNameForUI(s));
            return `
              <div class="db-spell-row" data-db-id="${safeId}" data-db-level="${CS.utils.escapeHtml(String(s.level ?? ""))}">
                <div class="db-spell-head">
                  <button class="popup-btn" type="button" data-db-toggle style="padding:6px 10px;">${safeName}</button>
                  <div class="db-spell-controls">
                    <button class="popup-btn primary" type="button" data-db-learn>Выучить</button>
                  </div>
                </div>
                <pre class="db-spell-desc hidden" data-db-desc style="white-space:pre-wrap; margin:8px 0 0 0;">${CS.utils.escapeHtml(fmtSpellDetails(s))}</pre>
              </div>
            `;
          }).join("");
        return `
          <div class="sheet-card" style="margin:10px 0;">
            <h4 style="margin:0 0 6px 0;">${CS.utils.escapeHtml(title)}</h4>
            ${rows}
          </div>
        `;
      }).join("");

    listBox.innerHTML = htmlGroups || `<div class="sheet-note">Ничего не найдено.</div>`;

    listBox.querySelectorAll("[data-db-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest("[data-db-id]");
        const descEl = row?.querySelector("[data-db-desc]");
        if (!descEl) return;
        descEl.classList.toggle("hidden");
      });
    });

    listBox.querySelectorAll("[data-db-learn]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!canEdit) return;
        const row = btn.closest("[data-db-id]");
        if (!row) return;
        const id = row.getAttribute("data-db-id") || "";
        const s = cache.byId.CS.utils.get(id);
        if (!s) return;

        // decide level to save in sheet
        let lvl = null;
        if (forceLevel !== "auto") lvl = CS.utils.safeInt(forceLevel, 0);
        else lvl = (typeof s.level === "number") ? s.level : 0;
        if (lvl == null || lvl < 0 || lvl > 9) lvl = 0;

        const name = spellNameForUI(s) || String(s.name_en || "");
        const desc = fmtSpellDetails(s);
        const href = `srd://spell/${id}`;

        btn.disabled = true;
        ensureSpellSaved(sheet, lvl, name, href, desc);
        CS.bindings.scheduleSheetSave(player);
        rerenderSpellsTabInPlace(root, player, sheet, canEdit);

        btn.textContent = "Выучено";
        btn.classList.remove("primary");
        btn.disabled = true;
      });
    });
  }

  try {
    await ensureLoaded();
  } catch (err) {
    console.error(err);
    listBox.innerHTML = `<div class="sheet-note">Не удалось загрузить spells_srd_db.json (проверь, что файл лежит рядом с index.html).</div>`;
    return;
  }

  // fill selects
  const allClasses = uniq(cache.spells.flatMap(s => Array.isArray(s.classes) ? s.classes : [])).sort((a,b)=>a.localeCompare(b, "en"));
  classSel.innerHTML = allClasses.map(c => `<option value="${CS.utils.escapeHtml(c)}">${CS.utils.escapeHtml(c)}</option>`).join("");
  const allSchools = uniq(cache.spells.map(s => String(s.school_en || "").toLowerCase())).sort((a,b)=>a.localeCompare(b, "en"));
  if (filterSchoolSel) {
    filterSchoolSel.innerHTML = `<option value="any" selected>Любая</option>` + allSchools.map(sc => `<option value="${CS.utils.escapeHtml(sc)}">${CS.utils.escapeHtml(sc)}</option>`).join("");
  }

  classSel.addEventListener("change", render);
  filterLevelSel?.addEventListener("change", render);
  filterSchoolSel?.addEventListener("change", render);
  forceLevelSel?.addEventListener("change", render);
  searchInp?.addEventListener("input", () => {
    clearTimeout(searchInp.__t);
    searchInp.__t = setTimeout(render, 120);
  });

  render();
}

function bindSpellAddAndDesc(root, player, canEdit) {
  if (!root || !player?.sheet?.parsed) return;

  // IMPORTANT:
  // sheetContent (root) переиспользуется между открытиями модалки.
  // Нельзя один раз повесить обработчики с замыканием на player/canEdit,
  // иначе при открытии "Инфы" другого игрока (или после импорта .json, который меняет объект)
  // события будут применяться к старому sheet.
  // Поэтому храним актуальный контекст на root и читаем его в момент события.
  root.__spellAddState = { player, canEdit };

  const getState = () => root.__spellAddState || { player, canEdit };
  const getSheet = () => getState().player?.sheet?.parsed;

  // listeners вешаем один раз
  if (root.__spellAddInit) {
    // контекст обновили выше
    return;
  }
  root.__spellAddInit = true;

  root.addEventListener("click", async (e) => {
    const { player: curPlayer, canEdit: curCanEdit } = getState();

    const addBtn = e.target?.closest?.("[data-spell-add][data-spell-level]");
    if (addBtn) {
      if (!curCanEdit) return;
      const sheet = getSheet();
      if (!sheet) return;

      const lvl = CS.utils.safeInt(addBtn.getAttribute("data-spell-level"), 0);
      openAddSpellPopup({ root, player: curPlayer, sheet, canEdit: curCanEdit, level: lvl });
      return;
    }

    const dbBtn = e.target?.closest?.("[data-spell-db]");
    if (dbBtn) {
      const sheet = getSheet();
      if (!sheet) return;
      await openSpellDbPopup({ root, player: curPlayer, sheet, canEdit: curCanEdit });
      return;
    }

    const delBtn = e.target?.closest?.("[data-spell-delete]");
    if (delBtn) {
      if (!curCanEdit) return;
      const sheet = getSheet();
      if (!sheet) return;

      const item = delBtn.closest(".spell-item");
      const href = item?.getAttribute?.("data-spell-url") || "";
      if (!href) return;
      if (!confirm("Удалить это заклинание?")) return;

      deleteSpellSaved(sheet, href);
      CS.bindings.scheduleSheetSave(curPlayer);
      rerenderSpellsTabInPlace(root, curPlayer, sheet, curCanEdit);
      return;
    }

    const descBtn = e.target?.closest?.("[data-spell-desc-toggle]");
    if (descBtn) {
      const item = descBtn.closest(".spell-item");
      const desc = item?.querySelector?.(".spell-item-desc");
      if (!desc) return;
      desc.classList.toggle("hidden");
      descBtn.classList.toggle("is-open");
      return;
    }
  });

  // выбор базовой характеристики (STR/DEX/CON/INT/WIS/CHA)
  root.addEventListener("change", (e) => {
    const sel = e.target?.closest?.("[data-spell-base-ability]");
    if (!sel) return;
    const { player: curPlayer, canEdit: curCanEdit } = getState();
    if (!curCanEdit) return;

    const sheet = getSheet();
    if (!sheet) return;

    if (!sheet.spellsInfo || typeof sheet.spellsInfo !== "object") sheet.spellsInfo = {};
    if (!sheet.spellsInfo.base || typeof sheet.spellsInfo.base !== "object") sheet.spellsInfo.base = { code: "" };

    sheet.spellsInfo.base.code = String(sel.value || "").trim();

    // если пользователь не задал ручной бонус атаки — просто перерисуем, чтобы пересчитать формулу
    CS.bindings.scheduleSheetSave(curPlayer);
    rerenderSpellsTabInPlace(root, curPlayer, sheet, curCanEdit);
  });

  // ручное редактирование бонуса атаки
  root.addEventListener("input", (e) => {
    const atk = e.target?.closest?.("[data-spell-attack-bonus]");
    if (atk) {
      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curCanEdit) return;

      const sheet = getSheet();
      if (!sheet) return;

      if (!sheet.spellsInfo || typeof sheet.spellsInfo !== "object") sheet.spellsInfo = {};
      if (!sheet.spellsInfo.mod || typeof sheet.spellsInfo.mod !== "object") sheet.spellsInfo.mod = { customModifier: "" };

      const v = String(atk.value || "").trim();
      const computed = CS.utils.computeSpellAttack(sheet);

      if (v === "") {
        // пусто = вернуть авто-расчет
        delete sheet.spellsInfo.mod.customModifier;
        if ("value" in sheet.spellsInfo.mod) delete sheet.spellsInfo.mod.value;
      } else {
        const n = CS.utils.parseModInput(v, computed);
        // если ввели ровно авто-значение — не фиксируем "ручной" модификатор, чтобы формула продолжала работать
        if (n === computed) {
          delete sheet.spellsInfo.mod.customModifier;
          if ("value" in sheet.spellsInfo.mod) delete sheet.spellsInfo.mod.value;
        } else {
          sheet.spellsInfo.mod.customModifier = String(n);
        }
      }

      CS.bindings.scheduleSheetSave(curPlayer);
      // не перерисовываем на каждый ввод — чтобы курсор не прыгал
      return;
    }

    // редактирование описания (textarea внутри раскрывашки)
    const ta = e.target?.closest?.("[data-spell-desc-editor]");
    if (!ta) return;
    const { player: curPlayer, canEdit: curCanEdit } = getState();
    if (!curCanEdit) return;

    const sheet = getSheet();
    if (!sheet) return;

    const item = ta.closest(".spell-item");
    const href = item?.getAttribute?.("data-spell-url") || "";
    if (!href) return;

    if (!sheet.text || typeof sheet.text !== "object") sheet.text = {};
    const key = `spell-desc:${href}`;
    if (!sheet.text[key] || typeof sheet.text[key] !== "object") sheet.text[key] = { value: "" };
    sheet.text[key].value = cleanupSpellDesc(String(ta.value || ""));
    CS.bindings.scheduleSheetSave(curPlayer);
  });
}
  function updateDerivedForStat(root, sheet, statKey) {
    if (!root || !sheet || !statKey) return;

    // check/save inputs inside this stat block
    const checkEl = root.querySelector(`.lss-pill-val-input[data-stat-key="${statKey}"][data-kind="check"]`);
    if (checkEl) checkEl.value = CS.utils.formatMod(calcCheckBonus(sheet, statKey));

    const saveEl = root.querySelector(`.lss-pill-val-input[data-stat-key="${statKey}"][data-kind="save"]`);
    if (saveEl) saveEl.value = CS.utils.formatMod(calcSaveBonus(sheet, statKey));

    // skills under this stat: just refresh all skills UI
    const scoreEl = root.querySelector(`.lss-ability-score-input[data-stat-key="${statKey}"]`);
    if (scoreEl && sheet?.stats?.[statKey]?.score != null) {
      scoreEl.value = String(sheet.stats[statKey].score);
    }
  }



  // ================== RENDER
  // ================== RENDER ==================
  function renderAbilitiesGrid(vm) {
    const d20SvgMini = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
        <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
      </svg>
    `;

    const blocks = vm.stats.map(s => {
      const skillRows = (s.skills || []).map(sk => {
        const dotClass = (sk.boostLevel === 1) ? "boost1" : (sk.boostLevel === 2) ? "boost2" : "";
        return `
          <div class="lss-skill-row">
            <div class="lss-skill-left">
              <span class="lss-dot ${dotClass}" data-skill-key="${CS.utils.escapeHtml(sk.key)}"></span>
              <span class="lss-skill-name" title="${CS.utils.escapeHtml(sk.label)}">
                <span class="lss-skill-name-text">
                  ${CS.utils.escapeHtml(sk.label)}
                  <span class="lss-boost">${sk.boostStars ? ` ${CS.utils.escapeHtml(sk.boostStars)}` : ""}</span>
                </span>
              </span>
              <button class="lss-dice-btn" type="button" data-roll-kind="skill" data-skill-key="${CS.utils.escapeHtml(sk.key)}" title="Бросок: d20${CS.utils.escapeHtml(CS.utils.formatMod(sk.bonus))}">${d20SvgMini}</button>
            </div>
            <input class="lss-skill-val lss-skill-val-input" type="text" value="${CS.utils.escapeHtml(CS.utils.formatMod(sk.bonus))}" data-skill-key="${CS.utils.escapeHtml(sk.key)}">
          </div>
        `;
      }).join("");

      return `
        <div class="lss-ability">
          <div class="lss-ability-head">
            <div class="lss-ability-name">${CS.utils.escapeHtml(s.label.toUpperCase())}</div>
            <input class="lss-ability-score lss-ability-score-input" type="number" min="1" max="30" value="${CS.utils.escapeHtml(String(s.score))}" data-stat-key="${CS.utils.escapeHtml(s.k)}">
          </div>

          <div class="lss-ability-actions">
            <div class="lss-pill">
              <div class="lss-pill-label-row">
                <span class="lss-pill-label">ПРОВЕРКА</span>
                <button class="lss-dice-btn" type="button" data-roll-kind="check" data-stat-key="${CS.utils.escapeHtml(s.k)}" title="Бросок проверки">
                  ${d20SvgMini}
                </button>
              </div>
              <input class="lss-pill-val lss-pill-val-input" type="text" value="${CS.utils.escapeHtml(CS.utils.formatMod(s.check))}" data-stat-key="${CS.utils.escapeHtml(s.k)}" data-kind="check">
            </div>
            <div class="lss-pill">
              <div class="lss-pill-label-row">
                <button class="lss-save-dot ${s.saveProf ? "active" : ""}" type="button" data-save-key="${CS.utils.escapeHtml(s.k)}" title="Владение спасброском"></button>
                <span class="lss-pill-label">СПАСБРОСОК</span>
                <button class="lss-dice-btn" type="button" data-roll-kind="save" data-stat-key="${CS.utils.escapeHtml(s.k)}" title="Бросок спасброска">
                  ${d20SvgMini}
                </button>
              </div>
              <input class="lss-pill-val lss-pill-val-input" type="text" value="${CS.utils.escapeHtml(CS.utils.formatMod(s.save))}" data-stat-key="${CS.utils.escapeHtml(s.k)}" data-kind="save">
            </div>
          </div>

          <div class="lss-ability-divider"></div>

          <div class="lss-skill-list">
            ${skillRows || `<div class="sheet-note">Нет навыков</div>`}
          </div>
        </div>
      `;
    }).join("");

    return `<div class="lss-abilities-grid">${blocks}</div>`;
  }

  function renderPassives(vm) {
    const rows = vm.passive.map(p => `
      <div class="lss-passive-row" data-passive-key="${CS.utils.escapeHtml(String(p.key || ''))}">
        <div class="lss-passive-val" data-passive-val="${CS.utils.escapeHtml(String(p.key || ''))}">${CS.utils.escapeHtml(String(p.value))}</div>
        <div class="lss-passive-label">${CS.utils.escapeHtml(p.label)}</div>
      </div>
    `).join("");

    return `
      <div class="lss-passives">
        <div class="lss-passives-title">ПАССИВНЫЕ ЧУВСТВА</div>
        <div class="lss-passive-rowlist">
          ${rows}
        </div>
      </div>
    `;
  }

  function renderProfBox(vm) {
  const hint = String(vm.languagesHint || "").trim();
  const learned = Array.isArray(vm.languagesLearned) ? vm.languagesLearned : [];

  const learnedHtml = learned.length
    ? learned.map(l => `
        <div class="lss-lang-pill">
          <div class="lss-lang-pill-head">
            <div class="lss-lang-pill-name">${CS.utils.escapeHtml(l.name)}</div>
            <button class="lss-lang-pill-x" type="button" title="Удалить язык" data-lang-remove-id="${CS.utils.escapeHtml(String(l.id || l.name || ""))}">✕</button>
          </div>
          <div class="lss-lang-pill-meta"><span class="lss-lang-lbl">Типичный представитель</span> - ${CS.utils.escapeHtml(l.typical || "-")}; <span class="lss-lang-lbl">Письменность</span> - ${CS.utils.escapeHtml(l.script || "-")}</div>
        </div>
      `).join("")
    : `<div class="sheet-note">Пока языки не выбраны</div>`;

  // всегда показываем блок, даже без загруженного файла
  return `
    <div class="lss-profbox">
      <div class="lss-passives-title">ПРОЧИЕ ВЛАДЕНИЯ И ЗАКЛИНАНИЯ</div>

      <!-- Языки: на всю ширину блока -->
      <div class="lss-langbox lss-langbox--full">
        <div class="lss-langbox-head">
          <div class="lss-langbox-head-left">
            <div class="lss-langbox-title">ЯЗЫКИ</div>
            <div class="lss-langbox-head-hint ${hint ? "" : "hidden"}">
              <span class="lss-langbox-head-hint-label">Знание языков:</span>
              <span class="lss-langbox-head-hint-val">${CS.utils.escapeHtml(hint)}</span>
            </div>
          </div>
          <button class="lss-lang-learn-btn" type="button" data-lang-popup-open>Выучить язык</button>
        </div>

        <div class="lss-langbox-list lss-langbox-list--cols3">
          ${learnedHtml}
        </div>
      </div>

      <!-- Прочие владения/заклинания: тоже на всю ширину -->
      <textarea class="lss-prof-text lss-prof-text--full" rows="8" data-sheet-path="text.profPlain.value"
        placeholder="Например: владения, инструменты, языки, заклинания...">${CS.utils.escapeHtml(vm.profText || "")}</textarea>
    </div>
  `;
}


  function renderBasicTab(vm, canEdit) {
    return `
      <div class="sheet-section">
        <div class="sheet-topline">
          <div class="sheet-chip sheet-chip--exh" data-exh-open title="Истощение">
            <div class="k">Истощение</div>
            <!-- readonly: выбор идёт через список; так клик по полю тоже открывает окно -->
            <input class="sheet-chip-input" type="number" min="0" max="6" ${canEdit ? "" : "disabled"} readonly data-sheet-path="exhaustion" value="${CS.utils.escapeHtml(String(vm.exhaustion))}">
          </div>
          <div class="sheet-chip sheet-chip--cond ${String(vm.conditions||"").trim() ? "has-value" : ""}" data-cond-open title="Состояние">
            <div class="k">Состояние</div>
            <!-- readonly: состояние выбирается из списка (и очищается кнопкой) -->
            <input class="sheet-chip-input sheet-chip-input--wide" type="text" ${canEdit ? "" : "disabled"} readonly data-sheet-path="conditions" value="${CS.utils.escapeHtml(String(vm.conditions || ""))}">
          </div>
        </div>

        <h3>Основное</h3>

        <div class="sheet-card sheet-card--profile">
          <h4>Профиль</h4>

          <div class="profile-grid">
            <div class="profile-col">
              <div class="kv"><div class="k">Имя</div><div class="v"><input type="text" data-sheet-path="name.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Класс</div><div class="v"><input type="text" data-sheet-path="info.charClass.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Архетип класса</div><div class="v"><input type="text" data-sheet-path="info.classArchetype.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Уровень</div><div class="v"><input type="number" min="1" max="20" data-sheet-path="info.level.value" style="width:90px"></div></div>
            </div>

            <div class="profile-col">
              <div class="kv"><div class="k">Раса</div><div class="v"><input type="text" data-sheet-path="info.race.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Архетип расы</div><div class="v"><input type="text" data-sheet-path="info.raceArchetype.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Предыстория</div><div class="v"><input type="text" data-sheet-path="info.background.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Мировоззрение</div><div class="v"><input type="text" data-sheet-path="info.alignment.value" style="width:180px"></div></div>
            </div>
          </div>
        </div>

        <div class="sheet-section" style="margin-top:12px;">
          <h3>Характеристики и навыки</h3>
          ${renderAbilitiesGrid(vm)}
        </div>

        <div class="lss-bottom-stack">
          ${renderPassives(vm)}
          ${renderProfBox(vm)}
        </div>
      </div>
    `;
  }

  // ================== RENDER: SPELLS ==================

  
function renderSpellCard({ level, name, href, desc }) {
    const safeHref = CS.utils.escapeHtml(href || "");
    const safeName = CS.utils.escapeHtml(name || href || "(без названия)");
    const text = cleanupSpellDesc(desc || "");
    const lvl = CS.utils.safeInt(level, 0);

    const isHttp = /^https?:\/\//i.test(String(href || ""));
    const titleHtml = isHttp
      ? `<a class="spell-item-link" href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeName}</a>`
      : `<span class="spell-item-title">${safeName}</span>`;

    const diceSvg = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
        <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
      </svg>
    `;

    return `
      <div class="spell-item" data-spell-url="${safeHref}" data-spell-level="${lvl}">
        <div class="spell-item-head">
          ${titleHtml}
          <button class="spell-dice-btn" type="button" data-spell-roll title="Бросок атаки">${diceSvg}</button>
          <div class="spell-item-actions">
            <button class="spell-desc-btn" type="button" data-spell-desc-toggle>Описание</button>
            <button class="spell-del-btn" type="button" data-spell-delete>Удалить</button>
          </div>
        </div>
        <div class="spell-item-desc hidden">
          <textarea class="spell-desc-editor" data-spell-desc-editor rows="6" placeholder="Описание (можно редактировать)…">${CS.utils.escapeHtml(text)}</textarea>
          <div class="sheet-note" style="margin-top:6px;">Сохраняется автоматически.</div>
        </div>
      </div>
    `;
  }

  function renderSlots(vm) {
    const slots = Array.isArray(vm?.slots) ? vm.slots : [];
    if (!slots.length) return `<div class="sheet-note">Ячейки заклинаний не указаны.</div>`;

    const countByLevel = {};
    (vm.spellsByLevel || []).forEach(b => {
      const lvl = Number(b.level);
      if (!Number.isFinite(lvl)) return;
      countByLevel[lvl] = Array.isArray(b.items) ? b.items.length : 0;
    });

    const cells = slots.slice(0, 9).map(s => {
      const total = Math.max(0, Math.min(12, CS.utils.numLike(s.total, 0)));
      const filled = Math.max(0, Math.min(total, CS.utils.numLike(s.filled, 0)));
      const current = Math.max(0, total - filled); // доступные (для кружков)
      const spellsCount = countByLevel[s.level] || 0;

      const dots = Array.from({ length: total })
        .map((_, i) => {
          const on = i < current;
          return `<span class="slot-dot${on ? " is-available" : ""}" data-slot-level="${s.level}"></span>`;
        })
        .join("");

      return `
        <div class="slot-cell" data-slot-level="${s.level}">
          <div class="slot-top">
            <div class="slot-level">Ур. ${s.level}</div>
            <div class="slot-nums">
              <span class="slot-spells" title="Кол-во заклинаний уровня">${spellsCount}</span>
              <span class="slot-sep">/</span>
              <input class="slot-current slot-current-input" type="number" min="0" max="12" value="${CS.utils.escapeHtml(String(total))}" data-slot-level="${s.level}" title="Всего ячеек (редактируемое)">
            </div>
          </div>
          <div class="slot-dots" data-slot-dots="${s.level}">
            ${dots || `<span class="slot-dots-empty">—</span>`}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="slots-frame">
        <div class="slots-grid">
          ${cells}
        </div>
      </div>
    `;
  }

  function renderSpellsByLevel(vm) {
    const spellNameByHref = (vm?.spellNameByHref && typeof vm.spellNameByHref === "object") ? vm.spellNameByHref : {};
    const spellDescByHref = (vm?.spellDescByHref && typeof vm.spellDescByHref === "object") ? vm.spellDescByHref : {};
    const blocks = (vm?.spellsByLevel || []).map(b => {
      const lvl = CS.utils.safeInt(b.level, 0);
      const title = (lvl === 0) ? "Заговоры (0)" : `Уровень ${lvl}`;

      const items = (b.items || []).map(it => {
        if (it.href) {
          const name = spellNameByHref[it.href] || it.text;
          const desc = spellDescByHref[it.href] || "";
          return renderSpellCard({ level: lvl, name, href: it.href, desc });
        }
        return `<span class="sheet-pill">${CS.utils.escapeHtml(it.text)}</span>`;
      }).join("");

      return `
        <div class="sheet-card">
          <div class="spells-level-header">
            <h4 style="margin:0">${CS.utils.escapeHtml(title)}</h4>
            <button class="spell-add-btn" type="button" data-spell-add data-spell-level="${lvl}">${lvl === 0 ? "Добавить заговор" : "Добавить заклинание"}</button>
          </div>

          <div class="spells-level-pills">
            ${items || `<div class="sheet-note">Пока пусто. Добавляй кнопкой выше или через «Выбор из базы».</div>`}
          </div>
        </div>
      `;
    }).join("");

    return `<div class="sheet-grid-2">${blocks}</div>`;
  }

  function renderSpellsTab(vm) {
    const base = (vm?.spellsInfo?.base || "").trim() || "int";

    const statScoreByKey = {};
    (vm?.stats || []).forEach(s => { statScoreByKey[s.k] = CS.utils.safeInt(s.score, 10); });

    const prof = CS.utils.safeInt(vm?.profBonus, 0);
    const abilScore = CS.utils.safeInt(statScoreByKey[base], 10);
    const abilMod = CS.utils.abilityModFromScore(abilScore);

    const computedAttack = prof + abilMod;
    const computedSave = 8 + prof + abilMod;

    const rawSave = (vm?.spellsInfo?.save ?? "").toString().trim();
    const saveVal = rawSave !== "" ? String(CS.utils.numLike(rawSave, computedSave)) : String(computedSave);

    // Бонус атаки: всегда по формуле Владение + модификатор выбранной характеристики
    // (ручной оверрайд хранится в sheet.spellsInfo.mod.customModifier и применяется в updateSpellsMetrics)
    const atkVal = String(computedAttack);

    const abilityOptions = [
      ["str","Сила"],
      ["dex","Ловкость"],
      ["con","Телосложение"],
      ["int","Интеллект"],
      ["wis","Мудрость"],
      ["cha","Харизма"],
    ];

    return `
      <div class="sheet-section">
        <h3>Заклинания</h3>

        <div class="sheet-card spells-metrics-card fullwidth">
          <div class="spell-metric spell-metric-full">
            <div class="spell-metric-label">Характеристика</div>
            <div class="spell-metric-val spell-metric-control">
              <select class="spell-ability-select" data-spell-base-ability>
                ${abilityOptions.map(([k,l]) => `<option value="${k}" ${k===base?'selected':''}>${l}</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="spell-metrics">
            <div class="spell-metric">
              <div class="spell-metric-label">СЛ спасброска</div>
              <div class="spell-metric-val">${CS.utils.escapeHtml(String(saveVal))}</div>
            </div>

            <div class="spell-metric">
              <div class="spell-metric-label spell-metric-label-row">Бонус атаки
  <button class="spell-dice-btn spell-dice-btn--header" type="button" data-spell-roll-header title="Бросок атаки">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
      <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
    </svg>
  </button>
</div>
              <div class="spell-metric-val spell-metric-control">
                <input class="spell-attack-input" data-spell-attack-bonus type="number" step="1" min="-20" max="30" value="${CS.utils.escapeHtml(String(atkVal))}" />
              </div>
            </div>
          </div>
          <div class="sheet-note" style="margin-top:8px;">
            Бонус атаки по умолчанию: <b>Владение</b> (${prof}) + <b>модификатор выбранной характеристики</b> (${CS.utils.formatMod(abilMod)}).
          </div>
        </div>

        <div class="sheet-card fullwidth" style="margin-top:10px;">
          <h4>Ячейки</h4>
          ${renderSlots(vm)}
          <div class="sheet-note" style="margin-top:6px;">
            Формат: <b>кол-во заклинаний</b> / <b>всего ячеек</b> (второе число редактируемое, max 12). Кружки показывают доступные (неиспользованные) ячейки.
          </div>
        </div>

        <div class="sheet-section" style="margin-top:10px;">
          <div class="spells-list-header"><h3 style="margin:0">Заклинания</h3><button class="spell-db-btn" type="button" data-spell-db>База SRD</button></div>
          ${renderSpellsByLevel(vm)}
          <div class="sheet-note" style="margin-top:8px;">
            Подсказка: если в твоём .json ссылки на dnd.su — они кликабельны.
          </div>
        </div>
      </div>
    `;
  }

  // ================== OTHER TABS ==================
  
function renderCombatTab(vm) {
  const statModByKey = {};
  (vm?.stats || []).forEach(s => { statModByKey[s.k] = CS.utils.safeInt(s.mod, 0); });

  const profBonus = CS.utils.safeInt(vm?.profBonus, 2);

  const abilityOptions = [
    { k: "str", label: "Сила" },
    { k: "dex", label: "Ловкость" },
    { k: "con", label: "Телосложение" },
    { k: "int", label: "Интеллект" },
    { k: "wis", label: "Мудрость" },
    { k: "cha", label: "Харизма" }
  ];

  const diceOptions = ["к4","к6","к8","к10","к12","к20"];

  const calcAtk = (w) => {
    const statMod = CS.utils.safeInt(statModByKey[w.ability] ?? 0, 0);
    const prof = w.prof ? profBonus : 0;
    const extra = CS.utils.safeInt(w.extraAtk, 0);
    return statMod + prof + extra;
  };

  const dmgText = (w) => {
    const n = Math.max(0, CS.utils.safeInt(w.dmgNum, 1));
    const dice = String(w.dmgDice || "к6");
    const type = String(w.dmgType || "").trim();
    return `${n}${dice}${type ? ` ${type}` : ""}`.trim();
  };

  const d20Svg = `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
      <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
    </svg>
  `;

  const weapons = Array.isArray(vm?.weapons) ? vm.weapons : [];

  const listHtml = weapons.length
    ? weapons.map(w => {
        if (w.kind === "legacy") {
          // на всякий случай
          return `
            <div class="sheet-card weapon-card legacy">
              <div class="sheet-note">Оружие legacy. Перезагрузи json или добавь оружие через кнопку «Добавить оружие».</div>
            </div>
          `;
        }

        const atk = calcAtk(w);
        const collapsed = !!w.collapsed;
        const title = String(w.name || "");

        return `
          <div class="sheet-card weapon-card" data-weapon-idx="${w.idx}">
            <div class="weapon-head ${collapsed ? "is-collapsed" : "is-expanded"}">
              <input class="weapon-title-input"
                     type="text"
                     value="${CS.utils.escapeHtml(title)}"
                     title="${CS.utils.escapeHtml(title)}"
                     placeholder="Название"
                     data-weapon-field="name">

              <div class="weapon-actions">
                <button class="weapon-btn" type="button" data-weapon-toggle-desc>${collapsed ? "Показать" : "Скрыть"}</button>
                <button class="weapon-btn danger" type="button" data-weapon-del>Удалить</button>
              </div>
            </div>

            <!-- рамка под названием: Бонус атаки + Урон (всегда видима) -->
            <div class="weapon-summary">
              <div class="weapon-sum-item">
                <div class="weapon-sum-label">
                  <span>Атака</span>
                  <button class="weapon-dice-btn" type="button" data-weapon-roll-atk title="Бросок атаки">${d20Svg}</button>
                </div>
                <div class="weapon-sum-val" data-weapon-atk>${CS.utils.escapeHtml(CS.utils.formatMod(atk))}</div>
              </div>

              <div class="weapon-sum-item">
                <div class="weapon-sum-label">
                  <span>Урон</span>
                  <button class="weapon-dice-btn" type="button" data-weapon-roll-dmg title="Бросок урона">${d20Svg}</button>
                </div>
                <div class="weapon-sum-val" data-weapon-dmg>${CS.utils.escapeHtml(dmgText(w))}</div>
              </div>
            </div>

            <!-- всё ниже скрывается кнопкой Скрыть -->
            <div class="weapon-details ${collapsed ? "collapsed" : ""}">
              <div class="weapon-details-grid">
                <div class="weapon-fieldbox">
                  <div class="weapon-fieldlabel">Характеристика</div>
                  <select class="weapon-select" data-weapon-field="ability">
                    ${abilityOptions.map(o => `<option value="${o.k}" ${o.k === w.ability ? "selected" : ""}>${CS.utils.escapeHtml(o.label)}</option>`).join("")}
                  </select>
                </div>

                <div class="weapon-fieldbox weapon-fieldbox-inline">
                  <div class="weapon-fieldlabel">Бонус владения</div>
                  <button class="weapon-prof-dot ${w.prof ? "active" : ""}" type="button" data-weapon-prof title="Владение: +${profBonus} к бонусу атаки"></button>
                </div>

                <div class="weapon-fieldbox">
                  <div class="weapon-fieldlabel">Доп. модификатор</div>
                  <input class="weapon-num weapon-extra" type="number" step="1"
                         value="${CS.utils.escapeHtml(String(CS.utils.safeInt(w.extraAtk, 0)))}"
                         data-weapon-field="extraAtk">
                </div>

                <div class="weapon-fieldbox weapon-dmg-edit">
                  <div class="weapon-fieldlabel">Урон (редакт.)</div>
                  <div class="weapon-dmg-mini">
                    <input class="weapon-num weapon-dmg-num" type="number" min="0" step="1"
                           value="${CS.utils.escapeHtml(String(Math.max(0, CS.utils.safeInt(w.dmgNum, 1))))}"
                           data-weapon-field="dmgNum">
                    <select class="weapon-select weapon-dice" data-weapon-field="dmgDice">
                      ${diceOptions.map(d => `<option value="${d}" ${d === w.dmgDice ? "selected" : ""}>${CS.utils.escapeHtml(d)}</option>`).join("")}
                    </select>
                  </div>
                  <input class="weapon-text weapon-dmg-type weapon-dmg-type-full" type="text"
                         value="${CS.utils.escapeHtml(String(w.dmgType || ""))}"
                         placeholder="вид урона (колющий/рубящий/...)"
                         data-weapon-field="dmgType">
                </div>
              </div>

              <div class="weapon-desc">
                <textarea class="sheet-textarea weapon-desc-text" rows="4"
                          placeholder="Описание оружия..."
                          data-weapon-field="desc">${CS.utils.escapeHtml(String(w.desc || ""))}</textarea>
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="sheet-note">Оружие пока не добавлено. Нажми «Добавить оружие».</div>`;

  return `
    <div class="sheet-section" data-combat-root>
      <div class="combat-toolbar">
        <h3>Бой</h3>
        <button class="weapon-add-btn" type="button" data-weapon-add>Добавить оружие</button>
      </div>

      <div class="weapons-list">
        ${listHtml}
      </div>

      <div class="sheet-card combat-skills-card">
        <h4>Умения и способности</h4>
        <textarea class="sheet-textarea combat-skills-text" rows="6"
                  data-sheet-path="combat.skillsAbilities.value"
                  placeholder="Сюда можно вписать умения/способности, особенности боя, заметки..."></textarea>
      </div>
    </div>
  `;
}



  CS.spells = CS.spells || {};
  CS.spells.normalizeDndSuUrl = normalizeDndSuUrl;
  CS.spells.fetchSpellHtml = fetchSpellHtml;
  CS.spells.parseSpellsFromClassHtml = parseSpellsFromClassHtml;
  CS.spells.rerenderSpellsTabInPlace = rerenderSpellsTabInPlace;
  CS.spells.renderSpellsTab = renderSpellsTab;
  CS.spells.bindSlotEditors = bindSlotEditors;
  CS.spells.bindSpellAddAndDesc = bindSpellAddAndDesc;

})();
