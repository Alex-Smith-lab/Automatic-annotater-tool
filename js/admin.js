/* ============================================================
   ADMIN CENTER
   ============================================================
   Handles:
   - Admin-only access
   - User management
   - Approve / activate / kick users
   - Change user roles
   - Create coworker / staff accounts
   - Task management
   - Assign / reassign tasks
   - Task progress
   - Pay rates
   - Payments
   - Activity logs
   - CSV / HTML export
   - Admin dashboard statistics

   Default admin:
   antonymbali96@gmail.com

   IMPORTANT:
   Browser-side Supabase cannot use service_role keys.
   New coworker/staff accounts are created through normal
   Supabase Auth signup and the administrator session is restored.
   ============================================================ */

import {
    APP_CONFIG,
    normalizeRole,
    roleLabel,
    isAdminRole,
    isStaffRole,
    isReviewerRole,
    isCoworkerRole,
    WORK_ROLE,
    annotationTypeForRole
} from "./config.js";

import {
    getSupabase,
    getCurrentUser,
    getCurrentProfile,
    logActivity,
    logWorkflowEvent
} from "./supabase.js";

import {
    getRole,
    getProfile,
    isAdmin,
    isStaff,
    getUserEmail
} from "./auth.js";


/* ============================================================
   STATE
   ============================================================ */

const adminState = {
    initialized: false,
    open: false,
    loading: false,

    users: [],
    tasks: [],
    payments: [],
    payRates: [],
    activities: [],

    currentTab: "overview",

    stats: {
        users: 0,
        customers: 0,
        coworkers: 0,
        reviewers: 0,
        staff: 0,
        admins: 0,
        active: 0,
        pending: 0,
        tasks: 0,
        available: 0,
        claimed: 0,
        completed: 0,
        approved: 0,
        paid: 0,
        unpaid: 0
    }
};


/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_ADMIN_EMAIL = "antonymbali96@gmail.com";

const TABLES = {
    profiles: APP_CONFIG?.tables?.profiles || "profiles",
    users: APP_CONFIG?.tables?.profiles || "profiles",
    tasks: APP_CONFIG?.tables?.tasks || "tasks",
    annotations: APP_CONFIG?.tables?.annotations || "annotations",
    payments: APP_CONFIG?.tables?.payments || "payments",
    payRates:
        APP_CONFIG?.tables?.payRates ||
        APP_CONFIG?.tables?.pay_rates ||
        "pay_rates",
    activities:
        APP_CONFIG?.tables?.activities ||
        APP_CONFIG?.tables?.activity ||
        "activity_logs",
    workflow:
        APP_CONFIG?.tables?.workflowEvents ||
        APP_CONFIG?.tables?.workflow_events ||
        "workflow_events",
    skips:
        APP_CONFIG?.tables?.taskSkips ||
        APP_CONFIG?.tables?.task_skips ||
        "task_skips"
};


/* ============================================================
   DOM HELPERS
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}

function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function safeText(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function showToast(message, type = "info") {
    if (typeof window.showToast === "function") {
        window.showToast(message, type);
        return;
    }

    let container = $("toastContainer");

    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
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

function formatMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return number.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function getRoleClass(role) {
    return `role-${normalizeRole(role).replace(/[^a-z0-9_-]/gi, "-")}`;
}

function getStatusClass(status) {
    return `status-${String(status || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/gi, "-")}`;
}


/* ============================================================
   SUPABASE
   ============================================================ */

function client() {
    return getSupabase?.();
}


/* ============================================================
   ADMIN ACCESS
   ============================================================ */

function isDefaultAdmin() {
    const email = String(
        getUserEmail?.() ||
        getCurrentUser?.()?.email ||
        ""
    ).trim().toLowerCase();

    return email === DEFAULT_ADMIN_EMAIL;
}

function canOpenAdminCenter() {
    if (isDefaultAdmin()) {
        return true;
    }

    if (isAdmin?.()) {
        return true;
    }

    const role = normalizeRole(
        getRole?.() ||
        getCurrentProfile?.()?.role ||
        getProfile?.()?.role
    );

    return isAdminRole(role);
}

function canManageAdminData() {
    if (isDefaultAdmin()) {
        return true;
    }

    if (isAdmin?.() || isStaff?.()) {
        return true;
    }

    const role = normalizeRole(
        getRole?.() ||
        getCurrentProfile?.()?.role ||
        getProfile?.()?.role
    );

    return isAdminRole(role) || isStaffRole(role);
}

function requireAdmin(action = "perform this action") {
    if (!canOpenAdminCenter()) {
        showToast(`You do not have permission to ${action}.`, "error");
        return false;
    }

    return true;
}


/* ============================================================
   INITIALIZATION
   ============================================================ */

export function initializeAdmin() {
    if (adminState.initialized) {
        return;
    }

    adminState.initialized = true;

    bindAdminNavigation();
    bindAdminButtons();
    bindCreateTaskModal();
    bindCreateCoworkerModal();
    bindAdminExportButtons();

    updateAdminButtonVisibility();
}


/* ============================================================
   ADMIN BUTTON VISIBILITY
   ============================================================ */

export function updateAdminButtonVisibility() {
    const button = $("adminCenterButton");

    if (!button) {
        return;
    }

    button.hidden = !canOpenAdminCenter();
    button.style.display = canOpenAdminCenter() ? "" : "none";
}


/* ============================================================
   OPEN / CLOSE ADMIN CENTER
   ============================================================ */

export async function openAdminCenter() {
    if (!requireAdmin("open the Admin Center")) {
        return false;
    }

    const modal = $("adminModal");

    if (!modal) {
        showToast("Admin Center element was not found.", "error");
        return false;
    }

    adminState.open = true;

    modal.hidden = false;
    modal.style.display = "flex";
    modal.classList.add("admin-fullscreen-modal");

    document.body.classList.add("admin-center-open");

    const firstTab =
        adminState.currentTab ||
        document.querySelector("[data-admin-tab]")?.dataset.adminTab ||
        "overview";

    await loadAdminData();
    switchAdminTab(firstTab);

    return true;
}

export function closeAdminCenter() {
    const modal = $("adminModal");

    adminState.open = false;

    if (modal) {
        modal.hidden = true;
        modal.style.display = "none";
        modal.classList.remove("admin-fullscreen-modal");
    }

    document.body.classList.remove("admin-center-open");
}


/* ============================================================
   NAVIGATION
   ============================================================ */

function bindAdminNavigation() {
    const adminButton = $("adminCenterButton");

    if (adminButton) {
        adminButton.addEventListener("click", async event => {
            event.preventDefault();
            await openAdminCenter();
        });
    }

    const closeButton = $("closeAdminModal");

    if (closeButton) {
        closeButton.addEventListener("click", event => {
            event.preventDefault();
            closeAdminCenter();
        });
    }

    const modal = $("adminModal");

    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                // Admin center intentionally remains open when clicking
                // outside the internal content.
            }
        });
    }

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && adminState.open) {
            closeAdminCenter();
        }
    });
}

function switchAdminTab(tabName) {
    if (!requireAdmin("view the Admin Center")) {
        return;
    }

    const requested = String(tabName || "overview");

    adminState.currentTab = requested;

    all("[data-admin-tab]").forEach(button => {
        const active = button.dataset.adminTab === requested;

        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
    });

    all("[data-admin-page]").forEach(page => {
        const active = page.dataset.adminPage === requested;

        page.hidden = !active;
        page.style.display = active ? "" : "none";
        page.classList.toggle("active", active);
    });

    renderCurrentAdminPage();
}

function bindAdminButtons() {
    all("[data-admin-tab]").forEach(button => {
        button.addEventListener("click", async event => {
            event.preventDefault();

            const tab = button.dataset.adminTab;

            switchAdminTab(tab);

            await refreshCurrentAdminTab();
        });
    });

    const refreshUsers = $("refreshUsersButton");

    if (refreshUsers) {
        refreshUsers.addEventListener("click", async () => {
            await loadUsers();
            renderUsers();
        });
    }

    const createCoworker = $("createCoworkerButton");

    if (createCoworker) {
        createCoworker.addEventListener("click", () => {
            openCreateCoworkerModal();
        });
    }

    const createTask = $("createTaskButton");

    if (createTask) {
        createTask.addEventListener("click", () => {
            openCreateTaskModal();
        });
    }

    const approvalRefresh = $("approvalRefreshButton");

    if (approvalRefresh) {
        approvalRefresh.addEventListener("click", async () => {
            await loadUsers();
            renderUsers();
        });
    }
}

async function refreshCurrentAdminTab() {
    switch (adminState.currentTab) {
        case "users":
        case "user-management":
            await loadUsers();
            renderUsers();
            break;

        case "coworkers":
            await loadUsers();
            renderCoworkers();
            break;

        case "tasks":
            await loadTasks();
            renderAdminTasks();
            break;

        case "payments":
            await loadPayments();
            await loadUsers();
            renderPayments();
            break;

        case "pay-rates":
        case "rates":
            await loadPayRates();
            renderPayRates();
            break;

        case "activity":
        case "logs":
            await loadActivities();
            renderActivities();
            break;

        default:
            await loadAdminData();
            renderCurrentAdminPage();
            break;
    }
}


/* ============================================================
   LOAD ALL ADMIN DATA
   ============================================================ */

export async function loadAdminData() {
    if (!requireAdmin("load Admin Center data")) {
        return false;
    }

    if (adminState.loading) {
        return false;
    }

    adminState.loading = true;

    try {
        await Promise.allSettled([
            loadUsers(),
            loadTasks(),
            loadPayments(),
            loadPayRates(),
            loadActivities()
        ]);

        calculateStats();
        renderAllAdminData();

        return true;
    } finally {
        adminState.loading = false;
    }
}


/* ============================================================
   LOAD USERS
   ============================================================ */

export async function loadUsers() {
    const db = client();

    if (!db) {
        return [];
    }

    try {
        const result = await db
            .from(TABLES.profiles)
            .select("*")
            .order("created_at", { ascending: false });

        if (result.error) {
            console.error("Admin users query failed:", result.error);
            adminState.users = [];
            return [];
        }

        adminState.users = (result.data || []).map(normalizeUser);

        calculateStats();

        return adminState.users;
    } catch (error) {
        console.error("loadUsers failed:", error);
        adminState.users = [];
        return [];
    }
}

function normalizeUser(user) {
    const role = normalizeRole(user?.role || "customer");

    return {
        ...user,

        id: user?.id || user?.user_id || "",

        email: safeText(user?.email),

        full_name: safeText(
            user?.full_name ||
            user?.name ||
            user?.display_name,
            "Unnamed user"
        ),

        role,

        active:
            user?.active === true ||
            user?.status === "active" ||
            user?.status === "approved",

        status:
            user?.status ||
            (
                user?.active === true
                    ? "active"
                    : "pending"
            ),

        created_at:
            user?.created_at ||
            user?.joined_at ||
            null,

        last_sign_in_at:
            user?.last_sign_in_at ||
            user?.last_login_at ||
            null,

        last_seen_at:
            user?.last_seen_at ||
            null
    };
}


/* ============================================================
   USER MANAGEMENT
   ============================================================ */

function renderUsers() {
    const container = $("usersList");

    if (!container) {
        return;
    }

    if (!adminState.users.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No users found.
            </div>
        `;
        return;
    }

    container.innerHTML = adminState.users
        .map(user => renderUserCard(user))
        .join("");

    bindUserActions(container);
}

function renderUserCard(user) {
    const role = normalizeRole(user.role);

    const currentAdmin =
        String(user.email || "").toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase();

    const status =
        user.status === "kicked"
            ? "kicked"
            : user.active
                ? "active"
                : "pending";

    return `
        <div class="admin-user-card" data-user-id="${escapeHTML(user.id)}">

            <div class="admin-user-main">

                <div class="admin-avatar">
                    ${
                        user.avatar_url
                            ? `<img src="${escapeHTML(user.avatar_url)}" alt="">`
                            : escapeHTML(
                                String(user.full_name || "U")
                                    .charAt(0)
                                    .toUpperCase()
                            )
                    }
                </div>

                <div class="admin-user-info">

                    <strong>
                        ${escapeHTML(user.full_name)}
                    </strong>

                    <span>
                        ${escapeHTML(user.email || "No email")}
                    </span>

                    <small>
                        Joined:
                        ${escapeHTML(formatDate(user.created_at))}
                    </small>

                    ${
                        user.last_sign_in_at
                            ? `
                                <small>
                                    Last login:
                                    ${escapeHTML(
                                        formatDate(user.last_sign_in_at)
                                    )}
                                </small>
                            `
                            : ""
                    }

                </div>

            </div>

            <div class="admin-user-meta">

                <span class="admin-role-badge ${getRoleClass(role)}">
                    ${escapeHTML(roleLabel(role))}
                </span>

                <span class="admin-status-badge ${getStatusClass(status)}">
                    ${escapeHTML(status)}
                </span>

            </div>

            <div class="admin-user-actions">

                ${
                    currentAdmin
                        ? `
                            <span class="admin-protected-label">
                                Protected admin
                            </span>
                        `
                        : `
                            <label>
                                <span>Role</span>
                                <select
                                    class="admin-role-select"
                                    data-action="role"
                                    data-user-id="${escapeHTML(user.id)}"
                                >
                                    ${roleOptions(role)}
                                </select>
                            </label>

                            ${
                                user.active
                                    ? `
                                        <button
                                            type="button"
                                            class="admin-action-btn"
                                            data-action="deactivate"
                                            data-user-id="${escapeHTML(user.id)}"
                                        >
                                            Deactivate
                                        </button>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            class="admin-action-btn"
                                            data-action="approve"
                                            data-user-id="${escapeHTML(user.id)}"
                                        >
                                            Approve
                                        </button>
                                    `
                            }

                            ${
                                user.status === "kicked"
                                    ? `
                                        <button
                                            type="button"
                                            class="admin-action-btn"
                                            data-action="restore"
                                            data-user-id="${escapeHTML(user.id)}"
                                        >
                                            Restore
                                        </button>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            class="admin-action-btn danger"
                                            data-action="kick"
                                            data-user-id="${escapeHTML(user.id)}"
                                        >
                                            Kick
                                        </button>
                                    `
                            }
                        `
                }

            </div>

        </div>
    `;
}

function roleOptions(selectedRole) {
    const roles = [
        "customer",
        "coworker_2d_box",
        "coworker_polygon",
        "coworker_segmentation",
        "reviewer",
        "staff",
        "admin"
    ];

    return roles
        .map(role => {
            const selected =
                normalizeRole(selectedRole) === role
                    ? "selected"
                    : "";

            return `
                <option value="${escapeHTML(role)}" ${selected}>
                    ${escapeHTML(roleLabel(role))}
                </option>
            `;
        })
        .join("");
}

function bindUserActions(container) {
    all("[data-action]", container).forEach(element => {
        const action = element.dataset.action;
        const userId = element.dataset.userId;

        if (!userId) {
            return;
        }

        if (action === "role" && element.tagName === "SELECT") {
            element.addEventListener("change", async () => {
                await changeUserRole(userId, element.value);
            });

            return;
        }

        element.addEventListener("click", async () => {
            switch (action) {
                case "approve":
                    await setUserActive(userId, true);
                    break;

                case "deactivate":
                    await setUserActive(userId, false);
                    break;

                case "kick":
                    await kickUser(userId);
                    break;

                case "restore":
                    await restoreUser(userId);
                    break;
            }
        });
    });
}


/* ============================================================
   CHANGE USER ROLE
   ============================================================ */

export async function changeUserRole(userId, newRole) {
    if (!requireAdmin("change user roles")) {
        return false;
    }

    const user = adminState.users.find(item => item.id === userId);

    if (!user) {
        showToast("User was not found.", "error");
        return false;
    }

    if (
        String(user.email || "").toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase()
    ) {
        showToast("The default administrator is protected.", "error");
        return false;
    }

    const role = normalizeRole(newRole);

    if (!role) {
        showToast("Invalid role.", "error");
        return false;
    }

    const db = client();

    if (!db) {
        return false;
    }

    try {
        const update = {
            role,
            active: true
        };

        let result = await db
            .from(TABLES.profiles)
            .update(update)
            .eq("id", userId);

        if (result.error) {
            result = await db
                .from(TABLES.profiles)
                .update({
                    role
                })
                .eq("id", userId);
        }

        if (result.error) {
            throw result.error;
        }

        user.role = role;
        user.active = true;
        user.status = "active";

        await logAdminAction(
            "role_changed",
            {
                user_id: userId,
                previous_role: normalizeRole(user.role),
                new_role: role
            }
        );

        showToast(
            `${user.full_name} is now ${roleLabel(role)}.`,
            "success"
        );

        calculateStats();
        renderUsers();
        renderCoworkers();

        return true;
    } catch (error) {
        console.error("changeUserRole failed:", error);
        showToast(
            error?.message || "Unable to change user role.",
            "error"
        );
        return false;
    }
}


/* ============================================================
   APPROVE / DEACTIVATE USER
   ============================================================ */

export async function setUserActive(userId, active) {
    if (!requireAdmin(active ? "approve users" : "deactivate users")) {
        return false;
    }

    const user = adminState.users.find(item => item.id === userId);

    if (!user) {
        showToast("User was not found.", "error");
        return false;
    }

    if (
        String(user.email || "").toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase()
    ) {
        showToast("The default administrator cannot be deactivated.", "error");
        return false;
    }

    const db = client();

    if (!db) {
        return false;
    }

    try {
        const update = {
            active: Boolean(active)
        };

        if (active) {
            update.status = "active";
        }

        let result = await db
            .from(TABLES.profiles)
            .update(update)
            .eq("id", userId);

        if (result.error) {
            result = await db
                .from(TABLES.profiles)
                .update({
                    active: Boolean(active)
                })
                .eq("id", userId);
        }

        if (result.error) {
            throw result.error;
        }

        user.active = Boolean(active);
        user.status = active ? "active" : "inactive";

        await logAdminAction(
            active ? "user_approved" : "user_deactivated",
            {
                user_id: userId
            }
        );

        showToast(
            active
                ? `${user.full_name} approved.`
                : `${user.full_name} deactivated.`,
            "success"
        );

        calculateStats();
        renderUsers();

        return true;
    } catch (error) {
        console.error("setUserActive failed:", error);
        showToast(
            error?.message || "Unable to update user status.",
            "error"
        );
        return false;
    }
}


/* ============================================================
   KICK / RESTORE USER
   ============================================================ */

export async function kickUser(userId) {
    if (!requireAdmin("kick users")) {
        return false;
    }

    const user = adminState.users.find(item => item.id === userId);

    if (!user) {
        showToast("User was not found.", "error");
        return false;
    }

    if (
        String(user.email || "").toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase()
    ) {
        showToast("The default administrator cannot be kicked.", "error");
        return false;
    }

    const confirmed = window.confirm(
        `Kick ${user.full_name}?\n\nTheir account will remain registered but access will be disabled.`
    );

    if (!confirmed) {
        return false;
    }

    const db = client();

    if (!db) {
        return false;
    }

    try {
        let result = await db
            .from(TABLES.profiles)
            .update({
                active: false,
                status: "kicked"
            })
            .eq("id", userId);

        if (result.error) {
            result = await db
                .from(TABLES.profiles)
                .update({
                    active: false
                })
                .eq("id", userId);
        }

        if (result.error) {
            throw result.error;
        }

        user.active = false;
        user.status = "kicked";

        await logAdminAction(
            "user_kicked",
            {
                user_id: userId
            }
        );

        showToast(`${user.full_name} has been kicked.`, "success");

        calculateStats();
        renderUsers();

        return true;
    } catch (error) {
        console.error("kickUser failed:", error);
        showToast(
            error?.message || "Unable to kick user.",
            "error"
        );
        return false;
    }
}

export async function restoreUser(userId) {
    if (!requireAdmin("restore users")) {
        return false;
    }

    return setUserActive(userId, true);
}


/* ============================================================
   COWORKERS
   ============================================================ */

function renderCoworkers() {
    const container = $("coworkersList");

    if (!container) {
        return;
    }

    const workers = adminState.users.filter(user => {
        return (
            isCoworkerRole(user.role) ||
            isReviewerRole(user.role) ||
            isStaffRole(user.role) ||
            isAdminRole(user.role)
        );
    });

    if (!workers.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No coworker or staff accounts found.
            </div>
        `;
        return;
    }

    container.innerHTML = workers
        .map(user => {
            const assignedTasks = adminState.tasks.filter(task => {
                return (
                    task.claimed_by === user.id ||
                    task.assigned_to === user.id ||
                    task.user_id === user.id
                );
            });

            const completed = assignedTasks.filter(task => {
                return [
                    "completed",
                    "submitted",
                    "approved",
                    "done"
                ].includes(
                    String(task.status || "").toLowerCase()
                );
            }).length;

            return `
                <div class="admin-coworker-card">

                    <div class="admin-coworker-header">

                        <strong>
                            ${escapeHTML(user.full_name)}
                        </strong>

                        <span class="admin-role-badge ${getRoleClass(user.role)}">
                            ${escapeHTML(roleLabel(user.role))}
                        </span>

                    </div>

                    <div class="admin-coworker-details">

                        <span>
                            ${escapeHTML(user.email)}
                        </span>

                        <span>
                            ${assignedTasks.length} tasks
                        </span>

                        <span>
                            ${completed} completed
                        </span>

                        <span>
                            ${
                                user.active
                                    ? "Active"
                                    : "Inactive"
                            }
                        </span>

                    </div>

                </div>
            `;
        })
        .join("");
}


/* ============================================================
   CREATE COWORKER / STAFF
   ============================================================ */

function bindCreateCoworkerModal() {
    const modal = $("createCoworkerModal");
    const close = $("closeCreateCoworkerModal");
    const cancel = $("cancelCreateCoworker");
    const form = $("createCoworkerForm");

    if (close) {
        close.addEventListener("click", closeCreateCoworkerModal);
    }

    if (cancel) {
        cancel.addEventListener("click", closeCreateCoworkerModal);
    }

    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                closeCreateCoworkerModal();
            }
        });
    }

    if (form) {
        form.addEventListener("submit", async event => {
            event.preventDefault();
            await createCoworkerAccountFromForm();
        });
    }
}

export function openCreateCoworkerModal() {
    if (!requireAdmin("create coworker accounts")) {
        return;
    }

    const modal = $("createCoworkerModal");

    if (!modal) {
        showToast("Create coworker form was not found.", "error");
        return;
    }

    const role = $("newWorkerRole");

    if (role && !role.options.length) {
        role.innerHTML = roleOptions("coworker_2d_box");
    }

    modal.hidden = false;
    modal.style.display = "flex";
}

export function closeCreateCoworkerModal() {
    const modal = $("createCoworkerModal");

    if (!modal) {
        return;
    }

    modal.hidden = true;
    modal.style.display = "none";
}

async function createCoworkerAccountFromForm() {
    const name = safeText($("newWorkerName")?.value);
    const email = safeText($("newWorkerEmail")?.value).toLowerCase();
    const password = $("newWorkerPassword")?.value || "";
    const role = normalizeRole(
        $("newWorkerRole")?.value ||
        "coworker_2d_box"
    );

    if (!name) {
        showToast("Enter the worker's name.", "error");
        return;
    }

    if (!email || !email.includes("@")) {
        showToast("Enter a valid email address.", "error");
        return;
    }

    if (password.length < 6) {
        showToast(
            "Password must contain at least 6 characters.",
            "error"
        );
        return;
    }

    if (!role) {
        showToast("Select a valid role.", "error");
        return;
    }

    await createCoworkerAccount({
        name,
        email,
        password,
        role
    });
}

export async function createCoworkerAccount({
    name,
    email,
    password,
    role
}) {
    if (!requireAdmin("create coworker accounts")) {
        return null;
    }

    const db = client();

    if (!db) {
        showToast("Supabase is not connected.", "error");
        return null;
    }

    const adminUser = getCurrentUser?.();
    const adminSession = await getAdminSession();

    try {
        /*
         * IMPORTANT:
         * supabase.auth.admin.createUser() requires the service_role key
         * and MUST NOT be called from browser code.
         *
         * Therefore we use normal signUp.
         */

        const signup = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    role,
                    active: true
                }
            }
        });

        if (signup.error) {
            throw signup.error;
        }

        const newUser = signup.data?.user;

        if (!newUser?.id) {
            throw new Error(
                "Account was not created. Supabase did not return a user."
            );
        }

        /*
         * If email confirmation is disabled, signUp may return a session.
         * Restore the administrator session immediately.
         */

        if (adminSession) {
            await restoreSession(adminSession);
        }

        /*
         * Explicitly create/update profile.
         */

        let profileResult = await db
            .from(TABLES.profiles)
            .upsert({
                id: newUser.id,
                email,
                full_name: name,
                role,
                active: true,
                status: "active"
            });

        if (profileResult.error) {
            profileResult = await db
                .from(TABLES.profiles)
                .upsert({
                    id: newUser.id,
                    email,
                    full_name: name,
                    role,
                    active: true
                });
        }

        if (profileResult.error) {
            console.warn(
                "Profile creation/update failed:",
                profileResult.error
            );
        }

        await restoreSession(adminSession);

        await logAdminAction(
            "coworker_created",
            {
                user_id: newUser.id,
                email,
                role
            }
        );

        closeCreateCoworkerModal();

        const form = $("createCoworkerForm");

        if (form) {
            form.reset();
        }

        await loadUsers();
        calculateStats();
        renderUsers();
        renderCoworkers();

        showToast(
            `${name} created as ${roleLabel(role)}.`,
            "success"
        );

        /*
         * Supabase may require email confirmation.
         * In that case the user exists but cannot sign in until
         * confirmation is completed.
         */
        if (!signup.data?.session) {
            showToast(
                "Account created. If email confirmation is enabled, the worker must confirm their email before signing in.",
                "info"
            );
        }

        return newUser;
    } catch (error) {
        console.error("createCoworkerAccount failed:", error);

        await restoreSession(adminSession);

        showToast(
            error?.message || "Unable to create coworker account.",
            "error"
        );

        return null;
    } finally {
        /*
         * Keep the administrator logged in.
         */
        if (adminUser && adminSession) {
            await restoreSession(adminSession);
        }
    }
}

async function getAdminSession() {
    const db = client();

    if (!db) {
        return null;
    }

    try {
        const result = await db.auth.getSession();

        return result?.data?.session || null;
    } catch {
        return null;
    }
}

async function restoreSession(session) {
    const db = client();

    if (!db || !session?.access_token || !session?.refresh_token) {
        return;
    }

    try {
        await db.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
        });
    } catch (error) {
        console.warn("Could not restore admin session:", error);
    }
}


/* ============================================================
   TASKS
   ============================================================ */

export async function loadTasks() {
    const db = client();

    if (!db) {
        adminState.tasks = [];
        return [];
    }

    try {
        let result = await db
            .from(TABLES.tasks)
            .select("*")
            .order("created_at", { ascending: false });

        if (result.error) {
            console.error("Admin tasks query failed:", result.error);
            adminState.tasks = [];
            return [];
        }

        adminState.tasks = (result.data || []).map(normalizeTask);

        calculateStats();

        return adminState.tasks;
    } catch (error) {
        console.error("loadTasks failed:", error);
        adminState.tasks = [];
        return [];
    }
}

function normalizeTask(task) {
    const status = String(
        task?.status ||
        "available"
    ).toLowerCase();

    return {
        ...task,

        id:
            task?.id ||
            task?.task_id ||
            "",

        title:
            safeText(
                task?.title ||
                task?.name ||
                task?.task_title,
                "Untitled task"
            ),

        work_type:
            safeText(
                task?.work_type ||
                task?.annotation_type ||
                task?.type,
                ""
            ),

        work_role:
            normalizeRole(
                task?.work_role ||
                task?.role ||
                ""
            ),

        status,

        claimed_by:
            task?.claimed_by ||
            task?.assigned_to ||
            null,

        assigned_to:
            task?.assigned_to ||
            task?.claimed_by ||
            null,

        created_by:
            task?.created_by ||
            null,

        created_at:
            task?.created_at ||
            null,

        updated_at:
            task?.updated_at ||
            null,

        expected_duration:
            task?.expected_duration ||
            task?.duration ||
            null,

        pay:
            task?.pay ??
            task?.amount ??
            null
    };
}


/* ============================================================
   TASK RENDERING
   ============================================================ */

function renderAdminTasks() {
    const container = $("adminTasksList");

    if (!container) {
        return;
    }

    if (!adminState.tasks.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No tasks found.
            </div>
        `;
        return;
    }

    container.innerHTML = adminState.tasks
        .map(task => renderAdminTask(task))
        .join("");

    bindTaskActions(container);
}

function renderAdminTask(task) {
    const assignedUser = findUser(
        task.assigned_to ||
        task.claimed_by
    );

    const annotationsCount =
        Number(task.annotation_count) ||
        Number(task.annotations_count) ||
        0;

    const progress = calculateTaskProgress(task);

    return `
        <div
            class="admin-task-card"
            data-task-id="${escapeHTML(task.id)}"
        >

            <div class="admin-task-header">

                <div>
                    <strong>
                        ${escapeHTML(task.title)}
                    </strong>

                    <small>
                        ID:
                        ${escapeHTML(task.id)}
                    </small>
                </div>

                <span class="admin-status-badge ${getStatusClass(task.status)}">
                    ${escapeHTML(task.status)}
                </span>

            </div>

            <div class="admin-task-details">

                <span>
                    Work:
                    ${escapeHTML(
                        task.work_type ||
                        annotationTypeForRole(task.work_role) ||
                        "—"
                    )}
                </span>

                <span>
                    Role:
                    ${escapeHTML(
                        roleLabel(task.work_role) || "—"
                    )}
                </span>

                <span>
                    Duration:
                    ${escapeHTML(
                        task.expected_duration
                            ? `${task.expected_duration} min`
                            : "—"
                    )}
                </span>

                <span>
                    Pay:
                    ${
                        task.pay !== null &&
                        task.pay !== undefined
                            ? escapeHTML(formatMoney(task.pay))
                            : "—"
                    }
                </span>

                <span>
                    Annotations:
                    ${escapeHTML(annotationsCount)}
                </span>

            </div>

            <div class="admin-task-progress">

                <div class="admin-progress-bar">
                    <span style="width:${progress}%"></span>
                </div>

                <small>
                    ${progress}% complete
                </small>

            </div>

            <div class="admin-task-assignment">

                <label>
                    Assign to

                    <select
                        class="admin-task-assign-select"
                        data-action="assign-task"
                        data-task-id="${escapeHTML(task.id)}"
                    >

                        <option value="">
                            Unassigned
                        </option>

                        ${workerOptions(
                            assignedUser?.id ||
                            task.assigned_to ||
                            task.claimed_by ||
                            ""
                        )}

                    </select>
                </label>

                <button
                    type="button"
                    class="admin-action-btn danger"
                    data-action="unassign-task"
                    data-task-id="${escapeHTML(task.id)}"
                >
                    Unassign
                </button>

            </div>

        </div>
    `;
}

function workerOptions(selectedId = "") {
    return adminState.users
        .filter(user => {
            return (
                isCoworkerRole(user.role) ||
                isReviewerRole(user.role) ||
                isStaffRole(user.role) ||
                isAdminRole(user.role)
            );
        })
        .map(user => {
            const selected =
                user.id === selectedId
                    ? "selected"
                    : "";

            return `
                <option
                    value="${escapeHTML(user.id)}"
                    ${selected}
                >
                    ${escapeHTML(user.full_name)}
                    — ${escapeHTML(roleLabel(user.role))}
                </option>
            `;
        })
        .join("");
}

function bindTaskActions(container) {
    all("[data-action]", container).forEach(element => {
        const action = element.dataset.action;
        const taskId = element.dataset.taskId;

        if (!taskId) {
            return;
        }

        if (
            action === "assign-task" &&
            element.tagName === "SELECT"
        ) {
            element.addEventListener("change", async () => {
                await assignTask(taskId, element.value || null);
            });

            return;
        }

        element.addEventListener("click", async () => {
            if (action === "unassign-task") {
                await assignTask(taskId, null);
            }
        });
    });
}


/* ============================================================
   ASSIGN / REASSIGN TASK
   ============================================================ */

export async function assignTask(taskId, userId) {
    if (!requireAdmin("assign tasks")) {
        return false;
    }

    const task = adminState.tasks.find(item => item.id === taskId);

    if (!task) {
        showToast("Task was not found.", "error");
        return false;
    }

    const db = client();

    if (!db) {
        return false;
    }

    try {
        const update = {
            assigned_to: userId || null
        };

        /*
         * Keep claimed_by synchronized only when explicitly assigning.
         * If your schema does not contain assigned_to, the fallback below
         * updates claimed_by.
         */

        if (userId) {
            update.claimed_by = userId;
        } else {
            update.claimed_by = null;
        }

        let result = await db
            .from(TABLES.tasks)
            .update(update)
            .eq("id", taskId);

        if (result.error) {
            result = await db
                .from(TABLES.tasks)
                .update({
                    claimed_by: userId || null
                })
                .eq("id", taskId);
        }

        if (result.error) {
            throw result.error;
        }

        task.assigned_to = userId || null;
        task.claimed_by = userId || null;

        if (userId) {
            const assignedUser = findUser(userId);

            /*
             * If the task was previously available, assignment means
             * it is now claimed.
             */
            if (
                ![
                    "completed",
                    "submitted",
                    "approved",
                    "done"
                ].includes(task.status)
            ) {
                task.status = "claimed";
            }

            await logAdminAction(
                "task_assigned",
                {
                    task_id: taskId,
                    user_id: userId
                }
            );

            showToast(
                `Task assigned to ${
                    assignedUser?.full_name || "worker"
                }.`,
                "success"
            );
        } else {
            if (task.status === "claimed") {
                task.status = "available";
            }

            await logAdminAction(
                "task_unassigned",
                {
                    task_id: taskId
                }
            );

            showToast("Task unassigned.", "success");
        }

        renderAdminTasks();
        calculateStats();

        return true;
    } catch (error) {
        console.error("assignTask failed:", error);
        showToast(
            error?.message || "Unable to assign task.",
            "error"
        );
        return false;
    }
}


/* ============================================================
   TASK PROGRESS
   ============================================================ */

function calculateTaskProgress(task) {
    const status = String(task.status || "").toLowerCase();

    if (["approved", "done"].includes(status)) {
        return 100;
    }

    if (["completed", "submitted"].includes(status)) {
        return 90;
    }

    if (["reviewing", "review"].includes(status)) {
        return 75;
    }

    if (["claimed", "in_progress", "working"].includes(status)) {
        return 50;
    }

    if (["skipped"].includes(status)) {
        return 0;
    }

    return 0;
}


/* ============================================================
   CREATE TASK
   ============================================================ */

function bindCreateTaskModal() {
    const modal = $("createTaskModal");
    const close = $("closeCreateTaskModal");
    const cancel = $("cancelCreateTask");
    const form = $("createTaskForm");

    if (close) {
        close.addEventListener("click", closeCreateTaskModal);
    }

    if (cancel) {
        cancel.addEventListener("click", closeCreateTaskModal);
    }

    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                closeCreateTaskModal();
            }
        });
    }

    if (form) {
        form.addEventListener("submit", async event => {
            event.preventDefault();
            await createTaskFromForm();
        });
    }
}

function openCreateTaskModal() {
    if (!requireAdmin("create tasks")) {
        return;
    }

    const modal = $("createTaskModal");

    if (!modal) {
        showToast("Create task form was not found.", "error");
        return;
    }

    modal.hidden = false;
    modal.style.display = "flex";
}

function closeCreateTaskModal() {
    const modal = $("createTaskModal");

    if (!modal) {
        return;
    }

    modal.hidden = true;
    modal.style.display = "none";
}

async function createTaskFromForm() {
    const title = safeText($("taskTitle")?.value);
    const workType = safeText($("taskShape")?.value);
    const duration = Number($("taskDuration")?.value || 0);
    const pay = Number($("taskPay")?.value || 0);
    const mediaInput = $("taskMediaInput");
    const file = mediaInput?.files?.[0] || null;

    if (!title) {
        showToast("Enter a task title.", "error");
        return;
    }

    if (!workType) {
        showToast("Select a task type.", "error");
        return;
    }

    await createAdminTask({
        title,
        workType,
        duration,
        pay,
        file
    });
}

export async function createAdminTask({
    title,
    workType,
    duration = 0,
    pay = 0,
    file = null
}) {
    if (!requireAdmin("create tasks")) {
        return null;
    }

    const db = client();

    if (!db) {
        return null;
    }

    const user = getCurrentUser?.();

    try {
        let mediaPath = null;

        /*
         * Upload task media if a file was selected.
         */
        if (file) {
            const bucket =
                APP_CONFIG?.buckets?.taskMedia ||
                APP_CONFIG?.buckets?.media ||
                "task-media";

            const safeName = file.name
                .replace(/[^a-zA-Z0-9._-]/g, "_");

            mediaPath =
                `admin-tasks/${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2)}_${safeName}`;

            const upload = await db.storage
                .from(bucket)
                .upload(mediaPath, file, {
                    upsert: false,
                    contentType: file.type || undefined
                });

            if (upload.error) {
                throw upload.error;
            }
        }

        const role =
            roleFromWorkType(workType);

        const payload = {
            title,
            work_type: workType,
            work_role: role,
            status: "available",
            expected_duration: duration || null,
            duration: duration || null,
            pay: Number.isFinite(pay) ? pay : 0,
            created_by: user?.id || null,
            media_path: mediaPath,
            metadata: {
                source: "admin",
                created_by_admin: true
            }
        };

        let result = await db
            .from(TABLES.tasks)
            .insert(payload)
            .select()
            .single();

        /*
         * Fallback for schemas with fewer columns.
         */
        if (result.error) {
            const fallbackPayload = {
                title,
                work_type: workType,
                work_role: role,
                status: "available",
                created_by: user?.id || null,
                media_path: mediaPath
            };

            result = await db
                .from(TABLES.tasks)
                .insert(fallbackPayload)
                .select()
                .single();
        }

        if (result.error) {
            throw result.error;
        }

        await logAdminAction(
            "task_created",
            {
                task_id: result.data?.id || null
            }
        );

        closeCreateTaskModal();

        const form = $("createTaskForm");

        if (form) {
            form.reset();
        }

        await loadTasks();
        calculateStats();
        renderAdminTasks();

        showToast("Task created successfully.", "success");

        return result.data;
    } catch (error) {
        console.error("createAdminTask failed:", error);

        showToast(
            error?.message || "Unable to create task.",
            "error"
        );

        return null;
    }
}

function roleFromWorkType(workType) {
    const value = String(workType || "").toLowerCase();

    if (
        value.includes("polygon")
    ) {
        return WORK_ROLE?.POLYGON || "coworker_polygon";
    }

    if (
        value.includes("segmentation") ||
        value.includes("segment")
    ) {
        return WORK_ROLE?.SEGMENTATION || "coworker_segmentation";
    }

    return WORK_ROLE?.BOX || "coworker_2d_box";
}


/* ============================================================
   PAY RATES
   ============================================================ */

async function loadPayRates() {
    const db = client();

    if (!db) {
        adminState.payRates = [];
        return [];
    }

    try {
        const result = await db
            .from(TABLES.payRates)
            .select("*")
            .order("created_at", { ascending: false });

        if (result.error) {
            console.warn(
                "Pay rates table unavailable:",
                result.error
            );

            adminState.payRates = [];
            return [];
        }

        adminState.payRates = result.data || [];

        return adminState.payRates;
    } catch (error) {
        console.warn("loadPayRates failed:", error);
        adminState.payRates = [];
        return [];
    }
}

function renderPayRates() {
    const container = $("payRatesList");

    if (!container) {
        return;
    }

    const rates = adminState.payRates;

    if (!rates.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No pay rates have been configured yet.
            </div>
        `;
        return;
    }

    container.innerHTML = rates
        .map(rate => {
            const role =
                normalizeRole(
                    rate.role ||
                    rate.work_role ||
                    ""
                );

            return `
                <div class="admin-rate-card">

                    <div>
                        <strong>
                            ${escapeHTML(
                                roleLabel(role) || role || "All roles"
                            )}
                        </strong>

                        <small>
                            ${escapeHTML(
                                rate.work_type ||
                                rate.annotation_type ||
                                "All work"
                            )}
                        </small>
                    </div>

                    <strong>
                        ${escapeHTML(
                            formatMoney(
                                rate.rate ??
                                rate.pay ??
                                rate.amount
                            )
                        )}
                    </strong>

                </div>
            `;
        })
        .join("");
}


/* ============================================================
   PAYMENTS
   ============================================================ */

async function loadPayments() {
    const db = client();

    if (!db) {
        adminState.payments = [];
        return [];
    }

    try {
        const result = await db
            .from(TABLES.payments)
            .select("*")
            .order("created_at", { ascending: false });

        if (result.error) {
            console.warn(
                "Payments table unavailable:",
                result.error
            );

            adminState.payments = [];
            return [];
        }

        adminState.payments = result.data || [];

        calculateStats();

        return adminState.payments;
    } catch (error) {
        console.warn("loadPayments failed:", error);
        adminState.payments = [];
        return [];
    }
}

function renderPayments() {
    const container = $("paymentsList");

    if (!container) {
        return;
    }

    if (!adminState.payments.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No payment records found.
            </div>
        `;
        return;
    }

    container.innerHTML = adminState.payments
        .map(payment => renderPayment(payment))
        .join("");

    bindPaymentActions(container);
}

function renderPayment(payment) {
    const userId =
        payment.user_id ||
        payment.worker_id ||
        payment.profile_id ||
        "";

    const user = findUser(userId);

    const paid =
        payment.paid === true ||
        payment.status === "paid";

    return `
        <div class="admin-payment-card">

            <div class="admin-payment-user">

                <strong>
                    ${escapeHTML(
                        user?.full_name ||
                        payment.full_name ||
                        "Unknown user"
                    )}
                </strong>

                <span>
                    ${escapeHTML(
                        user?.email ||
                        payment.email ||
                        ""
                    )}
                </span>

            </div>

            <div class="admin-payment-info">

                <span>
                    Amount:
                    ${escapeHTML(
                        formatMoney(
                            payment.amount ??
                            payment.total ??
                            payment.pay
                        )
                    )}
                </span>

                <span>
                    Period:
                    ${escapeHTML(
                        payment.period ||
                        payment.description ||
                        "—"
                    )}
                </span>

                <span>
                    ${escapeHTML(
                        formatDate(
                            payment.created_at ||
                            payment.date
                        )
                    )}
                </span>

            </div>

            <div class="admin-payment-action">

                <span class="admin-status-badge ${
                    paid
                        ? "status-paid"
                        : "status-unpaid"
                }">
                    ${paid ? "Paid" : "Not paid"}
                </span>

                <button
                    type="button"
                    class="admin-action-btn"
                    data-payment-action="${
                        paid ? "unpaid" : "paid"
                    }"
                    data-payment-id="${escapeHTML(
                        payment.id || ""
                    )}"
                >
                    ${
                        paid
                            ? "Mark not paid"
                            : "Mark paid"
                    }
                </button>

            </div>

        </div>
    `;
}

function bindPaymentActions(container) {
    all("[data-payment-action]", container).forEach(button => {
        button.addEventListener("click", async () => {
            const paymentId =
                button.dataset.paymentId;

            const paid =
                button.dataset.paymentAction === "paid";

            await markPaymentPaid(paymentId, paid);
        });
    });
}

export async function markPaymentPaid(paymentId, paid = true) {
    if (!requireAdmin("manage payments")) {
        return false;
    }

    const db = client();

    if (!db) {
        return false;
    }

    const payment =
        adminState.payments.find(
            item => String(item.id) === String(paymentId)
        );

    if (!payment) {
        showToast("Payment was not found.", "error");
        return false;
    }

    try {
        let result = await db
            .from(TABLES.payments)
            .update({
                paid: Boolean(paid),
                status: paid ? "paid" : "unpaid",
                paid_at: paid ? new Date().toISOString() : null,
                paid_by: paid
                    ? getCurrentUser?.()?.id || null
                    : null
            })
            .eq("id", paymentId);

        if (result.error) {
            result = await db
                .from(TABLES.payments)
                .update({
                    paid: Boolean(paid),
                    status: paid ? "paid" : "unpaid"
                })
                .eq("id", paymentId);
        }

        if (result.error) {
            throw result.error;
        }

        payment.paid = Boolean(paid);
        payment.status = paid ? "paid" : "unpaid";
        payment.paid_at =
            paid
                ? new Date().toISOString()
                : null;

        await logAdminAction(
            paid
                ? "payment_marked_paid"
                : "payment_marked_unpaid",
            {
                payment_id: paymentId
            }
        );

        calculateStats();
        renderPayments();

        showToast(
            paid
                ? "Payment marked as paid."
                : "Payment marked as not paid.",
            "success"
        );

        return true;
    } catch (error) {
        console.error("markPaymentPaid failed:", error);

        showToast(
            error?.message || "Unable to update payment.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   ACTIVITY LOGS
   ============================================================ */

async function loadActivities() {
    const db = client();

    if (!db) {
        adminState.activities = [];
        return [];
    }

    try {
        const result = await db
            .from(TABLES.activities)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);

        if (result.error) {
            console.warn(
                "Activity table unavailable:",
                result.error
            );

            adminState.activities = [];
            return [];
        }

        adminState.activities = result.data || [];

        return adminState.activities;
    } catch (error) {
        console.warn("loadActivities failed:", error);
        adminState.activities = [];
        return [];
    }
}

function renderActivities() {
    const container = $("activityList");

    if (!container) {
        return;
    }

    if (!adminState.activities.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No activity records found.
            </div>
        `;
        return;
    }

    container.innerHTML = adminState.activities
        .map(activity => {
            const user =
                findUser(
                    activity.user_id ||
                    activity.profile_id
                );

            const action =
                activity.action ||
                activity.event ||
                activity.type ||
                "activity";

            return `
                <div class="admin-activity-row">

                    <div>
                        <strong>
                            ${escapeHTML(action)}
                        </strong>

                        <span>
                            ${escapeHTML(
                                user?.full_name ||
                                activity.email ||
                                "System"
                            )}
                        </span>
                    </div>

                    <time>
                        ${escapeHTML(
                            formatDate(
                                activity.created_at ||
                                activity.timestamp
                            )
                        )}
                    </time>

                </div>
            `;
        })
        .join("");
}


/* ============================================================
   ADMIN LOGGING
   ============================================================ */

async function logAdminAction(action, metadata = {}) {
    try {
        await logActivity?.(
            action,
            metadata
        );
    } catch (error) {
        console.warn("Admin activity logging failed:", error);
    }

    try {
        await logWorkflowEvent?.(
            action,
            metadata
        );
    } catch (error) {
        console.warn("Admin workflow logging failed:", error);
    }
}


/* ============================================================
   STATISTICS
   ============================================================ */

function calculateStats() {
    const users = adminState.users;

    adminState.stats.users = users.length;

    adminState.stats.customers =
        users.filter(
            user => normalizeRole(user.role) === "customer"
        ).length;

    adminState.stats.coworkers =
        users.filter(
            user => isCoworkerRole(user.role)
        ).length;

    adminState.stats.reviewers =
        users.filter(
            user => isReviewerRole(user.role)
        ).length;

    adminState.stats.staff =
        users.filter(
            user => isStaffRole(user.role)
        ).length;

    adminState.stats.admins =
        users.filter(
            user => isAdminRole(user.role)
        ).length;

    adminState.stats.active =
        users.filter(user => user.active).length;

    adminState.stats.pending =
        users.filter(user => !user.active).length;

    const tasks = adminState.tasks;

    adminState.stats.tasks = tasks.length;

    adminState.stats.available =
        tasks.filter(
            task => task.status === "available"
        ).length;

    adminState.stats.claimed =
        tasks.filter(
            task => [
                "claimed",
                "in_progress",
                "working"
            ].includes(task.status)
        ).length;

    adminState.stats.completed =
        tasks.filter(
            task => [
                "completed",
                "submitted",
                "done"
            ].includes(task.status)
        ).length;

    adminState.stats.approved =
        tasks.filter(
            task => task.status === "approved"
        ).length;

    adminState.stats.paid =
        adminState.payments.filter(
            payment =>
                payment.paid === true ||
                payment.status === "paid"
        ).length;

    adminState.stats.unpaid =
        adminState.payments.filter(
            payment =>
                payment.paid !== true &&
                payment.status !== "paid"
        ).length;

    renderStats();
}

function renderStats() {
    const mappings = {
        adminUsersCount: adminState.stats.users,
        adminCustomersCount: adminState.stats.customers,
        adminCoworkersCount: adminState.stats.coworkers,
        adminReviewersCount: adminState.stats.reviewers,
        adminStaffCount: adminState.stats.staff,
        adminAdminsCount: adminState.stats.admins,

        adminActiveUsersCount: adminState.stats.active,
        adminPendingUsersCount: adminState.stats.pending,

        adminTasksCount: adminState.stats.tasks,
        adminAvailableTasksCount: adminState.stats.available,
        adminClaimedTasksCount: adminState.stats.claimed,
        adminCompletedTasksCount: adminState.stats.completed,
        adminApprovedTasksCount: adminState.stats.approved,

        adminPaidCount: adminState.stats.paid,
        adminUnpaidCount: adminState.stats.unpaid,

        usersCount: adminState.stats.users,
        activeUsersCount: adminState.stats.active,
        pendingUsersCount: adminState.stats.pending,
        tasksCount: adminState.stats.tasks,
        availableTasksCount: adminState.stats.available,
        completedTasksCount: adminState.stats.completed
    };

    Object.entries(mappings).forEach(([id, value]) => {
        const element = $(id);

        if (element) {
            element.textContent = String(value);
        }
    });
}


/* ============================================================
   OVERVIEW
   ============================================================ */

function renderOverview() {
    calculateStats();

    const recentActivity = $("adminRecentActivity");

    if (recentActivity) {
        const recent =
            adminState.activities.slice(0, 8);

        if (!recent.length) {
            recentActivity.innerHTML = `
                <div class="admin-empty-state">
                    No recent activity.
                </div>
            `;
        } else {
            recentActivity.innerHTML = recent
                .map(activity => {
                    const user =
                        findUser(
                            activity.user_id ||
                            activity.profile_id
                        );

                    return `
                        <div class="admin-activity-row">

                            <div>
                                <strong>
                                    ${escapeHTML(
                                        activity.action ||
                                        activity.event ||
                                        "Activity"
                                    )}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        user?.full_name ||
                                        "System"
                                    )}
                                </span>
                            </div>

                            <time>
                                ${escapeHTML(
                                    formatShortDate(
                                        activity.created_at
                                    )
                                )}
                            </time>

                        </div>
                    `;
                })
                .join("");
        }
    }

    const progress = $("adminTaskProgress");

    if (progress) {
        const recentTasks =
            adminState.tasks.slice(0, 10);

        progress.innerHTML =
            recentTasks.length
                ? recentTasks
                    .map(task => {
                        const percent =
                            calculateTaskProgress(task);

                        return `
                            <div class="admin-progress-row">

                                <div>
                                    <strong>
                                        ${escapeHTML(task.title)}
                                    </strong>

                                    <span>
                                        ${escapeHTML(
                                            task.status
                                        )}
                                    </span>
                                </div>

                                <div class="admin-progress-bar">
                                    <span
                                        style="width:${percent}%"
                                    ></span>
                                </div>

                                <small>
                                    ${percent}%
                                </small>

                            </div>
                        `;
                    })
                    .join("")
                : `
                    <div class="admin-empty-state">
                        No tasks found.
                    </div>
                `;
    }
}


/* ============================================================
   RENDER ALL
   ============================================================ */

function renderAllAdminData() {
    calculateStats();

    renderUsers();
    renderCoworkers();
    renderAdminTasks();
    renderPayments();
    renderPayRates();
    renderActivities();
    renderOverview();
}

function renderCurrentAdminPage() {
    renderAllAdminData();
}


/* ============================================================
   EXPORT
   ============================================================ */

function bindAdminExportButtons() {
    const csv = $("copyAdminCSV");

    if (csv) {
        csv.addEventListener("click", async () => {
            await copyAdminCSV();
        });
    }

    const html = $("downloadAdminHTML");

    if (html) {
        html.addEventListener("click", () => {
            downloadAdminHTML();
        });
    }
}

export async function copyAdminCSV() {
    if (!requireAdmin("export admin data")) {
        return;
    }

    const csv = buildAdminCSV();

    try {
        await navigator.clipboard.writeText(csv);

        showToast(
            "Admin CSV copied to clipboard.",
            "success"
        );
    } catch (error) {
        console.warn(
            "Clipboard failed:",
            error
        );

        const output = $("adminExportOutput");

        if (output) {
            output.value = csv;
            output.focus();
            output.select();
        }

        showToast(
            "CSV generated. You can copy it from the export area.",
            "info"
        );
    }

    const output = $("adminExportOutput");

    if (output) {
        if ("value" in output) {
            output.value = csv;
        } else {
            output.textContent = csv;
        }
    }

    return csv;
}

function buildAdminCSV() {
    const rows = [];

    rows.push([
        "Type",
        "ID",
        "Name",
        "Email",
        "Role",
        "Status",
        "Task",
        "Work Type",
        "Assigned To",
        "Pay",
        "Created At",
        "Updated At"
    ]);

    adminState.users.forEach(user => {
        rows.push([
            "USER",
            user.id,
            user.full_name,
            user.email,
            roleLabel(user.role),
            user.active ? "active" : user.status,
            "",
            "",
            "",
            "",
            user.created_at,
            user.last_sign_in_at
        ]);
    });

    adminState.tasks.forEach(task => {
        const assigned =
            findUser(
                task.assigned_to ||
                task.claimed_by
            );

        rows.push([
            "TASK",
            task.id,
            "",
            "",
            roleLabel(task.work_role),
            task.status,
            task.title,
            task.work_type,
            assigned?.full_name || "",
            task.pay,
            task.created_at,
            task.updated_at
        ]);
    });

    adminState.payments.forEach(payment => {
        const user =
            findUser(
                payment.user_id ||
                payment.worker_id ||
                payment.profile_id
            );

        rows.push([
            "PAYMENT",
            payment.id,
            user?.full_name || payment.full_name || "",
            user?.email || payment.email || "",
            roleLabel(user?.role || ""),
            payment.status || (
                payment.paid
                    ? "paid"
                    : "unpaid"
            ),
            "",
            payment.work_type || "",
            "",
            payment.amount ??
                payment.total ??
                payment.pay ??
                "",
            payment.created_at ||
                payment.date ||
                "",
            payment.paid_at ||
                ""
        ]);
    });

    return rows
        .map(row =>
            row
                .map(csvEscape)
                .join(",")
        )
        .join("\n");
}

function csvEscape(value) {
    const text = String(value ?? "");

    if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n")
    ) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}

function downloadAdminHTML() {
    if (!requireAdmin("export admin data")) {
        return;
    }

    const html = buildAdminHTMLExport();

    const blob = new Blob(
        [html],
        {
            type: "text/html;charset=utf-8"
        }
    );

    const url =
        URL.createObjectURL(blob);

    const anchor =
        document.createElement("a");

    anchor.href = url;
    anchor.download =
        `admin-export-${new Date()
            .toISOString()
            .slice(0, 10)}.html`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);

    const output = $("adminExportOutput");

    if (output) {
        if ("value" in output) {
            output.value = html;
        } else {
            output.innerHTML = html;
        }
    }

    showToast(
        "Admin HTML export downloaded.",
        "success"
    );
}

function buildAdminHTMLExport() {
    const generated =
        new Date().toLocaleString();

    const userRows =
        adminState.users
            .map(user => `
                <tr>
                    <td>${escapeHTML(user.full_name)}</td>
                    <td>${escapeHTML(user.email)}</td>
                    <td>${escapeHTML(roleLabel(user.role))}</td>
                    <td>${escapeHTML(
                        user.active
                            ? "Active"
                            : user.status
                    )}</td>
                    <td>${escapeHTML(
                        formatDate(user.created_at)
                    )}</td>
                </tr>
            `)
            .join("");

    const taskRows =
        adminState.tasks
            .map(task => {
                const assigned =
                    findUser(
                        task.assigned_to ||
                        task.claimed_by
                    );

                return `
                    <tr>
                        <td>${escapeHTML(task.id)}</td>
                        <td>${escapeHTML(task.title)}</td>
                        <td>${escapeHTML(task.work_type)}</td>
                        <td>${escapeHTML(
                            roleLabel(task.work_role)
                        )}</td>
                        <td>${escapeHTML(task.status)}</td>
                        <td>${escapeHTML(
                            assigned?.full_name || "Unassigned"
                        )}</td>
                        <td>${escapeHTML(
                            task.pay ?? ""
                        )}</td>
                    </tr>
                `;
            })
            .join("");

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Export</title>

<style>
body {
    font-family: Arial, sans-serif;
    margin: 30px;
    color: #222;
}

h1, h2 {
    margin-bottom: 8px;
}

.meta {
    color: #666;
    margin-bottom: 30px;
}

.stats {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 30px;
}

.stat {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 14px;
}

.stat strong {
    display: block;
    font-size: 24px;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 35px;
}

th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
    font-size: 13px;
}

th {
    background: #f4f4f4;
}
</style>

</head>

<body>

<h1>Admin Workspace Export</h1>

<div class="meta">
Generated: ${escapeHTML(generated)}
</div>

<div class="stats">

    <div class="stat">
        <strong>${adminState.stats.users}</strong>
        Users
    </div>

    <div class="stat">
        <strong>${adminState.stats.active}</strong>
        Active
    </div>

    <div class="stat">
        <strong>${adminState.stats.pending}</strong>
        Pending
    </div>

    <div class="stat">
        <strong>${adminState.stats.tasks}</strong>
        Tasks
    </div>

    <div class="stat">
        <strong>${adminState.stats.completed}</strong>
        Completed
    </div>

    <div class="stat">
        <strong>${adminState.stats.approved}</strong>
        Approved
    </div>

</div>

<h2>Users</h2>

<table>

<thead>
<tr>
    <th>Name</th>
    <th>Email</th>
    <th>Role</th>
    <th>Status</th>
    <th>Joined</th>
</tr>
</thead>

<tbody>
${userRows}
</tbody>

</table>

<h2>Tasks</h2>

<table>

<thead>
<tr>
    <th>ID</th>
    <th>Task</th>
    <th>Work Type</th>
    <th>Role</th>
    <th>Status</th>
    <th>Assigned To</th>
    <th>Pay</th>
</tr>
</thead>

<tbody>
${taskRows}
</tbody>

</table>

</body>
</html>
    `.trim();
}


/* ============================================================
   HELPERS
   ============================================================ */

function findUser(userId) {
    if (!userId) {
        return null;
    }

    return (
        adminState.users.find(
            user =>
                String(user.id) ===
                String(userId)
        ) ||
        null
    );
}


/* ============================================================
   PUBLIC REFRESH
   ============================================================ */

export async function refreshAdminCenter() {
    if (!canOpenAdminCenter()) {
        return false;
    }

    await loadAdminData();

    return true;
}

export function getAdminState() {
    return adminState;
}


/* ============================================================
   WINDOW COMPATIBILITY
   ============================================================ */

window.admin = {
    state: adminState,

    initialize: initializeAdmin,

    open: openAdminCenter,
    close: closeAdminCenter,

    refresh: refreshAdminCenter,

    loadUsers,
    loadTasks,
    loadPayments,
    loadPayRates,
    loadActivities,

    approveUser: userId =>
        setUserActive(userId, true),

    deactivateUser: userId =>
        setUserActive(userId, false),

    kickUser,
    restoreUser,

    changeUserRole,

    createCoworkerAccount,

    createTask: createAdminTask,

    assignTask,

    markPaymentPaid,

    exportCSV: copyAdminCSV,
    exportHTML: downloadAdminHTML,

    getState: getAdminState
};


/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeAdmin,
        { once: true }
    );
} else {
    initializeAdmin();
}


/* ============================================================
   EXPORTS
   ============================================================ */

export {
    switchAdminTab,
    renderUsers,
    renderCoworkers,
    renderAdminTasks,
    renderPayments,
    renderPayRates,
    renderActivities,
    renderOverview,
    calculateStats,
    updateAdminButtonVisibility
};
