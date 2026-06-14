// sidepanel.js — VEO Audio Extension (AI Studio TTS only)

let mode = 'text-to-speech';
let platform = 'aistudio-speech';
let settings = { organizeByDate: true, autoDownload: true, skipOnError: true, retryOnError: true };

// ══════════════════════════════════════
// ██ INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  updatePath();
  refreshState();
  fetchProjects();

  // ── Tabs ──
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
    });
  });

  // ── Prompt textarea ──
  const promptArea = document.getElementById('prompt-area');
  if (promptArea) promptArea.addEventListener('input', countPrompts);

  // ── Import buttons ──
  document.getElementById('btn-import-txt')?.addEventListener('click', () => document.getElementById('f-txt').click());
  document.getElementById('btn-import-csv')?.addEventListener('click', () => document.getElementById('f-csv').click());
  document.getElementById('btn-clear')?.addEventListener('click', clearPrompts);
  document.getElementById('btn-sample')?.addEventListener('click', loadSample);

  // ── File inputs ──
  document.getElementById('f-txt')?.addEventListener('change', importTxt);
  document.getElementById('f-csv')?.addEventListener('change', importCsv);

  // ── Path builder inputs ──
  document.getElementById('inp-root')?.addEventListener('input', () => { updatePath(); saveSettings(); });
  document.getElementById('inp-project')?.addEventListener('input', () => { updatePath(); saveSettings(); });

  document.getElementById('chk-date')?.addEventListener('change', (e) => {
    settings.organizeByDate = e.target.checked;
    updatePath();
    saveSettings();
  });

  // ── Main buttons ──
  document.getElementById('btn-test')?.addEventListener('click', testConnection);
  document.getElementById('btn-start')?.addEventListener('click', startQueue);
  document.getElementById('btn-stop')?.addEventListener('click', stopQueue);

  // ── Toggle switches ──
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const key = toggle.dataset.key;
      if (key) {
        settings[key] = !settings[key];
        toggle.classList.toggle('on', settings[key]);
        saveSettings();
        updatePath();
      }
    });
  });

  countPrompts();
});

// ── Nhận state updates từ background ──
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'STATE_UPDATE') renderState(msg.state);
});

// ══════════════════════════
// ██ PATH PREVIEW
// ══════════════════════════
function updatePath() {
  const root = document.getElementById('inp-root')?.value || 'VEO_Automation';
  const proj = document.getElementById('inp-project')?.value || 'tên-dự-án';
  const date = settings.organizeByDate ? '\\' + new Date().toISOString().slice(0, 10) : '';

  const platformLabel = 'ÂM THANH';
  const subLabel = 'am_thanh';

  const parts = [root, proj, platformLabel];
  const mid = parts.join('\\') + date;
  const end = '\\' + subLabel + '\\001_SCENE.wav';

  const preview = document.getElementById('pb-preview');
  if (preview) {
    preview.textContent = mid + end;
  }
}

// ══════════════════════════
// ██ PROMPTS
// ══════════════════════════
function countPrompts() {
  const prompts = getPrompts();
  const n = prompts.length;
  const el = document.getElementById('prompt-count');
  if (el) {
    el.innerHTML = `
      <span class="badge-container">
        <span class="badge badge-prompts">${n} prompt</span>
        <span class="badge badge-outputs">${n} audio</span>
      </span>
    `;
  }

  const previewBox = document.getElementById('prompt-preview-container');
  if (previewBox) {
    if (n === 0) {
      previewBox.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-dark);font-size:11px;">Chưa phát hiện đoạn nào. Hãy điền/dán nội dung ở trên.</div>';
    } else {
      previewBox.innerHTML = prompts.map((p, index) => {
        const title = p.name ? p.name : `Đoạn ${String(index + 1).padStart(2, '0')}`;
        const excerpt = p.text.slice(0, 65) + (p.text.length > 65 ? '...' : '');
        return `
          <div class="preview-item">
            <div class="preview-title"><span class="idx">#${index + 1}</span> ${esc(title)}</div>
            <div class="preview-text" title="${esc(p.text)}">${esc(excerpt)}</div>
          </div>
        `;
      }).join('');
    }
  }
}

function getPrompts() {
  const text = document.getElementById('prompt-area')?.value || '';
  if (!text.trim()) return [];

  // Split by double newline first
  if (text.includes('\n\n')) {
    return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean).map(p => ({ text: p.replace(/\n/g, ' '), name: '' }));
  }

  // Each line as one prompt
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ text: l, name: '' }));
}

function clearPrompts() {
  const el = document.getElementById('prompt-area');
  if (el) el.value = '';
  countPrompts();
}

function loadSample() {
  const el = document.getElementById('prompt-area');
  if (el) {
    el.value =
`Xin chào! Hôm nay chúng ta sẽ cùng khám phá những bí quyết giúp bạn học tiếng Anh hiệu quả hơn, nhanh hơn và thú vị hơn. Hãy bắt đầu ngay nhé!

Bước đầu tiên là xây dựng thói quen nghe hàng ngày. Chỉ cần 15 đến 20 phút mỗi ngày nghe podcast hoặc xem video tiếng Anh có phụ đề, bạn sẽ thấy sự tiến bộ rõ rệt sau chỉ một tháng.

Bước thứ hai là không ngại mắc lỗi. Ngôn ngữ được học qua thực hành, không phải qua lý thuyết. Hãy nói, viết và giao tiếp càng nhiều càng tốt — mỗi lỗi sai là một bài học quý giá trên con đường chinh phục tiếng Anh.`;
  }
  countPrompts();
}

function importTxt(event) {
  const file = event.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const el = document.getElementById('prompt-area');
    if (el) el.value = e.target.result.trim();
    countPrompts(); toast(`✓ Imported từ .txt`);
  };
  r.readAsText(file); event.target.value = '';
}

function importCsv(event) {
  const file = event.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const lines = e.target.result.split('\n')
      .map(l => l.split(',')[0].replace(/^"|"$/g, '').trim())
      .filter(l => l && l.toLowerCase() !== 'prompt' && l.toLowerCase() !== 'text');
    const el = document.getElementById('prompt-area');
    if (el) el.value = lines.join('\n\n');
    countPrompts(); toast(`✓ Imported ${lines.length} đoạn từ CSV`);
  };
  r.readAsText(file); event.target.value = '';
}

// ══════════════════════════
// ██ TEST CONNECTION
// ══════════════════════════
async function testConnection() {
  const btn = document.getElementById('btn-test');
  btn.textContent = '⏳ Đang kiểm tra...'; btn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION', platform: 'aistudio-speech' });
    if (res?.ok) {
      const tabUrl = (res.url || '').replace(/^https?:\/\//, '').slice(0, 50);
      const inputInfo = res.foundInput ? '✓ Ô nhập' : '⚠ Chưa thấy ô nhập';
      const submitInfo = res.foundSubmit ? ' · ✓ Nút Tạo' : ' · ⚠ Chưa thấy nút Tạo';
      const readyState = res.foundInput && res.foundSubmit
        ? `<b style="color:#38bdf8">✅ Sẵn sàng chạy!</b>`
        : `<b style="color:#ff6b6b">⚠ Trang chưa load xong</b>`;
      showBanner(`${readyState}<br><small>${tabUrl}</small><br><small>${inputInfo}${submitInfo}</small>`, res.foundInput && res.foundSubmit ? 'ok' : 'error');
    } else {
      const hint = res?.reason === 'no_tab'
        ? `Chưa tìm thấy tab AI Studio.<br>Hãy mở <b>aistudio.google.com/u/4/generate-speech</b> trong Chrome.`
        : `Lỗi: ${res?.reason || res?.error || 'không rõ'}`;
      showBanner(`❌ Kết nối thất bại<br><small>${hint}</small>`, 'error');
    }
  } catch (e) { showBanner(`❌ ${e.message}`, 'error'); }
  btn.textContent = '🔌 Test kết nối AI Studio'; btn.disabled = false;
}

// ══════════════════════════
// ██ START / STOP QUEUE
// ══════════════════════════
async function startQueue() {
  const prompts = getPrompts();
  if (!prompts.length) { toast('⚠ Chưa có nội dung'); return; }

  const concurrent = Math.min(parseInt(document.getElementById('inp-concurrent')?.value) || 1, 2);
  const delaySeconds = parseInt(document.getElementById('inp-delay')?.value) || 5;

  chrome.runtime.sendMessage({
    type: 'START_QUEUE',
    prompts,
    mode: 'text-to-speech',
    platform: 'aistudio-speech',
    concurrency: concurrent,
    delaySeconds,
    settings: {
      root: document.getElementById('inp-root')?.value || 'VEO_Automation',
      project: document.getElementById('inp-project')?.value || '',
      ...settings
    }
  });

  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('btn-stop').style.display = 'block';
  document.getElementById('prog-box').style.display = 'block';
  showBanner(`▶ Đã gửi ${prompts.length} đoạn vào hàng chờ`, 'ok');
}

function stopQueue() {
  chrome.runtime.sendMessage({ type: 'STOP_QUEUE' });
  document.getElementById('btn-start').style.display = 'block';
  document.getElementById('btn-stop').style.display = 'none';
  toast('⬛ Đã dừng');
}

// ══════════════════════════
// ██ STATE RENDERING
// ══════════════════════════
async function refreshState() {
  const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
  if (s) renderState(s);
}

function renderState(s) {
  if (!s) return;
  const total = s.total || 0, done = s.doneCount || 0, failed = s.failedCount || 0;
  const running = (s.running || []).length;
  const waiting = (s.queue || []).filter(i => i.status === 'waiting').length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  const bar = document.getElementById('prog-bar');
  if (bar) bar.style.width = pct + '%';
  setText('cnt-done', done);
  setText('cnt-run', running);
  setText('cnt-fail', failed);
  setText('cnt-wait', waiting);

  if (total > 0) document.getElementById('prog-box').style.display = 'block';
  if (!s.isRunning && total > 0 && done + failed >= total) {
    document.getElementById('btn-start').style.display = 'block';
    document.getElementById('btn-stop').style.display = 'none';
    if (done === total) showBanner(`🎉 Xong! ${done} audio hoàn thành.`, 'ok');
  }
  renderQueue(s);
}

function renderQueue(s) {
  const wrap = document.getElementById('queue-wrap'); if (!wrap) return;
  const all = [...(s.running || []), ...(s.queue || []), ...(s.done || []), ...(s.failed || [])].sort((a, b) => a.id - b.id);
  if (!all.length) {
    wrap.innerHTML = '<div class="empty"><div class="icon">📋</div><p>Chưa có đoạn nào.<br>Vào <b>Điều khiển</b> để thêm.</p></div>';
    return;
  }
  wrap.innerHTML = `<div class="queue-list">${all.map(item => {
    const statusTxt = { waiting: 'Đang chờ', running: 'Đang xử lý...', done: '✓ Hoàn thành', failed: `✗ Lỗi: ${item.error || ''}`, stopped: 'Đã dừng' }[item.status] || item.status;
    const bar = item.status === 'running' ? `<div class="q-pbar"><div class="q-pfill" style="width:${item.progress || 0}%"></div></div>` : '';
    const numTxt = item.status === 'done' ? '✓' : item.status === 'failed' ? '✗' : item.id;
    return `<div class="q-item ${item.status}">
      <div class="q-num">${numTxt}</div>
      <div class="q-info">
        <div class="q-text">${esc(item.text)}</div>
        <div class="q-status">${statusTxt}</div>
        ${bar}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ══════════════════════════
// ██ SETTINGS
// ══════════════════════════
function loadSettings() {
  chrome.storage.local.get(['veoAudioSettings', 'veoRoot', 'veoProject'], d => {
    if (d.veoAudioSettings) settings = { ...settings, ...d.veoAudioSettings };
    if (d.veoRoot) {
      const el = document.getElementById('inp-root');
      if (el) el.value = d.veoRoot;
    }
    if (d.veoProject) {
      const el = document.getElementById('inp-project');
      if (el) el.value = d.veoProject;
    }

    const chkDate = document.getElementById('chk-date');
    if (chkDate) chkDate.checked = !!settings.organizeByDate;

    document.querySelectorAll('.toggle[data-key]').forEach(toggle => {
      const key = toggle.dataset.key;
      if (key && settings[key] !== undefined) {
        toggle.classList.toggle('on', settings[key]);
      }
    });

    updatePath();
  });
}

function saveSettings() {
  chrome.storage.local.set({
    veoAudioSettings: settings,
    veoRoot: document.getElementById('inp-root')?.value || '',
    veoProject: document.getElementById('inp-project')?.value || ''
  });
}

async function fetchProjects() {
  try {
    const res = await fetch('http://localhost:4000/api/projects');
    const data = await res.json();
    if (data.projects) {
      const list = document.getElementById('project-list');
      if (list) {
        list.innerHTML = data.projects.map(p => `<option value="${p}"></option>`).join('');
      }
    }
  } catch (e) {
    // Backend không chạy, bỏ qua
  }
}

// ══════════════════════════
// ██ HELPERS
// ══════════════════════════
function toast(msg) {
  const el = document.getElementById('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function showBanner(html, type = 'ok') {
  const el = document.getElementById('banner'); if (!el) return;
  el.innerHTML = html; el.className = `banner ${type}`; el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 8000);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
