// ── AIT API (토스 앱 환경에서만 동작, 로컬에선 fallback) ─────────────────────
const AD_GROUP_ID = 'ait.dev.43daa14da3ae487b';

type AitApi = {
  loadFullScreenAd: typeof import('@apps-in-toss/web-framework').loadFullScreenAd;
  showFullScreenAd: typeof import('@apps-in-toss/web-framework').showFullScreenAd;
  submitGameCenterLeaderBoardScore: typeof import('@apps-in-toss/web-framework').submitGameCenterLeaderBoardScore;
  openGameCenterLeaderboard: typeof import('@apps-in-toss/web-framework').openGameCenterLeaderboard;
};

let ait: AitApi | null = null;
import('@apps-in-toss/web-framework').then((m) => {
  ait = {
    loadFullScreenAd: m.loadFullScreenAd,
    showFullScreenAd: m.showFullScreenAd,
    submitGameCenterLeaderBoardScore: m.submitGameCenterLeaderBoardScore,
    openGameCenterLeaderboard: m.openGameCenterLeaderboard,
  };
}).catch(() => {});

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
let spawnDir: 'left' | 'top' = 'left';

function makeObs(fullH: boolean, dir: 'left' | 'top' = 'left'): Obs | Obs[] {
  const aH   = fullH ? H : GH;
  const pad  = 35;
  const diff = fullH ? 0 : Math.min(score / 180, 3);
  const spd  = rand(4 + diff * 1.8, 6 + diff * 1.8);

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

  // 오른쪽에서 왼쪽으로 (기본)
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
    return Math.min(o.x1, o.x2) > -200 && Math.max(o.y1, o.y2) < GH + 200;
  });
}

function drawObs() {
  ctx.fillStyle = ctx.strokeStyle = '#000';
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
let nextDirChange = 25; // 첫 방향 전환까지 25초

function updateShake(dt: number) {
  if (shakeIntensity > 0) {
    shakeIntensity = Math.max(0, shakeIntensity - dt * 1.8);
    const mag = shakeIntensity * 14;
    shakeX = (Math.random() - 0.5) * mag;
    shakeY = (Math.random() - 0.5) * mag;
  } else {
    shakeX = 0; shakeY = 0;
  }
}

function triggerDirChange() {
  shakeIntensity = 1;
  spawnDir = spawnDir === 'left' ? 'top' : 'left';
  obstacles = []; // 기존 장애물 클리어
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
  ctx.fillStyle = '#000';
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
  const diff = Math.min(score / 180, 2.5);
  scoreF += (3 + diff * 2) * dt * 60 / 100;
  score = Math.floor(scoreF);
  scoreEl.textContent = score + 'm';
}

// ── Obstacle Spawner ─────────────────────────────────────────────────────────
let obsTimer = 0, introObsTimer = 0;
function spawnTick(dt: number) {
  const diff = Math.min(score / 180, 3);
  const interval = Math.max(0.18, 1.2 - diff * 0.45);
  obsTimer += dt;
  if (obsTimer >= interval) {
    obsTimer = 0;
    const obs = makeObs(false, spawnDir);
    if (Array.isArray(obs)) obstacles.push(...obs);
    else obstacles.push(obs);
    if (diff > 0.8 && Math.random() < 0.45) {
      const obs2 = makeObs(false, spawnDir);
      if (Array.isArray(obs2)) obstacles.push(...obs2);
      else obstacles.push(obs2);
    }
    if (diff > 2.0 && Math.random() < 0.35) {
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
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawControlArea() {
  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(0, GH, W, CH);
  if (touchPos) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(touchPos.x, GH + touchPos.y, 40, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(touchPos.x, GH + touchPos.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (hintAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = hintAlpha;
    ctx.fillStyle = '#ccc';
    ctx.font = '700 10px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG TO MOVE', W / 2, GH + CH / 2 + 4);
    ctx.restore();
  }
}

// 방향 전환 시 화면 플래시 표시
function drawDirChangeFlash() {
  if (shakeIntensity > 0.5) {
    ctx.fillStyle = `rgba(0,0,0,${(shakeIntensity - 0.5) * 0.12})`;
    ctx.fillRect(0, 0, W, GH);
  }
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
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    drawObs();
    drawDot(auto.x, auto.y, auto.r);
  }
  else if (state === S.ZOOM) {
    zoomT += dt / ZOOM_DUR;
    updateObs(); auto.update();
    const t = easeOut(Math.min(zoomT, 1));
    const scale = 1 + t * 14;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-zoomFX, -zoomFY);
    drawObs();
    drawDot(auto.x, auto.y, auto.r);
    ctx.restore();
    if (t > 0.55) {
      ctx.fillStyle = `rgba(255,255,255,${(t - 0.55) / 0.45})`;
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
      nextDirChange = gameTime + rand(20, 35);
      triggerDirChange();
    }

    if (drag) hintAlpha = 0;

    if (obstacles.some(o => collidesObs(player, o))) {
      explode(player.x, player.y);
      state = S.DEAD; deadT = 0;
    }

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.beginPath(); ctx.rect(0, 0, W, GH); ctx.clip();
    drawObs();
    drawDirChangeFlash();
    drawDot(player.x, player.y, player.r);
    ctx.restore();
    drawControlArea();
  }
  else if (state === S.DEAD) {
    deadT += dt;
    updateObs(); updateParticles();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, GH); ctx.clip();
    drawObs(); drawParticles();
    ctx.restore();
    drawControlArea();
    if (deadT > 1.8) { state = S.OVER; showGameOver(); }
  }
  else if (state === S.OVER) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
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
  gameTime = 0; nextDirChange = 25;
  spawnDir = 'left';
  shakeIntensity = 0;
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

function isAitSupported(): boolean {
  try { return !!ait && ait.loadFullScreenAd.isSupported(); }
  catch { return false; }
}

function preloadAd() {
  if (!isAitSupported()) return;
  try {
    ait!.loadFullScreenAd({
      options: { adGroupId: AD_GROUP_ID },
      onEvent: (event) => { if (event.type === 'loaded') adLoaded = true; },
      onError: (err) => console.warn('광고 로드 실패:', err),
    });
  } catch (err) { console.warn('preloadAd 실패:', err); }
}

function showAitAd() {
  if (!isAitSupported() || !adLoaded) { showAdFallback(); return; }
  adLoaded = false;
  try {
    ait!.showFullScreenAd({
      options: { adGroupId: AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed' || event.type === 'failedToShow') {
          document.getElementById('gameOver')!.classList.remove('show');
          resetToIntro();
          preloadAd();
        }
      },
      onError: (err) => { console.warn('광고 표시 실패:', err); showAdFallback(); },
    });
  } catch (err) { console.warn('showAitAd 실패:', err); showAdFallback(); }
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
document.getElementById('retryBtn')!.addEventListener('click', showAitAd);
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

// ── Init ─────────────────────────────────────────────────────────────────────
auto.reset();
requestAnimationFrame(loop);
