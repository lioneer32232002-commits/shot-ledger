// js/store.js
// localStorage 讀寫、schema migration（v1→…→最新）、匯出/匯入/CSV、挑戰進度（progress）存取。

import { MENUS, getMenu, nextMenuId, ladderMenus } from './menus.js';
import { isChallengeEligible, evaluatePassRule, sessionPct, aggregate, computeBadges } from './stats.js';
// menus.js / stats.js 都是無相依的純資料／純函式模組，這裡 import 不會形成循環。

const KEY = 'shotledger_v1';
const SCHEMA_VERSION = 8;

function emptyProgress() {
  return { unlocked: ['lin_college'], best: {}, badges: [] };
}

function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    sessions: [],
    settings: { lastBackupAt: null, inputMode: 'quick', weeklyGoal: null, theme: 'auto', cardBg: 'bg1', homeSeen: false },
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

  if (data.schema < 4) {
    data.settings.theme = 'auto';
    data.schema = 4;
  }

  if (data.schema < 5) {
    // 挑戰階梯 6 關 → 12 關（SPEC_M5 §1.5）。順序必須與 menus.js 的 tier 順序一致。
    const LADDER_V5 = [
      'lin_college', 'lin_dleague', 'lin',
      'dirk_rookie', 'dirk',
      'allen_bucks', 'allen',
      'klay_rise', 'klay',
      'lillard',
      'curry_mvp', 'curry',
    ];
    if (!data.progress || typeof data.progress !== 'object') data.progress = emptyProgress();
    if (!Array.isArray(data.progress.unlocked)) data.progress.unlocked = [];
    // 找出舊 unlocked 中位於 LADDER_V5 的最高 index，把 index ≤ 它的全部 id 補進
    // unlocked（去重）——這保證舊資料「已通過」的關卡在新階梯上仍顯示已通過
    // （passed 判定靠「下一關已解鎖」）。
    let maxIdx = -1;
    for (const id of data.progress.unlocked) {
      const idx = LADDER_V5.indexOf(id);
      if (idx > maxIdx) maxIdx = idx;
    }
    if (maxIdx >= 0) {
      for (let i = 0; i <= maxIdx; i += 1) {
        if (!data.progress.unlocked.includes(LADDER_V5[i])) data.progress.unlocked.push(LADDER_V5[i]);
      }
    }
    // 保證 lin_college 一定在 unlocked（新的第 1 關基礎解鎖）。
    if (!data.progress.unlocked.includes('lin_college')) data.progress.unlocked.push('lin_college');
    data.settings.cardBg = 'bg1';
    data.schema = 5;
  }

  if (data.schema < 6) {
    // v5 的回填有個副作用：pre-M5 的預設 progress 是 unlocked:['lin']（只是
    // 「第一關已解鎖」，不代表通過任何關），v5 卻把它當「已推進到舊第 1 關」
    // 而補解鎖 lin_college／lin_dleague——階梯的「已通過」判定是「下一關已
    // 解鎖」，於是只開過舊版、從沒練過的裝置也會顯示第 1、2 關已打勾。
    // v6 修復：整份 unlocked 改用練習紀錄重算——一關只有在 sessions 裡真的有
    // 「完整版＋誠實機制合格＋passRule 達標」的節才算通過，通過最高關的下一關
    // 解鎖到此為止。best／badges 不動（都是事後對照展示，不影響通過判定）。
    const ladder = MENUS.filter((m) => m.challenge).slice().sort((a, b) => a.tier - b.tier);
    let highestPassedIdx = -1;
    ladder.forEach((m, i) => {
      const passed = data.sessions.some(
        (s) =>
          s.mode === m.id &&
          s.variant === 'full' &&
          s.endedAt &&
          isChallengeEligible(s) &&
          evaluatePassRule(s, m.passRule).pass
      );
      if (passed) highestPassedIdx = i;
    });
    const unlocked = [];
    for (let i = 0; i <= highestPassedIdx + 1 && i < ladder.length; i += 1) {
      unlocked.push(ladder[i].id);
    }
    if (!data.progress || typeof data.progress !== 'object') data.progress = emptyProgress();
    data.progress.unlocked = unlocked.length ? unlocked : emptyProgress().unlocked;
    data.schema = 6;
  }

  if (data.schema < 7) {
    // 首頁 landing（SPEC_M6 §2）。祖父條款：已經在用的人不該升版後被介紹頁擋在門外——
    // 有任何一次練習、或階梯已解鎖超過第一關，就視同看過首頁，直接進 #/train。
    // 注意順序：跑在 v6（unlocked 依練習紀錄重算）之後，所以「只開過舊版、從沒練過」
    // 的裝置這時 unlocked 已被修回 ['lin_college']，會正確地被當成新訪客看到首頁。
    const hasHistory =
      data.sessions.length > 0 ||
      (Array.isArray(data.progress?.unlocked) && data.progress.unlocked.some((id) => id !== 'lin_college'));
    data.settings.homeSeen = hasHistory;
    data.schema = 7;
  }

  if (data.schema < 8) {
    // 誠實機制 2.0（時長下限廢除，唯一標準改為輪距中位；見 stats.js paceAssessment）：
    // 用「新」規則重算最高通過關卡（照抄 v6 的「最高通過 index+1 全解鎖」手法）——
    // 舊機制下被時長規則冤枉的場次（中位 ≥60 秒但總時長 <20 分）會自動補解鎖。
    // 「詢問區」（中位 30〜60 秒）且未確認的舊場次視為不列入（paceConfirmed 未設定）。
    // 只加不減：算出來的解鎖若比現有少，保留現有（不收回任何已解鎖關卡）。
    const ladder = MENUS.filter((m) => m.challenge).slice().sort((a, b) => a.tier - b.tier);
    let highestPassedIdx = -1;
    ladder.forEach((m, i) => {
      const passed = data.sessions.some(
        (s) =>
          s.mode === m.id &&
          s.variant === 'full' &&
          s.endedAt &&
          isChallengeEligible(s) &&
          evaluatePassRule(s, m.passRule).pass
      );
      if (passed) highestPassedIdx = i;
    });
    if (!data.progress || typeof data.progress !== 'object') data.progress = emptyProgress();
    if (!Array.isArray(data.progress.unlocked)) data.progress.unlocked = [];
    for (let i = 0; i <= highestPassedIdx + 1 && i < ladder.length; i += 1) {
      if (!data.progress.unlocked.includes(ladder[i].id)) data.progress.unlocked.push(ladder[i].id);
    }
    data.schema = 8;
  }

  // 保底：不管資料是從哪個版本進來的，progress / settings.inputMode / settings.weeklyGoal / settings.theme / settings.cardBg / settings.homeSeen 形狀都要正確。
  if (!data.progress || typeof data.progress !== 'object') data.progress = emptyProgress();
  if (!Array.isArray(data.progress.unlocked)) data.progress.unlocked = ['lin_college'];
  if (!data.progress.unlocked.includes('lin_college')) data.progress.unlocked.push('lin_college');
  if (!data.progress.best || typeof data.progress.best !== 'object') data.progress.best = {};
  if (!Array.isArray(data.progress.badges)) data.progress.badges = [];
  if (!('inputMode' in data.settings)) data.settings.inputMode = 'quick';
  if (!('weeklyGoal' in data.settings)) data.settings.weeklyGoal = null;
  if (!('theme' in data.settings)) data.settings.theme = 'auto';
  if (!['paper', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5'].includes(data.settings.cardBg)) data.settings.cardBg = 'bg1';
  if (typeof data.settings.homeSeen !== 'boolean') data.settings.homeSeen = false;

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

/**
 * 結算一節挑戰並套用到 progress（個人最佳／解鎖／徽章）——正常結算與
 * confirmPace（詢問區補確認）共用的唯一路徑，避免兩套邏輯漂移。
 * 冪等：unlockMenu / addBadge / updateBest 對已寫入的資料都是 no-op，重跑安全。
 * @param {Object} state
 * @param {Object} session
 * @returns {{eligible:boolean, evalRes:Object, isNewBest:boolean, unlockedMenuId:string|null, badgeEarned:string|null, newBadges?:Array}|null}
 */
export function applyChallengeResult(state, session) {
  const menu = getMenu(session.mode);
  let challengeResult = null;

  if (menu && menu.challenge && session.variant === 'full') {
    const eligible = isChallengeEligible(session);
    const evalRes = evaluatePassRule(session, menu.passRule);
    const sp = sessionPct(session);
    const agg = aggregate(session.rounds);
    const prevBest = state.progress.best[menu.id];
    const isNewBest = sp !== null && (!prevBest || sp > prevBest.pct);

    if (isNewBest) {
      // date 用場次結束時間而非「現在」：confirmPace 補確認舊場次時，PB 日期才是實際練球日。
      updateBest(state, menu.id, { pct: sp, att: agg.total.att, mk: agg.total.mk, date: session.endedAt || new Date().toISOString() });
    }

    let unlockedMenuId = null;
    let badgeEarned = null;
    if (eligible && evalRes.pass) {
      const next = nextMenuId(menu.id);
      if (next && unlockMenu(state, next)) {
        unlockedMenuId = next;
      }
      const ladder = ladderMenus();
      const lastMenuId = ladder.length ? ladder[ladder.length - 1].id : null;
      if (menu.id === lastMenuId && addBadge(state, 'ladder_complete')) {
        badgeEarned = 'ladder_complete';
      }
    }

    challengeResult = { eligible, evalRes, isNewBest, unlockedMenuId, badgeEarned };
  }

  const newBadges = computeBadges(state.sessions, new Date()).filter((b) => !state.progress.badges.includes(b));
  newBadges.forEach((b) => addBadge(state, b));
  if (newBadges.length) {
    challengeResult = challengeResult || {};
    challengeResult.newBadges = newBadges;
  }

  return challengeResult;
}

/**
 * 詢問區（節奏 30〜60 秒）的回答：把 paceConfirmed 寫進 session 並存檔。
 * confirmed=true 時用「和正常結算完全相同的路徑」重新評估該場（applyChallengeResult），
 * 回傳其結果（含 unlockedMenuId，UI 據此觸發既有 celebration 流程）；false 回傳 null。
 */
export function confirmPace(state, sessionId, confirmed) {
  const s = getSession(state, sessionId);
  if (!s) return null;
  s.paceConfirmed = confirmed === true;
  save(state);
  if (s.paceConfirmed) return applyChallengeResult(state, s);
  return null;
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

/** 設定深色模式偏好：只收 'auto'|'light'|'dark'，其餘一律視為 'auto'。 */
export function setTheme(state, mode) {
  state.settings.theme = mode === 'light' || mode === 'dark' ? mode : 'auto';
  save(state);
}

/** 記下「首頁介紹看過了」：之後裸網址一律直接進 #/train（SPEC_M6 §2）。 */
export function markHomeSeen(state) {
  if (state.settings.homeSeen) return;
  state.settings.homeSeen = true;
  save(state);
}

/** 設定分享卡預設底圖：只收 'paper'|'bg1'..'bg5'，其餘一律視為 'bg1'（§3 分享卡用）。 */
export function setCardBg(state, value) {
  state.settings.cardBg = ['paper', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5'].includes(value) ? value : 'bg1';
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
