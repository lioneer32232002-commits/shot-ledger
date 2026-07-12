// js/app.js
// 進入點、hash router、三分頁殼（練球 #/train、紀錄 #/history、設定 #/settings）。

import * as store from './store.js';
import * as trainPage from './session.js';
import * as historyPage from './history.js';
import { ladderMenus } from './menus.js';
import { BADGE_LABEL, formatThousands } from './session.js';
import { lifetimeTotals, pct } from './stats.js';

const VALID_TABS = ['train', 'history', 'settings'];

const settingsPage = { mount: mountSettings, unmount: unmountSettings };
const routes = { train: trainPage, history: historyPage, settings: settingsPage };

const view = document.getElementById('view');
const tabBar = document.getElementById('tab-bar');
const tabButtons = Array.from(tabBar.querySelectorAll('.tab-item'));

let currentModule = null;

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  return VALID_TABS.includes(raw) ? raw : 'train';
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
}

window.addEventListener('hashchange', render);

if (!location.hash) {
  location.hash = '#/train';
} else {
  render();
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
      ? `<p class="settings-reminder">已累積 ${unbacked} 節尚未備份，建議匯出一份 JSON 存起來。</p>`
      : '';

  const badgesHtml = badges.length
    ? `<div class="badge-chips">${badges.map((b) => `<span class="badge-chip">${BADGE_LABEL[b] || b}</span>`).join('')}</div>`
    : `<p class="settings-card__row">尚未獲得徽章，練起來！</p>`;

  settingsRoot.innerHTML = `
    <div class="page page--settings">
      <header class="page-header"><h1>設定</h1></header>

      <section class="settings-card">
        <h2 class="settings-card__title">資料狀態</h2>
        <p class="settings-card__row">目前共 <strong class="nowrap">${sessionCount} 節</strong> / <strong class="nowrap">${roundCount} 輪</strong></p>
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
          <p>入選「射手階梯」需滿足其一（皆為公開可查數據）：</p>
          <ul class="about-card__list">
            <li>生涯三分命中率 ≥ 40%</li>
            <li>50-40-90 俱樂部成員</li>
            <li>歷史三分命中數前列</li>
          </ul>
          <p class="about-card__note">Jeremy Lin 不在射手等級之列，但作為起手模式保留——切入型後衛的中距＋罰球基本功，正好是階梯第一關的難度定位。</p>
          <p class="about-card__note">Curry / Jeremy Lin / Klay 等訓練菜單，皆為依公開報導風格改編的靈感版本，與當事人無關、非官方授權內容。</p>
        </div>
      </details>

      <footer class="settings-footer">
        <p class="settings-footer__app">Shot Ledger　版本 M1.6</p>
      </footer>
    </div>
  `;

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
