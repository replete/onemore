import { defineRoom, defineServer } from 'colyseus';
import { TableRoom } from './tableRoom';

export function createServer() {
  return defineServer({ rooms: { table: defineRoom(TableRoom) }, greet: false });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env['PORT'] ?? 2567);
  await createServer().listen(port, '0.0.0.0');
  console.log(`One More server listening on :${port}`);
}
