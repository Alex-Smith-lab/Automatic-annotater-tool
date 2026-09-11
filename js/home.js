// ============================================================
// ANNOTATION AI - HOME / DASHBOARD MODULE
// ============================================================

import {
    APP_CONFIG,
    normalizeRole,
    roleLabel,
    workTypeLabel,
    roleForWorkType
} from "./config.js";

import {
    getSupabase,
    getCurrentUser
} from "./supabase.js";

import {
    getRole,
    getProfile,
    isLoggedIn,
    isAdmin,
    isStaff,
    isReviewer,
    isCoworker,
    isPendingApproval
} from "./auth.js";

import {
    selectTask,
    getCurrentTask
} from "./tasks.js";

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------

const homeState = {
    initialized: false,
    loading: false,

    jobs: [],
    currentTask: null,

    user: null,
    profile: null,
    role: "customer",

    lastLoadedAt: null,
    error: null
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function $(id) {
    return document.getElementById(id);
}

function qs(selector, root = document) {
    return root.querySelector(selector);
}

function qsa(selector, root = document) {
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

function formatMoney(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "Pay not set";
    }

    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatDuration(minutes) {
    const value = Number(minutes);

    if (!Number.isFinite(value) || value <= 0) {
        return "Duration not set";
    }

    if (value < 60) {
        return `${Math.round(value)} min`;
    }

    const hours = Math.floor(value / 60);
    const remaining = Math.round(value % 60);

    if (!remaining) {
        return `${hours} hr`;
    }

    return `${hours} hr ${remaining} min`;
}

function normalizeTask(task) {
    if (!task) {
        return null;
    }

    const workType =
        task.work_type ||
        task.task_type ||
        task.type ||
        "";

    const workRole =
        task.work_role ||
        task.role ||
        roleForWorkType(workType) ||
        "";

    return {
        ...task,

        work_type: workType,
        work_role: normalizeRole(workRole),

        title:
            task.title ||
            task.name ||
            "Annotation task",

        expected_minutes:
            task.expected_minutes ??
            task.duration_minutes ??
            task.duration ??
            null,

        pay_amount:
            task.pay_amount ??
            task.pay ??
            task.amount ??
            null
    };
}

// ------------------------------------------------------------
// TIME / GREETING
// ------------------------------------------------------------

function getTimeInfo(date = new Date()) {
    const hour = date.getHours();

    if (hour >= 5 && hour < 12) {
        return {
            greeting: "Good morning",
            emoji: "🌅"
        };
    }

    if (hour >= 12 && hour < 17) {
        return {
            greeting: "Good afternoon",
            emoji: "☀️"
        };
    }

    if (hour >= 17 && hour < 21) {
        return {
            greeting: "Good evening",
            emoji: "🌇"
        };
    }

    return {
        greeting: "Good night",
        emoji: "🌙"
    };
}

// ------------------------------------------------------------
// USER NAME
// ------------------------------------------------------------

function getUserName() {
    const profile = homeState.profile;

    if (profile?.full_name) {
        return profile.full_name;
    }

    if (homeState.user?.user_metadata?.full_name) {
        return homeState.user.user_metadata.full_name;
    }

    if (homeState.user?.email) {
        return homeState.user.email.split("@")[0];
    }

    return "there";
}

// ------------------------------------------------------------
// GREETING
// ------------------------------------------------------------

function renderGreeting() {
    const container =
        $("dashboardGreeting") ||
        $("homeGreeting") ||
        $("welcomeGreeting") ||
        qs("[data-dashboard-greeting]");

    if (!container) {
        return;
    }

    const {
        greeting,
        emoji
    } = getTimeInfo();

    const name = escapeHTML(getUserName());

    container.innerHTML = `
        <div class="dashboard-greeting-inner">
            <div class="dashboard-greeting-emoji">
                ${emoji}
            </div>

            <div class="dashboard-greeting-text">
                <div class="dashboard-greeting-title">
                    ${greeting}, ${name}
                </div>

                <div class="dashboard-greeting-subtitle">
                    ${escapeHTML(
                        roleLabel(homeState.role)
                    )}
                </div>
            </div>
        </div>
    `;

    container.classList.add("dashboard-greeting");
}

// ------------------------------------------------------------
// TIMELINE
// ------------------------------------------------------------

function renderTimeline() {
    const container =
        $("workspaceTimeline") ||
        $("dashboardTimeline") ||
        $("homeTimeline") ||
        qs("[data-workspace-timeline]");

    if (!container) {
        return;
    }

    const {
        emoji
    } = getTimeInfo();

    const name = escapeHTML(getUserName());

    container.innerHTML = `
        <div class="workspace-timeline-line"></div>

        <div class="workspace-timeline-item active">
            <div class="workspace-timeline-dot">
                ${emoji}
            </div>

            <div class="workspace-timeline-content">
                <strong>${name}</strong>
                <span>${escapeHTML(roleLabel(homeState.role))}</span>
            </div>
        </div>

        <div class="workspace-timeline-item">
            <div class="workspace-timeline-dot">
                🧑‍💻
            </div>

            <div class="workspace-timeline-content">
                <strong>Workspace</strong>
                <span>Ready for annotation work</span>
            </div>
        </div>
    `;
}

// ------------------------------------------------------------
// FIND DASHBOARD CONTAINER
// ------------------------------------------------------------

function getJobsContainer() {
    return (
        $("availableJobs") ||
        $("availableJobsList") ||
        $("jobsList") ||
        $("taskList") ||
        $("homeJobs") ||
        qs("[data-available-jobs]")
    );
}

// ------------------------------------------------------------
// EMPTY JOBS
// ------------------------------------------------------------

function renderNoJobs() {
    const container = getJobsContainer();

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="no-jobs-card">
            <div class="no-jobs-icon">
                💤
            </div>

            <div class="no-jobs-title">
                Oops, looking for more work for you
            </div>

            <div class="no-jobs-text">
                We’re checking for the next role-matched job.
                Please check again soon.
            </div>

            <button
                type="button"
                class="secondary-btn"
                id="refreshJobsButton"
            >
                Refresh jobs
            </button>
        </div>
    `;

    $("refreshJobsButton")?.addEventListener(
        "click",
        () => {
            loadAvailableJobs();
        }
    );
}

// ------------------------------------------------------------
// LOADING JOBS
// ------------------------------------------------------------

function renderJobsLoading() {
    const container = getJobsContainer();

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="jobs-loading-card">
            <div class="loading-spinner"></div>
            <span>Looking for available work...</span>
        </div>
    `;
}

// ------------------------------------------------------------
// ERROR
// ------------------------------------------------------------

function renderJobsError(message) {
    const container = getJobsContainer();

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="no-jobs-card error">
            <div class="no-jobs-icon">
                ⚠️
            </div>

            <div class="no-jobs-title">
                We could not load the jobs
            </div>

            <div class="no-jobs-text">
                ${escapeHTML(message)}
            </div>

            <button
                type="button"
                class="secondary-btn"
                id="retryJobsButton"
            >
                Try again
            </button>
        </div>
    `;

    $("retryJobsButton")?.addEventListener(
        "click",
        () => {
            loadAvailableJobs();
        }
    );
}

// ------------------------------------------------------------
// JOB CARD
// ------------------------------------------------------------

function renderJobCard(task) {
    const item = normalizeTask(task);

    const workType =
        item.work_type
            ? workTypeLabel(item.work_type)
            : "Annotation";

    const role =
        item.work_role
            ? roleLabel(item.work_role)
            : "Available role";

    const duration =
        formatDuration(item.expected_minutes);

    const pay =
        item.pay_amount !== null &&
        item.pay_amount !== undefined
            ? formatMoney(item.pay_amount)
            : "Pay not set";

    const title =
        escapeHTML(item.title);

    const taskId =
        escapeHTML(item.id);

    return `
        <article
            class="job-card"
            data-task-id="${taskId}"
        >
            <div class="job-card-header">
                <div class="job-card-title">
                    ${title}
                </div>

                <div class="job-card-status">
                    Available
                </div>
            </div>

            <div class="job-card-details">

                <div class="job-card-detail">
                    <span class="job-card-label">
                        Work type
                    </span>

                    <strong>
                        ${escapeHTML(workType)}
                    </strong>
                </div>

                <div class="job-card-detail">
                    <span class="job-card-label">
                        Role
                    </span>

                    <strong>
                        ${escapeHTML(role)}
                    </strong>
                </div>

                <div class="job-card-detail">
                    <span class="job-card-label">
                        Expected duration
                    </span>

                    <strong>
                        ${escapeHTML(duration)}
                    </strong>
                </div>

                <div class="job-card-detail">
                    <span class="job-card-label">
                        Pay
                    </span>

                    <strong class="job-card-pay">
                        ${escapeHTML(pay)}
                    </strong>
                </div>

            </div>

            <div class="job-card-footer">
                <button
                    type="button"
                    class="job-open-button"
                    data-open-task="${taskId}"
                >
                    Start work
                </button>
            </div>
        </article>
    `;
}

// ------------------------------------------------------------
// RENDER JOBS
// ------------------------------------------------------------

function renderJobs() {
    const container = getJobsContainer();

    if (!container) {
        return;
    }

    if (!homeState.jobs.length) {
        renderNoJobs();
        return;
    }

    container.innerHTML =
        homeState.jobs
            .map(renderJobCard)
            .join("");

    bindJobButtons();
}

// ------------------------------------------------------------
// BIND JOB BUTTONS
// ------------------------------------------------------------

function bindJobButtons() {
    qsa("[data-open-task]").forEach(button => {
        if (button.dataset.bound === "true") {
            return;
        }

        button.dataset.bound = "true";

        button.addEventListener("click", async event => {
            event.preventDefault();

            const taskId =
                button.dataset.openTask;

            if (!taskId) {
                return;
            }

            await openTask(taskId);
        });
    });
}

// ------------------------------------------------------------
// LOAD AVAILABLE JOBS
// ------------------------------------------------------------

async function loadAvailableJobs() {
    const client = getSupabase();

    if (!client) {
        renderJobsError(
            "Supabase is not configured."
        );
        return [];
    }

    if (!isLoggedIn()) {
        homeState.jobs = [];
        return [];
    }

    // A kicked/pending user must not receive jobs.
    if (isPendingApproval()) {
        homeState.jobs = [];
        renderNoJobs();
        return [];
    }

    homeState.loading = true;
    homeState.error = null;

    renderJobsLoading();

    try {
        const role = normalizeRole(
            getRole()
        );

        homeState.role = role;

        let query = client
            .from(APP_CONFIG.tables.tasks)
            .select("*")
            .eq("status", "available");

        // Customers see customer-uploaded work.
        // Coworkers only see work matching their exact annotation role.
        // Staff/reviewer/admin can see available work.
        if (isCoworker()) {
            query = query.eq(
                "work_role",
                role
            );
        } else if (
            !isAdmin() &&
            !isStaff() &&
            !isReviewer()
        ) {
            // Customer jobs are normally waiting for a worker.
            // Keep customer access conservative.
            query = query.or(
                "assigned_to.is.null,assigned_to.eq." +
                homeState.user?.id
            );
        }

        const {
            data,
            error
        } = await query
            .order(
                "created_at",
                {
                    ascending: true
                }
            )
            .limit(50);

        if (error) {
            throw error;
        }

        homeState.jobs =
            (data || [])
                .map(normalizeTask)
                .filter(task => {
                    if (!task) {
                        return false;
                    }

                    if (
                        isCoworker() &&
                        normalizeRole(task.work_role) !== role
                    ) {
                        return false;
                    }

                    return true;
                });

        homeState.lastLoadedAt =
            new Date();

        renderJobs();

        emitHomeEvent(
            "jobsLoaded",
            {
                jobs: homeState.jobs
            }
        );

        return homeState.jobs;
    } catch (error) {
        console.error(
            "Could not load available jobs:",
            error
        );

        homeState.error = error;
        homeState.jobs = [];

        renderJobsError(
            error?.message ||
            "Unable to load available jobs."
        );

        return [];
    } finally {
        homeState.loading = false;
    }
}

// ------------------------------------------------------------
// OPEN TASK
// ------------------------------------------------------------

async function openTask(taskId) {
    if (!taskId) {
        return null;
    }

    const task =
        homeState.jobs.find(
            item =>
                String(item.id) ===
                String(taskId)
        );

    try {
        const selected =
            await selectTask(
                taskId
            );

        homeState.currentTask =
            selected || task || null;

        emitHomeEvent(
            "homeTaskOpened",
            {
                task:
                    homeState.currentTask,
                taskId
            }
        );

        // Let the workspace/annotation modules decide
        // how the actual workspace becomes visible.
        document.body.classList.add(
            "workspace-active"
        );

        const workspace =
            $("workspace") ||
            $("workspaceView") ||
            $("annotationWorkspace");

        workspace?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        return selected;
    } catch (error) {
        console.error(
            "Could not open task:",
            error
        );

        const message =
            error?.message ||
            "This task could not be opened.";

        if (
            message.toLowerCase().includes(
                "claimed"
            )
        ) {
            await loadAvailableJobs();
        }

        if (typeof window.showToast === "function") {
            window.showToast(
                message,
                "error"
            );
        }

        return null;
    }
}

// ------------------------------------------------------------
// REFRESH CURRENT TASK
// ------------------------------------------------------------

function refreshCurrentTask() {
    try {
        homeState.currentTask =
            getCurrentTask();
    } catch (error) {
        console.debug(
            "Current task could not be refreshed."
        );
    }
}

// ------------------------------------------------------------
// DASHBOARD VISIBILITY
// ------------------------------------------------------------

function showDashboard() {
    const dashboard =
        $("homeScreen") ||
        $("homePage") ||
        $("dashboard") ||
        $("dashboardView");

    dashboard?.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "dashboard-visible"
    );
}

function hideDashboard() {
    const dashboard =
        $("homeScreen") ||
        $("homePage") ||
        $("dashboard") ||
        $("dashboardView");

    dashboard?.classList.add(
        "hidden"
    );

    document.body.classList.remove(
        "dashboard-visible"
    );
}

// ------------------------------------------------------------
// PENDING APPROVAL SCREEN
// ------------------------------------------------------------

function renderPendingApproval() {
    const container =
        $("approvalWaiting") ||
        $("pendingApproval") ||
        $("approvalScreen");

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="approval-waiting-card">
            <div class="approval-waiting-icon">
                ⏳
            </div>

            <h2>
                Waiting for admin approval
            </h2>

            <p>
                Your account has been created successfully.
                Please wait for an administrator to grant
                you access to work.
            </p>

            <div class="approval-status">
                Account status:
                <strong>Pending approval</strong>
            </div>
        </div>
    `;

    container.classList.remove(
        "hidden"
    );
}

// ------------------------------------------------------------
// HOME EVENT SYSTEM
// ------------------------------------------------------------

function emitHomeEvent(name, detail = {}) {
    window.dispatchEvent(
        new CustomEvent(name, {
            detail
        })
    );
}

// ------------------------------------------------------------
// EVENT LISTENERS
// ------------------------------------------------------------

function bindHomeEvents() {
    if (homeState.eventsBound) {
        return;
    }

    homeState.eventsBound = true;

    window.addEventListener(
        "authChanged",
        async event => {
            const detail =
                event.detail || {};

            homeState.user =
                detail.user ||
                getCurrentUser();

            homeState.profile =
                detail.profile ||
                getProfile();

            homeState.role =
                normalizeRole(
                    detail.role ||
                    getRole()
                );

            renderGreeting();
            renderTimeline();

            if (
                detail.loggedIn &&
                !isPendingApproval()
            ) {
                await loadAvailableJobs();
            } else {
                homeState.jobs = [];
                renderNoJobs();
            }
        }
    );

    window.addEventListener(
        "taskSelected",
        event => {
            homeState.currentTask =
                event.detail?.task ||
                event.detail ||
                getCurrentTask();

            hideDashboard();
        }
    );

    window.addEventListener(
        "taskCleared",
        async () => {
            homeState.currentTask = null;

            showDashboard();

            if (isLoggedIn()) {
                await loadAvailableJobs();
            }
        }
    );

    window.addEventListener(
        "taskSubmitted",
        async () => {
            homeState.currentTask = null;

            showDashboard();

            await loadAvailableJobs();
        }
    );

    window.addEventListener(
        "taskSkipped",
        async () => {
            homeState.currentTask = null;

            showDashboard();

            await loadAvailableJobs();
        }
    );

    window.addEventListener(
        "profileUpdated",
        async event => {
            homeState.profile =
                event.detail?.profile ||
                getProfile();

            homeState.role =
                normalizeRole(
                    homeState.profile?.role ||
                    getRole()
                );

            renderGreeting();
            renderTimeline();

            if (isLoggedIn()) {
                await loadAvailableJobs();
            }
        }
    );

    window.addEventListener(
        "roleChanged",
        async event => {
            homeState.role =
                normalizeRole(
                    event.detail?.role ||
                    getRole()
                );

            renderGreeting();
            renderTimeline();

            if (isLoggedIn()) {
                await loadAvailableJobs();
            }
        }
    );
}

// ------------------------------------------------------------
// INITIALIZE
// ------------------------------------------------------------

async function initializeHome() {
    if (homeState.initialized) {
        return homeState;
    }

    homeState.initialized = true;

    homeState.user =
        getCurrentUser();

    homeState.profile =
        getProfile();

    homeState.role =
        normalizeRole(
            getRole()
        );

    bindHomeEvents();

    renderGreeting();
    renderTimeline();

    if (!isLoggedIn()) {
        homeState.jobs = [];
        return homeState;
    }

    if (isPendingApproval()) {
        renderPendingApproval();
        renderNoJobs();
        return homeState;
    }

    await loadAvailableJobs();

    return homeState;
}

// ------------------------------------------------------------
// PUBLIC API
// ------------------------------------------------------------

window.homeState = homeState;
window.loadAvailableJobs = loadAvailableJobs;
window.refreshAvailableJobs =
    loadAvailableJobs;
window.openAnnotationTask = openTask;

export {
    homeState,
    initializeHome,
    loadAvailableJobs,
    openTask,
    renderGreeting,
    renderTimeline,
    renderJobs,
    renderNoJobs
};

// ------------------------------------------------------------
// AUTO INITIALIZE
// ------------------------------------------------------------

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeHome();
        },
        { once: true }
    );
} else {
    initializeHome();
}
