// js/home.js
// 首頁 landing（#/home，SPEC_M6）：三段全屏照片介紹 ＋ 一屏訓練入口。
// 只在裸網址且 settings.homeSeen === false 時自動落地，看過就跳過；#/home 永遠手動可回。
//
// 質感的三根支柱（使用者明確要求「不要只是把字推上照片」）：
//   1. 視差——照片以 0.25 係數慢速位移，字以正常速度走，產生景深。
//   2. scrim 依圖配——每張照片亮部位置不同，統一壓黑會髒，故逐段給方向性漸層。
//   3. 進場——序號→標題→內文錯開 60ms 淡入上浮，只播一次。
// 三者在 prefers-reduced-motion 下全關（連 scroll listener 都不掛）。

import * as store from './store.js';
import { requestOpenMenu } from './session.js';

const SECTIONS = [
  {
    n: '01',
    img: 'assets/home/home1.jpg',
    alt: '昏暗球館中，籃球正穿過球網',
    title: '記下每一球，<br>不只記得手感',
    body: '選一份菜單、投一輪、回來點一下。不用邊投邊打字，也不用投完才憑印象回想今天準不準。',
  },
  {
    n: '02',
    img: 'assets/home/home2.jpg',
    alt: '俯視戶外球場，籃球停在紅色三分線內',
    title: '熱區會自己說話',
    body: '快速記整輪，或逐球記進出。投完就看得到哪裡準、哪裡該練——球場圖上每個點都有自己的命中率。',
  },
  {
    n: '03',
    img: 'assets/home/home3.jpg',
    alt: '夕陽下，籃球正要落進籃框',
    title: '13 關生涯階梯',
    body: '從 Lin 的哈佛時期一路到 Curry 的終極試煉，達標才解鎖下一關。菜單取材自公開報導的訓練風格。',
  },
];

const ENTRIES = [
  { menu: null, n: '01', title: '挑戰階梯', sub: '13 關生涯之路，一關一關解鎖', tag: 'LADDER' },
  { menu: 'free', n: '02', title: '自由練習', sub: '想投哪就投哪，不指定點位', tag: 'FREE' },
  { menu: 'world', n: '03', title: '綜合巡迴', sub: '全場繞一圈，各距離都練到', tag: 'TOUR' },
];

let root = null;
let state = null;
let layers = []; // 視差圖層：三段 hero 的 <img>
let observer = null;
let rafId = null;
const reduceMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

export function mount(container) {
  root = container;
  state = store.load();
  document.body.classList.add('is-home'); // 首頁滿版：藏 tab bar、清掉 .app-main 的 padding

  root.innerHTML = `
    <div class="page page--landing${reduceMotion ? ' is-static' : ''}">
      ${SECTIONS.map(renderSectionHtml).join('')}
      ${renderEntriesHtml()}
    </div>
  `;

  root.addEventListener('click', onClick);
  window.scrollTo(0, 0); // 從其他分頁切過來時，捲動位置要歸零，否則會落在第二屏中間

  if (!reduceMotion) {
    layers = Array.from(root.querySelectorAll('.home-hero__img'));
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target); // 只播一次
        });
      },
      { threshold: 0.35 }
    );
    root.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
  }
}

export function unmount() {
  document.body.classList.remove('is-home');
  if (observer) observer.disconnect();
  observer = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  window.removeEventListener('scroll', onScroll);
  if (root) root.removeEventListener('click', onClick);
  layers = [];
  root = null;
}

function renderSectionHtml(s, i) {
  return `
    <section class="home-hero home-hero--${i + 1}">
      <img class="home-hero__img" src="${s.img}" alt="${s.alt}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />
      <div class="home-hero__scrim"></div>
      ${i === 0 ? renderWordmarkHtml() : ''}
      <div class="home-hero__text" data-reveal>
        <p class="home-hero__num">${s.n}</p>
        <h2 class="home-hero__title">${s.title}</h2>
        <p class="home-hero__body">${s.body}</p>
      </div>
      ${i === 0 ? '<div class="home-scroll-hint" aria-hidden="true"><span class="home-scroll-hint__line"></span></div>' : ''}
    </section>
  `;
}

function renderWordmarkHtml() {
  // SPEC_M6.4：字標升為 h1——這是全站唯一沒有 h1 的主要畫面，而它正是裸網址
  // 首次落地的那一頁。css/app.css 的「h1, h2, h3, p { margin: 0; }」已經把兩者的
  // margin 都清成 0，所以從 <p> 換成 <h1> 不需要額外補 margin，視覺不受影響。
  return `
    <div class="home-wordmark">
      <h1 class="home-wordmark__name">Shot Ledger</h1>
      <p class="home-wordmark__sub">投籃訓練紀錄本</p>
    </div>
  `;
}

// SPEC_M6.3：入口從卡片改成目錄列——序號延續前三屏 01/02/03 的語彙，
// 讓第四屏跟前面連成同一本紀錄本，而不是另外長出一組通用 App 卡片。
function renderEntriesHtml() {
  const cards = ENTRIES.map(
    (e) => `
      <button class="home-entry" data-menu="${e.menu === null ? '' : e.menu}">
        <span class="home-entry__num">${e.n}</span>
        <span class="home-entry__text">
          <span class="home-entry__title">${e.title}</span>
          <span class="home-entry__sub">${e.sub}</span>
        </span>
        <span class="home-entry__tag" aria-hidden="true">${e.tag}</span>
      </button>
    `
  ).join('');

  return `
    <section class="home-entries">
      <div class="home-entries__inner" data-reveal>
        <p class="home-entries__kicker">開始練球</p>
        <h2 class="home-entries__title">今天想練什麼？</h2>
        <div class="home-entries__list">${cards}</div>
        <p class="home-entries__credit">照片：Markus Spiske・Jeremy Wallace・Tom Briskey／Unsplash</p>
      </div>
    </section>
  `;
}

/** 視差：一次算完三段（不是每段各掛一個 listener）。位移量 = 該段中心與視窗中心的距離 × 0.25，
 *  圖走得比字慢 → 景深。scale(1.12) 是給位移留的裁切餘裕，否則會露出邊。 */
function onScroll() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const viewH = window.innerHeight;
    layers.forEach((img) => {
      const rect = img.parentElement.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const offset = (center - viewH / 2) * -0.25;
      img.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(1.12)`;
    });
  });
}

function onClick(e) {
  const entry = e.target.closest('.home-entry');
  if (entry) {
    store.markHomeSeen(state);
    requestOpenMenu(entry.dataset.menu || null);
    return;
  }
  if (e.target.closest('.home-scroll-hint')) {
    window.scrollTo({ top: window.innerHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}
