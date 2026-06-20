// 희귀도 — 아이템·스킬(6등급)과 몬스터(9수식어) 공용 정의
// 색상 팔레트는 디아블로/PoE/가챠 관례를 따른다.

// 아이템·스킬 등급 (C → UR)
export const RARITY = [
  { key: 'C',   name: '일반',   color: '#b8b8b8' }, // 흰
  { key: 'UC',  name: '고급',   color: '#4caf50' }, // 녹
  { key: 'R',   name: '희귀',   color: '#3b82f6' }, // 파
  { key: 'SR',  name: '영웅',   color: '#a855f7' }, // 보라
  { key: 'SSR', name: '전설',   color: '#ffd44a' }, // 노랑
  { key: 'UR',  name: '신화',   color: '#ef4444' }, // 빨강
];

// 몬스터 리젠 희귀도 — 확률(%)·수식어·능력치 배수·크기·라벨색
// elite(발생확률 5% 이하): 이름표시 + HP바/이름에 색. 몸체 색은 항상 원래대로 유지.
// 합계 99.00101% 이며 나머지는 '평범한'으로 흡수(누적 롤)
export const MONSTER_RARITY = [
  { p: 75,      name: '평범한',   hp: 1,    dmg: 1,   gold: 1,  xp: 1,  scale: 1,    elite: false, bar: 0xaa1818 },
  { p: 12,      name: '무서운',   hp: 1.4,  dmg: 1.2, gold: 1.6, xp: 1.6, scale: 1.05, elite: false, bar: 0xaa1818 },
  { p: 5,       name: '지독한',   hp: 1.9,  dmg: 1.4, gold: 2.2, xp: 2.2, scale: 1.1,  elite: true,  bar: 0x3fa83f, label: '#4caf50' },
  { p: 3,       name: '어두운',   hp: 2.6,  dmg: 1.7, gold: 3,  xp: 3,  scale: 1.18, elite: true,  bar: 0x3b6fe0, label: '#3b82f6' },
  { p: 2,       name: '보기드문', hp: 3.5,  dmg: 2,   gold: 4,  xp: 4,  scale: 1.25, elite: true,  bar: 0xa050e0, label: '#a855f7' },
  { p: 1,       name: '잔인한',   hp: 5,    dmg: 2.5, gold: 6,  xp: 6,  scale: 1.35, elite: true,  bar: 0xd03a80, label: '#ec4899' },
  { p: 1,       name: '군림하는', hp: 7,    dmg: 3,   gold: 9,  xp: 9,  scale: 1.5,  elite: true,  bar: 0xff9020, label: '#ffd44a' },
  { p: 0.001,   name: '최악의',   hp: 14,   dmg: 4.5, gold: 25, xp: 25, scale: 1.8,  elite: true,  bar: 0xff2010, label: '#ef4444' },
  { p: 0.00001, name: '고대의',   hp: 30,   dmg: 7,   gold: 80, xp: 80, scale: 2.2,  elite: true,  bar: 0xff0000, label: '#ff2222' },
];

// 확률표에 따라 몬스터 희귀도 1개 추첨 (희귀할수록 강함)
export function rollMonsterRarity() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const tier of MONSTER_RARITY) {
    acc += tier.p;
    if (roll < acc) return tier;
  }
  return MONSTER_RARITY[0]; // 잔여 확률은 평범한으로 흡수
}
