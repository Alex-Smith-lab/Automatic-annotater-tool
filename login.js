import { supabase, getMyProfile, recordLogin } from "./supabase-client.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);

/* Tabs */
document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const isSignin = tab.dataset.tab === "signin";
        $("signinForm").style.display = isSignin ? "block" : "none";
        $("signupForm").style.display = isSignin ? "none" : "block";
    });
});

/* If already logged in and not forced to reset, skip straight to app */
(async function boot() {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
        const profile = await getMyProfile();
        if (profile?.status === "kicked") {
            await supabase.auth.signOut();
            return;
        }
        if (profile?.force_password_reset || params.get("reset") === "1") {
            showResetPane();
            return;
        }
        if (profile) routeToApp(profile.role);
    }
})();

function routeToApp(role) {
    if (role === "admin" || role === "staff") window.location.href = "./admin.html";
    else window.location.href = "./workspace.html";
}

function showResetPane() {
    $("loginPane").style.display = "none";
    $("resetPane").style.display = "block";
}

/* SIGN IN */
$("signinForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("signinError").textContent = "";

    const email = $("signinEmail").value.trim();
    const password = $("signinPassword").value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { $("signinError").textContent = error.message; return; }

    const profile = await getMyProfile();
    if (!profile) { $("signinError").textContent = "Could not load your profile."; return; }

    if (profile.status === "kicked") {
        $("signinError").textContent = "This account has been removed from the platform.";
        await supabase.auth.signOut();
        return;
    }

    await recordLogin();

    if (profile.force_password_reset) { showResetPane(); return; }

    routeToApp(profile.role);
});

/* SIGN UP */
$("signupForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("signupError").textContent = "";

    const full_name = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;

    const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name } }
    });

    if (error) { $("signupError").textContent = error.message; return; }

    if (data.session) {
        await recordLogin();
        const profile = await getMyProfile();
        if (profile?.force_password_reset) { showResetPane(); return; }
        routeToApp(profile?.role || "coworker_box");
    } else {
        $("signupError").textContent = "Account created. Check your email to confirm, then sign in.";
        $("signupError").style.color = "#22c55e";
    }
});

/* FORCED RESET */
$("resetSubmit").addEventListener("click", async () => {
    $("resetError").textContent = "";
    const newPassword = $("resetPassword").value;
    if (!newPassword || newPassword.length < 6) {
        $("resetError").textContent = "Password must be at least 6 characters.";
        return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { $("resetError").textContent = error.message; return; }

    const user = (await supabase.auth.getUser()).data.user;
    await supabase.from("profiles").update({ force_password_reset: false }).eq("id", user.id);

    await recordLogin();
    const profile = await getMyProfile();
    routeToApp(profile?.role || "coworker_box");
});
