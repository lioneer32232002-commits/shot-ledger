# SPEC M6.3：首頁入口改為「紙本目錄」式

## 為什麼

首頁最後一屏（`#/home` 第四屏，`.home-entries`）目前是三張白色圓角卡片，右側各一個細線箭頭。使用者回饋：**單線條箭頭太有 AI 設計感、也太普通**。

問題不在箭頭畫得好不好，而在整組語彙是「通用 App 卡片列表」——跟前面三屏（滿版照片 ＋ `01/02/03` 序號 ＋ 細橫線）建立起來的紀錄本／編排感完全斷開。

## 要做什麼

把三張卡片改成**一頁目錄**：拿掉卡片框、陰影、圓角、箭頭，改成以細分隔線分隔的目錄列，左邊接續前三屏的 `01/02/03` 序號語彙，右邊放一個字距很開的小英文標籤當版式配重。整塊要讀起來像一本紀錄本的目錄頁，而不是三顆按鈕。

```
開始練球
今天想練什麼？
──────────────────────────────────
01   挑戰階梯                  LADDER
     12 關生涯之路，一關一關解鎖
──────────────────────────────────
02   自由練習                    FREE
     想投哪就投哪，不指定點位
──────────────────────────────────
03   綜合巡迴                    TOUR
     全場繞一圈，各距離都練到
──────────────────────────────────
```

## 檔案與改動

### 1. `js/home.js`

`ENTRIES` 陣列各項加上 `n`（序號字串）與 `tag`（英文標籤）：

| menu | n | title | tag |
|---|---|---|---|
| `null` | `01` | 挑戰階梯 | `LADDER` |
| `free` | `02` | 自由練習 | `FREE` |
| `world` | `03` | 綜合巡迴 | `TOUR` |

`renderEntriesHtml()` 的每張卡改成：

```html
<button class="home-entry" data-menu="...">
  <span class="home-entry__num">01</span>
  <span class="home-entry__text">
    <span class="home-entry__title">挑戰階梯</span>
    <span class="home-entry__sub">12 關生涯之路，一關一關解鎖</span>
  </span>
  <span class="home-entry__tag" aria-hidden="true">LADDER</span>
</button>
```

- 拿掉整段 `<svg class="home-entry__arrow">`。
- `tag` 是純裝飾（螢幕閱讀器唸 title＋sub 就夠了），加 `aria-hidden="true"`。
- `data-menu` 的既有邏輯（空字串 → `null`）不要動，`onClick` 也不用改。
- 檔頭那段「質感的三根支柱」註解不要動；如果要為這次改動留註解，請說明**為什麼是目錄而不是卡片**（跟前三屏的序號語彙接軌），不要逐行解釋 CSS。

### 2. `css/app.css`（`.home-entries` 那一段，約 3461–3563 行）

- **`.home-entries__list`**：拿掉 `gap`；改成 `border-top: 1px solid var(--color-border)`（第一列上方那條線）。
- **`.home-entry`**：拿掉 `background` / `border` / `border-radius` / `box-shadow` / `justify-content`。改成
  `display: grid; grid-template-columns: auto 1fr auto; align-items: start; column-gap: var(--space-4);`
  底線 `border-bottom: 1px solid var(--color-border)`；`padding: var(--space-5) var(--space-2)`；保留 `min-height: 76px`（觸控目標）、`width: 100%`、`text-align: left`、`cursor: pointer`、`position: relative`（給 `::after` 用）。背景透明。
- **`.home-entry__num`**：`var(--text-sm)`、`font-weight: 600`、`letter-spacing: 0.2em`、`font-variant-numeric: tabular-nums`、色 `var(--color-text-faint)`。要跟 `.home-entry__title` 的第一行**視覺對齊**（用 line-height 對，不要用 magic margin）。
- **`.home-entry__tag`**：11px、`font-weight: 600`、`letter-spacing: 0.24em`、色 `var(--color-text-faint)`；letter-spacing 尾字會多出一格空白，用 `margin-right: -0.24em` 補回來（同 `.home-wordmark__sub` 的既有做法）。同樣與 title 第一行對齊。
- **`.home-entry::after`**：一條會「畫出來」的橘線，蓋在該列的 `border-bottom` 上，取代箭頭當作「這一列可以點」的回饋。
  實作：`position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;` 平時 `transform: scaleX(0)` ＋ `transform-origin: left`，hover / focus-visible 時 `scaleX(1)`，`transition: transform var(--transition-med)`。
  （驗收時實測過：動 `width: 0 → 100%` 也能正確運作，但縮放只跑合成層、不會每一幀重排，故採用 scaleX。）
- **hover / focus-visible**：`.home-entry__num`、`.home-entry__tag` 轉 `var(--color-accent)`。
- **`:active`**（手機沒有 hover，一定要有按壓回饋）：整列鋪一層很淡的暖色底。用專案已有的 token；若沒有合適的淡底 token，就用 `color-mix(in srgb, var(--color-accent) 6%, transparent)`，並確認 CSS 檔其他地方已經在用 `color-mix`（有用才用，沒有就退回 `rgba`）。不要再用 `transform: scale()`。
- **`.home-entries__credit`**：維持現狀，只在間距上跟新的目錄列協調即可。
- **`@media (prefers-reduced-motion: reduce)`**：`.home-entry::after { transition: none; }`。
- 刪掉已無用的 `.home-entry__arrow` 與 `.home-entry:hover .home-entry__arrow` 規則。

### 3. `sw.js`

`CACHE_NAME`：`shotledger-v12` → **`shotledger-v13`**。（歷史教訓：版號只准往上加，不要回頭撿沒用過的號碼。）

## 驗收條件

1. `#/home` 捲到最後一屏：三列目錄、四條細線（含最上與最下）、無卡片框、無箭頭。
2. 三列的序號、標題、英文標籤三欄各自對齊——序號與標籤要跟標題的第一行同一條基線，不能一個貼上、一個置中。
3. hover 任一列：橘線由左往右畫滿該列底部，序號與標籤轉橘色。
4. 鍵盤 Tab 走過三列：`focus-visible` 的視覺效果與 hover 一致，且看得出焦點在哪。
5. 點任一列的行為與改版前完全一樣（`markHomeSeen` ＋ `requestOpenMenu`）。
6. 手機寬度（375px）下標題與英文標籤不重疊、不換行；序號欄不被壓縮。
7. `prefers-reduced-motion` 下無任何動畫。

## 不要做

- 不要動前三屏的照片、視差、scrim、序號、字標。
- 不要改 `ENTRIES` 的順序或 `menu` 值。
- 不要在別的頁面沿用這套目錄樣式（這次只做首頁）。
- 不要加新的圖片或字型資產。
