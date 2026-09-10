 // ============================================================
// ANNOTATION AI
// PART 5 — js/tasks.js
// TASKS / TASK ACTIONS / SUBMIT / SKIP / WORK HISTORY
// ============================================================

import {
    state,
    $,
    emit,
    render,
    saveFrame
} from "./annotation.js";

import {
    supabase,
    getCurrentUser,
    getCurrentSession
} from "./supabase.js";


// ============================================================
// TASK STATE
// ============================================================

let currentTask = null;

let availableTasks = [];

let taskHistory = [];

let taskLoading = false;

let taskSubmitting = false;

let taskSkipping = false;

let taskListenersBound = false;


// ============================================================
// DOM HELPERS
// ============================================================

function setText(
    element,
    text
) {
    if (!element) return;

    element.textContent =
        String(text ?? "");
}


function show(
    element,
    visible = true
) {
    if (!element) return;

    element.style.display =
        visible ? "" : "none";
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


// ============================================================
// TASK ACTION BAR
// ============================================================

function getTaskActionBar() {
    return $("taskActionBar");
}


function getTaskActionTitle() {
    return $("taskActionTitle");
}


function getTaskActionMeta() {
    return $("taskActionMeta");
}


function getSkipButton() {
    return (
        $("skipTaskButton") ||
        $("skipTaskBtn") ||
        $("skipTask")
    );
}


function getSubmitButton() {
    return (
        $("submitTaskButton") ||
        $("submitTaskBtn") ||
        $("submitTask")
    );
}


function getApproveButton() {
    return (
        $("approveTaskButton") ||
        $("approveTaskBtn") ||
        $("approveTask")
    );
}


// ============================================================
// TASK ACTION BAR UPDATE
// ============================================================

export function updateTaskActionBar() {
    const bar =
        getTaskActionBar();

    if (!bar) return;

    if (!currentTask) {
        show(bar, false);
        return;
    }

    show(bar, true);

    const title =
        getTaskActionTitle();

    const meta =
        getTaskActionMeta();

    setText(
        title,
        currentTask.title ||
        currentTask.name ||
        "Current task"
    );

    const shape =
        currentTask.shape ||
        currentTask.task_type ||
        currentTask.type ||
        "";

    const duration =
        currentTask.duration ||
        currentTask.duration_minutes ||
        "";

    const pay =
        currentTask.pay ||
        currentTask.payment ||
        currentTask.reward ||
        "";

    const pieces = [];

    if (shape) {
        pieces.push(
            String(shape)
        );
    }

    if (duration) {
        pieces.push(
            `${duration} min`
        );
    }

    if (
        pay !== "" &&
        pay !== null &&
        pay !== undefined
    ) {
        pieces.push(
            `${pay}`
        );
    }

    setText(
        meta,
        pieces.join(" • ")
    );

    updateTaskButtons();
}


// ============================================================
// TASK BUTTON STATE
// ============================================================

function updateTaskButtons() {
    const skip =
        getSkipButton();

    const submit =
        getSubmitButton();

    const approve =
        getApproveButton();

    const disabled =
        taskLoading ||
        taskSubmitting ||
        taskSkipping ||
        !currentTask;

    if (skip) {
        skip.disabled =
            disabled;
    }

    if (submit) {
        submit.disabled =
            disabled;
    }

    if (approve) {
        approve.disabled =
            disabled;
    }
}


// ============================================================
// TASK STATUS
// ============================================================

function getTaskStatusElement() {
    return (
        $("taskStatus") ||
        $("taskActionStatus") ||
        $("taskMessage") ||
        $("adminTaskStatus")
    );
}


function setTaskStatus(
    message,
    type = "info"
) {
    const element =
        getTaskStatusElement();

    if (!element) return;

    setText(
        element,
        message
    );

    element.dataset.status =
        type;

    element.classList.remove(
        "success",
        "error",
        "warning",
        "info",
        "loading"
    );

    element.classList.add(
        type
    );
}


// ============================================================
// USER
// ============================================================

async function requireUser() {
    try {
        const user =
            await getCurrentUser();

        if (user) {
            return user;
        }
    } catch (_) {
        // Continue to fallback.
    }

    const session =
        await getCurrentSession();

    return session?.user || null;
}


// ============================================================
// SAFE SUPABASE CHECK
// ============================================================

function canUseSupabase() {
    return Boolean(
        supabase &&
        typeof supabase.from ===
            "function"
    );
}


// ============================================================
// GENERIC TASK TABLE
// ============================================================

function getTaskTable() {
    return (
        window.APP_TASK_TABLE ||
        "tasks"
    );
}


// ============================================================
// NORMALIZE TASK
// ============================================================

export function normalizeTask(
    task
) {
    if (!task) {
        return null;
    }

    return {
        ...task,

        id:
            task.id ??
            task.task_id ??
            task.taskId,

        title:
            task.title ??
            task.name ??
            "Untitled task",

        description:
            task.description ??
            task.instructions ??
            "",

        shape:
            task.shape ??
            task.task_shape ??
            task.task_type ??
            task.type ??
            "box",

        duration:
            task.duration ??
            task.duration_minutes ??
            task.estimated_minutes ??
            null,

        pay:
            task.pay ??
            task.payment ??
            task.reward ??
            null,

        status:
            task.status ??
            "available",

        media_url:
            task.media_url ??
            task.mediaUrl ??
            task.source_url ??
            task.url ??
            null,

        media_type:
            task.media_type ??
            task.mediaType ??
            null,

        created_at:
            task.created_at ??
            null,

        assigned_to:
            task.assigned_to ??
            task.assignedTo ??
            null
    };
}


// ============================================================
// FETCH AVAILABLE TASKS
// ============================================================

export async function fetchAvailableTasks(
    options = {}
) {
    const {
        limit = 50
    } = options;

    if (!canUseSupabase()) {
        return [];
    }

    const user =
        await requireUser();

    if (!user) {
        return [];
    }

    taskLoading = true;

    updateTaskButtons();

    try {
        const table =
            getTaskTable();

        let query =
            supabase
                .from(table)
                .select("*");

        /*
         * Do not assume a single database schema.
         * Try the common available-status query first.
         */

        let result =
            await query
                .eq(
                    "status",
                    "available"
                )
                .limit(limit);

        /*
         * Some installations may not have
         * a status column. Fall back to a
         * general task query rather than
         * crashing the application.
         */

        if (
            result.error
        ) {
            result =
                await supabase
                    .from(table)
                    .select("*")
                    .limit(limit);
        }

        if (result.error) {
            console.error(
                "Unable to load tasks:",
                result.error
            );

            setTaskStatus(
                "Unable to load tasks.",
                "error"
            );

            return [];
        }

        availableTasks =
            (result.data || [])
                .map(
                    normalizeTask
                )
                .filter(
                    Boolean
                );

        renderAvailableTasks(
            availableTasks
        );

        emit(
            "tasksLoaded",
            {
                tasks:
                    availableTasks
            }
        );

        return availableTasks;
    } catch (error) {
        console.error(
            "Task loading error:",
            error
        );

        setTaskStatus(
            "Unable to load tasks.",
            "error"
        );

        return [];
    } finally {
        taskLoading = false;

        updateTaskButtons();
    }
}


// ============================================================
// AVAILABLE TASKS UI
// ============================================================

function getAvailableTasksContainer() {
    return (
        $("availableJobs") ||
        $("availableTasks") ||
        $("tasksList")
    );
}


function renderAvailableTasks(
    tasks
) {
    const container =
        getAvailableTasksContainer();

    if (!container) return;

    if (!tasks.length) {
        container.innerHTML = `
            <div class="empty-state">
                No available tasks right now.
            </div>
        `;

        return;
    }

    container.innerHTML =
        tasks.map(
            (task) => `
                <button
                    type="button"
                    class="task-card"
                    data-task-id="${escapeHTML(task.id)}"
                >
                    <div class="task-card-title">
                        ${escapeHTML(task.title)}
                    </div>

                    <div class="task-card-meta">
                        ${escapeHTML(
                            task.shape || ""
                        )}
                        ${
                            task.duration
                                ? ` • ${escapeHTML(
                                      task.duration
                                  )} min`
                                : ""
                        }
                        ${
                            task.pay !== null &&
                            task.pay !== undefined
                                ? ` • ${escapeHTML(
                                      task.pay
                                  )}`
                                : ""
                        }
                    </div>

                    ${
                        task.description
                            ? `
                                <div class="task-card-description">
                                    ${escapeHTML(
                                        task.description
                                    )}
                                </div>
                            `
                            : ""
                    }
                </button>
            `
        )
        .join("");

    container
        .querySelectorAll(
            "[data-task-id]"
        )
        .forEach(
            (element) => {
                element.addEventListener(
                    "click",
                    () => {
                        const taskId =
                            element.dataset.taskId;

                        selectTask(
                            taskId
                        );
                    }
                );
            }
        );
}


// ============================================================
// FIND TASK
// ============================================================

function findTask(
    taskId
) {
    return availableTasks.find(
        (task) =>
            String(task.id) ===
            String(taskId)
    );
}


// ============================================================
// SELECT TASK
// ============================================================

export async function selectTask(
    taskOrId
) {
    let task;

    if (
        typeof taskOrId ===
        "object"
    ) {
        task =
            normalizeTask(
                taskOrId
            );
    } else {
        task =
            findTask(
                taskOrId
            );
    }

    if (!task) {
        setTaskStatus(
            "Task could not be found.",
            "error"
        );

        return false;
    }

    currentTask =
        task;

    updateTaskActionBar();

    setTaskStatus(
        `Task selected: ${task.title}`,
        "info"
    );

    emit(
        "taskSelected",
        {
            task
        }
    );

    /*
     * If the task contains a direct media URL,
     * ask the media module to load it.
     */

    if (
        task.media_url
    ) {
        try {
            window.dispatchEvent(
                new CustomEvent(
                    "annotation:loadTaskMedia",
                    {
                        detail: {
                            task
                        }
                    }
                )
            );
        } catch (_) {
            // Ignore event errors.
        }
    }

    return true;
}


// ============================================================
// GET CURRENT TASK
// ============================================================

export function getCurrentTask() {
    return currentTask;
}


// ============================================================
// CLEAR CURRENT TASK
// ============================================================

export function clearCurrentTask() {
    currentTask = null;

    updateTaskActionBar();

    emit(
        "taskCleared"
    );
}


// ============================================================
// TASK MEDIA EVENT
// ============================================================

window.addEventListener(
    "annotation:taskSelected",
    (event) => {
        const task =
            event.detail?.task;

        if (task) {
            selectTask(task);
        }
    }
);


// ============================================================
// ASSIGN TASK
// ============================================================

async function assignTaskToUser(
    taskId,
    userId
) {
    if (
        !canUseSupabase()
    ) {
        return {
            ok: false,
            error:
                new Error(
                    "Supabase is not configured."
                )
        };
    }

    const table =
        getTaskTable();

    /*
     * Try the most common task assignment
     * field first.
     */

    let result =
        await supabase
            .from(table)
            .update({
                status:
                    "in_progress",

                assigned_to:
                    userId
            })
            .eq(
                "id",
                taskId
            );

    /*
     * If the database does not allow the
     * expected fields, don't repeatedly
     * mutate unknown schema.
     */

    return {
        ok:
            !result.error,

        error:
            result.error || null,

        data:
            result.data || null
    };
}


// ============================================================
// START CURRENT TASK
// ============================================================

export async function startCurrentTask() {
    if (!currentTask) {
        return false;
    }

    const user =
        await requireUser();

    if (!user) {
        setTaskStatus(
            "Please sign in first.",
            "warning"
        );

        return false;
    }

    if (
        !currentTask.id
    ) {
        return true;
    }

    const result =
        await assignTaskToUser(
            currentTask.id,
            user.id
        );

    if (
        !result.ok
    ) {
        /*
         * Assignment can be controlled by
         * database policies. Keep the task
         * usable locally if assignment is
         * not supported.
         */

        console.warn(
            "Task assignment was not completed:",
            result.error
        );

        return false;
    }

    currentTask = {
        ...currentTask,
        status:
            "in_progress",
        assigned_to:
            user.id
    };

    updateTaskActionBar();

    setTaskStatus(
        "Task started.",
        "success"
    );

    return true;
}


// ============================================================
// VALIDATE ANNOTATIONS
// ============================================================

export function validateCurrentTask() {
    if (!currentTask) {
        return {
            valid: false,
            message:
                "No task is selected."
        };
    }

    if (
        !Array.isArray(
            state.annotations
        )
    ) {
        return {
            valid: false,
            message:
                "No annotations were created."
        };
    }

    /*
     * Submitting zero annotations may be valid
     * for some task types, so only block it when
     * explicitly configured by the task.
     */

    const requiresAnnotation =
        currentTask.require_annotation ===
            true ||
        currentTask.requires_annotation ===
            true;

    if (
        requiresAnnotation &&
        state.annotations.length === 0
    ) {
        return {
            valid: false,
            message:
                "Add at least one annotation before submitting."
        };
    }

    return {
        valid: true,
        message: ""
    };
}


// ============================================================
// SERIALIZE ANNOTATIONS
// ============================================================

export function serializeAnnotations() {
    if (
        !Array.isArray(
            state.annotations
        )
    ) {
        return [];
    }

    return state.annotations.map(
        (annotation) => ({
            ...annotation,

            /*
             * Remove temporary UI flags from
             * the submitted representation.
             */

            selected:
                undefined
        })
    );
}


// ============================================================
// BUILD SUBMISSION PAYLOAD
// ============================================================

function buildSubmissionPayload(
    user
) {
    const annotations =
        serializeAnnotations();

    return {
        task_id:
            currentTask?.id ??
            null,

        user_id:
            user?.id ??
            null,

        annotations,

        annotation_count:
            annotations.length,

        media_type:
            state.mediaType ||
            null,

        current_frame:
            state.mediaType ===
            "video"
                ? state.currentFrame
                : null,

        submitted_at:
            new Date().toISOString()
    };
}


// ============================================================
// SAVE TASK RESULT
// ============================================================

async function saveTaskResult(
    payload
) {
    if (
        !canUseSupabase()
    ) {
        return {
            ok: false,
            error:
                new Error(
                    "Supabase is not configured."
                )
        };
    }

    /*
     * The exact result table was not present
     * in the supplied application source.
     *
     * Allow the final application configuration
     * to specify it.
     */

    const table =
        window.APP_RESULT_TABLE ||
        "task_results";

    const result =
        await supabase
            .from(table)
            .insert(payload)
            .select()
            .maybeSingle();

    return {
        ok:
            !result.error,

        data:
            result.data || null,

        error:
            result.error || null
    };
}


// ============================================================
// UPDATE TASK STATUS
// ============================================================

async function updateTaskStatus(
    taskId,
    status
) {
    if (
        !canUseSupabase() ||
        !taskId
    ) {
        return {
            ok: false,
            error:
                new Error(
                    "Task update unavailable."
                )
        };
    }

    const table =
        getTaskTable();

    const result =
        await supabase
            .from(table)
            .update({
                status
            })
            .eq(
                "id",
                taskId
            );

    return {
        ok:
            !result.error,

        error:
            result.error || null
    };
}


// ============================================================
// SUBMIT CURRENT TASK
// ============================================================

export async function submitCurrentTask() {
    if (
        taskSubmitting
    ) {
        return false;
    }

    const validation =
        validateCurrentTask();

    if (
        !validation.valid
    ) {
        setTaskStatus(
            validation.message,
            "warning"
        );

        return false;
    }

    const user =
        await requireUser();

    if (!user) {
        setTaskStatus(
            "Please sign in before submitting.",
            "warning"
        );

        return false;
    }

    taskSubmitting = true;

    updateTaskButtons();

    setTaskStatus(
        "Submitting task…",
        "loading"
    );

    try {
        /*
         * Preserve current video-frame annotations
         * before submission.
         */

        if (
            state.mediaType ===
            "video"
        ) {
            try {
                saveFrame(
                    state.currentFrame
                );
            } catch (_) {
                // Ignore.
            }
        }

        const payload =
            buildSubmissionPayload(
                user
            );

        const result =
            await saveTaskResult(
                payload
            );

        if (
            !result.ok
        ) {
            /*
             * Don't silently claim success if the
             * result table does not exist or RLS
             * rejects the operation.
             */

            console.error(
                "Task submission failed:",
                result.error
            );

            setTaskStatus(
                "Task could not be submitted. Check your database setup.",
                "error"
            );

            return false;
        }

        if (
            currentTask?.id
        ) {
            const statusResult =
                await updateTaskStatus(
                    currentTask.id,
                    "submitted"
                );

            if (
                !statusResult.ok
            ) {
                console.warn(
                    "Task result saved, but task status was not updated:",
                    statusResult.error
                );
            }
        }

        const completedTask =
            currentTask;

        taskHistory.unshift({
            ...completedTask,

            completed_at:
                new Date().toISOString(),

            annotation_count:
                state.annotations.length,

            status:
                "submitted"
        });

        currentTask = null;

        updateTaskActionBar();

        setTaskStatus(
            "Task submitted successfully.",
            "success"
        );

        emit(
            "taskSubmitted",
            {
                task:
                    completedTask,
                result:
                    result.data
            }
        );

        /*
         * Refresh available jobs after submission.
         */

        await fetchAvailableTasks();

        return true;
    } catch (error) {
        console.error(
            "Task submission error:",
            error
        );

        setTaskStatus(
            "Task submission failed.",
            "error"
        );

        return false;
    } finally {
        taskSubmitting = false;

        updateTaskButtons();
    }
}


// ============================================================
// SKIP CURRENT TASK
// ============================================================

export async function skipCurrentTask(
    reason = ""
) {
    if (
        taskSkipping
    ) {
        return false;
    }

    if (!currentTask) {
        setTaskStatus(
            "No task is selected.",
            "warning"
        );

        return false;
    }

    const task =
        currentTask;

    taskSkipping = true;

    updateTaskButtons();

    setTaskStatus(
        "Skipping task…",
        "loading"
    );

    try {
        let updateSucceeded =
            false;

        if (
            task.id &&
            canUseSupabase()
        ) {
            const table =
                getTaskTable();

            /*
             * Keep the reason only if a reason
             * field is explicitly available via
             * configuration.
             */

            const updatePayload = {
                status:
                    "skipped"
            };

            const reasonColumn =
                window.APP_TASK_SKIP_REASON_COLUMN;

            if (
                reasonColumn &&
                reason
            ) {
                updatePayload[
                    reasonColumn
                ] = reason;
            }

            const result =
                await supabase
                    .from(table)
                    .update(
                        updatePayload
                    )
                    .eq(
                        "id",
                        task.id
                    );

            updateSucceeded =
                !result.error;

            if (
                result.error
            ) {
                console.warn(
                    "Task skip database update failed:",
                    result.error
                );
            }
        }

        /*
         * Remove the task from the local
         * available-task list regardless of
         * whether the remote status update
         * is available.
         */

        availableTasks =
            availableTasks.filter(
                item =>
                    String(item.id) !==
                    String(task.id)
            );

        renderAvailableTasks(
            availableTasks
        );

        currentTask = null;

        updateTaskActionBar();

        setTaskStatus(
            updateSucceeded
                ? "Task skipped."
                : "Task removed from your current workspace.",
            updateSucceeded
                ? "success"
                : "info"
        );

        emit(
            "taskSkipped",
            {
                task,
                reason,
                remote:
                    updateSucceeded
            }
        );

        return true;
    } catch (error) {
        console.error(
            "Task skip error:",
            error
        );

        setTaskStatus(
            "Unable to skip task.",
            "error"
        );

        return false;
    } finally {
        taskSkipping = false;

        updateTaskButtons();
    }
}


// ============================================================
// SKIP MODAL
// ============================================================

function getSkipModal() {
    return (
        $("skipModal") ||
        $("skipTaskModal")
    );
}


function getSkipReasonInput() {
    return (
        $("skipReason") ||
        $("skipTaskReason") ||
        $("skipReasonInput")
    );
}


function getCloseSkipButton() {
    return (
        $("closeSkipModal") ||
        $("cancelSkipTask") ||
        $("cancelSkip")
    );
}


function getConfirmSkipButton() {
    return (
        $("confirmSkipTask") ||
        $("skipTaskConfirm") ||
        $("confirmSkip")
    );
}


function openSkipModal() {
    const modal =
        getSkipModal();

    if (!modal) {
        skipCurrentTask();
        return;
    }

    show(
        modal,
        true
    );

    const reason =
        getSkipReasonInput();

    if (reason) {
        reason.value = "";

        setTimeout(
            () => reason.focus(),
            0
        );
    }
}


function closeSkipModal() {
    const modal =
        getSkipModal();

    if (modal) {
        show(
            modal,
            false
        );
    }
}


async function confirmSkip() {
    const reason =
        getSkipReasonInput();

    const value =
        reason?.value?.trim() ||
        "";

    closeSkipModal();

    await skipCurrentTask(
        value
    );
}


// ============================================================
// TASK ACTION BUTTONS
// ============================================================

function bindTaskButtons() {
    const skip =
        getSkipButton();

    const submit =
        getSubmitButton();

    if (skip) {
        skip.addEventListener(
            "click",
            () => {
                openSkipModal();
            }
        );
    }

    if (submit) {
        submit.addEventListener(
            "click",
            () => {
                submitCurrentTask();
            }
        );
    }

    const approve =
        getApproveButton();

    if (approve) {
        approve.addEventListener(
            "click",
            () => {
                approveCurrentTask();
            }
        );
    }

    const closeSkip =
        getCloseSkipButton();

    if (closeSkip) {
        closeSkip.addEventListener(
            "click",
            closeSkipModal
        );
    }

    const confirm =
        getConfirmSkipButton();

    if (confirm) {
        confirm.addEventListener(
            "click",
            confirmSkip
        );
    }

    const modal =
        getSkipModal();

    if (modal) {
        modal.addEventListener(
            "click",
            (event) => {
                if (
                    event.target ===
                    modal
                ) {
                    closeSkipModal();
                }
            }
        );
    }
}


// ============================================================
// APPROVE CURRENT TASK
// ============================================================

export async function approveCurrentTask() {
    if (!currentTask) {
        setTaskStatus(
            "No task is selected.",
            "warning"
        );

        return false;
    }

    if (
        !canUseSupabase()
    ) {
        setTaskStatus(
            "Database connection is unavailable.",
            "error"
        );

        return false;
    }

    const task =
        currentTask;

    const table =
        getTaskTable();

    try {
        const result =
            await supabase
                .from(table)
                .update({
                    status:
                        "approved"
                })
                .eq(
                    "id",
                    task.id
                );

        if (
            result.error
        ) {
            console.error(
                result.error
            );

            setTaskStatus(
                "Unable to approve task.",
                "error"
            );

            return false;
        }

        currentTask = {
            ...task,
            status:
                "approved"
        };

        updateTaskActionBar();

        setTaskStatus(
            "Task approved.",
            "success"
        );

        emit(
            "taskApproved",
            {
                task:
                    currentTask
            }
        );

        return true;
    } catch (error) {
        console.error(
            "Approve task error:",
            error
        );

        setTaskStatus(
            "Unable to approve task.",
            "error"
        );

        return false;
    }
}


// ============================================================
// WORK HISTORY
// ============================================================

function getWorkHistoryContainer() {
    return (
        $("workHistoryList") ||
        $("workHistory")
    );
}


export async function fetchWorkHistory(
    options = {}
) {
    const {
        limit = 50
    } = options;

    if (
        !canUseSupabase()
    ) {
        renderWorkHistory(
            taskHistory
        );

        return taskHistory;
    }

    const user =
        await requireUser();

    if (!user) {
        return [];
    }

    try {
        const table =
            window.APP_RESULT_TABLE ||
            "task_results";

        const result =
            await supabase
                .from(table)
                .select("*")
                .eq(
                    "user_id",
                    user.id
                )
                .order(
                    "submitted_at",
                    {
                        ascending:
                            false
                    }
                )
                .limit(limit);

        if (
            result.error
        ) {
            /*
             * Some existing databases may use
             * created_at rather than submitted_at.
             */

            const fallback =
                await supabase
                    .from(table)
                    .select("*")
                    .eq(
                        "user_id",
                        user.id
                    )
                    .limit(limit);

            if (
                fallback.error
            ) {
                console.warn(
                    "Unable to load work history:",
                    fallback.error
                );

                renderWorkHistory(
                    taskHistory
                );

                return taskHistory;
            }

            taskHistory =
                fallback.data || [];
        } else {
            taskHistory =
                result.data || [];
        }

        renderWorkHistory(
            taskHistory
        );

        emit(
            "workHistoryLoaded",
            {
                history:
                    taskHistory
            }
        );

        return taskHistory;
    } catch (error) {
        console.error(
            "Work history error:",
            error
        );

        renderWorkHistory(
            taskHistory
        );

        return taskHistory;
    }
}


// ============================================================
// RENDER WORK HISTORY
// ============================================================

function renderWorkHistory(
    history
) {
    const container =
        getWorkHistoryContainer();

    if (!container) return;

    if (
        !history ||
        !history.length
    ) {
        container.innerHTML = `
            <div class="empty-state">
                No work history yet.
            </div>
        `;

        return;
    }

    container.innerHTML =
        history.map(
            (item) => {
                const title =
                    item.task_title ||
                    item.title ||
                    item.task_name ||
                    `Task ${item.task_id || ""}`;

                const status =
                    item.status ||
                    "submitted";

                const count =
                    item.annotation_count ??
                    item.annotations?.length ??
                    0;

                const date =
                    item.submitted_at ||
                    item.completed_at ||
                    item.created_at;

                return `
                    <div class="history-item">
                        <div class="history-item-title">
                            ${escapeHTML(title)}
                        </div>

                        <div class="history-item-meta">
                            <span>
                                ${escapeHTML(status)}
                            </span>

                            <span>
                                ${escapeHTML(
                                    count
                                )} annotation${
                                    Number(count) ===
                                    1
                                        ? ""
                                        : "s"
                                }
                            </span>

                            ${
                                date
                                    ? `
                                        <span>
                                            ${escapeHTML(
                                                formatDate(
                                                    date
                                                )
                                            )}
                                        </span>
                                    `
                                    : ""
                            }
                        </div>
                    </div>
                `;
            }
        )
        .join("");
}


// ============================================================
// DATE FORMAT
// ============================================================

function formatDate(
    value
) {
    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return date.toLocaleString();
}


// ============================================================
// DASHBOARD REFRESH
// ============================================================

function bindDashboardRefresh() {
    const button =
        $("refreshDashboardJobs");

    if (!button) return;

    button.addEventListener(
        "click",
        async () => {
            await fetchAvailableTasks();
        }
    );
}


// ============================================================
// OPEN WORK HISTORY
// ============================================================

function bindWorkHistoryButton() {
    const button =
        $("workHistoryButton");

    if (!button) return;

    button.addEventListener(
        "click",
        async () => {
            await fetchWorkHistory();

            emit(
                "workHistoryOpened"
            );
        }
    );
}


// ============================================================
// TASK EVENTS
// ============================================================

function bindTaskEvents() {
    window.addEventListener(
        "annotation:taskSelected",
        (event) => {
            const task =
                event.detail?.task;

            if (task) {
                selectTask(task);
            }
        }
    );

    window.addEventListener(
        "annotation:submitTask",
        () => {
            submitCurrentTask();
        }
    );

    window.addEventListener(
        "annotation:skipTask",
        () => {
            openSkipModal();
        }
    );
}


// ============================================================
// MEDIA TASK EVENT
// ============================================================

window.addEventListener(
    "annotation:loadTaskMedia",
    async (event) => {
        const task =
            event.detail?.task;

        if (!task) return;

        const mediaURL =
            task.media_url;

        if (!mediaURL) {
            return;
        }

        /*
         * media.js owns the actual media loading.
         * Send a separate event to avoid a circular import.
         */

        window.dispatchEvent(
            new CustomEvent(
                "annotation:loadMediaURL",
                {
                    detail: {
                        url:
                            mediaURL,

                        mediaType:
                            task.media_type ||
                            null,

                        task
                    }
                }
            )
        );
    }
);


// ============================================================
// TASK NAVIGATION
// ============================================================

export async function loadNextTask() {
    if (
        !availableTasks.length
    ) {
        await fetchAvailableTasks();
    }

    if (
        !availableTasks.length
    ) {
        setTaskStatus(
            "No available tasks.",
            "info"
        );

        return null;
    }

    const task =
        availableTasks[0];

    await selectTask(
        task
    );

    return task;
}


// ============================================================
// TASK COUNTS
// ============================================================

export function getAvailableTaskCount() {
    return availableTasks.length;
}


export function getWorkHistory() {
    return [...taskHistory];
}


// ============================================================
// INITIALIZATION
// ============================================================

export async function initializeTasks() {
    if (
        taskListenersBound
    ) {
        return;
    }

    taskListenersBound = true;

    bindTaskButtons();

    bindDashboardRefresh();

    bindWorkHistoryButton();

    bindTaskEvents();

    updateTaskActionBar();

    /*
     * Don't force a database query before the
     * authentication module has finished restoring
     * the user's session.
     *
     * app.js can call fetchAvailableTasks()
     * after authentication is ready.
     */

    emit(
        "tasksReady"
    );
}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.fetchAvailableTasks =
    fetchAvailableTasks;

window.selectTask =
    selectTask;

window.getCurrentTask =
    getCurrentTask;

window.clearCurrentTask =
    clearCurrentTask;

window.submitCurrentTask =
    submitCurrentTask;

window.skipCurrentTask =
    skipCurrentTask;

window.approveCurrentTask =
    approveCurrentTask;

window.loadNextTask =
    loadNextTask;

window.fetchWorkHistory =
    fetchWorkHistory;

window.startCurrentTask =
    startCurrentTask;

window.validateCurrentTask =
    validateCurrentTask;

window.updateTaskActionBar =
    updateTaskActionBar;


// ============================================================
// START
// ============================================================

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeTasks,
        {
            once: true
        }
    );
} else {
    initializeTasks();
}


// ============================================================
// END PART 5
// ============================================================
