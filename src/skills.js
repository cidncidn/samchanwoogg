// 세부직업 기반 스킬 시스템 — 엑셀 18세부직업 스킬트리(jobs.js)를 구동한다.
// 학습한 스킬을 Q/E/R/T 4슬롯에 직접 지정(바인딩)해 각각 다른 스킬로 발동한다.
// 세부직업이 전투 아키타입(근접/원거리/시전)+원소를 정하고, 학습 스킬이 실행기에 누적된다.
import * as THREE from 'three';
import { makeArrowMesh, ARROW_SPEED, ARROW_GRAVITY } from './weapons.js';
import { CLASSES, DEFAULT_SUB, getSub, ELEMENTS, skillIcon, isPassive, isUltimate } from './jobs.js';

// 전투 아키타입별 기본 쿨다운·기준 데미지
const KIND_CD = { melee: 9, ranged: 8, caster: 12 };
const KIND_BASE = { melee: 110, ranged: 50, caster: 170 };
export const SLOT_KEYS = ['Q', 'E', 'R', 'T'];

export class SkillSystem {
  constructor(game) {
    this.game = game;
    this.cls = 'archer';
    this.subKey = DEFAULT_SUB.archer;
    this.learned = new Set();          // 학습한 스킬 이름
    this.bindings = [null, null, null, null]; // Q/E/R/T 슬롯에 지정된 스킬명
    this.slotCd = [0, 0, 0, 0];        // 슬롯별 쿨다운
    this.meteors = [];
    this.zones = [];
    addEventListener('keydown', (e) => {
      const i = SLOT_KEYS.indexOf(e.code.replace('Key', ''));
      if (i >= 0) this.useSlot(i);
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    this._initSub();
  }

  // 세부직업 진입 시: lv1 기본기 자동 습득 + 슬롯 자동 배치
  _initSub() {
    this.learned = new Set([this.skills[0].name]);
    this.bindings = [null, null, null, null];
    this._autoBind();
  }
  _autoBind() {
    const bound = new Set(this.bindings.filter(Boolean));
    for (const s of this.skills) {
      if (isPassive(s) || !this.has(s.name) || bound.has(s.name)) continue;
      const slot = this.bindings.indexOf(null);
      if (slot < 0) break;
      this.bindings[slot] = s.name; bound.add(s.name);
    }
  }
  bindSlot(i, name) {
    if (i < 0 || i > 3) return false;
    if (name && (!this.has(name) || isPassive(this._skillByName(name)))) return false;
    // 다른 슬롯에 이미 있으면 비우기 (중복 방지)
    const dup = this.bindings.indexOf(name);
    if (name && dup >= 0) this.bindings[dup] = null;
    this.bindings[i] = name;
    this.game.ui?.refreshSkill();
    return true;
  }
  // 슬롯에 지정 가능한(학습한 액티브) 스킬 목록
  bindable() { return this.skills.filter((s) => !isPassive(s) && this.has(s.name)); }

  // ── 세부직업·스킬 조회 ──
  get subDef() { return getSub(this.cls, this.subKey); }
  get skills() { return this.subDef.skills; }
  _skillByName(name) { return this.skills.find((s) => s.name === name); }
  has(name) { return this.learned.has(name); }
  get rank() { return this.learned.size; }
  // 시그니처(첫 비패시브) 스킬 = 액티브 기반
  get signature() { return this.skills.find((s) => !isPassive(s)) || this.skills[0]; }
  get def() {
    const el = ELEMENTS[this.subDef.combat.element] || ELEMENTS.none;
    return { name: this.subDef.name, icon: skillIcon(this.signature), cd: KIND_CD[this.subDef.combat.kind], color: el.color };
  }

  // 레벨 게이트 — 현재 레벨에서 학습 가능한(아직 미학습) 스킬 목록
  get learnable() { return this.skills.filter((s) => this.game.progression.level >= s.lv && !this.has(s.name)); }
  get hasLearnable() { return this.learnable.length > 0; }
  // UI용 전체 목록 (학습/잠금 상태 포함)
  treeList() {
    const lv = this.game.progression.level;
    return this.skills.map((s) => ({ ...s, learned: this.has(s.name), unlocked: lv >= s.lv }));
  }
  get modeInfo() {
    return { name: `${this.subDef.name} (${this.rank}/${this.skills.length})`,
      desc: this.rank ? `${this.rank}개 스킬 습득 — ${this.subDef.role}` : `${this.subDef.role} — 직업 사범에게서 스킬을 배워라` };
  }
  get scale() { return 1 + (this.game.progression.level - 1) * 0.03; }

  setClass(cls) {
    this.cls = cls;
    this.subKey = DEFAULT_SUB[cls];
    this.slotCd = [0, 0, 0, 0];
    this._initSub();
    this.game.ui?.refreshSkill();
  }

  // 전직 — 같은 기본직업 내 세부직업 변경 (재특성: 학습·바인딩 초기화)
  setSub(subKey) {
    if (!CLASSES[this.cls].subs.some((s) => s.key === subKey)) return false;
    this.subKey = subKey;
    this.slotCd = [0, 0, 0, 0];
    this._initSub();
    this.game.ui?.refreshSkill();
    return true;
  }

  // 세이브 복원 시 바인딩 재구성
  rebind() { this.bindings = [null, null, null, null]; this._autoBind(); }

  // 스킬 학습 (레벨 충족 시) — 빈 슬롯이 있으면 자동 배치
  learn(name) {
    const s = this._skillByName(name);
    if (!s || this.has(name) || this.game.progression.level < s.lv) return false;
    this.learned.add(name);
    if (!isPassive(s)) this._autoBind();
    this.game.ui?.refreshSkill();
    return true;
  }

  // ── 학습 누적 + 포커스 스킬 → 실전 파라미터 ──
  _params(focus) {
    const c = this.subDef.combat;
    const elems = new Set();
    if (c.element && c.element !== 'none') elems.add(c.element);
    let multi = c.multi || 1, pierce = !!c.pierce, aoe = c.aoe || 0;
    let dot = !!c.dot, slow = !!c.slow, control = !!c.control, chain = c.chain || 0;
    let activeN = 0, passiveN = 0;
    const scan = (name) => {
      if (/화염|불|화상|연소|화산|인페르노/.test(name)) elems.add('fire');
      if (/냉기|얼음|빙결|서리|눈보라|빙하|동상|영도|결빙/.test(name)) { elems.add('ice'); slow = true; }
      if (/전격|번개|감전|뇌전|낙뢰|천둥|폭풍우|과부하|전도/.test(name)) { elems.add('lightning'); chain = Math.max(chain, 3); }
      if (/독|맹독|중독|역병|출혈|유혈/.test(name)) { elems.add('poison'); dot = true; }
      if (/관통|꿰뚫|볼트|투창|용의 창/.test(name)) pierce = true;
      if (/다중|연사|난사|연발|화살비|산탄|연격|연속|회전|회오리|이중|연환/.test(name)) multi += 1;
      if (/폭발|작렬|폭격|광역|가르기|분쇄|메테오|운석|폭풍|해일|강타|진노|붕괴|개벽|재앙/.test(name)) aoe = Math.max(aoe, 3.5);
      if (/기절|빙결|석화|속박|침묵|넉백|돌풍|견제|곰덫|도발|지진/.test(name)) control = true;
    };
    for (const name of this.learned) {
      const s = this._skillByName(name); if (!s) continue;
      if (isPassive(s)) { passiveN++; continue; }
      activeN++; scan(name);
    }
    // 포커스(현재 발동) 스킬 특성을 강조 반영
    if (focus) scan(focus.name);
    const ult = focus ? isUltimate(focus) : false;
    let power = 1 + 0.05 * activeN + 0.04 * passiveN;
    if (ult) power += 0.6;
    const coef = Math.max(0.6, (focus?.coef || this.signature.coef || 1));
    const elemArr = [...elems];
    const element = elemArr[0] || 'none';
    const glow = (ELEMENTS[element] || ELEMENTS.none).color;
    return { kind: c.kind, style: c.style, element, elems, glow, power, coef, multi, pierce, aoe, dot, slow, control, chain,
      rangedWave: !!c.ranged, reach: c.reach || 1, charged: ult, ult };
  }

  // 슬롯(Q/E/R/T) 발동
  useSlot(i) {
    if (this.game.state !== 'playing') return;
    const name = this.bindings[i];
    if (!name || this.slotCd[i] > 0) return;
    const skill = this._skillByName(name);
    if (!skill || !this.has(name) || isPassive(skill)) return;
    const P = this._params(skill);
    this.slotCd[i] = KIND_CD[P.kind] * (P.ult ? 2 : 1);
    if (P.kind === 'melee') this._melee(P);
    else if (P.kind === 'ranged') this._ranged(P);
    else this._caster(P);
    if (P.ult) this.game.effects.shake(0.18, 0.07);
    this.game.ui?.refreshSkill();
  }

  _fwd() { return this.game.player.aimDir.clone(); }
  _aimGround() { return this.game.aimGround(); }

  _baseDmg(P) {
    const w = this.game.weapons, prog = this.game.progression;
    const physMul = P.kind === 'caster' ? w.magicDmgMult : w.physDmgMult;
    const gradeMul = P.kind === 'caster' ? 1 : prog.grade.dmg;
    return KIND_BASE[P.kind] * physMul * gradeMul * this.scale * P.power * (0.7 + P.coef * 0.3);
  }

  // ───────────── 근접 (전사 5세부직업) ─────────────
  _melee(P) {
    const w = this.game.weapons, prog = this.game.progression, cam = this.game.camera;
    const baseDmg = this._baseDmg(P);
    const E = this.game.enemies;

    // 광역 회전 (aoe 보유 시 주변 강타)
    if (P.aoe > 0 || P.control) {
      const r = (P.aoe || 3) + (P.charged ? 3 : 0) + P.reach * 1.5;
      const roll = prog.roll(baseDmg * 1.1);
      for (const e of E.list) {
        if (!e.dead && e.mesh.position.distanceTo(this.game.player.position) < r + e.radius) {
          E.damage(e, roll.dmg, null, roll.crit ? 'crit' : true);
          if (P.control) e.slowUntil = Math.max(e.slowUntil || 0, this.game.elapsed + 1.5);
          if (P.dot) e.dot = { until: this.game.elapsed + 6, dps: 22 * this.scale };
        }
      }
      this.game.effects.explosion(this.game.player.position.clone().add(new THREE.Vector3(0, -0.5, 0)),
        r * 0.7, P.glow);
      this.game.audio.swing();
    }
    // 검기/투사 발사 (ranged 진입형 세부직업 — 양손검·도끼·단도·창)
    if (P.rangedWave) {
      const shots = Math.min(3, P.multi);
      for (let s = 0; s < shots; s++) {
        const dir = this._fwd(); prog.spread(dir, 0.03);
        if (shots > 1) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (s - (shots - 1) / 2) * 0.12);
        const wide = P.aoe >= 3.5 ? 6.5 : 3.4;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(wide, P.aoe >= 3.5 ? 2.6 : 1.5, 0.25),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow).multiplyScalar(1.6 + this.rank * 0.04), transparent: true, opacity: 0.85 })
        );
        mesh.position.copy(cam.position).addScaledVector(dir, 1.2);
        mesh.lookAt(mesh.position.clone().add(dir));
        const roll = prog.roll(baseDmg * (P.charged ? 1.6 : 1));
        w.projectiles.push({
          mesh, vel: dir.clone().multiplyScalar(38), type: 'wave',
          dmg: roll.dmg, crit: roll.crit, life: P.aoe >= 3.5 ? 1.3 : 1.0, gravity: 0,
          pierce: true, hitSet: new Set(), hitR: P.aoe >= 3.5 ? 3.2 : 1.6,
          dot: P.dot ? { dps: 22 * this.scale, dur: 6 } : null,
          aoe: P.aoe >= 3.5 ? P.aoe : undefined,
        });
        w.scene.add(mesh);
      }
    }
    this.game.audio.swing();
    this.game.effects.shake(0.12, 0.05);
    this.game.weapons.recoil = 1;
  }

  // ───────────── 원거리 (궁수 5세부직업) ─────────────
  _ranged(P) {
    const prog = this.game.progression;
    const baseDmg = this._baseDmg(P);
    const up = new THREE.Vector3(0, 1, 0);
    const fxScale = (P.aoe >= 3.5 ? 1.5 : 1) * (1 + this.rank * 0.03);
    const fxGlow = 1.6 + this.rank * 0.15;
    const count = Math.max(1, P.multi);
    const volley = P.charged ? 2 : 1;

    const fireVolley = () => {
      const base = this._fwd(); base.y += 0.03; base.normalize();
      for (let i = 0; i < count; i++) {
        const dir = base.clone().applyAxisAngle(up, (i - (count - 1) / 2) * 0.05);
        prog.spread(dir, 0.04);
        this._spawnArrow(dir, baseDmg, P, { fxScale, fxGlow });
      }
      // 화살비/광역 — aoe 보유 시 상공 낙하 추가
      if (P.aoe >= 3.5) {
        const tgt = this._aimGround();
        const rainN = P.charged ? 8 : 5;
        for (let k = 0; k < rainN; k++) {
          const sp = new THREE.Vector3(tgt.x + (Math.random() - 0.5) * 10, 22, tgt.z + (Math.random() - 0.5) * 10);
          this._spawnArrow(new THREE.Vector3(0, -1, 0), baseDmg * 0.7, P, { fxScale, fxGlow, from: sp });
        }
      }
      this.game.audio.shoot();
    };
    for (let v = 0; v < volley; v++) {
      if (v === 0) fireVolley();
      else setTimeout(() => { if (this.game.state === 'playing') fireVolley(); }, v * 150);
    }
    // 함정/소환형 — 착지 지점에 장판
    if (this.subDef.combat.trap) this.spawnZone(this._aimGround(), P.elems.has('ice') ? 'ice' : 'toxic', 4, 5);
    this.game.weapons.recoil = 1;
  }

  _spawnArrow(dir, dmg, P, o) {
    const w = this.game.weapons, prog = this.game.progression;
    const mesh = makeArrowMesh(P.glow, o.fxScale, o.fxGlow);
    const from = o.from || this.game.camera.position.clone().addScaledVector(dir, 0.6);
    mesh.position.copy(from);
    const roll = prog.roll(dmg);
    const explode = P.aoe > 0 && P.aoe < 3.5; // 소형 폭발 (작렬촉)
    w.projectiles.push({
      mesh, vel: dir.normalize().multiplyScalar(ARROW_SPEED), type: explode ? 'fire' : 'arrow',
      dmg: roll.dmg, crit: roll.crit, life: 2.7, gravity: ARROW_GRAVITY,
      pierce: P.pierce || undefined, hitSet: P.pierce ? new Set() : undefined, hitR: P.pierce ? 1.2 : undefined,
      aoe: explode ? 2.6 : undefined, color: P.glow,
      dot: P.dot ? { dps: 25 * this.scale, dur: 8 } : null,
      onImpact: P.slow ? (pos) => this.spawnZone(pos, 'ice', 4, 4) : null,
    });
    w.scene.add(mesh);
  }

  // ───────────── 시전 (마법사 8세부직업) ─────────────
  _caster(P) {
    const prog = this.game.progression;
    const baseDmg = this._baseDmg(P);
    const style = P.style || 'bolt';
    if (style === 'meteor') return this._castMeteor(P, baseDmg);
    if (style === 'chain') return this._castChain(P, baseDmg);
    if (style === 'beam') return this._castBeam(P, baseDmg);
    if (style === 'cone') return this._castCone(P, baseDmg);
    return this._castBolt(P, baseDmg); // bolt (얼음·버프·저주)
  }

  _castMeteor(P, baseDmg) {
    const target = this._aimGround();
    const prog = this.game.progression;
    const scatter = 4 * (1 - prog.accuracy);
    target.x += (Math.random() - 0.5) * 2 * scatter;
    target.z += (Math.random() - 0.5) * 2 * scatter;
    const count = Math.max(1, P.multi) + (P.charged ? 1 : 0);
    const r = (P.aoe || 5) + (P.charged ? 1.5 : 0);
    const zone = P.elems.has('ice') ? 'ice' : (P.dot || P.elems.has('poison')) ? 'toxic' : null;
    for (let i = 0; i < count; i++) {
      const pt = i === 0 ? target.clone()
        : new THREE.Vector3(target.x + (Math.random() - 0.5) * 11, 0, target.z + (Math.random() - 0.5) * 11);
      this._meteorAt(pt, 0.9 + i * 0.22, baseDmg, r, zone, P.glow);
    }
  }

  _castChain(P, baseDmg) {
    const E = this.game.enemies, FX = this.game.effects, cam = this.game.camera, prog = this.game.progression;
    const dir = this._fwd();
    const from = cam.position.clone().addScaledVector(dir, 0.6);
    let target = null, best = 0.8;
    for (const e of E.list) {
      if (e.dead) continue;
      const ePos = e.mesh.position.clone().add(new THREE.Vector3(0, 1.2 * e.cfg.scale, 0));
      const to = ePos.clone().sub(cam.position); const dist = to.length();
      if (dist > 70) continue;
      const dot = to.normalize().dot(dir);
      if (dot > best) { best = dot; target = e; }
    }
    const chains = (P.chain || 3) + (P.charged ? 2 : 0);
    if (target) {
      const roll = prog.roll(baseDmg);
      let prev = from.clone(), cur = target;
      const hit = new Set();
      for (let c = 0; c < chains && cur; c++) {
        const curPos = cur.mesh.position.clone().add(new THREE.Vector3(0, 1.3 * cur.cfg.scale, 0));
        FX.lightningBeam(prev, curPos);
        E.damage(cur, roll.dmg * Math.pow(0.8, c), curPos, roll.crit ? 'crit' : true);
        hit.add(cur); prev = curPos;
        let next = null, nd = 16;
        for (const e2 of E.list) {
          if (e2.dead || hit.has(e2)) continue;
          const d = e2.mesh.position.distanceTo(curPos);
          if (d < nd) { nd = d; next = e2; }
        }
        cur = next;
      }
      this.game.audio.explosion(2);
    } else {
      FX.lightningBeam(from, from.clone().addScaledVector(dir, 40));
    }
  }

  _castBeam(P, baseDmg) {
    // 관통 물줄기 — 직선 관통 투사체
    const prog = this.game.progression, cam = this.game.camera;
    const dir = this._fwd(); prog.spread(dir, 0.02);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 2.4, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow).multiplyScalar(1.5), transparent: true, opacity: 0.85 })
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.position.copy(cam.position).addScaledVector(dir, 1.0);
    const roll = prog.roll(baseDmg);
    this.game.weapons.projectiles.push({
      mesh, vel: dir.clone().multiplyScalar(34), type: 'wave', dmg: roll.dmg, crit: roll.crit,
      life: 1.6, gravity: 0, pierce: true, hitSet: new Set(), hitR: 1.4, color: P.glow,
    });
    this.game.weapons.scene.add(mesh);
    if (P.charged && this.subDef.combat.heal) { const p = this.game.player; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.12); }
    this.game.audio.shoot();
  }

  _castCone(P, baseDmg) {
    // 바람 — 전방 부채꼴 다발 + 넉백
    const prog = this.game.progression, cam = this.game.camera, up = new THREE.Vector3(0, 1, 0);
    const n = 4 + Math.max(0, P.multi - 1);
    const base = this._fwd(); base.y += 0.02; base.normalize();
    for (let i = 0; i < n; i++) {
      const dir = base.clone().applyAxisAngle(up, (i - (n - 1) / 2) * 0.12);
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow).multiplyScalar(1.5) }));
      mesh.position.copy(cam.position).addScaledVector(dir, 0.8);
      const roll = prog.roll(baseDmg * 0.6);
      this.game.weapons.projectiles.push({
        mesh, vel: dir.clone().multiplyScalar(30), type: 'ice', dmg: roll.dmg, crit: roll.crit,
        life: 0.9, gravity: 0, slow: 1.5, color: P.glow,
      });
      this.game.weapons.scene.add(mesh);
    }
    this.game.audio.shoot();
  }

  _castBolt(P, baseDmg) {
    // 얼음/버프/저주 — 단일~소수 투사체 + 상태이상/유틸
    const prog = this.game.progression, cam = this.game.camera, up = new THREE.Vector3(0, 1, 0);
    const n = Math.max(1, P.multi);
    const base = this._fwd(); prog.spread(base, 0.03);
    for (let i = 0; i < n; i++) {
      const dir = base.clone().applyAxisAngle(up, (i - (n - 1) / 2) * 0.06);
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow).multiplyScalar(1.4) }));
      mesh.position.copy(cam.position).addScaledVector(dir, 0.8);
      const roll = prog.roll(baseDmg);
      // 폭발(aoe>0) 원소만 type 'fire'(광역). 그 외(비전·번개 등)는 직격 데미지(type 'ice')로 — undefined aoe 폭발 0뎀 버그 방지
      const explode = P.aoe > 0;
      this.game.weapons.projectiles.push({
        mesh, vel: dir.clone().multiplyScalar(30), type: explode ? 'fire' : 'ice',
        dmg: roll.dmg, crit: roll.crit, life: 2.2, gravity: 1.5,
        aoe: explode ? (P.aoe >= 3.5 ? P.aoe : 2.6) : undefined, slow: P.slow ? 3 : undefined, color: P.glow,
        dot: P.dot ? { dps: 24 * this.scale, dur: 6 } : null,
        onImpact: P.elems.has('ice') ? (pos) => this.spawnZone(pos, 'ice', 4, 4) : null,
      });
      this.game.weapons.scene.add(mesh);
    }
    // 버프형 — 자기 강화 (보호막 대용: 즉시 회복)
    if (this.subDef.combat.support) { const p = this.game.player; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.1); }
    this.game.audio.shoot();
  }

  _meteorAt(pt, delay, dmg, r, zone, glow) {
    const prog = this.game.progression;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.8, r, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(glow || 0xff5522).multiplyScalar(1.2), side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pt.x, 0.06, pt.z);
    this.game.scene.add(ring);
    const roll = prog.roll(dmg);
    this.meteors.push({ t: delay, target: pt, ring, dmg: roll.dmg, crit: roll.crit, r, zone, glow });
  }

  spawnZone(pos, type, r, dur) {
    const mat = new THREE.MeshBasicMaterial({
      color: type === 'ice' ? new THREE.Color(0.4, 0.9, 1.6) : new THREE.Color(0.5, 1.4, 0.3),
      transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 22), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.05, pos.z);
    this.game.scene.add(mesh);
    this.zones.push({ mesh, pos: mesh.position.clone(), r, type, until: this.game.elapsed + dur, dps: type === 'toxic' ? 30 * this.scale : 0 });
  }

  update(dt) {
    for (let i = 0; i < this.slotCd.length; i++) this.slotCd[i] = Math.max(0, this.slotCd[i] - dt);
    const now = this.game.elapsed;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t -= dt;
      m.ring.material.opacity = 0.4 + 0.4 * Math.sin(m.t * 25);
      if (m.t <= 0) {
        this.game.scene.remove(m.ring);
        this.game.effects.explosion(m.target.clone().add(new THREE.Vector3(0, 1, 0)), m.r,
          m.zone === 'ice' ? 0x66bbff : m.zone === 'toxic' ? 0x66cc33 : (m.glow || 0xff6622));
        this.game.audio.explosion(m.target.distanceTo(this.game.camera.position));
        for (const e of this.game.enemies.list) {
          if (e.dead) continue;
          const d = e.mesh.position.distanceTo(m.target);
          if (d < m.r + e.radius) {
            const falloff = 1 - Math.max(0, d - 2) / (m.r + e.radius);
            this.game.enemies.damage(e, m.dmg * Math.max(0.35, falloff), null, m.crit ? 'crit' : true);
          }
        }
        if (m.zone) this.spawnZone(m.target, m.zone, m.r, m.zone === 'toxic' ? 6 : 4);
        this.meteors.splice(i, 1);
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (now > z.until) { this.game.scene.remove(z.mesh); this.zones.splice(i, 1); continue; }
      z.mesh.material.opacity = 0.18 + 0.1 * Math.sin(now * 6);
      for (const e of this.game.enemies.list) {
        if (e.dead) continue;
        if (e.mesh.position.distanceTo(z.pos) < z.r + e.radius * 0.5) {
          if (z.type === 'ice') e.slowUntil = Math.max(e.slowUntil || 0, now + 0.4);
          else e.dot = { until: now + 0.6, dps: z.dps };
        }
      }
    }
  }
}
