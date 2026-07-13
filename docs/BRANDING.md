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

手刻扁平 SVG（2026-07-13 v5 定案：**錐形漸層軌跡線**）：籃球橘
圓角方塊（rx 14/64）＋沿拋物線（中心線 M10 52 Q32 2 52 38）的
**錐形填色軌跡**——起點收尖、寬度 0→約5.5 漸粗（兩條偏移二次曲線
圍成填色形狀，因 SVG stroke 無法變寬）——疊 userSpaceOnUse 線性漸層
（暖米白 opacity .35→1，起點淡、入球亮），終點 r7 實心球。
inline data URI 直接放 index.html。
迭代紀錄：v1 深炭細線籃球 ×4 組（小尺寸發暗顯髒）→ v2 米白粗線籃球
（使用者：像棒球、沒想像空間）→ v3 實線弧＋球點 → v4 軌跡點列
從小到大＋漸層 → v5 錐形漸層軌跡線（由細而粗，定案）。

## 3. OG 圖規格

- 尺寸 **1200×630 px**（og:image 標準），存 `assets/og.png`（<300KB）。
- 構圖需求：**左側或上方留乾淨負空間**放標題字（標題由我們後製疊字，
  生成圖本身**不要有任何文字**——AI 生字容易爛）。
- 情境（2026-07-13 依使用者定案改版）：**插畫剪影風、鏡頭在球員背後、
  望向籃框的縱深構圖**——背影剪影＋出手 follow-through、球在弧線頂點、
  遠端極簡籃框。對應 App 的「一個人練球」核心情境。

## 4. 生成 Prompt（拿去給圖像 AI；2026-07-13 改版：剪影風＋背後視角）

### 主 Prompt（英文，直接貼）

```
Flat vector silhouette illustration, modern editorial sports poster. Camera
directly behind a lone basketball player: his clean dark silhouette in deep
charcoal #2B2A28 stands with his back to the viewer, arm extended in a
jump-shot follow-through, facing a distant minimalist hoop. A burnt orange
#E8590C basketball floats at the top of its arc between player and rim, the
flight path traced by a thin dotted curve. Empty outdoor court in warm
off-white #FAF9F7 with a warm sand #F1E8DD paint area, vast dusk sky in deep
night blue #1F3A5F filling the upper frame. Bold flat geometric color
blocks, no gradients, no outlines, subtle paper grain. Player silhouette
anchored right of center; generous calm negative space in the upper left
for a magazine masthead. No text, no letters, no logos, no watermark.
Wide landscape composition, 1200x630.
```

### 備用變體（同一概念、更低更近的過肩鏡位，挑一張最好的）

```
Minimalist flat silhouette illustration, sports editorial cover art. Low
over-the-shoulder view from behind a basketball shooter: his deep charcoal
#2B2A28 silhouette rises large in the right foreground, back to the viewer,
wrist snapped in follow-through. Far ahead a small minimalist hoop stands
against a deep night blue #1F3A5F dusk sky; a burnt orange #E8590C ball
hangs mid-arc on a thin dotted trajectory between hand and rim. Warm
off-white #FAF9F7 court with warm sand #F1E8DD key, one long simple shadow
stretching from the player. Flat geometric shapes, subtle grain, no
gradients, no outlines. Left half mostly calm negative space for title
text. No text, no letters, no logos, no watermark. 1200x630 wide landscape.
```

### 生成後檢查清單
- [ ] 沒有任何文字/浮水印/亂 logo
- [ ] 色盤大致落在上表五色（可容忍明度變化）
- [ ] 留白區乾淨，疊標題字不會打架
- [ ] 縮到手機分享卡尺寸（~400px 寬）時主體仍清楚
- [ ] 裁成 1200×630 後存 `assets/og.png`

## 5. meta 標籤（產圖後加進 index.html）

```html
<meta property="og:title" content="Shot Ledger — 投籃訓練紀錄">
<meta property="og:description" content="選一位射手挑戰，每輪回來點一下，破紀錄解鎖下一位。">
<meta property="og:image" content="https://<網域>/assets/og.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```
