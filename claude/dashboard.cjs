const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = 8081;

const server = http.createServer((req, res) => {
  let totalAccounts = 0;
  let rateLimitedAccounts = 0;
  let coolingAccounts = 0;
  let disabledAccounts = 0;
  let availableAccounts = 0;

  try {
    const accFile = path.join(os.homedir(), '.config', 'opencode', 'config', 'antigravity-accounts.json');
    if (fs.existsSync(accFile)) {
      const data = JSON.parse(fs.readFileSync(accFile, 'utf8'));
      totalAccounts = data.accounts.length;
      const now = Date.now();
      for (const a of data.accounts) {
        if (a.enabled === false) {
           disabledAccounts++;
        } else if (a.rateLimitResetTimes && a.rateLimitResetTimes.claude && a.rateLimitResetTimes.claude > now) {
           rateLimitedAccounts++;
        } else if (a.coolingDownUntil && a.coolingDownUntil > now) {
           coolingAccounts++;
        } else {
           availableAccounts++;
        }
      }
    }
  } catch(e) {
    console.error('Error reading accounts:', e);
  }

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <title>Antigravity Proxy Dashboard</title>
    <meta http-equiv="refresh" content="5">
    <style>
      body { font-family: -apple-system, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
      .card { background: #161b22; padding: 2rem; border-radius: 8px; border: 1px solid #30363d; max-width: 600px; margin: 0 auto; }
      h1 { color: #58a6ff; margin-top: 0; }
      .metric { font-size: 2.5rem; font-weight: bold; margin-bottom: 0.5rem; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 2rem; }
      .status { font-size: 0.9rem; color: #8b949e; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>⚡ Proxy Pool Status</h1>
      <p>Real-time analytics for your Antigravity Google Accounts. Auto-refreshes every 5s.</p>
      
      <div class="grid">
        <div>
          <div class="metric" style="color: #3fb950;">${availableAccounts}</div>
          <p style="margin: 0; color: #c9d1d9;">Available to Use</p>
        </div>
        <div>
          <div class="metric" style="color: #8b949e;">${totalAccounts}</div>
          <p style="margin: 0; color: #c9d1d9;">Total Accounts</p>
        </div>
        <div>
          <div class="metric" style="color: #f85149;">${rateLimitedAccounts}</div>
          <p style="margin: 0; color: #c9d1d9;">Rate Limited (400s)</p>
        </div>
        <div>
          <div class="metric" style="color: #d29922;">${coolingAccounts}</div>
          <p style="margin: 0; color: #c9d1d9;">Cooling Down (429s)</p>
        </div>
      </div>
      <div class="status">Dashboard running on port ${port}</div>
    </div>
  </body>
  </html>
  `;

  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end(html);
});

server.listen(port, () => console.log('Proxy Dashboard running on http://127.0.0.1:' + port));
