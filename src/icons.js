// UI용 인라인 SVG 아이콘 세트 — 이모지 대체. currentColor 채움 → 원소별 CSS 색상으로 틴트.
// 직접 제작(코드) 벡터 아이콘. viewBox 24×24.

const svg = (inner) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${inner}</svg>`;
const stroke = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  sword: svg('<path d="M12 2 14 4 14 12.5 10 12.5 10 4Z"/><rect x="7" y="12.5" width="10" height="2" rx="1"/><rect x="11" y="14.5" width="2" height="5"/><circle cx="12" cy="20.5" r="1.6"/>'),
  bow: stroke('<path d="M6.5 3a12 12 0 0 1 0 18"/><path d="M6.5 3v18"/><path d="M4 12h13"/>') .replace('</svg>', '<path d="M17 12 14 9.5 14 14.5Z" fill="currentColor"/></svg>'),
  flask: svg('<rect x="9.3" y="1.5" width="5.4" height="2" rx="1"/><path d="M10 3.5h4v3.2l3.1 8.3a3.6 3.6 0 0 1-3.4 4.9h-3.4a3.6 3.6 0 0 1-3.4-4.9L10 6.7z"/>'),
  fire: svg('<path d="M12 2c1.2 3.2 4 5 4 9a4 4 0 0 1-8 0c0-1 .4-2 1-2.6.3 1 1 1.6 1.6 1.6 0-2.2.5-4.4 1.4-8z"/>'),
  ice: svg('<path d="M12 1.5l2.3 4.4L19 7l-2.9 4 2.9 4-4.7 1.1L12 22.5l-2.3-6.4L5 15l2.9-4L5 7l4.7-1.1z"/>'),
  lightning: svg('<path d="M13.5 2 4 13.5h6l-1.5 8.5 9.5-12.5h-6z"/>'),
  water: svg('<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>'),
  poison: svg('<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/><circle cx="9.6" cy="13.5" r="1.3" fill="rgba(0,0,0,.55)"/><circle cx="14.4" cy="13.5" r="1.3" fill="rgba(0,0,0,.55)"/>'),
  wind: stroke('<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h7a2.6 2.6 0 1 1-2.6 2.6"/><path d="M3 18h5"/>'),
  earth: svg('<path d="M2 20 9 7.5l3.5 5.5 3-4L22 20z"/>'),
  arcane: svg('<path d="M12 2l1.7 7.6L21 11l-7.3 1.4L12 20l-1.7-7.6L3 11l7.3-1.4z"/>'),
  holy: svg('<circle cx="12" cy="12" r="4.4"/>') .replace('</svg>', '<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"/></g></svg>'),
  curse: svg('<path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 4.6 3 5.6V19h2v-2h1.4v2h1.2v-2H17v-1.4c1.5-1 3-2.6 3-5.6a8 8 0 0 0-8-8z"/><circle cx="9" cy="10.6" r="1.7" fill="rgba(0,0,0,.6)"/><circle cx="15" cy="10.6" r="1.7" fill="rgba(0,0,0,.6)"/>'),
  slash: svg('<path d="M3.5 20.5C9.5 17 15.5 11 21 2.5c-3 9-9 15.5-16.5 19z"/>'),
  burst: svg('<path d="M12 2l2 5.5 5.5-2-2 5.5 5.5 2-5.5 2 2 5.5-5.5-2-2 5.5-2-5.5-5.5 2 2-5.5L4.5 10.5 10 8.5z"/>'),
  snare: stroke('<circle cx="8" cy="8" r="3.4"/><circle cx="16" cy="16" r="3.4"/><path d="M10.4 10.4l3.2 3.2"/>'),
  shield: svg('<path d="M12 2l8 3v6c0 5-3.4 8.8-8 11-4.6-2.2-8-6-8-11V5z"/>'),
  dash: stroke('<path d="M4 5l7 7-7 7"/><path d="M12 5l7 7-7 7"/>'),
  arrow: stroke('<path d="M4 20 17 7"/><path d="M12 7h5v5"/>') .replace('</svg>', '<path d="M4 20l1.4-4.4L8.4 18.6Z" fill="currentColor" stroke="none"/></svg>'),
  paw: svg('<circle cx="7" cy="8" r="1.8"/><circle cx="12" cy="6.4" r="1.9"/><circle cx="17" cy="8" r="1.8"/><circle cx="9.4" cy="11" r="1.5"/><circle cx="14.6" cy="11" r="1.5"/><path d="M12 12.2c-3 0-5.2 2-5.2 4.4S9 21 12 21s5.2-2 5.2-4.4S15 12.2 12 12.2z"/>'),
  star: svg('<path d="M12 2l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 16.9 6.1 20.3l1.7-6.6L2.6 8.8l6.8-.5z"/>'),
  rune: stroke('<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M9 7l6 10M15 7 9 17M8 12h8"/>'),
};

// 원소 → UI 색
export const ELEM_COLOR = {
  fire: '#ff7a3a', ice: '#7ec8ff', lightning: '#cdb8ff', poison: '#9ad94a', water: '#4aa8ff',
  wind: '#aef0d6', earth: '#d2a35a', arcane: '#c98aff', holy: '#ffe07a', curse: '#b86adf', none: '#dcc9a0',
};

// 스킬 이름에서 원소 추론 (skills.js의 분류와 동일 계열)
export function elementOf(name = '') {
  if (/화염|불|화상|연소|화산|인페르노|메테오|운석/.test(name)) return 'fire';
  if (/냉기|얼음|빙결|서리|눈보라|빙하|동상|영도|결빙|서리/.test(name)) return 'ice';
  if (/전격|번개|감전|뇌전|낙뢰|천둥|폭풍우|과부하|전도|신뢰/.test(name)) return 'lightning';
  if (/독|맹독|중독|역병|출혈|유혈/.test(name)) return 'poison';
  if (/물줄기|수압|해일|소용돌이|대해일|심해|치유의 물|정화의 비/.test(name)) return 'water';
  if (/바람|질풍|돌풍|회오리|폭풍의 눈|토네이도|칼바람|태풍|순풍|표류/.test(name)) return 'wind';
  if (/돌팔매|바위|지진|석화|대지|산사태|대붕괴|지각|견고|운석 낙하/.test(name)) return 'earth';
  if (/저주|약화|쇠약|침묵|절망|죽음의 표식|종말|흑마법/.test(name)) return 'curse';
  if (/보호막|신속|가속|축복|오라|결계|강림|영웅|지원술사|결속/.test(name)) return 'holy';
  if (/비전|마력|에너지/.test(name)) return 'arcane';
  return 'none';
}

const span = (key, el) => `<span class="ic ic-${el}">${ICONS[key] || ICONS.arcane}</span>`;

// 스킬 → 아이콘 (원소 우선, 없으면 유형)
export function skillIcon(s) {
  if (!s) return span('arcane', 'none');
  const el = elementOf(s.name);
  if (s.type === '궁극기') return span('star', el);
  if (s.type === '패시브') return span('rune', el);
  if (el !== 'none' && el !== 'arcane') return span(ICONS[el] ? el : 'arcane', el);
  const byType = { 제어: 'snare', 버프: 'shield', 디버프: 'curse', 이동: 'dash', 원거리: 'arrow', 광역: 'burst', 소환: 'paw' };
  const key = byType[s.type] || (el === 'arcane' ? 'arcane' : 'slash');
  return span(key, el);
}

// 무기 → 아이콘 (spell은 전직 원소)
const ELEM_KEY = { fire: 'fire', ice: 'ice', lightning: 'lightning', water: 'water', wind: 'wind', earth: 'earth', holy: 'holy', curse: 'curse', poison: 'poison', arcane: 'arcane' };
export function weaponIcon(w, element = 'arcane') {
  if (!w) return '';
  if (w.id === 'bow') return span('bow', 'none');
  if (w.id === 'sword') return span('sword', 'none');
  if (w.id === 'oil') return span('flask', 'fire');
  if (w.id === 'spell') { const k = ELEM_KEY[element] || 'arcane'; return span(k, element); }
  return span('arcane', 'none');
}
