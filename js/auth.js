/* ============================================================
   AUTH.JS
   ------------------------------------------------------------
   Authentication, session management, profiles, roles,
   approval status and authorization helpers.

   Compatibility exports included for:
   - app.js
   - annotation.js
   - admin.js
   - profile.js
   - home.js
   - history.js
   - media.js
   - tasks.js
   - workspace.js

   IMPORTANT:
   - Normal signup = customer + inactive/pending
   - Default administrator is always protected
   - Admin email is not displayed to normal users
   - Supabase remains the source of authentication
   ============================================================ */

import {
    APP_CONFIG,
    normalizeRole,
    isAdminRole,
    isStaffRole,
    isReviewerRole,
    isCoworkerRole,
    canAnnotateRole
} from "./config.js";

import {
    supabase,
    getSupabase,
    getCurrentUser as getSupabaseCurrentUser,
    getCurrentSession,
    saveLocalSession,
    clearLocalSession,
    updateCloudStatus,
    logActivity,
    logWorkflowEvent,
    getProfileByUserId
} from "./supabase.js";


/* ============================================================
   STATE
   ============================================================ */

const authState = {
    initialized: false,
    loading: false,

    authenticated: false,

    user: null,
    session: null,
    profile: null,

    role: "customer",

    active: false,
    pendingApproval: false,

    listeners: new Set()
};

window.authState = authState;


/* ============================================================
   CONSTANTS
   ============================================================ */

const ADMIN_EMAIL = String(
    APP_CONFIG?.adminEmail ||
    "antonymbali96@gmail.com"
)
    .trim()
    .toLowerCase();


/* ============================================================
   BASIC HELPERS
   ============================================================ */

function cleanEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}


function cleanName(name, email = "") {
    const value = String(name || "").trim();

    if (value) {
        return value;
    }

    const fallback = cleanEmail(email)
        .split("@")[0];

    return fallback || "User";
}


function getErrorMessage(
    error,
    fallback = "Something went wrong."
) {
    if (!error) {
        return fallback;
    }

    if (typeof error === "string") {
        return error;
    }

    return (
        error.message ||
        error.error_description ||
        error.details ||
        error.hint ||
        fallback
    );
}


function isAdminEmail(email) {
    return (
        cleanEmail(email) ===
        ADMIN_EMAIL
    );
}


function isRealAuthenticatedUser(user) {
    return Boolean(
        user &&
        user.id &&
        user.email
    );
}


/* ============================================================
   PROFILE NORMALIZATION
   ============================================================ */

function normalizeProfile(
    profile,
    user = authState.user
) {
    const email = cleanEmail(
        profile?.email ||
        user?.email ||
        ""
    );

    let role = normalizeRole(
        profile?.role ||
        user?.user_metadata?.role ||
        "customer"
    );

    /*
     * The protected administrator can never accidentally become
     * a normal user because of a stale profile record.
     */
    if (isAdminEmail(email)) {
        role = "admin";
    }

    let active = profile?.active;

    /*
     * Compatibility with older databases that may have used
     * a textual status column.
     */
    if (
        active === undefined ||
        active === null
    ) {
        if (
            profile?.status !== undefined &&
            profile?.status !== null
        ) {
            const status = String(
                profile.status
            ).toLowerCase();

            active = [
                "active",
                "approved",
                "enabled",
                "true"
            ].includes(status);
        } else {
            active = false;
        }
    }

    /*
     * Default administrator is always active.
     */
    if (isAdminEmail(email)) {
        active = true;
    }

    return {
        ...(profile || {}),

        id:
            profile?.id ||
            user?.id ||
            null,

        email,

        full_name: cleanName(
            profile?.full_name ||
            profile?.name ||
            user?.user_metadata?.full_name ||
            user?.user_metadata?.name,
            email
        ),

        role,

        active: Boolean(active)
    };
}


/* ============================================================
   AUTH EVENT SYSTEM
   ============================================================ */

function emitAuthChange(
    reason = "changed"
) {
    const snapshot =
        getAuthState();

    authState.listeners.forEach(
        listener => {
            try {
                listener(
                    snapshot,
                    reason
                );
            } catch (error) {
                console.error(
                    "Auth listener error:",
                    error
                );
            }
        }
    );

    try {
        window.dispatchEvent(
            new CustomEvent(
                "authStateChanged",
                {
                    detail: {
                        ...snapshot,
                        reason
                    }
                }
            )
        );
    } catch (error) {
        console.warn(
            "Could not dispatch authStateChanged:",
            error
        );
    }

    /*
     * Compatibility events used by older modules.
     */
    if (
        reason === "login" ||
        reason === "signed_in"
    ) {
        try {
            window.dispatchEvent(
                new CustomEvent(
                    "auth:login",
                    {
                        detail: snapshot
                    }
                )
            );
        } catch {}
    }

    if (
        reason === "logout" ||
        reason === "supabaseSignedOut"
    ) {
        try {
            window.dispatchEvent(
                new CustomEvent(
                    "auth:logout",
                    {
                        detail: snapshot
                    }
                )
            );
        } catch {}
    }

    return snapshot;
}


/* ============================================================
   LISTENER
   ============================================================ */

export function onAuthStateChange(
    listener
) {
    if (
        typeof listener !==
        "function"
    ) {
        return () => {};
    }

    authState.listeners.add(
        listener
    );

    return () => {
        authState.listeners.delete(
            listener
        );
    };
}


/* ============================================================
   STATE GETTERS
   ============================================================ */

export function getAuthState() {
    return {
        initialized:
            authState.initialized,

        loading:
            authState.loading,

        authenticated:
            authState.authenticated,

        user:
            authState.user,

        session:
            authState.session,

        profile:
            authState.profile,

        role:
            authState.role,

        active:
            authState.active,

        pendingApproval:
            authState.pendingApproval
    };
}


/* ============================================================
   BASIC USER GETTERS
   ============================================================ */

export function isLoggedIn() {
    return Boolean(
        authState.authenticated &&
        authState.user
    );
}


export function getUser() {
    return authState.user;
}


export function getSession() {
    return authState.session;
}


export function getProfile() {
    return authState.profile;
}


export function getRole() {
    return normalizeRole(
        authState.role ||
        "customer"
    );
}


export function getUserId() {
    return (
        authState.user?.id ||
        null
    );
}


export function getUserEmail() {
    return (
        authState.user?.email ||
        authState.profile?.email ||
        ""
    );
}


export function getUserName() {
    return (
        authState.profile?.full_name ||
        authState.user?.user_metadata?.full_name ||
        authState.user?.user_metadata?.name ||
        cleanName(
            "",
            authState.user?.email
        )
    );
}


/* ============================================================
   IMPORTANT COMPATIBILITY ALIASES
   ------------------------------------------------------------
   These are the exports that were missing and caused:

   "The requested module './auth.js' does not provide an export
   named 'getCurrentUser'"

   annotation.js also imports getCurrentProfile.
   ============================================================ */

export function getCurrentUser() {
    return (
        authState.user ||
        null
    );
}


export function getCurrentProfile() {
    return (
        authState.profile ||
        null
    );
}


/* ============================================================
   ROLE CHECKS
   ============================================================ */

export function isAdmin() {
    return isAdminRole(
        getRole()
    );
}


export function isStaff() {
    return isStaffRole(
        getRole()
    );
}


export function isReviewer() {
    return isReviewerRole(
        getRole()
    );
}


export function isCoworker() {
    return isCoworkerRole(
        getRole()
    );
}


export function canAnnotate() {
    return canAnnotateRole(
        getRole()
    );
}


export function isActiveUser() {
    return Boolean(
        authState.active
    );
}


export function isPendingApproval() {
    return Boolean(
        isLoggedIn() &&
        !isAdmin() &&
        !authState.active
    );
}


/* ============================================================
   SUPABASE CLIENT
   ============================================================ */

function getClient() {
    const client =
        getSupabase?.() ||
        supabase;

    if (!client) {
        throw new Error(
            "Supabase is not initialized. Check js/config.js and js/supabase.js."
        );
    }

    return client;
}


/* ============================================================
   PROFILE LOADING
   ============================================================ */

export async function loadProfile(
    user = authState.user
) {
    if (!user?.id) {
        authState.profile =
            null;

        authState.role =
            "customer";

        authState.active =
            false;

        authState.pendingApproval =
            false;

        return null;
    }

    let profile = null;

    /*
     * First use the shared Supabase helper.
     */
    try {
        if (
            typeof getProfileByUserId ===
            "function"
        ) {
            profile =
                await getProfileByUserId(
                    user.id
                );
        }
    } catch (error) {
        console.warn(
            "Profile helper failed:",
            error
        );
    }

    /*
     * Direct Supabase fallback.
     */
    if (!profile) {
        try {
            const client =
                getClient();

            const {
                data,
                error
            } = await client
                .from(
                    APP_CONFIG.tables.profiles
                )
                .select("*")
                .eq(
                    "id",
                    user.id
                )
                .maybeSingle();

            if (
                !error &&
                data
            ) {
                profile = data;
            }
        } catch (error) {
            console.warn(
                "Direct profile lookup failed:",
                error
            );
        }
    }

    const normalized =
        normalizeProfile(
            profile,
            user
        );


    /* ----------------------------------------------------------
       PROTECTED ADMIN SYNCHRONIZATION
       ---------------------------------------------------------- */

    if (
        isAdminEmail(
            user.email
        )
    ) {
        normalized.role =
            "admin";

        normalized.active =
            true;

        try {
            const client =
                getClient();

            await client
                .from(
                    APP_CONFIG.tables.profiles
                )
                .upsert(
                    {
                        id:
                            user.id,

                        email:
                            cleanEmail(
                                user.email
                            ),

                        full_name:
                            normalized.full_name,

                        role:
                            "admin",

                        active:
                            true
                    },
                    {
                        onConflict:
                            "id"
                    }
                );
        } catch (error) {
            /*
             * Never prevent the protected administrator from
             * entering because a profile synchronization failed.
             */
            console.warn(
                "Admin profile synchronization failed:",
                error
            );
        }
    }


    /* ----------------------------------------------------------
       SAVE AUTH STATE
       ---------------------------------------------------------- */

    authState.profile =
        normalized;

    authState.role =
        normalizeRole(
            normalized.role
        );

    authState.active =
        Boolean(
            normalized.active
        );

    authState.pendingApproval =
        !isAdmin() &&
        !authState.active;

    return normalized;
}


/* ============================================================
   APPLY SESSION
   ============================================================ */

async function applySession(
    session,
    reason = "session"
) {
    authState.session =
        session || null;

    authState.user =
        session?.user || null;

    authState.authenticated =
        Boolean(
            session?.user
        );


    /*
     * Logged out.
     */
    if (!authState.user) {
        authState.profile =
            null;

        authState.role =
            "customer";

        authState.active =
            false;

        authState.pendingApproval =
            false;

        try {
            clearLocalSession();
        } catch (error) {
            console.warn(
                "Could not clear local session:",
                error
            );
        }

        emitAuthChange(
            reason
        );

        return getAuthState();
    }


    /*
     * Save session locally.
     */
    try {
        saveLocalSession(
            session
        );
    } catch (error) {
        console.warn(
            "Could not save local session:",
            error
        );
    }


    /*
     * Load profile and role.
     */
    await loadProfile(
        authState.user
    );


    /*
     * Cloud status.
     */
    try {
        updateCloudStatus({
            authenticated:
                true,

            userId:
                authState.user.id,

            email:
                authState.user.email ||
                "",

            role:
                authState.role,

            active:
                authState.active
        });
    } catch (error) {
        console.warn(
            "Could not update cloud status:",
            error
        );
    }


    emitAuthChange(
        reason
    );

    return getAuthState();
}


/* ============================================================
   SIGN IN
   ============================================================ */

export async function signIn(
    email,
    password
) {
    const clean =
        cleanEmail(email);

    if (!clean) {
        throw new Error(
            "Please enter your email address."
        );
    }

    if (!password) {
        throw new Error(
            "Please enter your password."
        );
    }

    authState.loading =
        true;

    emitAuthChange(
        "loginStarted"
    );

    try {
        const client =
            getClient();

        const {
            data,
            error
        } =
            await client.auth
                .signInWithPassword({
                    email:
                        clean,

                    password
                });

        if (error) {
            throw error;
        }

        if (
            !data?.session ||
            !data?.user
        ) {
            throw new Error(
                "Login succeeded but no session was returned."
            );
        }

        await applySession(
            data.session,
            "login"
        );


        /*
         * Activity logging must never break login.
         */
        try {
            await logActivity(
                "login",
                {
                    user_id:
                        data.user.id,

                    email:
                        clean,

                    role:
                        authState.role
                }
            );
        } catch (error) {
            console.warn(
                "Login activity log failed:",
                error
            );
        }


        try {
            await logWorkflowEvent(
                "login",
                {
                    user_id:
                        data.user.id,

                    role:
                        authState.role
                }
            );
        } catch (error) {
            console.warn(
                "Login workflow event failed:",
                error
            );
        }


        return {
            success:
                true,

            user:
                authState.user,

            session:
                authState.session,

            profile:
                authState.profile,

            role:
                authState.role,

            active:
                authState.active,

            pendingApproval:
                authState.pendingApproval
        };
    } catch (error) {
        console.error(
            "Sign in failed:",
            error
        );

        throw new Error(
            getErrorMessage(
                error,
                "Unable to sign in. Please check your details."
            )
        );
    } finally {
        authState.loading =
            false;

        emitAuthChange(
            "loginFinished"
        );
    }
}


/* ============================================================
   SIGN UP
   ============================================================ */

export async function signUp(
    fullName,
    email,
    password,
    passwordConfirm = password
) {
    const name =
        cleanName(
            fullName
        );

    const clean =
        cleanEmail(
            email
        );

    if (!name) {
        throw new Error(
            "Please enter your full name."
        );
    }

    if (!clean) {
        throw new Error(
            "Please enter your email address."
        );
    }

    if (!password) {
        throw new Error(
            "Please enter a password."
        );
    }

    if (
        password.length <
        6
    ) {
        throw new Error(
            "Password must be at least 6 characters."
        );
    }

    if (
        password !==
        passwordConfirm
    ) {
        throw new Error(
            "Passwords do not match."
        );
    }

    authState.loading =
        true;

    emitAuthChange(
        "signupStarted"
    );

    try {
        const client =
            getClient();


        /*
         * ALL normal signups start as:
         *
         * customer
         * inactive
         * pending approval
         */
        const metadata = {
            full_name:
                name,

            role:
                "customer",

            active:
                false,

            approval_status:
                "pending"
        };


        const {
            data,
            error
        } =
            await client.auth
                .signUp({
                    email:
                        clean,

                    password,

                    options: {
                        data:
                            metadata
                    }
                });

        if (error) {
            throw error;
        }

        const user =
            data?.user ||
            null;

        const session =
            data?.session ||
            null;


        /*
         * Explicit profile synchronization.
         */
        if (user) {
            try {
                await client
                    .from(
                        APP_CONFIG.tables.profiles
                    )
                    .upsert(
                        {
                            id:
                                user.id,

                            email:
                                clean,

                            full_name:
                                name,

                            role:
                                "customer",

                            active:
                                false
                        },
                        {
                            onConflict:
                                "id"
                        }
                    );
            } catch (profileError) {
                console.warn(
                    "Signup profile creation failed:",
                    profileError
                );
            }
        }


        /*
         * If email confirmation is disabled,
         * Supabase may provide a session immediately.
         */
        if (session) {
            await applySession(
                session,
                "signup"
            );
        }


        return {
            success:
                true,

            user,

            session,

            requiresEmailConfirmation:
                Boolean(
                    user &&
                    !session
                ),

            pendingApproval:
                true,

            role:
                "customer",

            active:
                false,

            message:
                session
                    ? "Account created. Your account is waiting for administrator approval."
                    : "Account created. Please confirm your email, then wait for administrator approval."
        };
    } catch (error) {
        console.error(
            "Signup failed:",
            error
        );

        throw new Error(
            getErrorMessage(
                error,
                "Unable to create your account."
            )
        );
    } finally {
        authState.loading =
            false;

        emitAuthChange(
            "signupFinished"
        );
    }
}


/* ============================================================
   PASSWORD RESET
   ============================================================ */

export async function requestPasswordReset(
    email
) {
    const clean =
        cleanEmail(email);

    if (!clean) {
        throw new Error(
            "Please enter your email address."
        );
    }

    try {
        const client =
            getClient();

        const redirectTo =
            APP_CONFIG?.passwordResetUrl ||
            `${window.location.origin}${window.location.pathname}`;

        const {
            error
        } =
            await client.auth
                .resetPasswordForEmail(
                    clean,
                    {
                        redirectTo
                    }
                );

        if (error) {
            throw error;
        }


        try {
            await logActivity(
                "password_reset_requested",
                {
                    email:
                        clean
                }
            );
        } catch (error) {
            console.warn(
                "Password reset activity log failed:",
                error
            );
        }


        return {
            success:
                true,

            message:
                "If an account exists for that email, password reset instructions have been sent."
        };
    } catch (error) {
        console.error(
            "Password reset request failed:",
            error
        );

        throw new Error(
            getErrorMessage(
                error,
                "Unable to send the password reset email."
            )
        );
    }
}


/* ============================================================
   UPDATE PASSWORD
   ============================================================ */

export async function updatePassword(
    newPassword
) {
    if (!newPassword) {
        throw new Error(
            "Please enter a new password."
        );
    }

    if (
        newPassword.length <
        6
    ) {
        throw new Error(
            "Password must be at least 6 characters."
        );
    }

    try {
        const client =
            getClient();

        const {
            data,
            error
        } =
            await client.auth
                .updateUser({
                    password:
                        newPassword
                });

        if (error) {
            throw error;
        }


        try {
            await logActivity(
                "password_updated",
                {
                    user_id:
                        authState.user?.id ||
                        null
                }
            );
        } catch (error) {
            console.warn(
                "Password update activity log failed:",
                error
            );
        }


        return {
            success:
                true,

            user:
                data?.user ||
                authState.user
        };
    } catch (error) {
        console.error(
            "Password update failed:",
            error
        );

        throw new Error(
            getErrorMessage(
                error,
                "Unable to update your password."
            )
        );
    }
}


/* ============================================================
   UPDATE USER PROFILE
   ============================================================ */

export async function updateUserProfile(
    updates = {}
) {
    if (!authState.user?.id) {
        throw new Error(
            "You must be logged in to update your profile."
        );
    }

    const client =
        getClient();

    const name =
        String(
            updates.full_name ||
            updates.name ||
            ""
        ).trim();


    /*
     * Never permit this function to modify:
     * - role
     * - active
     * - approval
     *
     * Those belong to admin controls.
     */
    const metadata = {
        ...(
            authState.user
                .user_metadata ||
            {}
        )
    };

    if (name) {
        metadata.full_name =
            name;
    }


    /*
     * Update Supabase Auth metadata.
     */
    const {
        data:
            authData,
        error:
            authError
    } =
        await client.auth
            .updateUser({
                data:
                    metadata
            });

    if (authError) {
        throw authError;
    }


    /*
     * Update profiles table.
     */
    if (name) {
        try {
            const {
                error:
                    profileError
            } =
                await client
                    .from(
                        APP_CONFIG.tables.profiles
                    )
                    .update({
                        full_name:
                            name,

                        updated_at:
                            new Date()
                                .toISOString()
                    })
                    .eq(
                        "id",
                        authState.user.id
                    );

            if (profileError) {
                console.warn(
                    "Profile table update failed:",
                    profileError
                );
            }
        } catch (error) {
            console.warn(
                "Profile table update failed:",
                error
            );
        }
    }


    authState.user =
        authData?.user ||
        authState.user;


    await loadProfile(
        authState.user
    );


    emitAuthChange(
        "profileUpdated"
    );


    return authState.profile;
}


/* ============================================================
   AVATAR UPDATE
   ------------------------------------------------------------
   Accepts either:
   1. a complete URL/string
   2. a File object
   ============================================================ */

export async function updateAvatar(
    avatarInput
) {
    if (!authState.user?.id) {
        throw new Error(
            "You must be logged in to update your profile picture."
        );
    }

    const client =
        getClient();

    let avatarUrl = null;


    /* ----------------------------------------------------------
       FILE UPLOAD
       ---------------------------------------------------------- */

    if (
        avatarInput instanceof File ||
        (
            avatarInput &&
            typeof avatarInput ===
                "object" &&
            avatarInput.name &&
            avatarInput.size !== undefined
        )
    ) {
        const file =
            avatarInput;

        if (
            !String(
                file.type || ""
            ).startsWith(
                "image/"
            )
        ) {
            throw new Error(
                "Please choose an image file."
            );
        }

        if (
            Number(file.size || 0) >
            5 * 1024 * 1024
        ) {
            throw new Error(
                "Profile picture must be 5 MB or smaller."
            );
        }

        const bucket =
            APP_CONFIG?.buckets
                ?.avatars ||
            APP_CONFIG?.buckets
                ?.profilePictures ||
            "avatars";


        const extension =
            file.name?.includes(".")
                ? file.name
                    .split(".")
                    .pop()
                    .toLowerCase()
                : "jpg";


        const path =
            `${authState.user.id}/profile-${Date.now()}.${extension}`;


        const {
            error:
                uploadError
        } =
            await client.storage
                .from(bucket)
                .upload(
                    path,
                    file,
                    {
                        upsert:
                            true,

                        contentType:
                            file.type ||
                            "image/jpeg"
                    }
                );


        if (uploadError) {
            throw uploadError;
        }


        /*
         * Try public URL.
         */
        try {
            const {
                data
            } =
                client.storage
                    .from(bucket)
                    .getPublicUrl(
                        path
                    );

            avatarUrl =
                data?.publicUrl ||
                null;
        } catch {
            avatarUrl =
                null;
        }


        /*
         * Private bucket fallback.
         */
        if (!avatarUrl) {
            try {
                const {
                    data
                } =
                    await client
                        .storage
                        .from(bucket)
                        .createSignedUrl(
                            path,
                            60 * 60 * 24 * 365
                        );

                avatarUrl =
                    data?.signedUrl ||
                    null;
            } catch {
                avatarUrl =
                    null;
            }
        }


        if (!avatarUrl) {
            throw new Error(
                "Unable to create profile picture URL."
            );
        }
    }


    /* ----------------------------------------------------------
       EXISTING URL
       ---------------------------------------------------------- */

    else {
        avatarUrl =
            String(
                avatarInput ||
                ""
            ).trim();

        if (!avatarUrl) {
            throw new Error(
                "A valid profile picture URL is required."
            );
        }
    }


    /* ----------------------------------------------------------
       DATABASE
       ---------------------------------------------------------- */

    try {
        await client
            .from(
                APP_CONFIG.tables.profiles
            )
            .update({
                avatar_url:
                    avatarUrl,

                updated_at:
                    new Date()
                        .toISOString()
            })
            .eq(
                "id",
                authState.user.id
            );
    } catch (error) {
        console.warn(
            "Profile avatar database update failed:",
            error
        );
    }


    /* ----------------------------------------------------------
       AUTH METADATA
       ---------------------------------------------------------- */

    try {
        const metadata = {
            ...(
                authState.user
                    .user_metadata ||
                {}
            ),

            avatar_url:
                avatarUrl
        };

        const {
            data,
            error
        } =
            await client.auth
                .updateUser({
                    data:
                        metadata
                });

        if (!error) {
            authState.user =
                data?.user ||
                authState.user;
        }
    } catch (error) {
        console.warn(
            "Auth avatar update failed:",
            error
        );
    }


    await loadProfile(
        authState.user
    );


    emitAuthChange(
        "avatarUpdated"
    );


    return avatarUrl;
}


/* ============================================================
   LOGOUT
   ============================================================ */

export async function signOut() {
    const userId =
        authState.user?.id ||
        null;


    /*
     * Log before clearing authentication state.
     */
    if (userId) {
        try {
            await logActivity(
                "logout",
                {
                    user_id:
                        userId,

                    email:
                        authState.user?.email ||
                        "",

                    role:
                        authState.role
                }
            );
        } catch (error) {
            console.warn(
                "Logout activity log failed:",
                error
            );
        }


        try {
            await logWorkflowEvent(
                "logout",
                {
                    user_id:
                        userId,

                    role:
                        authState.role
                }
            );
        } catch (error) {
            console.warn(
                "Logout workflow event failed:",
                error
            );
        }
    }


    /*
     * Supabase sign out.
     *
     * Failure here must not leave the UI looking logged in.
     */
    try {
        const client =
            getClient();

        const {
            error
        } =
            await client.auth
                .signOut();

        if (error) {
            console.warn(
                "Supabase signout error:",
                error
            );
        }
    } catch (error) {
        console.warn(
            "Supabase signout failed:",
            error
        );
    }


    /* ----------------------------------------------------------
       CLEAR LOCAL AUTH STATE
       ---------------------------------------------------------- */

    authState.session =
        null;

    authState.user =
        null;

    authState.profile =
        null;

    authState.role =
        "customer";

    authState.active =
        false;

    authState.pendingApproval =
        false;

    authState.authenticated =
        false;


    try {
        clearLocalSession();
    } catch (error) {
        console.warn(
            "Could not clear local session:",
            error
        );
    }


    try {
        updateCloudStatus({
            authenticated:
                false,

            userId:
                null,

            email:
                "",

            role:
                "customer",

            active:
                false
        });
    } catch (error) {
        console.warn(
            "Could not clear cloud status:",
            error
        );
    }


    emitAuthChange(
        "logout"
    );


    return {
        success:
            true
    };
}


/* ============================================================
   SESSION STARTUP
   ============================================================ */

export async function loadSessionOnStartup() {
    if (
        authState.loading
    ) {
        return getAuthState();
    }

    authState.loading =
        true;

    emitAuthChange(
        "startupStarted"
    );

    try {
        const client =
            getClient();

        const {
            data,
            error
        } =
            await client.auth
                .getSession();

        if (error) {
            throw error;
        }

        const session =
            data?.session ||
            null;

        await applySession(
            session,
            "startup"
        );

        return getAuthState();
    } catch (error) {
        console.error(
            "Could not load authentication session:",
            error
        );

        authState.session =
            null;

        authState.user =
            null;

        authState.profile =
            null;

        authState.role =
            "customer";

        authState.active =
            false;

        authState.pendingApproval =
            false;

        authState.authenticated =
            false;

        return getAuthState();
    } finally {
        authState.loading =
            false;

        authState.initialized =
            true;

        emitAuthChange(
            "startupFinished"
        );
    }
}


/* ============================================================
   SUPABASE AUTH LISTENER
   ============================================================ */

let authSubscription =
    null;


function setupSupabaseAuthListener() {
    if (authSubscription) {
        return authSubscription;
    }

    try {
        const client =
            getClient();

        const {
            data
        } =
            client.auth
                .onAuthStateChange(
                    (
                        event,
                        session
                    ) => {

                        /*
                         * INITIAL_SESSION is already handled by
                         * loadSessionOnStartup().
                         */
                        if (
                            event ===
                            "INITIAL_SESSION"
                        ) {
                            return;
                        }


                        if (
                            event ===
                                "SIGNED_IN" ||
                            event ===
                                "TOKEN_REFRESHED" ||
                            event ===
                                "USER_UPDATED"
                        ) {

                            /*
                             * Defer profile query so that Supabase
                             * authentication locks are not blocked.
                             */
                            setTimeout(
                                async () => {
                                    try {
                                        await applySession(
                                            session,

                                            event
                                                .toLowerCase()
                                        );
                                    } catch (error) {
                                        console.error(
                                            "Auth state update failed:",
                                            error
                                        );
                                    }
                                },
                                0
                            );

                            return;
                        }


                        if (
                            event ===
                            "SIGNED_OUT"
                        ) {
                            authState.session =
                                null;

                            authState.user =
                                null;

                            authState.profile =
                                null;

                            authState.role =
                                "customer";

                            authState.active =
                                false;

                            authState.pendingApproval =
                                false;

                            authState.authenticated =
                                false;


                            try {
                                clearLocalSession();
                            } catch (error) {
                                console.warn(
                                    "Could not clear local session:",
                                    error
                                );
                            }


                            emitAuthChange(
                                "supabaseSignedOut"
                            );
                        }
                    }
                );


        authSubscription =
            data?.subscription ||
            null;

        return authSubscription;
    } catch (error) {
        console.error(
            "Could not initialize Supabase auth listener:",
            error
        );

        return null;
    }
}


/* ============================================================
   INITIALIZE AUTH
   ============================================================ */

export async function initializeAuth() {
    if (
        authState.initialized
    ) {
        return getAuthState();
    }

    setupSupabaseAuthListener();

    return await loadSessionOnStartup();
}


/* ============================================================
   REFRESH PROFILE / APPROVAL STATUS
   ============================================================ */

export async function refreshProfileStatus() {
    if (!authState.user?.id) {
        return null;
    }

    try {
        await loadProfile(
            authState.user
        );

        emitAuthChange(
            "profileStatusRefreshed"
        );

        return authState.profile;
    } catch (error) {
        console.error(
            "Could not refresh profile status:",
            error
        );

        return authState.profile;
    }
}


/* ============================================================
   ROLE HELPERS
   ============================================================ */

export function hasRole(
    role
) {
    return (
        normalizeRole(
            role
        ) ===
        getRole()
    );
}


export function hasAnyRole(
    roles = []
) {
    if (
        !Array.isArray(
            roles
        )
    ) {
        return false;
    }

    const currentRole =
        getRole();

    return roles.some(
        role =>
            normalizeRole(
                role
            ) ===
            currentRole
    );
}


export function isRoleAtLeastAdmin() {
    return isAdmin();
}


export function isPrivilegedUser() {
    return (
        isAdmin() ||
        isStaff()
    );
}


/* ============================================================
   MANAGEMENT PERMISSIONS
   ============================================================ */

export function canManageUsers() {
    return (
        isAdmin() ||
        isStaff()
    );
}


export function canManageTasks() {
    return (
        isAdmin() ||
        isStaff()
    );
}


export function canManagePayments() {
    return isAdmin();
}


/* ============================================================
   WORKSPACE ACCESS
   ============================================================ */

export function canAccessWorkspace() {
    if (!isLoggedIn()) {
        return false;
    }

    /*
     * Admin/staff bypass approval.
     */
    if (
        isAdmin() ||
        isStaff()
    ) {
        return true;
    }

    /*
     * Normal workers/reviewers/customers need approval.
     */
    return Boolean(
        authState.active
    );
}


/* ============================================================
   ADMIN CENTER ACCESS
   ============================================================ */

export function canAccessAdminCenter() {
    return isAdmin();
}


/* ============================================================
   CUSTOMER MEDIA UPLOAD
   ============================================================ */

export function canUploadCustomerMedia() {
    if (!isLoggedIn()) {
        return false;
    }

    if (
        isAdmin() ||
        isStaff()
    ) {
        return true;
    }

    return (
        getRole() ===
        "customer"
    );
}


/* ============================================================
   MANUAL ANNOTATION ACCESS
   ============================================================ */

export function canUseManualAnnotationTools() {
    if (!isLoggedIn()) {
        return false;
    }

    /*
     * Coworkers must use their assigned workflow.
     * They must not receive the customer manual selector.
     */
    if (isCoworker()) {
        return false;
    }

    return (
        isAdmin() ||
        isStaff() ||
        isReviewer() ||
        getRole() ===
            "customer"
    );
}


/* ============================================================
   SAFE PUBLIC USER
   ============================================================ */

export function getPublicUser() {
    if (!authState.user) {
        return null;
    }

    return {
        id:
            authState.user.id ||
            null,

        email:
            authState.user.email ||
            "",

        full_name:
            getUserName(),

        role:
            getRole(),

        active:
            Boolean(
                authState.active
            ),

        pendingApproval:
            Boolean(
                authState.pendingApproval
            )
    };
}


/* ============================================================
   DEFAULT EXPORT
   ============================================================ */

const authAPI = {
    isLoggedIn,

    getAuthState,

    getUser,

    getCurrentUser,

    getSession,

    getProfile,

    getCurrentProfile,

    getRole,

    getUserId,

    getUserEmail,

    getUserName,

    getPublicUser,

    isAdmin,

    isStaff,

    isReviewer,

    isCoworker,

    canAnnotate,

    isActiveUser,

    isPendingApproval,

    signIn,

    signUp,

    signOut,

    requestPasswordReset,

    updatePassword,

    updateUserProfile,

    updateAvatar,

    loadProfile,

    refreshProfileStatus,

    loadSessionOnStartup,

    initializeAuth,

    hasRole,

    hasAnyRole,

    isRoleAtLeastAdmin,

    isPrivilegedUser,

    canAccessWorkspace,

    canAccessAdminCenter,

    canUploadCustomerMedia,

    canUseManualAnnotationTools,

    canManageUsers,

    canManageTasks,

    canManagePayments,

    onAuthStateChange
};


export default authAPI;


/* ============================================================
   WINDOW COMPATIBILITY
   ============================================================ */

window.auth = authAPI;

window.authState =
    authState;

window.getCurrentUser =
    getCurrentUser;

window.getCurrentProfile =
    getCurrentProfile;

window.getUser =
    getUser;

window.getProfile =
    getProfile;

window.getRole =
    getRole;

window.isLoggedIn =
    isLoggedIn;

window.isAdmin =
    isAdmin;

window.isStaff =
    isStaff;

window.isReviewer =
    isReviewer;

window.isCoworker =
    isCoworker;

window.canAnnotate =
    canAnnotate;

window.isPendingApproval =
    isPendingApproval;


/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (
    typeof document !==
    "undefined"
) {
    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                initializeAuth()
                    .catch(
                        error => {
                            console.error(
                                "Auth initialization failed:",
                                error
                            );
                        }
                    );
            },
            {
                once:
                    true
            }
        );
    } else {
        initializeAuth()
            .catch(
                error => {
                    console.error(
                        "Auth initialization failed:",
                        error
                    );
                }
            );
    }
}


/* ============================================================
   MODULE LOADED
   ============================================================ */

console.log(
    "Auth module loaded."
);
