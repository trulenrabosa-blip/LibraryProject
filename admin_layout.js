// ============================================================================
// ADMIN_LAYOUT.JS
// Renders the sidebar + topbar shared by every admin_*.html page. Shared
// on purpose — the sidebar itself is identical across all admin pages, so
// one implementation avoids 17 copies going out of sync. Each admin page's
// own content still lives in that page's own admin_<name>.html/.js/.css.
// ============================================================================

import { signOut } from "./auth_service.js";

const NAV_SECTIONS = [
  { items: [{ key: "dashboard", label: "Dashboard", icon: "◆", href: "admin_dashboard.html" }] },
  {
    heading: "Catalog",
    items: [
      { key: "books", label: "Manage Books", icon: "B", href: "admin_books.html" },
      { key: "categories", label: "Categories", icon: "C", href: "admin_categories.html" },
      { key: "copies", label: "Inventory", icon: "#", href: "admin_copies.html" },
    ],
  },
  {
    heading: "People",
    items: [
      { key: "students", label: "Students", icon: "S", href: "admin_students.html" },
      { key: "teachers", label: "Teachers", icon: "T", href: "admin_teachers.html" },
    ],
  },
  {
    heading: "Borrow Records",
    items: [
      { key: "borrowings", label: "Borrow Requests", icon: "→", href: "admin_borrowings.html" },
      { key: "borrowed", label: "Borrowed Books", icon: "▤", href: "admin_borrowed.html" },
      { key: "returns", label: "Returns", icon: "←", href: "admin_returns.html" },
    ],
  },
  { heading: "System", items: [{ key: "activity-logs", label: "Activity Logs", icon: "≡", href: "admin_activity_logs.html" }] },
];

function navHtml(activeKey) {
  return NAV_SECTIONS.map((section) => {
    const heading = section.heading ? `<div class="admin-nav-divider">${section.heading}</div>` : "";
    const links = section.items
      .map(
        (item) => `
        <a href="${item.href}" class="${item.key === activeKey ? "active" : ""}">
          <span class="admin-nav-icon">${item.icon}</span>${item.label}
        </a>`
      )
      .join("");
    return heading + links;
  }).join("");
}

export function renderAdminShell({ activeKey, title, profile }) {
  const root = document.getElementById("app-root");

  root.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="admin-sidebar-brand">
          <div class="admin-sidebar-mark">RL</div>
          <div>
            <div class="admin-sidebar-name">Riverside Library</div>
            <div class="admin-sidebar-sub">Admin</div>
          </div>
        </div>
        <nav class="admin-nav">${navHtml(activeKey)}</nav>
        <div class="admin-sidebar-footer">
          <button id="admin-logout-btn" class="btn btn-secondary" style="color:#fff;border-color:rgba(255,255,255,0.3);">
            Log out
          </button>
        </div>
      </aside>

      <div class="admin-content">
        <div class="admin-topbar">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <button id="sidebar-toggle" class="btn btn-secondary" style="display:none;padding:0.4em 0.7em;">☰</button>
            <div class="admin-topbar-title">${title}</div>
          </div>
          <span class="pill">${profile.full_name} · ${profile.role}</span>
        </div>
        <main class="admin-main" id="admin-main"></main>
      </div>
    </div>
  `;

  document.getElementById("admin-logout-btn").addEventListener("click", async () => {
    await signOut();
    window.location.replace("login.html");
  });

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.getElementById("admin-sidebar").classList.toggle("open");
  });

  return { mainEl: document.getElementById("admin-main") };
}
