// ============================================================
// ANNOTATION AI
// MAIN APPLICATION BOOTSTRAP
// File: app.js
// ============================================================

import {
    APP_CONFIG
} from "./js/config.js";

import {
    supabase,
    getCurrentUser,
    getSession,
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

import {
    initializeWorkspace
} from "./js/workspace.js";


// ============================================================
// APPLICATION STATE
// ============================================================

const appState = {

    initialized:
        false,

    initializing:
        false,

    ready:
        false,

    session:
        null,

    user:
        null
};


// ============================================================
// DOM HELPER
// ============================================================

function $(id) {

    return document.getElementById(
        id
    );
}


// ============================================================
// ERROR DISPLAY
// ============================================================

function showStartupError(
    error
) {

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
        error?.message ||
        "Application startup failed.";


    status.style.display =
        "block";
}


// ============================================================
// SAFE INITIALIZER
// ============================================================

async function safeInitialize(
    name,
    initializer
) {

    if (
        typeof initializer !==
        "function"
    ) {

        console.warn(
            `${name} initializer is not available.`
        );

        return;
    }


    try {

        const result =
            initializer();


        if (
            result &&
            typeof result.then ===
            "function"
        ) {

            await result;
        }

    } catch (error) {

        console.error(
            `${name} initialization failed:`,
            error
        );

        throw error;
    }
}


// ============================================================
// APPLICATION STARTUP
// ============================================================

async function initializeApplication() {

    if (
        appState.initialized ||
        appState.initializing
    ) {

        return;
    }


    appState.initializing =
        true;


    try {

        /*
         * The annotation engine must be initialized
         * before media, AI and task restoration.
         */

        await safeInitialize(
            "Annotation",
            initializeAnnotation
        );


        await safeInitialize(
            "Media",
            initializeMedia
        );


        await safeInitialize(
            "AI",
            initializeAI
        );


        await safeInitialize(
            "Tasks",
            initializeTasks
        );


        await safeInitialize(
            "History",
            initializeHistory
        );


        await safeInitialize(
            "Profile",
            initializeProfile
        );


        await safeInitialize(
            "Home",
            initializeHome
        );


        await safeInitialize(
            "Workspace",
            initializeWorkspace
        );


        await safeInitialize(
            "Admin",
            initializeAdmin
        );


        await safeInitialize(
            "Authentication",
            initializeAuth
        );


        /*
         * Restore the existing Supabase session.
         * This does not create another Supabase client.
         */

        if (
            typeof loadSessionOnStartup ===
            "function"
        ) {

            await loadSessionOnStartup();
        }


        appState.session =
            typeof getSession ===
            "function"
                ? await getSession()
                : null;


        appState.user =
            typeof getCurrentUser ===
            "function"
                ? await getCurrentUser()
                : null;


        appState.initialized =
            true;

        appState.ready =
            true;


        window.dispatchEvent(
            new CustomEvent(
                "application-ready",
                {
                    detail: {
                        session:
                            appState.session,

                        user:
                            appState.user
                    }
                }
            )
        );


        console.log(
            "ANNOTATION AI initialized successfully."
        );

    } catch (error) {

        showStartupError(
            error
        );

    } finally {

        appState.initializing =
            false;
    }
}


// ============================================================
// AUTH STATE LISTENER
// ============================================================

if (
    typeof onAuthStateChange ===
    "function"
) {

    onAuthStateChange(
        async (
            event,
            session
        ) => {

            try {

                appState.session =
                    session ||
                    null;


                appState.user =
                    session?.user ||
                    null;


                window.dispatchEvent(
                    new CustomEvent(
                        "application-auth-state",
                        {
                            detail: {
                                event,
                                session,
                                user:
                                    session?.user ||
                                    null
                            }
                        }
                    )
                );

            } catch (error) {

                console.error(
                    "Auth state event error:",
                    error
                );
            }
        }
    );
}


// ============================================================
// GLOBAL APPLICATION OBJECT
// ============================================================

window.AnnotationApp = {

    config:
        APP_CONFIG,

    state:
        appState,

    supabase,

    initialize:
        initializeApplication
};


// ============================================================
// START
// ============================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeApplication,
        {
            once:
                true
        }
    );

} else {

    initializeApplication();
}
