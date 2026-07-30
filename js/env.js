// js/env.js
// 執行環境判斷（SPEC_M14 §4.2b）。只做兩件事：判斷「是不是已經加到主畫面在跑」、
// 以及「該顯示哪一種安裝步驟的文案」。
//
// 紀律：這裡的判斷只用來決定「講哪句話」，絕不用來決定「要不要顯示引導」——
// UA 判斷本來就不可靠，判斷錯的最壞情況必須只是文案不夠精確，不能變成有人
// 永遠看不到引導。

/**
 * 是否以「已安裝的 App」形式在跑（加到主畫面／桌面）。
 * - display-mode: standalone 是標準做法（Android Chrome 系、桌面 Chrome／Edge）
 * - navigator.standalone 是 iOS Safari 的私有旗標，只有它認
 * - minimal-ui／fullscreen 也算已安裝（有人會在 manifest 改 display）
 */
export function isStandalone() {
  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return ['standalone', 'minimal-ui', 'fullscreen'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches
  );
}

/**
 * 安裝步驟要講哪一套。
 * iPad 自 iPadOS 13 起 UA 預設偽裝成 Mac，靠 'iPad' 字串會漏——補一個
 * 「Mac 但有觸控點」的判斷（桌面 Mac 沒有 maxTouchPoints > 1）。
 * @returns {'ios'|'android'|'desktop'}
 */
export function installPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** 該平台「加到主畫面」的一句話步驟（給引導卡與設定頁共用，文案只有一份）。 */
export function installSteps(platform = installPlatform()) {
  if (platform === 'ios') return '按瀏覽器下方的分享鈕，選「加入主畫面」。';
  if (platform === 'android') return '按瀏覽器右上角的選單，選「安裝應用程式」或「加到主畫面」。';
  return '按網址列右側的安裝圖示，或從瀏覽器選單選「安裝」。';
}
