// ============================================================================
// UI_HELPERS.JS — toasts and button loading state
// Shared by every page so feedback looks and behaves consistently.
// ============================================================================

/** Ensures a #toast-region container exists, then shows a toast in it. */
export function showToast(message, type = "info") {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    document.body.appendChild(region);
  }

  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " toast-error" : ""}${type === "success" ? " toast-success" : ""}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  region.appendChild(toast);

  setTimeout(() => toast.remove(), 4200);
}

/** Reads a Supabase/PostgREST error into something a user can actually read. */
export function friendlyError(error) {
  if (!error) return "Something went wrong. Please try again.";
  const msg = error.message || String(error);

  if (msg.includes("Invalid login credentials")) return "Incorrect email or password.";
  if (msg.includes("User already registered")) return "An account with that email already exists.";
  if (msg.includes("Email not confirmed")) return "Please confirm your email before signing in.";
  if (msg.includes("Password should be at least")) return "Password must be at least 6 characters.";
  if (msg.includes("duplicate key")) return "That record already exists.";
  return msg;
}

/** Toggles a submit button between idle and loading states. */
export function setButtonLoading(button, isLoading, idleLabel) {
  if (isLoading) {
    button.dataset.idleLabel = button.dataset.idleLabel || idleLabel || button.textContent;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Please wait…`;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.idleLabel || idleLabel || button.textContent;
  }
}

/** Shows a dismissible inline alert box inside the given container element. */
export function showAlert(container, message, type = "error") {
  container.innerHTML = "";
  if (!message) return;
  const div = document.createElement("div");
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.appendChild(div);
}
