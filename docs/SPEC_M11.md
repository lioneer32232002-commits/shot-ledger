# SPEC_M11：挑戰階梯 13 → 15 關（Brunson／Bird，新關 15 輪）

> 使用者拍板（2026-07-21）：加入拿過**總冠軍賽 MVP** 的射手型球員，新關預設
> **15 輪＝150 球**（既有關維持 12 輪不動，Lin 系列尤其不動），**依難度插進中後段、
> Curry 終極試煉維持最終關**。
>
> ⚠️ 事實更正紀錄：使用者原本提到的 **Allen Iverson 沒有拿過 FMVP、也沒拿過總冠軍**
> （2001 年他拿的是例行賽 MVP，該年 FMVP 是 Shaquille O'Neal），因此不列入。
> Jalen Brunson 則確認是 **2026 年 FMVP**。
>
> 實作照 `docs/ADDING_A_TIER.md` 的 SOP 走；本檔只寫「這一次要加什麼」。

---

## 0. 資料查證紀錄（2026-07-21，雙來源交叉核對一致）

**Jalen Brunson（生涯 2018-19 ～ 2025-26，8 季）**
- 生涯數據：FG **48.5%**／3P **38.5%**／FT **82.6%**／生涯三分 **973** 顆
  - 來源 A：ESPN 生涯數據頁 https://www.espn.com/nba/player/stats/_/id/3934672/jalen-brunson
  - 來源 B：landofbasketball https://www.landofbasketball.com/nba_players_stats/jalen_brunson_tot.htm
  - 註：FT 兩邊為 82.6 / 82.7，屬四捨五入差異，取 **82.6**（B 源）。
- 事蹟：2026 年率尼克睽違 53 年奪冠、FMVP 11 張選票全票通過，第五戰 45 分（隊史
  總冠軍賽紀錄）；2025 年 Clutch Player of the Year。
  - 來源 A：Wikipedia「NBA Finals Most Valuable Player」＋「Jalen Brunson」
  - 來源 B：NBA.com https://www.nba.com/news/jalen-brunson-wins-bill-russell-trophy-as-2026-nba-finals-mvp
    ／ESPN https://www.espn.com/nba/story/_/id/49056933/knicks-brunson-seals-finals-mvp-honors-45-points-game-5
- 打法：以**腳步**而非運動能力見長，中距拉桿（snatch-back）＋切入終結＋罰球；
  訓練以基本功為主（樞紐腳步、定點跳投、小拋投）。
  - 訓練報導：https://landonbuford.com/inside-the-training-lab-of-jalen-brunson-a-deep-dive-with-trainer-dave-williams/

**Larry Bird（生涯 1979–1992，13 季）**
- 生涯數據：FG **49.6%**／3P **37.6%**／FT **88.6%**／生涯三分 **649** 顆
  - 來源 A：landofbasketball https://www.landofbasketball.com/nba_players_stats/larry_bird_tot.htm
  - 來源 B：Wikipedia「Larry Bird」生涯數據表
- 事蹟：FMVP **1984、1986**；例行賽 MVP 三連霸 1984–86；**三分大賽 1986／1987／1988
  三連霸**（Wikipedia「NBA Three-Point Contest」逐年得主）；**生涯兩度 50-40-90
  （1986-87、1987-88）**，是史上第一位達成者（Wikipedia「50–40–90 club」）。
- 打法：訓練量傳說級——每日數百顆跳投、賽前提早到場獨自投籃。
  - 訓練報導：Yahoo Sports https://sports.yahoo.com/article/myself-one-thousand-shots-anywhere-135659181.html

---

## 1. 階梯重編（13 → 15 關）

| tier | id | 變動 |
|---|---|---|
| 1–10 | lin_college … lillard | 不動 |
| **11** | **brunson** | **新增** |
| 12 | lin_taiwan | 原 11 → 12 |
| 13 | curry_mvp | 原 12 → 13 |
| **14** | **bird** | **新增** |
| 15 | curry | 原 13 → 15（維持最終關） |

放這兩個位置的理由：Brunson 是中距／罰球軸，難度接在深三專項（Lillard）之後、
台灣時期之前；Bird 是三分＋罰球全能軸，難度介於 Curry MVP 球季與終極試煉之間。
輪數也剛好是單調爬坡（12 → 15 只發生在新關）。

## 2. 新菜單物件（`js/menus.js`）

### 2.1 tier 11：`brunson`

```
id: 'brunson', name: 'Jalen Brunson 冠軍中距', short: 'Brunson 中距',
player: 'Jalen Brunson', playerStatus: 'active', tier: 11,
focus: '腳步換空間的中距課：罰球線頂與兩翼反覆拉桿，切入收尾，罰球穩住',
inspired: true, challenge: true,
passRule: [{ type: '2pt', minPct: 55 }, { type: 'ft', minPct: 80 }],
passDesc: '2 分 ≥55% 且罰球 ≥80%',
signature: { label: '第四節接管', desc: '最後 3 輪合計命中率 ≥60%' },
full: ['mid_top','mid_lw','ft','mid_rw','layup_l','mid_top','mid_lc','ft','mid_rc','layup_r','mid_top','mid_lw','ft','mid_rw','ft'],
est: { full: 75 },
career: { label: '生涯 2018–26', years: '2018–現役', fg: 48.5, tp: 38.5, ft: 82.6, tpm: 973,
          fact: '2026 年率尼克睽違 53 年奪冠，總冠軍賽 MVP 全票通過' },
basis: { text: '取材自 Brunson 與訓練師 Dave Williams 以基本功為主的訓練（樞紐腳步、定點跳投、小拋投），這裡改編成自投自撿的中距定點版，非本人菜單',
         source: 'Landon Buford', url: 'https://landonbuford.com/inside-the-training-lab-of-jalen-brunson-a-deep-dive-with-trainer-dave-williams/' }
```

輪次組成：2 分 9 輪（90 球）／罰球 4 輪（40 球）／上籃 2 輪（20 球）＝15 輪 150 球。
上籃佔 2/15（≤1/3 ✓）、無連續同點位 ✓。

### 2.2 tier 14：`bird`

```
id: 'bird', name: 'Larry Bird 全能射手', short: 'Bird 全能',
player: 'Larry Bird', playerStatus: 'retired', tier: 14,
focus: '全點位射手課：五個三分點跑遍，中距補強，罰球線收尾',
inspired: true, challenge: true,
passRule: [{ type: '3pt', minPct: 42 }, { type: 'ft', minPct: 85 }],
passDesc: '3 分 ≥42% 且罰球 ≥85%',
signature: { label: '50-40-90', desc: '同場 2 分 ≥50%、3 分 ≥40%、罰球 ≥90%' },
full: ['3pt_lc','mid_lw','ft','3pt_lw','mid_top','3pt_top','ft','3pt_rw','mid_rw','3pt_rc','ft','3pt_top','mid_lc','3pt_lw','ft'],
est: { full: 75 },
career: { years: '1979–1992', fg: 49.6, tp: 37.6, ft: 88.6, tpm: 649,
          fact: '史上第一位單季 50-40-90（生涯兩度），三分大賽 1986–88 三連霸' },
basis: { text: '取材自 Bird 傳說級的自主投籃訓練量（每日數百顆跳投、賽前提早到場獨自投籃），全點位三分＋中距＋罰球的配置為本 App 設計，非本人菜單',
         source: 'Yahoo Sports', url: 'https://sports.yahoo.com/article/myself-one-thousand-shots-anywhere-135659181.html' }
```

輪次組成：三分 7 輪（70 球）／中距 4 輪（40 球）／罰球 4 輪（40 球）＝15 輪 150 球。

### 2.3 menus.js 檔頭

在既有查證註記區塊補一段 **2026-07-21 的查證紀錄**（照 §0 的來源與日期寫），
並註明「Iverson 未列入」的原因，避免日後有人again 想加。

## 3. `js/stats.js`：`evaluateSignature()` 新增兩個 case（＋測試）

```js
case 'brunson': {
  // 第四節接管：最後 3 輪合計命中率 ≥60%（不足 3 輪不成立）。
  if (rounds.length < 3) return false;
  const g = groupTotals(rounds.slice(-3), () => true);
  return g.pct !== null && g.pct >= 60;
}
case 'bird': {
  // 50-40-90：同一場 2 分 ≥50%、3 分 ≥40%、罰球 ≥90%（任一種沒出手就不成立）。
  const two = groupTotals(rounds, (r) => r.type === '2pt');
  const three = groupTotals(rounds, (r) => r.type === '3pt');
  const ft = groupTotals(rounds, (r) => r.type === 'ft');
  return two.pct !== null && two.pct >= 50
    && three.pct !== null && three.pct >= 40
    && ft.pct !== null && ft.pct >= 90;
}
```

`tools/test_stats.mjs` 兩個 case 各補正例＋反例（brunson：最後 3 輪剛好 60% 成立／
59% 不成立、不足 3 輪不成立；bird：三條全過成立／罰球 89% 不成立／完全沒有三分輪不成立）。

## 4. `js/store.js`：schema 11 → 12 補解鎖

```js
if (data.schema < 12) {
  // 階梯 13 → 15 關：brunson 插在 lillard 與 lin_taiwan 之間、bird 插在
  // curry_mvp 與 curry 之間。已解鎖 lin_taiwan（＝早已通過 lillard）→ 補
  // unlocked brunson；已解鎖 curry（＝早已通過 curry_mvp）→ 補 unlocked bird。
  // 只加不減，且只進 unlocked——新插入的關卡不能被這次改版直接送進 passed
  // （見 §4.1：passed 的回推要用「改版前的 13 關順序」，順序不能搞反）。
}
```

⚠️ 徽章與星星：`stars_full` 門檻由 39（13×3）變成 45（15×3），既有徽章**不收回**
（現行 `computeProgressBadges` 只加不減，確認即可，不用改碼）。`ladder_complete`
的末關仍是 `curry`，語意不變。

### 4.1 通過狀態改為明確記錄（實作中發現的規格缺陷，一併修掉）

**問題**：拿「schema 11、已全破 13 關」的舊資料跑 migration，`ladderProgress()` 會
回 **15/15 passed**、生涯分享卡的階梯條 15 格全亮——**包含玩家從沒打過的
brunson 與 bird**。

**根因**：「通過」原本不是存下來的狀態，而是推導出來的——`badges.js
ladderProgress()`、`sharecard.js buildLadderCells()`、`session.js` 階梯頁都用
同一套「**下一關已解鎖＝這關通過**」的判定。任何插在中間的新關，只要玩家早就
解鎖了它後面那一關，新關就會被自動判定成已通過（第 11 關 lin_taiwan 當初插入
時就有同樣的洞，只是沒被發現、也沒實際造成資料被送出去——這次 brunson／bird
一次插兩關且緊鄰階梯後半，才被瀏覽器實測抓到）。

**修法**：把「通過」改成明確記錄，不再推導。

- `progress.passed`（字串陣列，menu id）：`emptyProgress()` 新增此欄位；保底區塊
  補上型別防禦。
- 唯一寫入路徑是 `applyChallengeResult()`——`eligible && evalRes.pass` 時把
  `menu.id` 加進 `progress.passed`（`markPassed()`，去重、只加不減、冪等）。
  `confirmPace()` 補確認舊場次走的是同一條路徑，一樣會正確補記通過。
- `schema < 12` migration 裡，**先**用「改版前的 13 關順序」（`LADDER_PRE_M11`，
  不能用 `ladderMenus()`——那已經是插入新關後的 15 關順序，回推會把新關算成
  已通過）回推 `passed`，**再**做 brunson／bird 的補解鎖（只進 `unlocked`）。
  順序不能反：先補解鎖再回推，`LADDER_PRE_M11` 的最後一步（`curry` 沒有
  next）沒有影響，但如果改用 `ladderMenus()` 的 15 關順序回推，`lillard` 的
  next 會變成 `brunson`，而 migration 當下 `brunson` 還沒被判定為「早就通過」，
  於是 `lillard` 會被誤判成沒通過——這正是本節要修掉的那個洞。
- `badges.js ladderProgress()`、`sharecard.js buildLadderCells()`、
  `session.js currentLadderState()` 三處顯示層全部改讀 `progress.passed`（與
  現行 `ladderMenus()` 取交集，防禦改名／刪關卡留下的殘留 id），不再用
  `unlocked.includes(下一關)` 推導。
- `tools/check_ladder.mjs` 新增一項檢查：`emptyProgress()` 是否帶 `passed`
  欄位、上述三個顯示層是否還殘留舊推導寫法（`unlocked(Ids)?.includes(next`
  特徵樣式，抓到就 WARN）。

**鐵律（見 `docs/ADDING_A_TIER.md` §3）**：新插入的關卡只補 `unlocked`，
**絕不可**直接寫進 `passed`——`passed` 只能由玩家真正打過、通過 passRule 那一刻
才寫入。

## 5. 硬編關數文案（`check_ladder.mjs` 會逐一列出）

- `js/home.js` 兩處：`'13 關生涯階梯'`、`'13 關生涯之路，一關一關解鎖'`
- `index.html` 兩處：JSON-LD `featureList` 的 `"13 關生涯挑戰階梯"`、`<noscript>` 說明段

全部改成 **15 關**。

## 6. `sw.js`

`CACHE_NAME`：`shotledger-v31` → **`shotledger-v32`**。

## 7. 驗收（Fable 執行）

1. `node tools/check_ladder.mjs` 與 `node tools/test_stats.mjs` 兩支全綠
   （check_ladder 應顯示 15 關、0 FAIL）。
2. 階梯頁：15 張磁磚、刊號 11／14 位置正確；Lillard 的下一關指向 Brunson、
   Curry MVP 的下一關指向 Bird。
3. 新關開一場（DevTools 塞資料）：passRule、★1/★2/★3 判定正確；15 輪跑得完。
4. 生涯分享卡：階梯分段條 15 格、格寬仍可讀（`check_ladder` 的門檻是 <34px WARN、
   <24px FAIL；15 格約 55px，安全）。
5. 舊資料 migration：schema 11 的備份匯入後，已解鎖狀態正確補上、沒有任何徽章／
   星星被收回；`progress.passed` 只含改版前真正通過的關卡，brunson／bird 在
   `unlocked` 但不在 `passed`（見 §4.1）。
6. 首頁與 index.html 的「15 關」文案已同步。
