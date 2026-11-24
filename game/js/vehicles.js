// vehicles.js — cars: traffic AI, player driving, carjacking, collisions.
import { clamp, dist, rand, randi, pick, angleDiff, angleTo } from './util.js';
import { collideWorld, isRoad, randomRoadPoint, nearestRoadPoint } from './city.js';
import { addWanted, showMessage, spawnParticles } from './core.js';
import { sfx } from './audio.js';

export const CAR_DEFS = [
  { name: 'Sedan', color: '#c94f4f', len: 46, wid: 22, top: 240, accel: 300 },
  { name: 'Taxi', color: '#e8b93c', len: 46, wid: 22, top: 250, accel: 310 },
  { name: 'Pickup', color: '#4f7dc9', len: 50, wid: 24, top: 235, accel: 280 },
  { name: 'Sports', color: '#d94fd0', len: 44, wid: 21, top: 340, accel: 430 },
  { name: 'Van', color: '#8a8f96', len: 54, wid: 24, top: 210, accel: 240 },
  { name: 'Police', color: '#2b3a55', len: 48, wid: 22, top: 300, accel: 380 },
  { name: 'Muscle', color: '#3cb371', len: 48, wid: 23, top: 290, accel: 360 },
];

let nextId = 1;

export function makeCar(G, x, y, angle, defIdx, opts = {}) {
  const def = CAR_DEFS[defIdx % CAR_DEFS.length];
  const car = {
    id: nextId++, x, y, angle, speed: 0,
    def, defIdx,
    traffic: !!opts.traffic,
    police: !!opts.police,
    driver: opts.driver || null, // 'player' | 'ped' | null
    hp: 100,
    stuckT: 0,
    targetAngle: angle,
    honkT: rand(2, 8),
    color: opts.color || def.color,
    parked: !!opts.parked,
    mission: !!opts.mission,
  };
  G.cars.push(car);
  return car;
}

export function spawnTraffic(G, n) {
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(G.city);
    const vertical = Math.abs(p.x - Math.round(p.x / 260) * 260) < 40;
    const angle = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const car = makeCar(G, p.x, p.y, angle, randi(0, 6), { traffic: true });
    car.speed = rand(60, 140);
  }
}

export function spawnParkedCars(G, n) {
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(G.city);
    const angle = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    makeCar(G, p.x, p.y, angle, randi(0, 6), { parked: true });
  }
}

// --- Player driving ---
function updatePlayerCar(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const k = G.keys;
  const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
  const steer = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
  const handbrake = !!(k['Space']);
  const def = car.def;
  if (fwd > 0) car.speed += def.accel * dt;
  else if (fwd < 0) car.speed -= (car.speed > 5 ? 420 : 180) * dt;
  else car.speed *= Math.pow(0.4, dt); // rolling drag
  if (handbrake) car.speed *= Math.pow(0.05, dt);
  car.speed = clamp(car.speed, -140, def.top);
  const steerFactor = clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.angle += steer * 2.4 * steerFactor * dt * (handbrake ? 1.5 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // World collision (buildings + water).
  const c = collideWorld(G.city, car.x, car.y, 24);
  if (c.hit) {
    if (Math.abs(car.speed) > 180) { sfx.crash(); spawnParticles(G, car.x, car.y, '#ffb347', 8, 160); damageCar(G, car, 8); }
    car.speed *= 0.4;
    car.x = c.x; car.y = c.y;
  }
  // Off-road slows the car.
  if (!isRoad(G.city, car.x, car.y)) car.speed *= Math.pow(0.85, dt);
  p.x = car.x; p.y = car.y; p.angle = car.angle;
}

export function damageCar(G, car, amount) {
  car.hp -= amount;
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    spawnParticles(G, car.x, car.y, '#ff7b00', 26, 260);
    spawnParticles(G, car.x, car.y, '#555555', 18, 120);
    sfx.crash();
    if (car.driver === 'player') {
      G.player.car = null; G.player.onFoot = true;
      G.player.x = car.x + 30; G.player.y = car.y + 30;
      showMessage(G, '你的车报废了！');
    }
  }
}

// --- Traffic AI: follow roads, turn at intersections, brake for cars ahead ---
function updateTrafficCar(G, car, dt) {
  const ahead = car.x + Math.cos(car.angle) * 46;
  const aheadY = car.y + Math.sin(car.angle) * 46;
  let blocked = false;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    if (dist(ahead, aheadY, other.x, other.y) < 34) { blocked = true; break; }
  }
  // A pedestrian in front also blocks.
  if (!blocked) {
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (dist(ahead, aheadY, ped.x, ped.y) < 22) { blocked = true; break; }
    }
  }
  const target = blocked ? 0 : 120;
  car.speed += clamp(target - car.speed, -260 * dt, 160 * dt);
  // At an intersection, sometimes turn.
  const nearV = G.city.roadsX.some(rx => Math.abs(car.x - rx) < 12);
  const nearH = G.city.roadsY.some(ry => Math.abs(car.y - ry) < 12);
  if (nearV && nearH && Math.random() < dt * 0.55) {
    car.targetAngle = car.angle + pick([-Math.PI / 2, Math.PI / 2, 0, 0]);
  }
  const d = angleDiff(car.angle, car.targetAngle);
  car.angle += clamp(d, -1.8 * dt, 1.8 * dt);
  // Stay glued to the road centre: nudge towards the nearest road line.
  const rp = nearestRoadPoint(G.city, car.x, car.y);
  if (rp) {
    if (rp.vertical) car.x += clamp(rp.x - car.x, -60 * dt, 60 * dt);
    else car.y += clamp(rp.y - car.y, -60 * dt, 60 * dt);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const c = collideWorld(G.city, car.x, car.y, 22);
  if (c.hit) { car.x = c.x; car.y = c.y; car.targetAngle = car.angle + Math.PI; car.stuckT += dt; }
  else car.stuckT = 0;
  if (car.stuckT > 3) { // teleport a hopelessly stuck car to a fresh road point
    const p = randomRoadPoint(G.city);
    car.x = p.x; car.y = p.y; car.angle = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    car.targetAngle = car.angle; car.stuckT = 0;
  }
  car.honkT -= dt;
  if (blocked && car.honkT <= 0) { sfx.horn(); car.honkT = rand(4, 9); }
}

// Car-car collision: simple push-apart + speed exchange.
function resolveCarCollisions(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 120) {
          spawnParticles(G, (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd27d', 6, 140);
          if (a.driver === 'player' || b.driver === 'player') {
            sfx.crash();
            damageCar(G, a.driver === 'player' ? a : b, 6);
            if (Math.random() < 0.5) addWanted(G, 3);
          }
          const tmp = a.speed; a.speed = b.speed * 0.6; b.speed = tmp * 0.6;
        }
      }
    }
  }
}

// --- Entering / exiting / jacking cars ---
export function nearestCar(G, x, y, maxD = 70) {
  let best = null, bd = maxD;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function tryEnterCar(G) {
  const p = G.player;
  if (!p.onFoot) return;
  const car = nearestCar(G, p.x, p.y, 64);
  if (!car) return;
  if (car.police) {
    showMessage(G, '你不能偷警车……除非你想上通缉');
    return;
  }
  if (car.driver === 'ped') {
    // Carjacking: drag the driver out.
    car.driver = null;
    G.carsStolen++;
    addWanted(G, 8);
    sfx.door();
    showMessage(G, '抢车！通缉上升');
    spawnParticles(G, car.x, car.y, '#ff5b5b', 8, 120);
  }
  p.car = car;
  car.driver = 'player';
  car.traffic = false;
  car.parked = false;
  p.onFoot = false;
  p.x = car.x; p.y = car.y;
  sfx.door();
}

export function exitCar(G) {
  const p = G.player;
  if (p.onFoot || !p.car) return;
  const car = p.car;
  car.driver = null;
  p.car = null;
  p.onFoot = true;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.speed = 0;
  sfx.door();
}

export function updateVehicles(G, dt) {
  // Keep traffic topped up near the player.
  const traffic = G.cars.filter(c => c.traffic && !c.dead).length;
  if (traffic < 9 && Math.random() < dt * 0.8) spawnTraffic(G, 1);
  if (G.player.car) updatePlayerCar(G, dt);
  for (const car of G.cars) {
    if (car.dead || car.driver === 'player') continue;
    if (car.traffic) updateTrafficCar(G, car, dt);
    else if (car.police) { /* police cars are driven by cops.js */ }
  }
  resolveCarCollisions(G);
  // Remove burnt-out cars far from the player.
  G.cars = G.cars.filter(c => {
    if (!c.dead) return true;
    return dist(c.x, c.y, G.player.x, G.player.y) < 900;
  });
}
