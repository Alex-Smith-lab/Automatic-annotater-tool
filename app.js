// ============================================================
// ANNOTATION AI
// MAIN APPLICATION BOOTSTRAP
// File: app.js
// ============================================================
//
// This file is the central application coordinator.
//
// IMPORTANT:
// - index.html loads this file as a module.
// - All feature logic remains inside ./js/*.js
// - Do not put annotation drawing, AI detection, task CRUD,
//   authentication forms, admin tables, etc. in this file.
//
// Modules:
//   js/config.js
//   js/supabase.js
//   js/auth.js
//   js/workspace.js
//   js/home.js
//   js/tasks.js
//   js/media.js
//   js/annotation.js
//   js/ai.js
//   js/admin.js
//   js/profile.js
//   js/history.js
// ============================================================


// ============================================================
// IMPORTS
// ============================================================

import {
    APP_CONFIG
} from "./js/config.js";


import {
    supabase,
    getCurrentUser,
    getCurrentSession,
    onAuthStateChange,
    updateCloudStatus
} from "./js/supabase.js";


import {
    initializeAuth,
    loadSessionOnStartup
} from "./js/auth.js";


import {
    initializeWorkspace
} from "./js/workspace.js";


import {
    initializeHome
} from "./js/home.js";


import {
    initializeTasks
} from "./js/tasks.js";


import {
    initializeMedia
} from "./js/media.js";


import {
    initializeAnnotation
} from "./js/annotation.js";


import {
    initializeAI
} from "./js/ai.js";


import {
    initializeAdmin
} from "./js/admin.js";


import {
    initializeProfile
} from "./js/profile.js";


import {
    initializeHistory
} from "./js/history.js";


// ============================================================
// APPLICATION STATE
// ============================================================

const appState = {

    initialized: false,

    initializing: false,

    ready: false,

    session: null,

    user: null,

    startedAt: null,

    lastAuthEvent: null,

    moduleStatus: {}

};


// ============================================================
// DOM HELPER
// ============================================================

function $(id) {
    return document.getElementById(id);
}


// ============================================================
// SAFE EVENT DISPATCH
// ============================================================

function emit(name, detail = {}) {

    try {

        window.dispatchEvent(
            new CustomEvent(
                name,
                {
                    detail
                }
            )
        );

    } catch (error) {

        console.warn(
            `Could not dispatch ${name}:`,
            error
        );

    }

}


// ============================================================
// TOAST FALLBACK
// ============================================================
//
// Most modules have their own toast function.
// This fallback keeps app-level errors visible even if a
// feature module has not initialized yet.
// ============================================================

function showAppToast(message) {

    const container =
        $("toastContainer");

    if (!container) {

        console.warn(message);

        return;

    }


    const toast =
        document.createElement("div");

    toast.className =
        "toast";


    toast.textContent =
        String(message);


    container.appendChild(toast);


    window.setTimeout(
        () => {

            toast.classList.add(
                "show"
            );

        },
        10
    );


    window.setTimeout(
        () => {

            toast.classList.remove(
                "show"
            );

            window.setTimeout(
                () => {

                    toast.remove();

                },
                250
            );

        },
        4500
    );

}


// ============================================================
// CLOUD STATUS
// ============================================================

function refreshCloudStatus(session) {

    try {

        updateCloudStatus(
            session || null
        );

        return;

    } catch (_) {
        // Fall through to local UI update.
    }


    const element =
        $("cloudStatus");

    if (!element) {

        return;

    }


    if (!supabase) {

        element.textContent =
            "Cloud connection not configured";

        element.dataset.status =
            "offline";

        return;

    }


    if (session?.user) {

        element.textContent =
            "Cloud connected";

        element.dataset.status =
            "online";

    } else {

        element.textContent =
            "Not signed in";

        element.dataset.status =
            "offline";

    }

}


// ============================================================
// APPLICATION VISIBILITY
// ============================================================
//
// Your current index.html uses:
//
//   authPage
//   appPage
//   approvalPage
//
// Older versions used loginPage/authLoggedIn/etc.
// This function intentionally supports both so the application
// does not break if an older HTML element still exists.
// ============================================================

function setElementVisible(
    element,
    visible
) {

    if (!element) {

        return;

    }


    element.hidden =
        !visible;


    element.classList.toggle(
        "hidden",
        !visible
    );


    element.style.display =
        visible
            ? ""
            : "none";

}


// ============================================================
// AUTH PAGE
// ============================================================

function showAuthPage() {

    setElementVisible(
        $("authPage"),
        true
    );


    setElementVisible(
        $("appPage"),
        false
    );


    setElementVisible(
        $("approvalPage"),
        false
    );


    // Compatibility with older HTML.
    setElementVisible(
        $("loginPage"),
        true
    );


    setElementVisible(
        $("authLoggedOut"),
        true
    );


    setElementVisible(
        $("authLoggedIn"),
        false
    );


    document.body.dataset.auth =
        "logged-out";


    document.body.dataset.access =
        "logged-out";

}


// ============================================================
// APPLICATION PAGE
// ============================================================

function showApplicationPage() {

    setElementVisible(
        $("authPage"),
        false
    );


    setElementVisible(
        $("appPage"),
        true
    );


    setElementVisible(
        $("approvalPage"),
        false
    );


    // Compatibility with older HTML.
    setElementVisible(
        $("loginPage"),
        false
    );


    setElementVisible(
        $("authLoggedOut"),
        false
    );


    setElementVisible(
        $("authLoggedIn"),
        true
    );


    document.body.dataset.auth =
        "logged-in";


    document.body.dataset.access =
        "active";

}


// ============================================================
// PENDING APPROVAL PAGE
// ============================================================

function showApprovalPage() {

    setElementVisible(
        $("authPage"),
        false
    );


    setElementVisible(
        $("appPage"),
        false
    );


    setElementVisible(
        $("approvalPage"),
        true
    );


    // Compatibility with older HTML.
    setElementVisible(
        $("loginPage"),
        false
    );


    setElementVisible(
        $("authLoggedOut"),
        false
    );


    setElementVisible(
        $("authLoggedIn"),
        false
    );


    document.body.dataset.auth =
        "logged-in";


    document.body.dataset.access =
        "pending";


    const approvalTitle =
        document.querySelector(
            "#approvalPage h1"
        );


    if (approvalTitle) {

        approvalTitle.textContent =
            "Wait for admin approval";

    }

}


// ============================================================
// DETERMINE PROFILE ACCESS
// ============================================================
//
// Authentication belongs to auth.js. This function only reads
// the current profile/user information to determine which
// top-level page should be visible.
//
// New customers are expected to be inactive until approved.
// Admin/staff access is handled by the role modules.
// ============================================================

async function getAccessState(user) {

    if (!user) {

        return {
            loggedIn: false,
            active: false,
            pending: false
        };

    }


    // Admin email is also handled by auth.js/config.js.
    // We do not expose it in the UI.


    try {

        const {
            data,
            error
        } = await supabase
            .from("profiles")
            .select(
                "id,role,active,email,full_name"
            )
            .eq(
                "id",
                user.id
            )
            .maybeSingle();


        if (!error && data) {

            const active =
                data.active !== false;


            return {

                loggedIn: true,

                active,

                pending: !active,

                profile: data

            };

        }

    } catch (error) {

        console.warn(
            "Could not read profile access state:",
            error
        );

    }


    // If the profile cannot be read, do not invent a
    // permission decision. Keep the normal application visible
    // for an existing authenticated session and allow auth.js
    // to handle the detailed state.
    return {

        loggedIn: true,

        active: true,

        pending: false,

        profile: null

    };

}


// ============================================================
// APPLY SESSION TO APPLICATION
// ============================================================

async function applySession(
    session,
    options = {}
) {

    const user =
        session?.user || null;


    appState.session =
        session || null;


    appState.user =
        user;


    if (options.authEvent) {

        appState.lastAuthEvent =
            options.authEvent;

    }


    refreshCloudStatus(
        session
    );


    // --------------------------------------------------------
    // Logged out
    // --------------------------------------------------------

    if (!user) {

        showAuthPage();

        emit(
            "app:session",
            {
                session: null,
                user: null
            }
        );

        emit(
            "app:loggedOut",
            {}
        );

        return;

    }


    // --------------------------------------------------------
    // Logged in
    // --------------------------------------------------------

    const access =
        await getAccessState(
            user
        );


    if (
        access.pending
    ) {

        showApprovalPage();

    } else {

        showApplicationPage();

    }


    emit(
        "app:session",
        {
            session:
                appState.session,

            user:
                appState.user,

            profile:
                access.profile,

            active:
                access.active,

            pending:
                access.pending
        }
    );


    if (access.pending) {

        emit(
            "app:pendingApproval",
            {
                user,
                profile:
                    access.profile
            }
        );

    } else {

        emit(
            "app:accessGranted",
            {
                user,
                profile:
                    access.profile
            }
        );

    }

}


// ============================================================
// AUTH STATE LISTENER
// ============================================================

let authListenerAttached =
    false;


function bindAuthStateListener() {

    if (
        authListenerAttached ||
        !supabase
    ) {

        return;

    }


    try {

        onAuthStateChange(
            async (
                event,
                session
            ) => {

                authListenerAttached =
                    true;


                console.log(
                    "Supabase auth event:",
                    event
                );


                appState.lastAuthEvent =
                    event;


                // Supabase may fire auth events while another
                // initialization task is still running.
                try {

                    await applySession(
                        session,
                        {
                            authEvent:
                                event
                        }
                    );

                } catch (error) {

                    console.error(
                        "Could not apply auth session:",
                        error
                    );

                }


                emit(
                    "app:authChange",
                    {
                        event,
                        session:
                            session || null
                    }
                );

            }
        );


        authListenerAttached =
            true;

    } catch (error) {

        console.warn(
            "Auth listener could not be attached:",
            error
        );

    }

}


// ============================================================
// APPLICATION EVENTS
// ============================================================

let applicationEventsBound =
    false;


function bindApplicationEvents() {

    if (
        applicationEventsBound
    ) {

        return;

    }


    applicationEventsBound =
        true;


    // --------------------------------------------------------
    // Authentication
    // --------------------------------------------------------

    window.addEventListener(
        "auth:login",
        async event => {

            const session =
                event.detail?.session ||
                appState.session ||
                null;


            const user =
                event.detail?.user ||
                session?.user ||
                null;


            appState.user =
                user;


            appState.session =
                session;


            await applySession(
                session,
                {
                    authEvent:
                        "LOGIN"
                }
            );

        }
    );


    window.addEventListener(
        "auth:logout",
        () => {

            appState.user =
                null;

            appState.session =
                null;


            showAuthPage();


            refreshCloudStatus(
                null
            );


            emit(
                "app:loggedOut",
                {}
            );

        }
    );


    // --------------------------------------------------------
    // Approval refresh
    // --------------------------------------------------------

    window.addEventListener(
        "app:refreshApproval",
        async () => {

            const session =
                await getCurrentSession();


            await applySession(
                session
            );

        }
    );


    // --------------------------------------------------------
    // Home task events
    // --------------------------------------------------------

    window.addEventListener(
        "home:openTask",
        event => {

            emit(
                "app:taskRequested",
                {
                    taskId:
                        event.detail?.taskId,

                    task:
                        event.detail?.task ||
                        null
                }
            );

        }
    );


    // --------------------------------------------------------
    // History task events
    // --------------------------------------------------------

    window.addEventListener(
        "history:openTask",
        event => {

            emit(
                "app:historyTaskRequested",
                {
                    taskId:
                        event.detail?.taskId,

                    task:
                        event.detail?.task ||
                        null
                }
            );

        }
    );


    // --------------------------------------------------------
    // Task events
    // --------------------------------------------------------

    window.addEventListener(
        "taskSelected",
        event => {

            document.body.dataset.taskSelected =
                "true";


            emit(
                "app:taskSelected",
                event.detail || {}
            );

        }
    );


    window.addEventListener(
        "taskCleared",
        event => {

            document.body.dataset.taskSelected =
                "false";


            emit(
                "app:taskCleared",
                event.detail || {}
            );

        }
    );


    window.addEventListener(
        "taskSubmitted",
        event => {

            emit(
                "app:taskSubmitted",
                event.detail || {}
            );

        }
    );


    window.addEventListener(
        "taskSkipped",
        event => {

            emit(
                "app:taskSkipped",
                event.detail || {}
            );

        }
    );


    // --------------------------------------------------------
    // Annotation media events
    // --------------------------------------------------------

    window.addEventListener(
        "annotation:loadTaskMedia",
        event => {

            console.debug(
                "Task media requested:",
                event.detail
            );

        }
    );


    window.addEventListener(
        "annotation:loadMediaURL",
        event => {

            console.debug(
                "Media URL requested:",
                event.detail
            );

        }
    );


    // --------------------------------------------------------
    // Annotation changes
    // --------------------------------------------------------

    const annotationEvents = [

        "annotation:changed",

        "annotation:created",

        "annotation:updated",

        "annotation:deleted",

        "annotation:saved",

        "annotation:frameChanged"

    ];


    annotationEvents.forEach(
        eventName => {

            window.addEventListener(
                eventName,
                event => {

                    emit(
                        "app:" + eventName,
                        event.detail || {}
                    );

                }
            );

        }
    );


    // --------------------------------------------------------
    // AI
    // --------------------------------------------------------

    window.addEventListener(
        "home:runAI",
        () => {

            if (
                typeof window.runAutoAnnotate ===
                "function"
            ) {

                window.runAutoAnnotate();

            } else {

                const button =
                    $("autoAnnotate");

                if (button) {

                    button.click();

                }

            }

        }
    );


    window.addEventListener(
        "workbench:runAI",
        () => {

            const button =
                $("autoAnnotate");


            if (button) {

                button.click();

            }

        }
    );


    // --------------------------------------------------------
    // Application ready
    // --------------------------------------------------------

    window.addEventListener(
        "app:ready",
        () => {

            document.documentElement.dataset.appReady =
                "true";

        }
    );


    // --------------------------------------------------------
    // Global errors
    // --------------------------------------------------------

    window.addEventListener(
        "error",
        event => {

            console.error(
                "Global application error:",
                event.error ||
                event.message
            );

        }
    );


    window.addEventListener(
        "unhandledrejection",
        event => {

            console.error(
                "Unhandled application promise rejection:",
                event.reason
            );

        }
    );

}


// ============================================================
// INITIAL SESSION
// ============================================================

async function loadInitialSession() {

    try {

        const session =
            await getCurrentSession();


        await applySession(
            session
        );


        return session;

    } catch (error) {

        console.warn(
            "Could not load initial Supabase session:",
            error
        );


        await applySession(
            null
        );


        return null;

    }

}


// ============================================================
// MODULE INITIALIZATION
// ============================================================
//
// Authentication is initialized first because the rest of the
// application needs the current user/role.
//
// Workspace is initialized before home/tasks so its UI state
// is ready when those modules dispatch task events.
// ============================================================

async function initializeModules() {

    const modules = [

        [
            "auth",
            initializeAuth
        ],

        [
            "workspace",
            initializeWorkspace
        ],

        [
            "annotation",
            initializeAnnotation
        ],

        [
            "media",
            initializeMedia
        ],

        [
            "ai",
            initializeAI
        ],

        [
            "tasks",
            initializeTasks
        ],

        [
            "home",
            initializeHome
        ],

        [
            "history",
            initializeHistory
        ],

        [
            "profile",
            initializeProfile
        ],

        [
            "admin",
            initializeAdmin
        ]

    ];


    for (
        const [
            name,
            initializer
        ]
        of modules
    ) {

        if (
            typeof initializer !==
            "function"
        ) {

            console.warn(
                `Module "${name}" does not expose initialize${name}.`
            );


            appState.moduleStatus[
                name
            ] = "missing";


            continue;

        }


        try {

            await initializer();


            appState.moduleStatus[
                name
            ] = "ready";


            console.log(
                `✓ ${name} initialized`
            );

        } catch (error) {

            appState.moduleStatus[
                name
            ] = "error";


            console.error(
                `Failed to initialize ${name}:`,
                error
            );


            // Do NOT stop the entire application because one
            // optional module failed.

        }

    }

}


// ============================================================
// REFRESH APPLICATION
// ============================================================

export async function refreshApp() {

    try {

        const session =
            await getCurrentSession();


        await applySession(
            session
        );


        if (session?.user) {

            emit(
                "app:refresh",
                {
                    session,

                    user:
                        session.user
                }
            );

        }


        return session;

    } catch (error) {

        console.error(
            "Application refresh failed:",
            error
        );


        return null;

    }

}


// ============================================================
// INITIALIZE APPLICATION
// ============================================================

export async function initializeApp() {

    if (
        appState.initialized
    ) {

        return appState;

    }


    if (
        appState.initializing
    ) {

        return appState;

    }


    appState.initializing =
        true;


    appState.startedAt =
        new Date().toISOString();


    try {

        console.log(
            "========================================"
        );


        console.log(
            `${APP_CONFIG.appName || "ANNOTATION AI"} starting`
        );


        console.log(
            "========================================"
        );


        // ----------------------------------------------------
        // Global application events
        // ----------------------------------------------------

        bindApplicationEvents();


        // ----------------------------------------------------
        // Supabase authentication listener
        // ----------------------------------------------------

        bindAuthStateListener();


        // ----------------------------------------------------
        // Load existing session first
        // ----------------------------------------------------

        const initialSession =
            await loadInitialSession();


        // ----------------------------------------------------
        // Initialize all feature modules
        // ----------------------------------------------------

        await initializeModules();


        // ----------------------------------------------------
        // Auth startup compatibility
        // ----------------------------------------------------
        //
        // auth.js may expose loadSessionOnStartup().
        // It is safe to call it here as a final refresh.
        //
        // If it does not exist, nothing happens.
        // ----------------------------------------------------

        if (
            typeof loadSessionOnStartup ===
            "function"
        ) {

            try {

                const loadedSession =
                    await loadSessionOnStartup();


                if (
                    loadedSession?.user
                ) {

                    await applySession(
                        loadedSession
                    );

                }

            } catch (error) {

                console.warn(
                    "Auth startup refresh failed:",
                    error
                );

            }

        }


        // ----------------------------------------------------
        // Final Supabase user refresh
        // ----------------------------------------------------

        try {

            const currentSession =
                await getCurrentSession();


            if (
                currentSession?.user
            ) {

                await applySession(
                    currentSession
                );

            } else if (
                !initialSession
            ) {

                await applySession(
                    null
                );

            }

        } catch (error) {

            console.warn(
                "Final session refresh failed:",
                error
            );

        }


        // ----------------------------------------------------
        // Mark ready
        // ----------------------------------------------------

        appState.initialized =
            true;


        appState.ready =
            true;


        appState.initializing =
            false;


        document.documentElement.dataset.app =
            "annotation-ai";


        document.documentElement.dataset.appReady =
            "true";


        emit(
            "app:ready",
            {
                config:
                    APP_CONFIG,

                user:
                    appState.user,

                session:
                    appState.session,

                modules:
                    {
                        ...appState.moduleStatus
                    }
            }
        );


        console.log(
            "========================================"
        );


        console.log(
            "ANNOTATION AI is ready."
        );


        console.log(
            "Modules:",
            appState.moduleStatus
        );


        console.log(
            "========================================"
        );


        return appState;

    } catch (error) {

        appState.initializing =
            false;


        appState.ready =
            false;


        appState.initialized =
            false;


        console.error(
            "Fatal application startup error:",
            error
        );


        showAppToast(
            "Application started with an error. Check the browser console."
        );


        const loader =
            $("appLoader");


        if (loader) {

            loader.classList.add(
                "hidden"
            );

            loader.setAttribute(
                "aria-hidden",
                "true"
            );

        }


        throw error;

    }

}


// ============================================================
// GET APPLICATION STATE
// ============================================================

export function getAppState() {

    return {

        ...appState,

        moduleStatus:
            {
                ...appState.moduleStatus
            }

    };

}


// ============================================================
// GET CURRENT USER
// ============================================================

export function getAppUser() {

    return appState.user;

}


// ============================================================
// GET CURRENT SESSION
// ============================================================

export function getAppSession() {

    return appState.session;

}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================
//
// Some older modules or browser console workflows may expect
// these functions on window.
// ============================================================

window.initializeApp =
    initializeApp;


window.refreshApp =
    refreshApp;


window.restartApp =
    refreshApp;


window.getAppState =
    getAppState;


window.getAppUser =
    getAppUser;


window.getAppSession =
    getAppSession;


// ============================================================
// STARTUP
// ============================================================
//
// index.html already contains:
//
// <script type="module" src="./app.js"></script>
//
// No second script is necessary.
// ============================================================

function startApplication() {

    initializeApp()
        .catch(
            error => {

                console.error(
                    "ANNOTATION AI could not start:",
                    error
                );

            }
        );

}


if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        startApplication,
        {
            once: true
        }
    );

} else {

    startApplication();

}


// ============================================================
// EXPORTS
// ============================================================

export {
    appState
};
