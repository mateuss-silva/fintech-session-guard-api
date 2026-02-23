const fs = require('fs');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

function post(path, data) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      agent
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  try {
    console.log('Logging in...');
    const loginRes = await post('/api/auth/login', { email: 'demo@fintech.com', password: 'Demo@2024!', deviceId: 'test-device' });
    console.log(loginRes);

    console.log('Refreshing...');
    const refreshRes = await post('/api/auth/refresh', { refreshToken: loginRes.body.refreshToken, deviceId: 'test-device' });
    console.log(refreshRes);
  } catch (e) {
    console.error(e);
  }
}
test();
