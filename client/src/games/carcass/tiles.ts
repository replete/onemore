import { tileSvg } from '@onemore/carcass-eon/art';

// One data URI per tile type and rotation, drawn once and reused as <image>s.
const cache = new Map<string, string>();

export function tileUri(def: string, rotation: number): string {
  const key = `${def}/${rotation}`;
  let uri = cache.get(key);
  if (!uri) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${tileSvg(def, rotation)}</svg>`;
    uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(key, uri);
  }
  return uri;
}

export const SEAT_COLOURS = ['#e0463e', '#3f7fe8', '#f2c230', '#3faa6a', '#b35fd6'];

export function seatColour(seat: string): string {
  return SEAT_COLOURS[(Number(seat.slice(1)) - 1) % SEAT_COLOURS.length]!;
}

/** A follower silhouette about 20 units tall, centred on the origin. */
export const MEEPLE =
  'M0 -10 C2.5 -10 3.5 -8 3.5 -6.5 C3.5 -5 2.8 -4.3 2 -4 L7 -2.5 C8.5 -2 8.5 0 7 0 L3.5 0 L6 8 L1.5 8 L0 4 L-1.5 8 L-6 8 L-3.5 0 L-7 0 C-8.5 0 -8.5 -2 -7 -2.5 L-2 -4 C-2.8 -4.3 -3.5 -5 -3.5 -6.5 C-3.5 -8 -2.5 -10 0 -10 Z';
