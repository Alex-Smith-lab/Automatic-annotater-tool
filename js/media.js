import * as Annotation from "./annotation.js";

/* =========================================================
   ANNOTATION MODULE COMPATIBILITY
   ========================================================= */

const state = Annotation.state;

const emit =
    typeof Annotation.emit === "function"
        ? Annotation.emit
        : () => {};

const saveFrame =
    typeof Annotation.saveFrame === "function"
        ? Annotation.saveFrame
        : () => {};

const loadFrame =
    typeof Annotation.loadFrame === "function"
        ? Annotation.loadFrame
        : () => {};

const clearFrameAnnotations =
    typeof Annotation.clearFrameAnnotations === "function"
        ? Annotation.clearFrameAnnotations
        : () => {};

const render =
    typeof Annotation.render === "function"
        ? Annotation.render
        : () => {};

const updateCounts =
    typeof Annotation.updateCounts === "function"
        ? Annotation.updateCounts
        : () => {};

const updateAnnotationsList =
    typeof Annotation.updateAnnotationsList === "function"
        ? Annotation.updateAnnotationsList
        : () => {};


/* =========================================================
   DOM HELPER
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const mediaInput = $("mediaInput");
const sourceVideo = $("sourceVideo");

const annotationCanvas = $("annotationCanvas");
const canvas = annotationCanvas;
const ctx = canvas ? canvas.getContext("2d") : null;

const emptyWorkspace = $("emptyWorkspace");
const canvasWorkspace = $("canvasWorkspace");

const filmstripBar = $("filmstripBar");
const filmstripTrack = $("filmstripTrack");
const filmstripLabel = $("filmstripLabel");
const filmstripCurrentLabel = $("filmstripCurrentLabel");

const frameSlider = $("frameSlider");

const playPauseButton =
    $("playPauseButton") ||
    $("playButton") ||
    $("videoPlayButton");

const previousFrameButton =
    $("previousFrameButton") ||
    $("prevFrameButton") ||
    $("prevFrame");

const nextFrameButton =
    $("nextFrameButton") ||
    $("nextFrameButton") ||
    $("nextFrame");

const firstFrameButton =
    $("firstFrameButton") ||
    $("firstFrame");

const lastFrameButton =
    $("lastFrameButton") ||
    $("lastFrame");

const stopButton =
    $("stopVideoButton") ||
    $("stopButton");

const currentTimeLabel =
    $("currentTimeLabel") ||
    $("currentTime");

const durationLabel =
    $("durationLabel") ||
    $("videoDuration");

const fpsLabel =
    $("fpsLabel") ||
    $("videoFPS");

const filmstripCurrent =
    $("filmstripCurrent");

const videoControls =
    $("videoControls");

const uploadPanel =
    $("uploadPanel") ||
    $("customerUploadPanel") ||
    $("workbenchUpload");


/* =========================================================
   INTERNAL MEDIA STATE
   ========================================================= */

let mediaObjectURL = null;

let mediaLoadToken = 0;

let mediaReady = false;

let mediaListenersBound = false;

let mediaInitialized = false;

let resizeObserver = null;

let filmstripGenerating = false;

let filmstripCancelled = false;

let previousVideoTime = 0;

let videoWasPlayingBeforeSeek = false;

let pendingSeekResolve = null;

let pendingSeekReject = null;

let frameCaptureBusy = false;


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function showElement(element, show = true) {
    if (!element) return;

    element.hidden = !show;

    element.style.display = show ? "" : "none";
}


function setText(element, value) {
    if (!element) return;

    element.textContent =
        value === undefined ||
        value === null
            ? ""
            : String(value);
}


function revokeMediaObjectURL() {
    if (!mediaObjectURL) return;

    try {
        URL.revokeObjectURL(mediaObjectURL);
    } catch (error) {
        console.warn(
            "[media.js] Could not revoke media URL:",
            error
        );
    }

    mediaObjectURL = null;
}


function detectMediaType(file) {
    if (!file) return null;

    const type = String(file.type || "").toLowerCase();

    if (type.startsWith("image/")) {
        return "image";
    }

    if (type.startsWith("video/")) {
        return "video";
    }

    const name =
        String(file.name || "").toLowerCase();

    const imageExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
        ".svg"
    ];

    const videoExtensions = [
        ".mp4",
        ".webm",
        ".mov",
        ".avi",
        ".mkv",
        ".m4v",
        ".ogv"
    ];

    if (
        imageExtensions.some(
            extension => name.endsWith(extension)
        )
    ) {
        return "image";
    }

    if (
        videoExtensions.some(
            extension => name.endsWith(extension)
        )
    ) {
        return "video";
    }

    return null;
}


/* =========================================================
   MEDIA CLEANUP
   ========================================================= */

export function cleanupMedia() {
    mediaLoadToken++;

    mediaReady = false;

    filmstripCancelled = true;

    filmstripGenerating = false;

    frameCaptureBusy = false;

    if (pendingSeekReject) {
        try {
            pendingSeekReject(
                new Error("Media was cleaned up.")
            );
        } catch (_) {
            // Ignore rejected seek cleanup errors.
        }
    }

    pendingSeekResolve = null;
    pendingSeekReject = null;

    if (sourceVideo) {
        try {
            sourceVideo.pause();
        } catch (_) {
            // Ignore.
        }

        try {
            sourceVideo.removeAttribute("src");
            sourceVideo.load();
        } catch (_) {
            // Ignore.
        }
    }

    if (canvas && ctx) {
        try {
            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );
        } catch (_) {
            // Ignore.
        }
    }

    revokeMediaObjectURL();

    if (filmstripTrack) {
        filmstripTrack.innerHTML = "";
    }

    showElement(filmstripBar, false);

    if (mediaInput) {
        try {
            mediaInput.value = "";
        } catch (_) {
            // Ignore.
        }
    }

    showElement(emptyWorkspace, true);

    updateMediaUI();

    emitMediaEvent("media:cleared");
}


/* =========================================================
   RESET ANNOTATIONS
   ========================================================= */

function resetAnnotationsForNewMedia() {
    try {
        clearFrameAnnotations();
    } catch (error) {
        console.warn(
            "[media.js] Could not clear frame annotations:",
            error
        );
    }

    if (state) {
        try {
            if ("currentFrame" in state) {
                state.currentFrame = 0;
            }

            if ("currentTime" in state) {
                state.currentTime = 0;
            }

            if ("totalFrames" in state) {
                state.totalFrames = 1;
            }

            if ("videoDuration" in state) {
                state.videoDuration = 0;
            }

            if ("videoPlaying" in state) {
                state.videoPlaying = false;
            }

            if ("videoSeeking" in state) {
                state.videoSeeking = false;
            }

            if ("mediaType" in state) {
                state.mediaType = null;
            }

            if ("image" in state) {
                state.image = null;
            }

            if ("imageURL" in state) {
                state.imageURL = null;
            }

            if ("videoURL" in state) {
                state.videoURL = null;
            }

            if ("videoDuration" in state) {
                state.videoDuration = 0;
            }

            if ("fps" in state) {
                state.fps = 30;
            }
        } catch (error) {
            console.warn(
                "[media.js] Could not reset annotation media state:",
                error
            );
        }
    }

    try {
        updateCounts();
    } catch (_) {
        // Ignore.
    }

    try {
        updateAnnotationsList();
    } catch (_) {
        // Ignore.
    }
}


/* =========================================================
   IMAGE LOADING
   ========================================================= */

export async function loadImageFile(file) {
    if (!file) {
        throw new Error("No image file supplied.");
    }

    const mediaType = detectMediaType(file);

    if (mediaType !== "image") {
        throw new Error("The selected file is not an image.");
    }

    /*
     * IMPORTANT:
     * cleanupMedia() increments mediaLoadToken.
     * Therefore cleanup MUST happen before taking
     * the new token value.
     */
    cleanupMedia();

    const token = ++mediaLoadToken;

    resetAnnotationsForNewMedia();

    const objectURL = URL.createObjectURL(file);

    mediaObjectURL = objectURL;

    return new Promise((resolve, reject) => {
        const image = new Image();

        let settled = false;

        const fail = error => {
            if (settled) return;

            settled = true;

            if (mediaObjectURL === objectURL) {
                revokeMediaObjectURL();
            }

            reject(
                error instanceof Error
                    ? error
                    : new Error("Unable to load image.")
            );
        };

        image.onload = () => {
            if (settled) return;

            if (token !== mediaLoadToken) {
                fail(
                    new Error(
                        "Image load was cancelled by another media load."
                    )
                );
                return;
            }

            settled = true;

            mediaReady = true;

            if (state) {
                state.mediaType = "image";
                state.image = image;
                state.imageURL = objectURL;
                state.currentFrame = 0;
                state.totalFrames = 1;
                state.currentTime = 0;
                state.videoDuration = 0;
            }

            showElement(emptyWorkspace, false);

            if (canvas) {
                resizeCanvas();
            }

            try {
                render();
            } catch (_) {
                // Ignore render errors here.
            }

            try {
                updateCounts();
                updateAnnotationsList();
            } catch (_) {
                // Ignore.
            }

            updateMediaUI();

            emitMediaEvent(
                "media:loaded",
                {
                    type: "image",
                    file,
                    image,
                    width: image.naturalWidth,
                    height: image.naturalHeight
                }
            );

            resolve({
                type: "image",
                file,
                image,
                width: image.naturalWidth,
                height: image.naturalHeight
            });
        };

        image.onerror = () => {
            fail(
                new Error(
                    "The image could not be loaded."
                )
            );
        };

        image.src = objectURL;
    });
}


/* =========================================================
   VIDEO LOADING
   ========================================================= */

export async function loadVideoFile(file) {
    if (!file) {
        throw new Error("No video file supplied.");
    }

    const mediaType = detectMediaType(file);

    if (mediaType !== "video") {
        throw new Error("The selected file is not a video.");
    }

    /*
     * IMPORTANT:
     * cleanupMedia increments mediaLoadToken.
     * Take the token AFTER cleanup.
     */
    cleanupMedia();

    const token = ++mediaLoadToken;

    resetAnnotationsForNewMedia();

    const objectURL = URL.createObjectURL(file);

    mediaObjectURL = objectURL;

    if (!sourceVideo) {
        URL.revokeObjectURL(objectURL);
        mediaObjectURL = null;

        throw new Error(
            "The source video element was not found."
        );
    }

    return new Promise((resolve, reject) => {
        let settled = false;

        const fail = error => {
            if (settled) return;

            settled = true;

            if (mediaObjectURL === objectURL) {
                revokeMediaObjectURL();
            }

            reject(
                error instanceof Error
                    ? error
                    : new Error("Unable to load video.")
            );
        };

        const handleLoadedMetadata = () => {
            if (settled) return;

            if (token !== mediaLoadToken) {
                fail(
                    new Error(
                        "Video load was cancelled by another media load."
                    )
                );
                return;
            }

            const duration =
                Number.isFinite(sourceVideo.duration) &&
                sourceVideo.duration > 0
                    ? sourceVideo.duration
                    : 0;

            const fps =
                getVideoFPS(file) || 30;

            const totalFrames =
                duration > 0
                    ? Math.max(
                        1,
                        Math.round(duration * fps)
                    )
                    : 1;

            mediaReady = true;

            if (state) {
                state.mediaType = "video";
                state.videoURL = objectURL;
                state.videoDuration = duration;
                state.currentTime = 0;
                state.currentFrame = 0;
                state.totalFrames = totalFrames;
                state.fps = fps;
                state.videoPlaying = false;
                state.videoSeeking = false;
            }

            showElement(emptyWorkspace, false);

            try {
                sourceVideo.currentTime = 0;
            } catch (_) {
                // Ignore.
            }

            resizeCanvas();

            updateMediaUI();

            /*
             * Generate filmstrip after metadata is available.
             * This is deliberately not awaited so the video
             * becomes usable immediately.
             */
            generateFilmstrip()
                .catch(error => {
                    console.warn(
                        "[media.js] Filmstrip generation failed:",
                        error
                    );
                });

            try {
                render();
            } catch (_) {
                // Ignore.
            }

            emitMediaEvent(
                "media:loaded",
                {
                    type: "video",
                    file,
                    video: sourceVideo,
                    duration,
                    fps,
                    totalFrames
                }
            );

            settled = true;

            resolve({
                type: "video",
                file,
                video: sourceVideo,
                duration,
                fps,
                totalFrames
            });
        };

        const handleError = () => {
            fail(
                new Error(
                    "The video could not be loaded."
                )
            );
        };

        sourceVideo.addEventListener(
            "loadedmetadata",
            handleLoadedMetadata,
            {
                once: true
            }
        );

        sourceVideo.addEventListener(
            "error",
            handleError,
            {
                once: true
            }
        );

        try {
            sourceVideo.preload = "metadata";
            sourceVideo.src = objectURL;
            sourceVideo.load();
        } catch (error) {
            fail(error);
        }
    });
}


/* =========================================================
   GENERIC MEDIA LOADER
   ========================================================= */

export async function loadMediaFile(file) {
    if (!file) {
        throw new Error("No media file supplied.");
    }

    const type = detectMediaType(file);

    if (type === "image") {
        return loadImageFile(file);
    }

    if (type === "video") {
        return loadVideoFile(file);
    }

    throw new Error(
        "Unsupported media type. Please select an image or video."
    );
}


/* =========================================================
   MEDIA INPUT
   ========================================================= */

async function handleMediaInputChange(event) {
    const files =
        event &&
        event.target &&
        event.target.files
            ? event.target.files
            : [];

    if (!files.length) return;

    const file = files[0];

    try {
        await loadMediaFile(file);
    } catch (error) {
        console.error(
            "[media.js] Media upload failed:",
            error
        );

        showMediaError(
            error &&
            error.message
                ? error.message
                : "Unable to load the selected media."
        );
    }
}


function bindMediaInput() {
    if (!mediaInput) return;

    mediaInput.addEventListener(
        "change",
        handleMediaInputChange
    );
}


/* =========================================================
   DRAG AND DROP
   ========================================================= */

function getDropTargets() {
    const targets = [];

    if (uploadPanel) {
        targets.push(uploadPanel);
    }

    if (emptyWorkspace) {
        targets.push(emptyWorkspace);
    }

    if (canvasWorkspace) {
        targets.push(canvasWorkspace);
    }

    return [
        ...new Set(targets.filter(Boolean))
    ];
}


function bindDragAndDrop() {
    const targets = getDropTargets();

    if (!targets.length) return;

    for (const target of targets) {
        target.addEventListener(
            "dragenter",
            event => {
                event.preventDefault();

                target.classList.add(
                    "drag-over"
                );
            }
        );

        target.addEventListener(
            "dragover",
            event => {
                event.preventDefault();

                if (
                    event.dataTransfer
                ) {
                    event.dataTransfer.dropEffect =
                        "copy";
                }

                target.classList.add(
                    "drag-over"
                );
            }
        );

        target.addEventListener(
            "dragleave",
            event => {
                event.preventDefault();

                /*
                 * Do not remove the class if the pointer
                 * is still inside the element.
                 */
                if (
                    event.relatedTarget &&
                    target.contains(
                        event.relatedTarget
                    )
                ) {
                    return;
                }

                target.classList.remove(
                    "drag-over"
                );
            }
        );

        target.addEventListener(
            "drop",
            async event => {
                event.preventDefault();

                target.classList.remove(
                    "drag-over"
                );

                const files =
                    event.dataTransfer &&
                    event.dataTransfer.files
                        ? event.dataTransfer.files
                        : [];

                if (!files.length) return;

                try {
                    await loadMediaFile(
                        files[0]
                    );
                } catch (error) {
                    console.error(
                        "[media.js] Drop load failed:",
                        error
                    );

                    showMediaError(
                        error.message ||
                        "Unable to load dropped media."
                    );
                }
            }
        );
    }
}


/* =========================================================
   CANVAS RESIZE
   ========================================================= */

export function resizeCanvas() {
    if (!canvas) return;

    let width = 1;
    let height = 1;

    if (
        state &&
        state.image &&
        state.image.naturalWidth
    ) {
        width = state.image.naturalWidth;
        height = state.image.naturalHeight;
    } else if (
        sourceVideo &&
        sourceVideo.videoWidth &&
        sourceVideo.videoHeight
    ) {
        width = sourceVideo.videoWidth;
        height = sourceVideo.videoHeight;
    } else if (
        canvas.clientWidth &&
        canvas.clientHeight
    ) {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
    }

    /*
     * Keep canvas backing resolution aligned with
     * the actual media where possible.
     */
    if (
        width > 0 &&
        height > 0
    ) {
        if (
            canvas.width !== width ||
            canvas.height !== height
        ) {
            canvas.width = width;
            canvas.height = height;
        }
    }

    try {
        render();
    } catch (_) {
        // Ignore render errors.
    }

    emitMediaEvent(
        "media:resize",
        {
            width: canvas.width,
            height: canvas.height
        }
    );
}


/* =========================================================
   VIDEO FRAME CAPTURE
   ========================================================= */

export async function captureVideoFrame(
    time = null
) {
    if (
        !sourceVideo ||
        !mediaReady ||
        !state ||
        state.mediaType !== "video"
    ) {
        return null;
    }

    if (
        !sourceVideo.videoWidth ||
        !sourceVideo.videoHeight
    ) {
        return null;
    }

    const targetTime =
        Number.isFinite(Number(time))
            ? Math.max(
                0,
                Math.min(
                    Number(time),
                    Number.isFinite(
                        sourceVideo.duration
                    )
                        ? sourceVideo.duration
                        : Number(time)
                )
            )
            : sourceVideo.currentTime;

    frameCaptureBusy = true;

    try {
        if (
            Math.abs(
                sourceVideo.currentTime -
                targetTime
            ) > 0.001
        ) {
            await seekVideoFrame(targetTime);
        }

        if (!canvas || !ctx) {
            return null;
        }

        /*
         * Draw the current video frame onto the canvas.
         * Annotation rendering can then draw over it.
         */
        canvas.width =
            sourceVideo.videoWidth;

        canvas.height =
            sourceVideo.videoHeight;

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        try {
            ctx.drawImage(
                sourceVideo,
                0,
                0,
                canvas.width,
                canvas.height
            );
        } catch (error) {
            console.warn(
                "[media.js] Could not capture video frame:",
                error
            );
        }

        if (state) {
            state.currentTime =
                sourceVideo.currentTime;

            state.currentFrame =
                timeToFrame(
                    sourceVideo.currentTime
                );
        }

        try {
            render();
        } catch (_) {
            // Ignore.
        }

        return canvas;
    } finally {
        frameCaptureBusy = false;
    }
}


/* =========================================================
   SEEK VIDEO FRAME
   ========================================================= */

export function seekVideoFrame(time) {
    if (
        !sourceVideo ||
        !mediaReady ||
        state?.mediaType !== "video"
    ) {
        return Promise.resolve();
    }

    const duration =
        Number.isFinite(sourceVideo.duration)
            ? sourceVideo.duration
            : 0;

    const target =
        Math.max(
            0,
            Math.min(
                Number(time) || 0,
                duration || Number(time) || 0
            )
        );

    if (
        Math.abs(
            sourceVideo.currentTime -
            target
        ) < 0.001
    ) {
        if (state) {
            state.currentTime =
                sourceVideo.currentTime;

            state.currentFrame =
                timeToFrame(
                    sourceVideo.currentTime
                );
        }

        return Promise.resolve();
    }

    if (pendingSeekReject) {
        try {
            pendingSeekReject(
                new Error(
                    "Previous seek was superseded."
                )
            );
        } catch (_) {
            // Ignore.
        }
    }

    return new Promise((resolve, reject) => {
        pendingSeekResolve = resolve;
        pendingSeekReject = reject;

        const finish = () => {
            if (!pendingSeekResolve) {
                return;
            }

            const resolveSeek =
                pendingSeekResolve;

            pendingSeekResolve = null;
            pendingSeekReject = null;

            if (state) {
                state.currentTime =
                    sourceVideo.currentTime;

                state.currentFrame =
                    timeToFrame(
                        sourceVideo.currentTime
                    );

                state.videoSeeking = false;
            }

            try {
                render();
            } catch (_) {
                // Ignore.
            }

            updateMediaUI();

            resolveSeek();
        };

        const fail = error => {
            if (!pendingSeekReject) {
                return;
            }

            const rejectSeek =
                pendingSeekReject;

            pendingSeekResolve = null;
            pendingSeekReject = null;

            if (state) {
                state.videoSeeking = false;
            }

            rejectSeek(
                error instanceof Error
                    ? error
                    : new Error(
                        "Video seek failed."
                    )
            );
        };

        const onSeeked = () => {
            cleanup();

            finish();
        };

        const onError = () => {
            cleanup();

            fail(
                new Error(
                    "Unable to seek video."
                )
            );
        };

        const cleanup = () => {
            sourceVideo.removeEventListener(
                "seeked",
                onSeeked
            );

            sourceVideo.removeEventListener(
                "error",
                onError
            );
        };

        if (state) {
            state.videoSeeking = true;
        }

        sourceVideo.addEventListener(
            "seeked",
            onSeeked,
            {
                once: true
            }
        );

        sourceVideo.addEventListener(
            "error",
            onError,
            {
                once: true
            }
        );

        try {
            sourceVideo.currentTime =
                target;
        } catch (error) {
            cleanup();

            fail(error);
        }
    });
}


/* =========================================================
   CURRENT FRAME / TIME
   ========================================================= */

export function getCurrentFrame() {
    if (!state) return 0;

    if (state.mediaType !== "video") {
        return 0;
    }

    return Number.isFinite(
        Number(state.currentFrame)
    )
        ? Number(state.currentFrame)
        : timeToFrame(
            getCurrentTime()
        );
}


export function getCurrentTime() {
    if (
        sourceVideo &&
        state &&
        state.mediaType === "video"
    ) {
        return Number.isFinite(
            sourceVideo.currentTime
        )
            ? sourceVideo.currentTime
            : 0;
    }

    return state &&
        Number.isFinite(
            Number(state.currentTime)
        )
        ? Number(state.currentTime)
        : 0;
}


/* =========================================================
   FRAME / TIME CONVERSION
   ========================================================= */

function getFPS() {
    if (
        state &&
        Number.isFinite(
            Number(state.fps)
        ) &&
        Number(state.fps) > 0
    ) {
        return Number(state.fps);
    }

    return 30;
}


function getVideoFPS(file) {
    /*
     * Browser File objects normally do not expose FPS.
     * Keep the configured/default FPS instead of making
     * unreliable guesses.
     */
    if (
        state &&
        Number.isFinite(
            Number(state.fps)
        ) &&
        Number(state.fps) > 0
    ) {
        return Number(state.fps);
    }

    return 30;
}


export function frameToTime(frame) {
    const fps = getFPS();

    return Math.max(
        0,
        Number(frame || 0) / fps
    );
}


export function timeToFrame(time) {
    const fps = getFPS();

    return Math.max(
        0,
        Math.round(
            Number(time || 0) * fps
        )
    );
}


/* =========================================================
   FRAME NAVIGATION
   ========================================================= */

export async function nextFrame() {
    if (
        !sourceVideo ||
        !state ||
        state.mediaType !== "video"
    ) {
        return;
    }

    const current =
        getCurrentFrame();

    const total =
        Math.max(
            1,
            Number(state.totalFrames || 1)
        );

    const next =
        Math.min(
            total - 1,
            current + 1
        );

    await goToFrame(next);
}


export async function previousFrame() {
    if (
        !sourceVideo ||
        !state ||
        state.mediaType !== "video"
    ) {
        return;
    }

    const current =
        getCurrentFrame();

    const previous =
        Math.max(
            0,
            current - 1
        );

    await goToFrame(previous);
}


export async function firstFrame() {
    if (
        !sourceVideo ||
        !state ||
        state.mediaType !== "video"
    ) {
        return;
    }

    await goToFrame(0);
}


export async function lastFrame() {
    if (
        !sourceVideo ||
        !state ||
        state.mediaType !== "video"
    ) {
        return;
    }

    const total =
        Math.max(
            1,
            Number(state.totalFrames || 1)
        );

    await goToFrame(
        total - 1
    );
}


export async function goToFrame(frame) {
    if (
        !sourceVideo ||
        !state ||
        state.mediaType !== "video"
    ) {
        return;
    }

    const total =
        Math.max(
            1,
            Number(state.totalFrames || 1)
        );

    const targetFrame =
        Math.max(
            0,
            Math.min(
                total - 1,
                Math.round(
                    Number(frame) || 0
                )
            )
        );

    /*
     * Save annotations belonging to the current frame
     * before changing frames.
     */
    try {
        saveFrame();
    } catch (_) {
        // Ignore.
    }

    const targetTime =
        frameToTime(
            targetFrame
        );

    try {
        await seekVideoFrame(
            targetTime
        );
    } catch (error) {
        console.warn(
            "[media.js] Frame navigation failed:",
            error
        );

        return;
    }

    if (state) {
        state.currentFrame =
            targetFrame;

        state.currentTime =
            sourceVideo.currentTime;
    }

    try {
        loadFrame();
    } catch (_) {
        // Ignore.
    }

    try {
        await captureVideoFrame(
            sourceVideo.currentTime
        );
    } catch (_) {
        // Ignore.
    }

    updateMediaUI();

    updateFilmstripSelection(
        targetFrame
    );

    emitMediaEvent(
        "media:framechange",
        {
            frame: targetFrame,
            time: sourceVideo.currentTime
        }
    );
}


/* =========================================================
   VIDEO PLAYBACK
   ========================================================= */

export async function playVideo() {
    if (
        !sourceVideo ||
        !mediaReady ||
        !state ||
        state.mediaType !== "video"
    ) {
        return;
    }

    try {
        await sourceVideo.play();

        if (state) {
            state.videoPlaying = true;
        }

        updatePlayPauseUI();

        emitMediaEvent(
            "media:play"
        );
    } catch (error) {
        console.warn(
            "[media.js] Video play failed:",
            error
        );
    }
}


export function pauseVideo() {
    if (!sourceVideo) return;

    try {
        sourceVideo.pause();
    } catch (_) {
        // Ignore.
    }

    if (state) {
        state.videoPlaying = false;
    }

    updatePlayPauseUI();

    emitMediaEvent(
        "media:pause"
    );
}


export async function toggleVideoPlayback() {
    if (!sourceVideo) return;

    if (sourceVideo.paused) {
        await playVideo();
    } else {
        pauseVideo();
    }
}


export function stopVideo() {
    if (!sourceVideo) return;

    try {
        sourceVideo.pause();
        sourceVideo.currentTime = 0;
    } catch (_) {
        // Ignore.
    }

    if (state) {
        state.videoPlaying = false;
        state.currentTime = 0;
        state.currentFrame = 0;
    }

    updatePlayPauseUI();
    updateMediaUI();

    emitMediaEvent(
        "media:stop"
    );
}


/* =========================================================
   VIDEO EVENTS
   ========================================================= */

function bindVideoEvents() {
    if (
        !sourceVideo ||
        mediaListenersBound
    ) {
        return;
    }

    mediaListenersBound = true;

    sourceVideo.addEventListener(
        "loadedmetadata",
        handleVideoLoadedMetadata
    );

    sourceVideo.addEventListener(
        "loadeddata",
        handleVideoLoadedData
    );

    sourceVideo.addEventListener(
        "timeupdate",
        handleVideoTimeUpdate
    );

    sourceVideo.addEventListener(
        "play",
        handleVideoPlay
    );

    sourceVideo.addEventListener(
        "pause",
        handleVideoPause
    );

    sourceVideo.addEventListener(
        "ended",
        handleVideoEnded
    );

    sourceVideo.addEventListener(
        "seeking",
        handleVideoSeeking
    );

    sourceVideo.addEventListener(
        "seeked",
        handleVideoSeeked
    );

    sourceVideo.addEventListener(
        "durationchange",
        handleVideoDurationChange
    );

    sourceVideo.addEventListener(
        "error",
        handleVideoError
    );

    sourceVideo.addEventListener(
        "progress",
        handleVideoProgress
    );
}


function handleVideoLoadedMetadata() {
    if (!sourceVideo) return;

    const duration =
        Number.isFinite(
            sourceVideo.duration
        )
            ? sourceVideo.duration
            : 0;

    if (state) {
        state.videoDuration =
            duration;

        if (
            !Number.isFinite(
                Number(state.fps)
            ) ||
            Number(state.fps) <= 0
        ) {
            state.fps = 30;
        }

        state.totalFrames =
            Math.max(
                1,
                Math.round(
                    duration *
                    Number(state.fps)
                )
            );
    }

    updateMediaUI();
}


function handleVideoLoadedData() {
    mediaReady = true;

    showElement(
        emptyWorkspace,
        false
    );

    resizeCanvas();

    updateMediaUI();
}


function handleVideoTimeUpdate() {
    if (!sourceVideo) return;

    const time =
        sourceVideo.currentTime || 0;

    if (state) {
        state.currentTime = time;

        state.currentFrame =
            timeToFrame(time);

        state.videoPlaying =
            !sourceVideo.paused;
    }

    updateTimeUI();

    updateFilmstripPosition(
        time
    );

    /*
     * Keep canvas synchronized with the current
     * video frame when possible.
     */
    if (
        canvas &&
        ctx &&
        state &&
        state.mediaType === "video" &&
        !frameCaptureBusy
    ) {
        try {
            if (
                sourceVideo.readyState >=
                HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
                if (
                    canvas.width !==
                    sourceVideo.videoWidth ||
                    canvas.height !==
                    sourceVideo.videoHeight
                ) {
                    canvas.width =
                        sourceVideo.videoWidth ||
                        canvas.width;

                    canvas.height =
                        sourceVideo.videoHeight ||
                        canvas.height;
                }

                if (
                    sourceVideo.videoWidth &&
                    sourceVideo.videoHeight
                ) {
                    ctx.clearRect(
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );

                    ctx.drawImage(
                        sourceVideo,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );
                }
            }
        } catch (_) {
            // Ignore drawing race conditions.
        }
    }

    try {
        render();
    } catch (_) {
        // Ignore.
    }

    emitMediaEvent(
        "media:timeupdate",
        {
            time,
            frame:
                state
                    ? state.currentFrame
                    : timeToFrame(time)
        }
    );
}


function handleVideoPlay() {
    if (state) {
        state.videoPlaying = true;
    }

    updatePlayPauseUI();
}


function handleVideoPause() {
    if (state) {
        state.videoPlaying = false;
    }

    updatePlayPauseUI();
}


function handleVideoEnded() {
    if (state) {
        state.videoPlaying = false;

        if (
            sourceVideo &&
            Number.isFinite(
                sourceVideo.duration
            )
        ) {
            state.currentTime =
                sourceVideo.duration;

            state.currentFrame =
                timeToFrame(
                    sourceVideo.duration
                );
        }
    }

    updatePlayPauseUI();
    updateMediaUI();

    emitMediaEvent(
        "media:ended"
    );
}


function handleVideoSeeking() {
    if (state) {
        state.videoSeeking = true;
    }

    emitMediaEvent(
        "media:seeking"
    );
}


function handleVideoSeeked() {
    if (!sourceVideo) return;

    if (state) {
        state.videoSeeking = false;

        state.currentTime =
            sourceVideo.currentTime;

        state.currentFrame =
            timeToFrame(
                sourceVideo.currentTime
            );
    }

    updateMediaUI();

    emitMediaEvent(
        "media:seeked",
        {
            time: sourceVideo.currentTime,
            frame:
                state
                    ? state.currentFrame
                    : 0
        }
    );
}


function handleVideoDurationChange() {
    if (!sourceVideo) return;

    const duration =
        Number.isFinite(
            sourceVideo.duration
        )
            ? sourceVideo.duration
            : 0;

    if (state) {
        state.videoDuration =
            duration;

        state.totalFrames =
            Math.max(
                1,
                Math.round(
                    duration *
                    getFPS()
                )
            );
    }

    updateMediaUI();
}


function handleVideoError(event) {
    console.error(
        "[media.js] Video error:",
        event
    );

    showMediaError(
        "The video could not be played or loaded."
    );
}


function handleVideoProgress() {
    updateMediaUI();
}


/* =========================================================
   TIME DISPLAY
   ========================================================= */

export function formatTime(seconds) {
    const value =
        Number.isFinite(
            Number(seconds)
        )
            ? Math.max(
                0,
                Number(seconds)
            )
            : 0;

    const hours =
        Math.floor(
            value / 3600
        );

    const minutes =
        Math.floor(
            (value % 3600) / 60
        );

    const secs =
        Math.floor(
            value % 60
        );

    const milliseconds =
        Math.floor(
            (value % 1) * 1000
        );

    if (hours > 0) {
        return (
            String(hours).padStart(2, "0") +
            ":" +
            String(minutes).padStart(2, "0") +
            ":" +
            String(secs).padStart(2, "0")
        );
    }

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0")
    );
}


function updateTimeUI() {
    const current =
        getCurrentTime();

    const duration =
        sourceVideo &&
        Number.isFinite(
            sourceVideo.duration
        )
            ? sourceVideo.duration
            : state &&
                Number.isFinite(
                    Number(state.videoDuration)
                )
                ? Number(state.videoDuration)
                : 0;

    setText(
        currentTimeLabel,
        formatTime(current)
    );

    setText(
        durationLabel,
        formatTime(duration)
    );

    if (frameSlider) {
        const total =
            Math.max(
                1,
                Number(
                    state?.totalFrames || 1
                )
            );

        const frame =
            Math.max(
                0,
                Math.min(
                    total - 1,
                    getCurrentFrame()
                )
            );

        frameSlider.max =
            String(
                Math.max(
                    0,
                    total - 1
                )
            );

        frameSlider.value =
            String(frame);
    }
}


/* =========================================================
   VIDEO UI
   ========================================================= */

function updatePlayPauseUI() {
    const playing =
        sourceVideo &&
        !sourceVideo.paused;

    if (!playPauseButton) return;

    const text =
        playing
            ? "Pause"
            : "Play";

    /*
     * Preserve icon-only buttons if they have
     * data attributes indicating that behavior.
     */
    if (
        playPauseButton.dataset &&
        playPauseButton.dataset.iconOnly === "true"
    ) {
        playPauseButton.setAttribute(
            "aria-label",
            text
        );

        playPauseButton.title =
            text;

        return;
    }

    playPauseButton.textContent =
        text;

    playPauseButton.setAttribute(
        "aria-label",
        text
    );
}


function updateMediaUI() {
    const hasMedia =
        Boolean(
            state &&
            state.mediaType
        );

    const isVideo =
        Boolean(
            hasMedia &&
            state.mediaType === "video"
        );

    showElement(
        videoControls,
        isVideo
    );

    if (frameSlider) {
        frameSlider.disabled =
            !isVideo;
    }

    if (previousFrameButton) {
        previousFrameButton.disabled =
            !isVideo;
    }

    if (nextFrameButton) {
        nextFrameButton.disabled =
            !isVideo;
    }

    if (firstFrameButton) {
        firstFrameButton.disabled =
            !isVideo;
    }

    if (lastFrameButton) {
        lastFrameButton.disabled =
            !isVideo;
    }

    if (stopButton) {
        stopButton.disabled =
            !isVideo;
    }

    if (playPauseButton) {
        playPauseButton.disabled =
            !isVideo;
    }

    if (fpsLabel) {
        setText(
            fpsLabel,
            isVideo
                ? `${getFPS()} FPS`
                : ""
        );
    }

    updateTimeUI();
    updatePlayPauseUI();
}


/* =========================================================
   FILMSTRIP
   ========================================================= */

export async function generateFilmstrip(
    count = 12
) {
    if (
        !sourceVideo ||
        !state ||
        state.mediaType !== "video" ||
        !mediaReady
    ) {
        return;
    }

    if (
        !Number.isFinite(
            sourceVideo.duration
        ) ||
        sourceVideo.duration <= 0
    ) {
        return;
    }

    if (!filmstripTrack) {
        return;
    }

    filmstripCancelled = false;

    filmstripGenerating = true;

    showElement(
        filmstripBar,
        true
    );

    filmstripTrack.innerHTML = "";

    const duration =
        sourceVideo.duration;

    const itemCount =
        Math.max(
            1,
            Math.min(
                50,
                Number(count) || 12
            )
        );

    const originalTime =
        sourceVideo.currentTime;

    const wasPlaying =
        !sourceVideo.paused;

    try {
        if (wasPlaying) {
            sourceVideo.pause();
        }

        for (
            let index = 0;
            index < itemCount;
            index++
        ) {
            if (filmstripCancelled) {
                break;
            }

            const ratio =
                itemCount === 1
                    ? 0
                    : index /
                    (itemCount - 1);

            const time =
                duration * ratio;

            try {
                await seekVideoFrame(
                    time
                );
            } catch (_) {
                continue;
            }

            if (filmstripCancelled) {
                break;
            }

            const thumb =
                createFilmstripThumbnail(
                    sourceVideo,
                    index,
                    time
                );

            if (thumb) {
                filmstripTrack.appendChild(
                    thumb
                );
            }
        }
    } finally {
        /*
         * Restore the user's original playback position.
         */
        if (
            sourceVideo &&
            Number.isFinite(originalTime)
        ) {
            try {
                await seekVideoFrame(
                    originalTime
                );
            } catch (_) {
                // Ignore restoration errors.
            }
        }

        if (wasPlaying) {
            try {
                await sourceVideo.play();
            } catch (_) {
                // Ignore.
            }
        }

        filmstripGenerating = false;

        updateFilmstripSelection(
            getCurrentFrame()
        );

        updateMediaUI();
    }
}


function createFilmstripThumbnail(
    video,
    index,
    time
) {
    if (
        !video ||
        !video.videoWidth ||
        !video.videoHeight
    ) {
        return null;
    }

    const item =
        document.createElement("button");

    item.type = "button";

    item.className =
        "filmstrip-item";

    item.dataset.index =
        String(index);

    item.dataset.time =
        String(time);

    const thumbnail =
        document.createElement("canvas");

    thumbnail.className =
        "filmstrip-thumbnail";

    const width = 120;

    const ratio =
        video.videoHeight /
        video.videoWidth;

    const height =
        Math.max(
            1,
            Math.round(
                width * ratio
            )
        );

    thumbnail.width =
        width;

    thumbnail.height =
        height;

    const thumbnailContext =
        thumbnail.getContext("2d");

    if (thumbnailContext) {
        try {
            thumbnailContext.drawImage(
                video,
                0,
                0,
                width,
                height
            );
        } catch (_) {
            // Ignore.
        }
    }

    item.appendChild(
        thumbnail
    );

    const label =
        document.createElement("span");

    label.className =
        "filmstrip-item-label";

    label.textContent =
        formatTime(time);

    item.appendChild(
        label
    );

    item.addEventListener(
        "click",
        async () => {
            const targetTime =
                Number(
                    item.dataset.time
                );

            if (
                Number.isFinite(
                    targetTime
                )
            ) {
                await seekVideoFrame(
                    targetTime
                );

                if (state) {
                    state.currentFrame =
                        timeToFrame(
                            targetTime
                        );
                }

                try {
                    loadFrame();
                } catch (_) {
                    // Ignore.
                }

                try {
                    await captureVideoFrame(
                        targetTime
                    );
                } catch (_) {
                    // Ignore.
                }

                updateFilmstripSelection(
                    state
                        ? state.currentFrame
                        : 0
                );
            }
        }
    );

    return item;
}


/* =========================================================
   FILMSTRIP SELECTION
   ========================================================= */

function updateFilmstripSelection(
    frame
) {
    if (!filmstripTrack) return;

    const items =
        filmstripTrack.querySelectorAll(
            ".filmstrip-item"
        );

    if (!items.length) return;

    const total =
        Math.max(
            1,
            Number(
                state?.totalFrames || 1
            )
        );

    const ratio =
        total <= 1
            ? 0
            : Math.max(
                0,
                Math.min(
                    1,
                    Number(frame || 0) /
                    (total - 1)
                )
            );

    let closestItem = null;
    let closestDistance = Infinity;

    items.forEach(item => {
        const itemIndex =
            Number(
                item.dataset.index
            );

        const itemRatio =
            items.length <= 1
                ? 0
                : itemIndex /
                (items.length - 1);

        const distance =
            Math.abs(
                itemRatio -
                ratio
            );

        item.classList.remove(
            "active"
        );

        if (
            distance <
            closestDistance
        ) {
            closestDistance =
                distance;

            closestItem =
                item;
        }
    });

    if (closestItem) {
        closestItem.classList.add(
            "active"
        );

        if (
            filmstripCurrentLabel
        ) {
            setText(
                filmstripCurrentLabel,
                formatTime(
                    frameToTime(
                        Number(frame || 0)
                    )
                )
            );
        }
    }
}


/* =========================================================
   FILMSTRIP POSITION
   ========================================================= */

function updateFilmstripPosition(
    time
) {
    if (!filmstripTrack) return;

    const duration =
        sourceVideo &&
        Number.isFinite(
            sourceVideo.duration
        )
            ? sourceVideo.duration
            : 0;

    if (duration <= 0) return;

    const ratio =
        Math.max(
            0,
            Math.min(
                1,
                Number(time || 0) /
                duration
            )
        );

    const items =
        filmstripTrack.querySelectorAll(
            ".filmstrip-item"
        );

    if (!items.length) return;

    const index =
        Math.round(
            ratio *
            (items.length - 1)
        );

    updateFilmstripSelection(
        timeToFrame(
            Number(time || 0)
        )
    );

    const active =
        items[index];

    if (active) {
        /*
         * Avoid aggressively scrolling the strip
         * during normal playback.
         */
        const left =
            active.offsetLeft;

        const right =
            left +
            active.offsetWidth;

        const viewportWidth =
            filmstripTrack.clientWidth;

        if (
            left <
            filmstripTrack.scrollLeft
        ) {
            filmstripTrack.scrollLeft =
                left;
        } else if (
            right >
            filmstripTrack.scrollLeft +
            viewportWidth
        ) {
            filmstripTrack.scrollLeft =
                right -
                viewportWidth;
        }
    }
}


/* =========================================================
   FILMSTRIP LABELS
   ========================================================= */

function updateFilmstripLabels() {
    if (!state) return;

    const current =
        getCurrentFrame();

    const total =
        Math.max(
            1,
            Number(
                state.totalFrames || 1
            )
        );

    setText(
        filmstripLabel,
        `Frame ${current + 1} / ${total}`
    );

    setText(
        filmstripCurrentLabel,
        formatTime(
            getCurrentTime()
        )
    );
}


/* =========================================================
   FRAME SLIDER
   ========================================================= */

function bindFrameSlider() {
    if (!frameSlider) return;

    frameSlider.addEventListener(
        "input",
        () => {
            if (
                !state ||
                state.mediaType !== "video"
            ) {
                return;
            }

            const frame =
                Number(
                    frameSlider.value
                );

            if (
                Number.isFinite(frame)
            ) {
                /*
                 * Input slider is intentionally previewed
                 * immediately; final frame loading happens
                 * when the value changes.
                 */
                state.currentFrame =
                    frame;

                state.currentTime =
                    frameToTime(
                        frame
                    );

                updateFilmstripSelection(
                    frame
                );

                updateTimeUI();
            }
        }
    );

    frameSlider.addEventListener(
        "change",
        async () => {
            if (
                !state ||
                state.mediaType !== "video"
            ) {
                return;
            }

            await goToFrame(
                Number(
                    frameSlider.value
                )
            );
        }
    );
}


/* =========================================================
   PLAYBACK BUTTONS
   ========================================================= */

function bindPlaybackButtons() {
    if (playPauseButton) {
        playPauseButton.addEventListener(
            "click",
            toggleVideoPlayback
        );
    }

    if (previousFrameButton) {
        previousFrameButton.addEventListener(
            "click",
            previousFrame
        );
    }

    if (nextFrameButton) {
        nextFrameButton.addEventListener(
            "click",
            nextFrame
        );
    }

    if (firstFrameButton) {
        firstFrameButton.addEventListener(
            "click",
            firstFrame
        );
    }

    if (lastFrameButton) {
        lastFrameButton.addEventListener(
            "click",
            lastFrame
        );
    }

    if (stopButton) {
        stopButton.addEventListener(
            "click",
            stopVideo
        );
    }
}


/* =========================================================
   KEYBOARD CONTROLS
   ========================================================= */

function bindKeyboardControls() {
    document.addEventListener(
        "keydown",
        async event => {
            if (
                !state ||
                state.mediaType !== "video"
            ) {
                return;
            }

            /*
             * Do not interfere with text inputs,
             * textareas, selects, or contenteditable areas.
             */
            const target =
                event.target;

            if (
                target &&
                (
                    target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable
                )
            ) {
                return;
            }

            if (
                event.key === "ArrowRight"
            ) {
                event.preventDefault();

                if (
                    event.shiftKey
                ) {
                    await goToFrame(
                        getCurrentFrame() + 10
                    );
                } else {
                    await nextFrame();
                }

                return;
            }

            if (
                event.key === "ArrowLeft"
            ) {
                event.preventDefault();

                if (
                    event.shiftKey
                ) {
                    await goToFrame(
                        getCurrentFrame() - 10
                    );
                } else {
                    await previousFrame();
                }

                return;
            }

            if (
                event.key === "Home"
            ) {
                event.preventDefault();

                await firstFrame();

                return;
            }

            if (
                event.key === "End"
            ) {
                event.preventDefault();

                await lastFrame();

                return;
            }

            if (
                event.code === "Space"
            ) {
                event.preventDefault();

                await toggleVideoPlayback();

                return;
            }
        }
    );
}


/* =========================================================
   RESIZE OBSERVER
   ========================================================= */

function bindResizeObserver() {
    if (!canvas) return;

    if (
        typeof ResizeObserver ===
        "function"
    ) {
        resizeObserver =
            new ResizeObserver(
                () => {
                    resizeCanvas();
                }
            );

        resizeObserver.observe(
            canvas
        );

        if (
            canvas.parentElement
        ) {
            resizeObserver.observe(
                canvas.parentElement
            );
        }
    }

    window.addEventListener(
        "resize",
        resizeCanvas
    );
}


/* =========================================================
   EXTERNAL MEDIA EVENTS
   ========================================================= */

function bindExternalMediaEvents() {
    document.addEventListener(
        "annotation:media-load",
        async event => {
            const file =
                event?.detail?.file;

            if (!file) return;

            try {
                await loadMediaFile(
                    file
                );
            } catch (error) {
                console.error(
                    "[media.js] External media load failed:",
                    error
                );

                showMediaError(
                    error.message ||
                    "Unable to load media."
                );
            }
        }
    );
}


/* =========================================================
   GENERIC MEDIA EVENT EMITTER
   ========================================================= */

function emitMediaEvent(
    name,
    detail = {}
) {
    try {
        document.dispatchEvent(
            new CustomEvent(
                name,
                {
                    detail
                }
            )
        );
    } catch (_) {
        // Ignore CustomEvent errors.
    }

    try {
        emit(
            name,
            detail
        );
    } catch (_) {
        // The annotation module may use a different
        // event-emitter signature.
    }
}


/* =========================================================
   MEDIA ERROR
   ========================================================= */

function showMediaError(
    message
) {
    const text =
        message ||
        "Unable to load media.";

    console.error(
        "[media.js]",
        text
    );

    /*
     * Use an existing toast system if available.
     */
    const toastContainer =
        $("toastContainer");

    if (toastContainer) {
        const toast =
            document.createElement(
                "div"
            );

        toast.className =
            "toast toast-error";

        toast.textContent =
            text;

        toastContainer.appendChild(
            toast
        );

        window.setTimeout(
            () => {
                toast.remove();
            },
            5000
        );

        return;
    }

    /*
     * Fallback: log only. Do not use alert(),
     * because alerts interrupt annotation work.
     */
}


/* =========================================================
   COMPATIBILITY GLOBALS
   ========================================================= */

window.mediaModule = {
    loadMediaFile,
    loadImageFile,
    loadVideoFile,
    cleanupMedia,
    resizeCanvas,
    captureVideoFrame,
    seekVideoFrame,
    getCurrentFrame,
    getCurrentTime,
    frameToTime,
    timeToFrame,
    nextFrame,
    previousFrame,
    firstFrame,
    lastFrame,
    goToFrame,
    playVideo,
    pauseVideo,
    toggleVideoPlayback,
    stopVideo,
    generateFilmstrip,
    formatTime
};


/*
 * Compatibility aliases used by older parts of the app.
 */
window.loadMediaFile =
    loadMediaFile;

window.loadImageFile =
    loadImageFile;

window.loadVideoFile =
    loadVideoFile;

window.cleanupMedia =
    cleanupMedia;

window.captureVideoFrame =
    captureVideoFrame;

window.seekVideoFrame =
    seekVideoFrame;

window.nextFrame =
    nextFrame;

window.previousFrame =
    previousFrame;

window.firstFrame =
    firstFrame;

window.lastFrame =
    lastFrame;

window.goToFrame =
    goToFrame;

window.playVideo =
    playVideo;

window.pauseVideo =
    pauseVideo;

window.toggleVideoPlayback =
    toggleVideoPlayback;

window.stopVideo =
    stopVideo;


/* =========================================================
   INITIALIZATION
   ========================================================= */

export function initializeMedia() {
    if (mediaInitialized) {
        return;
    }

    mediaInitialized = true;

    bindMediaInput();

    bindDragAndDrop();

    bindVideoEvents();

    bindFrameSlider();

    bindPlaybackButtons();

    bindKeyboardControls();

    bindResizeObserver();

    bindExternalMediaEvents();

    updateMediaUI();

    updateFilmstripLabels();

    if (canvas) {
        resizeCanvas();
    }

    emitMediaEvent(
        "media:initialized"
    );
}


/* =========================================================
   DOM READY
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeMedia,
        {
            once: true
        }
    );
} else {
    initializeMedia();
}


/* =========================================================
   EXPORTS
   ========================================================= */

export {
    state
};
