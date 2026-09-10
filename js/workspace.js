// ============================================================
// ANNOTATION AI
// WORKSPACE LAYOUT / ROLE ACCESS / DASHBOARD UI
// File: js/workspace.js
// ============================================================

import {
    getSupabase,
    getCurrentUser,
    getCurrentSession
} from "./supabase.js";

import {
    normalizeRole,
    roleLabel,
    annotationTypeForRole
} from "./config.js";


// ============================================================
// STATE
// ============================================================

const state = {

    initialized:
        false,

    profile:
        null,

    user:
        null,

    role:
        "customer"
};


// ============================================================
// DOM
// ============================================================

function $(id) {
    return document.getElementById(id);
}


// ============================================================
// EVENT HELPER
// ============================================================

function emit(
    name,
    detail = {}
) {
    window.dispatchEvent(
        new CustomEvent(
            String(name),
            {
                detail
            }
        )
    );
}


// ============================================================
// HTML SAFETY
// ============================================================

function escapeHTML(
    value
) {
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


// ============================================================
// USER NAME
// ============================================================

function getName(
    user,
    profile = null
) {

    return (
        profile?.full_name ||

        user?.user_metadata?.full_name ||

        user?.user_metadata?.name ||

        user?.user_metadata?.display_name ||

        user?.email?.split("@")[0] ||

        "Coworker"
    );
}


// ============================================================
// TIME GREETING
// ============================================================

function getGreeting() {

    const hour =
        new Date().getHours();


    if (hour < 5) {

        return {
            text:
                "Please get some sleep",

            emoji:
                "🌙"
        };
    }


    if (hour < 12) {

        return {
            text:
                "Good morning",

            emoji:
                "☀️"
        };
    }


    if (hour < 18) {

        return {
            text:
                "Good afternoon",

            emoji:
                "🌤️"
        };
    }


    if (hour < 22) {

        return {
            text:
                "Good evening",

            emoji:
                "🌆"
        };
    }


    return {

        text:
            "Good night",

        emoji:
            "🌙"
    };
}


// ============================================================
// DISPLAY
// ============================================================

function setDisplay(
    element,
    visible,
    display = ""
) {

    if (!element) {
        return;
    }


    element.style.display =
        visible
            ? display
            : "none";


    element.hidden =
        !visible;
}


// ============================================================
// ROLE HELPERS
// ============================================================

function isCoworker(
    role
) {

    return [

        "coworker_2d_box",

        "coworker_polygon",

        "coworker_segmentation"

    ].includes(
        normalizeRole(role)
    );
}


function hasAllAccess(
    role
) {

    return [

        "admin",

        "staff"

    ].includes(
        normalizeRole(role)
    );
}


function isReviewer(
    role
) {

    return [

        "admin",

        "staff",

        "reviewer"

    ].includes(
        normalizeRole(role)
    );
}


// ============================================================
// ANNOTATION TYPE LABEL
// ============================================================

function annotationTypeLabel(
    type
) {

    switch (
        String(type || "")
            .toLowerCase()
    ) {

        case "box":
            return "2D Box";

        case "polygon":
            return "Polygon";

        case "segmentation":
            return "Segmentation";

        default:
            return "All tools";
    }
}


// ============================================================
// GREETING
// ============================================================

function applyGreeting() {

    const greeting =
        getGreeting();


    const name =
        getName(
            state.user,
            state.profile
        );


    const dashboardGreeting =
        $("dashboardGreeting");


    if (
        dashboardGreeting
    ) {

        dashboardGreeting.innerHTML =

            `${escapeHTML(
                greeting.text
            )}, ` +

            `<span class="greeting-name">` +

            `${escapeHTML(name)}` +

            `</span> ` +

            `<span ` +

            `class="greeting-time-emoji" ` +

            `aria-label="time">` +

            `${greeting.emoji}` +

            `</span>`;
    }


    const avatar =
        state.profile?.avatar_url ||

        state.user?.user_metadata?.avatar_url ||

        "";


    const dashboardAvatar =
        $("dashboardAvatar");


    if (
        dashboardAvatar
    ) {

        if (avatar) {

            dashboardAvatar.innerHTML =

                `<img ` +

                `src="${escapeHTML(
                    avatar
                )}" ` +

                `alt="" />`;

        } else {

            dashboardAvatar.textContent =

                name
                    .charAt(0)
                    .toUpperCase();
        }
    }


    const workbenchName =
        $("workbenchName");


    if (
        workbenchName
    ) {

        workbenchName.textContent =
            name;
    }


    const workbenchRole =
        $("workbenchRole");


    if (
        workbenchRole
    ) {

        workbenchRole.textContent =
            roleLabel(
                state.role
            );
    }


    const assignedType =
        annotationTypeForRole(
            state.role
        );


    const workbenchType =
        $("workbenchAnnotationType");


    if (
        workbenchType
    ) {

        workbenchType.textContent =

            annotationTypeLabel(
                assignedType
            );
    }


    const workbenchAvatar =
        $("workbenchAvatar");


    if (
        workbenchAvatar
    ) {

        if (avatar) {

            workbenchAvatar.innerHTML =

                `<img ` +

                `src="${escapeHTML(
                    avatar
                )}" ` +

                `alt="" />`;

        } else {

            workbenchAvatar.textContent =

                name
                    .charAt(0)
                    .toUpperCase();
        }
    }


    updateTimeline();
}


// ============================================================
// ACCOUNT TIMELINE
// ============================================================

function updateTimeline() {

    const dashboard =
        $("coworkerDashboard");


    if (!dashboard) {
        return;
    }


    let timeline =
        dashboard.querySelector(
            ".account-timeline"
        );


    if (!timeline) {

        timeline =
            document.createElement(
                "div"
            );


        timeline.className =
            "account-timeline";


        const inner =
            dashboard.querySelector(
                ".dashboard-inner"
            );


        const greeting =
            dashboard.querySelector(
                ".dashboard-greeting"
            );


        if (
            inner &&
            greeting
        ) {

            greeting.after(
                timeline
            );

        } else if (inner) {

            inner.prepend(
                timeline
            );
        }
    }


    const name =
        getName(
            state.user,
            state.profile
        );


    const greeting =
        getGreeting();


    timeline.innerHTML = `

        <div class="timeline-line"></div>


        <div class="timeline-step active">

            <span
                class="timeline-dot"
                aria-hidden="true"
            >
                👤
            </span>

            <div>

                <strong>
                    ${escapeHTML(name)}
                </strong>

                <small>
                    ${escapeHTML(
                        roleLabel(
                            state.role
                        )
                    )}
                </small>

            </div>

        </div>


        <div class="timeline-step">

            <span
                class="timeline-dot"
                aria-hidden="true"
            >
                ${greeting.emoji}
            </span>

            <div>

                <strong>
                    ${escapeHTML(
                        greeting.text
                    )}
                </strong>

                <small>
                    Your work timeline for today
                </small>

            </div>

        </div>


        <div class="timeline-step">

            <span
                class="timeline-dot"
                aria-hidden="true"
            >
                🧰
            </span>

            <div>

                <strong>
                    Workspace ready
                </strong>

                <small>
                    Role-matched work appears below
                </small>

            </div>

        </div>
    `;
}


// ============================================================
// ROLE VISIBILITY
// ============================================================

function applyRoleVisibility() {

    const role =
        normalizeRole(
            state.role
        );


    document.body.dataset.userRole =
        role;


    document.documentElement.dataset.userRole =
        role;


    const customerUpload =
        $("customerUploadPanel");


    const annotationType =
        $("annotationTypePanel");


    const workbenchUpload =
        $("workbenchUpload");


    const workbenchType =
        document.querySelector(
            '[data-focus-panel="annotationTypePanel"]'
        );


    const taskQueue =
        $("taskQueuePanel");


    const aiPanel =
        $("aiPanel");


    const workbenchAI =
        $("workbenchAI");


    const adminButton =
        $("adminCenterButton");


    const approveButton =
        $("approveTaskBtn");


    const completeButton =
        $("completeTask");


    const submitButton =
        $("submitTaskButton");


    const editTools =
        $("editToolsPanel");


    /*
     * Customers can upload customer media.
     * Staff/admin have all access.
     *
     * Coworkers must NOT receive customer upload.
     */

    const uploadAllowed =

        hasAllAccess(role) ||

        role === "customer";


    /*
     * Coworkers do not receive the free
     * annotation type selector.
     */

    const manualTypeAllowed =

        hasAllAccess(role) ||

        isReviewer(role) ||

        role === "customer";


    /*
     * Users who can actively work on annotations.
     */

    const canWork =

        hasAllAccess(role) ||

        isReviewer(role) ||

        isCoworker(role);


    setDisplay(
        customerUpload,
        uploadAllowed
    );


    setDisplay(
        annotationType,
        manualTypeAllowed
    );


    setDisplay(
        workbenchUpload,
        uploadAllowed
    );


    setDisplay(
        workbenchType,
        manualTypeAllowed
    );


    setDisplay(
        editTools,
        canWork
    );


    /*
     * AI is deliberately available to coworkers.
     */

    setDisplay(
        aiPanel,
        canWork
    );


    setDisplay(
        workbenchAI,
        canWork
    );


    /*
     * Admin button is ONLY visible to admin.
     */

    setDisplay(
        adminButton,
        role === "admin"
    );


    setDisplay(
        approveButton,
        isReviewer(role)
    );


    setDisplay(
        completeButton,
        canWork
    );


    setDisplay(
        submitButton,
        canWork
    );


    setDisplay(
        taskQueue,
        true
    );


    /*
     * Coworkers never receive upload/type controls.
     */

    if (
        isCoworker(role)
    ) {

        setDisplay(
            customerUpload,
            false
        );


        setDisplay(
            annotationType,
            false
        );


        setDisplay(
            workbenchUpload,
            false
        );


        setDisplay(
            workbenchType,
            false
        );
    }


    /*
     * Lock the annotation type to the coworker's role.
     */

    const assignedType =
        annotationTypeForRole(
            role
        );


    if (
        assignedType
    ) {

        document
            .querySelectorAll(
                "#annotationTypePanel [data-tool]"
            )
            .forEach(
                button => {

                    const buttonType =
                        button.dataset.tool;


                    button.disabled =
                        buttonType !==
                        assignedType;


                    button.classList.toggle(
                        "role-locked",
                        buttonType !==
                            assignedType
                    );
                }
            );


        /*
         * Force the actual annotation engine
         * onto the correct shape.
         */

        if (
            typeof window.setAnnotationType ===
            "function"
        ) {

            try {

                window.setAnnotationType(
                    assignedType
                );

            } catch (error) {

                console.warn(
                    "Could not lock annotation type:",
                    error
                );
            }
        }
    }
}


// ============================================================
// HOME LAYOUT
// ============================================================

function applyHomeLayout() {

    document.body.classList.add(
        "annotation-modern-layout"
    );


    document
        .querySelector(".app")
        ?.classList.add(
            "modern-app"
        );
}


// ============================================================
// APPROVAL PAGE
// ============================================================

function showApprovalPage(
    message = ""
) {

    const approval =
        $("approvalPage");


    if (!approval) {
        return;
    }


    setDisplay(
        approval,
        true,
        "flex"
    );


    const text =
        approval.querySelector(
            "p"
        );


    if (
        text &&
        message
    ) {

        text.textContent =
            message;
    }


    setDisplay(
        $("coworkerDashboard"),
        false
    );


    setDisplay(
        $("coworkerWorkbench"),
        false
    );


    document.body.classList.add(
        "account-awaiting-approval"
    );
}


function hideApprovalPage() {

    setDisplay(
        $("approvalPage"),
        false
    );


    document.body.classList.remove(
        "account-awaiting-approval"
    );
}


// ============================================================
// LOAD PROFILE
// ============================================================

async function loadProfile(
    user
) {

    const client =
        getSupabase();


    if (
        !client ||
        !user?.id
    ) {

        return null;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from("profiles")
                .select("*")
                .eq(
                    "id",
                    user.id
                )
                .maybeSingle();


        if (error) {

            console.warn(
                "Profile lookup failed:",
                error.message
            );

            return null;
        }


        return data ||
            null;

    } catch (error) {

        console.warn(
            "Profile lookup failed:",
            error
        );

        return null;
    }
}


// ============================================================
// WORK HISTORY PAYMENT VISIBILITY
// ============================================================

async function updatePaymentHistoryVisibility() {

    const button =
        $("workHistoryButton");


    if (!button) {
        return;
    }


    const client =
        getSupabase();


    if (
        !client ||
        !state.user?.id
    ) {

        return;
    }


    try {

        const {
            data,
            error
        } =
            await client
                .from("task_payments")
                .select(
                    "status"
                )
                .eq(
                    "user_id",
                    state.user.id
                );


        if (
            error ||
            !Array.isArray(data)
        ) {

            return;
        }


        const hasUnpaid =
            data.some(
                row =>
                    String(
                        row.status
                    ).toLowerCase() !==
                    "paid"
            );


        /*
         * Keep history while there are unpaid records.
         * If everything is paid, hide the shortcut.
         */

        setDisplay(
            button,
            hasUnpaid ||
            data.length === 0
        );

    } catch (error) {

        console.warn(
            "Could not check payment history:",
            error
        );
    }
}


// ============================================================
// OPEN MODAL
// ============================================================

function openModal(
    id
) {

    const modal =
        $(id);


    if (!modal) {
        return false;
    }


    modal.style.display =
        "flex";


    modal.hidden =
        false;


    modal.classList.add(
        "open"
    );


    return true;
}


// ============================================================
// CLOSE MODAL
// ============================================================

function closeModal(
    id
) {

    const modal =
        $(id);


    if (!modal) {
        return false;
    }


    modal.classList.remove(
        "open"
    );


    modal.style.display =
        "none";


    modal.hidden =
        true;


    return true;
}


// ============================================================
// SETTINGS
// ============================================================

function openSettings() {

    /*
     * Allow the existing settings system
     * to handle the actual controls first.
     */

    emit(
        "settings:open"
    );


    const modal =
        $("settingsModal");


    if (modal) {

        openModal(
            "settingsModal"
        );
    }
}


// ============================================================
// WORK HISTORY
// ============================================================

function openHistory() {

    openModal(
        "historyModal"
    );


    emit(
        "history:open"
    );


    emit(
        "workHistory:open"
    );
}


// ============================================================
// PROFILE
// ============================================================

function openProfile() {

    openModal(
        "profileModal"
    );


    emit(
        "profile:open"
    );
}


// ============================================================
// ADMIN
// ============================================================

function openAdmin() {

    if (
        state.role !==
        "admin"
    ) {

        return;
    }


    const modal =
        $("adminModal");


    if (!modal) {

        emit(
            "admin:open"
        );

        return;
    }


    modal.classList.add(
        "admin-fullscreen-modal"
    );


    modal.style.display =
        "block";


    modal.hidden =
        false;


    modal.classList.add(
        "open"
    );


    document.body.classList.add(
        "admin-open"
    );


    emit(
        "admin:open"
    );


    /*
     * Give admin.js a chance to refresh its
     * data after the full-screen workspace opens.
     */

    setTimeout(
        () => {

            emit(
                "admin:refresh"
            );

        },
        0
    );
}


// ============================================================
// EDIT TOOL
// ============================================================

function openEditTools() {

    const panel =
        $("editToolsPanel");


    if (!panel) {

        emit(
            "editTools:open"
        );

        return;
    }


    /*
     * In task mode the left editor panel
     * is already visible. Scroll it into view.
     */

    panel.style.display =
        "";


    panel.hidden =
        false;


    panel.scrollIntoView({
        behavior:
            "smooth",

        block:
            "nearest"
    });


    emit(
        "editTools:open",
        {
            panel
        }
    );
}


// ============================================================
// ANNOTATION TYPE TOOL
// ============================================================

function openAnnotationType() {

    const panel =
        $("annotationTypePanel");


    if (!panel) {

        emit(
            "annotationType:open"
        );

        return;
    }


    panel.style.display =
        "";


    panel.hidden =
        false;


    panel.scrollIntoView({
        behavior:
            "smooth",

        block:
            "nearest"
    });


    emit(
        "annotationType:open",
        {
            panel
        }
    );
}


// ============================================================
// WORKBENCH UPLOAD
// ============================================================

function openWorkbenchUpload() {

    /*
     * Coworkers are not allowed to upload.
     */

    if (
        isCoworker(
            state.role
        )
    ) {

        return;
    }


    /*
     * Prefer the existing customer upload
     * control rather than creating a second
     * upload system.
     */

    const uploadInput =
        $("imageUpload") ||

        $("fileUpload") ||

        $("mediaUpload") ||

        $("uploadInput");


    if (
        uploadInput
    ) {

        uploadInput.click();

        return;
    }


    /*
     * Some versions of the application use
     * an upload panel/button instead.
     */

    const uploadButton =
        $("uploadButton") ||

        $("customerUploadButton");


    if (
        uploadButton
    ) {

        uploadButton.click();

        return;
    }


    emit(
        "media:upload"
    );
}


// ============================================================
// WORKBENCH AI
// ============================================================

function openWorkbenchAI() {

    /*
     * AI is available to coworkers,
     * reviewers, staff and admins.
     */

    if (
        !(
            hasAllAccess(state.role) ||

            isReviewer(state.role) ||

            isCoworker(state.role)
        )
    ) {

        return;
    }


    const aiButton =
        $("autoAnnotate") ||

        $("runAI") ||

        $("runAi");


    if (
        aiButton
    ) {

        aiButton.click();

        return;
    }


    emit(
        "annotation:ai"
    );


    emit(
        "ai:run"
    );
}


// ============================================================
// WORKBENCH EDIT TOOL LABEL
// ============================================================

function updateEditToolLabel() {

    const label =
        $("workbenchEditTool");


    if (!label) {
        return;
    }


    let text =
        "Select";


    /*
     * Use the active annotation tool if
     * the annotation engine exposes it.
     */

    const activeTool =
        document.querySelector(
            "#editToolsPanel .active"
        );


    if (
        activeTool
    ) {

        text =
            activeTool.dataset.tool ||

            activeTool.dataset.mode ||

            activeTool.textContent.trim() ||

            "Select";
    }


    label.textContent =
        text;
}


// ============================================================
// WORKBENCH BUTTONS
// ============================================================

function bindWorkbenchButtons() {

    const typeButton =
        document.querySelector(
            '[data-focus-panel="annotationTypePanel"]'
        );


    const editButton =
        document.querySelector(
            '[data-focus-panel="editToolsPanel"]'
        );


    const uploadButton =
        $("workbenchUpload");


    const aiButton =
        $("workbenchAI");


    if (
        typeButton &&
        !typeButton.dataset.workspaceBound
    ) {

        typeButton.dataset.workspaceBound =
            "true";


        typeButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openAnnotationType();
            }
        );
    }


    if (
        editButton &&
        !editButton.dataset.workspaceBound
    ) {

        editButton.dataset.workspaceBound =
            "true";


        editButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openEditTools();
            }
        );
    }


    if (
        uploadButton &&
        !uploadButton.dataset.workspaceBound
    ) {

        uploadButton.dataset.workspaceBound =
            "true";


        uploadButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openWorkbenchUpload();
            }
        );
    }


    if (
        aiButton &&
        !aiButton.dataset.workspaceBound
    ) {

        aiButton.dataset.workspaceBound =
            "true";


        aiButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openWorkbenchAI();
            }
        );
    }


    updateEditToolLabel();
}


// ============================================================
// TOP NAVIGATION
// ============================================================

function bindTopNavigation() {

    const settings =
        $("settingsButton");


    const history =
        $("workHistoryButton");


    const profile =
        $("profileButton");


    const admin =
        $("adminCenterButton");


    if (
        settings &&
        !settings.dataset.workspaceBound
    ) {

        settings.dataset.workspaceBound =
            "true";


        settings.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openSettings();
            }
        );
    }


    if (
        history &&
        !history.dataset.workspaceBound
    ) {

        history.dataset.workspaceBound =
            "true";


        history.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openHistory();
            }
        );
    }


    if (
        profile &&
        !profile.dataset.workspaceBound
    ) {

        profile.dataset.workspaceBound =
            "true";


        profile.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openProfile();
            }
        );
    }


    if (
        admin &&
        !admin.dataset.workspaceBound
    ) {

        admin.dataset.workspaceBound =
            "true";


        admin.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openAdmin();
            }
        );
    }
}


// ============================================================
// ADMIN FULL SCREEN
// ============================================================

function bindAdminFullscreen() {

    const modal =
        $("adminModal");


    if (!modal) {
        return;
    }


    modal.classList.add(
        "admin-fullscreen-modal"
    );


    /*
     * Close buttons inside the existing admin
     * interface continue to be handled by admin.js.
     */

    modal
        .querySelectorAll(
            "[data-close-admin], #closeAdminModal"
        )
        .forEach(
            button => {

                if (
                    button.dataset.workspaceBound
                ) {

                    return;
                }


                button.dataset.workspaceBound =
                    "true";


                button.addEventListener(
                    "click",
                    () => {

                        modal.classList.remove(
                            "open"
                        );


                        modal.style.display =
                            "none";


                        document.body.classList.remove(
                            "admin-open"
                        );
                    }
                );
            }
        );
}


// ============================================================
// PROFILE REFRESH
// ============================================================

async function refreshUserUI() {

    const user =
        state.user ||

        await getCurrentUser();


    if (!user) {

        return;
    }


    state.user =
        user;


    state.profile =
        await loadProfile(
            user
        );


    /*
     * The database profile is authoritative.
     * User metadata is only a fallback.
     */

    state.role =
        normalizeRole(

            state.profile?.role ||

            user.user_metadata?.role ||

            "customer"
        );


    applyGreeting();

    applyRoleVisibility();

    applyHomeLayout();

    bindWorkbenchButtons();

    bindTopNavigation();

    bindAdminFullscreen();

    await updatePaymentHistoryVisibility();


    /*
     * Kicked / inactive users must not be
     * allowed into the working interface.
     */

    if (
        state.profile &&
        state.profile.active === false
    ) {

        showApprovalPage(
            "Your account is waiting for admin approval. Please wait until an administrator restores your access."
        );

    } else {

        hideApprovalPage();
    }


    emit(
        "workspace:user-ready",
        {
            user:
                state.user,

            profile:
                state.profile,

            role:
                state.role
        }
    );
}


// ============================================================
// EVENTS
// ============================================================

function bindEvents() {

    if (
        window.__workspaceEventsBound
    ) {

        return;
    }


    window.__workspaceEventsBound =
        true;


    /*
     * Login
     */

    window.addEventListener(
        "auth:login",
        async event => {

            state.user =
                event.detail?.user ||

                await getCurrentUser();


            await refreshUserUI();
        }
    );


    /*
     * Session
     */

    window.addEventListener(
        "app:session",
        async event => {

            if (
                event.detail?.user
            ) {

                state.user =
                    event.detail.user;


                await refreshUserUI();
            }
        }
    );


    /*
     * Generic application auth event.
     */

    window.addEventListener(
        "application-auth-state",
        async event => {

            const user =
                event.detail?.user;


            if (user) {

                state.user =
                    user;


                await refreshUserUI();

            } else {

                state.user =
                    null;

                state.profile =
                    null;

                state.role =
                    "customer";
            }
        }
    );


    /*
     * Logout.
     */

    window.addEventListener(
        "auth:logout",
        () => {

            state.user =
                null;

            state.profile =
                null;

            state.role =
                "customer";


            document.body.dataset.userRole =
                "guest";


            hideApprovalPage();
        }
    );


    /*
     * Task selected.
     */

    window.addEventListener(
        "taskSelected",
        () => {

            document.body.classList.add(
                "task-mode"
            );


            bindWorkbenchButtons();

            updateEditToolLabel();
        }
    );


    window.addEventListener(
        "task:selected",
        () => {

            document.body.classList.add(
                "task-mode"
            );


            bindWorkbenchButtons();

            updateEditToolLabel();
        }
    );


    window.addEventListener(
        "annotation:taskSelected",
        () => {

            document.body.classList.add(
                "task-mode"
            );
        }
    );


    /*
     * Task cleared.
     */

    window.addEventListener(
        "taskCleared",
        () => {

            document.body.classList.remove(
                "task-mode"
            );
        }
    );


    window.addEventListener(
        "task:cleared",
        () => {

            document.body.classList.remove(
                "task-mode"
            );
        }
    );


    /*
     * Submitted.
     */

    window.addEventListener(
        "taskSubmitted",
        async () => {

            document.body.classList.remove(
                "task-mode"
            );


            await updatePaymentHistoryVisibility();
        }
    );


    window.addEventListener(
        "task:submitted",
        async () => {

            document.body.classList.remove(
                "task-mode"
            );


            await updatePaymentHistoryVisibility();
        }
    );


    /*
     * Skipped.
     */

    window.addEventListener(
        "taskSkipped",
        () => {

            document.body.classList.remove(
                "task-mode"
            );
        }
    );


    window.addEventListener(
        "task:skipped",
        () => {

            document.body.classList.remove(
                "task-mode"
            );
        }
    );


    /*
     * Annotation tool changes.
     */

    window.addEventListener(
        "annotation:toolChanged",
        updateEditToolLabel
    );


    window.addEventListener(
        "annotation:modeChanged",
        updateEditToolLabel
    );


    window.addEventListener(
        "annotation:typeChanged",
        applyGreeting
    );


    /*
     * Profile picture changed.
     */

    window.addEventListener(
        "profile:updated",
        async event => {

            if (
                event.detail?.profile
            ) {

                state.profile =
                    event.detail.profile;
            }


            await refreshUserUI();
        }
    );


    /*
     * Admin closed.
     */

    window.addEventListener(
        "admin:close",
        () => {

            const modal =
                $("adminModal");


            if (modal) {

                modal.classList.remove(
                    "open"
                );


                modal.style.display =
                    "none";
            }


            document.body.classList.remove(
                "admin-open"
            );
        }
    );


    /*
     * Rebind after dynamic HTML changes.
     */

    window.addEventListener(
        "workspace:refresh",
        () => {

            bindTopNavigation();

            bindWorkbenchButtons();

            bindAdminFullscreen();

            applyRoleVisibility();

            updateEditToolLabel();
        }
    );
}


// ============================================================
// INITIALIZATION
// ============================================================

export async function initializeWorkspace() {

    if (
        state.initialized
    ) {

        /*
         * Still refresh UI if another module
         * explicitly asks for initialization.
         */

        try {

            await refreshUserUI();

        } catch (_) {}

        return;
    }


    state.initialized =
        true;


    bindEvents();

    bindTopNavigation();

    bindWorkbenchButtons();

    bindAdminFullscreen();


    try {

        const result =
            await getCurrentSession();


        state.user =
            result?.session?.user ||

            null;


        if (
            state.user
        ) {

            await refreshUserUI();
        }

    } catch (error) {

        console.warn(
            "Workspace initialization failed:",
            error
        );
    }
}


// ============================================================
// PUBLIC API
// ============================================================

export {
    state as workspaceState,

    refreshUserUI,

    applyRoleVisibility,

    applyGreeting,

    showApprovalPage,

    hideApprovalPage,

    openSettings,

    openHistory,

    openProfile,

    openAdmin,

    openEditTools,

    openWorkbenchUpload,

    openWorkbenchAI
};


// ============================================================
// GLOBAL COMPATIBILITY API
// ============================================================

window.refreshWorkspaceUser =
    refreshUserUI;


window.getWorkspaceRole =
    () => state.role;


window.getWorkspaceProfile =
    () => state.profile;


window.isWorkspaceAdmin =
    () =>
        state.role ===
        "admin";


window.openWorkspaceSettings =
    openSettings;


window.openWorkspaceHistory =
    openHistory;


window.openWorkspaceProfile =
    openProfile;


window.openWorkspaceAdmin =
    openAdmin;


window.openWorkspaceEditTools =
    openEditTools;


window.openWorkspaceAI =
    openWorkbenchAI;


// ============================================================
// AUTO INITIALIZATION
// ============================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            initializeWorkspace();

        },
        {
            once:
                true
        }
    );

} else {

    initializeWorkspace();
}
