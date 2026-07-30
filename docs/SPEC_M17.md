# SPEC_M17 — 射手檔案（/stories/）：三篇靜態文章頁（2026-07-30）

> 使用者從 A／B／C 三案比稿中選 **A 案「刊號檔案」**（雜誌內頁感、純排版、不依賴照片），
> 第一批寫三關：Ray Allen（7）、Dirk Nowitzki（5）、Stephen Curry（16）。

## 1. 為什麼是「真實路徑的靜態 HTML」而不是 SPA 路由

`#/story/allen` 這種 hash 對搜尋引擎是**同一個 URL**，不會被當成獨立頁面索引——
而這幾頁存在的理由有一半就是自然搜尋流量（「Ray Allen 賽前訓練」「Curry 熱身菜單」
這類長尾字）。目前全站只有一個可索引頁、`<noscript>` 裡約 200 字，靠 App 本身拿
不到內容型流量。

所以做成 `/stories/*.html`：各有自己的 `<title>`／`description`／canonical／OG／
JSON-LD Article，寫進 `sitemap.xml`。純靜態、無 build step，`pages deploy .` 直接帶上去。

⚠️ 既有的坑（`index.html` 檔頭已記載）：**Cloudflare Pages 對任何不存在的路徑都回
200 ＋ 整份 index.html**。所以檔案必須真的存在，否則 Google 會抓到 App 首頁內容而
判定重複。本次已逐頁抓取確認回的是文章本體、不是 App 殼。

⚠️ **第二個坑（上線後才發現）：Cloudflare Pages 會自動做 clean URL**——
`/stories/ray-allen.html` 會 **308 轉址**到 `/stories/ray-allen`。所以
canonical／og:url／JSON-LD url／sitemap／站內連結一律寫**無副檔名**的正規形式，
否則 canonical 指向一個會轉址的網址、sitemap 也全是轉址。
副作用：本機的 `python -m http.server` **不做 clean URL**，站內連結在本機會 404——
本機要驗頁面本身請直接開 `.../ray-allen.html`。這是 dev/prod 差異，不是 bug。

## 2. 檔案

```
stories/index.html            索引（CollectionPage）
stories/ray-allen.html        第 7 關
stories/dirk-nowitzki.html    第 5 關
stories/stephen-curry.html    第 16 關
css/story.css                 專用樣式（吃 css/tokens.css，不自己定義任何顏色）
```

- **深色模式**：靜態頁沒有 app.js，改由每頁 `<head>` 一段同步 inline script 設定
  `<html data-theme>`——**先讀 App 存在 localStorage 的偏好**（同源讀得到），沒有就
  跟系統。這樣從 App 點進文章不會突然變色。
- **不使用任何球員肖像**：肖像權，站上一律只用球場／球體照。A 案是純排版的，
  天生不需要人像；每頁頁尾也明寫「本頁不使用任何球員肖像，與文中球員及其所屬
  球團、聯盟無關」。
- **內容紀律**：正文的事實陳述一律限縮在 `js/menus.js` 已經雙來源查證過的材料
  （`career` 數據 ＋ `basis` 的那篇報導），沒有新增任何未查證的說法；每頁頁尾附
  原始報導連結。菜單一律標「依公開報導風格改編的**靈感版本**、非本人菜單、
  非官方授權內容」——與 App 內同一套立場，不因為要吸引點擊就改口。

## 3. 動線

- **文章 → App**：每頁兩顆 CTA（「用這份菜單開始練 →」指向 `../#/train`、
  「看完整 16 關階梯」指向 `../`）。
- **App → 文章**：設定頁「關於本站」新增「射手檔案」按鈕（給搜尋引擎一條從首頁
  過去的內部連結，也讓現有使用者看得到新內容）。
- **文章 ↔ 文章**：每頁底部「其他檔案」互連，索引頁列全部三篇。

## 4. Service Worker

`/stories/` **不可以走殼策略**：它們也是 navigate 請求，但若 fallback 到 index.html，
離線點進文章頁的人會拿到 App 首頁，看起來像網站壞了。`sw.js` 的 fetch handler 加
`isStory` 判斷，走一般靜態資源策略（cache-first，沒有就回源）。`CACHE_NAME` → v37。

## 5. 驗收紀錄（2026-07-30）

- 四頁皆 200，`<title>`／`description`／canonical 各自獨立、JSON-LD 存在；
  逐一抓取確認**回的是文章本體不是 App 殼**。
- 所有內部相對連結逐一 fetch 驗證可達（文章↔文章、文章→App）。
- 版面：375px 寬無水平溢出（刊號浮水印刻意超出右界，`.masthead` 加 `overflow:hidden` 切掉）；
  12 格輪次序列不爆版。
- **對比度（淺色／深色雙向逐元素掃描，AA：小字 4.5、大字 3.0）**，修掉三類問題：
  | 元素 | 原本 | 改為 |
  |---|---|---|
  | kicker／段標（11–12px accent） | 3.4 | `accent-dark` → 5.19 |
  | 引言出處／索引小字（faint） | 3.26 | `muted` → 5.83 |
  | 輪次格 10px 標籤 | 4.06（深色） | `text` → 14.65；三分格不再改字色（只留底色當輔助訊號） |
  同一批問題也回頭修了 M14 的 `.shooter-note__kicker` 與 `.streak-card__pb`。
- **已知未達標項（刻意保留）**：`.cta` 白字壓在 accent 上＝3.58（淺）／3.08（深）。
  這與全站 `.btn--primary` 是同一個樣式，不在這包單獨改動——改就要全站一起改
  （見 §6 待辦）。

## 6. 待辦

- **全站按鈕對比**：`--color-accent` ＋白字在兩個主題都低於 4.5。要修就是全站一起——
  可選：accent 再壓深一階、或主要按鈕改深色文字。屬視覺系統層級的決定，需要比稿。
- **成效觀察再決定是否擴充**：先看這三篇有沒有帶進自然搜尋流量，再決定要不要補
  其餘 13 關（Taurasi 那篇是話題性最高的候選）。目前站上沒有任何 analytics，
  只能看 Cloudflare 的請求數；要精準量測需另外掛 cookieless analytics（使用者決定）。
- 發文素材見 `docs/CONTENT_KIT.md`（刻意不放在公開站上：公開頁面是給讀者與搜尋引擎的，
  不是剪貼簿）。
