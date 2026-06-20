// 외부 3D 에셋 로더 — KayKit 해골 캐릭터(CC0), Quaternius 활(CC0), HDRI 환경광
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();

export class Assets {
  constructor() {
    this.templates = {};
    this.ready = this._loadAll();
  }

  async _loadAll() {
    const defs = {
      minion: '/assets/Skeleton_Minion.glb',
      warrior: '/assets/Skeleton_Warrior.glb',
      mage: '/assets/Skeleton_Mage.glb',
      rogue: '/assets/Skeleton_Rogue.glb',
      bow: '/assets/bow.glb',
      banner: '/assets/banner_red.glb',
      barrel: '/assets/barrel.glb',
      box: '/assets/box_stacked.glb',
      crates: '/assets/crates_stacked.glb',
      chest: '/assets/chest.glb',
    };
    await Promise.all(Object.entries(defs).map(async ([key, url]) => {
      const gltf = await loader.loadAsync(url);
      this.templates[key] = { scene: gltf.scene, animations: gltf.animations };
    }));
  }

  // HDRI 환경광 (PBR 재질의 야간 반사·음영)
  loadEnvironment(renderer, scene) {
    new RGBELoader().load('/assets/night_env.hdr', (tex) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      scene.environmentIntensity = 0.4;
      tex.dispose();
      pmrem.dispose();
    });
  }

  // 스킨드 캐릭터 복제 (적 1체당 1회)
  spawnCharacter(key, tint) {
    const t = this.templates[key];
    const root = SkeletonUtils.clone(t.scene);
    root.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.material = c.material.clone(); // 빙결 이미시브·틴트가 개체별로 적용되도록
        if (tint) c.material.color.multiply(new THREE.Color(tint));
        c.frustumCulled = false; // 스킨드 메시 컬링 오판 방지
      }
    });
    const mixer = new THREE.AnimationMixer(root);
    const action = (name, once = false) => {
      const clipObj = THREE.AnimationClip.findByName(t.animations, name);
      if (!clipObj) return null;
      const a = mixer.clipAction(clipObj);
      if (once) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
      return a;
    };
    return { root, mixer, action };
  }

  // 정적 소품 복제
  getProp(key) {
    const p = this.templates[key].scene.clone(true);
    p.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    return p;
  }

  // 활 뷰모델용 메시 (정적)
  getBow() {
    const bow = this.templates.bow.scene.clone(true);
    bow.traverse((c) => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material.color.multiplyScalar(0.5); // 검게 그을린 톤
        c.material.roughness = 0.6;
      }
    });
    return bow;
  }
}
