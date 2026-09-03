# Expense Manager — Personal Monthly Budget & Bills

A progressive web app (PWA) that automates monthly bill tracking and helps you see exactly what you can safely spend today.

**Key features:**
- **Set bills once, use forever**: Define bills across three dimensions (fixed/variable, frequency, payment mode). They generate automatically every month — you never re-enter them.
- **One honest number**: See your safe daily allowance based on actual committed bills, income, and savings targets.
- **Offline-first**: Works offline; syncs when you reconnect.
- **Mobile-first**: Responsive design, installable as a home-screen app.
- **Excel export**: Download months as `.xlsx` with transactions, bills, and summaries.

---

## Quick Start

### Prerequisites

- **Node.js** v24.20.0 (included in `.tools/node`)
- **MongoDB** or **PostgreSQL** (free options below)
- **.env file** with connection strings (see [Environment Setup](#environment-setup))

### 1. Install Dependencies

```bash
npm install
```

This installs packages for all three workspaces: `shared`, `server`, and `client`.

### 2. Environment Setup

Create a `.env` file in the project root:

```env
# Database: choose ONE
DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/expense-manager?retryWrites=true&w=majority
# OR
DATABASE_URL=postgresql://user:password@localhost:5432/expense_manager

# Storage backend: file, mongo, or memory
STORAGE_BACKEND=mongo

# JWT secret (generate a random string)
JWT_SECRET=your-random-secret-key-here-min-32-chars

# Node environment
NODE_ENV=development
```

#### Getting a Free MongoDB Connection String

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Sign up (free tier available)
3. Create a new cluster (free tier)
4. Click "Connect" → "Drivers" → select Node.js
5. Copy the connection string and replace `<password>` and `<username>`
6. Paste into `DATABASE_URL` in your `.env`

**Example:**
```
DATABASE_URL=mongodb+srv://myuser:mypassword@cluster0.abcd1234.mongodb.net/expense-manager?retryWrites=true&w=majority
```

#### Getting a Free PostgreSQL Connection String

1. Go to [Render](https://render.com/) or [Railway.app](https://railway.app/)
2. Create a free PostgreSQL database
3. Copy the connection string provided
4. Paste into `DATABASE_URL` in your `.env`

**Example:**
```
DATABASE_URL=postgresql://user:password@pg-abc123.render.com:5432/expense_manager
```

### 3. Run the Dev Servers

**Terminal 1: Shared + Server** (API at http://localhost:3000)
```bash
npm run dev:server
```

**Terminal 2: Client** (Web UI at http://localhost:5173)
```bash
npm run dev:client
```

The client connects to `http://localhost:3000/api` in development. On other machines on your LAN, use the server's IP address (e.g., `http://192.168.1.100:3000/api`).

### 4. Build for Production

```bash
npm run build
```

Outputs:
- `server/dist/index.js` — Express server
- `client/dist/` — React + Vite static site

Serve the client via the server:
```bash
node server/dist/index.js
```

Then visit `http://localhost:3000` in your browser.

---

## Architecture

```
expense-manager/
├── shared/
│   └── src/
│       ├── data/           # Schema, config, actions (pure functions)
│       ├── engine/         # Bills, budget, savings logic (SRS §11)
│       └── index.js        # Barrel export
├── server/
│   └── src/
│       ├── auth/           # bcryptjs + JWT
│       ├── routes/         # /auth, /budget, /export
│       └── storage/        # Pluggable: file, mongo, memory
├── client/
│   └── src/
│       ├── state/          # React contexts (Auth, Store)
│       ├── views/          # Dashboard, Expenses, Bills, etc.
│       ├── components/     # UI + modals
│       └── lib/            # Utilities (API, money, PWA, routing)
└── .env
```

### Key Design Decisions

1. **Shared Pure Functions**: The entire budgeting engine lives in `shared/src/engine/` and is tested independently. The client and server both use the same logic.
2. **Optimistic Concurrency**: Saves are debounced with a per-user `rev` (revision) integer. A 409 conflict means the server's copy differs; the user can reload or force-push.
3. **One Document Model**: The entire budget is one JSON document saved atomically. No relational transactions needed.
4. **Offline First**: localStorage parks unsaved changes; the service worker caches UI assets.
5. **No UI Framework Bloat**: ~25-line hash router, no Redux, no routing lib. React Hooks + Context for state.

---

## Development

### Run Tests

```bash
npm test
```

Tests live in `shared/src/**/*.test.js` and `server/src/**/*.test.js`. Total: ~160 passing tests covering the engine, auth, and API.

### Linting & Formatting

```bash
npm run lint
npm run format
```

### Understanding the Bill Engine

Bills are defined **once** with three axes:

1. **Amount Type** → `fixed` (same every month) or `variable` (user enters actual)
2. **Frequency** → `monthly`, `quarterly`, `custom` (every N months), or `oneTime`
3. **Payment Mode** → `scheduled` (direct debit, confirmed upfront) or `postpaid` (bill arrives, user confirms)

The `generateBills()` function runs at month open and generates instances. Each instance has:
- A due date
- A provisional amount (estimated from history or definition)
- A status: `PENDING` (awaiting confirmation) or `CONFIRMED` (amount is locked in)

See `shared/src/engine/bills.js` for the full API.

---

## Deployment

### Option 1: Heroku (Free Tier Deprecated)

Use Render, Railway, or Fly.io instead.

### Option 2: Render

1. Push to GitHub
2. Create a new Web Service on [Render](https://render.com/)
3. Connect your GitHub repo
4. Set environment variables (`.env` values)
5. Build command: `npm run build`
6. Start command: `node server/dist/index.js`

### Option 3: Docker

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["node", "server/dist/index.js"]
```

```bash
docker build -t expense-manager .
docker run -p 3000:3000 --env-file .env expense-manager
```

---

## PWA Installation

Once deployed (or on `localhost` over HTTPS in production):

1. Open in a mobile browser or desktop Chrome
2. A banner appears: "Install app"
3. Tap it to add to your home screen
4. The app works offline after the first visit

The service worker caches:
- HTML, CSS, JS
- Icons and manifest
- Recent API responses (for offline fallback)

---

## Features (SRS Compliance)

✅ **§1–4: Scope & Objectives**
- Monthly, per-user budget ledger
- Bill definitions across three axes
- Automated generation

✅ **§5–7: Functional Requirements**
- FR1: One-time setup wizard (income, bills, savings)
- FR8: Log transactions (spend/income), search, category filter
- FR12–13: Dashboard with allowance, bills due, summaries
- FR14: Month close with recovery plan suggestions

✅ **§8: Non-Functional Requirements**
- PWA: offline, installable, mobile-first, one-handed
- Pure engine functions with unit tests
- JSON import/export for backups
- No hardcoding; config-driven

---

## User Guide

### Setting Up

1. **Sign in** or create an account (email + password, bcrypt-hashed)
2. **Setup wizard** (3 steps):
   - Income source and amount
   - Your recurring bills (bills, utilities, subscriptions)
   - Savings & recovery goals (RD, emergency fund)
3. **First month opens** with bills pre-generated

### Monthly Workflow

1. **Dashboard**: See today's safe allowance (updated in real-time as you log entries)
2. **Add expenses**: Tap "Add expense" or go to Spending tab
3. **Confirm bills**: As bills arrive, confirm the actual amount (if postpaid/variable)
4. **Check pace**: Compare daily spend vs. even-pace line
5. **Close month**: At month end, reconcile and choose what to do with surplus/shortfall (sweep to savings, or create recovery plan)
6. **Next month opens** automatically with bills ready

### Exporting Data

- **Excel (.xlsx)**: Go to History, select a month or all, download. Includes transactions, bills, and monthly summaries.
- **JSON backup**: Go to Settings, export full budget as JSON. Use "Import" to restore later.

---

## Security & Privacy

- **Passwords**: Hashed with bcryptjs (also SHA-256 pre-hashed to defeat the 72-byte bcrypt limit)
- **Auth**: Stateless JWT in httpOnly cookie + `Authorization: Bearer` fallback
- **Session expiry**: 30 days (configurable in server)
- **HTTPS**: Required in production
- **Data**: Stored in your own database (MongoDB Atlas or PostgreSQL)

---

## Troubleshooting

### "Cannot reach the server"
- Is the server running? `npm run dev:server`
- Check `http://localhost:3000/api/health` in your browser
- On another machine, use `http://<server-ip>:3000/api/health`

### "Offline" status persists
- Refresh the page (Cmd+R or Ctrl+Shift+R)
- Check browser DevTools → Network
- Restart the server

### Bills not generating
- Ensure at least one bill definition is active
- Check the anchor month is in the past or present
- Months are generated on-demand; revisit the month picker

### "Unsaved changes" after refresh
- Your edits were offline. You'll be asked to restore them.
- Choose "Save them" to push or "Discard" to lose

---

## Contributing

Pull requests welcome. Please:
1. Run tests: `npm test`
2. Lint: `npm run lint`
3. Test the UI in dev mode
4. Write tests for engine changes (SRS §11 requirement)

---

## License

MIT

---

## Support

For bugs, questions, or feature requests, open an issue on GitHub or contact the maintainers.

Happy budgeting! 💰
