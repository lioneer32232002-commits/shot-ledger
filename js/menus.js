// js/menus.js
// 模式資料（data-only module，不含邏輯）。新增模式只改這裡，不動程式。
//
// 掛名菜單只取該球員公開報導菜單中「單人可執行」的定點投籃部分（自投自撿），
// 描述禁用 catch & shoot 等需要傳球者的字眼；卡片小字另外標註靈感改編聲明。
//
// career 生涯數據查證紀錄（不得憑印象改動）：
// 2026-07-13 以 StatMuse 與 ESPN 雙來源交叉核對一致；數據截至 2025-26 NBA
// 常規賽（Lillard 因 2025-26 整季傷停，累計停在 2024-25；Lin 的 NBA 年份
// 不含其後 CBA／台灣職籃年份）。fg/tp/ft 為生涯命中率 %、tpm 為生涯三分命中數。
// 來源示例：statmuse.com/nba/player/…、espn.com/nba/player/stats/…；
// 更新數據時必須重新雙來源核對並更新本註記日期。
//
// 2026-07-14 階段數據查證（SPEC_M5 §1.4：挑戰階梯 6→12 關，插入 6 個「生涯階段」
// 菜單）。career.label 為面板 caption 用的階段脈絡文字，fact 為附查證來源的一句話；
// 以下逐階段列兩個獨立來源與 fact 來源，皆於 2026-07-14 交叉核對一致，無 CONFLICT：
// - lin_college（哈佛 2006–10，NCAA 四年生涯合計）：
//   sports-reference.com/cbb/players/jeremy-lin-1.html ＋
//   basketball.realgm.com/player/Jeremy-Lin/NCAA/10168/Career/By_Season/Total
//   fact 來源：gocrimson.com/sports/mens-basketball/roster/jeremy-lin/2981
// - lin_dleague（發展聯盟 2010–11，Reno Bighorns 例行賽 20 場）：
//   statscrew.com/minorbasketball/stats/p-linjer001 ＋
//   basketball.realgm.com/player/Jeremy-Lin/D-League/10168/2011/By_Season/Total/Regular_Season
//   fact 來源：espn.com/nba/news/story?page=Lin-110316
// - dirk_rookie（NBA 1998–99 新秀季）：
//   statmuse.com/nba/ask/dirk-nowitzki-rookie-season-stats ＋
//   espn.com/nba/player/stats/_/id/609/dirk-nowitzki
//   fact 來源：sports.yahoo.com/article/kind-wasted-dirk-nowitzki-admitted-173823100.html
// - allen_bucks（NBA 公鹿時期 1996–2003）：
//   statmuse.com/nba/ask/ray-allen-career-stats-with-the-milwaukee-bucks ＋
//   landofbasketball.com/nba_players_stats/ray_allen_tot.htm
//   fact 來源：si.com/nba/bucks/old-school/revisiting-the-time-when-a-milwaukee-buck-won-the-three-point-contest
// - klay_rise（NBA 2011–12 新秀季）：
//   espn.com/nba/player/stats/_/id/6475/klay-thompson ＋
//   statmuse.com/nba/ask/klay-thompson-rookie-season-stats
//   fact 來源：wsucougars.com/sports/2012/5/22/207871511.aspx
// - curry_mvp（NBA 2015–16 MVP 球季）：
//   espn.com/nba/player/stats/_/id/3975/stephen-curry ＋
//   statmuse.com/nba/ask?q=steph+curry+stats+2015-2016+season
//   fact 來源：si.com/nba/2016/05/10/stephen-curry-unanimous-mvp-golden-state-warriors

export const MENUS = [
  {
    id: 'lin_college', name: 'Jeremy Lin 哈佛時期', short: 'Lin 哈佛', player: 'Jeremy Lin', playerStatus: 'retired', tier: 1,
    focus: '禁區＋近距中距的大學基本功，罰球收尾', inspired: true, challenge: true,
    passRule: [{ type: '2pt', minPct: 45 }],
    passDesc: '2 分 ≥45%',
    easy: ['paint', 'mid_top', 'paint', 'mid_lw', 'ft', 'ft'],
    full: ['paint', 'mid_lw', 'mid_top', 'mid_rw', 'paint', 'ft', 'paint', 'mid_lw', 'mid_top', 'paint', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { label: '哈佛 2006–10', years: '2006–10', fg: 48.1, tp: 33.3, ft: 73.3, tpm: 108, fact: '大四獲教練團一致票選 All-Ivy 第一隊的哈佛控衛' },
    basis: {
      text: '取材自 Lin 哈佛時期的禁區＋近距中距＋罰球攻擊組合，靈感改編自其日後與投籃教練 Doc Scheppler 重造跳投前的基本功階段，非本人菜單',
      source: 'gocrimson.com', url: 'https://gocrimson.com/sports/mens-basketball/roster/jeremy-lin/2981',
    },
  },
  {
    id: 'lin_dleague', name: 'Jeremy Lin 發展聯盟', short: 'Lin 發展聯盟', player: 'Jeremy Lin', playerStatus: 'retired', tier: 2,
    focus: '中距＋禁區混合，發展聯盟的生存強度', inspired: true, challenge: true,
    passRule: [{ type: '2pt', minPct: 48 }, { type: 'ft', minPct: 65 }],
    passDesc: '2 分 ≥48% 且罰球 ≥65%',
    easy: ['paint', 'mid_lw', 'mid_rw', 'paint', 'ft', 'ft'],
    full: ['mid_lw', 'mid_top', 'mid_rw', 'paint', 'paint', 'ft', 'mid_lw', 'mid_top', 'mid_rw', 'paint', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { label: '發展聯盟 2010–11', years: '2010–11', fg: 47.7, tp: 38.9, ft: 71.8, tpm: 14, fact: '在雷諾大角羊場均 18 分，入選 Showcase 第一隊後被勇士召回' },
    basis: {
      text: '取材自 Lin 在雷諾大角羊時期的中距＋禁區攻擊組合，靈感改編自其日後重造跳投前打出生存強度的階段，非本人菜單',
      source: 'espn.com', url: 'https://www.espn.com/nba/news/story?page=Lin-110316',
    },
  },
  {
    id: 'lin', name: 'Jeremy Lin 起手式', short: 'Lin 起手式', player: 'Jeremy Lin', playerStatus: 'retired', tier: 3,
    focus: '中距離＋禁區＋罰球，切入型後衛的定點基本功', inspired: true, challenge: true,
    passRule: [{ type: '2pt', minPct: 50 }, { type: 'ft', minPct: 70 }],
    passDesc: '2 分 ≥50% 且罰球 ≥70%',
    easy: ['mid_lw', 'mid_top', 'mid_rw', 'paint', 'ft', 'ft'],
    full: ['mid_lc', 'mid_lw', 'mid_top', 'mid_rw', 'mid_rc', 'paint', 'ft', 'ft', 'mid_lw', 'mid_top', 'mid_rw', 'ft'],
    est: { easy: 30, full: 60 },
    career: { years: '2010–2019', fg: 43.3, tp: 34.2, ft: 80.9, tpm: 449, fact: '2012 年掀起「林來瘋」的傳奇後衛' },
    basis: {
      text: '靈感來自 Lin 自 2011 年起連續五個夏天在灣區與投籃教練 Doc Scheppler 重造跳投的訓練；中距＋罰球配置為本 App 依切入型後衛需求設計，非本人菜單',
      source: 'HoopsHabit 2015', url: 'https://hoopshabit.com/2015/08/31/exclusive-interview-with-jeremy-lins-shooting-coach-doc-scheppler/',
    },
  },
  {
    id: 'dirk_rookie', name: 'Dirk 新秀課表', short: 'Dirk 新秀', player: 'Dirk Nowitzki', playerStatus: 'retired', tier: 4,
    focus: '45°＋罰球線頂中距的新秀起步', inspired: true, challenge: true,
    passRule: [{ type: '2pt', minPct: 52 }],
    passDesc: '2 分 ≥52%',
    easy: ['mid_lw', 'mid_top', 'mid_rw', 'paint', 'mid_top', 'ft'],
    full: ['mid_lw', 'mid_top', 'mid_rw', 'mid_top', 'paint', 'ft', 'mid_lw', 'mid_top', 'mid_rw', 'paint', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { label: 'NBA 1998–99 新秀季', years: '1998–99', fg: 40.5, tp: 20.6, ft: 77.3, tpm: 14, fact: '自陳「浪費掉的一年」，隔季轉型大爆發的起點' },
    basis: {
      text: '依據 Dirk 新秀球季尚未定型、以 45° 與罰球線頂中距為主的出手分布改編（同一份特訓報導的低強度入門版）；定點位置為本 App 設計',
      source: 'ESPN 2015', url: 'https://www.espn.com/nba/story/_/id/13893319/how-dirk-nowitzki-prepares-fire-all-cylinders',
    },
  },
  {
    id: 'dirk', name: 'Dirk 中距大師', short: 'Dirk 中距', player: 'Dirk Nowitzki', playerStatus: 'retired', tier: 5,
    focus: '罰球線頂＋45° 中距定點量產', inspired: true, challenge: true,
    passRule: [{ type: '2pt', minPct: 55 }],
    passDesc: '2 分 ≥55%',
    easy: ['mid_lw', 'mid_top', 'mid_rw', 'mid_top', 'mid_top', 'ft'],
    full: ['mid_lc', 'mid_lw', 'mid_top', 'mid_rw', 'mid_rc', 'mid_top', 'mid_lw', 'mid_top', 'mid_rw', 'mid_top', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { years: '1998–2019', fg: 47.1, tp: 38.0, ft: 87.9, tpm: 1982, fact: '50-40-90 俱樂部成員，2007 年 MVP' },
    basis: {
      text: '依據 Dirk 自 16 歲起每年休賽季與導師 Holger Geschwindner 在德國特訓的報導；定點位置取自 Dirk 的招牌出手熱區，為本 App 設計',
      source: 'ESPN 2015', url: 'https://www.espn.com/nba/story/_/id/13893319/how-dirk-nowitzki-prepares-fire-all-cylinders',
    },
  },
  {
    id: 'allen_bucks', name: 'Ray Allen 雄鹿時期', short: 'Allen 雄鹿', player: 'Ray Allen', playerStatus: 'retired', tier: 6,
    focus: '雄鹿時期的三分開荒，五點三分＋中距補強', inspired: true, challenge: true,
    passRule: [{ type: '3pt', minPct: 32 }],
    passDesc: '3 分 ≥32%',
    easy: ['3pt_lc', '3pt_rc', '3pt_top', 'mid_top', 'ft', 'ft'],
    full: ['3pt_lc', '3pt_rc', '3pt_lw', '3pt_rw', '3pt_top', 'ft', 'mid_lw', 'mid_top', 'mid_rw', '3pt_top', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { label: 'NBA 公鹿時期 1996–2003', years: '1996–2003', fg: 45.0, tp: 40.6, ft: 87.9, tpm: 1051, fact: '2001 年三分大賽決賽連中十球逆轉封王' },
    basis: {
      text: '同一定點儀式的低強度入門改編：取材自 Allen 著名的賽前儀式（開賽前約 3 小時到場、五點依固定順序投籃），這裡對應雄鹿時期三分尚在開荒、搭中距補強的階段',
      source: 'Boston Globe 2008', url: 'http://archive.boston.com/sports/articles/2008/04/20/routine_excellence_is_allens_secret/',
    },
  },
  {
    id: 'allen', name: 'Ray Allen 三分入門', short: 'Allen 三分', player: 'Ray Allen', playerStatus: 'retired', tier: 7,
    focus: '底角→45°→弧頂固定順序三分定點', inspired: true, challenge: true,
    passRule: [{ type: '3pt', minPct: 35 }],
    passDesc: '3 分 ≥35%',
    easy: ['3pt_lc', '3pt_rc', '3pt_lw', '3pt_rw', '3pt_top', 'ft'],
    full: ['3pt_lc', '3pt_rc', '3pt_lw', '3pt_rw', '3pt_top', 'ft', '3pt_lc', '3pt_rc', '3pt_lw', '3pt_rw', '3pt_top', 'ft'],
    est: { easy: 30, full: 60 },
    career: { years: '1996–2014', fg: 45.2, tp: 40.0, ft: 89.4, tpm: 2973, fact: '前史上三分王（2,973 顆），2021 年才被 Curry 超越' },
    basis: {
      text: '取材自 Allen 著名的賽前儀式：開賽前約 3 小時到場，五個定點依固定順序投籃、分秒不差（原始儀式含中距五點）',
      source: 'Boston Globe 2008', url: 'http://archive.boston.com/sports/articles/2008/04/20/routine_excellence_is_allens_secret/',
    },
  },
  {
    id: 'klay_rise', name: 'Klay 新秀跳投', short: 'Klay 新秀', player: 'Klay Thompson', playerStatus: 'active', tier: 8,
    focus: '新秀年的接球跳投雛形，三分五點＋中距串接', inspired: true, challenge: true,
    passRule: [{ type: '3pt', minPct: 38 }],
    passDesc: '3 分 ≥38%',
    easy: ['3pt_lw', '3pt_top', '3pt_rw', 'mid_top', '3pt_top', 'ft'],
    full: ['3pt_lc', '3pt_lw', '3pt_top', '3pt_rw', '3pt_rc', 'ft', 'mid_lw', 'mid_top', 'mid_rw', '3pt_top', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { label: 'NBA 2011–12 新秀季', years: '2011–12', fg: 44.3, tp: 41.4, ft: 86.8, tpm: 111, fact: '新秀季三分命中率 41.4% 領先全體新秀，入選最佳新秀陣容' },
    basis: {
      text: '取材自 Klay 賽前五點循環進球制菜單，這裡改編成新秀年接球跳投雛形，三分五點串接中距補強',
      source: 'Bleacher Report 2014', url: 'https://bleacherreport.com/articles/2173236-team-usas-klay-thompson-breaks-down-the-skills-that-make-him-a-shooting-star',
    },
  },
  {
    id: 'klay', name: 'Klay 三分量產', short: 'Klay 量產', player: 'Klay Thompson', playerStatus: 'active', tier: 9,
    focus: '五點三分快速循環定點量產', inspired: true, challenge: true,
    passRule: [{ type: '3pt', minPct: 40 }],
    passDesc: '3 分 ≥40%',
    easy: ['3pt_lc', '3pt_lw', '3pt_top', '3pt_rw', '3pt_rc', 'ft'],
    full: ['3pt_lc', '3pt_lw', '3pt_top', '3pt_rw', '3pt_rc', 'ft', '3pt_lc', '3pt_lw', '3pt_top', '3pt_rw', '3pt_rc', 'ft'],
    est: { easy: 30, full: 60 },
    career: { years: '2011–現役', fg: 44.8, tp: 40.9, ft: 85.8, tpm: 2899, fact: '單場 14 顆三分的 NBA 紀錄保持人' },
    basis: {
      text: '取材自 Klay 於 2014 年自述的賽前菜單：五點循環進球制、被助教一句「別把手感留在訓練場」砍半到 15–20 分鐘',
      source: 'Bleacher Report 2014', url: 'https://bleacherreport.com/articles/2173236-team-usas-klay-thompson-breaks-down-the-skills-that-make-him-a-shooting-star',
    },
  },
  {
    id: 'lillard', name: 'Lillard 深三專項', short: 'Lillard 深三', player: 'Damian Lillard', playerStatus: 'active', tier: 10,
    focus: '深三＋一般三分混合定點', inspired: true, challenge: true,
    passRule: [{ type: 'deep3', minPct: 30 }],
    passDesc: '深 3 ≥30%',
    easy: ['3pt_top', 'deep_l', 'deep_top', 'deep_r', '3pt_top', 'ft'],
    full: ['3pt_lw', '3pt_top', '3pt_rw', 'deep_l', 'deep_top', 'deep_r', '3pt_top', 'deep_l', 'deep_top', 'deep_r', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { years: '2012–現役', fg: 43.9, tp: 37.1, ft: 89.9, tpm: 2804, fact: '以「logo shot」超遠三分聞名' },
    basis: {
      text: '取材自 Lillard 於 2018 年休賽季在拉斯維加斯與訓練師 Phil Beckner 的深三特訓：在三分線外 4 呎貼出「4 分線」逐點苦練',
      source: 'ESPN 2019', url: 'https://www.espn.com/nba/story/_/id/28312678/how-deep-audacious-3-pointers-taking-nba',
    },
  },
  {
    id: 'curry_mvp', name: 'Curry MVP 球季', short: 'Curry MVP', player: 'Stephen Curry', playerStatus: 'active', tier: 11,
    focus: 'MVP 球季的全點位三分量產＋深三初探', inspired: true, challenge: true,
    passRule: [{ type: '3pt', minPct: 42 }],
    passDesc: '3 分 ≥42%',
    easy: ['3pt_lw', '3pt_top', '3pt_rw', 'deep_top', '3pt_top', 'ft'],
    full: ['3pt_lc', '3pt_lw', '3pt_top', '3pt_rw', '3pt_rc', 'deep_top', '3pt_lw', '3pt_top', '3pt_rw', 'deep_top', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { label: 'NBA 2015–16 MVP 球季', years: '2015–16', fg: 50.4, tp: 45.4, ft: 90.8, tpm: 402, fact: '史上唯一全票 MVP，單季 402 顆三分至今無人接近' },
    basis: {
      text: '取材自 Curry 由近而遠的賽前儀式，這裡對應 MVP 球季全點位三分量產、深三初探的階段，最後以罰球收尾',
      source: 'ESPN 2018', url: 'https://www.espn.com/nba/story/_/id/22215844/steph-curry-pregame-show-anything-routine',
    },
  },
  {
    id: 'curry', name: 'Curry 終極試煉', short: 'Curry 試煉', player: 'Stephen Curry', playerStatus: 'active', tier: 12,
    focus: '全三分點＋深三＋罰球綜合定點', inspired: true, challenge: true,
    passRule: [{ type: '3pt', minPct: 45 }, { type: 'deep3', minPct: 35 }],
    passDesc: '3 分 ≥45% 且深 3 ≥35%（全破＝獲得徽章）',
    easy: ['3pt_lc', '3pt_top', '3pt_rc', 'deep_top', 'ft', '3pt_lw'],
    full: ['3pt_lc', '3pt_lw', '3pt_top', '3pt_rw', '3pt_rc', 'deep_l', 'deep_top', 'deep_r', '3pt_top', 'deep_top', 'ft', 'ft'],
    est: { easy: 30, full: 60 },
    career: { years: '2009–現役', fg: 47.1, tp: 42.2, ft: 91.2, tpm: 4248, fact: '史上三分王，2021 年超越 Ray Allen 登頂' },
    basis: {
      text: '取材自 Curry 約 20 分鐘、由近而遠的賽前儀式：五點各進 15 球、環繞三分、深位三分，最後以 tunnel shot 收尾',
      source: 'ESPN 2018', url: 'https://www.espn.com/nba/story/_/id/22215844/steph-curry-pregame-show-anything-routine',
    },
  },
  {
    id: 'free', name: '自由練習', player: null, playerStatus: null, tier: null,
    focus: '想投哪就投哪，每輪自選點位，隨時結束', inspired: false, challenge: false,
    passRule: null, passDesc: null, easy: null, full: null, est: null,
  },
  {
    id: 'world', name: '綜合巡迴', player: null, playerStatus: null, tier: null,
    focus: 'Around the World 全點位一圈，不掛名、無解鎖壓力', inspired: false, challenge: false,
    passRule: null, passDesc: null,
    easy: ['paint', 'mid_lw', 'mid_top', 'mid_rw', '3pt_top', 'ft'],
    full: ['paint', 'mid_lc', 'mid_lw', 'mid_top', 'mid_rw', 'mid_rc', '3pt_lc', '3pt_lw', '3pt_top', '3pt_rw', '3pt_rc', 'ft'],
    est: { easy: 30, full: 60 },
  },
];

export function getMenu(id) {
  return MENUS.find((m) => m.id === id) || null;
}

/** 依變體取出該菜單的輪次序列（spot id 陣列）；free 或未指定變體回傳 null（自由選點）。 */
export function getMenuRounds(menu, variant) {
  if (!menu) return null;
  if (variant === 'easy') return menu.easy || null;
  if (variant === 'full') return menu.full || null;
  return null;
}

/** 挑戰階梯（challenge:true 的菜單），依 tier 排序。 */
export function ladderMenus() {
  return MENUS.filter((m) => m.challenge).slice().sort((a, b) => a.tier - b.tier);
}

/** 階梯上某關的下一關 id；已是最後一關或找不到則回傳 null。 */
export function nextMenuId(id) {
  const ladder = ladderMenus();
  const idx = ladder.findIndex((m) => m.id === id);
  if (idx === -1 || idx === ladder.length - 1) return null;
  return ladder[idx + 1].id;
}

export function playerStatusLabel(status) {
  if (status === 'active') return '現役';
  if (status === 'retired') return '退役';
  return '';
}
