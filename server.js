'use strict';
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Configuración ───────────────────────────────────────────────────────────
const DATA_DIR   = process.env.DATA_DIR   || '/data';
const DATA_FILE  = path.join(DATA_DIR, 'quiniela_elim.json');
const ADMIN_PIN  = process.env.ADMIN_PIN  || '2211';
const COST_PER_PLAYER  = Number(process.env.COST_PER_PLAYER  || 100); // Costo por jugador
const PRIZE_POOL_FIXED = Number(process.env.PRIZE_POOL || 0);          // Override manual (si se quiere fijar)

// Bolsa dinámica: jugadores_activos × COST_PER_PLAYER
// Si se define PRIZE_POOL en variables de entorno, ese valor tiene prioridad.
function getPrizePool() {
  if (PRIZE_POOL_FIXED > 0) return PRIZE_POOL_FIXED;
  const count = Object.keys(db.players).filter(n => n !== 'Admin').length;
  return count * COST_PER_PLAYER;
}

// Bloqueo: TODOS los pronósticos se cierran aquí (antes del primer partido)
// South Africa vs Canadá: ~6pm CDMX el 28 Jun (CDMX = UTC-6 todo el año desde 2023)
const TORNEO_INICIO = new Date(process.env.TORNEO_INICIO || '2026-06-28T17:45:00-06:00');

// ─── Definición de partidos ───────────────────────────────────────────────────
// round: R32 | R16 | QF | SF | TPM (3er lugar) | F (Final)
// R32: home/away son nombres de equipos
// R16+: homeFrom/awayFrom referencian el partido fuente
// TPM usa PERDEDORES de SF → sufijo '_L' en awayFrom/homeFrom

const MATCHES_CFG = [
  // ── Dieciseisavos (Round of 32) ─────────────────────────────────────────
  { id:'R32_1',  round:'R32', num:1,  home:'Sudáfrica',        away:'Canadá',         date:'Dom 28 Jun' },
  { id:'R32_2',  round:'R32', num:2,  home:'Alemania',          away:'Paraguay',       date:'Lun 29 Jun' },
  { id:'R32_3',  round:'R32', num:3,  home:'Países Bajos',      away:'Marruecos',      date:'Lun 29 Jun' },
  { id:'R32_4',  round:'R32', num:4,  home:'Brasil',            away:'Japón',          date:'Lun 29 Jun' },
  { id:'R32_5',  round:'R32', num:5,  home:'Francia',           away:'Suecia',         date:'Mar 30 Jun' },
  { id:'R32_6',  round:'R32', num:6,  home:'Costa de Marfil',   away:'Noruega',        date:'Mar 30 Jun' },
  { id:'R32_7',  round:'R32', num:7,  home:'México',            away:'Ecuador',        date:'Mar 30 Jun' },
  { id:'R32_8',  round:'R32', num:8,  home:'Inglaterra',        away:'R.D. Congo',     date:'Mié 1 Jul'  },
  { id:'R32_9',  round:'R32', num:9,  home:'EUA',               away:'Bosnia-H.',      date:'Mié 1 Jul'  },
  { id:'R32_10', round:'R32', num:10, home:'Bélgica',           away:'Senegal',        date:'Mié 1 Jul'  },
  { id:'R32_11', round:'R32', num:11, home:'Portugal',          away:'Croacia',        date:'Jue 2 Jul'  },
  { id:'R32_12', round:'R32', num:12, home:'España',            away:'Austria',        date:'Jue 2 Jul'  },
  { id:'R32_13', round:'R32', num:13, home:'Suiza',             away:'Argelia',        date:'Jue 2 Jul'  },
  { id:'R32_14', round:'R32', num:14, home:'Argentina',         away:'Cabo Verde',     date:'Vie 3 Jul'  },
  { id:'R32_15', round:'R32', num:15, home:'Colombia',          away:'Ghana',          date:'Vie 3 Jul'  },
  { id:'R32_16', round:'R32', num:16, home:'Australia',         away:'Egipto',         date:'Vie 3 Jul'  },
  // ── Octavos (Round of 16) ────────────────────────────────────────────────
  { id:'R16_1', round:'R16', num:1, homeFrom:'R32_1',  awayFrom:'R32_2',  date:'~6 Jul'  },
  { id:'R16_2', round:'R16', num:2, homeFrom:'R32_3',  awayFrom:'R32_4',  date:'~6 Jul'  },
  { id:'R16_3', round:'R16', num:3, homeFrom:'R32_5',  awayFrom:'R32_6',  date:'~7 Jul'  },
  { id:'R16_4', round:'R16', num:4, homeFrom:'R32_7',  awayFrom:'R32_8',  date:'~7 Jul'  },
  { id:'R16_5', round:'R16', num:5, homeFrom:'R32_9',  awayFrom:'R32_10', date:'~8 Jul'  },
  { id:'R16_6', round:'R16', num:6, homeFrom:'R32_11', awayFrom:'R32_12', date:'~8 Jul'  },
  { id:'R16_7', round:'R16', num:7, homeFrom:'R32_13', awayFrom:'R32_14', date:'~9 Jul'  },
  { id:'R16_8', round:'R16', num:8, homeFrom:'R32_15', awayFrom:'R32_16', date:'~9 Jul'  },
  // ── Cuartos (Quarterfinals) ──────────────────────────────────────────────
  { id:'QF_1', round:'QF', num:1, homeFrom:'R16_1', awayFrom:'R16_2', date:'~11 Jul' },
  { id:'QF_2', round:'QF', num:2, homeFrom:'R16_3', awayFrom:'R16_4', date:'~11 Jul' },
  { id:'QF_3', round:'QF', num:3, homeFrom:'R16_5', awayFrom:'R16_6', date:'~12 Jul' },
  { id:'QF_4', round:'QF', num:4, homeFrom:'R16_7', awayFrom:'R16_8', date:'~12 Jul' },
  // ── Semis (Semifinals) ───────────────────────────────────────────────────
  { id:'SF_1', round:'SF', num:1, homeFrom:'QF_1', awayFrom:'QF_2', date:'~15 Jul' },
  { id:'SF_2', round:'SF', num:2, homeFrom:'QF_3', awayFrom:'QF_4', date:'~16 Jul' },
  // ── Tercer lugar ─────────────────────────────────────────────────────────
  { id:'TPM',  round:'TPM', num:1, homeFrom:'SF_1_L', awayFrom:'SF_2_L', date:'18 Jul' },
  // ── Final ────────────────────────────────────────────────────────────────
  { id:'F',    round:'F',   num:1, homeFrom:'SF_1',   awayFrom:'SF_2',   date:'19 Jul' },
];

const MATCHES = Object.fromEntries(MATCHES_CFG.map(m => [m.id, m]));
const ALL_IDS = MATCHES_CFG.map(m => m.id);

// ─── Persistencia ─────────────────────────────────────────────────────────────
let db = null;

function isLocked() { return Date.now() >= TORNEO_INICIO.getTime(); }

function dbLoad() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) { db = { players: {}, results: {} }; dbSave(); return; }
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!db.players) db.players = {};
    if (!db.results) db.results = {};
  } catch (e) {
    console.error('dbLoad error:', e.message);
    db = { players: {}, results: {} };
  }
}

function dbSave() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
  catch (e) { console.error('dbSave error:', e.message); }
}

function doBackup() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const dest = path.join(DATA_DIR, `backup_elim_${ts}.json`);
    fs.copyFileSync(DATA_FILE, dest);
    console.log('Backup:', dest);
  } catch (e) { console.error('Backup error:', e.message); }
}

// ─── Puntuación ──────────────────────────────────────────────────────────────
// REGLA CLAVE: la comparación es por POSICIÓN (home/away del slot del bracket),
// no por equipos. Si predijiste [2,0] y el resultado del slot es [2,0] → 2 pts,
// sin importar qué equipos llegaron a ese slot.
function scorePlayer(preds, results) {
  let pts = 0, exact = 0;
  const detail = {};
  for (const [id, actual] of Object.entries(results)) {
    const p = preds[id];
    if (!p) { detail[id] = 0; continue; }
    const [ph, pa] = p;
    const [ah, aa] = actual;
    if (ph === ah && pa === aa) {
      pts += 2; exact++;
      detail[id] = 2;
    } else if (Math.sign(ph - pa) === Math.sign(ah - aa)) {
      pts += 1;
      detail[id] = 1;
    } else {
      detail[id] = 0;
    }
  }
  return { pts, exact, detail };
}

// ─── Premios ─────────────────────────────────────────────────────────────────
// 70% 1°, 20% 2°, 10% 3° | empates reparten la bolsa combinada de sus lugares
function calcPrizes(ranking, pool) {
  const ALLOCS = [0.70, 0.20, 0.10];
  const result = ranking.map(r => ({ ...r, prize: 0 }));
  if (!pool) return result;

  let pIdx = 0; // slot de premio
  let rIdx = 0; // índice en ranking

  while (rIdx < result.length && pIdx < ALLOCS.length) {
    const { pts, exact } = result[rIdx];
    // Grupo de empatados
    const group = [];
    let i = rIdx;
    while (i < result.length && result[i].pts === pts && result[i].exact === exact) {
      group.push(i); i++;
    }
    // Slots de premio que consume este grupo
    const slots = Math.min(group.length, ALLOCS.length - pIdx);
    let money = 0;
    for (let k = 0; k < slots; k++) money += pool * ALLOCS[pIdx + k];
    const each = Math.round(money / group.length);
    group.forEach(gi => { result[gi].prize = each; });
    pIdx += slots;
    rIdx += group.length;
  }
  return result;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Endpoints ───────────────────────────────────────────────────────────────

// Definición de partidos (pública)
app.get('/api/matches', (_, res) => res.json(MATCHES_CFG));

// Estado global sin PINs
app.get('/api/state', (_, res) => {
  const players = {};
  for (const [name, d] of Object.entries(db.players)) {
    if (name === 'Admin') continue;
    players[name] = { predCount: Object.keys(d.preds || {}).length };
  }
  res.json({
    players,
    results: db.results,
    locked: isLocked(),
    prizePool: getPrizePool(),
    costPerPlayer: COST_PER_PLAYER,
    playerCount: Object.keys(db.players).filter(n => n !== 'Admin').length,
    torneoInicio: TORNEO_INICIO.toISOString(),
    totalMatches: ALL_IDS.length,
  });
});

// Login / registro automático
app.post('/api/login', (req, res) => {
  const name = String(req.body.name || '').trim();
  const pin  = String(req.body.pin  || '').trim();
  if (!name || !/^\d{4}$/.test(pin))
    return res.status(400).json({ error: 'Nombre y PIN de 4 dígitos requeridos' });

  // Admin
  if (name === 'Admin' && pin === ADMIN_PIN)
    return res.json({ ok: true, isAdmin: true, name: 'Admin', preds: {} });
  if (pin === ADMIN_PIN)
    return res.status(403).json({ error: 'PIN reservado para Admin' });

  // Jugador existente
  if (db.players[name]) {
    if (db.players[name].pin !== pin)
      return res.status(401).json({ error: 'PIN incorrecto' });
    return res.json({ ok: true, isAdmin: false, name, preds: db.players[name].preds || {} });
  }

  // Jugador nuevo
  if (isLocked())
    return res.status(403).json({ error: 'El torneo ya inició. No se aceptan nuevos jugadores.' });
  db.players[name] = { pin, preds: {} };
  dbSave();
  return res.json({ ok: true, isAdmin: false, name, preds: {}, isNew: true });
});

// Guardar pronósticos (bulk)
app.post('/api/predict', (req, res) => {
  const name  = String(req.body.name || '').trim();
  const pin   = String(req.body.pin  || '').trim();
  const preds = req.body.preds;
  if (!name || !pin || !preds) return res.status(400).json({ error: 'Datos incompletos' });
  if (isLocked()) return res.status(403).json({ error: 'Pronósticos bloqueados. El torneo ya inició.' });
  const player = db.players[name];
  if (!player || player.pin !== pin) return res.status(401).json({ error: 'Auth fallida' });

  for (const [id, s] of Object.entries(preds)) {
    if (!MATCHES[id] || !Array.isArray(s) || s.length < 2) continue;
    const h = parseInt(s[0], 10), a = parseInt(s[1], 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0 || h > 20 || a > 20) continue;
    // Si hay tercer elemento (ganador en penales): s[2] = 'home'|'away'
    player.preds[id] = (s[2] && h === a) ? [h, a, s[2]] : [h, a];
  }
  dbSave();
  res.json({ ok: true, predCount: Object.keys(player.preds).length });
});

// Capturar resultado oficial (solo admin)
app.post('/api/result', (req, res) => {
  const { pin, matchId, score, penWinner } = req.body;
  if (pin !== ADMIN_PIN) return res.status(403).json({ error: 'PIN de admin incorrecto' });
  if (!MATCHES[matchId]) return res.status(400).json({ error: 'Partido no existe' });
  if (!Array.isArray(score) || score.length < 2) return res.status(400).json({ error: 'Score inválido' });
  const h = parseInt(score[0], 10), a = parseInt(score[1], 10);
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return res.status(400).json({ error: 'Score inválido' });
  // Si empate, registrar quién ganó penales para el bracket
  db.results[matchId] = (h === a && penWinner) ? [h, a, penWinner] : [h, a];
  dbSave();
  res.json({ ok: true, matchId, score: [h, a] });
});

// Borrar resultado (admin)
app.delete('/api/result/:matchId', (req, res) => {
  const pin = req.body.pin || req.query.pin;
  if (pin !== ADMIN_PIN) return res.status(403).json({ error: 'PIN incorrecto' });
  delete db.results[req.params.matchId];
  dbSave();
  res.json({ ok: true });
});

// Borrar jugador (admin)
app.delete('/api/player/:name', (req, res) => {
  const pin = req.body.pin || req.query.pin;
  if (pin !== ADMIN_PIN) return res.status(403).json({ error: 'PIN incorrecto' });
  const name = decodeURIComponent(req.params.name);
  if (name === 'Admin') return res.status(400).json({ error: 'No puedes borrar al Admin' });
  if (!db.players[name]) return res.status(404).json({ error: 'Jugador no encontrado' });
  delete db.players[name];
  dbSave();
  console.log(`Jugador eliminado: ${name}`);
  res.json({ ok: true, deleted: name });
});

// Ranking con premios
app.get('/api/ranking', (_, res) => {
  const rows = [];
  for (const [name, d] of Object.entries(db.players)) {
    if (name === 'Admin') continue;
    const { pts, exact } = scorePlayer(d.preds || {}, db.results);
    rows.push({ name, pts, exact, predCount: Object.keys(d.preds || {}).length });
  }
  rows.sort((a, b) => b.pts - a.pts || b.exact - a.exact || a.name.localeCompare(b.name));
  rows.forEach((r, i) => r.pos = i + 1);
  const pool = getPrizePool();
  res.json({
    ranking: calcPrizes(rows, pool),
    prizePool: pool,
    costPerPlayer: COST_PER_PLAYER,
    playerCount: rows.length,
    resultsCount: Object.keys(db.results).length,
    totalMatches: ALL_IDS.length,
  });
});

// Detalle de puntaje de un jugador
app.get('/api/score/:name', (req, res) => {
  const player = db.players[req.params.name];
  if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });
  const { pts, exact, detail } = scorePlayer(player.preds || {}, db.results);
  res.json({ name: req.params.name, pts, exact, detail, preds: player.preds || {} });
});

// Health check (útil para debug en Railway)
app.get('/health', (_, res) => res.json({
  ok: true, dataFile: DATA_FILE,
  exists: fs.existsSync(DATA_FILE),
  locked: isLocked(),
  players: Object.keys(db.players).filter(n => n !== 'Admin').length,
  results: Object.keys(db.results).length,
  prizePool: getPrizePool(),
  costPerPlayer: COST_PER_PLAYER,
  torneoInicio: TORNEO_INICIO.toISOString(),
}));

// ─── Arranque ────────────────────────────────────────────────────────────────
dbLoad();
setInterval(doBackup, 6 * 60 * 60 * 1000); // backup cada 6h

app.listen(PORT, () => {
  console.log(`🏆 Quiniela Eliminatoria · Puerto ${PORT}`);
  console.log(`📁 Datos: ${DATA_FILE}`);
  console.log(`🔒 Bloqueo: ${TORNEO_INICIO.toLocaleString('es-MX')}`);
  console.log(`💰 Costo por jugador: $${COST_PER_PLAYER} | Bolsa inicial: dinámica`);
  if (DATA_DIR.includes(' ')) console.warn('⚠️  ALERTA: DATA_DIR contiene espacios:', DATA_DIR);
});
