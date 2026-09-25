// Googly Gamble — lobby + casino server. Play money only.
// The server owns every dollar and every random number; clients only animate results.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const MAX_PLAYERS = 8;
const NIGHT_SEC = Number(process.env.NIGHT_SEC || 300);
const BREAK_SEC = 12;
const START_CASH = 1000;

// ---------------------------------------------------------------- static files
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url.startsWith('/three/')) file = path.join(ROOT, 'node_modules/three/build', path.basename(url));
  else file = path.join(ROOT, 'public', url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- casino rules (same odds as the Mac game)
const rnd = n => Math.floor(Math.random() * n);

// Slots: three 22-stop reels, a symbol on every other stop. RTP 91.7%.
const SYM = ['blank', 'cherry', 'bar', 'bar2', 'bar3', 'seven', 'diamond'];
function strip(counts, blanks) {
  const s = [];
  for (const [k, n] of counts) for (let i = 0; i < n; i++) s.push(k);
  const order = [0, 5, 2, 7, 4, 9, 1, 6, 3, 8, 10, 11, 12];
  const picked = order.filter(o => o < s.length).map(o => s[o]);
  const out = []; let b = blanks;
  for (const p of picked) { out.push(p); if (b > 0) { out.push('blank'); b--; } }
  while (b > 0) { out.splice(out.length >> 1, 0, 'blank'); b--; }
  return out;
}
const REELS = [
  strip([['diamond', 1], ['seven', 1], ['bar3', 1], ['bar2', 2], ['bar', 3], ['cherry', 2]], 12),
  strip([['diamond', 1], ['seven', 1], ['bar3', 2], ['bar2', 2], ['bar', 3], ['cherry', 2]], 11),
  strip([['diamond', 1], ['seven', 1], ['bar3', 1], ['bar2', 2], ['bar', 4], ['cherry', 2]], 11),
];
const isBar = s => s === 'bar' || s === 'bar2' || s === 'bar3';
function slotPay(a, b, c) {
  if (a === b && b === c) return { diamond: 1000, seven: 200, bar3: 60, bar2: 30, bar: 20, cherry: 30, blank: 0 }[a];
  if ([a, b, c].every(isBar)) return 5;
  const ch = [a, b, c].filter(x => x === 'cherry').length;
  return ch === 2 ? 5 : ch === 1 ? 2 : 0;
}

// Cards: 6-deck shoe, dealer stands on all 17s, blackjack pays 3:2, double on any two.
function newShoe() { const c = []; for (let d = 0; d < 6; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) c.push({ r, s }); for (let i = c.length - 1; i > 0; i--) { const j = rnd(i + 1); [c[i], c[j]] = [c[j], c[i]]; } return { cards: c, pos: 0 }; }
function draw(shoe) { if (shoe.pos >= shoe.cards.length * 0.75) { const n = newShoe(); shoe.cards = n.cards; shoe.pos = 0; shoe.shuffled = true; } return shoe.cards[shoe.pos++]; }
function total(h) { let t = 0, a = 0; for (const c of h) { t += c.r === 1 ? 11 : Math.min(c.r, 10); if (c.r === 1) a++; } while (t > 21 && a) { t -= 10; a--; } return t; }
const isBJ = h => h.length === 2 && total(h) === 21;

// Roulette: American double-zero wheel; 37 stands for 00.
const WHEEL = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
function rlWins(t, n, num) {
  if (num === 0 || num === 37) return t === 'num' && n === num;
  switch (t) {
    case 'num': return n === num;
    case 'red': return REDS.has(num);
    case 'black': return !REDS.has(num);
    case 'odd': return num % 2 === 1;
    case 'even': return num % 2 === 0;
    case 'low': return num <= 18;
    case 'high': return num >= 19;
    case 'dozen': return Math.floor((num - 1) / 12) === n;
    default: return false;
  }
}
const rlPayout = t => t === 'num' ? 35 : t === 'dozen' ? 2 : 1;

// Craps: pass line (1.41% edge) and field (2 pays double, 12 triple).
const fieldPay = t => t === 2 ? 2 : t === 12 ? 3 : [3, 4, 9, 10, 11].includes(t) ? 1 : -1;

const DRINKS = { lemon: 50, fizz: 100, gold: 200 };

// Month prizes: 1st 1000 coins, 2nd 500, 3rd 200, then each place gets half the one before.
const coinsFor = place => place === 0 ? 1000 : place === 1 ? 500 : Math.max(1, Math.floor(200 / Math.pow(2, place - 2)));
// Cosmetics are chosen from the shop on the client; the server only relays ids it knows the shape of.
const cleanOutfit = o => {
  const out = {};
  for (const k of ['shirt', 'pants', 'hat', 'pet']) if (o && typeof o[k] === 'string' && /^[a-z0-9]{1,16}$/.test(o[k])) out[k] = o[k];
  return out;
};

// ---------------------------------------------------------------- rooms
const rooms = new Map();
const clients = new Map();
let nextId = 1;
const WORDS = ['LUCKY', 'GOLDEN', 'GOOGLY', 'NEON', 'ROYAL', 'DIAMOND', 'CHERRY', 'BLUE', 'WILD', 'HIGH'];
const WORDS2 = ['SEVENS', 'ACES', 'CHIPS', 'DICE', 'BEANS', 'JACKPOT', 'ROLLERS', 'EYES', 'STREAK', 'VIBES'];
const code4 = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += a[rnd(a.length)]; return rooms.has(s) ? code4() : s; };

function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
function broadcast(room, msg) { const s = JSON.stringify(msg); for (const c of room.players.values()) if (c.ws.readyState === 1) c.ws.send(s); }
function roomList() {
  return [...rooms.values()].filter(r => r.public).map(r => ({ code: r.code, name: r.name, count: r.players.size, max: r.max, state: r.state, host: r.players.get(r.host)?.name || '?', nights: r.nights }));
}
function pushLists() { const list = roomList(); for (const c of clients.values()) if (!c.room) send(c, { t: 'rooms', list }); }
function net(p) { return p.cash; }
function roomState(room) {
  return {
    t: 'room', code: room.code, name: room.name, host: room.host, max: room.max, state: room.state, nights: room.nights, night: room.night, phase: room.phase,
    timeLeft: Math.max(0, Math.round(room.phaseEnd - Date.now()) / 1000),
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, outfit: p.outfit || {}, cash: p.cash, safe: p.safe || 0, bot: !!p.bot, bankrupt: p.bankrupt, done: !!p.doneTonight, ready: !!p.ready, nightStart: p.nightStart, best: p.best, boosts: p.boosts })),
  };
}
function syncRoom(room) { broadcast(room, roomState(room)); }

function joinRoom(c, room) {
  if (process.env.DEBUG) console.log('join', c.id, c.name, room.code);
  if (room.players.size >= room.max) return send(c, { t: 'error', msg: `That lobby is full (${room.max}/${room.max}).` });
  leaveRoom(c);
  c.room = room;
  resetPlayer(c, room.state === 'playing');
  room.players.set(c.id, c);
  if (!room.host || !room.players.has(room.host)) room.host = c.id;
  send(c, { t: 'joined', code: room.code });
  syncRoom(room);
  broadcast(room, { t: 'chat', system: true, text: `${c.name} joined the ${room.state === 'playing' ? 'game' : 'lobby'}.` });
  pushLists();
}
function leaveRoom(c) {
  const room = c.room;
  if (!room) return;
  room.players.delete(c.id);
  c.room = null;
  const humans = [...room.players.values()].filter(p => !p.bot);
  if (humans.length === 0) { clearInterval(room.timer); clearInterval(room.botTimer); rooms.delete(room.code); }
  else {
    if (room.host === c.id) { room.host = humans[0].id; broadcast(room, { t: 'chat', system: true, text: `${room.players.get(room.host).name} is the new host.` }); }
    broadcast(room, { t: 'chat', system: true, text: `${c.name} left.` });
    broadcast(room, { t: 'gone', id: c.id });
    syncRoom(room);
  }
  pushLists();
}
function resetPlayer(c, lateJoin) {
  c.doneTonight = false; c.ready = false; c.safe = 0; c.snacked = 0;
  c.cash = START_CASH; c.nightStart = START_CASH; c.best = 0; c.bankrupt = false;
  c.bj = null; c.craps = { point: 0 }; c.boosts = { lemon: 0, gold: 0, fizz: false };
  c.where = 'lobby'; c.x = (Math.random() - 0.5) * 6; c.z = 2 + Math.random() * 2; c.yaw = Math.PI; c.moving = 0;
  if (lateJoin) c.where = 'casino';
}

function startGame(room, nights) {
  room.startCash = room.difficulty === 0 ? 1500 : START_CASH;
  room.state = 'playing';
  room.nights = [3, 7, 30].includes(nights) ? nights : 7;
  room.night = 1;
  for (const p of room.players.values()) { resetPlayer(p, true); p.cash = p.nightStart = p.bot ? START_CASH : room.startCash; p.x = (Math.random() - 0.5) * 4; p.z = 12; if (p.bot) botNewNight(p); }
  beginPhase(room, 'night', NIGHT_SEC);
  broadcast(room, { t: 'start' });
  syncRoom(room);
  pushLists();
}
function beginPhase(room, phase, sec) {
  room.phase = phase;
  room.phaseEnd = Date.now() + sec * 1000;
  clearInterval(room.timer);
  room.timer = setInterval(() => tickRoom(room), 250);
}
function standings(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, cash: p.cash + (p.safe || 0), tonight: p.cash + (p.safe || 0) - p.nightStart, bankrupt: p.bankrupt, bot: !!p.bot })).sort((a, b) => b.cash - a.cash);
}
const active = room => [...room.players.values()].filter(p => !p.bankrupt && !p.bot);
function endNightNow(room) { room.phaseEnd = 0; tickRoom(room); }
function tickRoom(room) {
  if (room.phase === 'night' && active(room).length && active(room).every(p => p.doneTonight)) room.phaseEnd = 0;
  if (room.phase === 'break' && [...room.players.values()].every(p => p.ready || p.bot)) room.phaseEnd = 0;
  if (Date.now() < room.phaseEnd) return;
  if (room.phase === 'night') {
    // finish any open blackjack hands by standing
    for (const p of room.players.values()) if (p.bj) bjFinish(p, true);
    const last = room.night >= room.nights;
    const st = standings(room);
    if (last) st.forEach((s, i) => { s.coins = coinsFor(i); });
    broadcast(room, { t: 'nightEnd', night: room.night, nights: room.nights, standings: st, final: last });
    if (last) { room.state = 'ended'; room.phase = 'ended'; clearInterval(room.timer); syncRoom(room); pushLists(); return; }
    for (const p of room.players.values()) p.ready = false;
    beginPhase(room, 'break', 1e9);   // waits for everyone to press READY
  } else if (room.phase === 'break') {
    room.night++;
    for (const p of room.players.values()) { p.doneTonight = false; p.ready = false; p.nightStart = p.cash + (p.safe || 0); if (p.bot) botNewNight(p); p.boosts.fizz = false; p.x = (Math.random() - 0.5) * 4; p.z = 12; }
    beginPhase(room, 'night', NIGHT_SEC);
    broadcast(room, { t: 'nightStart', night: room.night });
  }
  syncRoom(room);
}

// money helpers with drink boosts applied to every settled round
function settle(p, staked, back) {
  p.cash += back;
  let net = back - staked, bonus = 0;
  if (net < 0 && p.boosts.lemon > 0) { bonus = Math.max(1, Math.floor(-net / 4)); p.cash += bonus; }
  if (p.boosts.lemon > 0) p.boosts.lemon--;
  if (net > 0 && p.boosts.gold > 0) { bonus = net; p.cash += net; p.boosts.gold--; }
  if (net + bonus > p.best) p.best = net + bonus;
  return { net, bonus };
}
function checkBankrupt(p) {
  if (p.cash < 1 && !(p.safe > 0) && !p.bj && !p.bankrupt) {
    p.bankrupt = true;
    broadcast(p.room, { t: 'chat', system: true, text: `💸 ${p.name} went BANKRUPT!` });
    send(p, { t: 'bankrupt' });
    tickRoom(p.room);
  }
}
const take = (p, amt) => { amt = Math.floor(amt); if (!(amt > 0) || p.cash < amt) return false; p.cash -= amt; return true; };

function bjFinish(p, forced) {
  const h = p.bj; if (!h) return;
  const shoe = p.room.shoe;
  const pt = total(h.player);
  if (pt <= 21 && !(isBJ(h.player))) while (total(h.dealer) < 17) h.dealer.push(draw(shoe));
  const dt = total(h.dealer);
  let back = 0, word;
  if (isBJ(h.player) && !isBJ(h.dealer)) { back = h.bet + Math.floor(h.bet * 1.5); word = 'Blackjack! Pays 3 to 2'; }
  else if (isBJ(h.dealer) && !isBJ(h.player)) { word = 'Dealer blackjack'; }
  else if (isBJ(h.dealer)) { back = h.bet; word = 'Push'; }
  else if (pt > 21) word = 'Bust';
  else if (dt > 21) { back = h.bet * 2; word = `Dealer busts with ${dt}`; }
  else if (pt > dt) { back = h.bet * 2; word = `${pt} beats ${dt}`; }
  else if (pt === dt) { back = h.bet; word = 'Push'; }
  else word = `${dt} beats ${pt}`;
  const s = settle(p, h.bet, back);
  send(p, { t: 'bj', phase: 'done', player: h.player, dealer: h.dealer, total: pt, dtotal: dt, word, ...s, cash: p.cash, forced: !!forced });
  p.bj = null;
  announce(p, s.net, 'blackjack');
  checkBankrupt(p);
}
function announce(p, net, game) {
  if (Math.abs(net) >= 200) broadcast(p.room, { t: 'chat', system: true, text: `${p.name} ${net > 0 ? 'won' : 'lost'} $${Math.abs(net).toLocaleString()} at ${game}!` });
  broadcast(p.room, { t: 'pop', id: p.id, net });
  syncRoom(p.room);
}

function handleGame(c, m) {
  const room = c.room;
  if (!room || room.state !== 'playing' || room.phase !== 'night') return send(c, { t: 'error', msg: room?.phase === 'break' ? 'The casino is closed between nights.' : 'The game is not running.' });
  if (c.bankrupt) return send(c, { t: 'error', msg: "You're bankrupt — you can watch and chat." });
  switch (m.t) {
    case 'slot': {
      const bet = Math.floor(m.bet);
      if (![1, 5, 25, 100, 500].includes(bet) || !take(c, bet)) return send(c, { t: 'error', msg: 'Not enough money.' });
      const stops = [rnd(22), rnd(22), rnd(22)];
      const syms = stops.map((s, i) => REELS[i][s]);
      const mult = slotPay(...syms);
      const s = settle(c, bet, mult * bet);
      send(c, { t: 'slot', stops, syms, mult, ...s, cash: c.cash });
      setTimeout(() => { announce(c, s.net, 'the slots'); checkBankrupt(c); }, 2000);
      break;
    }
    case 'bj': {
      if (!room.shoe) room.shoe = newShoe();
      const shoe = room.shoe;
      if (m.op === 'deal') {
        if (c.bj) return;
        const bet = Math.floor(m.bet);
        if (!(bet >= 5 && bet <= 5000) || !take(c, bet)) return send(c, { t: 'error', msg: 'Not enough money for that bet.' });
        shoe.shuffled = false;
        c.bj = { bet, player: [draw(shoe), draw(shoe)], dealer: [draw(shoe), draw(shoe)] };
        if (isBJ(c.bj.player) || isBJ(c.bj.dealer)) return bjFinish(c);
        send(c, { t: 'bj', phase: 'play', player: c.bj.player, up: c.bj.dealer[0], total: total(c.bj.player), canDouble: c.cash >= bet, shuffled: shoe.shuffled });
      } else if (c.bj) {
        const h = c.bj;
        if (m.op === 'hit') { h.player.push(draw(shoe)); if (total(h.player) >= 21) return bjFinish(c); send(c, { t: 'bj', phase: 'play', player: h.player, up: h.dealer[0], total: total(h.player), canDouble: false }); }
        else if (m.op === 'stand') bjFinish(c);
        else if (m.op === 'double' && h.player.length === 2 && take(c, h.bet)) { h.bet *= 2; h.player.push(draw(shoe)); bjFinish(c); }
      }
      break;
    }
    case 'roulette': {
      const bets = Array.isArray(m.bets) ? m.bets.slice(0, 40) : [];
      let staked = 0;
      for (const b of bets) { b.amt = Math.floor(b.amt); if (!(b.amt > 0) || !['num', 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen'].includes(b.t)) return; staked += b.amt; }
      if (staked <= 0 || staked > 5000 || !take(c, staked)) return send(c, { t: 'error', msg: 'Not enough money for those bets.' });
      const num = WHEEL[rnd(38)];
      let back = 0;
      for (const b of bets) if (rlWins(b.t, b.n, num)) back += b.amt * (rlPayout(b.t) + 1);
      const s = settle(c, staked, back);
      send(c, { t: 'roulette', num, index: WHEEL.indexOf(num), color: num === 0 || num === 37 ? 'green' : REDS.has(num) ? 'red' : 'black', back, ...s, cash: c.cash });
      setTimeout(() => { announce(c, s.net, 'roulette'); checkBankrupt(c); }, 5200);
      break;
    }
    case 'craps': {
      const pass = Math.floor(m.pass || 0), field = Math.floor(m.field || 0);
      const cr = c.craps;
      const newPass = cr.point ? 0 : pass;          // pass bets only on the come-out
      if (newPass < 0 || field < 0 || (newPass + field === 0 && !cr.point)) return send(c, { t: 'error', msg: 'Put a bet on the pass line or the field.' });
      if (!take(c, newPass + field) && newPass + field > 0) return send(c, { t: 'error', msg: 'Not enough money.' });
      if (newPass) cr.pass = newPass;
      const d = [1 + rnd(6), 1 + rnd(6)], tot = d[0] + d[1];
      let staked = 0, back = 0, words = [];
      if (field) { staked += field; const f = fieldPay(tot); if (f > 0) { back += field * (f + 1); words.push(`field pays ${f}:1`); } else words.push('field loses'); }
      if (!cr.point) {
        if (tot === 7 || tot === 11) { staked += cr.pass; back += cr.pass * 2; words.push('natural — pass wins'); cr.pass = 0; }
        else if ([2, 3, 12].includes(tot)) { if (cr.pass) { staked += cr.pass; words.push('craps — pass loses'); } cr.pass = 0; }
        else if (cr.pass) { cr.point = tot; words.push(`the point is ${tot}`); }
      } else {
        if (tot === cr.point) { staked += cr.pass; back += cr.pass * 2; words.push('point made — WINNER'); cr.point = 0; cr.pass = 0; }
        else if (tot === 7) { staked += cr.pass; words.push('seven out'); cr.point = 0; cr.pass = 0; }
      }
      const s = staked ? settle(c, staked, back) : { net: 0, bonus: 0 };
      send(c, { t: 'craps', dice: d, total: tot, point: cr.point, pass: cr.pass || 0, words, ...s, cash: c.cash });
      if (staked) setTimeout(() => { announce(c, s.net, 'craps'); checkBankrupt(c); }, 1500);
      break;
    }
    case 'drink': {
      const price = DRINKS[m.id];
      if (!price || !take(c, price)) return send(c, { t: 'error', msg: "You can't afford that one." });
      if (m.id === 'lemon') c.boosts.lemon += 10; else if (m.id === 'gold') c.boosts.gold += 5; else c.boosts.fizz = true;
      send(c, { t: 'drink', id: m.id, cash: c.cash, boosts: c.boosts });
      syncRoom(room);
      checkBankrupt(c);
      break;
    }
  }
}

// ---------------------------------------------------------------- sockets
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  const c = { id: nextId++, ws, name: 'Googly', color: '#2f7bff', room: null, x: 0, z: 0, yaw: 0, moving: 0, where: 'lobby', lastChat: 0 };
  clients.set(c.id, c);
  send(c, { t: 'welcome', id: c.id, max: MAX_PLAYERS, reels: REELS });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'hello':
        c.name = String(m.name || 'Googly').replace(/[<>]/g, '').trim().slice(0, 14) || 'Googly';
        c.color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#2f7bff';
        c.outfit = cleanOutfit(m.outfit);
        send(c, { t: 'rooms', list: roomList() });
        break;
      case 'list': send(c, { t: 'rooms', list: roomList() }); break;
      case 'outfit':
        c.outfit = cleanOutfit(m.outfit);
        if (c.room) syncRoom(c.room);
        break;
      case 'create': {
        const code = code4();
        const room = { code, name: String(m.name || `${WORDS[rnd(10)]} ${WORDS2[rnd(10)]}`).replace(/[<>]/g, '').slice(0, 24), public: m.public !== false, max: Math.min(MAX_PLAYERS, Math.max(1, m.max | 0 || MAX_PLAYERS)), host: c.id, players: new Map(), state: 'lobby', phase: 'lobby', nights: 7, night: 0, phaseEnd: 0, timer: null };
        rooms.set(code, room);
        joinRoom(c, room);
        break;
      }
      case 'solo': {
        const code = code4();
        const room = { code, name: `${c.name}'s solo run`, public: false, max: 1, host: c.id, players: new Map(), state: 'lobby', phase: 'lobby', nights: 7, night: 0, phaseEnd: 0, timer: null, difficulty: [0, 1, 2].includes(m.difficulty) ? m.difficulty : 1 };
        rooms.set(code, room);
        joinRoom(c, room);
        startGame(room, m.nights | 0);
        if (m.bots !== false) addBots(room);
        break;
      }
      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) send(c, { t: 'error', msg: 'No lobby with that code.' }); else joinRoom(c, room);
        break;
      }
      case 'leave': leaveRoom(c); send(c, { t: 'rooms', list: roomList() }); break;
      case 'pos':
        if (!c.room) break;
        c.x = Math.max(-25, Math.min(25, +m.x || 0)); c.z = Math.max(-25, Math.min(25, +m.z || 0)); c.yaw = +m.yaw || 0; c.moving = m.moving ? 1 : 0;
        c.where = ['casino', 'hotel'].includes(m.where) ? m.where : 'lobby'; c.anim = m.anim | 0;
        break;
      case 'chat': {
        if (!c.room) break;
        const now = Date.now();
        if (now - c.lastChat < 600) break;
        c.lastChat = now;
        const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 120);
        if (text) broadcast(c.room, { t: 'chat', id: c.id, name: c.name, color: c.color, text });
        break;
      }
      case 'start':
        if (c.room && c.room.host === c.id && c.room.state === 'lobby') startGame(c.room, m.nights | 0);
        break;
      case 'setMax':
        if (c.room && c.room.host === c.id) {
          c.room.max = Math.min(MAX_PLAYERS, Math.max(1, c.room.players.size, m.max | 0));
          syncRoom(c.room); pushLists();
        }
        break;
      case 'done':       // "done for tonight": the night ends once everyone still playing is done
        if (c.room?.phase === 'night') { c.doneTonight = !c.doneTonight; broadcast(c.room, { t: 'chat', system: true, text: `${c.name} is ${c.doneTonight ? 'done for tonight 🛌' : 'back at the tables'}.` }); syncRoom(c.room); tickRoom(c.room); }
        break;
      case 'ready':
        if (c.room?.phase === 'break') { c.ready = true; syncRoom(c.room); tickRoom(c.room); }
        break;
      case 'nextNight':
        if (c.room?.phase === 'break' && c.room.host === c.id) endNightNow(c.room);
        break;
      case 'safe': {       // the hotel-room safe: counts in the standings, can't be bet
        const r = c.room;
        if (!r || r.state !== 'playing' || r.phase !== 'break') return send(c, { t: 'error', msg: 'The safe is in your hotel room.' });
        const amt = Math.floor(m.amt);
        if (m.op === 'dep' && amt > 0 && c.cash >= amt) { c.cash -= amt; c.safe += amt; }
        else if (m.op === 'wd' && amt > 0 && c.safe >= amt) { c.safe -= amt; c.cash += amt; }
        send(c, { t: 'safe', cash: c.cash, safe: c.safe });
        syncRoom(r);
        break;
      }
      case 'snack':
        if (c.room?.phase === 'break' && c.snacked !== c.room.night) { c.snacked = c.room.night; c.boosts.lemon += 3; send(c, { t: 'snack' }); syncRoom(c.room); }
        break;
      case 'toLobby':
        if (c.room && c.room.host === c.id && c.room.state === 'ended') {
          const r = c.room; r.state = 'lobby'; r.phase = 'lobby';
          for (const p of r.players.values()) resetPlayer(p, false);
          broadcast(r, { t: 'lobby' }); syncRoom(r); pushLists();
        }
        break;
      case 'kick':
        if (c.room && c.room.host === c.id && c.room.players.has(m.id) && m.id !== c.id) {
          const k = c.room.players.get(m.id); send(k, { t: 'kicked' }); leaveRoom(k); send(k, { t: 'rooms', list: roomList() });
        }
        break;
      default: handleGame(c, m);
    }
  });
  ws.on('close', () => { if (process.env.DEBUG) console.log('close', c.id); leaveRoom(c); clients.delete(c.id); });
});

// positions at 15 Hz
setInterval(() => {
  for (const room of rooms.values()) {
    const snap = [...room.players.values()].map(p => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), p.moving, p.where === 'casino' ? 1 : p.where === 'hotel' ? 2 : 0, p.anim | 0]);
    broadcast(room, { t: 'snap', p: snap });
  }
}, 66);

server.listen(PORT, () => console.log(`Googly Gamble on http://localhost:${PORT}`));

// ---------------------------------------------------------------- computer friends (solo games)
// Rick the high roller, Gus the careful blackjack grinder, Sunny the slot lover, Violet who doubles up on red.
const BOTS = [
  { name: 'RICK', color: '#e63946', style: 'high', outfit: { hat: 'cowboy', shirt: 'redtee', pants: 'jeans' }, fav: [['craps', 4], ['roulette', 2], ['blackjack', 2], ['slot', 0.4]] },
  { name: 'GUS', color: '#2fb34a', style: 'grind', outfit: { hat: 'cap', shirt: 'greentee', pants: 'khaki' }, fav: [['blackjack', 5], ['craps', 2], ['roulette', 0.3]] },
  { name: 'SUNNY', color: '#ffc93a', style: 'slots', outfit: { hat: 'beanie', shirt: 'hawaii', pants: 'shorts' }, fav: [['slot', 6], ['roulette', 0.6]] },
  { name: 'VIOLET', color: '#9b5de5', style: 'marty', outfit: { hat: 'tophat', shirt: 'tux', pants: 'tuxpants' }, fav: [['roulette', 4], ['blackjack', 1.5], ['slot', 1]] },
];
// Where to stand at each game, plus the aisle route in from the corridor at z = -2 (matches the client's casino).
const SLOT_X = [-15.6, -14.2, -12.8, -11.4, -10];
const BOT_SPOTS = {
  slot: [...SLOT_X.map(x => ({ x, z: -3.95, via: [[x, -2]] })), ...SLOT_X.map(x => ({ x, z: -9.95, via: [[-7.2, -2], [-7.2, -9.95]] }))],
  blackjack: [0.55, 2.45, 6.55, 8.45].map(x => ({ x, z: -7.45, via: [[x, -2]] })),
  roulette: [-6.8, -4.3].map(x => ({ x, z: 5.4, via: [[-2.5, -2], [-2.5, 6.3], [x, 6.3]] })),
  craps: [4.8, 7.3].map(x => ({ x, z: 5.6, via: [[9.2, -2], [9.2, 6.4], [x, 6.4]] })),
  bar: [-3.5, -2, 0.5, 2].map(z => ({ x: 15.4, z, via: [[15.4, -2]] })),
};
const ROUND_SEC = { slot: 3.5, blackjack: 8, roulette: 12, craps: 9 };
const WIN_LINES = ['LET\'S GOOO!', 'EZ MONEY', 'WOOHOO!', "I'm on fire!", 'Cha-ching!'];
const LOSE_LINES = ['aw man…', 'rigged!!', 'noooo', 'the house always wins', 'one more…'];

function addBots(room) {
  BOTS.forEach((b, i) => {
    const bot = { id: 9001 + i + rnd(1e5) * 10, bot: true, ws: { readyState: 0 }, ...b, outfit: { ...b.outfit }, room };
    resetPlayer(bot, true);
    bot.cash = bot.nightStart = START_CASH;
    bot.shoe = newShoe();
    botNewNight(bot);
    room.players.set(bot.id, bot);
  });
  clearInterval(room.botTimer);
  room.botTimer = setInterval(() => botTick(room, 0.25), 250);
  syncRoom(room);
}
function botNewNight(b) {
  b.x = (Math.random() - 0.5) * 4; b.z = 12 + Math.random(); b.path = [[b.x, -2]]; b.spot = null; b.kind = null;
  b.wait = Math.random() * 6; b.rounds = 0; b.martingale = 0; b.home = Math.random() > [0.9, 0.8, 0.75, 0.7][BOTS.findIndex(x => x.name === b.name)];
  b.gone = b.home;
  if (b.gone) b.where = 'lobby'; else b.where = 'casino';
}
function botWantsToQuit(b, diff) {
  const base = Math.max(300, b.nightStart), today = b.cash - b.nightStart;
  if (diff === 0) return today < -base * 0.8;                                  // easy: greedy, never cashes out ahead
  const [lo, hi] = { high: [0.4, 0.8], grind: [0.2, 0.25], slots: [0.3, 0.4], marty: [0.35, 0.3] }[b.style];
  const k = diff === 2 ? 0.8 : 1;
  return today < -base * lo * k || today > base * hi * k;
}
function pickSpot(room, b) {
  const diff = room.difficulty ?? 1;
  const fav = b.fav.map(([k, w]) => [k, diff === 2 ? (k === 'blackjack' || k === 'craps' ? w * 2 : w * 0.35) : w]);
  let r = Math.random() * fav.reduce((a, f) => a + f[1], 0);
  let kind = fav[0][0];
  for (const [k, w] of fav) { if (r < w) { kind = k; break; } r -= w; }
  const taken = new Set([...room.players.values()].filter(p => p.bot && p.spot).map(p => p.spot));
  const free = BOT_SPOTS[kind].filter(s => !taken.has(s));
  return free.length ? [kind, free[rnd(free.length)]] : null;
}
function botRound(room, b) {
  const scale = [1.6, 1, 0.75][room.difficulty ?? 1];
  const size = (frac, lo, hi, step) => Math.min(b.cash, Math.max(lo, Math.min(hi, Math.floor(b.cash * frac * scale / step) * step)));
  let bet = 0, back = 0;
  switch (b.kind) {
    case 'slot': {
      bet = Math.min(b.cash, b.style === 'slots' ? (b.cash > 5000 ? 25 : b.cash > 2000 ? 5 : 1) : 5);
      const sy = [rnd(22), rnd(22), rnd(22)].map((st, i) => REELS[i][st]);
      back = slotPay(...sy) * bet;
      break;
    }
    case 'blackjack': {
      bet = b.style === 'high' ? size(0.08, 25, 5000, 25) : b.style === 'grind' ? size(0.025, 10, 500, 5) : size(0.03, 5, 500, 5);
      const pl = [draw(b.shoe), draw(b.shoe)], dl = [draw(b.shoe), draw(b.shoe)];
      const up = Math.min(10, dl[0].r === 1 ? 11 : dl[0].r);
      while (total(pl) < 12 || (total(pl) < 17 && up >= 7)) pl.push(draw(b.shoe));     // roughly the book
      const pt = total(pl);
      if (pt <= 21) while (total(dl) < 17) dl.push(draw(b.shoe));
      const dt = total(dl);
      back = isBJ(pl) && !isBJ(dl) ? bet * 2.5 : pt > 21 ? 0 : dt > 21 || pt > dt ? bet * 2 : pt === dt ? bet : 0;
      back = Math.floor(back);
      break;
    }
    case 'roulette': {
      const num = WHEEL[rnd(38)];
      if (b.style === 'marty') { bet = Math.min(b.cash, 5 << Math.min(b.martingale, 6)); if (REDS.has(num) && num !== 37) { back = bet * 2; b.martingale = 0; } else b.martingale = (b.martingale + 1) % 7; }
      else {
        bet = b.style === 'high' ? size(0.04, 25, 5000, 25) : size(0.02, 5, 200, 5);
        const straight = b.style === 'high' && Math.random() < 0.15, n = WHEEL[rnd(38)];
        back = straight ? (num === n ? bet * 36 : 0) : rlWins('red', 0, num) ? bet * 2 : 0;
      }
      break;
    }
    case 'craps': {
      bet = b.style === 'high' ? size(0.06, 25, 2000, 25) : size(0.025, 5, 300, 5);
      let d = 1 + rnd(6) + 1 + rnd(6);
      if (d === 7 || d === 11) back = bet * 2;
      else if (![2, 3, 12].includes(d)) { const pt = d; while (true) { d = 1 + rnd(6) + 1 + rnd(6); if (d === pt) { back = bet * 2; break; } if (d === 7) break; } }
      break;
    }
  }
  if (!(bet > 0) || bet > b.cash) return;
  b.cash += back - bet;
  const net = back - bet;
  if (net > b.best) b.best = net;
  broadcast(room, { t: 'pop', id: b.id, net });
  if ((net >= 200 || net <= -200) && Math.random() < 0.6) broadcast(room, { t: 'chat', id: b.id, name: b.name, color: b.color, text: (net > 0 ? WIN_LINES : LOSE_LINES)[rnd(5)] });
}
function botTick(room, dt) {
  if (room.state !== 'playing') return;
  let changed = false;
  for (const b of room.players.values()) {
    if (!b.bot || b.gone) continue;
    if (room.phase !== 'night') { b.moving = 0; continue; }
    if (b.path.length) {
      const [tx, tz] = b.path[0], dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz), step = 1.35 * dt;
      b.moving = 1;
      b.yaw = Math.atan2(dx, dz);
      if (d <= step) { b.x = tx; b.z = tz; b.path.shift(); if (!b.path.length && b.spot) { b.yaw = b.kind === 'bar' ? Math.PI / 2 : Math.PI; b.wait = ROUND_SEC[b.kind] || 20; } }
      else { b.x += dx / d * step; b.z += dz / d * step; }
      continue;
    }
    b.moving = 0;
    b.wait -= dt;
    if (b.wait > 0) continue;
    if (b.kind && b.kind !== 'bar' && b.rounds > 0) {
      if (b.cash < 5 || botWantsToQuit(b, room.difficulty ?? 1)) {
        b.gone = true; b.where = 'lobby';
        broadcast(room, { t: 'chat', id: b.id, name: b.name, color: b.color, text: b.cash > b.nightStart ? "I'm cashing out while I'm ahead!" : "I'm done for tonight…" });
        changed = true; continue;
      }
      botRound(room, b); changed = true;
      b.rounds--; b.wait = (ROUND_SEC[b.kind] || 8) * (0.8 + Math.random() * 0.5);
      if (b.rounds > 0) continue;
    }
    // choose what next: another game, or a break at the bar
    const back = b.spot ? [...b.spot.via].reverse() : [];
    const goBar = b.kind && b.kind !== 'bar' && Math.random() < 0.5;
    const pick = goBar ? ['bar', BOT_SPOTS.bar[rnd(4)]] : pickSpot(room, b);
    if (!pick) { b.wait = 5; continue; }
    [b.kind, b.spot] = pick;
    b.rounds = b.kind === 'bar' ? 0 : 4 + rnd(9);
    b.path = [...back, ...b.spot.via, [b.spot.x, b.spot.z]];
    if (b.kind === 'bar') b.wait = 20 + Math.random() * 25;
  }
  if (changed) syncRoom(room);
}
