// NPC: 성벽 궁수(자동 사격) + 전투 마법사(광역 화염) + 보급병(주기 물자 조달)
import * as THREE from 'three';
import { WALL_TOP_Y, FORT } from './world.js';
import { makeArrowMesh } from './weapons.js';

// 4면 성벽(x±54, z 0~108) 통로 위 배치 좌표를 라운드로빈(북·동·남·서)으로 분산 생성.
// 성 규모 4배 → 성벽 NPC 수용 2배(궁수 16·마법사 12).
const innerN = 1.6, innerS = 106.4, innerW = -52.6, innerE = 52.6;
function wallSpots(perWall) {
  const spots = [];
  for (let i = 0; i < perWall; i++) {
    const fx = -46 + (i + 0.5) / perWall * 92; // x: -46~46
    const fz = 8 + (i + 0.5) / perWall * 92;    // z: 8~100
    spots.push([fx, innerN], [innerE, fz], [fx, innerS], [innerW, fz]); // 북·동·남·서
  }
  return spots;
}
const ARCHER_SPOTS = wallSpots(4); // 16
const MAGE_SPOTS = wallSpots(3);   // 12

export class NpcManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.archers = [];
    this.mages = [];
    this.suppliers = 0; // 보급병 수 (모델 없음 — 주기적으로 물자 귀환)
    this.maxArchers = ARCHER_SPOTS.length;
    this.maxMages = MAGE_SPOTS.length;
    this.maxSuppliers = 4;
  }

  // 원거리 몬스터가 노릴 수 있는, 사거리 내 가장 가까운 살아있는 NPC
  nearestDefender(pos, range) {
    let best = null, bd = range;
    for (const a of this.archers) { const d = a.mesh.position.distanceTo(pos); if (d < bd) { bd = d; best = a; } }
    for (const m of this.mages) { const d = m.mesh.position.distanceTo(pos); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  // NPC 피격 — HP 0이면 전사
  damageNpc(npc, dmg) {
    if (npc.dead) return;
    npc.hp -= dmg;
    if (npc.hp <= 0) {
      npc.dead = true;
      this.game.effects.blood(npc.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 20, 1.3);
      this.game.effects.bloodSplat(npc.mesh.position);
      this.scene.remove(npc.mesh);
      const ai = this.archers.indexOf(npc); if (ai >= 0) this.archers.splice(ai, 1);
      const mi = this.mages.indexOf(npc); if (mi >= 0) this.mages.splice(mi, 1);
      this.game.ui.banner('아군이 쓰러졌다!', '#b85c5c');
    }
  }

  hireArcher() {
    if (this.archers.length >= this.maxArchers) return false;
    const [x, z] = ARCHER_SPOTS[this.archers.length];
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a7055, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.4), cloth);
    body.position.y = 1.2; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
    head.position.y = 2.0; g.add(head);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 6), cloth);
    hood.position.y = 2.3; g.add(hood);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 5, 12, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x4a3520 }));
    bow.position.set(0.4, 1.4, -0.2); bow.rotation.y = Math.PI / 2;
    g.add(bow);
    g.position.set(x, WALL_TOP_Y, z);
    this.scene.add(g);
    // 배치된 면만 방어. NPC는 보조 전력 — 데미지 18(플레이어 대비 ~40%),
    // 연사 1.9초·투사체 느림·산탄 넓음 (정확도/속도/연사 -30%). 막는 주체는 플레이어다.
    this.archers.push({ mesh: g, cooldown: Math.random() * 1.5, dmg: 18, range: 42, rate: 1.9, hp: 150, maxHp: 150, kind: 'archer' });
    return true;
  }

  hireMage() {
    if (this.mages.length >= this.maxMages) return false;
    const [x, z] = MAGE_SPOTS[this.mages.length];
    const g = new THREE.Group();
    const robe = new THREE.MeshStandardMaterial({ color: 0x4a2a55, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a7055, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 7), robe);
    body.position.y = 0.95; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
    head.position.y = 1.95; g.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.65, 7), robe);
    hat.position.y = 2.4; g.add(hat);
    // 지팡이 + 발광 보주
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.85 }));
    staff.position.set(0.45, 1.1, 0); g.add(staff);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.4) }));
    orb.position.set(0.45, 2.05, 0); g.add(orb);
    // 성능: NPC 보주 PointLight 제거 (발광은 emissive+블룸으로 충분). 광원 수 = 셰이딩 비용.
    g.position.set(x, WALL_TOP_Y, z);
    this.scene.add(g);
    // NPC 마법사 — 에너지볼트. HP 보유.
    this.mages.push({ mesh: g, orb, cooldown: 1 + Math.random() * 2, dmg: 24, range: 45, rate: 4.2, aoe: 4.5, hp: 120, maxHp: 120, kind: 'mage' });
    return true;
  }

  hireSupplier() {
    if (this.suppliers >= this.maxSuppliers) return false;
    this.suppliers++;
    return true;
  }

  // 웨이브 종료 시 보급병이 성 밖에서 물자 탈취해 귀환
  collectSupplies() {
    if (this.suppliers === 0) return null;
    const gold = this.suppliers * 25;
    const arrows = this.suppliers * 50;
    this.game.gold += gold;
    const ws = this.game.weapons;
    ws.arrows = Math.min(ws.maxArrows, ws.arrows + arrows);
    return { gold, arrows };
  }

  update(dt) {
    const E = this.game.enemies;

    // 전투 마법사: 에너지볼트 — 파란 발광 구체 투사체 발사 (원거리 몬스터 우선 처치)
    for (const m of this.mages) {
      m.cooldown -= dt;
      const target = this._pickTarget(E, m.mesh.position, m.range);
      if (target) {
        const dir = target.mesh.position.clone().sub(m.mesh.position);
        m.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        if (m.cooldown <= 0) {
          m.cooldown = m.rate;
          const from = m.orb.getWorldPosition(new THREE.Vector3());
          const to = target.mesh.position.clone().add(new THREE.Vector3(0, 0.8 * target.cfg.scale, 0));
          const aim = to.sub(from);
          const aimDist = aim.length();
          aim.normalize();
          const speed = 17.5; // 에너지볼트 속도 (현재 25의 70%)
          aim.x += (Math.random() - 0.5) * 0.16; // 정확도 60% — 산탄 크게
          aim.y += (Math.random() - 0.5) * 0.11;
          aim.z += (Math.random() - 0.5) * 0.16;
          aim.normalize();
          const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.32, 10, 10),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 4) }) // 파란 발광 (블룸)
          );
          ball.position.copy(from);
          this.game.weapons.projectiles.push({
            mesh: ball, vel: aim.multiplyScalar(speed), type: 'energy',
            dmg: m.dmg, aoe: m.aoe, life: 5, gravity: 0, npc: true, color: 0x3366ff,
          });
          this.game.weapons.scene.add(ball);
          this.game.audio.shoot(from.distanceTo(this.game.camera.position));
        }
      }
    }

    for (const a of this.archers) {
      a.cooldown -= dt;
      const target = this._pickTarget(E, a.mesh.position, a.range);
      if (target) {
        const dir = target.mesh.position.clone().sub(a.mesh.position);
        a.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        if (a.cooldown <= 0) {
          a.cooldown = a.rate;
          // 플레이어와 동일한 화살 투사체 — 메시·탄도·타격음 공유, 산탄으로 자연스럽게 빗나감
          const from = a.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0));
          const to = target.mesh.position.clone().add(new THREE.Vector3(0, 1.0 * target.cfg.scale, 0));
          const aimDir = to.sub(from);
          const aimDist = aimDir.length();
          aimDir.normalize();
          const speed = 25; // 플레이어(29)보다 느린 화살 (-30% 반영)
          const tof = aimDist / speed;
          aimDir.y += 0.5 * 6 * tof * tof / aimDist; // 중력 낙차 보정
          aimDir.x += (Math.random() - 0.5) * 0.1;   // NPC 산탄 넓음 (정확도 -30%)
          aimDir.y += (Math.random() - 0.5) * 0.07;
          aimDir.z += (Math.random() - 0.5) * 0.1;
          aimDir.normalize();
          const w = this.game.weapons;
          const arrowMesh = makeArrowMesh(0xcc9955);
          arrowMesh.position.copy(from);
          w.projectiles.push({
            mesh: arrowMesh, vel: aimDir.multiplyScalar(speed), type: 'arrow',
            dmg: a.dmg, life: 4.5, gravity: 6, npc: true,
          });
          w.scene.add(arrowMesh);
          this.game.audio.shoot(from.distanceTo(this.game.camera.position));
        }
      }
    }
  }

  // 타게팅: 사거리 내 원거리 몬스터(주술사·해골궁수) 우선, 없으면 최근접
  _pickTarget(E, pos, range) {
    let near = null, nd = range, ranged = null, rd = range;
    for (const e of E.list) {
      if (e.dead) continue;
      const d = e.mesh.position.distanceTo(pos);
      if (d < nd) { nd = d; near = e; }
      if (e.cfg.behavior === 'ranged' && d < rd) { rd = d; ranged = e; }
    }
    return ranged || near;
  }

  _tracer(from, to, color = 0x9a8a6a) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    this.scene.add(line);
    setTimeout(() => { this.scene.remove(line); geo.dispose(); }, 90);
  }
}

// 4면 성벽 라인 — 동료는 배정된 면의 고정축 위에서만 이동 (안마당·공중 침범 금지)
// fixed/val=고정 좌표, axis=이동축, min~max=통로 범위, test=그 면 담당 적 판별
const FACE_LINES = [
  { name: '북', fixed: 'z', val: 0,   axis: 'x', min: -52, max: 52, test: (g) => g.z < 0 },
  { name: '남', fixed: 'z', val: 108, axis: 'x', min: -52, max: 52, test: (g) => g.z > 100 },
  { name: '서', fixed: 'x', val: -54, axis: 'z', min: 4,  max: 104, test: (g) => g.x < 0 && g.z > 0 && g.z < 108 },
  { name: '동', fixed: 'x', val: 54,  axis: 'z', min: 4,  max: 104, test: (g) => g.x > 0 && g.z > 0 && g.z < 108 },
];
const ALLY_SPEED = 1.6; // 성벽 위 이동 속도 (플레이어 7의 약 23% — 훨씬 느림)

// AI 동료 용병 — 플레이어처럼 성벽을 순회하며 위협이 큰 방향을 맡는다 (로컬 협동)
export class AllyManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.allies = [];
    this.max = 4;
  }

  spawn() {
    if (this.allies.length >= this.max) return false;
    const idx = this.allies.length;
    const type = idx % 2 === 0 ? 'archer' : 'mage'; // 궁수·마법사 번갈아
    const g = new THREE.Group();
    // 푸른 망토의 동료 (아군 식별)
    const cloak = new THREE.MeshStandardMaterial({ color: type === 'mage' ? 0x2a4a8a : 0x24506a, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a5a, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.05, 0.42), cloak);
    body.position.y = 1.2; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
    head.position.y = 2.0; g.add(head);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 6), cloak);
    hood.position.y = 2.32; g.add(hood);
    // 어깨 위 발광 표식 (동료임을 강조)
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 3) }));
    mark.position.set(0, 2.7, 0); g.add(mark);
    if (type === 'archer') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 5, 12, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x4a3520 }));
      bow.position.set(0.4, 1.4, -0.2); bow.rotation.y = Math.PI / 2; g.add(bow);
    } else {
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
      staff.position.set(0.45, 1.1, 0); g.add(staff);
    }
    g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    const face = idx % 4; // 소환 순서대로 북·남·서·동 고정 배정
    const fl = FACE_LINES[face];
    const start = { x: 0, z: 0 };
    start[fl.fixed] = fl.val;
    start[fl.axis] = (fl.min + fl.max) / 2;
    g.position.set(start.x, WALL_TOP_Y, start.z);
    this.scene.add(g);
    this.allies.push({
      mesh: g, type, face, cooldown: 1 + Math.random(),
      // 플레이어의 80% 화력 (활 50→40, 마법 70→56). 레벨 보정은 update에서 곱한다.
      baseDmg: type === 'mage' ? 56 : 40, range: 70, rate: type === 'mage' ? 3.1 : 1.25,
      aoe: type === 'mage' ? 4 : 0, animSeed: Math.random() * 10,
    });
    this.game.ui?.banner(`동료 용병 — ${fl.name}쪽 성벽 배치`, '#66bbff');
    return true;
  }

  update(dt, t) {
    const E = this.game.enemies;
    if (!this.allies.length) return;
    // 봇 레벨 = 플레이어 레벨의 30% (경험치 30% 적용). 레벨당 피해 +2%
    const botLv = Math.max(1, Math.floor(this.game.progression.level * 0.3));
    const botDmgMul = 1 + (botLv - 1) * 0.02;
    this.botLv = botLv;

    this.allies.forEach((a) => {
      const fl = FACE_LINES[a.face];
      const pos = a.mesh.position;
      pos[fl.fixed] = fl.val;           // 고정축 — 자기 면 성벽 라인을 절대 벗어나지 않음
      pos.y = WALL_TOP_Y;

      // 담당 면 적 중 최근접 (없으면 면 중앙으로 복귀)
      let target = null, bd = a.range;
      for (const e of E.list) {
        if (e.dead) continue;
        const g = e.targetGate || e.mesh.position;
        if (!fl.test(g)) continue;       // 자기 면 적만
        const d = e.mesh.position.distanceTo(pos);
        if (d < bd) { bd = d; target = e; }
      }
      // 이동축 목표: 담당 적의 위치 / 없으면 면 중앙
      const desired = target
        ? Math.max(fl.min, Math.min(fl.max, target.mesh.position[fl.axis]))
        : (fl.min + fl.max) / 2;
      const cur = pos[fl.axis];
      const step = ALLY_SPEED * dt;       // 플레이어보다 훨씬 느린 고정 속도
      pos[fl.axis] = cur + Math.max(-step, Math.min(step, desired - cur));

      // 사격
      a.cooldown -= dt;
      if (target) {
        const dir = target.mesh.position.clone().sub(pos);
        a.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        if (a.cooldown <= 0) {
          a.cooldown = a.rate;
          const from = pos.clone().add(new THREE.Vector3(0, 1.6, 0));
          const to = target.mesh.position.clone().add(new THREE.Vector3(0, 1.0 * target.cfg.scale, 0));
          const aim = to.sub(from); const dist = aim.length(); aim.normalize();
          const ws = this.game.weapons;
          if (a.type === 'mage') {
            aim.x += (Math.random() - 0.5) * 0.08; aim.y += (Math.random() - 0.5) * 0.05; aim.normalize();
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10),
              new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 3) }));
            ball.position.copy(from);
            ws.projectiles.push({ mesh: ball, vel: aim.multiplyScalar(20), type: 'energy', dmg: a.baseDmg * botDmgMul, aoe: a.aoe, life: 5, gravity: 0, npc: true, color: 0x3388ff });
            ws.scene.add(ball);
          } else {
            const speed = 32;
            aim.y += 0.5 * 6 * (dist / speed) * (dist / speed) / dist; // 낙차 보정
            aim.x += (Math.random() - 0.5) * 0.04; aim.z += (Math.random() - 0.5) * 0.04; aim.normalize();
            const arrow = makeArrowMesh(0x66ccff);
            arrow.position.copy(from);
            ws.projectiles.push({ mesh: arrow, vel: aim.multiplyScalar(speed), type: 'arrow', dmg: a.baseDmg * botDmgMul, life: 4.5, gravity: 6, npc: true });
            ws.scene.add(arrow);
          }
          this.game.audio.shoot(from.distanceTo(this.game.camera.position));
        }
      }
    });
  }
}
