# Vercel Deployment Guide

## ⚠️ Important: Database Migration Required

SQLite won't work on Vercel because:
- Vercel functions are **stateless** and ephemeral
- File system changes don't persist between invocations
- You need a cloud database

## Recommended Options

### Option 1: PostgreSQL (Recommended)
- **Vercel Postgres** - Native integration with Vercel
- **Supabase** - Free tier available, PostgreSQL-based
- **Neon** - Serverless PostgreSQL, free tier included

### Option 2: MongoDB
- **MongoDB Atlas** - Cloud MongoDB, free tier available
- **Firebase** - Real-time database option

### Option 3: Quick Fix (Development Only)
- Keep SQLite locally but use PostgreSQL/MongoDB for production

---

## Step-by-Step Deployment

### 1. Create Vercel Account
```bash
# If not already done
npm i -g vercel
vercel login
```

### 2. Database Setup

#### For PostgreSQL (Supabase Example):
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Get connection string (looks like: `postgresql://user:password@host:5432/db`)

#### For MongoDB (Atlas Example):
1. Go to [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
2. Create a cluster and get connection string

### 3. Install Database Driver

**For PostgreSQL:**
```bash
cd backend
npm install pg
```

**For MongoDB:**
```bash
cd backend
npm install mongoose
```

### 4. Create Vercel Configuration

Create `vercel.json` in project root:

```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": ".",
  "env": {
    "DATABASE_URL": "@database_url",
    "NODE_ENV": "production",
    "SESSION_SECRET": "@session_secret"
  },
  "functions": {
    "backend/**/*.js": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

### 5. Create Backend API Routes for Vercel

Create directory structure:
```
api/
  ├── auth/
  │   ├── login.js
  │   ├── logout.js
  │   └── signup.js
  ├── goals/
  │   ├── [id].js
  │   └── index.js
  ├── checkins/
  │   └── index.js
  └── admin/
      └── index.js
```

Example API function (`api/goals/index.js`):
```javascript
import { getGoals } from '../../backend/routes/goals';

export default async (req, res) => {
  if (req.method === 'GET') {
    return getGoals(req, res);
  }
  res.status(405).json({ error: 'Method not allowed' });
};
```

### 6. Update Environment Variables

Create `.env.production`:
```
DATABASE_URL=postgresql://user:password@host:5432/database
SESSION_SECRET=your-secret-key
NODE_ENV=production
BACKEND_URL=https://your-vercel-domain.vercel.app
```

### 7. Deploy

```bash
# From project root
vercel --prod
```

---

## Database Migration Steps

### From SQLite to PostgreSQL

**Install migration tool:**
```bash
npm install sqlite-to-postgres
```

**Create migration script:**
```javascript
const sqlite3 = require('sqlite3');
const { Pool } = require('pg');

// Export data from SQLite, import to PostgreSQL
```

---

## Frontend Deployment

The frontend (HTML/CSS/JS) can be:
1. **Served by backend** (current setup) - Deploy together
2. **Deployed separately** to Vercel as static site

For separate deployment, create in `frontend/` root:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

---

## Environment Variables on Vercel

Set in Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `NODE_ENV=production`
   - Any other secrets

---

## Troubleshooting

### "Module not found" errors
- Run `npm install` in both `backend/` and `frontend/`
- Check `package.json` entries

### Database connection fails
- Verify `DATABASE_URL` is correct
- Check firewall/IP whitelist on database provider
- Test locally first: `DATABASE_URL=... npm start`

### Session not persisting
- Use server-side session store (Redis, Memcached, or DB-backed sessions)
- Install: `npm install connect-pg-simple` (for PostgreSQL)

---

## Recommended Next Steps

1. **Choose a database** (PostgreSQL via Supabase recommended)
2. **Set up database migration**
3. **Refactor backend for serverless** (if needed)
4. **Add Vercel configuration files**
5. **Deploy and test**

For questions, consult:
- [Vercel Node.js Documentation](https://vercel.com/docs/functions/nodejs)
- [Supabase Docs](https://supabase.com/docs)
