// cops.js — the wanted system: police cars and foot cops, pursuit, busting.
import { clamp, dist, rand, pick, angleTo, angleDiff } from './util.js';
import { collideWorld, randomRoadPoint } from './city.js';
import { showMessage, spawnParticles, showBanner, respawn } from './core.js';
import { makeCar } from './vehicles.js';
import { sfx } from './audio.js';

const MAX_COPS = 10;

export function spawnCopCar(G) {
  const p = G.player;
  // Spawn on a road, off-screen from the player.
  let sp;
  for (let tries = 0; tries < 8; tries++) {
    sp = randomRoadPoint(G.city);
    if (dist(sp.x, sp.y, p.x, p.y) > 500) break;
  }
  const car = makeCar(G, sp.x, sp.y, angleTo(sp.x, sp.y, p.x, p.y), 5, { police: true, color: '#1c2f4d' });
  car.speed = 200;
  G.cops.push({ kind: 'car', car, x: car.x, y: car.y, angle: car.angle, bustT: 0 });
  return car;
}

export function spawnFootCop(G) {
  const p = G.player;
  const a = rand(0, Math.PI * 2);
  const x = clamp(p.x + Math.cos(a) * 320, 90, G.city.w - 90);
  const y = clamp(p.y + Math.sin(a) * 320, 90, G.city.h - 300);
  G.cops.push({ kind: 'foot', x, y, angle: a, speed: 0, bustT: 0 });
}

function updateCopCar(G, cop, dt) {
  const p = G.player;
  const car = cop.car;
  if (!car || car.dead) { cop.gone = true; return; }
  // Chase the player: steer towards them, faster with more stars.
  const want = angleTo(car.x, car.y, p.x, p.y);
  const d = angleDiff(car.angle, want);
  car.angle += clamp(d, -2.6 * dt, 2.6 * dt);
  const top = 260 + G.wanted * 34;
  car.speed = clamp(car.speed + 300 * dt, 0, top);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const c = collideWorld(G.city, car.x, car.y, 22);
  if (c.hit) { car.x = c.x; car.y = c.y; car.speed *= 0.5; }
  cop.x = car.x; cop.y = car.y; cop.angle = car.angle;
  // Ram the player's car.
  if (!p.onFoot && p.car) {
    const dd = dist(car.x, car.y, p.car.x, p.car.y);
    if (dd < 46) {
      const push = (46 - dd) / 2;
      const nx = (p.car.x - car.x) / (dd || 1), ny = (p.car.y - car.y) / (dd || 1);
      p.car.x += nx * push; p.car.y += ny * push;
      p.car.speed *= 0.7;
      if (Math.abs(car.speed) > 140) {
        spawnParticles(G, (car.x + p.car.x) / 2, (car.y + p.car.y) / 2, '#ffd27d', 6, 120);
        sfx.crash();
      }
    }
  }
  // Too far for too long: despawn the chase car.
  if (dist(car.x, car.y, p.x, p.y) > 1600) { cop.gone = true; car.dead = true; }
}

function updateFootCop(G, cop, dt) {
  const p = G.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  if (d > 60) cop.bustT = 0; // broke contact: the grab resets
  const speed = p.onFoot ? 165 : 120;
  if (d > 26) {
    const a = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = a;
    cop.x += Math.cos(a) * speed * dt;
    cop.y += Math.sin(a) * speed * dt;
    const c = collideWorld(G.city, cop.x, cop.y, 11);
    cop.x = c.x; cop.y = c.y;
  } else if (p.onFoot) {
    // Busting: the cop grabs the player.
    cop.bustT += dt;
    p.bustT = Math.max(p.bustT, cop.bustT);
    if (cop.bustT > 1.6) {
      showBanner(G, 'BUSTED', '你被捕了', 2.5);
      sfx.busted();
      G.mode = 'busted';
      setTimeout(() => { if (G.mode === 'busted') respawn(G, 'busted'); }, 2600);
    }
  }
  if (d > 1500) cop.gone = true;
}

export function updateCops(G, dt) {
  const p = G.player;
  // Spawn pressure scales with wanted level.
  const wantCars = G.wanted >= 3 ? 3 : G.wanted >= 1 ? 2 : 0;
  const wantFoot = G.wanted >= 1 ? Math.min(2 + G.wanted, 5) : 0;
  const cars = G.cops.filter(c => c.kind === 'car' && !c.gone).length;
  const feet = G.cops.filter(c => c.kind === 'foot' && !c.gone).length;
  if (G.wanted > 0) {
    if (cars < wantCars && Math.random() < dt * 0.9) spawnCopCar(G);
    if (feet < wantFoot && Math.random() < dt * 1.1) spawnFootCop(G);
  }
  for (const cop of G.cops) {
    if (cop.kind === 'car') updateCopCar(G, cop, dt);
    else updateFootCop(G, cop, dt);
  }
  G.cops = G.cops.filter(c => !c.gone);
  // Cap the total.
  if (G.cops.length > MAX_COPS) G.cops.length = MAX_COPS;
}

// A cop was shot / killed: big wanted jump.
export function copKilled(G, cop) {
  cop.gone = true;
  if (cop.kind === 'car' && cop.car) cop.car.dead = true;
  spawnParticles(G, cop.x, cop.y, '#2b3a55', 16, 160);
}
