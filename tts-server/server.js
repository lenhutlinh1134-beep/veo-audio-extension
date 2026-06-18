// VEO TTS Server — dùng Google Cloud TTS (free 1M ký tự/tháng)
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const staticDir = fs.existsSync(path.join(__dirname, '../tts-tool.html'))
  ? path.join(__dirname, '..')
  : __dirname;
app.use(express.static(staticDir));
app.get('/', (_req, res) => res.redirect('/tts-tool.html'));

// ── Map tên giọng Edge TTS → Google Cloud TTS ──
const VOICE_MAP = {
  'vi-VN-HoaiMyNeural':  { name: 'vi-VN-Neural2-A', lang: 'vi-VN' },
  'vi-VN-NamMinhNeural': { name: 'vi-VN-Neural2-B', lang: 'vi-VN' },
  'en-US-JennyNeural':   { name: 'en-US-Neural2-F', lang: 'en-US' },
  'en-US-GuyNeural':     { name: 'en-US-Neural2-J', lang: 'en-US' },
  'en-US-AriaNeural':    { name: 'en-US-Neural2-C', lang: 'en-US' },
  'en-US-DavisNeural':   { name: 'en-US-Neural2-D', lang: 'en-US' },
};

// ── Health check ──────────────────────────
app.get('/api/ping', (_req, res) => {
  const hasKey = !!(process.env.GOOGLE_TTS_KEY);
  res.json({ ok: true, hasKey });
});

// ── TTS synthesis ──────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text, voice, rate = 0, apiKey: clientKey } = req.body;
  if (!text || !voice) return res.status(400).json({ error: 'Thiếu text hoặc voice' });

  const key = process.env.GOOGLE_TTS_KEY || clientKey;
  if (!key) {
    return res.status(401).json({
      error: 'Chưa có Google API Key. Thêm GOOGLE_TTS_KEY vào Environment Variables trên Render.',
      setup: true
    });
  }

  const gVoice = VOICE_MAP[voice];
  if (!gVoice) return res.status(400).json({ error: `Giọng không hỗ trợ: ${voice}` });

  // Rate: +20% → speakingRate 1.2, -20% → 0.8
  const speakingRate = Math.max(0.25, Math.min(4.0, 1 + rate / 100));

  try {
    const resp = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: gVoice.lang, name: gVoice.name },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate,
            pitch: 0,
            volumeGainDb: 0
          }
        })
      }
    );

    const json = await resp.json();

    if (!resp.ok || !json.audioContent) {
      const errMsg = json.error?.message || JSON.stringify(json);
      console.error('[TTS] Google error:', errMsg);
      return res.status(500).json({ error: `Google TTS lỗi: ${errMsg}` });
    }

    const audio = Buffer.from(json.audioContent, 'base64');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.end(audio);
    console.log(`[TTS] OK ${voice} ${audio.length} bytes — "${text.slice(0, 40)}"`);

  } catch (err) {
    console.error('[TTS] fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`VEO TTS: http://localhost:${PORT}`));
