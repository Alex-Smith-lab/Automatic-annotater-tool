// ============================================================
// ANNOTATION AI
// AUTHENTICATION MODULE
// ============================================================

import {
    APP_CONFIG,
    normalizeRole,
    isAdminRole,
    isStaffRole,
    isReviewerRole,
    canAnnotateRole
} from "./config.js";

import {
    getSupabase,
    getCurrentSession,
    getCurrentUser,
    signOutUser,
    onAuthStateChange,
    saveLocalSession,
    clearLocalSession,
    updateCloudStatus,
    isSupabaseReady
} from "./supabase.js";


// ============================================================
// AUTH STATE
// ============================================================

const authState = {
    user: null,
    session: null,
    profile: null,
    role: APP_CONFIG.defaultRole,
    initialized: false
};


// ============================================================
// DOM HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


// ============================================================
// STATUS
// ============================================================

function setAuthStatus(
    message,
    type = "info"
) {

    const element = $("authStatus");

    if (!element) {
        return;
    }

    element.textContent = message || "";

    element.dataset.type = type;

    element.classList.remove(
        "success",
        "error",
        "warning",
        "info"
    );

    element.classList.add(type);
}


// ============================================================
// GET ROLE FROM USER
// ============================================================

function getRoleFromUser(user) {

    if (!user) {
        return APP_CONFIG.defaultRole;
    }

    const metadata =
        user.user_metadata || {};

    const appMetadata =
        user.app_metadata || {};

    return normalizeRole(
        metadata.role ||
        metadata.user_role ||
        metadata.account_role ||
        appMetadata.role ||
        appMetadata.user_role ||
        APP_CONFIG.defaultRole
    );
}


// ============================================================
// UPDATE PROFILE UI
// ============================================================

function updateProfileUI() {

    const user = authState.user;

    if (!user) {
        return;
    }

    const metadata =
        user.user_metadata || {};

    const email =
        user.email || "";

    const name =
        metadata.full_name ||
        metadata.name ||
        metadata.display_name ||
        metadata.username ||
        email.split("@")[0] ||
        "User";

    const role =
        authState.role ||
        APP_CONFIG.defaultRole;


    // --------------------------------------------------------
    // AVATAR
    // --------------------------------------------------------

    const avatar =
        metadata.avatar_url ||
        metadata.avatar ||
        "";

    const profileAvatar =
        $("profileAvatar");

    if (profileAvatar) {

        if (avatar) {

            profileAvatar.src = avatar;

            profileAvatar.style.display =
                "block";

        } else {

            profileAvatar.removeAttribute(
                "src"
            );
        }
    }


    // --------------------------------------------------------
    // NAME
    // --------------------------------------------------------

    const profileName =
        $("profileName");

    if (profileName) {
        profileName.textContent = name;
    }


    // --------------------------------------------------------
    // ROLE
    // --------------------------------------------------------

    const profileRole =
        $("profileRole");

    if (profileRole) {
        profileRole.textContent = role;
    }


    // --------------------------------------------------------
    // LARGE PROFILE
    // --------------------------------------------------------

    const largeAvatar =
        $("profileLargeAvatar");

    if (largeAvatar && avatar) {
        largeAvatar.src = avatar;
    }


    const screenName =
        $("profileScreenName");

    if (screenName) {
        screenName.textContent = name;
    }


    const screenRole =
        $("profileScreenRole");

    if (screenRole) {
        screenRole.textContent = role;
    }


    const screenEmail =
        $("profileScreenEmail");

    if (screenEmail) {
        screenEmail.textContent = email;
    }
}


// ============================================================
// SHOW LOGGED OUT STATE
// ============================================================

function showLoggedOutUI() {

    const loginPage =
        $("loginPage");

    const loggedOut =
        $("authLoggedOut");

    const loggedIn =
        $("authLoggedIn");

    if (loginPage) {
        loginPage.style.display = "";
    }

    if (loggedOut) {
        loggedOut.style.display = "";
    }

    if (loggedIn) {
        loggedIn.style.display = "none";
    }


    // --------------------------------------------------------
    // MAIN APPLICATION
    // --------------------------------------------------------

    const mainApp =
        document.querySelector(
            "[data-authenticated-app]"
        );

    if (mainApp) {
        mainApp.style.display = "none";
    }


    document.body.classList.remove(
        "authenticated"
    );

    document.body.classList.add(
        "logged-out"
    );
}


// ============================================================
// SHOW LOGGED IN STATE
// ============================================================

function showLoggedInUI() {

    const loginPage =
        $("loginPage");

    const loggedOut =
        $("authLoggedOut");

    const loggedIn =
        $("authLoggedIn");

    if (loginPage) {
        loginPage.style.display = "";
    }

    if (loggedOut) {
        loggedOut.style.display = "none";
    }

    if (loggedIn) {
        loggedIn.style.display = "";
    }


    document.body.classList.remove(
        "logged-out"
    );

    document.body.classList.add(
        "authenticated"
    );


    updateProfileUI();
}


// ============================================================
// AUTHENTICATED APPLICATION HELPER
// ============================================================

export function isLoggedIn() {
    return Boolean(
        authState.user &&
        authState.session
    );
}


// ============================================================
// GETTERS
// ============================================================

export function getAuthState() {
    return authState;
}


export function getUser() {
    return authState.user;
}


export function getSession() {
    return authState.session;
}


export function getRole() {
    return authState.role;
}


export function getProfile() {
    return authState.profile;
}


export function isAdmin() {
    return isAdminRole(
        authState.role
    );
}


export function isStaff() {
    return isStaffRole(
        authState.role
    );
}


export function isReviewer() {
    return isReviewerRole(
        authState.role
    );
}


export function canAnnotate() {
    return canAnnotateRole(
        authState.role
    );
}


// ============================================================
// DISPATCH AUTH EVENT
// ============================================================

function dispatchAuthEvent(
    eventName
) {

    window.dispatchEvent(
        new CustomEvent(
            eventName,
            {
                detail: {
                    user:
                        authState.user,

                    session:
                        authState.session,

                    profile:
                        authState.profile,

                    role:
                        authState.role
                }
            }
        )
    );
}


// ============================================================
// APPLY SESSION
// ============================================================

async function applySession(
    session
) {

    authState.session =
        session || null;

    authState.user =
        session?.user || null;


    if (authState.user) {

        authState.role =
            getRoleFromUser(
                authState.user
            );

        authState.profile = {
            id:
                authState.user.id,

            email:
                authState.user.email,

            role:
                authState.role,

            metadata:
                authState.user.user_metadata ||
                {}
        };


        saveLocalSession(
            session
        );


        updateCloudStatus(
            "Cloud connected",
            true
        );

        showLoggedInUI();

        dispatchAuthEvent(
            "annotation-auth-login"
        );

    } else {

        authState.role =
            APP_CONFIG.defaultRole;

        authState.profile =
            null;

        clearLocalSession();

        updateCloudStatus(
            "Not signed in",
            false
        );

        showLoggedOutUI();

        dispatchAuthEvent(
            "annotation-auth-logout"
        );
    }
}


// ============================================================
// SIGN IN
// ============================================================

export async function signIn(
    email,
    password
) {

    const supabase =
        getSupabase();

    if (!supabase) {

        setAuthStatus(
            "Supabase is not configured. Add your Supabase project URL first.",
            "error"
        );

        return {
            success: false,
            error: new Error(
                "Supabase is not configured."
            )
        };
    }


    if (!email || !password) {

        setAuthStatus(
            "Enter your email and password.",
            "error"
        );

        return {
            success: false,
            error: new Error(
                "Email and password are required."
            )
        };
    }


    setAuthStatus(
        "Signing in...",
        "info"
    );


    try {

        const {
            data,
            error
        } =
            await supabase.auth.signInWithPassword(
                {
                    email:
                        String(email).trim(),

                    password:
                        String(password)
                }
            );


        if (error) {

            setAuthStatus(
                error.message ||
                "Sign in failed.",
                "error"
            );

            return {
                success: false,
                error
            };
        }


        await applySession(
            data.session
        );


        setAuthStatus(
            "Signed in successfully.",
            "success"
        );


        return {
            success: true,
            data
        };

    } catch (error) {

        console.error(
            "[Auth] Sign in error:",
            error
        );

        setAuthStatus(
            error.message ||
            "Unable to sign in.",
            "error"
        );

        return {
            success: false,
            error
        };
    }
}


// ============================================================
// SIGN UP
// ============================================================

export async function signUp(
    email,
    password
) {

    const supabase =
        getSupabase();

    if (!supabase) {

        setAuthStatus(
            "Supabase is not configured. Add your Supabase project URL first.",
            "error"
        );

        return {
            success: false,
            error: new Error(
                "Supabase is not configured."
            )
        };
    }


    if (!email || !password) {

        setAuthStatus(
            "Enter an email and password.",
            "error"
        );

        return {
            success: false,
            error: new Error(
                "Email and password are required."
            )
        };
    }


    if (String(password).length < 6) {

        setAuthStatus(
            "Password must contain at least 6 characters.",
            "error"
        );

        return {
            success: false,
            error: new Error(
                "Password is too short."
            )
        };
    }


    setAuthStatus(
        "Creating account...",
        "info"
    );


    try {

        const {
            data,
            error
        } =
            await supabase.auth.signUp(
                {
                    email:
                        String(email).trim(),

                    password:
                        String(password),

                    options: {
                        data: {
                            role:
                                APP_CONFIG.defaultRole
                        }
                    }
                }
            );


        if (error) {

            setAuthStatus(
                error.message ||
                "Account creation failed.",
                "error"
            );

            return {
                success: false,
                error
            };
        }


        if (
            data.user &&
            !data.session
        ) {

            setAuthStatus(
                "Account created. Check your email to confirm your account.",
                "success"
            );

        } else {

            await applySession(
                data.session
            );

            setAuthStatus(
                "Account created successfully.",
                "success"
            );
        }


        return {
            success: true,
            data
        };

    } catch (error) {

        console.error(
            "[Auth] Sign up error:",
            error
        );

        setAuthStatus(
            error.message ||
            "Unable to create account.",
            "error"
        );

        return {
            success: false,
            error
        };
    }
}


// ============================================================
// PASSWORD RESET REQUEST
// ============================================================

export async function requestPasswordReset(
    email
) {

    const supabase =
        getSupabase();

    if (!supabase) {

        setAuthStatus(
            "Supabase is not configured.",
            "error"
        );

        return {
            success: false,
            error: new Error(
                "Supabase is not configured."
            )
        };
    }


    if (!email) {

        setAuthStatus(
            "Enter your email address.",
            "error"
        );

        return {
            success: false,
            error: new Error(
                "Email is required."
            )
        };
    }


    setAuthStatus(
        "Sending password reset email...",
        "info"
    );


    try {

        const redirectUrl =
            `${window.location.origin}${window.location.pathname}`;


        const {
            error
        } =
            await supabase.auth.resetPasswordForEmail(
                String(email).trim(),
                {
                    redirectTo:
                        redirectUrl
                }
            );


        if (error) {

            setAuthStatus(
                error.message ||
                "Unable to send reset email.",
                "error"
            );

            return {
                success: false,
                error
            };
        }


        setAuthStatus(
            "Password reset email sent. Check your inbox.",
            "success"
        );


        return {
            success: true
        };

    } catch (error) {

        console.error(
            "[Auth] Password reset error:",
            error
        );

        setAuthStatus(
            error.message ||
            "Unable to send password reset email.",
            "error"
        );

        return {
            success: false,
            error
        };
    }
}


// ============================================================
// SAVE NEW PASSWORD
// ============================================================

export async function updatePassword(
    newPassword
) {

    const supabase =
        getSupabase();

    if (!supabase) {

        return {
            success: false,
            error: new Error(
                "Supabase is not configured."
            )
        };
    }


    if (
        !newPassword ||
        String(newPassword).length < 6
    ) {

        return {
            success: false,
            error: new Error(
                "Password must contain at least 6 characters."
            )
        };
    }


    try {

        const {
            data,
            error
        } =
            await supabase.auth.updateUser(
                {
                    password:
                        String(newPassword)
                }
            );


        if (error) {

            return {
                success: false,
                error
            };
        }


        return {
            success: true,
            data
        };

    } catch (error) {

        console.error(
            "[Auth] updatePassword error:",
            error
        );

        return {
            success: false,
            error
        };
    }
}


// ============================================================
// SIGN OUT
// ============================================================

export async function signOut() {

    try {

        const result =
            await signOutUser();

        if (result.error) {

            console.error(
                "[Auth] Sign out error:",
                result.error
            );
        }

    } catch (error) {

        console.error(
            "[Auth] Sign out exception:",
            error
        );
    }


    authState.user = null;
    authState.session = null;
    authState.profile = null;
    authState.role =
        APP_CONFIG.defaultRole;


    clearLocalSession();

    showLoggedOutUI();

    dispatchAuthEvent(
        "annotation-auth-logout"
    );
}


// ============================================================
// LOAD SESSION ON STARTUP
// ============================================================

export async function loadSessionOnStartup() {

    if (!isSupabaseReady()) {

        showLoggedOutUI();

        authState.initialized =
            true;

        return null;
    }


    try {

        const {
            session,
            error
        } =
            await getCurrentSession();


        if (error) {

            console.warn(
                "[Auth] Session restore warning:",
                error
            );
        }


        await applySession(
            session
        );


        authState.initialized =
            true;


        return session;

    } catch (error) {

        console.error(
            "[Auth] Session startup error:",
            error
        );

        authState.initialized =
            true;

        showLoggedOutUI();

        return null;
    }
}


// ============================================================
// AUTH STATE CHANGES
// ============================================================

function initializeAuthListener() {

    if (!isSupabaseReady()) {
        return;
    }


    onAuthStateChange(
        async (
            event,
            session
        ) => {

            console.log(
                "[Auth] State change:",
                event
            );


            if (
                event ===
                "SIGNED_IN"
            ) {

                await applySession(
                    session
                );

            } else if (
                event ===
                "SIGNED_OUT"
            ) {

                await applySession(
                    null
                );

            } else if (
                event ===
                "TOKEN_REFRESHED"
            ) {

                await applySession(
                    session
                );

            } else if (
                event ===
                "USER_UPDATED"
            ) {

                await applySession(
                    session
                );
            }
        }
    );
}


// ============================================================
// LOGIN FORM
// ============================================================

function initializeLoginForm() {

    const emailInput =
        $("authEmail");

    const passwordInput =
        $("authPassword");

    const signInButton =
        $("signInBtn");

    const signUpButton =
        $("signUpBtn");


    if (signInButton) {

        signInButton.addEventListener(
            "click",
            async (event) => {

                event.preventDefault();

                await signIn(
                    emailInput?.value || "",
                    passwordInput?.value || ""
                );
            }
        );
    }


    if (signUpButton) {

        signUpButton.addEventListener(
            "click",
            async (event) => {

                event.preventDefault();

                await signUp(
                    emailInput?.value || "",
                    passwordInput?.value || ""
                );
            }
        );
    }


    if (passwordInput) {

        passwordInput.addEventListener(
            "keydown",
            async (event) => {

                if (
                    event.key ===
                    "Enter"
                ) {

                    event.preventDefault();

                    await signIn(
                        emailInput?.value || "",
                        passwordInput?.value || ""
                    );
                }
            }
        );
    }
}


// ============================================================
// FORGOT PASSWORD
// ============================================================

function initializeForgotPassword() {

    const button =
        $("forgotPassword");

    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();

            const email =
                $("authEmail")?.value || "";


            if (!email) {

                setAuthStatus(
                    "Enter your email address first.",
                    "error"
                );

                $("authEmail")?.focus();

                return;
            }


            await requestPasswordReset(
                email
            );
        }
    );
}


// ============================================================
// LOGOUT BUTTON
// ============================================================

function initializeLogout() {

    const button =
        $("logoutBtn");

    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();

            await signOut();
        }
    );
}


// ============================================================
// PASSWORD RESET MODAL
// ============================================================

function initializePasswordResetModal() {

    const saveButton =
        $("saveNewPassword");

    if (!saveButton) {
        return;
    }


    saveButton.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();


            const password =
                $("newPassword")?.value ||
                "";

            const confirmation =
                $("confirmPassword")?.value ||
                "";

            const status =
                $("passwordResetStatus");


            if (!password) {

                if (status) {
                    status.textContent =
                        "Enter a new password.";
                }

                return;
            }


            if (
                password !==
                confirmation
            ) {

                if (status) {
                    status.textContent =
                        "Passwords do not match.";
                }

                return;
            }


            const result =
                await updatePassword(
                    password
                );


            if (!result.success) {

                if (status) {
                    status.textContent =
                        result.error?.message ||
                        "Unable to update password.";
                }

                return;
            }


            if (status) {
                status.textContent =
                    "Password updated successfully.";
            }


            const modal =
                $("passwordResetModal");

            if (modal) {

                setTimeout(
                    () => {

                        modal.style.display =
                            "none";

                    },
                    1000
                );
            }
        }
    );
}


// ============================================================
// PROFILE SIGN OUT
// ============================================================

function initializeProfileActions() {

    const signOutAction =
        $("profileSignOutAction");

    if (signOutAction) {

        signOutAction.addEventListener(
            "click",
            async (event) => {

                event.preventDefault();

                await signOut();
            }
        );
    }
}


// ============================================================
// INITIALIZE AUTH
// ============================================================

export async function initializeAuth() {

    initializeLoginForm();

    initializeForgotPassword();

    initializeLogout();

    initializePasswordResetModal();

    initializeProfileActions();

    initializeAuthListener();

    await loadSessionOnStartup();
}


// ============================================================
// COMPATIBILITY GLOBALS
// ============================================================
//
// Existing parts of the original application may call these
// functions directly. Keep them available globally so the
// modular version does not break those calls.
// ============================================================

window.loadSessionOnStartup =
    loadSessionOnStartup;

window.getCurrentUser =
    getUser;

window.getCurrentProfile =
    getProfile;

window.getCurrentRole =
    getRole;

window.isAdmin =
    isAdmin;

window.isStaff =
    isStaff;

window.isReviewer =
    isReviewer;

window.canAnnotate =
    canAnnotate;

window.signOut =
    signOut;

window.signOutUser =
    signOut;

window.signIn =
    signIn;

window.signUp =
    signUp;

window.requestPasswordReset =
    requestPasswordReset;

window.updatePassword =
    updatePassword;


// ============================================================
// UPLOAD COMPATIBILITY
// ============================================================
//
// The annotation module will provide the real upload
// permission logic. This temporary compatibility function
// prevents the old application from crashing before that
// module is loaded.
// ============================================================

window.canUseUpload = function () {

    return Boolean(
        authState.user
    );
};
