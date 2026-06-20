// 오디오 — 디아블로풍 앰비언트 BGM + 전투 SFX (외부 파일 없이 WebAudio 절차 생성)
// BGM: 스산한 바람(변조 노이즈) + 저음 드론 + 간헐적 비명
// SFX: 몬스터 울음/사망 비명, 성문 타격, 활/마법/타격음
export class AmbientAudio {
  constructor() {
    // 사용자 볼륨 (0~1) — 설정에서 조절
    this.vol = { master: 1, ambient: 1, sfx: 1 };
  }

  start() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    // 최종 출력(마스터 볼륨)
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
    const master = ctx.createGain(); // 앰비언트(BGM) 버스
    master.gain.value = 0.2;
    master.connect(this.out);
    this.master = master;
    // SFX 전용 버스 (BGM보다 또렷하게)
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.out);
    this.applyVol();

    // ── 바람: 화이트노이즈 → 밴드패스 + 느린 이중 변조 (세기·음높이가 일렁임)
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf; // SFX에서 재사용
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.45;
    noise.connect(bp); bp.connect(windGain); windGain.connect(master);
    noise.start();

    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.07; // 바람 세기 일렁임 (~14초 주기)
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 0.22;
    lfo1.connect(lfo1Gain); lfo1Gain.connect(windGain.gain);
    lfo1.start();

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.041; // 바람 음높이 흔들림
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 160;
    lfo2.connect(lfo2Gain); lfo2Gain.connect(bp.frequency);
    lfo2.start();

    // ── 저음 드론: 미세하게 어긋난 사인파 (불안한 저류)
    for (const [freq, vol] of [[55, 0.05], [55.6, 0.04], [82.4, 0.015], [110.3, 0.012]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      osc.connect(g); g.connect(master);
      osc.start();
    }

    // ── 간헐적 비명 스케줄
    this._scheduleWail();
  }

  _scheduleWail() {
    const delaySec = 14 + Math.random() * 28;
    this._wailTimer = setTimeout(() => {
      this._wail();
      this._scheduleWail();
    }, delaySec * 1000);
  }

  // 먼 곳의 비명/울부짖음: 하강 글라이드 + 좁은 밴드패스 (사람인지 괴물인지 모를 소리)
  _wail() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const dur = 1.8 + Math.random() * 1.4;
    const startFreq = 280 + Math.random() * 320;

    const osc = ctx.createOscillator();
    osc.type = Math.random() < 0.5 ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.linearRampToValueAtTime(startFreq * 1.15, t + dur * 0.25); // 살짝 치솟았다가
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.45, t + dur);  // 처절하게 잦아듦

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = startFreq;
    bp.Q.value = 7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035 + Math.random() * 0.035, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(bp); bp.connect(g); g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  // 볼륨 적용 (설정 슬라이더에서 호출) — 베이스 게인 × 사용자 비율
  applyVol() {
    if (!this.ctx) return;
    this.out.gain.value = this.vol.master;
    this.master.gain.value = 0.2 * this.vol.ambient;
    this.sfxBus.gain.value = 0.9 * this.vol.sfx;
  }
  setVol(key, v) { this.vol[key] = v; this.applyVol(); }

  stop() {
    clearTimeout(this._wailTimer);
    this.ctx?.close();
    this.ctx = null;
  }

  // ─────────── SFX ───────────
  // 거리 감쇠 (80m 밖은 무음)
  _att(dist = 0) { return Math.max(0, 1 - dist / 80); }

  _noise(dur, vol, filterType = 'bandpass', freq = 800, q = 1, freqEnd = null) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  _tone(type, f0, f1, dur, vol, curve = 'exp') {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    else o.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // 몬스터 으르렁거림 (보스는 깊은 포효)
  growl(dist, deep = false) {
    if (!this.ctx) return;
    const v = this._att(dist) * 0.22;
    if (v < 0.015) return;
    const f0 = deep ? 55 + Math.random() * 25 : 95 + Math.random() * 70;
    this._tone('sawtooth', f0, f0 * (0.75 + Math.random() * 0.2), 0.35 + Math.random() * 0.35, v);
    this._noise(0.3, v * 0.5, 'lowpass', 250, 0.8);
  }

  // 사망 비명 — 작은 놈일수록 높고 찢어지는 소리
  death(dist, scale = 1) {
    if (!this.ctx) return;
    const v = this._att(dist) * 0.3;
    if (v < 0.015) return;
    const f0 = (scale > 2 ? 180 : 380) + Math.random() * 260 / scale;
    this._tone(Math.random() < 0.5 ? 'sawtooth' : 'square', f0, f0 * 0.3, 0.4 + Math.random() * 0.25, v);
    this._noise(0.25, v * 0.7, 'bandpass', f0 * 1.4, 2);
    if (scale > 1.6) this._tone('sine', 70, 32, 0.5, v * 0.9); // 거구가 쓰러지는 진동
  }

  // 성문 타격 — 둔중한 쿵 + 나무 크랙
  gateHit(dist) {
    if (!this.ctx) return;
    const v = this._att(dist) * 0.5;
    if (v < 0.02) return;
    this._tone('sine', 75, 38, 0.22, v);
    this._noise(0.08, v * 0.6, 'highpass', 1400, 0.7);
  }

  // 활 발사 — 시위 퉁 + 화살 바람가르기 (dist: NPC 사격은 거리 감쇠)
  shoot(dist = 0) {
    if (!this.ctx) return;
    const v = this._att(dist);
    if (v < 0.05) return;
    this._tone('triangle', 190, 85, 0.09, 0.25 * v);
    this._noise(0.2, 0.18 * v, 'bandpass', 1500, 1.2, 350);
  }

  // 적중 (살에 박히는 소리)
  hit(dist) {
    if (!this.ctx) return;
    const v = this._att(dist) * 0.22;
    if (v < 0.015) return;
    this._tone('sine', 170, 90, 0.07, v);
    this._noise(0.05, v, 'lowpass', 900, 1);
  }

  // 검 휘두름
  swing() {
    if (!this.ctx) return;
    this._noise(0.14, 0.2, 'bandpass', 900, 1.5, 2200);
  }

  // 폭발 (화염구·기름)
  explosion(dist) {
    if (!this.ctx) return;
    const v = this._att(dist) * 0.55;
    if (v < 0.02) return;
    this._tone('sine', 95, 28, 0.45, v);
    this._noise(0.5, v * 0.8, 'lowpass', 500, 0.7, 120);
  }

  // 플레이어 피격
  hurt() {
    if (!this.ctx) return;
    this._tone('sawtooth', 230, 130, 0.16, 0.3);
  }

  // 레벨업 차임 (상승 2음)
  levelUp() {
    if (!this.ctx) return;
    this._tone('triangle', 440, 660, 0.22, 0.25, 'lin');
    setTimeout(() => this._tone('triangle', 660, 880, 0.3, 0.25, 'lin'), 140);
  }
}
