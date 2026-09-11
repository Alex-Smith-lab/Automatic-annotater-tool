/* ============================================================
   ADMIN CENTER
   ------------------------------------------------------------
   Complete administrator workspace.

   Handles:
   - Admin access
   - Protected default administrator
   - User management
   - Approve / deactivate users
   - Kick / restore users
   - Role changes
   - Coworker / staff / reviewer account creation
   - Task creation
   - Task assignment / reassignment
   - Task progress
   - Pay rates
   - Payments
   - Activity logs
   - CSV export
   - HTML export
   - Dashboard statistics

   IMPORTANT:
   - Browser code never uses a service_role key.
   - Supabase publishable/anon key is used through supabase.js.
   - The default administrator is protected.
   - Every exported function is exported ONLY ONCE.
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

const DEFAULT_ADMIN_EMAIL =
    "antonymbali96@gmail.com";

const TABLES = {
    profiles:
        APP_CONFIG?.tables?.profiles ||
        "profiles",

    tasks:
        APP_CONFIG?.tables?.tasks ||
        "tasks",

    annotations:
        APP_CONFIG?.tables?.annotations ||
        "annotations",

    payments:
        APP_CONFIG?.tables?.payments ||
        APP_CONFIG?.tables?.taskPayments ||
        "task_payments",

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
    return Array.from(
        root.querySelectorAll(selector)
    );
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function safeText(
    value,
    fallback = ""
) {
    const valueText =
        String(value ?? "").trim();

    return valueText || fallback;
}

function showToast(
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

    let container =
        $("toastContainer");

    if (!container) {
        container =
            document.createElement(
                "div"
            );

        container.id =
            "toastContainer";

        document.body.appendChild(
            container
        );
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

    window.setTimeout(
        () => item.remove(),
        4000
    );
}

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return date.toLocaleString();
}

function formatShortDate(value) {
    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return date.toLocaleDateString();
}

function formatMoney(value) {
    const number =
        Number(value);

    if (
        !Number.isFinite(number)
    ) {
        return "—";
    }

    return number.toLocaleString(
        undefined,
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}

function getRoleClass(role) {
    return (
        "role-" +
        normalizeRole(role)
            .replace(
                /[^a-z0-9_-]/gi,
                "-"
            )
    );
}

function getStatusClass(status) {
    return (
        "status-" +
        String(
            status ||
            "unknown"
        )
            .toLowerCase()
            .replace(
                /[^a-z0-9_-]/gi,
                "-"
            )
    );
}


/* ============================================================
   SUPABASE
   ============================================================ */

function client() {
    try {
        return (
            getSupabase?.() ||
            window.supabaseClient ||
            null
        );
    } catch {
        return (
            window.supabaseClient ||
            null
        );
    }
}


/* ============================================================
   ADMIN ACCESS
   ============================================================ */

function isDefaultAdmin() {
    const email =
        String(
            getUserEmail?.() ||
            getCurrentUser?.()?.email ||
            getCurrentProfile?.()?.email ||
            ""
        )
            .trim()
            .toLowerCase();

    return (
        email ===
        DEFAULT_ADMIN_EMAIL
    );
}

function currentRole() {
    return normalizeRole(
        getRole?.() ||
        getCurrentProfile?.()?.role ||
        getProfile?.()?.role ||
        ""
    );
}

function canOpenAdminCenter() {
    if (isDefaultAdmin()) {
        return true;
    }

    if (
        typeof isAdmin ===
        "function" &&
        isAdmin()
    ) {
        return true;
    }

    return isAdminRole(
        currentRole()
    );
}

function canManageAdminData() {
    if (isDefaultAdmin()) {
        return true;
    }

    if (
        typeof isAdmin ===
        "function" &&
        isAdmin()
    ) {
        return true;
    }

    if (
        typeof isStaff ===
        "function" &&
        isStaff()
    ) {
        return true;
    }

    const role =
        currentRole();

    return (
        isAdminRole(role) ||
        isStaffRole(role)
    );
}

function requireAdmin(
    action =
        "perform this action"
) {
    if (
        !canManageAdminData()
    ) {
        showToast(
            `You do not have permission to ${action}.`,
            "error"
        );

        return false;
    }

    return true;
}


/* ============================================================
   INITIALIZATION
   ============================================================ */

export function initializeAdmin() {
    if (
        adminState.initialized
    ) {
        updateAdminButtonVisibility();
        return adminState;
    }

    adminState.initialized =
        true;

    bindAdminNavigation();
    bindAdminButtons();
    bindCreateTaskModal();
    bindCreateCoworkerModal();
    bindAdminExportButtons();

    updateAdminButtonVisibility();

    return adminState;
}


/* ============================================================
   ADMIN BUTTON VISIBILITY
   ============================================================ */

export function updateAdminButtonVisibility() {
    const button =
        $("adminCenterButton");

    if (!button) {
        return false;
    }

    const visible =
        canOpenAdminCenter();

    button.hidden =
        !visible;

    button.style.display =
        visible
            ? ""
            : "none";

    button.setAttribute(
        "aria-hidden",
        visible
            ? "false"
            : "true"
    );

    return visible;
}


/* ============================================================
   OPEN ADMIN CENTER
   ============================================================ */

export async function openAdminCenter() {
    if (
        !requireAdmin(
            "open the Admin Center"
        )
    ) {
        return false;
    }

    const modal =
        $("adminModal");

    if (!modal) {
        showToast(
            "Admin Center element was not found.",
            "error"
        );

        return false;
    }

    adminState.open =
        true;

    modal.hidden =
        false;

    modal.style.display =
        "flex";

    modal.classList.add(
        "admin-fullscreen-modal"
    );

    document.body.classList.add(
        "admin-center-open"
    );

    await loadAdminData();

    switchAdminTab(
        adminState.currentTab ||
        "overview"
    );

    return true;
}


/* ============================================================
   CLOSE ADMIN CENTER
   ============================================================ */

export function closeAdminCenter() {
    const modal =
        $("adminModal");

    adminState.open =
        false;

    if (modal) {
        modal.hidden =
            true;

        modal.style.display =
            "none";

        modal.classList.remove(
            "admin-fullscreen-modal"
        );
    }

    document.body.classList.remove(
        "admin-center-open"
    );

    return true;
}


/* ============================================================
   ADMIN NAVIGATION
   ============================================================ */

function bindAdminNavigation() {
    const adminButton =
        $("adminCenterButton");

    if (adminButton) {
        adminButton.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                await openAdminCenter();
            }
        );
    }

    const closeButton =
        $("closeAdminModal");

    if (closeButton) {
        closeButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                closeAdminCenter();
            }
        );
    }

    const modal =
        $("adminModal");

    if (modal) {
        modal.addEventListener(
            "click",
            event => {
                if (
                    event.target ===
                    modal
                ) {
                    /*
                     * Intentionally do not
                     * close Admin Center.
                     */
                }
            }
        );
    }

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key ===
                    "Escape" &&
                adminState.open
            ) {
                closeAdminCenter();
            }
        }
    );
}


/* ============================================================
   ADMIN TABS
   ============================================================ */

function switchAdminTab(
    tabName
) {
    if (
        !canOpenAdminCenter()
    ) {
        return;
    }

    const requested =
        String(
            tabName ||
            "overview"
        );

    adminState.currentTab =
        requested;

    all(
        "[data-admin-tab]"
    ).forEach(button => {
        const active =
            button.dataset.adminTab ===
            requested;

        button.classList.toggle(
            "active",
            active
        );

        button.setAttribute(
            "aria-selected",
            active
                ? "true"
                : "false"
        );
    });

    all(
        "[data-admin-page]"
    ).forEach(page => {
        const active =
            page.dataset.adminPage ===
            requested;

        page.hidden =
            !active;

        page.style.display =
            active
                ? ""
                : "none";

        page.classList.toggle(
            "active",
            active
        );
    });

    renderCurrentAdminPage();
}


/* ============================================================
   ADMIN BUTTON BINDINGS
   ============================================================ */

function bindAdminButtons() {
    all(
        "[data-admin-tab]"
    ).forEach(button => {
        button.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                switchAdminTab(
                    button.dataset.adminTab
                );

                await refreshCurrentAdminTab();
            }
        );
    });

    const refreshUsers =
        $("refreshUsersButton");

    if (refreshUsers) {
        refreshUsers.addEventListener(
            "click",
            async () => {
                await loadUsers();
                renderUsers();
                calculateStats();
            }
        );
    }

    const createCoworker =
        $("createCoworkerButton");

    if (createCoworker) {
        createCoworker.addEventListener(
            "click",
            () => {
                openCreateCoworkerModal();
            }
        );
    }

    const createTask =
        $("createTaskButton");

    if (createTask) {
        createTask.addEventListener(
            "click",
            () => {
                openCreateTaskModal();
            }
        );
    }

    const approvalRefresh =
        $("approvalRefreshButton");

    if (approvalRefresh) {
        approvalRefresh.addEventListener(
            "click",
            async () => {
                await loadUsers();
                renderUsers();
                calculateStats();
            }
        );
    }
}


/* ============================================================
   REFRESH CURRENT TAB
   ============================================================ */

async function refreshCurrentAdminTab() {
    if (
        !canOpenAdminCenter()
    ) {
        return false;
    }

    switch (
        adminState.currentTab
    ) {
        case "users":
        case "user-management":
            await loadUsers();
            renderUsers();
            break;

        case "coworkers":
            await loadUsers();
            await loadTasks();
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

        case "overview":
        default:
            await loadAdminData();
            renderCurrentAdminPage();
            break;
    }

    return true;
}


/* ============================================================
   LOAD ALL ADMIN DATA
   ============================================================ */

export async function loadAdminData() {
    if (
        !requireAdmin(
            "load Admin Center data"
        )
    ) {
        return false;
    }

    if (
        adminState.loading
    ) {
        return false;
    }

    adminState.loading =
        true;

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
        adminState.loading =
            false;
    }
}


/* ============================================================
   USERS
   ============================================================ */

export async function loadUsers() {
    const db =
        client();

    if (!db) {
        adminState.users =
            [];

        return [];
    }

    try {
        const result =
            await db
                .from(
                    TABLES.profiles
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );

        if (result.error) {
            throw result.error;
        }

        adminState.users =
            (
                result.data ||
                []
            ).map(
                normalizeUser
            );

        calculateStats();

        return adminState.users;
    } catch (error) {
        console.error(
            "loadUsers failed:",
            error
        );

        adminState.users =
            [];

        showToast(
            error?.message ||
                "Unable to load users.",
            "error"
        );

        return [];
    }
}

function normalizeUser(
    user
) {
    const role =
        normalizeRole(
            user?.role ||
                "customer"
        );

    const kicked =
        Boolean(
            user?.kicked_at
        );

    const active =
        user?.active ===
        true;

    return {
        ...user,

        id:
            user?.id ||
            user?.user_id ||
            "",

        email:
            safeText(
                user?.email
            ),

        full_name:
            safeText(
                user?.full_name ||
                    user?.name ||
                    user?.display_name,
                "Unnamed user"
            ),

        role,

        active,

        kicked,

        status:
            kicked
                ? "kicked"
                : active
                    ? "active"
                    : "pending",

        created_at:
            user?.created_at ||
            user?.joined_at ||
            null,

        last_sign_in_at:
            user?.last_sign_in_at ||
            user?.last_login_at ||
            null,

        last_logout_at:
            user?.last_logout_at ||
            null
    };
}


/* ============================================================
   USER RENDERING
   ============================================================ */

function renderUsers() {
    const container =
        $("usersList");

    if (!container) {
        return;
    }

    if (
        !adminState.users.length
    ) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No users found.
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.users
            .map(
                renderUserCard
            )
            .join("");

    bindUserActions(
        container
    );
}

function renderUserCard(
    user
) {
    const role =
        normalizeRole(
            user.role
        );

    const protectedAdmin =
        String(
            user.email ||
                ""
        )
            .trim()
            .toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase();

    const status =
        user.kicked
            ? "kicked"
            : user.active
                ? "active"
                : "pending";

    return `
        <div
            class="admin-user-card"
            data-user-id="${escapeHTML(
                user.id
            )}"
        >

            <div class="admin-user-main">

                <div class="admin-avatar">
                    ${
                        user.avatar_url
                            ? `
                                <img
                                    src="${escapeHTML(
                                        user.avatar_url
                                    )}"
                                    alt=""
                                >
                            `
                            : escapeHTML(
                                String(
                                    user.full_name ||
                                        "U"
                                )
                                    .charAt(
                                        0
                                    )
                                    .toUpperCase()
                            )
                    }
                </div>

                <div class="admin-user-info">

                    <strong>
                        ${escapeHTML(
                            user.full_name
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
                        user.last_sign_in_at
                            ? `
                                <small>
                                    Last login:
                                    ${escapeHTML(
                                        formatDate(
                                            user.last_sign_in_at
                                        )
                                    )}
                                </small>
                            `
                            : ""
                    }

                    ${
                        user.last_logout_at
                            ? `
                                <small>
                                    Last logout:
                                    ${escapeHTML(
                                        formatDate(
                                            user.last_logout_at
                                        )
                                    )}
                                </small>
                            `
                            : ""
                    }

                </div>

            </div>

            <div class="admin-user-meta">

                <span
                    class="admin-role-badge ${getRoleClass(
                        role
                    )}"
                >
                    ${escapeHTML(
                        roleLabel(
                            role
                        )
                    )}
                </span>

                <span
                    class="admin-status-badge ${getStatusClass(
                        status
                    )}"
                >
                    ${escapeHTML(
                        status
                    )}
                </span>

            </div>

            <div class="admin-user-actions">

                ${
                    protectedAdmin
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
                                    data-user-id="${escapeHTML(
                                        user.id
                                    )}"
                                >
                                    ${roleOptions(
                                        role
                                    )}
                                </select>
                            </label>

                            ${
                                user.active &&
                                !user.kicked
                                    ? `
                                        <button
                                            type="button"
                                            class="admin-action-btn"
                                            data-action="deactivate"
                                            data-user-id="${escapeHTML(
                                                user.id
                                            )}"
                                        >
                                            Deactivate
                                        </button>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            class="admin-action-btn"
                                            data-action="approve"
                                            data-user-id="${escapeHTML(
                                                user.id
                                            )}"
                                        >
                                            Approve
                                        </button>
                                    `
                            }

                            ${
                                user.kicked
                                    ? `
                                        <button
                                            type="button"
                                            class="admin-action-btn"
                                            data-action="restore"
                                            data-user-id="${escapeHTML(
                                                user.id
                                            )}"
                                        >
                                            Restore
                                        </button>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            class="admin-action-btn danger"
                                            data-action="kick"
                                            data-user-id="${escapeHTML(
                                                user.id
                                            )}"
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

function roleOptions(
    selectedRole
) {
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
                normalizeRole(
                    selectedRole
                ) === role
                    ? "selected"
                    : "";

            return `
                <option
                    value="${escapeHTML(
                        role
                    )}"
                    ${selected}
                >
                    ${escapeHTML(
                        roleLabel(
                            role
                        )
                    )}
                </option>
            `;
        })
        .join("");
}

function bindUserActions(
    container
) {
    all(
        "[data-action]",
        container
    ).forEach(element => {
        const action =
            element.dataset.action;

        const userId =
            element.dataset.userId;

        if (!userId) {
            return;
        }

        if (
            action === "role" &&
            element.tagName ===
                "SELECT"
        ) {
            element.addEventListener(
                "change",
                async () => {
                    const oldValue =
                        element.dataset.previousRole ||
                        "";

                    const success =
                        await changeUserRole(
                            userId,
                            element.value,
                            oldValue
                        );

                    if (!success) {
                        element.value =
                            oldValue ||
                            element.value;
                    } else {
                        element.dataset.previousRole =
                            element.value;
                    }
                }
            );

            element.dataset.previousRole =
                element.value;

            return;
        }

        element.addEventListener(
            "click",
            async () => {
                switch (action) {
                    case "approve":
                        await setUserActive(
                            userId,
                            true
                        );
                        break;

                    case "deactivate":
                        await setUserActive(
                            userId,
                            false
                        );
                        break;

                    case "kick":
                        await kickUser(
                            userId
                        );
                        break;

                    case "restore":
                        await restoreUser(
                            userId
                        );
                        break;
                }
            }
        );
    });
}


/* ============================================================
   CHANGE USER ROLE
   ============================================================ */

export async function changeUserRole(
    userId,
    newRole,
    previousRole = ""
) {
    if (
        !requireAdmin(
            "change user roles"
        )
    ) {
        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(
                    item.id
                ) ===
                String(userId)
        );

    if (!user) {
        showToast(
            "User was not found.",
            "error"
        );

        return false;
    }

    if (
        String(
            user.email || ""
        )
            .toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase()
    ) {
        showToast(
            "The default administrator is protected.",
            "error"
        );

        return false;
    }

    const role =
        normalizeRole(
            newRole
        );

    if (!role) {
        showToast(
            "Invalid role.",
            "error"
        );

        return false;
    }

    const db =
        client();

    if (!db) {
        showToast(
            "Supabase is not connected.",
            "error"
        );

        return false;
    }

    const oldRole =
        normalizeRole(
            previousRole ||
                user.role
        );

    try {
        const result =
            await db
                .from(
                    TABLES.profiles
                )
                .update({
                    role,
                    active: true,
                    kicked_at: null,
                    kicked_by: null,
                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    userId
                );

        if (result.error) {
            /*
             * Fallback for a schema where
             * one of the optional fields
             * is unavailable.
             */
            const fallback =
                await db
                    .from(
                        TABLES.profiles
                    )
                    .update({
                        role,
                        active: true
                    })
                    .eq(
                        "id",
                        userId
                    );

            if (
                fallback.error
            ) {
                throw fallback.error;
            }
        }

        user.role =
            role;

        user.active =
            true;

        user.kicked =
            false;

        user.status =
            "active";

        await logAdminAction(
            "role_changed",
            {
                user_id:
                    userId,

                previous_role:
                    oldRole,

                new_role:
                    role
            }
        );

        showToast(
            `${user.full_name} is now ${roleLabel(
                role
            )}.`,
            "success"
        );

        calculateStats();

        renderUsers();
        renderCoworkers();

        return true;
    } catch (error) {
        console.error(
            "changeUserRole failed:",
            error
        );

        showToast(
            error?.message ||
                "Unable to change user role.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   APPROVE / DEACTIVATE USER
   ============================================================ */

export async function setUserActive(
    userId,
    active
) {
    if (
        !requireAdmin(
            active
                ? "approve users"
                : "deactivate users"
        )
    ) {
        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(
                    item.id
                ) ===
                String(userId)
        );

    if (!user) {
        showToast(
            "User was not found.",
            "error"
        );

        return false;
    }

    if (
        String(
            user.email || ""
        )
            .toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase()
    ) {
        showToast(
            active
                ? "The default administrator is already protected."
                : "The default administrator cannot be deactivated.",
            "error"
        );

        return false;
    }

    const db =
        client();

    if (!db) {
        return false;
    }

    try {
        const update = {
            active:
                Boolean(
                    active
                ),
            updated_at:
                new Date()
                    .toISOString()
        };

        if (active) {
            update.kicked_at =
                null;

            update.kicked_by =
                null;
        }

        let result =
            await db
                .from(
                    TABLES.profiles
                )
                .update(
                    update
                )
                .eq(
                    "id",
                    userId
                );

        if (
            result.error
        ) {
            result =
                await db
                    .from(
                        TABLES.profiles
                    )
                    .update({
                        active:
                            Boolean(
                                active
                            )
                    })
                    .eq(
                        "id",
                        userId
                    );
        }

        if (
            result.error
        ) {
            throw result.error;
        }

        user.active =
            Boolean(
                active
            );

        if (active) {
            user.kicked =
                false;

            user.status =
                "active";
        } else {
            user.status =
                "inactive";
        }

        await logAdminAction(
            active
                ? "user_approved"
                : "user_deactivated",
            {
                user_id:
                    userId
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
        console.error(
            "setUserActive failed:",
            error
        );

        showToast(
            error?.message ||
                "Unable to update user status.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   KICK USER
   ============================================================ */

export async function kickUser(
    userId
) {
    if (
        !requireAdmin(
            "kick users"
        )
    ) {
        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(
                    item.id
                ) ===
                String(userId)
        );

    if (!user) {
        showToast(
            "User was not found.",
            "error"
        );

        return false;
    }

    if (
        String(
            user.email || ""
        )
            .toLowerCase() ===
        DEFAULT_ADMIN_EMAIL.toLowerCase()
    ) {
        showToast(
            "The default administrator cannot be kicked.",
            "error"
        );

        return false;
    }

    const confirmed =
        window.confirm(
            `Kick ${user.full_name}?\n\nTheir account will remain registered but access will be disabled.`
        );

    if (!confirmed) {
        return false;
    }

    const db =
        client();

    if (!db) {
        return false;
    }

    const currentAdmin =
        getCurrentUser?.();

    try {
        let result =
            await db
                .from(
                    TABLES.profiles
                )
                .update({
                    active:
                        false,
                    kicked_at:
                        new Date()
                            .toISOString(),
                    kicked_by:
                        currentAdmin?.id ||
                        null,
                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    userId
                );

        if (
            result.error
        ) {
            result =
                await db
                    .from(
                        TABLES.profiles
                    )
                    .update({
                        active:
                            false
                    })
                    .eq(
                        "id",
                        userId
                    );
        }

        if (
            result.error
        ) {
            throw result.error;
        }

        user.active =
            false;

        user.kicked =
            true;

        user.status =
            "kicked";

        user.kicked_at =
            new Date()
                .toISOString();

        await logAdminAction(
            "user_kicked",
            {
                user_id:
                    userId
            }
        );

        showToast(
            `${user.full_name} has been kicked.`,
            "success"
        );

        calculateStats();
        renderUsers();

        return true;
    } catch (error) {
        console.error(
            "kickUser failed:",
            error
        );

        showToast(
            error?.message ||
                "Unable to kick user.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   RESTORE USER
   ============================================================ */

export async function restoreUser(
    userId
) {
    if (
        !requireAdmin(
            "restore users"
        )
    ) {
        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(
                    item.id
                ) ===
                String(userId)
        );

    if (!user) {
        showToast(
            "User was not found.",
            "error"
        );

        return false;
    }

    return setUserActive(
        userId,
        true
    );
}


/* ============================================================
   COWORKERS
   ============================================================ */

function renderCoworkers() {
    const container =
        $("coworkersList");

    if (!container) {
        return;
    }

    const workers =
        adminState.users.filter(
            user =>
                isCoworkerRole(
                    user.role
                ) ||
                isReviewerRole(
                    user.role
                ) ||
                isStaffRole(
                    user.role
                ) ||
                isAdminRole(
                    user.role
                )
        );

    if (!workers.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No coworker or staff accounts found.
            </div>
        `;

        return;
    }

    container.innerHTML =
        workers
            .map(
                user => {
                    const assignedTasks =
                        adminState.tasks.filter(
                            task =>
                                task.claimed_by ===
                                    user.id ||
                                task.assigned_to ===
                                    user.id
                        );

                    const completed =
                        assignedTasks.filter(
                            task =>
                                [
                                    "completed",
                                    "submitted",
                                    "in_review",
                                    "review",
                                    "approved",
                                    "paid"
                                ].includes(
                                    String(
                                        task.status ||
                                            ""
                                    ).toLowerCase()
                                )
                        ).length;

                    return `
                        <div class="admin-coworker-card">

                            <div class="admin-coworker-header">

                                <strong>
                                    ${escapeHTML(
                                        user.full_name
                                    )}
                                </strong>

                                <span
                                    class="admin-role-badge ${getRoleClass(
                                        user.role
                                    )}"
                                >
                                    ${escapeHTML(
                                        roleLabel(
                                            user.role
                                        )
                                    )}
                                </span>

                            </div>

                            <div class="admin-coworker-details">

                                <span>
                                    ${escapeHTML(
                                        user.email
                                    )}
                                </span>

                                <span>
                                    ${assignedTasks.length}
                                    tasks
                                </span>

                                <span>
                                    ${completed}
                                    completed
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
                }
            )
            .join("");
}


/* ============================================================
   CREATE COWORKER MODAL
   ============================================================ */

function bindCreateCoworkerModal() {
    const modal =
        $("createCoworkerModal");

    const close =
        $("closeCreateCoworkerModal");

    const cancel =
        $("cancelCreateCoworker");

    const form =
        $("createCoworkerForm");

    if (close) {
        close.addEventListener(
            "click",
            closeCreateCoworkerModal
        );
    }

    if (cancel) {
        cancel.addEventListener(
            "click",
            closeCreateCoworkerModal
        );
    }

    if (modal) {
        modal.addEventListener(
            "click",
            event => {
                if (
                    event.target ===
                    modal
                ) {
                    closeCreateCoworkerModal();
                }
            }
        );
    }

    if (form) {
        form.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                await createCoworkerAccountFromForm();
            }
        );
    }
}


/* ============================================================
   OPEN CREATE COWORKER
   ============================================================ */

export function openCreateCoworkerModal() {
    if (
        !requireAdmin(
            "create coworker accounts"
        )
    ) {
        return;
    }

    const modal =
        $("createCoworkerModal");

    if (!modal) {
        showToast(
            "Create coworker form was not found.",
            "error"
        );

        return;
    }

    const role =
        $("newWorkerRole");

    if (
        role &&
        !role.options.length
    ) {
        role.innerHTML =
            roleOptions(
                "coworker_2d_box"
            );
    }

    modal.hidden =
        false;

    modal.style.display =
        "flex";
}


/* ============================================================
   CLOSE CREATE COWORKER
   ============================================================ */

export function closeCreateCoworkerModal() {
    const modal =
        $("createCoworkerModal");

    if (!modal) {
        return;
    }

    modal.hidden =
        true;

    modal.style.display =
        "none";
}


/* ============================================================
   CREATE COWORKER FORM
   ============================================================ */

async function createCoworkerAccountFromForm() {
    const name =
        safeText(
            $("newWorkerName")
                ?.value
        );

    const email =
        safeText(
            $("newWorkerEmail")
                ?.value
        ).toLowerCase();

    const password =
        $("newWorkerPassword")
            ?.value ||
        "";

    const role =
        normalizeRole(
            $("newWorkerRole")
                ?.value ||
            "coworker_2d_box"
        );

    if (!name) {
        showToast(
            "Enter the worker's name.",
            "error"
        );

        return;
    }

    if (
        !email ||
        !email.includes("@")
    ) {
        showToast(
            "Enter a valid email address.",
            "error"
        );

        return;
    }

    if (
        password.length < 6
    ) {
        showToast(
            "Password must contain at least 6 characters.",
            "error"
        );

        return;
    }

    if (!role) {
        showToast(
            "Select a valid role.",
            "error"
        );

        return;
    }

    await createCoworkerAccount({
        name,
        email,
        password,
        role
    });
}


/* ============================================================
   CREATE COWORKER ACCOUNT
   ============================================================ */

export async function createCoworkerAccount({
    name,
    email,
    password,
    role
}) {
    if (
        !requireAdmin(
            "create coworker accounts"
        )
    ) {
        return null;
    }

    const db =
        client();

    if (!db) {
        showToast(
            "Supabase is not connected.",
            "error"
        );

        return null;
    }

    const adminSession =
        await getAdminSession();

    const normalizedEmail =
        safeText(
            email
        ).toLowerCase();

    const normalizedRole =
        normalizeRole(
            role
        );

    try {
        /*
         * Browser-side code must never
         * call auth.admin.createUser().
         *
         * Normal signup is used here.
         */
        const signup =
            await db.auth.signUp({
                email:
                    normalizedEmail,

                password,

                options: {
                    data: {
                        full_name:
                            name,

                        role:
                            normalizedRole,

                        active:
                            true
                    }
                }
            });

        if (
            signup.error
        ) {
            throw signup.error;
        }

        const newUser =
            signup.data?.user;

        if (!newUser?.id) {
            throw new Error(
                "Account was not created. Supabase did not return a user."
            );
        }

        /*
         * Restore administrator session
         * before touching the profile row.
         */
        await restoreSession(
            adminSession
        );

        let profileResult =
            await db
                .from(
                    TABLES.profiles
                )
                .upsert(
                    {
                        id:
                            newUser.id,

                        email:
                            normalizedEmail,

                        full_name:
                            name,

                        role:
                            normalizedRole,

                        active:
                            true,

                        must_change_password:
                            true,

                        kicked_at:
                            null,

                        kicked_by:
                            null,

                        updated_at:
                            new Date()
                                .toISOString()
                    },
                    {
                        onConflict:
                            "id"
                    }
                );

        if (
            profileResult.error
        ) {
            profileResult =
                await db
                    .from(
                        TABLES.profiles
                    )
                    .upsert(
                        {
                            id:
                                newUser.id,

                            email:
                                normalizedEmail,

                            full_name:
                                name,

                            role:
                                normalizedRole,

                            active:
                                true
                        },
                        {
                            onConflict:
                                "id"
                        }
                    );
        }

        if (
            profileResult.error
        ) {
            throw profileResult.error;
        }

        await restoreSession(
            adminSession
        );

        await logAdminAction(
            "coworker_created",
            {
                user_id:
                    newUser.id,

                email:
                    normalizedEmail,

                role:
                    normalizedRole
            }
        );

        closeCreateCoworkerModal();

        const form =
            $("createCoworkerForm");

        if (form) {
            form.reset();
        }

        await loadUsers();

        calculateStats();

        renderUsers();
        renderCoworkers();

        showToast(
            `${name} created as ${roleLabel(
                normalizedRole
            )}.`,
            "success"
        );

        if (
            !signup.data?.session
        ) {
            showToast(
                "Account created. If email confirmation is enabled, the worker must confirm the email before signing in.",
                "info"
            );
        }

        return newUser;
    } catch (error) {
        console.error(
            "createCoworkerAccount failed:",
            error
        );

        await restoreSession(
            adminSession
        );

        showToast(
            error?.message ||
                "Unable to create coworker account.",
            "error"
        );

        return null;
    } finally {
        await restoreSession(
            adminSession
        );
    }
}


/* ============================================================
   ADMIN SESSION
   ============================================================ */

async function getAdminSession() {
    const db =
        client();

    if (!db) {
        return null;
    }

    try {
        const result =
            await db.auth.getSession();

        return (
            result?.data
                ?.session ||
            null
        );
    } catch {
        return null;
    }
}

async function restoreSession(
    session
) {
    const db =
        client();

    if (
        !db ||
        !session?.access_token ||
        !session?.refresh_token
    ) {
        return;
    }

    try {
        await db.auth.setSession({
            access_token:
                session.access_token,

            refresh_token:
                session.refresh_token
        });
    } catch (error) {
        console.warn(
            "Could not restore admin session:",
            error
        );
    }
}


/* ============================================================
   TASKS
   ============================================================ */

export async function loadTasks() {
    const db =
        client();

    if (!db) {
        adminState.tasks =
            [];

        return [];
    }

    try {
        const result =
            await db
                .from(
                    TABLES.tasks
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );

        if (
            result.error
        ) {
            throw result.error;
        }

        adminState.tasks =
            (
                result.data ||
                []
            ).map(
                normalizeTask
            );

        calculateStats();

        return adminState.tasks;
    } catch (error) {
        console.error(
            "loadTasks failed:",
            error
        );

        adminState.tasks =
            [];

        showToast(
            error?.message ||
                "Unable to load tasks.",
            "error"
        );

        return [];
    }
}

function normalizeTask(
    task
) {
    const status =
        String(
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

        annotation_type:
            safeText(
                task?.annotation_type,
                annotationTypeForRole(
                    task?.work_role
                ) || ""
            ),

        status,

        claimed_by:
            task?.claimed_by ||
            null,

        assigned_to:
            task?.assigned_to ||
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
            task?.expected_duration ??
            task?.duration ??
            null,

        pay:
            task?.pay ??
            task?.pay_amount ??
            0,

        annotation_count:
            Number(
                task?.annotation_count
            ) || 0
    };
}


/* ============================================================
   TASK RENDERING
   ============================================================ */

function renderAdminTasks() {
    const container =
        $("adminTasksList");

    if (!container) {
        return;
    }

    if (
        !adminState.tasks.length
    ) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No tasks found.
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.tasks
            .map(
                renderAdminTask
            )
            .join("");

    bindTaskActions(
        container
    );
}

function renderAdminTask(
    task
) {
    const assignedUser =
        findUser(
            task.assigned_to ||
                task.claimed_by
        );

    const progress =
        calculateTaskProgress(
            task
        );

    const annotationCount =
        Number(
            task.annotation_count
        ) || 0;

    return `
        <div
            class="admin-task-card"
            data-task-id="${escapeHTML(
                task.id
            )}"
        >

            <div class="admin-task-header">

                <div>

                    <strong>
                        ${escapeHTML(
                            task.title
                        )}
                    </strong>

                    <small>
                        ID:
                        ${escapeHTML(
                            task.id
                        )}
                    </small>

                </div>

                <span
                    class="admin-status-badge ${getStatusClass(
                        task.status
                    )}"
                >
                    ${escapeHTML(
                        task.status
                    )}
                </span>

            </div>

            <div class="admin-task-details">

                <span>
                    Work:
                    ${escapeHTML(
                        task.work_type ||
                            annotationTypeForRole(
                                task.work_role
                            ) ||
                            "—"
                    )}
                </span>

                <span>
                    Role:
                    ${escapeHTML(
                        roleLabel(
                            task.work_role
                        ) ||
                            "—"
                    )}
                </span>

                <span>
                    Duration:
                    ${
                        task.expected_duration
                            ? escapeHTML(
                                `${task.expected_duration} min`
                            )
                            : "—"
                    }
                </span>

                <span>
                    Pay:
                    ${escapeHTML(
                        formatMoney(
                            task.pay
                        )
                    )}
                </span>

                <span>
                    Annotations:
                    ${escapeHTML(
                        annotationCount
                    )}
                </span>

            </div>

            <div class="admin-task-progress">

                <div class="admin-progress-bar">
                    <span
                        style="width:${progress}%"
                    ></span>
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
                        data-task-id="${escapeHTML(
                            task.id
                        )}"
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
                    data-task-id="${escapeHTML(
                        task.id
                    )}"
                >
                    Unassign
                </button>

            </div>

        </div>
    `;
}

function workerOptions(
    selectedId = ""
) {
    return adminState.users
        .filter(
            user =>
                isCoworkerRole(
                    user.role
                ) ||
                isReviewerRole(
                    user.role
                ) ||
                isStaffRole(
                    user.role
                ) ||
                isAdminRole(
                    user.role
                )
        )
        .map(
            user => {
                const selected =
                    String(
                        user.id
                    ) ===
                    String(
                        selectedId
                    )
                        ? "selected"
                        : "";

                return `
                    <option
                        value="${escapeHTML(
                            user.id
                        )}"
                        ${selected}
                    >
                        ${escapeHTML(
                            user.full_name
                        )}
                        —
                        ${escapeHTML(
                            roleLabel(
                                user.role
                            )
                        )}
                    </option>
                `;
            }
        )
        .join("");
}

function bindTaskActions(
    container
) {
    all(
        "[data-action]",
        container
    ).forEach(element => {
        const action =
            element.dataset.action;

        const taskId =
            element.dataset.taskId;

        if (!taskId) {
            return;
        }

        if (
            action ===
                "assign-task" &&
            element.tagName ===
                "SELECT"
        ) {
            element.addEventListener(
                "change",
                async () => {
                    await assignTask(
                        taskId,
                        element.value ||
                            null
                    );
                }
            );

            return;
        }

        element.addEventListener(
            "click",
            async () => {
                if (
                    action ===
                    "unassign-task"
                ) {
                    await assignTask(
                        taskId,
                        null
                    );
                }
            }
        );
    });
}


/* ============================================================
   ASSIGN / REASSIGN TASK
   ============================================================ */

export async function assignTask(
    taskId,
    userId
) {
    if (
        !requireAdmin(
            "assign tasks"
        )
    ) {
        return false;
    }

    const task =
        adminState.tasks.find(
            item =>
                String(
                    item.id
                ) ===
                String(taskId)
        );

    if (!task) {
        showToast(
            "Task was not found.",
            "error"
        );

        return false;
    }

    if (
        userId &&
        !findUser(userId)
    ) {
        showToast(
            "Selected worker was not found.",
            "error"
        );

        return false;
    }

    const db =
        client();

    if (!db) {
        return false;
    }

    try {
        const previousUser =
            task.assigned_to ||
            task.claimed_by ||
            null;

        const update = {
            assigned_to:
                userId ||
                null,

            claimed_by:
                userId ||
                null,

            updated_at:
                new Date()
                    .toISOString()
        };

        if (userId) {
            if (
                [
                    "available",
                    "draft",
                    "unclaimed"
                ].includes(
                    task.status
                )
            ) {
                update.status =
                    "claimed";
            }
        } else if (
            task.status ===
            "claimed"
        ) {
            update.status =
                "available";
        }

        let result =
            await db
                .from(
                    TABLES.tasks
                )
                .update(
                    update
                )
                .eq(
                    "id",
                    taskId
                );

        if (
            result.error
        ) {
            /*
             * Fallback if status or
             * assigned_to update fails.
             */
            result =
                await db
                    .from(
                        TABLES.tasks
                    )
                    .update({
                        assigned_to:
                            userId ||
                            null,

                        claimed_by:
                            userId ||
                            null
                    })
                    .eq(
                        "id",
                        taskId
                    );
        }

        if (
            result.error
        ) {
            throw result.error;
        }

        task.assigned_to =
            userId ||
            null;

        task.claimed_by =
            userId ||
            null;

        if (userId) {
            if (
                [
                    "available",
                    "draft",
                    "unclaimed"
                ].includes(
                    task.status
                )
            ) {
                task.status =
                    "claimed";
            }

            const assignedUser =
                findUser(
                    userId
                );

            await logAdminAction(
                "task_assigned",
                {
                    task_id:
                        taskId,

                    user_id:
                        userId,

                    previous_user_id:
                        previousUser
                }
            );

            showToast(
                `Task assigned to ${
                    assignedUser?.full_name ||
                    "worker"
                }.`,
                "success"
            );
        } else {
            if (
                task.status ===
                "claimed"
            ) {
                task.status =
                    "available";
            }

            await logAdminAction(
                "task_unassigned",
                {
                    task_id:
                        taskId,

                    previous_user_id:
                        previousUser
                }
            );

            showToast(
                "Task unassigned.",
                "success"
            );
        }

        renderAdminTasks();
        renderCoworkers();
        calculateStats();

        return true;
    } catch (error) {
        console.error(
            "assignTask failed:",
            error
        );

        showToast(
            error?.message ||
                "Unable to assign task.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   TASK PROGRESS
   ============================================================ */

function calculateTaskProgress(
    task
) {
    const status =
        String(
            task?.status ||
                ""
        ).toLowerCase();

    if (
        [
            "approved",
            "paid",
            "done"
        ].includes(
            status
        )
    ) {
        return 100;
    }

    if (
        [
            "completed",
            "submitted"
        ].includes(
            status
        )
    ) {
        return 90;
    }

    if (
        [
            "in_review",
            "review",
            "reviewing"
        ].includes(
            status
        )
    ) {
        return 75;
    }

    if (
        [
            "claimed",
            "in_progress",
            "working",
            "changes_requested"
        ].includes(
            status
        )
    ) {
        return 50;
    }

    return 0;
}


/* ============================================================
   CREATE TASK MODAL
   ============================================================ */

function bindCreateTaskModal() {
    const modal =
        $("createTaskModal");

    const close =
        $("closeCreateTaskModal");

    const cancel =
        $("cancelCreateTask");

    const form =
        $("createTaskForm");

    if (close) {
        close.addEventListener(
            "click",
            closeCreateTaskModal
        );
    }

    if (cancel) {
        cancel.addEventListener(
            "click",
            closeCreateTaskModal
        );
    }

    if (modal) {
        modal.addEventListener(
            "click",
            event => {
                if (
                    event.target ===
                    modal
                ) {
                    closeCreateTaskModal();
                }
            }
        );
    }

    if (form) {
        form.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                await createTaskFromForm();
            }
        );
    }
}

function openCreateTaskModal() {
    if (
        !requireAdmin(
            "create tasks"
        )
    ) {
        return;
    }

    const modal =
        $("createTaskModal");

    if (!modal) {
        showToast(
            "Create task form was not found.",
            "error"
        );

        return;
    }

    modal.hidden =
        false;

    modal.style.display =
        "flex";
}

function closeCreateTaskModal() {
    const modal =
        $("createTaskModal");

    if (!modal) {
        return;
    }

    modal.hidden =
        true;

    modal.style.display =
        "none";
}

async function createTaskFromForm() {
    const title =
        safeText(
            $("taskTitle")
                ?.value
        );

    const workType =
        safeText(
            $("taskShape")
                ?.value
        );

    const duration =
        Number(
            $("taskDuration")
                ?.value ||
                0
        );

    const pay =
        Number(
            $("taskPay")
                ?.value ||
                0
        );

    const mediaInput =
        $("taskMediaInput");

    const file =
        mediaInput
            ?.files?.[0] ||
        null;

    if (!title) {
        showToast(
            "Enter a task title.",
            "error"
        );

        return;
    }

    if (!workType) {
        showToast(
            "Select a task type.",
            "error"
        );

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


/* ============================================================
   CREATE ADMIN TASK
   ============================================================ */

export async function createAdminTask({
    title,
    workType,
    duration = 0,
    pay = 0,
    file = null
}) {
    if (
        !requireAdmin(
            "create tasks"
        )
    ) {
        return null;
    }

    const db =
        client();

    if (!db) {
        return null;
    }

    const user =
        getCurrentUser?.();

    try {
        let mediaPath =
            null;

        if (file) {
            const bucket =
                APP_CONFIG
                    ?.buckets
                    ?.taskMedia ||
                APP_CONFIG
                    ?.buckets
                    ?.media ||
                "task-media";

            const safeName =
                file.name
                    .replace(
                        /[^a-zA-Z0-9._-]/g,
                        "_"
                    );

            mediaPath =
                `admin-tasks/${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2)}_${safeName}`;

            const upload =
                await db.storage
                    .from(
                        bucket
                    )
                    .upload(
                        mediaPath,
                        file,
                        {
                            upsert:
                                false,

                            contentType:
                                file.type ||
                                undefined
                        }
                    );

            if (
                upload.error
            ) {
                throw upload.error;
            }
        }

        const role =
            roleFromWorkType(
                workType
            );

        const numericPay =
            Number(pay);

        const numericDuration =
            Number(duration);

        const payload = {
            title:
                safeText(
                    title
                ),

            work_type:
                workType,

            work_role:
                role,

            annotation_type:
                annotationTypeForRole(
                    role
                ) ||
                (
                    String(
                        workType
                    )
                        .toLowerCase()
                        .includes(
                            "polygon"
                        )
                        ? "polygon"
                        : String(
                            workType
                        )
                            .toLowerCase()
                            .includes(
                                "segment"
                            )
                            ? "segmentation"
                            : "box"
                ),

            status:
                "available",

            expected_duration:
                Number.isFinite(
                    numericDuration
                )
                    ? numericDuration
                    : 0,

            duration:
                Number.isFinite(
                    numericDuration
                )
                    ? numericDuration
                    : 0,

            pay:
                Number.isFinite(
                    numericPay
                )
                    ? numericPay
                    : 0,

            pay_amount:
                Number.isFinite(
                    numericPay
                )
                    ? numericPay
                    : 0,

            created_by:
                user?.id ||
                null,

            media_path:
                mediaPath,

            metadata: {
                source:
                    "admin",

                created_by_admin:
                    true
            }
        };

        let result =
            await db
                .from(
                    TABLES.tasks
                )
                .insert(
                    payload
                )
                .select()
                .single();

        if (
            result.error
        ) {
            /*
             * Fallback using only
             * columns known to exist.
             */
            const fallbackPayload = {
                title:
                    safeText(
                        title
                    ),

                work_type:
                    workType,

                work_role:
                    role,

                status:
                    "available",

                created_by:
                    user?.id ||
                    null,

                media_path:
                    mediaPath
            };

            result =
                await db
                    .from(
                        TABLES.tasks
                    )
                    .insert(
                        fallbackPayload
                    )
                    .select()
                    .single();
        }

        if (
            result.error
        ) {
            throw result.error;
        }

        await logAdminAction(
            "task_created",
            {
                task_id:
                    result.data
                        ?.id ||
                    null
            }
        );

        closeCreateTaskModal();

        const form =
            $("createTaskForm");

        if (form) {
            form.reset();
        }

        await loadTasks();

        calculateStats();

        renderAdminTasks();

        showToast(
            "Task created successfully.",
            "success"
        );

        return result.data;
    } catch (error) {
        console.error(
            "createAdminTask failed:",
            error
        );

        showToast(
            error?.message ||
                "Unable to create task.",
            "error"
        );

        return null;
    }
}


/* ============================================================
   WORK TYPE → ROLE
   ============================================================ */

function roleFromWorkType(
    workType
) {
    const value =
        String(
            workType ||
                ""
        ).toLowerCase();

    if (
        value.includes(
            "polygon"
        )
    ) {
        return (
            WORK_ROLE?.POLYGON ||
            "coworker_polygon"
        );
    }

    if (
        value.includes(
            "segmentation"
        ) ||
        value.includes(
            "segment"
        )
    ) {
        return (
            WORK_ROLE?.SEGMENTATION ||
            "coworker_segmentation"
        );
    }

    return (
        WORK_ROLE?.BOX ||
        "coworker_2d_box"
    );
}


/* ============================================================
   PAY RATES
   ============================================================ */

async function loadPayRates() {
    const db =
        client();

    if (!db) {
        adminState.payRates =
            [];

        return [];
    }

    try {
        const result =
            await db
                .from(
                    TABLES.payRates
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );

        if (
            result.error
        ) {
            throw result.error;
        }

        adminState.payRates =
            result.data ||
            [];

        return adminState.payRates;
    } catch (error) {
        console.warn(
            "loadPayRates failed:",
            error
        );

        adminState.payRates =
            [];

        return [];
    }
}

function renderPayRates() {
    const container =
        $("payRatesList");

    if (!container) {
        return;
    }

    const rates =
        adminState.payRates;

    if (!rates.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No pay rates have been configured yet.
            </div>
        `;

        return;
    }

    container.innerHTML =
        rates
            .map(
                rate => {
                    const role =
                        normalizeRole(
                            rate.role ||
                                rate.work_role ||
                                ""
                        );

                    const amount =
                        rate.rate ??
                        rate.amount ??
                        0;

                    return `
                        <div class="admin-rate-card">

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        roleLabel(
                                            role
                                        ) ||
                                            role ||
                                            "All roles"
                                    )}
                                </strong>

                                <small>
                                    ${escapeHTML(
                                        rate.work_type ||
                                            "All work"
                                    )}
                                </small>

                            </div>

                            <strong>
                                ${escapeHTML(
                                    formatMoney(
                                        amount
                                    )
                                )}
                                ${
                                    rate.currency
                                        ? ` ${escapeHTML(
                                            rate.currency
                                        )}`
                                        : ""
                                }
                            </strong>

                        </div>
                    `;
                }
            )
            .join("");
}


/* ============================================================
   PAYMENTS
   ============================================================ */

async function loadPayments() {
    const db =
        client();

    if (!db) {
        adminState.payments =
            [];

        return [];
    }

    try {
        const result =
            await db
                .from(
                    TABLES.payments
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );

        if (
            result.error
        ) {
            throw result.error;
        }

        adminState.payments =
            result.data ||
            [];

        calculateStats();

        return adminState.payments;
    } catch (error) {
        console.warn(
            "loadPayments failed:",
            error
        );

        adminState.payments =
            [];

        return [];
    }
}

function renderPayments() {
    const container =
        $("paymentsList");

    if (!container) {
        return;
    }

    if (
        !adminState.payments.length
    ) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No payment records found.
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.payments
            .map(
                renderPayment
            )
            .join("");

    bindPaymentActions(
        container
    );
}

function renderPayment(
    payment
) {
    const userId =
        payment.user_id ||
        payment.worker_id ||
        "";

    const user =
        findUser(
            userId
        );

    const paid =
        payment.status ===
        "paid";

    return `
        <div class="admin-payment-card">

            <div class="admin-payment-user">

                <strong>
                    ${escapeHTML(
                        user?.full_name ||
                            "Unknown user"
                    )}
                </strong>

                <span>
                    ${escapeHTML(
                        user?.email ||
                            ""
                    )}
                </span>

            </div>

            <div class="admin-payment-info">

                <span>
                    Amount:
                    ${escapeHTML(
                        formatMoney(
                            payment.amount
                        )
                    )}
                </span>

                <span>
                    Task:
                    ${escapeHTML(
                        payment.task_id ||
                            "—"
                    )}
                </span>

                <span>
                    Created:
                    ${escapeHTML(
                        formatDate(
                            payment.created_at
                        )
                    )}
                </span>

                ${
                    payment.paid_at
                        ? `
                            <span>
                                Paid:
                                ${escapeHTML(
                                    formatDate(
                                        payment.paid_at
                                    )
                                )}
                            </span>
                        `
                        : ""
                }

            </div>

            <div class="admin-payment-action">

                <span
                    class="admin-status-badge ${
                        paid
                            ? "status-paid"
                            : "status-unpaid"
                    }"
                >
                    ${
                        paid
                            ? "Paid"
                            : "Not paid"
                    }
                </span>

                <button
                    type="button"
                    class="admin-action-btn"
                    data-payment-action="${
                        paid
                            ? "unpaid"
                            : "paid"
                    }"
                    data-payment-id="${escapeHTML(
                        payment.id ||
                            ""
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

function bindPaymentActions(
    container
) {
    all(
        "[data-payment-action]",
        container
    ).forEach(button => {
        button.addEventListener(
            "click",
            async () => {
                const paymentId =
                    button.dataset
                        .paymentId;

                const paid =
                    button.dataset
                        .paymentAction ===
                    "paid";

                await markPaymentPaid(
                    paymentId,
                    paid
                );
            }
        );
    });
}


/* ============================================================
   MARK PAYMENT PAID / UNPAID
   ============================================================ */

export async function markPaymentPaid(
    paymentId,
    paid = true
) {
    if (
        !requireAdmin(
            "manage payments"
        )
    ) {
        return false;
    }

    const db =
        client();

    if (!db) {
        return false;
    }

    const payment =
        adminState.payments.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    paymentId
                )
        );

    if (!payment) {
        showToast(
            "Payment was not found.",
            "error"
        );

        return false;
    }

    const adminUser =
        getCurrentUser?.();

    try {
        const update = {
            status:
                paid
                    ? "paid"
                    : "unpaid",

            paid_at:
                paid
                    ? new Date()
                        .toISOString()
                    : null,

            approved_by:
                paid
                    ? adminUser?.id ||
                        null
                    : null,

            updated_at:
                new Date()
                    .toISOString()
        };

        let result =
            await db
                .from(
                    TABLES.payments
                )
                .update(
                    update
                )
                .eq(
                    "id",
                    paymentId
                );

        if (
            result.error
        ) {
            result =
                await db
                    .from(
                        TABLES.payments
                    )
                    .update({
                        status:
                            paid
                                ? "paid"
                                : "unpaid",

                        paid_at:
                            paid
                                ? new Date()
                                    .toISOString()
                                : null
                    })
                    .eq(
                        "id",
                        paymentId
                    );
        }

        if (
            result.error
        ) {
            throw result.error;
        }

        payment.status =
            paid
                ? "paid"
                : "unpaid";

        payment.paid_at =
            paid
                ? new Date()
                    .toISOString()
                : null;

        await logAdminAction(
            paid
                ? "payment_marked_paid"
                : "payment_marked_unpaid",
            {
                payment_id:
                    paymentId
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
        console.error(
            "markPaymentPaid failed:",
            error
        );

        showToast(
            error?.message ||
                "Unable to update payment.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   ACTIVITY LOGS
   ============================================================ */

async function loadActivities() {
    const db =
        client();

    if (!db) {
        adminState.activities =
            [];

        return [];
    }

    try {
        const result =
            await db
                .from(
                    TABLES.activities
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                )
                .limit(
                    500
                );

        if (
            result.error
        ) {
            throw result.error;
        }

        adminState.activities =
            result.data ||
            [];

        return adminState.activities;
    } catch (error) {
        console.warn(
            "loadActivities failed:",
            error
        );

        adminState.activities =
            [];

        return [];
    }
}

function renderActivities() {
    const container =
        $("activityList");

    if (!container) {
        return;
    }

    if (
        !adminState.activities.length
    ) {
        container.innerHTML = `
            <div class="admin-empty-state">
                No activity records found.
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.activities
            .map(
                activity => {
                    const user =
                        findUser(
                            activity.user_id
                        );

                    const action =
                        activity.action ||
                        activity.event_type ||
                        activity.event ||
                        "activity";

                    return `
                        <div class="admin-activity-row">

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        action
                                    )}
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
                                        activity.created_at
                                    )
                                )}
                            </time>

                        </div>
                    `;
                }
            )
            .join("");
}


/* ============================================================
   ADMIN LOGGING
   ============================================================ */

async function logAdminAction(
    action,
    metadata = {}
) {
    const user =
        getCurrentUser?.();

    try {
        if (
            typeof logActivity ===
            "function"
        ) {
            await logActivity(
                action,
                {
                    user_id:
                        user?.id ||
                        null,

                    metadata
                }
            );
        }
    } catch (error) {
        console.warn(
            "Admin activity logging failed:",
            error
        );
    }

    try {
        if (
            typeof logWorkflowEvent ===
            "function"
        ) {
            await logWorkflowEvent(
                action,
                {
                    user_id:
                        user?.id ||
                        null,

                    metadata
                }
            );
        }
    } catch (error) {
        console.warn(
            "Admin workflow logging failed:",
            error
        );
    }
}


/* ============================================================
   STATISTICS
   ============================================================ */

export function calculateStats() {
    const users =
        adminState.users;

    const tasks =
        adminState.tasks;

    const payments =
        adminState.payments;

    adminState.stats.users =
        users.length;

    adminState.stats.customers =
        users.filter(
            user =>
                normalizeRole(
                    user.role
                ) ===
                "customer"
        ).length;

    adminState.stats.coworkers =
        users.filter(
            user =>
                isCoworkerRole(
                    user.role
                )
        ).length;

    adminState.stats.reviewers =
        users.filter(
            user =>
                isReviewerRole(
                    user.role
                )
        ).length;

    adminState.stats.staff =
        users.filter(
            user =>
                isStaffRole(
                    user.role
                )
        ).length;

    adminState.stats.admins =
        users.filter(
            user =>
                isAdminRole(
                    user.role
                )
        ).length;

    adminState.stats.active =
        users.filter(
            user =>
                user.active
        ).length;

    adminState.stats.pending =
        users.filter(
            user =>
                !user.active
        ).length;

    adminState.stats.tasks =
        tasks.length;

    adminState.stats.available =
        tasks.filter(
            task =>
                task.status ===
                "available"
        ).length;

    adminState.stats.claimed =
        tasks.filter(
            task =>
                [
                    "claimed",
                    "in_progress",
                    "working"
                ].includes(
                    task.status
                )
        ).length;

    adminState.stats.completed =
        tasks.filter(
            task =>
                [
                    "completed",
                    "submitted"
                ].includes(
                    task.status
                )
        ).length;

    adminState.stats.approved =
        tasks.filter(
            task =>
                [
                    "approved",
                    "paid"
                ].includes(
                    task.status
                )
        ).length;

    adminState.stats.paid =
        payments.filter(
            payment =>
                payment.status ===
                "paid"
        ).length;

    adminState.stats.unpaid =
        payments.filter(
            payment =>
                payment.status !==
                "paid"
        ).length;

    renderStats();

    return adminState.stats;
}


/* ============================================================
   RENDER STATISTICS
   ============================================================ */

function renderStats() {
    const mappings = {
        adminUsersCount:
            adminState.stats.users,

        adminCustomersCount:
            adminState.stats.customers,

        adminCoworkersCount:
            adminState.stats.coworkers,

        adminReviewersCount:
            adminState.stats.reviewers,

        adminStaffCount:
            adminState.stats.staff,

        adminAdminsCount:
            adminState.stats.admins,

        adminActiveUsersCount:
            adminState.stats.active,

        adminPendingUsersCount:
            adminState.stats.pending,

        adminTasksCount:
            adminState.stats.tasks,

        adminAvailableTasksCount:
            adminState.stats.available,

        adminClaimedTasksCount:
            adminState.stats.claimed,

        adminCompletedTasksCount:
            adminState.stats.completed,

        adminApprovedTasksCount:
            adminState.stats.approved,

        adminPaidCount:
            adminState.stats.paid,

        adminUnpaidCount:
            adminState.stats.unpaid,

        usersCount:
            adminState.stats.users,

        activeUsersCount:
            adminState.stats.active,

        pendingUsersCount:
            adminState.stats.pending,

        tasksCount:
            adminState.stats.tasks,

        availableTasksCount:
            adminState.stats.available,

        completedTasksCount:
            adminState.stats.completed
    };

    Object.entries(
        mappings
    ).forEach(
        ([id, value]) => {
            const element =
                $(id);

            if (element) {
                element.textContent =
                    String(
                        value
                    );
            }
        }
    );
}


/* ============================================================
   OVERVIEW
   ============================================================ */

function renderOverview() {
    calculateStats();

    const recentActivity =
        $("adminRecentActivity");

    if (recentActivity) {
        const recent =
            adminState.activities
                .slice(
                    0,
                    8
                );

        if (!recent.length) {
            recentActivity.innerHTML = `
                <div class="admin-empty-state">
                    No recent activity.
                </div>
            `;
        } else {
            recentActivity.innerHTML =
                recent
                    .map(
                        activity => {
                            const user =
                                findUser(
                                    activity.user_id
                                );

                            return `
                                <div class="admin-activity-row">

                                    <div>

                                        <strong>
                                            ${escapeHTML(
                                                activity.action ||
                                                    activity.event_type ||
                                                    "Activity"
                                            )}
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
                                            formatShortDate(
                                                activity.created_at
                                            )
                                        )}
                                    </time>

                                </div>
                            `;
                        }
                    )
                    .join("");
        }
    }

    const progress =
        $("adminTaskProgress");

    if (progress) {
        const recentTasks =
            adminState.tasks.slice(
                0,
                10
            );

        progress.innerHTML =
            recentTasks.length
                ? recentTasks
                    .map(
                        task => {
                            const percent =
                                calculateTaskProgress(
                                    task
                                );

                            return `
                                <div class="admin-progress-row">

                                    <div>

                                        <strong>
                                            ${escapeHTML(
                                                task.title
                                            )}
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
                        }
                    )
                    .join("")
                : `
                    <div class="admin-empty-state">
                        No tasks found.
                    </div>
                `;
    }
}


/* ============================================================
   RENDER ALL ADMIN DATA
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
   ADMIN EXPORT BUTTONS
   ============================================================ */

function bindAdminExportButtons() {
    const csv =
        $("copyAdminCSV");

    if (csv) {
        csv.addEventListener(
            "click",
            async () => {
                await copyAdminCSV();
            }
        );
    }

    const html =
        $("downloadAdminHTML");

    if (html) {
        html.addEventListener(
            "click",
            () => {
                downloadAdminHTML();
            }
        );
    }
}


/* ============================================================
   CSV EXPORT
   ============================================================ */

export async function copyAdminCSV() {
    if (
        !requireAdmin(
            "export admin data"
        )
    ) {
        return "";
    }

    const csv =
        buildAdminCSV();

    try {
        if (
            navigator.clipboard
                ?.writeText
        ) {
            await navigator
                .clipboard
                .writeText(
                    csv
                );

            showToast(
                "Admin CSV copied to clipboard.",
                "success"
            );
        } else {
            throw new Error(
                "Clipboard unavailable"
            );
        }
    } catch (error) {
        console.warn(
            "Clipboard failed:",
            error
        );

        const output =
            $("adminExportOutput");

        if (output) {
            if (
                "value" in
                output
            ) {
                output.value =
                    csv;
            } else {
                output.textContent =
                    csv;
            }

            output.focus();
            output.select?.();
        }

        showToast(
            "CSV generated. You can copy it from the export area.",
            "info"
        );
    }

    const output =
        $("adminExportOutput");

    if (output) {
        if (
            "value" in
            output
        ) {
            output.value =
                csv;
        } else {
            output.textContent =
                csv;
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

    adminState.users.forEach(
        user => {
            rows.push([
                "USER",
                user.id,
                user.full_name,
                user.email,
                roleLabel(
                    user.role
                ),
                user.status,
                "",
                "",
                "",
                "",
                user.created_at,
                user.last_sign_in_at ||
                    user.last_logout_at ||
                    ""
            ]);
        }
    );

    adminState.tasks.forEach(
        task => {
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
                roleLabel(
                    task.work_role
                ),
                task.status,
                task.title,
                task.work_type,
                assigned?.full_name ||
                    "",
                task.pay,
                task.created_at,
                task.updated_at
            ]);
        }
    );

    adminState.payments.forEach(
        payment => {
            const user =
                findUser(
                    payment.user_id ||
                        payment.worker_id
                );

            rows.push([
                "PAYMENT",
                payment.id,
                user?.full_name ||
                    "",
                user?.email ||
                    "",
                roleLabel(
                    user?.role ||
                        ""
                ),
                payment.status ||
                    "unpaid",
                payment.task_id ||
                    "",
                "",
                "",
                payment.amount ??
                    "",
                payment.created_at ||
                    "",
                payment.paid_at ||
                    ""
            ]);
        }
    );

    return rows
        .map(
            row =>
                row
                    .map(
                        csvEscape
                    )
                    .join(",")
        )
        .join("\n");
}

function csvEscape(
    value
) {
    const text =
        String(
            value ?? ""
        );

    if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n")
    ) {
        return (
            '"' +
            text.replace(
                /"/g,
                '""'
            ) +
            '"'
        );
    }

    return text;
}


/* ============================================================
   HTML EXPORT
   ============================================================ */

function downloadAdminHTML() {
    if (
        !requireAdmin(
            "export admin data"
        )
    ) {
        return;
    }

    const html =
        buildAdminHTMLExport();

    const blob =
        new Blob(
            [html],
            {
                type:
                    "text/html;charset=utf-8"
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const anchor =
        document.createElement(
            "a"
        );

    anchor.href =
        url;

    anchor.download =
        `admin-export-${new Date()
            .toISOString()
            .slice(
                0,
                10
            )}.html`;

    document.body.appendChild(
        anchor
    );

    anchor.click();

    anchor.remove();

    setTimeout(
        () => {
            URL.revokeObjectURL(
                url
            );
        },
        1000
    );

    const output =
        $("adminExportOutput");

    if (output) {
        if (
            "value" in
            output
        ) {
            output.value =
                html;
        } else {
            output.innerHTML =
                escapeHTML(
                    html
                );
        }
    }

    showToast(
        "Admin HTML export downloaded.",
        "success"
    );
}

function buildAdminHTMLExport() {
    const generated =
        new Date()
            .toLocaleString();

    const userRows =
        adminState.users
            .map(
                user => `
                    <tr>
                        <td>${escapeHTML(
                            user.full_name
                        )}</td>

                        <td>${escapeHTML(
                            user.email
                        )}</td>

                        <td>${escapeHTML(
                            roleLabel(
                                user.role
                            )
                        )}</td>

                        <td>${escapeHTML(
                            user.status
                        )}</td>

                        <td>${escapeHTML(
                            formatDate(
                                user.created_at
                            )
                        )}</td>

                        <td>${escapeHTML(
                            formatDate(
                                user.last_sign_in_at
                            )
                        )}</td>

                        <td>${escapeHTML(
                            formatDate(
                                user.last_logout_at
                            )
                        )}</td>
                    </tr>
                `
            )
            .join("");

    const taskRows =
        adminState.tasks
            .map(
                task => {
                    const assigned =
                        findUser(
                            task.assigned_to ||
                                task.claimed_by
                        );

                    return `
                        <tr>

                            <td>${escapeHTML(
                                task.id
                            )}</td>

                            <td>${escapeHTML(
                                task.title
                            )}</td>

                            <td>${escapeHTML(
                                task.work_type
                            )}</td>

                            <td>${escapeHTML(
                                roleLabel(
                                    task.work_role
                                )
                            )}</td>

                            <td>${escapeHTML(
                                task.status
                            )}</td>

                            <td>${escapeHTML(
                                assigned?.full_name ||
                                    "Unassigned"
                            )}</td>

                            <td>${escapeHTML(
                                formatMoney(
                                    task.pay
                                )
                            )}</td>

                            <td>${escapeHTML(
                                task.annotation_count ||
                                    0
                            )}</td>

                        </tr>
                    `;
                }
            )
            .join("");

    const paymentRows =
        adminState.payments
            .map(
                payment => {
                    const user =
                        findUser(
                            payment.user_id ||
                                payment.worker_id
                        );

                    return `
                        <tr>

                            <td>${escapeHTML(
                                payment.id
                            )}</td>

                            <td>${escapeHTML(
                                user?.full_name ||
                                    "Unknown"
                            )}</td>

                            <td>${escapeHTML(
                                user?.email ||
                                    ""
                            )}</td>

                            <td>${escapeHTML(
                                formatMoney(
                                    payment.amount
                                )
                            )}</td>

                            <td>${escapeHTML(
                                payment.status ||
                                    "unpaid"
                            )}</td>

                            <td>${escapeHTML(
                                formatDate(
                                    payment.created_at
                                )
                            )}</td>

                            <td>${escapeHTML(
                                formatDate(
                                    payment.paid_at
                                )
                            )}</td>

                        </tr>
                    `;
                }
            )
            .join("");

    return `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>Admin Workspace Export</title>

<style>

body {
    font-family:
        Arial,
        sans-serif;

    margin:
        30px;

    color:
        #222;
}

h1,
h2 {
    margin-bottom:
        8px;
}

.meta {
    color:
        #666;

    margin-bottom:
        30px;
}

.stats {
    display:
        grid;

    grid-template-columns:
        repeat(
            auto-fit,
            minmax(
                140px,
                1fr
            )
        );

    gap:
        12px;

    margin-bottom:
        30px;
}

.stat {
    border:
        1px solid #ddd;

    border-radius:
        8px;

    padding:
        14px;
}

.stat strong {
    display:
        block;

    font-size:
        24px;
}

table {
    width:
        100%;

    border-collapse:
        collapse;

    margin-bottom:
        35px;
}

th,
td {
    border:
        1px solid #ddd;

    padding:
        8px;

    text-align:
        left;

    vertical-align:
        top;

    font-size:
        13px;
}

th {
    background:
        #f4f4f4;
}

</style>

</head>

<body>

<h1>
    Admin Workspace Export
</h1>

<div class="meta">
    Generated:
    ${escapeHTML(
        generated
    )}
</div>

<div class="stats">

    <div class="stat">
        <strong>
            ${adminState.stats.users}
        </strong>
        Users
    </div>

    <div class="stat">
        <strong>
            ${adminState.stats.active}
        </strong>
        Active
    </div>

    <div class="stat">
        <strong>
            ${adminState.stats.pending}
        </strong>
        Pending
    </div>

    <div class="stat">
        <strong>
            ${adminState.stats.tasks}
        </strong>
        Tasks
    </div>

    <div class="stat">
        <strong>
            ${adminState.stats.completed}
        </strong>
        Completed
    </div>

    <div class="stat">
        <strong>
            ${adminState.stats.approved}
        </strong>
        Approved
    </div>

    <div class="stat">
        <strong>
            ${adminState.stats.paid}
        </strong>
        Paid
    </div>

    <div class="stat">
        <strong>
            ${adminState.stats.unpaid}
        </strong>
        Unpaid
    </div>

</div>


<h2>
    Users
</h2>

<table>

<thead>

<tr>
    <th>Name</th>
    <th>Email</th>
    <th>Role</th>
    <th>Status</th>
    <th>Joined</th>
    <th>Last Login</th>
    <th>Last Logout</th>
</tr>

</thead>

<tbody>

${userRows}

</tbody>

</table>


<h2>
    Tasks
</h2>

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
    <th>Annotations</th>
</tr>

</thead>

<tbody>

${taskRows}

</tbody>

</table>


<h2>
    Payments
</h2>

<table>

<thead>

<tr>
    <th>ID</th>
    <th>User</th>
    <th>Email</th>
    <th>Amount</th>
    <th>Status</th>
    <th>Created</th>
    <th>Paid</th>
</tr>

</thead>

<tbody>

${paymentRows}

</tbody>

</table>

</body>

</html>
    `.trim();
}


/* ============================================================
   FIND USER
   ============================================================ */

function findUser(
    userId
) {
    if (!userId) {
        return null;
    }

    return (
        adminState.users.find(
            user =>
                String(
                    user.id
                ) ===
                String(
                    userId
                )
        ) ||
        null
    );
}


/* ============================================================
   PUBLIC REFRESH
   ============================================================ */

export async function refreshAdminCenter() {
    if (
        !canOpenAdminCenter()
    ) {
        return false;
    }

    await loadAdminData();

    return true;
}


/* ============================================================
   PUBLIC STATE
   ============================================================ */

export function getAdminState() {
    return adminState;
}


/* ============================================================
   WINDOW COMPATIBILITY
   ============================================================ */

window.admin = {
    state:
        adminState,

    initialize:
        initializeAdmin,

    open:
        openAdminCenter,

    close:
        closeAdminCenter,

    refresh:
        refreshAdminCenter,

    loadUsers,

    loadTasks,

    loadPayments,

    loadPayRates,

    loadActivities,

    approveUser:
        userId =>
            setUserActive(
                userId,
                true
            ),

    deactivateUser:
        userId =>
            setUserActive(
                userId,
                false
            ),

    kickUser,

    restoreUser,

    changeUserRole,

    createCoworkerAccount,

    createTask:
        createAdminTask,

    assignTask,

    markPaymentPaid,

    exportCSV:
        copyAdminCSV,

    exportHTML:
        downloadAdminHTML,

    calculateStats,

    updateAdminButtonVisibility,

    getState:
        getAdminState
};


/* ============================================================
   AUTH / PROFILE EVENTS
   ============================================================ */

window.addEventListener(
    "authStateChanged",
    () => {
        updateAdminButtonVisibility();

        if (
            !canOpenAdminCenter() &&
            adminState.open
        ) {
            closeAdminCenter();
        }
    }
);

window.addEventListener(
    "profileUpdated",
    () => {
        updateAdminButtonVisibility();
    }
);


/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeAdmin,
        {
            once: true
        }
    );
} else {
    initializeAdmin();
}


/* ============================================================
   END OF ADMIN.JS
   ------------------------------------------------------------
   IMPORTANT:
   Do NOT add another export block here.

   All public functions are exported exactly once
   at their declarations above.

   This prevents:
       Duplicate export of 'calculateStats'

   and:
       Duplicate export of 'updateAdminButtonVisibility'
   ============================================================ */

console.log(
    "Admin module loaded successfully."
);
