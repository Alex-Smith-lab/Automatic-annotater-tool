/* ============================================================
   WORK HISTORY
   ============================================================
   Handles:
   - User work history
   - Completed / submitted / approved tasks
   - Payment records
   - Paid / unpaid status
   - Payment totals
   - History modal
   - Work history navigation
   - Automatically hides the history shortcut when all
     available payment records for the current user are paid
   ============================================================ */

import {
    APP_CONFIG,
    normalizeRole,
    roleLabel
} from "./config.js";

import {
    getSupabase,
    getCurrentUser,
    getCurrentProfile,
    logActivity
} from "./supabase.js";

import {
    getRole,
    getUserEmail
} from "./auth.js";


/* ============================================================
   STATE
   ============================================================ */

const historyState = {
    initialized: false,
    open: false,
    loading: false,

    tasks: [],
    payments: [],
    combined: [],

    totals: {
        tasks: 0,
        completed: 0,
        approved: 0,
        submitted: 0,

        paid: 0,
        unpaid: 0,

        earned: 0,
        paidAmount: 0,
        unpaidAmount: 0
    }
};


/* ============================================================
   TABLE NAMES
   ============================================================ */

const TABLES = {
    tasks:
        APP_CONFIG?.tables?.tasks ||
        "tasks",

    payments:
        APP_CONFIG?.tables?.payments ||
        "payments",

    annotations:
        APP_CONFIG?.tables?.annotations ||
        "annotations"
};


/* ============================================================
   DOM HELPERS
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}

function all(selector, root = document) {
    return Array.from(
        root.querySelectorAll(selector)
    );
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function safeText(value, fallback = "") {
    const text =
        String(value ?? "").trim();

    return text || fallback;
}

function formatMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0.00";
    }

    return number.toLocaleString(
        undefined,
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}

function formatDateOnly(value) {
    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString();
}


/* ============================================================
   SUPABASE
   ============================================================ */

function client() {
    return getSupabase?.();
}


/* ============================================================
   USER
   ============================================================ */

function getUserId() {
    return (
        getCurrentUser?.()?.id ||
        getCurrentProfile?.()?.id ||
        null
    );
}

function getUserRole() {
    return normalizeRole(
        getRole?.() ||
        getCurrentProfile?.()?.role ||
        ""
    );
}

function getUserEmailAddress() {
    return safeText(
        getUserEmail?.() ||
        getCurrentUser?.()?.email ||
        getCurrentProfile?.()?.email ||
        ""
    );
}


/* ============================================================
   INITIALIZATION
   ============================================================ */

export function initializeHistory() {
    if (historyState.initialized) {
        return;
    }

    historyState.initialized = true;

    bindHistoryButtons();

    /*
     * Load visibility immediately and again whenever authentication
     * changes or the workspace becomes active.
     */
    updateHistoryVisibility();

    document.addEventListener(
        "taskSubmitted",
        async () => {
            await refreshHistory();
        }
    );

    document.addEventListener(
        "taskApproved",
        async () => {
            await refreshHistory();
        }
    );

    document.addEventListener(
        "paymentUpdated",
        async () => {
            await refreshHistory();
        }
    );

    document.addEventListener(
        "authStateChanged",
        async () => {
            await updateHistoryVisibility();
        }
    );
}


/* ============================================================
   OPEN / CLOSE
   ============================================================ */

export async function openWorkHistory() {
    const modal = $("workHistoryModal");

    if (!modal) {
        return false;
    }

    const userId = getUserId();

    if (!userId) {
        return false;
    }

    historyState.open = true;

    modal.hidden = false;
    modal.style.display = "flex";

    document.body.classList.add(
        "work-history-open"
    );

    await refreshHistory();

    return true;
}

export function closeWorkHistory() {
    const modal =
        $("workHistoryModal");

    historyState.open = false;

    if (modal) {
        modal.hidden = true;
        modal.style.display = "none";
    }

    document.body.classList.remove(
        "work-history-open"
    );
}


/* ============================================================
   BUTTONS
   ============================================================ */

function bindHistoryButtons() {
    const button =
        $("workHistoryButton");

    if (button) {
        button.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                await openWorkHistory();
            }
        );
    }

    const close =
        $("closeWorkHistoryModal");

    if (close) {
        close.addEventListener(
            "click",
            event => {
                event.preventDefault();

                closeWorkHistory();
            }
        );
    }

    const modal =
        $("workHistoryModal");

    if (modal) {
        modal.addEventListener(
            "click",
            event => {
                if (
                    event.target === modal
                ) {
                    closeWorkHistory();
                }
            }
        );
    }

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                historyState.open
            ) {
                closeWorkHistory();
            }
        }
    );
}


/* ============================================================
   LOAD HISTORY
   ============================================================ */

export async function refreshHistory() {
    const userId =
        getUserId();

    if (!userId) {
        clearHistory();

        updateHistoryVisibility();

        return false;
    }

    if (historyState.loading) {
        return false;
    }

    historyState.loading = true;

    try {
        await Promise.all([
            loadUserTasks(userId),
            loadUserPayments(userId)
        ]);

        buildCombinedHistory();

        calculateTotals();

        renderHistory();

        updateHistoryVisibility();

        return true;
    } catch (error) {
        console.error(
            "refreshHistory failed:",
            error
        );

        renderHistoryError(
            error?.message ||
            "Unable to load work history."
        );

        return false;
    } finally {
        historyState.loading = false;
    }
}


/* ============================================================
   LOAD USER TASKS
   ============================================================ */

async function loadUserTasks(userId) {
    const db = client();

    if (!db) {
        historyState.tasks = [];
        return [];
    }

    try {
        /*
         * We intentionally query broadly and filter client-side.
         * This handles projects where worker ownership may be stored
         * as claimed_by, assigned_to, completed_by or user_id.
         */

        let result =
            await db
                .from(TABLES.tasks)
                .select("*")
                .order(
                    "updated_at",
                    {
                        ascending: false
                    }
                )
                .limit(500);

        if (result.error) {
            /*
             * Some schemas do not have updated_at.
             */
            result =
                await db
                    .from(TABLES.tasks)
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    )
                    .limit(500);
        }

        if (result.error) {
            throw result.error;
        }

        const rows =
            result.data || [];

        historyState.tasks =
            rows
                .filter(task =>
                    taskBelongsToUser(
                        task,
                        userId
                    )
                )
                .map(normalizeTask);

        return historyState.tasks;
    } catch (error) {
        console.warn(
            "loadUserTasks failed:",
            error
        );

        historyState.tasks = [];

        return [];
    }
}

function taskBelongsToUser(
    task,
    userId
) {
    const uid =
        String(userId);

    const possibleOwners = [
        task?.claimed_by,
        task?.assigned_to,
        task?.completed_by,
        task?.reviewed_by,
        task?.approved_by,
        task?.user_id,
        task?.worker_id,
        task?.owner_id
    ]
        .filter(Boolean)
        .map(String);

    return possibleOwners.includes(uid);
}


/* ============================================================
   NORMALIZE TASK
   ============================================================ */

function normalizeTask(task) {
    const status =
        String(
            task?.status ||
            "unknown"
        ).toLowerCase();

    return {
        ...task,

        id:
            task?.id ||
            task?.task_id ||
            "",

        title:
            safeText(
                task?.title ||
                task?.name ||
                task?.task_title,
                "Untitled task"
            ),

        work_type:
            safeText(
                task?.work_type ||
                task?.annotation_type ||
                task?.type,
                "Annotation"
            ),

        work_role:
            normalizeRole(
                task?.work_role ||
                task?.role ||
                ""
            ),

        status,

        pay:
            Number(
                task?.pay ??
                task?.amount ??
                task?.worker_pay ??
                0
            ),

        created_at:
            task?.created_at ||
            null,

        updated_at:
            task?.updated_at ||
            task?.completed_at ||
            task?.submitted_at ||
            null,

        completed_at:
            task?.completed_at ||
            null,

        submitted_at:
            task?.submitted_at ||
            null,

        approved_at:
            task?.approved_at ||
            null
    };
}


/* ============================================================
   LOAD PAYMENTS
   ============================================================ */

async function loadUserPayments(userId) {
    const db = client();

    if (!db) {
        historyState.payments = [];

        return [];
    }

    try {
        /*
         * First try the most common user_id field.
         */

        let result =
            await db
                .from(TABLES.payments)
                .select("*")
                .eq("user_id", userId)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(500);

        if (result.error) {
            /*
             * Some projects use worker_id instead.
             */
            result =
                await db
                    .from(TABLES.payments)
                    .select("*")
                    .eq("worker_id", userId)
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    )
                    .limit(500);
        }

        if (result.error) {
            /*
             * Last fallback: retrieve rows and filter locally.
             */
            result =
                await db
                    .from(TABLES.payments)
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    )
                    .limit(500);
        }

        if (result.error) {
            /*
             * Payment table may not exist yet.
             * History should still continue to work.
             */
            console.warn(
                "Payments query failed:",
                result.error
            );

            historyState.payments = [];

            return [];
        }

        const rows =
            result.data || [];

        historyState.payments =
            rows
                .filter(payment =>
                    paymentBelongsToUser(
                        payment,
                        userId
                    )
                )
                .map(normalizePayment);

        return historyState.payments;
    } catch (error) {
        console.warn(
            "loadUserPayments failed:",
            error
        );

        historyState.payments = [];

        return [];
    }
}

function paymentBelongsToUser(
    payment,
    userId
) {
    const uid =
        String(userId);

    const possibleOwners = [
        payment?.user_id,
        payment?.worker_id,
        payment?.profile_id,
        payment?.owner_id
    ]
        .filter(Boolean)
        .map(String);

    /*
     * If no ownership field exists, don't expose the payment.
     */
    if (!possibleOwners.length) {
        return false;
    }

    return possibleOwners.includes(uid);
}


/* ============================================================
   NORMALIZE PAYMENT
   ============================================================ */

function normalizePayment(payment) {
    const status =
        String(
            payment?.status ||
            (
                payment?.paid === true
                    ? "paid"
                    : "unpaid"
            )
        ).toLowerCase();

    const amount =
        Number(
            payment?.amount ??
            payment?.total ??
            payment?.pay ??
            payment?.worker_pay ??
            0
        );

    const paid =
        payment?.paid === true ||
        status === "paid" ||
        status === "released";

    return {
        ...payment,

        id:
            payment?.id ||
            payment?.payment_id ||
            "",

        amount,

        status,

        paid,

        created_at:
            payment?.created_at ||
            payment?.date ||
            null,

        paid_at:
            payment?.paid_at ||
            null,

        task_id:
            payment?.task_id ||
            null,

        work_type:
            payment?.work_type ||
            payment?.annotation_type ||
            "",

        description:
            payment?.description ||
            payment?.period ||
            ""
    };
}


/* ============================================================
   COMBINE
   ============================================================ */

function buildCombinedHistory() {
    const entries = [];

    historyState.tasks.forEach(task => {
        entries.push({
            kind: "task",
            id: `task-${task.id}`,
            date:
                task.approved_at ||
                task.completed_at ||
                task.submitted_at ||
                task.updated_at ||
                task.created_at,

            task,

            payment: null
        });
    });

    historyState.payments.forEach(payment => {
        entries.push({
            kind: "payment",
            id: `payment-${payment.id}`,
            date:
                payment.paid_at ||
                payment.created_at,

            task: null,

            payment
        });
    });

    entries.sort(
        (a, b) => {
            const aTime =
                new Date(
                    a.date || 0
                ).getTime();

            const bTime =
                new Date(
                    b.date || 0
                ).getTime();

            return bTime - aTime;
        }
    );

    historyState.combined =
        entries;
}


/* ============================================================
   TOTALS
   ============================================================ */

function calculateTotals() {
    const tasks =
        historyState.tasks;

    const payments =
        historyState.payments;

    historyState.totals.tasks =
        tasks.length;

    historyState.totals.completed =
        tasks.filter(task =>
            [
                "completed",
                "submitted",
                "approved",
                "done"
            ].includes(task.status)
        ).length;

    historyState.totals.submitted =
        tasks.filter(task =>
            [
                "submitted",
                "completed"
            ].includes(task.status)
        ).length;

    historyState.totals.approved =
        tasks.filter(task =>
            [
                "approved",
                "done"
            ].includes(task.status)
        ).length;

    /*
     * Task earnings are used as a fallback when payment records
     * have not been generated yet.
     */
    const completedTaskPay =
        tasks
            .filter(task =>
                [
                    "completed",
                    "submitted",
                    "approved",
                    "done"
                ].includes(task.status)
            )
            .reduce(
                (total, task) =>
                    total +
                    (
                        Number.isFinite(task.pay)
                            ? task.pay
                            : 0
                    ),
                0
            );

    const paymentTotal =
        payments.reduce(
            (total, payment) =>
                total +
                (
                    Number.isFinite(payment.amount)
                        ? payment.amount
                        : 0
                ),
            0
        );

    /*
     * If payment records exist, they are the authoritative
     * payment amount. Otherwise use completed task pay.
     */
    historyState.totals.earned =
        payments.length
            ? paymentTotal
            : completedTaskPay;

    historyState.totals.paid =
        payments.filter(
            payment => payment.paid
        ).length;

    historyState.totals.unpaid =
        payments.filter(
            payment => !payment.paid
        ).length;

    historyState.totals.paidAmount =
        payments
            .filter(
                payment => payment.paid
            )
            .reduce(
                (total, payment) =>
                    total +
                    payment.amount,
                0
            );

    historyState.totals.unpaidAmount =
        payments
            .filter(
                payment => !payment.paid
            )
            .reduce(
                (total, payment) =>
                    total +
                    payment.amount,
                0
            );
}


/* ============================================================
   RENDER
   ============================================================ */

function renderHistory() {
    const container =
        $("workHistoryList");

    if (!container) {
        return;
    }

    renderHistorySummary(
        container
    );

    if (
        !historyState.combined.length
    ) {
        container.insertAdjacentHTML(
            "beforeend",
            `
                <div class="history-empty-state">
                    <div class="history-empty-icon">
                        📋
                    </div>

                    <h3>
                        No work history yet
                    </h3>

                    <p>
                        Completed work and payment records
                        will appear here.
                    </p>
                </div>
            `
        );

        return;
    }

    const list =
        document.createElement("div");

    list.className =
        "history-entry-list";

    list.innerHTML =
        historyState.combined
            .map(
                entry =>
                    renderHistoryEntry(
                        entry
                    )
            )
            .join("");

    container.appendChild(list);
}

function renderHistorySummary(
    container
) {
    const summary =
        document.createElement("div");

    summary.className =
        "history-summary";

    summary.innerHTML = `
        <div class="history-stat">

            <span>
                Completed
            </span>

            <strong>
                ${escapeHTML(
                    historyState.totals.completed
                )}
            </strong>

        </div>

        <div class="history-stat">

            <span>
                Approved
            </span>

            <strong>
                ${escapeHTML(
                    historyState.totals.approved
                )}
            </strong>

        </div>

        <div class="history-stat">

            <span>
                Earned
            </span>

            <strong>
                ${escapeHTML(
                    formatMoney(
                        historyState.totals.earned
                    )
                )}
            </strong>

        </div>

        <div class="history-stat">

            <span>
                Paid
            </span>

            <strong>
                ${escapeHTML(
                    formatMoney(
                        historyState.totals.paidAmount
                    )
                )}
            </strong>

        </div>

        <div class="history-stat">

            <span>
                Unpaid
            </span>

            <strong>
                ${escapeHTML(
                    formatMoney(
                        historyState.totals.unpaidAmount
                    )
                )}
            </strong>

        </div>
    `;

    container.innerHTML = "";

    container.appendChild(
        summary
    );
}

function renderHistoryEntry(
    entry
) {
    if (entry.kind === "payment") {
        return renderPaymentEntry(
            entry.payment
        );
    }

    return renderTaskEntry(
        entry.task
    );
}


/* ============================================================
   TASK HISTORY ENTRY
   ============================================================ */

function renderTaskEntry(task) {
    const status =
        task.status;

    const approved =
        [
            "approved",
            "done"
        ].includes(status);

    const completed =
        [
            "completed",
            "submitted",
            "approved",
            "done"
        ].includes(status);

    const role =
        task.work_role
            ? roleLabel(task.work_role)
            : "";

    const date =
        task.approved_at ||
        task.completed_at ||
        task.submitted_at ||
        task.updated_at ||
        task.created_at;

    return `
        <article
            class="history-entry history-task-entry"
            data-history-task-id="${escapeHTML(task.id)}"
        >

            <div class="history-entry-icon">
                ${
                    approved
                        ? "✓"
                        : completed
                            ? "✓"
                            : "◷"
                }
            </div>

            <div class="history-entry-content">

                <div class="history-entry-header">

                    <div>

                        <h3>
                            ${escapeHTML(task.title)}
                        </h3>

                        <p>
                            Task ID:
                            ${escapeHTML(task.id)}
                        </p>

                    </div>

                    <span class="history-status ${
                        status === "approved"
                            ? "status-approved"
                            : status === "completed" ||
                              status === "submitted"
                                ? "status-completed"
                                : "status-pending"
                    }">
                        ${escapeHTML(status)}
                    </span>

                </div>

                <div class="history-entry-details">

                    <span>
                        Work:
                        ${escapeHTML(task.work_type)}
                    </span>

                    ${
                        role
                            ? `
                                <span>
                                    Role:
                                    ${escapeHTML(role)}
                                </span>
                            `
                            : ""
                    }

                    <span>
                        Pay:
                        ${escapeHTML(
                            formatMoney(
                                task.pay
                            )
                        )}
                    </span>

                    <span>
                        ${escapeHTML(
                            formatDate(date)
                        )}
                    </span>

                </div>

            </div>

        </article>
    `;
}


/* ============================================================
   PAYMENT ENTRY
   ============================================================ */

function renderPaymentEntry(
    payment
) {
    const paid =
        payment.paid;

    const statusText =
        paid
            ? "Paid"
            : "Not paid";

    const date =
        payment.paid_at ||
        payment.created_at;

    return `
        <article
            class="history-entry history-payment-entry"
            data-history-payment-id="${escapeHTML(payment.id)}"
        >

            <div class="history-entry-icon">
                ${
                    paid
                        ? "✓"
                        : "💰"
                }
            </div>

            <div class="history-entry-content">

                <div class="history-entry-header">

                    <div>

                        <h3>
                            Payment
                        </h3>

                        <p>
                            ${
                                payment.task_id
                                    ? `
                                        Task:
                                        ${escapeHTML(
                                            payment.task_id
                                        )}
                                    `
                                    : escapeHTML(
                                        payment.description ||
                                        "Work payment"
                                    )
                            }
                        </p>

                    </div>

                    <span class="history-status ${
                        paid
                            ? "status-paid"
                            : "status-unpaid"
                    }">
                        ${statusText}
                    </span>

                </div>

                <div class="history-entry-details">

                    <strong>
                        ${escapeHTML(
                            formatMoney(
                                payment.amount
                            )
                        )}
                    </strong>

                    ${
                        payment.work_type
                            ? `
                                <span>
                                    Work:
                                    ${escapeHTML(
                                        payment.work_type
                                    )}
                                </span>
                            `
                            : ""
                    }

                    <span>
                        ${escapeHTML(
                            formatDate(date)
                        )}
                    </span>

                </div>

            </div>

        </article>
    `;
}


/* ============================================================
   ERROR
   ============================================================ */

function renderHistoryError(
    message
) {
    const container =
        $("workHistoryList");

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="history-error-state">

            <h3>
                Unable to load work history
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

            <button
                type="button"
                id="retryHistoryButton"
            >
                Try again
            </button>

        </div>
    `;

    const retry =
        $("retryHistoryButton");

    if (retry) {
        retry.addEventListener(
            "click",
            async () => {
                await refreshHistory();
            },
            {
                once: true
            }
        );
    }
}


/* ============================================================
   CLEAR
   ============================================================ */

function clearHistory() {
    historyState.tasks = [];
    historyState.payments = [];
    historyState.combined = [];

    historyState.totals = {
        tasks: 0,
        completed: 0,
        approved: 0,
        submitted: 0,
        paid: 0,
        unpaid: 0,
        earned: 0,
        paidAmount: 0,
        unpaidAmount: 0
    };

    const container =
        $("workHistoryList");

    if (container) {
        container.innerHTML = "";
    }
}


/* ============================================================
   HISTORY VISIBILITY
   ============================================================
   Requirement:
   "work history shortcut disappears once all payment
    records for user are paid."

   If there are no payment records yet, keep the shortcut visible
   because there is nothing to indicate that all records have
   already been paid.
   ============================================================ */

export function updateHistoryVisibility() {
    const button =
        $("workHistoryButton");

    if (!button) {
        return;
    }

    const userId =
        getUserId();

    if (!userId) {
        button.hidden = true;
        button.style.display = "none";

        return;
    }

    const payments =
        historyState.payments;

    /*
     * No records:
     * keep History available.
     */
    if (!payments.length) {
        button.hidden = false;
        button.style.display = "";

        return;
    }

    const allPaid =
        payments.every(
            payment => payment.paid
        );

    if (allPaid) {
        button.hidden = true;
        button.style.display = "none";
    } else {
        button.hidden = false;
        button.style.display = "";
    }
}


/* ============================================================
   PAYMENT STATUS CHECK
   ============================================================ */

export function areAllPaymentsPaid() {
    const payments =
        historyState.payments;

    if (!payments.length) {
        return false;
    }

    return payments.every(
        payment => payment.paid
    );
}

export function hasUnpaidPayments() {
    return historyState.payments.some(
        payment => !payment.paid
    );
}


/* ============================================================
   USER PAYMENT SUMMARY
   ============================================================ */

export function getPaymentSummary() {
    return {
        totalRecords:
            historyState.payments.length,

        paidRecords:
            historyState.totals.paid,

        unpaidRecords:
            historyState.totals.unpaid,

        totalAmount:
            historyState.totals.earned,

        paidAmount:
            historyState.totals.paidAmount,

        unpaidAmount:
            historyState.totals.unpaidAmount,

        allPaid:
            areAllPaymentsPaid()
    };
}


/* ============================================================
   GET STATE
   ============================================================ */

export function getHistoryState() {
    return historyState;
}


/* ============================================================
   LOG HISTORY VIEW
   ============================================================ */

async function logHistoryViewed() {
    try {
        await logActivity?.(
            "work_history_viewed",
            {
                user_id:
                    getUserId(),
                email:
                    getUserEmailAddress()
            }
        );
    } catch (error) {
        console.warn(
            "History activity log failed:",
            error
        );
    }
}


/* ============================================================
   PUBLIC WINDOW COMPATIBILITY
   ============================================================ */

window.historyManager = {
    state: historyState,

    initialize:
        initializeHistory,

    open:
        openWorkHistory,

    close:
        closeWorkHistory,

    refresh:
        refreshHistory,

    getState:
        getHistoryState,

    getPaymentSummary,

    areAllPaymentsPaid,

    hasUnpaidPayments,

    updateVisibility:
        updateHistoryVisibility
};


/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeHistory,
        {
            once: true
        }
    );
} else {
    initializeHistory();
}


/* ============================================================
   EXPORTS
   ============================================================ */

export {
    loadUserTasks,
    loadUserPayments,
    calculateTotals,
    renderHistory
};
