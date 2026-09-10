/* ============================================================
   ADMIN.JS
   ANNOTATION AI
   Admin Center / Users / Roles / Tasks / Coworkers /
   Payments / Activity / Exports

   IMPORTANT:
   - This module does NOT use a service_role key.
   - Browser-side Supabase access must use the publishable/anon key.
   - Database permissions must be enforced with Supabase RLS.
============================================================ */

import {
    supabase,
    getCurrentUser,
    getCurrentSession
} from "./supabase.js";


/* ============================================================
   CONFIGURATION
============================================================ */

const ADMIN_CONFIG = {
    adminEmail:
        window.ADMIN_EMAIL ||
        "antonymbali96@gmail.com",

    taskTable:
        window.APP_TASK_TABLE ||
        "tasks",

    resultTable:
        window.APP_RESULT_TABLE ||
        "task_results",

    profileTable:
        window.APP_PROFILE_TABLE ||
        "profiles",

    coworkerTable:
        window.APP_COWORKER_TABLE ||
        "coworkers",

    paymentTable:
        window.APP_PAYMENT_TABLE ||
        "payments",

    activityTable:
        window.APP_ACTIVITY_TABLE ||
        "activity_logs"
};


/* ============================================================
   DOM HELPERS
============================================================ */

const $ = id =>
    document.getElementById(id);


const adminModal =
    $("adminModal");

const closeAdminModalButton =
    $("closeAdminModal");

const adminCenterButton =
    $("adminCenterButton");


const createTaskButton =
    $("createTaskButton");

const taskTitleInput =
    $("taskTitle");

const taskShapeInput =
    $("taskShape");

const taskDurationInput =
    $("taskDuration");

const taskPayInput =
    $("taskPay");

const taskMediaInput =
    $("taskMediaInput");

const adminTaskStatus =
    $("adminTaskStatus");


const adminTasksList =
    $("adminTasksList");

const adminUsersList =
    $("adminUsersList") ||
    $("usersList");

const adminCoworkersList =
    $("adminCoworkersList") ||
    $("coworkersList");

const paymentsList =
    $("paymentsList");

const activityList =
    $("activityList");


const copyAdminCSV =
    $("copyAdminCSV");

const downloadAdminHTML =
    $("downloadAdminHTML");


/* ============================================================
   STATE
============================================================ */

const adminState = {
    initialized: false,

    open:
        false,

    loading:
        false,

    currentUser:
        null,

    currentRole:
        null,

    users:
        [],

    coworkers:
        [],

    tasks:
        [],

    payments:
        [],

    activity:
        [],

    activeTab:
        "tasks"
};


/* ============================================================
   ROLE DEFINITIONS
============================================================ */

const VALID_ROLES = [
    "customer",
    "reviewer",
    "staff",
    "admin",

    "coworker",
    "coworker_2d_box",
    "coworker_polygon",
    "coworker_segmentation"
];


const ROLE_LABELS = {
    customer:
        "Customer",

    reviewer:
        "Reviewer",

    staff:
        "Staff",

    admin:
        "Admin",

    coworker:
        "Coworker",

    coworker_2d_box:
        "Coworker — 2D Box",

    coworker_polygon:
        "Coworker — Polygon",

    coworker_segmentation:
        "Coworker — Segmentation"
};


/* ============================================================
   SAFE HTML
============================================================ */

function escapeHTML(value) {

    return String(
        value ??
        ""
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
   DATE FORMAT
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
   MONEY FORMAT
============================================================ */

function formatMoney(value) {

    const number =
        Number(value);

    if (
        !Number.isFinite(
            number
        )
    ) {
        return "0.00";
    }

    return number.toFixed(2);
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
            "getCurrentUser failed:",
            error
        );
    }


    try {

        const session =
            typeof getCurrentSession ===
            "function"
                ? await getCurrentSession()
                : null;

        return (
            session?.user ||
            null
        );

    } catch (error) {

        console.warn(
            "getCurrentSession failed:",
            error
        );

        return null;
    }
}


/* ============================================================
   ROLE DETECTION
============================================================ */

function roleFromUser(
    user
) {

    if (!user) {
        return null;
    }


    const metadata =
        user.user_metadata ||
        {};


    const appMetadata =
        user.app_metadata ||
        {};


    return (
        metadata.role ||
        appMetadata.role ||
        window.CLOUD?.profile?.role ||
        window.currentUserRole ||
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


    const role =
        roleFromUser(
            user
        );


    if (
        String(role)
            .toLowerCase() ===
        "admin"
    ) {
        return true;
    }


    /*
     * The configured admin email is intentionally
     * checked as a fallback.
     *
     * The email is NOT rendered into normal user UI.
     */

    const email =
        String(
            user.email ||
            ""
        )
            .trim()
            .toLowerCase();


    return (
        email &&
        email ===
            ADMIN_CONFIG
                .adminEmail
                .toLowerCase()
    );
}


/* ============================================================
   ADMIN GUARD
============================================================ */

async function requireAdmin() {

    const user =
        await getAdminUser();


    adminState.currentUser =
        user;


    adminState.currentRole =
        roleFromUser(
            user
        );


    if (
        !isAdminUser(
            user
        )
    ) {

        return false;
    }


    return true;
}


/* ============================================================
   STATUS MESSAGE
============================================================ */

function setAdminStatus(
    message,
    type = "info"
) {

    if (!adminTaskStatus) {
        return;
    }


    adminTaskStatus.textContent =
        message || "";


    adminTaskStatus.dataset.type =
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
            message
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


    setTimeout(
        () => {
            toast.remove();
        },
        3500
    );
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
    }


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
}


/* ============================================================
   REFRESH EVERYTHING
============================================================ */

async function refreshAdminCenter() {

    if (adminState.loading) {
        return;
    }


    const allowed =
        await requireAdmin();


    if (!allowed) {
        return;
    }


    adminState.loading =
        true;


    try {

        await Promise.allSettled([
            loadAdminTasks(),
            loadAdminUsers(),
            loadAdminCoworkers(),
            loadAdminPayments(),
            loadAdminActivity()
        ]);


        renderAdminTasks();
        renderAdminUsers();
        renderAdminCoworkers();
        renderAdminPayments();
        renderAdminActivity();

    } catch (error) {

        console.error(
            "Admin refresh failed:",
            error
        );

        showAdminToast(
            "Unable to refresh admin data.",
            "error"
        );

    } finally {

        adminState.loading =
            false;
    }
}


/* ============================================================
   DATABASE HELPER
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
                    ADMIN_CONFIG.taskTable
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
                    ADMIN_CONFIG.profileTable
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


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.coworkerTable
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


        adminState.coworkers =
            Array.isArray(data)
                ? data
                : [];


        return adminState.coworkers;

    } catch (error) {

        /*
         * A separate coworkers table may not exist.
         * In that case derive coworker records
         * from profiles.
         */

        adminState.coworkers =
            adminState.users.filter(
                user =>
                    String(
                        user.role ||
                        ""
                    )
                        .toLowerCase()
                        .startsWith(
                            "coworker"
                        )
            );


        return adminState.coworkers;
    }
}


/* ============================================================
   LOAD PAYMENTS
============================================================ */

async function loadAdminPayments() {

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
                    ADMIN_CONFIG.paymentTable
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

        console.warn(
            "Payments table unavailable:",
            error
        );

        adminState.payments =
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
                    ADMIN_CONFIG.activityTable
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

        console.warn(
            "Activity table unavailable:",
            error
        );

        adminState.activity =
            [];

        return [];
    }
}


/* ============================================================
   CREATE TASK
============================================================ */

async function createAdminTask() {

    const allowed =
        await requireAdmin();


    if (!allowed) {

        showAdminToast(
            "Administrator access is required.",
            "error"
        );

        return null;
    }


    const client =
        getSupabaseClient();


    if (!client) {

        setAdminStatus(
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
        taskShapeInput?.value ||
        "box";


    const duration =
        Number(
            taskDurationInput?.value
        ) || 0;


    const pay =
        Number(
            taskPayInput?.value
        ) || 0;


    if (!title) {

        setAdminStatus(
            "Enter a task title.",
            "error"
        );

        return null;
    }


    setAdminStatus(
        "Creating task...",
        "info"
    );


    /*
     * Keep the payload conservative.
     * The database can accept additional columns
     * through schema-specific configuration.
     */

    const task = {
        title,
        shape,
        task_type:
            shape,
        duration,
        pay,
        status:
            "available",
        created_by:
            adminState.currentUser?.id ||
            null
    };


    /*
     * Optional media metadata.
     */

    if (
        taskMediaInput?.files?.length
    ) {

        const file =
            taskMediaInput.files[0];


        task.media_name =
            file.name;

        task.media_type =
            file.type;

        task.media_size =
            file.size;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.taskTable
                )
                .insert(
                    task
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        adminState.tasks.unshift(
            data
        );


        renderAdminTasks();


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


        setAdminStatus(
            "Task created successfully.",
            "success"
        );


        showAdminToast(
            "Task created.",
            "success"
        );


        await logAdminActivity(
            "create_task",
            data
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
            "Could not create task.",
            "error"
        );


        return null;
    }
}


/* ============================================================
   UPDATE TASK
============================================================ */

async function updateAdminTask(
    taskId,
    changes
) {

    const allowed =
        await requireAdmin();


    if (!allowed) {
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
                    ADMIN_CONFIG.taskTable
                )
                .update(
                    changes
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
                data;
        }


        renderAdminTasks();


        await logAdminActivity(
            "update_task",
            data
        );


        return data;

    } catch (error) {

        console.error(
            "Update task failed:",
            error
        );

        showAdminToast(
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

    const allowed =
        await requireAdmin();


    if (!allowed) {
        return false;
    }


    if (!taskId) {
        return false;
    }


    const confirmed =
        window.confirm(
            "Delete this task?"
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
                    ADMIN_CONFIG.taskTable
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


        await logAdminActivity(
            "delete_task",
            {
                id:
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
            "Could not delete task.",
            "error"
        );

        return false;
    }
}


/* ============================================================
   UPDATE USER ROLE
============================================================ */

async function updateUserRole(
    userId,
    newRole
) {

    const allowed =
        await requireAdmin();


    if (!allowed) {
        return false;
    }


    if (!userId) {
        return false;
    }


    newRole =
        String(
            newRole ||
            ""
        )
            .trim()
            .toLowerCase();


    if (
        !VALID_ROLES.includes(
            newRole
        )
    ) {

        showAdminToast(
            "Invalid role.",
            "error"
        );

        return false;
    }


    /*
     * Never allow the admin to accidentally
     * remove their own administrator role.
     */

    if (
        String(
            adminState.currentUser?.id
        ) ===
        String(
            userId
        ) &&
        newRole !==
            "admin"
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
                    ADMIN_CONFIG.profileTable
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


        if (index >= 0) {

            adminState.users[index] =
                {
                    ...adminState.users[index],
                    ...data
                };
        }


        renderAdminUsers();
        renderAdminCoworkers();


        await logAdminActivity(
            "change_role",
            {
                user_id:
                    userId,
                role:
                    newRole
            }
        );


        showAdminToast(
            `Role changed to ${ROLE_LABELS[newRole] || newRole}.`,
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
   DELETE / DISABLE USER PROFILE
============================================================ */

async function disableUser(
    userId
) {

    const allowed =
        await requireAdmin();


    if (!allowed) {
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
                    ADMIN_CONFIG.profileTable
                )
                .update({
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


        if (index >= 0) {

            adminState.users[index] =
                {
                    ...adminState.users[index],
                    ...data
                };
        }


        renderAdminUsers();


        await logAdminActivity(
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
            "Could not disable user.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   ENABLE USER
============================================================ */

async function enableUser(
    userId
) {

    const allowed =
        await requireAdmin();


    if (!allowed) {
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
                    ADMIN_CONFIG.profileTable
                )
                .update({
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


        if (error) {
            throw error;
        }


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


        if (index >= 0) {

            adminState.users[index] =
                {
                    ...adminState.users[index],
                    ...data
                };
        }


        renderAdminUsers();


        await logAdminActivity(
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
            "Could not enable user.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   CREATE COWORKER PROFILE
============================================================ */

async function createCoworker(
    userId,
    coworkerRole =
        "coworker_2d_box"
) {

    const allowed =
        await requireAdmin();


    if (!allowed) {
        return null;
    }


    if (!userId) {
        return null;
    }


    if (
        !String(
            coworkerRole
        )
            .startsWith(
                "coworker"
            )
    ) {

        coworkerRole =
            "coworker_2d_box";
    }


    /*
     * The main profile role is updated first.
     */

    const roleUpdated =
        await updateUserRole(
            userId,
            coworkerRole
        );


    if (!roleUpdated) {
        return null;
    }


    /*
     * If a dedicated coworkers table exists,
     * also create a coworker record.
     */

    const client =
        getSupabaseClient();


    if (client) {

        try {

            const {
                data,
                error
            } =
                await client
                    .from(
                        ADMIN_CONFIG.coworkerTable
                    )
                    .insert({
                        user_id:
                            userId,
                        role:
                            coworkerRole,
                        status:
                            "active",
                        created_by:
                            adminState.currentUser?.id ||
                            null
                    })
                    .select()
                    .single();


            if (!error) {

                adminState.coworkers.unshift(
                    data
                );
            }

        } catch (error) {

            /*
             * A missing optional table should
             * not undo the profile-role update.
             */

            console.info(
                "Dedicated coworkers table not available."
            );
        }
    }


    renderAdminCoworkers();


    await logAdminActivity(
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
   RENDER ADMIN TASKS
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
                            task.shape ||
                            task.task_type ||
                            task.type ||
                            "—"
                        );

                    const status =
                        escapeHTML(
                            task.status ||
                            "—"
                        );

                    const duration =
                        escapeHTML(
                            task.duration ??
                            task.estimated_minutes ??
                            "—"
                        );

                    const pay =
                        formatMoney(
                            task.pay ??
                            task.reward ??
                            0
                        );


                    return `
                        <div
                            class="admin-list-row"
                            data-task-id="${id}"
                        >

                            <div class="admin-list-main">
                                <strong>${title}</strong>

                                <small>
                                    ${type}
                                    ·
                                    ${duration} min
                                </small>
                            </div>

                            <div class="admin-list-meta">
                                <span>
                                    ${pay}
                                </span>

                                <span>
                                    ${status}
                                </span>
                            </div>

                            <div class="admin-list-actions">

                                ${
                                    String(status)
                                        .toLowerCase() ===
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

                    const email =
                        escapeHTML(
                            user.email ||
                            user.email_address ||
                            "No email"
                        );

                    const name =
                        escapeHTML(
                            user.full_name ||
                            user.name ||
                            user.display_name ||
                            user.screen_name ||
                            "User"
                        );

                    const role =
                        String(
                            user.role ||
                            "customer"
                        )
                            .toLowerCase();

                    const status =
                        escapeHTML(
                            user.status ||
                            "active"
                        );


                    const safeRole =
                        VALID_ROLES.includes(
                            role
                        )
                            ? role
                            : "customer";


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
                                >

                                    ${
                                        VALID_ROLES
                                            .map(
                                                option =>
                                                    `
                                                        <option
                                                            value="${escapeHTML(option)}"
                                                            ${
                                                                option ===
                                                                safeRole
                                                                    ? "selected"
                                                                    : ""
                                                            }
                                                        >
                                                            ${escapeHTML(
                                                                ROLE_LABELS[
                                                                    option
                                                                ] ||
                                                                option
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
                                    ${escapeHTML(status)}
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
                                        user.last_sign_in_at
                                    )}
                                </small>

                            </div>

                            <div class="admin-list-actions">

                                ${
                                    String(status)
                                        .toLowerCase() ===
                                    "disabled"
                                        ? `
                                            <button
                                                type="button"
                                                data-user-action="enable"
                                                data-user-id="${id}"
                                            >
                                                Enable
                                            </button>
                                        `
                                        : `
                                            <button
                                                type="button"
                                                data-user-action="disable"
                                                data-user-id="${id}"
                                            >
                                                Disable
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
   RENDER COWORKERS
============================================================ */

function renderAdminCoworkers() {

    if (!adminCoworkersList) {
        return;
    }


    const coworkers =
        adminState.users.filter(
            user => {

                const role =
                    String(
                        user.role ||
                        ""
                    )
                        .toLowerCase();

                return role.startsWith(
                    "coworker"
                );
            }
        );


    /*
     * Include dedicated coworker records
     * when available.
     */

    const dedicated =
        adminState.coworkers || [];


    if (
        !coworkers.length &&
        !dedicated.length
    ) {

        adminCoworkersList.innerHTML = `
            <div class="details-empty">
                <strong>No coworkers found</strong>
                <span>Assign a coworker role to a user.</span>
            </div>
        `;

        return;
    }


    const rows =
        coworkers.map(
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
                        "Coworker"
                    );

                const email =
                    escapeHTML(
                        user.email ||
                        "No email"
                    );

                const role =
                    escapeHTML(
                        ROLE_LABELS[
                            user.role
                        ] ||
                        user.role ||
                        "Coworker"
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
                            ${role}
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
        );


    adminCoworkersList.innerHTML =
        rows.join("");
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

                    const user =
                        escapeHTML(
                            payment.email ||
                            payment.user_email ||
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
                        escapeHTML(
                            payment.status ||
                            "pending"
                        );


                    return `
                        <div class="admin-list-row">

                            <div class="admin-list-main">

                                <strong>
                                    ${user}
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
                                    ${status}
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
                <span>Admin activity will appear here.</span>
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
                            ""
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
   TASK ACTION HANDLER
============================================================ */

async function handleTaskAction(
    action,
    taskId
) {

    if (
        action ===
        "delete"
    ) {

        await deleteAdminTask(
            taskId
        );

        return;
    }


    if (
        action ===
        "close"
    ) {

        await updateAdminTask(
            taskId,
            {
                status:
                    "closed"
            }
        );

        return;
    }


    if (
        action ===
        "open"
    ) {

        await updateAdminTask(
            taskId,
            {
                status:
                    "available"
            }
        );

        return;
    }
}


/* ============================================================
   USER ACTION HANDLER
============================================================ */

async function handleUserAction(
    action,
    userId
) {

    if (
        action ===
        "disable"
    ) {

        await disableUser(
            userId
        );

        return;
    }


    if (
        action ===
        "enable"
    ) {

        await enableUser(
            userId
        );

        return;
    }
}


/* ============================================================
   COWORKER ACTION HANDLER
============================================================ */

async function handleCoworkerAction(
    action,
    userId
) {

    if (
        action !==
        "remove"
    ) {
        return;
    }


    await updateUserRole(
        userId,
        "customer"
    );
}


/* ============================================================
   ROLE SELECT HANDLER
============================================================ */

async function handleRoleChange(
    select
) {

    if (!select) {
        return;
    }


    const userId =
        select.dataset.userId;


    const role =
        select.value;


    await updateUserRole(
        userId,
        role
    );
}


/* ============================================================
   ADMIN ACTIVITY LOG
============================================================ */

async function logAdminActivity(
    action,
    payload = {}
) {

    const client =
        getSupabaseClient();


    if (!client) {
        return;
    }


    const user =
        adminState.currentUser;


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


    try {

        const {
            error
        } =
            await client
                .from(
                    ADMIN_CONFIG.activityTable
                )
                .insert(
                    record
                );


        /*
         * If the activity table does not exist,
         * don't break the actual admin operation.
         */

        if (error) {

            console.info(
                "Activity log not saved:",
                error.message
            );

            return;
        }


        adminState.activity.unshift(
            record
        );


        /*
         * Keep memory bounded.
         */

        if (
            adminState.activity.length >
            500
        ) {

            adminState.activity =
                adminState.activity.slice(
                    0,
                    500
                );
        }


        renderAdminActivity();

    } catch (error) {

        console.info(
            "Activity logging skipped:",
            error
        );
    }
}


/* ============================================================
   CSV HELPERS
============================================================ */

function csvEscape(
    value
) {

    const string =
        String(
            value ??
            ""
        );


    return `"${string
        .replaceAll(
            '"',
            '""'
        )}"`;
}


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
   EXPORT ALL ADMIN DATA
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
                    user.status ||
                    "",

                created_at:
                    user.created_at ||
                    "",

                last_login:
                    user.last_login_at ||
                    user.last_sign_in_at ||
                    ""
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
                    task.shape ||
                    task.task_type ||
                    task.type ||
                    "",

                duration:
                    task.duration ||
                    "",

                pay:
                    task.pay ||
                    task.reward ||
                    "",

                status:
                    task.status ||
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
                    payment.amount ||
                    payment.total ||
                    "",

                status:
                    payment.status ||
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
   COPY ADMIN CSV
============================================================ */

async function exportAdminCSV() {

    const allowed =
        await requireAdmin();


    if (!allowed) {

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

        await navigator.clipboard.writeText(
            csv
        );


        showAdminToast(
            "Admin CSV copied to clipboard.",
            "success"
        );

    } catch (error) {

        /*
         * Clipboard may be unavailable on
         * non-secure/local environments.
         */

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
}


/* ============================================================
   DOWNLOAD TEXT FILE
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


    setTimeout(
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

    const allowed =
        await requireAdmin();


    if (!allowed) {

        showAdminToast(
            "Administrator access is required.",
            "error"
        );

        return;
    }


    const now =
        new Date()
            .toLocaleString();


    const html =
        `
<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>Annotation AI - Admin Export</title>

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
    <th>Name</th>
    <th>Email</th>
    <th>Role</th>
    <th>Status</th>
    <th>Joined</th>
    <th>Last Login</th>
</tr>

</thead>

<tbody>

${
    adminState.users
        .map(
            user =>
                `
<tr>

<td>
    ${escapeHTML(
        user.full_name ||
        user.name ||
        user.display_name ||
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
        ROLE_LABELS[
            user.role
        ] ||
        user.role ||
        "customer"
    )}
</td>

<td>
    ${escapeHTML(
        user.status ||
        "active"
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
        .join("")
}

</tbody>

</table>


<h2>
    Tasks
</h2>

<table>

<thead>

<tr>
    <th>Title</th>
    <th>Type</th>
    <th>Duration</th>
    <th>Pay</th>
    <th>Status</th>
    <th>Created</th>
</tr>

</thead>

<tbody>

${
    adminState.tasks
        .map(
            task =>
                `
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
        task.shape ||
        task.task_type ||
        task.type ||
        ""
    )}
</td>

<td>
    ${escapeHTML(
        task.duration ??
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
        formatDate(
            task.created_at
        )
    )}
</td>

</tr>
                `
        )
        .join("")
}

</tbody>

</table>


<h2>
    Payments
</h2>

<table>

<thead>

<tr>
    <th>User</th>
    <th>Amount</th>
    <th>Status</th>
    <th>Date</th>
</tr>

</thead>

<tbody>

${
    adminState.payments
        .map(
            payment =>
                `
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
        .join("")
}

</tbody>

</table>


<h2>
    Activity
</h2>

<table>

<thead>

<tr>
    <th>Action</th>
    <th>User</th>
    <th>Details</th>
    <th>Date</th>
</tr>

</thead>

<tbody>

${
    adminState.activity
        .map(
            activity =>
                `
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
        JSON.stringify(
            activity.details ||
            ""
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
        .join("")
}

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
   ADMIN TABS
============================================================ */

function activateAdminTab(
    tab
) {

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
            }
        );


    document
        .querySelectorAll(
            "[data-admin-panel]"
        )
        .forEach(
            panel => {

                panel.style.display =
                    panel.dataset.adminPanel ===
                    tab
                        ? ""
                        : "none";
            }
        );
}


/* ============================================================
   EVENT BINDINGS
============================================================ */

function bindAdminEvents() {

    if (
        adminState.initialized
    ) {
        return;
    }


    adminState.initialized =
        true;


    /* --------------------------------------------------------
       OPEN
    -------------------------------------------------------- */

    adminCenterButton?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await openAdminCenter();
        }
    );


    /* --------------------------------------------------------
       CLOSE
    -------------------------------------------------------- */

    closeAdminModalButton?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            closeAdminCenter();
        }
    );


    /* --------------------------------------------------------
       CLICK OUTSIDE MODAL
    -------------------------------------------------------- */

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


    /* --------------------------------------------------------
       ESCAPE
    -------------------------------------------------------- */

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


    /* --------------------------------------------------------
       CREATE TASK
    -------------------------------------------------------- */

    createTaskButton?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await createAdminTask();
        }
    );


    /* --------------------------------------------------------
       TASK LIST
    -------------------------------------------------------- */

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


            await handleTaskAction(
                button.dataset.adminTaskAction,
                button.dataset.taskId
            );
        }
    );


    /* --------------------------------------------------------
       USERS LIST
    -------------------------------------------------------- */

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


            await handleUserAction(
                button.dataset.userAction,
                button.dataset.userId
            );
        }
    );


    /* --------------------------------------------------------
       COWORKERS
    -------------------------------------------------------- */

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


            await handleCoworkerAction(
                button.dataset.coworkerAction,
                button.dataset.userId
            );
        }
    );


    /* --------------------------------------------------------
       TABS
    -------------------------------------------------------- */

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


            activateAdminTab(
                button.dataset.adminTab
            );
        }
    );


    /* --------------------------------------------------------
       CSV
    -------------------------------------------------------- */

    copyAdminCSV?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await exportAdminCSV();
        }
    );


    /* --------------------------------------------------------
       HTML
    -------------------------------------------------------- */

    downloadAdminHTML?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await exportAdminHTML();
        }
    );
}


/* ============================================================
   ADMIN BUTTON VISIBILITY
============================================================ */

async function updateAdminVisibility() {

    const user =
        await getAdminUser();


    const allowed =
        isAdminUser(
            user
        );


    if (adminCenterButton) {

        adminCenterButton.style.display =
            allowed
                ? ""
                : "none";
    }


    /*
     * The admin email is deliberately NOT inserted
     * into normal user-facing UI.
     */
}


/* ============================================================
   INITIALIZE
============================================================ */

async function initializeAdmin() {

    bindAdminEvents();

    await updateAdminVisibility();


    /*
     * If authentication changes later,
     * refresh the admin button state.
     */

    window.addEventListener(
        "auth:changed",
        async () => {

            await updateAdminVisibility();
        }
    );


    window.addEventListener(
        "authChanged",
        async () => {

            await updateAdminVisibility();
        }
    );


    return true;
}


/* ============================================================
   PUBLIC API
============================================================ */

export {
    ADMIN_CONFIG,

    adminState,

    VALID_ROLES,

    ROLE_LABELS,

    initializeAdmin,

    openAdminCenter,

    closeAdminCenter,

    refreshAdminCenter,

    createAdminTask,

    updateAdminTask,

    deleteAdminTask,

    updateUserRole,

    disableUser,

    enableUser,

    createCoworker,

    loadAdminTasks,

    loadAdminUsers,

    loadAdminCoworkers,

    loadAdminPayments,

    loadAdminActivity,

    renderAdminTasks,

    renderAdminUsers,

    renderAdminCoworkers,

    renderAdminPayments,

    renderAdminActivity,

    exportAdminCSV,

    exportAdminHTML,

    isAdminUser
};


/* ============================================================
   GLOBAL COMPATIBILITY
   Keeps older HTML / modules working if they call
   these functions through window.
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

window.updateUserRole =
    updateUserRole;

window.disableUser =
    disableUser;

window.enableUser =
    enableUser;

window.createCoworker =
    createCoworker;

window.exportAdminCSV =
    exportAdminCSV;

window.exportAdminHTML =
    exportAdminHTML;


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
