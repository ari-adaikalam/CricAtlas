// Serves the exported Parquet files with HTTP Range support, for local development.
// DELAY=80 MBPS=40 node scripts/data-server.mjs adds network-like latency and a bandwidth limit.
// CACHE=1 sends the header production sends (Cache-Control: public, max-age=31536000, immutable), to measure a warm visit. Leave it off while the data is changing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import zlib from 'node:zlib';

const root = path.resolve(process.env.DATA_DIR ?? '../data/export');
const port = Number(process.env.PORT ?? 8788);
let delay = Number(process.env.DELAY ?? 0);
const bytesPerSecond = Number(process.env.MBPS ?? 0) * 125000;

// For testing loading states: GET /__delay/6000 adds that many milliseconds to every file request from then on, GET /__delay/0 removes it.
// For testing the error state: GET /__fail/on makes every file request fail, GET /__fail/off restores them.
let failing = false;

const throttle = () => new Transform({ transform(chunk, _enc, cb) { setTimeout(() => cb(null, chunk), (chunk.length / bytesPerSecond) * 1000); } });

http.createServer((req, res) => {
  const set = /^\/__delay\/(\d+)$/.exec(req.url ?? '');
  if (set) { delay = Number(set[1]); res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(200); return res.end(String(delay)); }
  setTimeout(() => {
    if (req.url === '/__fail/on' || req.url === '/__fail/off') {
      failing = req.url.endsWith('on');
      res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(200); return res.end(String(failing));
    }
    if (failing) { res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(503); return res.end(); }
    let asked = '/';
    try { asked = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'); } catch { res.writeHead(400); return res.end(); }
    const file = path.join(root, asked);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.setHeader('Access-Control-Allow-Origin', '*'); res.writeHead(404); return res.end(); }
    const size = fs.statSync(file).size;
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Without CACHE the browser must ask again each time, so a browser (Safari keeps files on a guess) never serves a file from before the last export.
    res.setHeader('Cache-Control', process.env.CACHE ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Content-Length,Accept-Ranges');
    // JSON and point files are sent compressed, as the CDN in front of the bucket does.
    if ((file.endsWith('.json') || file.endsWith('.bin')) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && !req.headers.range) {
      res.writeHead(200, { 'Content-Type': file.endsWith('.bin') ? 'application/octet-stream' : 'application/json', 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
      const gz = fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 }));
      return (bytesPerSecond ? gz.pipe(throttle()) : gz).pipe(res);
    }
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    const start = m ? Number(m[1]) : 0;
    const end = m?.[2] ? Number(m[2]) : size - 1;
    res.writeHead(m ? 206 : 200, { 'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1, ...(m ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    const stream = fs.createReadStream(file, { start, end });
    (bytesPerSecond ? stream.pipe(throttle()) : stream).pipe(res);
  }, delay);
// Local only: the data folder is not offered to the rest of the network. A phone check reaches it through `tailscale serve`, which connects to 127.0.0.1.
}).listen(port, '127.0.0.1', () => console.log(`data server on :${port} serving ${root}`));
