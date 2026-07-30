// sw.js
// Shot Ledger Service Worker（SPEC_M14 §3.1 改版）。
//
// 舊策略是全站 network-first、只有 fetch「失敗」才吃快取。球場的弱訊號情境不是
// 「失敗」而是「很慢」——瀏覽器會一直等，快取形同不存在。新策略分兩軌：
//   1. 殼（導覽請求／HTML）：network-first ＋ 2.5 秒 race timeout。「不讓舊版黏住
//      小站」的原始考量仍成立，但逾時就先用快取把畫面畫出來。
//   2. 其餘同源 GET（js／css／圖）：cache-first ＋ 背景 revalidate。之所以安全，是
//      因為部署鐵律要求每次改版遞增 CACHE_NAME，activate 會刪掉舊快取 → 新版 SW
//      生效後第一次請求一定回源。
//
// 改版時把 CACHE_NAME 版號遞增，activate 階段會自動清掉舊版快取。

const CACHE_NAME = 'shotledger-v39';

const SHELL_URLS = ['./', 'index.html'];

// 開站必要資源：首頁殼、樣式、全部程式模組、manifest、兩顆 icon、首頁三張大圖
// （新訪客的落地頁，離線可用有意義）與四張分頁橫幅。
// favicon 是 index.html 內嵌的 data URI，不需要另外列。
const CORE = [
  './',
  'index.html',
  'css/tokens.css',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/home.js',
  'js/env.js',
  'js/pagebanner.js',
  'js/session.js',
  'js/statspage.js',
  'js/history.js',
  'js/menus.js',
  'js/stats.js',
  'js/badges.js',
  'js/court.js',
  'js/sharecard.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/home/home1.jpg',
  'assets/home/home2.jpg',
  'assets/home/home3.jpg',
  'assets/tabbg/train.jpg',
  'assets/tabbg/stats.jpg',
  'assets/tabbg/history.jpg',
  'assets/tabbg/settings.jpg',
];

// 分享卡底圖（約 810 KB）刻意不在 install 階段抓：只有按下「分享成績卡」才用得到，
// 首訪就在背景吃掉近 1 MB 行動數據不合理（SPEC_M14 §3.2）。改由頁面在第一次開
// 分享面板時 postMessage 過來補快取——頁面不自己開 cache，CACHE_NAME 只該有一個
// 真實來源。沒補到也不會壞：runtime 的 cache-first handler 照樣會在圖載入時存起來。
const CARD_BG = [
  'assets/cardbg/bg1.jpg',
  'assets/cardbg/bg2.jpg',
  'assets/cardbg/bg3.jpg',
  'assets/cardbg/bg4.jpg',
  'assets/cardbg/bg5.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'precache-cardbg') return;
  // 失敗靜默：補快取只是加速，分享卡本身照樣能從網路載圖。
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CARD_BG)).catch(() => {})
  );
});

const SHELL_TIMEOUT_MS = 2500;

/** 殼：network-first，但逾時／失敗就用快取先把畫面畫出來。 */
async function shellStrategy(req) {
  const cache = await caches.open(CACHE_NAME);
  const fromCache = () =>
    cache.match(req).then((hit) => hit || cache.match('./')).then((hit) => hit || cache.match('index.html'));

  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), SHELL_TIMEOUT_MS);
  });

  try {
    const res = await Promise.race([fetch(req), timeout]);
    if (res) {
      cache.put(req, res.clone()).catch(() => {});
      return res;
    }
    // 逾時：先給快取。網路那邊仍在跑，讓它自己回來更新快取（下次開就是新版）。
    const cached = await fromCache();
    if (cached) return cached;
    return await fetch(req); // 沒有任何快取可用，只能繼續等網路
  } catch (err) {
    const cached = await fromCache();
    if (cached) return cached;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 靜態資源：cache-first ＋ 背景 revalidate。 */
async function assetStrategy(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) {
    // 背景更新，不阻塞這次回應（失敗靜默：離線時本來就更新不了）。
    fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只攔同源 GET，其餘（POST、跨源請求等）一律放行，交回瀏覽器預設處理。
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // /stories/ 是獨立的靜態頁（射手檔案，SPEC_M17），不是 SPA 的殼：它們也是 navigate
  // 請求，但**絕不可以 fallback 到 index.html**——那會讓離線點進故事頁的人拿到 App
  // 首頁，看起來像網站壞了。用一般靜態資源策略（cache-first，沒有就回源）即可。
  const isStory = url.pathname.startsWith('/stories/');

  // 「殼」＝真正的導覽請求，或明確指向 index.html／根路徑的請求。
  // 注意 Cloudflare Pages 對任何不存在的路徑都回 200＋整份 index.html，所以
  // navigate 一律走殼策略，不去猜路徑。
  const isShell =
    !isStory &&
    (req.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname.endsWith('/index.html') ||
      SHELL_URLS.includes(url.pathname.replace(/^\//, '')));

  event.respondWith(isShell ? shellStrategy(req) : assetStrategy(req));
});
