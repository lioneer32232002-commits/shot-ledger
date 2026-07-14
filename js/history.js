// js/history.js
// 紀錄分頁：節列表（依日期倒序）＋ 節詳情（共用 session.js 的 renderSessionSummary）。

import * as store from './store.js';
import { getMenu } from './menus.js';
import { pct, aggregate } from './stats.js';
import { renderSessionSummary, formatDateTime, formatDuration } from './session.js';
import { pageBannerHtml } from './pagebanner.js';

let root = null;
let state = null;
let detailSessionId = null;
let confirmDelete = false;

export function mount(container) {
  root = container;
  state = store.load();
  detailSessionId = null;
  confirmDelete = false;
  render();
}

export function unmount() {
  root = null;
}

function finishedSessionsDesc() {
  return state.sessions
    .filter((s) => s.endedAt !== null)
    .slice()
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

function render() {
  if (!root) return;
  if (detailSessionId) return renderDetail();
  return renderList();
}

function renderList() {
  const sessions = finishedSessionsDesc();

  if (sessions.length === 0) {
    root.innerHTML = `
      <div class="page page--history">
        ${pageBannerHtml("history")}
        <div class="empty-state">
          <div class="empty-state__icon" aria-hidden="true">${emptyIconSvg()}</div>
          <p class="empty-state__title">還沒有任何練習紀錄</p>
          <p class="empty-state__desc">去「練球」分頁選個模式，完成第一次練習就會出現在這裡。</p>
        </div>
      </div>
    `;
    return;
  }

  const rows = sessions.map((s) => {
    const menu = getMenu(s.mode);
    const agg = aggregate(s.rounds);
    const p = pct(agg.total.mk, agg.total.att);
    const vLabel = s.variant === 'full' ? '完整' : s.variant === 'easy' ? '簡易' : '';
    return `
      <li class="history-row" data-session="${s.id}">
        <div class="history-row__date">
          <span class="history-row__day">${formatDateTime(s.startedAt).split(' ')[0]}</span>
          <span class="history-row__time">${formatDateTime(s.startedAt).split(' ')[1]}</span>
        </div>
        <div class="history-row__main">
          <span class="history-row__mode">${menu ? menu.name : s.mode}${vLabel ? `<span class="variant-tag variant-tag--sm">${vLabel}</span>` : ''}</span>
          <span class="history-row__score"><span class="nowrap">${agg.total.mk}/${agg.total.att} 投中</span> ・ <span class="nowrap">${p === null ? '—' : p + '%'}</span></span>
        </div>
        <div class="history-row__duration">${formatDuration(s.startedAt, s.endedAt)}</div>
      </li>
    `;
  }).join('');

  root.innerHTML = `
    <div class="page page--history">
      ${pageBannerHtml("history")}
      <ul class="history-list">${rows}</ul>
    </div>
  `;

  root.querySelectorAll('.history-row').forEach((row) => {
    row.addEventListener('click', () => {
      detailSessionId = row.dataset.session;
      confirmDelete = false;
      render();
    });
  });
}

function renderDetail() {
  const session = store.getSession(state, detailSessionId);
  if (!session) {
    detailSessionId = null;
    return renderList();
  }

  root.innerHTML = `
    <div class="page page--history-detail">
      <header class="page-header page-header--with-back">
        <button class="back-btn" data-action="back" aria-label="返回紀錄列表">←</button>
        <h1>練習詳情</h1>
      </header>
      <div id="detail-mount"></div>
    </div>
  `;

  root.querySelector('[data-action="back"]').addEventListener('click', () => {
    detailSessionId = null;
    confirmDelete = false;
    render();
  });

  renderSessionSummary(root.querySelector('#detail-mount'), session, state.sessions, {
    state,
    onDelete: () => {
      if (!confirmDelete) {
        confirmDelete = true;
        renderDetail();
        return;
      }
      store.discardSession(state, session.id);
      detailSessionId = null;
      confirmDelete = false;
      render();
    },
  });

  if (confirmDelete) {
    const btn = root.querySelector('[data-summary-action="delete"]');
    if (btn) btn.textContent = '確定要刪除這次練習？再按一次刪除';
  }
}

function emptyIconSvg() {
  return `
    <svg viewBox="0 0 96 96" width="72" height="72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="34" stroke="var(--color-border-strong)" stroke-width="3"/>
      <path d="M14 48h68M48 14v68M22.5 22.5c8 8 8 43 0 51M73.5 22.5c-8 8-8 43 0 51" stroke="var(--color-border-strong)" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `;
}
