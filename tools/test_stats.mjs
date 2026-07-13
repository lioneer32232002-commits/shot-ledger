// tools/test_stats.mjs
// 純 Node 測試，不依賴任何測試框架。跑法：node tools/test_stats.mjs
import assert from 'node:assert/strict';
import {
  aggregate, pct, recentTypeAvg, todaySummary,
  roundCurve, earlyLateSplit, evaluatePassRule, sessionPct,
  isChallengeEligible, pctGapToShots,
  equivalentTier, lifetimeTotals,
  sessionsInRange, pctSeries, calendarCells, avgRoundCurve, weekAttempts,
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

test('完整版時長邊界：剛好 20 分合格，19 分 59 秒不合格', () => {
  const start = '2026-07-12T00:00:00.000Z';
  const rounds = Array.from({ length: 12 }, (_, i) => ({
    at: new Date(new Date(start).getTime() + (i + 1) * 100 * 1000).toISOString(), // 每輪間隔 100 秒 >90
  }));
  const okSession = { variant: 'full', startedAt: start, endedAt: new Date(new Date(start).getTime() + 20 * 60000).toISOString(), rounds };
  const shortSession = { variant: 'full', startedAt: start, endedAt: new Date(new Date(start).getTime() + 20 * 60000 - 1000).toISOString(), rounds };
  assert.equal(isChallengeEligible(okSession), true);
  assert.equal(isChallengeEligible(shortSession), false);
});

test('簡易版時長邊界：剛好 10 分合格', () => {
  const start = '2026-07-12T00:00:00.000Z';
  const rounds = Array.from({ length: 6 }, (_, i) => ({
    at: new Date(new Date(start).getTime() + (i + 1) * 100 * 1000).toISOString(),
  }));
  const okSession = { variant: 'easy', startedAt: start, endedAt: new Date(new Date(start).getTime() + 10 * 60000).toISOString(), rounds };
  assert.equal(isChallengeEligible(okSession), true);
});

test('輪間中位間隔 < 90 秒 → 不合格（時長足夠但節奏太快）', () => {
  const start = '2026-07-12T00:00:00.000Z';
  // 12 輪，間隔 30 秒一輪（總時長仍可能被拉長到 20 分靠最後一輪，但中位間隔仍是 30 秒）
  const rounds = Array.from({ length: 12 }, (_, i) => ({
    at: new Date(new Date(start).getTime() + (i + 1) * 30 * 1000).toISOString(),
  }));
  const session = {
    variant: 'full',
    startedAt: start,
    endedAt: new Date(new Date(start).getTime() + 25 * 60000).toISOString(),
    rounds,
  };
  assert.equal(isChallengeEligible(session), false);
});

test('輪間中位間隔剛好 90 秒 → 合格', () => {
  const start = '2026-07-12T00:00:00.000Z';
  const rounds = Array.from({ length: 12 }, (_, i) => ({
    at: new Date(new Date(start).getTime() + (i + 1) * 90 * 1000).toISOString(),
  }));
  const session = {
    variant: 'full',
    startedAt: start,
    endedAt: new Date(new Date(start).getTime() + 25 * 60000).toISOString(),
    rounds,
  };
  assert.equal(isChallengeEligible(session), true);
});

test('没有任何輪次 → 不合格', () => {
  assert.equal(isChallengeEligible({ variant: 'full', startedAt: '2026-07-12T00:00:00.000Z', endedAt: '2026-07-12T00:30:00.000Z', rounds: [] }), false);
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

console.log(`\n${passed} 個測試通過`);
if (process.exitCode) {
  console.error('\nFAIL — 有測試未通過');
} else {
  console.log('\nPASS');
}
