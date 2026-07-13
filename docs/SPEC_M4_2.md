# SPEC M4.2 — 按鈕語彙統一（籃球感）＋球場文字放大（2026-07-13 第三輪回饋）

> 分工：Fable 寫 spec → Sonnet 實作 → Fable 驗收。鐵律同 SPEC_M4。
> **依賴 SPEC_M4_1 完成後實作**（同檔案，避免衝突）。不 commit、不 push。

## 設計語彙（本輪核心）

全 App 的按鈕分兩族，統一到「籃球」語彙：

- **選項族**（從幾個裡挑一個）：膠囊 segmented control——外框 radius-full、
  選中格 accent 實色膠囊、未選中無框淡字。基準是 M4 做好的快速/逐球切換。
- **動作族**（按了會發生事情的大鈕）：基準是首頁 SHOT 圓鈕——accent 實色、
  外圈 offset ring（::after inset 負值、1.5px、accent 半透明）、字重 800。

## 1. 選項類殘黨清剿（還是「AI 長條」的選項按鈕）

- **練球自由模式的球種選擇**（`.type-chips` 裡的 2 分/3 分/深 3/罰球）：
  改成膠囊 segmented control（同快速/逐球樣式，四格）。
- **「不指定位置」**（`.spot-controls` 的 chip）：保留膠囊形但精緻化——
  選中時 accent 實色（非現在的淡底），未選中細框淡字。
- **統計分頁「命中率趨勢」的球種選項**（statspage.js 那排 filter，
  實際 class 請讀 js/statspage.js 與 app.css 對照）：同改膠囊 segmented。
  若該排超過 4 格（含「全部」），手機寬度下允許橫向捲動或字級縮一級，
  不可換行跑版。
- 掃一遍其他分頁還有沒有同型的「選項排」（例如趨勢的日/週切換若存在），
  一併統一。歷史/設定分頁的**清單列**不算選項按鈕，不要動。

## 2. SHOT 圓鈕加籃球條紋

`.hero-card__cta-circle` 目前是整顆純橘，要變成一顆籃球：

- 加上經典籃球線：**一橫、一豎、左右兩道側弧**（四條），
  用 inline SVG（絕對定位鋪滿圓鈕、pointer-events:none）或 CSS 背景
  data-URI 實作，線色用深一階的橘（`--color-accent-dark`）或
  rgba 黑 15–20%，寬約 1.5–2px——要看得出是籃球，但不能搶掉「SHOT」字。
- 「SHOT」文字在條紋之上（z 順序），維持現有字級與置中補償。
- 既有外圈 ring（::after）與按壓 scale 不變。
- 深色模式檢查一次（accent 底不變，只確認條紋對比）。

## 3. 動作族大鈕比照 SHOT

對象：`完成本輪`（.seq-done-btn）、`結束並結算`（.completion-panel__finish）、
`結束練習`（active-footer 的 .btn--primary）、`分享成績卡`、結束頁 `完成`、
以及其他全寬 `.btn--primary` / `.btn--secondary`：

- `.btn--primary`（大型動作）：radius 改 **radius-full 膠囊**、字重 800、
  字距 +0.02em、加 SHOT 同款**外圈 offset ring**（::after，inset 約 -5px、
  1.5px accent、opacity 0.3、radius-full）、按壓 scale(0.97)＋accent-dark。
- `.btn--secondary`：同膠囊形與字重，但描邊版（accent 細框＋accent 字），
  不加 ring（層級低一階）。
- `.btn--ghost`／`.btn--ghost-danger`：只跟進膠囊圓角，維持低調。
- 注意：ring 用 ::after 會和部分既有按鈕的偽元素衝突的話改 box-shadow
  雙層實作（0 0 0 5px transparent + 0 0 0 6.5px rgba accent）等效即可。
- sheet 內的按鈕（儲存、關閉等）同步生效（都是 .btn 族）。
- 觸控目標高度不得低於現值；`window.confirm` 原生框不在範圍。

## 4. 球場上的點名文字放大

- `.spot-label`（pick 模式選中點上方的「左底角三分」等）：
  15px → **26px**（SVG 座標，手機實際約 12px），字重維持 700、
  既有 paint-order stroke 白暈加粗到 4–5px 保持可讀。
- 底角兩點的 start/end 錨點偏移照舊，放大後重新確認不出 viewBox
  （必要時偏移量加大）。
- M4.1 新增的 heat 資訊列（.court-info）：點名改 **text-base 粗體**、
  數字同級，整列在手機上一眼可讀。
- 檢查放大後選中標籤不壓到相鄰點（標籤只在選中時顯示，單一時刻最多一個，
  主要確認顶部幾個點的標籤不被 SVG 上緣裁掉——必要時 label 改畫在點下方）。

## 5. 分享卡照片模式的對比修正（[sharecard.js](../js/sharecard.js)）

使用者實測：照片雖有暗化，但**橘字（accent #E8590C）壓在照片上對比不夠**、
「個人最佳」徽章看不清楚。只改照片模式的 palette，紙感模式不動：

- **photo palette 的 accent 改亮橘**（暗底專用，往 #FF8A3D 方向調，
  比深色主題的 accent 再亮半階），主命中率大字、球種列的 accent 用途
  全部跟著 palette 走（現有 palette 物件機制已支援，只改值）。
- 主數字大字（150px %）加**柔和深色投影**（canvas shadowColor
  rgba(0,0,0,0.4~0.5)、shadowBlur 約 12、offset 0）——照片亮部也讀得清，
  畫完立刻重置 shadow 免得污染後續繪製。
- **徽章改實心**：照片模式下「挑戰達成 ✓」「個人最佳」改
  **亮橘實底＋白字（字重 800）**——運動感、直接、不要毛玻璃或
  半透明白那種棚拍感（現在的 rgba 白 0.18 底就是看不清的原因）。
  紙感模式維持 sand 底不動。
- 驗收：亮部多的照片（天空、球場地板）與暗部多的照片各測一張，
  大字、球種列、徽章、網址全部一眼可讀。

## 6. 分享卡球種列三欄對齊（[sharecard.js](../js/sharecard.js)）

使用者實卡回饋：球種列目前是整串字串一次 fillText，「2 分 50/90・56%」與
「罰球 19/30・63%」因球種字寬不同，顆數與命中率全部沒對齊。

- 每列拆**三段分別繪製**，固定錨點：
  - 球種名：cell 左緣，textAlign left；
  - 顆數 `50/90`：固定 x，textAlign **right**；
  - 命中率 `56%`：cell 右緣（或固定 x），textAlign **right**；
  中間的「・」分隔符移除（欄位對齊本身就是分隔）。
- M4.1 已把球種列改 2×2 grid——**每一欄內**各自套用上述三段對齊；
  兩欄的錨點對稱。
- canvas 沒有 font-variant-numeric，靠 textAlign right 對齊即可；
  繪完重置 textAlign 為 left，避免污染後續段落。
- 紙感與照片兩種模式都生效（只是顏色走 palette）。
- 驗收：2 種與 4 種球種的卡各畫一張，顆數欄與 % 欄上下緣像用尺畫過。

## 實作備註

- 檔案範圍：`css/app.css`、`js/court.js`（標籤）、`js/session.js`（僅
  type-chips 的 markup 若需改結構）、`js/statspage.js`（趨勢 filter markup）、
  `js/sharecard.js`（§5）、必要時 `css/tokens.css`。
- 資料層、流程邏輯一律不動。
- `node tools/test_stats.mjs` 照跑＋`node --check` 改過的 js。
- **不要 commit、不要 push**（push 直上正式站），驗收由 Fable 處理。
