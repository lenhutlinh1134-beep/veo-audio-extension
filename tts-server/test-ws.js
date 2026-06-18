const WebSocket = require('ws');
const crypto = require('crypto');

const TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function generateSecMsGec() {
  const WIN_EPOCH = 11644473600n;
  const S_TO_100NS = 10000000n;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const winTime = (now + WIN_EPOCH) * S_TO_100NS;
  const fiveMin = 5n * 60n * S_TO_100NS;
  const rounded = winTime - (winTime % fiveMin);
  const input = `${rounded}${TTS_TOKEN}`;
  return crypto.createHash('sha256').update(input, 'ascii').digest('hex').toUpperCase();
}

const gec = generateSecMsGec();
console.log('GEC:', gec);

const connId = crypto.randomUUID().replace(/-/g,'');
const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TTS_TOKEN}&ConnectionId=${connId}`;

const ws = new WebSocket(url, {
  headers: {
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    'Sec-MS-GEC': gec,
    'Sec-MS-GEC-Version': '1-130.0.2849.68',
  }
});
ws.on('open', () => { console.log('CONNECTED OK'); ws.close(); });
ws.on('error', e => console.log('ERROR:', e.message));
ws.on('close', (code, reason) => console.log('CLOSE:', code, reason.toString()));
setTimeout(() => process.exit(0), 5000);
