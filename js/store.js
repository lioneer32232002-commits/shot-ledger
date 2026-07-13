// js/store.js
// localStorage 讀寫、schema v1→v2 migration、匯出/匯入/CSV、挑戰進度（progress）存取。

const KEY = 'shotledger_v1';
const SCHEMA_VERSION = 3;

function emptyProgress() {
  return { unlocked: ['lin'], best: {}, badges: [] };
}

function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    sessions: [],
    settings: { lastBackupAt: null, inputMode: 'quick', weeklyGoal: null },
    progress: emptyProgress(),
  };
}

// Migration：每一步只處理「上一版 -> 下一版」，最後統一把 schema 設成最新版本。
function migrate(data) {
  if (!data || typeof data !== 'object') return emptyState();

  if (typeof data.schema !== 'number') data.schema = 1;

  if (!Array.isArray(data.sessions)) data.sessions = [];
  if (!data.settings || typeof data.settings !== 'object') data.settings = {};
  if (!('lastBackupAt' in data.settings)) data.settings.lastBackupAt = null;

  if (data.schema < 2) {
    for (const s of data.sessions) {
      if (!('variant' in s)) s.variant = null;
      if (Array.isArray(s.rounds)) {
        for (const r of s.rounds) {
          if (!('seq' in r)) r.seq = null;
        }
      }
    }
    if (!data.progress || typeof data.progress !== 'object') {
      data.progress = emptyProgress();
    }
    data.schema = 2;
  }

  if (data.schema < 3) {
    data.settings.weeklyGoal = null;
    data.schema = 3;
  }

  // 保底：不管資料是從哪個版本進來的，progress / settings.inputMode / settings.weeklyGoal 形狀都要正確。
  if (!data.progress || typeof data.progress !== 'object') data.progress = emptyProgress();
  if (!Array.isArray(data.progress.unlocked)) data.progress.unlocked = ['lin'];
  if (!data.progress.unlocked.includes('lin')) data.progress.unlocked.push('lin');
  if (!data.progress.best || typeof data.progress.best !== 'object') data.progress.best = {};
  if (!Array.isArray(data.progress.badges)) data.progress.badges = [];
  if (!('inputMode' in data.settings)) data.settings.inputMode = 'quick';
  if (!('weeklyGoal' in data.settings)) data.settings.weeklyGoal = null;

  return data;
}

/** 讀取整份資料；沒有資料或壞掉時回傳空結構（不丟例外）。 */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('[store] load() 失敗，改回空資料', err);
    return emptyState();
  }
}

/** 寫回整份資料。 */
export function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** 找出尚未結束（endedAt === null）的 session，沒有則回傳 null。 */
export function findInProgressSession(state) {
  return state.sessions.find((s) => s.endedAt === null) || null;
}

/** 依 id 找 session。 */
export function getSession(state, sessionId) {
  return state.sessions.find((s) => s.id === sessionId) || null;
}

/** 開始新的一節練習，回傳新建立的 session（已存檔）。variant: "easy"|"full"|null。 */
export function startSession(state, mode, variant = null) {
  const now = new Date();
  const session = {
    id: 's_' + now.getTime(),
    startedAt: now.toISOString(),
    endedAt: null,
    mode,
    variant: variant ?? null,
    rounds: [],
  };
  state.sessions.push(session);
  save(state);
  return session;
}

/** 新增一輪紀錄到指定 session，回傳該輪物件。round.seq 為逐球模式的 "1011..." 字串，快速模式為 null。 */
export function addRound(state, sessionId, round) {
  const s = getSession(state, sessionId);
  if (!s) return null;
  const r = {
    spot: round.spot ?? null,
    type: round.type,
    attempts: round.attempts,
    makes: round.makes,
    seq: round.seq ?? null,
    at: round.at || new Date().toISOString(),
  };
  s.rounds.push(r);
  save(state);
  return r;
}

/** 修改某一輪（例如撤銷誤按），patch 可含 attempts / makes / spot / type / seq。 */
export function updateRound(state, sessionId, roundIndex, patch) {
  const s = getSession(state, sessionId);
  if (!s || !s.rounds[roundIndex]) return null;
  Object.assign(s.rounds[roundIndex], patch);
  save(state);
  return s.rounds[roundIndex];
}

/** 結束練習（寫入 endedAt）。 */
export function endSession(state, sessionId) {
  const s = getSession(state, sessionId);
  if (!s) return null;
  s.endedAt = new Date().toISOString();
  save(state);
  return s;
}

/** 放棄 / 刪除整節（含進行中的節）。 */
export function discardSession(state, sessionId) {
  const idx = state.sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return false;
  state.sessions.splice(idx, 1);
  save(state);
  return true;
}

// ---------------------------------------------------------------------------
// 挑戰進度（progress）
// ---------------------------------------------------------------------------

/** 某菜單是否已解鎖。 */
export function isMenuUnlocked(state, menuId) {
  return state.progress.unlocked.includes(menuId);
}

/** 解鎖某菜單；已解鎖過則回傳 false（不重複寫入）。 */
export function unlockMenu(state, menuId) {
  if (!menuId) return false;
  if (state.progress.unlocked.includes(menuId)) return false;
  state.progress.unlocked.push(menuId);
  save(state);
  return true;
}

/** 更新某菜單的歷史最佳紀錄；只有破紀錄才會真正寫入，回傳是否為新紀錄。 */
export function updateBest(state, menuId, record) {
  const prev = state.progress.best[menuId];
  if (prev && typeof prev.pct === 'number' && prev.pct >= record.pct) return false;
  state.progress.best[menuId] = record;
  save(state);
  return true;
}

/** 新增一個徽章；已擁有則回傳 false。 */
export function addBadge(state, badgeId) {
  if (state.progress.badges.includes(badgeId)) return false;
  state.progress.badges.push(badgeId);
  save(state);
  return true;
}

/** 設定逐球／快速輸入偏好（存進 settings，跨節記住）。 */
export function setInputMode(state, mode) {
  state.settings.inputMode = mode === 'seq' ? 'seq' : 'quick';
  save(state);
}

/** 設定每週投量目標；n 為正整數目標值，null／非正整數一律視為關閉目標。 */
export function setWeeklyGoal(state, n) {
  state.settings.weeklyGoal = Number.isInteger(n) && n > 0 ? n : null;
  save(state);
}

function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestampForFilename() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** 匯出整份資料為 JSON 檔（Blob + a[download]），並更新 lastBackupAt。 */
export function exportJSON(state) {
  triggerDownload(
    `shotledger-${timestampForFilename()}.json`,
    JSON.stringify(state, null, 2),
    'application/json'
  );
  state.settings.lastBackupAt = new Date().toISOString();
  save(state);
}

function csvEscape(value) {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** 匯出所有輪次為 CSV（一列一輪，含 variant / seq），並更新 lastBackupAt。 */
export function exportCSV(state) {
  const rows = [['date', 'time', 'mode', 'variant', 'spot', 'type', 'attempts', 'makes', 'seq']];
  for (const s of state.sessions) {
    for (const r of s.rounds) {
      const d = new Date(r.at || s.startedAt);
      rows.push([
        d.toISOString().slice(0, 10),
        d.toISOString().slice(11, 19),
        s.mode,
        s.variant ?? '',
        r.spot ?? '',
        r.type,
        r.attempts,
        r.makes,
        r.seq ?? '',
      ]);
    }
  }
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  triggerDownload(`shotledger-${timestampForFilename()}.csv`, csv, 'text/csv');
  state.settings.lastBackupAt = new Date().toISOString();
  save(state);
}

/** 檢查資料是否符合 Shot Ledger schema 的基本形狀（給 importJSON 用）。v1/v2 皆可通過，migrate() 會補齊差異欄位。 */
export function isValidState(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.schema !== 'number') return false;
  if (!Array.isArray(data.sessions)) return false;
  for (const s of data.sessions) {
    if (typeof s !== 'object' || s === null) return false;
    if (typeof s.id !== 'string') return false;
    if (typeof s.startedAt !== 'string') return false;
    if (!('endedAt' in s)) return false;
    if (typeof s.mode !== 'string') return false;
    if (!Array.isArray(s.rounds)) return false;
    for (const r of s.rounds) {
      if (typeof r !== 'object' || r === null) return false;
      if (typeof r.type !== 'string') return false;
      if (typeof r.attempts !== 'number') return false;
      if (typeof r.makes !== 'number') return false;
    }
  }
  return true;
}

/**
 * 匯入 JSON 字串；驗證通過後「整份取代」目前的資料並存檔。
 * 驗證失敗會丟出 Error，呼叫端負責顯示訊息、且不應清掉現有資料。
 */
export function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('檔案不是有效的 JSON，匯入已取消');
  }
  if (!isValidState(data)) {
    throw new Error('資料格式不符合 Shot Ledger 格式，匯入已取消');
  }
  const migrated = migrate(data);
  save(migrated);
  return migrated;
}

/** 清除全部資料，回到空結構。 */
export function clearAll() {
  const fresh = emptyState();
  save(fresh);
  return fresh;
}

/** 統計「N 節未備份」用：lastBackupAt 之後新建立的 session 數。 */
export function unbackedUpCount(state) {
  const last = state.settings.lastBackupAt;
  if (!last) return state.sessions.filter((s) => s.endedAt !== null).length;
  return state.sessions.filter((s) => s.endedAt !== null && s.startedAt > last).length;
}
