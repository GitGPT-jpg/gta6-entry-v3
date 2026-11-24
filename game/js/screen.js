// screen.js — HUD, minimap, title screen, banners. Drawn in screen space.
import { clamp, moneyString, clockString } from './util.js';
import { clockLabel } from './core.js';

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(0,0,0,0.55)') {
  ctx.fillStyle = bg;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

function drawStars(ctx, x, y, n) {
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < n ? '#ffd700' : 'rgba(255,255,255,0.35)';
    ctx.fillText('★', x + i * 26, y);
  }
}

export function renderHUD(ctx, G, viewW, viewH) {
  const p = G.player;
  ctx.save();
  // Top-left: health + armor.
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('生命', 16, 22);
  bar(ctx, 60, 14, 150, 14, G.health / 100, G.health > 30 ? '#37c24a' : '#e03a2f');
  if (G.armor > 0) {
    ctx.fillText('防弹', 16, 46);
    bar(ctx, 60, 38, 150, 10, G.armor / 100, '#4aa8e8');
  }
  // Top-right: money, clock, wanted.
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#7ddb7d';
  ctx.fillText(moneyString(G.money), viewW - 16, 24);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(clockLabel(G), viewW - 16, 50);
  drawStars(ctx, viewW - 146, 74, G.wanted);
  // Ammo + weapon (on foot).
  if (p.onFoot) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(`🔫 ${G.ammo} 发子弹`, 16, viewH - 18);
  } else if (p.car) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#fff';
    const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
    ctx.fillText(`${p.car.def.name}  ${kmh} km/h`, 16, viewH - 18);
    if (p.car.hp < 100) {
      ctx.fillStyle = p.car.hp > 40 ? '#ffd27d' : '#ff5b5b';
      ctx.fillText(`车况 ${Math.round(p.car.hp)}%`, 200, viewH - 18);
    }
  }
  // Mission objective panel (top centre).
  if (G.mission) {
    const m = G.mission.def;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = Math.min(560, viewW - 40);
    ctx.fillRect((viewW - w) / 2, 10, w, 52);
    ctx.fillStyle = '#ff8ba0';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(m.name, viewW / 2, 26);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(m.brief, viewW / 2, 46);
  } else if (G.missionsDone.length < 6) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(viewW / 2 - 190, 10, 380, 30);
    ctx.fillStyle = '#ffe08a';
    ctx.font = '13px sans-serif';
    ctx.fillText('按 T 接下一个任务（Rosa 的电话）', viewW / 2, 26);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(viewW / 2 - 190, 10, 380, 30);
    ctx.fillStyle = '#7ddb7d';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('全部任务完成！Porto Verde 是你的了', viewW / 2, 26);
  }
  // Toast message.
  if (G.message) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const tw = ctx.measureText(G.message).width + 28;
    ctx.fillRect((viewW - tw) / 2, viewH - 64, tw, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(G.message, viewW / 2, viewH - 48);
  }
  // Bust progress.
  if (p.bustT > 0 && p.bustT < 1.6) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ff5b5b';
    ctx.fillText('警察抓住你了！挣脱（移动）！', viewW / 2, viewH - 100);
    bar(ctx, viewW / 2 - 100, viewH - 88, 200, 8, p.bustT / 1.6, '#ff5b5b');
  }
  // Big centre banner.
  if (G.banner) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, viewH / 2 - 56, viewW, 96);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(G.banner.text, viewW / 2, viewH / 2 - 8);
    if (G.banner.sub) {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(G.banner.sub, viewW / 2, viewH / 2 + 26);
    }
  }
  // Controls hint (fades after 25s of play).
  if (G.time < 25 && G.mode === 'play') {
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('WASD 移动 / 开车 · E 上车下车 · 鼠标射击 · F 拳击 · Shift 疾跑 · T 接任务 · P 暂停', 16, viewH - 42);
  }
  ctx.restore();
}

// Minimap: tiny top-down of the whole city on its own canvas.
export function renderMinimap(mctx, G, mw, mh) {
  const city = G.city;
  const sx = mw / city.w, sy = mh / city.h;
  mctx.clearRect(0, 0, mw, mh);
  mctx.fillStyle = '#3d6b35';
  mctx.fillRect(0, 0, mw, mh);
  mctx.fillStyle = '#2b6cb0';
  mctx.fillRect(0, 1760 * sy, mw, mh - 1760 * sy);
  mctx.fillRect(0, 0, 70 * sx, mh);
  mctx.fillStyle = '#3d3d42';
  for (const rx of city.roadsX) mctx.fillRect(rx * sx - 1, 0, 2, mh);
  for (const ry of city.roadsY) mctx.fillRect(0, ry * sy - 1, mw, 2);
  mctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (const b of city.buildings) mctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  // Packages.
  mctx.fillStyle = '#ffd700';
  for (const pk of city.packages) {
    if (!pk.taken) { mctx.beginPath(); mctx.arc(pk.x * sx, pk.y * sy, 2, 0, Math.PI * 2); mctx.fill(); }
  }
  // Cops.
  mctx.fillStyle = '#2f7bff';
  for (const c of G.cops) { mctx.beginPath(); mctx.arc(c.x * sx, c.y * sy, 2.5, 0, Math.PI * 2); mctx.fill(); }
  // Mission marker.
  const marker = G._marker;
  if (marker) {
    const pulse = 3 + Math.sin(G.time * 5) * 1.5;
    mctx.fillStyle = '#ff3c5a';
    mctx.beginPath(); mctx.arc(marker.x * sx, marker.y * sy, pulse, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1;
    mctx.beginPath(); mctx.arc(marker.x * sx, marker.y * sy, pulse + 2, 0, Math.PI * 2); mctx.stroke();
  }
  // Player arrow.
  const p = G.player;
  mctx.save();
  mctx.translate(p.x * sx, p.y * sy);
  mctx.rotate(p.angle);
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill();
  mctx.restore();
  // North + border.
  mctx.strokeStyle = 'rgba(255,255,255,0.7)';
  mctx.lineWidth = 1;
  mctx.strokeRect(0.5, 0.5, mw - 1, mh - 1);
}

export function drawTitle(ctx, G, viewW, viewH, saveExists) {
  ctx.save();
  // Dim the world behind the title.
  ctx.fillStyle = 'rgba(6,10,26,0.72)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3c5a';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('PORTO VERDE', viewW / 2, viewH / 2 - 120);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('— 港口风云 · 开放世界犯罪故事 —', viewW / 2, viewH / 2 - 84);
  ctx.fillStyle = '#fff';
  ctx.font = '15px sans-serif';
  const lines = [
    'Marco Reyes，码头工人出身的亡命徒。',
    'Rosa Delgado 有六单活交给你，Los Tiburones 挡在前面。',
    '偷车、飙车、抢劫、逃亡——Porto Verde 是你的游乐场。',
    '',
    'WASD 移动 / 开车 · E 上车 · 鼠标左键射击 · F 拳击',
    'Shift 疾跑 · T 接任务 · 空格手刹 · P 暂停',
    '',
    '找齐 10 个金锚（⚓）奖励 $1,000。去 Rosa 的车库喷漆可消星。',
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, viewW / 2, viewH / 2 - 44 + i * 24));
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#7ddb7d';
  ctx.fillText(saveExists ? '点击 开始游戏 / 继续存档' : '点击 开始游戏', viewW / 2, viewH / 2 + 150);
  ctx.restore();
}

export function drawPaused(ctx, viewW, viewH) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('PAUSED', viewW / 2, viewH / 2);
  ctx.font = '15px sans-serif';
  ctx.fillText('按 P 继续 · 按 R 回到标题', viewW / 2, viewH / 2 + 34);
  ctx.restore();
}
