const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

// 1. Proxy /api/nvidia-proxy to the actual NVIDIA API (Matches vercel.json)
app.use('/api/nvidia-proxy', createProxyMiddleware({ 
  target: 'https://integrate.api.nvidia.com/v1/chat/completions',
  changeOrigin: true,
  ignorePath: true 
}));

// 2. Custom local proxy for RSS and HTML (Matches api/proxy.js on Vercel)
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('No URL provided');
  
  try {
    const fetch = require('node-fetch');
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch: ${response.statusText}`);
    }
    
    const text = await response.text();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/plain');
    res.send(text);
  } catch(e) {
    res.status(500).send(e.message);
  }
});

// 3. Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '.')));

app.listen(PORT, () => {
  console.log(`F12X Development Server running at http://localhost:${PORT}`);
  console.log(`Proxying /api/nvidia-proxy -> NVIDIA NIM`);
  console.log(`Proxying /api/proxy?url=... -> Target URLs`);
});
