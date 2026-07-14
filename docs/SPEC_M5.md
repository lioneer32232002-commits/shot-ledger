# SPEC M5：階梯擴充 12 關＋每輪達標預估＋分享卡預設底圖

使用者三項需求（2026-07-14）：
1. 分享卡預設不要白底（白色命中率數字會被吃掉）——內建 5 張籃球照片當預設底圖，也可用自己的照片。
2. 挑戰階梯 6 關太少、難度跳太快——球員拆「生涯階段」，Lin 拆大學／發展聯盟／NBA 三階段，其他球員也拆，共 12 關。
3. 每輪先看「預估要進幾球才達標」，逐輪動態更新；判定已不可能達標時，可選投完或提前結束，提前結束的球照樣計入統計。

鐵律不變：純 vanilla JS、無 build step、菜單數據雙來源查證、繁中文案、深淺色都要驗、SW 版號遞增（本輪 v6 → **v7**）。

---

## §1 挑戰階梯擴充：6 關 → 12 關（球員生涯階段制）

### 1.1 設計原則

- **既有 6 個菜單的 id、passRule、輪次序列一字不動**（`lin`/`dirk`/`allen`/`klay`/`lillard`/`curry`），使用者的解鎖進度、個人最佳、歷史節通通不受影響。
- 新增 6 個「階段菜單」插進階梯，難度階梯平滑化。新 id：`lin_college`、`lin_dleague`、`dirk_rookie`、`allen_bucks`、`klay_rise`、`curry_mvp`。
- 每個階段有自己的 career 面板數據（該階段的真實數據，雙來源查證，見 §1.4）與菜單輪次（App 依該階段風格設計，沿用 inspired 聲明）。

### 1.2 新階梯（tier 1→12）

| tier | id | 名稱 | short | passRule | passDesc |
|---|---|---|---|---|---|
| 1 | lin_college | Jeremy Lin 哈佛時期 | Lin 哈佛 | 2pt ≥45% | 2 分 ≥45% |
| 2 | lin_dleague | Jeremy Lin 發展聯盟 | Lin 發展聯盟 | 2pt ≥48% 且 ft ≥65% | 2 分 ≥48% 且罰球 ≥65% |
| 3 | lin | Jeremy Lin 起手式（不變） | Lin 起手式 | （不變）2pt ≥50% 且 ft ≥70% | （不變） |
| 4 | dirk_rookie | Dirk 新秀課表 | Dirk 新秀 | 2pt ≥52% | 2 分 ≥52% |
| 5 | dirk | Dirk 中距大師（不變） | Dirk 中距 | （不變）2pt ≥55% | （不變） |
| 6 | allen_bucks | Ray Allen 雄鹿時期 | Allen 雄鹿 | 3pt ≥32% | 3 分 ≥32% |
| 7 | allen | Ray Allen 三分入門（不變） | Allen 三分 | （不變）3pt ≥35% | （不變） |
| 8 | klay_rise | Klay 新秀跳投 | Klay 新秀 | 3pt ≥38% | 3 分 ≥38% |
| 9 | klay | Klay 三分量產（不變） | Klay 量產 | （不變）3pt ≥40% | （不變） |
| 10 | lillard | Lillard 深三專項（不變） | Lillard 深三 | （不變）deep3 ≥30% | （不變） |
| 11 | curry_mvp | Curry MVP 球季 | Curry MVP | 3pt ≥42% | 3 分 ≥42% |
| 12 | curry | Curry 終極試煉（不變） | Curry 試煉 | （不變）3pt ≥45% 且 deep3 ≥35% | （不變） |

既有菜單只改 `tier` 欄位數字（lin 1→3、dirk 2→5、allen 3→7、klay 4→9、lillard 5→10、curry 6→12），其餘欄位禁止改動。

### 1.3 新階段的輪次序列（App 設計，est 一律 {easy:30, full:60}）

```
lin_college  focus：禁區＋近距中距的大學基本功，罰球收尾
  easy: ['paint','mid_top','paint','mid_lw','ft','ft']
  full: ['paint','mid_lw','mid_top','mid_rw','paint','ft','paint','mid_lw','mid_top','paint','ft','ft']

lin_dleague  focus：中距＋禁區混合，發展聯盟的生存強度
  easy: ['paint','mid_lw','mid_rw','paint','ft','ft']
  full: ['mid_lw','mid_top','mid_rw','paint','paint','ft','mid_lw','mid_top','mid_rw','paint','ft','ft']

dirk_rookie  focus：45°＋罰球線頂中距的新秀起步
  easy: ['mid_lw','mid_top','mid_rw','paint','mid_top','ft']
  full: ['mid_lw','mid_top','mid_rw','mid_top','paint','ft','mid_lw','mid_top','mid_rw','paint','ft','ft']

allen_bucks  focus：雄鹿時期的三分開荒，五點三分＋中距補強
  easy: ['3pt_lc','3pt_rc','3pt_top','mid_top','ft','ft']
  full: ['3pt_lc','3pt_rc','3pt_lw','3pt_rw','3pt_top','ft','mid_lw','mid_top','mid_rw','3pt_top','ft','ft']

klay_rise    focus：新秀年的接球跳投雛形，三分五點＋中距串接
  easy: ['3pt_lw','3pt_top','3pt_rw','mid_top','3pt_top','ft']
  full: ['3pt_lc','3pt_lw','3pt_top','3pt_rw','3pt_rc','ft','mid_lw','mid_top','mid_rw','3pt_top','ft','ft']

curry_mvp    focus：MVP 球季的全點位三分量產＋深三初探
  easy: ['3pt_lw','3pt_top','3pt_rw','deep_top','3pt_top','ft']
  full: ['3pt_lc','3pt_lw','3pt_top','3pt_rw','3pt_rc','deep_top','3pt_lw','3pt_top','3pt_rw','deep_top','ft','ft']
```

檢核：每個菜單的 full 版中，passRule 涉及球種的輪數 × 10 球要 ≥30 球（樣本量），上表皆符合。

### 1.4 career 面板：階段數據（雙來源查證，回填處）

career 物件新增選填欄位 `label`（面板 caption 文字）；`renderCareerHtml` 的 caption 由寫死的
`NBA ${career.years}` 改為 `career.label || ('NBA ' + career.years)`。既有 6 個菜單不加 label、輸出不變。

新階段數據（2026-07-14 雙來源查證完成，全數一致無 CONFLICT；查證紀錄註解比照現有格式寫進 menus.js，逐條附兩個來源 URL）：

| id | label | years | fg | tp | ft | tpm | 來源（兩個獨立） |
|---|---|---|---|---|---|---|---|
| lin_college | 哈佛 2006–10 | 2006–10 | 48.1 | 33.3 | 73.3 | 108 | sports-reference.com/cbb/players/jeremy-lin-1.html ＋ basketball.realgm.com/player/Jeremy-Lin/NCAA/10168/Career/By_Season/Total |
| lin_dleague | 發展聯盟 2010–11 | 2010–11 | 47.7 | 38.9 | 71.8 | 14 | statscrew.com/minorbasketball/stats/p-linjer001 ＋ basketball.realgm.com/player/Jeremy-Lin/D-League/10168/2011/By_Season/Total/Regular_Season |
| dirk_rookie | NBA 1998–99 新秀季 | 1998–99 | 40.5 | 20.6 | 77.3 | 14 | statmuse.com/nba/ask/dirk-nowitzki-rookie-season-stats ＋ espn.com/nba/player/stats/_/id/609/dirk-nowitzki |
| allen_bucks | NBA 公鹿時期 1996–2003 | 1996–2003 | 45.0 | 40.6 | 87.9 | 1051 | statmuse.com/nba/ask/ray-allen-career-stats-with-the-milwaukee-bucks ＋ landofbasketball.com/nba_players_stats/ray_allen_tot.htm |
| klay_rise | NBA 2011–12 新秀季 | 2011–12 | 44.3 | 41.4 | 86.8 | 111 | espn.com/nba/player/stats/_/id/6475/klay-thompson ＋ statmuse.com/nba/ask/klay-thompson-rookie-season-stats |
| curry_mvp | NBA 2015–16 MVP 球季 | 2015–16 | 50.4 | 45.4 | 90.8 | 402 | espn.com/nba/player/stats/_/id/3975/stephen-curry ＋ statmuse.com/nba/ask?q=steph+curry+stats+2015-2016+season |

fact 一句（皆有查證來源，寫進 menus.js 註解）：
- lin_college：「大四獲教練團一致票選 All-Ivy 第一隊的哈佛控衛」（gocrimson.com/sports/mens-basketball/roster/jeremy-lin/2981）
- lin_dleague：「在雷諾大角羊場均 18 分，入選 Showcase 第一隊後被勇士召回」（espn.com/nba/news/story?page=Lin-110316）
- dirk_rookie：「自陳『浪費掉的一年』，隔季轉型大爆發的起點」（sports.yahoo.com/article/kind-wasted-dirk-nowitzki-admitted-173823100.html）
- allen_bucks：「2001 年三分大賽決賽連中十球逆轉封王」（si.com/nba/bucks/old-school/revisiting-the-time-when-a-milwaukee-buck-won-the-three-point-contest）
- klay_rise：「新秀季三分命中率 41.4% 領先全體新秀，入選最佳新秀陣容」（wsucougars.com/sports/2012/5/22/207871511.aspx）
- curry_mvp：「史上唯一全票 MVP，單季 402 顆三分至今無人接近」（si.com/nba/2016/05/10/stephen-curry-unanimous-mvp-golden-state-warriors）

lin_college 為 NCAA 四年生涯合計、lin_dleague 為 Reno Bighorns 2010–11 例行賽（20 場）；career 面板欄位標籤沿用現有（投籃 FG／三分 3P／罰球 FT／三分命中），caption 用 label 呈現聯盟脈絡。playerStatus 隨球員本人（lin 系列 retired、dirk/allen 系列 retired、klay/curry 系列 active、lillard active）。

basis 欄：lin_college / lin_dleague 用研究 agent 找到的可靠報導；dirk_rookie 沿用現有 Dirk 的 ESPN 2015 來源、allen_bucks 沿用 Boston Globe 2008（文字註明「同一定點儀式的低強度入門改編」）、klay_rise 沿用 BR 2014、curry_mvp 沿用 ESPN 2018，文字各自改寫成該階段脈絡。

### 1.5 程式面配套

- `js/session.js`：
  - `renderHeroCard` 的「第 ${menu.tier} 關 / 6」→ 「/ ${ladderMenus().length}」動態。
  - `computeAndApplyChallengeResult` 的 `menu.id === 'curry'` 判斷 → 動態取 `ladderMenus()` 最後一關的 id（全破徽章跟著最後一關走）。
  - 其餘（ladder tile 橫捲、bignum padStart(2)）天然支援 12 關，不用改。
- `js/store.js`：schema **v4 → v5** migration：
  1. `LADDER_V5 = ['lin_college','lin_dleague','lin','dirk_rookie','dirk','allen_bucks','allen','klay_rise','klay','lillard','curry_mvp','curry']`（註解註明必須與 menus.js 的 tier 順序一致）。
  2. 找出 `progress.unlocked` 中位於 LADDER_V5 的最高 index，把 index ≤ 它的全部 id 補進 unlocked（去重）。這保證舊資料「已通過」的關卡在新階梯上仍顯示已通過（passed 判定靠「下一關已解鎖」）。
  3. 保證 `lin_college` 一定在 unlocked（新的第 1 關基礎解鎖）。
  4. `settings.cardBg = 'bg1'`（§3 用）。
  - 保底段：`unlocked` 基礎保底由 push('lin') 改為 push('lin_college')；補 `settings.cardBg` 形狀保底（合法值 'paper'|'bg1'..'bg5'，非法一律回 'bg1'）。
  - `emptyProgress()` 改為 `{ unlocked: ['lin_college'], ... }`；`emptyState().settings` 加 `cardBg: 'bg1'`。

---

## §2 每輪達標預估＋不可達標的收尾選擇

### 2.1 純函式（js/stats.js，須進 tools/test_stats.mjs）

```js
/**
 * 挑戰達標預估：以「已完成輪的實際數字＋未來輪每輪 10 球」估算每條 passRule
 * 還需要進幾球、以及數學上是否仍可能達標。
 * @param {Array} rounds 已完成輪（session.rounds）
 * @param {Array<{type,minPct}>} rules menu.passRule
 * @param {Array<string>} futureTypes 剩餘輪次的球種陣列（呼叫端由 seqList 剩餘段 map 成 type）
 * @param {number} [futureAttempts=10] 未來每輪的假設球數
 * @returns {{feasible:boolean, detail:Array}|null} rules 空陣列回傳 null
 */
export function challengeForecast(rounds, rules, futureTypes, futureAttempts = 10)
```

detail 每條 rule：
```
{ type, need,            // 門檻 %
  att, mk,               // 該球種已投/已中
  futureAtt,             // 該球種剩餘輪數 × futureAttempts
  plannedAtt,            // att + futureAtt
  needMakes,             // ceil(need/100 × plannedAtt)，沿用 pctGapToShots 的 -1e-9 epsilon 防浮點進位
  remainingNeed,         // max(0, needMakes - mk)
  feasible,              // remainingNeed <= futureAtt
  nextRoundNeed }        // futureTypes[0]===type 且 remainingNeed>0 時：
                         //   min(futureAttempts, ceil(remainingNeed / 該球種剩餘輪數))；否則 null
```
整體 `feasible = detail.every(d => d.feasible)`。

邊界：futureTypes 為空（全部輪次已投完）→ futureAtt=0，feasible 純看 mk 是否已達 needMakes；rounds 為空→ att/mk 為 0，全靠未來輪估。

測試案例（加進 tools/test_stats.mjs，維持全過）：
1. 開局預估：rounds=[]、rule 2pt≥50%、future 4 輪 2pt ＝ plannedAtt 40、needMakes 20、nextRoundNeed 5。
2. 進度落後但可追：needMakes 邊界、ceil 進位、nextRoundNeed 平均分攤上限 10。
3. 不可達標：remainingNeed > futureAtt → feasible false。
4. 已達標鎖定：mk ≥ needMakes → remainingNeed 0、nextRoundNeed null。
5. 多條 rule（curry 型）一條可行一條不可行 → 整體 false。
6. epsilon 案例：need 55%、plannedAtt 120 → needMakes 66（不得因浮點變 67）。
7. futureTypes 空陣列的收尾判定。

### 2.2 UI（js/session.js，只在「挑戰菜單＋完整版」顯示，跟現有「挑戰進度（即時）」同條件）

- 呼叫端組 `futureTypes`：`seqList.slice(rounds.length).map(id => getSpot(id).type)`；futureAttempts 固定 10（與菜單設計一致；使用者臨時改實投數屬例外，預估文案帶「約」字）。
- **rule bar 下加預估行**（每條 rule 一行小字）：
  - 未達標且可行：「還需 X 球（剩 Y 球額度）」
  - `remainingNeed === 0`：「已達標 ✓」（success 色）
  - 不可行：「已無法達標」（danger 色）
- **輪次輸入區 headline** 追加 chip：目前輪球種對應到 rule 且 `nextRoundNeed !== null` 時顯示「本輪至少 N 球」；多條 rule 同球種取最大 nextRoundNeed。
- **不可達標橫幅**（整體 feasible === false 時，插在「挑戰進度（即時）」下方）：
  - 標題「依剩餘輪次估算，這次挑戰已無法達標」
  - 說明「紀錄都會保留、照樣計入統計——可以把剩下的輪次投完，或現在結束」
  - 兩顆鈕：`繼續投完`（次要鈕：收合橫幅，本節不再自動彈出）／`提前結束並結算`（主要鈕：呼叫現有 finishSession()，走正常結算與統計）
  - 模組層旗標 `forecastBannerDismissed`，startSession / resumeSession 重設 false；收合後 rule bar 預估行仍顯示「已無法達標」。
  - 橫幅一列兩鈕、全寬主鈕 ≤1 的層級規則照 M4.4。
- menuComplete（完成面板）狀態下不顯示預估（面板本來就取代輸入區）。
- 自由練習／world／簡易版完全不顯示（無 passRule 評估）。

---

## §3 分享卡預設底圖（內建 5 張照片）

### 3.1 素材（已完成）

`assets/cardbg/bg1.jpg ~ bg5.jpg`，皆 1080×1350（卡片同尺寸，drawCoverImage 零裁切）、JPEG q80，共約 790KB。
來源：Unsplash（Unsplash License，可自由商用、毋須署名；bg1=Markus Spiske 室內暗色球網、bg2=Tom Briskey 剪影、bg3=Tom Briskey 戶外框、bg4=Jeremy Wallace 球場地面、bg5=Andy Zhou 藍天球框）。
bg1 最暗、白字對比最佳 → 全域預設。

### 3.2 行為

- **預設底圖 = settings.cardBg（預設 'bg1'）**，開分享 sheet 即以該底圖渲染照片模式（沿用既有 photoImg 暗化＋亮色字 palette，drawCard 不用改）。
- sheet 內新增**底圖選擇列**（水平縮圖，觸控目標 ≥44px）：
  `[紙感] [bg1] [bg2] [bg3] [bg4] [bg5] [＋自己的照片]`
  - 紙感 tile：淺米色方塊＋「紙感」字樣（對應現在的無照片版）。
  - bgN tile：直接用 `assets/cardbg/bgN.jpg` 縮圖（CSS object-fit: cover）。
  - 「＋自己的照片」tile 取代現有「用自己的照片當背景」按鈕與「移除照片」按鈕（選擇列就是唯一切換入口，選了別的 tile 即等於移除）。自訂照片選定後，該 tile 顯示照片縮圖並處於選中態；重點一下可重新選檔。
  - 選中 tile 用 accent ring 標示。
- **持久化**：選 紙感/bgN 時寫回 `store.setCardBg(state, value)`（新 setter，合法值 'paper'|'bg1'..'bg5'）；自訂照片不落地、不改 settings（跟現在一樣只活在 sheet 閉包）。
- **載入時序**：開 sheet 先同步畫（紙感或已快取的底圖），bundled 底圖用 `new Image()` 載入，onload 重繪。載入失敗（極端：離線又沒快取）→ 靜默退回紙感並取消該 tile 選中態。
- sheet 開啟當下就 preload 全部 5 張縮圖（它們同時是選擇列縮圖，SW 快取後皆本地）。

### 3.3 快取

- `sw.js` CORE 加入 5 張 `assets/cardbg/bgN.jpg`，`CACHE_NAME` **v6 → v7**。

---

## §4 驗收清單（Fable 必跑）

1. `node tools/test_stats.mjs` 全過（含新 forecast 案例）。
2. 本機 QA 前先做快取三層清理（HANDOFF 方法論 #3）。
3. 階梯：12 關橫捲順暢、鎖態條件文案正確；「第 X 關 / 12」；hero 面板各階段 career caption 正確。
4. 遷移：手動塞 v4 localStorage（unlocked=['lin','dirk']）→ reload → lin_college/lin_dleague/dirk_rookie 補解鎖、lin 顯示已通過、**目前關卡=dirk（祖父條款：舊用戶不因新插關被踢回去重打，新插入且低於原進度的關卡視同已通過、可自由重打）**；全新用戶只解鎖 lin_college、目前關卡=lin_college。
5. 預估：開一節 curry full，模擬落後 → 橫幅出現；「繼續投完」收合後不再彈；「提前結束並結算」進結算頁且該節在紀錄／統計都在。快速讀幾輪驗 nextRoundNeed 數字。
6. 分享卡：預設開啟即 bg1 照片版；六個 tile＋自訂照片切換各重繪正確；重開 sheet 記住上次選擇；**垂直帶掃描**（左右分欄）照 M4.3/4.4 方法論跑 2/4 球種 × bg1/紙感。
7. 深淺色兩套、觸控目標 ≥44px、sw.js 版號已遞增、Actions 部署綠燈後線上抽驗。
