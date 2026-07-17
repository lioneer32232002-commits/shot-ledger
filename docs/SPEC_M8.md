# SPEC M8：徽章系統 2.0＋變體面板／標籤統一（五包總結）

> 本文件是事後總結（五包於 2026-07-17 下午同日上線，spec 散在對話比稿），
> 留檔供後續接手快速理解現行規則。上線 commit：
> 變體標籤＝`76cbfc0`（SW v25）、變體面板排版＝`62b9481`（v26）、
> 徽章牆＝`6414654`（v27）、徽章搬家＋成就條＝`0a3ef21`（v28）、
> 徽章擴充 17 顆＝`d539c12`（**SW v29、schema 11**）。

## 第一包：變體標籤極簡化（v25）

「完整」是預設、一律不標；只有簡易版（綜合巡迴、歷史舊紀錄）才標「簡易」。
分享卡、歷史列表、進行中／結算頁三處同一規則。挑戰達成、三星等判定邏輯
零改動（仍看 `variant === 'full'`）。

## 第二包：變體面板排版統一（v26，比稿 C 案）

進挑戰的 sheet 改為「置中 hero＋卡片資訊區」兩段式：

- 單一選項（開始挑戰／開始練習）加 `.variant-option--solo` 撐滿整列；
  簡易／完整雙欄（綜合巡迴）維持並排
- 三行置中星等說明收進「三星目標」眉標卡（`.sheet-goals`，星號欄固定 40px
  讓內文左緣對齊），與「菜單依據」「誠實機制」同一套卡片系統
- `.star-row` 已被三星制星列用走，新 class 命名 `sheet-goals` 避開撞名
- 舊 `.sheet__star-lines`／`.sheet__focus + .sheet__sub` 樣式已移除

## 第三〜五包：徽章系統 2.0（v27〜v29、schema 11）

### 清單（17 顆、四家族，js/badges.js `BADGE_DEFS`）

| 家族 | 圖示 | 門檻 |
|---|---|---|
| 出席 streak_* | 火焰 | 連續 3 / 7 / 14 / 30 / 60 天 |
| 投量 volume_* | 籃球 | 累計 1,000 / 2,500 / 5,000 / 10,000 / 25,000 / 50,000 顆 |
| 摘星 stars_* | 星形 | 10 / 25 / 全滿（`stars_full` 門檻動態＝關數×3，現＝39） |
| 階梯 ladder_* | 獎盃 | 通過 3 關 / 通過 7 關 / 全破（`ladder_complete`，動態＝關數） |

「通過」判定＝下一關已解鎖、末關看 ladder_complete——與 session.js 階梯頁
`passedIds` 同一套。摘星／全破門檻不寫死，關數再變不用改定義。

### 發章（js/store.js，只加不減）

- 每次 `applyChallengeResult`（正常結算與 confirmPace 共用）尾端：
  `computeBadges`（出席／投量，看 sessions）＋ `computeProgressBadges`
  （階梯里程碑／摘星，看 progress——跑在解鎖與星星合併之後）→ `addBadge` 冪等發章，
  `newBadges` 供結算頁「獲得徽章」慶祝。
- **v11 migration 回溯發章**：出席用 `stats.maxStreakDays`（**歷史最長連續**，
  新章上線前連過的也算，不能只看 `streakDays` 現在還活著的 streak）；
  投量單調累計直接比；階梯／摘星從 progress 現況補。跑在 v10 回溯發星之後
  才看得到完整星數。
- 門檻表 `STREAK_BADGE_TIERS`／`VOLUME_BADGE_TIERS` export 自 stats.js，
  computeBadges 與 migration 共用同一份，不會漂移。

### 顯示（js/badges.js 集中，2026-07-17 比稿定案）

顯示層全部住在 `js/badges.js`（只依賴 stats.js／menus.js 純模組，
session／statspage／app 都可安全 import）：

- **統計頁徽章牆**（`badgeWallHtml`，插在生涯累計後）：3 欄圓形進度獎章（比稿 B 案）。
  已獲得＝橘色滿環＋暖光徽面（radial：surface→accent-tint，深淺主題都由 tokens 帶動）；
  未獲得＝灰剪影＋進度環＋「X / Y」數字。固定依家族＋成就順序排（不把已獲得挑到前面，
  位置固定才有集牆感）；`ladder_complete` 為 `--capstone` 跨滿整列壓軸。
- **練球頁成就條**（`badgeStripHtml`，今日數據卡之後，比稿 A 案）：顯示
  「最接近到手」的未獲得徽章（progress 最高者，同分依定義順序——新手全零自然落在
  連續 3 天並給起步文案）＋迷你進度環＋「徽章 N/17 ›」，點擊跳 `#/stats`。
  全數達成有專屬狀態。
- 設定頁徽章卡已移除（該頁只留外觀／資料狀態／備份）。
- 工具搬家：`formatThousands` 本體→stats.js、`BADGE_LABEL`→badges.js、
  `starsCount`→badges.js；session.js 轉出口，既有 import 全部不用改。
- sw.js CORE 已含 `js/badges.js`（新模組忘加會離線缺檔）。

### 驗收紀錄

- v10→v11 migration 以手工 fixture 實測（歷史 4 連＋2,600 顆＋解鎖 4 關＋11 星）：
  正確補發 streak_3／volume_1000／volume_2500／ladder_3／stars_10 五顆，
  不該補的（streak_7、ladder_7、stars_25）一顆未多發。
- 成就條兩種視角實測：新手全零＝「第一顆徽章：連續練習 3 天」；
  有進度＝正確挑中 progress 最高者（52% 的累計 5,000）。
- 測試 `tools/test_stats.mjs` 96 條（+8：maxStreakDays、computeBadges 新門檻）。
- 線上驗證：sw.js＝v29、badges.js 含 17 顆定義（部署鐵律第 3 點）。
