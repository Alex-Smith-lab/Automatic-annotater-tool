// ============================================================
// ANNOTATION AI - MEDIA MODULE
// Handles image/video loading, customer uploads, video frames,
// media controls, and task media display.
// ============================================================

import {
    APP_CONFIG,
    normalizeRole,
    isCoworkerRole
} from "./config.js";

import {
    getSupabase,
    getCurrentUser
} from "./supabase.js";

import {
    getRole,
    isAdmin,
    isStaff,
    isReviewer,
    isCoworker,
    isPendingApproval
} from "./auth.js";

const mediaState = {
    initialized: false,

    currentFile: null,
    currentUrl: null,
    currentObjectUrl: null,

    mediaType: null,

    video: null,
    image: null,

    duration: 0,
    currentTime: 0,
    currentFrame: 0,

    fps: 30,

    uploading: false,
    uploadProgress: 0,

    error: null
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function $(id) {
    return document.getElementById(id);
}

function qs(selector, root = document) {
    return root.querySelector(selector);
}

function qsa(selector, root = document) {
    return Array.from(
        root.querySelectorAll(selector)
    );
}

function emit(name, detail = {}) {
    window.dispatchEvent(
        new CustomEvent(name, {
            detail
        })
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

function showToast(message, type = "info") {
    if (
        typeof window.showToast ===
        "function"
    ) {
        window.showToast(
            message,
            type
        );
    }
}

function getFileExtension(fileName = "") {
    const name =
        String(fileName);

    const index =
        name.lastIndexOf(".");

    return index >= 0
        ? name.slice(index + 1).toLowerCase()
        : "";
}

function isVideoFile(file) {
    if (!file) {
        return false;
    }

    if (
        String(file.type || "")
            .toLowerCase()
            .startsWith("video/")
    ) {
        return true;
    }

    return [
        "mp4",
        "webm",
        "mov",
        "avi",
        "mkv",
        "m4v"
    ].includes(
        getFileExtension(file.name)
    );
}

function isImageFile(file) {
    if (!file) {
        return false;
    }

    if (
        String(file.type || "")
            .toLowerCase()
            .startsWith("image/")
    ) {
        return true;
    }

    return [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "gif",
        "bmp"
    ].includes(
        getFileExtension(file.name)
    );
}

function getFileSizeMB(file) {
    if (!file) {
        return 0;
    }

    return (
        Number(file.size || 0) /
        1024 /
        1024
    );
}

// ------------------------------------------------------------
// ROLE PERMISSIONS
// ------------------------------------------------------------

function canUploadCustomerMedia() {
    if (!getCurrentUser()) {
        return false;
    }

    if (isPendingApproval()) {
        return false;
    }

    // Coworkers must not see/use customer upload.
    if (isCoworker()) {
        return false;
    }

    // Staff/admin have full access.
    if (
        isAdmin() ||
        isStaff() ||
        isReviewer()
    ) {
        return true;
    }

    // Customers can upload.
    return true;
}

function canUseMediaTools() {
    return (
        isAdmin() ||
        isStaff() ||
        isReviewer() ||
        !isCoworker()
    );
}

// ------------------------------------------------------------
// MEDIA ELEMENTS
// ------------------------------------------------------------

function getImageElement() {
    return (
        mediaState.image ||
        $("annotationImage") ||
        $("sourceImage") ||
        $("mainImage") ||
        $("imageViewer") ||
        $("mediaImage")
    );
}

function getVideoElement() {
    return (
        mediaState.video ||
        $("annotationVideo") ||
        $("videoPlayer") ||
        $("sourceVideo") ||
        $("mainVideo") ||
        $("mediaVideo")
    );
}

function getCanvasElement() {
    return (
        $("annotationCanvas") ||
        $("canvas") ||
        $("drawingCanvas") ||
        $("imageCanvas")
    );
}

// ------------------------------------------------------------
// MEDIA CONTAINER
// ------------------------------------------------------------

function getMediaContainer() {
    return (
        $("mediaViewer") ||
        $("mediaContainer") ||
        $("annotationMedia") ||
        $("workspaceMedia") ||
        $("canvasContainer")
    );
}

// ------------------------------------------------------------
// HIDE / SHOW MEDIA
// ------------------------------------------------------------

function hideImage() {
    const image =
        getImageElement();

    image?.classList.add(
        "hidden"
    );
}

function hideVideo() {
    const video =
        getVideoElement();

    video?.classList.add(
        "hidden"
    );
}

function showImage() {
    const image =
        getImageElement();

    image?.classList.remove(
        "hidden"
    );
}

function showVideo() {
    const video =
        getVideoElement();

    video?.classList.remove(
        "hidden"
    );
}

// ------------------------------------------------------------
// CLEANUP OBJECT URL
// ------------------------------------------------------------

function revokeObjectUrl() {
    if (
        mediaState.currentObjectUrl
    ) {
        try {
            URL.revokeObjectURL(
                mediaState.currentObjectUrl
            );
        } catch (error) {
            console.debug(
                "Object URL cleanup failed."
            );
        }
    }

    mediaState.currentObjectUrl =
        null;
}

// ------------------------------------------------------------
// CLEAR MEDIA
// ------------------------------------------------------------

function clearMedia() {
    revokeObjectUrl();

    const image =
        getImageElement();

    const video =
        getVideoElement();

    if (image) {
        image.removeAttribute(
            "src"
        );

        image.classList.add(
            "hidden"
        );
    }

    if (video) {
        video.pause();

        video.removeAttribute(
            "src"
        );

        video.load();

        video.classList.add(
            "hidden"
        );
    }

    mediaState.currentFile =
        null;

    mediaState.currentUrl =
        null;

    mediaState.mediaType =
        null;

    mediaState.duration =
        0;

    mediaState.currentTime =
        0;

    mediaState.currentFrame =
        0;

    emit(
        "mediaCleared"
    );
}

// ------------------------------------------------------------
// LOAD IMAGE
// ------------------------------------------------------------

async function loadImage(
    source,
    options = {}
) {
    const image =
        getImageElement();

    if (!image) {
        throw new Error(
            "Image display element was not found."
        );
    }

    revokeObjectUrl();

    let url = null;

    if (
        typeof source ===
        "string"
    ) {
        url = source;
    } else if (
        source instanceof Blob
    ) {
        url = URL.createObjectURL(
            source
        );

        mediaState.currentObjectUrl =
            url;
    }

    if (!url) {
        throw new Error(
            "No image source was provided."
        );
    }

    hideVideo();

    image.classList.remove(
        "hidden"
    );

    mediaState.image =
        image;

    mediaState.mediaType =
        "image";

    mediaState.currentUrl =
        url;

    return new Promise(
        (resolve, reject) => {
            image.onload = () => {
                mediaState.currentFile =
                    options.file ||
                    null;

                emit(
                    "imageLoaded",
                    {
                        image,
                        url,
                        width:
                            image.naturalWidth,
                        height:
                            image.naturalHeight,
                        file:
                            options.file ||
                            null
                    }
                );

                emit(
                    "mediaLoaded",
                    {
                        type: "image",
                        url
                    }
                );

                resolve({
                    element: image,
                    url,
                    type: "image",
                    width:
                        image.naturalWidth,
                    height:
                        image.naturalHeight
                });
            };

            image.onerror = () => {
                reject(
                    new Error(
                        "The image could not be loaded."
                    )
                );
            };

            image.src = url;
        }
    );
}

// ------------------------------------------------------------
// LOAD VIDEO
// ------------------------------------------------------------

async function loadVideo(
    source,
    options = {}
) {
    const video =
        getVideoElement();

    if (!video) {
        throw new Error(
            "Video display element was not found."
        );
    }

    revokeObjectUrl();

    let url = null;

    if (
        typeof source ===
        "string"
    ) {
        url = source;
    } else if (
        source instanceof Blob
    ) {
        url = URL.createObjectURL(
            source
        );

        mediaState.currentObjectUrl =
            url;
    }

    if (!url) {
        throw new Error(
            "No video source was provided."
        );
    }

    hideImage();

    video.classList.remove(
        "hidden"
    );

    mediaState.video =
        video;

    mediaState.mediaType =
        "video";

    mediaState.currentUrl =
        url;

    video.src = url;

    video.load();

    return new Promise(
        (resolve, reject) => {
            const onLoaded = () => {
                cleanup();

                mediaState.duration =
                    Number(
                        video.duration
                    ) || 0;

                mediaState.currentTime =
                    Number(
                        video.currentTime
                    ) || 0;

                mediaState.currentFile =
                    options.file ||
                    null;

                emit(
                    "videoLoaded",
                    {
                        video,
                        url,
                        duration:
                            mediaState.duration,
                        file:
                            options.file ||
                            null
                    }
                );

                emit(
                    "mediaLoaded",
                    {
                        type: "video",
                        url,
                        duration:
                            mediaState.duration
                    }
                );

                resolve({
                    element: video,
                    url,
                    type: "video",
                    duration:
                        mediaState.duration
                });
            };

            const onError = () => {
                cleanup();

                reject(
                    new Error(
                        "The video could not be loaded."
                    )
                );
            };

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

            video.addEventListener(
                "loadedmetadata",
                onLoaded,
                {
                    once: true
                }
            );

            video.addEventListener(
                "error",
                onError,
                {
                    once: true
                }
            );
        }
    );
}

// ------------------------------------------------------------
// LOAD MEDIA SOURCE
// ------------------------------------------------------------

async function loadMedia(
    source,
    options = {}
) {
    if (!source) {
        throw new Error(
            "No media source was provided."
        );
    }

    if (
        typeof source !==
        "string"
    ) {
        if (
            isVideoFile(source)
        ) {
            return loadVideo(
                source,
                options
            );
        }

        if (
            isImageFile(source)
        ) {
            return loadImage(
                source,
                options
            );
        }
    }

    const type =
        String(
            options.mediaType ||
            ""
        ).toLowerCase();

    if (
        type.includes("video")
    ) {
        return loadVideo(
            source,
            options
        );
    }

    return loadImage(
        source,
        options
    );
}

// ------------------------------------------------------------
// LOCAL FILE VALIDATION
// ------------------------------------------------------------

function validateUploadFile(file) {
    if (!file) {
        return {
            valid: false,
            message: "Please select a file."
        };
    }

    if (!canUploadCustomerMedia()) {
        return {
            valid: false,
            message:
                "Your current role cannot upload customer media."
        };
    }

    const image =
        isImageFile(file);

    const video =
        isVideoFile(file);

    if (!image && !video) {
        return {
            valid: false,
            message:
                "Please select a supported image or video file."
        };
    }

    const sizeMB =
        getFileSizeMB(file);

    if (
        image &&
        sizeMB >
        APP_CONFIG.upload.maxImageMB
    ) {
        return {
            valid: false,
            message:
                `Image is too large. Maximum size is ${APP_CONFIG.upload.maxImageMB} MB.`
        };
    }

    if (
        video &&
        sizeMB >
        APP_CONFIG.upload.maxVideoMB
    ) {
        return {
            valid: false,
            message:
                `Video is too large. Maximum size is ${APP_CONFIG.upload.maxVideoMB} MB.`
        };
    }

    return {
        valid: true,
        type:
            image
                ? "image"
                : "video"
    };
}

// ------------------------------------------------------------
// PREVIEW LOCAL FILE
// ------------------------------------------------------------

async function previewFile(file) {
    const validation =
        validateUploadFile(file);

    if (!validation.valid) {
        showToast(
            validation.message,
            "error"
        );

        return null;
    }

    try {
        mediaState.currentFile =
            file;

        const result =
            await loadMedia(
                file,
                {
                    file,
                    mediaType:
                        validation.type
                }
            );

        emit(
            "mediaPreviewReady",
            {
                file,
                result
            }
        );

        return result;
    } catch (error) {
        console.error(
            "Could not preview media:",
            error
        );

        showToast(
            error.message ||
            "Could not preview media.",
            "error"
        );

        return null;
    }
}

// ------------------------------------------------------------
// STORAGE PATH
// ------------------------------------------------------------

function createStoragePath(
    userId,
    file
) {
    const extension =
        getFileExtension(
            file?.name ||
            ""
        );

    const safeExtension =
        extension
            ? `.${extension}`
            : "";

    const timestamp =
        Date.now();

    const random =
        Math.random()
            .toString(36)
            .slice(2, 10);

    return (
        `${userId}/` +
        `${timestamp}-` +
        `${random}` +
        safeExtension
    );
}

// ------------------------------------------------------------
// UPLOAD TO SUPABASE STORAGE
// ------------------------------------------------------------

async function uploadMedia(
    file,
    options = {}
) {
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
            "Please sign in before uploading."
        );
    }

    const validation =
        validateUploadFile(
            file
        );

    if (!validation.valid) {
        throw new Error(
            validation.message
        );
    }

    mediaState.uploading =
        true;

    mediaState.uploadProgress =
        0;

    try {
        const path =
            options.path ||
            createStoragePath(
                user.id,
                file
            );

        const bucket =
            options.bucket ||
            APP_CONFIG.buckets.taskMedia;

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

        mediaState.uploadProgress =
            100;

        emit(
            "mediaUploaded",
            {
                path,
                bucket,
                file,
                type:
                    validation.type
            }
        );

        return {
            path,
            bucket,
            file,
            mediaType:
                validation.type
        };
    } catch (error) {
        mediaState.error =
            error;

        throw error;
    } finally {
        mediaState.uploading =
            false;
    }
}

// ------------------------------------------------------------
// CREATE SIGNED MEDIA URL
// ------------------------------------------------------------

async function getSignedMediaUrl(
    path,
    expiresIn = 3600,
    bucket =
        APP_CONFIG.buckets.taskMedia
) {
    const client =
        getSupabase();

    if (!client) {
        throw new Error(
            "Supabase is not configured."
        );
    }

    if (!path) {
        throw new Error(
            "No media path was provided."
        );
    }

    const {
        data,
        error
    } = await client.storage
        .from(bucket)
        .createSignedUrl(
            path,
            expiresIn
        );

    if (error) {
        throw error;
    }

    return (
        data?.signedUrl ||
        null
    );
}

// ------------------------------------------------------------
// CREATE CUSTOMER TASK
// ------------------------------------------------------------

async function createCustomerTask(
    file,
    taskOptions = {}
) {
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

    if (
        isPendingApproval() &&
        !isAdmin()
    ) {
        throw new Error(
            "Your account is waiting for admin approval."
        );
    }

    if (
        isCoworker()
    ) {
        throw new Error(
            "Coworkers cannot create customer upload tasks."
        );
    }

    const validation =
        validateUploadFile(
            file
        );

    if (!validation.valid) {
        throw new Error(
            validation.message
        );
    }

    const upload =
        await uploadMedia(
            file
        );

    const workType =
        taskOptions.workType ||
        taskOptions.type ||
        "2d_box";

    const workRole =
        normalizeRole(
            taskOptions.workRole ||
            taskOptions.role ||
            roleForUploadWorkType(
                workType
            )
        );

    const title =
        taskOptions.title ||
        file.name ||
        "Customer annotation task";

    const task = {
        title,

        source_name:
            file.name,

        media_type:
            validation.type,

        media_path:
            upload.path,

        work_type:
            workType,

        work_role:
            workRole,

        status:
            "available",

        assigned_to:
            null,

        claimed_by:
            null,

        claimed_at:
            null,

        expected_minutes:
            taskOptions.expectedMinutes ??
            taskOptions.duration ??
            null,

        pay_amount:
            taskOptions.payAmount ??
            null
    };

    const {
        data,
        error
    } = await client
        .from(APP_CONFIG.tables.tasks)
        .insert(task)
        .select("*")
        .single();

    if (error) {
        // Remove uploaded file if task creation failed.
        try {
            await client.storage
                .from(
                    APP_CONFIG.buckets.taskMedia
                )
                .remove([
                    upload.path
                ]);
        } catch (cleanupError) {
            console.warn(
                "Uploaded file cleanup failed:",
                cleanupError
            );
        }

        throw error;
    }

    emit(
        "customerTaskCreated",
        {
            task: data,
            upload
        }
    );

    showToast(
        "Task uploaded successfully.",
        "success"
    );

    return data;
}

// ------------------------------------------------------------
// WORK TYPE -> ROLE
// ------------------------------------------------------------

function roleForUploadWorkType(
    workType
) {
    const value =
        String(
            workType || ""
        )
            .toLowerCase()
            .replace(/[\s-]+/g, "_");

    if (
        value.includes("polygon")
    ) {
        return "coworker_polygon";
    }

    if (
        value.includes("segment")
    ) {
        return "coworker_segmentation";
    }

    return "coworker_2d_box";
}

// ------------------------------------------------------------
// VIDEO CONTROLS
// ------------------------------------------------------------

function playVideo() {
    const video =
        getVideoElement();

    if (!video) {
        return false;
    }

    video.play().catch(
        error => {
            console.debug(
                "Video play was blocked:",
                error
            );
        }
    );

    return true;
}

function pauseVideo() {
    const video =
        getVideoElement();

    if (!video) {
        return false;
    }

    video.pause();

    return true;
}

function toggleVideo() {
    const video =
        getVideoElement();

    if (!video) {
        return false;
    }

    if (video.paused) {
        return playVideo();
    }

    pauseVideo();

    return true;
}

// ------------------------------------------------------------
// VIDEO SEEK
// ------------------------------------------------------------

function seekVideo(seconds) {
    const video =
        getVideoElement();

    if (!video) {
        return false;
    }

    const value =
        Number(seconds);

    if (!Number.isFinite(value)) {
        return false;
    }

    video.currentTime =
        Math.max(
            0,
            Math.min(
                value,
                Number(video.duration) ||
                    value
            )
        );

    return true;
}

function seekRelative(
    seconds
) {
    const video =
        getVideoElement();

    if (!video) {
        return false;
    }

    return seekVideo(
        video.currentTime +
        Number(seconds || 0)
    );
}

// ------------------------------------------------------------
// FRAME CALCULATION
// ------------------------------------------------------------

function getFrameRate() {
    return (
        Number(
            mediaState.fps
        ) > 0
            ? Number(
                  mediaState.fps
              )
            : 30
    );
}

function setFrameRate(fps) {
    const value =
        Number(fps);

    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {
        return false;
    }

    mediaState.fps =
        value;

    emit(
        "frameRateChanged",
        {
            fps: value
        }
    );

    return true;
}

function getCurrentFrame() {
    const video =
        getVideoElement();

    if (!video) {
        return mediaState.currentFrame;
    }

    return Math.max(
        0,
        Math.floor(
            video.currentTime *
            getFrameRate()
        )
    );
}

function seekFrame(
    frame
) {
    const video =
        getVideoElement();

    if (!video) {
        return false;
    }

    const value =
        Number(frame);

    if (!Number.isFinite(value)) {
        return false;
    }

    const fps =
        getFrameRate();

    return seekVideo(
        Math.max(
            0,
            value
        ) / fps
    );
}

function nextFrame() {
    return seekFrame(
        getCurrentFrame() + 1
    );
}

function previousFrame() {
    return seekFrame(
        Math.max(
            0,
            getCurrentFrame() - 1
        )
    );
}

// ------------------------------------------------------------
// CAPTURE VIDEO FRAME
// ------------------------------------------------------------

function captureVideoFrame(
    options = {}
) {
    const video =
        getVideoElement();

    if (!video) {
        return null;
    }

    if (
        video.readyState <
        2
    ) {
        return null;
    }

    const canvas =
        document.createElement(
            "canvas"
        );

    const width =
        video.videoWidth ||
        video.clientWidth ||
        1;

    const height =
        video.videoHeight ||
        video.clientHeight ||
        1;

    canvas.width =
        width;

    canvas.height =
        height;

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
        width,
        height
    );

    const dataUrl =
        canvas.toDataURL(
            options.type ||
                "image/png",
            options.quality ??
                0.92
        );

    emit(
        "videoFrameCaptured",
        {
            frame:
                getCurrentFrame(),
            time:
                video.currentTime,
            dataUrl,
            width,
            height
        }
    );

    return {
        canvas,
        dataUrl,
        frame:
            getCurrentFrame(),
        time:
            video.currentTime,
        width,
        height
    };
}

// ------------------------------------------------------------
// DOWNLOAD CURRENT FRAME
// ------------------------------------------------------------

function downloadCurrentFrame(
    fileName = "annotation-frame.png"
) {
    const frame =
        captureVideoFrame();

    if (!frame?.dataUrl) {
        showToast(
            "Could not capture the current video frame.",
            "error"
        );

        return false;
    }

    const link =
        document.createElement(
            "a"
        );

    link.href =
        frame.dataUrl;

    link.download =
        fileName;

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();

    return true;
}

// ------------------------------------------------------------
// VIDEO EVENT BINDING
// ------------------------------------------------------------

function bindVideoEvents() {
    const video =
        getVideoElement();

    if (!video) {
        return;
    }

    if (
        video.dataset.mediaBound ===
        "true"
    ) {
        return;
    }

    video.dataset.mediaBound =
        "true";

    mediaState.video =
        video;

    video.addEventListener(
        "timeupdate",
        () => {
            mediaState.currentTime =
                Number(
                    video.currentTime
                ) || 0;

            mediaState.currentFrame =
                getCurrentFrame();

            emit(
                "videoTimeChanged",
                {
                    time:
                        mediaState.currentTime,
                    frame:
                        mediaState.currentFrame,
                    duration:
                        mediaState.duration
                }
            );
        }
    );

    video.addEventListener(
        "play",
        () => {
            emit(
                "videoPlaying"
            );
        }
    );

    video.addEventListener(
        "pause",
        () => {
            emit(
                "videoPaused"
            );
        }
    );

    video.addEventListener(
        "ended",
        () => {
            emit(
                "videoEnded"
            );
        }
    );

    video.addEventListener(
        "loadedmetadata",
        () => {
            mediaState.duration =
                Number(
                    video.duration
                ) || 0;

            emit(
                "videoMetadataLoaded",
                {
                    duration:
                        mediaState.duration,
                    width:
                        video.videoWidth,
                    height:
                        video.videoHeight
                }
            );
        }
    );
}

// ------------------------------------------------------------
// MEDIA CONTROL BUTTONS
// ------------------------------------------------------------

function bindMediaControls() {
    const play =
        $("playVideo") ||
        $("playButton");

    const pause =
        $("pauseVideo") ||
        $("pauseButton");

    const toggle =
        $("toggleVideo") ||
        $("videoPlayPause");

    const previous =
        $("previousFrame") ||
        $("prevFrame");

    const next =
        $("nextFrame");

    const capture =
        $("captureFrame") ||
        $("captureVideoFrame");

    play?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            playVideo();
        }
    );

    pause?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            pauseVideo();
        }
    );

    toggle?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            toggleVideo();
        }
    );

    previous?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            previousFrame();
        }
    );

    next?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            nextFrame();
        }
    );

    capture?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            captureVideoFrame();
        }
    );
}

// ------------------------------------------------------------
// FILE INPUT
// ------------------------------------------------------------

function getUploadInput() {
    return (
        $("customerUploadInput") ||
        $("uploadInput") ||
        $("mediaUploadInput") ||
        $("fileUploadInput") ||
        $("customerMediaInput")
    );
}

function bindUploadInput() {
    const input =
        getUploadInput();

    if (!input) {
        return;
    }

    if (
        input.dataset.mediaBound ===
        "true"
    ) {
        return;
    }

    input.dataset.mediaBound =
        "true";

    input.addEventListener(
        "change",
        async event => {
            const file =
                event.target.files?.[0];

            if (!file) {
                return;
            }

            await previewFile(
                file
            );
        }
    );
}

// ------------------------------------------------------------
// UPLOAD BUTTON
// ------------------------------------------------------------

function bindUploadButton() {
    const buttons = [
        $("customerUploadButton"),
        $("uploadMediaButton"),
        $("uploadPanelButton"),
        $("workbenchUpload")
    ].filter(Boolean);

    buttons.forEach(button => {
        if (
            button.dataset.mediaBound ===
            "true"
        ) {
            return;
        }

        button.dataset.mediaBound =
            "true";

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();

                if (
                    !canUploadCustomerMedia()
                ) {
                    showToast(
                        "Your role cannot upload customer media.",
                        "error"
                    );

                    return;
                }

                getUploadInput()
                    ?.click();
            }
        );
    });
}

// ------------------------------------------------------------
// TASK MEDIA EVENT
// ------------------------------------------------------------

function bindTaskMediaEvents() {
    window.addEventListener(
        "taskMediaLoaded",
        event => {
            const detail =
                event.detail || {};

            if (
                detail.type ===
                "video"
            ) {
                mediaState.currentUrl =
                    detail.url;

                mediaState.mediaType =
                    "video";

                bindVideoEvents();
            }

            if (
                detail.type ===
                "image"
            ) {
                mediaState.currentUrl =
                    detail.url;

                mediaState.mediaType =
                    "image";
            }
        }
    );

    window.addEventListener(
        "taskCleared",
        () => {
            clearMedia();
        }
    );

    window.addEventListener(
        "authChanged",
        () => {
            applyUploadVisibility();
        }
    );
}

// ------------------------------------------------------------
// UPLOAD UI VISIBILITY
// ------------------------------------------------------------

function applyUploadVisibility() {
    const allowed =
        canUploadCustomerMedia();

    const elements = [
        $("customerUploadPanel"),
        $("customerUploadButton"),
        $("uploadMediaButton"),
        $("uploadPanelButton"),
        $("workbenchUpload")
    ].filter(Boolean);

    elements.forEach(element => {
        element.classList.toggle(
            "hidden",
            !allowed
        );
    });

    // Hide customer upload input from coworker roles.
    const input =
        getUploadInput();

    if (input) {
        input.disabled =
            !allowed;
    }

    qsa(
        "[data-customer-upload]"
    ).forEach(
        element => {
            element.classList.toggle(
                "hidden",
                !allowed
            );
        }
    );
}

// ------------------------------------------------------------
// INITIALIZE
// ------------------------------------------------------------

async function initializeMedia() {
    if (
        mediaState.initialized
    ) {
        return mediaState;
    }

    mediaState.initialized =
        true;

    mediaState.image =
        getImageElement();

    mediaState.video =
        getVideoElement();

    bindVideoEvents();
    bindMediaControls();
    bindUploadInput();
    bindUploadButton();
    bindTaskMediaEvents();

    applyUploadVisibility();

    return mediaState;
}

// ------------------------------------------------------------
// GLOBAL API
// ------------------------------------------------------------

window.mediaState =
    mediaState;

window.loadMedia =
    loadMedia;

window.loadImage =
    loadImage;

window.loadVideo =
    loadVideo;

window.previewMediaFile =
    previewFile;

window.uploadMedia =
    uploadMedia;

window.createCustomerTask =
    createCustomerTask;

window.clearMedia =
    clearMedia;

window.playVideo =
    playVideo;

window.pauseVideo =
    pauseVideo;

window.toggleVideo =
    toggleVideo;

window.seekVideo =
    seekVideo;

window.seekFrame =
    seekFrame;

window.nextFrame =
    nextFrame;

window.previousFrame =
    previousFrame;

window.captureVideoFrame =
    captureVideoFrame;

window.captureFrame =
    captureVideoFrame;

window.downloadCurrentFrame =
    downloadCurrentFrame;

window.getCurrentFrame =
    getCurrentFrame;

window.getFrameRate =
    getFrameRate;

window.setFrameRate =
    setFrameRate;

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

export {
    mediaState,

    initializeMedia,

    loadMedia,
    loadImage,
    loadVideo,

    previewFile,

    uploadMedia,
    createCustomerTask,

    getSignedMediaUrl,

    clearMedia,

    canUploadCustomerMedia,
    canUseMediaTools,

    playVideo,
    pauseVideo,
    toggleVideo,

    seekVideo,
    seekRelative,

    getFrameRate,
    setFrameRate,
    getCurrentFrame,

    seekFrame,
    nextFrame,
    previousFrame,

    captureVideoFrame,
    downloadCurrentFrame
};

// ------------------------------------------------------------
// AUTO INITIALIZATION
// ------------------------------------------------------------

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initializeMedia();
        },
        { once: true }
    );
} else {
    initializeMedia();
}
