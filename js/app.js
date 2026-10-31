// Router, shared runtime and adaptive quality. Each specimen is a lazy module exporting
// create(env) -> { frame(t, dt), resize(w, h), reset?(), destroy?(), attract?(t, dt) }.
import { Kit } from './core/gl.js';
import { Post } from './core/post.js';
import { AudioEngine } from './core/audio.js';

export const SPECIMENS = [
  { id: 'bubble', name: '뽁뽁이', latin: 'Bubble film', verb: '터뜨리기', caption: 'No.01 — 저밀도 폴리에틸렌, 기포 10mm', hint: '누르거나, 쭉 그어보세요' },
  { id: 'chocolate', name: '초콜릿', latin: 'Couverture', verb: '쪼개기', caption: 'No.02 — 카카오 70%, 녹은 속', hint: '한 칸씩 누르거나 쭉 그어보세요' },
  { id: 'sweep', name: '싹 밀기', latin: 'Sweep', verb: '밀어내기', caption: 'No.03 — 색모래, 흑요석 바닥', hint: '끝까지 쭉 밀어보세요' },
  { id: 'squeegee', name: '스퀴지', latin: 'Squeegee', verb: '닦아내기', caption: 'No.04 — 비누 거품과 고무날', hint: '쭉 닦아서 밤을 드러내보세요' },
  { id: 'marble', name: '마블링', latin: 'Ebru', verb: '섞기', caption: 'No.05 — 수면 위의 안료', hint: '톡 떨어뜨리고, 끌어서 흐트러뜨리세요' },
  { id: 'ferro', name: '페로플루이드', latin: 'Ferrofluid', verb: '끌어올리기', caption: 'No.06 — 기름 속의 Fe₃O₄, 자기장', hint: '가까이 가져가고, 꾹 눌러보세요' },
  { id: 'pendulum', name: '펜듈럼 종', latin: 'Pendulum wave', verb: '맞물리기', caption: 'No.07 — 크롬강 16구, D 음계', hint: '끌어당겼다 놓아보세요' },
];

const $ = id => document.getElementById(id);
const canvas = $('stage');
let kit, post, audio;
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

try { kit = new Kit(canvas); post = new Post(kit); } catch (e) { console.error(e); $('nogl').hidden = false; }

// Quality ladder: only render scale moves, simulation sizes are picked per specimen.
const SCALES = [1, .82, .66, .5];
const isPhone = /Mobi|Android|iPhone/.test(navigator.userAgent);
let scaleIdx = isPhone ? 1 : 0, ewma = 16, sinceChange = 0;
const quality = isPhone ? 'low' : 'high';

let current = null, token = 0, lastW = 0, lastH = 0;

function ensureAudio() { if (!audio) audio = new AudioEngine(); return audio; }

function sizeCanvas(force) {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.max(2, Math.round(innerWidth * dpr)), h = Math.max(2, Math.round(innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; force = true; }
  const rw = Math.max(2, Math.round(w * SCALES[scaleIdx])), rh = Math.max(2, Math.round(h * SCALES[scaleIdx]));
  if (force || rw !== lastW || rh !== lastH) {
    lastW = rw; lastH = rh;
    post.resize(rw, rh, isPhone ? 4 : 5);
    if (current && current.inst) current.inst.resize(rw, rh);
  }
}
addEventListener('resize', () => kit && sizeCanvas());

// --- Pointer plumbing --------------------------------------------------------
function makeInput() {
  const handlers = { down: null, move: null, up: null };
  const toPoint = e => {
    const r = canvas.getBoundingClientRect();
    return { id: e.pointerId, x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, t: e.timeStamp };
  };
  const onDown = e => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    hideHint();
    handlers.down && handlers.down(toPoint(e));
  };
  const onMove = e => {
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (!handlers.move) return;
    if (list && list.length) for (const c of list) handlers.move({ ...toPoint(c), id: e.pointerId, pressed: e.buttons > 0 || e.pointerType === 'touch' });
    else handlers.move({ ...toPoint(e), pressed: e.buttons > 0 || e.pointerType === 'touch' });
  };
  const onUp = e => { handlers.up && handlers.up(toPoint(e)); };
  return {
    on(h) { Object.assign(handlers, h); },
    attach() {
      canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    },
    detach() {
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
    },
    emit(type, p) { handlers[type] && handlers[type](p); },
  };
}

// --- Shell UI ----------------------------------------------------------------
let hintTimer = 0;
function showHint(text, after = 900) {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { $('hint').textContent = text; $('hint').classList.add('show'); }, after);
}
function hideHint() { clearTimeout(hintTimer); $('hint').classList.remove('show'); }

function button(parent, label, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label;
  b.addEventListener('click', e => { e.stopPropagation(); onClick(b); });
  parent.append(b);
  return b;
}
function makeUI() {
  return {
    hint: showHint,
    hideHint,
    tools(list, cb, initial = 0) {
      $('tools').replaceChildren();
      list.forEach((t, i) => {
        const b = button($('tools'), t.label, () => { [...$('tools').children].forEach(c => c.classList.remove('on')); b.classList.add('on'); cb(t.id); });
        if (i === initial) b.classList.add('on');
      });
    },
    clearTools() { $('tools').replaceChildren(); },
    action(label, cb) { const b = button($('actions'), label, cb); $('actions').prepend(b); return b; },
  };
}

function shellActions(inst) {
  $('actions').replaceChildren();
  const a = ensureAudio();
  const mute = button($('actions'), a.muted ? '소리 꺼짐' : '소리 켜짐', () => { a.setMuted(!a.muted); mute.textContent = a.muted ? '소리 꺼짐' : '소리 켜짐'; });
  if (inst.reset) button($('actions'), '새 표본', () => { a.resume(); inst.reset(); });
}

// --- Mount / unmount ---------------------------------------------------------
async function mount(spec, preview) {
  const my = ++token;
  unmount();
  const mod = await import(`./toys/${spec.id}.js`);
  if (my !== token) return;
  sizeCanvas();
  const input = makeInput();
  const mark = kit.mark();
  const a = preview ? null : ensureAudio();
  if (a) a.resume();
  const seed = params.has('seed') ? +params.get('seed') : (Math.random() * 1e9) | 0;
  const env = {
    kit, gl: kit.gl, post, input, preview, quality, reduced, seed,
    audio: a,
    ui: preview ? { hint() {}, hideHint() {}, tools() {}, clearTools() {}, action() { return {}; } } : makeUI(),
    get width() { return lastW; }, get height() { return lastH; },
    buzz: ms => { if (!preview && !reduced && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* unsupported */ } } },
    save: (name) => canvas.toBlob(b => { const u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }),
  };
  const inst = mod.create(env);
  current = { spec, inst, input, mark, preview, t: 0 };
  inst.resize(lastW, lastH);
  if (!preview) {
    input.attach();
    $('caption').textContent = spec.caption;
    shellActions(inst);
    showHint(spec.hint);
  }
  canvas.classList.remove('unfocused');
}

function unmount() {
  if (!current) return;
  current.input.detach();
  current.inst.destroy && current.inst.destroy();
  kit.release(current.mark);
  current = null;
  hideHint();
  $('tools').replaceChildren();
  $('actions').replaceChildren();
}

// --- Index -------------------------------------------------------------------
const list = $('list');
let hoverTimer = 0;
SPECIMENS.forEach((s, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<a href="#/${s.id}" data-i="${i}"><span class="no">${String(i + 1).padStart(2, '0')}</span><span class="name">${s.name}<span class="latin">${s.latin}</span></span><span class="verb">${s.verb}</span></a>`;
  list.append(li);
});
function previewSpec(i, a) {
  list.classList.add('has-active');
  list.querySelectorAll('a').forEach(x => x.classList.toggle('active', x === a));
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (current && current.spec === SPECIMENS[i]) return;
    canvas.classList.add('unfocused');
    setTimeout(() => { if (!location.hash.slice(2)) mount(SPECIMENS[i], true); }, 200);
  }, 140);
}
list.addEventListener('pointerover', e => { const a = e.target.closest('a'); if (a && e.pointerType !== 'touch') previewSpec(+a.dataset.i, a); });
list.addEventListener('focusin', e => { const a = e.target.closest('a'); if (a) previewSpec(+a.dataset.i, a); });

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const spec = SPECIMENS.find(s => s.id === id);
  clearTimeout(hoverTimer);
  if (spec) {
    document.body.classList.add('in-toy');
    $('index').hidden = true; $('shell').hidden = false;
    document.title = `${spec.name} · 쾌감 표본실`;
    canvas.classList.add('unfocused');
    setTimeout(() => mount(spec, false), reduced ? 0 : 180);
  } else {
    document.body.classList.remove('in-toy');
    $('index').hidden = false; $('shell').hidden = true;
    document.title = '쾌감 표본실';
    list.classList.remove('has-active');
    list.querySelectorAll('a').forEach(x => x.classList.remove('active'));
    canvas.classList.add('unfocused');
    setTimeout(() => mount(SPECIMENS[1], true), 200);
  }
}
addEventListener('hashchange', route);

// --- Main loop ---------------------------------------------------------------
let last = performance.now(), running = true;
function loop(now) {
  if (!running) return;
  requestAnimationFrame(loop);
  const raw = now - last; last = now;
  const dt = Math.min(raw, 50) / 1000;
  if (!current) return;
  sizeCanvas();
  current.t += dt;
  if (current.preview && current.inst.attract) current.inst.attract(current.t, dt);
  current.inst.frame(current.t, dt);

  // Adaptive scale with hysteresis so the picture never hunts.
  if (!params.has('fixed')) {
    ewma += (Math.min(raw, 100) - ewma) * .05; sinceChange += dt;
    if (sinceChange > 2.5) {
      if (ewma > 21 && scaleIdx < SCALES.length - 1) { scaleIdx++; sinceChange = 0; sizeCanvas(); }
      else if (ewma < 11 && scaleIdx > (isPhone ? 1 : 0) && sinceChange > 12) { scaleIdx--; sinceChange = 0; sizeCanvas(); }
    }
  }
  window.__frames = (window.__frames || 0) + 1;
}
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { last = performance.now(); requestAnimationFrame(loop); audio && audio.resume(); }
  else audio && audio.suspend();
});
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; });
canvas.addEventListener('webglcontextrestored', () => location.reload());
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ?test drives a specimen deterministically, for automated screenshots and timing.
if (params.has('test')) {
  window.__spec = {
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { current.t += dt; current.inst.frame(current.t, dt); } },
    emit(type, p) { current.input.emit(type, { id: 1, t: performance.now(), pressed: type !== 'up', ...p }); },
    inst: () => current.inst,
    time(n = 30) { const gl = kit.gl, px = new Uint8Array(4), t0 = performance.now(); for (let i = 0; i < n; i++) { current.t += 1 / 60; current.inst.frame(current.t, 1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; },
    error: () => kit.gl.getError(),
  };
}

if (kit) { route(); requestAnimationFrame(loop); }
