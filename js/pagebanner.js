// js/pagebanner.js
// 四個分頁共用的照片橫幅（SPEC_M6.2）。純 HTML 產生器，無狀態、無事件。
//
// 為什麼是橫幅而不是滿版底圖：這四頁都是資料密集頁（熱區球場圖、長條圖、
// 紀錄列表、數字），照片壓在資料底下會犧牲可讀性，且淺色模式實質消失。
// 橫幅把「質感」放在標題區，內容區維持紙感卡片 → 兩者都拿到。
//
// 裁切：橫幅在手機與桌面是同一個比例（App 本體是 max-width 480px 的置中欄，
// 桌面不會變寬），所以每張圖只需要一組 1000×420 的裁切，且已各自對準
// 籃框／球的位置（見 assets/tabbg/，裁切腳本記在 SPEC_M6.md）。

const BANNERS = {
  train: { img: 'assets/tabbg/train.jpg', title: '練球', sub: '選一份菜單，投一輪記一次', alt: '昏暗球館中，籃球正穿過籃網' },
  stats: { img: 'assets/tabbg/stats.jpg', title: '統計', sub: '熱區、趨勢、生涯累計', alt: '球館木地板上的籃球' },
  history: { img: 'assets/tabbg/history.jpg', title: '紀錄', sub: '每一次練習的完整帳本', alt: '球館地板上靜置的籃球' },
  settings: { img: 'assets/tabbg/settings.jpg', title: '設定', sub: '外觀、備份與資料', alt: '球館中的籃框與觀眾席' },
};

/** 分頁橫幅 HTML。extraHtml 會放在右上角（練球頁用來塞回首頁的連結）。 */
export function pageBannerHtml(tab, extraHtml = '') {
  const b = BANNERS[tab];
  if (!b) return '';
  return `
    <header class="page-banner page-banner--${tab}">
      <img class="page-banner__img" src="${b.img}" alt="${b.alt}" decoding="async" />
      <div class="page-banner__scrim"></div>
      ${extraHtml ? `<div class="page-banner__slot">${extraHtml}</div>` : ''}
      <div class="page-banner__text">
        <h1 class="page-banner__title">${b.title}</h1>
        <p class="page-banner__sub">${b.sub}</p>
      </div>
    </header>
  `;
}
