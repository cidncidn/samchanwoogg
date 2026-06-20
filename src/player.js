// 플레이어: 1인칭 — WASD 이동 + 마우스 시점 회전(포인터락) + 화면 가운데 고정 조준.
// 성벽↔안마당은 계단(완만) 또는 가장자리에서 직접 낙하(높으면 낙하 피해). 성 밖은 출성(밧줄).
import * as THREE from 'three';
import { WALL_TOP_Y, WALK } from './world.js';

const EYE = 1.7;
const LOOK_SENS = 0.0022;   // 마우스 시점 감도 (rad/px)
const GRAVITY = 18;         // 중력 가속도
const JUMP_V = 6.0;         // 점프 초기 속도
const FALL_DMG_DROP = 6;    // 이 높이(월드 단위) 이상 낙하 시 낙하 피해
const FOOT = { x: 57.5, zMin: -4.5, zMax: 112.5 }; // 요새 footprint(성벽 밴드) — 성 밖에선 진입 불가

// ── [백업] 자유 커서 조준 + edge-pan 회전 방식 (현재는 1인칭 가운데 조준 사용) ──
// 되돌리려면: 아래 상수와 update()의 '커서 회전' 블록·mousemove의 '커서 조준' 블록 주석을 해제하고,
// 마우스룩(pointerlock) 블록을 주석 처리한다.
// const DEADZONE = 0.18;   // 화면 중앙 정밀 조준 구간(반경 비율)
// const TURN_YAW = 3.0;    // 좌우 회전 최대 속도 (rad/s)
// const TURN_PITCH = 1.7;  // 상하 회전 최대 속도

export class Player {
  constructor(camera, domElement, game) {
    this.camera = camera;
    this.game = game;
    this.dom = domElement;

    this.yaw = 0;          // 0 = 북(-z) 바라봄
    this.pitch = -0.12;    // 살짝 아래로 — 전장이 보이게 (음수 pitch = 아래)
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    camera.position.set(2, WALL_TOP_Y + EYE, 0.5);

    this.place = 'wall';   // 현재 장소 상태(접지 기준): 'wall' / 'courtyard' / 'ground'
    this.mode = 'wall';    // enemies/weapons 호환 ('wall'/'courtyard'/'ground')
    this.level = 'top';    // 'top'(성벽) / 'floor'(안마당) — 호환용
    this.hp = 100; this.maxHp = 100;
    this.mana = 60; this.maxMana = 60;
    this.manaRegen = 5;
    this.hpRegen = 1.5;
    this.speed = 7;
    this.sprintMult = 1.6;
    this.dead = false;
    this.lastHitTime = -99;

    this.lookSens = LOOK_SENS; // 마우스 감도 (설정에서 조절)
    // 수직 물리 (중력·점프·낙하)
    this.vy = 0; this.airborne = false; this.fallPeakY = 0;
    this._lastX = 2; this._lastZ = 0.5; // 낙하 중 벽 충돌 복원용 직전 안전 위치

    // 조준 — 화면 가운데 고정 (커서 NDC는 0,0)
    this.mx = 0; this.my = 0;
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.aimPoint = new THREE.Vector3();
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this.crosshair = document.getElementById('crosshair');

    this.keys = {};
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.airborne && !this.dead) this.vy = JUMP_V; // 점프
      }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // ── 마우스룩 (포인터락 시 마우스 이동량으로 시점 회전) ──
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement && this.game.state === 'playing') {
        this.yaw -= e.movementX * this.lookSens;     // 오른쪽 이동 → 우회전
        this.pitch -= e.movementY * this.lookSens;   // 아래 이동 → 아래를 봄 (양수 pitch=위)
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.1, 1.0);
      }
      // ── [백업] 자유 커서 조준 방식 — 되돌리려면 주석 해제 ──
      // this.cx = e.clientX; this.cy = e.clientY;
      // this.mx = (e.clientX / innerWidth) * 2 - 1;
      // this.my = -((e.clientY / innerHeight) * 2 - 1);
      // if (this.crosshair) { this.crosshair.style.left = e.clientX + 'px'; this.crosshair.style.top = e.clientY + 'px'; }
    });

    this._vel = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  get position() { return this.camera.position; }

  // 조준 방향(레이) — weapons/skills 공용. 현재: 화면 가운데(NDC 0,0) 고정.
  updateAim() {
    this._ndc.set(this.mx, this.my); // mx=my=0 → 화면 중앙
    this._ray.setFromCamera(this._ndc, this.camera);
    this.aimDir.copy(this._ray.ray.direction);
    const o = this._ray.ray.origin, d = this._ray.ray.direction;
    if (d.y < -0.001) {
      const t = Math.min(-o.y / d.y, 240);
      this.aimPoint.copy(o).addScaledVector(d, t);
    } else {
      this.aimPoint.copy(o).addScaledVector(d, 60);
    }
    this.aimPoint.y = 0;
  }

  update(dt) {
    if (this.dead) return;

    // ── [백업] 자유 커서 조준 회전(edge-pan) — 되돌리려면 주석 해제 ──
    // const turn = (v) => { const a = Math.abs(v); if (a <= DEADZONE) return 0;
    //   const s = (a - DEADZONE) / (1 - DEADZONE); return Math.sign(v) * s * s; };
    // this.yaw -= TURN_YAW * turn(this.mx) * dt;
    // this.pitch += TURN_PITCH * turn(this.my) * dt;
    // this.pitch = THREE.MathUtils.clamp(this.pitch, -1.1, 1.0);

    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // ── 이동 (yaw 기준 수평) ──
    const fwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const right = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    if (fwd || right) {
      const sp = this.speed * (this.keys['ShiftLeft'] ? this.sprintMult : 1);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);     // 전방(xz)
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);      // 우측(xz)
      this._vel.set(fx * fwd + rx * right, 0, fz * fwd + rz * right);
      if (this._vel.lengthSq() > 0) this._vel.normalize().multiplyScalar(sp * dt);
      this.camera.position.add(this._vel);
      this.moving = true;
    } else { this.moving = false; }

    // ── 높이/충돌/중력 해소 ──
    this._move(dt);

    // 조준 갱신
    this.updateAim();

    // 재생
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);
    this.hp = Math.min(this.maxHp, this.hp + this.hpRegen * dt);
  }

  // (x,z) 위치의 지형 구역 — 높이 h(월드)와 장소(place)
  //  wall(성벽 위 10) / courtyard(안마당 0) / ground(성 밖 0) / stair(램프)
  _region(x, z) {
    const st = this._stairAt(x, z);
    if (st) {
      const val = st.axis === 'z' ? z : x;
      const t = THREE.MathUtils.clamp((val - st.lo) / (st.hi - st.lo), 0, 1); // 0=안마당 .. 1=성벽
      return { h: t * WALL_TOP_Y, place: t > 0.5 ? 'wall' : 'courtyard', stair: true };
    }
    if (Math.abs(x) < WALK.xIn && z > WALK.zInMin && z < WALK.zInMax) return { h: 0, place: 'courtyard' };
    if (Math.abs(x) < FOOT.x && z > FOOT.zMin && z < FOOT.zMax) return { h: WALL_TOP_Y, place: 'wall' };
    return { h: 0, place: 'ground' }; // 성 밖 지면
  }

  // 통합 이동: 장소 상태(this.place) 기반 — 안마당/성밖에선 성벽으로 못 올라가고(climb 버그 방지),
  // 성벽 위에선 안쪽 가장자리=안마당으로, 바깥 가장자리=성 밖으로 낙하한다.
  _move(dt) {
    const c = this.camera.position;
    c.x = THREE.MathUtils.clamp(c.x, -380, 380);
    c.z = THREE.MathUtils.clamp(c.z, -380, 380);
    this._keepCollide(c);

    if (!this.airborne) {
      // 접지 상태별 수평 제약 (계단 위면 제약 없이 램프를 따라 이동)
      const onStair = !!this._stairAt(c.x, c.z);
      if (!onStair) {
        if (this.place === 'courtyard') this._courtyardClamp(c);   // 성벽 밴드 진입 불가
        else if (this.place === 'ground') this._groundClamp(c);    // 요새 footprint 진입 불가
        // place==='wall'은 자유 (가장자리에서 떨어질 수 있음)
      }
      const reg = this._region(c.x, c.z);
      const sup = reg.h + EYE;
      if (this.vy > 0) {                       // 점프 시작
        this.airborne = true; this.fallPeakY = c.y;
      } else if (c.y > sup + 0.3 && reg.place !== this.place) { // 가장자리에서 벗어남 → 낙하
        this.airborne = true; this.fallPeakY = c.y;
      } else {                                  // 접지 유지
        // 안마당/성밖 → 성벽 위 전환은 계단으로만 (경계 아티팩트로 기어오르기 방지)
        let np = reg.place;
        if (np === 'wall' && this.place !== 'wall' && !this._stairAt(c.x, c.z)) np = this.place;
        const supY = (reg.stair ? reg.h : (np === 'wall' ? WALL_TOP_Y : 0)) + EYE;
        c.y = supY; this.vy = 0; this._setPlace(np);
      }
    }

    if (this.airborne) {
      let reg = this._region(c.x, c.z);
      let sup = reg.h + EYE;
      // 낙하 중 성벽 옆면(상단이 머리 위)으로 파고들면 수평 충돌 — 직전 위치로 되돌림.
      // (벽 옆을 비비며 '성벽 상단'으로 착지해 기어오르던 버그 방지)
      if (reg.place === 'wall' && sup > c.y + 0.3 && !this._stairAt(c.x, c.z)) {
        c.x = this._lastX; c.z = this._lastZ;
        this._keepCollide(c);
        reg = this._region(c.x, c.z); sup = reg.h + EYE;
      }
      this.vy -= GRAVITY * dt;
      const ny = c.y + this.vy * dt;
      if (ny <= sup && this.vy <= 0) {          // 착지
        const drop = this.fallPeakY - sup;
        if (drop > FALL_DMG_DROP) {
          this.hp = Math.max(1, this.hp * 0.5);
          this.lastHitTime = performance.now() / 1000;
          this.game.ui?.flashDamage();
          this.game.ui?.banner('낙하 충격! — 현재 HP의 절반 손실', '#cc5533');
        }
        c.y = sup; this.vy = 0; this.airborne = false; this._setPlace(reg.place);
      } else {
        this.fallPeakY = Math.max(this.fallPeakY, ny);
        c.y = ny;
      }
    }

    // 다음 프레임 수평 충돌 복원용 — 안전한(벽 옆면 아닌) 위치 기록
    {
      const r = this._region(c.x, c.z);
      if (!(r.place === 'wall' && r.h + EYE > c.y + 0.3)) { this._lastX = c.x; this._lastZ = c.z; }
    }
  }

  _setPlace(place) {
    this.place = place;
    this.mode = place; // enemies/weapons는 'wall'/'courtyard'/'ground'를 읽음
    this.level = place === 'wall' ? 'top' : 'floor';
  }

  _stairAt(x, z) {
    for (const st of this.game.world.stairs) {
      const f = st.foot;
      if (x >= f.xmin && x <= f.xmax && z >= f.zmin && z <= f.zmax) return st;
    }
    return null;
  }

  // 천수각 충돌 (중심 0,54 반폭11·반깊이8 — 전 높이 차단)
  _keepCollide(c) {
    let px = c.x, pz = c.z;
    if (Math.abs(px) < 11 && pz > 46 && pz < 62) {
      const dxL = px + 11, dxR = 11 - px, dzN = pz - 46, dzS = 62 - pz;
      const m = Math.min(dxL, dxR, dzN, dzS);
      if (m === dxL) px = -11; else if (m === dxR) px = 11;
      else if (m === dzN) pz = 46; else pz = 62;
      c.x = px; c.z = pz;
    }
  }

  // 안마당: 안쪽 사각형 안으로만 (성벽 밴드로 못 나감 → 성벽으로 기어오르는 버그 방지)
  _courtyardClamp(c) {
    c.x = THREE.MathUtils.clamp(c.x, -WALK.xIn, WALK.xIn);
    c.z = THREE.MathUtils.clamp(c.z, WALK.zInMin, WALK.zInMax);
  }

  // 성 밖: 요새 footprint 안으로 못 들어감 (밀어냄)
  _groundClamp(c) {
    let px = c.x, pz = c.z;
    if (Math.abs(px) < FOOT.x && pz > FOOT.zMin && pz < FOOT.zMax) {
      const dxL = px + FOOT.x, dxR = FOOT.x - px, dzN = pz - FOOT.zMin, dzS = FOOT.zMax - pz;
      const m = Math.min(dxL, dxR, dzN, dzS);
      if (m === dxL) px = -FOOT.x; else if (m === dxR) px = FOOT.x;
      else if (m === dzN) pz = FOOT.zMin; else pz = FOOT.zMax;
      c.x = px; c.z = pz;
    }
  }

  takeDamage(amount, ui, fromPos) {
    if (this.dead) return;
    const dr = this.game?.progression?.damageReduction || 0; // 전사 인내(CON) 피해 감소
    this.hp -= amount * (1 - dr);
    this.lastHitTime = performance.now() / 1000;
    ui?.flashDamage();
    // 피격 방향 표시 — 카메라 정면 기준 공격자 상대 방위
    if (fromPos && ui) {
      const dx = fromPos.x - this.camera.position.x, dz = fromPos.z - this.camera.position.z;
      const relF = dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw); // 정면 성분
      const relR = dx * Math.cos(this.yaw) + dz * -Math.sin(this.yaw);  // 우측 성분
      ui.showHitDir(Math.atan2(relR, relF) * 180 / Math.PI);
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  spendMana(amount) {
    if (this.mana < amount) return false;
    this.mana -= amount;
    return true;
  }
}
