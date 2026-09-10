// ============================================================
// ANNOTATION AI
// PART 5 — js/tasks.js
// TASKS / TASK ACTIONS / SUBMIT / SKIP / WORK HISTORY
// ============================================================

import * as Annotation from "./annotation.js";

import {
    getSupabase,
    getCurrentUser,
    getCurrentSession
} from "./supabase.js";


// ============================================================
// ANNOTATION COMPATIBILITY
// ============================================================

const state =
    Annotation.state || {};

const saveFrame =
    typeof Annotation.saveFrame === "function"
        ? Annotation.saveFrame
        : () => {};


// ============================================================
// LOCAL DOM HELPER
// IMPORTANT:
// DO NOT IMPORT $ FROM annotation.js
// ============================================================

function $(id) {
    return document.getElementById(id);
}


// ============================================================
// LOCAL EVENT HELPER
// ============================================================

function emit(
    name,
    detail = {}
) {
    try {
        window.dispatchEvent(
            new CustomEvent(
                String(name),
                {
                    detail
                }
            )
        );
    } catch (error) {
        console.warn(
            "Task event error:",
            error
        );
    }
}


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


function escapeHTML(
    value
) {
    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


// ============================================================
// SAFE SUPABASE
// ============================================================

function getClient() {
    try {
        return getSupabase();
    } catch (error) {
        console.warn(
            "Supabase client unavailable:",
            error
        );

        return null;
    }
}


function canUseSupabase() {
    const client =
        getClient();

    return Boolean(
        client &&
        typeof client.from ===
            "function"
    );
}


// ============================================================
// TASK TABLE
// ============================================================

function getTaskTable() {
    return (
        window.APP_TASK_TABLE ||
        "tasks"
    );
}


function getResultTable() {
    return (
        window.APP_RESULT_TABLE ||
        "task_results"
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
    } catch (error) {
        console.warn(
            "getCurrentUser failed:",
            error
        );
    }

    try {
        const session =
            await getCurrentSession();

        return (
            session?.user ||
            null
        );
    } catch (error) {
        console.warn(
            "getCurrentSession failed:",
            error
        );

        return null;
    }
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
            task.taskId ??
            null,

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
            task.sourceUrl ??
            task.file_url ??
            task.fileUrl ??
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
            task.assignee_id ??
            task.assigneeId ??
            task.worker_id ??
            task.workerId ??
            null
    };
}


// ============================================================
// TASK ACTION BAR
// ============================================================

function getTaskActionBar() {
    return $(
        "taskActionBar"
    );
}


function getTaskActionTitle() {
    return $(
        "taskActionTitle"
    );
}


function getTaskActionMeta() {
    return $(
        "taskActionMeta"
    );
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

    if (!bar) {
        updateTaskButtons();
        return;
    }

    if (!currentTask) {
        show(
            bar,
            false
        );

        updateTaskButtons();

        return;
    }

    show(
        bar,
        true
    );

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
        currentTask.duration ??
        currentTask.duration_minutes ??
        "";

    const pay =
        currentTask.pay ??
        currentTask.payment ??
        currentTask.reward ??
        "";

    const pieces = [];

    if (shape) {
        pieces.push(
            String(shape)
        );
    }

    if (
        duration !== "" &&
        duration !== null &&
        duration !== undefined
    ) {
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

    if (!element) {
        return;
    }

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
// FETCH AVAILABLE TASKS
// ============================================================

export async function fetchAvailableTasks(
    options = {}
) {
    const limit =
        Number(
            options.limit ?? 50
        );

    const client =
        getClient();

    if (!client) {
        availableTasks = [];

        renderAvailableTasks(
            availableTasks
        );

        return [];
    }

    const user =
        await requireUser();

    if (!user) {
        availableTasks = [];

        renderAvailableTasks(
            availableTasks
        );

        return [];
    }

    taskLoading = true;

    updateTaskButtons();

    try {
        const table =
            getTaskTable();

        /*
         * First try status = available.
         */

        let result =
            await client
                .from(table)
                .select("*")
                .eq(
                    "status",
                    "available"
                )
                .limit(
                    limit
                );

        /*
         * If the database schema does not
         * support the status query, load
         * the table and filter locally.
         */

        if (result.error) {
            result =
                await client
                    .from(table)
                    .select("*")
                    .limit(
                        limit
                    );
        }

        if (result.error) {
            console.error(
                "Unable to load tasks:",
                result.error
            );

            availableTasks = [];

            renderAvailableTasks(
                availableTasks
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

        /*
         * Keep only tasks that are actually
         * available or assigned to this user.
         */

        availableTasks =
            availableTasks.filter(
                task => {
                    const status =
                        String(
                            task.status ||
                            "available"
                        )
                            .toLowerCase();

                    const assigned =
                        task.assigned_to;

                    const assignedToCurrentUser =
                        assigned &&
                        String(assigned) ===
                            String(user.id);

                    const availableStatus =
                        [
                            "",
                            "available",
                            "open",
                            "ready",
                            "queued",
                            "pending",
                            "created",
                            "in_progress"
                        ].includes(
                            status
                        );

                    return (
                        availableStatus &&
                        (
                            !assigned ||
                            assignedToCurrentUser
                        )
                    );
                }
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

    if (!container) {
        return;
    }

    if (!tasks.length) {
        container.innerHTML = `
            <div class="empty-state">
                No available tasks right now.
            </div>
        `;

        return;
    }

    container.innerHTML =
        tasks
            .map(
                task => {
                    const id =
                        task.id ??
                        "";

                    return `
                        <button
                            type="button"
                            class="task-card"
                            data-task-id="${escapeHTML(id)}"
                        >
                            <div class="task-card-title">
                                ${escapeHTML(
                                    task.title
                                )}
                            </div>

                            <div class="task-card-meta">
                                ${escapeHTML(
                                    task.shape || ""
                                )}

                                ${
                                    task.duration !==
                                        null &&
                                    task.duration !==
                                        undefined &&
                                    task.duration !==
                                        ""
                                        ? ` • ${escapeHTML(
                                              task.duration
                                          )} min`
                                        : ""
                                }

                                ${
                                    task.pay !==
                                        null &&
                                    task.pay !==
                                        undefined &&
                                    task.pay !==
                                        ""
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
                    `;
                }
            )
            .join("");

    container
        .querySelectorAll(
            "[data-task-id]"
        )
        .forEach(
            element => {
                element.addEventListener(
                    "click",
                    async () => {
                        const taskId =
                            element.dataset.taskId;

                        await selectTask(
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
        task =>
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
    let task = null;

    if (
        taskOrId &&
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
     * Ask media.js to load task media.
     * This avoids circular imports.
     */

    if (
        task.media_url
    ) {
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
// START CURRENT TASK
// ============================================================

export async function startCurrentTask() {
    if (!currentTask) {
        setTaskStatus(
            "No task is selected.",
            "warning"
        );

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

    if (!currentTask.id) {
        return true;
    }

    const client =
        getClient();

    if (!client) {
        setTaskStatus(
            "Database connection is unavailable.",
            "error"
        );

        return false;
    }

    try {
        const table =
            getTaskTable();

        const result =
            await client
                .from(table)
                .update({
                    status:
                        "in_progress",

                    assigned_to:
                        user.id
                })
                .eq(
                    "id",
                    currentTask.id
                );

        if (result.error) {
            console.warn(
                "Task assignment failed:",
                result.error
            );

            setTaskStatus(
                "Unable to start this task.",
                "error"
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

        emit(
            "taskStarted",
            {
                task:
                    currentTask
            }
        );

        return true;
    } catch (error) {
        console.error(
            "Start task error:",
            error
        );

        setTaskStatus(
            "Unable to start task.",
            "error"
        );

        return false;
    }
}


// ============================================================
// VALIDATE CURRENT TASK
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
        annotation => {
            const copy = {
                ...annotation
            };

            delete copy.selected;

            return copy;
        }
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
    const client =
        getClient();

    if (!client) {
        return {
            ok: false,
            error:
                new Error(
                    "Supabase is not configured."
                )
        };
    }

    const table =
        getResultTable();

    try {
        const result =
            await client
                .from(table)
                .insert(
                    payload
                )
                .select()
                .maybeSingle();

        return {
            ok:
                !result.error,

            data:
                result.data ||
                null,

            error:
                result.error ||
                null
        };
    } catch (error) {
        return {
            ok: false,
            data: null,
            error
        };
    }
}


// ============================================================
// UPDATE TASK STATUS
// ============================================================

async function updateTaskStatus(
    taskId,
    status
) {
    const client =
        getClient();

    if (
        !client ||
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

    try {
        const result =
            await client
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
                result.error ||
                null
        };
    } catch (error) {
        return {
            ok: false,
            error
        };
    }
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
         * Save the current video frame before
         * creating the submission.
         */

        if (
            state.mediaType ===
            "video"
        ) {
            try {
                saveFrame(
                    state.currentFrame
                );
            } catch (error) {
                console.warn(
                    "Unable to save video frame:",
                    error
                );
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

        /*
         * Update the task status only when
         * a task ID exists.
         */

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
                    "Result saved but task status could not be updated:",
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
                Array.isArray(
                    state.annotations
                )
                    ? state.annotations.length
                    : 0,

            status:
                "submitted"
        });

        /*
         * Remove completed task from the
         * local available list.
         */

        if (
            completedTask?.id
        ) {
            availableTasks =
                availableTasks.filter(
                    item =>
                        String(item.id) !==
                        String(
                            completedTask.id
                        )
                );
        }

        currentTask = null;

        renderAvailableTasks(
            availableTasks
        );

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
         * Refresh the queue in the background.
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

        const client =
            getClient();

        if (
            client &&
            task.id
        ) {
            const table =
                getTaskTable();

            const updatePayload = {
                status:
                    "skipped"
            };

            /*
             * Optional reason column can be
             * configured by the application.
             */

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

            try {
                const result =
                    await client
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
            } catch (error) {
                console.warn(
                    "Task skip error:",
                    error
                );
            }
        }

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


export function openSkipModal() {
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
            () => {
                try {
                    reason.focus();
                } catch (_) {}
            },
            0
        );
    }
}


export function closeSkipModal() {
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

    const approve =
        getApproveButton();

    const closeSkip =
        getCloseSkipButton();

    const confirm =
        getConfirmSkipButton();

    if (skip) {
        skip.addEventListener(
            "click",
            openSkipModal
        );
    }

    if (submit) {
        submit.addEventListener(
            "click",
            submitCurrentTask
        );
    }

    if (approve) {
        approve.addEventListener(
            "click",
            approveCurrentTask
        );
    }

    if (closeSkip) {
        closeSkip.addEventListener(
            "click",
            closeSkipModal
        );
    }

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
            event => {
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

    const client =
        getClient();

    if (!client) {
        setTaskStatus(
            "Database connection is unavailable.",
            "error"
        );

        return false;
    }

    if (!currentTask.id) {
        setTaskStatus(
            "This task has no valid ID.",
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
            await client
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
                "Approve task error:",
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
    const limit =
        Number(
            options.limit ?? 50
        );

    const client =
        getClient();

    if (!client) {
        renderWorkHistory(
            taskHistory
        );

        return taskHistory;
    }

    const user =
        await requireUser();

    if (!user) {
        renderWorkHistory(
            []
        );

        return [];
    }

    try {
        const table =
            getResultTable();

        /*
         * First try submitted_at ordering.
         */

        let result =
            await client
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
                .limit(
                    limit
                );

        /*
         * Fallback for schemas that don't
         * have submitted_at.
         */

        if (
            result.error
        ) {
            result =
                await client
                    .from(table)
                    .select("*")
                    .eq(
                        "user_id",
                        user.id
                    )
                    .limit(
                        limit
                    );
        }

        if (
            result.error
        ) {
            console.warn(
                "Unable to load work history:",
                result.error
            );

            renderWorkHistory(
                taskHistory
            );

            return taskHistory;
        }

        taskHistory =
            result.data || [];

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

    if (!container) {
        return;
    }

    if (
        !Array.isArray(history) ||
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
        history
            .map(
                item => {
                    const title =
                        item.task_title ||
                        item.title ||
                        item.task_name ||
                        (
                            item.task_id
                                ? `Task ${item.task_id}`
                                : "Task"
                        );

                    const status =
                        item.status ||
                        "submitted";

                    const count =
                        item.annotation_count ??
                        (
                            Array.isArray(
                                item.annotations
                            )
                                ? item.annotations.length
                                : 0
                        );

                    const date =
                        item.submitted_at ||
                        item.completed_at ||
                        item.created_at ||
                        null;

                    return `
                        <div class="history-item">

                            <div class="history-item-title">
                                ${escapeHTML(
                                    title
                                )}
                            </div>

                            <div class="history-item-meta">

                                <span>
                                    ${escapeHTML(
                                        status
                                    )}
                                </span>

                                <span>
                                    ${escapeHTML(
                                        count
                                    )}
                                    annotation${
                                        Number(
                                            count
                                        ) === 1
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
        return String(
            value ?? ""
        );
    }

    return date.toLocaleString();
}


// ============================================================
// DASHBOARD REFRESH
// ============================================================

function bindDashboardRefresh() {
    const button =
        $("refreshDashboardJobs");

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        async () => {
            await fetchAvailableTasks();
        }
    );
}


// ============================================================
// WORK HISTORY BUTTON
// ============================================================

function bindWorkHistoryButton() {
    const button =
        $("workHistoryButton");

    if (!button) {
        return;
    }

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
        event => {
            const task =
                event.detail?.task;

            if (task) {
                selectTask(
                    task
                );
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

    window.addEventListener(
        "annotation:startTask",
        () => {
            startCurrentTask();
        }
    );
}


// ============================================================
// TASK MEDIA EVENT
// ============================================================

window.addEventListener(
    "annotation:loadTaskMedia",
    event => {
        const task =
            event.detail?.task;

        if (!task) {
            return;
        }

        const mediaURL =
            task.media_url;

        if (!mediaURL) {
            return;
        }

        /*
         * media.js owns actual media loading.
         * This event avoids a circular import.
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
    return [
        ...taskHistory
    ];
}


// ============================================================
// SET CURRENT TASK
// ============================================================

export function setCurrentTask(
    task
) {
    currentTask =
        normalizeTask(
            task
        );

    updateTaskActionBar();

    if (currentTask) {
        emit(
            "taskSelected",
            {
                task:
                    currentTask
            }
        );
    }

    return currentTask;
}


// ============================================================
// REFRESH TASKS
// ============================================================

export async function refreshTasks() {
    return fetchAvailableTasks();
}


// ============================================================
// CAN USE UPLOAD
// ============================================================

export function canUseUpload() {
    /*
     * Upload is controlled by the HTML/UI and
     * application configuration. Keep this
     * function available because app.js may call it.
     */

    const panel =
        $("customerUploadPanel");

    if (panel) {
        show(
            panel,
            true
        );
    }

    return true;
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

    canUseUpload();

    emit(
        "tasksReady"
    );
}


// ============================================================
// ALIASES FOR COMPATIBILITY
// ============================================================

export const initTasks =
    initializeTasks;

export const loadTasks =
    fetchAvailableTasks;

export const getCurrentTaskState =
    getCurrentTask;

export const submitTask =
    submitCurrentTask;

export const skipTask =
    skipCurrentTask;

export const approveTask =
    approveCurrentTask;


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.fetchAvailableTasks =
    fetchAvailableTasks;

window.loadTasks =
    fetchAvailableTasks;

window.selectTask =
    selectTask;

window.getCurrentTask =
    getCurrentTask;

window.clearCurrentTask =
    clearCurrentTask;

window.setCurrentTask =
    setCurrentTask;

window.submitCurrentTask =
    submitCurrentTask;

window.submitTask =
    submitCurrentTask;

window.skipCurrentTask =
    skipCurrentTask;

window.skipTask =
    skipCurrentTask;

window.approveCurrentTask =
    approveCurrentTask;

window.approveTask =
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

window.initializeTasks =
    initializeTasks;

window.initTasks =
    initializeTasks;

window.canUseUpload =
    canUseUpload;


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
