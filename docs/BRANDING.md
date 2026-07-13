# Shot Ledger — 品牌視覺與 OG 圖生成指南（2026-07-12）

## 1. 視覺原則

- **Flat design 一致性**：App 內所有圖像（tab icon、球場圖、定點圓、獎章、
  空狀態插圖）與對外素材（OG 圖）都是扁平插畫語言：純色塊、幾何形、
  無擬真漸層陰影。允許細微紙質顆粒（grain）增加雜誌感。
- **色盤（App 與 OG 共用）**
  | 用途 | 色碼 |
  |---|---|
  | 籃球橘（主 accent） | `#E8590C` |
  | 暖米白（底色） | `#FAF9F7` |
  | 深炭（文字/線條） | `#2B2A28` |
  | 暖沙（輔助面） | `#F1E8DD` |
  | 夜幕深藍（插圖天空/對比面） | `#1F3A5F` |

## 2. favicon（不用 AI，程式內做）

手刻扁平 SVG（2026-07-13 v6 定案：**夜空軌跡**）：夜幕深藍 `#1F3A5F`
圓角方塊（rx 14/64，低調沉穩、與 OG 圖黃昏夜空同色）＋沿拋物線
（中心線 M10 52 Q32 2 52 38）的**錐形填色軌跡**——起點收尖、寬度
0→約5.5 漸粗（兩條偏移二次曲線圍成填色形狀，因 SVG stroke 無法變寬）
——疊 userSpaceOnUse 線性漸層（暖米白 opacity .35→1，起點淡、入球亮），
終點 r6.5 **籃球橘** `#E8590C` 實心球＋r14 radial **柔光暈**
（橘 opacity .5→0，夜空發光感，全圖唯一亮點）。
inline data URI 直接放 index.html。
迭代紀錄：v1 深炭細線籃球 ×4 組（小尺寸發暗顯髒）→ v2 米白粗線籃球
（使用者：像棒球、沒想像空間）→ v3 實線弧＋球點 → v4 軌跡點列
從小到大＋漸層 → v5 錐形漸層軌跡線（由細而粗）→ v6 底色改夜幕深藍、
球改籃球橘 → v7 球加柔光暈（四方案比稿選 B，定案）。

## 3. OG 圖規格

- 尺寸 **1200×630 px**（og:image 標準），存 `assets/og.png`（<300KB）。
- 構圖需求：**左側或上方留乾淨負空間**放標題字（標題由我們後製疊字，
  生成圖本身**不要有任何文字**——AI 生字容易爛）。
- 情境（2026-07-13 三修定案）：**插畫剪影風、鏡頭在球員背後、望向籃框**，
  **只畫半場投射、極簡到三個元素**——背影剪影（follow-through）、
  懸空的球（**不畫軌跡線**）、遠端極簡籃框。球場不畫線（頂多一道
  地平交界），細節越少越好。對應 App 的「一個人練球」核心情境。

## 4. 生成 Prompt（拿去給圖像 AI；2026-07-13 三修：拿掉軌跡線）

### 主 Prompt（英文，直接貼）

```
Ultra-minimal flat vector silhouette illustration, modern editorial sports
poster. A half-court scene reduced to three elements only: a lone
basketball player, one ball frozen in mid-air, and one distant hoop.
Camera directly behind the player — his clean dark silhouette in deep
charcoal #2B2A28, back to the viewer, arm extended in a jump-shot
follow-through. A single burnt orange #E8590C ball hangs high in the air
between player and rim, completely on its own — no trajectory line, no
dotted curve, no motion lines, no trail. The ground is one single flat
plane of warm off-white #FAF9F7 with no court markings, no lines, no
paint area — just a clean horizon meeting a vast dusk sky of deep night
blue #1F3A5F. Bold flat color blocks, no gradients, no outlines, subtle
paper grain. Nothing else in the frame; generous calm negative space in
the upper left for a magazine masthead. No text, no letters, no logos,
no watermark. Wide landscape composition, 1200x630.
```

### 備用變體（同一概念、更低更近的過肩鏡位，挑一張最好的）

```
Ultra-minimal flat silhouette illustration, sports editorial cover art.
Half-court only, almost abstract: low over-the-shoulder view from behind a
basketball shooter, his deep charcoal #2B2A28 silhouette rising in the
right foreground, back to the viewer, wrist snapped in follow-through. Far
ahead one small minimalist hoop — a bare pole and rim — against a deep
night blue #1F3A5F dusk sky. A single burnt orange #E8590C ball floats
high between hand and rim, alone in the sky — no trajectory line, no
dotted curve, no motion lines, no trail. The ground is a plain warm
off-white #FAF9F7 plane with no court lines or markings, only one long
simple shadow stretching from the player. Flat geometric shapes, subtle
grain, no gradients, no outlines, no extra objects. Left half mostly calm
negative space for title text. No text, no letters, no logos, no
watermark. 1200x630 wide landscape.
```

### 生成後檢查清單（2026-07-13 完成 ✅）
- [x] 沒有任何文字/浮水印/亂 logo（Gemini 右下角星形浮水印已用鄰近地面補丁移除）
- [x] 色盤大致落在上表五色
- [x] 留白區乾淨，疊標題字不會打架（左上整片夜藍）
- [x] 縮到手機分享卡尺寸（~400px 寬）時主體仍清楚
- [x] 裁成 1200×630 後存 **`assets/og.jpg`**（純色塊圖 JPEG q82 僅 22KB；
  PNG 因紙質顆粒達 775KB 超出 300KB 預算，故改 JPEG，meta 已同步用 .jpg）

定稿：Gemini 生成（主 Prompt 三修版）、背後視角剪影＋懸空球＋右側籃框，
2848×1504 原檔在使用者 Downloads，中央裁切至 1200×630。

## 5. meta 標籤（產圖後加進 index.html）

```html
<meta property="og:title" content="Shot Ledger — 投籃訓練紀錄">
<meta property="og:description" content="選一位射手挑戰，每輪回來點一下，破紀錄解鎖下一位。">
<meta property="og:image" content="https://<網域>/assets/og.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```
