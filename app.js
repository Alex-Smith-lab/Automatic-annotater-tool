/* ============================================================
   ANNOTATION AI
   APP ENTRY POINT
   ============================================================

   IMPORTANT:
   - This file is the application entry point.
   - It loads the modular JavaScript files.
   - Keep this file in the same folder as index.html.
   - All modules are inside ./js/
   ============================================================ */

import {
    initializeAuth,
    loadSessionOnStartup
} from "./js/auth.js";

import {
    initializeAnnotation,
    initializeAnnotationCanvas
} from "./js/annotation.js";

import {
    initializeMedia
} from "./js/media.js";

import {
    initializeTasks
} from "./js/tasks.js";

import {
    initializeHome
} from "./js/home.js";

import {
    initializeWorkspace
} from "./js/workspace.js";

import {
    initializeHistory
} from "./js/history.js";

import {
    initializeProfile
} from "./js/profile.js";

import {
    initializeAdmin
} from "./js/admin.js";

import {
    initializeAI
} from "./js/ai.js";

import {
    getSupabase,
    checkSupabaseConnection
} from "./js/supabase.js";

import {
    APP_CONFIG
} from "./js/config.js";


/* ============================================================
   GLOBAL APP STATE
   ============================================================ */

const appState = {
    initialized: false,
    loading: true,
    modulesInitialized: false,
    supabaseReady: false
};


/* ============================================================
   DOM HELPERS
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}


function showElement(element) {
    if (!element) {
        return;
    }

    element.classList.remove("hidden");

    element.removeAttribute("aria-hidden");
}


function hideElement(element) {
    if (!element) {
        return;
    }

    element.classList.add("hidden");

    element.setAttribute(
        "aria-hidden",
        "true"
    );
}


/* ============================================================
   LOADING SCREEN
   ============================================================ */

function setLoaderText(text) {
    const loaderText =
        $("appLoader")
            ?.querySelector(".loader-text");

    if (loaderText) {
        loaderText.textContent = text;
    }
}


function showLoader() {
    const loader = $("appLoader");

    if (!loader) {
        return;
    }

    loader.classList.remove("hidden");

    loader.setAttribute(
        "aria-hidden",
        "false"
    );
}


function hideLoader() {
    const loader = $("appLoader");

    if (!loader) {
        return;
    }

    loader.classList.add("hidden");

    loader.setAttribute(
        "aria-hidden",
        "true"
    );
}


/* ============================================================
   PAGE HELPERS
   ============================================================ */

function showPage(id) {
    const pages = [
        "authPage",
        "appPage"
    ];

    pages.forEach(pageId => {
        const page =
            $(pageId);

        if (!page) {
            return;
        }

        if (pageId === id) {
            showElement(page);
        } else {
            hideElement(page);
        }
    });
}


function showAppPage() {
    showPage("appPage");
}


function showAuthPage() {
    showPage("authPage");
}


function showApprovalPage() {
    const approvalPage =
        $("approvalPage");

    const homePage =
        $("homePage");

    const annotationPage =
        $("annotationPage");

    if (approvalPage) {
        showElement(approvalPage);
    }

    if (homePage) {
        hideElement(homePage);
    }

    if (annotationPage) {
        hideElement(annotationPage);
    }
}


function showHomePage() {
    const approvalPage =
        $("approvalPage");

    const homePage =
        $("homePage");

    const annotationPage =
        $("annotationPage");

    if (approvalPage) {
        hideElement(approvalPage);
    }

    if (homePage) {
        showElement(homePage);
    }

    if (annotationPage) {
        hideElement(annotationPage);
    }
}


function showAnnotationPage() {
    const approvalPage =
        $("approvalPage");

    const homePage =
        $("homePage");

    const annotationPage =
        $("annotationPage");

    if (approvalPage) {
        hideElement(approvalPage);
    }

    if (homePage) {
        hideElement(homePage);
    }

    if (annotationPage) {
        showElement(annotationPage);
    }
}


/* ============================================================
   TOAST
   ============================================================ */

function showToast(
    message,
    type = "info",
    duration = 3500
) {
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

    toast.setAttribute(
        "role",
        "status"
    );

    toast.textContent =
        String(message || "");

    container.appendChild(toast);

    window.setTimeout(
        () => {
            toast.classList.add(
                "toast-hide"
            );

            window.setTimeout(
                () => {
                    toast.remove();
                },
                250
            );
        },
        duration
    );
}


/* ============================================================
   GLOBAL TOAST COMPATIBILITY
   ============================================================ */

window.showToast =
    showToast;


/* ============================================================
   ERROR HANDLING
   ============================================================ */

function handleAppError(
    error,
    fallbackMessage =
        "Something went wrong."
) {
    console.error(
        "ANNOTATION AI error:",
        error
    );

    const message =
        error?.message ||
        fallbackMessage;

    showToast(
        message,
        "error"
    );
}


window.addEventListener(
    "error",
    event => {
        console.error(
            "Unhandled application error:",
            event.error ||
            event.message
        );
    }
);


window.addEventListener(
    "unhandledrejection",
    event => {
        console.error(
            "Unhandled promise rejection:",
            event.reason
        );
    }
);


/* ============================================================
   AUTH PANEL SWITCHING
   ============================================================ */

function initializeAuthPanels() {
    const loginPanel =
        $("loginPanel");

    const signupPanel =
        $("signupPanel");

    const showSignup =
        $("showSignupButton");

    const showLogin =
        $("showLoginButton");

    showSignup?.addEventListener(
        "click",
        () => {
            if (loginPanel) {
                loginPanel.classList.add(
                    "hidden"
                );
            }

            if (signupPanel) {
                signupPanel.classList.remove(
                    "hidden"
                );
            }
        }
    );


    showLogin?.addEventListener(
        "click",
        () => {
            if (signupPanel) {
                signupPanel.classList.add(
                    "hidden"
                );
            }

            if (loginPanel) {
                loginPanel.classList.remove(
                    "hidden"
                );
            }
        }
    );
}


/* ============================================================
   BASIC NAVIGATION
   ============================================================ */

function initializeNavigation() {
    $("homeButton")?.addEventListener(
        "click",
        () => {
            showHomePage();

            window.dispatchEvent(
                new CustomEvent(
                    "homeRequested"
                )
            );
        }
    );


    $("backToHomeButton")?.addEventListener(
        "click",
        () => {
            showHomePage();

            window.dispatchEvent(
                new CustomEvent(
                    "homeRequested"
                )
            );
        }
    );


    $("approvalRefreshButton")
        ?.addEventListener(
            "click",
            async () => {
                window.dispatchEvent(
                    new CustomEvent(
                        "approvalRefreshRequested"
                    )
                );
            }
        );


    $("approvalLogoutButton")
        ?.addEventListener(
            "click",
            async () => {
                window.dispatchEvent(
                    new CustomEvent(
                        "approvalLogoutRequested"
                    )
                );
            }
        );
}


/* ============================================================
   WORKSPACE EVENTS
   ============================================================ */

function initializeWorkspaceEvents() {
    window.addEventListener(
        "taskSelected",
        () => {
            showAnnotationPage();
        }
    );


    window.addEventListener(
        "taskOpened",
        () => {
            showAnnotationPage();
        }
    );


    window.addEventListener(
        "taskCleared",
        () => {
            showHomePage();
        }
    );


    window.addEventListener(
        "taskSubmitted",
        () => {
            showHomePage();
        }
    );


    window.addEventListener(
        "taskSkipped",
        () => {
            showHomePage();
        }
    );


    window.addEventListener(
        "homeRequested",
        () => {
            showHomePage();
        }
    );
}


/* ============================================================
   WORKBENCH
   ============================================================ */

function initializeWorkbench() {
    const editTool =
        $("workbenchEditTool");

    const uploadButton =
        $("workbenchUpload");

    const aiButton =
        $("workbenchAI");

    const annotationTypeButton =
        $("workbenchAnnotationType");


    editTool?.addEventListener(
        "click",
        () => {
            const panel =
                $("editToolsPanel");

            if (panel) {
                panel.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });
            }

            window.dispatchEvent(
                new CustomEvent(
                    "workbenchEditRequested"
                )
            );
        }
    );


    annotationTypeButton?.addEventListener(
        "click",
        () => {
            const panel =
                $("annotationTypePanel");

            if (panel) {
                panel.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });
            }

            window.dispatchEvent(
                new CustomEvent(
                    "workbenchAnnotationTypeRequested"
                )
            );
        }
    );


    uploadButton?.addEventListener(
        "click",
        () => {
            window.dispatchEvent(
                new CustomEvent(
                    "workbenchUploadRequested"
                )
            );
        }
    );


    aiButton?.addEventListener(
        "click",
        () => {
            const aiButtonElement =
                $("autoAnnotate");

            if (
                aiButtonElement &&
                !aiButtonElement.disabled
            ) {
                aiButtonElement.click();
                return;
            }

            window.dispatchEvent(
                new CustomEvent(
                    "workbenchAIRequested"
                )
            );
        }
    );
}


/* ============================================================
   ANNOTATION TOOL BUTTONS
   ============================================================ */

function initializeAnnotationTools() {
    const toolButtons = [
        [
            "selectTool",
            "select"
        ],
        [
            "drawBoxTool",
            "box"
        ],
        [
            "drawPolygonTool",
            "polygon"
        ],
        [
            "drawSegmentationTool",
            "segmentation"
        ],
        [
            "moveTool",
            "move"
        ],
        [
            "editTool",
            "edit"
        ]
    ];


    toolButtons.forEach(
        ([id, mode]) => {
            const button =
                $(id);

            if (!button) {
                return;
            }

            button.addEventListener(
                "click",
                () => {
                    window.dispatchEvent(
                        new CustomEvent(
                            "annotationToolRequested",
                            {
                                detail: {
                                    mode
                                }
                            }
                        )
                    );
                }
            );
        }
    );


    $("clearAnnotationsButton")
        ?.addEventListener(
            "click",
            () => {
                const confirmed =
                    window.confirm(
                        "Clear all annotations for this task?"
                    );

                if (!confirmed) {
                    return;
                }

                window.dispatchEvent(
                    new CustomEvent(
                        "clearAnnotationsRequested"
                    )
                );
            }
        );
}


/* ============================================================
   ZOOM BUTTONS
   ============================================================ */

function initializeZoomControls() {
    const zoomIn =
        $("zoomInButton");

    const zoomOut =
        $("zoomOutButton");

    const reset =
        $("resetZoomButton") ||
        $("resetViewButton");

    zoomIn?.addEventListener(
        "click",
        () => {
            window.dispatchEvent(
                new CustomEvent(
                    "zoomInRequested"
                )
            );
        }
    );


    zoomOut?.addEventListener(
        "click",
        () => {
            window.dispatchEvent(
                new CustomEvent(
                    "zoomOutRequested"
                )
            );
        }
    );


    reset?.addEventListener(
        "click",
        () => {
            window.dispatchEvent(
                new CustomEvent(
                    "zoomResetRequested"
                )
            );
        }
    );
}


/* ============================================================
   VIDEO FRAME CONTROLS
   ============================================================ */

function initializeVideoControls() {
    $("previousFrameButton")
        ?.addEventListener(
            "click",
            () => {
                window.dispatchEvent(
                    new CustomEvent(
                        "previousFrameRequested"
                    )
                );
            }
        );


    $("nextFrameButton")
        ?.addEventListener(
            "click",
            () => {
                window.dispatchEvent(
                    new CustomEvent(
                        "nextFrameRequested"
                    )
                );
            }
        );


    $("videoPlayButton")
        ?.addEventListener(
            "click",
            () => {
                window.dispatchEvent(
                    new CustomEvent(
                        "videoPlayRequested"
                    )
                );
            }
        );


    $("videoTimeline")
        ?.addEventListener(
            "input",
            event => {
                window.dispatchEvent(
                    new CustomEvent(
                        "videoSeekRequested",
                        {
                            detail: {
                                value:
                                    Number(
                                        event.target.value
                                    )
                            }
                        }
                    )
                );
            }
        );
}


/* ============================================================
   SAVE BUTTON
   ============================================================ */

function initializeSaveButton() {
    $("saveAnnotationsButton")
        ?.addEventListener(
            "click",
            () => {
                window.dispatchEvent(
                    new CustomEvent(
                        "saveAnnotationsRequested"
                    )
                );
            }
        );
}


/* ============================================================
   THEME COMPATIBILITY
   ============================================================ */

function initializeThemeCompatibility() {
    const themeSelect =
        $("themeSelect");

    if (!themeSelect) {
        return;
    }

    const savedTheme =
        localStorage.getItem(
            "annotationAI_theme"
        );

    if (savedTheme) {
        themeSelect.value =
            savedTheme;
    }


    themeSelect.addEventListener(
        "change",
        event => {
            const theme =
                event.target.value;

            localStorage.setItem(
                "annotationAI_theme",
                theme
            );

            applyTheme(
                theme
            );
        }
    );


    applyTheme(
        themeSelect.value ||
        "system"
    );
}


function applyTheme(theme) {
    const root =
        document.documentElement;

    if (!root) {
        return;
    }

    root.classList.remove(
        "theme-light",
        "theme-dark"
    );


    if (theme === "light") {
        root.classList.add(
            "theme-light"
        );
        return;
    }


    if (theme === "dark") {
        root.classList.add(
            "theme-dark"
        );
        return;
    }


    const prefersDark =
        window.matchMedia &&
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;

    root.classList.add(
        prefersDark
            ? "theme-dark"
            : "theme-light"
    );
}


/* ============================================================
   MODAL ESCAPE HANDLING
   ============================================================ */

function initializeModalEscape() {
    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key !==
                "Escape"
            ) {
                return;
            }

            closeVisibleModal();
        }
    );
}


function closeVisibleModal() {
    const modalIds = [
        "profileModal",
        "settingsModal",
        "workHistoryModal",
        "skipModal",
        "createTaskModal",
        "createCoworkerModal"
    ];


    modalIds.forEach(
        id => {
            const modal =
                $(id);

            if (
                modal &&
                !modal.classList.contains(
                    "hidden"
                )
            ) {
                modal.classList.add(
                    "hidden"
                );
            }
        }
    );
}


/* ============================================================
   ADMIN MODAL COMPATIBILITY
   ============================================================ */

function initializeAdminModal() {
    const adminButton =
        $("adminCenterButton");

    const closeButton =
        $("closeAdminModal");

    adminButton?.addEventListener(
        "click",
        () => {
            const modal =
                $("adminModal");

            if (!modal) {
                return;
            }

            modal.classList.remove(
                "hidden"
            );

            document.body.classList.add(
                "admin-open"
            );

            window.dispatchEvent(
                new CustomEvent(
                    "adminOpened"
                )
            );
        }
    );


    closeButton?.addEventListener(
        "click",
        () => {
            closeAdminModal();
        }
    );
}


function closeAdminModal() {
    const modal =
        $("adminModal");

    if (modal) {
        modal.classList.add(
            "hidden"
        );
    }

    document.body.classList.remove(
        "admin-open"
    );

    window.dispatchEvent(
        new CustomEvent(
            "adminClosed"
        )
    );
}


/* ============================================================
   ADMIN TABS
   ============================================================ */

function initializeAdminTabs() {
    const tabs =
        document.querySelectorAll(
            "[data-admin-tab]"
        );

    const pages =
        document.querySelectorAll(
            "[data-admin-page]"
        );


    tabs.forEach(
        tab => {
            tab.addEventListener(
                "click",
                () => {
                    const target =
                        tab.dataset.adminTab;

                    if (!target) {
                        return;
                    }


                    tabs.forEach(
                        item => {
                            item.classList.toggle(
                                "active",
                                item === tab
                            );
                        }
                    );


                    pages.forEach(
                        page => {
                            const pageName =
                                page.dataset.adminPage;

                            page.classList.toggle(
                                "active",
                                pageName === target
                            );
                        }
                    );


                    window.dispatchEvent(
                        new CustomEvent(
                            "adminTabChanged",
                            {
                                detail: {
                                    tab: target
                                }
                            }
                        )
                    );
                }
            );
        }
    );
}


/* ============================================================
   PROFILE / SETTINGS / HISTORY BUTTONS
   ============================================================ */

function initializeTopButtons() {
    $("settingsButton")
        ?.addEventListener(
            "click",
            () => {
                const modal =
                    $("settingsModal");

                if (modal) {
                    modal.classList.remove(
                        "hidden"
                    );
                }
            }
        );


    $("closeSettingsModal")
        ?.addEventListener(
            "click",
            () => {
                $("settingsModal")
                    ?.classList.add(
                        "hidden"
                    );
            }
        );


    $("profileButton")
        ?.addEventListener(
            "click",
            () => {
                const modal =
                    $("profileModal");

                if (modal) {
                    modal.classList.remove(
                        "hidden"
                    );
                }
            }
        );


    $("closeProfileModal")
        ?.addEventListener(
            "click",
            () => {
                $("profileModal")
                    ?.classList.add(
                        "hidden"
                    );
            }
        );


    $("workHistoryButton")
        ?.addEventListener(
            "click",
            () => {
                const modal =
                    $("workHistoryModal");

                if (modal) {
                    modal.classList.remove(
                        "hidden"
                    );
                }

                window.dispatchEvent(
                    new CustomEvent(
                        "workHistoryRequested"
                    )
                );
            }
        );


    $("closeWorkHistoryModal")
        ?.addEventListener(
            "click",
            () => {
                $("workHistoryModal")
                    ?.classList.add(
                        "hidden"
                    );
            }
        );
}


/* ============================================================
   SKIP MODAL
   ============================================================ */

function initializeSkipModal() {
    $("skipTaskButton")
        ?.addEventListener(
            "click",
            () => {
                const modal =
                    $("skipModal");

                if (modal) {
                    modal.classList.remove(
                        "hidden"
                    );
                }

                window.dispatchEvent(
                    new CustomEvent(
                        "skipModalRequested"
                    )
                );
            }
        );


    $("closeSkipModal")
        ?.addEventListener(
            "click",
            () => {
                $("skipModal")
                    ?.classList.add(
                        "hidden"
                    );
            }
        );


    $("cancelSkipTask")
        ?.addEventListener(
            "click",
            () => {
                $("skipModal")
                    ?.classList.add(
                        "hidden"
                    );
            }
        );


    $("confirmSkipTask")
        ?.addEventListener(
            "click",
            () => {
                const reason =
                    $("skipReason")
                        ?.value ||
                    "";

                const details =
                    $("skipReasonDetails")
                        ?.value ||
                    "";

                if (!reason) {
                    showToast(
                        "Please select a reason for skipping the task.",
                        "warning"
                    );

                    return;
                }


                window.dispatchEvent(
                    new CustomEvent(
                        "skipConfirmed",
                        {
                            detail: {
                                reason,
                                details
                            }
                        }
                    )
                );
            }
        );
}


/* ============================================================
   AUTH / SUPABASE STARTUP
   ============================================================ */

async function initializeApplication() {
    if (
        appState.initialized
    ) {
        return;
    }

    appState.initialized =
        true;

    showLoader();

    setLoaderText(
        "Connecting to workspace..."
    );


    try {
        /*
         * Make sure the Supabase module is
         * available before starting the rest
         * of the application.
         */
        try {
            const client =
                getSupabase();

            appState.supabaseReady =
                Boolean(client);
        } catch (error) {
            console.warn(
                "Supabase client check failed:",
                error
            );

            appState.supabaseReady =
                false;
        }


        /*
         * Test the connection, but do not
         * prevent the application from loading
         * if the check itself fails.
         */
        if (appState.supabaseReady) {
            try {
                await checkSupabaseConnection();
            } catch (error) {
                console.warn(
                    "Supabase connection check:",
                    error
                );
            }
        }


        setLoaderText(
            "Loading application..."
        );


        /*
         * Initialize modules in a safe order.
         *
         * Authentication first.
         * Annotation/media/task modules then
         * register their event listeners.
         */
        await initializeModule(
            "authentication",
            initializeAuth
        );


        await initializeModule(
            "annotation",
            initializeAnnotation
        );


        await initializeModule(
            "annotation canvas",
            initializeAnnotationCanvas
        );


        await initializeModule(
            "media",
            initializeMedia
        );


        await initializeModule(
            "tasks",
            initializeTasks
        );


        await initializeModule(
            "home",
            initializeHome
        );


        await initializeModule(
            "workspace",
            initializeWorkspace
        );


        await initializeModule(
            "history",
            initializeHistory
        );


        await initializeModule(
            "profile",
            initializeProfile
        );


        await initializeModule(
            "admin",
            initializeAdmin
        );


        await initializeModule(
            "AI",
            initializeAI
        );


        /*
         * Local UI bindings.
         */
        initializeAuthPanels();

        initializeNavigation();

        initializeWorkspaceEvents();

        initializeWorkbench();

        initializeAnnotationTools();

        initializeZoomControls();

        initializeVideoControls();

        initializeSaveButton();

        initializeThemeCompatibility();

        initializeModalEscape();

        initializeAdminModal();

        initializeAdminTabs();

        initializeTopButtons();

        initializeSkipModal();


        appState.modulesInitialized =
            true;


        /*
         * Restore an existing session.
         *
         * auth.js is responsible for checking
         * Supabase authentication and profile
         * state.
         */
        setLoaderText(
            "Checking account..."
        );


        let sessionResult =
            null;

        try {
            sessionResult =
                await loadSessionOnStartup();
        } catch (error) {
            console.warn(
                "Session restoration failed:",
                error
            );
        }


        /*
         * If auth.js returns a result, use it
         * to determine the initial page.
         *
         * If it does not return anything,
         * auth.js itself normally handles
         * the visibility.
         */
        if (
            sessionResult &&
            typeof sessionResult ===
                "object"
        ) {
            if (
                sessionResult.pendingApproval
            ) {
                showAppPage();
                showApprovalPage();
            } else if (
                sessionResult.authenticated
            ) {
                showAppPage();

                showHomePage();
            } else {
                showAuthPage();
            }
        }


        hideLoader();

        appState.loading =
            false;


        window.dispatchEvent(
            new CustomEvent(
                "appReady",
                {
                    detail: {
                        state:
                            appState
                    }
                }
            )
        );


    } catch (error) {
        appState.loading =
            false;

        handleAppError(
            error,
            "Unable to start ANNOTATION AI."
        );


        /*
         * Authentication must remain usable
         * even if a non-critical module fails.
         */
        try {
            showAuthPage();
        } catch (pageError) {
            console.error(
                pageError
            );
        }


        hideLoader();
    }
}


/* ============================================================
   SAFE MODULE INITIALIZER
   ============================================================ */

async function initializeModule(
    name,
    initializer
) {
    if (
        typeof initializer !==
        "function"
    ) {
        console.warn(
            `${name} module has no initializer.`
        );

        return null;
    }


    try {
        const result =
            initializer();

        if (
            result &&
            typeof result.then ===
                "function"
        ) {
            return await result;
        }

        return result;

    } catch (error) {
        console.error(
            `${name} initialization failed:`,
            error
        );

        /*
         * Do not automatically stop the entire
         * application because one optional
         * module failed.
         */
        return null;
    }
}


/* ============================================================
   SESSION / AUTH EVENTS
   ============================================================ */

window.addEventListener(
    "authSignedIn",
    () => {
        showAppPage();
        showHomePage();
    }
);


window.addEventListener(
    "authSignedOut",
    () => {
        closeAdminModal();
        showAuthPage();
    }
);


window.addEventListener(
    "accountPendingApproval",
    () => {
        showAppPage();
        showApprovalPage();
    }
);


window.addEventListener(
    "accountActivated",
    () => {
        showAppPage();
        showHomePage();
    }
);


window.addEventListener(
    "accountKicked",
    () => {
        showAppPage();
        showApprovalPage();

        showToast(
            "Your account is waiting for admin approval.",
            "warning",
            5000
        );
    }
);


/* ============================================================
   APPROVAL REFRESH
   ============================================================ */

window.addEventListener(
    "approvalRefreshRequested",
    async () => {
        try {
            const result =
                await loadSessionOnStartup();

            if (
                result?.authenticated &&
                !result?.pendingApproval
            ) {
                showHomePage();

                showToast(
                    "Your account is now active.",
                    "success"
                );
            } else {
                showApprovalPage();

                showToast(
                    "Your account is still waiting for admin approval.",
                    "info"
                );
            }

        } catch (error) {
            handleAppError(
                error,
                "Unable to check account approval."
            );
        }
    }
);


/* ============================================================
   APPROVAL LOGOUT
   ============================================================ */

window.addEventListener(
    "approvalLogoutRequested",
    async () => {
        try {
            window.dispatchEvent(
                new CustomEvent(
                    "logoutRequested"
                )
            );
        } catch (error) {
            handleAppError(
                error,
                "Unable to sign out."
            );
        }
    }
);


/* ============================================================
   SAVE REQUEST
   ============================================================ */

window.addEventListener(
    "saveAnnotationsRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "saveTaskAnnotationsRequested"
            )
        );
    }
);


/* ============================================================
   CLEAR ANNOTATIONS
   ============================================================ */

window.addEventListener(
    "clearAnnotationsRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "clearAllAnnotations"
            )
        );
    }
);


/* ============================================================
   ANNOTATION TOOL REQUEST
   ============================================================ */

window.addEventListener(
    "annotationToolRequested",
    event => {
        const mode =
            event.detail?.mode;

        if (!mode) {
            return;
        }

        window.dispatchEvent(
            new CustomEvent(
                "setAnnotationMode",
                {
                    detail: {
                        mode
                    }
                }
            )
        );
    }
);


/* ============================================================
   ZOOM REQUESTS
   ============================================================ */

window.addEventListener(
    "zoomInRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "annotationZoomIn"
            )
        );
    }
);


window.addEventListener(
    "zoomOutRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "annotationZoomOut"
            )
        );
    }
);


window.addEventListener(
    "zoomResetRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "annotationZoomReset"
            )
        );
    }
);


/* ============================================================
   VIDEO REQUESTS
   ============================================================ */

window.addEventListener(
    "previousFrameRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "previousVideoFrame"
            )
        );
    }
);


window.addEventListener(
    "nextFrameRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "nextVideoFrame"
            )
        );
    }
);


window.addEventListener(
    "videoPlayRequested",
    () => {
        window.dispatchEvent(
            new CustomEvent(
                "toggleVideoPlayback"
            )
        );
    }
);


window.addEventListener(
    "videoSeekRequested",
    event => {
        window.dispatchEvent(
            new CustomEvent(
                "seekVideoFrame",
                {
                    detail:
                        event.detail
                }
            )
        );
    }
);


/* ============================================================
   SKIP CONFIRMATION
   ============================================================ */

window.addEventListener(
    "skipConfirmed",
    event => {
        const modal =
            $("skipModal");

        if (modal) {
            modal.classList.add(
                "hidden"
            );
        }

        /*
         * tasks.js owns the actual database
         * operation.
         */
        window.dispatchEvent(
            new CustomEvent(
                "taskSkipConfirmed",
                {
                    detail:
                        event.detail
                }
            )
        );
    }
);


/* ============================================================
   APP VISIBILITY
   ============================================================ */

document.addEventListener(
    "visibilitychange",
    () => {
        if (
            document.visibilityState !==
            "visible"
        ) {
            return;
        }

        window.dispatchEvent(
            new CustomEvent(
                "appVisible"
            )
        );
    }
);


/* ============================================================
   ONLINE / OFFLINE
   ============================================================ */

window.addEventListener(
    "online",
    () => {
        showToast(
            "Connection restored.",
            "success"
        );

        window.dispatchEvent(
            new CustomEvent(
                "connectionRestored"
            )
        );
    }
);


window.addEventListener(
    "offline",
    () => {
        showToast(
            "You are offline. Changes may be delayed.",
            "warning",
            5000
        );

        window.dispatchEvent(
            new CustomEvent(
                "connectionLost"
            )
        );
    }
);


/* ============================================================
   RESIZE
   ============================================================ */

let resizeTimer = null;

window.addEventListener(
    "resize",
    () => {
        window.clearTimeout(
            resizeTimer
        );

        resizeTimer =
            window.setTimeout(
                () => {
                    window.dispatchEvent(
                        new CustomEvent(
                            "appResize"
                        )
                    );
                },
                100
            );
    }
);


/* ============================================================
   DEBUG / GLOBAL APP OBJECT
   ============================================================ */

window.annotationAI =
    {
        config:
            APP_CONFIG,

        state:
            appState,

        showHome:
            showHomePage,

        showAnnotation:
            showAnnotationPage,

        showApproval:
            showApprovalPage,

        showAuth:
            showAuthPage,

        showToast,

        closeAdmin:
            closeAdminModal
    };


/* ============================================================
   START APPLICATION
   ============================================================ */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeApplication();
        },
        {
            once: true
        }
    );
} else {
    initializeApplication();
}


/* ============================================================
   END
   ============================================================ */
