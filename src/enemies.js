// 적: 고블린·오크·주술사·날개악마·오우거·보스 — 절차 생성 모델 + 단순 AI
import * as THREE from 'three';
import { GATES, WALL_TOP_Y } from './world.js';
import { monStat, MON_GRADES, rollMonGrade, MON_MODIFIERS, MOD_EFFECTS, DIFFICULTIES } from './formulas.js';

export const ENEMY_TYPES = {
  goblin: {
    name: '해골 졸개', hp: 60, speed: 4.6, gold: 2, xp: 4,
    gateDmg: 4, playerDmg: 6, attackRate: 1.2, scale: 0.8, color: 0x3e5a2e, eye: 0xffcc33,
    behavior: 'ground',
    rig: 'minion', anims: { walk: 'Running_A', attack: '1H_Melee_Attack_Chop', death: 'Death_A' },
  },
  orc: {
    name: '해골 전사', hp: 160, speed: 3.3, gold: 6, xp: 10,
    gateDmg: 12, playerDmg: 12, attackRate: 1.6, scale: 1.15, color: 0x4a5a3a, eye: 0xff5533,
    behavior: 'ground',
    rig: 'warrior', anims: { walk: 'Running_B', attack: '2H_Melee_Attack_Chop', death: 'Death_B' },
  },
  shaman: {
    name: '해골 주술사', hp: 90, speed: 3.0, gold: 8, xp: 12,
    playerDmg: 9, attackRate: 2.4, scale: 0.9, color: 0x5a3a5a, eye: 0xcc66ff,
    behavior: 'ranged', range: 42,
    rig: 'mage', anims: { walk: 'Walking_D_Skeletons', attack: 'Spellcast_Shoot', death: 'Death_A' },
  },
  flyer: {
    name: '날개 악마', hp: 80, speed: 5.5, gold: 8, xp: 12,
    playerDmg: 12, gateDmg: 8, attackRate: 1.8, scale: 0.9, color: 0x3a2530, eye: 0xff3333,
    behavior: 'flyer', // 절차 생성 모델 유지 (팩에 비행 몬스터 없음)
  },
  ogre: {
    name: '해골 거병', hp: 500, speed: 2.1, gold: 15, xp: 28,
    gateDmg: 40, playerDmg: 26, attackRate: 2.5, scale: 1.9, color: 0x6a5a40, eye: 0xffaa22,
    behavior: 'ground',
    rig: 'warrior', tint: 0x9a8878,
    anims: { walk: 'Walking_D_Skeletons', attack: '2H_Melee_Attack_Chop', death: 'Death_B' },
  },
  archer_skel: {
    name: '해골 궁수', hp: 75, speed: 3.2, gold: 7, xp: 11,
    gateDmg: 4, playerDmg: 11, attackRate: 2.0, scale: 0.95, color: 0x4a4030, eye: 0x66ddaa,
    behavior: 'ranged', range: 48,
    rig: 'rogue', anims: { walk: 'Running_A', attack: '1H_Ranged_Shoot', death: 'Death_A' },
  },
  boss: {
    name: '공성 거인', hp: 1800, speed: 1.8, gold: 80, xp: 150,
    gateDmg: 110, attackRate: 3.0, playerDmg: 22, scale: 3.0, color: 0x4a3a35, eye: 0xff2200,
    behavior: 'boss', range: 50,
    rig: 'warrior', tint: 0xcc7766,
    anims: { walk: 'Walking_D_Skeletons', attack: '2H_Melee_Attack_Chop', death: 'Death_B' },
  },
};

// 적 머리 위 이름표 (희귀 등급만) — 캔버스 텍스트 스프라이트
function makeNameSprite(text, cssColor) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px "Noto Serif KR", serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,0.85)';
  x.strokeText(text, 128, 32);
  x.fillStyle = cssColor;
  x.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(3.2, 0.8, 1);
  return spr;
}

const headGeo = new THREE.BoxGeometry(0.55, 0.5, 0.55);
const bodyGeo = new THREE.BoxGeometry(0.8, 1.1, 0.5);
const armGeo = new THREE.BoxGeometry(0.22, 0.9, 0.22);
const legGeo = new THREE.BoxGeometry(0.26, 0.8, 0.26);
const eyeGeo = new THREE.BoxGeometry(0.1, 0.08, 0.05);
const wingGeo = new THREE.ConeGeometry(0.5, 1.4, 4);

function buildModel(cfg) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.color).multiplyScalar(0.6), roughness: 0.9 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.eye).multiplyScalar(2.6) }); // 블룸으로 안광

  const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 1.25; g.add(body);
  const head = new THREE.Mesh(headGeo, mat); head.position.y = 2.1; g.add(head);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx * 0.14, 2.15, -0.28);
    g.add(eye);
    const arm = new THREE.Mesh(armGeo, darkMat);
    arm.position.set(sx * 0.55, 1.3, 0); arm.name = sx === -1 ? 'armL' : 'armR';
    g.add(arm);
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(sx * 0.22, 0.4, 0); leg.name = sx === -1 ? 'legL' : 'legR';
    g.add(leg);
  }
  if (cfg.behavior === 'flyer') {
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, darkMat);
      wing.position.set(sx * 0.7, 1.7, 0.3);
      wing.rotation.z = sx * Math.PI / 2.4;
      wing.name = sx === -1 ? 'wingL' : 'wingR';
      g.add(wing);
    }
  }
  if (cfg.behavior === 'boss' || cfg.name === '오우거') {
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 1.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a1d10, roughness: 1 }));
    club.position.set(0.75, 1.5, 0); club.rotation.z = -0.5;
    g.add(club);
  }
  g.scale.setScalar(cfg.scale);
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return g;
}

// 씬 레벨 HP 바 — 부모 회전과 무관하게 항상 화면 기준 좌→우 게이지
const BAR_W = 1.36;
function makeBars(scene) {
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1a0808, depthTest: false }));
  barBg.scale.set(1.4, 0.14, 1);
  const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xaa1818, depthTest: false }));
  barFg.scale.set(BAR_W, 0.1, 1);
  barFg.center.set(0, 0.5); // 좌측 끝 고정 — 오른쪽부터 소모
  scene.add(barBg);
  scene.add(barFg);
  return { barBg, barFg };
}

export class EnemyManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.list = [];
    this.projectiles = []; // 적 투사체 {mesh, vel, dmg, life}
    this.kills = 0;
  }

  spawn(typeKey, waveNum, forceGrade) {
    const cfg = ENEMY_TYPES[typeKey];
    // 몬스터 레벨 = 공성 일차 (시트9 지수 스케일링)
    const level = waveNum;
    const base = monStat(level);
    const diff = this.game.difficulty || DIFFICULTIES[0];
    const nightMod = this.game.siege?.modifier;

    // 등급 추첨 (시트10) — '사냥의 밤'이면 상위 등급 가중. 보스는 항상 boss.
    const order = ['trash', 'champion', 'rare', 'miniboss', 'boss'];
    let gkey = forceGrade || (cfg.behavior === 'boss' ? 'boss' : rollMonGrade());
    for (let k = 1; k < (nightMod?.rareBoost || 1) && !forceGrade && cfg.behavior !== 'boss'; k++) {
      const g2 = rollMonGrade();
      if (order.indexOf(g2) > order.indexOf(gkey)) gkey = g2;
    }
    const grade = MON_GRADES[gkey];
    const elite = gkey !== 'trash';

    // 정예 수식어 (시트11) — 등급별 modifiers개
    const mods = [];
    for (let i = 0; i < grade.modifiers; i++) {
      const m = MON_MODIFIERS[(Math.random() * MON_MODIFIERS.length) | 0];
      if (!mods.includes(m)) mods.push(m);
    }
    let modHp = 1, modSpeed = 1, modDmg = 1;
    for (const m of mods) {
      const e = MOD_EFFECTS[m];
      if (e) { if (e.hp) modHp *= e.hp; if (e.speed) modSpeed *= e.speed; if (e.dmg) modDmg *= e.dmg; }
    }

    const jitter = 0.92 + Math.random() * 0.16;
    const hpW = cfg.hp / 50; // 종류 가중치 (베이스 50 기준)
    const maxHpVal = base.hp * hpW * grade.hp * diff.hp * (nightMod?.hp || 1) * modHp * jitter;
    const dmgMult = grade.dmg * diff.dmg * modDmg;
    const goldMult = grade.reward * (1 + (diff.gold || 0)) * (nightMod?.gold || 1);
    const xpMult = grade.reward * (1 + (diff.xp || 0)) * (nightMod?.xp || 1);
    const scaleMult = jitter * (gkey === 'miniboss' ? 1.4 : gkey === 'rare' ? 1.2 : gkey === 'champion' ? 1.08 : 1);
    const tint = cfg.tint; // 몸체 색은 원래대로 (등급은 HP바/이름표로만 표현)
    const speedMul = modSpeed * (nightMod?.speed || 1);
    const displayName = elite ? `${mods.length ? mods.join(' ') + ' ' : grade.name + ' '}${cfg.name}` : cfg.name;

    // 리깅 캐릭터(해골) 또는 절차 생성 모델(비행 악마)
    let group, mixer = null, actions = null;
    const assets = this.game.assets;
    if (cfg.rig && assets?.templates[cfg.rig]) {
      const ch = assets.spawnCharacter(cfg.rig, tint);
      group = ch.root;
      group.scale.setScalar(cfg.scale);
      mixer = ch.mixer;
      actions = {
        walk: ch.action(cfg.anims.walk),
        attack: ch.action(cfg.anims.attack, true),
        death: ch.action(cfg.anims.death, true),
      };
      actions.walk?.play();
    } else {
      group = buildModel(cfg);
    }
    group.scale.multiplyScalar(scaleMult);
    // 성능: 적은 그림자 캐스팅 제외 (다수의 스킨드 메시가 그림자 패스를 두 배로 만든다)
    group.traverse((c) => { if (c.isMesh || c.isSkinnedMesh) c.castShadow = false; });
    const { barBg, barFg } = makeBars(this.scene);
    const isRare = gkey === 'miniboss' || gkey === 'boss'; // 발생확률 1% 미만만 특수 표시
    barFg.material.color.setHex(isRare ? grade.bar : 0xaa1818);
    let nameSprite = null;
    if (isRare) {
      nameSprite = makeNameSprite(displayName, grade.label);
      this.scene.add(nameSprite);
    }
    // 4방향 공성: 방향 선택 (대공세 중에는 공세 방향으로 70% 집중)
    let dirIdx = (Math.random() * 4) | 0;
    const surge = this.game.siege?.surge;
    if (surge && surge.dirIdx !== undefined && Math.random() < 0.7) dirIdx = surge.dirIdx;
    const along = (Math.random() - 0.5) * 170;
    const dist = 120 + Math.random() * 70;
    const gy = cfg.behavior === 'flyer' ? 10 + Math.random() * 4 : 0;
    if (dirIdx === 0) group.position.set(along, gy, -dist);             // 북
    else if (dirIdx === 1) group.position.set(along, gy, 108 + dist);   // 남
    else if (dirIdx === 2) group.position.set(-54 - dist, gy, 54 + along * 0.55); // 서
    else group.position.set(54 + dist, gy, 54 + along * 0.55);          // 동
    this.scene.add(group);
    const e = {
      type: typeKey, cfg,
      mesh: group, barFg, barBg,
      barH: (cfg.rig ? 2.35 : 2.85) * cfg.scale * scaleMult, // 머리 위 바 높이 (월드 단위)
      targetGate: GATES[dirIdx], faceIdx: dirIdx,
      mixer, actions,
      level, grade, gradeKey: gkey, elite, gradeBar: grade.bar, name: displayName, nameSprite,
      baseGold: base.gold, baseXp: base.xp,
      hp: maxHpVal, maxHp: maxHpVal,
      goldMult, xpMult, dmgMult,
      speed: cfg.speed * (0.92 + Math.random() * 0.16) * speedMul,
      attackTimer: 0,
      slowUntil: 0,
      dead: false, sinkTimer: 0,
      animSeed: Math.random() * 10,
      radius: 1.1 * cfg.scale * scaleMult,
    };
    this.list.push(e);
    return e;
  }

  get aliveCount() { return this.list.filter((e) => !e.dead).length; }

  damage(e, amount, hitPos, pop = false) {
    if (e.dead) return;
    e.hp -= amount;
    if (pop) e.playerHit = true; // 플레이어가 공격한 적만 XP 지급
    const pos = hitPos || e.mesh.position.clone().add(new THREE.Vector3(0, 1.4 * e.cfg.scale, 0));
    this.game.effects.blood(pos, Math.min(20, 6 + amount / 8), 1);
    if (pop) this.game.ui.popDamage(pos, amount, pop === 'crit');
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    e.dead = true;
    e.sinkTimer = e.actions ? 3.4 : 2.2; // 사망 애니메이션 재생 시간 확보
    if (e.actions) {
      e.actions.walk?.stop();
      e.actions.attack?.stop();
      e.actions.death?.reset().play();
    }
    this.kills++;
    // 콤보: 처치를 이을수록 배수 상승 (최대 +150% at 50콤보)
    const g = this.game;
    g.combo++;
    g.comboTimer = 3.5;
    if (g.combo > g.bestCombo) g.bestCombo = g.combo;
    const comboMult = 1 + Math.min(g.combo, 50) * 0.03;
    // 보상: 골드는 항상, XP는 플레이어가 공격한 대상에만 지급
    g.gold += (e.baseGold || 5) * (e.goldMult || 1) * comboMult;
    if (e.playerHit) g.progression.addXp(Math.round((e.baseXp || 10) * (e.xpMult || 1) * comboMult));
    this.game.audio.death(
      e.mesh.position.distanceTo(this.game.camera.position), e.cfg.scale
    );
    this.game.effects.blood(
      e.mesh.position.clone().add(new THREE.Vector3(0, 1.2 * e.cfg.scale, 0)),
      26, 1.4
    );
    this.game.effects.bloodSplat(e.mesh.position);
    e.barFg.visible = false;
    e.barBg.visible = false;
    if (e.nameSprite) e.nameSprite.visible = false;
  }

  // 플레이어가 현재 있는 성벽 면 (0북 1남 2서 3동) — 성 중심 (0,54)
  playerFace() {
    const p = this.game.player.position;
    if (p.z < 27) return 0;
    if (p.z > 81) return 1;
    if (p.x < -27) return 2;
    return 3;
  }

  update(dt, t) {
    const player = this.game.player;
    const world = this.game.world;
    const now = t;
    const pFace = this.playerFace();
    // 화면 우측 방향 (HP 바 좌측 앵커 계산용, 프레임당 1회)
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.game.camera.quaternion);
    camRight.y = 0;
    if (camRight.lengthSq() < 1e-6) camRight.set(1, 0, 0); else camRight.normalize();

    // 몬스터 울음소리 — 무작위 개체가 간헐적으로 으르렁거림
    this.growlTimer = (this.growlTimer ?? 2) - dt;
    if (this.growlTimer <= 0) {
      this.growlTimer = 1.2 + Math.random() * 2.4;
      const alive = this.list.filter((en) => !en.dead);
      if (alive.length > 0) {
        const en = alive[(Math.random() * alive.length) | 0];
        this.game.audio.growl(
          en.mesh.position.distanceTo(this.game.camera.position),
          en.cfg.scale > 1.6
        );
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];

      // 사망: 쓰러지고 가라앉은 뒤 제거
      if (e.dead) {
        e.sinkTimer -= dt;
        if (e.actions) {
          e.mixer.update(dt); // 사망 애니메이션 재생
        } else {
          e.mesh.rotation.x = Math.min(Math.PI / 2, e.mesh.rotation.x + dt * 4);
        }
        if (e.sinkTimer < 1) e.mesh.position.y -= dt * 1.2;
        if (e.sinkTimer <= 0) {
          this.scene.remove(e.mesh);
          this.scene.remove(e.barBg);
          this.scene.remove(e.barFg);
          if (e.nameSprite) this.scene.remove(e.nameSprite);
          this.list.splice(i, 1);
        }
        continue;
      }

      const slowed = now < e.slowUntil;
      const speed = e.speed * (slowed ? 0.45 : 1);
      const pos = e.mesh.position;
      e.attackTimer -= dt;

      // 지속 피해 (독·출혈) — 0.5초마다 틱
      if (e.dot && now < e.dot.until) {
        e.dotTick = (e.dotTick ?? 0) - dt;
        if (e.dotTick <= 0) {
          e.dotTick = 0.5;
          this.damage(e, e.dot.dps * 0.5, null, true);
          if (e.dead) continue;
        }
      }
      // 애니메이션 믹서 — 성능: 먼 적은 누적 dt로 묶어서 갱신(CPU 본 행렬 계산 절감)
      if (e.mixer) {
        const dCam = pos.distanceTo(this.game.camera.position);
        const scaled = dt * (slowed ? 0.45 : 1);
        if (dCam < 45) {
          e.mixer.update(scaled); // 가까운 적: 매 프레임
        } else {
          e._mixAcc = (e._mixAcc || 0) + scaled;
          const step = dCam > 90 ? 0.12 : 0.06; // 멀수록 더 띄엄띄엄(8~16fps)
          if (e._mixAcc >= step) { e.mixer.update(e._mixAcc); e._mixAcc = 0; }
        }
      }

      // 빙결 시각화 — 상태가 바뀔 때만 재질 갱신 (물량전 최적화)
      if (slowed !== e.slowedVisual) {
        e.slowedVisual = slowed;
        e.mesh.traverse((c) => {
          if (c.isMesh && c.material.emissive !== undefined) {
            c.material.emissive.setHex(slowed ? 0x224466 : 0x000000);
          }
        });
      }

      if (e.cfg.behavior === 'ground' || e.cfg.behavior === 'boss') {
        // 출성한 플레이어가 가까우면 침입자 우선 (어그로 13m)
        const onGround = player.mode === 'ground' && !player.dead;
        const dP = onGround
          ? Math.hypot(player.position.x - pos.x, player.position.z - pos.z)
          : Infinity;
        if (dP < 13) {
          if (dP > 2.4) {
            const dirx = (player.position.x - pos.x) / dP;
            const dirz = (player.position.z - pos.z) / dP;
            pos.x += dirx * speed * dt;
            pos.z += dirz * speed * dt;
            e.mesh.rotation.y = Math.atan2(dirx, dirz);
            this._walkAnim(e, t);
            if (e.atkMode) { e.atkMode = false; e.actions?.walk?.reset().play(); }
          } else if (e.attackTimer <= 0) {
            e.attackTimer = e.cfg.attackRate;
            if (!e.atkMode) { e.atkMode = true; e.actions?.walk?.stop(); }
            e.actions?.attack?.reset().play();
            player.takeDamage((e.cfg.playerDmg || 8) * e.dmgMult, this.game.ui, e.mesh.position);
            this.game.effects.blood(player.position.clone().add(new THREE.Vector3(0, -0.4, 0)), 6, 0.6);
          }
        } else {
          // 배정된 방향의 성문으로 진군
          const target = e.targetGate;
          const dx = target.x - pos.x, dz = target.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 4.5) {
            pos.x += (dx / dist) * speed * dt;
            pos.z += (dz / dist) * speed * dt;
            e.mesh.rotation.y = Math.atan2(dx, dz);
            this._walkAnim(e, t);
            if (e.atkMode) { e.atkMode = false; e.actions?.walk?.reset().play(); }
          } else if (e.attackTimer <= 0) {
            // 성문 강타
            e.attackTimer = e.cfg.attackRate;
            if (!e.atkMode) { e.atkMode = true; e.actions?.walk?.stop(); }
            e.actions?.attack?.reset().play();
            world.gate.hp = Math.max(0, world.gate.hp - e.cfg.gateDmg * e.dmgMult);
            this.game.effects.spark(e.targetGate.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), 0xcc9944, 6);
            this.game.audio.gateHit(this.game.camera.position.distanceTo(e.targetGate));
          }
          // 보스는 플레이어가 사거리 안일 때만 바위 투척
          if (e.cfg.behavior === 'boss' && Math.random() < dt * 0.25
            && pos.distanceTo(player.position) < (e.cfg.range || 50)) {
            this._throwRock(e, player, 1.6);
          }
        }
      } else if (e.cfg.behavior === 'ranged') {
        // 우선순위: 같은 면 플레이어(성벽 위) > 같은 면 NPC > 성문
        // 플레이어가 다른 성벽에 있으면 절대 공격하지 않는다 (버그 수정)
        const sameFacePlayer = (player.mode === 'wall') && (pFace === e.faceIdx);
        const dP = player.position.distanceTo(pos);
        let aimTarget = null; // {pos, kind:'player'|'npc', npc}
        if (sameFacePlayer && dP < e.cfg.range) {
          aimTarget = { pos: player.position.clone(), kind: 'player' };
        } else {
          const npc = this.game.npcs.nearestDefender(pos, e.cfg.range, e.faceIdx);
          if (npc) aimTarget = { pos: npc.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), kind: 'npc', npc };
        }
        if (aimTarget) {
          const d = aimTarget.pos.clone().sub(pos);
          e.mesh.rotation.y = Math.atan2(d.x, d.z);
          if (!e.atkMode) { e.atkMode = true; e.actions?.walk?.stop(); }
          if (e.attackTimer <= 0) {
            e.attackTimer = e.cfg.attackRate;
            e.actions?.attack?.reset().play();
            this._throwRock(e, aimTarget, 1.0);
          }
        } else {
          // 성문 진군·포격
          const target = e.targetGate;
          const dx = target.x - pos.x, dz = target.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 16) {
            pos.x += (dx / dist) * speed * dt;
            pos.z += (dz / dist) * speed * dt;
            e.mesh.rotation.y = Math.atan2(dx, dz);
            this._walkAnim(e, t);
            if (e.atkMode) { e.atkMode = false; e.actions?.walk?.reset().play(); }
          } else if (e.attackTimer <= 0) {
            e.attackTimer = e.cfg.attackRate;
            if (!e.atkMode) { e.atkMode = true; e.actions?.walk?.stop(); }
            e.actions?.attack?.reset().play();
            world.gate.hp = Math.max(0, world.gate.hp - 5 * e.dmgMult);
            this.game.effects.spark(e.targetGate.clone(), 0xcc66ff, 5);
          }
        }
      } else if (e.cfg.behavior === 'flyer') {
        // 플레이어가 있는 면(faceIdx==pFace)의 비행 유닛만 플레이어 추적, 나머지는 성문 공격.
        // 플레이어가 다른 성벽으로 이동하면 pFace가 바뀌어 담당 비행 유닛이 자동 전환된다.
        const engaged = e.faceIdx === pFace;
        // 요새 footprint 안(안마당 상공)인지 — 밖이면 성벽보다 높게 날아 벽을 넘는다(통과 버그 방지)
        const insideFoot = Math.abs(pos.x) < 53 && pos.z > 1 && pos.z < 107;
        const bob = Math.sin(t * 3 + e.animSeed) * 0.4;
        if (engaged) {
          const tx = player.position.x, tz = player.position.z;
          const dx = tx - pos.x, dz = tz - pos.z;
          const hd = Math.hypot(dx, dz);
          if (hd > 2.0) {
            pos.x += (dx / hd) * speed * dt;
            pos.z += (dz / hd) * speed * dt;
            e.mesh.rotation.y = Math.atan2(dx, dz);
          } else if (e.attackTimer <= 0) {
            e.attackTimer = e.cfg.attackRate;
            player.takeDamage((e.cfg.playerDmg || 10) * e.dmgMult, this.game.ui, e.mesh.position);
            this.game.effects.blood(player.position.clone().add(new THREE.Vector3(0, -0.3, 0)), 6, 0.6);
          }
          // 고도: 플레이어가 성 안에 있고 비행 유닛이 아직 성 밖이면 성벽 위로 넘어온다(벽 통과 방지)
          let ty = player.position.y + 0.8 + bob;
          if (player.mode !== 'ground' && !insideFoot && hd > 3) ty = Math.max(ty, WALL_TOP_Y + 2.5);
          pos.y += (ty - pos.y) * Math.min(1, dt * 2.5);
        } else {
          // 성문 공격 (플레이어 면이 아닌 비행 유닛)
          const g = e.targetGate;
          const dx = g.x - pos.x, dz = g.z - pos.z;
          const hd = Math.hypot(dx, dz);
          if (hd > 4) {
            pos.x += (dx / hd) * speed * dt;
            pos.z += (dz / hd) * speed * dt;
            e.mesh.rotation.y = Math.atan2(dx, dz);
            let ty = 6 + bob;
            if (!insideFoot) ty = Math.max(ty, WALL_TOP_Y + 2.5); // 성문으로 가는 길에 벽을 넘음
            pos.y += (ty - pos.y) * Math.min(1, dt * 2.5);
          } else if (e.attackTimer <= 0) {
            e.attackTimer = e.cfg.attackRate;
            world.gate.hp = Math.max(0, world.gate.hp - (e.cfg.gateDmg || 8) * e.dmgMult);
            this.game.effects.spark(g.clone().add(new THREE.Vector3(0, 1, 0)), 0xff5533, 5);
            this.game.audio.gateHit(this.game.camera.position.distanceTo(g));
          }
        }
        // 날갯짓
        const wl = e.mesh.getObjectByName('wingL'), wr = e.mesh.getObjectByName('wingR');
        if (wl && wr) {
          const flap = Math.sin(t * 14 + e.animSeed) * 0.6;
          wl.rotation.z = Math.PI / 2.4 * -1 + flap;
          wr.rotation.z = Math.PI / 2.4 - flap;
        }
      }

      // HP 바 갱신 — 머리 위 화면 정렬 (좌측 고정, 오른쪽부터 소모)
      const r = Math.max(0, e.hp / e.maxHp);
      e.barBg.position.set(pos.x, pos.y + e.barH, pos.z);
      e.barFg.position.copy(e.barBg.position).addScaledVector(camRight, -1.36 / 2);
      e.barFg.scale.x = Math.max(0.001, 1.36 * r);
      const baseBar = (e.gradeKey === 'miniboss' || e.gradeKey === 'boss') ? e.gradeBar : 0xaa1818;
      e.barFg.material.color.setHex(r > 0.3 ? baseBar : 0xff5555);
      // 이름표 — HP바 위에 따라다님
      if (e.nameSprite) e.nameSprite.position.set(pos.x, pos.y + e.barH + 0.5, pos.z);
    }

    // 적 투사체
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.npcTarget) {
        // NPC 표적 투사체
        if (!p.npcTarget.dead && p.mesh.position.distanceTo(p.npcTarget.mesh.position) < 1.6) {
          this.game.npcs.damageNpc(p.npcTarget, p.dmg);
          p.life = 0;
        }
      } else if (p.mesh.position.distanceTo(player.position) < 1.3) {
        player.takeDamage(p.dmg, this.game.ui, p.mesh.position);
        this.game.effects.blood(player.position.clone(), 5, 0.5);
        p.life = 0;
      }
      if (p.mesh.position.y < 0 || p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _walkAnim(e, t) {
    if (e.actions) return; // 리깅 캐릭터는 믹서가 처리
    const sw = Math.sin(t * 8 * (e.cfg.speed / 4) + e.animSeed) * 0.45;
    const al = e.mesh.getObjectByName('armL'), ar = e.mesh.getObjectByName('armR');
    const ll = e.mesh.getObjectByName('legL'), lr = e.mesh.getObjectByName('legR');
    if (al) al.rotation.x = sw;
    if (ar) ar.rotation.x = -sw;
    if (ll) ll.rotation.x = -sw;
    if (lr) lr.rotation.x = sw;
  }

  // target: 플레이어 객체(position) 또는 {pos, npc} (원거리 몬스터 표적)
  _throwRock(e, target, scale) {
    const from = e.mesh.position.clone().add(new THREE.Vector3(0, 2.2 * e.cfg.scale, 0));
    const to = (target.pos || target.position).clone();
    const dir = to.sub(from);
    const dist = dir.length();
    const speed = 22;
    const tof = dist / speed;
    dir.normalize().multiplyScalar(speed);
    dir.y += 0.5 * 9 * tof; // 중력 보정 아크
    const isMagic = e.cfg.behavior === 'ranged' && e.cfg.rig === 'mage';
    const rock = new THREE.Mesh(
      isMagic ? new THREE.SphereGeometry(0.3 * scale, 8, 8) : new THREE.DodecahedronGeometry(0.28 * scale, 0),
      isMagic ? new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 3) })
              : new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 })
    );
    rock.position.copy(from);
    this.scene.add(rock);
    this.projectiles.push({ mesh: rock, vel: dir, dmg: (e.cfg.playerDmg || 10) * (e.dmgMult || 1), life: 4, npcTarget: target.npc || null });
  }
}
