/* ============================================================
   PROFILE.JS
   ------------------------------------------------------------
   Handles:
   - Profile modal
   - Full name
   - Email display
   - Role display
   - Profile picture upload
   - Avatar preview
   - Saving profile changes
   - Keeping admin identity protected
   - Supabase profile synchronization
   ============================================================ */

import {
  APP_CONFIG,
  normalizeRole,
  roleLabel,
  isAdminRole,
} from "./config.js";

import {
  getCurrentUser,
  getCurrentProfile,
  getRole,
  updateUserProfile,
  updateAvatar,
  signOut,
} from "./auth.js";

import {
  getSupabase,
  getCurrentUser as getSupabaseUser,
  logActivity,
} from "./supabase.js";

/* ============================================================
   STATE
   ============================================================ */

export const profileState = {
  initialized: false,

  user: null,
  profile: null,
  role: null,
  userId: null,

  originalName: "",
  originalEmail: "",

  avatarUrl: null,

  saving: false,
  uploadingAvatar: false,

  modalOpen: false,
};

window.profileState = profileState;

/* ============================================================
   HELPERS
   ============================================================ */

const $ = (id) =>
  document.getElementById(id);

function getClient() {
  try {
    return (
      getSupabase?.() ||
      window.supabaseClient ||
      null
    );
  } catch {
    return (
      window.supabaseClient ||
      null
    );
  }
}

function text(
  value,
  fallback = ""
) {
  return (
    value == null ||
    value === ""
  )
    ? fallback
    : String(value);
}

function escapeHTML(value) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showElement(
  element,
  show = true
) {
  if (!element) return;

  element.hidden = !show;

  if (show) {
    element.style.display = "";
  } else {
    element.style.display = "none";
  }
}

function setText(
  element,
  value = ""
) {
  if (!element) return;

  element.textContent =
    value == null
      ? ""
      : String(value);
}

function toast(
  message,
  type = "info"
) {
  if (
    typeof window.showToast ===
    "function"
  ) {
    window.showToast(
      message,
      type
    );

    return;
  }

  const container =
    $("toastContainer");

  if (!container) {
    console.log(
      `[${type}] ${message}`
    );

    return;
  }

  const item =
    document.createElement(
      "div"
    );

  item.className =
    `toast toast-${type}`;

  item.textContent =
    message;

  container.appendChild(
    item
  );

  setTimeout(() => {
    item.remove();
  }, 4000);
}

function currentAdminEmail() {
  return String(
    APP_CONFIG?.adminEmail ||
      "antonymbali96@gmail.com"
  )
    .trim()
    .toLowerCase();
}

/* ============================================================
   SAFE USER ID
   ------------------------------------------------------------
   Centralized helper so no Supabase request can accidentally
   become:
       id=eq.undefined
   ============================================================ */

function getValidUserId() {
  const authUser =
    typeof getCurrentUser ===
    "function"
      ? getCurrentUser()
      : null;

  const supabaseUser =
    typeof getSupabaseUser ===
    "function"
      ? getSupabaseUser()
      : null;

  const possibleIds = [
    authUser?.id,
    supabaseUser?.id,
    profileState.user?.id,
    profileState.profile?.id,
    profileState.userId,
  ];

  for (
    const value of possibleIds
  ) {
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

/* ============================================================
   REFRESH PROFILE STATE
   ============================================================ */

function refreshState() {
  const authUser =
    typeof getCurrentUser ===
    "function"
      ? getCurrentUser()
      : null;

  const supabaseUser =
    typeof getSupabaseUser ===
    "function"
      ? getSupabaseUser()
      : null;

  /*
   * Prefer auth.js user when it has a valid ID.
   */
  let resolvedUser = null;

  if (
    authUser &&
    typeof authUser.id ===
      "string" &&
    authUser.id.trim()
  ) {
    resolvedUser =
      authUser;
  } else if (
    supabaseUser &&
    typeof supabaseUser.id ===
      "string" &&
    supabaseUser.id.trim()
  ) {
    resolvedUser =
      supabaseUser;
  } else if (
    profileState.user &&
    typeof profileState.user.id ===
      "string" &&
    profileState.user.id.trim()
  ) {
    resolvedUser =
      profileState.user;
  }

  profileState.user =
    resolvedUser;

  profileState.profile =
    getCurrentProfile?.() ||
    profileState.profile ||
    null;

  /*
   * Resolve ID safely.
   */
  profileState.userId =
    getValidUserId();

  /*
   * Role.
   */
  profileState.role =
    normalizeRole(
      getRole?.() ||
        profileState.profile?.role ||
        profileState.user
          ?.user_metadata
          ?.role ||
        ""
    );

  /*
   * Full name.
   */
  profileState.originalName =
    text(
      profileState.profile
        ?.full_name ||
        profileState.user
          ?.user_metadata
          ?.full_name ||
        profileState.user
          ?.user_metadata
          ?.name ||
        profileState.user
          ?.email
          ?.split("@")[0],
      ""
    );

  /*
   * Email.
   */
  profileState.originalEmail =
    text(
      profileState.user?.email ||
        profileState.profile?.email,
      ""
    );

  /*
   * Avatar.
   */
  profileState.avatarUrl =
    profileState.profile
      ?.avatar_url ||
    profileState.user
      ?.user_metadata
      ?.avatar_url ||
    null;
}

/* ============================================================
   INITIALIZATION
   ============================================================ */

export function initializeProfile() {
  if (
    profileState.initialized
  ) {
    refreshState();

    updateNavigationProfile();
    updateDashboardProfile();

    return profileState;
  }

  profileState.initialized =
    true;

  refreshState();

  bindProfileModal();
  bindProfileForm();
  bindAvatarUpload();
  bindLogoutButton();
  bindAuthEvents();

  updateNavigationProfile();
  updateDashboardProfile();

  return profileState;
}

/* ============================================================
   MODAL
   ============================================================ */

function bindProfileModal() {
  $("profileButton")
    ?.addEventListener(
      "click",
      openProfile
    );

  $("closeProfileModal")
    ?.addEventListener(
      "click",
      closeProfile
    );

  $("profileModal")
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          $("profileModal")
        ) {
          closeProfile();
        }
      }
    );
}

export function openProfile() {
  refreshState();

  if (!profileState.user) {
    toast(
      "Please sign in first.",
      "warning"
    );

    return false;
  }

  if (!profileState.userId) {
    toast(
      "Unable to identify your account. Please sign in again.",
      "error"
    );

    console.warn(
      "openProfile: Missing user ID",
      profileState.user
    );

    return false;
  }

  const modal =
    $("profileModal");

  if (!modal) {
    toast(
      "Profile window was not found.",
      "error"
    );

    return false;
  }

  profileState.modalOpen =
    true;

  populateProfileForm();

  showElement(
    modal,
    true
  );

  modal.classList.add(
    "profile-modal-open"
  );

  document.body.classList.add(
    "profile-open"
  );

  return true;
}

export function closeProfile() {
  profileState.modalOpen =
    false;

  const modal =
    $("profileModal");

  if (modal) {
    showElement(
      modal,
      false
    );

    modal.classList.remove(
      "profile-modal-open"
    );
  }

  document.body.classList.remove(
    "profile-open"
  );
}

/* ============================================================
   POPULATE PROFILE
   ============================================================ */

function populateProfileForm() {
  refreshState();

  const nameInput =
    $("profileFullName");

  const emailInput =
    $("profileEmail");

  const roleInput =
    $("profileRole");

  if (nameInput) {
    nameInput.value =
      profileState.originalName;
  }

  if (emailInput) {
    emailInput.value =
      profileState.originalEmail;

    emailInput.readOnly =
      true;

    emailInput.disabled =
      false;
  }

  if (roleInput) {
    roleInput.value =
      roleLabel(
        profileState.role
      );

    roleInput.readOnly =
      true;

    roleInput.disabled =
      false;
  }

  renderAvatarPreview();
}

/* ============================================================
   AVATAR
   ============================================================ */

function renderAvatarPreview() {
  const preview =
    $("profileAvatarPreview");

  if (!preview) return;

  const avatar =
    profileState.avatarUrl;

  if (avatar) {
    preview.innerHTML = `
      <img
        src="${escapeHTML(
          avatar
        )}"
        alt="Profile picture"
        class="profile-avatar-image"
      >
    `;

    return;
  }

  const name =
    profileState.originalName ||
    profileState.originalEmail ||
    "U";

  const initial =
    name
      .trim()
      .charAt(0)
      .toUpperCase() ||
    "U";

  preview.innerHTML = `
    <div
      class="profile-avatar-fallback"
      aria-label="Profile picture placeholder"
    >
      ${escapeHTML(
        initial
      )}
    </div>
  `;
}

function bindAvatarUpload() {
  const input =
    $("avatarInput");

  if (input) {
    input.addEventListener(
      "change",
      async () => {
        const file =
          input.files?.[0];

        if (!file) {
          return;
        }

        await uploadProfileAvatar(
          file
        );

        input.value = "";
      }
    );
  }

  /*
   * Legacy HTML support.
   */
  const legacyInput =
    $("profilePictureInput");

  if (
    legacyInput &&
    legacyInput !== input
  ) {
    legacyInput.addEventListener(
      "change",
      async () => {
        const file =
          legacyInput.files?.[0];

        if (!file) {
          return;
        }

        await uploadProfileAvatar(
          file
        );

        legacyInput.value =
          "";
      }
    );
  }
}

/* ============================================================
   UPLOAD PROFILE AVATAR
   ============================================================ */

export async function uploadProfileAvatar(
  file
) {
  if (
    profileState.uploadingAvatar
  ) {
    return false;
  }

  refreshState();

  if (!profileState.user) {
    toast(
      "Please sign in first.",
      "warning"
    );

    return false;
  }

  const userId =
    getValidUserId();

  if (!userId) {
    toast(
      "Unable to identify your account. Please sign in again.",
      "error"
    );

    console.warn(
      "uploadProfileAvatar: Missing user ID",
      profileState.user
    );

    return false;
  }

  if (!file) {
    toast(
      "Please choose an image file.",
      "warning"
    );

    return false;
  }

  if (
    !String(
      file.type || ""
    ).startsWith("image/")
  ) {
    toast(
      "Please choose an image file.",
      "warning"
    );

    return false;
  }

  const maxSize =
    5 * 1024 * 1024;

  if (
    file.size >
    maxSize
  ) {
    toast(
      "Profile picture must be 5 MB or smaller.",
      "warning"
    );

    return false;
  }

  profileState.uploadingAvatar =
    true;

  setAvatarUploadState(
    true
  );

  try {
    /*
     * First use auth.js helper.
     */
    if (
      typeof updateAvatar ===
      "function"
    ) {
      const result =
        await updateAvatar(
          file
        );

      if (
        result?.error
      ) {
        throw result.error;
      }

      const newUrl =
        result?.avatar_url ||
        result?.url ||
        result?.data
          ?.avatar_url ||
        result?.data?.url ||
        (
          typeof result ===
          "string"
            ? result
            : null
        );

      if (newUrl) {
        profileState.avatarUrl =
          newUrl;
      }

      /*
       * Do not let a failed refresh
       * erase a newly returned avatar.
       */
      const savedUrl =
        profileState.avatarUrl;

      refreshState();

      if (
        savedUrl &&
        !profileState.avatarUrl
      ) {
        profileState.avatarUrl =
          savedUrl;
      }

      if (
        newUrl &&
        !profileState.avatarUrl
      ) {
        profileState.avatarUrl =
          newUrl;
      }

      if (
        profileState.profile
      ) {
        profileState.profile.avatar_url =
          profileState.avatarUrl;
      }

      renderAvatarPreview();
      updateNavigationProfile();
      updateDashboardProfile();

      toast(
        "Profile picture updated.",
        "success"
      );

      return true;
    }

    /*
     * Direct Supabase fallback.
     */
    const client =
      getClient();

    if (!client) {
      throw new Error(
        "Supabase connection is unavailable."
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

    const safeExtension =
      /^[a-z0-9]+$/i.test(
        extension
      )
        ? extension
        : "jpg";

    const path =
      `${userId}/profile-${Date.now()}.${safeExtension}`;

    const {
      error:
        uploadError,
    } =
      await client.storage
        .from(bucket)
        .upload(
          path,
          file,
          {
            upsert: true,
            contentType:
              file.type,
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    let avatarUrl =
      null;

    /*
     * Public bucket.
     */
    try {
      const {
        data,
      } = client.storage
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
          data,
        } =
          await client.storage
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

    const {
      error:
        profileError,
    } = await client
      .from(
        APP_CONFIG?.tables
          ?.profiles ||
          "profiles"
      )
      .update({
        avatar_url:
          avatarUrl,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        userId
      );

    if (profileError) {
      throw profileError;
    }

    /*
     * Synchronize Auth metadata.
     */
    try {
      await client.auth.updateUser(
        {
          data: {
            avatar_url:
              avatarUrl,
          },
        }
      );
    } catch (error) {
      console.warn(
        "Auth avatar metadata update:",
        error
      );
    }

    profileState.avatarUrl =
      avatarUrl;

    if (profileState.profile) {
      profileState.profile.avatar_url =
        avatarUrl;
    }

    renderAvatarPreview();
    updateNavigationProfile();
    updateDashboardProfile();

    toast(
      "Profile picture updated.",
      "success"
    );

    return true;
  } catch (error) {
    console.error(
      "uploadProfileAvatar:",
      error
    );

    toast(
      error?.message ||
        "Unable to upload profile picture.",
      "error"
    );

    return false;
  } finally {
    profileState.uploadingAvatar =
      false;

    setAvatarUploadState(
      false
    );
  }
}

function setAvatarUploadState(
  uploading
) {
  const input =
    $("avatarInput");

  if (input) {
    input.disabled =
      uploading;
  }

  const button =
    document.querySelector(
      '[for="avatarInput"]'
    );

  if (button) {
    button.classList.toggle(
      "uploading",
      uploading
    );
  }
}

/* ============================================================
   SAVE PROFILE
   ============================================================ */

function bindProfileForm() {
  $("saveProfileButton")
    ?.addEventListener(
      "click",
      saveProfile
    );

  $("profileFullName")
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key ===
          "Enter"
        ) {
          event.preventDefault();

          saveProfile();
        }
      }
    );
}

export async function saveProfile() {
  if (
    profileState.saving
  ) {
    return false;
  }

  refreshState();

  if (!profileState.user) {
    toast(
      "Please sign in first.",
      "warning"
    );

    return false;
  }

  const userId =
    getValidUserId();

  if (!userId) {
    toast(
      "Unable to identify your account. Please sign in again.",
      "error"
    );

    console.warn(
      "saveProfile: Missing user ID",
      profileState.user
    );

    return false;
  }

  const nameInput =
    $("profileFullName");

  const newName =
    nameInput?.value?.trim();

  if (!newName) {
    toast(
      "Please enter your name.",
      "warning"
    );

    nameInput?.focus();

    return false;
  }

  if (
    newName.length <
    2
  ) {
    toast(
      "Name must contain at least 2 characters.",
      "warning"
    );

    nameInput?.focus();

    return false;
  }

  if (
    newName.length >
    120
  ) {
    toast(
      "Name is too long.",
      "warning"
    );

    nameInput?.focus();

    return false;
  }

  profileState.saving =
    true;

  setSaveState(
    true
  );

  try {
    const email =
      profileState.originalEmail;

    const role =
      normalizeRole(
        profileState.role
      );

    /*
     * Email and role are intentionally
     * not editable here.
     */
    void email;

    let result = null;

    /*
     * Use auth.js profile helper.
     */
    if (
      typeof updateUserProfile ===
      "function"
    ) {
      result =
        await updateUserProfile({
          full_name:
            newName,
        });

      if (
        result?.error
      ) {
        throw result.error;
      }
    } else {
      const client =
        getClient();

      if (!client) {
        throw new Error(
          "Supabase connection is unavailable."
        );
      }

      const {
        error,
      } = await client
        .from(
          APP_CONFIG?.tables
            ?.profiles ||
            "profiles"
        )
        .update({
          full_name:
            newName,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          userId
        );

      if (error) {
        throw error;
      }
    }

    /*
     * Update Auth metadata where possible.
     * This does not change the email.
     */
    const client =
      getClient();

    if (client) {
      try {
        const {
          error:
            authError,
        } =
          await client.auth.updateUser(
            {
              data: {
                full_name:
                  newName,

                ...(role
                  ? {
                      role,
                    }
                  : {}),
              },
            }
          );

        if (authError) {
          console.warn(
            "Auth metadata update:",
            authError
          );
        }
      } catch (error) {
        console.warn(
          "Auth metadata update:",
          error
        );
      }
    }

    await logProfileActivity(
      "profile_updated",
      {
        full_name:
          newName,
      }
    );

    profileState.originalName =
      newName;

    if (
      profileState.profile
    ) {
      profileState.profile.full_name =
        newName;
    }

    updateNavigationProfile();
    updateDashboardProfile();

    toast(
      "Profile saved successfully.",
      "success"
    );

    closeProfile();

    window.dispatchEvent(
      new CustomEvent(
        "profileUpdated",
        {
          detail: {
            name:
              newName,

            role:
              profileState.role,

            avatar:
              profileState.avatarUrl,
          },
        }
      )
    );

    return true;
  } catch (error) {
    console.error(
      "saveProfile:",
      error
    );

    toast(
      error?.message ||
        "Unable to save profile.",
      "error"
    );

    return false;
  } finally {
    profileState.saving =
      false;

    setSaveState(
      false
    );
  }
}

function setSaveState(
  saving
) {
  const button =
    $("saveProfileButton");

  if (!button) return;

  button.disabled =
    saving;

  if (
    !button.dataset.originalText
  ) {
    button.dataset.originalText =
      button.textContent ||
      "Save profile";
  }

  button.textContent =
    saving
      ? "Saving..."
      : button.dataset
          .originalText;
}

/* ============================================================
   NAVIGATION PROFILE
   ============================================================ */

export function updateNavigationProfile() {
  refreshState();

  const name =
    profileState.originalName ||
    profileState.originalEmail ||
    "User";

  setText(
    $("navProfileName"),
    name
  );

  const avatar =
    $("navAvatar");

  if (avatar) {
    if (
      profileState.avatarUrl
    ) {
      avatar.innerHTML = `
        <img
          src="${escapeHTML(
            profileState.avatarUrl
          )}"
          alt=""
          class="nav-avatar-image"
        >
      `;

      avatar.classList.add(
        "has-avatar"
      );
    } else {
      avatar.textContent =
        name
          .charAt(0)
          .toUpperCase();

      avatar.classList.remove(
        "has-avatar"
      );
    }
  }

  /*
   * Admin icon appears only for admins.
   */
  const adminButton =
    $("adminCenterButton");

  if (adminButton) {
    const email =
      String(
        profileState.user
          ?.email ||
          profileState.profile
            ?.email ||
          ""
      )
        .trim()
        .toLowerCase();

    const admin =
      isAdminRole(
        profileState.role
      ) ||
      email ===
        currentAdminEmail();

    showElement(
      adminButton,
      admin
    );
  }
}

/* ============================================================
   DASHBOARD PROFILE
   ============================================================ */

export function updateDashboardProfile() {
  refreshState();

  const name =
    profileState.originalName ||
    profileState.originalEmail ||
    "User";

  setText(
    $("dashboardUserName"),
    name
  );

  setText(
    $("dashboardRoleText"),
    roleLabel(
      profileState.role
    )
  );

  const avatar =
    $("dashboardAvatar");

  const fallback =
    $("dashboardAvatarFallback");

  if (
    profileState.avatarUrl
  ) {
    if (avatar) {
      avatar.src =
        profileState.avatarUrl;

      showElement(
        avatar,
        true
      );
    }

    if (fallback) {
      showElement(
        fallback,
        false
      );
    }
  } else {
    if (avatar) {
      showElement(
        avatar,
        false
      );
    }

    if (fallback) {
      setText(
        fallback,
        name
          .charAt(0)
          .toUpperCase()
      );

      showElement(
        fallback,
        true
      );
    }
  }
}

/* ============================================================
   PROFILE DATA REFRESH
   ============================================================ */

export async function refreshProfile() {
  refreshState();

  const client =
    getClient();

  /*
   * Resolve the ID independently.
   */
  const userId =
    getValidUserId();

  /*
   * This is the critical protection.
   *
   * We will NEVER execute:
   *
   * .eq("id", undefined)
   *
   * or:
   *
   * .eq("id", null)
   */
  if (!client || !userId) {
    console.warn(
      "refreshProfile: No valid user ID.",
      {
        hasClient:
          !!client,

        user:
          profileState.user,

        profile:
          profileState.profile,

        userId,
      }
    );

    return profileState;
  }

  /*
   * Keep state synchronized.
   */
  profileState.userId =
    userId;

  try {
    const {
      data,
      error,
    } = await client
      .from(
        APP_CONFIG?.tables
          ?.profiles ||
          "profiles"
      )
      .select("*")
      .eq(
        "id",
        userId
      )
      .maybeSingle();

    if (error) {
      console.warn(
        "refreshProfile:",
        error
      );

      return profileState;
    }

    if (data) {
      profileState.profile =
        data;

      profileState.role =
        normalizeRole(
          data.role
        );

      profileState.originalName =
        text(
          data.full_name,
          profileState.originalName
        );

      profileState.originalEmail =
        text(
          data.email,
          profileState.originalEmail
        );

      profileState.avatarUrl =
        data.avatar_url ||
        profileState.avatarUrl;

      profileState.userId =
        data.id ||
        userId;
    }

    updateNavigationProfile();
    updateDashboardProfile();

    if (
      profileState.modalOpen
    ) {
      populateProfileForm();
    }
  } catch (error) {
    console.warn(
      "refreshProfile exception:",
      error
    );
  }

  return profileState;
}

/* ============================================================
   LOG PROFILE ACTIVITY
   ============================================================ */

async function logProfileActivity(
  action,
  metadata = {}
) {
  const userId =
    getValidUserId();

  try {
    await logActivity(
      action,
      {
        user_id:
          userId ||
          null,

        metadata,
      }
    );

    return;
  } catch (error) {
    console.warn(
      "logActivity helper failed:",
      error
    );
  }

  /*
   * Direct fallback.
   */
  try {
    const client =
      getClient();

    if (!client) {
      return;
    }

    await client
      .from(
        APP_CONFIG?.tables
          ?.activities ||
          "activity_logs"
      )
      .insert({
        user_id:
          userId ||
          null,

        action,

        event_type:
          action,

        metadata,

        details:
          metadata,

        created_at:
          new Date().toISOString(),
      });
  } catch (error) {
    console.warn(
      "Profile activity log failed:",
      error
    );
  }
}

/* ============================================================
   LOGOUT
   ============================================================ */

function bindLogoutButton() {
  $("logoutBtn")
    ?.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        await logoutFromProfile();
      }
    );
}

export async function logoutFromProfile() {
  const confirmed =
    window.confirm(
      "Are you sure you want to log out?"
    );

  if (!confirmed) {
    return false;
  }

  try {
    await logProfileActivity(
      "logout",
      {}
    );
  } catch {
    /*
     * Activity logging must never
     * prevent logout.
     */
  }

  try {
    await signOut();

    closeProfile();

    return true;
  } catch (error) {
    console.error(
      "logoutFromProfile:",
      error
    );

    toast(
      error?.message ||
        "Unable to log out.",
      "error"
    );

    return false;
  }
}

/* ============================================================
   AUTH EVENTS
   ============================================================ */

function bindAuthEvents() {
  window.addEventListener(
    "authStateChanged",
    async () => {
      refreshState();

      if (
        !profileState.user ||
        !getValidUserId()
      ) {
        closeProfile();

        clearProfileUI();

        return;
      }

      await refreshProfile();
    }
  );

  window.addEventListener(
    "profileUpdated",
    () => {
      refreshState();

      updateNavigationProfile();
      updateDashboardProfile();
    }
  );
}

function clearProfileUI() {
  setText(
    $("navProfileName"),
    ""
  );

  const navAvatar =
    $("navAvatar");

  if (navAvatar) {
    navAvatar.innerHTML =
      "";

    navAvatar.classList.remove(
      "has-avatar"
    );
  }

  setText(
    $("dashboardUserName"),
    ""
  );

  setText(
    $("dashboardRoleText"),
    ""
  );

  const dashboardAvatar =
    $("dashboardAvatar");

  if (dashboardAvatar) {
    dashboardAvatar.removeAttribute(
      "src"
    );

    showElement(
      dashboardAvatar,
      false
    );
  }

  const dashboardFallback =
    $("dashboardAvatarFallback");

  if (dashboardFallback) {
    showElement(
      dashboardFallback,
      false
    );
  }

  /*
   * Clear local profile state after
   * logout/auth expiration.
   */
  profileState.user =
    null;

  profileState.profile =
    null;

  profileState.userId =
    null;

  profileState.role =
    null;

  profileState.originalName =
    "";

  profileState.originalEmail =
    "";

  profileState.avatarUrl =
    null;
}

/* ============================================================
   ADMIN PROTECTION
   ============================================================ */

export function isProtectedAdminProfile() {
  refreshState();

  const email =
    String(
      profileState.user?.email ||
        profileState.profile?.email ||
        ""
    )
      .trim()
      .toLowerCase();

  return (
    isAdminRole(
      profileState.role
    ) ||
    email ===
      currentAdminEmail()
  );
}

/*
 * Profile page never exposes controls
 * for changing role or email.
 */
export function canEditProfileField(
  field
) {
  if (
    field === "email" ||
    field === "role"
  ) {
    return false;
  }

  if (
    field === "full_name" ||
    field === "avatar"
  ) {
    return true;
  }

  return false;
}

/* ============================================================
   AVATAR URL HELPERS
   ============================================================ */

export async function getAvatarUrl(
  path
) {
  if (!path) {
    return null;
  }

  /*
   * Already a complete URL.
   */
  if (
    /^https?:\/\//i.test(
      path
    )
  ) {
    return path;
  }

  const client =
    getClient();

  if (!client) {
    return null;
  }

  const bucket =
    APP_CONFIG?.buckets
      ?.avatars ||
    APP_CONFIG?.buckets
      ?.profilePictures ||
    "avatars";

  /*
   * Public URL first.
   */
  try {
    const {
      data,
    } =
      client.storage
        .from(bucket)
        .getPublicUrl(
          path
        );

    if (
      data?.publicUrl
    ) {
      return data.publicUrl;
    }
  } catch {
    /*
     * Continue to signed URL.
     */
  }

  /*
   * Private bucket fallback.
   */
  try {
    const {
      data,
    } =
      await client.storage
        .from(bucket)
        .createSignedUrl(
          path,
          60 * 60 * 24 * 7
        );

    return (
      data?.signedUrl ||
      null
    );
  } catch {
    return null;
  }
}

/* ============================================================
   PROFILE SNAPSHOT
   ============================================================ */

export function getProfileSnapshot() {
  refreshState();

  const id =
    getValidUserId();

  return {
    id:
      id ||
      null,

    email:
      profileState.originalEmail,

    full_name:
      profileState.originalName,

    role:
      profileState.role,

    role_label:
      roleLabel(
        profileState.role
      ),

    avatar_url:
      profileState.avatarUrl,

    active:
      profileState.profile
        ?.active !== false,

    protected_admin:
      isProtectedAdminProfile(),
  };
}

/* ============================================================
   WINDOW COMPATIBILITY
   ============================================================ */

window.profile = {
  state:
    profileState,

  open:
    openProfile,

  close:
    closeProfile,

  save:
    saveProfile,

  refresh:
    refreshProfile,

  uploadAvatar:
    uploadProfileAvatar,

  updateNavigation:
    updateNavigationProfile,

  updateDashboard:
    updateDashboardProfile,

  getSnapshot:
    getProfileSnapshot,

  isProtectedAdmin:
    isProtectedAdminProfile,
};

/* ============================================================
   BOOT
   ============================================================ */

function boot() {
  initializeProfile();
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    boot,
    {
      once: true,
    }
  );
} else {
  boot();
}

/* ============================================================
   MODULE LOADED
   ============================================================ */

console.log(
  "Profile module loaded."
);
