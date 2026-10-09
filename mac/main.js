// DJ Request.app — ventana propia para el Panel DJ que está en internet (Render).
// La crea mac/crear_app.sh; esta app solo muestra la página, el servidor sigue en la nube.
'use strict';
const { app, BrowserWindow, Menu, shell, clipboard, net, powerSaveBlocker } = require('electron');
const path = require('path');

const BASE = process.env.DJR_URL || 'https://dj-request.onrender.com';
const PANEL = BASE + '/dj';
const QR = BASE + '/qr';
const PUBLICO = BASE + '/';

// Para que suene el aviso de pedido nuevo aunque no hayas hecho clic en la ventana
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null, qrWin = null;

const webPrefs = (extra) => ({
  contextIsolation: true,
  backgroundThrottling: false, // con la ventana minimizada sigue recibiendo pedidos y mantiene despierto el servidor
  ...extra,
});

// Render gratis se duerme: esperamos a que despierte antes de cargar el panel
async function servidorListo(ms = 120000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const r = await net.fetch(BASE + '/healthz', { cache: 'no-store' });
      if (r.ok) return true;
    } catch {}
    await new Promise((res) => setTimeout(res, 3000));
  }
  return false;
}

async function cargarPanel() {
  if (!win) return;
  win.loadFile(path.join(__dirname, 'cargando.html'));
  const ok = await servidorListo();
  if (!win) return;
  if (ok) win.loadURL(PANEL);
  else win.loadFile(path.join(__dirname, 'cargando.html'), { query: { error: '1' } });
}

function abrirQR() {
  if (qrWin && !qrWin.isDestroyed()) { qrWin.show(); qrWin.focus(); return; }
  qrWin = new BrowserWindow({
    width: 1100, height: 680, title: 'DJ Request — Pantalla QR', backgroundColor: '#0b0a12',
    autoHideMenuBar: true, webPreferences: webPrefs(),
  });
  qrWin.loadURL(QR);
  qrWin.on('closed', () => { qrWin = null; });
}

function crearVentana() {
  win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 420, minHeight: 500,
    title: 'DJ Request', backgroundColor: '#0b0a12',
    webPreferences: webPrefs(),
  });
  // Enlaces de la página: la Pantalla QR se abre en su propia ventana; lo demás, en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(QR)) { abrirQR(); return { action: 'deny' }; }
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(BASE) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); }
  });
  // Si se corta internet, reintentar
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (isMain && url.startsWith(BASE) && code !== -3) setTimeout(cargarPanel, 2000);
  });
  win.on('closed', () => { win = null; });
  cargarPanel();
}

function menu() {
  const t = [
    { role: 'appMenu', label: 'DJ Request' },
    { role: 'editMenu', label: 'Edición' },
    {
      label: 'DJ Request',
      submenu: [
        { label: 'Panel DJ', accelerator: 'CmdOrCtrl+1', click: () => { if (win) { win.show(); win.focus(); } else crearVentana(); } },
        { label: 'Pantalla QR', accelerator: 'CmdOrCtrl+2', click: abrirQR },
        { type: 'separator' },
        { label: 'Abrir página del público en el navegador', click: () => shell.openExternal(PUBLICO) },
        { label: 'Copiar link del público', accelerator: 'CmdOrCtrl+Shift+C', click: () => clipboard.writeText(PUBLICO) },
        { type: 'separator' },
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.webContents.reload(); } },
      ],
    },
    { role: 'viewMenu', label: 'Ver' },
    { role: 'windowMenu', label: 'Ventana' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

app.setName('DJ Request');
app.whenReady().then(() => {
  menu();
  // Que el Mac no "duerma" la app durante la fiesta (sí puede apagar la pantalla)
  powerSaveBlocker.start('prevent-app-suspension');
  crearVentana();
  app.on('activate', () => { if (!win) crearVentana(); else win.show(); });
});
app.on('window-all-closed', () => app.quit());
