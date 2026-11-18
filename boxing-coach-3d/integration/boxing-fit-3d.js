// Adaptador Boxing Fit <-> Treinador 3D (protocolo v2).
// Carregar no index.html do app com:
//   <script type="module" src="boxing-coach-3d/integration/boxing-fit-3d.js"></script>
// Monta o 3D em #stage (treino) e #demoStage (biblioteca), esconde o SVG só depois que
// o modelo carregou (se falhar, o SVG continua) e expõe window.BoxingFit3D:
//   BoxingFit3D.sync({ key, title, move, running, remaining, seq, block, call, speed, stance })
//     block: 'warm' | 'tech' | 'calls' | 'burst' | 'rest' | 'cool' | 'mob'
//     call:  { id, seq } combinação chamada agora (bloco 'calls')
//   BoxingFit3D.demo(key, name, seq, stance)
// Sem 'seq', usa config/boxing-fit-map.json (compatível com o app antigo).
import { CoachStage } from '../src/coach-stage.js';

const BASE = (() => { try { return new URL('../', import.meta.url).href; } catch (e) { return './boxing-coach-3d/'; } })();
const wait = ms => new Promise(r => setTimeout(r, ms));
const BURST = ['jab', 'cross'];

const S = { stage: null, coach: null, map: null, mode: null, train: null, demo: null, deadline: 0, token: 0, lastCall: 0 };

const API = {
  ready: false,
  get coach() { return S.coach; },
  get stage() { return S.stage; },
  sync(st) {
    S.train = { ...st };
    if (st.running) S.deadline = Date.now() + (st.remaining || 0) * 1000;
    if (API.ready && S.mode === 'train') applyTrain();
  },
  demo(key, name, seq, stance) {
    S.demo = { key, name, seq, stance };
    if (API.ready && S.mode === 'demo') applyDemo();
  },
  sequenceFor: (title, move) => mapSeq(title, move, 0),
};
window.BoxingFit3D = API;

function mapSeq(title, move, i) {
  const m = S.map; if (!m) return null;
  let raw = null;
  if (title && Object.prototype.hasOwnProperty.call(m.byTitle, title)) raw = m.byTitle[title];
  else if (move && Object.prototype.hasOwnProperty.call(m.byMove, move)) raw = m.byMove[move];
  if (!raw) return null;
  return Array.isArray(raw) ? raw : raw.rotate ? raw.rotate[i % raw.rotate.length] : null;
}
const valid = seq => (seq || []).filter(n => S.coach.config.moves[n] && n !== 'idle');
const dur = seq => seq.reduce((t, n) => t + S.coach.duration(n), 0);
function setStance(stance) { S.coach.setMirror(stance === 'southpaw'); }

// ---------------------------------------------------------------- treino
let applied = {};
function applyTrain(force = false) {
  const t = S.train, c = S.coach;
  if (!t) { c.stop(); return; }
  setStance(t.stance);
  const mode = t.block || 'tech';
  const changed = force || t.key !== applied.key || mode !== applied.mode;
  const runChanged = t.running !== applied.running;
  applied = { key: t.key, mode, running: t.running };
  if (changed) {
    if (c.paused) c.resume();
    S.lastCall = t.call?.id || 0;
    if (!t.running) { S.token++; c.stop(); return; }
    start(t);
    return;
  }
  if (runChanged) {
    if (t.running) { if (c.paused) c.resume(); else if (!c.isPlaying) start(t); }
    else if (c.isPlaying) c.pause();
    return;
  }
  // combinação nova chamada pelo app
  if (mode === 'calls' && t.call && t.call.id !== S.lastCall && t.running) {
    S.lastCall = t.call.id; S.token++;
    const seq = valid(t.call.seq);
    c.setSpeed(1);
    if (seq.length) c.playCombo(seq).catch(() => { });
  }
}

function start(t) {
  const c = S.coach, mode = t.block || 'tech';
  if (mode === 'calls') {   // espera as chamadas; mostra a primeira se já houver
    S.token++; c.stop(); c.setSpeed(1);
    if (t.call) { S.lastCall = t.call.id; const seq = valid(t.call.seq); if (seq.length) c.playCombo(seq).catch(() => { }); }
    return;
  }
  if (mode === 'burst') return loop(BURST, 1.3, 0, false);
  let seq = t.seq !== undefined ? valid(t.seq) : null;
  if (t.seq === undefined) {                       // app antigo: usa o mapa
    const m = mapSeq(t.title, t.move, 0); seq = m ? valid(m) : [];
  }
  if (!seq || !seq.length || mode === 'rest' || mode === 'cool') { S.token++; c.stop(); return; }
  loop(seq, t.speed || 1, (S.map?.gapSeconds ?? 0.6), true);
}

async function loop(seq, speed, gapS, fitTime) {
  const tok = ++S.token, c = S.coach;
  c.setSpeed(speed);
  while (tok === S.token) {
    const left = (S.deadline - Date.now()) / 1000;
    if (fitTime && S.train?.running && left < dur(seq) / speed + 0.4) { c.stop(); return; }
    try { await c.playCombo(seq, { recenter: true }); } catch (e) { return; }
    if (tok !== S.token) return;
    let gap = gapS * 1000 / speed;
    while (gap > 0 && tok === S.token) { await wait(100); if (!c.paused) gap -= 100; }
    while (c.paused && tok === S.token) await wait(150);
  }
}

// ---------------------------------------------------------------- biblioteca
async function applyDemo() {
  const c = S.coach, d = S.demo, tok = ++S.token;
  if (c.paused) c.resume();
  c.resetPosition();
  S.stage.setCamera(S.map.demoCamera || 'three', true);
  if (!d) return;
  setStance(d.stance);
  const seq = d.seq ? valid(d.seq) : valid(mapSeq(null, d.key, 0) || []);
  if (!seq.length) return;
  c.setSpeed(S.map.demoSpeed || 0.7);
  while (tok === S.token) {
    await c.playCombo(seq);
    if (tok !== S.token) return;
    await wait(900 / c.getSpeed());
  }
}

// ---------------------------------------------------------------- palco visível
const visible = el => !!el && el.offsetParent !== null && el.clientWidth > 0 && el.clientHeight > 0;
function watchVisibility() {
  const trainEl = document.getElementById('stage'), demoEl = document.getElementById('demoStage');
  const tick = () => {
    const mode = visible(trainEl) ? 'train' : visible(demoEl) ? 'demo' : null;
    if (mode === S.mode) return;
    S.mode = mode;
    if (!mode) { S.token++; S.coach.stop(); S.stage.setRendering(false); return; }
    S.stage.attach(mode === 'train' ? trainEl : demoEl);
    S.stage.setRendering(true);
    if (mode === 'train') { S.coach.resetPosition(); S.stage.setCamera(S.map.trainingCamera || 'front', true); applyTrain(true); }
    else applyDemo();
  };
  tick(); setInterval(tick, 300);
}

function injectCss() {
  const css = document.createElement('style');
  css.textContent = `.stage[data-coach3d]{background:#111927}.stage[data-coach3d]>svg{display:none!important}
.stage[data-coach3d] .caption{z-index:2;pointer-events:none;text-shadow:0 1px 3px #000c}
.stage[data-coach3d] canvas{border-radius:inherit}`;
  document.head.append(css);
}

async function init() {
  const trainEl = document.getElementById('stage');
  if (!trainEl) return;
  try {
    // window.COACH_DATA = { map, config, glb(base64) } permite rodar em arquivo único (sem servidor)
    const E = window.COACH_DATA || null;
    let modelData = null;
    if (E) { S.map = E.map; const bin = atob(E.glb); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); modelData = u8.buffer; }
    else {
      const res = await fetch(BASE + 'config/boxing-fit-map.json');
      if (!res.ok) throw new Error('mapa ' + res.status);
      S.map = await res.json();
    }
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) throw new Error('WebGL indisponível');
    S.stage = await CoachStage.create({ container: trainEl, baseUrl: BASE, controls: true, modelData, config: E ? E.config : null });
    S.coach = S.stage.coach;
    injectCss();
    for (const id of ['stage', 'demoStage']) document.getElementById(id)?.setAttribute('data-coach3d', '');
    API.ready = true;
    watchVisibility();
    try { window.render?.(); } catch (e) { }
    // reaplica a seleção atual da biblioteca (a chamada inicial do app acontece antes do 3D carregar)
    try { const sel = document.querySelector('[data-lib].selected, [data-move].selected'); if (!S.demo && sel && typeof window.demo === 'function') window.demo(sel.dataset.lib || sel.dataset.move); } catch (e) { }
    window.dispatchEvent(new CustomEvent('boxingfit3d:ready'));
  } catch (e) {
    console.warn('[BoxingFit3D] mantendo o treinador SVG:', e);
    window.dispatchEvent(new CustomEvent('boxingfit3d:error', { detail: e }));
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
