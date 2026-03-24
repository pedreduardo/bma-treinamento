const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Proxy seguro para a API da Anthropic ──────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { system, messages, max_tokens } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 900,
        system,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Proxy error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Armazenamento de sessões em memória (+ arquivo JSON) ───────
const fs           = require('fs');
const DB_FILE      = path.join(__dirname, 'sessions.json');

function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) {}
  return [];
}
function writeDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data), 'utf8'); } catch(e) { console.error('writeDB', e); }
}

// GET todas as sessões (admin)
app.get('/api/sessions', (req, res) => {
  const auth = req.headers['x-admin-token'];
  if (auth !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  res.json(readDB());
});

// POST salvar/atualizar sessão
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

// DELETE limpar todas as sessões
app.delete('/api/sessions', (req, res) => {
  const auth = req.headers['x-admin-token'];
  if (auth !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  writeDB([]);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BM&A server running on port ${PORT}`));
