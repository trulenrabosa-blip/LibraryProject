import { supabase } from "./supabase_client.js";
import { updatePassword } from "./auth_service.js";
import { showAlert, friendlyError, setButtonLoading } from "./ui_helpers.js";

const form = document.getElementById("reset-form");
const alertBox = document.getElementById("alert-box");
const submitBtn = document.getElementById("submit-btn");

let recoveryReady = false;
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") recoveryReady = true;
});

supabase.auth.getSession().then(({ data }) => {
  if (data.session) recoveryReady = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAlert(alertBox, "");

  if (!recoveryReady) {
    showAlert(alertBox, "This reset link is invalid or has expired. Request a new one.", "error");
    return;
  }

  const password = form.password.value;
  const confirmPassword = form.confirm_password.value;

  if (password !== confirmPassword) {
    showAlert(alertBox, "Passwords do not match.", "error");
    return;
  }
  if (password.length < 6) {
    showAlert(alertBox, "Password must be at least 6 characters.", "error");
    return;
  }

  setButtonLoading(submitBtn, true, "Update password");
  try {
    await updatePassword(password);
    await supabase.auth.signOut();
    window.location.replace("login.html?reset=1");
  } catch (error) {
    showAlert(alertBox, friendlyError(error), "error");
    setButtonLoading(submitBtn, false, "Update password");
  }
});
