/* =========================================================
   app.js
   Main application entry point
   ========================================================= */

import {
  initializeAuth,
  loadSessionOnStartup,
  onAuthStateChange,
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

  darkMode: false,

  /*
   * Prevent duplicate task selection when more than one
   * module emits the same task event.
   */
  selectingTaskId: null,
  currentTaskId: null
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


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, type = "info", duration = 3500) {
  if (!message) return;

  let container = $("toastContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";

    document.body.appendChild(container);
  }

  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;

  toast.innerHTML = `
    <div class="toast-message"></div>
  `;

  const messageElement =
    toast.querySelector(".toast-message");

  if (messageElement) {
    messageElement.textContent = String(message);
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
   GLOBAL COMPATIBILITY
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
    if (!page) return;

    page.hidden = true;
    page.classList.add("hidden");
  });
}


function showPage(name) {
  const pages = getPages();

  hideAllMainPages();

  const page = pages[name];

  if (!page) {
    console.warn(`[app] Page not found: ${name}`);
    return false;
  }

  page.hidden = false;
  page.classList.remove("hidden");

  appState.previousPage =
    appState.currentPage;

  appState.currentPage = name;

  document.body.dataset.page = name;

  window.dispatchEvent(
    new CustomEvent("pageChanged", {
      detail: {
        page: name,
        previousPage:
          appState.previousPage
      }
    })
  );

  return true;
}


function showHomePage() {
  if (!appState.user) {
    showAuthPage();
    return;
  }

  if (
    appState.pendingApproval &&
    !appState.admin &&
    !appState.staff
  ) {
    showApprovalPage();
    return;
  }

  showPage("home");

  try {
    loadDashboard?.();
  } catch (error) {
    console.warn(
      "[app] Dashboard refresh failed:",
      error
    );
  }
}


function showAnnotationPage() {
  if (!appState.user) {
    showAuthPage();
    return;
  }

  if (
    appState.pendingApproval &&
    !appState.admin &&
    !appState.staff
  ) {
    showApprovalPage();
    return;
  }

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
   APPLICATION AUTH STATE
   ========================================================= */

function updateAppAuthState() {
  const user =
    typeof getUser === "function"
      ? getUser()
      : null;

  const profile =
    typeof getProfile === "function"
      ? getProfile()
      : null;

  const rawRole =
    typeof getRole === "function"
      ? getRole()
      : null;

  const role = normalizeRole(
    rawRole ||
    profile?.role ||
    user?.user_metadata?.role ||
    "customer"
  );

  appState.user = user || null;
  appState.profile = profile || null;
  appState.role = role;

  appState.pendingApproval =
    typeof isPendingApproval === "function"
      ? Boolean(isPendingApproval())
      : Boolean(
          user &&
          profile &&
          profile.active === false
        );

  const email =
    String(user?.email || "")
      .trim()
      .toLowerCase();

  const configuredAdminEmail =
    String(
      APP_CONFIG.adminEmail || ""
    )
      .trim()
      .toLowerCase();

  appState.admin =
    (
      typeof isAdmin === "function" &&
      Boolean(isAdmin())
    ) ||
    isAdminRole(role) ||
    (
      email &&
      configuredAdminEmail &&
      email === configuredAdminEmail
    );

  appState.staff =
    (
      typeof isStaff === "function" &&
      Boolean(isStaff())
    ) ||
    isStaffRole(role);

  window.appState = appState;

  return appState;
}


/* =========================================================
   NAVIGATION VISIBILITY
   ========================================================= */

function updateNavigationVisibility() {
  const loggedIn =
    typeof isLoggedIn === "function"
      ? Boolean(isLoggedIn())
      : Boolean(appState.user);

  const role =
    normalizeRole(appState.role);

  const topNav = $("topNav");
  const adminButton =
    $("adminCenterButton");
  const homeButton =
    $("homeButton");
  const historyButton =
    $("workHistoryButton");
  const profileButton =
    $("profileButton");
  const logoutButton =
    $("logoutBtn");

  if (!loggedIn) {
    if (topNav) {
      hideElement(topNav);
    }

    if (adminButton) {
      hideElement(adminButton);
    }

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
   * ONLY administrators see the admin icon.
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
   WORKSPACE ACCESS
   ========================================================= */

function userCanEnterWorkspace() {
  if (!appState.user) {
    return false;
  }

  /*
   * Admin and staff bypass approval.
   */
  if (
    appState.admin ||
    appState.staff
  ) {
    return true;
  }

  /*
   * Normal users must have active=true.
   */
  if (appState.pendingApproval) {
    return false;
  }

  return true;
}


/* =========================================================
   APPROVAL UI
   ========================================================= */

function updateApprovalUI() {
  if (!appState.user) {
    return;
  }

  if (
    appState.pendingApproval &&
    !appState.admin &&
    !appState.staff
  ) {
    showApprovalPage();
    return;
  }

  if (
    appState.currentPage === "approval"
  ) {
    showHomePage();
  }
}


/* =========================================================
   TOP NAVIGATION
   ========================================================= */

function bindNavigation() {
  const homeButton =
    $("homeButton");

  const settingsButton =
    $("settingsButton");

  const workHistoryButton =
    $("workHistoryButton");

  const profileButton =
    $("profileButton");

  const adminCenterButton =
    $("adminCenterButton");

  const logoutButton =
    $("logoutBtn");


  /* HOME */

  homeButton?.addEventListener(
    "click",
    event => {
      event.preventDefault();

      if (!userCanEnterWorkspace()) {
        showApprovalPage();
        return;
      }

      closeAllModals();

      showHomePage();
    }
  );


  /* SETTINGS */

  settingsButton?.addEventListener(
    "click",
    event => {
      event.preventDefault();

      if (!appState.user) {
        return;
      }

      closeTransientPanels();

      window.dispatchEvent(
        new CustomEvent(
          "openSettingsRequested"
        )
      );

      const settingsModal =
        $("settingsModal");

      if (settingsModal) {
        showElement(settingsModal);
        settingsModal.classList.add("open");
      }
    }
  );


  /* WORK HISTORY */

  workHistoryButton?.addEventListener(
    "click",
    event => {
      event.preventDefault();

      if (!appState.user) {
        return;
      }

      closeTransientPanels();

      window.dispatchEvent(
        new CustomEvent(
          "openWorkHistoryRequested"
        )
      );

      const modal =
        $("workHistoryModal");

      if (modal) {
        showElement(modal);
        modal.classList.add("open");
      }
    }
  );


  /* PROFILE */

  profileButton?.addEventListener(
    "click",
    event => {
      event.preventDefault();

      if (!appState.user) {
        return;
      }

      closeTransientPanels();

      window.dispatchEvent(
        new CustomEvent(
          "openProfileRequested"
        )
      );

      const modal =
        $("profileModal");

      if (modal) {
        showElement(modal);
        modal.classList.add("open");
      }
    }
  );


  /* ADMIN CENTER */

  adminCenterButton?.addEventListener(
    "click",
    event => {
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
        new CustomEvent(
          "openAdminRequested"
        )
      );

      const modal =
        $("adminModal");

      if (modal) {
        showElement(modal);
        modal.classList.add("open");
      }
    }
  );


  /* LOGOUT */

  logoutButton?.addEventListener(
    "click",
    async event => {
      event.preventDefault();

      await handleLogout();
    }
  );
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
  const skipModal =
    $("skipModal");

  if (skipModal) {
    skipModal.classList.remove("open");
  }
}


/* =========================================================
   LOGOUT
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
    /*
     * Logging failure must never prevent logout.
     */
  }

  try {
    await signOut();

    appState.user = null;
    appState.profile = null;
    appState.role = "customer";

    appState.pendingApproval = false;

    appState.admin = false;
    appState.staff = false;

    appState.currentTaskId = null;
    appState.selectingTaskId = null;

    closeAllModals();

    hideAllMainPages();

    showAuthPage();

    showToast(
      "You have been signed out.",
      "success"
    );

  } catch (error) {
    console.error(
      "[app] Logout error:",
      error
    );

    showToast(
      error?.message ||
      "Unable to sign out. Please try again.",
      "error"
    );
  }
}


/* =========================================================
   AUTHENTICATED USER
   ========================================================= */

async function handleAuthenticatedUser(
  options = {}
) {
  const {
    refreshDashboard: shouldRefreshDashboard = true
  } = options;

  updateAppAuthState();

  updateNavigationVisibility();

  hideAuthPage();


  /*
   * Pending customers are blocked.
   */
  if (
    appState.pendingApproval &&
    !appState.admin &&
    !appState.staff
  ) {
    showApprovalPage();

    window.dispatchEvent(
      new CustomEvent(
        "approvalRequired",
        {
          detail: {
            user: appState.user,
            profile: appState.profile,
            role: appState.role
          }
        }
      )
    );

    return;
  }


  /*
   * Approved users/admin/staff.
   */
  showPage("home");


  /*
   * Do not repeatedly load the dashboard for
   * every auth event unless requested.
   */
  if (shouldRefreshDashboard) {
    try {
      await loadDashboard?.();
    } catch (error) {
      console.warn(
        "[app] Unable to load dashboard:",
        error
      );
    }
  }


  window.dispatchEvent(
    new CustomEvent(
      "appAuthenticated",
      {
        detail: {
          user: appState.user,
          profile: appState.profile,
          role: appState.role
        }
      }
    )
  );
}


function handleUnauthenticatedUser() {
  appState.user = null;
  appState.profile = null;

  appState.role = "customer";

  appState.pendingApproval = false;

  appState.admin = false;
  appState.staff = false;

  appState.currentTaskId = null;
  appState.selectingTaskId = null;

  updateNavigationVisibility();

  closeAllModals();

  hideAllMainPages();

  showAuthPage();

  window.dispatchEvent(
    new CustomEvent(
      "appUnauthenticated"
    )
  );
}


/* =========================================================
   TASK EVENT HELPERS
   ========================================================= */

function extractTaskFromEvent(event) {
  return (
    event?.detail?.task ||
    event?.detail ||
    null
  );
}


async function openTaskSafely(task) {
  if (!task?.id) {
    return false;
  }

  if (!userCanEnterWorkspace()) {
    showApprovalPage();
    return false;
  }


  /*
   * If this is already the active task, do not claim it again.
   */
  if (
    appState.currentTaskId === task.id
  ) {
    showAnnotationPage();

    return true;
  }


  /*
   * Prevent simultaneous duplicate selection.
   */
  if (
    appState.selectingTaskId === task.id
  ) {
    showAnnotationPage();

    return true;
  }


  appState.selectingTaskId =
    task.id;

  try {
    await selectTask(task);

    appState.currentTaskId =
      task.id;

    showAnnotationPage();

    window.dispatchEvent(
      new CustomEvent(
        "annotationPageOpened",
        {
          detail: {
            task
          }
        }
      )
    );

    return true;

  } catch (error) {
    console.error(
      "[app] Unable to select task:",
      error
    );

    showToast(
      error?.message ||
      "Unable to open this task.",
      "error"
    );

    return false;

  } finally {
    appState.selectingTaskId = null;
  }
}


/* =========================================================
   TASK EVENTS
   ========================================================= */

function bindTaskEvents() {

  /*
   * TASK SELECTED
   *
   * Home/workbench can emit this event.
   */
  window.addEventListener(
    "taskSelected",
    async event => {
      const task =
        extractTaskFromEvent(event);

      if (!task) return;

      await openTaskSafely(task);
    }
  );


  /*
   * OPEN TASK
   */
  window.addEventListener(
    "openTask",
    async event => {
      const task =
        extractTaskFromEvent(event);

      if (!task) return;

      await openTaskSafely(task);
    }
  );


  /*
   * TASK CLEARED
   */
  window.addEventListener(
    "taskCleared",
    () => {
      appState.currentTaskId = null;
      appState.selectingTaskId = null;

      if (
        appState.currentPage ===
        "annotation"
      ) {
        showHomePage();
      }
    }
  );


  /*
   * TASK SUBMITTED
   */
  window.addEventListener(
    "taskSubmitted",
    event => {
      appState.currentTaskId = null;
      appState.selectingTaskId = null;

      showHomePage();

      try {
        refreshAvailableJobs?.();
      } catch {
        // Ignore refresh failures.
      }

      window.dispatchEvent(
        new CustomEvent(
          "dashboardRefreshRequested",
          {
            detail:
              event.detail || {}
          }
        )
      );
    }
  );


  /*
   * TASK SKIPPED
   */
  window.addEventListener(
    "taskSkipped",
    event => {
      appState.currentTaskId = null;
      appState.selectingTaskId = null;

      showHomePage();

      try {
        refreshAvailableJobs?.();
      } catch {
        // Ignore refresh failures.
      }

      window.dispatchEvent(
        new CustomEvent(
          "dashboardRefreshRequested",
          {
            detail:
              event.detail || {}
          }
        )
      );
    }
  );
}


/* =========================================================
   BACK BUTTONS
   ========================================================= */

function bindBackButtons() {

  $("backToHomeButton")?.addEventListener(
    "click",
    async event => {
      event.preventDefault();

      /*
       * Give tasks/annotation modules a chance
       * to save current state.
       */
      try {
        window.dispatchEvent(
          new CustomEvent(
            "beforeWorkspaceExit"
          )
        );
      } catch {
        // Ignore.
      }


      try {
        await clearCurrentTask?.();
      } catch (error) {
        console.warn(
          "[app] Unable to clear current task:",
          error
        );
      }


      appState.currentTaskId = null;
      appState.selectingTaskId = null;

      showHomePage();
    }
  );


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

  $("showSignupButton")?.addEventListener(
    "click",
    event => {
      event.preventDefault();

      const loginPanel =
        $("loginPanel");

      const signupPanel =
        $("signupPanel");

      if (loginPanel) {
        hideElement(loginPanel);
      }

      if (signupPanel) {
        showElement(signupPanel);
      }
    }
  );


  $("showLoginButton")?.addEventListener(
    "click",
    event => {
      event.preventDefault();

      const loginPanel =
        $("loginPanel");

      const signupPanel =
        $("signupPanel");

      if (signupPanel) {
        hideElement(signupPanel);
      }

      if (loginPanel) {
        showElement(loginPanel);
      }
    }
  );


  $("forgotPasswordButton")?.addEventListener(
    "click",
    event => {
      event.preventDefault();

      window.dispatchEvent(
        new CustomEvent(
          "passwordResetRequested"
        )
      );
    }
  );
}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

function bindKeyboardShortcuts() {

  document.addEventListener(
    "keydown",
    event => {

      /*
       * Escape
       */
      if (event.key === "Escape") {

        const openModalElement =
          qs(
            ".modal.open, [role='dialog'].open"
          );

        if (openModalElement) {
          openModalElement.classList.remove(
            "open"
          );
        }
      }


      /*
       * Ctrl/Cmd + S
       */
      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {

        if (
          appState.currentPage ===
          "annotation"
        ) {

          event.preventDefault();

          window.dispatchEvent(
            new CustomEvent(
              "saveRequested"
            )
          );
        }
      }


      /*
       * Ctrl/Cmd + Z
       */
      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey
      ) {

        if (
          appState.currentPage ===
          "annotation"
        ) {

          const undoButton =
            $("undoBtn");

          if (undoButton) {
            event.preventDefault();
            undoButton.click();
          }
        }
      }


      /*
       * Ctrl/Cmd + Shift + Z
       * OR
       * Ctrl/Cmd + Y
       */
      if (
        (
          (event.ctrlKey ||
            event.metaKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === "z"
        ) ||
        (
          (event.ctrlKey ||
            event.metaKey) &&
          event.key.toLowerCase() === "y"
        )
      ) {

        if (
          appState.currentPage ===
          "annotation"
        ) {

          const redoButton =
            $("redoBtn");

          if (redoButton) {
            event.preventDefault();
            redoButton.click();
          }
        }
      }
    }
  );
}


/* =========================================================
   NETWORK EVENTS
   ========================================================= */

function bindNetworkEvents() {

  window.addEventListener(
    "online",
    () => {

      document.body.classList.remove(
        "offline"
      );

      showToast(
        "Connection restored.",
        "success"
      );

      window.dispatchEvent(
        new CustomEvent(
          "networkOnline"
        )
      );


      if (
        typeof isLoggedIn ===
        "function" &&
        isLoggedIn()
      ) {

        try {
          refreshAvailableJobs?.();
        } catch {
          // Ignore.
        }
      }
    }
  );


  window.addEventListener(
    "offline",
    () => {

      document.body.classList.add(
        "offline"
      );

      showToast(
        "You are offline. Changes may be saved when connection returns.",
        "warning",
        5000
      );

      window.dispatchEvent(
        new CustomEvent(
          "networkOffline"
        )
      );
    }
  );
}


/* =========================================================
   SUPABASE CONNECTION CHECK
   ========================================================= */

async function checkConnection() {
  try {

    const result =
      await checkSupabaseConnection?.();

    if (result === false) {
      console.warn(
        "[app] Supabase connection check failed."
      );
    }

    return result;

  } catch (error) {

    console.warn(
      "[app] Supabase connection could not be checked:",
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
   * IMPORTANT:
   *
   * Auth has already been initialized before
   * this function is called.
   *
   * Annotation/media/tasks/workspace are initialized
   * before dashboard/home.
   */

  const initializers = [

    [
      "annotation",
      initializeAnnotation
    ],

    [
      "media",
      initializeMedia
    ],

    [
      "tasks",
      initializeTasks
    ],

    [
      "workspace",
      initializeWorkspace
    ],

    [
      "home",
      initializeHome
    ],

    [
      "ai",
      initializeAI
    ],

    [
      "profile",
      initializeProfile
    ],

    [
      "history",
      initializeHistory
    ],

    [
      "admin",
      initializeAdmin
    ]
  ];


  for (
    const [name, initializer]
    of initializers
  ) {

    if (
      typeof initializer !==
      "function"
    ) {

      console.warn(
        `[app] Initializer for ${name} is not available.`
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
     * Initialize auth module.
     */
    if (
      typeof initializeAuth ===
      "function"
    ) {

      await initializeAuth();
    }


    /*
     * Restore Supabase session.
     */
    if (
      typeof loadSessionOnStartup ===
      "function"
    ) {

      await loadSessionOnStartup();
    }


    updateAppAuthState();

    appState.authReady = true;


    /*
     * Listen for future auth changes.
     */
    if (
      typeof onAuthStateChange ===
      "function"
    ) {

      onAuthStateChange(
        async state => {

          try {

            updateAppAuthState();

            if (
              state?.authenticated ||
              (
                typeof isLoggedIn ===
                "function" &&
                isLoggedIn()
              )
            ) {

              await handleAuthenticatedUser({
                refreshDashboard: true
              });

            } else {

              handleUnauthenticatedUser();
            }

          } catch (error) {

            console.error(
              "[app] Auth state update failed:",
              error
            );
          }
        }
      );
    }


    /*
     * Handle initial session.
     */
    if (
      typeof isLoggedIn ===
      "function" &&
      isLoggedIn()
    ) {

      await handleAuthenticatedUser({
        refreshDashboard: false
      });

    } else {

      handleUnauthenticatedUser();
    }

  } catch (error) {

    console.error(
      "[app] Authentication initialization failed:",
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
   APPLICATION EVENT BRIDGE
   ========================================================= */

function bindApplicationEvents() {

  /*
   * AUTH STATE CHANGED
   */
  window.addEventListener(
    "authStateChanged",
    async () => {

      updateAppAuthState();

      updateNavigationVisibility();

      if (
        typeof isLoggedIn ===
        "function" &&
        isLoggedIn()
      ) {

        await handleAuthenticatedUser({
          refreshDashboard: true
        });

      } else {

        handleUnauthenticatedUser();
      }
    }
  );


  /*
   * AUTH CHANGED
   */
  window.addEventListener(
    "authChanged",
    async () => {

      updateAppAuthState();

      updateNavigationVisibility();

      if (
        typeof isLoggedIn ===
        "function" &&
        isLoggedIn()
      ) {

        await handleAuthenticatedUser({
          refreshDashboard: true
        });

      } else {

        handleUnauthenticatedUser();
      }
    }
  );


  /*
   * PROFILE UPDATED
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

      updateApprovalUI();
    }
  );


  /*
   * ROLE CHANGED
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

      updateApprovalUI();
    }
  );


  /*
   * APPROVAL STATUS CHANGED
   */
  window.addEventListener(
    "approvalStatusChanged",
    event => {

      const active =
        event.detail?.active;

      if (
        typeof active ===
        "boolean"
      ) {

        appState.pendingApproval =
          !active &&
          !appState.admin &&
          !appState.staff;
      }

      updateNavigationVisibility();

      updateApprovalUI();
    }
  );


  /*
   * DASHBOARD REFRESH
   */
  window.addEventListener(
    "dashboardRefreshRequested",
    async () => {

      if (
        typeof isLoggedIn !==
        "function" ||
        !isLoggedIn()
      ) {
        return;
      }

      if (
        appState.pendingApproval &&
        !appState.admin &&
        !appState.staff
      ) {
        return;
      }

      try {

        await refreshAvailableJobs?.();

      } catch (error) {

        console.warn(
          "[app] Dashboard refresh failed:",
          error
        );
      }
    }
  );


  /*
   * SAVE REQUEST
   */
  window.addEventListener(
    "saveRequested",
    () => {

      const button =
        $("saveAnnotationsButton");

      if (
        appState.currentPage ===
        "annotation" &&
        button
      ) {

        button.click();
      }
    }
  );
}


/* =========================================================
   DOCUMENT INITIALIZATION
   ========================================================= */

function initializeDocument() {

  document.documentElement.classList.add(
    "app-initialized"
  );

  document.body.classList.add(
    "application-ready"
  );


  document.body.dataset.role =
    normalizeRole(
      appState.role
    );


  /*
   * Prevent accidental browser navigation
   * from dropped files.
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
   DASHBOARD REFRESH
   ========================================================= */

let dashboardRefreshTimer = null;


function startDashboardRefresh() {

  if (dashboardRefreshTimer) {

    clearInterval(
      dashboardRefreshTimer
    );
  }


  dashboardRefreshTimer =
    window.setInterval(
      async () => {

        if (
          typeof isLoggedIn !==
          "function" ||
          !isLoggedIn()
        ) {
          return;
        }


        if (
          appState.pendingApproval &&
          !appState.admin &&
          !appState.staff
        ) {
          return;
        }


        if (
          appState.currentPage !==
          "home"
        ) {
          return;
        }


        try {

          await refreshAvailableJobs?.();

        } catch (error) {

          console.warn(
            "[app] Periodic dashboard refresh failed:",
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
          new CustomEvent(
            "appBeforeUnload"
          )
        );

      } catch {
        // Ignore.
      }


      if (dashboardRefreshTimer) {

        clearInterval(
          dashboardRefreshTimer
        );

        dashboardRefreshTimer = null;
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


    /*
     * Basic document setup.
     */
    initializeDocument();


    /*
     * Bind global events BEFORE module initialization.
     */
    bindNavigation();

    bindAuthFormEvents();

    bindTaskEvents();

    bindBackButtons();

    bindKeyboardShortcuts();

    bindNetworkEvents();

    bindApplicationEvents();


    /*
     * Supabase connection check should
     * never block application startup.
     */
    checkConnection();


    /*
     * Authentication MUST initialize first.
     */
    await initializeAuthentication();


    /*
     * Initialize application modules.
     */
    await initializeModules();


    /*
     * Refresh state after modules are ready.
     */
    updateAppAuthState();

    updateNavigationVisibility();

    updateApprovalUI();


    /*
     * Refresh dashboard once modules are ready.
     */
    if (
      appState.user &&
      userCanEnterWorkspace()
    ) {

      try {

        await loadDashboard?.();

      } catch (error) {

        console.warn(
          "[app] Final dashboard load failed:",
          error
        );
      }
    }


    /*
     * Start automatic dashboard refresh.
     */
    startDashboardRefresh();


    /*
     * Cleanup.
     */
    cleanupBeforeUnload();


    appState.initialized = true;


    window.dispatchEvent(
      new CustomEvent(
        "appReady",
        {
          detail: {
            user:
              appState.user,

            profile:
              appState.profile,

            role:
              appState.role,

            authenticated:
              Boolean(
                appState.user
              ),

            pendingApproval:
              appState.pendingApproval,

            admin:
              appState.admin,

            staff:
              appState.staff
          }
        }
      )
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
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp,
    {
      once: true
    }
  );

} else {

  initializeApp();
}


/* =========================================================
   PUBLIC APP API
   ========================================================= */

window.app = {

  state:
    appState,


  initialize:
    initializeApp,


  showHome:
    showHomePage,


  showAnnotation:
    showAnnotationPage,


  showApproval:
    showApprovalPage,


  showPage,


  openModal,


  closeModal,


  closeAllModals,


  refreshDashboard:
    async () => {

      try {

        return await refreshAvailableJobs?.();

      } catch (error) {

        console.error(
          "[app] Dashboard refresh failed:",
          error
        );

        return null;
      }
    },


  logout:
    handleLogout,


  getState:
    () => ({
      ...appState
    }),


  getUser:
    () =>
      (
        typeof getUser ===
        "function"
          ? getUser()
          : appState.user
      ) ||
      appState.user,


  getProfile:
    () =>
      (
        typeof getProfile ===
        "function"
          ? getProfile()
          : appState.profile
      ) ||
      appState.profile,


  getRole:
    () =>
      normalizeRole(
        (
          typeof getRole ===
          "function"
            ? getRole()
            : appState.role
        ) ||
        appState.role
      ),


  isAdmin:
    () =>
      Boolean(
        (
          typeof isAdmin ===
          "function" &&
          isAdmin()
        ) ||
        appState.admin
      ),


  isStaff:
    () =>
      Boolean(
        (
          typeof isStaff ===
          "function" &&
          isStaff()
        ) ||
        appState.staff
      ),


  roleLabel:
    () =>
      roleLabel(
        normalizeRole(
          appState.role
        )
      )
};


/* =========================================================
   BACKWARD COMPATIBILITY
   ========================================================= */

window.openHome =
  showHomePage;

window.openAnnotation =
  showAnnotationPage;

window.openApproval =
  showApprovalPage;

window.logoutUser =
  handleLogout;


/* =========================================================
   END app.js
   ========================================================= */
