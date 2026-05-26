const fs = require('fs');

let html = fs.readFileSync('../f12x-v4-fixed.html', 'utf8');

// 1. CSS Extraction
const cssStart = html.indexOf('<style>');
const cssEnd = html.indexOf('</style>');
fs.mkdirSync('css', { recursive: true });
fs.writeFileSync('css/style.css', html.substring(cssStart + 7, cssEnd));
html = html.substring(0, cssStart) + '<link rel="stylesheet" href="css/style.css">' + html.substring(cssEnd + 8);

// 2. JS Extraction
const jsStart = html.lastIndexOf('<script>');
const jsEnd = html.lastIndexOf('</script>');
let js = html.substring(jsStart + 8, jsEnd);

// ---- APPLY BUG FIXES TO JS ----

// A. NVIDIA CORS Fix
js = js.replace(/https:\/\/integrate\.api\.nvidia\.com\/v1\/chat\/completions/g, "/api/nvidia-proxy");

// B. Gemini Payload Structure Fix
js = js.replace(/contents:\[\{role:'user',parts:\[\{text:/g, "contents:[{parts:[{text:");

// C. AI Keyword False Positive Fix (haider__anis)
js = js.replace(
  "const hasAiKeyword = aiKeywords.some(kw => usernameLower.includes(kw));", 
  "const handleParts = handle.toLowerCase().split(/[^a-z0-9]/);\n  const hasAiKeyword = handleParts.some(part => aiKeywords.includes(part));"
);

// D. Session Auto-Save (Refresh Persistence) Fix
js = js.replace(
  "results.push(account);", 
  "results.push(account);\n      try { localStorage.setItem('f12x_session_backup', JSON.stringify({queue, results, batchId})); } catch(e){}"
);
js = js.replace(
  "async function init() {", 
  "async function init() {\n  try { const backup = JSON.parse(localStorage.getItem('f12x_session_backup')); if(backup && backup.results) { queue = backup.queue; results = backup.results; batchId = backup.batchId; renderQueuePreview(); renderResults(); } } catch(e){}"
);
js = js.replace(
  "function clearAllHistory() {", 
  "function clearAllHistory() {\n  localStorage.removeItem('f12x_session_backup');"
);

// E. Nitter HTML Scraper Enhancements (Dates & Views)
const oldNitterStats = `      let likes=0, retweets=0, replies=0, views=0;
      item.querySelectorAll('.tweet-stat, .stat').forEach(stat => {
        const num = parseInt((stat.textContent.match(/[\\d,]+/)||['0'])[0].replace(/,/g,'')) || 0;
        if(stat.querySelector('.icon-heart')) likes = num;
        else if(stat.querySelector('.icon-retweet')) retweets = num;
        else if(stat.querySelector('.icon-comment')) replies = num;
        else if(stat.querySelector('.icon-play')) views = num;
      });`;
      
const newNitterStats = `      let likes=0, retweets=0, replies=0, views=0;
      item.querySelectorAll('.tweet-stat, .stat').forEach(stat => {
        const txt = stat.textContent.trim().toLowerCase();
        const num = parseInt((txt.match(/[\\d,.]+/)||['0'])[0].replace(/,/g,'')) || 0;
        const icon = stat.querySelector('i, span');
        const iconClass = icon ? icon.className : '';
        if(iconClass.includes('heart') || txt.includes('like')) likes = num;
        else if(iconClass.includes('retweet') || txt.includes('retweet')) retweets = num;
        else if(iconClass.includes('comment') || txt.includes('repl')) replies = num;
        else if(iconClass.includes('play') || txt.includes('view')) views = num;
      });`;

const oldNitterDate = `      let date = new Date().toISOString();
      const dateEl = item.querySelector('.tweet-date a, .date, time');
      if(dateEl) {
        const d = new Date(dateEl.getAttribute('title') || dateEl.textContent || dateEl.getAttribute('datetime'));
        if(!isNaN(d)) date = d.toISOString();
      }`;

const newNitterDate = `      let date = new Date().toISOString();
      const dateEl = item.querySelector('.tweet-date a, .date, time');
      if(dateEl) {
        const dateStr = dateEl.getAttribute('title') || dateEl.textContent || dateEl.getAttribute('datetime');
        if(dateStr) {
           const d = new Date(dateStr.replace(/·/g,'').trim());
           if(!isNaN(d)) date = d.toISOString();
        }
      }`;

js = js.replace(oldNitterStats, newNitterStats);
js = js.replace(oldNitterDate, newNitterDate);

// Remove the old script block from HTML
fs.mkdirSync('js', { recursive: true });
fs.writeFileSync('js/main.js', js);
html = html.substring(0, jsStart) + html.substring(jsEnd + 9);

// 3. Extract HTML Sections into 'pages' directory
const sections = ['input', 'queue', 'results', 'outreach', 'history'];
fs.mkdirSync('pages', { recursive: true });

for (const sec of sections) {
    const idStr1 = `id="section-${sec}"`;
    const activeIdx = html.indexOf(`<div class="section active" ${idStr1}>`);
    const inactiveIdx = html.indexOf(`<div class="section" ${idStr1}>`);
    const startIdx = Math.max(activeIdx, inactiveIdx);
    
    if (startIdx === -1) continue;
    
    const nextHeaderIdx = html.indexOf('<!-- ══════', startIdx);
    const secHtml = html.substring(startIdx, nextHeaderIdx).trim();
    fs.writeFileSync(`pages/${sec}.html`, secHtml);
    
    // Replace original section with a mounting div
    html = html.substring(0, startIdx) + `<div id="mount-${sec}"></div>\n` + html.substring(nextHeaderIdx);
}

// ---- APPLY HTML UI FIXES ----
// Fix iOS autocapitalize/autocorrect mangling API keys
html = html.replace(/<input type="password"/g, '<input type="password" autocapitalize="off" autocomplete="off" spellcheck="false" autocorrect="off"');

// Add Bootloader script to index.html to inject components and load main.js
const bootloader = `
<script>
  async function loadApp() {
    const sections = ['input', 'queue', 'results', 'outreach', 'history'];
    for(const sec of sections) {
      const res = await fetch('pages/' + sec + '.html');
      const text = await res.text();
      const mount = document.getElementById('mount-' + sec);
      if(mount) mount.outerHTML = text;
    }
    
    const script = document.createElement('script');
    script.src = 'js/main.js';
    document.body.appendChild(script);
  }
  loadApp();
</script>
`;
html = html.replace('</body>', bootloader + '\n</body>');

// Finally, write index.html
fs.writeFileSync('index.html', html);