# Trading Dashboard — Migrated from Base44 to Supabase + Anthropic Proxy

## What was migrated
- @base44/sdk replaced with @supabase/supabase-js (database)
- base44.integrations.Core.InvokeLLM() now routes through a local/server-side Anthropic proxy
- Auth simplified — no login required

---

## Step 1 — Set up Supabase database

1. Go to supabase.com and open your project
2. Click SQL Editor → New Query
3. Paste the contents of supabase/setup.sql
4. Click Run

---

## Step 2 — Run locally

npm install
npm run dev

Then open http://localhost:5173

Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

---

## Step 3 — Deploy to Vercel (free)

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import your repo
3. Add environment variables in Vercel settings:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - ANTHROPIC_API_KEY
4. Deploy!

The .env file is already configured for local development.
