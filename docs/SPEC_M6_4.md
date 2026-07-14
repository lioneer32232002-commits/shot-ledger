# SPEC M6.4：SEO 基礎建設

## 現況與目標

現況 38/100。最大問題：靜態 HTML 的 `<body>` 只有四個分頁標籤，主要內容全靠 JS 注入；沒有 robots.txt、sitemap、結構化資料、canonical；首頁沒有 `h1`。

**天花板要先講清楚**：全站是 hash 路由（`#/train`、`#/stats`…），對搜尋引擎而言永遠只有 `https://shot-ledger.pages.dev/` 這一個 URL。不重寫成真實路徑 ＋ SSR 就拆不掉這個限制。**本次不碰架構**，目標是把「首頁這一個 URL」的可索引品質做滿，預估拉到 ~80。

## 要做什麼

### 1. 新增 `robots.txt`（專案根目錄）

```
User-agent: *
Allow: /

Sitemap: https://shot-ledger.pages.dev/sitemap.xml
```

### 2. 新增 `sitemap.xml`（專案根目錄）

只列首頁一個 URL（hash 路由不是獨立網址，不要硬塞 `#/train` 進去——那對搜尋引擎沒有意義，還會被當成垃圾訊號）。`<lastmod>` 用 `2026-07-14`。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://shot-ledger.pages.dev/</loc>
    <lastmod>2026-07-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

### 3. `index.html` 的 `<head>` 補齊

在既有 meta 之後補上（不要動已存在的 og:image 那段與它的註解）：

- `<link rel="canonical" href="https://shot-ledger.pages.dev/" />`
- `<meta property="og:site_name" content="Shot Ledger" />`
- `<meta property="og:locale" content="zh_TW" />`
- `<meta name="twitter:title" content="Shot Ledger — 投籃訓練紀錄" />`
- `<meta name="twitter:description" content="選一份菜單、投一輪、回來點一下。投完就看得到熱區與命中率。免安裝、免帳號。" />`
- `<meta name="twitter:image" content="https://shot-ledger.pages.dev/assets/og-v2.jpg" />`

### 4. `index.html`：`maximum-scale=1` 移除

viewport 改成：

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

`maximum-scale=1` 會禁止使用者雙指放大，是無障礙缺陷（WCAG 1.4.4）。移除後要確認：投籃紀錄頁的球場圖點位、統計頁的熱區圖，在使用者手動放大時不會破版——只要不是靠禁止縮放在維持版面就沒問題。

### 5. `index.html`：JSON-LD 結構化資料

在 `</head>` 前加一段 `<script type="application/ld+json">`，用 `WebApplication`：

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Shot Ledger",
  "alternateName": "投籃訓練紀錄",
  "url": "https://shot-ledger.pages.dev/",
  "description": "手機優先的投籃訓練紀錄工具：選模式、投一輪記一次、看熱區與命中率。免安裝、免帳號，資料存在裝置本機。",
  "applicationCategory": "SportsApplication",
  "operatingSystem": "Any",
  "browserRequirements": "需支援 JavaScript 的現代瀏覽器",
  "inLanguage": "zh-Hant",
  "isAccessibleForFree": true,
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "TWD" },
  "featureList": [
    "12 關生涯挑戰階梯",
    "自由練習與綜合巡迴模式",
    "球場熱區命中率圖",
    "離線可用（PWA）"
  ]
}
```

用 `<script type="application/ld+json">` 包起來寫進 HTML，不要用 JS 動態注入（爬蟲要在初始 HTML 裡就看到）。

### 6. `index.html`：`<noscript>` 靜態摘要

在 `<main id="view">` **裡面**加一段 `<noscript>`，讓不執行 JS 的爬蟲與使用者也拿得到實質內容。JS 正常運作時瀏覽器會自動隱藏 `<noscript>`，而 `app.js` 掛載頁面時會覆寫 `#view` 的 innerHTML，所以不需要額外的清除邏輯。

內容需包含一個 `<h1>Shot Ledger — 投籃訓練紀錄</h1>`、一段說明這是什麼的文字、以及三種模式（挑戰階梯／自由練習／綜合巡迴）的簡述。文案自行斟酌，語氣跟站上一致（口語、具體，不要行銷腔）。樣式從簡，能讀就好。

### 7. `js/home.js`：首頁字標升為 `h1`

`renderWordmarkHtml()` 裡的 `<p class="home-wordmark__name">Shot Ledger</p>` 改成 `<h1 class="home-wordmark__name">Shot Ledger</h1>`。

- 這是全站唯一沒有 `h1` 的主要畫面，而它正是爬蟲執行 JS 後會落地的那一頁（裸網址 ＋ `homeSeen === false` → 自動進 `#/home`）。
- CSS class 不變，視覺必須**完全一樣**。`h1` 會帶瀏覽器預設的 margin／font-size，`.home-wordmark__name` 已經指定了 `font-size`／`line-height`，但**沒有指定 `margin`**——請確認 `css/app.css` 第 7 行的 `*` reset 是否已經把 margin 清掉；若沒有，要在 `.home-wordmark__name` 補 `margin: 0`。改完務必實測字標位置沒有位移。

### 8. `sw.js`

`CACHE_NAME`：`shotledger-v13` → **`shotledger-v14`**（版號只准往上加）。

同時檢查 `CORE` 陣列：`robots.txt` 與 `sitemap.xml` **不要**加進去（那是給爬蟲的，快取它們沒意義）。

## 驗收條件

1. `robots.txt`、`sitemap.xml` 在站台根目錄可直接存取。
2. `index.html` 的初始 HTML（不執行 JS）裡就找得到：canonical、JSON-LD、`<h1>`（在 noscript 內）。
3. JSON-LD 通過 schema.org 語法檢查（至少 `JSON.parse` 不報錯、`@type` 正確）。
4. 首頁字標從 `<p>` 改 `<h1>` 後，視覺位置與大小完全沒變。
5. 手機上可以雙指放大，且放大後球場圖與熱區圖不破版。
6. 其他頁面（練球／統計／紀錄／設定）功能與外觀完全不受影響。

## 不要做

- 不要把 hash 路由改成真實路徑（那是另一個里程碑等級的架構改動）。
- 不要在 sitemap 裡塞 `#/xxx` 網址。
- 不要為了 SEO 在畫面上塞看得見的關鍵字文字。
- 不要動任何既有的 OG 標籤與那段「換圖要換檔名」的註解。
