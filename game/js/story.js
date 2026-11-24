// story.js — six story missions, golden-anchor collectibles, pay'n'spray garage.
import { dist, clamp, rand, pick } from './util.js';
import { addMoney, addWanted, clearWanted, showMessage, showBanner, spawnFloater, spawnParticles, saveGame } from './core.js';
import { makeCar, damageCar } from './vehicles.js';
import { makePed } from './people.js';
import { sfx } from './audio.js';

const S = (x, y) => ({ x, y });

// Mission definitions. Each has steps driven by distance triggers.
export const MISSIONS = [
  {
    id: 'first-job', name: '第一单', reward: 300,
    brief: 'Rosa 有活给你：去码头取一个包裹，送到当铺。开车去更快。',
    start(G) { G.mission.data = { step: 0 }; },
    marker(G) {
      const d = G.mission.data;
      return d.step === 0 ? { ...S(G.city.spots.docks.x, G.city.spots.docks.y), label: '取包裹' }
        : { ...S(G.city.spots.pawnshop.x, G.city.spots.pawnshop.y), label: '送到当铺' };
    },
    update(G, dt) {
      const d = G.mission.data;
      const p = G.player;
      const tgt = d.step === 0 ? G.city.spots.docks : G.city.spots.pawnshop;
      if (dist(p.x, p.y, tgt.x, tgt.y) < 70) {
        if (d.step === 0) {
          d.step = 1; sfx.pickup();
          showMessage(G, '包裹到手！送到市中心的当铺');
          spawnFloater(G, p.x, p.y - 24, '包裹 +1', '#ffe08a');
        } else completeMission(G);
      }
    },
  },
  {
    id: 'hot-wheels', name: '偷车', reward: 500,
    brief: '码头停着一辆粉色跑车，Rosa 要它。偷出来，开回 Rosa 的车库。',
    start(G) {
      const m = G.city.spots.marina;
      const car = makeCar(G, m.x + 40, m.y, Math.PI / 2, 3, { parked: true, mission: true, color: '#e83e9e' });
      G.mission.data = { step: 0, car };
      showMessage(G, '目标：码头那辆粉色跑车');
    },
    marker(G) {
      const d = G.mission.data;
      if (d.step === 0) return { ...S(d.car.x, d.car.y), label: '粉色跑车' };
      return { ...S(G.city.spots.garage.x, G.city.spots.garage.y), label: "Rosa 的车库" };
    },
    update(G, dt) {
      const d = G.mission.data;
      const p = G.player;
      if (d.step === 0 && !p.onFoot && p.car === d.car) {
        d.step = 1;
        showMessage(G, '得手！开回 Rosa 的车库，别撞坏了');
      }
      if (d.step === 1 && !p.onFoot && p.car === d.car &&
        dist(p.x, p.y, G.city.spots.garage.x, G.city.spots.garage.y) < 80) {
        completeMission(G);
      }
      if (d.car.dead) failMission(G, '跑车被你撞报废了……');
    },
  },
  {
    id: 'shark-bait', name: '鲨鱼饵', reward: 600,
    brief: 'Los Tiburones 的信使在夜市交货。抢走他的公文包，然后甩掉警察回公寓。',
    start(G) {
      const m = G.city.spots.market;
      const courier = makePed(G, m.x, m.y);
      courier.shirt = '#1c1c1c'; courier.speed = 90;
      G.mission.data = { step: 0, courier };
      showMessage(G, '目标：夜市那个穿黑衣服的信使');
    },
    marker(G) {
      const d = G.mission.data;
      if (d.step === 0) return { ...S(d.courier.x, d.courier.y), label: '信使' };
      return { ...S(G.city.spots.safehouse.x, G.city.spots.safehouse.y), label: '回公寓' };
    },
    update(G, dt) {
      const d = G.mission.data;
      const p = G.player;
      if (d.step === 0) {
        if (d.courier.dead) {
          d.step = 1;
          addWanted(G, 30);
          showMessage(G, '公文包到手！有警察追来了，回公寓');
          spawnFloater(G, p.x, p.y - 24, '公文包', '#ffe08a');
        } else if (dist(p.x, p.y, d.courier.x, d.courier.y) < 30) {
          // Snatch it without a fight.
          d.courier.dead = true;
          d.step = 1;
          addWanted(G, 30);
          showMessage(G, '公文包抢到了！回公寓');
        }
      } else if (dist(p.x, p.y, G.city.spots.safehouse.x, G.city.spots.safehouse.y) < 70) {
        clearWanted(G);
        completeMission(G);
      }
    },
  },
  {
    id: 'dockside-deal', name: '码头交易', reward: 800,
    brief: '陪 Rosa 去码头交易。Tiburones 的人一定会来搅局——保护她，干掉三波打手。',
    start(G) {
      G.mission.data = { step: 0, wave: 0, spawned: [], waveT: 0 };
      showMessage(G, '先去码头，交易在那儿进行');
    },
    marker(G) {
      const d = G.mission.data;
      if (d.step === 0) return { ...S(G.city.spots.docks.x, G.city.spots.docks.y), label: '码头交易点' };
      return { ...S(G.city.spots.docks.x, G.city.spots.docks.y), label: `打手 ${d.wave}/3 波` };
    },
    update(G, dt) {
      const d = G.mission.data;
      const p = G.player;
      const dock = G.city.spots.docks;
      if (d.step === 0) {
        if (dist(p.x, p.y, dock.x, dock.y) < 90) {
          d.step = 1; d.wave = 1; d.waveT = 0;
          showMessage(G, '交易开始了！Tiburones 的人来了');
          sfx.mission();
        }
        return;
      }
      d.waveT -= dt;
      // Spawn a wave when the field is clear.
      const alive = d.spawned.filter(e => !e.dead).length;
      if (alive === 0 && d.waveT <= 0) {
        if (d.wave > 3) { completeMission(G); return; }
        const n = 2 + d.wave;
        d.spawned = [];
        for (let i = 0; i < n; i++) {
          const thug = makePed(G, dock.x + rand(-160, 160), dock.y + rand(-60, 60));
          thug.shirt = '#222831'; thug.speed = 120;
          d.spawned.push(thug);
        }
        showMessage(G, `第 ${d.wave} 波打手来了（共 3 波）`);
        d.wave++;
        d.waveT = 1.5;
      }
      // Thugs rush the player.
      for (const thug of d.spawned) {
        if (thug.dead) continue;
        thug.tx = p.x; thug.ty = p.y; thug.waitT = 0; thug.speed = 120;
        if (dist(thug.x, thug.y, p.x, p.y) < 30 && p.onFoot) {
          // Melee hit.
          if (!thug.hitCd || thug.hitCd <= 0) {
            thug.hitCd = 1.0;
            G.health -= 8;
            spawnParticles(G, p.x, p.y, '#c0392b', 5, 100);
            if (G.health <= 0) { failMission(G, '你在码头被打手干掉了'); return; }
          }
        }
        if (thug.hitCd > 0) thug.hitCd -= dt;
      }
    },
  },
  {
    id: 'payback', name: '报复', reward: 900,
    brief: 'Tiburones 藏了三辆装货的面包车在城里。找到它们，撞烂或者打爆。',
    start(G) {
      const spots = [
        { x: 670, y: 150 }, { x: 1970, y: 1190 }, { x: 930, y: 1710 },
      ];
      const vans = spots.map(s => makeCar(G, s.x, s.y, rand(0, Math.PI * 2), 4, { parked: true, mission: true, color: '#3a3f4a' }));
      G.mission.data = { step: 0, vans };
      showMessage(G, '三辆 Tiburones 面包车，全部打爆');
    },
    marker(G) {
      const d = G.mission.data;
      const alive = d.vans.find(v => !v.dead);
      if (!alive) return null;
      const left = d.vans.filter(v => !v.dead).length;
      return { ...S(alive.x, alive.y), label: `面包车（剩 ${left} 辆）` };
    },
    update(G, dt) {
      const d = G.mission.data;
      const left = d.vans.filter(v => !v.dead).length;
      if (left === 0) completeMission(G);
    },
  },
  {
    id: 'the-big-one', name: '大买卖', reward: 1500,
    brief: '最后的活：抢港口仓库的现金。拿上钱，顶着四星通缉逃回公寓。Rosa 在等你。',
    start(G) {
      G.mission.data = { step: 0 };
      showMessage(G, '去港口仓库，现金就在里面');
    },
    marker(G) {
      const d = G.mission.data;
      if (d.step === 0) return { ...S(G.city.spots.warehouse.x, G.city.spots.warehouse.y), label: '港口仓库' };
      return { ...S(G.city.spots.safehouse.x, G.city.spots.safehouse.y), label: '逃回公寓' };
    },
    update(G, dt) {
      const d = G.mission.data;
      const p = G.player;
      if (d.step === 0 && dist(p.x, p.y, G.city.spots.warehouse.x, G.city.spots.warehouse.y) < 80) {
        d.step = 1;
        addWanted(G, 60);
        showMessage(G, '现金到手！四星通缉，逃回公寓！');
        spawnFloater(G, p.x, p.y - 24, '现金 $1,500', '#7ddb7d');
        sfx.cash();
      } else if (d.step === 1 && dist(p.x, p.y, G.city.spots.safehouse.x, G.city.spots.safehouse.y) < 70) {
        clearWanted(G);
        completeMission(G);
      }
    },
  },
];

export function startMission(G, idx) {
  const def = MISSIONS[idx];
  if (!def) return;
  G.mission = { def, idx, data: {} };
  G.missionIdx = idx;
  def.start(G);
  showBanner(G, def.name.toUpperCase(), def.brief, 4);
  sfx.mission();
  saveGame(G);
}

export function completeMission(G) {
  const m = G.mission;
  if (!m) return;
  addMoney(G, m.def.reward);
  G.missionsDone.push(m.def.id);
  G.mission = null;
  G.missionIdx = Math.min(G.missionIdx + 1, MISSIONS.length);
  G.stats.missions++;
  showBanner(G, 'MISSION PASSED', `+${m.def.reward}  ${m.def.name}`, 3.5);
  sfx.mission();
  saveGame(G);
}

export function failMission(G, reason) {
  if (!G.mission) return;
  const name = G.mission.def.name;
  G.mission = null;
  showBanner(G, 'MISSION FAILED', reason || name, 3);
  showMessage(G, '任务失败了，去 Rosa 的车库附近按 T 可以重接');
  sfx.fail();
}

export function currentMarker(G) {
  if (!G.mission) return null;
  try { return G.mission.def.marker(G); } catch (e) { return null; }
}

// --- Golden anchors (hidden collectibles) + pay'n'spray ---
export function updateStory(G, dt) {
  if (G.mission) {
    try { G.mission.def.update(G, dt); } catch (e) { /* a mission bug must not kill the game */ }
  }
  // Golden anchors.
  const p = G.player;
  for (const pk of G.city.packages) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      G.packagesFound++;
      spawnFloater(G, pk.x, pk.y - 24, `金锚 ${G.packagesFound}/10`, '#ffd700');
      sfx.pickup();
      if (G.packagesFound >= 10) {
        addMoney(G, 1000);
        showBanner(G, 'COLLECTOR', '10 个金锚集齐！+$1,000', 3.5);
      }
    }
  }
  // Pay'n'spray at Rosa's garage: drive in, $100 clears wanted + repairs.
  if (!p.onFoot && p.car && G.wanted > 0 && G.money >= 100) {
    const g = G.city.spots.garage;
    if (dist(p.x, p.y, g.x, g.y) < 70) {
      if (!G.sprayCd || G.sprayCd <= 0) {
        G.money -= 100;
        p.car.hp = 100;
        clearWanted(G);
        p.car.color = pick(['#c94f4f', '#4f7dc9', '#3cb371', '#e8b93c']);
        showMessage(G, '喷漆完成 -$100，通缉清除，车修好了');
        sfx.door();
        G.sprayCd = 5;
      }
    }
  }
  if (G.sprayCd > 0) G.sprayCd -= dt;
}
