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

手刻扁平 SVG：暖米白圓底＋籃球橘圓球＋深炭兩道弧線（籃球紋極簡化），
輸出 inline data URI＋`assets/favicon.svg`。M1.5 收尾時做。

## 3. OG 圖規格

- 尺寸 **1200×630 px**（og:image 標準），存 `assets/og.png`（<300KB）。
- 構圖需求：**左側或上方留乾淨負空間**放標題字（標題由我們後製疊字，
  生成圖本身**不要有任何文字**——AI 生字容易爛）。
- 情境：黃昏戶外球場，單人跳投，球劃出弧線飛向籃框——對應 App 的
  「一個人練球」核心情境。

## 4. 生成 Prompt（拿去給圖像 AI）

### 主 Prompt（英文，直接貼）

```
Flat vector illustration in the style of a modern editorial sports magazine
cover. A lone basketball player in mid-air jump shot form, seen in profile
silhouette, on an empty outdoor basketball court at dusk. The ball floats
mid-arc toward a minimalist hoop, its flight path traced by a thin dotted
curve. Bold geometric shapes, clean flat color blocks, no gradients, no
outlines, subtle paper grain texture. Limited palette: burnt orange #E8590C,
warm off-white #FAF9F7, deep charcoal #2B2A28, warm sand #F1E8DD, deep
night blue #1F3A5F. Long simple shadows on the court. Large area of calm
negative space in the upper left for a magazine masthead. No text, no
letters, no logos, no watermark. Wide landscape composition, 1200x630.
```

### 備用變體（構圖不同，挑一張最好的）

```
Minimalist flat illustration, sports editorial cover art. Low-angle view of
a basketball hoop against a dusk sky in deep night blue #1F3A5F, a burnt
orange #E8590C basketball frozen at the top of its arc, dotted trajectory
line, warm off-white #FAF9F7 court below with warm sand #F1E8DD paint area.
A small solitary shooter figure in deep charcoal #2B2A28 in the lower right,
follow-through pose. Flat geometric shapes, subtle grain, generous negative
space on the left half for title text. No text, no logos. 1200x630 wide.
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
