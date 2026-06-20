// 절차 생성 텍스처 — 외부 에셋 없이 캔버스로 석벽·나무·흙 질감 생성
import * as THREE from 'three';

function makeTex(draw, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  // 같은 캔버스로 범프맵(선형 공간) 생성 — 어두운 부분이 패인 효과
  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

function noise(x, s, n, alphaMax, color = '0,0,0') {
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(${color},${Math.random() * alphaMax})`;
    x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// 석벽: 어긋난 벽돌 패턴 + 명암 편차 + 풍화 노이즈
export function stoneTexture(repeatX, repeatY, base = 46) {
  const t = makeTex((x, s) => {
    x.fillStyle = '#26221d'; // 모르타르(줄눈)
    x.fillRect(0, 0, s, s);
    const bh = s / 8, bw = s / 4;
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 5; col++) {
        const l = base - 12 + Math.random() * 22;
        x.fillStyle = `hsl(${28 + Math.random() * 14}, ${7 + Math.random() * 7}%, ${l}%)`;
        x.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
        // 돌 표면 얼룩
        for (let k = 0; k < 5; k++) {
          x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
          x.beginPath();
          x.ellipse(col * bw + off + Math.random() * bw, row * bh + Math.random() * bh,
            4 + Math.random() * 14, 3 + Math.random() * 8, Math.random() * 3, 0, 7);
          x.fill();
        }
      }
    }
    noise(x, s, 9000, 0.14);
    noise(x, s, 2500, 0.07, '255,250,240');
  });
  t.map.repeat.set(repeatX, repeatY);
  t.bump.repeat.set(repeatX, repeatY);
  return t;
}

// 나무: 세로 판자 + 나뭇결 + 옹이 + 못
export function woodTexture(repeatX = 1, repeatY = 1) {
  const t = makeTex((x, s) => {
    const pw = s / 6;
    for (let p = 0; p < 6; p++) {
      const l = 16 + Math.random() * 9;
      x.fillStyle = `hsl(${22 + Math.random() * 8}, ${30 + Math.random() * 12}%, ${l}%)`;
      x.fillRect(p * pw, 0, pw, s);
      // 나뭇결 (세로 흐름선)
      for (let g = 0; g < 14; g++) {
        x.strokeStyle = `rgba(10,5,0,${0.15 + Math.random() * 0.25})`;
        x.lineWidth = 1 + Math.random() * 1.5;
        x.beginPath();
        let gx = p * pw + Math.random() * pw;
        x.moveTo(gx, 0);
        for (let y = 0; y <= s; y += 32) {
          gx += (Math.random() - 0.5) * 7;
          gx = Math.max(p * pw + 2, Math.min(p * pw + pw - 2, gx));
          x.lineTo(gx, y);
        }
        x.stroke();
      }
      // 옹이
      if (Math.random() < 0.7) {
        const kx = p * pw + pw * (0.3 + Math.random() * 0.4), ky = Math.random() * s;
        for (let r = 9; r > 1; r -= 2) {
          x.strokeStyle = `rgba(15,8,2,${0.4})`;
          x.beginPath(); x.ellipse(kx, ky, r, r * 1.6, 0, 0, 7); x.stroke();
        }
      }
      // 판자 경계
      x.fillStyle = 'rgba(0,0,0,0.55)';
      x.fillRect(p * pw - 1, 0, 3, s);
      // 못
      x.fillStyle = '#1a1a1c';
      x.beginPath(); x.arc(p * pw + pw / 2, 26, 4, 0, 7); x.fill();
      x.beginPath(); x.arc(p * pw + pw / 2, s - 26, 4, 0, 7); x.fill();
    }
    noise(x, s, 4000, 0.1);
  });
  t.map.repeat.set(repeatX, repeatY);
  t.bump.repeat.set(repeatX, repeatY);
  return t;
}

// 흙바닥: 어두운 흙 + 풀 얼룩 + 자갈
export function groundTexture(repeatX = 40, repeatY = 40) {
  const t = makeTex((x, s) => {
    x.fillStyle = '#2b2a20';
    x.fillRect(0, 0, s, s);
    // 큰 얼룩 (풀밭/맨땅 편차)
    for (let i = 0; i < 40; i++) {
      const g = x.createRadialGradient(
        Math.random() * s, Math.random() * s, 0,
        Math.random() * s, Math.random() * s, 30 + Math.random() * 80
      );
      const dark = Math.random() < 0.5;
      g.addColorStop(0, dark ? 'rgba(18,20,12,0.5)' : 'rgba(52,54,38,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    }
    // 자갈
    for (let i = 0; i < 350; i++) {
      const l = 18 + Math.random() * 20;
      x.fillStyle = `hsl(${30 + Math.random() * 20}, 8%, ${l}%)`;
      x.beginPath();
      x.ellipse(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, 7);
      x.fill();
    }
    noise(x, s, 12000, 0.12);
  }, 512);
  t.map.repeat.set(repeatX, repeatY);
  t.bump.repeat.set(repeatX, repeatY);
  return t;
}
