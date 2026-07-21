// tools/test_stats.mjs
// 純 Node 測試，不依賴任何測試框架。跑法：node tools/test_stats.mjs
import assert from 'node:assert/strict';
import {
  aggregate, pct, recentTypeAvg, todaySummary,
  roundCurve, earlyLateSplit, evaluatePassRule, sessionPct,
  isChallengeEligible, pctGapToShots, evaluateStars,
  equivalentTier, lifetimeTotals,
  sessionsInRange, pctSeries, calendarCells, avgRoundCurve, weekAttempts,
  challengeForecast, maxStreakDays, computeBadges,
  sessionRoundSeries, roundHalfSplit,
} from '../js/stats.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('aggregate()');

test('空陣列回傳全零結構', () => {
  const r = aggregate([]);
  assert.deepEqual(r, { byType: {}, bySpot: {}, total: { att: 0, mk: 0 } });
});

test('undefined 輸入視同空陣列', () => {
  const r = aggregate(undefined);
  assert.deepEqual(r, { byType: {}, bySpot: {}, total: { att: 0, mk: 0 } });
});

test('單筆 round 正確計入 byType/bySpot/total', () => {
  const r = aggregate([{ spot: 'paint', type: '2pt', attempts: 10, makes: 6 }]);
  assert.deepEqual(r.byType, { '2pt': { att: 10, mk: 6 } });
  assert.deepEqual(r.bySpot, { paint: { att: 10, mk: 6 } });
  assert.deepEqual(r.total, { att: 10, mk: 6 });
});

test('spot 為 null 不計入 bySpot，但計入 byType 與 total', () => {
  const r = aggregate([{ spot: null, type: '3pt', attempts: 10, makes: 4 }]);
  assert.deepEqual(r.bySpot, {});
  assert.deepEqual(r.byType, { '3pt': { att: 10, mk: 4 } });
  assert.deepEqual(r.total, { att: 10, mk: 4 });
});

test('多筆同球種 / 同點位會累加', () => {
  const r = aggregate([
    { spot: 'ft', type: 'ft', attempts: 10, makes: 8 },
    { spot: 'ft', type: 'ft', attempts: 5, makes: 3 },
    { spot: '3pt_top', type: '3pt', attempts: 10, makes: 4 },
  ]);
  assert.deepEqual(r.byType, { ft: { att: 15, mk: 11 }, '3pt': { att: 10, mk: 4 } });
  assert.deepEqual(r.bySpot, { ft: { att: 15, mk: 11 }, '3pt_top': { att: 10, mk: 4 } });
  assert.deepEqual(r.total, { att: 25, mk: 15 });
});

console.log('pct()');

test('att=0 回傳 null', () => {
  assert.equal(pct(0, 0), null);
});

test('一般命中率四捨五入為整數', () => {
  assert.equal(pct(1, 3), 33); // 33.33% -> 33
  assert.equal(pct(2, 3), 67); // 66.66% -> 67
});

test('全中為 100', () => {
  assert.equal(pct(10, 10), 100);
});

test('att 為負值視為無效資料回傳 null', () => {
  assert.equal(pct(0, -1), null);
});

console.log('recentTypeAvg()');

const now = '2026-07-12T12:00:00.000Z';

test('無任何 session 回傳 null', () => {
  assert.equal(recentTypeAvg([], '3pt', 7, now, null), null);
});

test('只計入指定球種、且落在近 N 天內的資料', () => {
  const sessions = [
    { id: 's1', startedAt: '2026-07-10T09:00:00.000Z', rounds: [
      { type: '3pt', attempts: 10, makes: 5 },
      { type: '2pt', attempts: 10, makes: 9 },
    ] },
  ];
  assert.equal(recentTypeAvg(sessions, '3pt', 7, now, null), 50);
});

test('7 日邊界：剛好等於 cutoff（now-7天）不計入，晚一點點才計入', () => {
  const cutoff = new Date(new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000);
  const exactlyAtCutoff = cutoff.toISOString();
  const justInside = new Date(cutoff.getTime() + 1000).toISOString();

  const sessionsAtCutoff = [
    { id: 's1', startedAt: exactlyAtCutoff, rounds: [{ type: 'ft', attempts: 10, makes: 7 }] },
  ];
  const sessionsInside = [
    { id: 's2', startedAt: justInside, rounds: [{ type: 'ft', attempts: 10, makes: 7 }] },
  ];

  assert.equal(recentTypeAvg(sessionsAtCutoff, 'ft', 7, now, null), null);
  assert.equal(recentTypeAvg(sessionsInside, 'ft', 7, now, null), 70);
});

test('超過 now 的未來資料不計入', () => {
  const future = '2026-07-13T00:00:00.000Z';
  const sessions = [
    { id: 's1', startedAt: future, rounds: [{ type: 'ft', attempts: 10, makes: 9 }] },
  ];
  assert.equal(recentTypeAvg(sessions, 'ft', 7, now, null), null);
});

test('excludeSessionId 會排除指定的本節資料', () => {
  const sessions = [
    { id: 's_current', startedAt: '2026-07-12T08:00:00.000Z', rounds: [{ type: '3pt', attempts: 10, makes: 10 }] },
    { id: 's_other', startedAt: '2026-07-11T08:00:00.000Z', rounds: [{ type: '3pt', attempts: 10, makes: 2 }] },
  ];
  assert.equal(recentTypeAvg(sessions, '3pt', 7, now, 's_current'), 20);
  assert.equal(recentTypeAvg(sessions, '3pt', 7, now, null), 60);
});

test('該球種在區間內完全沒有資料回傳 null', () => {
  const sessions = [
    { id: 's1', startedAt: '2026-07-11T08:00:00.000Z', rounds: [{ type: '2pt', attempts: 10, makes: 5 }] },
  ];
  assert.equal(recentTypeAvg(sessions, 'deep3', 7, now, null), null);
});

console.log('todaySummary()');

test('無 session 回傳 {att:0, mk:0}', () => {
  assert.deepEqual(todaySummary([], now), { att: 0, mk: 0 });
});

test('只加總同年月日（本地時區）的 session', () => {
  const today = new Date(now);
  const todayIso = today.toISOString();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const sessions = [
    { id: 's1', startedAt: todayIso, rounds: [{ type: 'ft', attempts: 10, makes: 8 }] },
    { id: 's2', startedAt: yesterday, rounds: [{ type: 'ft', attempts: 10, makes: 1 }] },
  ];
  assert.deepEqual(todaySummary(sessions, now), { att: 10, mk: 8 });
});

test('今天有多節會累加', () => {
  const sessions = [
    { id: 's1', startedAt: '2026-07-12T01:00:00.000Z', rounds: [{ type: 'ft', attempts: 10, makes: 8 }] },
    { id: 's2', startedAt: '2026-07-12T10:00:00.000Z', rounds: [{ type: '3pt', attempts: 20, makes: 6 }] },
  ];
  assert.deepEqual(todaySummary(sessions, now), { att: 30, mk: 14 });
});

console.log('roundCurve()');

test('依輪次順序回傳每輪命中率', () => {
  const rounds = [
    { attempts: 10, makes: 5 },
    { attempts: 10, makes: 8 },
    { attempts: 10, makes: 3 },
  ];
  assert.deepEqual(roundCurve(rounds), [50, 80, 30]);
});

test('attempts=0 的輪回傳 null，不影響其他輪', () => {
  const rounds = [
    { attempts: 10, makes: 4 },
    { attempts: 0, makes: 0 },
  ];
  assert.deepEqual(roundCurve(rounds), [40, null]);
});

test('空陣列回傳空陣列', () => {
  assert.deepEqual(roundCurve([]), []);
  assert.deepEqual(roundCurve(undefined), []);
});

console.log('earlyLateSplit()');

test('完全沒有 seq 資料回傳 null', () => {
  const rounds = [
    { attempts: 10, makes: 5, seq: null },
    { attempts: 10, makes: 6 }, // 沒有 seq 欄位
  ];
  assert.equal(earlyLateSplit(rounds), null);
});

test('只彙總有 seq 的輪；偶數 attempts 前後對半分', () => {
  const rounds = [
    { attempts: 10, makes: 7, seq: '1101010101' }, // 前5:11010(3中) 後5:10101(3中)
    { attempts: 10, makes: 4, seq: null }, // 無 seq，不計入
  ];
  const r = earlyLateSplit(rounds);
  assert.deepEqual(r.early, { att: 5, mk: 3 });
  assert.deepEqual(r.late, { att: 5, mk: 3 });
});

test('奇數 attempts：中位球算前半', () => {
  // 9 顆，前半 = ceil(9/2) = 5 顆（含第5顆／中位球），後半 4 顆
  const rounds = [{ attempts: 9, makes: 5, seq: '111110000' }];
  const r = earlyLateSplit(rounds);
  assert.deepEqual(r.early, { att: 5, mk: 5 });
  assert.deepEqual(r.late, { att: 4, mk: 0 });
});

test('多輪有 seq 會累加', () => {
  const rounds = [
    { attempts: 4, makes: 2, seq: '1010' }, // 前半 2 顆(1中) 後半 2 顆(1中)
    { attempts: 4, makes: 4, seq: '1111' }, // 前半 2 顆(2中) 後半 2 顆(2中)
  ];
  const r = earlyLateSplit(rounds);
  assert.deepEqual(r.early, { att: 4, mk: 3 });
  assert.deepEqual(r.late, { att: 4, mk: 3 });
});

console.log('sessionRoundSeries()');

test('空 rounds 回傳空陣列', () => {
  assert.deepEqual(sessionRoundSeries({ rounds: [] }), []);
  assert.deepEqual(sessionRoundSeries({}), []);
});

test('依輪次順序回傳 {round,att,mk,pct}，attempts=0 的輪 pct 為 null', () => {
  const session = {
    rounds: [
      { attempts: 10, makes: 6 },
      { attempts: 0, makes: 0 },
      { attempts: 8, makes: 2 },
    ],
  };
  assert.deepEqual(sessionRoundSeries(session), [
    { round: 1, att: 10, mk: 6, pct: 60 },
    { round: 2, att: 0, mk: 0, pct: null },
    { round: 3, att: 8, mk: 2, pct: 25 },
  ]);
});

console.log('roundHalfSplit()');

test('輪數 < 2 回傳 null', () => {
  assert.equal(roundHalfSplit([]), null);
  assert.equal(roundHalfSplit([{ attempts: 10, makes: 5 }]), null);
});

test('偶數輪：前後對半分', () => {
  const rounds = [
    { attempts: 10, makes: 8 },
    { attempts: 10, makes: 6 },
    { attempts: 10, makes: 4 },
    { attempts: 10, makes: 2 },
  ];
  const r = roundHalfSplit(rounds);
  assert.deepEqual(r.early, { att: 20, mk: 14, rounds: 2, pct: 70 });
  assert.deepEqual(r.late, { att: 20, mk: 6, rounds: 2, pct: 30 });
});

test('奇數輪：中間那一輪算前半', () => {
  const rounds = [
    { attempts: 10, makes: 8 },
    { attempts: 10, makes: 6 },
    { attempts: 10, makes: 4 },
  ];
  const r = roundHalfSplit(rounds);
  assert.deepEqual(r.early, { att: 20, mk: 14, rounds: 2, pct: 70 });
  assert.deepEqual(r.late, { att: 10, mk: 4, rounds: 1, pct: 40 });
});

test('該半段所有輪 attempts=0 時 pct 為 null', () => {
  const rounds = [
    { attempts: 0, makes: 0 },
    { attempts: 10, makes: 5 },
  ];
  const r = roundHalfSplit(rounds);
  assert.deepEqual(r.early, { att: 0, mk: 0, rounds: 1, pct: null });
  assert.deepEqual(r.late, { att: 10, mk: 5, rounds: 1, pct: 50 });
});

console.log('evaluatePassRule()');

test('variant 不是 full 一律不通過，detail 的 pct 皆為 null', () => {
  const session = { variant: 'easy', rounds: [{ type: '2pt', attempts: 10, makes: 10 }] };
  const rule = [{ type: '2pt', minPct: 50 }];
  const r = evaluatePassRule(session, rule);
  assert.equal(r.pass, false);
  assert.deepEqual(r.detail, [{ type: '2pt', pct: null, need: 50, att: 0, mk: 0 }]);
});

test('單一球種達標 → pass true', () => {
  const session = { variant: 'full', rounds: [{ type: '2pt', attempts: 20, makes: 12 }] };
  const rule = [{ type: '2pt', minPct: 50 }];
  const r = evaluatePassRule(session, rule);
  assert.equal(r.pass, true);
  assert.equal(r.detail[0].pct, 60);
});

test('單一球種未達標 → pass false', () => {
  const session = { variant: 'full', rounds: [{ type: '2pt', attempts: 20, makes: 8 }] };
  const rule = [{ type: '2pt', minPct: 50 }];
  const r = evaluatePassRule(session, rule);
  assert.equal(r.pass, false);
  assert.equal(r.detail[0].pct, 40);
});

test('混合球種：兩條都要達標才 pass（lin：2pt≥50 且 ft≥70）', () => {
  const rule = [{ type: '2pt', minPct: 50 }, { type: 'ft', minPct: 70 }];
  const passSession = {
    variant: 'full',
    rounds: [
      { type: '2pt', attempts: 20, makes: 11 }, // 55%
      { type: 'ft', attempts: 10, makes: 7 }, // 70%
    ],
  };
  const failSession = {
    variant: 'full',
    rounds: [
      { type: '2pt', attempts: 20, makes: 11 }, // 55%
      { type: 'ft', attempts: 10, makes: 6 }, // 60%，未達 70%
    ],
  };
  assert.equal(evaluatePassRule(passSession, rule).pass, true);
  const failResult = evaluatePassRule(failSession, rule);
  assert.equal(failResult.pass, false);
  assert.equal(failResult.detail.find((d) => d.type === 'ft').pct, 60);
});

test('該球種完全沒出手 → pct null，視為未達標', () => {
  const session = { variant: 'full', rounds: [{ type: 'ft', attempts: 10, makes: 9 }] };
  const rule = [{ type: '2pt', minPct: 50 }];
  const r = evaluatePassRule(session, rule);
  assert.equal(r.pass, false);
  assert.equal(r.detail[0].pct, null);
});

console.log('sessionPct()');

test('依總出手總命中算命中率', () => {
  const session = { rounds: [{ type: '2pt', attempts: 10, makes: 4 }, { type: 'ft', attempts: 10, makes: 6 }] };
  assert.equal(sessionPct(session), 50);
});

test('沒有任何出手回傳 null', () => {
  assert.equal(sessionPct({ rounds: [] }), null);
});

console.log('isChallengeEligible()');

test('variant 為 null 一律不合格', () => {
  assert.equal(isChallengeEligible({ variant: null, rounds: [{ at: '2026-07-12T00:00:00.000Z' }] }), false);
});

// 誠實機制 2.0（M7 第一包）：唯一標準＝輪與輪中位間隔，總時長門檻已廢除。
// ≥60s auto 列入／30–60s 看 session.paceConfirmed／<30s 不列入。
function paceSession(intervalSec, extra = {}) {
  const start = '2026-07-12T00:00:00.000Z';
  const rounds = Array.from({ length: 12 }, (_, i) => ({
    at: new Date(new Date(start).getTime() + (i + 1) * intervalSec * 1000).toISOString(),
  }));
  return {
    variant: 'full',
    startedAt: start,
    endedAt: new Date(new Date(start).getTime() + 13 * intervalSec * 1000).toISOString(),
    rounds,
    ...extra,
  };
}

test('總時長不再影響：中位間隔 ≥60 秒即合格，總時長很短也一樣', () => {
  // 12 輪 × 60 秒 = 總長僅 12 分（舊制 20 分門檻不到），2.0 照樣合格
  assert.equal(isChallengeEligible(paceSession(60)), true);
});

test('中位間隔剛好 60 秒 → auto 合格', () => {
  assert.equal(isChallengeEligible(paceSession(60)), true);
});

test('中位間隔 30–60 秒的詢問區：未回答不合格、confirmed=true 合格、false 不合格', () => {
  assert.equal(isChallengeEligible(paceSession(45)), false);
  assert.equal(isChallengeEligible(paceSession(45, { paceConfirmed: true })), true);
  assert.equal(isChallengeEligible(paceSession(45, { paceConfirmed: false })), false);
});

test('中位間隔 < 30 秒 → 不合格，paceConfirmed 也救不回來', () => {
  assert.equal(isChallengeEligible(paceSession(20)), false);
  assert.equal(isChallengeEligible(paceSession(20, { paceConfirmed: true })), false);
});

test('没有任何輪次 → 不合格', () => {
  assert.equal(isChallengeEligible({ variant: 'full', startedAt: '2026-07-12T00:00:00.000Z', endedAt: '2026-07-12T00:30:00.000Z', rounds: [] }), false);
});

console.log('evaluateStars()');

// 三星制（M7 第三包）：★1=passRule、★2=每關簽名規則、★3=每條 minPct+10pp。
// evaluateStars 是純函式不看 eligibility，rounds 依 at 排序後判定。
function starsSession(mode, roundSpecs) {
  let t = new Date('2026-07-12T00:00:00.000Z').getTime();
  const rounds = roundSpecs.map(([spot, type, makes]) => {
    t += 90 * 1000;
    return { spot, type, attempts: 10, makes, at: new Date(t).toISOString() };
  });
  return { variant: 'full', mode, rounds };
}

const dirkMenu = { id: 'dirk', challenge: true, passRule: [{ type: '2pt', minPct: 55 }] };

test('★1/★3：達門檻拿解鎖星，門檻 +10pp 才拿高標星', () => {
  const midOnly = starsSession('dirk', [['mid_top', '2pt', 6], ['mid_lw', '2pt', 6], ['mid_rw', '2pt', 6]]); // 60%
  const r1 = evaluateStars(dirkMenu, midOnly);
  assert.equal(r1.unlock, true);
  assert.equal(r1.high, false); // 60% < 65%
  const hot = starsSession('dirk', [['mid_top', '2pt', 7], ['mid_lw', '2pt', 7], ['mid_rw', '2pt', 6]]); // ~66.7%
  assert.equal(evaluateStars(dirkMenu, hot).high, true);
});

test('★2 dirk 金雞獨立：任一 2 分輪單輪 8 進', () => {
  const withEight = starsSession('dirk', [['mid_top', '2pt', 8], ['mid_lw', '2pt', 3]]);
  const without = starsSession('dirk', [['mid_top', '2pt', 7], ['mid_lw', '2pt', 7]]);
  assert.equal(evaluateStars(dirkMenu, withEight).signature, true);
  assert.equal(evaluateStars(dirkMenu, without).signature, false);
});

test('★2 lin_college 課表收官：最後一輪必須是罰球且 ≥7 進', () => {
  const menu = { id: 'lin_college', challenge: true, passRule: [{ type: '2pt', minPct: 45 }] };
  const ok = starsSession('lin_college', [['paint', '2pt', 5], ['ft', 'ft', 7]]);
  const lastNotFt = starsSession('lin_college', [['ft', 'ft', 7], ['paint', '2pt', 5]]);
  assert.equal(evaluateStars(menu, ok).signature, true);
  assert.equal(evaluateStars(menu, lastNotFt).signature, false);
});

test('★2 curry 雙修＝門檻 +5pp：深 3 剛好 40% 成立（門檻 35+5，不是 45）', () => {
  const menu = { id: 'curry', challenge: true, passRule: [{ type: '3pt', minPct: 45 }, { type: 'deep3', minPct: 35 }] };
  const s = starsSession('curry', [['3pt_top', '3pt', 5], ['deep_top', 'deep3', 4]]); // 3pt 50%、deep3 40%
  assert.equal(evaluateStars(menu, s).signature, true);
});

test('非挑戰菜單或空 rounds → 三星全 false', () => {
  const none = { unlock: false, signature: false, high: false };
  assert.deepEqual(evaluateStars({ id: 'free', challenge: false, passRule: null }, starsSession('free', [['paint', '2pt', 9]])), none);
  assert.deepEqual(evaluateStars(dirkMenu, { variant: 'full', mode: 'dirk', rounds: [] }), none);
});

console.log('pctGapToShots()');

test('差距換算：三分 36%（att=50,mk=18），門檻 40% → 差 2 顆', () => {
  assert.equal(pctGapToShots(50, 18, 40), 2);
});

test('已達標時差距為 0', () => {
  assert.equal(pctGapToShots(20, 12, 50), 0);
});

test('att<=0 無法換算，回傳 null', () => {
  assert.equal(pctGapToShots(0, 0, 50), null);
});

test('浮點數邊界：att=100, need=55% 剛好差 2 顆（不因浮點誤差多算成 3）', () => {
  // 55/100*100 在 JS 會算出 55.00000000000001，若沒處理會被 Math.ceil 多進位成 56
  assert.equal(pctGapToShots(100, 53, 55), 2);
});

console.log('equivalentTier()');

const testLadder = [
  { id: 'lin', tier: 1, name: 'Lin 起手式', challenge: true, passRule: [{ type: '2pt', minPct: 50 }, { type: 'ft', minPct: 70 }] },
  { id: 'dirk', tier: 2, name: 'Dirk 中距大師', challenge: true, passRule: [{ type: '2pt', minPct: 55 }] },
  { id: 'allen', tier: 3, name: 'Allen 三分入門', challenge: true, passRule: [{ type: '3pt', minPct: 35 }] },
  { id: 'free', tier: null, name: '自由練習', challenge: false, passRule: null },
];

test('session/menus 缺失回傳 null', () => {
  assert.equal(equivalentTier(null, testLadder), null);
  assert.equal(equivalentTier({ rounds: [] }, null), null);
});

test('樣本不足（attempts<20）即使 pct 很高也不算達標', () => {
  const session = { rounds: [{ type: '2pt', attempts: 15, makes: 15 }] }; // 100%，但只投15顆
  assert.equal(equivalentTier(session, testLadder), null);
});

test('跨球種 rule：兩種球種都要達標且都要 attempts>=20 才算過', () => {
  const crossLadder = [
    { id: 'lin', tier: 1, name: 'Lin 起手式', challenge: true, passRule: [{ type: '2pt', minPct: 50 }, { type: 'ft', minPct: 70 }] },
  ];
  const onlyOneTypeMet = {
    rounds: [
      { type: '2pt', attempts: 20, makes: 15 }, // 75%，達標
      { type: 'ft', attempts: 20, makes: 10 }, // 50%，未達 70%
    ],
  };
  const bothMet = {
    rounds: [
      { type: '2pt', attempts: 20, makes: 15 }, // 75%
      { type: 'ft', attempts: 20, makes: 15 }, // 75%
    ],
  };
  assert.equal(equivalentTier(onlyOneTypeMet, crossLadder), null);
  assert.deepEqual(equivalentTier(bothMet, crossLadder), { tier: 1, menuId: 'lin', name: 'Lin 起手式' });
});

test('剛好壓線（pct 恰好等於 minPct）算達標', () => {
  const soloLadder = [
    { id: 'dirk', tier: 2, name: 'Dirk 中距大師', challenge: true, passRule: [{ type: '2pt', minPct: 55 }] },
  ];
  const session = { rounds: [{ type: '2pt', attempts: 20, makes: 11 }] }; // 55.0% 剛好壓線
  assert.deepEqual(equivalentTier(session, soloLadder), { tier: 2, menuId: 'dirk', name: 'Dirk 中距大師' });
});

test('全不符任何一關 → 回傳 null（非挑戰菜單也會被忽略，不會誤判）', () => {
  const session = { rounds: [{ type: '2pt', attempts: 20, makes: 5 }] }; // 25%，全部關卡都不夠
  assert.equal(equivalentTier(session, testLadder), null);
});

test('由高關往低關掃，兩關都達標時回傳較高的那關', () => {
  const session = {
    rounds: [{ type: '2pt', attempts: 20, makes: 12 }], // 60%，dirk(55%)與lin的2pt(50%)都達標
  };
  // lin 還需要 ft，這節沒有 ft 資料，所以只有 dirk 會過；驗證回傳 dirk（tier2）而非更低的 lin
  assert.deepEqual(equivalentTier(session, testLadder), { tier: 2, menuId: 'dirk', name: 'Dirk 中距大師' });
});

test('絕不寫入任何 progress 結構——equivalentTier 是純函式，回傳值只含 tier/menuId/name', () => {
  const session = { rounds: [{ type: '2pt', attempts: 20, makes: 20 }, { type: 'ft', attempts: 20, makes: 20 }] };
  const result = equivalentTier(session, testLadder);
  assert.deepEqual(Object.keys(result).sort(), ['menuId', 'name', 'tier']);
});

console.log('lifetimeTotals()');

test('空陣列回傳 {att:0, mk:0}', () => {
  assert.deepEqual(lifetimeTotals([]), { att: 0, mk: 0 });
  assert.deepEqual(lifetimeTotals(undefined), { att: 0, mk: 0 });
});

test('加總所有節（含自由練習、含尚未結束的節）的所有輪次', () => {
  const sessions = [
    { id: 's1', mode: 'lin', endedAt: '2026-07-01T00:00:00.000Z', rounds: [{ type: '2pt', attempts: 10, makes: 6 }] },
    { id: 's2', mode: 'free', endedAt: '2026-07-02T00:00:00.000Z', rounds: [{ type: '3pt', attempts: 5, makes: 2 }] },
    { id: 's3', mode: 'world', endedAt: null, rounds: [{ type: 'ft', attempts: 3, makes: 3 }] },
  ];
  assert.deepEqual(lifetimeTotals(sessions), { att: 18, mk: 11 });
});

console.log('sessionsInRange()');

test('進行中節（endedAt=null）一律排除', () => {
  const sessions = [{ id: 's1', endedAt: null, startedAt: now }];
  assert.deepEqual(sessionsInRange(sessions, 7, now), []);
});

test('邊界：剛好 N 天前不計入，晚一點點才計入', () => {
  const cutoffIso = new Date(new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const justInsideIso = new Date(new Date(cutoffIso).getTime() + 1000).toISOString();
  const sessions = [
    { id: 's_at', endedAt: cutoffIso, startedAt: cutoffIso },
    { id: 's_in', endedAt: justInsideIso, startedAt: justInsideIso },
  ];
  assert.deepEqual(sessionsInRange(sessions, 7, now).map((s) => s.id), ['s_in']);
});

test('days=null（全部）不設下限，但仍要求 endedAt!==null', () => {
  const sessions = [
    { id: 's_old', endedAt: '2020-01-01T00:00:00.000Z', startedAt: '2020-01-01T00:00:00.000Z' },
    { id: 's_inprogress', endedAt: null, startedAt: now },
  ];
  assert.deepEqual(sessionsInRange(sessions, null, now).map((s) => s.id), ['s_old']);
});

test('超過 now 的未來節不計入', () => {
  const future = new Date(new Date(now).getTime() + 1000).toISOString();
  const sessions = [{ id: 's_future', endedAt: future, startedAt: future }];
  assert.deepEqual(sessionsInRange(sessions, 7, now), []);
});

console.log('pctSeries()');

test('day bucket：依本地年月日分組，只回有出手的日子，依日期升冪', () => {
  const d1 = new Date(now);
  d1.setDate(d1.getDate() - 2);
  const d2 = new Date(now);
  d2.setDate(d2.getDate() - 1);
  const sessions = [
    { id: 's1', endedAt: d1.toISOString(), startedAt: d1.toISOString(), rounds: [{ type: '3pt', attempts: 10, makes: 4 }] },
    { id: 's2', endedAt: d2.toISOString(), startedAt: d2.toISOString(), rounds: [{ type: '3pt', attempts: 10, makes: 6 }] },
  ];
  const series = pctSeries(sessions, { type: null, bucket: 'day', now, days: 7 });
  assert.equal(series.length, 2);
  assert.deepEqual(series.map((p) => p.pct), [40, 60]);
  assert.ok(series[0].key < series[1].key); // 依日期升冪
});

test('type 篩選：只計指定球種；type=null 計全部球種', () => {
  const sessions = [
    { id: 's1', endedAt: now, startedAt: now, rounds: [
      { type: '2pt', attempts: 10, makes: 5 },
      { type: '3pt', attempts: 10, makes: 3 },
    ] },
  ];
  const only3pt = pctSeries(sessions, { type: '3pt', bucket: 'day', now, days: 7 });
  assert.deepEqual(only3pt.map((p) => ({ att: p.att, mk: p.mk })), [{ att: 10, mk: 3 }]);
  const all = pctSeries(sessions, { type: null, bucket: 'day', now, days: 7 });
  assert.deepEqual(all.map((p) => ({ att: p.att, mk: p.mk })), [{ att: 20, mk: 8 }]);
});

test('week bucket：週一為一週之始，同週不同天分在同一個 bucket', () => {
  const base = new Date(now);
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = monday.getDay();
  monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
  const wednesday = new Date(monday);
  wednesday.setDate(wednesday.getDate() + 2);

  const sessions = [
    { id: 's_mon', endedAt: monday.toISOString(), startedAt: monday.toISOString(), rounds: [{ type: 'ft', attempts: 10, makes: 8 }] },
    { id: 's_wed', endedAt: wednesday.toISOString(), startedAt: wednesday.toISOString(), rounds: [{ type: 'ft', attempts: 10, makes: 2 }] },
  ];
  const series = pctSeries(sessions, { type: 'ft', bucket: 'week', now, days: null });
  assert.equal(series.length, 1);
  assert.deepEqual({ att: series[0].att, mk: series[0].mk }, { att: 20, mk: 10 });
});

test('沒有出手的 bucket 不會出現在結果中', () => {
  const sessions = [{ id: 's1', endedAt: now, startedAt: now, rounds: [] }];
  assert.deepEqual(pctSeries(sessions, { type: null, bucket: 'day', now, days: 7 }), []);
});

test('跨月：不同月份的日子各自成一個 bucket', () => {
  const monthAgo = new Date(new Date(now).getTime() - 35 * 24 * 60 * 60 * 1000);
  const sessions = [
    { id: 's_old', endedAt: monthAgo.toISOString(), startedAt: monthAgo.toISOString(), rounds: [{ type: 'ft', attempts: 10, makes: 5 }] },
    { id: 's_new', endedAt: now, startedAt: now, rounds: [{ type: 'ft', attempts: 10, makes: 5 }] },
  ];
  const series = pctSeries(sessions, { type: 'ft', bucket: 'day', now, days: null });
  assert.equal(series.length, 2);
});

console.log('calendarCells()');

function parseLocalDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

test('長度固定為 weeks*7', () => {
  assert.equal(calendarCells([], now, 26).length, 26 * 7);
});

test('第一格是「now 當週週一」往回推 weeks-1 週的週一', () => {
  const cells = calendarCells([], now, 3);
  assert.equal(parseLocalDateKey(cells[0].date).getDay(), 1); // 週一
});

test('每一列的第一格都是週一（依序 7 天一組）', () => {
  const cells = calendarCells([], now, 4);
  for (let w = 0; w < 4; w++) {
    assert.equal(parseLocalDateKey(cells[w * 7].date).getDay(), 1);
  }
});

test('依時間升冪排列，最後一格是 now 當週的週日', () => {
  const cells = calendarCells([], now, 2);
  assert.equal(parseLocalDateKey(cells[cells.length - 1].date).getDay(), 0); // 週日
});

test('未來的日子 att 固定為 0', () => {
  const cells = calendarCells([], now, 1);
  const nowDate = new Date(now);
  const todayKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
  const todayIdx = cells.findIndex((c) => c.date === todayKey);
  assert.ok(todayIdx !== -1);
  for (let i = todayIdx + 1; i < cells.length; i++) {
    assert.equal(cells[i].att, 0);
  }
});

test('當日出手數正確加總進對應格子', () => {
  const sessions = [
    { id: 's1', endedAt: now, startedAt: now, rounds: [{ attempts: 10, makes: 5 }, { attempts: 5, makes: 2 }] },
  ];
  const cells = calendarCells(sessions, now, 1);
  const nowDate = new Date(now);
  const todayKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
  assert.equal(cells.find((c) => c.date === todayKey).att, 15);
});

test('跨年：weeks 夠大時往回推可以跨到前一年，日期字串格式與升冪順序仍正確', () => {
  const cells = calendarCells([], '2026-01-05T12:00:00.000Z', 10);
  assert.equal(cells.length, 70);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(cells[0].date));
  assert.ok(cells[0].date < cells[cells.length - 1].date);
});

console.log('avgRoundCurve()');

test('空陣列回傳空陣列', () => {
  assert.deepEqual(avgRoundCurve([]), []);
});

test('att/mk 是加權彙總（相加後才算 pct），不是各節 pct 的平均', () => {
  const sessions = [
    { rounds: [{ attempts: 10, makes: 5 }] }, // 50%
    { rounds: [{ attempts: 20, makes: 4 }] }, // 20%
  ];
  // 加權：(5+4)/(10+20)=30%；若誤用平均 (50+20)/2=35% 就會測出錯
  const curve = avgRoundCurve(sessions);
  assert.deepEqual(curve, [{ round: 1, att: 30, mk: 9, pct: 30 }]);
});

test('樣本數 <2 節的尾巴輪次會被截掉', () => {
  const sessions = [
    { rounds: [{ attempts: 10, makes: 5 }, { attempts: 10, makes: 5 }, { attempts: 10, makes: 5 }] }, // 3 輪
    { rounds: [{ attempts: 10, makes: 5 }, { attempts: 10, makes: 5 }] }, // 2 輪
  ];
  // 第1、2輪都有 2 節樣本，第3輪只有 1 節樣本 → 截掉
  const curve = avgRoundCurve(sessions);
  assert.deepEqual(curve.map((c) => c.round), [1, 2]);
});

test('只有 1 節時整條曲線都被截掉（每輪樣本數都是 1）', () => {
  const sessions = [{ rounds: [{ attempts: 10, makes: 5 }, { attempts: 10, makes: 5 }] }];
  assert.deepEqual(avgRoundCurve(sessions), []);
});

console.log('weekAttempts()');

function mondayOfForTest(iso) {
  const d = new Date(iso);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = midnight.getDay();
  midnight.setDate(midnight.getDate() + (dow === 0 ? -6 : 1 - dow));
  return midnight;
}

test('週一 00:00 起算：週一 00:00:00 與週日 23:59:59 都算本週', () => {
  const monday = mondayOfForTest(now);
  const sundayNight = new Date(monday);
  sundayNight.setDate(sundayNight.getDate() + 6);
  sundayNight.setHours(23, 59, 59, 999);

  const sessions = [
    { startedAt: monday.toISOString(), rounds: [{ attempts: 10, makes: 5 }] },
    { startedAt: sundayNight.toISOString(), rounds: [{ attempts: 4, makes: 1 }] },
  ];
  assert.deepEqual(weekAttempts(sessions, sundayNight), { att: 14, mk: 6 });
});

test('上週日深夜（本週一 00:00 前 1 毫秒）不計入本週', () => {
  const monday = mondayOfForTest(now);
  const justBefore = new Date(monday.getTime() - 1);
  const sessions = [{ startedAt: justBefore.toISOString(), rounds: [{ attempts: 10, makes: 5 }] }];
  assert.deepEqual(weekAttempts(sessions, now), { att: 0, mk: 0 });
});

test('進行中的節（endedAt 為 null）也計入', () => {
  const monday = mondayOfForTest(now);
  const sessions = [{ startedAt: monday.toISOString(), endedAt: null, rounds: [{ attempts: 10, makes: 5 }] }];
  assert.deepEqual(weekAttempts(sessions, now), { att: 10, mk: 5 });
});

test('沒有任何節回傳 {att:0, mk:0}', () => {
  assert.deepEqual(weekAttempts([], now), { att: 0, mk: 0 });
});

console.log('challengeForecast()');

test('rules 空陣列（或非陣列）回傳 null', () => {
  assert.equal(challengeForecast([], [], ['2pt']), null);
  assert.equal(challengeForecast([], null, ['2pt']), null);
  assert.equal(challengeForecast([], undefined, ['2pt']), null);
});

test('1. 開局預估：rounds=[]、rule 2pt≥50%、future 4 輪 2pt → plannedAtt 40、needMakes 20、nextRoundNeed 5', () => {
  const rules = [{ type: '2pt', minPct: 50 }];
  const futureTypes = ['2pt', '2pt', '2pt', '2pt'];
  const res = challengeForecast([], rules, futureTypes, 10);
  assert.equal(res.feasible, true);
  const d = res.detail[0];
  assert.deepEqual(
    { att: d.att, mk: d.mk, futureAtt: d.futureAtt, plannedAtt: d.plannedAtt, needMakes: d.needMakes, remainingNeed: d.remainingNeed, nextRoundNeed: d.nextRoundNeed },
    { att: 0, mk: 0, futureAtt: 40, plannedAtt: 40, needMakes: 20, remainingNeed: 20, nextRoundNeed: 5 }
  );
});

test('2. 進度落後但可追：needMakes 邊界／ceil 進位／nextRoundNeed 平均分攤上限 10', () => {
  const rounds = [{ type: '2pt', attempts: 20, makes: 1 }];
  const rules = [{ type: '2pt', minPct: 50 }];
  const futureTypes = ['2pt', '2pt']; // 剩 2 輪，futureAttempts=10 → futureAtt=20
  const res = challengeForecast(rounds, rules, futureTypes, 10);
  const d = res.detail[0];
  // plannedAtt=40，needMakes=ceil(0.5*40-eps)=20，remainingNeed=20-1=19，19<=20 仍可追
  assert.equal(d.plannedAtt, 40);
  assert.equal(d.needMakes, 20);
  assert.equal(d.remainingNeed, 19);
  assert.equal(d.feasible, true);
  assert.equal(res.feasible, true);
  // ceil(19/2)=10，剛好等於 futureAttempts 的上限，驗證分攤＋上限公式
  assert.equal(d.nextRoundNeed, 10);
});

test('3. 不可達標：remainingNeed > futureAtt → feasible false', () => {
  const rounds = [{ type: '2pt', attempts: 20, makes: 2 }];
  const rules = [{ type: '2pt', minPct: 70 }];
  const futureTypes = ['2pt', '2pt']; // futureAtt=20
  const res = challengeForecast(rounds, rules, futureTypes, 10);
  const d = res.detail[0];
  // plannedAtt=40，needMakes=ceil(0.7*40-eps)=28，remainingNeed=28-2=26 > futureAtt(20)
  assert.equal(d.needMakes, 28);
  assert.equal(d.remainingNeed, 26);
  assert.equal(d.feasible, false);
  assert.equal(res.feasible, false);
});

test('4. 已達標鎖定：mk ≥ needMakes → remainingNeed 0、nextRoundNeed null', () => {
  const rounds = [{ type: '2pt', attempts: 20, makes: 15 }];
  const rules = [{ type: '2pt', minPct: 50 }];
  const futureTypes = ['2pt'];
  const res = challengeForecast(rounds, rules, futureTypes, 10);
  const d = res.detail[0];
  // plannedAtt=30，needMakes=ceil(0.5*30-eps)=15，mk=15 已達標
  assert.equal(d.needMakes, 15);
  assert.equal(d.remainingNeed, 0);
  assert.equal(d.feasible, true);
  assert.equal(d.nextRoundNeed, null);
  assert.equal(res.feasible, true);
});

test('5. 多條 rule（curry 型）一條可行一條不可行 → 整體 false', () => {
  const rounds = [
    { type: '3pt', attempts: 20, makes: 9 },
    { type: 'deep3', attempts: 10, makes: 0 },
  ];
  const rules = [{ type: '3pt', minPct: 45 }, { type: 'deep3', minPct: 80 }];
  const futureTypes = ['3pt', '3pt', 'deep3'];
  const res = challengeForecast(rounds, rules, futureTypes, 10);

  const d3pt = res.detail[0];
  // 3pt：futureCount=2 → futureAtt=20，plannedAtt=40，needMakes=ceil(0.45*40-eps)=18，remainingNeed=9，可行
  assert.equal(d3pt.futureAtt, 20);
  assert.equal(d3pt.needMakes, 18);
  assert.equal(d3pt.remainingNeed, 9);
  assert.equal(d3pt.feasible, true);
  // futureTypes[0]==='3pt' → 有 nextRoundNeed
  assert.equal(d3pt.nextRoundNeed, 5);

  const dDeep3 = res.detail[1];
  // deep3：futureCount=1 → futureAtt=10，plannedAtt=20，needMakes=ceil(0.8*20-eps)=16，remainingNeed=16 > 10，不可行
  assert.equal(dDeep3.futureAtt, 10);
  assert.equal(dDeep3.needMakes, 16);
  assert.equal(dDeep3.remainingNeed, 16);
  assert.equal(dDeep3.feasible, false);
  // futureTypes[0] 是 '3pt' 不是 'deep3'，即使 remainingNeed>0 也不給本輪目標
  assert.equal(dDeep3.nextRoundNeed, null);

  assert.equal(res.feasible, false);
});

test('6. epsilon 案例：need 55%、plannedAtt 120 → needMakes 66（不得因浮點變 67）', () => {
  const rules = [{ type: '2pt', minPct: 55 }];
  const futureTypes = Array.from({ length: 12 }, () => '2pt'); // 12 輪 × 10 球 = 120
  const res = challengeForecast([], rules, futureTypes, 10);
  assert.equal(res.detail[0].plannedAtt, 120);
  assert.equal(res.detail[0].needMakes, 66);
});

test('7. futureTypes 空陣列的收尾判定：已達標則 feasible true，未達標則 feasible false', () => {
  const rulesMet = [{ type: '2pt', minPct: 50 }];
  const resMet = challengeForecast([{ type: '2pt', attempts: 20, makes: 11 }], rulesMet, [], 10);
  const dMet = resMet.detail[0];
  assert.equal(dMet.futureAtt, 0);
  assert.equal(dMet.plannedAtt, 20);
  assert.equal(dMet.needMakes, 10);
  assert.equal(dMet.remainingNeed, 0);
  assert.equal(dMet.feasible, true);
  assert.equal(dMet.nextRoundNeed, null);
  assert.equal(resMet.feasible, true);

  const resNotMet = challengeForecast([{ type: '2pt', attempts: 20, makes: 5 }], rulesMet, [], 10);
  const dNotMet = resNotMet.detail[0];
  assert.equal(dNotMet.remainingNeed, 5);
  assert.equal(dNotMet.feasible, false); // 剩 0 球額度但還差 5 顆，已無法達標
  assert.equal(resNotMet.feasible, false);
});

console.log('maxStreakDays()');

/** 產生「某天有一節已結束練習」的 session（相對今天往回 offset 天）。 */
function dayFixture(dayOffset, att = 10) {
  const t = new Date();
  t.setDate(t.getDate() - dayOffset);
  t.setHours(10, 0, 0, 0);
  return {
    startedAt: t.toISOString(),
    endedAt: new Date(t.getTime() + 3600000).toISOString(),
    rounds: [{ attempts: att, makes: Math.floor(att / 2), type: '2pt' }],
  };
}

test('空陣列回傳 0；單日回傳 1', () => {
  assert.equal(maxStreakDays([]), 0);
  assert.equal(maxStreakDays([dayFixture(0)]), 1);
});

test('歷史最長連續：中斷後重來，取最長的一段', () => {
  // 10/9/8 三連＋5/4 兩連 → 3
  const sessions = [10, 9, 8, 5, 4].map((d) => dayFixture(d));
  assert.equal(maxStreakDays(sessions), 3);
});

test('最長一段在很久以前也算（不像 streakDays 只看現在）', () => {
  // 30〜26 五連（已中斷）＋今天 1 天 → 5
  const sessions = [30, 29, 28, 27, 26, 0].map((d) => dayFixture(d));
  assert.equal(maxStreakDays(sessions), 5);
});

test('未結束的節不算天；同一天多節只算一天', () => {
  const unfinished = { ...dayFixture(1), endedAt: null };
  assert.equal(maxStreakDays([unfinished]), 0);
  assert.equal(maxStreakDays([dayFixture(0), dayFixture(0), dayFixture(1)]), 2);
});

console.log('computeBadges()');

test('全零 → 沒有任何徽章', () => {
  assert.deepEqual(computeBadges([], new Date()), []);
});

test('出席五級門檻：連續 14 天拿 3/7/14，拿不到 30/60', () => {
  const sessions = Array.from({ length: 14 }, (_, i) => dayFixture(i));
  const badges = computeBadges(sessions, new Date());
  assert.ok(badges.includes('streak_3') && badges.includes('streak_7') && badges.includes('streak_14'));
  assert.ok(!badges.includes('streak_30') && !badges.includes('streak_60'));
});

test('投量六級門檻：累計 2,600 顆拿 1000/2500，拿不到 5000 以上', () => {
  const sessions = [dayFixture(0, 2600)];
  const badges = computeBadges(sessions, new Date());
  assert.ok(badges.includes('volume_1000') && badges.includes('volume_2500'));
  assert.ok(!badges.includes('volume_5000') && !badges.includes('volume_25000') && !badges.includes('volume_50000'));
});

test('streak 中斷只看現在：昨天前天有練、今天沒練 → 不發連續徽章', () => {
  // streakDays 從 now 往回數，今天沒練 → 0（maxStreakDays 才看歷史，那是 migration 的事）
  const sessions = [dayFixture(1), dayFixture(2), dayFixture(3)];
  const badges = computeBadges(sessions, new Date());
  assert.ok(!badges.some((b) => b.startsWith('streak_')));
});

console.log(`\n${passed} 個測試通過`);
if (process.exitCode) {
  console.error('\nFAIL — 有測試未通過');
} else {
  console.log('\nPASS');
}
