// ============================================================================
// SUPABASE_CLIENT.JS
// The one place the Supabase client is created. Every page's JS imports
// `supabase` from here — this file is intentionally shared (not duplicated
// per page) because creating more than one client instance per app causes
// inconsistent auth state between pages.
//
// SECURITY: only the public/anon key belongs here. Never paste the
// service-role key into any frontend file — it bypasses Row Level Security.
//
// SETUP: replace the two placeholder values below with your real project's
// URL and anon key (Supabase Dashboard -> Project Settings -> API). Until
// you do, every page shows a plain-language notice instead of hanging on a
// spinner or a blank screen.
// ============================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://emmclokgueauwapjrfbf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hDBS5YXLSGe6B-JJGyetjw_NzXrKFhF";

function looksConfigured(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_");
}

export const isSupabaseConfigured = looksConfigured(SUPABASE_URL) && looksConfigured(SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  // Every page imports this file before running its own logic, so this is
  // the one place that can reliably catch "the placeholders were never
  // replaced" and show something better than an infinite spinner.
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:-apple-system,'Segoe UI',sans-serif;background:#f6f1e4;">
      <div style="max-width:480px;background:#fffdf7;border:1px solid #ded4bd;border-radius:8px;padding:2rem;">
        <h1 style="font-size:1.2rem;margin:0 0 0.6em;color:#1e2a22;">Supabase isn't connected yet</h1>
        <p style="color:#5b6b60;font-size:0.92rem;line-height:1.5;margin:0 0 1em;">
          This page can't load because <code>supabase_client.js</code> still has
          placeholder credentials.
        </p>
        <ol style="color:#5b6b60;font-size:0.9rem;line-height:1.6;padding-left:1.2em;margin:0 0 1em;">
          <li>Open <code>supabase_client.js</code> in this folder.</li>
          <li>Replace <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> with
              the values from Supabase &rarr; Project Settings &rarr; API.</li>
          <li>Reload this page.</li>
        </ol>
        <p style="color:#5b6b60;font-size:0.85rem;">
          Also make sure you're viewing this over a local server
          (e.g. <code>http://localhost:8000</code>), not by double-clicking the file &mdash;
          browsers block module scripts on <code>file://</code> pages.
        </p>
      </div>
    </div>
  `;
  throw new Error("Supabase is not configured -- see the on-page notice.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
