// ============================================================================
// PROFILE_DATA.JS
// Shared by student_profile.js and teacher_profile.js — the same
// operation (view/update your own profile row) for both roles, identical
// fields per the schema. Plain updates — RLS's "profiles_update_own_or_admin"
// policy already allows a user to update their own row.
// ============================================================================

import { supabase } from "./supabase_client.js";

export async function updateOwnProfile(profileId, fields) {
  const { error } = await supabase.from("profiles").update(fields).eq("profile_id", profileId);
  if (error) throw error;
}
