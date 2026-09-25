import { SHIRTS, PANTS, HATS, PETS } from './world.js';
import { sfx } from './sfx.js';

// Coins, owned items and what you're wearing live in this browser.
const KEY = 'gg-wardrobe';
export const wardrobe = (() => {
  try { return Object.assign({ coins: 0, owned: [], outfit: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { return { coins: 0, owned: [], outfit: {} }; }
})();
export function saveWardrobe() { try { localStorage.setItem(KEY, JSON.stringify(wardrobe)); } catch {} }
export function addCoins(n) { wardrobe.coins += n; saveWardrobe(); }

const SECTIONS = [
  ['shirt', 'SHIRTS', SHIRTS, '👕'], ['pants', 'PANTS', PANTS, '👖'], ['hat', 'HATS', HATS, '🎩'], ['pet', 'PETS', PETS, '🐾'],
];

/** Renders the shop into `host`; `onChange(outfit)` fires when you put something on or take it off. */
export function openShop(host, onChange, onClose) {
  let tab = 'shirt';
  const render = () => {
    const [, title, items, icon] = SECTIONS.find(s => s[0] === tab);
    host.innerHTML = `<div class="card wide shop">
      <h2>GOOGLY SHOP</h2>
      <p class="sub">🪙 <b id="coins">${wardrobe.coins.toLocaleString()}</b> coins · win them by finishing games: 1st 1,000 · 2nd 500 · 3rd 200 · then half each place</p>
      <div class="tabs">${SECTIONS.map(([k, t, , i]) => `<button data-tab="${k}" class="${k === tab ? '' : 'grey'}">${i} ${t}</button>`).join('')}</div>
      <div class="items">${Object.entries(items).map(([id, it]) => {
        const owned = wardrobe.owned.includes(id), worn = wardrobe.outfit[tab] === id;
        const label = worn ? 'TAKE OFF' : owned ? 'WEAR' : `BUY 🪙${it.price.toLocaleString()}`;
        const cls = worn ? 'red' : owned ? 'green' : wardrobe.coins >= it.price ? 'gold' : 'grey';
        return `<div class="item"><div class="ico">${icon}</div><b>${it.name}</b><button data-id="${id}" class="${cls}" ${!owned && wardrobe.coins < it.price ? 'disabled' : ''}>${label}</button></div>`;
      }).join('')}</div>
      <div class="row"><button id="shopclose" class="grey">DONE</button></div></div>`;
    host.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; sfx.click(); render(); });
    host.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
      const id = b.dataset.id, it = items[id];
      if (wardrobe.outfit[tab] === id) { delete wardrobe.outfit[tab]; sfx.click(); }
      else if (wardrobe.owned.includes(id)) { wardrobe.outfit[tab] = id; sfx.powerup(); }
      else if (wardrobe.coins >= it.price) { wardrobe.coins -= it.price; wardrobe.owned.push(id); wardrobe.outfit[tab] = id; sfx.bigwin(); }
      saveWardrobe(); onChange({ ...wardrobe.outfit }); render();
    });
    host.querySelector('#shopclose').onclick = onClose;
  };
  render();
}
