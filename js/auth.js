/* ============================================================
   AUTH.JS
   Authentication, session, roles and profile management
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
    getCurrentUser,
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

const ADMIN_EMAIL = String(
    APP_CONFIG.adminEmail || "antonymbali96@gmail.com"
).trim().toLowerCase();

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function cleanEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function cleanName(name, email = "") {
    const value = String(name || "").trim();

    if (value) {
        return value;
    }

    const fallback = cleanEmail(email).split("@")[0];

    return fallback || "User";
}

function getErrorMessage(error, fallback = "Something went wrong.") {
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
    return cleanEmail(email) === ADMIN_EMAIL;
}

function isRealAuthenticatedUser(user) {
    return !!(
        user &&
        user.id &&
        user.email
    );
}

function normalizeProfile(profile, user = authState.user) {
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
     * The configured administrator is always treated as admin.
     * This protects the admin account from accidentally losing
     * its role because of an old profile record.
     */
    if (isAdminEmail(email)) {
        role = "admin";
    }

    let active = profile?.active;

    /*
     * If active is missing/null, fall back to status where the
     * older database structure may still be in use.
     */
    if (active === undefined || active === null) {
        if (profile?.status !== undefined && profile?.status !== null) {
            const status = String(profile.status).toLowerCase();

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
     * The default administrator is always active.
     */
    if (isAdminEmail(email)) {
        active = true;
    }

    return {
        ...(profile || {}),
        id: profile?.id || user?.id || null,
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
   EVENT SYSTEM
   ============================================================ */

function emitAuthChange(reason = "changed") {
    const snapshot = getAuthState();

    authState.listeners.forEach(listener => {
        try {
            listener(snapshot, reason);
        } catch (error) {
            console.error("Auth listener error:", error);
        }
    });

    try {
        window.dispatchEvent(
            new CustomEvent("authStateChanged", {
                detail: {
                    ...snapshot,
                    reason
                }
            })
        );
    } catch (error) {
        console.warn("Could not dispatch authStateChanged:", error);
    }

    return snapshot;
}

export function onAuthStateChange(listener) {
    if (typeof listener !== "function") {
        return () => {};
    }

    authState.listeners.add(listener);

    return () => {
        authState.listeners.delete(listener);
    };
}

/* ============================================================
   STATE GETTERS
   ============================================================ */

export function getAuthState() {
    return {
        initialized: authState.initialized,
        loading: authState.loading,
        authenticated: authState.authenticated,
        user: authState.user,
        session: authState.session,
        profile: authState.profile,
        role: authState.role,
        active: authState.active,
        pendingApproval: authState.pendingApproval
    };
}

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
    return normalizeRole(authState.role || "customer");
}

export function isAdmin() {
    return isAdminRole(getRole());
}

export function isStaff() {
    return isStaffRole(getRole());
}

export function isReviewer() {
    return isReviewerRole(getRole());
}

export function isCoworker() {
    return isCoworkerRole(getRole());
}

export function canAnnotate() {
    return canAnnotateRole(getRole());
}

export function isActiveUser() {
    return Boolean(authState.active);
}

export function isPendingApproval() {
    return Boolean(
        isLoggedIn() &&
        !isAdmin() &&
        !authState.active
    );
}

export function getUserId() {
    return authState.user?.id || null;
}

export function getUserEmail() {
    return authState.user?.email || "";
}

export function getUserName() {
    return (
        authState.profile?.full_name ||
        authState.user?.user_metadata?.full_name ||
        authState.user?.user_metadata?.name ||
        cleanName("", authState.user?.email)
    );
}

/* ============================================================
   SUPABASE CLIENT
   ============================================================ */

function getClient() {
    const client = getSupabase?.() || supabase;

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

export async function loadProfile(user = authState.user) {
    if (!user?.id) {
        authState.profile = null;
        authState.role = "customer";
        authState.active = false;
        authState.pendingApproval = false;

        return null;
    }

    let profile = null;

    try {
        if (typeof getProfileByUserId === "function") {
            profile = await getProfileByUserId(user.id);
        }
    } catch (error) {
        console.warn("Profile helper failed:", error);
    }

    /*
     * Direct fallback query.
     * This is useful if the helper was changed or the profile
     * did not exist yet.
     */
    if (!profile) {
        try {
            const client = getClient();

            const { data, error } = await client
                .from(APP_CONFIG.tables.profiles)
                .select("*")
                .eq("id", user.id)
                .maybeSingle();

            if (!error && data) {
                profile = data;
            }
        } catch (error) {
            console.warn("Direct profile lookup failed:", error);
        }
    }

    /*
     * Create a local profile representation even if the database
     * record is temporarily unavailable.
     */
    const normalized = normalizeProfile(profile, user);

    /*
     * If the configured administrator does not have a profile,
     * attempt to create/update one.
     */
    if (isAdminEmail(user.email)) {
        normalized.role = "admin";
        normalized.active = true;

        try {
            const client = getClient();

            await client
                .from(APP_CONFIG.tables.profiles)
                .upsert(
                    {
                        id: user.id,
                        email: cleanEmail(user.email),
                        full_name: normalized.full_name,
                        role: "admin",
                        active: true
                    },
                    {
                        onConflict: "id"
                    }
                );
        } catch (error) {
            /*
             * Do not prevent the administrator from entering if
             * the profile upsert fails.
             */
            console.warn(
                "Admin profile synchronization failed:",
                error
            );
        }
    }

    authState.profile = normalized;
    authState.role = normalizeRole(normalized.role);
    authState.active = Boolean(normalized.active);
    authState.pendingApproval =
        !isAdmin() &&
        !authState.active;

    return normalized;
}

/* ============================================================
   INTERNAL AUTH STATE APPLICATION
   ============================================================ */

async function applySession(session, reason = "session") {
    authState.session = session || null;
    authState.user = session?.user || null;
    authState.authenticated = Boolean(
        session?.user
    );

    if (!authState.user) {
        authState.profile = null;
        authState.role = "customer";
        authState.active = false;
        authState.pendingApproval = false;

        try {
            clearLocalSession();
        } catch (error) {
            console.warn("Could not clear local session:", error);
        }

        emitAuthChange(reason);

        return getAuthState();
    }

    try {
        saveLocalSession(session);
    } catch (error) {
        console.warn("Could not save local session:", error);
    }

    await loadProfile(authState.user);

    try {
        updateCloudStatus({
            authenticated: true,
            userId: authState.user.id,
            email: authState.user.email || "",
            role: authState.role,
            active: authState.active
        });
    } catch (error) {
        console.warn("Could not update cloud status:", error);
    }

    emitAuthChange(reason);

    return getAuthState();
}

/* ============================================================
   LOGIN
   ============================================================ */

export async function signIn(email, password) {
    const clean = cleanEmail(email);

    if (!clean) {
        throw new Error("Please enter your email address.");
    }

    if (!password) {
        throw new Error("Please enter your password.");
    }

    authState.loading = true;
    emitAuthChange("loginStarted");

    try {
        const client = getClient();

        const {
            data,
            error
        } = await client.auth.signInWithPassword({
            email: clean,
            password
        });

        if (error) {
            throw error;
        }

        if (!data?.session || !data?.user) {
            throw new Error(
                "Login succeeded but no session was returned."
            );
        }

        await applySession(
            data.session,
            "login"
        );

        /*
         * Log login activity without allowing logging failure
         * to break authentication.
         */
        try {
            await logActivity(
                "login",
                {
                    user_id: data.user.id,
                    email: clean,
                    role: authState.role
                }
            );
        } catch (error) {
            console.warn("Login activity log failed:", error);
        }

        try {
            await logWorkflowEvent(
                "login",
                {
                    user_id: data.user.id,
                    role: authState.role
                }
            );
        } catch (error) {
            console.warn(
                "Login workflow event failed:",
                error
            );
        }

        /*
         * Do not block an authenticated user merely because their
         * profile is pending. The UI will show the approval page.
         */
        return {
            success: true,
            user: authState.user,
            session: authState.session,
            profile: authState.profile,
            role: authState.role,
            active: authState.active,
            pendingApproval: authState.pendingApproval
        };
    } catch (error) {
        console.error("Sign in failed:", error);

        throw new Error(
            getErrorMessage(
                error,
                "Unable to sign in. Please check your details."
            )
        );
    } finally {
        authState.loading = false;
        emitAuthChange("loginFinished");
    }
}

/* ============================================================
   SIGNUP
   ============================================================ */

export async function signUp(
    fullName,
    email,
    password,
    passwordConfirm = password
) {
    const name = cleanName(fullName);
    const clean = cleanEmail(email);

    if (!name) {
        throw new Error("Please enter your full name.");
    }

    if (!clean) {
        throw new Error("Please enter your email address.");
    }

    if (!password) {
        throw new Error("Please enter a password.");
    }

    if (password.length < 6) {
        throw new Error(
            "Password must be at least 6 characters."
        );
    }

    if (password !== passwordConfirm) {
        throw new Error(
            "Passwords do not match."
        );
    }

    authState.loading = true;
    emitAuthChange("signupStarted");

    try {
        const client = getClient();

        /*
         * Every normal signup starts as a CUSTOMER and inactive.
         *
         * Admin/staff/reviewer/coworker roles must be granted by
         * an administrator.
         */
        const metadata = {
            full_name: name,
            role: "customer",
            active: false,
            approval_status: "pending"
        };

        const {
            data,
            error
        } = await client.auth.signUp({
            email: clean,
            password,
            options: {
                data: metadata
            }
        });

        if (error) {
            throw error;
        }

        const user = data?.user || null;
        const session = data?.session || null;

        /*
         * Supabase can be configured to require email confirmation.
         * In that case there may be a user but no session.
         */
        if (user) {
            try {
                await client
                    .from(APP_CONFIG.tables.profiles)
                    .upsert(
                        {
                            id: user.id,
                            email: clean,
                            full_name: name,
                            role: "customer",
                            active: false
                        },
                        {
                            onConflict: "id"
                        }
                    );
            } catch (profileError) {
                console.warn(
                    "Signup profile creation failed:",
                    profileError
                );
            }
        }

        if (session) {
            await applySession(
                session,
                "signup"
            );
        }

        /*
         * If email confirmation is enabled, return a pending
         * confirmation result rather than pretending the user is
         * logged in.
         */
        return {
            success: true,
            user,
            session,
            requiresEmailConfirmation: Boolean(
                user && !session
            ),
            pendingApproval: true,
            role: "customer",
            active: false,
            message: session
                ? "Account created. Your account is waiting for administrator approval."
                : "Account created. Please confirm your email, then wait for administrator approval."
        };
    } catch (error) {
        console.error("Signup failed:", error);

        throw new Error(
            getErrorMessage(
                error,
                "Unable to create your account."
            )
        );
    } finally {
        authState.loading = false;
        emitAuthChange("signupFinished");
    }
}

/* ============================================================
   PASSWORD RESET
   ============================================================ */

export async function requestPasswordReset(email) {
    const clean = cleanEmail(email);

    if (!clean) {
        throw new Error(
            "Please enter your email address."
        );
    }

    try {
        const client = getClient();

        /*
         * APP_CONFIG.passwordResetUrl is optional.
         * If unavailable, use the current page URL.
         */
        let redirectTo =
            APP_CONFIG.passwordResetUrl ||
            `${window.location.origin}${window.location.pathname}`;

        const {
            error
        } = await client.auth.resetPasswordForEmail(
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
                    email: clean
                }
            );
        } catch (error) {
            console.warn(
                "Password reset activity log failed:",
                error
            );
        }

        return {
            success: true,
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

export async function updatePassword(newPassword) {
    if (!newPassword) {
        throw new Error(
            "Please enter a new password."
        );
    }

    if (newPassword.length < 6) {
        throw new Error(
            "Password must be at least 6 characters."
        );
    }

    try {
        const client = getClient();

        const {
            data,
            error
        } = await client.auth.updateUser({
            password: newPassword
        });

        if (error) {
            throw error;
        }

        try {
            await logActivity(
                "password_updated",
                {
                    user_id: authState.user?.id || null
                }
            );
        } catch (error) {
            console.warn(
                "Password update activity log failed:",
                error
            );
        }

        return {
            success: true,
            user: data?.user || authState.user
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
   PROFILE UPDATE
   ============================================================ */

export async function updateUserProfile(updates = {}) {
    if (!authState.user?.id) {
        throw new Error(
            "You must be logged in to update your profile."
        );
    }

    const client = getClient();

    const name = String(
        updates.full_name ||
        updates.name ||
        ""
    ).trim();

    const metadata = {
        ...(authState.user.user_metadata || {})
    };

    if (name) {
        metadata.full_name = name;
    }

    /*
     * Never allow normal profile editing to change role or active
     * status. Those fields belong to administrator controls.
     */
    const {
        data: authData,
        error: authError
    } = await client.auth.updateUser({
        data: metadata
    });

    if (authError) {
        throw authError;
    }

    /*
     * Keep the profile table synchronized where possible.
     */
    if (name) {
        try {
            const {
                error: profileError
            } = await client
                .from(APP_CONFIG.tables.profiles)
                .update({
                    full_name: name
                })
                .eq("id", authState.user.id);

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

    await loadProfile(authState.user);

    emitAuthChange("profileUpdated");

    return authState.profile;
}

/* ============================================================
   AVATAR UPDATE
   ============================================================ */

export async function updateAvatar(avatarUrl) {
    if (!authState.user?.id) {
        throw new Error(
            "You must be logged in to update your profile picture."
        );
    }

    const url = String(avatarUrl || "").trim();

    if (!url) {
        throw new Error(
            "A valid profile picture URL is required."
        );
    }

    const client = getClient();

    const metadata = {
        ...(authState.user.user_metadata || {}),
        avatar_url: url
    };

    const {
        data,
        error
    } = await client.auth.updateUser({
        data: metadata
    });

    if (error) {
        throw error;
    }

    try {
        await client
            .from(APP_CONFIG.tables.profiles)
            .update({
                avatar_url: url
            })
            .eq("id", authState.user.id);
    } catch (error) {
        console.warn(
            "Profile avatar database update failed:",
            error
        );
    }

    authState.user =
        data?.user ||
        authState.user;

    await loadProfile(authState.user);

    emitAuthChange("avatarUpdated");

    return url;
}

/* ============================================================
   LOGOUT
   ============================================================ */

export async function signOut() {
    const userId = authState.user?.id || null;

    /*
     * Log the logout before destroying the local state.
     */
    if (userId) {
        try {
            await logActivity(
                "logout",
                {
                    user_id: userId,
                    email: authState.user?.email || "",
                    role: authState.role
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
                    user_id: userId,
                    role: authState.role
                }
            );
        } catch (error) {
            console.warn(
                "Logout workflow event failed:",
                error
            );
        }
    }

    try {
        const client = getClient();

        const {
            error
        } = await client.auth.signOut();

        if (error) {
            throw error;
        }
    } catch (error) {
        /*
         * Even if Supabase logout fails, clear the local state so
         * the application does not leave the user looking logged in.
         */
        console.warn(
            "Supabase signout returned an error:",
            error
        );
    }

    authState.session = null;
    authState.user = null;
    authState.profile = null;
    authState.role = "customer";
    authState.active = false;
    authState.pendingApproval = false;
    authState.authenticated = false;

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
            authenticated: false,
            userId: null,
            email: "",
            role: "customer",
            active: false
        });
    } catch (error) {
        console.warn(
            "Could not clear cloud status:",
            error
        );
    }

    emitAuthChange("logout");

    return {
        success: true
    };
}

/* ============================================================
   SESSION STARTUP
   ============================================================ */

export async function loadSessionOnStartup() {
    if (authState.loading) {
        return getAuthState();
    }

    authState.loading = true;
    emitAuthChange("startupStarted");

    try {
        const client = getClient();

        const {
            data,
            error
        } = await client.auth.getSession();

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

        authState.session = null;
        authState.user = null;
        authState.profile = null;
        authState.role = "customer";
        authState.active = false;
        authState.pendingApproval = false;
        authState.authenticated = false;

        return getAuthState();
    } finally {
        authState.loading = false;
        authState.initialized = true;

        emitAuthChange("startupFinished");
    }
}

/* ============================================================
   AUTH LISTENER
   ============================================================ */

let authSubscription = null;

function setupSupabaseAuthListener() {
    if (authSubscription) {
        return authSubscription;
    }

    try {
        const client = getClient();

        const {
            data
        } = client.auth.onAuthStateChange(
            async (
                event,
                session
            ) => {
                /*
                 * Avoid unnecessary profile work for events that
                 * do not change the authenticated identity.
                 */
                if (
                    event === "INITIAL_SESSION"
                ) {
                    return;
                }

                if (
                    event === "SIGNED_IN" ||
                    event === "TOKEN_REFRESHED" ||
                    event === "USER_UPDATED"
                ) {
                    /*
                     * Supabase can fire this callback while another
                     * auth operation is still running. Defer the
                     * profile query to avoid auth-lock issues.
                     */
                    setTimeout(async () => {
                        try {
                            await applySession(
                                session,
                                event.toLowerCase()
                            );
                        } catch (error) {
                            console.error(
                                "Auth state update failed:",
                                error
                            );
                        }
                    }, 0);

                    return;
                }

                if (
                    event === "SIGNED_OUT"
                ) {
                    authState.session = null;
                    authState.user = null;
                    authState.profile = null;
                    authState.role = "customer";
                    authState.active = false;
                    authState.pendingApproval = false;
                    authState.authenticated = false;

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

        authSubscription = data?.subscription || null;

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
   AUTH INITIALIZATION
   ============================================================ */

export async function initializeAuth() {
    if (authState.initialized) {
        return getAuthState();
    }

    setupSupabaseAuthListener();

    return await loadSessionOnStartup();
}

/* ============================================================
   APPROVAL REFRESH
   ============================================================ */

/*
 * This allows the approval screen to check periodically whether
 * an administrator has activated the account.
 */
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

export function hasRole(role) {
    return normalizeRole(role) === getRole();
}

export function hasAnyRole(roles = []) {
    if (!Array.isArray(roles)) {
        return false;
    }

    const currentRole = getRole();

    return roles.some(
        role =>
            normalizeRole(role) === currentRole
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
   UI ACCESS HELPERS
   ============================================================ */

export function canAccessWorkspace() {
    /*
     * Staff/admin always have access.
     * Approved annotators have access.
     * Pending users are blocked from work.
     */
    if (!isLoggedIn()) {
        return false;
    }

    if (isAdmin() || isStaff()) {
        return true;
    }

    return Boolean(
        authState.active
    );
}

export function canAccessAdminCenter() {
    return isAdmin();
}

export function canUploadCustomerMedia() {
    if (!isLoggedIn()) {
        return false;
    }

    if (isAdmin() || isStaff()) {
        return true;
    }

    return getRole() === "customer";
}

export function canUseManualAnnotationTools() {
    if (!isLoggedIn()) {
        return false;
    }

    /*
     * Coworkers should receive their assigned autogenerated/AI
     * workflow and should not see the customer manual selector.
     */
    if (isCoworker()) {
        return false;
    }

    return (
        isAdmin() ||
        isStaff() ||
        isReviewer() ||
        getRole() === "customer"
    );
}

/* ============================================================
   SAFE PUBLIC USER OBJECT
   ============================================================ */

/*
 * This object is intended for UI display. It deliberately does
 * not expose internal admin configuration.
 */
export function getPublicUser() {
    if (!authState.user) {
        return null;
    }

    return {
        id: authState.user.id,
        email: authState.user.email || "",
        name: getUserName(),
        role: getRole(),
        active: authState.active,
        avatar:
            authState.profile?.avatar_url ||
            authState.user?.user_metadata?.avatar_url ||
            ""
    };
}

/* ============================================================
   WINDOW COMPATIBILITY
   ============================================================ */

if (typeof window !== "undefined") {
    window.auth = {
        isLoggedIn,
        getAuthState,
        getUser,
        getSession,
        getProfile,
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
        canAccessWorkspace,
        canAccessAdminCenter,
        canUploadCustomerMedia,
        canUseManualAnnotationTools,
        canManageUsers,
        canManageTasks,
        canManagePayments,

        onAuthStateChange
    };
}

/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (typeof document !== "undefined") {
    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                initializeAuth().catch(error => {
                    console.error(
                        "Auth initialization failed:",
                        error
                    );
                });
            },
            {
                once: true
            }
        );
    } else {
        initializeAuth().catch(error => {
            console.error(
                "Auth initialization failed:",
                error
            );
        });
    }
}

/* ============================================================
   EXPORTS
   ============================================================ */

export default {
    isLoggedIn,
    getAuthState,
    getUser,
    getSession,
    getProfile,
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

    canAccessWorkspace,
    canAccessAdminCenter,
    canUploadCustomerMedia,
    canUseManualAnnotationTools,

    canManageUsers,
    canManageTasks,
    canManagePayments,

    onAuthStateChange
};
