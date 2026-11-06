# Show Tracker

Keep track of the TV shows and movies you watch, see what your friends are into, and swap recommendations.

- **Feed**: what your friends started, finished, dropped, or rated.
- **Library**: everything you've logged, grouped by *Watching / Want to watch / Finished / Dropped*, with 1–10 ratings.
- **For you**: recommendations friends sent you, plus titles your friends rated 8+ that you haven't seen.
- **Friends**: shareable invite links (tap, sign in, you're friends) or requests by username.
- **Privacy**: your activity is visible to your friends only, enforced by Postgres row-level security.
- **Sign-in**: Google, passkeys (Face ID / Touch ID / device PIN), or an emailed magic link. No passwords.

Built with Next.js 16 (App Router, Cache Components), Supabase (Postgres + Auth), Tailwind CSS 4, and the TMDB API.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema in `supabase/migrations/`, either with the Supabase CLI (`supabase link` then `supabase db push`) or by pasting the SQL file into the dashboard's SQL editor.
3. **Authentication → URL Configuration**: set the Site URL to your deployed URL and add `http://localhost:3000/**` and `https://<your-domain>/**` to the redirect URLs.
4. **Google sign-in**: create an OAuth client in Google Cloud Console (type *Web application*), add Supabase's callback URL (`https://<project>.supabase.co/auth/v1/callback`) as an authorized redirect URI, then paste the client ID and secret under **Authentication → Providers → Google**.
5. **Passkeys**: enable passkeys in the Auth settings and set the relying party to your app's domain. People add a passkey from **Settings** in the app after their first sign-in.
6. Email magic links work out of the box. For real use, configure custom SMTP, because Supabase's built-in email is heavily rate-limited.

### 2. TMDB

Create a free account at [themoviedb.org](https://www.themoviedb.org/settings/api) and request an API key. Either the v3 API key or the v4 Read Access Token works.

### 3. Environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API keys), and `TMDB_API_KEY`.

### 4. Run

```bash
npm install
npm run dev
```

Deploy to Vercel with the same three environment variables.

## How it fits together

| Path | What it does |
| --- | --- |
| `supabase/migrations/` | Tables, row-level security, and the database functions for friend requests, invites, and friend picks |
| `src/proxy.ts` | Refreshes the session and sends signed-out visitors to `/login` |
| `src/app/actions.ts` | Server Actions for every write (status, rating, recommend, friends, profile) |
| `src/lib/tmdb.ts` | TMDB search, trending, and details, cached with `use cache` |
| `src/app/(app)/` | Signed-in pages: feed, search, library, for you, friends, profiles, invites, settings |

Activity feed events are written by a database trigger whenever someone changes a status or rating. Rapid changes within 10 minutes collapse into one event.

This product uses the TMDB API but is not endorsed or certified by TMDB.
