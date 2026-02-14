// ================== HELPER ==================

function deepClone(obj) {
  try { return structuredClone(obj); } catch {}
  return JSON.parse(JSON.stringify(obj || null));
}

function createInitialGameState() {
  const sectionId = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
  const mapId = (crypto?.randomUUID ? crypto.randomUUID() : ("map-" + Math.random().toString(16).slice(2)));
  const base = {
    id: mapId,
    name: "Карта 1",
    sectionId,
    boardWidth: 10,
    boardHeight: 10,
    boardBgDataUrl: null,
    gridAlpha: 1,
    wallAlpha: 1,
    walls: [],
    playersPos: {} // playerId -> {x,y}
  };
  return {
    schemaVersion: 3,

    mapSections: [{ id: sectionId, name: "Раздел 1" }],

    // Active map is mirrored into root-level fields for backward compatibility
    currentMapId: mapId,
    maps: [base],

    boardWidth: base.boardWidth,
    boardHeight: base.boardHeight,
    boardBgDataUrl: base.boardBgDataUrl,
    walls: base.walls,

    phase: "lobby",
    players: [],
    turnOrder: [],
    currentTurnIndex: 0,
    round: 1,
    log: []
  };
}

function ensureStateHasMaps(state) {
  if (!state || typeof state !== "object") return createInitialGameState();

  // already new schema
  if (Array.isArray(state.maps) && state.maps.length) {
    if (!state.currentMapId) state.currentMapId = String(state.maps[0].id || "map-1");
    // ensure sections exist
    if (!Array.isArray(state.mapSections) || !state.mapSections.length) {
      const sid = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
      state.mapSections = [{ id: sid, name: "Раздел 1" }];
      // attach all maps to that section
      state.maps.forEach(m => { if (m && !m.sectionId) m.sectionId = sid; });
    } else {
      const firstSid = String(state.mapSections[0]?.id || "");
      state.maps.forEach(m => { if (m && !m.sectionId) m.sectionId = firstSid; });
    }
    state.schemaVersion = Math.max(Number(state.schemaVersion) || 0, 3);
    return state;
  }

  // migrate old schema -> single map + single section
  const sectionId = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
  const mapId = (crypto?.randomUUID ? crypto.randomUUID() : ("map-" + Math.random().toString(16).slice(2)));
  const migratedMap = {
    id: mapId,
    name: "Карта 1",
    sectionId,
    boardWidth: Number(state.boardWidth) || 10,
    boardHeight: Number(state.boardHeight) || 10,
    boardBgDataUrl: state.boardBgDataUrl || null,
    gridAlpha: (typeof state.gridAlpha !== 'undefined') ? state.gridAlpha : 1,
    wallAlpha: (typeof state.wallAlpha !== 'undefined') ? state.wallAlpha : 1,
    walls: Array.isArray(state.walls) ? state.walls : [],
    playersPos: {}
  };

  (state.players || []).forEach((p) => {
    if (!p || !p.id) return;
    if (p.x === null || p.y === null || typeof p.x === "undefined" || typeof p.y === "undefined") return;
    migratedMap.playersPos[p.id] = { x: p.x, y: p.y };
  });

  state.schemaVersion = 3;
  state.mapSections = [{ id: sectionId, name: "Раздел 1" }];
  state.currentMapId = mapId;
  state.maps = [migratedMap];

  // keep root mirror
  state.boardWidth = migratedMap.boardWidth;
  state.boardHeight = migratedMap.boardHeight;
  state.boardBgDataUrl = migratedMap.boardBgDataUrl;
  state.gridAlpha = migratedMap.gridAlpha ?? 1;
  state.wallAlpha = migratedMap.wallAlpha ?? 1;
  state.walls = migratedMap.walls;

  return state;
}

function getActiveMap(state) {
  const st = ensureStateHasMaps(state);
  const id = String(st.currentMapId || "");
  const maps = Array.isArray(st.maps) ? st.maps : [];
  return maps.find(m => String(m.id) === id) || maps[0] || null;
}

function syncActiveToMap(state) {
  const st = ensureStateHasMaps(state);
  const m = getActiveMap(st);
  if (!m) return st;

  m.boardWidth = Number(st.boardWidth) || 10;
  m.boardHeight = Number(st.boardHeight) || 10;
  m.boardBgDataUrl = st.boardBgDataUrl || null;
  m.gridAlpha = (typeof st.gridAlpha !== 'undefined') ? st.gridAlpha : 1;
  m.wallAlpha = (typeof st.wallAlpha !== 'undefined') ? st.wallAlpha : 1;

  m.walls = Array.isArray(st.walls) ? st.walls : [];

  // capture positions from root players into map snapshot
  const pos = {};
  (st.players || []).forEach((p) => {
    if (!p || !p.id) return;
    if (p.x === null || p.y === null || typeof p.x === "undefined" || typeof p.y === "undefined") return;
    pos[p.id] = { x: p.x, y: p.y };
  });
  m.playersPos = pos;

  return st;
}

function loadMapToRoot(state, mapId) {
  const st = ensureStateHasMaps(state);
  const targetId = String(mapId || "");
  const maps = Array.isArray(st.maps) ? st.maps : [];
  const m = maps.find(mm => String(mm.id) === targetId) || maps[0];
  if (!m) return st;

  st.currentMapId = String(m.id);

  st.boardWidth = Number(m.boardWidth) || 10;
  st.boardHeight = Number(m.boardHeight) || 10;
  st.boardBgDataUrl = m.boardBgDataUrl || null;
  st.gridAlpha = (typeof m.gridAlpha !== 'undefined') ? m.gridAlpha : 1;
  st.wallAlpha = (typeof m.wallAlpha !== 'undefined') ? m.wallAlpha : 1;

  st.walls = Array.isArray(m.walls) ? m.walls : [];

  // apply stored positions for this map
  const pos = (m.playersPos && typeof m.playersPos === "object") ? m.playersPos : {};
  (st.players || []).forEach((p) => {
    if (!p || !p.id) return;
    const pp = pos[p.id];
    if (pp && Number.isFinite(Number(pp.x)) && Number.isFinite(Number(pp.y))) {
      p.x = Number(pp.x);
      p.y = Number(pp.y);
    } else {
      p.x = null;
      p.y = null;
    }
  });

  return st;
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
  // Ловкость хранится в листе персонажа (sheet.parsed.stats.dex)
  // Возможные поля: score / value / modifier / mod
  try {
    const dexObj = player?.sheet?.parsed?.stats?.dex;
    const modCandidate = Number(dexObj?.modifier ?? dexObj?.mod);
    if (Number.isFinite(modCandidate)) return modCandidate;

    const scoreCandidate = Number(dexObj?.score ?? dexObj?.value);
    if (!Number.isFinite(scoreCandidate)) return 0;
    return Math.floor((scoreCandidate - 10) / 2);
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
      throw new Error("Supabase не настроен");
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
    state: syncActiveToMap(nextState),
    updated_at: new Date().toISOString()
  };
  const { error } = await sbClient.from("room_state").upsert(payload);
  if (error) throw error;
}


// ===== Campaign saves (GM) =====
// Сохранения кампаний НЕ привязаны к комнате, а привязаны к "ключу владельца" (owner_key),
// который хранится в localStorage у ГМа. Тогда ГМ может зайти в любую комнату и загрузить кампанию.
async function listCampaignSavesByOwner(ownerKey) {
  await ensureSupabaseReady();
  const { data, error } = await sbClient
    .from('campaign_saves')
    .select('id,name,created_at')
    .eq('owner_key', ownerKey)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function createCampaignSave(ownerKey, name, state) {
  await ensureSupabaseReady();
  const { error } = await sbClient
    .from('campaign_saves')
    .insert({ owner_key: ownerKey, name, state });
  if (error) throw error;
}

async function getCampaignSaveState(saveId) {
  await ensureSupabaseReady();
  const { data, error } = await sbClient
    .from('campaign_saves')
    .select('state')
    .eq('id', saveId)
    .single();
  if (error) throw error;
  return data?.state || null;
}

async function deleteCampaignSave(saveId) {
  await ensureSupabaseReady();
  const { error } = await sbClient
    .from('campaign_saves')
    .delete()
    .eq('id', saveId);
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
        const name = String(msg.name || "Комната").trim() || "Комната";
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

        // ✅ Мягкая проверка до upsert (чтобы сразу показать текстовое предупреждение)
        if (role === "GM" && userId) {
          const { data: existingGm, error: gmErr } = await sbClient
            .from("room_members")
            .select("user_id")
            .eq("room_id", roomId)
            .eq("role", "GM")
            .limit(1);
          if (!gmErr && Array.isArray(existingGm) && existingGm.length) {
            const gmId = String(existingGm[0]?.user_id || "");
            if (gmId && gmId !== userId) {
              handleMessage({
                type: "roomsError",
                message: "В этой комнате уже присутствует GM. Вы не можете зайти как GM."
              });
              return;
            }
          }
        }
        if (userId && role) {
          const { error: mErr } = await sbClient.from("room_members").upsert({
            room_id: roomId,
            user_id: userId,
            name: safeGetUserName(),
            role: normalizeRoleForDb(role),
            last_seen: new Date().toISOString()
          });
          if (mErr) {
            // Unique violation (second GM) => Postgres code 23505
            if (role === "GM" && (mErr.code === "23505" || String(mErr.message || "").includes("uq_one_gm_per_room"))) {
              handleMessage({ type: "roomsError", message: "GM уже в комнате" });
              return;
            }
            throw mErr;
          }
        }

        currentRoomId = roomId;
        handleMessage({ type: "joinedRoom", room });


        startHeartbeat();
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

        // 1) Живое событие в "панели бросков" (видят все)
        await roomChannel.send({
          type: "broadcast",
          event: "diceEvent",
          payload: { event: msg.event }
        });

        // 2) Пишем в "Журнал действий" через room_state, чтобы это было видно всем
        try {
          const ev = msg.event || {};
          const who = String(ev.fromName || safeGetUserName() || "Игрок").trim() || "Игрок";
          const kind = String(ev.kindText || "").trim() || (ev.sides ? `d${ev.sides}` : "Бросок");
          const rolls = Array.isArray(ev.rolls) ? ev.rolls.map(n => Number(n) || 0) : [];
          const bonus = Number(ev.bonus) || 0;
          const bonusTxt = bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : "";
          const total = Number(ev.total);
          const totalTxt = Number.isFinite(total) ? ` = ${total}` : "";
          const critTxt = ev.crit === "crit-success" ? " (КРИТ)" : (ev.crit === "crit-fail" ? " (ПРОВАЛ)" : "");
          const rollsTxt = rolls.length ? rolls.join(",") : "";
          const body = rollsTxt ? `${rollsTxt}${bonusTxt}${totalTxt}` : (Number.isFinite(total) ? String(total) : "");
          const line = `${who}: ${kind}: ${body}${critTxt}`.trim();

          if (line && lastState) {
            const next = deepClone(lastState);
            logEventToState(next, line);
            await upsertRoomState(currentRoomId, next);
          }
        } catch {}

        // also apply to self instantly
        if (msg.event) handleMessage({ type: "diceEvent", event: msg.event });
        break;
      }

      // NOTE: do not add new switch cases below without care.
      // Some game mechanics (initiative/combat join) need to broadcast dice rolls
      // without writing to room_state (to avoid overwriting fresh state with lastState).

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
        const name = String(sheet?.parsed?.name?.value ?? sheet?.parsed?.name ?? sheet?.parsed?.profile?.name ?? "Персонаж").trim() || "Персонаж";
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
        if (!savedSheet) throw new Error("Пустой файл персонажа");

        const next = deepClone(lastState);
        const p = (next.players || []).find(pl => pl.id === msg.playerId);
        if (!p || !p.isBase) {
          handleMessage({ type: "error", message: "Загружать можно только в персонажа 'Основа'." });
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

  // синхронизируем имя персонажа из sheet (если есть)
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
        let handled = false;

        // ===== Campaign maps + sections (GM) =====
        if (type === "createMapSection") {
          if (!isGM) return;
          handled = true;
          const name = String(msg.name || "").trim();
          if (!name) return;
          if (!Array.isArray(next.mapSections)) next.mapSections = [];
          const id = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
          next.mapSections.push({ id, name });
          logEventToState(next, `Создан раздел: ${name}`);
        }

        else if (type === "renameMapSection") {
          if (!isGM) return;
          handled = true;
          const sectionId = String(msg.sectionId || "").trim();
          const name = String(msg.name || "").trim();
          if (!sectionId || !name) return;
          const sec = (next.mapSections || []).find(s => String(s?.id) === sectionId);
          if (!sec) return;
          const old = sec.name;
          sec.name = name;
          logEventToState(next, `Переименован раздел: ${old} → ${name}`);
        }

        else if (type === "deleteMapSection") {
          if (!isGM) return;
          handled = true;
          const sectionId = String(msg.sectionId || "").trim();
          if (!sectionId) return;
          const mode = String(msg.mode || "").toLowerCase(); // 'move' | 'delete'
          const targetSectionId = String(msg.targetSectionId || "").trim();

          if (!Array.isArray(next.mapSections)) next.mapSections = [];
          if (next.mapSections.length <= 1) {
            handleMessage({ type: "error", message: "Нельзя удалить последний раздел." });
            return;
          }

          const sec = next.mapSections.find(s => String(s?.id) === sectionId);
          if (!sec) return;
          const secName = String(sec.name || "Раздел");

          if (mode === "move") {
            if (!targetSectionId || targetSectionId === sectionId) return;
            (next.maps || []).forEach(m => {
              if (m && String(m.sectionId) === sectionId) m.sectionId = targetSectionId;
            });
            logEventToState(next, `Раздел удалён (карты перенесены): ${secName}`);
          } else {
            // delete maps in section
            const toDelete = new Set((next.maps || []).filter(m => m && String(m.sectionId) === sectionId).map(m => String(m.id)));
            next.maps = (next.maps || []).filter(m => m && !toDelete.has(String(m.id)));
            logEventToState(next, `Раздел удалён (карты удалены): ${secName}`);
          }

          next.mapSections = next.mapSections.filter(s => String(s?.id) !== sectionId);

          // if active map was deleted by section delete, ensure current map exists
          if (!next.maps || !next.maps.length) {
            const reset = createInitialGameState();
            next.mapSections = reset.mapSections;
            next.maps = reset.maps;
            next.currentMapId = reset.currentMapId;
            loadMapToRoot(next, next.currentMapId);
          } else {
            const activeExists = (next.maps || []).some(m => String(m?.id) === String(next.currentMapId));
            if (!activeExists) {
              const fallback = next.maps[0];
              syncActiveToMap(next);
              loadMapToRoot(next, String(fallback.id));
            }
          }
        }

        else if (type === "renameCampaignMap") {
          if (!isGM) return;
          handled = true;
          const mapId = String(msg.mapId || "").trim();
          const name = String(msg.name || "").trim();
          if (!mapId || !name) return;
          const m = (next.maps || []).find(mm => String(mm?.id) === mapId);
          if (!m) return;
          const old = m.name;
          m.name = name;
          logEventToState(next, `Переименована карта: ${old || "Карта"} → ${name}`);
        }

        else if (type === "moveCampaignMap") {
          if (!isGM) return;
          handled = true;
          const mapId = String(msg.mapId || "").trim();
          const toSectionId = String(msg.toSectionId || "").trim();
          if (!mapId || !toSectionId) return;
          const m = (next.maps || []).find(mm => String(mm?.id) === mapId);
          if (!m) return;
          const exists = (next.mapSections || []).some(s => String(s?.id) === toSectionId);
          if (!exists) return;
          const from = String(m.sectionId || "");
          if (from === toSectionId) return;
          m.sectionId = toSectionId;
          logEventToState(next, `Карта перенесена: ${m.name || "Карта"}`);
        }

        else if (type === "deleteCampaignMap") {
          if (!isGM) return;
          handled = true;
          const mapId = String(msg.mapId || "").trim();
          if (!mapId) return;

          // перед удалением — сохранить активную карту в snapshot
          syncActiveToMap(next);

          const m = (next.maps || []).find(mm => String(mm?.id) === mapId);
          const name = m?.name || "Карта";
          next.maps = (next.maps || []).filter(mm => String(mm?.id) !== mapId);
          logEventToState(next, `Удалена карта: ${name}`);

          if (!next.maps.length) {
            const reset = createInitialGameState();
            next.mapSections = reset.mapSections;
            next.maps = reset.maps;
            next.currentMapId = reset.currentMapId;
            loadMapToRoot(next, next.currentMapId);
          } else {
            const activeExists = (next.maps || []).some(mm => String(mm?.id) === String(next.currentMapId));
            if (!activeExists) {
              loadMapToRoot(next, String(next.maps[0].id));
            }
          }
        }

        else if (type === "createCampaignMap") {
          if (!isGM) return;
          handled = true;

          // сохранить текущую карту в snapshot
          syncActiveToMap(next);

          const newId = (crypto?.randomUUID ? crypto.randomUUID() : ("map-" + Math.random().toString(16).slice(2)));
          const n = Array.isArray(next.maps) ? next.maps.length + 1 : 1;
          const sectionId = String(msg.sectionId || "").trim() || String(next.mapSections?.[0]?.id || "");
          const safeSection = (next.mapSections || []).some(s => String(s?.id) === sectionId) ? sectionId : String(next.mapSections?.[0]?.id || "");
          const name = String(msg.name || "").trim() || `Карта ${n}`;

          if (!Array.isArray(next.maps)) next.maps = [];
          next.maps.push({
            id: newId,
            name,
            sectionId: safeSection,
            boardWidth: 10,
            boardHeight: 10,
            boardBgDataUrl: null,
            gridAlpha: 1,
            wallAlpha: 1,
            walls: [],
            playersPos: {}
          });

          loadMapToRoot(next, newId);
          logEventToState(next, `Создана новая карта: ${name}`);
        }

        else if (type === "switchCampaignMap") {
          if (!isGM) return;
          handled = true;
          const targetId = String(msg.mapId || "");
          if (!targetId) return;

          syncActiveToMap(next);
          loadMapToRoot(next, targetId);

          const m = getActiveMap(next);
          logEventToState(next, `Переключение карты: ${m?.name || "Карта"}`);
        }


        if (handled) {
          await upsertRoomState(currentRoomId, next);
          break;
        }

        if (type === "resizeBoard") {
          if (!isGM) return;
          next.boardWidth = msg.width;
          next.boardHeight = msg.height;
          logEventToState(next, "Поле изменено");
        }

        else if (type === "startInitiative") {
          if (!isGM) return;
          next.phase = "initiative";
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.round = 1;
          (next.players || []).forEach(p => {
            p.initiative = null;
            p.hasRolledInitiative = false;
          });
          logEventToState(next, "GM начал фазу инициативы");
        }

        else if (type === "startExploration") {
          if (!isGM) return;
          next.phase = "exploration";
          // В исследовании очередь хода не нужна
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.round = 1;
          logEventToState(next, "GM начал фазу исследования");
        }

        else if (type === "updatePlayerColor") {
          const p = (next.players || []).find(pp => pp.id === msg.id);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          const c = String(msg.color || '').trim();
          if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
          p.color = c;
          logEventToState(next, `${p.name} изменил цвет`);
        }

        else if (type === "addPlayer") {
          const player = msg.player || {};
          const isBase = !!player.isBase;
          const isMonster = !!player.isMonster;

          // Visibility + per-map scoping metadata:
          // - ownerRole allows clients to hide GM-created non-allies from other players.
          // - mapId allows GM to keep "map-local" NPCs/monsters per active map.
          //   Bases and Allies are global across maps.
          const ownerRole = String(myRole || "").trim() || "";
          const activeMapId = String(next?.currentMapId || "").trim() || null;
          const mapId = (ownerRole === "GM" && !isBase && !player.isAlly)
            ? (activeMapId || null)
            : null;

          // GM public visibility toggle ("eye" in GM list):
          // - Bases and Allies are always public.
          // - Other GM-created characters are hidden by default; GM can toggle per-character.
          const gmPublic = (ownerRole === "GM") ? (!!isBase || !!player.isAlly) : true;
          if (isBase) {
            const exists = (next.players || []).some(p => p.isBase && p.ownerId === myUserId);
            if (exists) {
              handleMessage({ type: "error", message: "У вас уже есть Основа. Можно иметь только одну основу на пользователя." });
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
            isAlly: !!player.isAlly,
            isMonster,
            monsterId: player.monsterId || null,
            ownerId: myUserId,
            ownerRole,
            mapId,
            gmPublic,
            ownerName: myNameSpan?.textContent || "",
            sheet: player.sheet || { parsed: { name: { value: player.name } } }
          });
          logEventToState(next, `${isMonster ? 'Добавлен монстр' : 'Добавлен игрок'} ${player.name}`);
        }

        else if (type === "setGmPublic") {
          // GM toggles visibility of their own non-base non-ally NPCs/monsters for other players.
          if (!isGM) return;
          const pid = String(msg.id || "");
          const p = (next.players || []).find(pp => String(pp?.id) === pid);
          if (!p) return;
          if (String(p.ownerId) !== String(myUserId)) return;
          const ownerRole = String(p.ownerRole || "").trim();
          if (ownerRole !== 'GM') return;
          if (p.isBase || p.isAlly) return; // bases/allies are always visible
          p.gmPublic = !!msg.gmPublic;
          logEventToState(next, `${p.name}: видимость для игроков ${p.gmPublic ? 'включена' : 'выключена'}`);
        }

        else if (type === "combatInitChoice") {
          // When a new character is created during combat, it must pick initiative:
          // - 'roll' : d20 + DEX mod of this character
          // - 'base' : copy initiative from owner's Base character
          if (next.phase !== "combat") return;
          const pid = String(msg.id || "");
          const choice = String(msg.choice || "");
          if (!pid) return;
          const p = (next.players || []).find(pp => pp.id === pid);
          if (!p) return;
          if (!p.pendingInitiativeChoice) return;
          if (!isGM && !ownsPlayer(p)) return;

          let total = null;
          let kindText = "";
          let rolls = [];
          let bonus = 0;

          if (choice === "roll") {
            const roll = Math.floor(Math.random() * 20) + 1;
            const dexMod = getDexMod(p);
            total = roll + dexMod;
            kindText = `Инициатива (в бою): d20${dexMod >= 0 ? "+" : ""}${dexMod}`;
            rolls = [roll];
            bonus = dexMod;
            const sign = dexMod >= 0 ? "+" : "";
            logEventToState(next, `${p.name} бросил инициативу (в бою): ${roll}${sign}${dexMod} = ${total}`);
          } else if (choice === "base") {
            const base = (next.players || []).find(pp => pp && pp.isBase && String(pp.ownerId) === String(p.ownerId));
            const baseInit = Number(base?.initiative);
            if (!base || !Number.isFinite(baseInit)) {
              handleMessage({ type: "error", message: "У вашей основы нет инициативы (сначала бросьте инициативу для основы)." });
              return;
            }
            total = baseInit;
            kindText = "Инициатива основы";
            rolls = [];
            bonus = 0;
            logEventToState(next, `${p.name} взял инициативу основы: ${total}`);
          } else {
            return;
          }

          p.initiative = total;
          p.hasRolledInitiative = true;
          p.pendingInitiativeChoice = false;
          p.willJoinNextRound = true; // добавится в turnOrder в начале следующего раунда (уже реализовано в endTurn)

          await broadcastDiceEventOnly({
            fromId: myUserId,
            fromName: p.name,
            kindText,
            sides: 20,
            count: 1,
            bonus,
            rolls,
            total,
            crit: ""
          });
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
            handleMessage({ type: "error", message: "Эта клетка занята другим персонажем" });
            return;
          }

          p.x = nx;
          p.y = ny;
          logEventToState(next, `${p.name} перемещен в (${p.x},${p.y})`);
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
              handleMessage({ type: "error", message: "Нельзя увеличить размер: место занято" });
              return;
            }
            p.x = nx;
            p.y = ny;
          }
          p.size = newSize;
          logEventToState(next, `${p.name} изменил размер на ${p.size}x${p.size}`);
        }

        else if (type === "removePlayerFromBoard") {
          const p = (next.players || []).find(pp => pp.id === msg.id);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          p.x = null;
          p.y = null;
          logEventToState(next, `${p.name} удален с поля`);
        }

        else if (type === "removePlayerCompletely") {
          const p = (next.players || []).find(pp => pp.id === msg.id);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          next.players = (next.players || []).filter(pl => pl.id !== msg.id);
          next.turnOrder = (next.turnOrder || []).filter(id => id !== msg.id);
          logEventToState(next, `Игрок ${p.name} полностью удален`);
        }

        else if (type === "bulkWalls") {
          if (!isGM) return;
          const mode = String(msg.mode || "");
          const cells = Array.isArray(msg.cells) ? msg.cells : [];
          if (!Array.isArray(next.walls)) next.walls = [];
          // Используем Set для ускорения
          const wallSet = new Set(next.walls.map(w => `${w.x},${w.y}`));
          let changed = 0;

          if (mode === "add") {
            for (const c of cells) {
              const x = Number(c?.x), y = Number(c?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              const k = `${x},${y}`;
              if (wallSet.has(k)) continue;
              wallSet.add(k);
              next.walls.push({ x, y });
              changed++;
            }
          } else if (mode === "remove") {
            const removeSet = new Set();
            for (const c of cells) {
              const x = Number(c?.x), y = Number(c?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              removeSet.add(`${x},${y}`);
            }
            if (removeSet.size) {
              next.walls = next.walls.filter(w => !removeSet.has(`${w.x},${w.y}`));
              changed = removeSet.size;
            }
          } else {
            return;
          }

          if (changed) {
            logEventToState(next, `Окружение: ${mode === "add" ? "добавлено" : "удалено"} ${changed} стен`);
          }
        }

else if (type === "addWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          if (!(next.walls || []).find(x => x.x === w.x && x.y === w.y)) {
            next.walls.push({ x: w.x, y: w.y });
            logEventToState(next, `Стена добавлена (${w.x},${w.y})`);
          }
        }

        else if (type === "removeWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          next.walls = (next.walls || []).filter(x => !(x.x === w.x && x.y === w.y));
          logEventToState(next, `Стена удалена (${w.x},${w.y})`);
        }

        else if (type === "setBoardBg") {
          if (!isGM) return;
          const dataUrl = String(msg.dataUrl || "").trim();
          next.boardBgDataUrl = dataUrl ? dataUrl : null;
          logEventToState(next, next.boardBgDataUrl ? "Подложка карты загружена" : "Подложка карты очищена");
        }

        else if (type === "clearBoardBg") {
          if (!isGM) return;
          next.boardBgDataUrl = null;
          logEventToState(next, "Подложка карты очищена");
        }

        else if (type === "setGridAlpha") {
          if (!isGM) return;
          const a = Number(msg.alpha);
          next.gridAlpha = Number.isFinite(a) ? clamp(a, 0, 1) : 1;
          logEventToState(next, `Прозрачность клеток: ${Math.round((1 - next.gridAlpha) * 100)}%`);
        }

        else if (type === "setWallAlpha") {
          if (!isGM) return;
          const a = Number(msg.alpha);
          next.wallAlpha = Number.isFinite(a) ? clamp(a, 0, 1) : 1;
          logEventToState(next, `Прозрачность стен: ${Math.round((1 - next.wallAlpha) * 100)}%`);
        }


        else if (type === "rollInitiative") {
          if (next.phase !== "initiative") return;
          // IMPORTANT: we must NOT call sendMessage({type:'diceEvent'}) here.
          // diceEvent case writes logs using lastState and can overwrite fresh initiative changes.
          const toRoll = (next.players || []).filter(p => String(p.ownerId) === myUserId && !p.hasRolledInitiative);
          for (const p of toRoll) {
            const roll = Math.floor(Math.random() * 20) + 1;
            const dexMod = getDexMod(p);
            const total = roll + dexMod;
            p.initiative = total;
            p.hasRolledInitiative = true;

            const sign = dexMod >= 0 ? "+" : "";
            logEventToState(next, `${p.name} бросил инициативу: ${roll}${sign}${dexMod} = ${total}`);

            // live dice event (broadcast only)
            await broadcastDiceEventOnly({
              fromId: myUserId,
              fromName: p.name,
              kindText: `Инициатива: d20${dexMod >= 0 ? "+" : ""}${dexMod}`,
              sides: 20,
              count: 1,
              bonus: dexMod,
              rolls: [roll],
              total,
              crit: ""
            });
          }
        }

        else if (type === "startCombat") {
          if (!isGM) return;
          if (next.phase !== "initiative" && next.phase !== "placement" && next.phase !== "exploration") return;
          const allRolled = (next.players || []).length ? next.players.every(p => p.hasRolledInitiative) : false;
          if (!allRolled) {
            handleMessage({ type: "error", message: "Сначала бросьте инициативу за всех персонажей" });
            return;
          }
          next.turnOrder = [...(next.players || [])]
            .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
            .map(p => p.id);
          autoPlacePlayers(next);
          next.phase = "combat";
          next.currentTurnIndex = 0;
          next.round = 1;
          const firstId = next.turnOrder[0];
          const first = (next.players || []).find(p => p.id === firstId);
          logEventToState(next, `Бой начался. Первый ход: ${first?.name || '-'}`);
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
            next.round = (Number(next.round) || 1) + 1;
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
          logEventToState(next, `Ход игрока ${np?.name || '-'}`);
        }

        else if (type === "resetGame") {
          if (!isGM) return;
          next.players = [];
          next.walls = [];
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.log = ["Игра полностью сброшена"];
        }

        else if (type === "clearBoard") {
          if (!isGM) return;
          (next.players || []).forEach(p => { p.x = null; p.y = null; });
          next.walls = [];
          logEventToState(next, "Поле очищено");
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
    const text = String(e?.message || e || "Ошибка");
    handleMessage({ type: "error", message: text });
  }
}

function updatePhaseUI(state) {
  const allRolled = state.players?.length
    ? state.players.every(p => p.hasRolledInitiative)
    : false;

  // сбрасываем подсветки
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

    // бой можно начать только когда все бросили
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







