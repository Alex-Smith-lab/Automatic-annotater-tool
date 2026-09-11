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
    roleForWorkType,
    annotationTypeForRole,
    ALL_ROLES
} from "./config.js";

import {
    getCurrentUser,
    getCurrentProfile,
    getRole
} from "./auth.js";

import {
    getSupabase,
    logActivity,
    logWorkflowEvent
} from "./supabase.js";


/* ============================================================
   STATE
   ============================================================ */

export const adminState = {
    initialized: false,

    user: null,
    profile: null,
    role: null,

    authorized: false,

    activeTab: "overview",

    users: [],
    coworkers: [],
    tasks: [],
    payments: [],
    payRates: [],
    activities: [],

    stats: {
        users: 0,
        activeUsers: 0,
        pendingUsers: 0,
        customers: 0,
        coworkers: 0,
        reviewers: 0,
        staff: 0,
        admins: 0,

        totalTasks: 0,
        availableTasks: 0,
        claimedTasks: 0,
        inProgressTasks: 0,
        reviewTasks: 0,
        approvedTasks: 0,
        skippedTasks: 0,
        paidTasks: 0,

        unpaidPayments: 0,
        paidPayments: 0,
        totalPaid: 0,
        totalUnpaid: 0
    },

    loading: false,
    loadingUsers: false,
    loadingTasks: false,
    loadingPayments: false,
    loadingRates: false,
    loadingActivities: false,

    modalOpen: false,
    createCoworkerModalOpen: false,
    createTaskModalOpen: false
};

window.adminState = adminState;


/* ============================================================
   DOM HELPERS
   ============================================================ */

const $ = id =>
    document.getElementById(id);

function getClient() {
    return (
        getSupabase?.() ||
        window.supabaseClient ||
        null
    );
}

function setText(
    element,
    value = ""
) {
    if (!element) return;

    element.textContent =
        value == null
            ? ""
            : String(value);
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

function showElement(
    element,
    show = true
) {
    if (!element) return;

    element.hidden = !show;

    if (show) {
        element.style.display = "";
    } else {
        element.style.display = "none";
    }
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

    container.appendChild(
        item
    );

    setTimeout(() => {
        item.remove();
    }, 4000);
}

function currentUser() {
    return (
        getCurrentUser?.() ||
        adminState.user ||
        null
    );
}

function currentProfile() {
    return (
        getCurrentProfile?.() ||
        adminState.profile ||
        null
    );
}

function currentRole() {
    return normalizeRole(
        getRole?.() ||
        currentProfile()?.role ||
        currentUser()
            ?.user_metadata
            ?.role ||
        ""
    );
}

function currentAdminEmail() {
    return String(
        APP_CONFIG?.adminEmail ||
        "antonymbali96@gmail.com"
    ).toLowerCase();
}


/* ============================================================
   AUTHORIZATION
   ============================================================ */

function refreshAuthorization() {
    adminState.user =
        currentUser();

    adminState.profile =
        currentProfile();

    adminState.role =
        currentRole();

    const email =
        String(
            adminState.user?.email ||
            adminState.profile?.email ||
            ""
        ).toLowerCase();

    /*
     * The protected administrator account is
     * recognized by both email and role.
     */
    const protectedAdmin =
        email ===
        currentAdminEmail();

    /*
     * Staff are allowed to use the admin center
     * because staff receive administrative access.
     */
    const roleAuthorized =
        isAdminRole(
            adminState.role
        ) ||
        isStaffRole(
            adminState.role
        );

    adminState.authorized =
        Boolean(
            protectedAdmin ||
            roleAuthorized
        );

    return adminState.authorized;
}

function canOpenAdminCenter() {
    return refreshAuthorization();
}

function requireAdmin(
    action = "perform this action"
) {
    if (
        canOpenAdminCenter()
    ) {
        return true;
    }

    toast(
        `You do not have permission to ${action}.`,
        "error"
    );

    return false;
}


/* ============================================================
   INITIALIZATION
   ============================================================ */

export function initializeAdmin() {
    if (
        adminState.initialized
    ) {
        refreshAuthorization();

        updateAdminButtonVisibility();

        return adminState;
    }

    adminState.initialized =
        true;

    refreshAuthorization();

    bindAdminNavigation();
    bindAdminModal();
    bindAdminActions();
    bindCreateCoworkerModal();
    bindCreateTaskModal();
    bindAuthEvents();

    updateAdminButtonVisibility();

    return adminState;
}


/* ============================================================
   ADMIN BUTTON
   ============================================================ */

export function updateAdminButtonVisibility() {
    const button =
        $("adminCenterButton");

    if (!button) {
        return;
    }

    const allowed =
        canOpenAdminCenter();

    showElement(
        button,
        allowed
    );

    if (allowed) {
        button.setAttribute(
            "aria-label",
            "Admin center"
        );

        button.title =
            "Admin center";
    }
}


/* ============================================================
   OPEN / CLOSE ADMIN CENTER
   ============================================================ */

export async function openAdminCenter() {
    if (
        !requireAdmin(
            "open the admin center"
        )
    ) {
        return false;
    }

    const modal =
        $("adminModal");

    if (!modal) {
        toast(
            "Admin center was not found.",
            "error"
        );

        return false;
    }

    adminState.modalOpen =
        true;

    showElement(
        modal,
        true
    );

    modal.classList.add(
        "admin-fullscreen-modal"
    );

    document.body.classList.add(
        "admin-open"
    );

    /*
     * Keep the currently selected
     * page if one already exists.
     */
    switchAdminTab(
        adminState.activeTab
    );

    await loadAdminData();

    return true;
}

export function closeAdminCenter() {
    adminState.modalOpen =
        false;

    const modal =
        $("adminModal");

    if (modal) {
        showElement(
            modal,
            false
        );

        modal.classList.remove(
            "admin-fullscreen-modal"
        );
    }

    document.body.classList.remove(
        "admin-open"
    );
}


/* ============================================================
   ADMIN NAVIGATION
   ============================================================ */

function bindAdminNavigation() {
    $("adminCenterButton")
        ?.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                await openAdminCenter();
            }
        );

    document
        .querySelectorAll(
            "[data-admin-tab]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const tab =
                        button.dataset
                            .adminTab;

                    switchAdminTab(
                        tab
                    );
                }
            );
        });
}

function bindAdminModal() {
    $("closeAdminModal")
        ?.addEventListener(
            "click",
            closeAdminCenter
        );

    $("adminModal")
        ?.addEventListener(
            "click",
            event => {
                if (
                    event.target ===
                    $("adminModal")
                ) {
                    closeAdminCenter();
                }
            }
        );
}

function bindAdminActions() {
    $("refreshUsersButton")
        ?.addEventListener(
            "click",
            async () => {
                await loadUsers();
            }
        );

    $("createCoworkerButton")
        ?.addEventListener(
            "click",
            openCreateCoworkerModal
        );

    $("createTaskButton")
        ?.addEventListener(
            "click",
            openCreateTaskModal
        );

    $("copyAdminCSV")
        ?.addEventListener(
            "click",
            copyAdminCSV
        );

    $("downloadAdminHTML")
        ?.addEventListener(
            "click",
            downloadAdminHTML
        );
}


/* ============================================================
   ADMIN TABS
   ============================================================ */

function getAdminPage(
    tab
) {
    const page =
        document.querySelector(
            `[data-admin-page="${tab}"]`
        );

    return page;
}

function getAdminTabs() {
    return Array.from(
        document.querySelectorAll(
            "[data-admin-tab]"
        )
    );
}

export function switchAdminTab(
    tab = "overview"
) {
    if (
        !requireAdmin(
            "open admin pages"
        )
    ) {
        return false;
    }

    adminState.activeTab =
        tab;

    getAdminTabs()
        .forEach(button => {
            const active =
                button.dataset
                    .adminTab ===
                tab;

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

    document
        .querySelectorAll(
            "[data-admin-page]"
        )
        .forEach(page => {
            const active =
                page.dataset
                    .adminPage ===
                tab;

            showElement(
                page,
                active
            );

            page.classList.toggle(
                "active",
                active
            );
        });

    /*
     * Load the selected section when needed.
     */
    if (tab === "overview") {
        renderOverview();
    }

    if (tab === "users") {
        renderUsers();
    }

    if (tab === "coworkers") {
        renderCoworkers();
    }

    if (tab === "tasks") {
        renderAdminTasks();
    }

    if (tab === "payments") {
        renderPayments();
    }

    if (tab === "rates") {
        renderPayRates();
    }

    if (tab === "activity") {
        renderActivities();
    }

    return true;
}


/* ============================================================
   ADMIN DATA
   ============================================================ */

export async function loadAdminData() {
    if (
        !requireAdmin(
            "load admin data"
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
        await Promise.all([
            loadUsers(),
            loadTasks(),
            loadPayments(),
            loadPayRates(),
            loadActivities()
        ]);

        calculateStats();

        renderOverview();
        renderUsers();
        renderCoworkers();
        renderAdminTasks();
        renderPayments();
        renderPayRates();
        renderActivities();

        return true;
    } catch (error) {
        console.error(
            "loadAdminData:",
            error
        );

        toast(
            error?.message ||
                "Unable to load admin data.",
            "error"
        );

        return false;
    } finally {
        adminState.loading =
            false;
    }
}


/* ============================================================
   USERS
   ============================================================ */

export async function loadUsers() {
    if (
        !requireAdmin(
            "load users"
        )
    ) {
        return [];
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return [];
    }

    adminState.loadingUsers =
        true;

    try {
        const {
            data,
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.profiles ||
                "profiles"
            )
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            throw error;
        }

        adminState.users =
            Array.isArray(data)
                ? data.map(user => ({
                    ...user,
                    role:
                        normalizeRole(
                            user.role
                        )
                }))
                : [];

        /*
         * Sort coworkers separately.
         */
        adminState.coworkers =
            adminState.users.filter(
                user =>
                    isCoworkerRole(
                        user.role
                    )
            );

        renderUsers();
        renderCoworkers();
        calculateStats();

        return adminState.users;
    } catch (error) {
        console.error(
            "loadUsers:",
            error
        );

        toast(
            error?.message ||
                "Unable to load users.",
            "error"
        );

        return [];
    } finally {
        adminState.loadingUsers =
            false;
    }
}

function userDisplayName(
    user
) {
    return (
        user?.full_name ||
        user?.email?.split("@")?.[0] ||
        "Unknown user"
    );
}

function userStatus(
    user
) {
    if (
        user?.kicked_at
    ) {
        return "kicked";
    }

    if (
        user?.active
    ) {
        return "active";
    }

    return "pending";
}

function renderUserRoleOptions(
    currentRole
) {
    const roles =
        Array.isArray(
            ALL_ROLES
        )
            ? ALL_ROLES
            : [
                "customer",
                "coworker_2d_box",
                "coworker_polygon",
                "coworker_segmentation",
                "reviewer",
                "staff",
                "admin"
            ];

    return roles
        .map(role => `
            <option
                value="${escapeHTML(
                    role
                )}"
                ${
                    normalizeRole(
                        currentRole
                    ) ===
                    normalizeRole(
                        role
                    )
                        ? "selected"
                        : ""
                }
            >
                ${escapeHTML(
                    roleLabel(role)
                )}
            </option>
        `)
        .join("");
}

export function renderUsers() {
    const container =
        $("usersList");

    if (!container) {
        return;
    }

    if (
        !adminState.users.length
    ) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No users found</strong>
                <p>
                    User accounts will appear here
                    after registration.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.users
            .map(user => {
                const role =
                    normalizeRole(
                        user.role
                    );

                const status =
                    userStatus(
                        user
                    );

                const protectedAdmin =
                    String(
                        user.email ||
                        ""
                    ).toLowerCase() ===
                    currentAdminEmail();

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
                                        ? `
                                            <img
                                                src="${escapeHTML(
                                                    user.avatar_url
                                                )}"
                                                alt=""
                                            >
                                        `
                                        : escapeHTML(
                                            userDisplayName(
                                                user
                                            )
                                                .charAt(0)
                                                .toUpperCase()
                                        )
                                }
                            </div>

                            <div class="admin-user-info">

                                <strong>
                                    ${escapeHTML(
                                        userDisplayName(
                                            user
                                        )
                                    )}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        user.email ||
                                        ""
                                    )}
                                </span>

                                <small>
                                    Joined:
                                    ${
                                        user.created_at
                                            ? new Date(
                                                user.created_at
                                            ).toLocaleString()
                                            : "—"
                                    }
                                </small>

                                <small>
                                    Last login:
                                    ${
                                        user.last_login_at
                                            ? new Date(
                                                user.last_login_at
                                            ).toLocaleString()
                                            : "—"
                                    }
                                </small>

                                <small>
                                    Last logout:
                                    ${
                                        user.last_logout_at
                                            ? new Date(
                                                user.last_logout_at
                                            ).toLocaleString()
                                            : "—"
                                    }
                                </small>

                            </div>
                        </div>

                        <div class="admin-user-controls">

                            <span
                                class="admin-status admin-status-${escapeHTML(
                                    status
                                )}"
                            >
                                ${escapeHTML(
                                    status
                                )}
                            </span>

                            <select
                                class="admin-role-select"
                                data-role-user="${escapeHTML(
                                    user.id
                                )}"
                                ${
                                    protectedAdmin
                                        ? "disabled"
                                        : ""
                                }
                            >
                                ${renderUserRoleOptions(
                                    role
                                )}
                            </select>

                            <div class="admin-user-buttons">

                                ${
                                    protectedAdmin
                                        ? `
                                            <span class="admin-protected-label">
                                                Protected admin
                                            </span>
                                        `
                                        : `
                                            ${
                                                user.active
                                                    ? `
                                                        <button
                                                            type="button"
                                                            class="secondary-button"
                                                            data-admin-deactivate="${escapeHTML(
                                                                user.id
                                                            )}"
                                                        >
                                                            Deactivate
                                                        </button>
                                                    `
                                                    : `
                                                        <button
                                                            type="button"
                                                            class="primary-button"
                                                            data-admin-approve="${escapeHTML(
                                                                user.id
                                                            )}"
                                                        >
                                                            Approve
                                                        </button>
                                                    `
                                            }

                                            ${
                                                user.kicked_at
                                                    ? `
                                                        <button
                                                            type="button"
                                                            class="secondary-button"
                                                            data-admin-restore="${escapeHTML(
                                                                user.id
                                                            )}"
                                                        >
                                                            Restore
                                                        </button>
                                                    `
                                                    : `
                                                        <button
                                                            type="button"
                                                            class="danger-button"
                                                            data-admin-kick="${escapeHTML(
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
                    </div>
                `;
            })
            .join("");

    bindRenderedUserActions();
}

function bindRenderedUserActions() {
    document
        .querySelectorAll(
            "[data-admin-approve]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    await setUserActive(
                        button.dataset
                            .adminApprove,
                        true
                    );
                }
            );
        });

    document
        .querySelectorAll(
            "[data-admin-deactivate]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    await setUserActive(
                        button.dataset
                            .adminDeactivate,
                        false
                    );
                }
            );
        });

    document
        .querySelectorAll(
            "[data-admin-kick]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    await kickUser(
                        button.dataset
                            .adminKick
                    );
                }
            );
        });

    document
        .querySelectorAll(
            "[data-admin-restore]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    await restoreUser(
                        button.dataset
                            .adminRestore
                    );
                }
            );
        });

    document
        .querySelectorAll(
            "[data-role-user]"
        )
        .forEach(select => {
            select.addEventListener(
                "change",
                async () => {
                    const userId =
                        select.dataset
                            .roleUser;

                    const newRole =
                        select.value;

                    await changeUserRole(
                        userId,
                        newRole
                    );
                }
            );
        });
}


/* ============================================================
   CHANGE USER ROLE
   ============================================================ */

export async function changeUserRole(
    userId,
    newRole
) {
    if (
        !requireAdmin(
            "change user roles"
        )
    ) {
        return false;
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(item.id) ===
                String(userId)
        );

    if (!user) {
        toast(
            "User was not found.",
            "error"
        );

        return false;
    }

    const protectedAdmin =
        String(
            user.email ||
            ""
        ).toLowerCase() ===
        currentAdminEmail();

    if (protectedAdmin) {
        toast(
            "The protected administrator account cannot have its role changed.",
            "error"
        );

        renderUsers();

        return false;
    }

    const normalized =
        normalizeRole(
            newRole
        );

    if (!normalized) {
        toast(
            "Invalid role.",
            "error"
        );

        return false;
    }

    const previousRole =
        normalizeRole(
            user.role
        );

    try {
        const {
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.profiles ||
                "profiles"
            )
            .update({
                role:
                    normalized,
                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                userId
            );

        if (error) {
            throw error;
        }

        user.role =
            normalized;

        if (
            user.id ===
            adminState.user?.id
        ) {
            adminState.role =
                normalized;
        }

        await logAdminActivity(
            "role_changed",
            {
                target_user_id:
                    userId,
                previous_role:
                    previousRole,
                new_role:
                    normalized
            }
        );

        toast(
            `${userDisplayName(
                user
            )} is now ${roleLabel(
                normalized
            )}.`,
            "success"
        );

        calculateStats();
        renderUsers();
        renderCoworkers();

        updateAdminButtonVisibility();

        return true;
    } catch (error) {
        console.error(
            "changeUserRole:",
            error
        );

        toast(
            error?.message ||
                "Unable to change user role.",
            "error"
        );

        renderUsers();

        return false;
    }
}


/* ============================================================
   ACTIVATE / DEACTIVATE USER
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

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(item.id) ===
                String(userId)
        );

    if (!user) {
        toast(
            "User was not found.",
            "error"
        );

        return false;
    }

    const protectedAdmin =
        String(
            user.email ||
            ""
        ).toLowerCase() ===
        currentAdminEmail();

    if (
        protectedAdmin &&
        !active
    ) {
        toast(
            "The protected administrator account cannot be deactivated.",
            "error"
        );

        return false;
    }

    try {
        const {
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.profiles ||
                "profiles"
            )
            .update({
                active:
                    Boolean(
                        active
                    ),
                kicked_at:
                    active
                        ? null
                        : user.kicked_at,
                kicked_by:
                    active
                        ? null
                        : user.kicked_by,
                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                userId
            );

        if (error) {
            throw error;
        }

        user.active =
            Boolean(
                active
            );

        if (active) {
            user.kicked_at =
                null;
            user.kicked_by =
                null;
        }

        await logAdminActivity(
            active
                ? "user_approved"
                : "user_deactivated",
            {
                target_user_id:
                    userId,
                active:
                    Boolean(
                        active
                    )
            }
        );

        toast(
            active
                ? `${userDisplayName(
                    user
                )} has been approved.`
                : `${userDisplayName(
                    user
                )} has been deactivated.`,
            "success"
        );

        calculateStats();
        renderUsers();

        return true;
    } catch (error) {
        console.error(
            "setUserActive:",
            error
        );

        toast(
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

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(item.id) ===
                String(userId)
        );

    if (!user) {
        toast(
            "User was not found.",
            "error"
        );

        return false;
    }

    const protectedAdmin =
        String(
            user.email ||
            ""
        ).toLowerCase() ===
        currentAdminEmail();

    if (protectedAdmin) {
        toast(
            "The protected administrator account cannot be kicked.",
            "error"
        );

        return false;
    }

    const confirmed =
        window.confirm(
            `Kick ${userDisplayName(
                user
            )}? They will no longer be able to work until restored.`
        );

    if (!confirmed) {
        return false;
    }

    try {
        const now =
            new Date().toISOString();

        const {
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.profiles ||
                "profiles"
            )
            .update({
                active:
                    false,
                kicked_at:
                    now,
                kicked_by:
                    adminState.user?.id ||
                    null,
                updated_at:
                    now
            })
            .eq(
                "id",
                userId
            );

        if (error) {
            throw error;
        }

        user.active =
            false;

        user.kicked_at =
            now;

        user.kicked_by =
            adminState.user?.id ||
            null;

        await logAdminActivity(
            "user_kicked",
            {
                target_user_id:
                    userId
            }
        );

        toast(
            `${userDisplayName(
                user
            )} has been kicked.`,
            "success"
        );

        renderUsers();
        calculateStats();

        return true;
    } catch (error) {
        console.error(
            "kickUser:",
            error
        );

        toast(
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

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    const user =
        adminState.users.find(
            item =>
                String(item.id) ===
                String(userId)
        );

    if (!user) {
        toast(
            "User was not found.",
            "error"
        );

        return false;
    }

    try {
        const {
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.profiles ||
                "profiles"
            )
            .update({
                active:
                    true,
                kicked_at:
                    null,
                kicked_by:
                    null,
                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                userId
            );

        if (error) {
            throw error;
        }

        user.active =
            true;

        user.kicked_at =
            null;

        user.kicked_by =
            null;

        await logAdminActivity(
            "user_restored",
            {
                target_user_id:
                    userId
            }
        );

        toast(
            `${userDisplayName(
                user
            )} has been restored.`,
            "success"
        );

        renderUsers();
        calculateStats();

        return true;
    } catch (error) {
        console.error(
            "restoreUser:",
            error
        );

        toast(
            error?.message ||
                "Unable to restore user.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   CREATE COWORKER MODAL
   ============================================================ */

function bindCreateCoworkerModal() {
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
            async event => {
                event.preventDefault();

                const name =
                    $("newWorkerName")
                        ?.value
                        ?.trim();

                const email =
                    $("newWorkerEmail")
                        ?.value
                        ?.trim();

                const password =
                    $("newWorkerPassword")
                        ?.value;

                const role =
                    $("newWorkerRole")
                        ?.value;

                await createCoworkerAccount({
                    name,
                    email,
                    password,
                    role
                });
            }
        );

    $("createCoworkerModal")
        ?.addEventListener(
            "click",
            event => {
                if (
                    event.target ===
                    $("createCoworkerModal")
                ) {
                    closeCreateCoworkerModal();
                }
            }
        );
}

export function openCreateCoworkerModal() {
    if (
        !requireAdmin(
            "create coworker accounts"
        )
    ) {
        return false;
    }

    const modal =
        $("createCoworkerModal");

    if (!modal) {
        toast(
            "Create coworker window was not found.",
            "error"
        );

        return false;
    }

    adminState.createCoworkerModalOpen =
        true;

    showElement(
        modal,
        true
    );

    return true;
}

export function closeCreateCoworkerModal() {
    adminState.createCoworkerModalOpen =
        false;

    const modal =
        $("createCoworkerModal");

    showElement(
        modal,
        false
    );
}


/* ============================================================
   CREATE COWORKER ACCOUNT
   ============================================================ */

export async function createCoworkerAccount({
    name,
    email,
    password,
    role
} = {}) {
    if (
        !requireAdmin(
            "create coworker accounts"
        )
    ) {
        return false;
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    name =
        String(
            name || ""
        ).trim();

    email =
        String(
            email || ""
        ).trim()
        .toLowerCase();

    password =
        String(
            password || ""
        );

    role =
        normalizeRole(
            role
        );

    if (!name) {
        toast(
            "Enter the coworker name.",
            "warning"
        );

        return false;
    }

    if (!email) {
        toast(
            "Enter the coworker email.",
            "warning"
        );

        return false;
    }

    if (
        password.length <
        6
    ) {
        toast(
            "Password must contain at least 6 characters.",
            "warning"
        );

        return false;
    }

    if (
        !isCoworkerRole(
            role
        ) &&
        role !== "reviewer" &&
        role !== "staff"
    ) {
        toast(
            "Choose a coworker, reviewer, or staff role.",
            "warning"
        );

        return false;
    }

    const originalSession =
        await client.auth.getSession();

    const originalSessionData =
        originalSession?.data
            ?.session ||
        null;

    try {
        /*
         * Create account through normal Supabase
         * Auth signup.
         */
        const {
            data,
            error
        } =
            await client.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name:
                            name,
                        role
                    }
                }
            });

        if (error) {
            throw error;
        }

        const newUser =
            data?.user;

        if (!newUser) {
            throw new Error(
                "Supabase did not return the new user."
            );
        }

        /*
         * The database trigger normally creates
         * the profile. Update it with the desired
         * role and active status.
         */
        const {
            error:
                profileError
        } =
            await client
                .from(
                    APP_CONFIG?.tables
                        ?.profiles ||
                    "profiles"
                )
                .upsert(
                    {
                        id:
                            newUser.id,
                        email,
                        full_name:
                            name,
                        role,
                        active:
                            true,
                        must_change_password:
                            false,
                        updated_at:
                            new Date().toISOString()
                    },
                    {
                        onConflict:
                            "id"
                    }
                );

        if (profileError) {
            throw profileError;
        }

        await logAdminActivity(
            "coworker_account_created",
            {
                target_user_id:
                    newUser.id,
                email,
                role
            }
        );

        toast(
            `${name}'s account was created successfully.`,
            "success"
        );

        closeCreateCoworkerModal();

        const form =
            $("createCoworkerForm");

        form?.reset();

        await loadUsers();

        /*
         * Supabase may automatically sign in the
         * newly created user when email confirmation
         * is disabled. Restore the administrator
         * session afterward when possible.
         */
        if (
            originalSessionData
        ) {
            try {
                await client.auth.setSession({
                    access_token:
                        originalSessionData
                            .access_token,
                    refresh_token:
                        originalSessionData
                            .refresh_token
                });
            } catch (restoreError) {
                console.warn(
                    "Unable to restore admin session:",
                    restoreError
                );
            }
        }

        return true;
    } catch (error) {
        console.error(
            "createCoworkerAccount:",
            error
        );

        /*
         * Try to restore the admin session
         * even when account creation fails.
         */
        if (
            originalSessionData
        ) {
            try {
                await client.auth.setSession({
                    access_token:
                        originalSessionData
                            .access_token,
                    refresh_token:
                        originalSessionData
                            .refresh_token
                });
            } catch {
                /*
                 * Nothing else to do.
                 */
            }
        }

        toast(
            error?.message ||
                "Unable to create coworker account.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   COWORKERS
   ============================================================ */

export function renderCoworkers() {
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
                )
        );

    if (!workers.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No coworkers found</strong>
                <p>
                    Create a coworker account to
                    assign annotation work.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        workers
            .map(worker => `
                <div
                    class="admin-coworker-row"
                    data-coworker-id="${escapeHTML(
                        worker.id
                    )}"
                >
                    <div>
                        <strong>
                            ${escapeHTML(
                                userDisplayName(
                                    worker
                                )
                            )}
                        </strong>

                        <span>
                            ${escapeHTML(
                                worker.email ||
                                ""
                            )}
                        </span>
                    </div>

                    <div>
                        <span class="admin-role-badge">
                            ${escapeHTML(
                                roleLabel(
                                    worker.role
                                )
                            )}
                        </span>

                        <span
                            class="admin-status admin-status-${
                                worker.active
                                    ? "active"
                                    : "pending"
                            }"
                        >
                            ${
                                worker.active
                                    ? "active"
                                    : "inactive"
                            }
                        </span>
                    </div>
                </div>
            `)
            .join("");
}


/* ============================================================
   TASKS
   ============================================================ */

export async function loadTasks() {
    if (
        !requireAdmin(
            "load tasks"
        )
    ) {
        return [];
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return [];
    }

    adminState.loadingTasks =
        true;

    try {
        const {
            data,
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.tasks ||
                "tasks"
            )
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            throw error;
        }

        adminState.tasks =
            Array.isArray(data)
                ? data
                : [];

        renderAdminTasks();
        calculateStats();

        return adminState.tasks;
    } catch (error) {
        console.error(
            "loadTasks:",
            error
        );

        toast(
            error?.message ||
                "Unable to load tasks.",
            "error"
        );

        return [];
    } finally {
        adminState.loadingTasks =
            false;
    }
}

function taskDisplayTitle(
    task
) {
    return (
        task?.title ||
        task?.description ||
        task?.work_type ||
        "Untitled task"
    );
}

function taskWorkerName(
    userId
) {
    if (!userId) {
        return "Unassigned";
    }

    const worker =
        adminState.users.find(
            user =>
                String(user.id) ===
                String(userId)
        );

    return worker
        ? userDisplayName(
            worker
        )
        : "Unknown user";
}

function taskStatusLabel(
    status
) {
    return String(
        status ||
        "unknown"
    )
        .replaceAll(
            "_",
            " "
        )
        .replace(
            /\b\w/g,
            letter =>
                letter.toUpperCase()
        );
}

function renderTaskWorkerOptions(
    selectedUser
) {
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

    return `
        <option value="">
            Unassigned
        </option>

        ${workers
            .map(worker => `
                <option
                    value="${escapeHTML(
                        worker.id
                    )}"
                    ${
                        String(
                            selectedUser ||
                            ""
                        ) ===
                        String(
                            worker.id
                        )
                            ? "selected"
                            : ""
                    }
                >
                    ${escapeHTML(
                        userDisplayName(
                            worker
                        )
                    )}
                    —
                    ${escapeHTML(
                        roleLabel(
                            worker.role
                        )
                    )}
                </option>
            `)
            .join("")}
    `;
}

export function renderAdminTasks() {
    const container =
        $("adminTasksList");

    if (!container) {
        return;
    }

    if (
        !adminState.tasks.length
    ) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No tasks found</strong>
                <p>
                    Customer and administrator
                    tasks will appear here.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.tasks
            .map(task => {
                const assigned =
                    task.assigned_to ||
                    task.claimed_by ||
                    "";

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
                                    taskDisplayTitle(
                                        task
                                    )
                                )}
                            </strong>

                            <span>
                                Task ID:
                                ${escapeHTML(
                                    task.id
                                )}
                            </span>

                            <span>
                                Work type:
                                ${escapeHTML(
                                    task.work_type ||
                                    "—"
                                )}
                            </span>

                            <span>
                                Role:
                                ${escapeHTML(
                                    roleLabel(
                                        task.work_role
                                    )
                                )}
                            </span>

                            <span>
                                Annotation type:
                                ${escapeHTML(
                                    task.annotation_type ||
                                    annotationTypeForRole(
                                        task.work_role
                                    ) ||
                                    "—"
                                )}
                            </span>

                        </div>

                        <div class="admin-task-status">

                            <span
                                class="admin-status admin-status-${escapeHTML(
                                    String(
                                        task.status ||
                                        ""
                                    )
                                )}"
                            >
                                ${escapeHTML(
                                    taskStatusLabel(
                                        task.status
                                    )
                                )}
                            </span>

                            <span>
                                ${
                                    Number(
                                        task.annotation_count ||
                                        0
                                    )
                                }
                                annotations
                            </span>

                            <span>
                                ${
                                    task.pay_amount ??
                                    task.pay ??
                                    0
                                }
                            </span>

                        </div>

                        <div class="admin-task-controls">

                            <select
                                data-task-assignment="${escapeHTML(
                                    task.id
                                )}"
                            >
                                ${renderTaskWorkerOptions(
                                    assigned
                                )}
                            </select>

                            ${
                                assigned
                                    ? `
                                        <button
                                            type="button"
                                            class="secondary-button"
                                            data-unassign-task="${escapeHTML(
                                                task.id
                                            )}"
                                        >
                                            Unassign
                                        </button>
                                    `
                                    : ""
                            }

                        </div>

                    </div>
                `;
            })
            .join("");

    bindRenderedTaskActions();
}

function bindRenderedTaskActions() {
    document
        .querySelectorAll(
            "[data-task-assignment]"
        )
        .forEach(select => {
            select.addEventListener(
                "change",
                async () => {
                    const taskId =
                        select.dataset
                            .taskAssignment;

                    const userId =
                        select.value ||
                        null;

                    await assignTask(
                        taskId,
                        userId
                    );
                }
            );
        });

    document
        .querySelectorAll(
            "[data-unassign-task]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    await assignTask(
                        button.dataset
                            .unassignTask,
                        null
                    );
                }
            );
        });
}


/* ============================================================
   ASSIGN TASK
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

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    const task =
        adminState.tasks.find(
            item =>
                String(item.id) ===
                String(taskId)
        );

    if (!task) {
        toast(
            "Task was not found.",
            "error"
        );

        return false;
    }

    try {
        const oldAssignee =
            task.assigned_to ||
            task.claimed_by ||
            null;

        const updates = {
            assigned_to:
                userId || null,
            updated_at:
                new Date().toISOString()
        };

        /*
         * When an admin explicitly assigns a task,
         * keep its normal available/claimed state.
         */
        if (
            userId &&
            (
                task.status ===
                    "available" ||
                task.status ===
                    "unclaimed"
            )
        ) {
            updates.status =
                "available";
        }

        const {
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.tasks ||
                "tasks"
            )
            .update(
                updates
            )
            .eq(
                "id",
                taskId
            );

        if (error) {
            throw error;
        }

        task.assigned_to =
            userId || null;

        if (
            updates.status
        ) {
            task.status =
                updates.status;
        }

        await logWorkflowEvent(
            taskId,
            userId ||
                adminState.user?.id ||
                null,
            "task_assigned",
            {
                previous_assignee:
                    oldAssignee,
                assigned_to:
                    userId || null,
                assigned_by:
                    adminState.user?.id ||
                    null
            }
        );

        toast(
            userId
                ? `Task assigned to ${taskWorkerName(
                    userId
                )}.`
                : "Task unassigned.",
            "success"
        );

        renderAdminTasks();

        return true;
    } catch (error) {
        console.error(
            "assignTask:",
            error
        );

        toast(
            error?.message ||
                "Unable to assign task.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   CREATE TASK MODAL
   ============================================================ */

function bindCreateTaskModal() {
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
            async event => {
                event.preventDefault();

                const title =
                    $("taskTitle")
                        ?.value
                        ?.trim();

                const shape =
                    $("taskShape")
                        ?.value;

                const duration =
                    Number(
                        $("taskDuration")
                            ?.value ||
                        30
                    );

                const pay =
                    Number(
                        $("taskPay")
                            ?.value ||
                        0
                    );

                const media =
                    $("taskMediaInput")
                        ?.files?.[0] ||
                    null;

                await createAdminTask({
                    title,
                    shape,
                    duration,
                    pay,
                    media
                });
            }
        );

    $("createTaskModal")
        ?.addEventListener(
            "click",
            event => {
                if (
                    event.target ===
                    $("createTaskModal")
                ) {
                    closeCreateTaskModal();
                }
            }
        );
}

export function openCreateTaskModal() {
    if (
        !requireAdmin(
            "create tasks"
        )
    ) {
        return false;
    }

    const modal =
        $("createTaskModal");

    if (!modal) {
        toast(
            "Create task window was not found.",
            "error"
        );

        return false;
    }

    adminState.createTaskModalOpen =
        true;

    showElement(
        modal,
        true
    );

    return true;
}

export function closeCreateTaskModal() {
    adminState.createTaskModalOpen =
        false;

    showElement(
        $("createTaskModal"),
        false
    );
}


/* ============================================================
   CREATE ADMIN TASK
   ============================================================ */

export async function createAdminTask({
    title,
    shape,
    duration = 30,
    pay = 0,
    media = null
} = {}) {
    if (
        !requireAdmin(
            "create tasks"
        )
    ) {
        return false;
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    title =
        String(
            title || ""
        ).trim();

    shape =
        String(
            shape || "box"
        ).trim();

    duration =
        Number(
            duration
        ) || 30;

    pay =
        Number(
            pay
        ) || 0;

    if (!title) {
        toast(
            "Enter a task title.",
            "warning"
        );

        return false;
    }

    const roleMap = {
        box:
            "coworker_2d_box",
        "2d_box":
            "coworker_2d_box",
        polygon:
            "coworker_polygon",
        segmentation:
            "coworker_segmentation"
    };

    const workRole =
        roleMap[
            shape
        ] ||
        roleForWorkType(
            shape
        ) ||
        "coworker_2d_box";

    let mediaPath =
        null;

    let mediaType =
        null;

    try {
        /*
         * Upload media when a file was supplied.
         */
        if (media) {
            const bucket =
                APP_CONFIG?.buckets
                    ?.taskMedia ||
                "task-media";

            const extension =
                media.name?.includes(".")
                    ? media.name
                        .split(".")
                        .pop()
                        .toLowerCase()
                    : "bin";

            const safeName =
                String(
                    media.name ||
                    "media"
                )
                    .replace(
                        /[^a-zA-Z0-9._-]/g,
                        "_"
                    );

            mediaPath =
                `admin/${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2)}-${safeName}`;

            const {
                error:
                    uploadError
            } =
                await client.storage
                    .from(bucket)
                    .upload(
                        mediaPath,
                        media,
                        {
                            upsert:
                                false,
                            contentType:
                                media.type ||
                                `application/octet-stream`
                        }
                    );

            if (uploadError) {
                throw uploadError;
            }

            mediaType =
                media.type ||
                (
                    extension === "mp4" ||
                    extension === "webm" ||
                    extension === "mov"
                        ? "video"
                        : "image"
                );
        }

        const payload = {
            title,
            work_type:
                shape,
            work_role:
                workRole,
            annotation_type:
                annotationTypeForRole(
                    workRole
                ),
            status:
                "available",
            created_by:
                adminState.user?.id ||
                null,
            expected_minutes:
                duration,
            expected_duration:
                duration,
            duration:
                duration,
            pay_amount:
                pay,
            pay:
                pay,
            media_path:
                mediaPath,
            media_type:
                mediaType,
            annotation_count:
                0,
            metadata: {
                created_by_admin:
                    true
            },
            updated_at:
                new Date().toISOString()
        };

        let {
            data,
            error
        } =
            await client
                .from(
                    APP_CONFIG?.tables
                        ?.tasks ||
                    "tasks"
                )
                .insert(
                    payload
                )
                .select("*")
                .single();

        /*
         * Fallback for installations where some
         * optional columns differ.
         */
        if (
            error
        ) {
            const fallbackPayload = {
                title,
                work_type:
                    shape,
                work_role:
                    workRole,
                status:
                    "available",
                created_by:
                    adminState.user?.id ||
                    null,
                expected_minutes:
                    duration,
                pay_amount:
                    pay,
                media_path:
                    mediaPath,
                media_type:
                    mediaType,
                annotation_type:
                    annotationTypeForRole(
                        workRole
                    )
            };

            const fallback =
                await client
                    .from(
                        APP_CONFIG?.tables
                            ?.tasks ||
                        "tasks"
                    )
                    .insert(
                        fallbackPayload
                    )
                    .select("*")
                    .single();

            data =
                fallback.data;

            error =
                fallback.error;
        }

        if (error) {
            throw error;
        }

        await logAdminActivity(
            "task_created",
            {
                task_id:
                    data?.id ||
                    null,
                work_type:
                    shape,
                work_role:
                    workRole
            }
        );

        toast(
            "Task created successfully.",
            "success"
        );

        closeCreateTaskModal();

        $("createTaskForm")
            ?.reset();

        await loadTasks();

        return data;
    } catch (error) {
        console.error(
            "createAdminTask:",
            error
        );

        toast(
            error?.message ||
                "Unable to create task.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   PAY RATES
   ============================================================ */

export async function loadPayRates() {
    if (
        !requireAdmin(
            "load pay rates"
        )
    ) {
        return [];
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return [];
    }

    adminState.loadingRates =
        true;

    try {
        const {
            data,
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.payRates ||
                "pay_rates"
            )
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            throw error;
        }

        adminState.payRates =
            Array.isArray(data)
                ? data
                : [];

        renderPayRates();

        return adminState.payRates;
    } catch (error) {
        console.error(
            "loadPayRates:",
            error
        );

        toast(
            error?.message ||
                "Unable to load pay rates.",
            "error"
        );

        return [];
    } finally {
        adminState.loadingRates =
            false;
    }
}

export function renderPayRates() {
    const container =
        $("payRatesList");

    if (!container) {
        return;
    }

    if (
        !adminState.payRates.length
    ) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No pay rates configured</strong>
                <p>
                    Add role or work-type rates
                    in Supabase to display them here.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.payRates
            .map(rate => `
                <div class="admin-rate-row">

                    <div>
                        <strong>
                            ${escapeHTML(
                                roleLabel(
                                    rate.role
                                )
                            )}
                        </strong>

                        <span>
                            Work type:
                            ${escapeHTML(
                                rate.work_type ||
                                rate.workType ||
                                "All"
                            )}
                        </span>
                    </div>

                    <div>
                        <strong>
                            ${escapeHTML(
                                rate.amount ??
                                rate.rate ??
                                0
                            )}
                            ${escapeHTML(
                                rate.currency ||
                                "USD"
                            )}
                        </strong>

                        <span>
                            ${
                                rate.active
                                    ? "Active"
                                    : "Inactive"
                            }
                        </span>
                    </div>

                </div>
            `)
            .join("");
}


/* ============================================================
   PAYMENTS
   ============================================================ */

export async function loadPayments() {
    if (
        !requireAdmin(
            "load payments"
        )
    ) {
        return [];
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return [];
    }

    adminState.loadingPayments =
        true;

    try {
        const {
            data,
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.taskPayments ||
                "task_payments"
            )
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            throw error;
        }

        adminState.payments =
            Array.isArray(data)
                ? data
                : [];

        renderPayments();
        calculateStats();

        return adminState.payments;
    } catch (error) {
        console.error(
            "loadPayments:",
            error
        );

        toast(
            error?.message ||
                "Unable to load payments.",
            "error"
        );

        return [];
    } finally {
        adminState.loadingPayments =
            false;
    }
}

function paymentWorkerName(
    payment
) {
    return taskWorkerName(
        payment?.user_id ||
        payment?.worker_id
    );
}

export function renderPayments() {
    const container =
        $("paymentsList");

    if (!container) {
        return;
    }

    if (
        !adminState.payments.length
    ) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No payments found</strong>
                <p>
                    Task payment records will appear here.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.payments
            .map(payment => {
                const paid =
                    String(
                        payment.status ||
                        ""
                    ).toLowerCase() ===
                    "paid";

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
                                    paymentWorkerName(
                                        payment
                                    )
                                )}
                            </strong>

                            <span>
                                Task:
                                ${escapeHTML(
                                    payment.task_id ||
                                    "—"
                                )}
                            </span>

                            <span>
                                Payment:
                                ${escapeHTML(
                                    payment.amount ??
                                    0
                                )}
                                ${escapeHTML(
                                    payment.currency ||
                                    "USD"
                                )}
                            </span>
                        </div>

                        <div>

                            <span
                                class="admin-status admin-status-${
                                    paid
                                        ? "paid"
                                        : "unpaid"
                                }"
                            >
                                ${
                                    paid
                                        ? "Paid"
                                        : "Unpaid"
                                }
                            </span>

                            ${
                                paid
                                    ? `
                                        <button
                                            type="button"
                                            class="secondary-button"
                                            data-payment-unpaid="${escapeHTML(
                                                payment.id
                                            )}"
                                        >
                                            Mark unpaid
                                        </button>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            class="primary-button"
                                            data-payment-paid="${escapeHTML(
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
            })
            .join("");

    bindRenderedPaymentActions();
}

function bindRenderedPaymentActions() {
    document
        .querySelectorAll(
            "[data-payment-paid]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    await markPaymentPaid(
                        button.dataset
                            .paymentPaid,
                        true
                    );
                }
            );
        });

    document
        .querySelectorAll(
            "[data-payment-unpaid]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    await markPaymentPaid(
                        button.dataset
                            .paymentUnpaid,
                        false
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
            "change payment status"
        )
    ) {
        return false;
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return false;
    }

    const payment =
        adminState.payments.find(
            item =>
                String(item.id) ===
                String(paymentId)
        );

    if (!payment) {
        toast(
            "Payment record was not found.",
            "error"
        );

        return false;
    }

    try {
        const now =
            new Date().toISOString();

        const updates = {
            status:
                paid
                    ? "paid"
                    : "unpaid",
            paid_at:
                paid
                    ? now
                    : null,
            approved_by:
                paid
                    ? adminState.user?.id ||
                      null
                    : payment.approved_by ||
                      null,
            updated_at:
                now
        };

        const {
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.taskPayments ||
                "task_payments"
            )
            .update(
                updates
            )
            .eq(
                "id",
                paymentId
            );

        if (error) {
            throw error;
        }

        payment.status =
            updates.status;

        payment.paid_at =
            updates.paid_at;

        payment.approved_by =
            updates.approved_by;

        await logAdminActivity(
            paid
                ? "payment_paid"
                : "payment_unpaid",
            {
                payment_id:
                    paymentId,
                task_id:
                    payment.task_id ||
                    null,
                user_id:
                    payment.user_id ||
                    payment.worker_id ||
                    null,
                amount:
                    payment.amount ||
                    0
            }
        );

        toast(
            paid
                ? "Payment marked as paid."
                : "Payment marked as unpaid.",
            "success"
        );

        calculateStats();
        renderPayments();

        return true;
    } catch (error) {
        console.error(
            "markPaymentPaid:",
            error
        );

        toast(
            error?.message ||
                "Unable to update payment.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   ACTIVITIES
   ============================================================ */

export async function loadActivities() {
    if (
        !requireAdmin(
            "load activity logs"
        )
    ) {
        return [];
    }

    const client =
        getClient();

    if (!client) {
        toast(
            "Supabase connection is unavailable.",
            "error"
        );

        return [];
    }

    adminState.loadingActivities =
        true;

    try {
        const {
            data,
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.activities ||
                "activity_logs"
            )
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(
                250
            );

        if (error) {
            throw error;
        }

        adminState.activities =
            Array.isArray(data)
                ? data
                : [];

        renderActivities();

        return adminState.activities;
    } catch (error) {
        console.error(
            "loadActivities:",
            error
        );

        toast(
            error?.message ||
                "Unable to load activity logs.",
            "error"
        );

        return [];
    } finally {
        adminState.loadingActivities =
            false;
    }
}

export function renderActivities() {
    const container =
        $("activityList");

    if (!container) {
        return;
    }

    if (
        !adminState.activities.length
    ) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No activity found</strong>
                <p>
                    Administrative activity will appear here.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        adminState.activities
            .map(activity => {
                const user =
                    adminState.users.find(
                        item =>
                            String(
                                item.id
                            ) ===
                            String(
                                activity.user_id
                            )
                    );

                const action =
                    activity.action ||
                    activity.event_type ||
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
                                ${
                                    user
                                        ? escapeHTML(
                                            userDisplayName(
                                                user
                                            )
                                        )
                                        : "System"
                                }
                            </span>
                        </div>

                        <time>
                            ${
                                activity.created_at
                                    ? new Date(
                                        activity.created_at
                                    ).toLocaleString()
                                    : "—"
                            }
                        </time>

                    </div>
                `;
            })
            .join("");
}


/* ============================================================
   ADMIN ACTIVITY LOGGER
   ============================================================ */

async function logAdminActivity(
    action,
    metadata = {}
) {
    try {
        await logActivity(
            action,
            {
                user_id:
                    adminState.user?.id ||
                    null,
                metadata
            }
        );

        return true;
    } catch {
        /*
         * Direct fallback.
         */
    }

    const client =
        getClient();

    if (!client) {
        return false;
    }

    try {
        const {
            error
        } = await client
            .from(
                APP_CONFIG?.tables
                    ?.activities ||
                "activity_logs"
            )
            .insert({
                user_id:
                    adminState.user?.id ||
                    null,
                event_type:
                    action,
                action,
                metadata,
                details:
                    metadata,
                created_at:
                    new Date().toISOString()
            });

        if (error) {
            throw error;
        }

        return true;
    } catch (error) {
        console.warn(
            "logAdminActivity:",
            error
        );

        return false;
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

    adminState.stats = {
        users:
            users.length,

        activeUsers:
            users.filter(
                user =>
                    user.active
            ).length,

        pendingUsers:
            users.filter(
                user =>
                    !user.active &&
                    !user.kicked_at
            ).length,

        customers:
            users.filter(
                user =>
                    normalizeRole(
                        user.role
                    ) ===
                    "customer"
            ).length,

        coworkers:
            users.filter(
                user =>
                    isCoworkerRole(
                        user.role
                    )
            ).length,

        reviewers:
            users.filter(
                user =>
                    isReviewerRole(
                        user.role
                    )
            ).length,

        staff:
            users.filter(
                user =>
                    isStaffRole(
                        user.role
                    )
            ).length,

        admins:
            users.filter(
                user =>
                    isAdminRole(
                        user.role
                    )
            ).length,

        totalTasks:
            tasks.length,

        availableTasks:
            tasks.filter(
                task =>
                    task.status ===
                    "available"
            ).length,

        claimedTasks:
            tasks.filter(
                task =>
                    task.status ===
                    "claimed"
            ).length,

        inProgressTasks:
            tasks.filter(
                task =>
                    task.status ===
                        "in_progress" ||
                    task.status ===
                        "draft"
            ).length,

        reviewTasks:
            tasks.filter(
                task =>
                    task.status ===
                        "review" ||
                    task.status ===
                        "in_review"
            ).length,

        approvedTasks:
            tasks.filter(
                task =>
                    task.status ===
                    "approved"
            ).length,

        skippedTasks:
            tasks.filter(
                task =>
                    task.status ===
                    "skipped"
            ).length,

        paidTasks:
            tasks.filter(
                task =>
                    task.status ===
                    "paid"
            ).length,

        unpaidPayments:
            payments.filter(
                payment =>
                    String(
                        payment.status ||
                        ""
                    ).toLowerCase() !==
                    "paid"
            ).length,

        paidPayments:
            payments.filter(
                payment =>
                    String(
                        payment.status ||
                        ""
                    ).toLowerCase() ===
                    "paid"
            ).length,

        totalPaid:
            payments
                .filter(
                    payment =>
                        String(
                            payment.status ||
                            ""
                        ).toLowerCase() ===
                        "paid"
                )
                .reduce(
                    (
                        total,
                        payment
                    ) =>
                        total +
                        Number(
                            payment.amount ||
                            0
                        ),
                    0
                ),

        totalUnpaid:
            payments
                .filter(
                    payment =>
                        String(
                            payment.status ||
                            ""
                        ).toLowerCase() !==
                        "paid"
                )
                .reduce(
                    (
                        total,
                        payment
                    ) =>
                        total +
                        Number(
                            payment.amount ||
                            0
                        ),
                    0
                )
    };

    return adminState.stats;
}


/* ============================================================
   OVERVIEW
   ============================================================ */

export function renderOverview() {
    calculateStats();

    const stats =
        adminState.stats;

    const mapping = {
        adminTotalUsers:
            stats.users,

        adminActiveUsers:
            stats.activeUsers,

        adminPendingUsers:
            stats.pendingUsers,

        adminCustomers:
            stats.customers,

        adminCoworkers:
            stats.coworkers,

        adminReviewers:
            stats.reviewers,

        adminStaff:
            stats.staff,

        adminAdmins:
            stats.admins,

        adminTotalTasks:
            stats.totalTasks,

        adminAvailableTasks:
            stats.availableTasks,

        adminClaimedTasks:
            stats.claimedTasks,

        adminInProgressTasks:
            stats.inProgressTasks,

        adminReviewTasks:
            stats.reviewTasks,

        adminApprovedTasks:
            stats.approvedTasks,

        adminSkippedTasks:
            stats.skippedTasks,

        adminPaidTasks:
            stats.paidTasks,

        adminUnpaidPayments:
            stats.unpaidPayments,

        adminPaidPayments:
            stats.paidPayments,

        adminTotalPaid:
            stats.totalPaid,

        adminTotalUnpaid:
            stats.totalUnpaid
    };

    Object.entries(
        mapping
    ).forEach(
        ([
            id,
            value
        ]) => {
            const element =
                $(id);

            if (element) {
                setText(
                    element,
                    value
                );
            }
        }
    );

    renderRecentActivity();
    renderTaskProgress();
}

function renderRecentActivity() {
    const container =
        $("adminRecentActivity");

    if (!container) {
        return;
    }

    const recent =
        adminState.activities
            .slice(
                0,
                10
            );

    if (!recent.length) {
        container.innerHTML = `
            <div class="empty-state">
                No recent activity.
            </div>
        `;

        return;
    }

    container.innerHTML =
        recent
            .map(activity => `
                <div class="admin-recent-activity-item">

                    <strong>
                        ${escapeHTML(
                            activity.action ||
                            activity.event_type ||
                            "activity"
                        )}
                    </strong>

                    <time>
                        ${
                            activity.created_at
                                ? new Date(
                                    activity.created_at
                                ).toLocaleString()
                                : "—"
                        }
                    </time>

                </div>
            `)
            .join("");
}

function renderTaskProgress() {
    const container =
        $("adminTaskProgress");

    if (!container) {
        return;
    }

    const total =
        Math.max(
            adminState.tasks.length,
            1
        );

    const statuses = [
        [
            "Available",
            adminState.stats.availableTasks
        ],
        [
            "Claimed",
            adminState.stats.claimedTasks
        ],
        [
            "In progress",
            adminState.stats.inProgressTasks
        ],
        [
            "Review",
            adminState.stats.reviewTasks
        ],
        [
            "Approved",
            adminState.stats.approvedTasks
        ],
        [
            "Skipped",
            adminState.stats.skippedTasks
        ],
        [
            "Paid",
            adminState.stats.paidTasks
        ]
    ];

    container.innerHTML =
        statuses
            .map(
                ([
                    label,
                    count
                ]) => {
                    const percentage =
                        Math.round(
                            (
                                count /
                                total
                            ) *
                            100
                        );

                    return `
                        <div class="admin-progress-row">

                            <div class="admin-progress-label">
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
                                    class="admin-progress-bar"
                                    style="width:${Math.min(
                                        percentage,
                                        100
                                    )}%"
                                ></div>
                            </div>

                        </div>
                    `;
                }
            )
            .join("");
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
        return false;
    }

    try {
        const rows = [];

        rows.push([
            "Section",
            "ID",
            "Name",
            "Email",
            "Role",
            "Status",
            "Task",
            "Amount",
            "Created At"
        ]);

        adminState.users
            .forEach(user => {
                rows.push([
                    "user",
                    user.id,
                    userDisplayName(
                        user
                    ),
                    user.email ||
                        "",
                    normalizeRole(
                        user.role
                    ),
                    userStatus(
                        user
                    ),
                    "",
                    "",
                    user.created_at ||
                        ""
                ]);
            });

        adminState.tasks
            .forEach(task => {
                rows.push([
                    "task",
                    task.id,
                    taskDisplayTitle(
                        task
                    ),
                    "",
                    roleLabel(
                        task.work_role
                    ),
                    task.status ||
                        "",
                    task.id,
                    task.pay_amount ??
                        task.pay ??
                        "",
                    task.created_at ||
                        ""
                ]);
            });

        adminState.payments
            .forEach(payment => {
                rows.push([
                    "payment",
                    payment.id,
                    paymentWorkerName(
                        payment
                    ),
                    "",
                    "",
                    payment.status ||
                        "",
                    payment.task_id ||
                        "",
                    payment.amount ??
                        "",
                    payment.created_at ||
                        ""
                ]);
            });

        const csv =
            rows
                .map(row =>
                    row
                        .map(value =>
                            `"${String(
                                value ??
                                ""
                            )
                                .replaceAll(
                                    '"',
                                    '""'
                                )}"`
                        )
                        .join(",")
                )
                .join("\n");

        const output =
            $("adminExportOutput");

        if (output) {
            output.value =
                csv;

            output.textContent =
                csv;
        }

        try {
            await navigator.clipboard.writeText(
                csv
            );
        } catch {
            /*
             * Clipboard may be unavailable
             * on non-secure origins.
             */
        }

        toast(
            "CSV generated. You can copy it from the export area.",
            "success"
        );

        return csv;
    } catch (error) {
        console.error(
            "copyAdminCSV:",
            error
        );

        toast(
            "Unable to generate CSV.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   HTML EXPORT
   ============================================================ */

export async function downloadAdminHTML() {
    if (
        !requireAdmin(
            "export admin data"
        )
    ) {
        return false;
    }

    try {
        const stats =
            calculateStats();

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Work Export</title>
<style>
body {
    font-family: Arial, sans-serif;
    margin: 32px;
    line-height: 1.5;
}
h1, h2 {
    margin-bottom: 8px;
}
table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 30px;
}
th, td {
    border: 1px solid #ccc;
    padding: 8px;
    text-align: left;
}
th {
    background: #f2f2f2;
}
.summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 30px;
}
.card {
    border: 1px solid #ccc;
    padding: 12px;
    border-radius: 8px;
}
</style>
</head>
<body>

<h1>Admin Work Export</h1>

<p>
Generated:
${escapeHTML(
    new Date().toLocaleString()
)}
</p>

<h2>Summary</h2>

<div class="summary">

<div class="card">
<strong>Users</strong><br>
${stats.users}
</div>

<div class="card">
<strong>Active users</strong><br>
${stats.activeUsers}
</div>

<div class="card">
<strong>Pending users</strong><br>
${stats.pendingUsers}
</div>

<div class="card">
<strong>Coworkers</strong><br>
${stats.coworkers}
</div>

<div class="card">
<strong>Reviewers</strong><br>
${stats.reviewers}
</div>

<div class="card">
<strong>Tasks</strong><br>
${stats.totalTasks}
</div>

<div class="card">
<strong>Approved</strong><br>
${stats.approvedTasks}
</div>

<div class="card">
<strong>Paid</strong><br>
${stats.paidTasks}
</div>

<div class="card">
<strong>Total paid</strong><br>
${stats.totalPaid}
</div>

<div class="card">
<strong>Total unpaid</strong><br>
${stats.totalUnpaid}
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
<th>Last login</th>
<th>Last logout</th>
</tr>
</thead>

<tbody>

${adminState.users
    .map(user => `
<tr>
<td>${escapeHTML(
    userDisplayName(
        user
    )
)}</td>
<td>${escapeHTML(
    user.email ||
    ""
)}</td>
<td>${escapeHTML(
    roleLabel(
        user.role
    )
)}</td>
<td>${escapeHTML(
    userStatus(
        user
    )
)}</td>
<td>${escapeHTML(
    user.created_at ||
    ""
)}</td>
<td>${escapeHTML(
    user.last_login_at ||
    ""
)}</td>
<td>${escapeHTML(
    user.last_logout_at ||
    ""
)}</td>
</tr>
`)
    .join("")}

</tbody>
</table>

<h2>Tasks</h2>

<table>
<thead>
<tr>
<th>Task ID</th>
<th>Title</th>
<th>Work type</th>
<th>Role</th>
<th>Status</th>
<th>Assigned worker</th>
<th>Annotations</th>
<th>Pay</th>
<th>Created</th>
</tr>
</thead>

<tbody>

${adminState.tasks
    .map(task => `
<tr>
<td>${escapeHTML(
    task.id
)}</td>
<td>${escapeHTML(
    taskDisplayTitle(
        task
    )
)}</td>
<td>${escapeHTML(
    task.work_type ||
    ""
)}</td>
<td>${escapeHTML(
    roleLabel(
        task.work_role
    )
)}</td>
<td>${escapeHTML(
    task.status ||
    ""
)}</td>
<td>${escapeHTML(
    taskWorkerName(
        task.assigned_to ||
        task.claimed_by
    )
)}</td>
<td>${escapeHTML(
    task.annotation_count ??
    0
)}</td>
<td>${escapeHTML(
    task.pay_amount ??
    task.pay ??
    0
)}</td>
<td>${escapeHTML(
    task.created_at ||
    ""
)}</td>
</tr>
`)
    .join("")}

</tbody>
</table>

<h2>Payments</h2>

<table>
<thead>
<tr>
<th>Payment ID</th>
<th>Task ID</th>
<th>Worker</th>
<th>Amount</th>
<th>Currency</th>
<th>Status</th>
<th>Paid At</th>
</tr>
</thead>

<tbody>

${adminState.payments
    .map(payment => `
<tr>
<td>${escapeHTML(
    payment.id
)}</td>
<td>${escapeHTML(
    payment.task_id ||
    ""
)}</td>
<td>${escapeHTML(
    paymentWorkerName(
        payment
    )
)}</td>
<td>${escapeHTML(
    payment.amount ??
    0
)}</td>
<td>${escapeHTML(
    payment.currency ||
    "USD"
)}</td>
<td>${escapeHTML(
    payment.status ||
    ""
)}</td>
<td>${escapeHTML(
    payment.paid_at ||
    ""
)}</td>
</tr>
`)
    .join("")}

</tbody>
</table>

</body>
</html>
        `.trim();

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

        const link =
            document.createElement(
                "a"
            );

        link.href =
            url;

        link.download =
            `admin-export-${new Date()
                .toISOString()
                .slice(
                    0,
                    10
                )}.html`;

        document.body.appendChild(
            link
        );

        link.click();

        link.remove();

        URL.revokeObjectURL(
            url
        );

        toast(
            "Admin HTML export downloaded.",
            "success"
        );

        return true;
    } catch (error) {
        console.error(
            "downloadAdminHTML:",
            error
        );

        toast(
            "Unable to create HTML export.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   AUTH EVENTS
   ============================================================ */

function bindAuthEvents() {
    window.addEventListener(
        "authStateChanged",
        async () => {
            refreshAuthorization();

            updateAdminButtonVisibility();

            if (
                !adminState.authorized
            ) {
                closeAdminCenter();

                return;
            }

            if (
                adminState.modalOpen
            ) {
                await loadAdminData();
            }
        }
    );

    window.addEventListener(
        "profileUpdated",
        () => {
            refreshAuthorization();

            updateAdminButtonVisibility();
        }
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
        setUserActive(
            userId,
            true
        ),

    deactivateUser: userId =>
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

    getState:
        getAdminState
};


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
   EXPORTS
   ------------------------------------------------------------
   IMPORTANT:
   updateAdminButtonVisibility is intentionally NOT included
   here because it is already exported at its declaration above.
   Including it here would cause:
   
   Uncaught SyntaxError:
   Duplicate export of 'updateAdminButtonVisibility'
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
    calculateStats
};
