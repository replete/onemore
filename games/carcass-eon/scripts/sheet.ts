// Contact sheet: every tile type in all four rotations, with follower anchors
// marked by feature kind. Open the HTML to check the tile data by eye.
//   pnpm --filter @onemore/carcass-eon sheet [out.html]

import { writeFileSync } from 'node:fs';
import { anchorAt, tileSvg } from '../src/art';
import { TILES } from '../src/tiles';

const out = process.argv[2] ?? 'carcass-eon-sheet.html';
const DOT: Record<string, string> = { city: '#c0262d', road: '#222', field: '#fff', monastery: '#7b2cbf' };

const rows = TILES.map((t) => {
  const cells = [0, 1, 2, 3]
    .map((r) => {
      const dots = t.features
        .map((f, i) => {
          const p = anchorAt(t.id, r, i);
          return `<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="${DOT[f.kind]}" stroke="#000" stroke-width="0.6"><title>${f.kind} ${i}</title></circle>`;
        })
        .join('');
      return `<svg viewBox="0 0 100 100" width="120" height="120">${tileSvg(t.id, r)}${dots}</svg>`;
    })
    .join('');
  return `<div class="row"><div class="label"><b>${t.id}</b><br>${t.name}<br>×${t.count}</div>${cells}</div>`;
}).join('\n');

writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Carcass Eon tiles</title>
<style>body{font:13px system-ui;background:#1d2a22;color:#eee;margin:16px}.row{display:flex;gap:8px;align-items:center;margin:6px 0}.label{width:220px}
.legend span{display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 4px 0 12px;border:1px solid #000}</style>
<h1>Carcass Eon: procedural tiles</h1>
<p class="legend">Follower anchors:<span style="background:#c0262d"></span>city<span style="background:#222"></span>road<span style="background:#fff"></span>field<span style="background:#7b2cbf"></span>monastery</p>
${rows}`,
);
console.log(`wrote ${out}`);
