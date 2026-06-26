/**
 * Pi Pet Server — HTTP + SSE + pi RPC bridge
 * Zero dependencies, built-in Node.js modules only.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3650;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

// ========== pi RPC process ==========

let piProcess = null;
let rpcBuf = '';
const sseClients = [];

function startPiRPC() {
  if (piProcess) return;
  try {
    piProcess = spawn('pi', ['--mode', 'rpc', '--no-session'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.env.USERPROFILE || process.env.HOME,
    });

    piProcess.stdout.on('data', (data) => {
      rpcBuf += data.toString();
      const lines = rpcBuf.split('\n');
      rpcBuf = lines.pop();
      for (const line of lines) {
        if (line.trim()) {
          try { sseSend({ source: 'pi', ...JSON.parse(line) }); }
          catch (_) { /* non-JSON startup output */ }
        }
      }
    });

    piProcess.stderr.on('data', (d) => console.error(`[pi] ${d}`));
    piProcess.on('close', (c) => {
      console.log(`pi exited (${c}), restart in 2s`);
      piProcess = null;
      setTimeout(startPiRPC, 2000);
    });
    piProcess.on('error', (e) => { console.error(`pi: ${e.message}`); piProcess = null; });
    console.log('pi RPC started');
  } catch (e) { console.error('pi start failed:', e); }
}

function piSend(msg) {
  if (piProcess?.stdin?.writable) {
    piProcess.stdin.write(JSON.stringify(msg) + '\n');
  }
}

// ========== SSE ==========

function sseSend(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch (_) { /* ignore dead clients */ }
  }
}

// ========== HTTP ==========

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // SSE endpoint
  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ source: 'system', type: 'connected' })}\n\n`);
    sseClients.push(res);
    req.on('close', () => {
      const i = sseClients.indexOf(res);
      if (i >= 0) sseClients.splice(i, 1);
    });
    return;
  }

  // API: send prompt to pi
  if (pathname === '/api/send' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        piSend(msg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: restart pi
  if (pathname === '/api/restart' && req.method === 'POST') {
    if (piProcess) { piProcess.kill(); piProcess = null; }
    setTimeout(startPiRPC, 500);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ========== Start ==========

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║        Pi Pet · Live2D 桌宠         ║
  ║                                      ║
  ║  ➜  http://localhost:${PORT}          ║
  ║                                      ║
  ║  按 Ctrl+C 退出                       ║
  ╚══════════════════════════════════════╝
  `);
  startPiRPC();
});

process.on('SIGINT', () => { if (piProcess) piProcess.kill(); process.exit(); });
process.on('SIGTERM', () => { if (piProcess) piProcess.kill(); process.exit(); });
