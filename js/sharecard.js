// js/sharecard.js
// 成績分享卡：canvas 手繪 1080x1350（IG 4:5）PNG，供「分享」／「下載」用。
// 拆兩層：buildCardData（純資料，可安全在其他模組重用）＋ drawCard（純畫圖，不碰 store）。
// 本檔另外提供 openShareSheet 負責畫面（sheet 開合、分享／下載按鈕），是唯一碰 DOM 的入口。

import { getMenu } from './menus.js';
import { SPOTS } from './court.js';
import { aggregate, pct, sessionPct, isChallengeEligible, evaluatePassRule } from './stats.js';

const CARD_W = 1080;
const CARD_H = 1350;

// 卡片專用色票：與 tokens.css 同值的字面 hex（canvas 內規格允許例外）。
const COLORS = {
  bg: '#FAF9F7',
  text: '#2B2A28',
  muted: '#6B6053',
  accent: '#E8590C',
  sand: '#F1E8DD',
  courtLine: '#C9BFAF',
  heatCold: '#3E7CB1',
  heatWarm: '#E3A72E',
  heatHot: '#E8590C',
};

const FONT_FAMILY = '-apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
const TYPE_OPTIONS = ['2pt', '3pt', 'deep3', 'ft'];
const TYPE_LABEL = { '2pt': '2 分', '3pt': '3 分', deep3: '深 3', ft: '罰球' };

function variantLabel(variant) {
  if (variant === 'full') return '完整';
  if (variant === 'easy') return '簡易';
  return '';
}

// 與 court.js heatColor() 同一套三級門檻，只是這裡用字面 hex。
function heatTierColor(p) {
  if (p === null || p === undefined) return COLORS.heatCold;
  if (p < 40) return COLORS.heatCold;
  if (p <= 55) return COLORS.heatWarm;
  return COLORS.heatHot;
}

/**
 * 組出分享卡要畫的純資料物件，不碰 DOM、不寫入 store。
 * @param {Object} session
 * @param {Object} state 完整 store 狀態（讀 progress.best 判斷「個人最佳」徽章）
 * @returns {Object}
 */
export function buildCardData(session, state) {
  const menu = getMenu(session.mode);
  const agg = aggregate(session.rounds);
  const totalPct = pct(agg.total.mk, agg.total.att);

  const typeRows = TYPE_OPTIONS.filter((t) => agg.byType[t]).map((t) => {
    const d = agg.byType[t];
    return { type: t, label: TYPE_LABEL[t], att: d.att, mk: d.mk, pct: pct(d.mk, d.att) };
  });

  const heatSpots = SPOTS.map((spot) => {
    const d = agg.bySpot[spot.id];
    if (!d || d.att <= 0) return null;
    return { id: spot.id, cx: spot.cx, cy: spot.cy, att: d.att, mk: d.mk, pct: pct(d.mk, d.att) };
  }).filter(Boolean);

  // 挑戰達成：只有挑戰菜單的完整版、且通過誠實機制與 passRule 才算。
  let achieved = false;
  if (menu && menu.challenge && session.variant === 'full') {
    achieved = isChallengeEligible(session) && evaluatePassRule(session, menu.passRule).pass;
  }

  // 個人最佳：純對照 progress.best[menuId].pct 與本節 sessionPct 是否相等，不寫入任何東西。
  let personalBest = false;
  const best = state && state.progress && state.progress.best ? state.progress.best[session.mode] : null;
  const sp = sessionPct(session);
  if (best && sp !== null && best.pct === sp) personalBest = true;

  const d = new Date(session.startedAt);
  const dateLabel = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

  return {
    dateLabel,
    menuName: menu ? menu.name : session.mode,
    variantLabel: variantLabel(session.variant),
    totalPct,
    totalAtt: agg.total.att,
    totalMk: agg.total.mk,
    typeRows,
    heatSpots,
    achieved,
    personalBest,
  };
}

// ---------------------------------------------------------------------------
// 畫圖（純函式：只讀 data，寫入傳入的 canvas，不碰 store／不觸發副作用）
// ---------------------------------------------------------------------------

/** 縮字級直到塞得下 maxWidth，不裁切文字。回傳最終字級。 */
function fitFontSize(ctx, text, maxWidth, startSize, weight) {
  let size = startSize;
  while (size > 14) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBrandMark(ctx, x, baselineY) {
  const r = 22;
  const cy = baselineY - r + 8;
  ctx.beginPath();
  ctx.fillStyle = COLORS.accent;
  ctx.arc(x + r, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.bg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, cy);
  ctx.lineTo(x + r * 2, cy);
  ctx.moveTo(x + r, cy - r);
  ctx.lineTo(x + r, cy + r);
  ctx.stroke();

  ctx.fillStyle = COLORS.text;
  ctx.font = `800 32px ${FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SHOT LEDGER', x + r * 2 + 18, baselineY);
}

// 半場座標系與 court.js 一致（viewBox 0 0 750 560），這裡用 canvas 手繪簡化版。
function drawMiniCourt(ctx, heatSpots, ox, oy, scale) {
  const tx = (px) => ox + px * scale;
  const ty = (py) => oy + py * scale;

  ctx.strokeStyle = COLORS.courtLine;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 底線／邊線
  ctx.beginPath();
  ctx.moveTo(tx(0), ty(0));
  ctx.lineTo(tx(750), ty(0));
  ctx.moveTo(tx(0), ty(0));
  ctx.lineTo(tx(0), ty(560));
  ctx.moveTo(tx(750), ty(0));
  ctx.lineTo(tx(750), ty(560));
  ctx.stroke();

  // 禁區
  ctx.strokeRect(tx(252.5), ty(0), 245 * scale, 290 * scale);

  // 罰球圈
  ctx.beginPath();
  ctx.setLineDash([8 * scale, 7 * scale]);
  ctx.arc(tx(375), ty(290), 90 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 三分線
  const sideOffset = 45;
  const threeR = 337.5;
  const hoopX = 375;
  const hoopY = 79;
  const dxSide = hoopX - sideOffset;
  const arcY = hoopY + Math.sqrt(threeR * threeR - dxSide * dxSide);
  const leftAngle = Math.atan2(arcY - hoopY, sideOffset - hoopX);
  const rightAngle = Math.atan2(arcY - hoopY, 750 - sideOffset - hoopX);
  ctx.beginPath();
  ctx.moveTo(tx(sideOffset), ty(0));
  ctx.lineTo(tx(sideOffset), ty(arcY));
  ctx.arc(tx(hoopX), ty(hoopY), threeR * scale, leftAngle, rightAngle, true);
  ctx.lineTo(tx(750 - sideOffset), ty(0));
  ctx.stroke();

  // 籃框
  ctx.beginPath();
  ctx.strokeStyle = COLORS.accent;
  ctx.arc(tx(hoopX), ty(hoopY), 11.5 * scale, 0, Math.PI * 2);
  ctx.stroke();

  // 出手點位：僅畫該節有出手的點，顏色同熱區三級。
  heatSpots.forEach((s) => {
    ctx.beginPath();
    ctx.fillStyle = heatTierColor(s.pct);
    ctx.arc(tx(s.cx), ty(s.cy), 20 * scale, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * 純畫圖：把 buildCardData() 的資料畫進 canvas（會重設 canvas 尺寸為 1080x1350）。
 * @param {HTMLCanvasElement} canvas
 * @param {Object} data buildCardData() 的回傳值
 */
export function drawCard(canvas, data) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const marginX = 76;
  let y = 100;

  // 1. 品牌列（左：小籃球圖示＋SHOT LEDGER；右：日期）
  drawBrandMark(ctx, marginX, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 30px ${FONT_FAMILY}`;
  ctx.fillText(data.dateLabel, CARD_W - marginX, y);
  ctx.textAlign = 'left';
  y += 78;

  // 2. 菜單名＋變體 tag
  const menuLine = data.variantLabel ? `${data.menuName}・${data.variantLabel}` : data.menuName;
  const menuSize = fitFontSize(ctx, menuLine, CARD_W - marginX * 2, 46, 800);
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 ${menuSize}px ${FONT_FAMILY}`;
  ctx.fillText(menuLine, marginX, y);
  y += 66;

  // 3. 主數字：總命中率超大字＋投中比數
  const pctLabel = data.totalPct === null ? '—' : `${data.totalPct}%`;
  ctx.fillStyle = COLORS.accent;
  ctx.font = `800 150px ${FONT_FAMILY}`;
  ctx.fillText(pctLabel, marginX, y + 122);
  const pctWidth = ctx.measureText(pctLabel).width;

  const detailLabel = `${data.totalMk}/${data.totalAtt} 投中`;
  const detailX = marginX + pctWidth + 28;
  const detailSize = fitFontSize(ctx, detailLabel, CARD_W - marginX - detailX, 34, 700);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 ${detailSize}px ${FONT_FAMILY}`;
  ctx.fillText(detailLabel, detailX, y + 122);
  y += 176;

  // 4. 球種列（有資料的才列）
  data.typeRows.forEach((row) => {
    const line = `${row.label} ${row.mk}/${row.att}・${row.pct === null ? '—' : row.pct + '%'}`;
    const size = fitFontSize(ctx, line, CARD_W - marginX * 2, 36, 700);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${size}px ${FONT_FAMILY}`;
    ctx.fillText(line, marginX, y);
    y += 50;
  });
  y += 26;

  // 5. 迷你半場熱區圖（約佔卡片寬 70%，置中）
  const courtW = CARD_W * 0.7;
  const scale = courtW / 750;
  const courtH = 560 * scale;
  const courtX = (CARD_W - courtW) / 2;
  drawMiniCourt(ctx, data.heatSpots, courtX, y, scale);
  y += courtH + 44;

  // 6. 狀態列（有才顯示，最多兩枚扁平徽章）
  const badges = [];
  if (data.achieved) badges.push('挑戰達成 ✓');
  if (data.personalBest) badges.push('個人最佳');
  if (badges.length) {
    let bx = marginX;
    ctx.font = `700 28px ${FONT_FAMILY}`;
    badges.forEach((label) => {
      const w = ctx.measureText(label).width + 44;
      roundRectPath(ctx, bx, y, w, 56, 28);
      ctx.fillStyle = COLORS.sand;
      ctx.fill();
      ctx.fillStyle = COLORS.accent;
      ctx.fillText(label, bx + 22, y + 37);
      bx += w + 18;
    });
  }

  // 7. 底部：網址（小字置中）
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 24px ${FONT_FAMILY}`;
  ctx.fillText('shot-ledger.pages.dev', CARD_W / 2, CARD_H - 56);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// 分享 sheet（唯一碰 DOM 的入口）：全螢幕預覽＋分享／下載／關閉
// ---------------------------------------------------------------------------

/** 把 dataURL 同步轉成 Blob（避免 canvas.toBlob 的非同步時序，下載／分享才不會搶跑）。 */
function dataURLToBlob(dataURL) {
  const [header, base64] = dataURL.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function formatFilenameDate(iso) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 開啟成績分享卡的全螢幕 sheet：畫卡片預覽＋提供分享／下載／關閉。
 * @param {Object} session
 * @param {Object} state 完整 store 狀態
 */
export function openShareSheet(session, state) {
  const data = buildCardData(session, state);
  const canvas = document.createElement('canvas');
  drawCard(canvas, data);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = dataURLToBlob(dataUrl);
  const filename = `shotledger-card-${formatFilenameDate(session.startedAt)}.png`;

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop share-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet share-sheet">
      <h3 class="sheet__title">分享成績卡</h3>
      <div class="share-sheet__preview">
        <img alt="成績分享卡預覽" />
      </div>
      <div class="share-sheet__actions">
        <button class="btn btn--primary" data-action="share-card" hidden>分享</button>
        <button class="btn btn--secondary" data-action="download-card">下載 PNG</button>
        <button class="btn btn--ghost" data-action="close-share">關閉</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('img').src = dataUrl;

  const shareBtn = backdrop.querySelector('[data-action="share-card"]');
  const downloadBtn = backdrop.querySelector('[data-action="download-card"]');
  const closeBtn = backdrop.querySelector('[data-action="close-share"]');

  let file = null;
  try {
    file = new File([blob], filename, { type: 'image/png' });
  } catch (err) {
    file = null; // 極少數不支援 File 建構子的環境，僅隱藏分享鈕即可
  }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [file], title: 'Shot Ledger' });
      } catch (err) {
        // 使用者取消分享是正常操作，不特別處理
      }
    });
  }

  downloadBtn.addEventListener('click', () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  function close() {
    backdrop.remove();
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
}
