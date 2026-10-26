'use strict';

/* =========================================================
   設定
   ========================================================= */
const STORAGE_KEY = 'counterApp.v1';
const MIN_COUNT = -999;
const MAX_TARGET = 9999;
const MAX_BUTTONS = 10;
const MAX_UNDO = 1000;
const FIXED_BUTTON = { id: 'enter', label: '入室', sign: 1, value: 1 }; // 削除不可の固定ボタン

/* =========================================================
   状態
   state = {
     target: 目標値,
     count: 現在のカウント,
     buttons: [{ id, label, sign(1|-1), value }],   // 追加したボタン
     history: [{ time, action, delta, after }],     // CSV用の操作履歴
     undo: [{ before, after, label }]               // Undo用（カウント増減のみ）
   }
   ========================================================= */
let state = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.target !== 'number' || typeof s.count !== 'number') return null;
    s.buttons = Array.isArray(s.buttons) ? s.buttons : [];
    s.history = Array.isArray(s.history) ? s.history : [];
    s.undo = Array.isArray(s.undo) ? s.undo : [];
    return s;
  } catch (e) {
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('保存できませんでした', e);
  }
}

function newState(target) {
  state = { target, count: 0, buttons: [], history: [], undo: [] };
  addHistory(`カウント開始（目標 ${target}）`, null, 0);
}

/* =========================================================
   ユーティリティ
   ========================================================= */
const $ = (id) => document.getElementById(id);

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateTime(d) {
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatDelta(n) {
  if (n === null || n === undefined) return '';
  return n > 0 ? `+${n}` : String(n);
}

function buttonText(btn) {
  return `${btn.sign > 0 ? '+' : '-'}${btn.value}`;
}

function addHistory(action, delta, after) {
  state.history.push({
    time: formatDateTime(new Date()),
    action,
    delta: formatDelta(delta),
    after
  });
}

function isLocked() {
  return state.count >= state.target;
}

function vibrate() {
  if (navigator.vibrate) navigator.vibrate(10);
}

/** 0〜max の整数かチェックして数値を返す（不正なら null） */
function parseIntInRange(str, min, max) {
  const s = String(str).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/* =========================================================
   7セグ表示
   ========================================================= */
const SEGMENTS = {
  a: '11,5 16,0 44,0 49,5 44,10 16,10',
  b: '55,11 60,16 60,44 55,49 50,44 50,16',
  c: '55,51 60,56 60,84 55,89 50,84 50,56',
  d: '11,95 16,90 44,90 49,95 44,100 16,100',
  e: '5,51 10,56 10,84 5,89 0,84 0,56',
  f: '5,11 10,16 10,44 5,49 0,44 0,16',
  g: '11,50 16,45 44,45 49,50 44,55 16,55'
};
const DIGIT_MAP = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', ' ': ''
};
const DIGIT_COUNT = 4;
const digitEls = []; // [{ a: polygon, b: polygon, ... }, ...]

function buildDisplay() {
  const container = $('segDisplay');
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-2 -2 64 104');
    svg.setAttribute('aria-hidden', 'true');
    const segs = {};
    for (const [key, points] of Object.entries(SEGMENTS)) {
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', points);
      poly.setAttribute('class', 'seg');
      svg.appendChild(poly);
      segs[key] = poly;
    }
    container.appendChild(svg);
    digitEls.push(segs);
  }
}

function renderDisplay(value) {
  const str = String(value).padStart(DIGIT_COUNT, ' ').slice(-DIGIT_COUNT);
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const lit = DIGIT_MAP[str[i]] || '';
    for (const [key, poly] of Object.entries(digitEls[i])) {
      poly.classList.toggle('on', lit.includes(key));
    }
  }
  const display = $('segDisplay');
  display.setAttribute('aria-label', String(value));
  display.classList.toggle('achieved', isLocked());
}

/* =========================================================
   画面描画
   ========================================================= */
function showScreen(name) {
  $('home').hidden = name !== 'home';
  $('counter').hidden = name !== 'counter';
}

function showHome() {
  $('homeError').textContent = '';
  $('targetInput').value = state ? state.target : '';
  const hasSession = !!state;
  $('homeNew').hidden = hasSession;
  $('homeResume').hidden = !hasSession;
  if (hasSession) {
    $('savedCount').textContent = state.count;
    $('savedTarget').textContent = state.target;
  }
  showScreen('home');
}

function showCounter() {
  showScreen('counter');
  renderCounter();
}

function renderCounter() {
  renderDisplay(state.count);

  // 目標までの差
  const remaining = $('remaining');
  if (isLocked()) {
    remaining.textContent = '目標達成！';
    remaining.classList.add('achieved');
  } else {
    remaining.classList.remove('achieved');
    remaining.innerHTML = '';
    remaining.append(`${state.target} まであと `);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = state.target - state.count;
    remaining.append(num);
  }

  // ボタン一覧
  const list = $('buttonList');
  list.innerHTML = '';
  list.appendChild(createButtonRow(FIXED_BUTTON, false));
  state.buttons.forEach((b) => list.appendChild(createButtonRow(b, true)));

  // 追加ボタン
  const addBtn = $('addBtn');
  addBtn.disabled = state.buttons.length >= MAX_BUTTONS;
  addBtn.textContent = `＋ ボタンを追加（${state.buttons.length}/${MAX_BUTTONS}）`;

  // Undo
  $('undoBtn').disabled = state.undo.length === 0;
}

function createButtonRow(btn, deletable) {
  const row = document.createElement('div');
  row.className = 'btn-row';

  const label = document.createElement('span');
  label.className = 'row-label';
  label.textContent = btn.label;
  label.title = btn.label;
  row.appendChild(label);

  const countBtn = document.createElement('button');
  countBtn.type = 'button';
  countBtn.className = `btn count-btn ${btn.sign > 0 ? 'plus' : 'minus'}`;
  countBtn.textContent = buttonText(btn);
  countBtn.dataset.action = 'count';
  countBtn.dataset.id = btn.id;
  countBtn.disabled = isLocked();
  countBtn.setAttribute('aria-label', `${btn.label} ${buttonText(btn)}`);
  row.appendChild(countBtn);

  if (deletable) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn del-btn';
    del.textContent = '×';
    del.dataset.action = 'delete';
    del.dataset.id = btn.id;
    del.setAttribute('aria-label', `「${btn.label}」ボタンを削除`);
    row.appendChild(del);
  }
  return row;
}

/* =========================================================
   カウント操作
   ========================================================= */
function findButton(id) {
  if (id === FIXED_BUTTON.id) return FIXED_BUTTON;
  return state.buttons.find((b) => b.id === id) || null;
}

function applyButton(btn) {
  if (isLocked()) return;
  const before = state.count;
  const after = Math.min(state.target, Math.max(MIN_COUNT, before + btn.sign * btn.value));
  if (after === before) return; // 下限などで変化がない場合は何もしない

  const label = `${btn.label}（${buttonText(btn)}）`;
  state.count = after;
  state.undo.push({ before, after, label });
  if (state.undo.length > MAX_UNDO) state.undo.shift();
  addHistory(label, after - before, after);
  saveState();
  renderCounter();
  vibrate();

  if (before < state.target && after >= state.target) launchConfetti();
}

function undo() {
  const entry = state.undo.pop();
  if (!entry) return;
  const prev = state.count;
  state.count = entry.before;
  addHistory(`Undo（${entry.label}）`, state.count - prev, state.count);
  saveState();
  renderCounter();
  vibrate();

  if (prev < state.target && state.count >= state.target) launchConfetti();
}

async function resetCount() {
  const ok = await confirmDialog('カウントを0に戻しますか？\n（追加したボタンと履歴は残ります）', 'リセット');
  if (!ok) return;
  const prev = state.count;
  state.count = 0;
  state.undo = []; // リセット前の操作はUndoできない
  addHistory('リセット', 0 - prev, 0);
  saveState();
  renderCounter();
}

/* =========================================================
   ボタンの追加・削除
   ========================================================= */
function openAddDialog() {
  if (state.buttons.length >= MAX_BUTTONS) return;
  $('addLabel').value = '';
  $('addSign').value = '1';
  $('addValue').value = '1';
  $('addError').textContent = '';
  $('addDialog').showModal();
  $('addLabel').focus();
}

function submitAddDialog(e) {
  e.preventDefault();
  const label = $('addLabel').value.trim();
  const sign = Number($('addSign').value) === -1 ? -1 : 1;
  const value = parseIntInRange($('addValue').value, 1, MAX_TARGET);
  const err = $('addError');

  if (!label) { err.textContent = 'ラベルを入力してください'; return; }
  if (label.length > 12) { err.textContent = 'ラベルは12文字までです'; return; }
  if (value === null) { err.textContent = '数値は1〜9999の整数で入力してください'; return; }
  if (state.buttons.length >= MAX_BUTTONS) { err.textContent = `ボタンは${MAX_BUTTONS}個までです`; return; }

  state.buttons.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    label, sign, value
  });
  saveState();
  $('addDialog').close();
  renderCounter();
}

async function deleteButton(id) {
  const btn = state.buttons.find((b) => b.id === id);
  if (!btn) return;
  const ok = await confirmDialog(`「${btn.label}（${buttonText(btn)}）」ボタンを削除しますか？`, '削除');
  if (!ok) return;
  state.buttons = state.buttons.filter((b) => b.id !== id);
  saveState();
  renderCounter();
}

/* =========================================================
   Home画面の操作
   ========================================================= */
function readTarget() {
  const t = parseIntInRange($('targetInput').value, 0, MAX_TARGET);
  if (t === null) {
    $('homeError').textContent = '目標値は0〜9999の整数で入力してください';
    return null;
  }
  $('homeError').textContent = '';
  return t;
}

function startNew() {
  const t = readTarget();
  if (t === null) return;
  newState(t);
  saveState();
  showCounter();
}

function nextKeep() {
  const t = readTarget();
  if (t === null) return;
  if (t < state.count) {
    $('homeError').textContent = `目標値（${t}）が現在のカウント（${state.count}）より小さいため設定できません`;
    return;
  }
  state.target = t;
  addHistory(`目標変更（目標 ${t}）`, null, state.count);
  saveState();
  showCounter();
}

async function resetAndNext() {
  const t = readTarget();
  if (t === null) return;
  const ok = await confirmDialog('カウント・追加したボタン・履歴をすべて削除して、新しく始めますか？', '削除して開始');
  if (!ok) return;
  newState(t);
  saveState();
  showCounter();
}

async function goHome() {
  const ok = await confirmDialog('Home画面に戻りますか？\n（今のデータは保存されています）', '戻る');
  if (ok) showHome();
}

/* =========================================================
   CSV書き出し
   ========================================================= */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const rows = [['日時', '操作', '増減値', '操作後カウント']];
  state.history.forEach((h) => rows.push([h.time, h.action, h.delta, h.after]));
  const csv = '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const a = document.createElement('a');
  a.href = url;
  a.download = `counter_log_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_` +
               `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================================================
   確認モーダル（Promiseで結果を返す）
   ========================================================= */
function confirmDialog(message, okText = 'OK') {
  return new Promise((resolve) => {
    const dlg = $('confirmDialog');
    const yes = $('confirmYes');
    const no = $('confirmNo');
    $('confirmMsg').textContent = message;
    yes.textContent = okText;

    const done = (result) => {
      yes.onclick = null;
      no.onclick = null;
      dlg.oncancel = null;
      if (dlg.open) dlg.close();
      resolve(result);
    };
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    dlg.oncancel = (e) => { e.preventDefault(); done(false); }; // Escキー
    dlg.showModal();
    no.focus();
  });
}

/* =========================================================
   紙吹雪
   ========================================================= */
const confettiCanvas = $('confetti');
const confettiCtx = confettiCanvas.getContext('2d');
const CONFETTI_COLORS = ['#ff4d3d', '#ffb800', '#30d158', '#2f7cf6', '#bf5af2', '#ff7ac6', '#ffffff'];
let particles = [];
let confettiRunning = false;
let lastFrame = 0;

function resizeConfetti() {
  const dpr = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.floor(window.innerWidth * dpr);
  confettiCanvas.height = Math.floor(window.innerHeight * dpr);
  confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function launchConfetti() {
  resizeConfetti();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const burst = reduce ? 40 : 140;
  const rain = reduce ? 20 : 80;
  const rand = (a, b) => a + Math.random() * (b - a);
  const make = (x, y, vx, vy) => ({
    x, y, vx, vy,
    w: rand(6, 11), h: rand(8, 16),
    rot: rand(0, Math.PI * 2), vr: rand(-0.25, 0.25),
    tilt: rand(0, Math.PI * 2), vt: rand(0.05, 0.15),
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    life: 0, maxLife: rand(160, 230)
  });

  // 7セグ表示のあたりから弾ける
  for (let i = 0; i < burst; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(4, 14);
    particles.push(make(W / 2, H * 0.17, Math.cos(angle) * speed, Math.sin(angle) * speed - 6));
  }
  // 上から降る
  for (let i = 0; i < rain; i++) {
    particles.push(make(rand(0, W), rand(-H * 0.4, -10), rand(-1.5, 1.5), rand(1, 4)));
  }

  if (!confettiRunning) {
    confettiRunning = true;
    lastFrame = performance.now();
    requestAnimationFrame(confettiLoop);
  }
}

function confettiLoop(now) {
  const dt = Math.min(3, (now - lastFrame) / 16.67); // フレームレート差を吸収
  lastFrame = now;
  const W = window.innerWidth;
  const H = window.innerHeight;
  confettiCtx.clearRect(0, 0, W, H);

  particles = particles.filter((p) => p.life < p.maxLife && p.y < H + 40);
  for (const p of particles) {
    p.life += dt;
    p.vy += 0.22 * dt;            // 重力
    p.vx *= Math.pow(0.985, dt);  // 空気抵抗
    p.vy = Math.min(p.vy, 6);     // ひらひら落ちる
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.tilt += p.vt * dt;

    const fade = Math.min(1, (p.maxLife - p.life) / 40); // 最後に自然に消える
    confettiCtx.save();
    confettiCtx.globalAlpha = Math.max(0, fade);
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.scale(1, Math.cos(p.tilt));
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.restore();
  }

  if (particles.length > 0) {
    requestAnimationFrame(confettiLoop);
  } else {
    confettiRunning = false;
    confettiCtx.clearRect(0, 0, W, H);
  }
}

window.addEventListener('resize', () => { if (confettiRunning) resizeConfetti(); });

/* =========================================================
   イベント登録・起動
   ========================================================= */
function init() {
  buildDisplay();

  // Home
  $('startBtn').addEventListener('click', startNew);
  $('nextBtn').addEventListener('click', nextKeep);
  $('resetNextBtn').addEventListener('click', resetAndNext);
  $('targetInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !state) startNew();
  });

  // カウント画面
  $('buttonList').addEventListener('click', (e) => {
    const el = e.target.closest('button[data-action]');
    if (!el || el.disabled) return;
    if (el.dataset.action === 'count') {
      const btn = findButton(el.dataset.id);
      if (btn) applyButton(btn);
    } else if (el.dataset.action === 'delete') {
      deleteButton(el.dataset.id);
    }
  });
  $('undoBtn').addEventListener('click', undo);
  $('addBtn').addEventListener('click', openAddDialog);
  $('resetBtn').addEventListener('click', resetCount);
  $('homeBtn').addEventListener('click', goHome);
  $('csvBtn').addEventListener('click', exportCsv);

  // 追加モーダル
  $('addForm').addEventListener('submit', submitAddDialog);
  $('addCancel').addEventListener('click', () => $('addDialog').close());

  // 保存データがあればカウント画面から再開
  state = loadState();
  if (state) showCounter();
  else showHome();
}

init();