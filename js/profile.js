/* ============================================================
   PROFILE.JS
   ANNOTATION AI

   Handles:
   - Profile modal
   - Profile information
   - Avatar
   - Settings action
   - Work history action
   - Sign out action
   - Password reset modal
   - Profile UI refresh
============================================================ */

import {
    supabase,
    getCurrentUser,
    signOut
} from "./supabase.js";


/* ============================================================
   DOM
============================================================ */

const $ = id =>
    document.getElementById(id);


/* ------------------------------------------------------------
   Navigation / Profile
------------------------------------------------------------ */

const profileButton =
    $("profileButton");

const profileModal =
    $("profileModal");

const closeProfileModal =
    $("closeProfileModal");

const profileLargeAvatar =
    $("profileLargeAvatar");

const profileScreenName =
    $("profileScreenName");

const profileScreenRole =
    $("profileScreenRole");

const profileScreenEmail =
    $("profileScreenEmail");

const profileHistoryAction =
    $("profileHistoryAction");

const profileSettingsAction =
    $("profileSettingsAction");

const profileSignOutAction =
    $("profileSignOutAction");


/* ------------------------------------------------------------
   Login profile elements
------------------------------------------------------------ */

const profileAvatar =
    $("profileAvatar");

const profileName =
    $("profileName");

const profileRole =
    $("profileRole");

const changeAvatarButton =
    $("changeAvatarBtn");

const avatarInput =
    $("avatarInput");


/* ------------------------------------------------------------
   Password reset
------------------------------------------------------------ */

const passwordResetModal =
    $("passwordResetModal");

const newPassword =
    $("newPassword");

const confirmPassword =
    $("confirmPassword");

const saveNewPassword =
    $("saveNewPassword");

const passwordResetStatus =
    $("passwordResetStatus");


/* ============================================================
   STATE
============================================================ */

const profileState = {

    initialized:
        false,

    user:
        null,

    profile:
        null,

    avatarURL:
        null,

    passwordResetOpen:
        false
};


/* ============================================================
   ROLE LABELS
============================================================ */

const ROLE_LABELS = {

    customer:
        "Customer",

    reviewer:
        "Reviewer",

    staff:
        "Staff",

    admin:
        "Admin",

    coworker:
        "Coworker",

    coworker_2d_box:
        "Coworker — 2D Box",

    coworker_polygon:
        "Coworker — Polygon",

    coworker_segmentation:
        "Coworker — Segmentation"
};


/* ============================================================
   ESCAPE HTML
============================================================ */

function escapeHTML(
    value
) {

    return String(
        value ??
        ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


/* ============================================================
   GET USER
============================================================ */

async function loadProfileUser() {

    try {

        const user =
            await getCurrentUser();

        profileState.user =
            user ||
            null;

        return user ||
            null;

    } catch (error) {

        console.warn(
            "Could not load current user:",
            error
        );

        profileState.user =
            null;

        return null;
    }
}


/* ============================================================
   GET ROLE
============================================================ */

function getUserRole(
    user
) {

    if (!user) {
        return "customer";
    }


    const metadata =
        user.user_metadata ||
        {};

    const appMetadata =
        user.app_metadata ||
        {};


    const role =
        metadata.role ||
        appMetadata.role ||
        window.currentUserRole ||
        window.CLOUD?.profile?.role ||
        "customer";


    return String(
        role
    )
        .trim()
        .toLowerCase();
}


/* ============================================================
   GET DISPLAY NAME
============================================================ */

function getDisplayName(
    user
) {

    if (!user) {
        return "User";
    }


    const metadata =
        user.user_metadata ||
        {};


    return (
        metadata.full_name ||
        metadata.name ||
        metadata.display_name ||
        metadata.screen_name ||
        user.email?.split("@")[0] ||
        "User"
    );
}


/* ============================================================
   GET AVATAR
============================================================ */

function getAvatarURL(
    user
) {

    if (!user) {
        return null;
    }


    const metadata =
        user.user_metadata ||
        {};


    return (
        metadata.avatar_url ||
        metadata.avatar ||
        metadata.picture ||
        window.CLOUD?.profile?.avatar_url ||
        window.CLOUD?.profile?.avatar ||
        null
    );
}


/* ============================================================
   AVATAR FALLBACK
============================================================ */

function avatarFallback(
    name
) {

    const clean =
        String(
            name ||
            "U"
        )
            .trim();


    if (!clean) {
        return "U";
    }


    const parts =
        clean.split(
            /\s+/
        );


    if (
        parts.length >= 2
    ) {

        return (
            parts[0][0] +
            parts[
                parts.length - 1
            ][0]
        )
            .toUpperCase();
    }


    return clean[0]
        .toUpperCase();
}


/* ============================================================
   SET AVATAR ELEMENT
============================================================ */

function setAvatarElement(
    element,
    avatarURL,
    name
) {

    if (!element) {
        return;
    }


    if (avatarURL) {

        element.style.backgroundImage =
            `url("${String(
                avatarURL
            ).replaceAll(
                '"',
                "%22"
            )}")`;

        element.style.backgroundSize =
            "cover";

        element.style.backgroundPosition =
            "center";

        element.dataset.avatar =
            avatarURL;

        /*
         * If this is an <img>, also set src.
         */

        if (
            element.tagName ===
            "IMG"
        ) {

            element.src =
                avatarURL;

            element.alt =
                `${name || "User"} avatar`;
        }


        /*
         * Hide text fallback when possible.
         */

        if (
            "textContent" in
            element &&
            element.tagName !==
            "IMG"
        ) {

            element.textContent =
                "";
        }

        return;
    }


    /*
     * Remove background image
     */

    element.style.backgroundImage =
        "";


    if (
        element.tagName ===
        "IMG"
    ) {

        /*
         * Don't keep a broken image URL.
         */

        element.removeAttribute(
            "src"
        );

        element.alt =
            `${name || "User"} avatar`;

        return;
    }


    element.textContent =
        avatarFallback(
            name
        );
}


/* ============================================================
   REFRESH PROFILE UI
============================================================ */

async function refreshProfileUI() {

    const user =
        await loadProfileUser();


    if (!user) {

        profileState.avatarURL =
            null;

        if (profileName) {
            profileName.textContent =
                "Guest";
        }

        if (profileRole) {
            profileRole.textContent =
                "";
        }

        return null;
    }


    const name =
        getDisplayName(
            user
        );

    const role =
        getUserRole(
            user
        );

    const roleLabel =
        ROLE_LABELS[
            role
        ] ||
        role;

    const email =
        user.email ||
        "";

    const avatarURL =
        getAvatarURL(
            user
        );


    profileState.avatarURL =
        avatarURL;


    /* --------------------------------------------------------
       Header / account profile
    -------------------------------------------------------- */

    if (profileName) {

        profileName.textContent =
            name;
    }


    if (profileRole) {

        profileRole.textContent =
            roleLabel;
    }


    setAvatarElement(
        profileAvatar,
        avatarURL,
        name
    );


    /* --------------------------------------------------------
       Profile modal
    -------------------------------------------------------- */

    if (profileScreenName) {

        profileScreenName.textContent =
            name;
    }


    if (profileScreenRole) {

        profileScreenRole.textContent =
            roleLabel;
    }


    if (profileScreenEmail) {

        profileScreenEmail.textContent =
            email;
    }


    setAvatarElement(
        profileLargeAvatar,
        avatarURL,
        name
    );


    /*
     * Make profile information available
     * to the rest of the application.
     */

    window.currentUser =
        user;

    window.currentUserRole =
        role;


    return user;
}


/* ============================================================
   OPEN PROFILE
============================================================ */

async function openProfile() {

    const user =
        await refreshProfileUI();


    if (!user) {

        /*
         * If not logged in, let the normal auth
         * system handle the login screen.
         */

        return false;
    }


    if (profileModal) {

        profileModal.style.display =
            "flex";

        profileModal.classList.add(
            "open"
        );

        profileModal.setAttribute(
            "aria-hidden",
            "false"
        );
    }


    return true;
}


/* ============================================================
   CLOSE PROFILE
============================================================ */

function closeProfile() {

    if (!profileModal) {
        return;
    }


    profileModal.classList.remove(
        "open"
    );


    profileModal.style.display =
        "none";


    profileModal.setAttribute(
        "aria-hidden",
        "true"
    );
}


/* ============================================================
   OPEN PASSWORD RESET
============================================================ */

function openPasswordReset() {

    if (!passwordResetModal) {
        return;
    }


    profileState.passwordResetOpen =
        true;


    passwordResetModal.style.display =
        "flex";


    passwordResetModal.classList.add(
        "open"
    );


    passwordResetModal.setAttribute(
        "aria-hidden",
        "false"
    );


    if (passwordResetStatus) {

        passwordResetStatus.textContent =
            "";
    }


    if (newPassword) {

        newPassword.value =
            "";
    }


    if (confirmPassword) {

        confirmPassword.value =
            "";
    }


    setTimeout(
        () => {
            newPassword?.focus();
        },
        50
    );
}


/* ============================================================
   CLOSE PASSWORD RESET
============================================================ */

function closePasswordReset() {

    if (!passwordResetModal) {
        return;
    }


    profileState.passwordResetOpen =
        false;


    passwordResetModal.classList.remove(
        "open"
    );


    passwordResetModal.style.display =
        "none";


    passwordResetModal.setAttribute(
        "aria-hidden",
        "true"
    );
}


/* ============================================================
   PASSWORD STATUS
============================================================ */

function setPasswordStatus(
    message,
    type = "info"
) {

    if (!passwordResetStatus) {
        return;
    }


    passwordResetStatus.textContent =
        message || "";


    passwordResetStatus.dataset.type =
        type;
}


/* ============================================================
   CHANGE PASSWORD
============================================================ */

async function changePassword() {

    if (!supabase) {

        setPasswordStatus(
            "Supabase is not configured.",
            "error"
        );

        return false;
    }


    const password =
        newPassword?.value ||
        "";

    const confirmation =
        confirmPassword?.value ||
        "";


    if (
        password.length <
        6
    ) {

        setPasswordStatus(
            "Password must contain at least 6 characters.",
            "error"
        );

        return false;
    }


    if (
        password !==
        confirmation
    ) {

        setPasswordStatus(
            "Passwords do not match.",
            "error"
        );

        return false;
    }


    setPasswordStatus(
        "Saving password...",
        "info"
    );


    try {

        const {
            error
        } =
            await supabase.auth
                .updateUser({
                    password
                });


        if (error) {
            throw error;
        }


        setPasswordStatus(
            "Password changed successfully.",
            "success"
        );


        if (
            typeof window.showToast ===
            "function"
        ) {

            window.showToast(
                "Password changed successfully."
            );
        }


        setTimeout(
            () => {
                closePasswordReset();
            },
            1200
        );


        return true;

    } catch (error) {

        console.error(
            "Password change failed:",
            error
        );


        setPasswordStatus(
            error?.message ||
            "Could not change password.",
            "error"
        );


        return false;
    }
}


/* ============================================================
   AVATAR FILE VALIDATION
============================================================ */

function validateAvatarFile(
    file
) {

    if (!file) {
        return false;
    }


    if (
        !file.type.startsWith(
            "image/"
        )
    ) {

        return false;
    }


    /*
     * Keep profile images reasonably small.
     */

    const maxSize =
        5 *
        1024 *
        1024;


    if (
        file.size >
        maxSize
    ) {

        return false;
    }


    return true;
}


/* ============================================================
   LOCAL AVATAR PREVIEW
============================================================ */

function previewAvatar(
    file
) {

    if (
        !validateAvatarFile(
            file
        )
    ) {

        if (
            typeof window.showToast ===
            "function"
        ) {

            window.showToast(
                "Please select an image smaller than 5 MB."
            );
        }

        return false;
    }


    const url =
        URL.createObjectURL(
            file
        );


    profileState.avatarURL =
        url;


    const user =
        profileState.user;


    const name =
        getDisplayName(
            user
        );


    setAvatarElement(
        profileAvatar,
        url,
        name
    );


    setAvatarElement(
        profileLargeAvatar,
        url,
        name
    );


    /*
     * Do not upload automatically.
     * Uploading requires a configured storage bucket
     * and appropriate RLS policies.
     */

    return true;
}


/* ============================================================
   UPLOAD AVATAR TO SUPABASE STORAGE
============================================================ */

async function uploadAvatar(
    file
) {

    const user =
        profileState.user ||
        await loadProfileUser();


    if (!user) {

        throw new Error(
            "You must be signed in."
        );
    }


    if (
        !validateAvatarFile(
            file
        )
    ) {

        throw new Error(
            "Invalid avatar image."
        );
    }


    if (!supabase) {

        throw new Error(
            "Supabase is not configured."
        );
    }


    /*
     * Storage bucket can be customized
     * from the page if necessary.
     */

    const bucket =
        window.APP_AVATAR_BUCKET ||
        "avatars";


    const extension =
        file.name
            .split(".")
            .pop()
            ?.toLowerCase() ||
        "jpg";


    const path =
        `${user.id}/avatar-${Date.now()}.${extension}`;


    const {
        error: uploadError
    } =
        await supabase.storage
            .from(
                bucket
            )
            .upload(
                path,
                file,
                {
                    cacheControl:
                        "3600",

                    upsert:
                        true,

                    contentType:
                        file.type
                }
            );


    if (uploadError) {
        throw uploadError;
    }


    const {
        data
    } =
        supabase.storage
            .from(
                bucket
            )
            .getPublicUrl(
                path
            );


    const publicURL =
        data?.publicUrl ||
        null;


    if (!publicURL) {

        throw new Error(
            "Avatar uploaded but no public URL was returned."
        );
    }


    /*
     * Save the avatar URL in user metadata.
     */

    const {
        error: updateError
    } =
        await supabase.auth
            .updateUser({
                data: {
                    avatar_url:
                        publicURL
                }
            });


    if (updateError) {
        throw updateError;
    }


    profileState.avatarURL =
        publicURL;


    /*
     * Update local profile UI.
     */

    const name =
        getDisplayName(
            user
        );


    setAvatarElement(
        profileAvatar,
        publicURL,
        name
    );


    setAvatarElement(
        profileLargeAvatar,
        publicURL,
        name
    );


    return publicURL;
}


/* ============================================================
   HANDLE AVATAR CHANGE
============================================================ */

async function handleAvatarChange(
    file
) {

    if (!file) {
        return false;
    }


    /*
     * Show immediate preview.
     */

    previewAvatar(
        file
    );


    try {

        const url =
            await uploadAvatar(
                file
            );


        if (
            typeof window.showToast ===
            "function"
        ) {

            window.showToast(
                "Profile picture updated."
            );
        }


        return url;

    } catch (error) {

        console.error(
            "Avatar upload failed:",
            error
        );


        if (
            typeof window.showToast ===
            "function"
        ) {

            window.showToast(
                error?.message ||
                "Could not update profile picture."
            );
        }


        /*
         * Refresh from the actual saved
         * account state if upload failed.
         */

        await refreshProfileUI();


        return false;
    }
}


/* ============================================================
   SETTINGS ACTION
============================================================ */

function openSettings() {

    /*
     * The main app may already provide a settings
     * implementation. Use it if available.
     */

    const candidates = [
        window.openSettings,
        window.showSettings,
        window.openAppSettings
    ];


    const handler =
        candidates.find(
            fn =>
                typeof fn ===
                "function"
        );


    if (handler) {

        handler();

        return true;
    }


    /*
     * Fall back to the existing settings button.
     */

    const settingsButton =
        $("settingsButton");


    if (
        settingsButton &&
        settingsButton !==
            profileSettingsAction
    ) {

        settingsButton.click();

        return true;
    }


    return false;
}


/* ============================================================
   WORK HISTORY ACTION
============================================================ */

function openWorkHistory() {

    /*
     * Prefer exported/global history functions
     * when the history module is connected.
     */

    const candidates = [
        window.openWorkHistory,
        window.showWorkHistory,
        window.openHistory
    ];


    const handler =
        candidates.find(
            fn =>
                typeof fn ===
                "function"
        );


    if (handler) {

        handler();

        return true;
    }


    /*
     * Fall back to the existing navigation button.
     */

    const historyButton =
        $("workHistoryButton");


    if (
        historyButton &&
        historyButton !==
            profileHistoryAction
    ) {

        historyButton.click();

        return true;
    }


    return false;
}


/* ============================================================
   SIGN OUT
============================================================ */

async function profileSignOut() {

    try {

        if (
            typeof signOut ===
            "function"
        ) {

            await signOut();

        } else if (
            supabase
        ) {

            await supabase.auth.signOut();
        }


        closeProfile();


        /*
         * Let the auth module decide whether
         * to display login/home.
         */

        window.dispatchEvent(
            new CustomEvent(
                "auth:changed",
                {
                    detail: {
                        user:
                            null
                    }
                }
            )
        );


        window.dispatchEvent(
            new CustomEvent(
                "authChanged",
                {
                    detail: {
                        user:
                            null
                    }
                }
            )
        );


        return true;

    } catch (error) {

        console.error(
            "Sign out failed:",
            error
        );


        if (
            typeof window.showToast ===
            "function"
        ) {

            window.showToast(
                error?.message ||
                "Could not sign out."
            );
        }


        return false;
    }
}


/* ============================================================
   CLICK OUTSIDE PROFILE MODAL
============================================================ */

function handleProfileModalClick(
    event
) {

    if (
        event.target ===
        profileModal
    ) {

        closeProfile();
    }


    if (
        event.target ===
        passwordResetModal
    ) {

        closePasswordReset();
    }
}


/* ============================================================
   KEYBOARD
============================================================ */

function handleProfileKeyboard(
    event
) {

    if (
        event.key !==
        "Escape"
    ) {
        return;
    }


    if (
        profileState.passwordResetOpen
    ) {

        closePasswordReset();

        return;
    }


    if (
        profileModal?.classList.contains(
            "open"
        )
    ) {

        closeProfile();
    }
}


/* ============================================================
   AUTH CHANGE
============================================================ */

async function handleAuthChanged(
    event
) {

    const user =
        event?.detail?.user;


    if (
        user ===
        null
    ) {

        profileState.user =
            null;

        profileState.profile =
            null;

        profileState.avatarURL =
            null;

        closeProfile();

        return;
    }


    await refreshProfileUI();
}


/* ============================================================
   EVENT BINDING
============================================================ */

function bindProfileEvents() {

    if (
        profileState.initialized
    ) {
        return;
    }


    profileState.initialized =
        true;


    /* --------------------------------------------------------
       PROFILE BUTTON
    -------------------------------------------------------- */

    profileButton?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await openProfile();
        }
    );


    /* --------------------------------------------------------
       CLOSE PROFILE
    -------------------------------------------------------- */

    closeProfileModal?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            closeProfile();
        }
    );


    /* --------------------------------------------------------
       PROFILE MODAL
    -------------------------------------------------------- */

    profileModal?.addEventListener(
        "click",
        handleProfileModalClick
    );


    /* --------------------------------------------------------
       CHANGE AVATAR BUTTON
    -------------------------------------------------------- */

    changeAvatarButton?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            avatarInput?.click();
        }
    );


    /* --------------------------------------------------------
       AVATAR INPUT
    -------------------------------------------------------- */

    avatarInput?.addEventListener(
        "change",
        async event => {

            const file =
                event.target
                    ?.files?.[0];


            if (!file) {
                return;
            }


            await handleAvatarChange(
                file
            );


            /*
             * Allow selecting the same file again.
             */

            event.target.value =
                "";
        }
    );


    /* --------------------------------------------------------
       WORK HISTORY
    -------------------------------------------------------- */

    profileHistoryAction?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            closeProfile();

            openWorkHistory();
        }
    );


    /* --------------------------------------------------------
       SETTINGS
    -------------------------------------------------------- */

    profileSettingsAction?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            closeProfile();

            openSettings();
        }
    );


    /* --------------------------------------------------------
       SIGN OUT
    -------------------------------------------------------- */

    profileSignOutAction?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await profileSignOut();
        }
    );


    /* --------------------------------------------------------
       PASSWORD RESET
    -------------------------------------------------------- */

    saveNewPassword?.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            await changePassword();
        }
    );


    /* --------------------------------------------------------
       ENTER TO SAVE PASSWORD
    -------------------------------------------------------- */

    passwordResetModal?.addEventListener(
        "keydown",
        async event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                await changePassword();
            }
        }
    );


    /* --------------------------------------------------------
       KEYBOARD
    -------------------------------------------------------- */

    document.addEventListener(
        "keydown",
        handleProfileKeyboard
    );


    /* --------------------------------------------------------
       AUTH EVENTS
    -------------------------------------------------------- */

    window.addEventListener(
        "auth:changed",
        handleAuthChanged
    );


    window.addEventListener(
        "authChanged",
        handleAuthChanged
    );


    /*
     * Some auth modules dispatch a custom
     * "user:changed" event.
     */

    window.addEventListener(
        "user:changed",
        handleAuthChanged
    );
}


/* ============================================================
   INITIALIZE PROFILE
============================================================ */

async function initializeProfile() {

    bindProfileEvents();

    await refreshProfileUI();

    return true;
}


/* ============================================================
   PUBLIC API
============================================================ */

export {

    profileState,

    ROLE_LABELS,

    initializeProfile,

    refreshProfileUI,

    openProfile,

    closeProfile,

    openPasswordReset,

    closePasswordReset,

    changePassword,

    uploadAvatar,

    handleAvatarChange,

    openSettings,

    openWorkHistory,

    profileSignOut
};


/* ============================================================
   GLOBAL COMPATIBILITY
============================================================ */

window.profileState =
    profileState;

window.refreshProfileUI =
    refreshProfileUI;

window.openProfile =
    openProfile;

window.closeProfile =
    closeProfile;

window.openPasswordReset =
    openPasswordReset;

window.closePasswordReset =
    closePasswordReset;

window.changePassword =
    changePassword;

window.uploadAvatar =
    uploadAvatar;

window.openSettings =
    window.openSettings ||
    openSettings;

window.openWorkHistory =
    window.openWorkHistory ||
    openWorkHistory;

window.profileSignOut =
    profileSignOut;


/* ============================================================
   STARTUP
============================================================ */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeProfile();
        },
        {
            once:
                true
        }
    );

} else {

    initializeProfile();
}
