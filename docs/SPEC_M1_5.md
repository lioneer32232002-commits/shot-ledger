# SPEC M1.5 — 挑戰階梯＋逐球輸入＋簡易/完整版（2026-07-12）

前提：M1（docs/SPEC_M1.md）已完成並通過驗收。本規格在其上增量修改。
沿用所有 M1 慣例（vanilla JS、繁中、tokens、觸控目標、SPOTS 座標表）。

## 1. Schema v2（store.js 加 migration v1→v2）

```js
{
  schema: 2,
  sessions: [{ ..., 
    variant: "easy"|"full"|null,          // 新增；自由練習為 null
    rounds: [{ ..., seq: string|null }]   // 新增；逐球輸入時存 "1011010010"（長度=attempts），否則 null
  }],
  progress: {                              // 新增
    unlocked: ["lin"],                     // 已解鎖菜單 id；lin 預設解鎖
    best: { [menuId]: { pct:number, att:number, mk:number, date:ISO } },  // 各菜單完整版歷史最佳總命中率
    badges: []                             // 預留；全破 curry 時 push "ladder_complete"
  }
}
```
migration v1→v2：舊 rounds 補 `seq:null`、sessions 補 `variant:null`、建 progress 預設值。

## 2. menus.js 全面改版

```js
export const MENUS = [ /* 依下表，欄位：
  id, name, player, playerStatus:"active"|"retired"|null, tier:number|null,
  focus, inspired:bool, challenge:bool,
  passRule: [{type, minPct}] | null,   // 完整版單節達成 → 解鎖下一 tier
  passDesc: "中距 ≥50% 且罰球 ≥70%",
  easy: [spotId×6], full: [spotId×12], est:{easy:30, full:60}
*/ ];
```

### 挑戰階梯（challenge:true，tier 1→6，達成 passRule 解鎖 tier+1）

| tier | id | name | player(狀態) | passRule |
|---|---|---|---|---|
| 1 | lin | Jeremy Lin 起手式 | Jeremy Lin(退役) | 2pt≥50 且 ft≥70 |
| 2 | dirk | Dirk 中距大師 | Dirk Nowitzki(退役) | 2pt≥55 |
| 3 | allen | Ray Allen 三分入門 | Ray Allen(退役) | 3pt≥35 |
| 4 | klay | Klay 三分量產 | Klay Thompson(現役) | 3pt≥40 |
| 5 | lillard | Lillard 深三專項 | Damian Lillard(現役) | deep3≥30 |
| 6 | curry | Curry 終極試煉 | Stephen Curry(現役) | 3pt≥45 且 deep3≥35 → badge |

輪次序列（每輪 10 球）：

- lin easy: mid_lw, mid_top, mid_rw, paint, ft, ft
- lin full: mid_lc, mid_lw, mid_top, mid_rw, mid_rc, paint, ft, ft, mid_lw, mid_top, mid_rw, ft
- dirk easy: mid_lw, mid_top, mid_rw, mid_top, mid_top, ft
- dirk full: mid_lc, mid_lw, mid_top, mid_rw, mid_rc, mid_top, mid_lw, mid_top, mid_rw, mid_top, ft, ft
- allen easy: 3pt_lc, 3pt_rc, 3pt_lw, 3pt_rw, 3pt_top, ft
- allen full: 3pt_lc, 3pt_rc, 3pt_lw, 3pt_rw, 3pt_top, ft, 3pt_lc, 3pt_rc, 3pt_lw, 3pt_rw, 3pt_top, ft
- klay easy: 3pt_lc, 3pt_lw, 3pt_top, 3pt_rw, 3pt_rc, ft
- klay full: 3pt_lc, 3pt_lw, 3pt_top, 3pt_rw, 3pt_rc, ft, 3pt_lc, 3pt_lw, 3pt_top, 3pt_rw, 3pt_rc, ft
- lillard easy: 3pt_top, deep_l, deep_top, deep_r, 3pt_top, ft
- lillard full: 3pt_lw, 3pt_top, 3pt_rw, deep_l, deep_top, deep_r, 3pt_top, deep_l, deep_top, deep_r, ft, ft
- curry easy: 3pt_lc, 3pt_top, 3pt_rc, deep_top, ft, 3pt_lw
- curry full: 3pt_lc, 3pt_lw, 3pt_top, 3pt_rw, 3pt_rc, deep_l, deep_top, deep_r, 3pt_top, deep_top, ft, ft

### 非挑戰（challenge:false，不進階梯、永遠可玩）
- free（自由練習，不變）
- world 綜合巡迴：easy: paint, mid_lw, mid_top, mid_rw, 3pt_top, ft；
  full: paint, mid_lc, mid_lw, mid_top, mid_rw, mid_rc, 3pt_lc, 3pt_lw, 3pt_top, 3pt_rw, 3pt_rc, ft

掛名菜單描述**禁用 catch & shoot 等需要傳球者的字眼**（單人自投自撿）；
卡片小字：「依公開報導風格改編的靈感版本・單人可執行」。

## 3. 首頁改版（挑戰為主視覺）

1. 頂部 hero：目前關卡大卡（tier 徽章、球員名、現役/退役 tag、focus、
   個人最佳 %、離解鎖條件差多少）＋「開始挑戰」。
2. 階梯列：6 關橫向串（已解鎖=彩色可點、未解鎖=鎖頭+條件文字、
   已通過=✓）。點卡進入變體選擇。
3. 變體選擇 bottom sheet：**簡易 30 分・6 輪 60 球 ／ 完整 60 分・12 輪 120 球**，
   註明「解鎖條件只認完整版」。
4. 下方小卡區：自由練習、綜合巡迴（視覺降一級）。
5. 今日小結維持。

## 4. 輪次輸入：新增逐球模式

- 輸入卡右上 toggle：「快速｜逐球」（記住上次選擇，存 settings）。
- 快速＝M1 現有數字網格。
- **逐球**：一排籃球圖示（attempts 顆，10 顆時 5+5 兩行），依出手順序編號，
  點亮=進球（accent 色實心）、暗=沒進；下方即時顯示「進 n 顆」＋「完成本輪」鈕。
  存 `seq` 字串；makes 由 seq 導出。
- 修改已完成輪：有 seq 的輪進逐球編輯，無 seq 的輪進數字編輯。

## 5. 統計新增（stats.js 純函式＋測試）

- `roundCurve(rounds)` → 各輪命中率陣列（本節統計頁畫成迷你長條/折線，
  x=第幾輪，可看第幾輪開始掉）。
- `earlyLateSplit(rounds)` → 有 seq 的輪彙總：每輪前半 vs 後半出手的
  {att,mk}×2（前 5 球 vs 後 5 球；attempts 為奇數時中位球算前半）。
  無任何 seq 資料 → 回 null，UI 隱藏該區塊。
- `evaluatePassRule(session, rule)` → { pass:bool, detail:[{type, pct, need}] }。
  只對 variant==="full" 的挑戰節評估。
- `sessionPct(session)` → 總命中率（個人最佳用）。
- tools/test_stats.mjs 補測試：roundCurve、earlyLateSplit（含奇數 attempts、
  無 seq）、evaluatePassRule（過/不過/混合球種）。

## 6. 本節統計頁新增

順序：總覽 → 各球種（含近 7 日對比）→ **輪次曲線** → **前後段對比（有 seq 才顯示）**
→ 熱區圖 → 挑戰結果區（完整版挑戰節限定）：
- passRule 逐條 ✓/✗（實際 % vs 門檻）。
- 破個人最佳 → 「新紀錄！」高亮並更新 progress.best。
- 首次達成 → 解鎖動畫（全螢幕 confetti 級慶祝，CSS 實作，尊重
  prefers-reduced-motion）＋「已解鎖：{下一關名}」。badge 同理。

## 7. 其他

- history 列表與詳情顯示菜單名＋變體 tag（簡易/完整）。
- 設定頁資料統計加「已解鎖 n/6 關」。
- CSV 匯出加欄位：variant, seq。
- 「關於」區（設定頁尾展開）：射手等級界定標準三條（生涯三分 ≥40% /
  50-40-90 / 歷史三分命中數前列）＋靈感改編聲明。

## 7.5 挑戰判定與誠實機制（v3.2，實作必做）

- **時間不是門檻**：不做倒數、不因超時判敗。挑戰通過 = 完成該變體全部輪次
  且 passRule 達標。
- **挑戰資格（誠實機制）**：`isChallengeEligible(session)` 純函式——
  完整版總時長 ≥ 20 分且簡易版 ≥ 10 分，且輪與輪的中位間隔 ≥ 90 秒。
  不合格：節照存、進統計，但結束頁標「本節節奏低於真實練習下限，
  不列入解鎖評估」（中性文案）。變體選擇 sheet 上預先寫明此規則一行。
- **挑戰中即時進度**：session 頂部顯示 passRule 各條目前 % vs 門檻的迷你進度條。
- **未達成頁**：逐條差距換算成顆數（差 n 個百分點 ≈ 差 m 顆）；
  任一條差 ≤ 2 顆 → 顯示「就差一點！再挑戰一次」按鈕（一鍵重開同菜單同變體）。
- **異常輪確認**：makes === attempts 且 attempts ≥ 10 且該球種個人歷史平均
  <60%（或無歷史）→ confirm「{n} 中 {n}！確定嗎？」，確認才寫入。
- **出席/投量徽章（progress.badges）**：連續練習 3/7/30 天、
  累計 1,000/5,000/10,000 球——在結束頁與設定頁顯示。
- 挑戰開始（變體選擇 sheet 底部）固定一行：
  「挑戰靠自主誠實——這些數據是投給未來的你看的。」
- stats 測試補：isChallengeEligible（時長邊界、間隔中位數）、差距換算。

## 8. 驗收清單

1. v1 舊資料（手造一份塞 localStorage）→ 開 App 自動 migrate 到 v2 不炸、舊節可看。
2. lin 完整版打出 2pt≥50%＋ft≥70% → 解鎖動畫、dirk 變可玩；重整後仍解鎖。
3. 未達成 → 挑戰結果區逐條顯示差距，不解鎖。
4. 逐球輸入 10 顆點 7 顆 → makes=7、seq 正確；改輪重開逐球編輯狀態正確。
5. 快速/逐球混用的節：前後段對比只吃有 seq 的輪；全無 seq 時區塊隱藏。
6. 輪次曲線與各輪列表數字一致。
7. `node tools/test_stats.mjs` 全過；390px 無橫向捲動；無 console error。
