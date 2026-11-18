// Boxing Coach 3D: controlador de animações do treinador virtual.
// Requer three.js (r165+) via import map: "three" e "three/addons/".
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const OVERLAP = 0.08;      // segundos de sobreposição entre golpes (fluidez)
const IDLE_FADE = 0.18;    // transição para a base

class Emitter {
  constructor() { this._l = {}; }
  on(ev, fn) { (this._l[ev] ||= new Set()).add(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._l[ev]?.delete(fn); }
  emit(ev, data) { this._l[ev]?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }
}

export class BoxingCoach extends Emitter {
  /**
   * Carrega o modelo e o arquivo de configuração.
   * @param {object} o
   * @param {THREE.Object3D} o.parent  objeto/scene onde o treinador será inserido
   * @param {string} [o.configUrl]     caminho de config/coach-config.json
   * @param {string} [o.baseUrl]       pasta base para resolver o modelo
   * @param {(p:number)=>void} [o.onProgress] progresso de 0 a 1
   */
  static async load({ parent, configUrl = 'config/coach-config.json', baseUrl = '', onProgress, modelData = null, config = null } = {}) {
    if (!config) {
      const cfgRes = await fetch(baseUrl + configUrl);
      if (!cfgRes.ok) throw new Error(`Falha ao carregar configuração (${cfgRes.status})`);
      config = await cfgRes.json();
    }
    const loader = new GLTFLoader();
    // Usa <img> em vez de fetch(blob:) para as texturas: funciona em páginas com CSP restrita e no Safari
    loader.register(parser => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); parser.textureLoader.setCrossOrigin('anonymous'); return { name: 'coach_img_textures' }; });
    // modelData (ArrayBuffer) permite embutir o GLB quando o servidor não serve .glb
    if (!modelData && config.modelModule) {
      const mod = await import(new URL(baseUrl + config.modelModule, document.baseURI).href);
      const bin = atob(mod.default); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      modelData = u8.buffer; onProgress?.(1);
    }
    const gltf = modelData ? await loader.parseAsync(modelData, baseUrl) : await new Promise((resolve, reject) => {
      loader.load(baseUrl + config.model, resolve,
        e => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
        err => reject(new Error('Falha ao carregar o modelo 3D: ' + (err?.message || err))));
    });
    return new BoxingCoach(gltf, config, parent);
  }

  constructor(gltf, config, parent) {
    super();
    this.config = config;
    this.root = new THREE.Group();           // posição/rotação acumuladas (root motion)
    this.root.name = 'BoxingCoachRoot';
    this.model = gltf.scene;
    this.root.add(this.model);
    parent?.add(this.root);
    this.model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const m = o.material;
        if (m && m.name === 'HairBeard') {   // cabelo/barba: recorte por alpha (barato no Safari)
          m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = THREE.DoubleSide;
        }
        if (m && m.name === 'Skin') { m.roughness = 0.55; }
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      a.clampWhenFinished = true;
      this.actions[clip.name] = a;
    }
    const idle = this.actions[config.idleClip || 'idle'];
    if (idle) { idle.setLoop(THREE.LoopRepeat, Infinity); idle.play(); }
    this._idle = idle;
    this._queue = [];
    this._current = null;       // {name, action, meta, endsAt}
    this._speed = 1;
    this._paused = false;
    this._comboToken = 0;
    this.autoRecenter = true;
  }

  // ---------- consulta ----------
  get moveNames() { return Object.keys(this.config.moves); }
  get combos() { return this.config.combos; }
  get currentMove() { return this._current?.name || null; }
  get nextMove() { return this._queue[0]?.name || null; }
  get isPlaying() { return !!this._current || this._queue.length > 0; }
  resolve(name) { return this.config.moves[name] ? name : (this.config.aliases?.[name] || name); }
  duration(name) { const m = this.config.moves[this.resolve(name)]; return m ? m.duration : 0; }

  // ---------- API pública ----------
  /** Executa um movimento isolado. Resolve a Promise quando termina. */
  playMove(name) { return this.playCombo([name]); }

  /**
   * Executa uma sequência. Emite 'moveStart' e 'moveEnd' para cada ação,
   * 'comboStart' e 'comboEnd' para a sequência.
   * @param {string[]} names
   * @param {{loop?:boolean, recenter?:boolean}} [opts]
   */
  playCombo(names, opts = {}) {
    const list = names.map(n => this.resolve(n));
    const bad = list.filter(n => !this.config.moves[n] || !this.actions[n]);
    if (bad.length) return Promise.reject(new Error('Movimento desconhecido: ' + bad.join(', ')));
    const prev = this._current?.action || null;
    this._queue.length = 0; this._current = null;
    const token = ++this._comboToken;
    return new Promise(resolve => {
      const items = list.map((name, i) => ({ name, index: i, total: list.length, token }));
      this._comboDone = () => {
        if (token !== this._comboToken) return;
        this.emit('comboEnd', { moves: list });
        const finish = () => { if (opts.loop && token === this._comboToken) { this.playCombo(names, opts).then(resolve); } else resolve(); };
        if ((opts.recenter ?? this.autoRecenter) && this._needsRecenter()) this._recenter(token).then(finish);
        else finish();
      };
      this.emit('comboStart', { moves: list });
      this._queue.push(...items);
      this._next(false, prev);
    });
  }

  /** Velocidade: 0.5 = lento (aprendizagem), 1 = normal (treino). */
  setSpeed(s) { this._speed = Math.max(0.1, Math.min(2, s)); if (!this._paused) this.mixer.timeScale = this._speed; this.emit('speed', this._speed); }
  getSpeed() { return this._speed; }
  pause() { this._paused = true; this.mixer.timeScale = 0; this.emit('pause'); }
  resume() { this._paused = false; this.mixer.timeScale = this._speed; this.emit('resume'); }
  get paused() { return this._paused; }
  /** Interrompe tudo e volta para a base. */
  stop() { this._comboToken++; this._clear(true); this.emit('stop'); }
  /** Coloca o treinador de volta no centro, de frente. */
  resetPosition() { this.stop(); this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0); }

  /** Chamar a cada quadro com o delta em segundos. */
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.mixer.update(dt);
    const c = this._current;
    if (!c || this._paused) return;
    const t = c.action.time, dur = c.action.getClip().duration;
    const hasRoot = c.hasRoot;
    const overlap = (!hasRoot && this._queue.length && !this._queue[0].hasRootPrev) ? OVERLAP : 0;
    if (t >= dur - overlap - 1e-4) this._finishCurrent();
  }

  // ---------- interno ----------
  _clear(toIdle) {
    this._queue.length = 0;
    if (this._current) {
      const a = this._current.action;
      a.fadeOut(IDLE_FADE);
      this._current = null;
    }
    if (toIdle) this._toIdle();
  }
  _toIdle(instant = false) {
    if (!this._idle) return;
    if (!instant && this._idle.isRunning() && this._idle.getEffectiveWeight() > 0.99 && !this._current) return;
    this._idle.reset(); this._idle.setEffectiveWeight(1); this._idle.play();
    if (!instant) this._idle.fadeIn(IDLE_FADE);
  }
  /** Base canhota: espelha o treinador (a numeração dos golpes continua valendo). */
  setMirror(on) { this.mirrored = !!on; this.root.scale.x = on ? -1 : 1; }
  _rm(meta) { const r = meta.rootMotion || { x: 0, z: 0, yaw: 0 }; return this.mirrored ? { x: -r.x, z: r.z, yaw: -r.yaw } : r; }
  _applyRoot(meta) {
    const r = this._rm(meta); if (!r.x && !r.z && !r.yaw) return;
    const v = new THREE.Vector3(r.x, 0, r.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
    this.root.position.add(v); this.root.rotation.y += r.yaw;
  }
  _finishCurrent() {
    const c = this._current; if (!c) return;
    this._current = null;
    if (c.hasRoot) {
      // corte seco: a pose final do clipe é a pose inicial deslocada; aplica o deslocamento no root
      this._applyRoot(c.meta);
      c.action.stop();
      this.emit('moveEnd', c.info);
      this._next(true);
    } else {
      this.emit('moveEnd', c.info);
      this._next(false, c.action);
    }
  }
  _next(hardCut, prevAction) {
    const item = this._queue.shift();
    if (!item) {
      if (prevAction) prevAction.fadeOut(IDLE_FADE);
      this._toIdle(hardCut);
      const done = this._comboDone; this._comboDone = null; done?.();
      return;
    }
    const meta = this.config.moves[item.name];
    const a = this.actions[item.name];
    const hasRoot = !!(meta.rootMotion && (meta.rootMotion.x || meta.rootMotion.z || meta.rootMotion.yaw));
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.setEffectiveTimeScale(1); a.setEffectiveWeight(1);
    if (this._idle && this._idle.isRunning()) this._idle.fadeOut(hardCut ? 0 : 0.1);
    if (prevAction && prevAction !== a && !hardCut) { a.play(); a.crossFadeFrom(prevAction, OVERLAP, false); }
    else {
      if (prevAction && prevAction !== a) prevAction.stop();
      a.play(); if (!hardCut && !prevAction) a.fadeIn(0.1);
    }
    if (hardCut && this._idle) this._idle.stop();
    const info = { name: item.name, label: meta.label, index: item.index, total: item.total, next: this._queue[0]?.name || null, duration: meta.duration };
    this._current = { name: item.name, action: a, meta, hasRoot, info };
    if (this._queue[0]) this._queue[0].hasRootPrev = hasRoot;
    this.emit('moveStart', info);
  }
  _needsRecenter() {
    const p = this.root.position; const y = this._wrap(this.root.rotation.y);
    return Math.hypot(p.x, p.z) > 0.35 || Math.abs(y) > 0.45;
  }
  _wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  /** Planeja passos reais (sem deslizar) para voltar ao centro e de frente. */
  _planRecenter() {
    const steps = []; const pos = this.root.position.clone(); let yaw = this.root.rotation.y;
    const M = this.config.moves;
    for (let i = 0; i < 8; i++) {
      const y = this._wrap(yaw);
      let pick = null;
      if (Math.abs(y) > 0.45) pick = (this._rm(M.pivotRight).yaw < 0) === (y > 0) ? 'pivotRight' : 'pivotLeft';
      else {
        const local = pos.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw); // alvo no espaço local
        if (Math.hypot(local.x, local.z) < 0.2) break;
        pick = Math.abs(local.z) >= Math.abs(local.x) ? (local.z > 0 ? 'stepForward' : 'stepBack') : (local.x > 0 ? 'stepLeft' : 'stepRight');
      }
      const r = this._rm(M[pick]);
      pos.add(new THREE.Vector3(r.x, 0, r.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)); yaw += r.yaw;
      steps.push(pick);
    }
    return steps;
  }
  _recenter(token) {
    const steps = this._planRecenter();
    if (!steps.length) return Promise.resolve();
    return new Promise(res => {
      this._comboDone = () => { if (token === this._comboToken) { this.emit('recenterEnd'); res(); } };
      this.emit('recenterStart', { moves: steps });
      this._queue.push(...steps.map((name, i) => ({ name, index: i, total: steps.length, token, recenter: true })));
      if (!this._current) this._next(false);
    });
  }
}
