// Headless browser checks against a running dev setup (pnpm dev), or pass BASE=...
//   pnpm e2e
// 1. 21: a TV and two phones join; the game starts; a phone reloads mid-game and gets its seat back; a round is played.
// 2. Carcass Eon: a full game with drawing, dragging tiles onto the map and followers, to the final scores.
// Fails (exit 1) on any page error or stuck step.

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:5550';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`e2e: ${m}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: join(tmpdir(), `onemore-e2e-${Date.now()}`),
});

async function device(name, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  return page;
}
const TV = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function clickText(page, text, timeout = 8000) {
  const h = await page.waitForFunction(
    (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t) && !b.disabled),
    { timeout },
    text,
  );
  await h.asElement().click();
}
const hasText = (page, text, timeout = 8000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
async function centre(handle) {
  const b = await handle.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function setUp(game, players) {
  const tv = await device('tv', TV);
  await tv.goto(BASE);
  await clickText(tv, 'Start a room');
  await tv.waitForFunction(() => /^\/[a-z]{3}-[a-z]{3}-[a-z]{3}$/.test(location.pathname));
  const code = new URL(tv.url()).pathname.slice(1);
  await hasText(tv, 'Make this the shared screen');
  await sleep(400);
  await clickText(tv, game);
  await sleep(300);
  await clickText(tv, 'Make this the shared screen');
  await hasText(tv, 'Scan to join');
  const phones = [];
  for (const name of players) {
    const p = await device(name, PHONE);
    await p.goto(`${BASE}/${code}`);
    await p.waitForSelector('#name');
    await p.type('#name', name);
    await clickText(p, 'Join');
    await hasText(p, `You're in, ${name}`);
    phones.push(p);
  }
  await sleep(500);
  await clickText(tv, 'Start game');
  return { tv, phones, code };
}

async function twentyOne() {
  const { tv, phones } = await setUp('21', ['Sam', 'Jo']);
  await hasText(tv, 'Dealer');
  await phones[0].reload();
  await hasText(phones[0], 'Dealer', 8000);
  for (let i = 0; i < 20 && !(await tv.evaluate(() => document.body.innerText.includes('Round over'))); i++) {
    for (const p of phones) {
      const labels = await p.evaluate(() => [...document.querySelectorAll('.buttons button')].map((b) => b.textContent.trim()));
      if (labels.includes('Stand')) await clickText(p, 'Stand');
    }
    await sleep(300);
  }
  await hasText(tv, 'Round over');
  log('21: round played, reload resumed the seat');
}

async function carcassEon() {
  const { tv, phones } = await setUp('Carcass Eon', ['Sam', 'Jo']);
  await hasText(tv, 'tiles left');
  let placed = 0;
  for (let turn = 0; turn < 200; turn++) {
    if (await tv.evaluate(() => document.body.innerText.includes('Final scores'))) break;
    let page = null;
    for (let i = 0; i < 60 && !page; i++) {
      for (const p of phones) if (await p.$('.stack.drawable')) page = p;
      if (!page) await sleep(50);
    }
    if (!page) continue;
    await page.click('.stack.drawable');
    await page.waitForSelector('.hand', { timeout: 8000 });
    await sleep(650); // let the tile finish sliding off the stack
    for (let attempt = 0; attempt < 5 && (await page.$('.hand')); attempt++) {
      const ghosts = await page.$$('rect.ghost');
      const from = await centre(await page.$('.hand'));
      const to = await centre(ghosts[Math.floor(Math.random() * ghosts.length)]);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
      await sleep(250);
    }
    await page.waitForFunction(() => !document.querySelector('.hand'), { timeout: 5000 });
    placed++;
    await sleep(100);
    if (await page.$('g.hotspot')) {
      const spots = await page.$$('g.hotspot');
      if (Math.random() < 0.5 && spots.length) {
        await spots[0].click();
        await clickText(page, 'Place follower');
      } else {
        await clickText(page, 'No follower');
      }
    }
    await sleep(100);
  }
  await hasText(tv, 'Final scores', 10000);
  log(`Carcass Eon: full game, ${placed} tiles placed by dragging`);
}

let failed = false;
try {
  await twentyOne();
  await carcassEon();
} catch (err) {
  failed = true;
  console.error(`e2e: FAILED: ${err.message}`);
}
if (errors.length) {
  failed = true;
  console.error(`e2e: page errors:\n${errors.join('\n')}`);
}
await browser.close();
log(failed ? 'failed' : 'passed');
process.exit(failed ? 1 : 0);
