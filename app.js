/* Health Tracker — single-file vanilla JS app
   Persists to localStorage. No backend. */

const STORAGE_KEY = 'healthTracker.entries';
const FIELDS = [
  'date', 'weight', 'bg',
  'breakfast_carbs', 'breakfast_protein',
  'lunch_carbs',     'lunch_protein',
  'dinner_carbs',    'dinner_protein',
  'snacks_carbs',    'snacks_protein',
  'had_drink',
  'meds_taken',
  'water_72oz',
  'exercised', 'exercise_notes',
  'notes'
];
const COLLAPSIBLE_MEALS = ['breakfast', 'lunch', 'dinner']; // auto-collapse on save + load
const ALL_COLLAPSIBLE_MEALS = ['breakfast', 'lunch', 'dinner', 'snacks']; // click handlers + load
const COLLAPSIBLE_VITALS = [
  { id: 'weight', field: 'weight', suffix: 'lbs' },
  { id: 'bg',     field: 'bg',    suffix: 'mg/dL' },
];
const NUMERIC = new Set([
  'weight', 'bg',
  'breakfast_carbs','breakfast_protein',
  'lunch_carbs','lunch_protein',
  'dinner_carbs','dinner_protein',
  'snacks_carbs','snacks_protein',
]);

// ===== Storage =====
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}
function saveAll(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  if (ghToken) pushToGitHub(entries).catch(e => console.warn('gh push:', e));
}
function upsertEntry(entry) {
  const all = loadAll();
  const idx = all.findIndex(e => e.date === entry.date);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  saveAll(all);
  return all;
}
function deleteEntry(date) {
  const all = loadAll().filter(e => e.date !== date);
  saveAll(all);
  return all;
}

// ===== Helpers =====
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function n(v) {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}
function sumCarbs(e) {
  return n(e.breakfast_carbs) + n(e.lunch_carbs) + n(e.dinner_carbs) + n(e.snacks_carbs);
}
function sumProtein(e) {
  return n(e.breakfast_protein) + n(e.lunch_protein) + n(e.dinner_protein) + n(e.snacks_protein);
}

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ===== Theme =====
function initTheme() {
  const saved = localStorage.getItem('healthTracker.theme') || 'dark';
  applyTheme(saved);
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('healthTracker.theme', next);
  });
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  if (document.querySelector('#tab-stats.active')) renderStats();
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ===== Tab nav =====
function initTabs() {
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(name) {
  $$('.tab').forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'history') renderHistory();
  if (name === 'stats')   renderStats();
}

// ===== Entry form =====
function initForm() {
  const form = $('#entry-form');
  $('#f-date').value = todayISO();

  // pre-fill if today's entry exists
  const existing = loadAll().find(e => e.date === todayISO());
  if (existing) populateForm(existing);

  // live totals + summaries
  form.addEventListener('input', () => { updateLiveTotals(); updateAllMealSummaries(); updateAllVitalSummaries(); });
  // when user changes the date field, load existing if present
  $('#f-date').addEventListener('change', () => {
    const d = $('#f-date').value;
    const e = loadAll().find(x => x.date === d);
    if (e) populateForm(e);
    updateLiveTotals();
  });

  $('#clear-btn').addEventListener('click', () => {
    form.reset();
    $('#f-date').value = todayISO();
    ALL_COLLAPSIBLE_MEALS.forEach(m => {
      setMealCollapsed(m, false);
      document.getElementById('summary-' + m).textContent = '';
    });
    COLLAPSIBLE_VITALS.forEach(({ id }) => {
      setVitalCollapsed(id, false);
      document.getElementById('summary-' + id).textContent = '';
    });
    $('#exercise-detail').classList.remove('visible');
    updateLiveTotals();
  });

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const data = readForm();
    if (!data.date) { showToast('Please pick a date'); return; }
    upsertEntry(data);
    autoCollapseMeals(data);
    autoCollapseVitals(data);
    showToast('Saved');
    updateLiveTotals();
  });

  const exerciseCheck = $('#f-exercised');
  const exerciseDetail = $('#exercise-detail');
  function syncExerciseDetail() {
    exerciseDetail.classList.toggle('visible', exerciseCheck.checked);
  }
  exerciseCheck.addEventListener('change', syncExerciseDetail);
  syncExerciseDetail();

  updateLiveTotals();
}

function readForm() {
  const out = {};
  for (const f of FIELDS) {
    const el = document.querySelector(`[name="${f}"]`);
    if (!el) continue;
    if (el.type === 'checkbox') { out[f] = el.checked; continue; }
    const v = el.value.trim();
    if (NUMERIC.has(f)) out[f] = v === '' ? null : parseFloat(v);
    else out[f] = v;
  }
  return out;
}

function populateForm(e) {
  for (const f of FIELDS) {
    const el = document.querySelector(`[name="${f}"]`);
    if (!el) continue;
    if (el.type === 'checkbox') { el.checked = !!e[f]; continue; }
    el.value = e[f] == null ? '' : e[f];
  }
  $('#exercise-detail').classList.toggle('visible', !!e.exercised);
  autoCollapseMeals(e);
  // snacks: collapse on load only (not on save — stays open while filling out)
  const snacksHasData = e.snacks_carbs != null || e.snacks_protein != null;
  setMealCollapsed('snacks', snacksHasData);
  updateMealSummary('snacks', e);
  autoCollapseVitals(e);
}

// ===== Meal collapse =====
function setMealCollapsed(meal, collapsed) {
  const card = document.getElementById('card-' + meal);
  const body = card.querySelector('.meal-body');
  card.classList.toggle('collapsed', collapsed);
  body.style.display = collapsed ? 'none' : '';
}

function setVitalCollapsed(id, collapsed) {
  const card = document.getElementById('card-' + id);
  const body = card.querySelector('.card-body');
  card.classList.toggle('collapsed', collapsed);
  if (body) body.style.display = collapsed ? 'none' : '';
}

function initVitalCollapse() {
  COLLAPSIBLE_VITALS.forEach(({ id }) => {
    document.getElementById('card-' + id)
      .querySelector('.card-header')
      .addEventListener('click', () => {
        const card = document.getElementById('card-' + id);
        setVitalCollapsed(id, !card.classList.contains('collapsed'));
      });
  });
}

function autoCollapseVitals(entry) {
  COLLAPSIBLE_VITALS.forEach(({ id, field, suffix }) => {
    const hasData = entry[field] != null;
    setVitalCollapsed(id, hasData);
    const el = document.getElementById('summary-' + id);
    if (el) el.textContent = hasData ? `${entry[field]} ${suffix}` : '';
  });
}

function updateAllVitalSummaries() {
  const e = readForm();
  COLLAPSIBLE_VITALS.forEach(({ id, field, suffix }) => {
    const el = document.getElementById('summary-' + id);
    if (el) el.textContent = e[field] != null ? `${e[field]} ${suffix}` : '';
  });
}

function initMealCollapse() {
  ALL_COLLAPSIBLE_MEALS.forEach(meal => {
    document.getElementById('card-' + meal)
      .querySelector('.meal-header')
      .addEventListener('click', () => {
        const card = document.getElementById('card-' + meal);
        setMealCollapsed(meal, !card.classList.contains('collapsed'));
      });
  });
}

function autoCollapseMeals(entry) {
  COLLAPSIBLE_MEALS.forEach(meal => {
    const hasData = entry[meal + '_carbs'] != null || entry[meal + '_protein'] != null;
    setMealCollapsed(meal, hasData);
    updateMealSummary(meal, entry);
  });
}

function updateMealSummary(meal, entry) {
  const c = n(entry[meal + '_carbs']);
  const p = n(entry[meal + '_protein']);
  const el = document.getElementById('summary-' + meal);
  el.textContent = (c || p) ? `${c}g C / ${p}g P` : '';
}

function updateAllMealSummaries() {
  const e = readForm();
  COLLAPSIBLE_MEALS.forEach(meal => updateMealSummary(meal, e));
}

function updateLiveTotals() {
  const e = readForm();
  $('#total-carbs').textContent   = sumCarbs(e);
  $('#total-protein').textContent = sumProtein(e);
}

// ===== History =====
function renderHistory() {
  const entries = loadAll();
  const list = $('#history-list');
  if (!entries.length) {
    list.innerHTML = `<p class="empty">No entries yet — add one in the <strong>Add entry</strong> tab.</p>`;
    return;
  }
  list.innerHTML = '';
  entries.forEach(e => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-date">${formatDate(e.date)}</span>
      ${e.weight != null ? `<span class="history-stat"><strong>${e.weight}</strong> lbs</span>` : ''}
      ${e.bg != null ? `<span class="history-stat">BG <strong>${e.bg}</strong></span>` : ''}
      <span class="history-stat">C <strong>${sumCarbs(e)}</strong>g</span>
      <span class="history-stat">P <strong>${sumProtein(e)}</strong>g</span>
    `;
    item.addEventListener('click', () => toggleDetail(item, e));
    list.appendChild(item);
  });
}

function toggleDetail(itemEl, e) {
  // remove any open detail
  const open = itemEl.parentElement.querySelector('.history-detail');
  if (open) {
    if (open.dataset.date === e.date) { open.remove(); return; }
    open.remove();
  }
  const d = document.createElement('div');
  d.className = 'history-detail';
  d.dataset.date = e.date;
  d.innerHTML = `
    <div class="row"><span>Weight</span><span>${e.weight != null ? e.weight + ' lbs' : '—'}</span></div>
    <div class="row"><span>Fasting BG</span><span>${e.bg != null ? e.bg + ' mg/dL' : '—'}</span></div>
    <div class="row"><span>Breakfast</span><span>${n(e.breakfast_carbs)}g C / ${n(e.breakfast_protein)}g P</span></div>
    <div class="row"><span>Lunch</span><span>${n(e.lunch_carbs)}g C / ${n(e.lunch_protein)}g P</span></div>
    <div class="row"><span>Dinner</span><span>${n(e.dinner_carbs)}g C / ${n(e.dinner_protein)}g P</span></div>
    <div class="row"><span>Snacks</span><span>${n(e.snacks_carbs)}g C / ${n(e.snacks_protein)}g P</span></div>
    <div class="row total-row"><span><strong>Total</strong></span><span><strong>${sumCarbs(e)}g C / ${sumProtein(e)}g P</strong></span></div>
    <div class="row"><span>Had a drink</span><span>${e.had_drink ? 'Yes' : 'No'}</span></div>
    <div class="row"><span>Meds taken</span><span>${e.meds_taken ? 'Yes' : 'No'}</span></div>
    <div class="row"><span>72 oz water</span><span>${e.water_72oz ? 'Yes' : 'No'}</span></div>
    <div class="row"><span>Exercised</span><span>${e.exercised ? 'Yes' : 'No'}</span></div>
    ${e.exercise_notes ? `<div class="row" style="display:block"><span>Exercise</span><div style="margin-top:4px;color:#202124">${escapeHtml(e.exercise_notes)}</div></div>` : ''}
    ${e.notes ? `<div class="row" style="display:block"><span>Notes</span><div style="margin-top:4px;color:#202124">${escapeHtml(e.notes)}</div></div>` : ''}
    <div class="actions-row">
      <button class="btn-secondary" data-act="edit">Edit</button>
      <button class="btn-danger" data-act="del">Delete</button>
    </div>
  `;
  d.querySelector('[data-act="edit"]').addEventListener('click', ev => {
    ev.stopPropagation();
    populateForm(e);
    switchTab('entry');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Loaded into form — change values, then Save');
  });
  d.querySelector('[data-act="del"]').addEventListener('click', ev => {
    ev.stopPropagation();
    if (!confirm(`Delete entry for ${formatDate(e.date)}?`)) return;
    deleteEntry(e.date);
    renderHistory();
    showToast('Deleted');
  });
  itemEl.insertAdjacentElement('afterend', d);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ===== Stats =====
function renderStats() {
  const entries = loadAll();
  renderStatsBlock('#stats-7',  filterRecent(entries, 7));
  renderStatsBlock('#stats-30', filterRecent(entries, 30));
  drawChart('#weight-chart', entries, 'weight', '#673ab7');
  drawChart('#bg-chart', entries, 'bg', '#d93025');
}

function filterRecent(entries, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return entries.filter(e => e.date >= cutoffISO);
}

function avg(values) {
  const v = values.filter(x => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a,b)=>a+b,0) / v.length;
}
function fmt(v, dec=0) {
  return v == null ? '—' : v.toFixed(dec);
}

function renderStatsBlock(sel, entries) {
  const el = document.querySelector(sel);
  if (!entries.length) {
    el.innerHTML = `<p class="empty">No entries in this period.</p>`;
    return;
  }
  const w  = avg(entries.map(e => e.weight));
  const bg = avg(entries.map(e => e.bg));
  const c  = avg(entries.map(e => sumCarbs(e)));
  const p  = avg(entries.map(e => sumProtein(e)));
  el.innerHTML = `
    <div class="stat-tile"><span class="label">Days logged</span><span class="value">${entries.length}</span></div>
    <div class="stat-tile"><span class="label">Avg weight</span><span class="value">${fmt(w,1)}<span class="unit">lbs</span></span></div>
    <div class="stat-tile"><span class="label">Avg fasting BG</span><span class="value">${fmt(bg,0)}<span class="unit">mg/dL</span></span></div>
    <div class="stat-tile"><span class="label">Avg carbs/day</span><span class="value">${fmt(c,0)}<span class="unit">g</span></span></div>
    <div class="stat-tile"><span class="label">Avg protein/day</span><span class="value">${fmt(p,0)}<span class="unit">g</span></span></div>
  `;
}

// ===== Tiny chart (no library) =====
function drawChart(sel, entries, field, color) {
  const canvas = document.querySelector(sel);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // resize for crispness
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.parentElement.clientWidth;
  const cssH = 180;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const data = entries
    .filter(e => e[field] != null && Number.isFinite(parseFloat(e[field])))
    .map(e => ({ d: e.date, v: parseFloat(e[field]) }))
    .sort((a,b) => a.d < b.d ? -1 : 1);

  // axes/padding
  const padL = 36, padR = 12, padT = 14, padB = 22;
  const w = cssW - padL - padR;
  const h = cssH - padT - padB;

  // background
  ctx.fillStyle = cssVar('--chart-bg');
  ctx.fillRect(padL, padT, w, h);

  if (data.length < 2) {
    ctx.fillStyle = cssVar('--text-sub');
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Need at least 2 entries to draw a trend', cssW/2, cssH/2);
    return;
  }

  const ys = data.map(p => p.v);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.1;
  yMin -= pad; yMax += pad;

  // grid lines + labels (4 horizontal lines)
  ctx.strokeStyle = cssVar('--chart-grid');
  ctx.fillStyle = cssVar('--chart-label');
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = padT + (h * i / 4);
    const val = yMax - (yMax - yMin) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
    ctx.fillText(val.toFixed(field === 'weight' ? 1 : 0), padL - 4, y);
  }

  // x labels: first and last date
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(formatDate(data[0].d),     padL,        padT + h + 4);
  ctx.fillText(formatDate(data[data.length-1].d), padL + w, padT + h + 4);

  // line
  const xAt = i => padL + (data.length === 1 ? w/2 : (w * i / (data.length - 1)));
  const yAt = v => padT + h - (h * (v - yMin) / (yMax - yMin));

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((p, i) => {
    const x = xAt(i), y = yAt(p.v);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // dots
  ctx.fillStyle = color;
  data.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xAt(i), yAt(p.v), 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ===== Data import / export =====
function initData() {
  $('#export-csv').addEventListener('click', exportCSV);
  $('#export-json').addEventListener('click', exportJSON);
  $('#import-file').addEventListener('change', importFile);
  $('#wipe-data').addEventListener('click', () => {
    if (!confirm('Delete ALL entries? This cannot be undone.')) return;
    if (!confirm('Really delete everything?')) return;
    saveAll([]);
    showToast('All entries deleted');
    renderHistory();
    renderStats();
  });
}

function exportCSV() {
  const entries = loadAll();
  if (!entries.length) { showToast('Nothing to export'); return; }
  const headers = [
    'date','weight_lbs','fasting_bg_mgdl',
    'breakfast_carbs_g','breakfast_protein_g',
    'lunch_carbs_g','lunch_protein_g',
    'dinner_carbs_g','dinner_protein_g',
    'snacks_carbs_g','snacks_protein_g',
    'total_carbs_g','total_protein_g',
    'had_drink',
    'meds_taken',
    'water_72oz',
    'exercised', 'exercise_notes',
    'notes'
  ];
  const rows = entries.map(e => [
    e.date,
    e.weight ?? '',
    e.bg ?? '',
    e.breakfast_carbs ?? '',
    e.breakfast_protein ?? '',
    e.lunch_carbs ?? '',
    e.lunch_protein ?? '',
    e.dinner_carbs ?? '',
    e.dinner_protein ?? '',
    e.snacks_carbs ?? '',
    e.snacks_protein ?? '',
    sumCarbs(e),
    sumProtein(e),
    e.had_drink ? 'yes' : 'no',
    e.meds_taken ? 'yes' : 'no',
    e.water_72oz ? 'yes' : 'no',
    e.exercised ? 'yes' : 'no',
    csvEscape(e.exercise_notes || ''),
    csvEscape(e.notes || '')
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  download(csv, `health-tracker-${todayISO()}.csv`, 'text/csv');
  showToast('CSV downloaded');
}

function exportJSON() {
  const entries = loadAll();
  if (!entries.length) { showToast('Nothing to export'); return; }
  download(JSON.stringify(entries, null, 2), `health-tracker-${todayISO()}.json`, 'application/json');
  showToast('JSON downloaded');
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  return /[,"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importFile(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      let imported = [];
      if (file.name.endsWith('.json')) imported = JSON.parse(reader.result);
      else imported = parseCSV(reader.result);
      if (!Array.isArray(imported)) throw new Error('Bad format');
      mergeImport(imported);
      showToast(`Imported ${imported.length} entries`);
      renderHistory(); renderStats();
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  // simple CSV split (handles quoted commas)
  const split = line => {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ''; }
        else if (c === '"') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]).map(h => h.trim());
  const map = {
    date: 'date', weight_lbs: 'weight', fasting_bg_mgdl: 'bg',
    breakfast_carbs_g: 'breakfast_carbs', breakfast_protein_g: 'breakfast_protein',
    lunch_carbs_g: 'lunch_carbs',         lunch_protein_g: 'lunch_protein',
    dinner_carbs_g: 'dinner_carbs',       dinner_protein_g: 'dinner_protein',
    snacks_carbs_g: 'snacks_carbs',       snacks_protein_g: 'snacks_protein',
    notes: 'notes'
  };
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = split(lines[i]);
    const e = {};
    headers.forEach((h, idx) => {
      const key = map[h] || h;
      let v = cells[idx];
      if (v === undefined || v === '') return;
      if (NUMERIC.has(key)) {
        const num = parseFloat(v);
        if (Number.isFinite(num)) e[key] = num;
      } else e[key] = v;
    });
    if (e.date) out.push(e);
  }
  return out;
}

function mergeImport(imported) {
  const all = loadAll();
  const byDate = new Map(all.map(e => [e.date, e]));
  imported.forEach(e => byDate.set(e.date, e));
  const merged = [...byDate.values()].sort((a,b) => a.date < b.date ? 1 : -1);
  saveAll(merged);
}

// ===== GitHub sync =====
const GH_REPO = 'kolec94/Health_tracker';
const GH_FILE = 'Health_Tracker.xlsx';
const GH_TOKEN_KEY = 'healthTracker.ghToken';

let ghToken = null;
let ghFileSha = null;

function normalizeDate(d) {
  if (!d) return '';
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const p = new Date(s);
  return isNaN(p) ? s : new Date(p - p.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function rowsToEntries(rows) {
  return rows.map(r => ({
    date: normalizeDate(r.date),
    weight: r.weight_lbs !== '' && r.weight_lbs != null ? parseFloat(r.weight_lbs) : null,
    bg: r.fasting_bg_mgdl !== '' && r.fasting_bg_mgdl != null ? parseFloat(r.fasting_bg_mgdl) : null,
    breakfast_carbs:   r.breakfast_carbs_g   !== '' && r.breakfast_carbs_g   != null ? parseFloat(r.breakfast_carbs_g)   : null,
    breakfast_protein: r.breakfast_protein_g !== '' && r.breakfast_protein_g != null ? parseFloat(r.breakfast_protein_g) : null,
    lunch_carbs:       r.lunch_carbs_g       !== '' && r.lunch_carbs_g       != null ? parseFloat(r.lunch_carbs_g)       : null,
    lunch_protein:     r.lunch_protein_g     !== '' && r.lunch_protein_g     != null ? parseFloat(r.lunch_protein_g)     : null,
    dinner_carbs:      r.dinner_carbs_g      !== '' && r.dinner_carbs_g      != null ? parseFloat(r.dinner_carbs_g)      : null,
    dinner_protein:    r.dinner_protein_g    !== '' && r.dinner_protein_g    != null ? parseFloat(r.dinner_protein_g)    : null,
    snacks_carbs:      r.snacks_carbs_g      !== '' && r.snacks_carbs_g      != null ? parseFloat(r.snacks_carbs_g)      : null,
    snacks_protein:    r.snacks_protein_g    !== '' && r.snacks_protein_g    != null ? parseFloat(r.snacks_protein_g)    : null,
    had_drink:  r.had_drink  === 'yes' || r.had_drink  === true,
    meds_taken: r.meds_taken === 'yes' || r.meds_taken === true,
    water_72oz: r.water_72oz === 'yes' || r.water_72oz === true,
    exercised:  r.exercised  === 'yes' || r.exercised  === true,
    exercise_notes: r.exercise_notes || '',
    notes: r.notes || ''
  })).filter(e => e.date).sort((a, b) => a.date < b.date ? 1 : -1);
}

function entriesToRows(entries) {
  return entries.map(e => ({
    date:                 e.date,
    weight_lbs:           e.weight           ?? '',
    fasting_bg_mgdl:      e.bg               ?? '',
    breakfast_carbs_g:    e.breakfast_carbs   ?? '',
    breakfast_protein_g:  e.breakfast_protein ?? '',
    lunch_carbs_g:        e.lunch_carbs       ?? '',
    lunch_protein_g:      e.lunch_protein     ?? '',
    dinner_carbs_g:       e.dinner_carbs      ?? '',
    dinner_protein_g:     e.dinner_protein    ?? '',
    snacks_carbs_g:       e.snacks_carbs      ?? '',
    snacks_protein_g:     e.snacks_protein    ?? '',
    total_carbs_g:        sumCarbs(e),
    total_protein_g:      sumProtein(e),
    had_drink:            e.had_drink  ? 'yes' : 'no',
    meds_taken:           e.meds_taken ? 'yes' : 'no',
    water_72oz:           e.water_72oz ? 'yes' : 'no',
    exercised:            e.exercised  ? 'yes' : 'no',
    exercise_notes:       e.exercise_notes || '',
    notes:                e.notes || ''
  }));
}

async function ghFetch(path, opts = {}) {
  const res = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + ghToken,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || res.statusText);
  return json;
}

async function fetchXlsxFromGH() {
  const data = await ghFetch(`/repos/${GH_REPO}/contents/${GH_FILE}`);
  ghFileSha = data.sha;
  const binary = atob(data.content.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const wb = XLSX.read(bytes.buffer, { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return ws ? rowsToEntries(XLSX.utils.sheet_to_json(ws, { defval: '' })) : [];
}

async function pushToGitHub(entries) {
  const ws  = XLSX.utils.json_to_sheet(entriesToRows(entries));
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Health Tracker');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  let binary = '';
  new Uint8Array(buf).forEach(b => binary += String.fromCharCode(b));
  const data = await ghFetch(`/repos/${GH_REPO}/contents/${GH_FILE}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Health data ${todayISO()}`,
      content: btoa(binary),
      sha: ghFileSha
    })
  });
  ghFileSha = data.content.sha;
}

function setGhStatus(state) {
  const el  = $('#excel-status');
  const con = $('#excel-connect');
  const dis = $('#excel-disconnect');
  const inp = $('#gh-token-row');
  if (!el) return;
  if (state === 'ok') {
    el.textContent = '● Syncing to GitHub — every save commits to the repo';
    el.className = 'help excel-ok';
    inp.hidden = true;
    con.hidden = true;
    dis.hidden = false;
  } else {
    el.textContent = 'Not connected — data saved to browser only';
    el.className = 'help';
    inp.hidden = false;
    con.hidden = false;
    dis.hidden = true;
  }
}

async function initGitHub() {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  if (!token) { setGhStatus(null); return; }
  try {
    ghToken = token;
    const entries = await fetchXlsxFromGH();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    setGhStatus('ok');
  } catch (e) {
    ghToken = null;
    setGhStatus(null);
  }
}

function initExcelUI() {
  $('#excel-connect').addEventListener('click', async () => {
    const token = $('#gh-token-input').value.trim();
    if (!token) { showToast('Paste your GitHub token first'); return; }
    try {
      ghToken = token;
      const entries = await fetchXlsxFromGH();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      localStorage.setItem(GH_TOKEN_KEY, token);
      setGhStatus('ok');
      renderHistory();
      renderStats();
      const today = loadAll().find(e => e.date === todayISO());
      if (today) populateForm(today);
      showToast('Connected to GitHub');
    } catch (e) {
      ghToken = null;
      showToast('Failed: ' + e.message);
    }
  });

  $('#excel-disconnect').addEventListener('click', () => {
    ghToken = null;
    ghFileSha = null;
    localStorage.removeItem(GH_TOKEN_KEY);
    setGhStatus(null);
    $('#gh-token-input').value = '';
    showToast('Disconnected from GitHub');
  });
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initTabs();
  initMealCollapse();
  initVitalCollapse();
  initExcelUI();
  await initGitHub(); // reads xlsx from GitHub into localStorage cache before form loads
  initForm();
  initData();
});
