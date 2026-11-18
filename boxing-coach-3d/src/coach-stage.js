// Palco 3D reutilizável: renderer, câmera, luzes, ringue leve e loop.
// Um único contexto WebGL que pode ser movido entre containers (attach).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BoxingCoach } from './boxing-coach.js';

const CAMS = {
  front: { pos: [0.0, 1.2, 3.35], tgt: [0, 0.9, 0] },
  side: { pos: [3.3, 1.15, 0.45], tgt: [0, 0.9, 0.1] },
  three: { pos: [-2.3, 1.3, 2.45], tgt: [0, 0.9, 0] },
  close: { pos: [0.45, 1.45, 1.9], tgt: [0, 1.3, 0] },
};

function canvasTex(draw, w = 512, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function buildRing(scene, size = 8.6) {
  const half = size / 2;
  const map = canvasTex((g, w, h) => {
    g.fillStyle = '#3a4c66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, w * 0.17, 0, Math.PI * 2); g.stroke();
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(size + 0.5, 0.5, size + 0.5), new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.8 }));
  apron.position.y = -0.251; scene.add(apron);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0c1017, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; scene.add(ground);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ae, metalness: 0.7, roughness: 0.35 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xb71f27, roughness: 0.5 });
  const ropeMats = [0xd8d8d8, 0xb71f27, 0x2f5fb0].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 }));
  for (const [x, z] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 12), postMat); p.position.set(x, 0.75, z); scene.add(p);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), padMat); pad.position.set(x * 0.985, 0.85, z * 0.985); scene.add(pad);
  }
  const ropeGeo = new THREE.CylinderGeometry(0.022, 0.022, size, 8);
  [0.55, 0.9, 1.25].forEach((y, i) => {
    for (let s = 0; s < 4; s++) {
      const r = new THREE.Mesh(ropeGeo, ropeMats[i]); r.rotation.z = Math.PI / 2; r.position.z = half;
      const g = new THREE.Group(); g.add(r); g.rotation.y = s * Math.PI / 2; g.position.y = y; scene.add(g);
    }
  });
}

export class CoachStage {
  /**
   * @param {object} o
   * @param {HTMLElement} o.container  elemento onde o canvas será inserido
   * @param {string} [o.baseUrl]       pasta boxing-coach-3d (ex.: 'boxing-coach-3d/')
   * @param {boolean} [o.controls=true] permitir girar/zoom com o dedo
   * @param {boolean} [o.shadows=true]
   * @param {(p:number)=>void} [o.onProgress]
   */
  static async create({ container, baseUrl = '', controls = true, shadows = true, onProgress, modelData = null, config = null } = {}) {
    const st = new CoachStage(container, { controls, shadows });
    st.coach = await BoxingCoach.load({ parent: st.scene, baseUrl, onProgress, modelData, config });
    st.attach(container);
    return st;
  }

  constructor(container, { controls, shadows }) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111927);
    scene.fog = new THREE.Fog(0x111927, 7, 16);
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    scene.add(new THREE.HemisphereLight(0xcfdcff, 0x2a2018, 0.55));
    const key = this.key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(2.2, 4.5, 3.2); key.castShadow = shadows;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.3, bottom: -0.3, near: 0.5, far: 12 });
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xffd2a6, 1.6); rim.position.set(-2.5, 3, -3.5); scene.add(rim);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.5); fill.position.set(-3, 1.5, 2); scene.add(fill);
    buildRing(scene);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, enablePan: false, minDistance: 1.4, maxDistance: 4, maxPolarAngle: Math.PI * 0.53, enabled: controls });
    this._prevRoot = new THREE.Vector3();
    this._camAnim = null;
    this.setCamera('front', true);
    this._ro = new ResizeObserver(() => this.resize());
    this.clock = new THREE.Clock();
    this.running = true;
    r.setAnimationLoop(() => this._frame());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clock.stop(); else this.clock.start(); });
  }

  /** Move o canvas para outro container (ex.: palco do treino ou da biblioteca). */
  attach(container) {
    if (!container) return;
    if (this.container) this._ro.unobserve(this.container);
    this.container = container;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.prepend(this.renderer.domElement);
    this._ro.observe(container);
    this.resize();
  }

  resize() {
    const c = this.container; if (!c) return;
    const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 44 : 35;
    this.camera.updateProjectionMatrix();
  }

  setCamera(name, instant = false) {
    const c = CAMS[name] || CAMS.front; const off = this.coach ? this.coach.root.position : new THREE.Vector3();
    const tp = new THREE.Vector3(...c.pos).add(off), tt = new THREE.Vector3(...c.tgt).add(off);
    if (instant) { this.camera.position.copy(tp); this.controls.target.copy(tt); return; }
    this._camAnim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: tp, t1: tt, k: 0 };
  }

  /** Para/retoma a renderização (economia de bateria quando o palco está escondido). */
  setRendering(on) {
    if (on === this.running) return;
    this.running = on;
    this.renderer.setAnimationLoop(on ? () => this._frame() : null);
    if (on) this.clock.getDelta();
  }

  _frame() {
    const dt = this.clock.getDelta();
    const coach = this.coach;
    if (coach) {
      coach.update(dt);
      const d = coach.root.position.clone().sub(this._prevRoot).multiplyScalar(Math.min(1, dt * 4));
      this.camera.position.add(d); this.controls.target.add(d); this._prevRoot.add(d);
      this.key.position.set(this._prevRoot.x + 2.2, 4.5, this._prevRoot.z + 3.2); this.key.target.position.copy(this._prevRoot);
    }
    const a = this._camAnim;
    if (a) {
      a.k = Math.min(1, a.k + dt * 2.5); const e = 1 - Math.pow(1 - a.k, 3);
      this.camera.position.lerpVectors(a.p0, a.p1, e); this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (a.k >= 1) this._camAnim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
