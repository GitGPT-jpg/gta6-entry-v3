// paint.js — canvas renderer: the city, entities, effects, day/night lighting.
import { clamp, dist } from './util.js';
import { isWater, isRoad, ROAD_W } from './city.js';
import { nightFactor } from './core.js';

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawGround(ctx, G, vx, vy, vw, vh) {
  const city = G.city;
  // Base: grass.
  ctx.fillStyle = '#5d8a4a';
  ctx.fillRect(vx, vy, vw, vh);
  // Water: south and west edges.
  ctx.fillStyle = '#2b6cb0';
  ctx.fillRect(vx, Math.max(vy, 1760), vw, vh - (Math.max(vy, 1760) - vy));
  ctx.fillRect(vx, vy, Math.max(0, 70 - vx), vh);
  // Beach sand along the west water.
  ctx.fillStyle = '#d9c48a';
  ctx.fillRect(Math.max(vx, 70), vy, Math.min(vw, 130 - Math.max(vx, 70)), vh);
  // Wave lines on the water.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  const t = G.time;
  for (let y = 1800; y < 2000; y += 46) {
    if (y < vy || y > vy + vh) continue;
    ctx.beginPath();
    for (let x = Math.max(vx, 70); x < Math.min(vx + vw, 2600); x += 40) {
      const yy = y + Math.sin(x * 0.02 + t * 1.4 + y) * 3;
      if (x === Math.max(vx, 70)) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Roads: asphalt with centre dashes.
  ctx.fillStyle = '#3d3d42';
  for (const rx of city.roadsX) {
    if (rx + ROAD_W / 2 < vx || rx - ROAD_W / 2 > vx + vw) continue;
    ctx.fillRect(rx - ROAD_W / 2, Math.max(vy, 0), ROAD_W, Math.min(vh, 1760 - Math.max(vy, 0)));
  }
  for (const ry of city.roadsY) {
    if (ry + ROAD_W / 2 < vy || ry - ROAD_W / 2 > vy + vh) continue;
    ctx.fillRect(Math.max(vx, 70), ry - ROAD_W / 2, Math.min(vw, 2600 - Math.max(vx, 70)), ROAD_W);
  }
  // Centre dashes.
  ctx.strokeStyle = '#e8d44d';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 26]);
  for (const rx of city.roadsX) {
    if (rx < vx || rx > vx + vw) continue;
    ctx.beginPath(); ctx.moveTo(rx, Math.max(vy, 0)); ctx.lineTo(rx, Math.min(vy + vh, 1760)); ctx.stroke();
  }
  for (const ry of city.roadsY) {
    if (ry < vy || ry > vy + vh) continue;
    ctx.beginPath(); ctx.moveTo(Math.max(vx, 70), ry); ctx.lineTo(Math.min(vx + vw, 2600), ry); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Sidewalk blocks: light pavement between roads.
  ctx.fillStyle = '#9a9a92';
  for (let i = 0; i < city.roadsX.length - 1; i++) {
    for (let j = 0; j < city.roadsY.length - 1; j++) {
      const x0 = city.roadsX[i] + ROAD_W / 2, x1 = city.roadsX[i + 1] - ROAD_W / 2;
      const y0 = city.roadsY[j] + ROAD_W / 2, y1 = city.roadsY[j + 1] - ROAD_W / 2;
      if (x1 < vx || x0 > vx + vw || y1 < vy || y0 > vy + vh || y0 > 1760) continue;
      ctx.fillRect(x0, y0, x1 - x0, Math.min(y1, 1760) - y0);
    }
  }
  // Parks.
  for (const pk of city.parks) {
    ctx.fillStyle = '#4d7a3d';
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
  }
  // Market / parking lots.
  for (const lot of city.lots) {
    ctx.fillStyle = lot.kind === 'market' ? '#8a7a45' : '#555550';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
  }
  // Piers (wood).
  ctx.fillStyle = '#7a5a38';
  for (const p of city.piers) ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = '#8f6d45';
  for (const p of city.piers) ctx.fillRect(p.x + 6, p.y + 6, p.w - 12, p.h - 12);
}

function drawBuildings(ctx, G, vx, vy, vw, vh) {
  for (const b of G.city.buildings) {
    if (b.x + b.w < vx || b.x > vx + vw || b.y + b.h < vy || b.y > vy + vh) continue;
    // Shadow / height offset.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof edge.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // Windows: deterministic from the building seed.
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    ctx.fillStyle = 'rgba(255,240,180,0.75)';
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (hash(b.seed + i * 13 + j * 7) < 0.45) {
          ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 12, 12);
        }
      }
    }
    // Height hint: taller buildings get a brighter roof strip.
    if (b.hgt > 30) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 6);
    }
  }
}

function drawProps(ctx, G, vx, vy, vw, vh) {
  for (const pr of G.city.props) {
    if (pr.x < vx - 40 || pr.x > vx + vw + 40 || pr.y < vy - 40 || pr.y > vy + vh + 40) continue;
    if (pr.kind === 'crate') {
      ctx.fillStyle = '#a8763e';
      ctx.fillRect(pr.x - 11, pr.y - 11, 22, 22);
      ctx.strokeStyle = '#7a5527'; ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - 11, pr.y - 11, 22, 22);
      ctx.beginPath(); ctx.moveTo(pr.x - 11, pr.y - 11); ctx.lineTo(pr.x + 11, pr.y + 11); ctx.stroke();
    } else if (pr.kind === 'container') {
      ctx.fillStyle = ['#b03a3a', '#3a6db0', '#3a8a4a', '#b07a2a'][Math.floor(hash(pr.x + pr.y) * 4)];
      ctx.fillRect(pr.x - 26, pr.y - 12, 52, 24);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - 26, pr.y - 12, 52, 24);
    } else if (pr.kind === 'tree') {
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4d8a3d';
      ctx.beginPath(); ctx.arc(pr.x - 3, pr.y - 3, 8, 0, Math.PI * 2); ctx.fill();
    } else if (pr.kind === 'palm') {
      ctx.strokeStyle = '#7a5a38'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pr.x, pr.y + 10); ctx.lineTo(pr.x, pr.y - 8); ctx.stroke();
      ctx.fillStyle = '#3f8a4a';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(pr.x + Math.cos(a) * 10, pr.y - 8 + Math.sin(a) * 6, 11, 4, a, 0, Math.PI * 2); ctx.fill();
      }
    } else if (pr.kind === 'barrel') {
      ctx.fillStyle = '#8a2f2f';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a83f3f';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Golden anchors (collectibles).
  for (const pk of G.city.packages) {
    if (pk.taken) continue;
    if (pk.x < vx - 40 || pk.x > vx + vw + 40 || pk.y < vy - 40 || pk.y > vy + vh + 40) continue;
    const pulse = 0.7 + 0.3 * Math.sin(G.time * 4 + pk.id);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.25 * pulse})`;
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6d00';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚓', pk.x, pk.y + 1);
  }
  // Ammo pickups.
  for (const pk of (G.ammoPickups || [])) {
    if (pk.taken) continue;
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(pk.x - 9, pk.y - 9, 18, 18);
    ctx.fillStyle = '#8a6d00';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('A', pk.x, pk.y + 1);
  }
}

function drawCar(ctx, car, G) {
  const def = car.def;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = def.len, W = def.wid;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 3, L, W);
  ctx.fillStyle = car.color;
  ctx.fillRect(-L / 2, -W / 2, L, W);
  // Cabin + windshield.
  ctx.fillStyle = '#1e2a33';
  ctx.fillRect(-L / 2 + L * 0.32, -W / 2 + 3, L * 0.28, W - 6);
  ctx.fillStyle = 'rgba(180,220,255,0.7)';
  ctx.fillRect(-L / 2 + L * 0.60, -W / 2 + 3, 5, W - 6);
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 5);
  // Taillights.
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-L / 2 - 1, -W / 2 + 2, 3, 5);
  ctx.fillRect(-L / 2 - 1, W / 2 - 7, 3, 5);
  if (car.police) {
    const on = Math.floor(G.time * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff3b30' : '#2f7bff';
    ctx.fillRect(-4, -W / 2 - 3, 8, 5);
    ctx.fillStyle = on ? '#2f7bff' : '#ff3b30';
    ctx.fillRect(-4, W / 2 - 2, 8, 5);
  }
  // Damage smoke.
  if (car.hp < 45) {
    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    ctx.beginPath(); ctx.arc(-L / 4 + (hash(G.time * 10 + car.id) - 0.5) * 10, -W / 2 - 6, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped, G) {
  if (ped.dead) {
    ctx.fillStyle = 'rgba(60,20,20,0.85)';
    ctx.beginPath(); ctx.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const bob = Math.sin(ped.walkPhase) * 2;
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.rotate(ped.angle);
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-4, -6, 8, 12);
  ctx.fillStyle = ped.shirt;
  ctx.fillRect(-7, -7 + bob * 0.3, 14, 12);
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(9, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, G) {
  const p = G.player;
  if (p.onFoot) {
    const bob = p.moving ? Math.sin(G.time * 14) * 2 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 4, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    // Red jacket, dark jeans — Marco Reyes.
    ctx.fillStyle = '#222831';
    ctx.fillRect(-5, -7, 10, 14);
    ctx.fillStyle = '#d42a2a';
    ctx.fillRect(-8, -8 + bob * 0.3, 16, 13);
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(10, 0, 6.5, 0, Math.PI * 2); ctx.fill();
    // Gun in hand when aiming.
    if (G.weapon === 'pistol') {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(8, -2, 12, 4);
    }
    ctx.restore();
  }
}

export function renderWorld(ctx, G, viewW, viewH) {
  const cam = G.camera;
  const z = cam.zoom;
  const vx = cam.x - viewW / 2 / z, vy = cam.y - viewH / 2 / z;
  const vw = viewW / z, vh = viewH / z;
  ctx.save();
  ctx.setTransform(z, 0, 0, z, viewW / 2 - cam.x * z, viewH / 2 - cam.y * z);
  drawGround(ctx, G, vx, vy, vw, vh);
  drawBuildings(ctx, G, vx, vy, vw, vh);
  drawProps(ctx, G, vx, vy, vw, vh);

  // Mission marker: pulsing diamond + light beam.
  const marker = G._marker;
  if (marker) {
    const pulse = 1 + 0.25 * Math.sin(G.time * 5);
    ctx.fillStyle = 'rgba(255, 60, 90, 0.16)';
    ctx.fillRect(marker.x - 14, marker.y - 260, 28, 260);
    ctx.fillStyle = '#ff3c5a';
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.PI / 4);
    const s = 13 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(marker.label, marker.x, marker.y - 22);
  }

  for (const car of G.cars) {
    if (car.dead) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-car.def.len / 2, -car.def.wid / 2, car.def.len, car.def.wid);
      ctx.fillStyle = 'rgba(255,123,0,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 10 + Math.sin(G.time * 6) * 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    drawCar(ctx, car, G);
  }
  for (const ped of G.peds) {
    if (Math.abs(ped.x - cam.x) > viewW || Math.abs(ped.y - cam.y) > viewH) continue;
    drawPed(ctx, ped, G);
  }
  for (const cop of G.cops) {
    if (cop.kind === 'foot') {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.fillStyle = '#1c2f4d';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath(); ctx.arc(9, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f7bff';
      ctx.fillRect(-7, -10, 14, 4);
      ctx.restore();
    }
  }
  drawPlayer(ctx, G);

  // Bullets.
  ctx.strokeStyle = '#ffe08a';
  ctx.lineWidth = 3;
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Floaters.
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of G.floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Night lighting: a uniform dusk tint plus a dark vignette, in screen space.
  const nf = nightFactor(G);
  if (nf > 0.03) {
    ctx.fillStyle = `rgba(8,12,34,${0.30 * nf})`;
    ctx.fillRect(0, 0, viewW, viewH);
    const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, 140, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
    grad.addColorStop(0, 'rgba(8,12,34,0)');
    grad.addColorStop(1, `rgba(8,12,34,${0.62 * nf})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
  }
}
