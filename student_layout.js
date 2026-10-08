// ============================================================================
// STUDENT_LAYOUT.JS
// Renders the topbar + horizontal nav shared by every student_*.html page.
// Shared for the same reason admin_layout.js is — one implementation so the
// nav can't drift out of sync across pages.
// ============================================================================

import { signOut } from "./auth_service.js";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "student_dashboard.html" },
  { key: "books", label: "Available Books", href: "student_books.html" },
  { key: "borrowed", label: "My Borrowed Books", href: "student_borrowed.html" },
  { key: "requests", label: "My Requests", href: "student_requests.html" },
  { key: "history", label: "Borrowing History", href: "student_history.html" },
  { key: "profile", label: "My Profile", href: "student_profile.html" },
];

function navHtml(activeKey) {
  return NAV_ITEMS.map(
    (item) => `<a href="${item.href}" class="${item.key === activeKey ? "active" : ""}">${item.label}</a>`
  ).join("");
}

/**
 * Renders the topbar + nav into the page and returns { mainEl }.
 * Page scripts append their own content into mainEl.
 */
export function renderStudentShell({ activeKey, profile }) {
  const root = document.getElementById("app-root");

  root.innerHTML = `
    <div class="student-topbar">
      <div class="student-brand">
        <div class="student-brand-mark">RL</div>
        <div class="student-brand-name">Riverside Library</div>
      </div>
      <div style="display:flex;align-items:center;gap:1rem;">
        <span class="pill">${profile.full_name} · ${profile.role}</span>
        <button id="student-logout-btn" class="btn btn-secondary">Log out</button>
      </div>
    </div>
    <nav class="student-nav">${navHtml(activeKey)}</nav>
    <main class="student-main" id="student-main"></main>
  `;

  document.getElementById("student-logout-btn").addEventListener("click", async () => {
    await signOut();
    window.location.replace("login.html");
  });

  // Fire-and-forget: doesn't block the shell from rendering, just fills in
  // the badge once the count comes back.

  return { mainEl: document.getElementById("student-main") };
}
