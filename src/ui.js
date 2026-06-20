// HUD: 생명력/마나/경험치(RPG 바), 성문 내구도, 공성 정보, 무기·스킬 슬롯, 데미지 팝업, 배너
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { CLASSES, isPassive } from './jobs.js';
import { skillIcon, weaponIcon } from './icons.js';
import { GRADES, STAT_DEFS } from './progression.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.hud = document.getElementById('hud');
    this.castleFill = document.getElementById('castle-fill');
    this.castleText = document.getElementById('castle-text');
    this.hpFill = document.getElementById('hp-fill');
    this.hpText = document.getElementById('hp-text');
    this.mpFill = document.getElementById('mp-fill');
    this.mpText = document.getElementById('mp-text');
    this.waveNum = document.getElementById('wave-num');
    this.enemyCount = document.getElementById('enemy-count');
    this.goldAmount = document.getElementById('gold-amount');
    this.weaponBar = document.getElementById('weapon-bar');
    this.bannerEl = document.getElementById('banner');
    this.comboEl = document.getElementById('combo');
    this.vignette = document.getElementById('vignette');
    this.lowhp = document.getElementById('lowhp');
    this.dirEls = {
      N: document.getElementById('dt-n'), S: document.getElementById('dt-s'),
      W: document.getElementById('dt-w'), E: document.getElementById('dt-e'),
    };
    this.skillBar = document.getElementById('skill-bar');
    this.minimap = document.getElementById('minimap');
    this._mm = this.minimap?.getContext('2d');
    this.plLevel = document.getElementById('pl-level');
    this.xpFill = document.getElementById('xp-fill');
    this.dmgLayer = document.getElementById('dmg-layer');
    this.dmgNums = []; // {el, pos(Vector3), life}
    this._bannerTimer = null;
    this.skillSlots = []; // 4 sslot elements (Q/E/R/T)
    this.buildSkillBar();
    this.buildWeaponBar();

    // 스탯 분배 + 버튼 (캐릭터 패널) — 이벤트 위임 (패널은 0.3초마다 재생성됨)
    document.getElementById('ip-body')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.stat-plus');
      if (!btn) return;
      e.stopPropagation();
      if (this.game.progression.addStatPoint(btn.dataset.stat)) this.renderPanel('char');
    });
  }

  // 디아블로식 데미지 숫자 팝업 (월드 좌표 → 화면 투영)
  popDamage(worldPos, amount, crit) {
    if (this.dmgNums.length > 28) {
      const old = this.dmgNums.shift();
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = crit ? 'dmgnum crit' : 'dmgnum';
    el.textContent = Math.round(amount);
    this.dmgLayer.appendChild(el);
    this.dmgNums.push({ el, pos: worldPos.clone(), life: 0.8 });
  }

  _updateDmgNums(dt) {
    const cam = this.game.camera;
    const v = new THREE.Vector3();
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.life -= dt;
      if (d.life <= 0) { d.el.remove(); this.dmgNums.splice(i, 1); continue; }
      d.pos.y += dt * 2.2; // 위로 떠오름
      v.copy(d.pos).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { d.el.style.display = 'none'; continue; }
      d.el.style.display = '';
      d.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      d.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      d.el.style.opacity = Math.min(1, d.life / 0.35);
    }
  }

  buildSkillBar() {
    this.skillBar.innerHTML = '';
    const keys = ['Q', 'E', 'R', 'T'];
    for (let i = 0; i < 4; i++) {
      const div = document.createElement('div');
      div.className = 'sslot';
      div.innerHTML = `<span class="key">${keys[i]}</span><div class="icon">＋</div><div class="ammo"></div><span class="slv"></span>`;
      // 전투 중 좌클릭=발동 / 일시정지(ESC) 중 좌클릭=지정 픽커 / 우클릭=항상 픽커
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.game.state === 'playing') this.game.skills?.useSlot(i);
        else this._openSkillPicker(i, div);
      });
      div.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this._openSkillPicker(i, div); });
      this.skillBar.appendChild(div);
      this.skillSlots.push(div);
    }
  }

  // 슬롯 i에 지정할 스킬 선택 픽커 (학습한 액티브 스킬 목록)
  _openSkillPicker(i, anchor) {
    const sk = this.game.skills;
    if (!sk) return;
    this._closePicker();
    const pick = document.createElement('div');
    pick.id = 'skill-picker';
    const list = sk.bindable();
    let h = `<div class="pk-head">${['Q','E','R','T'][i]} 슬롯 지정</div>`;
    for (const s of list) {
      const cur = sk.bindings[i] === s.name ? ' cur' : '';
      h += `<button class="pk-row${cur}" data-name="${s.name}">${skillIcon(s)} ${s.name} <em>Lv${s.lv}</em></button>`;
    }
    h += `<button class="pk-row pk-clear" data-name="">— 비우기 —</button>`;
    pick.innerHTML = h;
    document.body.appendChild(pick);
    const r = anchor.getBoundingClientRect();
    pick.style.left = Math.min(r.left, innerWidth - 230) + 'px';
    pick.style.bottom = (innerHeight - r.top + 8) + 'px';
    pick.querySelectorAll('.pk-row').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      sk.bindSlot(i, b.dataset.name || null);
      this._closePicker();
    }));
    setTimeout(() => addEventListener('click', this._closePicker = this._closePicker.bind(this), { once: true }), 0);
  }
  _closePicker() { const p = document.getElementById('skill-picker'); if (p) p.remove(); }

  refreshSkill() {
    const sk = this.game.skills;
    if (!sk) return;
    for (let i = 0; i < 4; i++) {
      const slot = this.skillSlots[i];
      const name = sk.bindings[i];
      const s = name ? sk.skills.find((x) => x.name === name) : null;
      slot.querySelector('.icon').innerHTML = s ? skillIcon(s) : '＋';
      slot.querySelector('.slv').textContent = s && s.coef ? `×${s.coef}` : '';
      slot.classList.toggle('empty', !s);
      slot.title = s ? `${s.name} — ${s.effect} (좌클릭 발동 / 우클릭 지정)` : '우클릭으로 스킬 지정';
    }
  }

  show() { this.hud.classList.add('active'); }

  // 정보 패널 렌더 (char / inv / skill)
  renderPanel(type) {
    const g = this.game, P = g.progression, w = g.weapons, sk = g.skills;
    const body = document.getElementById('ip-body');
    document.querySelectorAll('.ip-tab').forEach((t) => t.classList.toggle('sel', t.dataset.panel === type));
    const row = (k, v) => `<div class="ip-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    let h = '';
    if (type === 'char') {
      const clsName = { archer: '궁수', warrior: '전사', mage: '마법사' }[g.playerClass] || '용병';
      h += '<h3>캐릭터</h3>';
      h += row('직업', clsName) + row('레벨', `Lv ${P.level}`) + row('경험치', `${Math.floor(P.xp)} / ${P.xpNeed()}`);
      // 스탯 분배 (레벨업당 +5, 주 스탯 옆 + 버튼)
      h += `<h3>스탯 <span class="sp-pool ${P.statPoints > 0 ? 'has' : ''}">분배 포인트 ${P.statPoints}</span></h3>`;
      for (const s of STAT_DEFS[g.playerClass]) {
        const plus = P.statPoints > 0
          ? `<button class="stat-plus" data-stat="${s.key}" title="${s.desc}">+</button>` : '';
        h += `<div class="ip-row stat-row"><span class="k">${s.name}(${s.abbr})${s.primary ? ' ★' : ''}</span>`
          + `<span class="v">${P.statVal(s.key)} ${plus}</span></div>`;
      }
      h += '<h3>전투 (파생)</h3>';
      h += row('최대 생명력', Math.round(g.player.maxHp)) + row('최대 마나', Math.round(g.player.maxMana));
      h += row('데미지 배율', `×${P.levelDmg.toFixed(2)}`);
      h += row('치명타 확률', `${(P.critChance * 100).toFixed(1)}%`) + row('명중(산탄보정)', `${(P.accuracy * 100).toFixed(0)}%`);
      if (g.playerClass === 'warrior') h += row('받는 피해 감소', `${(P.damageReduction * 100).toFixed(0)}%`);
      h += row('무기 등급', GRADES[P.weaponGrade].name);
      h += `<div class="ip-note">난이도: ${g.difficulty.name} · 공성 ${g.siege.day}일째</div>`;
    } else if (type === 'inv') {
      h += '<h3>자원 / 소모품</h3>';
      h += row('골드', `${Math.floor(g.gold)} G`);
      h += row('화살', `${Math.floor(w.arrows)} / ${w.maxArrows}`) + row('끓는 기름', `${w.oil} / ${w.maxOil}`);
      h += '<h3>무기 로드아웃 (1번 = 직업 메인)</h3><div>';
      const el0 = sk?.subDef?.combat?.element || 'arcane';
      for (const wp of w.loadout) {
        h += `<span class="ip-pill on">${weaponIcon(wp, el0)} ${wp.name}</span>`;
      }
      h += '</div>';
      h += row('물리 피해 배수', `×${w.physDmgMult.toFixed(2)}`) + row('마법 피해 배수', `×${w.magicDmgMult.toFixed(2)}`);
      h += '<div class="ip-note">엑셀의 13종 장비 슬롯·그리드 인벤토리는 추후 도입 예정입니다.</div>';
    } else if (type === 'skill') {
      const cls = CLASSES[g.playerClass];
      h += '<h3>직업 / 전직</h3>';
      h += row('기본 직업', `${cls.icon} ${cls.name} (${cls.resource})`);
      h += row('세부직업', `${sk.subDef.name} — ${sk.subDef.role}`);
      h += '<h3>스킬 슬롯 (우클릭으로 지정)</h3>';
      for (let i = 0; i < 4; i++) {
        const nm = sk.bindings[i];
        const s = nm ? sk.skills.find((x) => x.name === nm) : null;
        h += row(['Q', 'E', 'R', 'T'][i], s ? `${skillIcon(s)} ${s.name}` : '— 비어있음 —');
      }
      h += '<h3>습득 스킬 (' + sk.rank + '/' + sk.skills.length + ')</h3><div>';
      const learnedSkills = sk.treeList().filter((s) => s.learned);
      if (learnedSkills.length) {
        for (const s of learnedSkills) {
          h += `<span class="ip-pill on">${skillIcon(s)} ${s.name}</span>`;
        }
      } else h += '<span class="ip-note">아직 습득한 스킬이 없다. 성 안 직업 사범에게서 배워라.</span>';
      h += '</div>';
      // 다음 습득 스킬 (현재 익힌 스킬의 다음)
      const next = sk.treeList().find((s) => !s.learned);
      if (next) {
        const okNow = P.level >= next.lv;
        h += row('▶ 다음 습득', `${skillIcon(next)} Lv${next.lv} ${next.name} ${okNow ? '(습득 가능)' : `(Lv${next.lv} 필요)`}`);
      }
      h += `<div class="ip-note">패시브 슬롯 ${P.passiveSlots}/4 해금 (Lv10/20/30/70)</div>`;
      if (sk.hasLearnable) h += `<div class="ip-note" style="color:#66ddff">▣ 습득 가능한 스킬이 있다 — 성 안 ${cls.name} 사범에게로</div>`;
    }
    body.innerHTML = h;
  }

  buildWeaponBar() {
    this.weaponBar.innerHTML = '';
    const ws = this.game.weapons;
    const NUM = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']; // 위: 숫자 단축키 0~9 (10칸)
    this.slots = [];
    for (let i = 0; i < 10; i++) {
      const div = document.createElement('div');
      div.className = 'wslot';
      div.innerHTML = `<span class="key">${NUM[i]}</span><div class="icon"></div><div class="ammo"></div>`;
      div.addEventListener('click', (e) => { e.stopPropagation(); if (i < ws.loadout.length) ws.select(i); });
      this.weaponBar.appendChild(div);
      this.slots.push(div);
    }
    this.refreshWeaponBar();
  }

  refreshWeaponBar() {
    const ws = this.game.weapons;
    if (!this.slots || this.slots.length !== 10) { this.buildWeaponBar(); return; }
    const grade = this.game.progression ? GRADES[this.game.progression.weaponGrade] : null;
    for (let i = 0; i < 10; i++) {
      const slot = this.slots[i];
      const w = ws.loadout[i];
      if (!w) { // 미할당 — 빈 칸
        slot.classList.add('empty'); slot.classList.remove('selected', 'nores'); slot.style.borderColor = '';
        slot.querySelector('.icon').innerHTML = ''; slot.querySelector('.ammo').textContent = '';
        continue;
      }
      slot.classList.remove('empty');
      const el = this.game.skills?.subDef?.combat?.element || 'arcane';
      slot.querySelector('.icon').innerHTML = weaponIcon(w, el);
      if (grade && (w.id === 'bow' || w.id === 'sword') && this.game.progression.weaponGrade > 0 && i !== ws.current) {
        slot.style.borderColor = grade.color;
      } else if (i !== ws.current) { slot.style.borderColor = ''; }
      slot.classList.toggle('selected', i === ws.current);
      const ammoEl = slot.querySelector('.ammo');
      if (w.res === 'arrow') ammoEl.textContent = `${Math.floor(ws.arrows)}`;
      else if (w.res === 'mana') ammoEl.textContent = `${w.mana} MP`;
      else if (w.res === 'oil') ammoEl.textContent = `${ws.oil}`;
      else ammoEl.textContent = '—';
      slot.classList.toggle('nores', !ws.canAfford(w));
    }
  }

  banner(text, color = '#c9b896') {
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = color;
    this.bannerEl.style.opacity = 1;
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => { this.bannerEl.style.opacity = 0; }, 2600);
  }

  flashDamage() {
    this.vignette.style.opacity = 1;
    this.game.audio?.hurt();
    clearTimeout(this._vigTimer);
    this._vigTimer = setTimeout(() => { this.vignette.style.opacity = 0; }, 250);
  }

  // 피격 방향 — deg(카메라 정면=0, 우=+, 좌=-)만큼 붉은 호를 회전
  showHitDir(deg) {
    if (!this.hitDir) this.hitDir = document.getElementById('hit-dir');
    this.hitDir.style.transform = `rotate(${deg}deg)`;
    this.hitDir.style.opacity = '1';
    clearTimeout(this._hitDirTimer);
    this._hitDirTimer = setTimeout(() => { this.hitDir.style.opacity = '0'; }, 240);
  }

  // 미니맵/레이다 — 플레이어 중심, 전방=위, 반경 내 적 블립
  drawRadar() {
    const ctx = this._mm; if (!ctx) return;
    const W = this.minimap.width, c = W / 2, R = c - 3;
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.fillStyle = 'rgba(8,6,4,.72)'; ctx.fill();
    ctx.strokeStyle = 'rgba(110,84,44,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.stroke();
    const p = this.game.player, yaw = p.yaw, px = p.position.x, pz = p.position.z;
    const range = 150, scale = R / range, sy = Math.sin(yaw), cyaw = Math.cos(yaw);
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.clip();
    for (const e of this.game.enemies.list) {
      if (e.dead) continue;
      const rx = e.mesh.position.x - px, rz = e.mesh.position.z - pz;
      const relF = rx * -sy + rz * -cyaw, relR = rx * cyaw + rz * -sy;
      if (Math.hypot(relF, relR) > range) continue;
      ctx.beginPath();
      ctx.arc(c + relR * scale, c - relF * scale, e.gradeKey === 'boss' ? 4 : e.elite ? 2.8 : 2, 0, 7);
      ctx.fillStyle = e.gradeKey === 'boss' ? '#ff4030' : e.gradeKey === 'miniboss' ? '#c060ff'
        : e.elite ? '#5ab0ff' : '#d85a5a';
      ctx.fill();
    }
    ctx.restore();
    // 플레이어 (전방=위 삼각형)
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.moveTo(c, c - 6); ctx.lineTo(c - 4.5, c + 4.5); ctx.lineTo(c + 4.5, c + 4.5);
    ctx.closePath(); ctx.fill();
  }

  update(dt = 0.016) {
    const g = this.game;
    const p = g.player;
    const gate = g.world.gate;

    // 레벨 / 경험치
    const P = g.progression;
    if (P) {
      this.plLevel.textContent = `Lv ${P.level}`;
      this.xpFill.style.width = `${Math.min(100, (P.xp / P.xpNeed()) * 100)}%`;
    }
    this._updateDmgNums(dt);

    // 연속 처치 콤보 표시 (2 이상부터)
    if (g.combo >= 2) {
      const mult = (1 + Math.min(g.combo, 50) * 0.03).toFixed(2);
      this.comboEl.textContent = `${g.combo} 연속! ×${mult}`;
      this.comboEl.style.opacity = Math.min(1, g.comboTimer / 1.5);
      const s = 1 + Math.min(g.combo, 30) * 0.012;
      this.comboEl.style.transform = `scale(${s})`;
      this.comboEl.style.color = g.combo >= 30 ? '#ff5533' : g.combo >= 15 ? '#ff9933' : '#ffcc44';
    } else {
      this.comboEl.style.opacity = 0;
    }

    const gr = gate.hp / gate.maxHp;
    this.castleFill.style.width = `${gr * 100}%`;
    this.castleText.textContent = `${(gr * 100).toFixed(2)}% — ${Math.ceil(gate.hp).toLocaleString()}`;
    if (gate.hp / gate.maxHp < 0.3) this.castleFill.style.background = 'linear-gradient(180deg, #a3352b, #6e1816)';

    // 디아블로식 오브 — 액체가 바닥부터 차오름(height)
    this.hpFill.style.height = `${(p.hp / p.maxHp) * 100}%`;
    this.hpText.textContent = `${Math.ceil(p.hp)}`;
    this.mpFill.style.height = `${(p.mana / p.maxMana) * 100}%`;
    this.mpText.textContent = `${Math.floor(p.mana)}`;

    this.lowhp.style.opacity = p.hp / p.maxHp < 0.3 ? (0.5 + Math.sin(performance.now() / 200) * 0.3) : 0;

    const sg = g.siege;
    this.waveNum.textContent = `공성 ${sg.day}일째`;
    this.enemyCount.textContent = sg.surge
      ? `⚔ 대공세! — 적 ${g.enemies.aliveCount}`
      : `적 ${g.enemies.aliveCount} · 위협 ${sg.threat.toFixed(1)}`;
    this.enemyCount.style.color = sg.surge ? '#ff5544' : '#b85c5c';
    this.goldAmount.textContent = `${Math.floor(g.gold)} G`;

    // Q/E/R/T 슬롯 쿨다운 표시 (슬롯별)
    const sk = g.skills;
    if (sk) {
      for (let i = 0; i < this.skillSlots.length; i++) {
        const slot = this.skillSlots[i];
        const bound = !!sk.bindings[i];
        const cd = sk.slotCd[i] || 0;
        slot.classList.toggle('cooling', cd > 0);
        slot.querySelector('.ammo').textContent = !bound ? '' : cd > 0 ? `${cd.toFixed(1)}s` : '준비';
      }
    }

    // 4방향 위협 표시
    const counts = { N: 0, S: 0, W: 0, E: 0 };
    for (const e of g.enemies.list) {
      if (e.dead) continue;
      const p2 = e.mesh.position;
      if (e.targetGate) {
        if (e.targetGate.z < 0) counts.N++;
        else if (e.targetGate.z > 50) counts.S++;
        else if (e.targetGate.x < 0) counts.W++;
        else counts.E++;
      } else {
        // 플레이어 추적형 — 위치 기준 분류
        if (p2.z < 0) counts.N++; else if (p2.z > 54) counts.S++;
        else if (p2.x < 0) counts.W++; else counts.E++;
      }
    }
    for (const [key, label] of [['N', '북'], ['S', '남'], ['W', '서'], ['E', '동']]) {
      const el = this.dirEls[key];
      const c = counts[key];
      el.textContent = `${label} ${c}`;
      el.style.color = c === 0 ? '#5a5648' : (c >= 15 ? '#ff4433' : '#cc8844');
      el.style.fontWeight = c >= 15 ? '700' : '400';
    }

    // 화살/기름 수량 실시간 반영 (선택 슬롯 강조 포함)
    this.refreshWeaponBar();
    this.drawRadar();
  }
}
