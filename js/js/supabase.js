/* ============================================================
   SUPABASE CONNECTION
   js/supabase.js
============================================================ */

import {
    createClient
} from "https://esm.sh/@supabase/supabase-js@2";

import {
    APP_CONFIG
} from "./config.js";


/* ============================================================
   VALIDATE CONFIG
============================================================ */

const hasValidConfig =
    APP_CONFIG.supabaseUrl &&
    APP_CONFIG.supabaseAnonKey &&
    APP_CONFIG.supabaseUrl !==
        "YOUR_SUPABASE_PROJECT_URL" &&
    APP_CONFIG.supabaseAnonKey !==
        "YOUR_SUPABASE_ANON_KEY";


if (!hasValidConfig) {

    console.warn(
        "[Annotation AI] Supabase is not configured."
    );

    console.warn(
        "[Annotation AI] Update js/config.js with your existing project URL and anon key."
    );
}


/* ============================================================
   CLIENT
============================================================ */

export const supabase =
    hasValidConfig
        ? createClient(
            APP_CONFIG.supabaseUrl,
            APP_CONFIG.supabaseAnonKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        )
        : null;


/* ============================================================
   GLOBAL REFERENCE
   This keeps compatibility with older code that expects
   window.supabaseClient.
============================================================ */

window.supabaseClient =
    supabase;


/* ============================================================
   CONNECTION TEST
============================================================ */

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
        } = await supabase.auth.getSession();


        if (error) {

            return {
                connected: false,
                error
            };
        }


        return {
            connected: true,
            session:
                data?.session || null
        };

    } catch (error) {

        return {
            connected: false,
            error
        };
    }
}


/* ============================================================
   AUTH SESSION
============================================================ */

export async function getSession() {

    if (!supabase) {
        return null;
    }


    const {
        data,
        error
    } = await supabase.auth.getSession();


    if (error) {

        console.warn(
            "[Supabase] getSession:",
            error
        );

        return null;
    }


    return data?.session || null;
}


/* ============================================================
   CURRENT USER
============================================================ */

export async function getCurrentUser() {

    const session =
        await getSession();

    return session?.user || null;
}


/* ============================================================
   SIGN OUT
============================================================ */

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


    const {
        error
    } = await supabase.auth.signOut();


    if (error) {

        return {
            success: false,
            error
        };
    }


    return {
        success: true
    };
}


/* ============================================================
   AUTH STATE LISTENER
============================================================ */

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


    return supabase.auth.onAuthStateChange(
        callback
    );
}
