// ============================================================================
// USERS_DATA.JS
// Shared by admin_users.js, admin_students.js, and admin_teachers.js — same
// operations (list/edit/change-status) regardless of which role subset a
// page shows. Plain reads/writes — RLS's "profiles_select_own_or_admin" and
// "profiles_update_own_or_admin" policies already give Admin unrestricted
// access to every profile row.
//
// Deliberately NOT here: creating a new account. That requires Supabase's
// service-role key (to call the Auth Admin API), which must never be
// shipped in frontend code — see the note in supabase_client.js. The
// intended way to add a Student/Teacher is still public registration.
// ============================================================================

import { supabase } from "./supabase_client.js";
import { logActivity } from "./auth_service.js";

/** Every profile with one of the given roles, sorted by name. */
export async function fetchUsersByRole(roles) {
  const { data, error } = await supabase.from("profiles").select("*").in("role", roles).order("full_name");
  if (error) throw error;
  return data || [];
}

export async function updateUserProfile(userId, fields, userNameForLog) {
  const { error } = await supabase.from("profiles").update(fields).eq("profile_id", userId);
  if (error) throw error;
  await logActivity("User updated", `Updated profile for ${userNameForLog || userId}.`).catch(() => {});
}

export async function updateUserStatus(userId, status, userNameForLog) {
  const { error } = await supabase.from("profiles").update({ status }).eq("profile_id", userId);
  if (error) throw error;

  const action = status === "Active" ? "User reactivated" : status === "Suspended" ? "User suspended" : "User deactivated";
  await logActivity(action, `${action} — ${userNameForLog || userId}.`).catch(() => {});
}
