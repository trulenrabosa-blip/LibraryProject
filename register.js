import { signUp } from "./auth_service.js";
import { showAlert, friendlyError, setButtonLoading } from "./ui_helpers.js";

const form = document.getElementById("register-form");
const alertBox = document.getElementById("alert-box");
const submitBtn = document.getElementById("submit-btn");
const idLabel = document.getElementById("id_number_label");
const idInput = document.getElementById("id_number");

form.querySelectorAll('input[name="role"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const isTeacher = form.role.value === "Teacher";
    idLabel.textContent = isTeacher ? "Employee ID" : "Student ID";
    idInput.placeholder = isTeacher ? "e.g. EMP-2031" : "e.g. STU-2031";
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAlert(alertBox, "");

  const fullName = form.full_name.value.trim();
  const idNumber = form.id_number.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirm_password.value;
  const role = form.role.value;

  if (password !== confirmPassword) {
    showAlert(alertBox, "Passwords do not match.", "error");
    return;
  }
  if (password.length < 6) {
    showAlert(alertBox, "Password must be at least 6 characters.", "error");
    return;
  }

  setButtonLoading(submitBtn, true, "Create account");
  try {
    await signUp({ email, password, fullName, role, idNumber, phone });
    window.location.replace("login.html?registered=1");
  } catch (error) {
    showAlert(alertBox, friendlyError(error), "error");
    setButtonLoading(submitBtn, false, "Create account");
  }
});
