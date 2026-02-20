const http = require('http');

const ticker = process.argv[2] || 'PETR4';
const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/api/market/instruments/${ticker}/stream`,
  method: 'GET',
};

console.log(`Connecting to stream for ${ticker}...`);

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
