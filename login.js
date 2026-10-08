import { signIn, getSession, getCurrentProfile, dashboardPathForRole } from "./auth_service.js";
import { showAlert, friendlyError, setButtonLoading } from "./ui_helpers.js";

const form = document.getElementById("login-form");
const alertBox = document.getElementById("alert-box");
const submitBtn = document.getElementById("submit-btn");

(async () => {
  const session = await getSession();
  if (session) {
    const profile = await getCurrentProfile();
    if (profile) window.location.replace(dashboardPathForRole(profile.role));
  }
})();

const params = new URLSearchParams(window.location.search);
if (params.get("deactivated")) {
  showAlert(alertBox, "Your account is inactive or suspended. Contact the library admin.", "error");
} else if (params.get("registered")) {
  showAlert(alertBox, "Account created. You can sign in now.", "success");
} else if (params.get("reset")) {
  showAlert(alertBox, "Password updated. Please sign in with your new password.", "success");
} else if (params.get("connection_error")) {
  showAlert(alertBox, "Couldn't reach the library database. Check your connection and try again.", "error");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAlert(alertBox, "");

  const email = form.email.value.trim();
  const password = form.password.value;

  setButtonLoading(submitBtn, true, "Sign in");
  try {
    const { profile } = await signIn({ email, password });
    const next = params.get("next");
    window.location.replace(next ? decodeURIComponent(next) : dashboardPathForRole(profile.role));
  } catch (error) {
    showAlert(alertBox, friendlyError(error), "error");
    setButtonLoading(submitBtn, false, "Sign in");
  }
});
