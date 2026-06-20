// RPG 성장 시스템 — 디아블로·리니지 레퍼런스 + 엑셀 설계서 공식(시트1~3)
// 캐릭터 레벨(XP·주스탯·생명력 공식), 데미지 분산·치명타, 무기 등급(인챈트 도박)
import * as THREE from 'three';
import { mainStatAt, vitalityAt, statDmgMult, maxLife } from './formulas.js';

// 무기 등급 — 공용 희귀도 6단계(C~UR) 팔레트와 정렬. 피해·연사·명중·치명타 보정.
// cost/chance = 인챈트 비용·성공률 (리니지식 — 실패해도 파괴는 없다)
export const GRADES = [
  { name: '일반(C)',   color: '#b8b8b8', dmg: 1.00, cd: 1.00, acc: 0.00, crit: 0.00, cost: 0,    chance: 1.0 },
  { name: '고급(UC)',  color: '#4caf50', dmg: 1.15, cd: 0.95, acc: 0.08, crit: 0.01, cost: 120,  chance: 1.0 },
  { name: '희귀(R)',   color: '#3b82f6', dmg: 1.32, cd: 0.91, acc: 0.14, crit: 0.02, cost: 320,  chance: 0.85 },
  { name: '영웅(SR)',  color: '#a855f7', dmg: 1.55, cd: 0.85, acc: 0.22, crit: 0.04, cost: 700,  chance: 0.65 },
  { name: '전설(SSR)', color: '#ffd44a', dmg: 1.85, cd: 0.78, acc: 0.32, crit: 0.06, cost: 1500, chance: 0.45 },
  { name: '신화(UR)',  color: '#ef4444', dmg: 2.30, cd: 0.70, acc: 0.45, crit: 0.09, cost: 3500, chance: 0.28 },
];

const MAX_LEVEL = 100; // 엑셀 스킬트리 Lv1~100 전 구간
const STAT_PER_LEVEL = 5; // 레벨업당 분배 가능한 스탯 포인트

// 패시브 슬롯 해금 레벨 (시트16: 4슬롯) / 액티브 6슬롯은 레벨별 순차 해금
export const PASSIVE_UNLOCK = [10, 20, 30, 70];

// 직업별 스탯 (디아블로3~4 참고) — 주스탯=공격력, 활력=생명력, 직업 고유 스탯.
// primary: 공격력 주스탯 (전사=힘/궁수=민첩/마법사=지능). 마법사는 지능이 더 빠르게 공격력을 올린다.
export const PRIMARY_KEY = { warrior: 'str', archer: 'dex', mage: 'int' };
export const STAT_DEFS = {
  warrior: [
    { key: 'str', name: '힘',   abbr: 'STR', primary: true, desc: '물리 공격력 +1.0%/pt' },
    { key: 'vit', name: '활력', abbr: 'VIT', desc: '최대 생명력 +14/pt' },
    { key: 'con', name: '인내', abbr: 'CON', desc: '받는 피해 감소 +0.6%/pt (최대 60%)' },
  ],
  archer: [
    { key: 'dex', name: '민첩', abbr: 'DEX', primary: true, desc: '물리 공격력 +1.0%/pt' },
    { key: 'vit', name: '활력', abbr: 'VIT', desc: '최대 생명력 +14/pt' },
    { key: 'pre', name: '정밀', abbr: 'PRE', desc: '치명타 확률 +0.4%/pt' },
  ],
  mage: [
    { key: 'int', name: '지능', abbr: 'INT', primary: true, desc: '마법 공격력 +1.7%/pt (빠름)' },
    { key: 'vit', name: '활력', abbr: 'VIT', desc: '최대 생명력 +14/pt' },
    { key: 'wil', name: '의지', abbr: 'WIL', desc: '최대 마나 +5·마나 재생 +0.4/pt' },
  ],
};
const SECONDARY_BASE = 5; // 직업 고유 보조 스탯 시작값

export class Progression {
  constructor(game) {
    this.game = game;
    this.level = 1;
    this.xp = 0;
    this.weaponGrade = 0; // GRADES 인덱스
    this.alloc = {};      // 분배한 스탯 포인트 {str,dex,int,vit,con,pre,wil}
    this.statPoints = 0;  // 미분배 스탯 포인트
  }

  reset() { this.level = 1; this.xp = 0; this.weaponGrade = 0; this.alloc = {}; this.statPoints = 0; }

  get cls() { return this.game.playerClass; }
  get primaryKey() { return PRIMARY_KEY[this.cls]; }
  get statDefs() { return STAT_DEFS[this.cls] || STAT_DEFS.archer; }
  // 스탯 현재값 (기본 + 분배)
  statVal(key) {
    if (key === this.primaryKey) return this.mainStat;
    if (key === 'vit') return this.vitality;
    return SECONDARY_BASE + (this.alloc[key] || 0);
  }
  // 스탯 1 포인트 분배 (해당 직업 스탯만)
  addStatPoint(key) {
    if (this.statPoints <= 0 || !this.statDefs.some((s) => s.key === key)) return false;
    this.statPoints--;
    this.alloc[key] = (this.alloc[key] || 0) + 1;
    const p = this.game.player;
    if (key === 'vit') { const nm = maxLife(this.level, this.vitality); p.hp += Math.max(0, nm - p.maxHp); p.maxHp = nm; }
    else if (key === 'wil') { p.maxMana += 5; p.mana += 5; p.manaRegen += 0.4; }
    return true;
  }

  // 완만한 곡선 — 스킬 트리(Lv1~100)를 합리적 시간 안에 경험하도록
  xpNeed(lv = this.level) { return Math.floor(30 * Math.pow(lv, 1.22)); }

  // 해금된 패시브 슬롯 수 (시트16: Lv10/20/30/70 → 최대 4)
  get passiveSlots() { return PASSIVE_UNLOCK.filter((l) => this.level >= l).length; }

  get grade() { return GRADES[this.weaponGrade]; }

  // 시트1·2: 직업 주스탯(레벨 기본 + 분배) → 데미지 배율
  get mainStat() { return mainStatAt(this.game.playerClass, this.level) + (this.alloc[this.primaryKey] || 0); }
  get vitality() { return vitalityAt(this.game.playerClass, this.level) + (this.alloc.vit || 0); }
  // 마법사는 지능이 더 빠르게 공격력을 올린다 (1.7%/pt vs 1.0%/pt)
  get levelDmg() { return this.cls === 'mage' ? 1 + this.mainStat / 60 : statDmgMult(this.mainStat); }

  // 명중(산탄 감소): 등급 + 레벨 0.5%/Lv — 최대 85%
  get accuracy() { return Math.min(0.85, this.grade.acc + (this.level - 1) * 0.005); }

  // 치명타 확률: 기본 5% + 등급 + 레벨 0.2%/Lv + (궁수 정밀 0.4%/pt)
  get critChance() {
    return 0.05 + this.grade.crit + (this.level - 1) * 0.002
      + (this.cls === 'archer' ? (this.alloc.pre || 0) * 0.004 : 0);
  }

  // 받는 피해 감소 (전사 인내 0.6%/pt, 최대 60%)
  get damageReduction() { return this.cls === 'warrior' ? Math.min(0.6, (this.alloc.con || 0) * 0.006) : 0; }

  addXp(n) {
    if (this.level >= MAX_LEVEL) return;
    this.xp += n;
    let leveled = false;
    while (this.xp >= this.xpNeed() && this.level < MAX_LEVEL) {
      this.xp -= this.xpNeed();
      this.level++;
      this.statPoints += STAT_PER_LEVEL; // 레벨업당 분배 포인트 +5
      leveled = true;
      const p = this.game.player;
      // 시트2: 최대 생명력 = (36 + 4×레벨) + 활력 × 계수
      p.maxHp = maxLife(this.level, this.vitality);
      p.maxMana += 3;
      p.hp = p.maxHp;     // 디아블로식 레벨업 완전 회복
      p.mana = p.maxMana;
    }
    if (leveled) {
      this.game.ui.banner(`⬆ LEVEL UP! — Lv ${this.level} (스탯 +${STAT_PER_LEVEL})`, '#ffd44a');
      this.game.audio.levelUp();
      this.game.ui.refreshSkill();
      if (this.game.skills.hasLearnable) {
        setTimeout(() => this.game.ui.banner('새 스킬 습득 가능 — 성 안 직업 스킬 사범을 찾아가라', '#b06aff'), 2800);
      }
    }
  }

  // 데미지 굴림: 분산 0.8~1.2배 (디아블로 min-max) + 치명타 ×2
  roll(base) {
    const crit = Math.random() < this.critChance;
    const variance = 0.8 + Math.random() * 0.4;
    return { dmg: base * this.levelDmg * variance * (crit ? 2 : 1), crit };
  }

  // 산탄: 명중이 낮을수록 조준 방향에서 퍼진다 (in-place 변형)
  spread(dir, baseSpread = 0.035) {
    const s = baseSpread * Math.max(0.15, 1 - this.accuracy);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
    dir.applyAxisAngle(up, (Math.random() - 0.5) * 2 * s);
    dir.applyAxisAngle(right, (Math.random() - 0.5) * 2 * s);
    return dir.normalize();
  }

  // 검 명중 판정 (리니지식 to-hit): 기본 85% + 명중 보정
  meleeHit() { return Math.random() < Math.min(0.98, 0.85 + this.accuracy * 0.3); }
}
