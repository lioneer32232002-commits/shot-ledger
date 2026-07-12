# SPEC M1 — Shot Ledger 實作規格（給實作 agent，2026-07-12）

繁體中文 UI。純 vanilla JS ES modules、無 build step、無任何外部依賴。
手機優先（設計基準寬 390px），桌面時內容置中 max-width 480px。
本規格是唯一事實來源；PLAN.md 是背景脈絡。

## 0. 檔案結構（全部新建）

```
index.html
css/tokens.css     — 設計變數（色彩/字級/間距/圓角/陰影）
css/app.css        — 版面與元件
js/app.js          — 進入點、hash router、三分頁殼（練球 #/train、紀錄 #/history、設定 #/settings）
js/store.js        — localStorage 讀寫、schema v1、migration 骨架、匯出/匯入/CSV
js/court.js        — 定點表 SPOTS + 半場 SVG 渲染（可選點模式 / 熱區顯示模式）
js/menus.js        — 模式資料（data-only module，不含邏輯）
js/session.js      — 練球流程（選模式 → 輪次記錄 → 本節統計）
js/stats.js        — 純函式統計聚合（不碰 DOM、不碰 storage）
js/history.js      — 紀錄分頁（節列表 + 節詳情）
tools/test_stats.mjs — node 可跑的 stats.js 單元測試（node tools/test_stats.mjs）
```

## 1. 資料 schema（store.js）

localStorage key：`shotledger_v1`。頂層：

```js
{
  schema: 1,
  sessions: [{
    id: "s_" + startedAt 毫秒數,
    startedAt: ISO 字串, endedAt: ISO 字串或 null(進行中),
    mode: "free" | "curry" | "lin" | "klay" | "world",
    rounds: [{ spot: SpotId|null, type: "2pt"|"3pt"|"deep3"|"ft",
               attempts: number, makes: number, at: ISO }]
  }],
  settings: { lastBackupAt: ISO|null }
}
```

- `load()` 時若無資料回傳空結構；若 schema < 現行版本，走 migration 表（M1 只有 v1，留骨架）。
- 進行中的 session 也存進 storage（防手機睡眠/誤關頁），app 啟動時偵測未收尾
  的 session → 詢問「繼續上次練習？」（繼續 / 捨棄）。
- API：`load/save/startSession/addRound/updateRound/endSession/discardSession/`
  `exportJSON/importJSON(text)/exportCSV/clearAll`。
- 匯出 JSON/CSV 用 Blob + a[download] 下載；匯入用 `<input type=file>`，
  驗證 schema 欄位後**整份取代**（先 confirm）。CSV 一列一輪：
  `date,time,mode,spot,type,attempts,makes`。

## 2. 定點表與球場圖（court.js）

FIBA 半場，SVG `viewBox="0 0 750 560"`（1m = 50px，籃框中心 B=(375, 79)，
底線在 y=0）。畫：底線、兩側邊線（到 y=560）、禁區（寬 4.9m×深 5.8m 矩形）、
罰球圈（半徑 1.8m）、籃框（半徑 0.23m 圓 + 籃板線）、三分線（半徑 6.75m 弧
＋兩側距邊線 0.9m 的直線段）。線條用 token 色、圓潤收筆，質感要好。

`SPOTS`（id、label、type、cx、cy）——座標固定用下表，不要自己重算：

| id | label | type | cx | cy |
|---|---|---|---|---|
| paint | 禁區近筐 | 2pt | 375 | 145 |
| mid_lc | 左底角中距 | 2pt | 150 | 100 |
| mid_lw | 左45°中距 | 2pt | 215 | 235 |
| mid_top | 罰球線頂中距 | 2pt | 375 | 300 |
| mid_rw | 右45°中距 | 2pt | 535 | 235 |
| mid_rc | 右底角中距 | 2pt | 600 | 100 |
| ft | 罰球 | ft | 375 | 310 |
| 3pt_lc | 左底角三分 | 3pt | 60 | 110 |
| 3pt_lw | 左45°三分 | 3pt | 136 | 317 |
| 3pt_top | 弧頂三分 | 3pt | 375 | 416 |
| 3pt_rw | 右45°三分 | 3pt | 614 | 317 |
| 3pt_rc | 右底角三分 | 3pt | 690 | 110 |
| deep_l | 左深三 | deep3 | 83 | 370 |
| deep_top | 弧頂深三 | deep3 | 375 | 491 |
| deep_r | 右深三 | deep3 | 667 | 370 |

註：ft 與 mid_top 座標接近是正常的（罰球就在罰球線上）；靠 label 與球種區分。

`renderCourt(container, { mode, selected, heat, onSelect })`：
- `mode:"pick"`：每個 spot 畫成可點的圓形目標（直徑 ≥40px 觸控目標，含透明
  外擴熱區），選中的放大＋accent 色＋label 浮出。
- `mode:"heat"`：spot 圓依命中率上色——無資料灰、<40% 冷藍、40–55% 黃、
  >55% 橘紅（連續漸層更好），圓內顯示 `中/投`。

## 3. 模式資料（menus.js）

```js
export const MENUS = [
  { id:"free",  name:"自由練習", focus:"想投哪就投哪", est:null, rounds:null },
  { id:"curry", name:"Curry 模式", focus:"三分＋深三特化", est:35, inspired:true,
    rounds:["3pt_lc","3pt_lw","3pt_top","3pt_rw","3pt_rc","deep_l","deep_top","deep_r","ft"] },
  { id:"lin",   name:"Jeremy Lin 模式", focus:"中距離＋罰球（切入型後衛）", est:30, inspired:true,
    rounds:["mid_lc","mid_lw","mid_top","mid_rw","mid_rc","paint","ft","ft"] },
  { id:"klay",  name:"Klay 模式", focus:"Catch & Shoot 三分量產", est:40, inspired:true,
    rounds:["3pt_lc","3pt_lw","3pt_top","3pt_rw","3pt_rc","3pt_lc","3pt_lw","3pt_top","3pt_rw","3pt_rc"] },
  { id:"world", name:"綜合模式", focus:"Around the World 全點巡迴", est:45,
    rounds:["paint","mid_lc","mid_lw","mid_top","mid_rw","mid_rc","3pt_lc","3pt_lw","3pt_top","3pt_rw","3pt_rc","ft"] },
];
```

每輪 = 該 spot 投 10 球。掛名模式（inspired:true）在卡片與 session 內顯示小字：
「依公開報導風格改編的靈感版本」。

## 4. 練球分頁（session.js）— 核心流程

**A. 未練球（home）**：模式卡片列表——名稱、focus、輪數、約幾分鐘；點卡片即開始。
頂部放今日小結（今天已投/已中，沒有則顯示鼓勵文案）。

**B. 練球中**：
- 頂列：模式名、經過時間（mm:ss，每秒更新）、菜單模式顯示「第 n / N 輪」。
- 球場圖：菜單模式 → 高亮本輪指定點（不可改）；自由模式 → pick 模式可點選，
  另有「不指定位置」chip；選 spot 自動帶球種，不指定時出現球種 chips
  （2分/3分/深三/罰球）。
- 實投數：預設 10，chip 點開 stepper 可調 1–20（應付投到一半沒力）。
- **主輸入：「這輪進幾顆？」0–attempts 的數字大按鈕網格**（每顆 ≥56px 高）。
  點一顆 = 本輪完成：存檔、輕微動效/toast、自動前進下一輪。
- 已完成輪列表（緊湊一行一輪：#、點位、n/10）；點某輪可修改 makes（撤銷誤按）。
- 底部：「結束練習」（≥1 輪才可按）／「放棄」（confirm 後整節刪除）。
- 菜單模式走完全部輪次 → 自動進入結束頁（也可提前結束）。

**C. 本節統計（結束頁，history 詳情共用同一渲染）**：
- 大字總覽：總投/總中/總命中率。
- 各球種列：投/中/%＋**對比近 7 日同球種平均**（↑↓ 與差幾個百分點；
  近 7 日不含本節、無資料顯示「—」）。
- 熱區球場圖（heat 模式，本節資料）。
- 時長、模式名。「完成」→ 回 home。

## 5. 紀錄分頁（history.js）

- 依日期倒序的節列表：日期＋星期、模式名、總投/中、命中率、時長。
- 點開 → 該節統計詳情（同 4C）＋「刪除此節」（confirm）。
- 空狀態要設計（第一次打開不能是白畫面）。

## 6. 設定分頁

匯出 JSON／匯入 JSON／匯出 CSV／清除全部資料（輸入「刪除」二字確認）。
顯示：資料筆數（N 節 / M 輪）、上次備份時間、超過 5 節未備份時在設定 tab
圖示掛紅點並在頁內顯示提醒。頁尾：App 名、版本 `M1`、菜單靈感聲明一行。

## 7. stats.js（純函式，必須有測試）

`aggregate(rounds)` → `{ byType: {[type]:{att,mk}}, bySpot: {[spot]:{att,mk}}, total:{att,mk} }`
`pct(mk,att)` → 0–100 整數（att=0 回 null）
`recentTypeAvg(sessions, type, days, now, excludeSessionId)` → % 或 null
`todaySummary(sessions, now)` → `{att, mk}`

tools/test_stats.mjs：純 node assert，至少 10 個 case（含空資料、att=0、
7 日邊界、excludeSessionId）。跑法 `node tools/test_stats.mjs`，全過印 PASS。

## 8. 設計要求（履歷作品等級，這部分不能省）

- tokens.css：籃球橘 accent（建議 #E8590C 系）、暖灰底（#FAF9F7 類）、
  深炭文字；字級/間距/圓角/陰影全部走 token；系統字型堆疊即可。
- 卡片式版面、大量留白、觸控目標 ≥48px；數字用 `font-variant-numeric: tabular-nums`。
- 底部固定 tab bar（練球/紀錄/設定，SVG inline icon），iOS safe-area padding
  （`env(safe-area-inset-bottom)`）。
- 戶外太陽下可讀：主要文字對比 ≥ 7:1，主輸入按鈕大且高對比。
- 動效克制：輪完成時按鈕輕微 scale＋toast，150–250ms，`prefers-reduced-motion` 尊重。
- 頁面 `<html lang="zh-Hant">`、`<meta name="viewport" ... viewport-fit=cover>`、
  `theme-color`。favicon 用 inline SVG data URI（🏀 風格簡圖即可）。

## 9. 驗收清單（實作完自查，逐條回報）

1. `python -m http.server` 開啟後三分頁可切換、重整後停留原分頁（hash router）。
2. 自由模式：選點→輸入→再一輪→結束→統計頁數字正確；重整後紀錄還在。
3. Curry 模式：輪次自動前進、9 輪走完自動進統計頁。
4. 修改已完成輪的數字，統計即時正確。
5. 進行中重整 → 詢問繼續/捨棄，兩條路都正常。
6. 匯出 JSON → 清除全部 → 匯入 JSON → 資料完整復原。
7. `node tools/test_stats.mjs` 全過。
8. 390px 寬無橫向捲動；桌面寬度內容置中不散版。
9. 無 console error。
```
