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
  'exercised', 'exercise_notes',
  'notes'
];
const COLLAPSIBLE_MEALS = ['breakfast', 'lunch', 'dinner'];
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
  form.addEventListener('input', () => { updateLiveTotals(); updateAllMealSummaries(); });
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
    COLLAPSIBLE_MEALS.forEach(m => {
      document.getElementById('card-' + m).classList.remove('collapsed');
      document.getElementById('summary-' + m).textContent = '';
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
}

// ===== Meal collapse =====
function initMealCollapse() {
  COLLAPSIBLE_MEALS.forEach(meal => {
    document.getElementById('card-' + meal)
      .querySelector('.meal-header')
      .addEventListener('click', () => {
        document.getElementById('card-' + meal).classList.toggle('collapsed');
      });
  });
}

function autoCollapseMeals(entry) {
  COLLAPSIBLE_MEALS.forEach(meal => {
    const hasData = entry[meal + '_carbs'] != null || entry[meal + '_protein'] != null;
    document.getElementById('card-' + meal).classList.toggle('collapsed', hasData);
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
    <div class="row"><strong><span>Total</span><span>${sumCarbs(e)}g C / ${sumProtein(e)}g P</span></strong></div>
    <div class="row"><span>Had a drink</span><span>${e.had_drink ? 'Yes' : 'No'}</span></div>
    <div class="row"><span>Meds taken</span><span>${e.meds_taken ? 'Yes' : 'No'}</span></div>
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
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(padL, padT, w, h);

  if (data.length < 2) {
    ctx.fillStyle = '#9aa0a6';
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
  ctx.strokeStyle = '#e0e0e0';
  ctx.fillStyle = '#5f6368';
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

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initMealCollapse();
  initForm();
  initData();
});
