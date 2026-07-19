// js/court.js
// 定點表 SPOTS ＋ 半場 SVG 渲染（可選點模式 / 熱區顯示模式）。
// 座標系統：FIBA 半場，viewBox 0 0 750 560，1m = 50px，籃框中心 B=(375, 79)，底線 y=0。

// ft／mid_top 兩點原本 cy 只差 10px（310 / 300），r=24 的熱區點 96% 疊在一起，
// 誤以為是重複點的 bug（SPEC M4.1 §0、§1）。現改為兩個有物理依據的定點：
// - ft：cy=290，正好壓在罰球線上（罰球線距籃框中心 4.225m ≈ 211px，79+211=290）。
// - mid_top：cy=350，罰球線後一步的頂端中距（約 5.4m），與罰球點在圖上明確分開。
// 兩點中心距 60px，足以讓 §2 的 r=30 熱區點不相碰。
export const SPOTS = [
  // 上籃點：籃框兩側、比 paint（距框 66px）更貼框——cx 偏移 60px、cy 100，
  // 距框中心約 64px（≈1.3m），左右對稱，都在禁區內。獨立球種 'layup'，
  // 不併入 2 分聚合（aggregate byType 天然分開）。
  { id: "layup_l", label: "左側上籃", type: "layup", cx: 315, cy: 100 },
  { id: "layup_r", label: "右側上籃", type: "layup", cx: 435, cy: 100 },
  { id: "paint", label: "禁區近筐", type: "2pt", cx: 375, cy: 145 },
  { id: "mid_lc", label: "左底角中距", type: "2pt", cx: 150, cy: 100 },
  { id: "mid_lw", label: "左 45° 中距", type: "2pt", cx: 215, cy: 235 },
  { id: "mid_top", label: "罰球線頂中距", type: "2pt", cx: 375, cy: 350 },
  { id: "mid_rw", label: "右 45° 中距", type: "2pt", cx: 535, cy: 235 },
  { id: "mid_rc", label: "右底角中距", type: "2pt", cx: 600, cy: 100 },
  { id: "ft", label: "罰球", type: "ft", cx: 375, cy: 290 },
  { id: "3pt_lc", label: "左底角三分", type: "3pt", cx: 45, cy: 110 },
  { id: "3pt_lw", label: "左 45° 三分", type: "3pt", cx: 136, cy: 317 },
  { id: "3pt_top", label: "弧頂三分", type: "3pt", cx: 375, cy: 416 },
  { id: "3pt_rw", label: "右 45° 三分", type: "3pt", cx: 614, cy: 317 },
  { id: "3pt_rc", label: "右底角三分", type: "3pt", cx: 705, cy: 110 },
  { id: "deep_l", label: "左深三", type: "deep3", cx: 83, cy: 370 },
  { id: "deep_top", label: "弧頂深三", type: "deep3", cx: 375, cy: 491 },
  { id: "deep_r", label: "右深三", type: "deep3", cx: 667, cy: 370 },
];

export function getSpot(id) {
  return SPOTS.find((s) => s.id === id) || null;
}

const TYPE_LABEL = { "2pt": "2 分", "3pt": "3 分", deep3: "深 3", ft: "罰球", layup: "上籃" };
export function typeLabel(type) {
  return TYPE_LABEL[type] || type;
}

const VB_W = 750;
const VB_H = 560;
const HOOP = { x: 375, y: 79 };
const RIM_R = 0.23 * 50; // 11.5
const FT_R = 1.8 * 50; // 90
const THREE_R = 6.75 * 50; // 337.5
const SIDE_OFFSET = 0.9 * 50; // 45
const PAINT_W = 4.9 * 50; // 245
const PAINT_H = 5.8 * 50; // 290

function courtMarkup() {
  const paintX = HOOP.x - PAINT_W / 2;
  const dxSide = HOOP.x - SIDE_OFFSET;
  const arcY = HOOP.y + Math.sqrt(THREE_R * THREE_R - dxSide * dxSide);
  const rightX = VB_W - SIDE_OFFSET;

  return `
    <g class="court-lines" fill="none" stroke="var(--color-court-line)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <!-- 底線 -->
      <line x1="0" y1="0" x2="${VB_W}" y2="0" />
      <!-- 邊線 -->
      <line x1="0" y1="0" x2="0" y2="${VB_H}" />
      <line x1="${VB_W}" y1="0" x2="${VB_W}" y2="${VB_H}" />
      <!-- 禁區 -->
      <rect x="${paintX}" y="0" width="${PAINT_W}" height="${PAINT_H}" rx="2" />
      <!-- 罰球圈 -->
      <circle cx="${HOOP.x}" cy="${PAINT_H}" r="${FT_R}" stroke-dasharray="8 7" />
      <!-- 三分線 -->
      <path d="M ${SIDE_OFFSET} 0 L ${SIDE_OFFSET} ${arcY} A ${THREE_R} ${THREE_R} 0 0 0 ${rightX} ${arcY} L ${rightX} 0" />
      <!-- 籃板 -->
      <line x1="${HOOP.x - 45}" y1="${HOOP.y - 8}" x2="${HOOP.x + 45}" y2="${HOOP.y - 8}" stroke-width="4" />
      <!-- 籃框 -->
      <circle cx="${HOOP.x}" cy="${HOOP.y}" r="${RIM_R}" stroke="var(--color-accent)" stroke-width="3" />
    </g>
  `;
}

function heatColor(p) {
  if (p === null || p === undefined) return "var(--color-heat-none)";
  if (p < 40) return "var(--color-heat-cold)";
  if (p <= 55) return "var(--color-heat-warm)";
  return "var(--color-heat-hot)";
}

// 填色進度環的幾何常數（SVG 座標）：環半徑／環粗／環底圓半徑（surface 色，
// 蓋住底下球場線）。ft(290)/mid_top(350) 縱距 60，環底圓直徑 76 會小疊 16px，
// 由 SPOTS 順序讓 ft 蓋在 mid_top 上緣，視覺可接受（與分享卡 drawMiniCourt 同步）。
const RING_R = 33;
const RING_SW = 8;
const RING_BG_R = RING_R + RING_SW / 2 + 1; // 38
const RING_CIRC = 2 * Math.PI * RING_R;

/**
 * @param {HTMLElement} container
 * @param {Object} opts
 * @param {"pick"|"heat"} opts.mode
 * @param {string|null} [opts.selected] pick 模式下目前選中的 spot id
 * @param {boolean} [opts.locked] pick 模式下鎖定不可點（菜單模式：只顯示、不可改）
 * @param {Object} [opts.heat] heat 模式資料：{ [spotId]: {att, mk} }
 * @param {(spotId:string)=>void} [opts.onSelect]
 */
export function renderCourt(container, opts) {
  const { mode, selected = null, locked = false, heat = {}, onSelect = null } = opts;

  const spotsMarkup = SPOTS.map((spot) => {
    const isSelected = selected === spot.id;
    // pick 模式的 fill 交給 CSS（.court-spot--pick / .is-selected），
    // 內聯 style 會蓋過樣式表，只有 heat 模式才需要動態指定顏色。
    let fillStyle = "";
    let innerText = "";
    let hasHeatData = false;
    let heatDataAttrs = "";
    let ariaLabel = spot.label;

    if (mode === "heat") {
      const data = heat[spot.id];
      hasHeatData = !!(data && data.att > 0);
      const p = hasHeatData ? Math.round((data.mk / data.att) * 100) : null;
      fillStyle = ` style="fill:${heatColor(p)}"`;
      if (hasHeatData) {
        // 填色進度環（使用者選定設計）：環的長度＝命中率、環內鋪熱度色淡底、
        // 數字（不含 %）用熱度色。取代舊的「白字貫穿實心圓點」——白字超出
        // 圓緣落在淺色背景上會消失，環＋色字則兩套主題都清楚。
        // mk/att 與 % 符號移到點擊後的 .court-info 資訊列（機制不變）。
        const color = heatColor(p);
        const arcLen = (p / 100) * RING_CIRC;
        // p=0 沒有弧可畫：round linecap 會把零長 dash 畫成一顆點，直接省略。
        const arc = p > 0
          ? `<circle class="spot-ring-arc" cx="${spot.cx}" cy="${spot.cy}" r="${RING_R}" style="stroke:${color};stroke-dasharray:${arcLen} ${RING_CIRC}" transform="rotate(-90 ${spot.cx} ${spot.cy})" />`
          : "";
        innerText = `
          <circle class="spot-ring-tint" cx="${spot.cx}" cy="${spot.cy}" r="${RING_R - RING_SW / 2}" style="fill:${color}" />
          <circle class="spot-ring-track" cx="${spot.cx}" cy="${spot.cy}" r="${RING_R}" />
          ${arc}
          <text class="spot-heat-pct${p === 100 ? " spot-heat-pct--tight" : ""}" x="${spot.cx}" y="${spot.cy}" text-anchor="middle" dominant-baseline="central" style="fill:${color}">${p}</text>`;
        // 環底圓的 stroke 也用熱度色：平常 stroke-width 0 看不到，
        // 點擊選中時由 CSS 加寬成同色光圈（取代舊的細白描邊）。
        fillStyle = ` style="fill:var(--color-surface);stroke:${color}"`;
        heatDataAttrs = ` data-mk="${data.mk}" data-att="${data.att}" data-pct="${p}"`;
        ariaLabel = `${spot.label}　${data.mk}/${data.att} 投中・命中率 ${p}%`;
      }
    }

    // 有出手資料的熱區點畫成進度環：r 是環底圓（surface 色），蓋住底下的
    // 球場線讓環乾淨；沒資料的點縮到 8，只當背景參考、降低噪音，也不可點。
    const r = mode === "heat" ? (hasHeatData ? RING_BG_R : 8) : isSelected ? 18 : 14;
    const classes = ["court-spot", `court-spot--${mode}`];
    if (isSelected) classes.push("is-selected");
    if (locked) classes.push("is-locked");
    if (mode === "heat" && hasHeatData) classes.push("is-clickable");

    // 底角三分點落在邊線上（cx 貼齊 45 / 705），標籤置中會超出 viewBox，
    // 左底角改靠左對齊、右底角改靠右對齊，並各自往內縮一點。
    let labelAnchor = "middle";
    let labelX = spot.cx;
    if (spot.id === "3pt_lc") {
      labelAnchor = "start";
      labelX = spot.cx + 4;
    } else if (spot.id === "3pt_rc") {
      labelAnchor = "end";
      labelX = spot.cx - 4;
    }

    const isInteractivePick = mode === "pick" && !locked;
    const isInteractiveHeat = mode === "heat" && hasHeatData;
    const tabIndex = isInteractivePick || isInteractiveHeat ? 0 : -1;
    const role = isInteractivePick || isInteractiveHeat ? "button" : "img";
    // hit circle 只給可點的點（pick 模式的可選點／heat 模式有資料的點），
    // 無資料的縮小點不放大熱區判定範圍，避免誤觸。heat 模式跟著環底圓放大。
    const hitR = isInteractiveHeat ? RING_BG_R : 22;
    const hitCircle = isInteractivePick || isInteractiveHeat
      ? `<circle class="spot-hit" cx="${spot.cx}" cy="${spot.cy}" r="${hitR}" fill="transparent" />`
      : "";

    return `
      <g class="${classes.join(" ")}" data-spot="${spot.id}" tabindex="${tabIndex}" role="${role}" aria-label="${ariaLabel}"${heatDataAttrs}>
        ${hitCircle}
        <circle class="spot-dot" cx="${spot.cx}" cy="${spot.cy}" r="${r}"${fillStyle} />
        ${innerText}
        <text class="spot-label" x="${labelX}" y="${spot.cy - r - 10}" text-anchor="${labelAnchor}">${spot.label}</text>
      </g>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="court-svg" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg" aria-label="半場球場圖">
      ${courtMarkup()}
      <g class="court-spots">${spotsMarkup}</g>
    </svg>
  `;

  if (mode === "pick" && !locked && typeof onSelect === "function") {
    const svg = container.querySelector(".court-svg");
    svg.querySelectorAll(".court-spot").forEach((g) => {
      const id = g.getAttribute("data-spot");
      const fire = () => onSelect(id);
      g.addEventListener("click", fire);
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fire();
        }
      });
    });
  }

  if (mode === "heat") {
    setupHeatInfoPanel(container);
  }
}

/** heat 模式預設提示（尚未點任何點）。 */
function heatInfoPlaceholder() {
  return `<p class="court-info__placeholder">點場上的點看各點詳細</p>`;
}

/** heat 模式點擊某點後的資訊列內容：點名　mk/att ・ pct%（pct 用該點熱區色強調）。 */
function heatInfoDetail(spot, mk, att, p) {
  return `
    <p class="court-info__line">
      <span class="court-info__label">${spot.label}</span>
      <span class="court-info__score">${mk}/${att}</span>
      <span class="court-info__dot">・</span>
      <span class="court-info__pct" style="color:${heatColor(p)}">${p}%</span>
    </p>
  `;
}

/**
 * heat 模式自我管理的點擊資訊列：在 container 內 svg 後面自己加一個 div，
 * 不改 renderCourt 對外介面。點擊／Enter／空白鍵有資料的點會切換選中樣式
 * （細白描邊）並更新資訊列；預設顯示淡色提示文字；資訊列固定 min-height，
 * 切換時版面不跳動。
 * @param {HTMLElement} container
 */
function setupHeatInfoPanel(container) {
  const svg = container.querySelector(".court-svg");
  const infoEl = document.createElement("div");
  infoEl.className = "court-info";
  infoEl.innerHTML = heatInfoPlaceholder();
  container.appendChild(infoEl);

  let selectedG = null;

  svg.querySelectorAll(".court-spot--heat.is-clickable").forEach((g) => {
    const id = g.getAttribute("data-spot");
    const spot = getSpot(id);
    if (!spot) return;
    const mk = Number(g.getAttribute("data-mk"));
    const att = Number(g.getAttribute("data-att"));
    const p = Number(g.getAttribute("data-pct"));

    const activate = () => {
      if (selectedG) selectedG.classList.remove("is-selected");
      g.classList.add("is-selected");
      selectedG = g;
      infoEl.innerHTML = heatInfoDetail(spot, mk, att, p);
    };

    g.addEventListener("click", activate);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}
