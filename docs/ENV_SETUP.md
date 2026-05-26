ENV setup for developers

Overview

This project uses separate env handling for frontend (Vite) and backend (Node/Express). The repo includes `.env.example` and `frontend/.env.example` as templates. Each developer creates local copies and fills in values.

Quick start for a new developer

1. Clone the repo

```bash
git clone <repo-url>
cd whatsapp-bot
```

2. Backend: copy template and fill secrets

```bash
cp .env.example .env
# open .env and fill in MONGO_URI, JWT_SECRET, R2 keys, etc.
```

3. Frontend: copy public vars

```bash
cp frontend/.env.example frontend/.env.local
# edit frontend/.env.local to set VITE_API_URL and other public values
```

4. Setup local files and start services

```bash
# Backend
npm install
npm run setup
npm run dev:api

# Frontend
cd frontend
npm install
npm run dev
```

Security rules

- Never commit `.env` or `frontend/.env.local`.
- `.env.example` documents required variables only (no secrets).
- Frontend env vars prefixed with `VITE_` are visible in browser DevTools; never store secrets there.
- Rotate keys and store production credentials in a secrets manager (AWS Secrets Manager, GCP Secret Manager, Vault, or Cloud Provider environment settings) for production.

Using `backend/config/env.js`

Example:

```js
// backend/server.js
const env = require('./config/env');
const express = require('express');
const app = express();

app.listen(env.PORT, () => console.log('listening on', env.PORT));
```

Database connection example:

```js
// backend/config/database.js
const mongoose = require('mongoose');
const env = require('./env');

module.exports = async function connect() {
  const opts = { useNewUrlParser: true, useUnifiedTopology: true };
  try {
    await mongoose.connect(env.MONGO_URI, opts);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    // In dev we don't want to crash the process automatically; rethrow for prod
    if (env.NODE_ENV === 'production') throw err;
  }
};

// Example server usage
// const connectDB = require('./config/database');
// const env = require('./config/env');
// connectDB().then(() => app.listen(env.PORT));
```

