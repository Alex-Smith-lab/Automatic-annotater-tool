/* ============================================================
   ANNOTATION AI
   SUPABASE CONNECTION
   File: js/supabase.js
============================================================ */

import {
    createClient
} from "https://esm.sh/@supabase/supabase-js@2";

import {
    APP_CONFIG
} from "./config.js";


// ============================================================
// CONFIGURATION CHECK
// ============================================================

const hasValidConfig =
    Boolean(
        APP_CONFIG.supabaseUrl &&
        APP_CONFIG.supabaseAnonKey &&
        APP_CONFIG.supabaseUrl !==
            "YOUR_SUPABASE_PROJECT_URL" &&
        APP_CONFIG.supabaseAnonKey !==
            "YOUR_SUPABASE_ANON_KEY"
    );


if (!hasValidConfig) {

    console.warn(
        "[Annotation AI] Supabase is not configured."
    );
}


// ============================================================
// SUPABASE CLIENT
// ============================================================

export const supabase =
    hasValidConfig
        ? createClient(
            APP_CONFIG.supabaseUrl,
            APP_CONFIG.supabaseAnonKey,
            {
                auth: {
                    persistSession:
                        APP_CONFIG.auth.persistSession,

                    autoRefreshToken:
                        APP_CONFIG.auth.autoRefreshToken,

                    detectSessionInUrl:
                        APP_CONFIG.auth.detectSessionInUrl,

                    storageKey:
                        APP_CONFIG.auth.storageKey,

                    flowType:
                        APP_CONFIG.auth.flowType
                }
            }
        )
        : null;


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.supabaseClient =
    supabase;


// ============================================================
// GET SUPABASE CLIENT
// ============================================================

export function getSupabase() {

    return supabase;
}


// ============================================================
// READY CHECK
// ============================================================

export function isSupabaseReady() {

    return Boolean(
        supabase
    );
}


// ============================================================
// CONNECTION TEST
// ============================================================

export async function checkSupabaseConnection() {

    if (!supabase) {

        return {
            connected: false,

            error:
                new Error(
                    "Supabase configuration is missing."
                )
        };
    }


    try {

        const {
            data,
            error
        } =
            await supabase.auth.getSession();


        if (error) {

            return {
                connected: false,
                error
            };
        }


        return {

            connected: true,

            session:
                data?.session ||
                null
        };

    } catch (error) {

        return {

            connected: false,

            error
        };
    }
}


// ============================================================
// GET SESSION
// ============================================================

export async function getSession() {

    if (!supabase) {

        return null;
    }


    try {

        const {
            data,
            error
        } =
            await supabase.auth.getSession();


        if (error) {

            console.warn(
                "[Supabase] getSession:",
                error
            );

            return null;
        }


        return (
            data?.session ||
            null
        );

    } catch (error) {

        console.error(
            "[Supabase] getSession error:",
            error
        );

        return null;
    }
}


// ============================================================
// GET CURRENT SESSION
// ============================================================
//
// auth.js expects:
// {
//     session,
//     error
// }
// ============================================================

export async function getCurrentSession() {

    if (!supabase) {

        return {

            session: null,

            error:
                new Error(
                    "Supabase is not configured."
                )
        };
    }


    try {

        const {
            data,
            error
        } =
            await supabase.auth.getSession();


        return {

            session:
                data?.session ||
                null,

            error:
                error ||
                null
        };

    } catch (error) {

        return {

            session: null,

            error
        };
    }
}


// ============================================================
// GET CURRENT USER
// ============================================================

export async function getCurrentUser() {

    const session =
        await getSession();


    return (
        session?.user ||
        null
    );
}


// ============================================================
// SAVE LOCAL SESSION
// ============================================================

export function saveLocalSession(
    session
) {

    try {

        if (!session) {

            return;
        }


        localStorage.setItem(

            APP_CONFIG.sessionKey,

            JSON.stringify(
                session
            )
        );

    } catch (error) {

        console.warn(
            "[Supabase] Could not save local session:",
            error
        );
    }
}


// ============================================================
// CLEAR LOCAL SESSION
// ============================================================

export function clearLocalSession() {

    try {

        localStorage.removeItem(
            APP_CONFIG.sessionKey
        );

    } catch (error) {

        console.warn(
            "[Supabase] Could not clear local session:",
            error
        );
    }
}


// ============================================================
// CLOUD STATUS
// ============================================================

export function updateCloudStatus(
    message,
    online = false
) {

    const element =
        document.getElementById(
            "cloudStatus"
        );


    if (!element) {

        return;
    }


    element.textContent =
        message ||
        (
            online
                ? "Cloud connected"
                : "Not signed in"
        );


    element.dataset.status =
        online
            ? "online"
            : "offline";
}


// ============================================================
// SIGN OUT
// ============================================================

export async function signOutUser() {

    if (!supabase) {

        return {

            success: false,

            error:
                new Error(
                    "Supabase is not configured."
                )
        };
    }


    try {

        const {
            error
        } =
            await supabase.auth.signOut();


        if (error) {

            return {

                success: false,

                error
            };
        }


        clearLocalSession();


        return {

            success: true,

            error: null
        };

    } catch (error) {

        return {

            success: false,

            error
        };
    }
}


// ============================================================
// AUTH STATE LISTENER
// ============================================================

export function onAuthStateChange(
    callback
) {

    if (!supabase) {

        return {

            data: {

                subscription: {

                    unsubscribe() {}
                }
            }
        };
    }


    return (
        supabase.auth.onAuthStateChange(
            callback
        )
    );
}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.getSupabase =
    getSupabase;

window.getCurrentSession =
    getCurrentSession;

window.getCurrentUser =
    getCurrentUser;

window.isSupabaseReady =
    isSupabaseReady;
