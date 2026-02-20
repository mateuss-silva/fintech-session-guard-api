/**
 * Quick API smoke test
 * Run with: node tests/smoke-test.js
 */

const https = require('https');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('🧪 Starting API smoke tests...\n');
  let passed = 0;
  let failed = 0;

  function check(name, condition, data = null) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      if (data) console.log(`     Data:`, data);
      failed++;
    }
  }

  // 1. Health check
  console.log('── Health Check ──');
  const health = await request('GET', '/api/health');
  check('Health returns 200', health.status === 200, health);
  check('Health status healthy', health.body && health.body.status === 'ok', health);

  // 2. Register
  console.log('\n── Registration ──');
  const uniqueEmail = `test-${Date.now()}@test.com`;
  const reg = await request('POST', '/api/auth/register', {
    email: uniqueEmail, password: 'Test12345!', name: 'Test User'
  });
  check('Register returns 201', reg.status === 201, reg);

  const regDup = await request('POST', '/api/auth/register', {
    email: uniqueEmail, password: 'Test12345!', name: 'Test User'
  });
  check('Duplicate register returns 409', regDup.status === 409, regDup);

  // 3. Login
  console.log('\n── Login ──');
  const login = await request('POST', '/api/auth/login', {
    email: 'demo@fintech.com', password: 'Demo@2024!'
  });
  check('Login returns 200', login.status === 200, login);
  check('Login has accessToken', login.body && !!login.body.accessToken, login);
  check('Login has refreshToken', login.body && !!login.body.refreshToken, login);
  check('Login has user info', login.body && !!login.body.user && login.body.user.email === 'demo@fintech.com', login);

  const badLogin = await request('POST', '/api/auth/login', {
    email: 'demo@fintech.com', password: 'wrong'
  });
  check('Bad password returns 401', badLogin.status === 401, badLogin);

  const accessToken = login.body.accessToken;
  const refreshToken = login.body.refreshToken;
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // 4. Portfolio
  console.log('\n── Portfolio ──');
  const portfolio = await request('GET', '/api/portfolio', null, authHeader);
  check('Portfolio returns 200', portfolio.status === 200, portfolio);
  check('Portfolio has assets', portfolio.body.assets && portfolio.body.assets.length > 0, portfolio);
  check('Portfolio has assets returned', portfolio.body.summary && portfolio.body.summary.totalAssets >= 0, portfolio);

  const summary = await request('GET', '/api/portfolio/summary', null, authHeader);
  check('Summary returns 200', summary.status === 200, summary);
  check('Summary has totalInvested', summary.body.summary && summary.body.summary.totalInvested >= 0, summary);

  // 5. Unauthorized access
  console.log('\n── Authorization ──');
  const noAuth = await request('GET', '/api/portfolio');
  check('Portfolio without token returns 401', noAuth.status === 401, noAuth);

  // 6. Token refresh
  console.log('\n── Token Rotation ──');
  const refresh = await request('POST', '/api/auth/refresh', { refreshToken });
  check('Refresh returns 200', refresh.status === 200, refresh);
  check('Refresh has new accessToken', !!refresh.body.accessToken, refresh);
  check('Refresh has new refreshToken', !!refresh.body.refreshToken, refresh);

  // 7. Reuse detection — try old refresh token again
  const reuse = await request('POST', '/api/auth/refresh', { refreshToken });
  check('Reuse detection returns 401', reuse.status === 401, reuse);
  check('Reuse error is TOKEN_REUSE_DETECTED', reuse.body.error === 'TOKEN_REUSE_DETECTED', reuse);

  // 8. Biometric flow — login again since sessions were invalidated
  console.log('\n── Biometric Flow ──');
  const login2 = await request('POST', '/api/auth/login', {
    email: 'demo@fintech.com', password: 'Demo@2024!'
  });
  const auth2 = { Authorization: `Bearer ${login2.body.accessToken}` };

  const challenge = await request('POST', '/api/device/bio/challenge',
    { operationType: 'redeem' }, auth2);
  check('Challenge returns 200', challenge.status === 200, challenge);
  check('Challenge has token', !!challenge.body.challengeToken, challenge);

  const verify = await request('POST', '/api/device/bio/verify', {
    challengeToken: challenge.body.challengeToken, biometricSuccess: true
  }, auth2);
  check('Bio verify returns 200', verify.status === 200, verify);
  check('Bio verified is true', verify.body.verified === true, verify);

  // 9. Sensitive Operations (Redeem no longer actively supported in the API)
  console.log('\n── Sensitive Operations ──');

  // 10. Transaction history
  const history = await request('GET', '/api/transactions/history', null, auth2);
  check('History returns 200', history.status === 200, history);
  check('History has transactions', history.body.transactions && Array.isArray(history.body.transactions), history);

  // 11. Logout
  console.log('\n── Logout ──');
  const logout = await request('POST', '/api/auth/logout',
    { refreshToken: login2.body.refreshToken }, auth2);
  check('Logout returns 200', logout.status === 200, logout);

  const afterLogout = await request('GET', '/api/portfolio', null, auth2);
  check('After logout session invalid', afterLogout.status === 401);

  // Summary
  console.log('\n══════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
