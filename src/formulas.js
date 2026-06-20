// RPG 공식 — "RPG_공식설계서_Diablo3기반.xlsx" 이식
// 1인칭 성벽 방어 컨셉을 유지하되, 엑셀의 전투/성장 공식 체계를 그대로 적용한다.

// ── 시트9. 몬스터 기초 스탯 (레벨 지수 스케일링) ──
export const MON_BASE = {
  hp: 50, hpGrow: 1.06,
  dmg: 8, dmgGrow: 1.055,
  xp: 10, xpGrow: 1.05,
  gold: 5, goldGrow: 1.04,
};
export function monStat(level) {
  const L = Math.max(1, level);
  return {
    hp: MON_BASE.hp * Math.pow(MON_BASE.hpGrow, L - 1),
    dmg: MON_BASE.dmg * Math.pow(MON_BASE.dmgGrow, L - 1),
    xp: MON_BASE.xp * Math.pow(MON_BASE.xpGrow, L - 1),
    gold: MON_BASE.gold * Math.pow(MON_BASE.goldGrow, L - 1),
  };
}

// ── 시트10. 몬스터 등급 (일반=1.0 기준 배율) ──
export const MON_GRADES = {
  trash:    { name: '일반',     hp: 1,  dmg: 1,   reward: 1,  modifiers: 0, bar: 0xaa1818, label: '#cccccc' },
  champion: { name: '정예',     hp: 3,  dmg: 1.5, reward: 3,  modifiers: 1, bar: 0x4caf50, label: '#4caf50' },
  rare:     { name: '희귀',     hp: 5,  dmg: 2,   reward: 5,  modifiers: 2, bar: 0x3b82f6, label: '#3b82f6' },
  miniboss: { name: '미니보스', hp: 15, dmg: 2.5, reward: 12, modifiers: 3, bar: 0xa855f7, label: '#a855f7' },
  boss:     { name: '보스',     hp: 40, dmg: 3,   reward: 30, modifiers: 4, bar: 0xef4444, label: '#ef4444' },
};
// 일반 스폰 시 등급 추첨 (보스는 대공세에서 별도 스폰)
export function rollMonGrade() {
  const r = Math.random() * 100;
  if (r < 88) return 'trash';
  if (r < 96) return 'champion';
  if (r < 99.3) return 'rare';
  return 'miniboss';
}

// ── 시트12. 난이도 (보통 ~ 고통16) ──
export const DIFFICULTIES = [
  { name: '보통',    hp: 1,    dmg: 1,    xp: 0,     gold: 0,     legend: 0 },
  { name: '어려움',  hp: 2,    dmg: 1.6,  xp: 0.75,  gold: 0,     legend: 0 },
  { name: '전문가',  hp: 3.2,  dmg: 2.2,  xp: 1.0,   gold: 0,     legend: 0 },
  { name: '마스터',  hp: 5,    dmg: 3,    xp: 2.0,   gold: 0,     legend: 0.15 },
  { name: '고통 I',  hp: 8,    dmg: 4,    xp: 3.0,   gold: 3.0,   legend: 0.30 },
  { name: '고통 II', hp: 13,   dmg: 5.5,  xp: 3.5,   gold: 3.5,   legend: 0.45 },
  { name: '고통 III',hp: 21,   dmg: 7.5,  xp: 4.0,   gold: 4.0,   legend: 0.60 },
  { name: '고통 IV', hp: 34,   dmg: 10,   xp: 4.5,   gold: 4.5,   legend: 0.75 },
  { name: '고통 V',  hp: 54,   dmg: 14,   xp: 5.0,   gold: 5.0,   legend: 1.01 },
  { name: '고통 VI', hp: 86,   dmg: 19,   xp: 5.5,   gold: 5.5,   legend: 1.27 },
];

// ── 시트11. 정예 수식어 27종 (정예↑ 등급이 보유) ──
// 대부분 이름표(prefix)로 표현하고, 게임 메커닉에 자연스러운 일부만 실제 효과를 준다.
export const MON_MODIFIERS = [
  '비전 강화', '빙결', '빙결 파동', '속박', '박격포', '역병', '용암', '전기',
  '화염 사슬', '소용돌이', '장벽', '공포', '넉백', '생명력 연결', '보호막',
  '순간이동', '차원문', '뇌우', '독 강화', '궤도', '투사체 감쇠', '환영술사',
  '복수자', '파괴자', '데미지 반사', '빠름', '추가 생명력',
];
// 실제 스탯 효과를 갖는 수식어
export const MOD_EFFECTS = {
  '빠름': { speed: 1.4 },
  '추가 생명력': { hp: 1.5 },
  '파괴자': { hp: 1.8, speed: 0.8 },
  '복수자': { dmg: 1.4 },
};

// ── 시트1. 직업 (게임의 궁수/전사/마법사를 D3 주스탯에 매핑) ──
// 궁수=악마사냥꾼(DEX) · 전사=바바리안(STR) · 마법사=마법사(INT)
export const CLASSES = {
  archer:  { name: '궁수',   mainStat: 'DEX', base: 10, growth: 3, vitBase: 8, vitGrow: 2 },
  warrior: { name: '전사',   mainStat: 'STR', base: 10, growth: 3, vitBase: 9, vitGrow: 2 },
  mage:    { name: '마법사', mainStat: 'INT', base: 10, growth: 3, vitBase: 8, vitGrow: 2 },
};
export function mainStatAt(cls, level) {
  const c = CLASSES[cls] || CLASSES.archer;
  return c.base + (level - 1) * c.growth;
}
export function vitalityAt(cls, level) {
  const c = CLASSES[cls] || CLASSES.archer;
  return c.vitBase + (level - 1) * c.vitGrow;
}

// ── 시트2. 파생 스탯 공식 ──
// 최대 생명력 = (36 + 4×레벨) + 활력 × 활력당계수
export function maxLife(level, vit, vitCoeff = 14) {
  return Math.round((36 + 4 * level) + vit * vitCoeff);
}
// 데미지 배율 = 1 + 주스탯/100
export function statDmgMult(mainStat) { return 1 + mainStat / 100; }

// ── 시트3. 데미지 파이프라인 ──
// 치명타 평균 배율 = 1 + 치명타확률 × 치명타피해 (둘 다 소수)
export function critAvgMult(chc, chd) { return 1 + chc * chd; }
