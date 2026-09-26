import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRoom, defineServer } from 'colyseus';
import express from 'express';
import { TableRoom } from './tableRoom';

const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));
const ROOM_PATH = /^\/[a-z]{3}-[a-z]{3}-[a-z]{3}\/?$/;

export function createServer() {
  return defineServer({
    rooms: { table: defineRoom(TableRoom) },
    greet: false,
    express: (app) => {
      // In production the game server also serves the built client, so one process runs everything.
      if (process.env['NODE_ENV'] !== 'production' || !existsSync(CLIENT_DIST)) return;
      app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
      app.get(['/', ROOM_PATH], (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env['PORT'] ?? 5551);
  await createServer().listen(port, '0.0.0.0');
  console.log(`One More server listening on :${port}`);
}
