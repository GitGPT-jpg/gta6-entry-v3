// city.js — Porto Verde: a coastal port city built on a road grid.
// World units are pixels at zoom 1. Water hugs the south and west edges;
// the docks are piers on the south water, the beach is the west sand strip.
import { rand, randi, pick, clamp } from './util.js';

export const WORLD_W = 2600;
export const WORLD_H = 2000;
export const ROAD_W = 64;

// Vertical road centre-lines and horizontal road centre-lines.
const VX = [150, 410, 670, 930, 1190, 1450, 1710, 1970, 2230, 2470];
const HY = [150, 410, 670, 930, 1190, 1450, 1710];

const ZONE_COLORS = {
  downtown: ['#7d6b8f', '#6b5b7d', '#8a7a9e', '#5f5470'],
  residential: ['#b08a6a', '#a07a5e', '#c09a72', '#96705a'],
  industrial: ['#6e7d84', '#5d6c73', '#7d8b8f', '#4f5e64'],
  marina: ['#5e7d8a', '#54707c', '#6b8a96'],
  park: ['#4d7a4d'],
  market: ['#a08a4d', '#8f7a42'],
};

function zoneAt(x, y) {
  if (x > 1500 && y < 800) return 'industrial';
  if (x > 1950 && y > 1200) return 'marina';
  if (x > 800 && x < 1700 && y > 500 && y < 1200) return 'downtown';
  if (x < 800 && y < 700) return 'residential';
  if (x > 2000 && y < 700) return 'residential';
  return 'residential';
}

export function buildCity(seed = 7) {
  let s = seed >>> 0;
  const rng = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (a, b) => a + rng() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));

  const buildings = [];
  const parks = [];
  const lots = [];
  const props = []; // {x, y, kind: 'crate'|'container'|'tree'|'lamp'|'palm'|'barrel'}

  // Blocks: between neighbouring road centrelines.
  for (let i = 0; i < VX.length - 1; i++) {
    for (let j = 0; j < HY.length - 1; j++) {
      const x0 = VX[i] + ROAD_W / 2 + 8;
      const x1 = VX[i + 1] - ROAD_W / 2 - 8;
      const y0 = HY[j] + ROAD_W / 2 + 8;
      const y1 = HY[j + 1] - ROAD_W / 2 - 8;
      const bw = x1 - x0, bh = y1 - y0;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const zone = zoneAt(cx, cy);
      // South strip is docks / water: no buildings below y 1750.
      if (y0 > 1700) continue;
      // One park block and one market block, fixed spots.
      if (i === 4 && j === 3) { parks.push({ x: x0, y: y0, w: bw, h: bh }); continue; }
      if (i === 7 && j === 4) {
        lots.push({ x: x0, y: y0, w: bw, h: bh, kind: 'market' });
        for (let k = 0; k < 6; k++) props.push({ x: rr(x0 + 20, x1 - 20), y: rr(y0 + 20, y1 - 20), kind: 'crate' });
        continue;
      }
      if (i === 2 && j === 5) {
        lots.push({ x: x0, y: y0, w: bw, h: bh, kind: 'parking' });
        continue;
      }
      // 1-4 buildings per block.
      const n = zone === 'downtown' ? ri(2, 4) : ri(1, 3);
      const cols = n >= 3 ? 2 : 1;
      const rows = Math.ceil(n / cols);
      for (let k = 0; k < n; k++) {
        const gx = x0 + (k % cols) * (bw / cols);
        const gy = y0 + Math.floor(k / cols) * (bh / rows);
        const w = bw / cols - 18 - rr(0, 14);
        const h = bh / rows - 18 - rr(0, 14);
        const tall = zone === 'downtown' ? rr(26, 60) : zone === 'industrial' ? rr(14, 22) : rr(10, 20);
        buildings.push({
          x: gx + 9, y: gy + 9, w, h, hgt: tall,
          color: pick(ZONE_COLORS[zone] || ZONE_COLORS.residential),
          zone, seed: ri(0, 9999),
        });
      }
      // Trees / lamps around the block.
      for (let k = 0; k < 3; k++) {
        props.push({ x: rr(x0, x1), y: rr(y0, y1), kind: zone === 'marina' ? 'palm' : 'tree' });
      }
    }
  }

  // Docks: piers jutting into the south water with containers and crates.
  const piers = [];
  for (const px of [420, 900, 1380, 1860, 2260]) {
    piers.push({ x: px - 46, y: 1760, w: 92, h: 190 });
    for (let k = 0; k < 4; k++) {
      props.push({ x: px + rr(-38, 38), y: rr(1780, 1920), kind: k % 2 ? 'container' : 'crate' });
    }
  }
  // Containers yard on the east docks.
  for (let k = 0; k < 10; k++) {
    props.push({ x: rr(2050, 2420), y: rr(1560, 1700), kind: 'container' });
  }
  // Barrels near the industrial blocks.
  for (let k = 0; k < 12; k++) props.push({ x: rr(1600, 2400), y: rr(200, 700), kind: 'barrel' });
  // Palm trees along the beach.
  for (let k = 0; k < 14; k++) props.push({ x: rr(90, 130), y: rr(100, 1900), kind: 'palm' });

  // Hidden packages: 10 golden anchors scattered around the map.
  const packageSpots = [
    { x: 120, y: 120 }, { x: 2450, y: 180 }, { x: 660, y: 930 }, { x: 1190, y: 150 },
    { x: 420, y: 1860 }, { x: 1860, y: 1930 }, { x: 930, y: 1190 }, { x: 2230, y: 930 },
    { x: 150, y: 1450 }, { x: 1710, y: 410 },
  ];
  const packages = packageSpots.map((p, i) => ({ id: i, x: p.x, y: p.y, taken: false }));

  // Landmarks / mission spots.
  const spots = {
    safehouse: { x: 300, y: 300, label: "Marco's Apartment" },
    garage: { x: 2050, y: 1250, label: "Rosa's Garage" },
    pawnshop: { x: 1180, y: 660, label: 'Pawn Shop' },
    marina: { x: 2230, y: 1450, label: 'Marina' },
    warehouse: { x: 1900, y: 500, label: 'Port Warehouse' },
    docks: { x: 900, y: 1830, label: 'Docks' },
    market: { x: 1980, y: 1250, label: 'Night Market' },
    hospital: { x: 660, y: 300, label: 'Hospital' },
    police: { x: 1450, y: 930, label: 'Police HQ' },
  };

  return {
    w: WORLD_W, h: WORLD_H, roadsX: VX, roadsY: HY,
    buildings, parks, lots, props, piers, packages, spots,
  };
}

// --- Geometry queries used by gameplay ---

export function isWater(city, x, y) {
  if (y > 1760 && !city.piers.some(p => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h)) return true;
  if (x < 70) return true;
  return false;
}

export function isRoad(city, x, y) {
  if (city.roadsX.some(rx => Math.abs(x - rx) < ROAD_W / 2)) return true;
  if (city.roadsY.some(ry => Math.abs(y - ry) < ROAD_W / 2)) return true;
  return false;
}

export function nearestRoadPoint(city, x, y) {
  let best = null, bd = Infinity;
  for (const rx of city.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; best = { x: rx, y, vertical: true }; }
  }
  for (const ry of city.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; best = { x, y: ry, vertical: false }; }
  }
  return best;
}

// Push a circle (x, y, r) out of buildings and water; returns corrected {x, y, hit}.
export function collideWorld(city, x, y, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; y = cy + (dy / d) * r;
      } else {
        // Centre inside the building: push out along the smallest axis.
        const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
        const m = Math.min(left, right, top, bot);
        if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r; else y = b.y + b.h + r;
      }
    }
  }
  // Water is solid for people and cars (except piers are walkable).
  if (isWater(city, x, y)) {
    hit = true;
    if (y > 1760) y = 1760 - r;
    if (x < 70) x = 70 + r;
  }
  x = clamp(x, r, city.w - r);
  y = clamp(y, r, city.h - r);
  return { x, y, hit };
}

// Random point on a road, for traffic / ped spawning.
export function randomRoadPoint(city) {
  if (Math.random() < 0.5) {
    return { x: pick(city.roadsX) + rand(-14, 14), y: rand(60, city.h - 240) };
  }
  return { x: rand(100, city.w - 100), y: pick(city.roadsY) + rand(-14, 14) };
}

// Random sidewalk-ish point near a road (for pedestrians).
export function randomSidewalkPoint(city) {
  const p = randomRoadPoint(city);
  const off = pick([-1, 1]) * (ROAD_W / 2 + rand(6, 26));
  if (Math.random() < 0.5) p.x += off; else p.y += off;
  return { x: clamp(p.x, 80, city.w - 20), y: clamp(p.y, 20, city.h - 260) };
}
