/* ============================================================
   PROFILE.JS
   ------------------------------------------------------------
   Profile screen, avatar, theme/settings shortcuts and
   profile-related UI.

   Compatible with:
   - auth.js
   - app.js
   - history.js
   - admin.js
   - existing index.html

   IMPORTANT:
   - No duplicate exports
   - Uses the current auth.js API
   - Uses real profiles columns only
   - No last_seen_at
   - Does not modify role or active status
   - Admin protection remains controlled by auth.js
   ============================================================ */

import {
    APP_CONFIG
} from "./config.js";

import {
    supabase
} from "./supabase.js";

import {
    getCurrentUser,
    getCurrentProfile,
    getRole,
    getUserName,
    updateUserProfile,
    updateAvatar,
    signOut,
    onAuthStateChange,
    isAdmin
} from "./auth.js";


// ============================================================
// STATE
// ============================================================

const profileState = {

    initialized:
        false,

    loading:
        false,

    saving:
        false,

    profile:
        null,

    theme:
        "system",

    avatarUploading:
        false
};


if (
    typeof window !==
    "undefined"
) {
    window.profileState =
        profileState;
}


// ============================================================
// DOM HELPER
// ============================================================

function $(id) {

    return document.getElementById(
        id
    );
}


// ============================================================
// SAFE TEXT
// ============================================================

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


// ============================================================
// ROLE LABEL
// ============================================================

function formatRole(
    role
) {

    const value =
        String(
            role ||
            "customer"
        )
            .trim()
            .replace(
                /[_-]+/g,
                " "
            );

    return value.replace(
        /\b\w/g,
        character =>
            character.toUpperCase()
    );
}


// ============================================================
// GET PROFILE
// ============================================================

function getActiveProfile() {

    const profile =
        getCurrentProfile();

    if (profile) {

        return profile;
    }

    const user =
        getCurrentUser();

    if (!user) {

        return null;
    }

    return {

        id:
            user.id ||
            null,

        email:
            user.email ||
            "",

        full_name:
            user.user_metadata
                ?.full_name ||
            user.user_metadata
                ?.name ||
            String(
                user.email ||
                ""
            )
                .split("@")[0] ||
            "User",

        role:
            getRole(),

        active:
            true,

        avatar_url:
            user.user_metadata
                ?.avatar_url ||
            null,

        theme:
            "system"
    };
}


// ============================================================
// PROFILE NAME
// ============================================================

function getProfileName(
    profile = getActiveProfile()
) {

    if (
        profile?.full_name
    ) {

        return String(
            profile.full_name
        ).trim();
    }

    if (
        profile?.name
    ) {

        return String(
            profile.name
        ).trim();
    }

    const name =
        getUserName();

    if (name) {

        return name;
    }

    const user =
        getCurrentUser();

    return (
        String(
            user?.email ||
            ""
        )
            .split("@")[0] ||
        "User"
    );
}


// ============================================================
// AVATAR INITIALS
// ============================================================

function getInitials(
    name
) {

    const clean =
        String(
            name ||
            "User"
        )
            .trim();

    if (!clean) {

        return "U";
    }

    const parts =
        clean
            .split(/\s+/)
            .filter(Boolean);

    if (
        parts.length >= 2
    ) {

        return (
            parts[0]
                .charAt(0) +
            parts[parts.length - 1]
                .charAt(0)
        )
            .toUpperCase();
    }

    return clean
        .slice(0, 2)
        .toUpperCase();
}


// ============================================================
// AVATAR RENDER
// ============================================================

function renderAvatarElement(
    element,
    profile
) {

    if (!element) {

        return;
    }

    const name =
        getProfileName(
            profile
        );

    const avatarUrl =
        String(
            profile?.avatar_url ||
            ""
        ).trim();

    if (avatarUrl) {

        element.style.backgroundImage =
            `url("${avatarUrl}")`;

        element.style.backgroundSize =
            "cover";

        element.style.backgroundPosition =
            "center";

        element.style.backgroundRepeat =
            "no-repeat";

        element.textContent =
            "";

        element.setAttribute(
            "aria-label",
            `${name} profile picture`
        );

    } else {

        element.style.backgroundImage =
            "";

        element.style.backgroundSize =
            "";

        element.style.backgroundPosition =
            "";

        element.style.backgroundRepeat =
            "";

        element.textContent =
            getInitials(
                name
            );

        element.setAttribute(
            "aria-label",
            `${name} profile`
        );
    }
}


// ============================================================
// RENDER PROFILE
// ============================================================

export function renderProfile(
    profile = getActiveProfile()
) {

    profileState.profile =
        profile ||
        null;

    if (!profile) {

        return null;
    }

    const name =
        getProfileName(
            profile
        );

    const role =
        formatRole(
            profile.role ||
            getRole()
        );

    const email =
        String(
            profile.email ||
            getCurrentUser()?.email ||
            ""
        ).trim();


    // --------------------------------------------------------
    // Sidebar profile
    // --------------------------------------------------------

    const profileName =
        $("profileName");

    if (profileName) {

        profileName.textContent =
            name;
    }


    const profileRole =
        $("profileRole");

    if (profileRole) {

        profileRole.textContent =
            role;
    }


    const profileAvatar =
        $("profileAvatar");

    renderAvatarElement(
        profileAvatar,
        profile
    );


    // --------------------------------------------------------
    // Full profile modal
    // --------------------------------------------------------

    const screenName =
        $("profileScreenName");

    if (screenName) {

        screenName.textContent =
            name;
    }


    const screenRole =
        $("profileScreenRole");

    if (screenRole) {

        screenRole.textContent =
            role;
    }


    const screenEmail =
        $("profileScreenEmail");

    if (screenEmail) {

        screenEmail.textContent =
            email ||
            "—";
    }


    const largeAvatar =
        $("profileLargeAvatar");

    renderAvatarElement(
        largeAvatar,
        profile
    );


    // --------------------------------------------------------
    // Current role compatibility
    // --------------------------------------------------------

    const currentRole =
        $("currentRole");

    if (currentRole) {

        currentRole.textContent =
            role;
    }


    // --------------------------------------------------------
    // Profile status
    // --------------------------------------------------------

    updateProfileStatus(
        profile
    );


    // --------------------------------------------------------
    // Theme
    // --------------------------------------------------------

    const savedTheme =
        profile.theme ||
        profileState.theme ||
        "system";

    profileState.theme =
        normalizeTheme(
            savedTheme
        );

    updateThemeSelect(
        profileState.theme
    );


    return profile;
}


// ============================================================
// PROFILE STATUS
// ============================================================

function updateProfileStatus(
    profile
) {

    const statusElements = [
        $("profileStatus"),
        $("profileAccountStatus"),
        $("profileScreenStatus")
    ];

    const role =
        String(
            profile?.role ||
            getRole() ||
            "customer"
        )
            .toLowerCase();

    const active =
        Boolean(
            profile?.active
        ) ||
        role ===
            "admin" ||
        role ===
            "staff";


    let text =
        active
            ? "Active"
            : "Waiting for admin approval";


    statusElements.forEach(
        element => {

            if (!element) {

                return;
            }

            element.textContent =
                text;

            element.dataset.status =
                active
                    ? "active"
                    : "pending";
        }
    );
}


// ============================================================
// OPEN PROFILE
// ============================================================

export function openProfileModal() {

    const modal =
        $("profileModal");

    if (!modal) {

        return false;
    }

    const profile =
        getActiveProfile();

    if (profile) {

        renderProfile(
            profile
        );
    }


    modal.hidden =
        false;

    modal.style.display =
        "flex";

    modal.classList.add(
        "open"
    );

    document.body.classList.add(
        "modal-open"
    );


    window.dispatchEvent(
        new CustomEvent(
            "profile:open",
            {
                detail: {
                    profile:
                        profile ||
                        null
                }
            }
        )
    );


    return true;
}


// ============================================================
// CLOSE PROFILE
// ============================================================

export function closeProfileModal() {

    const modal =
        $("profileModal");

    if (!modal) {

        return false;
    }

    modal.classList.remove(
        "open"
    );

    modal.hidden =
        true;

    modal.style.display =
        "none";

    document.body.classList.remove(
        "modal-open"
    );


    window.dispatchEvent(
        new CustomEvent(
            "profile:close"
        )
    );


    return true;
}


// ============================================================
// PROFILE TOGGLE
// ============================================================

export function toggleProfileModal() {

    const modal =
        $("profileModal");

    if (!modal) {

        return false;
    }

    const isOpen =
        modal.style.display ===
            "flex" ||
        modal.classList.contains(
            "open"
        ) ||
        modal.hidden ===
            false;

    if (isOpen) {

        return closeProfileModal();
    }

    return openProfileModal();
}


// ============================================================
// UPDATE PROFILE NAME
// ============================================================

export async function saveProfileName(
    name
) {

    if (
        !getCurrentUser()?.id
    ) {

        throw new Error(
            "You must be signed in."
        );
    }

    const cleanName =
        String(
            name ||
            ""
        ).trim();

    if (!cleanName) {

        throw new Error(
            "Please enter your name."
        );
    }

    if (
        cleanName.length >
        120
    ) {

        throw new Error(
            "Name must be 120 characters or less."
        );
    }


    profileState.saving =
        true;


    try {

        const profile =
            await updateUserProfile(
                {
                    full_name:
                        cleanName
                }
            );


        profileState.profile =
            profile ||
            getActiveProfile();


        renderProfile(
            profileState.profile
        );


        window.dispatchEvent(
            new CustomEvent(
                "profile:updated",
                {
                    detail: {
                        profile:
                            profileState.profile
                    }
                }
            )
        );


        return profileState.profile;

    } finally {

        profileState.saving =
            false;
    }
}


// ============================================================
// PROFILE AVATAR
// ============================================================

export async function uploadProfileAvatar(
    file
) {

    if (!file) {

        return null;
    }

    if (
        !getCurrentUser()?.id
    ) {

        throw new Error(
            "You must be signed in to change your profile picture."
        );
    }


    const validTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];


    if (
        !validTypes.includes(
            String(
                file.type ||
                ""
            ).toLowerCase()
        )
    ) {

        throw new Error(
            "Please choose a JPG, PNG, or WebP image."
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


    profileState.avatarUploading =
        true;


    const input =
        $("avatarInput");

    if (input) {

        input.disabled =
            true;
    }


    try {

        const avatarUrl =
            await updateAvatar(
                file
            );


        profileState.profile =
            getActiveProfile();


        if (
            profileState.profile
        ) {

            /*
             * The auth module normally reloads the profile after
             * updating the avatar. Keep the local reference fresh.
             */

            profileState.profile.avatar_url =
                avatarUrl;

            renderProfile(
                profileState.profile
            );
        }


        window.dispatchEvent(
            new CustomEvent(
                "profile:avatarUpdated",
                {
                    detail: {
                        avatarUrl
                    }
                }
            )
        );


        showProfileMessage(
            "Profile picture updated successfully.",
            "success"
        );


        return avatarUrl;

    } catch (error) {

        console.error(
            "Profile avatar upload failed:",
            error
        );


        showProfileMessage(
            error?.message ||
                "Unable to update profile picture.",
            "error"
        );


        throw error;

    } finally {

        profileState.avatarUploading =
            false;

        if (input) {

            input.disabled =
                false;

            /*
             * Allows the same file to be selected again.
             */

            input.value =
                "";
        }
    }
}


// ============================================================
// PROFILE MESSAGE
// ============================================================

function showProfileMessage(
    message,
    type = "info"
) {

    const possibleElements = [
        $("profileStatusMessage"),
        $("profileMessage"),
        $("profileSaveStatus")
    ];

    const element =
        possibleElements.find(
            item =>
                Boolean(item)
        );


    if (element) {

        element.textContent =
            message;

        element.dataset.status =
            type;

        element.classList.remove(
            "success",
            "error",
            "info"
        );

        element.classList.add(
            type
        );


        clearTimeout(
            element._profileMessageTimer
        );


        element._profileMessageTimer =
            setTimeout(
                () => {

                    if (
                        element.textContent ===
                        message
                    ) {

                        element.textContent =
                            "";
                    }

                },
                5000
            );
    }


    /*
     * Use the application's toast system when available.
     */

    try {

        if (
            typeof window.showToast ===
            "function"
        ) {

            window.showToast(
                message,
                type
            );
        }

    } catch {}
}


// ============================================================
// THEME HELPERS
// ============================================================

function normalizeTheme(
    theme
) {

    const value =
        String(
            theme ||
            ""
        )
            .trim()
            .toLowerCase();

    if (
        value ===
            "light" ||
        value ===
            "dark" ||
        value ===
            "system"
    ) {

        return value;
    }

    return "system";
}


// ============================================================
// APPLY THEME
// ============================================================

export function applyTheme(
    theme
) {

    const normalized =
        normalizeTheme(
            theme
        );


    profileState.theme =
        normalized;


    const root =
        document.documentElement;


    const body =
        document.body;


    /*
     * Store locally for immediate startup.
     */

    try {

        localStorage.setItem(
            "annotation_theme",
            normalized
        );

    } catch {}


    /*
     * Keep both common theme systems compatible:
     *
     * data-theme="dark"
     * body.light
     */

    if (
        normalized ===
        "dark"
    ) {

        root.setAttribute(
            "data-theme",
            "dark"
        );

        body?.classList.remove(
            "light"
        );

    } else if (
        normalized ===
        "light"
    ) {

        root.setAttribute(
            "data-theme",
            "light"
        );

        body?.classList.add(
            "light"
        );

    } else {

        /*
         * System mode.
         *
         * Removing data-theme allows CSS media-query based
         * themes to work when supported.
         */

        root.removeAttribute(
            "data-theme"
        );

        body?.classList.remove(
            "light"
        );
    }


    updateThemeSelect(
        normalized
    );


    window.dispatchEvent(
        new CustomEvent(
            "theme:changed",
            {
                detail: {
                    theme:
                        normalized
                }
            }
        )
    );


    return normalized;
}


// ============================================================
// THEME SELECT
// ============================================================

function updateThemeSelect(
    theme
) {

    const select =
        $("themeSelect");

    if (!select) {

        return;
    }

    const normalized =
        normalizeTheme(
            theme
        );

    if (
        select.value !==
        normalized
    ) {

        select.value =
            normalized;
    }
}


// ============================================================
// SAVE THEME
// ============================================================

export async function saveTheme(
    theme
) {

    const normalized =
        normalizeTheme(
            theme
        );


    applyTheme(
        normalized
    );


    const user =
        getCurrentUser();

    if (!user?.id) {

        return normalized;
    }


    /*
     * The profiles schema contains:
     *
     * theme text NOT NULL DEFAULT 'dark'
     *
     * Do not send unsupported columns.
     */

    if (!supabase) {

        return normalized;
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
                .update(
                    {
                        theme:
                            normalized,

                        updated_at:
                            new Date()
                                .toISOString()
                    }
                )
                .eq(
                    "id",
                    user.id
                )
                .select("*")
                .maybeSingle();


        if (error) {

            console.warn(
                "Could not save profile theme:",
                error
            );

            /*
             * Keep the local theme working even if the database
             * does not permit the profile update.
             */

            showProfileMessage(
                "Theme applied on this device, but could not be saved to your account.",
                "error"
            );

            return normalized;
        }


        if (data) {

            profileState.profile =
                data;

            renderProfile(
                data
            );
        }


        showProfileMessage(
            "Theme saved.",
            "success"
        );


        return normalized;

    } catch (error) {

        console.warn(
            "Theme save failed:",
            error
        );

        return normalized;
    }
}


// ============================================================
// LOAD THEME
// ============================================================

export function loadSavedTheme(
    profile = null
) {

    let theme =
        normalizeTheme(
            profile?.theme
        );


    /*
     * If the profile has no valid theme, use local storage.
     */

    if (
        !profile?.theme
    ) {

        try {

            const localTheme =
                localStorage.getItem(
                    "annotation_theme"
                );

            if (localTheme) {

                theme =
                    normalizeTheme(
                        localTheme
                    );
            }

        } catch {}
    }


    applyTheme(
        theme
    );


    return theme;
}


// ============================================================
// SETTINGS MODAL
// ============================================================

export function openSettingsModal() {

    const modal =
        $("settingsModal");

    if (!modal) {

        /*
         * Some layouts may use the existing settings button
         * without a modal. Notify other modules instead.
         */

        window.dispatchEvent(
            new CustomEvent(
                "settings:open"
            )
        );

        return false;
    }


    const profile =
        getActiveProfile();


    if (
        profile
    ) {

        profileState.profile =
            profile;

        profileState.theme =
            normalizeTheme(
                profile.theme ||
                profileState.theme ||
                "system"
            );
    }


    updateThemeSelect(
        profileState.theme
    );


    modal.hidden =
        false;

    modal.style.display =
        "flex";

    modal.classList.add(
        "open"
    );

    document.body.classList.add(
        "modal-open"
    );


    window.dispatchEvent(
        new CustomEvent(
            "settings:open"
        )
    );


    return true;
}


// ============================================================
// CLOSE SETTINGS
// ============================================================

export function closeSettingsModal() {

    const modal =
        $("settingsModal");

    if (!modal) {

        return false;
    }


    modal.classList.remove(
        "open"
    );

    modal.hidden =
        true;

    modal.style.display =
        "none";

    document.body.classList.remove(
        "modal-open"
    );


    window.dispatchEvent(
        new CustomEvent(
            "settings:close"
        )
    );


    return true;
}


// ============================================================
// OPEN HISTORY
// ============================================================

export function openWorkHistory() {

    /*
     * Prefer the existing history navigation button because
     * history.js already owns its loading/rendering logic.
     */

    const historyButton =
        $("workHistoryButton") ||
        $("workHistoryBtn");


    if (historyButton) {

        try {

            historyButton.click();

            return true;

        } catch {}
    }


    /*
     * Compatibility event for history.js or app.js.
     */

    window.dispatchEvent(
        new CustomEvent(
            "history:open"
        )
    );


    return true;
}


// ============================================================
// SIGN OUT FROM PROFILE
// ============================================================

export async function signOutFromProfile() {

    const button =
        $("profileSignOutAction");

    if (button) {

        button.disabled =
            true;
    }


    try {

        await signOut();

        return true;

    } catch (error) {

        console.error(
            "Profile sign out failed:",
            error
        );

        showProfileMessage(
            error?.message ||
                "Unable to sign out.",
            "error"
        );

        return false;

    } finally {

        if (button) {

            button.disabled =
                false;
        }
    }
}


// ============================================================
// ADMIN BUTTON VISIBILITY
// ============================================================

export function updateProfileAdminVisibility() {

    const adminButton =
        $("adminCenterButton");

    if (!adminButton) {

        return;
    }


    /*
     * auth.js is the authority for the protected administrator.
     */

    const visible =
        Boolean(
            isAdmin()
        );


    adminButton.hidden =
        !visible;

    adminButton.style.display =
        visible
            ? ""
            : "none";


    if (visible) {

        adminButton.setAttribute(
            "aria-hidden",
            "false"
        );

    } else {

        adminButton.setAttribute(
            "aria-hidden",
            "true"
        );
    }
}


// ============================================================
// PROFILE NAVIGATION VISIBILITY
// ============================================================

export function updateProfileNavigation() {

    const user =
        getCurrentUser();


    const elements = [
        $("settingsButton"),
        $("workHistoryButton"),
        $("profileButton")
    ];


    elements.forEach(
        element => {

            if (!element) {

                return;
            }

            const shouldShow =
                Boolean(
                    user
                );

            element.hidden =
                !shouldShow;

            element.style.display =
                shouldShow
                    ? ""
                    : "none";
        }
    );


    updateProfileAdminVisibility();
}


// ============================================================
// BIND PROFILE BUTTONS
// ============================================================

function bindProfileButtons() {

    /*
     * Main top navigation profile button.
     */

    const profileButton =
        $("profileButton");

    if (
        profileButton &&
        profileButton.dataset.profileBound !==
            "true"
    ) {

        profileButton.dataset.profileBound =
            "true";

        profileButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openProfileModal();
            }
        );
    }


    /*
     * Sidebar profile area.
     */

    const profileAvatar =
        $("profileAvatar");

    if (
        profileAvatar &&
        profileAvatar.dataset.profileBound !==
            "true"
    ) {

        profileAvatar.dataset.profileBound =
            "true";

        profileAvatar.style.cursor =
            "pointer";

        profileAvatar.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openProfileModal();
            }
        );
    }


    /*
     * Close profile.
     */

    const closeButton =
        $("closeProfileModal");

    if (
        closeButton &&
        closeButton.dataset.profileBound !==
            "true"
    ) {

        closeButton.dataset.profileBound =
            "true";

        closeButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                closeProfileModal();
            }
        );
    }


    /*
     * Profile history shortcut.
     */

    const historyAction =
        $("profileHistoryAction");

    if (
        historyAction &&
        historyAction.dataset.profileBound !==
            "true"
    ) {

        historyAction.dataset.profileBound =
            "true";

        historyAction.addEventListener(
            "click",
            event => {

                event.preventDefault();

                closeProfileModal();

                openWorkHistory();
            }
        );
    }


    /*
     * Profile settings shortcut.
     */

    const settingsAction =
        $("profileSettingsAction");

    if (
        settingsAction &&
        settingsAction.dataset.profileBound !==
            "true"
    ) {

        settingsAction.dataset.profileBound =
            "true";

        settingsAction.addEventListener(
            "click",
            event => {

                event.preventDefault();

                closeProfileModal();

                openSettingsModal();
            }
        );
    }


    /*
     * Profile sign out.
     */

    const signOutButton =
        $("profileSignOutAction");

    if (
        signOutButton &&
        signOutButton.dataset.profileBound !==
            "true"
    ) {

        signOutButton.dataset.profileBound =
            "true";

        signOutButton.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                await signOutFromProfile();
            }
        );
    }


    /*
     * Main settings button.
     */

    const settingsButton =
        $("settingsButton");

    if (
        settingsButton &&
        settingsButton.dataset.profileSettingsBound !==
            "true"
    ) {

        settingsButton.dataset.profileSettingsBound =
            "true";

        settingsButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                openSettingsModal();
            }
        );
    }


    /*
     * Close settings.
     */

    const closeSettings =
        $("closeSettingsModal");

    if (
        closeSettings &&
        closeSettings.dataset.profileBound !==
            "true"
    ) {

        closeSettings.dataset.profileBound =
            "true";

        closeSettings.addEventListener(
            "click",
            event => {

                event.preventDefault();

                closeSettingsModal();
            }
        );
    }


    /*
     * Work history top navigation.
     *
     * history.js also binds this button. We deliberately do
     * not add another listener here to avoid duplicate actions.
     */


    /*
     * Change avatar button.
     */

    const changeAvatar =
        $("changeAvatarBtn");

    const avatarInput =
        $("avatarInput");


    if (
        changeAvatar &&
        avatarInput &&
        changeAvatar.dataset.profileBound !==
            "true"
    ) {

        changeAvatar.dataset.profileBound =
            "true";

        changeAvatar.addEventListener(
            "click",
            event => {

                event.preventDefault();

                avatarInput.click();
            }
        );
    }


    /*
     * Avatar input.
     */

    if (
        avatarInput &&
        avatarInput.dataset.profileBound !==
            "true"
    ) {

        avatarInput.dataset.profileBound =
            "true";

        avatarInput.addEventListener(
            "change",
            async event => {

                const file =
                    event.target.files?.[0];

                if (!file) {

                    return;
                }

                try {

                    await uploadProfileAvatar(
                        file
                    );

                } catch {

                    /*
                     * uploadProfileAvatar already displays
                     * the error.
                     */

                }
            }
        );
    }


    /*
     * Profile modal background click.
     */

    const profileModal =
        $("profileModal");

    if (
        profileModal &&
        profileModal.dataset.profileOverlayBound !==
            "true"
    ) {

        profileModal.dataset.profileOverlayBound =
            "true";

        profileModal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    profileModal
                ) {

                    closeProfileModal();
                }
            }
        );
    }


    /*
     * Settings modal background click.
     */

    const settingsModal =
        $("settingsModal");

    if (
        settingsModal &&
        settingsModal.dataset.profileOverlayBound !==
            "true"
    ) {

        settingsModal.dataset.profileOverlayBound =
            "true";

        settingsModal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    settingsModal
                ) {

                    closeSettingsModal();
                }
            }
        );
    }


    /*
     * Theme selector.
     */

    const themeSelect =
        $("themeSelect");

    if (
        themeSelect &&
        themeSelect.dataset.profileBound !==
            "true"
    ) {

        themeSelect.dataset.profileBound =
            "true";

        themeSelect.addEventListener(
            "change",
            event => {

                const theme =
                    normalizeTheme(
                        event.target.value
                    );

                applyTheme(
                    theme
                );
            }
        );
    }


    /*
     * Save theme.
     */

    const saveThemeButton =
        $("saveThemeButton");

    if (
        saveThemeButton &&
        saveThemeButton.dataset.profileBound !==
            "true"
    ) {

        saveThemeButton.dataset.profileBound =
            "true";

        saveThemeButton.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                const theme =
                    normalizeTheme(
                        $("themeSelect")
                            ?.value ||
                        profileState.theme ||
                        "system"
                    );


                saveThemeButton.disabled =
                    true;


                try {

                    await saveTheme(
                        theme
                    );

                    closeSettingsModal();

                } catch (error) {

                    console.error(
                        "Could not save theme:",
                        error
                    );

                } finally {

                    saveThemeButton.disabled =
                        false;
                }
            }
        );
    }


    /*
     * Escape key.
     */

    if (
        document.body.dataset.profileKeyboardBound !==
            "true"
    ) {

        document.body.dataset.profileKeyboardBound =
            "true";

        document.addEventListener(
            "keydown",
            event => {

                if (
                    event.key !==
                    "Escape"
                ) {

                    return;
                }


                const profileModal =
                    $("profileModal");

                if (
                    profileModal &&
                    (
                        profileModal.classList.contains(
                            "open"
                        ) ||
                        profileModal.style.display ===
                            "flex"
                    )
                ) {

                    closeProfileModal();

                    return;
                }


                const settingsModal =
                    $("settingsModal");

                if (
                    settingsModal &&
                    (
                        settingsModal.classList.contains(
                            "open"
                        ) ||
                        settingsModal.style.display ===
                            "flex"
                    )
                ) {

                    closeSettingsModal();
                }
            }
        );
    }
}


// ============================================================
// AUTH EVENTS
// ============================================================

function bindAuthEvents() {

    if (
        typeof onAuthStateChange !==
        "function"
    ) {

        return;
    }


    if (
        profileState.authListenerBound
    ) {

        return;
    }


    profileState.authListenerBound =
        true;


    onAuthStateChange(
        async (
            state,
            reason
        ) => {

            /*
             * Keep the UI synchronized with auth.js.
             */

            if (
                state?.authenticated &&
                state?.user
            ) {

                profileState.profile =
                    state.profile ||
                    getActiveProfile();


                if (
                    profileState.profile
                ) {

                    renderProfile(
                        profileState.profile
                    );
                }


                updateProfileNavigation();


                /*
                 * Do not repeatedly open modals here.
                 */

                if (
                    reason ===
                        "login" ||
                    reason ===
                        "startup" ||
                    reason ===
                        "profileUpdated" ||
                    reason ===
                        "avatarUpdated" ||
                    reason ===
                        "profileStatusRefreshed"
                ) {

                    updateProfileNavigation();
                }

            } else {

                profileState.profile =
                    null;

                updateProfileNavigation();

                /*
                 * Always close profile/settings when signed out.
                 */

                closeProfileModal();
                closeSettingsModal();
            }
        }
    );
}


// ============================================================
// PROFILE REFRESH
// ============================================================

export async function refreshProfile() {

    const user =
        getCurrentUser();

    if (!user?.id) {

        profileState.profile =
            null;

        updateProfileNavigation();

        return null;
    }


    profileState.loading =
        true;


    try {

        const profile =
            getCurrentProfile() ||
            getActiveProfile();


        profileState.profile =
            profile;


        if (profile) {

            renderProfile(
                profile
            );
        }


        updateProfileNavigation();


        return profile;

    } finally {

        profileState.loading =
            false;
    }
}


// ============================================================
// PROTECTED ADMIN PROFILE CHECK
// ============================================================

export function isProtectedAdminProfile(
    profile = getActiveProfile()
) {

    if (!profile) {

        return false;
    }


    const email =
        String(
            profile.email ||
            ""
        )
            .trim()
            .toLowerCase();


    const configuredAdminEmail =
        String(
            APP_CONFIG?.adminEmail ||
            "antonymbali96@gmail.com"
        )
            .trim()
            .toLowerCase();


    return (
        email ===
        configuredAdminEmail
    );
}


// ============================================================
// INITIALIZE PROFILE
// ============================================================

export async function initializeProfile() {

    if (
        profileState.initialized
    ) {

        return profileState;
    }


    profileState.initialized =
        true;


    try {

        /*
         * Bind all profile UI once.
         */

        bindProfileButtons();


        /*
         * Bind auth synchronization.
         */

        bindAuthEvents();


        /*
         * Load current profile.
         */

        const user =
            getCurrentUser();

        const profile =
            getCurrentProfile();


        if (
            user
        ) {

            profileState.profile =
                profile ||
                getActiveProfile();


            if (
                profileState.profile
            ) {

                renderProfile(
                    profileState.profile
                );
            }


            /*
             * Use account theme first, then local fallback.
             */

            loadSavedTheme(
                profileState.profile
            );

        } else {

            /*
             * No signed-in user.
             */

            profileState.profile =
                null;

            loadSavedTheme(
                null
            );
        }


        /*
         * Update navigation visibility.
         */

        updateProfileNavigation();


        /*
         * Expose compatibility globals.
         */

        exposeGlobals();


        return profileState;

    } catch (error) {

        console.error(
            "Profile initialization failed:",
            error
        );

        return profileState;
    }
}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

function exposeGlobals() {

    if (
        typeof window ===
        "undefined"
    ) {

        return;
    }


    window.profileState =
        profileState;


    window.renderProfile =
        renderProfile;


    window.openProfileModal =
        openProfileModal;


    window.closeProfileModal =
        closeProfileModal;


    window.toggleProfileModal =
        toggleProfileModal;


    window.refreshProfile =
        refreshProfile;


    window.uploadProfileAvatar =
        uploadProfileAvatar;


    window.applyTheme =
        applyTheme;


    window.saveTheme =
        saveTheme;


    window.openSettingsModal =
        openSettingsModal;


    window.closeSettingsModal =
        closeSettingsModal;


    window.openWorkHistory =
        openWorkHistory;


    window.isProtectedAdminProfile =
        isProtectedAdminProfile;
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

                initializeProfile()
                    .catch(
                        error => {

                            console.error(
                                "Profile auto initialization failed:",
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

        initializeProfile()
            .catch(
                error => {

                    console.error(
                        "Profile auto initialization failed:",
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
    "Profile module loaded."
);
