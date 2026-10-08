// ============================================================================
// TEACHER_LAYOUT.JS
// Renders the topbar + horizontal nav shared by every teacher_*.html page.
// Mirrors student_layout.js's approach — one implementation so the nav
// can't drift out of sync across pages.
// ============================================================================

import { signOut } from "./auth_service.js";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "teacher_dashboard.html" },
  { key: "books", label: "Available Books", href: "teacher_books.html" },
  { key: "borrowed", label: "My Borrowed Books", href: "teacher_borrowed.html" },
  { key: "requests", label: "My Requests", href: "teacher_requests.html" },
  { key: "history", label: "Borrowing History", href: "teacher_history.html" },
  { key: "profile", label: "My Profile", href: "teacher_profile.html" },
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
export function renderTeacherShell({ activeKey, profile }) {
  const root = document.getElementById("app-root");

  root.innerHTML = `
    <div class="teacher-topbar">
      <div class="teacher-brand">
        <div class="teacher-brand-mark">RL</div>
        <div class="teacher-brand-name">Riverside Library</div>
      </div>
      <div style="display:flex;align-items:center;gap:1rem;">
        <span class="pill">${profile.full_name} · ${profile.role}</span>
        <button id="teacher-logout-btn" class="btn btn-secondary">Log out</button>
      </div>
    </div>
    <nav class="teacher-nav">${navHtml(activeKey)}</nav>
    <main class="teacher-main" id="teacher-main"></main>
  `;

  document.getElementById("teacher-logout-btn").addEventListener("click", async () => {
    await signOut();
    window.location.replace("login.html");
  });


  return { mainEl: document.getElementById("teacher-main") };
}
