# SPEC M2.2 — 去 AI 味風格調整：圓形 CTA＋編輯感語言（2026-07-13）

背景：使用者回饋「長型滿版按鈕都是 AI 設計的風格」，要求整體調整成
「看起來不像 AI 設計」。Fable 定調設計方向為 **球場記分牌 × 運動雜誌**：
不對稱編排、簽名式圓形按鈕、印刷感 hairline 邊線、雜誌欄目記號。
本 spec 是視覺層調整，不改任何功能、流程、文案與資料。

## 0. 硬性規則

1. 只改 `css/app.css`、`css/tokens.css`（僅調 token 值）、`js/session.js`
   （hero 卡 markup 結構）。不碰邏輯、事件掛法（data-open-variant 等
   attribute 全部保留）、文案、其他 js。
2. 觸控目標 ≥ 48px；375/390px 無溢出無孤字換行（既有鐵律）。
3. `node tools/test_stats.mjs` 全過；console 零錯誤。

## 1. 簽名元素：圓形「開始挑戰」按鈕（hero 卡）

- 移除現在滿版的 `.hero-card__cta`。hero 卡底部改為一列 flex
  （`justify-content: space-between; align-items: center`）：
  - **左**：現有「個人最佳（完整版）：…」區塊（`.hero-card__best`）。
  - **右**：**圓形按鈕** `.hero-card__cta-circle`：
    - Ø 104px（width/height 104px、border-radius 50%）、bg `--color-accent`、
      文字兩行「開始」「挑戰」（`<span>開始</span><span>挑戰</span>` 直排斷行），
      `--text-md` 17px、weight 700、色 `--color-accent-contrast`、
      letter-spacing 0.08em、line-height 1.35。
    - **外圈細環**（球場中圈語彙）：`::after` 絕對定位 inset -7px、
      border 1.5px solid `--color-accent`、opacity .3、border-radius 50%。
    - 按壓態：`:active { transform: scale(.96); background: var(--color-accent-dark); }`。
    - 保留原 `data-open-variant="${menu.id}"` 與既有點擊行為，
      加 `aria-label="開始挑戰"`。
- 差距進度條區（gapHtml）維持在這一列**之上**、滿版不動。
- 375px 驗收：左側「個人最佳」文字與圓鈕同列不擠不換行
  （文字最長情況「尚無完整版紀錄」約 8 字，OK；若擠則左側文字允許兩行，
  但資訊單元不拆）。

## 2. 雜誌刊號感：超大關卡數字浮水印（hero 卡）

- hero 卡右上角加 `.hero-card__bignum`：內容為兩位數關卡序號
  （`01`–`06`，`String(tier).padStart(2,'0')`）。
- 樣式：absolute、top 4px、right 16px、font-size 84px、font-weight 800、
  line-height 1、`font-variant-numeric: tabular-nums`、
  color `--color-accent-tint`（淡橘、當浮水印）、`user-select: none`、
  `aria-hidden="true"`。
- 層級：`.hero-card__bignum { z-index: 0 }`；
  `.hero-card > :not(.hero-card__bignum) { position: relative; z-index: 1 }`，
  確保內容永遠壓在數字上。
- 「第 X 關 / 6」小字照舊保留（浮水印是氛圍不是資訊）。

## 3. 雜誌欄目記號：section title 眉標

- `.section-title::before`：8×8px 方塊、bg `--color-accent`、
  border-radius 1px、display inline-block、margin-right 8px、
  transform translateY(-1px)。
- 適用所有 `.section-title`（挑戰階梯、統計四區塊、非挑戰模式等），
  一處 CSS 全域生效；`page-header h1` 不加（大標不需要）。

## 4. 印刷感：卡片改 hairline 邊線、收圓角

- `--radius-lg` 值 20px → **16px**（tokens.css，一處改全域生效）。
- **卡片類**（`.hero-card`、`.secondary-card`、`.settings-card`、
  `.stats-block`、`.goal-card`、`.about-card`、`.history-list`（或列容器）、
  週目標卡等所有「平面內容卡」）：`box-shadow: none`，
  改 `border: 1px solid var(--color-border)`（已有 border 的保留原色）。
- **浮層類**（`.sheet`、分享 sheet、toast、變體選擇 sheet）**保留陰影**
  ——浮起來的東西需要深度。
- `.btn--primary` 的 shadow-sm 移除（扁平）。

## 5. 印刷字距

- `.page-header h1` 與 `.section-title`：`letter-spacing: 0.03em`。

## 6. 驗收清單（Fable 逐頁巡）

1. 首頁 hero：圓鈕 104px、外圈環、與個人最佳同列；浮水印數字在文字下層；
   375/390px 不溢出。
2. 點圓鈕 → 變體 sheet 正常開啟（行為完全不變）。
3. 全 App 掃：卡片無陰影、1px 邊線、16px 圓角一致；sheet／toast 仍有陰影。
4. 所有 section title 有橘色眉標方塊、不換行。
5. `node tools/test_stats.mjs` 全過；console 零錯誤。
