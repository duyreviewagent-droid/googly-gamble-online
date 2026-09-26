// Phone check in real time: headless Chrome emulating a touch phone over CDP.
// node test/mobile.mjs URL [steps.json|-] [out-prefix] [WxH]
//   steps: [{wait:ms} | {shot:'name'} | {tap:[x,y]} | {tapel:'css selector'} | {pinch:[cx,cy,d0,d1,ms]} | {drag:[x0,y0,x1,y1,ms]} | {hold:[x,y,ms]} | {eval:'js'} | {stick:[x,y,dx,dy,ms]}]
// Prints console errors and eval results. Default device: iPhone-ish landscape 844x390 @3x.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const [url, stepsArg = '-', out = path.join(os.tmpdir(), 'mob'), size = '844x390'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const steps = stepsArg === '-' ? [{ wait: 6000 }, { shot: 'a' }] : JSON.parse(fs.existsSync(stepsArg) ? fs.readFileSync(stepsArg, 'utf8') : stepsArg);
const CH = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobchrome'));
const chrome = spawn(CH, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const kill = () => { try { chrome.kill('SIGKILL'); } catch { } };
process.on('exit', kill);
setTimeout(() => { console.log('TIMEOUT'); kill(); process.exit(2); }, Number(process.env.MAX || 240) * 1000);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = l.find(t => t.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('no chrome'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 1 << 28 });
await new Promise(r => ws.on('open', r));
let id = 0; const pend = new Map();
ws.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.log('[console.' + m.params.type + ']', m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
  if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
});
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await cmd('Runtime.enable'); await cmd('Page.enable');
const metrics = { width: W, height: H, deviceScaleFactor: Number(process.env.DSF || 1), mobile: true, screenOrientation: W > H ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } };
await cmd('Emulation.setDeviceMetricsOverride', metrics);
await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cmd('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
await cmd('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
await cmd('Page.navigate', { url });
const touch = (type, pts) => cmd('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (s.shot) { await cmd('Emulation.setDeviceMetricsOverride', metrics); await sleep(250); const r = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }); fs.writeFileSync(`${out}-${s.shot}.png`, Buffer.from(r.result.data, 'base64')); console.log('shot', `${out}-${s.shot}.png`); }
  if (s.tap) { await touch('touchStart', [s.tap]); await sleep(60); await touch('touchEnd', []); }
  if (s.hold) { await touch('touchStart', [s.hold.slice(0, 2)]); await sleep(s.hold[2] || 800); await touch('touchEnd', []); }
  if (s.drag) { const [x0, y0, x1, y1, ms = 500] = s.drag, n = Math.max(4, Math.round(ms / 16)); await touch('touchStart', [[x0, y0]]); for (let i = 1; i <= n; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]]); await sleep(16); } await touch('touchEnd', []); }
  // stick: hold a joystick offset for ms while also staying put (single finger)
  if (s.stick) { const [x, y, dx, dy, ms = 1500] = s.stick; await touch('touchStart', [[x, y]]); await touch('touchMove', [[x + dx * 0.5, y + dy * 0.5]]); await touch('touchMove', [[x + dx, y + dy]]); const t0 = Date.now(); while (Date.now() - t0 < ms) { await touch('touchMove', [[x + dx, y + dy + (Math.random() - 0.5)]]); await sleep(50); } await touch('touchEnd', []); }
  // tapel: real touch tap on the centre of the first visible element matching a CSS selector
  if (s.tapel) { const r = await cmd('Runtime.evaluate', { expression: `(() => { const e = [...document.querySelectorAll(${JSON.stringify(s.tapel)})].find(e => e.getClientRects().length); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width, b.height]; })()`, returnByValue: true }); const v = r.result?.result?.value; if (!v) console.log('tapel: not found', s.tapel); else { console.log('tapel', s.tapel, v.map(Math.round).join(','), v[1] > H || v[0] > W ? 'OFF-SCREEN' : ''); await touch('touchStart', [v]); await sleep(60); await touch('touchEnd', []); } }
  // pinch: two fingers around (cx,cy), horizontal spread d0 -> d1 px over ms
  if (s.pinch) { const [cx, cy, d0, d1, ms = 500] = s.pinch, n = Math.max(4, Math.round(ms / 16)); const pts = d => [[cx - d / 2, cy], [cx + d / 2, cy]]; await touch('touchStart', pts(d0)); for (let i = 1; i <= n; i++) { await touch('touchMove', pts(d0 + (d1 - d0) * i / n)); await sleep(16); } await touch('touchEnd', []); }
  if (s.eval) { const r = await cmd('Runtime.evaluate', { expression: s.eval, returnByValue: true, awaitPromise: true }); console.log('eval', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null).slice(0, 800)); }
}
kill(); process.exit(0);
