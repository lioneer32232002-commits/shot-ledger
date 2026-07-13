// js/session.js
// 練球分頁：挑戰主視覺首頁 → 變體選擇 → 輪次記錄（快速／逐球）→ 本節統計。
// 掛載於 app.js 的 hash router（#/train）。

import * as store from './store.js';
import { MENUS, getMenu, getMenuRounds, ladderMenus, nextMenuId, playerStatusLabel } from './menus.js';
import { renderCourt, getSpot, typeLabel } from './court.js';
import {
  aggregate, pct, recentTypeAvg, todaySummary,
  roundCurve, earlyLateSplit, evaluatePassRule, sessionPct,
  isChallengeEligible, pctGapToShots, typeAvgAllTime, computeBadges,
  equivalentTier, lifetimeTotals, weekAttempts,
} from './stats.js';
import { openShareSheet } from './sharecard.js';

const TYPE_OPTIONS = ['2pt', '3pt', 'deep3', 'ft'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export const BADGE_LABEL = {
  ladder_complete: '全破挑戰階梯',
  streak_3: '連續練習 3 天',
  streak_7: '連續練習 7 天',
  streak_30: '連續練習 30 天',
  volume_1000: '累計 1,000 顆',
  volume_5000: '累計 5,000 顆',
  volume_10000: '累計 10,000 顆',
};

let root = null;
let state = null;
let initialized = false; // 是否已做過「繼續上次練習」偵測（只在整個 app 生命週期問一次）

// ---- 練球中的暫存狀態（不落地存 storage，只有 addRound 之後才存） ----
let view = 'home'; // 'confirmContinue' | 'home' | 'active' | 'summary'
let activeSession = null;
let pendingSpot = null;
let pendingType = null;
let attemptsForRound = 10;
let editingRoundIndex = null;
let editingSeq = null; // 修改輪次時，若該輪有 seq 則用逐球陣列編輯
let attemptsStepperOpen = false;
let confirmDiscard = false;
let toastMessage = null;
let toastHideTimer = null;
let timerId = null;
let inputMode = 'quick'; // 'quick' | 'seq'，跨節記住（存在 settings）
let pendingSeq = []; // 逐球模式下，目前這輪的 boolean 陣列
let variantSheetMenuId = null; // 首頁：正在選變體（簡易/完整）的菜單 id
let menuComplete = false; // 菜單模式下，seqList 所有輪次已記錄完但尚未按「結束並結算」（§4）
let justFinishedResult = null; // 剛結束本節時算出的挑戰結果（給結束頁做慶祝動畫用）
let pendingRetry = null; // 從其他分頁按「再挑戰一次」時，記著要開的菜單，等 train 分頁掛載時執行

function makeEmptySeq(n) {
  return Array.from({ length: n }, () => false);
}

export function mount(container) {
  root = container;
  state = store.load();
  inputMode = state.settings.inputMode || 'quick';

  if (pendingRetry) {
    const { menuId, variant } = pendingRetry;
    pendingRetry = null;
    activeSession = null;
    startSession(menuId, variant);
    return;
  }

  if (!initialized) {
    initialized = true;
    const inProgress = store.findInProgressSession(state);
    if (inProgress) {
      activeSession = inProgress;
      view = 'confirmContinue';
      renderView();
      return;
    }
  }
  renderView();
}

export function unmount() {
  stopTimer();
  attemptsStepperOpen = false;
  editingRoundIndex = null;
  editingSeq = null;
  confirmDiscard = false;
  variantSheetMenuId = null;
  menuComplete = false;
  clearTimeout(toastHideTimer);
  toastMessage = null;
  if (root) root.removeEventListener('click', onActiveClick);
  root = null;
}

// ---------------------------------------------------------------------------
// 時間格式
// ---------------------------------------------------------------------------

export function formatDateTime(iso) {
  const d = new Date(iso);
  const wd = WEEKDAYS[d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}（週${wd}） ${hh}:${mi}`;
}

export function formatDuration(startIso, endIso) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分鐘`;
}

function formatShortDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 千分位逗號（生涯累計數用）。 */
export function formatThousands(n) {
  return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatElapsed(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    const el = root && root.querySelector('.js-elapsed');
    if (el && activeSession) el.textContent = formatElapsed(activeSession.startedAt);
  }, 1000);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function variantLabel(variant) {
  if (variant === 'full') return '完整版';
  if (variant === 'easy') return '簡易版';
  return '';
}

// ---------------------------------------------------------------------------
// Router 內的視圖分派
// ---------------------------------------------------------------------------

function renderView() {
  if (!root) return;
  if (view === 'confirmContinue') return renderConfirmContinue();
  if (view === 'home') return renderHome();
  if (view === 'active') return renderActive();
  if (view === 'summary') return renderSummaryView();
}

// ---------------------------------------------------------------------------
// A. 首頁：挑戰主視覺（Hero + 階梯）＋ 今日小結 ＋ 非挑戰小卡
// ---------------------------------------------------------------------------

function currentLadderState() {
  const ladder = ladderMenus();
  const unlockedIds = state.progress.unlocked;
  const passedIds = ladder
    .filter((m) => {
      const next = nextMenuId(m.id);
      if (next) return unlockedIds.includes(next);
      return state.progress.badges.includes('ladder_complete');
    })
    .map((m) => m.id);

  let currentMenu = ladder.find((m) => unlockedIds.includes(m.id) && !passedIds.includes(m.id));
  if (!currentMenu) currentMenu = ladder[ladder.length - 1];

  return { ladder, unlockedIds, passedIds, currentMenu };
}

function latestFullSession(menuId) {
  const list = state.sessions.filter((s) => s.mode === menuId && s.variant === 'full' && s.endedAt);
  if (list.length === 0) return null;
  return list.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
}

function lockIconSvg() {
  return `<svg class="lock-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="2"/>
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function renderPassRuleBars(detail) {
  if (!detail || detail.length === 0) return '';
  return `
    <div class="rule-bars">
      ${detail.map((d) => {
        const p = d.pct === null ? 0 : Math.min(100, d.pct);
        const met = d.pct !== null && d.pct >= d.need;
        const needPos = Math.min(100, d.need);
        return `
          <div class="rule-bar ${met ? 'is-met' : ''}">
            <div class="rule-bar__label">
              <span>${typeLabel(d.type)}</span>
              <span>${d.pct === null ? '—' : d.pct + '%'} ／ 門檻 ${d.need}%</span>
            </div>
            <div class="rule-bar__track">
              <div class="rule-bar__fill" style="width:${p}%"></div>
              <div class="rule-bar__need" style="left:${needPos}%"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 球員生涯數據面板「夜幕數據面板」（數據與查證紀錄在 menus.js 的 career 欄位，
// 這裡純呈現，不改任何數字／文案）。passRule 只用來決定哪一欄要用 accent 色高亮：
// 2pt→FG 欄、3pt／deep3→3P 欄、ft→罰球欄；多條 rule 可同時高亮多欄。
function renderCareerHtml(career, passRule) {
  if (!career) return '';
  const ruleTypes = (passRule || []).map((r) => r.type);
  const stats = [
    { value: `${career.fg}%`, label: '投籃 FG', accent: ruleTypes.includes('2pt') },
    { value: `${career.tp}%`, label: '三分 3P', accent: ruleTypes.includes('3pt') || ruleTypes.includes('deep3') },
    { value: `${career.ft}%`, label: '罰球 FT', accent: ruleTypes.includes('ft') },
    // 第 4 欄是生涯三分命中顆數，欄位標籤已說明單位，不再帶「顆」字。
    { value: formatThousands(career.tpm), label: '三分命中', accent: false },
  ];
  const statsHtml = stats.map((s) => `
    <div class="career-panel__stat">
      <span class="career-panel__stat-value nowrap${s.accent ? ' is-accent' : ''}">${s.value}</span>
      <span class="career-panel__stat-label nowrap">${s.label}</span>
    </div>
  `).join('');
  return `
    <div class="career-panel">
      <div class="career-panel__caption">
        <span class="nowrap">NBA ${career.years}</span>
        <span class="nowrap">生涯數據</span>
      </div>
      <div class="career-panel__stats">${statsHtml}</div>
      <p class="career-panel__fact">${career.fact}</p>
    </div>
  `;
}

function renderHeroCard(menu, isPassed) {
  const best = state.progress.best[menu.id];
  const bestHtml = best
    ? `<span class="nowrap">${best.pct}%</span> <span class="hero-card__best-date nowrap">（${formatShortDate(best.date)}）</span>`
    : '尚無完整版紀錄';
  const recentFull = latestFullSession(menu.id);

  const gapHtml = recentFull
    ? renderPassRuleBars(evaluatePassRule(recentFull, menu.passRule).detail)
    : `<p class="hero-card__gap-empty">先完成一次完整版挑戰，就能看到跟解鎖條件的差距。</p>`;

  // 關卡序號浮水印（雜誌刊號感，氛圍用，資訊仍以「第 X 關 / 6」小字為準）
  const bignum = String(menu.tier).padStart(2, '0');

  return `
    <section class="hero-card">
      <span class="hero-card__bignum" aria-hidden="true">${bignum}</span>
      <div class="hero-card__top">
        <span class="hero-card__tier">第 ${menu.tier} 關 / 6</span>
        ${isPassed ? '<span class="hero-card__passed">✓ 已通過</span>' : ''}
      </div>
      <h2 class="hero-card__name">${menu.name}</h2>
      <p class="hero-card__player">${menu.player}　<span class="hero-card__status">${playerStatusLabel(menu.playerStatus)}</span></p>
      ${renderCareerHtml(menu.career, menu.passRule)}
      <p class="hero-card__focus">${menu.focus}</p>
      <p class="inspired-note">依公開報導風格改編的靈感版本・單人可執行</p>
      ${gapHtml}
      <div class="hero-card__bottom-row">
        <div class="hero-card__best">個人最佳（完整版）：<strong>${bestHtml}</strong></div>
        <button class="hero-card__cta-circle" data-open-variant="${menu.id}" aria-label="開始挑戰">SHOT</button>
      </div>
    </section>
  `;
}

function renderLadderRow(ladder, unlockedIds, passedIds, currentId) {
  const tiles = ladder.map((m) => {
    const unlocked = unlockedIds.includes(m.id);
    const passed = passedIds.includes(m.id);
    const isCurrent = m.id === currentId;
    const cls = ['ladder-tile'];
    if (!unlocked) cls.push('is-locked');
    if (passed) cls.push('is-passed');
    if (isCurrent) cls.push('is-current');
    return `
      <button class="${cls.join(' ')}" ${unlocked ? `data-open-variant="${m.id}"` : 'disabled'}>
        <span class="ladder-tile__tier">${m.tier}</span>
        <span class="ladder-tile__name">${m.short || m.name}</span>
        ${passed ? '<span class="ladder-tile__check" aria-hidden="true">✓</span>' : ''}
        ${!unlocked ? `<span class="ladder-tile__lock">${lockIconSvg()}<span class="ladder-tile__cond">${m.passDesc}</span></span>` : ''}
      </button>
    `;
  }).join('');
  return `
    <section class="ladder-row">
      <h2 class="section-title">挑戰階梯</h2>
      <div class="ladder-scroll">${tiles}</div>
    </section>
  `;
}

function renderSecondaryCard(menu) {
  if (!menu.easy) {
    return `
      <button class="secondary-card" data-start-free="1">
        <h3 class="secondary-card__name">${menu.name}</h3>
        <p class="secondary-card__focus">${menu.focus}</p>
      </button>
    `;
  }
  return `
    <button class="secondary-card" data-open-variant="${menu.id}">
      <h3 class="secondary-card__name">${menu.name}</h3>
      <p class="secondary-card__focus">${menu.focus}</p>
    </button>
  `;
}

function renderVariantSheetHtml(menu) {
  const isChallenge = menu.challenge;
  return `
    <div class="sheet-backdrop" data-action="close-variant">
      <div class="sheet">
        <h3 class="sheet__title">${menu.name}</h3>
        ${isChallenge ? `<p class="sheet__sub">解鎖下一關只認完整版：${menu.passDesc}</p>` : ''}
        <div class="variant-options">
          <button class="variant-option" data-variant="easy">
            <span class="variant-option__name">簡易版</span>
            <span class="variant-option__meta">約 ${menu.est.easy} 分・${menu.easy.length} 輪・${menu.easy.length * 10} 球</span>
          </button>
          <button class="variant-option" data-variant="full">
            <span class="variant-option__name">完整版</span>
            <span class="variant-option__meta">約 ${menu.est.full} 分・${menu.full.length} 輪・${menu.full.length * 10} 球</span>
          </button>
        </div>
        ${menu.basis ? `
          <p class="sheet__basis">📋 菜單依據：${menu.basis.text}<a class="sheet__basis-link" href="${menu.basis.url}" target="_blank" rel="noopener">（${menu.basis.source}）</a></p>
        ` : ''}
        ${isChallenge ? `
          <p class="sheet__eligibility-note">誠實機制：完整版總時長需 ≥20 分、簡易版 ≥10 分，且輪與輪節奏不能過快，才會列入解鎖評估；沒達標也照樣存檔進統計。</p>
          <p class="sheet__honesty-line">挑戰靠自主誠實——這些數據是投給未來的你看的。</p>
        ` : ''}
      </div>
    </div>
  `;
}

/** 全生涯已完成節（依開始時間新到舊）；沒有任何一節結束過則回傳 null。用於「再來一次」快速重開。 */
function lastFinishedSession() {
  const list = state.sessions.filter((s) => s.endedAt !== null);
  if (list.length === 0) return null;
  return list.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
}

function renderLifetimeLine(cls) {
  const lifetime = lifetimeTotals(state.sessions);
  const lifetimePct = pct(lifetime.mk, lifetime.att);
  const line = `累計 ${formatThousands(lifetime.att)} 投 / ${formatThousands(lifetime.mk)} 中${lifetimePct === null ? '' : `（${lifetimePct}%）`}`;
  return `<p class="${cls} nowrap">${line}</p>`;
}

/** 已設定週目標時才顯示這行，未設定不推銷（比照週目標卡邏輯，週一為一週之始）。 */
function renderWeeklyGoalLine(cls) {
  const goal = state.settings.weeklyGoal;
  if (!goal) return '';
  const wk = weekAttempts(state.sessions, new Date());
  return `<p class="${cls} nowrap">本週 ${wk.att}/${goal} 球</p>`;
}

function renderQuickRestartHtml() {
  const last = lastFinishedSession();
  if (!last) return '';
  const menu = getMenu(last.mode);
  if (!menu) return '';
  const vLabel = variantLabel(last.variant);
  const label = `${menu.name}${vLabel ? '・' + vLabel : ''}`;
  return `
    <button class="quick-restart" data-action="quick-restart">
      <span class="quick-restart__icon" aria-hidden="true">▶</span>
      <span class="quick-restart__label">再來一次：<strong>${label}</strong></span>
    </button>
  `;
}

function renderHome() {
  const today = todaySummary(state.sessions, new Date());
  const todayPct = pct(today.mk, today.att);

  const summaryHtml =
    today.att > 0
      ? `<div class="today-summary">
           <div class="today-summary__row">
             <span class="today-summary__value nowrap">今天 <strong>${today.att}</strong> 投 <strong>${today.mk}</strong> 中</span>
             <span class="today-summary__pct nowrap">${todayPct}%</span>
           </div>
           ${renderLifetimeLine('today-summary__lifetime')}
           ${renderWeeklyGoalLine('today-summary__weekly')}
         </div>`
      : `<div class="today-summary today-summary--empty">
           <div class="today-summary__row"><span>今天還沒開始投，選個模式開始練習吧。</span></div>
           ${renderLifetimeLine('today-summary__lifetime')}
           ${renderWeeklyGoalLine('today-summary__weekly')}
         </div>`;

  const { ladder, unlockedIds, passedIds, currentMenu } = currentLadderState();
  const heroHtml = renderHeroCard(currentMenu, passedIds.includes(currentMenu.id));
  const quickRestartHtml = renderQuickRestartHtml();
  const ladderHtml = renderLadderRow(ladder, unlockedIds, passedIds, currentMenu.id);

  const secondary = MENUS.filter((m) => !m.challenge);
  const secondaryHtml = secondary.map(renderSecondaryCard).join('');

  root.innerHTML = `
    <div class="page page--home">
      <header class="page-header"><h1>練球</h1></header>
      ${heroHtml}
      ${quickRestartHtml}
      ${ladderHtml}
      ${summaryHtml}
      <section class="secondary-list">
        <h2 class="section-title">其他模式</h2>
        <div class="secondary-cards">${secondaryHtml}</div>
      </section>
    </div>
    ${variantSheetMenuId ? renderVariantSheetHtml(getMenu(variantSheetMenuId)) : ''}
  `;

  root.querySelectorAll('[data-open-variant]').forEach((el) => {
    el.addEventListener('click', () => {
      variantSheetMenuId = el.dataset.openVariant;
      renderHome();
    });
  });
  root.querySelectorAll('[data-start-free]').forEach((el) => {
    el.addEventListener('click', () => startSession('free', null));
  });
  const quickRestartBtn = root.querySelector('[data-action="quick-restart"]');
  if (quickRestartBtn) {
    quickRestartBtn.addEventListener('click', () => {
      const last = lastFinishedSession();
      if (!last) return;
      startSession(last.mode, last.variant);
    });
  }

  if (variantSheetMenuId) bindVariantSheet();
}

function bindVariantSheet() {
  const backdrop = root.querySelector('.sheet-backdrop[data-action="close-variant"]');
  if (!backdrop) return;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      variantSheetMenuId = null;
      renderHome();
    }
  });
  root.querySelectorAll('[data-variant]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const variant = btn.dataset.variant;
      const menuId = variantSheetMenuId;
      variantSheetMenuId = null;
      startSession(menuId, variant);
    });
  });
}

function startSession(modeId, variant) {
  const menu = getMenu(modeId);
  if (!menu) return;
  activeSession = store.startSession(state, modeId, variant);
  attemptsForRound = 10;
  editingRoundIndex = null;
  editingSeq = null;
  confirmDiscard = false;
  attemptsStepperOpen = false;
  menuComplete = false;
  inputMode = state.settings.inputMode || 'quick';
  pendingSeq = makeEmptySeq(attemptsForRound);

  const seqList = getMenuRounds(menu, variant);
  if (seqList) {
    const spotId = seqList[0];
    pendingSpot = spotId;
    pendingType = getSpot(spotId).type;
  } else {
    pendingSpot = null;
    pendingType = null;
  }

  view = 'active';
  startTimer();
  renderView();
}

/** 從「再挑戰一次」呼叫：不管目前在哪個分頁都能安全重開同菜單同變體。 */
function requestRetry(menuId, variant) {
  pendingRetry = { menuId, variant };
  if (location.hash === '#/train' || location.hash === '' || location.hash === '#/') {
    const { menuId: mId, variant: v } = pendingRetry;
    pendingRetry = null;
    activeSession = null;
    startSession(mId, v);
  } else {
    location.hash = '#/train';
  }
}

// ---------------------------------------------------------------------------
// 繼續 / 捨棄上次未收尾的練習
// ---------------------------------------------------------------------------

function renderConfirmContinue() {
  const menu = getMenu(activeSession.mode);
  const vLabel = variantLabel(activeSession.variant);
  root.innerHTML = `
    <div class="page page--confirm">
      <div class="confirm-card">
        <h2>繼續上次練習？</h2>
        <p>偵測到尚未結束的練習：<strong>${menu ? menu.name : activeSession.mode}</strong>${vLabel ? `（${vLabel}）` : ''}，
        已完成 <span class="nowrap">${activeSession.rounds.length} 輪</span>，開始於 <span class="nowrap">${formatDateTime(activeSession.startedAt)}</span>。</p>
        <div class="confirm-actions">
          <button class="btn btn--ghost" data-action="discard-continue">捨棄</button>
          <button class="btn btn--primary" data-action="resume">繼續</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="resume"]').addEventListener('click', resumeSession);
  root.querySelector('[data-action="discard-continue"]').addEventListener('click', () => {
    store.discardSession(state, activeSession.id);
    activeSession = null;
    view = 'home';
    renderView();
  });
}

function resumeSession() {
  const menu = getMenu(activeSession.mode);
  attemptsForRound = 10;
  editingRoundIndex = null;
  editingSeq = null;
  confirmDiscard = false;
  menuComplete = false;
  inputMode = state.settings.inputMode || 'quick';
  pendingSeq = makeEmptySeq(attemptsForRound);

  const seqList = getMenuRounds(menu, activeSession.variant);
  if (seqList) {
    const nextIdx = activeSession.rounds.length;
    if (nextIdx < seqList.length) {
      const spotId = seqList[nextIdx];
      pendingSpot = spotId;
      pendingType = getSpot(spotId).type;
    } else {
      // 所有輪次已記錄完但尚未結算（見 completeRound() 同一分支的說明）：
      // 進完成狀態，不直接呼叫 finishSession()。
      menuComplete = true;
      pendingSpot = null;
      pendingType = null;
    }
  } else {
    pendingSpot = null;
    pendingType = null;
  }

  view = 'active';
  startTimer();
  renderView();
}

// ---------------------------------------------------------------------------
// B. 練球中
// ---------------------------------------------------------------------------

function renderSeqBallsHtml(seqArr, actionPrefix) {
  const n = seqArr.length;
  const rows = n === 10 ? [seqArr.slice(0, 5), seqArr.slice(5, 10)] : [seqArr];
  let idx = 0;
  const rowsHtml = rows.map((row) => {
    const cellsHtml = row.map((made) => {
      const i = idx;
      idx += 1;
      return `<button class="seq-ball ${made ? 'is-made' : ''}" data-action="${actionPrefix}:${i}" aria-label="第 ${i + 1} 球${made ? '：已進球' : '：未進球'}" aria-pressed="${made}">${i + 1}</button>`;
    }).join('');
    return `<div class="seq-ball-row">${cellsHtml}</div>`;
  }).join('');
  return `<div class="seq-balls">${rowsHtml}</div>`;
}

function renderActive() {
  const menu = getMenu(activeSession.mode);
  const seqList = getMenuRounds(menu, activeSession.variant);
  const isMenuMode = !!seqList;
  const doneCount = activeSession.rounds.length;
  const roundLabel = isMenuMode ? `第 ${Math.min(doneCount + 1, seqList.length)} / ${seqList.length} 輪` : `第 ${doneCount + 1} 輪`;
  const vLabel = variantLabel(activeSession.variant);

  const spotInfo = pendingSpot ? getSpot(pendingSpot) : null;
  const currentLabel = spotInfo
    ? `${spotInfo.label}・${typeLabel(spotInfo.type)}`
    : pendingType
    ? `不指定位置・${typeLabel(pendingType)}`
    : '請選擇位置或球種';

  const courtSection = `
    <div class="court-wrap">
      <div id="court-mount"></div>
      ${!isMenuMode ? `
        <div class="spot-controls">
          <button class="chip ${pendingSpot === null ? 'chip--active' : ''}" data-action="toggle-no-spot">不指定位置</button>
        </div>
        ${pendingSpot === null ? `
          <div class="type-chips">
            ${TYPE_OPTIONS.map((t) => `<button class="chip ${pendingType === t ? 'chip--active' : ''}" data-action="set-type:${t}">${typeLabel(t)}</button>`).join('')}
          </div>
        ` : ''}
      ` : ''}
    </div>
  `;

  const liveProgressHtml = menu.challenge && activeSession.variant === 'full'
    ? `<section class="live-progress">
        <h2 class="section-title">挑戰進度（即時）</h2>
        ${renderPassRuleBars(evaluatePassRule(activeSession, menu.passRule).detail)}
      </section>`
    : '';

  const modeHintText = inputMode === 'seq'
    ? '記這輪哪幾球有進（點亮有進的球）'
    : '只記這輪進了幾球';

  const modeToggleHtml = `
    <div class="input-mode-toggle" role="group" aria-label="輸入模式">
      <button class="input-mode-btn ${inputMode === 'quick' ? 'is-active' : ''}" data-action="set-input-mode:quick">快速</button>
      <button class="input-mode-btn ${inputMode === 'seq' ? 'is-active' : ''}" data-action="set-input-mode:seq">逐球</button>
    </div>
    <p class="input-mode-hint">${modeHintText}</p>
  `;

  const roundInputBody = inputMode === 'seq'
    ? `
      ${renderSeqBallsHtml(pendingSeq, 'toggle-seq')}
      <p class="seq-summary">進 <strong>${pendingSeq.filter(Boolean).length}</strong> 顆</p>
      <button class="btn btn--primary seq-done-btn" data-action="confirm-seq" ${!pendingType ? 'disabled' : ''}>完成本輪</button>
    `
    : `
      <p class="round-input__question">這輪進幾顆？</p>
      ${makesGridHtml(attemptsForRound, (n, spanAttr) => `<button class="makes-btn" data-action="confirm-makes:${n}" ${!pendingType ? 'disabled' : ''}${spanAttr}>${n}</button>`)}
    `;

  // 菜單模式所有輪次都記完，但尚未按「結束並結算」：輸入區換成完成面板（§4）。
  const roundInputHtml = isMenuMode && menuComplete
    ? `
      <div class="round-input completion-panel">
        <p class="completion-panel__title">${seqList.length} 輪全部完成 🎉</p>
        <p class="completion-panel__hint">確認無誤後結算</p>
        <button class="btn btn--primary completion-panel__finish" data-action="finish-menu">結束並結算</button>
      </div>
    `
    : `
      <div class="round-input">
        <div class="round-input__head">
          <div class="round-input__headline">
            <span class="round-input__round">${roundLabel}</span>
            <span class="round-input__spot">${currentLabel}</span>
          </div>
          <button class="chip chip--attempts" data-action="open-attempts">實投 ${attemptsForRound} 球</button>
        </div>
        ${modeToggleHtml}
        ${roundInputBody}
      </div>
    `;

  const completedRounds = activeSession.rounds.map((r, i) => {
    const spot = r.spot ? getSpot(r.spot) : null;
    return `
      <li class="round-row" data-action="edit-round:${i}">
        <span class="round-row__idx">#${i + 1}</span>
        <span class="round-row__spot">${spot ? spot.label : `不指定・${typeLabel(r.type)}`}${r.seq ? '<span class="round-row__seq-tag">逐球</span>' : ''}</span>
        <span class="round-row__score">${r.makes}/${r.attempts}</span>
        <span class="round-row__edit-icon" aria-hidden="true">✎</span>
      </li>
    `;
  }).join('');

  root.innerHTML = `
    <div class="page page--active">
      <header class="active-header">
        <div class="active-header__mode">${menu.name}${vLabel ? `<span class="variant-tag">${vLabel}</span>` : ''}</div>
        <div class="active-header__meta">
          <span class="js-elapsed active-header__time">${formatElapsed(activeSession.startedAt)}</span>
          <span class="active-header__round">${roundLabel}</span>
        </div>
      </header>

      ${liveProgressHtml}
      ${courtSection}
      ${roundInputHtml}

      ${doneCount ? `
        <section class="completed-rounds">
          <h2 class="completed-rounds__title">已完成（點一下可修改）</h2>
          <ul class="round-list">${completedRounds}</ul>
        </section>
      ` : ''}

      <footer class="active-footer">
        <button class="btn btn--ghost-danger" data-action="${confirmDiscard ? 'discard-confirm' : 'discard-ask'}">${confirmDiscard ? '確定放棄整節？' : '放棄'}</button>
        <button class="btn btn--primary" data-action="end-session" ${doneCount === 0 ? 'disabled' : ''}>結束練習</button>
      </footer>
    </div>

    ${attemptsStepperOpen ? renderAttemptsStepperHtml() : ''}
    ${editingRoundIndex !== null ? renderEditRoundHtml() : ''}
    ${toastMessage ? `<div class="toast">${toastMessage}</div>` : ''}
  `;

  renderCourt(root.querySelector('#court-mount'), {
    mode: 'pick',
    selected: pendingSpot,
    locked: isMenuMode,
    onSelect: isMenuMode ? null : (id) => pickSpot(id),
  });

  // 用 root 而非 .page--active 委派事件：實投數 / 修改輪次的 sheet 是 root 的
  // 兄弟節點（蓋在頁面最上層），不在 .page--active 底下，委派範圍要涵蓋它們。
  root.addEventListener('click', onActiveClick);

  if (toastMessage) {
    const toastEl = root.querySelector('.toast');
    requestAnimationFrame(() => toastEl && toastEl.classList.add('toast--show'));
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
      toastMessage = null;
      const t = root.querySelector('.toast');
      if (t) t.remove();
    }, 1800);
  }
}

function renderAttemptsStepperHtml() {
  const options = Array.from({ length: 20 }, (_, i) => i + 1);
  return `
    <div class="sheet-backdrop" data-action="close-attempts">
      <div class="sheet">
        <h3 class="sheet__title">這輪實際要投幾球？</h3>
        <div class="stepper-grid">
          ${options.map((n) => `<button class="stepper-btn ${n === attemptsForRound ? 'is-active' : ''}" data-action="set-attempts:${n}">${n}</button>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderEditRoundHtml() {
  const r = activeSession.rounds[editingRoundIndex];
  const spot = r.spot ? getSpot(r.spot) : null;
  const spotLabel = spot ? spot.label : `不指定・${typeLabel(r.type)}`;

  if (editingSeq) {
    const makesCount = editingSeq.filter(Boolean).length;
    return `
      <div class="sheet-backdrop" data-action="close-edit">
        <div class="sheet">
          <h3 class="sheet__title">修改第 ${editingRoundIndex + 1} 輪</h3>
          <p class="sheet__sub">${spotLabel}，逐球編輯</p>
          ${renderSeqBallsHtml(editingSeq, 'toggle-edit-seq')}
          <p class="seq-summary">進 <strong>${makesCount}</strong> 顆</p>
          <button class="btn btn--primary" data-action="save-edit-seq">儲存</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="sheet-backdrop" data-action="close-edit">
      <div class="sheet">
        <h3 class="sheet__title">修改第 ${editingRoundIndex + 1} 輪</h3>
        <p class="sheet__sub">${spotLabel}，原本 ${r.makes}/${r.attempts}，改成進幾顆？</p>
        ${makesGridHtml(r.attempts, (n, spanAttr) => `<button class="makes-btn ${n === r.makes ? 'is-active' : ''}" data-action="save-edit-makes:${n}"${spanAttr}>${n}</button>`)}
      </div>
    </div>
  `;
}

// 0–attempts 的數字按鈕網格（6 欄）。最後一顆按鈕跨欄補滿列尾，
// 避免像「10」單獨掛在最後一行的孤立排版。
function makesGridHtml(attempts, btnHtml) {
  const count = attempts + 1;
  const cols = 6;
  const span = cols - ((count - 1) % cols);
  const buttons = Array.from({ length: count }, (_, n) =>
    btnHtml(n, n === attempts && span > 1 ? ` style="grid-column: span ${span}"` : '')
  ).join('');
  return `<div class="makes-grid">${buttons}</div>`;
}

function pickSpot(id) {
  const spot = getSpot(id);
  if (!spot) return;
  pendingSpot = id;
  pendingType = spot.type;
  confirmDiscard = false;
  renderActive();
}

function onActiveClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'toggle-no-spot') {
    pendingSpot = null;
    pendingType = null;
    confirmDiscard = false;
    renderActive();
    return;
  }
  if (action.startsWith('set-type:')) {
    pendingType = action.split(':')[1];
    renderActive();
    return;
  }
  if (action === 'open-attempts') {
    attemptsStepperOpen = true;
    renderActive();
    return;
  }
  if (action === 'close-attempts') {
    attemptsStepperOpen = false;
    renderActive();
    return;
  }
  if (action.startsWith('set-attempts:')) {
    attemptsForRound = Number(action.split(':')[1]);
    attemptsStepperOpen = false;
    pendingSeq = makeEmptySeq(attemptsForRound);
    renderActive();
    return;
  }
  if (action.startsWith('set-input-mode:')) {
    inputMode = action.split(':')[1] === 'seq' ? 'seq' : 'quick';
    store.setInputMode(state, inputMode);
    if (inputMode === 'seq' && pendingSeq.length !== attemptsForRound) {
      pendingSeq = makeEmptySeq(attemptsForRound);
    }
    renderActive();
    return;
  }
  if (action.startsWith('toggle-seq:')) {
    const i = Number(action.split(':')[1]);
    pendingSeq[i] = !pendingSeq[i];
    renderActive();
    return;
  }
  if (action === 'confirm-seq') {
    const makes = pendingSeq.filter(Boolean).length;
    const seqStr = pendingSeq.map((b) => (b ? '1' : '0')).join('');
    completeRound(makes, seqStr);
    return;
  }
  if (action.startsWith('confirm-makes:')) {
    completeRound(Number(action.split(':')[1]), null);
    return;
  }
  if (action.startsWith('edit-round:')) {
    editingRoundIndex = Number(action.split(':')[1]);
    const r = activeSession.rounds[editingRoundIndex];
    editingSeq = typeof r.seq === 'string' && r.seq.length > 0
      ? r.seq.split('').map((c) => c === '1')
      : null;
    renderActive();
    return;
  }
  if (action === 'close-edit') {
    editingRoundIndex = null;
    editingSeq = null;
    renderActive();
    return;
  }
  if (action.startsWith('toggle-edit-seq:')) {
    const i = Number(action.split(':')[1]);
    editingSeq[i] = !editingSeq[i];
    renderActive();
    return;
  }
  if (action === 'save-edit-seq') {
    const makes = editingSeq.filter(Boolean).length;
    const seqStr = editingSeq.map((b) => (b ? '1' : '0')).join('');
    store.updateRound(state, activeSession.id, editingRoundIndex, { makes, seq: seqStr });
    activeSession = store.getSession(state, activeSession.id);
    editingRoundIndex = null;
    editingSeq = null;
    renderActive();
    return;
  }
  if (action.startsWith('save-edit-makes:')) {
    saveEditRound(Number(action.split(':')[1]));
    return;
  }
  if (action === 'discard-ask') {
    confirmDiscard = true;
    renderActive();
    return;
  }
  if (action === 'discard-confirm') {
    doDiscard();
    return;
  }
  if (action === 'end-session') {
    finishSession();
    return;
  }
  if (action === 'finish-menu') {
    finishSession();
    return;
  }
}

function completeRound(makes, seq) {
  if (!pendingType) return;

  if (makes === attemptsForRound && attemptsForRound >= 10) {
    const avg = typeAvgAllTime(state.sessions, pendingType);
    if (avg === null || avg < 60) {
      const ok = window.confirm(`${attemptsForRound} 中 ${makes}！確定嗎？`);
      if (!ok) return;
    }
  }

  store.addRound(state, activeSession.id, {
    spot: pendingSpot,
    type: pendingType,
    attempts: attemptsForRound,
    makes,
    seq,
  });
  activeSession = store.getSession(state, activeSession.id);
  confirmDiscard = false;
  toastMessage = `已記錄：${makes} / ${attemptsForRound}`;

  const menu = getMenu(activeSession.mode);
  const seqList = getMenuRounds(menu, activeSession.variant);
  if (seqList) {
    const nextIdx = activeSession.rounds.length;
    if (nextIdx < seqList.length) {
      const spotId = seqList[nextIdx];
      pendingSpot = spotId;
      pendingType = getSpot(spotId).type;
      attemptsForRound = 10;
      pendingSeq = makeEmptySeq(attemptsForRound);
      renderActive();
    } else {
      // 最後一輪記完後不再自動結算（M4 §4）：進完成狀態，
      // 讓使用者自己確認後按「結束並結算」才呼叫 finishSession()。
      menuComplete = true;
      pendingSpot = null;
      pendingType = null;
      renderActive();
    }
  } else {
    pendingSpot = null;
    pendingType = null;
    attemptsForRound = 10;
    pendingSeq = makeEmptySeq(attemptsForRound);
    renderActive();
  }
}

function saveEditRound(makes) {
  store.updateRound(state, activeSession.id, editingRoundIndex, { makes });
  activeSession = store.getSession(state, activeSession.id);
  editingRoundIndex = null;
  renderActive();
}

function doDiscard() {
  store.discardSession(state, activeSession.id);
  activeSession = null;
  stopTimer();
  confirmDiscard = false;
  view = 'home';
  renderView();
}

function finishSession() {
  stopTimer();
  store.endSession(state, activeSession.id);
  activeSession = store.getSession(state, activeSession.id);
  confirmDiscard = false;
  attemptsStepperOpen = false;
  editingRoundIndex = null;
  editingSeq = null;

  justFinishedResult = computeAndApplyChallengeResult(activeSession);

  view = 'summary';
  renderView();
}

/** 節結束當下算一次挑戰結果並套用到 progress（解鎖 / 個人最佳 / 徽章），只在這裡呼叫一次，避免每次重新渲染都重複解鎖。 */
function computeAndApplyChallengeResult(session) {
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
      store.updateBest(state, menu.id, { pct: sp, att: agg.total.att, mk: agg.total.mk, date: new Date().toISOString() });
    }

    let unlockedMenuId = null;
    let badgeEarned = null;
    if (eligible && evalRes.pass) {
      const next = nextMenuId(menu.id);
      if (next && store.unlockMenu(state, next)) {
        unlockedMenuId = next;
      }
      if (menu.id === 'curry' && store.addBadge(state, 'ladder_complete')) {
        badgeEarned = 'ladder_complete';
      }
    }

    challengeResult = { eligible, evalRes, isNewBest, unlockedMenuId, badgeEarned };
  }

  const newBadges = computeBadges(state.sessions, new Date()).filter((b) => !state.progress.badges.includes(b));
  newBadges.forEach((b) => store.addBadge(state, b));
  if (newBadges.length) {
    challengeResult = challengeResult || {};
    challengeResult.newBadges = newBadges;
  }

  return challengeResult;
}

// ---------------------------------------------------------------------------
// C. 本節統計（結束頁；history.js 的節詳情共用 renderSessionSummary）
// ---------------------------------------------------------------------------

function renderSummaryView() {
  root.innerHTML = `<div class="page page--summary"></div>`;
  const page = root.querySelector('.page--summary');
  renderSessionSummary(page, activeSession, state.sessions, {
    justFinished: justFinishedResult,
    state,
    onDone: () => {
      activeSession = null;
      justFinishedResult = null;
      view = 'home';
      renderView();
    },
  });
}

function renderRoundCurveSection(rounds) {
  if (!rounds || rounds.length === 0) return '';
  const curve = roundCurve(rounds);
  const bars = curve.map((p, i) => {
    const h = p === null ? 0 : p;
    return `
      <div class="curve-bar">
        <div class="curve-bar__track"><div class="curve-bar__fill" style="height:${h}%"></div></div>
        <span class="curve-bar__pct">${p === null ? '—' : p + '%'}</span>
        <span class="curve-bar__idx">#${i + 1}</span>
      </div>
    `;
  }).join('');
  return `
    <section class="curve-section">
      <h3 class="section-title">輪次曲線</h3>
      <div class="curve-chart">${bars}</div>
    </section>
  `;
}

function renderEarlyLateSection(rounds) {
  const split = earlyLateSplit(rounds);
  if (!split) return '';
  const eP = pct(split.early.mk, split.early.att);
  const lP = pct(split.late.mk, split.late.att);
  return `
    <section class="split-section">
      <h3 class="section-title">前後段對比（逐球資料）</h3>
      <div class="split-row">
        <div class="split-col">
          <span class="split-col__label">前半</span>
          <span class="split-col__pct">${eP === null ? '—' : eP + '%'}</span>
          <span class="split-col__score">${split.early.mk}/${split.early.att}</span>
        </div>
        <div class="split-col">
          <span class="split-col__label">後半</span>
          <span class="split-col__pct">${lP === null ? '—' : lP + '%'}</span>
          <span class="split-col__score">${split.late.mk}/${split.late.att}</span>
        </div>
      </div>
    </section>
  `;
}

const CONFETTI_COLORS = ['var(--color-accent)', 'var(--color-success)', 'var(--color-heat-warm)', 'var(--color-heat-cold)'];

function renderUnlockCelebration(nextMenu, badgeEarned) {
  const pieces = Array.from({ length: 24 }, (_, i) => {
    const left = (i * 41 + 3) % 100;
    const delay = ((i * 7) % 16) / 10;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    return `<span class="confetti-piece" style="left:${left}%; animation-delay:${delay}s; background:${color};"></span>`;
  }).join('');
  return `
    <div class="celebration" role="status" aria-live="polite">
      <div class="confetti" aria-hidden="true">${pieces}</div>
      <div class="celebration__card">
        <p class="celebration__title">解鎖成功！</p>
        ${nextMenu ? `<p class="celebration__next">已解鎖：${nextMenu.name}</p>` : ''}
        ${badgeEarned ? `<p class="celebration__badge">獲得徽章：${BADGE_LABEL[badgeEarned] || badgeEarned}</p>` : ''}
      </div>
    </div>
  `;
}

/**
 * 自訂節（free / world，非挑戰菜單）的等級對照卡：純對照，絕不寫入 progress。
 * equivalentTier() 是純函式，這裡只是顯示它的回傳值，不呼叫任何 store.* 寫入函式。
 * 樣本不足或未達第 1 關（回傳 null）時整卡隱藏，不顯示負面訊息。
 */
function renderEquivalentTierSection(menu, session) {
  if (!menu || menu.challenge) return '';
  const result = equivalentTier(session, MENUS);
  if (!result) return '';
  return `
    <section class="equivalent-card">
      <p class="equivalent-card__headline">本節表現相當於 <span class="nowrap">第 ${result.tier} 關</span>・${result.name} 的過關水準</p>
      <p class="equivalent-card__note">僅供對照，不解鎖關卡——挑戰請照階梯一關一關過</p>
    </section>
  `;
}

function renderChallengeSection(menu, session, justFinished) {
  if (!menu || !menu.challenge || session.variant !== 'full') return '';

  const eligible = isChallengeEligible(session);
  const evalRes = evaluatePassRule(session, menu.passRule);

  const ruleRows = evalRes.detail.map((d) => {
    const met = d.pct !== null && d.pct >= d.need;
    const gap = met ? 0 : pctGapToShots(d.att, d.mk, d.need);
    return `
      <li class="rule-row ${met ? 'is-met' : 'is-unmet'}">
        <span class="rule-row__icon" aria-hidden="true">${met ? '✓' : '✗'}</span>
        <span class="rule-row__type">${typeLabel(d.type)}</span>
        <span class="rule-row__value">${d.pct === null ? '—' : d.pct + '%'} ／ 門檻 ${d.need}%</span>
        ${!met && gap !== null ? `<span class="rule-row__gap">差約 ${gap} 顆</span>` : ''}
      </li>
    `;
  }).join('');

  const anySmallGap = evalRes.detail.some((d) => {
    if (d.pct !== null && d.pct >= d.need) return false;
    const gap = pctGapToShots(d.att, d.mk, d.need);
    return gap !== null && gap <= 2;
  });

  let bannerHtml;
  if (!eligible) {
    bannerHtml = `<p class="challenge-note challenge-note--neutral">本節節奏低於真實練習下限，不列入解鎖評估。</p>`;
  } else if (evalRes.pass) {
    bannerHtml = `<p class="challenge-note challenge-note--pass">挑戰通過！</p>`;
  } else {
    bannerHtml = `<p class="challenge-note challenge-note--fail">這次還沒達成，繼續練習吧。</p>`;
  }

  const newBestHtml = justFinished && justFinished.isNewBest
    ? `<p class="challenge-note challenge-note--record">新紀錄！本次命中率 ${sessionPct(session)}%</p>`
    : '';

  const retryHtml = !evalRes.pass && anySmallGap
    ? `<button class="btn btn--secondary retry-btn" data-action="retry-challenge" data-menu="${menu.id}" data-variant="${session.variant}">就差一點！再挑戰一次</button>`
    : '';

  const celebrateHtml = justFinished && justFinished.unlockedMenuId
    ? renderUnlockCelebration(getMenu(justFinished.unlockedMenuId), justFinished.badgeEarned)
    : '';

  return `
    <section class="challenge-section">
      <h3 class="section-title">挑戰結果</h3>
      <ul class="rule-list">${ruleRows}</ul>
      ${bannerHtml}
      ${newBestHtml}
      ${retryHtml}
      ${celebrateHtml}
    </section>
  `;
}

/**
 * 本節統計的共用渲染（練球結束頁 / 紀錄分頁節詳情都用這個）。
 * @param {HTMLElement} container
 * @param {Object} session
 * @param {Array} allSessions 用來算近 7 日同球種平均
 * @param {{onDone?: Function, onDelete?: Function, justFinished?: Object|null, state?: Object}} [opts]
 *   opts.state：完整 store 狀態，分享成績卡要讀 progress.best 判斷「個人最佳」徽章；
 *   呼叫端各自傳自己 store.load() 出來的那份，不依賴本檔案的模組層級 state（history.js 是另一份）。
 */
export function renderSessionSummary(container, session, allSessions, opts = {}) {
  const { onDone, onDelete, justFinished, state: cardState } = opts;
  const menu = getMenu(session.mode);
  const agg = aggregate(session.rounds);
  const totalPct = pct(agg.total.mk, agg.total.att);
  const durationLabel = session.endedAt ? formatDuration(session.startedAt, session.endedAt) : '進行中';
  const compareNow = session.endedAt || new Date().toISOString();
  const vLabel = variantLabel(session.variant);

  const typeRows = TYPE_OPTIONS.filter((t) => agg.byType[t]).map((t) => {
    const d = agg.byType[t];
    const p = pct(d.mk, d.att);
    const avg = recentTypeAvg(allSessions, t, 7, compareNow, session.id);
    let diffHtml = '<span class="stat-diff stat-diff--none">近 7 日：—</span>';
    if (avg !== null && p !== null) {
      const diff = p - avg;
      const sign = diff > 0 ? '↑' : diff < 0 ? '↓' : '持平';
      const cls = diff > 0 ? 'stat-diff--up' : diff < 0 ? 'stat-diff--down' : 'stat-diff--flat';
      diffHtml = `<span class="stat-diff ${cls}">${sign}${diff === 0 ? '' : ' ' + Math.abs(diff) + '%'}（近 7 日均 ${avg}%）</span>`;
    }
    return `
      <li class="type-row">
        <span class="type-row__label">${typeLabel(t)}</span>
        <span class="type-row__score">${d.mk}/${d.att}</span>
        <span class="type-row__pct">${p === null ? '—' : p + '%'}</span>
        ${diffHtml}
      </li>
    `;
  }).join('');

  const curveHtml = renderRoundCurveSection(session.rounds);
  const splitHtml = renderEarlyLateSection(session.rounds);
  const challengeHtml = renderChallengeSection(menu, session, justFinished);
  const equivalentHtml = renderEquivalentTierSection(menu, session);

  container.innerHTML = `
    <div class="summary">
      <header class="summary__header">
        <h2>${menu ? menu.name : session.mode}</h2>
        <div class="summary__tags">
          ${menu && menu.inspired ? `<span class="inspired-note">依公開報導風格改編的靈感版本</span>` : ''}
          ${vLabel ? `<span class="variant-tag">${vLabel}</span>` : ''}
        </div>
        <p class="summary__meta"><span class="nowrap">${formatDateTime(session.startedAt)}</span> ・ <span class="nowrap">時長 ${durationLabel}</span></p>
      </header>

      <div class="summary__totals">
        <div class="summary__total"><div class="summary__total-num">${agg.total.att}</div><div class="summary__total-label">總投</div></div>
        <div class="summary__total"><div class="summary__total-num">${agg.total.mk}</div><div class="summary__total-label">總中</div></div>
        <div class="summary__total"><div class="summary__total-num summary__total-num--accent">${totalPct === null ? '—' : totalPct + '%'}</div><div class="summary__total-label">命中率</div></div>
      </div>

      <ul class="type-list">${typeRows || '<li class="type-row type-row--empty">這節沒有任何紀錄</li>'}</ul>

      ${curveHtml}
      ${splitHtml}

      <div class="summary__court" id="summary-court"></div>

      ${challengeHtml}
      ${equivalentHtml}

      <div class="summary__actions">
        <button class="btn btn--secondary summary__actions-share" data-summary-action="share">分享成績卡</button>
        <div class="summary__actions-row">
          ${onDelete ? `<button class="btn btn--ghost-danger" data-summary-action="delete">刪除此節</button>` : ''}
          ${onDone ? `<button class="btn btn--primary" data-summary-action="done">完成</button>` : ''}
        </div>
      </div>
    </div>
  `;

  renderCourt(container.querySelector('#summary-court'), { mode: 'heat', heat: agg.bySpot });

  const shareBtn = container.querySelector('[data-summary-action="share"]');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => openShareSheet(session, cardState));
  }
  if (onDone) {
    const btn = container.querySelector('[data-summary-action="done"]');
    if (btn) btn.addEventListener('click', onDone);
  }
  if (onDelete) {
    const btn = container.querySelector('[data-summary-action="delete"]');
    if (btn) btn.addEventListener('click', onDelete);
  }
  const retryBtn = container.querySelector('[data-action="retry-challenge"]');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      requestRetry(retryBtn.dataset.menu, retryBtn.dataset.variant);
    });
  }
}
