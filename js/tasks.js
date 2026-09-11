// ============================================================
// ANNOTATION AI - TASKS / WORKFLOW MODULE
// ============================================================

import {
    APP_CONFIG,
    normalizeRole,
    roleForWorkType,
    workTypeLabel
} from "./config.js";

import {
    getSupabase,
    getCurrentUser,
    logActivity,
    logWorkflowEvent
} from "./supabase.js";

import {
    getRole,
    isAdmin,
    isStaff,
    isReviewer,
    isCoworker,
    isPendingApproval
} from "./auth.js";

import * as Annotation from "./annotation.js";

const taskState = {
    initialized: false,
    loading: false,

    currentTask: null,
    tasks: [],
    frameAnnotations: new Map(),

    saving: false,
    saveTimer: null,

    lastError: null
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function $(id) {
    return document.getElementById(id);
}

function emit(name, detail = {}) {
    window.dispatchEvent(
        new CustomEvent(name, { detail })
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

function normalizeTask(task) {
    if (!task) return null;

    const workType =
        task.work_type ||
        task.task_type ||
        task.type ||
        "";

    let workRole =
        task.work_role ||
        task.role ||
        roleForWorkType(workType) ||
        "";

    workRole = normalizeRole(workRole);

    return {
        ...task,

        id: task.id || task.task_id || null,

        title:
            task.title ||
            task.name ||
            "Annotation task",

        work_type: workType,

        work_role: workRole,

        media_path:
            task.media_path ||
            task.file_path ||
            task.storage_path ||
            null,

        media_type:
            task.media_type ||
            task.file_type ||
            null,

        source_name:
            task.source_name ||
            task.filename ||
            task.file_name ||
            "media",

        expected_minutes:
            task.expected_minutes ??
            task.duration_minutes ??
            task.duration ??
            null,

        pay_amount:
            task.pay_amount ??
            task.pay ??
            task.amount ??
            null,

        status:
            task.status ||
            "available",

        assigned_to:
            task.assigned_to ||
            null,

        claimed_by:
            task.claimed_by ||
            null
    };
}

// ------------------------------------------------------------
// CURRENT TASK
// ------------------------------------------------------------

function getCurrentTask() {
    return taskState.currentTask;
}

function getCurrentTaskId() {
    return taskState.currentTask?.id || null;
}

function setCurrentTask(task) {
    taskState.currentTask =
        normalizeTask(task);

    return taskState.currentTask;
}

// ------------------------------------------------------------
// ANNOTATION STATE ACCESS
// ------------------------------------------------------------

function getAnnotationState() {
    return Annotation.state || {};
}

function getAnnotations() {
    const state = getAnnotationState();

    if (Array.isArray(state.annotations)) {
        return state.annotations;
    }

    return [];
}

function setAnnotations(annotations) {
    const state = getAnnotationState();

    if (Array.isArray(state.annotations)) {
        state.annotations.length = 0;

        if (Array.isArray(annotations)) {
            state.annotations.push(
                ...annotations
            );
        }

        return;
    }

    state.annotations =
        Array.isArray(annotations)
            ? annotations
            : [];
}

// ------------------------------------------------------------
// FRAME ANNOTATIONS
// ------------------------------------------------------------

function normalizeFrameNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return 0;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? Math.max(0, Math.floor(number))
        : 0;
}

function getCurrentFrameNumber() {
    const state = getAnnotationState();

    return normalizeFrameNumber(
        state.currentFrame ??
        state.frameNumber ??
        window.currentFrame ??
        0
    );
}

function annotationKey(annotation, index = 0) {
    return (
        annotation.annotation_key ||
        annotation.id ||
        annotation.key ||
        `annotation-${index}`
    );
}

// ------------------------------------------------------------
// CONVERT LOCAL ANNOTATIONS TO DB ROWS
// ------------------------------------------------------------

function annotationRowsForTask(taskId) {
    if (!taskId) {
        return [];
    }

    const annotations =
        getAnnotations();

    return annotations.map(
        (annotation, index) => {
            const frameNumber =
                normalizeFrameNumber(
                    annotation.frame_number ??
                    annotation.frameNumber ??
                    annotation.frame ??
                    getCurrentFrameNumber()
                );

            const type =
                annotation.annotation_type ||
                annotation.type ||
                annotation.shape ||
                "box";

            const label =
                annotation.label ||
                annotation.class_name ||
                annotation.className ||
                "";

            const score =
                Number.isFinite(
                    Number(annotation.score)
                )
                    ? Number(annotation.score)
                    : null;

            const geometry =
                annotation.geometry ||
                annotation.coordinates ||
                annotation.points ||
                annotation;

            return {
                task_id: taskId,

                annotation_key:
                    String(
                        annotationKey(
                            annotation,
                            index
                        )
                    ),

                frame_number:
                    frameNumber,

                annotation_type:
                    type,

                label,

                score,

                occlusion:
                    annotation.occlusion ??
                    false,

                truncation:
                    annotation.truncation ??
                    false,

                geometry,

                ai_generated:
                    annotation.ai_generated === true ||
                    annotation.aiGenerated === true,

                corrected:
                    annotation.corrected === true,

                export_flag:
                    annotation.export_flag !== false,

                updated_by:
                    getCurrentUser()?.id ||
                    null,

                updated_at:
                    new Date().toISOString()
            };
        }
    );
}

// ------------------------------------------------------------
// SAVE TASK ANNOTATIONS
// ------------------------------------------------------------

async function saveTaskAnnotations(
    taskId = getCurrentTaskId()
) {
    const client = getSupabase();

    if (!client || !taskId) {
        return false;
    }

    const user =
        getCurrentUser();

    if (!user?.id) {
        return false;
    }

    taskState.saving = true;

    try {
        const rows =
            annotationRowsForTask(taskId);

        // Save a complete current snapshot.
        // This guarantees that a reviewer or the next worker
        // can continue from the latest state.
        const {
            error: deleteError
        } = await client
            .from(APP_CONFIG.tables.annotations)
            .delete()
            .eq("task_id", taskId);

        if (deleteError) {
            throw deleteError;
        }

        if (rows.length) {
            const {
                error: insertError
            } = await client
                .from(APP_CONFIG.tables.annotations)
                .insert(rows);

            if (insertError) {
                throw insertError;
            }
        }

        try {
            await logWorkflowEvent(
                taskId,
                "annotations_saved",
                {
                    annotation_count:
                        rows.length
                }
            );
        } catch (error) {
            console.debug(
                "Workflow event could not be saved."
            );
        }

        emit(
            "annotationsSaved",
            {
                taskId,
                count: rows.length
            }
        );

        return true;
    } catch (error) {
        console.error(
            "Could not save annotations:",
            error
        );

        taskState.lastError =
            error;

        return false;
    } finally {
        taskState.saving = false;
    }
}

// ------------------------------------------------------------
// SCHEDULE ANNOTATION SAVE
// ------------------------------------------------------------

function scheduleAnnotationSave() {
    const taskId =
        getCurrentTaskId();

    if (!taskId) {
        return;
    }

    clearTimeout(
        taskState.saveTimer
    );

    taskState.saveTimer =
        setTimeout(
            () => {
                saveTaskAnnotations(
                    taskId
                );
            },
            900
        );
}

// ------------------------------------------------------------
// LOAD CLOUD ANNOTATIONS
// ------------------------------------------------------------

async function loadTaskAnnotations(
    taskId = getCurrentTaskId()
) {
    const client = getSupabase();

    if (!client || !taskId) {
        return [];
    }

    try {
        const {
            data,
            error
        } = await client
            .from(APP_CONFIG.tables.annotations)
            .select("*")
            .eq("task_id", taskId)
            .order(
                "frame_number",
                {
                    ascending: true
                }
            )
            .order(
                "updated_at",
                {
                    ascending: true
                }
            );

        if (error) {
            throw error;
        }

        const rows =
            Array.isArray(data)
                ? data
                : [];

        taskState.frameAnnotations =
            new Map();

        const annotations =
            rows.map(row => {
                const frame =
                    normalizeFrameNumber(
                        row.frame_number
                    );

                if (
                    !taskState.frameAnnotations.has(
                        frame
                    )
                ) {
                    taskState.frameAnnotations.set(
                        frame,
                        []
                    );
                }

                const annotation = {
                    id:
                        row.annotation_key ||
                        row.id,

                    annotation_key:
                        row.annotation_key,

                    annotation_type:
                        row.annotation_type,

                    type:
                        row.annotation_type,

                    label:
                        row.label,

                    score:
                        row.score,

                    occlusion:
                        row.occlusion,

                    truncation:
                        row.truncation,

                    geometry:
                        row.geometry,

                    ai_generated:
                        row.ai_generated,

                    corrected:
                        row.corrected,

                    export_flag:
                        row.export_flag,

                    frame_number:
                        frame,

                    frameNumber:
                        frame
                };

                taskState.frameAnnotations
                    .get(frame)
                    .push(annotation);

                return annotation;
            });

        setAnnotations(
            annotations
        );

        emit(
            "annotationsLoaded",
            {
                taskId,
                annotations,
                count: annotations.length
            }
        );

        return annotations;
    } catch (error) {
        console.error(
            "Could not load task annotations:",
            error
        );

        taskState.lastError =
            error;

        return [];
    }
}

// ------------------------------------------------------------
// LOAD TASK MEDIA
// ------------------------------------------------------------

async function loadTaskMedia(task) {
    const client =
        getSupabase();

    if (
        !client ||
        !task?.media_path
    ) {
        return null;
    }

    try {
        const bucket =
            APP_CONFIG.buckets.taskMedia;

        const {
            data,
            error
        } = await client.storage
            .from(bucket)
            .createSignedUrl(
                task.media_path,
                60 * 60
            );

        if (error) {
            throw error;
        }

        const url =
            data?.signedUrl ||
            null;

        if (!url) {
            return null;
        }

        const mediaType =
            String(
                task.media_type ||
                ""
            ).toLowerCase();

        const isVideo =
            mediaType.includes("video") ||
            /\.(mp4|webm|mov|avi|mkv)$/i.test(
                task.source_name ||
                task.media_path
            );

        const image =
            $("annotationImage") ||
            $("imageCanvas") ||
            $("sourceImage") ||
            $("mainImage");

        const video =
            $("annotationVideo") ||
            $("videoPlayer") ||
            $("sourceVideo") ||
            $("mainVideo");

        if (isVideo) {
            if (video) {
                video.src = url;
                video.dataset.taskId =
                    task.id;

                video.classList.remove(
                    "hidden"
                );

                video.load();

                video.onloadedmetadata =
                    () => {
                        emit(
                            "taskMediaLoaded",
                            {
                                task,
                                url,
                                type: "video"
                            }
                        );
                    };
            }

            image?.classList.add(
                "hidden"
            );

            // Allow annotation.js/media.js to use
            // the currently loaded video.
            window.currentTaskVideoUrl =
                url;

            return {
                url,
                type: "video"
            };
        }

        if (image) {
            image.src = url;
            image.dataset.taskId =
                task.id;

            image.classList.remove(
                "hidden"
            );

            image.onload = () => {
                emit(
                    "taskMediaLoaded",
                    {
                        task,
                        url,
                        type: "image"
                    }
                );
            };
        }

        video?.classList.add(
            "hidden"
        );

        return {
            url,
            type: "image"
        };
    } catch (error) {
        console.error(
            "Could not load task media:",
            error
        );

        taskState.lastError =
            error;

        emit(
            "taskMediaError",
            {
                task,
                error
            }
        );

        return null;
    }
}

// ------------------------------------------------------------
// CLAIM TASK
// ------------------------------------------------------------

async function claimTask(taskId) {
    const client =
        getSupabase();

    const user =
        getCurrentUser();

    if (!client) {
        throw new Error(
            "Supabase is not configured."
        );
    }

    if (!user?.id) {
        throw new Error(
            "Please sign in first."
        );
    }

    if (isPendingApproval()) {
        throw new Error(
            "Your account is waiting for admin approval."
        );
    }

    if (!taskId) {
        throw new Error(
            "No task was selected."
        );
    }

    // Staff/admin/reviewer can inspect tasks,
    // but coworkers must claim their own work.
    try {
        const {
            data,
            error
        } = await client.rpc(
            "claim_task",
            {
                p_task_id: taskId,
                p_user_id: user.id
            }
        );

        if (!error) {
            const claimed =
                Array.isArray(data)
                    ? data[0]
                    : data;

            if (claimed) {
                return normalizeTask(
                    claimed
                );
            }

            return true;
        }

        // If the RPC is unavailable, use a guarded
        // update so two users cannot simply overwrite
        // one another.
        console.warn(
            "claim_task RPC failed. Using guarded update:",
            error
        );
    } catch (error) {
        console.warn(
            "claim_task RPC unavailable:",
            error
        );
    }

    const {
        data: existing,
        error: existingError
    } = await client
        .from(APP_CONFIG.tables.tasks)
        .select("*")
        .eq("id", taskId)
        .maybeSingle();

    if (existingError) {
        throw existingError;
    }

    if (!existing) {
        throw new Error(
            "Task no longer exists."
        );
    }

    const normalized =
        normalizeTask(existing);

    if (
        normalized.claimed_by &&
        normalized.claimed_by !== user.id
    ) {
        throw new Error(
            "This task has already been claimed by another user."
        );
    }

    if (
        normalized.assigned_to &&
        normalized.assigned_to !== user.id &&
        isCoworker()
    ) {
        throw new Error(
            "This task is assigned to another user."
        );
    }

    const {
        data: updated,
        error: updateError
    } = await client
        .from(APP_CONFIG.tables.tasks)
        .update({
            claimed_by: user.id,
            claimed_at:
                new Date().toISOString(),
            status: "in_progress"
        })
        .eq("id", taskId)
        .is("claimed_by", null)
        .select("*")
        .maybeSingle();

    if (updateError) {
        throw updateError;
    }

    if (!updated) {
        throw new Error(
            "This task was just claimed by another user."
        );
    }

    return normalizeTask(
        updated
    );
}

// ------------------------------------------------------------
// SELECT TASK
// ------------------------------------------------------------

async function selectTask(taskId) {
    const client =
        getSupabase();

    if (!client) {
        throw new Error(
            "Supabase is not configured."
        );
    }

    if (!taskId) {
        throw new Error(
            "No task ID was supplied."
        );
    }

    taskState.loading = true;
    taskState.lastError = null;

    try {
        const {
            data: task,
            error
        } = await client
            .from(APP_CONFIG.tables.tasks)
            .select("*")
            .eq("id", taskId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!task) {
            throw new Error(
                "Task could not be found."
            );
        }

        const normalized =
            normalizeTask(task);

        // Coworkers can only open work for their role.
        if (isCoworker()) {
            const userRole =
                normalizeRole(
                    getRole()
                );

            const taskRole =
                normalizeRole(
                    normalized.work_role
                );

            if (
                taskRole &&
                taskRole !== userRole
            ) {
                throw new Error(
                    "This task is not assigned to your annotation role."
                );
            }
        }

        // A claimed task can be resumed by the same user.
        // A different user cannot take it.
        const user =
            getCurrentUser();

        if (
            normalized.claimed_by &&
            normalized.claimed_by !== user?.id
        ) {
            throw new Error(
                "This task has already been claimed by another user."
            );
        }

        let claimedTask =
            normalized;

        if (
            !normalized.claimed_by
        ) {
            claimedTask =
                await claimTask(
                    taskId
                );
        }

        if (
            claimedTask === true
        ) {
            claimedTask =
                normalizeTask({
                    ...normalized,
                    claimed_by:
                        user?.id,
                    status:
                        "in_progress"
                });
        }

        setCurrentTask(
            claimedTask
        );

        taskState.frameAnnotations =
            new Map();

        setAnnotations([]);

        emit(
            "taskSelected",
            {
                task:
                    taskState.currentTask,
                taskId
            }
        );

        await loadTaskMedia(
            taskState.currentTask
        );

        await loadTaskAnnotations(
            taskId
        );

        try {
            await logWorkflowEvent(
                taskId,
                "task_claimed",
                {
                    role:
                        getRole()
                }
            );
        } catch (error) {
            console.debug(
                "Task workflow event skipped."
            );
        }

        try {
            await logActivity(
                "task_claimed",
                "Task claimed",
                {
                    task_id: taskId,
                    work_type:
                        claimedTask.work_type,
                    work_role:
                        claimedTask.work_role
                }
            );
        } catch (error) {
            console.debug(
                "Task activity skipped."
            );
        }

        return taskState.currentTask;
    } catch (error) {
        taskState.lastError =
            error;

        emit(
            "taskError",
            {
                error
            }
        );

        throw error;
    } finally {
        taskState.loading = false;
    }
}

// ------------------------------------------------------------
// RELEASE / CLEAR CURRENT TASK
// ------------------------------------------------------------

function clearCurrentTask() {
    clearTimeout(
        taskState.saveTimer
    );

    taskState.currentTask =
        null;

    taskState.frameAnnotations =
        new Map();

    setAnnotations([]);

    emit(
        "taskCleared"
    );
}

// ------------------------------------------------------------
// SUBMIT TASK
// ------------------------------------------------------------

async function submitCurrentTask() {
    const client =
        getSupabase();

    const user =
        getCurrentUser();

    const taskId =
        getCurrentTaskId();

    if (!client) {
        throw new Error(
            "Supabase is not configured."
        );
    }

    if (!user?.id) {
        throw new Error(
            "Please sign in first."
        );
    }

    if (!taskId) {
        throw new Error(
            "There is no active task."
        );
    }

    taskState.loading = true;

    try {
        await saveTaskAnnotations(
            taskId
        );

        let submitted = false;

        try {
            const {
                data,
                error
            } = await client.rpc(
                "submit_task",
                {
                    p_task_id: taskId,
                    p_user_id: user.id
                }
            );

            if (!error) {
                submitted = true;

                const result =
                    Array.isArray(data)
                        ? data[0]
                        : data;

                if (result) {
                    setCurrentTask(
                        result
                    );
                }
            }
        } catch (error) {
            console.warn(
                "submit_task RPC unavailable:",
                error
            );
        }

        // Fallback for installations where the RPC
        // has not yet been created.
        if (!submitted) {
            const {
                data,
                error
            } = await client
                .from(APP_CONFIG.tables.tasks)
                .update({
                    status: "submitted"
                })
                .eq("id", taskId)
                .eq(
                    "claimed_by",
                    user.id
                )
                .select("*")
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data) {
                throw new Error(
                    "The task could not be submitted. It may have been claimed or changed by another user."
                );
            }

            setCurrentTask(
                data
            );
        }

        try {
            await logWorkflowEvent(
                taskId,
                "task_submitted",
                {
                    annotation_count:
                        getAnnotations().length
                }
            );
        } catch (error) {
            console.debug(
                "Submit workflow event skipped."
            );
        }

        try {
            await logActivity(
                "task_submitted",
                "Task submitted",
                {
                    task_id: taskId,
                    annotation_count:
                        getAnnotations().length
                }
            );
        } catch (error) {
            console.debug(
                "Submit activity skipped."
            );
        }

        emit(
            "taskSubmitted",
            {
                task:
                    taskState.currentTask,
                taskId
            }
        );

        return taskState.currentTask;
    } finally {
        taskState.loading = false;
    }
}

// ------------------------------------------------------------
// SKIP TASK
// ------------------------------------------------------------

async function skipCurrentTask(
    reason = ""
) {
    const client =
        getSupabase();

    const user =
        getCurrentUser();

    const taskId =
        getCurrentTaskId();

    if (!client) {
        throw new Error(
            "Supabase is not configured."
        );
    }

    if (!user?.id) {
        throw new Error(
            "Please sign in first."
        );
    }

    if (!taskId) {
        throw new Error(
            "There is no active task."
        );
    }

    const cleanReason =
        String(reason || "").trim();

    if (!cleanReason) {
        throw new Error(
            "Please provide a reason for skipping this task."
        );
    }

    taskState.loading = true;

    try {
        // Record why the task was skipped.
        const {
            error: skipError
        } = await client
            .from(APP_CONFIG.tables.taskSkips)
            .insert({
                task_id: taskId,
                user_id: user.id,
                reason: cleanReason
            });

        if (skipError) {
            console.warn(
                "Could not record skip reason:",
                skipError
            );
        }

        // Make the task available again unless an
        // administrator has already changed it.
        const {
            data,
            error
        } = await client
            .from(APP_CONFIG.tables.tasks)
            .update({
                status: "skipped",
                claimed_by: null,
                claimed_at: null
            })
            .eq("id", taskId)
            .eq(
                "claimed_by",
                user.id
            )
            .select("*")
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error(
                "The task could not be skipped because it has changed."
            );
        }

        try {
            await logWorkflowEvent(
                taskId,
                "task_skipped",
                {
                    reason: cleanReason
                }
            );
        } catch (error) {
            console.debug(
                "Skip workflow event skipped."
            );
        }

        try {
            await logActivity(
                "task_skipped",
                "Task skipped",
                {
                    task_id: taskId,
                    reason: cleanReason
                }
            );
        } catch (error) {
            console.debug(
                "Skip activity skipped."
            );
        }

        emit(
            "taskSkipped",
            {
                task: data,
                taskId,
                reason: cleanReason
            }
        );

        clearCurrentTask();

        return data;
    } finally {
        taskState.loading = false;
    }
}

// ------------------------------------------------------------
// APPROVE TASK
// ------------------------------------------------------------

async function approveCurrentTask() {
    const client =
        getSupabase();

    const user =
        getCurrentUser();

    const taskId =
        getCurrentTaskId();

    if (!client) {
        throw new Error(
            "Supabase is not configured."
        );
    }

    if (!user?.id) {
        throw new Error(
            "Please sign in first."
        );
    }

    if (
        !isAdmin() &&
        !isStaff() &&
        !isReviewer()
    ) {
        throw new Error(
            "You do not have permission to approve this task."
        );
    }

    if (!taskId) {
        throw new Error(
            "There is no active task."
        );
    }

    taskState.loading = true;

    try {
        await saveTaskAnnotations(
            taskId
        );

        let approved = false;

        try {
            const {
                data,
                error
            } = await client.rpc(
                "approve_task",
                {
                    p_task_id: taskId,
                    p_user_id: user.id
                }
            );

            if (!error) {
                approved = true;

                const result =
                    Array.isArray(data)
                        ? data[0]
                        : data;

                if (result) {
                    setCurrentTask(
                        result
                    );
                }
            }
        } catch (error) {
            console.warn(
                "approve_task RPC unavailable:",
                error
            );
        }

        if (!approved) {
            const {
                data,
                error
            } = await client
                .from(APP_CONFIG.tables.tasks)
                .update({
                    status: "approved"
                })
                .eq("id", taskId)
                .select("*")
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data) {
                throw new Error(
                    "Task could not be approved."
                );
            }

            setCurrentTask(
                data
            );
        }

        try {
            await logWorkflowEvent(
                taskId,
                "task_approved",
                {
                    approved_by: user.id
                }
            );
        } catch (error) {
            console.debug(
                "Approval workflow event skipped."
            );
        }

        try {
            await logActivity(
                "task_approved",
                "Task approved",
                {
                    task_id: taskId
                }
            );
        } catch (error) {
            console.debug(
                "Approval activity skipped."
            );
        }

        emit(
            "taskApproved",
            {
                task:
                    taskState.currentTask,
                taskId
            }
        );

        return taskState.currentTask;
    } finally {
        taskState.loading = false;
    }
}

// ------------------------------------------------------------
// CHANGE FRAME
// ------------------------------------------------------------

function setCurrentFrame(
    frameNumber
) {
    const frame =
        normalizeFrameNumber(
            frameNumber
        );

    const state =
        getAnnotationState();

    if ("currentFrame" in state) {
        state.currentFrame =
            frame;
    }

    if ("frameNumber" in state) {
        state.frameNumber =
            frame;
    }

    window.currentFrame =
        frame;

    const annotations =
        taskState.frameAnnotations
            .get(frame) || [];

    setAnnotations(
        annotations
    );

    emit(
        "frameChanged",
        {
            taskId:
                getCurrentTaskId(),
            frameNumber: frame,
            annotations
        }
    );

    return annotations;
}

// ------------------------------------------------------------
// GET FRAME ANNOTATIONS
// ------------------------------------------------------------

function getFrameAnnotations(
    frameNumber = getCurrentFrameNumber()
) {
    return (
        taskState.frameAnnotations
            .get(
                normalizeFrameNumber(
                    frameNumber
                )
            ) || []
    );
}

// ------------------------------------------------------------
// UPDATE FRAME SNAPSHOT
// ------------------------------------------------------------

function saveCurrentFrameToMemory() {
    const frame =
        getCurrentFrameNumber();

    taskState.frameAnnotations.set(
        frame,
        [...getAnnotations()]
    );

    scheduleAnnotationSave();
}

// ------------------------------------------------------------
// ANNOTATION EVENT BINDING
// ------------------------------------------------------------

function bindAnnotationEvents() {
    if (
        taskState.annotationEventsBound
    ) {
        return;
    }

    taskState.annotationEventsBound =
        true;

    const events = [
        "annotationCreated",
        "annotationUpdated",
        "annotationDeleted",
        "annotationChanged",
        "annotationsChanged",
        "annotationsUpdated",
        "annotationSelected",
        "aiAnnotationCreated"
    ];

    events.forEach(eventName => {
        window.addEventListener(
            eventName,
            () => {
                if (
                    getCurrentTaskId()
                ) {
                    saveCurrentFrameToMemory();
                }
            }
        );
    });
}

// ------------------------------------------------------------
// SUBMIT / SKIP BUTTONS
// ------------------------------------------------------------

function bindWorkflowButtons() {
    const submitButtons = [
        $("submitTaskButton"),
        $("submitTaskBtn")
    ].filter(Boolean);

    submitButtons.forEach(button => {
        if (
            button.dataset.taskBound ===
            "true"
        ) {
            return;
        }

        button.dataset.taskBound =
            "true";

        button.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                try {
                    await submitCurrentTask();
                } catch (error) {
                    console.error(error);

                    if (
                        typeof window.showToast ===
                        "function"
                    ) {
                        window.showToast(
                            error.message ||
                            "Could not submit task.",
                            "error"
                        );
                    }
                }
            }
        );
    });

    const skipButtons = [
        $("skipTaskButton"),
        $("skipTaskBtn")
    ].filter(Boolean);

    skipButtons.forEach(button => {
        if (
            button.dataset.taskBound ===
            "true"
        ) {
            return;
        }

        button.dataset.taskBound =
            "true";

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();

                const modal =
                    $("skipModal");

                if (modal) {
                    modal.classList.remove(
                        "hidden"
                    );
                }
            }
        );
    });

    const cancelButtons = [
        $("closeSkipModal"),
        $("cancelSkipTask")
    ].filter(Boolean);

    cancelButtons.forEach(button => {
        if (
            button.dataset.taskBound ===
            "true"
        ) {
            return;
        }

        button.dataset.taskBound =
            "true";

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();

                const modal =
                    $("skipModal");

                modal?.classList.add(
                    "hidden"
                );
            }
        );
    });

    const confirmSkip =
        $("confirmSkipTask") ||
        $("confirmSkip");

    if (
        confirmSkip &&
        confirmSkip.dataset.taskBound !==
            "true"
    ) {
        confirmSkip.dataset.taskBound =
            "true";

        confirmSkip.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                const reason =
                    $(
                        "skipReason"
                    )?.value ||
                    $(
                        "skipTaskReason"
                    )?.value ||
                    "";

                try {
                    await skipCurrentTask(
                        reason
                    );

                    $("skipModal")
                        ?.classList.add(
                            "hidden"
                        );
                } catch (error) {
                    if (
                        typeof window.showToast ===
                        "function"
                    ) {
                        window.showToast(
                            error.message ||
                            "Could not skip task.",
                            "error"
                        );
                    }
                }
            }
        );
    }

    const approveButtons = [
        $("approveTaskButton"),
        $("approveTaskBtn")
    ].filter(Boolean);

    approveButtons.forEach(button => {
        if (
            button.dataset.taskBound ===
            "true"
        ) {
            return;
        }

        button.dataset.taskBound =
            "true";

        button.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                try {
                    await approveCurrentTask();
                } catch (error) {
                    if (
                        typeof window.showToast ===
                        "function"
                    ) {
                        window.showToast(
                            error.message ||
                            "Could not approve task.",
                            "error"
                        );
                    }
                }
            }
        );
    });
}

// ------------------------------------------------------------
// INITIALIZE
// ------------------------------------------------------------

async function initializeTasks() {
    if (taskState.initialized) {
        return taskState;
    }

    taskState.initialized =
        true;

    bindAnnotationEvents();
    bindWorkflowButtons();

    return taskState;
}

// ------------------------------------------------------------
// GLOBAL API
// ------------------------------------------------------------

window.taskState =
    taskState;

window.getCurrentTask =
    getCurrentTask;

window.getCurrentTaskId =
    getCurrentTaskId;

window.selectTask =
    selectTask;

window.claimTask =
    claimTask;

window.claimCurrentTask =
    claimTask;

window.submitCurrentTask =
    submitCurrentTask;

window.skipCurrentTask =
    skipCurrentTask;

window.approveCurrentTask =
    approveCurrentTask;

window.saveTaskAnnotations =
    saveTaskAnnotations;

window.loadTaskAnnotations =
    loadTaskAnnotations;

window.loadCloudAnnotations =
    loadTaskAnnotations;

window.saveCloudAnnotations =
    saveTaskAnnotations;

window.clearCurrentTask =
    clearCurrentTask;

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

export {
    taskState,

    initializeTasks,

    normalizeTask,

    getCurrentTask,
    getCurrentTaskId,
    setCurrentTask,

    selectTask,
    claimTask,
    claimTask as claimCurrentTask,

    submitCurrentTask,
    skipCurrentTask,
    approveCurrentTask,

    saveTaskAnnotations,
    loadTaskAnnotations,

    saveTaskAnnotations as saveCloudAnnotations,
    loadTaskAnnotations as loadCloudAnnotations,

    loadTaskMedia,

    setCurrentFrame,
    getCurrentFrameNumber,
    getFrameAnnotations,

    clearCurrentTask
};

// ------------------------------------------------------------
// AUTO INITIALIZATION
// ------------------------------------------------------------

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeTasks();
        },
        { once: true }
    );
} else {
    initializeTasks();
}
