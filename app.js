/* ============================================================
   APPLICATION BOOTSTRAP
   app.js
============================================================ */

import {
    initializeAuth
} from "./js/auth.js";


/* ============================================================
   APPLICATION
============================================================ */

const AnnotationApp = {

    initialized:
        false,

    modules: {}
};


/* ============================================================
   REGISTER MODULE
============================================================ */

AnnotationApp.register =
    function (
        name,
        module
    ) {

        this.modules[name] =
            module;
    };


/* ============================================================
   START
============================================================ */

async function startApplication() {

    if (
        AnnotationApp.initialized
    ) {
        return;
    }


    console.log(
        "[Annotation AI] Starting application…"
    );


    try {

        /*
         * Authentication is initialized first.
         *
         * Other modules will be added here as we split
         * the original 5,600-line app.js.
         */

        await initializeAuth();


        AnnotationApp.initialized =
            true;


        document.dispatchEvent(
            new CustomEvent(
                "annotation-app-ready"
            )
        );


        console.log(
            "[Annotation AI] Application ready."
        );


    } catch (error) {

        console.error(
            "[Annotation AI] Startup error:",
            error
        );
    }
}


/* ============================================================
   GLOBAL API
============================================================ */

window.AnnotationApp =
    AnnotationApp;


/* ============================================================
   START AFTER DOM
============================================================ */

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
