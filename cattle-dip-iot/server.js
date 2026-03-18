// ============================================================
// AcaraSense Pro — Node.js Real-Time Server
// ESP8266 sends HTTP POST → server → WebSocket → dashboard
// ============================================================
const http        = require('http');
const fs          = require('fs');
const path        = require('path');
const { WebSocketServer } = require('ws');
const nodemailer  = require('nodemailer');

// ─── CONFIGURATION ──────────────────────────────────────────
const CONFIG = {
  PORT           : 3000,
  // Alert thresholds
  LEVEL_LOW      : 25,    // % — sends warning email
  LEVEL_CRITICAL : 15,    // % — sends critical email
  TEMP_MAX       : 30,    // °C
  CONC_MIN       : 1.0,   // %
  CONC_MAX       : 2.0,   // %
  // Email — fill in your Gmail App Password
  EMAIL_FROM     : 'your_sender@gmail.com',
  EMAIL_TO       : 'brayomaisiba@gmail.com',
  EMAIL_PASS     : 'your_gmail_app_password',   // Gmail App Password
  EMAIL_COOLDOWN : 30 * 60 * 1000,              // 30 min between emails
};

// ─── STATE ──────────────────────────────────────────────────
let latestReading  = null;   // most recent sensor payload
let history        = [];     // last 50 readings for charts
let lastEmailTime  = 0;
let clients        = new Set();   // connected WebSocket browsers

// ─── EMAIL TRANSPORT ────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service : 'gmail',
  auth    : { user: CONFIG.EMAIL_FROM, pass: CONFIG.EMAIL_PASS },
});

async function sendAlertEmail(level, conc, temp, severity) {
  const now = Date.now();
  if (now - lastEmailTime < CONFIG.EMAIL_COOLDOWN) {
    console.log('[EMAIL] Cooldown active — skipped');
    return;
  }
  lastEmailTime = now;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
    <div style="background:#1a5c2a;color:#fff;padding:24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">⚠ Cattle Dip Tank Alert</h2>
      <p style="margin:6px 0 0;opacity:.75">AcaraSense Pro — Automated Alert · ${new Date().toLocaleString()}</p>
    </div>
    <div style="border:1px solid #e0e8e0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
      <div style="background:#fff2f2;border-left:4px solid #e24b4a;padding:12px 16px;margin-bottom:20px;border-radius:4px">
        <strong>Alert Level: ${severity}</strong> — Immediate action required!
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f5f9f5"><td style="padding:10px 14px;color:#555">Tank Level (HC-SR04)</td>
          <td style="padding:10px 14px;font-weight:bold;color:#e24b4a">${level.toFixed(1)}%</td></tr>
        <tr><td style="padding:10px 14px;color:#555">Acaricide Concentration</td>
          <td style="padding:10px 14px;font-weight:bold">${conc.toFixed(2)}%</td></tr>
        <tr style="background:#f5f9f5"><td style="padding:10px 14px;color:#555">Dip Temperature (DS18B20)</td>
          <td style="padding:10px 14px;font-weight:bold">${temp.toFixed(1)}°C</td></tr>
      </table>
      <p style="margin-top:20px;color:#333">Please refill the tank and verify acaricide concentration
         is between ${CONFIG.CONC_MIN}–${CONFIG.CONC_MAX}%.</p>
      <p style="color:#888;font-size:12px;margin-top:24px">
        AcaraSense Pro · Local dashboard: <a href="http://localhost:${CONFIG.PORT}">http://localhost:${CONFIG.PORT}</a>
      </p>
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from   : `"AcaraSense Pro" <${CONFIG.EMAIL_FROM}>`,
      to     : CONFIG.EMAIL_TO,
      subject: `[AcaraSense] ${severity} — Tank Level ${level.toFixed(1)}%`,
      html,
    });
    console.log(`[EMAIL] ✓ Alert sent to ${CONFIG.EMAIL_TO} (${severity})`);
  } catch (err) {
    console.error('[EMAIL] Failed:', err.message);
  }
}

// ─── BROADCAST TO ALL DASHBOARD BROWSERS ────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ─── PROCESS INCOMING SENSOR PAYLOAD ────────────────────────
async function processSensorData(payload) {
  const { temp, level, conc, animals } = payload;
  const ts = Date.now();

  // Build reading object
  const reading = { temp, level, conc, animals: animals ?? 0, ts };
  latestReading = reading;

  // Keep rolling 50-point history
  history.push({ temp, level, conc, ts });
  if (history.length > 50) history.shift();

  // Determine alert status
  let alert = null;
  if (level <= CONFIG.LEVEL_CRITICAL) {
    alert = { type: 'CRITICAL', message: `Tank CRITICAL: ${level.toFixed(1)}% — Refill immediately!` };
    await sendAlertEmail(level, conc, temp, 'CRITICAL');
  } else if (level <= CONFIG.LEVEL_LOW) {
    alert = { type: 'WARNING', message: `Tank LOW: ${level.toFixed(1)}% — Schedule refill soon.` };
    await sendAlertEmail(level, conc, temp, 'WARNING');
  }
  if (temp > CONFIG.TEMP_MAX)
    alert = { type: 'WARNING', message: `High temperature: ${temp.toFixed(1)}°C — Effectiveness may reduce.` };
  if (conc < CONFIG.CONC_MIN || conc > CONFIG.CONC_MAX)
    alert = { type: 'WARNING', message: `Concentration ${conc.toFixed(2)}% out of range (${CONFIG.CONC_MIN}–${CONFIG.CONC_MAX}%).` };

  // Push live update to all browser dashboards
  broadcast({ type: 'update', reading, history, alert });

  console.log(`[DATA] Temp:${temp}°C  Level:${level}%  Conc:${conc}%  Clients:${clients.size}`);
}

// ─── HTTP SERVER ─────────────────────────────────────────────
const server = http.createServer((req, res) => {

  // ESP8266 posts sensor data here
  if (req.method === 'POST' && req.url === '/data') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        await processSensorData(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('[POST /data] Parse error:', e.message);
        res.writeHead(400); res.end('Bad JSON');
      }
    });
    return;
  }

  // Serve dashboard HTML
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const file = path.join(__dirname, 'dashboard.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('Dashboard not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// ─── WEBSOCKET SERVER (same port, different path) ────────────
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Browser connected. Total: ${clients.size}`);

  // Send current state immediately on connect
  if (latestReading) {
    ws.send(JSON.stringify({ type: 'update', reading: latestReading, history, alert: null }));
  }

  ws.on('close', () => { clients.delete(ws); console.log(`[WS] Browser disconnected. Total: ${clients.size}`); });
  ws.on('error', () => clients.delete(ws));
});

// ─── START ───────────────────────────────────────────────────
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   AcaraSense Pro — Server Running        ║');
  console.log(`  ║   Dashboard  →  http://localhost:${CONFIG.PORT}   ║`);
  console.log(`  ║   ESP8266 POST → http://<YOUR_PC_IP>:${CONFIG.PORT}/data ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  Find your PC IP:  Windows → ipconfig   Mac/Linux → ifconfig');
  console.log('  Update ESP8266 firmware with that IP address.');
  console.log('');
});
