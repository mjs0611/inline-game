// ── AIT (리더보드 + 전면광고, 토스 앱 환경에서만 동작) ──────────────────────────────
const AIT_AD_GROUP_ID = 'ait.v2.live.fb0c3b1cbf34487a';
const AIT_REWARD_AD_GROUP_ID = 'ait.v2.live.86b7cf1bbf014040';

type AitModule = {
  submitGameCenterLeaderBoardScore: typeof import('@apps-in-toss/web-framework').submitGameCenterLeaderBoardScore;
  openGameCenterLeaderboard: typeof import('@apps-in-toss/web-framework').openGameCenterLeaderboard;
  loadFullScreenAd: typeof import('@apps-in-toss/web-framework').loadFullScreenAd;
  showFullScreenAd: typeof import('@apps-in-toss/web-framework').showFullScreenAd;
  generateHapticFeedback: typeof import('@apps-in-toss/web-framework').generateHapticFeedback;
  getUserKeyForGame: typeof import('@apps-in-toss/web-framework').getUserKeyForGame;
};
let ait: AitModule | null = null;
let aitAdLoaded = false;
let aitRewardAdLoaded = false;

import('@apps-in-toss/web-framework').then((m) => {
  ait = {
    submitGameCenterLeaderBoardScore: m.submitGameCenterLeaderBoardScore,
    openGameCenterLeaderboard: m.openGameCenterLeaderboard,
    loadFullScreenAd: m.loadFullScreenAd,
    showFullScreenAd: m.showFullScreenAd,
    generateHapticFeedback: m.generateHapticFeedback,
    getUserKeyForGame: m.getUserKeyForGame,
  };
  document.getElementById('leaderboardBtn')!.style.display = 'block';
  preloadAitAd();
  preloadAitRewardAd();
  // 유저 식별자 조회 및 저장 (16번 체크리스트)
  m.getUserKeyForGame().catch(() => {});
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

function preloadAitRewardAd() {
  if (!ait) return;
  aitRewardAdLoaded = false;
  ait.loadFullScreenAd({
    options: { adGroupId: AIT_REWARD_AD_GROUP_ID },
    onEvent: () => { aitRewardAdLoaded = true; },
    onError: () => { aitRewardAdLoaded = false; },
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
  AdMobPlugin.initialize({}).then(() => preloadAd()).catch(() => {});
}).catch(() => {});

// ── Constants ────────────────────────────────────────────────────────────────
const COLORS = ['#191F28', '#F04452', '#FFB300', '#3182F6', '#00C471', '#8B95A1'];
let colorIdx = 0;
let gameColor = COLORS[0];

// ── Persistence Keys ──────────────────────────────────────────────────────────
const BEST_KEY = 'bestScore';
const COIN_KEY = 'totalCoins';
const OWNED_SKINS_KEY = 'ownedSkins';
const EQUIPPED_SKIN_KEY = 'equippedSkin';

// ── Game State Variables ────────────────────────────────────────────────────────
let score = 0, scoreF = 0;
let totalCoins = parseInt(localStorage.getItem(COIN_KEY) ?? '0', 10);
let ownedSkins = JSON.parse(localStorage.getItem(OWNED_SKINS_KEY) ?? '["white"]');
let equippedIdx = parseInt(localStorage.getItem(EQUIPPED_SKIN_KEY) ?? '0', 10);
let sessionCoins = 0;

let spawnDir: 'left'|'top'|'right'|'bottom' = 'left';
const MILESTONES = [50, 100, 200, 300, 500, 1000];
let dirChangeGrace = 0;
let obstacles: Obs[] = [];
let specials: Special[] = [];
let pickups: Pickup[] = [];
let milestoneIdx = 0;

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

// ── Assets ───────────────────────────────────────────────────────────────────
const imgPlayerDefault = '/assets/player_default.png';
const imgPlayerSkins   = '/assets/player_skins.png';
const imgObsAssets     = '/assets/obs_assets.png';
const imgItemAssets    = '/assets/item_assets.png';

const ASSETS = {
  player: new Image(),
  skins:  new Image(),
  coin:   new Image(),
  shield: new Image(),
  slowmo: new Image(),
  mine:   new Image(),
  blade:  new Image(),
};
ASSETS.player.src = imgPlayerDefault;
ASSETS.skins.src  = imgPlayerSkins;
ASSETS.coin.src   = '/assets/coin.png';
ASSETS.shield.src = '/assets/shield.png';
ASSETS.slowmo.src = '/assets/slowmo.png';
ASSETS.mine.src   = '/assets/mine.png';
ASSETS.blade.src  = '/assets/blade.png';

type SkinDef = { id: string; name: string; price: number; sx: number; sy: number; sw: number; sh: number };
const SKINS: SkinDef[] = [
  { id: 'white', name: 'WHITE',  price: 0,   sx: 0, sy: 0, sw: 1024, sh: 1024 },
  { id: 'ufo',   name: 'UFO',    price: 300, sx: 0, sy: 256, sw: 256,  sh: 256  },
  { id: 'rocket',name: 'ROCKET', price: 800, sx: 0, sy: 512, sw: 256,  sh: 256 },
];
// Note: player_skins.png is a 1024x1024 grid with UFO at (0,0,512,512) and Rocket at (512,0,512,512).
// player_default.png is a single 1024x1024 image.

// ── Persistence Helpers ──────────────────────────────────────────────────────
function loadBest(): number { return parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10); }
function saveBest(n: number) { localStorage.setItem(BEST_KEY, String(n)); }
function saveTotalCoins(n: number) { localStorage.setItem(COIN_KEY, String(n)); }
function saveOwnedSkins(arr: string[]) { localStorage.setItem(OWNED_SKINS_KEY, JSON.stringify(arr)); }
function saveEquippedIdx(i: number) { localStorage.setItem(EQUIPPED_SKIN_KEY, String(i)); }

// ── Shop UI ──────────────────────────────────────────────────────────────────
function skinPreviewHTML(skin: SkinDef): string {
  if (skin.id === 'white') {
    return `<svg width="52" height="52" viewBox="0 0 52 52" class="skin-svg">
      <circle cx="26" cy="26" r="21" fill="#191F28" stroke="#fff" stroke-width="3"/>
    </svg>`;
  }
  const PREVIEW = 56;
  const scale = PREVIEW / skin.sw;
  const bgW = Math.round(1024 * scale);
  const bgH = Math.round(1024 * scale);
  const bgX = Math.round(-skin.sx * scale);
  const bgY = Math.round(-skin.sy * scale);
  return `<div class="skin-sprite" style="width:${PREVIEW}px;height:${PREVIEW}px;background-image:url(${imgPlayerSkins});background-size:${bgW}px ${bgH}px;background-position:${bgX}px ${bgY}px;background-repeat:no-repeat;flex-shrink:0;"></div>`;
}

function updateShopUI() {
  document.getElementById('shopCoinVal')!.textContent = String(totalCoins);
  const grid = document.getElementById('playerSkinsGrid')!;
  grid.innerHTML = '';

  SKINS.forEach((skin, idx) => {
    const isOwned = ownedSkins.includes(skin.id);
    const isEquipped = equippedIdx === idx;

    const div = document.createElement('div');
    div.className = `sku-item ${isEquipped ? 'active' : ''} ${!isOwned ? 'locked' : ''}`;

    const priceHTML = isOwned ? '' : `<div class="sku-price"><img src="/assets/coin.png" class="coin-img"> ${skin.price}</div>`;
    const checkHTML = isEquipped ? `<div style="position:absolute;top:-6px;right:-6px;background:var(--toss-blue);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;">✓</div>` : '';

    div.innerHTML = `${skinPreviewHTML(skin)}${priceHTML}${checkHTML}`;

    div.addEventListener('click', () => {
      if (isOwned) {
        equippedIdx = idx;
        saveEquippedIdx(idx);
        updateShopUI();
        ait?.generateHapticFeedback({ type: 'success' });
      } else if (totalCoins >= skin.price) {
        totalCoins -= skin.price;
        saveTotalCoins(totalCoins);
        ownedSkins.push(skin.id);
        saveOwnedSkins(ownedSkins);
        equippedIdx = idx;
        saveEquippedIdx(idx);
        updateShopUI();
        ait?.generateHapticFeedback({ type: 'success' });
      } else {
        ait?.generateHapticFeedback({ type: 'error' });
        div.style.transform = 'translateX(-4px)';
        setTimeout(() => div.style.transform = 'translateX(4px)', 50);
        setTimeout(() => div.style.transform = '', 100);
      }
    });
    grid.appendChild(div);
  });
}

function openShop() {
  updateShopUI();
  document.getElementById('shopOverlay')!.classList.add('show');
}
function closeShop() {
  document.getElementById('shopOverlay')!.classList.remove('show');
}
document.getElementById('shopBtn')!.addEventListener('click', openShop);
document.getElementById('shopCloseBtn')!.addEventListener('click', closeShop);

// ── Canvas ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx    = canvas.getContext('2d')!;
let W: number, H: number, GH: number, CH: number;

function resize() {
  W  = canvas.width  = window.innerWidth;
  H  = canvas.height = window.innerHeight;
  GH = Math.floor(H * 0.75);
  CH = H - GH;
}
resize();
window.addEventListener('resize', resize);

// ── State ────────────────────────────────────────────────────────────────────
const S = { INTRO: 0, ZOOM: 1, PLAY: 2, DEAD: 3, OVER: 4 } as const;
type GameState = typeof S[keyof typeof S];
let state: GameState = S.INTRO;
let invincibleT = 0; // 이어하기 후 무적 시간

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

// ── Obstacles (원본: dot / line / cross) ──────────────────────────────────────
type DotObs   = { k: 'dot';   x: number; y: number; r: number;  vx: number; vy: number };
type LineObs  = { k: 'line';  x1: number; y1: number; x2: number; y2: number; lw: number; vx: number; vy: number };
type CrossObs = { k: 'cross'; x: number; y: number; size: number; vx: number; vy: number };
type Obs = DotObs | LineObs | CrossObs;

// ── Specials (신규: mine / blade / laser / sentry) ────────────────────────────
type SpecialType = 'mine' | 'laser' | 'blade' | 'sentry';
type Special = {
  k: SpecialType;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  rot: number; vRot: number;
  w?: number; h?: number;
  warning: number;
  pulseT?: number;
  stopX?: number; stopY?: number;
};

type PickupType = 'coin' | 'shield' | 'slowmo';
type Pickup = {
  k: PickupType;
  x: number; y: number;
  r: number;
  life: number;
};

// ── makeObs: 원본 dot/line/cross ──────────────────────────────────────────────
function makeObs(fullH: boolean, dir: 'left' | 'top' | 'right' | 'bottom' = 'left'): Obs | Obs[] {
  const aH  = fullH ? H : GH;
  const pad = 35;
  const diff = fullH ? 0 : Math.min(score / 100, 4);
  const earlyEase = score < 30 ? 0.9 : 1.0;
  const graceMult = 1 - dirChangeGrace * 0.35;
  const spd = rand((5.5 + diff * 2.2) * earlyEase * graceMult, (8 + diff * 2.2) * earlyEase * graceMult);

  if (dir === 'top') {
    const x = rand(pad, W - pad);
    const types = ['dot_s', 'dot_l', 'lv_s', 'lv_l', 'diag_s', 'cross'] as const;
    const type  = types[Math.floor(Math.random() * types.length)];
    switch (type) {
      case 'dot_s':  return { k: 'dot',  x, y: -20, r: rand(4, 8),   vx: 0, vy: spd };
      case 'dot_l':  return { k: 'dot',  x, y: -30, r: rand(11, 20), vx: 0, vy: spd };
      case 'lv_s':   { const h = rand(20, 45);  return { k: 'line', x1: x, y1: -h, x2: x, y2: h, lw: 2, vx: 0, vy: spd }; }
      case 'lv_l':   { const h = rand(55, 100); return { k: 'line', x1: x, y1: -h, x2: x, y2: h, lw: 2, vx: 0, vy: spd }; }
      case 'diag_s': { const h = rand(20, 35);  return { k: 'line', x1: x - h, y1: -h, x2: x + h, y2: h, lw: 2, vx: 0, vy: spd }; }
      case 'cross':  return { k: 'cross', x, y: -20, size: rand(14, 24), vx: 0, vy: spd };
    }
  }
  if (dir === 'bottom') {
    const x = rand(pad, W - pad);
    const types = ['dot_s', 'dot_l', 'lv_s', 'lv_l', 'diag_s', 'cross'] as const;
    const type  = types[Math.floor(Math.random() * types.length)];
    switch (type) {
      case 'dot_s':  return { k: 'dot',  x, y: GH + 20, r: rand(4, 8),   vx: 0, vy: -spd };
      case 'dot_l':  return { k: 'dot',  x, y: GH + 30, r: rand(11, 20), vx: 0, vy: -spd };
      case 'lv_s':   { const h = rand(20, 45);  return { k: 'line', x1: x, y1: GH + h, x2: x, y2: GH - h, lw: 2, vx: 0, vy: -spd }; }
      case 'lv_l':   { const h = rand(55, 100); return { k: 'line', x1: x, y1: GH + h, x2: x, y2: GH - h, lw: 2, vx: 0, vy: -spd }; }
      case 'diag_s': { const h = rand(20, 35);  return { k: 'line', x1: x - h, y1: GH + h, x2: x + h, y2: GH - h, lw: 2, vx: 0, vy: -spd }; }
      case 'cross':  return { k: 'cross', x, y: GH + 20, size: rand(14, 24), vx: 0, vy: -spd };
    }
  }
  if (dir === 'right') {
    const y = rand(pad, aH - pad);
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
        const gapCenter = rand(aH * 0.2, aH * 0.8), gapSize = rand(28, 45), len = rand(60, 130);
        return [
          { k: 'line', x1: -10 - len, y1: 0,                  x2: -10, y2: gapCenter - gapSize, lw: 2, vx: spd, vy: 0 },
          { k: 'line', x1: -10 - len, y1: gapCenter + gapSize, x2: -10, y2: aH,                 lw: 2, vx: spd, vy: 0 },
        ] as Obs[];
      }
    }
  }
  // left (기본)
  const y = rand(pad, aH - pad);
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
      const gapCenter = rand(aH * 0.2, aH * 0.8), gapSize = rand(28, 45), len = rand(60, 130);
      return [
        { k: 'line', x1: W + 10, y1: 0,                  x2: W + 10 + len, y2: gapCenter - gapSize, lw: 2, vx: -spd, vy: 0 },
        { k: 'line', x1: W + 10, y1: gapCenter + gapSize, x2: W + 10 + len, y2: aH,                 lw: 2, vx: -spd, vy: 0 },
      ] as Obs[];
    }
  }
  // fallback
  return { k: 'dot', x: W + 20, y, r: rand(4, 8), vx: -spd, vy: 0 };
}

// ── makeSpecial: 신규 특수 장애물 ────────────────────────────────────────────
function makeSpecial(dir: 'left' | 'top' | 'right' | 'bottom' = 'left'): Special {
  const pad  = 40;
  const diff = Math.min(score / 120, 5);
  const graceMult = 1 - dirChangeGrace * 0.4;
  const spd  = rand((6.0 + diff * 1.0) * graceMult, (8.0 + diff * 1.0) * graceMult);

  let x = 0, y = 0, vx = 0, vy = 0;
  if (dir === 'left')    { x = W + 50;               y = rand(pad, GH - pad); vx = -spd; }
  else if (dir === 'right') { x = -50;               y = rand(pad, GH - pad); vx =  spd; }
  else if (dir === 'top')   { x = rand(pad, W - pad); y = -50;               vy =  spd; }
  else                      { x = rand(pad, W - pad); y = GH + 50;           vy = -spd; }

  // 점수에 따라 등장 가능한 종류 해금
  let types: SpecialType[];
  if (score < 80)       types = ['mine', 'blade'];
  else if (score < 200) types = ['mine', 'blade', 'laser'];
  else                  types = ['mine', 'blade', 'laser', 'sentry'];
  const k = types[Math.floor(Math.random() * types.length)];

  const stopX = k === 'sentry' ? rand(W * 0.15, W * 0.85) : undefined;
  const stopY = k === 'sentry' ? rand(pad, GH - pad) : undefined;
  const laserLen = rand(60 + diff * 28, 160 + diff * 48);

  return {
    k, x, y, vx, vy,
    r: k === 'mine' ? rand(8, 14) : k === 'blade' ? rand(20, 35) : 10,
    rot: Math.random() * Math.PI * 2,
    vRot: k === 'blade' ? 0.18 : 0,
    w: k === 'laser' ? (vx !== 0 ? laserLen : 10) : 0,
    h: k === 'laser' ? (vy !== 0 ? laserLen : 10) : 0,
    warning: 0,
    pulseT: k === 'sentry' ? 0 : undefined,
    stopX, stopY,
  };
}

function spawnPickup() {
  const typeRoll = Math.random();
  let k: PickupType = 'coin';
  if (typeRoll > 0.92) k = 'shield';
  else if (typeRoll > 0.85) k = 'slowmo';

  pickups.push({
    k,
    x: rand(50, W - 50),
    y: rand(50, GH - 50),
    r: 20,
    life: 8.0,
  });
}

// ── 원본 장애물 업데이트 / 드로우 / 충돌 ───────────────────────────────────────
function updateObs(dt: number) {
  const s = dt * 60;
  for (const o of obstacles) {
    if (o.k === 'dot' || o.k === 'cross') { o.x += o.vx * s; o.y += o.vy * s; }
    else { o.x1 += o.vx * s; o.x2 += o.vx * s; o.y1 += o.vy * s; o.y2 += o.vy * s; }
  }
  obstacles = obstacles.filter(o => {
    if (o.k === 'dot' || o.k === 'cross')
      return o.x > -200 && o.y < GH + 200 && o.x < W + 200 && o.y > -200;
    return Math.min(o.x1, o.x2) > -200 && Math.max(o.x1, o.x2) < W + 200
        && Math.min(o.y1, o.y2) > -200 && Math.max(o.y1, o.y2) < GH + 200;
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
  const d1 = ptSegDist(o.x - o.size, o.y, o.x + o.size, o.y, dot.x, dot.y);
  const d2 = ptSegDist(o.x, o.y - o.size, o.x, o.y + o.size, dot.x, dot.y);
  return Math.min(d1, d2) < dot.r + 1.5;
}

// ── 특수 장애물 업데이트 / 드로우 / 충돌 ──────────────────────────────────────
function updateSpecials(dt: number) {
  for (const o of specials) {
    o.rot += o.vRot;
    if (o.k === 'blade') {
      o.x += o.vx * dt * 60; o.y += o.vy * dt * 60;
      if (o.y < 40 || o.y > GH - 40) { o.vy *= -1; o.y = clamp(o.y, 40, GH - 40); }
    } else if (o.k === 'sentry') {
      if (o.stopX !== undefined && o.stopY !== undefined) {
        const dx = o.stopX - o.x, dy = o.stopY - o.y, dist = Math.hypot(dx, dy);
        if (dist > 4) {
          o.vx += (dx / dist) * 1.2; o.vy += (dy / dist) * 1.2;
          const spd = Math.hypot(o.vx, o.vy), maxSpd = Math.min(spd, dist * 0.18);
          if (spd > 0) { o.vx = o.vx / spd * maxSpd; o.vy = o.vy / spd * maxSpd; }
        } else { o.vx = 0; o.vy = 0; o.x = o.stopX; o.y = o.stopY; }
      } else { o.vx *= 0.92; o.vy *= 0.92; }
      o.x += o.vx * dt * 60; o.y += o.vy * dt * 60;
      if (o.pulseT !== undefined) { o.pulseT += dt; if (o.pulseT > 1.8) o.pulseT = 0; }
    } else {
      o.x += o.vx * dt * 60; o.y += o.vy * dt * 60;
    }
  }
  specials = specials.filter(o => o.x > -300 && o.x < W + 300 && o.y > -300 && o.y < GH + 300);
}

function drawSpecials() {
  for (const o of specials) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    if (o.k === 'mine') {
      const s = 1 + Math.sin(Date.now() * 0.008) * 0.08;
      const mr = o.r * s;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * mr, Math.sin(a) * mr);
        ctx.lineTo(Math.cos(a) * (mr + mr * 0.35), Math.sin(a) * (mr + mr * 0.35));
      }
      ctx.strokeStyle = '#191F28'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, mr, 0, Math.PI * 2);
      ctx.fillStyle = '#191F28'; ctx.fill();
      ctx.beginPath(); ctx.arc(-mr * 0.28, -mr * 0.28, mr * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    } else if (o.k === 'blade') {
      const teeth = 8, ir = o.r * 0.55;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const angle = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
        const r2 = i % 2 === 0 ? o.r : ir;
        i === 0 ? ctx.moveTo(Math.cos(angle) * r2, Math.sin(angle) * r2)
                : ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      }
      ctx.closePath(); ctx.fillStyle = '#191F28'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, ir * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (o.k === 'sentry') {
      ctx.fillStyle = '#191F28'; ctx.fillRect(-o.r, -o.r, o.r*2, o.r*2);
      ctx.strokeStyle = '#F04452'; ctx.lineWidth = 2; ctx.strokeRect(-o.r, -o.r, o.r*2, o.r*2);
      if (o.pulseT !== undefined && o.pulseT < 0.5) {
        const ratio = o.pulseT / 0.5;
        ctx.beginPath(); ctx.arc(0, 0, o.r * (1 + ratio * 1.5), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(240,68,82,${1 - ratio})`; ctx.stroke();
      }
    } else if (o.k === 'laser') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeRect(-o.w!/2, -o.h!/2, o.w!, o.h!);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-o.w!/2, -o.h!/2, o.w!, o.h!);
    }
    ctx.restore();
  }
}

function collidesSpecial(dot: { x: number; y: number; r: number }, o: Special): boolean {
  if (o.k === 'laser' && o.w !== undefined && o.h !== undefined) {
    return Math.abs(dot.x - o.x) < o.w / 2 + dot.r && Math.abs(dot.y - o.y) < o.h / 2 + dot.r;
  }
  const dist = Math.hypot(dot.x - o.x, dot.y - o.y);
  if (o.pulseT !== undefined && o.pulseT < 0.5) {
    const pulseR = o.r * (1 + (o.pulseT / 0.5) * 1.5);
    if (dist < dot.r + pulseR) return true;
  }
  return dist < dot.r + o.r;
}

// ── 픽업 업데이트 / 드로우 ────────────────────────────────────────────────────
function updatePickups(dt: number) {
  for (const p of pickups) p.life -= dt;
  pickups = pickups.filter(p => p.life > 0);
}

function drawPickups() {
  for (const p of pickups) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const r = p.r * (1 + Math.sin(Date.now() * 0.01) * 0.1);
    if (p.k === 'coin')        ctx.drawImage(ASSETS.coin,   -r, -r, r*2, r*2);
    else if (p.k === 'shield') ctx.drawImage(ASSETS.shield, -r, -r, r*2, r*2);
    else if (p.k === 'slowmo') ctx.drawImage(ASSETS.slowmo, -r, -r, r*2, r*2);
    ctx.restore();
  }
}

function collides(dot: { x: number; y: number; r: number }, p: Pickup): boolean {
  return Math.hypot(dot.x - p.x, dot.y - p.y) < dot.r + p.r;
}

// ── Screen Shake + Direction Change ──────────────────────────────────────────
let shakeIntensity = 0;
// dir vars at top
let shakeX = 0, shakeY = 0;
let gameTime = 0;
let nextDirChange = 15; 
let dirHintAlpha = 0;

function triggerShake(intensity: number) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

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
  triggerShake(1.0);
  const dirs = (['left', 'top', 'right', 'bottom'] as const).filter(d => d !== spawnDir);
  spawnDir = dirs[Math.floor(Math.random() * dirs.length)];
  obstacles = []; specials = [];
  dirChangeGrace = 1.0; 
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
  update(dt: number) {
    let fx = 0, fy = 0;
    const sense = 160;
    for (const o of obstacles) {
      let cx: number, cy: number;
      if (o.k === 'dot' || o.k === 'cross') { cx = o.x; cy = o.y; }
      else {
        const dx = o.x2 - o.x1, dy = o.y2 - o.y1, l2 = dx*dx + dy*dy;
        const t = clamp(((this.x - o.x1)*dx + (this.y - o.y1)*dy) / l2, 0, 1);
        cx = o.x1 + t*dx; cy = o.y1 + t*dy;
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
    this.x += this.vx * dt * 60; this.y += this.vy * dt * 60;
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
function updateParticles(dt: number) {
  const s = dt * 60;
  for (const p of particles) {
    p.x += p.vx * s; p.y += p.vy * s;
    p.vy += 0.18 * s; p.vx *= Math.pow(0.96, s); p.vy *= Math.pow(0.96, s);
    p.life -= p.decay * s;
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

// ── Milestone Toast ───────────────────────────────────────────────────────────
// milestoneIdx at top
let toast: { text: string; alpha: number; y: number } | null = null;

function updateToast(dt: number) {
  if (!toast) return;
  toast.alpha = Math.max(0, toast.alpha - dt * 0.9);
  toast.y -= dt * 28;
  if (toast.alpha <= 0) toast = null;
}

function drawToast() {
  if (!toast) return;
  ctx.save();
  ctx.globalAlpha = toast.alpha * toast.alpha;
  ctx.fillStyle = gameColor;
  ctx.font = `900 ${Math.floor(Math.min(W, GH) * 0.13)}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(toast.text, W / 2, toast.y);
  ctx.restore();
}

// ── Score ─────────────────────────────────────────────────────────────────────
const scoreEl = document.getElementById('score')!;
function tickScore(dt: number) {
  const diff = Math.min(score / 100, 4);
  scoreF += (3 + diff * 2) * dt * 60 / 100;
  const prev = score;
  score = Math.floor(scoreF);
  scoreEl.innerHTML = score + '<span>m</span>';

  // 마일스톤 체크
  while (milestoneIdx < MILESTONES.length && score >= MILESTONES[milestoneIdx]) {
    if (prev < MILESTONES[milestoneIdx]) { // 이번 프레임에 처음 통과
      toast = { text: MILESTONES[milestoneIdx] + 'm !', alpha: 1, y: GH * 0.38 };
      ait?.generateHapticFeedback({ type: 'confetti' }).catch(() => {});
    }
    milestoneIdx++;
  }
}

// ── Obstacle & Item Spawner ──────────────────────────────────────────────────
let obsTimer = 0, specialTimer = 0, pickupTimer = 0, introObsTimer = 0;
let nextSpecialInterval = rand(15, 25); // 첫 특수 장애물까지 대기 시간

function spawnTick(dt: number) {
  if (dirChangeGrace > 0) dirChangeGrace = Math.max(0, dirChangeGrace - dt / 3);
  const diff = Math.min(score / 100, 4);
  const earlyEase = score < 30 ? 0.9 : 1.0;
  const baseInterval = score < 15 ? 1.5
                     : score < 40 ? 1.1
                     : Math.max(0.22, 1.0 - diff * 0.18);
  const interval = baseInterval * earlyEase * (1 + dirChangeGrace * 0.8) * (slowmoActiveT > 0 ? 1.5 : 1.0);

  // 메인 장애물 (원본)
  obsTimer += dt;
  if (obsTimer >= interval) {
    obsTimer = 0;
    const obs = makeObs(false, spawnDir);
    if (Array.isArray(obs)) obs.forEach(o => obstacles.push(o));
    else obstacles.push(obs);
    if (diff > 2.0 && Math.random() < 0.4) {
      const obs2 = makeObs(false, spawnDir);
      if (Array.isArray(obs2)) obs2.forEach(o => obstacles.push(o));
      else obstacles.push(obs2);
    }
  }

  // 특수 장애물 (낮은 빈도로 1개씩)
  specialTimer += dt;
  if (specialTimer >= nextSpecialInterval) {
    specialTimer = 0;
    const minInterval = score < 100 ? 14 : score < 300 ? 10 : 7;
    nextSpecialInterval = rand(minInterval, minInterval + 10);
    specials.push(makeSpecial(spawnDir));
  }

  pickupTimer += dt;
  if (pickupTimer > rand(6, 10)) {
    pickupTimer = 0;
    spawnPickup();
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
let shieldActive = false;
let slowmoActiveT = 0;

function drawDot(x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  
  // Add a subtle glow/shadow to make the white dot pop against the light background
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 12;
  
  const skin = SKINS[equippedIdx];
  if (skin.id === 'white') {
    // Original Minimal Dot Identity (Hardcoded BLACK as requested)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#000'; 
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Correctly draw the chosen frame (128x128 grid)
    ctx.drawImage(ASSETS.skins, skin.sx, skin.sy, skin.sw, skin.sh, -r, -r, r*2, r*2);
  }
  
  ctx.shadowBlur = 0; // Reset for shield
  if (shieldActive) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.fill();
  }
  ctx.restore();
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
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(touchPos.x, GH + touchPos.y, 40, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(touchPos.x, GH + touchPos.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (hintAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = hintAlpha;
    const cx = W / 2, cy = GH + CH / 2 - 8;

    // ③ 중앙 플레이어 점
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

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
  const arrow = spawnDir === 'left' ? '←' : spawnDir === 'right' ? '→' : spawnDir === 'top' ? '↓' : '↑';
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
      if (Array.isArray(o)) o.forEach(x => obstacles.push(x));
      else obstacles.push(o);
    }
    updateObs(dt); auto.update(dt);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawObs();
    drawDot(auto.x, auto.y, auto.r);
  }
  else if (state === S.ZOOM) {
    zoomT += dt / ZOOM_DUR;
    updateObs(dt); auto.update(dt);
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
    // Item effects
    if (slowmoActiveT > 0) {
      slowmoActiveT = Math.max(0, slowmoActiveT - dt);
      document.getElementById('slowmoIcon')!.style.display = 'flex';
    } else {
      document.getElementById('slowmoIcon')!.style.display = 'none';
    }
    if (shieldActive) {
      document.getElementById('shieldIcon')!.style.display = 'flex';
    } else {
      document.getElementById('shieldIcon')!.style.display = 'none';
    }

    const currentDt = slowmoActiveT > 0 ? dt * 0.5 : dt;
    tickScore(currentDt);
    spawnTick(currentDt);
    updateObs(currentDt);
    updateSpecials(currentDt);
    updatePickups(currentDt);
    updateShake(currentDt);

    // Collision with Pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      if (collides(player, pickups[i])) {
        const p = pickups[i];
        if (p.k === 'coin') {
          sessionCoins++;
          document.getElementById('sessionCoinVal')!.textContent = String(sessionCoins);
          ait?.generateHapticFeedback({ type: 'success' });
        } else if (p.k === 'shield') {
          shieldActive = true;
          ait?.generateHapticFeedback({ type: 'success' });
        } else if (p.k === 'slowmo') {
          slowmoActiveT = 5.0;
          ait?.generateHapticFeedback({ type: 'success' });
        }
        pickups.splice(i, 1);
      }
    }

    // 플레이어 크기 단계 업데이트
    player.r = getPlayerR();

    // 방향 전환 트리거
    gameTime += currentDt;
    if (gameTime >= nextDirChange) {
      nextDirChange = gameTime + rand(12, 22);
      triggerDirChange();
    }

    if (drag) hintAlpha = 0;
    if (invincibleT > 0) invincibleT = Math.max(0, invincibleT - dt);

    if (invincibleT <= 0 && (obstacles.some(o => collidesObs(player, o)) || specials.some(o => collidesSpecial(player, o)))) {
      if (shieldActive) {
        shieldActive = false;
        invincibleT = 1.0;
        triggerShake(0.5);
        ait?.generateHapticFeedback({ type: 'error' });
      } else {
        explode(player.x, player.y);
        ait?.generateHapticFeedback({ type: 'error' });
        state = S.DEAD; deadT = 0;
      }
    }

    const showPlayer = invincibleT <= 0 || Math.floor(invincibleT * 8) % 2 === 0;
    updateToast(dt);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.beginPath(); ctx.rect(0, 0, W, GH); ctx.clip();
    drawObs();
    drawSpecials();
    drawPickups();
    drawDirChangeFlash();
    drawDirHint();
    drawToast();
    if (showPlayer) drawDot(player.x, player.y, player.r);
    ctx.restore();
    drawControlArea();
  }
  else if (state === S.DEAD) {
    deadT += dt;
    updateObs(dt); updateSpecials(dt); updateParticles(dt);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, GH); ctx.clip();
    drawObs(); drawSpecials(); drawParticles();
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
  obstacles = []; specials = []; pickups = []; particles = [];
  score = 0; scoreF = 0;
  obsTimer = 0; specialTimer = 0; pickupTimer = 0; hintAlpha = 1;
  nextSpecialInterval = rand(15, 25);
  gameTime = 0; nextDirChange = 15;
  milestoneIdx = 0; toast = null;
  invincibleT = 0; hasContinued = false;
  shieldActive = false; slowmoActiveT = 0;
  sessionCoins = 0;
  document.getElementById('sessionCoinVal')!.textContent = '0';
  spawnDir = 'left';
  shakeIntensity = 0;
  colorIdx = 0; gameColor = COLORS[0]; applyColor();
  dirHintAlpha = 0;
  resetPlayer();
  state = S.PLAY;
  scoreEl.style.visibility = 'visible';
  document.getElementById('coinCountHUD')!.style.visibility = 'visible';
  startHintFade();
  preloadAd();
}

async function showGameOver() {
  document.getElementById('goScore')!.textContent = String(score);
  document.getElementById('goCoins')!.textContent = String(sessionCoins);
  document.getElementById('continueBtn')!.style.display = hasContinued ? 'none' : '';
  document.getElementById('doubleCoinsBtn')!.style.display = sessionCoins > 0 ? '' : 'none';

  totalCoins += sessionCoins;
  saveTotalCoins(totalCoins);
  
  const best = loadBest();
  const goBestEl = document.getElementById('goBest')!;
  if (score > best) {
    saveBest(score);
    goBestEl.textContent = 'NEW BEST!';
    goBestEl.className = 'newbest';
  } else if (best > 0) {
    const diff = best - score;
    goBestEl.textContent = diff > 0 ? `BEST ${best}m · ${diff}m 남았어요` : `BEST ${best}m`;
    goBestEl.className = '';
  } else {
    goBestEl.textContent = '';
    goBestEl.className = '';
  }
  document.getElementById('gameOver')!.classList.add('show');
  try {
    const result = await ait?.submitGameCenterLeaderBoardScore({ score: String(score) });
    if (result && result.statusCode !== 'SUCCESS') console.warn('리더보드 점수 제출 실패:', result.statusCode);
  } catch (e) { console.warn('리더보드 점수 제출 오류:', e); }
}

function resetToIntro() {
  obstacles = []; specials = []; particles = [];
  auto.reset(); introObsTimer = 0;
  scoreEl.style.visibility = 'hidden';
  document.getElementById('coinCountHUD')!.style.visibility = 'hidden';
  state = S.INTRO;
  document.getElementById('intro')!.classList.remove('hidden');
}

// ── 광고 ─────────────────────────────────────────────────────────────────────
let adLoaded = false;

async function preloadAd() {
  if (!AdMobPlugin) return;
  try {
    await AdMobPlugin.prepareInterstitial({ adId: ADMOB_INTERSTITIAL_ID });
    adLoaded = true;
  } catch (e) { console.warn('광고 로드 실패:', e); }
}

// 이어하기: 점수·상태 유지, 장애물 클리어, 무적 2초 + grace period (한 판 1회 제한)
let hasContinued = false;

function continueGame() {
  hasContinued = true;
  document.getElementById('gameOver')!.classList.remove('show');
  obstacles = []; specials = []; particles = [];
  obsTimer = 0; specialTimer = 0;
  dirChangeGrace = 1.5;
  invincibleT = 2.0;
  resetPlayer();
  state = S.PLAY;
  preloadAitAd();
  preloadAd();
}

async function showAitAd(onComplete: () => void) {
  // AIT 환경 (토스 앱): 전면광고 우선
  if (ait && aitAdLoaded) {
    aitAdLoaded = false;
    ait.showFullScreenAd({
      options: { adGroupId: AIT_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed') {
          onComplete();
          preloadAitAd();
        } else if (event.type === 'failedToShow') {
          showAdFallback(onComplete);
        }
      },
      onError: () => { showAdFallback(onComplete); },
    });
    return;
  }

  // AdMob (Android Capacitor)
  if (!AdMobPlugin || !InterstitialEvents || !adLoaded) { showAdFallback(onComplete); return; }
  adLoaded = false;
  try {
    const dismissed = await AdMobPlugin.addListener(InterstitialEvents.Dismissed, () => {
      onComplete();
      preloadAd();
      dismissed.remove();
    });
    const failed = await AdMobPlugin.addListener(InterstitialEvents.FailedToShow, () => {
      showAdFallback(onComplete);
      failed.remove();
      dismissed.remove();
    });
    await AdMobPlugin.showInterstitial();
  } catch (e) { console.warn('광고 표시 실패:', e); showAdFallback(onComplete); }
}

async function showRewardAd(onComplete: () => void) {
  if (ait && aitRewardAdLoaded) {
    aitRewardAdLoaded = false;
    ait.showFullScreenAd({
      options: { adGroupId: AIT_REWARD_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed') {
          onComplete();
          preloadAitRewardAd();
        } else if (event.type === 'failedToShow') {
          showAdFallback(onComplete);
        }
      },
      onError: () => { showAdFallback(onComplete); },
    });
    return;
  }
  showAdFallback(onComplete);
}

let adFallbackInterval: ReturnType<typeof setInterval> | null = null;
function showAdFallback(onComplete: () => void) {
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
      onComplete();
    }
  }, 1000);
}

// ── 버튼 ─────────────────────────────────────────────────────────────────────
document.getElementById('startBtn')!.addEventListener('click', startZoom);
document.getElementById('continueBtn')!.addEventListener('click', () => {
  showAitAd(continueGame);
});
document.getElementById('doubleCoinsBtn')!.addEventListener('click', () => {
  showRewardAd(() => {
    totalCoins += sessionCoins;
    saveTotalCoins(totalCoins);
    document.getElementById('doubleCoinsBtn')!.style.display = 'none';
    const goCoinsEl = document.querySelector('.go-coins')!;
    (goCoinsEl as HTMLElement).innerHTML = `2배 획득! <img src="/assets/coin.png" class="coin-img"> <span id="goCoins">${sessionCoins * 2}</span>`;
    ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
  });
});
document.getElementById('retryBtn')!.addEventListener('click', () => {
  document.getElementById('gameOver')!.classList.remove('show');
  resetToIntro();
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
