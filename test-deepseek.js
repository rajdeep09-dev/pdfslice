const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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'
      },
      body: JSON.stringify({
        model: "deepseek-ai/deepseek-v4-flash",
        messages: [{"role":"user","content":"Analyze this: it is good. Reply ONLY with JSON: {\"is_real\": true}"}],
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        chat_template_kwargs: {"thinking":true,"reasoning_effort":"high"},
        stream: false
      })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch(e) {
    console.log(e);
  }
}
test();
