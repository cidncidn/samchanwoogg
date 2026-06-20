// 시각 효과: 피보라, 핏자국, 폭발, 번개 줄기
import * as THREE from 'three';

const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a0e0e });
const bloodDarkMat = new THREE.MeshBasicMaterial({ color: 0x4a0606 });
const particleGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
const splatGeo = new THREE.CircleGeometry(1, 10);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];   // {mesh, vel, life}
    this.beams = [];       // {line, life}
    this.flashes = [];     // {light, life}
    this.splats = [];      // 바닥 핏자국 (개수 제한)
    this.shakeTime = 0;
    this.shakeAmp = 0;
    // ⚠️ 광원 풀 — 씬의 광원 개수가 바뀌면 Three.js가 전체 셰이더를 재컴파일해 매 발사마다 끊긴다.
    // 미리 12개를 만들어 두고 강도만 켰다 끄며 재사용 → 개수 불변 → 재컴파일 없음.
    this.lightPool = [];
    this.lightCursor = 0;
    for (let i = 0; i < 8; i++) { // 12→8 (광원 수 = 셰이딩 비용)
      const l = new THREE.PointLight(0xffffff, 0, 12, 1.8);
      scene.add(l);
      this.lightPool.push(l);
    }
    // 파티클 메시 풀 — 매 타격마다 Mesh/Material 새로 만들지 않고 재사용(GC 스파이크 완화)
    this.particlePool = [];
  }

  // 풀에서 파티클 메시 하나 꺼내 색·크기 설정 후 씬에 추가
  _acquire(color, scale) {
    let m = this.particlePool.pop();
    if (!m) m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial());
    m.material.color.set(color);
    m.scale.setScalar(scale);
    m.visible = true;
    this.scene.add(m);
    return m;
  }
  _release(m) { this.scene.remove(m); this.particlePool.push(m); }

  // 풀에서 광원 하나를 꺼내 점멸 등록 (add/remove 하지 않음)
  flash(pos, color, intensity, distance, life) {
    const light = this.lightPool[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lightPool.length;
    light.position.copy(pos);
    light.color.set(color);
    light.distance = distance;
    light.intensity = intensity;
    this.flashes = this.flashes.filter((f) => f.light !== light); // 같은 광원 재사용 시 기존 항목 교체
    this.flashes.push({ light, life, max: life, base: intensity });
  }

  // 피보라
  blood(pos, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const mesh = this._acquire(Math.random() < 0.5 ? 0x8a0e0e : 0x4a0606, 1);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 7 * power,
        Math.random() * 6 * power,
        (Math.random() - 0.5) * 7 * power
      );
      this.particles.push({ mesh, vel, life: 0.9 + Math.random() * 0.6, blood: true });
    }
  }

  // 바닥 핏자국 (지면 y≈0에서만)
  bloodSplat(pos) {
    if (pos.y > 2) return;
    const splat = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({
      color: 0x520808, transparent: true, opacity: 0.85,
    }));
    splat.rotation.x = -Math.PI / 2;
    splat.position.set(pos.x + (Math.random() - 0.5), 0.03 + Math.random() * 0.02, pos.z + (Math.random() - 0.5));
    const s = 0.7 + Math.random() * 1.1;
    splat.scale.set(s, s * (0.7 + Math.random() * 0.6), 1);
    splat.rotation.z = Math.random() * Math.PI * 2;
    this.scene.add(splat);
    this.splats.push(splat);
    if (this.splats.length > 70) {
      const old = this.splats.shift();
      this.scene.remove(old);
      old.material.dispose();
    }
  }

  // 폭발 (화염구·기름)
  explosion(pos, radius = 5, color = 0xff6622) {
    this.flash(pos, color, 80, radius * 4, 0.35);
    const hdr = new THREE.Color(color).multiplyScalar(2.4); // 블룸 발광
    for (let i = 0; i < 22; i++) {
      const mesh = this._acquire(hdr, 1.5 + Math.random() * 2);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 12, Math.random() * 9, (Math.random() - 0.5) * 12
      );
      this.particles.push({ mesh, vel, life: 0.5 + Math.random() * 0.4, fire: true });
    }
    this.shake(0.25, 0.18);
  }

  // 번개 줄기 (시작→끝 지그재그 라인)
  lightningBeam(from, to) {
    const pts = [];
    const seg = 7;
    for (let i = 0; i <= seg; i++) {
      const p = from.clone().lerp(to, i / seg);
      if (i > 0 && i < seg) {
        p.x += (Math.random() - 0.5) * 0.9;
        p.y += (Math.random() - 0.5) * 0.9;
        p.z += (Math.random() - 0.5) * 0.9;
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: new THREE.Color(1.6, 2.2, 4), transparent: true, opacity: 1, // 블룸 발광
    }));
    this.scene.add(line);
    this.beams.push({ line, life: 0.14 });
    this.flash(to, 0x99bbff, 40, 18, 0.15);
  }

  // 타격 스파크 (화살 적중 등)
  spark(pos, color = 0xffcc88, n = 5) {
    for (let i = 0; i < n; i++) {
      const mesh = this._acquire(color, 0.6);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5);
      this.particles.push({ mesh, vel, life: 0.3 + Math.random() * 0.2 });
    }
  }

  shake(time, amp) {
    this.shakeTime = Math.max(this.shakeTime, time);
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  update(dt, camera) {
    // 파티클
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.blood && p.mesh.position.y < 0.5) this.bloodSplat(p.mesh.position);
        this._release(p.mesh); // 풀로 반환 (재사용)
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= (p.fire ? 4 : 16) * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.set(0, 0, 0); }
      if (p.fire) p.mesh.scale.multiplyScalar(1 - 2.2 * dt);
    }
    // 번개
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / 0.14);
      if (b.life <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        this.beams.splice(i, 1);
      }
    }
    // 섬광
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.light.intensity = Math.max(0, f.life / f.max) * f.base;
      if (f.life <= 0) { f.light.intensity = 0; this.flashes.splice(i, 1); } // 풀이므로 remove 안 함
    }
    // 화면 흔들림
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      camera.position.x += (Math.random() - 0.5) * this.shakeAmp;
      camera.position.y += (Math.random() - 0.5) * this.shakeAmp;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
  }
}
