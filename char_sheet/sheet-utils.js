/* sheet-utils.js — вынесено из info-dnd-player.js */

// UI-состояние модалки (чтобы обновления state не сбрасывали вкладку/скролл)
// Map<playerId, { activeTab: string, scrollTopByTab: Record<string, number>, lastInteractAt: number }>
const uiStateByPlayerId = new Map();

// debounce save timers
const sheetSaveTimers = new Map();

// ================== UTILS ==================
function v(x, fallback = "-") {
  if (x && typeof x === "object") {
    if ("value" in x) return (x.value ?? fallback);
    if ("name" in x && x.name && typeof x.name === "object" && "value" in x.name) return (x.name.value ?? fallback);
  }
  return (x ?? fallback);
}

function get(obj, path, fallback = "-") {
  try {
    const raw = path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
    return v(raw, fallback);
  } catch {
    return fallback;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMod(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x >= 0 ? `+${x}` : `${x}`;
}

function abilityModFromScore(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 0;
  // D&D 5e: modifier = floor((score - 10) / 2)
  return Math.floor((s - 10) / 2);
}

function safeInt(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

// Иногда числа приходят в виде { value: n }
function numLike(x, fallback = 0) {
  if (x && typeof x === "object" && "value" in x) return safeInt(x.value, fallback);
  return safeInt(x, fallback);
}
function setMaybeObjField(obj, field, n) {
  if (!obj || typeof obj !== "object") return;
  const cur = obj[field];
  if (cur && typeof cur === "object" && ("value" in cur)) {
    cur.value = n;
  } else {
    obj[field] = n;
  }
}




// D&D 5e: модификатор = floor((score - 10) / 2), ограничиваем 1..30
function scoreToModifier(score) {
  const s = Math.max(1, Math.min(30, safeInt(score, 10)));
  const m = Math.floor((s - 10) / 2);
  // для надёжности ограничим диапазон -5..+10
  return Math.max(-5, Math.min(10, m));
}

// принимает "+3", "-1", "3", "" -> number
function parseModInput(str, fallback = 0) {
  if (str == null) return fallback;
  const t = String(str).trim();
  if (!t) return fallback;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}


// Спелл-метрики: авто-формула бонуса атаки (проф. + модификатор выбранной характеристики)
function computeSpellAttack(sheet) {
  const base = String(sheet?.spellsInfo?.base?.code || sheet?.spellsInfo?.base?.value || "int").trim() || "int";
  const prof = getProfBonus(sheet);
  const score = safeInt(sheet?.stats?.[base]?.score, 10);
  const mod = scoreToModifier(score);
  return prof + mod;
}
