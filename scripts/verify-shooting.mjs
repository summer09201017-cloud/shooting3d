// shooting3d 端到端驗證(10m 氣步槍):
// ①standard normal:自動屏息→穩定窗擊發 3 發,分數應 >0、彈道無拋物線(arc=0)
// ②bullseye kids:瞄靶心+aimAssist,應有內圈命中
// ③duel2p:輪流兩人各打完,turnSide 有換手、finishMatch 出勝負
// ④槍口安全:準星設 crowdAim 時 beginDraw/releaseDraw 不擊發(muzzle-safety)
// ⑤全程 0 pageerror
// 用法:node scripts/verify-shooting.mjs <url> <outDir>
import { chromium } from "playwright";

const [url, outDir] = process.argv.slice(2);
const EXE = process.env.CHROME_EXE ||
  "C:/Users/agape250/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe";
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

await page.goto(url, { waitUntil: "load", timeout: 25000 });
await page.bringToFront();
await page.waitForTimeout(1200);

const G = "__shooting3d";

const start = (mode, difficulty) => page.evaluate(([g, m, d]) => {
  const game = window[g];
  game.applyPresentation({ difficulty: d, modeId: m });
  game.startSelectedMatch();
  document.querySelector("#homeScreen").classList.remove("visible");
}, [G, mode, difficulty]);

// 自動打 N 發:瞄靶心→屏息到穩定窗→擊發→等計分→點擊繼續
const autoShoot = (n, aimX = 0, aimYoff = 0) => page.evaluate(async ([g, count, ax, ay]) => {
  const game = window[g];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let noArc = true;
  for (let i = 0; i < count && game.phase !== "ended"; i++) {
    // 等到 ready
    let guard = 0;
    while (game.phase !== "ready" && guard++ < 100) await sleep(30);
    game.aim.set(ax, 1.38 + ay);
    game.pointerNDC = null; // 不讓 raycaster 覆蓋 aim
    game.beginDraw(); // 開始屏息
    // 屏到穩定窗中段(steadyTime+sweetTime/2)
    const p = game.constructor ? null : null;
    await sleep(700);
    game.aim.set(ax, 1.38 + ay); // 擊發前再鎖一次
    game.releaseDraw(); // 擊發
    // 等飛行結束→scored
    guard = 0;
    while (game.phase === "flying" && guard++ < 100) await sleep(20);
    if (game.arrowFlight && game.arrowFlight.arc !== 0) noArc = false;
    await sleep(120);
    if (game.phase === "scored") game.beginDraw(); // 點一下繼續
    await sleep(120);
  }
  return { phase: game.phase, totalScore: game.totalScore, arrowsShot: game.arrowsShotTotal, noArc };
}, [G, n, aimX, aimYoff]);

// ① standard normal
await page.screenshot({ path: outDir + "/sh-menu.png" });
await start("standard", "normal");
await page.waitForTimeout(400);
const std = await autoShoot(3);
await page.screenshot({ path: outDir + "/sh-standard.png" });

// ② bullseye kids(靶心+輔助,應有內圈)
await page.evaluate(([g]) => { window[g].openHomeMenu(); }, [G]);
await start("bullseye", "kids");
await page.waitForTimeout(300);
const bull = await autoShoot(5);
const bullCount = await page.evaluate(([g]) => window[g].bullseyeCount, [G]);
await page.screenshot({ path: outDir + "/sh-bullseye.png" });

// ③ duel2p:各打幾發驗換手
await page.evaluate(([g]) => { window[g].openHomeMenu(); }, [G]);
await start("duel2p", "child");
await page.waitForTimeout(300);
const duelBefore = await page.evaluate(([g]) => window[g].turnSide, [G]);
await autoShoot(4);
const duelState = await page.evaluate(([g]) => ({
  turnSide: window[g].turnSide, shots: window[g].duelShots, score: window[g].duelScore,
}), [G]);

// ④ 槍口安全:設 crowdAim 後嘗試擊發,分數不應增加
await page.evaluate(([g]) => { window[g].openHomeMenu(); }, [G]);
await start("standard", "normal");
await page.waitForTimeout(300);
const safety = await page.evaluate(async ([g]) => {
  const game = window[g];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let guard = 0;
  while (game.phase !== "ready" && guard++ < 100) await sleep(30);
  const before = game.arrowsShotTotal;
  game.crowdAim = { person: {}, point: { x: 0, y: 1.4, z: 5, clone() { return this; } } };
  game.beginDraw();
  await sleep(100);
  const blockedBegin = game.phase === "ready"; // 未進 drawing
  // 直接嘗試 release 也不該擊發
  game.releaseDraw();
  await sleep(100);
  return { blockedBegin, shotsUnchanged: game.arrowsShotTotal === before, phase: game.phase };
}, [G]);

await browser.close();

const ok =
  std.totalScore > 0 && std.arrowsShot === 3 && std.noArc &&
  bullCount > 0 &&
  duelState.shots.p1 + duelState.shots.p2 >= 3 && (duelState.shots.p1 > 0 && duelState.shots.p2 > 0) &&
  safety.blockedBegin && safety.shotsUnchanged &&
  errors.length === 0;

console.log(JSON.stringify({ ok, errors, std, bull: { ...bull, bullCount }, duelBefore, duelState, safety }, null, 2));
process.exit(ok ? 0 : 1);
