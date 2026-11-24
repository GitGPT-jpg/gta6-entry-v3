// boot.js — entry point: wires canvas, input, loop and screenshot staging.
import { createGame, stepGame, updateCamera, loadSave, hasSave, saveGame, showMessage } from './core.js';
import { spawnTraffic, spawnParkedCars, tryEnterCar, exitCar, makeCar } from './vehicles.js';
import { spawnPeds, makePed } from './people.js';
import { updateCops, spawnCopCar } from './cops.js';
import { updateVehicles } from './vehicles.js';
import { updatePeople } from './people.js';
import { updateWeapons, initWeapons, tryShoot, tryPunch } from './weapons.js';
import { updateStory, startMission, currentMarker } from './story.js';
import { renderWorld } from './paint.js';
import { renderHUD, renderMinimap, drawTitle, drawPaused } from './screen.js';
import { audioUnlock } from './audio.js';
import { clamp } from './util.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

const G = createGame();
initWeapons(G);

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = parseInt(params.get('seed') || '1', 10);
G.shot = shot;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- Input ---
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  G.keys[e.code] = true;
  if (e.repeat) return;
  if (G.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) { startGame(); return; }
  if (G.mode === 'play') {
    if (e.code === 'KeyE') { if (G.player.onFoot) tryEnterCar(G); else exitCar(G); }
    if (e.code === 'KeyF') tryPunch(G);
    if (e.code === 'KeyT') {
      if (!G.mission && G.missionIdx < 6) startMission(G, G.missionIdx);
      else if (G.mission) showMessage(G, '先完成当前任务：' + G.mission.def.name);
      else showMessage(G, '全部任务已完成！');
    }
    if (e.code === 'KeyP') { G.mode = 'paused'; }
  } else if (G.mode === 'paused') {
    if (e.code === 'KeyP') G.mode = 'play';
    if (e.code === 'KeyR') { G.mode = 'title'; }
  }
});
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
window.addEventListener('blur', () => { G.keys = {}; });
canvas.addEventListener('mousemove', (e) => { G.mouse.x = e.clientX; G.mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => {
  audioUnlock();
  G.mouse.down = true;
  if (G.mode === 'title') { startGame(); return; }
  if (G.mode === 'play' && G.player.onFoot) {
    G.mouse.x = e.clientX; G.mouse.y = e.clientY;
    updateMouseWorld();
    tryShoot(G, G.mouse.wx, G.mouse.wy);
  }
});
window.addEventListener('mouseup', () => { G.mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function updateMouseWorld() {
  const z = G.camera.zoom;
  G.mouse.wx = (G.mouse.x - canvas.width / 2) / z + G.camera.x;
  G.mouse.wy = (G.mouse.y - canvas.height / 2) / z + G.camera.y;
}

function startGame() {
  audioUnlock();
  if (G.mode !== 'title') return;
  const hadSave = hasSave();
  if (hadSave) loadSave(G);
  G.mode = 'play';
  showMessage(G, hadSave ? '继续游戏，祝好运' : '欢迎来到 Porto Verde！按 T 接第一个任务');
}

// --- World population ---
spawnTraffic(G, 10);
spawnParkedCars(G, 8);
spawnPeds(G, 18);

// --- Screenshot staging (?shot=cover|foot|mission|night) ---
function stageShot(kind) {
  G.mode = 'play';
  G.time = 30; // hide the controls hint
  const p = G.player;
  if (kind === 'cover') {
    G.dayTime = 10 * 3600;
    const car = makeCar(G, 1190, 670, Math.PI / 2, 3, { color: '#e83e9e' });
    p.car = car; car.driver = 'player'; car.traffic = false; p.onFoot = false;
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    G.camera.x = car.x; G.camera.y = car.y;
    spawnTraffic(G, 4);
    spawnPeds(G, 6);
  } else if (kind === 'foot') {
    G.dayTime = 15 * 3600;
    p.x = 900; p.y = 1830; p.onFoot = true; p.angle = -Math.PI / 2;
    G.camera.x = p.x; G.camera.y = p.y - 40;
    for (let i = 0; i < 5; i++) makePed(G, 860 + i * 30, 1790 + (i % 2) * 60);
    makeCar(G, 960, 1760, 0, 1, { parked: true, color: '#e8b93c' });
  } else if (kind === 'mission') {
    G.dayTime = 18 * 3600 + 1800; // dusk
    const car = makeCar(G, 1450, 930, 0, 6, { color: '#3cb371' });
    p.car = car; car.driver = 'player'; car.traffic = false; p.onFoot = false;
    car.speed = 260;
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    G.camera.x = car.x; G.camera.y = car.y;
    G.wanted = 2; G.wantedHeat = 30;
    spawnCopCar(G); spawnCopCar(G);
    spawnTraffic(G, 3);
    G.mission = { def: { name: '鲨鱼饵', brief: '公文包到手！甩掉警察回公寓', marker: () => ({ x: 300, y: 300, label: '回公寓' }), update: () => {} }, idx: 2, data: {} };
  } else if (kind === 'night') {
    G.dayTime = 22 * 3600;
    p.x = 1190; p.y = 670; p.onFoot = true; p.angle = Math.PI;
    G.camera.x = p.x; G.camera.y = p.y;
    const car = makeCar(G, 1250, 700, Math.PI / 2, 3, { color: '#e83e9e', parked: true });
    void car;
    spawnPeds(G, 6);
    spawnTraffic(G, 3);
  }
  // Keep the frame busy: run a few simulation steps so traffic settles.
  for (let i = 0; i < 90; i++) {
    stepGame(G, 1 / 60, UPDATERS);
  }
  G.time = 30;
}

const UPDATERS = {
  vehicles: updateVehicles,
  people: updatePeople,
  cops: updateCops,
  weapons: updateWeapons,
  story: updateStory,
};

// --- Main loop ---
let last = performance.now();
let saveT = 0;

function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (G.mode === 'play') {
    updateMouseWorld();
    G._marker = currentMarker(G);
    stepGame(G, dt, UPDATERS);
    saveT += dt;
    if (saveT > 20) { saveT = 0; saveGame(G); }
    // Player bust progress decays when moving away.
    if (G.player.bustT > 0) {
      const nearCop = G.cops.some(c => c.kind === 'foot' && Math.hypot(c.x - G.player.x, c.y - G.player.y) < 40);
      if (!nearCop) G.player.bustT = Math.max(0, G.player.bustT - dt * 2);
    }
  }
  updateCamera(G, canvas.width, canvas.height);
  renderWorld(ctx, G, canvas.width, canvas.height);
  if (G.mode === 'title') drawTitle(ctx, G, canvas.width, canvas.height, hasSave());
  else if (G.mode === 'paused') drawPaused(ctx, canvas.width, canvas.height);
  else renderHUD(ctx, G, canvas.width, canvas.height);
  renderMinimap(mctx, G, mini.width, mini.height);
  requestAnimationFrame(frame);
}

if (shot) {
  stageShot(shot);
} else {
  G.camera.x = G.player.x; G.camera.y = G.player.y;
}
requestAnimationFrame(frame);
