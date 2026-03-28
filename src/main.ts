// ── AIT (리더보드 + 전면광고, 토스 앱 환경에서만 동작) ──────────────────────────────
const AIT_AD_GROUP_ID = 'ait.v2.live.fb0c3b1cbf34487a';

type AitModule = {
  submitGameCenterLeaderBoardScore: typeof import('@apps-in-toss/web-framework').submitGameCenterLeaderBoardScore;
  openGameCenterLeaderboard: typeof import('@apps-in-toss/web-framework').openGameCenterLeaderboard;
  loadFullScreenAd: typeof import('@apps-in-toss/web-framework').loadFullScreenAd;
  showFullScreenAd: typeof import('@apps-in-toss/web-framework').showFullScreenAd;
  generateHapticFeedback: typeof import('@apps-in-toss/web-framework').generateHapticFeedback;
};
let ait: AitModule | null = null;
let aitAdLoaded = false;

import('@apps-in-toss/web-framework').then((m) => {
  ait = {
    submitGameCenterLeaderBoardScore: m.submitGameCenterLeaderBoardScore,
    openGameCenterLeaderboard: m.openGameCenterLeaderboard,
    loadFullScreenAd: m.loadFullScreenAd,
    showFullScreenAd: m.showFullScreenAd,
    generateHapticFeedback: m.generateHapticFeedback,
  };
  document.getElementById('leaderboardBtn')!.style.display = 'block';
  preloadAitAd();
}).catch(() => {});

function preloadAitAd() {
  if (!ait) return;
  aitAdLoaded = false;
  ait.loadFullScreenAd({
    options: { adGroupId: AIT_AD_GROUP_ID },
    onEvent: () => { aitAdLoaded = true; },
    onError: () => { aitAdLoaded = false; },
  });
}

// ── AdMob ────────────────────────────────────────────────────────────────────
const ADMOB_INTERSTITIAL_ID = 'ca-app-pub-4557219410513767/2140145076';
type AdMobType = typeof import('@capacitor-community/admob').AdMob;
type InterstitialEventsType = typeof import('@capacitor-community/admob').InterstitialAdPluginEvents;
let AdMobPlugin: AdMobType | null = null;
let InterstitialEvents: InterstitialEventsType | null = null;
import('@capacitor-community/admob').then((m) => {
  AdMobPlugin = m.AdMob;
  InterstitialEvents = m.InterstitialAdPluginEvents;
  AdMobPlugin.initialize({ requestTrackingAuthorization: false }).then(() => preloadAd()).catch(() => {});
}).catch(() => {});

// ── Color ─────────────────────────────────────────────────────────────────────
const COLORS = ['#000000', '#FF2D78', '#00F0FF', '#39FF14', '#FFE600', '#BF00FF', '#FF6B00'];
let colorIdx = 0;
let gameColor = COLORS[0];

function colorWithAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function fgAlpha(a: number) { return colorWithAlpha(gameColor, a); }
function bgAlpha(a: number) { return `rgba(255,255,255,${a})`; }

function applyColor() {
  document.documentElement.style.setProperty('--game-color', gameColor);
}

// ── Canvas ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx    = canvas.getContext('2d')!;
let W: number, H: number, GH: number, CH: number;

function resize() {
  W  = canvas.width  = window.innerWidth;
  H  = canvas.height = window.innerHeight;
  GH = Math.floor(H * 0.6);
  CH = H - GH;
}
resize();
window.addEventListener('resize', resize);

// ── State ────────────────────────────────────────────────────────────────────
const S = { INTRO: 0, ZOOM: 1, PLAY: 2, DEAD: 3, OVER: 4 } as const;
type GameState = typeof S[keyof typeof S];
let state: GameState = S.INTRO;

// ── Utilities ────────────────────────────────────────────────────────────────
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const rand    = (a: number, b: number) => a + Math.random() * (b - a);
const clamp   = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function ptSegDist(x1: number, y1: number, x2: number, y2: number, px: number, py: number) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── Obstacles ────────────────────────────────────────────────────────────────
type DotObs   = { k: 'dot';   x: number; y: number; r: number;  vx: number; vy: number };
type LineObs  = { k: 'line';  x1: number; y1: number; x2: number; y2: number; lw: number; vx: number; vy: number };
type CrossObs = { k: 'cross'; x: number; y: number; size: number; vx: number; vy: number };
type Obs = DotObs | LineObs | CrossObs;

let obstacles: Obs[] = [];
let spawnDir: 'left' | 'top' | 'right' | 'bottom' = 'left';

function makeObs(fullH: boolean, dir: 'left' | 'top' | 'right' | 'bottom' = 'left'): Obs | Obs[] {
  const aH   = fullH ? H : GH;
  const pad  = 35;
  const diff = fullH ? 0 : Math.min(score / 100, 4);
  const earlyEase = score < 30 ? 0.8 : 1.0;
  const graceMult = 1 - dirChangeGrace * 0.35; // grace 중 최대 35% 속도 감소
  const spd  = rand((5.5 + diff * 2.2) * earlyEase * graceMult, (8 + diff * 2.2) * earlyEase * graceMult);

  if (dir === 'top') {
    // 위에서 아래로
    const x = rand(pad, W - pad);
    const types = ['dot_s', 'dot_l', 'lv_s', 'lv_l', 'diag_s', 'cross'] as const;
    const type  = types[Math.floor(Math.random() * types.length)];
    switch (type) {
      case 'dot_s':  return { k: 'dot',  x, y: -20, r: rand(4, 8),   vx: 0, vy: spd };
      case 'dot_l':  return { k: 'dot',  x, y: -30, r: rand(11, 20), vx: 0, vy: spd };
      case 'lv_s':   { const h = rand(20, 45); return { k: 'line', x1: x, y1: -h, x2: x, y2: h, lw: 2, vx: 0, vy: spd }; }
      case 'lv_l':   { const h = rand(55, 100); return { k: 'line', x1: x, y1: -h, x2: x, y2: h, lw: 2, vx: 0, vy: spd }; }
      case 'diag_s': { const h = rand(20, 35); return { k: 'line', x1: x - h, y1: -h, x2: x + h, y2: h, lw: 2, vx: 0, vy: spd }; }
      case 'cross':  return { k: 'cross', x, y: -20, size: rand(14, 24), vx: 0, vy: spd };
    }
  }

  if (dir === 'bottom') {
    // 아래에서 위로
    const x = rand(pad, W - pad);
    const types = ['dot_s', 'dot_l', 'lv_s', 'lv_l', 'diag_s', 'cross'] as const;
    const type  = types[Math.floor(Math.random() * types.length)];
    switch (type) {
      case 'dot_s':  return { k: 'dot',  x, y: GH + 20, r: rand(4, 8),   vx: 0, vy: -spd };
      case 'dot_l':  return { k: 'dot',  x, y: GH + 30, r: rand(11, 20), vx: 0, vy: -spd };
      case 'lv_s':   { const h = rand(20, 45); return { k: 'line', x1: x, y1: GH + h, x2: x, y2: GH - h, lw: 2, vx: 0, vy: -spd }; }
      case 'lv_l':   { const h = rand(55, 100); return { k: 'line', x1: x, y1: GH + h, x2: x, y2: GH - h, lw: 2, vx: 0, vy: -spd }; }
      case 'diag_s': { const h = rand(20, 35); return { k: 'line', x1: x - h, y1: GH + h, x2: x + h, y2: GH - h, lw: 2, vx: 0, vy: -spd }; }
      case 'cross':  return { k: 'cross', x, y: GH + 20, size: rand(14, 24), vx: 0, vy: -spd };
    }
  }

  if (dir === 'right') {
    // 왼쪽에서 오른쪽으로
    const y    = rand(pad, aH - pad);
    const types = ['dot_s', 'dot_l', 'lh_s', 'lh_l', 'lv_s', 'lv_l', 'diag_s', 'diag_l', 'cross', 'lh_gap'] as const;
    const type  = types[Math.floor(Math.random() * types.length)];
    switch (type) {
      case 'dot_s':  return { k: 'dot',  x: -20, y, r: rand(4, 8),   vx: spd, vy: 0 };
      case 'dot_l':  return { k: 'dot',  x: -30, y, r: rand(11, 20), vx: spd, vy: 0 };
      case 'lh_s':   return { k: 'line', x1: -10 - rand(25, 55),  y1: y, x2: -10, y2: y, lw: 2, vx: spd, vy: 0 };
      case 'lh_l':   return { k: 'line', x1: -10 - rand(90, 160), y1: y, x2: -10, y2: y, lw: 2, vx: spd, vy: 0 };
      case 'lv_s':   { const h = rand(22, 45);  return { k: 'line', x1: -8, y1: y - h, x2: -8, y2: y + h, lw: 2, vx: spd, vy: 0 }; }
      case 'lv_l':   { const h = rand(55, 100); return { k: 'line', x1: -8, y1: y - h, x2: -8, y2: y + h, lw: 2, vx: spd, vy: 0 }; }
      case 'diag_s': { const h = rand(20, 38);  return { k: 'line', x1: -10 - h * 2, y1: y - h, x2: -10, y2: y + h, lw: 2, vx: spd, vy: 0 }; }
      case 'diag_l': { const h = rand(45, 80);  return { k: 'line', x1: -10 - h * 2, y1: y - h, x2: -10, y2: y + h, lw: 2, vx: spd, vy: 0 }; }
      case 'cross':  return { k: 'cross', x: -20, y, size: rand(14, 26), vx: spd, vy: 0 };
      case 'lh_gap': {
        const gapCenter = rand(aH * 0.2, aH * 0.8);
        const gapSize   = rand(28, 45);
        const len = rand(60, 130);
        return [
          { k: 'line', x1: -10 - len, y1: 0,              x2: -10, y2: gapCenter - gapSize, lw: 2, vx: spd, vy: 0 },
          { k: 'line', x1: -10 - len, y1: gapCenter + gapSize, x2: -10, y2: aH,             lw: 2, vx: spd, vy: 0 },
        ] as Obs[];
      }
    }
  }

  // 오른쪽에서 왼쪽으로 (기본 'left')
  const y    = rand(pad, aH - pad);
  const types = ['dot_s', 'dot_l', 'lh_s', 'lh_l', 'lv_s', 'lv_l', 'diag_s', 'diag_l', 'cross', 'lh_gap'] as const;
  const type  = types[Math.floor(Math.random() * types.length)];

  switch (type) {
    case 'dot_s':  return { k: 'dot',  x: W + 20, y, r: rand(4, 8),   vx: -spd, vy: 0 };
    case 'dot_l':  return { k: 'dot',  x: W + 30, y, r: rand(11, 20), vx: -spd, vy: 0 };
    case 'lh_s':   return { k: 'line', x1: W + 10, y1: y, x2: W + 10 + rand(25, 55),  y2: y, lw: 2, vx: -spd, vy: 0 };
    case 'lh_l':   return { k: 'line', x1: W + 10, y1: y, x2: W + 10 + rand(90, 160), y2: y, lw: 2, vx: -spd, vy: 0 };
    case 'lv_s':   { const h = rand(22, 45);  return { k: 'line', x1: W + 8, y1: y - h, x2: W + 8, y2: y + h, lw: 2, vx: -spd, vy: 0 }; }
    case 'lv_l':   { const h = rand(55, 100); return { k: 'line', x1: W + 8, y1: y - h, x2: W + 8, y2: y + h, lw: 2, vx: -spd, vy: 0 }; }
    case 'diag_s': { const h = rand(20, 38);  return { k: 'line', x1: W + 10, y1: y - h, x2: W + 10 + h * 2, y2: y + h, lw: 2, vx: -spd, vy: 0 }; }
    case 'diag_l': { const h = rand(45, 80);  return { k: 'line', x1: W + 10, y1: y - h, x2: W + 10 + h * 2, y2: y + h, lw: 2, vx: -spd, vy: 0 }; }
    case 'cross':  return { k: 'cross', x: W + 20, y, size: rand(14, 26), vx: -spd, vy: 0 };
    case 'lh_gap': {
      // 통로 있는 두 줄짜리 장애물 (통로가 좁아서 까다로움)
      const gapCenter = rand(aH * 0.2, aH * 0.8);
      const gapSize   = rand(28, 45);
      const len = rand(60, 130);
      return [
        { k: 'line', x1: W + 10, y1: 0,              x2: W + 10 + len, y2: gapCenter - gapSize, lw: 2, vx: -spd, vy: 0 },
        { k: 'line', x1: W + 10, y1: gapCenter + gapSize, x2: W + 10 + len, y2: aH,             lw: 2, vx: -spd, vy: 0 },
      ] as Obs[];
    }
  }
}

function updateObs() {
  for (const o of obstacles) {
    if (o.k === 'dot' || o.k === 'cross') {
      o.x += o.vx; o.y += o.vy;
    } else {
      o.x1 += o.vx; o.x2 += o.vx;
      o.y1 += o.vy; o.y2 += o.vy;
    }
  }
  obstacles = obstacles.filter(o => {
    if (o.k === 'dot' || o.k === 'cross') return o.x > -200 && o.y < GH + 200 && o.x < W + 200 && o.y > -200;
    return Math.min(o.x1, o.x2) > -200 && Math.max(o.x1, o.x2) < W + 200 && Math.min(o.y1, o.y2) > -200 && Math.max(o.y1, o.y2) < GH + 200;
  });
}

function drawObs() {
  ctx.fillStyle = ctx.strokeStyle = gameColor;
  for (const o of obstacles) {
    if (o.k === 'dot') {
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    } else if (o.k === 'line') {
      ctx.lineWidth = o.lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
    } else {
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o.x - o.size, o.y); ctx.lineTo(o.x + o.size, o.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o.x, o.y - o.size); ctx.lineTo(o.x, o.y + o.size); ctx.stroke();
    }
  }
}

function collidesObs(dot: { x: number; y: number; r: number }, o: Obs): boolean {
  if (o.k === 'dot')  return Math.hypot(dot.x - o.x, dot.y - o.y) < dot.r + o.r;
  if (o.k === 'line') return ptSegDist(o.x1, o.y1, o.x2, o.y2, dot.x, dot.y) < dot.r + o.lw / 2 + 1;
  // cross: check both arms
  const d1 = ptSegDist(o.x - o.size, o.y, o.x + o.size, o.y, dot.x, dot.y);
  const d2 = ptSegDist(o.x, o.y - o.size, o.x, o.y + o.size, dot.x, dot.y);
  return Math.min(d1, d2) < dot.r + 1.5;
}

// ── Screen Shake + Direction Change ──────────────────────────────────────────
let shakeIntensity = 0;
let shakeX = 0, shakeY = 0;
let gameTime = 0;
let nextDirChange = 15; // 첫 방향 전환까지 15초
let dirChangeGrace = 0; // 방향전환 직후 난이도 완화 (1→0으로 감소)
let dirHintAlpha = 0;

function updateShake(dt: number) {
  if (shakeIntensity > 0) {
    shakeIntensity = Math.max(0, shakeIntensity - dt * 1.2);
    const mag = shakeIntensity * 28;
    shakeX = (Math.random() - 0.5) * mag;
    shakeY = (Math.random() - 0.5) * mag;
  } else {
    shakeX = 0; shakeY = 0;
  }
}

function triggerDirChange() {
  shakeIntensity = 1;
  const dirs = (['left', 'top', 'right', 'bottom'] as const).filter(d => d !== spawnDir);
  spawnDir = dirs[Math.floor(Math.random() * dirs.length)];
  obstacles = []; // 기존 장애물 클리어
  dirChangeGrace = 1.0; // 3초 난이도 완화 시작
  dirHintAlpha = 1;
  // 색상 전환
  colorIdx = (colorIdx + 1) % COLORS.length;
  gameColor = COLORS[colorIdx];
  applyColor();
  ait?.generateHapticFeedback({ type: 'wiggle' });
  const pulseEl = document.getElementById('dirPulse')!;
  pulseEl.classList.remove('pulse');
  void (pulseEl as HTMLElement).offsetWidth; // reflow
  pulseEl.classList.add('pulse');
}

// ── Auto-pilot ───────────────────────────────────────────────────────────────
const auto = {
  x: 0, y: 0, r: 6, vx: 0, vy: 0,
  reset() { this.x = W * 0.35; this.y = H * 0.5; this.vx = 0; this.vy = 0; },
  update() {
    let fx = 0, fy = 0;
    const sense = 160;
    for (const o of obstacles) {
      let cx: number, cy: number;
      if (o.k === 'dot' || o.k === 'cross') { cx = o.x; cy = o.y; }
      else {
        const dx = o.x2 - o.x1, dy = o.y2 - o.y1, l2 = dx * dx + dy * dy;
        const t = clamp(((this.x - o.x1) * dx + (this.y - o.y1) * dy) / l2, 0, 1);
        cx = o.x1 + t * dx; cy = o.y1 + t * dy;
      }
      const ddx = this.x - cx, ddy = this.y - cy;
      const d = Math.hypot(ddx, ddy);
      if (d < sense && d > 0) {
        const f = Math.pow((sense - d) / sense, 2) * 10;
        fx += (ddx / d) * f; fy += (ddy / d) * f;
      }
    }
    fx += (W * 0.35 - this.x) * 0.004;
    fy += (H * 0.5  - this.y) * 0.004;
    const bp = 70;
    if (this.x < bp)   fx += (bp - this.x) * 0.1;
    if (this.x > W-bp) fx -= (this.x - (W - bp)) * 0.1;
    if (this.y < bp)   fy += (bp - this.y) * 0.1;
    if (this.y > H-bp) fy -= (this.y - (H - bp)) * 0.1;
    this.vx = (this.vx + fx) * 0.82;
    this.vy = (this.vy + fy) * 0.82;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 5) { this.vx = this.vx / spd * 5; this.vy = this.vy / spd * 5; }
    this.x += this.vx; this.y += this.vy;
  },
};

// ── Player ───────────────────────────────────────────────────────────────────
const player = { x: 0, y: 0, r: 6 };

function getPlayerR(): number {
  if (score < 80)  return 6;
  if (score < 200) return 8;
  if (score < 380) return 10;
  if (score < 600) return 12;
  return 14;
}

function resetPlayer() { player.x = W * 0.35; player.y = GH * 0.5; player.r = 6; }

// ── Particles ────────────────────────────────────────────────────────────────
type Particle = { x: number; y: number; vx: number; vy: number; r: number; life: number; decay: number };
let particles: Particle[] = [];

function explode(x: number, y: number) {
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * Math.PI * 2, spd = rand(1, 7);
    particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: rand(1, 3), life: 1, decay: rand(0.012, 0.025) });
  }
}
function updateParticles() {
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.18; p.vx *= 0.96; p.vy *= 0.96;
    p.life -= p.decay;
  }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles() {
  ctx.fillStyle = gameColor;
  for (const p of particles) {
    ctx.globalAlpha = p.life * p.life;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Score ─────────────────────────────────────────────────────────────────────
let score = 0, scoreF = 0;
const scoreEl = document.getElementById('score')!;
function tickScore(dt: number) {
  const diff = Math.min(score / 100, 4);
  scoreF += (3 + diff * 2) * dt * 60 / 100;
  score = Math.floor(scoreF);
  scoreEl.textContent = score + 'm';
}

// ── Obstacle Spawner ─────────────────────────────────────────────────────────
let obsTimer = 0, introObsTimer = 0;
function spawnTick(dt: number) {
  if (dirChangeGrace > 0) dirChangeGrace = Math.max(0, dirChangeGrace - dt / 3);
  const diff = Math.min(score / 100, 4);
  const baseInterval = score < 30
    ? Math.max(0.25, 1.2 - diff * 0.42)
    : Math.max(0.14, 1.0 - diff * 0.42);
  const interval = baseInterval * (1 + dirChangeGrace * 0.8); // grace 중 최대 80% 간격 증가
  obsTimer += dt;
  if (obsTimer >= interval) {
    obsTimer = 0;
    const obs = makeObs(false, spawnDir);
    if (Array.isArray(obs)) obstacles.push(...obs);
    else obstacles.push(obs);
    if (diff > 0.5 && Math.random() < 0.5) {
      const obs2 = makeObs(false, spawnDir);
      if (Array.isArray(obs2)) obstacles.push(...obs2);
      else obstacles.push(obs2);
    }
    if (diff > 1.5 && Math.random() < 0.4) {
      const obs3 = makeObs(false, spawnDir);
      if (Array.isArray(obs3)) obstacles.push(...obs3);
      else obstacles.push(obs3);
    }
  }
}

// ── Controls ─────────────────────────────────────────────────────────────────
let drag = false, dragX = 0, dragY = 0;
let touchPos: { x: number; y: number } | null = null;

function onDown(cx: number, cy: number) {
  if (state !== S.PLAY || cy < GH) return;
  drag = true; dragX = cx; dragY = cy;
  touchPos = { x: cx, y: cy - GH };
}
function onMove(cx: number, cy: number) {
  if (!drag || state !== S.PLAY) return;
  player.x = clamp(player.x + (cx - dragX), player.r, W - player.r);
  player.y = clamp(player.y + (cy - dragY), player.r, GH - player.r);
  dragX = cx; dragY = cy;
  touchPos = { x: cx, y: cy - GH };
}
function onUp() { drag = false; touchPos = null; }

canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onDown(t.clientX, t.clientY); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); const t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(); }, { passive: false });
canvas.addEventListener('mousedown',  e => onDown(e.clientX, e.clientY));
canvas.addEventListener('mousemove',  e => onMove(e.clientX, e.clientY));
window.addEventListener('mouseup',    onUp);

// ── Hint ─────────────────────────────────────────────────────────────────────
let hintAlpha = 1;
function startHintFade() { setTimeout(() => { hintAlpha = 0; }, 3000); }

// ── Zoom ─────────────────────────────────────────────────────────────────────
let zoomT = 0;
const ZOOM_DUR = 0.85;
let zoomFX = 0, zoomFY = 0;
let deadT = 0;

// ── Draw Helpers ─────────────────────────────────────────────────────────────
function drawDot(x: number, y: number, r: number) {
  ctx.fillStyle = gameColor;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawControlArea() {
  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(0, GH, W, CH);

  // ① 구분선
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = fgAlpha(0.18);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, GH); ctx.lineTo(W, GH); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (touchPos) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = gameColor;
    ctx.beginPath(); ctx.arc(touchPos.x, GH + touchPos.y, 40, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = gameColor;
    ctx.beginPath(); ctx.arc(touchPos.x, GH + touchPos.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (hintAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = hintAlpha;
    const cx = W / 2, cy = GH + CH / 2 - 8;

    // ③ 중앙 플레이어 점
    ctx.fillStyle = gameColor;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();

    // 좌우 화살표 + 점선
    const arrowOff = 36;
    ctx.strokeStyle = fgAlpha(0.35);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - arrowOff + 8, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + arrowOff - 8, cy); ctx.stroke();
    ctx.setLineDash([]);
    // 왼쪽 화살촉
    ctx.beginPath(); ctx.moveTo(cx - arrowOff + 8, cy - 5); ctx.lineTo(cx - arrowOff, cy); ctx.lineTo(cx - arrowOff + 8, cy + 5); ctx.stroke();
    // 오른쪽 화살촉
    ctx.beginPath(); ctx.moveTo(cx + arrowOff - 8, cy - 5); ctx.lineTo(cx + arrowOff, cy); ctx.lineTo(cx + arrowOff - 8, cy + 5); ctx.stroke();

    // 상하 화살표
    const arrowOffV = 28;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - arrowOffV + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy + arrowOffV - 8); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(cx - 5, cy - arrowOffV + 8); ctx.lineTo(cx, cy - arrowOffV); ctx.lineTo(cx + 5, cy - arrowOffV + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 5, cy + arrowOffV - 8); ctx.lineTo(cx, cy + arrowOffV); ctx.lineTo(cx + 5, cy + arrowOffV - 8); ctx.stroke();

    ctx.fillStyle = fgAlpha(0.3);
    ctx.font = '700 10px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG TO MOVE', cx, cy + arrowOffV + 16);
    ctx.restore();
  }
}

// 방향 전환 시 화면 플래시 표시
function drawDirChangeFlash() {
  if (shakeIntensity > 0.5) {
    ctx.fillStyle = fgAlpha((shakeIntensity - 0.5) * 0.12);
    ctx.fillRect(0, 0, W, GH);
  }
}

// 방향 전환 힌트 화살표
function drawDirHint() {
  if (dirHintAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = dirHintAlpha * 0.28;
  ctx.fillStyle = gameColor;
  const sz = Math.min(W, GH) * 0.38;
  ctx.font = `900 ${sz}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arrow = spawnDir === 'left' ? '←' : spawnDir === 'right' ? '→' : spawnDir === 'top' ? '↑' : '↓';
  ctx.fillText(arrow, W / 2, GH / 2);
  ctx.restore();
  dirHintAlpha = Math.max(0, dirHintAlpha - 0.03);
}

// ── Game Loop ────────────────────────────────────────────────────────────────
let lastT = 0;
function loop(ts: number) {
  const dt = Math.min((ts - lastT) / 1000, 0.05);
  lastT = ts;
  ctx.clearRect(0, 0, W, H);

  if (state === S.INTRO) {
    introObsTimer += dt;
    if (introObsTimer > 1.1) {
      introObsTimer = 0;
      const o = makeObs(true, 'left');
      if (Array.isArray(o)) obstacles.push(...o); else obstacles.push(o);
    }
    updateObs(); auto.update();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawObs();
    drawDot(auto.x, auto.y, auto.r);
  }
  else if (state === S.ZOOM) {
    zoomT += dt / ZOOM_DUR;
    updateObs(); auto.update();
    const t = easeOut(Math.min(zoomT, 1));
    const scale = 1 + t * 14;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-zoomFX, -zoomFY);
    drawObs();
    drawDot(auto.x, auto.y, auto.r);
    ctx.restore();
    if (t > 0.55) {
      ctx.fillStyle = bgAlpha((t - 0.55) / 0.45);
      ctx.fillRect(0, 0, W, H);
    }
    if (zoomT >= 1) startGame();
  }
  else if (state === S.PLAY) {
    tickScore(dt);
    spawnTick(dt);
    updateObs();
    updateShake(dt);

    // 플레이어 크기 단계 업데이트
    player.r = getPlayerR();

    // 방향 전환 트리거
    gameTime += dt;
    if (gameTime >= nextDirChange) {
      nextDirChange = gameTime + rand(12, 22);
      triggerDirChange();
    }

    if (drag) hintAlpha = 0;

    if (obstacles.some(o => collidesObs(player, o))) {
      explode(player.x, player.y);
      ait?.generateHapticFeedback({ type: 'error' });
      state = S.DEAD; deadT = 0;
    }

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.beginPath(); ctx.rect(0, 0, W, GH); ctx.clip();
    drawObs();
    drawDirChangeFlash();
    drawDirHint();
    drawDot(player.x, player.y, player.r);
    ctx.restore();
    drawControlArea();
  }
  else if (state === S.DEAD) {
    deadT += dt;
    updateObs(); updateParticles();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, GH); ctx.clip();
    drawObs(); drawParticles();
    ctx.restore();
    drawControlArea();
    if (deadT > 1.8) { state = S.OVER; showGameOver(); }
  }
  else if (state === S.OVER) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(loop);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
function startZoom() {
  zoomFX = auto.x; zoomFY = auto.y; zoomT = 0;
  state = S.ZOOM;
  document.getElementById('intro')!.classList.add('hidden');
}

function startGame() {
  obstacles = []; particles = [];
  score = 0; scoreF = 0;
  obsTimer = 0; hintAlpha = 1;
  gameTime = 0; nextDirChange = 15;
  spawnDir = 'left';
  shakeIntensity = 0;
  colorIdx = 0; gameColor = COLORS[0]; applyColor();
  dirHintAlpha = 0;
  resetPlayer();
  state = S.PLAY;
  scoreEl.style.display = 'block';
  startHintFade();
  preloadAd();
}

async function showGameOver() {
  document.getElementById('goScore')!.textContent = String(score);
  document.getElementById('gameOver')!.classList.add('show');
  try {
    const result = await ait?.submitGameCenterLeaderBoardScore({ score: String(score) });
    if (result && result.statusCode !== 'SUCCESS') console.warn('리더보드 점수 제출 실패:', result.statusCode);
  } catch (e) { console.warn('리더보드 점수 제출 오류:', e); }
}

function resetToIntro() {
  obstacles = []; particles = [];
  auto.reset(); introObsTimer = 0;
  scoreEl.style.display = 'none';
  state = S.INTRO;
  document.getElementById('intro')!.classList.remove('hidden');
}

// ── 광고 ─────────────────────────────────────────────────────────────────────
let adLoaded = false;

function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}
function loadFreeRetries(): number {
  const saved = localStorage.getItem('freeRetries');
  const lastDate = localStorage.getItem('freeRetriesDate');
  if (lastDate !== todayStr()) {
    localStorage.setItem('freeRetries', '3');
    localStorage.setItem('freeRetriesDate', todayStr());
    return 3;
  }
  return saved !== null ? parseInt(saved, 10) : 3;
}
function saveFreeRetries(n: number) {
  localStorage.setItem('freeRetries', String(n));
  localStorage.setItem('freeRetriesDate', todayStr());
}

let freeRetries = loadFreeRetries();

const retryBtn = document.getElementById('retryBtn')!;
function updateRetryBtn() {
  retryBtn.textContent = freeRetries > 0 ? '다시 도전' : '(광고 보고) 다시 도전';
}

async function preloadAd() {
  if (!AdMobPlugin) return;
  try {
    await AdMobPlugin.prepareInterstitial({ adId: ADMOB_INTERSTITIAL_ID });
    adLoaded = true;
  } catch (e) { console.warn('광고 로드 실패:', e); }
}

async function showAitAd() {
  // AIT 환경 (토스 앱): 리워드 전면광고 우선
  if (ait && aitAdLoaded) {
    aitAdLoaded = false;
    ait.showFullScreenAd({
      options: { adGroupId: AIT_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed') {
          document.getElementById('gameOver')!.classList.remove('show');
          resetToIntro();
          preloadAitAd();
        } else if (event.type === 'failedToShow') {
          showAdFallback();
        }
      },
      onError: () => { showAdFallback(); },
    });
    return;
  }

  // AdMob (Android Capacitor)
  if (!AdMobPlugin || !InterstitialEvents || !adLoaded) { showAdFallback(); return; }
  adLoaded = false;
  try {
    const dismissed = await AdMobPlugin.addListener(InterstitialEvents.Dismissed, () => {
      document.getElementById('gameOver')!.classList.remove('show');
      resetToIntro();
      preloadAd();
      dismissed.remove();
    });
    const failed = await AdMobPlugin.addListener(InterstitialEvents.FailedToShow, () => {
      showAdFallback();
      failed.remove();
      dismissed.remove();
    });
    await AdMobPlugin.showInterstitial();
  } catch (e) { console.warn('광고 표시 실패:', e); showAdFallback(); }
}

let adFallbackInterval: ReturnType<typeof setInterval> | null = null;
function showAdFallback() {
  const el = document.getElementById('adScreen')!;
  el.classList.add('show');
  let cnt = 5;
  document.getElementById('adCount')!.textContent = String(cnt);
  adFallbackInterval = setInterval(() => {
    cnt--;
    document.getElementById('adCount')!.textContent = String(cnt);
    if (cnt <= 0) {
      clearInterval(adFallbackInterval!);
      el.classList.remove('show');
      document.getElementById('gameOver')!.classList.remove('show');
      resetToIntro();
    }
  }, 1000);
}

// ── 버튼 ─────────────────────────────────────────────────────────────────────
document.getElementById('startBtn')!.addEventListener('click', startZoom);
retryBtn.addEventListener('click', () => {
  if (freeRetries > 0) {
    freeRetries--;
    saveFreeRetries(freeRetries);
    updateRetryBtn();
    document.getElementById('gameOver')!.classList.remove('show');
    resetToIntro();
  } else {
    showAitAd();
  }
});
document.getElementById('leaderboardBtn')!.addEventListener('click', async () => {
  try {
    await ait?.openGameCenterLeaderboard();
    if (!ait) throw new Error('ait null');
  } catch {
    const text = `In Line에서 ${score}m 달렸어요 🎯 장애물을 피해 더 멀리 가볼 수 있을까요?`;
    if (navigator.share) navigator.share({ title: 'In Line', text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => alert('클립보드에 복사됐어요!')).catch(() => alert(text));
  }
});

// ── 종료 확인 ──────────────────────────────────────────────────────────────────
history.pushState({ inline: true }, '');
window.addEventListener('popstate', () => {
  history.pushState({ inline: true }, '');
  document.getElementById('closeConfirm')!.classList.add('show');
});
document.getElementById('closeNo')!.addEventListener('click', () => {
  document.getElementById('closeConfirm')!.classList.remove('show');
});
document.getElementById('closeYes')!.addEventListener('click', () => {
  document.getElementById('closeConfirm')!.classList.remove('show');
  import('@apps-in-toss/web-framework').then((m: any) => m.closeView?.()).catch(() => history.go(-2));
});

// ── 백그라운드 일시정지 ────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastT = 0; // 복귀 시 dt 스파이크 방지
});

// ── Init ─────────────────────────────────────────────────────────────────────
applyColor();
auto.reset();
requestAnimationFrame(loop);
