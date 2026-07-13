# SPEC M3 — 深色模式＋PWA＋菜單出處進「關於」（2026-07-13）

範圍：PLAN M3 的深色模式、PWA、出處頁三項。**雙語不在本 spec**（工程量大，
獨立 SPEC_M3_5 另行實作）。沿用全部既有慣例與鐵律（stats.js 純函式、
schema migration、排版紀律、中英半形空格、375/390px）。

## 0. 硬性規則

1. localStorage key 不可改名；settings 新增 `theme` 走 **schema v3→v4** migration。
2. 不碰 stats.js 邏輯與測試斷言；`node tools/test_stats.mjs` 全過。
3. PWA 圖示 `assets/icon-192.png`、`assets/icon-512.png` **已生成好，不要重做**
   （favicon v7 同款設計，maskable 安全區已內縮）。
4. 分享卡（sharecard.js canvas）**維持固定亮色**——分享出去的圖卡是紙感設計，
   不隨主題變色，一行註解說明即可。
5. console 零錯誤（含 SW 註冊失敗要 catch 不噴錯）。

## 1. 深色模式

### 1.1 資料與切換邏輯
- `store.js`：`SCHEMA_VERSION = 4`；migration `schema < 4` →
  `settings.theme = 'auto'`（保底段同步補 `'theme' in settings` 檢查）。
  新函式 `setTheme(state, mode)`（只收 `'auto'|'light'|'dark'`，其餘視為 auto）。
- `js/app.js` 新增 `applyTheme()`：
  - 有效主題 = `theme === 'auto'` ? （`matchMedia('(prefers-color-scheme: dark)')`
    命中 → dark，否則 light）: theme。
  - 寫入 `document.documentElement.dataset.theme = 有效主題`；
    同步更新 `<meta name="theme-color">`（light `#FAF9F7`／dark `#16130F`）。
  - `theme === 'auto'` 時監聽 matchMedia `change` 即時跟隨（切到手動時移除或忽略）。
  - App 啟動即呼叫（在首次 render 前，避免閃白）。

### 1.2 深色色盤（tokens.css，`:root[data-theme="dark"]` 區塊）
```css
--color-accent: #F2691D;          /* 暗底上提亮一階 */
--color-accent-dark: #E8590C;
--color-accent-tint: #3A2417;
--color-bg: #16130F;              /* 暖黑，非純黑 */
--color-surface: #201B16;
--color-surface-sunken: #2A241E;
--color-border: #3A322A;
--color-border-strong: #4A4036;
--color-text: #F2EDE5;
--color-text-muted: #B3A793;
--color-text-faint: #857A6A;
--color-success: #4CC38A;  --color-success-tint: #143327;
--color-danger: #E5695B;   --color-danger-tint: #3A1F1B;
--color-court-line: #4A4036;
--color-spot-idle: #5A5142;
--color-heat-none: #3A342C;
--color-heat-cold: #4C8FC9;
--color-heat-warm: #E3A72E;
--color-heat-hot: #F2691D;
--shadow-sm/md/lg: 同構但 rgba(0,0,0,.35/.45/.55);
```
- `--color-night`／`--color-night-line`／`--color-on-night*` **不變**
  （夜幕面板兩種主題都成立）。
- `--color-text-on-accent`、`--color-accent-contrast` 不變。

### 1.3 app.css 硬編碼色掃描
- grep `#[0-9A-Fa-f]` 與 `rgba(` ：凡是元件層硬編碼的顏色（如 hero／
  today-summary 的漸層、celebration、白字白底等），一律改 token 或在
  `[data-theme="dark"]` 下補該元件的 override。目標：深色下沒有任何
  「亮色殘塊」或對比不可讀。
- 熱力格日曆 M2 用的 `color-mix(...accent...)` 混色在深色下重驗，
  necessary 時在 dark 區塊改混 `--color-surface-sunken` 比例。

### 1.4 設定頁「外觀」卡
- 設定頁「資料狀態」卡之上新增「外觀」settings-card：三段 segmented
  （自動／淺色／深色，沿用 `.segmented` 樣式），點擊即
  `setTheme` ＋ `applyTheme()` 即時生效，重新整理後記住。

## 2. PWA

### 2.1 `manifest.webmanifest`（新檔，根目錄）
```json
{
  "name": "Shot Ledger 投籃訓練紀錄",
  "short_name": "Shot Ledger",
  "description": "免安裝、免帳號的個人投籃訓練紀錄",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#1F3A5F",
  "theme_color": "#FAF9F7",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```
- index.html `<head>` 加 `<link rel="manifest" href="manifest.webmanifest" />`
  與 `<link rel="apple-touch-icon" href="assets/icon-192.png" />`。

### 2.2 `sw.js`（新檔，根目錄）
- 策略：**network-first、cache fallback**（小站求新鮮，離線才吃快取，
  避免舊版黏住）。
- install：precache CORE（`./`、`index.html`、兩支 css、全部 js/*.js、
  `manifest.webmanifest`、兩個 icon、favicon 為 data URI 不需列）＋
  `self.skipWaiting()`。
- fetch：只攔同源 GET；網路成功 → 回應並寫入 cache（clone）；
  失敗 → `caches.match`（`./` 與 `index.html` 互為 fallback）。
- activate：刪除非現行 `CACHE_NAME` 的舊 cache＋`clients.claim()`。
  `CACHE_NAME = 'shotledger-v1'`（之後改版遞增）。
- `js/app.js`：`if ('serviceWorker' in navigator)` 於 `load` 事件後
  `navigator.serviceWorker.register('sw.js').catch(...)`（失敗靜默）。
- `_headers` 追加：
  ```
  /sw.js
    Cache-Control: no-cache
  ```

## 3. 「關於」頁補菜單出處

- 設定頁既有「關於射手等級」`<details>` 之後，新增第二個 `<details class="about-card">`
  「掛名菜單依據與出處」：迴圈 `MENUS`（有 `basis` 的），每項顯示
  `menu.name`＋`basis.text`＋`（<a href="${basis.url}" target="_blank"
  rel="noopener">${basis.source}</a>）`。樣式沿用 about-card。

## 4. 其他

- 設定頁 footer 版本改「M3」。
- README：功能清單補「深色模式（自動跟隨系統＋手動切換）」「可安裝 PWA、
  離線可用」。

## 5. 驗收清單（Fable 巡）

1. 深色：設定切「深色」→ 全頁即時變暗且重整記住；系統深色＋「自動」→ 深色；
   matchMedia 切換即時跟隨。六大畫面（首頁、統計、紀錄、詳情、設定、練球、
   變體 sheet）截圖巡檢：無亮色殘塊、對比可讀、球場圖/熱區/熱力格正常。
2. v3 資料經 migration 後 `theme === 'auto'` 且其他資料無損。
3. manifest fetch 200 且 JSON 有效、兩個 icon 200；`theme-color` meta 隨主題切換。
4. SW 註冊成功、CORE 全數進 cache；重整頁面正常（network-first 不影響更新）。
5. 出處清單 6 關齊全、連結與 menus.js 一致、新視窗開啟。
6. `node tools/test_stats.mjs` 全過；console 零錯誤；375/390px 排版鐵律照舊。
