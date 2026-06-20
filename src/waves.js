// 지속 공성 — 웨이브 없음. 성이 버티는 한 전투는 끝나지 않는다.
// 게임 1일 = 300초(실시간 5분). 위협 수준은 공성 일수에 따라 상승.
// 며칠을 버텼는지가 곧 기록 — 매 일차 전환마다 생존 보상·난이도 상승.
// (Phase 3 예정: 위협 수준에 동시 접속자 수 반영)
export const DAY_SECONDS = 300;

// 밤의 변주 — 매 일차 랜덤 1개. 매번 다른 전장을 만든다.
// 배수: spawn 스폰압 / speed 적속도 / gold·xp 보상 / hp 적체력 / rareBoost 희귀확률
export const NIGHT_MODS = [
  { id: 'calm',     name: '고요한 밤',   desc: '특별할 것 없는 밤이다.',                  color: '#9a9a8a' },
  { id: 'bounty',   name: '풍요의 밤',   desc: '쓰러진 적이 두 배의 금화를 토한다.',       color: '#ffd44a', gold: 2 },
  { id: 'bloodmoon',name: '피의 달',     desc: '적이 강해지지만 경험치가 두 배.',          color: '#dd3333', hp: 1.4, xp: 2 },
  { id: 'frost',    name: '혹한의 밤',   desc: '얼어붙은 대지 — 적의 진군이 느리다.',      color: '#88ccff', speed: 0.65 },
  { id: 'frenzy',   name: '광란의 밤',   desc: '적이 빠르고 많다. 콤보를 쌓기엔 좋은 날.', color: '#ff8844', speed: 1.35, spawn: 1.4 },
  { id: 'hunt',     name: '사냥의 밤',   desc: '강력한 변종이 평소보다 자주 출몰한다.',     color: '#a855f7', rareBoost: 4 },
];

export class SiegeManager {
  constructor(game) {
    this.game = game;
    this.elapsed = 0;        // 공성 누적 시간(초) — 세이브로 복원됨
    this.started = false;
    this.spawnTimer = 6;     // 입장 직후 잠깐의 정적
    this.surge = null;       // { until, mult } — 대공세
    this.surgeTimer = 55 + Math.random() * 45;
    this.supplyTimer = 60;   // 보급병 귀환 주기
    this.maxAlive = 70;      // 동시 활성 상한 (성능 보호)
    this.lastDay = 1;        // 일차 전환 감지용
    this.modifier = NIGHT_MODS[0]; // 1일차는 고요한 밤
  }

  get day() { return Math.floor(this.elapsed / DAY_SECONDS) + 1; }
  get threat() { return 1 + (this.day - 1) * 0.28; }

  // 일차 전환 — 생존 보상 + 난이도 상승 + 밤의 변주 (매번 다른 전장)
  onNewDay(d) {
    const bonus = 80 * d;
    this.game.gold += bonus;
    const p = this.game.player;
    p.maxHp += 8; p.hp = p.maxHp; p.maxMana += 4; p.mana = p.maxMana; // 생존자 단련
    // 밤의 변주 선택 (1일차는 항상 고요한 밤)
    this.modifier = d === 1 ? NIGHT_MODS[0] : NIGHT_MODS[1 + ((Math.random() * (NIGHT_MODS.length - 1)) | 0)];
    this.game.ui.banner(`☾ ${d}일째 · ${this.modifier.name} — ${this.modifier.desc}`, this.modifier.color);
    this.game.audio.levelUp();
  }

  // 첫날부터 5종 혼합 — 일차가 지날수록 중장갑 비중 증가
  pickType() {
    const d = this.day;
    const table = [
      ['goblin', 42],
      ['orc', 13 + Math.min(10, d * 2)],
      ['shaman', 7 + Math.min(6, d)],
      ['archer_skel', 7 + Math.min(6, d)], // 해골 궁수 (원거리)
      ['flyer', 6 + Math.min(5, d)],
      ['ogre', d >= 2 ? 4 + Math.min(8, d) : 1.5],
    ];
    let total = 0;
    for (const [, w] of table) total += w;
    let roll = Math.random() * total;
    for (const [t, w] of table) { roll -= w; if (roll <= 0) return t; }
    return 'goblin';
  }

  startSurge() {
    const dirIdx = (Math.random() * 4) | 0;
    const dirName = ['북쪽', '남쪽', '서쪽', '동쪽'][dirIdx];
    this.surge = {
      until: this.elapsed + 50 + Math.random() * 40,
      mult: 2.5 + this.threat * 0.4,
      dirIdx,
    };
    this.game.ui.banner(`⚔ ${dirName}에서 함성이 — 대공세가 시작된다!`, '#dd3333');
    // 보스는 일차가 오를수록 자주, 후반엔 다수
    const bossChance = Math.min(0.95, 0.5 + this.day * 0.1);
    if (this.day >= 2 && Math.random() < bossChance) {
      const n = 1 + Math.floor((this.day - 1) / 4);
      for (let i = 0; i < n; i++) this.game.enemies.spawn('boss', this.day);
    }
  }

  update(dt) {
    if (!this.started) return;
    this.elapsed += dt;
    const E = this.game.enemies;

    // 일차 전환 감지
    if (this.day !== this.lastDay) { this.lastDay = this.day; this.onNewDay(this.day); }

    // 공세 사이클: 평상 압박 ↔ 주기적 대공세
    if (this.surge) {
      if (this.elapsed > this.surge.until) {
        this.surge = null;
        this.surgeTimer = 70 + Math.random() * 70;
        this.game.ui.banner('공세가 잦아든다… 하지만 놈들은 물러나지 않는다.', '#7a8a6a');
      }
    } else {
      this.surgeTimer -= dt;
      if (this.surgeTimer <= 0) this.startSurge();
    }

    // 지속 스폰 (평상: NPC 방어선이 자력으로 버티는 수준 / 공세: 플레이어가 필요한 수준)
    // 동시 상한은 일차가 오를수록 증가 — 후반에도 압박이 식지 않게 (성능 상한 110)
    const cap = Math.min(110, this.maxAlive + (this.day - 1) * 5);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && E.aliveCount < cap) {
      const burst = this.surge ? 1 + Math.round(this.threat) : 1;
      for (let i = 0; i < burst && E.aliveCount < cap; i++) {
        E.spawn(this.pickType(), this.day);
      }
      // 기본 압박 강화 + 밤의 변주(spawn 배수)
      const interval = 1.5 / this.threat / (this.surge ? this.surge.mult : 1) / (this.modifier.spawn || 1);
      this.spawnTimer = interval * (0.7 + Math.random() * 0.6);
    }

    // 보급병 주기 귀환
    this.supplyTimer -= dt;
    if (this.supplyTimer <= 0) {
      this.supplyTimer = 60;
      const s = this.game.npcs.collectSupplies();
      if (s) this.game.ui.banner(`보급대 귀환 — +${s.gold} G · 화살 +${s.arrows}`, '#c9a55a');
    }
  }
}
