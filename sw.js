// sw.js
// Shot Ledger Service Worker：network-first、離線才吃快取，避免舊版黏住小站。
// 改版時把 CACHE_NAME 版號遞增，activate 階段會自動清掉舊版快取。

const CACHE_NAME = 'shotledger-v9';

// 開站必要資源：首頁殼、樣式、全部程式模組、manifest、兩顆 icon。
// favicon 是 index.html 內嵌的 data URI，不需要另外列。
const CORE = [
  './',
  'index.html',
  'css/tokens.css',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/session.js',
  'js/statspage.js',
  'js/history.js',
  'js/menus.js',
  'js/stats.js',
  'js/court.js',
  'js/sharecard.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只攔同源 GET，其餘（POST、跨源請求等）一律放行，交回瀏覽器預設處理。
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // './' 與 'index.html' 互為 fallback，離線首次載入哪一個都能吃到殼。
        return (await caches.match('./')) || (await caches.match('index.html'));
      })
  );
});
