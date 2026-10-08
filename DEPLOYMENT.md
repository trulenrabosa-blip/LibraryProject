# Deployment Guide

This is a static site (HTML/CSS/JS, no build step) with Supabase as the
backend. Any static host works. Three concrete options below, then one
Supabase-side step that applies **no matter which host you pick** and is
the most common thing people forget.

---

## Option A — Netlify (drag and drop, easiest)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag this entire folder onto the page
3. Netlify gives you a URL like `https://random-name-123.netlify.app`
4. (Optional) Site settings → Domain management → add a custom domain

## Option B — Vercel

1. `npm install -g vercel` (one-time)
2. From this folder: `vercel --prod`
3. Follow the prompts — no build command needed, it's already static

## Option C — GitHub Pages

1. Push this folder to a GitHub repository
2. Repo Settings → Pages → Source: deploy from a branch → select `main` (or `master`) and `/ (root)`
3. Your site is live at `https://<username>.github.io/<repo-name>/`
   - Note the subpath — if your repo isn't named to serve from the domain
     root, double-check that relative links (all of them, in this project)
     still resolve correctly under that subpath. They should, since every
     link here is relative (`login.html`, not `/login.html`) — but `index.html`,
     `auth_service.js`, and a few others use root-relative paths internally.
     If you deploy under a subpath, search each file for a leading `/` in
     redirect/navigation code and adjust, or deploy to a custom domain root
     instead to avoid this entirely.

---

## The step that applies to every host: Supabase redirect URLs

`login.html` → forgot password → `sendPasswordReset()` in `auth_service.js`
builds its redirect link from `window.location.origin` — which becomes your
live domain once deployed, not `localhost`. Supabase requires that domain to
be explicitly allow-listed, or the email link will fail.

**Before testing password reset (or signup confirmation emails) on your
live site:**

1. Supabase Dashboard → Authentication → URL Configuration
2. Set **Site URL** to your deployed URL (e.g. `https://your-library.netlify.app`)
3. Add your deployed URL to **Redirect URLs** (both with and without a
   trailing slash is safest)
4. If you also want to keep testing locally after deploying, add
   `http://localhost:8000` (or whatever port you use) to Redirect URLs too
   — both can coexist in that list

Skipping this step is the single most common reason "it worked on
localhost but broke in production" for a Supabase Auth app — the reset
email still sends, but the link in it gets rejected.

---

## Environment/config notes

- `supabase_client.js` holds the Project URL and anon key directly in the
  file (not an environment variable) — that's intentional for a static
  site with no build step, and safe (see `README.md`'s note on why the
  anon key being visible is fine).
- There's nothing else to configure — no `.env` file, no build command,
  no server-side code. Every host above should work with zero
  configuration beyond the redirect URLs above.

## After deploying

Run through `FINAL_TESTING_CHECKLIST.md` once against the live URL, not
just localhost — the redirect URL step above is exactly the kind of thing
that only surfaces once you're no longer on `localhost`.
