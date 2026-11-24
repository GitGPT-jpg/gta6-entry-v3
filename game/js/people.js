// people.js — pedestrians: sidewalk wandering, fleeing, getting run over.
import { clamp, dist, rand, randi, pick, angleTo } from './util.js';
import { collideWorld, randomSidewalkPoint } from './city.js';
import { addWanted, showMessage, spawnParticles } from './core.js';
import { sfx } from './audio.js';

const SHIRTS = ['#e86a6a', '#6aa5e8', '#7ddb7d', '#e8d06a', '#c96ae8', '#e8a06a', '#6adbd8', '#d8d8d8'];
const PANTS = ['#3a4a5a', '#2e2e2e', '#5a4632', '#31402e'];

let nextId = 1;

export function makePed(G, x, y) {
  const ped = {
    id: nextId++,
    x, y, angle: rand(0, Math.PI * 2),
    speed: rand(28, 52),
    shirt: pick(SHIRTS), pants: pick(PANTS),
    skin: pick(['#f2c89b', '#c98d5f', '#8a5a3b', '#f7d7b0']),
    tx: x, ty: y, waitT: 0,
    fleeing: false, dead: false, inCar: false,
    walkPhase: rand(0, 6),
  };
  G.peds.push(ped);
  return ped;
}

export function spawnPeds(G, n) {
  for (let i = 0; i < n; i++) {
    const p = randomSidewalkPoint(G.city);
    makePed(G, p.x, p.y);
  }
}

function pickNewTarget(G, ped) {
  const p = randomSidewalkPoint(G.city);
  ped.tx = p.x; ped.ty = p.y;
}

export function updatePeople(G, dt) {
  const p = G.player;
  // Keep the crowd topped up near the player.
  const near = G.peds.filter(pd => !pd.dead && dist(pd.x, pd.y, p.x, p.y) < 700).length;
  if (near < 12 && Math.random() < dt * 1.2) {
    const sp = randomSidewalkPoint(G.city);
    // Spawn a bit away from the player so they don't pop in on screen.
    if (dist(sp.x, sp.y, p.x, p.y) > 420) makePed(G, sp.x, sp.y);
  }

  for (const ped of G.peds) {
    if (ped.dead || ped.inCar) continue;
    ped.walkPhase += dt * 8;
    // Flee from gunfire, explosions and speeding cars nearby.
    const danger = G.bullets.length > 0 && G.bullets.some(b => dist(b.x, b.y, ped.x, ped.y) < 130);
    const carThreat = !p.onFoot && p.car && Math.abs(p.car.speed) > 150 && dist(p.x, p.y, ped.x, ped.y) < 120;
    if (danger || carThreat) ped.fleeing = true;
    if (ped.fleeing) {
      const away = angleTo(p.x, p.y, ped.x, ped.y);
      ped.x += Math.cos(away) * 130 * dt;
      ped.y += Math.sin(away) * 130 * dt;
      ped.angle = away;
      if (Math.random() < dt * 0.3) ped.fleeing = false;
    } else if (ped.waitT > 0) {
      ped.waitT -= dt;
    } else {
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 12) {
        ped.waitT = rand(1, 4);
        pickNewTarget(G, ped);
      } else {
        const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * dt;
        ped.y += Math.sin(a) * ped.speed * dt;
      }
    }
    const c = collideWorld(G.city, ped.x, ped.y, 10);
    ped.x = c.x; ped.y = c.y;
  }

  // Player car hitting pedestrians.
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 60) {
    for (const ped of G.peds) {
      if (ped.dead || ped.inCar) continue;
      if (dist(p.x, p.y, ped.x, ped.y) < 30) {
        killPed(G, ped, 'run over');
      }
    }
  }

  // Clean up far-away dead peds; keep live ones around.
  G.peds = G.peds.filter(pd => {
    if (pd.dead) return dist(pd.x, pd.y, p.x, p.y) < 500;
    return dist(pd.x, pd.y, p.x, p.y) < 1400;
  });
}

export function killPed(G, ped, how) {
  if (ped.dead) return;
  ped.dead = true;
  G.kills++;
  spawnParticles(G, ped.x, ped.y, '#c0392b', 14, 140);
  addWanted(G, 12);
  if (how === 'run over') showMessage(G, '你撞到了行人！通缉上升');
}
