// js/sharecard.js
// 成績分享卡：canvas 手繪 1080x1350（IG 4:5）PNG，供「分享」／「下載」用。
// 拆兩層：buildCardData（純資料，可安全在其他模組重用）＋ drawCard（純畫圖，不碰 store）。
// 本檔另外提供 openShareSheet 負責畫面（sheet 開合、分享／下載按鈕），是唯一碰 DOM 的入口。

import { getMenu, ladderMenus } from './menus.js';
import { SPOTS } from './court.js';
import {
  aggregate, pct, sessionPct, isChallengeEligible, evaluatePassRule,
  lifetimeTotals, streakDays, maxStreakDays, formatThousands,
} from './stats.js';
import { BADGE_TOTAL, ladderProgress, earnedBadgeList, starsCount, ICON_PATH } from './badges.js';
import { setCardBg } from './store.js';
// 注意：store.js 不 import 本檔，這裡反過來 import 它不會造成循環相依。
// badges.js 只依賴 stats.js／menus.js（不 import sharecard.js），同理不會循環。

const CARD_W = 1080;
const CARD_H = 1350;

// 卡片專用色票：與 tokens.css 同值的字面 hex（canvas 內規格允許例外）。
// 分享卡是紙感設計，固定亮色輸出，不隨 App 深色模式變色（M3 SPEC §0.4）。
// 紙感背景不再是近白（#FAF9F7 會吃掉 accent 大字），改成暖沙色縱向漸層
// paperTop→paperBottom；bg 保留給品牌球圖示的十字線色。
const COLORS = {
  bg: '#FAF9F7',
  paperTop: '#F3EADC',
  paperBottom: '#E6D6C0',
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
const TYPE_OPTIONS = ['2pt', '3pt', 'deep3', 'ft', 'layup'];
const TYPE_LABEL = { '2pt': '2 分', '3pt': '3 分', deep3: '深 3', ft: '罰球', layup: '上籃' };

// 完整版是預設，不標；只有簡易版（綜合巡迴、舊紀錄）才需要區分。
function variantLabel(variant) {
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

/** M/D 起訖日期範圍字串（同 buildCardData 的 dateLabel 格式），單日時只顯示一個日期。 */
function formatDateSlash(d) {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 依 tier 順序，每一關的階梯格狀態：與 session.js 階梯頁同一套判定，通過讀
 *  progress.passed 明確記錄（SPEC_M11 §4.1，不再用「下一關已解鎖」推導）。 */
function buildLadderCells(state) {
  const ladder = ladderMenus();
  const unlockedIds = state.progress.unlocked;
  const passedIds = Array.isArray(state.progress.passed) ? state.progress.passed : [];
  return ladder.map((m) => {
    if (passedIds.includes(m.id)) return 'passed';
    if (unlockedIds.includes(m.id)) return 'unlocked';
    return 'locked';
  });
}

/**
 * 組出生涯成績分享卡要畫的純資料物件，不碰 DOM、不寫入 store（SPEC_M10 §2.4）。
 * @param {Object} state 完整 store 狀態
 * @param {Date} [now]
 * @returns {Object}
 */
export function buildLifetimeCardData(state, now = new Date()) {
  const sessions = state.sessions || [];

  // rangeLabel：最早～最新場次的日期範圍；完全沒有任何場次時退回今天單一日期
  // （0 球生涯理論上不會走到分享卡入口，這裡仍保底避免畫出空字串）。
  let rangeLabel;
  const startTimes = sessions
    .map((s) => new Date(s.startedAt).getTime())
    .filter((t) => !Number.isNaN(t));
  if (startTimes.length === 0) {
    rangeLabel = formatDateSlash(now);
  } else {
    const minD = new Date(Math.min(...startTimes));
    const maxD = new Date(Math.max(...startTimes));
    rangeLabel = startTimes.length === 1 || minD.getTime() === maxD.getTime()
      ? formatDateSlash(minD)
      : `${formatDateSlash(minD)} – ${formatDateSlash(maxD)}`;
  }

  const totals = lifetimeTotals(sessions);
  const totalPct = pct(totals.mk, totals.att);
  // 練習次數只算已結束的節；輪次含進行中的一節——與統計頁 renderLifetimeCard() 同一套算法。
  const sessionCount = sessions.filter((s) => s.endedAt !== null).length;
  const roundCount = sessions.reduce((sum, s) => sum + (s.rounds ? s.rounds.length : 0), 0);
  const badgeList = earnedBadgeList(state);

  return {
    rangeLabel,
    totalPct,
    totalAtt: totals.att,
    totalMk: totals.mk,
    sessionCount,
    roundCount,
    streak: streakDays(sessions, now),
    maxStreak: maxStreakDays(sessions),
    ladder: ladderProgress(state),
    ladderCells: buildLadderCells(state),
    stars: starsCount(state),
    badges: { list: badgeList, count: badgeList.length, total: BADGE_TOTAL },
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

/**
 * 量出文字「實際墨水高度」（ascent／descent），用來做顯式游標推進（SPEC M4.3
 * §3a）：比用字級猜高度準確，尤其中文字常常視覺上比字級本身高／矮。部分極舊
 * 瀏覽器沒有 actualBoundingBox*，退回用字級比例估算，僅為保底不影響主流程。
 * 注意：這兩個值是相對「呼叫當下 ctx.textBaseline」量的，本檔全程維持預設值
 * alphabetic（drawMiniCourt 內部暫改 middle，結束前會自己還原），呼叫端不需
 * 另外處理。
 */
function measureAscDesc(ctx, text, font) {
  ctx.font = font;
  const m = ctx.measureText(text);
  const sizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : 24;
  const asc = typeof m.actualBoundingBoxAscent === 'number' && !Number.isNaN(m.actualBoundingBoxAscent)
    ? m.actualBoundingBoxAscent
    : size * 0.8;
  const desc = typeof m.actualBoundingBoxDescent === 'number' && !Number.isNaN(m.actualBoundingBoxDescent)
    ? m.actualBoundingBoxDescent
    : size * 0.22;
  return { asc, desc, width: m.width };
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

// textColor：品牌名文字色，紙感版是深炭色，照片版改亮色（球圖示本身的橘底＋淺色十字線
// 不受影響，因為它畫在 accent 圓底上，不是畫在卡片背景上）。
function drawBrandMark(ctx, x, baselineY, textColor = COLORS.text) {
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

  ctx.fillStyle = textColor;
  ctx.font = `800 32px ${FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SHOT LEDGER', x + r * 2 + 18, baselineY);
}

/** 把圖片以「cover」方式裁切鋪滿 (w, h)：短邊貼齊、置中裁切長邊，不變形。 */
function drawCoverImage(ctx, img, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const targetRatio = w / h;
  const srcRatio = iw / ih;
  let sx, sy, sw, sh;
  if (srcRatio > targetRatio) {
    // 圖片比卡片寬：裁左右
    sh = ih;
    sw = ih * targetRatio;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    // 圖片比卡片高：裁上下
    sw = iw;
    sh = iw / targetRatio;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// 半場座標系與 court.js 一致（viewBox 0 0 750 560），這裡用 canvas 手繪簡化版。
// lineColor：球場線色，紙感版用不透明淺灰，照片版改半透明白（暗底上才看得清楚）。
function drawMiniCourt(ctx, heatSpots, ox, oy, scale, lineColor = COLORS.courtLine) {
  const tx = (px) => ox + px * scale;
  const ty = (py) => oy + py * scale;

  ctx.strokeStyle = lineColor;
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

  // 出手點位：僅畫該節有出手的點，「填色進度環」與 App 端 court.js 同步——
  // 環的長度＝命中率、環內鋪熱度色淡底、數字（不含 %）用熱度色。
  // 幾何同 court.js：環 r33／環粗 8／環底圓 r38（SVG 座標，乘 scale）。
  const RING_R = 33 * scale;
  const RING_SW = 8 * scale;
  const RING_BG_R = RING_R + RING_SW / 2 + 1 * scale;
  heatSpots.forEach((s) => {
    const cx = tx(s.cx);
    const cy = ty(s.cy);
    const color = heatTierColor(s.pct);

    // 環底圓：近白底蓋住球場線，紙感版與照片版都當「晶片」浮在底上
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.arc(cx, cy, RING_BG_R, 0, Math.PI * 2);
    ctx.fill();

    // 環內熱度色淡底
    ctx.beginPath();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.arc(cx, cy, RING_R - RING_SW / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 環軌道（未達成部分）：淡出的中性環
    ctx.beginPath();
    ctx.strokeStyle = COLORS.courtLine;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = RING_SW;
    ctx.arc(cx, cy, RING_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 進度弧：12 點鐘起順時針、長度＝命中率、圓頭收尾
    if (s.pct > 0) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = RING_SW;
      ctx.lineCap = 'round';
      const start = -Math.PI / 2;
      ctx.arc(cx, cy, RING_R, start, start + (s.pct / 100) * Math.PI * 2);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // 數字：熱度色、「100」縮一級（同 App 端 .spot-heat-pct--tight）
    const fs = (s.pct === 100 ? 23 : 27) * scale;
    ctx.font = `800 ${fs}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(`${s.pct}`, cx, cy);
  });

  // 還原預設對齊方式，避免影響 drawCard 後續段落的文字繪製
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * 卡片底圖＋色票（紙感 vs 照片，暗化漸層／浮水印圓環都在這裡）：單場卡與生涯卡
 * 完全共用，抽出來只是搬程式碼，兩種卡的視覺輸出不得因此改變。
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} photoImg
 * @returns {Object} palette
 */
function drawCardBackgroundAndPalette(ctx, photoImg) {
  // 照片模式：文字全面改亮色系，好在暗化後的照片上維持可讀；無照片時維持紙感亮色版原樣。
  // accent 在照片模式改亮橘（比深色主題 accent #F2691D 再亮半階），壓在照片上對比才夠；
  // 徽章改實心亮橘＋白字，取代看不清的半透明白底（SPEC M4.2 §5）。
  const palette = photoImg
    ? {
        text: '#FAF9F7',
        muted: 'rgba(255, 255, 255, 0.72)',
        accent: '#FF8A3D',
        courtLine: 'rgba(255, 255, 255, 0.55)',
        badgeBg: '#FF8A3D',
        badgeText: '#FFFFFF',
        badgeWeight: 800,
        pctShadow: true,
      }
    : {
        text: COLORS.text,
        muted: COLORS.muted,
        accent: COLORS.accent,
        // 沙色底比近白深一階，球場線／徽章底也各深一階才拉得開層次：
        // 線用暖灰褐，徽章底改近白（沙底上反而是淺色會浮起來）。
        courtLine: '#B7AA92',
        badgeBg: '#FBF5EC',
        badgeText: COLORS.accent,
        badgeWeight: 700,
        pctShadow: false,
      };

  if (photoImg) {
    drawCoverImage(ctx, photoImg, CARD_W, CARD_H);
    // 整面暗化＋上下加深的漸層，確保品牌列與底部網址永遠可讀
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else {
    // 紙感版：暖沙色縱向漸層取代整面近白——底色本身有色溫，accent 大字
    // 才不會浮在白紙上被吃掉（使用者回饋：白底會吃掉命中率數字）。
    const paperGrad = ctx.createLinearGradient(0, 0, 0, CARD_H);
    paperGrad.addColorStop(0, COLORS.paperTop);
    paperGrad.addColorStop(1, COLORS.paperBottom);
    ctx.fillStyle = paperGrad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // 右上角一枚超大的球紋浮水印圓環（呼應 hero 卡刊號浮水印的氛圍手法），
    // 極低透明度、只當紙上的印刷紋理，不與前景文字搶對比。
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 89, 12, 0.07)';
    ctx.lineWidth = 3;
    const wmX = CARD_W - 150;
    const wmY = 210;
    ctx.beginPath();
    ctx.arc(wmX, wmY, 300, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wmX, wmY, 236, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wmX - 300, wmY);
    ctx.lineTo(wmX + 300, wmY);
    ctx.moveTo(wmX, wmY - 300);
    ctx.lineTo(wmX, wmY + 300);
    ctx.stroke();
    ctx.restore();
  }

  return palette;
}

/**
 * 純畫圖：把 buildCardData() 的資料畫進 canvas（會重設 canvas 尺寸為 1080x1350）。
 * @param {HTMLCanvasElement} canvas
 * @param {Object} data buildCardData() 的回傳值
 * @param {{photoImg?: HTMLImageElement|null}} [opts] opts.photoImg：使用者自訂照片背景，
 *   只存在記憶體（呼叫端自己管理），這裡純讀取、不落地存任何東西。無照片時輸出與紙感版一致。
 */
export function drawCard(canvas, data, opts = {}) {
  const photoImg = opts && opts.photoImg ? opts.photoImg : null;

  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  const palette = drawCardBackgroundAndPalette(ctx, photoImg);

  // -------------------------------------------------------------------------
  // 版面：顯式游標推進（SPEC M4.3 §3a，修垂直重疊 bug 的根因修正）。
  // y 全程代表「下一區塊可以開始畫的最上緣」（不是 baseline）；每畫完一段就用
  // 量到的實際墨水高度（measureAscDesc：ascent＋descent，不是字級猜測）＋固定
  // GAP 往下推進，不再疊加魔術數字。GAP 一律 ≥16px，結構上保證任兩段內容之間
  // 的純背景帶都達標。高度預算表（實際值依資料內容變動，這裡列的是設計目標）：
  //
  //   區塊                    大約視覺高度         GAP（到下一段）
  //   ────────────────────── ─────────────────── ───────────────
  //   品牌列（圖示＋文字）      ~44px               34px
  //   菜單名                  ≤58px（依字級）       30px
  //   主數字＋球種列（合併帶）   max(左欄實高,        40px
  //     左欄＝57%大字＋投中行     右欄行數×行距)
  //     右欄＝球種一行一種
  //     （最多4行）
  //   迷你球場                 78～83% 卡寬換算       40px
  //   狀態徽章（可選 0～2 枚）   56px                 34px
  //   網址                    固定貼底 CARD_H-56（前面留夠淨空即可，不參與游標）
  //
  //   SPEC M4.4 §1：主數字區與球種列合併為同一水平帶、左右兩欄，不再橫排擠在
  //   一起。左欄＝57%超大字（150px 不變）＋正下方投中比數（小字、同左對齊）；
  //   右欄＝球種一行一種、最多4行、三欄固定錨點跨行對齊（label左/count右/pct
  //   右），x 起點用「100%」最寬情境算死，不隨百分比位數浮動。兩欄共用同一個
  //   游標 y 當頂緣（天然頂對齊，球種 1～2 種時右欄變短也不置中）；整帶高度＝
  //   max(左欄實高, 右欄行數×行距)，取兩者較大值往下推進游標。
  const marginX = 76;
  let y = 100;

  // 1. 品牌列（左：小籃球圖示＋SHOT LEDGER；右：日期）
  const brandFont = `800 32px ${FONT_FAMILY}`;
  const dateFont = `700 30px ${FONT_FAMILY}`;
  // 圖示頂緣＝baseline-36（見 drawBrandMark 的 r=22、cy=baseline-r+8 幾何），
  // 比文字頂緣更高，是本區塊真正的頂，用它反推 baseline 讓區塊頂對齊游標 y。
  const brandBaselineY = y + 36;
  drawBrandMark(ctx, marginX, brandBaselineY, palette.text);
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.muted;
  ctx.font = dateFont;
  ctx.fillText(data.dateLabel, CARD_W - marginX, brandBaselineY);
  ctx.textAlign = 'left';
  const brandTextMetrics = measureAscDesc(ctx, 'SHOT LEDGER', brandFont);
  const dateMetrics = measureAscDesc(ctx, data.dateLabel, dateFont);
  const brandIconBottom = brandBaselineY + 8; // 圖示半徑22＋往下偏移8，幾何固定值
  const brandBlockBottom = Math.max(
    brandIconBottom,
    brandBaselineY + brandTextMetrics.desc,
    brandBaselineY + dateMetrics.desc
  );
  y = brandBlockBottom + 34;

  // 2. 菜單名＋變體 tag
  const menuLine = data.variantLabel ? `${data.menuName}・${data.variantLabel}` : data.menuName;
  const menuSize = fitFontSize(ctx, menuLine, CARD_W - marginX * 2, 46, 800);
  const menuFont = `800 ${menuSize}px ${FONT_FAMILY}`;
  const menuMetrics = measureAscDesc(ctx, menuLine, menuFont);
  const menuBaselineY = y + menuMetrics.asc;
  ctx.fillStyle = palette.text;
  ctx.font = menuFont;
  ctx.fillText(menuLine, marginX, menuBaselineY);
  y = menuBaselineY + menuMetrics.desc + 30;

  // 3. 主數字＋球種列合併帶：左欄（57%大字＋正下方投中比數）／右欄（球種
  // 直排，一行一種，SPEC M4.4 §1）。兩欄共用同一個 bandTop 當頂緣，各自往下
  // 推進，最後取兩欄實高較大值決定這一整帶的高度。
  const bandTop = y;

  // 3a. 左欄：總命中率超大字（150px 不變）＋正下方投中比數（小字、同左對齊，
  // 不再擠在大字右側）。照片模式加柔和深色投影，橘字壓在亮部照片上也讀得清；
  // 畫完立刻重置 shadow 免得污染後續繪製。
  const pctLabel = data.totalPct === null ? '—' : `${data.totalPct}%`;
  const pctFont = `800 150px ${FONT_FAMILY}`;
  const detailLabel = `${data.totalMk}/${data.totalAtt} 投中`;
  const detailSize = fitFontSize(ctx, detailLabel, CARD_W - marginX * 2, 34, 700);
  const detailFont = `700 ${detailSize}px ${FONT_FAMILY}`;

  const pctMetrics = measureAscDesc(ctx, pctLabel, pctFont);
  const detailMetrics = measureAscDesc(ctx, detailLabel, detailFont);

  const bigNumBaselineY = bandTop + pctMetrics.asc;

  if (palette.pctShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.fillStyle = palette.accent;
  ctx.font = pctFont;
  ctx.fillText(pctLabel, marginX, bigNumBaselineY);
  if (palette.pctShadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  const GAP_PCT_TO_DETAIL = 22;
  const detailBaselineY = bigNumBaselineY + pctMetrics.desc + GAP_PCT_TO_DETAIL + detailMetrics.asc;
  ctx.fillStyle = palette.muted;
  ctx.font = detailFont;
  ctx.fillText(detailLabel, marginX, detailBaselineY);

  const leftColBottom = detailBaselineY + detailMetrics.desc;

  // 3b. 右欄：球種一行一種、最多5行（TYPE_OPTIONS 上限），三欄固定錨點跨行
  // 對齊（label 左對齊欄 x／count 右對齊欄 x+170／pct 右對齊欄 x+280，
  // 「深3 50/90 56%」實測欄寬微調）。x 起點用 pctFont 畫「100%」的最寬情境
  // 算死＋40px，不隨總命中率百分比位數浮動，卡與卡之間右欄位置穩定。
  ctx.font = pctFont;
  const widestPctW = ctx.measureText('100%').width;
  const rightColX = marginX + widestPctW + 40;
  const typeColAnchorCount = 170; // count 右緣＝rightColX+170
  const typeColAnchorPct = 280; // pct 右緣＝rightColX+280
  const typeRowFontBase = `700 30px ${FONT_FAMILY}`;
  const typeRowRef = measureAscDesc(ctx, '深 3', typeRowFontBase); // 代表性 CJK 字高，決定列距
  // 目標行距約44（SPEC M4.4 §1）；+20 的緩衝值以實畫掃描結果為準（見自驗記錄：
  // +14 時實測相鄰行純背景帶只有 13～14px，加大到 +20 才穩定 ≥16px，驗收必檢 #1）。
  const typeRowPitch = Math.ceil(typeRowRef.asc + typeRowRef.desc) + 20;
  const typeFirstBaseline = bandTop + typeRowRef.asc;

  data.typeRows.forEach((row, i) => {
    const rowBaseline = typeFirstBaseline + i * typeRowPitch;
    const countLabel = `${row.mk}/${row.att}`;
    const pctLabelTxt = row.pct === null ? '—' : `${row.pct}%`;

    // label／count 各自對自己的可用寬度縮字級，避免極端資料撐出欄位。
    const labelMaxW = typeColAnchorCount - 24;
    const countMaxW = typeColAnchorPct - 24 - typeColAnchorCount;
    const size = Math.min(
      fitFontSize(ctx, row.label, labelMaxW, 30, 700),
      fitFontSize(ctx, countLabel, countMaxW, 30, 700)
    );
    ctx.font = `700 ${size}px ${FONT_FAMILY}`;
    ctx.fillStyle = palette.text;

    ctx.textAlign = 'left';
    ctx.fillText(row.label, rightColX, rowBaseline);

    ctx.textAlign = 'right';
    ctx.fillText(countLabel, rightColX + typeColAnchorCount, rowBaseline);
    ctx.fillText(pctLabelTxt, rightColX + typeColAnchorPct, rowBaseline);
  });
  ctx.textAlign = 'left';

  const rightColBottom = data.typeRows.length
    ? typeFirstBaseline + (data.typeRows.length - 1) * typeRowPitch + typeRowRef.desc
    : bandTop;

  // 整帶高度＝兩欄實高較大值；球種只有 1～2 種時右欄自然變短，兩欄都從同一個
  // bandTop 頂對齊起筆，不置中。
  y = Math.max(leftColBottom, rightColBottom) + 40;

  // 4. 迷你半場熱區圖：預設 83% 卡寬，若下方（徽章／網址）空間不夠就縮到 78–80%——
  // 寧可球場小一點，不准跟下面內容重疊（SPEC §3a 最壞情境：4 球種＋2 徽章＋照片模式）。
  const badges = [];
  if (data.achieved) badges.push('挑戰達成 ✓');
  if (data.personalBest) badges.push('個人最佳');

  const urlBaselineY = CARD_H - 56; // 網址固定貼底，不受上方游標影響
  const urlAsc = measureAscDesc(ctx, 'shot-ledger.pages.dev', `600 24px ${FONT_FAMILY}`).asc;
  const GAP_COURT_TO_NEXT = 40;
  const GAP_BADGES_TO_URL = 34;
  const BADGE_ROW_H = 56;
  const GAP_COURT_TO_URL_MIN = 30; // 沒有徽章時，球場到網址文字頂緣至少留這麼多

  const reserveBelowCourt = badges.length
    ? GAP_COURT_TO_NEXT + BADGE_ROW_H + GAP_BADGES_TO_URL
    : GAP_COURT_TO_NEXT + GAP_COURT_TO_URL_MIN;
  const courtBottomMax = urlBaselineY - urlAsc - reserveBelowCourt;
  const availableCourtH = courtBottomMax - y;

  let courtFraction = 0.83;
  const courtHDefault = 560 * (CARD_W * courtFraction / 750);
  if (courtHDefault > availableCourtH) {
    courtFraction = Math.max(0.78, Math.min(0.83, (availableCourtH * 750) / (560 * CARD_W)));
  }
  const courtW = CARD_W * courtFraction;
  const scale = courtW / 750;
  const courtH = 560 * scale;
  const courtX = (CARD_W - courtW) / 2;
  drawMiniCourt(ctx, data.heatSpots, courtX, y, scale, palette.courtLine);
  y += courtH + GAP_COURT_TO_NEXT;

  // 5. 狀態列（有才顯示，最多兩枚扁平徽章）
  if (badges.length) {
    let bx = marginX;
    ctx.font = `${palette.badgeWeight} 28px ${FONT_FAMILY}`;
    badges.forEach((label) => {
      const w = ctx.measureText(label).width + 44;
      roundRectPath(ctx, bx, y, w, BADGE_ROW_H, 28);
      ctx.fillStyle = palette.badgeBg;
      ctx.fill();
      ctx.fillStyle = palette.badgeText;
      ctx.fillText(label, bx + 22, y + 37);
      bx += w + 18;
    });
    y += BADGE_ROW_H + GAP_BADGES_TO_URL;
  }

  // 6. 底部：網址（小字置中，固定貼底；上面各段落已依游標預留足夠淨空，不會相撞）
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.muted;
  ctx.font = `600 24px ${FONT_FAMILY}`;
  ctx.fillText('shot-ledger.pages.dev', CARD_W / 2, urlBaselineY);
  ctx.textAlign = 'left';
}

/**
 * 把 ICON_PATH[icon] 的內容畫到目前的變形座標系（呼叫端已 translate／scale 好，
 * 這裡只管畫線）。ICON_PATH 的字面值是「拼在一起的 SVG 子元素字串」（給
 * badges.js 的 iconSvg() 塞進 <svg> 用），不是單純的 path「d」屬性字串——例如
 * ball 圖示混了一顆 <circle>，不能整包直接丟給 new Path2D() 當 d 用（那樣第一個
 * 字元就是 '<'，會被判定成不合法路徑、整包靜默失效，什麼都畫不出來）。這裡借
 * 一個暫時的 <svg> 節點把子元素解析出來，<path> 各自轉成 Path2D、<circle> 改用
 * ctx.arc()，兩種都用同一支 stroke 樣式畫，才能正確重現全部四種圖示。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} icon ICON_PATH 的 key
 */
function drawBadgeIconShape(ctx, icon) {
  const temp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  temp.innerHTML = ICON_PATH[icon] || '';
  Array.from(temp.children).forEach((el) => {
    if (el.tagName === 'path') {
      const d = el.getAttribute('d');
      if (d) ctx.stroke(new Path2D(d));
    } else if (el.tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx'));
      const cy = parseFloat(el.getAttribute('cy'));
      const r = parseFloat(el.getAttribute('r'));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/**
 * 畫一顆徽章獎章圓盤（生涯卡專用）：accent 8% 透明填底＋accent 2px 描邊，
 * 圖示用 badges.js 的線條圖示置中畫在盤面上（視覺約 48px 見方，viewBox 是
 * 0..24，scale=2 換算），畫完 restore 還原變形，不影響後續繪製。
 * 圖示解析／繪製萬一失敗（極少數環境不支援 SVG DOM 或 Path2D），退化成畫一個
 * accent 實心小圓點——徽章圖示壞了不能連累整張卡開天窗。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r 圓盤半徑
 * @param {string} icon ICON_PATH 的 key
 * @param {Object} palette drawCardBackgroundAndPalette() 的回傳值
 */
function drawBadgeMedal(ctx, cx, cy, r, icon, palette) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.accent;
  ctx.stroke();

  try {
    const iconSize = 48; // 視覺目標尺寸；viewBox 是 24 單位，換算 scale k=2
    const k = iconSize / 24;
    ctx.save();
    ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
    ctx.scale(k, k);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.7 / k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawBadgeIconShape(ctx, icon);
    ctx.restore();
  } catch (err) {
    ctx.beginPath();
    ctx.fillStyle = palette.accent;
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// 生涯卡版面常數（驗收回饋修訂版：內容偏擠在上半部、底部留白過大，改成
// 「先量測、再把剩餘空間灌回四個段落間隙」＋放大主要元素撐住視覺重心）。
// ---------------------------------------------------------------------------
const LT_MARGIN_X = 76;
const LT_TOP_Y = 100;
const LT_TITLE_SIZE = 52;
const LT_PCT_SIZE = 190;
const LT_DETAIL_SIZE = 34;
const LT_ROW_SIZE = 30;
const LT_ROW_PITCH_PAD = 30; // 右欄行距＝字高 + 30
const LT_LADDER_CELL_H = 34;
const LT_LADDER_CELL_R = 17;
const LT_LADDER_CELL_GAP = 10;
const LT_LADDER_SUMMARY_SIZE = 32;
const LT_BADGE_LABEL_SIZE = 28;
const LT_BADGE_DISC_MAX = 112;
const LT_BADGE_DISC_MIN = 76; // 極端資料縮到底的下限（沿用舊版縮圓盤鐵律）
const LT_BADGE_DISC_GAP = 24;
const LT_BADGE_ROW_GAP = 24; // 兩列徽章之間的列距
const LT_BADGE_PER_ROW = 7; // 7×112 + 6×24 = 928 剛好滿版（CARD_W - marginX*2）
const LT_GAP_PCT_TO_DETAIL = 22;
const LT_GAP_BRAND = 34; // 品牌列到標題：固定值，不參與剩餘空間分配
const LT_GAP_TITLE_BASE = 30; // 標題到主數字帶（可分配）
const LT_GAP_BAND_BASE = 44; // 主數字帶到挑戰階梯帶（可分配）
const LT_GAP_LADDER_BASE = 44; // 挑戰階梯帶到徽章帶（可分配）
const LT_GAP_BADGE_TO_URL_BASE = 34; // 徽章帶到網址的最小值（第四個「間隙」，靠網址固定貼底自然吸收剩餘空間）
const LT_GAP_LADDER_LABEL_TO_BAR = 18;
const LT_GAP_LADDER_BAR_TO_SUMMARY = 18;
const LT_GAP_BADGE_LABEL_TO_ROW = 18;
const LT_MAX_EXTRA_PER_GAP = 90; // 每個可分配間隙最多再加這麼多

/**
 * 排出徽章獎章列的座標（不畫圖，純算位置）：一列最多 7 顆，超過 7 顆分兩列，
 * 最多顯示 13 顆實際圖示＋第 14 格＝「＋N」（總共最多 14 格，兩列 7+7）。
 * N 的算法跟舊版「一列 8 格、前 7 顆＋第 8 格 +N」同一套邏輯類推
 * （shown = 格數上限-1，N = 總數-shown），只是格數上限從 8 換成 14。
 * @param {number} count 已獲得徽章數
 * @param {number} discD 圓盤直徑
 * @param {number} discGap 同列圓盤間距
 * @param {number} rowGap 列與列的間距
 * @param {number} marginX 左邊界
 * @param {number} topY 第一列圓盤頂緣 y
 * @returns {{rows: Array<Array<{cx:number, cy:number, type:('icon'|'plus'), index?:number}>>, height:number, numRows:number, plusN:number}}
 */
function layoutBadgeRows(count, discD, discGap, rowGap, marginX, topY) {
  if (count <= 0) return { rows: [], height: 0, numRows: 0, plusN: 0 };

  const showPlus = count > LT_BADGE_PER_ROW * 2; // >14
  const iconsShown = showPlus ? LT_BADGE_PER_ROW * 2 - 1 : count; // showPlus 時只畫 13 顆圖示，第 14 格是 +N
  const row1Count = Math.min(iconsShown, LT_BADGE_PER_ROW);
  const row2IconCount = iconsShown - row1Count;
  const numRows = row2IconCount > 0 || showPlus ? 2 : 1;

  const rows = [];
  const row1Cy = topY + discD / 2;
  const row1 = [];
  let cx = marginX + discD / 2;
  for (let i = 0; i < row1Count; i++) {
    row1.push({ cx, cy: row1Cy, type: 'icon', index: i });
    cx += discD + discGap;
  }
  rows.push(row1);

  if (numRows === 2) {
    const row2Cy = topY + discD + rowGap + discD / 2;
    const row2 = [];
    cx = marginX + discD / 2;
    for (let i = 0; i < row2IconCount; i++) {
      row2.push({ cx, cy: row2Cy, type: 'icon', index: row1Count + i });
      cx += discD + discGap;
    }
    if (showPlus) row2.push({ cx, cy: row2Cy, type: 'plus' });
    rows.push(row2);
  }

  const height = numRows * discD + (numRows > 1 ? rowGap : 0);
  const plusN = showPlus ? count - iconsShown : 0;
  return { rows, height, numRows, plusN };
}

/**
 * 生涯卡版面計算（純量測，不畫任何東西）：先用「基準間隙」跑一次游標算出內容
 * 基準總高，量出離網址還剩多少 slack，再把 slack 平均灌回標題／主數字帶／
 * 挑戰階梯帶後面的三個間隙（每個最多 +90，分配不完的自然留在徽章列到網址
 * 之間，不強拉滿）；slack 為負（內容比卡片還高的極端資料）則不擴張間隙，
 * 改縮徽章圓盤到最小 76px，絕不允許段落重疊。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} data buildLifetimeCardData() 的回傳值
 * @returns {Object} 版面座標（供 paintLifetimeLayout 直接讀取繪製，不重算）
 */
function computeLifetimeLayout(ctx, data) {
  const marginX = LT_MARGIN_X;

  // ---- 品牌列（尺寸不變，量測手法同 drawCard）----
  const brandFont = `800 32px ${FONT_FAMILY}`;
  ctx.font = brandFont;
  const brandTextWidth = ctx.measureText('SHOT LEDGER').width;
  const brandBlockWidth = 44 + 18 + brandTextWidth;
  const rangeMaxWidth = Math.max(CARD_W - marginX * 2 - brandBlockWidth - 24, 60);
  const rangeSize = fitFontSize(ctx, data.rangeLabel, rangeMaxWidth, 30, 700);
  const rangeFont = `700 ${rangeSize}px ${FONT_FAMILY}`;
  const brandBaselineY = LT_TOP_Y + 36;
  const brandTextMetrics = measureAscDesc(ctx, 'SHOT LEDGER', brandFont);
  const rangeMetrics = measureAscDesc(ctx, data.rangeLabel, rangeFont);
  const brandIconBottom = brandBaselineY + 8;
  const brandBottom = Math.max(
    brandIconBottom,
    brandBaselineY + brandTextMetrics.desc,
    brandBaselineY + rangeMetrics.desc
  );

  // ---- 標題 ----
  const titleText = '生涯累計';
  const titleSize = fitFontSize(ctx, titleText, CARD_W - marginX * 2, LT_TITLE_SIZE, 800);
  const titleFont = `800 ${titleSize}px ${FONT_FAMILY}`;
  const titleMetrics = measureAscDesc(ctx, titleText, titleFont);
  const titleBaselineY = brandBottom + LT_GAP_BRAND + titleMetrics.asc;

  // ---- 主數字帶：左欄高度、右欄高度與三欄錨點 ----
  const pctLabel = data.totalPct === null ? '—' : `${data.totalPct}%`;
  const pctFont = `800 ${LT_PCT_SIZE}px ${FONT_FAMILY}`;
  const detailLabel = `${formatThousands(data.totalMk)} / ${formatThousands(data.totalAtt)} 投中`;
  const detailFont = `700 ${LT_DETAIL_SIZE}px ${FONT_FAMILY}`;
  const pctMetrics = measureAscDesc(ctx, pctLabel, pctFont);
  const detailMetrics = measureAscDesc(ctx, detailLabel, detailFont);
  const leftColH = pctMetrics.asc + pctMetrics.desc + LT_GAP_PCT_TO_DETAIL + detailMetrics.asc + detailMetrics.desc;

  ctx.font = pctFont;
  const widestPctW = ctx.measureText('100%').width;
  const rightColX = marginX + widestPctW + 40;

  const rowsData = [
    { label: '練習', value: `${data.sessionCount}`, unit: '次' },
    { label: '輪次', value: formatThousands(data.roundCount), unit: '輪' },
    { label: '連續', value: `${data.streak}`, unit: '天' },
    { label: '最長連續', value: `${data.maxStreak}`, unit: '天' },
  ];
  const rowFont = `700 ${LT_ROW_SIZE}px ${FONT_FAMILY}`;
  const rowRef = measureAscDesc(ctx, '練習', rowFont);
  const rowPitch = Math.ceil(rowRef.asc + rowRef.desc) + LT_ROW_PITCH_PAD;
  const rightColH = rowRef.asc + (rowsData.length - 1) * rowPitch + rowRef.desc;

  // 三欄錨點：label 左對齊 rightColX／數字右對齊 rightColX+valueAnchor／單位左對齊
  // rightColX+unitAnchor。放大到 190px 後 rightColX 會右移，這裡用「最長連續」＋
  // 5 位數字＋單位的最壞情境反推是否超出卡片右邊界，超出就把兩個錨點等量內縮。
  ctx.font = rowFont;
  const worstValueW = ctx.measureText('99999').width;
  const worstUnitW = Math.max(
    ctx.measureText('次').width,
    ctx.measureText('輪').width,
    ctx.measureText('天').width
  );
  let valueAnchor = 200;
  let unitAnchor = 214;
  const maxRight = CARD_W - marginX;
  const neededRight = rightColX + unitAnchor + worstUnitW;
  if (neededRight > maxRight) {
    const shrink = neededRight - maxRight;
    valueAnchor = Math.max(valueAnchor - shrink, worstValueW + 16);
    unitAnchor = Math.max(unitAnchor - shrink, valueAnchor + 14);
  }

  const bandHeight = Math.max(leftColH, rightColH);

  // ---- 挑戰階梯帶 ----
  const ladderLabelFont = `700 28px ${FONT_FAMILY}`;
  const ladderLabelMetrics = measureAscDesc(ctx, '挑戰階梯', ladderLabelFont);
  const ladderSummaryText = `已通過 ${data.ladder.passed} / ${data.ladder.total} 關 ・ ★ ${data.stars.earned} / ${data.stars.total}`;
  const ladderSummaryFont = `700 ${LT_LADDER_SUMMARY_SIZE}px ${FONT_FAMILY}`;
  const ladderSummaryMetrics = measureAscDesc(ctx, ladderSummaryText, ladderSummaryFont);
  const ladderBandHeight =
    ladderLabelMetrics.asc + ladderLabelMetrics.desc +
    LT_GAP_LADDER_LABEL_TO_BAR + LT_LADDER_CELL_H + LT_GAP_LADDER_BAR_TO_SUMMARY +
    ladderSummaryMetrics.asc + ladderSummaryMetrics.desc;

  // ---- 徽章帶：先用滿版 112px 圓盤試算高度，稍後依 slack 決定要不要縮 ----
  const badgeLabelText = `徽章 ${data.badges.count} / ${data.badges.total}`;
  const badgeLabelFont = `700 ${LT_BADGE_LABEL_SIZE}px ${FONT_FAMILY}`;
  const badgeLabelMetrics = measureAscDesc(ctx, badgeLabelText, badgeLabelFont);
  const badgeList = data.badges.list || [];

  let badgeContentHeightMax = 0;
  let emptyText = '';
  let emptyFont = '';
  let emptyMetrics = { asc: 0, desc: 0 };
  if (badgeList.length === 0) {
    emptyText = '還沒有徽章——連練 3 天就有第一顆';
    emptyFont = `700 30px ${FONT_FAMILY}`;
    emptyMetrics = measureAscDesc(ctx, emptyText, emptyFont);
    badgeContentHeightMax = emptyMetrics.asc + emptyMetrics.desc;
  } else {
    badgeContentHeightMax = layoutBadgeRows(badgeList.length, LT_BADGE_DISC_MAX, LT_BADGE_DISC_GAP, LT_BADGE_ROW_GAP, marginX, 0).height;
  }
  const badgeBandHeightMax = badgeLabelMetrics.asc + badgeLabelMetrics.desc + LT_GAP_BADGE_LABEL_TO_ROW + badgeContentHeightMax;

  // ---- 用基準間隙跑一次游標，量出「內容基準底部」----
  const bandTopBase = titleBaselineY + titleMetrics.desc + LT_GAP_TITLE_BASE;
  const ladderTopBase = bandTopBase + bandHeight + LT_GAP_BAND_BASE;
  const badgeTopBase = ladderTopBase + ladderBandHeight + LT_GAP_LADDER_BASE;
  const contentBottomBase = badgeTopBase + badgeBandHeightMax;

  const urlBaselineY = CARD_H - 56;
  const urlFont = `600 24px ${FONT_FAMILY}`;
  const urlAsc = measureAscDesc(ctx, 'shot-ledger.pages.dev', urlFont).asc;
  const target = urlBaselineY - urlAsc - LT_GAP_BADGE_TO_URL_BASE;
  const slack = target - contentBottomBase;

  // ---- 分配剩餘空間／或在資料極端時縮徽章圓盤，兩者互斥 ----
  let extra = 0;
  let discD = LT_BADGE_DISC_MAX;
  if (slack >= 0) {
    extra = Math.min(slack / 4, LT_MAX_EXTRA_PER_GAP);
  } else if (badgeList.length > 0) {
    const deficit = -slack;
    const trial = layoutBadgeRows(badgeList.length, LT_BADGE_DISC_MAX, LT_BADGE_DISC_GAP, LT_BADGE_ROW_GAP, marginX, 0);
    const floorHeight = trial.numRows * LT_BADGE_DISC_MIN + (trial.numRows > 1 ? LT_BADGE_ROW_GAP : 0);
    const targetHeight = Math.max(floorHeight, trial.height - deficit);
    discD = trial.numRows > 1 ? (targetHeight - LT_BADGE_ROW_GAP) / trial.numRows : targetHeight;
    discD = Math.max(LT_BADGE_DISC_MIN, discD);
  }

  const titleGap = LT_GAP_TITLE_BASE + extra;
  const bandGap = LT_GAP_BAND_BASE + extra;
  const ladderGap = LT_GAP_LADDER_BASE + extra;

  // ---- 用最終間隙／圓盤尺寸正式排出每一段的絕對座標 ----
  const bandTop = titleBaselineY + titleMetrics.desc + titleGap;
  const bigNumBaselineY = bandTop + pctMetrics.asc;
  const detailBaselineY = bigNumBaselineY + pctMetrics.desc + LT_GAP_PCT_TO_DETAIL + detailMetrics.asc;
  const rowFirstBaseline = bandTop + rowRef.asc;
  const rows = rowsData.map((r, i) => ({ ...r, baselineY: rowFirstBaseline + i * rowPitch }));

  const ladderTop = bandTop + bandHeight + bandGap;
  const ladderLabelBaseline = ladderTop + ladderLabelMetrics.asc;
  const ladderBarY = ladderLabelBaseline + ladderLabelMetrics.desc + LT_GAP_LADDER_LABEL_TO_BAR;
  const ladderSummaryBaseline = ladderBarY + LT_LADDER_CELL_H + LT_GAP_LADDER_BAR_TO_SUMMARY + ladderSummaryMetrics.asc;

  const badgeTop = ladderSummaryBaseline + ladderSummaryMetrics.desc + ladderGap;
  const badgeLabelBaseline = badgeTop + badgeLabelMetrics.asc;
  const badgeRowsTop = badgeLabelBaseline + badgeLabelMetrics.desc + LT_GAP_BADGE_LABEL_TO_ROW;

  let badgeLayout = null;
  let emptyBaseline = 0;
  let badgeBottom = badgeRowsTop;
  if (badgeList.length === 0) {
    // badgeRowsTop 已經含 GAP_BADGE_LABEL_TO_ROW（小標到內容的固定間距），空狀態的
    // 一行字就當作這一列的內容，直接用 badgeRowsTop 起筆即可，不能再扣掉一次間距
    // （之前這裡誤扣，導致空狀態文字跟「徽章 0/N」小標黏在一起，幾乎零間距）。
    emptyBaseline = badgeRowsTop + emptyMetrics.asc;
    badgeBottom = emptyBaseline + emptyMetrics.desc;
  } else {
    badgeLayout = layoutBadgeRows(badgeList.length, discD, LT_BADGE_DISC_GAP, LT_BADGE_ROW_GAP, marginX, badgeRowsTop);
    badgeBottom = badgeRowsTop + badgeLayout.height;
  }

  return {
    marginX,
    brand: { baselineY: brandBaselineY, font: brandFont, rangeFont, rangeText: data.rangeLabel },
    title: { text: titleText, font: titleFont, baselineY: titleBaselineY },
    band: {
      pctLabel, pctFont, bigNumBaselineY,
      detailLabel, detailFont, detailBaselineY,
      rightColX, valueAnchor, unitAnchor, rowFont, rows,
    },
    ladder: {
      labelFont: ladderLabelFont, labelBaseline: ladderLabelBaseline,
      barY: ladderBarY, barH: LT_LADDER_CELL_H, cellGap: LT_LADDER_CELL_GAP, cellR: LT_LADDER_CELL_R,
      cells: data.ladderCells || [],
      summaryText: ladderSummaryText, summaryFont: ladderSummaryFont, summaryBaseline: ladderSummaryBaseline,
    },
    badges: {
      labelText: badgeLabelText, labelFont: badgeLabelFont, labelBaseline: badgeLabelBaseline,
      isEmpty: badgeList.length === 0,
      emptyText, emptyFont, emptyBaseline,
      discD, layout: badgeLayout, list: badgeList,
    },
    url: { baselineY: urlBaselineY, font: urlFont },
    debug: {
      brandBottom, bandTop, bandBottom: bandTop + bandHeight,
      ladderTop, ladderBottom: ladderSummaryBaseline + ladderSummaryMetrics.desc,
      badgeTop, badgeRowsTop, badgeBottom,
      urlTextTop: urlBaselineY - urlAsc,
      gapBadgeToUrl: (urlBaselineY - urlAsc) - badgeBottom,
      slack, extra, discD,
    },
  };
}

/**
 * 純畫圖：依 computeLifetimeLayout() 算好的座標把 buildLifetimeCardData() 的資料
 * 畫進 canvas（不重算任何位置，只管 fillText／stroke／fill）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} layout computeLifetimeLayout() 的回傳值
 * @param {Object} palette drawCardBackgroundAndPalette() 的回傳值
 */
function paintLifetimeLayout(ctx, layout, palette) {
  const { marginX } = layout;

  // 1. 品牌列
  drawBrandMark(ctx, marginX, layout.brand.baselineY, palette.text);
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.muted;
  ctx.font = layout.brand.rangeFont;
  ctx.fillText(layout.brand.rangeText, CARD_W - marginX, layout.brand.baselineY);
  ctx.textAlign = 'left';

  // 2. 標題
  ctx.fillStyle = palette.text;
  ctx.font = layout.title.font;
  ctx.fillText(layout.title.text, marginX, layout.title.baselineY);

  // 3. 主數字帶
  const b = layout.band;
  if (palette.pctShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.fillStyle = palette.accent;
  ctx.font = b.pctFont;
  ctx.fillText(b.pctLabel, marginX, b.bigNumBaselineY);
  if (palette.pctShadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.fillStyle = palette.muted;
  ctx.font = b.detailFont;
  ctx.fillText(b.detailLabel, marginX, b.detailBaselineY);

  ctx.font = b.rowFont;
  b.rows.forEach((row) => {
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, b.rightColX, row.baselineY);
    ctx.textAlign = 'right';
    ctx.fillText(row.value, b.rightColX + b.valueAnchor, row.baselineY);
    ctx.textAlign = 'left';
    ctx.fillText(row.unit, b.rightColX + b.unitAnchor, row.baselineY);
  });
  ctx.textAlign = 'left';

  // 4. 挑戰階梯帶
  const l = layout.ladder;
  ctx.fillStyle = palette.muted;
  ctx.font = l.labelFont;
  ctx.fillText('挑戰階梯', marginX, l.labelBaseline);

  const barW = CARD_W - marginX * 2;
  if (l.cells.length > 0) {
    const cellW = (barW - l.cellGap * (l.cells.length - 1)) / l.cells.length;
    let cx = marginX;
    l.cells.forEach((cellState) => {
      roundRectPath(ctx, cx, l.barY, cellW, l.barH, l.cellR);
      if (cellState === 'passed') {
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.accent;
      } else if (cellState === 'unlocked') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = palette.accent;
      } else {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = palette.courtLine;
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      cx += cellW + l.cellGap;
    });
  }

  ctx.fillStyle = palette.text;
  ctx.font = l.summaryFont;
  ctx.fillText(l.summaryText, marginX, l.summaryBaseline);

  // 5. 徽章帶
  const bg = layout.badges;
  ctx.fillStyle = palette.muted;
  ctx.font = bg.labelFont;
  ctx.fillText(bg.labelText, marginX, bg.labelBaseline);

  if (bg.isEmpty) {
    ctx.fillStyle = palette.muted;
    ctx.font = bg.emptyFont;
    ctx.fillText(bg.emptyText, marginX, bg.emptyBaseline);
  } else {
    const r = bg.discD / 2;
    bg.layout.rows.forEach((row) => {
      row.forEach((cell) => {
        if (cell.type === 'plus') {
          ctx.beginPath();
          ctx.arc(cell.cx, cell.cy, r, 0, Math.PI * 2);
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = palette.accent;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2;
          ctx.strokeStyle = palette.accent;
          ctx.stroke();

          ctx.font = `800 34px ${FONT_FAMILY}`;
          ctx.fillStyle = palette.accent;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`＋${bg.layout.plusN}`, cell.cx, cell.cy);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        } else {
          drawBadgeMedal(ctx, cell.cx, cell.cy, r, bg.list[cell.index].icon, palette);
        }
      });
    });
  }

  // 6. 底部：網址（固定貼底，跟單場卡一致）
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.muted;
  ctx.font = layout.url.font;
  ctx.fillText('shot-ledger.pages.dev', CARD_W / 2, layout.url.baselineY);
  ctx.textAlign = 'left';
}

/**
 * 純畫圖：把 buildLifetimeCardData() 的資料畫進生涯成績分享卡 canvas（SPEC_M10 §2.5，
 * 1080×1350，驗收回饋修訂版）。版面計算（computeLifetimeLayout）與實際繪製
 * （paintLifetimeLayout）分離：先量測所有段落的高度，把離網址還剩的空間平均
 * 灌回幾個段落間隙，讓內容站滿整張卡、不再擠在上半部；量測與繪製共用同一份
 * 座標，不會兩邊算出不一致的位置。
 * @param {HTMLCanvasElement} canvas
 * @param {Object} data buildLifetimeCardData() 的回傳值
 * @param {{photoImg?: HTMLImageElement|null}} [opts]
 */
export function drawLifetimeCard(canvas, data, opts = {}) {
  const photoImg = opts && opts.photoImg ? opts.photoImg : null;

  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  const palette = drawCardBackgroundAndPalette(ctx, photoImg);
  const layout = computeLifetimeLayout(ctx, data);
  paintLifetimeLayout(ctx, layout, palette);
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

// 底圖選擇列合法值（SPEC M5 §3；與 store.js setCardBg 的白名單一致）。
const CARD_BG_VALUES = ['paper', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5'];

/** 非法值一律回退 'bg1'，跟 store.js setCardBg 的保底邏輯保持一致。 */
function normalizeCardBg(value) {
  return CARD_BG_VALUES.includes(value) ? value : 'bg1';
}

/**
 * 開啟成績分享卡的全螢幕 sheet：畫卡片預覽＋提供分享／下載／關閉，
 * 另外可從底圖選擇列切換內建 5 張照片、紙感、或自己的照片。
 * @param {Object} session
 * @param {Object} state 完整 store 狀態（呼叫端傳進來的就是完整 store 狀態，
 *   這裡直接讀 state.settings.cardBg、直接呼叫 setCardBg(state, ...) 持久化）
 */
/**
 * 共用的分享卡 sheet（SPEC_M10 §2.2）：底圖選擇列／預覽／分享／下載／關閉，
 * 從原本 openShareSheet 抽出，單場卡與生涯卡完全共用同一份行為，重構不得
 * 改變單場卡的任何輸出。
 * @param {Object} opts
 * @param {Object} opts.state 完整 store 狀態（讀 settings.cardBg、寫入 setCardBg 持久化）
 * @param {string} opts.title sheet 標題（分享成績卡／分享生涯成績卡）
 * @param {string} opts.filename 下載／分享檔名
 * @param {(canvas: HTMLCanvasElement, opts: {photoImg: HTMLImageElement|null}) => void} opts.draw
 *   純畫圖回呼，由呼叫端把 buildCardData()／buildLifetimeCardData() 的資料綁進閉包。
 */
function openCardSheet({ state, title, filename, draw }) {
  const canvas = document.createElement('canvas');

  // 底圖狀態：selected 是目前選中的 tile 值（'paper'｜'bg1'..'bg5'｜'custom'）；
  // photoImg 是實際餵給 draw() 的圖片來源（null＝紙感）。bundled 底圖直接
  // 複用選擇列 tile 自己的 <img> 元素當畫布來源，不必另開 Image()／Map 快取——
  // tile 在整個 sheet 開啟期間都留在 DOM 裡，天生就是「切換回來不重載」。
  // 自訂照片只存在這個閉包的記憶體裡（Image 物件＋blob URL），不進
  // localStorage、也不經過 store，sheet 關閉或換底圖就釋放。
  let selected = normalizeCardBg(state.settings && state.settings.cardBg);
  let photoImg = null;
  let customObjectUrl = null;
  let dataUrl = '';
  let blob = null;
  let file = null;

  // 按鈕層級重整（SPEC M4.4 §2）：全寬主鈕最多一顆。裝置支援分享 API 時，
  // 「分享」是唯一全寬主鈕，「下載 PNG」降級成次要鈕跟「關閉」一列兩顆半寬；
  // 不支援分享 API（多半是桌面瀏覽器）時，「分享」整顆隱藏，「下載 PNG」升級
  // 成唯一全寬主鈕，「關閉」單獨半寬置中留在原本那一列。
  // 底圖選擇列（SPEC M5 §3）取代了原本「用自己的照片當背景」／「移除照片」
  // 兩顆按鈕：一列水平捲動 tile（紙感／bg1~5／自訂照片），tile 本身不是
  // .btn，不走上面這套主次鈕層級規則，選中態改用 accent ring 標示。
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop share-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet share-sheet">
      <h3 class="sheet__title">${title}</h3>
      <div class="share-sheet__preview">
        <img alt="成績分享卡預覽" />
      </div>
      <div class="share-sheet__bgrow" data-row="bg">
        <button type="button" class="share-sheet__bgtile" data-bg="paper" aria-label="紙感底圖">
          <span class="share-sheet__bgtile-swatch"></span>
          <span class="share-sheet__bgtile-label">紙感</span>
        </button>
        <button type="button" class="share-sheet__bgtile" data-bg="bg1" aria-label="底圖 1">
          <img src="assets/cardbg/bg1.jpg" alt="" />
        </button>
        <button type="button" class="share-sheet__bgtile" data-bg="bg2" aria-label="底圖 2">
          <img src="assets/cardbg/bg2.jpg" alt="" />
        </button>
        <button type="button" class="share-sheet__bgtile" data-bg="bg3" aria-label="底圖 3">
          <img src="assets/cardbg/bg3.jpg" alt="" />
        </button>
        <button type="button" class="share-sheet__bgtile" data-bg="bg4" aria-label="底圖 4">
          <img src="assets/cardbg/bg4.jpg" alt="" />
        </button>
        <button type="button" class="share-sheet__bgtile" data-bg="bg5" aria-label="底圖 5">
          <img src="assets/cardbg/bg5.jpg" alt="" />
        </button>
        <label class="share-sheet__bgtile share-sheet__bgtile--custom" data-bg="custom" aria-label="自己的照片">
          <span class="share-sheet__bgtile-plus">＋</span>
          <span class="share-sheet__bgtile-label">自己的照片</span>
          <img class="share-sheet__bgtile-custom-img" alt="" hidden />
          <input type="file" accept="image/*" class="visually-hidden" data-action="pick-photo" />
        </label>
      </div>
      <div class="share-sheet__row share-sheet__primary-row" data-row="primary">
        <button class="btn btn--primary share-sheet__full" data-action="share-card" hidden>分享</button>
      </div>
      <div class="share-sheet__row share-sheet__secondary-row" data-row="secondary">
        <button class="btn btn--secondary share-sheet__half" data-action="download-card">下載 PNG</button>
        <button class="btn btn--ghost share-sheet__half" data-action="close-share">關閉</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const previewImg = backdrop.querySelector('.share-sheet__preview img');
  const bgRow = backdrop.querySelector('[data-row="bg"]');
  const bgTiles = Array.from(bgRow.querySelectorAll('.share-sheet__bgtile'));
  const photoInput = backdrop.querySelector('[data-action="pick-photo"]');
  const customImg = backdrop.querySelector('.share-sheet__bgtile-custom-img');
  const customPlus = backdrop.querySelector('.share-sheet__bgtile-plus');
  const customLabel = backdrop.querySelector('.share-sheet__bgtile--custom .share-sheet__bgtile-label');
  const shareBtn = backdrop.querySelector('[data-action="share-card"]');
  const downloadBtn = backdrop.querySelector('[data-action="download-card"]');
  const closeBtn = backdrop.querySelector('[data-action="close-share"]');
  const primaryRow = backdrop.querySelector('[data-row="primary"]');
  const secondaryRow = backdrop.querySelector('[data-row="secondary"]');

  /** 選擇列的 accent ring 選中態同步（純視覺，不觸發重繪）。 */
  function updateBgSelection() {
    bgTiles.forEach((tile) => {
      tile.classList.toggle('share-sheet__bgtile--active', tile.dataset.bg === selected);
    });
  }

  /** 找出某個內建底圖 tile 裡的 <img> 元素（縮圖跟畫布來源共用同一個節點）。 */
  function bundledImgEl(name) {
    const tile = bgRow.querySelector(`.share-sheet__bgtile[data-bg="${name}"]`);
    return tile ? tile.querySelector('img') : null;
  }

  /**
   * 套用內建底圖 name：圖片若已經載完（sheet 開啟時 <img src> 早就在背景載入，
   * 常見情況一開就緒）就直接重繪；還沒載完就掛 onload 等它載完再重繪——此時
   * 畫面刻意維持前一個底圖，不強制先退回紙感，避免每次切換 tile 都閃白。
   * onerror（極端：離線又沒快取）→ 靜默退回紙感，選擇列同步退回紙感 tile。
   */
  function applyBundledBg(name) {
    const img = bundledImgEl(name);
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      photoImg = img;
      render();
      return;
    }
    img.onload = () => {
      if (selected !== name) return; // 使用者已經切到別的 tile，這張慢到的圖不該蓋回去
      photoImg = img;
      render();
    };
    img.onerror = () => {
      if (selected !== name) return;
      photoImg = null;
      selected = 'paper';
      updateBgSelection();
      render();
    };
  }

  /** 釋放目前自訂照片的 blob URL（換照片或關閉 sheet 時呼叫）。 */
  function revokeCustomUrl() {
    if (customObjectUrl) {
      URL.revokeObjectURL(customObjectUrl);
      customObjectUrl = null;
    }
  }

  /** 選了別的 tile：等同「移除自訂照片」，tile 退回「＋」佔位，不落地本來就沒東西可清。 */
  function resetCustomTile() {
    revokeCustomUrl();
    photoInput.value = '';
    customImg.hidden = true;
    customImg.removeAttribute('src');
    customPlus.hidden = false;
    if (customLabel) customLabel.hidden = false;
  }

  /**
   * 分享／下載鈕的主次互換：有分享 API 就分享當全寬主鈕、下載退回次要鈕跟
   * 關閉並排；沒有就把下載鈕整個搬進主鈕列頂替（DOM 節點搬移，事件監聽器
   * 本來就綁在同一個元素上，不必重新綁定），關閉鈕留在次要列變成單顆半寬。
   */
  function syncActionRows(canShare) {
    shareBtn.hidden = !canShare;
    if (canShare) {
      downloadBtn.classList.remove('btn--primary', 'share-sheet__full');
      downloadBtn.classList.add('btn--secondary', 'share-sheet__half');
      secondaryRow.insertBefore(downloadBtn, closeBtn);
      secondaryRow.classList.remove('share-sheet__row--single');
    } else {
      downloadBtn.classList.remove('btn--secondary', 'share-sheet__half');
      downloadBtn.classList.add('btn--primary', 'share-sheet__full');
      primaryRow.appendChild(downloadBtn);
      secondaryRow.classList.add('share-sheet__row--single');
    }
  }

  /** 畫完卡片後，重建 dataUrl/blob/File 並同步預覽圖與分享／下載鈕的主次層級。 */
  function refreshOutputs() {
    dataUrl = canvas.toDataURL('image/png');
    blob = dataURLToBlob(dataUrl);
    previewImg.src = dataUrl;
    try {
      file = new File([blob], filename, { type: 'image/png' });
    } catch (err) {
      file = null; // 極少數不支援 File 建構子的環境，僅隱藏分享鈕即可
    }
    const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    syncActionRows(canShare);
  }

  function render() {
    draw(canvas, { photoImg });
    refreshOutputs();
  }

  // 開 sheet 即依 settings.cardBg 決定初始底圖：先同步畫一次——selected 是
  // 'paper' 時這就是最終結果；是 bgN 時 photoImg 還是 null，畫面先呈現紙感版，
  // 避免等內建圖片載入的白畫面（SPEC M5 §3.2 載入時序）。5 張縮圖的 <img src>
  // 在上面 innerHTML 賦值當下就已經開始背景載入（等同 sheet 一開就 preload）。
  updateBgSelection();
  render();
  if (selected !== 'paper') applyBundledBg(selected);

  bgTiles.forEach((tile) => {
    if (tile.dataset.bg === 'custom') return; // 自訂 tile 靠下面 file input 的 change 事件切換
    tile.addEventListener('click', () => {
      if (selected === 'custom') resetCustomTile();
      selected = tile.dataset.bg;
      updateBgSelection();
      if (selected === 'paper') {
        photoImg = null;
        render();
      } else {
        applyBundledBg(selected);
      }
      setCardBg(state, selected); // 持久化；這條路徑只會是 'paper'/'bgN'，自訂照片不會走到這裡
    });
  });

  photoInput.addEventListener('change', () => {
    const f = photoInput.files && photoInput.files[0];
    if (!f) return;
    const objectUrl = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // 圖片已解碼完成，這時才安全換掉上一張自訂照片的 blob URL；
      // customImg.src 也指向同一個 objectUrl，縮圖跟畫布來源共用同一張圖。
      revokeCustomUrl();
      customObjectUrl = objectUrl;
      photoImg = img;
      customImg.src = objectUrl;
      customImg.hidden = false;
      customPlus.hidden = true;
      if (customLabel) customLabel.hidden = true;
      selected = 'custom';
      updateBgSelection();
      render();
      // 自訂照片刻意不呼叫 setCardBg：只活在這個 sheet 的記憶體裡，不落地。
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  });

  // shareBtn / downloadBtn 只綁一次：閉包讀的是外層 file / blob 變數，
  // 每次 render() 重新賦值後，這裡拿到的永遠是最新版，不必重新綁定事件。
  shareBtn.addEventListener('click', async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'Shot Ledger' });
    } catch (err) {
      // 使用者取消分享是正常操作，不特別處理
    }
  });

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
    revokeCustomUrl(); // sheet 關閉，自訂照片的 blob URL 沒理由留著
    backdrop.remove();
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
}

/**
 * 開啟成績分享卡的全螢幕 sheet：畫卡片預覽＋提供分享／下載／關閉，
 * 另外可從底圖選擇列切換內建 5 張照片、紙感、或自己的照片。
 * @param {Object} session
 * @param {Object} state 完整 store 狀態（呼叫端傳進來的就是完整 store 狀態，
 *   這裡直接讀 state.settings.cardBg、直接呼叫 setCardBg(state, ...) 持久化）
 */
export function openShareSheet(session, state) {
  const data = buildCardData(session, state);
  const filename = `shotledger-card-${formatFilenameDate(session.startedAt)}.png`;
  openCardSheet({
    state,
    title: '分享成績卡',
    filename,
    draw: (canvas, opts) => drawCard(canvas, data, opts),
  });
}

/**
 * 開啟生涯成績分享卡的全螢幕 sheet（SPEC_M10 §2.2）：資料換成
 * buildLifetimeCardData()、畫圖換成 drawLifetimeCard()，底圖選擇列／分享／
 * 下載／關閉跟單場卡完全共用同一顆 openCardSheet。
 * @param {Object} state 完整 store 狀態
 * @param {Date} [now]
 */
export function openLifetimeShareSheet(state, now = new Date()) {
  const data = buildLifetimeCardData(state, now);
  const filename = `shotledger-career-${formatFilenameDate(now)}.png`;
  openCardSheet({
    state,
    title: '分享生涯成績卡',
    filename,
    draw: (canvas, opts) => drawLifetimeCard(canvas, data, opts),
  });
}
