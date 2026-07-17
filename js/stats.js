// js/stats.js
// 純函式統計聚合層。不得碰 DOM、不得碰 localStorage / store.js。
// 所有函式皆為 (輸入) -> (輸出)，方便在 Node 與瀏覽器共用同一份程式碼測試。

/**
 * 把一組 rounds 聚合成 byType / bySpot / total 三種統計。
 * @param {Array<{spot:string|null, type:string, attempts:number, makes:number}>} rounds
 * @returns {{byType: Object, bySpot: Object, total: {att:number, mk:number}}}
 */
export function aggregate(rounds) {
  const byType = {};
  const bySpot = {};
  const total = { att: 0, mk: 0 };

  for (const r of rounds || []) {
    const att = Number(r.attempts) || 0;
    const mk = Number(r.makes) || 0;

    if (!byType[r.type]) byType[r.type] = { att: 0, mk: 0 };
    byType[r.type].att += att;
    byType[r.type].mk += mk;

    if (r.spot) {
      if (!bySpot[r.spot]) bySpot[r.spot] = { att: 0, mk: 0 };
      bySpot[r.spot].att += att;
      bySpot[r.spot].mk += mk;
    }

    total.att += att;
    total.mk += mk;
  }

  return { byType, bySpot, total };
}

/**
 * 命中率，回傳 0-100 的整數；attempts 為 0 時回傳 null（避免除以零 / 誤導性 0%）。
 * @param {number} mk
 * @param {number} att
 * @returns {number|null}
 */
export function pct(mk, att) {
  if (!att || att <= 0) return null;
  return Math.round((mk / att) * 100);
}

/**
 * 計算「近 days 天」內、指定球種的命中率平均（用來跟本節做比較）。
 * 區間為 (now - days*24h, now]，可用 excludeSessionId 排除本節自己。
 * @param {Array} sessions
 * @param {string} type
 * @param {number} days
 * @param {string|Date} now
 * @param {string|null} excludeSessionId
 * @returns {number|null}
 */
export function recentTypeAvg(sessions, type, days, now, excludeSessionId) {
  const nowMs = new Date(now).getTime();
  const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;

  let att = 0;
  let mk = 0;

  for (const s of sessions || []) {
    if (excludeSessionId && s.id === excludeSessionId) continue;
    const startedMs = new Date(s.startedAt).getTime();
    if (Number.isNaN(startedMs)) continue;
    if (startedMs <= cutoffMs || startedMs > nowMs) continue;

    for (const r of s.rounds || []) {
      if (r.type !== type) continue;
      att += Number(r.attempts) || 0;
      mk += Number(r.makes) || 0;
    }
  }

  return pct(mk, att);
}

/**
 * 今天（本地時區同年月日）已投/已中總數。
 * @param {Array} sessions
 * @param {string|Date} now
 * @returns {{att:number, mk:number}}
 */
export function todaySummary(sessions, now) {
  const nowDate = new Date(now);
  const y = nowDate.getFullYear();
  const m = nowDate.getMonth();
  const d = nowDate.getDate();

  let att = 0;
  let mk = 0;

  for (const s of sessions || []) {
    const st = new Date(s.startedAt);
    if (st.getFullYear() === y && st.getMonth() === m && st.getDate() === d) {
      for (const r of s.rounds || []) {
        att += Number(r.attempts) || 0;
        mk += Number(r.makes) || 0;
      }
    }
  }

  return { att, mk };
}

// ---------------------------------------------------------------------------
// M1.5：疲勞曲線 / 逐球前後段 / 挑戰判定 / 誠實機制
// ---------------------------------------------------------------------------

/**
 * 各輪命中率陣列，依輪次順序，attempts=0 的輪回傳 null（跟 pct() 一致）。
 * @param {Array<{attempts:number, makes:number}>} rounds
 * @returns {Array<number|null>}
 */
export function roundCurve(rounds) {
  return (rounds || []).map((r) => pct(Number(r.makes) || 0, Number(r.attempts) || 0));
}

/**
 * 彙總所有「有 seq」的輪，算出每輪前半 vs 後半出手的 {att,mk}。
 * attempts 為奇數時，中位那一球算進前半（前半 = ceil(n/2) 球）。
 * 完全沒有任何 seq 資料時回傳 null，讓 UI 隱藏該區塊。
 * @param {Array<{seq:string|null}>} rounds
 * @returns {{early:{att:number,mk:number}, late:{att:number,mk:number}}|null}
 */
export function earlyLateSplit(rounds) {
  const seqRounds = (rounds || []).filter((r) => typeof r.seq === 'string' && r.seq.length > 0);
  if (seqRounds.length === 0) return null;

  const early = { att: 0, mk: 0 };
  const late = { att: 0, mk: 0 };

  for (const r of seqRounds) {
    const seq = r.seq;
    const n = seq.length;
    const half = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const made = seq[i] === '1';
      const bucket = i < half ? early : late;
      bucket.att += 1;
      if (made) bucket.mk += 1;
    }
  }

  return { early, late };
}

/**
 * 評估一節是否達成 passRule；只對 variant==="full" 的挑戰節評估，其餘一律 pass:false。
 * @param {Object} session
 * @param {Array<{type:string, minPct:number}>} rule
 * @returns {{pass:boolean, detail:Array<{type:string, pct:number|null, need:number, att:number, mk:number}>}}
 */
export function evaluatePassRule(session, rule) {
  const rules = Array.isArray(rule) ? rule : [];

  if (!session || session.variant !== 'full' || rules.length === 0) {
    return {
      pass: false,
      detail: rules.map((r) => ({ type: r.type, pct: null, need: r.minPct, att: 0, mk: 0 })),
    };
  }

  const agg = aggregate(session.rounds);
  const detail = rules.map((r) => {
    const d = agg.byType[r.type];
    const att = d ? d.att : 0;
    const mk = d ? d.mk : 0;
    return { type: r.type, pct: pct(mk, att), need: r.minPct, att, mk };
  });
  const pass = detail.every((d) => d.pct !== null && d.pct >= d.need);

  return { pass, detail };
}

/** 一節的總命中率（個人最佳比較用），沒有出手回傳 null。 */
export function sessionPct(session) {
  if (!session) return null;
  const agg = aggregate(session.rounds);
  return pct(agg.total.mk, agg.total.att);
}

// ---------------------------------------------------------------------------
// 三星制：★1 解鎖星（= passRule）、★2 簽名星（每關專屬）、★3 高標星（每條 +10pp）
// ---------------------------------------------------------------------------

/** 依 filterFn 篩出的輪合計 {att, mk, pct}（pct 沿用 pct()：0 出手回 null）。 */
function groupTotals(rounds, filterFn) {
  let att = 0;
  let mk = 0;
  for (const r of rounds) {
    if (!filterFn(r)) continue;
    att += Number(r.attempts) || 0;
    mk += Number(r.makes) || 0;
  }
  return { att, mk, pct: pct(mk, att) };
}

/**
 * 簽名星判定（★2）：每關一條專屬規則，全部以「該場 rounds 的實際內容」計算，
 * 不依賴輪次編號——新舊菜單版本的場次都能正確判定。防禦原則：資料裡沒有
 * 規則所需的結構（缺點位、無深三輪、無連兩輪同點…）一律不成立，不給白拿。
 * @param {string} menuId
 * @param {Array} rounds 依時間排序後的輪次
 * @returns {boolean}
 */
function evaluateSignature(menuId, rounds) {
  const mkOf = (r) => Number(r.makes) || 0;

  switch (menuId) {
    case 'lin_college': {
      // 課表收官：最後一輪罰球投 7 進以上（最後一輪不是罰球則不成立）。
      const last = rounds[rounds.length - 1];
      return !!last && last.type === 'ft' && mkOf(last) >= 7;
    }
    case 'lin_dleague': {
      // 折返穩定：左右兩翼皆有出手，命中率差 ≤10 個百分點。
      const lw = groupTotals(rounds, (r) => r.spot === 'mid_lw');
      const rw = groupTotals(rounds, (r) => r.spot === 'mid_rw');
      return lw.pct !== null && rw.pct !== null && Math.abs(lw.pct - rw.pct) <= 10;
    }
    case 'lin': {
      // 先發制人：前 3 輪合計命中率 ≥50%（＝本關 2 分門檻）；不足 3 輪不成立。
      if (rounds.length < 3) return false;
      const first3 = rounds.slice(0, 3);
      const g = groupTotals(first3, () => true);
      return g.pct !== null && g.pct >= 50;
    }
    case 'dirk_rookie': {
      // 單點鑽研：所有罰球線頂（mid_top）輪皆 makes ≥5；沒有 mid_top 輪不成立。
      const topRounds = rounds.filter((r) => r.spot === 'mid_top');
      return topRounds.length > 0 && topRounds.every((r) => mkOf(r) >= 5);
    }
    case 'dirk': {
      // 金雞獨立：任一 2 分輪單輪 8 進。
      return rounds.some((r) => r.type === '2pt' && mkOf(r) >= 8);
    }
    case 'allen_bucks': {
      // 底角殺手：兩側底角（3pt_lc＋3pt_rc）合計 ≥40%（需有出手）。
      const g = groupTotals(rounds, (r) => r.spot === '3pt_lc' || r.spot === '3pt_rc');
      return g.pct !== null && g.pct >= 40;
    }
    case 'allen': {
      // 儀式不亂：沒有任何一輪掉到 3 球以下。
      return rounds.every((r) => mkOf(r) >= 3);
    }
    case 'klay_rise': {
      // 穩了才換點：每組「連續兩輪同 spot」第二輪不退步；無此結構不成立。
      let pairs = 0;
      for (let i = 1; i < rounds.length; i++) {
        if (rounds[i].spot && rounds[i].spot === rounds[i - 1].spot) {
          pairs += 1;
          if (mkOf(rounds[i]) < mkOf(rounds[i - 1])) return false;
        }
      }
      return pairs > 0;
    }
    case 'klay': {
      // 量產不停：依時間序前後對半分（奇數輪中間歸前半），後半總進球 ≥ 前半。
      if (rounds.length < 2) return false;
      const half = Math.ceil(rounds.length / 2);
      const early = rounds.slice(0, half).reduce((sum, r) => sum + mkOf(r), 0);
      const late = rounds.slice(half).reduce((sum, r) => sum + mkOf(r), 0);
      return late >= early;
    }
    case 'lillard': {
      // Dame Time：最後一個深三輪投 4 進以上；無深三輪不成立。
      const deepRounds = rounds.filter((r) => r.type === 'deep3');
      const last = deepRounds[deepRounds.length - 1];
      return !!last && mkOf(last) >= 4;
    }
    case 'lin_taiwan': {
      // 左右開弓：左右上籃各自合計 ≥70%（兩側皆有出手）。
      const l = groupTotals(rounds, (r) => r.spot === 'layup_l');
      const r = groupTotals(rounds, (r2) => r2.spot === 'layup_r');
      return l.pct !== null && l.pct >= 70 && r.pct !== null && r.pct >= 70;
    }
    case 'curry_mvp': {
      // 全點開花：每個出現過的 3 分點位（依 spot 分組）合計命中率 ≥40%；無 3 分輪不成立。
      const spots = new Set(rounds.filter((r) => r.type === '3pt' && r.spot).map((r) => r.spot));
      if (spots.size === 0) return false;
      for (const spot of spots) {
        const g = groupTotals(rounds, (r) => r.spot === spot);
        if (g.pct === null || g.pct < 40) return false;
      }
      return true;
    }
    case 'curry': {
      // 雙修：3 分合計 ≥50% 且深 3 合計 ≥40%（同場皆超門檻 5pp）。
      const three = groupTotals(rounds, (r) => r.type === '3pt');
      const deep = groupTotals(rounds, (r) => r.type === 'deep3');
      return three.pct !== null && three.pct >= 50 && deep.pct !== null && deep.pct >= 40;
    }
    default:
      return false;
  }
}

/**
 * 三星評估（純函式，不看 eligibility——由呼叫端把關「合格＋完整版」）：
 * - unlock：evaluatePassRule 過（現有解鎖門檻，本函式不影響解鎖邏輯本身）
 * - signature：該關專屬規則（evaluateSignature）
 * - high：passRule 每一條 minPct +10 個百分點全數達成
 * @param {Object} menu
 * @param {Object} session
 * @returns {{unlock:boolean, signature:boolean, high:boolean}}
 */
export function evaluateStars(menu, session) {
  const none = { unlock: false, signature: false, high: false };
  if (!menu || !menu.challenge || !Array.isArray(menu.passRule) || menu.passRule.length === 0) return none;
  if (!session || !Array.isArray(session.rounds) || session.rounds.length === 0) return none;

  const unlock = evaluatePassRule(session, menu.passRule).pass;
  const highRule = menu.passRule.map((r) => ({ type: r.type, minPct: r.minPct + 10 }));
  const high = evaluatePassRule(session, highRule).pass;

  const ordered = session.rounds
    .slice()
    .sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
  const signature = evaluateSignature(menu.id, ordered);

  return { unlock, signature, high };
}

/**
 * 誠實機制 2.0：以「輪與輪中位間隔」三段式評估練習節奏（時長下限已廢除）。
 * - 中位 ≥60 秒 → level 'auto'（自動列入）
 * - 中位 30〜60 秒 → level 'ask'（詢問區：看 session.paceConfirmed）
 * - 中位 <30 秒 → level 'out'（點著玩的速度，直接不列入）
 * 不足兩輪（沒有間隔可算）→ level 'auto'、medianSec null（維持舊行為：視為通過節奏檢查）。
 * @param {Object} session
 * @returns {{level: 'auto'|'ask'|'out', medianSec: number|null}}
 */
export function paceAssessment(session) {
  const rounds = (session && session.rounds) || [];
  const roundTimes = rounds.map((r) => new Date(r.at).getTime()).sort((a, b) => a - b);
  const intervals = [];
  for (let i = 1; i < roundTimes.length; i++) {
    intervals.push((roundTimes[i] - roundTimes[i - 1]) / 1000);
  }
  if (intervals.length === 0) return { level: 'auto', medianSec: null };

  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 === 0 ? (intervals[mid - 1] + intervals[mid]) / 2 : intervals[mid];

  if (median >= 60) return { level: 'auto', medianSec: median };
  if (median >= 30) return { level: 'ask', medianSec: median };
  return { level: 'out', medianSec: median };
}

/**
 * 挑戰不合格原因（誠實機制 2.0 的說明版）：回傳人話原因字串，合格回傳 null。
 * 'ask' 區看 session.paceConfirmed：true → 列入（null）；false / 未設定 → 不列入。
 * isChallengeEligible 直接以本函式實作，兩者永遠一致。
 * @param {Object} session
 * @returns {string|null}
 */
export function challengeIneligibleReason(session) {
  if (!session || !session.variant) return '不是挑戰變體的練習';
  const rounds = session.rounds || [];
  if (rounds.length === 0) return '沒有任何輪次紀錄';

  const pace = paceAssessment(session);
  if (pace.level === 'out') return `輪與輪的節奏過快（中位 ${Math.round(pace.medianSec)} 秒）`;
  if (pace.level === 'ask') {
    if (session.paceConfirmed === true) return null;
    if (session.paceConfirmed === false) return '節奏偏快';
    return '節奏偏快，尚未確認為真實練習';
  }
  return null;
}

/**
 * 挑戰資格（誠實機制 2.0）：唯一標準是輪與輪的中位間隔（見 paceAssessment）。
 * variant 為 null（自由練習等）一律不合格（此函式本來就只給挑戰節用）。
 * @param {Object} session
 * @returns {boolean}
 */
export function isChallengeEligible(session) {
  return challengeIneligibleReason(session) === null;
}

/**
 * 把「還差幾個百分點」換算成「還差幾顆」（以目前出手數為分母估算）。
 * att<=0 時無法換算，回傳 null。
 * @param {number} att
 * @param {number} mk
 * @param {number} needPct
 * @returns {number|null}
 */
export function pctGapToShots(att, mk, needPct) {
  if (!att || att <= 0) return null;
  // 先乘後除、並扣一個極小 epsilon，避免「剛好整除」時的浮點誤差把 55 算成 55.00000000000001 而多進位成 56。
  const needMakes = Math.ceil((needPct * att) / 100 - 1e-9);
  return Math.max(0, needMakes - (Number(mk) || 0));
}

/** 某球種的全期歷史命中率（異常輪確認用），可選排除某節自己。 */
export function typeAvgAllTime(sessions, type, excludeSessionId) {
  let att = 0;
  let mk = 0;
  for (const s of sessions || []) {
    if (excludeSessionId && s.id === excludeSessionId) continue;
    for (const r of s.rounds || []) {
      if (r.type !== type) continue;
      att += Number(r.attempts) || 0;
      mk += Number(r.makes) || 0;
    }
  }
  return pct(mk, att);
}

/** 全期累計出手數（投量徽章用）。 */
export function totalAttempts(sessions) {
  return (sessions || []).reduce(
    (sum, s) => sum + (s.rounds || []).reduce((a, r) => a + (Number(r.attempts) || 0), 0),
    0
  );
}

/** 以 now 為終點，往回算連續有練習（endedAt!==null）的天數（本地時區同年月日）。 */
export function streakDays(sessions, now) {
  const days = new Set();
  for (const s of sessions || []) {
    if (!s.endedAt) continue;
    const d = new Date(s.startedAt);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  let streak = 0;
  const cursor = new Date(now);
  while (days.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 出席／投量徽章 id 清單（連續 3/7/30 天、累計 1000/5000/10000 球）。 */
export function computeBadges(sessions, now) {
  const badges = [];
  const streak = streakDays(sessions, now);
  if (streak >= 3) badges.push('streak_3');
  if (streak >= 7) badges.push('streak_7');
  if (streak >= 30) badges.push('streak_30');
  const total = totalAttempts(sessions);
  if (total >= 1000) badges.push('volume_1000');
  if (total >= 5000) badges.push('volume_5000');
  if (total >= 10000) badges.push('volume_10000');
  return badges;
}

// ---------------------------------------------------------------------------
// M1.6：自訂節等級對照（純對照，絕不寫入 progress）／生涯累計數
// ---------------------------------------------------------------------------

/**
 * 純函式：把「自由 / 綜合巡迴」這類非挑戰節的表現，拿去跟挑戰階梯的 passRule
 * 對照，看相當於哪一關的過關水準——純粹對照用，呼叫端不得依此寫入
 * progress.unlocked / progress.best，本函式本身也完全不碰 store。
 *
 * 由高關往低關掃 menus 中 challenge:true 的菜單：該節彙總後，
 * passRule 內每個球種都要 attempts>=20 且 pct 達標（>=minPct），
 * 全數達標即回傳該關；由高往低找，找到第一個達標的就回傳（最高對照關卡）。
 * 都不滿足回傳 null。
 * @param {Object} session
 * @param {Array} menus 完整菜單陣列（含非挑戰菜單，函式內部自行過濾 challenge:true）
 * @returns {{tier:number, menuId:string, name:string}|null}
 */
export function equivalentTier(session, menus) {
  if (!session || !Array.isArray(menus)) return null;

  const ladder = menus
    .filter((m) => m && m.challenge && Array.isArray(m.passRule) && m.passRule.length > 0)
    .slice()
    .sort((a, b) => b.tier - a.tier);

  const agg = aggregate(session.rounds);

  for (const menu of ladder) {
    const allMet = menu.passRule.every((rule) => {
      const d = agg.byType[rule.type];
      if (!d || d.att < 20) return false;
      const p = pct(d.mk, d.att);
      return p !== null && p >= rule.minPct;
    });
    if (allMet) {
      return { tier: menu.tier, menuId: menu.id, name: menu.name };
    }
  }

  return null;
}

/** 全生涯累計出手／命中總數（所有節，含自由練習）。 */
export function lifetimeTotals(sessions) {
  let att = 0;
  let mk = 0;
  for (const s of sessions || []) {
    for (const r of s.rounds || []) {
      att += Number(r.attempts) || 0;
      mk += Number(r.makes) || 0;
    }
  }
  return { att, mk };
}

// ---------------------------------------------------------------------------
// M2：統計分頁（期間篩選 / 命中率趨勢 / 熱力格日曆 / 疲勞趨勢彙總）＋ 週目標
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 本地時區 YYYY-MM-DD 字串。 */
function localDayKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 該日期所在週的週一（本地時區、時分秒歸零），週日算前一週的最後一天。 */
function mondayOf(d) {
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = midnight.getDay(); // 0=週日 ... 6=週六
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  midnight.setDate(midnight.getDate() + diffToMonday);
  return midnight;
}

/**
 * 篩出「完賽節」（endedAt !== null）且 startedAt 落在 (now-days*24h, now] 的 sessions。
 * days 為 null 表示不設下限（但仍要求 endedAt !== null）。
 * @param {Array} sessions
 * @param {number|null} days
 * @param {string|Date} now
 * @returns {Array}
 */
export function sessionsInRange(sessions, days, now) {
  const nowMs = new Date(now).getTime();
  const cutoffMs = days === null || days === undefined ? -Infinity : nowMs - days * 24 * 60 * 60 * 1000;
  return (sessions || []).filter((s) => {
    if (!s || s.endedAt === null || s.endedAt === undefined) return false;
    const startedMs = new Date(s.startedAt).getTime();
    if (Number.isNaN(startedMs)) return false;
    return startedMs > cutoffMs && startedMs <= nowMs;
  });
}

/**
 * 依日／週分組的命中率序列，只回傳「有出手」的 bucket，依 key 升冪排序。
 * @param {Array} sessions
 * @param {{type:(string|null), bucket:('day'|'week'), now:(string|Date), days:(number|null)}} opts
 * @returns {Array<{key:string, att:number, mk:number, pct:(number|null)}>}
 */
export function pctSeries(sessions, opts) {
  const { type = null, bucket = 'day', now, days = null } = opts || {};
  const inRange = sessionsInRange(sessions, days, now);
  const buckets = new Map();

  for (const s of inRange) {
    const started = new Date(s.startedAt);
    const key = bucket === 'week' ? localDayKey(mondayOf(started)) : localDayKey(started);
    for (const r of s.rounds || []) {
      if (type !== null && r.type !== type) continue;
      const att = Number(r.attempts) || 0;
      const mk = Number(r.makes) || 0;
      if (!buckets.has(key)) buckets.set(key, { att: 0, mk: 0 });
      const b = buckets.get(key);
      b.att += att;
      b.mk += mk;
    }
  }

  return Array.from(buckets.entries())
    .filter(([, v]) => v.att > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => ({ key, att: v.att, mk: v.mk, pct: pct(v.mk, v.att) }));
}

/**
 * 最近 weeks 週（含本週）的熱力格資料，依時間升冪，長度固定為 weeks*7。
 * 自「now 當週週一」往回推 weeks-1 週的週一開始，到 now 當週週日為止；未來日 att 一律 0。
 * @param {Array} sessions
 * @param {string|Date} now
 * @param {number} weeks
 * @returns {Array<{date:string, att:number}>}
 */
export function calendarCells(sessions, now, weeks) {
  const nowDate = new Date(now);
  const thisMonday = mondayOf(nowDate);
  const startMonday = new Date(thisMonday);
  startMonday.setDate(startMonday.getDate() - (weeks - 1) * 7);

  const attByDay = new Map();
  for (const s of sessions || []) {
    const started = new Date(s.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const key = localDayKey(started);
    let att = 0;
    for (const r of s.rounds || []) att += Number(r.attempts) || 0;
    attByDay.set(key, (attByDay.get(key) || 0) + att);
  }

  const todayKey = localDayKey(nowDate);
  const cells = [];
  const cursor = new Date(startMonday);
  for (let i = 0; i < weeks * 7; i++) {
    const key = localDayKey(cursor);
    const isFuture = key > todayKey;
    cells.push({ date: key, att: isFuture ? 0 : attByDay.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

/**
 * 跨節輪次平均命中率曲線（att/mk 先相加再算 pct，非各節 pct 的平均）。
 * 只回傳到「至少 2 節包含該輪次」的最長輪次為止——輪次的樣本節數只會隨輪次增加而持平或變少，
 * 所以第一個跌破 2 節的輪次就是截止點，該輪起（含）全部砍掉，避免單節尾巴造成雜訊。
 * @param {Array} sessions
 * @returns {Array<{round:number, att:number, mk:number, pct:(number|null)}>}
 */
export function avgRoundCurve(sessions) {
  const perRound = [];
  for (const s of sessions || []) {
    (s.rounds || []).forEach((r, i) => {
      if (!perRound[i]) perRound[i] = { att: 0, mk: 0, count: 0 };
      perRound[i].att += Number(r.attempts) || 0;
      perRound[i].mk += Number(r.makes) || 0;
      perRound[i].count += 1;
    });
  }

  let cutoff = 0;
  for (let i = 0; i < perRound.length; i++) {
    if (perRound[i] && perRound[i].count >= 2) cutoff = i + 1;
    else break;
  }

  return perRound.slice(0, cutoff).map((r, i) => ({ round: i + 1, att: r.att, mk: r.mk, pct: pct(r.mk, r.att) }));
}

// ---------------------------------------------------------------------------
// M5：每輪達標預估（以「已完成輪的實際數字＋未來輪每輪 futureAttempts 球」
// 估算每條 passRule 還差幾顆、數學上是否仍可能達標）
// ---------------------------------------------------------------------------

/**
 * 挑戰達標預估：以「已完成輪的實際數字＋未來輪每輪 10 球」估算每條 passRule
 * 還需要進幾球、以及數學上是否仍可能達標。
 * @param {Array} rounds 已完成輪（session.rounds）
 * @param {Array<{type:string, minPct:number}>} rules menu.passRule
 * @param {Array<string>} futureTypes 剩餘輪次的球種陣列（呼叫端由 seqList 剩餘段 map 成 type）
 * @param {number} [futureAttempts=10] 未來每輪的假設球數
 * @returns {{feasible:boolean, detail:Array}|null} rules 為空（或非陣列）回傳 null
 */
export function challengeForecast(rounds, rules, futureTypes, futureAttempts = 10) {
  if (!Array.isArray(rules) || rules.length === 0) return null;

  const agg = aggregate(rounds);
  const types = futureTypes || [];

  const detail = rules.map((r) => {
    const d = agg.byType[r.type];
    const att = d ? d.att : 0;
    const mk = d ? d.mk : 0;

    const futureCount = types.filter((t) => t === r.type).length;
    const futureAtt = futureCount * futureAttempts;
    const plannedAtt = att + futureAtt;

    // 沿用 pctGapToShots 的 -1e-9 epsilon 手法：避免「剛好整除」時的浮點誤差
    // 把 needMakes 多進位一顆（例如 55% × 120 該是 66，不能因浮點變 67）。
    const needMakes = Math.ceil((r.minPct * plannedAtt) / 100 - 1e-9);
    const remainingNeed = Math.max(0, needMakes - mk);
    const feasible = remainingNeed <= futureAtt;

    // 只有「下一輪」剛好是這個球種時才給出具體本輪目標，且不超過該輪實際球數上限；
    // 其餘輪次分攤平均、無條件進位（寧可多要求一顆，不要低估難度）。
    const nextRoundNeed = types[0] === r.type && remainingNeed > 0
      ? Math.min(futureAttempts, Math.ceil(remainingNeed / futureCount))
      : null;

    return {
      type: r.type, need: r.minPct, att, mk, futureAtt, plannedAtt,
      needMakes, remainingNeed, feasible, nextRoundNeed,
    };
  });

  return { feasible: detail.every((d) => d.feasible), detail };
}

/**
 * 本週（週一 00:00 起，本地時區）累計出手／命中，含進行中的節。
 * @param {Array} sessions
 * @param {string|Date} now
 * @returns {{att:number, mk:number}}
 */
export function weekAttempts(sessions, now) {
  const nowDate = new Date(now);
  const monday = mondayOf(nowDate);
  const mondayMs = monday.getTime();
  const nextMondayMs = mondayMs + 7 * 24 * 60 * 60 * 1000;

  let att = 0;
  let mk = 0;
  for (const s of sessions || []) {
    const startedMs = new Date(s.startedAt).getTime();
    if (Number.isNaN(startedMs)) continue;
    if (startedMs < mondayMs || startedMs >= nextMondayMs) continue;
    for (const r of s.rounds || []) {
      att += Number(r.attempts) || 0;
      mk += Number(r.makes) || 0;
    }
  }
  return { att, mk };
}
