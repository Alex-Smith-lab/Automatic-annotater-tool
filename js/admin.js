/* =========================================================
   ADMIN CENTER
   File: js/admin.js
   ========================================================= */

import {
  APP_CONFIG,
  ALL_ROLES,
  normalizeRole,
  roleLabel,
  isAdminRole,
  isStaffRole,
  isReviewerRole,
  isCoworkerRole
} from "./config.js";

import {
  getCurrentUser,
  getCurrentProfile,
  getRole,
  isAdmin,
  isStaff,
  canManageUsers,
  canManageTasks,
  canManagePayments
} from "./auth.js";

import {
  getSupabase,
  logActivity,
  logWorkflowEvent
} from "./supabase.js";


/* =========================================================
   STATE
   ========================================================= */

const state = {
  initialized: false,
  currentUser: null,
  currentProfile: null,
  role: "customer",

  users: [],
  coworkers: [],
  tasks: [],
  payments: [],
  payRates: [],
  activity: [],

  activePage: "overview",

  loading: false,
  lastRefresh: null
};


/* =========================================================
   HELPERS
   ========================================================= */

function supabaseClient() {
  return getSupabase?.() || window.supabaseClient || null;
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatShortDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString();
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function showToast(message, type = "info") {
  if (typeof window.showToast === "function") {
    window.showToast(message, type);
    return;
  }

  const container = byId("toastContainer");

  if (!container) {
    console[type === "error" ? "error" : "log"](message);
    return;
  }

  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function getUserId(user) {
  return (
    user?.id ||
    user?.user_id ||
    user?.uid ||
    null
  );
}

function getUserEmail(user) {
  return (
    user?.email ||
    user?.user_email ||
    ""
  );
}

function getUserName(user) {
  return (
    user?.full_name ||
    user?.name ||
    user?.display_name ||
    getUserEmail(user).split("@")[0] ||
    "User"
  );
}

function isCurrentAdmin() {
  const email = String(
    state.currentUser?.email ||
    state.currentProfile?.email ||
    ""
  ).toLowerCase();

  return (
    isAdmin() ||
    email === String(APP_CONFIG.adminEmail || "").toLowerCase()
  );
}

function canOpenAdmin() {
  return isCurrentAdmin() || isStaff();
}

function canEditUsers() {
  return (
    isCurrentAdmin() ||
    canManageUsers?.()
  );
}

function canEditTasks() {
  return (
    isCurrentAdmin() ||
    canManageTasks?.()
  );
}

function canEditPayments() {
  return (
    isCurrentAdmin() ||
    canManagePayments?.()
  );
}

function notifyChange() {
  document.dispatchEvent(
    new CustomEvent("adminDataChanged", {
      detail: {
        page: state.activePage,
        timestamp: Date.now()
      }
    })
  );
}


/* =========================================================
   DATABASE HELPERS
   ========================================================= */

async function selectTable(table, columns = "*") {
  const client = supabaseClient();

  if (!client || !table) {
    return {
      data: [],
      error: new Error("Supabase is not available.")
    };
  }

  const result = await client
    .from(table)
    .select(columns);

  return result;
}

async function safeUpdate(table, id, values, idColumn = "id") {
  const client = supabaseClient();

  if (!client) {
    throw new Error("Supabase is not available.");
  }

  const result = await client
    .from(table)
    .update(values)
    .eq(idColumn, id);

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

async function safeInsert(table, values) {
  const client = supabaseClient();

  if (!client) {
    throw new Error("Supabase is not available.");
  }

  const result = await client
    .from(table)
    .insert(values)
    .select();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

async function safeDelete(table, id, idColumn = "id") {
  const client = supabaseClient();

  if (!client) {
    throw new Error("Supabase is not available.");
  }

  const result = await client
    .from(table)
    .delete()
    .eq(idColumn, id);

  if (result.error) {
    throw result.error;
  }

  return result.data;
}


/* =========================================================
   LOAD USERS
   ========================================================= */

async function loadUsers() {
  const table = APP_CONFIG.tables?.profiles || "profiles";

  const { data, error } = await selectTable(table, "*");

  if (error) {
    console.error("Unable to load users:", error);
    state.users = [];
    return [];
  }

  state.users = Array.isArray(data)
    ? data.sort((a, b) => {
        const aa = new Date(a.created_at || 0).getTime();
        const bb = new Date(b.created_at || 0).getTime();

        return bb - aa;
      })
    : [];

  state.coworkers = state.users.filter(user =>
    isCoworkerRole(normalizeRole(user.role))
  );

  return state.users;
}


/* =========================================================
   LOAD TASKS
   ========================================================= */

async function loadTasks() {
  const table = APP_CONFIG.tables?.tasks || "tasks";

  const { data, error } = await selectTable(table, "*");

  if (error) {
    console.error("Unable to load tasks:", error);
    state.tasks = [];
    return [];
  }

  state.tasks = Array.isArray(data)
    ? data.sort((a, b) => {
        const aa = new Date(a.created_at || 0).getTime();
        const bb = new Date(b.created_at || 0).getTime();

        return bb - aa;
      })
    : [];

  return state.tasks;
}


/* =========================================================
   LOAD PAYMENTS
   ========================================================= */

async function loadPayments() {
  const table =
    APP_CONFIG.tables?.payments ||
    "payments";

  const { data, error } = await selectTable(table, "*");

  if (error) {
    console.warn("Unable to load payments:", error);
    state.payments = [];
    return [];
  }

  state.payments = Array.isArray(data)
    ? data.sort((a, b) => {
        const aa = new Date(a.created_at || 0).getTime();
        const bb = new Date(b.created_at || 0).getTime();

        return bb - aa;
      })
    : [];

  return state.payments;
}


/* =========================================================
   LOAD PAY RATES
   ========================================================= */

async function loadPayRates() {
  const table =
    APP_CONFIG.tables?.payRates ||
    "pay_rates";

  const { data, error } = await selectTable(table, "*");

  if (error) {
    console.warn("Unable to load pay rates:", error);
    state.payRates = [];
    return [];
  }

  state.payRates = Array.isArray(data)
    ? data
    : [];

  return state.payRates;
}


/* =========================================================
   LOAD ACTIVITY
   ========================================================= */

async function loadActivity() {
  const table =
    APP_CONFIG.tables?.activity ||
    APP_CONFIG.tables?.activityLog ||
    "activity_log";

  const { data, error } = await selectTable(table, "*");

  if (error) {
    console.warn("Unable to load activity:", error);
    state.activity = [];
    return [];
  }

  state.activity = Array.isArray(data)
    ? data
        .sort((a, b) => {
          const aa = new Date(
            a.created_at ||
            a.timestamp ||
            0
          ).getTime();

          const bb = new Date(
            b.created_at ||
            b.timestamp ||
            0
          ).getTime();

          return bb - aa;
        })
        .slice(0, 500)
    : [];

  return state.activity;
}


/* =========================================================
   REFRESH EVERYTHING
   ========================================================= */

async function refreshAdminData() {
  if (!canOpenAdmin()) {
    return;
  }

  state.loading = true;

  try {
    await Promise.all([
      loadUsers(),
      loadTasks(),
      loadPayments(),
      loadPayRates(),
      loadActivity()
    ]);

    state.lastRefresh = new Date();

    renderAdmin();
  } catch (error) {
    console.error("Admin refresh error:", error);
    showToast(
      error?.message || "Unable to refresh admin data.",
      "error"
    );
  } finally {
    state.loading = false;
  }
}


/* =========================================================
   USER MANAGEMENT
   ========================================================= */

function findUser(userId) {
  return state.users.find(
    user => getUserId(user) === userId
  );
}

async function changeUserRole(userId, newRole) {
  if (!canEditUsers()) {
    showToast("You do not have permission to change roles.", "error");
    return false;
  }

  const normalized = normalizeRole(newRole);

  if (!ALL_ROLES.includes(normalized)) {
    showToast("Invalid role.", "error");
    return false;
  }

  const user = findUser(userId);

  if (!user) {
    showToast("User not found.", "error");
    return false;
  }

  const adminEmail = String(
    APP_CONFIG.adminEmail || ""
  ).toLowerCase();

  const email = String(
    getUserEmail(user)
  ).toLowerCase();

  if (
    email === adminEmail &&
    normalized !== "admin"
  ) {
    showToast(
      "The default administrator cannot be downgraded.",
      "error"
    );
    return false;
  }

  const values = {
    role: normalized,
    active: true,
    updated_at: new Date().toISOString()
  };

  try {
    await safeUpdate(
      APP_CONFIG.tables?.profiles || "profiles",
      userId,
      values
    );

    await logWorkflowEvent?.(
      "admin_role_changed",
      {
        target_user_id: userId,
        target_email: email,
        old_role: normalizeRole(user.role),
        new_role: normalized
      }
    );

    showToast(
      `${getUserName(user)} is now ${roleLabel(normalized)}.`,
      "success"
    );

    await loadUsers();
    renderAdminUsers();
    renderAdminOverview();

    return true;
  } catch (error) {
    console.error("Role change failed:", error);
    showToast(
      error?.message || "Unable to change user role.",
      "error"
    );

    return false;
  }
}

async function setUserActive(userId, active) {
  if (!canEditUsers()) {
    showToast("You do not have permission.", "error");
    return false;
  }

  const user = findUser(userId);

  if (!user) {
    showToast("User not found.", "error");
    return false;
  }

  const email = String(
    getUserEmail(user)
  ).toLowerCase();

  const adminEmail = String(
    APP_CONFIG.adminEmail || ""
  ).toLowerCase();

  if (
    email === adminEmail &&
    active === false
  ) {
    showToast(
      "The default administrator cannot be disabled.",
      "error"
    );
    return false;
  }

  try {
    await safeUpdate(
      APP_CONFIG.tables?.profiles || "profiles",
      userId,
      {
        active: Boolean(active),
        updated_at: new Date().toISOString()
      }
    );

    await logWorkflowEvent?.(
      active
        ? "admin_user_activated"
        : "admin_user_deactivated",
      {
        target_user_id: userId,
        target_email: email
      }
    );

    showToast(
      active
        ? "User activated."
        : "User access disabled.",
      "success"
    );

    await loadUsers();
    renderAdminUsers();
    renderAdminOverview();

    return true;
  } catch (error) {
    console.error("Active status update failed:", error);
    showToast(
      error?.message || "Unable to update user.",
      "error"
    );

    return false;
  }
}

async function kickUser(userId) {
  if (!canEditUsers()) {
    showToast("You do not have permission.", "error");
    return false;
  }

  const user = findUser(userId);

  if (!user) {
    return false;
  }

  const email = String(
    getUserEmail(user)
  ).toLowerCase();

  const adminEmail = String(
    APP_CONFIG.adminEmail || ""
  ).toLowerCase();

  if (email === adminEmail) {
    showToast(
      "The default administrator cannot be kicked.",
      "error"
    );
    return false;
  }

  try {
    const profileTable =
      APP_CONFIG.tables?.profiles ||
      "profiles";

    await safeUpdate(
      profileTable,
      userId,
      {
        active: false,
        status: "kicked",
        kicked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    );

    await logWorkflowEvent?.(
      "admin_user_kicked",
      {
        target_user_id: userId,
        target_email: email
      }
    );

    showToast(
      `${getUserName(user)} has been kicked.`,
      "success"
    );

    await loadUsers();

    renderAdminUsers();
    renderAdminOverview();

    return true;
  } catch (error) {
    console.error("Kick failed:", error);

    /*
     * Some schemas do not have a status/kicked_at column.
     * Try a minimal update so disabling access still works.
     */
    try {
      await safeUpdate(
        APP_CONFIG.tables?.profiles || "profiles",
        userId,
        {
          active: false
        }
      );

      showToast(
        "User access disabled.",
        "success"
      );

      await loadUsers();
      renderAdminUsers();

      return true;
    } catch (fallbackError) {
      console.error(fallbackError);

      showToast(
        fallbackError?.message ||
        error?.message ||
        "Unable to kick user.",
        "error"
      );

      return false;
    }
  }
}


/* =========================================================
   CREATE COWORKER / STAFF ACCOUNT
   ========================================================= */

async function createWorkerAccount({
  name,
  email,
  password,
  role
}) {
  if (!canEditUsers()) {
    throw new Error(
      "You do not have permission to create accounts."
    );
  }

  const client = supabaseClient();

  if (!client) {
    throw new Error("Supabase is not available.");
  }

  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  const cleanRole = normalizeRole(role);

  if (!cleanName) {
    throw new Error("Enter the worker's name.");
  }

  if (!cleanEmail) {
    throw new Error("Enter the worker's email.");
  }

  if (cleanPassword.length < 6) {
    throw new Error(
      "Password must contain at least 6 characters."
    );
  }

  if (
    ![
      "coworker_2d_box",
      "coworker_polygon",
      "coworker_segmentation",
      "reviewer",
      "staff"
    ].includes(cleanRole)
  ) {
    throw new Error(
      "Select a valid coworker, reviewer, or staff role."
    );
  }

  const currentSessionResult =
    await client.auth.getSession();

  const originalSession =
    currentSessionResult?.data?.session || null;

  let signupData = null;

  try {
    /*
     * Browser clients cannot safely call:
     * supabase.auth.admin.createUser()
     *
     * because that requires the service_role key.
     *
     * Therefore account creation is done with normal signUp().
     */
    const signup = await client.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: {
        data: {
          full_name: cleanName,
          role: cleanRole,
          active: true,
          created_by_admin: true
        }
      }
    });

    if (signup.error) {
      throw signup.error;
    }

    signupData = signup.data;

    const newUser = signup.data?.user;

    if (!newUser?.id) {
      throw new Error(
        "Account was created, but no user ID was returned."
      );
    }

    /*
     * Depending on Supabase email-confirmation settings,
     * signUp() may return a session or no session.
     *
     * When a session is returned, it can temporarily replace
     * the administrator session. Restore the administrator.
     */
    if (
      originalSession &&
      signup.data?.session
    ) {
      await client.auth.setSession({
        access_token: originalSession.access_token,
        refresh_token: originalSession.refresh_token
      });
    }

    /*
     * The trigger normally creates this profile.
     * Upsert makes sure the correct admin-selected role exists.
     */
    const profileTable =
      APP_CONFIG.tables?.profiles ||
      "profiles";

    const profileValues = {
      id: newUser.id,
      email: cleanEmail,
      full_name: cleanName,
      role: cleanRole,
      active: true,
      status: "active",
      updated_at: new Date().toISOString()
    };

    const profileUpsert =
      await client
        .from(profileTable)
        .upsert(
          profileValues,
          {
            onConflict: "id"
          }
        );

    if (profileUpsert.error) {
      console.warn(
        "Profile upsert warning:",
        profileUpsert.error
      );
    }

    await logWorkflowEvent?.(
      "admin_created_worker_account",
      {
        target_user_id: newUser.id,
        target_email: cleanEmail,
        role: cleanRole
      }
    );

    showToast(
      signupData?.session
        ? "Worker account created successfully."
        : "Worker account created. Email confirmation may be required.",
      "success"
    );

    await loadUsers();
    renderAdminUsers();
    renderAdminCoworkers();

    return {
      user: newUser,
      session: signupData?.session || null
    };
  } catch (error) {
    /*
     * Always restore the administrator session after an
     * attempted secondary signup.
     */
    if (originalSession) {
      try {
        await client.auth.setSession({
          access_token: originalSession.access_token,
          refresh_token: originalSession.refresh_token
        });
      } catch (restoreError) {
        console.error(
          "Unable to restore admin session:",
          restoreError
        );
      }
    }

    throw error;
  }
}


/* =========================================================
   TASK MANAGEMENT
   ========================================================= */

function findTask(taskId) {
  return state.tasks.find(
    task =>
      String(task.id || task.task_id) ===
      String(taskId)
  );
}

async function assignTask(
  taskId,
  userId,
  role = null
) {
  if (!canEditTasks()) {
    showToast(
      "You do not have permission to assign tasks.",
      "error"
    );
    return false;
  }

  const task = findTask(taskId);

  if (!task) {
    showToast("Task not found.", "error");
    return false;
  }

  const user = userId
    ? findUser(userId)
    : null;

  if (userId && !user) {
    showToast("Selected user was not found.", "error");
    return false;
  }

  const selectedRole =
    normalizeRole(
      role ||
      user?.role ||
      task.work_role ||
      ""
    );

  const values = {
    assigned_to: userId || null,
    claimed_by: userId || null,
    work_role: selectedRole || task.work_role || null,
    updated_at: new Date().toISOString()
  };

  /*
   * If assigning a worker, mark it assigned.
   * If clearing the worker, return it to available.
   */
  if (userId) {
    values.status = "assigned";
  } else {
    values.status = "available";
  }

  try {
    await safeUpdate(
      APP_CONFIG.tables?.tasks || "tasks",
      taskId,
      values
    );

    await logWorkflowEvent?.(
      userId
        ? "admin_task_assigned"
        : "admin_task_unassigned",
      {
        task_id: taskId,
        assigned_to: userId || null,
        work_role: selectedRole || null
      }
    );

    showToast(
      user
        ? `Task assigned to ${getUserName(user)}.`
        : "Task assignment removed.",
      "success"
    );

    await loadTasks();
    renderAdminTasks();
    renderAdminOverview();

    return true;
  } catch (error) {
    /*
     * Some installations may not have claimed_by or
     * assigned_to together. Try the common fields.
     */
    console.error("Task assignment failed:", error);

    try {
      const fallbackValues = {
        assigned_to: userId || null,
        updated_at: new Date().toISOString()
      };

      if (userId) {
        fallbackValues.status = "assigned";
      } else {
        fallbackValues.status = "available";
      }

      await safeUpdate(
        APP_CONFIG.tables?.tasks || "tasks",
        taskId,
        fallbackValues
      );

      showToast(
        "Task assignment updated.",
        "success"
      );

      await loadTasks();
      renderAdminTasks();

      return true;
    } catch (fallbackError) {
      console.error(fallbackError);

      showToast(
        fallbackError?.message ||
        error?.message ||
        "Unable to assign task.",
        "error"
      );

      return false;
    }
  }
}

async function reassignTask(taskId, userId) {
  return assignTask(taskId, userId);
}

async function changeTaskStatus(taskId, status) {
  if (!canEditTasks()) {
    showToast(
      "You do not have permission to change tasks.",
      "error"
    );
    return false;
  }

  const task = findTask(taskId);

  if (!task) {
    return false;
  }

  try {
    await safeUpdate(
      APP_CONFIG.tables?.tasks || "tasks",
      taskId,
      {
        status: normalizeStatus(status),
        updated_at: new Date().toISOString()
      }
    );

    await logWorkflowEvent?.(
      "admin_task_status_changed",
      {
        task_id: taskId,
        status: normalizeStatus(status)
      }
    );

    await loadTasks();

    renderAdminTasks();
    renderAdminOverview();

    showToast(
      "Task status updated.",
      "success"
    );

    return true;
  } catch (error) {
    console.error(error);

    showToast(
      error?.message ||
      "Unable to update task status.",
      "error"
    );

    return false;
  }
}


/* =========================================================
   PAYMENT MANAGEMENT
   ========================================================= */

function paymentUserId(payment) {
  return (
    payment?.user_id ||
    payment?.worker_id ||
    payment?.coworker_id ||
    payment?.profile_id ||
    null
  );
}

function paymentIsPaid(payment) {
  const status = normalizeStatus(
    payment?.status ||
    payment?.payment_status
  );

  return (
    payment?.paid === true ||
    payment?.is_paid === true ||
    status === "paid" ||
    status === "approved" ||
    status === "released"
  );
}

async function setPaymentPaid(
  paymentId,
  paid
) {
  if (!canEditPayments()) {
    showToast(
      "You do not have permission to manage payments.",
      "error"
    );
    return false;
  }

  const table =
    APP_CONFIG.tables?.payments ||
    "payments";

  const values = {
    paid: Boolean(paid),
    is_paid: Boolean(paid),
    status: paid ? "paid" : "unpaid",
    payment_status: paid ? "paid" : "unpaid",
    paid_at: paid
      ? new Date().toISOString()
      : null,
    updated_at: new Date().toISOString()
  };

  try {
    await safeUpdate(
      table,
      paymentId,
      values
    );

    await logWorkflowEvent?.(
      paid
        ? "admin_payment_released"
        : "admin_payment_unreleased",
      {
        payment_id: paymentId
      }
    );

    await loadPayments();

    renderAdminPayments();
    renderAdminOverview();

    showToast(
      paid
        ? "Payment marked as paid."
        : "Payment marked as unpaid.",
      "success"
    );

    return true;
  } catch (error) {
    console.error("Payment update failed:", error);

    /*
     * Try a minimal schema-compatible update.
     */
    try {
      await safeUpdate(
        table,
        paymentId,
        {
          status: paid ? "paid" : "unpaid"
        }
      );

      await loadPayments();
      renderAdminPayments();

      showToast(
        "Payment status updated.",
        "success"
      );

      return true;
    } catch (fallbackError) {
      console.error(fallbackError);

      showToast(
        fallbackError?.message ||
        error?.message ||
        "Unable to update payment.",
        "error"
      );

      return false;
    }
  }
}


/* =========================================================
   PAY RATE MANAGEMENT
   ========================================================= */

async function savePayRate({
  id = null,
  role,
  workType = null,
  amount,
  currency = "USD"
}) {
  if (!canEditPayments()) {
    throw new Error(
      "You do not have permission to edit pay rates."
    );
  }

  const table =
    APP_CONFIG.tables?.payRates ||
    "pay_rates";

  const cleanRole = normalizeRole(role);
  const cleanAmount = Number(amount);

  if (!cleanRole) {
    throw new Error("Select a role.");
  }

  if (!Number.isFinite(cleanAmount) || cleanAmount < 0) {
    throw new Error("Enter a valid pay rate.");
  }

  const values = {
    role: cleanRole,
    work_type: workType || null,
    amount: cleanAmount,
    rate: cleanAmount,
    currency: currency || "USD",
    active: true,
    updated_at: new Date().toISOString()
  };

  if (id) {
    await safeUpdate(
      table,
      id,
      values
    );
  } else {
    values.created_at =
      new Date().toISOString();

    await safeInsert(
      table,
      values
    );
  }

  await loadPayRates();
  renderAdminPayRates();

  showToast(
    "Pay rate saved.",
    "success"
  );

  return true;
}

async function deletePayRate(id) {
  if (!canEditPayments()) {
    showToast(
      "You do not have permission.",
      "error"
    );
    return false;
  }

  try {
    await safeDelete(
      APP_CONFIG.tables?.payRates ||
      "pay_rates",
      id
    );

    await loadPayRates();
    renderAdminPayRates();

    showToast(
      "Pay rate removed.",
      "success"
    );

    return true;
  } catch (error) {
    console.error(error);

    showToast(
      error?.message ||
      "Unable to remove pay rate.",
      "error"
    );

    return false;
  }
}


/* =========================================================
   STATISTICS
   ========================================================= */

function getStats() {
  const users = state.users;

  const activeUsers = users.filter(
    user => user.active === true
  );

  const pendingUsers = users.filter(
    user =>
      user.active !== true &&
      normalizeStatus(user.status) !== "kicked"
  );

  const kickedUsers = users.filter(
    user =>
      normalizeStatus(user.status) === "kicked"
  );

  const workers = users.filter(
    user =>
      isCoworkerRole(normalizeRole(user.role))
  );

  const reviewers = users.filter(
    user =>
      isReviewerRole(normalizeRole(user.role))
  );

  const staff = users.filter(
    user =>
      isStaffRole(normalizeRole(user.role))
  );

  const admins = users.filter(
    user =>
      isAdminRole(normalizeRole(user.role))
  );

  const availableTasks = state.tasks.filter(
    task =>
      [
        "available",
        "open",
        "pending"
      ].includes(
        normalizeStatus(task.status)
      ) &&
      !task.assigned_to &&
      !task.claimed_by
  );

  const assignedTasks = state.tasks.filter(
    task =>
      Boolean(
        task.assigned_to ||
        task.claimed_by
      )
  );

  const completedTasks = state.tasks.filter(
    task =>
      [
        "completed",
        "submitted",
        "approved",
        "done"
      ].includes(
        normalizeStatus(task.status)
      )
  );

  const skippedTasks = state.tasks.filter(
    task =>
      normalizeStatus(task.status) === "skipped"
  );

  const paidPayments =
    state.payments.filter(payment =>
      paymentIsPaid(payment)
    );

  const unpaidPayments =
    state.payments.filter(payment =>
      !paymentIsPaid(payment)
    );

  return {
    users: users.length,
    activeUsers: activeUsers.length,
    pendingUsers: pendingUsers.length,
    kickedUsers: kickedUsers.length,

    workers: workers.length,
    reviewers: reviewers.length,
    staff: staff.length,
    admins: admins.length,

    tasks: state.tasks.length,
    availableTasks: availableTasks.length,
    assignedTasks: assignedTasks.length,
    completedTasks: completedTasks.length,
    skippedTasks: skippedTasks.length,

    payments: state.payments.length,
    paidPayments: paidPayments.length,
    unpaidPayments: unpaidPayments.length
  };
}


/* =========================================================
   RENDER OVERVIEW
   ========================================================= */

function setText(id, value) {
  const element = byId(id);

  if (element) {
    element.textContent = value;
  }
}

function renderAdminOverview() {
  const stats = getStats();

  setText("adminTotalUsers", stats.users);
  setText("adminActiveUsers", stats.activeUsers);
  setText("adminPendingUsers", stats.pendingUsers);

  setText("adminTotalTasks", stats.tasks);
  setText("adminAvailableTasks", stats.availableTasks);
  setText("adminCompletedTasks", stats.completedTasks);

  setText("adminTotalPayments", stats.payments);
  setText("adminPaidPayments", stats.paidPayments);
  setText("adminUnpaidPayments", stats.unpaidPayments);

  setText(
    "adminWorkerCount",
    stats.workers
  );

  setText(
    "adminReviewerCount",
    stats.reviewers
  );

  setText(
    "adminStaffCount",
    stats.staff
  );

  setText(
    "adminAdminCount",
    stats.admins
  );

  renderRecentActivity();
  renderTaskProgress();
}


/* =========================================================
   RECENT ACTIVITY
   ========================================================= */

function renderRecentActivity() {
  const container =
    byId("adminRecentActivity");

  if (!container) {
    return;
  }

  const activity =
    state.activity.slice(0, 15);

  if (!activity.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No recent activity.
      </div>
    `;

    return;
  }

  container.innerHTML = activity
    .map(item => {
      const action =
        item.action ||
        item.event ||
        item.type ||
        "Activity";

      const actor =
        item.user_name ||
        item.email ||
        item.user_email ||
        "System";

      const timestamp =
        item.created_at ||
        item.timestamp ||
        item.logged_at;

      return `
        <div class="admin-activity-row">
          <div class="admin-activity-main">
            <strong>
              ${escapeHtml(action)}
            </strong>

            <span>
              ${escapeHtml(actor)}
            </span>
          </div>

          <time>
            ${escapeHtml(formatDate(timestamp))}
          </time>
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   TASK PROGRESS
   ========================================================= */

function getTaskProgress(task) {
  const total =
    Number(
      task.annotation_count ??
      task.annotations_count ??
      task.total_annotations ??
      0
    );

  const completed =
    Number(
      task.completed_annotations ??
      task.approved_annotations ??
      0
    );

  if (total <= 0) {
    const status =
      normalizeStatus(task.status);

    if (
      [
        "completed",
        "submitted",
        "approved",
        "done"
      ].includes(status)
    ) {
      return 100;
    }

    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (completed / total) * 100
      )
    )
  );
}

function renderTaskProgress() {
  const container =
    byId("adminTaskProgress");

  if (!container) {
    return;
  }

  const tasks =
    state.tasks.slice(0, 20);

  if (!tasks.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No tasks available.
      </div>
    `;

    return;
  }

  container.innerHTML = tasks
    .map(task => {
      const taskId =
        task.id ||
        task.task_id ||
        "—";

      const progress =
        getTaskProgress(task);

      const status =
        normalizeStatus(task.status) ||
        "unknown";

      return `
        <div class="admin-progress-row">
          <div class="admin-progress-header">
            <strong>
              ${escapeHtml(
                task.title ||
                task.name ||
                `Task ${taskId}`
              )}
            </strong>

            <span>
              ${progress}%
            </span>
          </div>

          <div class="admin-progress-track">
            <div
              class="admin-progress-fill"
              style="width:${progress}%"
            ></div>
          </div>

          <small>
            ${escapeHtml(status)}
            ·
            ID ${escapeHtml(taskId)}
          </small>
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   USERS PAGE
   ========================================================= */

function renderAdminUsers() {
  const container =
    byId("usersList");

  if (!container) {
    return;
  }

  if (!state.users.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No users found.
      </div>
    `;

    return;
  }

  container.innerHTML = state.users
    .map(user => {
      const id = getUserId(user);

      const role =
        normalizeRole(user.role);

      const active =
        user.active === true;

      const status =
        normalizeStatus(user.status);

      const isDefaultAdmin =
        String(
          getUserEmail(user)
        ).toLowerCase() ===
        String(
          APP_CONFIG.adminEmail || ""
        ).toLowerCase();

      return `
        <div
          class="admin-user-card"
          data-user-id="${escapeHtml(id)}"
        >
          <div class="admin-user-info">
            <div class="admin-user-name">
              ${escapeHtml(
                getUserName(user)
              )}
            </div>

            <div class="admin-user-email">
              ${escapeHtml(
                getUserEmail(user)
              )}
            </div>

            <div class="admin-user-meta">
              <span>
                Joined:
                ${escapeHtml(
                  formatDate(user.created_at)
                )}
              </span>

              <span>
                Last login:
                ${escapeHtml(
                  formatDate(
                    user.last_login_at ||
                    user.last_sign_in_at ||
                    user.last_login
                  )
                )}
              </span>

              <span>
                Last logout:
                ${escapeHtml(
                  formatDate(
                    user.last_logout_at ||
                    user.last_logout
                  )
                )}
              </span>
            </div>
          </div>

          <div class="admin-user-controls">

            <label>
              <span>Role</span>

              <select
                class="admin-role-select"
                data-user-id="${escapeHtml(id)}"
                ${!canEditUsers() || isDefaultAdmin ? "disabled" : ""}
              >
                ${ALL_ROLES.map(option => `
                  <option
                    value="${escapeHtml(option)}"
                    ${option === role ? "selected" : ""}
                  >
                    ${escapeHtml(
                      roleLabel(option)
                    )}
                  </option>
                `).join("")}
              </select>
            </label>

            <span
              class="admin-status-badge ${
                active
                  ? "is-active"
                  : status === "kicked"
                    ? "is-kicked"
                    : "is-pending"
              }"
            >
              ${
                active
                  ? "Active"
                  : status === "kicked"
                    ? "Kicked"
                    : "Waiting approval"
              }
            </span>

            <div class="admin-user-actions">

              <button
                type="button"
                class="secondary-button admin-toggle-user"
                data-user-id="${escapeHtml(id)}"
                ${!canEditUsers() || isDefaultAdmin ? "disabled" : ""}
              >
                ${
                  active
                    ? "Disable"
                    : "Activate"
                }
              </button>

              <button
                type="button"
                class="danger-button admin-kick-user"
                data-user-id="${escapeHtml(id)}"
                ${!canEditUsers() || isDefaultAdmin ? "disabled" : ""}
              >
                Kick
              </button>

            </div>
          </div>
        </div>
      `;
    })
    .join("");

  bindUserControls();
}

function bindUserControls() {
  qsa(".admin-role-select")
    .forEach(select => {
      select.addEventListener(
        "change",
        async event => {
          const userId =
            event.currentTarget.dataset.userId;

          const role =
            event.currentTarget.value;

          await changeUserRole(
            userId,
            role
          );
        }
      );
    });

  qsa(".admin-toggle-user")
    .forEach(button => {
      button.addEventListener(
        "click",
        async event => {
          const userId =
            event.currentTarget.dataset.userId;

          const user =
            findUser(userId);

          if (!user) return;

          await setUserActive(
            userId,
            user.active !== true
          );
        }
      );
    });

  qsa(".admin-kick-user")
    .forEach(button => {
      button.addEventListener(
        "click",
        async event => {
          const userId =
            event.currentTarget.dataset.userId;

          const user =
            findUser(userId);

          if (!user) return;

          const confirmed =
            window.confirm(
              `Kick ${getUserName(user)}?`
            );

          if (!confirmed) {
            return;
          }

          await kickUser(userId);
        }
      );
    });
}


/* =========================================================
   COWORKERS PAGE
   ========================================================= */

function renderAdminCoworkers() {
  const container =
    byId("coworkersList");

  if (!container) {
    return;
  }

  const coworkers =
    state.users.filter(user =>
      isCoworkerRole(
        normalizeRole(user.role)
      )
    );

  if (!coworkers.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No coworker accounts yet.
      </div>
    `;

    return;
  }

  container.innerHTML = coworkers
    .map(user => {
      const id = getUserId(user);

      return `
        <div class="admin-coworker-row">
          <div>
            <strong>
              ${escapeHtml(
                getUserName(user)
              )}
            </strong>

            <span>
              ${escapeHtml(
                getUserEmail(user)
              )}
            </span>
          </div>

          <div>
            <strong>
              ${escapeHtml(
                roleLabel(
                  normalizeRole(user.role)
                )
              )}
            </strong>

            <span>
              ${
                user.active === true
                  ? "Active"
                  : "Inactive"
              }
            </span>
          </div>

          <button
            type="button"
            class="secondary-button admin-focus-task-assignment"
            data-user-id="${escapeHtml(id)}"
          >
            Assign work
          </button>
        </div>
      `;
    })
    .join("");

  qsa(".admin-focus-task-assignment")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          state.activePage = "tasks";

          renderAdmin();

          setTimeout(() => {
            const select =
              qs(
                `.admin-task-assignee[data-user-id="${CSS.escape(button.dataset.userId)}"]`
              );

            select?.focus();
          }, 50);
        }
      );
    });
}


/* =========================================================
   TASKS PAGE
   ========================================================= */

function renderAdminTasks() {
  const container =
    byId("adminTasksList");

  if (!container) {
    return;
  }

  if (!state.tasks.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No tasks found.
      </div>
    `;

    return;
  }

  const workerOptions =
    state.users
      .filter(user =>
        user.active === true &&
        (
          isCoworkerRole(
            normalizeRole(user.role)
          ) ||
          isReviewerRole(
            normalizeRole(user.role)
          ) ||
          isStaffRole(
            normalizeRole(user.role)
          ) ||
          isAdminRole(
            normalizeRole(user.role)
          )
        )
      );

  container.innerHTML =
    state.tasks
      .map(task => {
        const taskId =
          task.id ||
          task.task_id;

        const assignedId =
          task.assigned_to ||
          task.claimed_by ||
          "";

        const status =
          normalizeStatus(
            task.status
          ) || "unknown";

        const progress =
          getTaskProgress(task);

        const annotations =
          task.annotation_count ??
          task.annotations_count ??
          task.total_annotations ??
          0;

        return `
          <div
            class="admin-task-card"
            data-task-id="${escapeHtml(taskId)}"
          >
            <div class="admin-task-main">

              <div class="admin-task-title">
                ${escapeHtml(
                  task.title ||
                  task.name ||
                  `Task ${taskId}`
                )}
              </div>

              <div class="admin-task-meta">
                <span>
                  ID:
                  ${escapeHtml(taskId)}
                </span>

                <span>
                  Type:
                  ${escapeHtml(
                    task.work_type ||
                    task.annotation_type ||
                    task.shape ||
                    "—"
                  )}
                </span>

                <span>
                  Role:
                  ${escapeHtml(
                    roleLabel(
                      normalizeRole(
                        task.work_role ||
                        ""
                      )
                    )
                  )}
                </span>

                <span>
                  Annotations:
                  ${escapeHtml(
                    annotations
                  )}
                </span>

                <span>
                  Created:
                  ${escapeHtml(
                    formatDate(
                      task.created_at
                    )
                  )}
                </span>
              </div>

              <div class="admin-task-progress">
                <div
                  class="admin-progress-track"
                >
                  <div
                    class="admin-progress-fill"
                    style="width:${progress}%"
                  ></div>
                </div>

                <span>
                  ${progress}%
                </span>
              </div>
            </div>

            <div class="admin-task-controls">

              <label>
                <span>Assignee</span>

                <select
                  class="admin-task-assignee"
                  data-task-id="${escapeHtml(taskId)}"
                  ${!canEditTasks() ? "disabled" : ""}
                >
                  <option value="">
                    Unassigned
                  </option>

                  ${workerOptions.map(user => `
                    <option
                      value="${escapeHtml(
                        getUserId(user)
                      )}"
                      data-user-role="${escapeHtml(
                        normalizeRole(user.role)
                      )}"
                      ${
                        String(
                          getUserId(user)
                        ) ===
                        String(assignedId)
                          ? "selected"
                          : ""
                      }
                    >
                      ${escapeHtml(
                        getUserName(user)
                      )}
                      —
                      ${escapeHtml(
                        roleLabel(
                          normalizeRole(
                            user.role
                          )
                        )
                      )}
                    </option>
                  `).join("")}
                </select>
              </label>

              <label>
                <span>Status</span>

                <select
                  class="admin-task-status"
                  data-task-id="${escapeHtml(taskId)}"
                  ${!canEditTasks() ? "disabled" : ""}
                >
                  ${
                    [
                      "available",
                      "assigned",
                      "in_progress",
                      "submitted",
                      "under_review",
                      "approved",
                      "completed",
                      "skipped",
                      "rejected"
                    ]
                      .map(option => `
                        <option
                          value="${option}"
                          ${
                            option === status
                              ? "selected"
                              : ""
                          }
                        >
                          ${option
                            .replaceAll("_", " ")
                            .replace(
                              /^\w/,
                              char =>
                                char.toUpperCase()
                            )}
                        </option>
                      `)
                      .join("")
                  }
                </select>
              </label>

            </div>
          </div>
        `;
      })
      .join("");

  bindTaskControls();
}

function bindTaskControls() {
  qsa(".admin-task-assignee")
    .forEach(select => {
      select.addEventListener(
        "change",
        async event => {
          const element =
            event.currentTarget;

          const taskId =
            element.dataset.taskId;

          const userId =
            element.value || null;

          const selectedOption =
            element.selectedOptions?.[0];

          const role =
            selectedOption?.dataset?.userRole ||
            null;

          await assignTask(
            taskId,
            userId,
            role
          );
        }
      );
    });

  qsa(".admin-task-status")
    .forEach(select => {
      select.addEventListener(
        "change",
        async event => {
          const element =
            event.currentTarget;

          await changeTaskStatus(
            element.dataset.taskId,
            element.value
          );
        }
      );
    });
}


/* =========================================================
   PAY RATES PAGE
   ========================================================= */

function renderAdminPayRates() {
  const container =
    byId("payRatesList");

  if (!container) {
    return;
  }

  const rows =
    state.payRates;

  if (!rows.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No pay rates configured.
      </div>
    `;

    return;
  }

  container.innerHTML =
    rows.map(rate => `
      <div class="admin-pay-rate-row">

        <div>
          <strong>
            ${escapeHtml(
              roleLabel(
                normalizeRole(
                  rate.role
                )
              )
            )}
          </strong>

          <span>
            ${escapeHtml(
              rate.work_type ||
              "All work types"
            )}
          </span>
        </div>

        <div>
          ${escapeHtml(
            String(
              rate.amount ??
              rate.rate ??
              0
            )
          )}
          ${escapeHtml(
            rate.currency ||
            "USD"
          )}
        </div>

        ${
          canEditPayments()
            ? `
              <button
                type="button"
                class="danger-button admin-delete-rate"
                data-rate-id="${escapeHtml(
                  rate.id
                )}"
              >
                Delete
              </button>
            `
            : ""
        }

      </div>
    `).join("");

  qsa(".admin-delete-rate")
    .forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          const confirmed =
            window.confirm(
              "Delete this pay rate?"
            );

          if (!confirmed) {
            return;
          }

          await deletePayRate(
            button.dataset.rateId
          );
        }
      );
    });
}


/* =========================================================
   PAYMENTS PAGE
   ========================================================= */

function renderAdminPayments() {
  const container =
    byId("paymentsList");

  if (!container) {
    return;
  }

  if (!state.payments.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No payment records found.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.payments.map(payment => {
      const id =
        payment.id ||
        payment.payment_id;

      const user =
        findUser(
          paymentUserId(payment)
        );

      const paid =
        paymentIsPaid(payment);

      const amount =
        payment.amount ??
        payment.total ??
        payment.pay_amount ??
        0;

      return `
        <div class="admin-payment-row">

          <div>
            <strong>
              ${escapeHtml(
                getUserName(
                  user || {
                    email:
                      payment.email ||
                      payment.user_email ||
                      "Unknown user"
                  }
                )
              )}
            </strong>

            <span>
              ${escapeHtml(
                payment.work_type ||
                payment.annotation_type ||
                "Work"
              )}
            </span>
          </div>

          <div>
            <strong>
              ${escapeHtml(
                String(amount)
              )}
              ${escapeHtml(
                payment.currency ||
                "USD"
              )}
            </strong>

            <span>
              ${escapeHtml(
                formatDate(
                  payment.created_at
                )
              )}
            </span>
          </div>

          <span
            class="admin-status-badge ${
              paid
                ? "is-active"
                : "is-pending"
            }"
          >
            ${paid ? "Paid" : "Not paid"}
          </span>

          ${
            canEditPayments()
              ? `
                <button
                  type="button"
                  class="secondary-button admin-payment-toggle"
                  data-payment-id="${escapeHtml(id)}"
                  data-paid="${paid ? "true" : "false"}"
                >
                  ${
                    paid
                      ? "Mark unpaid"
                      : "Release payment"
                  }
                </button>
              `
              : ""
          }

        </div>
      `;
    }).join("");

  qsa(".admin-payment-toggle")
    .forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          const currentlyPaid =
            button.dataset.paid === "true";

          await setPaymentPaid(
            button.dataset.paymentId,
            !currentlyPaid
          );
        }
      );
    });
}


/* =========================================================
   ACTIVITY PAGE
   ========================================================= */

function renderAdminActivity() {
  const container =
    byId("activityList");

  if (!container) {
    return;
  }

  if (!state.activity.length) {
    container.innerHTML = `
      <div class="admin-empty">
        No activity recorded.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.activity.map(item => {
      const action =
        item.action ||
        item.event ||
        item.type ||
        "Activity";

      const email =
        item.email ||
        item.user_email ||
        item.actor_email ||
        "System";

      const timestamp =
        item.created_at ||
        item.timestamp ||
        item.logged_at;

      let details =
        item.details ||
        item.metadata ||
        item.payload ||
        "";

      if (
        typeof details === "object"
      ) {
        try {
          details =
            JSON.stringify(
              details,
              null,
              2
            );
        } catch {
          details = "";
        }
      }

      return `
        <div class="admin-activity-full-row">

          <div>
            <strong>
              ${escapeHtml(action)}
            </strong>

            <span>
              ${escapeHtml(email)}
            </span>
          </div>

          <time>
            ${escapeHtml(
              formatDate(timestamp)
            )}
          </time>

          ${
            details
              ? `
                <pre>${escapeHtml(
                  details
                )}</pre>
              `
              : ""
          }

        </div>
      `;
    }).join("");
}


/* =========================================================
   EXPORT DATA
   ========================================================= */

function buildExportRows() {
  const rows = [];

  /*
   * Export tasks/work first because this is the most useful
   * admin export for customer reporting.
   */
  for (const task of state.tasks) {
    const taskId =
      task.id ||
      task.task_id ||
      "";

    const assignee =
      findUser(
        task.assigned_to ||
        task.claimed_by
      );

    rows.push({
      record_type: "task",
      task_id: taskId,
      task_title:
        task.title ||
        task.name ||
        "",
      work_type:
        task.work_type ||
        task.annotation_type ||
        task.shape ||
        "",
      work_role:
        task.work_role ||
        "",
      status:
        task.status ||
        "",
      assigned_to:
        assignee
          ? getUserEmail(assignee)
          : "",
      created_at:
        task.created_at ||
        "",
      updated_at:
        task.updated_at ||
        "",
      annotation_count:
        task.annotation_count ??
        task.annotations_count ??
        task.total_annotations ??
        0,
      progress:
        getTaskProgress(task),
      pay:
        task.pay ??
        task.payment ??
        task.task_pay ??
        ""
    });
  }

  for (const payment of state.payments) {
    const user =
      findUser(
        paymentUserId(payment)
      );

    rows.push({
      record_type: "payment",
      task_id:
        payment.task_id ||
        "",
      task_title: "",
      work_type:
        payment.work_type ||
        "",
      work_role:
        payment.role ||
        "",
      status:
        payment.status ||
        (
          paymentIsPaid(payment)
            ? "paid"
            : "unpaid"
        ),
      assigned_to:
        user
          ? getUserEmail(user)
          : (
              payment.email ||
              payment.user_email ||
              ""
            ),
      created_at:
        payment.created_at ||
        "",
      updated_at:
        payment.updated_at ||
        "",
      annotation_count: "",
      progress: "",
      pay:
        payment.amount ??
        payment.total ??
        payment.pay_amount ??
        ""
    });
  }

  return rows;
}

function csvEscape(value) {
  const stringValue =
    String(value ?? "");

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replaceAll(
      '"',
      '""'
    )}"`;
  }

  return stringValue;
}

function rowsToCSV(rows) {
  if (!rows.length) {
    return "";
  }

  const headers =
    Object.keys(rows[0]);

  const lines = [
    headers
      .map(csvEscape)
      .join(",")
  ];

  for (const row of rows) {
    lines.push(
      headers
        .map(header =>
          csvEscape(
            row[header]
          )
        )
        .join(",")
    );
  }

  return lines.join("\n");
}

function buildAdminCSV() {
  return rowsToCSV(
    buildExportRows()
  );
}

function buildAdminHTML() {
  const rows =
    buildExportRows();

  const headers =
    rows.length
      ? Object.keys(rows[0])
      : [];

  const generated =
    new Date().toLocaleString();

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Annotation Work Export</title>
<style>
body {
  font-family: Arial, sans-serif;
  padding: 24px;
}
h1 {
  margin-bottom: 4px;
}
small {
  color: #666;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}
th,
td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
  vertical-align: top;
}
th {
  background: #f2f2f2;
}
</style>
</head>
<body>
<h1>Annotation Work Export</h1>
<small>Generated ${escapeHtml(generated)}</small>

<table>
<thead>
<tr>
${headers.map(header =>
  `<th>${escapeHtml(header)}</th>`
).join("")}
</tr>
</thead>
<tbody>
${rows.map(row => `
<tr>
${headers.map(header =>
  `<td>${escapeHtml(row[header])}</td>`
).join("")}
</tr>
`).join("")}
</tbody>
</table>

</body>
</html>`;
}

async function copyAdminCSV() {
  const csv =
    buildAdminCSV();

  if (!csv) {
    showToast(
      "There is no work to export.",
      "error"
    );
    return;
  }

  try {
    await navigator.clipboard.writeText(
      csv
    );

    showToast(
      "CSV copied to clipboard.",
      "success"
    );
  } catch (error) {
    console.error(error);

    const output =
      byId("adminExportOutput");

    if (output) {
      output.value = csv;
      output.focus();
      output.select();
    }

    showToast(
      "CSV prepared in the export box.",
      "success"
    );
  }
}

function downloadTextFile(
  filename,
  content,
  mimeType
) {
  const blob =
    new Blob(
      [content],
      {
        type: mimeType
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();

  link.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );
}

function downloadAdminCSV() {
  const csv =
    buildAdminCSV();

  if (!csv) {
    showToast(
      "There is no work to export.",
      "error"
    );
    return;
  }

  downloadTextFile(
    `annotation-work-${Date.now()}.csv`,
    csv,
    "text/csv;charset=utf-8"
  );

  showToast(
    "CSV download started.",
    "success"
  );
}

function downloadAdminHTML() {
  const html =
    buildAdminHTML();

  downloadTextFile(
    `annotation-work-${Date.now()}.html`,
    html,
    "text/html;charset=utf-8"
  );

  showToast(
    "HTML download started.",
    "success"
  );
}


/* =========================================================
   EXPORT PANEL
   ========================================================= */

function renderAdminExport() {
  const output =
    byId("adminExportOutput");

  if (!output) {
    return;
  }

  output.value =
    buildAdminCSV();
}


/* =========================================================
   ADMIN PAGE SWITCHING
   ========================================================= */

function renderActiveAdminPage() {
  qsa("[data-admin-page]")
    .forEach(page => {
      const pageName =
        page.dataset.adminPage;

      const active =
        pageName ===
        state.activePage;

      page.hidden = !active;
      page.classList.toggle(
        "active",
        active
      );
    });

  qsa("[data-admin-tab]")
    .forEach(tab => {
      const tabName =
        tab.dataset.adminTab;

      const active =
        tabName ===
        state.activePage;

      tab.classList.toggle(
        "active",
        active
      );

      tab.setAttribute(
        "aria-selected",
        active
          ? "true"
          : "false"
      );
    });
}

function setAdminPage(page) {
  const validPages = [
    "overview",
    "users",
    "coworkers",
    "tasks",
    "payments",
    "payrates",
    "activity",
    "export"
  ];

  if (
    !validPages.includes(page)
  ) {
    page = "overview";
  }

  state.activePage = page;

  renderAdmin();

  const adminContent =
    byId("adminContent");

  if (adminContent) {
    adminContent.scrollTop = 0;
  }
}


/* =========================================================
   CREATE ACCOUNT MODAL
   ========================================================= */

function openCreateCoworkerModal() {
  if (!canEditUsers()) {
    showToast(
      "You do not have permission to create accounts.",
      "error"
    );
    return;
  }

  const modal =
    byId("createCoworkerModal");

  if (!modal) {
    return;
  }

  modal.hidden = false;

  modal.classList.add(
    "open"
  );

  document.body.classList.add(
    "modal-open"
  );

  const nameInput =
    byId("newWorkerName");

  nameInput?.focus();
}

function closeCreateCoworkerModal() {
  const modal =
    byId("createCoworkerModal");

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "open"
  );

  modal.hidden = true;

  document.body.classList.remove(
    "modal-open"
  );
}

function bindCreateCoworkerForm() {
  const form =
    byId("createCoworkerForm");

  if (!form) {
    return;
  }

  if (
    form.dataset.adminBound === "true"
  ) {
    return;
  }

  form.dataset.adminBound = "true";

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const name =
        byId("newWorkerName")?.value;

      const email =
        byId("newWorkerEmail")?.value;

      const password =
        byId("newWorkerPassword")?.value;

      const role =
        byId("newWorkerRole")?.value;

      const submitButton =
        form.querySelector(
          'button[type="submit"]'
        );

      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        await createWorkerAccount({
          name,
          email,
          password,
          role
        });

        form.reset();

        closeCreateCoworkerModal();
      } catch (error) {
        console.error(error);

        showToast(
          error?.message ||
          "Unable to create account.",
          "error"
        );
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    }
  );
}


/* =========================================================
   CREATE TASK
   ========================================================= */

async function createAdminTask(form) {
  if (!canEditTasks()) {
    throw new Error(
      "You do not have permission to create tasks."
    );
  }

  const client =
    supabaseClient();

  if (!client) {
    throw new Error(
      "Supabase is not available."
    );
  }

  const title =
    byId("taskTitle")?.value?.trim();

  const shape =
    byId("taskShape")?.value;

  const duration =
    Number(
      byId("taskDuration")?.value ||
      0
    );

  const pay =
    Number(
      byId("taskPay")?.value ||
      0
    );

  const file =
    byId("taskMediaInput")?.files?.[0];

  if (!title) {
    throw new Error(
      "Enter a task title."
    );
  }

  if (!file) {
    throw new Error(
      "Select task media."
    );
  }

  const user =
    getCurrentUser();

  if (!user?.id) {
    throw new Error(
      "You must be signed in."
    );
  }

  /*
   * Upload task media using the same bucket as the
   * customer-media workflow.
   */
  const bucket =
    APP_CONFIG.buckets?.taskMedia ||
    APP_CONFIG.buckets?.media ||
    "task-media";

  const safeName =
    file.name
      .replace(/[^\w.\-]+/g, "_");

  const path =
    `admin-created/${user.id}/${Date.now()}_${safeName}`;

  const upload =
    await client.storage
      .from(bucket)
      .upload(
        path,
        file,
        {
          upsert: false,
          contentType:
            file.type ||
            "application/octet-stream"
        }
      );

  if (upload.error) {
    throw upload.error;
  }

  const taskTable =
    APP_CONFIG.tables?.tasks ||
    "tasks";

  const values = {
    title,
    work_type: shape,
    annotation_type: shape,
    shape,
    status: "available",
    media_path: path,
    media_type:
      file.type?.startsWith("video/")
        ? "video"
        : "image",
    created_by: user.id,
    duration:
      Number.isFinite(duration)
        ? duration
        : 0,
    expected_duration:
      Number.isFinite(duration)
        ? duration
        : 0,
    pay:
      Number.isFinite(pay)
        ? pay
        : 0,
    task_pay:
      Number.isFinite(pay)
        ? pay
        : 0,
    created_at:
      new Date().toISOString(),
    updated_at:
      new Date().toISOString()
  };

  const insert =
    await client
      .from(taskTable)
      .insert(values)
      .select()
      .single();

  if (insert.error) {
    /*
     * Fallback for schemas that use fewer columns.
     */
    const fallback =
      await client
        .from(taskTable)
        .insert({
          title,
          work_type: shape,
          status: "available",
          media_path: path,
          created_by: user.id
        })
        .select()
        .single();

    if (fallback.error) {
      throw fallback.error;
    }
  }

  await logWorkflowEvent?.(
    "admin_created_task",
    {
      title,
      work_type: shape,
      media_path: path
    }
  );

  showToast(
    "Task created successfully.",
    "success"
  );

  await loadTasks();

  renderAdminTasks();
  renderAdminOverview();

  return true;
}

function bindCreateTaskForm() {
  const form =
    byId("createTaskForm");

  if (!form) {
    return;
  }

  if (
    form.dataset.adminBound === "true"
  ) {
    return;
  }

  form.dataset.adminBound = "true";

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const button =
        form.querySelector(
          'button[type="submit"]'
        );

      if (button) {
        button.disabled = true;
      }

      try {
        await createAdminTask(form);

        form.reset();

        const modal =
          byId("createTaskModal");

        if (modal) {
          modal.hidden = true;
          modal.classList.remove(
            "open"
          );
        }
      } catch (error) {
        console.error(error);

        showToast(
          error?.message ||
          "Unable to create task.",
          "error"
        );
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    }
  );
}


/* =========================================================
   PAY RATE FORM
   ========================================================= */

function renderPayRateEditor() {
  const page =
    qs(
      '[data-admin-page="payrates"]'
    );

  if (!page) {
    return;
  }

  /*
   * If the page already contains an editor in index.html,
   * populate it without replacing the page.
   */
  const roleSelect =
    page.querySelector(
      "#payRateRole"
    );

  const workTypeInput =
    page.querySelector(
      "#payRateWorkType"
    );

  const amountInput =
    page.querySelector(
      "#payRateAmount"
    );

  if (!roleSelect) {
    return;
  }

  if (
    roleSelect.options.length === 0
  ) {
    roleSelect.innerHTML =
      ALL_ROLES
        .map(role => `
          <option value="${escapeHtml(role)}">
            ${escapeHtml(
              roleLabel(role)
            )}
          </option>
        `)
        .join("");
  }

  if (
    page.dataset.payRateBound ===
    "true"
  ) {
    return;
  }

  page.dataset.payRateBound =
    "true";

  const saveButton =
    page.querySelector(
      "#savePayRate"
    );

  saveButton?.addEventListener(
    "click",
    async () => {
      try {
        await savePayRate({
          role:
            roleSelect.value,
          workType:
            workTypeInput?.value ||
            null,
          amount:
            amountInput?.value
        });
      } catch (error) {
        showToast(
          error?.message ||
          "Unable to save pay rate.",
          "error"
        );
      }
    }
  );
}


/* =========================================================
   EXPORT BUTTONS
   ========================================================= */

function bindExportButtons() {
  const copyButton =
    byId("copyAdminCSV");

  if (
    copyButton &&
    copyButton.dataset.adminBound !== "true"
  ) {
    copyButton.dataset.adminBound =
      "true";

    copyButton.addEventListener(
      "click",
      copyAdminCSV
    );
  }

  const htmlButton =
    byId("downloadAdminHTML");

  if (
    htmlButton &&
    htmlButton.dataset.adminBound !== "true"
  ) {
    htmlButton.dataset.adminBound =
      "true";

    htmlButton.addEventListener(
      "click",
      downloadAdminHTML
    );
  }

  /*
   * Optional CSV download button if it exists.
   */
  const csvDownload =
    byId("downloadAdminCSV");

  if (
    csvDownload &&
    csvDownload.dataset.adminBound !== "true"
  ) {
    csvDownload.dataset.adminBound =
      "true";

    csvDownload.addEventListener(
      "click",
      downloadAdminCSV
    );
  }
}


/* =========================================================
   MODAL / NAV BINDING
   ========================================================= */

function openAdminModal() {
  if (!canOpenAdmin()) {
    showToast(
      "Admin access is not available for this account.",
      "error"
    );
    return;
  }

  const modal =
    byId("adminModal");

  if (!modal) {
    return;
  }

  modal.hidden = false;

  modal.classList.add(
    "open",
    "admin-fullscreen-modal"
  );

  document.body.classList.add(
    "admin-center-open"
  );

  state.activePage =
    state.activePage ||
    "overview";

  renderAdmin();

  refreshAdminData();
}

function closeAdminModal() {
  const modal =
    byId("adminModal");

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "open"
  );

  modal.hidden = true;

  document.body.classList.remove(
    "admin-center-open"
  );
}

function bindAdminNavigation() {
  qsa("[data-admin-tab]")
    .forEach(tab => {
      if (
        tab.dataset.adminBound ===
        "true"
      ) {
        return;
      }

      tab.dataset.adminBound =
        "true";

      tab.addEventListener(
        "click",
        () => {
          setAdminPage(
            tab.dataset.adminTab
          );
        }
      );
    });

  const openButton =
    byId("adminCenterButton");

  if (
    openButton &&
    openButton.dataset.adminBound !== "true"
  ) {
    openButton.dataset.adminBound =
      "true";

    openButton.addEventListener(
      "click",
      openAdminModal
    );
  }

  const closeButton =
    byId("closeAdminModal");

  if (
    closeButton &&
    closeButton.dataset.adminBound !== "true"
  ) {
    closeButton.dataset.adminBound =
      "true";

    closeButton.addEventListener(
      "click",
      closeAdminModal
    );
  }

  const refreshButton =
    byId("refreshUsersButton");

  if (
    refreshButton &&
    refreshButton.dataset.adminBound !== "true"
  ) {
    refreshButton.dataset.adminBound =
      "true";

    refreshButton.addEventListener(
      "click",
      refreshAdminData
    );
  }

  const createCoworkerButton =
    byId("createCoworkerButton");

  if (
    createCoworkerButton &&
    createCoworkerButton.dataset.adminBound !== "true"
  ) {
    createCoworkerButton.dataset.adminBound =
      "true";

    createCoworkerButton.addEventListener(
      "click",
      openCreateCoworkerModal
    );
  }

  const closeWorkerButton =
    byId("closeCreateCoworkerModal");

  if (
    closeWorkerButton &&
    closeWorkerButton.dataset.adminBound !== "true"
  ) {
    closeWorkerButton.dataset.adminBound =
      "true";

    closeWorkerButton.addEventListener(
      "click",
      closeCreateCoworkerModal
    );
  }

  const cancelWorkerButton =
    byId("cancelCreateCoworker");

  if (
    cancelWorkerButton &&
    cancelWorkerButton.dataset.adminBound !== "true"
  ) {
    cancelWorkerButton.dataset.adminBound =
      "true";

    cancelWorkerButton.addEventListener(
      "click",
      closeCreateCoworkerModal
    );
  }
}


/* =========================================================
   MAIN RENDER
   ========================================================= */

function renderAdmin() {
  renderActiveAdminPage();

  renderAdminOverview();
  renderAdminUsers();
  renderAdminCoworkers();
  renderAdminTasks();
  renderAdminPayRates();
  renderAdminPayments();
  renderAdminActivity();
  renderAdminExport();
  renderPayRateEditor();
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeAdmin() {
  if (state.initialized) {
    return state;
  }

  state.currentUser =
    getCurrentUser();

  state.currentProfile =
    await getCurrentProfile?.();

  state.role =
    normalizeRole(
      state.currentProfile?.role ||
      getRole?.() ||
      "customer"
    );

  /*
   * Never display the default admin email to normal users.
   */
  const adminButton =
    byId("adminCenterButton");

  if (adminButton) {
    adminButton.hidden =
      !isCurrentAdmin();

    adminButton.style.display =
      isCurrentAdmin()
        ? ""
        : "none";
  }

  if (!canOpenAdmin()) {
    state.initialized = true;
    return state;
  }

  bindAdminNavigation();
  bindCreateCoworkerForm();
  bindCreateTaskForm();
  bindExportButtons();

  /*
   * Close create-worker modal if user clicks outside it.
   */
  const workerModal =
    byId("createCoworkerModal");

  workerModal?.addEventListener(
    "click",
    event => {
      if (
        event.target ===
        workerModal
      ) {
        closeCreateCoworkerModal();
      }
    }
  );

  /*
   * Close admin center with Escape.
   */
  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape"
      ) {
        const modal =
          byId("adminModal");

        if (
          modal &&
          !modal.hidden &&
          modal.classList.contains("open")
        ) {
          closeAdminModal();
        }
      }
    }
  );

  state.initialized = true;

  return state;
}


/* =========================================================
   AUTH REFRESH
   ========================================================= */

document.addEventListener(
  "authStateChanged",
  async () => {
    state.currentUser =
      getCurrentUser();

    state.currentProfile =
      await getCurrentProfile?.();

    state.role =
      normalizeRole(
        state.currentProfile?.role ||
        getRole?.() ||
        "customer"
      );

    const adminButton =
      byId("adminCenterButton");

    if (adminButton) {
      const visible =
        isCurrentAdmin();

      adminButton.hidden =
        !visible;

      adminButton.style.display =
        visible
          ? ""
          : "none";
    }
  }
);

document.addEventListener(
  "profileUpdated",
  async () => {
    state.currentUser =
      getCurrentUser();

    state.currentProfile =
      await getCurrentProfile?.();

    state.role =
      normalizeRole(
        state.currentProfile?.role ||
        getRole?.() ||
        "customer"
      );

    if (
      byId("adminModal")?.classList.contains(
        "open"
      )
    ) {
      await refreshAdminData();
    }
  }
);


/* =========================================================
   GLOBAL COMPATIBILITY
   ========================================================= */

window.admin = {
  state,

  initialize: initializeAdmin,

  open: openAdminModal,
  close: closeAdminModal,

  refresh: refreshAdminData,

  setPage: setAdminPage,

  loadUsers,
  loadTasks,
  loadPayments,
  loadPayRates,
  loadActivity,

  changeUserRole,
  setUserActive,
  kickUser,
  createWorkerAccount,

  assignTask,
  reassignTask,
  changeTaskStatus,

  setPaymentPaid,

  savePayRate,
  deletePayRate,

  createAdminTask,

  buildAdminCSV,
  buildAdminHTML,
  copyAdminCSV,
  downloadAdminCSV,
  downloadAdminHTML,

  getStats,

  render: renderAdmin
};


/* =========================================================
   EXPORTS
   ========================================================= */

export {
  state,

  initializeAdmin,

  openAdminModal,
  closeAdminModal,

  refreshAdminData,

  setAdminPage,

  loadUsers,
  loadTasks,
  loadPayments,
  loadPayRates,
  loadActivity,

  changeUserRole,
  setUserActive,
  kickUser,
  createWorkerAccount,

  assignTask,
  reassignTask,
  changeTaskStatus,

  setPaymentPaid,

  savePayRate,
  deletePayRate,

  createAdminTask,

  buildAdminCSV,
  buildAdminHTML,
  copyAdminCSV,
  downloadAdminCSV,
  downloadAdminHTML,

  getStats,

  renderAdmin
};
