# SPEC M2 — 統計分頁全套＋成績分享卡＋週目標（2026-07-13）

前提：M1.6 已驗收上線。本規格對標競品調查（docs/COMPETITORS.md）：
統計深度是我們對 Hoops 的超車點，分享卡是要跟上的它的傳播引擎。
沿用全部既有慣例：vanilla ES modules、無 build step、tokens.css 變數、
排版紀律（`.nowrap`、禁孤字）、375/390px 手機優先、stats.js 只放純函式。

---

## 0. 硬性規則（違反即退件）

1. `js/stats.js` 只放純函式（不碰 DOM / localStorage / store.js）；
   每個新函式都要在 `tools/test_stats.mjs` 補測試，全過才算完成。
2. localStorage key `shotledger_v1` 不可改名；schema 改動走 migration（本次 v2→v3）。
3. 絕不寫入/影響 `progress.unlocked` 與解鎖判定邏輯。
4. 不引入任何外部函式庫／CDN／webfont；圖表全部手刻 SVG，分享卡用原生 canvas。
5. 顏色一律用 tokens.css 變數（canvas 內例外，可用與 tokens 相同的字面 hex）。

---

## 1. 新分頁「統計」（#/stats）

### 1.1 分頁殼
- `index.html` tab bar 從 3 個變 4 個，順序：**練球、統計、紀錄、設定**。
  統計 icon 手刻扁平 SVG（簡潔折線或長條，與現有 icon 同語言、同 stroke 寬）。
- `js/app.js`：`VALID_TABS` 加 `'stats'`，routes 指向新檔 `js/statspage.js`
  （UI 模組，export mount/unmount，比照 history.js）。
- 4 個 tab 在 375px 寬不得換行或截字。

### 1.2 期間切換（整頁共用一組）
- 頁首 segmented control：**7天 / 30天 / 全部**（預設 30天）。
- 期間定義：完賽節（endedAt !== null）且 `startedAt` 落在 `(now − N×24h, now]`；
  「全部」不設下限。切換時 1.3–1.6 全部連動。
- stats.js 純函式：`sessionsInRange(sessions, days, now)`（days=null 表示全部）。

### 1.3 命中率折線
- 球種 chips：**全部 / 2分 / 3分 / 深3 / 罰球**（預設「全部」）。
- stats.js 純函式：`pctSeries(sessions, { type, bucket, now, days })`
  → `[{ key, att, mk, pct }]`：
  - bucket `'day'`：以本地年月日分組，回傳期間內**有出手的日子**（key = `YYYY-MM-DD`），依日期升冪。
  - bucket `'week'`：以「週一為一週之始」分組（key = 該週週一的 `YYYY-MM-DD`）。
  - type 為 null 時計全部球種。pct 用既有 `pct()`（att=0 回 null，但本函式只回傳 att>0 的 bucket，所以不會出現 null 點）。
- UI：7天/30天用 day bucket、「全部」用 week bucket。手刻 SVG 折線：
  - x 軸依 bucket 時間等距鋪滿期間（含沒資料的空檔），有資料的 bucket 畫實心圓點，
    點與點以直線相連（跨過空檔直接連線）。
  - y 軸 0–100%，畫 0/50/100 三條淡格線＋標籤。
  - 每點下方（或首尾點）標日期（`M/D`），最多標 5 個刻度避免擠。
  - 資料點 <2 個時整個折線區顯示空狀態文案：「至少要有兩天的紀錄才能畫趨勢——今天投一節吧」。

### 1.4 熱力格日曆（GitHub 式）
- 顯示**最近 26 週**（半年）的週×日網格：欄=週（左舊右新）、列=週一到週日，
  格子小圓角方塊，手機寬放得下（26×7，格 ~10px＋間 2px；容不下就允許橫向捲動，
  初始捲到最右＝最近）。不受 1.2 期間切換影響（固定 26 週），區塊標題直接寫「最近半年」。
- 顏色分 4 級，依**當日總出手數**：0（底色格）／1–59／60–119／≥120
  （對應：不到一節簡易版／一節簡易版／一節完整版以上）。右下角圖例「少 □□□□ 多」。
- 今天的格子加 1px accent 描邊。月份變換處在頂部標月份（1月、2月…，只標當月第一週）。
- stats.js 純函式：`calendarCells(sessions, now, weeks)` →
  依時間升冪的 `[{ date:'YYYY-MM-DD', att }]`，長度 = weeks×7，
  自「now 當週的週一」往回推 weeks−1 週的週一開始、到 now 當週週日為止
  （未來的日子 att 一律 0，UI 以空白格呈現、不上色不描邊）。

### 1.5 全期熱區
- 直接重用 `renderCourt(container, { mode:'heat', heat })`，
  heat 資料 = 1.2 選定期間所有節的 `aggregate().bySpot`。
- 下方一行小字：「{期間}共 {N} 投 / {M} 中（{pct}%）」（`.nowrap` 單元）。
- 期間內完全沒有指定點位的紀錄 → 該區塊顯示空狀態：「這段期間還沒有點位紀錄」。

### 1.6 疲勞趨勢
- **輪次曲線（跨節平均）**：stats.js 純函式 `avgRoundCurve(sessions)` →
  `[{ round, att, mk, pct }]`（round 從 1 起）：把期間內每節的第 n 輪彙總
  （att/mk 相加再算 pct），只回傳到「至少有 2 節包含該輪次」的最長輪次為止
  （樣本 1 節的尾巴砍掉，避免單節雜訊）。整體不足（達標輪次 <4）→ 區塊空狀態：
  「多練幾節完整版，才看得出第幾輪開始掉」。
- UI：SVG 折線（x=第 n 輪、y=平均命中率），第 1–3 輪與第 4 輪之後
  背景淡色分帶＋文字摘要：「第 1–3 輪 {a}%，第 4 輪起 {b}%」（用 aggregate 算，不是平均線值）。
- **逐球前後段（期間彙總）**：重用既有 `earlyLateSplit()`，餵期間內全部 rounds。
  回 null（沒有 seq 資料）→ 顯示一行引導：「用逐球輸入記錄，就能看出每輪前後段的差異」。

---

## 2. 週目標

### 2.1 資料與 migration（schema v2 → v3）
- `store.js`：`SCHEMA_VERSION = 3`；migration 步驟 `data.schema < 3` →
  `settings.weeklyGoal = null`（保底段也補同樣的 `'weeklyGoal' in settings` 檢查）。
- 新 store 函式：`setWeeklyGoal(state, n)`（n 為正整數或 null=關閉，寫入並 save）。
- `isValidState` 不需改（settings 形狀由 migrate 保底）。

### 2.2 純函式
- `weekAttempts(sessions, now)` → `{ att, mk }`：本地時區、**週一為一週之始**，
  `startedAt` 落在本週（週一 00:00 起）的所有節（含進行中）全部計入。

### 2.3 UI
- 統計頁最上方（期間切換之上）放「本週目標」卡：
  - 未設定：一句話（「給自己一個每週投量目標」）＋「設定目標」鈕 →
    展開快選 **300 / 600 / 1200 球**＋自訂數字輸入（1–9999 的整數）＋確認。
  - 已設定：進度條＋「本週 {att} / {goal} 球」（`.nowrap`）＋剩餘天數小字
    （「還剩 {n} 天」，週日當天顯示「今天是最後一天」）。達成（att ≥ goal）時
    進度條轉滿、文字改「本週目標達成！{att} / {goal} 球」。
  - 卡片右上「⋯」或「編輯」小鈕 → 重開快選 sheet，可改數字或「關閉目標」。
- 首頁（練球分頁）今日小結區：**已設定目標時**加一行「本週 {att}/{goal} 球」
  （`.nowrap`；未設定時不顯示，不推銷）。

---

## 3. 成績分享卡（canvas 匯出 PNG）

### 3.1 入口
- 節結束頁與歷史詳情頁（同一個 `renderSessionSummary`）加「分享成績卡」按鈕
  （secondary 樣式，放刪除鈕之前）。
- 點擊 → 開全螢幕 sheet：上方是卡片預覽（canvas 轉 `<img>`，寬 100%），
  下方兩顆鈕：「分享」（有 `navigator.canShare({files})` 時走 Web Share API 分享 PNG 檔；
  不支援時此鈕隱藏）＋「下載 PNG」（canvas.toBlob → a[download]，檔名
  `shotledger-card-YYYY-MM-DD.png`）＋「關閉」。

### 3.2 卡片規格（新檔 `js/sharecard.js`）
- 尺寸 **1080×1350**（IG 4:5 直式）。全扁平：純色塊、無漸層無陰影。
- 色（與 tokens 同值的字面 hex）：底 `#FAF9F7`、主文字 `#2B2A28`、
  accent `#E8590C`、暖沙 `#F1E8DD`、熱區三色與 app 內一致。
- 字體：system-ui 堆疊（`-apple-system, "Segoe UI", "Noto Sans TC", sans-serif`），
  中文必須正常渲染。
- 版面（由上而下）：
  1. 品牌列：左上扁平籃球小圖（圓＋弧線，canvas 手繪）＋「SHOT LEDGER」；
     右上日期 `YYYY/M/D`。
  2. 菜單名＋變體 tag（「Klay 三分量產・完整」；自由練習就「自由練習」）。
  3. 主數字：總命中率超大字（如 **62%**），旁邊 `53/85 投中`。
  4. 球種列（有資料的才列）：`2分 18/30・60%` 每行一個資訊單元。
  5. 迷你半場熱區圖：canvas 重繪 court.js 同座標系的簡化版
     （底線/三分線/禁區/罰球圈＋15 點位圓，僅畫該節有出手的點，顏色同熱區三級），
     寬約佔卡片 70%。
  6. 狀態列（有才顯示，最多兩枚扁平徽章）：「挑戰達成 ✓」（該節 pass 且 eligible）
     ／「個人最佳」（該節是該菜單目前 best 的來源，比對 progress.best[menuId].pct
     與本節 sessionPct 相等即可）。
  7. 底部：`shot-ledger.pages.dev`（小字置中）。
- 排版紀律同 app：資訊單元不拆行（canvas 手排版本來就逐行畫，注意留邊距，
  文字寬超出就縮字級，不裁切）。
- `sharecard.js` 拆兩層：`buildCardData(session, state)`（組出上述純資料物件，
  **放 stats.js 也可以**——若放 stats.js 就要補測試；放 sharecard.js 則不強制測）
  ＋ `drawCard(canvas, data)`（純畫圖）。

---

## 4. 其他小項

- 設定頁 footer 版本字樣改「M2」。
- README.md 功能清單補：統計分頁（趨勢/日曆/熱區/疲勞）、週目標、成績分享卡。
- 不動：挑戰邏輯、session 流程、匯出匯入格式（CSV 欄位不變）。

---

## 5. 驗收清單（Fable 逐條實測）

1. `node tools/test_stats.mjs` 全過，含新函式測試：
   `sessionsInRange`（邊界：整 N 天前、進行中節排除）、
   `pctSeries`（day/week 分組、type 過濾、跨月、只回有資料 bucket）、
   `calendarCells`（長度=weeks×7、週一起排、未來日 att=0、跨年）、
   `avgRoundCurve`（樣本 <2 節的輪次截尾、att 加權）、
   `weekAttempts`（週一 00:00 邊界、週日深夜、進行中節計入）。
2. 375/390px：統計頁四大區塊＋週目標卡全部無孤字換行、無橫向溢出
   （熱力格日曆允許自身橫向捲動）。
3. 期間切換 7天/30天/全部：折線、熱區、疲勞三區連動且數字與手算相符
   （以種子資料核對至少各一組）。
4. 熱力格日曆：格子顏色分級與當日出手數相符；今天有描邊；未來日空白。
5. 週目標：設定 → 進度條與「本週 N/goal」正確（週一起算）；達成態正確；
   關閉目標後首頁該行消失；重新整理後設定仍在（schema v3 migration 生效，
   且既有 v2 資料匯入後不壞）。
6. 分享卡：挑戰節與自由節各生成一張——中文正常、版面無截字、
   熱區點位與該節資料一致、達成/個人最佳徽章邏輯正確；下載 PNG 打得開。
7. 四個 tab 導覽正常、直接開 `#/stats` 深連結正常；console 零錯誤。
8. 既有 51 項舊測試不得改動其斷言（只能新增）。
