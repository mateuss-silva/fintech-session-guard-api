/**
 * Quick API smoke test
 * Run with: node tests/smoke-test.js
 */

const http = require('http');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
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

  function check(name, condition) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      failed++;
    }
  }

  // 1. Health check
  console.log('── Health Check ──');
  const health = await request('GET', '/api/health');
  check('Health returns 200', health.status === 200);
  check('Health status healthy', health.body.status === 'healthy');

  // 2. Register
  console.log('\n── Registration ──');
  const reg = await request('POST', '/api/auth/register', {
    email: 'test@test.com', password: 'Test12345!', name: 'Test User'
  });
  check('Register returns 201', reg.status === 201);

  const regDup = await request('POST', '/api/auth/register', {
    email: 'test@test.com', password: 'Test12345!', name: 'Test User'
  });
  check('Duplicate register returns 409', regDup.status === 409);

  // 3. Login
  console.log('\n── Login ──');
  const login = await request('POST', '/api/auth/login', {
    email: 'demo@fintech.com', password: 'Demo@2024!'
  });
  check('Login returns 200', login.status === 200);
  check('Login has accessToken', !!login.body.accessToken);
  check('Login has refreshToken', !!login.body.refreshToken);
  check('Login has user info', !!login.body.user && login.body.user.email === 'demo@fintech.com');

  const badLogin = await request('POST', '/api/auth/login', {
    email: 'demo@fintech.com', password: 'wrong'
  });
  check('Bad password returns 401', badLogin.status === 401);

  const accessToken = login.body.accessToken;
  const refreshToken = login.body.refreshToken;
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // 4. Portfolio
  console.log('\n── Portfolio ──');
  const portfolio = await request('GET', '/api/portfolio', null, authHeader);
  check('Portfolio returns 200', portfolio.status === 200);
  check('Portfolio has assets', portfolio.body.assets && portfolio.body.assets.length > 0);
  check('Portfolio has 10 assets', portfolio.body.total === 10);

  const summary = await request('GET', '/api/portfolio/summary', null, authHeader);
  check('Summary returns 200', summary.status === 200);
  check('Summary has totalInvested', summary.body.summary && summary.body.summary.totalInvested > 0);

  // 5. Unauthorized access
  console.log('\n── Authorization ──');
  const noAuth = await request('GET', '/api/portfolio');
  check('Portfolio without token returns 401', noAuth.status === 401);

  // 6. Token refresh
  console.log('\n── Token Rotation ──');
  const refresh = await request('POST', '/api/auth/refresh', { refreshToken });
  check('Refresh returns 200', refresh.status === 200);
  check('Refresh has new accessToken', !!refresh.body.accessToken);
  check('Refresh has new refreshToken', !!refresh.body.refreshToken);

  // 7. Reuse detection — try old refresh token again
  const reuse = await request('POST', '/api/auth/refresh', { refreshToken });
  check('Reuse detection returns 401', reuse.status === 401);
  check('Reuse error is TOKEN_REUSE_DETECTED', reuse.body.error === 'TOKEN_REUSE_DETECTED');

  // 8. Biometric flow — login again since sessions were invalidated
  console.log('\n── Biometric Flow ──');
  const login2 = await request('POST', '/api/auth/login', {
    email: 'demo@fintech.com', password: 'Demo@2024!'
  });
  const auth2 = { Authorization: `Bearer ${login2.body.accessToken}` };

  const challenge = await request('POST', '/api/device/bio/challenge',
    { operationType: 'redeem' }, auth2);
  check('Challenge returns 200', challenge.status === 200);
  check('Challenge has token', !!challenge.body.challengeToken);

  const verify = await request('POST', '/api/device/bio/verify', {
    challengeToken: challenge.body.challengeToken, biometricSuccess: true
  }, auth2);
  check('Bio verify returns 200', verify.status === 200);
  check('Bio verified is true', verify.body.verified === true);

  // 9. Redeem with biometric
  console.log('\n── Sensitive Operations ──');
  const redeemNoBio = await request('POST', '/api/transactions/redeem',
    { ticker: 'PETR4', quantity: 10 }, auth2);
  check('Redeem without bio returns 403', redeemNoBio.status === 403);

  // Create new challenge and verify, then redeem
  const ch2 = await request('POST', '/api/device/bio/challenge',
    { operationType: 'redeem' }, auth2);
  await request('POST', '/api/device/bio/verify', {
    challengeToken: ch2.body.challengeToken, biometricSuccess: true
  }, auth2);

  const redeemOk = await request('POST', '/api/transactions/redeem',
    { ticker: 'PETR4', quantity: 10 },
    { ...auth2, 'X-Biometric-Token': ch2.body.challengeToken }
  );
  check('Redeem with bio returns 200', redeemOk.status === 200);
  check('Redeem transaction completed', redeemOk.body.transaction && redeemOk.body.transaction.status === 'completed');

  // 10. Transaction history
  const history = await request('GET', '/api/transactions/history', null, auth2);
  check('History returns 200', history.status === 200);
  check('History has transactions', history.body.transactions && history.body.transactions.length > 0);

  // 11. Logout
  console.log('\n── Logout ──');
  const logout = await request('POST', '/api/auth/logout',
    { refreshToken: login2.body.refreshToken }, auth2);
  check('Logout returns 200', logout.status === 200);

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
