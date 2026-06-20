// 영속 저장 — 성(castle)은 며칠·몇 달 유지되고, 용병(personal)은 죽으면 사라진다
import { WEAPONS } from './weapons.js';

const KEY = 'lastBastion.v1';

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}

export function writeSave(game) {
  const w = game.weapons, p = game.player, s = game.shop;
  const data = {
    savedAt: Date.now(),
    castle: {
      elapsed: game.siege.elapsed,
      gateHp: game.world.gate.hp,
      archers: game.npcs.archers.length,
      mages: game.npcs.mages.length,
      suppliers: game.npcs.suppliers,
      repairCrews: game.repairCrews,
      kills: game.enemies.kills,
    },
    personal: {
      cls: game.playerClass,
      gold: game.gold,
      arrows: w.arrows, maxArrows: w.maxArrows, oil: w.oil, maxOil: w.maxOil,
      physDmgMult: w.physDmgMult, magicDmgMult: w.magicDmgMult,
      maxHp: p.maxHp, hpRegen: p.hpRegen, maxMana: p.maxMana, manaRegen: p.manaRegen,
      unlocked: WEAPONS.filter((x) => x.unlocked).map((x) => x.id),
      shopLv: { vitLv: s.vitLv },
      sub: game.skills.subKey,
      skills: [...game.skills.learned],
      alloc: game.progression.alloc,
      statPoints: game.progression.statPoints,
      level: game.progression.level,
      xp: game.progression.xp,
      weaponGrade: game.progression.weaponGrade,
    },
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 저장 불가 환경 무시 */ }
}

// 용병 사망: 개인 기록만 소멸, 성은 유지
export function clearPersonal() {
  const d = loadSave();
  if (d) {
    delete d.personal;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* */ }
  }
}

// 성 함락: 모든 기록 소멸 — 새로운 성에서 다시
export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
}
