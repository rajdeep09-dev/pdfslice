// ── UI RENDERING & HELPERS ────────────────────────────────────
function getDoc() {
  const frame = document.getElementById('app-frame');
  return (frame && frame.contentDocument) ? frame.contentDocument : document;
}

function showSection(name, btn) {
  if (typeof loadPage === 'function') {
    loadPage(name, btn);
  }
}

function toast(msg, type='') {
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(()=>el.classList.remove('show'), 2500);
}

function log(msg, type='info') {
  const doc = getDoc();
  const box = doc.getElementById('logBox');
  if(!box) {
     // If logbox not in iframe, try parent (fallback for direct use)
     const pBox = document.getElementById('logBox');
     if(!pBox) return;
     const line = document.createElement('div');
     line.className = `log-line ${type}`;
     line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
     pBox.appendChild(line);
     pBox.scrollTop = pBox.scrollHeight;
     return;
  }
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  while(box.children.length > 200) box.removeChild(box.firstChild);
}

function clearLog() { 
  const doc = getDoc();
  const b=doc.getElementById('logBox'); 
  if(b) b.innerHTML=''; 
}

function updateProgress(done, total) {
  const doc = getDoc();
  const fill = doc.getElementById('progressFill');
  const pctEl = doc.getElementById('progressPct');
  const label = doc.getElementById('progressLabel');
  const stats = doc.getElementById('progressStats');
  const eta = doc.getElementById('etaText');

  const pct = Math.round(done/total*100);
  if(fill) fill.style.width = pct+'%';
  if(pctEl) pctEl.textContent = pct+'%';
  if(label) label.innerHTML = `Processing account <strong>${done}</strong> of <strong>${total}</strong>`;

  const elapsed = Date.now() - (startTime || Date.now());
  if(eta) {
    if(done > 0 && done < total) eta.innerHTML = `ETA: <strong>${fmtDuration((elapsed/done)*(total-done))}</strong>`;
    else if(done === total) eta.innerHTML = `Done in <strong>${fmtDuration(elapsed)}</strong>`;
  }

  const pass = results.filter(r=>r.overall_result==='PASS').length;
  const fail = results.filter(r=>r.overall_result==='FAIL').length;
  if(stats) stats.textContent = `✅ ${pass} passed · ❌ ${fail} failed`;
}

function updateResultBadges() {
  const pass = results.filter(r=>r.overall_result==='PASS').length;
  const pb = document.getElementById('passBadge');
  if(pb) { if(pass > 0) { pb.textContent=pass; pb.style.display=''; } else pb.style.display='none'; }
}

function renderQueuePreview() {
  const doc = getDoc();
  const preview = doc.getElementById('queuePreview');
  const list = doc.getElementById('queueList');
  if(!preview || !list) return;
  if(!queue.length) { preview.style.display='none'; return; }
  preview.style.display='';
  const count = doc.getElementById('queueCount');
  if(count) count.textContent = queue.length;
  const eta = doc.getElementById('queueEta');
  if(eta) eta.innerHTML = `<strong>${queue.length}</strong> accounts · ETA ~${Math.ceil(queue.length * (S.delay + 15) / 60)} min`;
  
  list.innerHTML = queue.map(q => `
    <div class="queue-row" id="qr_${q.handle}">
      <div class="queue-handle"><span>@</span>${escHtml(q.displayHandle || q.handle)}</div>
      <span class="status status-pending">⏳ Pending</span>
      <button class="btn btn-danger btn-xs" onclick="parent.removeFromQueue('${q.handle}')">🗑</button>
    </div>`).join('');
}

function renderLiveQueue() {
  const doc = getDoc();
  const list = doc.getElementById('liveQueueList');
  if(!list) return;
  list.innerHTML = queue.map(q => {
    const statusMap = {pending:'⏳ Pending',processing:'🔄 Fetching',pass:'✅ PASS',fail:'❌ FAIL',manual:'⚠️ MANUAL',flagged:'🚩 FLAGGED',error:'💀 Error',retry:'🔁 Retry'};
    const statusClass = {pending:'status-pending',processing:'status-processing',pass:'status-pass',fail:'status-fail',manual:'status-manual',flagged:'status-flagged',error:'status-error',retry:'status-pending'}[q.status] || 'status-pending';
    return `<div class="queue-row ${q.status==='processing'?'processing':q.status}">
      <div class="queue-handle"><span>@</span>${escHtml(q.displayHandle || q.handle)}</div>
      ${q.data?.followers ? `<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${fmtNum(q.data.followers)}</span>` : ''}
      <span class="status ${statusClass}">${statusMap[q.status]||q.status}</span>
      ${['pending','retry'].includes(q.status) ? `<button class="btn btn-danger btn-xs" onclick="parent.removeFromLiveQueue('${escHtml(q.handle)}')">✕</button>` : ''}
    </div>`;
  }).join('');
}

function renderResults() {
  const doc = getDoc();
  const list = doc.getElementById('resultsList');
  if(!list) return;
  const empty = doc.getElementById('resultsEmpty');
  const stats = doc.getElementById('statsBar');
  const filter = doc.getElementById('filterBar');
  if(!results.length) {
    if(empty) empty.style.display=''; if(stats) stats.style.display='none'; if(filter) filter.style.display='none';
    return;
  }
  if(empty) empty.style.display='none'; if(stats) stats.style.display='grid'; if(filter) filter.style.display='flex';
  
  const st = doc.getElementById('statTotal'); if(st) st.textContent = results.length;
  const sp = doc.getElementById('statPass'); if(sp) sp.textContent = results.filter(r=>r.overall_result==='PASS').length;
  const sf = doc.getElementById('statFail'); if(sf) sf.textContent = results.filter(r=>r.overall_result==='FAIL').length;
  const sm = doc.getElementById('statManual'); if(sm) sm.textContent = results.filter(r=>['MANUAL','FLAGGED'].includes(r.overall_result)).length;
  
  filterResults(currentFilter);
}

function filterResults(filter, btn) {
  const doc = getDoc();
  currentFilter = filter;
  doc.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  const filtered = filter==='all'?results:results.filter(r=>r.overall_result.toLowerCase()===filter);
  const container = doc.getElementById('resultsList');
  if(!container) return;
  let div = doc.getElementById('accountCards');
  if(!div) { div=doc.createElement('div'); div.id='accountCards'; container.appendChild(div); }
  div.innerHTML = filtered.length ? filtered.map(a => renderAccountCard(a)).join('') : '<div class="empty">No accounts</div>';
}

function renderAccountCard(a) {
  const resultClass = {PASS:'status-pass',FAIL:'status-fail',MANUAL:'status-manual',FLAGGED:'status-flagged'}[a.overall_result]||'';
  return `<div class="acct-card ${a.overall_result.toLowerCase()}" id="card_${escHtml(a.handle)}">
    <div class="acct-header" onclick="parent.toggleCard('${escHtml(a.handle)}')">
      <div class="acct-avatar">${a.profile_image_url?`<img src="${escHtml(a.profile_image_url)}">`:a.handle[0].toUpperCase()}</div>
      <div class="acct-info">
        <div class="acct-name">${escHtml(a.display_name||a.handle)}</div>
        <div class="acct-handle">@${escHtml(a.handle)}</div>
        <div class="acct-stats">
          <div class="acct-stat"><strong>${fmtNum(a.followers)}</strong> followers</div>
          ${a.metrics?.engagement_rate_avg?`<div class="acct-stat"><strong>${a.metrics.engagement_rate_avg}%</strong> eng</div>`:''}
        </div>
      </div>
      <div class="acct-result-badge">
        <span class="status ${resultClass}">${a.overall_result}</span>
      </div>
    </div>
    <div class="acct-body" id="body_${escHtml(a.handle)}" style="display:none">
       <div class="checks-grid">${Object.entries(a.checks||{}).map(([k,c])=>`<div class="check-item ${c.result.toLowerCase()}"><div class="check-label">${c.label}</div><div class="check-value">${c.result==='PASS'?'✓':'✗'} ${c.value||'—'}</div></div>`).join('')}</div>
       <div style="margin-top:10px;font-size:11px;color:var(--text2)">${(a.fail_reasons||[]).join(', ')}</div>
    </div>
  </div>`;
}

function toggleCard(h) { 
  const doc = getDoc();
  const b=doc.getElementById('body_'+h); 
  if(b) b.style.display=b.style.display==='none'?'':'none'; 
}

function renderOutreach() {
  const doc = getDoc();
  const passing = results.filter(r=>r.overall_result==='PASS');
  const list = doc.getElementById('outreachList');
  if(!list) return;
  list.innerHTML = passing.map(a => `<div class="card" style="border-left:3px solid var(--purple);"><div style="display:flex;justify-content:space-between;"><div><strong>${escHtml(a.handle)}</strong></div><button class="btn btn-purple btn-sm" onclick="parent.openOutreachModal('${escHtml(a.handle)}')">💬 Compose</button></div></div>`).join('');
}

async function renderHistory() {
  const doc = getDoc();
  const batches = await loadBatches();
  const list = doc.getElementById('historyList');
  if(!list) return;
  list.innerHTML = batches.map(b => `<div class="batch-row" onclick="parent.loadBatch('${b.batch_id}')">
    <div class="batch-meta">
      <div class="batch-id">📦 ${escHtml(b.batch_id)}</div>
      <div class="batch-date">${fmtRelDate(b.created_at)}</div>
    </div>
    <div class="batch-stats"><span style="color:var(--green)">✅ ${b.pass_count}</span> · <span style="color:var(--red)">❌ ${b.fail_count}</span></div>
  </div>`).join('');
}

function applyTheme() {
  const root = document.documentElement.style;
  if(!S.darkMode) {
    root.setProperty('--bg','#f7f9fc'); root.setProperty('--bg2','#eef2f8'); root.setProperty('--bg3','#e5eaf2');
    root.setProperty('--card','#ffffff'); root.setProperty('--text','#0f1419'); root.setProperty('--text2','#536471');
    root.setProperty('--border','#cfd9de'); root.setProperty('--border2','#b9cad5');
    document.getElementById('themeBtn').textContent='☀️';
  } else {
    root.setProperty('--bg','#080b12'); root.setProperty('--bg2','#0d1118'); root.setProperty('--bg3','#12161f');
    root.setProperty('--card','#131822'); root.setProperty('--text','#e7edf5'); root.setProperty('--text2','#8896aa');
    root.setProperty('--border','#1e2738'); root.setProperty('--border2','#263045');
    document.getElementById('themeBtn').textContent='🌙';
  }
}

function toggleTheme() { S.darkMode=!S.darkMode; saveSettings(); applyTheme(); }
function openSettings() { document.getElementById('settingsModal').classList.add('open'); loadSettingsUI(); }
function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }
function switchSettingsTab(n, b) { document.querySelectorAll('.stab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); document.querySelectorAll('.stab-content').forEach(x=>x.classList.remove('active')); document.getElementById('stab-'+n).classList.add('active'); }

function loadSettingsUI() {
  const ids = ['rss2json','nvidia','groq','gemini','corsProxy'];
  ids.forEach(id => { const el=document.getElementById('set-'+id); if(el) el.value = S[id]||''; });
}
