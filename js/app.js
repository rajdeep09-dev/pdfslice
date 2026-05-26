// ── BATCH ENGINE ──────────────────────────────────────────────
async function startBatch(limit=null) {
  if(!S.rss2json) return toast('rss2json API key required — see Settings','error');
  if(!queue.length) return toast('Queue is empty','error');
  if(isProcessing) return;

  isProcessing = true;
  isPaused = false;
  stopRequested = false;
  batchId = batchId || 'batch_' + Date.now();
  startTime = startTime || Date.now();

  const processCount = limit || queue.length;
  const actualQueue = queue.slice(0, processCount);

  showSection('queue', document.getElementById('nav-queue'));
  log('▶ BATCH STARTED — ' + actualQueue.length + ' accounts', 'info');

  for(let i=0; i<actualQueue.length; i++) {
    if(stopRequested) break;
    while(isPaused) await sleep(500);

    const qItem = actualQueue[i];
    if(!['pending','retry'].includes(qItem.status)) continue;

    qItem.status = 'processing';
    renderLiveQueue();
    updateProgress(i, actualQueue.length);

    try {
      const account = await processAccount(qItem.handle, i);
      qItem.status = account.overall_result.toLowerCase();
      qItem.data = account;
      
      const existingIdx = results.findIndex(r=>r.handle===account.handle);
      if(existingIdx >= 0) results[existingIdx] = account;
      else results.push(account);
      
      log(`✅ @${qItem.handle} → ${account.overall_result}`, 'success');
    } catch(e) {
      qItem.status = 'error';
      log(`💀 @${qItem.handle} — ERROR: ${e.message}`, 'error');
      results.push(buildErrorAccount(qItem.handle, e.message));
    }

    renderLiveQueue();
    updateProgress(i+1, actualQueue.length);
    updateResultBadges();
    await saveSession();
    if(i < actualQueue.length-1 && !stopRequested) await sleep(S.delay * 1000);
  }

  isProcessing = false;
  if(S.autoSave && S.saveHistory && results.length > 0) await saveBatch();
  renderResults();
  renderOutreach();
  if(!stopRequested) showSection('results', document.getElementById('nav-results'));
  toast(`Batch complete!`);
}

async function processAccount(handle, index) {
  log(`   🔍 Processing @${handle}...`);
  const account = { 
    handle, display_name:handle, bio:'', followers:0, following:0,
    twitter_url:`https://x.com/${handle}`, nitter_url:'',
    fetch_status:'pending', fetch_source:'', fetch_timestamp: new Date().toISOString(),
    tweets:[], tweets_raw_count:0, tweets_filtered_count:0,
    metrics:{}, ai_analysis:{}, checks:{},
    overall_result:'FAIL', fail_reasons:[], needs_manual_review:[],
    user_notes:{status:'',notes:'',starred:false,price_offer:''},
    pdf_filename:`qualifier_${handle}_${new Date().toISOString().slice(0,10)}.pdf`,
    dm_sequence:[], calculated_price:0
  };
  
  const aiKeywords = ['ai', 'bot', 'gpt', 'llm', 'synthetic', 'automated'];
  const handleParts = handle.toLowerCase().split(/[^a-z0-9]/);
  const hasAiKeyword = handleParts.some(part => aiKeywords.includes(part));
  if(hasAiKeyword) log(`   ⚠️ AI keyword detected in handle`, 'warn');
  account.username_ai_keyword = hasAiKeyword;

  const rss = await fetchRSS(handle);
  if(!rss.success) throw new Error(rss.error);
  
  account.tweets = rss.items;
  account.tweets_raw_count = rss.items.length;
  account.fetch_source = rss.source;
  
  const prof = await fetchProfile(handle, rss.source);
  if(prof.success) Object.assign(account, prof);
  
  const views = account.tweets.map(t=>t.views||0).filter(v=>v>0);
  const avgViews = views.length ? Math.round(views.reduce((a,b)=>a+b,0)/views.length) : 0;
  const lastDate = account.tweets.length ? new Date(account.tweets[0].date) : null;
  const daysSince = lastDate ? Math.floor((Date.now()-lastDate.getTime())/(86400000)) : 999;
  
  const engRates = account.tweets.map(t=>t.engagement_rate||0);
  const avgEng = engRates.length ? engRates.reduce((a,b)=>a+b,0)/engRates.length : 0;

  account.metrics = {
    engagement_rate_avg: parseFloat(avgEng.toFixed(2)),
    avg_views: avgViews,
    days_since_last_post: daysSince,
    reach_ratio: account.followers > 0 ? parseFloat((avgViews / account.followers).toFixed(3)) : 0,
    original_content_pct: 100, repost_ratio: 0, follower_following_ratio: account.following > 0 ? parseFloat((account.followers/account.following).toFixed(1)) : 999
  };

  account.ai_analysis = await runAIAnalysis(account.bio, account.tweets.map(t=>t.text), handle);
  account.checks = runChecks(account);
  
  const checkVals = Object.values(account.checks);
  account.overall_result = checkVals.some(c=>c.result==='FAIL') ? 'FAIL' : checkVals.some(c=>c.result==='MANUAL'||c.result==='FLAG') ? 'MANUAL' : 'PASS';
  account.fail_reasons = checkVals.filter(c=>c.result==='FAIL').map(c=>c.reason).filter(Boolean);
  account.needs_manual_review = checkVals.filter(c=>c.result==='MANUAL').map(c=>c.label).filter(Boolean);
  account.calculated_price = getPriceForAccount(account.followers);

  return account;
}

function runChecks(account) {
  const m = account.metrics || {};
  const ai = account.ai_analysis || {};
  const checks = {};
  const fl = account.followers || 0;
  if(fl === 0) checks.followers = { label:'Followers', result:'MANUAL', value:null, reason:'Could not fetch follower count' };
  else if(fl < S.minFollowers || fl > S.maxFollowers) checks.followers = { label:'Followers', result:'FAIL', value:fl, reason:`${fmtNum(fl)} out of range` };
  else checks.followers = { label:'Followers', result:'PASS', value:fl };

  const eng = m.engagement_rate_avg || 0;
  if(eng < S.minEngagement) checks.engagement = { label:'Engagement Rate', result:'FAIL', value:eng, reason:`${eng.toFixed(1)}% below min` };
  else checks.engagement = { label:'Engagement Rate', result:'PASS', value:eng };

  const reach = m.reach_ratio || 0;
  if(reach < S.minReach) checks.reach = { label:'Reach Ratio', result:'FAIL', value:reach, reason:`${reach.toFixed(2)}x below min` };
  else checks.reach = { label:'Reach Ratio', result:'PASS', value:reach };

  checks.human = { label:'Human Account', result: (ai.human_confidence||0) >= S.minHuman ? 'PASS' : 'FAIL', value: `${ai.human_confidence||0}%` };
  
  return checks;
}

function buildErrorAccount(h, e) { return { handle:h, overall_result:'FAIL', fail_reasons:[e], checks:{}, metrics:{}, ai_analysis:{}, user_notes:{}, tweets:[] }; }

// ── EXPORTS ───────────────────────────────────────────────────
function exportCSV() {
  const data = results.map(a=>({ username:a.handle, followers:a.followers, engagement:a.metrics?.engagement_rate_avg, result:a.overall_result }));
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`export_${Date.now()}.csv`; a.click();
}

async function exportZIP() {
  toast('Building ZIP...');
  const zip = new JSZip();
  const pdfs = zip.folder('pdfs');
  for(const r of results) { const blob = await generateAccountPDF(r); pdfs.file(`${r.handle}.pdf`, blob); }
  const zipBlob = await zip.generateAsync({type:'blob'});
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a'); a.href=url; a.download='batch.zip'; a.click();
}

function copyPassingURLs() {
  const passing = results.filter(r=>r.overall_result==='PASS').map(r=>r.twitter_url).join('\n');
  navigator.clipboard.writeText(passing).then(()=>toast('Copied URLs ✓'));
}

function exportFullJSON() {
  const data = { settings:S, results, queue, batchId, interactions };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='full_export.json'; a.click();
}

// ── OUTREACH ──────────────────────────────────────────────────
async function generateAllDMs() {
  const passing = results.filter(r=>r.overall_result==='PASS');
  if(!passing.length) return toast('No qualified accounts','error');
  toast(`Generating DMs...`);
  for(const account of passing) { await generateDMSequence(account); }
  renderOutreach(); toast('Done!');
}

async function generateDMSequence(account) {
  const price = getPriceForAccount(account.followers);
  const dm1 = await callLLMRaw('groq', `Write a friendly hook DM to @${account.handle}.`, 300);
  const dm2 = await callLLMRaw('groq', `Write a soft pitch DM to @${account.handle}.`, 300);
  const dm3 = await callLLMRaw('groq', `Write an offer DM of $${price} to @${account.handle}.`, 300);
  account.dm_sequence = [dm1, dm2, dm3];
}

function copyAllFirstDMs() {
  const text = results.filter(r=>r.dm_sequence?.length).map(a=>`@${a.handle}:\n${a.dm_sequence[0]}\n---`).join('\n');
  navigator.clipboard.writeText(text).then(()=>toast('Copied all ✓'));
}

async function logInteraction(handle, dmText) {
  const interaction = { id:'int_'+Date.now(), handle, dmText, timestamp:new Date().toISOString() };
  interactions.unshift(interaction);
  await saveInteractionDB(interaction);
  renderInteractions();
}

// ── PDF ───────────────────────────────────────────────────────
async function generateAccountPDF(account) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text(`Report for @${account.handle}`, 10, 10);
  doc.text(`Followers: ${fmtNum(account.followers)}`, 10, 20);
  doc.text(`Result: ${account.overall_result}`, 10, 30);
  return doc.output('blob');
}

async function downloadAccountPDF(handle) {
  const a = results.find(r=>r.handle===handle);
  const blob = await generateAccountPDF(a);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href=url; link.download=`${handle}.pdf`; link.click();
}

// ── DATA PERSISTENCE ──────────────────────────────────────────
function loadSettings() { 
  try { 
    const saved = localStorage.getItem('tq_settings_v4');
    S = Object.assign({}, DEFAULTS, saved ? JSON.parse(saved) : {}); 
  } catch(e){ S = Object.assign({}, DEFAULTS); } 
}
function saveSettings() { localStorage.setItem('tq_settings_v4', JSON.stringify(S)); }
function saveSetting(k, v) { if(typeof v === 'string') v = v.trim(); S[k] = v; saveSettings(); if(k==='darkMode') applyTheme(); }

async function saveSession() { await saveSessionDB({ queue, results, batchId, startTime, timestamp: Date.now() }); }
async function restoreSession() {
  const saved = await loadSessionDB();
  if(saved && (Date.now() - saved.timestamp < 24 * 3600 * 1000)) {
    queue = saved.queue || []; results = saved.results || []; batchId = saved.batchId; startTime = saved.startTime;
    renderQueuePreview(); renderResults(); updateResultBadges();
  }
}
async function saveBatch() { await saveBatchDB({ batch_id: batchId, created_at: new Date().toISOString(), accounts: results }); renderHistory(); }
async function loadBatches() { return await loadBatchesDB(); }
async function loadBatch(id) {
  const all = await loadBatches();
  const b = all.find(x=>x.batch_id===id);
  if(b) { results=b.accounts; batchId=b.batch_id; renderResults(); renderOutreach(); showSection('results'); }
}

// ── CONTROL ───────────────────────────────────────────────────
function pauseBatch() { isPaused = !isPaused; log(isPaused?'⏸ Paused':'▶ Resumed'); }
function stopBatch() { if(confirm('Stop?')) { stopRequested = true; isProcessing = false; } }

// ── ORCHESTRATION ─────────────────────────────────────────────
function addToQueue(text) {
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  lines.forEach(l => {
    const p = normalizeHandle(l);
    if(p.handle && !queue.find(q=>q.handle===p.handle)) queue.push({ handle: p.handle, displayHandle: p.display, status:'pending' });
  });
  renderQueuePreview(); updateQueueBadge();
}
function removeFromQueue(h) { queue = queue.filter(q=>q.handle!==h); renderQueuePreview(); updateQueueBadge(); }
function clearQueue() { queue = []; renderQueuePreview(); updateQueueBadge(); }
function removeFromLiveQueue(h) { const item = queue.find(q=>q.handle===h); if(item) { item.status = 'skip'; renderLiveQueue(); } }
function updateQueueBadge() { const b = document.getElementById('queueBadge'); if(b) { b.textContent=queue.length; b.style.display=queue.length?'':'none'; } }
async function clearAllHistory() { if(confirm('Clear all?')) { await clearBatchesDB(); renderHistory(); } }

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  try { await initDB(); loadSettings(); await restoreSession(); applyTheme(); renderHistory(); checkOnline(); } catch (e) {}
  window.addEventListener('online', checkOnline); window.addEventListener('offline', checkOnline);
}
function checkOnline() { const b = document.getElementById('offlineBanner'); if(b) b.style.display = navigator.onLine ? 'none' : 'block'; }

document.addEventListener('DOMContentLoaded', init);
