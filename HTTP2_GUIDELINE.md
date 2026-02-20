# Backend Setup

1. **Generate Certificates**
   HTTP/2 requires TLS (HTTPS). We have provided a script to generate a locally trusted self-signed certificate. Run:

   ```bash
   node scripts/generate-certs.js
   ```

   This will create `localhost.key` and `localhost.crt` in the root of the backend folder.

2. **Start the Server**
   Start the backend as usual. It automatically detects the certificates and starts securely over HTTP/2.
   ```bash
   npm run dev
   ```

## Production Setup

In a production environment, self-signed certificates **will trigger security errors** and will not be trusted by mobile devices.

### 1. Backend Production Certificates

You must use a valid SSL/TLS certificate issued by a trusted Certificate Authority (e.g., Let's Encrypt, AWS ACM, Cloudflare).

- **Direct Fastify SSL:** Replace `localhost.key` and `localhost.crt` with the real `privkey.pem` and `fullchain.pem` inside `server.js` options.
- **Reverse Proxy (Recommended Architecture):** Run Fastify internally on HTTP without native SSL, and place it behind a Web Server or Load Balancer (Nginx, AWS ALB). Let the proxy terminate the SSL layer and convert external HTTPS/HTTP2 traffic to internal HTTP.

### 2. Frontend Production Configuration

Remove the development overrides. Fastify instances running with a valid production certificate will automatically be accepted by the Flutter `HttpClient`.

1. Remove or comment out the `HttpOverrides.global = MyHttpOverrides();` inside your `main.dart` when building for Production to ensure standard CA chain verification remains fully active.
