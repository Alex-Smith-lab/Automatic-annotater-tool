/* ============================================================
   AUTH.JS
   ------------------------------------------------------------
   Authentication, session management, profiles, roles,
   approval status and authorization helpers.

   IMPORTANT:
   - Normal signup = customer + inactive/pending
   - Default administrator is always protected
   - Admin email is not displayed to normal users
   - Supabase is the authentication source
   - profiles.last_seen_at is NOT used
   - Login uses profiles.last_login_at
   - Logout uses profiles.last_logout_at
   - workflow_events is only for task workflow events
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
    saveLocalSession,
    clearLocalSession,
    updateCloudStatus,
    logActivity,
    getProfileByUserId
} from "./supabase.js";


// ============================================================
// AUTH STATE
// ============================================================

const authState = {

    initialized:
        false,

    loading:
        false,

    authenticated:
        false,

    user:
        null,

    session:
        null,

    profile:
        null,

    role:
        "customer",

    active:
        false,

    pendingApproval:
        false,

    listeners:
        new Set()
};


if (
    typeof window !==
    "undefined"
) {

    window.authState =
        authState;
}


// ============================================================
// CONSTANTS
// ============================================================

const ADMIN_EMAIL =
    String(
        APP_CONFIG?.adminEmail ||
        "antonymbali96@gmail.com"
    )
        .trim()
        .toLowerCase();


// ============================================================
// BASIC HELPERS
// ============================================================

function cleanEmail(
    email
) {

    return String(
        email || ""
    )
        .trim()
        .toLowerCase();
}


function cleanName(
    name,
    email = ""
) {

    const value =
        String(
            name || ""
        )
        .trim();


    if (value) {

        return value;
    }


    const fallback =
        cleanEmail(
            email
        )
            .split("@")[0];


    if (fallback) {

        return fallback
            .replace(
                /[._-]+/g,
                " "
            )
            .replace(
                /\b\w/g,
                letter =>
                    letter.toUpperCase()
            );
    }


    return "User";
}


function getErrorMessage(
    error,
    fallback = "Something went wrong."
) {

    const message =
        String(
            error?.message ||
            error?.error_description ||
            error?.details ||
            error?.hint ||
            ""
        ).trim();


    const lower =
        message.toLowerCase();


    if (
        lower.includes(
            "invalid login credentials"
        )
    ) {

        return (
            "Incorrect email or password."
        );
    }


    if (
        lower.includes(
            "email not confirmed"
        )
    ) {

        return (
            "Please confirm your email address before signing in."
        );
    }


    if (
        lower.includes(
            "user not found"
        )
    ) {

        return (
            "No account was found with that email address."
        );
    }


    if (
        lower.includes(
            "too many requests"
        ) ||
        lower.includes(
            "rate limit"
        )
    ) {

        return (
            "Too many attempts. Please wait a moment and try again."
        );
    }


    if (
        lower.includes(
            "network"
        ) ||
        lower.includes(
            "fetch"
        )
    ) {

        return (
            "Network connection failed. Please check your internet connection and try again."
        );
    }


    if (message) {

        return message;
    }


    return fallback;
}


function isAdminEmail(
    email
) {

    return (
        cleanEmail(email) ===
        ADMIN_EMAIL
    );
}


function isRealAuthenticatedUser(
    user
) {

    return Boolean(
        user &&
        user.id &&
        user.email
    );
}


// ============================================================
// PROFILE NORMALIZATION
// ============================================================

function normalizeProfile(
    profile,
    user = authState.user
) {

    const email =
        cleanEmail(
            profile?.email ||
            user?.email ||
            ""
        );


    let role =
        normalizeRole(
            profile?.role ||
            user?.user_metadata?.role ||
            "customer"
        );


    /*
     * Protected administrator.
     */

    if (
        isAdminEmail(email)
    ) {

        role =
            "admin";
    }


    let active =
        profile?.active;


    /*
     * Compatibility with older databases.
     */

    if (
        active === undefined ||
        active === null
    ) {

        if (
            profile?.status !== undefined &&
            profile?.status !== null
        ) {

            const status =
                String(
                    profile.status
                )
                    .toLowerCase();


            active =
                [
                    "active",
                    "approved",
                    "enabled",
                    "true"
                ]
                .includes(
                    status
                );

        } else {

            active =
                false;
        }
    }


    /*
     * Protected administrator is always active.
     */

    if (
        isAdminEmail(email)
    ) {

        active =
            true;
    }


    return {

        ...(profile || {}),

        id:
            profile?.id ||
            user?.id ||
            null,

        email,

        full_name:
            cleanName(
                profile?.full_name ||
                profile?.name ||
                user?.user_metadata?.full_name ||
                user?.user_metadata?.name,
                email
            ),

        role,

        active:
            Boolean(
                active
            )
    };
}


// ============================================================
// AUTH EVENT EMITTER
// ============================================================

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

        if (
            typeof window !==
            "undefined"
        ) {

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
        }

    } catch (error) {

        console.warn(
            "Could not dispatch authStateChanged:",
            error
        );
    }


    if (
        reason === "login" ||
        reason === "signed_in"
    ) {

        try {

            if (
                typeof window !==
                "undefined"
            ) {

                window.dispatchEvent(
                    new CustomEvent(
                        "auth:login",
                        {
                            detail:
                                snapshot
                        }
                    )
                );
            }

        } catch {}
    }


    if (
        reason === "logout" ||
        reason === "supabaseSignedOut"
    ) {

        try {

            if (
                typeof window !==
                "undefined"
            ) {

                window.dispatchEvent(
                    new CustomEvent(
                        "auth:logout",
                        {
                            detail:
                                snapshot
                        }
                    )
                );
            }

        } catch {}
    }


    return snapshot;
}


// ============================================================
// AUTH LISTENER
// ============================================================

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


// ============================================================
// STATE GETTERS
// ============================================================

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


// ============================================================
// BASIC USER GETTERS
// ============================================================

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


// ============================================================
// COMPATIBILITY ALIASES
// ============================================================

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


// ============================================================
// ROLE CHECKS
// ============================================================

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


// ============================================================
// SUPABASE CLIENT
// ============================================================

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


// ============================================================
// PROFILE LOADING
// ============================================================

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


    let profile =
        null;


    /*
     * Shared helper first.
     */

    try {

        profile =
            await getProfileByUserId(
                user.id
            );

    } catch (error) {

        console.warn(
            "Profile helper failed:",
            error
        );
    }


    /*
     * Direct fallback.
     */

    if (!profile) {

        try {

            const client =
                getClient();


            const {
                data,
                error
            } =
                await client
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

                profile =
                    data;
            }

        } catch (error) {

            console.warn(
                "Direct profile lookup failed:",
                error
            );
        }
    }


    /*
     * Normalize even if profile row does not exist.
     */

    const normalized =
        normalizeProfile(
            profile,
            user
        );


    /*
     * Protected administrator.
     *
     * Do not automatically upsert the admin profile
     * during every login. This prevents repeated 403
     * profile POST/UPDATE requests.
     */

    if (
        isAdminEmail(
            user.email
        )
    ) {

        normalized.role =
            "admin";

        normalized.active =
            true;
    }


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


// ============================================================
// APPLY SESSION
// ============================================================

async function applySession(
    session,
    reason = "session"
) {

    authState.session =
        session ||
        null;


    authState.user =
        session?.user ||
        null;


    authState.authenticated =
        Boolean(
            session?.user
        );


    /*
     * Logged out.
     */

    if (
        !authState.user
    ) {

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
     * Save session.
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
     * Load profile.
     */

    try {

        await loadProfile(
            authState.user
        );

    } catch (profileError) {

        /*
         * A profile database failure must NOT make
         * authentication itself fail.
         */

        console.warn(
            "Profile loading failed during session apply:",
            profileError
        );


        authState.profile =
            normalizeProfile(
                null,
                authState.user
            );


        authState.role =
            normalizeRole(
                authState.profile.role
            );


        authState.active =
            Boolean(
                authState.profile.active
            );


        authState.pendingApproval =
            !isAdmin() &&
            !authState.active;
    }


    /*
     * Record login timestamp.
     *
     * This uses profiles.last_login_at.
     * It does NOT use last_seen_at.
     */

    try {

        await updateCloudStatus(
            "login",
            {

                userId:
                    authState.user.id,

                full_name:
                    authState.profile?.full_name ||
                    getUserName()
            }
        );

    } catch (error) {

        /*
         * Timestamp failure must never block login.
         */

        console.warn(
            "Could not update cloud login status:",
            error
        );
    }


    emitAuthChange(
        reason
    );


    return getAuthState();
}


// ============================================================
// SIGN IN
// ============================================================

export async function signIn(
    email,
    password
) {

    const clean =
        cleanEmail(
            email
        );


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
            await client
                .auth
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


        /*
         * Authentication is successful here.
         * Profile problems are handled inside applySession.
         */

        await applySession(
            data.session,
            "login"
        );


        /*
         * Login activity is optional.
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


        /*
         * IMPORTANT:
         * Do NOT call logWorkflowEvent() here.
         *
         * workflow_events.task_id is NOT NULL.
         */

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
                "Unable to sign in. Please check your email and password."
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


// ============================================================
// SIGN UP
// ============================================================

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


    if (
        isAdminEmail(
            clean
        )
    ) {

        throw new Error(
            "This email address is reserved for the administrator."
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
         * Normal signup:
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
            await client
                .auth
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
         * Try to create the profile row.
         *
         * A database permission error does not invalidate
         * the Supabase authentication account.
         */

        let profileError =
            null;


        if (user) {

            try {

                const {
                    error:
                        insertError
                } =
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


                profileError =
                    insertError ||
                    null;


                if (
                    profileError
                ) {

                    console.warn(
                        "Signup profile creation failed:",
                        profileError
                    );
                }

            } catch (error) {

                profileError =
                    error;


                console.warn(
                    "Signup profile creation exception:",
                    error
                );
            }
        }


        /*
         * If email confirmation is disabled,
         * Supabase may return a session immediately.
         */

        if (session) {

            await applySession(
                session,
                "signup"
            );
        }


        let message;


        if (session) {

            if (
                profileError
            ) {

                message =
                    "Account created, but the profile could not be synchronized. Please wait for administrator approval.";

            } else {

                message =
                    "Account created. Your account is waiting for administrator approval.";
            }

        } else {

            if (
                profileError
            ) {

                message =
                    "Account created. Please confirm your email and wait for administrator approval.";

            } else {

                message =
                    "Account created. Please confirm your email, then wait for administrator approval.";
            }
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

            profileSyncError:
                profileError ||
                null,

            pendingApproval:
                true,

            role:
                "customer",

            active:
                false,

            message
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


// ============================================================
// PASSWORD RESET
// ============================================================

export async function requestPasswordReset(
    email
) {

    const clean =
        cleanEmail(
            email
        );


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
            (
                typeof window !==
                "undefined"
                    ? `${window.location.origin}${window.location.pathname}`
                    : undefined
            );


        const {
            error
        } =
            await client
                .auth
                .resetPasswordForEmail(
                    clean,
                    redirectTo
                        ? {
                            redirectTo
                        }
                        : undefined
                );


        if (error) {

            throw error;
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


// ============================================================
// UPDATE PASSWORD
// ============================================================

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
            await client
                .auth
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


// ============================================================
// UPDATE USER PROFILE
// ============================================================

export async function updateUserProfile(
    updates = {}
) {

    if (
        !authState.user?.id
    ) {

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
        )
        .trim();


    /*
     * Users cannot change their own:
     *
     * role
     * active
     * approval
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
        await client
            .auth
            .updateUser({

                data:
                    metadata
            });


    if (authError) {

        throw authError;
    }


    /*
     * Update profile table.
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


            if (
                profileError
            ) {

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


// ============================================================
// AVATAR UPDATE
// ============================================================

export async function updateAvatar(
    avatarInput
) {

    if (
        !authState.user?.id
    ) {

        throw new Error(
            "You must be logged in to update your profile picture."
        );
    }


    const client =
        getClient();


    let avatarUrl =
        null;


    /*
     * FILE UPLOAD
     */

    const isFile =
        (
            typeof File !==
            "undefined" &&
            avatarInput instanceof File
        ) ||
        (
            avatarInput &&
            typeof avatarInput ===
                "object" &&
            avatarInput.name &&
            avatarInput.size !==
                undefined
        );


    if (isFile) {

        const file =
            avatarInput;


        if (
            !String(
                file.type ||
                ""
            )
            .startsWith(
                "image/"
            )
        ) {

            throw new Error(
                "Please choose an image file."
            );
        }


        if (
            Number(
                file.size ||
                0
            ) >
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
            await client
                .storage
                .from(
                    bucket
                )
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


        if (
            uploadError
        ) {

            throw uploadError;
        }


        /*
         * Public URL.
         */

        try {

            const {
                data
            } =
                client
                    .storage
                    .from(
                        bucket
                    )
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
                        .from(
                            bucket
                        )
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

    } else {

        avatarUrl =
            String(
                avatarInput ||
                ""
            )
            .trim();


        if (!avatarUrl) {

            throw new Error(
                "A valid profile picture URL is required."
            );
        }
    }


    /*
     * Update profile table.
     */

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


        if (
            profileError
        ) {

            throw profileError;
        }

    } catch (error) {

        console.warn(
            "Profile avatar database update failed:",
            error
        );


        throw error;
    }


    /*
     * Update Supabase Auth metadata.
     */

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
            await client
                .auth
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


// ============================================================
// LOGOUT
// ============================================================

export async function signOut() {

    const userId =
        authState.user?.id ||
        null;


    const userEmail =
        authState.user?.email ||
        "";


    const userRole =
        authState.role;


    /*
     * Record logout BEFORE clearing auth state.
     */

    if (userId) {

        try {

            await updateCloudStatus(
                "logout",
                {

                    userId:
                        userId
                }
            );

        } catch (error) {

            console.warn(
                "Logout cloud status update failed:",
                error
            );
        }
    }


    /*
     * Activity log.
     */

    if (userId) {

        try {

            await logActivity(
                "logout",
                {

                    user_id:
                        userId,

                    email:
                        userEmail,

                    role:
                        userRole
                }
            );

        } catch (error) {

            console.warn(
                "Logout activity log failed:",
                error
            );
        }
    }


    /*
     * Do NOT use logWorkflowEvent() for logout.
     *
     * workflow_events.task_id is required.
     */


    /*
     * Supabase logout.
     */

    try {

        const client =
            getClient();


        const {
            error
        } =
            await client
                .auth
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


    /*
     * Clear local auth state.
     */

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
        "logout"
    );


    return {

        success:
            true
    };
}


// ============================================================
// SESSION STARTUP
// ============================================================

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
            await client
                .auth
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


// ============================================================
// SUPABASE AUTH LISTENER
// ============================================================

let authSubscription =
    null;


let authInitializationPromise =
    null;


function setupSupabaseAuthListener() {

    if (
        authSubscription
    ) {

        return authSubscription;
    }


    try {

        const client =
            getClient();


        const {
            data
        } =
            client
                .auth
                .onAuthStateChange(
                    (
                        event,
                        session
                    ) => {

                        /*
                         * INITIAL_SESSION is handled by
                         * loadSessionOnStartup().
                         */

                        if (
                            event ===
                            "INITIAL_SESSION"
                        ) {

                            return;
                        }


                        /*
                         * Signed in / refreshed / updated.
                         */

                        if (
                            event ===
                                "SIGNED_IN" ||
                            event ===
                                "TOKEN_REFRESHED" ||
                            event ===
                                "USER_UPDATED"
                        ) {

                            /*
                             * Defer the profile query so that
                             * Supabase auth locks are not blocked.
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


                        /*
                         * Signed out.
                         */

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


// ============================================================
// INITIALIZE AUTH
// ============================================================

export async function initializeAuth() {

    if (
        authState.initialized
    ) {

        return getAuthState();
    }


    /*
     * Prevent app.js and the automatic initializer from
     * starting two simultaneous initialization processes.
     */

    if (
        authInitializationPromise
    ) {

        return await authInitializationPromise;
    }


    authInitializationPromise =
        (async () => {

            setupSupabaseAuthListener();


            return await loadSessionOnStartup();

        })();


    try {

        return await authInitializationPromise;

    } finally {

        authInitializationPromise =
            null;
    }
}


// ============================================================
// REFRESH PROFILE / APPROVAL STATUS
// ============================================================

export async function refreshProfileStatus() {

    if (
        !authState.user?.id
    ) {

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


// ============================================================
// ROLE HELPERS
// ============================================================

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


// ============================================================
// MANAGEMENT PERMISSIONS
// ============================================================

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


// ============================================================
// WORKSPACE ACCESS
// ============================================================

export function canAccessWorkspace() {

    if (
        !isLoggedIn()
    ) {

        return false;
    }


    /*
     * Admin and staff bypass approval.
     */

    if (
        isAdmin() ||
        isStaff()
    ) {

        return true;
    }


    /*
     * Normal workers/reviewers/customers require
     * administrator approval.
     */

    return Boolean(
        authState.active
    );
}


// ============================================================
// ADMIN CENTER ACCESS
// ============================================================

export function canAccessAdminCenter() {

    return isAdmin();
}


// ============================================================
// CUSTOMER MEDIA UPLOAD
// ============================================================

export function canUploadCustomerMedia() {

    if (
        !isLoggedIn()
    ) {

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


// ============================================================
// MANUAL ANNOTATION ACCESS
// ============================================================

export function canUseManualAnnotationTools() {

    if (
        !isLoggedIn()
    ) {

        return false;
    }


    /*
     * Coworkers must use their assigned workflow.
     */

    if (
        isCoworker()
    ) {

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


// ============================================================
// SAFE PUBLIC USER
// ============================================================

export function getPublicUser() {

    if (
        !authState.user
    ) {

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


// ============================================================
// DEFAULT EXPORT
// ============================================================

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


// ============================================================
// WINDOW COMPATIBILITY
// ============================================================

if (
    typeof window !==
    "undefined"
) {

    window.auth =
        authAPI;

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
}


// ============================================================
// AUTO INITIALIZATION
// ============================================================

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


// ============================================================
// MODULE LOADED
// ============================================================

console.log(
    "Auth module loaded."
);
