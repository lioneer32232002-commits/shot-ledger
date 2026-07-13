# Shot Ledger 🏀

**免安裝、免帳號、免訂閱——打開網頁就能記的個人投籃訓練系統。**

👉 線上使用：**<https://shot-ledger.pages.dev>**（手機瀏覽器開啟即用，資料存在自己裝置）

## 這是什麼

一個人去球場練投籃時，最順手的紀錄工具：投 10 球一輪，回來點一個數字就記完。
選一位射手挑戰，照菜單投，破紀錄解鎖下一位——從 Jeremy Lin 一路練到 Stephen Curry。

## 特色

- **一輪 10 球的抗疲勞輸入**：快速模式點一個數字完成一輪；逐球模式點亮進球順序，
  解鎖「前 5 球 vs 後 5 球」的專注度分析。
- **球場點位熱區圖**：FIBA 標準半場 15 個定點（含 3 個深三點），先點位置再投，
  自動累積個人 shot chart——不需要任何測距。
- **射手挑戰階梯**：六關（Lin → Dirk → Ray Allen → Klay → Lillard → Curry），
  每關的訓練菜單取材自該球員公開報導的真實訓練/賽前儀式（App 內附出處連結），
  完整版達標才解鎖下一關。
- **誠實機制**：輪次時間戳判定真實練習節奏，刷太快的成績不列入解鎖評估；
  徽章綁定出席與投量，不綁單節命中率。
- **統計分頁**：命中率趨勢折線、近半年熱力格日曆、期間熱區、疲勞趨勢
  （跨節輪次曲線＋逐球前後段），7 天/30 天/全部一組期間切換全區連動。
- **週目標**：設定每週投量目標，練球首頁與統計頁同步顯示進度，達成有提示。
- **成績分享卡**：節結束頁／歷史詳情一鍵生成 1080×1350 PNG 成績卡
  （手刻 canvas，含熱區縮圖與達成／個人最佳徽章），可分享或下載。
- **資料自主**：localStorage 單機保存（含 schema migration），一鍵匯出/匯入
  JSON 與 CSV，沒有帳號、沒有雲端、沒有訂閱。
- **事實查核紀律**：球員生涯數據以 StatMuse＋ESPN 雙來源交叉核對（截至賽季
  標註於 App 內）；訓練菜單出處逐一查證，查不到本人菜單的誠實標示「靈感改編」。

## 技術

純 vanilla JS（ES modules）、零依賴、無 build step。localStorage＋schema
migration、手刻 SVG 球場圖與圖表、手機優先 RWD、Cloudflare Pages 部署。

```bash
# 本機執行（ES modules 需要 http server，不能用 file://）
python -m http.server 8000   # 開 http://localhost:8000

# 資料層單元測試（75 項）
node tools/test_stats.mjs
```

## 文件

- [PLAN.md](PLAN.md) — 產品規劃全文（核心迴圈、挑戰階梯設計、誠實機制、里程碑）
- [docs/COMPETITORS.md](docs/COMPETITORS.md) — 競品調查與差異化策略
- [docs/SPEC_M1.md](docs/SPEC_M1.md) / [SPEC_M1_5.md](docs/SPEC_M1_5.md) / [SPEC_M1_6.md](docs/SPEC_M1_6.md) / [SPEC_M2.md](docs/SPEC_M2.md) — 各里程碑實作規格
- [docs/BRANDING.md](docs/BRANDING.md) — 視覺系統與 OG 圖規格

## 狀態

M2 已上線（核心迴圈＋挑戰階梯＋逐球輸入＋誠實機制＋球員數據＋統計分頁＋
週目標＋成績分享卡）。下一步：M3（深色模式、PWA、雙語）。
詳見 [docs/HANDOFF_20260713.md](docs/HANDOFF_20260713.md)。
