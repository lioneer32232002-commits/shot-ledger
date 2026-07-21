// js/statspage.js
// 統計分頁（#/stats）：週目標卡 → 期間切換 → 命中率趨勢 → 熱力格日曆（固定近 26 週）
// → 全期熱區 → 疲勞趨勢。比照 history.js／session.js 的 UI 模組慣例：export mount/unmount。

import * as store from './store.js';
import { renderCourt } from './court.js';
import {
  aggregate, pct, sessionsInRange, pctSeries, calendarCells, avgRoundCurve, weekAttempts,
  lifetimeTotals, sessionRoundSeries, roundHalfSplit,
} from './stats.js';
import { formatThousands } from './session.js';
import { badgeWallHtml } from './badges.js';
import { pageBannerHtml } from './pagebanner.js';
import { getMenu } from './menus.js';
import { openLifetimeShareSheet } from './sharecard.js';

const PERIODS = [
  { key: '7', label: '7 天', days: 7 },
  { key: '30', label: '30 天', days: 30 },
  { key: 'all', label: '全部', days: null },
];

const TYPE_CHIPS = [
  { key: 'all', label: '全部', type: null },
  { key: '2pt', label: '2 分', type: '2pt' },
  { key: '3pt', label: '3 分', type: '3pt' },
  { key: 'deep3', label: '深 3', type: 'deep3' },
  { key: 'ft', label: '罰球', type: 'ft' },
  { key: 'layup', label: '上籃', type: 'layup' },
];

const CALENDAR_WEEKS = 26;
const GOAL_QUICK_OPTIONS = [300, 600, 1200];

let root = null;
let state = null;
let periodKey = '30';
let typeKey = 'all';
let goalSheetOpen = false;
let goalCustomValue = '';
// 疲勞趨勢「單場逐輪」目前選中的場次索引（0＝最近一場，往舊遞增），SPEC_M10 §1.1：
// 切換期間／球種 chip 重繪、或 mount() 時都要歸 0。
let fatigueIdx = 0;

export function mount(container) {
  root = container;
  state = store.load();
  periodKey = '30';
  typeKey = 'all';
  goalSheetOpen = false;
  goalCustomValue = '';
  fatigueIdx = 0;
  render();
  root.addEventListener('click', onStatsClick);
}

export function unmount() {
  if (root) root.removeEventListener('click', onStatsClick);
  root = null;
  goalSheetOpen = false;
}

function currentPeriod() {
  return PERIODS.find((p) => p.key === periodKey) || PERIODS[1];
}

function currentTypeChip() {
  return TYPE_CHIPS.find((c) => c.key === typeKey) || TYPE_CHIPS[0];
}

// ---------------------------------------------------------------------------
// 主渲染
// ---------------------------------------------------------------------------

function render() {
  if (!root) return;
  const now = new Date();
  const period = currentPeriod();

  const heat = buildHeatSection(period, now);

  root.innerHTML = `
    <div class="page page--stats">
      ${pageBannerHtml("stats")}
      ${renderLifetimeCard()}
      ${renderBadgeSection(now)}
      ${renderWeeklyGoalCard(now)}
      ${renderPeriodSwitch()}
      ${renderTrendSection(now, period)}
      ${renderCalendarSection(now)}
      ${heat.html}
      ${renderFatigueSection(period, now)}
    </div>
  `;

  if (heat.hasSpotData) {
    renderCourt(root.querySelector('#stats-heat-court'), { mode: 'heat', heat: heat.bySpot });
  }

  const scrollEl = root.querySelector('[data-role="heat-cal-scroll"]');
  if (scrollEl) scrollEl.scrollLeft = scrollEl.scrollWidth;
}

// ---------------------------------------------------------------------------
// 1.2 徽章牆（自設定頁搬來：成就跟生涯累計同性質，設定頁只留資料／主題／備份）
// ---------------------------------------------------------------------------

function renderBadgeSection(now) {
  return `
    <section class="stats-block">
      <h2 class="section-title">徽章</h2>
      ${badgeWallHtml(state, now)}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 1.1 生涯累計卡（SPEC M5.1 §3：總球數一眼可見，回答「總球數去哪看」）
// ---------------------------------------------------------------------------

function renderLifetimeCard() {
  const lifetime = lifetimeTotals(state.sessions);
  const lifetimePct = pct(lifetime.mk, lifetime.att);
  // 練習次數只算已結束的 session；輪次含進行中的一節（與設定頁「N 次練習 / M 輪」算法一致）。
  const sessionCount = state.sessions.filter((s) => s.endedAt !== null).length;
  const roundCount = state.sessions.reduce((sum, s) => sum + s.rounds.length, 0);

  return `
    <section class="lifetime-card">
      <div class="lifetime-card__head">
        <h2 class="section-title">生涯累計</h2>
        ${lifetime.att === 0 ? '' : `<button type="button" class="lifetime-card__share" data-action="share-lifetime">分享</button>`}
      </div>
      <div class="lifetime-card__totals">
        <div class="lifetime-card__total"><div class="lifetime-card__num">${formatThousands(lifetime.att)}</div><div class="lifetime-card__label">總投</div></div>
        <div class="lifetime-card__total"><div class="lifetime-card__num">${formatThousands(lifetime.mk)}</div><div class="lifetime-card__label">總中</div></div>
        <div class="lifetime-card__total"><div class="lifetime-card__num lifetime-card__num--accent">${lifetimePct === null ? '—' : lifetimePct + '%'}</div><div class="lifetime-card__label">命中率</div></div>
      </div>
      <p class="lifetime-card__meta nowrap">${sessionCount} 次練習・${roundCount} 輪</p>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 2. 週目標卡
// ---------------------------------------------------------------------------

function weekDaysLeftLabel(now) {
  const dow = now.getDay(); // 0=週日
  const daysLeft = dow === 0 ? 0 : 7 - dow;
  return daysLeft === 0 ? '今天是最後一天' : `還剩 ${daysLeft} 天`;
}

function renderWeeklyGoalCard(now) {
  const goal = state.settings.weeklyGoal;
  const wk = weekAttempts(state.sessions, now);

  let bodyHtml;
  const cardClasses = ['goal-card'];

  if (!goal) {
    cardClasses.push('goal-card--empty');
    bodyHtml = `
      <p class="goal-card__prompt">給自己一個每週投量目標</p>
      <button class="btn btn--secondary" data-action="open-goal-sheet">設定目標</button>
    `;
  } else {
    const ratio = Math.max(0, Math.min(100, Math.round((wk.att / goal) * 100)));
    const achieved = wk.att >= goal;
    if (achieved) cardClasses.push('is-achieved');
    const lineText = achieved ? `本週目標達成！${wk.att} / ${goal} 球` : `本週 ${wk.att} / ${goal} 球`;
    bodyHtml = `
      <div class="goal-card__head">
        <span class="goal-card__title">本週目標</span>
        <button class="goal-card__edit" data-action="open-goal-sheet">編輯</button>
      </div>
      <div class="goal-card__track"><div class="goal-card__fill" style="width:${ratio}%"></div></div>
      <p class="goal-card__line nowrap">${lineText}</p>
      <p class="goal-card__days">${weekDaysLeftLabel(now)}</p>
    `;
  }

  return `
    <section class="${cardClasses.join(' ')}">${bodyHtml}</section>
    ${goalSheetOpen ? renderGoalSheetHtml() : ''}
  `;
}

function renderGoalSheetHtml() {
  const current = state.settings.weeklyGoal;
  return `
    <div class="sheet-backdrop" data-action="close-goal-sheet">
      <div class="sheet">
        <h3 class="sheet__title">設定每週投量目標</h3>
        <div class="goal-quick-options">
          ${GOAL_QUICK_OPTIONS.map((n) => `
            <button class="goal-quick-btn ${current === n ? 'is-active' : ''}" data-goal-quick="${n}">
              <span class="nowrap">${n} 球</span>
            </button>
          `).join('')}
        </div>
        <div class="goal-custom-row">
          <input type="number" min="1" max="9999" step="1" inputmode="numeric" class="text-input"
            placeholder="自訂數字（1–9999）" data-role="goal-custom-input" value="${goalCustomValue}" />
          <button class="btn btn--primary" data-action="confirm-goal-custom">確認</button>
        </div>
        ${current ? `<button class="btn btn--ghost-danger" data-action="turn-off-goal">關閉目標</button>` : ''}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 1.2 期間切換
// ---------------------------------------------------------------------------

function renderPeriodSwitch() {
  return `
    <div class="segmented" role="group" aria-label="統計期間">
      ${PERIODS.map((p) => `<button class="segmented__btn ${p.key === periodKey ? 'is-active' : ''}" data-period="${p.key}">${p.label}</button>`).join('')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 1.3 命中率折線
// ---------------------------------------------------------------------------

function shortDateLabelFromKey(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

function keyToLocalMs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function renderPctChart(series, bucket) {
  if (series.length < 2) {
    return `<p class="stats-empty-note">至少要有兩天的紀錄才能畫趨勢——今天練一次吧</p>`;
  }

  const W = 320;
  const H = 168;
  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const firstMs = keyToLocalMs(series[0].key);
  const lastMs = keyToLocalMs(series[series.length - 1].key);
  const bucketMs = (bucket === 'week' ? 7 : 1) * 24 * 60 * 60 * 1000;
  const span = Math.max(lastMs - firstMs, bucketMs);

  const points = series.map((p) => {
    const xFrac = (keyToLocalMs(p.key) - firstMs) / span;
    return {
      x: padL + xFrac * plotW,
      y: padT + (1 - p.pct / 100) * plotH,
      key: p.key,
    };
  });

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  const dotsMarkup = points
    .map((pt) => `<circle class="pct-chart__dot" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" />`)
    .join('');

  const grid = [0, 50, 100]
    .map((v) => {
      const gy = padT + (1 - v / 100) * plotH;
      return `
        <line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" class="pct-chart__grid-line" />
        <text x="0" y="${(gy + 3).toFixed(1)}" class="pct-chart__grid-label">${v}</text>
      `;
    })
    .join('');

  // 最多標 5 個刻度，避免擠：等距取樣點索引，並確保頭尾都在內。
  const maxLabels = Math.min(5, points.length);
  const step = Math.max(1, Math.round((points.length - 1) / Math.max(1, maxLabels - 1)));
  const labelIdxs = [];
  for (let i = 0; i < points.length; i += step) labelIdxs.push(i);
  if (labelIdxs[labelIdxs.length - 1] !== points.length - 1) labelIdxs.push(points.length - 1);

  const labelsMarkup = labelIdxs
    .map((i) => `<text x="${points[i].x.toFixed(1)}" y="${H - 6}" class="pct-chart__x-label" text-anchor="middle">${shortDateLabelFromKey(series[i].key)}</text>`)
    .join('');

  return `
    <svg class="pct-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${grid}
      <path d="${pathD}" class="pct-chart__line" fill="none" />
      ${dotsMarkup}
      ${labelsMarkup}
    </svg>
  `;
}

function renderTrendSection(now, period) {
  const bucket = period.days === null ? 'week' : 'day';
  const chip = currentTypeChip();
  const series = pctSeries(state.sessions, { type: chip.type, bucket, now, days: period.days });

  const chipsHtml = TYPE_CHIPS.map(
    (c) => `<button class="option-segmented__btn ${c.key === typeKey ? 'is-active' : ''}" data-type="${c.key}">${c.label}</button>`
  ).join('');

  return `
    <section class="stats-block">
      <h2 class="section-title">命中率趨勢</h2>
      <div class="option-segmented option-segmented--scroll" role="group" aria-label="球種篩選">${chipsHtml}</div>
      ${renderPctChart(series, bucket)}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 1.4 熱力格日曆（固定近 26 週，不受期間切換影響）
// ---------------------------------------------------------------------------

function heatCalLevel(att) {
  if (att <= 0) return 0;
  if (att < 60) return 1;
  if (att < 120) return 2;
  return 3;
}

function todayKeyOf(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function renderHeatCalendar(cells, weeks, now) {
  const todayKey = todayKeyOf(now);
  const columns = [];
  for (let w = 0; w < weeks; w++) columns.push(cells.slice(w * 7, w * 7 + 7));

  let prevMonth = null;
  const colsHtml = columns
    .map((col) => {
      const [y, m] = col[0].date.split('-').map(Number);
      const monthLabel = m !== prevMonth ? `${m} 月` : '';
      prevMonth = m;

      const cellsHtml = col
        .map((cell) => {
          const isFuture = cell.date > todayKey;
          const isToday = cell.date === todayKey;
          const cls = ['heat-cal__cell'];
          if (isToday) cls.push('is-today');
          if (isFuture) cls.push('is-future');
          const level = isFuture ? '' : ` data-level="${heatCalLevel(cell.att)}"`;
          const title = isFuture ? '' : ` title="${cell.date}：${cell.att} 投"`;
          return `<div class="${cls.join(' ')}"${level}${title}></div>`;
        })
        .join('');

      return `
        <div class="heat-cal__col">
          <div class="heat-cal__month nowrap">${monthLabel}</div>
          <div class="heat-cal__days">${cellsHtml}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="heat-cal">
      <div class="heat-cal__scroll" data-role="heat-cal-scroll">${colsHtml}</div>
    </div>
    <div class="heat-cal__legend">
      <span>少</span>
      <span class="heat-cal__legend-cell" data-level="0"></span>
      <span class="heat-cal__legend-cell" data-level="1"></span>
      <span class="heat-cal__legend-cell" data-level="2"></span>
      <span class="heat-cal__legend-cell" data-level="3"></span>
      <span>多</span>
    </div>
  `;
}

function renderCalendarSection(now) {
  const cells = calendarCells(state.sessions, now, CALENDAR_WEEKS);
  return `
    <section class="stats-block">
      <h2 class="section-title">最近半年</h2>
      ${renderHeatCalendar(cells, CALENDAR_WEEKS, now)}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 1.5 全期熱區
// ---------------------------------------------------------------------------

function buildHeatSection(period, now) {
  const inRange = sessionsInRange(state.sessions, period.days, now);
  const rounds = inRange.flatMap((s) => s.rounds || []);
  const agg = aggregate(rounds);
  const hasSpotData = Object.keys(agg.bySpot).length > 0;
  const totalPct = pct(agg.total.mk, agg.total.att);

  const body = hasSpotData
    ? `<div id="stats-heat-court"></div><p class="stats-heat-summary nowrap">${period.label}共 ${agg.total.att} 投 / ${agg.total.mk} 中（${totalPct === null ? '—' : totalPct + '%'}）</p>`
    : `<p class="stats-empty-note">這段期間還沒有點位紀錄</p>`;

  return {
    html: `<section class="stats-block"><h2 class="section-title">全期熱區</h2>${body}</section>`,
    bySpot: agg.bySpot,
    hasSpotData,
  };
}

// ---------------------------------------------------------------------------
// 1.6 疲勞趨勢
// ---------------------------------------------------------------------------

function sumRange(curve, from, to) {
  return curve.slice(from, to).reduce((acc, r) => ({ att: acc.att + r.att, mk: acc.mk + r.mk }), { att: 0, mk: 0 });
}

function renderAvgRoundCurveChart(curve) {
  const W = 320;
  const H = 150;
  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = curve.length;

  const xAt = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (p) => padT + (1 - (p === null ? 0 : p) / 100) * plotH;

  const boundaryX = n > 3 ? (xAt(2) + xAt(3)) / 2 : xAt(n - 1);
  const bandsMarkup = `
    <rect x="${padL}" y="${padT}" width="${(boundaryX - padL).toFixed(1)}" height="${plotH}" class="round-chart__band round-chart__band--early" />
    <rect x="${boundaryX.toFixed(1)}" y="${padT}" width="${(W - padR - boundaryX).toFixed(1)}" height="${plotH}" class="round-chart__band round-chart__band--late" />
  `;

  const points = curve.map((r, i) => ({ x: xAt(i), y: yAt(r.pct) }));
  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  const dotsMarkup = points.map((pt) => `<circle class="pct-chart__dot" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" />`).join('');

  const maxLabels = Math.min(6, n);
  const step = Math.max(1, Math.round((n - 1) / Math.max(1, maxLabels - 1)));
  const labelIdxs = [];
  for (let i = 0; i < n; i += step) labelIdxs.push(i);
  if (labelIdxs[labelIdxs.length - 1] !== n - 1) labelIdxs.push(n - 1);
  const labelsMarkup = labelIdxs
    .map((i) => `<text x="${points[i].x.toFixed(1)}" y="${H - 6}" class="pct-chart__x-label" text-anchor="middle">#${i + 1}</text>`)
    .join('');

  return `
    <svg class="pct-chart round-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${bandsMarkup}
      <path d="${pathD}" class="pct-chart__line" fill="none" />
      ${dotsMarkup}
      ${labelsMarkup}
    </svg>
  `;
}

/**
 * 單場逐輪折線圖（SPEC_M10 §1.2）：幾何與 class 照抄 renderAvgRoundCurveChart，
 * 差別是資料換成單場的每輪實際命中率、前後段分界改成該場輪次的前半／後半交界，
 * 且 attempts===0 的輪（pct===null）不畫點、折線在該處斷開（分段 path，不用 0 值假裝有資料）。
 */
function renderSessionRoundChart(series) {
  const W = 320;
  const H = 150;
  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = series.length;

  const xAt = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (p) => padT + (1 - p / 100) * plotH;

  // 前後段分界＝前半／後半輪的交界（該場叫用端已保證 n>=2，half-1／half 一定是合法索引）。
  const half = Math.ceil(n / 2);
  const boundaryX = (xAt(half - 1) + xAt(half)) / 2;
  const bandsMarkup = `
    <rect x="${padL}" y="${padT}" width="${(boundaryX - padL).toFixed(1)}" height="${plotH}" class="round-chart__band round-chart__band--early" />
    <rect x="${boundaryX.toFixed(1)}" y="${padT}" width="${(W - padR - boundaryX).toFixed(1)}" height="${plotH}" class="round-chart__band round-chart__band--late" />
  `;

  // 0 出手的輪 pct===null：不畫點、折線斷開——用「是否正在畫一段」的旗標分段組 path，
  // 而不是把 null 當 0 硬接上去（那樣會偽造出一個假的谷底）。
  let pathD = '';
  let drawing = false;
  const dotsMarkup = [];
  series.forEach((r, i) => {
    if (r.pct === null) {
      drawing = false;
      return;
    }
    const x = xAt(i);
    const y = yAt(r.pct);
    pathD += `${drawing ? ' L' : (pathD ? ' M' : 'M')} ${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
    dotsMarkup.push(`<circle class="pct-chart__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" />`);
  });

  const maxLabels = Math.min(6, n);
  const step = Math.max(1, Math.round((n - 1) / Math.max(1, maxLabels - 1)));
  const labelIdxs = [];
  for (let i = 0; i < n; i += step) labelIdxs.push(i);
  if (labelIdxs[labelIdxs.length - 1] !== n - 1) labelIdxs.push(n - 1);
  const labelsMarkup = labelIdxs
    .map((i) => `<text x="${xAt(i).toFixed(1)}" y="${H - 6}" class="pct-chart__x-label" text-anchor="middle">#${i + 1}</text>`)
    .join('');

  return `
    <svg class="pct-chart round-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${bandsMarkup}
      <path d="${pathD}" class="pct-chart__line" fill="none" />
      ${dotsMarkup.join('')}
      ${labelsMarkup}
    </svg>
  `;
}

/** 前後半命中率差，格式化成帶正負號的 pp 字串（±0pp／+3pp／-14pp）。 */
function formatDiffPp(diff) {
  if (diff > 0) return `+${diff}pp`;
  if (diff < 0) return `${diff}pp`;
  return '±0pp';
}

/** 挑戰菜單場次（easy／full 都算）、且輪數 >=2，才有意義畫「單場逐輪」（SPEC_M10 §1.1）。 */
function challengeSessionsInRange(inRange) {
  return inRange
    .filter((s) => {
      const menu = getMenu(s.mode);
      return !!menu && menu.challenge === true && s.rounds && s.rounds.length >= 2;
    })
    .slice()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/** 場次切換列＋逐輪圖＋摘要句（SPEC_M10 §1.1〜§1.3）。fatigueIdx 越界時夾回範圍內。 */
function renderSessionRoundBlock(sessions) {
  if (sessions.length === 0) {
    return `<p class="stats-empty-note">這段期間還沒有挑戰紀錄——去挑戰階梯打一場吧</p>`;
  }

  if (fatigueIdx >= sessions.length) fatigueIdx = sessions.length - 1;
  if (fatigueIdx < 0) fatigueIdx = 0;

  const n = sessions.length;
  const k = fatigueIdx + 1;
  const session = sessions[fatigueIdx];
  const menu = getMenu(session.mode);
  const d = new Date(session.startedAt);
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
  const variantSuffix = session.variant === 'easy' ? '・簡易' : '';
  const titleText = `${menu ? menu.name : session.mode}${variantSuffix} · ${dateLabel}`;
  const prevDisabled = fatigueIdx >= n - 1; // 已經是最舊一場，'‹' 不能再往舊
  const nextDisabled = fatigueIdx <= 0; // 已經是最近一場，'›' 不能再往新

  const series = sessionRoundSeries(session);

  let summaryHtml = '';
  if (session.rounds.length >= 4) {
    const split = roundHalfSplit(session.rounds);
    if (split) {
      const eP = split.early.pct;
      const lP = split.late.pct;
      summaryHtml = eP === null || lP === null
        ? `<p class="fatigue-summary nowrap">前 ${split.early.rounds} 輪 —，後 ${split.late.rounds} 輪 —</p>`
        : `<p class="fatigue-summary nowrap">前 ${split.early.rounds} 輪 ${eP}%，後 ${split.late.rounds} 輪 ${lP}%（${formatDiffPp(lP - eP)}）</p>`;
    }
  }

  return `
    <div class="fatigue-nav">
      <button type="button" class="fatigue-nav__btn" data-action="fatigue-prev" ${prevDisabled ? 'disabled' : ''} aria-label="較舊場次">‹</button>
      <span class="fatigue-nav__title nowrap">${titleText}</span>
      <button type="button" class="fatigue-nav__btn" data-action="fatigue-next" ${nextDisabled ? 'disabled' : ''} aria-label="較新場次">›</button>
    </div>
    <p class="fatigue-nav__count">第 ${k} / ${n} 場</p>
    ${renderSessionRoundChart(series)}
    ${summaryHtml}
  `;
}

function renderFatigueSection(period, now) {
  const inRange = sessionsInRange(state.sessions, period.days, now);
  const curve = avgRoundCurve(inRange);

  let curveBlock;
  if (curve.length < 4) {
    curveBlock = `<p class="stats-empty-note">多練幾次完整版，才看得出第幾輪開始掉</p>`;
  } else {
    const early = sumRange(curve, 0, 3);
    const late = sumRange(curve, 3, curve.length);
    const a = pct(early.mk, early.att);
    const b = pct(late.mk, late.att);
    curveBlock = `
      ${renderAvgRoundCurveChart(curve)}
      <p class="fatigue-summary nowrap">第 1–3 輪 ${a === null ? '—' : a + '%'}，第 4 輪起 ${b === null ? '—' : b + '%'}</p>
    `;
  }

  const challengeSessions = challengeSessionsInRange(inRange);

  return `
    <section class="stats-block">
      <h2 class="section-title">疲勞趨勢</h2>
      <div class="stats-subsection">
        <h3 class="stats-subtitle">輪次曲線（多次練習平均）</h3>
        ${curveBlock}
      </div>
      <div class="stats-subsection">
        <h3 class="stats-subtitle">單場逐輪</h3>
        ${renderSessionRoundBlock(challengeSessions)}
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// 事件委派
// ---------------------------------------------------------------------------

function onStatsClick(e) {
  // 週目標 sheet 的背景遮罩：只認直接點到遮罩本身，避免點 sheet 內容誤觸關閉。
  if (e.target.matches('[data-action="close-goal-sheet"]')) {
    goalSheetOpen = false;
    render();
    return;
  }

  const periodBtn = e.target.closest('[data-period]');
  if (periodBtn) {
    periodKey = periodBtn.dataset.period;
    fatigueIdx = 0; // SPEC_M10 §1.1：切換期間，單場逐輪回到最近一場
    render();
    return;
  }

  const typeBtn = e.target.closest('[data-type]');
  if (typeBtn) {
    typeKey = typeBtn.dataset.type;
    fatigueIdx = 0; // SPEC_M10 §1.1：切換球種 chip 重繪，單場逐輪回到最近一場
    render();
    return;
  }

  const quickBtn = e.target.closest('[data-goal-quick]');
  if (quickBtn) {
    store.setWeeklyGoal(state, Number(quickBtn.dataset.goalQuick));
    goalSheetOpen = false;
    render();
    return;
  }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'open-goal-sheet') {
    goalSheetOpen = true;
    goalCustomValue = '';
    render();
    return;
  }
  if (action === 'confirm-goal-custom') {
    const input = root.querySelector('[data-role="goal-custom-input"]');
    const n = Math.round(Number(input.value));
    if (Number.isInteger(n) && n >= 1 && n <= 9999) {
      store.setWeeklyGoal(state, n);
      goalSheetOpen = false;
      render();
    }
    return;
  }
  if (action === 'turn-off-goal') {
    store.setWeeklyGoal(state, null);
    goalSheetOpen = false;
    render();
    return;
  }
  if (action === 'share-lifetime') {
    openLifetimeShareSheet(state);
    return;
  }
  if (action === 'fatigue-prev') {
    fatigueIdx += 1; // '‹' 往較舊場次
    render();
    return;
  }
  if (action === 'fatigue-next') {
    fatigueIdx -= 1; // '›' 往較新場次
    render();
    return;
  }
}
