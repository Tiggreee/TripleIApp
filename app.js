/* ─────────────────────────────────────────
   app.js — Lógica de la Arena TriIA
   (demostración con respuestas simuladas;
    reemplaza fetchModel() con llamadas reales a tu backend/proxy)
───────────────────────────────────────── */

"use strict";

// ── Estado global de la sesión ────────────────────────────────────
const state = {
  queries: 0,
  votes: { openai: 0, gemini: 0, groq: 0 },
  latencies: { openai: [], gemini: [], groq: [] },
  tokens: { openai: [], gemini: [], groq: [] },
  history: [],          // [{query, winner}]
  responses: { openai: '', gemini: '', groq: '' },
};

const MODELS = ['openai', 'gemini', 'groq'];

// ── Referencias DOM ───────────────────────────────────────────────
const sendBtn     = document.getElementById('send-btn');
const promptInput = document.getElementById('prompt-input');

// ── Botón enviar ──────────────────────────────────────────────────
sendBtn.addEventListener('click', runArena);
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runArena();
});

async function runArena() {
  const prompt = promptInput.value.trim();
  if (!prompt) { promptInput.focus(); return; }

  // Determina modelos activos
  const active = MODELS.filter(m => {
    const toggle = document.getElementById(`toggle-${m}`);
    return toggle && toggle.checked;
  });
  if (!active.length) { alert('Activa al menos un modelo.'); return; }

  state.queries++;
  sendBtn.disabled = true;
  sendBtn.textContent = 'Consultando…';

  // Limpiar paneles activos
  active.forEach(m => {
    setResponse(m, '', true);
    setMetrics(m, null, null);
  });

  // Lanzar las peticiones en paralelo
  const tasks = active.map(m => queryModel(m, prompt));
  await Promise.allSettled(tasks);

  sendBtn.disabled = false;
  sendBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
    Enviar a las 3 IAs`;

  updateStats();
  updateKPIs();
}

// ── Query individual ──────────────────────────────────────────────
async function queryModel(model, prompt) {
  const t0 = performance.now();

  try {
    // ┌──────────────────────────────────────────────────────────────
    // │ PUNTO DE INTEGRACIÓN
    // │ Reemplaza esta función por una llamada real a tu backend:
    // │
    // │  const res = await fetch('/api/query', {
    // │    method: 'POST',
    // │    headers: { 'Content-Type': 'application/json' },
    // │    body: JSON.stringify({ model, prompt })
    // │  });
    // │  const data = await res.json();
    // │  const text   = data.text;
    // │  const tokens = data.usage.total_tokens;
    // │
    // └──────────────────────────────────────────────────────────────
    const { text, tokens } = await mockFetch(model, prompt);

    const latency = Math.round(performance.now() - t0);
    state.responses[model] = text;
    state.latencies[model].push(latency);
    state.tokens[model].push(tokens);

    // Streaming simulado: escribir char a char
    await streamResponse(model, text);
    setMetrics(model, latency, tokens);

  } catch (err) {
    setResponse(model, `⚠ Error al consultar: ${err.message}`, false);
  }
}

// ── Simulación de respuesta (placeholder) ─────────────────────────
async function mockFetch(model, prompt) {
  const delay = { openai: 900, gemini: 1100, groq: 500 };
  const names  = { openai: 'GPT-4o mini', gemini: 'Gemini 1.5 Flash', groq: 'Llama 3' };
  const length = { openai: 320, gemini: 410, groq: 280 };

  await wait(delay[model] + Math.random() * 400);

  const lorem = `Esta es una respuesta de ejemplo generada por ${names[model]}.\n\nEl modelo ha procesado el prompt: «${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}».\n\nEn un entorno de producción este texto vendría directamente de la API correspondiente en tiempo real. Aquí se evaluaría coherencia, precisión factual, profundidad de análisis y capacidad para seguir instrucciones.\n\nLa latencia y el conteo de tokens reflejarán datos reales cuando conectes tu clave de API.`;

  return {
    text: lorem.slice(0, length[model]),
    tokens: Math.round(length[model] / 4),
  };
}

// ── Streaming simulado carácter a carácter ────────────────────────
async function streamResponse(model, text) {
  const el = document.getElementById(`response-${model}`);
  el.innerHTML = '';
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    if (i % 8 === 0) await wait(0); // yield al navegador
  }
}

// ── Helpers de DOM ────────────────────────────────────────────────
function setResponse(model, text, loading) {
  const el = document.getElementById(`response-${model}`);
  if (loading) {
    el.innerHTML = '<span class="placeholder-text loading-dots">Consultando</span>';
  } else {
    el.textContent = text;
  }
}

function setMetrics(model, latency, tokens) {
  const el = document.getElementById(`metrics-${model}`);
  const spans = el.querySelectorAll('.metric');
  spans[0].textContent = latency != null ? `${latency} ms` : '— ms';
  spans[1].textContent = tokens  != null ? `${tokens} tok` : '— tok';
}

// ── Votar ─────────────────────────────────────────────────────────
function vote(model) {
  state.votes[model]++;
  updateStats();
  updateKPIs();

  // Resaltar botón votado y desactivar los demás
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.classList.toggle('voted', btn.dataset.model === model);
    btn.disabled = true;
  });

  // Guardar en historial para chart
  state.history.push({ winner: model });
  drawChart();
}

function copyResponse(model) {
  const text = state.responses[model];
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

// ── Estadísticas ──────────────────────────────────────────────────
function updateStats() {
  const totalVotes = MODELS.reduce((s, m) => s + state.votes[m], 0);

  MODELS.forEach(m => {
    const v = state.votes[m];
    const rate = totalVotes ? Math.round((v / totalVotes) * 100) : 0;

    document.getElementById(`votes-${m}`).textContent = v;
    document.getElementById(`rate-${m}`).textContent  = `${rate}%`;
    document.getElementById(`bar-${m}`).style.width   = `${rate}%`;

    const lats = state.latencies[m];
    const toks = state.tokens[m];
    document.getElementById(`lat-${m}`).textContent =
      lats.length ? `${Math.round(avg(lats))} ms` : '—';
    document.getElementById(`tok-${m}`).textContent =
      toks.length ? Math.round(avg(toks)) : '—';
  });
}

function updateKPIs() {
  const totalVotes = MODELS.reduce((s, m) => s + state.votes[m], 0);
  document.getElementById('kpi-queries').textContent = state.queries;
  document.getElementById('kpi-votes').textContent   = totalVotes;

  // Leader
  const leader = MODELS.reduce((a, b) => state.votes[a] >= state.votes[b] ? a : b);
  const leaderNames = { openai: 'GPT-4o', gemini: 'Gemini', groq: 'Llama 3' };
  document.getElementById('kpi-leader').textContent =
    totalVotes ? leaderNames[leader] : '—';

  // Min latency
  const allLats = MODELS.flatMap(m => state.latencies[m]);
  document.getElementById('kpi-latency').textContent =
    allLats.length ? `${Math.min(...allLats)} ms` : '—';
}

// ── Mini chart (canvas puro) ───────────────────────────────────────
function drawChart() {
  const canvas  = document.getElementById('voteChart');
  const empty   = document.getElementById('chart-empty');
  if (!state.history.length) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const ctx    = canvas.getContext('2d');
  const W      = canvas.offsetWidth  || 800;
  const H      = canvas.offsetHeight || 200;
  canvas.width  = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  const colors  = { openai: '#10a37f', gemini: '#4285f4', groq: '#f97316' };
  const barW    = Math.max(20, Math.min(40, (W / (state.history.length + 1)) - 4));
  const maxVal  = Math.max(...MODELS.map(m => state.votes[m]), 1);

  // Grid lines
  ctx.strokeStyle = '#1f1f2e';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = H - 24 - ((H - 40) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Bars per model
  const spacing = W / (MODELS.length + 1);
  MODELS.forEach((m, i) => {
    const x = spacing * (i + 1) - barW / 2;
    const barH = ((H - 40) * state.votes[m]) / maxVal;
    const y = H - 24 - barH;

    ctx.fillStyle = colors[m];
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#8b8ba0';
    ctx.font      = '11px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(state.votes[m], x + barW / 2, y - 6);
  });

  // Labels
  const labels = { openai: 'GPT-4o', gemini: 'Gemini', groq: 'Llama 3' };
  ctx.fillStyle = '#55556a';
  ctx.font      = '11px Inter, system-ui';
  MODELS.forEach((m, i) => {
    const x = spacing * (i + 1);
    ctx.textAlign = 'center';
    ctx.fillText(labels[m], x, H - 6);
  });
}

// Redibuja el chart al cambiar tamaño de ventana
window.addEventListener('resize', drawChart);

// ── Util ──────────────────────────────────────────────────────────
const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const wait = ms => new Promise(r => setTimeout(r, ms));
