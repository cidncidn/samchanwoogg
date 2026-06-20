// 최후의 성벽 — 중세 다크 판타지 1인칭 성벽 방어
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, decorateWorld } from './world.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { WeaponSystem } from './weapons.js';
import { Effects } from './effects.js';
import { NpcManager, AllyManager } from './npc.js';
import { SiegeManager } from './waves.js';
import { loadSave, writeSave, clearPersonal, clearAll } from './save.js';
import { Shop } from './shop.js';
import { UI } from './ui.js';
import { Assets } from './models.js';
import { AmbientAudio } from './audio.js';
import { WEAPONS } from './weapons.js';
import { SkillSystem } from './skills.js';
import { Progression } from './progression.js';
import { DIFFICULTIES, maxLife, vitalityAt } from './formulas.js';

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    // 저사양 모드: ?lowfx — 그림자·블룸 비활성
    this.lowfx = new URLSearchParams(location.search).has('lowfx');
    this.renderer.shadowMap.enabled = !this.lowfx;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 600);
    this.scene.add(this.camera); // 뷰모델(카메라 자식) 렌더링을 위해 필수

    // 플레이어의 등불 — 뷰모델과 근접 성벽을 비춘다
    const lantern = new THREE.PointLight(0xffbb77, 4, 9, 1.6);
    lantern.position.set(0.25, -0.25, 0.1);
    this.camera.add(lantern);

    this.state = 'menu'; // menu | playing | shop | paused | gameover | victory
    this.gold = 40;
    this.endless = false;
    // 연속 처치 콤보 — 3.5초 내 처치를 이으면 골드·경험치 배수가 오른다
    this.combo = 0; this.comboTimer = 0; this.bestCombo = 0;
    // 난이도 (시트12) — URL ?diff=N 또는 기본 보통
    this.difficulty = DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, +new URLSearchParams(location.search).get('diff') || 0)];
    this.panelOpen = null; // 정보 패널 (char/inv/skill)
    this._panelTimer = 0;

    this.assets = new Assets();
    this.assets.loadEnvironment(this.renderer, this.scene);

    this.world = buildWorld(this.scene);
    this.player = new Player(this.camera, this.renderer.domElement, this);
    this.effects = new Effects(this.scene);
    this.enemies = new EnemyManager(this.scene, this);
    this.weapons = new WeaponSystem(this.camera, this.scene, this);
    this.npcs = new NpcManager(this.scene, this);
    this.allies = new AllyManager(this.scene, this);
    this.siege = new SiegeManager(this);
    this.progression = new Progression(this);
    this.ui = new UI(this);
    this.skills = new SkillSystem(this);
    this.shop = new Shop(this);
    this.audio = new AmbientAudio();
    this.repairCrews = 0; // 수리반 — 성문 초당 회복
    this.saveTimer = 20;

    // 시작 방어선: 성 규모 4배 → 기본 수비대 2배 (궁수 8·마법사 8, 4면 라운드로빈 배치)
    for (let i = 0; i < 8; i++) { this.npcs.hireArcher(); this.npcs.hireMage(); }

    // 영속 세이브 복원 — 성은 며칠·몇 달 유지된다
    const sv = loadSave();
    if (sv?.castle) {
      this.siege.elapsed = sv.castle.elapsed || 0;
      this.world.gate.hp = sv.castle.gateHp ?? this.world.gate.maxHp;
      this.repairCrews = sv.castle.repairCrews || 0;
      this.enemies.kills = sv.castle.kills || 0;
      this.npcs.suppliers = sv.castle.suppliers || 0;
      for (let i = 8; i < (sv.castle.archers || 8); i++) this.npcs.hireArcher();
      for (let i = 8; i < (sv.castle.mages || 8); i++) this.npcs.hireMage();
    }
    this.savedPersonal = sv?.personal || null;

    addEventListener('beforeunload', () => {
      if (this.siege.started && this.state !== 'gameover') writeSave(this);
    });

    this.interactHint = document.getElementById('interact-hint');

    // 후처리: 렌더 → 블룸(횃불·마법 발광) → 톤매핑 출력
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 블룸 패스는 항상 추가하되 enabled로 토글 (설정에서 on/off)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.8);
    this.bloomPass.enabled = !this.lowfx;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this._loadSettings(); // 저장된 설정 적용 (감도·볼륨·그래픽) — bloomPass 생성 이후

    this.clock = new THREE.Clock();
    this.elapsed = 0;

    this._bindOverlays();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
    });

    this.renderer.setAnimationLoop(() => this.loop());
  }

  _bindOverlays() {
    const menu = document.getElementById('menu');
    const pause = document.getElementById('pause');

    // 에셋 로드 완료까지 시작 잠금
    const startBtn = document.getElementById('btn-start');
    startBtn.disabled = true;
    startBtn.textContent = '물자 준비 중…';
    const startLabel = () => this.savedPersonal
      ? `용병으로 복귀 — 공성 ${this.siege.day}일째`
      : (this.siege.elapsed > 0 ? `전장에 합류 — 공성 ${this.siege.day}일째` : '전투 개시');
    this.assets.ready.then(() => {
      this.weapons.attachBowModel(this.assets);
      decorateWorld(this.scene, this.assets);
      startBtn.disabled = false;
      startBtn.textContent = startLabel();
    }).catch((err) => {
      console.error('에셋 로드 실패 — 절차 생성 모델로 진행', err);
      startBtn.disabled = false;
      startBtn.textContent = startLabel();
    });

    // 직업 카드 선택 (저장된 용병이 있으면 해당 직업 선택 + 복귀 표시)
    this.playerClass = this.savedPersonal?.cls || 'archer';
    document.querySelectorAll('.class-card').forEach((card) => {
      if (card.dataset.class === this.playerClass) {
        document.querySelectorAll('.class-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      }
      card.addEventListener('click', () => {
        document.querySelectorAll('.class-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.playerClass = card.dataset.class;
        this.savedPersonal = null; // 직업을 바꾸면 새 용병으로 시작
        document.getElementById('btn-start').textContent = startLabel();
      });
    });
    if (this.savedPersonal) {
      document.getElementById('btn-start').textContent =
        `용병으로 복귀 — 공성 ${this.siege.day}일째`;
    } else if (this.siege.elapsed > 0) {
      document.getElementById('btn-start').textContent =
        `전장에 합류 — 공성 ${this.siege.day}일째`;
    }

    document.getElementById('btn-start').addEventListener('click', () => {
      menu.classList.remove('active');
      if (this.savedPersonal) this.restorePersonal(this.savedPersonal);
      else this.applyClass(this.playerClass);
      this.audio.start(); // 사용자 제스처 시점에 오디오 컨텍스트 기동
      this.ui.show();
      this.state = 'playing';
      this._lock();
      this.siege.started = true;
      this.ui.banner(this.siege.elapsed > 0
        ? `공성 ${this.siege.day}일째 — 성벽은 아직 버티고 있다.`
        : '성벽에 올라섰다. 이 전투에 끝은 없다 — 버텨라.');
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      pause.classList.remove('active');
      this.state = 'playing';
      this._lock();
    });

    // ── 포인터락(마우스룩) 관리 ──
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !document.pointerLockElement) this._lock();
    });
    document.addEventListener('pointerlockchange', () => {
      // 전투 중 포인터락이 풀리면(ESC 등) 일시정지 (패널/상점 제외)
      if (!document.pointerLockElement && this.state === 'playing' && !this.panelOpen) {
        this.state = 'paused';
        pause.classList.add('active');
      }
    });

    this._bindSettings(pause);

    // AI 동료 소환 버튼 (일시정지 화면)
    const allyBtn = document.getElementById('btn-ally');
    const updateAllyBtn = () => {
      allyBtn.textContent = this.allies.allies.length >= this.allies.max
        ? `AI 동료 (최대 ${this.allies.max}명)`
        : `AI 동료 소환 (${this.allies.allies.length}/${this.allies.max})`;
    };
    allyBtn.addEventListener('click', () => {
      if (this.allies.spawn()) {
        this.ui.banner('동료 용병이 성벽에 합류했다.', '#66bbff');
        updateAllyBtn();
      }
    });
    updateAllyBtn();

    // (지속 공성 전환으로 승리 화면은 사용하지 않음 — DOM만 잔존)

    // 정보 패널 탭/닫기
    document.querySelectorAll('.ip-tab').forEach((t) => {
      t.addEventListener('click', () => { this.panelOpen = null; this.togglePanel(t.dataset.panel); });
    });
    document.getElementById('ip-close').addEventListener('click', () => this.closePanel());

    // 일시정지는 ESC로 포인터락이 풀리며 pointerlockchange가 처리한다.
    // (재개는 화면 클릭 또는 '전장으로 복귀' 버튼)

    // 상호작용 키: G = 성 내부 스테이션 (보급/고용/직업 사범)
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyG') {
        const booth = this._nearBooth();
        if (this.state === 'playing' && booth) this.openLiveShop(booth.kind);
        else if (this.state === 'liveshop') this.closeShopOverlay();
      } else if (e.code === 'KeyC') { this.togglePanel('char'); }
      else if (e.code === 'KeyI') { this.togglePanel('inv'); }
      else if (e.code === 'KeyK') { this.togglePanel('skill'); }
      else if (e.code === 'Escape' && this.panelOpen) { this.closePanel(); }
      else if (e.code === 'Escape' && this.state === 'liveshop') {
        this.closeShopOverlay();
      } else if (e.code === 'KeyF' && this.state === 'playing') {
        // F = 출성/복귀(밧줄) — 동서남북 4면 중 가까운 밧줄로 오르내림
        const p = this.player, pos = this.camera.position;
        for (const R of this.world.ropes) {
          if (p.mode !== 'ground' && pos.distanceTo(R.top) < 5) {
            p._setPlace('ground'); p.airborne = false; p.vy = 0;
            pos.set(R.base.x, R.base.y, R.base.z);
            this.ui.banner(`${R.side}벽 밖으로 내려섰다 — 등 뒤를 조심해라.`, '#cc8844');
            break;
          } else if (p.mode === 'ground' && pos.distanceTo(R.base) < 5) {
            p._setPlace('wall'); p.airborne = false; p.vy = 0;
            pos.set(R.top.x, R.top.y, R.top.z);
            this.ui.banner(`${R.side}벽 위로 올라왔다.`);
            break;
          }
        }
      }
    });
  }

  // 조준원 — weapons/skills 공용 (화면 가운데 고정)
  aimDir(out) { return out.copy(this.player.aimDir); }
  aimGround() { return this.player.aimPoint.clone(); }

  // 포인터락 헬퍼 (마우스룩)
  _lock() { try { this.renderer.domElement.requestPointerLock?.(); } catch { /* 제스처 외 호출 무시 */ } }
  _unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // ── 설정 (감도·볼륨·그래픽) ──
  _loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('lb_settings') || '{}'); } catch { /* */ }
    this.settings = {
      sens: s.sens ?? 1, master: s.master ?? 1, sfx: s.sfx ?? 1, amb: s.amb ?? 1,
      view: s.view ?? 1, bloom: s.bloom ?? !this.lowfx, shadow: s.shadow ?? !this.lowfx,
    };
    this._applySettings();
  }
  _applySettings() {
    const s = this.settings;
    this.player.lookSens = 0.0022 * s.sens;
    this.audio.vol = { master: s.master, ambient: s.amb, sfx: s.sfx };
    this.audio.applyVol();
    this.bloomPass.enabled = s.bloom;
    this.renderer.shadowMap.enabled = s.shadow;
    this.renderer.shadowMap.needsUpdate = true;
    // 시야 거리 = 안개 밀도 (view 0=짙음/가까움 .. 1=옅음/멀리)
    if (this.scene.fog) this.scene.fog.density = 0.012 - s.view * 0.0095;
  }
  _saveSettings() { try { localStorage.setItem('lb_settings', JSON.stringify(this.settings)); } catch { /* */ } }

  _bindSettings(pause) {
    const panel = document.getElementById('settings');
    const $ = (id) => document.getElementById(id);
    document.getElementById('btn-settings').addEventListener('click', () => {
      pause.classList.remove('active'); panel.classList.add('active'); this._syncSettingsUI();
    });
    document.getElementById('btn-settings-close').addEventListener('click', () => {
      panel.classList.remove('active'); pause.classList.add('active');
    });
    // 슬라이더 → 설정값 (실시간 적용 + 저장)
    const bindRange = (id, key, map, fmt) => {
      $(id).addEventListener('input', () => {
        this.settings[key] = map(+$(id).value);
        $(id + '-v').textContent = fmt(+$(id).value);
        this._applySettings(); this._saveSettings();
      });
    };
    bindRange('set-sens', 'sens', (v) => v / 100, (v) => `${(v / 100).toFixed(2)}×`);
    bindRange('set-master', 'master', (v) => v / 100, (v) => `${v}%`);
    bindRange('set-sfx', 'sfx', (v) => v / 100, (v) => `${v}%`);
    bindRange('set-amb', 'amb', (v) => v / 100, (v) => `${v}%`);
    bindRange('set-view', 'view', (v) => v / 100, (v) => `${v}%`);
    const bindToggle = (id, key) => $(id).addEventListener('change', () => {
      this.settings[key] = $(id).checked; this._applySettings(); this._saveSettings();
    });
    bindToggle('set-bloom', 'bloom');
    bindToggle('set-shadow', 'shadow');
  }
  // 설정창 열 때 현재 값 반영
  _syncSettingsUI() {
    const s = this.settings, $ = (id) => document.getElementById(id);
    const set = (id, val, label) => { $(id).value = val; $(id + '-v').textContent = label; };
    set('set-sens', Math.round(s.sens * 100), `${s.sens.toFixed(2)}×`);
    set('set-master', Math.round(s.master * 100), `${Math.round(s.master * 100)}%`);
    set('set-sfx', Math.round(s.sfx * 100), `${Math.round(s.sfx * 100)}%`);
    set('set-amb', Math.round(s.amb * 100), `${Math.round(s.amb * 100)}%`);
    set('set-view', Math.round(s.view * 100), `${Math.round(s.view * 100)}%`);
    $('set-bloom').checked = s.bloom;
    $('set-shadow').checked = s.shadow;
  }

  // 정보 패널 토글 (C/I/K) — 전투는 계속 진행, 마우스는 자유(패널 조작)
  togglePanel(type) {
    if (this.state !== 'playing' && !this.panelOpen) return;
    const el = document.getElementById('info-panel');
    if (this.panelOpen === type) { this.closePanel(); return; }
    this.panelOpen = type;
    el.classList.add('active');
    this.ui.renderPanel(type);
    this._unlock();
  }

  closePanel() {
    this.panelOpen = null;
    document.getElementById('info-panel').classList.remove('active');
    if (this.state === 'playing') this._lock();
  }

  // 가까운 상점 부스: 'live'(보급 상인) | 'learn'(마법 학자) | null
  // 성 내부 스테이션 근접 검사 — 반환: {kind,label} 또는 null
  _nearBooth() {
    const p = this.camera.position;
    for (const st of this.world.stations) {
      const dx = p.x - st.pos.x, dz = p.z - st.pos.z;
      if (Math.hypot(dx, dz) < 4.5) return st;
    }
    return null;
  }

  // 저장된 용병 복원 (성과 함께 며칠이고 이어지는 개인 기록)
  restorePersonal(ps) {
    const p = this.player, w = this.weapons, s = this.shop;
    this.playerClass = ps.cls;
    this.gold = ps.gold ?? this.gold;
    w.arrows = ps.arrows ?? w.arrows; w.maxArrows = ps.maxArrows ?? w.maxArrows;
    w.oil = ps.oil ?? w.oil; w.maxOil = ps.maxOil ?? w.maxOil;
    w.physDmgMult = ps.physDmgMult ?? 1; w.magicDmgMult = ps.magicDmgMult ?? 1;
    p.maxHp = ps.maxHp ?? p.maxHp; p.hp = p.maxHp;
    p.hpRegen = ps.hpRegen ?? p.hpRegen;
    p.maxMana = ps.maxMana ?? p.maxMana; p.mana = p.maxMana;
    p.manaRegen = ps.manaRegen ?? p.manaRegen;
    for (const id of ps.unlocked || []) {
      const wp = WEAPONS.find((x) => x.id === id);
      if (wp) wp.unlocked = true;
    }
    Object.assign(s, ps.shopLv || {});
    this.playerClass = ps.cls;
    this.weapons.setClass(ps.cls);
    this.skills.setClass(ps.cls);
    if (ps.sub) this.skills.setSub(ps.sub);
    if (ps.skills?.length) { this.skills.learned = new Set(ps.skills); this.skills.rebind(); }
    this.progression.level = ps.level || 1;
    this.progression.xp = ps.xp || 0;
    this.progression.weaponGrade = ps.weaponGrade || 0;
    this.progression.alloc = ps.alloc || {};
    this.progression.statPoints = ps.statPoints || 0;
    this.ui.refreshSkill();
    this.ui.refreshWeaponBar();
  }

  applyClass(cls) {
    const p = this.player;
    const w = this.weapons;
    this.playerClass = cls;
    this.skills.setClass(cls);
    w.setClass(cls); // 직업별 무기 로드아웃 (1번 = 메인)
    this.progression.reset(); // 새 용병 — Lv1부터
    // 시트2 공식: Lv1 최대 생명력
    p.maxHp = maxLife(1, vitalityAt(cls, 1)); p.hp = p.maxHp;
    if (cls === 'archer') {
      w.arrows = 200; w.maxArrows = 350;
    } else if (cls === 'warrior') {
      p.hpRegen *= 1.8;
      w.arrows = 80;
    } else if (cls === 'mage') {
      p.maxMana = 110; p.mana = 110; p.manaRegen = 9;
      w.arrows = 80;
    }
    this.ui.refreshWeaponBar();
  }

  // 실시간 상점 (전투 진행 유지) — kind: supply/hire/warrior/archer/mage
  openLiveShop(kind = 'supply') {
    this.state = 'liveshop';
    this._unlock(); // 커서로 상점 조작
    this.shop.open(kind);
  }

  // 상점 오버레이 닫기 → 전장 복귀
  closeShopOverlay() {
    this.shop.close();
    this.state = 'playing';
    this._lock();
  }

  gameOver(reason) {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this._unlock();
    this.shop.close();
    this.interactHint.style.display = 'none';
    const goText = document.querySelector('#gameover p:last-of-type');
    if (reason === 'gate') {
      // 성 함락: 모든 기록 소멸 — 새로운 성에서 처음부터
      clearAll();
      document.getElementById('go-title').textContent = '성이 함락되었다';
      document.getElementById('go-stats').textContent =
        `공성 ${this.siege.day}일째에 무너졌다 · 누적 처치 ${this.enemies.kills}`;
      if (goText) goText.textContent = '이 성의 기록은 여기서 끝났다. 새로운 성채가 용병을 기다린다.';
    } else {
      // 용병 사망: 공성이 1일차로 초기화된다 (전체 기록 소멸)
      const survivedDay = this.siege.day;
      clearAll();
      document.getElementById('go-title').textContent = '용병은 쓰러졌다';
      document.getElementById('go-stats').textContent =
        `공성 ${survivedDay}일째까지 버텼다 · 누적 처치 ${this.enemies.kills}`;
      if (goText) goText.textContent = '공성이 1일차로 되돌아간다. 새로운 용병으로 처음부터.';
    }
    document.getElementById('gameover').classList.add('active');
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    // 일시정지 = 슬롯 편집 모드 (마우스로 무기·스킬 클릭 변경)
    document.body.classList.toggle('paused-edit', this.state === 'paused');

    if (this.state === 'playing' || this.state === 'liveshop') {
      this.elapsed += dt;
      const t = this.elapsed;
      if (this.state === 'playing') this.player.update(dt);
      this.weapons.update(dt, t);
      this.enemies.update(dt, t);
      this.npcs.update(dt);
      this.allies.update(dt, t);
      // 콤보 타이머 — 끊기면 리셋
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }
      // 정보 패널 실시간 갱신 (0.3초마다)
      if (this.panelOpen) {
        this._panelTimer -= dt;
        if (this._panelTimer <= 0) { this._panelTimer = 0.3; this.ui.renderPanel(this.panelOpen); }
      }
      this.skills.update(dt);
      this.siege.update(dt);
      this.world.update(dt, t);
      this.effects.update(dt, this.camera);
      this.ui.update(dt);

      // 수리반: 성문 초당 회복
      if (this.repairCrews > 0) {
        const g = this.world.gate;
        g.hp = Math.min(g.maxHp, g.hp + this.repairCrews * 15 * dt);
      }

      // 주기 자동 저장 (성은 며칠·몇 달 유지된다)
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = 20;
        writeSave(this);
      }

      // 상호작용 힌트 (성 내부 스테이션 G / 출성 밧줄 F — 4면)
      let hint = null;
      if (this.state === 'playing') {
        const booth = this._nearBooth();
        const pos = this.camera.position;
        if (booth) hint = `[G] ${booth.label}`;
        else for (const R of this.world.ropes) {
          if (this.player.mode !== 'ground' && pos.distanceTo(R.top) < 5) { hint = `[F] ${R.side}벽 밖으로 — 출성`; break; }
          if (this.player.mode === 'ground' && pos.distanceTo(R.base) < 5) { hint = `[F] ${R.side}벽 위로 복귀`; break; }
        }
      }
      this.interactHint.style.display = hint ? 'block' : 'none';
      if (hint) this.interactHint.textContent = hint;

      if (this.world.gate.hp <= 0) this.gameOver('gate');
      else if (this.player.dead) this.gameOver('dead');
    } else {
      // 정지 상태에서도 횃불은 일렁이게
      this.world.update(dt, this.elapsed + this.clock.elapsedTime);
    }

    this.composer.render();
  }
}

window.game = new Game(); // 콘솔 디버깅용 핸들
