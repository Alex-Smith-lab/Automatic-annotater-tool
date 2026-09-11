/* ============================================================
   ADMIN.JS
   ANNOTATION AI

   ADMIN CENTER
   ------------------------------------------------------------
   Users
   Roles
   Approval
   Kicked / disabled users
   Coworkers
   Staff
   Tasks
   Assignment
   Reassignment
   Task progress
   Payments
   Pay rates
   Activity
   CSV export
   HTML export

   IMPORTANT
   ------------------------------------------------------------
   This file NEVER uses a Supabase service-role key.

   Browser access uses the publishable/anon key through
   supabase.js.

   IMPORTANT:
   Database/RLS policies must still protect production data.
============================================================ */

import {
    supabase,
    getCurrentUser,
    getCurrentSession,
    getCurrentProfile,
    logActivity,
    logWorkflowEvent
} from "./supabase.js";

import {
    APP_CONFIG,
    ALL_ROLES,
    normalizeRole,
    roleLabel,
    isAdminRole,
    isStaffRole,
    isReviewerRole,
    isCoworkerRole,
    WORK_ROLE,
    roleForWorkType
} from "./config.js";

import {
    isAdmin
} from "./auth.js";


/* ============================================================
   CONFIGURATION
============================================================ */

const ADMIN_CONFIG = {

    adminEmail:
        APP_CONFIG?.adminEmail ||
        window.ADMIN_EMAIL ||
        "antonymbali96@gmail.com",

    tables: {

        tasks:
            APP_CONFIG?.tables?.tasks ||
            window.APP_TASK_TABLE ||
            "tasks",

        profiles:
            APP_CONFIG?.tables?.profiles ||
            window.APP_PROFILE_TABLE ||
            "profiles",

        results:
            APP_CONFIG?.tables?.taskResults ||
            APP_CONFIG?.tables?.results ||
            window.APP_RESULT_TABLE ||
            "task_results",

        annotations:
            APP_CONFIG?.tables?.annotations ||
            "task_annotations",

        coworkers:
            APP_CONFIG?.tables?.coworkers ||
            window.APP_COWORKER_TABLE ||
            "coworkers",

        payments:
            APP_CONFIG?.tables?.payments ||
            window.APP_PAYMENT_TABLE ||
            "payments",

        payRates:
            APP_CONFIG?.tables?.payRates ||
            "pay_rates",

        activity:
            APP_CONFIG?.tables?.activityLogs ||
            window.APP_ACTIVITY_TABLE ||
            "activity_logs",

        taskSkips:
            APP_CONFIG?.tables?.taskSkips ||
            "task_skips"
    },

    buckets: {

        taskMedia:
            APP_CONFIG?.buckets?.taskMedia ||
            "task-media"
    },

    roles:
        Array.isArray(ALL_ROLES)
            ? ALL_ROLES
            : [
                "customer",
                "reviewer",
                "staff",
                "admin",
                "coworker_2d_box",
                "coworker_polygon",
                "coworker_segmentation"
            ]
};


/* ============================================================
   DOM HELPER
============================================================ */

const $ = id =>
    document.getElementById(id);


/* ============================================================
   DOM REFERENCES
============================================================ */

let adminModal;
let closeAdminModalButton;
let adminCenterButton;

let createTaskButton;
let taskTitleInput;
let taskShapeInput;
let taskDurationInput;
let taskPayInput;
let taskMediaInput;

let adminTasksList;
let adminUsersList;
let adminCoworkersList;
let paymentsList;
let activityList;
let payRatesList;

let copyAdminCSV;
let downloadAdminHTML;

let adminContent;


/* ============================================================
   REFRESH DOM REFERENCES
============================================================ */

function cacheDOM() {

    adminModal =
        $("adminModal");

    closeAdminModalButton =
        $("closeAdminModal");

    adminCenterButton =
        $("adminCenterButton");


    createTaskButton =
        $("createTaskButton");

    taskTitleInput =
        $("taskTitle");

    taskShapeInput =
        $("taskShape");

    taskDurationInput =
        $("taskDuration");

    taskPayInput =
        $("taskPay");

    taskMediaInput =
        $("taskMediaInput");


    adminTasksList =
        $("adminTasksList") ||
        $("adminTasksTable");


    adminUsersList =
        $("usersList") ||
        $("adminUsersList") ||
        $("adminUsersTable");


    adminCoworkersList =
        $("coworkersList") ||
        $("adminCoworkersList") ||
        $("adminCoworkersTable");


    paymentsList =
        $("paymentsList");


    activityList =
        $("activityList");


    payRatesList =
        $("payRatesList");


    copyAdminCSV =
        $("copyAdminCSV");


    downloadAdminHTML =
        $("downloadAdminHTML");


    adminContent =
        $("adminContent");
}


/* ============================================================
   STATE
============================================================ */

const adminState = {

    initialized:
        false,

    open:
        false,

    loading:
        false,

    currentUser:
        null,

    currentProfile:
        null,

    currentRole:
        null,

    activeTab:
        "overview",

    users:
        [],

    coworkers:
        [],

    tasks:
        [],

    payments:
        [],

    payRates:
        [],

    activity:
        [],

    selectedTask:
        null,

    lastRefresh:
        null,

    optionalTables:
        {
            coworkers:
                true,

            payments:
                true,

            payRates:
                true,

            activity:
                true,

            annotations:
                true,

            results:
                true
        }
};


/* ============================================================
   SAFE HTML
============================================================ */

function escapeHTML(value) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


/* ============================================================
   DATE
============================================================ */

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
        return escapeHTML(
            value
        );
    }

    return date.toLocaleString();
}


/* ============================================================
   MONEY
============================================================ */

function formatMoney(value) {

    const amount =
        Number(value);

    if (
        !Number.isFinite(
            amount
        )
    ) {
        return "0.00";
    }

    return amount.toFixed(2);
}


/* ============================================================
   SUPABASE
============================================================ */

function getSupabaseClient() {

    if (supabase) {
        return supabase;
    }

    if (
        window.supabaseClient
    ) {
        return window.supabaseClient;
    }

    return null;
}


/* ============================================================
   CURRENT USER
============================================================ */

async function getAdminUser() {

    try {

        if (
            typeof getCurrentUser ===
            "function"
        ) {

            const user =
                await getCurrentUser();

            if (user) {
                return user;
            }
        }

    } catch (error) {

        console.warn(
            "Admin user lookup failed:",
            error
        );
    }


    try {

        if (
            typeof getCurrentSession ===
            "function"
        ) {

            const session =
                await getCurrentSession();

            return (
                session?.user ||
                null
            );
        }

    } catch (error) {

        console.warn(
            "Admin session lookup failed:",
            error
        );
    }


    return null;
}


/* ============================================================
   PROFILE ROLE
============================================================ */

function getProfileRole(
    profile
) {

    if (!profile) {
        return null;
    }

    return normalizeRole(
        profile.role ||
        profile.user_role ||
        null
    );
}


/* ============================================================
   ADMIN CHECK
============================================================ */

function isAdminUser(
    user = adminState.currentUser
) {

    if (!user) {
        return false;
    }


    /*
     * First use the central auth module.
     */

    try {

        if (
            typeof isAdmin ===
            "function" &&
            isAdmin()
        ) {
            return true;
        }

    } catch {
        /* continue with fallback */
    }


    const metadata =
        user.user_metadata ||
        {};

    const appMetadata =
        user.app_metadata ||
        {};


    const metadataRole =
        normalizeRole(
            metadata.role ||
            appMetadata.role
        );


    if (
        isAdminRole(
            metadataRole
        )
    ) {
        return true;
    }


    const profileRole =
        getProfileRole(
            adminState.currentProfile
        );


    if (
        isAdminRole(
            profileRole
        )
    ) {
        return true;
    }


    const email =
        String(
            user.email ||
            ""
        )
            .trim()
            .toLowerCase();


    return (
        email ===
        String(
            ADMIN_CONFIG.adminEmail
        )
            .trim()
            .toLowerCase()
    );
}


/* ============================================================
   REQUIRE ADMIN
============================================================ */

async function requireAdmin() {

    const user =
        await getAdminUser();


    adminState.currentUser =
        user;


    if (!user) {

        adminState.currentProfile =
            null;

        adminState.currentRole =
            null;

        return false;
    }


    try {

        if (
            typeof getCurrentProfile ===
            "function"
        ) {

            adminState.currentProfile =
                await getCurrentProfile();
        }

    } catch {

        adminState.currentProfile =
            null;
    }


    adminState.currentRole =
        getProfileRole(
            adminState.currentProfile
        );


    if (
        !adminState.currentRole
    ) {

        adminState.currentRole =
            normalizeRole(
                user.user_metadata?.role ||
                user.app_metadata?.role
            );
    }


    return isAdminUser(
        user
    );
}


/* ============================================================
   STATUS
============================================================ */

function setAdminStatus(
    message,
    type = "info"
) {

    const element =
        $("adminTaskStatus");


    if (!element) {
        return;
    }


    element.textContent =
        message || "";


    element.dataset.type =
        type;
}


/* ============================================================
   TOAST
============================================================ */

function showAdminToast(
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
        return;
    }


    const toast =
        document.createElement(
            "div"
        );


    toast.className =
        "toast";


    toast.dataset.type =
        type;


    toast.textContent =
        message;


    container.appendChild(
        toast
    );


    window.setTimeout(
        () => {
            toast.remove();
        },
        3500
    );
}


/* ============================================================
   GENERIC TABLE CHECK
============================================================ */

function isMissingTableError(
    error
) {

    const message =
        String(
            error?.message ||
            ""
        )
            .toLowerCase();


    return (
        message.includes(
            "does not exist"
        ) ||
        message.includes(
            "relation"
        ) ||
        message.includes(
            "could not find"
        ) ||
        message.includes(
            "schema cache"
        )
    );
}


/* ============================================================
   GENERIC UPDATE LOCAL USER
============================================================ */

function updateLocalUser(
    userId,
    changes
) {

    const index =
        adminState.users.findIndex(
            user =>
                String(
                    user.id
                ) ===
                String(
                    userId
                )
        );


    if (index < 0) {
        return;
    }


    adminState.users[index] =
        {
            ...adminState.users[index],
            ...changes
        };
}


/* ============================================================
   OPEN ADMIN CENTER
============================================================ */

async function openAdminCenter() {

    const allowed =
        await requireAdmin();


    if (!allowed) {

        showAdminToast(
            "Administrator access is required.",
            "error"
        );

        return false;
    }


    cacheDOM();


    adminState.open =
        true;


    if (adminModal) {

        adminModal.style.display =
            "flex";

        adminModal.classList.add(
            "open"
        );

        adminModal.setAttribute(
            "aria-hidden",
            "false"
        );

        adminModal.classList.add(
            "admin-fullscreen-modal"
        );
    }


    document.body.classList.add(
        "admin-center-open"
    );


    activateAdminTab(
        adminState.activeTab
    );


    await refreshAdminCenter();


    return true;
}


/* ============================================================
   CLOSE ADMIN CENTER
============================================================ */

function closeAdminCenter() {

    adminState.open =
        false;


    if (adminModal) {

        adminModal.classList.remove(
            "open"
        );

        adminModal.style.display =
            "none";

        adminModal.setAttribute(
            "aria-hidden",
            "true"
        );
    }


    document.body.classList.remove(
        "admin-center-open"
    );
}


/* ============================================================
   REFRESH ADMIN CENTER
============================================================ */

async function refreshAdminCenter() {

    if (
        adminState.loading
    ) {
        return;
    }


    const allowed =
        await requireAdmin();


    if (!allowed) {
        return;
    }


    adminState.loading =
        true;


    setAdminStatus(
        "Refreshing admin center...",
        "info"
    );


    try {

        await Promise.allSettled([

            loadAdminTasks(),

            loadAdminUsers(),

            loadAdminCoworkers(),

            loadAdminPayments(),

            loadAdminPayRates(),

            loadAdminActivity()
        ]);


        renderAdminTasks();

        renderAdminUsers();

        renderAdminCoworkers();

        renderAdminPayments();

        renderAdminPayRates();

        renderAdminActivity();

        renderAdminOverview();


        adminState.lastRefresh =
            new Date()
                .toISOString();


        setAdminStatus(
            "Admin center updated.",
            "success"
        );

    } catch (error) {

        console.error(
            "Admin refresh failed:",
            error
        );

        setAdminStatus(
            "Unable to refresh admin data.",
            "error"
        );

    } finally {

        adminState.loading =
            false;
    }
}


/* ============================================================
   LOAD TASKS
============================================================ */

async function loadAdminTasks() {

    const client =
        getSupabaseClient();


    if (!client) {
        return [];
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.tasks
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );


        if (error) {
            throw error;
        }


        adminState.tasks =
            Array.isArray(data)
                ? data
                : [];


        return adminState.tasks;

    } catch (error) {

        console.warn(
            "Could not load admin tasks:",
            error
        );

        adminState.tasks =
            [];

        return [];
    }
}


/* ============================================================
   LOAD USERS
============================================================ */

async function loadAdminUsers() {

    const client =
        getSupabaseClient();


    if (!client) {
        return [];
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.profiles
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );


        if (error) {
            throw error;
        }


        adminState.users =
            Array.isArray(data)
                ? data
                : [];


        return adminState.users;

    } catch (error) {

        console.warn(
            "Could not load admin users:",
            error
        );

        adminState.users =
            [];

        return [];
    }
}


/* ============================================================
   LOAD COWORKERS
============================================================ */

async function loadAdminCoworkers() {

    const client =
        getSupabaseClient();


    if (!client) {
        return [];
    }


    /*
     * Try dedicated coworkers table.
     */

    if (
        adminState.optionalTables.coworkers
    ) {

        try {

            const {
                data,
                error
            } =
                await client
                    .from(
                        ADMIN_CONFIG.tables.coworkers
                    )
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );


            if (!error) {

                adminState.coworkers =
                    Array.isArray(data)
                        ? data
                        : [];

                return adminState.coworkers;
            }


            if (
                isMissingTableError(
                    error
                )
            ) {

                adminState.optionalTables.coworkers =
                    false;
            }

        } catch {
            adminState.optionalTables.coworkers =
                false;
        }
    }


    /*
     * Fallback: derive coworkers from profiles.
     */

    adminState.coworkers =
        adminState.users.filter(
            user =>
                isCoworkerRole(
                    normalizeRole(
                        user.role
                    )
                )
        );


    return adminState.coworkers;
}


/* ============================================================
   LOAD PAYMENTS
============================================================ */

async function loadAdminPayments() {

    const client =
        getSupabaseClient();


    if (
        !client ||
        !adminState.optionalTables.payments
    ) {
        return [];
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.payments
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );


        if (error) {
            throw error;
        }


        adminState.payments =
            Array.isArray(data)
                ? data
                : [];


        return adminState.payments;

    } catch (error) {

        if (
            isMissingTableError(
                error
            )
        ) {

            adminState.optionalTables.payments =
                false;

        } else {

            console.warn(
                "Could not load payments:",
                error
            );
        }


        adminState.payments =
            [];


        return [];
    }
}


/* ============================================================
   LOAD PAY RATES
============================================================ */

async function loadAdminPayRates() {

    const client =
        getSupabaseClient();


    if (
        !client ||
        !adminState.optionalTables.payRates
    ) {
        return [];
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.payRates
                )
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );


        if (error) {
            throw error;
        }


        adminState.payRates =
            Array.isArray(data)
                ? data
                : [];


        return adminState.payRates;

    } catch (error) {

        if (
            isMissingTableError(
                error
            )
        ) {

            adminState.optionalTables.payRates =
                false;

        } else {

            console.warn(
                "Could not load pay rates:",
                error
            );
        }


        adminState.payRates =
            [];


        return [];
    }
}


/* ============================================================
   LOAD ACTIVITY
============================================================ */

async function loadAdminActivity() {

    const client =
        getSupabaseClient();


    if (
        !client ||
        !adminState.optionalTables.activity
    ) {
        return [];
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.activity
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


        if (error) {
            throw error;
        }


        adminState.activity =
            Array.isArray(data)
                ? data
                : [];


        return adminState.activity;

    } catch (error) {

        if (
            isMissingTableError(
                error
            )
        ) {

            adminState.optionalTables.activity =
                false;

        } else {

            console.warn(
                "Could not load activity:",
                error
            );
        }


        adminState.activity =
            [];


        return [];
    }
}


/* ============================================================
   CREATE TASK
============================================================ */

async function createAdminTask() {

    if (
        !await requireAdmin()
    ) {

        showAdminToast(
            "Administrator access is required.",
            "error"
        );

        return null;
    }


    const client =
        getSupabaseClient();


    if (!client) {

        showAdminToast(
            "Supabase is not configured.",
            "error"
        );

        return null;
    }


    const title =
        taskTitleInput?.value
            ?.trim() ||
        "Untitled task";


    const shape =
        String(
            taskShapeInput?.value ||
            "box"
        )
            .trim()
            .toLowerCase();


    const duration =
        Number(
            taskDurationInput?.value
        ) || 0;


    const pay =
        Number(
            taskPayInput?.value
        ) || 0;


    /*
     * Convert shape to the application's
     * standard work role.
     */

    const workRole =
        roleForWorkType(
            shape
        ) ||
        (
            shape === "polygon"
                ? WORK_ROLE.POLYGON
                : shape === "segmentation"
                    ? WORK_ROLE.SEGMENTATION
                    : WORK_ROLE.BOX
        );


    const task = {

        title,

        shape,

        task_type:
            shape,

        work_type:
            shape,

        work_role:
            workRole,

        annotation_type:
            shape,

        duration,

        estimated_minutes:
            duration,

        pay,

        reward:
            pay,

        status:
            "available",

        created_by:
            adminState.currentUser?.id ||
            null,

        created_at:
            new Date()
                .toISOString()
    };


    const file =
        taskMediaInput?.files?.[0];


    if (file) {

        task.media_name =
            file.name;

        task.media_type =
            file.type;

        task.media_size =
            file.size;
    }


    setAdminStatus(
        "Creating task...",
        "info"
    );


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.tasks
                )
                .insert(
                    task
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        if (data) {

            adminState.tasks.unshift(
                data
            );
        }


        clearCreateTaskForm();

        renderAdminTasks();

        renderAdminOverview();


        await writeAdminActivity(
            "create_task",
            {
                task_id:
                    data?.id ||
                    null,

                title,

                work_type:
                    shape,

                work_role:
                    workRole,

                pay,

                duration
            }
        );


        showAdminToast(
            "Task created successfully.",
            "success"
        );


        setAdminStatus(
            "Task created successfully.",
            "success"
        );


        return data;

    } catch (error) {

        console.error(
            "Create task failed:",
            error
        );


        setAdminStatus(
            error?.message ||
            "Could not create task.",
            "error"
        );


        showAdminToast(
            error?.message ||
            "Could not create task.",
            "error"
        );


        return null;
    }
}


/* ============================================================
   CLEAR CREATE TASK FORM
============================================================ */

function clearCreateTaskForm() {

    if (taskTitleInput) {
        taskTitleInput.value =
            "";
    }

    if (taskDurationInput) {
        taskDurationInput.value =
            "";
    }

    if (taskPayInput) {
        taskPayInput.value =
            "";
    }

    if (taskMediaInput) {
        taskMediaInput.value =
            "";
    }
}


/* ============================================================
   UPDATE TASK
============================================================ */

async function updateAdminTask(
    taskId,
    changes
) {

    if (
        !await requireAdmin()
    ) {
        return null;
    }


    if (!taskId) {
        return null;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return null;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.tasks
                )
                .update(
                    {
                        ...changes,
                        updated_at:
                            new Date()
                                .toISOString()
                    }
                )
                .eq(
                    "id",
                    taskId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        const index =
            adminState.tasks.findIndex(
                task =>
                    String(
                        task.id
                    ) ===
                    String(
                        taskId
                    )
            );


        if (index >= 0) {

            adminState.tasks[index] =
                {
                    ...adminState.tasks[index],
                    ...data
                };
        }


        renderAdminTasks();

        renderAdminOverview();


        await writeAdminActivity(
            "update_task",
            {
                task_id:
                    taskId,

                changes
            }
        );


        return data;

    } catch (error) {

        console.error(
            "Update task failed:",
            error
        );


        showAdminToast(
            error?.message ||
            "Could not update task.",
            "error"
        );


        return null;
    }
}


/* ============================================================
   DELETE TASK
============================================================ */

async function deleteAdminTask(
    taskId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!taskId) {
        return false;
    }


    const confirmed =
        window.confirm(
            "Delete this task? This cannot be undone."
        );


    if (!confirmed) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return false;
    }


    try {

        const {
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.tasks
                )
                .delete()
                .eq(
                    "id",
                    taskId
                );


        if (error) {
            throw error;
        }


        adminState.tasks =
            adminState.tasks.filter(
                task =>
                    String(
                        task.id
                    ) !==
                    String(
                        taskId
                    )
            );


        renderAdminTasks();

        renderAdminOverview();


        await writeAdminActivity(
            "delete_task",
            {
                task_id:
                    taskId
            }
        );


        showAdminToast(
            "Task deleted.",
            "success"
        );


        return true;

    } catch (error) {

        console.error(
            "Delete task failed:",
            error
        );


        showAdminToast(
            error?.message ||
            "Could not delete task.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   APPROVE USER
============================================================ */

async function approveUser(
    userId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!userId) {
        return false;
    }


    if (
        String(
            adminState.currentUser?.id
        ) ===
        String(
            userId
        )
    ) {
        return true;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return false;
    }


    try {

        const changes = {

            active:
                true,

            status:
                "active",

            approval_status:
                "approved",

            approved_by:
                adminState.currentUser?.id ||
                null,

            approved_at:
                new Date()
                    .toISOString(),

            updated_at:
                new Date()
                    .toISOString()
        };


        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.profiles
                )
                .update(
                    changes
                )
                .eq(
                    "id",
                    userId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        updateLocalUser(
            userId,
            data || changes
        );


        renderAdminUsers();

        renderAdminOverview();


        await writeAdminActivity(
            "approve_user",
            {
                user_id:
                    userId
            }
        );


        showAdminToast(
            "User approved.",
            "success"
        );


        return true;

    } catch (error) {

        /*
         * Some older profiles tables may not contain
         * all approval columns. Retry with a smaller
         * payload.
         */

        try {

            const {
                data,
                error: retryError
            } =
                await client
                    .from(
                        ADMIN_CONFIG.tables.profiles
                    )
                    .update({
                        active:
                            true,

                        status:
                            "active",

                        updated_at:
                            new Date()
                                .toISOString()
                    })
                    .eq(
                        "id",
                        userId
                    )
                    .select()
                    .single();


            if (retryError) {
                throw retryError;
            }


            updateLocalUser(
                userId,
                data
            );


            renderAdminUsers();

            renderAdminOverview();


            await writeAdminActivity(
                "approve_user",
                {
                    user_id:
                        userId
                }
            );


            showAdminToast(
                "User approved.",
                "success"
            );


            return true;

        } catch (retryError) {

            console.error(
                "Approve user failed:",
                error,
                retryError
            );


            showAdminToast(
                retryError?.message ||
                "Could not approve user.",
                "error"
            );


            return false;
        }
    }
}


/* ============================================================
   KICK USER
============================================================ */

async function kickUser(
    userId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!userId) {
        return false;
    }


    if (
        String(
            adminState.currentUser?.id
        ) ===
        String(
            userId
        )
    ) {

        showAdminToast(
            "You cannot kick your own account.",
            "error"
        );

        return false;
    }


    const confirmed =
        window.confirm(
            "Kick this user and prevent them from working?"
        );


    if (!confirmed) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return false;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.profiles
                )
                .update({
                    active:
                        false,

                    status:
                        "kicked",

                    approval_status:
                        "kicked",

                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    userId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        updateLocalUser(
            userId,
            data
        );


        /*
         * Return any currently assigned tasks
         * owned by this user to available state.
         */

        await releaseTasksForUser(
            userId
        );


        renderAdminUsers();

        renderAdminTasks();

        renderAdminOverview();


        await writeAdminActivity(
            "kick_user",
            {
                user_id:
                    userId
            }
        );


        showAdminToast(
            "User kicked.",
            "success"
        );


        return true;

    } catch (error) {

        /*
         * Compatibility fallback for profiles
         * that only have active.
         */

        try {

            const {
                data,
                error: retryError
            } =
                await client
                    .from(
                        ADMIN_CONFIG.tables.profiles
                    )
                    .update({
                        active:
                            false,

                        updated_at:
                            new Date()
                                .toISOString()
                    })
                    .eq(
                        "id",
                        userId
                    )
                    .select()
                    .single();


            if (retryError) {
                throw retryError;
            }


            updateLocalUser(
                userId,
                data
            );


            renderAdminUsers();


            showAdminToast(
                "User access disabled.",
                "success"
            );


            return true;

        } catch (retryError) {

            console.error(
                "Kick user failed:",
                error,
                retryError
            );


            showAdminToast(
                retryError?.message ||
                "Could not kick user.",
                "error"
            );


            return false;
        }
    }
}


/* ============================================================
   ENABLE / RESTORE USER
============================================================ */

async function enableUser(
    userId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!userId) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return false;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.profiles
                )
                .update({
                    active:
                        true,

                    status:
                        "active",

                    approval_status:
                        "approved",

                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    userId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        updateLocalUser(
            userId,
            data
        );


        renderAdminUsers();

        renderAdminOverview();


        await writeAdminActivity(
            "enable_user",
            {
                user_id:
                    userId
            }
        );


        showAdminToast(
            "User enabled.",
            "success"
        );


        return true;

    } catch (error) {

        console.error(
            "Enable user failed:",
            error
        );


        showAdminToast(
            error?.message ||
            "Could not enable user.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   DISABLE USER
============================================================ */

async function disableUser(
    userId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!userId) {
        return false;
    }


    if (
        String(
            adminState.currentUser?.id
        ) ===
        String(
            userId
        )
    ) {

        showAdminToast(
            "You cannot disable your own account.",
            "error"
        );

        return false;
    }


    const confirmed =
        window.confirm(
            "Disable this user?"
        );


    if (!confirmed) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return false;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.profiles
                )
                .update({
                    active:
                        false,

                    status:
                        "disabled",

                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    userId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        updateLocalUser(
            userId,
            data
        );


        await releaseTasksForUser(
            userId
        );


        renderAdminUsers();

        renderAdminTasks();

        renderAdminOverview();


        await writeAdminActivity(
            "disable_user",
            {
                user_id:
                    userId
            }
        );


        showAdminToast(
            "User disabled.",
            "success"
        );


        return true;

    } catch (error) {

        console.error(
            "Disable user failed:",
            error
        );


        showAdminToast(
            error?.message ||
            "Could not disable user.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   RELEASE USER TASKS
============================================================ */

async function releaseTasksForUser(
    userId
) {

    const client =
        getSupabaseClient();


    if (
        !client ||
        !userId
    ) {
        return;
    }


    try {

        await client
            .from(
                ADMIN_CONFIG.tables.tasks
            )
            .update({
                status:
                    "available",

                claimed_by:
                    null,

                claimed_at:
                    null,

                assigned_to:
                    null,

                assigned_at:
                    null,

                updated_at:
                    new Date()
                        .toISOString()
            })
            .or(
                `claimed_by.eq.${userId},assigned_to.eq.${userId}`
            );

    } catch (error) {

        console.warn(
            "Could not release user's tasks:",
            error
        );
    }
}


/* ============================================================
   UPDATE USER ROLE
============================================================ */

async function updateUserRole(
    userId,
    newRole
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!userId) {
        return false;
    }


    newRole =
        normalizeRole(
            newRole
        );


    if (
        !ADMIN_CONFIG.roles.includes(
            newRole
        )
    ) {

        showAdminToast(
            "Invalid role.",
            "error"
        );

        return false;
    }


    if (
        String(
            adminState.currentUser?.id
        ) ===
        String(
            userId
        ) &&
        !isAdminRole(
            newRole
        )
    ) {

        showAdminToast(
            "You cannot remove your own admin role.",
            "error"
        );

        return false;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return false;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.profiles
                )
                .update({
                    role:
                        newRole,

                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    userId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        updateLocalUser(
            userId,
            data
        );


        renderAdminUsers();

        renderAdminCoworkers();

        renderAdminOverview();


        await writeAdminActivity(
            "change_role",
            {
                user_id:
                    userId,

                role:
                    newRole
            }
        );


        showAdminToast(
            `Role changed to ${roleLabel(newRole)}.`,
            "success"
        );


        return true;

    } catch (error) {

        console.error(
            "Role update failed:",
            error
        );


        showAdminToast(
            error?.message ||
            "Could not update user role.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   CREATE / ASSIGN COWORKER
============================================================ */

async function createCoworker(
    userId,
    coworkerRole =
        "coworker_2d_box"
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!userId) {
        return false;
    }


    coworkerRole =
        normalizeRole(
            coworkerRole
        );


    if (
        !isCoworkerRole(
            coworkerRole
        )
    ) {

        coworkerRole =
            "coworker_2d_box";
    }


    const roleUpdated =
        await updateUserRole(
            userId,
            coworkerRole
        );


    if (!roleUpdated) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (
        client &&
        adminState.optionalTables.coworkers
    ) {

        try {

            const {
                data,
                error
            } =
                await client
                    .from(
                        ADMIN_CONFIG.tables.coworkers
                    )
                    .insert({
                        user_id:
                            userId,

                        role:
                            coworkerRole,

                        work_role:
                            coworkerRole,

                        status:
                            "active",

                        created_by:
                            adminState.currentUser?.id ||
                            null,

                        created_at:
                            new Date()
                                .toISOString()
                    })
                    .select()
                    .single();


            if (!error && data) {

                adminState.coworkers.unshift(
                    data
                );
            }

        } catch (error) {

            console.info(
                "Dedicated coworkers table unavailable:",
                error
            );
        }
    }


    renderAdminCoworkers();


    await writeAdminActivity(
        "create_coworker",
        {
            user_id:
                userId,

            role:
                coworkerRole
        }
    );


    return true;
}


/* ============================================================
   REMOVE COWORKER
============================================================ */

async function removeCoworker(
    userId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (!userId) {
        return false;
    }


    const confirmed =
        window.confirm(
            "Remove this coworker role?"
        );


    if (!confirmed) {
        return false;
    }


    const result =
        await updateUserRole(
            userId,
            "customer"
        );


    if (!result) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (
        client &&
        adminState.optionalTables.coworkers
    ) {

        try {

            await client
                .from(
                    ADMIN_CONFIG.tables.coworkers
                )
                .delete()
                .eq(
                    "user_id",
                    userId
                );

        } catch {
            /* optional table */
        }
    }


    adminState.coworkers =
        adminState.coworkers.filter(
            coworker =>
                String(
                    coworker.user_id ||
                    coworker.id
                ) !==
                String(
                    userId
                )
        );


    renderAdminCoworkers();


    await writeAdminActivity(
        "remove_coworker",
        {
            user_id:
                userId
        }
    );


    return true;
}


/* ============================================================
   ASSIGN TASK
============================================================ */

async function assignTask(
    taskId,
    userId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    if (
        !taskId ||
        !userId
    ) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (!client) {
        return false;
    }


    const user =
        adminState.users.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    userId
                )
        );


    const role =
        normalizeRole(
            user?.role
        );


    const task =
        adminState.tasks.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    taskId
                )
        );


    const workRole =
        task?.work_role ||
        roleForWorkType(
            task?.work_type ||
            task?.shape ||
            task?.task_type
        );


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.tasks
                )
                .update({

                    assigned_to:
                        userId,

                    assigned_role:
                        role ||
                        null,

                    work_role:
                        workRole ||
                        null,

                    claimed_by:
                        userId,

                    claimed_at:
                        new Date()
                            .toISOString(),

                    status:
                        "in_progress",

                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    taskId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        replaceLocalTask(
            data
        );


        renderAdminTasks();

        renderAdminOverview();


        await writeAdminActivity(
            "assign_task",
            {
                task_id:
                    taskId,

                user_id:
                    userId,

                role
            }
        );


        showAdminToast(
            "Task assigned.",
            "success"
        );


        return true;

    } catch (error) {

        console.error(
            "Assign task failed:",
            error
        );


        showAdminToast(
            error?.message ||
            "Could not assign task.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   REASSIGN TASK
============================================================ */

async function reassignTask(
    taskId,
    userId
) {

    return assignTask(
        taskId,
        userId
    );
}


/* ============================================================
   UNASSIGN TASK
============================================================ */

async function unassignTask(
    taskId
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (
        !client ||
        !taskId
    ) {
        return false;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.tasks
                )
                .update({
                    assigned_to:
                        null,

                    assigned_role:
                        null,

                    claimed_by:
                        null,

                    claimed_at:
                        null,

                    status:
                        "available",

                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    taskId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        replaceLocalTask(
            data
        );


        renderAdminTasks();

        renderAdminOverview();


        await writeAdminActivity(
            "unassign_task",
            {
                task_id:
                    taskId
            }
        );


        showAdminToast(
            "Task returned to available work.",
            "success"
        );


        return true;

    } catch (error) {

        console.error(
            "Unassign task failed:",
            error
        );


        showAdminToast(
            "Could not unassign task.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   REPLACE LOCAL TASK
============================================================ */

function replaceLocalTask(
    task
) {

    if (!task) {
        return;
    }


    const index =
        adminState.tasks.findIndex(
            item =>
                String(
                    item.id
                ) ===
                String(
                    task.id
                )
        );


    if (index < 0) {

        adminState.tasks.unshift(
            task
        );

        return;
    }


    adminState.tasks[index] =
        {
            ...adminState.tasks[index],
            ...task
        };
}


/* ============================================================
   TASK ACTION
============================================================ */

async function handleTaskAction(
    action,
    taskId
) {

    switch (action) {

        case "delete":
            await deleteAdminTask(
                taskId
            );
            break;


        case "close":
            await updateAdminTask(
                taskId,
                {
                    status:
                        "closed"
                }
            );
            break;


        case "open":
            await updateAdminTask(
                taskId,
                {
                    status:
                        "available",

                    claimed_by:
                        null,

                    claimed_at:
                        null,

                    assigned_to:
                        null
                }
            );
            break;


        case "approve":
            await updateAdminTask(
                taskId,
                {
                    status:
                        "approved",

                    approved_by:
                        adminState.currentUser?.id ||
                        null,

                    approved_at:
                        new Date()
                            .toISOString()
                }
            );
            break;


        case "unassign":
            await unassignTask(
                taskId
            );
            break;
    }
}


/* ============================================================
   USER ACTION
============================================================ */

async function handleUserAction(
    action,
    userId
) {

    switch (action) {

        case "approve":
            await approveUser(
                userId
            );
            break;


        case "kick":
            await kickUser(
                userId
            );
            break;


        case "disable":
            await disableUser(
                userId
            );
            break;


        case "enable":
            await enableUser(
                userId
            );
            break;
    }
}


/* ============================================================
   ROLE CHANGE
============================================================ */

async function handleRoleChange(
    select
) {

    if (!select) {
        return;
    }


    await updateUserRole(
        select.dataset.userId,
        select.value
    );
}


/* ============================================================
   ADMIN ACTIVITY
============================================================ */

async function writeAdminActivity(
    action,
    payload = {}
) {

    const client =
        getSupabaseClient();


    const user =
        adminState.currentUser;


    /*
     * Prefer central activity logger.
     */

    try {

        if (
            typeof logActivity ===
            "function"
        ) {

            await logActivity(
                action,
                payload
            );

            return;
        }

    } catch (error) {

        console.info(
            "Central activity logger failed:",
            error
        );
    }


    if (
        !client ||
        !adminState.optionalTables.activity
    ) {
        return;
    }


    try {

        const record = {

            action,

            user_id:
                user?.id ||
                null,

            email:
                user?.email ||
                null,

            details:
                payload,

            created_at:
                new Date()
                    .toISOString()
        };


        const {
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.activity
                )
                .insert(
                    record
                );


        if (error) {

            if (
                isMissingTableError(
                    error
                )
            ) {

                adminState.optionalTables.activity =
                    false;
            }

            return;
        }


        adminState.activity.unshift(
            record
        );


        adminState.activity =
            adminState.activity.slice(
                0,
                500
            );


        renderAdminActivity();

    } catch (error) {

        console.info(
            "Activity logging skipped:",
            error
        );
    }
}


/* ============================================================
   RENDER OVERVIEW
============================================================ */

function renderAdminOverview() {

    const totalUsers =
        adminState.users.length;


    const activeUsers =
        adminState.users.filter(
            user =>
                user.active === true ||
                String(
                    user.status
                ).toLowerCase() ===
                    "active"
        ).length;


    const pendingUsers =
        adminState.users.filter(
            user =>
                user.active === false &&
                (
                    !user.status ||
                    [
                        "pending",
                        "inactive",
                        "waiting"
                    ].includes(
                        String(
                            user.status
                        ).toLowerCase()
                    )
                )
        ).length;


    const totalTasks =
        adminState.tasks.length;


    const availableTasks =
        adminState.tasks.filter(
            task =>
                String(
                    task.status ||
                    ""
                ).toLowerCase() ===
                "available"
        ).length;


    const progressTasks =
        adminState.tasks.filter(
            task =>
                [
                    "in_progress",
                    "claimed",
                    "working",
                    "submitted",
                    "review"
                ].includes(
                    String(
                        task.status ||
                        ""
                    ).toLowerCase()
                )
        ).length;


    const completedTasks =
        adminState.tasks.filter(
            task =>
                [
                    "completed",
                    "approved",
                    "paid"
                ].includes(
                    String(
                        task.status ||
                        ""
                    ).toLowerCase()
                )
        ).length;


    setText(
        "adminTotalUsers",
        totalUsers
    );

    setText(
        "adminActiveUsers",
        activeUsers
    );

    setText(
        "adminPendingUsers",
        pendingUsers
    );

    setText(
        "adminTotalTasks",
        totalTasks
    );

    setText(
        "adminAvailableTasks",
        availableTasks
    );

    setText(
        "adminProgressTasks",
        progressTasks
    );

    setText(
        "adminCompletedTasks",
        completedTasks
    );
}


/* ============================================================
   SET TEXT
============================================================ */

function setText(
    id,
    value
) {

    const element =
        $(id);


    if (element) {
        element.textContent =
            String(
                value ??
                0
            );
    }
}


/* ============================================================
   RENDER TASKS
============================================================ */

function renderAdminTasks() {

    if (!adminTasksList) {
        return;
    }


    if (
        !adminState.tasks.length
    ) {

        adminTasksList.innerHTML = `
            <div class="details-empty">
                <strong>No tasks found</strong>
                <span>Create a task to see it here.</span>
            </div>
        `;

        return;
    }


    adminTasksList.innerHTML =
        adminState.tasks
            .map(
                task => {

                    const id =
                        escapeHTML(
                            task.id
                        );


                    const title =
                        escapeHTML(
                            task.title ||
                            task.name ||
                            "Untitled task"
                        );


                    const type =
                        escapeHTML(
                            task.work_type ||
                            task.shape ||
                            task.task_type ||
                            task.type ||
                            "—"
                        );


                    const role =
                        normalizeRole(
                            task.work_role ||
                            task.assigned_role
                        );


                    const status =
                        String(
                            task.status ||
                            "available"
                        );


                    const duration =
                        task.duration ??
                        task.estimated_minutes ??
                        "—";


                    const pay =
                        formatMoney(
                            task.pay ??
                            task.reward ??
                            0
                        );


                    const assignedTo =
                        adminState.users.find(
                            user =>
                                String(
                                    user.id
                                ) ===
                                String(
                                    task.assigned_to ||
                                    task.claimed_by
                                )
                        );


                    const assignedName =
                        assignedTo
                            ? escapeHTML(
                                assignedTo.full_name ||
                                assignedTo.name ||
                                assignedTo.email ||
                                "Assigned user"
                            )
                            : "Unassigned";


                    const statusLower =
                        status.toLowerCase();


                    return `
                        <div
                            class="admin-list-row admin-task-row"
                            data-task-id="${id}"
                        >

                            <div class="admin-list-main">

                                <strong>
                                    ${title}
                                </strong>

                                <small>
                                    ${type}
                                    ·
                                    ${role
                                        ? escapeHTML(
                                            roleLabel(
                                                role
                                            )
                                        )
                                        : "Unassigned role"
                                    }
                                    ·
                                    ${escapeHTML(
                                        String(
                                            duration
                                        )
                                    )} min
                                </small>

                            </div>


                            <div class="admin-list-meta">

                                <strong>
                                    ${pay}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        status
                                    )}
                                </span>

                                <small>
                                    ${assignedName}
                                </small>

                            </div>


                            <div class="admin-list-actions">

                                ${
                                    statusLower ===
                                    "available"
                                        ? `
                                            <button
                                                type="button"
                                                data-admin-task-action="close"
                                                data-task-id="${id}"
                                            >
                                                Close
                                            </button>
                                        `
                                        : `
                                            <button
                                                type="button"
                                                data-admin-task-action="open"
                                                data-task-id="${id}"
                                            >
                                                Open
                                            </button>
                                        `
                                }


                                ${
                                    task.assigned_to ||
                                    task.claimed_by
                                        ? `
                                            <button
                                                type="button"
                                                data-admin-task-action="unassign"
                                                data-task-id="${id}"
                                            >
                                                Unassign
                                            </button>
                                        `
                                        : ""
                                }


                                ${
                                    [
                                        "submitted",
                                        "review",
                                        "pending_review"
                                    ].includes(
                                        statusLower
                                    )
                                        ? `
                                            <button
                                                type="button"
                                                data-admin-task-action="approve"
                                                data-task-id="${id}"
                                            >
                                                Approve
                                            </button>
                                        `
                                        : ""
                                }


                                <button
                                    type="button"
                                    data-admin-task-action="delete"
                                    data-task-id="${id}"
                                >
                                    Delete
                                </button>

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* ============================================================
   USER STATUS
============================================================ */

function getUserAccessStatus(
    user
) {

    const status =
        String(
            user?.status ||
            ""
        )
            .toLowerCase();


    if (
        status ===
        "kicked"
    ) {
        return "Kicked";
    }


    if (
        status ===
        "disabled"
    ) {
        return "Disabled";
    }


    if (
        user?.active === false ||
        [
            "pending",
            "inactive",
            "waiting"
        ].includes(
            status
        )
    ) {
        return "Pending approval";
    }


    return "Active";
}


/* ============================================================
   RENDER USERS
============================================================ */

function renderAdminUsers() {

    if (!adminUsersList) {
        return;
    }


    if (
        !adminState.users.length
    ) {

        adminUsersList.innerHTML = `
            <div class="details-empty">
                <strong>No users found</strong>
                <span>User profiles will appear here.</span>
            </div>
        `;

        return;
    }


    adminUsersList.innerHTML =
        adminState.users
            .map(
                user => {

                    const id =
                        escapeHTML(
                            user.id
                        );


                    const name =
                        escapeHTML(
                            user.full_name ||
                            user.name ||
                            user.display_name ||
                            user.screen_name ||
                            "User"
                        );


                    const email =
                        escapeHTML(
                            user.email ||
                            user.email_address ||
                            "No email"
                        );


                    const role =
                        normalizeRole(
                            user.role
                        ) ||
                        "customer";


                    const accessStatus =
                        getUserAccessStatus(
                            user
                        );


                    const isSelf =
                        String(
                            adminState.currentUser?.id
                        ) ===
                        String(
                            user.id
                        );


                    const pending =
                        accessStatus ===
                        "Pending approval";


                    const kicked =
                        accessStatus ===
                        "Kicked";


                    const disabled =
                        accessStatus ===
                        "Disabled";


                    return `
                        <div
                            class="admin-list-row admin-user-row"
                            data-user-id="${id}"
                        >

                            <div class="admin-list-main">

                                <strong>
                                    ${name}
                                </strong>

                                <small>
                                    ${email}
                                </small>

                            </div>


                            <div class="admin-user-role">

                                <select
                                    data-user-role
                                    data-user-id="${id}"
                                    ${
                                        isSelf
                                            ? "disabled"
                                            : ""
                                    }
                                >

                                    ${
                                        ADMIN_CONFIG.roles
                                            .map(
                                                option => `
                                                    <option
                                                        value="${escapeHTML(option)}"
                                                        ${
                                                            option ===
                                                            role
                                                                ? "selected"
                                                                : ""
                                                        }
                                                    >
                                                        ${escapeHTML(
                                                            roleLabel(
                                                                option
                                                            )
                                                        )}
                                                    </option>
                                                `
                                            )
                                            .join("")
                                    }

                                </select>

                            </div>


                            <div class="admin-list-meta">

                                <span>
                                    ${escapeHTML(
                                        accessStatus
                                    )}
                                </span>

                                <small>
                                    Joined:
                                    ${formatDate(
                                        user.created_at
                                    )}
                                </small>

                                <small>
                                    Last login:
                                    ${formatDate(
                                        user.last_login_at ||
                                        user.last_sign_in_at ||
                                        user.last_login
                                    )}
                                </small>

                                <small>
                                    Last logout:
                                    ${formatDate(
                                        user.last_logout_at ||
                                        user.logout_at
                                    )}
                                </small>

                            </div>


                            <div class="admin-list-actions">

                                ${
                                    pending ||
                                    kicked ||
                                    disabled
                                        ? `
                                            <button
                                                type="button"
                                                data-user-action="approve"
                                                data-user-id="${id}"
                                            >
                                                Approve
                                            </button>
                                        `
                                        : ""
                                }


                                ${
                                    !isSelf &&
                                    !disabled &&
                                    !kicked
                                        ? `
                                            <button
                                                type="button"
                                                data-user-action="kick"
                                                data-user-id="${id}"
                                            >
                                                Kick
                                            </button>
                                        `
                                        : ""
                                }


                                ${
                                    !isSelf &&
                                    !disabled &&
                                    !kicked
                                        ? `
                                            <button
                                                type="button"
                                                data-user-action="disable"
                                                data-user-id="${id}"
                                            >
                                                Disable
                                            </button>
                                        `
                                        : ""
                                }


                                ${
                                    !isSelf &&
                                    (
                                        disabled ||
                                        kicked
                                    )
                                        ? `
                                            <button
                                                type="button"
                                                data-user-action="enable"
                                                data-user-id="${id}"
                                            >
                                                Restore
                                            </button>
                                        `
                                        : ""
                                }

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* ============================================================
   RENDER COWORKERS
============================================================ */

function renderAdminCoworkers() {

    if (!adminCoworkersList) {
        return;
    }


    const coworkers =
        adminState.users.filter(
            user =>
                isCoworkerRole(
                    normalizeRole(
                        user.role
                    )
                )
        );


    if (
        !coworkers.length
    ) {

        adminCoworkersList.innerHTML = `
            <div class="details-empty">
                <strong>No coworkers found</strong>
                <span>Assign a coworker role to a user.</span>
            </div>
        `;

        return;
    }


    adminCoworkersList.innerHTML =
        coworkers
            .map(
                user => {

                    const id =
                        escapeHTML(
                            user.id
                        );


                    const name =
                        escapeHTML(
                            user.full_name ||
                            user.name ||
                            user.display_name ||
                            "Coworker"
                        );


                    const email =
                        escapeHTML(
                            user.email ||
                            "No email"
                        );


                    const role =
                        normalizeRole(
                            user.role
                        );


                    return `
                        <div
                            class="admin-list-row"
                            data-coworker-id="${id}"
                        >

                            <div class="admin-list-main">

                                <strong>
                                    ${name}
                                </strong>

                                <small>
                                    ${email}
                                </small>

                            </div>


                            <div class="admin-list-meta">

                                <strong>
                                    ${escapeHTML(
                                        roleLabel(
                                            role
                                        )
                                    )}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        getUserAccessStatus(
                                            user
                                        )
                                    )}
                                </span>

                            </div>


                            <div class="admin-list-actions">

                                <button
                                    type="button"
                                    data-coworker-action="remove"
                                    data-user-id="${id}"
                                >
                                    Remove
                                </button>

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* ============================================================
   RENDER PAYMENTS
============================================================ */

function renderAdminPayments() {

    if (!paymentsList) {
        return;
    }


    if (
        !adminState.payments.length
    ) {

        paymentsList.innerHTML = `
            <div class="details-empty">
                <strong>No payment records</strong>
                <span>Payment records will appear here.</span>
            </div>
        `;

        return;
    }


    paymentsList.innerHTML =
        adminState.payments
            .map(
                payment => {

                    const id =
                        escapeHTML(
                            payment.id
                        );


                    const user =
                        adminState.users.find(
                            item =>
                                String(
                                    item.id
                                ) ===
                                String(
                                    payment.user_id
                                )
                        );


                    const name =
                        escapeHTML(
                            payment.email ||
                            payment.user_email ||
                            user?.full_name ||
                            user?.email ||
                            payment.user_id ||
                            "User"
                        );


                    const amount =
                        formatMoney(
                            payment.amount ??
                            payment.total ??
                            payment.pay ??
                            0
                        );


                    const status =
                        String(
                            payment.status ||
                            "pending"
                        );


                    const paid =
                        [
                            "paid",
                            "completed",
                            "released"
                        ].includes(
                            status.toLowerCase()
                        );


                    return `
                        <div
                            class="admin-list-row"
                            data-payment-id="${id}"
                        >

                            <div class="admin-list-main">

                                <strong>
                                    ${name}
                                </strong>

                                <small>
                                    ${formatDate(
                                        payment.created_at
                                    )}
                                </small>

                            </div>


                            <div class="admin-list-meta">

                                <strong>
                                    ${amount}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        status
                                    )}
                                </span>

                            </div>


                            <div class="admin-list-actions">

                                ${
                                    paid
                                        ? `
                                            <button
                                                type="button"
                                                data-payment-action="unpaid"
                                                data-payment-id="${id}"
                                            >
                                                Mark unpaid
                                            </button>
                                        `
                                        : `
                                            <button
                                                type="button"
                                                data-payment-action="paid"
                                                data-payment-id="${id}"
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


/* ============================================================
   UPDATE PAYMENT STATUS
============================================================ */

async function updatePaymentStatus(
    paymentId,
    status
) {

    if (
        !await requireAdmin()
    ) {
        return false;
    }


    const client =
        getSupabaseClient();


    if (
        !client ||
        !paymentId
    ) {
        return false;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.tables.payments
                )
                .update({
                    status,

                    paid:
                        status === "paid",

                    paid_by:
                        adminState.currentUser?.id ||
                        null,

                    paid_at:
                        status === "paid"
                            ? new Date()
                                .toISOString()
                            : null,

                    updated_at:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    paymentId
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        const index =
            adminState.payments.findIndex(
                payment =>
                    String(
                        payment.id
                    ) ===
                    String(
                        paymentId
                    )
            );


        if (index >= 0) {

            adminState.payments[index] =
                {
                    ...adminState.payments[index],
                    ...data
                };
        }


        renderAdminPayments();


        await writeAdminActivity(
            "payment_status",
            {
                payment_id:
                    paymentId,

                status
            }
        );


        showAdminToast(
            status === "paid"
                ? "Payment marked as paid."
                : "Payment marked as unpaid.",
            "success"
        );


        return true;

    } catch (error) {

        console.error(
            "Payment update failed:",
            error
        );


        showAdminToast(
            error?.message ||
            "Could not update payment.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   RENDER PAY RATES
============================================================ */

function renderAdminPayRates() {

    if (!payRatesList) {
        return;
    }


    if (
        !adminState.payRates.length
    ) {

        payRatesList.innerHTML = `
            <div class="details-empty">
                <strong>No pay rates configured</strong>
                <span>Add pay-rate records in the pay_rates table.</span>
            </div>
        `;

        return;
    }


    payRatesList.innerHTML =
        adminState.payRates
            .map(
                rate => {

                    const role =
                        normalizeRole(
                            rate.role ||
                            rate.work_role
                        );


                    const workType =
                        rate.work_type ||
                        rate.task_type ||
                        rate.shape ||
                        "all";


                    const amount =
                        formatMoney(
                            rate.rate ??
                            rate.amount ??
                            rate.pay ??
                            rate.price ??
                            0
                        );


                    return `
                        <div class="admin-list-row">

                            <div class="admin-list-main">

                                <strong>
                                    ${escapeHTML(
                                        roleLabel(
                                            role
                                        )
                                    )}
                                </strong>

                                <small>
                                    ${escapeHTML(
                                        workType
                                    )}
                                </small>

                            </div>


                            <div class="admin-list-meta">

                                <strong>
                                    ${amount}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        rate.unit ||
                                        "per task"
                                    )}
                                </span>

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* ============================================================
   RENDER ACTIVITY
============================================================ */

function renderAdminActivity() {

    if (!activityList) {
        return;
    }


    if (
        !adminState.activity.length
    ) {

        activityList.innerHTML = `
            <div class="details-empty">
                <strong>No activity records</strong>
                <span>Activity will appear here.</span>
            </div>
        `;

        return;
    }


    activityList.innerHTML =
        adminState.activity
            .map(
                activity => {

                    const action =
                        escapeHTML(
                            activity.action ||
                            activity.event ||
                            activity.type ||
                            "Activity"
                        );


                    const email =
                        escapeHTML(
                            activity.email ||
                            activity.user_email ||
                            activity.user_id ||
                            "System"
                        );


                    const details =
                        escapeHTML(
                            activity.description ||
                            activity.message ||
                            (
                                activity.details
                                    ? JSON.stringify(
                                        activity.details
                                    )
                                    : ""
                            )
                        );


                    return `
                        <div class="admin-list-row">

                            <div class="admin-list-main">

                                <strong>
                                    ${action}
                                </strong>

                                <small>
                                    ${email}
                                </small>

                            </div>


                            ${
                                details
                                    ? `
                                        <div class="admin-list-meta">
                                            ${details}
                                        </div>
                                    `
                                    : ""
                            }


                            <div class="admin-list-meta">

                                ${formatDate(
                                    activity.created_at ||
                                    activity.timestamp
                                )}

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* ============================================================
   ADMIN TAB
============================================================ */

function activateAdminTab(
    tab
) {

    if (!tab) {
        tab =
            "overview";
    }


    adminState.activeTab =
        tab;


    document
        .querySelectorAll(
            "[data-admin-tab]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.adminTab ===
                        tab
                );

                button.setAttribute(
                    "aria-selected",
                    button.dataset.adminTab ===
                        tab
                        ? "true"
                        : "false"
                );
            }
        );


    document
        .querySelectorAll(
            "[data-admin-page]"
        )
        .forEach(
            page => {

                const visible =
                    page.dataset.adminPage ===
                    tab;


                page.style.display =
                    visible
                        ? ""
                        : "none";


                page.classList.toggle(
                    "active",
                    visible
                );
            }
        );


    document
        .querySelectorAll(
            "[data-admin-panel]"
        )
        .forEach(
            panel => {

                const visible =
                    panel.dataset.adminPanel ===
                    tab;


                panel.style.display =
                    visible
                        ? ""
                        : "none";
            }
        );


    if (adminContent) {

        adminContent.dataset.activePage =
            tab;
    }
}


/* ============================================================
   BIND ADMIN EVENTS
============================================================ */

function bindAdminEvents() {

    if (
        adminState.initialized
    ) {
        return;
    }


    adminState.initialized =
        true;


    cacheDOM();


    /*
     * Open.
     */

    adminCenterButton?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await openAdminCenter();
        }
    );


    /*
     * Close.
     */

    closeAdminModalButton?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            closeAdminCenter();
        }
    );


    /*
     * Click outside.
     */

    adminModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                adminModal
            ) {

                closeAdminCenter();
            }
        }
    );


    /*
     * Escape.
     */

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


    /*
     * Create task.
     */

    createTaskButton?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await createAdminTask();
        }
    );


    /*
     * Task actions.
     */

    adminTasksList?.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-admin-task-action]"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            await handleTaskAction(
                button.dataset.adminTaskAction,
                button.dataset.taskId
            );
        }
    );


    /*
     * User role changes.
     */

    adminUsersList?.addEventListener(
        "change",
        async event => {

            const select =
                event.target.closest(
                    "[data-user-role]"
                );


            if (!select) {
                return;
            }


            await handleRoleChange(
                select
            );
        }
    );


    /*
     * User buttons.
     */

    adminUsersList?.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-user-action]"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            await handleUserAction(
                button.dataset.userAction,
                button.dataset.userId
            );
        }
    );


    /*
     * Coworker actions.
     */

    adminCoworkersList?.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-coworker-action]"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            if (
                button.dataset.coworkerAction ===
                "remove"
            ) {

                await removeCoworker(
                    button.dataset.userId
                );
            }
        }
    );


    /*
     * Payment actions.
     */

    paymentsList?.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-payment-action]"
                );


            if (!button) {
                return;
            }


            const status =
                button.dataset.paymentAction ===
                "paid"
                    ? "paid"
                    : "pending";


            await updatePaymentStatus(
                button.dataset.paymentId,
                status
            );
        }
    );


    /*
     * Admin tabs.
     */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "[data-admin-tab]"
                );


            if (!button) {
                return;
            }


            /*
             * Only process tabs while Admin Center
             * is open.
             */

            if (
                !adminState.open
            ) {
                return;
            }


            event.preventDefault();


            activateAdminTab(
                button.dataset.adminTab
            );
        }
    );


    /*
     * CSV.
     */

    copyAdminCSV?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await exportAdminCSV();
        }
    );


    /*
     * HTML.
     */

    downloadAdminHTML?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await exportAdminHTML();
        }
    );


    /*
     * Refresh users.
     */

    $("refreshUsersButton")
        ?.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                await loadAdminUsers();

                await loadAdminCoworkers();

                renderAdminUsers();

                renderAdminCoworkers();

                renderAdminOverview();
            }
        );


    /*
     * Refresh Admin Center if an external module
     * requests it.
     */

    window.addEventListener(
        "admin:refresh",
        async () => {

            if (
                adminState.open
            ) {

                await refreshAdminCenter();
            }
        }
    );
}


/* ============================================================
   ADMIN VISIBILITY
============================================================ */

async function updateAdminVisibility() {

    cacheDOM();


    const user =
        await getAdminUser();


    adminState.currentUser =
        user;


    const allowed =
        isAdminUser(
            user
        );


    if (adminCenterButton) {

        adminCenterButton.style.display =
            allowed
                ? ""
                : "none";

        adminCenterButton.hidden =
            !allowed;

        adminCenterButton.setAttribute(
            "aria-hidden",
            allowed
                ? "false"
                : "true"
        );
    }


    /*
     * Never render admin email here.
     */
}


/* ============================================================
   INITIALIZE
============================================================ */

async function initializeAdmin() {

    cacheDOM();


    bindAdminEvents();


    await updateAdminVisibility();


    /*
     * Auth changes.
     */

    window.addEventListener(
        "auth:changed",
        async () => {

            await updateAdminVisibility();

            if (
                !isAdminUser()
            ) {
                closeAdminCenter();
            }
        }
    );


    window.addEventListener(
        "authChanged",
        async () => {

            await updateAdminVisibility();

            if (
                !isAdminUser()
            ) {
                closeAdminCenter();
            }
        }
    );


    return true;
}


/* ============================================================
   CSV ESCAPE
============================================================ */

function csvEscape(
    value
) {

    const string =
        String(
            value ?? ""
        );


    return `"${string.replaceAll(
        '"',
        '""'
    )}"`;
}


/* ============================================================
   ARRAY TO CSV
============================================================ */

function arrayToCSV(
    rows
) {

    if (
        !Array.isArray(
            rows
        ) ||
        !rows.length
    ) {
        return "";
    }


    const keys =
        [
            ...new Set(
                rows.flatMap(
                    row =>
                        Object.keys(
                            row ||
                            {}
                        )
                )
            )
        ];


    const header =
        keys
            .map(
                csvEscape
            )
            .join(",");


    const body =
        rows
            .map(
                row =>
                    keys
                        .map(
                            key => {

                                const value =
                                    row?.[
                                        key
                                    ];


                                if (
                                    value &&
                                    typeof value ===
                                    "object"
                                ) {

                                    return csvEscape(
                                        JSON.stringify(
                                            value
                                        )
                                    );
                                }


                                return csvEscape(
                                    value
                                );
                            }
                        )
                        .join(",")
            )
            .join("\n");


    return (
        header +
        "\n" +
        body
    );
}


/* ============================================================
   BUILD EXPORT ROWS
============================================================ */

function buildAdminExportRows() {

    const rows = [];


    adminState.users.forEach(
        user => {

            rows.push({

                section:
                    "users",

                id:
                    user.id,

                name:
                    user.full_name ||
                    user.name ||
                    user.display_name ||
                    "",

                email:
                    user.email ||
                    "",

                role:
                    user.role ||
                    "",

                status:
                    getUserAccessStatus(
                        user
                    ),

                joined:
                    user.created_at ||
                    "",

                last_login:
                    user.last_login_at ||
                    user.last_sign_in_at ||
                    "",

                last_logout:
                    user.last_logout_at ||
                    "",

                active:
                    user.active
            });
        }
    );


    adminState.tasks.forEach(
        task => {

            rows.push({

                section:
                    "tasks",

                id:
                    task.id,

                title:
                    task.title ||
                    task.name ||
                    "",

                type:
                    task.work_type ||
                    task.shape ||
                    task.task_type ||
                    "",

                work_role:
                    task.work_role ||
                    "",

                duration:
                    task.duration ??
                    task.estimated_minutes ??
                    "",

                pay:
                    task.pay ??
                    task.reward ??
                    "",

                status:
                    task.status ||
                    "",

                assigned_to:
                    task.assigned_to ||
                    task.claimed_by ||
                    "",

                created_at:
                    task.created_at ||
                    ""
            });
        }
    );


    adminState.coworkers.forEach(
        coworker => {

            rows.push({

                section:
                    "coworkers",

                id:
                    coworker.id,

                user_id:
                    coworker.user_id ||
                    coworker.id ||
                    "",

                role:
                    coworker.role ||
                    "",

                status:
                    coworker.status ||
                    "",

                created_at:
                    coworker.created_at ||
                    ""
            });
        }
    );


    adminState.payments.forEach(
        payment => {

            rows.push({

                section:
                    "payments",

                id:
                    payment.id,

                user_id:
                    payment.user_id ||
                    "",

                amount:
                    payment.amount ??
                    payment.total ??
                    payment.pay ??
                    "",

                status:
                    payment.status ||
                    "",

                paid_at:
                    payment.paid_at ||
                    "",

                created_at:
                    payment.created_at ||
                    ""
            });
        }
    );


    adminState.activity.forEach(
        activity => {

            rows.push({

                section:
                    "activity",

                action:
                    activity.action ||
                    activity.event ||
                    "",

                user_id:
                    activity.user_id ||
                    "",

                email:
                    activity.email ||
                    activity.user_email ||
                    "",

                details:
                    activity.details ||
                    activity.description ||
                    "",

                created_at:
                    activity.created_at ||
                    activity.timestamp ||
                    ""
            });
        }
    );


    return rows;
}


/* ============================================================
   EXPORT CSV
============================================================ */

async function exportAdminCSV() {

    if (
        !await requireAdmin()
    ) {

        showAdminToast(
            "Administrator access is required.",
            "error"
        );

        return;
    }


    const rows =
        buildAdminExportRows();


    const csv =
        arrayToCSV(
            rows
        );


    if (!csv) {

        showAdminToast(
            "There is no admin data to export.",
            "info"
        );

        return;
    }


    try {

        if (
            navigator.clipboard?.writeText
        ) {

            await navigator.clipboard.writeText(
                csv
            );


            showAdminToast(
                "Admin CSV copied to clipboard.",
                "success"
            );


            return;
        }

    } catch {
        /* fallback */
    }


    downloadTextFile(
        "annotation-ai-admin.csv",
        csv,
        "text/csv;charset=utf-8"
    );


    showAdminToast(
        "CSV download started.",
        "success"
    );
}


/* ============================================================
   DOWNLOAD TEXT
============================================================ */

function downloadTextFile(
    filename,
    content,
    mime =
        "text/plain;charset=utf-8"
) {

    const blob =
        new Blob(
            [
                content
            ],
            {
                type:
                    mime
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
        filename;


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    window.setTimeout(
        () => {
            URL.revokeObjectURL(
                url
            );
        },
        1000
    );
}


/* ============================================================
   ADMIN HTML EXPORT
============================================================ */

async function exportAdminHTML() {

    if (
        !await requireAdmin()
    ) {

        showAdminToast(
            "Administrator access is required.",
            "error"
        );

        return;
    }


    const now =
        new Date()
            .toLocaleString();


    const usersHTML =
        adminState.users
            .map(
                user => `
                    <tr>

                        <td>
                            ${escapeHTML(
                                user.full_name ||
                                user.name ||
                                "User"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                user.email ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                roleLabel(
                                    normalizeRole(
                                        user.role
                                    )
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                getUserAccessStatus(
                                    user
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatDate(
                                    user.created_at
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatDate(
                                    user.last_login_at ||
                                    user.last_sign_in_at
                                )
                            )}
                        </td>

                    </tr>
                `
            )
            .join("");


    const tasksHTML =
        adminState.tasks
            .map(
                task => `
                    <tr>

                        <td>
                            ${escapeHTML(
                                task.title ||
                                task.name ||
                                "Task"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                task.work_type ||
                                task.shape ||
                                task.task_type ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                roleLabel(
                                    normalizeRole(
                                        task.work_role
                                    )
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                task.duration ??
                                task.estimated_minutes ??
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatMoney(
                                    task.pay ??
                                    task.reward ??
                                    0
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                task.status ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                task.assigned_to ||
                                task.claimed_by ||
                                "Unassigned"
                            )}
                        </td>

                    </tr>
                `
            )
            .join("");


    const paymentsHTML =
        adminState.payments
            .map(
                payment => `
                    <tr>

                        <td>
                            ${escapeHTML(
                                payment.email ||
                                payment.user_email ||
                                payment.user_id ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatMoney(
                                    payment.amount ??
                                    payment.total ??
                                    payment.pay ??
                                    0
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                payment.status ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatDate(
                                    payment.created_at
                                )
                            )}
                        </td>

                    </tr>
                `
            )
            .join("");


    const activityHTML =
        adminState.activity
            .map(
                activity => `
                    <tr>

                        <td>
                            ${escapeHTML(
                                activity.action ||
                                activity.event ||
                                activity.type ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                activity.email ||
                                activity.user_email ||
                                activity.user_id ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                activity.description ||
                                activity.message ||
                                (
                                    activity.details
                                        ? JSON.stringify(
                                            activity.details
                                        )
                                        : ""
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatDate(
                                    activity.created_at ||
                                    activity.timestamp
                                )
                            )}
                        </td>

                    </tr>
                `
            )
            .join("");


    const html =
`
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>
    Annotation AI - Admin Export
</title>

<style>

body {
    font-family:
        Arial,
        Helvetica,
        sans-serif;

    margin:
        30px;

    line-height:
        1.5;

    color:
        #111;
}

h1 {
    margin-bottom:
        5px;
}

h2 {
    margin-top:
        35px;
}

table {
    width:
        100%;

    border-collapse:
        collapse;

    margin-top:
        12px;
}

th,
td {
    border:
        1px solid #ccc;

    padding:
        8px;

    text-align:
        left;

    vertical-align:
        top;
}

th {
    font-weight:
        700;
}

.small {
    color:
        #666;

    font-size:
        13px;
}

</style>

</head>

<body>

<h1>
    Annotation AI Admin Export
</h1>

<div class="small">
    Generated:
    ${escapeHTML(now)}
</div>


<h2>
    Users
</h2>

<table>

<thead>

<tr>

<th>
    Name
</th>

<th>
    Email
</th>

<th>
    Role
</th>

<th>
    Status
</th>

<th>
    Joined
</th>

<th>
    Last Login
</th>

</tr>

</thead>

<tbody>

${usersHTML}

</tbody>

</table>


<h2>
    Tasks
</h2>

<table>

<thead>

<tr>

<th>
    Title
</th>

<th>
    Type
</th>

<th>
    Work Role
</th>

<th>
    Duration
</th>

<th>
    Pay
</th>

<th>
    Status
</th>

<th>
    Assigned To
</th>

</tr>

</thead>

<tbody>

${tasksHTML}

</tbody>

</table>


<h2>
    Payments
</h2>

<table>

<thead>

<tr>

<th>
    User
</th>

<th>
    Amount
</th>

<th>
    Status
</th>

<th>
    Date
</th>

</tr>

</thead>

<tbody>

${paymentsHTML}

</tbody>

</table>


<h2>
    Activity
</h2>

<table>

<thead>

<tr>

<th>
    Action
</th>

<th>
    User
</th>

<th>
    Details
</th>

<th>
    Date
</th>

</tr>

</thead>

<tbody>

${activityHTML}

</tbody>

</table>

</body>

</html>
`;


    downloadTextFile(
        "annotation-ai-admin.html",
        html,
        "text/html;charset=utf-8"
    );


    showAdminToast(
        "Admin HTML export downloaded.",
        "success"
    );
}


/* ============================================================
   PUBLIC API
============================================================ */

export {

    ADMIN_CONFIG,

    adminState,

    initializeAdmin,

    openAdminCenter,

    closeAdminCenter,

    refreshAdminCenter,

    createAdminTask,

    updateAdminTask,

    deleteAdminTask,

    approveUser,

    kickUser,

    disableUser,

    enableUser,

    updateUserRole,

    createCoworker,

    removeCoworker,

    assignTask,

    reassignTask,

    unassignTask,

    loadAdminTasks,

    loadAdminUsers,

    loadAdminCoworkers,

    loadAdminPayments,

    loadAdminPayRates,

    loadAdminActivity,

    renderAdminTasks,

    renderAdminUsers,

    renderAdminCoworkers,

    renderAdminPayments,

    renderAdminPayRates,

    renderAdminActivity,

    renderAdminOverview,

    exportAdminCSV,

    exportAdminHTML,

    updatePaymentStatus,

    isAdminUser,

    activateAdminTab
};


/* ============================================================
   GLOBAL COMPATIBILITY
============================================================ */

window.ADMIN_CONFIG =
    ADMIN_CONFIG;

window.adminState =
    adminState;

window.isAdminUser =
    isAdminUser;

window.openAdminCenter =
    openAdminCenter;

window.closeAdminCenter =
    closeAdminCenter;

window.refreshAdminCenter =
    refreshAdminCenter;

window.createAdminTask =
    createAdminTask;

window.updateAdminTask =
    updateAdminTask;

window.deleteAdminTask =
    deleteAdminTask;

window.approveUser =
    approveUser;

window.kickUser =
    kickUser;

window.disableUser =
    disableUser;

window.enableUser =
    enableUser;

window.updateUserRole =
    updateUserRole;

window.createCoworker =
    createCoworker;

window.removeCoworker =
    removeCoworker;

window.assignTask =
    assignTask;

window.reassignTask =
    reassignTask;

window.unassignTask =
    unassignTask;

window.exportAdminCSV =
    exportAdminCSV;

window.exportAdminHTML =
    exportAdminHTML;

window.updatePaymentStatus =
    updatePaymentStatus;

window.activateAdminTab =
    activateAdminTab;


/* ============================================================
   STARTUP
============================================================ */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeAdmin();
        },
        {
            once:
                true
        }
    );

} else {

    initializeAdmin();
}
