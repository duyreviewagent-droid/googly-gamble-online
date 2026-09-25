import { sfx } from './sfx.js';

// Every panel talks to the server through `api.send` and gets results through `api.on(type, fn)`.
const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
const money = v => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();
const signed = v => (v >= 0 ? '+' : '') + money(v);
const chipColor = { 1: '#777', 5: '#d0202c', 25: '#1f9d4c', 100: '#1b1b1b', 500: '#7b3fc4', 1000: '#f0a800' };

function chipRow(values, sel, onPick) {
  const row = $(`<div class="chips"></div>`);
  for (const v of values) {
    const b = $(`<button class="chip ${v === sel ? 'on' : ''}" style="background:${chipColor[v]}">${v >= 1000 ? '1K' : '$' + v}</button>`);
    b.onclick = () => { sfx.chip(); onPick(v); row.querySelectorAll('.chip').forEach(c => c.classList.remove('on')); b.classList.add('on'); };
    row.append(b);
  }
  return row;
}

// ---------------------------------------------------------------- slots
const SYMDRAW = {
  blank: () => {},
  cherry: (g, x, y) => { g.strokeStyle = '#2f7d22'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 12, y + 4); g.quadraticCurveTo(x - 4, y - 18, x + 6, y - 24); g.moveTo(x + 12, y + 6); g.quadraticCurveTo(x + 10, y - 10, x + 6, y - 24); g.stroke(); g.fillStyle = '#d00018'; for (const [dx, dy] of [[-12, 12], [12, 14]]) { g.beginPath(); g.arc(x + dx, y + dy, 12, 0, 7); g.fill(); } },
  bar: (g, x, y) => bars(g, x, y, 1), bar2: (g, x, y) => bars(g, x, y, 2), bar3: (g, x, y) => bars(g, x, y, 3),
  seven: (g, x, y) => { g.font = '900 60px Futura, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#5a0000'; g.fillText('7', x + 2, y + 3); g.fillStyle = '#e8121e'; g.fillText('7', x, y); },
  diamond: (g, x, y) => { g.fillStyle = '#2fb8ff'; g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 24, y - 4); g.lineTo(x, y + 26); g.lineTo(x - 24, y - 4); g.closePath(); g.fill(); g.fillStyle = '#b8ecff'; g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 10, y - 4); g.lineTo(x - 10, y - 4); g.fill(); },
};
function bars(g, x, y, n) { const h = n === 1 ? 22 : n === 2 ? 17 : 13, tot = n * h + (n - 1) * 3; for (let i = 0; i < n; i++) { const yy = y - tot / 2 + i * (h + 3); g.fillStyle = '#000'; g.fillRect(x - 30, yy, 60, h); g.fillStyle = '#fff'; g.fillRect(x - 27, yy + 2, 54, h - 4); g.fillStyle = '#000'; g.font = `900 ${h * 0.7}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAR', x, yy + h / 2); } }

export function slot(api) {
  let bet = api.memo.slotBet || 5, spinning = false, auto = 0;
  const el = $(`<div><h3>SLOT MACHINE · RTP 92%</h3><canvas class="reels" width="420" height="170"></canvas><div class="msg">Pick a bet and SPIN. Three diamonds pay 1000×.</div></div>`);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), msg = el.querySelector('.msg');
  const reels = api.reels; // strips from the server config
  const pos = [Math.floor(Math.random() * 22), Math.floor(Math.random() * 22), Math.floor(Math.random() * 22)];
  function draw() {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 420, 170);
    for (let r = 0; r < 3; r++) {
      const cx = 70 + r * 140;
      for (let k = -2; k <= 2; k++) {
        const idx = Math.floor(pos[r]) + k, frac = pos[r] - Math.floor(pos[r]);
        const sym = reels[r][((idx % 22) + 22) % 22];
        const y = 85 + (k - frac) * 64;
        g.save(); g.beginPath(); g.rect(cx - 66, 0, 132, 170); g.clip(); SYMDRAW[sym](g, cx, y); g.restore();
      }
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(cx - 70, 0, 2, 170);
    }
    const sh = g.createLinearGradient(0, 0, 0, 170); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = sh; g.fillRect(0, 0, 420, 170);
    g.fillStyle = 'rgba(255,40,40,.8)'; g.fillRect(0, 84, 8, 3); g.fillRect(412, 84, 8, 3);
  }
  draw();
  const spinBtn = $(`<button class="green big">SPIN</button>`), autoBtn = $(`<button class="grey">AUTO ×10</button>`);
  const row = $(`<div class="row"></div>`);
  el.append(chipRow([1, 5, 25, 100, 500], bet, v => { bet = v; api.memo.slotBet = v; }), row);
  row.append(spinBtn, autoBtn, api.closeBtn());
  const spin = () => { if (spinning) return; spinning = true; spinBtn.disabled = true; api.send({ t: 'slot', bet }); sfx.spin(); };
  spinBtn.onclick = spin;
  autoBtn.onclick = () => { auto = auto ? 0 : 10; autoBtn.textContent = auto ? 'STOP AUTO' : 'AUTO ×10'; if (auto && !spinning) spin(); };
  api.on('slot', m => {
    const start = performance.now(), from = pos.slice(), to = m.stops.map((s, i) => { let t = s + 1.5 - 2; while (t < from[i] + 22 * 3) t += 22; return t; });
    // stop index s should sit on the payline: pos = s (row k=0 at y=85)
    for (let i = 0; i < 3; i++) { let t = m.stops[i]; while (t < from[i] + 22 * 3 + i * 11) t += 22; to[i] = t; }
    const dur = [900, 1350, 1800];
    let stopped = [false, false, false], lastTick = 0;
    const step = (now) => {
      const e = now - start;
      for (let i = 0; i < 3; i++) {
        const u = Math.min(1, e / dur[i]);
        pos[i] = from[i] + (to[i] - from[i]) * (1 - Math.pow(1 - u, 3));
        if (u >= 1 && !stopped[i]) { stopped[i] = true; sfx.reelStop(); }
      }
      if (now - lastTick > 60) { lastTick = now; if (!stopped[2]) sfx.reelTick(); }
      draw();
      if (e < dur[2]) requestAnimationFrame(step); else done();
    };
    const done = () => {
      spinning = false; spinBtn.disabled = false;
      if (m.mult > 0) {
        const win = m.mult * bet;
        msg.textContent = `${m.syms.join(' · ')} — pays ${m.mult}× = ${money(win)}${m.bonus ? ` (+${money(m.bonus)} boost)` : ''}`;
        if (m.mult >= 100) { sfx.bigwin(); sfx.cheer(); api.toast(`JACKPOT ${money(win)}!`, '#ffd84a'); api.cheer(true); }
        else if (m.mult >= 20) { sfx.bigwin(); api.toast(`WIN ${money(win)}!`, '#8dffa0'); api.cheer(true); }
        else { sfx.win(); if (m.mult >= 5) api.cheer(); }
      } else { msg.textContent = `${m.syms.join(' · ')} — no win.${m.bonus ? ` Lemonade gives back ${money(m.bonus)}.` : ''}`; }
      if (auto > 0) { auto--; if (auto === 0) autoBtn.textContent = 'AUTO ×10'; else setTimeout(spin, 450); }
    };
    requestAnimationFrame(step);
  });
  api.on('error', () => { spinning = false; spinBtn.disabled = false; auto = 0; autoBtn.textContent = 'AUTO ×10'; });
  return el;
}

// ---------------------------------------------------------------- blackjack
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const cardEl = (c, back) => back ? $(`<div class="cardx back"></div>`) : $(`<div class="cardx ${c.s === 1 || c.s === 2 ? 'red' : ''}"><span>${RANKS[c.r]}${SUITS[c.s]}</span><span class="big">${SUITS[c.s]}</span><span style="text-align:right">${RANKS[c.r]}</span></div>`);

export function blackjack(api) {
  let bet = api.memo.bjBet || 25, playing = false;
  const el = $(`<div><h3>BLACKJACK · 6 decks · pays 3:2</h3><div class="felt"><div class="note">DEALER</div><div class="cards" id="dc"></div><div class="note">YOU <b id="pt"></b></div><div class="cards" id="pc"></div></div><div class="msg">Choose a bet and DEAL.</div></div>`);
  const dc = el.querySelector('#dc'), pc = el.querySelector('#pc'), msg = el.querySelector('.msg'), pt = el.querySelector('#pt');
  const betRow = chipRow([5, 25, 100, 500, 1000], bet, v => { bet = v; api.memo.bjBet = v; });
  const deal = $(`<button class="green big">DEAL</button>`), hit = $(`<button class="green">HIT</button>`), stand = $(`<button class="red">STAND</button>`), dbl = $(`<button class="gold">DOUBLE</button>`);
  const row = $(`<div class="row"></div>`);
  row.append(deal, hit, stand, dbl, api.closeBtn());
  el.append(betRow, row);
  const setMode = (p, canDouble) => { playing = p; deal.classList.toggle('hidden', p); betRow.classList.toggle('hidden', p); hit.classList.toggle('hidden', !p); stand.classList.toggle('hidden', !p); dbl.classList.toggle('hidden', !p); dbl.disabled = !canDouble; };
  setMode(false);
  deal.onclick = () => { api.send({ t: 'bj', op: 'deal', bet }); sfx.chips(); deal.disabled = true; };
  hit.onclick = () => api.send({ t: 'bj', op: 'hit' });
  stand.onclick = () => api.send({ t: 'bj', op: 'stand' });
  dbl.onclick = () => { api.send({ t: 'bj', op: 'double' }); sfx.chips(); };
  const show = (list, where, hideSecond) => { where.innerHTML = ''; list.forEach((c, i) => { setTimeout(() => { where.append(cardEl(c, hideSecond && i === 1)); sfx.card(); }, i * 120); }); };
  api.on('bj', m => {
    deal.disabled = false;
    if (m.phase === 'play') {
      show(m.player, pc); show([m.up, m.up], dc, true);
      pt.textContent = `(${m.total})`;
      msg.textContent = m.shuffled ? 'Fresh shoe shuffled. Hit or stand?' : 'Hit, stand or double?';
      setMode(true, m.canDouble);
    } else {
      show(m.player, pc); show(m.dealer, dc, false);
      pt.textContent = `(${m.total})`;
      const note = m.bonus ? (m.net > 0 ? ` · Golden ×2 +${money(m.bonus)}` : ` · Lemonade +${money(m.bonus)}`) : '';
      msg.textContent = `${m.word} · ${m.net > 0 ? 'WIN ' : ''}${signed(m.net)}${note}`;
      setTimeout(() => { if (m.net > 0) { sfx.win(); sfx.chips(); api.cheer(m.net >= 300); } else if (m.net < 0) { sfx.lose(); api.sulk(); } }, 300);
      setMode(false);
    }
  });
  api.on('error', () => { deal.disabled = false; });
  return el;
}

// ---------------------------------------------------------------- roulette
const WHEEL = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rname = n => n === 37 ? '00' : String(n);

export function roulette(api) {
  let chip = api.memo.rlChip || 5, bets = new Map(), spinning = false, rot = 0, ballA = 0, ballR = 0.8;
  const el = $(`<div><h3>ROULETTE · American double zero</h3><div class="row"><canvas class="wheel" width="480" height="480"></canvas><div class="bets" style="max-width:520px"></div></div><div class="msg">Tap bets to place chips, then SPIN.</div></div>`);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), msg = el.querySelector('.msg'), betsEl = el.querySelector('.bets');
  const key = b => b.t + ':' + (b.n ?? '');
  const total = () => [...bets.values()].reduce((a, b) => a + b.amt, 0);
  function drawWheel() {
    g.clearRect(0, 0, 480, 480);
    g.save(); g.translate(240, 240);
    g.fillStyle = '#3a1a0a'; g.beginPath(); g.arc(0, 0, 235, 0, 7); g.fill();
    g.fillStyle = '#1e0e06'; g.beginPath(); g.arc(0, 0, 212, 0, 7); g.fill();
    g.rotate(rot);
    WHEEL.forEach((n, i) => {
      const a0 = (i - 0.5) / 38 * Math.PI * 2, a1 = (i + 0.5) / 38 * Math.PI * 2;
      g.fillStyle = n === 0 || n === 37 ? '#0c7a3a' : REDS.has(n) ? '#b3121f' : '#141414';
      g.beginPath(); g.arc(0, 0, 200, a0, a1); g.arc(0, 0, 130, a1, a0, true); g.closePath(); g.fill();
      g.strokeStyle = '#e0b85a'; g.lineWidth = 1.5; g.stroke();
      g.save(); g.rotate(i / 38 * Math.PI * 2); g.translate(178, 0); g.rotate(Math.PI / 2); g.fillStyle = '#fff'; g.font = '800 16px sans-serif'; g.textAlign = 'center'; g.fillText(rname(n), 0, 6); g.restore();
    });
    g.fillStyle = '#8a5a2b'; g.beginPath(); g.arc(0, 0, 130, 0, 7); g.fill();
    g.fillStyle = '#d6a84a'; g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill();
    g.rotate(-rot);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(Math.cos(ballA) * 200 * ballR, Math.sin(ballA) * 200 * ballR, 9, 0, 7); g.fill();
    g.restore();
  }
  drawWheel();
  let idle = true;
  const idleSpin = () => { if (!el.isConnected) return; if (idle) { rot += 0.004; drawWheel(); } requestAnimationFrame(idleSpin); };
  requestAnimationFrame(idleSpin);
  function renderBets() {
    betsEl.innerHTML = '';
    const outside = [['RED', { t: 'red' }, 'red'], ['BLACK', { t: 'black' }, 'grey'], ['ODD', { t: 'odd' }, ''], ['EVEN', { t: 'even' }, ''], ['1–18', { t: 'low' }, ''], ['19–36', { t: 'high' }, ''], ['1st 12', { t: 'dozen', n: 0 }, 'purple'], ['2nd 12', { t: 'dozen', n: 1 }, 'purple'], ['3rd 12', { t: 'dozen', n: 2 }, 'purple']];
    for (const [label, b, cls] of outside) {
      const cur = bets.get(key(b));
      const btn = $(`<button class="${cls}">${label}${cur ? `<span class="betchip">${money(cur.amt)}</span>` : ''}</button>`);
      btn.onclick = () => place(b); btn.disabled = spinning; betsEl.append(btn);
    }
    const grid = $(`<div class="numgrid"></div>`);
    for (const n of [0, 37, ...Array.from({ length: 36 }, (_, i) => i + 1)]) {
      const cur = bets.get(key({ t: 'num', n }));
      const b = $(`<button class="${n === 0 || n === 37 ? 'g' : REDS.has(n) ? 'r' : 'k'}">${rname(n)}${cur ? '•' : ''}</button>`);
      b.onclick = () => place({ t: 'num', n }); b.disabled = spinning; grid.append(b);
    }
    betsEl.append(grid);
  }
  function place(b) {
    if (spinning) return;
    if (total() + chip > api.cash()) { sfx.nope(); msg.textContent = 'Not enough money.'; return; }
    const k = key(b), cur = bets.get(k) || { ...b, amt: 0 };
    cur.amt += chip; bets.set(k, cur); sfx.chip();
    msg.textContent = `${money(total())} on the table. ${b.t === 'num' ? 'Straight up pays 35 to 1.' : b.t === 'dozen' ? 'Dozens pay 2 to 1.' : 'Pays even money.'}`;
    renderBets(); spinBtn.textContent = `SPIN ${money(total())}`;
  }
  const spinBtn = $(`<button class="green big">SPIN</button>`), clear = $(`<button class="grey">CLEAR</button>`);
  const row = $(`<div class="row"></div>`);
  row.append(spinBtn, clear, api.closeBtn());
  el.append(chipRow([1, 5, 25, 100, 500], chip, v => { chip = v; api.memo.rlChip = v; }), row);
  renderBets();
  clear.onclick = () => { if (!spinning) { bets.clear(); renderBets(); spinBtn.textContent = 'SPIN'; } };
  spinBtn.onclick = () => { if (spinning || !bets.size) return; spinning = true; spinBtn.disabled = true; renderBets(); api.send({ t: 'roulette', bets: [...bets.values()] }); };
  api.on('roulette', m => {
    idle = false; sfx.spin();
    const start = performance.now(), T = 5000, rot0 = rot, ball0 = Math.random() * 7;
    // final: ball sits over pocket `index` in wheel space (angle index/38·2π + rot)
    const rotEnd = rot0 + 3.2;
    let target = m.index / 38 * Math.PI * 2 + rotEnd;
    while (target > ball0 - 14) target -= Math.PI * 2;
    let lastTick = 0;
    const step = (now) => {
      const u = Math.min(1, (now - start) / T), e = 1 - Math.pow(1 - u, 2.4);
      rot = rot0 + (rotEnd - rot0) * (1 - Math.pow(1 - u, 1.6));
      ballA = ball0 + (target - ball0) * e;
      ballR = u < 0.6 ? 0.98 : 0.98 - (0.98 - 0.82) * Math.min(1, (u - 0.6) / 0.25) + (u > 0.6 && u < 0.9 ? Math.abs(Math.sin(u * 60)) * 0.03 * (0.9 - u) * 10 : 0);
      if (u > 0.6 && u < 0.9 && now - lastTick > 140) { lastTick = now; sfx.ball(); }
      drawWheel();
      if (u < 1) requestAnimationFrame(step); else finish();
    };
    const finish = () => {
      const follow = () => { if (!el.isConnected || !idle) return; ballA += 0.004; };
      idle = true;
      const ride = () => { if (!el.isConnected) return; if (idle && !spinning) { ballA += 0.004; } requestAnimationFrame(ride); };
      requestAnimationFrame(ride); follow();
      spinning = false; spinBtn.disabled = false; bets.clear(); renderBets(); spinBtn.textContent = 'SPIN';
      const note = m.bonus ? (m.net > 0 ? ` · Golden ×2 +${money(m.bonus)}` : ` · Lemonade +${money(m.bonus)}`) : '';
      msg.textContent = `${rname(m.num)} ${m.color.toUpperCase()} · ${m.net >= 0 ? 'you collect ' + money(m.back) : 'dealer sweeps ' + money(-m.net)}${note}`;
      api.toast(`${rname(m.num)} ${m.color.toUpperCase()}`, m.color === 'red' ? '#ff5a6a' : m.color === 'green' ? '#5aff9a' : '#ddd');
      if (m.net > 0) { sfx.win(); sfx.chips(); api.cheer(m.net > 200); } else if (m.net < 0) { sfx.lose(); api.sulk(); }
    };
    requestAnimationFrame(step);
  });
  api.on('error', () => { spinning = false; spinBtn.disabled = false; renderBets(); });
  return el;
}

// ---------------------------------------------------------------- craps
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieEl = () => $(`<div class="die">${'<i></i>'.repeat(9)}</div>`);
const setDie = (d, n) => d.querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', PIPS[n].includes(i)));

export function craps(api) {
  let chip = api.memo.crChip || 25, pass = 0, field = 0, point = 0, rolling = false;
  const el = $(`<div><h3>CRAPS · <span id="pt">COME-OUT ROLL</span></h3><div class="dice"></div><div class="msg">Bet the PASS LINE (7 or 11 wins, 2·3·12 loses) and/or the FIELD, then ROLL.</div></div>`);
  const dice = el.querySelector('.dice'), msg = el.querySelector('.msg'), ptEl = el.querySelector('#pt');
  const d1 = dieEl(), d2 = dieEl(); dice.append(d1, d2); setDie(d1, 3); setDie(d2, 4);
  const passBtn = $(`<button class="green">PASS LINE</button>`), fieldBtn = $(`<button class="gold">FIELD</button>`), roll = $(`<button class="green big">🎲 ROLL</button>`);
  const row1 = $(`<div class="row"></div>`), row2 = $(`<div class="row"></div>`);
  row1.append(passBtn, fieldBtn); row2.append(roll, api.closeBtn());
  el.append(chipRow([5, 25, 100, 500], chip, v => { chip = v; api.memo.crChip = v; }), row1, row2);
  const refresh = () => {
    passBtn.innerHTML = `PASS LINE${pass ? `<span class="betchip">${money(pass)}</span>` : ''}`; passBtn.disabled = !!point || rolling;
    fieldBtn.innerHTML = `FIELD${field ? `<span class="betchip">${money(field)}</span>` : ''}`; fieldBtn.disabled = rolling;
    ptEl.textContent = point ? `POINT IS ${point}` : 'COME-OUT ROLL';
    roll.disabled = rolling || (!point && !pass && !field);
  };
  const total = () => (point ? 0 : pass) + field;
  passBtn.onclick = () => { if (total() + chip > api.cash()) return sfx.nope(); pass += chip; sfx.chip(); refresh(); };
  fieldBtn.onclick = () => { if (total() + chip > api.cash()) return sfx.nope(); field += chip; sfx.chip(); refresh(); };
  roll.onclick = () => { rolling = true; refresh(); d1.classList.add('roll'); d2.classList.add('roll'); sfx.roll(); api.send({ t: 'craps', pass: point ? 0 : pass, field }); };
  refresh();
  api.on('craps', m => {
    setTimeout(() => {
      d1.classList.remove('roll'); d2.classList.remove('roll'); setDie(d1, m.dice[0]); setDie(d2, m.dice[1]); sfx.dice();
      rolling = false; point = m.point; pass = m.pass; field = 0;
      const note = m.bonus ? (m.net > 0 ? ` · Golden ×2 +${money(m.bonus)}` : ` · Lemonade +${money(m.bonus)}`) : '';
      msg.textContent = `${m.dice[0]} + ${m.dice[1]} = ${m.total} · ${m.words.join(' · ')}${m.net ? ' · ' + signed(m.net) : ''}${note}`;
      if (m.net > 0) { sfx.win(); api.cheer(m.net >= 200); } else if (m.net < 0) { sfx.lose(); api.sulk(); }
      refresh();
    }, 800);
  });
  api.on('error', () => { rolling = false; d1.classList.remove('roll'); d2.classList.remove('roll'); refresh(); });
  return el;
}

// ---------------------------------------------------------------- bar
export function bar(api) {
  const el = $(`<div><h3>THE BLUE LOUNGE · drinks with boosts (all non-alcoholic)</h3><div class="drinks"></div><div class="msg">What'll it be?</div></div>`);
  const d = el.querySelector('.drinks'), msg = el.querySelector('.msg');
  const menu = [['lemon', 'LUCKY LEMONADE · $50', 'next 10 rounds: 25% of any loss comes back', 'gold'], ['fizz', 'BLUE GOOGLY FIZZ · $100', 'rest of tonight: walk and run 60% faster', ''], ['gold', 'GOLDEN JACKPOT JUICE · $200', 'your next 5 winning rounds pay DOUBLE', 'gold']];
  for (const [id, label, blurb, cls] of menu) {
    const b = $(`<button class="${cls}">${label}<small>${blurb}</small></button>`);
    b.onclick = () => { api.send({ t: 'drink', id }); sfx.pour(); };
    d.append(b);
  }
  el.append($(`<div class="row"></div>`)); el.lastChild.append(api.closeBtn());
  api.on('drink', m => { setTimeout(() => { sfx.gulp(); }, 700); setTimeout(() => { sfx.powerup(); api.cheer(); api.toast('BOOST ON!', '#ffd84a'); }, 1500); msg.textContent = 'Glug glug glug… ahh!'; });
  return el;
}
