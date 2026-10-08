import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast, showAlert, friendlyError, setButtonLoading } from "./ui_helpers.js";
import { fetchUsersByRole, updateUserProfile, updateUserStatus } from "./users_data.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "teachers", title: "Teachers", profile });

let allUsers = [];
let editingUserId = null;

mainEl.innerHTML = `
  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search by name, email, or student ID..." />
    <select id="status-filter">
      <option value="">All statuses</option>
      <option value="Active">Active</option>
      <option value="Inactive">Inactive</option>
      <option value="Suspended">Suspended</option>
    </select>
  </div>

  <div class="data-table-wrap">
    <table class="data-table">
      <thead><tr><th>Name</th><th>Employee ID</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="tbody"><tr><td colspan="6" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
    </table>
  </div>

  <div class="modal-backdrop" id="modal">
    <div class="modal-card">
      <h2>Edit Teacher</h2>
      <div class="modal-subtitle" id="modal-subtitle"></div>
      <div id="modal-alert"></div>
      <form id="form" novalidate>
        <div class="form-grid">
          <div class="field field-full">
            <label for="f-name">Full Name</label>
            <input type="text" id="f-name" required />
          </div>
          <div class="field">
            <label for="f-id">Employee ID</label>
            <input type="text" id="f-id" />
          </div>
          <div class="field">
            <label for="f-phone">Phone</label>
            <input type="tel" id="f-phone" />
          </div>
          <div class="field field-full">
            <label for="f-address">Address</label>
            <input type="text" id="f-address" />
          </div>
          <div class="field">
            <label for="f-dob">Date of Birth</label>
            <input type="date" id="f-dob" />
          </div>
          <div class="field">
            <label for="f-gender">Gender</label>
            <input type="text" id="f-gender" />
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" id="cancel-btn" class="btn btn-secondary">Cancel</button>
          <button type="submit" id="save-btn" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function currentFilters() {
  return {
    search: document.getElementById("search-input").value.trim().toLowerCase(),
    status: document.getElementById("status-filter").value,
  };
}

function render() {
  const { search, status } = currentFilters();
  const tbody = document.getElementById("tbody");

  const filtered = allUsers.filter((u) => {
    if (status && u.status !== status) return false;
    if (search) {
      const haystack = `${u.full_name} ${u.email} ${u.id_number || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No teachers match those filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (u) => `
      <tr data-user-id="${u.profile_id}">
        <td>${escapeHtml(u.full_name)}</td>
        <td class="id-cell">${escapeHtml(u.id_number || "—")}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.phone_number || "—")}</td>
        <td>
          <select class="status-select ${u.status.toLowerCase()}" data-user-id="${u.profile_id}">
            <option value="Active" ${u.status === "Active" ? "selected" : ""}>Active</option>
            <option value="Inactive" ${u.status === "Inactive" ? "selected" : ""}>Inactive</option>
            <option value="Suspended" ${u.status === "Suspended" ? "selected" : ""}>Suspended</option>
          </select>
        </td>
        <td class="row-actions"><button class="edit-btn" data-user-id="${u.profile_id}">Edit</button></td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".edit-btn").forEach((btn) => btn.addEventListener("click", () => openModal(btn.dataset.userId)));
  tbody.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", () => handleStatusChange(sel.dataset.userId, sel.value, sel));
  });
}

async function load() {
  try {
    allUsers = await fetchUsersByRole(["Teacher"]);
    render();
  } catch (error) {
    document.getElementById("tbody").innerHTML = `<tr><td colspan="6" class="empty-state">Couldn't load teachers.</td></tr>`;
    showToast(friendlyError(error), "error");
  }
}

async function handleStatusChange(userId, newStatus, selectEl) {
  const user = allUsers.find((u) => u.profile_id === userId);
  if (!user) return;

  if (newStatus !== "Active" && !confirm(`Set ${user.full_name}'s account to ${newStatus}? They'll be signed out on their next page load.`)) {
    selectEl.value = user.status;
    return;
  }

  try {
    await updateUserStatus(userId, newStatus, user.full_name);
    user.status = newStatus;
    selectEl.className = `status-select ${newStatus.toLowerCase()}`;
    showToast(`${user.full_name} is now ${newStatus}.`, "success");
  } catch (error) {
    selectEl.value = user.status;
    showToast(friendlyError(error), "error");
  }
}

function openModal(userId) {
  editingUserId = userId;
  const user = allUsers.find((u) => u.profile_id === userId);
  if (!user) return;

  document.getElementById("form").reset();
  document.getElementById("modal-alert").innerHTML = "";
  document.getElementById("modal-subtitle").textContent = `${user.email} (email can't be changed here)`;
  document.getElementById("f-name").value = user.full_name || "";
  document.getElementById("f-id").value = user.id_number || "";
  document.getElementById("f-phone").value = user.phone_number || "";
  document.getElementById("f-address").value = user.address || "";
  document.getElementById("f-dob").value = user.date_of_birth || "";
  document.getElementById("f-gender").value = user.gender || "";

  document.getElementById("modal").classList.add("open");
}

function closeModal() {
  document.getElementById("modal").classList.remove("open");
  editingUserId = null;
}

async function handleSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById("modal-alert");
  const name = document.getElementById("f-name").value.trim();
  if (!name) {
    showAlert(alertBox, "Name can't be empty.", "error");
    return;
  }

  const fields = {
    full_name: name,
    id_number: document.getElementById("f-id").value.trim() || null,
    phone_number: document.getElementById("f-phone").value.trim() || null,
    address: document.getElementById("f-address").value.trim() || null,
    date_of_birth: document.getElementById("f-dob").value || null,
    gender: document.getElementById("f-gender").value.trim() || null,
  };

  const saveBtn = document.getElementById("save-btn");
  setButtonLoading(saveBtn, true, "Save");
  try {
    await updateUserProfile(editingUserId, fields, name);
    showToast("Teacher updated.", "success");
    closeModal();
    await load();
  } catch (error) {
    showAlert(alertBox, friendlyError(error), "error");
  } finally {
    setButtonLoading(saveBtn, false, "Save");
  }
}

document.getElementById("cancel-btn").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
document.getElementById("form").addEventListener("submit", handleSubmit);
document.getElementById("search-input").addEventListener("input", render);
document.getElementById("status-filter").addEventListener("change", render);

await load();
