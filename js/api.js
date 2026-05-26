// ── RSS FETCH ─────────────────────────────────────────────────
async function fetchRSS(handle) {
  const apiKey = S.rss2json;
  const instances = S.nitterInstances;
  log(`      [RSS] Trying ${instances.length} Nitter instances...`);

  const corsProxies = [
    'https://api.allorigins.win/get?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
  ];

  for(const instance of instances) {
    const base = instance.replace(/^https?:\/\//,'');
    const profileUrl = `https://${base}/${handle}`;
    const rssUrl = `https://${base}/${handle}/rss`;

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

        if(html && html.includes('timeline-item')) {
          const items = parseNitterHTMLTweets(html, handle);
          if(items.length > 0) {
            log(`      [RSS] ✓ HTML scrape from ${base} — ${items.length} items`);
            return { success:true, items, source:base };
          }
        }
      } catch(e) { continue; }
    }

    log(`      [RSS] Trying ${base} via rss2json...`);
    try {
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&api_key=${apiKey}&count=30`;
      const res = await fetchWithTimeout(apiUrl, S.timeout * 1000);
      if(!res.ok) { log(`      [RSS] ${base} HTTP ${res.status}`, 'warn'); continue; }
      const data = await res.json();
      if(data.status !== 'ok' || !data.items) { log(`      [RSS] ${base} invalid response`, 'warn'); continue; }
      if(!data.items.length) { log(`      [RSS] ${base} empty feed`, 'warn'); continue; }

      const items = (data.items || []).map(item => parseTweetItem(item, handle));
      const realItems = items.filter(item => !item._whitelist_blocked);
      if(realItems.length === 0 && items.length > 0) {
        log(`      [RSS] ${base} RSS whitelisted/blocked`, 'warn');
        continue;
      }
      log(`      [RSS] ✓ rss2json from ${base} — ${realItems.length} items`);
      return { success:true, items:realItems, source:base };
    } catch(e) { log(`      [RSS] ✗ ${base} rss2json failed`, 'warn'); }
  }

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
    } catch(e) { log(`      [RSS] ScrapingDog failed`, 'warn'); }
  }

  return { success:false, error:'All RSS fallbacks failed.' };
}

function parseTweetItem(item, handle) {
  try {
    const text = (item.title || '').toString();
    const content = (item.content || '').toString();
    if(text.includes('not yet whitelisted') || content.includes('not yet whitelisted')) return { _whitelist_blocked:true };
    const is_retweet = text.startsWith('RT @');
    const is_reply = text.startsWith('@') && !is_retweet;
    let likes=0, retweets=0, replies=0, views=0;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      doc.querySelectorAll('.tweet-stat, div').forEach(el => {
        const txt = el.textContent || '';
        const num = parseInt((txt.match(/[\d,]+/)||['0'])[0].replace(/,/g,'')) || 0;
        if(el.querySelector('.icon-heart') || txt.includes('❤')) likes = num;
        else if(el.querySelector('.icon-retweet') || txt.includes('🔄')) retweets = num;
        else if(el.querySelector('.icon-comment') || txt.includes('💬')) replies = num;
        else if(el.querySelector('.icon-play') || txt.includes('👁')) views = num;
      });
    } catch(e) {}
    return {
      text: text.replace(/^RT @\w+:\s*/,'').slice(0,280),
      date: item.pubDate || new Date().toISOString(),
      url: (item.link || '').replace(/^https?:\/\/[^/]+/, `https://x.com`),
      likes, retweets, replies, views,
      is_retweet, is_reply, is_quote: false, is_outlier: false,
      engagement_rate: 0
    };
  } catch(e) { return { text:'', engagement_rate:0 }; }
}

function parseNitterHTMLTweets(html, handle) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tweets = [];
    doc.querySelectorAll('.timeline-item, .tweet, article').forEach(item => {
      let textEl = item.querySelector('.tweet-content, .content, .tweet-text');
      if(!textEl) return;
      let text = textEl.textContent.trim();
      let date = new Date().toISOString();
      const dateEl = item.querySelector('.tweet-date a, .date, time');
      if(dateEl) {
        const dateStr = dateEl.getAttribute('title') || dateEl.textContent || dateEl.getAttribute('datetime');
        if(dateStr) {
           const d = new Date(dateStr.replace(/·/g,'').trim());
           if(!isNaN(d)) date = d.toISOString();
        }
      }
      let likes=0, retweets=0, replies=0, views=0;
      item.querySelectorAll('.tweet-stat, .stat').forEach(stat => {
        const txt = stat.textContent.trim().toLowerCase();
        const num = parseInt((txt.match(/[\d,.]+/)||['0'])[0].replace(/,/g,'')) || 0;
        const icon = stat.querySelector('i, span');
        const iconClass = icon ? icon.className : '';
        if(iconClass.includes('heart') || txt.includes('like')) likes = num;
        else if(iconClass.includes('retweet') || txt.includes('retweet')) retweets = num;
        else if(iconClass.includes('comment') || txt.includes('repl')) replies = num;
        else if(iconClass.includes('play') || txt.includes('view')) views = num;
      });
      if(text) tweets.push({ text: text.replace(/^RT @\w+:\s*/, '').slice(0,280), date, url: `https://x.com/${handle}`, likes, retweets, replies, views, is_retweet: text.startsWith('RT @'), is_reply: text.startsWith('@'), is_quote: !!item.querySelector('.quote'), is_outlier: false, engagement_rate: 0 });
    });
    return tweets;
  } catch(e) { return []; }
}

async function fetchProfile(handle, preferredInstance) {
  const instances = [preferredInstance, ...S.nitterInstances.filter(i=>i!==preferredInstance)];
  for(const instance of instances.slice(0,3)) {
    if(!instance) continue;
    const base = instance.replace(/^https?:\/\//,'');
    const profileUrl = `https://${base}/${handle}`;
    const proxyUrls = [`https://api.allorigins.win/get?url=${encodeURIComponent(profileUrl)}`, `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(profileUrl)}` ];
    for(const proxyUrl of proxyUrls) {
      try {
        const res = await fetchWithTimeout(proxyUrl, 15000);
        if(!res.ok) continue;
        const data = await res.json();
        const profile = parseProfileHTML(data.contents || '', handle);
        if(profile.followers > 0 || profile.display_name) return { success:true, ...profile };
      } catch(e) { continue; }
    }
  }
  return { success:false };
}

function parseProfileHTML(html, handle) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const nums = Array.from(doc.querySelectorAll('.profile-stat-num')).map(el => {
      const text = el.textContent.trim().replace(/,/g,'').toUpperCase();
      const mul = text.includes('K') ? 1000 : text.includes('M') ? 1000000 : 1;
      return Math.round(parseFloat(text) * mul) || 0;
    });
    return {
      followers: nums[2] || nums[1] || 0,
      following: nums[1] || 0,
      bio: (doc.querySelector('.profile-bio') || {textContent:''}).textContent.trim(),
      display_name: (doc.querySelector('.profile-card-fullname') || doc.querySelector('h1') || {textContent:handle}).textContent.trim(),
      profile_image_url: (doc.querySelector('.profile-card-avatar img') || {src:''}).src
    };
  } catch(e) { return { followers:0, display_name:handle }; }
}

async function runAIAnalysis(bio, tweetTexts, handle) {
  const defaultResult = { is_real_human: true, human_confidence: 50, is_theme_page: false, is_agency_run: false, is_ai_generated_persona: false, sponsored_content_ratio: 0, english_pct:75, niche_score:5, niche_label:'Unknown', bot_confidence:50, content_quality_score:5, ai_source:'none' };
  if(!S.nvidia && !S.groq && !S.gemini) return defaultResult;
  const prompt = buildAIPrompt(bio, tweetTexts, handle);
  if(S.nvidia) try { const r = await callLLM('nvidia', prompt); if(r) return { ...r, ai_source:'nvidia_nim' }; } catch(e){}
  if(S.groq) try { const r = await callLLM('groq', prompt); if(r) return { ...r, ai_source:'groq' }; } catch(e){}
  if(S.gemini) try { const r = await callGemini(prompt); if(r) return { ...r, ai_source:'gemini' }; } catch(e){}
  return defaultResult;
}

function buildAIPrompt(bio, tweets, handle) {
  const tweetText = tweets.slice(0,10).map((t,i)=>`${i+1}. ${t}`).join('\n');
  const basePrompt = `Analyze if @${handle} is a REAL HUMAN. \nBio: ${bio || 'N/A'}.\nPosts:\n${tweetText}\nReply ONLY in JSON: {"is_real_human":bool, "human_confidence":0-100, "is_theme_page":bool, "is_agency_run":bool, "sponsored_content_ratio":0-100, "niche_score":0-10, "niche_label":"text", "english_pct":0-100, "bot_confidence":0-100, "content_quality_score":0-10}`;
  return S.promptAnalysis ? S.promptAnalysis.replace(/{{handle}}/g, handle).replace(/{{bio}}/g, bio || 'N/A').replace(/{{tweets}}/g, tweetText || 'N/A') : basePrompt;
}

async function callLLM(provider, prompt) {
  const config = {
    nvidia: { url:'/api/nvidia-proxy', model: S.nvidiaCustomModel || S.nvidiaModel, key: S.nvidia },
    groq: { url:'https://api.groq.com/openai/v1/chat/completions', model: S.groqModel, key: S.groq }
  }[provider];
  if(!config.key) throw new Error('Missing key');
  const res = await fetchWithTimeout(config.url, 45000, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.key.trim()}`},
    body: JSON.stringify({ model: config.model, messages:[{role:'user',content:prompt}], max_tokens: parseInt(S.maxTokens) || 400, temperature:0.1 })
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return parseAIJSON(content);
}

async function callGemini(prompt) {
  if(!S.gemini) throw new Error('Missing Gemini key');
  const model = S.geminiModel || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${S.gemini.trim()}`;
  const res = await fetchWithTimeout(url, 45000, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{ maxOutputTokens: parseInt(S.maxTokens)||400, temperature:0.1 } })
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseAIJSON(text);
}

function parseAIJSON(content) {
  try { 
    const match = content.match(/\{[\s\S]*\}/);
    if(!match) throw new Error('No JSON');
    return JSON.parse(match[0]); 
  } catch(e) { throw new Error('Invalid JSON'); }
}

async function callLLMRaw(provider, prompt, maxTok=200) {
  const config = {
    nvidia: { url:'/api/nvidia-proxy', model: S.nvidiaCustomModel || S.nvidiaModel, key: S.nvidia },
    groq: { url:'https://api.groq.com/openai/v1/chat/completions', model: S.groqModel, key: S.groq }
  }[provider];
  if(!config.key) throw new Error('No key');
  const res = await fetchWithTimeout(config.url, 30000, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.key.trim()}`},
    body: JSON.stringify({ model:config.model, messages:[{role:'user',content:prompt}], max_tokens:maxTok, temperature:0.7 })
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function callGeminiRaw(prompt, maxTok=200) {
  if(!S.gemini) throw new Error('No key');
  const model = S.geminiModel || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${S.gemini.trim()}`;
  const res = await fetchWithTimeout(url, 30000, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:maxTok,temperature:0.7} })
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

async function testAPI(name) {
  const dot = document.getElementById(`dot_${name}`);
  if(dot) dot.className = 'api-test-dot testing';
  try {
    let ok = false;
    const key = (S[name] || document.getElementById(`key_${name}`)?.value || '').trim();
    if(!key) throw new Error('No key');
    if(name==='rss2json') { 
      const r=await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://xcancel.com/elonmusk/rss&api_key=${key}&count=1`); 
      ok=r.ok; 
    } else {
      let url = name==='nvidia' ? '/api/nvidia-proxy' : name==='groq' ? 'https://api.groq.com/openai/v1/chat/completions' : `https://generativelanguage.googleapis.com/v1beta/models/${S.geminiModel||'gemini-1.5-flash'}:generateContent?key=${key}`;
      let body = name==='gemini' ? {contents:[{parts:[{text:'hi'}]}]} : {model: name==='nvidia'?S.nvidiaModel:S.groqModel, messages:[{role:'user',content:'hi'}], max_tokens:5};
      let headers = {'Content-Type':'application/json'};
      if(name!=='gemini') headers['Authorization'] = `Bearer ${key}`;
      if(S.corsProxy && !url.startsWith('/')) url = S.corsProxy + encodeURIComponent(url);
      const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
      ok = r.ok;
    }
    if(dot) dot.className = 'api-test-dot ' + (ok?'ok':'fail');
    toast(`${name}: ${ok?'Connected ✓':'Failed ✗'}`, ok?'success':'error');
  } catch(e) { if(dot) dot.className = 'api-test-dot fail'; toast(`${name} test failed`, 'error'); }
}
