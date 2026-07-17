# SPEC M7：誠實機制 2.0＋台灣時期關＋三星制（三包總結）

> 本文件是事後總結（M7 三包分三天上線，spec 原散在對話與 docs/HANDOFF_20260716.md），
> 留檔供後續接手快速理解現行規則。上線 commit：
> 誠實機制 2.0＝`7cda3c1`（SW v22、schema 8）、台灣時期關＝`d31f9e7`（SW v23、schema 9）、
> 三星制＝本包（SW v24、schema 10）。

## 第一包：誠實機制 2.0（schema 8）

唯一標準＝**輪與輪中位間隔**（`stats.paceAssessment`），總時長門檻已廢除：

- 中位 ≥60 秒 → `auto`：自動列入解鎖評估
- 30〜60 秒 → `ask`：結算時問一次「這是真實練習嗎」（例如有人幫撿球），
  回答寫進 `session.paceConfirmed`，永遠只問一次；答「列入」走
  `store.confirmPace` → 與正常結算完全相同的 `applyChallengeResult` 路徑
- <30 秒 → `out`：不列入（數據照存統計）

配套：挑戰菜單刪掉簡易版（綜合巡迴保留 easy；舊 easy 場次紀錄照常顯示）、
PB 標示球數、PB date 用 `session.endedAt`（不能改回 `new Date()`——
confirmPace 補確認舊場次時日期會錯）。v8 migration 用新誠實規則重算歷史。

## 第二包：第 11 關 Lin 台灣時期（schema 9）

- 新關卡 `lin_taiwan`（tier 11），階梯 12→13 關；新增 `layup` 球種
  （`layup_l`／`layup_r` 點位）。passRule：深 3 ≥32% 且上籃 ≥70%。
- 數據依 2024–25 TPBL 例行賽，雙來源（TPBL 官網球員頁＋2024–25 國王賽季維基）。
  **2024 PLG FMVP 是李愷諺不是林書豪**——文案不得寫錯（menus.js 頭部有警語）。
- 第 1 關 lin_college 同步新手化（6 輪、passRule 45%）。v9 migration 補階梯順位。

## 第三包：三星制（schema 10、本包）

每關三顆星，**只有 ★1 對應的 passRule 影響解鎖（解鎖邏輯零改動）**；
星星只由「`isChallengeEligible` ＋ 完整版」場次計入，一經取得永不失去（OR 合併）。

### 判定（js/stats.js）

- **★1 解鎖星**＝`evaluatePassRule` pass（現有門檻）
- **★2 簽名星**＝每關專屬規則（`evaluateSignature`，13 關 switch 全表；
  防禦原則：場次資料缺規則所需結構——缺點位、無深三輪、無連兩輪同點——一律不成立）
- **★3 高標星**＝passRule 每條 minPct **+10pp** 全數達成
- 入口 `evaluateStars(menu, session)`：純函式，不看 eligibility（由呼叫端把關）；
  輪次先依 `at` 排序再判定，新舊菜單版本的場次都能正確評估

13 關簽名星文案存於 menus.js 各關 `signature: { label, desc }`；
判定邊界以 `evaluateSignature` 實作為準（驗收時修過一處：curry 雙修＝
門檻 +5pp ＝ 3 分 ≥50% 且深 3 ≥40%）。

### 進度與回溯（js/store.js）

- `progress.stars = { [menuId]: { unlock, signature, high } }`
- `applyChallengeResult`：eligible 時 `evaluateStars` → OR 進 stars，
  回傳加 `stars`（合併後）＋ `newStars`（本次新翻 true 的旗標，供結算頁
  「新獲得」提示）；不 eligible 時兩欄位省略。冪等：同場重跑 newStars 全 false。
  confirmPace 共用此路徑，補確認也會發星。
- **v10 migration**：掃全部「挑戰＋完整版＋已結束＋合格」歷史場次回溯發星。
  migration 原則不變：只加不減（解鎖、徽章、星星永不收回）。

### 顯示（js/session.js＋js/app.js＋css/app.css）

- 共用星列 `starRowHtml`（`.star-row`，未拿的星同一個 ★ 字符用邊框色，不畫 ☆ 避免字重跳動）
- 階梯磁磚：關名下方三顆 10px 小星；已通過關的亮星用 success 色、其餘 accent；
  **鎖定磁磚不顯示星**（含已回溯發星但未解鎖的關——星照算進總數，磁磚不露）
- 變體 sheet：門檻區三行「★ 過關門檻／★★ {label}：{desc}／★★★ 高標」
  （高標由 passRule +10pp 動態生成，「且」格式與 passDesc 一致：前空格後不空格）
- 結算頁挑戰結果：三星狀態列（顯示**本關累積**星星，justFinished.stars 優先、
  歷史檢視退回 progress.stars，皆無則整列不畫）＋「新獲得 ★★ 簽名星：課表收官」
  （challenge-note--record 語言，只在剛結算時出現）
- Hero card：關卡編號旁「★ n/3」，0 顆不顯示（乾淨為準）
- 設定頁資料狀態：「星星：X / Y」（Y＝關數×3 動態算，現為 39）

### 部署卡關記錄（2026-07-17，重要教訓）

第一、二包 push 後 CI 其實一直失敗——`tools/test_stats.mjs` 有一條誠實機制 1.0
的時長門檻測試沒同步更新，**Deploy workflow 測試失敗就不部署，線上停在 v21**，
而 HANDOFF_20260716 誤寫「d31f9e7 已部署」。`6ad7f75` 把測試更新為 2.0 規則
（＋補三星制測試，共 88 條），三包才隨 v24 一起真正上線。此後鐵律：
改 stats.js 行為必同步測試；push 後跑 `gh run watch`；最終以線上
`sw.js` 的 `CACHE_NAME` 為準。

### 驗收紀錄（2026-07-17）

schema 9 含歷史達標場次 → v10 回溯發星正確（含三場 OR 合併、跨場湊滿三星）；
舊 12 輪 lin_college 場次簽名星判定不炸不誤發；migration 不動 unlocked；
applyChallengeResult 冪等＋解鎖照舊；4 關實測簽名星；變體 sheet／磁磚／結算／
歷史詳情／設定頁全數渲染正確；深淺色 token 三態驗過；console 無錯誤。
