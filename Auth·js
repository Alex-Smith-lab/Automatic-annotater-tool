import { supabase } from "./supabaseClient.js";

/* ============================================================
   AUTH STATE — exposed globally so app.js / admin.js can read it
   after the "auth:ready" event fires.
============================================================ */

export const AuthState = {
    user: null,        // supabase auth user object
    profile: null,      // row from public.profiles (includes role!)
    loginLogId: null    // id of the open login_logs row, for logout timestamping
};

const LOGIN_LOG_KEY = "annotationAI_loginLogId";

const $ = id => document.getElementById(id);

/* ============================================================
   OVERLAY MARKUP (injected once, on top of the existing app)
============================================================ */

function injectAuthOverlay() {
    if ($("authOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "authOverlay";
    overlay.className = "auth-overlay";
    overlay.innerHTML = `
        <div class="auth-card">
            <div class="auth-brand">
                <div class="auth-brand-icon">AI</div>
                <div>
                    <h1>ANNOTATION AI</h1>
                    <span>Customer Data Studio</span>
                </div>
            </div>

            <div class="auth-tabs" id="authTabs">
                <button type="button" class="auth-tab active" data-tab="signin">Sign In</button>
                <button type="button" class="auth-tab" data-tab="signup">Sign Up</button>
            </div>

            <form id="signinForm" class="auth-form">
                <label class="auth-label">Email</label>
                <input id="signinEmail" class="auth-input" type="email" autocomplete="username" required>
                <label class="auth-label">Password</label>
                <input id="signinPassword" class="auth-input" type="password" autocomplete="current-password" required>
                <button type="submit" class="auth-submit">Sign In</button>
                <button type="button" id="forgotPasswordBtn" class="auth-link">Forgot password?</button>
                <div id="signinError" class="auth-error"></div>
            </form>

            <form id="signupForm" class="auth-form" style="display:none;">
                <label class="auth-label">Full name</label>
                <input id="signupName" class="auth-input" type="text" autocomplete="name" required>
                <label class="auth-label">Email</label>
                <input id="signupEmail" class="auth-input" type="email" autocomplete="username" required>
                <label class="auth-label">Password</label>
                <input id="signupPassword" class="auth-input" type="password" autocomplete="new-password" minlength="8" required>
                <small class="auth-hint">At least 8 characters. Choose your own — nothing is preset.</small>
                <button type="submit" class="auth-submit">Create Account</button>
                <div id="signupError" class="auth-error"></div>
                <div id="signupSuccess" class="auth-success"></div>
            </form>

            <form id="resetForm" class="auth-form" style="display:none;">
                <p class="auth-notice">Set a new password to continue. This is required before you can use the workspace.</p>
                <label class="auth-label">New password</label>
                <input id="resetPassword" class="auth-input" type="password" autocomplete="new-password" minlength="8" required>
                <label class="auth-label">Confirm new password</label>
                <input id="resetPasswordConfirm" class="auth-input" type="password" autocomplete="new-password" minlength="8" required>
                <button type="submit" class="auth-submit">Set Password &amp; Continue</button>
                <div id="resetError" class="auth-error"></div>
            </form>

            <div id="kickedNotice" class="auth-error" style="display:none;">
                Your access to this platform has been removed. Contact an administrator.
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Tabs
    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            $("signinForm").style.display = tab.dataset.tab === "signin" ? "flex" : "none";
            $("signupForm").style.display = tab.dataset.tab === "signup" ? "flex" : "none";
        });
    });

    $("signinForm").addEventListener("submit", handleSignIn);
    $("signupForm").addEventListener("submit", handleSignUp);
    $("resetForm").addEventListener("submit", handlePasswordReset);
    $("forgotPasswordBtn").addEventListener("click", handleForgotPassword);
}

function showOverlay(mode) {
    // mode: "auth" (sign in/up tabs) | "reset" (forced reset) | "kicked"
    injectAuthOverlay();
    $("authOverlay").style.display = "flex";
    document.body.classList.add("auth-locked");

    $("authTabs").style.display = mode === "auth" ? "flex" : "none";
    $("signinForm").style.display = mode === "auth" ? "flex" : "none";
    $("signupForm").style.display = "none";
    $("resetForm").style.display = mode === "reset" ? "flex" : "none";
    $("kickedNotice").style.display = mode === "kicked" ? "block" : "none";
}

function hideOverlay() {
    if ($("authOverlay")) $("authOverlay").style.display = "none";
    document.body.classList.remove("auth-locked");
}

function setError(id, message) {
    const el = $(id);
    if (el) el.textContent = message || "";
}

/* ============================================================
   SIGN IN
============================================================ */

async function handleSignIn(event) {
    event.preventDefault();
    setError("signinError", "");

    const email = $("signinEmail").value.trim();
    const password = $("signinPassword").value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        setError("signinError", error.message);
        return;
    }

    await onSignedIn(data.user);
}

/* ============================================================
   SIGN UP
   (First account to use antonymbali96@gmail.com is auto-promoted
   to admin by the database trigger from Stage 1 — nothing to do here.
   Admins can restrict/disable public sign-up later from the Supabase
   Auth settings once staff accounts are created via the admin panel.)
============================================================ */

async function handleSignUp(event) {
    event.preventDefault();
    setError("signupError", "");
    setError("signupSuccess", "");

    const fullName = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
    });

    if (error) {
        setError("signupError", error.message);
        return;
    }

    if (data.session) {
        await onSignedIn(data.user);
        return;
    }

    // Email confirmation is on for this project
    $("signupSuccess").textContent = "Account created. Check your email to confirm, then sign in.";
    $("signupForm").reset();
}

/* ============================================================
   FORGOT PASSWORD
============================================================ */

async function handleForgotPassword() {
    const email = $("signinEmail").value.trim();
    if (!email) {
        setError("signinError", "Enter your email above first, then tap 'Forgot password?'.");
        return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });

    setError("signinError", error ? error.message : "Password reset email sent — check your inbox.");
}

/* ============================================================
   FORCED PASSWORD RESET (first login)
============================================================ */

async function handlePasswordReset(event) {
    event.preventDefault();
    setError("resetError", "");

    const pw1 = $("resetPassword").value;
    const pw2 = $("resetPasswordConfirm").value;

    if (pw1 !== pw2) {
        setError("resetError", "Passwords don't match.");
        return;
    }
    if (pw1.length < 8) {
        setError("resetError", "Password must be at least 8 characters.");
        return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: pw1 });
    if (updateError) {
        setError("resetError", updateError.message);
        return;
    }

    const { error: profileError } = await supabase
        .from("profiles")
        .update({ force_password_reset: false })
        .eq("id", AuthState.user.id);

    if (profileError) {
        setError("resetError", "Password changed, but couldn't update your account flag: " + profileError.message);
        return;
    }

    AuthState.profile.force_password_reset = false;
    completeLoginFlow();
}

/* ============================================================
   POST SIGN-IN: load profile, gate on status/reset, log the session
============================================================ */

async function onSignedIn(user) {
    AuthState.user = user;

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    if (error || !profile) {
        showOverlay("auth");
        setError("signinError", "Could not load your account profile. Contact an administrator.");
        await supabase.auth.signOut();
        return;
    }

    AuthState.profile = profile;

    if (profile.status === "kicked") {
        showOverlay("kicked");
        await supabase.auth.signOut();
        return;
    }

    await supabase
        .from("profiles")
        .update({ last_sign_in_at: new Date().toISOString() })
        .eq("id", user.id);

    await openLoginLog(user.id);

    if (profile.force_password_reset) {
        showOverlay("reset");
        return;
    }

    completeLoginFlow();
}

function completeLoginFlow() {
    hideOverlay();
    document.dispatchEvent(new CustomEvent("auth:ready", { detail: { ...AuthState } }));
}

/* ============================================================
   LOGIN / LOGOUT LOGGING
============================================================ */

async function openLoginLog(userId) {
    const { data, error } = await supabase
        .from("login_logs")
        .insert({ user_id: userId })
        .select("id")
        .single();

    if (!error && data) {
        AuthState.loginLogId = data.id;
        try { sessionStorage.setItem(LOGIN_LOG_KEY, data.id); } catch (e) { /* ignore */ }
    }
}

async function closeLoginLog() {
    let logId = AuthState.loginLogId;
    if (!logId) {
        try { logId = sessionStorage.getItem(LOGIN_LOG_KEY); } catch (e) { /* ignore */ }
    }
    if (!logId) return;

    await supabase
        .from("login_logs")
        .update({ logout_at: new Date().toISOString() })
        .eq("id", logId);

    try { sessionStorage.removeItem(LOGIN_LOG_KEY); } catch (e) { /* ignore */ }
}

/* ============================================================
   SIGN OUT (exported for a "Log out" button anywhere in the app)
============================================================ */

export async function signOut() {
    await closeLoginLog();
    await supabase.auth.signOut();
    AuthState.user = null;
    AuthState.profile = null;
    AuthState.loginLogId = null;
    window.location.reload();
}

// Best-effort: close the login log if the tab is closed without clicking "sign out"
window.addEventListener("beforeunload", () => {
    let logId = AuthState.loginLogId;
    if (!logId) {
        try { logId = sessionStorage.getItem(LOGIN_LOG_KEY); } catch (e) { /* ignore */ }
    }
    if (!logId) return;

    const url = `https://ozcwfcfcwzjjanxfvico.supabase.co/rest/v1/login_logs?id=eq.${logId}`;
    const payload = JSON.stringify({ logout_at: new Date().toISOString() });
    navigator.sendBeacon?.(url, new Blob([payload], { type: "application/json" }));
});

/* ============================================================
   BOOT: check for an existing session on page load
============================================================ */

export async function initAuth() {
    injectAuthOverlay();
    showOverlay("auth");

    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
        await onSignedIn(session.user);
    }

    supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
            showOverlay("auth");
        }
        if (event === "PASSWORD_RECOVERY") {
            showOverlay("reset");
        }
    });
}

export function requireRole(...roles) {
    return AuthState.profile && roles.includes(AuthState.profile.role);
}

export function hasFullAccess() {
    return requireRole("admin", "staff");
}

initAuth();
