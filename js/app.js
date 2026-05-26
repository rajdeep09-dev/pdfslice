// ── RADICAL ACCELERATION: FAIL-FAST ENGINE ───────────────────
async function startBatch() {
  if(!queue.length) return toast('Queue empty','error');
  if(isProcessing) return;

  isProcessing = true;
  results = [];
  showSection('queue', document.getElementById('nav-queue'));
  log('🚀 BATCH STARTED (FAST MODE)', 'step');

  for(let i=0; i<queue.length; i++) {
    const qItem = queue[i];
    qItem.status = 'processing';
    renderLiveQueue();
    
    try {
      const account = await fastQualify(qItem.handle);
      qItem.status = account.overall_result.toLowerCase();
      results.push(account);
      log('✅ @' + account.handle + ' -> ' + account.overall_result, account.overall_result==='PASS'?'success':'error');
    } catch(e) {
      qItem.status = 'error';
      log('❌ @' + qItem.handle + ' -> ERROR: ' + e.message, 'error');
    }
    renderLiveQueue();
    await saveSession();
  }
  isProcessing = false;
  renderResults();
  toast('Batch Complete!');
}

async function fastQualify(handle) {
  if(!S.scrapingdog) throw new Error('ScrapingDog API key required');
  const sdUrl = 'https://api.scrapingdog.com/scrape?api_key=' + S.scrapingdog + '&url=' + encodeURIComponent('https://xcancel.com/' + handle) + '&dynamic=true';
  
  const res = await fetchWithTimeout(sdUrl, 20000);
  if(!res.ok) throw new Error('Scrape failed');
  const html = await res.text();
  
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bio = doc.querySelector('.profile-bio')?.textContent.toLowerCase() || '';
  const followersStr = doc.querySelector('.profile-stat-num')?.textContent.replace(/,/g, '') || '0';
  const followers = parseInt(followersStr) || 0;
  
  const isHuman = !['ai', 'bot', 'gpt', 'crypto', 'nft'].some(k => bio.includes(k));
  const isGoodSize = followers >= S.minFollowers && followers <= S.maxFollowers;
  
  const passed = isHuman && isGoodSize;
  
  return {
    handle,
    followers,
    overall_result: passed ? 'PASS' : 'FAIL',
    checks: {
      human: { label: 'Human Heuristic', result: isHuman ? 'PASS' : 'FAIL', value: isHuman ? 'Natural' : 'Suspicious' },
      size: { label: 'Size', result: isGoodSize ? 'PASS' : 'FAIL', value: fmtNum(followers) }
    }
  };
}

async function saveSession() {
  const data = { queue, results, timestamp: Date.now() };
  await saveSessionDB(data);
}
async function restoreSession() {
  const saved = await loadSessionDB();
  if(saved && (Date.now() - saved.timestamp < 3600000)) {
    queue = saved.queue || [];
    results = saved.results || [];
    renderQueuePreview();
    renderResults();
  }
}
async function init() {
  await initDB();
  await restoreSession();
  showSection('input');
}
document.addEventListener('DOMContentLoaded', init);
