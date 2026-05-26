// ── CONSTANTS & DEFAULTS ──────────────────────────────────────
const DEFAULTS = {
  rss2json:'', nvidia:'', groq:'', gemini:'', hf:'', scrapingdog:'',
  nvidiaModel:'moonshotai/kimi-k2.6',
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
  promptDM3:'',
  corsProxy: 'https://api.allorigins.win/get?url='
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

// ── STATE ─────────────────────────────────────────────────────
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

// ── FORMATTERS & UTILS ────────────────────────────────────────
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

function normalizeHandle(raw) {
  if(!raw) return { handle:null, display:null };
  raw = String(raw).trim();
  if(!raw) return { handle:null, display:null };
  raw = raw.replace(/[?#].*/,'');
  raw = raw.replace(/\/+$/, '');
  raw = raw.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com|xcancel\.com|nitter\.[^/]+)\//i,'');
  raw = raw.replace(/^https?:\/\//i,'');
  raw = raw.replace(/^@+/,'');
  raw = raw.split('/')[0];
  if(!/^[A-Za-z0-9_]{1,50}$/.test(raw)) return { handle:null, display:null };
  return { handle: raw.toLowerCase(), display: raw };
}

function getPriceForAccount(followers) {
  if(!followers) return 0;
  for(const t of tiers) {
    if(followers >= t.minFollowers && followers <= t.maxFollowers) return t.basePrice;
  }
  return 0;
}
