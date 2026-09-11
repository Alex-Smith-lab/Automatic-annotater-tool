// ============================================================
// ANNOTATION AI - AUTHENTICATION MODULE
// Handles:
// - Sign in
// - Sign up
// - Sign out
// - Password reset
// - Session restoration
// - Profile loading
// - Role detection
// - Admin detection
// - Pending approval state
// - Auth state changes
// ============================================================

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
    getSession,
    getCurrentSession,
    getCurrentUser,
    getCurrentProfile,
    logActivity,
    updateCloudStatus,
    signOutUser
} from "./supabase.js";

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------

const authState = {
    initialized: false,
    loading: false,
    loggedIn: false,

    user: null,
    session: null,
    profile: null,

    role: "customer",
    active: false,

    error: null
};

// ------------------------------------------------------------
// DOM HELPERS
// ------------------------------------------------------------

function $(id) {
    return document.getElementById(id);
}

function qs(selector, root = document) {
    return root.querySelector(selector);
}

function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

// ------------------------------------------------------------
// TOAST
// ------------------------------------------------------------

function showToast(message, type = "info") {
    if (typeof window.showToast === "function") {
        window.showToast(message, type);
        return;
    }

    let toast = document.getElementById("appToast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "appToast";
        toast.className = "app-toast";
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add("show");

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

// ------------------------------------------------------------
// EVENT SYSTEM
// ------------------------------------------------------------

function emit(name, detail = {}) {
    window.dispatchEvent(
        new CustomEvent(name, {
            detail
        })
    );
}

// ------------------------------------------------------------
// GETTERS
// ------------------------------------------------------------

function isLoggedIn() {
    return Boolean(authState.loggedIn && authState.user);
}

function getAuthState() {
    return authState;
}

function getUser() {
    return authState.user;
}

function getSessionState() {
    return authState.session;
}

function getProfile() {
    return authState.profile;
}

function getRole() {
    return normalizeRole(authState.role);
}

function isActive() {
    return authState.active === true;
}

function isAdmin() {
    return isAdminRole(authState.role);
}

function isStaff() {
    return isStaffRole(authState.role);
}

function isReviewer() {
    return isReviewerRole(authState.role);
}

function isCoworker() {
    return isCoworkerRole(authState.role);
}

function canAnnotate() {
    return canAnnotateRole(authState.role);
}

// ------------------------------------------------------------
// ADMIN OVERRIDE
// ------------------------------------------------------------
// The default administrator is controlled from config.js.
// The email is never rendered into normal user-facing UI.
// ------------------------------------------------------------

function isConfiguredAdminEmail(email) {
    if (!email || !APP_CONFIG.adminEmail) {
        return false;
    }

    return (
        String(email).trim().toLowerCase() ===
        String(APP_CONFIG.adminEmail).trim().toLowerCase()
    );
}

// ------------------------------------------------------------
// PROFILE NORMALIZATION
// ------------------------------------------------------------

function normalizeProfile(profile, user = null) {
    const source = profile || {};

    const email =
        source.email ||
        user?.email ||
        "";

    let role = normalizeRole(
        source.role ||
        user?.user_metadata?.role ||
        APP_CONFIG.defaultRole
    );

    // Never expose the configured admin email in the UI.
    // Internally it always receives admin privileges.
    if (isConfiguredAdminEmail(email)) {
        role = "admin";
    }

    let active =
        source.active === true ||
        source.active === 1 ||
        source.active === "true";

    // Configured admin is always active.
    if (role === "admin" && isConfiguredAdminEmail(email)) {
        active = true;
    }

    return {
        ...source,

        id: source.id || user?.id || null,

        email,

        full_name:
            source.full_name ||
            user?.user_metadata?.full_name ||
            user?.user_metadata?.name ||
            email.split("@")[0] ||
            "User",

        avatar_url:
            source.avatar_url ||
            user?.user_metadata?.avatar_url ||
            "",

        role,

        active
    };
}

// ------------------------------------------------------------
// LOAD PROFILE
// ------------------------------------------------------------

async function loadProfile(user = null) {
    const currentUser = user || authState.user;

    if (!currentUser?.id) {
        authState.profile = null;
        authState.role = APP_CONFIG.defaultRole;
        authState.active = false;
        return null;
    }

    let profile = null;

    try {
        profile = await getCurrentProfile();
    } catch (error) {
        console.warn("Could not load current profile:", error);
    }

    // Fallback direct profile query.
    if (!profile) {
        try {
            const client = getSupabase();

            if (client) {
                const { data, error } = await client
                    .from(APP_CONFIG.tables.profiles)
                    .select("*")
                    .eq("id", currentUser.id)
                    .maybeSingle();

                if (!error) {
                    profile = data;
                }
            }
        } catch (error) {
            console.warn("Profile fallback failed:", error);
        }
    }

    const normalized = normalizeProfile(profile, currentUser);

    authState.profile = normalized;
    authState.role = normalized.role;
    authState.active = normalized.active;

    return normalized;
}

// ------------------------------------------------------------
// ENSURE PROFILE EXISTS
// ------------------------------------------------------------

async function ensureProfile(user, options = {}) {
    if (!user?.id) {
        return null;
    }

    const client = getSupabase();

    if (!client) {
        return null;
    }

    const fullName =
        options.fullName ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "User";

    const requestedRole = normalizeRole(
        options.role ||
        user.user_metadata?.role ||
        APP_CONFIG.defaultRole
    );

    // New public signups are customers.
    // They should be inactive until approved by an administrator.
    let role = requestedRole;

    if (!isConfiguredAdminEmail(user.email)) {
        role = "customer";
    } else {
        role = "admin";
    }

    const active = isConfiguredAdminEmail(user.email);

    try {
        const { data, error } = await client
            .from(APP_CONFIG.tables.profiles)
            .upsert(
                {
                    id: user.id,
                    email: user.email || null,
                    full_name: fullName,
                    role,
                    active
                },
                {
                    onConflict: "id"
                }
            )
            .select("*")
            .maybeSingle();

        if (error) {
            console.warn("Could not create/update profile:", error);
            return null;
        }

        return data;
    } catch (error) {
        console.warn("Profile creation failed:", error);
        return null;
    }
}

// ------------------------------------------------------------
// RECORD LOGIN
// ------------------------------------------------------------

async function recordLogin(user, profile) {
    if (!user?.id) {
        return;
    }

    try {
        await logActivity(
            "login",
            "User signed in",
            {
                user_id: user.id,
                role: profile?.role || "customer",
                active: profile?.active === true
            }
        );
    } catch (error) {
        console.warn("Login activity could not be recorded:", error);
    }

    // Try to update common presence fields individually.
    const client = getSupabase();

    if (!client) {
        return;
    }

    const now = new Date().toISOString();

    try {
        await client
            .from(APP_CONFIG.tables.profiles)
            .update({
                last_seen_at: now
            })
            .eq("id", user.id);
    } catch (error) {
        console.warn("Could not update last_seen_at:", error);
    }

    // Some database versions contain last_login_at.
    // Failure is intentionally ignored so older schemas continue working.
    try {
        await client
            .from(APP_CONFIG.tables.profiles)
            .update({
                last_login_at: now
            })
            .eq("id", user.id);
    } catch (error) {
        console.debug("last_login_at is unavailable or could not be updated.");
    }
}

// ------------------------------------------------------------
// RECORD LOGOUT
// ------------------------------------------------------------

async function recordLogout(user, profile) {
    if (!user?.id) {
        return;
    }

    try {
        await logActivity(
            "logout",
            "User signed out",
            {
                user_id: user.id,
                role: profile?.role || "customer"
            }
        );
    } catch (error) {
        console.warn("Logout activity could not be recorded:", error);
    }

    const client = getSupabase();

    if (!client) {
        return;
    }

    const now = new Date().toISOString();

    try {
        await client
            .from(APP_CONFIG.tables.profiles)
            .update({
                last_seen_at: now
            })
            .eq("id", user.id);
    } catch (error) {
        console.warn("Could not update logout presence:", error);
    }

    try {
        await client
            .from(APP_CONFIG.tables.profiles)
            .update({
                last_logout_at: now
            })
            .eq("id", user.id);
    } catch (error) {
        console.debug("last_logout_at is unavailable or could not be updated.");
    }
}

// ------------------------------------------------------------
// APPLY AUTH STATE
// ------------------------------------------------------------

async function applyAuthSession(session, options = {}) {
    authState.loading = true;
    authState.error = null;

    try {
        authState.session = session || null;
        authState.user = session?.user || null;
        authState.loggedIn = Boolean(session?.user);

        if (!session?.user) {
            authState.profile = null;
            authState.role = APP_CONFIG.defaultRole;
            authState.active = false;

            emit("authChanged", {
                loggedIn: false,
                user: null,
                profile: null,
                role: authState.role,
                active: false
            });

            return authState;
        }

        let profile = await loadProfile(session.user);

        // If no profile exists, create one.
        if (!profile) {
            await ensureProfile(session.user);

            profile = await loadProfile(session.user);
        }

        // Safety fallback.
        if (!profile) {
            profile = normalizeProfile(null, session.user);

            authState.profile = profile;
            authState.role = profile.role;
            authState.active = profile.active;
        }

        if (!options.skipLoginRecord) {
            await recordLogin(session.user, profile);
        }

        try {
            updateCloudStatus({
                online: true,
                authenticated: true,
                userId: session.user.id,
                role: profile.role
            });
        } catch (error) {
            console.debug("Cloud status update skipped.");
        }

        emit("authChanged", {
            loggedIn: true,
            user: authState.user,
            session: authState.session,
            profile: authState.profile,
            role: authState.role,
            active: authState.active
        });

        return authState;
    } finally {
        authState.loading = false;
    }
}

// ------------------------------------------------------------
// SIGN IN
// ------------------------------------------------------------

async function signIn(email, password) {
    const client = getSupabase();

    if (!client) {
        throw new Error(
            "Supabase is not configured. Please check js/config.js."
        );
    }

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
        throw new Error("Please enter your email address.");
    }

    if (!password) {
        throw new Error("Please enter your password.");
    }

    authState.loading = true;
    authState.error = null;

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: cleanEmail,
            password
        });

        if (error) {
            throw error;
        }

        if (!data?.session || !data?.user) {
            throw new Error("Sign in completed but no active session was returned.");
        }

        await applyAuthSession(data.session);

        showToast("Signed in successfully.", "success");

        return {
            user: data.user,
            session: data.session,
            profile: authState.profile,
            role: authState.role,
            active: authState.active
        };
    } catch (error) {
        authState.error = error;

        const message = friendlyAuthError(error);

        showToast(message, "error");

        throw error;
    } finally {
        authState.loading = false;
    }
}

// ------------------------------------------------------------
// SIGN UP
// ------------------------------------------------------------

async function signUp(email, password, fullName = "") {
    const client = getSupabase();

    if (!client) {
        throw new Error(
            "Supabase is not configured. Please check js/config.js."
        );
    }

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName =
        String(fullName || "").trim() ||
        cleanEmail.split("@")[0] ||
        "User";

    if (!cleanEmail) {
        throw new Error("Please enter your email address.");
    }

    if (!password) {
        throw new Error("Please enter a password.");
    }

    if (password.length < 6) {
        throw new Error("Password must contain at least 6 characters.");
    }

    authState.loading = true;
    authState.error = null;

    try {
        const { data, error } = await client.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    full_name: cleanName,
                    role: "customer"
                }
            }
        });

        if (error) {
            throw error;
        }

        // If Supabase immediately returns a session, create/update
        // the profile from the client.
        if (data?.user) {
            await ensureProfile(data.user, {
                fullName: cleanName,
                role: "customer"
            });
        }

        // A newly registered public user is never made an admin.
        // The database should also enforce active=false for new customers.
        if (data?.session && data?.user) {
            await applyAuthSession(data.session, {
                skipLoginRecord: true
            });

            // Force the newly registered customer to remain pending.
            if (!isConfiguredAdminEmail(cleanEmail)) {
                authState.role = "customer";
                authState.active = false;

                if (authState.profile) {
                    authState.profile.role = "customer";
                    authState.profile.active = false;
                }
            }

            emit("signupCompleted", {
                user: data.user,
                profile: authState.profile,
                active: authState.active
            });

            showToast(
                "Account created. Please wait for admin approval.",
                "success"
            );
        } else {
            emit("signupCompleted", {
                user: data?.user || null,
                profile: null,
                active: false
            });

            showToast(
                "Account created. Please verify your email and wait for admin approval.",
                "success"
            );
        }

        return {
            ...data,
            profile: authState.profile,
            role: authState.role,
            active: authState.active
        };
    } catch (error) {
        authState.error = error;

        const message = friendlyAuthError(error);

        showToast(message, "error");

        throw error;
    } finally {
        authState.loading = false;
    }
}

// ------------------------------------------------------------
// PASSWORD RESET
// ------------------------------------------------------------

async function requestPasswordReset(email) {
    const client = getSupabase();

    if (!client) {
        throw new Error("Supabase is not configured.");
    }

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
        throw new Error("Please enter your email address.");
    }

    try {
        const redirectTo =
            `${window.location.origin}` +
            `${window.location.pathname}`;

        const { error } = await client.auth.resetPasswordForEmail(
            cleanEmail,
            {
                redirectTo
            }
        );

        if (error) {
            throw error;
        }

        showToast(
            "Password reset instructions have been sent.",
            "success"
        );

        return true;
    } catch (error) {
        showToast(friendlyAuthError(error), "error");
        throw error;
    }
}

// ------------------------------------------------------------
// UPDATE PASSWORD
// ------------------------------------------------------------

async function updatePassword(newPassword) {
    const client = getSupabase();

    if (!client) {
        throw new Error("Supabase is not configured.");
    }

    if (!newPassword || newPassword.length < 6) {
        throw new Error(
            "New password must contain at least 6 characters."
        );
    }

    try {
        const { data, error } = await client.auth.updateUser({
            password: newPassword
        });

        if (error) {
            throw error;
        }

        showToast("Password updated successfully.", "success");

        emit("passwordUpdated", {
            user: data?.user || authState.user
        });

        return data;
    } catch (error) {
        showToast(friendlyAuthError(error), "error");
        throw error;
    }
}

// ------------------------------------------------------------
// SIGN OUT
// ------------------------------------------------------------

async function signOut() {
    const user = authState.user;
    const profile = authState.profile;

    try {
        await recordLogout(user, profile);
    } catch (error) {
        console.warn("Could not record logout:", error);
    }

    try {
        await signOutUser();
    } catch (error) {
        console.warn("Supabase sign out failed:", error);

        // Continue clearing local state even if the network request fails.
        try {
            localStorage.removeItem(
                APP_CONFIG.auth?.storageKey || "annotation-ai-auth"
            );
        } catch (storageError) {
            console.debug("Could not clear auth storage.");
        }
    }

    authState.loggedIn = false;
    authState.user = null;
    authState.session = null;
    authState.profile = null;
    authState.role = APP_CONFIG.defaultRole;
    authState.active = false;
    authState.error = null;

    try {
        updateCloudStatus({
            online: true,
            authenticated: false
        });
    } catch (error) {
        console.debug("Cloud status update skipped.");
    }

    emit("authChanged", {
        loggedIn: false,
        user: null,
        session: null,
        profile: null,
        role: APP_CONFIG.defaultRole,
        active: false
    });

    emit("signedOut");

    showToast("You have been signed out.", "success");

    return true;
}

// ------------------------------------------------------------
// SESSION STARTUP
// ------------------------------------------------------------

async function loadSessionOnStartup() {
    if (authState.loading) {
        return authState;
    }

    authState.loading = true;

    try {
        const session =
            await getCurrentSession();

        if (session) {
            await applyAuthSession(session);
        } else {
            authState.session = null;
            authState.user = null;
            authState.loggedIn = false;
            authState.profile = null;
            authState.role = APP_CONFIG.defaultRole;
            authState.active = false;

            emit("authChanged", {
                loggedIn: false,
                user: null,
                profile: null,
                role: authState.role,
                active: false
            });
        }

        return authState;
    } catch (error) {
        console.error("Could not restore authentication session:", error);

        authState.error = error;
        authState.loggedIn = false;
        authState.user = null;
        authState.session = null;

        emit("authChanged", {
            loggedIn: false,
            user: null,
            profile: null,
            role: APP_CONFIG.defaultRole,
            active: false
        });

        return authState;
    } finally {
        authState.loading = false;
    }
}

// ------------------------------------------------------------
// FRIENDLY SUPABASE AUTH ERRORS
// ------------------------------------------------------------

function friendlyAuthError(error) {
    if (!error) {
        return "An authentication error occurred.";
    }

    const raw =
        error.message ||
        error.error_description ||
        String(error);

    const message = raw.toLowerCase();

    if (
        message.includes("invalid login credentials") ||
        message.includes("invalid credentials")
    ) {
        return "Incorrect email or password.";
    }

    if (message.includes("email not confirmed")) {
        return "Please verify your email before signing in.";
    }

    if (message.includes("user already registered")) {
        return "An account with this email already exists.";
    }

    if (message.includes("password should be at least")) {
        return "Password must contain at least 6 characters.";
    }

    if (message.includes("rate limit")) {
        return "Too many attempts. Please wait a moment and try again.";
    }

    if (message.includes("network")) {
        return "Network error. Please check your internet connection.";
    }

    return raw;
}

// ------------------------------------------------------------
// LOGIN / SIGNUP FORM HELPERS
// ------------------------------------------------------------

function getInputValue(id, fallback = "") {
    const element = $(id);

    if (!element) {
        return fallback;
    }

    return String(element.value || "").trim();
}

function setLoading(button, loading, loadingText = "Please wait...") {
    if (!button) {
        return;
    }

    if (loading) {
        button.dataset.originalText =
            button.textContent;

        button.disabled = true;
        button.classList.add("loading");
        button.textContent = loadingText;
    } else {
        button.disabled = false;
        button.classList.remove("loading");

        if (button.dataset.originalText) {
            button.textContent =
                button.dataset.originalText;
        }
    }
}

// ------------------------------------------------------------
// AUTH SCREEN HELPERS
// ------------------------------------------------------------

function showAuthScreen(screen) {
    const loginScreen =
        $("loginScreen") ||
        $("loginPage") ||
        $("loginView");

    const signupScreen =
        $("signupScreen") ||
        $("signupPage") ||
        $("signupView");

    const appScreen =
        $("appScreen") ||
        $("mainApp") ||
        $("appContainer");

    if (screen === "login") {
        loginScreen?.classList.remove("hidden");
        signupScreen?.classList.add("hidden");
        appScreen?.classList.add("hidden");
    }

    if (screen === "signup") {
        loginScreen?.classList.add("hidden");
        signupScreen?.classList.remove("hidden");
        appScreen?.classList.add("hidden");
    }

    if (screen === "app") {
        loginScreen?.classList.add("hidden");
        signupScreen?.classList.add("hidden");
        appScreen?.classList.remove("hidden");
    }

    document.body.dataset.authScreen = screen;
}

// ------------------------------------------------------------
// LOGIN FORM
// ------------------------------------------------------------

function bindLoginForm() {
    const form =
        $("loginForm") ||
        qs('form[data-auth="login"]');

    if (!form || form.dataset.authBound === "true") {
        return;
    }

    form.dataset.authBound = "true";

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const email =
            getInputValue("loginEmail") ||
            getInputValue("email") ||
            getInputValue("signInEmail");

        const password =
            getInputValue("loginPassword") ||
            getInputValue("password") ||
            getInputValue("signInPassword");

        const button =
            $("signInBtn") ||
            $("loginButton") ||
            form.querySelector('button[type="submit"]');

        setLoading(button, true, "Signing in...");

        try {
            await signIn(email, password);
        } catch (error) {
            // Error already displayed by signIn().
        } finally {
            setLoading(button, false);
        }
    });
}

// ------------------------------------------------------------
// SIGNUP FORM
// ------------------------------------------------------------

function bindSignupForm() {
    const form =
        $("signupForm") ||
        qs('form[data-auth="signup"]');

    if (!form || form.dataset.authBound === "true") {
        return;
    }

    form.dataset.authBound = "true";

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const fullName =
            getInputValue("signupName") ||
            getInputValue("fullName") ||
            getInputValue("registerName") ||
            getInputValue("name");

        const email =
            getInputValue("signupEmail") ||
            getInputValue("registerEmail");

        const password =
            getInputValue("signupPassword") ||
            getInputValue("registerPassword");

        const confirmPassword =
            getInputValue("signupConfirmPassword") ||
            getInputValue("confirmPassword") ||
            getInputValue("registerConfirmPassword");

        if (
            confirmPassword &&
            password !== confirmPassword
        ) {
            showToast(
                "Passwords do not match.",
                "error"
            );

            return;
        }

        const button =
            $("signUpBtn") ||
            $("signupButton") ||
            form.querySelector('button[type="submit"]');

        setLoading(button, true, "Creating account...");

        try {
            await signUp(
                email,
                password,
                fullName
            );
        } catch (error) {
            // Error already displayed by signUp().
        } finally {
            setLoading(button, false);
        }
    });
}

// ------------------------------------------------------------
// AUTH NAVIGATION
// ------------------------------------------------------------

function bindAuthNavigation() {
    const loginButtons = [
        $("showLogin"),
        $("goToLogin"),
        $("loginLink"),
        $("alreadyHaveAccount")
    ].filter(Boolean);

    loginButtons.forEach(button => {
        if (button.dataset.authNavBound === "true") {
            return;
        }

        button.dataset.authNavBound = "true";

        button.addEventListener("click", event => {
            event.preventDefault();
            showAuthScreen("login");
        });
    });

    const signupButtons = [
        $("showSignup"),
        $("goToSignup"),
        $("signupLink"),
        $("createAccountLink")
    ].filter(Boolean);

    signupButtons.forEach(button => {
        if (button.dataset.authNavBound === "true") {
            return;
        }

        button.dataset.authNavBound = "true";

        button.addEventListener("click", event => {
            event.preventDefault();
            showAuthScreen("signup");
        });
    });
}

// ------------------------------------------------------------
// FORGOT PASSWORD
// ------------------------------------------------------------

function bindForgotPassword() {
    const buttons = [
        $("forgotPassword"),
        $("forgotPasswordBtn"),
        $("resetPasswordBtn")
    ].filter(Boolean);

    buttons.forEach(button => {
        if (button.dataset.authBound === "true") {
            return;
        }

        button.dataset.authBound = "true";

        button.addEventListener("click", async event => {
            event.preventDefault();

            const email =
                getInputValue("loginEmail") ||
                getInputValue("email") ||
                getInputValue("signInEmail");

            if (!email) {
                showToast(
                    "Enter your email address first.",
                    "error"
                );
                return;
            }

            try {
                await requestPasswordReset(email);
            } catch (error) {
                // Already handled.
            }
        });
    });
}

// ------------------------------------------------------------
// LOGOUT BUTTON
// ------------------------------------------------------------

function bindLogout() {
    const buttons = [
        $("logoutBtn"),
        $("logoutButton")
    ].filter(Boolean);

    buttons.forEach(button => {
        if (button.dataset.authBound === "true") {
            return;
        }

        button.dataset.authBound = "true";

        button.addEventListener("click", async event => {
            event.preventDefault();

            await signOut();
        });
    });
}

// ------------------------------------------------------------
// PASSWORD UPDATE FORM
// ------------------------------------------------------------

function bindPasswordUpdate() {
    const form =
        $("passwordUpdateForm") ||
        $("changePasswordForm");

    if (!form || form.dataset.authBound === "true") {
        return;
    }

    form.dataset.authBound = "true";

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const password =
            getInputValue("newPassword") ||
            getInputValue("changePassword");

        const confirmation =
            getInputValue("confirmNewPassword") ||
            getInputValue("confirmChangePassword");

        if (confirmation && password !== confirmation) {
            showToast(
                "Passwords do not match.",
                "error"
            );
            return;
        }

        try {
            await updatePassword(password);
        } catch (error) {
            // Already handled.
        }
    });
}

// ------------------------------------------------------------
// AUTH BUTTONS
// ------------------------------------------------------------

function bindDirectAuthButtons() {
    const signInButton =
        $("signInBtn");

    if (
        signInButton &&
        !signInButton.closest("form") &&
        signInButton.dataset.authBound !== "true"
    ) {
        signInButton.dataset.authBound = "true";

        signInButton.addEventListener("click", async event => {
            event.preventDefault();

            const email =
                getInputValue("loginEmail") ||
                getInputValue("email") ||
                getInputValue("signInEmail");

            const password =
                getInputValue("loginPassword") ||
                getInputValue("password") ||
                getInputValue("signInPassword");

            setLoading(
                signInButton,
                true,
                "Signing in..."
            );

            try {
                await signIn(email, password);
            } catch (error) {
                // Already handled.
            } finally {
                setLoading(
                    signInButton,
                    false
                );
            }
        });
    }

    const signUpButton =
        $("signUpBtn");

    if (
        signUpButton &&
        !signUpButton.closest("form") &&
        signUpButton.dataset.authBound !== "true"
    ) {
        signUpButton.dataset.authBound = "true";

        signUpButton.addEventListener("click", async event => {
            event.preventDefault();

            const fullName =
                getInputValue("signupName") ||
                getInputValue("fullName") ||
                getInputValue("name");

            const email =
                getInputValue("signupEmail") ||
                getInputValue("registerEmail");

            const password =
                getInputValue("signupPassword") ||
                getInputValue("registerPassword");

            setLoading(
                signUpButton,
                true,
                "Creating account..."
            );

            try {
                await signUp(
                    email,
                    password,
                    fullName
                );
            } catch (error) {
                // Already handled.
            } finally {
                setLoading(
                    signUpButton,
                    false
                );
            }
        });
    }
}

// ------------------------------------------------------------
// AUTH STATE CHANGE LISTENER
// ------------------------------------------------------------

function bindSupabaseAuthListener() {
    const client = getSupabase();

    if (!client) {
        return;
    }

    if (authState.authListenerBound) {
        return;
    }

    authState.authListenerBound = true;

    client.auth.onAuthStateChange(
        async (event, session) => {
            console.log(
                "Supabase auth event:",
                event
            );

            if (event === "SIGNED_OUT") {
                authState.loggedIn = false;
                authState.user = null;
                authState.session = null;
                authState.profile = null;
                authState.role = APP_CONFIG.defaultRole;
                authState.active = false;

                emit("authChanged", {
                    loggedIn: false,
                    user: null,
                    profile: null,
                    role: authState.role,
                    active: false
                });

                return;
            }

            if (
                event === "INITIAL_SESSION" ||
                event === "SIGNED_IN" ||
                event === "TOKEN_REFRESHED" ||
                event === "USER_UPDATED"
            ) {
                if (!session) {
                    return;
                }

                // INITIAL_SESSION and TOKEN_REFRESHED should not
                // create duplicate login records.
                const skipLoginRecord =
                    event !== "SIGNED_IN";

                try {
                    await applyAuthSession(
                        session,
                        {
                            skipLoginRecord
                        }
                    );
                } catch (error) {
                    console.error(
                        "Could not apply auth state:",
                        error
                    );
                }
            }
        }
    );
}

// ------------------------------------------------------------
// INITIALIZE AUTH
// ------------------------------------------------------------

async function initializeAuth() {
    if (authState.initialized) {
        return authState;
    }

    authState.initialized = true;

    bindLoginForm();
    bindSignupForm();
    bindAuthNavigation();
    bindForgotPassword();
    bindLogout();
    bindPasswordUpdate();
    bindDirectAuthButtons();
    bindSupabaseAuthListener();

    await loadSessionOnStartup();

    return authState;
}

// ------------------------------------------------------------
// APPROVAL HELPERS
// ------------------------------------------------------------

function isPendingApproval() {
    return (
        isLoggedIn() &&
        authState.active !== true &&
        !isAdmin()
    );
}

function getApprovalMessage() {
    if (!isPendingApproval()) {
        return "";
    }

    return (
        "Your account is waiting for admin approval. " +
        "Please wait until an administrator grants access."
    );
}

// ------------------------------------------------------------
// GLOBAL API
// ------------------------------------------------------------

window.authState = authState;
window.isLoggedIn = isLoggedIn;
window.getAuthState = getAuthState;
window.getAuthUser = getUser;
window.getAuthProfile = getProfile;
window.getAuthRole = getRole;
window.isAdmin = isAdmin;
window.isStaff = isStaff;
window.isReviewer = isReviewer;
window.isCoworker = isCoworker;
window.canAnnotate = canAnnotate;
window.isPendingApproval = isPendingApproval;
window.getApprovalMessage = getApprovalMessage;
window.signIn = signIn;
window.signUp = signUp;
window.signOut = signOut;
window.requestPasswordReset = requestPasswordReset;
window.updatePassword = updatePassword;

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

export {
    authState,

    initializeAuth,
    loadSessionOnStartup,

    signIn,
    signUp,
    signOut,

    requestPasswordReset,
    updatePassword,

    getUser,
    getSessionState as getSession,
    getProfile,
    getRole,

    getAuthState,
    isLoggedIn,
    isActive,
    isAdmin,
    isStaff,
    isReviewer,
    isCoworker,
    canAnnotate,

    isPendingApproval,
    getApprovalMessage,

    loadProfile,
    ensureProfile,

    showAuthScreen,
    showToast
};

// ------------------------------------------------------------
// AUTO INITIALIZATION
// ------------------------------------------------------------

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeAuth();
        },
        { once: true }
    );
} else {
    initializeAuth();
}
