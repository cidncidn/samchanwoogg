// 상점 — 성 내부 스테이션별로 분리:
//  supply 보급 상인   : 소모품(화살·기름·수리·활력)  ※ 마나수정·무기인챈트·NPC고용 제거
//  hire   용병 고용관  : NPC 궁수·마법사·보급병 고용 전담
//  warrior/archer/mage 직업 사범 : 세부직업 전직 + 레벨별 스킬트리 학습 (해당 직업 전용)
import { CLASSES, subList, isPassive, isUltimate } from './jobs.js';
import { skillIcon } from './icons.js';

const CLASS_NAME = { warrior: '전사', archer: '궁수', mage: '마법사' };

export class Shop {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('shop');
    this.itemsEl = document.getElementById('shop-items');
    this.goldEl = document.getElementById('shop-gold');
    this.titleEl = document.getElementById('shop-title');
    this.lineEl = document.getElementById('shop-line');
    this.nextWaveBtn = document.getElementById('btn-next-wave');
    this.closeBtn = document.getElementById('btn-close-shop');
    this.mode = 'supply';
    this.nextWaveBtn.style.display = 'none';
    this.closeBtn.addEventListener('click', () => this.game.closeShopOverlay());

    this.vitLv = 0;

    // 소모품 (보급 상인)
    this.supplyItems = [
      {
        id: 'arrows', name: '화살 보급 (+100)', desc: '용병의 생명줄. 화살 없는 궁수는 시체다.',
        price: () => 20,
        can: () => this.game.weapons.arrows < this.game.weapons.maxArrows,
        buy: () => { const w = this.game.weapons; w.arrows = Math.min(w.maxArrows, w.arrows + 100); },
        owned: () => `보유 ${Math.floor(this.game.weapons.arrows)} / ${this.game.weapons.maxArrows}`,
      },
      {
        id: 'oil', name: '끓는 기름 (+3)', desc: '성벽 아래 군집을 한 번에 태운다.',
        price: () => 40,
        can: () => this.game.weapons.oil < this.game.weapons.maxOil,
        buy: () => { const w = this.game.weapons; w.oil = Math.min(w.maxOil, w.oil + 3); },
        owned: () => `보유 ${this.game.weapons.oil} / ${this.game.weapons.maxOil}`,
      },
      {
        id: 'repair', name: '수리반 고용', desc: '목수들이 상주하며 성문을 쉼 없이 보수한다 (+15 내구도/초).',
        price: () => 80 + this.game.repairCrews * 50,
        can: () => this.game.repairCrews < 5,
        buy: () => { this.game.repairCrews++; },
        owned: () => `상주 ${this.game.repairCrews} / 5`,
      },
      {
        id: 'vit', name: '강철 같은 의지', desc: '최대 생명력 +30, 재생 +50%.',
        price: () => 60 + this.vitLv * 45,
        can: () => this.vitLv < 5,
        buy: () => { this.vitLv++; const p = this.game.player; p.maxHp += 30; p.hp += 30; p.hpRegen *= 1.5; },
        owned: () => `단련 ${this.vitLv} / 5`,
      },
    ];

    // NPC 고용 (용병 고용관)
    this.hireItems = [
      {
        id: 'archer', name: 'NPC 궁수 고용', desc: '성벽에 배치되어 자동으로 사격하는 노련한 궁수.',
        price: () => 110 + this.game.npcs.archers.length * 35,
        can: () => this.game.npcs.archers.length < this.game.npcs.maxArchers,
        buy: () => this.game.npcs.hireArcher(),
        owned: () => `배치 ${this.game.npcs.archers.length} / ${this.game.npcs.maxArchers}`,
      },
      {
        id: 'mage', name: 'NPC 전투 마법사 고용', desc: '성벽에 상주하며 화염 작렬로 군집을 태우는 마법사.',
        price: () => 160 + this.game.npcs.mages.length * 70,
        can: () => this.game.npcs.mages.length < this.game.npcs.maxMages,
        buy: () => this.game.npcs.hireMage(),
        owned: () => `배치 ${this.game.npcs.mages.length} / ${this.game.npcs.maxMages}`,
      },
      {
        id: 'supplier', name: '보급병 고용', desc: '주기적으로 성 밖에서 물자를 탈취해온다 (60초마다 +25G, 화살 +50).',
        price: () => 90 + this.game.npcs.suppliers * 30,
        can: () => this.game.npcs.suppliers < this.game.npcs.maxSuppliers,
        buy: () => this.game.npcs.hireSupplier(),
        owned: () => `고용 ${this.game.npcs.suppliers} / ${this.game.npcs.maxSuppliers}`,
      },
    ];
  }

  get isMaster() { return this.mode === 'warrior' || this.mode === 'archer' || this.mode === 'mage'; }

  open(mode = 'supply') {
    this.mode = mode;
    const intro = {
      supply: ['보 급 상 인', '"전투 중이라고? 그래서 값을 올려야 하는데… 빨리 골라, 용병!"'],
      hire: ['용 병 고 용 관', '"금화만 있으면 검도 활도 마법도 사다 줄 수 있지. 누구를 성벽에 세울까?"'],
      warrior: ['전 사 사 범', '"검을 들 자격이 있는지 보자. 어떤 길을 걷겠나?"'],
      archer: ['궁 수 사 범', '"활시위의 떨림이 곧 운명이다. 너의 사법(射法)을 정하라."'],
      mage: ['마 법 사 범', '"지식은 값으로 매길 수 없으나… 레벨이 곧 자격이다."'],
    }[mode];
    this.titleEl.textContent = intro[0];
    this.lineEl.textContent = intro[1];
    this.closeBtn.style.display = '';
    this.closeBtn.textContent = '전장 복귀 (G)';
    this.render();
    this.el.classList.add('active');
  }

  close() { this.el.classList.remove('active'); }

  render() {
    this.goldEl.textContent = Math.floor(this.game.gold);
    this.itemsEl.innerHTML = '';
    if (this.mode === 'supply') this._renderItems(this.supplyItems);
    else if (this.mode === 'hire') this._renderItems(this.hireItems);
    else this._renderMaster();
  }

  _renderItems(items) {
    for (const item of items) {
      const price = item.price();
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      const affordable = this.game.gold >= price && item.can();
      btn.disabled = !affordable;
      const nm = typeof item.name === 'function' ? item.name() : item.name;
      const dc = typeof item.desc === 'function' ? item.desc() : item.desc;
      btn.innerHTML = `
        <div class="name">${nm}<span class="price">${price} G</span></div>
        <div class="desc">${dc}</div>
        <div class="owned">${item.owned()}</div>`;
      btn.addEventListener('click', () => {
        if (this.game.gold < price || !item.can()) return;
        this.game.gold -= price;
        item.buy();
        this.game.ui.refreshWeaponBar();
        this.render();
      });
      this.itemsEl.appendChild(btn);
    }
  }

  // 직업 사범 — 전직(세부직업 선택) + 레벨별 스킬트리 학습
  _renderMaster() {
    const sk = this.game.skills;
    // 다른 직업 사범이면 안내만
    if (this.mode !== this.game.playerClass) {
      const info = document.createElement('div');
      info.className = 'shop-item'; info.style.cursor = 'default'; info.style.opacity = '0.8';
      info.innerHTML = `<div class="name">${CLASS_NAME[this.mode]}의 길</div>
        <div class="desc">"너는 ${CLASS_NAME[this.game.playerClass]}다. 이 길은 네 것이 아니다. 너의 사범을 찾아가라."</div>`;
      this.itemsEl.appendChild(info);
      return;
    }

    // ── 전직 (세부직업 선택) ──
    const head = document.createElement('div');
    head.className = 'shop-sec';
    head.textContent = `▣ 전직 — ${CLASS_NAME[this.mode]}의 세부 전문화`;
    this.itemsEl.appendChild(head);
    for (const sub of subList(this.mode)) {
      const cur = sub.key === sk.subKey;
      const btn = document.createElement('button');
      btn.className = 'shop-item' + (cur ? ' sel' : '');
      btn.innerHTML = `
        <div class="name">${sub.name} <span class="role">${sub.role}</span>${cur ? '<span class="price">전직중</span>' : '<span class="price">전직</span>'}</div>
        <div class="desc">▲ ${sub.pros}<br>▼ ${sub.cons}</div>
        <div class="owned">단일 ${sub.scores.single} · 광역 ${sub.scores.aoe} · 생존 ${sub.scores.survive} · 기동 ${sub.scores.mobility} · 유틸 ${sub.scores.util} · 제어 ${sub.scores.control}</div>`;
      btn.addEventListener('click', () => {
        if (cur) return;
        if (sk.setSub(sub.key)) {
          this.game.ui.banner(`전직 — ${CLASS_NAME[this.mode]} · ${sub.name}`, '#b06aff');
          this.render();
        }
      });
      this.itemsEl.appendChild(btn);
    }

    // ── 스킬트리 (마인드맵형 — 위에서 아래로 이어지는 길, 다음 습득 강조) ──
    const lv = this.game.progression.level;
    const list = sk.treeList();
    const nextIdx = list.findIndex((s) => !s.learned); // 현재 익힌 스킬 다음(처음 미습득)
    const sec = document.createElement('div');
    sec.className = 'shop-sec';
    sec.textContent = `▣ ${sk.subDef.name} 스킬트리 — 습득 ${sk.rank}/${sk.skills.length} (현재 Lv${lv})`;
    this.itemsEl.appendChild(sec);

    const tree = document.createElement('div');
    tree.className = 'skill-tree';
    this.itemsEl.appendChild(tree);

    list.forEach((s, i) => {
      const passive = isPassive(s), ult = isUltimate(s);
      const isNext = i === nextIdx;
      let state = s.learned ? 'learned' : (s.unlocked ? 'ready' : 'locked');
      const node = document.createElement('button');
      node.className = `sk-node ${state}` + (passive ? ' passive' : '') + (ult ? ' ult' : '') + (isNext ? ' next' : '');
      node.disabled = !(state === 'ready');
      const tag = passive ? '패시브' : ult ? '궁극기' : s.type;
      const stateLabel = s.learned ? '✔ 습득' : s.unlocked ? '학습' : `Lv${s.lv}`;
      node.innerHTML = `
        <span class="sk-dot">${s.learned ? '●' : s.unlocked ? '○' : '🔒'}</span>
        <span class="sk-ic">${skillIcon(s)}</span>
        <span class="sk-body">
          <span class="sk-name">Lv${s.lv} ${s.name} <em>${tag}</em>${s.coef ? `<b>×${s.coef}</b>` : ''}${isNext ? '<i class="nextbadge">▶ 다음</i>' : ''}</span>
          <span class="sk-eff">${s.effect}${s.cost && s.cost !== '-' ? ` · ${s.cost}` : ''}</span>
        </span>
        <span class="sk-state">${stateLabel}</span>`;
      node.addEventListener('click', () => {
        if (sk.learn(s.name)) {
          this.game.ui.banner(`스킬 습득 — [${s.name}]`, '#66ddff');
          this.game.audio?.levelUp?.();
          this.render();
        }
      });
      tree.appendChild(node);
    });
  }
}
