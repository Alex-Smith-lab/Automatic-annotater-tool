// ============================================================
// ANNOTATION AI - SUPABASE CLIENT
// ============================================================

import { createClient } from
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import { APP_CONFIG } from "./config.js";


// ============================================================
// SUPABASE CONFIGURATION
// ============================================================

const SUPABASE_URL =
    APP_CONFIG.supabaseUrl;

const SUPABASE_KEY =
    APP_CONFIG.supabaseAnonKey;


// ============================================================
// CLIENT
// ============================================================

let supabase = null;

let supabaseReady = false;

let supabaseError = null;


try {

    if (
        SUPABASE_URL &&
        SUPABASE_KEY
    ) {

        supabase =
            createClient(
                SUPABASE_URL,
                SUPABASE_KEY,
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
            );

        supabaseReady = true;

    } else {

        supabaseError =
            new Error(
                "Supabase URL or publishable key is missing."
            );
    }

} catch (error) {

    supabaseError =
        error;

    console.error(
        "Supabase initialization failed:",
        error
    );
}


// ============================================================
// GET SUPABASE CLIENT
// ============================================================

export function getSupabase() {

    return supabase;
}


// ============================================================
// DIRECT EXPORT
// ============================================================

export {
    supabase
};


// ============================================================
// CHECK SUPABASE READY
// ============================================================

export function isSupabaseReady() {

    return (
        Boolean(supabase) &&
        supabaseReady
    );
}


// ============================================================
// CONNECTION CHECK
// ============================================================

export async function checkSupabaseConnection() {

    if (
        !isSupabaseReady()
    ) {

        return {
            ok: false,
            error:
                supabaseError ||
                new Error(
                    "Supabase is not initialized."
                )
        };
    }

    try {

        const {
            data,
            error
        } =
            await supabase
                .from(
                    APP_CONFIG.tables.profiles
                )
                .select("id")
                .limit(1);

        if (error) {

            return {
                ok: false,
                error
            };
        }

        return {
            ok: true,
            data
        };

    } catch (error) {

        return {
            ok: false,
            error
        };
    }
}


// ============================================================
// GET SESSION
// ============================================================

export async function getSession() {

    if (
        !isSupabaseReady()
    ) {
        return null;
    }

    try {

        const {
            data,
            error
        } =
            await supabase.auth.getSession();

        if (error) {

            console.error(
                "Unable to get Supabase session:",
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
            "getSession error:",
            error
        );

        return null;
    }
}


// ============================================================
// GET CURRENT SESSION
// Compatibility alias
// ============================================================

export async function getCurrentSession() {

    return await getSession();
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
// Compatibility helper
// ============================================================

export function saveLocalSession(
    session
) {

    if (!session) {
        return;
    }

    try {

        localStorage.setItem(
            `${APP_CONFIG.auth.storageKey}:session`,
            JSON.stringify(session)
        );

    } catch (error) {

        console.warn(
            "Unable to save local session:",
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
            `${APP_CONFIG.auth.storageKey}:session`
        );

    } catch (error) {

        console.warn(
            "Unable to clear local session:",
            error
        );
    }
}


// ============================================================
// UPDATE CLOUD STATUS
//
// IMPORTANT:
// profiles does NOT contain a last_seen_at column.
//
// Available relevant columns include:
// - last_login_at
// - last_logout_at
// - updated_at
//
// This function therefore uses the real schema.
// ============================================================

export async function updateCloudStatus(
    status,
    metadata = {}
) {

    const user =
        await getCurrentUser();

    if (
        !user ||
        !isSupabaseReady()
    ) {

        return {
            ok: false,
            error: new Error(
                "No authenticated Supabase user."
            )
        };
    }

    try {

        const now =
            new Date().toISOString();

        const updates = {
            updated_at: now
        };


        // ----------------------------------------------------
        // NORMALIZE STATUS
        // ----------------------------------------------------

        const normalizedStatus =
            String(
                status || ""
            )
                .toLowerCase()
                .trim();


        // ----------------------------------------------------
        // LOGIN / ONLINE STATUS
        // ----------------------------------------------------

        if (
            normalizedStatus === "login" ||
            normalizedStatus === "signed_in" ||
            normalizedStatus === "signin" ||
            normalizedStatus === "online" ||
            normalizedStatus === "active"
        ) {

            updates.last_login_at =
                now;
        }


        // ----------------------------------------------------
        // LOGOUT / OFFLINE STATUS
        // ----------------------------------------------------

        else if (
            normalizedStatus === "logout" ||
            normalizedStatus === "signed_out" ||
            normalizedStatus === "signout" ||
            normalizedStatus === "offline" ||
            normalizedStatus === "inactive"
        ) {

            updates.last_logout_at =
                now;
        }


        // ----------------------------------------------------
        // OPTIONAL PROFILE METADATA
        //
        // Only columns that actually exist in profiles
        // are accepted here.
        // ----------------------------------------------------

        if (
            metadata &&
            typeof metadata === "object"
        ) {

            if (
                metadata.full_name !== undefined &&
                metadata.full_name !== null
            ) {

                updates.full_name =
                    String(
                        metadata.full_name
                    ).trim();
            }


            if (
                metadata.avatar_url !== undefined &&
                metadata.avatar_url !== null
            ) {

                updates.avatar_url =
                    String(
                        metadata.avatar_url
                    ).trim();
            }


            if (
                metadata.theme !== undefined &&
                metadata.theme !== null
            ) {

                updates.theme =
                    String(
                        metadata.theme
                    ).trim();
            }
        }


        // ----------------------------------------------------
        // UPDATE PROFILE
        // ----------------------------------------------------

        const {
            error
        } =
            await supabase
                .from(
                    APP_CONFIG.tables.profiles
                )
                .update(updates)
                .eq(
                    "id",
                    user.id
                );


        if (error) {

            console.warn(
                "Unable to update cloud status:",
                error
            );

            return {
                ok: false,
                error
            };
        }


        return {
            ok: true,
            status:
                normalizedStatus,
            updated:
                updates
        };

    } catch (error) {

        console.warn(
            "updateCloudStatus error:",
            error
        );

        return {
            ok: false,
            error
        };
    }
}


// ============================================================
// SIGN OUT
// ============================================================

export async function signOutUser() {

    if (
        !isSupabaseReady()
    ) {

        clearLocalSession();

        return {
            success: true
        };
    }

    try {

        // ----------------------------------------------------
        // Try to record logout before signing out.
        // Failure here should NOT prevent logout.
        // ----------------------------------------------------

        try {

            const user =
                await getCurrentUser();

            if (user) {

                await supabase
                    .from(
                        APP_CONFIG.tables.profiles
                    )
                    .update({
                        last_logout_at:
                            new Date().toISOString(),

                        updated_at:
                            new Date().toISOString()
                    })
                    .eq(
                        "id",
                        user.id
                    );
            }

        } catch (logoutUpdateError) {

            console.warn(
                "Unable to update logout timestamp:",
                logoutUpdateError
            );
        }


        // ----------------------------------------------------
        // Supabase logout
        // ----------------------------------------------------

        const {
            error
        } =
            await supabase.auth.signOut();

        clearLocalSession();


        if (error) {

            console.error(
                "Sign out failed:",
                error
            );

            return {
                success: false,
                error
            };
        }


        return {
            success: true
        };

    } catch (error) {

        console.error(
            "signOutUser error:",
            error
        );

        clearLocalSession();

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

    if (
        !isSupabaseReady() ||
        typeof callback !== "function"
    ) {

        return {
            data: {
                subscription: {
                    unsubscribe() {}
                }
            }
        };
    }


    const {
        data
    } =
        supabase.auth.onAuthStateChange(
            async (
                event,
                session
            ) => {

                try {

                    if (session) {

                        saveLocalSession(
                            session
                        );

                    } else {

                        clearLocalSession();
                    }


                    await callback(
                        event,
                        session
                    );

                } catch (error) {

                    console.error(
                        "Auth state callback error:",
                        error
                    );
                }
            }
        );


    return data;
}


// ============================================================
// AUTH EVENT HELPERS
// ============================================================

export function getAuthEventName(
    event
) {

    const names = {

        INITIAL_SESSION:
            "Initial session",

        SIGNED_IN:
            "Signed in",

        SIGNED_OUT:
            "Signed out",

        PASSWORD_RECOVERY:
            "Password recovery",

        TOKEN_REFRESHED:
            "Token refreshed",

        USER_UPDATED:
            "User updated"
    };


    return (
        names[event] ||
        event ||
        "Unknown"
    );
}


// ============================================================
// DATABASE HELPERS
// ============================================================

export async function getProfileByUserId(
    userId
) {

    if (
        !userId ||
        !isSupabaseReady()
    ) {

        return null;
    }


    try {

        const {
            data,
            error
        } =
            await supabase
                .from(
                    APP_CONFIG.tables.profiles
                )
                .select("*")
                .eq(
                    "id",
                    userId
                )
                .maybeSingle();


        if (error) {

            console.error(
                "Unable to load profile:",
                error
            );

            return null;
        }


        return (
            data ||
            null
        );

    } catch (error) {

        console.error(
            "getProfileByUserId error:",
            error
        );

        return null;
    }
}


// ============================================================
// GET CURRENT PROFILE
// ============================================================

export async function getCurrentProfile() {

    const user =
        await getCurrentUser();

    if (!user) {
        return null;
    }

    return await getProfileByUserId(
        user.id
    );
}


// ============================================================
// ACTIVITY LOGGER
// ============================================================

export async function logActivity(
    eventType,
    metadata = {}
) {

    if (
        !isSupabaseReady()
    ) {

        return null;
    }


    const user =
        await getCurrentUser();

    if (!user) {
        return null;
    }


    try {

        const row = {

            user_id:
                user.id,

            event_type:
                eventType,

            metadata:
                metadata || {},

            created_at:
                new Date().toISOString()
        };


        const {
            data,
            error
        } =
            await supabase
                .from(
                    APP_CONFIG.tables.activityLogs
                )
                .insert(row)
                .select()
                .maybeSingle();


        if (error) {

            console.warn(
                "Activity log failed:",
                error
            );

            return null;
        }


        return (
            data ||
            null
        );

    } catch (error) {

        console.warn(
            "logActivity error:",
            error
        );

        return null;
    }
}


// ============================================================
// WORKFLOW EVENT LOGGER
// ============================================================

export async function logWorkflowEvent(
    taskId,
    eventType,
    metadata = {}
) {

    if (
        !taskId ||
        !isSupabaseReady()
    ) {

        return null;
    }


    const user =
        await getCurrentUser();


    try {

        const row = {

            task_id:
                taskId,

            event_type:
                eventType,

            user_id:
                user?.id ||
                null,

            metadata:
                metadata || {},

            created_at:
                new Date().toISOString()
        };


        const {
            data,
            error
        } =
            await supabase
                .from(
                    APP_CONFIG.tables.workflowEvents
                )
                .insert(row)
                .select()
                .maybeSingle();


        if (error) {

            console.warn(
                "Workflow event failed:",
                error
            );

            return null;
        }


        return (
            data ||
            null
        );

    } catch (error) {

        console.warn(
            "logWorkflowEvent error:",
            error
        );

        return null;
    }
}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

if (typeof window !== "undefined") {

    window.supabase =
        supabase;

    window.getSupabase =
        getSupabase;

    window.isSupabaseReady =
        isSupabaseReady;

    window.getSession =
        getSession;

    window.getCurrentSession =
        getCurrentSession;

    window.getCurrentUser =
        getCurrentUser;

    window.getCurrentProfile =
        getCurrentProfile;

    window.checkSupabaseConnection =
        checkSupabaseConnection;

    window.signOutUser =
        signOutUser;

    window.onAuthStateChange =
        onAuthStateChange;

    window.updateCloudStatus =
        updateCloudStatus;

    window.logActivity =
        logActivity;

    window.logWorkflowEvent =
        logWorkflowEvent;
}
