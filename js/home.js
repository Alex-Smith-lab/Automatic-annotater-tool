// ============================================================
// ANNOTATION AI
// PART 9 — HOME / DASHBOARD MODULE
// File: js/home.js
// ============================================================

import {
    supabase,
    getCurrentUser,
    getCurrentSession
} from "./supabase.js";

const homeState = {
    initialized: false,
    loading: false,
    jobs: [],
    user: null
};

// ------------------------------------------------------------
// DOM HELPER
// ------------------------------------------------------------

function $(id) {
    return document.getElementById(id);
}

// ------------------------------------------------------------
// SAFE HTML
// ------------------------------------------------------------

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ------------------------------------------------------------
// DATE
// ------------------------------------------------------------

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

// ------------------------------------------------------------
// TIME
// ------------------------------------------------------------

function formatTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
    });
}

// ------------------------------------------------------------
// ROLE
// ------------------------------------------------------------

function normalizeRole(user) {
    if (!user) {
        return "customer";
    }

    const metadata =
        user.user_metadata ||
        user.app_metadata ||
        {};

    return String(
        metadata.role ||
        metadata.user_role ||
        user.role ||
        "customer"
    ).toLowerCase();
}

// ------------------------------------------------------------
// TASK TITLE
// ------------------------------------------------------------

function getTaskTitle(task) {
    return (
        task?.title ||
        task?.name ||
        task?.task_title ||
        task?.task_name ||
        "Untitled task"
    );
}

// ------------------------------------------------------------
// TASK STATUS
// ------------------------------------------------------------

function getTaskStatus(task) {
    return String(
        task?.status ||
        task?.state ||
        "available"
    ).toLowerCase();
}

// ------------------------------------------------------------
// STATUS LABEL
// ------------------------------------------------------------

function statusLabel(status) {
    const labels = {
        available: "Available",
        pending: "Pending",
        assigned: "Assigned",
        in_progress: "In progress",
        "in-progress": "In progress",
        working: "In progress",
        submitted: "Submitted",
        completed: "Completed",
        approved: "Approved",
        rejected: "Rejected",
        skipped: "Skipped",
        cancelled: "Cancelled",
        canceled: "Cancelled"
    };

    return labels[status] || status || "Available";
}

// ------------------------------------------------------------
// STATUS CLASS
// ------------------------------------------------------------

function statusClass(status) {
    const value = String(status || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");

    return `status-${value || "available"}`;
}

// ------------------------------------------------------------
// TASK SHAPE
// ------------------------------------------------------------

function getTaskShape(task) {
    return (
        task?.shape ||
        task?.annotation_type ||
        task?.annotationType ||
        task?.task_type ||
        task?.type ||
        "box"
    );
}

// ------------------------------------------------------------
// TASK PAY
// ------------------------------------------------------------

function getTaskPay(task) {
    const value =
        task?.pay ??
        task?.payment ??
        task?.reward ??
        task?.amount ??
        task?.price;

    if (value === null || value === undefined || value === "") {
        return "";
    }

    return value;
}

// ------------------------------------------------------------
// TASK DURATION
// ------------------------------------------------------------

function getTaskDuration(task) {
    return (
        task?.duration ||
        task?.duration_minutes ||
        task?.estimated_minutes ||
        ""
    );
}

// ------------------------------------------------------------
// MEDIA
// ------------------------------------------------------------

function getTaskMedia(task) {
    return (
        task?.media_url ||
        task?.mediaUrl ||
        task?.file_url ||
        task?.fileUrl ||
        task?.source_url ||
        task?.sourceUrl ||
        task?.url ||
        null
    );
}

// ------------------------------------------------------------
// USER NAME
// ------------------------------------------------------------

function getUserName(user) {
    if (!user) {
        return "User";
    }

    return (
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.display_name ||
        user.email?.split("@")[0] ||
        "User"
    );
}

// ------------------------------------------------------------
// UPDATE USER UI
// ------------------------------------------------------------

function updateUserUI(user) {
    if (!user) {
        return;
    }

    const name = getUserName(user);
    const role = normalizeRole(user);

    const profileName =
        $("profileName");

    const profileRole =
        $("profileRole");

    const profileScreenName =
        $("profileScreenName");

    const profileScreenRole =
        $("profileScreenRole");

    const profileScreenEmail =
        $("profileScreenEmail");

    if (profileName) {
        profileName.textContent = name;
    }

    if (profileRole) {
        profileRole.textContent = role;
    }

    if (profileScreenName) {
        profileScreenName.textContent = name;
    }

    if (profileScreenRole) {
        profileScreenRole.textContent = role;
    }

    if (profileScreenEmail) {
        profileScreenEmail.textContent =
            user.email || "";
    }

    document.body.dataset.userRole = role;
}

// ------------------------------------------------------------
// SHOW HOME
// ------------------------------------------------------------

export function showHome() {
    const loginPage = $("loginPage");

    if (loginPage) {
        loginPage.style.display = "none";
        loginPage.hidden = true;
    }

    const home =
        $("homePage") ||
        $("home") ||
        $("dashboard") ||
        $("coworkerDashboard");

    if (home) {
        home.style.display = "";
        home.hidden = false;
    }

    window.dispatchEvent(
        new CustomEvent("home:shown")
    );
}

// ------------------------------------------------------------
// HIDE HOME
// ------------------------------------------------------------

export function hideHome() {
    const home =
        $("homePage") ||
        $("home") ||
        $("dashboard");

    if (home) {
        home.style.display = "none";
        home.hidden = true;
    }
}

// ------------------------------------------------------------
// TASK QUERY HELPERS
// ------------------------------------------------------------

async function queryTasksByUser(user) {
    if (!supabase || !user) {
        return [];
    }

    const results = [];

    // First attempt: tasks assigned directly to the user.
    const directColumns = [
        "assigned_to",
        "assigned_user_id",
        "worker_id",
        "user_id"
    ];

    for (const column of directColumns) {
        try {
            const { data, error } = await supabase
                .from("tasks")
                .select("*")
                .eq(column, user.id)
                .order("created_at", {
                    ascending: false
                })
                .limit(100);

            if (!error && Array.isArray(data)) {
                results.push(...data);
                break;
            }
        } catch (_) {}
    }

    return results;
}

// ------------------------------------------------------------
// AVAILABLE TASK QUERY
// ------------------------------------------------------------

async function queryAvailableTasks() {
    if (!supabase) {
        return [];
    }

    const attempts = [
        {
            column: "status",
            values: [
                "available",
                "open",
                "pending"
            ]
        }
    ];

    for (const attempt of attempts) {
        for (const value of attempt.values) {
            try {
                const { data, error } = await supabase
                    .from("tasks")
                    .select("*")
                    .eq(attempt.column, value)
                    .order("created_at", {
                        ascending: false
                    })
                    .limit(100);

                if (!error && Array.isArray(data)) {
                    return data;
                }
            } catch (_) {}
        }
    }

    // Last attempt: return recent tasks if the project does
    // not use a status column.
    try {
        const { data, error } = await supabase
            .from("tasks")
            .select("*")
            .order("created_at", {
                ascending: false
            })
            .limit(100);

        if (!error && Array.isArray(data)) {
            return data;
        }
    } catch (_) {}

    return [];
}

// ------------------------------------------------------------
// REMOVE DUPLICATES
// ------------------------------------------------------------

function deduplicateTasks(tasks) {
    const map = new Map();

    tasks.forEach(task => {
        const id =
            task?.id ||
            task?.task_id ||
            `${getTaskTitle(task)}_${task?.created_at || ""}`;

        if (!map.has(String(id))) {
            map.set(String(id), task);
        }
    });

    return Array.from(map.values());
}

// ------------------------------------------------------------
// LOAD DASHBOARD JOBS
// ------------------------------------------------------------

export async function loadDashboardJobs() {
    if (homeState.loading) {
        return homeState.jobs;
    }

    homeState.loading = true;

    try {
        const user =
            homeState.user ||
            await getCurrentUser();

        homeState.user = user;

        if (!user) {
            homeState.jobs = [];
            renderAvailableJobs();
            return [];
        }

        updateUserUI(user);

        const role = normalizeRole(user);

        let tasks = [];

        // Staff/reviewer/admin users may see available work.
        if (
            role === "admin" ||
            role === "staff" ||
            role === "reviewer" ||
            role === "worker" ||
            role === "coworker"
        ) {
            tasks = await queryAvailableTasks();

            const assigned =
                await queryTasksByUser(user);

            tasks = deduplicateTasks([
                ...assigned,
                ...tasks
            ]);
        } else {
            tasks = await queryTasksByUser(user);

            if (!tasks.length) {
                tasks = await queryAvailableTasks();
            }
        }

        homeState.jobs = deduplicateTasks(tasks);

        renderAvailableJobs();

        updateDashboardStats();

        return homeState.jobs;
    } finally {
        homeState.loading = false;
    }
}

// ------------------------------------------------------------
// RENDER LOADING
// ------------------------------------------------------------

function renderJobsLoading(container) {
    container.innerHTML = `
        <div class="jobs-loading">
            <div class="jobs-loading-spinner"></div>
            <div>Loading available work...</div>
        </div>
    `;
}

// ------------------------------------------------------------
// RENDER NO JOBS
// ------------------------------------------------------------

function renderNoJobs(container) {
    container.innerHTML = `
        <div class="jobs-empty">
            <div class="jobs-empty-icon">□</div>
            <div class="jobs-empty-title">
                No tasks available
            </div>
            <div class="jobs-empty-text">
                New tasks will appear here when they become available.
            </div>
        </div>
    `;
}

// ------------------------------------------------------------
// RENDER TASK CARD
// ------------------------------------------------------------

function renderTaskCard(task) {
    const id =
        task?.id ||
        task?.task_id ||
        "";

    const title =
        escapeHTML(getTaskTitle(task));

    const status =
        getTaskStatus(task);

    const shape =
        escapeHTML(getTaskShape(task));

    const pay =
        getTaskPay(task);

    const duration =
        getTaskDuration(task);

    const media =
        getTaskMedia(task);

    const created =
        task?.created_at ||
        task?.createdAt ||
        null;

    return `
        <article
            class="available-job-card"
            data-task-id="${escapeHTML(id)}"
        >
            <div class="available-job-card-header">

                <div class="available-job-title">
                    ${title}
                </div>

                <span
                    class="task-status ${statusClass(status)}"
                >
                    ${escapeHTML(statusLabel(status))}
                </span>

            </div>

            <div class="available-job-meta">

                <span class="job-shape">
                    ${shape}
                </span>

                ${
                    duration !== ""
                        ? `
                            <span class="job-duration">
                                ${escapeHTML(duration)}
                                ${Number(duration) === 1 ? "min" : "mins"}
                            </span>
                        `
                        : ""
                }

                ${
                    pay !== ""
                        ? `
                            <span class="job-pay">
                                ${escapeHTML(pay)}
                            </span>
                        `
                        : ""
                }

            </div>

            ${
                created
                    ? `
                        <div class="available-job-date">
                            ${escapeHTML(formatDate(created))}
                            ·
                            ${escapeHTML(formatTime(created))}
                        </div>
                    `
                    : ""
            }

            ${
                media
                    ? `
                        <div class="available-job-media">
                            Media available
                        </div>
                    `
                    : ""
            }

            <div class="available-job-actions">

                <button
                    type="button"
                    class="open-task-btn"
                    data-task-id="${escapeHTML(id)}"
                >
                    Open task
                </button>

            </div>
        </article>
    `;
}

// ------------------------------------------------------------
// RENDER AVAILABLE JOBS
// ------------------------------------------------------------

export function renderAvailableJobs() {
    const container =
        $("availableJobs") ||
        $("jobsList") ||
        $("availableJobsList");

    if (!container) {
        return;
    }

    if (!homeState.jobs.length) {
        renderNoJobs(container);
        return;
    }

    container.innerHTML = homeState.jobs
        .map(renderTaskCard)
        .join("");

    bindTaskCards(container);
}

// ------------------------------------------------------------
// TASK CARD EVENTS
// ------------------------------------------------------------

function bindTaskCards(container) {
    container
        .querySelectorAll(".open-task-btn")
        .forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();

                const taskId =
                    button.dataset.taskId;

                openTask(taskId);
            });
        });

    container
        .querySelectorAll(".available-job-card")
        .forEach(card => {
            card.addEventListener("dblclick", () => {
                const taskId =
                    card.dataset.taskId;

                openTask(taskId);
            });
        });
}

// ------------------------------------------------------------
// OPEN TASK
// ------------------------------------------------------------

export function openTask(taskId) {
    if (!taskId) {
        return;
    }

    window.dispatchEvent(
        new CustomEvent("home:openTask", {
            detail: {
                taskId
            }
        })
    );

    // Compatibility with tasks.js.
    try {
        if (typeof window.loadTask === "function") {
            window.loadTask(taskId);
            return;
        }

        if (typeof window.openTask === "function") {
            // Avoid recursively calling this function.
            if (window.openTask !== openTask) {
                window.openTask(taskId);
                return;
            }
        }

        if (typeof window.selectTask === "function") {
            window.selectTask(taskId);
            return;
        }
    } catch (error) {
        console.warn(
            "Unable to open task:",
            error
        );
    }
}

// ------------------------------------------------------------
// REFRESH DASHBOARD
// ------------------------------------------------------------

export async function refreshDashboard() {
    const button =
        $("refreshDashboardJobs");

    if (button) {
        button.disabled = true;
        button.classList.add("loading");
    }

    try {
        return await loadDashboardJobs();
    } finally {
        if (button) {
            button.disabled = false;
            button.classList.remove("loading");
        }
    }
}

// ------------------------------------------------------------
// DASHBOARD STATS
// ------------------------------------------------------------

export function updateDashboardStats() {
    const jobs =
        homeState.jobs || [];

    const availableCount =
        jobs.filter(task => {
            const status =
                getTaskStatus(task);

            return [
                "available",
                "open",
                "pending"
            ].includes(status);
        }).length;

    const assignedCount =
        jobs.filter(task => {
            const status =
                getTaskStatus(task);

            return [
                "assigned",
                "in_progress",
                "in-progress",
                "working"
            ].includes(status);
        }).length;

    const completedCount =
        jobs.filter(task => {
            const status =
                getTaskStatus(task);

            return [
                "completed",
                "approved",
                "submitted"
            ].includes(status);
        }).length;

    const mappings = {
        availableCount,
        assignedCount,
        completedCount,
        totalJobs: jobs.length
    };

    Object.entries(mappings).forEach(
        ([id, value]) => {
            const element = $(id);

            if (element) {
                element.textContent =
                    String(value);
            }
        }
    );
}

// ------------------------------------------------------------
// REFRESH BUTTON
// ------------------------------------------------------------

function bindRefreshButton() {
    const button =
        $("refreshDashboardJobs");

    if (!button ||
        button.dataset.homeBound === "true") {
        return;
    }

    button.dataset.homeBound = "true";

    button.addEventListener(
        "click",
        event => {
            event.preventDefault();
            refreshDashboard();
        }
    );
}

// ------------------------------------------------------------
// COWORKER DASHBOARD
// ------------------------------------------------------------

function setupCoworkerDashboard(user) {
    const dashboard =
        $("coworkerDashboard");

    if (!dashboard) {
        return;
    }

    const role =
        normalizeRole(user);

    const coworkerRoles = [
        "coworker",
        "staff",
        "reviewer",
        "admin",
        "worker"
    ];

    if (coworkerRoles.includes(role)) {
        dashboard.hidden = false;
        dashboard.style.display = "";
    }
}

// ------------------------------------------------------------
// COWORKER WORKBENCH
// ------------------------------------------------------------

function bindCoworkerWorkbench() {
    const workbench =
        $("coworkerWorkbench");

    if (!workbench) {
        return;
    }

    if (
        workbench.dataset.homeBound ===
        "true"
    ) {
        return;
    }

    workbench.dataset.homeBound =
        "true";

    const upload =
        $("workbenchUpload");

    const ai =
        $("workbenchAI");

    if (upload) {
        upload.addEventListener(
            "click",
            () => {
                const mediaInput =
                    $("mediaInput");

                if (mediaInput) {
                    mediaInput.click();
                }
            }
        );
    }

    if (ai) {
        ai.addEventListener(
            "click",
            () => {
                window.dispatchEvent(
                    new CustomEvent(
                        "home:runAI"
                    )
                );

                if (
                    typeof window.runAutoAnnotate ===
                    "function"
                ) {
                    window.runAutoAnnotate();
                } else if (
                    typeof window.autoAnnotate ===
                    "function"
                ) {
                    window.autoAnnotate();
                }
            }
        );
    }
}

// ------------------------------------------------------------
// AUTH EVENTS
// ------------------------------------------------------------

function bindAuthEvents() {
    window.addEventListener(
        "auth:login",
        event => {
            const user =
                event.detail?.user ||
                null;

            homeState.user = user;

            if (user) {
                updateUserUI(user);
                setupCoworkerDashboard(user);
            }

            showHome();
            loadDashboardJobs();
        }
    );

    window.addEventListener(
        "auth:session",
        event => {
            const session =
                event.detail?.session;

            if (session?.user) {
                homeState.user =
                    session.user;

                updateUserUI(
                    session.user
                );

                setupCoworkerDashboard(
                    session.user
                );

                showHome();
                loadDashboardJobs();
            }
        }
    );

    window.addEventListener(
        "auth:logout",
        () => {
            homeState.user = null;
            homeState.jobs = [];

            const container =
                $("availableJobs");

            if (container) {
                renderNoJobs(container);
            }

            hideHome();
        }
    );
}

// ------------------------------------------------------------
// TASK EVENTS
// ------------------------------------------------------------

function bindTaskEvents() {
    const events = [
        "task:created",
        "task:updated",
        "task:submitted",
        "task:completed",
        "task:approved",
        "task:rejected",
        "task:skipped"
    ];

    events.forEach(
        eventName => {
            window.addEventListener(
                eventName,
                () => {
                    setTimeout(
                        refreshDashboard,
                        250
                    );
                }
            );
        }
    );
}

// ------------------------------------------------------------
// GLOBAL COMPATIBILITY
// ------------------------------------------------------------

function exposeGlobals() {
    window.loadDashboardJobs =
        loadDashboardJobs;

    window.renderAvailableJobs =
        renderAvailableJobs;

    window.refreshDashboard =
        refreshDashboard;

    window.openDashboardTask =
        openTask;

    window.showHome =
        showHome;

    window.hideHome =
        hideHome;

    window.updateDashboardStats =
        updateDashboardStats;
}

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

export async function initializeHome() {
    if (homeState.initialized) {
        return;
    }

    homeState.initialized = true;

    exposeGlobals();

    bindRefreshButton();
    bindCoworkerWorkbench();
    bindAuthEvents();
    bindTaskEvents();

    const session =
        await getCurrentSession();

    if (session?.user) {
        homeState.user =
            session.user;

        updateUserUI(
            session.user
        );

        setupCoworkerDashboard(
            session.user
        );

        showHome();

        await loadDashboardJobs();
    }
}

// ------------------------------------------------------------
// AUTO INITIALIZE
// ------------------------------------------------------------

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeHome,
        { once: true }
    );
} else {
    initializeHome();
}

// ------------------------------------------------------------
// EXPORT STATE
// ------------------------------------------------------------

export {
    homeState,
    getTaskTitle,
    getTaskStatus,
    getTaskShape,
    getTaskPay,
    getTaskDuration,
    getTaskMedia
};
```
