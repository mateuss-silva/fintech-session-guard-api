# 🔐 Fintech Session Guard API

Backend API para aplicação Flutter Fintech de Investimentos com **proteção contra sequestro de sessão**.

Alinhado ao **OWASP Mobile Top 10**, **Princípio de Defesa em Profundidade** e controle de sessão **NIST**.

## Problema

Corretora white-label sofrendo tentativas de account takeover: tokens interceptados em redes públicas, risco de hijacking de sessão.

## Solução

Camada de segurança server-side com múltiplas defesas:

| Camada               | Descrição                                                        |
| -------------------- | ---------------------------------------------------------------- |
| **Token Rotation**   | Access token (15min) + Refresh token (7d) com rotação automática |
| **Reuse Detection**  | Refresh token reusado → invalida TODAS as sessões do usuário     |
| **Session Timeout**  | Expiração por inatividade (configurável, default 15min)          |
| **Device Binding**   | Token vinculado ao device — impede uso em outro dispositivo      |
| **Device Integrity** | Validação de root/jailbreak/emulador no device                   |
| **Biometric Gate**   | Operações sensíveis (resgate, transferência) requerem biometria  |
| **Rate Limiting**    | Global (100/15min), Auth (5/15min), Sensíveis (3/5min)           |
| **Security Headers** | Helmet.js para headers de segurança HTTP                         |

## Quick Start

```bash
# Instalar dependências
npm install

# Rodar o servidor
npm start

# Rodar em modo dev (auto-reload)
npm run dev
```

O servidor roda em `http://localhost:3000`.

### Credenciais Demo

| Campo | Valor              |
| ----- | ------------------ |
| Email | `demo@fintech.com` |
| Senha | `Demo@2024!`       |

## API Endpoints

### Autenticação

```
POST /api/auth/register     → Registro de usuário
POST /api/auth/login        → Login (retorna access + refresh token)
POST /api/auth/refresh      → Rotação de tokens
POST /api/auth/logout       → Logout (revoga tokens)
GET  /api/auth/sessions     → Lista sessões ativas
DELETE /api/auth/sessions/:id → Revoga sessão específica
```

### Portfólio

```
GET /api/portfolio          → Lista ativos
GET /api/portfolio/summary  → Resumo com totais
```

### Transações (requerem biometria)

```
GET  /api/transactions/history  → Histórico
POST /api/transactions/redeem   → Resgate [🔒 biometria]
POST /api/transactions/transfer → Transferência [🔒 biometria]
```

### Dispositivo & Biometria

```
POST /api/device/register      → Registra device
POST /api/device/verify        → Verifica integridade
GET  /api/device/list          → Lista devices
POST /api/device/bio/challenge → Gera desafio biométrico
POST /api/device/bio/verify    → Verifica biometria
```

## Fluxo de Segurança Completo

```
1. Login → access_token + refresh_token
2. Registrar device → device_id
3. Verificar integridade → rooted? blocked
4. Para operações sensíveis:
   a. Solicitar challenge biométrico → challenge_token
   b. Verificar biometria no device → verified
   c. Enviar operação com X-Biometric-Token header
5. Token expira → usar refresh para rotação
6. Reuso de refresh token detectado → ALL sessions revoked
7. Inatividade > 15min → sessão expirada
```

## Configuração (.env)

```env
PORT=3000
JWT_ACCESS_SECRET=your-secret
JWT_REFRESH_SECRET=your-secret
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
SESSION_TIMEOUT_MINUTES=15
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=5
```

## Integração com Flutter

Aponte seu app Flutter para `http://localhost:3000/api` e implemente:

1. **Secure Storage** (Keychain/Keystore) para tokens
2. **Certificate Pinning** na camada HTTP
3. **Biometric Auth** (local_auth) para challenges
4. **Device Info** para fingerprint e integridade
5. **Interceptor HTTP** para token refresh automático

## Stack

- **Node.js** + **Express**
- **SQLite** (better-sqlite3) — zero config
- **JWT** (jsonwebtoken)
- **bcrypt** — hashing de senhas
- **helmet** — security headers
- **cors** + **express-rate-limit**
