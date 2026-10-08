import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import {
  fetchStatCards,
  fetchMonthlyBorrowingTrend,
  fetchMostBorrowedBooks,
  fetchBooksByCategory,
  fetchBorrowingByRole,
  fetchNewUsersTrend,
  fetchOverdueByRole,
} from "./admin_dashboard_data.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "dashboard", title: "Dashboard", profile });

const CHART_COLORS = {
  shelf: "#33493a",
  brass: "#a97c34",
  stamp: "#8b3a3a",
  soft: "#c99a4f",
  line: "#ded4bd",
  palette: ["#33493a", "#a97c34", "#8b3a3a", "#5b6b60", "#c99a4f", "#7d9b84", "#b98f52", "#4f6b5a"],
};

Chart.defaults.font.family = "Inter, sans-serif";
Chart.defaults.color = "#5b6b60";
Chart.defaults.borderColor = "#ded4bd";

mainEl.innerHTML = `
  <div class="stat-grid" id="stat-grid">
    ${renderStatCardSkeleton("Total Books", "admin_books.html")}
    ${renderStatCardSkeleton("Available Books", "admin_copies.html")}
    ${renderStatCardSkeleton("Borrowed Books", "admin_borrowed.html")}
    ${renderStatCardSkeleton("Overdue Books", "admin_returns.html")}
    ${renderStatCardSkeleton("Total Students", "admin_students.html")}
    ${renderStatCardSkeleton("Total Teachers", "admin_teachers.html")}
    ${renderStatCardSkeleton("Pending Requests", "admin_borrowings.html")}
  </div>

  <div class="chart-grid">
    <div class="chart-panel chart-wide">
      <h3>Monthly borrowing — last 6 months</h3>
      <div class="chart-panel-wrap"><canvas id="chart-monthly"></canvas></div>
    </div>
    <div class="chart-panel">
      <h3>Most borrowed books</h3>
      <div class="chart-panel-wrap"><canvas id="chart-top-books"></canvas></div>
    </div>
    <div class="chart-panel">
      <h3>Books by category</h3>
      <div class="chart-panel-wrap"><canvas id="chart-category"></canvas></div>
    </div>
    <div class="chart-panel">
      <h3>Student vs. teacher borrowing</h3>
      <div class="chart-panel-wrap"><canvas id="chart-role"></canvas></div>
    </div>
    <div class="chart-panel">
      <h3>Overdue books right now</h3>
      <div class="chart-panel-wrap"><canvas id="chart-overdue"></canvas></div>
    </div>
    <div class="chart-panel chart-wide">
      <h3>New users — last 6 months</h3>
      <div class="chart-panel-wrap"><canvas id="chart-new-users"></canvas></div>
    </div>
  </div>
`;

function renderStatCardSkeleton(label, href) {
  return `
    <div class="stat-card${href ? " stat-card-link" : ""}"${href ? ` data-href="${href}"` : ""}>
      <div class="stat-card-label">${label}</div>
      <div class="stat-card-value">
        <span class="spinner spinner-dark"></span>
      </div>
    </div>`;
}

function setStatCard(grid, index, value, opts = {}) {
  const card = grid.children[index];
  const valueEl = card.querySelector(".stat-card-value");
  valueEl.textContent = value;
  if (opts.warn) valueEl.classList.add("stat-warn");
  if (opts.sub) {
    const sub = document.createElement("div");
    sub.className = "stat-card-sub";
    sub.textContent = opts.sub;
    card.appendChild(sub);
  }
}

async function loadStats() {
  try {
    const s = await fetchStatCards();
    const grid = document.getElementById("stat-grid");
    setStatCard(grid, 0, s.totalBooks);
    setStatCard(grid, 1, s.availableBooks);
    setStatCard(grid, 2, s.borrowedBooks);
    setStatCard(grid, 3, s.overdueBooks, { warn: s.overdueBooks > 0 });
    setStatCard(grid, 4, s.totalStudents);
    setStatCard(grid, 5, s.totalTeachers);
    setStatCard(grid, 6, s.pendingRequests, { warn: s.pendingRequests > 0 });
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

// Stat cards double as navigation shortcuts to the page that manages that
// number (e.g. clicking "Pending Requests" opens Borrowing Requests).
// Event delegation on the grid means this works for all 9 cards without
// attaching 9 separate listeners, and still works after setStatCard()
// rewrites each card's contents.
document.getElementById("stat-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".stat-card-link");
  if (card?.dataset.href) window.location.href = card.dataset.href;
});
document.getElementById("stat-grid").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".stat-card-link");
  if (card?.dataset.href) {
    e.preventDefault();
    window.location.href = card.dataset.href;
  }
});
document.querySelectorAll(".stat-card-link").forEach((card) => {
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "link");
});

async function loadCharts() {
  try {
    const [monthly, topBooks, byCategory, byRole, overdueByRole, newUsers] = await Promise.all([
      fetchMonthlyBorrowingTrend(),
      fetchMostBorrowedBooks(),
      fetchBooksByCategory(),
      fetchBorrowingByRole(),
      fetchOverdueByRole(),
      fetchNewUsersTrend(),
    ]);

    new Chart(document.getElementById("chart-monthly"), {
      type: "bar",
      data: {
        labels: monthly.labels,
        datasets: [
          { label: "Borrowed", data: monthly.borrowed, backgroundColor: CHART_COLORS.shelf, borderRadius: 4 },
          { label: "Returned", data: monthly.returned, backgroundColor: CHART_COLORS.brass, borderRadius: 4 },
        ],
      },
      options: baseOptions({ legend: true }),
    });

    new Chart(document.getElementById("chart-top-books"), {
      type: "bar",
      data: {
        labels: topBooks.labels.length ? topBooks.labels : ["No data yet"],
        datasets: [
          {
            data: topBooks.counts.length ? topBooks.counts : [0],
            backgroundColor: CHART_COLORS.shelf,
            borderRadius: 4,
          },
        ],
      },
      options: { ...baseOptions({}), indexAxis: "y" },
    });

    new Chart(document.getElementById("chart-category"), {
      type: "doughnut",
      data: {
        labels: byCategory.labels,
        datasets: [{ data: byCategory.counts, backgroundColor: CHART_COLORS.palette }],
      },
      options: { plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 10 } } } } },
    });

    new Chart(document.getElementById("chart-role"), {
      type: "doughnut",
      data: {
        labels: byRole.labels,
        datasets: [{ data: byRole.counts, backgroundColor: [CHART_COLORS.shelf, CHART_COLORS.brass] }],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });

    new Chart(document.getElementById("chart-overdue"), {
      type: "bar",
      data: {
        labels: overdueByRole.labels,
        datasets: [{ data: overdueByRole.counts, backgroundColor: [CHART_COLORS.stamp, CHART_COLORS.soft], borderRadius: 4 }],
      },
      options: baseOptions({}),
    });

    new Chart(document.getElementById("chart-new-users"), {
      type: "line",
      data: {
        labels: newUsers.labels,
        datasets: [
          {
            label: "New users",
            data: newUsers.counts,
            borderColor: CHART_COLORS.shelf,
            backgroundColor: "rgba(51, 73, 58, 0.12)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: baseOptions({}),
    });
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

function baseOptions({ legend = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: legend, position: "bottom" } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };
}

loadStats();
loadCharts();
