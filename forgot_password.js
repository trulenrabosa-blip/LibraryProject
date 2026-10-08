import { sendPasswordReset } from "./auth_service.js";
import { showAlert, friendlyError, setButtonLoading } from "./ui_helpers.js";

const form = document.getElementById("forgot-form");
const alertBox = document.getElementById("alert-box");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAlert(alertBox, "");

  const email = form.email.value.trim();

  setButtonLoading(submitBtn, true, "Send reset link");
  try {
    await sendPasswordReset(email);
    showAlert(alertBox, "If that email has an account, a reset link is on its way. Check your inbox.", "success");
    form.reset();
  } catch (error) {
    showAlert(alertBox, friendlyError(error), "error");
  } finally {
    setButtonLoading(submitBtn, false, "Send reset link");
  }
});
