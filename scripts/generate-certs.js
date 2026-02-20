const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

function generateCerts() {
  console.log('Generating localhost certificates...');

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'countryName', value: 'US' },
    { shortName: 'ST', value: 'Virginia' },
    { name: 'localityName', value: 'Blacksburg' },
    { name: 'organizationName', value: 'Test' },
    { shortName: 'OU', value: 'Test' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([{
    name: 'basicConstraints',
    cA: true
  }, {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }, {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: true,
    emailProtection: true,
    timeStamping: true
  }, {
    name: 'subjectAltName',
    altNames: [{
      type: 2, // DNS
      value: 'localhost'
    }, {
      type: 7, // IP
      ip: '127.0.0.1'
    }]
  }]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const pem_cert = forge.pki.certificateToPem(cert);
  const pem_key = forge.pki.privateKeyToPem(keys.privateKey);

  const rootDir = path.join(__dirname, '..');
  
  fs.writeFileSync(path.join(rootDir, 'localhost.crt'), pem_cert);
  fs.writeFileSync(path.join(rootDir, 'localhost.key'), pem_key);

  console.log('Certificates generated successfully:');
  console.log(`- ${path.join(rootDir, 'localhost.crt')}`);
  console.log(`- ${path.join(rootDir, 'localhost.key')}`);
}

generateCerts();
