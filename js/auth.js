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
    return cleanEmail(email) === ADMIN_EMAIL;
}

function isRealAuthenticatedUser(user) {
    return !!(
        user &&
        user.id &&
        user.email
    );
}

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
     * The default administrator is always active.
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
   EVENT SYSTEM
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

    return snapshot;
}

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

/*
 * IMPORTANT COMPATIBILITY EXPORT
 *
 * annotation.js, admin.js and other modules may use
 * getCurrentProfile(). The main profile getter is
 * getProfile(), so expose the same function under both
 * names instead of changing module functionality.
 */
export const getCurrentProfile =
    getProfile;

export function getRole() {
    return normalizeRole(
        authState.role ||
        "customer"
    );
}

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

export function getUserId() {
    return (
        authState.user?.id ||
        null
    );
}

export function getUserEmail() {
    return (
        authState.user?.email ||
        ""
    );
}

export function getUserName() {
    return (
        authState.profile?.full_name ||
        authState.user
            ?.user_metadata
            ?.full_name ||
        authState.user
            ?.user_metadata
            ?.name ||
        cleanName(
            "",
            authState.user?.email
        )
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
     * Direct fallback query.
     * This is useful if the helper was changed or the profile
     * did not exist yet.
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
                        APP_CONFIG
                            .tables
                            .profiles
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
     * If a profile still does not exist, create a safe local
     * representation. The database trigger should normally
     * create this row automatically.
     */
    if (!profile) {
        profile = {
            id: user.id,
            email:
                user.email || "",
            full_name:
                user
                    ?.user_metadata
                    ?.full_name ||
                user
                    ?.user_metadata
                    ?.name ||
                cleanName(
                    "",
                    user.email
                ),
            role:
                isAdminEmail(
                    user.email
                )
                    ? "admin"
                    : "customer",
            active:
                isAdminEmail(
                    user.email
                )
                    ? true
                    : false
        };
    }

    profile =
        normalizeProfile(
            profile,
            user
        );

    authState.profile =
        profile;

    authState.role =
        profile.role;

    authState.active =
        Boolean(
            profile.active
        );

    authState.pendingApproval =
        Boolean(
            isRealAuthenticatedUser(
                user
            ) &&
            !isAdminEmail(
                user.email
            ) &&
            !authState.active
        );

    return profile;
}

/* ============================================================
   AUTH UI HELPERS
   ============================================================ */

function getAuthStatusElement() {
    return (
        document.getElementById(
            "authStatus"
        ) ||
        document.getElementById(
            "loginStatus"
        ) ||
        document.getElementById(
            "signupStatus"
        )
    );
}

function setAuthStatus(
    message,
    isError = false
) {
    const element =
        getAuthStatusElement();

    if (!element) {
        return;
    }

    element.textContent =
        message || "";

    element.classList.toggle(
        "error",
        Boolean(isError)
    );

    element.classList.toggle(
        "success",
        !isError &&
        Boolean(message)
    );
}

function showAuthPage() {
    const authPage =
        document.getElementById(
            "authPage"
        );

    const loginPanel =
        document.getElementById(
            "loginPanel"
        );

    const signupPanel =
        document.getElementById(
            "signupPanel"
        );

    if (authPage) {
        authPage.hidden =
            false;

        authPage.style.display =
            "";
    }

    if (loginPanel) {
        loginPanel.hidden =
            false;

        loginPanel.style.display =
            "";
    }

    if (signupPanel) {
        signupPanel.hidden =
            true;

        signupPanel.style.display =
            "none";
    }

    document.body.dataset.auth =
        "logged-out";
}

function showSignupPage() {
    const authPage =
        document.getElementById(
            "authPage"
        );

    const loginPanel =
        document.getElementById(
            "loginPanel"
        );

    const signupPanel =
        document.getElementById(
            "signupPanel"
        );

    if (authPage) {
        authPage.hidden =
            false;

        authPage.style.display =
            "";
    }

    if (loginPanel) {
        loginPanel.hidden =
            true;

        loginPanel.style.display =
            "none";
    }

    if (signupPanel) {
        signupPanel.hidden =
            false;

        signupPanel.style.display =
            "";
    }

    document.body.dataset.auth =
        "signup";
}

function hideAuthPage() {
    const authPage =
        document.getElementById(
            "authPage"
        );

    if (authPage) {
        authPage.hidden =
            true;

        authPage.style.display =
            "none";
    }

    document.body.dataset.auth =
        "logged-in";
}

function showPendingApprovalPage() {
    const approvalPage =
        document.getElementById(
            "approvalPage"
        );

    const authPage =
        document.getElementById(
            "authPage"
        );

    const mainContent =
        document.getElementById(
            "mainContent"
        );

    if (authPage) {
        authPage.hidden =
            true;

        authPage.style.display =
            "none";
    }

    if (mainContent) {
        mainContent.hidden =
            true;

        mainContent.style.display =
            "none";
    }

    if (approvalPage) {
        approvalPage.hidden =
            false;

        approvalPage.style.display =
            "";
    }

    document.body.dataset.auth =
        "pending";
}

function hidePendingApprovalPage() {
    const approvalPage =
        document.getElementById(
            "approvalPage"
        );

    if (approvalPage) {
        approvalPage.hidden =
            true;

        approvalPage.style.display =
            "none";
    }
}

/* ============================================================
   LOGIN
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

    setAuthStatus(
        "Signing in..."
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
                    email: clean,
                    password
                });

        if (error) {
            throw error;
        }

        const session =
            data?.session ||
            null;

        const user =
            data?.user ||
            session?.user ||
            null;

        if (!user) {
            throw new Error(
                "Login succeeded but no authenticated user was returned."
            );
        }

        authState.session =
            session;

        authState.user =
            user;

        authState.authenticated =
            true;

        await loadProfile(
            user
        );

        saveLocalSession?.(
            session
        );

        updateCloudStatus?.(
            session
        );

        /*
         * Admin account is always active.
         */
        if (
            isAdminEmail(
                user.email
            )
        ) {
            authState.role =
                "admin";

            authState.active =
                true;

            authState.pendingApproval =
                false;
        }

        /*
         * Log successful login.
         */
        try {
            await logActivity(
                "login",
                {
                    user_id:
                        user.id,
                    email:
                        user.email
                }
            );
        } catch (error) {
            console.warn(
                "Login activity log failed:",
                error
            );
        }

        emitAuthChange(
            "login"
        );

        try {
            window.dispatchEvent(
                new CustomEvent(
                    "auth:login",
                    {
                        detail: {
                            user,
                            session,
                            profile:
                                authState.profile,
                            role:
                                authState.role
                        }
                    }
                )
            );
        } catch {
            // Ignore UI event failures.
        }

        /*
         * Pending accounts are allowed to authenticate but are
         * not allowed into the actual workspace until approved.
         */
        if (
            isPendingApproval()
        ) {
            showPendingApprovalPage();

            setAuthStatus(
                "Your account is waiting for admin approval."
            );

            return {
                session,
                user,
                profile:
                    authState.profile,
                pendingApproval:
                    true
            };
        }

        hidePendingApprovalPage();
        hideAuthPage();

        setAuthStatus(
            ""
        );

        return {
            session,
            user,
            profile:
                authState.profile,
            pendingApproval:
                false
        };
    } catch (error) {
        console.error(
            "Sign-in error:",
            error
        );

        authState.session =
            null;

        authState.user =
            null;

        authState.authenticated =
            false;

        authState.profile =
            null;

        authState.role =
            "customer";

        authState.active =
            false;

        authState.pendingApproval =
            false;

        setAuthStatus(
            getErrorMessage(
                error,
                "Unable to sign in."
            ),
            true
        );

        throw error;
    } finally {
        authState.loading =
            false;
    }
}

/* ============================================================
   SIGN UP
   ============================================================ */

export async function signUp(
    fullName,
    email,
    password,
    passwordConfirm
) {
    const name =
        String(
            fullName || ""
        ).trim();

    const clean =
        cleanEmail(email);

    if (name.length < 2) {
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
        8
    ) {
        throw new Error(
            "Password must be at least 8 characters."
        );
    }

    if (
        passwordConfirm !==
        undefined &&
        passwordConfirm !==
        password
    ) {
        throw new Error(
            "Passwords do not match."
        );
    }

    authState.loading =
        true;

    setAuthStatus(
        "Creating your account..."
    );

    try {
        const client =
            getClient();

        /*
         * New public registrations are always customers and
         * remain inactive until an administrator approves them.
         */
        const {
            data,
            error
        } =
            await client.auth
                .signUp({
                    email: clean,
                    password,

                    options: {
                        data: {
                            full_name:
                                name,

                            role:
                                "customer",

                            active:
                                false
                        }
                    }
                });

        if (error) {
            throw error;
        }

        /*
         * If Supabase returns a session immediately, load it.
         * If email confirmation is enabled, session may be null.
         */
        if (
            data?.session &&
            data?.user
        ) {
            authState.session =
                data.session;

            authState.user =
                data.user;

            authState.authenticated =
                true;

            await loadProfile(
                data.user
            );

            authState.role =
                "customer";

            authState.active =
                false;

            authState.pendingApproval =
                true;

            saveLocalSession?.(
                data.session
            );

            emitAuthChange(
                "signup"
            );

            try {
                window.dispatchEvent(
                    new CustomEvent(
                        "auth:signup",
                        {
                            detail: {
                                user:
                                    data.user,
                                session:
                                    data.session,
                                profile:
                                    authState.profile
                            }
                        }
                    )
                );
            } catch {
                // Ignore event failures.
            }

            showPendingApprovalPage();
        } else {
            /*
             * Email-confirmation flow.
             * Do not pretend the user is approved.
             */
            setAuthStatus(
                "Account created. Please confirm your email, then wait for admin approval."
            );
        }

        return {
            ...data,
            pendingApproval:
                true
        };
    } catch (error) {
        console.error(
            "Sign-up error:",
            error
        );

        setAuthStatus(
            getErrorMessage(
                error,
                "Unable to create your account."
            ),
            true
        );

        throw error;
    } finally {
        authState.loading =
            false;
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

    const client =
        getClient();

    const {
        error
    } =
        await client.auth
            .resetPasswordForEmail(
                clean,
                {
                    redirectTo:
                        window.location.href
                }
            );

    if (error) {
        throw error;
    }

    return true;
}

/* ============================================================
   UPDATE PASSWORD
   ============================================================ */

export async function updatePassword(
    newPassword
) {
    if (
        !newPassword ||
        newPassword.length <
        8
    ) {
        throw new Error(
            "Password must be at least 8 characters."
        );
    }

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

    /*
     * Keep profile flag synchronized where supported.
     */
    if (
        authState.user?.id
    ) {
        try {
            await client
                .from(
                    APP_CONFIG
                        .tables
                        .profiles
                )
                .update({
                    must_change_password:
                        false,
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    authState.user.id
                );
        } catch (error) {
            console.warn(
                "Could not clear must_change_password:",
                error
            );
        }
    }

    return data;
}

/* ============================================================
   UPDATE USER PROFILE
   ============================================================ */

export async function updateUserProfile(
    updates = {}
) {
    const user =
        authState.user ||
        await getCurrentUser();

    if (!user?.id) {
        throw new Error(
            "You must be signed in to update your profile."
        );
    }

    const client =
        getClient();

    const payload = {};

    if (
        Object.prototype.hasOwnProperty.call(
            updates,
            "full_name"
        )
    ) {
        const name =
            String(
                updates.full_name ||
                ""
            ).trim();

        if (name.length < 2) {
            throw new Error(
                "Name must contain at least 2 characters."
            );
        }

        if (
            name.length >
            120
        ) {
            throw new Error(
                "Name is too long."
            );
        }

        payload.full_name =
            name;
    }

    /*
     * Email and role are deliberately not accepted here.
     * Role is controlled by the administrator.
     */
    const {
        data,
        error
    } =
        await client
            .from(
                APP_CONFIG
                    .tables
                    .profiles
            )
            .update({
                ...payload,
                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                user.id
            )
            .select("*")
            .maybeSingle();

    if (error) {
        throw error;
    }

    if (data) {
        authState.profile =
            normalizeProfile(
                data,
                user
            );

        authState.role =
            authState.profile.role;

        authState.active =
            Boolean(
                authState.profile.active
            );

        authState.pendingApproval =
            Boolean(
                !authState.active &&
                !isAdmin()
            );
    }

    /*
     * Synchronize full name to Auth metadata when possible.
     */
    if (
        payload.full_name
    ) {
        try {
            await client.auth
                .updateUser({
                    data: {
                        full_name:
                            payload.full_name,

                        role:
                            authState.role
                    }
                });
        } catch (error) {
            console.warn(
                "Auth metadata profile update failed:",
                error
            );
        }

        if (
            authState.user
        ) {
            authState.user = {
                ...authState.user,

                user_metadata: {
                    ...(
                        authState.user
                            .user_metadata ||
                        {}
                    ),

                    full_name:
                        payload.full_name
                }
            };
        }
    }

    emitAuthChange(
        "profile_updated"
    );

    try {
        window.dispatchEvent(
            new CustomEvent(
                "profileUpdated",
                {
                    detail: {
                        profile:
                            authState.profile,
                        user:
                            authState.user
                    }
                }
            )
        );
    } catch {
        // Ignore UI event failures.
    }

    return {
        data:
            data ||
            authState.profile,

        error:
            null
    };
}

/* ============================================================
   UPDATE AVATAR
   ============================================================ */

export async function updateAvatar(
    avatarUrl
) {
    const user =
        authState.user ||
        await getCurrentUser();

    if (!user?.id) {
        throw new Error(
            "You must be signed in to update your profile picture."
        );
    }

    const url =
        String(
            avatarUrl || ""
        ).trim();

    if (!url) {
        throw new Error(
            "A valid profile picture URL is required."
        );
    }

    const client =
        getClient();

    const {
        data,
        error
    } =
        await client
            .from(
                APP_CONFIG
                    .tables
                    .profiles
            )
            .update({
                avatar_url:
                    url,

                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                user.id
            )
            .select("*")
            .maybeSingle();

    if (error) {
        throw error;
    }

    if (data) {
        authState.profile =
            normalizeProfile(
                data,
                user
            );
    } else if (
        authState.profile
    ) {
        authState.profile = {
            ...authState.profile,
            avatar_url:
                url
        };
    }

    try {
        await client.auth
            .updateUser({
                data: {
                    avatar_url:
                        url
                }
            });
    } catch (error) {
        console.warn(
            "Auth avatar metadata update failed:",
            error
        );
    }

    emitAuthChange(
        "avatar_updated"
    );

    return {
        data:
            authState.profile,

        avatar_url:
            url,

        url,

        error:
            null
    };
}

/* ============================================================
   SIGN OUT
   ============================================================ */

export async function signOut() {
    const currentUser =
        authState.user;

    try {
        if (
            currentUser?.id
        ) {
            try {
                await logActivity(
                    "logout",
                    {
                        user_id:
                            currentUser.id,
                        email:
                            currentUser.email
                    }
                );
            } catch (error) {
                console.warn(
                    "Logout activity log failed:",
                    error
                );
            }
        }

        const client =
            getClient();

        if (client) {
            const {
                error
            } =
                await client.auth
                    .signOut();

            if (error) {
                throw error;
            }
        }
    } catch (error) {
        console.error(
            "Sign-out error:",
            error
        );
    } finally {
        clearLocalSession?.();

        authState.user =
            null;

        authState.session =
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

        hidePendingApprovalPage();

        showAuthPage();

        updateCloudStatus?.(
            null
        );

        emitAuthChange(
            "logout"
        );

        try {
            window.dispatchEvent(
                new CustomEvent(
                    "auth:logout"
                )
            );
        } catch {
            // Ignore event failures.
        }
    }

    return true;
}

/* ============================================================
   SESSION STARTUP
   ============================================================ */

export async function loadSessionOnStartup() {
    authState.loading =
        true;

    try {
        const session =
            await getCurrentSession();

        if (
            !session?.user
        ) {
            authState.session =
                null;

            authState.user =
                null;

            authState.authenticated =
                false;

            authState.profile =
                null;

            authState.role =
                "customer";

            authState.active =
                false;

            authState.pendingApproval =
                false;

            showAuthPage();

            updateCloudStatus?.(
                null
            );

            return null;
        }

        authState.session =
            session;

        authState.user =
            session.user;

        authState.authenticated =
            true;

        await loadProfile(
            session.user
        );

        /*
         * Protected administrator always gets access.
         */
        if (
            isAdminEmail(
                session.user.email
            )
        ) {
            authState.role =
                "admin";

            authState.active =
                true;

            authState.pendingApproval =
                false;

            if (
                authState.profile
            ) {
                authState.profile =
                    {
                        ...authState.profile,
                        role:
                            "admin",
                        active:
                            true
                    };
            }
        }

        saveLocalSession?.(
            session
        );

        updateCloudStatus?.(
            session
        );

        if (
            isPendingApproval()
        ) {
            showPendingApprovalPage();
        } else {
            hidePendingApprovalPage();
            hideAuthPage();
        }

        emitAuthChange(
            "startup"
        );

        try {
            window.dispatchEvent(
                new CustomEvent(
                    "auth:session",
                    {
                        detail: {
                            session,
                            user:
                                session.user,
                            profile:
                                authState.profile,
                            role:
                                authState.role
                        }
                    }
                )
            );
        } catch {
            // Ignore event failures.
        }

        return session;
    } catch (error) {
        console.warn(
            "Session startup failed:",
            error
        );

        authState.session =
            null;

        authState.user =
            null;

        authState.authenticated =
            false;

        authState.profile =
            null;

        authState.role =
            "customer";

        authState.active =
            false;

        authState.pendingApproval =
            false;

        showAuthPage();

        updateCloudStatus?.(
            null
        );

        return null;
    } finally {
        authState.loading =
            false;
    }
}

/* ============================================================
   AUTH STATE LISTENER
   ============================================================ */

function bindSupabaseAuthListener() {
    const client =
        getSupabase?.() ||
        supabase;

    if (
        !client ||
        !client.auth
    ) {
        return;
    }

    client.auth.onAuthStateChange(
        async (
            event,
            session
        ) => {
            /*
             * Supabase may emit INITIAL_SESSION immediately.
             */
            if (
                session?.user
            ) {
                authState.session =
                    session;

                authState.user =
                    session.user;

                authState.authenticated =
                    true;

                /*
                 * Avoid unnecessary recursive work during token
                 * refreshes, but always make sure a profile exists.
                 */
                if (
                    event ===
                    "SIGNED_IN" ||
                    event ===
                    "INITIAL_SESSION" ||
                    !authState.profile
                ) {
                    try {
                        await loadProfile(
                            session.user
                        );
                    } catch (error) {
                        console.warn(
                            "Auth listener profile load failed:",
                            error
                        );
                    }
                }

                if (
                    isAdminEmail(
                        session.user.email
                    )
                ) {
                    authState.role =
                        "admin";

                    authState.active =
                        true;

                    authState.pendingApproval =
                        false;
                }

                saveLocalSession?.(
                    session
                );

                updateCloudStatus?.(
                    session
                );

                if (
                    isPendingApproval()
                ) {
                    showPendingApprovalPage();
                } else {
                    hidePendingApprovalPage();
                    hideAuthPage();
                }

                emitAuthChange(
                    event.toLowerCase()
                );

                try {
                    window.dispatchEvent(
                        new CustomEvent(
                            "auth:session",
                            {
                                detail: {
                                    event,
                                    session,
                                    user:
                                        session.user,
                                    profile:
                                        authState.profile,
                                    role:
                                        authState.role
                                }
                            }
                        )
                    );
                } catch {
                    // Ignore event failures.
                }

                return;
            }

            /*
             * No authenticated session.
             */
            if (
                event ===
                "SIGNED_OUT"
            ) {
                authState.session =
                    null;

                authState.user =
                    null;

                authState.authenticated =
                    false;

                authState.profile =
                    null;

                authState.role =
                    "customer";

                authState.active =
                    false;

                authState.pendingApproval =
                    false;

                clearLocalSession?.();

                showAuthPage();
                hidePendingApprovalPage();

                updateCloudStatus?.(
                    null
                );

                emitAuthChange(
                    "signed_out"
                );

                try {
                    window.dispatchEvent(
                        new CustomEvent(
                            "auth:logout"
                        )
                    );
                } catch {
                    // Ignore event failures.
                }
            }
        }
    );
}

/* ============================================================
   INITIALIZATION
   ============================================================ */

export async function initializeAuth() {
    if (
        authState.initialized
    ) {
        return getAuthState();
    }

    authState.initialized =
        true;

    bindSupabaseAuthListener();

    /*
     * Bind login form.
     */
    const loginForm =
        document.getElementById(
            "loginForm"
        );

    if (
        loginForm &&
        !loginForm.dataset.authBound
    ) {
        loginForm.dataset.authBound =
            "true";

        loginForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const email =
                    document.getElementById(
                        "loginEmail"
                    )?.value || "";

                const password =
                    document.getElementById(
                        "loginPassword"
                    )?.value || "";

                const button =
                    document.getElementById(
                        "signInBtn"
                    );

                if (button) {
                    button.disabled =
                        true;
                }

                try {
                    await signIn(
                        email,
                        password
                    );
                } catch {
                    // Error already displayed.
                } finally {
                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );
    }

    /*
     * Bind signup form.
     */
    const signupForm =
        document.getElementById(
            "signupForm"
        );

    if (
        signupForm &&
        !signupForm.dataset.authBound
    ) {
        signupForm.dataset.authBound =
            "true";

        signupForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const name =
                    document.getElementById(
                        "signupName"
                    )?.value || "";

                const email =
                    document.getElementById(
                        "signupEmail"
                    )?.value || "";

                const password =
                    document.getElementById(
                        "signupPassword"
                    )?.value || "";

                const confirm =
                    document.getElementById(
                        "signupPasswordConfirm"
                    )?.value ||
                    password;

                const button =
                    document.getElementById(
                        "signUpBtn"
                    );

                if (button) {
                    button.disabled =
                        true;
                }

                try {
                    await signUp(
                        name,
                        email,
                        password,
                        confirm
                    );
                } catch {
                    // Error already displayed.
                } finally {
                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );
    }

    /*
     * Login/signup switching.
     */
    const showSignupButton =
        document.getElementById(
            "showSignupButton"
        );

    if (
        showSignupButton &&
        !showSignupButton.dataset.authBound
    ) {
        showSignupButton.dataset.authBound =
            "true";

        showSignupButton.addEventListener(
            "click",
            event => {
                event.preventDefault();
                showSignupPage();
            }
        );
    }

    const showLoginButton =
        document.getElementById(
            "showLoginButton"
        );

    if (
        showLoginButton &&
        !showLoginButton.dataset.authBound
    ) {
        showLoginButton.dataset.authBound =
            "true";

        showLoginButton.addEventListener(
            "click",
            event => {
                event.preventDefault();
                showAuthPage();
            }
        );
    }

    /*
     * Forgot password.
     */
    const forgotButton =
        document.getElementById(
            "forgotPasswordButton"
        );

    if (
        forgotButton &&
        !forgotButton.dataset.authBound
    ) {
        forgotButton.dataset.authBound =
            "true";

        forgotButton.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                const email =
                    document.getElementById(
                        "loginEmail"
                    )?.value || "";

                if (!email.trim()) {
                    setAuthStatus(
                        "Enter your email address first.",
                        true
                    );

                    document
                        .getElementById(
                            "loginEmail"
                        )
                        ?.focus();

                    return;
                }

                try {
                    forgotButton.disabled =
                        true;

                    setAuthStatus(
                        "Sending password reset instructions..."
                    );

                    await requestPasswordReset(
                        email
                    );

                    setAuthStatus(
                        "Password reset instructions have been sent."
                    );
                } catch (error) {
                    setAuthStatus(
                        getErrorMessage(
                            error,
                            "Unable to send password reset instructions."
                        ),
                        true
                    );
                } finally {
                    forgotButton.disabled =
                        false;
                }
            }
        );
    }

    /*
     * Logout button.
     */
    const logoutButton =
        document.getElementById(
            "logoutBtn"
        );

    if (
        logoutButton &&
        !logoutButton.dataset.authBound
    ) {
        logoutButton.dataset.authBound =
            "true";

        logoutButton.addEventListener(
            "click",
            async event => {
                event.preventDefault();
                await signOut();
            }
        );
    }

    /*
     * Load any existing session.
     */
    await loadSessionOnStartup();

    return getAuthState();
}

/* ============================================================
   REFRESH PROFILE STATUS
   ============================================================ */

export async function refreshProfileStatus() {
    const user =
        authState.user ||
        await getCurrentUser();

    if (!user?.id) {
        return null;
    }

    try {
        const profile =
            await loadProfile(
                user
            );

        if (
            isAdminEmail(
                user.email
            )
        ) {
            authState.role =
                "admin";

            authState.active =
                true;

            authState.pendingApproval =
                false;
        }

        if (
            isPendingApproval()
        ) {
            showPendingApprovalPage();
        } else {
            hidePendingApprovalPage();
        }

        emitAuthChange(
            "profile_status_refreshed"
        );

        return profile;
    } catch (error) {
        console.warn(
            "Profile status refresh failed:",
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
            getRole()
        ) ===
        normalizeRole(
            role
        )
    );
}

export function hasAnyRole(
    roles = []
) {
    const current =
        normalizeRole(
            getRole()
        );

    return roles.some(
        role =>
            normalizeRole(
                role
            ) === current
    );
}

export function isRoleAtLeastAdmin() {
    return isAdmin();
}

export function isPrivilegedUser() {
    return (
        isAdmin() ||
        isStaff() ||
        isReviewer()
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
    return (
        isAdmin() ||
        isStaff()
    );
}

export function canAccessWorkspace() {
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

    return isActiveUser();
}

export function canAccessAdminCenter() {
    return (
        isAdmin() ||
        isStaff()
    );
}

export function canUploadCustomerMedia() {
    if (
        !isLoggedIn()
    ) {
        return false;
    }

    /*
     * Customers can upload.
     * Staff/admin also have full access.
     * Coworkers/reviewers do not get customer upload controls.
     */
    return (
        hasRole("customer") ||
        isAdmin() ||
        isStaff()
    );
}

export function canUseManualAnnotationTools() {
    if (
        !isLoggedIn() ||
        !isActiveUser()
    ) {
        return false;
    }

    /*
     * Coworkers must use the automatically assigned workflow.
     * They should not be given the manual annotation-type
     * selector intended for unrestricted users.
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
        hasRole("customer")
    );
}

/* ============================================================
   PUBLIC USER
   ============================================================ */

export function getPublicUser() {
    const user =
        authState.user;

    const profile =
        authState.profile;

    if (!user) {
        return null;
    }

    return {
        id:
            user.id,

        email:
            user.email || "",

        full_name:
            profile?.full_name ||
            user
                ?.user_metadata
                ?.full_name ||
            user
                ?.user_metadata
                ?.name ||
            cleanName(
                "",
                user.email
            ),

        role:
            normalizeRole(
                authState.role ||
                profile?.role ||
                "customer"
            ),

        active:
            Boolean(
                authState.active
            ),

        avatar_url:
            profile?.avatar_url ||
            user
                ?.user_metadata
                ?.avatar_url ||
            null
    };
}

/* ============================================================
   WINDOW COMPATIBILITY
   ============================================================ */

window.auth = {
    state:
        authState,

    getState:
        getAuthState,

    getUser,
    getSession,
    getProfile,

    /*
     * Compatibility alias.
     */
    getCurrentProfile,

    getRole,
    getUserId,
    getUserEmail,
    getUserName,

    isLoggedIn,
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

    getPublicUser,

    onAuthStateChange
};

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
                once: true
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
   EXPORTS
   ============================================================ */

export default {
    isLoggedIn,

    getAuthState,

    getUser,

    getSession,

    getProfile,

    /*
     * Compatibility alias required by annotation.js.
     */
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

    canAccessWorkspace,

    canAccessAdminCenter,

    canUploadCustomerMedia,

    canUseManualAnnotationTools,

    canManageUsers,

    canManageTasks,

    canManagePayments,

    onAuthStateChange
};

console.log(
    "Auth module loaded."
);
