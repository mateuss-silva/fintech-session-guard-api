<h1 align="center">
  <img src="https://raw.githubusercontent.com/fastify/graphics/master/fastify-logo-black.png" height="50" alt="Fastify logo" />
  <br />
  🔐 Fintech Session Guard API
</h1>

<p align="center">
  <b>A highly secure, high-performance HTTP/2 backend built for Flutter Fintech apps.</b><br>
</p>

---

## 🌟 What is this?

This is the backend (the "server") for your Fintech Investment app. It acts as the vault and the brain behind your app. Whenever your Flutter app needs to log a user in, fetch their stock portfolio, or stream real-time prices, it talks to this API.

We built this API using **Node.js** (Javascript running on the server) with a blazing-fast framework called **Fastify**. It is heavily focused on **Security** and protecting against hackers trying to hijack user sessions.

## 🏗️ Architecture & Technology Stack

To make this easy to run on any computer (Windows, Mac, or Linux) without complex setups, we chose the following technologies:

### 1. The Core: Fastify 🚀

Instead of older, slower frameworks like Express, we use **[Fastify](https://fastify.dev/)**. It handles thousands of requests per second with incredibly low memory usage.

- **Why it matters:** Your app's real-time asset streams will be buttery smooth.

### 2. The Network: HTTP/2 🌐

We upgraded this server to speak **HTTP/2**. Older servers use HTTP/1.1, which opens a new connection for every single request (slow!).

- **Why it matters:** HTTP/2 pushes all requests through a _single, multiplexed tunnel_. This makes loading your Flutter screens instant, and allows infinite real-time Server-Sent Events (SSE) for your asset pricing charts without crashing the browser.

### 3. The Database: SQL.js 🗄️

Usually, databases require you to install heavy software like MySQL or PostgreSQL. We used **[sql.js](https://sql.js.org/)** (WebAssembly SQLite).

- **Why it matters:** The database lives entirely inside a simple `.sqlite` file in the project folder. No database installation is required! Just start the server, and the database magically works.

### 4. Security Packages 🛡️

- **`@fastify/helmet`**: Adds invisible security shields (headers) to block cross-site attacks.
- **`@fastify/rate-limit`**: Stops hackers from brute-forcing passwords by limiting how fast they can send requests.
- **`jsonwebtoken` (JWT)**: Creates cryptographic VIP passes so users don't have to send their passwords with every request.

---

## 🔒 Security Features Explained

This API implements **Bank-Grade Defense-in-Depth**:

- ♻️ **Token Rotation**: Users get a short-lived "Access" token (15 mins) and a long-lived "Refresh" token (7 days). If a hacker steals the Access token, it becomes useless quickly.
- 🕵️ **Reuse Detection**: If our server sees two people trying to use the exact same Refresh token, it assumes a theft occurred and **nukes all active sessions** instantly.
- ⏰ **Session Timeout**: If you leave the app idle, the server automatically expires the session.
- 📱 **Device Integrity**: The server checks if the mobile phone is "rooted" or "jailbroken" and blocks it.
- 🔐 **Biometric Gate**: Money-moving operations (like transferring cash) require the user to actively scan their fingerprint/FaceID on the device.

---

## 🚀 How to Run the Server

You only need **Node.js** installed on your computer.

### Step 1: Open the terminal in this folder

Make sure you are inside the `fintech-session-guard-api` folder.

### Step 2: Install the packages

Run this command once to download Fastify and the other tools (they go into a folder called `node_modules`):

```bash
npm install
```

### Step 3: Run the Server

Whenever you want to work on your Flutter app, start the brain by running:

```bash
npm start
```

You will see logging indicating the server is running on `https://localhost:3000`. Keep this terminal window open!

> **💡 Note for Developers:** If you are editing the Javascript code inside the `src` folder, you can run `npm run dev` instead. It will automatically restart the server whenever you save a file!

---

## 🧪 How to Test & See the API Data

You don't need the Flutter app to see what the API does. We installed an interactive testing interface called **Swagger**.

1. Run the server (`npm start`).
2. Open your web browser (Chrome/Edge/Safari).
3. Go to: **`https://localhost:3000/api-docs`**.

Because we use top-tier HTTP/2 encryption, your browser will warn you that the "Connection is not private" (since it's a local computer, not a real website like Google).
👉 Click **Advanced** -> **Proceed to localhost (unsafe)**.

You will now see a beautiful dashboard where you can click on endpoints (like `/api/auth/login`), click **"Try it out"**, enter data, and see the exact real-time responses!

### 🔑 Demo Credentials

Use these to log in via Swagger or your Flutter app:

- **Email:** `demo@fintech.com`
- **Password:** `Demo@2024!`

---

## 📱 Connecting your Flutter App

In your Flutter app, ensure your `ApiConstants.baseUrl` points to the server.

- **For iOS Simulator / Web:** Use `https://127.0.0.1:3000/api` or `https://localhost:3000/api`.
- **For Android Emulator:** Use `https://10.0.2.2:3000/api` (Android has its own internal network).

_Happy coding!_ 🎉
