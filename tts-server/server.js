// VEO TTS Server
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const os        = require('os');
const fs        = require('fs');
const crypto    = require('crypto');
const { execFile } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const staticDir = fs.existsSync(path.join(__dirname, '../tts-tool.html'))
  ? path.join(__dirname, '..')
  : __dirname;
app.use(express.static(staticDir));
app.get('/', (_req, res) => res.redirect('/tts-tool.html'));

// ── Health check ──────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// ── TTS via Python edge-tts ──────────────
app.post('/api/tts', async (req, res) => {
  const { text, voice, rate = 0 } = req.body;
  if (!text || !voice) return res.status(400).json({ error: 'Thiếu text hoặc voice' });

  const tmpFile = path.join(os.tmpdir(), `tts_${crypto.randomBytes(8).toString('hex')}.mp3`);
  const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;

  // Dùng python3 -m edge_tts (Python library xử lý Sec-MS-GEC đúng hơn Node.js)
  const args = [
    '-m', 'edge_tts',
    '--voice', voice,
    '--text', text,
    '--rate', rateStr,
    '--write-media', tmpFile
  ];

  const python = process.platform === 'win32' ? 'python' : 'python3';

  execFile(python, args, { timeout: 30000 }, (err, _stdout, stderr) => {
    if (err) {
      console.error('[TTS] edge-tts error:', stderr || err.message);
      fs.unlink(tmpFile, () => {});
      return res.status(500).json({ error: `edge-tts thất bại: ${stderr || err.message}` });
    }

    fs.readFile(tmpFile, (readErr, data) => {
      fs.unlink(tmpFile, () => {}); // xóa file tạm
      if (readErr) return res.status(500).json({ error: 'Không đọc được file audio' });
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', data.length);
      res.end(data);
      console.log(`[TTS] OK: ${voice} — ${text.slice(0, 40)}...`);
    });
  });
});

app.listen(PORT, () => {
  console.log(`VEO TTS Server: http://localhost:${PORT}`);
});
