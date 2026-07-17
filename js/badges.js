// js/badges.js
// 徽章系統的顯示層共用模組：定義（BADGE_DEFS）、標籤、圖示、進度計算、
// 徽章牆（統計頁）與成就條（練球頁）的 HTML 產生器。
// 只依賴 stats.js / menus.js 兩個純函式模組，session.js / statspage.js / app.js
// 都可以安全 import，不會形成循環。
// 發章邏輯不在這裡——仍在 store.applyChallengeResult（computeBadges＋ladder_complete）。

import { streakDays, totalAttempts, formatThousands } from './stats.js';
import { ladderMenus } from './menus.js';

export const BADGE_LABEL = {
  ladder_complete: '全破挑戰階梯',
  streak_3: '連續練習 3 天',
  streak_7: '連續練習 7 天',
  streak_30: '連續練習 30 天',
  volume_1000: '累計 1,000 顆',
  volume_5000: '累計 5,000 顆',
  volume_10000: '累計 10,000 顆',
};

// 全部徽章依成就順序（2026-07-17 比稿 B 案定案）。capstone＝全破階梯，
// 在牆上跨滿整列當壓軸。
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
const ICON_PATH = {
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.4 5.6c3.6 3.6 3.6 9.2 0 12.8M18.6 5.6c-3.6 3.6-3.6 9.2 0 12.8"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
};

function iconSvg(icon, cls) {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATH[icon] || ICON_PATH.trophy}</svg>`;
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

/** 一次算出所有徽章的顯示資料（earned / progress 0–1 / 進度短句），兩個顯示層共用。 */
function badgeStatus(state, now) {
  const badges = state.progress.badges;
  const streak = streakDays(state.sessions, now);
  const totalShots = totalAttempts(state.sessions);
  const ladder = passedLadderCount(state);

  return BADGE_DEFS.map((def) => {
    const earned = badges.includes(def.id);
    let progress = 0;
    let meta = '';
    if (def.kind === 'streak') {
      progress = streak / def.target;
      meta = `${Math.min(streak, def.target)} / ${def.target} 天`;
    } else if (def.kind === 'volume') {
      progress = totalShots / def.target;
      meta = `${formatThousands(Math.min(totalShots, def.target))} / ${formatThousands(def.target)}`;
    } else {
      progress = ladder.passed / ladder.total;
      meta = `已通過 ${ladder.passed} / ${ladder.total} 關`;
    }
    return { ...def, earned, progress, meta, streak, totalShots, ladder };
  });
}

// 進度環圈半徑 31（獎章 68px 內縮 3px 描邊），圓周 2πr ≈ 194.8。
const MEDAL_RING_C = 194.8;

function medalHtml({ id, icon, earned, progress, meta, capstone }) {
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
      ${iconSvg(icon, 'badge-medal__icon')}
    </div>
  `;
  const textHtml = `
    <p class="badge-medal__name">${BADGE_LABEL[id] || id}</p>
    <p class="badge-medal__meta${earned ? ' badge-medal__meta--earned' : ''}">${earned ? '已獲得' : meta}</p>
  `;
  // capstone 是橫幅：獎章在左、文字直排在右
  return `<div class="${cls.join(' ')}">${discHtml}${capstone ? `<div class="badge-medal__text">${textHtml}</div>` : textHtml}</div>`;
}

/**
 * 統計頁徽章牆：固定依成就順序（不把已獲得挑到前面，位置固定才有
 * 「集滿一面牆」的感覺），未獲得的用進度環圈顯示離下一顆多近。
 */
export function badgeWallHtml(state, now = new Date()) {
  const medals = badgeStatus(state, now).map(medalHtml);
  // 防禦：不在清單裡的既有徽章照樣顯示（migration 或舊資料）
  const extras = state.progress.badges
    .filter((b) => !BADGE_DEFS.some((def) => def.id === b))
    .map((b) => medalHtml({ id: b, icon: 'trophy', earned: true }));
  return `<div class="badge-wall">${medals.join('')}${extras.join('')}</div>`;
}

// 成就條迷你環：半徑 19（44px 盤面），圓周 2πr ≈ 119.4。
const STRIP_RING_C = 119.4;

/**
 * 練球頁成就條（比稿 A 案）：顯示「最接近到手的下一顆徽章」＋進度環＋已獲得數。
 * 挑選規則＝未獲得裡 progress 最高者，同分依成就順序（新手全零時自然落在
 * 連續練習 3 天）。全部拿完則顯示達成狀態。點擊由呼叫端綁去統計頁的牆。
 */
export function badgeStripHtml(state, now = new Date()) {
  const status = badgeStatus(state, now);
  const earnedCount = status.filter((s) => s.earned).length;
  const total = status.length;
  const locked = status.filter((s) => !s.earned);

  if (!locked.length) {
    return `
      <button type="button" class="badge-strip" data-action="open-badges">
        <div class="badge-strip__disc">
          <svg class="badge-strip__ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle class="badge-strip__ring-fill" cx="22" cy="22" r="19" fill="none" stroke-width="2.5" stroke-dasharray="${STRIP_RING_C}" stroke-dashoffset="0"/>
          </svg>
          ${iconSvg('trophy', 'badge-strip__icon')}
        </div>
        <div class="badge-strip__text">
          <span class="badge-strip__label">徽章全數達成</span>
          <span class="badge-strip__name">整面牆都是你的了</span>
        </div>
        <span class="badge-strip__count">徽章 ${earnedCount}/${total}</span>
      </button>
    `;
  }

  const next = locked.reduce((best, s) => (s.progress > best.progress ? s : best), locked[0]);
  const clamped = Math.max(0, Math.min(next.progress, 1));
  const offset = (STRIP_RING_C * (1 - clamped)).toFixed(1);

  // 進度短句：講「還差多少」而不是抽象百分比，新手（什麼都還沒有）給起步文案。
  let hint;
  if (next.kind === 'streak') {
    hint = next.streak > 0
      ? `已連續 ${Math.min(next.streak, next.target)} 天，再 ${Math.max(next.target - next.streak, 0)} 天到手`
      : `今天開始，連練 ${next.target} 天就是你的`;
  } else if (next.kind === 'volume') {
    hint = next.totalShots > 0
      ? `已投 ${formatThousands(next.totalShots)} 顆，再 ${formatThousands(Math.max(next.target - next.totalShots, 0))} 顆到手`
      : `累計投滿 ${formatThousands(next.target)} 顆就是你的`;
  } else {
    hint = `已通過 ${next.ladder.passed} 關，再通過 ${next.ladder.total - next.ladder.passed} 關到手`;
  }

  return `
    <button type="button" class="badge-strip" data-action="open-badges">
      <div class="badge-strip__disc">
        <svg class="badge-strip__ring" viewBox="0 0 44 44" aria-hidden="true">
          <circle class="badge-strip__ring-track" cx="22" cy="22" r="19" fill="none" stroke-width="2.5"/>
          <circle class="badge-strip__ring-fill" cx="22" cy="22" r="19" fill="none" stroke-width="2.5"
            stroke-dasharray="${STRIP_RING_C}" stroke-dashoffset="${offset}" transform="rotate(-90 22 22)"/>
        </svg>
        ${iconSvg(next.icon, 'badge-strip__icon')}
      </div>
      <div class="badge-strip__text">
        <span class="badge-strip__label">${earnedCount === 0 ? '第一顆徽章' : '下一顆徽章'}</span>
        <span class="badge-strip__name">${BADGE_LABEL[next.id] || next.id}</span>
        <span class="badge-strip__meta">${hint}</span>
      </div>
      <span class="badge-strip__count">徽章 ${earnedCount}/${total}</span>
    </button>
  `;
}
