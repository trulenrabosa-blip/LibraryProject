import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { supabase } from "./supabase_client.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "categories", title: "Categories", profile });

let allCategories = [];
let editingId = null;

mainEl.innerHTML = `
  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search categories…" />
    <span class="toolbar-spacer"></span>
    <button id="add-btn" class="btn btn-primary">+ Add Category</button>
  </div>

  <div class="data-table-wrap">
    <table class="data-table">
      <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
      <tbody id="tbody"><tr><td colspan="3" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
    </table>
  </div>

  <div class="modal-backdrop" id="modal">
    <div class="modal-card">
      <h2 id="modal-title">Add Category</h2>
      <div id="modal-alert"></div>
      <form id="form" novalidate>
        <div class="field">
          <label for="f-name">Name *</label>
          <input type="text" id="f-name" required />
        </div>
        <div class="field">
          <label for="f-desc">Description</label>
          <textarea id="f-desc" class="field-textarea"></textarea>
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

function render() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const tbody = document.getElementById("tbody");
  const filtered = q ? allCategories.filter((c) => c.category_name.toLowerCase().includes(q)) : allCategories;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No categories found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.category_name)}</td>
        <td>${escapeHtml(c.description || "—")}</td>
        <td class="row-actions">
          <button class="edit-btn" data-id="${c.category_id}">Edit</button>
          <button class="danger delete-btn" data-id="${c.category_id}">Delete</button>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".edit-btn").forEach((btn) => btn.addEventListener("click", () => openModal(btn.dataset.id)));
  tbody.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.id)));
}

async function load() {
  try {
    const { data, error } = await supabase.from("categories").select("*").order("category_name");
    if (error) throw error;
    allCategories = data || [];
    render();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

function openModal(id = null) {
  editingId = id;
  document.getElementById("form").reset();
  document.getElementById("modal-alert").innerHTML = "";
  document.getElementById("modal-title").textContent = id ? "Edit Category" : "Add Category";

  if (id) {
    const item = allCategories.find((c) => c.category_id === id);
    if (item) {
      document.getElementById("f-name").value = item.category_name;
      document.getElementById("f-desc").value = item.description || "";
    }
  }
  document.getElementById("modal").classList.add("open");
}

function closeModal() {
  document.getElementById("modal").classList.remove("open");
  editingId = null;
}

async function handleSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById("modal-alert");
  const name = document.getElementById("f-name").value.trim();
  if (!name) {
    alertBox.innerHTML = `<div class="alert alert-error">Name is required.</div>`;
    return;
  }

  const fields = { category_name: name, description: document.getElementById("f-desc").value.trim() || null };
  const saveBtn = document.getElementById("save-btn");
  saveBtn.disabled = true;

  try {
    if (editingId) {
      const { error } = await supabase.from("categories").update(fields).eq("category_id", editingId);
      if (error) throw error;
      showToast("Category updated.", "success");
    } else {
      const { error } = await supabase.from("categories").insert(fields);
      if (error) throw error;
      showToast("Category added.", "success");
    }
    closeModal();
    await load();
  } catch (error) {
    alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(friendlyError(error))}</div>`;
  } finally {
    saveBtn.disabled = false;
  }
}

async function handleDelete(id) {
  if (!confirm("Delete this category? Books using it will become uncategorized.")) return;
  try {
    const { error } = await supabase.from("categories").delete().eq("category_id", id);
    if (error) throw error;
    showToast("Category deleted.", "success");
    await load();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

document.getElementById("add-btn").addEventListener("click", () => openModal(null));
document.getElementById("cancel-btn").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
document.getElementById("form").addEventListener("submit", handleSubmit);
document.getElementById("search-input").addEventListener("input", render);

await load();
