// =====================================================================
// SHARED SUPABASE CLIENT + AUTH/PROFILE HELPERS
// Imported by login.html, workspace.html, admin.html
// =====================================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ozcwfcfcwzjjanxfvico.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
});

/* ------------------------------------------------------------------ */
/* SESSION / PROFILE                                                   */
/* ------------------------------------------------------------------ */

export async function getSessionUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
}

export async function getMyProfile() {
    const user = await getSessionUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    if (error) {
        console.error("getMyProfile error:", error);
        return null;
    }
    return data;
}

// Roles that get full platform access everywhere in the app.
export function isFullAccess(role) {
    return role === "admin" || role === "staff";
}

export function isCoworker(role) {
    return role === "coworker_box" || role === "coworker_polygon" || role === "coworker_segmentation";
}

export function shapeForRole(role) {
    if (role === "coworker_box") return "box";
    if (role === "coworker_polygon") return "polygon";
    if (role === "coworker_segmentation") return "segmentation";
    return null;
}

export function roleLabel(role) {
    const map = {
        admin: "Admin",
        staff: "Staff",
        reviewer: "Reviewer",
        coworker_box: "Coworker — 2D Box",
        coworker_polygon: "Coworker — Polygon",
        coworker_segmentation: "Coworker — Segmentation"
    };
    return map[role] || role;
}

/* ------------------------------------------------------------------ */
/* LOGIN / LOGOUT ACTIVITY LOG                                         */
/* ------------------------------------------------------------------ */

const LOGIN_LOG_KEY = "annotationAI_loginLogId";

export async function recordLogin() {
    const user = await getSessionUser();
    if (!user) return;

    const { data, error } = await supabase
        .from("login_logs")
        .insert({ user_id: user.id, ip_hint: null })
        .select("id")
        .single();

    if (!error && data) {
        sessionStorage.setItem(LOGIN_LOG_KEY, data.id);
    }

    await supabase.from("profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("id", user.id);
}

export async function recordLogout() {
    const logId = sessionStorage.getItem(LOGIN_LOG_KEY);
    if (!logId) return;
    try {
        await supabase.from("login_logs").update({ logout_at: new Date().toISOString() }).eq("id", logId);
    } catch (e) { /* ignore */ }
    sessionStorage.removeItem(LOGIN_LOG_KEY);
}

export async function fullSignOut() {
    await recordLogout();
    await supabase.auth.signOut();
    window.location.href = "./login.html";
}

/* ------------------------------------------------------------------ */
/* GUARD — call at top of every protected page                         */
/* Returns the profile, or redirects to login and returns null.        */
/* ------------------------------------------------------------------ */

export async function requireProfile({ allowRoles = null } = {}) {
    const user = await getSessionUser();
    if (!user) {
        window.location.href = "./login.html";
        return null;
    }

    const profile = await getMyProfile();
    if (!profile) {
        window.location.href = "./login.html";
        return null;
    }

    if (profile.status === "kicked") {
        alert("Your account has been removed from this platform.");
        await fullSignOut();
        return null;
    }

    if (profile.force_password_reset) {
        window.location.href = "./login.html?reset=1";
        return null;
    }

    if (allowRoles && !allowRoles.includes(profile.role)) {
        alert("You don't have access to this page.");
        window.location.href = "./workspace.html";
        return null;
    }

    return profile;
}

/* ------------------------------------------------------------------ */
/* EXPORT HELPERS — CSV (Google Sheets importable) + HTML download     */
/* ------------------------------------------------------------------ */

export function downloadCSV(filename, rows) {
    if (!rows || !rows.length) { alert("Nothing to export."); return; }
    const headers = Object.keys(rows[0]);
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    triggerDownload(blob, filename.endsWith(".csv") ? filename : filename + ".csv");
}

export function downloadHTMLTable(filename, title, rows) {
    if (!rows || !rows.length) { alert("Nothing to export."); return; }
    const headers = Object.keys(rows[0]);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;background:#0d0d14;color:#eee;padding:20px}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:8px;font-size:13px}
    th{background:#24183d;color:#fff;text-align:left}tr:nth-child(even){background:#171721}</style>
    </head><body><h2>${title}</h2><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r[h] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    triggerDownload(blob, filename.endsWith(".html") ? filename : filename + ".html");
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
