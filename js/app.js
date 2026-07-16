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
import { lifetimeTotals, pct } from './stats.js';
import { pageBannerHtml } from './pagebanner.js';

const VALID_TABS = ['train', 'stats', 'history', 'settings'];

// 設定頁徽章清單：全部 7 顆依成就順序列出，未獲得的顯示灰剪影＋取得條件，
// 讓新使用者看得到「有什麼可追」（UX 走查）。
const BADGE_ORDER = ['streak_3', 'streak_7', 'streak_30', 'volume_1000', 'volume_5000', 'volume_10000', 'ladder_complete'];
const BADGE_CONDITION = {
  streak_3: '連續練習 3 天',
  streak_7: '連續練習 7 天',
  streak_30: '連續練習 30 天',
  volume_1000: '累計 1,000 顆',
  volume_5000: '累計 5,000 顆',
  volume_10000: '累計 10,000 顆',
  ladder_complete: '全破挑戰階梯 13 關',
};
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
  const lifetime = lifetimeTotals(settingsState.sessions);
  const lifetimePct = pct(lifetime.mk, lifetime.att);
  const badges = settingsState.progress.badges;
  const reminderHtml =
    unbacked > 5
      ? `<p class="settings-reminder">已累積 ${unbacked} 次練習尚未備份，建議匯出一份 JSON 存起來。</p>`
      : '';

  // 已獲得排前面（依成就順序），未獲得的灰剪影＋取得條件短句接在後面。
  const earnedChips = BADGE_ORDER.filter((b) => badges.includes(b))
    .concat(badges.filter((b) => !BADGE_ORDER.includes(b))) // 防禦：不在清單裡的既有徽章照樣顯示
    .map((b) => `<span class="badge-chip">${BADGE_LABEL[b] || b}</span>`);
  const lockedChips = BADGE_ORDER.filter((b) => !badges.includes(b))
    .map((b) => `<span class="badge-chip badge-chip--locked">${BADGE_CONDITION[b] || BADGE_LABEL[b] || b}</span>`);
  const badgesHtml = `<div class="badge-chips">${earnedChips.join('')}${lockedChips.join('')}</div>`;

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
