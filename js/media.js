/* ============================================================
   MEDIA.JS
   Customer uploads, task media, images, video and frame control
   ============================================================ */

import {
    APP_CONFIG,
    normalizeRole,
    roleForWorkType,
    isAdminRole,
    isStaffRole,
    isReviewerRole,
    isCoworkerRole
} from "./config.js";

import {
    getSupabase
} from "./supabase.js";

import {
    getUser,
    getProfile,
    getRole,
    isLoggedIn,
    isAdmin,
    isStaff,
    isReviewer,
    isCoworker,
    isPendingApproval
} from "./auth.js";

/* ============================================================
   STATE
   ============================================================ */

export const mediaState = {
    initialized: false,

    mediaType: null,
    mediaUrl: null,
    mediaPath: null,

    currentTaskId: null,
    currentTask: null,

    video: null,
    image: null,

    currentFrame: 0,
    totalFrames: 1,

    fps: 30,

    duration: 0,
    currentTime: 0,

    objectUrl: null,

    loading: false,
    uploading: false,

    uploadProgress: 0,

    maxImageSize:
        APP_CONFIG.uploadLimits?.imageMaxBytes ||
        25 * 1024 * 1024,

    maxVideoSize:
        APP_CONFIG.uploadLimits?.videoMaxBytes ||
        500 * 1024 * 1024
};

/* ============================================================
   DOM
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}

function all(selector, root = document) {
    return Array.from(
        root.querySelectorAll(selector)
    );
}

function showElement(element, display = "") {
    if (!element) return;

    element.hidden = false;
    element.style.display = display;
    element.removeAttribute("aria-hidden");
}

function hideElement(element) {
    if (!element) return;

    element.hidden = true;
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ============================================================
   TOAST
   ============================================================ */

function showToast(message, type = "info") {
    if (
        typeof window.showToast ===
        "function"
    ) {
        window.showToast(
            message,
            type
        );
        return;
    }

    const container =
        $("toastContainer");

    if (!container) {
        console.log(message);
        return;
    }

    const toast =
        document.createElement("div");

    toast.className =
        `toast toast-${type}`;

    toast.textContent =
        String(message || "");

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

/* ============================================================
   SUPABASE
   ============================================================ */

function getClient() {
    const client =
        getSupabase();

    if (!client) {
        throw new Error(
            "Supabase is not initialized."
        );
    }

    return client;
}

/* ============================================================
   TASK NORMALIZATION
   ============================================================ */

function normalizeTask(task) {
    if (!task) {
        return null;
    }

    return {
        ...task,

        id:
            task.id ||
            task.task_id ||
            null,

        title:
            task.title ||
            task.name ||
            "Task",

        media_path:
            task.media_path ||
            task.file_path ||
            task.storage_path ||
            task.media_url ||
            null,

        media_type:
            normalizeMediaType(
                task.media_type ||
                task.mediaType ||
                task.file_type ||
                ""
            ),

        work_type:
            task.work_type ||
            task.task_type ||
            task.shape ||
            task.annotation_type ||
            "box",

        work_role:
            task.work_role ||
            task.required_role ||
            roleForWorkType(
                task.work_type ||
                task.task_type ||
                task.shape ||
                "box"
            )
    };
}

function normalizeMediaType(value) {
    const type =
        String(value || "")
            .toLowerCase()
            .trim();

    if (
        type.includes("video") ||
        type.includes("mp4") ||
        type.includes("webm") ||
        type.includes("mov") ||
        type.includes("avi") ||
        type.includes("mkv")
    ) {
        return "video";
    }

    return "image";
}

function getFileMediaType(file) {
    if (!file) {
        return null;
    }

    if (
        String(file.type || "")
            .toLowerCase()
            .startsWith("video/")
    ) {
        return "video";
    }

    if (
        String(file.type || "")
            .toLowerCase()
            .startsWith("image/")
    ) {
        return "image";
    }

    const name =
        String(file.name || "")
            .toLowerCase();

    if (
        /\.(mp4|webm|mov|avi|mkv|m4v)$/i
            .test(name)
    ) {
        return "video";
    }

    if (
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i
            .test(name)
    ) {
        return "image";
    }

    return null;
}

/* ============================================================
   PERMISSION
   ============================================================ */

export function canUploadCustomerMedia() {
    if (!isLoggedIn()) {
        return false;
    }

    if (isPendingApproval()) {
        return false;
    }

    /*
     * Customers can upload.
     * Staff and admins have full access.
     *
     * Coworkers cannot upload customer media.
     */
    if (
        isCoworker()
    ) {
        return false;
    }

    return (
        isAdmin() ||
        isStaff() ||
        getRole() === "customer"
    );
}

/* ============================================================
   FILE VALIDATION
   ============================================================ */

export function validateMediaFile(file) {
    if (!file) {
        return {
            valid: false,
            error: "Please select a file."
        };
    }

    const type =
        getFileMediaType(file);

    if (!type) {
        return {
            valid: false,
            error:
                "Unsupported file type. Please select an image or video."
        };
    }

    if (
        type === "image" &&
        file.size > mediaState.maxImageSize
    ) {
        return {
            valid: false,
            error:
                `Image is too large. Maximum size is ${formatBytes(
                    mediaState.maxImageSize
                )}.`
        };
    }

    if (
        type === "video" &&
        file.size > mediaState.maxVideoSize
    ) {
        return {
            valid: false,
            error:
                `Video is too large. Maximum size is ${formatBytes(
                    mediaState.maxVideoSize
                )}.`
        };
    }

    return {
        valid: true,
        type
    };
}

function formatBytes(bytes) {
    const value =
        Number(bytes) || 0;

    if (value < 1024) {
        return `${value} B`;
    }

    if (value < 1024 * 1024) {
        return `${(
            value / 1024
        ).toFixed(1)} KB`;
    }

    if (
        value <
        1024 * 1024 * 1024
    ) {
        return `${(
            value /
            (1024 * 1024)
        ).toFixed(1)} MB`;
    }

    return `${(
        value /
        (1024 * 1024 * 1024)
    ).toFixed(1)} GB`;
}

/* ============================================================
   STORAGE BUCKET
   ============================================================ */

function getTaskMediaBucket() {
    return (
        APP_CONFIG.buckets?.taskMedia ||
        APP_CONFIG.buckets?.media ||
        "task-media"
    );
}

/* ============================================================
   CREATE OBJECT URL
   ============================================================ */

function revokeObjectUrl() {
    if (
        mediaState.objectUrl
    ) {
        try {
            URL.revokeObjectURL(
                mediaState.objectUrl
            );
        } catch (error) {
            console.warn(
                "Could not revoke object URL:",
                error
            );
        }

        mediaState.objectUrl =
            null;
    }
}

/* ============================================================
   CLEAR MEDIA
   ============================================================ */

export function clearMedia() {
    revokeObjectUrl();

    mediaState.mediaType =
        null;

    mediaState.mediaUrl =
        null;

    mediaState.mediaPath =
        null;

    mediaState.currentTaskId =
        null;

    mediaState.currentTask =
        null;

    mediaState.video =
        null;

    mediaState.image =
        null;

    mediaState.currentFrame =
        0;

    mediaState.totalFrames =
        1;

    mediaState.fps =
        30;

    mediaState.duration =
        0;

    mediaState.currentTime =
        0;

    const image =
        $("annotationImage");

    const video =
        $("annotationVideo");

    const placeholder =
        $("mediaPlaceholder");

    if (image) {
        image.removeAttribute("src");
        hideElement(image);
    }

    if (video) {
        try {
            video.pause();
        } catch (error) {}

        video.removeAttribute("src");
        video.load();

        hideElement(video);
    }

    if (placeholder) {
        showElement(
            placeholder,
            "flex"
        );
    }

    updateMediaUI();
}

/* ============================================================
   LOAD IMAGE FROM URL
   ============================================================ */

export async function loadImage(
    url,
    options = {}
) {
    if (!url) {
        throw new Error(
            "No image URL was provided."
        );
    }

    mediaState.loading =
        true;

    try {
        const image =
            $("annotationImage");

        const video =
            $("annotationVideo");

        const placeholder =
            $("mediaPlaceholder");

        if (video) {
            try {
                video.pause();
            } catch (error) {}

            hideElement(video);
        }

        if (!image) {
            throw new Error(
                "Annotation image element was not found."
            );
        }

        hideElement(
            placeholder
        );

        await new Promise(
            (resolve, reject) => {
                const onLoad = () => {
                    cleanup();
                    resolve();
                };

                const onError = () => {
                    cleanup();

                    reject(
                        new Error(
                            "The image could not be loaded."
                        )
                    );
                };

                const cleanup = () => {
                    image.removeEventListener(
                        "load",
                        onLoad
                    );

                    image.removeEventListener(
                        "error",
                        onError
                    );
                };

                image.addEventListener(
                    "load",
                    onLoad,
                    {
                        once: true
                    }
                );

                image.addEventListener(
                    "error",
                    onError,
                    {
                        once: true
                    }
                );

                image.src = url;

                /*
                 * Cached images can already be complete before
                 * the listener fires.
                 */
                if (
                    image.complete &&
                    image.naturalWidth > 0
                ) {
                    cleanup();
                    resolve();
                }
            }
        );

        mediaState.mediaType =
            "image";

        mediaState.mediaUrl =
            url;

        mediaState.image =
            image;

        mediaState.video =
            null;

        mediaState.currentFrame =
            0;

        mediaState.totalFrames =
            1;

        mediaState.currentTime =
            0;

        mediaState.duration =
            0;

        showElement(
            image,
            "block"
        );

        updateMediaUI();

        dispatchMediaEvent(
            "mediaLoaded",
            {
                mediaType: "image",
                url
            }
        );

        return image;
    } finally {
        mediaState.loading =
            false;
    }
}

/* ============================================================
   LOAD VIDEO FROM URL
   ============================================================ */

export async function loadVideo(
    url,
    options = {}
) {
    if (!url) {
        throw new Error(
            "No video URL was provided."
        );
    }

    mediaState.loading =
        true;

    try {
        const video =
            $("annotationVideo");

        const image =
            $("annotationImage");

        const placeholder =
            $("mediaPlaceholder");

        if (!video) {
            throw new Error(
                "Annotation video element was not found."
            );
        }

        if (image) {
            hideElement(image);
        }

        hideElement(
            placeholder
        );

        /*
         * Reset old video state.
         */
        try {
            video.pause();
        } catch (error) {}

        video.removeAttribute(
            "src"
        );

        video.load();

        video.preload =
            "metadata";

        video.playsInline =
            true;

        video.muted =
            true;

        const loaded =
            new Promise(
                (resolve, reject) => {
                    let settled =
                        false;

                    const cleanup = () => {
                        video.removeEventListener(
                            "loadedmetadata",
                            onLoaded
                        );

                        video.removeEventListener(
                            "error",
                            onError
                        );
                    };

                    const onLoaded = () => {
                        if (settled) return;

                        settled = true;
                        cleanup();
                        resolve();
                    };

                    const onError = () => {
                        if (settled) return;

                        settled = true;
                        cleanup();

                        reject(
                            new Error(
                                "The video could not be loaded."
                            )
                        );
                    };

                    video.addEventListener(
                        "loadedmetadata",
                        onLoaded
                    );

                    video.addEventListener(
                        "error",
                        onError
                    );

                    video.src = url;

                    video.load();

                    if (
                        video.readyState >= 1
                    ) {
                        onLoaded();
                    }
                }
            );

        await loaded;

        mediaState.mediaType =
            "video";

        mediaState.mediaUrl =
            url;

        mediaState.video =
            video;

        mediaState.image =
            null;

        mediaState.duration =
            Number(
                video.duration
            ) || 0;

        mediaState.fps =
            Number(
                options.fps ||
                mediaState.currentTask?.fps ||
                30
            ) || 30;

        mediaState.currentFrame =
            0;

        mediaState.totalFrames =
            Math.max(
                1,
                Math.ceil(
                    mediaState.duration *
                    mediaState.fps
                )
            );

        mediaState.currentTime =
            0;

        showElement(
            video,
            "block"
        );

        updateMediaUI();

        dispatchMediaEvent(
            "mediaLoaded",
            {
                mediaType: "video",
                url,
                duration:
                    mediaState.duration,
                fps:
                    mediaState.fps
            }
        );

        return video;
    } finally {
        mediaState.loading =
            false;
    }
}

/* ============================================================
   LOAD MEDIA BY TASK
   ============================================================ */

export async function loadTaskMedia(
    task
) {
    const normalized =
        normalizeTask(task);

    if (
        !normalized?.id
    ) {
        throw new Error(
            "The task does not have a valid ID."
        );
    }

    if (
        !normalized.media_path
    ) {
        throw new Error(
            "This task does not have media attached."
        );
    }

    mediaState.currentTask =
        normalized;

    mediaState.currentTaskId =
        normalized.id;

    mediaState.mediaPath =
        normalized.media_path;

    const client =
        getClient();

    let url =
        normalized.media_path;

    /*
     * If the task contains a full URL, use it directly.
     * Otherwise create a signed Supabase Storage URL.
     */
    if (
        !/^https?:\/\//i.test(
            String(url)
        )
    ) {
        const bucket =
            getTaskMediaBucket();

        const {
            data,
            error
        } = await client.storage
            .from(bucket)
            .createSignedUrl(
                String(url),
                60 * 60
            );

        if (error) {
            throw error;
        }

        url =
            data?.signedUrl;

        if (!url) {
            throw new Error(
                "Could not create a signed media URL."
            );
        }
    }

    mediaState.mediaUrl =
        url;

    const type =
        normalized.media_type ||
        normalizeMediaType(
            normalized.media_path
        );

    if (
        type === "video"
    ) {
        return await loadVideo(
            url,
            {
                fps:
                    normalized.fps ||
                    normalized.frame_rate ||
                    30
            }
        );
    }

    return await loadImage(
        url
    );
}

/* ============================================================
   LOAD MEDIA FROM FILE
   ============================================================ */

export async function loadLocalMediaFile(
    file
) {
    const validation =
        validateMediaFile(file);

    if (!validation.valid) {
        throw new Error(
            validation.error
        );
    }

    revokeObjectUrl();

    const url =
        URL.createObjectURL(
            file
        );

    mediaState.objectUrl =
        url;

    mediaState.mediaPath =
        null;

    mediaState.currentTaskId =
        null;

    if (
        validation.type === "video"
    ) {
        return await loadVideo(
            url
        );
    }

    return await loadImage(
        url
    );
}

/* ============================================================
   UPLOAD PATH
   ============================================================ */

function sanitizeFileName(name) {
    return String(name || "file")
        .trim()
        .replace(
            /[^a-zA-Z0-9._-]+/g,
            "_"
        )
        .replace(
            /_+/g,
            "_"
        )
        .slice(
            0,
            160
        );
}

function buildStoragePath(
    userId,
    file
) {
    const safeName =
        sanitizeFileName(
            file.name
        );

    const timestamp =
        Date.now();

    const random =
        Math.random()
            .toString(36)
            .slice(2, 10);

    return [
        "customer-uploads",
        userId,
        `${timestamp}_${random}_${safeName}`
    ].join("/");
}

/* ============================================================
   UPLOAD MEDIA
   ============================================================ */

export async function uploadCustomerMedia(
    file,
    options = {}
) {
    if (
        !isLoggedIn()
    ) {
        throw new Error(
            "Please sign in before uploading."
        );
    }

    if (
        isPendingApproval()
    ) {
        throw new Error(
            "Your account is waiting for administrator approval."
        );
    }

    if (
        !canUploadCustomerMedia()
    ) {
        throw new Error(
            "You do not have permission to upload customer media."
        );
    }

    const validation =
        validateMediaFile(file);

    if (!validation.valid) {
        throw new Error(
            validation.error
        );
    }

    const user =
        getUser();

    if (!user?.id) {
        throw new Error(
            "No authenticated user was found."
        );
    }

    const client =
        getClient();

    mediaState.uploading =
        true;

    mediaState.uploadProgress =
        0;

    updateUploadProgress(
        0,
        "Preparing upload…"
    );

    try {
        const bucket =
            getTaskMediaBucket();

        const path =
            buildStoragePath(
                user.id,
                file
            );

        updateUploadProgress(
            10,
            "Uploading media…"
        );

        const {
            error
        } = await client.storage
            .from(bucket)
            .upload(
                path,
                file,
                {
                    cacheControl:
                        "3600",
                    upsert: false,
                    contentType:
                        file.type ||
                        undefined
                }
            );

        if (error) {
            throw error;
        }

        updateUploadProgress(
            70,
            "Creating task…"
        );

        const task =
            await createCustomerTask({
                title:
                    options.title ||
                    removeExtension(
                        file.name
                    ),

                mediaPath:
                    path,

                mediaType:
                    validation.type,

                workType:
                    options.workType ||
                    options.taskType ||
                    "box",

                duration:
                    options.duration ||
                    null,

                pay:
                    options.pay ??
                    null,

                metadata:
                    options.metadata ||
                    {}
            });

        updateUploadProgress(
            100,
            "Upload complete."
        );

        dispatchMediaEvent(
            "customerMediaUploaded",
            {
                file,
                path,
                task
            }
        );

        showToast(
            "Media uploaded and task created successfully.",
            "success"
        );

        return task;
    } catch (error) {
        console.error(
            "Customer media upload failed:",
            error
        );

        updateUploadProgress(
            0,
            "Upload failed."
        );

        throw error;
    } finally {
        mediaState.uploading =
            false;
    }
}

function removeExtension(
    filename
) {
    return String(
        filename || "Untitled task"
    ).replace(
        /\.[^/.]+$/,
        ""
    );
}

/* ============================================================
   CREATE CUSTOMER TASK
   ============================================================ */

export async function createCustomerTask(
    options = {}
) {
    if (
        !isLoggedIn()
    ) {
        throw new Error(
            "You must be logged in to create a task."
        );
    }

    if (
        isPendingApproval()
    ) {
        throw new Error(
            "Your account is waiting for administrator approval."
        );
    }

    const user =
        getUser();

    const workType =
        options.workType ||
        options.taskType ||
        "box";

    const workRole =
        options.workRole ||
        roleForWorkType(
            workType
        );

    const title =
        String(
            options.title ||
            "Customer task"
        ).trim();

    if (!title) {
        throw new Error(
            "Task title is required."
        );
    }

    if (
        !options.mediaPath
    ) {
        throw new Error(
            "Task media path is required."
        );
    }

    const client =
        getClient();

    const table =
        APP_CONFIG.tables.tasks;

    /*
     * Keep the payload compatible with the main task schema.
     */
    const payload = {
        title,

        media_path:
            options.mediaPath,

        media_type:
            normalizeMediaType(
                options.mediaType
            ),

        work_type:
            workType,

        work_role:
            workRole,

        status:
            "available",

        created_by:
            user.id,

        duration:
            options.duration ??
            null,

        pay:
            options.pay ??
            null,

        metadata:
            options.metadata ||
            {}
    };

    let {
        data,
        error
    } = await client
        .from(table)
        .insert(payload)
        .select("*")
        .single();

    /*
     * Older installations may not have all columns. Retry with
     * a conservative payload if the first insert is rejected.
     */
    if (
        error
    ) {
        console.warn(
            "Full task insert failed. Retrying with compatible fields:",
            error
        );

        const fallback = {
            title,
            media_path:
                options.mediaPath,
            media_type:
                normalizeMediaType(
                    options.mediaType
                ),
            status:
                "available",
            created_by:
                user.id
        };

        const retry =
            await client
                .from(table)
                .insert(fallback)
                .select("*")
                .single();

        data =
            retry.data;

        error =
            retry.error;
    }

    if (error) {
        throw error;
    }

    if (!data) {
        throw new Error(
            "Task was created but no task record was returned."
        );
    }

    return normalizeTask(
        data
    );
}

/* ============================================================
   UPLOAD UI
   ============================================================ */

function updateUploadProgress(
    percent,
    message
) {
    mediaState.uploadProgress =
        Math.max(
            0,
            Math.min(
                100,
                Number(percent) || 0
            )
        );

    const bar =
        $("uploadProgressBar");

    const text =
        $("uploadProgressText");

    const container =
        $("uploadProgress");

    if (bar) {
        bar.style.width =
            `${mediaState.uploadProgress}%`;

        bar.setAttribute(
            "aria-valuenow",
            String(
                mediaState.uploadProgress
            )
        );
    }

    if (text) {
        text.textContent =
            message ||
            `${mediaState.uploadProgress}%`;
    }

    if (container) {
        showElement(
            container
        );
    }
}

function bindUploadInput() {
    const input =
        $("customerMediaInput");

    if (
        !input ||
        input.dataset.bound === "true"
    ) {
        return;
    }

    input.dataset.bound =
        "true";

    input.addEventListener(
        "change",
        async event => {
            const file =
                event.target.files?.[0];

            if (!file) {
                return;
            }

            try {
                await loadLocalMediaFile(
                    file
                );

                /*
                 * Do not automatically upload until the user has
                 * selected a file. Upload immediately for the
                 * customer workflow.
                 */
                await uploadCustomerMedia(
                    file
                );
            } catch (error) {
                console.error(
                    "Media selection failed:",
                    error
                );

                showToast(
                    error.message ||
                    "Unable to process the selected media.",
                    "error"
                );
            } finally {
                input.value =
                    "";
            }
        }
    );
}

function bindUploadPanel() {
    const close =
        $("closeUploadPanel");

    if (
        close &&
        close.dataset.bound !== "true"
    ) {
        close.dataset.bound =
            "true";

        close.addEventListener(
            "click",
            event => {
                event.preventDefault();

                const panel =
                    $("customerUploadPanel");

                if (panel) {
                    hideElement(
                        panel
                    );
                }
            }
        );
    }

    const input =
        $("customerMediaInput");

    if (input) {
        input.accept =
            "image/*,video/*";
    }
}

/* ============================================================
   ROLE VISIBILITY
   ============================================================ */

function updateUploadVisibility() {
    const panel =
        $("customerUploadPanel");

    const workbenchUpload =
        $("workbenchUpload");

    if (
        isCoworker()
    ) {
        if (panel) {
            hideElement(
                panel
            );
        }

        if (workbenchUpload) {
            hideElement(
                workbenchUpload
            );
        }

        return;
    }

    if (
        canUploadCustomerMedia()
    ) {
        if (workbenchUpload) {
            showElement(
                workbenchUpload
            );
        }

        /*
         * Do not force the main upload panel open.
         */
    } else {
        if (panel) {
            hideElement(
                panel
            );
        }

        if (workbenchUpload) {
            hideElement(
                workbenchUpload
            );
        }
    }
}

/* ============================================================
   MEDIA TOOLBAR
   ============================================================ */

function updateMediaUI() {
    const typeLabel =
        $("mediaTypeLabel");

    const previous =
        $("previousFrameButton");

    const next =
        $("nextFrameButton");

    const counter =
        $("frameCounter");

    const videoControls =
        $("videoControls");

    const timeline =
        $("videoTimeline");

    const time =
        $("videoTime");

    if (typeLabel) {
        typeLabel.textContent =
            mediaState.mediaType === "video"
                ? "Video"
                : mediaState.mediaType === "image"
                    ? "Image"
                    : "No media";
    }

    if (
        mediaState.mediaType ===
        "video"
    ) {
        if (previous) {
            showElement(
                previous
            );

            previous.disabled =
                mediaState.currentFrame <= 0;
        }

        if (next) {
            showElement(
                next
            );

            next.disabled =
                mediaState.currentFrame >=
                mediaState.totalFrames - 1;
        }

        if (counter) {
            counter.textContent =
                `${mediaState.currentFrame + 1} / ${mediaState.totalFrames}`;
        }

        if (videoControls) {
            showElement(
                videoControls
            );
        }

        if (timeline) {
            const duration =
                mediaState.duration;

            timeline.max =
                String(
                    duration || 0
                );

            timeline.value =
                String(
                    mediaState.currentTime || 0
                );
        }

        if (time) {
            time.textContent =
                `${formatTime(
                    mediaState.currentTime
                )} / ${formatTime(
                    mediaState.duration
                )}`;
        }
    } else {
        if (previous) {
            hideElement(
                previous
            );
        }

        if (next) {
            hideElement(
                next
            );
        }

        if (counter) {
            counter.textContent =
                mediaState.mediaType ===
                "image"
                    ? "1 / 1"
                    : "0 / 0";
        }

        if (videoControls) {
            hideElement(
                videoControls
            );
        }
    }
}

/* ============================================================
   VIDEO FRAME CONTROL
   ============================================================ */

export function seekVideoTime(
    time
) {
    if (
        !mediaState.video ||
        mediaState.mediaType !==
            "video"
    ) {
        return;
    }

    const duration =
        Number(
            mediaState.video.duration
        ) || 0;

    const target =
        Math.max(
            0,
            Math.min(
                duration,
                Number(time) || 0
            )
        );

    mediaState.video.currentTime =
        target;

    mediaState.currentTime =
        target;

    mediaState.currentFrame =
        Math.max(
            0,
            Math.min(
                mediaState.totalFrames - 1,
                Math.round(
                    target *
                    mediaState.fps
                )
            )
        );

    updateMediaUI();

    dispatchMediaEvent(
        "frameChanged",
        {
            frame:
                mediaState.currentFrame,
            time:
                mediaState.currentTime
        }
    );
}

export function seekFrame(
    frame
) {
    if (
        mediaState.mediaType !==
        "video"
    ) {
        return;
    }

    const targetFrame =
        Math.max(
            0,
            Math.min(
                mediaState.totalFrames - 1,
                Number(frame) || 0
            )
        );

    const time =
        targetFrame /
        (
            mediaState.fps ||
            30
        );

    mediaState.currentFrame =
        targetFrame;

    seekVideoTime(
        time
    );
}

export function nextFrame() {
    seekFrame(
        mediaState.currentFrame + 1
    );
}

export function previousFrame() {
    seekFrame(
        mediaState.currentFrame - 1
    );
}

/* ============================================================
   CAPTURE VIDEO FRAME
   ============================================================ */

export function captureCurrentFrame() {
    if (
        !mediaState.video ||
        mediaState.mediaType !==
            "video"
    ) {
        return null;
    }

    const video =
        mediaState.video;

    if (
        !video.videoWidth ||
        !video.videoHeight
    ) {
        return null;
    }

    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width =
        video.videoWidth;

    canvas.height =
        video.videoHeight;

    const context =
        canvas.getContext(
            "2d"
        );

    if (!context) {
        return null;
    }

    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );

    return {
        canvas,
        dataUrl:
            canvas.toDataURL(
                "image/png"
            ),
        width:
            canvas.width,
        height:
            canvas.height,
        frame:
            mediaState.currentFrame,
        time:
            mediaState.currentTime
    };
}

/* ============================================================
   VIDEO PLAYBACK
   ============================================================ */

function toggleVideoPlayback() {
    const video =
        mediaState.video;

    if (
        !video
    ) {
        return;
    }

    if (
        video.paused
    ) {
        video.play()
            .catch(error => {
                console.warn(
                    "Video playback failed:",
                    error
                );
            });
    } else {
        video.pause();
    }
}

function updateVideoTimeFromElement() {
    const video =
        mediaState.video;

    if (!video) {
        return;
    }

    mediaState.currentTime =
        Number(
            video.currentTime
        ) || 0;

    mediaState.currentFrame =
        Math.max(
            0,
            Math.min(
                mediaState.totalFrames - 1,
                Math.round(
                    mediaState.currentTime *
                    mediaState.fps
                )
            )
        );

    updateMediaUI();

    dispatchMediaEvent(
        "frameChanged",
        {
            frame:
                mediaState.currentFrame,
            time:
                mediaState.currentTime
        }
    );
}

/* ============================================================
   VIDEO CONTROLS
   ============================================================ */

function bindVideoControls() {
    const playButton =
        $("videoPlayButton");

    if (
        playButton &&
        playButton.dataset.bound !== "true"
    ) {
        playButton.dataset.bound =
            "true";

        playButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                toggleVideoPlayback();
            }
        );
    }

    const timeline =
        $("videoTimeline");

    if (
        timeline &&
        timeline.dataset.bound !== "true"
    ) {
        timeline.dataset.bound =
            "true";

        timeline.addEventListener(
            "input",
            () => {
                seekVideoTime(
                    Number(
                        timeline.value
                    )
                );
            }
        );
    }

    const video =
        $("annotationVideo");

    if (
        video &&
        video.dataset.bound !== "true"
    ) {
        video.dataset.bound =
            "true";

        video.addEventListener(
            "timeupdate",
            updateVideoTimeFromElement
        );

        video.addEventListener(
            "play",
            () => {
                if (playButton) {
                    playButton.textContent =
                        "Pause";
                }
            }
        );

        video.addEventListener(
            "pause",
            () => {
                if (playButton) {
                    playButton.textContent =
                        "Play";
                }
            }
        );

        video.addEventListener(
            "ended",
            () => {
                if (playButton) {
                    playButton.textContent =
                        "Play";
                }
            }
        );
    }

    const previous =
        $("previousFrameButton");

    if (
        previous &&
        previous.dataset.bound !== "true"
    ) {
        previous.dataset.bound =
            "true";

        previous.addEventListener(
            "click",
            event => {
                event.preventDefault();

                previousFrame();
            }
        );
    }

    const next =
        $("nextFrameButton");

    if (
        next &&
        next.dataset.bound !== "true"
    ) {
        next.dataset.bound =
            "true";

        next.addEventListener(
            "click",
            event => {
                event.preventDefault();

                nextFrame();
            }
        );
    }
}

/* ============================================================
   MEDIA DOWNLOAD
   ============================================================ */

export function downloadCurrentMedia() {
    if (
        !mediaState.mediaUrl
    ) {
        showToast(
            "There is no media to download.",
            "warning"
        );

        return;
    }

    const link =
        document.createElement(
            "a"
        );

    link.href =
        mediaState.mediaUrl;

    link.target =
        "_blank";

    link.rel =
        "noopener";

    link.download =
        mediaState.currentTask?.title ||
        "task-media";

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();
}

/* ============================================================
   FORMAT TIME
   ============================================================ */

function formatTime(seconds) {
    const value =
        Math.max(
            0,
            Number(seconds) || 0
        );

    const minutes =
        Math.floor(
            value / 60
        );

    const remaining =
        Math.floor(
            value % 60
        );

    return `${String(
        minutes
    ).padStart(2, "0")}:${String(
        remaining
    ).padStart(2, "0")}`;
}

/* ============================================================
   MEDIA EVENTS
   ============================================================ */

function dispatchMediaEvent(
    name,
    detail = {}
) {
    try {
        window.dispatchEvent(
            new CustomEvent(
                name,
                {
                    detail
                }
            )
        );
    } catch (error) {
        console.warn(
            `Could not dispatch ${name}:`,
            error
        );
    }
}

/* ============================================================
   TASK EVENT LISTENERS
   ============================================================ */

function bindTaskEvents() {
    window.addEventListener(
        "taskSelected",
        async event => {
            const task =
                event.detail?.task;

            const taskId =
                event.detail?.taskId ||
                task?.id;

            if (!taskId) {
                return;
            }

            /*
             * If the task object already contains the media,
             * load it directly. Otherwise fetch it from Supabase.
             */
            try {
                let selectedTask =
                    task;

                if (
                    !selectedTask
                ) {
                    const client =
                        getClient();

                    const {
                        data,
                        error
                    } = await client
                        .from(
                            APP_CONFIG.tables.tasks
                        )
                        .select("*")
                        .eq(
                            "id",
                            taskId
                        )
                        .maybeSingle();

                    if (error) {
                        throw error;
                    }

                    selectedTask =
                        data;
                }

                if (
                    selectedTask
                ) {
                    await loadTaskMedia(
                        selectedTask
                    );
                }
            } catch (error) {
                console.error(
                    "Could not load task media:",
                    error
                );

                showToast(
                    "The task was opened, but its media could not be loaded.",
                    "error"
                );
            }
        }
    );

    window.addEventListener(
        "taskCleared",
        () => {
            clearMedia();
        }
    );
}

/* ============================================================
   KEYBOARD VIDEO SHORTCUTS
   ============================================================ */

function bindKeyboardShortcuts() {
    if (
        document.body.dataset.mediaKeyboardBound ===
        "true"
    ) {
        return;
    }

    document.body.dataset.mediaKeyboardBound =
        "true";

    document.addEventListener(
        "keydown",
        event => {
            /*
             * Do not interfere with text inputs.
             */
            const target =
                event.target;

            if (
                target instanceof
                    HTMLInputElement ||
                target instanceof
                    HTMLTextAreaElement ||
                target instanceof
                    HTMLSelectElement ||
                target?.isContentEditable
            ) {
                return;
            }

            if (
                mediaState.mediaType !==
                "video"
            ) {
                return;
            }

            if (
                event.key === "ArrowRight"
            ) {
                event.preventDefault();
                nextFrame();
            }

            if (
                event.key === "ArrowLeft"
            ) {
                event.preventDefault();
                previousFrame();
            }

            if (
                event.code ===
                "Space"
            ) {
                event.preventDefault();
                toggleVideoPlayback();
            }
        }
    );
}

/* ============================================================
   INITIALIZATION
   ============================================================ */

export function initializeMedia() {
    if (
        mediaState.initialized
    ) {
        updateUploadVisibility();
        return;
    }

    mediaState.initialized =
        true;

    bindUploadInput();
    bindUploadPanel();
    bindVideoControls();
    bindTaskEvents();
    bindKeyboardShortcuts();

    updateUploadVisibility();
    updateMediaUI();
}

/* ============================================================
   PROFILE / AUTH REFRESH
   ============================================================ */

function bindAuthRefresh() {
    window.addEventListener(
        "authStateChanged",
        () => {
            updateUploadVisibility();
        }
    );
}

/* ============================================================
   GLOBAL API
   ============================================================ */

if (
    typeof window !==
    "undefined"
) {
    window.mediaState =
        mediaState;

    window.loadTaskMedia =
        loadTaskMedia;

    window.loadImage =
        loadImage;

    window.loadVideo =
        loadVideo;

    window.clearMedia =
        clearMedia;

    window.nextFrame =
        nextFrame;

    window.previousFrame =
        previousFrame;

    window.seekFrame =
        seekFrame;

    window.seekVideoTime =
        seekVideoTime;

    window.captureCurrentFrame =
        captureCurrentFrame;

    window.downloadCurrentMedia =
        downloadCurrentMedia;

    window.uploadCustomerMedia =
        uploadCustomerMedia;

    window.createCustomerTask =
        createCustomerTask;

    window.validateMediaFile =
        validateMediaFile;

    window.canUploadCustomerMedia =
        canUploadCustomerMedia;
}

/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (
    typeof document !==
    "undefined"
) {
    bindAuthRefresh();

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                initializeMedia();
            },
            {
                once: true
            }
        );
    } else {
        initializeMedia();
    }
}

/* ============================================================
   EXPORTS
   ============================================================ */

export default {
    mediaState,

    initializeMedia,

    loadTaskMedia,
    loadImage,
    loadVideo,
    loadLocalMediaFile,

    clearMedia,

    uploadCustomerMedia,
    createCustomerTask,

    validateMediaFile,
    canUploadCustomerMedia,

    seekVideoTime,
    seekFrame,
    nextFrame,
    previousFrame,

    captureCurrentFrame,
    downloadCurrentMedia
};
