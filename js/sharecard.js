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
// 分享卡是紙感設計，固定亮色輸出，不隨 App 深色模式變色（M3 SPEC §0.4）。
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

  // 出手點位：僅畫該節有出手的點，顏色同熱區三級；點內畫命中率%（canvas 版空間較小，只畫 %）。
  // r 20→26；字 18→24（乘 scale ≈1.2 後實際約 29px），呼應 court.js 熱區點貫穿字（SPEC
  // M4.3 §2）：允許超出點的圓邊，加同款深色描邊（strokeText 疊在 fillText 下面）避免
  // 突出的部分壓在球場線上看不清。
  heatSpots.forEach((s) => {
    ctx.beginPath();
    ctx.fillStyle = heatTierColor(s.pct);
    ctx.arc(tx(s.cx), ty(s.cy), 26 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (s.pct !== null) {
      const pctText = `${s.pct}%`;
      ctx.font = `800 ${24 * scale}px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.strokeText(pctText, tx(s.cx), ty(s.cy));
      ctx.fillStyle = '#fff';
      ctx.fillText(pctText, tx(s.cx), ty(s.cy));
    }
  });

  // 還原預設對齊方式，避免影響 drawCard 後續段落的文字繪製
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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
        courtLine: COLORS.courtLine,
        badgeBg: COLORS.sand,
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
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

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
  //   主數字＋投中行            ~150～160px          40px  ← 見下方特別說明
  //   球種列（1～2 列）         每列 ~46px           40px
  //   迷你球場                 78～83% 卡寬換算       40px
  //   狀態徽章（可選 0～2 枚）   56px                 34px
  //   網址                    固定貼底 CARD_H-56（前面留夠淨空即可，不參與游標）
  //
  //   「主數字＋投中行」的 40px gap 疊加球種列首行的 ascent，實測後投中 baseline
  //   到球種列首行 baseline 差 ≥56px（本輪驗收要求，見自驗記錄）。
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

  // 3. 主數字：總命中率超大字＋投中比數（同一 baseline）。
  // 照片模式加柔和深色投影，橘字壓在亮部照片上也讀得清；畫完立刻重置 shadow 免得污染後續繪製。
  const pctLabel = data.totalPct === null ? '—' : `${data.totalPct}%`;
  const pctFont = `800 150px ${FONT_FAMILY}`;
  const detailLabel = `${data.totalMk}/${data.totalAtt} 投中`;

  const pctMetrics = measureAscDesc(ctx, pctLabel, pctFont);
  const pctWidth = ctx.measureText(pctLabel).width;
  const detailX = marginX + pctWidth + 28;
  const detailSize = fitFontSize(ctx, detailLabel, CARD_W - marginX - detailX, 34, 700);
  const detailFont = `700 ${detailSize}px ${FONT_FAMILY}`;
  const detailMetrics = measureAscDesc(ctx, detailLabel, detailFont);

  const bigNumBaselineY = y + Math.max(pctMetrics.asc, detailMetrics.asc);

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
  ctx.fillStyle = palette.muted;
  ctx.font = detailFont;
  ctx.fillText(detailLabel, detailX, bigNumBaselineY);

  y = bigNumBaselineY + Math.max(pctMetrics.desc, detailMetrics.desc) + 40;

  // 4. 球種列：兩欄固定寬錨點，不撐滿欄寬（SPEC M4.3 §3b）。label 靠左（欄 x）、
  // count 右對齊在欄 x+230、pct 右對齊在欄 x+360，兩欄位間至少留 24px；
  // 兩欄 grid 欄距固定 60px，整組靠左（marginX 起），右側自然留白。
  const typeColGap = 60;
  const typeColAnchorCount = 230; // count 右緣＝欄x+230
  const typeColAnchorPct = 360; // pct 右緣＝欄x+360（與最寬 count「50/90」實測仍留 ≥24px）
  const typeRowFont32 = `700 32px ${FONT_FAMILY}`;
  const typeRowRef = measureAscDesc(ctx, '深 3', typeRowFont32); // 代表性 CJK 字高，決定列距
  // +20（非 14）：不同字元的實際 ascent/descent 跟參考字「深 3」略有出入，
  // 實測兩列間純背景帶一度只有 13px，加大緩衝確保 ≥16px（驗收必檢 #1）。
  const typeRowPitch = Math.ceil(typeRowRef.asc + typeRowRef.desc) + 20;
  const typeFirstBaseline = y + typeRowRef.asc;

  data.typeRows.forEach((row, i) => {
    const col = i % 2;
    const rowIdx = Math.floor(i / 2);
    const colX = marginX + col * (typeColAnchorPct + typeColGap);
    const rowBaseline = typeFirstBaseline + rowIdx * typeRowPitch;
    const countLabel = `${row.mk}/${row.att}`;
    const pctLabelTxt = row.pct === null ? '—' : `${row.pct}%`;

    // label／count 各自對自己的可用寬度縮字級，避免極端資料撐出欄位。
    const labelMaxW = typeColAnchorCount - 24;
    const countMaxW = typeColAnchorPct - 24 - typeColAnchorCount;
    const size = Math.min(
      fitFontSize(ctx, row.label, labelMaxW, 32, 700),
      fitFontSize(ctx, countLabel, countMaxW, 32, 700)
    );
    ctx.font = `700 ${size}px ${FONT_FAMILY}`;
    ctx.fillStyle = palette.text;

    ctx.textAlign = 'left';
    ctx.fillText(row.label, colX, rowBaseline);

    ctx.textAlign = 'right';
    ctx.fillText(countLabel, colX + typeColAnchorCount, rowBaseline);
    ctx.fillText(pctLabelTxt, colX + typeColAnchorPct, rowBaseline);
  });
  ctx.textAlign = 'left';

  const typeRowCount = Math.max(1, Math.ceil(data.typeRows.length / 2));
  const typeBlockBottom = data.typeRows.length
    ? typeFirstBaseline + (typeRowCount - 1) * typeRowPitch + typeRowRef.desc
    : y;
  y = typeBlockBottom + 40;

  // 5. 迷你半場熱區圖：預設 83% 卡寬，若下方（徽章／網址）空間不夠就縮到 78–80%——
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

  // 6. 狀態列（有才顯示，最多兩枚扁平徽章）
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

  // 7. 底部：網址（小字置中，固定貼底；上面各段落已依游標預留足夠淨空，不會相撞）
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.muted;
  ctx.font = `600 24px ${FONT_FAMILY}`;
  ctx.fillText('shot-ledger.pages.dev', CARD_W / 2, urlBaselineY);
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
 * 開啟成績分享卡的全螢幕 sheet：畫卡片預覽＋提供分享／下載／關閉，
 * 另外可選「用自己的照片當背景」重繪成照片版。
 * @param {Object} session
 * @param {Object} state 完整 store 狀態
 */
export function openShareSheet(session, state) {
  const data = buildCardData(session, state);
  const canvas = document.createElement('canvas');
  const filename = `shotledger-card-${formatFilenameDate(session.startedAt)}.png`;

  // 使用者自訂照片：只存在這個閉包的記憶體裡（Image 物件），不進 localStorage、
  // 也不經過 store，sheet 關閉就釋放。dataUrl/blob/file 每次重繪都整組重建，
  // 分享／下載一律拿最新版。
  let photoImg = null;
  let dataUrl = '';
  let blob = null;
  let file = null;

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop share-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet share-sheet">
      <h3 class="sheet__title">分享成績卡</h3>
      <div class="share-sheet__preview">
        <img alt="成績分享卡預覽" />
      </div>
      <div class="share-sheet__photo-actions">
        <label class="btn btn--secondary share-sheet__photo-btn">
          用自己的照片當背景
          <input type="file" accept="image/*" class="visually-hidden" data-action="pick-photo" />
        </label>
        <button class="btn btn--ghost" data-action="remove-photo" hidden>移除照片</button>
      </div>
      <div class="share-sheet__actions">
        <button class="btn btn--primary" data-action="share-card" hidden>分享</button>
        <button class="btn btn--secondary" data-action="download-card">下載 PNG</button>
        <button class="btn btn--ghost" data-action="close-share">關閉</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const previewImg = backdrop.querySelector('.share-sheet__preview img');
  const photoInput = backdrop.querySelector('[data-action="pick-photo"]');
  const removePhotoBtn = backdrop.querySelector('[data-action="remove-photo"]');
  const shareBtn = backdrop.querySelector('[data-action="share-card"]');
  const downloadBtn = backdrop.querySelector('[data-action="download-card"]');
  const closeBtn = backdrop.querySelector('[data-action="close-share"]');

  /** 畫完卡片後，重建 dataUrl/blob/File 並同步預覽圖與分享鈕可見性。 */
  function refreshOutputs() {
    dataUrl = canvas.toDataURL('image/png');
    blob = dataURLToBlob(dataUrl);
    previewImg.src = dataUrl;
    try {
      file = new File([blob], filename, { type: 'image/png' });
    } catch (err) {
      file = null; // 極少數不支援 File 建構子的環境，僅隱藏分享鈕即可
    }
    shareBtn.hidden = !(file && navigator.canShare && navigator.canShare({ files: [file] }));
  }

  function render() {
    drawCard(canvas, data, { photoImg });
    refreshOutputs();
  }

  render();

  photoInput.addEventListener('change', () => {
    const f = photoInput.files && photoInput.files[0];
    if (!f) return;
    const objectUrl = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      photoImg = img;
      removePhotoBtn.hidden = false;
      render();
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  });

  removePhotoBtn.addEventListener('click', () => {
    photoImg = null;
    removePhotoBtn.hidden = true;
    photoInput.value = '';
    render();
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
    backdrop.remove();
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
}
