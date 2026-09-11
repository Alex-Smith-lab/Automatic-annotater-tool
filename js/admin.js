/* ============================================================
   ADMIN.JS
   Full-screen Admin Center
   ------------------------------------------------------------
   Features:
   - Admin-only access
   - Dashboard statistics
   - User management
   - Approve / deactivate / kick users
   - Change user roles
   - Create coworker / staff accounts
   - Task management
   - Assign / reassign tasks
   - Task progress
   - Pay-rate management
   - Payment management
   - Activity logs
   - CSV export
   - HTML export
   - Admin full-screen workspace
   ============================================================ */

import {
  APP_CONFIG,
  ALL_ROLES,
  WORK_ROLE,
  normalizeRole,
  isAdminRole,
  isStaffRole,
  isReviewerRole,
  isCoworkerRole,
  roleLabel,
  annotationTypeForRole,
  roleForWorkType,
} from "./config.js";

import {
  getCurrentUser,
  getCurrentProfile,
  getRole,
  isAdmin,
  isStaff,
  isReviewer,
  signOut,
} from "./auth.js";

import {
  getSupabase,
  getCurrentUser as getSupabaseUser,
  logActivity,
  logWorkflowEvent,
} from "./supabase.js";

/* ============================================================
   STATE
   ============================================================ */

export const adminState = {
  initialized: false,

  user: null,
  profile: null,
  role: null,

  currentPage: "overview",

  users: [],
  tasks: [],
  payments: [],
  payRates: [],
  activities: [],

  loading: false,

  selectedUser: null,
  selectedTask: null,

  exportRows: [],

  stats: {
    users: 0,
    customers: 0,
    coworkers: 0,
    reviewers: 0,
    staff: 0,
    admins: 0,
    pending: 0,
    active: 0,
    tasks: 0,
    available: 0,
    claimed: 0,
    submitted: 0,
    approved: 0,
    skipped: 0,
    unpaid: 0,
    paid: 0,
  },
};

window.adminState = adminState;

/* ============================================================
   HELPERS
   ============================================================ */

const $ = (id) =>
  document.getElementById(id);

const qs = (
  selector,
  root = document
) => {
  try {
    return root.querySelector(
      selector
    );
  } catch {
    return null;
  }
};

const qsa = (
  selector,
  root = document
) => {
  try {
    return [
      ...root.querySelectorAll(
        selector
      ),
    ];
  } catch {
    return [];
  }
};

function text(
  value,
  fallback = ""
) {
  return value == null ||
    value === ""
    ? fallback
    : String(value);
}

function number(
  value,
  fallback = 0
) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function escapeHTML(value) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  const amount = number(
    value,
    0
  );

  return amount.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text(value);
  }

  return date.toLocaleString();
}

function formatDateShort(value) {
  if (!value) return "—";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text(value);
  }

  return date.toLocaleDateString();
}

function showElement(
  element,
  show = true
) {
  if (!element) return;

  element.hidden = !show;

  if (show) {
    element.style.display = "";
  } else {
    element.style.display =
      "none";
  }
}

function setText(
  element,
  value
) {
  if (!element) return;

  element.textContent =
    value ?? "";
}

function toast(
  message,
  type = "info"
) {
  if (
    typeof window.showToast ===
    "function"
  ) {
    window.showToast(
      message,
      type
    );
    return;
  }

  const container =
    $("toastContainer");

  if (!container) {
    console.log(
      `[${type}] ${message}`
    );
    return;
  }

  const item =
    document.createElement(
      "div"
    );

  item.className =
    `toast toast-${type}`;

  item.textContent =
    message;

  container.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, 4000);
}

function getClient() {
  return (
    getSupabase?.() ||
    window.supabaseClient ||
    null
  );
}

function currentAdminEmail() {
  return String(
    APP_CONFIG?.adminEmail ||
      "antonymbali96@gmail.com"
  ).toLowerCase();
}

/* ============================================================
   ADMIN ACCESS
   ============================================================ */

function isCurrentUserAdmin() {
  const email =
    String(
      adminState.user?.email ||
        ""
    ).toLowerCase();

  const currentRole =
    normalizeRole(
      adminState.role
    );

  return (
    email ===
      currentAdminEmail() ||
    isAdminRole(currentRole)
  );
}

function requireAdmin() {
  if (
    !isCurrentUserAdmin()
  ) {
    toast(
      "Administrator access is required.",
      "error"
    );

    return false;
  }

  return true;
}

function requireAdminOrStaff() {
  const role =
    normalizeRole(
      adminState.role
    );

  if (
    isAdminRole(role) ||
    isStaffRole(role)
  ) {
    return true;
  }

  toast(
    "Admin or staff access is required.",
    "error"
  );

  return false;
}

/* ============================================================
   TABLE NAMES
   ============================================================ */

function table(name, fallback) {
  return (
    APP_CONFIG?.tables?.[name] ||
    fallback
  );
}

const TABLES = {
  profiles: table(
    "profiles",
    "profiles"
  ),

  tasks: table(
    "tasks",
    "tasks"
  ),

  annotations: table(
    "annotations",
    "annotations"
  ),

  payments: table(
    "payments",
    "payments"
  ),

  payRates: table(
    "payRates",
    "pay_rates"
  ),

  activities: table(
    "activities",
    "activity_logs"
  ),

  workflow: table(
    "workflowEvents",
    "workflow_events"
  ),

  skips: table(
    "taskSkips",
    "task_skips"
  ),
};

/* ============================================================
   ROLE OPTIONS
   ============================================================ */

function roleOptions(
  selected = ""
) {
  const roles =
    Array.isArray(
      ALL_ROLES
    ) && ALL_ROLES.length
      ? ALL_ROLES
      : [
          "customer",
          "coworker_2d_box",
          "coworker_polygon",
          "coworker_segmentation",
          "reviewer",
          "staff",
          "admin",
        ];

  return roles
    .map((role) => {
      const normalized =
        normalizeRole(role);

      return `
        <option
          value="${escapeHTML(
            normalized
          )}"
          ${
            normalizeRole(
              selected
            ) === normalized
              ? "selected"
              : ""
          }
        >
          ${escapeHTML(
            roleLabel(normalized)
          )}
        </option>
      `;
    })
    .join("");
}

/* ============================================================
   ADMIN CENTER OPEN / CLOSE
   ============================================================ */

export function openAdminCenter() {
  if (!requireAdmin()) {
    return false;
  }

  const modal =
    $("adminModal");

  if (!modal) {
    toast(
      "Admin Center element was not found.",
      "error"
    );

    return false;
  }

  showElement(
    modal,
    true
  );

  modal.classList.add(
    "admin-fullscreen-modal"
  );

  document.body.classList.add(
    "admin-center-open"
  );

  loadAdminCenter();

  return true;
}

export function closeAdminCenter() {
  const modal =
    $("adminModal");

  if (modal) {
    showElement(
      modal,
      false
    );
  }

  document.body.classList.remove(
    "admin-center-open"
  );

  adminState.currentPage =
    "overview";
}

function bindModal() {
  $("closeAdminModal")
    ?.addEventListener(
      "click",
      closeAdminCenter
    );

  $("adminCenterButton")
    ?.addEventListener(
      "click",
      openAdminCenter
    );
}

/* ============================================================
   ADMIN PAGES
   ============================================================ */

function getPages() {
  return qsa(
    "[data-admin-page]"
  );
}

function getTabs() {
  return qsa(
    "[data-admin-tab]"
  );
}

export function showAdminPage(
  page
) {
  if (!requireAdmin()) {
    return;
  }

  const normalized =
    String(
      page || "overview"
    ).trim();

  adminState.currentPage =
    normalized;

  getPages().forEach(
    (element) => {
      const pageName =
        element.dataset
          .adminPage;

      const visible =
        pageName ===
        normalized;

      showElement(
        element,
        visible
      );

      element.classList.toggle(
        "active",
        visible
      );
    }
  );

  getTabs().forEach(
    (tab) => {
      const tabName =
        tab.dataset.adminTab;

      tab.classList.toggle(
        "active",
        tabName ===
          normalized
      );

      tab.setAttribute(
        "aria-selected",
        tabName ===
          normalized
          ? "true"
          : "false"
      );
    }
  );

  const loaders = {
    overview:
      loadOverview,
    users:
      loadUsers,
    coworkers:
      loadCoworkers,
    tasks:
      loadTasks,
    payments:
      loadPayments,
    rates:
      loadPayRates,
    activity:
      loadActivity,
    export:
      renderExportPage,
  };

  const loader =
    loaders[normalized];

  if (loader) {
    loader();
  }
}

function bindTabs() {
  getTabs().forEach(
    (tab) => {
      tab.addEventListener(
        "click",
        () => {
          showAdminPage(
            tab.dataset.adminTab
          );
        }
      );
    }
  );
}

/* ============================================================
   INITIALIZATION
   ============================================================ */

export async function initializeAdmin() {
  if (
    adminState.initialized
  ) {
    return adminState;
  }

  adminState.initialized =
    true;

  adminState.user =
    getCurrentUser?.() ||
    getSupabaseUser?.() ||
    null;

  adminState.profile =
    getCurrentProfile?.() ||
    null;

  adminState.role =
    normalizeRole(
      getRole?.() ||
        adminState.profile?.role ||
        ""
    );

  bindModal();
  bindTabs();
  bindAdminButtons();
  bindUserActions();
  bindTaskActions();
  bindPaymentActions();
  bindRateActions();
  bindCreateWorker();
  bindCreateTask();
  bindExportActions();

  hideAdminFromNonAdmin();

  if (
    isCurrentUserAdmin()
  ) {
    showAdminPage(
      "overview"
    );
  }

  return adminState;
}

function hideAdminFromNonAdmin() {
  const button =
    $("adminCenterButton");

  if (!button) return;

  showElement(
    button,
    isCurrentUserAdmin()
  );
}

/* ============================================================
   LOAD ADMIN CENTER
   ============================================================ */

async function loadAdminCenter() {
  if (!requireAdmin()) {
    return;
  }

  adminState.user =
    getCurrentUser?.() ||
    getSupabaseUser?.() ||
    adminState.user;

  adminState.profile =
    getCurrentProfile?.() ||
    adminState.profile;

  adminState.role =
    normalizeRole(
      getRole?.() ||
        adminState.profile?.role ||
        ""
    );

  await loadUsers();
  await loadTasks();
  await loadPayments();
  await loadPayRates();
  await loadActivity();

  calculateStats();

  showAdminPage(
    adminState.currentPage ||
      "overview"
  );
}

/* ============================================================
   OVERVIEW
   ============================================================ */

async function loadOverview() {
  calculateStats();

  setText(
    $("adminTotalUsers"),
    adminState.stats.users
  );

  setText(
    $("adminActiveUsers"),
    adminState.stats.active
  );

  setText(
    $("adminPendingUsers"),
    adminState.stats.pending
  );

  setText(
    $("adminTotalTasks"),
    adminState.stats.tasks
  );

  setText(
    $("adminAvailableTasks"),
    adminState.stats.available
  );

  setText(
    $("adminSubmittedTasks"),
    adminState.stats.submitted
  );

  setText(
    $("adminApprovedTasks"),
    adminState.stats.approved
  );

  setText(
    $("adminUnpaidPayments"),
    adminState.stats.unpaid
  );

  renderRecentActivity();
  renderTaskProgress();
}

function calculateStats() {
  const users =
    adminState.users || [];

  const tasks =
    adminState.tasks || [];

  const payments =
    adminState.payments || [];

  const stats = {
    users: users.length,

    customers: 0,
    coworkers: 0,
    reviewers: 0,
    staff: 0,
    admins: 0,

    pending: 0,
    active: 0,

    tasks: tasks.length,
    available: 0,
    claimed: 0,
    submitted: 0,
    approved: 0,
    skipped: 0,

    unpaid: 0,
    paid: 0,
  };

  users.forEach(
    (user) => {
      const role =
        normalizeRole(
          user.role
        );

      if (
        role ===
        "customer"
      ) {
        stats.customers++;
      }

      if (
        isCoworkerRole(role)
      ) {
        stats.coworkers++;
      }

      if (
        isReviewerRole(role)
      ) {
        stats.reviewers++;
      }

      if (
        isStaffRole(role) &&
        !isAdminRole(role)
      ) {
        stats.staff++;
      }

      if (
        isAdminRole(role)
      ) {
        stats.admins++;
      }

      if (
        user.active ===
          false ||
        user.status ===
          "pending"
      ) {
        stats.pending++;
      }

      if (
        user.active !==
          false
      ) {
        stats.active++;
      }
    }
  );

  tasks.forEach(
    (task) => {
      const status =
        normalizeTaskStatus(
          task.status
        );

      if (
        status ===
          "available" ||
        status === "open"
      ) {
        stats.available++;
      }

      if (
        task.claimed_by ||
        status === "claimed" ||
        status === "in_progress"
      ) {
        stats.claimed++;
      }

      if (
        status ===
          "submitted" ||
        status === "review"
      ) {
        stats.submitted++;
      }

      if (
        status ===
        "approved"
      ) {
        stats.approved++;
      }

      if (
        status ===
        "skipped"
      ) {
        stats.skipped++;
      }
    }
  );

  payments.forEach(
    (payment) => {
      if (
        payment.paid ===
          true ||
        payment.status ===
          "paid"
      ) {
        stats.paid++;
      } else {
        stats.unpaid++;
      }
    }
  );

  adminState.stats =
    stats;

  return stats;
}

/* ============================================================
   USERS
   ============================================================ */

export async function loadUsers() {
  if (!requireAdmin()) {
    return [];
  }

  const client =
    getClient();

  if (!client) {
    return [];
  }

  try {
    const {
      data,
      error,
    } = await client
      .from(TABLES.profiles)
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      console.error(
        "loadUsers:",
        error
      );

      toast(
        error.message ||
          "Unable to load users.",
        "error"
      );

      return [];
    }

    adminState.users =
      Array.isArray(data)
        ? data
        : [];

    calculateStats();

    renderUsers();
    renderCoworkers();

    return adminState.users;
  } catch (error) {
    console.error(
      "loadUsers exception:",
      error
    );

    return [];
  }
}

function renderUsers() {
  const container =
    $("usersList");

  if (!container) return;

  const users =
    adminState.users || [];

  if (!users.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          No users found.
        </div>
      `;

    return;
  }

  container.innerHTML =
    users
      .map(
        (user) =>
          renderUserRow(
            user
          )
      )
      .join("");
}

function renderUserRow(
  user
) {
  const role =
    normalizeRole(
      user.role
    );

  const active =
    user.active !== false;

  const isSelf =
    user.id ===
    adminState.user?.id;

  const isDefaultAdmin =
    String(
      user.email || ""
    ).toLowerCase() ===
    currentAdminEmail();

  const status =
    active
      ? "Active"
      : user.status ===
        "kicked"
      ? "Kicked"
      : "Pending";

  return `
    <div
      class="admin-user-row"
      data-user-id="${escapeHTML(
        user.id
      )}"
    >
      <div class="admin-user-main">
        <div class="admin-user-avatar">
          ${
            user.avatar_url
              ? `<img src="${escapeHTML(
                  user.avatar_url
                )}" alt="">`
              : escapeHTML(
                  text(
                    user.full_name,
                    "U"
                  )
                    .charAt(0)
                    .toUpperCase()
                )
          }
        </div>

        <div class="admin-user-info">
          <strong>
            ${escapeHTML(
              user.full_name ||
                user.name ||
                "Unnamed user"
            )}
          </strong>

          <span>
            ${escapeHTML(
              user.email ||
                "No email"
            )}
          </span>

          <small>
            Joined:
            ${escapeHTML(
              formatDate(
                user.created_at
              )
            )}
          </small>

          ${
            user.last_login_at
              ? `
                <small>
                  Last login:
                  ${escapeHTML(
                    formatDate(
                      user.last_login_at
                    )
                  )}
                </small>
              `
              : ""
          }
        </div>
      </div>

      <div class="admin-user-role">
        <select
          class="admin-role-select"
          data-user-role="${escapeHTML(
            user.id
          )}"
          ${
            isSelf ||
            isDefaultAdmin
              ? "disabled"
              : ""
          }
        >
          ${roleOptions(
            role
          )}
        </select>
      </div>

      <div class="admin-user-status">
        <span
          class="status-badge ${
            active
              ? "status-active"
              : "status-pending"
          }"
        >
          ${escapeHTML(
            status
          )}
        </span>
      </div>

      <div class="admin-user-actions">
        ${
          !active &&
          !isDefaultAdmin
            ? `
              <button
                type="button"
                class="admin-action-btn approve-user"
                data-user-id="${escapeHTML(
                  user.id
                )}"
              >
                Approve
              </button>
            `
            : ""
        }

        ${
          active &&
          !isSelf &&
          !isDefaultAdmin
            ? `
              <button
                type="button"
                class="admin-action-btn deactivate-user"
                data-user-id="${escapeHTML(
                  user.id
                )}"
              >
                Deactivate
              </button>
            `
            : ""
        }

        ${
          !isSelf &&
          !isDefaultAdmin
            ? `
              <button
                type="button"
                class="admin-action-btn danger kick-user"
                data-user-id="${escapeHTML(
                  user.id
                )}"
              >
                Kick
              </button>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function bindUserActions() {
  $("refreshUsersButton")
    ?.addEventListener(
      "click",
      () => loadUsers()
    );

  document.addEventListener(
    "change",
    async (event) => {
      const select =
        event.target.closest(
          ".admin-role-select"
        );

      if (!select) return;

      const userId =
        select.dataset.userRole;

      const role =
        select.value;

      await updateUserRole(
        userId,
        role
      );
    }
  );

  document.addEventListener(
    "click",
    async (event) => {
      const approve =
        event.target.closest(
          ".approve-user"
        );

      if (approve) {
        await setUserActive(
          approve.dataset.userId,
          true
        );

        return;
      }

      const deactivate =
        event.target.closest(
          ".deactivate-user"
        );

      if (deactivate) {
        await setUserActive(
          deactivate.dataset.userId,
          false
        );

        return;
      }

      const kick =
        event.target.closest(
          ".kick-user"
        );

      if (kick) {
        await kickUser(
          kick.dataset.userId
        );
      }
    }
  );
}

/* ============================================================
   USER ROLE MANAGEMENT
   ============================================================ */

export async function updateUserRole(
  userId,
  role
) {
  if (!requireAdmin()) {
    return false;
  }

  const client =
    getClient();

  if (!client) {
    return false;
  }

  const normalized =
    normalizeRole(role);

  if (!normalized) {
    toast(
      "Invalid role.",
      "error"
    );

    return false;
  }

  const user =
    adminState.users.find(
      (item) =>
        item.id ===
        userId
    );

  if (!user) {
    toast(
      "User not found.",
      "error"
    );

    return false;
  }

  const isDefaultAdmin =
    String(
      user.email || ""
    ).toLowerCase() ===
    currentAdminEmail();

  if (isDefaultAdmin) {
    toast(
      "The default administrator cannot be downgraded.",
      "warning"
    );

    renderUsers();

    return false;
  }

  try {
    const payload = {
      role: normalized,
      active: true,
    };

    let {
      error,
    } = await client
      .from(TABLES.profiles)
      .update(payload)
      .eq(
        "id",
        userId
      );

    if (error) {
      /*
       Some older profiles tables may not
       have active. Retry role-only update.
      */
      const retry =
        await client
          .from(TABLES.profiles)
          .update({
            role: normalized,
          })
          .eq(
            "id",
            userId
          );

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    await logAdminActivity(
      "role_changed",
      userId,
      {
        role: normalized,
      }
    );

    toast(
      `User role changed to ${roleLabel(
        normalized
      )}.`,
      "success"
    );

    await loadUsers();

    return true;
  } catch (error) {
    console.error(
      "updateUserRole:",
      error
    );

    toast(
      error.message ||
        "Unable to update user role.",
      "error"
    );

    renderUsers();

    return false;
  }
}

/* ============================================================
   USER ACTIVE / APPROVAL
   ============================================================ */

async function setUserActive(
  userId,
  active
) {
  if (!requireAdmin()) {
    return false;
  }

  const client =
    getClient();

  if (!client) return false;

  const user =
    adminState.users.find(
      (item) =>
        item.id ===
        userId
    );

  if (!user) {
    return false;
  }

  if (
    String(
      user.email || ""
    ).toLowerCase() ===
    currentAdminEmail()
  ) {
    toast(
      "The default administrator cannot be deactivated.",
      "warning"
    );

    return false;
  }

  try {
    const payload = {
      active,
    };

    if (active) {
      payload.status =
        "active";
    } else {
      payload.status =
        "pending";
    }

    let {
      error,
    } = await client
      .from(TABLES.profiles)
      .update(payload)
      .eq(
        "id",
        userId
      );

    if (error) {
      const retry =
        await client
          .from(TABLES.profiles)
          .update({
            active,
          })
          .eq(
            "id",
            userId
          );

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    await logAdminActivity(
      active
        ? "user_approved"
        : "user_deactivated",
      userId,
      {
        active,
      }
    );

    toast(
      active
        ? "User approved."
        : "User deactivated.",
      "success"
    );

    await loadUsers();

    return true;
  } catch (error) {
    console.error(
      "setUserActive:",
      error
    );

    toast(
      error.message ||
        "Unable to update user access.",
      "error"
    );

    return false;
  }
}

/* ============================================================
   KICK USER
   ============================================================ */

async function kickUser(
  userId
) {
  if (!requireAdmin()) {
    return false;
  }

  const user =
    adminState.users.find(
      (item) =>
        item.id ===
        userId
    );

  if (!user) {
    return false;
  }

  const email =
    String(
      user.email || ""
    ).toLowerCase();

  if (
    email ===
      currentAdminEmail() ||
    user.id ===
      adminState.user?.id
  ) {
    toast(
      "You cannot kick the administrator account.",
      "warning"
    );

    return false;
  }

  const confirmed =
    window.confirm(
      `Kick ${
        user.full_name ||
        user.email ||
        "this user"
      }?`
    );

  if (!confirmed) {
    return false;
  }

  const client =
    getClient();

  if (!client) return false;

  try {
    /*
     * We deliberately do not call
     * auth.admin.createUser/deleteUser
     * from the browser. A publishable key
     * cannot safely perform privileged
     * Auth Admin API operations.
     *
     * Setting profile access to false
     * immediately prevents workspace access.
     */

    let {
      error,
    } = await client
      .from(TABLES.profiles)
      .update({
        active: false,
        status: "kicked",
      })
      .eq(
        "id",
        userId
      );

    if (error) {
      const retry =
        await client
          .from(TABLES.profiles)
          .update({
            active: false,
          })
          .eq(
            "id",
            userId
          );

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    await logAdminActivity(
      "user_kicked",
      userId,
      {
        email:
          user.email,
      }
    );

    toast(
      "User has been kicked and access disabled.",
      "success"
    );

    await loadUsers();

    return true;
  } catch (error) {
    console.error(
      "kickUser:",
      error
    );

    toast(
      error.message ||
        "Unable to kick user.",
      "error"
    );

    return false;
  }
}

/* ============================================================
   COWORKERS
   ============================================================ */

async function loadCoworkers() {
  if (!adminState.users.length) {
    await loadUsers();
  }

  renderCoworkers();
}

function renderCoworkers() {
  const container =
    $("coworkersList");

  if (!container) return;

  const coworkers =
    adminState.users.filter(
      (user) =>
        isCoworkerRole(
          normalizeRole(
            user.role
          )
        )
    );

  if (!coworkers.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          No coworkers have been created yet.
        </div>
      `;

    return;
  }

  container.innerHTML =
    coworkers
      .map(
        (user) => {
          const role =
            normalizeRole(
              user.role
            );

          const assigned =
            adminState.tasks.filter(
              (task) =>
                task.assigned_to ===
                  user.id ||
                task.claimed_by ===
                  user.id
            ).length;

          return `
            <div
              class="admin-coworker-card"
              data-user-id="${escapeHTML(
                user.id
              )}"
            >
              <div>
                <strong>
                  ${escapeHTML(
                    user.full_name ||
                      user.name ||
                      "Unnamed"
                  )}
                </strong>

                <span>
                  ${escapeHTML(
                    user.email ||
                      ""
                  )}
                </span>
              </div>

              <div>
                <strong>
                  ${escapeHTML(
                    roleLabel(
                      role
                    )
                  )}
                </strong>

                <small>
                  ${assigned}
                  assigned task${
                    assigned ===
                    1
                      ? ""
                      : "s"
                  }
                </small>
              </div>

              <div>
                <span
                  class="status-badge ${
                    user.active !==
                    false
                      ? "status-active"
                      : "status-pending"
                  }"
                >
                  ${
                    user.active !==
                    false
                      ? "Active"
                      : "Inactive"
                  }
                </span>
              </div>
            </div>
          `;
        }
      )
      .join("");
}

/* ============================================================
   CREATE COWORKER / STAFF
   ============================================================ */

function bindCreateWorker() {
  $("createCoworkerButton")
    ?.addEventListener(
      "click",
      openCreateCoworkerModal
    );

  $("closeCreateCoworkerModal")
    ?.addEventListener(
      "click",
      closeCreateCoworkerModal
    );

  $("cancelCreateCoworker")
    ?.addEventListener(
      "click",
      closeCreateCoworkerModal
    );

  $("createCoworkerForm")
    ?.addEventListener(
      "submit",
      createCoworker
    );
}

function openCreateCoworkerModal() {
  if (!requireAdmin()) {
    return;
  }

  const modal =
    $("createCoworkerModal");

  if (!modal) return;

  showElement(
    modal,
    true
  );

  const role =
    $("newWorkerRole");

  if (role) {
    role.innerHTML = `
      <option value="coworker_2d_box">
        2D Box Coworker
      </option>

      <option value="coworker_polygon">
        Polygon Coworker
      </option>

      <option value="coworker_segmentation">
        Segmentation Coworker
      </option>

      <option value="reviewer">
        Reviewer
      </option>

      <option value="staff">
        Staff
      </option>

      <option value="admin">
        Administrator
      </option>
    `;
  }
}

function closeCreateCoworkerModal() {
  showElement(
    $("createCoworkerModal"),
    false
  );
}

async function createCoworker(
  event
) {
  event.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const name =
    $("newWorkerName")
      ?.value
      ?.trim();

  const email =
    $("newWorkerEmail")
      ?.value
      ?.trim()
      ?.toLowerCase();

  const password =
    $("newWorkerPassword")
      ?.value;

  const role =
    normalizeRole(
      $("newWorkerRole")
        ?.value
    );

  if (
    !name ||
    !email ||
    !password ||
    !role
  ) {
    toast(
      "Complete all account fields.",
      "warning"
    );

    return;
  }

  if (
    password.length <
    6
  ) {
    toast(
      "Password must contain at least 6 characters.",
      "warning"
    );

    return;
  }

  if (
    email ===
    currentAdminEmail()
  ) {
    toast(
      "That email is reserved for the administrator.",
      "error"
    );

    return;
  }

  const client =
    getClient();

  if (!client) {
    return;
  }

  try {
    const originalSession =
      (
        await client.auth.getSession()
      )?.data?.session;

    /*
     * Browser-safe account creation.
     *
     * We use Supabase signUp instead of
     * auth.admin.createUser because the
     * publishable key cannot safely execute
     * the Auth Admin API.
     */
    const {
      data,
      error,
    } =
      await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name:
              name,
            role,
            created_by_admin:
              true,
          },
        },
      });

    if (error) {
      throw error;
    }

    const newUser =
      data?.user;

    /*
     * If email confirmation is disabled,
     * signUp may return a session.
     *
     * If it did, restore the administrator
     * session immediately after writing the
     * profile.
     */
    if (newUser) {
      const {
        error:
          profileError,
      } = await client
        .from(
          TABLES.profiles
        )
        .upsert(
          {
            id:
              newUser.id,
            email,
            full_name:
              name,
            role,
            active: true,
            status:
              "active",
          },
          {
            onConflict:
              "id",
          }
        );

      if (profileError) {
        console.warn(
          "Profile creation warning:",
          profileError
        );
      }

      await logAdminActivity(
        "account_created",
        newUser.id,
        {
          email,
          name,
          role,
        }
      );
    }

    /*
     * Restore original admin session.
     */
    if (
      originalSession &&
      data?.session
    ) {
      await client.auth.setSession(
        originalSession
      );
    }

    closeCreateCoworkerModal();

    const form =
      $("createCoworkerForm");

    form?.reset();

    toast(
      data?.session
        ? "Account created successfully."
        : "Account created. If email confirmation is enabled, the user must confirm their email before signing in.",
      "success"
    );

    await loadUsers();
  } catch (error) {
    console.error(
      "createCoworker:",
      error
    );

    toast(
      error.message ||
        "Unable to create account.",
      "error"
    );
  }
}

/* ============================================================
   TASKS
   ============================================================ */

export async function loadTasks() {
  if (!requireAdmin()) {
    return [];
  }

  const client =
    getClient();

  if (!client) {
    return [];
  }

  try {
    const {
      data,
      error,
    } = await client
      .from(TABLES.tasks)
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    adminState.tasks =
      Array.isArray(data)
        ? data
        : [];

    calculateStats();

    renderTasks();
    renderTaskProgress();

    return adminState.tasks;
  } catch (error) {
    console.error(
      "loadTasks:",
      error
    );

    toast(
      error.message ||
        "Unable to load tasks.",
      "error"
    );

    return [];
  }
}

function normalizeTaskStatus(
  status
) {
  const value =
    String(
      status ||
        "available"
    )
      .trim()
      .toLowerCase();

  if (
    value ===
    "in-progress"
  ) {
    return "in_progress";
  }

  return value;
}

function taskWorkType(
  task
) {
  return (
    task.work_type ||
    task.workType ||
    task.annotation_type ||
    task.annotationType ||
    ""
  );
}

function taskWorkRole(
  task
) {
  return (
    normalizeRole(
      task.work_role ||
        task.workRole ||
        roleForWorkType(
          taskWorkType(task)
        ) ||
        ""
    )
  );
}

function taskTitle(
  task
) {
  return (
    task.title ||
    task.name ||
    task.task_name ||
    "Untitled task"
  );
}

function taskDuration(
  task
) {
  return number(
    task.expected_duration ??
      task.duration ??
      task.estimated_duration,
    0
  );
}

function taskPay(
  task
) {
  return number(
    task.pay ??
      task.payment ??
      task.pay_amount ??
      task.amount,
    0
  );
}

function renderTasks() {
  const container =
    $("adminTasksList");

  if (!container) return;

  if (
    !adminState.tasks.length
  ) {
    container.innerHTML =
      `
        <div class="empty-state">
          No tasks found.
        </div>
      `;

    return;
  }

  container.innerHTML =
    adminState.tasks
      .map(
        (task) =>
          renderTaskRow(
            task
          )
      )
      .join("");
}

function renderTaskRow(
  task
) {
  const status =
    normalizeTaskStatus(
      task.status
    );

  const workType =
    taskWorkType(task);

  const role =
    taskWorkRole(task);

  const assignedUser =
    adminState.users.find(
      (user) =>
        user.id ===
          task.assigned_to ||
        user.id ===
          task.claimed_by
    );

  return `
    <div
      class="admin-task-row"
      data-task-id="${escapeHTML(
        task.id
      )}"
    >
      <div class="admin-task-main">
        <strong>
          ${escapeHTML(
            taskTitle(task)
          )}
        </strong>

        <span>
          ID:
          ${escapeHTML(
            task.id
          )}
        </span>

        <small>
          Created:
          ${escapeHTML(
            formatDate(
              task.created_at
            )
          )}
        </small>
      </div>

      <div class="admin-task-work">
        <strong>
          ${escapeHTML(
            workType ||
              "Unspecified"
          )}
        </strong>

        <span>
          ${escapeHTML(
            roleLabel(
              role
            )
          )}
        </span>

        <small>
          ${escapeHTML(
            annotationTypeForRole(
              role
            ) || ""
          )}
        </small>
      </div>

      <div class="admin-task-status">
        <span
          class="status-badge status-${escapeHTML(
            status
          )}"
        >
          ${escapeHTML(
            status
          )}
        </span>

        ${
          task.claimed_by
            ? `
              <small>
                Claimed
              </small>
            `
            : ""
        }
      </div>

      <div class="admin-task-assignment">
        <select
          class="admin-task-assignee"
          data-task-id="${escapeHTML(
            task.id
          )}"
        >
          <option value="">
            Unassigned
          </option>

          ${workerOptions(
            task.assigned_to ||
              task.claimed_by ||
              "",
            role
          )}
        </select>
      </div>

      <div class="admin-task-actions">
        <button
          type="button"
          class="admin-action-btn view-task-progress"
          data-task-id="${escapeHTML(
            task.id
          )}"
        >
          Progress
        </button>

        ${
          status !==
          "approved"
            ? `
              <button
                type="button"
                class="admin-action-btn admin-approve-task"
                data-task-id="${escapeHTML(
                  task.id
                )}"
              >
                Approve
              </button>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function workerOptions(
  selectedId = "",
  taskRole = ""
) {
  const workers =
    adminState.users.filter(
      (user) => {
        const role =
          normalizeRole(
            user.role
          );

        if (
          user.active ===
          false
        ) {
          return false;
        }

        if (
          isAdminRole(role) ||
          isStaffRole(role) ||
          isReviewerRole(role)
        ) {
          return true;
        }

        return (
          !taskRole ||
          role ===
            normalizeRole(
              taskRole
            )
        );
      }
    );

  return workers
    .map(
      (user) => `
        <option
          value="${escapeHTML(
            user.id
          )}"
          ${
            user.id ===
            selectedId
              ? "selected"
              : ""
          }
        >
          ${escapeHTML(
            user.full_name ||
              user.email ||
              user.id
          )}
          —
          ${escapeHTML(
            roleLabel(
              normalizeRole(
                user.role
              )
            )
          )}
        </option>
      `
    )
    .join("");
}

/* ============================================================
   TASK ACTIONS
   ============================================================ */

function bindTaskActions() {
  $("createTaskButton")
    ?.addEventListener(
      "click",
      openCreateTaskModal
    );

  $("closeCreateTaskModal")
    ?.addEventListener(
      "click",
      closeCreateTaskModal
    );

  $("cancelCreateTask")
    ?.addEventListener(
      "click",
      closeCreateTaskModal
    );

  $("createTaskForm")
    ?.addEventListener(
      "submit",
      createTask
    );

  document.addEventListener(
    "change",
    async (event) => {
      const select =
        event.target.closest(
          ".admin-task-assignee"
        );

      if (!select) return;

      await assignTask(
        select.dataset.taskId,
        select.value || null
      );
    }
  );

  document.addEventListener(
    "click",
    async (event) => {
      const progress =
        event.target.closest(
          ".view-task-progress"
        );

      if (progress) {
        await showTaskProgress(
          progress.dataset.taskId
        );

        return;
      }

      const approve =
        event.target.closest(
          ".admin-approve-task"
        );

      if (approve) {
        await approveTask(
          approve.dataset.taskId
        );
      }
    }
  );
}

/* ============================================================
   ASSIGN / REASSIGN TASK
   ============================================================ */

export async function assignTask(
  taskId,
  userId
) {
  if (!requireAdmin()) {
    return false;
  }

  const client =
    getClient();

  if (!client) return false;

  const task =
    adminState.tasks.find(
      (item) =>
        item.id ===
        taskId
    );

  if (!task) {
    return false;
  }

  try {
    let {
      error,
    } = await client
      .from(TABLES.tasks)
      .update({
        assigned_to:
          userId,
      })
      .eq(
        "id",
        taskId
      );

    /*
     * Older schema fallback:
     * use claimed_by if assigned_to
     * does not exist.
     */
    if (error) {
      const retry =
        await client
          .from(TABLES.tasks)
          .update({
            claimed_by:
              userId,
          })
          .eq(
            "id",
            taskId
          );

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    await logAdminActivity(
      "task_reassigned",
      userId,
      {
        task_id:
          taskId,
        previous_assignee:
          task.assigned_to ||
          task.claimed_by ||
          null,
        new_assignee:
          userId,
      }
    );

    toast(
      userId
        ? "Task assigned successfully."
        : "Task unassigned.",
      "success"
    );

    await loadTasks();

    return true;
  } catch (error) {
    console.error(
      "assignTask:",
      error
    );

    toast(
      error.message ||
        "Unable to assign task.",
      "error"
    );

    await loadTasks();

    return false;
  }
}

/* ============================================================
   APPROVE TASK
   ============================================================ */

async function approveTask(
  taskId
) {
  if (!requireAdmin()) {
    return false;
  }

  const client =
    getClient();

  if (!client) return false;

  try {
    let rpcWorked =
      false;

    /*
     * Try project RPC first.
     */
    try {
      const {
        error,
      } = await client.rpc(
        "approve_task",
        {
          p_task_id:
            taskId,
          p_user_id:
            adminState.user?.id,
        }
      );

      if (!error) {
        rpcWorked = true;
      }
    } catch {
      rpcWorked = false;
    }

    if (!rpcWorked) {
      const {
        error,
      } = await client
        .from(TABLES.tasks)
        .update({
          status:
            "approved",
          approved_by:
            adminState.user?.id ||
            null,
          approved_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          taskId
        );

      if (error) {
        throw error;
      }
    }

    await logAdminActivity(
      "task_approved",
      null,
      {
        task_id:
          taskId,
      }
    );

    toast(
      "Task approved.",
      "success"
    );

    await loadTasks();

    return true;
  } catch (error) {
    console.error(
      "approveTask:",
      error
    );

    toast(
      error.message ||
        "Unable to approve task.",
      "error"
    );

    return false;
  }
}

/* ============================================================
   TASK PROGRESS
   ============================================================ */

async function showTaskProgress(
  taskId
) {
  if (!requireAdmin()) {
    return;
  }

  const task =
    adminState.tasks.find(
      (item) =>
        item.id ===
        taskId
    );

  if (!task) {
    return;
  }

  const client =
    getClient();

  let annotationCount =
    0;

  let annotationRows =
    [];

  if (client) {
    try {
      const {
        data,
        error,
      } = await client
        .from(
          TABLES.annotations
        )
        .select("*")
        .eq(
          "task_id",
          taskId
        );

      if (!error) {
        annotationRows =
          data || [];

        annotationCount =
          annotationRows.length;
      }
    } catch {
      // Annotation table may not exist.
    }
  }

  const assigned =
    adminState.users.find(
      (user) =>
        user.id ===
          task.assigned_to ||
        user.id ===
          task.claimed_by
    );

  const html = `
    <div class="admin-progress-overlay">
      <div class="admin-progress-dialog">
        <div class="admin-progress-header">
          <div>
            <h2>
              ${escapeHTML(
                taskTitle(task)
              )}
            </h2>

            <small>
              Task ID:
              ${escapeHTML(
                task.id
              )}
            </small>
          </div>

          <button
            type="button"
            class="admin-progress-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div class="admin-progress-grid">
          <div>
            <span>Status</span>
            <strong>
              ${escapeHTML(
                normalizeTaskStatus(
                  task.status
                )
              )}
            </strong>
          </div>

          <div>
            <span>Work type</span>
            <strong>
              ${escapeHTML(
                taskWorkType(task) ||
                  "—"
              )}
            </strong>
          </div>

          <div>
            <span>Role</span>
            <strong>
              ${escapeHTML(
                roleLabel(
                  taskWorkRole(
                    task
                  )
                )
              )}
            </strong>
          </div>

          <div>
            <span>Worker</span>
            <strong>
              ${escapeHTML(
                assigned?.full_name ||
                  assigned?.email ||
                  "Unassigned"
              )}
            </strong>
          </div>

          <div>
            <span>Annotations</span>
            <strong>
              ${annotationCount}
            </strong>
          </div>

          <div>
            <span>Created</span>
            <strong>
              ${escapeHTML(
                formatDate(
                  task.created_at
                )
              )}
            </strong>
          </div>

          <div>
            <span>Updated</span>
            <strong>
              ${escapeHTML(
                formatDate(
                  task.updated_at
                )
              )}
            </strong>
          </div>

          <div>
            <span>Pay</span>
            <strong>
              ${formatMoney(
                taskPay(task)
              )}
            </strong>
          </div>
        </div>

        <div class="admin-progress-annotations">
          <h3>
            Annotation progress
          </h3>

          ${
            annotationRows.length
              ? `
                <div class="admin-progress-list">
                  ${annotationRows
                    .map(
                      (
                        annotation,
                        index
                      ) => `
                        <div>
                          <strong>
                            #${
                              index + 1
                            }
                            ${
                              escapeHTML(
                                annotation.label ||
                                  annotation.classification ||
                                  "object"
                              )
                            }
                          </strong>

                          <span>
                            ${escapeHTML(
                              annotation.type ||
                                "box"
                            )}
                          </span>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              `
              : `
                <p>
                  No annotation rows found for this task.
                </p>
              `
          }
        </div>
      </div>
    </div>
  `;

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.innerHTML =
    html;

  const overlay =
    wrapper.firstElementChild;

  document.body.appendChild(
    overlay
  );

  overlay
    .querySelector(
      ".admin-progress-close"
    )
    ?.addEventListener(
      "click",
      () => {
        overlay.remove();
      }
    );

  overlay.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        overlay
      ) {
        overlay.remove();
      }
    }
  );
}

/* ============================================================
   CREATE TASK
   ============================================================ */

function openCreateTaskModal() {
  if (!requireAdmin()) {
    return;
  }

  showElement(
    $("createTaskModal"),
    true
  );
}

function closeCreateTaskModal() {
  showElement(
    $("createTaskModal"),
    false
  );
}

async function createTask(
  event
) {
  event.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const client =
    getClient();

  if (!client) return;

  const title =
    $("taskTitle")
      ?.value
      ?.trim();

  const workType =
    $("taskShape")
      ?.value
      ?.trim();

  const duration =
    number(
      $("taskDuration")
        ?.value,
      0
    );

  const pay =
    number(
      $("taskPay")
        ?.value,
      0
    );

  const file =
    $("taskMediaInput")
      ?.files?.[0];

  if (
    !title ||
    !workType
  ) {
    toast(
      "Enter a task title and work type.",
      "warning"
    );

    return;
  }

  try {
    let mediaPath =
      null;

    /*
     * Optional direct upload.
     */
    if (file) {
      const bucket =
        APP_CONFIG?.buckets
          ?.taskMedia ||
        "task-media";

      const extension =
        file.name.includes(".")
          ? file.name
              .split(".")
              .pop()
              .toLowerCase()
          : "bin";

      const path =
        `admin-created/${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}.${extension}`;

      const {
        error:
          uploadError,
      } = await client.storage
        .from(bucket)
        .upload(
          path,
          file,
          {
            upsert:
              false,
            contentType:
              file.type ||
              undefined,
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      mediaPath =
        path;
    }

    const workRole =
      roleForWorkType(
        workType
      ) ||
      "";

    const payload = {
      title,
      work_type:
        workType,
      work_role:
        normalizeRole(
          workRole
        ),
      status:
        "available",
      created_by:
        adminState.user?.id ||
        null,
      expected_duration:
        duration,
      duration,
      pay,
      media_path:
        mediaPath,
      metadata: {
        created_by_admin:
          true,
      },
    };

    let {
      data,
      error,
    } = await client
      .from(TABLES.tasks)
      .insert(payload)
      .select()
      .single();

    /*
     * Fallback for older schemas.
     */
    if (error) {
      const fallback = {
        title,
        work_type:
          workType,
        status:
          "available",
        created_by:
          adminState.user?.id ||
          null,
        duration,
        pay,
        media_path:
          mediaPath,
      };

      const retry =
        await client
          .from(TABLES.tasks)
          .insert(
            fallback
          )
          .select()
          .single();

      data =
        retry.data;

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    await logAdminActivity(
      "task_created",
      null,
      {
        task_id:
          data?.id ||
          null,
        title,
        work_type:
          workType,
      }
    );

    closeCreateTaskModal();

    $("createTaskForm")
      ?.reset();

    toast(
      "Task created successfully.",
      "success"
    );

    await loadTasks();
  } catch (error) {
    console.error(
      "createTask:",
      error
    );

    toast(
      error.message ||
        "Unable to create task.",
      "error"
    );
  }
}

/* ============================================================
   PAY RATES
   ============================================================ */

async function loadPayRates() {
  if (!requireAdmin()) {
    return [];
  }

  const client =
    getClient();

  if (!client) return [];

  try {
    const {
      data,
      error,
    } = await client
      .from(
        TABLES.payRates
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );

    if (error) {
      /*
       * Missing table is not fatal.
       */
      console.warn(
        "Pay rates table:",
        error.message
      );

      adminState.payRates =
        [];

      renderPayRates();

      return [];
    }

    adminState.payRates =
      data || [];

    renderPayRates();

    return adminState.payRates;
  } catch (error) {
    console.warn(
      "loadPayRates:",
      error
    );

    adminState.payRates =
      [];

    renderPayRates();

    return [];
  }
}

function renderPayRates() {
  const container =
    $("payRatesList");

  if (!container) return;

  const rates =
    adminState.payRates || [];

  const workers =
    adminState.users.filter(
      (user) =>
        isCoworkerRole(
          normalizeRole(
            user.role
          )
        ) ||
        isReviewer(
          normalizeRole(
            user.role
          )
        )
    );

  let html = "";

  if (rates.length) {
    html += rates
      .map(
        (rate) => `
          <div
            class="admin-rate-row"
            data-rate-id="${escapeHTML(
              rate.id
            )}"
          >
            <div>
              <strong>
                ${escapeHTML(
                  rate.work_type ||
                    rate.annotation_type ||
                    "All work"
                )}
              </strong>

              <span>
                ${escapeHTML(
                  roleLabel(
                    normalizeRole(
                      rate.role ||
                        rate.work_role ||
                        ""
                    )
                  )
                )}
              </span>
            </div>

            <div>
              <input
                type="number"
                min="0"
                step="0.01"
                value="${escapeHTML(
                  rate.rate ??
                    rate.amount ??
                    0
                )}"
                data-rate-value="${escapeHTML(
                  rate.id
                )}"
              />
            </div>

            <button
              type="button"
              class="admin-action-btn save-rate"
              data-rate-id="${escapeHTML(
                rate.id
              )}"
            >
              Save
            </button>
          </div>
        `
      )
      .join("");
  }

  html += `
    <div class="admin-rate-create">
      <h3>
        Add pay rate
      </h3>

      <div class="admin-rate-form">
        <select
          id="newRateRole"
        >
          ${roleOptions(
            "coworker_2d_box"
          )}
        </select>

        <input
          id="newRateWorkType"
          type="text"
          placeholder="Work type"
        />

        <input
          id="newRateAmount"
          type="number"
          min="0"
          step="0.01"
          placeholder="Rate"
        />

        <button
          type="button"
          class="admin-action-btn"
          id="createRateButton"
        >
          Add rate
        </button>
      </div>
    </div>
  `;

  if (
    !rates.length
  ) {
    html =
      `
        <div class="empty-state">
          No pay rates have been configured.
        </div>
      ` +
      html;
  }

  container.innerHTML =
    html;

  container
    .querySelectorAll(
      ".save-rate"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () =>
            savePayRate(
              button.dataset.rateId
            )
        );
      }
    );

  $("createRateButton")
    ?.addEventListener(
      "click",
      createPayRate
    );
}

async function createPayRate() {
  if (!requireAdmin()) {
    return;
  }

  const client =
    getClient();

  if (!client) return;

  const role =
    normalizeRole(
      $("newRateRole")
        ?.value
    );

  const workType =
    $("newRateWorkType")
      ?.value
      ?.trim();

  const amount =
    number(
      $("newRateAmount")
        ?.value,
      0
    );

  if (
    !role ||
    amount <= 0
  ) {
    toast(
      "Enter a valid role and rate.",
      "warning"
    );

    return;
  }

  try {
    const payload = {
      role,
      work_role:
        role,
      work_type:
        workType ||
        null,
      rate:
        amount,
      amount,
      created_by:
        adminState.user?.id ||
        null,
    };

    let {
      error,
    } = await client
      .from(
        TABLES.payRates
      )
      .insert(payload);

    if (error) {
      const retry =
        await client
          .from(
            TABLES.payRates
          )
          .insert({
            role,
            work_type:
              workType ||
              null,
            rate:
              amount,
          });

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    toast(
      "Pay rate added.",
      "success"
    );

    await loadPayRates();
  } catch (error) {
    console.error(
      "createPayRate:",
      error
    );

    toast(
      error.message ||
        "Unable to create pay rate.",
      "error"
    );
  }
}

async function savePayRate(
  rateId
) {
  if (!requireAdmin()) {
    return;
  }

  const client =
    getClient();

  if (!client) return;

  const input =
    document.querySelector(
      `[data-rate-value="${CSS.escape(
        rateId
      )}"]`
    );

  const amount =
    number(
      input?.value,
      0
    );

  if (amount < 0) {
    toast(
      "Rate cannot be negative.",
      "warning"
    );

    return;
  }

  try {
    let {
      error,
    } = await client
      .from(
        TABLES.payRates
      )
      .update({
        rate:
          amount,
        amount,
          updated_at:
            new Date().toISOString(),
      })
      .eq(
        "id",
        rateId
      );

    if (error) {
      const retry =
        await client
          .from(
            TABLES.payRates
          )
          .update({
            rate:
              amount,
          })
          .eq(
            "id",
            rateId
          );

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    toast(
      "Pay rate updated.",
      "success"
    );

    await loadPayRates();
  } catch (error) {
    console.error(
      "savePayRate:",
      error
    );

    toast(
      error.message ||
        "Unable to update pay rate.",
      "error"
    );
  }
}

function bindRateActions() {
  // Dynamic rate buttons are bound when rendered.
}

/* ============================================================
   PAYMENTS
   ============================================================ */

async function loadPayments() {
  if (!requireAdmin()) {
    return [];
  }

  const client =
    getClient();

  if (!client) return [];

  try {
    const {
      data,
      error,
    } = await client
      .from(
        TABLES.payments
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );

    if (error) {
      console.warn(
        "Payments table:",
        error.message
      );

      adminState.payments =
        [];

      renderPayments();

      return [];
    }

    adminState.payments =
      data || [];

    calculateStats();
    renderPayments();

    return adminState.payments;
  } catch (error) {
    console.warn(
      "loadPayments:",
      error
    );

    adminState.payments =
      [];

    renderPayments();

    return [];
  }
}

function paymentUser(
  payment
) {
  return adminState.users.find(
    (user) =>
      user.id ===
        payment.user_id ||
      user.id ===
        payment.worker_id ||
      user.id ===
        payment.coworker_id
  );
}

function renderPayments() {
  const container =
    $("paymentsList");

  if (!container) return;

  const payments =
    adminState.payments || [];

  if (!payments.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          No payment records found.
        </div>
      `;

    return;
  }

  container.innerHTML =
    payments
      .map(
        (payment) => {
          const user =
            paymentUser(
              payment
            );

          const paid =
            payment.paid ===
              true ||
            payment.status ===
              "paid";

          const amount =
            payment.amount ??
            payment.pay ??
            payment.total ??
            0;

          return `
            <div
              class="admin-payment-row"
              data-payment-id="${escapeHTML(
                payment.id
              )}"
            >
              <div>
                <strong>
                  ${escapeHTML(
                    user?.full_name ||
                      user?.email ||
                      payment.user_email ||
                      "Unknown user"
                  )}
                </strong>

                <span>
                  ${escapeHTML(
                    user?.email ||
                      payment.user_email ||
                      ""
                  )}
                </span>
              </div>

              <div>
                <strong>
                  ${formatMoney(
                    amount
                  )}
                </strong>

                <small>
                  ${escapeHTML(
                    payment.currency ||
                      ""
                  )}
                </small>
              </div>

              <div>
                <span
                  class="status-badge ${
                    paid
                      ? "status-active"
                      : "status-pending"
                  }"
                >
                  ${
                    paid
                      ? "Paid"
                      : "Not paid"
                  }
                </span>
              </div>

              <div>
                ${
                  paid
                    ? `
                      <button
                        type="button"
                        class="admin-action-btn payment-unpaid"
                        data-payment-id="${escapeHTML(
                          payment.id
                        )}"
                      >
                        Mark unpaid
                      </button>
                    `
                    : `
                      <button
                        type="button"
                        class="admin-action-btn payment-paid"
                        data-payment-id="${escapeHTML(
                          payment.id
                        )}"
                      >
                        Mark paid
                      </button>
                    `
                }
              </div>
            </div>
          `;
        }
      )
      .join("");
}

function bindPaymentActions() {
  $("paymentsList")
    ?.addEventListener(
      "click",
      async (event) => {
        const paid =
          event.target.closest(
            ".payment-paid"
          );

        if (paid) {
          await setPaymentStatus(
            paid.dataset.paymentId,
            true
          );

          return;
        }

        const unpaid =
          event.target.closest(
            ".payment-unpaid"
          );

        if (unpaid) {
          await setPaymentStatus(
            unpaid.dataset.paymentId,
            false
          );
        }
      }
    );
}

async function setPaymentStatus(
  paymentId,
  paid
) {
  if (!requireAdmin()) {
    return false;
  }

  const client =
    getClient();

  if (!client) return false;

  try {
    const payload = {
      paid,
      status:
        paid
          ? "paid"
          : "unpaid",
      paid_at:
        paid
          ? new Date().toISOString()
          : null,
      paid_by:
        paid
          ? adminState.user?.id ||
            null
          : null,
    };

    let {
      error,
    } = await client
      .from(
        TABLES.payments
      )
      .update(payload)
      .eq(
        "id",
        paymentId
      );

    if (error) {
      const retry =
        await client
          .from(
            TABLES.payments
          )
          .update({
            paid,
            status:
              paid
                ? "paid"
                : "unpaid",
          })
          .eq(
            "id",
            paymentId
          );

      error =
        retry.error;
    }

    if (error) {
      throw error;
    }

    await logAdminActivity(
      paid
        ? "payment_paid"
        : "payment_unpaid",
      null,
      {
        payment_id:
          paymentId,
      }
    );

    toast(
      paid
        ? "Payment marked as paid."
        : "Payment marked as unpaid.",
      "success"
    );

    await loadPayments();

    return true;
  } catch (error) {
    console.error(
      "setPaymentStatus:",
      error
    );

    toast(
      error.message ||
        "Unable to update payment.",
      "error"
    );

    return false;
  }
}

/* ============================================================
   ACTIVITY
   ============================================================ */

async function loadActivity() {
  if (!requireAdmin()) {
    return [];
  }

  const client =
    getClient();

  if (!client) return [];

  try {
    const {
      data,
      error,
    } = await client
      .from(
        TABLES.activities
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(200);

    if (error) {
      console.warn(
        "Activity table:",
        error.message
      );

      adminState.activities =
        [];

      renderActivity();

      return [];
    }

    adminState.activities =
      data || [];

    renderActivity();
    renderRecentActivity();

    return adminState.activities;
  } catch (error) {
    console.warn(
      "loadActivity:",
      error
    );

    adminState.activities =
      [];

    renderActivity();

    return [];
  }
}

function activityAction(
  activity
) {
  return (
    activity.action ||
    activity.event ||
    activity.event_type ||
    "activity"
  );
}

function activityUser(
  activity
) {
  return adminState.users.find(
    (user) =>
      user.id ===
        activity.user_id ||
      user.id ===
        activity.actor_id
  );
}

function renderActivity() {
  const container =
    $("activityList");

  if (!container) return;

  const activities =
    adminState.activities || [];

  if (!activities.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          No activity records found.
        </div>
      `;

    return;
  }

  container.innerHTML =
    activities
      .map(
        (activity) => {
          const user =
            activityUser(
              activity
            );

          return `
            <div class="admin-activity-row">
              <div>
                <strong>
                  ${escapeHTML(
                    activityAction(
                      activity
                    )
                  )}
                </strong>

                <span>
                  ${escapeHTML(
                    user?.full_name ||
                      user?.email ||
                      activity.email ||
                      "System"
                  )}
                </span>
              </div>

              <div>
                ${escapeHTML(
                  formatDate(
                    activity.created_at ||
                      activity.timestamp
                  )
                )}
              </div>

              <div>
                <code>
                  ${escapeHTML(
                    JSON.stringify(
                      activity.metadata ||
                        activity.details ||
                        {}
                    )
                  )}
                </code>
              </div>
            </div>
          `;
        }
      )
      .join("");
}

function renderRecentActivity() {
  const container =
    $("adminRecentActivity");

  if (!container) return;

  const activities =
    (
      adminState.activities ||
      []
    ).slice(
      0,
      10
    );

  if (!activities.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          No recent activity.
        </div>
      `;

    return;
  }

  container.innerHTML =
    activities
      .map(
        (activity) => {
          const user =
            activityUser(
              activity
            );

          return `
            <div class="admin-recent-item">
              <strong>
                ${escapeHTML(
                  activityAction(
                    activity
                  )
                )}
              </strong>

              <span>
                ${escapeHTML(
                  user?.full_name ||
                    user?.email ||
                    "System"
                )}
              </span>

              <small>
                ${escapeHTML(
                  formatDate(
                    activity.created_at ||
                      activity.timestamp
                  )
                )}
              </small>
            </div>
          `;
        }
      )
      .join("");
}

/* ============================================================
   ADMIN ACTIVITY WRAPPER
   ============================================================ */

async function logAdminActivity(
  action,
  targetUserId = null,
  metadata = {}
) {
  const actor =
    adminState.user?.id ||
    null;

  try {
    await logActivity(
      action,
      {
        actor_id:
          actor,
        user_id:
          targetUserId,
        metadata,
      }
    );
  } catch {
    /*
     * Compatibility fallback for projects
     * where logActivity has a different
     * signature.
     */
    try {
      const client =
        getClient();

      if (!client) return;

      await client
        .from(
          TABLES.activities
        )
        .insert({
          user_id:
            targetUserId ||
            actor,
          actor_id:
            actor,
          action,
          metadata,
          created_at:
            new Date().toISOString(),
        });
    } catch (error) {
      console.warn(
        "Unable to write admin activity:",
        error
      );
    }
  }
}

/* ============================================================
   TASK PROGRESS DASHBOARD
   ============================================================ */

function renderTaskProgress() {
  const container =
    $("adminTaskProgress");

  if (!container) return;

  const tasks =
    adminState.tasks || [];

  if (!tasks.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          No task progress available.
        </div>
      `;

    return;
  }

  const counts = {
    available: 0,
    claimed: 0,
    submitted: 0,
    approved: 0,
    skipped: 0,
  };

  tasks.forEach(
    (task) => {
      const status =
        normalizeTaskStatus(
          task.status
        );

      if (
        status ===
          "available" ||
        status ===
          "open"
      ) {
        counts.available++;
      } else if (
        status ===
          "claimed" ||
        status ===
          "in_progress"
      ) {
        counts.claimed++;
      } else if (
        status ===
          "submitted" ||
        status ===
          "review"
      ) {
        counts.submitted++;
      } else if (
        status ===
        "approved"
      ) {
        counts.approved++;
      } else if (
        status ===
        "skipped"
      ) {
        counts.skipped++;
      }
    }
  );

  const total =
    tasks.length || 1;

  container.innerHTML = `
    <div class="admin-progress-summary">
      ${progressBar(
        "Available",
        counts.available,
        total
      )}

      ${progressBar(
        "Claimed / In progress",
        counts.claimed,
        total
      )}

      ${progressBar(
        "Submitted",
        counts.submitted,
        total
      )}

      ${progressBar(
        "Approved",
        counts.approved,
        total
      )}

      ${progressBar(
        "Skipped",
        counts.skipped,
        total
      )}
    </div>
  `;
}

function progressBar(
  label,
  count,
  total
) {
  const percent =
    Math.round(
      (count / total) *
        100
    );

  return `
    <div class="admin-progress-bar-row">
      <div>
        <span>
          ${escapeHTML(
            label
          )}
        </span>

        <strong>
          ${count}
        </strong>
      </div>

      <div class="admin-progress-track">
        <div
          class="admin-progress-fill"
          style="width:${percent}%"
        ></div>
      </div>
    </div>
  `;
}

/* ============================================================
   EXPORT
   ============================================================ */

function renderExportPage() {
  const output =
    $("adminExportOutput");

  if (!output) return;

  const rows =
    buildExportRows();

  adminState.exportRows =
    rows;

  if (!rows.length) {
    output.textContent =
      "No work data available for export.";

    return;
  }

  output.textContent =
    JSON.stringify(
      rows,
      null,
      2
    );
}

function buildExportRows() {
  const users =
    adminState.users || [];

  const tasks =
    adminState.tasks || [];

  const payments =
    adminState.payments || [];

  const rows = [];

  tasks.forEach(
    (task) => {
      const worker =
        users.find(
          (user) =>
            user.id ===
              task.assigned_to ||
            user.id ===
              task.claimed_by
        );

      const payment =
        payments.find(
          (item) =>
            item.task_id ===
            task.id
        );

      rows.push({
        task_id:
          task.id,

        title:
          taskTitle(task),

        work_type:
          taskWorkType(task),

        work_role:
          taskWorkRole(task),

        annotation_type:
          annotationTypeForRole(
            taskWorkRole(
              task
            )
          ) || "",

        status:
          normalizeTaskStatus(
            task.status
          ),

        worker_id:
          worker?.id ||
          "",

        worker_name:
          worker?.full_name ||
          "",

        worker_email:
          worker?.email ||
          "",

        created_at:
          task.created_at ||
          "",

        updated_at:
          task.updated_at ||
          "",

        duration:
          taskDuration(task),

        pay:
          taskPay(task),

        payment_status:
          payment?.status ||
          (
            payment?.paid
              ? "paid"
              : ""
          ),

        paid_at:
          payment?.paid_at ||
          "",
      });
    }
  );

  return rows;
}

function rowsToCSV(
  rows
) {
  if (!rows.length) {
    return "";
  }

  const columns =
    [
      ...new Set(
        rows.flatMap(
          (row) =>
            Object.keys(
              row
            )
        )
      ),
    ];

  const escapeCSV =
    (value) => {
      const string =
        String(
          value ?? ""
        );

      return `"${string.replaceAll(
        '"',
        '""'
      )}"`;
    };

  return [
    columns
      .map(escapeCSV)
      .join(","),
    ...rows.map(
      (row) =>
        columns
          .map(
            (column) =>
              escapeCSV(
                row[
                  column
                ]
              )
          )
          .join(",")
    ),
  ].join("\n");
}

function exportCSV() {
  if (!requireAdmin()) {
    return;
  }

  const rows =
    buildExportRows();

  if (!rows.length) {
    toast(
      "There is no work to export.",
      "warning"
    );

    return;
  }

  const csv =
    rowsToCSV(rows);

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    `work-export-${Date.now()}.csv`;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );

  logAdminActivity(
    "work_export_csv",
    null,
    {
      rows:
        rows.length,
    }
  );

  toast(
    "CSV export created.",
    "success"
  );
}

function exportHTML() {
  if (!requireAdmin()) {
    return;
  }

  const rows =
    buildExportRows();

  if (!rows.length) {
    toast(
      "There is no work to export.",
      "warning"
    );

    return;
  }

  const columns =
    [
      ...new Set(
        rows.flatMap(
          (row) =>
            Object.keys(
              row
            )
        )
      ),
    ];

  const htmlRows =
    rows
      .map(
        (row) =>
          `
            <tr>
              ${columns
                .map(
                  (column) =>
                    `<td>${escapeHTML(
                      row[
                        column
                      ]
                    )}</td>`
                )
                .join("")}
            </tr>
          `
      )
      .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Annotation Work Export</title>
<style>
body {
  font-family: Arial, sans-serif;
  margin: 30px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  border: 1px solid #ccc;
  padding: 8px;
  text-align: left;
}
th {
  font-weight: 700;
}
</style>
</head>
<body>
<h1>Annotation Work Export</h1>
<p>
Generated:
${escapeHTML(
  new Date().toLocaleString()
)}
</p>
<table>
<thead>
<tr>
${columns
  .map(
    (column) =>
      `<th>${escapeHTML(
        column
      )}</th>`
  )
  .join("")}
</tr>
</thead>
<tbody>
${htmlRows}
</tbody>
</table>
</body>
</html>
`;

  const blob =
    new Blob(
      [html],
      {
        type:
          "text/html;charset=utf-8;",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    `work-export-${Date.now()}.html`;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );

  logAdminActivity(
    "work_export_html",
    null,
    {
      rows:
        rows.length,
    }
  );

  toast(
    "HTML export created.",
    "success"
  );
}

function bindExportActions() {
  $("copyAdminCSV")
    ?.addEventListener(
      "click",
      async () => {
        if (
          !requireAdmin()
        ) {
          return;
        }

        const rows =
          buildExportRows();

        const csv =
          rowsToCSV(rows);

        try {
          await navigator.clipboard.writeText(
            csv
          );

          toast(
            "CSV copied to clipboard.",
            "success"
          );
        } catch {
          const output =
            $("adminExportOutput");

          if (output) {
            output.textContent =
              csv;
          }

          toast(
            "CSV generated below. Clipboard permission was unavailable.",
            "info"
          );
        }
      }
    );

  $("downloadAdminHTML")
    ?.addEventListener(
      "click",
      exportHTML
    );
}

/* ============================================================
   ADMIN BUTTONS
   ============================================================ */

function bindAdminButtons() {
  /*
   * Some HTML versions may contain
   * explicit refresh buttons.
   */

  document.addEventListener(
    "click",
    async (event) => {
      const refresh =
        event.target.closest(
          "[data-admin-refresh]"
        );

      if (!refresh) return;

      const target =
        refresh.dataset
          .adminRefresh;

      if (
        target ===
        "users"
      ) {
        await loadUsers();
      }

      if (
        target ===
        "tasks"
      ) {
        await loadTasks();
      }

      if (
        target ===
        "payments"
      ) {
        await loadPayments();
      }

      if (
        target ===
        "rates"
      ) {
        await loadPayRates();
      }

      if (
        target ===
        "activity"
      ) {
        await loadActivity();
      }
    }
  );
}

/* ============================================================
   USER SEARCH / FILTER
   ============================================================ */

function addUserSearchIfPresent() {
  const input =
    $("adminUserSearch");

  if (!input) return;

  input.addEventListener(
    "input",
    () => {
      const query =
        input.value
          .trim()
          .toLowerCase();

      qsa(
        ".admin-user-row"
      ).forEach(
        (row) => {
          const visible =
            row.textContent
              .toLowerCase()
              .includes(
                query
              );

          showElement(
            row,
            visible
          );
        }
      );
    }
  );
}

/* ============================================================
   TASK SEARCH
   ============================================================ */

function addTaskSearchIfPresent() {
  const input =
    $("adminTaskSearch");

  if (!input) return;

  input.addEventListener(
    "input",
    () => {
      const query =
        input.value
          .trim()
          .toLowerCase();

      qsa(
        ".admin-task-row"
      ).forEach(
        (row) => {
          const visible =
            row.textContent
              .toLowerCase()
              .includes(
                query
              );

          showElement(
            row,
            visible
          );
        }
      );
    }
  );
}

/* ============================================================
   ADMIN KEYBOARD SHORTCUTS
   ============================================================ */

function bindKeyboard() {
  document.addEventListener(
    "keydown",
    (event) => {
      const modal =
        $("adminModal");

      if (
        !modal ||
        modal.hidden
      ) {
        return;
      }

      if (
        event.key ===
        "Escape"
      ) {
        closeAdminCenter();
      }
    }
  );
}

/* ============================================================
   ROLE / TASK ROUTING HELPERS
   ============================================================ */

export function getWorkerRoleForTask(
  task
) {
  return taskWorkRole(
    task
  );
}

export function getAnnotationTypeForTask(
  task
) {
  const role =
    taskWorkRole(
      task
    );

  return (
    annotationTypeForRole(
      role
    ) || ""
  );
}

export function getAvailableWorkers(
  role = ""
) {
  const normalized =
    normalizeRole(
      role
    );

  return adminState.users.filter(
    (user) => {
      if (
        user.active ===
        false
      ) {
        return false;
      }

      const workerRole =
        normalizeRole(
          user.role
        );

      if (
        isAdminRole(
          workerRole
        ) ||
        isStaffRole(
          workerRole
        )
      ) {
        return true;
      }

      if (!normalized) {
        return isCoworkerRole(
          workerRole
        );
      }

      return (
        workerRole ===
        normalized
      );
    }
  );
}

/* ============================================================
   REFRESH ALL
   ============================================================ */

export async function refreshAdminData() {
  if (!requireAdmin()) {
    return;
  }

  adminState.loading =
    true;

  try {
    await Promise.all([
      loadUsers(),
      loadTasks(),
      loadPayments(),
      loadPayRates(),
      loadActivity(),
    ]);

    calculateStats();

    showAdminPage(
      adminState.currentPage
    );
  } finally {
    adminState.loading =
      false;
  }
}

/* ============================================================
   AUTH EVENT HANDLING
   ============================================================ */

function bindAuthEvents() {
  window.addEventListener(
    "authStateChanged",
    async () => {
      adminState.user =
        getCurrentUser?.() ||
        null;

      adminState.profile =
        getCurrentProfile?.() ||
        null;

      adminState.role =
        normalizeRole(
          getRole?.() ||
            adminState.profile
              ?.role ||
            ""
        );

      hideAdminFromNonAdmin();

      if (
        isCurrentUserAdmin()
      ) {
        if (
          $("adminModal") &&
          !$("adminModal").hidden
        ) {
          await refreshAdminData();
        }
      } else {
        closeAdminCenter();
      }
    }
  );
}

/* ============================================================
   ADMIN PROFILE DATA
   ============================================================ */

function refreshAdminIdentity() {
  adminState.user =
    getCurrentUser?.() ||
    getSupabaseUser?.() ||
    adminState.user;

  adminState.profile =
    getCurrentProfile?.() ||
    adminState.profile;

  adminState.role =
    normalizeRole(
      getRole?.() ||
        adminState.profile?.role ||
        ""
    );
}

/* ============================================================
   STAFF RESTRICTIONS
   ============================================================ */

function applyStaffRestrictions() {
  const role =
    normalizeRole(
      adminState.role
    );

  /*
   * Staff receive broad operational
   * access, but only administrators can
   * manage administrators / create admin
   * accounts / kick the default admin.
   */

  if (
    isAdminRole(role)
  ) {
    return;
  }

  if (
    isStaffRole(role)
  ) {
    qsa(
      '[data-admin-only="true"]'
    ).forEach(
      (element) => {
        element.disabled =
          true;

        element.title =
          "Administrator permission required.";
      }
    );
  }
}

/* ============================================================
   INITIALIZE AFTER DOM
   ============================================================ */

async function boot() {
  refreshAdminIdentity();

  await initializeAdmin();

  addUserSearchIfPresent();
  addTaskSearchIfPresent();

  bindKeyboard();
  bindAuthEvents();

  applyStaffRestrictions();
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    boot,
    {
      once: true,
    }
  );
} else {
  boot();
}

/* ============================================================
   WINDOW COMPATIBILITY
   ============================================================ */

window.admin = {
  state:
    adminState,

  open:
    openAdminCenter,

  close:
    closeAdminCenter,

  showPage:
    showAdminPage,

  loadUsers,

  loadTasks,

  loadPayments,

  loadPayRates,

  loadActivity,

  refresh:
    refreshAdminData,

  assignTask,

  approveTask,

  updateUserRole,

  getWorkerRoleForTask,

  getAnnotationTypeForTask,

  getAvailableWorkers,

  exportCSV,

  exportHTML,
};

/* ============================================================
   EXPORTS
   ============================================================ */

export {
  loadCoworkers,
  createCoworker,
  createTask,
  approveTask,
  loadPayRates,
  loadPayments,
  loadActivity,
  renderUsers,
  renderTasks,
  renderPayments,
  renderActivity,
  exportCSV,
  exportHTML,
};

console.log(
  "Admin module loaded."
);
