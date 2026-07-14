# SPEC M5.1：菜單動線差異化＋「節」用語全面改「練習」＋生涯累計卡

使用者回饋（2026-07-14，M5 上線後）：
1. 各關訓練菜單不能只是換名字——每關都要有自己的菜單才有趣（新加的 Klay 新秀 full 與 Allen 雄鹿 full 幾乎只差順序，被抓到）。Lillard 經確認**保留**（深三訓練考據最強）。
2. 總球數統計不明顯——「紀錄」跟「統計」都點過還是不清楚去哪看。
3. 「節」的用語很怪（節詳情、刪除此節）——換成一般人聽得懂的說法。

SW 版號本輪 v7 → **v8**。

---

## §1 六個階段菜單的動線差異化（只動 M5 新增的 6 關）

原則：**既有 6 關（lin/dirk/allen/klay/lillard/curry）一字不動**——它們的順序本身就是報導考據（Allen 固定順序儀式、Klay 五點循環、Curry 由近而遠），不能亂改。M5 新增的 6 關則各給一個「結構性招牌動線」（motif），從輪次結構就看得出差異，不是換點位清單而已。passRule／passDesc／career／basis 皆不動，只改 `easy`、`full`、`focus`。

| id | motif | focus 新文案 |
|---|---|---|
| lin_college | 課表式：禁區雙連發＋罰球穿插課表中段 | 課表式基本功：禁區雙連發起手，罰球穿插在課表中段 |
| lin_dleague | 左右翼折返（wing-to-wing 折返跑感） | 左右翼折返：中距兩翼來回穿梭，練體能也練穩定 |
| dirk_rookie | 罰球線頂單點反覆鑽研 | 新秀單點鑽研：罰球線頂反覆磨到熟 |
| allen_bucks | 底角雙連發專攻 | 底角專攻：兩側底角雙連發，練出底角殺手本能 |
| klay_rise | 同一點連兩輪、穩了才換點 | 新秀磨手感：同一點連兩輪，穩了才換點 |
| curry_mvp | 由近而遠三段爬坡（中距→三分→深三）循環 | 由近而遠爬坡：中距→三分→深三，一趟一趟拉遠 |

新輪次序列（sample 檢核：full 版中 passRule 球種輪數 ×10 ≥30 球，皆符合）：

```
lin_college   (2pt≥45)
  easy: ['paint','paint','mid_top','ft','mid_lw','ft']
  full: ['paint','paint','mid_lw','mid_top','ft','paint','mid_rw','mid_top','ft','paint','mid_lw','ft']
        （2pt 9 輪 90 球；ft 3 輪，穿插不收尾）

lin_dleague   (2pt≥48 且 ft≥65)
  easy: ['mid_lw','mid_rw','mid_lw','mid_rw','ft','ft']
  full: ['mid_lw','mid_rw','mid_lw','mid_rw','ft','paint','mid_rw','mid_lw','mid_rw','mid_lw','ft','ft']
        （2pt 9 輪 90 球；ft 3 輪 30 球——ft 有 rule，樣本必須 ≥30）

dirk_rookie   (2pt≥52)
  easy: ['mid_top','mid_top','mid_lw','mid_top','mid_rw','ft']
  full: ['mid_top','mid_top','mid_lw','mid_top','mid_top','ft','mid_rw','mid_top','mid_top','paint','mid_top','ft']
        （mid_top×7 單點鑽研；2pt 10 輪 100 球）

allen_bucks   (3pt≥32)
  easy: ['3pt_lc','3pt_lc','3pt_rc','3pt_rc','mid_top','ft']
  full: ['3pt_lc','3pt_lc','3pt_rc','3pt_rc','mid_top','ft','3pt_rc','3pt_lc','mid_lw','mid_rw','ft','ft']
        （三分 6 輪 60 球、全在底角）

klay_rise     (3pt≥38)
  easy: ['3pt_lw','3pt_lw','3pt_top','3pt_top','3pt_rw','ft']
  full: ['3pt_lw','3pt_lw','3pt_top','3pt_top','3pt_rw','3pt_rw','ft','3pt_lc','3pt_lc','mid_top','ft','ft']
        （三分 8 輪 80 球、兩兩成對）

curry_mvp     (3pt≥42)
  easy: ['mid_top','3pt_top','deep_top','3pt_lw','3pt_rw','ft']
  full: ['mid_top','3pt_lw','deep_l','mid_top','3pt_top','deep_top','mid_top','3pt_rw','deep_r','3pt_top','ft','ft']
        （近→遠爬坡 ×3 趟；三分 4 輪 40 球、深三 3 輪）
```

差異化總覽（12 關動線一句話，寫進 SPEC 存查，不用進 UI）：
1 哈佛=禁區雙連發課表、2 發展聯盟=左右折返、3 起手式=環繞中距（原）、4 Dirk 新秀=單點鑽研、5 Dirk 大師=頂+45°量產（原）、6 Allen 雄鹿=底角雙連發、7 Allen 入門=五點固定順序（原）、8 Klay 新秀=同點連兩輪、9 Klay 量產=五點快掃（原）、10 Lillard=深三混合（原）、11 Curry MVP=近遠爬坡、12 Curry 試煉=全點位綜合（原）。

注意：進行中的舊 session 不受影響（rounds 已存自己的點位）；只有新開的練習吃新序列。

## §2 「節」→「練習」用語（只改使用者可見文案，程式內部命名 session/節 註解不動）

- js/app.js:162 「已累積 N 節尚未備份」→「已累積 N 次練習尚未備份」
- js/app.js:202 「目前共 N 節 / M 輪」→「目前共 N 次練習 / M 輪」
- js/history.js:49 「投完第一節就會出現在這裡」→「完成第一次練習就會出現在這裡」
- js/history.js:103 頁標「節詳情」→「練習詳情」
- js/history.js:132 「確定要刪除此節？再按一次刪除」→「確定要刪除這次練習？再按一次刪除」
- js/session.js:794 「確定放棄整節？」→「確定放棄這次練習？」
- js/session.js:1248 「本節表現相當於…」→「這次練習相當於…的過關水準」
- js/session.js:1281 「本節節奏低於真實練習下限」→「這次練習節奏低於真實下限」
- js/session.js:1373 「這節沒有任何紀錄」→「這次練習沒有任何紀錄」
- js/session.js:1386 「刪除此節」→「刪除這次練習」
- js/statspage.js:188 「今天投一節吧」→「今天練一次吧」
- js/statspage.js:422 「多練幾節完整版」→「多練幾次完整版」
- js/statspage.js:461 「輪次曲線（跨節平均）」→「輪次曲線（多次練習平均）」
- 掃一次全部 js 檔確認沒有漏網的使用者可見「節」（註解與變數名不在此列）。

## §3 統計頁生涯累計卡（總球數一眼可見）

- 位置：統計頁最上方（page-header 之下、週目標卡之上）——回答「總球數去哪看」：就在統計第一屏。
- 內容：
  - 標題列「生涯累計」
  - 三個大數字（沿用 .summary__totals 的視覺節奏做一張新卡 .lifetime-card）：總投／總中／命中率（pct null 顯示「—」）
  - 小字一行：「N 次練習・M 輪」（N＝endedAt!==null 的 session 數；M＝所有輪次總數，含進行中）
- 資料：stats.js 現有 lifetimeTotals()；輪數與練習次數直接在 statspage 內算（純讀取）。
- 數字用千分位（session.js 的 formatThousands 已 export，直接 import 復用）。
- 沒有任何紀錄時照樣顯示（0 投 / 0 中 /「—」），不做空狀態隱藏——這張卡本身就是「去哪看總球數」的答案。
- 深淺色都用 tokens 變數；練球首頁今日小結的累計小字保留不動。

## §4 驗收清單

1. `node tools/test_stats.mjs` 83 項全過（本輪不動 stats.js）。
2. 菜單完整性 node 檢核（12 關、6/12 輪、點位 id 合法、rule 球種樣本 ≥30）。
3. 快取三層清理後，瀏覽器逐關開變體 sheet 抽查新動線輪數與順序。
4. 統計頁：生涯累計卡在最上方、數字正確（與設定頁「N 次練習 / M 輪」一致）、深淺色。
5. 全 App 搜不到使用者可見的「節」字（devtools 全文掃 body.innerText）。
6. sw.js CACHE_NAME v7 → v8；push 後 Actions 綠燈、線上抽驗。
