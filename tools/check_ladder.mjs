// tools/check_ladder.mjs
// 挑戰階梯一致性檢查。跑法：node tools/check_ladder.mjs
//
// 為什麼要有這支：加一關要動的地方散在六七個檔案（menus.js 資料、stats.js 簽名星
// case、store.js migration、home.js 文案裡的「N 關」、徽章門檻、生涯分享卡的階梯格
// …），漏改任何一處都不會壞掉、只會**安靜地少一塊**（例如簽名星永遠拿不到、首頁
// 寫著 13 關但實際 14 關）。這支把「機器驗得出來的」全部驗掉，剩下的人工步驟寫在
// docs/ADDING_A_TIER.md。
//
// FAIL＝一定壞（exit 1）；WARN＝可能是刻意設計，自己看一眼確認。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MENUS, ladderMenus } from '../js/menus.js';
import { SPOTS } from '../js/court.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const fails = [];
const warns = [];
const fail = (msg) => fails.push(msg);
const warn = (msg) => warns.push(msg);

const ladder = ladderMenus();
const SPOT_IDS = new Set(SPOTS.map((s) => s.id));
const TYPES = new Set(SPOTS.map((s) => s.type));

console.log(`挑戰階梯：${ladder.length} 關（${ladder[0]?.id} … ${ladder[ladder.length - 1]?.id}）\n`);

// ---------------------------------------------------------------------------
// 1. tier 連號、唯一
// ---------------------------------------------------------------------------
const tiers = ladder.map((m) => m.tier);
tiers.forEach((t, i) => {
  if (t !== i + 1) fail(`tier 不連號：第 ${i + 1} 關（${ladder[i].id}）的 tier 是 ${t}，應為 ${i + 1}`);
});
const dupTier = tiers.filter((t, i) => tiers.indexOf(t) !== i);
if (dupTier.length) fail(`tier 重複：${[...new Set(dupTier)].join(', ')}`);

// 非挑戰菜單不該有 tier（自由練習／綜合巡迴）
MENUS.filter((m) => !m.challenge && m.tier !== null && m.tier !== undefined)
  .forEach((m) => fail(`非挑戰菜單 ${m.id} 帶了 tier=${m.tier}，應為 null`));

// ---------------------------------------------------------------------------
// 2. 挑戰菜單必要欄位
// ---------------------------------------------------------------------------
for (const m of ladder) {
  const need = ['id', 'name', 'short', 'player', 'playerStatus', 'focus', 'passDesc'];
  need.forEach((k) => {
    if (!m[k]) fail(`${m.id}：缺少 ${k}`);
  });
  if (!Array.isArray(m.passRule) || m.passRule.length === 0) fail(`${m.id}：passRule 必須是非空陣列`);
  if (!m.signature || !m.signature.label || !m.signature.desc) fail(`${m.id}：缺少 signature{label,desc}（★2 簽名星的說明）`);
  if (!Array.isArray(m.full) || m.full.length === 0) fail(`${m.id}：缺少 full 輪次序列`);
  if (!m.est || typeof m.est.full !== 'number') fail(`${m.id}：缺少 est.full（預估分鐘）`);
  if (!m.career) fail(`${m.id}：缺少 career（生涯數據；務必雙來源查證後才寫）`);
  if (!m.basis || !m.basis.text || !m.basis.source || !m.basis.url) {
    fail(`${m.id}：缺少 basis{text,source,url}（菜單出處聲明，不得憑印象寫）`);
  }
}

// ---------------------------------------------------------------------------
// 3. passRule／full 的合法性與「這關打得完嗎」
// ---------------------------------------------------------------------------
for (const m of ladder) {
  const spots = Array.isArray(m.full) ? m.full : [];
  spots.forEach((sid) => {
    if (!SPOT_IDS.has(sid)) fail(`${m.id}：full 出現不存在的點位 '${sid}'（court.js SPOTS 沒有）`);
  });
  const typesInRun = new Set(spots.map((sid) => SPOTS.find((s) => s.id === sid)).filter(Boolean).map((s) => s.type));

  (m.passRule || []).forEach((r) => {
    if (!TYPES.has(r.type)) fail(`${m.id}：passRule 的球種 '${r.type}' 不存在`);
    if (typeof r.minPct !== 'number' || r.minPct <= 0 || r.minPct > 100) fail(`${m.id}：passRule '${r.type}' 的 minPct 不合理（${r.minPct}）`);
    // 死關偵測：門檻的球種在這關的輪次序列裡根本沒出現 → 永遠不可能達標
    if (!typesInRun.has(r.type)) fail(`${m.id}：passRule 要求 '${r.type}'，但 full 序列裡沒有任何這種球種的輪次——這關無法過關`);
    // ★3 高標星＝門檻 +10pp，超過 100 就永遠拿不到
    if (r.minPct + 10 > 100) fail(`${m.id}：passRule '${r.type}' ${r.minPct}% ＋10pp 超過 100%，★3 高標星永遠拿不到`);
  });

  // 同一點位連排 3 輪以上：可能是複製貼上沒改（klay_rise 刻意連兩輪，兩輪不報）
  let run = 1;
  for (let i = 1; i < spots.length; i++) {
    run = spots[i] === spots[i - 1] ? run + 1 : 1;
    if (run >= 3) {
      warn(`${m.id}：full 有連續 ${run} 輪同一點位 '${spots[i]}'（第 ${i - run + 2}～${i + 1} 輪），確認是刻意的`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. 三星簽名規則：stats.js 的 evaluateSignature 必須有對應 case
// ---------------------------------------------------------------------------
const statsSrc = read('js/stats.js');
for (const m of ladder) {
  if (!new RegExp(`case\\s+'${m.id}'`).test(statsSrc)) {
    fail(`${m.id}：stats.js evaluateSignature() 沒有對應的 case——★2 簽名星永遠拿不到（default 回 false，不會報錯）`);
  }
}
// 反向：stats.js 有 case 但菜單已不存在
const caseIds = [...statsSrc.matchAll(/case\s+'([a-z0-9_]+)':/g)].map((m2) => m2[1]);
caseIds.forEach((id) => {
  if (!ladder.some((m) => m.id === id) && MENUS.some((m) => m.id === id) === false) {
    warn(`stats.js 有 case '${id}' 但菜單清單裡找不到這個 id（改名或刪關卡後的殘留？）`);
  }
});

// ---------------------------------------------------------------------------
// 5. store.js：第一關、schema 版號
// ---------------------------------------------------------------------------
const storeSrc = read('js/store.js');
const firstId = ladder[0]?.id;
if (firstId && !new RegExp(`unlocked:\\s*\\['${firstId}'\\]`).test(storeSrc)) {
  fail(`store.js emptyProgress() 的預設解鎖關卡與階梯第 1 關（${firstId}）不一致`);
}
const schemaDecl = storeSrc.match(/const SCHEMA_VERSION = (\d+)/);
const migrations = [...storeSrc.matchAll(/data\.schema < (\d+)/g)].map((m2) => Number(m2[1]));
if (schemaDecl && migrations.length) {
  const maxMigration = Math.max(...migrations);
  if (Number(schemaDecl[1]) !== maxMigration) {
    fail(`store.js SCHEMA_VERSION=${schemaDecl[1]}，但最後一段 migration 是 data.schema < ${maxMigration}——版號與 migration 沒對齊`);
  }
}

// ---------------------------------------------------------------------------
// 6. 徽章門檻：ladder_3 / ladder_7 必須拿得到
// ---------------------------------------------------------------------------
const badgesSrc = read('js/badges.js');
[...badgesSrc.matchAll(/id:\s*'ladder_(\d+)'[^}]*target:\s*(\d+)/g)].forEach((m2) => {
  const target = Number(m2[2]);
  if (target > ladder.length) fail(`徽章 ladder_${m2[1]} 門檻 ${target} 關 > 階梯總關數 ${ladder.length}，永遠拿不到`);
});

// ---------------------------------------------------------------------------
// 7. 硬編在文案裡的「N 關」
// ---------------------------------------------------------------------------
for (const rel of ['js/home.js', 'js/session.js', 'js/statspage.js', 'js/app.js', 'index.html']) {
  let src;
  try {
    src = read(rel);
  } catch (err) {
    continue;
  }
  [...src.matchAll(/(\d+)\s*關/g)].forEach((m2) => {
    const n = Number(m2[1]);
    // 只看「總關數」量級的數字（單關序號 1–13 也會命中，所以限定 >= 5 且不等於總數才報）
    if (n >= 5 && n !== ladder.length) {
      const line = src.slice(0, m2.index).split('\n').length;
      warn(`${rel}:${line} 出現「${n} 關」，但階梯目前是 ${ladder.length} 關——確認是不是漏改的文案`);
    }
  });
}

// ---------------------------------------------------------------------------
// 8. 生涯分享卡：階梯分段條的每一格還看得見嗎
// ---------------------------------------------------------------------------
const CARD_BAR_W = 1080 - 76 * 2; // 卡片內容寬（sharecard.js marginX=76）
const CARD_CELL_GAP = 10;
const cellW = (CARD_BAR_W - CARD_CELL_GAP * (ladder.length - 1)) / ladder.length;
if (cellW < 24) {
  fail(`生涯分享卡的階梯格只剩 ${cellW.toFixed(1)}px 寬（${ladder.length} 關），已經糊成一條——sharecard.js 要改成兩列或縮小間距`);
} else if (cellW < 34) {
  warn(`生涯分享卡的階梯格剩 ${cellW.toFixed(1)}px 寬（${ladder.length} 關），再加關就該考慮換排法`);
}

// ---------------------------------------------------------------------------
// 9. 通過狀態必須是明確記錄（SPEC_M11 §4.1），不能再用「下一關已解鎖」推導
// ---------------------------------------------------------------------------
// 根因回顧：插入新關（如第 11 關 lin_taiwan、第 11／14 關 brunson／bird）時，
// 若「通過」是靠「下一關已解鎖」推導，玩家沒打過的新關會被自動判定成已通過
// （因為玩家早就解鎖了新關後面那一關）。改版起通過要明確存在 progress.passed，
// 這裡驗兩件事：emptyProgress() 有沒有帶上 passed 欄位、三個顯示層有沒有殘留
// 舊的推導寫法（字串比對抓 unlocked(Ids)?.includes(next 這個特徵樣式）。
const emptyProgressMatch = storeSrc.match(/function emptyProgress\(\)\s*\{[\s\S]*?\n\}/);
if (!emptyProgressMatch || !/passed\s*:/.test(emptyProgressMatch[0])) {
  fail(`store.js emptyProgress() 沒有 passed 欄位——「通過」無法明確記錄，會退回用 unlocked 推導的舊洞`);
}
const OLD_DERIVATION_RE = /unlocked(Ids)?\.includes\(\s*next\b/;
for (const rel of ['js/badges.js', 'js/sharecard.js', 'js/session.js']) {
  let src;
  try {
    src = read(rel);
  } catch (err) {
    continue;
  }
  if (OLD_DERIVATION_RE.test(src)) {
    warn(`${rel} 疑似殘留「下一關已解鎖＝通過」的舊推導寫法——通過狀態應該改讀 progress.passed（SPEC_M11 §4.1）`);
  }
}

// ---------------------------------------------------------------------------
// 結果
// ---------------------------------------------------------------------------
warns.forEach((w) => console.log(`  WARN - ${w}`));
fails.forEach((f) => console.error(`  FAIL - ${f}`));
console.log('');
if (fails.length) {
  console.error(`${fails.length} 項不通過、${warns.length} 項提醒`);
  process.exitCode = 1;
} else {
  console.log(`階梯檢查通過（${warns.length} 項提醒）`);
}
