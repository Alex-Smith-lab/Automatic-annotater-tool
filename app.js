/* =========================================================
   app.js
   Main application entry point
   ========================================================= */

import {
  initializeAuth,
  loadSessionOnStartup,
  onAuthStateChange,
  getAuthState,
  getUser,
  getProfile,
  getRole,
  isLoggedIn,
  isPendingApproval,
  isAdmin,
  isStaff,
  signOut
} from "./js/auth.js";

import {
  initializeHome,
  loadDashboard,
  refreshAvailableJobs
} from "./js/home.js";

import {
  initializeMedia
} from "./js/media.js";

import {
  initializeTasks,
  selectTask,
  clearCurrentTask
} from "./js/tasks.js";

import {
  initializeWorkspace
} from "./js/workspace.js";

import {
  initializeAnnotation
} from "./js/annotation.js";

import {
  initializeAI
} from "./js/ai.js";

import {
  initializeProfile
} from "./js/profile.js";

import {
  initializeHistory
} from "./js/history.js";

import {
  initializeAdmin
} from "./js/admin.js";

import {
  APP_CONFIG,
  normalizeRole,
  roleLabel,
  isAdminRole,
  isStaffRole
} from "./js/config.js";

import {
  getSupabase,
  checkSupabaseConnection,
  logActivity
} from "./js/supabase.js";


/* =========================================================
   GLOBAL APP STATE
   ========================================================= */

const appState = {
  initialized: false,
  initializing: false,
  currentPage: "home",
  previousPage: null,
  authReady: false,
  user: null,
  profile: null,
  role: "customer",
  pendingApproval: false,
  admin: false,
  staff: false,
  darkMode: false
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

function qsa(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

function exists(id) {
  return !!$(id);
}

function showElement(element) {
  if (!element) return;

  element.hidden = false;
  element.style.display = "";
  element.classList.remove("hidden");
}

function hideElement(element) {
  if (!element) return;

  element.hidden = true;
  element.classList.add("hidden");
}

function setDisplay(element, display) {
  if (!element) return;

  element.hidden = false;
  element.style.display = display;
  element.classList.remove("hidden");
}

function getElement(id) {
  return document.getElementById(id);
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, type = "info", duration = 3500) {
  if (!message) return;

  const container =
    $("toastContainer") ||
    document.body;

  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;

  toast.innerHTML = `
    <div class="toast-message"></div>
  `;

  const messageElement = toast.querySelector(".toast-message");

  if (messageElement) {
    messageElement.textContent = message;
  }

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  window.setTimeout(() => {
    toast.classList.remove("show");

    window.setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}


/* =========================================================
   GLOBAL COMPATIBILITY HELPERS
   ========================================================= */

window.showToast = showToast;

window.APP_CONFIG = APP_CONFIG;

window.appState = appState;


/* =========================================================
   PAGE HELPERS
   ========================================================= */

function getPages() {
  return {
    home: $("homePage"),
    annotation: $("annotationPage"),
    approval: $("approvalPage")
  };
}

function hideAllMainPages() {
  const pages = getPages();

  Object.values(pages).forEach(page => {
    if (page) {
      page.hidden = true;
      page.classList.add("hidden");
    }
  });
}

function showPage(name) {
  const pages = getPages();

  hideAllMainPages();

  const page = pages[name];

  if (!page) {
    console.warn(`Page not found: ${name}`);
    return;
  }

  page.hidden = false;
  page.classList.remove("hidden");

  appState.previousPage = appState.currentPage;
  appState.currentPage = name;

  document.body.dataset.page = name;

  window.dispatchEvent(
    new CustomEvent("pageChanged", {
      detail: {
        page: name,
        previousPage: appState.previousPage
      }
    })
  );
}

function showHomePage() {
  showPage("home");

  try {
    loadDashboard?.();
  } catch (error) {
    console.warn("Dashboard refresh failed:", error);
  }
}

function showAnnotationPage() {
  showPage("annotation");
}

function showApprovalPage() {
  showPage("approval");
}


/* =========================================================
   AUTH UI
   ========================================================= */

function showAuthPage() {
  const authPage = $("authPage");
  const topNav = $("topNav");
  const mainContent = $("mainContent");

  if (authPage) {
    showElement(authPage);
  }

  if (topNav) {
    hideElement(topNav);
  }

  if (mainContent) {
    hideElement(mainContent);
  }
}

function hideAuthPage() {
  const authPage = $("authPage");
  const topNav = $("topNav");
  const mainContent = $("mainContent");

  if (authPage) {
    hideElement(authPage);
  }

  if (topNav) {
    showElement(topNav);
  }

  if (mainContent) {
    showElement(mainContent);
  }
}


/* =========================================================
   LOADER
   ========================================================= */

function showLoader() {
  const loader = $("appLoader");

  if (!loader) return;

  loader.hidden = false;
  loader.classList.remove("hidden");
  loader.style.display = "";
}

function hideLoader() {
  const loader = $("appLoader");

  if (!loader) return;

  loader.classList.add("hidden");
  loader.style.display = "none";
}


/* =========================================================
   UPDATE APPLICATION STATE
   ========================================================= */

function updateAppAuthState() {
  const user = getUser?.() || null;
  const profile = getProfile?.() || null;
  const role = normalizeRole(
    getRole?.() ||
    profile?.role ||
    user?.user_metadata?.role ||
    "customer"
  );

  appState.user = user;
  appState.profile = profile;
  appState.role = role;

  appState.pendingApproval =
    Boolean(isPendingApproval?.());

  appState.admin =
    Boolean(isAdmin?.()) ||
    isAdminRole(role) ||
    (
      user?.email &&
      user.email.toLowerCase() ===
      String(APP_CONFIG.adminEmail || "").toLowerCase()
    );

  appState.staff =
    Boolean(isStaff?.()) ||
    isStaffRole(role);

  window.appState = appState;

  return appState;
}


/* =========================================================
   NAVIGATION VISIBILITY
   ========================================================= */

function updateNavigationVisibility() {
  const loggedIn = Boolean(isLoggedIn?.());
  const role = normalizeRole(appState.role);

  const topNav = $("topNav");
  const adminButton = $("adminCenterButton");
  const homeButton = $("homeButton");
  const historyButton = $("workHistoryButton");
  const profileButton = $("profileButton");
  const logoutButton = $("logoutBtn");

  if (!loggedIn) {
    if (topNav) hideElement(topNav);
    return;
  }

  if (topNav) {
    showElement(topNav);
  }

  if (homeButton) {
    showElement(homeButton);
  }

  if (historyButton) {
    showElement(historyButton);
  }

  if (profileButton) {
    showElement(profileButton);
  }

  if (logoutButton) {
    showElement(logoutButton);
  }

  /*
   * Admin icon must only be visible to admin users.
   * Staff can have administrative access in the application,
   * but the dedicated admin icon remains an admin-only control.
   */
  if (adminButton) {
    if (appState.admin) {
      showElement(adminButton);
    } else {
      hideElement(adminButton);
    }
  }

  document.body.dataset.role = role;
}


/* =========================================================
   APPROVAL STATE
   ========================================================= */

function userCanEnterWorkspace() {
  if (!appState.user) {
    return false;
  }

  if (appState.admin || appState.staff) {
    return true;
  }

  if (appState.pendingApproval) {
    return false;
  }

  return true;
}

function updateApprovalUI() {
  if (!appState.user) {
    return;
  }

  if (appState.pendingApproval) {
    showApprovalPage();
    return;
  }

  if (appState.currentPage === "approval") {
    showHomePage();
  }
}


/* =========================================================
   TOP NAVIGATION
   ========================================================= */

function bindNavigation() {
  const homeButton = $("homeButton");
  const settingsButton = $("settingsButton");
  const workHistoryButton = $("workHistoryButton");
  const profileButton = $("profileButton");
  const adminCenterButton = $("adminCenterButton");
  const logoutButton = $("logoutBtn");

  homeButton?.addEventListener("click", event => {
    event.preventDefault();

    if (!userCanEnterWorkspace()) {
      showApprovalPage();
      return;
    }

    closeAllModals();
    showHomePage();
  });

  settingsButton?.addEventListener("click", event => {
    event.preventDefault();

    closeTransientPanels();

    /*
     * workspace.js normally owns settings modal behavior.
     * The event is also dispatched so another module can respond.
     */
    window.dispatchEvent(
      new CustomEvent("openSettingsRequested")
    );

    const settingsModal = $("settingsModal");

    if (settingsModal) {
      showElement(settingsModal);
      settingsModal.classList.add("open");
    }
  });

  workHistoryButton?.addEventListener("click", event => {
    event.preventDefault();

    closeTransientPanels();

    window.dispatchEvent(
      new CustomEvent("openWorkHistoryRequested")
    );

    const modal = $("workHistoryModal");

    if (modal) {
      showElement(modal);
      modal.classList.add("open");
    }
  });

  profileButton?.addEventListener("click", event => {
    event.preventDefault();

    closeTransientPanels();

    window.dispatchEvent(
      new CustomEvent("openProfileRequested")
    );

    const modal = $("profileModal");

    if (modal) {
      showElement(modal);
      modal.classList.add("open");
    }
  });

  adminCenterButton?.addEventListener("click", event => {
    event.preventDefault();

    if (!appState.admin) {
      showToast(
        "You do not have permission to open the admin center.",
        "error"
      );
      return;
    }

    closeTransientPanels();

    window.dispatchEvent(
      new CustomEvent("openAdminRequested")
    );

    const modal = $("adminModal");

    if (modal) {
      showElement(modal);
      modal.classList.add("open");
    }
  });

  logoutButton?.addEventListener("click", async event => {
    event.preventDefault();

    await handleLogout();
  });
}


/* =========================================================
   MODAL MANAGEMENT
   ========================================================= */

function closeModal(id) {
  const modal = $(id);

  if (!modal) return;

  modal.classList.remove("open");
  modal.hidden = true;
  modal.style.display = "none";
}

function openModal(id) {
  const modal = $(id);

  if (!modal) return;

  modal.hidden = false;
  modal.style.display = "";
  modal.classList.add("open");
}

function closeAllModals() {
  [
    "profileModal",
    "settingsModal",
    "workHistoryModal",
    "skipModal",
    "createTaskModal",
    "createCoworkerModal",
    "adminModal"
  ].forEach(closeModal);
}

function closeTransientPanels() {
  const skipModal = $("skipModal");

  if (skipModal) {
    skipModal.classList.remove("open");
  }
}


/* =========================================================
   AUTH LOGOUT
   ========================================================= */

async function handleLogout() {
  try {
    await logActivity?.(
      "logout",
      {
        source: "app",
        role: appState.role
      }
    );
  } catch {
    // Activity logging should never prevent logout.
  }

  try {
    await signOut();

    appState.user = null;
    appState.profile = null;
    appState.role = "customer";
    appState.pendingApproval = false;
    appState.admin = false;
    appState.staff = false;

    closeAllModals();

    hideAllMainPages();
    showAuthPage();

    showToast("You have been signed out.", "success");
  } catch (error) {
    console.error("Logout error:", error);

    showToast(
      error?.message ||
      "Unable to sign out. Please try again.",
      "error"
    );
  }
}


/* =========================================================
   AUTH STATE HANDLER
   ========================================================= */

async function handleAuthenticatedUser() {
  updateAppAuthState();
  updateNavigationVisibility();
  hideAuthPage();

  /*
   * Admin/staff bypass normal approval gating.
   */
  if (
    appState.pendingApproval &&
    !appState.admin &&
    !appState.staff
  ) {
    showApprovalPage();

    window.dispatchEvent(
      new CustomEvent("approvalRequired", {
        detail: {
          user: appState.user,
          profile: appState.profile,
          role: appState.role
        }
      })
    );

    return;
  }

  showHomePage();

  /*
   * Refresh dashboard after authentication.
   */
  try {
    await loadDashboard?.();
  } catch (error) {
    console.warn("Unable to load dashboard:", error);
  }

  /*
   * Notify all modules.
   */
  window.dispatchEvent(
    new CustomEvent("appAuthenticated", {
      detail: {
        user: appState.user,
        profile: appState.profile,
        role: appState.role
      }
    })
  );
}

function handleUnauthenticatedUser() {
  appState.user = null;
  appState.profile = null;
  appState.role = "customer";
  appState.pendingApproval = false;
  appState.admin = false;
  appState.staff = false;

  updateNavigationVisibility();

  closeAllModals();
  hideAllMainPages();
  showAuthPage();

  window.dispatchEvent(
    new CustomEvent("appUnauthenticated")
  );
}


/* =========================================================
   TASK EVENTS
   ========================================================= */

function bindTaskEvents() {
  /*
   * Task selected by dashboard/workbench.
   */
  window.addEventListener("taskSelected", async event => {
    const task =
      event.detail?.task ||
      event.detail ||
      null;

    if (!task) return;

    if (!userCanEnterWorkspace()) {
      showApprovalPage();
      return;
    }

    showAnnotationPage();

    /*
     * If the event came from home.js, tasks.js may already
     * have selected the task. If not, select it here.
     */
    try {
      if (
        task.id &&
        typeof selectTask === "function"
      ) {
        await selectTask(task);
      }
    } catch (error) {
      console.warn("Task selection handling failed:", error);
    }

    window.dispatchEvent(
      new CustomEvent("annotationPageOpened", {
        detail: {
          task
        }
      })
    );
  });

  window.addEventListener("openTask", async event => {
    const task =
      event.detail?.task ||
      event.detail ||
      null;

    if (!task) return;

    if (!userCanEnterWorkspace()) {
      showApprovalPage();
      return;
    }

    try {
      await selectTask(task);
    } catch (error) {
      console.error("Unable to select task:", error);

      showToast(
        error?.message ||
        "Unable to open this task.",
        "error"
      );

      return;
    }

    showAnnotationPage();
  });

  window.addEventListener("taskCleared", () => {
    if (appState.currentPage === "annotation") {
      showHomePage();
    }
  });

  window.addEventListener("taskSubmitted", event => {
    showHomePage();

    try {
      refreshAvailableJobs?.();
    } catch {
      // Ignore refresh failures.
    }

    window.dispatchEvent(
      new CustomEvent("dashboardRefreshRequested", {
        detail: event.detail || {}
      })
    );
  });

  window.addEventListener("taskSkipped", event => {
    showHomePage();

    try {
      refreshAvailableJobs?.();
    } catch {
      // Ignore refresh failures.
    }

    window.dispatchEvent(
      new CustomEvent("dashboardRefreshRequested", {
        detail: event.detail || {}
      })
    );
  });
}


/* =========================================================
   BACK BUTTON
   ========================================================= */

function bindBackButtons() {
  $("backToHomeButton")?.addEventListener("click", async event => {
    event.preventDefault();

    try {
      /*
       * Save current frame/annotations before leaving when
       * tasks.js/annotation.js expose their save mechanism.
       */
      window.dispatchEvent(
        new CustomEvent("beforeWorkspaceExit")
      );
    } catch {
      // Do not block navigation.
    }

    try {
      await clearCurrentTask?.();
    } catch (error) {
      console.warn("Unable to clear current task:", error);
    }

    showHomePage();
  });

  $("approvalLogoutButton")?.addEventListener(
    "click",
    async event => {
      event.preventDefault();

      await handleLogout();
    }
  );
}


/* =========================================================
   AUTH FORM COMPATIBILITY
   ========================================================= */

function bindAuthFormEvents() {
  /*
   * auth.js owns the actual authentication forms.
   * These listeners only provide fallback navigation between
   * login and signup panels.
   */

  $("showSignupButton")?.addEventListener("click", event => {
    event.preventDefault();

    const loginPanel = $("loginPanel");
    const signupPanel = $("signupPanel");

    if (loginPanel) hideElement(loginPanel);
    if (signupPanel) showElement(signupPanel);
  });

  $("showLoginButton")?.addEventListener("click", event => {
    event.preventDefault();

    const loginPanel = $("loginPanel");
    const signupPanel = $("signupPanel");

    if (signupPanel) hideElement(signupPanel);
    if (loginPanel) showElement(loginPanel);
  });

  $("forgotPasswordButton")?.addEventListener(
    "click",
    () => {
      window.dispatchEvent(
        new CustomEvent("passwordResetRequested")
      );
    }
  );
}


/* =========================================================
   GLOBAL KEYBOARD SHORTCUTS
   ========================================================= */

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", event => {
    /*
     * Escape closes open modals.
     */
    if (event.key === "Escape") {
      const openModalElement = qs(
        ".modal.open, [role='dialog'].open"
      );

      if (openModalElement) {
        openModalElement.classList.remove("open");
      }
    }

    /*
     * Ctrl/Cmd + S
     * Let annotation/tasks modules handle saving.
     */
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "s"
    ) {
      if (appState.currentPage === "annotation") {
        event.preventDefault();

        window.dispatchEvent(
          new CustomEvent("saveRequested")
        );
      }
    }

    /*
     * Ctrl/Cmd + Z
     */
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "z" &&
      !event.shiftKey
    ) {
      if (appState.currentPage === "annotation") {
        const undoButton = $("undoBtn");

        if (undoButton) {
          event.preventDefault();
          undoButton.click();
        }
      }
    }

    /*
     * Ctrl/Cmd + Shift + Z
     * Ctrl/Cmd + Y
     */
    if (
      (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) ||
      (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "y"
      )
    ) {
      if (appState.currentPage === "annotation") {
        const redoButton = $("redoBtn");

        if (redoButton) {
          event.preventDefault();
          redoButton.click();
        }
      }
    }
  });
}


/* =========================================================
   ONLINE / OFFLINE
   ========================================================= */

function bindNetworkEvents() {
  window.addEventListener("online", () => {
    document.body.classList.remove("offline");

    showToast(
      "Connection restored.",
      "success"
    );

    window.dispatchEvent(
      new CustomEvent("networkOnline")
    );

    if (isLoggedIn?.()) {
      try {
        refreshAvailableJobs?.();
      } catch {
        // Ignore refresh failures.
      }
    }
  });

  window.addEventListener("offline", () => {
    document.body.classList.add("offline");

    showToast(
      "You are offline. Changes may be saved when connection returns.",
      "warning",
      5000
    );

    window.dispatchEvent(
      new CustomEvent("networkOffline")
    );
  });
}


/* =========================================================
   CONNECTION CHECK
   ========================================================= */

async function checkConnection() {
  try {
    const result =
      await checkSupabaseConnection?.();

    if (result === false) {
      console.warn("Supabase connection check failed.");
    }

    return result;
  } catch (error) {
    console.warn(
      "Supabase connection could not be checked:",
      error
    );

    return false;
  }
}


/* =========================================================
   MODULE INITIALIZATION
   ========================================================= */

async function initializeModules() {
  /*
   * Initialization order matters:
   *
   * 1. Auth
   * 2. Annotation/media
   * 3. Tasks/workspace
   * 4. Dashboard
   * 5. AI
   * 6. Profile/history/admin
   */

  const initializers = [
    ["annotation", initializeAnnotation],
    ["media", initializeMedia],
    ["tasks", initializeTasks],
    ["workspace", initializeWorkspace],
    ["home", initializeHome],
    ["ai", initializeAI],
    ["profile", initializeProfile],
    ["history", initializeHistory],
    ["admin", initializeAdmin]
  ];

  for (const [name, initializer] of initializers) {
    if (typeof initializer !== "function") {
      console.warn(
        `Initializer for ${name} is not available.`
      );
      continue;
    }

    try {
      await initializer();

      console.info(
        `[app] ${name} initialized`
      );
    } catch (error) {
      console.error(
        `[app] Failed to initialize ${name}:`,
        error
      );
    }
  }
}


/* =========================================================
   AUTH INITIALIZATION
   ========================================================= */

async function initializeAuthentication() {
  try {
    /*
     * Initialize auth module first.
     */
    if (typeof initializeAuth === "function") {
      await initializeAuth();
    }

    /*
     * Load persisted/cloud session.
     */
    if (typeof loadSessionOnStartup === "function") {
      await loadSessionOnStartup();
    }

    updateAppAuthState();

    appState.authReady = true;

    /*
     * Subscribe to future auth changes.
     */
    if (typeof onAuthStateChange === "function") {
      onAuthStateChange(async state => {
        try {
          updateAppAuthState();

          if (state?.authenticated || isLoggedIn?.()) {
            await handleAuthenticatedUser();
          } else {
            handleUnauthenticatedUser();
          }
        } catch (error) {
          console.error(
            "Auth state update failed:",
            error
          );
        }
      });
    }

    if (isLoggedIn?.()) {
      await handleAuthenticatedUser();
    } else {
      handleUnauthenticatedUser();
    }
  } catch (error) {
    console.error(
      "Authentication initialization failed:",
      error
    );

    appState.authReady = true;

    handleUnauthenticatedUser();

    showToast(
      error?.message ||
      "Unable to initialize authentication.",
      "error",
      6000
    );
  }
}


/* =========================================================
   APP EVENT BRIDGE
   ========================================================= */

function bindApplicationEvents() {
  /*
   * Authentication.
   */
  window.addEventListener(
    "authStateChanged",
    async () => {
      updateAppAuthState();
      updateNavigationVisibility();

      if (isLoggedIn?.()) {
        await handleAuthenticatedUser();
      } else {
        handleUnauthenticatedUser();
      }
    }
  );

  window.addEventListener(
    "authChanged",
    async () => {
      updateAppAuthState();
      updateNavigationVisibility();

      if (isLoggedIn?.()) {
        await handleAuthenticatedUser();
      } else {
        handleUnauthenticatedUser();
      }
    }
  );

  /*
   * Profile updates.
   */
  window.addEventListener(
    "profileUpdated",
    event => {
      if (event.detail?.profile) {
        appState.profile =
          event.detail.profile;

        appState.role =
          normalizeRole(
            event.detail.profile.role ||
            appState.role
          );
      }

      updateAppAuthState();
      updateNavigationVisibility();
    }
  );

  /*
   * Role changes.
   */
  window.addEventListener(
    "roleChanged",
    event => {
      const newRole =
        event.detail?.role;

      if (newRole) {
        appState.role =
          normalizeRole(newRole);
      }

      updateAppAuthState();
      updateNavigationVisibility();
    }
  );

  /*
   * Approval status.
   */
  window.addEventListener(
    "approvalStatusChanged",
    event => {
      const active =
        event.detail?.active;

      if (typeof active === "boolean") {
        appState.pendingApproval =
          !active &&
          !appState.admin &&
          !appState.staff;
      }

      updateApprovalUI();
    }
  );

  /*
   * Dashboard refresh.
   */
  window.addEventListener(
    "dashboardRefreshRequested",
    async () => {
      if (!isLoggedIn?.()) return;

      try {
        await refreshAvailableJobs?.();
      } catch (error) {
        console.warn(
          "Dashboard refresh failed:",
          error
        );
      }
    }
  );

  /*
   * Save request.
   */
  window.addEventListener(
    "saveRequested",
    () => {
      const button =
        $("saveAnnotationsButton");

      if (
        appState.currentPage === "annotation" &&
        button
      ) {
        button.click();
      }
    }
  );
}


/* =========================================================
   BODY / DOCUMENT INITIALIZATION
   ========================================================= */

function initializeDocument() {
  document.documentElement.classList.add(
    "app-initialized"
  );

  document.body.classList.add(
    "application-ready"
  );

  /*
   * Make role available to CSS.
   */
  document.body.dataset.role =
    normalizeRole(appState.role);

  /*
   * Prevent accidental drag/drop navigation when a file
   * is dropped outside the upload area.
   */
  document.addEventListener(
    "dragover",
    event => {
      if (
        event.target.closest(
          "#customerUploadPanel, #workbenchUpload"
        )
      ) {
        return;
      }

      event.preventDefault();
    }
  );

  document.addEventListener(
    "drop",
    event => {
      if (
        event.target.closest(
          "#customerUploadPanel, #workbenchUpload"
        )
      ) {
        return;
      }

      event.preventDefault();
    }
  );
}


/* =========================================================
   PERIODIC DASHBOARD REFRESH
   ========================================================= */

let dashboardRefreshTimer = null;

function startDashboardRefresh() {
  if (dashboardRefreshTimer) {
    clearInterval(dashboardRefreshTimer);
  }

  /*
   * Refresh available jobs periodically while logged in.
   */
  dashboardRefreshTimer =
    window.setInterval(
      async () => {
        if (
          !isLoggedIn?.() ||
          appState.pendingApproval
        ) {
          return;
        }

        if (
          appState.currentPage !== "home"
        ) {
          return;
        }

        try {
          await refreshAvailableJobs?.();
        } catch (error) {
          console.warn(
            "Periodic dashboard refresh failed:",
            error
          );
        }
      },
      60000
    );
}


/* =========================================================
   CLEANUP
   ========================================================= */

function cleanupBeforeUnload() {
  window.addEventListener(
    "beforeunload",
    () => {
      try {
        window.dispatchEvent(
          new CustomEvent("appBeforeUnload")
        );
      } catch {
        // Ignore.
      }

      if (dashboardRefreshTimer) {
        clearInterval(
          dashboardRefreshTimer
        );
      }
    }
  );
}


/* =========================================================
   MAIN INITIALIZATION
   ========================================================= */

async function initializeApp() {
  if (appState.initialized) {
    return;
  }

  if (appState.initializing) {
    return;
  }

  appState.initializing = true;

  showLoader();

  try {
    console.info(
      "[app] Starting application..."
    );

    initializeDocument();

    /*
     * Bind application-level events before modules so that
     * early module events are not lost.
     */
    bindNavigation();
    bindAuthFormEvents();
    bindTaskEvents();
    bindBackButtons();
    bindKeyboardShortcuts();
    bindNetworkEvents();
    bindApplicationEvents();

    /*
     * Check Supabase without blocking the application.
     */
    checkConnection();

    /*
     * Initialize authentication before user-dependent
     * modules.
     */
    await initializeAuthentication();

    /*
     * Initialize remaining application modules.
     */
    await initializeModules();

    /*
     * Update final state after every module has initialized.
     */
    updateAppAuthState();
    updateNavigationVisibility();
    updateApprovalUI();

    /*
     * Start dashboard polling.
     */
    startDashboardRefresh();

    cleanupBeforeUnload();

    appState.initialized = true;

    window.dispatchEvent(
      new CustomEvent("appReady", {
        detail: {
          user: appState.user,
          profile: appState.profile,
          role: appState.role,
          authenticated: Boolean(appState.user)
        }
      })
    );

    console.info(
      "[app] Application ready"
    );
  } catch (error) {
    console.error(
      "[app] Fatal initialization error:",
      error
    );

    showToast(
      error?.message ||
      "The application could not be initialized.",
      "error",
      7000
    );
  } finally {
    appState.initializing = false;

    hideLoader();
  }
}


/* =========================================================
   START APPLICATION
   ========================================================= */

if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initializeApp,
    { once: true }
  );
} else {
  initializeApp();
}


/* =========================================================
   PUBLIC APP API
   ========================================================= */

window.app = {
  state: appState,

  initialize: initializeApp,

  showHome: showHomePage,

  showAnnotation: showAnnotationPage,

  showApproval: showApprovalPage,

  showPage,

  openModal,

  closeModal,

  closeAllModals,

  refreshDashboard: async () => {
    try {
      return await refreshAvailableJobs?.();
    } catch (error) {
      console.error(
        "Dashboard refresh failed:",
        error
      );
      return null;
    }
  },

  logout: handleLogout,

  getState: () => ({
    ...appState
  }),

  getUser: () =>
    getUser?.() || appState.user,

  getProfile: () =>
    getProfile?.() || appState.profile,

  getRole: () =>
    normalizeRole(
      getRole?.() ||
      appState.role
    ),

  isAdmin: () =>
    Boolean(
      isAdmin?.() ||
      appState.admin
    ),

  isStaff: () =>
    Boolean(
      isStaff?.() ||
      appState.staff
    ),

  roleLabel: () =>
    roleLabel(
      normalizeRole(appState.role)
    )
};


/* =========================================================
   BACKWARD COMPATIBILITY
   ========================================================= */

window.openHome = showHomePage;
window.openAnnotation = showAnnotationPage;
window.openApproval = showApprovalPage;
window.logoutUser = handleLogout;


/* =========================================================
   END app.js
   ========================================================= */
