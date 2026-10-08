import { requireAuth, updatePassword } from "./auth_service.js";
import { renderTeacherShell } from "./teacher_layout.js";
import { showToast, showAlert, friendlyError, setButtonLoading } from "./ui_helpers.js";
import { updateOwnProfile } from "./profile_data.js";

const profile = await requireAuth(["Teacher"]);
const { mainEl } = renderTeacherShell({ activeKey: "profile", profile });

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

mainEl.innerHTML = `
  <div class="student-welcome">
    <h1>My Profile</h1>
    <p>Update your details or change your password.</p>
  </div>

  <div class="profile-columns">
    <div class="panel">
      <h3>Personal details</h3>
      <div class="profile-readonly">
        Employee ID: <strong>${escapeHtml(profile.id_number || "—")}</strong><br />
        Email: <strong>${escapeHtml(profile.email)}</strong> (contact the library to change your email)
      </div>
      <div id="profile-alert"></div>
      <form id="profile-form" novalidate>
        <div class="field">
          <label for="f-name">Full name</label>
          <input type="text" id="f-name" value="${escapeHtml(profile.full_name)}" required />
        </div>
        <div class="field">
          <label for="f-phone">Phone number</label>
          <input type="tel" id="f-phone" value="${escapeHtml(profile.phone_number || "")}" />
        </div>
        <div class="field">
          <label for="f-address">Address</label>
          <input type="text" id="f-address" value="${escapeHtml(profile.address || "")}" />
        </div>
        <div class="field">
          <label for="f-dob">Date of birth</label>
          <input type="date" id="f-dob" value="${profile.date_of_birth || ""}" />
        </div>
        <div class="field">
          <label for="f-gender">Gender</label>
          <input type="text" id="f-gender" value="${escapeHtml(profile.gender || "")}" />
        </div>
        <button type="submit" id="save-profile-btn" class="btn btn-primary">Save Changes</button>
      </form>
    </div>

    <div class="panel">
      <h3>Change password</h3>
      <div id="password-alert"></div>
      <form id="password-form" novalidate>
        <div class="field">
          <label for="f-password">New password</label>
          <input type="password" id="f-password" minlength="6" required />
          <div class="field-hint">At least 6 characters.</div>
        </div>
        <div class="field">
          <label for="f-password-confirm">Confirm new password</label>
          <input type="password" id="f-password-confirm" required />
        </div>
        <button type="submit" id="save-password-btn" class="btn btn-primary">Update Password</button>
      </form>
    </div>
  </div>
`;

document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("profile-alert");
  const btn = document.getElementById("save-profile-btn");
  showAlert(alertBox, "");

  const fields = {
    full_name: document.getElementById("f-name").value.trim(),
    phone_number: document.getElementById("f-phone").value.trim() || null,
    address: document.getElementById("f-address").value.trim() || null,
    date_of_birth: document.getElementById("f-dob").value || null,
    gender: document.getElementById("f-gender").value.trim() || null,
  };

  if (!fields.full_name) {
    showAlert(alertBox, "Name can't be empty.", "error");
    return;
  }

  setButtonLoading(btn, true, "Save Changes");
  try {
    await updateOwnProfile(profile.profile_id, fields);
    showToast("Profile updated.", "success");
  } catch (error) {
    showAlert(alertBox, friendlyError(error), "error");
  } finally {
    setButtonLoading(btn, false, "Save Changes");
  }
});

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("password-alert");
  const btn = document.getElementById("save-password-btn");
  showAlert(alertBox, "");

  const password = document.getElementById("f-password").value;
  const confirm = document.getElementById("f-password-confirm").value;

  if (password !== confirm) {
    showAlert(alertBox, "Passwords do not match.", "error");
    return;
  }
  if (password.length < 6) {
    showAlert(alertBox, "Password must be at least 6 characters.", "error");
    return;
  }

  setButtonLoading(btn, true, "Update Password");
  try {
    await updatePassword(password);
    showToast("Password updated.", "success");
    document.getElementById("password-form").reset();
  } catch (error) {
    showAlert(alertBox, friendlyError(error), "error");
  } finally {
    setButtonLoading(btn, false, "Update Password");
  }
});
