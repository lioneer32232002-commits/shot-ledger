// js/court.js
// 定點表 SPOTS ＋ 半場 SVG 渲染（可選點模式 / 熱區顯示模式）。
// 座標系統：FIBA 半場，viewBox 0 0 750 560，1m = 50px，籃框中心 B=(375, 79)，底線 y=0。

export const SPOTS = [
  { id: "paint", label: "禁區近筐", type: "2pt", cx: 375, cy: 145 },
  { id: "mid_lc", label: "左底角中距", type: "2pt", cx: 150, cy: 100 },
  { id: "mid_lw", label: "左45°中距", type: "2pt", cx: 215, cy: 235 },
  { id: "mid_top", label: "罰球線頂中距", type: "2pt", cx: 375, cy: 300 },
  { id: "mid_rw", label: "右45°中距", type: "2pt", cx: 535, cy: 235 },
  { id: "mid_rc", label: "右底角中距", type: "2pt", cx: 600, cy: 100 },
  { id: "ft", label: "罰球", type: "ft", cx: 375, cy: 310 },
  { id: "3pt_lc", label: "左底角三分", type: "3pt", cx: 60, cy: 110 },
  { id: "3pt_lw", label: "左45°三分", type: "3pt", cx: 136, cy: 317 },
  { id: "3pt_top", label: "弧頂三分", type: "3pt", cx: 375, cy: 416 },
  { id: "3pt_rw", label: "右45°三分", type: "3pt", cx: 614, cy: 317 },
  { id: "3pt_rc", label: "右底角三分", type: "3pt", cx: 690, cy: 110 },
  { id: "deep_l", label: "左深三", type: "deep3", cx: 83, cy: 370 },
  { id: "deep_top", label: "弧頂深三", type: "deep3", cx: 375, cy: 491 },
  { id: "deep_r", label: "右深三", type: "deep3", cx: 667, cy: 370 },
];

export function getSpot(id) {
  return SPOTS.find((s) => s.id === id) || null;
}

const TYPE_LABEL = { "2pt": "2分", "3pt": "3分", deep3: "深3", ft: "罰球" };
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
      <path d="M ${SIDE_OFFSET} 0 L ${SIDE_OFFSET} ${arcY} A ${THREE_R} ${THREE_R} 0 0 1 ${rightX} ${arcY} L ${rightX} 0" />
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
    let fillVar = "var(--color-spot-idle)";
    let innerText = "";

    if (mode === "heat") {
      const data = heat[spot.id];
      const p = data && data.att > 0 ? Math.round((data.mk / data.att) * 100) : null;
      fillVar = heatColor(p);
      if (data && data.att > 0) {
        innerText = `<text class="spot-heat-text" x="${spot.cx}" y="${spot.cy + 4}" text-anchor="middle">${data.mk}/${data.att}</text>`;
      }
    }

    const r = mode === "heat" ? 24 : isSelected ? 18 : 14;
    const classes = ["court-spot", `court-spot--${mode}`];
    if (isSelected) classes.push("is-selected");
    if (locked) classes.push("is-locked");

    return `
      <g class="${classes.join(" ")}" data-spot="${spot.id}" tabindex="${mode === "pick" && !locked ? 0 : -1}" role="${mode === "pick" && !locked ? "button" : "img"}" aria-label="${spot.label}">
        <circle class="spot-hit" cx="${spot.cx}" cy="${spot.cy}" r="22" fill="transparent" />
        <circle class="spot-dot" cx="${spot.cx}" cy="${spot.cy}" r="${r}" style="fill:${fillVar}" />
        ${innerText}
        <text class="spot-label" x="${spot.cx}" y="${spot.cy - r - 8}" text-anchor="middle">${spot.label}</text>
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
}
