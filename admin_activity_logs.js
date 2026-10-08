import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { supabase } from "./supabase_client.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "activity-logs", title: "Activity Logs", profile });

let allLogs = [];
let actionOptions = [];

mainEl.innerHTML = `
  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search by user or description…" />
    <select id="action-filter"><option value="">All actions</option></select>
  </div>

  <div class="data-table-wrap">
    <table class="data-table">
      <thead><tr><th>When</th><th>User</th><th>Action</th><th>Description</th></tr></thead>
      <tbody id="tbody"><tr><td colspan="4" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
    </table>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function currentFilters() {
  return {
    search: document.getElementById("search-input").value.trim().toLowerCase(),
    action: document.getElementById("action-filter").value,
  };
}

function render() {
  const { search, action } = currentFilters();
  const tbody = document.getElementById("tbody");

  const filtered = allLogs.filter((log) => {
    if (action && log.action !== action) return false;
    if (search) {
      const haystack = `${log.userName || ""} ${log.description || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No log entries match those filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (log) => `
      <tr>
        <td class="log-time">${formatDateTime(log.created_at)}</td>
        <td>${escapeHtml(log.userName || "System")} ${log.userRole ? `<span class="role-tag">${escapeHtml(log.userRole)}</span>` : ""}</td>
        <td><span class="log-action">${escapeHtml(log.action)}</span></td>
        <td>${escapeHtml(log.description || "—")}</td>
      </tr>`
    )
    .join("");
}

async function load() {
  try {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("log_id, action, description, created_at, profiles(full_name, role)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    allLogs = (data || []).map((row) => ({
      logId: row.log_id,
      action: row.action,
      description: row.description,
      created_at: row.created_at,
      userName: row.profiles?.full_name,
      userRole: row.profiles?.role,
    }));

    actionOptions = [...new Set(allLogs.map((l) => l.action))].sort();
    document.getElementById("action-filter").innerHTML +=
      actionOptions.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");

    render();
  } catch (error) {
    document.getElementById("tbody").innerHTML = `<tr><td colspan="4" class="empty-state">Couldn't load activity logs.</td></tr>`;
    showToast(friendlyError(error), "error");
  }
}

document.getElementById("search-input").addEventListener("input", render);
document.getElementById("action-filter").addEventListener("change", render);

await load();
