const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rota de diagnóstico — acesse /api/health no browser para verificar ──
app.get('/api/health', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ status: 'error', message: 'ANTHROPIC_API_KEY não configurada' });

  try {
    const test = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }]
      })
    });
    const body = await test.json();
    if (test.ok) {
      res.json({ status: 'ok', model: 'claude-haiku-4-5-20251001', keyPrefix: key.slice(0, 18) + '...' });
    } else {
      res.json({ status: 'api_error', httpStatus: test.status, detail: body });
    }
  } catch(e) {
    res.json({ status: 'fetch_error', message: e.message });
  }
});

// ── Proxy para a API da Anthropic ─────────────────────────────
app.post('/api/chat', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no Railway.' });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Campo "messages" ausente ou inválido.' });
    }

    const payload = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: max_tokens || 900,
      messages
    };
    if (system) payload.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`Anthropic ${response.status}:`, JSON.stringify(data));
      return res.status(response.status).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    res.json(data);
  } catch (e) {
    console.error('Proxy error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Sessões ────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'sessions.json');

function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) {}
  return [];
}
function writeDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data), 'utf8'); } catch(e) { console.error('writeDB', e); }
}

app.get('/api/sessions', (req, res) => {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });
  res.json(readDB());
});

app.post('/api/sessions', (req, res) => {
  try {
    const sess = req.body;
    if (!sess || !sess.id) return res.status(400).json({ error: 'Invalid session' });
    let all = readDB();
    const idx = all.findIndex(s => s.id === sess.id);
    if (idx >= 0) all[idx] = sess; else all.push(sess);
    if (all.length > 500) all = all.slice(-500);
    writeDB(all);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sessions', (req, res) => {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });
  writeDB([]);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BM&A rodando na porta ${PORT}`));
