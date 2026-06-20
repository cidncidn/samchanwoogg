// 무기: 직업별 1번 메인(궁수=장궁 / 전사=검 / 마법사=에너지볼트) + 공용 끓는 기름
import * as THREE from 'three';
import { ELEMENTS } from './jobs.js';

// cls: 사용 직업('archer'/'warrior'/'mage'/'all'). 활은 궁수만, 검은 전사만, 기본마법은 마법사만.
// 마법사 'spell'(에너지 볼트)은 전직한 속성에 따라 발사 원소가 바뀐다.
export const WEAPONS = [
  { id: 'bow',   key: '1', name: '장궁',       icon: '🏹', dmg: 50,  cd: 1.0, unlocked: true, res: 'arrow', cls: 'archer' },
  { id: 'sword', key: '1', name: '용병의 검',   icon: '🗡', dmg: 95,  cd: 0.5, unlocked: true, res: null,   range: 3.6, cls: 'warrior' },
  { id: 'spell', key: '1', name: '에너지 볼트', icon: '✨', dmg: 55,  cd: 0.55, unlocked: true, res: 'mana', mana: 8, cls: 'mage' },
  { id: 'oil',   key: '2', name: '끓는 기름',   icon: '🛢', dmg: 140, cd: 1.6, unlocked: true, res: 'oil',  aoe: 7, cls: 'all' },
];

// 직업별 무기 로드아웃 (1번 = 직업 메인)
export function weaponsForClass(cls) {
  return WEAPONS.filter((w) => w.cls === cls || w.cls === 'all');
}

const SPELL_SPREAD = 0.06; // 마법 산탄 (활 0.035의 +71%)
export const ARROW_SPEED = 29; // 화살 기본 속도 (이전 42에서 -30%)
export const ARROW_GRAVITY = 6;

// 공용 화살 메시 — 굵은 촉 + 발광 깃으로 비행이 잘 보이게 (플레이어·스킬·NPC 공유)
// scale: 거대 화살 강화 / glowMul: 이펙트 등급이 높을수록 발광이 강해짐
export function makeArrowMesh(glowColor = 0xffaa55, scale = 1, glowMul = 1.6) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 1.0, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2a, emissive: 0x221100, emissiveIntensity: 0.6 })
  );
  shaft.rotation.x = Math.PI / 2; // 길이축을 +Z(진행)로
  g.add(shaft);
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.22, 6),
    new THREE.MeshStandardMaterial({ color: 0x9a9aa5, metalness: 0.7, roughness: 0.3 })
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.6;
  g.add(head);
  // 발광 깃 — 트레일처럼 보이도록 HDR 색 (등급↑ → 발광↑)
  const fletch = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(glowColor).multiplyScalar(glowMul) })
  );
  fletch.rotation.x = -Math.PI / 2;
  fletch.position.z = -0.55;
  g.add(fletch);
  // 고등급: 화살을 감싸는 발광 오라
  if (glowMul > 2.2) {
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(glowColor).multiplyScalar(2.5), transparent: true, opacity: 0.4 })
    );
    g.add(aura);
  }
  g.scale.setScalar(scale);
  return g;
}

export class WeaponSystem {
  constructor(camera, scene, game) {
    this.camera = camera;
    this.scene = scene;
    this.game = game;
    this.loadout = weaponsForClass('archer'); // 기본(직업 적용 시 교체)
    this.current = 0;
    this.cooldown = 0;
    this.arrows = 150; this.maxArrows = 300; // 물량전 대응
    this.oil = 3; this.maxOil = 8;
    this.drawing = false; this.drawT = 0; this.bowKick = 0; this.bowReload = 0;
    this.physDmgMult = 1;   // 무기 강화 (활·검)
    this.magicDmgMult = 1;  // 마법 증폭
    this.projectiles = [];  // {mesh, vel, type, dmg, life, ...}
    this.recoil = 0;

    this._buildViewModels();

    // 숫자 단축키 1~9,0 → 무기 슬롯 0~9 (미할당 칸은 무시)
    addEventListener('keydown', (e) => {
      if (this.game.state !== 'playing') return;
      let idx = -1;
      if (e.key >= '1' && e.key <= '9') idx = +e.key - 1;
      else if (e.key === '0') idx = 9;
      if (idx >= 0 && idx < this.loadout.length) this.select(idx);
    });
    addEventListener('wheel', (e) => {
      if (this.game.state !== 'playing') return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.select((this.current + dir + this.loadout.length) % this.loadout.length);
    });
    // 캔버스 위 좌클릭만 발사 (UI/액션바 클릭은 제외)
    addEventListener('mousedown', (e) => {
      if (e.button === 0 && e.target === this.game.renderer.domElement) this.firing = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
  }

  // 직업 전환 시 로드아웃 교체
  setClass(cls) {
    this.loadout = weaponsForClass(cls);
    this.current = 0;
    this._showOnly(this.loadout[0].id);
    this.game.ui?.refreshWeaponBar();
  }

  _showOnly(id) {
    for (const key of Object.keys(this.models)) this.models[key].visible = false;
    if (this.models[id]) this.models[id].visible = true;
  }

  _buildViewModels() {
    // 1인칭 뷰모델 (카메라에 부착)
    this.viewRoot = new THREE.Group();
    this.camera.add(this.viewRoot);
    this.models = {};

    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9a9aa5, roughness: 0.35, metalness: 0.8 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5, metalness: 0.6 });

    // 장궁 — 검게 그을린 리커브 활, 메긴 화살, 가죽 그립을 쥔 손
    {
      const g = new THREE.Group();
      const bowWood = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.55, metalness: 0.1 });
      const leather = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95 });
      const glove = new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.95 });
      const fletch = new THREE.MeshStandardMaterial({ color: 0x6a1a1a, roughness: 0.9, side: THREE.DoubleSide });

      // 활 본체 마운트 — 에셋 로드 완료 후 attachBowModel()이 GLB를 끼움
      this.bowMount = new THREE.Group();
      g.add(this.bowMount);
      void bowWood; // (구 절차 생성 재질 — GLB 도착 전 폴백 없음)

      // 메긴 화살 (발사 시 잠깐 사라졌다 재장전)
      const arrowG = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.66, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.8 }));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.23;
      arrowG.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 6),
        new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.35, metalness: 0.8 }));
      head.rotation.x = -Math.PI / 2;
      head.position.z = -0.58;
      arrowG.add(head);
      for (let f = 0; f < 3; f++) { // 깃
        const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.07), fletch);
        feather.position.z = 0.055;
        feather.rotation.z = (f / 3) * Math.PI * 2;
        feather.translateY(0.016);
        arrowG.add(feather);
      }
      arrowG.position.set(0.012, 0.09, 0);
      g.add(arrowG);
      this.bowArrow = arrowG;

      // 활을 쥔 손 (가죽 장갑)
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.06), glove);
      palm.position.set(0.035, -0.01, -0.078);
      g.add(palm);
      for (let f = 0; f < 4; f++) { // 그립을 감싼 손가락
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.016, 0.05), glove);
        finger.position.set(-0.015, 0.035 - f * 0.022, -0.105);
        g.add(finger);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.045, 0.018), glove);
      thumb.position.set(0.02, 0.02, -0.045);
      thumb.rotation.z = -0.4;
      g.add(thumb);
      // 팔뚝 (화면 하단으로 이어짐)
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 8), leather);
      forearm.position.set(0.09, -0.18, -0.05);
      forearm.rotation.z = 0.35;
      g.add(forearm);

      // 레퍼런스처럼 비스듬히 캔팅된 자세
      g.position.set(0.3, -0.22, -0.55);
      g.rotation.set(0.05, -0.12, 0.32);
      this.models.bow = g;
    }
    // 검
    {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.012), steel);
      blade.position.y = 0.42; g.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), darkSteel);
      guard.position.y = 0.06; g.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 6), wood);
      grip.position.y = -0.04; g.add(grip);
      g.position.set(0.38, -0.38, -0.6);
      g.rotation.set(0.3, 0, -0.25);
      this.models.sword = g;
    }
    // 마법사 지팡이 (보주 색 = 전직 속성. spellOrb를 런타임에 recolor)
    {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.85, 6), wood);
      shaft.rotation.x = 0.5; g.add(shaft);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xcc66ff, emissive: 0xcc66ff, emissiveIntensity: 3.2, roughness: 0.3 }));
      orb.position.set(0, 0.42, -0.2); g.add(orb);
      // PointLight 제거 — 광원 수 변경 시 Three.js 셰이더 재컴파일로 프레임 멈춤 발생
      g.position.set(0.36, -0.42, -0.6);
      this.models.spell = g;
      this.spellOrb = orb;
    }
    // 기름 양동이
    {
      const g = new THREE.Group();
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 10, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x33271a, roughness: 0.9, side: THREE.DoubleSide }));
      g.add(bucket);
      const oilSurf = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10),
        new THREE.MeshStandardMaterial({ color: 0x110d05, roughness: 0.2 }));
      oilSurf.rotation.x = -Math.PI / 2; oilSurf.position.y = 0.07; g.add(oilSurf);
      g.position.set(0.34, -0.42, -0.55);
      this.models.oil = g;
    }
    for (const key of Object.keys(this.models)) {
      const m = this.models[key];
      m.scale.multiplyScalar(0.45); // 거리 유지, 모델만 축소 → 화면 점유율 감소
      m.visible = false;
      this.viewRoot.add(m);
    }
    this.models.bow.visible = true;
  }

  // GLB 활 장착 (에셋 로드 완료 시 main에서 호출)
  attachBowModel(assets) {
    const bow = assets.getBow();
    // 원본: 세로 ~2m — 뷰모델 비율로 핏팅
    bow.scale.setScalar(0.5);
    bow.rotation.y = Math.PI / 2; // 시위가 사수 쪽을 향하도록
    bow.position.set(0, 0, -0.06);
    this.bowMount.add(bow);
  }

  // 시위 릴리즈 — extra(0~1): 풀드로우 보너스 (속도·정확도 최대 +20%)
  _releaseArrow(extra = 0) {
    const P = this.game.progression;
    const BOW = WEAPONS[0];
    const dir = new THREE.Vector3();
    this.game.aimDir(dir); // 마우스 커서 방향
    dir.y += 0.03; // 에임 상향 보정 (중력 낙차 상쇄)
    dir.normalize();
    P.spread(dir, 0.035 * (1 - 0.2 * extra)); // 풀드로우 = 산탄 -20%
    const from = this.camera.position.clone().addScaledVector(dir, 0.6); // 눈높이 발사
    const arrow = makeArrowMesh(0xffcc66);
    arrow.position.copy(from);
    const roll = P.roll(BOW.dmg * this.physDmgMult * P.grade.dmg * this.groundBonus());
    this.projectiles.push({
      mesh: arrow, vel: dir.clone().multiplyScalar(ARROW_SPEED * (1 + 0.2 * extra)), type: 'arrow',
      dmg: roll.dmg, crit: roll.crit, life: 4.5, gravity: ARROW_GRAVITY,
    });
    this.cooldown = BOW.cd * P.grade.cd; // 발사 시점부터 재장전 (1초/발 기준)
    this.scene.add(arrow);
    this.game.audio.shoot();
    this.recoil = 1;
    this.bowKick = 1;
    this.bowReload = 0.38;
    if (this.bowArrow) this.bowArrow.position.z = 0;
    this.game.ui?.refreshWeaponBar();
  }

  select(i) {
    if (i < 0 || i >= this.loadout.length || this.drawing) return;
    if (this.models[this.loadout[this.current].id]) this.models[this.loadout[this.current].id].visible = false;
    this.current = i;
    if (this.models[this.loadout[i].id]) this.models[this.loadout[i].id].visible = true;
    this.cooldown = 0;
    this.game.ui?.refreshWeaponBar();
  }

  get weapon() { return this.loadout[this.current]; }

  // 전사 출성 보너스: 지상 전투 시 물리 피해 +30%
  groundBonus() {
    return (this.game.playerClass === 'warrior' && this.game.player.mode === 'ground') ? 1.3 : 1;
  }

  canAfford(w) {
    if (w.res === 'arrow') return this.arrows > 0;
    if (w.res === 'mana') return this.game.player.mana >= w.mana;
    if (w.res === 'oil') return this.oil > 0;
    return true;
  }

  tryFire() {
    const w = this.weapon;
    if (w.id === 'bow') return; // 활은 홀드-드로우 방식 — update()에서 처리
    if (this.cooldown > 0 || this.drawing || !this.canAfford(w)) return;
    // 물리 무기(검)는 등급에 따라 연사 속도 상승
    const P = this.game.progression;
    this.cooldown = w.cd * (w.id === 'sword' ? P.grade.cd : 1);
    this.recoil = 1;

    const dir = new THREE.Vector3();
    this.game.aimDir(dir); // 마우스 커서 방향으로 조준
    const from = this.camera.position.clone().addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.15, 0));
    const E = this.game.enemies;
    const FX = this.game.effects;

    switch (w.id) {
      // (활은 tryFire를 거치지 않음 — 홀드-드로우)
      case 'spell': {
        // 마법사 기본 공격 — 전직한 속성에 따라 발사 원소가 변한다
        this.game.player.spendMana(w.mana);
        P.spread(dir, SPELL_SPREAD);
        const el = this.game.skills?.subDef?.combat?.element || 'arcane';
        const ecol = (ELEMENTS[el] || ELEMENTS.arcane).color;
        if (this.spellOrb) { this.spellOrb.material.color.setHex(ecol); this.spellOrb.material.emissive.setHex(ecol); }
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(ecol).multiplyScalar(1.6) }));
        ball.position.copy(from);
        const sr = P.roll(w.dmg * this.magicDmgMult);
        // 폭발 원소(불·땅)만 type 'fire'(광역). 그 외(비전·번개·물 등)는 직격 데미지(type 'ice')
        const aoeEl = (el === 'fire' || el === 'earth');
        this.projectiles.push({
          mesh: ball, vel: dir.clone().multiplyScalar(30), type: aoeEl ? 'fire' : 'ice',
          dmg: sr.dmg, crit: sr.crit, life: 2.4, gravity: el === 'earth' ? 3 : 1,
          aoe: aoeEl ? 2.4 : undefined,
          slow: el === 'ice' ? 2.5 : undefined,
          dot: (el === 'poison' || el === 'curse') ? { dps: 14 * this.game.skills.scale, dur: 5 } : null,
          color: ecol,
        });
        this.scene.add(ball);
        this.game.audio.shoot();
        break;
      }
      case 'sword': {
        this.game.audio.swing();
        this.swingAnim = 1;
        // 명중 판정 (리니지식 to-hit) — 빗나가면 헛스윙
        if (!P.meleeHit()) break;
        // 근접 호 판정: 전방 일정 거리·각도 내 적 전부
        const r = P.roll(w.dmg * this.physDmgMult * P.grade.dmg * this.groundBonus());
        let hit = false;
        for (const e of E.list) {
          if (e.dead) continue;
          const to = e.mesh.position.clone().add(new THREE.Vector3(0, 1.2 * e.cfg.scale, 0)).sub(this.camera.position);
          const dist = to.length();
          if (dist < w.range + e.radius && to.normalize().dot(dir) > 0.55) {
            E.damage(e, r.dmg, null, r.crit ? 'crit' : true);
            hit = true;
          }
        }
        if (hit) FX.shake(0.1, 0.04);
        break;
      }
      case 'fire': {
        this.game.player.spendMana(w.mana);
        P.spread(dir, SPELL_SPREAD); // 마법 산탄 — 활보다 부정확
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 10, 10),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.4, 0.3) }) // HDR — 블룸 발광 (광원 없이)
        );
        ball.position.copy(from);
        const fr = P.roll(w.dmg * this.magicDmgMult);
        this.projectiles.push({
          mesh: ball, vel: dir.clone().multiplyScalar(25), type: 'fire',
          dmg: fr.dmg, crit: fr.crit, aoe: w.aoe, life: 4, gravity: 3,
        });
        this.scene.add(ball);
        break;
      }
      case 'ice': {
        this.game.player.spendMana(w.mana);
        P.spread(dir, SPELL_SPREAD); // 마법 산탄 — 활보다 부정확
        const shard = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.55, 6),
          new THREE.MeshStandardMaterial({ color: 0x99ddff, emissive: 0x3388cc, emissiveIntensity: 1.2 })
        );
        shard.position.copy(from);
        const ir = P.roll(w.dmg * this.magicDmgMult);
        this.projectiles.push({
          mesh: shard, vel: dir.clone().multiplyScalar(35), type: 'ice',
          dmg: ir.dmg, crit: ir.crit, slow: w.slow, life: 3, gravity: 2,
        });
        this.scene.add(shard);
        break;
      }
      case 'lightning': {
        this.game.player.spendMana(w.mana);
        const colliders = this.game.world.colliders;
        // 두 점 사이에 벽(AABB) 장애물이 있는지 검사
        const blocked = (a, b) => {
          const d = b.clone().sub(a);
          const len = d.length();
          if (len < 0.01) return false;
          const inv = new THREE.Vector3(1 / d.x, 1 / d.y, 1 / d.z);
          for (const c of colliders) {
            let tmin = ((d.x >= 0 ? c.minX : c.maxX) - a.x) * inv.x;
            let tmax = ((d.x >= 0 ? c.maxX : c.minX) - a.x) * inv.x;
            let tymin = ((d.y >= 0 ? c.minY : c.maxY) - a.y) * inv.y;
            let tymax = ((d.y >= 0 ? c.maxY : c.minY) - a.y) * inv.y;
            if (tmin > tymax || tymin > tmax) continue;
            tmin = Math.max(tmin, tymin); tmax = Math.min(tmax, tymax);
            let tzmin = ((d.z >= 0 ? c.minZ : c.maxZ) - a.z) * inv.z;
            let tzmax = ((d.z >= 0 ? c.maxZ : c.minZ) - a.z) * inv.z;
            if (tmin > tzmax || tzmin > tmax) continue;
            tmin = Math.max(tmin, tzmin); tmax = Math.min(tmax, tzmax);
            if (tmax >= 0 && tmin <= 1) return true;
          }
          return false;
        };
        // 조준 방향 원뿔 내 최근접 적 → 연쇄 (벽 뒤 대상 제외)
        let target = null, best = 0.8;
        for (const e of E.list) {
          if (e.dead) continue;
          const ePos = e.mesh.position.clone().add(new THREE.Vector3(0, 1.2 * e.cfg.scale, 0));
          const to = ePos.clone().sub(this.camera.position);
          const dist = to.length();
          if (dist > 70) continue;
          const dot = to.normalize().dot(dir);
          if (dot > best && !blocked(from, ePos)) { best = dot; target = e; }
        }
        if (target) {
          const lr = P.roll(w.dmg * this.magicDmgMult);
          let prevPos = from.clone();
          let cur = target;
          const hitSet = new Set();
          for (let c = 0; c < w.chain && cur; c++) {
            const curPos = cur.mesh.position.clone().add(new THREE.Vector3(0, 1.3 * cur.cfg.scale, 0));
            FX.lightningBeam(prevPos, curPos);
            E.damage(cur, lr.dmg * Math.pow(0.75, c), curPos, lr.crit ? 'crit' : true);
            hitSet.add(cur);
            prevPos = curPos;
            // 다음 연쇄 대상 (벽 뒤 제외)
            let next = null, nd = 14;
            for (const e2 of E.list) {
              if (e2.dead || hitSet.has(e2)) continue;
              const e2Pos = e2.mesh.position.clone().add(new THREE.Vector3(0, 1.2 * e2.cfg.scale, 0));
              const d = e2Pos.distanceTo(curPos);
              if (d < nd && !blocked(curPos, e2Pos)) { nd = d; next = e2; }
            }
            cur = next;
          }
        } else {
          // 허공: 빈 줄기만
          FX.lightningBeam(from, from.clone().addScaledVector(dir, 40));
        }
        break;
      }
      case 'oil': {
        this.oil--;
        const pot = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x221a0d, roughness: 0.4 })
        );
        pot.position.copy(from);
        this.projectiles.push({
          mesh: pot, vel: dir.clone().multiplyScalar(17), type: 'oil',
          dmg: w.dmg, aoe: w.aoe, life: 5, gravity: 12,
        });
        this.scene.add(pot);
        break;
      }
    }
    this.game.ui?.refreshWeaponBar();
  }

  update(dt, t) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.firing && this.game.state === 'playing') this.tryFire();

    // 활 재장전 연출
    if (this.bowReload > 0) {
      this.bowReload -= dt;
      this.bowArrow.visible = false;
    } else if (this.bowArrow && !this.bowArrow.visible) {
      this.bowArrow.visible = true;
      this.bowArrow.position.z = 0;
    }

    // 활: 홀드-드로우 — 좌클릭을 누르는 동안 시위를 당기고, 놓으면 발사
    // 풀드로우(추가 0.9초)일수록 화살 속도·정확도 최대 +20%
    if (this.weapon.id === 'bow' && this.game.state === 'playing'
      && this.firing && !this.drawing && this.cooldown <= 0 && this.arrows > 0 && this.bowReload <= 0) {
      this.arrows--;
      this.drawing = true;
      this.drawT = 0;
      this.game.ui?.refreshWeaponBar();
    }
    if (this.drawing) {
      this.drawT += dt;
      const minK = Math.min(1, this.drawT / 0.13);
      const extra = Math.max(0, Math.min(1, (this.drawT - 0.13) / 0.9)); // 풀드로우 게이지
      if (this.bowArrow) this.bowArrow.position.z = 0.17 * minK + 0.08 * extra;
      if (!this.firing && this.drawT >= 0.13) {
        this.drawing = false;
        this._releaseArrow(extra);
      }
    }
    // 릴리즈 반동: 활이 앞으로 튕겼다가 복귀
    this.bowKick *= Math.max(0, 1 - dt * 9);
    if (this.models.bow) this.models.bow.rotation.x = 0.05 - this.bowKick * 0.16;

    // 뷰모델 흔들림 + 반동
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const bob = this.game.player.moving ? Math.sin(t * 9) * 0.012 : Math.sin(t * 1.8) * 0.004;
    this.viewRoot.position.y = bob - this.recoil * 0.05;
    this.viewRoot.position.z = this.recoil * 0.06;
    if (this.swingAnim > 0) {
      this.swingAnim = Math.max(0, this.swingAnim - dt * 4);
      this.models.sword.rotation.x = 0.3 - Math.sin((1 - this.swingAnim) * Math.PI) * 1.6;
    }

    // 투사체
    const E = this.game.enemies;
    const FX = this.game.effects;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= (p.gravity || 0) * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.type === 'arrow') {
        // 화살 메시는 +Z가 진행축 (makeArrowMesh)
        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.vel.clone().normalize());
      } else if (p.type === 'ice') {
        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.vel.clone().normalize());
      }

      let exploded = false;
      // 적 충돌
      for (const e of E.list) {
        if (e.dead) continue;
        const center = e.mesh.position.clone().add(new THREE.Vector3(0, 1.1 * e.cfg.scale, 0));
        if (p.mesh.position.distanceTo(center) < e.radius + (p.pierce ? (p.hitR || 1.5) : 0.3)) {
          // 관통형 (전사 참격파): 적마다 1회씩 피해, 소멸하지 않음
          if (p.pierce) {
            if (!p.hitSet.has(e)) {
              p.hitSet.add(e);
              E.damage(e, p.dmg, p.mesh.position.clone(), p.crit ? 'crit' : true);
              if (p.dot) e.dot = { until: t + p.dot.dur, dps: p.dot.dps };
              this.game.audio.hit(p.mesh.position.distanceTo(this.camera.position));
            }
            continue;
          }
          if (p.type === 'fire' || p.type === 'oil' || p.type === 'energy') {
            this._explode(p);
            exploded = true;
          } else {
            E.damage(e, p.dmg, p.mesh.position.clone(), p.npc ? false : (p.crit ? 'crit' : true));
            this.game.audio.hit(p.mesh.position.distanceTo(this.camera.position));
            if (p.crit) FX.spark(p.mesh.position, 0xff4422, 9); // 치명타 섬광
            if (p.dot) e.dot = { until: t + p.dot.dur, dps: p.dot.dps }; // 독·출혈
            if (p.onImpact) p.onImpact(p.mesh.position.clone()); // 착탄 효과 (빙결 장판 등)
            if (p.type === 'ice') {
              e.slowUntil = t + p.slow;
              FX.spark(p.mesh.position, 0x99ddff, 8);
            }
          }
          p.life = 0;
          break;
        }
      }
      // 장애물(성벽·탑·천수각) 충돌
      if (!exploded && p.life > 0) {
        const pp = p.mesh.position;
        for (const c of this.game.world.colliders) {
          if (pp.x > c.minX && pp.x < c.maxX && pp.y > c.minY && pp.y < c.maxY && pp.z > c.minZ && pp.z < c.maxZ) {
            if (p.type === 'fire' || p.type === 'oil' || p.type === 'energy') this._explode(p);
            else FX.spark(pp.clone(), 0x998877, 4);
            p.life = 0;
            break;
          }
        }
      }
      // 지면 충돌
      if (!exploded && p.life > 0 && p.mesh.position.y <= 0.1) {
        if (p.type === 'fire' || p.type === 'oil' || p.type === 'energy') this._explode(p);
        else if (p.type === 'arrow') FX.spark(p.mesh.position, 0x887755, 3);
        if (p.onImpact) p.onImpact(p.mesh.position.clone()); // 지면 착탄도 장판 생성
        p.life = 0;
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _explode(p) {
    const FX = this.game.effects;
    const E = this.game.enemies;
    const color = p.color || (p.type === 'oil' ? 0xff8833 : 0xff5511);
    FX.explosion(p.mesh.position, p.aoe, color);
    this.game.audio.explosion(p.mesh.position.distanceTo(this.camera.position));
    for (const e of E.list) {
      if (e.dead) continue;
      const d = e.mesh.position.distanceTo(p.mesh.position);
      if (d < p.aoe + e.radius) {
        const falloff = 1 - Math.max(0, d - 2) / (p.aoe + e.radius);
        E.damage(e, p.dmg * Math.max(0.3, falloff), null, p.npc ? false : (p.crit ? 'crit' : true));
      }
    }
  }
}
