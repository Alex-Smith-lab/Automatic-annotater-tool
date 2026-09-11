/* ============================================================
   HOME.JS
   Dashboard, greeting, available jobs and workbench
   ============================================================ */

import {
    APP_CONFIG,
    normalizeRole,
    roleLabel,
    roleForWorkType,
    isAdminRole,
    isStaffRole,
    isReviewerRole,
    isCoworkerRole
} from "./config.js";

import {
    getSupabase
} from "./supabase.js";

import {
    getUser,
    getProfile,
    getRole,
    isLoggedIn,
    isAdmin,
    isStaff,
    isReviewer,
    isCoworker,
    isPendingApproval,
    refreshProfileStatus,
    onAuthStateChange
} from "./auth.js";

/* ============================================================
   STATE
   ============================================================ */

const homeState = {
    initialized: false,
    loading: false,
    tasks: [],
    lastLoadedAt: null,
    refreshTimer: null
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

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showElement(element, display = "") {
    if (!element) return;

    element.hidden = false;
    element.style.display = display;
    element.removeAttribute("aria-hidden");
}

function hideElement(element) {
    if (!element) return;

    element.hidden = true;
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
}

/* ============================================================
   TOAST
   ============================================================ */

function showToast(message, type = "info") {
    if (typeof window.showToast === "function") {
        window.showToast(message, type);
        return;
    }

    const container =
        $("toastContainer");

    if (!container) {
        console.log(message);
        return;
    }

    const toast =
        document.createElement("div");

    toast.className =
        `toast toast-${type}`;

    toast.textContent =
        String(message || "");

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

/* ============================================================
   TIME / GREETING
   ============================================================ */

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

function getUserDisplayName() {
    const profile = getProfile();
    const user = getUser();

    return (
        profile?.full_name ||
        profile?.name ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email?.split("@")?.[0] ||
        "there"
    );
}

function renderGreeting() {
    const info =
        getTimeInfo();

    const name =
        getUserDisplayName();

    const role =
        normalizeRole(getRole());

    const roleText =
        roleLabel(role);

    const greeting =
        $("dashboardGreetingText");

    const nameElement =
        $("dashboardUserName");

    const roleElement =
        $("dashboardRoleText");

    const avatar =
        $("dashboardAvatar");

    const fallback =
        $("dashboardAvatarFallback");

    if (greeting) {
        greeting.textContent =
            `${info.greeting} ${info.emoji}`;
    }

    if (nameElement) {
        nameElement.textContent =
            name;
    }

    if (roleElement) {
        roleElement.textContent =
            roleText;
    }

    /*
     * Keep the entire greeting centered.
     */
    const greetingContainer =
        $("dashboardGreeting");

    if (greetingContainer) {
        greetingContainer.classList.add(
            "dashboard-greeting-centered"
        );
    }

    /*
     * Dashboard avatar.
     */
    const profile =
        getProfile();

    const avatarUrl =
        profile?.avatar_url ||
        profile?.avatar ||
        getUser()?.user_metadata?.avatar_url ||
        "";

    if (avatar && avatarUrl) {
        avatar.src = avatarUrl;
        showElement(avatar);
        hideElement(fallback);
    } else if (avatar) {
        hideElement(avatar);

        if (fallback) {
            fallback.textContent =
                name.charAt(0).toUpperCase();

            showElement(fallback);
        }
    }
}

/* ============================================================
   TIMELINE
   ============================================================ */

function renderTimeline() {
    const timeline =
        $("dashboardTimeline");

    if (!timeline) {
        return;
    }

    const info =
        getTimeInfo();

    const name =
        getUserDisplayName();

    const role =
        roleLabel(getRole());

    timeline.innerHTML = `
        <div class="timeline-item timeline-account">
            <span class="timeline-dot">${info.emoji}</span>
            <div class="timeline-content">
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(role)}</span>
            </div>
        </div>

        <div class="timeline-line"></div>

        <div class="timeline-item timeline-status">
            <span class="timeline-dot">💼</span>
            <div class="timeline-content">
                <strong>Workspace</strong>
                <span>Ready for your next task</span>
            </div>
        </div>
    `;
}

/* ============================================================
   ROLE / WORK TYPE
   ============================================================ */

function getWorkType(task) {
    return (
        task?.work_type ||
        task?.task_type ||
        task?.shape ||
        task?.annotation_type ||
        "box"
    );
}

function getTaskRole(task) {
    return (
        task?.work_role ||
        task?.required_role ||
        task?.role ||
        roleForWorkType(
            getWorkType(task)
        )
    );
}

function getWorkTypeLabel(workType) {
    const value =
        String(workType || "")
            .toLowerCase()
            .replace(/[_-]+/g, " ");

    const labels = {
        box: "2D Bounding Box",
        "2d box": "2D Bounding Box",
        boundingbox: "2D Bounding Box",
        polygon: "Polygon",
        segmentation: "Segmentation",
        segment: "Segmentation"
    };

    if (labels[value]) {
        return labels[value];
    }

    return value
        .replace(/\b\w/g, letter =>
            letter.toUpperCase()
        );
}

/* ============================================================
   TASK NORMALIZATION
   ============================================================ */

function normalizeTask(task) {
    if (!task) {
        return null;
    }

    const workType =
        getWorkType(task);

    const workRole =
        getTaskRole(task);

    return {
        ...task,

        id:
            task.id ||
            task.task_id ||
            null,

        title:
            task.title ||
            task.name ||
            "Untitled task",

        work_type:
            workType,

        work_role:
            workRole,

        work_type_label:
            getWorkTypeLabel(workType),

        role_label:
            roleLabel(
                normalizeRole(workRole)
            ),

        duration:
            task.expected_duration ||
            task.duration ||
            task.estimated_duration ||
            "Not specified",

        pay:
            task.pay ??
            task.payment ??
            task.amount ??
            0,

        status:
            task.status ||
            "available",

        media_path:
            task.media_path ||
            task.file_path ||
            task.storage_path ||
            null,

        media_type:
            task.media_type ||
            task.mediaType ||
            "image"
    };
}

/* ============================================================
   PAYMENT DISPLAY
   ============================================================ */

function formatPay(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "Pay not specified";
    }

    const number =
        Number(value);

    if (Number.isFinite(number)) {
        return `KSh ${number.toLocaleString(
            "en-KE",
            {
                minimumFractionDigits:
                    number % 1 === 0 ? 0 : 2,
                maximumFractionDigits: 2
            }
        )}`;
    }

    return escapeHtml(value);
}

/* ============================================================
   DURATION DISPLAY
   ============================================================ */

function formatDuration(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "Not specified";
    }

    if (typeof value === "number") {
        if (value < 60) {
            return `${value} min`;
        }

        const hours =
            Math.floor(value / 60);

        const minutes =
            value % 60;

        if (!minutes) {
            return `${hours} hr`;
        }

        return `${hours} hr ${minutes} min`;
    }

    return String(value);
}

/* ============================================================
   ROLE MATCHING
   ============================================================ */

function taskMatchesUser(task) {
    const role =
        normalizeRole(getRole());

    /*
     * Admin and staff can see everything.
     */
    if (
        isAdminRole(role) ||
        isStaffRole(role)
    ) {
        return true;
    }

    const taskRole =
        normalizeRole(
            task.work_role ||
            task.required_role ||
            ""
        );

    /*
     * If the task has an explicit assigned user, only that
     * user should see it.
     */
    const user =
        getUser();

    if (
        task.assigned_to &&
        user?.id
    ) {
        return (
            task.assigned_to ===
            user.id
        );
    }

    if (
        task.claimed_by &&
        user?.id
    ) {
        return (
            task.claimed_by ===
            user.id
        );
    }

    /*
     * Customer tasks are customer-facing.
     */
    if (
        role === "customer"
    ) {
        return (
            !taskRole ||
            taskRole === "customer"
        );
    }

    /*
     * Reviewer tasks.
     */
    if (
        role === "reviewer"
    ) {
        return (
            taskRole === "reviewer" ||
            taskRole === "review" ||
            taskRole === ""
        );
    }

    /*
     * Coworker tasks must match the specific worker role.
     */
    if (
        isCoworkerRole(role)
    ) {
        return (
            taskRole === role
        );
    }

    return false;
}

/* ============================================================
   TASK STATUS
   ============================================================ */

function isAvailableTask(task) {
    const status =
        String(
            task?.status ||
            "available"
        ).toLowerCase();

    return [
        "available",
        "open",
        "pending",
        "queued",
        "ready"
    ].includes(status);
}

/* ============================================================
   LOAD AVAILABLE JOBS
   ============================================================ */

export async function loadAvailableJobs(
    options = {}
) {
    if (homeState.loading) {
        return homeState.tasks;
    }

    if (!isLoggedIn()) {
        homeState.tasks = [];
        renderAvailableJobs();
        return [];
    }

    if (isPendingApproval()) {
        homeState.tasks = [];
        renderAvailableJobs();
        return [];
    }

    homeState.loading = true;

    try {
        const client =
            getSupabase();

        if (!client) {
            throw new Error(
                "Supabase is not initialized."
            );
        }

        const table =
            APP_CONFIG.tables.tasks;

        /*
         * Get open/available tasks first.
         *
         * Do not rely on a single status value because older
         * tasks may use "open" while newer tasks use "available".
         */
        let query =
            client
                .from(table)
                .select("*")
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(
                    Number(
                        options.limit ||
                        50
                    )
                );

        const {
            data,
            error
        } = await query;

        if (error) {
            throw error;
        }

        const tasks =
            Array.isArray(data)
                ? data
                    .map(normalizeTask)
                    .filter(Boolean)
                : [];

        /*
         * Client-side filtering keeps this compatible with
         * installations where status/work_role values differ.
         */
        homeState.tasks =
            tasks.filter(task => {
                if (!isAvailableTask(task)) {
                    return false;
                }

                if (
                    task.claimed_by ||
                    task.assigned_to
                ) {
                    /*
                     * An assigned task is only shown to the assigned
                     * person, unless the current user is admin/staff.
                     */
                    if (
                        !isAdmin() &&
                        !isStaff()
                    ) {
                        const user =
                            getUser();

                        return (
                            task.assigned_to ===
                            user?.id
                        );
                    }
                }

                return taskMatchesUser(task);
            });

        homeState.lastLoadedAt =
            new Date();

        renderAvailableJobs();

        return homeState.tasks;
    } catch (error) {
        console.error(
            "Could not load available jobs:",
            error
        );

        homeState.tasks = [];

        renderAvailableJobs(
            "Unable to load jobs right now."
        );

        return [];
    } finally {
        homeState.loading = false;
    }
}

/* ============================================================
   JOB CARD
   ============================================================ */

function renderJobCard(task) {
    const id =
        task.id;

    const workType =
        task.work_type_label ||
        getWorkTypeLabel(
            task.work_type
        );

    const role =
        task.role_label ||
        roleLabel(
            normalizeRole(
                task.work_role
            )
        );

    const duration =
        formatDuration(
            task.duration
        );

    const pay =
        formatPay(
            task.pay
        );

    const title =
        task.title ||
        "Available job";

    return `
        <article
            class="job-card"
            data-task-id="${escapeHtml(id)}"
            tabindex="0"
            role="article"
        >
            <div class="job-card-header">
                <div class="job-card-icon">
                    ${getWorkTypeIcon(task.work_type)}
                </div>

                <div class="job-card-title-wrap">
                    <h3 class="job-card-title">
                        ${escapeHtml(title)}
                    </h3>

                    <span class="job-card-status">
                        Available
                    </span>
                </div>
            </div>

            <div class="job-card-details">

                <div class="job-detail">
                    <span class="job-detail-label">
                        Work type
                    </span>

                    <strong>
                        ${escapeHtml(workType)}
                    </strong>
                </div>

                <div class="job-detail">
                    <span class="job-detail-label">
                        Role
                    </span>

                    <strong>
                        ${escapeHtml(role)}
                    </strong>
                </div>

                <div class="job-detail">
                    <span class="job-detail-label">
                        Expected duration
                    </span>

                    <strong>
                        ${escapeHtml(duration)}
                    </strong>
                </div>

                <div class="job-detail job-pay">
                    <span class="job-detail-label">
                        Pay
                    </span>

                    <strong>
                        ${escapeHtml(pay)}
                    </strong>
                </div>

            </div>

            <div class="job-card-footer">
                <button
                    type="button"
                    class="primary-button open-task-button"
                    data-task-id="${escapeHtml(id)}"
                >
                    Start job
                </button>
            </div>
        </article>
    `;
}

function getWorkTypeIcon(type) {
    const value =
        String(type || "")
            .toLowerCase();

    if (
        value.includes("polygon")
    ) {
        return "⬡";
    }

    if (
        value.includes("segment")
    ) {
        return "✦";
    }

    if (
        value.includes("box") ||
        value.includes("bounding")
    ) {
        return "▣";
    }

    return "◆";
}

/* ============================================================
   RENDER JOBS
   ============================================================ */

export function renderNoJobs(message) {
    const container =
        $("availableJobs");

    const noJobs =
        $("noJobsMessage");

    if (container) {
        container.innerHTML = "";
    }

    if (noJobs) {
        const heading =
            noJobs.querySelector(
                ".no-jobs-title"
            );

        const description =
            noJobs.querySelector(
                ".no-jobs-description"
            );

        if (heading) {
            heading.textContent =
                message ||
                "Oops, looking for more work for you";
        } else {
            noJobs.textContent =
                message ||
                "Oops, looking for more work for you";
        }

        if (description) {
            description.textContent =
                "We’re checking for the next role-matched job. Please check again soon.";
        }

        showElement(noJobs);
    }
}

export function renderAvailableJobs(
    errorMessage = ""
) {
    const container =
        $("availableJobs");

    const noJobs =
        $("noJobsMessage");

    if (!container) {
        return;
    }

    if (
        errorMessage
    ) {
        renderNoJobs(
            errorMessage
        );
        return;
    }

    if (
        !homeState.tasks.length
    ) {
        renderNoJobs();
        return;
    }

    hideElement(noJobs);

    container.innerHTML =
        homeState.tasks
            .map(renderJobCard)
            .join("");

    bindJobButtons();
}

/* ============================================================
   JOB BUTTONS
   ============================================================ */

function bindJobButtons() {
    all(
        ".open-task-button",
        $("availableJobs") || document
    ).forEach(button => {
        if (
            button.dataset.bound === "true"
        ) {
            return;
        }

        button.dataset.bound =
            "true";

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                const id =
                    button.dataset.taskId;

                if (id) {
                    openTask(id);
                }
            }
        );
    });

    all(
        ".job-card",
        $("availableJobs") || document
    ).forEach(card => {
        if (
            card.dataset.keyboardBound === "true"
        ) {
            return;
        }

        card.dataset.keyboardBound =
            "true";

        card.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    /*
                     * Do not trigger when the actual button has focus.
                     */
                    if (
                        document.activeElement?.matches(
                            "button"
                        )
                    ) {
                        return;
                    }

                    event.preventDefault();

                    const id =
                        card.dataset.taskId;

                    if (id) {
                        openTask(id);
                    }
                }
            }
        );
    });
}

/* ============================================================
   OPEN TASK
   ============================================================ */

export async function openTask(taskId) {
    if (!taskId) {
        showToast(
            "This task has no valid ID.",
            "error"
        );
        return;
    }

    if (!isLoggedIn()) {
        showToast(
            "Please sign in first.",
            "error"
        );
        return;
    }

    if (isPendingApproval()) {
        showToast(
            "Your account is waiting for administrator approval.",
            "warning"
        );
        return;
    }

    const task =
        homeState.tasks.find(
            item =>
                String(item.id) ===
                String(taskId)
        );

    /*
     * If the task isn't currently in the dashboard list, still
     * allow the task module to handle it. This is important for
     * reviewer continuation and direct task links.
     */
    try {
        window.dispatchEvent(
            new CustomEvent(
                "taskSelected",
                {
                    detail: {
                        taskId,
                        task
                    }
                }
            )
        );

        /*
         * The tasks module listens for taskSelected. If it exposes
         * an open/select method, use it too.
         */
        if (
            typeof window.openTask ===
            "function" &&
            window.openTask !== openTask
        ) {
            await window.openTask(
                taskId
            );
        }
    } catch (error) {
        console.error(
            "Could not open task:",
            error
        );

        showToast(
            "Unable to open this task.",
            "error"
        );
    }
}

/* ============================================================
   WORKBENCH
   ============================================================ */

function renderWorkbench() {
    const container =
        $("coworkerWorkbench");

    const dashboard =
        $("coworkerDashboard");

    const profile =
        getProfile();

    const role =
        normalizeRole(
            getRole()
        );

    const worker =
        isCoworkerRole(role);

    if (
        !worker
    ) {
        if (dashboard) {
            hideElement(dashboard);
        }

        return;
    }

    if (dashboard) {
        showElement(dashboard);
    }

    if (container) {
        showElement(container);
    }

    const name =
        getUserDisplayName();

    const nameElement =
        $("workbenchName");

    const roleElement =
        $("workbenchRole");

    const annotationType =
        $("workbenchAnnotationType");

    const avatar =
        $("workbenchAvatar");

    if (nameElement) {
        nameElement.textContent =
            name;
    }

    if (roleElement) {
        roleElement.textContent =
            roleLabel(role);
    }

    if (annotationType) {
        annotationType.textContent =
            getWorkbenchAnnotationType(
                role
            );
    }

    const avatarUrl =
        profile?.avatar_url ||
        profile?.avatar ||
        getUser()?.user_metadata?.avatar_url ||
        "";

    if (
        avatar &&
        avatarUrl
    ) {
        avatar.src =
            avatarUrl;

        showElement(avatar);
    }
}

function getWorkbenchAnnotationType(role) {
    if (
        role === "coworker_2d_box"
    ) {
        return "2D Bounding Box";
    }

    if (
        role === "coworker_polygon"
    ) {
        return "Polygon";
    }

    if (
        role === "coworker_segmentation"
    ) {
        return "Segmentation";
    }

    return "AI Annotation";
}

/* ============================================================
   CUSTOMER / ADMIN DASHBOARD VISIBILITY
   ============================================================ */

function updateDashboardRoleVisibility() {
    const role =
        normalizeRole(
            getRole()
        );

    const customerUpload =
        $("customerUploadPanel");

    const manualPanel =
        $("manualAnnotationTypePanel");

    /*
     * Coworkers cannot customer-upload or use the manual
     * annotation type selector.
     */
    if (
        isCoworkerRole(role)
    ) {
        if (customerUpload) {
            hideElement(
                customerUpload
            );
        }

        if (manualPanel) {
            hideElement(
                manualPanel
            );
        }
    } else {
        /*
         * The upload panel itself is controlled by media.js.
         * Do not force it visible here.
         */
        if (manualPanel) {
            showElement(
                manualPanel
            );
        }
    }

    /*
     * Admin center button.
     */
    const adminButton =
        $("adminCenterButton");

    if (adminButton) {
        if (
            isAdminRole(role)
        ) {
            showElement(
                adminButton
            );

            adminButton.setAttribute(
                "aria-hidden",
                "false"
            );
        } else {
            hideElement(
                adminButton
            );
        }
    }
}

/* ============================================================
   REFRESH BUTTON
   ============================================================ */

function bindRefreshJobs() {
    const button =
        $("refreshJobsButton");

    if (!button) {
        return;
    }

    if (
        button.dataset.bound === "true"
    ) {
        return;
    }

    button.dataset.bound =
        "true";

    button.addEventListener(
        "click",
        async event => {
            event.preventDefault();

            button.disabled =
                true;

            const original =
                button.textContent;

            button.textContent =
                "Refreshing…";

            try {
                await loadAvailableJobs();
            } finally {
                button.disabled =
                    false;

                button.textContent =
                    original;
            }
        }
    );
}

/* ============================================================
   WORKBENCH BUTTONS
   ============================================================ */

function bindWorkbenchButtons() {
    /*
     * Edit tool.
     */
    const edit =
        $("workbenchEditTool");

    if (
        edit &&
        edit.dataset.bound !== "true"
    ) {
        edit.dataset.bound =
            "true";

        edit.addEventListener(
            "click",
            event => {
                event.preventDefault();

                /*
                 * Prefer the actual select/edit tool in the
                 * annotation workspace.
                 */
                const tool =
                    $("editTool") ||
                    $("selectTool");

                if (tool) {
                    tool.click();
                    return;
                }

                /*
                 * Fallback to annotation.js public API.
                 */
                if (
                    typeof window.setAnnotationMode ===
                    "function"
                ) {
                    window.setAnnotationMode(
                        "select"
                    );
                }

                window.dispatchEvent(
                    new CustomEvent(
                        "workbenchEditRequested"
                    )
                );
            }
        );
    }

    /*
     * AI annotation.
     */
    const ai =
        $("workbenchAI");

    if (
        ai &&
        ai.dataset.bound !== "true"
    ) {
        ai.dataset.bound =
            "true";

        ai.addEventListener(
            "click",
            event => {
                event.preventDefault();

                const button =
                    $("autoAnnotate");

                if (
                    button &&
                    !button.disabled
                ) {
                    button.click();
                    return;
                }

                window.dispatchEvent(
                    new CustomEvent(
                        "runAnnotationAI"
                    )
                );
            }
        );
    }

    /*
     * Customer upload.
     * Coworkers never receive this functionality.
     */
    const upload =
        $("workbenchUpload");

    if (
        upload &&
        upload.dataset.bound !== "true"
    ) {
        upload.dataset.bound =
            "true";

        upload.addEventListener(
            "click",
            event => {
                event.preventDefault();

                if (
                    isCoworker()
                ) {
                    showToast(
                        "Coworkers cannot upload customer media.",
                        "warning"
                    );
                    return;
                }

                const input =
                    $("customerMediaInput");

                if (input) {
                    input.click();
                    return;
                }

                const panel =
                    $("customerUploadPanel");

                if (panel) {
                    showElement(panel);
                }
            }
        );
    }

    /*
     * Focus-panel buttons.
     */
    all(
        "[data-focus-panel]"
    ).forEach(button => {
        if (
            button.dataset.focusBound === "true"
        ) {
            return;
        }

        button.dataset.focusBound =
            "true";

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();

                const selector =
                    button.dataset.focusPanel;

                if (!selector) {
                    return;
                }

                const target =
                    document.querySelector(
                        selector
                    ) ||
                    $(selector.replace(
                        /^#/,
                        ""
                    ));

                if (!target) {
                    return;
                }

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                target.classList.add(
                    "workspace-focus"
                );

                setTimeout(() => {
                    target.classList.remove(
                        "workspace-focus"
                    );
                }, 1200);
            }
        );
    });
}

/* ============================================================
   PAGE VISIBILITY
   ============================================================ */

export function showHomePage() {
    const home =
        $("homePage");

    const annotation =
        $("annotationPage");

    const approval =
        $("approvalPage");

    if (home) {
        showElement(home);
    }

    if (annotation) {
        hideElement(annotation);
    }

    if (approval) {
        hideElement(approval);
    }

    renderGreeting();
    renderTimeline();
    renderWorkbench();
    updateDashboardRoleVisibility();

    if (
        isLoggedIn() &&
        !isPendingApproval()
    ) {
        loadAvailableJobs();
    } else {
        renderAvailableJobs();
    }
}

export function showApprovalPage() {
    const home =
        $("homePage");

    const annotation =
        $("annotationPage");

    const approval =
        $("approvalPage");

    if (home) {
        hideElement(home);
    }

    if (annotation) {
        hideElement(annotation);
    }

    if (approval) {
        showElement(approval);
    }
}

/* ============================================================
   AUTH UI
   ============================================================ */

function updateAuthUI() {
    if (!isLoggedIn()) {
        return;
    }

    if (
        isPendingApproval()
    ) {
        showApprovalPage();
        return;
    }

    showHomePage();
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

function bindTaskEvents() {
    window.addEventListener(
        "taskSubmitted",
        async () => {
            await loadAvailableJobs();
        }
    );

    window.addEventListener(
        "taskSkipped",
        async () => {
            await loadAvailableJobs();
        }
    );

    window.addEventListener(
        "taskCleared",
        async () => {
            /*
             * Returning to dashboard should refresh available work.
             */
            if (
                isLoggedIn() &&
                !isPendingApproval()
            ) {
                await loadAvailableJobs();
            }
        }
    );

    window.addEventListener(
        "taskUpdated",
        async () => {
            if (
                isLoggedIn() &&
                !isPendingApproval()
            ) {
                await loadAvailableJobs();
            }
        }
    );
}

function bindNavigation() {
    const homeButton =
        $("homeButton");

    if (
        homeButton &&
        homeButton.dataset.bound !== "true"
    ) {
        homeButton.dataset.bound =
            "true";

        homeButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                if (
                    isPendingApproval()
                ) {
                    showApprovalPage();
                } else {
                    showHomePage();
                }
            }
        );
    }

    const backButton =
        $("backToHomeButton");

    if (
        backButton &&
        backButton.dataset.bound !== "true"
    ) {
        backButton.dataset.bound =
            "true";

        backButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                showHomePage();
            }
        );
    }
}

/* ============================================================
   APPROVAL PAGE
   ============================================================ */

function bindApprovalButtons() {
    const refresh =
        $("approvalRefreshButton");

    if (
        refresh &&
        refresh.dataset.bound !== "true"
    ) {
        refresh.dataset.bound =
            "true";

        refresh.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                refresh.disabled =
                    true;

                try {
                    await refreshProfileStatus();

                    if (
                        isPendingApproval()
                    ) {
                        showToast(
                            "Your account is still waiting for administrator approval.",
                            "info"
                        );
                    } else {
                        showToast(
                            "Your account has been approved.",
                            "success"
                        );

                        showHomePage();
                    }
                } finally {
                    refresh.disabled =
                        false;
                }
            }
        );
    }

    const logout =
        $("approvalLogoutButton");

    if (
        logout &&
        logout.dataset.bound !== "true"
    ) {
        logout.dataset.bound =
            "true";

        logout.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                if (
                    typeof window.signOut ===
                    "function"
                ) {
                    await window.signOut();
                    return;
                }

                window.dispatchEvent(
                    new CustomEvent(
                        "requestSignOut"
                    )
                );
            }
        );
    }
}

/* ============================================================
   PERIODIC APPROVAL CHECK
   ============================================================ */

function startApprovalPolling() {
    if (
        homeState.refreshTimer
    ) {
        clearInterval(
            homeState.refreshTimer
        );
    }

    homeState.refreshTimer =
        setInterval(
            async () => {
                if (
                    !isLoggedIn()
                ) {
                    return;
                }

                if (
                    !isPendingApproval()
                ) {
                    return;
                }

                try {
                    await refreshProfileStatus();

                    if (
                        !isPendingApproval()
                    ) {
                        showHomePage();
                    }
                } catch (error) {
                    console.warn(
                        "Approval status refresh failed:",
                        error
                    );
                }
            },
            60000
        );
}

/* ============================================================
   AUTH STATE CHANGES
   ============================================================ */

function bindAuthChanges() {
    onAuthStateChange(
        () => {
            renderGreeting();
            renderTimeline();
            renderWorkbench();
            updateDashboardRoleVisibility();
            updateAuthUI();
        }
    );
}

/* ============================================================
   CLOCK REFRESH
   ============================================================ */

function startClockRefresh() {
    setInterval(
        () => {
            if (
                isLoggedIn() &&
                !isPendingApproval()
            ) {
                renderGreeting();
                renderTimeline();
            }
        },
        60000
    );
}

/* ============================================================
   HOME INITIALIZATION
   ============================================================ */

export async function initializeHome() {
    if (
        homeState.initialized
    ) {
        return;
    }

    homeState.initialized =
        true;

    bindRefreshJobs();
    bindWorkbenchButtons();
    bindNavigation();
    bindTaskEvents();
    bindApprovalButtons();
    bindAuthChanges();

    startApprovalPolling();
    startClockRefresh();

    /*
     * Wait for auth startup if necessary.
     */
    if (
        isLoggedIn()
    ) {
        updateAuthUI();
    }
}

/* ============================================================
   PUBLIC REFRESH
   ============================================================ */

export async function refreshHome() {
    renderGreeting();
    renderTimeline();
    renderWorkbench();
    updateDashboardRoleVisibility();

    if (
        isLoggedIn() &&
        !isPendingApproval()
    ) {
        return await loadAvailableJobs();
    }

    renderAvailableJobs();

    return [];
}

/* ============================================================
   GLOBAL COMPATIBILITY
   ============================================================ */

if (
    typeof window !== "undefined"
) {
    window.homeState =
        homeState;

    window.loadAvailableJobs =
        loadAvailableJobs;

    window.refreshHome =
        refreshHome;

    window.renderAvailableJobs =
        renderAvailableJobs;

    window.showHomePage =
        showHomePage;

    window.showApprovalPage =
        showApprovalPage;

    window.openTask =
        window.openTask ||
        openTask;

    window.getTimeInfo =
        getTimeInfo;
}

/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (
    typeof document !== "undefined"
) {
    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                initializeHome()
                    .catch(error => {
                        console.error(
                            "Home initialization failed:",
                            error
                        );
                    });
            },
            {
                once: true
            }
        );
    } else {
        initializeHome()
            .catch(error => {
                console.error(
                    "Home initialization failed:",
                    error
                );
            });
    }
}

/* ============================================================
   EXPORTS
   ============================================================ */

export default {
    homeState,
    initializeHome,
    refreshHome,
    loadAvailableJobs,
    renderAvailableJobs,
    renderNoJobs,
    showHomePage,
    showApprovalPage,
    openTask,
    getTimeInfo
};
