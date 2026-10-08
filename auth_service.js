// ============================================================================
// AUTH_SERVICE.JS
// Wraps Supabase Auth + the `profiles` table lookup that every page needs.
// Shared across all pages for the same reason supabase_client.js is — the
// sign-in/sign-out/session logic must be one implementation, not copies
// that could drift out of sync.
// ============================================================================

import { supabase } from "./supabase_client.js";

const DASHBOARD_BY_ROLE = {
  Admin: "admin_dashboard.html",
  Student: "student_dashboard.html",
  Teacher: "teacher_dashboard.html",
};

export async function signUp({ email, password, fullName, role, idNumber, phone }) {
  if (role !== "Student" && role !== "Teacher") {
    throw new Error("Public registration only supports Student or Teacher accounts.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        id_number: idNumber || null,
        phone_number: phone || null,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const profile = await getCurrentProfile();
  if (profile) {
    await logActivity("User logged in", `${profile.full_name} (${profile.role}) signed in.`);
  }
  return { session: data.session, profile };
}

export async function signOut() {
  const profile = await getCurrentProfile().catch(() => null);
  if (profile) {
    await logActivity("User logged out", `${profile.full_name} (${profile.role}) signed out.`).catch(() => {});
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  // Built from the current page's actual URL, not just window.location.origin
  // — this resolves correctly whether the site lives at a domain root
  // (Netlify, Vercel) or under a subpath (GitHub Pages project sites serve
  // from https://username.github.io/repo-name/, not the domain root).
  const redirectTo = new URL("reset_password.html", window.location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (error) throw error;
  return data;
}

export function dashboardPathForRole(role) {
  return DASHBOARD_BY_ROLE[role] || "login.html";
}

export async function requireAuth(allowedRoles = []) {
  // Wrapped so a connection problem (bad credentials, network issue, RLS
  // misconfiguration) sends the person to a page that explains something is
  // wrong, instead of leaving whatever page called this hanging forever.
  try {
    const session = await getSession();
    if (!session) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.replace(`login.html?next=${next}`);
      return null;
    }

    const profile = await getCurrentProfile();
    if (!profile) {
      window.location.replace("login.html");
      return null;
    }

    if (profile.status !== "Active") {
      await supabase.auth.signOut();
      window.location.replace("login.html?deactivated=1");
      return null;
    }

    if (allowedRoles.length && !allowedRoles.includes(profile.role)) {
      window.location.replace(dashboardPathForRole(profile.role));
      return null;
    }

    return profile;
  } catch (error) {
    console.error("requireAuth failed:", error);
    window.location.replace("login.html?connection_error=1");
    return null;
  }
}

export async function logActivity(action, description = "") {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("profile_id").eq("auth_user_id", user.id).single()
    : { data: null };

  await supabase.from("activity_logs").insert({
    user_id: profile ? profile.profile_id : null,
    action,
    description,
  });
}
