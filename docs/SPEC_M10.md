# SPEC_M10：生涯成績分享卡 ＋ 疲勞趨勢改「單場逐輪」

> 使用者需求（2026-07-21）：
> 1. 統計頁「生涯累計」不能分享 → 做一張有質感的生涯分享圖卡。
> 2. 疲勞趨勢下半段原本是「逐球前後段」，但使用者現在不用逐球輸入（記不住），
>    改成「每一次挑戰的逐輪疲勞趨勢」。
>
> 使用者已拍板：疲勞＝**最近一次挑戰的逐輪曲線、可左右切換場次**；
> 生涯卡內容＝**生涯數字＋階梯進度＋徽章**。

實作分工：本 spec 由 Fable 撰寫，Sonnet subagent 依此實作（**不 commit、不 push**），
Fable 瀏覽器實測驗收後才進版控。

---

## 0. 護欄

- 純 vanilla ES modules、無 build step；不加任何相依套件。
- `js/stats.js` 只放純函式（不碰 DOM／localStorage）；**改 stats.js 行為，同一份改動
  必須同步補 `tools/test_stats.mjs`**（現 96 條，跑 `node tools/test_stats.mjs` 全綠）。
- schema **不動**（v11），不需要 migration。
- `sw.js` 的 `CACHE_NAME` 由 `shotledger-v30` → **`shotledger-v31`**。
- 繁體中文文案；色彩一律走 `css/tokens.css` 變數（canvas 內沿用 sharecard.js 既有字面 hex 例外）。
- 既有 `earlyLateSplit()` 純函式與其測試**保留不動**（逐球模式仍在，只是統計頁不再用它顯示）。

---

## 1. 疲勞趨勢改版（js/statspage.js §1.6 ＋ js/stats.js）

### 1.1 版面

`疲勞趨勢` section 維持兩個 subsection：

1. 上段不動：`輪次曲線（多次練習平均）` ＝ 現有 `avgRoundCurve` 那塊，程式碼與文案全部照舊。
2. 下段整段換掉：標題由 `逐球前後段` 改為 **`單場逐輪`**，內容如下。

```
單場逐輪
[‹]  Jeremy Lin 大學時期 · 7/19        [›]      ← 場次切換列
                                  第 1 / 6 場
[逐輪折線圖：x = #1..#n，y = 該輪命中率]
前 5 輪 62%，後 5 輪 48%（-14pp）              ← 摘要句
```

- 場次來源：`sessionsInRange(state.sessions, period.days, now)`（跟著上方期間切換走）
  再篩「**挑戰菜單的場次**」＝ `getMenu(s.mode)?.challenge === true`（easy／full 都算），
  且 `s.rounds.length >= 2`；依 `startedAt` **新 → 舊**排序。
- 模組狀態 `fatigueIdx`（預設 0 ＝最近一場）。`‹` 往較舊（idx+1）、`›` 往較新（idx-1）；
  到頭尾的按鈕 `disabled`。**切換期間（`data-period`）或球種 chip 重繪時，`fatigueIdx` 歸 0**，
  並在 `mount()` 也歸 0。索引越界時夾回範圍內。
- 標題列文字：`${menu.name}${variant==='easy' ? '・簡易' : ''} · M/D`，右側小字 `第 k / n 場`
  （k＝fatigueIdx+1）。文字用既有 `.nowrap` 慣例避免換行。
- 空狀態（期間內沒有符合的挑戰場次）：
  `<p class="stats-empty-note">這段期間還沒有挑戰紀錄——去挑戰階梯打一場吧</p>`，
  不畫圖也不畫切換列。

### 1.2 圖表

新增 `renderSessionRoundChart(series)`，**照抄 `renderAvgRoundCurveChart` 的幾何與 class**
（W=320 / H=150 / padL 30 / padR 12 / padT 14 / padB 24；`.pct-chart.round-chart`、
`.pct-chart__line`、`.pct-chart__dot`、`.pct-chart__x-label`），差別只有三點：

1. 資料＝該場每一輪的實際命中率（不是跨場平均）。
2. 前後段分界帶（`.round-chart__band--early` / `--late`）的分界 x 改成
   **前半／後半輪的交界**：`half = Math.ceil(n / 2)`，分界 x ＝ `(xAt(half-1) + xAt(half)) / 2`。
3. `attempts === 0` 的輪（`pct === null`）不畫點、折線在該處**斷開**（分成多段 path），
   不要用 0 當值假裝有資料。

### 1.3 摘要句

- 用新純函式 `roundHalfSplit()`（見 §1.4）算前半／後半輪。
- 文案：`前 ${e.rounds} 輪 ${eP}%，後 ${l.rounds} 輪 ${lP}%（${diff}）`，
  `diff` ＝ `lP - eP` 帶正負號＋`pp`（例：`-14pp`、`+3pp`、`±0pp`）。
  任一側 `pct === null` 時整句退成 `前 X 輪 —，後 Y 輪 —`（不顯示 diff）。
- 該場輪數 < 4 時不顯示摘要句（只畫圖），避免 1v1 輪的無意義比較。
- 樣式沿用既有 `.fatigue-summary`。

### 1.4 stats.js 新增純函式（含測試）

```js
/**
 * 單場逐輪序列：每輪 {round, att, mk, pct}，pct 沿用 pct()（att=0 → null）。
 */
export function sessionRoundSeries(session)

/**
 * 依「輪次」前後對半分（奇數輪時中間那輪算前半，與 evaluateSignature('klay') 同慣例）。
 * 回傳 {early:{att,mk,rounds,pct}, late:{att,mk,rounds,pct}}；輪數 < 2 回傳 null。
 */
export function roundHalfSplit(rounds)
```

`tools/test_stats.mjs` 至少補：`sessionRoundSeries` 空／含 0 出手輪；
`roundHalfSplit` 的偶數輪、奇數輪（中間歸前半）、輪數 1 回 null、att=0 時 pct 為 null。

---

## 2. 生涯成績分享卡

### 2.1 入口

`js/statspage.js` 的 `renderLifetimeCard()`：標題列改成左標題右按鈕的一行
（照 `goal-card__head` / `goal-card__edit` 的語彙，class 用 `lifetime-card__head`／
`lifetime-card__share`），按鈕文字 `分享`、`data-action="share-lifetime"`。
點擊 → `openLifetimeShareSheet(state)`。

**生涯 0 球（`lifetime.att === 0`）時不顯示分享鈕**（沒東西可分享）。

### 2.2 sharecard.js 重構：抽出共用 sheet

現有 `openShareSheet(session, state)` 內含底圖選擇列／分享／下載／預覽等約 250 行，
**不得複製一份**。抽成內部函式：

```js
function openCardSheet({ state, title, filename, draw })
// draw(canvas, { photoImg }) —— 由呼叫端把資料綁進閉包
```

- `openShareSheet(session, state)`：算出 `data = buildCardData(session, state)` 後呼叫
  `openCardSheet({ state, title: '分享成績卡', filename: 'shotledger-card-<date>.png',
  draw: (canvas, opts) => drawCard(canvas, data, opts) })`。
- 新 export `openLifetimeShareSheet(state, now = new Date())`：
  `data = buildLifetimeCardData(state, now)`，
  `title: '分享生涯成績卡'`、`filename: 'shotledger-career-YYYY-MM-DD.png'`（今天日期），
  `draw: (canvas, opts) => drawLifetimeCard(canvas, data, opts)`。
- **底圖選擇列、`settings.cardBg` 持久化、分享／下載鈕主次互換邏輯，兩種卡完全共用**
  （行為與現在一模一樣，重構不得改變單場卡的任何輸出）。

### 2.3 badges.js 需要新增的 export

生涯卡要畫階梯與徽章，把顯示層資料留在 badges.js（sharecard.js import badges.js 不會循環：
badges 只依賴 stats/menus）：

```js
export const BADGE_TOTAL          // = BADGE_DEFS.length（現為 17）
export function ladderProgress(state)   // 現有私有 passedLadderCount 改名並 export，回傳 {passed, total}
export function earnedBadgeList(state)  // 依 BADGE_DEFS 順序回傳已獲得的 [{id, icon, label}]
export { ICON_PATH }                    // 讓 canvas 用 Path2D 畫同一套線條圖示
```

（`starsCount` 已 export，直接用。內部原本呼叫 `passedLadderCount` 的地方一併改名。）

### 2.4 `buildLifetimeCardData(state, now)`（純資料，不碰 DOM）

```js
{
  rangeLabel,      // '2026/7/12 – 2026/7/21'；無任何場次時 = 今天單一日期
  totalPct, totalAtt, totalMk,           // lifetimeTotals + pct
  sessionCount,    // endedAt !== null 的場次數
  roundCount,      // 所有 rounds 總數
  streak,          // streakDays(sessions, now)
  maxStreak,       // maxStreakDays(sessions)
  ladder: { passed, total },
  ladderCells,     // 依 tier 順序，每關 'passed' | 'unlocked' | 'locked'
  stars: { earned, total },
  badges: { list, count, total },        // list = earnedBadgeList(state)
}
```

`ladderCells` 判定與階梯頁同一套：`passed` ＝下一關已解鎖（末關看 `ladder_complete` 徽章）；
否則 `unlocked` ＝ `progress.unlocked` 含該關；其餘 `locked`。

### 2.5 `drawLifetimeCard(canvas, data, opts)` 版面（1080×1350）

**紙感／照片兩種 palette、暗化漸層、浮水印圓環、游標推進（GAP ≥16）、`measureAscDesc`
量墨水高度的規矩，全部沿用 `drawCard`**（可把背景／palette 那段抽成共用小函式，
但不得改變單場卡輸出）。marginX = 76，起始 y = 100。

1. **品牌列**：左 `drawBrandMark`，右側 muted 30px 顯示 `data.rangeLabel`
   （用 `fitFontSize` 確保不超過剩餘寬度）。GAP 34。
2. **標題**：`生涯累計` 800 46px（`fitFontSize`）。GAP 30。
3. **主數字帶**（左右兩欄，共用同一個 `bandTop`，高度取兩欄較大值）：
   - 左欄：`${totalPct}%` 800 150px accent（照片模式加既有陰影）；下方 GAP 22 接
     muted 700 34px 的 `${formatThousands(totalMk)} / ${formatThousands(totalAtt)} 投中`。
   - 右欄：4 行，x 起點與單場卡同法（`pctFont` 量 `100%` 寬 + 40），
     label 左對齊、值右對齊在 `rightColX + 280`，行距同單場卡（字高 + 20）：
     `練習 / ${sessionCount} 次`、`輪次 / ${formatThousands(roundCount)} 輪`、
     `連續 / ${streak} 天`、`最長連續 / ${maxStreak} 天`。
   - GAP 44。
4. **挑戰階梯帶**：
   - 小標 muted 700 28px `挑戰階梯`，GAP 18。
   - 分段條：總寬 `CARD_W - marginX*2`，`n = ladderCells.length` 格，格間距 8、
     格高 22、圓角 11（`roundRectPath`）。填色：`passed` ＝ accent 實心；
     `unlocked` ＝ accent 30% 透明；`locked` ＝ courtLine 35% 透明。GAP 18。
   - 說明句 700 32px `text` 色：`已通過 ${passed} / ${total} 關 ・ ★ ${stars.earned} / ${stars.total}`。
   - GAP 44。
5. **徽章帶**：
   - 小標 muted 700 28px `徽章 ${count} / ${total}`，GAP 18。
   - 已獲得徽章的獎章圓盤，一列最多 **8 顆**：直徑 92、間距 26（8×92 + 7×26 = 918 ≤ 928）。
     圓盤＝accent 8% 透明填底 ＋ accent 2px 描邊；圖示用 `new Path2D(ICON_PATH[icon])`
     配 `ctx.translate(cx - 24*k, cy - 24*k); ctx.scale(k, k)`（k = 48/24 ÷ 2 → 圖示視覺
     約 48px 見方置中），`strokeStyle = accent`、`lineWidth = 1.7 / k`、
     `lineCap/lineJoin = 'round'`，畫完 `ctx.restore()`。
     **`Path2D` 以 `try/catch` 包起來**，失敗時退化成畫一個 accent 實心小圓點（不得整張卡壞掉）。
   - 已獲得超過 8 顆：前 7 顆照畫，第 8 格改畫 `＋N`（800 34px accent，同尺寸圓盤）。
   - 一顆都沒有：改顯示 muted 700 30px 一行 `還沒有徽章——連練 3 天就有第一顆`。
6. **底部網址**：與單場卡一致（`shot-ledger.pages.dev`，600 24px 置中，baseline = `CARD_H - 56`）。

**排版鐵律（驗收會照 HANDOFF_20260714 的垂直帶掃描檢查）**：任兩段內容之間必須有
**≥16px 的純背景水平帶**；徽章列與網址之間至少留 34px；若徽章帶畫完後底部空間不足，
先縮徽章圓盤（92 → 最小 76）再說，**絕不允許重疊**。

### 2.6 CSS（css/app.css）

只需補 `.lifetime-card__head`（flex、space-between、baseline 對齊）與
`.lifetime-card__share`（沿用 `.goal-card__edit` 的視覺語彙：小字、accent 色、
無底、44px 觸控高度），以及 §1.1 場次切換列的樣式：
`.fatigue-nav`（flex、space-between、align-items center）、
`.fatigue-nav__btn`（44×44 圓鈕，`disabled` 時降透明度、`cursor:default`）、
`.fatigue-nav__title`（省略號溢出保護）、`.fatigue-nav__count`（muted 小字）。
**新增 class 一律沿用既有 token 變數，不得寫死顏色。**

---

## 3. 驗收清單（Fable 會逐條實測）

1. `node tools/test_stats.mjs` 全綠、且條數 > 96。
2. 統計頁：切 7 天／30 天／全部，疲勞趨勢下段場次數量正確、`fatigueIdx` 歸 0、
   `‹ ›` 到頭尾正確 disabled；沒有挑戰紀錄的期間顯示空狀態不報錯。
3. 逐輪圖：有 0 出手輪時折線斷開、不畫該點；前後段帶分界落在正確位置。
4. 生涯卡：紙感／5 張內建底圖／自訂照片皆能畫出，切換不閃退；
   分享（有 Web Share API）與下載 PNG 都拿得到 1080×1350 檔。
5. 生涯卡垂直帶掃描：任兩區塊之間有 ≥16px 純背景帶（含最壞情境：
   17 顆徽章全滿＋13 關全通＋照片模式）。
6. 單場成績卡輸出與改版前**逐像素等價**（重構不得動到它）。
7. `sw.js` = `shotledger-v31`。
