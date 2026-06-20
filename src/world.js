// 월드: 밤의 변경 성채 — 성벽, 성문, 탑, 횃불, 안개 낀 황야
// v2: 성 규모 4배(선형 2배) + 성 내부(안마당) 직업 사범·보급·고용 스테이션
import * as THREE from 'three';
import { stoneTexture, woodTexture, groundTexture } from './textures.js';

export const WALL_TOP_Y = 10; // 성벽 상단 높이

// ── 요새 지오메트리 단일 소스 (다른 모듈이 import해 일관성 유지) ──
// 동/서 벽 x=±54, 북 벽 z=0, 남 벽 z=108, 안마당 중심 (0,54). (기존 대비 면적 4배)
export const FORT = {
  half: 54,      // 동·서 벽 중심 |x|
  zN: 0,         // 북 벽 중심 z
  zS: 108,       // 남 벽 중심 z
  cx: 0, cz: 54, // 안마당 중심
  wallTop: WALL_TOP_Y,
  keep: { x: 0, z: 54, hw: 11, hd: 8, h: 16 }, // 천수각 (반폭/반깊이)
};

// 4면 정사각 요새 외곽 일주 통로 한계
export const WALK = {
  xOut: 55.55, zMin: -1.55, zMax: 109.55, // 외곽 한계
  xIn: 52.45, zInMin: 1.55, zInMax: 106.45, // 안마당(통로 사이 빈 구역)
};

// 4방향 성문 위치 (적 진군 목표) — 내구도는 하나로 공유
export const GATES = [
  new THREE.Vector3(0, 2, -3.0),    // 북
  new THREE.Vector3(0, 2, 111.0),   // 남
  new THREE.Vector3(-57.0, 2, 54),  // 서
  new THREE.Vector3(57.0, 2, 54),   // 동
];
export const GATE_POS = GATES[0]; // 레거시 호환 (북문)

const stoneT = stoneTexture(6, 2);
const stoneTowerT = stoneTexture(4, 5, 40);
const woodT = woodTexture(1.5, 1);
const woodRoofT = woodTexture(2, 2);
const groundT = groundTexture(50, 50);

const MAT = {
  stone: new THREE.MeshStandardMaterial({
    map: stoneT.map, bumpMap: stoneT.bump, bumpScale: 3,
    color: 0x8a847c, roughness: 0.95,
  }),
  stoneD: new THREE.MeshStandardMaterial({
    map: stoneTowerT.map, bumpMap: stoneTowerT.bump, bumpScale: 3,
    color: 0xb0a89e, roughness: 0.95,
  }),
  wood: new THREE.MeshStandardMaterial({
    map: woodRoofT.map, bumpMap: woodRoofT.bump, bumpScale: 2, roughness: 0.9,
  }),
  iron:   new THREE.MeshStandardMaterial({ color: 0x252528, roughness: 0.6, metalness: 0.7 }),
  ground: new THREE.MeshStandardMaterial({
    map: groundT.map, bumpMap: groundT.bump, bumpScale: 1.5, roughness: 1.0,
  }),
  dirt:   new THREE.MeshStandardMaterial({ color: 0x4a4232, roughness: 1.0, transparent: true, opacity: 0.85 }),
};

// 에셋 로드 완료 후 성벽·안마당 소품 배치 (main에서 호출)
export function decorateWorld(scene, assets) {
  const place = (key, x, y, z, rotY = 0, s = 1.4) => {
    const p = assets.getProp(key);
    p.position.set(x, y, z);
    p.rotation.y = rotY;
    p.scale.setScalar(s);
    scene.add(p);
  };
  // 붉은 깃발 — 북벽 안쪽 면(안마당 방향)에 걸린 군기
  for (const x of [-36, -12, 12, 36]) {
    place('banner', x, WALL_TOP_Y - 1.4, 2.3, 0, 0.9);
  }
  // 통로 위 물자: 통·궤짝 (탑 부근)
  place('barrel', -51, WALL_TOP_Y, 1.0, 0.4);
  place('crates', 50, WALL_TOP_Y, 0.9, -0.3, 1.2);
  place('chest', 47, WALL_TOP_Y, -0.8, 2.6, 1.1);
  // 안마당 보급품 더미 (천수각 앞)
  place('box', -16, 0, 38, 0.7, 1.8);
  place('barrel', -12, 0, 40, 1.9, 1.6);
  place('crates', 14, 0, 38, -0.5, 1.7);
  place('barrel', 18, 0, 41, 0, 1.6);
}

// ── 성 내부/통로 NPC 부스 빌더 (보급·고용·직업 사범) ──
function mkBooth(opts) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: opts.cloth, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a7058, roughness: 0.9 });
  // 가판/책상
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.9), MAT.wood);
  desk.position.y = 0.5; g.add(desk);
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), MAT.wood);
    pole.position.set(sx * 1.1, 1.3, -0.35); g.add(pole);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.4), cloth);
  canopy.position.set(0, 2.6, 0); canopy.rotation.x = 0.16; g.add(canopy);
  // 인물
  const body = new THREE.Mesh(
    opts.robe ? new THREE.ConeGeometry(0.45, 1.4, 7) : new THREE.BoxGeometry(0.7, 1.1, 0.45), cloth);
  body.position.set(0, opts.robe ? 1.4 : 1.25, 0.55); g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.set(0, opts.robe ? 2.2 : 2.05, 0.55); g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, opts.robe ? 0.7 : 0.55, 7), cloth);
  hat.position.set(0, opts.robe ? 2.65 : 2.38, 0.55); g.add(hat);
  // 발광 표식 (직업 색)
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.glow).multiplyScalar(2.2) }));
  orb.position.set(0.55, 1.25, 0); g.add(orb);
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  g.position.copy(opts.pos);
  if (opts.rotY !== undefined) g.rotation.y = opts.rotY;
  return g;
}

export function buildWorld(scene) {
  // --- 분위기: 짙은 밤안개, 차가운 달빛 ---
  scene.background = new THREE.Color(0x07080d);
  scene.fog = new THREE.FogExp2(0x07080d, 0.006); // 성이 커졌으므로 안개 살짝 옅게

  const moon = new THREE.DirectionalLight(0x99aacc, 2.2);
  moon.position.set(-60, 130, 60);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024); // 2048→1024 (그림자 패스 비용 대폭 감소)
  moon.shadow.camera.left = -160;
  moon.shadow.camera.right = 160;
  moon.shadow.camera.top = 170;
  moon.shadow.camera.bottom = -200;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 460;
  moon.shadow.bias = -0.0006;
  scene.add(moon);
  scene.add(new THREE.AmbientLight(0x55524c, 2.4));
  scene.add(new THREE.HemisphereLight(0x3a4d77, 0x221a10, 1.3));

  // 달
  const moonBall = new THREE.Mesh(
    new THREE.SphereGeometry(8, 16, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.6, 1.9), fog: false })
  );
  moonBall.position.set(-220, 200, 160);
  scene.add(moonBall);

  // 별하늘 (블룸으로 은은히 빛남)
  {
    const starPts = [];
    for (let i = 0; i < 350; i++) {
      const a = Math.random() * Math.PI * 2;
      const elev = 0.12 + Math.random() * 0.8;
      const r = 550;
      starPts.push(
        Math.cos(a) * Math.cos(elev) * r,
        Math.sin(elev) * r,
        Math.sin(a) * Math.cos(elev) * r
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: new THREE.Color(1.4, 1.4, 1.7), size: 1.6, sizeAttenuation: false, fog: false,
    }));
    scene.add(stars);
  }

  // --- 지형 ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), MAT.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 30);
  ground.receiveShadow = true;
  scene.add(ground);

  // 적 진군로 (흙길) — 북쪽
  const road = new THREE.Mesh(new THREE.PlaneGeometry(20, 280), MAT.dirt);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, -140);
  road.receiveShadow = true;
  scene.add(road);

  // --- 4면 성벽 (정사각 요새, 외곽 일주 통로) ---
  const castle = new THREE.Group();

  // 투사체 충돌용 AABB 장애물 목록
  const colliders = [];
  const addCollider = (cx, cy, cz, hw, hh, hd) => {
    colliders.push({ minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh, minZ: cz - hd, maxZ: cz + hd });
  };

  const mkWall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_TOP_Y, d), MAT.stone);
    m.position.set(x, WALL_TOP_Y / 2, z);
    castle.add(m);
    addCollider(x, WALL_TOP_Y / 2, z, w / 2, WALL_TOP_Y / 2, d / 2);
  };
  mkWall(120, 4, 0, 0);     // 북
  mkWall(120, 4, 0, 108);   // 남
  mkWall(4, 116, -54, 54);  // 서
  mkWall(4, 116, 54, 54);   // 동

  // 성문 4개 — 내구도 공유 (어느 문이 뚫려도 성은 끝)
  const gateMeshes = [];
  for (const gd of [
    { x: 0, z: -2.0, ry: 0 },             // 북
    { x: 0, z: 110.0, ry: 0 },            // 남
    { x: -56.0, z: 54, ry: Math.PI / 2 }, // 서
    { x: 56.0, z: 54, ry: Math.PI / 2 },  // 동
  ]) {
    const gm = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 1.2), new THREE.MeshStandardMaterial({
      map: woodT.map, bumpMap: woodT.bump, bumpScale: 2.5, roughness: 0.9,
    }));
    gm.position.set(gd.x, 4.0, gd.z);
    gm.rotation.y = gd.ry;
    castle.add(gm);
    gateMeshes.push(gm);
  }
  // 북문(정문) 철창 장식
  for (let i = -4; i <= 4; i += 1.5) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 8, 0.3), MAT.iron);
    bar.position.set(i, 4.0, -2.9);
    castle.add(bar);
  }

  // 총안 — 4면 외곽 가장자리 (가슴 높이, 사격 틈 확보)
  const mkMerlon = (x, z, rot) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.7), MAT.stoneD);
    m.position.set(x, WALL_TOP_Y + 0.5, z);
    m.rotation.y = rot;
    m.userData.noShadow = true; // 112개나 되는 흉벽은 그림자 캐스팅 제외 (그림자 패스 비용↓)
    castle.add(m);
    if (Math.abs(rot) < 0.01) addCollider(x, WALL_TOP_Y + 0.5, z, 0.8, 0.5, 0.35);
    else addCollider(x, WALL_TOP_Y + 0.5, z, 0.35, 0.5, 0.8);
  };
  for (let x = -56; x <= 56; x += 4) { mkMerlon(x, -1.85, 0); mkMerlon(x, 109.85, 0); }
  for (let z = 2; z <= 106; z += 4) { mkMerlon(-55.85, z, Math.PI / 2); mkMerlon(55.85, z, Math.PI / 2); }

  // 모서리 탑 4기 — 통로 바깥 모서리에 배치(통로 일주를 막지 않도록)
  for (const [tx, tz] of [[-56, -2], [56, -2], [-56, 110], [56, 110]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.8, 18, 12), MAT.stoneD);
    tower.position.set(tx, 9, tz);
    castle.add(tower);
    addCollider(tx, 9, tz, 5.1, 9, 5.1); // 탑 충돌 박스 (원통 근사)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 4.5, 12), MAT.wood);
    roof.position.set(tx, 20.5, tz);
    castle.add(roof);
  }

  // 안마당 천수각 (전직·스킬 사범이 둘러앉는 중앙 건물)
  const K = FORT.keep;
  const keep = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 2, K.h, K.hd * 2), MAT.stoneD);
  keep.position.set(K.x, K.h / 2, K.z);
  castle.add(keep);
  addCollider(K.x, K.h / 2, K.z, K.hw, K.h / 2, K.hd);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(K.hw + 2, 7, 4), MAT.wood);
  keepRoof.position.set(K.x, K.h + 3.5, K.z);
  keepRoof.rotation.y = Math.PI / 4;
  castle.add(keepRoof);

  castle.traverse((c) => {
    if (c.isMesh) { c.castShadow = !c.userData.noShadow; c.receiveShadow = true; }
  });
  scene.add(castle);

  // --- 안마당 계단 ×4 (동서남북 — 성벽↔안마당을 실제로 걸어 오르내림) ---
  // 각 계단: hi(성벽쪽 y=10) → lo(안마당쪽 y=0). 낮은 단이 안마당 쪽, 높은 단이 성벽 쪽 (정방향).
  const STAIR_DEFS = [
    { side: '북', axis: 'z', cross: 8,   hi: 2,    lo: 14,  w: 4 },
    { side: '남', axis: 'z', cross: -8,  hi: 106,  lo: 94,  w: 4 },
    { side: '서', axis: 'x', cross: 32,  hi: -52,  lo: -40, w: 4 },
    { side: '동', axis: 'x', cross: 76,  hi: 52,   lo: 40,  w: 4 },
  ];
  const stairDescs = [];
  for (const sd of STAIR_DEFS) {
    const grp = new THREE.Group();
    const steps = 20, stepLen = Math.abs(sd.lo - sd.hi) / steps; // 0.6
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;          // 0=안마당(lo) .. 1=성벽(hi)
      const top = t * WALL_TOP_Y;            // 이 단의 윗면 높이
      const along = sd.lo + (sd.hi - sd.lo) * t;
      const box = sd.axis === 'z'
        ? new THREE.BoxGeometry(sd.w, top, stepLen)
        : new THREE.BoxGeometry(stepLen, top, sd.w);
      const step = new THREE.Mesh(box, MAT.stone);
      if (sd.axis === 'z') step.position.set(sd.cross, top / 2, along);
      else step.position.set(along, top / 2, sd.cross);
      step.castShadow = true; step.receiveShadow = true;
      grp.add(step);
    }
    scene.add(grp);
    // 발판 영역(평면) + 높이 함수 — player.js가 위치→높이 계산에 사용
    const a = Math.min(sd.hi, sd.lo) - 1, b = Math.max(sd.hi, sd.lo) + 1;
    const foot = sd.axis === 'z'
      ? { xmin: sd.cross - sd.w / 2, xmax: sd.cross + sd.w / 2, zmin: a, zmax: b }
      : { zmin: sd.cross - sd.w / 2, zmax: sd.cross + sd.w / 2, xmin: a, xmax: b };
    stairDescs.push({ side: sd.side, axis: sd.axis, hi: sd.hi, lo: sd.lo, foot });
  }

  // --- 출성 밧줄 ×4 (동서남북 — F키로 성 밖↔성벽 위 오르내림) ---
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7048, roughness: 0.95 });
  // rx,rz=밧줄(성벽 바깥면) 위치, 프레임 가로축, base=성 밖 착지점
  const ropeDefs = [
    { side: '북', rx: 40,  rz: -2.1, fw: 'x', topX: 40, topZ: 0,   base: new THREE.Vector3(40, 1.7, -7) },
    { side: '남', rx: -40, rz: 110.1, fw: 'x', topX: -40, topZ: 108, base: new THREE.Vector3(-40, 1.7, 115) },
    { side: '서', rx: -56.1, rz: 40, fw: 'z', topX: -54, topZ: 40, base: new THREE.Vector3(-61, 1.7, 40) },
    { side: '동', rx: 56.1, rz: 74, fw: 'z', topX: 54, topZ: 74, base: new THREE.Vector3(61, 1.7, 74) },
  ];
  const ropes = [];
  for (const rd of ropeDefs) {
    const frame = new THREE.Mesh(
      rd.fw === 'x' ? new THREE.BoxGeometry(1.6, 0.15, 0.15) : new THREE.BoxGeometry(0.15, 0.15, 1.6), MAT.wood);
    frame.position.set(rd.rx, WALL_TOP_Y + 0.9, rd.rz);
    scene.add(frame);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, WALL_TOP_Y + 0.9, 5), ropeMat);
    rope.position.set(rd.rx, (WALL_TOP_Y + 0.9) / 2, rd.rz);
    scene.add(rope);
    for (let yy = 1.5; yy < WALL_TOP_Y; yy += 1.7) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), ropeMat);
      knot.position.set(rd.rx, yy, rd.rz);
      scene.add(knot);
    }
    ropes.push({
      side: rd.side,
      top: new THREE.Vector3(rd.topX, WALL_TOP_Y + 1.7, rd.topZ),
      base: rd.base.clone(),
    });
  }

  // --- 성 내부(안마당) 스테이션 — 보급/고용/직업 사범 ---
  // 천수각(중심 z=54, 반깊이 8 → z 46~62) 앞(z<46)·뒤(z>62)에 배치, 통로 침범 없음
  const stations = [
    { kind: 'supply',  label: '보급 상인',   pos: new THREE.Vector3(-26, 1.7, 40), cloth: 0x4a2a20, glow: 0xffaa55 },
    { kind: 'hire',    label: '용병 고용관', pos: new THREE.Vector3(26, 1.7, 40),  cloth: 0x2a3a4a, glow: 0x66bbff },
    { kind: 'warrior', label: '전사 사범',   pos: new THREE.Vector3(-26, 1.7, 68), cloth: 0x5a2a22, glow: 0xff6644, robe: false },
    { kind: 'archer',  label: '궁수 사범',   pos: new THREE.Vector3(0, 1.7, 74),   cloth: 0x2a4a2a, glow: 0x66dd66, robe: false },
    { kind: 'mage',    label: '마법 사범',   pos: new THREE.Vector3(26, 1.7, 68),  cloth: 0x3a2448, glow: 0xaa66ff, robe: true },
  ];
  for (const st of stations) {
    const facing = st.pos.z < FORT.cz ? 0 : Math.PI; // 천수각 앞은 북향, 뒤는 남향
    const booth = mkBooth({ pos: new THREE.Vector3(st.pos.x, 0, st.pos.z), cloth: st.cloth, glow: st.glow, robe: st.robe, rotY: facing });
    scene.add(booth);
    // 성능: 스테이션 등불 PointLight 제거 (보주 emissive로 충분). 광원 수 = 셰이딩 비용.
  }

  // --- 횃불 (성벽 위, 플리커 라이트) ---
  const torches = [];
  // 불꽃(발광 메시)은 전부 유지하되, 실제 PointLight는 절반만 부여(성능). 나머지는 블룸 발광으로 충분.
  const torchPos = [
    [-44, 1.6], [-16, 1.6], [16, 1.6], [44, 1.6],     // 북
    [-28, 106.4], [28, 106.4],                         // 남
    [-52.6, 32], [-52.6, 76],                          // 서
    [52.6, 32], [52.6, 76],                            // 동
  ];
  torchPos.forEach(([tx, tz], ti) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), MAT.wood);
    pole.position.set(tx, WALL_TOP_Y + 0.8, tz);
    scene.add(pole);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.6, 0.45) })
    );
    flame.position.set(tx, WALL_TOP_Y + 1.7, tz);
    scene.add(flame);
    let light = null;
    if (ti % 2 === 0) { // 짝수 위치만 실제 광원 (10→5개) — 강도·거리 키워 보완
      light = new THREE.PointLight(0xff7722, 18, 30, 1.8);
      light.position.copy(flame.position);
      scene.add(light);
    }
    torches.push({ light, flame, seed: Math.random() * 10 });
  });

  // --- 황야의 장식: 죽은 나무, 바위, 말뚝 ---
  const deadTreeMat = new THREE.MeshStandardMaterial({ color: 0x1d1812, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * 360;
    const z = -30 - Math.random() * 220;
    if (Math.abs(x) < 12) continue;
    const h = 3 + Math.random() * 5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, h, 5), deadTreeMat);
    trunk.position.set(x, h / 2, z);
    trunk.rotation.z = (Math.random() - 0.5) * 0.25;
    trunk.castShadow = true;
    scene.add(trunk);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, h * 0.5, 4), deadTreeMat);
    branch.position.set(x + 0.5, h * 0.75, z);
    branch.rotation.z = 0.9 + Math.random() * 0.5;
    scene.add(branch);
  }
  for (let i = 0; i < 26; i++) {
    const x = (Math.random() - 0.5) * 300;
    const z = -20 - Math.random() * 200;
    if (Math.abs(x) < 10) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 1.6, 0), MAT.stoneD);
    rock.position.set(x, 0.4, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scene.add(rock);
  }
  for (let i = 0; i < 20; i++) {
    const x = -28 + i * 3 + (Math.random() - 0.5);
    if (Math.abs(x) < 8) continue;
    const stake = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.2, 5), MAT.wood);
    stake.position.set(x, 0.9, -16 - Math.random() * 3);
    stake.rotation.x = -0.5 - Math.random() * 0.3;
    scene.add(stake);
  }

  const world = {
    gate: { hp: 100_000_000, maxHp: 100_000_000, pos: GATE_POS.clone(), meshes: gateMeshes },
    stations, // 성 내부 NPC 스테이션 (보급/고용/직업 사범)
    colliders,
    ropes, // 동서남북 4면 밧줄 — F키로 성 밖↔성벽 위
    stairs: stairDescs, // 4면 계단 발판(footprint)+높이 — player.js가 물리 이동에 사용
    torches,
    update(dt, t) {
      for (const tc of torches) {
        if (tc.light) tc.light.intensity = 16 + Math.sin(t * 9 + tc.seed) * 2.5 + Math.sin(t * 23 + tc.seed * 3) * 1.5;
        const s = 1 + Math.sin(t * 13 + tc.seed) * 0.18;
        tc.flame.scale.set(s, s * 1.2, s);
      }
      const r = Math.min(1, Math.max(0, world.gate.hp / world.gate.maxHp));
      for (const gm of gateMeshes) gm.material.color.setScalar(0.35 + 0.65 * r);
    },
  };
  return world;
}
