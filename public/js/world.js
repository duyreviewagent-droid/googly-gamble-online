import * as THREE from 'three';

export const LOBBY_OFF = new THREE.Vector3(-80, 0, 0);

// ------------------------------------------------------------------ helpers
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const std = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const glowMat = (color, i = 1.5) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: i });
function box(w, h, d, m, x = 0, y = 0, z = 0, parent) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent?.add(b); return b; }
function cyl(r, h, m, x = 0, y = 0, z = 0, parent, seg = 28) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); c.position.set(x, y, z); c.castShadow = c.receiveShadow = true; parent?.add(c); return c; }

export function textSprite(text, { size = 48, color = '#fff', bg = 'rgba(0,0,0,.55)', border = null, pad = 14, font = '900' } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `${font} ${size}px "Avenir Next", system-ui, sans-serif`;
  const lines = String(text).split('\n');
  const w = Math.max(...lines.map(l => g.measureText(l).width)) + pad * 2, h = lines.length * size * 1.2 + pad * 2;
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  g.font = `${font} ${size}px "Avenir Next", system-ui, sans-serif`;
  if (bg) { g.fillStyle = bg; roundRect(g, 0, 0, c.width, c.height, 18); g.fill(); }
  if (border) { g.strokeStyle = border; g.lineWidth = 5; roundRect(g, 3, 3, c.width - 6, c.height - 6, 16); g.stroke(); }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, c.width / 2, pad + size * 0.6 + i * size * 1.2));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(c.width / 180, c.height / 180, 1);
  s.renderOrder = 10;
  return s;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function neon(text, color, w = 1024, h = 180, size = 110) {
  return canvasTex(w, h, (g) => {
    g.font = `900 ${size}px Futura, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [b, a] of [[30, 0.6], [12, 0.9]]) { g.shadowColor = color; g.shadowBlur = b; g.globalAlpha = a; g.fillStyle = color; g.fillText(text, w / 2, h / 2); }
    g.globalAlpha = 1; g.shadowBlur = 0; g.fillStyle = '#fff8e0'; g.fillText(text, w / 2, h / 2);
  });
}
function neonPlane(text, color, width, parent, x, y, z, ry = 0) {
  const t = neon(text, color);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 180 / 1024), m);
  p.position.set(x, y, z); p.rotation.y = ry; parent.add(p);
  return p;
}

const carpetTex = () => canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#3a0a14'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#8a6a2c'; g.lineWidth = 6;
  for (let k = -512; k <= 1024; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 512, 512); g.moveTo(k, 512); g.lineTo(k + 512, 0); g.stroke(); }
  const ros = (x, y, r) => { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.fillStyle = i % 2 ? '#8a6a2c' : '#15545a'; g.beginPath(); g.arc(x + Math.cos(a) * r * .6, y + Math.sin(a) * r * .6, r * .32, 0, 7); g.fill(); } g.fillStyle = '#b8a680'; g.beginPath(); g.arc(x, y, r * .35, 0, 7); g.fill(); };
  for (const [x, y] of [[128, 256], [384, 256], [256, 0], [256, 512], [0, 0], [512, 0], [0, 512], [512, 512], [0, 256], [512, 256]]) ros(x, y, (y === 256 || x === 256) ? 46 : 26);
}, [14, 10]);
const feltTex = () => canvasTex(256, 256, (g, w) => { g.fillStyle = '#0d5c31'; g.fillRect(0, 0, w, w); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? 0 : 255},255,255,.04)`; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); } }, [2, 2]);
const woodTex = () => canvasTex(256, 256, (g, w) => { g.fillStyle = '#4a2410'; g.fillRect(0, 0, w, w); for (let y = 0; y < w; y += 3) { g.fillStyle = `rgba(${90 + Math.random() * 40},${40 + Math.random() * 20},15,.5)`; g.fillRect(0, y + Math.sin(y * .1) * 2, w, 2); } });
const wallTex = () => canvasTex(256, 256, (g, w) => { g.fillStyle = '#5c0f1c'; g.fillRect(0, 0, w, w); g.fillStyle = '#7a1b2b'; for (const [x, y] of [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]]) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 34, y + Math.sin(a) * 34, 30, 12, a, 0, 7); g.fill(); } }, [10, 2]);

// ------------------------------------------------------------------ googly figure
export class Googly {
  constructor(color = '#2f7bff', name = '') {
    this.group = new THREE.Group();
    this.color = new THREE.Color(color);
    const skin = std(this.color, 0.3, 0, {});
    const skinP = new THREE.MeshPhysicalMaterial({ color: this.color, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const dark = std(this.color.clone().multiplyScalar(0.65), 0.45);
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.5; this.group.add(this.pelvis);
    this.body = new THREE.Group(); this.pelvis.add(this.body);
    this.bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.38, 8, 20), skinP);
    this.bodyMesh.position.y = 0.4; this.bodyMesh.castShadow = true; this.body.add(this.bodyMesh);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), std(this.color.clone().lerp(new THREE.Color('#fff'), 0.2), 0.4));
    belly.scale.set(1, 1.3, 0.4); belly.position.set(0, 0.25, 0.19); this.body.add(belly);
    // googly eyes
    this.eyes = [];
    for (const side of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(side * 0.125, 0.66, 0.27); e.rotation.set(-0.08, side * 0.28, 0);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.134, 0.134, 0.03, 28), std(0x15151a, 0.5)); rim.rotation.x = Math.PI / 2; e.add(rim);
      const white = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.036, 28), std(0xffffff, 0.3)); white.rotation.x = Math.PI / 2; e.add(white);
      const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 20), std(0x050505, 0.2)); pupil.rotation.x = Math.PI / 2; pupil.position.set(0, -0.03, 0.022); e.add(pupil);
      this.body.add(e);
      this.eyes.push({ node: e, pupil, p: new THREE.Vector2(0, -0.03), v: new THREE.Vector2(), last: null, lastV: new THREE.Vector3() });
    }
    // mouth
    this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 16, Math.PI), std(0x2a0c12, 0.4));
    this.mouth.position.set(0, 0.49, 0.29); this.mouth.rotation.z = Math.PI; this.body.add(this.mouth);
    // arms
    this.shoulders = []; this.armAng = [new THREE.Vector2(), new THREE.Vector2()]; this.armVel = [new THREE.Vector2(), new THREE.Vector2()];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(side * 0.28, 0.42, 0); this.body.add(sh);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.45, 4, 8), skin); up.position.y = -0.25; sh.add(up);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), std(0xffffff, 0.5)); hand.position.y = -0.52; sh.add(hand);
      this.shoulders.push(sh);
    }
    // legs
    this.hips = []; this.knees = [];
    const shoe = new THREE.MeshPhysicalMaterial({ color: 0x1c1c22, roughness: 0.35, clearcoat: 0.8 });
    for (const side of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(side * 0.13, 0.02, 0); this.pelvis.add(hp);
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.17, 4, 8), dark); th.position.y = -0.12; hp.add(th);
      const kn = new THREE.Group(); kn.position.y = -0.23; hp.add(kn);
      const sn = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.17, 4, 8), dark); sn.position.y = -0.11; kn.add(sn);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), shoe); sh.scale.set(0.85, 0.55, 1.45); sh.position.set(0, -0.24, 0.06); kn.add(sh);
      th.castShadow = sn.castShadow = sh.castShadow = true;
      this.hips.push(hp); this.knees.push(kn);
    }
    this.phase = 0; this.gait = 0; this.t = Math.random() * 10; this.cheerT = 0; this.sulkT = 0; this.hopY = 0; this.hopV = 0; this.stumble = 0; this.nextStumble = 4 + Math.random() * 6;
    this.lastSide = 0; this.onStep = null;
    if (name) this.setName(name);
  }
  setName(name, sub = '') {
    if (this.tag) this.group.remove(this.tag);
    this.tag = textSprite(sub ? `${name}\n${sub}` : name, { size: 40, border: '#' + this.color.getHexString() });
    this.tag.position.y = 1.95; this.group.add(this.tag);
    this.tagText = name + sub;
  }
  say(text) {
    if (this.bubble) this.group.remove(this.bubble);
    this.bubble = textSprite(text.length > 38 ? text.slice(0, 36) + '…' : text, { size: 38, color: '#111', bg: 'rgba(255,255,255,.95)' });
    this.bubble.position.y = 2.45; this.group.add(this.bubble);
    this.bubbleT = 5;
  }
  cheer(big) { this.cheerT = big ? 2.2 : 1.2; this.hopV = big ? 3.4 : 2.4; for (const e of this.eyes) e.v.set((Math.random() - .5) * 6, 3); }
  sulk() { this.sulkT = 1.8; }
  update(dt, speed, run = false) {
    this.t += dt;
    this.gait += (Math.min(1, speed / 1.6) - this.gait) * (1 - Math.exp(-8 * dt));
    this.phase += speed / (0.95 + (run ? 0.35 : 0)) * Math.PI * 2 * dt;
    this.cheerT = Math.max(0, this.cheerT - dt); this.sulkT = Math.max(0, this.sulkT - dt);
    if (speed > 0.6) { this.nextStumble -= dt; if (this.nextStumble <= 0) { this.stumble = 0.55; this.nextStumble = 5 + Math.random() * 6; } }
    this.stumble = Math.max(0, this.stumble - dt);
    this.hopV -= 12 * dt; this.hopY += this.hopV * dt;
    if (this.hopY <= 0) { this.hopY = 0; this.hopV = this.cheerT > 0.4 ? 2.4 : 0; }
    const g = this.gait, s = Math.sin(this.phase), c = Math.cos(this.phase);
    // the famous broken walk: left leg goose-steps, right leg drags
    const amp = [0.72, 0.28], kneeK = [1.5, 0.35], splay = [0.05, 0.22];
    for (let i = 0; i < 2; i++) {
      const ph = this.phase + (i ? Math.PI : 0), swing = Math.max(0, Math.cos(ph));
      const hip = -amp[i] * Math.sin(ph) * g - (i === 0 ? swing * swing * 0.45 * g : 0);
      this.hips[i].rotation.set(hip, 0, (i === 0 ? -1 : 1) * splay[i] * (0.5 + g));
      this.knees[i].rotation.x = kneeK[i] * Math.pow(swing, 1.3) * g + 0.08;
    }
    const side = s > 0 ? 0 : 1;
    if (side !== this.lastSide && g > 0.3) this.onStep?.(side === 0 ? 1 : 0.7);
    this.lastSide = side;
    const st = Math.sin(Math.min(1, this.stumble / 0.55) * Math.PI);
    this.pelvis.position.y = 0.5 + (0.07 * Math.max(0, s) + 0.025 * Math.abs(c)) * g + this.hopY - (this.sulkT > 0 ? 0.06 : 0);
    this.body.rotation.set(0.12 * g + st * 0.45 + (this.sulkT > 0 ? 0.25 : 0) - (this.cheerT > 0 ? 0.1 : 0), 0.22 * c * g, 0.16 * s * g + Math.sin(this.t * 0.9) * 0.03 * (1 - g));
    const breath = 1 + Math.sin(this.t * 2.2) * 0.012;
    this.bodyMesh.scale.set(1 / Math.sqrt(breath), breath, 1 / Math.sqrt(breath));
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      let tx = (i === 0 ? 1.1 : 0.4) * Math.sin(this.phase + (i === 0 ? Math.PI : 0)) * g + (i === 1 ? 0.5 * Math.sin(this.t * 7) * g : 0);
      let tz = sd * (0.18 + 0.15 * g + st * 0.9);
      if (this.cheerT > 0) { tx = -2.9 + Math.sin(this.t * 14 + i) * 0.3; tz = sd * 0.35; }
      if (this.sulkT > 0) { tx = 0.1; tz = sd * 0.05; }
      const a = this.armAng[i], v = this.armVel[i];
      v.x += ((tx - a.x) * 90 - v.x * 9) * dt; v.y += ((tz - a.y) * 90 - v.y * 9) * dt;
      a.x += v.x * dt; a.y += v.y * dt;
      this.shoulders[i].rotation.set(-a.x, 0, a.y);
    }
    const mood = this.cheerT > 0 ? 1 : this.sulkT > 0 ? -1 : 0.4;
    this.mouth.rotation.z = mood >= 0 ? Math.PI : 0;
    this.mouth.position.y = mood >= 0 ? 0.49 : 0.45;
    this.mouth.scale.setScalar(this.cheerT > 0 ? 1.3 : 1);
    // pupils roll around under gravity and the body's own jiggling
    this.group.updateMatrixWorld(true);
    const E = new THREE.Vector3(), q = new THREE.Quaternion(), ux = new THREE.Vector3(), uy = new THREE.Vector3();
    for (const e of this.eyes) {
      e.node.getWorldPosition(E); e.node.getWorldQuaternion(q);
      ux.set(1, 0, 0).applyQuaternion(q); uy.set(0, 1, 0).applyQuaternion(q);
      if (!e.last) { e.last = E.clone(); e.lastV.set(0, 0, 0); }
      const ve = E.clone().sub(e.last).divideScalar(Math.max(dt, 1e-3));
      const ae = ve.clone().sub(e.lastV).divideScalar(Math.max(dt, 1e-3)); if (ae.length() > 250) ae.setLength(250);
      e.last.copy(E); e.lastV.copy(ve);
      const a3 = new THREE.Vector3(0, -22, 0).sub(ae);
      const ax = a3.dot(ux), ay = a3.dot(uy);
      for (let k = 0; k < 3; k++) {
        const h = dt / 3;
        e.v.x += ax * h; e.v.y += ay * h; e.v.multiplyScalar(1 - 1.6 * h);
        e.p.x += e.v.x * h; e.p.y += e.v.y * h;
        const maxD = 0.125 - 0.064, d = e.p.length();
        if (d > maxD) { const nx = e.p.x / d, ny = e.p.y / d; e.p.set(nx * maxD, ny * maxD); const vn = e.v.x * nx + e.v.y * ny; if (vn > 0) { e.v.x -= nx * vn * 1.55; e.v.y -= ny * vn * 1.55; } }
      }
      e.pupil.position.set(e.p.x, e.p.y, 0.022);
    }
    if (this.bubble) { this.bubbleT -= dt; if (this.bubbleT <= 0) { this.group.remove(this.bubble); this.bubble = null; } }
  }
}

// ------------------------------------------------------------------ places
export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0205);
    this.scene.fog = new THREE.Fog(0x1a0610, 30, 70);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 150);
    this.scene.add(new THREE.HemisphereLight(0xffe2c4, 0x2a0a10, 1.1));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.4);
    key.position.set(6, 22, 8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
    this.scene.add(key);
    this.blockers = { lobby: [], casino: [] };
    this.stations = [];
    this.neons = [];
    this.buildCasino();
    this.buildLobby();
    this.canvas = canvas;
    this.resize();
    addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  room(parent, W, D, H, wallMat) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; parent.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(0x1a100c, 0.9)); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; parent.add(ceil);
    const wood = std(0x4a2410, 0.45, 0, { map: woodTex() }), gold = std(0xc9a24a, 0.25, 1);
    for (const [len, x, z, ry] of [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]]) {
      const w = new THREE.Group(); w.position.set(x, 0, z); w.rotation.y = ry; parent.add(w);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat); paper.position.y = H / 2; w.add(paper);
      box(len, 1.1, 0.06, wood, 0, 0.55, 0.03, w); box(len, 0.06, 0.09, gold, 0, 1.12, 0.04, w);
    }
  }

  buildCasino() {
    const C = this.casino = new THREE.Group(); this.scene.add(C);
    const W = 36, D = 26, H = 5.2;
    this.room(C, W, D, H, std(0xffffff, 0.8, 0, { map: wallTex() }));
    neonPlane('GOOGLY GRAND CASINO', '#ffc93a', 13, C, 0, 3.9, -D / 2 + 0.06);
    neonPlane('♠ ♥ PLAY MONEY ONLY ♦ ♣', '#ff3d7f', 7, C, 0, 2.7, -D / 2 + 0.06);
    for (const [x, z, c] of [[-10, -4, 0x9fd4ff], [4, -6, 0xffd9a0], [0, 6, 0xffd0a0], [12, 2, 0xffb8e0]]) { const l = new THREE.PointLight(c, 30, 18, 1.6); l.position.set(x, 4, z); C.add(l); }
    // chandeliers
    for (const [x, z] of [[-9, 2], [5, -3], [2, 8]]) {
      cyl(0.01, 1.2, std(0xc9a24a, 0.3, 1), x, 4.6, z, C);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 12), glowMat(0xfff0c8, 2.2)); s.position.set(x, 4.0, z); C.add(s);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const cr = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), glowMat(0xfff6e0, 1.6)); cr.position.set(x + Math.cos(a) * 0.6, 3.75, z + Math.sin(a) * 0.6); cr.rotation.x = Math.PI; C.add(cr); }
    }
    const bl = this.blockers.casino;
    // slot machines: two banks
    const faceColors = ['#3aa0ff', '#ff3b3b', '#2fd6c8', '#ffc53a', '#ff4fa3'];
    const names = ['DIAMOND DAZE', 'LUCKY 7s', 'BLUE BAYOU', 'GOLD RUSH', 'CHERRY BOMB'];
    let k = 0;
    for (const z of [-11, -5]) {
      for (const x of [-15.6, -14.2, -12.8, -11.4, -10]) {
        const m = new THREE.Group(); m.position.set(x, 0, z); C.add(m);
        const col = faceColors[k % 5];
        box(0.9, 1.9, 0.8, std(0x15151d, 0.3, 0.4), 0, 0.95, 0, m);
        const faceTex = canvasTex(256, 384, (g, w, h) => {
          const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, col); gr.addColorStop(1, '#0c0c14'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
          g.fillStyle = '#fff'; g.font = '900 30px Futura, sans-serif'; g.textAlign = 'center'; g.fillText(names[k % 5], w / 2, 60);
          g.fillStyle = '#c9c9d4'; g.fillRect(24, 130, 208, 110); g.fillStyle = '#fff'; g.fillRect(32, 138, 192, 94);
          g.font = '900 54px sans-serif'; g.fillStyle = '#e8121e'; g.fillText('7', 70, 205); g.fillStyle = '#2fb8ff'; g.fillText('◆', 128, 205); g.fillStyle = '#e8121e'; g.fillText('7', 186, 205);
          g.fillStyle = '#ffe066'; g.font = '800 18px sans-serif'; g.fillText('◆◆◆ PAYS 1000×', w / 2, 290);
        });
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.26), new THREE.MeshStandardMaterial({ map: faceTex, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.55 }));
        face.position.set(0, 1.2, 0.41); m.add(face);
        const top = box(0.86, 0.24, 0.1, glowMat(col, 1.8), 0, 2.02, 0.2, m);
        this.neons.push(top.material);
        const stool = cyl(0.2, 0.08, std(0x7a0f1e, 0.45), 0, 0.62, 1.2, m); cyl(0.03, 0.6, std(0xd8d8e0, 0.2, 1), 0, 0.3, 1.2, m);
        this.stations.push({ kind: 'slot', where: 'casino', x, z: z + 1.05, yaw: Math.PI, title: names[k % 5] });
        k++;
      }
      bl.push({ x0: -16.1, z0: z - 0.45, x1: -9.5, z1: z + 0.5 });
    }
    neonPlane('SLOTS', '#5cd6ff', 3, C, -12.8, 4.1, -8);
    // blackjack tables
    const felt = new THREE.MeshStandardMaterial({ map: feltTex(), roughness: 0.95 });
    const bjTop = canvasTex(512, 512, (g) => {
      g.fillStyle = '#0d5c31'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = '#e6c36a'; g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 170, 0.3, Math.PI - 0.3); g.stroke();
      g.fillStyle = '#e6c36a'; g.font = '800 22px sans-serif'; g.textAlign = 'center'; g.fillText('BLACKJACK PAYS 3 TO 2', 256, 400);
      g.fillStyle = '#fff'; g.font = '700 15px sans-serif'; g.fillText('DEALER STANDS ON ALL 17s', 256, 372);
      g.strokeStyle = '#fff'; g.lineWidth = 4; for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i - 2) * 0.42; g.beginPath(); g.arc(256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200, 20, 0, 7); g.stroke(); }
    });
    for (const [x, z] of [[1.5, -9], [7.5, -9]]) {
      const t = new THREE.Group(); t.position.set(x, 0, z); C.add(t);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.08, 40, 1, false, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ map: bjTop, roughness: 0.9 }));
      top.position.y = 0.8; top.receiveShadow = true; t.add(top);
      const rail = new THREE.Mesh(new THREE.TorusGeometry(1.33, 0.07, 10, 40, Math.PI), std(0x2a0808, 0.35)); rail.rotation.x = -Math.PI / 2; rail.rotation.z = Math.PI; rail.position.y = 0.84; t.add(rail);
      rail.rotation.set(Math.PI / 2, 0, 0);
      box(1.2, 0.76, 0.5, std(0x2a120a, 0.5), 0, 0.38, 0.4, t);
      const dealer = new Googly('#5a6474'); dealer.group.position.set(0, 0, -0.45); t.add(dealer.group); this.staff = (this.staff || []).concat(dealer);
      this.stations.push({ kind: 'blackjack', where: 'casino', x, z: z + 1.65, yaw: Math.PI, title: 'BLACKJACK' });
      bl.push({ cx: x, cz: z + 0.2, r: 1.5 });
    }
    // roulette
    {
      const t = new THREE.Group(); t.position.set(-5.5, 0, 4); C.add(t);
      box(3.6, 0.1, 1.5, std(0x2a120a, 0.4), 0, 0.75, 0, t);
      for (const [lx, lz] of [[-1.6, -0.6], [1.6, -0.6], [-1.6, 0.6], [1.6, 0.6]]) box(0.12, 0.72, 0.12, std(0x2a120a, 0.4), lx, 0.36, lz, t);
      const lay = canvasTex(1024, 380, (g) => {
        g.fillStyle = '#0d5c31'; g.fillRect(0, 0, 1024, 380); g.strokeStyle = '#fff'; g.lineWidth = 3; g.font = '800 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const R = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
        for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) { const n = c * 3 + (3 - r), x = 70 + c * 72, y = 10 + r * 72; g.strokeRect(x, y, 72, 72); g.fillStyle = R.has(n) ? '#c4142a' : '#111'; g.beginPath(); g.arc(x + 36, y + 36, 24, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText(n, x + 36, y + 37); }
        g.strokeRect(4, 10, 66, 108); g.strokeRect(4, 118, 66, 108); g.fillStyle = '#fff'; g.fillText('00', 37, 64); g.fillText('0', 37, 172);
        ['1st 12', '2nd 12', '3rd 12'].forEach((s, i) => { g.strokeRect(70 + i * 288, 226, 288, 70); g.fillText(s, 70 + i * 288 + 144, 262); });
        ['1-18', 'EVEN', 'RED', 'BLACK', 'ODD', '19-36'].forEach((s, i) => { g.strokeRect(70 + i * 144, 296, 144, 70); g.fillStyle = s === 'RED' ? '#ff4d5e' : '#fff'; g.fillText(s, 70 + i * 144 + 72, 332); g.fillStyle = '#fff'; });
      });
      const layout = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), new THREE.MeshStandardMaterial({ map: lay, roughness: 0.95 }));
      layout.rotation.x = -Math.PI / 2; layout.position.set(0.55, 0.81, 0.05); t.add(layout);
      const bowl = cyl(0.55, 0.14, std(0x3a1a0a, 0.35), -1.2, 0.87, 0, t, 40);
      this.rotorTex = canvasTex(512, 512, (g) => {
        const W = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
        const R = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
        g.fillStyle = '#6a3a1a'; g.fillRect(0, 0, 512, 512);
        W.forEach((n, i) => { const a0 = i / 38 * Math.PI * 2, a1 = (i + 1) / 38 * Math.PI * 2; g.fillStyle = n === 0 || n === 37 ? '#0c7a3a' : R.has(n) ? '#b3121f' : '#141414'; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 250, a0, a1); g.closePath(); g.fill(); });
        g.fillStyle = '#8a5a2b'; g.beginPath(); g.arc(256, 256, 160, 0, 7); g.fill();
      });
      this.rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 48), [std(0x3a1a0a), new THREE.MeshStandardMaterial({ map: this.rotorTex, roughness: 0.3 }), std(0x3a1a0a)]);
      this.rotor.position.set(-1.2, 0.95, 0); t.add(this.rotor);
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 16), std(0xd6a84a, 0.2, 1)); hub.position.set(-1.2, 1.03, 0); t.add(hub);
      const dealer = new Googly('#5a6474'); dealer.group.position.set(-1.1, 0, -1.1); t.add(dealer.group); this.staff.push(dealer);
      this.stations.push({ kind: 'roulette', where: 'casino', x: -5.5, z: 5.3, yaw: Math.PI, title: 'ROULETTE' });
      bl.push({ x0: -7.4, z0: 3.1, x1: -3.6, z1: 4.9 });
    }
    // craps
    {
      const t = new THREE.Group(); t.position.set(6, 0, 4); C.add(t);
      box(3.8, 0.72, 2.1, std(0x2a120a, 0.4), 0, 0.36, 0, t);
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: canvasTex(640, 320, (g) => {
        g.fillStyle = '#0d5c31'; g.fillRect(0, 0, 640, 320); g.strokeStyle = '#fff'; g.lineWidth = 3; g.fillStyle = '#fff'; g.font = '900 30px sans-serif'; g.textAlign = 'center';
        g.strokeRect(30, 270, 580, 40); g.fillText('PASS LINE', 320, 300); g.strokeRect(80, 170, 480, 60); g.fillStyle = '#f7d23e'; g.fillText('FIELD', 320, 210);
        g.fillStyle = '#fff'; ['4', '5', 'SIX', '8', 'NINE', '10'].forEach((s, i) => { g.strokeRect(80 + i * 80, 20, 80, 80); g.fillText(s, 120 + i * 80, 72); });
      }), roughness: 0.95 }));
      bed.rotation.x = -Math.PI / 2; bed.position.y = 0.73; t.add(bed);
      for (const [w, d, x, z] of [[3.5, 0.12, 0, -0.86], [3.5, 0.12, 0, 0.86], [0.12, 1.7, -1.66, 0], [0.12, 1.7, 1.66, 0]]) box(w, 0.28, d, std(0x2a0808, 0.35), x, 0.86, z, t);
      const dealer = new Googly('#5a6474'); dealer.group.position.set(0, 0, -1.6); t.add(dealer.group); this.staff.push(dealer);
      this.stations.push({ kind: 'craps', where: 'casino', x: 6, z: 5.5, yaw: Math.PI, title: 'CRAPS' });
      bl.push({ x0: 4.1, z0: 2.95, x1: 7.9, z1: 5.05 });
    }
    // bar
    {
      box(0.7, 1.05, 10, std(0x4a2410, 0.4, 0, { map: woodTex() }), 16.6, 0.52, -1, C);
      box(0.95, 0.06, 10.2, std(0x151518, 0.12, 0.2), 16.55, 1.08, -1, C);
      box(0.04, 0.04, 10, glowMat(0xff9a3c, 2), 16.2, 1.0, -1, C);
      for (const h of [1.5, 2.0, 2.5]) {
        box(0.3, 0.04, 9, std(0x2a1a10), 17.75, h, -1, C);
        for (let z = -5.2; z < 3.2; z += 0.22) { const col = [0x2e7d32, 0x8d4a10, 0xd9c38a, 0x3b1f6b, 0x9e1b1b, 0x1b5e8a][Math.floor(Math.random() * 6)]; cyl(0.045, 0.3, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, roughness: 0.1, transparent: true, opacity: 0.85 }), 17.72, h + 0.17, z, C, 10); }
      }
      neonPlane('THE BLUE LOUNGE', '#ff7ad9', 5, C, 17.95, 3.4, -1, -Math.PI / 2);
      const bt = new Googly('#5a6474'); bt.group.position.set(17.3, 0, -1); bt.group.rotation.y = -Math.PI / 2; C.add(bt.group); this.staff.push(bt);
      this.stations.push({ kind: 'bar', where: 'casino', x: 15.4, z: -1, yaw: Math.PI / 2, title: 'THE BLUE LOUNGE BAR' });
      bl.push({ x0: 16.2, z0: -6.2, x1: 18, z1: 4.2 });
    }
    // pillars
    for (const [x, z] of [[-8, -8], [-8, 9], [11, -8], [11, 9]]) { cyl(0.42, 5.2, std(0x151515, 0.15, 0.2), x, 2.6, z, C); cyl(0.52, 0.25, std(0xc9a24a, 0.25, 1), x, 0.12, z, C); bl.push({ cx: x, cz: z, r: 0.55 }); }
    this.bounds = { casino: { x0: -17.6, x1: 17.6, z0: -12.6, z1: 12.6 }, lobby: { x0: -8.6, x1: 8.6, z0: -6.6, z1: 6.6 } };
  }

  buildLobby() {
    const L = this.lobby = new THREE.Group(); L.position.copy(LOBBY_OFF); this.scene.add(L);
    const W = 18, D = 14, H = 4.2;
    this.room(L, W, D, H, std(0x2a1f4a, 0.85));
    neonPlane('GOOGLY GRAND · LOBBY', '#5cd6ff', 9, L, 0, 3.1, -D / 2 + 0.06);
    neonPlane('WAITING FOR THE HOST TO OPEN THE DOORS', '#ffc93a', 7, L, 0, 2.25, -D / 2 + 0.06);
    for (const [x, z, c] of [[-4, 0, 0xb197fc], [4, 0, 0xffd0a0], [0, 4, 0xffb8e0]]) { const l = new THREE.PointLight(c, 22, 14, 1.6); l.position.set(x, 3.5, z); L.add(l); }
    // doors to the casino
    for (const dx of [-0.9, 0.9]) box(1.7, 2.8, 0.1, std(0x0e0e14, 0.05, 0.8), dx, 1.4, -D / 2 + 0.06, L);
    box(3.9, 0.15, 0.2, std(0xc9a24a, 0.25, 1), 0, 2.85, -D / 2 + 0.1, L);
    // velvet couches and a fountain
    const velvet = std(0x7a1f2b, 0.9);
    for (const [x, z, ry] of [[-6, 3, Math.PI / 2], [6, 3, -Math.PI / 2], [-6, -2, Math.PI / 2], [6, -2, -Math.PI / 2]]) {
      const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; L.add(c);
      box(2.2, 0.45, 0.9, velvet, 0, 0.23, 0, c); box(2.2, 0.6, 0.25, velvet, 0, 0.6, -0.35, c);
      this.blockers.lobby.push({ cx: x, cz: z, r: 1.0 });
    }
    cyl(1.3, 0.5, std(0xd9d2c4, 0.3), 0, 0.25, 1, L, 40);
    const water = cyl(1.15, 0.05, new THREE.MeshStandardMaterial({ color: 0x3aa0ff, emissive: 0x1a60ff, emissiveIntensity: 0.6, roughness: 0.05 }), 0, 0.5, 1, L, 40);
    cyl(0.12, 1.2, std(0xc9a24a, 0.25, 1), 0, 0.9, 1, L);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), glowMat(0xffd84a, 2)); orb.position.set(0, 1.7, 1); L.add(orb);
    this.orb = orb;
    this.blockers.lobby.push({ cx: 0, cz: 1, r: 1.45 });
  }

  resolve(where, x, z, r = 0.38) {
    const b = this.bounds[where];
    x = Math.min(Math.max(x, b.x0 + r), b.x1 - r); z = Math.min(Math.max(z, b.z0 + r), b.z1 - r);
    for (const o of this.blockers[where]) {
      if (o.r !== undefined) {
        const dx = x - o.cx, dz = z - o.cz, l = Math.hypot(dx, dz), m = o.r + r;
        if (l < m && l > 1e-5) { x += dx / l * (m - l); z += dz / l * (m - l); }
      } else {
        const cx = Math.min(Math.max(x, o.x0), o.x1), cz = Math.min(Math.max(z, o.z0), o.z1);
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
      }
    }
    return [x, z];
  }

  animate(dt, t) {
    for (const s of this.staff) s.update(dt, 0);
    if (this.orb) this.orb.position.y = 1.7 + Math.sin(t * 2) * 0.1;
    if (this.rotor) this.rotor.rotation.y += dt * (this.rotorSpeed || 0.4);
    this.neons.forEach((m, i) => { m.emissiveIntensity = 1.6 + 0.3 * Math.sin(t * 3 + i); });
  }
}
