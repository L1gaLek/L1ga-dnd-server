// ================== ELEMENTS ==================
const loginDiv = document.getElementById('login-container');
const joinBtn = document.getElementById('joinBtn');
const usernameInput = document.getElementById('username');
const roleSelect = document.getElementById('role');
const loginError = document.getElementById('loginError');



// ===== Rooms lobby UI =====
const roomsDiv = document.getElementById('rooms-container');
const roomsList = document.getElementById('rooms-list');
const roomsError = document.getElementById('roomsError');

const createRoomBtn = document.getElementById('createRoomBtn');
const createRoomModal = document.getElementById('createRoomModal');
const createRoomClose = document.getElementById('createRoomClose');
const createRoomCancel = document.getElementById('createRoomCancel');
const createRoomSubmit = document.getElementById('createRoomSubmit');

const roomNameInput = document.getElementById('roomNameInput');
const roomPasswordInput = document.getElementById('roomPasswordInput');
const roomScenarioInput = document.getElementById('roomScenarioInput');

const gameUI = document.getElementById('main-container');
const myNameSpan = document.getElementById('myName');
const myRoleSpan = document.getElementById('myRole');
const myRoomSpan = document.getElementById('myRoom');
const myScenarioSpan = document.getElementById('myScenario');
const diceViz = document.getElementById('dice-viz');

const board = document.getElementById('game-board');
const playerList = document.getElementById('player-list');
const logList = document.getElementById('log-list');
const currentPlayerSpan = document.getElementById('current-player');
const nextTurnBtn = document.getElementById('next-turn');

const addPlayerBtn = document.getElementById('add-player');
const rollBtn = document.getElementById('roll');
const endTurnBtn = document.getElementById('end-turn');
const rollInitiativeBtn = document.getElementById('roll-initiative');
const createBoardBtn = document.getElementById('create-board');
const boardWidthInput = document.getElementById('board-width');
const boardHeightInput = document.getElementById('board-height');
const resetGameBtn = document.getElementById('reset-game');
const clearBoardBtn = document.getElementById('clear-board');

const playerNameInput = document.getElementById('player-name');
const playerColorInput = document.getElementById('player-color');
const playerSizeInput = document.getElementById('player-size');

const isBaseCheckbox = document.getElementById('is-base');

const dice = document.getElementById('dice');
const diceCountInput = document.getElementById('dice-count');
const diceRolls = document.getElementById('dice-rolls');

const editEnvBtn = document.getElementById('edit-environment');
const addWallBtn = document.getElementById('add-wall');
const removeWallBtn = document.getElementById('remove-wall');

const startInitiativeBtn = document.getElementById("start-initiative");
const startCombatBtn = document.getElementById("start-combat");
const startExplorationBtn = document.getElementById("start-exploration");

const worldPhasesBox = document.getElementById('world-phases');
const envEditorBox = document.getElementById('env-editor');

// ================== VARIABLES ==================
// Supabase replaces our old Node/WebSocket server.
// GitHub Pages hosts only static files; realtime + DB are handled by Supabase.
let sbClient;
let roomChannel;    // broadcast/presence channel (optional)
let roomDbChannel;  // postgres_changes channel
let myId;
let myRole;

// ===== Role helpers (MVP) =====
function normalizeRoleForDb(role) {
  const r = String(role || '');
  if (r === 'DnD-Player') return 'Player'; // DB constraint
  return r;
}
function normalizeRoleForUi(role) {
  const r = String(role || '');
  if (r === 'Player') return 'DnD-Player';
  return r;
}
function isGM() { return String(myRole || '') === 'GM'; }

function applyRoleToUI() {
  const gm = isGM();

  // ÐÐ-Ð¿Ð°Ð½ÐµÐ»Ñ ÑÐ¿ÑÐ°Ð²Ð° (Ð¤Ð°Ð·Ñ Ð¼Ð¸ÑÐ° + Ð ÐµÐ´Ð°ÐºÑÐ¸ÑÐ¾Ð²Ð°Ð½Ð¸Ðµ Ð¾ÐºÑÑÐ¶ÐµÐ½Ð¸Ñ)
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) rightPanel.style.display = gm ? '' : 'none';

  // ÐÐ»Ð¾Ðº "ÐÐ¾Ð±Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ Ð¸Ð³ÑÐ¾ÐºÐ°" ÑÐ»ÐµÐ²Ð° (ÑÐ¾Ð»ÑÐºÐ¾ ÐÐ)
  const pm = document.getElementById('player-management');
  if (pm) pm.style.display = gm ? '' : 'none';

  // Disable GM-only buttons defensively
  const gmOnlyIds = [
    'create-board','clear-board','reset-game',
    'start-exploration','start-initiative','start-combat',
    'edit-environment','add-wall','remove-wall'
  ];
  gmOnlyIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !gm;
  });
}
let currentRoomId = null;
let players = [];
let lastState = null;
let boardWidth = parseInt(boardWidthInput.value, 10) || 10;
let boardHeight = parseInt(boardHeightInput.value, 10) || 10;

let selectedPlayer = null;
let editEnvironment = false;
let wallMode = null;
let mouseDown = false;

const playerElements = new Map();
let finishInitiativeSent = false;

// users map (ownerId -> {name, role})
const usersById = new Map();

// ÑÑÐ°ÑÑÐ¾Ð²Ð¾ Ð¿ÑÑÑÐµÐ¼ Ð¿Ð°Ð½ÐµÐ»Ñ Ð±ÑÐ¾ÑÐºÐ¾Ð² Ð´Ð¾ Ð²ÑÐ¾Ð´Ð° Ð² ÐºÐ¾Ð¼Ð½Ð°ÑÑ
if (diceViz) diceViz.style.display = 'none';

// ================== JOIN GAME ==================
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  const role = roleSelect.value;

  if (!name) {
    loginError.textContent = "ÐÐ²ÐµÐ´Ð¸ÑÐµ Ð¸Ð¼Ñ";
    return;
  }

  // ===== Supabase init (GitHub Pages) =====
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    loginError.textContent = "Supabase Ð½Ðµ Ð½Ð°ÑÑÑÐ¾ÐµÐ½. ÐÑÐ¾Ð²ÐµÑÑÑÐµ SUPABASE_URL Ð¸ SUPABASE_ANON_KEY Ð² index.html";
    return;
  }

sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // stable identity (doesn't depend on nickname)
  const savedUserId = localStorage.getItem("dnd_user_id") || "";
  const userId = savedUserId || ("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }));

  localStorage.setItem("dnd_user_id", String(userId));
  localStorage.setItem("dnd_user_name", String(name));
  localStorage.setItem("dnd_user_role", String(role || ""));

  // In Supabase-MVP our "myId" is stable localStorage userId
  handleMessage({ type: "registered", id: userId, name, role });

  // list rooms from DB
  sendMessage({ type: 'listRooms' });
});

// ================== MESSAGE HANDLER (used by Supabase subscriptions) ==================
function handleMessage(msg) {

// ===== Rooms lobby messages =====
if (msg.type === 'rooms' && Array.isArray(msg.rooms)) {
  renderRooms(msg.rooms);
  if (!currentRoomId && diceViz) diceViz.style.display = 'none';
}
if (msg.type === 'joinedRoom' && msg.room) {
  roomsDiv.style.display = 'none';
  gameUI.style.display = 'block';

  currentRoomId = msg.room.id || null;
  if (myRoomSpan) myRoomSpan.textContent = msg.room.name || '-';
  if (myScenarioSpan) myScenarioSpan.textContent = msg.room.scenario || '-';
  if (diceViz) diceViz.style.display = 'block';
  applyRoleToUI();
}

if (msg.type === "registered") {
      myId = msg.id;
      localStorage.setItem("dnd_user_id", String(msg.id));
      localStorage.setItem("dnd_user_role", String(msg.role || ""));
myRole = msg.role;
      myNameSpan.textContent = msg.name;
      myRoleSpan.textContent = msg.role;
      myRole = String(msg.role || "");

      

      currentRoomId = null;
      if (diceViz) diceViz.style.display = 'none';
      if (myRoomSpan) myRoomSpan.textContent = '-';
      if (myScenarioSpan) myScenarioSpan.textContent = '-';
loginDiv.style.display = 'none';
      roomsDiv.style.display = 'block';
      gameUI.style.display = 'none';
      roomsError.textContent = '';
      sendMessage({ type: 'listRooms' });

      applyRoleToUI();

      // ÐÐÐÐ¦ÐÐÐÐÐÐÐ¦ÐÐ¯ ÐÐÐÐÐÐÐ "ÐÐÐ¤Ð"
      if (window.InfoModal?.init) {
        window.InfoModal.init({
          sendMessage,
          getMyId: () => myId,
          getMyRole: () => myRole
        });
      }
    }

    if (msg.type === "error") {
      const text = String(msg.message || "ÐÑÐ¸Ð±ÐºÐ°");
      // ÐµÑÐ»Ð¸ Ð¼Ñ ÐµÑÑ Ð½Ð° ÑÐºÑÐ°Ð½Ðµ Ð»Ð¾Ð³Ð¸Ð½Ð°
      if (loginDiv && loginDiv.style.display !== 'none') {
        loginError.textContent = text;
      } else if (roomsDiv && roomsDiv.style.display !== 'none') {
        roomsError.textContent = text;
      } else {
        // Ð² Ð¸Ð³ÑÐµ â Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ ÐºÐ°Ðº Ð±ÑÑÑÑÐ¾Ðµ ÑÐ²ÐµÐ´Ð¾Ð¼Ð»ÐµÐ½Ð¸Ðµ
        alert(text);
      }
    }

    if (msg.type === "users" && Array.isArray(msg.users)) {
      usersById.clear();
      msg.users.forEach(u => usersById.set(u.id, { name: u.name, role: u.role }));
      updatePlayerList();
    }

    if (msg.type === "diceEvent" && msg.event) {
      // Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ Ð²ÑÐµÐ¼ "ÐÑÐ¾ÑÐºÐ¸ Ð´ÑÑÐ³Ð¸Ñ", Ð° ÑÐµÐ±Ðµ â Ð¾Ð±Ð½Ð¾Ð²Ð»ÑÐµÐ¼ Ð¾ÑÐ½Ð¾Ð²Ð½ÑÑ Ð¿Ð°Ð½ÐµÐ»Ñ Ð±ÑÐ¾ÑÐºÐ°
      if (msg.event.fromId && typeof myId !== "undefined" && msg.event.fromId === myId) {
        applyDiceEventToMain(msg.event);
      } else {
        pushOtherDiceEvent(msg.event);
      }
    }

    // ===== Saved bases (Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶Ð¸, Ð¿ÑÐ¸Ð²ÑÐ·Ð°Ð½Ð½ÑÐµ Ðº userId) =====
    if (msg.type === "savedBasesList" && Array.isArray(msg.list)) {
      window.InfoModal?.onSavedBasesList?.(msg.list);
    }
    if (msg.type === "savedBaseSaved") {
      window.InfoModal?.onSavedBaseSaved?.(msg);
    }
    if (msg.type === "savedBaseApplied") {
      window.InfoModal?.onSavedBaseApplied?.(msg);
    }
    if (msg.type === "savedBaseDeleted") {
      window.InfoModal?.onSavedBaseDeleted?.(msg);
    }

    if (msg.type === "init" || msg.type === "state") {
      lastState = msg.state;
      boardWidth = msg.state.boardWidth;
      boardHeight = msg.state.boardHeight;

      // Ð£Ð´Ð°Ð»ÑÐµÐ¼ DOM-ÑÐ»ÐµÐ¼ÐµÐ½ÑÑ Ð¸Ð³ÑÐ¾ÐºÐ¾Ð², ÐºÐ¾ÑÐ¾ÑÑÑ Ð±Ð¾Ð»ÑÑÐµ Ð½ÐµÑ Ð² ÑÐ¾ÑÑÐ¾ÑÐ½Ð¸Ð¸
      const existingIds = new Set((msg.state.players || []).map(p => p.id));
      playerElements.forEach((el, id) => {
        if (!existingIds.has(id)) {
          el.remove();
          playerElements.delete(id);
        }
      });

      players = msg.state.players || [];

      // ÐÑÐ½Ð¾Ð²Ð° Ð¾Ð´Ð½Ð° Ð½Ð° Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ â Ð±Ð»Ð¾ÐºÐ¸ÑÑÐµÐ¼ ÑÐµÐºÐ±Ð¾ÐºÑ
      if (isBaseCheckbox) {
        const baseExistsForMe = players.some(p => p.isBase && p.ownerId === myId);
        isBaseCheckbox.disabled = baseExistsForMe;
        if (baseExistsForMe) isBaseCheckbox.checked = false;
      }

      if (selectedPlayer && !existingIds.has(selectedPlayer.id)) {
        selectedPlayer = null;
      }

      renderBoard(msg.state);
      updatePhaseUI(msg.state);
      updatePlayerList();
      updateCurrentPlayer(msg.state);
      renderLog(msg.state.log || []);

      // ÐµÑÐ»Ð¸ "ÐÐ½ÑÐ°" Ð¾ÑÐºÑÑÑÐ° â Ð¾Ð±Ð½Ð¾Ð²Ð»ÑÐµÐ¼ ÐµÐµ Ð¿Ð¾ ÑÐ²ÐµÐ¶ÐµÐ¼Ñ state
      window.InfoModal?.refresh?.(players);
    }
}

startInitiativeBtn?.addEventListener("click", () => {
  if (!isGM()) return;
  sendMessage({ type: "startInitiative" });
});

startExplorationBtn?.addEventListener("click", () => {
  if (!isGM()) return;
  sendMessage({ type: "startExploration" });
});

startCombatBtn?.addEventListener("click", () => {
  if (!isGM()) return;
  sendMessage({ type: "startCombat" });
});

nextTurnBtn?.addEventListener("click", () => {
  // "ÐÐ¾Ð½ÐµÑ ÑÐ¾Ð´Ð°" â Ð¿ÐµÑÐµÐ¹ÑÐ¸ Ðº ÑÐ»ÐµÐ´ÑÑÑÐµÐ¼Ñ Ð¿Ð¾ Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ðµ
  sendMessage({ type: "endTurn" });
});

// ================== ROLE UI ==================
function setupRoleUI(role) {
  const r = normalizeRoleForUi(role);
  const gm = (r === "GM");
  const spectator = (r === "Spectator");

  // Ð²ÑÐµÐ³Ð´Ð° Ð¿ÑÐ¸Ð¼ÐµÐ½ÑÐµÐ¼ Ð¾ÑÐ½Ð¾Ð²Ð½ÑÑ Ð»Ð¾Ð³Ð¸ÐºÑ ÐÐ/Ð½Ðµ-ÐÐ
  applyRoleToUI();

  // ÐÐ°Ð±Ð»ÑÐ´Ð°ÑÐµÐ»Ñ â Ð¿ÑÑÑÐµÐ¼ Ð°ÐºÑÐ¸Ð²Ð½ÑÐµ ÑÐ»ÐµÐ¼ÐµÐ½ÑÑ ÑÐ¿ÑÐ°Ð²Ð»ÐµÐ½Ð¸Ñ
  if (spectator) {
    if (addPlayerBtn) addPlayerBtn.style.display = 'none';
    if (rollBtn) rollBtn.style.display = 'none';
    if (endTurnBtn) endTurnBtn.style.display = 'none';
    if (rollInitiativeBtn) rollInitiativeBtn.style.display = 'none';
    if (createBoardBtn) createBoardBtn.style.display = 'none';
    if (resetGameBtn) resetGameBtn.style.display = 'none';
    if (clearBoardBtn) clearBoardBtn.style.display = 'none';
    if (nextTurnBtn) nextTurnBtn.style.display = 'none';
  } else {
    // Ð¾ÑÑÐ°Ð»ÑÐ½ÑÐµ â Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ (Ð³Ð»Ð¾Ð±Ð°Ð»ÑÐ½ÑÐµ disabled ÑÐ¶Ðµ Ð²ÑÑÑÐ°Ð²Ð»ÐµÐ½Ñ Ð² applyRoleToUI)
    if (addPlayerBtn) addPlayerBtn.style.display = '';
    if (rollBtn) rollBtn.style.display = '';
    if (endTurnBtn) endTurnBtn.style.display = '';
    if (rollInitiativeBtn) rollInitiativeBtn.style.display = '';
    if (createBoardBtn) createBoardBtn.style.display = '';
    if (resetGameBtn) resetGameBtn.style.display = '';
    if (clearBoardBtn) clearBoardBtn.style.display = '';
    if (nextTurnBtn) nextTurnBtn.style.display = '';
  }
}

//
// ================== LOG ==================
function renderLog(logs) {
  const wasNearBottom =
    (logList.scrollTop + logList.clientHeight) >= (logList.scrollHeight - 30);

  logList.innerHTML = '';
  logs.slice(-50).forEach(line => {
    const li = document.createElement('li');
    li.textContent = line;
    logList.appendChild(li);
  });

  if (wasNearBottom) {
    logList.scrollTop = logList.scrollHeight;
  }
}

// ================== CURRENT PLAYER ==================
function updateCurrentPlayer(state) {
  const inCombat = (state && state.phase === 'combat');

  // Ð¿Ð¾ ÑÐ¼Ð¾Ð»ÑÐ°Ð½Ð¸Ñ
  if (nextTurnBtn) {
    nextTurnBtn.style.display = inCombat ? 'inline-block' : 'none';
    nextTurnBtn.disabled = true;
    nextTurnBtn.classList.remove('is-active');
  }

  if (!inCombat || !state || !state.turnOrder || state.turnOrder.length === 0) {
    currentPlayerSpan.textContent = '-';
    highlightCurrentTurn(null);
    return;
  }

  const id = state.turnOrder[state.currentTurnIndex];
  const p = players.find(pl => pl.id === id);
  currentPlayerSpan.textContent = p ? p.name : '-';

  highlightCurrentTurn(id);

  // ÐºÐ½Ð¾Ð¿ÐºÑ "Ð¡Ð»ÐµÐ´ÑÑÑÐ¸Ð¹ ÑÐ¾Ð´" Ð¼Ð¾Ð¶ÐµÑ Ð½Ð°Ð¶Ð¸Ð¼Ð°ÑÑ GM Ð¸Ð»Ð¸ Ð²Ð»Ð°Ð´ÐµÐ»ÐµÑ ÑÐµÐºÑÑÐµÐ³Ð¾ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶Ð°
  if (nextTurnBtn) {
    const canNext = (myRole === 'GM') || (p && p.ownerId === myId);
    nextTurnBtn.disabled = !canNext;
    if (canNext) nextTurnBtn.classList.add('is-active');
  }
}

function highlightCurrentTurn(playerId) {
  playerElements.forEach((el) => el.classList.remove('current-turn'));
  if (!playerId) return;
  const el = playerElements.get(playerId);
  if (el) el.classList.add('current-turn');
}

// ================== PLAYER LIST ==================
function roleToLabel(role) {
  const r = normalizeRoleForUi(role);
  if (r === "GM") return "GM";
  if (r === "DnD-Player") return "DnD-P";
  if (r === "Spectator") return "Spectator";
  return "-";
}

function roleToClass(role) {
  const r = normalizeRoleForUi(role);
  if (r === "GM") return "role-gm";
  if (r === "DnD-Player") return "role-player";
  if (r === "Spectator") return "role-spectator";
  return "role-unknown";
}

function updatePlayerList() {
  if (!playerList) return;
  playerList.innerHTML = '';

  const currentTurnId = (lastState && lastState.phase === 'combat' && Array.isArray(lastState.turnOrder) && lastState.turnOrder.length)
    ? lastState.turnOrder[lastState.currentTurnIndex]
    : null;

  // Ð¡Ð½Ð°ÑÐ°Ð»Ð° ÑÐ¾Ð·Ð´Ð°ÑÐ¼ Ð³ÑÑÐ¿Ð¿Ñ Ð¿Ð¾ Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»ÑÐ¼ (Ð´Ð°Ð¶Ðµ ÐµÑÐ»Ð¸ Ñ Ð½Ð¸Ñ ÐµÑÑ Ð½ÐµÑ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶ÐµÐ¹)
  const grouped = {};
  usersById.forEach((u, ownerId) => {
    grouped[ownerId] = {
      ownerName: (u && u.name) ? u.name : 'Unknown',
      players: []
    };
  });

  // ÐÐ¾Ð±Ð°Ð²Ð»ÑÐµÐ¼ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶ÐµÐ¹ Ð² ÑÐ¾Ð¾ÑÐ²ÐµÑÑÑÐ²ÑÑÑÐ¸Ðµ Ð³ÑÑÐ¿Ð¿Ñ
  players.forEach(p => {
    if (!grouped[p.ownerId]) {
      grouped[p.ownerId] = {
        ownerName: p.ownerName || 'Unknown',
        players: []
      };
    }
    grouped[p.ownerId].players.push(p);
  });

  Object.entries(grouped).forEach(([ownerId, group]) => {
    const userInfo = ownerId ? usersById.get(ownerId) : null;

    const ownerLi = document.createElement('li');
    ownerLi.className = 'owner-group';

    const ownerHeader = document.createElement('div');
    ownerHeader.className = 'owner-header';

    const ownerNameSpan = document.createElement('span');
    ownerNameSpan.className = 'owner-name';
    ownerNameSpan.textContent = userInfo?.name || group.ownerName;

    const role = userInfo?.role;
    const badge = document.createElement('span');
    badge.className = `role-badge ${roleToClass(role)}`;
    badge.textContent = `(${roleToLabel(role)})`;

    ownerHeader.appendChild(ownerNameSpan);
    ownerHeader.appendChild(badge);

    const ul = document.createElement('ul');
    ul.className = 'owner-players';

    if (!group.players || group.players.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'player-list-item';
      const text = document.createElement('span');
      text.classList.add('player-name-text');
      text.textContent = 'ÐÐµÑÑÐ¾Ð½Ð°Ð¶ÐµÐ¹ Ð½ÐµÑ';
      emptyLi.appendChild(text);
      ul.appendChild(emptyLi);
    }

    group.players.forEach(p => {
      const li = document.createElement('li');
      li.className = 'player-list-item';

      if (currentTurnId && p.id === currentTurnId) {
        li.classList.add('is-current-turn');
      }

      const indicator = document.createElement('span');
      indicator.classList.add('placement-indicator');
      const placed = (p.x !== null && p.y !== null);
      indicator.classList.add(placed ? 'placed' : 'not-placed');

      const text = document.createElement('span');
      text.classList.add('player-name-text');
      const initVal = (p.initiative !== null && p.initiative !== undefined) ? p.initiative : 0;
      text.textContent = `${p.name} (${initVal})`;

      const nameWrap = document.createElement('div');
      nameWrap.classList.add('player-name-wrap');
      nameWrap.appendChild(indicator);
      nameWrap.appendChild(text);

      if (p.isBase) {
        const baseBadge = document.createElement('span');
        baseBadge.className = 'base-badge';
        baseBadge.textContent = 'Ð¾ÑÐ½Ð¾Ð²Ð°';
        nameWrap.appendChild(baseBadge);
      }

      li.appendChild(nameWrap);

      const actions = document.createElement('div');
      actions.className = 'player-actions';

      // ===== ÐÐ¾Ð²ÑÐ¹ Ð¸Ð³ÑÐ¾Ðº Ð²Ð¾ Ð²ÑÐµÐ¼Ñ Ð±Ð¾Ñ: Ð²ÑÐ±Ð¾Ñ Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ñ (ÑÐ¾Ð»ÑÐºÐ¾ Ð´Ð»Ñ Ð½ÐµÐ³Ð¾) =====
      if (lastState && lastState.phase === 'combat' && p.pendingInitiativeChoice && (myRole === 'GM' || p.ownerId === myId)) {
        const box = document.createElement('div');
        box.className = 'init-choice-box';

        const rollInitBtn = document.createElement('button');
        rollInitBtn.className = 'init-choice-btn';
        rollInitBtn.textContent = 'ÐÑÐ¾ÑÐ¸ÑÑ Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ñ';
        rollInitBtn.classList.add('mini-action-btn');
        rollInitBtn.title = 'd20 + Ð¼Ð¾Ð´Ð¸ÑÐ¸ÐºÐ°ÑÐ¾Ñ ÐÐ¾Ð²ÐºÐ¾ÑÑÐ¸';
        rollInitBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'combatInitChoice', id: p.id, choice: 'roll' });
        };

        const baseInitBtn = document.createElement('button');
        baseInitBtn.className = 'init-choice-btn';
        baseInitBtn.textContent = 'ÐÐ½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ð° Ð¾ÑÐ½Ð¾Ð²Ñ';
        baseInitBtn.classList.add('mini-action-btn');
        baseInitBtn.title = 'ÐÐ·ÑÑÑ Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ñ Ð¸Ð· Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶Ð° "Ð¾ÑÐ½Ð¾Ð²Ð°" Ð²Ð»Ð°Ð´ÐµÐ»ÑÑÐ°';
        baseInitBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'combatInitChoice', id: p.id, choice: 'base' });
        };

        box.appendChild(rollInitBtn);
        box.appendChild(baseInitBtn);
        actions.appendChild(box);
      }

      // ÐÐÐÐÐÐ "ÐÐÐ¤Ð" â ÑÐµÐ¿ÐµÑÑ Ð²ÑÐ·ÑÐ²Ð°ÐµÑ Ð²Ð½ÐµÑÐ½Ð¸Ð¹ Ð¼Ð¾Ð´ÑÐ»Ñ
      if (p.isBase) {
        const infoBtn = document.createElement('button');
        infoBtn.textContent = 'ÐÐ½ÑÐ°';
        infoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.InfoModal?.open?.(p);
        });
        actions.appendChild(infoBtn);
      }

      // Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ðµ ÑÐ°Ð·Ð¼ÐµÑÐ°
      if (myRole === "GM" || p.ownerId === myId) {
        const sizeSelect = document.createElement('select');
        sizeSelect.className = 'size-select';
        for (let s = 1; s <= 5; s++) {
          const opt = document.createElement('option');
          opt.value = String(s);
          opt.textContent = `${s}x${s}`;
          if (s === p.size) opt.selected = true;
          sizeSelect.appendChild(opt);
        }

        sizeSelect.addEventListener('click', (e) => e.stopPropagation());
        sizeSelect.addEventListener('change', (e) => {
          e.stopPropagation();
          sendMessage({ type: 'updatePlayerSize', id: p.id, size: parseInt(sizeSelect.value, 10) });
        });

        actions.appendChild(sizeSelect);
      }

      li.addEventListener('click', () => {
        selectedPlayer = p;
        if (p.x === null || p.y === null) {
          const size = Number(p.size) || 1;
          const spot = findFirstFreeSpotClient(size);
          if (!spot) {
            alert("ÐÐµÑ ÑÐ²Ð¾Ð±Ð¾Ð´Ð½ÑÑ ÐºÐ»ÐµÑÐ¾Ðº Ð´Ð»Ñ ÑÐ°Ð·Ð¼ÐµÑÐµÐ½Ð¸Ñ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶Ð°");
            return;
          }
          sendMessage({ type: 'movePlayer', id: p.id, x: spot.x, y: spot.y });
        }
      });

      if (myRole === "GM" || p.ownerId === myId) {
        const removeFromBoardBtn = document.createElement('button');
        removeFromBoardBtn.textContent = 'Ð¡ Ð¿Ð¾Ð»Ñ';
        removeFromBoardBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'removePlayerFromBoard', id: p.id });
        };

        const removeCompletelyBtn = document.createElement('button');
        removeCompletelyBtn.textContent = 'Ð£Ð´Ð°Ð»Ð¸ÑÑ';
        removeCompletelyBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'removePlayerCompletely', id: p.id });
        };

        actions.appendChild(removeFromBoardBtn);
        actions.appendChild(removeCompletelyBtn);
      }

      li.appendChild(actions);
      ul.appendChild(li);
    });

    ownerLi.appendChild(ownerHeader);
    ownerLi.appendChild(ul);
    playerList.appendChild(ownerLi);
  });
}

// ================== BOARD ==================
function renderBoard(state) {
  board.querySelectorAll('.cell').forEach(c => c.remove());
  board.style.position = 'relative';
  board.style.width = `${boardWidth * 50}px`;
  board.style.height = `${boardHeight * 50}px`;
  board.style.display = 'grid';
  board.style.gridTemplateColumns = `repeat(${boardWidth}, 50px)`;
  board.style.gridTemplateRows = `repeat(${boardHeight}, 50px)`;

  for (let y = 0; y < boardHeight; y++) {
    for (let x = 0; x < boardWidth; x++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.x = x;
      cell.dataset.y = y;
      if (state.walls?.find(w => w.x === x && w.y === y)) cell.classList.add('wall');
      board.appendChild(cell);
    }
  }

  players.forEach(p => setPlayerPosition(p));
}

// ================== PLAYER POSITION ==================
function setPlayerPosition(player) {
  let el = playerElements.get(player.id);

  if (!el) {
    el = document.createElement('div');
    el.classList.add('player');
    el.textContent = player.name?.[0] || '?';
    el.style.backgroundColor = player.color;
    el.style.position = 'absolute';

    el.addEventListener('mousedown', () => {
      if (!editEnvironment) {
        if (selectedPlayer) {
          const prev = playerElements.get(selectedPlayer.id);
          if (prev) prev.classList.remove('selected');
        }
        selectedPlayer = player;
        el.classList.add('selected');
      }
    });

    board.appendChild(el);
    playerElements.set(player.id, el);
    player.element = el;
  }

  el.textContent = player.name ? player.name[0] : '?';
  el.style.backgroundColor = player.color;
  el.style.width = `${player.size * 50}px`;
  el.style.height = `${player.size * 50}px`;

  if (player.x === null || player.y === null) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';

  const maxX = boardWidth - player.size;
  const maxY = boardHeight - player.size;
  const x = Math.min(Math.max(player.x, 0), maxX);
  const y = Math.min(Math.max(player.y, 0), maxY);

  const cell = board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (cell) {
    el.style.left = `${cell.offsetLeft}px`;
    el.style.top = `${cell.offsetTop}px`;
  }
}

// ================== NO-OVERLAP HELPERS (CLIENT SIDE) ==================
function rectsOverlap(ax, ay, as, bx, by, bs) {
  return ax < (bx + bs) && (ax + as) > bx && ay < (by + bs) && (ay + as) > by;
}

function isAreaFreeClient(ignoreId, x, y, size) {
  for (const other of players) {
    if (!other) continue;
    if (ignoreId && other.id === ignoreId) continue;
    if (other.x === null || other.y === null) continue;
    const os = Number(other.size) || 1;
    if (rectsOverlap(x, y, size, other.x, other.y, os)) return false;
  }
  return true;
}

function findFirstFreeSpotClient(size) {
  const maxX = boardWidth - size;
  const maxY = boardHeight - size;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= maxX; x++) {
      if (isAreaFreeClient(null, x, y, size)) return { x, y };
    }
  }
  return null;
}

// ================== ADD PLAYER ==================
addPlayerBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) return alert("ÐÐ²ÐµÐ´Ð¸ÑÐµ Ð¸Ð¼Ñ");

  const player = {
    name,
    color: playerColorInput.value,
    size: parseInt(playerSizeInput.value, 10),
    isBase: !!isBaseCheckbox?.checked
  };

  sendMessage({ type: 'addPlayer', player });

  playerNameInput.value = '';
  if (isBaseCheckbox && !isBaseCheckbox.disabled) isBaseCheckbox.checked = false;
});

// ================== MOVE PLAYER ==================
board.addEventListener('click', e => {
  if (!selectedPlayer) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;

  let x = parseInt(cell.dataset.x, 10);
  let y = parseInt(cell.dataset.y, 10);
  if (x + selectedPlayer.size > boardWidth) x = boardWidth - selectedPlayer.size;
  if (y + selectedPlayer.size > boardHeight) y = boardHeight - selectedPlayer.size;

  // Ð±ÑÑÑÑÑÐ¹ Ð»Ð¾ÐºÐ°Ð»ÑÐ½ÑÐ¹ ÑÐµÐº (ÑÐµÑÐ²ÐµÑ Ð²ÑÑ ÑÐ°Ð²Ð½Ð¾ Ð¿ÑÐ¾Ð²ÐµÑÐ¸Ñ)
  const size = Number(selectedPlayer.size) || 1;
  if (!isAreaFreeClient(selectedPlayer.id, x, y, size)) {
    alert("Ð­ÑÐ° ÐºÐ»ÐµÑÐºÐ° Ð·Ð°Ð½ÑÑÐ° Ð´ÑÑÐ³Ð¸Ð¼ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶ÐµÐ¼");
    return;
  }

  sendMessage({ type: 'movePlayer', id: selectedPlayer.id, x, y });
  const el = playerElements.get(selectedPlayer.id);
  if (el) el.classList.remove('selected');
  selectedPlayer = null;
});

// ===== Dice Viz (panel + canvas animation) =====
const diceVizKind = document.getElementById("dice-viz-kind");
const diceVizValue = document.getElementById("dice-viz-value");
const diceCanvas = document.getElementById("dice-canvas");
const diceCtx = diceCanvas?.getContext?.("2d");

let diceAnimFrame = null;
let diceAnimBusy = false;

// ===== Other players dice feed (right of dice panel) =====
let othersDiceWrap = null;

function ensureOthersDiceUI() {
  if (othersDiceWrap) return othersDiceWrap;

  othersDiceWrap = document.createElement("div");
  othersDiceWrap.className = "dice-others";
  othersDiceWrap.innerHTML = `<div class="dice-others__title">ÐÑÐ¾ÑÐºÐ¸ Ð´ÑÑÐ³Ð¸Ñ</div>`;
  document.body.appendChild(othersDiceWrap);
  return othersDiceWrap;
}

// Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ ÑÐµÐ·ÑÐ»ÑÑÐ°Ñ Ð±ÑÐ¾ÑÐºÐ° Ð² Ð¾ÑÐ½Ð¾Ð²Ð½Ð¾Ð¹ Ð¿Ð°Ð½ÐµÐ»Ð¸ (Ð¸ÑÐ¿Ð¾Ð»ÑÐ·ÑÐµÑÑÑ Ð´Ð»Ñ ÑÐµÑÐ²ÐµÑÐ½ÑÑ Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð² Ð¸ Ñ.Ð¿.)
async function applyDiceEventToMain(ev) {
  if (!ev) return;

  const sides = Number(ev.sides) || null;
  const count = Number(ev.count) || 1;
  const bonus = Number(ev.bonus) || 0;

  // Ð¿Ð¾Ð´Ð¿Ð¸ÑÑ
  if (diceVizKind) {
    diceVizKind.textContent = ev.kindText || (sides ? `d${sides}` : "ÐÑÐ¾ÑÐ¾Ðº");
  }

  // Ð·Ð½Ð°ÑÐµÐ½Ð¸Ðµ â Ð¸ÑÐ¾Ð³ (Ñ Ð±Ð¾Ð½ÑÑÐ¾Ð¼)
  if (diceVizValue) {
    diceVizValue.textContent = String(Number(ev.total) || 0);
  }

  // ÑÐ¸ÑÐºÐ¸ â ÑÐ¾Ð»ÑÐºÐ¾ "ÑÑÑÐ¾Ð¹" ÐºÑÐ±Ð¸Ðº (rolls)
  const rolls = Array.isArray(ev.rolls) ? ev.rolls.map(n => Number(n) || 0) : [];
  renderRollChips(rolls.length ? rolls : [Number(ev.total) || 0], -1, sides);

  // Ð°Ð½Ð¸Ð¼Ð°ÑÐ¸Ñ ÐºÑÐ±Ð¸ÐºÐ° (ÐºÐ°Ðº Ð¿ÑÐ¸ Ð¾Ð±ÑÑÐ½Ð¾Ð¼ "ÐÑÐ¾ÑÐ¸ÑÑ")
  if (!diceAnimBusy && diceCtx && diceCanvas && sides && rolls.length) {
    diceAnimBusy = true;
    try {
      for (const r of rolls) {
        await animateSingleRoll(sides, r);
      }
    } finally {
      diceAnimBusy = false;
    }
  }

  // ÐºÑÐ¸Ñ-Ð¿Ð¾Ð´ÑÐ²ÐµÑÐºÑ Ð¾ÑÑÐ°Ð²Ð»ÑÐµÐ¼ ÑÐ¾Ð»ÑÐºÐ¾ Ð´Ð»Ñ ÑÐ¸ÑÑÐ¾Ð³Ð¾ d20 (Ð±ÐµÐ· Ð±Ð¾Ð½ÑÑÐ°)
  if (sides === 20 && count === 1 && bonus === 0 && rolls.length === 1) {
    applyPureD20CritUI(rolls[0]);
  } else {
    clearCritUI();
  }
}

function pushOtherDiceEvent(ev) {
  ensureOthersDiceUI();

  // Ð½Ðµ Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ ÑÐ²Ð¾Ð¸ Ð¶Ðµ Ð±ÑÐ¾ÑÐºÐ¸
  if (ev.fromId && typeof myId !== "undefined" && ev.fromId === myId) return;

  const item = document.createElement("div");
  item.className = "dice-others__item";
  item.dataset.crit = ev.crit || "";

  const rollsText = (ev.rolls && ev.rolls.length)
    ? ev.rolls.join(" + ")
    : "-";

  const head = `${ev.fromName || "ÐÐ³ÑÐ¾Ðº"}: ${ev.kindText || `d${ev.sides} Ã ${ev.count}`}`;

  // ÐÐ»Ñ Ð¾Ð´Ð¸Ð½Ð¾ÑÐ½Ð¾Ð³Ð¾ Ð±ÑÐ¾ÑÐºÐ° Ñ Ð±Ð¾Ð½ÑÑÐ¾Ð¼ Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ ÐºÐ¾Ð¼Ð¿Ð°ÐºÑÐ½Ð¾: "12+4=16"
  let tail = `${rollsText} = ${ev.total}`;
  const bonusNum = Number(ev.bonus) || 0;
  if (Number(ev.count) === 1 && bonusNum !== 0 && Array.isArray(ev.rolls) && ev.rolls.length === 1) {
    const r = Number(ev.rolls[0]) || 0;
    const sign = bonusNum >= 0 ? "+" : "-";
    tail = `${r}${sign}${Math.abs(bonusNum)}=${ev.total}`;
  }

  item.innerHTML = `
    <div class="dice-others__head">${escapeHtmlLocal(head)}</div>
    <div class="dice-others__body">${escapeHtmlLocal(tail)}</div>
  `;

  // ÐºÑÐ¸Ñ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐºÐ° (ÐµÑÐ»Ð¸ Ð¿ÑÐ¸Ð»ÐµÑÐµÐ»Ð¾)
  if (ev.crit === "crit-fail") item.classList.add("crit-fail");
  if (ev.crit === "crit-success") item.classList.add("crit-success");

  othersDiceWrap.appendChild(item);

  // ÑÐµÑÐµÐ· 5Ñ â Ð¿Ð»Ð°Ð²Ð½Ð¾Ðµ Ð¸ÑÑÐµÐ·Ð½Ð¾Ð²ÐµÐ½Ð¸Ðµ
  setTimeout(() => item.classList.add("fade"), 4200);
  setTimeout(() => item.remove(), 5200);
}

// Ð¼Ð°Ð»ÐµÐ½ÑÐºÐ¸Ð¹ ÑÐºÑÐ°Ð½Ð¸ÑÐ¾Ð²ÑÐ¸Ðº
function escapeHtmlLocal(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearCritUI() {
  if (diceVizValue) {
    diceVizValue.classList.remove("crit-fail", "crit-success");
  }
  if (diceRolls) {
    diceRolls.querySelectorAll(".dice-chip").forEach(ch =>
      ch.classList.remove("crit-fail", "crit-success")
    );
  }
}

function applyPureD20CritUI(finalValue) {
  // ÐºÑÐ¸Ñ ÑÐ¾Ð»ÑÐºÐ¾ Ð´Ð»Ñ "ÑÐ¸ÑÑÐ¾Ð³Ð¾" d20 (Ð±ÐµÐ· Ð±Ð¾Ð½ÑÑÐ°), Ð¿Ð¾ÑÑÐ¾Ð¼Ñ ÑÑÐ´Ð° Ð¿ÐµÑÐµÐ´Ð°ÑÐ¼ Ð·Ð½Ð°ÑÐµÐ½Ð¸Ðµ ÐºÐ¾Ð³Ð´Ð° ÑÑÐ»Ð¾Ð²Ð¸Ñ ÑÐ¶Ðµ Ð¿ÑÐ¾Ð²ÐµÑÐµÐ½Ñ
  clearCritUI();

  if (finalValue === 1) {
    if (diceVizValue) diceVizValue.classList.add("crit-fail");
    const chip = diceRolls?.querySelector(".dice-chip");
    if (chip) chip.classList.add("crit-fail");
    return " â ÐÐ ÐÐ¢ÐÐ§ÐÐ¡ÐÐÐ ÐÐ ÐÐÐÐ (1)";
  }

  if (finalValue === 20) {
    if (diceVizValue) diceVizValue.classList.add("crit-success");
    const chip = diceRolls?.querySelector(".dice-chip");
    if (chip) chip.classList.add("crit-success");
    return " â ÐÐ ÐÐ¢ÐÐ§ÐÐ¡ÐÐÐ Ð£Ð¡ÐÐÐ¥ (20)";
  }

  return "";
}


function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawDieFace(ctx, w, h, sides, value, t) {
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // Ð»ÑÐ³ÐºÐ°Ñ ÑÑÑÑÐºÐ°/Ð²ÑÐ°ÑÐµÐ½Ð¸Ðµ
  const ang = Math.sin(t * 0.02) * 0.22;
  const scale = 1 + Math.sin(t * 0.015) * 0.02;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const pad = 14;
  const rw = w - pad * 2;
  const rh = h - pad * 2;
  const r = 18;

  // ÑÐµÐ½Ñ
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  roundRect(ctx, pad + 3, pad + 6, rw, rh, r);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ÑÐµÐ»Ð¾
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 2;
  roundRect(ctx, pad, pad, rw, rh, r);
  ctx.fill();
  ctx.stroke();

  // Ð¿Ð¾Ð´Ð¿Ð¸ÑÑ dN
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`d${sides}`, cx, pad + 26);

  // Ð·Ð½Ð°ÑÐµÐ½Ð¸Ðµ
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "900 46px sans-serif";
  ctx.fillText(String(value), cx, cy + 18);

  ctx.restore();
}

function renderRollChips(values, activeIndex, sides = null) {
  if (!diceRolls) return;
  diceRolls.innerHTML = "";
  values.forEach((v, i) => {
    const chip = document.createElement("span");
    chip.className = "dice-chip" + (i === activeIndex ? " active" : "");
    // â ÐÐ¾Ð´ÑÐ²ÐµÑÐºÐ° 1 Ð¸ 20 Ð´Ð»Ñ Ð»ÑÐ±Ð¾Ð³Ð¾ ÐºÐ¾Ð»Ð¸ÑÐµÑÑÐ²Ð° Ð¾Ð´Ð½Ð¾Ð²ÑÐµÐ¼ÐµÐ½Ð½Ð¾ Ð±ÑÐ¾ÑÐµÐ½Ð½ÑÑ d20
    if (Number(sides) === 20 && v !== null) {
      if (v === 1) chip.classList.add('crit-fail');
      if (v === 20) chip.classList.add('crit-success');
    }
    chip.textContent = (v === null ? "â¦" : String(v));
    diceRolls.appendChild(chip);
  });
}

function animateSingleRoll(sides, finalValue) {
  // ÐÐ¾Ð·Ð²ÑÐ°ÑÐ°ÐµÑ Promise, ÑÑÐ¾Ð±Ñ Ð¼Ð¾Ð¶Ð½Ð¾ Ð±ÑÐ»Ð¾ ÐºÐ¸Ð´Ð°ÑÑ Ð½ÐµÑÐºÐ¾Ð»ÑÐºÐ¾ ÐºÑÐ±Ð¾Ð² Ð¿Ð¾ Ð¾ÑÐµÑÐµÐ´Ð¸
  return new Promise((resolve) => {
    if (!diceCtx || !diceCanvas) {
      resolve();
      return;
    }

    const start = performance.now();
    const dur = 420; // ms Ð½Ð° Ð¾Ð´Ð¸Ð½ ÐºÑÐ±Ð¸Ðº
    let lastShown = rollDie(sides);

    function frame(now) {
      const t = now - start;
      const p = Math.min(1, t / dur);

      const changeProb = 0.92 - 0.86 * p; // 0.92 -> 0.06
      if (Math.random() < changeProb) lastShown = rollDie(sides);

      drawDieFace(diceCtx, diceCanvas.width, diceCanvas.height, sides, lastShown, t);

      if (p < 1) {
        diceAnimFrame = requestAnimationFrame(frame);
      } else {
        drawDieFace(diceCtx, diceCanvas.width, diceCanvas.height, sides, finalValue, t + 999);
        resolve();
      }
    }

    if (diceAnimFrame) cancelAnimationFrame(diceAnimFrame);
    diceAnimFrame = requestAnimationFrame(frame);
  });
}

// ===== other players dice feed =====
let diceOthersWrap = null;

function ensureDiceOthersUI() {
  if (diceOthersWrap) return diceOthersWrap;

  diceOthersWrap = document.createElement('div');
  diceOthersWrap.className = 'dice-others';
  diceOthersWrap.innerHTML = `<div class="dice-others__title">ÐÑÐ¾ÑÐºÐ¸ Ð´ÑÑÐ³Ð¸Ñ</div>`;
  document.body.appendChild(diceOthersWrap);

  return diceOthersWrap;
}

function pushOtherDice(ev) {
  // Ð½Ðµ Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ ÑÐ²Ð¾Ð¸ Ð¶Ðµ Ð±ÑÐ¾ÑÐºÐ¸
  if (ev?.fromId && typeof myId !== 'undefined' && ev.fromId === myId) return;

  ensureDiceOthersUI();

  const item = document.createElement('div');
  item.className = 'dice-others__item';

  if (ev.crit === 'crit-fail') item.classList.add('crit-fail');
  if (ev.crit === 'crit-success') item.classList.add('crit-success');

  const head = `${ev.fromName || 'ÐÐ³ÑÐ¾Ðº'}: ${ev.kindText || `d${ev.sides} Ã ${ev.count}`}`;
  const rollsText = (ev.rolls && ev.rolls.length) ? ev.rolls.join(' + ') : '-';

  // ÐÐ»Ñ Ð¾Ð´Ð¸Ð½Ð¾ÑÐ½Ð¾Ð³Ð¾ Ð±ÑÐ¾ÑÐºÐ° Ñ Ð±Ð¾Ð½ÑÑÐ¾Ð¼ Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ ÐºÐ¾Ð¼Ð¿Ð°ÐºÑÐ½Ð¾: "12+4=16"
  let body = `${rollsText} = ${ev.total}`;
  const bonusNum = Number(ev.bonus) || 0;
  if (Number(ev.count) === 1 && bonusNum !== 0 && Array.isArray(ev.rolls) && ev.rolls.length === 1) {
    const r = Number(ev.rolls[0]) || 0;
    const sign = bonusNum >= 0 ? '+' : '-';
    body = `${r}${sign}${Math.abs(bonusNum)}=${ev.total}`;
  }

  item.innerHTML = `
    <div class="dice-others__head">${escapeHtmlLocal(head)}</div>
    <div class="dice-others__body">${escapeHtmlLocal(body)}</div>
  `;

  diceOthersWrap.appendChild(item);

  // Ð·Ð°ÑÑÑÐ°Ð½Ð¸Ðµ Ð¸ ÑÐ´Ð°Ð»ÐµÐ½Ð¸Ðµ
  setTimeout(() => item.classList.add('fade'), 4200);
  setTimeout(() => item.remove(), 5200);
}

// Ð¼Ð°Ð»ÐµÐ½ÑÐºÐ¸Ð¹ ÑÐºÑÐ°Ð½Ð¸ÑÐ¾Ð²ÑÐ¸Ðº (ÑÑÐ¾Ð±Ñ Ð¸Ð¼ÐµÐ½Ð° Ð½Ðµ Ð»Ð¾Ð¼Ð°Ð»Ð¸ HTML)
function escapeHtmlLocal(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ===== API: programmatic dice rolls (used by InfoModal weapons) =====
window.DicePanel = window.DicePanel || {};
// Programmatic dice roll used by InfoModal etc.
// If silent=true, it will only animate/update the local dice panel UI and will NOT send log/diceEvent.
// Returns: {sides,count,bonus,rolls,sum,total}
window.DicePanel.roll = async ({ sides = 20, count = 1, bonus = 0, kindText = null, silent = false } = {}) => {
  if (diceAnimBusy) return;
  diceAnimBusy = true;

  const S = clampInt(sides, 2, 100, 20);
  const C = clampInt(count, 1, 20, 1);
  const B = Number(bonus) || 0;

  // ÑÑÐ¾Ð±Ñ UI Ð¿Ð°Ð½ÐµÐ»Ð¸ ÑÐ¾Ð¾ÑÐ²ÐµÑÑÑÐ²Ð¾Ð²Ð°Ð» Ð±ÑÐ¾ÑÐºÑ
  if (dice) dice.value = String(S);
  if (diceCountInput) diceCountInput.value = String(C);

  clearCritUI();

  const finals = Array.from({ length: C }, () => rollDie(S));
  const shown = Array.from({ length: C }, () => null);

  renderRollChips(shown, 0, S);

  if (diceVizKind) diceVizKind.textContent = kindText ? String(kindText) : `d${S} Ã ${C}`;
  if (diceVizValue) diceVizValue.textContent = "â¦";

  for (let i = 0; i < C; i++) {
    renderRollChips(shown, i, S);
    await animateSingleRoll(S, finals[i]);
    shown[i] = finals[i];
    renderRollChips(shown, Math.min(i + 1, C - 1), S);
  }

  const sum = finals.reduce((a, b) => a + b, 0);
  const total = sum + B;

// ÐÐ¾ÐºÐ°Ð· Ð·Ð½Ð°ÑÐµÐ½Ð¸Ñ
if (diceVizValue) diceVizValue.textContent = String(total);
renderRollChips(shown, -1, S);

// â ÐºÑÐ¸Ñ-Ð¿Ð¾Ð´ÑÐ²ÐµÑÐºÐ° Ð¢ÐÐÐ¬ÐÐ Ð´Ð»Ñ ÑÐ¸ÑÑÐ¾Ð³Ð¾ d20 (Ð±ÐµÐ· Ð±Ð¾Ð½ÑÑÐ°)
let critNote = "";
if (S === 20 && C === 1 && B === 0) {
  critNote = applyPureD20CritUI(finals[0]);
} else {
  clearCritUI();
}

  // Ð² Ð»Ð¾Ð³ â ÑÐ¾Ð¶Ðµ Ð¾ÑÐ¿ÑÐ°Ð²Ð¸Ð¼ (ÐµÑÐ»Ð¸ Ð½Ðµ silent)
  if (!silent) {
    try {
      if (typeof sendMessage === "function") {
        const bonusTxt = B ? ` ${B >= 0 ? "+" : "-"} ${Math.abs(B)}` : "";
        sendMessage({
          type: 'log',
          text: `${kindText || `ÐÑÐ¾ÑÐ¾Ðº d${S} Ã ${C}`}: ${finals.join(' + ')} = ${sum}${bonusTxt} => ${total}${critNote}`
        });

        sendMessage({
          type: "diceEvent",
          event: {
            kindText: kindText ? String(kindText) : `d${S} Ã ${C}`,
            sides: S,
            count: C,
            bonus: B,
            rolls: finals,
            total: total,
            crit: (S === 20 && C === 1 && B === 0)
              ? (finals[0] === 1 ? "crit-fail" : finals[0] === 20 ? "crit-success" : "")
              : ""
          }
        });
      }
    } catch {}
  }

  diceAnimBusy = false;

  return { sides: S, count: C, bonus: B, rolls: finals, sum, total };
};

// ================== DICE (from the bottom-left panel) ==================
rollBtn?.addEventListener('click', async () => {
  if (diceAnimBusy) return;
  diceAnimBusy = true;
  rollBtn.disabled = true;

  const sides = clampInt(dice?.value, 2, 100, 20);
  const count = clampInt(diceCountInput?.value, 1, 20, 1);

  clearCritUI();

  // ÐÑÐ¾Ð³Ð¾Ð²ÑÐµ Ð·Ð½Ð°ÑÐµÐ½Ð¸Ñ Ð·Ð°ÑÐ°Ð½ÐµÐµ
  const finals = Array.from({ length: count }, () => rollDie(sides));
  const shown = Array.from({ length: count }, () => null);

  renderRollChips(shown, 0, sides);

  if (diceVizKind) diceVizKind.textContent = `d${sides} Ã ${count}`;
  if (diceVizValue) diceVizValue.textContent = "â¦";

  // ÐÐ½Ð¸Ð¼Ð°ÑÐ¸Ñ: Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¼Ñ ÐºÑÐ±Ð¸ÐºÑ (Ð²Ð¸Ð´Ð½Ð¾ Ð¿ÑÐ¾ÑÐµÑÑ)
  for (let i = 0; i < count; i++) {
    renderRollChips(shown, i, sides);
    await animateSingleRoll(sides, finals[i]);
    shown[i] = finals[i];
    renderRollChips(shown, Math.min(i + 1, count - 1), sides);
  }

const sum = finals.reduce((a, b) => a + b, 0);

// Ð±ÐµÐ· "Ð ÐµÐ·ÑÐ»ÑÑÐ°Ñ:" â ÑÐ¾Ð»ÑÐºÐ¾ ÑÐ¸ÑÐ»Ð¾
if (diceVizValue) diceVizValue.textContent = String(sum);

renderRollChips(shown, -1, sides);

// â ÐºÑÐ¸Ñ-Ð¿Ð¾Ð´ÑÐ²ÐµÑÐºÐ° Ð¢ÐÐÐ¬ÐÐ Ð´Ð»Ñ ÑÐ¸ÑÑÐ¾Ð³Ð¾ d20
let critNote = "";
if (sides === 20 && count === 1) {
  critNote = applyPureD20CritUI(finals[0]);
} else {
  clearCritUI();
}

sendMessage({
  type: 'log',
  text: `ÐÑÐ¾ÑÐ¾Ðº d${sides} Ã ${count}: ${finals.join(' + ')} = ${sum}${critNote}`
});

  sendMessage({
  type: "diceEvent",
  event: {
    kindText: `d${sides} Ã ${count}`,
    sides,
    count,
    bonus: 0,
    rolls: finals,
    total: sum,
    crit: (sides === 20 && count === 1)
      ? (finals[0] === 1 ? "crit-fail" : finals[0] === 20 ? "crit-success" : "")
      : ""
  }
});

  diceAnimBusy = false;
  rollBtn.disabled = false;
});

// ================== END TURN ==================
endTurnBtn?.addEventListener('click', () => sendMessage({ type: 'endTurn' }));

// ================== INITIATIVE ==================
rollInitiativeBtn.addEventListener('click', async () => {
  // ÐÐ½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ð° ÑÑÐ¸ÑÐ°ÐµÑÑÑ Ð½Ð° ÑÐµÑÐ²ÐµÑÐµ (d20 + Ð¼Ð¾Ð´Ð¸ÑÐ¸ÐºÐ°ÑÐ¾Ñ ÐÐ¾Ð²ÐºÐ¾ÑÑÐ¸).
  // Ð¡ÐµÑÐ²ÐµÑ ÑÐ°ÑÑÑÐ»Ð°ÐµÑ diceEvent â Ð¼Ñ Ð¿Ð¾ÐºÐ°Ð¶ÐµÐ¼ ÐµÐ³Ð¾ Ñ ÑÐµÐ±Ñ Ð² Ð¿Ð°Ð½ÐµÐ»Ð¸ Ð¸ Ñ Ð´ÑÑÐ³Ð¸Ñ Ð² "ÐÑÐ¾ÑÐºÐ¸ Ð´ÑÑÐ³Ð¸Ñ".
  // UX: ÑÑÐ°Ð·Ñ Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ Ð²Ð¸Ð·ÑÐ°Ð»ÑÐ½ÑÑ "Ð·Ð°Ð³Ð»ÑÑÐºÑ" Ð² Ð¿Ð°Ð½ÐµÐ»Ð¸ Ð±ÑÐ¾ÑÐºÐ°, ÑÑÐ¾Ð±Ñ Ð´ÐµÐ¹ÑÑÐ²Ð¸Ðµ Ð±ÑÐ»Ð¾ Ð²Ð¸Ð´Ð½Ð¾ Ð¼Ð³Ð½Ð¾Ð²ÐµÐ½Ð½Ð¾.
  clearCritUI();
  renderRollChips([null], -1, 20);
  if (diceVizKind) diceVizKind.textContent = 'ÐÐ½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ð°: d20';
  if (diceVizValue) diceVizValue.textContent = 'â¦';
  sendMessage({ type: 'rollInitiative' });
});

// ================== WALLS ==================
editEnvBtn.addEventListener('click', () => {
  editEnvironment = !editEnvironment;
  addWallBtn.disabled = !editEnvironment;
  removeWallBtn.disabled = !editEnvironment;
  wallMode = null;
  editEnvBtn.textContent = editEnvironment ? "Ð ÐµÐ´Ð°ÐºÑÐ¸ÑÐ¾Ð²Ð°Ð½Ð¸Ðµ: ÐÐÐ" : "Ð ÐµÐ´Ð°ÐºÑÐ¸ÑÐ¾Ð²Ð°Ð½Ð¸Ðµ: ÐÐ«ÐÐ";
});

addWallBtn.addEventListener('click', () => wallMode = 'add');
removeWallBtn.addEventListener('click', () => wallMode = 'remove');

board.addEventListener('mousedown', e => {
  if (!editEnvironment || !wallMode) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  mouseDown = true;
  toggleWall(cell);
});

board.addEventListener('mouseover', e => {
  if (!mouseDown || !editEnvironment || !wallMode) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  toggleWall(cell);
});

board.addEventListener('mouseup', () => { mouseDown = false; });

function toggleWall(cell) {
  if (!cell) return;
  const x = +cell.dataset.x, y = +cell.dataset.y;
  if (wallMode === 'add') {
    sendMessage({ type: 'addWall', wall: { x, y } });
    cell.classList.add('wall');
  } else if (wallMode === 'remove') {
    sendMessage({ type: 'removeWall', wall: { x, y } });
    cell.classList.remove('wall');
  }
}

// ================== CREATE BOARD ==================
createBoardBtn.addEventListener('click', () => {
  const width = parseInt(boardWidthInput.value, 10);
  const height = parseInt(boardHeightInput.value, 10);
  if (isNaN(width) || isNaN(height) || width < 1 || height < 1 || width > 20 || height > 20)
    return alert("ÐÐ²ÐµÐ´Ð¸ÑÐµ ÐºÐ¾ÑÑÐµÐºÑÐ½ÑÐµ ÑÐ°Ð·Ð¼ÐµÑÑ Ð¿Ð¾Ð»Ñ (1â20)");
  sendMessage({ type: 'resizeBoard', width, height });
});

// ================== RESET GAME ==================
resetGameBtn.addEventListener('click', () => {
  playerElements.forEach(el => el.remove());
  playerElements.clear();
  sendMessage({ type: 'resetGame' });
});

// ================== CLEAR BOARD ==================
clearBoardBtn.addEventListener('click', () => {
  sendMessage({ type: 'clearBoard' });
});

// ================== HELPER ==================
function deepClone(obj) {
  try { return structuredClone(obj); } catch {}
  return JSON.parse(JSON.stringify(obj || null));
}

function createInitialGameState() {
  return {
    boardWidth: 10,
    boardHeight: 10,
    phase: "lobby",
    players: [],
    walls: [],
    turnOrder: [],
    currentTurnIndex: 0,
    log: []
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function isAreaFree(state, ignorePlayerId, x, y, size) {
  const walls = Array.isArray(state.walls) ? state.walls : [];
  // walls block only the top-left cell of a token (as in server)
  if (walls.some(w => w && w.x === x && w.y === y)) return false;

  const players = Array.isArray(state.players) ? state.players : [];
  for (const p of players) {
    if (!p || p.id === ignorePlayerId) continue;
    if (p.x === null || p.y === null) continue;
    const ps = Number(p.size) || 1;

    // AABB intersect
    const inter = !(x + size <= p.x || p.x + ps <= x || y + size <= p.y || p.y + ps <= y);
    if (inter) return false;
  }
  return true;
}

function autoPlacePlayers(state) {
  const players = Array.isArray(state.players) ? state.players : [];
  for (const p of players) {
    if (!p) continue;
    if (p.x !== null && p.y !== null) continue;
    const size = Number(p.size) || 1;
    let placed = false;
    for (let y = 0; y <= state.boardHeight - size && !placed; y++) {
      for (let x = 0; x <= state.boardWidth - size && !placed; x++) {
        if (isAreaFree(state, p.id, x, y, size)) {
          p.x = x;
          p.y = y;
          placed = true;
        }
      }
    }
    if (!placed) {
      // fallback
      p.x = 0;
      p.y = 0;
    }
  }
}

function getDexMod(player) {
  try {
    const dex = player?.sheet?.parsed?.stats?.dex?.value;
    const n = Number(dex);
    if (!Number.isFinite(n)) return 0;
    return Math.floor((n - 10) / 2);
  } catch {
    return 0;
  }
}

function logEventToState(state, text) {
  if (!text) return;
  if (!Array.isArray(state.log)) state.log = [];
  state.log.push(String(text));
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

async function ensureSupabaseReady() {
  if (!sbClient) {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      throw new Error("Supabase Ð½Ðµ Ð½Ð°ÑÑÑÐ¾ÐµÐ½");
    }
    sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return sbClient;
}

async function upsertRoomState(roomId, nextState) {
  await ensureSupabaseReady();
  const payload = {
    room_id: roomId,
    phase: String(nextState?.phase || "lobby"),
    current_actor_id: nextState?.turnOrder?.[nextState?.currentTurnIndex] ?? null,
    state: nextState,
    updated_at: new Date().toISOString()
  };
  const { error } = await sbClient.from("room_state").upsert(payload);
  if (error) throw error;
}

async function subscribeRoomDb(roomId) {
  await ensureSupabaseReady();
  if (roomDbChannel) {
    try { await roomDbChannel.unsubscribe(); } catch {}
    roomDbChannel = null;
  }
  roomDbChannel = sbClient
    .channel(`db-room_state-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_state", filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new;
        if (row && row.state) {
          handleMessage({ type: "state", state: row.state });
        }
      }
    );
  await roomDbChannel.subscribe();

  // Optional: broadcast channel (dice events)
  if (roomChannel) {
    try { await roomChannel.unsubscribe(); } catch {}
    roomChannel = null;
  }
  roomChannel = sbClient
    .channel(`room:${roomId}`)
    .on("broadcast", { event: "diceEvent" }, ({ payload }) => {
      if (payload && payload.event) handleMessage({ type: "diceEvent", event: payload.event });
    });
  await roomChannel.subscribe();
}


let roomMembersDbChannel = null;

async function refreshRoomMembers(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return;

  const { data, error } = await sbClient
    .from("room_members")
    .select("user_id,name,role")
    .eq("room_id", roomId);

  if (error) {
    console.error("room_members load error", error);
    return;
  }

  usersById.clear();
  (data || []).forEach((m) => {
    const uid = String(m.user_id || "");
    if (!uid) return;
    usersById.set(uid, {
      name: m.name || "Unknown",
      role: normalizeRoleForUi(m.role)
    });
  });

  updatePlayerList();
}

async function subscribeRoomMembersDb(roomId) {
  await ensureSupabaseReady();
  if (roomMembersDbChannel) {
    try { await roomMembersDbChannel.unsubscribe(); } catch {}
    roomMembersDbChannel = null;
  }
  roomMembersDbChannel = sbClient
    .channel(`db-room_members-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
      () => refreshRoomMembers(roomId)
    );

  await roomMembersDbChannel.subscribe();
}

async function sendMessage(msg) {
  try {
    await ensureSupabaseReady();
    if (!msg || typeof msg !== "object") return;

    switch (msg.type) {
      // ===== Rooms =====
      case "listRooms": {
        const { data, error } = await sbClient
          .from("rooms")
          .select("id,name,scenario,created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        handleMessage({ type: "rooms", rooms: data || [] });
        break;
      }

      case "createRoom": {
        const roomId = (crypto?.randomUUID ? crypto.randomUUID() : ("r-" + Math.random().toString(16).slice(2)));
        const name = String(msg.name || "ÐÐ¾Ð¼Ð½Ð°ÑÐ°").trim() || "ÐÐ¾Ð¼Ð½Ð°ÑÐ°";
        const scenario = String(msg.scenario || "");
        const { error: e1 } = await sbClient.from("rooms").insert({ id: roomId, name, scenario });
        if (e1) throw e1;

        const initState = createInitialGameState();
        const { error: e2 } = await sbClient.from("room_state").insert({
          room_id: roomId,
          phase: initState.phase,
          current_actor_id: null,
          state: initState
        });
        if (e2) throw e2;

        // refresh list
        await sendMessage({ type: "listRooms" });
        break;
      }

      case "joinRoom": {
        const roomId = String(msg.roomId || "");
        if (!roomId) return;

        const { data: room, error: er } = await sbClient.from("rooms").select("*").eq("id", roomId).single();
        if (er) throw er;

        // ===== Enforce roles: register membership + prevent multiple GMs =====
        const userId = String(localStorage.getItem("dnd_user_id") || myId || "");
        const role = String(localStorage.getItem("dnd_user_role") || myRole || "");
        const uname = String(localStorage.getItem("dnd_user_name") || "");
        if (userId && role) {
          const { error: mErr } = await sbClient.from("room_members").upsert({
            room_id: roomId,
            user_id: userId,
            name: uname || String(myNameSpan?.textContent || "").replace(/^\s*ÐÑ:\s*/i, "") || "Player",
            role: normalizeRoleForDb(role)
          });
          if (mErr) {
            // Unique violation (second GM) => Postgres code 23505
            if (role === "GM" && (mErr.code === "23505" || String(mErr.message || "").includes("uq_one_gm_per_room"))) {
              handleMessage({ type: "roomsError", message: "GM ÑÐ¶Ðµ Ð² ÐºÐ¾Ð¼Ð½Ð°ÑÐµ" });
              return;
            }
            throw mErr;
          }
        }

        currentRoomId = roomId;
        handleMessage({ type: "joinedRoom", room });

        // ensure room_state exists
        let { data: rs, error: ers } = await sbClient.from("room_state").select("*").eq("room_id", roomId).maybeSingle();
        if (ers) throw ers;
        if (!rs) {
          const initState = createInitialGameState();
          await sbClient.from("room_state").insert({ room_id: roomId, phase: initState.phase, current_actor_id: null, state: initState });
          rs = { state: initState };
        }

        await subscribeRoomDb(roomId);
        await refreshRoomMembers(roomId);
        await subscribeRoomMembersDb(roomId);
        handleMessage({ type: "state", state: rs.state });
        break;
      }

      // ===== Dice live events =====
      case "diceEvent": {
        if (!currentRoomId || !roomChannel) return;
        await roomChannel.send({
          type: "broadcast",
          event: "diceEvent",
          payload: { event: msg.event }
        });
        // also apply to self instantly
        if (msg.event) handleMessage({ type: "diceEvent", event: msg.event });
        break;
      }

      // ===== Saved bases (characters) =====
      case "listSavedBases": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const { data, error } = await sbClient
          .from("characters")
          .select("id,name,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        handleMessage({ type: "savedBasesList", list: (data || []).map(x => ({ id: x.id, name: x.name, updatedAt: x.updated_at })) });
        break;
      }

      case "saveSavedBase": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const sheet = msg.sheet;
        const name = String(sheet?.parsed?.name?.value ?? sheet?.parsed?.name ?? sheet?.parsed?.profile?.name ?? "ÐÐµÑÑÐ¾Ð½Ð°Ð¶").trim() || "ÐÐµÑÑÐ¾Ð½Ð°Ð¶";
        const { data, error } = await sbClient
          .from("characters")
          .insert({
            user_id: userId,
            name,
            state: { schemaVersion: 1, savedAt: new Date().toISOString(), data: sheet },
            updated_at: new Date().toISOString()
          })
          .select("id");
        if (error) throw error;
        handleMessage({ type: "savedBaseSaved", id: data?.[0]?.id, name });
        break;
      }

      case "deleteSavedBase": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const savedId = String(msg.savedId || "");
        if (!savedId) return;
        const { error } = await sbClient.from("characters").delete().eq("id", savedId).eq("user_id", userId);
        if (error) throw error;
        handleMessage({ type: "savedBaseDeleted", savedId });
        break;
      }

      case "applySavedBase": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const savedId = String(msg.savedId || "");
        if (!currentRoomId || !lastState) return;
        const { data, error } = await sbClient.from("characters").select("state").eq("id", savedId).eq("user_id", userId).single();
        if (error) throw error;
        const savedSheet = data?.state?.data;
        if (!savedSheet) throw new Error("ÐÑÑÑÐ¾Ð¹ ÑÐ°Ð¹Ð» Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶Ð°");

        const next = deepClone(lastState);
        const p = (next.players || []).find(pl => pl.id === msg.playerId);
        if (!p || !p.isBase) {
          handleMessage({ type: "error", message: "ÐÐ°Ð³ÑÑÐ¶Ð°ÑÑ Ð¼Ð¾Ð¶Ð½Ð¾ ÑÐ¾Ð»ÑÐºÐ¾ Ð² Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶Ð° 'ÐÑÐ½Ð¾Ð²Ð°'." });
          return;
        }
        p.sheet = deepClone(savedSheet);
        try {
          const parsed = p.sheet?.parsed;
          const nextName = parsed?.name?.value ?? parsed?.name;
          if (typeof nextName === "string" && nextName.trim()) p.name = nextName.trim();
        } catch {}

        await upsertRoomState(currentRoomId, next);
        handleMessage({ type: "savedBaseApplied", playerId: p.id, savedId });
        break;
      }

      case "setPlayerSheet": {
  if (!currentRoomId) return;
  if (!lastState) return;

  const next = deepClone(lastState);
  const isGm = (String(myRole || "") === "GM");
  const myUserId = String(localStorage.getItem("dnd_user_id") || "");

  const p = (next.players || []).find(pl => pl.id === msg.id);
  if (!p) return;

  const owns = (pl) => pl && String(pl.ownerId) === myUserId;
  if (!isGm && !owns(p)) return;

  p.sheet = deepClone(msg.sheet);

  // ÑÐ¸Ð½ÑÑÐ¾Ð½Ð¸Ð·Ð¸ÑÑÐµÐ¼ Ð¸Ð¼Ñ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶Ð° Ð¸Ð· sheet (ÐµÑÐ»Ð¸ ÐµÑÑÑ)
  try {
    const parsed = p.sheet?.parsed;
    const nextName = parsed?.name?.value ?? parsed?.name;
    if (typeof nextName === "string" && nextName.trim()) p.name = nextName.trim();
  } catch {}

  await upsertRoomState(currentRoomId, next);
  break;
}

// ===== Game logic (DB truth via room_state.state) =====
      default: {
        if (!currentRoomId) return;
        if (!lastState) return;

        const next = deepClone(lastState);
        const isGM = (String(myRole || "") === "GM");
        const myUserId = String(localStorage.getItem("dnd_user_id") || "");

        const ownsPlayer = (pl) => pl && String(pl.ownerId) === myUserId;

        const type = msg.type;

        if (type === "resizeBoard") {
          if (!isGM) return;
          next.boardWidth = msg.width;
          next.boardHeight = msg.height;
          logEventToState(next, "ÐÐ¾Ð»Ðµ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¾");
        }

        else if (type === "startInitiative") {
          if (!isGM) return;
          next.phase = "initiative";
          (next.players || []).forEach(p => {
            p.initiative = null;
            p.hasRolledInitiative = false;
          });
          logEventToState(next, "GM Ð½Ð°ÑÐ°Ð» ÑÐ°Ð·Ñ Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ñ");
        }

        else if (type === "startExploration") {
          if (!isGM) return;
          next.phase = "exploration";
          logEventToState(next, "GM Ð½Ð°ÑÐ°Ð» ÑÐ°Ð·Ñ Ð¸ÑÑÐ»ÐµÐ´Ð¾Ð²Ð°Ð½Ð¸Ñ");
        }

        else if (type === "addPlayer") {
          const player = msg.player || {};
          const isBase = !!player.isBase;
          if (isBase) {
            const exists = (next.players || []).some(p => p.isBase && p.ownerId === myUserId);
            if (exists) {
              handleMessage({ type: "error", message: "Ð£ Ð²Ð°Ñ ÑÐ¶Ðµ ÐµÑÑÑ ÐÑÐ½Ð¾Ð²Ð°. ÐÐ¾Ð¶Ð½Ð¾ Ð¸Ð¼ÐµÑÑ ÑÐ¾Ð»ÑÐºÐ¾ Ð¾Ð´Ð½Ñ Ð¾ÑÐ½Ð¾Ð²Ñ Ð½Ð° Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ." });
              return;
            }
          }
          const id = player.id || (crypto?.randomUUID ? crypto.randomUUID() : ("p-" + Math.random().toString(16).slice(2)));
          next.players.push({
            id,
            name: player.name,
            color: player.color,
            size: player.size,
            x: null,
            y: null,
            initiative: 0,
            hasRolledInitiative: false,
            pendingInitiativeChoice: (next.phase === "combat"),
            willJoinNextRound: false,
            isBase,
            ownerId: myUserId,
            ownerName: myNameSpan?.textContent || "",
            sheet: player.sheet || { parsed: { name: { value: player.name } } }
          });
          logEventToState(next, `ÐÐ¾Ð±Ð°Ð²Ð»ÐµÐ½ Ð¸Ð³ÑÐ¾Ðº ${player.name}`);
        }

        else if (type === "movePlayer") {
          const p = (next.players || []).find(pp => pp.id === msg.id);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;

          if (next.phase === "combat" && !isGM) {
            const currentId = next.turnOrder?.[next.currentTurnIndex];
            const notPlacedYet = (p.x === null || p.y === null);
            if (p.id !== currentId && !notPlacedYet) return;
          }

          const size = Number(p.size) || 1;
          const maxX = next.boardWidth - size;
          const maxY = next.boardHeight - size;
          const nx = clamp(Number(msg.x) || 0, 0, maxX);
          const ny = clamp(Number(msg.y) || 0, 0, maxY);

          if (!isAreaFree(next, p.id, nx, ny, size)) {
            handleMessage({ type: "error", message: "Ð­ÑÐ° ÐºÐ»ÐµÑÐºÐ° Ð·Ð°Ð½ÑÑÐ° Ð´ÑÑÐ³Ð¸Ð¼ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶ÐµÐ¼" });
            return;
          }

          p.x = nx;
          p.y = ny;
          logEventToState(next, `${p.name} Ð¿ÐµÑÐµÐ¼ÐµÑÐµÐ½ Ð² (${p.x},${p.y})`);
        }

        else if (type === "updatePlayerSize") {
          const p = (next.players || []).find(pp => pp.id === msg.id);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          const newSize = parseInt(msg.size, 10);
          if (!Number.isFinite(newSize) || newSize < 1 || newSize > 5) return;

          if (p.x !== null && p.y !== null) {
            const maxX = next.boardWidth - newSize;
            const maxY = next.boardHeight - newSize;
            const nx = clamp(p.x, 0, maxX);
            const ny = clamp(p.y, 0, maxY);
            if (!isAreaFree(next, p.id, nx, ny, newSize)) {
              handleMessage({ type: "error", message: "ÐÐµÐ»ÑÐ·Ñ ÑÐ²ÐµÐ»Ð¸ÑÐ¸ÑÑ ÑÐ°Ð·Ð¼ÐµÑ: Ð¼ÐµÑÑÐ¾ Ð·Ð°Ð½ÑÑÐ¾" });
              return;
            }
            p.x = nx;
            p.y = ny;
          }
          p.size = newSize;
          logEventToState(next, `${p.name} Ð¸Ð·Ð¼ÐµÐ½Ð¸Ð» ÑÐ°Ð·Ð¼ÐµÑ Ð½Ð° ${p.size}x${p.size}`);
        }

        else if (type === "removePlayerFromBoard") {
          const p = (next.players || []).find(pp => pp.id === msg.id);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          p.x = null;
          p.y = null;
          logEventToState(next, `${p.name} ÑÐ´Ð°Ð»ÐµÐ½ Ñ Ð¿Ð¾Ð»Ñ`);
        }

        else if (type === "removePlayerCompletely") {
          const p = (next.players || []).find(pp => pp.id === msg.id);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          next.players = (next.players || []).filter(pl => pl.id !== msg.id);
          next.turnOrder = (next.turnOrder || []).filter(id => id !== msg.id);
          logEventToState(next, `ÐÐ³ÑÐ¾Ðº ${p.name} Ð¿Ð¾Ð»Ð½Ð¾ÑÑÑÑ ÑÐ´Ð°Ð»ÐµÐ½`);
        }

        else if (type === "addWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          if (!(next.walls || []).find(x => x.x === w.x && x.y === w.y)) {
            next.walls.push({ x: w.x, y: w.y });
            logEventToState(next, `Ð¡ÑÐµÐ½Ð° Ð´Ð¾Ð±Ð°Ð²Ð»ÐµÐ½Ð° (${w.x},${w.y})`);
          }
        }

        else if (type === "removeWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          next.walls = (next.walls || []).filter(x => !(x.x === w.x && x.y === w.y));
          logEventToState(next, `Ð¡ÑÐµÐ½Ð° ÑÐ´Ð°Ð»ÐµÐ½Ð° (${w.x},${w.y})`);
        }

        else if (type === "rollInitiative") {
          if (next.phase !== "initiative") return;
          (next.players || [])
            .filter(p => p.ownerId === myUserId && !p.hasRolledInitiative)
            .forEach(p => {
              const roll = Math.floor(Math.random() * 20) + 1;
              const dexMod = getDexMod(p);
              const total = roll + dexMod;
              p.initiative = total;
              p.hasRolledInitiative = true;

              // live dice event
              sendMessage({
                type: "diceEvent",
                event: {
                  fromId: myUserId,
                  fromName: p.name,
                  kindText: `ÐÐ½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ð°: d20${dexMod >= 0 ? "+" : ""}${dexMod}`,
                  sides: 20,
                  count: 1,
                  bonus: dexMod,
                  rolls: [roll],
                  total,
                  crit: ""
                }
              });
              const sign = dexMod >= 0 ? "+" : "";
              logEventToState(next, `${p.name} Ð±ÑÐ¾ÑÐ¸Ð» Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ñ: ${roll}${sign}${dexMod} = ${total}`);
            });
        }

        else if (type === "startCombat") {
          if (!isGM) return;
          if (next.phase !== "initiative" && next.phase !== "placement" && next.phase !== "exploration") return;
          const allRolled = (next.players || []).length ? next.players.every(p => p.hasRolledInitiative) : false;
          if (!allRolled) {
            handleMessage({ type: "error", message: "Ð¡Ð½Ð°ÑÐ°Ð»Ð° Ð±ÑÐ¾ÑÑÑÐµ Ð¸Ð½Ð¸ÑÐ¸Ð°ÑÐ¸Ð²Ñ Ð·Ð° Ð²ÑÐµÑ Ð¿ÐµÑÑÐ¾Ð½Ð°Ð¶ÐµÐ¹" });
            return;
          }
          next.turnOrder = [...(next.players || [])]
            .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
            .map(p => p.id);
          autoPlacePlayers(next);
          next.phase = "combat";
          next.currentTurnIndex = 0;
          const firstId = next.turnOrder[0];
          const first = (next.players || []).find(p => p.id === firstId);
          logEventToState(next, `ÐÐ¾Ð¹ Ð½Ð°ÑÐ°Ð»ÑÑ. ÐÐµÑÐ²ÑÐ¹ ÑÐ¾Ð´: ${first?.name || '-'}`);
        }

        else if (type === "endTurn") {
          if (next.phase !== "combat") return;
          if (!Array.isArray(next.turnOrder) || next.turnOrder.length === 0) return;
          const currentId = next.turnOrder[next.currentTurnIndex];
          const current = (next.players || []).find(p => p.id === currentId);
          const canEnd = isGM || (current && ownsPlayer(current));
          if (!canEnd) return;

          const prevIndex = next.currentTurnIndex;
          const nextIndex = (next.currentTurnIndex + 1) % next.turnOrder.length;
          const wrapped = (prevIndex === next.turnOrder.length - 1 && nextIndex === 0);
          if (wrapped) {
            const toJoin = (next.players || []).filter(p => p && p.willJoinNextRound);
            if (toJoin.length) {
              toJoin.forEach(p => { p.willJoinNextRound = false; });
              next.turnOrder = [...new Set(
                [...next.players]
                  .filter(p => p && (p.initiative !== null && p.initiative !== undefined))
                  .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
                  .map(p => p.id)
              )];
            }
          }
          next.currentTurnIndex = wrapped ? 0 : nextIndex;
          const nid = next.turnOrder[next.currentTurnIndex];
          const np = (next.players || []).find(p => p.id === nid);
          logEventToState(next, `Ð¥Ð¾Ð´ Ð¸Ð³ÑÐ¾ÐºÐ° ${np?.name || '-'}`);
        }

        else if (type === "resetGame") {
          if (!isGM) return;
          next.players = [];
          next.walls = [];
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.log = ["ÐÐ³ÑÐ° Ð¿Ð¾Ð»Ð½Ð¾ÑÑÑÑ ÑÐ±ÑÐ¾ÑÐµÐ½Ð°"];
        }

        else if (type === "clearBoard") {
          if (!isGM) return;
          (next.players || []).forEach(p => { p.x = null; p.y = null; });
          next.walls = [];
          logEventToState(next, "ÐÐ¾Ð»Ðµ Ð¾ÑÐ¸ÑÐµÐ½Ð¾");
        }

        else {
          // unknown message type (ignored)
          return;
        }

        await upsertRoomState(currentRoomId, next);
        break;
      }
    }
  } catch (e) {
    console.error(e);
    const text = String(e?.message || e || "ÐÑÐ¸Ð±ÐºÐ°");
    handleMessage({ type: "error", message: text });
  }
}

function updatePhaseUI(state) {
  const allRolled = state.players?.length
    ? state.players.every(p => p.hasRolledInitiative)
    : false;

  // ÑÐ±ÑÐ°ÑÑÐ²Ð°ÐµÐ¼ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐºÐ¸
  startExplorationBtn?.classList.remove('active', 'ready', 'pending');
  startInitiativeBtn?.classList.remove('active', 'ready', 'pending');
  startCombatBtn?.classList.remove('active', 'ready', 'pending');

  // ===== initiative roll button only in initiative phase
  if (state.phase === "initiative") {
    rollInitiativeBtn.style.display = "inline-block";
    rollInitiativeBtn.classList.add("is-active");
  } else {
    rollInitiativeBtn.style.display = "none";
    rollInitiativeBtn.classList.remove("is-active");
  }

  // ===== world phase buttons (GM only visually, but keep safe)
  if (state.phase === 'exploration') {
    startExplorationBtn?.classList.add('active');
    startCombatBtn.disabled = true;
  } else if (state.phase === 'initiative') {
    startInitiativeBtn?.classList.add(allRolled ? 'ready' : 'active');

    // Ð±Ð¾Ð¹ Ð¼Ð¾Ð¶Ð½Ð¾ Ð½Ð°ÑÐ°ÑÑ ÑÐ¾Ð»ÑÐºÐ¾ ÐºÐ¾Ð³Ð´Ð° Ð²ÑÐµ Ð±ÑÐ¾ÑÐ¸Ð»Ð¸
    startCombatBtn.disabled = !allRolled;
    startCombatBtn.classList.add(allRolled ? 'pending' : 'active');
  } else if (state.phase === 'combat') {
    startCombatBtn.disabled = false;
    startCombatBtn.classList.add('ready');
  } else {
    // lobby or other
    startCombatBtn.disabled = true;
  }

  updateCurrentPlayer(state);
}







// ================== ROOMS LOBBY UI ==================
function renderRooms(rooms) {
  if (!roomsList) return;
  roomsError.textContent = '';
  roomsList.innerHTML = '';

  if (!rooms.length) {
    roomsList.textContent = 'ÐÐ¾Ð¼Ð½Ð°Ñ Ð¿Ð¾ÐºÐ° Ð½ÐµÑ.';
    return;
  }

  rooms.forEach(r => {
    const card = document.createElement('div');
    card.className = 'sheet-card';
    card.style.marginBottom = '10px';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'space-between';
    card.style.gap = '12px';

    const left = document.createElement('div');
    left.style.minWidth = '0';

    const title = document.createElement('div');
    title.style.fontWeight = '900';
    title.textContent = r.name;

    const meta = document.createElement('div');
    meta.style.fontSize = '12px';
    meta.style.color = '#aaa';
    meta.textContent =
      `ÐÐ¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»ÐµÐ¹: ${r.uniqueUsers} â¢ ÐÐ°ÑÐ¾Ð»Ñ: ${r.hasPassword ? 'Ð´Ð°' : 'Ð½ÐµÑ'}`
      + (r.scenario ? ` â¢ Ð¡ÑÐµÐ½Ð°ÑÐ¸Ð¹: ${r.scenario}` : '');

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';

    const joinBtn2 = document.createElement('button');
    joinBtn2.textContent = 'ÐÐ¾Ð¹ÑÐ¸';
    joinBtn2.onclick = () => {
      const pw = r.hasPassword ? prompt('ÐÐ°ÑÐ¾Ð»Ñ ÐºÐ¾Ð¼Ð½Ð°ÑÑ:') : '';
      sendMessage({ type: 'joinRoom', roomId: r.id, password: pw || '' });
    };

    right.appendChild(joinBtn2);
    card.appendChild(left);
    card.appendChild(right);

    roomsList.appendChild(card);
  });
}

function openCreateRoomModal() {
  roomNameInput.value = '';
  roomPasswordInput.value = '';
  roomScenarioInput.value = '';
  createRoomModal.classList.remove('hidden');
}

function closeCreateRoomModal() {
  createRoomModal.classList.add('hidden');
}

if (createRoomBtn) createRoomBtn.addEventListener('click', openCreateRoomModal);
if (createRoomClose) createRoomClose.addEventListener('click', closeCreateRoomModal);
if (createRoomCancel) createRoomCancel.addEventListener('click', closeCreateRoomModal);

if (createRoomSubmit) createRoomSubmit.addEventListener('click', () => {
  const name = roomNameInput.value.trim();
  const password = roomPasswordInput.value || '';
  const scenario = roomScenarioInput.value.trim();

  if (!name) {
    roomsError.textContent = 'ÐÐ²ÐµÐ´Ð¸ÑÐµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ ÐºÐ¾Ð¼Ð½Ð°ÑÑ';
    return;
  }

  sendMessage({ type: 'createRoom', name, password, scenario });
  closeCreateRoomModal();
});
