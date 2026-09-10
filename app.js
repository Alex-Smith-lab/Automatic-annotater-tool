```js
// ============================================================
// ANNOTATION AI
// PART 10 — MAIN APPLICATION BOOTSTRAP
// File: app.js
// ============================================================
//
// This file intentionally contains application startup and
// module coordination only.
//
// Main modules:
//   js/config.js
//   js/supabase.js
//   js/auth.js
//   js/annotation.js
//   js/media.js
//   js/ai.js
//   js/tasks.js
//   js/admin.js
//   js/profile.js
//   js/history.js
//   js/home.js
// ============================================================


// ------------------------------------------------------------
// MODULE IMPORTS
// ------------------------------------------------------------

import { APP_CONFIG } from "./js/config.js";

import {
    supabase,
    getCurrentUser,
    getCurrentSession,
    onAuthStateChange
} from "./js/supabase.js";

import {
    initializeAuth,
    loadSessionOnStartup
} from "./js/auth.js";

import {
    initializeAnnotation
} from "./js/annotation.js";

import {
    initializeMedia
} from "./js/media.js";

import {
    initializeAI
} from "./js/ai.js";

import {
    initializeTasks
} from "./js/tasks.js";

import {
    initializeAdmin
} from "./js/admin.js";

import {
    initializeProfile
} from "./js/profile.js";

import {
    initializeHistory
} from "./js/history.js";

import {
    initializeHome
} from "./js/home.js";


// ------------------------------------------------------------
// APPLICATION STATE
// ------------------------------------------------------------

const appState = {
    initialized: false,
    initializing: false,
    ready: false,
    session: null,
    user: null
};


// ------------------------------------------------------------
// DOM HELPER
// ------------------------------------------------------------

function $(id) {
    return document.getElementById(id);
}


// ------------------------------------------------------------
// SAFE ERROR DISPLAY
// ------------------------------------------------------------

function showStartupError(error) {
    console.error(
        "ANNOTATION AI startup error:",
        error
    );

    const status =
        $("authStatus") ||
        $("cloudStatus");

    if (!status) {
        return;
    }

    status.textContent =
        "Application started, but some features could not be loaded.";

    status.classList.add("error");
}


// ------------------------------------------------------------
// CLOUD STATUS
// ------------------------------------------------------------

function updateCloudStatus(session) {
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


// ------------------------------------------------------------
// APPLICATION VISIBILITY
// ------------------------------------------------------------

function updateApplicationVisibility(session) {
    const loginPage =
        $("loginPage");

    const authLoggedOut =
        $("authLoggedOut");

    const authLoggedIn =
        $("authLoggedIn");

    if (session?.user) {
        if (loginPage) {
            loginPage.style.display =
                "none";

            loginPage.hidden =
                true;
        }

        if (authLoggedOut) {
            authLoggedOut.style.display =
                "none";

            authLoggedOut.hidden =
                true;
        }

        if (authLoggedIn) {
            authLoggedIn.style.display =
                "";

            authLoggedIn.hidden =
                false;
        }
    } else {
        if (loginPage) {
            loginPage.style.display =
                "";

            loginPage.hidden =
                false;
        }

        if (authLoggedOut) {
            authLoggedOut.style.display =
                "";

            authLoggedOut.hidden =
                false;
        }

        if (authLoggedIn) {
            authLoggedIn.style.display =
                "none";

            authLoggedIn.hidden =
                true;
        }
    }
}


// ------------------------------------------------------------
// SESSION EVENT
// ------------------------------------------------------------

function handleSession(session) {
    appState.session =
        session || null;

    appState.user =
        session?.user || null;

    updateCloudStatus(session);

    updateApplicationVisibility(
        session
    );

    window.dispatchEvent(
        new CustomEvent("app:session", {
            detail: {
                session:
                    appState.session,
                user:
                    appState.user
            }
        })
    );
}


// ------------------------------------------------------------
// AUTH STATE LISTENER
// ------------------------------------------------------------

function bindAuthStateListener() {
    if (!supabase) {
        return;
    }

    try {
        onAuthStateChange(
            (event, session) => {
                console.log(
                    "Auth event:",
                    event
                );

                handleSession(session);

                window.dispatchEvent(
                    new CustomEvent(
                        "app:authChange",
                        {
                            detail: {
                                event,
                                session
                            }
                        }
                    )
                );
            }
        );
    } catch (error) {
        console.warn(
            "Auth listener could not be attached:",
            error
        );
    }
}


// ------------------------------------------------------------
// GLOBAL APPLICATION EVENTS
// ------------------------------------------------------------

function bindApplicationEvents() {

    // --------------------------------------------------------
    // Authentication
    // --------------------------------------------------------

    window.addEventListener(
        "auth:login",
        event => {
            const user =
                event.detail?.user ||
                null;

            if (user) {
                appState.user =
                    user;

                appState.session =
                    event.detail?.session ||
                    appState.session;
            }

            updateApplicationVisibility(
                appState.session
            );

            updateCloudStatus(
                appState.session
            );
        }
    );


    window.addEventListener(
        "auth:logout",
        () => {
            appState.user = null;
            appState.session = null;

            updateApplicationVisibility(
                null
            );

            updateCloudStatus(
                null
            );
        }
    );


    // --------------------------------------------------------
    // Home / dashboard
    // --------------------------------------------------------

    window.addEventListener(
        "home:openTask",
        event => {
            console.log(
                "Opening task:",
                event.detail?.taskId
            );
        }
    );


    // --------------------------------------------------------
    // History
    // --------------------------------------------------------

    window.addEventListener(
        "history:openTask",
        event => {
            console.log(
                "Opening history task:",
                event.detail?.taskId
            );
        }
    );


    // --------------------------------------------------------
    // Annotation media events
    // --------------------------------------------------------

    window.addEventListener(
        "annotation:loadTaskMedia",
        event => {
            console.log(
                "Task media requested:",
                event.detail
            );
        }
    );


    window.addEventListener(
        "annotation:loadMediaURL",
        event => {
            console.log(
                "Media URL requested:",
                event.detail
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
}


// ------------------------------------------------------------
// DISPATCH READY EVENT
// ------------------------------------------------------------

function dispatchReady() {
    window.dispatchEvent(
        new CustomEvent("app:ready", {
            detail: {
                config:
                    APP_CONFIG,
                user:
                    appState.user,
                session:
                    appState.session
            }
        })
    );
}


// ------------------------------------------------------------
// LOAD CURRENT SESSION
// ------------------------------------------------------------

async function loadInitialSession() {
    try {
        const session =
            await getCurrentSession();

        handleSession(session);

        return session;
    } catch (error) {
        console.warn(
            "Could not load initial session:",
            error
        );

        handleSession(null);

        return null;
    }
}


// ------------------------------------------------------------
// INITIALIZE MODULES
// ------------------------------------------------------------

async function initializeModules() {

    // --------------------------------------------------------
    // IMPORTANT:
    // Each module has its own initialized guard.
    // This prevents accidental duplicate event handlers.
    // --------------------------------------------------------

    const modules = [
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
            "admin",
            initializeAdmin
        ],
        [
            "profile",
            initializeProfile
        ],
        [
            "history",
            initializeHistory
        ],
        [
            "home",
            initializeHome
        ],
        [
            "auth",
            initializeAuth
        ]
    ];


    for (const [
        name,
        initializer
    ] of modules) {

        if (
            typeof initializer !==
            "function"
        ) {
            console.warn(
                `Module "${name}" does not expose an initializer.`
            );

            continue;
        }

        try {
            await initializer();
        } catch (error) {
            console.error(
                `Failed to initialize ${name}:`,
                error
            );

            // One broken optional module should not prevent
            // the rest of the application from loading.
        }
    }
}


// ------------------------------------------------------------
// START APPLICATION
// ------------------------------------------------------------

export async function initializeApp() {

    if (appState.initialized) {
        return appState;
    }

    if (appState.initializing) {
        return appState;
    }

    appState.initializing =
        true;


    try {

        console.log(
            `${APP_CONFIG.appName || "ANNOTATION AI"} starting...`
        );


        // ----------------------------------------------------
        // Global events first
        // ----------------------------------------------------

        bindApplicationEvents();


        // ----------------------------------------------------
        // Supabase authentication listener
        // ----------------------------------------------------

        bindAuthStateListener();


        // ----------------------------------------------------
        // Load existing session
        // ----------------------------------------------------

        const session =
            await loadInitialSession();


        // ----------------------------------------------------
        // Initialize application modules
        // ----------------------------------------------------

        await initializeModules();


        // ----------------------------------------------------
        // Auth startup compatibility
        //
        // If auth.js provides loadSessionOnStartup(), run it
        // after the modules are available.
        // ----------------------------------------------------

        if (
            typeof loadSessionOnStartup ===
            "function"
        ) {
            try {
                const loadedSession =
                    await loadSessionOnStartup();

                if (
                    loadedSession &&
                    loadedSession.user
                ) {
                    appState.session =
                        loadedSession;

                    appState.user =
                        loadedSession.user;

                    handleSession(
                        loadedSession
                    );
                }
            } catch (error) {
                console.warn(
                    "Auth startup session check failed:",
                    error
                );
            }
        }


        // ----------------------------------------------------
        // Final user refresh
        // ----------------------------------------------------

        try {
            const user =
                await getCurrentUser();

            if (user) {
                appState.user =
                    user;

                if (!appState.session) {
                    appState.session = {
                        user
                    };
                }

                updateApplicationVisibility(
                    appState.session
                );

                updateCloudStatus(
                    appState.session
                );
            }
        } catch (error) {
            console.warn(
                "Could not refresh current user:",
                error
            );
        }


        // ----------------------------------------------------
        // Mark application ready
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


        dispatchReady();


        console.log(
            "ANNOTATION AI is ready."
        );


        return appState;

    } catch (error) {

        appState.initializing =
            false;

        appState.ready =
            false;

        showStartupError(
            error
        );

        console.error(
            "Fatal application startup error:",
            error
        );

        throw error;
    }
}


// ------------------------------------------------------------
// APPLICATION RESTART
// ------------------------------------------------------------

export async function restartApp() {

    // Do not reset module initialized flags.
    // This simply refreshes the current session and UI.

    try {

        const session =
            await getCurrentSession();

        handleSession(
            session
        );

        if (
            session?.user
        ) {
            window.dispatchEvent(
                new CustomEvent(
                    "app:refresh",
                    {
                        detail: {
                            session,
                            user:
                                session.user
                        }
                    }
                )
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


// ------------------------------------------------------------
// GET APP STATE
// ------------------------------------------------------------

export function getAppState() {
    return {
        ...appState
    };
}


// ------------------------------------------------------------
// GLOBAL COMPATIBILITY
// ------------------------------------------------------------

window.initializeApp =
    initializeApp;

window.restartApp =
    restartApp;

window.getAppState =
    getAppState;


// ------------------------------------------------------------
// STARTUP
// ------------------------------------------------------------
//
// The HTML already loads app.js as:
//
// <script type="module" src="./app.js"></script>
//
// Therefore no additional script tag is needed.
// ------------------------------------------------------------

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeApp().catch(
                error => {
                    console.error(
                        "Application failed to start:",
                        error
                    );
                }
            );
        },
        {
            once: true
        }
    );

} else {

    initializeApp().catch(
        error => {
            console.error(
                "Application failed to start:",
                error
            );
        }
    );
}


// ------------------------------------------------------------
// EXPORT
// ------------------------------------------------------------

export {
    appState
};
```
