const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1979';

// Render provides DATABASE_URL automatically once you link a Postgres DB.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guesses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      guess INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function normalizeKey(name, surname) {
  return (name.trim() + '_' + surname.trim()).toLowerCase();
}

// ---------- PUBLIC FORM PAGE ----------
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Угадай сколько шариков</title>
<style>
  body{ font-family: Arial, sans-serif; max-width:420px; margin:40px auto; padding:0 16px; color:#222; }
  h1{ font-size:22px; }
  label{ display:block; margin:14px 0 4px; font-weight:bold; font-size:14px; }
  input{ width:100%; padding:10px; font-size:16px; box-sizing:border-box; border:1px solid #ccc; border-radius:6px; }
  button{ margin-top:18px; width:100%; padding:12px; font-size:16px; background:#2e7d32; color:#fff; border:none; border-radius:6px; cursor:pointer; }
  button:disabled{ opacity:.6; }
  #msg{ margin-top:14px; font-size:14px; }
  #msg.err{ color:#c62828; }

  #success{
    display:none;
    text-align:center;
    padding:30px 10px;
    animation: fadeIn .35s ease;
  }
  @keyframes fadeIn{
    from{ opacity:0; transform:translateY(8px); }
    to{ opacity:1; transform:translateY(0); }
  }
  .checkmark{
    width:72px; height:72px;
    border-radius:50%;
    background:#2e7d32;
    display:flex; align-items:center; justify-content:center;
    margin:0 auto 20px;
  }
  .checkmark svg{ width:38px; height:38px; }
  #success h2{ font-size:20px; margin:0 0 8px; }
  #success .sub{ color:#555; font-size:15px; margin:0 0 22px; }
  .receipt{
    background:#f4f4f4;
    border-radius:10px;
    padding:16px;
    text-align:left;
    font-size:14px;
  }
  .receipt div{ display:flex; justify-content:space-between; padding:4px 0; }
  .receipt div span:first-child{ color:#777; }
  .receipt div span:last-child{ font-weight:bold; }
</style>
</head>
<body>
  <div id="formScreen">
    <h1>Сколько шариков в колбе?</h1>
    <p>Посмотрите на колбу и оставьте своё предположение.</p>

    <form id="f">
      <label>Имя</label>
      <input type="text" id="name" required>
      <label>Фамилия</label>
      <input type="text" id="surname" required>
      <label>Ваше предположение (число)</label>
      <input type="number" id="guess" min="0" required>
      <button type="submit" id="btn">Отправить ответ</button>
      <div id="msg"></div>
    </form>
  </div>

  <div id="success">
    <div class="checkmark">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h2>Ответ принят! ☀️</h2>
    <p class="sub">Спасибо за участие, солнышко!</p>
    <div class="receipt">
      <div><span>Участник</span><span id="rName"></span></div>
      <div><span>Ваш ответ</span><span id="rGuess"></span></div>
    </div>
  </div>

<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn');
  const msg = document.getElementById('msg');
  msg.className = ''; msg.textContent = '';
  btn.disabled = true; btn.textContent = 'Отправляем...';

  const nameVal = document.getElementById('name').value.trim();
  const surnameVal = document.getElementById('surname').value.trim();
  const guessVal = parseInt(document.getElementById('guess').value, 10);

  const body = { name: nameVal, surname: surnameVal, guess: guessVal };

  try {
    const r = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (r.ok) {
      document.getElementById('rName').textContent = nameVal + ' ' + surnameVal;
      document.getElementById('rGuess').textContent = guessVal;
      document.getElementById('formScreen').style.display = 'none';
      document.getElementById('success').style.display = 'block';
    } else {
      msg.className = 'err';
      msg.textContent = data.error || 'Ошибка отправки.';
    }
  } catch (err) {
    msg.className = 'err';
    msg.textContent = 'Ошибка сети, попробуйте ещё раз.';
  } finally {
    btn.disabled = false; btn.textContent = 'Отправить ответ';
  }
});
</script>
</body>
</html>`);
});

// ---------- SUBMIT ----------
app.post('/submit', async (req, res) => {
  try {
    const { name, surname, guess } = req.body;
    if (!name || !surname || typeof name !== 'string' || typeof surname !== 'string') {
      return res.status(400).json({ error: 'Укажите имя и фамилию.' });
    }
    const guessNum = parseInt(guess, 10);
    if (isNaN(guessNum) || guessNum < 0) {
      return res.status(400).json({ error: 'Введите корректное число.' });
    }
    const key = normalizeKey(name, surname);

    await pool.query(
      'INSERT INTO guesses (name, surname, name_key, guess) VALUES ($1, $2, $3, $4)',
      [name.trim(), surname.trim(), key, guessNum]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'Вы уже отправили ответ.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

// ---------- ADMIN PAGE (password checked client-side against server) ----------
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Админ — Угадай сколько шариков</title>
<style>
  body{ font-family: Arial, sans-serif; max-width:640px; margin:30px auto; padding:0 16px; color:#222; }
  h1{ font-size:20px; }
  input{ padding:9px; font-size:15px; border:1px solid #ccc; border-radius:6px; }
  button{ padding:9px 14px; font-size:15px; background:#2e7d32; color:#fff; border:none; border-radius:6px; cursor:pointer; }
  table{ width:100%; border-collapse:collapse; margin-top:14px; font-size:14px; }
  th, td{ text-align:left; padding:7px 6px; border-bottom:1px solid #ddd; }
  .stats{ display:flex; gap:10px; margin-top:16px; }
  .stat{ flex:1; background:#f4f4f4; border-radius:8px; padding:10px; text-align:center; }
  .stat b{ display:block; font-size:20px; }
  #pinBox{ margin-bottom:20px; }
  #panel{ display:none; }
  #err{ color:#c62828; font-size:14px; }
  .row{ display:flex; gap:10px; align-items:center; margin:10px 0; }
</style>
</head>
<body>
  <div id="pinBox">
    <h1>Вход для организатора</h1>
    <div class="row">
      <input type="password" id="pin" placeholder="Код доступа">
      <button onclick="login()">Войти</button>
    </div>
    <div id="err"></div>
  </div>

  <div id="panel">
    <h1>Все ответы</h1>
    <div class="row">
      <label>Правильный ответ:</label>
      <input type="number" id="answer" style="width:120px">
      <button onclick="saveAnswer()">Сохранить</button>
      <button onclick="load()">↻ Обновить</button>
    </div>
    <div id="answerMsg"></div>

    <div class="stats">
      <div class="stat"><b id="statCount">0</b>Ответов</div>
      <div class="stat"><b id="statAvg">–</b>Среднее</div>
      <div class="stat"><b id="statMed">–</b>Медиана</div>
    </div>

    <div id="tableWrap">Загрузка…</div>
  </div>

<script>
let PIN = '';

async function login() {
  PIN = document.getElementById('pin').value;
  const r = await fetch('/api/data?pin=' + encodeURIComponent(PIN));
  if (r.status === 401) {
    document.getElementById('err').textContent = 'Неверный код.';
    return;
  }
  document.getElementById('pinBox').style.display = 'none';
  document.getElementById('panel').style.display = 'block';
  load();
}

async function load() {
  const r = await fetch('/api/data?pin=' + encodeURIComponent(PIN));
  const data = await r.json();
  document.getElementById('statCount').textContent = data.count;
  document.getElementById('statAvg').textContent = data.avg ?? '–';
  document.getElementById('statMed').textContent = data.median ?? '–';
  if (data.correctAnswer !== null) {
    document.getElementById('answer').value = data.correctAnswer;
  }

  const wrap = document.getElementById('tableWrap');
  if (!data.list.length) {
    wrap.innerHTML = '<p>Пока нет ни одного ответа.</p>';
    return;
  }
  const hasAnswer = data.correctAnswer !== null;
  let html = '<table><tr>';
  if (hasAnswer) html += '<th>Место</th>';
  html += '<th>Имя</th><th>Фамилия</th><th>Ответ</th>';
  if (hasAnswer) html += '<th>Разница</th>';
  html += '</tr>';
  data.list.forEach((g, i) => {
    html += '<tr>';
    if (hasAnswer) html += '<td>' + (i+1) + '</td>';
    html += '<td>' + escapeHtml(g.name) + '</td><td>' + escapeHtml(g.surname) + '</td><td>' + g.guess + '</td>';
    if (hasAnswer) html += '<td>' + g.diff + '</td>';
    html += '</tr>';
  });
  html += '</table>';
  wrap.innerHTML = html;
}

async function saveAnswer() {
  const val = parseInt(document.getElementById('answer').value, 10);
  const msg = document.getElementById('answerMsg');
  if (isNaN(val) || val < 0) {
    msg.textContent = 'Введите корректное число.';
    return;
  }
  const r = await fetch('/api/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: PIN, answer: val })
  });
  if (r.ok) {
    msg.textContent = 'Сохранено.';
    load();
  } else {
    msg.textContent = 'Не удалось сохранить.';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
</script>
</body>
</html>`);
});

// ---------- ADMIN API ----------
app.get('/api/data', async (req, res) => {
  if (req.query.pin !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный код.' });
  }
  try {
    const answerRow = await pool.query(`SELECT value FROM settings WHERE key = 'correct_answer'`);
    const correctAnswer = answerRow.rows.length ? parseInt(answerRow.rows[0].value, 10) : null;

    const guessesRes = await pool.query('SELECT name, surname, guess, created_at FROM guesses');
    let list = guessesRes.rows;

    const count = list.length;
    let avg = null, median = null;
    if (count) {
      const nums = list.map(g => g.guess).sort((a, b) => a - b);
      avg = Math.round(nums.reduce((a, b) => a + b, 0) / count);
      const mid = Math.floor(count / 2);
      median = count % 2 === 0 ? Math.round((nums[mid - 1] + nums[mid]) / 2) : nums[mid];
    }

    if (correctAnswer !== null) {
      list = list.map(g => ({ ...g, diff: Math.abs(g.guess - correctAnswer) }))
                 .sort((a, b) => a.diff - b.diff);
    } else {
      list = list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    res.json({ count, avg, median, correctAnswer, list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

app.post('/api/answer', async (req, res) => {
  if (req.body.pin !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный код.' });
  }
  const answer = parseInt(req.body.answer, 10);
  if (isNaN(answer) || answer < 0) {
    return res.status(400).json({ error: 'Некорректное число.' });
  }
  try {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('correct_answer', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(answer)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log('Server running on port ' + PORT));
  })
  .catch(err => {
    console.error('Failed to init DB:', err);
    process.exit(1);
  });

