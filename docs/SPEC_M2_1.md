# SPEC M2.1 — 挑戰 hero 球員數據面板重設計（2026-07-13）

背景：使用者回饋 hero 卡的生涯數據列（一排米色 pill）「太普通、像臨時做的」。
本規格只動視覺呈現層，**不動任何數據內容與查證紀錄**（menus.js career 欄位不可改）。
同時本次 commit 已由 Fable 修正 court.js 三分線 sweep flag（不在本 spec 範圍）。

## 0. 硬性規則

1. 只改 `js/session.js` 的 `renderCareerHtml()`（可加小工具函式）、`css/app.css`、
   `css/tokens.css`（僅新增變數）。不碰 menus.js、stats.js、store.js。
2. 純呈現層改動：不新增資料欄位、不改任何數字與文案來源。
3. 排版紀律照舊：每個「數值＋單位」包 `.nowrap`；375/390px 無換行溢出。
4. 顏色一律走 tokens 變數；夜幕深藍需新增 token。

## 1. 設計定義：「夜幕數據面板」

把整個生涯數據區（原 chips 列＋招牌事實）改成一塊深色面板，
呼應品牌的夜幕深藍（favicon v7 / OG 圖夜空同色系）：

### 1.1 tokens.css 新增

```css
--color-night: #1F3A5F;        /* 夜幕深藍（BRANDING.md 色盤既有色） */
--color-night-line: #35517A;   /* 面板內分隔線／描邊（夜藍亮一階） */
--color-on-night: #FAF9F7;     /* 夜藍上的主文字（=暖米白） */
--color-on-night-muted: rgba(250, 249, 247, 0.62);  /* 夜藍上的次要文字 */
```

### 1.2 面板結構（取代現有 `.hero-card__career` ＋ `.hero-card__fact`）

```
┌──────────────────────────────────────┐
│ NBA 2010–2019            生涯數據     │  ← caption 列
│                                      │
│  43.3%     34.2%    80.9%    449     │  ← 4 欄數字列（等寬 grid）
│  投籃 FG   三分 3P   罰球 FT   三分命中 │
│ ────────────────────────────────────│  ← 細分隔線（--color-night-line）
│ ▎2012 年掀起「林來瘋」的傳奇後衛        │  ← 招牌事實（橘左槓）
└──────────────────────────────────────┘
```

- 容器：`border-radius: var(--radius-md)`、bg `--color-night`、
  padding `var(--space-4)`，上下留 `var(--space-3)` 與鄰接元素間距。
- **caption 列**：左「NBA {years}」`--text-xs`、`--color-on-night-muted`、
  letter-spacing 稍開（0.04em）；右「生涯數據」同級小字。兩端對齊一行。
- **數字列**：`display:grid; grid-template-columns: repeat(4, 1fr)`，每欄置中：
  - 值：`--text-lg`（19px）、weight 700、`--color-on-night`、
    tabular-nums（`font-variant-numeric: tabular-nums`）。%
    直接接在數字後同一個 `.nowrap` 單元。第 4 欄是三分命中顆數
    （千分位用既有 `formatThousands`，不帶「顆」字——欄位標籤已說明）。
  - 標籤：`--text-xs`、`--color-on-night-muted`，置中，如
    「投籃 FG」「三分 3P」「罰球 FT」「三分命中」。
  - **重點欄高亮**：與該菜單 `passRule` 相關的欄位，值改 `--color-accent`
    （橘）。對應：rule type `2pt`→FG 欄、`3pt`→3P 欄、`deep3`→3P 欄、
    `ft`→罰球欄；多條 rule 可同時高亮多欄。
    實作：`renderCareerHtml(career, passRule)`——呼叫端把 menu.passRule 傳入。
- **招牌事實**：面板底部，上方以 1px `--color-night-line` 分隔
  （或用 border-top），文字 `--text-sm`、`--color-on-night`（85% 也可），
  左側 3px `--color-accent` 豎槓（border-left＋padding-left），
  行高 `--leading-normal`。

### 1.3 細節

- 面板在 hero 卡（米白/白底）內要有「內嵌一塊夜空」的對比感，
  不要加陰影（扁平）；可加 1px `--color-night-line` 內描邊（可選）。
- `hero-card__player` 那行（球員名＋退役/現役）維持在面板之上，不動。
- 375px 檢查：4 欄各約 76px，值最長「80.9%」5 字元 OK；
  若「三分命中」四字在 375px 擠，可縮 letter-spacing 或字級到 11px
  ——但不得低於 11px、不得換行。
- 面板只用在 hero 卡（`renderCareerHtml` 唯一呼叫點），不影響其他卡。

## 2. 驗收清單

1. 375/390px：面板 4 欄一行排下、無孤字換行、無溢出；caption 一行兩端對齊。
2. 高亮欄正確：Lin（2pt+ft rule）→ FG 與罰球欄橘字；Klay（3pt）→ 3P 欄橘字；
   Lillard（deep3）→ 3P 欄橘字。
3. 夜藍面板上文字對比清楚（米白/muted 兩級），招牌事實有橘左槓。
4. `node tools/test_stats.mjs` 全過（本改動不應碰任何測試範圍）。
5. console 零錯誤；其他頁面視覺不受影響。
