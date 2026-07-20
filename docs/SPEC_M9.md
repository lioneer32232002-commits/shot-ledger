# SPEC M9：資料安心包（保存說明＋persist()＋里程碑式備份提醒）

> 背景：全站資料只存 localStorage，站上從未說明「資料存在哪、怎麼會不見」。
> 使用者擔心的是「強制清除網站資料＝紀錄歸零」，但不需要跨裝置同步，
> 故 **不做** D1 同步碼雲端備份（未來要加可直接疊上，不衝突）。
> 設計主軸＝**安心感**：讓使用者知道不手動存檔紀錄也一直都在，
> 提醒從「催促」降為「里程碑式順手一提」。
> 比稿定案（2026-07-20）：結束頁備份小卡＝**C 案單行列**；設定頁說明段照比稿定稿。
> mockup 存檔：`mockup_m9.html`（臨時檔，驗收後刪除、不進 commit）。

## 包 A：設定頁「備份與轉移」卡新增說明段（js/app.js）

1. `renderSettings()` 的「備份與轉移」卡，標題下、按鈕列上方插入說明段：

   ```html
   <p class="settings-storage-note">紀錄自動存在這台裝置的瀏覽器裡——關掉網頁、重開手機都還在，平常<strong>不需要手動存檔</strong>。只有清除瀏覽器的網站資料、或是換了裝置，紀錄才會不見；想搬家或多一層保險時，匯出 JSON 就能完整帶走。</p>
   ```

   文案一字不改。樣式（css/app.css，全部用 tokens，深色自動成立）：
   `font-size: var(--text-sm); color: var(--color-text-muted); line-height: var(--leading-normal);`
   `strong` 用 `color: var(--color-text)`。

2. 「上次備份」行保留原位（卡片底部）。
3. **移除** `settings-reminder`（紅底「已累積 N 次尚未備份」恐嚇提醒）——
   含 `reminderHtml` 產生邏輯與 `.settings-reminder` 樣式。資訊已由說明段＋
   「上次備份」行＋包 C 的里程碑小卡取代。

## 包 B：持久儲存 persist()（js/app.js）

1. App 啟動時（app.js 初始化流程尾端）best-effort 執行，全程 try/catch＋
   feature-detect，失敗／不支援一律靜默：

   ```js
   let storagePersisted = null; // null=未知、true/false=已確認
   if (navigator.storage?.persisted) {
     navigator.storage.persisted().then(async (ok) => {
       storagePersisted = ok || (await navigator.storage.persist());
     }).catch(() => {});
   }
   ```

2. 設定頁「備份與轉移」卡最底部：`storagePersisted === true` 時多一行狀態列
   （綠點＋文字），否則整行不渲染（不顯示失敗態，避免製造焦慮）：

   ```html
   <p class="settings-card__row settings-persist"><span class="settings-persist__dot"></span>儲存空間已受瀏覽器保護，不會被自動回收</p>
   ```

   綠點：`7px` 圓、`background: var(--color-success)`；行本身沿用
   `settings-card__row` 字級色彩，`display: inline-flex; align-items: center; gap: 6px;`。
   進設定頁時 promise 多半已 resolve；若還是 null 就本次不顯示，下次進來就有。

## 包 C：結束頁里程碑備份小卡（js/session.js＋js/store.js）

### 出現條件（全部成立才渲染）

- 只在**練球結束頁**：`renderSessionSummary` 的 `opts.onDone` 存在
  （紀錄分頁節詳情只有 onDelete，不會出現）。
- `store.unbackedUpCount(state) >= 30`。
- 未被 snooze：`settings.backupNudgeBase == null` 或
  `unbacked >= settings.backupNudgeBase + 30`（「先不用」之後要**再**累積
  30 次才會再出現）。

### schema：settings 新欄位 `backupNudgeBase`

- `number | null`，預設 `null`＝從未按過「先不用」。
- 走 store.js 既有「保底」正規化補欄位（值不是 number 也不是 null 就設回
  null），**不 bump schema 版號**、不寫 migration。
- 預設 state（store.js 開頭 settings 初始形狀）同步加上 `backupNudgeBase: null`。

### 行為

- 按「匯出」→ 呼叫既有 `store.exportJson`（會下載檔案＋更新 `lastBackupAt`
  ＋存檔）；`exportJson` 內順帶把 `backupNudgeBase` 重設為 null（從設定頁
  匯出也一併重設，行為一致）。UI **原地**把整個小卡（含「先不用」行）
  換成完成態一行字，不重渲染整頁。
- 按「先不用，下次再說」→ 新增 `store.snoozeBackupNudge(state)`：
  把 `backupNudgeBase` 設為目前 `unbackedUpCount(state)` 並存檔。
  小卡整塊原地淡出移除（用 `--transition-med`，reduced-motion 自動變 1ms）。
- 匯出後 `lastBackupAt` 更新 ⇒ unbacked 歸零 ⇒ 門檻自然重新起算。

### Markup（比稿 C 案，數字＝實際 unbacked 數，不寫死 30）

插在 `.summary__actions` 正上方：

```html
<div class="backup-nudge" data-role="backup-nudge">
  <div class="backup-nudge__row">
    <span class="backup-nudge__num">{N}</span>
    <span class="backup-nudge__text">
      <p class="backup-nudge__title">次練習還沒備份</p>
      <p class="backup-nudge__sub">匯出 JSON，換手機也帶得走</p>
    </span>
    <button class="btn btn--secondary backup-nudge__btn" data-summary-action="backup-export">匯出</button>
  </div>
  <div class="backup-nudge__dismiss"><button data-summary-action="backup-dismiss">先不用，下次再說</button></div>
</div>
```

完成態（取代整個 `.backup-nudge` 內容）：

```html
<p class="backup-nudge__done">✓ 已匯出備份，檔案在下載資料夾。</p>
```

### 樣式（css/app.css，比稿定案值）

- `.backup-nudge__row`：`background: var(--color-surface-sunken); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); display: flex; align-items: center; gap: var(--space-3);`
- `.backup-nudge__num`：`font-size: var(--text-xl); font-weight: 800; color: var(--color-accent); line-height: 1; flex-shrink: 0;`
- `.backup-nudge__title`：`font-size: var(--text-sm); font-weight: 700; color: var(--color-text); margin: 0;`
- `.backup-nudge__sub`：`font-size: var(--text-xs); color: var(--color-text-muted); margin: 2px 0 0;`
- `.backup-nudge__btn`：`flex-shrink: 0; min-height: 40px; padding: 0 var(--space-4); font-size: var(--text-sm);`
- `.backup-nudge__dismiss`：置中；按鈕無框無底、`font-size: var(--text-xs); color: var(--color-text-faint); padding: var(--space-1); cursor: pointer;`
- `.backup-nudge__done`：`font-size: var(--text-sm); color: var(--color-success); margin: 0;`
- 全部用 tokens，不出現任何寫死色碼；深淺主題零額外處理。

## 不動的東西

- 首頁三屏 landing 不加任何儲存說明（會破壞編輯性風格）。
- `js/stats.js` 零改動 ⇒ `tools/test_stats.mjs` 不用動（但交付前仍要跑，
  現 96 條全綠才算過）。
- 匯出／匯入／CSV 既有邏輯不動。

## 部署

- `sw.js` `CACHE_NAME` v29 → **v30**（改版號前先 `git fetch`，兩機共推 main
  會撞號）。
- push 後 `gh run watch` 綠燈，最終抓線上
  `https://shot-ledger.pages.dev/sw.js` 驗 v30。

## 驗收清單（Fable 瀏覽器實測）

1. 設定頁：說明段出現、排版與比稿一致；紅色 reminder 已消失；
   persist 綠點列在支援的瀏覽器出現。
2. 結束頁：unbacked < 30 不出卡；≥ 30 出卡（可用匯入捏造資料或暫調門檻驗）；
   紀錄分頁節詳情**不出卡**。
3. 按「匯出」→ 檔案下載、卡片原地變完成態、設定頁「上次備份」更新、
   下一節結束頁不再出卡。
4. 按「先不用」→ 卡片淡出；再結束一節（unbacked +1）不出卡。
5. 深色模式兩處都正確。
6. `node tools/test_stats.mjs` 96 條全綠。
