import * as THREE from 'three';
const QS = new URLSearchParams(location.search);
if (QS.get('shim')) window.requestAnimationFrame = f => setTimeout(() => f(performance.now()), 16);
import { World, Googly, Pet, LOBBY_OFF, HOTEL_OFF, STREET_OFF } from './world.js';
import { wardrobe, openShop, addCoins } from './shop.js';
import { sfx, unlockAudio, toggleMute, setMood } from './sfx.js';
import * as Games from './games.js';

const $ = id => document.getElementById(id);
const money = v => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();
const signed = v => (v >= 0 ? '+' : '') + money(v);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isMobile = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
if (isMobile) document.body.classList.add('mobile');
// phones: the first tap anywhere wakes the audio (iOS needs it inside a touch/click handler)
for (const ev of ['pointerdown', 'touchend', 'click']) addEventListener(ev, () => unlockAudio(), { capture: true, passive: true });
if (isMobile) {
  $('say').placeholder = 'Say something…';
  // no page scroll, rubber-band or pinch-zoom over the 3D view
  for (const ev of ['touchstart', 'touchmove']) $('view').addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  const relayout = () => { document.documentElement.style.setProperty('--vh', innerHeight + 'px'); };
  relayout(); addEventListener('resize', relayout); addEventListener('orientationchange', () => setTimeout(() => { relayout(); world.resize(); scrollTo(0, 0); }, 250));
}

// ---------------------------------------------------------------- state
const COLORS = ['#2f7bff', '#e63946', '#2fb34a', '#ffc93a', '#9b5de5', '#ff7ad9', '#2fd6c8', '#ff8c2e'];
let myName = localStorage.getItem('gg-name') || '', myColor = localStorage.getItem('gg-color') || COLORS[0];
let ws, myId = 0, room = null, reels = null, where = 'lobby', inRoom = false;
const others = new Map();     // id -> { fig, x, z, yaw, tx, tz, tyaw, moving, where }
const memo = {};
const wantRoom = new URLSearchParams(location.search).get('room');

const world = new World($('view'));
const me = { fig: new Googly(myColor), x: 0, z: 3, yaw: Math.PI, vx: 0, vz: 0 };
world.scene.add(me.fig.group);
me.fig.onStep = v => sfx.step(v);
me.fig.setOutfit(wardrobe.outfit);
me.pet = null;
function setPet(holder, kind, color) {
  if (holder.pet?.kind === kind) return;
  if (holder.pet) world.scene.remove(holder.pet.group);
  holder.pet = kind ? new Pet(kind, color) : null;
  if (holder.pet) world.scene.add(holder.pet.group);
}
setPet(me, wardrobe.outfit.pet, myColor);
const coinLabels = () => document.querySelectorAll('.coinv').forEach(e => e.textContent = wardrobe.coins.toLocaleString());
coinLabels();
function showShop() {
  const ov = $('shopov'); ov.classList.remove('hidden'); sfx.click();
  openShop(ov, outfit => { me.fig.setOutfit(outfit); setPet(me, outfit.pet, myColor); send({ t: 'outfit', outfit }); coinLabels(); }, () => { ov.classList.add('hidden'); coinLabels(); });
}
for (const id of ['shopbtn1', 'shopbtn2', 'shopbtn3']) $(id).onclick = showShop;
let camYaw = Math.PI, camPitch = 0.3, camDist = 4.6;

// ---------------------------------------------------------------- name screen
const sw = $('swatches');
COLORS.forEach(c => { const d = document.createElement('div'); d.style.background = c; if (c === myColor) d.classList.add('on'); d.onclick = () => { myColor = c; sw.querySelectorAll('div').forEach(x => x.classList.remove('on')); d.classList.add('on'); sfx.click(); }; sw.append(d); });
$('nm').value = myName;
$('go').onclick = () => {
  unlockAudio();
  myName = $('nm').value.trim().slice(0, 14) || 'Googly' + Math.floor(Math.random() * 90 + 10);
  localStorage.setItem('gg-name', myName); localStorage.setItem('gg-color', myColor);
  world.scene.remove(me.fig.group); me.fig = new Googly(myColor); me.fig.onStep = v => sfx.step(v); me.fig.setOutfit(wardrobe.outfit); world.scene.add(me.fig.group); setPet(me, null); setPet(me, wardrobe.outfit.pet, myColor);
  connect();
};
$('nm').addEventListener('keydown', e => { if (e.key === 'Enter') $('go').click(); });

function show(id) { for (const s of ['scr-name', 'scr-browse']) $(s).classList.toggle('hidden', s !== id); $('hud').classList.toggle('hidden', id !== 'hud'); }

// ---------------------------------------------------------------- networking
let handlers = {};
function send(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); }
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => send({ t: 'hello', name: myName, color: myColor, outfit: wardrobe.outfit });
  ws.onmessage = e => { const m = JSON.parse(e.data); onMsg(m); (handlers[m.t] || []).forEach(f => f(m)); };
  ws.onclose = () => { toast('Disconnected — reconnecting…', '#ff8a8a'); setTimeout(connect, 1500); inRoom = false; };
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome': myId = m.id; reels = m.reels; break;
    case 'rooms':
      if (!inRoom) { show('scr-browse'); renderRooms(m.list); if (wantRoom && !onMsg.tried) { onMsg.tried = true; send({ t: 'join', code: wantRoom }); } }
      break;
    case 'joined': inRoom = true; show('hud'); history.replaceState(null, '', `?room=${m.code}`); break;
    case 'room': onRoom(m); break;
    case 'snap': onSnap(m.p); break;
    case 'gone': { const o = others.get(m.id); if (o) { world.scene.remove(o.fig.group); setPet(o, null); others.delete(m.id); } break; }
    case 'chat': onChat(m); break;
    case 'pop': onPop(m); break;
    case 'start': enterCasino(); toast('THE DOORS ARE OPEN!', '#ffd84a'); sfx.fanfare(); closePanel(); break;
    case 'nightStart': closeOverlay(); closePanel(); sleeping = false; $('overlay').classList.add('hidden'); toast(`NIGHT ${m.night}`, '#ffd84a'); sfx.bell(); placeInCasino(); break;
    case 'nightEnd': onNightEnd(m); break;
    case 'lobby': closeOverlay(); closePanel(); enterLobby(); toast('Back in the lobby', '#8cc4ff'); break;
    case 'bankrupt': onBankrupt(); break;
    case 'kicked': inRoom = false; room = null; clearOthers(); toast('The host removed you from the lobby.', '#ff8a8a'); break;
    case 'snack': toast('Nom! A cold pizza slice. +3 Lucky Lemonade rounds', '#ffe14d'); sfx.gulp(); me.fig.cheer(); break;
    case 'error': toast(m.msg, '#ff8a8a'); sfx.nope(); break;
  }
}

// ---------------------------------------------------------------- lobby browser
function renderRooms(list) {
  const el = $('rooms');
  el.innerHTML = '';
  const open = list.filter(r => r.count < r.max);
  if (!open.length) el.innerHTML = `<div class="empty">No open lobbies right now — create one and invite friends!</div>`;
  for (const r of open.sort(() => Math.random() - 0.5)) {
    const row = document.createElement('div'); row.className = 'roomrow';
    row.innerHTML = `<div><b>${esc(r.name)}</b><small>host ${esc(r.host)} · ${r.state === 'playing' ? 'game in progress' : 'in lobby'} · code ${r.code}</small></div><div>${r.count}/${r.max}</div>`;
    const b = document.createElement('button'); b.textContent = 'JOIN'; b.className = 'green';
    b.onclick = () => { sfx.click(); send({ t: 'join', code: r.code }); };
    row.append(b); el.append(row);
  }
}
$('solo').onclick = () => { sfx.click(); send({ t: 'solo', nights: +$('solonights').value, difficulty: +$('solodiff').value }); };
$('create').onclick = () => { sfx.click(); send({ t: 'create', name: $('lobbyname').value.trim(), public: $('pub').checked, max: +$('maxp').value }); };
$('joincode').onclick = () => { sfx.click(); send({ t: 'join', code: $('code').value.trim().toUpperCase() }); };
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('joincode').click(); });
$('back').onclick = () => { show('scr-name'); ws?.close(); ws = null; };
setInterval(() => { if (!inRoom && ws?.readyState === 1 && !$('scr-browse').classList.contains('hidden')) send({ t: 'list' }); }, 3000);

// ---------------------------------------------------------------- room state
function mine() { return room?.players.find(p => p.id === myId); }
function onRoom(m) {
  const first = !room;
  const wasState = room?.state;
  room = m;
  if (first) { if (m.state === 'playing') enterCasino(); else enterLobby(); }
  else if (wasState !== m.state && m.state === 'lobby') enterLobby();
  const p = mine();
  if (p) {
    $('cash').textContent = money(p.cash);
    $('cash').style.color = p.cash < 100 ? '#ff8a8a' : '#8dffa0';
    const b = p.boosts || {};
    $('boosts').textContent = [b.lemon ? `LEMONADE ×${b.lemon}` : '', b.fizz ? 'FIZZ' : '', b.gold ? `GOLDEN ×${b.gold}` : ''].filter(Boolean).join(' · ');
  }
  // leaderboard
  const sorted = [...m.players].sort((a, b) => (b.cash + (b.safe || 0)) - (a.cash + (a.safe || 0)));
  $('board').innerHTML = `<div style="color:#ffd84a;font-size:11px">${esc(m.name)} · ${m.players.filter(q => !q.bot).length}/${m.max}${m.players.some(q => q.bot) ? ' + 4 🤖' : ''}</div>` + sorted.map((q, i) =>
    `<div class="${q.id === myId ? 'me' : ''} ${q.bankrupt ? 'dead' : ''}"><span>${i + 1}. <span class="dot" style="background:${q.color}"></span>${esc(q.name)}${q.bot ? ' 🤖' : ''}${q.id === m.host ? ' 👑' : ''}</span><span>${money(q.cash + (q.safe || 0))}</span></div>`).join('');
  // lobby bar
  const inLobby = m.state === 'lobby';
  $('lobbybar').classList.toggle('hidden', !inLobby);
  $('cashbox').classList.toggle('hidden', inLobby);
  if (inLobby) {
    $('lobbyinfo').textContent = `${m.name} · CODE ${m.code}`;
    $('lobbyplayers').innerHTML = m.players.map(q => `<span style="color:${q.color};margin:0 6px">● ${esc(q.name)}${q.id === m.host ? ' 👑' : ''}</span>`).join('');
    const host = m.host === myId;
    $('start').classList.toggle('hidden', !host); $('nights').classList.toggle('hidden', !host); $('lobbymax').classList.toggle('hidden', !host);
    const sel = $('lobbymax');
    if (sel.dataset.v !== `${m.max}/${m.players.length}`) {
      sel.dataset.v = `${m.max}/${m.players.length}`;
      sel.innerHTML = [2, 3, 4, 5, 6, 7, 8].filter(n => n >= m.players.length).map(n => `<option value="${n}" ${n === m.max ? 'selected' : ''}>max ${n}</option>`).join('');
    }
    $('waiting').textContent = host ? `You're the host — START whenever you like, even solo (${m.players.length}/${m.max} here).` : `Waiting for the host to start… (${m.players.length}/${m.max})`;
  }
  // name tags on others show their money in the casino
  for (const q of m.players) {
    const o = others.get(q.id);
    if (o) { const sub = m.state === 'lobby' ? '' : money(q.cash); if (o.fig.tagText !== q.name + sub) o.fig.setName(q.name, sub); o.fig.setOutfit(q.outfit || {}); setPet(o, q.outfit?.pet, q.color); }
  }
  // done-for-tonight / ready button
  const db = $('donebtn');
  const playing = m.state === 'playing' && p && !p.bankrupt;
  db.classList.toggle('hidden', !playing);
  if (playing) {
    const others = m.players.filter(q => !q.bankrupt && !q.bot);
    if (m.phase === 'night') {
      const n = others.filter(q => q.done).length;
      db.textContent = p.done ? `↩ BACK TO THE TABLES (${n}/${others.length} done)` : (others.length > 1 ? `🛌 DONE FOR TONIGHT (${n}/${others.length})` : '🛌 DONE FOR TONIGHT');
      db.className = p.done ? 'grey' : 'purple';
    } else if (m.phase === 'break') {
      const hum = m.players.filter(q => !q.bot), n = hum.filter(q => q.ready).length;
      db.textContent = p.ready ? `WAITING FOR OTHERS (${n}/${hum.length})` : `🛏 SLEEP → NIGHT ${m.night + 1}`;
      db.className = p.ready ? 'grey' : 'green';
    }
    const rl = document.querySelector('.readyline');
    if (rl && m.phase === 'break') rl.textContent = 'Ready: ' + m.players.filter(q => !q.bot).map(q => `${q.ready ? '✅' : '⏳'} ${q.name}`).join('  ');
  }
  updateClock();
}
$('donebtn').onclick = () => { sfx.click(); if (room?.phase === 'break') goToSleep(); else send({ t: 'done' }); };
$('lobbymax').onchange = () => send({ t: 'setMax', max: +$('lobbymax').value });
$('start').onclick = () => { sfx.click(); send({ t: 'start', nights: +$('nights').value }); };
$('leave').onclick = () => leaveRoom();
$('invite').onclick = async () => {
  const url = `${location.origin}/?room=${room.code}`;
  try { if (navigator.share && isMobile) await navigator.share({ title: 'Googly Gamble', text: `Join my Googly Gamble lobby! Code ${room.code}`, url }); else { await navigator.clipboard.writeText(url); toast('Invite link copied!', '#8dffa0'); } }
  catch { prompt('Send this link to your friends:', url); }
};
function leaveRoom() { send({ t: 'leave' }); inRoom = false; room = null; clearOthers(); closePanel(); closeOverlay(); history.replaceState(null, '', '/'); }
function clearOthers() { for (const o of others.values()) { world.scene.remove(o.fig.group); setPet(o, null); } others.clear(); }

function enterLobby() { setMood('lobby'); where = 'lobby'; me.x = (Math.random() - 0.5) * 6; me.z = 4.5; me.yaw = Math.PI; camYaw = Math.PI; }
function enterCasino() { where = 'casino'; placeInCasino(); }
function placeInCasino() { setMood('casino'); where = 'casino'; me.x = (Math.random() - 0.5) * 4; me.z = 11; me.yaw = Math.PI; camYaw = Math.PI; }

// ---------------------------------------------------------------- others
function onSnap(list) {
  const seen = new Set();
  for (const [id, x, z, yaw, moving, inCasino] of list) {
    if (id === myId) continue;
    seen.add(id);
    let o = others.get(id);
    if (!o) {
      const q = room?.players.find(p => p.id === id);
      if (!q) continue;
      o = { fig: new Googly(q.color, q.name), x, z, yaw, tx: x, tz: z, tyaw: yaw, pet: null };
      o.fig.setOutfit(q.outfit || {}); setPet(o, q.outfit?.pet, q.color);
      o.fig.onStep = v => { const d = Math.hypot(o.x - me.x, o.z - me.z); if (d < 8 && o.where === where) sfx.step(v * 0.3 * (1 - d / 8)); };
      world.scene.add(o.fig.group);
      others.set(id, o);
    }
    o.tx = x; o.tz = z; o.tyaw = yaw; o.moving = moving; o.where = inCasino === 1 ? 'casino' : inCasino === 2 ? 'hotel' : 'lobby';
  }
  for (const [id, o] of others) if (!seen.has(id)) { world.scene.remove(o.fig.group); setPet(o, null); others.delete(id); }
}
const off = w => w === 'lobby' ? LOBBY_OFF : w === 'hotel' ? HOTEL_OFF : new THREE.Vector3();

// ---------------------------------------------------------------- chat, pops, toast
function onChat(m) {
  const d = document.createElement('div');
  if (m.system) { d.className = 'sys'; d.textContent = m.text; }
  else { d.innerHTML = `<b style="color:${m.color}">${esc(m.name)}:</b> ${esc(m.text)}`; const f = m.id === myId ? me.fig : others.get(m.id)?.fig; f?.say(m.text); if (m.id !== myId) sfx.chat(); }
  $('log').append(d);
  while ($('log').children.length > 8) $('log').firstChild.remove();
  setTimeout(() => { d.style.opacity = 0.5; }, 12000);
}
$('chatform').onsubmit = e => { e.preventDefault(); const v = $('say').value.trim(); if (v) send({ t: 'chat', text: v }); $('say').value = ''; $('say').blur(); $('chat').classList.remove('open'); };
// phones: the chat box hides behind a 💬 button so it never covers the joystick
$('chatbtn').onclick = () => { const open = $('chat').classList.toggle('open'); sfx.click(); if (open) $('say').focus(); else $('say').blur(); };
function onPop(m) {
  const f = m.id === myId ? me.fig : others.get(m.id)?.fig;
  if (!f || (m.id !== myId && others.get(m.id)?.where !== where)) return;
  const p = f.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)).project(world.camera);
  if (p.z > 1) return;
  const d = document.createElement('div');
  d.className = 'pop' + (Math.abs(m.net) >= 500 ? ' big' : '');
  d.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
  d.style.color = m.net > 0 ? '#8dffa0' : m.net < 0 ? '#ff8a8a' : '#fff';
  d.textContent = signed(m.net);
  $('pops').append(d); setTimeout(() => d.remove(), 1700);
  if (m.id !== myId) { if (m.net > 150) f.cheer(m.net > 500); else if (m.net < -150) f.sulk(); }
}
let toastT = 0;
function toast(text, color = '#fff') { const t = $('toast'); t.textContent = text; t.style.color = color; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, 1800); }

// ---------------------------------------------------------------- nights
function updateClock() {
  const el = $('topleft');
  if (!room) return;
  if (room.state === 'lobby') { el.innerHTML = `LOBBY<span class="clock">${room.players.length}/${room.max} players</span>`; return; }
  if (room.state === 'ended') { el.innerHTML = `MONTH OVER<span class="clock">final results</span>`; return; }
  const left = Math.max(0, (room.phaseEndLocal || 0) - performance.now()) / 1000;
  const total = room.phase === 'night' ? (room.nightSec || 150) : 12;
  const mins = room.phase === 'night' ? Math.floor((1 - left / total) * 480) : 480;
  const h24 = (20 + Math.floor(mins / 60)) % 24, h12 = h24 % 12 || 12;
  el.innerHTML = `NIGHT ${room.night} OF ${room.nights}<span class="clock">${room.phase === 'break' ? 'CLOSED' : `${h12}:${String(mins % 60).padStart(2, '0')} ${h24 >= 12 && h24 < 24 && h24 !== 0 ? 'PM' : 'AM'}`}</span>`;
}
const _onRoom = onRoom;
function trackTime(m) { if (m.t === 'room') { room.phaseEndLocal = performance.now() + m.timeLeft * 1000; if (m.phase === 'night' && !room.nightSec) room.nightSec = Math.max(m.timeLeft, 30); } }
setInterval(updateClock, 500);

let taxiT = -1, pendingEnd = null, sleeping = false;
function onNightEnd(m) {
  closePanel();
  if (!m.final) {
    pendingEnd = m;
    where = 'car'; taxiT = 0; world.taxi.position.x = -34; setMood('hotel'); sfx.bell();
    toast('TAXI TO THE HOTEL · tap to skip', '#f5c518');
    return;
  }
  showResults(m);
}
function arriveHotel() {
  taxiT = -1; where = 'hotel'; me.x = 0.6; me.z = 1.2; me.yaw = Math.PI; camYaw = Math.PI;
  if (pendingEnd) showResults(pendingEnd);
  pendingEnd = null;
}
function showResults(m) {
  sfx.bell();
  const rows = m.standings.map((s, i) => `<div class="stand"><span>${m.final && s.coins ? `<small style="color:#ffd84a">🪙${s.coins}</small> ` : ''}${m.final ? ['🥇', '🥈', '🥉'][i] || (i + 1) + '.' : (i + 1) + '.'} <span class="dot" style="background:${s.color}"></span>${esc(s.name)}${s.id === myId ? ' (you)' : ''}${s.bankrupt ? ' · BANKRUPT' : ''}</span><span>${money(s.cash)} <small style="opacity:.7">${m.final ? '' : 'tonight ' + signed(s.tonight)}</small></span></div>`).join('');
  const winner = m.standings[0];
  const host = room?.host === myId;
  showOverlay(`<div class="card wide"><h2>${m.final ? (winner.id === myId ? 'YOU WIN THE MONTH!' : `${esc(winner.name)} WINS!`) : `NIGHT ${m.night} IS OVER`}</h2>
    <p class="sub">${m.final ? `${m.nights} nights at the Googly Grand` : `You're back in your hotel room. Walk around (TV, safe, fridge, window) — go to bed when you're ready for night ${m.night + 1} of ${m.nights}.`}</p>${rows}
    ${m.final ? '' : '<div class="readyline"></div>'}
    <div class="row">${m.final ? (host ? '<button id="tolobby" class="green">BACK TO LOBBY</button>' : '<p class="tiny">Waiting for the host…</p>') : `<button id="readybtn" class="green">▶ READY</button>${host && room.players.filter(q => !q.bot).length > 1 ? '<button id="forcenext" class="gold">START NEXT NIGHT</button>' : ''}`}<button id="closeov" class="grey">LOOK AROUND</button></div></div>`);
  if ($('readybtn')) { $('readybtn').textContent = '🛏 SLEEP → NIGHT ' + (m.night + 1); $('readybtn').onclick = () => { closeOverlay(); goToSleep(); }; }
  if ($('forcenext')) $('forcenext').onclick = () => { send({ t: 'nextNight' }); sfx.click(); };
  if (m.final) {
    (winner.id === myId ? sfx.fanfare : sfx.aww)(); if (winner.id === myId) me.fig.cheer(true);
    const mineRow = m.standings.find(s => s.id === myId);
    if (mineRow?.coins && !onNightEnd.paid?.has(room.code + m.nights + mineRow.cash)) {
      (onNightEnd.paid ||= new Set()).add(room.code + m.nights + mineRow.cash);
      addCoins(mineRow.coins); coinLabels();
      setTimeout(() => { toast(`+${mineRow.coins.toLocaleString()} COINS! 🪙`, '#ffd84a'); sfx.coins(); }, 900);
    }
  }
  $('closeov').onclick = closeOverlay;
  if ($('tolobby')) $('tolobby').onclick = () => send({ t: 'toLobby' });
}
function onBankrupt() {
  closePanel(); sfx.bankrupt(); me.fig.sulk();
  showOverlay(`<div class="card bankrupt"><h2>BANKRUPT!</h2><p class="sub">You lost every chip. <b>YOU LOSE.</b></p><p>You can keep walking around and chatting while the others finish the month.</p><div class="row"><button id="closeov" class="grey">WATCH</button><button id="quitroom" class="red">LEAVE LOBBY</button></div></div>`);
  $('closeov').onclick = closeOverlay; $('quitroom').onclick = () => { closeOverlay(); leaveRoom(); };
}
function goToSleep() {
  if (sleeping) return;
  sleeping = true; send({ t: 'ready' }); sfx.bell();
  const waiting = () => room?.players.filter(q => !q.bot && !q.ready).map(q => q.name).join(', ');
  showOverlay(`<div class="card"><h2>Z z z …</h2><p class="sub">Sweet googly dreams.</p><p class="readyline" id="zzz"></p></div>`);
  const tick = () => { if (!sleeping) return; const w = waiting(); const z = $('zzz'); if (z) z.textContent = w ? `Waiting for ${w} to go to bed…` : 'Morning is coming…'; setTimeout(tick, 500); };
  tick();
}
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function closeOverlay() { $('overlay').classList.add('hidden'); }

// ---------------------------------------------------------------- game panels
let panelOpen = null;
function openPanel(kind) {
  if (!reels) return;
  if (kind === 'bed') return goToSleep();
  if (kind === 'window') { toast('The city glitters. The Googly Grand is still ringing…', '#9ad0ff'); camYaw = Math.PI; camPitch = 0.05; return; }
  if (kind === 'fridge') { send({ t: 'snack' }); return; }
  const p = mine();
  if (where === 'hotel' && kind !== 'safe' && kind !== 'tv') return;
  if (p?.bankrupt) { toast("You're bankrupt — spectating", '#ff8a8a'); return; }
  if (room?.phase !== 'night' && where !== 'hotel') { toast('The casino is closed right now.', '#ffb3b3'); return; }
  closePanel();
  const local = {};
  const api = {
    send, memo, reels,
    on: (t, f) => { (local[t] ||= []).push(f); (handlers[t] ||= []).push(f); },
    closeBtn: () => { const b = document.createElement('button'); b.className = 'grey'; b.textContent = 'LEAVE'; b.onclick = closePanel; return b; },
    cash: () => mine()?.cash ?? 0,
    safe: () => mine()?.safe ?? 0,
    standings: () => (room?.players || []).map(q => ({ name: q.name, cash: q.cash + (q.safe || 0), tonight: q.cash + (q.safe || 0) - (q.nightStart || 1000) })).sort((a, b) => b.cash - a.cash),
    tvShow: (t, l, c) => world.showOnTV(t, l, c),
    toast, cheer: big => me.fig.cheer(big), sulk: () => me.fig.sulk(),
  };
  const el = Games[kind](api);
  $('panel').innerHTML = ''; $('panel').append(el); $('panel').classList.remove('hidden');
  panelOpen = { kind, local };
  sfx.click();
}
function closePanel() {
  if (!panelOpen) return;
  for (const [t, fs] of Object.entries(panelOpen.local)) handlers[t] = (handlers[t] || []).filter(f => !fs.includes(f));
  panelOpen = null; $('panel').classList.add('hidden'); $('panel').innerHTML = '';
}

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', e => {
  if (document.activeElement?.tagName === 'INPUT') { if (e.key === 'Escape') document.activeElement.blur(); return; }
  keys.add(e.code);
  if (e.code === 'Enter' && inRoom) { e.preventDefault(); $('say').focus(); }
  if (e.code === 'KeyE' || e.code === 'Space') { if (where === 'car') arriveHotel(); else act(); }
  if (e.code === 'Escape') { if (panelOpen) closePanel(); else closeOverlay(); }
  if (e.code === 'KeyM') toast(toggleMute() ? 'MUTED' : 'SOUND ON');
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
$('act').onclick = () => { if (where === 'car') arriveHotel(); else act(); };
$('menubtn').onclick = () => {
  showOverlay(`<div class="card"><h2>MENU</h2><div class="row"><button id="m-mute" class="grey">SOUND ON/OFF</button><button id="m-leave" class="red">LEAVE LOBBY</button><button id="m-close">CLOSE</button></div><p class="tiny">${isMobile ? 'Joystick to walk (push all the way to run) · PLAY to use a table · drag to look · pinch to zoom · 💬 to chat' : 'WASD / joystick to walk · Shift to run · E or PLAY to use a table · drag to look · Enter to chat · F full screen'}</p></div>`);
  $('m-mute').onclick = () => toast(toggleMute() ? 'MUTED' : 'SOUND ON');
  $('m-leave').onclick = () => { closeOverlay(); leaveRoom(); };
  $('m-close').onclick = closeOverlay;
};
// camera drag (mouse, or a finger on the empty right side)
let drag = null;
const fingers = new Map(); let pinch0 = 0;   // two fingers on the 3D view = pinch zoom
const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
$('view').addEventListener('pointerdown', e => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; unlockAudio(); if (where === 'car' && taxiT > 0.5) arriveHotel();
  if (e.pointerType === 'touch') { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (fingers.size === 2) { pinch0 = spread(); drag = null; } }
});
addEventListener('pointerup', e => fingers.delete(e.pointerId)); addEventListener('pointercancel', e => { fingers.delete(e.pointerId); if (drag?.id === e.pointerId) drag = null; });
addEventListener('pointermove', e => {
  if (fingers.has(e.pointerId)) { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (fingers.size === 2) { const d = spread(); if (pinch0 > 0 && d > 0) camDist = Math.min(9, Math.max(2.2, camDist * pinch0 / d)); pinch0 = d; return; } }
  if (drag && e.pointerId === drag.id) { camYaw -= (e.clientX - drag.x) * 0.006; camPitch = Math.min(1.1, Math.max(0.05, camPitch + (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; } });
addEventListener('pointerup', e => { if (drag?.id === e.pointerId) drag = null; });
addEventListener('wheel', e => { camDist = Math.min(9, Math.max(2.2, camDist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: true });
// joystick
const stick = { x: 0, y: 0, id: null };
const knob = $('knob'), stickEl = $('stick');
stickEl.addEventListener('pointerdown', e => { stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); e.stopPropagation(); });
stickEl.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
stickEl.addEventListener('pointercancel', () => stickEl.dispatchEvent(new PointerEvent('pointerup')));
stickEl.addEventListener('pointerup', () => { stick.id = null; stick.x = stick.y = 0; knob.style.left = '40px'; knob.style.top = '40px'; });
function moveStick(e) {
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  stick.x = dx; stick.y = dy;
  knob.style.left = (40 + dx * 40) + 'px'; knob.style.top = (40 + dy * 40) + 'px';
}

// full screen (the whole page, so the HUD and panels come along)
const isIOS = /iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !document.documentElement.requestFullscreen);
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  const on = d.fullscreenElement || d.webkitFullscreenElement;
  if (on) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && !isIOS) { req.call(el, { navigationUI: 'hide' })?.catch?.(() => {}); screen.orientation?.lock?.('landscape').catch(() => {}); }
  else toast('On iPhone: tap Share → Add to Home Screen for full screen', '#ffd84a');
}
const fsIcon = () => { const on = document.fullscreenElement || document.webkitFullscreenElement; $('fsbtn').textContent = on ? '🗗' : '⛶'; $('fsbtn2').textContent = on ? '🗗 EXIT FULL SCREEN' : '⛶ FULL SCREEN'; };
$('fsbtn').onclick = toggleFullscreen; $('fsbtn2').onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', fsIcon); document.addEventListener('webkitfullscreenchange', fsIcon);
addEventListener('keydown', e => { if (e.code === 'KeyF' && document.activeElement?.tagName !== 'INPUT') toggleFullscreen(); });

let nearby = null;
function act() {
  if (!inRoom || panelOpen || !$('overlay').classList.contains('hidden')) return;
  if (nearby) openPanel(nearby.kind);
}

// ---------------------------------------------------------------- loop
let last = performance.now(), sendT = 0, t = 0;
handlers.room = [trackTime];
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  const typing = document.activeElement?.tagName === 'INPUT';
  // movement
  let mx = 0, mz = 0;
  if (inRoom && !panelOpen && !typing) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (stick.id !== null) { mx += stick.x; mz -= stick.y; }
  }
  const dirX = Math.sin(camYaw), dirZ = Math.cos(camYaw);
  let wx = dirX * mz - dirZ * mx, wz = dirZ * mz + dirX * mx;
  const l = Math.hypot(wx, wz);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(stick.x, stick.y) > 0.95;
  const fizz = mine()?.boosts?.fizz && where === 'casino';
  const speed = (run ? 3.3 : 1.75) * (fizz ? 1.6 : 1);
  if (l > 1) { wx /= l; wz /= l; }
  me.vx += (wx * speed - me.vx) * (1 - Math.exp(-10 * dt));
  me.vz += (wz * speed - me.vz) * (1 - Math.exp(-10 * dt));
  const ox = me.x, oz = me.z;
  [me.x, me.z] = world.resolve(where, me.x + me.vx * dt, me.z + me.vz * dt);
  for (const o of others.values()) if (o.where === where) { const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz); if (d < 0.65 && d > 1e-3) { me.x += dx / d * (0.65 - d) * 0.5; me.z += dz / d * (0.65 - d) * 0.5; } }
  const actual = Math.hypot(me.x - ox, me.z - oz) / dt;
  if (l > 0.1) { const ty = Math.atan2(wx, wz); let d = ty - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); me.yaw += d * (1 - Math.exp(-9 * dt)); }
  const O = off(where);
  me.fig.group.position.set(me.x + O.x, 0, me.z + O.z);
  me.fig.group.rotation.y = me.yaw;
  me.fig.group.visible = inRoom;
  me.fig.update(dt, actual, run);
  if (me.pet) { me.pet.group.visible = inRoom; me.pet.update(dt, me.fig.group.position, me.yaw); }
  // others
  for (const o of others.values()) {
    const k = 1 - Math.exp(-10 * dt);
    const px = o.x, pz = o.z;
    o.x += (o.tx - o.x) * k; o.z += (o.tz - o.z) * k;
    let d = o.tyaw - o.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); o.yaw += d * k;
    const oo = off(o.where);
    o.fig.group.position.set(o.x + oo.x, 0, o.z + oo.z);
    o.fig.group.rotation.y = o.yaw;
    o.fig.group.visible = o.where === where && where !== 'hotel' && where !== 'car';
    o.fig.update(dt, o.moving ? Math.hypot(o.x - px, o.z - pz) / dt : 0);
    if (o.pet) { o.pet.group.visible = o.fig.group.visible; o.pet.update(dt, o.fig.group.position, o.yaw); }
  }
  // send position
  sendT -= dt;
  if (inRoom && sendT <= 0) { sendT = 1 / 15; send({ t: 'pos', x: me.x, z: me.z, yaw: me.yaw, moving: actual > 0.2, where }); }
  // stations
  nearby = null;
  if ((where === 'casino' || where === 'hotel') && inRoom) {
    let bd = 1.4;
    for (const s of world.stations) {
      if (s.where !== where) continue; const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < bd) { bd = d; nearby = s; } }
  }
  const pr = $('prompt');
  if (nearby && !panelOpen) { pr.textContent = `${isMobile ? 'Tap PLAY' : 'E'} · ${nearby.title}`; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
  $('act').style.opacity = nearby && !panelOpen ? 1 : 0.35;
  document.body.classList.toggle('inlobby', where === 'lobby');
  // taxi ride between the casino and the hotel
  if (where === 'car') {
    taxiT += dt;
    const u = Math.min(1, taxiT / 6), e = u * u * (3 - 2 * u);
    world.taxi.position.x = -34 + 80 * e;
    world.wheels.forEach(w => { w.rotation.y -= dt * 20 * Math.sin(Math.PI * u + 0.1); });
    me.fig.group.visible = false; if (me.pet) me.pet.group.visible = false;
    const tp = world.taxi.position.clone().add(STREET_OFF);
    world.camera.position.lerp(tp.clone().add(new THREE.Vector3(-2.5, 2.4, 9)), 1 - Math.exp(-8 * dt));
    world.camera.lookAt(tp.clone().add(new THREE.Vector3(1.5, 1, 0)));
    if (taxiT > 6.3) arriveHotel();
    world.animate(dt, t); world.renderer.render(world.scene, world.camera); requestAnimationFrame(frame); return;
  }
  // camera
  const target = new THREE.Vector3(me.x + O.x, 1.35, me.z + O.z);
  let cam;
  if (!inRoom) { const a = t * 0.06; cam = new THREE.Vector3(Math.sin(a) * 12, 4.5, Math.cos(a) * 9); target.set(0, 1, 0); }
  else {
    const dist = panelOpen ? 3 : where === 'hotel' ? Math.min(camDist, 2.6) : camDist;
    cam = target.clone().add(new THREE.Vector3(-dirX * dist * Math.cos(camPitch), dist * Math.sin(camPitch), -dirZ * dist * Math.cos(camPitch)));
    const b = world.bounds[where];
    cam.x = Math.min(Math.max(cam.x, b.x0 + O.x + 0.3), b.x1 + O.x - 0.3); cam.z = Math.min(Math.max(cam.z, b.z0 + O.z + 0.3), b.z1 + O.z - 0.3); cam.y = Math.min(cam.y, where === 'lobby' ? 3.9 : where === 'hotel' ? 2.7 : 4.9);
  }
  world.camera.position.lerp(cam, 1 - Math.exp(-7 * dt));
  world.camera.lookAt(target);
  world.animate(dt, t);
  world.renderer.render(world.scene, world.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show('scr-name');
// test/debug handle (read-only use from test/mobile.mjs)
window.gg = { me, stick, fingers, get where() { return where; }, get panel() { return panelOpen?.kind || null; }, get room() { return room; }, get cam() { return { camYaw, camPitch, camDist }; }, get nearby() { return nearby?.kind || null; }, isMobile, openPanel };
if (myName && wantRoom) $('go').click();
// test hook: ?bot=1[&panel=slot] creates a lobby, starts, and optionally opens a table
if (QS.get('bot')) {
  if (QS.get('dress')) { const [sh, pa, ha, pe] = QS.get('dress').split(','); Object.assign(wardrobe.outfit, { shirt: sh, pants: pa, hat: ha, pet: pe }); wardrobe.coins = 2600; }
  if (QS.get('shop')) setTimeout(showShop, 1500);
  if (QS.get('solo')) (handlers.rooms ||= []).push(() => { if (!inRoom && !onMsg.botSent) onMsg.botSent = send({ t: 'solo', nights: 3, difficulty: 1 }) || true; });
  if (QS.get('hotel')) (handlers.start ||= []).push(() => setTimeout(() => send({ t: 'done' }), 1500));
  $('nm').value = 'Tester'; $('go').click();
  (handlers.rooms ||= []).push(() => { if (!inRoom && !QS.get('stay') && !QS.get('solo') && !onMsg.botSent) { onMsg.botSent = true; send({ t: 'create', name: 'Bot Lobby' }); } });
  (handlers.joined ||= []).push(() => { if (QS.get('start')) setTimeout(() => send({ t: 'start', nights: 3 }), 600); });
  (handlers.start ||= []).push(() => { const k = QS.get('panel'); if (k) setTimeout(() => { const s = world.stations.find(x => x.kind === k); me.x = s.x; me.z = s.z; openPanel(k); }, 800); });
}
