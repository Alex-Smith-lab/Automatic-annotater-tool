// ============================================================
// ANNOTATION AI
// HISTORY MODULE
// File: js/history.js
// ============================================================

import {
    supabase,
    getCurrentUser,
    getCurrentSession
} from "./supabase.js";


// ============================================================
// STATE
// ============================================================

const historyState = {
    initialized: false,
    loading: false,
    items: [],
    limit: 100
};


// ============================================================
// DOM HELPER
// ============================================================

function $(id) {
    return document.getElementById(id);
}


// ============================================================
// HISTORY CONTAINER
// ============================================================

function getHistoryContainer() {
    return (
        $("workHistoryList") ||
        $("historyList") ||
        $("workHistory") ||
        $("activityHistory")
    );
}


// ============================================================
// SAFE HTML
// ============================================================

function escapeHTML(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// DATE / TIME
// ============================================================

function formatDateTime(value) {

    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}


// ============================================================
// RELATIVE TIME
// ============================================================

function relativeTime(value) {

    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const diff = Date.now() - date.getTime();

    const seconds = Math.floor(diff / 1000);

    if (seconds < 10) {
        return "just now";
    }

    if (seconds < 60) {
        return String(seconds) + "s ago";
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return String(minutes) + "m ago";
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return String(hours) + "h ago";
    }

    const days = Math.floor(hours / 24);

    if (days < 30) {
        return String(days) + "d ago";
    }

    return formatDateTime(value);
}


// ============================================================
// SAFE ID
// ============================================================

function cryptoSafeId() {

    try {

        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {
            return crypto.randomUUID();
        }

    } catch (error) {
        // Ignore and use fallback.
    }

    return (
        "history_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .slice(2)
    );
}


// ============================================================
// NORMALIZE HISTORY RECORD
// ============================================================

function normalizeHistoryRecord(row) {

    row = row || {};

    return {

        id:
            row.id ||
            row.history_id ||
            row.activity_id ||
            row.result_id ||
            cryptoSafeId(),

        taskId:
            row.task_id ||
            row.taskId ||
            row.job_id ||
            row.jobId ||
            null,

        userId:
            row.user_id ||
            row.userId ||
            row.worker_id ||
            null,

        action:
            row.action ||
            row.event ||
            row.activity ||
            row.type ||
            row.status ||
            "Activity",

        title:
            row.task_title ||
            row.task_name ||
            row.title ||
            row.name ||
            (
                row.task &&
                row.task.title
            ) ||
            "Task",

        description:
            row.description ||
            row.message ||
            row.details ||
            "",

        status:
            row.status ||
            row.result_status ||
            row.task_status ||
            "",

        createdAt:
            row.created_at ||
            row.createdAt ||
            row.timestamp ||
            row.updated_at ||
            row.completed_at ||
            row.submitted_at ||
            row.date ||
            null,

        updatedAt:
            row.updated_at ||
            row.updatedAt ||
            null,

        raw: row
    };
}


// ============================================================
// ACTION LABEL
// ============================================================

function actionLabel(action) {

    const value =
        String(action || "")
            .trim()
            .toLowerCase();

    const labels = {

        submit: "Task submitted",
        submitted: "Task submitted",

        complete: "Task completed",
        completed: "Task completed",

        approve: "Task approved",
        approved: "Task approved",

        reject: "Task rejected",
        rejected: "Task rejected",

        skip: "Task skipped",
        skipped: "Task skipped",

        start: "Task started",
        started: "Task started",

        assign: "Task assigned",
        assigned: "Task assigned",

        create: "Task created",
        created: "Task created",

        upload: "Media uploaded",
        uploaded: "Media uploaded",

        annotation: "Annotation activity",
        annotated: "Annotation completed",

        login: "Signed in",
        logout: "Signed out",
        signup: "Account created"
    };

    return labels[value] || action || "Activity";
}


// ============================================================
// ACTION ICON
// ============================================================

function actionIcon(action) {

    const value =
        String(action || "")
            .trim()
            .toLowerCase();

    if (
        value.includes("approve") ||
        value.includes("complete") ||
        value.includes("submit")
    ) {
        return "✓";
    }

    if (
        value.includes("reject") ||
        value.includes("delete")
    ) {
        return "×";
    }

    if (value.includes("skip")) {
        return "→";
    }

    if (
        value.includes("upload") ||
        value.includes("media")
    ) {
        return "↑";
    }

    if (
        value.includes("login") ||
        value.includes("sign in")
    ) {
        return "↪";
    }

    if (
        value.includes("logout") ||
        value.includes("sign out")
    ) {
        return "↩";
    }

    return "•";
}


// ============================================================
// HISTORY TABLES
// ============================================================

const HISTORY_TABLES = [
    "work_history",
    "task_history",
    "activity_logs",
    "activities",
    "history"
];


// ============================================================
// QUERY HISTORY TABLE
// ============================================================

async function queryHistoryTable(
    table,
    user
) {

    if (!supabase || !user) {

        return {
            success: false,
            rows: []
        };
    }

    try {

        const result =
            await supabase
                .from(table)
                .select("*")
                .eq("user_id", user.id)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(
                    historyState.limit
                );

        const data =
            result.data;

        const error =
            result.error;

        if (error) {

            return {
                success: false,
                rows: [],
                error
            };
        }

        return {

            success: true,

            rows:
                Array.isArray(data)
                    ? data
                    : []
        };

    } catch (error) {

        return {

            success: false,

            rows: [],

            error
        };
    }
}


// ============================================================
// TASK RESULTS FALLBACK
// ============================================================

async function queryTaskResults(user) {

    if (!supabase || !user) {
        return [];
    }

    try {

        const result =
            await supabase
                .from("task_results")
                .select("*")
                .eq("user_id", user.id)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(
                    historyState.limit
                );

        const data =
            result.data;

        const error =
            result.error;

        if (
            error ||
            !Array.isArray(data)
        ) {
            return [];
        }

        return data.map(
            function(row) {

                return {
                    ...row,

                    action:
                        row.status ||
                        row.action ||
                        "Task result"
                };
            }
        );

    } catch (error) {

        return [];
    }
}


// ============================================================
// TASK FALLBACK
// ============================================================

async function queryUserTasks(user) {

    if (!supabase || !user) {
        return [];
    }

    try {

        const result =
            await supabase
                .from("tasks")
                .select("*")
                .or(
                    "assigned_to.eq." +
                    user.id +
                    ",worker_id.eq." +
                    user.id +
                    ",user_id.eq." +
                    user.id
                )
                .order(
                    "updated_at",
                    {
                        ascending: false
                    }
                )
                .limit(
                    historyState.limit
                );

        const data =
            result.data;

        const error =
            result.error;

        if (
            error ||
            !Array.isArray(data)
        ) {
            return [];
        }

        return data;

    } catch (error) {

        return [];
    }
}


// ============================================================
// LOAD HISTORY
// ============================================================

export async function loadHistory(
    options
) {

    options =
        options || {};

    if (historyState.loading) {

        return historyState.items;
    }

    historyState.loading =
        true;

    try {

        const user =
            options.user ||
            await getCurrentUser();

        if (!user) {

            historyState.items = [];

            renderHistory();

            return [];
        }

        let rows = [];


        // ----------------------------------------------------
        // Dedicated history tables
        // ----------------------------------------------------

        for (
            const table of HISTORY_TABLES
        ) {

            const result =
                await queryHistoryTable(
                    table,
                    user
                );

            if (
                result.success &&
                result.rows.length
            ) {

                rows.push(
                    ...result.rows
                );

                break;
            }
        }


        // ----------------------------------------------------
        // Task results fallback
        // ----------------------------------------------------

        if (!rows.length) {

            rows =
                await queryTaskResults(
                    user
                );
        }


        // ----------------------------------------------------
        // Tasks fallback
        // ----------------------------------------------------

        if (!rows.length) {

            rows =
                await queryUserTasks(
                    user
                );
        }


        // ----------------------------------------------------
        // Normalize
        // ----------------------------------------------------

        historyState.items =
            rows
                .map(
                    normalizeHistoryRecord
                )
                .sort(
                    function(a, b) {

                        const dateA =
                            new Date(
                                a.createdAt || 0
                            ).getTime();

                        const dateB =
                            new Date(
                                b.createdAt || 0
                            ).getTime();

                        return dateB - dateA;
                    }
                )
                .slice(
                    0,
                    historyState.limit
                );


        renderHistory();

        return historyState.items;

    } catch (error) {

        console.error(
            "History loading error:",
            error
        );

        return historyState.items;

    } finally {

        historyState.loading =
            false;
    }
}


// ============================================================
// EMPTY HISTORY
// ============================================================

function renderEmptyHistory(
    container
) {

    container.innerHTML =
        '<div class="history-empty">' +
            '<div class="history-empty-icon">◷</div>' +
            '<div class="history-empty-title">' +
                'No work history yet' +
            '</div>' +
            '<div class="history-empty-text">' +
                'Your completed and recent task activity ' +
                'will appear here.' +
            '</div>' +
        '</div>';
}


// ============================================================
// ERROR HISTORY
// ============================================================

function renderHistoryError(
    container,
    error
) {

    console.error(
        "History loading error:",
        error
    );

    container.innerHTML =
        '<div class="history-empty">' +
            '<div class="history-empty-icon">!</div>' +
            '<div class="history-empty-title">' +
                'History unavailable' +
            '</div>' +
            '<div class="history-empty-text">' +
                'Your work history could not be loaded ' +
                'right now.' +
            '</div>' +
            '<button ' +
                'type="button" ' +
                'class="history-retry-btn" ' +
                'data-history-retry>' +
                'Retry' +
            '</button>' +
        '</div>';

    const retry =
        container.querySelector(
            "[data-history-retry]"
        );

    if (retry) {

        retry.addEventListener(
            "click",
            function() {
                loadHistory();
            }
        );
    }
}


// ============================================================
// RENDER HISTORY
// ============================================================

export function renderHistory() {

    const container =
        getHistoryContainer();

    if (!container) {
        return;
    }

    if (
        !historyState.items.length
    ) {

        renderEmptyHistory(
            container
        );

        return;
    }


    container.innerHTML =
        historyState.items
            .map(
                function(item) {

                    const title =
                        escapeHTML(
                            item.title ||
                            "Task"
                        );

                    const action =
                        escapeHTML(
                            actionLabel(
                                item.action
                            )
                        );

                    const description =
                        escapeHTML(
                            item.description
                        );

                    const date =
                        escapeHTML(
                            formatDateTime(
                                item.createdAt
                            )
                        );

                    const relative =
                        escapeHTML(
                            relativeTime(
                                item.createdAt
                            )
                        );

                    const status =
                        escapeHTML(
                            item.status || ""
                        );

                    const icon =
                        escapeHTML(
                            actionIcon(
                                item.action
                            )
                        );

                    let descriptionHTML =
                        "";

                    if (description) {

                        descriptionHTML =
                            '<div class="history-item-description">' +
                                description +
                            '</div>';
                    }

                    let statusHTML =
                        "";

                    if (status) {

                        statusHTML =
                            '<span class="history-item-status">' +
                                status +
                            '</span>';
                    }

                    return (

                        '<div ' +
                            'class="history-item" ' +
                            'data-history-id="' +
                                escapeHTML(item.id) +
                            '" ' +
                            'data-task-id="' +
                                escapeHTML(
                                    item.taskId || ""
                                ) +
                            '">' +

                            '<div class="history-item-icon">' +
                                icon +
                            '</div>' +

                            '<div class="history-item-content">' +

                                '<div class="history-item-title">' +
                                    title +
                                '</div>' +

                                '<div class="history-item-action">' +
                                    action +
                                '</div>' +

                                descriptionHTML +

                                statusHTML +

                            '</div>' +

                            '<div ' +
                                'class="history-item-time" ' +
                                'title="' +
                                    date +
                                '">' +

                                (
                                    relative ||
                                    date
                                ) +

                            '</div>' +

                        '</div>'
                    );
                }
            )
            .join("");

    bindHistoryItems(
        container
    );
}


// ============================================================
// HISTORY ITEM CLICK
// ============================================================

function bindHistoryItems(
    container
) {

    container
        .querySelectorAll(
            ".history-item"
        )
        .forEach(
            function(item) {

                item.addEventListener(
                    "click",
                    function() {

                        const taskId =
                            item.dataset.taskId;

                        if (!taskId) {
                            return;
                        }

                        openTaskFromHistory(
                            taskId
                        );
                    }
                );
            }
        );
}


// ============================================================
// OPEN TASK
// ============================================================

export function openTaskFromHistory(
    taskId
) {

    if (!taskId) {
        return;
    }

    window.dispatchEvent(
        new CustomEvent(
            "history:openTask",
            {
                detail: {
                    taskId: taskId
                }
            }
        )
    );


    try {

        if (
            typeof window.loadTask ===
            "function"
        ) {

            window.loadTask(
                taskId
            );

            return;
        }

        if (
            typeof window.openTask ===
            "function"
        ) {

            window.openTask(
                taskId
            );

            return;
        }

        if (
            typeof window.selectTask ===
            "function"
        ) {

            window.selectTask(
                taskId
            );

            return;
        }

    } catch (error) {

        console.warn(
            "Unable to open task from history:",
            error
        );
    }
}


// ============================================================
// ADD LOCAL HISTORY
// ============================================================

export function addHistoryItem(
    item
) {

    item =
        item || {};

    const normalized =
        normalizeHistoryRecord({

            ...item,

            created_at:
                item.created_at ||
                item.createdAt ||
                new Date().toISOString()
        });


    historyState.items.unshift(
        normalized
    );


    historyState.items =
        historyState.items.slice(
            0,
            historyState.limit
        );


    renderHistory();

    return normalized;
}


// ============================================================
// SAVE HISTORY ACTIVITY
// ============================================================

export async function saveHistoryActivity(
    activity
) {

    activity =
        activity || {};

    const user =
        activity.user ||
        await getCurrentUser();

    if (!supabase || !user) {

        return {

            success: false,

            localOnly: true
        };
    }


    const payload = {

        user_id:
            user.id,

        action:
            activity.action ||
            activity.event ||
            "activity",

        description:
            activity.description ||
            activity.message ||
            "",

        task_id:
            activity.taskId ||
            activity.task_id ||
            null,

        created_at:
            activity.createdAt ||
            activity.created_at ||
            new Date().toISOString()
    };


    for (
        const table of HISTORY_TABLES
    ) {

        try {

            const result =
                await supabase
                    .from(table)
                    .insert(payload)
                    .select()
                    .maybeSingle();

            const data =
                result.data;

            const error =
                result.error;

            if (!error) {

                const item =
                    addHistoryItem(
                        data ||
                        payload
                    );

                return {

                    success: true,

                    table: table,

                    item: item
                };
            }

        } catch (error) {

            // Try the next table.
        }
    }


    addHistoryItem(
        payload
    );


    return {

        success: false,

        localOnly: true
    };
}


// ============================================================
// REFRESH HISTORY
// ============================================================

export async function refreshHistory() {

    return loadHistory({
        force: true
    });
}


// ============================================================
// SHOW HISTORY
// ============================================================

function showHistoryView() {

    const history =
        getHistoryContainer();

    if (!history) {
        return;
    }


    const possibleViews = [

        $("workHistoryView"),

        $("historyView"),

        $("workHistoryPage")
    ];


    possibleViews.forEach(
        function(view) {

            if (view) {

                view.hidden =
                    false;

                view.style.display =
                    "";
            }
        }
    );


    history.scrollTop = 0;

    loadHistory();
}


// ============================================================
// HISTORY BUTTON
// ============================================================

function bindHistoryButton() {

    const button =
        $("workHistoryButton") ||
        $("workHistoryBtn");

    if (
        !button ||
        button.dataset.historyBound ===
            "true"
    ) {
        return;
    }


    button.dataset.historyBound =
        "true";


    button.addEventListener(
        "click",
        function(event) {

            event.preventDefault();

            showHistoryView();

            window.dispatchEvent(
                new CustomEvent(
                    "history:open"
                )
            );
        }
    );
}


// ============================================================
// AUTH EVENTS
// ============================================================

function bindAuthEvents() {

    window.addEventListener(
        "auth:login",
        function() {

            loadHistory();
        }
    );


    window.addEventListener(
        "auth:logout",
        function() {

            historyState.items =
                [];

            renderHistory();
        }
    );


    window.addEventListener(
        "auth:session",
        function(event) {

            const session =
                event.detail &&
                event.detail.session;

            if (
                session &&
                session.user
            ) {

                loadHistory({
                    user:
                        session.user
                });
            }
        }
    );
}


// ============================================================
// TASK EVENTS
// ============================================================

function bindTaskEvents() {

    const refreshEvents = [

        "task:submitted",

        "task:completed",

        "task:approved",

        "task:rejected",

        "task:skipped",

        "task:created",

        "task:updated",

        "annotation:saved",

        "annotation:submitted"
    ];


    refreshEvents.forEach(
        function(eventName) {

            window.addEventListener(
                eventName,
                function(event) {

                    const detail =
                        event.detail ||
                        {};


                    if (
                        detail.action ||
                        detail.event ||
                        detail.description
                    ) {

                        addHistoryItem({

                            ...detail,

                            action:
                                detail.action ||
                                detail.event ||
                                eventName.replace(
                                    "task:",
                                    ""
                                )
                        });
                    }


                    setTimeout(
                        function() {

                            loadHistory();

                        },
                        300
                    );
                }
            );
        }
    );
}


// ============================================================
// GLOBALS
// ============================================================

function exposeGlobals() {

    window.loadHistory =
        loadHistory;

    window.renderHistory =
        renderHistory;

    window.refreshHistory =
        refreshHistory;

    window.addHistoryItem =
        addHistoryItem;

    window.saveHistoryActivity =
        saveHistoryActivity;

    window.openTaskFromHistory =
        openTaskFromHistory;
}


// ============================================================
// INITIALIZATION
// ============================================================

export async function initializeHistory() {

    if (
        historyState.initialized
    ) {

        return;
    }


    historyState.initialized =
        true;


    exposeGlobals();

    bindHistoryButton();

    bindAuthEvents();

    bindTaskEvents();


    const container =
        getHistoryContainer();

    if (container) {

        renderEmptyHistory(
            container
        );
    }


    // getCurrentSession() returns:
    // { session, error }

    try {

        const result =
            await getCurrentSession();

        const session =
            result &&
            result.session;

        if (
            session &&
            session.user
        ) {

            await loadHistory({
                user:
                    session.user
            });
        }

    } catch (error) {

        console.warn(
            "History session check failed:",
            error
        );
    }
}


// ============================================================
// AUTO INITIALIZE
// ============================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        function() {

            initializeHistory()
                .catch(
                    function(error) {

                        console.error(
                            "History initialization failed:",
                            error
                        );
                    }
                );
        },
        {
            once: true
        }
    );

} else {

    initializeHistory()
        .catch(
            function(error) {

                console.error(
                    "History initialization failed:",
                    error
                );
            }
        );
}


// ============================================================
// EXPORT STATE
// ============================================================

export {
    historyState
};
