// DJ Request — servidor sin dependencias (Node >= 16). Corre en tu Mac o en la nube.
// Público:  /        Panel DJ: /dj        Pantalla QR: /qr
//
// Variables de entorno (opcionales, útiles en la nube):
//   PORT        puerto (la nube lo pone sola)
//   DJ_PIN      PIN del panel DJ (si está, manda sobre el guardado)
//   PUBLIC_URL  dirección pública para el QR (en Render se detecta sola)
//   DATA_DIR    carpeta donde guardar data.json (ej. un disco persistente)
//   DJ_NAME, TIP_URL, TIP_LABEL, TIP_AMOUNT, BANK_NOMBRE, BANK_RUT, BANK_BANCO,
//   BANK_TIPO, BANK_CUENTA, BANK_EMAIL  → valores iniciales si no hay data.json
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8095;
const PUB = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA = path.join(DATA_DIR, 'data.json');
const ENV = process.env;
const PUBLIC_URL = ENV.PUBLIC_URL || ENV.RENDER_EXTERNAL_URL || '';
const BEHIND_PROXY = !!(ENV.TRUST_PROXY || ENV.RENDER || PUBLIC_URL);
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// ---------- estado ----------
const defaults = {
  config: {
    djName: ENV.DJ_NAME || 'DJ Miky',
    eventName: '',
    pin: String(crypto.randomInt(1000, 10000)),
    open: true,
    maxPerWindow: 3,          // pedidos por persona cada 10 min
    publicUrl: '',            // URL pública (túnel) — si está vacía se usa la IP de la red local
    tipUrl: ENV.TIP_URL || '', // link de pago (Mercado Pago, PayPal.me, etc.)
    tipLabel: ENV.TIP_LABEL || 'Mercado Pago',
    tipAmount: ENV.TIP_AMOUNT || '', // texto sugerido, ej "$3.000"
    bank: {
      nombre: ENV.BANK_NOMBRE || '', rut: ENV.BANK_RUT || '', banco: ENV.BANK_BANCO || '',
      tipo: ENV.BANK_TIPO || '', cuenta: ENV.BANK_CUENTA || '', email: ENV.BANK_EMAIL || '',
    },
  },
  requests: [],
  tips: [],
};

let state = load();
if (ENV.DJ_PIN) state.config.pin = String(ENV.DJ_PIN);
function load() {
  try {
    const s = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    return {
      config: { ...defaults.config, ...s.config, bank: { ...defaults.config.bank, ...(s.config || {}).bank } },
      requests: s.requests || [],
      tips: s.tips || [],
    };
  } catch { return JSON.parse(JSON.stringify(defaults)); }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA + '.tmp', JSON.stringify(state, null, 2), (e) => {
      if (!e) fs.rename(DATA + '.tmp', DATA, () => {});
    });
  }, 200);
}
save();

// ---------- utilidades ----------
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}
function joinUrl() {
  const c = state.config;
  const pub = c.publicUrl || PUBLIC_URL;
  if (pub) return pub.replace(/\/+$/, '') + '/';
  const ip = lanIPs()[0] || 'localhost';
  return `http://${ip}:${PORT}/`;
}
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const id = () => crypto.randomBytes(6).toString('hex');

function tippers() { return new Set(state.tips.map((t) => t.clientId)); }

function publicSnapshot() {
  const c = state.config;
  const hasBank = Object.values(c.bank).some(Boolean);
  const tipSet = tippers();
  return {
    djName: c.djName, eventName: c.eventName, open: c.open,
    tip: { url: c.tipUrl, label: c.tipLabel, amount: c.tipAmount, bank: hasBank ? c.bank : null },
    requests: state.requests.map((r) => ({
      id: r.id, title: r.title, artist: r.artist, name: r.name, art: r.art || '', votes: r.voters.length,
      status: r.status, ts: r.ts, tipped: tipSet.has(r.clientId),
    })),
  };
}
function djSnapshot() {
  const tipSet = tippers();
  return {
    config: state.config,
    joinUrl: joinUrl(),
    lan: lanIPs().map((ip) => `http://${ip}:${PORT}/`),
    requests: state.requests.map((r) => ({ ...r, voters: undefined, votes: r.voters.length, tipped: tipSet.has(r.clientId) })),
    tips: state.tips,
  };
}

// ---------- SSE ----------
const clients = new Set(); // {res, dj}
function send(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
function broadcast(extra) {
  const pub = publicSnapshot();
  const dj = djSnapshot();
  for (const c of clients) {
    send(c.res, 'state', c.dj ? dj : pub);
    if (extra && c.dj) send(c.res, extra.event, extra.data);
  }
  save();
}
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 20000);

// ---------- límite de pedidos ----------
const hits = new Map(); // key -> [timestamps]
function allowed(key, max) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const arr = (hits.get(key) || []).filter((t) => now - t < win);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr); return true;
}

// ---------- buscador de canciones (catálogo de iTunes, sin clave) ----------
const COUNTRY = (ENV.SEARCH_COUNTRY || 'CL').toUpperCase();
const searchCache = new Map(); // query -> {t, items}
const ART_RE = /^https:\/\/is\d+-ssl\.mzstatic\.com\//;
async function searchSongs(q) {
  const key = norm(q);
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600 * 1000) return hit.items;
  const u = `https://itunes.apple.com/search?media=music&entity=song&limit=15&country=${COUNTRY}&term=${encodeURIComponent(q)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('search ' + r.status);
  const j = await r.json();
  const seen = new Set(), items = [];
  for (const x of j.results || []) {
    if (!x.trackName) continue;
    const k = norm(x.trackName + ' ' + x.artistName);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ title: x.trackName, artist: x.artistName || '', art: ART_RE.test(x.artworkUrl100 || '') ? x.artworkUrl100 : '' });
    if (items.length >= 7) break;
  }
  if (searchCache.size > 2000) searchCache.clear();
  searchCache.set(key, { t: Date.now(), items });
  return items;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const ROUTES = { '/': 'index.html', '/dj': 'dj.html', '/qr': 'qr.html', '/qrcode.min.js': 'qrcode.min.js', '/logo.jpg': 'logo.jpg', '/icon.jpg': 'icon.jpg' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}
const pinFails = new Map(); // ip -> [timestamps]
function pinLocked(ip) {
  const arr = (pinFails.get(ip) || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
  pinFails.set(ip, arr);
  return arr.length >= 8;
}
function isDJ(req, url, ip) {
  if (pinLocked(ip)) return false;
  const given = String(req.headers['x-dj-pin'] || url.searchParams.get('pin') || '');
  const ok = given.length === state.config.pin.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(state.config.pin));
  if (!ok && given) pinFails.get(ip).push(Date.now());
  return ok;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const ip = (BEHIND_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())
    || req.headers['cf-connecting-ip'] || req.socket.remoteAddress;

  if (req.method === 'GET' && ROUTES[p]) {
    const f = path.join(PUB, ROUTES[p]);
    return fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)], 'Cache-Control': f.endsWith('.jpg') ? 'public, max-age=86400' : 'no-cache' });
      res.end(d);
    });
  }

  if (p === '/api/events') {
    const dj = url.searchParams.get('role') === 'dj';
    if (dj && !isDJ(req, url, ip)) return json(res, 401, { error: pinLocked(ip) ? 'Demasiados intentos. Espera 10 minutos.' : 'PIN incorrecto' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const c = { res, dj };
    clients.add(c);
    send(res, 'state', dj ? djSnapshot() : publicSnapshot());
    req.on('close', () => clients.delete(c));
    return;
  }

  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (p === '/api/info') return json(res, 200, { joinUrl: joinUrl(), djName: state.config.djName, eventName: state.config.eventName, hasTip: !!(state.config.tipUrl || Object.values(state.config.bank).some(Boolean)) });

  if (p === '/api/search') {
    const q = clean(url.searchParams.get('q'), 80);
    if (q.length < 2) return json(res, 200, { items: [] });
    if (!allowed('search:' + ip, 1500)) return json(res, 429, { items: [] });
    try { return json(res, 200, { items: await searchSongs(q) }); }
    catch { return json(res, 200, { items: [], offline: true }); }
  }

  if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
  const b = await body(req);
  const clientId = clean(b.clientId, 40) || ip;

  // ----- público -----
  if (p === '/api/request') {
    if (!state.config.open) return json(res, 403, { error: 'Los pedidos están cerrados por ahora.' });
    const title = clean(b.title, 100), artist = clean(b.artist, 80);
    if (!title) return json(res, 400, { error: 'Escribe el nombre de la canción.' });
    const key = norm(title + ' ' + artist);
    const dup = state.requests.find((r) => r.key === key && !['played', 'rejected'].includes(r.status));
    if (dup) {
      if (!dup.voters.includes(clientId)) dup.voters.push(clientId);
      broadcast();
      return json(res, 200, { id: dup.id, merged: true });
    }
    const max = Number(state.config.maxPerWindow) || 3;
    if (!allowed(clientId, max) || !allowed('ip:' + ip, max * 20)) // holgado: en la nube todo un local puede compartir IP
      return json(res, 429, { error: 'Ya pediste varias canciones. Espera unos minutos 🙂' });
    const r = {
      id: id(), key, title, artist,
      name: clean(b.name, 40), note: clean(b.note, 200),
      art: ART_RE.test(String(b.art || '')) ? clean(b.art, 300) : '',
      clientId, voters: [clientId], status: 'new', ts: Date.now(),
    };
    state.requests.push(r);
    broadcast({ event: 'new-request', data: { title, artist, name: r.name } });
    return json(res, 200, { id: r.id });
  }

  if (p === '/api/vote') {
    const r = state.requests.find((x) => x.id === b.id);
    if (!r) return json(res, 404, { error: 'No existe' });
    const i = r.voters.indexOf(clientId);
    if (i === -1) r.voters.push(clientId); else if (r.clientId !== clientId) r.voters.splice(i, 1);
    broadcast();
    return json(res, 200, { votes: r.voters.length });
  }

  if (p === '/api/tip') {
    if (!allowed('tip:' + clientId, 5)) return json(res, 429, { error: 'Gracias, ya quedó registrado 🍻' });
    const t = { id: id(), clientId, name: clean(b.name, 40), message: clean(b.message, 160), ts: Date.now() };
    state.tips.push(t);
    broadcast({ event: 'new-tip', data: t });
    return json(res, 200, { ok: true });
  }

  // ----- DJ -----
  if (!p.startsWith('/api/dj/')) { res.writeHead(404); return res.end(); }
  if (!isDJ(req, url, ip)) return json(res, 401, { error: pinLocked(ip) ? 'Demasiados intentos. Espera 10 minutos.' : 'PIN incorrecto' });

  if (p === '/api/dj/login') return json(res, 200, { ok: true });

  if (p === '/api/dj/status') {
    const r = state.requests.find((x) => x.id === b.id);
    if (!r || !['new', 'accepted', 'playing', 'played', 'rejected'].includes(b.status)) return json(res, 400, { error: 'Dato inválido' });
    if (b.status === 'playing') for (const x of state.requests) if (x.status === 'playing') x.status = 'played';
    r.status = b.status;
    broadcast();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/dj/delete') {
    state.requests = state.requests.filter((x) => x.id !== b.id);
    broadcast();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/dj/add') { // el DJ agrega una canción a mano
    const title = clean(b.title, 100);
    if (!title) return json(res, 400, { error: 'Falta el título' });
    state.requests.push({ id: id(), key: norm(title + ' ' + clean(b.artist, 80)), title, artist: clean(b.artist, 80), name: 'DJ', note: '', clientId: 'dj', voters: [], status: 'accepted', ts: Date.now() });
    broadcast();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/dj/config') {
    const c = state.config, n = b.config || {};
    for (const k of ['djName', 'eventName', 'publicUrl', 'tipUrl', 'tipLabel', 'tipAmount']) if (k in n) c[k] = clean(n[k], 300);
    if ('open' in n) c.open = !!n.open;
    if ('maxPerWindow' in n) c.maxPerWindow = Math.max(1, Math.min(50, Number(n.maxPerWindow) || 3));
    if (n.bank) for (const k of Object.keys(c.bank)) if (k in n.bank) c.bank[k] = clean(n.bank[k], 80);
    if (n.pin && /^\S{4,64}$/.test(String(n.pin))) c.pin = String(n.pin);
    if (c.publicUrl && !/^https?:\/\//i.test(c.publicUrl)) c.publicUrl = 'https://' + c.publicUrl;
    broadcast();
    return json(res, 200, { ok: true, pin: c.pin });
  }
  if (p === '/api/dj/clear') {
    if (b.what === 'played') state.requests = state.requests.filter((r) => !['played', 'rejected'].includes(r.status));
    else { state.requests = []; state.tips = []; hits.clear(); }
    broadcast();
    return json(res, 200, { ok: true });
  }
  res.writeHead(404); res.end();
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n⚠️  El puerto ${PORT} ya está en uso — ¿DJ Request ya está abierto en otra ventana?\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  🎧  DJ Request funcionando\n');
  if (PUBLIC_URL) console.log(`  Dirección pública: ${PUBLIC_URL}  (panel: ${PUBLIC_URL.replace(/\/+$/, '')}/dj)`);
  console.log(`  Panel DJ:     http://localhost:${PORT}/dj      PIN: ${state.config.pin}`);
  console.log(`  Pantalla QR:  http://localhost:${PORT}/qr`);
  for (const ip of ips) console.log(`  Público (WiFi): http://${ip}:${PORT}/`);
  if (state.config.publicUrl) console.log(`  Público (internet): ${state.config.publicUrl}`);
  console.log('\n  Cierra esta ventana (o Ctrl+C) para apagar.\n');
});
