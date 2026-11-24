// core.js — game state, main loop, camera, input, save/load.
// DOM-free at import time; boot.js attaches listeners and starts the loop.
import { buildCity, collideWorld } from './city.js';
import { clamp, clockString } from './util.js';
import { engineSound, sirenSound, sfx } from './audio.js';

export const SAVE_KEY = 'porto-verde-save-v1';

export function createGame() {
  const city = buildCity(7);
  const G = {
    city,
    mode: 'title', // title | play | paused | busted | wasted | missionpass
    time: 0,               // seconds since boot
    dayTime: 8 * 3600,     // 08:00 start
    money: 250,
    health: 100,
    armor: 0,
    wanted: 0,
    wantedHeat: 0,         // 0..100, drives star changes
    kills: 0,
    carsStolen: 0,
    packagesFound: 0,
    player: {
      x: city.spots.safehouse.x, y: city.spots.safehouse.y,
      angle: Math.PI / 2, speed: 0, onFoot: true, car: null,
      sprint: false, dead: false, bustT: 0,
    },
    camera: { x: city.spots.safehouse.x, y: city.spots.safehouse.y, zoom: 1 },
    cars: [], peds: [], cops: [], bullets: [], particles: [], floaters: [],
    mission: null, missionIdx: 0, missionsDone: [],
    message: null, messageT: 0,
    banner: null, bannerT: 0, // big centre text: WASTED / BUSTED / MISSION PASSED
    keys: {},
    mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0 },
    shot: null, // screenshot staging mode (boot.js sets this)
    stats: { shotsFired: 0, missions: 0 },
    saveExists: false,
  };
  return G;
}

export function showMessage(G, text, dur = 3) {
  G.message = text; G.messageT = dur;
}

export function showBanner(G, text, sub = '', dur = 3) {
  G.banner = { text, sub }; G.bannerT = dur;
}

export function addMoney(G, amount) {
  G.money += amount;
  sfx.cash();
}

// Night factor 0 (day) .. 1 (deep night) from the clock.
export function nightFactor(G) {
  const h = (G.dayTime / 3600) % 24;
  if (h >= 21 || h < 5) return 1;
  if (h >= 19) return (h - 19) / 2;
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
  return 0;
}

export function isNight(G) { return nightFactor(G) > 0.55; }

export function addWanted(G, amount) {
  G.wantedHeat = clamp(G.wantedHeat + amount, 0, 100);
  const stars = G.wantedHeat <= 0 ? 0
    : G.wantedHeat < 18 ? 1
    : G.wantedHeat < 36 ? 2
    : G.wantedHeat < 55 ? 3
    : G.wantedHeat < 78 ? 4 : 5;
  if (stars > G.wanted) showMessage(G, '通缉等级上升！甩掉警察或去车库消星');
  G.wanted = stars;
}

export function clearWanted(G) { G.wanted = 0; G.wantedHeat = 0; }

// --- Save / load (localStorage) ---
export function saveGame(G) {
  try {
    const data = {
      money: G.money, health: G.health, missionIdx: G.missionIdx,
      missionsDone: G.missionsDone, packagesFound: G.packagesFound,
      x: G.player.x, y: G.player.y, dayTime: G.dayTime,
      packagesTaken: G.city.packages.map(p => p.taken),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    G.saveExists = true;
  } catch (e) { /* storage unavailable (file:// in some browsers) */ }
}

export function loadSave(G) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    G.money = d.money; G.health = d.health; G.missionIdx = d.missionIdx;
    G.missionsDone = d.missionsDone || []; G.packagesFound = d.packagesFound || 0;
    G.player.x = d.x; G.player.y = d.y; G.dayTime = d.dayTime;
    (d.packagesTaken || []).forEach((t, i) => { if (G.city.packages[i]) G.city.packages[i].taken = !!t; });
    G.saveExists = true;
    return true;
  } catch (e) { return false; }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

// --- Camera ---
export function updateCamera(G, viewW, viewH) {
  const p = G.player;
  const target = { x: p.x, y: p.y };
  if (!p.onFoot && p.car) {
    target.x = p.x + Math.cos(p.car.angle) * 40;
    target.y = p.y + Math.sin(p.car.angle) * 40;
  }
  const k = 1 - Math.pow(0.001, 1 / 60);
  G.camera.x += (target.x - G.camera.x) * k;
  G.camera.y += (target.y - G.camera.y) * k;
  const hw = viewW / 2 / G.camera.zoom, hh = viewH / 2 / G.camera.zoom;
  G.camera.x = clamp(G.camera.x, hw - 60, G.city.w - hw + 60);
  G.camera.y = clamp(G.camera.y, hh - 60, G.city.h - hh + 60);
}

// --- Player on-foot movement ---
function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const k = G.keys;
  const mx = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
  const my = (k['KeyS'] || k['ArrowDown'] ? 1 : 0) - (k['KeyW'] || k['ArrowUp'] ? 1 : 0);
  p.sprint = !!(k['ShiftLeft'] || k['ShiftRight']);
  const speed = p.sprint ? 240 : 150;
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.angle = Math.atan2(my / len, mx / len);
    p.moving = true;
  } else p.moving = false;
  const c = collideWorld(G.city, p.x, p.y, 14);
  p.x = c.x; p.y = c.y;
}

// --- Wanted decay when the player is out of trouble ---
function updateWanted(G, dt) {
  if (G.wanted > 0) {
    const copNear = G.cops.some(c => Math.hypot(c.x - G.player.x, c.y - G.player.y) < 420);
    if (!copNear) G.wantedHeat = Math.max(0, G.wantedHeat - dt * 2.2);
    else G.wantedHeat = Math.max(0, G.wantedHeat - dt * 0.4);
    addWanted(G, 0); // recompute stars
    if (G.wanted === 0) showMessage(G, '通缉解除了');
  }
}

// --- Particles / floaters ---
export function spawnParticles(G, x, y, color, n = 10, speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    G.particles.push({
      x, y, vx: Math.cos(a) * speed * Math.random(), vy: Math.sin(a) * speed * Math.random(),
      life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3,
    });
  }
}

export function spawnFloater(G, x, y, text, color = '#ffffff') {
  G.floaters.push({ x, y, text, color, life: 1.4 });
}

function updateFx(G, dt) {
  for (const pt of G.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
  G.particles = G.particles.filter(p => p.life > 0);
  for (const f of G.floaters) { f.y -= 26 * dt; f.life -= dt; }
  G.floaters = G.floaters.filter(f => f.life > 0);
  if (G.messageT > 0) { G.messageT -= dt; if (G.messageT <= 0) G.message = null; }
  if (G.bannerT > 0) { G.bannerT -= dt; if (G.bannerT <= 0) G.banner = null; }
}

// Clock: 1 real second = 1 game minute.
function updateClock(G, dt) {
  G.dayTime = (G.dayTime + dt * 60) % 86400;
}

export function stepGame(G, dt, updaters) {
  if (G.mode !== 'play') return;
  G.time += dt;
  updateClock(G, dt);
  if (G.player.onFoot) updatePlayerOnFoot(G, dt);
  updaters.vehicles(G, dt);
  updaters.people(G, dt);
  updaters.cops(G, dt);
  updaters.weapons(G, dt);
  updaters.story(G, dt);
  updateWanted(G, dt);
  updateFx(G, dt);
  // Engine + siren follow the driving state.
  const driving = !G.player.onFoot && G.player.car;
  engineSound(driving ? Math.abs(G.player.car.speed) / 520 : 0, !!driving);
  sirenSound(G.wanted > 0);
}

// Respawn after WASTED / BUSTED.
export function respawn(G, kind) {
  const hosp = G.city.spots.hospital;
  const pol = G.city.spots.police;
  const fee = Math.min(200, Math.floor(G.money * 0.15));
  G.money -= fee;
  G.health = 100;
  clearWanted(G);
  G.cops = [];
  if (G.player.car) { G.player.car.driver = null; G.player.car = null; }
  G.player.onFoot = true;
  G.player.dead = false;
  G.player.bustT = 0;
  const spot = kind === 'wasted' ? hosp : pol;
  G.player.x = spot.x; G.player.y = spot.y;
  G.camera.x = spot.x; G.camera.y = spot.y;
  G.mode = 'play';
  showMessage(G, kind === 'wasted'
    ? `你在医院醒来，医药费 -$${fee}`
    : `你被保释了，保释金 -$${fee}`);
  saveGame(G);
}

export function clockLabel(G) { return clockString(G.dayTime); }
