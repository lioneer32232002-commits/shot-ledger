# SPEC_M6：首頁（landing）

2026-07-14。使用者回報：`shot-ledger.pages.dev` 一進來就是 `#/train`，沒有首頁；
希望有一個介紹本站的首頁（三段介紹，用他提供的照片當背景），並從首頁進到各種訓練。
使用者對呈現的要求：**照片與文字要有質感，不能只是把字推到照片上**。

## 0. 決策（使用者於 2026-07-14 拍板）

- **首頁定位**＝訪客登陸頁：第一次來看首頁，看過就跳過，之後直接進 `#/train`。
- **介紹形式**＝全屏直向捲動三段（不是橫向滑卡、不是單頁 hero）。
- **訓練入口**＝三個大入口（挑戰階梯／自由練習／綜合巡迴），首頁不重複列 12 關。

## 1. 路由與動線

新增 hash 路由 `#/home`，**不進底部 tab bar**（tab bar 維持四格；首頁掛載時整條 tab bar 隱藏，
`.app-main` 的底部 padding 一併移除，讓照片能真正做到滿版）。

`js/app.js`：
- `VALID_TABS` 之外另立 `home` 路由；`parseHash()` 認得 `home`。
- **空 hash / 非法 hash 的落點改為動態**：
  - `settings.homeSeen === false` → `#/home`
  - 否則 → `#/train`（現行行為不變）
- 使用者手動打 `#/home` 永遠可以回到首頁（不論 homeSeen）。

## 2. store schema v6 → v7

`settings.homeSeen: boolean`（預設 `false`）。（原規劃為 v5→v6，因遠端 M5.2 已占用 v6——unlocked 依練習紀錄重算——本輪順延為 v7，且跑在 v6 之後。）

**遷移的祖父條款**：v6→v7 時，**已經有任何 session 或任何 progress.unlocked 超過第一關的舊用戶
一律設 `homeSeen = true`**，避免既有使用者升版後突然被一個介紹頁擋在門外。全新使用者才是 `false`。

寫入時機：首頁上按下「開始練球」或任一訓練入口卡 → `store.markHomeSeen()` → `homeSeen = true`。
（純捲動不寫入；使用者可能只是路過。）

設定頁新增一列「重看首頁介紹」→ `location.hash = '#/home'`。

## 3. 版面：四屏

`js/home.js`（新模組，`mount(container)` / `unmount()` 介面與其他分頁一致）。

### 3.1 三段照片介紹（各 100dvh）

| 段 | 圖 | 序號 | 標題 | 內文 |
|---|---|---|---|---|
| 1 | `assets/home/home1.jpg` | 01 | 記下每一球，不只記得手感 | 選一份菜單、投一輪、回來點一下。不用邊投邊打字。 |
| 2 | `assets/home/home2.jpg` | 02 | 熱區會自己說話 | 快速記整輪，或逐球記進出。投完就看得到哪裡準、哪裡該練。 |
| 3 | `assets/home/home3.jpg` | 03 | 12 關生涯階梯 | 從 Lin 的哈佛時期一路到 Curry 的終極試煉，達標才解鎖下一關。菜單取材自公開報導。 |

第一段最上方另有站名字標（Shot Ledger／投籃訓練紀錄本）與底部的捲動提示（↓，捲動後淡出）。

### 3.2 質感規格（使用者明確要求，不可省）

**照片**
- 每段一張 `<img>` 絕對定位滿版 `object-fit: cover`，**不是 CSS background**（才吃得到
  `loading` / `decoding` 與 art direction）。
- **視差**：捲動時圖層 `transform: translate3d(0, Ypx, 0) scale(1.12)`，位移量 = 該段中心與
  視窗中心的距離 × **0.25**（圖走得比字慢，產生景深）。用 `requestAnimationFrame` 節流的
  scroll listener，一次算完三段（不是每段各掛一個 listener）。`scale(1.12)` 是給位移留的裁切餘裕。
- **scrim 依圖配色，不是無腦半透明黑**（每張照片亮部位置不同，統一壓黑會髒）：
  - home1（暗場館，本來就暗）：底部 `linear-gradient(to top, rgba(10,8,6,.82) 0%, rgba(10,8,6,.45) 38%, transparent 62%)`
  - home2（俯視球場，色塊亮、文字壓在左下）：底部同上再疊一層左下角 `radial-gradient` 加深
  - home3（夕陽逆光，天空極亮）：底部漸層 + 頂部 `rgba(10,8,6,.35)` 短漸層壓住天空，避免序號浮不出來
  - 三者都再加一層 `backdrop-filter: none` 的純色兜底不做——**不用毛玻璃**，維持照片本身的質地。

**文字**
- 文字塊靠**底部對齊**（`justify-content: flex-end`），不是垂直置中——置中會跟照片主體打架。
- 序號 `01`：`--text-sm`、`letter-spacing: .28em`、`font-variant-numeric: tabular-nums`、
  白色 62% 透明，前方一條 24px 短橫線。
- 標題：`clamp(30px, 8vw, 44px)`、`font-weight: 700`、`line-height: 1.18`、
  `letter-spacing: -0.01em`、白色、`text-shadow: 0 1px 24px rgba(0,0,0,.35)`（撐對比，不是描邊）。
- 內文：`--text-lg`、`line-height: 1.65`、白色 78% 透明、`max-width: 19em`（一行約 19 個中文字，
  手機上剛好兩到三行）。
- **進場動畫**：`IntersectionObserver`（threshold 0.35）觸發，序號 → 標題 → 內文
  **依序 0 / 60 / 120ms 錯開**，各自 `opacity 0→1` + `translateY(14px→0)`，520ms
  `cubic-bezier(.22,.61,.36,1)`。只播一次（觸發後 `unobserve`）。
- `prefers-reduced-motion: reduce` → **視差關閉、進場動畫關閉**（直接 opacity 1、無位移），
  scroll listener 也不掛。

### 3.3 第四屏：入口（紙感底，非照片）

沿用 App 既有的 `--color-bg` / `.card` 語彙，讓首頁最後一屏「接回產品本體」。

三張入口卡（縱向堆疊，整卡可點，≥48px 觸控）：

| 卡 | 標題 | 副標 | 動作 |
|---|---|---|---|
| 1 | 挑戰階梯 | 12 關生涯之路，一關一關解鎖 | `markHomeSeen()` → `#/train` |
| 2 | 自由練習 | 想投哪就投哪，不指定點位 | `markHomeSeen()` → `#/train` 並直接開 `free` 菜單 |
| 3 | 綜合巡迴 | 全場繞一圈，各距離都練到 | `markHomeSeen()` → `#/train` 並直接開 `world` 菜單 |

卡 2／卡 3 的「直接開菜單」重用 `session.js` 既有的 `pendingRetry` 機制（`openMenu(id)` 之類的
跨分頁開菜單能力）——**不新增第二套跨分頁開菜單的路徑**。

第四屏底部：一行 Unsplash 攝影師 credit（`Photos: Markus Spiske, Jeremy Wallace, Tom Briskey /
Unsplash`），`--text-xs`、`--color-text-faint`。

## 4. 照片資產

來源：使用者提供的 Unsplash 照片（Unsplash License，與 M5 的 `assets/cardbg/` 同一批授權）。

| 檔名 | 原檔 | 內容 |
|---|---|---|
| `assets/home/home1.jpg` | markus-spiske-BfphcCvhl6E | 暗場館，球正穿過網（暗調，白字對比最好，當第一屏） |
| `assets/home/home2.jpg` | jeremy-wallace-_XjW3oN8UOE | 俯視球場，藍／紅／灰色塊與球（對應「熱區」） |
| `assets/home/home3.jpg` | tom-briskey-HM3WZ4B1gvM | 夕陽逆光，球正要進框（暖調收尾，對應「階梯／達標」） |

預處理：**center-crop 到 3:4 後縮到 1080×1440、JPEG q76**，每張目標 ≤ 300KB
（手法同 M5 的 cardbg：PowerShell + System.Drawing，不引入任何套件）。

## 5. Service Worker

`CACHE_NAME` `shotledger-v9` → **`shotledger-v10`**；`CORE` 加入 `js/home.js` 與三張
`assets/home/home*.jpg`。

## 6. 驗收

1. 全新使用者（清空 localStorage）：開 `/` → 落在 `#/home`；三段照片、進場動畫、視差都在。
2. 按「開始練球」→ 進 `#/train`；重新整理 `/` → **直接 `#/train`**（不再回首頁）。
3. 舊使用者遷移：造一份含 sessions 的舊 localStorage → 升版後 `homeSeen === true`，
   開 `/` 直接進 `#/train`（祖父條款）。
4. 入口卡 2／3 → 進 train 分頁且該菜單的變體選擇面板已開。
5. 設定頁「重看首頁介紹」→ 回得去 `#/home`。
6. 首頁時 tab bar 不可見；離開首頁後 tab bar 回來且高亮正確。
7. 深色／淺色兩套都驗（首頁三屏本來就是暗照片，重點驗第四屏入口卡）。
8. `prefers-reduced-motion: reduce` 下無視差、無淡入，內容全部直接可見。
9. `node tools/test_stats.mjs` 83 項全過（本輪不動統計，應維持）。
10. 快取三層陷阱照 HANDOFF 的流程清乾淨再驗。

## 7. 不做（YAGNI）

- 不做橫向滑卡 onboarding、不做進度圓點。
- 不在首頁列 12 關（`#/train` 已經有階梯主視覺）。
- 不做首頁的 i18n／不改 OG 圖。

---

## M6.1（2026-07-14，使用者實機回饋）

1. **「已經在用的人看不到首頁」**——祖父條款把老用戶的 `homeSeen` 設成 true，
   裸網址就直接進 `#/train` 了（設計如此，但沒有明顯的回去入口）。
   決議：**維持跳過**（每天練球不該多按一步），但**練球頁標題列右側加一個低調的
   `⌂ Shot Ledger` 連結**（`.home-link` → `#/home`），已在使用的人隨時回得去。
   設定頁的「重看首頁介紹」保留。
2. **OG 圖換成 patrick-fore-DVpn-Ot0fV4（夕陽逆光穿框）**，1200×630 q82（27KB），
   存成 `assets/og-v2.jpg`——**必須換檔名**：FB／LINE／X 的爬蟲依 og:image 的
   「網址」快取，同名覆蓋在已分享過的連結上會繼續吃到舊圖。同時補上
   `og:image:width/height/alt`（爬蟲不必下載就知道尺寸，卡片較不會裂）。
   舊的 `assets/og.jpg` 留在 repo（不再被引用）。
3. **OG 只有一組、綁在 `index.html`**：`#/home`、`#/train` 都是同一份 HTML 的 hash
   路由，**hash 不會送到伺服器**，爬蟲看到的永遠是同一張卡。分享
   `https://shot-ledger.pages.dev/` 或 `.../#/home` 出來的預覽完全一樣。
4. SW `CACHE_NAME` v10 → **v11**。
