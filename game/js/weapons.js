// weapons.js — fists, pistol, bullets, damage, ammo pickups.
import { clamp, dist, angleTo, rand } from './util.js';
import { collideWorld } from './city.js';
import { addWanted, showMessage, spawnParticles, spawnFloater, showBanner, respawn } from './core.js';
import { sfx } from './audio.js';
import { killPed } from './people.js';
import { copKilled } from './cops.js';

export function initWeapons(G) {
  G.ammo = 60;
  G.hasGun = true;
  G.weapon = 'pistol'; // pistol | fists
  G.fireCd = 0;
  G.punchCd = 0;
}

// Punch the nearest ped / cop.
export function tryPunch(G) {
  const p = G.player;
  if (!p.onFoot || G.punchCd > 0) return;
  G.punchCd = 0.45;
  sfx.punch();
  const reach = 46;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(p.x, p.y, ped.x, ped.y) < reach) {
      killPed(G, ped, 'punched');
      showMessage(G, '你揍了路人！');
      return;
    }
  }
  for (const cop of G.cops) {
    if (cop.gone || cop.kind !== 'foot') continue;
    if (dist(p.x, p.y, cop.x, cop.y) < reach) {
      copKilled(G, cop);
      addWanted(G, 20);
      showMessage(G, '你袭击了警察！通缉飙升');
      return;
    }
  }
}

export function tryShoot(G, wx, wy) {
  const p = G.player;
  if (!p.onFoot || G.fireCd > 0 || G.ammo <= 0) {
    if (G.ammo <= 0) showMessage(G, '没子弹了！找弹药箱（黄色小盒）');
    return;
  }
  G.fireCd = 0.22;
  G.ammo--;
  G.stats.shotsFired++;
  const a = angleTo(p.x, p.y, wx, wy);
  p.angle = a;
  G.bullets.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.7 });
  spawnParticles(G, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, '#ffe08a', 4, 90);
  sfx.shoot();
  // Gunfire draws attention.
  if (G.cops.some(c => dist(c.x, c.y, p.x, p.y) < 520)) addWanted(G, 6);
}

function damagePlayer(G, amount) {
  const p = G.player;
  if (G.armor > 0) {
    const absorbed = Math.min(G.armor, amount);
    G.armor -= absorbed; amount -= absorbed;
  }
  G.health -= amount;
  spawnParticles(G, p.x, p.y, '#c0392b', 6, 110);
  if (G.health <= 0) {
    G.health = 0;
    p.dead = true;
    showBanner(G, 'WASTED', '你死了', 2.5);
    sfx.fail();
    G.mode = 'wasted';
    setTimeout(() => { if (G.mode === 'wasted') respawn(G, 'wasted'); }, 2600);
  }
}

// Foot cops shoot at the player when wanted >= 2 and in range.
function copGunfire(G, dt) {
  const p = G.player;
  if (!p.onFoot || G.wanted < 2) return;
  for (const cop of G.cops) {
    if (cop.kind !== 'foot' || cop.gone) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d < 340 && Math.random() < dt * 0.7) {
      const a = angleTo(cop.x, cop.y, p.x, p.y) + rand(-0.12, 0.12);
      G.bullets.push({ x: cop.x, y: cop.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 0.8, hostile: true });
      spawnParticles(G, cop.x, cop.y, '#ffe08a', 3, 80);
      sfx.shoot();
    }
  }
}

export function updateWeapons(G, dt) {
  if (G.fireCd > 0) G.fireCd -= dt;
  if (G.punchCd > 0) G.punchCd -= dt;
  copGunfire(G, dt);

  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) continue;
    const c = collideWorld(G.city, b.x, b.y, 2);
    if (c.hit) { b.life = 0; spawnParticles(G, b.x, b.y, '#cccccc', 4, 80); continue; }
    if (b.hostile) {
      const p = G.player;
      if (p.onFoot && dist(b.x, b.y, p.x, p.y) < 14) {
        b.life = 0;
        damagePlayer(G, 9);
      }
      continue;
    }
    // Player bullets vs peds.
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (dist(b.x, b.y, ped.x, ped.y) < 14) { b.life = 0; killPed(G, ped, 'shot'); break; }
    }
    if (b.life <= 0) continue;
    // Vs cops.
    for (const cop of G.cops) {
      if (cop.gone) continue;
      if (cop.kind === 'car') {
        if (cop.car && dist(b.x, b.y, cop.car.x, cop.car.y) < 26) {
          b.life = 0; cop.car.hp -= 12;
          spawnParticles(G, b.x, b.y, '#ffd27d', 5, 100);
          if (cop.car.hp <= 0) { copKilled(G, cop); addWanted(G, 18); }
          break;
        }
      } else if (dist(b.x, b.y, cop.x, cop.y) < 14) {
        b.life = 0; copKilled(G, cop); addWanted(G, 20);
        showMessage(G, '你干掉了一个警察！通缉飙升');
        break;
      }
    }
    if (b.life <= 0) continue;
    // Vs cars (damage, may explode).
    for (const car of G.cars) {
      if (car.dead || car.driver === 'player') continue;
      if (dist(b.x, b.y, car.x, car.y) < 26) {
        b.life = 0; car.hp -= 14;
        spawnParticles(G, b.x, b.y, '#ffd27d', 5, 100);
        if (car.hp <= 0) {
          car.dead = true;
          spawnParticles(G, car.x, car.y, '#ff7b00', 24, 240);
          if (car.police) addWanted(G, 14);
        }
        break;
      }
    }
  }
  G.bullets = G.bullets.filter(b => b.life > 0);

  // Ammo pickups: small yellow crates that respawn around the map.
  if (!G.ammoPickups) {
    G.ammoPickups = [];
    for (let i = 0; i < 5; i++) {
      G.ammoPickups.push({ x: 300 + i * 420, y: 410 + (i % 2) * 520, taken: false, respawnT: 0 });
    }
  }
  const p = G.player;
  for (const pk of G.ammoPickups) {
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.taken = false;
      continue;
    }
    if (p.onFoot && dist(p.x, p.y, pk.x, pk.y) < 26) {
      pk.taken = true; pk.respawnT = 25;
      G.ammo += 30;
      spawnFloater(G, pk.x, pk.y - 20, '+30 子弹', '#ffe08a');
      sfx.pickup();
    }
  }
}
