# 新增一關挑戰階梯：標準流程（SOP）

> 加一關要動的東西散在七八個檔案，漏改任何一處**都不會噴錯，只會安靜地少一塊**
> （簽名星永遠拿不到、首頁還寫著舊關數、老使用者卡在新插入的關卡前面）。
> 這份文件是唯一入口；機器驗得出來的部分已經寫成 `tools/check_ladder.mjs`。
>
> 流程：**先跑 §0 查證 → 依 §1〜§8 改 → §9 兩支檢查全綠 → §10 瀏覽器驗收 → §11 進版控**。

---

## 0. 前置：資料查證（不可跳過）

專案鐵律（沿用 flight-deck 出題紀律）：**球員生涯數據與訓練菜單出處一律雙來源交叉
核對，不得憑印象寫**。

1. 決定這一關是誰的哪個階段（例：`lin_taiwan` = 林書豪 2024–25 TPBL 國王時期）。
2. 生涯／階段數據（`career` 的 `fg` / `tp` / `ft` / `tpm`）：找**兩個獨立來源**核對一致
   （StatMuse、ESPN、Basketball-Reference、RealGM、聯盟官網…）。兩邊對不起來就不寫，
   或改用對得起來的統計口徑。
3. 菜單靈感（`basis`）：必須指得出一篇**公開報導**，`basis.text` 要誠實說明「取材自
   ⋯⋯、定點配置為本 App 設計，非本人菜單」。
4. 把兩個來源網址與核對日期補進 `js/menus.js` 檔頭的查證註記區塊。
   ⚠️ 既有教訓：2024 PLG FMVP 是**李愷諺**不是林書豪——名人事蹟同樣要查證。

---

## 1. `js/menus.js`：新增菜單物件

插進 `MENUS` 陣列，**放在正確的 tier 位置**（陣列順序不影響邏輯，但照 tier 排好讀起來才對）。

必填欄位（缺一個 `check_ladder` 就 FAIL）：

| 欄位 | 說明 |
|---|---|
| `id` | 小寫底線，之後所有地方都用它當 key，**上線後不要改** |
| `name` / `short` | 全名／磁磚用短名 |
| `player` / `playerStatus` | `'active'`｜`'retired'` |
| `tier` | 連號整數，**插在中間就要把後面所有關的 tier 全部 +1** |
| `challenge: true`、`inspired: true` | |
| `focus` | 一句話講這關在練什麼 |
| `passRule` | `[{type, minPct}]`；type 必須在 `full` 序列裡真的出現得到 |
| `passDesc` | 給人看的門檻描述 |
| `signature: {label, desc}` | ★2 簽名星的名稱與說明（規則本身寫在 §2） |
| `full` | 輪次序列＝`court.js` 的 spot id 陣列 |
| `est: {full}` | 預估分鐘 |
| `career` / `basis` | §0 查證結果 |

設計注意：
- 門檻 `minPct + 10` 要 ≤100（★3 高標星＝門檻 +10pp，否則永遠拿不到）。
- 難度要落在前後兩關之間，不要出現「第 8 關比第 9 關難」。
- 同一點位連排 3 輪以上會被 WARN（`klay_rise` 刻意連兩輪是既有例外）。
- 上籃輪不要連排，全關佔比 ≤1/3（既有設計慣例）。

## 2. `js/stats.js`：`evaluateSignature()` 加 case

沒加 case 的關卡，★2 **永遠拿不到而且不會報錯**（`default` 回 `false`）。

- 規則只能用「該場 rounds 的實際內容」判定（點位／球種／輪序），**不可依賴輪次編號**——
  菜單日後改版，舊場次也要能正確回溯判定。
- 資料裡沒有規則所需的結構（缺點位、無該球種、無連兩輪同點…）一律回 `false`，不給白拿。
- 同一份改動要在 `tools/test_stats.mjs` 補測試（正例＋反例各一）。

## 3. `js/store.js`：migration 補解鎖

`SCHEMA_VERSION` +1，並加一段 `if (data.schema < N) { … }`：

- **接在最尾端**：已經通過原本最後一關的人，要補解鎖新關（否則他們永遠看不到新關）。
- **插在中間**：已解鎖「新關後面那一關」的人，要補解鎖新關（照 schema 9 對 `lin_taiwan`
  的做法：`unlocked` 含後一關就把新關補進去）。
- 原則永遠是**只加不減**：算出來的結果比現況少，就保留現況；徽章／星星一律不收回
  （`stars_full` 門檻是關數 ×3 動態算，加關後舊有徽章保留、不再重複發）。

⚠️ **鐵律（SPEC_M11 §4.1 修過的洞）：新插入的關卡只補 `unlocked`，絕不可寫進
`progress.passed`。** 「通過」是明確記錄的狀態（`progress.passed`，由
`applyChallengeResult()` 在玩家真正過關那一刻寫入），不是用「下一關已解鎖」
推導出來的——早期版本（schema 11 以前）曾經是推導式判定，這會讓插入的新關被
玩家沒打過就自動判定成「已通過」（只要玩家早就解鎖了新關後面那一關）。若
migration 需要回推「改版前已經通過哪些關」（例如同時要重編後面關卡的 tier），
必須用**改版前的階梯順序**手動列出來回推（照 schema 12 對 `LADDER_PRE_M11` 的
做法），不能用當下的 `ladderMenus()`——那已經是插入新關後的順序，回推會把新關
也算成已通過。

## 4. 硬編在文案裡的關數（最容易漏）

現況（`check_ladder` 會逐一列出）：

- `js/home.js`：功能卡標題與副標（各一處）
- `index.html`：JSON-LD 的 `featureList`、以及 `<noscript>` 功能說明段

`session.js` 的「第 N 關 / 總關數」是模板算出來的，不用改。

## 5. 不用改的地方（動態跟隨，確認即可）

- 徽章 `ladder_3` / `ladder_7` 門檻、`stars_full`（關數 ×3）、`BADGE_TOTAL`：全部動態算。
- 生涯分享卡的階梯分段條：`ladderCells` 依 `ladderMenus()` 產生，格寬自動縮。
  但**格寬有下限**——`check_ladder` 會在 <34px 時 WARN、<24px 時 FAIL，屆時要改成兩列。
- 統計頁、階梯頁的關卡列表、`equivalentTier()` 對照：都吃 `ladderMenus()`。

## 6. 若新關用到新點位或新球種

（沒有就跳過。上一次是第 11 關引進 `layup`。）

1. `js/court.js`：`SPOTS` 加點位（含 `type`）、必要時 `TYPE_LABEL` 加球種。
2. `js/session.js`：`TYPE_OPTIONS`。
3. `js/statspage.js`：`TYPE_CHIPS`（命中率趨勢的球種篩選）。
4. `js/sharecard.js`：`TYPE_OPTIONS` / `TYPE_LABEL`（分享卡球種列）。
5. 熱區顏色分級、半場圖座標不要跟既有點位重疊（court.js 檔頭有前車之鑑）。

## 7. `sw.js`

`CACHE_NAME` 版號 +1，否則既有使用者拿不到新版。

## 8. 文件

- 新關卡的規格寫進 `docs/SPEC_M*.md`。
- 收工時更新 `docs/HANDOFF_*.md` 的「現行機制速查」關數。

---

## 9. 自動檢查（兩支都要綠）

```
node tools/check_ladder.mjs    # 階梯一致性：tier 連號、欄位齊全、死關、簽名 case、文案關數、卡片格寬、通過狀態明確記錄
node tools/test_stats.mjs      # 純函式測試（改 stats.js 必須同步補）
```

`check_ladder` 的 FAIL 一定要修；WARN 是「可能刻意、自己看一眼」。

## 10. 瀏覽器驗收

1. 階梯頁：新關的磁磚位置、刊號、鎖／解鎖狀態正確；前一關的「下一關」指向新關。
2. 打一場新關（可用 DevTools 塞資料）：過關會解鎖下一關、★1/★2/★3 判定正確。
3. 生涯分享卡：階梯分段條格數 = 新關數且看得清；紙感／照片底圖都掃一次。
4. 舊資料 migration：拿一份舊 JSON 匯入，確認補解鎖正確、沒有任何徽章／星星被收回；
   `progress.passed` 只含改版前真正通過的關卡，新插入的關卡在 `unlocked` 但不在
   `passed`（SPEC_M11 §4.1 修過的洞——之前是用「下一關已解鎖」推導，新關會被
   誤判成已通過）。
5. 首頁與 `index.html` 的關數文案已同步。

## 11. 進版控

`git fetch`（兩台機器共推 main）→ commit → push → `gh run watch` 綠燈 →
抓 `https://shot-ledger.pages.dev/sw.js` 確認 `CACHE_NAME` 已是新版。
