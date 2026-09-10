/* ============================================================
   AUTHENTICATION
   js/auth.js
============================================================ */

import {
    supabase,
    getSession,
    getCurrentUser,
    signOutUser,
    onAuthStateChange
} from "./supabase.js";

import {
    APP_CONFIG,
    ROLES,
    normalizeRole,
    isAdminRole,
    isReviewerRole,
    isStaffRole,
    canAnnotateRole,
    canUseUploadRole
} from "./config.js";


/* ============================================================
   AUTH STATE
============================================================ */

const authState = {

    user: null,

    session: null,

    profile: null,

    role:
        ROLES.CUSTOMER,

    initialized:
        false
};


/* ============================================================
   DOM
============================================================ */

const $ =
    id =>
        document.getElementById(id);


const loginPage =
    $("loginPage");

const appEl =
    document.querySelector(".app");

const authLoggedOut =
    $("authLoggedOut");

const authLoggedIn =
    $("authLoggedIn");

const authEmail =
    $("authEmail");

const authPassword =
    $("authPassword");

const authStatus =
    $("authStatus");

const signInBtn =
    $("signInBtn");

const signUpBtn =
    $("signUpBtn");

const forgotPassword =
    $("forgotPassword");

const logoutBtn =
    $("logoutBtn");

const approvalPage =
    $("approvalPage");

const approvalSignIn =
    $("approvalSignIn");

const profileName =
    $("profileName");

const profileRole =
    $("profileRole");

const profileAvatar =
    $("profileAvatar");

const cloudStatus =
    $("cloudStatus");

const adminButton =
    $("adminCenterButton");


/* ============================================================
   STATUS
============================================================ */

function setAuthStatus(
    message,
    type = "info"
) {

    if (!authStatus) {
        return;
    }


    authStatus.textContent =
        message;


    authStatus.dataset.status =
        type;
}


function setCloudStatus(
    message
) {

    if (!cloudStatus) {
        return;
    }


    cloudStatus.textContent =
        message;
}


/* ============================================================
   PROFILE NAME
============================================================ */

function getUserDisplayName(
    user,
    profile = null
) {

    if (profile) {

        return (
            profile.full_name ||
            profile.name ||
            profile.display_name ||
            profile.username ||
            user?.user_metadata?.full_name ||
            user?.email ||
            "User"
        );
    }


    return (
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email ||
        "User"
    );
}


/* ============================================================
   AVATAR INITIALS
============================================================ */

function getInitials(
    name
) {

    const clean =
        String(name || "User")
            .trim();


    if (!clean) {
        return "U";
    }


    const parts =
        clean.split(/\s+/);


    if (parts.length === 1) {

        return parts[0]
            .slice(0, 2)
            .toUpperCase();
    }


    return (
        parts[0][0] +
        parts[parts.length - 1][0]
    ).toUpperCase();
}


/* ============================================================
   UPDATE ACCOUNT UI
============================================================ */

function updateAccountUI() {

    const user =
        authState.user;

    const profile =
        authState.profile;

    const role =
        authState.role;


    if (!user) {

        if (authLoggedOut) {
            authLoggedOut.style.display =
                "";
        }

        if (authLoggedIn) {
            authLoggedIn.style.display =
                "none";
        }

        if (adminButton) {
            adminButton.style.display =
                "none";
        }

        return;
    }


    const name =
        getUserDisplayName(
            user,
            profile
        );


    if (authLoggedOut) {
        authLoggedOut.style.display =
            "none";
    }


    if (authLoggedIn) {
        authLoggedIn.style.display =
            "";
    }


    if (profileName) {
        profileName.textContent =
            name;
    }


    if (profileRole) {
        profileRole.textContent =
            formatRole(role);
    }


    if (profileAvatar) {

        const avatar =
            profile?.avatar_url ||
            user?.user_metadata?.avatar_url;


        if (avatar) {

            profileAvatar.style.backgroundImage =
                `url("${avatar}")`;

            profileAvatar.textContent =
                "";

        } else {

            profileAvatar.style.backgroundImage =
                "";

            profileAvatar.textContent =
                getInitials(name);
        }
    }


    if (adminButton) {

        adminButton.style.display =
            isAdminRole(role)
                ? ""
                : "none";
    }
}


/* ============================================================
   FORMAT ROLE
============================================================ */

function formatRole(
    role
) {

    const normalized =
        normalizeRole(role);


    return normalized
        .replace(/_/g, " ")
        .replace(/\b\w/g, char =>
            char.toUpperCase()
        );
}


/* ============================================================
   LOAD PROFILE
============================================================ */

export async function loadCurrentProfile(
    user = authState.user
) {

    if (!user) {

        authState.profile =
            null;

        authState.role =
            ROLES.CUSTOMER;

        return null;
    }


    /*
     * The original uploaded source does not contain the
     * database profile query/table definition.
     *
     * We first use Supabase user metadata so authentication
     * itself does not break.
     */

    const metadata =
        user.user_metadata || {};


    authState.profile = {
        id:
            user.id,

        email:
            user.email || "",

        full_name:
            metadata.full_name ||
            metadata.name ||
            "",

        name:
            metadata.name ||
            "",

        display_name:
            metadata.display_name ||
            "",

        avatar_url:
            metadata.avatar_url ||
            "",

        role:
            metadata.role ||
            ROLES.CUSTOMER
    };


    authState.role =
        normalizeRole(
            authState.profile.role
        );


    updateAccountUI();


    return authState.profile;
}


/* ============================================================
   SIGN IN
============================================================ */

export async function signIn() {

    if (!supabase) {

        setAuthStatus(
            "Supabase is not configured. Add your existing project URL and anon key to js/config.js.",
            "error"
        );

        return;
    }


    const email =
        authEmail?.value
            ?.trim();


    const password =
        authPassword?.value || "";


    if (!email) {

        setAuthStatus(
            "Enter your email address.",
            "error"
        );

        authEmail?.focus();

        return;
    }


    if (!password) {

        setAuthStatus(
            "Enter your password.",
            "error"
        );

        authPassword?.focus();

        return;
    }


    setAuthStatus(
        "Signing in…",
        "loading"
    );


    if (signInBtn) {
        signInBtn.disabled =
            true;
    }


    try {

        const {
            data,
            error
        } =
            await supabase.auth.signInWithPassword({
                email,
                password
            });


        if (error) {
            throw error;
        }


        authState.session =
            data?.session || null;

        authState.user =
            data?.user || null;


        await loadCurrentProfile();


        setAuthStatus(
            "Signed in successfully.",
            "success"
        );


        await showAuthenticatedApp();


    } catch (error) {

        console.error(
            "[Auth] Sign in failed:",
            error
        );


        setAuthStatus(
            error?.message ||
            "Unable to sign in.",
            "error"
        );

    } finally {

        if (signInBtn) {
            signInBtn.disabled =
                false;
        }
    }
}


/* ============================================================
   CREATE ACCOUNT
============================================================ */

export async function signUp() {

    if (!supabase) {

        setAuthStatus(
            "Supabase is not configured.",
            "error"
        );

        return;
    }


    const email =
        authEmail?.value
            ?.trim();


    const password =
        authPassword?.value || "";


    if (!email) {

        setAuthStatus(
            "Enter your email address.",
            "error"
        );

        return;
    }


    if (!password) {

        setAuthStatus(
            "Enter a password.",
            "error"
        );

        return;
    }


    if (password.length < 6) {

        setAuthStatus(
            "Password must contain at least 6 characters.",
            "error"
        );

        return;
    }


    if (signUpBtn) {
        signUpBtn.disabled =
            true;
    }


    setAuthStatus(
        "Creating account…",
        "loading"
    );


    try {

        const {
            data,
            error
        } =
            await supabase.auth.signUp({

                email,

                password,

                options: {
                    data: {
                        role:
                            ROLES.CUSTOMER
                    }
                }
            });


        if (error) {
            throw error;
        }


        /*
         * Depending on Supabase email-confirmation settings,
         * session can be null after signup.
         */

        if (data?.session) {

            authState.session =
                data.session;

            authState.user =
                data.user;

            await loadCurrentProfile();

            await showAuthenticatedApp();

            setAuthStatus(
                "Account created successfully.",
                "success"
            );

        } else {

            setAuthStatus(
                "Account created. Check your email to confirm your account.",
                "success"
            );
        }


    } catch (error) {

        console.error(
            "[Auth] Sign up failed:",
            error
        );


        setAuthStatus(
            error?.message ||
            "Unable to create account.",
            "error"
        );

    } finally {

        if (signUpBtn) {
            signUpBtn.disabled =
                false;
        }
    }
}


/* ============================================================
   PASSWORD RESET
============================================================ */

export async function requestPasswordReset() {

    if (!supabase) {

        setAuthStatus(
            "Supabase is not configured.",
            "error"
        );

        return;
    }


    const email =
        authEmail?.value
            ?.trim();


    if (!email) {

        setAuthStatus(
            "Enter your email address first.",
            "error"
        );

        authEmail?.focus();

        return;
    }


    setAuthStatus(
        "Sending password reset email…",
        "loading"
    );


    try {

        const redirectUrl =
            `${window.location.origin}${window.location.pathname}`;


        const {
            error
        } =
            await supabase.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo:
                        redirectUrl
                }
            );


        if (error) {
            throw error;
        }


        setAuthStatus(
            "Password reset instructions have been sent to your email.",
            "success"
        );


    } catch (error) {

        console.error(
            "[Auth] Password reset failed:",
            error
        );


        setAuthStatus(
            error?.message ||
            "Unable to send password reset email.",
            "error"
        );
    }
}


/* ============================================================
   SIGN OUT
============================================================ */

export async function signOut() {

    try {

        await signOutUser();

    } catch (error) {

        console.warn(
            "[Auth] Sign out:",
            error
        );
    }


    authState.user =
        null;

    authState.session =
        null;

    authState.profile =
        null;

    authState.role =
        ROLES.CUSTOMER;


    if (authEmail) {
        authEmail.value =
            "";
    }


    if (authPassword) {
        authPassword.value =
            "";
    }


    showLoginPage();
}


/* ============================================================
   SHOW LOGIN
============================================================ */

export function showLoginPage() {

    if (loginPage) {
        loginPage.style.display =
            "";
    }


    if (appEl) {
        appEl.style.display =
            "none";
    }


    if (approvalPage) {
        approvalPage.style.display =
            "none";
    }


    if (authLoggedOut) {
        authLoggedOut.style.display =
            "";
    }


    if (authLoggedIn) {
        authLoggedIn.style.display =
            "none";
    }


    if (adminButton) {
        adminButton.style.display =
            "none";
    }


    setCloudStatus(
        "Signed out."
    );
}


/* ============================================================
   SHOW AUTHENTICATED APP
============================================================ */

export async function showAuthenticatedApp() {

    if (!authState.user) {

        showLoginPage();

        return;
    }


    if (loginPage) {
        loginPage.style.display =
            "none";
    }


    if (approvalPage) {
        approvalPage.style.display =
            "none";
    }


    if (appEl) {
        appEl.style.display =
            "";
    }


    updateAccountUI();


    setCloudStatus(
        "Connected to cloud."
    );


    document.dispatchEvent(
        new CustomEvent(
            "annotation-auth-ready",
            {
                detail: {
                    user:
                        authState.user,

                    profile:
                        authState.profile,

                    role:
                        authState.role
                }
            }
        )
    );
}


/* ============================================================
   SESSION STARTUP
============================================================ */

export async function loadSessionOnStartup() {

    if (!supabase) {

        showLoginPage();

        setAuthStatus(
            "Supabase connection is not configured.",
            "error"
        );

        authState.initialized =
            true;

        return null;
    }


    try {

        const session =
            await getSession();


        if (!session) {

            showLoginPage();

            authState.initialized =
                true;

            return null;
        }


        authState.session =
            session;

        authState.user =
            session.user;


        await loadCurrentProfile();


        await showAuthenticatedApp();


        authState.initialized =
            true;


        return session;


    } catch (error) {

        console.error(
            "[Auth] Session restore failed:",
            error
        );


        showLoginPage();

        authState.initialized =
            true;

        return null;
    }
}


/* ============================================================
   AUTH STATE LISTENER
============================================================ */

function initializeAuthListener() {

    if (!supabase) {
        return;
    }


    onAuthStateChange(
        async (
            event,
            session
        ) => {

            console.log(
                "[Auth]",
                event
            );


            if (
                event ===
                "SIGNED_OUT"
            ) {

                authState.user =
                    null;

                authState.session =
                    null;

                authState.profile =
                    null;

                authState.role =
                    ROLES.CUSTOMER;

                showLoginPage();

                return;
            }


            if (session?.user) {

                authState.session =
                    session;

                authState.user =
                    session.user;


                /*
                 * Avoid unnecessarily reloading everything during
                 * token refresh.
                 */

                if (
                    !authState.profile ||
                    event === "SIGNED_IN"
                ) {

                    await loadCurrentProfile();
                }


                await showAuthenticatedApp();
            }
        }
    );
}


/* ============================================================
   ROLE / PERMISSION API
============================================================ */

export function getAuthState() {

    return {
        ...authState
    };
}


export function getCurrentRole() {

    return authState.role;
}


export function isAdmin() {

    return isAdminRole(
        authState.role
    );
}


export function isReviewer() {

    return isReviewerRole(
        authState.role
    );
}


export function isStaff() {

    return isStaffRole(
        authState.role
    );
}


export function canAnnotate() {

    return canAnnotateRole(
        authState.role
    );
}


export function canUseUpload() {

    return canUseUploadRole(
        authState.role
    );
}


/* ============================================================
   GLOBAL COMPATIBILITY
   Existing annotation code calls these functions directly.
============================================================ */

window.loadSessionOnStartup =
    loadSessionOnStartup;

window.canUseUpload =
    canUseUpload;

window.getCurrentProfile =
    () =>
        authState.profile;

window.getCurrentUser =
    () =>
        authState.user;

window.getCurrentRole =
    getCurrentRole;

window.isAdmin =
    isAdmin;

window.isReviewer =
    isReviewer;

window.isStaff =
    isStaff;

window.canAnnotate =
    canAnnotate;

window.signOut =
    signOut;


/* ============================================================
   BUTTON EVENTS
============================================================ */

function bindAuthButtons() {

    signInBtn?.addEventListener(
        "click",
        signIn
    );


    signUpBtn?.addEventListener(
        "click",
        signUp
    );


    forgotPassword?.addEventListener(
        "click",
        requestPasswordReset
    );


    logoutBtn?.addEventListener(
        "click",
        signOut
    );


    approvalSignIn?.addEventListener(
        "click",
        () => {

            if (approvalPage) {
                approvalPage.style.display =
                    "none";
            }

            showLoginPage();
        }
    );


    authPassword?.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                signIn();
            }
        }
    );


    authEmail?.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                signIn();
            }
        }
    );
}


/* ============================================================
   INITIALIZE
============================================================ */

export async function initializeAuth() {

    bindAuthButtons();

    initializeAuthListener();

    await loadSessionOnStartup();
}


/* ============================================================
   AUTO START
============================================================ */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeAuth,
        {
            once: true
        }
    );

} else {

    initializeAuth();
}


/* ============================================================
   PUBLIC API
============================================================ */

export {
    authState
};
