// VEO TTS Server - chạy: node server.js
// Mở http://localhost:3000 trong trình duyệt

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const WebSocket = require('ws');
const crypto    = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

const TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

// Microsoft yêu cầu header này từ phiên bản mới — hash SHA256 của timestamp + token
function generateSecMsGec() {
  const WIN_EPOCH = 11644473600n;   // giây từ 1601 đến 1970
  const S_TO_100NS = 10000000n;     // 100-nanosecond intervals mỗi giây
  const now = BigInt(Math.floor(Date.now() / 1000));
  const winTime = (now + WIN_EPOCH) * S_TO_100NS;
  // Làm tròn xuống bội số 5 phút
  const fiveMin = 5n * 60n * S_TO_100NS;
  const rounded = winTime - (winTime % fiveMin);
  const input = `${rounded}${TTS_TOKEN}`;
  return crypto.createHash('sha256').update(input, 'ascii').digest('hex').toUpperCase();
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Serve tts-tool.html: local → từ thư mục cha, Render → từ cùng thư mục
const staticDir = require('fs').existsSync(path.join(__dirname, '../tts-tool.html'))
  ? path.join(__dirname, '..')
  : __dirname;
app.use(express.static(staticDir));
app.get('/', (_req, res) => res.redirect('/tts-tool.html'));

// ── Health check ──────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// ── TTS synthesis ──────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text, voice, rate = 0 } = req.body;
  if (!text || !voice) return res.status(400).json({ error: 'Thiếu text hoặc voice' });

  try {
    const audio = await synthesizeEdgeTTS(text, voice, rate);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.end(audio);
  } catch (err) {
    console.error('[TTS]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Edge TTS qua WebSocket (Node.js không bị browser chặn) ──
function synthesizeEdgeTTS(text, voice, ratePct) {
  return new Promise((resolve, reject) => {
    const connId  = crypto.randomUUID().replace(/-/g, '');
    const wsUrl   = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TTS_TOKEN}&ConnectionId=${connId}&Retry=0`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        'Sec-MS-GEC': generateSecMsGec(),
        'Sec-MS-GEC-Version': '1-130.0.2849.68',
      }
    });

    const chunks = [];
    let done  = false;
    let timer = setTimeout(() => {
      if (!done) { done = true; ws.terminate(); reject(new Error('Timeout 30s')); }
    }, 30000);

    ws.on('open', () => {
      const ts = new Date().toISOString();
      // 1. Gửi config
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataOptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );
      // 2. Gửi SSML
      const rateStr = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`;
      const safe    = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const ssml    = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody rate='${rateStr}'>${safe}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // 2 bytes đầu = header length (big-endian)
        const headerLen = data.readUInt16BE(0);
        const audio     = data.slice(2 + headerLen);
        if (audio.length > 0) chunks.push(audio);
      } else {
        const str = data.toString('utf8');
        if (str.includes('Path:turn.end')) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            ws.close();
            resolve(Buffer.concat(chunks));
          }
        }
      }
    });

    ws.on('error', (err) => {
      if (!done) { done = true; clearTimeout(timer); reject(err); }
    });

    ws.on('close', (code, reason) => {
      if (!done) {
        done = true; clearTimeout(timer);
        if (chunks.length > 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`WS đóng sớm (${code}): ${reason}`));
      }
    });
  });
}

app.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────┐');
  console.log('  │  VEO TTS Server dang chay        │');
  console.log('  │  Mo: http://localhost:3000        │');
  console.log('  │  Ctrl+C de dung                  │');
  console.log('  └─────────────────────────────────┘');
  console.log('');
});
