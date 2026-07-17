// js/app.js
// 進入點、hash router、四分頁殼（練球 #/train、統計 #/stats、紀錄 #/history、設定 #/settings）
// ＋首頁 landing（#/home，不在 tab bar 上）。

import * as store from './store.js';
import * as trainPage from './session.js';
import * as statsPage from './statspage.js';
import * as historyPage from './history.js';
import * as homePage from './home.js';
import { MENUS, ladderMenus } from './menus.js';
import { BADGE_LABEL, formatThousands } from './session.js';
import { lifetimeTotals, pct, streakDays, totalAttempts } from './stats.js';
import { pageBannerHtml } from './pagebanner.js';

const VALID_TABS = ['train', 'stats', 'history', 'settings'];

// 設定頁徽章牆：全部 7 顆依成就順序排成圓形進度獎章（2026-07-17 比稿 B 案定案），
// 未獲得的顯示灰剪影＋進度環圈，讓人看得到「離下一顆多近」。
// capstone＝全破階梯，跨滿整列當壓軸。
const BADGE_DEFS = [
  { id: 'streak_3', icon: 'flame', kind: 'streak', target: 3 },
  { id: 'streak_7', icon: 'flame', kind: 'streak', target: 7 },
  { id: 'streak_30', icon: 'flame', kind: 'streak', target: 30 },
  { id: 'volume_1000', icon: 'ball', kind: 'volume', target: 1000 },
  { id: 'volume_5000', icon: 'ball', kind: 'volume', target: 5000 },
  { id: 'volume_10000', icon: 'ball', kind: 'volume', target: 10000 },
  { id: 'ladder_complete', icon: 'trophy', kind: 'ladder', target: null, capstone: true },
];

// 線條圖示（火焰＝連續、籃球＝投量、獎盃＝全破），stroke 走 currentColor 讓
// 獲得／未獲得直接由文字色帶動，深淺色主題都成立。
const BADGE_ICON = {
  flame: '<svg class="badge-medal__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  ball: '<svg class="badge-medal__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.4 5.6c3.6 3.6 3.6 9.2 0 12.8M18.6 5.6c-3.6 3.6-3.6 9.2 0 12.8"/></svg>',
  trophy: '<svg class="badge-medal__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
};

// 進度環圈半徑 31（獎章 68px 內縮 3px 描邊），圓周 2πr ≈ 194.8。
const MEDAL_RING_C = 194.8;

function badgeMedalHtml({ label, icon, earned, progress, meta, capstone }) {
  const clamped = earned ? 1 : Math.max(0, Math.min(progress || 0, 1));
  const offset = (MEDAL_RING_C * (1 - clamped)).toFixed(1);
  const cls = ['badge-medal', earned ? 'badge-medal--earned' : 'badge-medal--locked'];
  if (capstone) cls.push('badge-medal--capstone');
  const discHtml = `
    <div class="badge-medal__disc">
      <svg class="badge-medal__ring" viewBox="0 0 68 68" aria-hidden="true">
        <circle class="badge-medal__ring-track" cx="34" cy="34" r="31" fill="none" stroke-width="3"/>
        <circle class="badge-medal__ring-fill" cx="34" cy="34" r="31" fill="none" stroke-width="3"
          stroke-dasharray="${MEDAL_RING_C}" stroke-dashoffset="${offset}" transform="rotate(-90 34 34)"/>
      </svg>
      ${BADGE_ICON[icon] || BADGE_ICON.trophy}
    </div>
  `;
  const textHtml = `
    <p class="badge-medal__name">${label}</p>
    <p class="badge-medal__meta${earned ? ' badge-medal__meta--earned' : ''}">${meta}</p>
  `;
  // capstone 是橫幅：獎章在左、文字直排在右
  return `<div class="${cls.join(' ')}">${discHtml}${capstone ? `<div class="badge-medal__text">${textHtml}</div>` : textHtml}</div>`;
}
const HOME_ROUTE = 'home'; // 首頁：有自己的路由但不佔 tab bar 格子（SPEC_M6 §1）

// 聯絡版主：純 mailto，不接後端也不收使用者資料。主旨先填好，回信時比較好歸類。
const CONTACT_EMAIL = 'wizard32232002@gmail.com';
const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Shot Ledger 意見回饋')}`;

// ---------------------------------------------------------------------------
// 深色模式（schema v4 settings.theme：'auto'|'light'|'dark'）
// ---------------------------------------------------------------------------

const THEME_COLOR = { light: '#FAF9F7', dark: '#16130F' };
const darkMediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let systemThemeListenerOn = false;

function onSystemThemeChange() {
  applyTheme();
}

/** 有效主題：手動指定 light/dark 就直接用，'auto' 時看系統目前是否偏好深色。 */
function effectiveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  return darkMediaQuery && darkMediaQuery.matches ? 'dark' : 'light';
}

/** 套用目前 settings.theme：寫入 <html data-theme>、同步 theme-color meta，
 *  並在 'auto' 時即時跟隨系統深色切換（手動指定時移除監聽，避免多餘更新）。 */
function applyTheme() {
  const state = store.load();
  const theme = state.settings.theme;
  const effective = effectiveTheme(theme);

  document.documentElement.dataset.theme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[effective]);

  if (darkMediaQuery) {
    if (theme === 'auto' && !systemThemeListenerOn) {
      darkMediaQuery.addEventListener('change', onSystemThemeChange);
      systemThemeListenerOn = true;
    } else if (theme !== 'auto' && systemThemeListenerOn) {
      darkMediaQuery.removeEventListener('change', onSystemThemeChange);
      systemThemeListenerOn = false;
    }
  }
}

// 首次 render 前就套用，避免深色使用者先閃一下淺色殼。
applyTheme();

// ---------------------------------------------------------------------------
// PWA：Service Worker 註冊（失敗靜默，不影響一般瀏覽器使用）
// ---------------------------------------------------------------------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 註冊失敗（例如非 https / 瀏覽器不支援）不影響一般網頁功能，靜默即可
    });
  });
}

const settingsPage = { mount: mountSettings, unmount: unmountSettings };
const routes = {
  train: trainPage,
  stats: statsPage,
  history: historyPage,
  settings: settingsPage,
  [HOME_ROUTE]: homePage,
};

const view = document.getElementById('view');
const tabBar = document.getElementById('tab-bar');
const tabButtons = Array.from(tabBar.querySelectorAll('.tab-item'));

let currentModule = null;

/** 裸網址（或非法 hash）的落點：沒看過首頁的新訪客送去 #/home，其餘直接進 #/train。 */
function defaultRoute() {
  return store.load().settings.homeSeen ? 'train' : HOME_ROUTE;
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (raw === HOME_ROUTE) return HOME_ROUTE; // 手動打 #/home 永遠回得去，不管 homeSeen
  return VALID_TABS.includes(raw) ? raw : defaultRoute();
}

function updateTabBar(activeTab) {
  const state = store.load();
  const needsBackup = store.unbackedUpCount(state) > 5;

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === activeTab;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    const dot = btn.querySelector('.tab-item__dot');
    if (dot) dot.hidden = !(btn.dataset.tab === 'settings' && needsBackup);
  });
}

function render() {
  const tab = parseHash();
  if (location.hash !== `#/${tab}`) {
    history.replaceState(null, '', `#/${tab}`);
  }
  if (currentModule && typeof currentModule.unmount === 'function') {
    currentModule.unmount();
  }
  view.innerHTML = '';
  updateTabBar(tab);
  currentModule = routes[tab];
  currentModule.mount(view);

  // 換頁一律回到頁首。捲動位置是掛在 window 上的，換 hash 只換掉 #view 的內容、
  // 不會動到 scrollY——從首頁第四屏（已往下捲三屏）點入口進 #/train，畫面就會停在
  // 階梯那一段，橫幅照片與上方說明整段被跳過。四個分頁互切也有同樣的問題。
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// 設定分頁（沒有獨立檔案，規格把它併在 app.js 的「三分頁殼」職責內）
// ---------------------------------------------------------------------------

let settingsRoot = null;
let settingsState = null;
let clearConfirmText = '';
let importInputEl = null;

function mountSettings(container) {
  settingsRoot = container;
  settingsState = store.load();
  clearConfirmText = '';
  renderSettings();
}

function unmountSettings() {
  settingsRoot = null;
}

function countStats(state) {
  const sessionCount = state.sessions.filter((s) => s.endedAt !== null).length;
  const roundCount = state.sessions.reduce((sum, s) => sum + s.rounds.length, 0);
  return { sessionCount, roundCount };
}

function unlockedLadderCount(state) {
  const ladder = ladderMenus();
  const unlocked = ladder.filter((m) => state.progress.unlocked.includes(m.id)).length;
  return { unlocked, total: ladder.length };
}

// 階梯已通過關數（全破徽章的進度）：通過的定義＝下一關已解鎖、末關看
// ladder_complete 徽章，與 session.js 階梯頁的 passedIds 同一套判定。
function passedLadderCount(state) {
  const ladder = ladderMenus();
  const passed = ladder.filter((m, i) => {
    const next = ladder[i + 1];
    if (next) return state.progress.unlocked.includes(next.id);
    return state.progress.badges.includes('ladder_complete');
  }).length;
  return { passed, total: ladder.length };
}

/** 三星制總覽：total 動態算（關卡數 × 3），不寫死數字（階梯關數之後還可能再變）。 */
function starsCount(state) {
  const ladder = ladderMenus();
  const earned = ladder.reduce((sum, m) => {
    const s = state.progress.stars[m.id];
    if (!s) return sum;
    return sum + [s.unlock, s.signature, s.high].filter(Boolean).length;
  }, 0);
  return { earned, total: ladder.length * 3 };
}

function formatBackupTime(iso) {
  if (!iso) return '尚未備份過';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}/${mm}/${dd} ${hh}:${mi}`;
}

function renderSettings() {
  if (!settingsRoot) return;
  const { sessionCount, roundCount } = countStats(settingsState);
  const unbacked = store.unbackedUpCount(settingsState);
  const { unlocked, total } = unlockedLadderCount(settingsState);
  const { earned: starsEarned, total: starsTotal } = starsCount(settingsState);
  const lifetime = lifetimeTotals(settingsState.sessions);
  const lifetimePct = pct(lifetime.mk, lifetime.att);
  const badges = settingsState.progress.badges;
  const reminderHtml =
    unbacked > 5
      ? `<p class="settings-reminder">已累積 ${unbacked} 次練習尚未備份，建議匯出一份 JSON 存起來。</p>`
      : '';

  // 徽章牆：固定依成就順序（不把已獲得挑到前面，位置固定才有「集滿一面牆」的感覺），
  // 未獲得的用進度環圈顯示離下一顆多近。
  const streak = streakDays(settingsState.sessions, new Date());
  const totalShots = totalAttempts(settingsState.sessions);
  const ladderProgress = passedLadderCount(settingsState);
  const medalData = (def) => {
    const earned = badges.includes(def.id);
    if (def.kind === 'streak') {
      return { earned, progress: streak / def.target, meta: earned ? '已獲得' : `${Math.min(streak, def.target)} / ${def.target} 天` };
    }
    if (def.kind === 'volume') {
      return { earned, progress: totalShots / def.target, meta: earned ? '已獲得' : `${formatThousands(Math.min(totalShots, def.target))} / ${formatThousands(def.target)}` };
    }
    return {
      earned,
      progress: ladderProgress.passed / ladderProgress.total,
      meta: earned ? '已獲得' : `已通過 ${ladderProgress.passed} / ${ladderProgress.total} 關`,
    };
  };
  const medals = BADGE_DEFS.map((def) =>
    badgeMedalHtml({ label: BADGE_LABEL[def.id] || def.id, icon: def.icon, capstone: def.capstone, ...medalData(def) })
  );
  // 防禦：不在清單裡的既有徽章照樣顯示（migration 或舊資料）
  const extraMedals = badges
    .filter((b) => !BADGE_DEFS.some((def) => def.id === b))
    .map((b) => badgeMedalHtml({ label: BADGE_LABEL[b] || b, icon: 'trophy', earned: true, meta: '已獲得' }));
  const badgesHtml = `<div class="badge-wall">${medals.join('')}${extraMedals.join('')}</div>`;

  const theme = settingsState.settings.theme;
  const themeOptions = [
    { id: 'auto', label: '自動' },
    { id: 'light', label: '淺色' },
    { id: 'dark', label: '深色' },
  ];
  const themeSegmentedHtml = themeOptions
    .map((opt) => `<button class="segmented__btn${theme === opt.id ? ' is-active' : ''}" data-theme-option="${opt.id}">${opt.label}</button>`)
    .join('');

  const basisMenus = MENUS.filter((m) => m.basis);
  const basisListHtml = basisMenus
    .map(
      (m) => `
        <li class="basis-item">
          <p class="basis-item__name">${m.name}</p>
          <p class="basis-item__text">${m.basis.text}（<a href="${m.basis.url}" target="_blank" rel="noopener">${m.basis.source}</a>）</p>
        </li>
      `
    )
    .join('');

  settingsRoot.innerHTML = `
    <div class="page page--settings">
      ${pageBannerHtml("settings")}

      <section class="settings-card">
        <h2 class="settings-card__title">外觀</h2>
        <div class="segmented" data-role="theme-segmented">${themeSegmentedHtml}</div>
      </section>

      <section class="settings-card">
        <h2 class="settings-card__title">資料狀態</h2>
        <p class="settings-card__row">目前共 <strong class="nowrap">${sessionCount} 次練習</strong> / <strong class="nowrap">${roundCount} 輪</strong></p>
        <p class="settings-card__row">挑戰階梯：已解鎖 <strong class="nowrap">${unlocked}/${total} 關</strong></p>
        <p class="settings-card__row">星星：<strong class="nowrap">${starsEarned} / ${starsTotal}</strong></p>
        <p class="settings-card__row">生涯累計：<strong class="nowrap">${formatThousands(lifetime.att)} 投</strong> / <strong class="nowrap">${formatThousands(lifetime.mk)} 中</strong>${lifetimePct === null ? '' : `<span class="nowrap">（${lifetimePct}%）</span>`}</p>
        <p class="settings-card__row nowrap">上次備份：${formatBackupTime(settingsState.settings.lastBackupAt)}</p>
        ${reminderHtml}
      </section>

      <section class="settings-card">
        <h2 class="settings-card__title">徽章</h2>
        ${badgesHtml}
      </section>

      <section class="settings-card">
        <h2 class="settings-card__title">關於本站</h2>
        <div class="settings-actions">
          <button class="btn btn--secondary" data-action="show-home">重看首頁介紹</button>
          <a class="btn btn--secondary" href="${CONTACT_MAILTO}">聯絡版主</a>
        </div>
        <p class="settings-card__row">回報問題或許願功能，會直接開啟你的信箱 App 寄到 <span class="nowrap">${CONTACT_EMAIL}</span>。</p>
      </section>

      <section class="settings-card">
        <h2 class="settings-card__title">備份與轉移</h2>
        <div class="settings-actions">
          <button class="btn btn--secondary" data-action="export-json">匯出 JSON</button>
          <button class="btn btn--secondary" data-action="export-csv">匯出 CSV</button>
          <button class="btn btn--secondary" data-action="import-json">匯入 JSON</button>
        </div>
        <input type="file" accept="application/json,.json" class="visually-hidden" data-role="import-input" />
      </section>

      <section class="settings-card settings-card--danger">
        <h2 class="settings-card__title">清除全部資料</h2>
        <p class="settings-card__row">這會刪除裝置上所有練習紀錄，且無法復原。輸入「刪除」以確認：</p>
        <div class="settings-clear-row">
          <input type="text" class="text-input" data-role="clear-input" placeholder="輸入「刪除」" value="${clearConfirmText}" />
          <button class="btn btn--danger" data-action="clear-all" ${clearConfirmText === '刪除' ? '' : 'disabled'}>清除全部資料</button>
        </div>
      </section>

      <details class="about-card">
        <summary class="about-card__summary">關於「射手等級」界定標準</summary>
        <div class="about-card__body">
          <p class="about-card__lead">入選「射手階梯」需滿足其一（皆為公開可查數據）：</p>
          <ul class="about-card__list">
            <li>生涯三分命中率 ≥ 40%</li>
            <li>50-40-90 俱樂部成員</li>
            <li>歷史三分命中數前列</li>
          </ul>
          <div class="about-card__notes">
            <p class="about-card__note">Jeremy Lin 不在射手等級之列，但作為起手模式保留——切入型後衛的中距＋罰球基本功，正好是階梯第一關的難度定位。</p>
            <p class="about-card__note">Curry / Jeremy Lin / Klay 等訓練菜單，皆為依公開報導風格改編的靈感版本，與當事人無關、非官方授權內容。</p>
            <p class="about-card__note">球員生涯數據（NBA 年份、FG%／3 分%／罰球%／三分命中數）以 StatMuse 與 ESPN 雙來源交叉核對，截至 2025-26 賽季；Lillard 因 2025-26 整季傷停，數據累計至 2024-25。</p>
          </div>
        </div>
      </details>

      <details class="about-card">
        <summary class="about-card__summary">掛名菜單依據與出處</summary>
        <div class="about-card__body">
          <ul class="basis-list">${basisListHtml}</ul>
        </div>
      </details>

      <footer class="settings-footer">
        <p class="settings-footer__app">Shot Ledger　版本 M3</p>
      </footer>
    </div>
  `;

  settingsRoot.querySelectorAll('[data-role="theme-segmented"] .segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setTheme(settingsState, btn.dataset.themeOption);
      applyTheme();
      renderSettings();
    });
  });

  settingsRoot.querySelector('[data-action="show-home"]').addEventListener('click', () => {
    location.hash = '#/home';
  });

  importInputEl = settingsRoot.querySelector('[data-role="import-input"]');

  settingsRoot.querySelector('[data-action="export-json"]').addEventListener('click', () => {
    store.exportJSON(settingsState);
    renderSettings();
  });
  settingsRoot.querySelector('[data-action="export-csv"]').addEventListener('click', () => {
    store.exportCSV(settingsState);
    renderSettings();
  });
  settingsRoot.querySelector('[data-action="import-json"]').addEventListener('click', () => {
    importInputEl.click();
  });
  importInputEl.addEventListener('change', onImportFileChosen);

  const clearInput = settingsRoot.querySelector('[data-role="clear-input"]');
  clearInput.addEventListener('input', (e) => {
    clearConfirmText = e.target.value;
    const btn = settingsRoot.querySelector('[data-action="clear-all"]');
    btn.disabled = clearConfirmText !== '刪除';
  });
  settingsRoot.querySelector('[data-action="clear-all"]').addEventListener('click', () => {
    if (clearConfirmText !== '刪除') return;
    settingsState = store.clearAll();
    clearConfirmText = '';
    renderSettings();
    updateTabBar(parseHash());
  });
}

function onImportFileChosen(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const confirmed = window.confirm('匯入將會整份取代目前的資料，確定要繼續嗎？');
    if (!confirmed) {
      e.target.value = '';
      return;
    }
    try {
      settingsState = store.importJSON(text);
      renderSettings();
      updateTabBar(parseHash());
      showSettingsMessage('匯入成功，資料已整份取代。');
    } catch (err) {
      showSettingsMessage(err.message || '匯入失敗');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

function showSettingsMessage(msg) {
  if (!settingsRoot) return;
  let box = settingsRoot.querySelector('.settings-toast');
  if (!box) {
    box = document.createElement('div');
    box.className = 'settings-toast';
    settingsRoot.querySelector('.page--settings').prepend(box);
  }
  box.textContent = msg;
  clearTimeout(showSettingsMessage._t);
  showSettingsMessage._t = setTimeout(() => box.remove(), 3000);
}

// ---------------------------------------------------------------------------
// 啟動路由
// ---------------------------------------------------------------------------
// 放在檔案最後（設定分頁的 let 宣告之後）才啟動：若網址已帶有 hash（例如
// 在設定分頁整頁重新整理），render() 會同步執行到 mountSettings，若這段
// 放在 settingsRoot 等 let 宣告「之前」，會踩到 TDZ 丟出
// ReferenceError（reload 到 #/settings 會整頁空白）。
window.addEventListener('hashchange', render);

if (!location.hash) {
  location.hash = `#/${defaultRoute()}`; // 新訪客 → #/home；看過的人 → #/train
} else {
  render();
}
