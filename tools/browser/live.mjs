// A live, visible session (pnpm live; needs `pnpm dev` running): a "TV" window and phone windows, driven with pauses so a
// person can watch. After the scripted part, it keeps the windows open and reads
// commands appended to live-commands.txt (one per line):
//   turns N        auto-play N more turns
//   drop NAME      close that phone's tab (phone died / browser closed)
//   back NAME      reopen it (saved seat token brings the player back)
//   rejoin NAME    a brand-new phone for NAME (no token): ask for the seat, TV approves
//   layout follow|whole   switch the TV layout
//   quit           close everything

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:5550';
const GAME = process.env.GAME ?? 'Carcass Eon';
const PLAYERS = (process.env.PLAYERS ?? 'Sam,Jo').split(',');
const OPENING_TURNS = Number(process.env.TURNS ?? 10);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COMMANDS = process.env.COMMANDS ?? join(tmpdir(), 'onemore-live-commands.txt');
const PROFILE = join(tmpdir(), `onemore-live-profile-${Date.now()}`);
writeFileSync(COMMANDS, '');

const say = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const beat = () => sleep(900 + Math.random() * 700);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  defaultViewport: null,
  userDataDir: PROFILE,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-infobars'],
});

async function place(page, { left, top, width, height }) {
  const s = await page.target().createCDPSession();
  const { windowId } = await s.send('Browser.getWindowForTarget');
  await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  await s.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } });
}

// Screen size, to lay the windows out side by side.
const [first] = await browser.pages();
const screen = await first.evaluate(() => ({ w: screen.availWidth, h: screen.availHeight }));
const phoneW = 380;
const phoneH = Math.min(860, screen.h - 20);
const tvW = Math.max(700, screen.w - PLAYERS.length * (phoneW + 8) - 16);
const tvH = Math.min(Math.round(tvW * 0.62) + 90, screen.h - 20);

const tv = first;
await place(tv, { left: 0, top: 0, width: tvW, height: tvH });

const phones = new Map(); // name -> { ctx, page }
async function openPhone(name, index, url, ctx) {
  ctx ??= await browser.createBrowserContext();
  const page = await ctx.newPage();
  await place(page, { left: tvW + 8 + index * (phoneW + 8), top: 0, width: phoneW, height: phoneH });
  await page.setViewport({ width: phoneW - 16, height: phoneH - 110, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('dialog', (d) => d.accept());
  if (url) await page.goto(url);
  phones.set(name, { ctx, page });
  return page;
}

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

// --- The scripted session -------------------------------------------------------------

say('TV: opening One More');
await tv.goto(BASE);
await beat();
say('TV: Start a room');
await clickText(tv, 'Start a room');
await tv.waitForFunction(() => /^\/[a-z]{3}-[a-z]{3}-[a-z]{3}$/.test(location.pathname));
const code = new URL(tv.url()).pathname.slice(1);
await hasText(tv, 'Make this the shared screen');
await beat();
say(`TV: choosing ${GAME}`);
await clickText(tv, GAME);
await beat();
say('TV: Make this the shared screen');
await clickText(tv, 'Make this the shared screen');
await hasText(tv, 'Scan to join');
say(`Room ${code} is up. Phones "scan the QR code"…`);
await beat();

for (const [i, name] of PLAYERS.entries()) {
  const page = await openPhone(name, i, `${BASE}/${code}`);
  await page.waitForSelector('#name');
  await beat();
  say(`${name}: typing their name`);
  await page.type('#name', name, { delay: 140 });
  await beat();
  await clickText(page, 'Join');
  await hasText(page, `You're in, ${name}`);
  say(`${name} joined`);
  await beat();
}

await sleep(1200);
say('TV: Start game');
await clickText(tv, 'Start game');
await sleep(1500);

async function whoseTurn() {
  for (let i = 0; i < 100; i++) {
    for (const [name, { page }] of phones) {
      if (!page.isClosed() && (await page.$('.stack.drawable'))) return [name, page];
    }
    await sleep(100);
  }
  return [null, null];
}

async function centre(handle) {
  const b = await handle.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function dragTo(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 28 });
  await sleep(350);
  await page.mouse.up();
}

async function playTurn() {
  const [name, page] = await whoseTurn();
  if (!page) return say('No one is drawing (game over, or waiting on a dropped phone)');
  await sleep(1200);
  say(`${name}: taking the top tile`);
  await page.click('.stack.drawable');
  await page.waitForSelector('.hand', { timeout: 8000 });
  await sleep(1300);
  if (Math.random() < 0.35) {
    await page.click('.hand');
    say(`${name}: rotating`);
    await sleep(800);
  }
  const ghosts = await page.$$('rect.ghost');
  if (ghosts.length) {
    say(`${name}: dragging the tile onto the map`);
    await dragTo(page, await centre(await page.$('.hand')), await centre(ghosts[Math.floor(Math.random() * ghosts.length)]));
  } else {
    // Hints off: try squares until one takes the tile, rotating between rounds.
    for (let round = 0; round < 4 && (await page.$('.hand')); round++) {
      for (const t of await page.$$('rect.target')) {
        if (!(await page.$('.hand'))) break;
        await dragTo(page, await centre(await page.$('.hand')), await centre(t));
        await sleep(250);
      }
      if (await page.$('.hand')) await page.click('.hand');
    }
  }
  await sleep(900);
  if (await page.$('g.hotspot')) {
    const spots = await page.$$('g.hotspot');
    if (Math.random() < 0.55 && spots.length) {
      await spots[Math.floor(Math.random() * spots.length)].click();
      await sleep(700);
      await clickText(page, 'Place follower');
      say(`${name}: placed a follower`);
    } else {
      await clickText(page, 'No follower');
      say(`${name}: no follower`);
    }
  }
  await sleep(1200);
}

async function safeTurn() {
  try {
    await playTurn();
  } catch (err) {
    say(`turn failed: ${err.message.split('\n')[0]}`);
  }
}
for (let t = 0; t < OPENING_TURNS; t++) await safeTurn();
say(`Scripted part done. Windows stay open. Commands: append to ${COMMANDS}`);

// --- Commands --------------------------------------------------------------------------

let done = 0;
const deadline = Date.now() + 60 * 60_000;
while (Date.now() < deadline) {
  await sleep(500);
  if (!existsSync(COMMANDS)) continue;
  const lines = readFileSync(COMMANDS, 'utf8').split('\n').filter(Boolean);
  for (const line of lines.slice(done)) {
    done += 1;
    const [cmd, arg] = line.trim().split(/\s+/);
    say(`> ${line.trim()}`);
    try {
      if (cmd === 'quit') {
        await browser.close();
        process.exit(0);
      } else if (cmd === 'turns') {
        for (let t = 0; t < Number(arg ?? 1); t++) await safeTurn();
      } else if (cmd === 'drop') {
        const p = phones.get(arg);
        await p.page.close();
        say(`${arg}'s phone is gone. The TV should show them reconnecting, then the game plays for them.`);
      } else if (cmd === 'back') {
        const p = phones.get(arg);
        const index = PLAYERS.indexOf(arg);
        await openPhone(arg, index, `${BASE}/${code}`, p.ctx);
        say(`${arg} reopened the link: their saved token should bring them straight back`);
      } else if (cmd === 'rejoin') {
        const index = PLAYERS.indexOf(arg);
        const old = phones.get(arg);
        if (old && !old.page.isClosed()) await old.page.close();
        const page = await openPhone(arg, index, `${BASE}/${code}`);
        await page.waitForSelector('#name');
        await page.type('#name', arg, { delay: 140 });
        await clickText(page, 'Join');
        await sleep(1200);
        await clickText(page, `I’m ${arg}`);
        say(`${arg} (new phone) asked for their seat back`);
        await sleep(1800);
        await clickText(tv, 'Let them in');
        say('TV (admin): let them in');
      } else if (cmd === 'layout') {
        await clickText(tv, arg === 'follow' ? 'Follow the action' : 'Whole map');
      } else {
        say(`unknown command: ${cmd}`);
      }
    } catch (err) {
      say(`command failed: ${err.message}`);
    }
  }
}
await browser.close();
