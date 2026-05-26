
// ═══════════════════════════════════════════════════════════════
// F12X v3.0 — HUMAN ACCOUNT QUALIFIER + OUTREACH ENGINE
// IndexedDB storage, Gemini API, DM sequences, Offer tiers, JSON portability
// ═══════════════════════════════════════════════════════════════

const DEFAULTS = {
  rss2json:'', nvidia:'', groq:'', gemini:'', hf:'', scrapingdog:'',
  nvidiaModel:'deepseek-ai/deepseek-v4-flash',
  nvidiaCustomModel:'',
  groqModel:'llama-3.3-70b-versatile',
  geminiModel:'gemini-2.0-flash',
  maxTokens:400,
  nitterInstances:['nitter.d420.de','xcancel.com','nitter.net','nitter.privacyredirect.com','nitter.kareem.one','nitter.tiekoetter.com'],
  autoSkipNitter:true,
  minFollowers:5000, maxFollowers:75000,
  minEngagement:3.0, minReach:0.70,
  requireCheckmark:true, minNiche:7.0, minEnglish:80,
  maxDays:30, minOriginal:50, maxRatio:5.0,
  minHuman:70, maxSponsored:60, maxRepost:80,
  maxBudget:75,
  postCount:10, excludeRT:true, excludeReplies:true,
  excludeOutliers:true, delay:5, retries:3, timeout:30,
  company:'', logoBase64:'', pdfIncTweets:true, pdfIncCharts:true, pdfIncHuman:true, pdfFormat:'zip',
  csvExport:'pass', csvFailReasons:true, csvAiScores:true, csvHumanScores:true, csvPrice:true, csvSep:',',
  saveHistory:true, maxBatches:50, notify:true, debug:true, autoSave:true,
  darkMode:true,
  promptAnalysis:'',
  promptDM1:'',
  promptDM2:'',
  promptDM3:''
};

const DEFAULT_OFFERS = [
  {
    id:'default_affiliate',
    name:'50% Commission Deal',
    description:'Affiliate partnership with 50% recurring commission on all conversions',
    commissionPct:50,
    isDefault:true
  }
];

const DEFAULT_TIERS = [
  { minFollowers:5000, maxFollowers:15000, basePrice:25 },
  { minFollowers:15000, maxFollowers:35000, basePrice:50 },
  { minFollowers:35000, maxFollowers:75000, basePrice:75 },
  { minFollowers:75000, maxFollowers:100000, basePrice:100 }
];

let S = {};
let offers = [];
let tiers = [];
let queue = [];
let results = [];
let interactions = [];
let isProcessing = false;
let isPaused = false;
let stopRequested = false;
let batchId = '';
let startTime = null;
let currentFilter = 'all';
let phase1Mode = false;
let phase1Complete = false;
let db = null;

const DB_NAME = 'F12XDB_v3';
const DB_VERSION = 1;

// ── INDEXEDDB ─────────────────────────────────────────────────
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => { console.error('IndexedDB error', request.error); reject(request.error); };
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if(!database.objectStoreNames.contains('batches')) database.createObjectStore('batches', { keyPath: 'batch_id' });
      if(!database.objectStoreNames.contains('interactions')) database.createObjectStore('interactions', { keyPath: 'id', autoIncrement: true });
    };
  });
}

async function saveBatchDB(batchData) {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    const req = store.put(batchData);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadBatchesDB() {
  if(!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readonly');
    const store = tx.objectStore('batches');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteBatchDB(batchId) {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    const req = store.delete(batchId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearBatchesDB() {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function saveInteractionDB(interaction) {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('interactions', 'readwrite');
    const store = tx.objectStore('interactions');
    const req = store.add(interaction);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadInteractionsDB() {
  if(!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction('interactions', 'readonly');
    const store = tx.objectStore('interactions');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearInteractionsDB() {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('interactions', 'readwrite');
    const store = tx.objectStore('interactions');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  try { const backup = JSON.parse(localStorage.getItem('f12x_session_backup')); if(backup && backup.results) { queue = backup.queue; results = backup.results; batchId = backup.batchId; renderQueuePreview(); renderResults(); } } catch(e){}
  try {
    await initDB();
    log('IndexedDB initialized ✓', 'success');
  } catch(e) {
    log('IndexedDB failed — falling back to localStorage for history', 'warn');
  }
  loadSettings();
  loadOffers();
  loadTiers();
  loadSettingsUI();
  loadNitterList();
  updateStorageInfo().catch(()=>{}); // async now
  renderHistory();
  renderInteractions();
  checkOnline();
  window.addEventListener('online',  () => { checkOnline(); toast('Back online ✓','success'); });
  window.addEventListener('offline', () => { checkOnline(); toast('You are offline','error'); });
  if('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(()=>{});
  }
}

function clearBatchPrompt() {
  S.promptAnalysis = '';
  saveSettings();
  const box = document.getElementById('batchPromptBox');
  if(box) box.value = '';
  const settingsBox = document.getElementById('prompt_analysis');
  if(settingsBox) settingsBox.value = '';
  toast('Batch prompt cleared — using built-in default');
}

// ── SETTINGS ──────────────────────────────────────────────────
function loadSettings() {
  try { S = JSON.parse(localStorage.getItem('tq_settings_v3') || '{}'); } catch(e){ S={}; }
  S = Object.assign({}, DEFAULTS, S);
}
function saveSettings() {
  localStorage.setItem('tq_settings_v3', JSON.stringify(S));
}
function saveSetting(key, val) {
  S[key] = val;
  saveSettings();
  if(key === 'darkMode') applyTheme();
}
function saveKey(name, val) {
  S[name] = val;
  saveSettings();
}

function loadOffers() {
  try { offers = JSON.parse(localStorage.getItem('tq_offers_v3') || '[]'); } catch(e){ offers=[]; }
  if(!offers.length) offers = JSON.parse(JSON.stringify(DEFAULT_OFFERS));
}
function saveOffers() {
  localStorage.setItem('tq_offers_v3', JSON.stringify(offers));
}
function loadTiers() {
  try { tiers = JSON.parse(localStorage.getItem('tq_tiers_v3') || '[]'); } catch(e){ tiers=[]; }
  if(!tiers.length) tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS));
}
function saveTiers() {
  localStorage.setItem('tq_tiers_v3', JSON.stringify(tiers));
}

function loadSettingsUI() {
  const set = (id, val, attr='value') => {
    const el = document.getElementById(id);
    if(!el) return;
    if(attr === 'checked') el.checked = !!val;
    else if(el.type==='checkbox') el.checked = !!val;
    else el.value = val != null ? val : '';
  };
  const showMasked = (id, val) => { const el=document.getElementById(id); if(el && val) el.value = val; };
  showMasked('key_rss2json', S.rss2json);
  showMasked('key_nvidia', S.nvidia);
  showMasked('key_groq', S.groq);
  showMasked('key_gemini', S.gemini);
  showMasked('key_hf', S.hf);
  showMasked('key_scrapingdog', S.scrapingdog);
  set('model_nvidia', S.nvidiaModel);
  set('nvidia_custom_model', S.nvidiaCustomModel);
  set('model_groq', S.groqModel);
  set('model_gemini', S.geminiModel);
  set('maxTokens', S.maxTokens);
  set('autoSkipNitter', S.autoSkipNitter, 'checked');
  set('th_minFollowers', S.minFollowers);
  set('th_maxFollowers', S.maxFollowers);
  set('th_minEngagement', S.minEngagement);
  set('th_minReach', S.minReach);
  set('th_requireCheckmark', S.requireCheckmark, 'checked');
  set('th_minNiche', S.minNiche);
  set('th_minEnglish', S.minEnglish);
  set('th_maxDays', S.maxDays);
  set('th_minOriginal', S.minOriginal);
  set('th_maxRatio', S.maxRatio);
  set('th_minHuman', S.minHuman);
  set('th_maxSponsored', S.maxSponsored);
  set('th_maxRepost', S.maxRepost);
  set('th_maxBudget', S.maxBudget);
  set('ft_postCount', S.postCount);
  set('ft_excludeRT', S.excludeRT, 'checked');
  set('ft_excludeReplies', S.excludeReplies, 'checked');
  set('ft_excludeOutliers', S.excludeOutliers, 'checked');
  set('ft_delay', S.delay);
  set('ft_retries', S.retries);
  set('ft_timeout', S.timeout);
  set('pdf_company', S.company);
  set('pdf_incTweets', S.pdfIncTweets, 'checked');
  set('pdf_incCharts', S.pdfIncCharts, 'checked');
  set('pdf_incHuman', S.pdfIncHuman, 'checked');
  set('pdf_format', S.pdfFormat);
  set('csv_export', S.csvExport);
  set('csv_failReasons', S.csvFailReasons, 'checked');
  set('csv_aiScores', S.csvAiScores, 'checked');
  set('csv_humanScores', S.csvHumanScores, 'checked');
  set('csv_price', S.csvPrice, 'checked');
  set('csv_sep', S.csvSep);
  set('adv_history', S.saveHistory, 'checked');
  set('adv_maxBatches', S.maxBatches);
  set('adv_notify', S.notify, 'checked');
  set('adv_debug', S.debug, 'checked');
  set('adv_autoSave', S.autoSave, 'checked');
  set('prompt_analysis', S.promptAnalysis);
  set('prompt_dm1', S.promptDM1);
  set('prompt_dm2', S.promptDM2);
  set('prompt_dm3', S.promptDM3);
  // Sync visible batch prompt box on Input tab
  const batchBox = document.getElementById('batchPromptBox');
  if(batchBox) batchBox.value = S.promptAnalysis || '';

  if(S.logoBase64) {
    document.getElementById('logoStatus').textContent = '✓ Logo loaded';
    document.getElementById('removeLogoBtn').style.display = '';
    document.getElementById('logoPreview').innerHTML = `<img src="${S.logoBase64}" style="height:40px;border-radius:4px;border:1px solid var(--border)">`;
  }
  renderOffersList();
  renderTiersList();
  updateStorageInfo().catch(()=>{});
}

function resetThresholds() {
  const keys = ['minFollowers','maxFollowers','minEngagement','minReach','requireCheckmark','minNiche','minEnglish','maxDays','minOriginal','maxRatio','minHuman','maxSponsored','maxRepost','maxBudget'];
  keys.forEach(k => { S[k] = DEFAULTS[k]; });
  saveSettings();
  loadSettingsUI();
  toast('Thresholds reset to defaults');
}
function clearAllKeys() {
  ['rss2json','nvidia','groq','gemini','hf','scrapingdog'].forEach(k => { S[k]=''; });
  saveSettings();
  ['key_rss2json','key_nvidia','key_groq','key_gemini','key_hf','key_scrapingdog'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
  toast('All API keys cleared');
}

// ── OFFERS & TIERS UI ─────────────────────────────────────────
function renderOffersList() {
  const container = document.getElementById('offersList');
  if(!container) return;
  container.innerHTML = offers.map((o,i) => `
    <div class="offer-card" id="offer_${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="offer-title">${escHtml(o.name)} ${o.isDefault?'<span class="tag green">Default</span>':''}</div>
        <button class="delete-btn" onclick="removeOffer(${i})">🗑</button>
      </div>
      <div class="offer-desc">${escHtml(o.description||'')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="text" class="input" style="flex:1;min-width:120px" value="${escHtml(o.name)}" onblur="updateOffer(${i},'name',this.value)" placeholder="Offer name">
        <input type="text" class="input" style="flex:2;min-width:180px" value="${escHtml(o.description||'')}" onblur="updateOffer(${i},'description',this.value)" placeholder="Description">
        <input type="number" class="input" style="width:80px" value="${o.commissionPct||0}" onblur="updateOffer(${i},'commissionPct',+this.value)" placeholder="%">
      </div>
    </div>
  `).join('');
}
function addOffer() {
  offers.push({ id:'offer_'+Date.now(), name:'New Offer', description:'', commissionPct:30, isDefault:false });
  saveOffers(); renderOffersList();
}
function removeOffer(i) {
  offers.splice(i,1); saveOffers(); renderOffersList();
}
function updateOffer(i, field, val) {
  offers[i][field] = val; saveOffers();
}
function resetOffers() {
  offers = JSON.parse(JSON.stringify(DEFAULT_OFFERS));
  saveOffers(); renderOffersList();
}

function renderTiersList() {
  const container = document.getElementById('tiersList');
  if(!container) return;
  container.innerHTML = tiers.map((t,i) => `
    <div class="tier-row" id="tier_${i}">
      <span class="tier-label">Tier ${i+1}</span>
      <input type="number" class="input" value="${t.minFollowers}" onblur="updateTier(${i},'minFollowers',+this.value)" placeholder="Min Foll">
      <span style="color:var(--text3)">–</span>
      <input type="number" class="input" value="${t.maxFollowers}" onblur="updateTier(${i},'maxFollowers',+this.value)" placeholder="Max Foll">
      <span style="color:var(--text3)">$</span>
      <input type="number" class="input" value="${t.basePrice}" onblur="updateTier(${i},'basePrice',+this.value)" placeholder="Price">
      <button class="delete-btn" onclick="removeTier(${i})">✕</button>
    </div>
  `).join('');
}
function addTier() {
  const last = tiers[tiers.length-1];
  const min = last ? last.maxFollowers : 0;
  tiers.push({ minFollowers:min, maxFollowers:min+25000, basePrice:50 });
  saveTiers(); renderTiersList();
}
function removeTier(i) {
  tiers.splice(i,1); saveTiers(); renderTiersList();
}
function updateTier(i, field, val) {
  tiers[i][field] = val; saveTiers();
}
function getPriceForAccount(followers) {
  if(!followers) return 0;
  for(const t of tiers) {
    if(followers >= t.minFollowers && followers <= t.maxFollowers) return t.basePrice;
  }
  return 0;
}

// ── PROMPTS ───────────────────────────────────────────────────
function resetPrompts() {
  S.promptAnalysis = '';
  S.promptDM1 = '';
  S.promptDM2 = '';
  S.promptDM3 = '';
  saveSettings();
  loadSettingsUI(); // this now syncs batchPromptBox too
  toast('Prompts reset to defaults');
}

// ── LOGO ──────────────────────────────────────────────────────
function uploadLogo(input) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    S.logoBase64 = e.target.result;
    saveSettings();
    document.getElementById('logoStatus').textContent = `✓ ${file.name}`;
    document.getElementById('removeLogoBtn').style.display = '';
    document.getElementById('logoPreview').innerHTML = `<img src="${S.logoBase64}" style="height:40px;border-radius:4px;border:1px solid var(--border)">`;
    toast('Logo uploaded ✓','success');
  };
  reader.onerror = () => toast('Logo read failed','error');
  reader.readAsDataURL(file);
}
function removeLogo() {
  S.logoBase64 = '';
  saveSettings();
  document.getElementById('logoStatus').textContent = 'No logo set';
  document.getElementById('removeLogoBtn').style.display = 'none';
  document.getElementById('logoPreview').innerHTML = '';
}

// ── NITTER ────────────────────────────────────────────────────
function loadNitterList() {
  const list = document.getElementById('nitterList');
  if(!list) return;
  list.innerHTML = S.nitterInstances.map((url,i) => `
    <div class="instance-row" id="nit_${i}" draggable="true" ondragstart="dragNitter(event,${i})" ondragover="event.preventDefault()" ondrop="dropNitter(event,${i})">
      <div class="instance-status" id="nitdot_${i}"></div>
      <div class="instance-url">${escHtml(url)}</div>
      <button class="btn btn-ghost btn-sm" onclick="removeNitter(${i})" style="padding:4px 8px;font-size:11px;">✕</button>
    </div>
  `).join('');
}
let dragSrc = null;
function dragNitter(e,i){ dragSrc=i; e.dataTransfer.effectAllowed='move'; }
function dropNitter(e,i){
  e.preventDefault();
  if(dragSrc===null||dragSrc===i) return;
  const arr=[...S.nitterInstances];
  const [removed]=arr.splice(dragSrc,1);
  arr.splice(i,0,removed);
  S.nitterInstances=arr; saveSettings(); loadNitterList(); dragSrc=null;
}
function addNitterInstance() {
  const el = document.getElementById('newNitterUrl');
  let url = (el.value||'').trim().replace(/\/$/,'');
  if(!url) return;
  if(!url.startsWith('http')) url='https://'+url;
  if(!S.nitterInstances.includes(url)) { S.nitterInstances.push(url); saveSettings(); loadNitterList(); }
  el.value='';
}
function removeNitter(i) {
  S.nitterInstances.splice(i,1); saveSettings(); loadNitterList();
}
function resetNitterInstances() {
  S.nitterInstances = [...DEFAULTS.nitterInstances]; saveSettings(); loadNitterList();
}
async function testAllNitter() {
  for(let i=0;i<S.nitterInstances.length;i++) {
    const dot = document.getElementById(`nitdot_${i}`);
    if(dot) dot.className = 'instance-status testing';
  }
  for(let i=0;i<S.nitterInstances.length;i++) {
    const dot = document.getElementById(`nitdot_${i}`);
    const url = S.nitterInstances[i];
    try {
      const testUrl = `https://${url.replace(/^https?:\/\//,'')}/elonmusk`;
      const proxyUrls = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(testUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(testUrl)}`
      ];
      let ok = false;
      for(const proxy of proxyUrls) {
        try {
          const res = await Promise.race([fetch(proxy,{mode:'cors'}), new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),8000))]);
          if(res && res.ok) { ok = true; break; }
        } catch(e) {}
      }
      if(dot) dot.className = 'instance-status ' + (ok?'live':'dead');
    } catch(e) {
      if(dot) dot.className = 'instance-status dead';
    }
  }
}

// ── API TESTS ─────────────────────────────────────────────────
async function testAPI(name) {
  const dot = document.getElementById(`dot_${name}`);
  if(dot) dot.className = 'api-test-dot testing';
  try {
    let ok = false;
    const key = S[name] || document.getElementById(`key_${name}`)?.value || '';
    if(!key) throw new Error('No key provided');
    switch(name) {
      case 'rss2json': {
        const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://xcancel.com/elonmusk/rss&api_key=${key}&count=1`);
        ok = r.ok; break;
      }
      case 'nvidia': {
        const model = S.nvidiaCustomModel || S.nvidiaModel || 'meta/llama-3.1-8b-instruct';
        const testBody = {model, messages:[{role:'user',content:'Hi, respond with "ok"'}], max_tokens:5, temperature:0.1, stream:false};
        const r = await fetch('/api/nvidia-proxy',{
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+key},
          body:JSON.stringify(testBody)
        });
        if(!r.ok) { const e=await r.text().catch(()=>''); throw new Error(`HTTP ${r.status}: ${e.slice(0,200)}`); }
        ok = r.ok; break;
      }
      case 'groq': {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
          body:JSON.stringify({model:S.groqModel||'llama3-8b-8192', messages:[{role:'user',content:'Hi'}], max_tokens:5, temperature:0.1})
        });
        ok = r.ok; break;
      }
      case 'gemini': {
        const gemModel = S.geminiModel || 'gemini-2.0-flash';
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${key}`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({contents:[{parts:[{text:'Hi'}]}], generationConfig:{maxOutputTokens:5,temperature:0.1}})
        });
        ok = r.ok; break;
      }
      case 'hf': {
        const r = await fetch('https://api-inference.huggingface.co/models/papluca/xlm-roberta-base-language-detection',{
          method:'POST',
          headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
          body:JSON.stringify({inputs:'Hello world'})
        });
        ok = r.ok; break;
      }
      case 'scrapingdog': ok = !!key; break;
    }
    if(dot) dot.className = 'api-test-dot ' + (ok?'ok':'fail');
    toast(`${name}: ${ok?'Connected ✓':'Failed ✗'}`, ok?'success':'error');
  } catch(e) {
    if(dot) dot.className = 'api-test-dot fail';
    toast(`${name}: Failed — ${e.message}`,'error');
  }
}

// ── URL NORMALIZATION ─────────────────────────────────────────
function normalizeHandle(raw) {
  if(!raw) return { handle:null, display:null };
  raw = String(raw).trim();
  if(!raw) return { handle:null, display:null };
  // Strip query/hash
  raw = raw.replace(/[?#].*/,'');
  // Strip trailing slashes
  raw = raw.replace(/\/+$/, '');
  // Strip known Twitter/X/Nitter URL prefixes (case-insensitive, allow any nitter domain)
  raw = raw.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com|xcancel\.com|nitter\.[^/]+)\//i,'');
  // Strip remaining scheme if any
  raw = raw.replace(/^https?:\/\//i,'');
  // Strip leading @
  raw = raw.replace(/^@+/,'');
  // Take only first path segment
  raw = raw.split('/')[0];
  // Validate Twitter handle chars
  if(!/^[A-Za-z0-9_]{1,50}$/.test(raw)) return { handle:null, display:null };
  // handle is always lowercase internally; display preserves original casing from input
  return { handle: raw.toLowerCase(), display: raw };
}

// ── INPUT & QUEUE ─────────────────────────────────────────────
function addToQueue() {
  const text = document.getElementById('urlInput').value.trim();
  if(!text) return toast('Please enter at least one URL or handle','error');
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  let added=0, skipped=0;
  for(const line of lines) {
    if(queue.length >= 25) { toast('Queue full (max 25 accounts)','error'); break; }
    const parsed = normalizeHandle(line);
    if(!parsed.handle) { skipped++; continue; }
    if(queue.find(q=>q.handle===parsed.handle)) { skipped++; continue; }
    queue.push({ handle: parsed.handle, displayHandle: parsed.display || parsed.handle, status:'pending', data:null, retries:0 });
    added++;
  }
  if(added) {
    toast(`Added ${added} account${added>1?'s':''}${skipped?` (${skipped} skipped)`:''}`, 'success');
    document.getElementById('urlInput').value = '';
    renderQueuePreview();
    updateQueueBadge();
  } else {
    toast('No valid accounts found','error');
  }
}
function clearInput() {
  document.getElementById('urlInput').value = '';
}
function clearQueue() {
  if(!queue.length) return;
  queue = [];
  renderQueuePreview();
  updateQueueBadge();
  toast('Queue cleared');
}
function renderQueuePreview() {
  const preview = document.getElementById('queuePreview');
  const list = document.getElementById('queueList');
  const count = document.getElementById('queueCount');
  if(!queue.length) { preview.style.display='none'; return; }
  preview.style.display='';
  count.textContent = queue.length;
  const eta = Math.ceil(queue.length * (S.delay + 15) / 60);
  document.getElementById('queueEta').innerHTML = `<strong>${queue.length}</strong> accounts · ETA ~${eta} min`;

  const phase1Btn = document.getElementById('phase1Btn');
  if(queue.length >= 2) {
    phase1Btn.style.display = '';
    phase1Btn.textContent = `🎯 Phase 1 (first ${Math.min(3, queue.length)})`;
  } else {
    phase1Btn.style.display = 'none';
  }

  list.innerHTML = queue.map((q,i) => `
    <div class="queue-row" id="qr_${q.handle}">
      <div class="queue-handle"><span>@</span>${escHtml(q.displayHandle || q.handle)}</div>
      <span class="status status-pending">⏳ Pending</span>
      <button class="btn btn-danger btn-xs" style="padding:4px 8px" onclick="removeFromQueue('${q.handle}')">🗑</button>
    </div>
  `).join('');
}
function removeFromQueue(handle) {
  queue = queue.filter(q=>q.handle!==handle);
  renderQueuePreview();
  updateQueueBadge();
}
function removeFromLiveQueue(handle) {
  // Mark as skipped so the batch loop skips it
  const item = queue.find(q=>q.handle===handle);
  if(item && ['pending','retry'].includes(item.status)) {
    item.status = 'skip';
    log(`⏭ Skipped @${handle} from queue`, 'warn');
    renderLiveQueue(0);
    toast(`Skipped @${handle}`);
  }
}
function updateQueueBadge() {
  const badge = document.getElementById('queueBadge');
  if(queue.length) { badge.textContent=queue.length; badge.style.display=''; }
  else badge.style.display='none';
}

// ── PHASE 1 MODE ──────────────────────────────────────────────
function startPhase1() {
  phase1Mode = true;
  phase1Complete = false;
  const phase1Count = Math.min(3, queue.length);
  toast(`Starting Phase 1 — processing first ${phase1Count} accounts for ICP review`, 'success');
  startBatch(phase1Count);
}

// ── CSV IMPORT ────────────────────────────────────────────────
function importCSV() { document.getElementById('csvImportInput').click(); }
function handleCSVImport(input) {
  const file = input.files[0]; if(!file) return;
  Papa.parse(file,{
    header:true, skipEmptyLines:true,
    complete:(res)=>{
      const rows = res.data || [];
      let added=0;
      for(const row of rows) {
        const val = row.url || row.handle || row.username || row.URL || '';
        const parsed = normalizeHandle(val);
        if(parsed.handle && queue.length<25 && !queue.find(q=>q.handle===parsed.handle)) {
          queue.push({handle:parsed.handle, displayHandle:parsed.display||parsed.handle, status:'pending',data:null,retries:0});
          added++;
        }
      }
      toast(`Imported ${added} accounts from CSV`,'success');
      renderQueuePreview();
      updateQueueBadge();
    },
    error:()=>toast('CSV parse failed','error')
  });
  input.value='';
}

// ── BATCH ENGINE ──────────────────────────────────────────────
async function startBatch(limit=null) {
  if(!S.rss2json) return toast('rss2json API key required — see Settings','error');
  if(!queue.length) return toast('Queue is empty','error');
  if(isProcessing) return;

  results = [];
  isProcessing = true;
  isPaused = false;
  stopRequested = false;
  batchId = 'batch_' + Date.now();
  startTime = Date.now();

  const processCount = limit || queue.length;
  const actualQueue = queue.slice(0, processCount);

  showSection('queue', document.getElementById('nav-queue'));
  document.getElementById('pauseBtn').disabled = false;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('progressCard').style.display = '';
  document.getElementById('statsBar').style.display = 'none';
  document.getElementById('filterBar').style.display = 'none';

  log('▶ BATCH STARTED — ' + actualQueue.length + ' accounts' + (phase1Mode ? ' [PHASE 1 — ICP ALIGNMENT]' : ''), 'info');
  log('   Settings: minHuman=' + S.minHuman + '%, maxSponsored=' + S.maxSponsored + '%, maxRepost=' + S.maxRepost + '%', 'info');

  for(let i=0; i<actualQueue.length; i++) {
    if(stopRequested) { log('⏹ Batch stopped by user','warn'); break; }
    while(isPaused) { await sleep(500); }

    const qItem = actualQueue[i];
    if(!['pending','retry'].includes(qItem.status)) continue;

    qItem.status = 'processing';
    renderLiveQueue(i);
    updateProgress(i, actualQueue.length);

    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`🔄 [${i+1}/${actualQueue.length}] Processing @${qItem.handle}...`, 'step');

    try {
      const account = await processAccount(qItem.handle, i);
      qItem.status = account.overall_result.toLowerCase();
      qItem.data = account;
      results.push(account);
      try { localStorage.setItem('f12x_session_backup', JSON.stringify({queue, results, batchId})); } catch(e){}

      const emoji = account.overall_result==='PASS'?'✅':account.overall_result==='FLAGGED'?'🚩':'❌';
      log(`${emoji} @${qItem.handle} → ${account.overall_result} | Human: ${account.ai_analysis?.human_confidence||'N/A'}% | Sponsored: ${account.ai_analysis?.sponsored_content_ratio||'N/A'}%`, account.overall_result==='PASS'?'success':'error');
    } catch(e) {
      qItem.status = 'error';
      log(`💀 @${qItem.handle} — ERROR: ${e.message}`, 'error');
      if(e.message && e.message.includes('Nitter')) {
        toast('Nitter instances are blocking requests. Try adding a ScrapingDog API key in Settings → API Keys.', 'error');
      }
      results.push(buildErrorAccount(qItem.handle, e.message));
    }

    renderLiveQueue(i);
    updateProgress(i+1, actualQueue.length);
    updateResultBadges();

    if(i < actualQueue.length-1 && !stopRequested) {
      log(`   ⏱ Waiting ${S.delay}s before next account...`);
      await sleep(S.delay * 1000);
    }
  }

  isProcessing = false;
  document.getElementById('pauseBtn').disabled = true;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('retryBtn').style.display = queue.some(q=>q.status==='error')?'':'none';

  const passCount = results.filter(r=>r.overall_result==='PASS').length;
  const failCount = results.filter(r=>r.overall_result==='FAIL').length;
  const manualCount = results.filter(r=>['MANUAL','FLAGGED'].includes(r.overall_result)).length;

  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`✅ BATCH COMPLETE — ${passCount} passed | ${failCount} failed | ${manualCount} manual/flagged`, 'success');

  if(phase1Mode) {
    phase1Complete = true;
    log('🎯 PHASE 1 COMPLETE — Review these accounts before processing the rest', 'warn');
    toast('Phase 1 complete! Review results, then click "Start Full Batch" for remaining accounts', 'success');
    phase1Mode = false;
    queue = queue.slice(processCount);
    renderQueuePreview();
    updateQueueBadge();
  }

  if(S.autoSave && S.saveHistory) await saveBatch();
  renderResults();
  renderOutreach();
  showSection('results', document.getElementById('nav-results'));

  if(S.notify && 'Notification' in window && Notification.permission==='granted') {
    try {
      new Notification('F12X Batch Complete', {
        body:`${passCount} human accounts qualified out of ${results.length}`,
        icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✅</text></svg>'
      });
    } catch(e){}
  }
  toast(`Batch done! ${passCount}/${results.length} qualified`,'success');
}

async function processAccount(handle, index) {
  log(`   📋 Initializing account object for @${handle}...`);
  const account = {
    handle, display_name:'', bio:'', followers:0, following:0,
    profile_image_url:'', nitter_url:'', twitter_url:`https://x.com/${handle}`,
    fetch_status:'pending', fetch_source:'', fetch_timestamp: new Date().toISOString(),
    tweets_raw_count:0, tweets_filtered_count:0, tweets:[],
    metrics:{}, ai_analysis:{}, checks:{},
    overall_result:'FAIL', fail_reasons:[], needs_manual_review:[],
    user_notes:{ status:'', notes:'', checkmark_override:null, geography_override:null, starred:false, price_offer:'' },
    pdf_filename:`qualifier_${handle}_${new Date().toISOString().slice(0,10)}.pdf`,
    dm_sequence:[], calculated_price:0
  };

  // ── STEP 1: USERNAME HEURISTIC SCAN ──
  log(`   🔍 Step 1: Username heuristic scan for @${handle}...`);
  const usernameLower = handle.toLowerCase();
  const aiKeywords = ['ai', 'artificial', 'bot', 'gpt', 'llm', 'machine', 'neural', 'synthetic', 'automated', 'theme', 'curated', 'daily'];
  const handleParts = handle.toLowerCase().split(/[^a-z0-9]/);
  const hasAiKeyword = handleParts.some(part => aiKeywords.includes(part));
  if(hasAiKeyword) {
    log(`   ⚠️ Username contains AI/theme keyword: "${handle}" — will flag in AI analysis`, 'warn');
  } else {
    log(`   ✓ No AI keywords detected in username`);
  }
  account.username_ai_keyword = hasAiKeyword;

  // ── STEP 2: FETCH RSS FEED ──
  log(`   📡 Step 2: Fetching RSS feed for @${handle}...`);
  const rssResult = await fetchRSS(handle);

  if(!rssResult.success) {
    account.fetch_status = 'error';
    throw new Error(rssResult.error || 'RSS fetch failed');
  }

  account.fetch_status = 'success';
  account.fetch_source = rssResult.source;
  account.nitter_url = `https://${rssResult.source}/${handle}`;
  account.tweets_raw_count = (rssResult.items || []).length;
  log(`   ✓ Fetched ${account.tweets_raw_count} raw tweets from ${rssResult.source}`);

  // ── STEP 3: FETCH PROFILE HTML ──
  log(`   👤 Step 3: Scraping profile data for @${handle}...`);
  const profileResult = await fetchProfile(handle, rssResult.source);
  if(profileResult.success) {
    account.followers = profileResult.followers || 0;
    account.following = profileResult.following || 0;
    account.bio = profileResult.bio || '';
    account.display_name = profileResult.display_name || handle;
    account.profile_image_url = profileResult.profile_image_url || '';
    log(`   ✓ Profile: ${fmtNum(account.followers)} followers, ${fmtNum(account.following)} following`);
    log(`   ✓ Bio: ${account.bio ? account.bio.slice(0,80) + (account.bio.length>80?'...':'') : '[empty]'}`);
  } else {
    account.display_name = handle;
    account.bio = '';
    account.followers = 0;
    log(`   ⚠️ Profile fetch failed — using defaults`, 'warn');
  }

  // ── STEP 4: PARSE & FILTER TWEETS ──
  log(`   📝 Step 4: Parsing and filtering tweets...`);
  const allTweets = rssResult.items || [];

  const rawRepostCount = allTweets.filter(t => !!t.is_retweet).length;
  const rawOriginalCount = allTweets.filter(t => !t.is_retweet && !t.is_reply).length;
  const rawReplyCount = allTweets.filter(t => !!t.is_reply).length;
  const repostRatio = allTweets.length > 0 ? Math.round(rawRepostCount / allTweets.length * 100) : 0;
  const originalPct = allTweets.length > 0 ? Math.round(rawOriginalCount / allTweets.length * 100) : 0;

  log(`   📊 Tweet breakdown: ${rawOriginalCount} original, ${rawRepostCount} reposts, ${rawReplyCount} replies`);
  log(`   📊 Repost ratio: ${repostRatio}% | Original content: ${originalPct}%`);

  let filtered = [...allTweets];
  if(S.excludeRT) {
    const before = filtered.length;
    filtered = filtered.filter(t=>!t.is_retweet);
    log(`   🚫 Excluded ${before - filtered.length} retweets from analysis`);
  }
  if(S.excludeReplies) {
    const before = filtered.length;
    filtered = filtered.filter(t=>!t.is_reply);
    log(`   🚫 Excluded ${before - filtered.length} replies from analysis`);
  }
  filtered = filtered.slice(0, S.postCount);
  log(`   📊 Analyzing ${filtered.length} original posts`);

  if(S.excludeOutliers && filtered.length > 3) {
    const views = filtered.map(t=>t.views||0).filter(v=>v>0);
    if(views.length > 0) {
      const avgV = views.reduce((a,b)=>a+b,0)/views.length;
      const threshold = avgV * 3;
      const outlierCount = filtered.filter(t=>(t.views||0) > threshold && (t.views||0) > 0).length;
      filtered = filtered.map(t=>({ ...t, is_outlier: (t.views||0) > threshold && (t.views||0) > 0 }));
      log(`   ⚡ Excluded ${outlierCount} outlier tweets (views > ${fmtNum(Math.round(threshold))})`);
    }
  }

  filtered = filtered.map(t => ({
    ...t,
    engagement_rate: account.followers > 0
      ? parseFloat((((t.likes||0) + (t.replies||0) + (t.retweets||0)) / account.followers * 100).toFixed(2))
      : 0
  }));

  account.tweets = filtered;
  account.tweets_filtered_count = filtered.length;
  account.raw_repost_ratio = repostRatio;
  account.raw_original_pct = originalPct;

  // ── STEP 5: CALCULATE METRICS ──
  log(`   📈 Step 5: Calculating engagement metrics...`);
  const nonOutlierTweets = filtered.filter(t=>!t.is_outlier);
  const validTweets = nonOutlierTweets.length > 0 ? nonOutlierTweets : filtered;

  const engRates = validTweets.map(t=>t.engagement_rate);
  const avgEng = engRates.length ? engRates.reduce((a,b)=>a+b,0)/engRates.length : 0;

  const viewCounts = validTweets.map(t=>t.views||0).filter(v=>v>0);
  const avgViews = viewCounts.length ? viewCounts.reduce((a,b)=>a+b,0)/viewCounts.length : 0;
  const reachRatio = account.followers > 0 && avgViews > 0 ? avgViews/account.followers : 0;
  log(`   📊 Avg views (original only): ${fmtNum(Math.round(avgViews))} | Reach ratio: ${reachRatio.toFixed(3)}x`);

  const dates = filtered.map(t=>new Date(t.date)).filter(d=>!isNaN(d));
  let postFreq = 0;
  if(dates.length >= 2) {
    const oldest = Math.min(...dates.map(d=>d.getTime()));
    const newest = Math.max(...dates.map(d=>d.getTime()));
    const weeks = (newest - oldest) / (7*24*3600*1000) || 1;
    postFreq = parseFloat((dates.length / weeks).toFixed(1));
  }

  const lastTweetDate = dates.length ? new Date(Math.max(...dates.map(d=>d.getTime()))) : null;
  const daysSincePost = lastTweetDate ? Math.floor((Date.now()-lastTweetDate.getTime())/(86400000)) : 999;

  const engMean = avgEng;
  const engStdDev = engRates.length > 1
    ? parseFloat(Math.sqrt(engRates.reduce((a,b)=>a+(b-engMean)**2,0)/engRates.length).toFixed(2))
    : 0;

  account.metrics = {
    engagement_rate_avg: parseFloat(avgEng.toFixed(2)),
    avg_views: Math.round(avgViews),
    reach_ratio: parseFloat(reachRatio.toFixed(3)),
    posting_frequency_per_week: postFreq,
    original_content_pct: originalPct,
    repost_ratio: repostRatio,
    follower_following_ratio: account.following > 0 ? parseFloat((account.followers/account.following).toFixed(1)) : 999,
    days_since_last_post: daysSincePost,
    engagement_std_dev: engStdDev,
    has_outlier_tweets: filtered.some(t=>!!t.is_outlier)
  };

  // ── STEP 6: AI ANALYSIS (HUMAN DETECTION) ──
  log(`   🤖 Step 6: Running AI human detection analysis for @${handle}...`);
  const activeModel = S.nvidia ? (S.nvidiaCustomModel || S.nvidiaModel) : S.groq ? S.groqModel : S.gemini ? S.geminiModel : 'none';
  log(`   🤖 Using model: ${activeModel}`);
  const aiResult = await runAIAnalysis(account.bio, account.tweets.slice(0,10).map(t=>t.text||''), handle);
  account.ai_analysis = aiResult;
  log(`   🤖 AI Results: Human=${aiResult.is_real_human} (${aiResult.human_confidence}%), ThemePage=${aiResult.is_theme_page}, Agency=${aiResult.is_agency_run}, Sponsored=${aiResult.sponsored_content_ratio}%, Niche=${aiResult.niche_label}(${aiResult.niche_score})`);

  // ── STEP 7: RUN QUALIFICATION CHECKS ──
  log(`   ⚖️ Step 7: Running qualification checks...`);
  account.checks = runChecks(account);

  // ── STEP 8: DETERMINE OVERALL RESULT ──
  log(`   🏁 Step 8: Determining final result...`);
  const checkVals = Object.values(account.checks);
  const anyFail = checkVals.some(c=>c.result==='FAIL');
  const anyManual = checkVals.some(c=>c.result==='MANUAL');
  const anyFlagged = checkVals.some(c=>c.result==='FLAG');

  account.fail_reasons = checkVals.filter(c=>c.result==='FAIL').map(c=>c.reason).filter(Boolean);
  account.needs_manual_review = checkVals.filter(c=>c.result==='MANUAL').map(c=>c.label).filter(Boolean);

  if(anyFail) account.overall_result = 'FAIL';
  else if(anyFlagged) account.overall_result = 'FLAGGED';
  else if(anyManual) account.overall_result = 'MANUAL';
  else account.overall_result = 'PASS';

  // ── STEP 9: CALCULATE PRICE ──
  account.calculated_price = getPriceForAccount(account.followers);

  log(`   ✅ @${handle} analysis complete — ${account.overall_result}`);
  return account;
}

// ── RSS FETCH ─────────────────────────────────────────────────
async function fetchRSS(handle) {
  const apiKey = S.rss2json;
  const instances = S.nitterInstances;
  log(`      [RSS] Trying ${instances.length} Nitter instances...`);

  // CORS proxies for bypassing restrictions
  const corsProxies = [
    '/api/proxy?url=',
    'https://api.allorigins.win/get?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
  ];

  for(const instance of instances) {
    const base = instance.replace(/^https?:\/\//,'');
    const profileUrl = `https://${base}/${handle}`;
    const rssUrl = `https://${base}/${handle}/rss`;

    // === METHOD 1: HTML scraping via proxy (most reliable) ===
    log(`      [RSS] Trying ${base} HTML scrape...`);
    for(const proxy of corsProxies) {
      try {
        const proxyUrl = proxy + encodeURIComponent(profileUrl);
        const res = await fetchWithTimeout(proxyUrl, 12000);
        if(!res.ok) continue;

        let html;
        if(proxy.includes('allorigins') && !proxy.includes('raw')) {
          const data = await res.json();
          html = data.contents || '';
        } else {
          html = await res.text();
        }

        // Check if we got valid Nitter HTML (not an error page)
        if(html && html.includes('timeline-item') && html.includes(handle.toLowerCase())) {
          const items = parseNitterHTMLTweets(html, handle);
          if(items.length > 0) {
            log(`      [RSS] ✓ HTML scrape from ${base} — ${items.length} items`);
            return { success:true, items, source:base };
          }
        }
      } catch(e) { continue; }
    }

    // === METHOD 2: RSS via rss2json ===
    log(`      [RSS] Trying ${base} via rss2json...`);
    try {
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&api_key=${apiKey}&count=30`;
      const res = await fetchWithTimeout(apiUrl, S.timeout * 1000);
      if(!res.ok) { log(`      [RSS] ${base} HTTP ${res.status}`, 'warn'); continue; }
      const data = await res.json();
      if(data.status !== 'ok' || !data.items) { log(`      [RSS] ${base} invalid response`, 'warn'); continue; }
      if(!data.items.length) { log(`      [RSS] ${base} empty feed`, 'warn'); continue; }

      const items = (data.items || []).map(item => parseTweetItem(item, handle));
      // Check if all items are whitelist-blocked fake responses
      const realItems = items.filter(item => !item._whitelist_blocked);
      if(realItems.length === 0 && items.length > 0) {
        log(`      [RSS] ${base} RSS is whitelisted/blocked — falling back to HTML`, 'warn');
        continue; // Try next method
      }
      log(`      [RSS] ✓ rss2json from ${base} — ${realItems.length} items`);
      return { success:true, items:realItems, source:base };
    } catch(e) {
      log(`      [RSS] ✗ ${base} rss2json failed: ${e.message}`, 'warn');
    }

    // === METHOD 3: Direct RSS with raw proxy ===
    log(`      [RSS] Trying ${base} direct RSS via proxy...`);
    for(const proxy of corsProxies) {
      try {
        const proxyUrl = proxy + encodeURIComponent(rssUrl);
        const res = await fetchWithTimeout(proxyUrl, 10000);
        if(!res.ok) continue;

        let rssText;
        if(proxy.includes('allorigins') && !proxy.includes('raw')) {
          const data = await res.json();
          rssText = data.contents || '';
        } else {
          rssText = await res.text();
        }

        const items = parseRawRSS(rssText, handle);
        if(items.length > 0) {
          log(`      [RSS] ✓ RSS proxy from ${base} — ${items.length} items`);
          return { success:true, items, source:base };
        }
      } catch(e) { continue; }
    }
  }

  // === LAST RESORT: ScrapingDog ===
  if(S.scrapingdog) {
    log(`      [RSS] Trying ScrapingDog fallback...`);
    try {
      const sdUrl = `https://api.scrapingdog.com/scrape?api_key=${S.scrapingdog}&url=${encodeURIComponent(`https://xcancel.com/${handle}`)}&dynamic=true`;
      const res = await fetchWithTimeout(sdUrl, S.timeout * 1000);
      if(res.ok) {
        const html = await res.text();
        const items = parseNitterHTMLTweets(html, handle);
        log(`      [RSS] ✓ ScrapingDog returned ${items.length} items`);
        return { success:true, items, source:'scrapingdog' };
      }
    } catch(e) { log(`      [RSS] ScrapingDog failed: ${e.message}`, 'warn'); }
  }

  return { success:false, error:'All Nitter instances and fallbacks failed. Nitter blocks automated RSS access. Try: (1) Adding a ScrapingDog API key in Settings, (2) Using a different account, or (3) Check if the account is private/suspended.' };
}

function parseRawRSS(rssText, handle) {
  try {
    // Detect whitelist block pages
    if(rssText.includes('not yet whitelisted') || rssText.includes('RSS reader not yet whitelist')) {
      log(`      [RSS] Raw RSS blocked by whitelist`, 'warn');
      return [];
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rssText, 'text/xml');
    const items = xmlDoc.querySelectorAll('item');
    const tweets = [];
    items.forEach(item => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const description = item.querySelector('description')?.textContent || '';
      const is_retweet = title.startsWith('RT @');
      const is_reply = title.startsWith('@') && !is_retweet;

      // Try to extract stats from description HTML
      let likes=0, retweets=0, replies=0, views=0;
      try {
        const descDoc = parser.parseFromString(description, 'text/html');
        descDoc.querySelectorAll('.tweet-stat, div').forEach(el => {
          const txt = el.textContent || '';
          const num = parseInt((txt.match(/[\\d,]+/)||['0'])[0].replace(/,/g,'')) || 0;
          if(el.querySelector('.icon-heart') || txt.includes('❤')) likes = num;
          else if(el.querySelector('.icon-retweet') || txt.includes('🔄')) retweets = num;
          else if(el.querySelector('.icon-comment') || txt.includes('💬')) replies = num;
          else if(el.querySelector('.icon-play') || txt.includes('👁')) views = num;
        });
      } catch(e) {}

      tweets.push({
        text: title.replace(/^RT @\w+:\s*/, '').slice(0,280),
        date: pubDate || new Date().toISOString(),
        url: link.replace(/^https?:\/\/[^/]+/, 'https://x.com'),
        likes, retweets, replies, views,
        is_retweet, is_reply, is_quote: false, is_outlier: false,
        engagement_rate: 0
      });
    });
    return tweets;
  } catch(e) {
    return [];
  }
}

function parseTweetItem(item, handle) {
  try {
    const text = (item.title || '').toString();
    const content = (item.content || '').toString();

    // Detect fake "not whitelisted" responses from xcancel.com
    if(text.includes('not yet whitelisted') || content.includes('not yet whitelisted') || 
       text.includes('RSS reader not yet whitelist') || handle === 'rss') {
      return { text:'', date:new Date().toISOString(), url:'', likes:0, retweets:0, replies:0, views:0, is_retweet:false, is_reply:false, is_quote:false, is_outlier:false, engagement_rate:0, _whitelist_blocked:true };
    }

    const is_retweet = text.startsWith('RT @');
    const is_reply = text.startsWith('@') && !is_retweet;

    let likes=0, retweets=0, replies=0, views=0;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const getStatNum = (cls) => {
        const el = doc.querySelector('.'+cls);
        if(!el) return 0;
        const parent = el.closest('.tweet-stat') || el.parentElement;
        const txt = parent ? parent.textContent.trim() : '0';
        const match = txt.match(/[\d,]+/);
        return match ? parseInt(match[0].replace(/,/g,'')) : 0;
      };
      likes = getStatNum('icon-heart');
      retweets = getStatNum('icon-retweet');
      replies = getStatNum('icon-comment');
      views = getStatNum('icon-play');
    } catch(e) {}

    const rawUrl = item.link || '';
    const url = rawUrl.replace(/^https?:\/\/[^/]+/, `https://x.com`);

    return {
      text: text.replace(/^RT @\w+:\s*/,'').slice(0,280),
      date: item.pubDate || new Date().toISOString(),
      url,
      likes, retweets, replies, views,
      is_retweet, is_reply, is_quote: false, is_outlier: false,
      engagement_rate: 0
    };
  } catch(e) {
    return { text:'', date:new Date().toISOString(), url:'', likes:0, retweets:0, replies:0, views:0, is_retweet:false, is_reply:false, is_quote:false, is_outlier:false, engagement_rate:0 };
  }
}

function parseNitterHTMLTweets(html, handle) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tweets = [];

    // Nitter timeline items
    doc.querySelectorAll('.timeline-item, .tweet, article').forEach(item => {
      // Try multiple selectors for tweet text
      let text = '';
      const textEl = item.querySelector('.tweet-content, .content, .tweet-text, [data-testid="tweetText"]');
      if(textEl) text = textEl.textContent.trim();

      // Try to get date
      let date = new Date().toISOString();
      const dateEl = item.querySelector('.tweet-date a, .date, time');
      if(dateEl) {
        const dateStr = dateEl.getAttribute('title') || dateEl.textContent || dateEl.getAttribute('datetime');
        if(dateStr) {
          const parsed = new Date(dateStr);
          if(!isNaN(parsed)) date = parsed.toISOString();
        }
      }

      // Try to get stats
      let likes=0, retweets=0, replies=0, views=0;
      const statEls = item.querySelectorAll('.tweet-stat, .stat');
      statEls.forEach(stat => {
        const txt = stat.textContent || '';
        const num = parseInt((txt.match(/[\d,]+/)||['0'])[0].replace(/,/g,'')) || 0;
        if(stat.querySelector('.icon-heart, [class*="heart"]')) likes = num;
        else if(stat.querySelector('.icon-retweet, [class*="retweet"]')) retweets = num;
        else if(stat.querySelector('.icon-comment, [class*="comment"]')) replies = num;
        else if(stat.querySelector('.icon-play, [class*="play"]')) views = num;
      });

      // Determine tweet type
      const is_retweet = text.startsWith('RT @') || !!item.querySelector('.retweet-header');
      const is_reply = text.startsWith('@') && !is_retweet;
      const is_quote = !!item.querySelector('.quote, .quoted');

      if(text) {
        tweets.push({
          text: text.replace(/^RT @\w+:\s*/, '').slice(0,280),
          date,
          url: `https://x.com/${handle}`,
          likes, retweets, replies, views,
          is_retweet, is_reply, is_quote,
          is_outlier: false, engagement_rate: 0
        });
      }
    });

    log(`      [HTML] Parsed ${tweets.length} tweets from HTML`);
    return tweets;
  } catch(e) { 
    log(`      [HTML] Parse error: ${e.message}`, 'warn');
    return []; 
  }
}

// ── PROFILE FETCH ─────────────────────────────────────────────
async function fetchProfile(handle, preferredInstance) {
  const instances = [preferredInstance, ...S.nitterInstances.filter(i=>i!==preferredInstance)];
  log(`      [Profile] Trying ${Math.min(3, instances.length)} instances for profile...`);
  for(const instance of instances.slice(0,3)) {
    const base = instance.replace(/^https?:\/\//,'');
    const profileUrl = `https://${base}/${handle}`;
    const proxyUrls = [
      `https://api.allorigins.win/get?url=${encodeURIComponent(profileUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(profileUrl)}`
    ];
    for(const proxyUrl of proxyUrls) {
      try {
        log(`      [Profile] Trying ${base} via proxy...`);
        const res = await fetchWithTimeout(proxyUrl, 15000);
        if(!res.ok) continue;
        const data = await res.json();
        const html = data.contents || '';
        if(!html) continue;
        const profile = parseProfileHTML(html, handle);
        if((profile.followers || 0) > 0 || profile.display_name) {
          log(`      [Profile] ✓ Got profile from ${base}`);
          return { success:true, ...profile };
        }
      } catch(e) { continue; }
    }
  }
  log(`      [Profile] ✗ All profile sources failed`, 'warn');
  return { success:false };
}

function parseProfileHTML(html, handle) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const nums = Array.from(doc.querySelectorAll('.profile-stat-num')).map(el => {
      const text = (el.textContent || '').trim().replace(/,/g,'');
      const mul = text.includes('K') ? 1000 : text.includes('M') ? 1000000 : 1;
      const num = parseFloat(text) * mul;
      return isNaN(num) ? 0 : Math.round(num);
    });

    const followers = nums[2] || nums[1] || 0;
    const following = nums[1] || 0;

    const bio_el = doc.querySelector('.profile-bio .tweet-content') || doc.querySelector('.profile-bio');
    const bio = bio_el ? (bio_el.textContent || '').trim() : '';

    const name_el = doc.querySelector('.profile-card-fullname') || doc.querySelector('h1');
    const display_name = name_el ? (name_el.textContent || '').trim() : handle;

    const img_el = doc.querySelector('.profile-card-avatar img');
    const profile_image_url = img_el ? img_el.src : '';

    return { followers, following, bio, display_name, profile_image_url };
  } catch(e) {
    return { followers:0, following:0, bio:'', display_name:handle, profile_image_url:'' };
  }
}

// ── AI ANALYSIS ─────────────────────────────────────────────
async function runAIAnalysis(bio, tweetTexts, handle) {
  const defaultResult = {
    is_real_human: true, human_confidence: 50,
    is_theme_page: false, is_agency_run: false, is_ai_generated_persona: false,
    sponsored_content_ratio: 0, organic_content_ratio: 100,
    content_topics: [], posting_pattern: 'unknown',
    english_pct:75, primary_language:'English',
    niche_score:5, niche_label:'Unknown', niche_reasoning:'AI analysis unavailable',
    bot_confidence:50, content_quality_score:5,
    audience_likely_english_speaking:true, audience_likely_non_indian:true,
    audience_reasoning:'Manual review required', ai_source:'none'
  };

  if(!S.nvidia && !S.groq && !S.gemini) {
    log(`      [AI] ⚠️ No AI API keys configured — AI checks marked MANUAL`, 'warn');
    return { ...defaultResult, ai_source:'none' };
  }

  const prompt = buildAIPrompt(bio, tweetTexts, handle);
  log(`      [AI] Prompt length: ${prompt.length} chars`);

  // Try NVIDIA NIM first
  if(S.nvidia) {
    try {
      log(`      [AI] Calling NVIDIA NIM (${S.nvidiaCustomModel || S.nvidiaModel})...`);
      const result = await callLLM('nvidia', prompt);
      if(result) {
        log(`      [AI] ✓ NVIDIA NIM response received`);
        return { ...result, ai_source:'nvidia_nim' };
      }
    } catch(e) { log(`      [AI] ✗ NVIDIA NIM failed: ${e.message}`, 'warn'); }
  }

  // Fallback: Groq
  if(S.groq) {
    try {
      log(`      [AI] Calling Groq (${S.groqModel})...`);
      const result = await callLLM('groq', prompt);
      if(result) {
        log(`      [AI] ✓ Groq response received`);
        return { ...result, ai_source:'groq' };
      }
    } catch(e) { log(`      [AI] ✗ Groq failed: ${e.message}`, 'warn'); }
  }

  // Fallback 2: Gemini
  if(S.gemini) {
    try {
      log(`      [AI] Calling Gemini (${S.geminiModel})...`);
      const result = await callGemini(prompt);
      if(result) {
        log(`      [AI] ✓ Gemini response received`);
        return { ...result, ai_source:'gemini' };
      }
    } catch(e) { log(`      [AI] ✗ Gemini failed: ${e.message}`, 'warn'); }
  }

  log(`      [AI] ⚠️ All AI APIs failed — AI checks marked MANUAL`, 'warn');
  return { ...defaultResult, ai_source:'none' };
}

function buildAIPrompt(bio, tweets, handle) {
  const tweetText = tweets.slice(0,10).map((t,i)=>`${i+1}. ${t}`).join('\n');
  const customPrompt = (S.promptAnalysis || '').trim();
  if(customPrompt) {
    return customPrompt
      .replace(/{{handle}}/g, handle)
      .replace(/{{bio}}/g, bio || 'N/A')
      .replace(/{{tweets}}/g, tweetText || 'N/A')
      .replace(/{{followers}}/g, '');
  }

  return `You are an expert influencer marketing analyst screening Twitter/X accounts for sponsorship partnerships.

YOUR TASK: Determine if this is a REAL HUMAN PERSONAL ACCOUNT or a fake/AI/theme/agency account.

ACCOUNT TO ANALYZE:
- Username: @${handle}
- Bio: ${bio || 'N/A'}
- Recent posts:
${tweetText || 'N/A'}

Analyze carefully and reply ONLY in valid JSON (no markdown, no explanation):

{
  "is_real_human": true,
  "human_confidence": 85,
  "is_theme_page": false,
  "is_agency_run": false,
  "is_ai_generated_persona": false,
  "sponsored_content_ratio": 15,
  "organic_content_ratio": 85,
  "content_topics": ["startups", "marketing"],
  "posting_pattern": "personal_opinions_and_insights",
  "english_pct": 95,
  "primary_language": "English",
  "niche_score": 8,
  "niche_label": "Startup & Marketing",
  "niche_reasoning": "Posts original insights about building businesses and growth tactics, not just resharing news",
  "bot_confidence": 90,
  "content_quality_score": 7,
  "content_quality_reasoning": "Original thoughts with personal voice, not generic AI-generated threads",
  "audience_likely_english_speaking": true,
  "audience_likely_non_indian": true,
  "audience_reasoning": "Uses US business terminology and references Western startups"
}

SCORING GUIDE:
- human_confidence: 0-100%. Real humans sharing personal experiences = 80-100%. Theme pages/AI personas = 0-40%.
- is_theme_page: true if account only curates content without personal voice.
- is_agency_run: true if bio mentions "DM for promos", "managed by", or only posts sponsored content.
- is_ai_generated_persona: true if content feels templated, generic, or AI-written.
- sponsored_content_ratio: % of posts that are paid promotions (not organic thoughts).
- niche_score: 0-10. Tech, startups, business, e-commerce, marketing, sales = high scores.
- content_quality_score: 0-10. Original insights, personal stories, real opinions = high. Generic threads, only resharing = low.`;
}

async function callLLM(provider, prompt) {
  // Per-model Groq max_tokens caps (must be LESS than context window)
  const groqModelCaps = {
    'llama3-8b-8192': 8000,
    'gemma2-9b-it': 8000,
    'mixtral-8x7b-32768': 16384,
    'llama-3.3-70b-versatile': 32768,
    'llama3-70b-8192': 8000,
    'llama-3.1-8b-instant': 8000,
  };
  const groqCap = groqModelCaps[S.groqModel] || 8000;

  const config = {
    nvidia: {
      url:'/api/nvidia-proxy',
      model: (S.nvidiaCustomModel || S.nvidiaModel || 'meta/llama-3.1-8b-instruct'),
      key: S.nvidia,
      maxTokens: Math.min(S.maxTokens || 400, 16384)
    },
    groq: {
      url:'https://api.groq.com/openai/v1/chat/completions',
      model: S.groqModel || 'llama3-8b-8192',
      key: S.groq,
      maxTokens: Math.min(S.maxTokens || 400, groqCap)
    }
  }[provider];

  if(!config || !config.key) throw new Error('No API key for '+provider);

  log(`      [AI] POST ${config.url} with model ${config.model}`);

  const body = {
    model: config.model,
    messages:[{role:'user',content:prompt}],
    max_tokens: config.maxTokens,
    temperature:0.1
  };

  // Only kimi-k2.6 and deepseek support chat_template_kwargs thinking mode
  if(provider === 'nvidia') {
    body.stream = false;
    const modelName = config.model.toLowerCase();
    if(modelName.includes('deepseek')) {
      body.temperature = 1.0;
      body.top_p = 0.95;
      body.chat_template_kwargs = { thinking: true, reasoning_effort: "high" };
    } else {
      body.top_p = 1.0;
      if(modelName.includes('kimi')) {
        body.chat_template_kwargs = { thinking: false };
      }
    }
  }

  const res = await fetchWithTimeout(config.url, 45000, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Accept':'application/json',
      'Authorization':'Bearer '+config.key
    },
    body: JSON.stringify(body)
  });

  if(!res.ok) {
    const errText = await res.text().catch(()=>'unknown');
    throw new Error(`HTTP ${res.status}: ${errText.slice(0,300)}`);
  }

  const data = await res.json();
  log(`      [AI] Response received, parsing JSON...`);

  const content = data.choices?.[0]?.message?.content || '';
  if(!content) throw new Error('Empty response content');

  return parseAIJSON(content);
}

async function callGemini(prompt) {
  const key = S.gemini;
  const model = S.geminiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const res = await fetchWithTimeout(url, 45000, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{maxOutputTokens: Math.min(S.maxTokens||400, 8192), temperature:0.1}
    })
  });

  if(!res.ok) {
    const err = await res.text().catch(()=>'unknown');
    throw new Error(`HTTP ${res.status}: ${err.slice(0,200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if(!text) throw new Error('Empty Gemini response');

  return parseAIJSON(text);
}

function parseAIJSON(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if(!jsonMatch) {
      log(`      [AI] Raw response: ${content.slice(0,200)}...`, 'warn');
      throw new Error('No JSON object found in response');
    }
    const parsed = JSON.parse(jsonMatch[0]);
    log(`      [AI] JSON parsed successfully`);
    return parsed;
  } catch(e) {
    log(`      [AI] JSON parse error: ${e.message}`, 'warn');
    throw new Error('Invalid JSON in response');
  }
}

// ── RAW TEXT LLM CALLS (for DM generation) ────────────────────
async function callLLMRaw(provider, prompt, maxTok=200) {
  const groqModelCaps = {
    'llama3-8b-8192': 8000, 'gemma2-9b-it': 8000,
    'mixtral-8x7b-32768': 16384, 'llama-3.3-70b-versatile': 32768,
    'llama3-70b-8192': 8000, 'llama-3.1-8b-instant': 8000,
  };
  const config = {
    nvidia: {
      url:'/api/nvidia-proxy',
      model: S.nvidiaCustomModel || S.nvidiaModel || 'meta/llama-3.1-8b-instruct',
      key: S.nvidia, maxTokens: Math.min(maxTok, 4096)
    },
    groq: {
      url:'https://api.groq.com/openai/v1/chat/completions',
      model: S.groqModel || 'llama3-8b-8192',
      key: S.groq, maxTokens: Math.min(maxTok, groqModelCaps[S.groqModel]||8000)
    }
  }[provider];
  if(!config || !config.key) throw new Error('No key');

  const body = { model:config.model, messages:[{role:'user',content:prompt}], max_tokens:config.maxTokens, temperature:0.7 };
  if(provider==='nvidia') {
    body.stream = false;
    const m = config.model.toLowerCase();
    if(m.includes('deepseek')) {
      body.temperature = 1.0;
      body.top_p = 0.95;
      body.chat_template_kwargs = { thinking: true, reasoning_effort: "high" };
    } else {
      body.top_p = 1.0;
      if(m.includes('kimi')) body.chat_template_kwargs = {thinking:false};
    }
  }
  const res = await fetchWithTimeout(config.url, 30000, {
    method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+config.key},
    body: JSON.stringify(body)
  });
  if(!res.ok) { const e=await res.text().catch(()=>''); throw new Error(`HTTP ${res.status}: ${e.slice(0,200)}`); }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function callGeminiRaw(prompt, maxTok=200) {
  const key = S.gemini;
  const model = S.geminiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetchWithTimeout(url, 30000, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{maxOutputTokens:Math.min(maxTok,4096),temperature:0.7}
    })
  });
  if(!res.ok) { const e=await res.text().catch(()=>''); throw new Error(`Gemini HTTP ${res.status}: ${e.slice(0,200)}`); }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if(!text) throw new Error('Empty Gemini response');
  return text.trim();
}

// ── QUALIFICATION CHECKS ──────────────────────────────────────
function runChecks(account) {
  const m = account.metrics || {};
  const ai = account.ai_analysis || {};
  const checks = {};

  // Check 1: Followers
  const fl = account.followers || 0;
  if(fl === 0) {
    checks.followers = { label:'Followers', result:'MANUAL', value:null, reason:'Could not fetch follower count', threshold:`${fmtNum(S.minFollowers)}–${fmtNum(S.maxFollowers)}` };
  } else if(fl < S.minFollowers) {
    checks.followers = { label:'Followers', result:'FAIL', value:fl, reason:`${fmtNum(fl)} below min ${fmtNum(S.minFollowers)}`, threshold:`${fmtNum(S.minFollowers)}–${fmtNum(S.maxFollowers)}` };
  } else if(fl > S.maxFollowers) {
    checks.followers = { label:'Followers', result:'FAIL', value:fl, reason:`${fmtNum(fl)} above max ${fmtNum(S.maxFollowers)}`, threshold:`${fmtNum(S.minFollowers)}–${fmtNum(S.maxFollowers)}` };
  } else {
    checks.followers = { label:'Followers', result:'PASS', value:fl, threshold:`${fmtNum(S.minFollowers)}–${fmtNum(S.maxFollowers)}` };
  }

  // Check 2: Engagement
  const eng = m.engagement_rate_avg || 0;
  if(!account.tweets || account.tweets.length === 0) {
    checks.engagement = { label:'Engagement Rate', result:'MANUAL', value:null, reason:'No tweets to analyze', threshold:`≥${S.minEngagement}%` };
  } else if(eng < S.minEngagement) {
    checks.engagement = { label:'Engagement Rate', result:'FAIL', value:eng, reason:`${eng.toFixed(1)}% below min ${S.minEngagement}%`, threshold:`≥${S.minEngagement}%` };
  } else {
    checks.engagement = { label:'Engagement Rate', result:'PASS', value:eng, threshold:`≥${S.minEngagement}%` };
  }

  // Check 3: Reach (ORIGINAL POSTS ONLY)
  const reach = m.reach_ratio || 0;
  const noViews = account.tweets && account.tweets.length > 0 && account.tweets.every(t=>!(t.views>0));
  if(noViews) {
    checks.reach = { label:'Reach Ratio (Original)', result:'MANUAL', value:null, reason:'View counts unavailable from Nitter — verify manually', threshold:`≥${S.minReach}x` };
  } else if(reach < S.minReach) {
    checks.reach = { label:'Reach Ratio (Original)', result:'FAIL', value:reach, reason:`${reach.toFixed(2)}x below min ${S.minReach}x (reposts excluded)`, threshold:`≥${S.minReach}x` };
  } else {
    checks.reach = { label:'Reach Ratio (Original)', result:'PASS', value:reach, threshold:`≥${S.minReach}x` };
  }

  // Check 4: Checkmark
  checks.checkmark = { label:'Green Checkmark', result:'MANUAL', value:null, reason:`Verify at x.com/${account.handle}`, threshold:'Required' };

  // Check 5: Language
  if(ai.ai_source === 'none') {
    checks.language = { label:'English Content', result:'MANUAL', value:null, reason:'AI unavailable — check manually', threshold:`≥${S.minEnglish}%` };
  } else if((ai.english_pct || 0) < S.minEnglish) {
    checks.language = { label:'English Content', result:'FAIL', value:ai.english_pct, reason:`${ai.english_pct}% English below min ${S.minEnglish}%`, threshold:`≥${S.minEnglish}%` };
  } else {
    checks.language = { label:'English Content', result:'PASS', value:ai.english_pct, threshold:`≥${S.minEnglish}%` };
  }

  // Check 6: Niche
  if(ai.ai_source === 'none') {
    checks.niche = { label:'Niche Match', result:'MANUAL', value:null, reason:'AI unavailable — check manually', threshold:`≥${S.minNiche}/10` };
  } else if((ai.niche_score || 0) < S.minNiche) {
    checks.niche = { label:'Niche Match', result:'FAIL', value:ai.niche_score, reason:`${ai.niche_score}/10 (${ai.niche_label}) below min ${S.minNiche} — need tech/startups/business/marketing`, threshold:`≥${S.minNiche}/10` };
  } else {
    checks.niche = { label:'Niche Match', result:'PASS', value:ai.niche_score, threshold:`≥${S.minNiche}/10` };
  }

  // Check 7: Geography
  checks.geography = { label:'Non-Indian Audience', result:'MANUAL', value:null, reason:'Check SocialBlade for audience geography', threshold:'≥50% non-Indian' };

  // Check 8: Recency
  const days = m.days_since_last_post || 999;
  if(days > S.maxDays) {
    checks.recency = { label:'Post Recency', result:'FAIL', value:days, reason:`Last post ${days} days ago — inactive`, threshold:`≤${S.maxDays} days` };
  } else {
    checks.recency = { label:'Post Recency', result:'PASS', value:days, threshold:`≤${S.maxDays} days` };
  }

  // Check 9: Original Content
  const origPct = m.original_content_pct || 0;
  if(origPct < S.minOriginal) {
    checks.original = { label:'Original Content', result:'FAIL', value:origPct, reason:`${origPct}% original — too many reposts/retweets`, threshold:`≥${S.minOriginal}%` };
  } else {
    checks.original = { label:'Original Content', result:'PASS', value:origPct, threshold:`≥${S.minOriginal}%` };
  }

  // Check 10: Repost Ratio
  const repostPct = m.repost_ratio || 0;
  if(repostPct > S.maxRepost) {
    checks.reposts = { label:'Repost Ratio', result:'FAIL', value:repostPct, reason:`${repostPct}% reposts — account mostly reshares others' content`, threshold:`≤${S.maxRepost}%` };
  } else {
    checks.reposts = { label:'Repost Ratio', result:'PASS', value:repostPct, threshold:`≤${S.maxRepost}%` };
  }

  // Check 11: Human Detection
  if(ai.ai_source === 'none') {
    checks.human = { label:'Real Human Account', result:'MANUAL', value:null, reason:'AI unavailable — verify manually this is a real person', threshold:`≥${S.minHuman}% confidence` };
  } else if(!ai.is_real_human || (ai.human_confidence || 0) < S.minHuman) {
    checks.human = { label:'Real Human Account', result:'FAIL', value:ai.human_confidence, reason:`AI detected as ${ai.is_theme_page?'theme page':ai.is_agency_run?'agency-run':ai.is_ai_generated_persona?'AI persona':'non-human'} (${ai.human_confidence}% confidence)`, threshold:`≥${S.minHuman}% human confidence` };
  } else {
    checks.human = { label:'Real Human Account', result:'PASS', value:ai.human_confidence, threshold:`≥${S.minHuman}%` };
  }

  // Check 12: Sponsored Content
  if(ai.ai_source === 'none') {
    checks.sponsored = { label:'Sponsored Content %', result:'MANUAL', value:null, reason:'AI unavailable — check if only posting promos', threshold:`≤${S.maxSponsored}%` };
  } else if((ai.sponsored_content_ratio || 0) > S.maxSponsored) {
    checks.sponsored = { label:'Sponsored Content %', result:'FAIL', value:ai.sponsored_content_ratio, reason:`${ai.sponsored_content_ratio}% sponsored — only posting paid promotions, no organic value`, threshold:`≤${S.maxSponsored}%` };
  } else {
    checks.sponsored = { label:'Sponsored Content %', result:'PASS', value:ai.sponsored_content_ratio, threshold:`≤${S.maxSponsored}%` };
  }

  // Check 13: Spam/Bot
  const ffRatio = m.follower_following_ratio || 0;
  const spamSignal = ffRatio < (1/S.maxRatio) && account.followers > 0;
  const botSignal = (ai.bot_confidence || 0) < 60 && ai.ai_source !== 'none';
  if(spamSignal || botSignal) {
    const reasons = [];
    if(spamSignal) reasons.push(`Following/follower ratio suspicious (${ffRatio.toFixed(1)})`);
    if(botSignal) reasons.push(`Bot confidence: ${ai.bot_confidence}% human`);
    checks.spam = { label:'Spam / Bot Check', result:'FLAG', value:ai.bot_confidence, reason:reasons.join('; '), threshold:'Human confidence ≥60' };
  } else {
    checks.spam = { label:'Spam / Bot Check', result:'PASS', value:ai.bot_confidence||null, threshold:'Human confidence ≥60' };
  }

  return checks;
}

// ── ERROR ACCOUNT ─────────────────────────────────────────────
function buildErrorAccount(handle, errorMsg) {
  return {
    handle, display_name:handle, bio:'', followers:0, following:0,
    twitter_url:`https://x.com/${handle}`, nitter_url:'',
    fetch_status:'error', fetch_source:'none',
    fetch_timestamp: new Date().toISOString(),
    tweets:[], tweets_raw_count:0, tweets_filtered_count:0,
    metrics:{engagement_rate_avg:0,avg_views:0,reach_ratio:0,posting_frequency_per_week:0,original_content_pct:0,repost_ratio:0,follower_following_ratio:0,days_since_last_post:999,engagement_std_dev:0,has_outlier_tweets:false},
    ai_analysis:{ai_source:'none',is_real_human:false,human_confidence:0,is_theme_page:false,is_agency_run:false,sponsored_content_ratio:0},
    checks:{},
    overall_result:'FAIL',
    fail_reasons:[`Fetch error: ${errorMsg || 'Unknown error'}`],
    needs_manual_review:[],
    user_notes:{status:'',notes:'',starred:false,price_offer:''},
    pdf_filename:`qualifier_${handle}_${new Date().toISOString().slice(0,10)}.pdf`,
    dm_sequence:[], calculated_price:0
  };
}

// ── BATCH CONTROLS ────────────────────────────────────────────
function pauseBatch() {
  isPaused = !isPaused;
  document.getElementById('pauseBtn').textContent = isPaused ? '▶ Resume' : '⏸ Pause';
  log(isPaused ? '⏸ BATCH PAUSED' : '▶ BATCH RESUMED', isPaused?'warn':'success');
}
function stopBatch() {
  stopRequested = true;
  log('⏹ STOP REQUESTED — finishing current account...', 'warn');
}
function retryFailed() {
  queue.filter(q=>q.status==='error').forEach(q=>{ q.status='retry'; q.retries++; });
  startBatch();
}

// ── PROGRESS ──────────────────────────────────────────────────
function updateProgress(done, total) {
  const pct = Math.round(done/total*100);
  document.getElementById('progressFill').style.width = pct+'%';
  document.getElementById('progressPct').textContent = pct+'%';
  document.getElementById('progressLabel').innerHTML = `Processing account <strong>${done}</strong> of <strong>${total}</strong>`;

  const elapsed = Date.now() - (startTime || Date.now());
  if(done > 0 && done < total) {
    const remaining = (elapsed/done)*(total-done);
    document.getElementById('etaText').innerHTML = `ETA: <strong>${fmtDuration(remaining)}</strong>`;
  } else if(done === total) {
    document.getElementById('etaText').innerHTML = `Done in <strong>${fmtDuration(elapsed)}</strong>`;
  }

  const pass = results.filter(r=>r.overall_result==='PASS').length;
  const fail = results.filter(r=>r.overall_result==='FAIL').length;
  document.getElementById('progressStats').textContent = `✅ ${pass} passed · ❌ ${fail} failed`;
}

function updateResultBadges() {
  const pass = results.filter(r=>r.overall_result==='PASS').length;
  const pb = document.getElementById('passBadge');
  if(pass > 0) { pb.textContent=pass; pb.style.display=''; } else pb.style.display='none';
}

// ── LIVE QUEUE RENDER ─────────────────────────────────────────
function renderLiveQueue(currentIdx) {
  const list = document.getElementById('liveQueueList');
  if(!list) return;
  list.innerHTML = queue.map((q,i) => {
    const statusMap = {
      pending:'⏳ Pending',processing:'🔄 Fetching',
      pass:'✅ PASS',fail:'❌ FAIL',manual:'⚠️ MANUAL',
      flagged:'🚩 FLAGGED',error:'💀 Error',
      private:'🔒 Private',retry:'🔁 Retry'
    };
    const cls = q.status;
    const statusClass = {
      pending:'status-pending',processing:'status-processing',
      pass:'status-pass',fail:'status-fail',manual:'status-manual',
      flagged:'status-flagged',error:'status-error',private:'status-private',retry:'status-pending'
    }[q.status] || 'status-pending';

    const isCurrentlyProcessing = q.status === 'processing';
    const canDelete = ['pending','retry'].includes(q.status);
    return `<div class="queue-row ${isCurrentlyProcessing?'processing':cls}">
      <div class="queue-handle"><span>@</span>${escHtml(q.displayHandle || q.handle)}</div>
      ${q.data?.followers ? `<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${fmtNum(q.data.followers)}</span>` : ''}
      <span class="status ${statusClass}">${statusMap[q.status]||q.status}</span>
      ${canDelete ? `<button class="btn btn-danger btn-xs" style="padding:3px 7px;margin-left:4px" onclick="removeFromLiveQueue('${escHtml(q.handle)}')" title="Skip">✕</button>` : ''}
    </div>`;
  }).join('');
}

// ── RESULTS RENDER ────────────────────────────────────────────
function renderResults() {
  const list = document.getElementById('resultsList');
  const empty = document.getElementById('resultsEmpty');
  const statsBar = document.getElementById('statsBar');
  const filterBar = document.getElementById('filterBar');

  if(!results.length) {
    empty.style.display='';
    statsBar.style.display='none';
    filterBar.style.display='none';
    document.getElementById('exportCsvBtn').style.display='none';
    document.getElementById('exportZipBtn').style.display='none';
    document.getElementById('exportJsonBtn').style.display='none';
    document.getElementById('copyPassingBtn').style.display='none';
    return;
  }

  empty.style.display='none';
  statsBar.style.display='grid';
  filterBar.style.display='flex';
  document.getElementById('exportCsvBtn').style.display='';
  document.getElementById('exportZipBtn').style.display='';
  document.getElementById('exportJsonBtn').style.display='';
  const passing = results.filter(r=>r.overall_result==='PASS');
  if(passing.length) document.getElementById('copyPassingBtn').style.display='';

  document.getElementById('statTotal').textContent = results.length;
  document.getElementById('statPass').textContent = results.filter(r=>r.overall_result==='PASS').length;
  document.getElementById('statFail').textContent = results.filter(r=>r.overall_result==='FAIL').length;
  document.getElementById('statManual').textContent = results.filter(r=>r.overall_result==='MANUAL').length;
  document.getElementById('statFlagged').textContent = results.filter(r=>r.overall_result==='FLAGGED').length;

  filterResults(currentFilter);
}

function filterResults(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');

  const filtered = filter === 'all' ? results
    : results.filter(r => r.overall_result.toLowerCase() === filter);

  const list = document.getElementById('resultsList');
  let div = list.querySelector('#accountCards');
  if(!div) { div = document.createElement('div'); div.id='accountCards'; list.appendChild(div); }
  div.innerHTML = filtered.length ? filtered.map(a => renderAccountCard(a)).join('') : '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">No accounts in this category</div></div>';
}

function renderAccountCard(a) {
  const resultCls = (a.overall_result || 'FAIL').toLowerCase();
  const resultLabel = {PASS:'✅ HUMAN + QUALIFIED', FAIL:'❌ NOT QUALIFIED', MANUAL:'⚠️ MANUAL REVIEW', FLAGGED:'🚩 FLAGGED'}[a.overall_result] || a.overall_result;
  const resultClass = {PASS:'status-pass',FAIL:'status-fail',MANUAL:'status-manual',FLAGGED:'status-flagged'}[a.overall_result]||'';

  const avatar = a.profile_image_url
    ? `<img src="${escHtml(a.profile_image_url)}" alt="${escHtml(a.handle)}" onerror="this.style.display='none'">`
    : (a.display_name || a.handle).charAt(0).toUpperCase();

  const humanScore = a.ai_analysis?.human_confidence || 0;
  const humanCls = humanScore >= 80 ? 'high' : humanScore >= 50 ? 'mid' : 'low';
  const humanBadge = a.ai_analysis?.ai_source !== 'none'
    ? `<span class="human-score ${humanCls}">🧑 ${humanScore}% human</span>`
    : '';

  const aiWarning = (a.ai_analysis?.is_ai_generated_persona || a.ai_analysis?.is_theme_page || a.username_ai_keyword)
    ? `<div class="ai-warning">🤖 AI DETECTED: ${a.ai_analysis?.is_theme_page?'Theme page':a.ai_analysis?.is_agency_run?'Agency-run':a.ai_analysis?.is_ai_generated_persona?'AI-generated persona':'AI keyword in username'}</div>`
    : '';

  const priceDisplay = a.calculated_price > 0
    ? `<div class="acct-stat"><strong>$${a.calculated_price}</strong> offer</div>`
    : '';

  const checksHtml = Object.entries(a.checks || {}).map(([key,c]) => {
    const cls = c.result==='PASS'?'pass':c.result==='FAIL'?'fail':c.result==='FLAG'?'flagged':'manual';
    const icon = c.result==='PASS'?'✓':c.result==='FAIL'?'✗':c.result==='FLAG'?'⚠':'?';
    let val = c.value != null ? String(c.value) : '—';
    if(key==='engagement') val = (c.value||0).toFixed(1)+'%';
    else if(key==='reach') val = (c.value||0).toFixed(2)+'x';
    else if(key==='niche') val = c.value+'/10';
    else if(key==='language'||key==='original'||key==='reposts'||key==='sponsored'||key==='human') val = c.value+'%';
    else val = fmtNum(c.value);
    return `<div class="check-item ${cls}">
      <div class="check-label">${escHtml(c.label)}</div>
      <div class="check-value ${cls}">${icon} ${val}</div>
      ${c.reason?`<div class="check-reason">${escHtml(c.reason)}</div>`:''}
    </div>`;
  }).join('');

  const tweetsHtml = (a.tweets || []).length > 0 ? `
    <div style="overflow-x:auto;margin-top:12px;">
      <table class="tweets-table">
        <thead><tr>
          <th>#</th><th>Date</th><th>Views</th><th>Likes</th><th>RTs</th><th>Replies</th><th>Eng%</th>
        </tr></thead>
        <tbody>
          ${a.tweets.slice(0,10).map((t,i)=>`
            <tr>
              <td class="num">${i+1}</td>
              <td>${fmtDate(t.date)}</td>
              <td class="num">${t.views?fmtNum(t.views):'—'}</td>
              <td class="num">${fmtNum(t.likes||0)}</td>
              <td class="num">${fmtNum(t.retweets||0)}</td>
              <td class="num">${fmtNum(t.replies||0)}</td>
              <td class="num" style="color:${(t.engagement_rate||0)>=S.minEngagement?'var(--green)':'var(--text2)'}">${(t.engagement_rate||0).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:500">
            <td colspan="2" style="color:var(--text2)">AVG</td>
            <td class="num">${a.metrics?.avg_views?fmtNum(a.metrics.avg_views):'—'}</td>
            <td class="num">${fmtNum(Math.round((a.tweets||[]).reduce((s,t)=>s+(t.likes||0),0)/Math.max(a.tweets.length,1)))}</td>
            <td class="num">${fmtNum(Math.round((a.tweets||[]).reduce((s,t)=>s+(t.retweets||0),0)/Math.max(a.tweets.length,1)))}</td>
            <td class="num">${fmtNum(Math.round((a.tweets||[]).reduce((s,t)=>s+(t.replies||0),0)/Math.max(a.tweets.length,1)))}</td>
            <td class="num" style="color:var(--blue)">${(a.metrics?.engagement_rate_avg||0).toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  ` : '';

  const aiHtml = a.ai_analysis?.ai_source !== 'none' ? `
    <div class="ai-block">
      <div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-bottom:8px;">🤖 AI HUMAN DETECTION <span style="color:var(--text3);font-size:10px;">(${a.ai_analysis.ai_source})</span></div>
      <div class="ai-grid">
        <div class="ai-item"><div class="ai-item-label">Human Confidence</div><div class="ai-item-val" style="color:${humanScore>=80?'var(--green)':humanScore>=50?'var(--yellow)':'var(--red)'}">${a.ai_analysis.human_confidence||0}%</div></div>
        <div class="ai-item"><div class="ai-item-label">Theme Page?</div><div class="ai-item-val" style="color:${a.ai_analysis.is_theme_page?'var(--red)':'var(--green)'}">${a.ai_analysis.is_theme_page?'YES ✗':'No ✓'}</div></div>
        <div class="ai-item"><div class="ai-item-label">Agency Run?</div><div class="ai-item-val" style="color:${a.ai_analysis.is_agency_run?'var(--red)':'var(--green)'}">${a.ai_analysis.is_agency_run?'YES ✗':'No ✓'}</div></div>
        <div class="ai-item"><div class="ai-item-label">AI Persona?</div><div class="ai-item-val" style="color:${a.ai_analysis.is_ai_generated_persona?'var(--red)':'var(--green)'}">${a.ai_analysis.is_ai_generated_persona?'YES ✗':'No ✓'}</div></div>
        <div class="ai-item"><div class="ai-item-label">Sponsored %</div><div class="ai-item-val">${a.ai_analysis.sponsored_content_ratio||0}%</div></div>
        <div class="ai-item"><div class="ai-item-label">Niche</div><div class="ai-item-val">${escHtml(a.ai_analysis.niche_label||'—')} (${a.ai_analysis.niche_score||0}/10)</div></div>
        <div class="ai-item"><div class="ai-item-label">English %</div><div class="ai-item-val">${a.ai_analysis.english_pct||0}%</div></div>
        <div class="ai-item"><div class="ai-item-label">Content Quality</div><div class="ai-item-val">${a.ai_analysis.content_quality_score||0}/10</div></div>
      </div>
      ${a.ai_analysis.content_quality_reasoning?`<div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:8px;">${escHtml(a.ai_analysis.content_quality_reasoning)}</div>`:''}
      ${a.ai_analysis.niche_reasoning?`<div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:4px;">${escHtml(a.ai_analysis.niche_reasoning)}</div>`:''}
    </div>
  ` : '';

  const manualLinksHtml = (a.needs_manual_review||[]).length > 0 ? `
    <div style="background:var(--yellow-dim);border:1px solid rgba(255,212,0,.3);border-radius:8px;padding:10px;margin-top:10px;">
      <div style="font-family:var(--mono);font-size:11px;color:var(--yellow);margin-bottom:6px;">⚠️ MANUAL CHECKS NEEDED</div>
      <div class="manual-actions">
        <a href="https://x.com/${escHtml(a.handle)}" target="_blank" class="btn btn-warn btn-sm">🔗 Open x.com Profile</a>
        <a href="https://www.socialblade.com/twitter/user/${escHtml(a.handle)}" target="_blank" class="btn btn-warn btn-sm">📊 Social Blade</a>
        <button class="btn btn-success btn-sm" onclick="setManualOverride('${escHtml(a.handle)}','geography','pass');this.textContent='✓ Geography Pass'">✅ Geography Pass</button>
        <button class="btn btn-danger btn-sm" onclick="setManualOverride('${escHtml(a.handle)}','geography','fail');this.textContent='✗ Geography Fail'">❌ Geography Fail</button>
        <button class="btn btn-success btn-sm" onclick="setManualOverride('${escHtml(a.handle)}','checkmark','pass');this.textContent='✓ Checkmark Verified'">✅ Checkmark</button>
      </div>
    </div>
  ` : '';

  const failReasonsHtml = (a.fail_reasons||[]).length > 0 ? `
    <div style="background:var(--red-dim);border:1px solid rgba(244,33,46,.2);border-radius:8px;padding:10px;margin-top:10px;">
      <div style="font-family:var(--mono);font-size:11px;color:var(--red);margin-bottom:4px;">❌ FAIL REASONS</div>
      ${a.fail_reasons.map(r=>`<div style="font-family:var(--mono);font-size:11px;color:var(--text2);margin-top:2px;">• ${escHtml(r)}</div>`).join('')}
    </div>
  ` : '';

  const notesStatus = a.user_notes?.status;

  return `
  <div class="acct-card ${resultCls}" id="card_${escHtml(a.handle)}">
    <div class="acct-header" onclick="toggleCard('${escHtml(a.handle)}')">
      <div class="acct-avatar">${avatar}</div>
      <div class="acct-info">
        <div class="acct-name">${escHtml(a.display_name||a.handle)} ${a.user_notes?.starred?'⭐':''} ${humanBadge}</div>
        <div class="acct-handle">@${escHtml(a.handle)}</div>
        ${a.bio?`<div class="acct-bio">${escHtml(a.bio)}</div>`:''}
        <div class="acct-stats">
          ${a.followers?`<div class="acct-stat"><strong>${fmtNum(a.followers)}</strong> followers</div>`:''}
          ${a.metrics?.engagement_rate_avg?`<div class="acct-stat"><strong>${a.metrics.engagement_rate_avg.toFixed(1)}%</strong> eng</div>`:''}
          ${a.metrics?.reach_ratio?`<div class="acct-stat"><strong>${a.metrics.reach_ratio.toFixed(2)}x</strong> reach</div>`:''}
          ${a.metrics?.original_content_pct?`<div class="acct-stat"><strong>${a.metrics.original_content_pct}%</strong> original</div>`:''}
          ${priceDisplay}
        </div>
      </div>
      <div class="acct-result-badge">
        <span class="status ${resultClass}">${resultLabel}</span>
        ${notesStatus?`<span class="tag" style="font-size:9px">${escHtml(notesStatus)}</span>`:''}
        <div style="display:flex;gap:4px;">
          <button class="btn btn-secondary btn-xs" onclick="event.stopPropagation();downloadAccountPDF('${escHtml(a.handle)}')" title="Download PDF">📄</button>
          ${a.overall_result==='PASS'?`<button class="btn btn-purple btn-xs" onclick="event.stopPropagation();openOutreachModal('${escHtml(a.handle)}')" title="Outreach">💬</button>`:''}
          <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();removeResult('${escHtml(a.handle)}')" title="Remove">🗑</button>
        </div>
        <div class="acct-chevron" id="chevron_${escHtml(a.handle)}">▼</div>
      </div>
    </div>
    <div class="acct-body" id="body_${escHtml(a.handle)}" style="display:none">
      ${aiWarning}
      <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:10px;text-transform:uppercase;letter-spacing:.5px;">Qualification Checks</div>
      <div class="checks-grid">${checksHtml}</div>
      ${failReasonsHtml}
      ${manualLinksHtml}
      ${tweetsHtml}
      ${aiHtml}
      <div class="notes-block">
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Outreach & Pricing</div>
        <div class="notes-row">
          <select class="select" style="flex:1;min-width:0" onchange="updateNotes('${escHtml(a.handle)}','status',this.value)">
            <option value="">— Status —</option>
            <option value="Contacted" ${a.user_notes?.status==='Contacted'?'selected':''}>Contacted</option>
            <option value="In Discussion" ${a.user_notes?.status==='In Discussion'?'selected':''}>In Discussion</option>
            <option value="Deal Closed" ${a.user_notes?.status==='Deal Closed'?'selected':''}>Deal Closed</option>
            <option value="Rejected" ${a.user_notes?.status==='Rejected'?'selected':''}>Rejected</option>
            <option value="On Hold" ${a.user_notes?.status==='On Hold'?'selected':''}>On Hold</option>
          </select>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-family:var(--mono);font-size:11px;color:var(--text3);">$</span>
            <input type="number" class="price-input" placeholder="0" value="${a.user_notes?.price_offer||''}" onblur="updateNotes('${escHtml(a.handle)}','price_offer',this.value)">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="toggleStar('${escHtml(a.handle)}')" id="starBtn_${escHtml(a.handle)}">${a.user_notes?.starred?'★ Starred':'☆ Star'}</button>
        </div>
        <textarea class="textarea" style="min-height:60px;margin-top:6px" placeholder="Add notes... outreach message, response, pricing discussion..." maxlength="500" onblur="updateNotes('${escHtml(a.handle)}','notes',this.value)">${escHtml(a.user_notes?.notes||'')}</textarea>
      </div>
    </div>
  </div>`;
}

function toggleCard(handle) {
  const body = document.getElementById(`body_${handle}`);
  const chevron = document.getElementById(`chevron_${handle}`);
  if(!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if(chevron) chevron.classList.toggle('open', !isOpen);
}

function removeResult(handle) {
  if(!confirm('Remove this account from results?')) return;
  results = results.filter(r=>r.handle!==handle);
  renderResults();
  renderOutreach();
  updateResultBadges();
  toast('Account removed from results');
}

function setManualOverride(handle, field, val) {
  const account = results.find(a=>a.handle===handle);
  if(!account) return;
  if(!account.user_notes) account.user_notes = {};
  account.user_notes[`${field}_override`] = val;
  toast(`${field} marked as ${val}`, 'success');
}

function updateNotes(handle, field, val) {
  const account = results.find(a=>a.handle===handle);
  if(!account) return;
  if(!account.user_notes) account.user_notes = {};
  account.user_notes[field] = val;
  if(field === 'status') {
    const cardEl = document.getElementById(`card_${handle}`);
    if(cardEl) {
      const badge = cardEl.querySelector('.acct-result-badge');
      let tagEl = badge?.querySelector('.tag');
      if(val) {
        if(tagEl) tagEl.textContent=val;
        else if(badge) badge.insertAdjacentHTML('beforeend',`<span class="tag" style="font-size:9px">${escHtml(val)}</span>`);
      } else if(tagEl) tagEl.remove();
    }
  }
}

function toggleStar(handle) {
  const account = results.find(a=>a.handle===handle);
  if(!account) return;
  if(!account.user_notes) account.user_notes = {};
  account.user_notes.starred = !account.user_notes.starred;
  const btn = document.getElementById(`starBtn_${handle}`);
  if(btn) btn.textContent = account.user_notes.starred ? '★ Starred' : '☆ Star';
  toast(account.user_notes.starred ? '⭐ Starred' : 'Star removed');
}

// ── OUTREACH / DM ENGINE ──────────────────────────────────────
function renderOutreach() {
  const passing = results.filter(r=>r.overall_result==='PASS');
  const empty = document.getElementById('outreachEmpty');
  const list = document.getElementById('outreachList');
  const badge = document.getElementById('outreachBadge');

  if(!passing.length) {
    empty.style.display='';
    list.innerHTML='';
    badge.style.display='none';
    return;
  }
  empty.style.display='none';
  badge.textContent = passing.length;
  badge.style.display='';

  list.innerHTML = passing.map(a => `
    <div class="card" style="border-left:3px solid var(--purple);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-weight:700;font-size:14px;">${escHtml(a.display_name||a.handle)} <span style="color:var(--text3);font-size:11px;">@${escHtml(a.handle)}</span></div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:2px;">${fmtNum(a.followers)} followers · $${a.calculated_price} offer</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-purple btn-sm" onclick="openOutreachModal('${escHtml(a.handle)}')">💬 Compose DM</button>
          <a href="https://x.com/${escHtml(a.handle)}" target="_blank" class="btn btn-secondary btn-sm">🔗 Profile</a>
        </div>
      </div>
      ${(a.dm_sequence||[]).length ? `
        <div style="margin-top:10px;font-family:var(--mono);font-size:10px;color:var(--green);">✓ DM sequence generated (${a.dm_sequence.length} messages)</div>
      ` : ''}
    </div>
  `).join('');
}

async function generateAllDMs() {
  const passing = results.filter(r=>r.overall_result==='PASS');
  if(!passing.length) return toast('No qualified accounts to generate DMs for','error');
  toast(`Generating DM sequences for ${passing.length} accounts...`,'success');
  for(const account of passing) {
    try {
      await generateDMSequence(account);
    } catch(e) {
      log(`DM generation failed for @${account.handle}: ${e.message}`, 'error');
    }
  }
  renderOutreach();
  toast('All DM sequences generated ✓','success');
}

function copyAllFirstDMs() {
  const passing = results.filter(r=>r.overall_result==='PASS' && (r.dm_sequence||[]).length>0);
  if(!passing.length) return toast('No DMs generated yet','error');
  const text = passing.map(a => `@${a.handle}:
${a.dm_sequence[0]}
---`).join('\n');
  navigator.clipboard?.writeText(text).then(()=>toast(`Copied ${passing.length} first DMs ✓`,'success')).catch(()=>toast('Copy failed','error'));
}

async function generateDMSequence(account) {
  const handle = account.handle;
  const bio = account.bio || '';
  const niche = account.ai_analysis?.niche_label || 'tech';
  const topic = (account.ai_analysis?.content_topics || [])[0] || 'startups';
  const price = account.calculated_price || getPriceForAccount(account.followers);
  const offer = offers.find(o=>o.isDefault) || offers[0] || {name:'Sponsorship', commissionPct:50};

  const dm1Prompt = (S.promptDM1 || '').trim() || `Write a short, natural, human-toned first DM to @${handle}. They write about ${topic}. Do NOT mention any offer, pricing, sponsorship, or business. Just a genuine conversational hook or compliment about their content. Keep it under 280 characters. No hashtags.`;
  const dm2Prompt = (S.promptDM2 || '').trim() || `Write a short follow-up DM to @${handle}. Softly mention that we build tools in the ${niche} space and ask if they ever partner with products like ours. Still do NOT mention pricing or specific offers. Keep it under 280 characters.`;
  const dm3Prompt = (S.promptDM3 || '').trim() || `Write a short final DM to @${handle}. Now mention our offer: "${offer.name}" with a starting price of $${price}${(offer.commissionPct ? ` + ${offer.commissionPct}% commission` : '')}. Keep it casual, no pressure. Under 280 characters.`;

  const generate = async (prompt) => {
    // Try NVIDIA first
    if(S.nvidia) {
      try {
        const text = await callLLMRaw('nvidia', prompt, 300);
        if(text) return text;
      } catch(e) { log(`DM gen NVIDIA failed: ${e.message}`, 'warn'); }
    }
    // Try Groq
    if(S.groq) {
      try {
        const text = await callLLMRaw('groq', prompt, 300);
        if(text) return text;
      } catch(e) { log(`DM gen Groq failed: ${e.message}`, 'warn'); }
    }
    // Try Gemini
    if(S.gemini) {
      try {
        const text = await callGeminiRaw(prompt, 300);
        if(text) return text;
      } catch(e) { log(`DM gen Gemini failed: ${e.message}`, 'warn'); }
    }
    return 'Hey! Love your content — would love to connect.';
  };

  const dm1 = await generate(dm1Prompt.replace(/\{\{handle\}\}/g,handle).replace(/{{bio}}/g,bio).replace(/{{niche}}/g,niche).replace(/{{topic}}/g,topic));
  const dm2 = await generate(dm2Prompt.replace(/\{\{handle\}\}/g,handle).replace(/{{bio}}/g,bio).replace(/{{niche}}/g,niche).replace(/{{topic}}/g,topic));
  const dm3 = await generate(dm3Prompt.replace(/\{\{handle\}\}/g,handle).replace(/{{price}}/g,price).replace(/{{offerName}}/g,offer.name).replace(/{{commission}}/g,offer.commissionPct));

  account.dm_sequence = [dm1, dm2, dm3];
  return account.dm_sequence;
}

function openOutreachModal(handle) {
  const account = results.find(a=>a.handle===handle);
  if(!account) return;
  if(!account.dm_sequence || !account.dm_sequence.length) {
    toast('Generating DM sequence...','success');
    generateDMSequence(account).then(() => showOutreachModalUI(account)).catch(()=>toast('DM generation failed','error'));
  } else {
    showOutreachModalUI(account);
  }
}

function showOutreachModalUI(account) {
  const body = document.getElementById('outreachModalBody');
  const seq = account.dm_sequence || [];
  body.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-weight:700;font-size:16px;">${escHtml(account.display_name||account.handle)}</div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--text3);">@${escHtml(account.handle)} · $${account.calculated_price} offer</div>
    </div>
    ${seq.map((dm,i)=>`
      <div class="dm-bubble">
        <div class="dm-label">Message ${i+1} ${i===0?'(Hook — NO pricing)':i===1?'(Soft pitch)':'(Offer + Price)'}</div>
        <div class="dm-text">${escHtml(dm)}</div>
        <div class="dm-actions">
          <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${escHtml(dm.replace(/'/g,"\'"))}')">📋 Copy</button>
          ${i===0?`<button class="btn btn-purple btn-sm" onclick="executeOutreach('${escHtml(account.handle)}','${escHtml(dm.replace(/'/g,"\'"))}')">🚀 Send DM 1</button>`:''}
        </div>
      </div>
    `).join('')}
    <div style="display:flex;gap:8px;margin-top:12px;">
      <a href="https://x.com/${escHtml(account.handle)}" target="_blank" class="btn btn-primary" style="flex:1;text-align:center;">🔗 Open x.com Profile</a>
    </div>
  `;
  document.getElementById('outreachModal').classList.add('open');
}

function closeOutreachModal() {
  document.getElementById('outreachModal').classList.remove('open');
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).then(()=>toast('Copied to clipboard ✓','success')).catch(()=>toast('Copy failed','error'));
}

async function executeOutreach(handle, dmText) {
  try {
    await navigator.clipboard.writeText(dmText);
    window.open(`https://x.com/${handle}`, '_blank');
    await logInteraction(handle, dmText);
    toast('DM copied & profile opened ✓','success');
  } catch(e) {
    toast('Outreach action failed: '+e.message,'error');
  }
}

async function logInteraction(handle, dmText) {
  const interaction = {
    id: 'int_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    handle,
    dmText,
    timestamp: new Date().toISOString(),
    batchId
  };
  interactions.unshift(interaction);
  try { await saveInteractionDB(interaction); } catch(e) {}
  renderInteractions();
}

async function renderInteractions() {
  const container = document.getElementById('interactionLog');
  if(!container) return;
  try {
    const dbInts = await loadInteractionsDB();
    const all = [...interactions, ...dbInts.filter(d=>!interactions.find(i=>i.id===d.id))].slice(0,50);
    container.innerHTML = all.length ? all.map(int=>`
      <div class="interaction-log">
        <div class="int-text">@${escHtml(int.handle)} — ${escHtml((int.dmText||'').slice(0,60))}${(int.dmText||'').length>60?'...':''}</div>
        <div class="int-time">${fmtRelDate(int.timestamp)}</div>
      </div>
    `).join('') : '<div style="font-family:var(--mono);font-size:11px;color:var(--text3);">No outreach logged yet.</div>';
  } catch(e) {
    container.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--text3);">No outreach logged yet.</div>';
  }
}

// ── PDF GENERATION ────────────────────────────────────────────
async function downloadAccountPDF(handle) {
  const account = results.find(a=>a.handle===handle);
  if(!account) return;
  toast('Generating PDF...','success');
  try {
    const pdfBlob = await generateAccountPDF(account);
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href=url; a.download=account.pdf_filename;
    a.click(); URL.revokeObjectURL(url);
    toast('PDF downloaded ✓','success');
  } catch(e) {
    toast('PDF error: '+e.message,'error');
  }
}

async function generateAccountPDF(account) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const pageW=595, pageH=842, mg=36;
  let y = mg;

  const blue=[29,155,240], green=[0,186,124], red=[244,33,46], yellow=[255,212,0], orange=[255,107,53];
  const dark=[8,11,18], mid=[19,24,34], text=[231,237,245], dim=[136,150,170];

  doc.setFillColor(...dark);
  doc.rect(0,0,pageW,pageH,'F');

  doc.setFillColor(...mid);
  doc.rect(0,0,pageW,80,'F');

  if(S.logoBase64) {
    try { doc.addImage(S.logoBase64, 'auto', mg, 18, 44, 44); } catch(e){}
  }

  doc.setFont('helvetica','bold');
  doc.setFontSize(14);
  doc.setTextColor(...text);
  doc.text(S.company || 'F12X Human Account Qualifier', S.logoBase64?mg+52:mg, 38);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(...dim);
  doc.text(`Generated: ${new Date().toLocaleDateString()}   Batch: ${batchId}`, S.logoBase64?mg+52:mg, 52);

  y = 96;

  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.setTextColor(...text);
  doc.text(`@${account.handle}`, mg, y);
  doc.setFont('helvetica','normal');
  doc.setFontSize(11);
  doc.setTextColor(...dim);
  if(account.display_name !== account.handle) doc.text(account.display_name, mg, y+16);
  y += 28;

  if(account.bio) {
    doc.setFontSize(10);
    doc.setTextColor(...dim);
    const bioLines = doc.splitTextToSize(account.bio.slice(0,200), pageW-mg*2);
    doc.text(bioLines, mg, y);
    y += bioLines.length * 14 + 8;
  }

  const stats = [
    ['Followers', fmtNum(account.followers)],
    ['Following', fmtNum(account.following)],
    ['Last Post', account.metrics?.days_since_last_post===999?'Unknown':`${account.metrics.days_since_last_post}d ago`],
    ['Posts/Week', (account.metrics?.posting_frequency_per_week||0)+'x'],
    ['Original %', (account.metrics?.original_content_pct||0)+'%'],
    ['Repost %', (account.metrics?.repost_ratio||0)+'%']
  ];
  const statW = (pageW-mg*2)/stats.length;
  stats.forEach(([label,val],i)=>{
    const sx=mg+i*statW;
    doc.setFillColor(...mid);
    doc.roundedRect(sx, y, statW-6, 36, 4, 4, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(...text);
    doc.text(val, sx+(statW-6)/2, y+16, {align:'center'});
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(...dim);
    doc.text(label.toUpperCase(), sx+(statW-6)/2, y+29, {align:'center'});
  });
  y += 48;

  const resultColor = {PASS:green,FAIL:red,MANUAL:yellow,FLAGGED:orange}[account.overall_result]||red;
  doc.setFillColor(...resultColor);
  doc.roundedRect(mg, y, pageW-mg*2, 32, 6, 6, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(14);
  doc.setTextColor(account.overall_result==='FAIL'?255:8, account.overall_result==='FAIL'?255:8, account.overall_result==='FAIL'?255:18);
  const resultText = {PASS:'✅  HUMAN + QUALIFIED',FAIL:'✗  NOT QUALIFIED',MANUAL:'⚠  MANUAL REVIEW NEEDED',FLAGGED:'⚠  FLAGGED - REVIEW'}[account.overall_result];
  doc.text(resultText, pageW/2, y+21, {align:'center'});
  y += 44;

  if(S.pdfIncHuman && account.ai_analysis?.ai_source !== 'none') {
    const humanColor = account.ai_analysis.is_real_human ? green : red;
    doc.setFillColor(...humanColor);
    doc.roundedRect(mg, y, pageW-mg*2, 24, 4, 4, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(account.ai_analysis.is_real_human?8:255, account.ai_analysis.is_real_human?8:255, account.ai_analysis.is_real_human?18:255);
    const humanText = account.ai_analysis.is_real_human
      ? `🧑 REAL HUMAN — ${account.ai_analysis.human_confidence}% confidence | ${account.ai_analysis.sponsored_content_ratio}% sponsored`
      : `🤖 NOT HUMAN — ${account.ai_analysis.is_theme_page?'Theme Page':account.ai_analysis.is_agency_run?'Agency-Run':account.ai_analysis.is_ai_generated_persona?'AI Persona':'Unknown'} (${account.ai_analysis.human_confidence}%)`;
    doc.text(humanText, pageW/2, y+16, {align:'center'});
    y += 32;
  }

  if(Object.keys(account.checks||{}).length > 0) {
    const tableBody = Object.entries(account.checks).map(([key,c])=>{
      let valStr = c.value != null ? String(c.value) : c.result==='MANUAL'?'Manual Check':'—';
      if(key==='engagement') valStr = (c.value||0).toFixed(1)+'%';
      else if(key==='reach') valStr = (c.value||0).toFixed(2)+'x';
      else if(key==='niche') valStr = c.value+'/10';
      else if(key==='language'||key==='original'||key==='reposts'||key==='sponsored'||key==='human') valStr = c.value+'%';
      else valStr = fmtNum(c.value);
      return [c.label, c.threshold||'—', valStr, c.result+(c.reason?` — ${c.reason}`:'')];
    });

    doc.autoTable({
      startY: y,
      head:[['Requirement','Threshold','Your Value','Result']],
      body: tableBody,
      styles:{ font:'helvetica', fontSize:9, textColor:text, fillColor:mid, lineColor:[30,39,56], lineWidth:0.5 },
      headStyles:{ fillColor:[20,31,48], textColor:dim, fontSize:8 },
      bodyStyles:{ fillColor:mid },
      alternateRowStyles:{ fillColor:dark },
      columnStyles:{ 3:{ fontStyle:'bold' } },
      didParseCell:(data)=>{
        if(data.section==='body' && data.column.index===3) {
          const val = data.cell.raw;
          if(val.startsWith('PASS')) data.cell.styles.textColor=green;
          else if(val.startsWith('FAIL')) data.cell.styles.textColor=red;
          else if(val.startsWith('MANUAL')||val.startsWith('FLAG')) data.cell.styles.textColor=yellow;
        }
      },
      margin:{ left:mg, right:mg },
      theme:'grid'
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  if((account.fail_reasons||[]).length) {
    doc.setFillColor(40,12,14);
    doc.roundedRect(mg, y, pageW-mg*2, 16+(account.fail_reasons||[]).length*13, 4, 4, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...red);
    doc.text('FAIL REASONS:', mg+8, y+12);
    doc.setFont('helvetica','normal');
    (account.fail_reasons||[]).forEach((r,i)=>{
      doc.text(`• ${r}`, mg+8, y+12+13*(i+1));
    });
  }

  if((account.tweets||[]).length > 0) {
    doc.addPage();
    doc.setFillColor(...dark);
    doc.rect(0,0,pageW,pageH,'F');

    doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    doc.setTextColor(...text);
    doc.text(`@${account.handle} — Last ${account.tweets.length} Original Posts`, mg, 50);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(...dim);
    doc.text('Retweets & replies excluded from analysis', mg, 64);

    const tweetBody = (account.tweets||[]).map((t,i)=>[
      i+1, fmtDate(t.date), t.views?fmtNum(t.views):'—', fmtNum(t.likes||0), fmtNum(t.retweets||0), fmtNum(t.replies||0), (t.engagement_rate||0).toFixed(1)+'%'
    ]);

    doc.autoTable({
      startY:78,
      head:[['#','Date','Views','Likes','RTs','Replies','Eng%']],
      body:tweetBody,
      styles:{ font:'helvetica', fontSize:9, textColor:text, fillColor:mid },
      headStyles:{ fillColor:[20,31,48], textColor:dim, fontSize:8 },
      alternateRowStyles:{ fillColor:dark },
      columnStyles:{ 2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},5:{halign:'right'},6:{halign:'right',fontStyle:'bold'} },
      margin:{ left:mg, right:mg },
      theme:'grid',
      didParseCell:(data)=>{
        if(data.section==='body' && data.column.index===6) {
          const val = parseFloat(data.cell.raw);
          data.cell.styles.textColor = val>=S.minEngagement ? green : red;
        }
      }
    });

    if(S.pdfIncTweets) {
      let urlY = (doc.lastAutoTable?.finalY || 200) + 16;
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...dim);
      doc.text('Tweet URLs:', mg, urlY);
      urlY += 12;
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      (account.tweets||[]).slice(0,10).forEach((t,i)=>{
        if(urlY > pageH-40) return;
        doc.text(`${i+1}. ${t.url}`, mg, urlY);
        urlY += 11;
      });
    }
  }

  if(S.pdfIncCharts && (account.tweets||[]).length >= 3) {
    doc.addPage();
    doc.setFillColor(...dark);
    doc.rect(0,0,pageW,pageH,'F');

    doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    doc.setTextColor(...text);
    doc.text(`@${account.handle} — Engagement Analytics`, mg, 50);

    const canvas = document.getElementById('offscreenCanvas');
    canvas.width=520;canvas.height=200;

    const engChart = new Chart(canvas.getContext('2d'),{
      type:'bar',
      data:{
        labels:(account.tweets||[]).map((_,i)=>`Post ${i+1}`),
        datasets:[{
          label:'Engagement %',
          data:(account.tweets||[]).map(t=>t.engagement_rate||0),
          backgroundColor:(account.tweets||[]).map(t=>(t.engagement_rate||0)>=S.minEngagement?'rgba(0,186,124,0.8)':'rgba(244,33,46,0.7)'),
          borderRadius:4
        }]
      },
      options:{
        responsive:false, animation:false,
        plugins:{legend:{display:false}},
        scales:{x:{ticks:{color:'#8896aa'},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#8896aa'},grid:{color:'rgba(255,255,255,0.05)'}}}
      }
    });
    await new Promise(r=>setTimeout(r,200));
    doc.addImage(canvas.toDataURL(),'PNG',mg,64,pageW-mg*2,160);
    engChart.destroy();

    if((account.tweets||[]).some(t=>(t.views||0)>0)) {
      canvas.height=180;
      const viewChart = new Chart(canvas.getContext('2d'),{
        type:'line',
        data:{
          labels:(account.tweets||[]).map((_,i)=>`Post ${i+1}`),
          datasets:[{
            label:'Views',
            data:(account.tweets||[]).map(t=>t.views||0),
            borderColor:'rgba(29,155,240,0.9)',
            backgroundColor:'rgba(29,155,240,0.1)',
            fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'rgba(29,155,240,1)'
          }]
        },
        options:{
          responsive:false, animation:false,
          plugins:{legend:{display:false}},
          scales:{x:{ticks:{color:'#8896aa'},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#8896aa'},grid:{color:'rgba(255,255,255,0.05)'}}}
        }
      });
      await new Promise(r=>setTimeout(r,200));
      doc.addImage(canvas.toDataURL(),'PNG',mg,240,pageW-mg*2,140);
      viewChart.destroy();
    }

    const summaryY = 400;
    const boxes = [
      ['Avg Views', account.metrics?.avg_views?fmtNum(account.metrics.avg_views):'N/A'],
      ['Avg Eng %', (account.metrics?.engagement_rate_avg||0).toFixed(2)+'%'],
      ['Reach Ratio', account.metrics?.reach_ratio?(account.metrics.reach_ratio).toFixed(2)+'x':'N/A'],
      ['Posts/Week', (account.metrics?.posting_frequency_per_week||0)+'x'],
      ['Eng Std Dev', account.metrics?.engagement_std_dev||0]
    ];
    const bw = (pageW-mg*2)/boxes.length;
    boxes.forEach(([label,val],i)=>{
      doc.setFillColor(...mid);
      doc.roundedRect(mg+i*bw, summaryY, bw-6, 44, 4, 4, 'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(13);
      doc.setTextColor(...text);
      doc.text(String(val), mg+i*bw+(bw-6)/2, summaryY+18, {align:'center'});
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      doc.setTextColor(...dim);
      doc.text(label.toUpperCase(), mg+i*bw+(bw-6)/2, summaryY+34, {align:'center'});
    });

    if(account.ai_analysis?.ai_source !== 'none') {
      const aiY = summaryY + 60;
      doc.setFont('helvetica','bold');
      doc.setFontSize(10);
      doc.setTextColor(...dim);
      doc.text('AI HUMAN DETECTION ANALYSIS', mg, aiY);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.setTextColor(...text);
      const aiText = [
        `Human: ${account.ai_analysis.is_real_human?'YES ✓':'NO ✗'} (${account.ai_analysis.human_confidence}%)`,
        `Theme Page: ${account.ai_analysis.is_theme_page?'YES ✗':'No ✓'} | Agency: ${account.ai_analysis.is_agency_run?'YES ✗':'No ✓'}`,
        `AI Persona: ${account.ai_analysis.is_ai_generated_persona?'YES ✗':'No ✓'}`,
        `Sponsored: ${account.ai_analysis.sponsored_content_ratio}% | Niche: ${account.ai_analysis.niche_label} (${account.ai_analysis.niche_score}/10)`,
        `English: ${account.ai_analysis.english_pct}%  |  Bot Confidence: ${account.ai_analysis.bot_confidence}% human`,
        `Content Quality: ${account.ai_analysis.content_quality_score}/10 — ${account.ai_analysis.content_quality_reasoning||''}`,
      ].join('\n');
      doc.text(aiText, mg, aiY+14, {lineHeightFactor:1.5});
    }
  }

  return doc.output('blob');
}

// ── CSV EXPORT ────────────────────────────────────────────────
function exportCSV() {
  let data = [...results];
  if(S.csvExport === 'pass') data = data.filter(r=>r.overall_result==='PASS');
  else if(S.csvExport === 'fail') data = data.filter(r=>r.overall_result==='FAIL');

  const rows = data.map(a=>({
    username: a.handle,
    display_name: a.display_name,
    followers: a.followers,
    following: a.following,
    follower_following_ratio: a.metrics?.follower_following_ratio,
    total_tweets_fetched: a.tweets_raw_count,
    original_tweets_analyzed: a.tweets_filtered_count,
    engagement_rate_avg: a.metrics?.engagement_rate_avg,
    avg_views: a.metrics?.avg_views,
    reach_ratio: a.metrics?.reach_ratio,
    days_since_last_post: a.metrics?.days_since_last_post,
    posting_frequency_per_week: a.metrics?.posting_frequency_per_week,
    original_content_pct: a.metrics?.original_content_pct,
    repost_ratio: a.metrics?.repost_ratio,
    calculated_price: a.calculated_price,
    ...(S.csvAiScores?{
      english_pct_ai: a.ai_analysis?.english_pct||'',
      niche_score_ai: a.ai_analysis?.niche_score||'',
      niche_label_ai: a.ai_analysis?.niche_label||'',
      bot_confidence_ai: a.ai_analysis?.bot_confidence||''
    }:{}),
    ...(S.csvHumanScores?{
      is_real_human_ai: a.ai_analysis?.is_real_human||'',
      human_confidence_ai: a.ai_analysis?.human_confidence||'',
      is_theme_page_ai: a.ai_analysis?.is_theme_page||'',
      is_agency_run_ai: a.ai_analysis?.is_agency_run||'',
      is_ai_persona_ai: a.ai_analysis?.is_ai_generated_persona||'',
      sponsored_ratio_ai: a.ai_analysis?.sponsored_content_ratio||''
    }:{}),
    overall_result: a.overall_result,
    ...(S.csvFailReasons?{ fail_reasons: (a.fail_reasons||[]).join('; '), needs_manual_review: (a.needs_manual_review||[]).join('; ') }:{}),
    ...(S.csvPrice?{ price_offer: a.user_notes?.price_offer||'', status: a.user_notes?.status||'' }:{}),
    profile_url_twitter: a.twitter_url,
    pdf_filename: a.pdf_filename,
    batch_id: batchId,
    processed_at: a.fetch_timestamp
  }));

  const csv = Papa.unparse(rows, { delimiter: S.csvSep });
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`f12x_${batchId||'export'}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exported ✓','success');
}

// ── ZIP EXPORT ────────────────────────────────────────────────
async function exportZIP() {
  if(!results.length) return;
  toast('Building ZIP — please wait...','success');
  const zip = new JSZip();
  const pdfFolder = zip.folder('pdfs');

  for(const account of results) {
    try {
      const pdfBlob = await generateAccountPDF(account);
      pdfFolder.file(account.pdf_filename, pdfBlob);
    } catch(e) {
      log(`PDF failed for @${account.handle}: ${e.message}`,'error');
    }
  }

  let csvData = [...results];
  if(S.csvExport === 'pass') csvData = csvData.filter(r=>r.overall_result==='PASS');
  const rows = csvData.map(a=>({
    username:a.handle,
    followers:a.followers,
    engagement:a.metrics?.engagement_rate_avg,
    human_confidence:a.ai_analysis?.human_confidence||'',
    result:a.overall_result,
    fail_reasons:(a.fail_reasons||[]).join('; ')
  }));
  zip.file(`f12x_${batchId||'batch'}.csv`, Papa.unparse(rows));

  const zipBlob = await zip.generateAsync({ type:'blob', compression:'DEFLATE' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href=url; a.download=`f12x_batch_${new Date().toISOString().slice(0,10)}.zip`;
  a.click(); URL.revokeObjectURL(url);
  toast('ZIP downloaded ✓','success');
}

function copyPassingURLs() {
  const passing = results.filter(r=>r.overall_result==='PASS').map(r=>r.twitter_url).join('\n');
  navigator.clipboard?.writeText(passing).then(()=>toast('Copied '+results.filter(r=>r.overall_result==='PASS').length+' URLs ✓','success')).catch(()=>toast('Copy failed — please copy manually'));
}

// ── FULL JSON EXPORT / IMPORT ─────────────────────────────────
function exportFullJSON() {
  const payload = {
    version: 'f12x_v3',
    exported_at: new Date().toISOString(),
    settings: S,
    offers: offers,
    tiers: tiers,
    current_results: results,
    current_queue: queue,
    current_batch_id: batchId,
    interactions: interactions
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`f12x_full_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Full JSON exported ✓','success');
}

function exportSettingsOnly() {
  const exp = {...S};
  delete exp.logoBase64;
  const blob = new Blob([JSON.stringify(exp,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='f12x_settings.json';
  a.click(); URL.revokeObjectURL(url);
}

function importFullJSON() {
  const input = document.createElement('input');
  input.type='file'; input.accept='.json';
  input.onchange = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if(data.settings) {
          S = Object.assign({}, DEFAULTS, data.settings);
          saveSettings();
        }
        if(data.offers) { offers = data.offers; saveOffers(); }
        if(data.tiers) { tiers = data.tiers; saveTiers(); }
        if(data.current_results) { results = data.current_results; renderResults(); }
        if(data.current_queue) {
          // Ensure displayHandle on imported queue items
          queue = (data.current_queue||[]).map(q=>({...q, displayHandle: q.displayHandle || q.handle}));
          renderQueuePreview(); updateQueueBadge();
        }
        if(data.interactions) { interactions = data.interactions; renderInteractions(); }
        if(data.current_batch_id) batchId = data.current_batch_id;
        loadSettingsUI(); // syncs batchPromptBox too
        toast('Full JSON imported successfully ✓','success');
      } catch(err) { toast('Invalid JSON file: '+err.message,'error'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function importSettings(input) {
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    try {
      const imported=JSON.parse(e.target.result);
      S=Object.assign({},S,imported);
      saveSettings(); loadSettingsUI();
      toast('Settings imported ✓','success');
    } catch(err){ toast('Invalid settings file','error'); }
  };
  reader.readAsText(file);
  input.value='';
}

// ── HISTORY ───────────────────────────────────────────────────
async function saveBatch() {
  const batchData = {
    batch_id: batchId,
    created_at: new Date().toISOString(),
    account_count: results.length,
    pass_count: results.filter(r=>r.overall_result==='PASS').length,
    fail_count: results.filter(r=>r.overall_result==='FAIL').length,
    manual_count: results.filter(r=>r.overall_result==='MANUAL').length,
    flagged_count: results.filter(r=>r.overall_result==='FLAGGED').length,
    accounts: results
  };
  try {
    await saveBatchDB(batchData);
    const all = await loadBatchesDB();
    if(all.length > S.maxBatches) {
      const toDelete = all.slice(S.maxBatches);
      for(const b of toDelete) await deleteBatchDB(b.batch_id);
    }
  } catch(e) {
    log('IndexedDB save failed, falling back to localStorage','warn');
    let batches = [];
    try { batches = JSON.parse(localStorage.getItem('tq_batches_fallback')||'[]'); } catch(e2){}
    batches.unshift(batchData);
    if(batches.length > S.maxBatches) batches = batches.slice(0, S.maxBatches);
    try { localStorage.setItem('tq_batches_fallback', JSON.stringify(batches)); } catch(e3){}
  }
  renderHistory();
  updateStorageInfo().catch(()=>{});
}

async function loadBatches() {
  try {
    const dbBatches = await loadBatchesDB();
    if(dbBatches.length) return dbBatches;
  } catch(e) {}
  try {
    return JSON.parse(localStorage.getItem('tq_batches_fallback')||'[]');
  } catch(e){ return []; }
}

async function renderHistory() {
  const batches = await loadBatches();
  const list = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  if(!batches.length) {
    if(empty) empty.style.display='';
    list.innerHTML='<div class="empty" id="historyEmpty"><div class="empty-icon">📂</div><div class="empty-title">No history yet</div><div class="empty-desc">Completed batches are saved to IndexedDB (up to 512MB quota). All data persists locally across sessions.</div></div>';
    return;
  }
  if(empty) empty.style.display='none';

  list.innerHTML = batches.map((b,i)=>`
    <div class="batch-row" onclick="loadBatch('${b.batch_id}')">
      <div class="batch-meta">
        <div>
          <div class="batch-id">📦 ${escHtml(b.batch_id)}</div>
          <div class="batch-date">${fmtRelDate(b.created_at)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="status status-pass" style="font-size:10px">✅ ${b.pass_count}</span>
          <span class="status status-fail" style="font-size:10px">❌ ${b.fail_count}</span>
          ${b.manual_count?`<span class="status status-manual" style="font-size:10px">⚠️ ${b.manual_count}</span>`:''}
          ${b.flagged_count?`<span class="status status-flagged" style="font-size:10px">🚩 ${b.flagged_count}</span>`:''}
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteBatch('${b.batch_id}')" style="min-height:28px;padding:4px 8px;font-size:10px;">🗑</button>
        </div>
      </div>
      <div class="batch-stats">
        <span class="batch-stat" style="color:var(--text2)">${b.account_count} accounts</span>
        <span class="batch-stat" style="color:var(--green)">${Math.round(b.pass_count/Math.max(b.account_count,1)*100)}% pass rate</span>
      </div>
    </div>
  `).join('');
  updateStorageInfo().catch(()=>{});
}

async function loadBatch(id) {
  const batches = await loadBatches();
  const batch = batches.find(b=>b.batch_id===id);
  if(!batch) return;
  results = batch.accounts || [];
  batchId = batch.batch_id;
  renderResults();
  renderOutreach();
  showSection('results', document.getElementById('nav-results'));
  toast(`Loaded batch: ${batch.batch_id}`);
}

async function deleteBatch(id) {
  try { await deleteBatchDB(id); } catch(e) {}
  try {
    let batches = JSON.parse(localStorage.getItem('tq_batches_fallback')||'[]');
    batches = batches.filter(b=>b.batch_id!==id);
    localStorage.setItem('tq_batches_fallback', JSON.stringify(batches));
  } catch(e){}
  renderHistory();
  updateStorageInfo().catch(()=>{});
  toast('Batch deleted');
}

async function clearAllHistory() {
  localStorage.removeItem('f12x_session_backup');
  if(!confirm('Clear all batch history AND interactions? This cannot be undone.')) return;
  try { await clearBatchesDB(); } catch(e){}
  try { await clearInteractionsDB(); } catch(e){}
  try { localStorage.removeItem('tq_batches_fallback'); } catch(e){}
  interactions = [];
  renderHistory();
  renderInteractions();
  updateStorageInfo().catch(()=>{});
  toast('History and interactions cleared');
}

async function updateStorageInfo() {
  try {
    // IndexedDB usage via Storage API
    let usedMB = 0, totalMB = 512;
    if(navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usedMB = parseFloat(((est.usage||0)/1024/1024).toFixed(1));
      totalMB = Math.max(512, parseFloat(((est.quota||0)/1024/1024).toFixed(0)));
    }
    // Also check localStorage size
    let lsBytes = 0;
    try { for(let k in localStorage) { if(localStorage.hasOwnProperty(k)) lsBytes += (localStorage[k]||'').length*2; } } catch(e){}
    const lsKB = Math.round(lsBytes/1024);

    const pct = Math.min(100, parseFloat((usedMB/totalMB*100).toFixed(1)));
    const text = document.getElementById('storageInfo');
    if(text) text.textContent = `IndexedDB: ~${usedMB}MB / 512MB`;
    const usageText = document.getElementById('storageUsageText');
    if(usageText) usageText.textContent = `IndexedDB: ${usedMB}MB used of ~512MB (${pct}%) | localStorage: ${lsKB}KB`;
    const fill = document.getElementById('storageFill');
    if(fill) {
      fill.style.width = pct+'%';
      fill.className = `storage-fill ${pct>80?'danger':pct>60?'warn':''}`;
    }
  } catch(e) {
    // Fallback to localStorage only
    try {
      let total = 0;
      for(let key in localStorage) { if(localStorage.hasOwnProperty(key)) total += (localStorage[key]||'').length*2; }
      const kb = Math.round(total/1024);
      const text = document.getElementById('storageInfo');
      if(text) text.textContent = `localStorage: ~${kb}KB`;
      const usageText = document.getElementById('storageUsageText');
      if(usageText) usageText.textContent = `localStorage: ${kb}KB (IndexedDB storage is handled separately)`;
    } catch(e2){}
  }
}

function nukeAllData() {
  if(!confirm('Delete ALL data including settings, history, interactions, offers, and API keys? This cannot be undone.')) return;
  localStorage.clear();
  clearBatchesDB().catch(()=>{});
  clearInteractionsDB().catch(()=>{});
  location.reload();
}

// ── UI HELPERS ────────────────────────────────────────────────
function showSection(name, btn) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('section-'+name)?.classList.add('active');
  btn?.classList.add('active');
  if(name === 'history') renderHistory();
  if(name === 'outreach') renderOutreach();

  const phaseMap = {input:1, queue:2, results:3, outreach:4, history:4};
  const phase = phaseMap[name] || 1;
  document.querySelectorAll('.phase-step').forEach((el,i)=>{
    el.classList.remove('active','done');
    if(i+1 < phase) el.classList.add('done');
    else if(i+1 === phase) el.classList.add('active');
  });
}

function openSettings() {
  document.getElementById('settingsModal').classList.add('open');
  loadSettingsUI();
  loadNitterList();
  updateStorageInfo().catch(()=>{});
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }
function closeSettingsOutside(e) { if(e.target===document.getElementById('settingsModal')) closeSettings(); }

function switchSettingsTab(name, btn) {
  document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.stab-content').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('stab-'+name)?.classList.add('active');
}

function toggleTheme() {
  S.darkMode = !S.darkMode;
  saveSettings();
  applyTheme();
}
function applyTheme() {
  if(!S.darkMode) {
    document.documentElement.style.setProperty('--bg','#f7f9fc');
    document.documentElement.style.setProperty('--bg2','#eef2f8');
    document.documentElement.style.setProperty('--bg3','#e5eaf2');
    document.documentElement.style.setProperty('--card','#ffffff');
    document.documentElement.style.setProperty('--text','#0f1419');
    document.documentElement.style.setProperty('--text2','#536471');
    document.documentElement.style.setProperty('--border','#cfd9de');
    document.documentElement.style.setProperty('--border2','#b9cad5');
    document.getElementById('themeBtn').textContent='☀️';
  } else {
    document.documentElement.style.setProperty('--bg','#080b12');
    document.documentElement.style.setProperty('--bg2','#0d1118');
    document.documentElement.style.setProperty('--bg3','#12161f');
    document.documentElement.style.setProperty('--card','#131822');
    document.documentElement.style.setProperty('--text','#e7edf5');
    document.documentElement.style.setProperty('--text2','#8896aa');
    document.documentElement.style.setProperty('--border','#1e2738');
    document.documentElement.style.setProperty('--border2','#263045');
    document.getElementById('themeBtn').textContent='🌙';
  }
}

function log(msg, type='info') {
  const box = document.getElementById('logBox');
  if(!box) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  while(box.children.length > 200) box.removeChild(box.firstChild);
}
function clearLog() { document.getElementById('logBox').innerHTML=''; }

function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(()=>el.classList.remove('show'), 2500);
}

function checkOnline() {
  const banner = document.getElementById('offlineBanner');
  if(!navigator.onLine) banner.classList.add('show');
  else banner.classList.remove('show');
  const startBtn = document.getElementById('startBtn');
  if(startBtn) startBtn.disabled = !navigator.onLine;
}

// ── FORMATTERS ────────────────────────────────────────────────
function fmtNum(n) {
  if(n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString();
}
function fmtDate(dateStr) {
  const d = new Date(dateStr);
  if(isNaN(d)) return '—';
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
function fmtRelDate(dateStr) {
  const d = new Date(dateStr);
  const diff = Date.now()-d.getTime();
  const mins=Math.floor(diff/60000), hrs=Math.floor(diff/3600000), days=Math.floor(diff/86400000);
  if(mins<60) return `${mins}m ago`;
  if(hrs<24) return `${hrs}h ago`;
  return `${days}d ago`;
}
function fmtDuration(ms) {
  const s=Math.floor(ms/1000), m=Math.floor(s/60);
  return m>0?`${m}m ${s%60}s`:`${s}s`;
}
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
async function fetchWithTimeout(url, timeout=30000, opts={}) {
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ── KEYBOARD SHORTCUTS ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if(e.key==='Escape') { closeSettings(); closeOutreachModal(); }
  if(e.ctrlKey||e.metaKey) {
    if(e.key===',' ) { e.preventDefault(); openSettings(); }
  }
});

// ── BOOT ──────────────────────────────────────────────────────
init();
