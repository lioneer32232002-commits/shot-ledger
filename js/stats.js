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

/**
 * 挑戰資格（誠實機制）：完整版總時長需 ≥20 分、簡易版 ≥10 分，
 * 且輪與輪之間的中位間隔需 ≥90 秒，才算是「真實練習節奏」。
 * variant 為 null（自由練習等）一律不合格（此函式本來就只給挑戰節用）。
 * @param {Object} session
 * @returns {boolean}
 */
export function isChallengeEligible(session) {
  if (!session || !session.variant) return false;
  const rounds = session.rounds || [];
  if (rounds.length === 0) return false;

  const startMs = new Date(session.startedAt).getTime();
  const lastRoundMs = new Date(rounds[rounds.length - 1].at).getTime();
  const endMs = session.endedAt ? new Date(session.endedAt).getTime() : lastRoundMs;
  const durationMin = (endMs - startMs) / 60000;
  const minDuration = session.variant === 'full' ? 20 : 10;
  if (!(durationMin >= minDuration)) return false;

  const roundTimes = rounds.map((r) => new Date(r.at).getTime()).sort((a, b) => a - b);
  const intervals = [];
  for (let i = 1; i < roundTimes.length; i++) {
    intervals.push((roundTimes[i] - roundTimes[i - 1]) / 1000);
  }
  if (intervals.length > 0) {
    intervals.sort((a, b) => a - b);
    const mid = Math.floor(intervals.length / 2);
    const median = intervals.length % 2 === 0 ? (intervals[mid - 1] + intervals[mid]) / 2 : intervals[mid];
    if (!(median >= 90)) return false;
  }

  return true;
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
