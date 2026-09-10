// ============================================================
// ANNOTATION AI
// PART 3 — js/media.js
// MEDIA / IMAGE / VIDEO / FRAME HANDLING
// ============================================================

import {
    state,
    $,
    canvas,
    ctx,
    emit,
    saveFrame,
    loadFrame,
    clearFrameAnnotations,
    render,
    updateCounts,
    updateAnnotationsList
} from "./annotation.js";


// ============================================================
// DOM REFERENCES
// ============================================================

const mediaInput =
    $("mediaInput") ||
    $("workbenchUpload") ||
    $("customerUploadPanel");

const sourceVideo =
    $("sourceVideo");

const annotationCanvas =
    $("annotationCanvas");

const emptyWorkspace =
    $("emptyWorkspace");

const filmstripBar =
    $("filmstripBar");

const filmstripTrack =
    $("filmstripTrack");

const filmstripLabel =
    $("filmstripLabel");

const filmstripCurrentLabel =
    $("filmstripCurrentLabel");


// ============================================================
// INTERNAL MEDIA STATE
// ============================================================

let objectURL = null;

let videoSeekRequest = null;

let videoFrameTimer = null;

let filmstripImages = [];

let filmstripGenerating = false;

let mediaLoadToken = 0;

let resizeObserver = null;


// ============================================================
// SAFE ELEMENT HELPERS
// ============================================================

function showElement(el, show = true) {
    if (!el) return;

    el.style.display = show ? "" : "none";
}


function setText(el, text) {
    if (!el) return;

    el.textContent = text;
}


function revokeObjectURL() {
    if (!objectURL) return;

    try {
        URL.revokeObjectURL(objectURL);
    } catch (_) {
        // Ignore cleanup errors.
    }

    objectURL = null;
}


// ============================================================
// MEDIA TYPE
// ============================================================

function detectMediaType(file) {
    if (!file) return null;

    const type = String(file.type || "").toLowerCase();

    if (type.startsWith("video/")) {
        return "video";
    }

    if (type.startsWith("image/")) {
        return "image";
    }

    const name =
        String(file.name || "").toLowerCase();

    if (/\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i.test(name)) {
        return "video";
    }

    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) {
        return "image";
    }

    return null;
}


// ============================================================
// MEDIA CLEANUP
// ============================================================

export function cleanupMedia() {
    mediaLoadToken += 1;

    stopVideoPlayback();

    if (videoSeekRequest) {
        try {
            videoSeekRequest();
        } catch (_) {
            // Ignore.
        }

        videoSeekRequest = null;
    }

    if (videoFrameTimer) {
        clearTimeout(videoFrameTimer);
        videoFrameTimer = null;
    }

    filmstripImages = [];
    filmstripGenerating = false;

    revokeObjectURL();

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

        sourceVideo.style.display = "none";
    }

    if (state.image) {
        try {
            state.image.onload = null;
            state.image.onerror = null;
        } catch (_) {
            // Ignore.
        }
    }

    state.image = null;
    state.imageURL = null;
    state.videoURL = null;

    state.videoDuration = 0;
    state.fps = 30;
    state.currentFrame = 0;
    state.totalFrames = 0;
    state.currentTime = 0;

    state.videoPlaying = false;
    state.videoSeeking = false;
    state.frameCaptureBusy = false;
    state.pendingVideoRestore = null;

    clearFrameAnnotations();

    if (filmstripTrack) {
        filmstripTrack.innerHTML = "";
    }

    showElement(filmstripBar, false);

    showElement(emptyWorkspace, true);

    if (annotationCanvas) {
        annotationCanvas.style.display = "";
    }

    if (ctx && canvas) {
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

    updateCounts();
    updateAnnotationsList();

    render();
}


// ============================================================
// RESET ANNOTATION STATE FOR NEW MEDIA
// ============================================================

function resetAnnotationsForNewMedia() {
    state.annotations = [];
    state.selectedId = null;
    state.hoveredId = null;

    state.nextId = 1;

    state.history = [];
    state.historyIndex = -1;

    state.drawing = false;
    state.drawStart = null;
    state.drawCurrent = null;

    state.polygonPoints = [];

    clearFrameAnnotations();

    updateCounts();
    updateAnnotationsList();
}


// ============================================================
// LOAD IMAGE FILE
// ============================================================

export function loadImageFile(file) {
    if (!file) return Promise.resolve(false);

    const mediaType = detectMediaType(file);

    if (mediaType !== "image") {
        return Promise.resolve(false);
    }

    const token = ++mediaLoadToken;

    cleanupMedia();

    resetAnnotationsForNewMedia();

    state.mediaType = "image";

    const url = URL.createObjectURL(file);

    objectURL = url;

    state.imageURL = url;

    return new Promise((resolve) => {
        const image = new Image();

        image.onload = () => {
            if (token !== mediaLoadToken) {
                resolve(false);
                return;
            }

            state.image = image;

            state.imageURL = url;

            state.videoURL = null;

            state.videoDuration = 0;

            state.currentFrame = 0;

            state.totalFrames = 1;

            state.currentTime = 0;

            state.videoPlaying = false;

            showElement(emptyWorkspace, false);

            if (sourceVideo) {
                sourceVideo.style.display = "none";
            }

            if (annotationCanvas) {
                annotationCanvas.style.display = "";
            }

            resizeCanvasToMedia();

            render();

            emit("mediaLoaded", {
                type: "image",
                file,
                width: image.naturalWidth || image.width,
                height: image.naturalHeight || image.height
            });

            resolve(true);
        };

        image.onerror = () => {
            if (token === mediaLoadToken) {
                state.image = null;
                state.imageURL = null;

                revokeObjectURL();

                showElement(emptyWorkspace, true);

                render();
            }

            resolve(false);
        };

        image.src = url;
    });
}


// ============================================================
// LOAD VIDEO FILE
// ============================================================

export function loadVideoFile(file) {
    if (!file) return Promise.resolve(false);

    const mediaType = detectMediaType(file);

    if (mediaType !== "video") {
        return Promise.resolve(false);
    }

    const token = ++mediaLoadToken;

    cleanupMedia();

    resetAnnotationsForNewMedia();

    state.mediaType = "video";

    const url = URL.createObjectURL(file);

    objectURL = url;

    state.videoURL = url;

    state.imageURL = null;

    return new Promise((resolve) => {
        if (!sourceVideo) {
            resolve(false);
            return;
        }

        sourceVideo.style.display = "";

        sourceVideo.muted = true;

        sourceVideo.playsInline = true;

        sourceVideo.preload = "auto";

        sourceVideo.src = url;

        const loaded = () => {
            if (token !== mediaLoadToken) {
                resolve(false);
                return;
            }

            const duration =
                Number(sourceVideo.duration);

            state.videoDuration =
                Number.isFinite(duration)
                    ? duration
                    : 0;

            state.fps =
                state.fps > 0
                    ? state.fps
                    : 30;

            state.totalFrames =
                Math.max(
                    1,
                    Math.round(
                        state.videoDuration *
                        state.fps
                    )
                );

            state.currentFrame = 0;

            state.currentTime = 0;

            state.videoPlaying = false;

            showElement(emptyWorkspace, false);

            if (annotationCanvas) {
                annotationCanvas.style.display = "";
            }

            resizeCanvasToMedia();

            render();

            updateFilmstrip();

            emit("mediaLoaded", {
                type: "video",
                file,
                duration: state.videoDuration,
                fps: state.fps
            });

            resolve(true);
        };

        const error = () => {
            if (token !== mediaLoadToken) {
                resolve(false);
                return;
            }

            state.videoURL = null;

            showElement(emptyWorkspace, true);

            render();

            resolve(false);
        };

        sourceVideo.addEventListener(
            "loadedmetadata",
            loaded,
            { once: true }
        );

        sourceVideo.addEventListener(
            "error",
            error,
            { once: true }
        );

        try {
            sourceVideo.load();
        } catch (_) {
            // Ignore.
        }
    });
}


// ============================================================
// LOAD MEDIA FILE
// ============================================================

export async function loadMediaFile(file) {
    if (!file) return false;

    const type = detectMediaType(file);

    if (type === "image") {
        return loadImageFile(file);
    }

    if (type === "video") {
        return loadVideoFile(file);
    }

    emit("mediaError", {
        message:
            "Unsupported media type."
    });

    return false;
}


// ============================================================
// FILE INPUT
// ============================================================

function bindMediaInput() {
    const input =
        $("mediaInput");

    if (!input) return;

    input.addEventListener(
        "change",
        async (event) => {
            const files =
                event.target.files;

            if (!files || !files.length) {
                return;
            }

            const file = files[0];

            await loadMediaFile(file);

            // Allow selecting the same file again.
            try {
                input.value = "";
            } catch (_) {
                // Ignore.
            }
        }
    );
}


// ============================================================
// DRAG & DROP
// ============================================================

function bindDragAndDrop() {
    const dropTargets = [
        $("canvasWorkspace"),
        $("coworkerWorkbench"),
        $("workbenchUpload"),
        $("annotationCanvas")
    ].filter(Boolean);

    if (!dropTargets.length) return;

    for (const target of dropTargets) {
        target.addEventListener(
            "dragover",
            (event) => {
                event.preventDefault();

                target.classList.add(
                    "drag-over"
                );
            }
        );

        target.addEventListener(
            "dragleave",
            () => {
                target.classList.remove(
                    "drag-over"
                );
            }
        );

        target.addEventListener(
            "drop",
            async (event) => {
                event.preventDefault();

                target.classList.remove(
                    "drag-over"
                );

                const files =
                    event.dataTransfer?.files;

                if (!files || !files.length) {
                    return;
                }

                await loadMediaFile(
                    files[0]
                );
            }
        );
    }
}


// ============================================================
// CANVAS MEDIA SIZE
// ============================================================

export function resizeCanvasToMedia() {
    if (!canvas) return;

    let width = 1;
    let height = 1;

    if (
        state.mediaType === "image" &&
        state.image
    ) {
        width =
            state.image.naturalWidth ||
            state.image.width ||
            1;

        height =
            state.image.naturalHeight ||
            state.image.height ||
            1;
    }

    else if (
        state.mediaType === "video" &&
        sourceVideo
    ) {
        width =
            sourceVideo.videoWidth ||
            1;

        height =
            sourceVideo.videoHeight ||
            1;
    }

    canvas.width = width;

    canvas.height = height;

    render();
}


// ============================================================
// VIDEO FRAME CAPTURE
// ============================================================

export function captureVideoFrame(
    time = state.currentTime
) {
    if (
        state.mediaType !== "video" ||
        !sourceVideo
    ) {
        return Promise.resolve(false);
    }

    if (
        !sourceVideo.videoWidth ||
        !sourceVideo.videoHeight
    ) {
        return Promise.resolve(false);
    }

    const targetTime =
        Math.max(
            0,
            Math.min(
                Number(time) || 0,
                state.videoDuration || 0
            )
        );

    return new Promise((resolve) => {
        const drawFrame = () => {
            try {
                state.currentTime =
                    Number(sourceVideo.currentTime) ||
                    targetTime;

                state.currentFrame =
                    Math.max(
                        0,
                        Math.round(
                            state.currentTime *
                            state.fps
                        )
                    );

                resizeCanvasToMedia();

                render();

                emit("videoFrameCaptured", {
                    time: state.currentTime,
                    frame: state.currentFrame
                });

                resolve(true);
            } catch (_) {
                resolve(false);
            }
        };

        if (
            Math.abs(
                sourceVideo.currentTime -
                targetTime
            ) < 0.001
        ) {
            drawFrame();
            return;
        }

        const onSeeked = () => {
            sourceVideo.removeEventListener(
                "seeked",
                onSeeked
            );

            drawFrame();
        };

        sourceVideo.addEventListener(
            "seeked",
            onSeeked
        );

        try {
            sourceVideo.currentTime =
                targetTime;
        } catch (_) {
            sourceVideo.removeEventListener(
                "seeked",
                onSeeked
            );

            resolve(false);
        }
    });
}


// ============================================================
// SEEK VIDEO FRAME
// ============================================================

export function seekVideoFrame(
    frameOrTime,
    options = {}
) {
    if (
        state.mediaType !== "video" ||
        !sourceVideo
    ) {
        return Promise.resolve(false);
    }

    const {
        isTime = false,
        savePrevious = true,
        loadAnnotations = true
    } = options;

    let time;

    if (isTime) {
        time =
            Number(frameOrTime) || 0;
    } else {
        const frame =
            Math.round(
                Number(frameOrTime) || 0
            );

        time =
            state.fps > 0
                ? frame / state.fps
                : 0;
    }

    if (state.videoDuration > 0) {
        time =
            Math.max(
                0,
                Math.min(
                    time,
                    state.videoDuration
                )
            );
    } else {
        time = Math.max(0, time);
    }

    const oldFrame =
        state.currentFrame;

    if (
        savePrevious &&
        state.mediaType === "video"
    ) {
        try {
            saveFrame(oldFrame);
        } catch (_) {
            // Ignore.
        }
    }

    state.videoSeeking = true;

    return captureVideoFrame(time)
        .then((success) => {
            if (!success) {
                state.videoSeeking = false;
                return false;
            }

            state.currentTime =
                Number(sourceVideo.currentTime) ||
                time;

            state.currentFrame =
                Math.max(
                    0,
                    Math.round(
                        state.currentTime *
                        state.fps
                    )
                );

            if (loadAnnotations) {
                try {
                    loadFrame(
                        state.currentFrame
                    );
                } catch (_) {
                    // Ignore.
                }
            }

            state.videoSeeking = false;

            updateFilmstripPosition();

            render();

            emit("frameChanged", {
                frame: state.currentFrame,
                time: state.currentTime
            });

            return true;
        })
        .catch(() => {
            state.videoSeeking = false;
            return false;
        });
}


// ============================================================
// CURRENT FRAME HELPERS
// ============================================================

export function getCurrentFrame() {
    if (state.mediaType !== "video") {
        return 0;
    }

    return Math.max(
        0,
        Math.round(
            state.currentFrame || 0
        )
    );
}


export function getCurrentTime() {
    if (state.mediaType !== "video") {
        return 0;
    }

    if (sourceVideo) {
        const current =
            Number(sourceVideo.currentTime);

        if (Number.isFinite(current)) {
            return current;
        }
    }

    return Number(
        state.currentTime || 0
    );
}


// ============================================================
// NEXT FRAME
// ============================================================

export function nextFrame() {
    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    const frame =
        getCurrentFrame() + 1;

    if (
        state.totalFrames > 0 &&
        frame >= state.totalFrames
    ) {
        seekVideoFrame(
            Math.max(
                0,
                state.totalFrames - 1
            )
        );

        return;
    }

    seekVideoFrame(frame);
}


// ============================================================
// PREVIOUS FRAME
// ============================================================

export function previousFrame() {
    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    seekVideoFrame(
        Math.max(
            0,
            getCurrentFrame() - 1
        )
    );
}


// ============================================================
// FIRST FRAME
// ============================================================

export function firstFrame() {
    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    seekVideoFrame(0);
}


// ============================================================
// LAST FRAME
// ============================================================

export function lastFrame() {
    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    const last =
        Math.max(
            0,
            state.totalFrames - 1
        );

    seekVideoFrame(last);
}


// ============================================================
// PLAY VIDEO
// ============================================================

export async function playVideo() {
    if (
        state.mediaType !== "video" ||
        !sourceVideo
    ) {
        return false;
    }

    try {
        await sourceVideo.play();

        state.videoPlaying = true;

        emit("videoPlay");

        return true;
    } catch (_) {
        state.videoPlaying = false;

        return false;
    }
}


// ============================================================
// PAUSE VIDEO
// ============================================================

export function pauseVideo() {
    if (!sourceVideo) return;

    try {
        sourceVideo.pause();
    } catch (_) {
        // Ignore.
    }

    state.videoPlaying = false;

    emit("videoPause");
}


// ============================================================
// TOGGLE PLAYBACK
// ============================================================

export function toggleVideoPlayback() {
    if (
        state.videoPlaying
    ) {
        pauseVideo();
    } else {
        playVideo();
    }
}


// ============================================================
// STOP PLAYBACK
// ============================================================

export function stopVideoPlayback() {
    if (!sourceVideo) {
        state.videoPlaying = false;
        return;
    }

    try {
        sourceVideo.pause();
    } catch (_) {
        // Ignore.
    }

    state.videoPlaying = false;
}


// ============================================================
// VIDEO TIME UPDATE
// ============================================================

function handleVideoTimeUpdate() {
    if (!sourceVideo) return;

    state.currentTime =
        Number(sourceVideo.currentTime) || 0;

    state.currentFrame =
        Math.max(
            0,
            Math.round(
                state.currentTime *
                state.fps
            )
        );

    updateFilmstripPosition();

    updateVideoLabels();

    render();
}


// ============================================================
// VIDEO PLAY EVENT
// ============================================================

function handleVideoPlay() {
    state.videoPlaying = true;

    emit("videoPlay");
}


// ============================================================
// VIDEO PAUSE EVENT
// ============================================================

function handleVideoPause() {
    state.videoPlaying = false;

    try {
        saveFrame(
            state.currentFrame
        );
    } catch (_) {
        // Ignore.
    }

    emit("videoPause");
}


// ============================================================
// VIDEO ENDED
// ============================================================

function handleVideoEnded() {
    state.videoPlaying = false;

    if (
        state.videoDuration > 0
    ) {
        state.currentTime =
            state.videoDuration;

        state.currentFrame =
            Math.max(
                0,
                state.totalFrames - 1
            );
    }

    updateVideoLabels();

    updateFilmstripPosition();

    render();

    emit("videoEnded");
}


// ============================================================
// VIDEO METADATA
// ============================================================

function handleVideoMetadata() {
    if (!sourceVideo) return;

    state.videoDuration =
        Number(sourceVideo.duration) || 0;

    state.currentFrame = 0;

    state.currentTime = 0;

    state.totalFrames =
        Math.max(
            1,
            Math.round(
                state.videoDuration *
                state.fps
            )
        );

    resizeCanvasToMedia();

    updateVideoLabels();

    updateFilmstrip();

    render();
}


// ============================================================
// VIDEO SEEKING
// ============================================================

function handleVideoSeeking() {
    state.videoSeeking = true;
}


// ============================================================
// VIDEO SEEKED
// ============================================================

function handleVideoSeeked() {
    state.videoSeeking = false;

    state.currentTime =
        Number(sourceVideo?.currentTime) || 0;

    state.currentFrame =
        Math.max(
            0,
            Math.round(
                state.currentTime *
                state.fps
            )
        );

    updateFilmstripPosition();

    updateVideoLabels();

    render();
}


// ============================================================
// VIDEO EVENTS
// ============================================================

function bindVideoEvents() {
    if (!sourceVideo) return;

    sourceVideo.addEventListener(
        "loadedmetadata",
        handleVideoMetadata
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
}


// ============================================================
// VIDEO UI LABELS
// ============================================================

function formatTime(seconds) {
    const value =
        Math.max(
            0,
            Number(seconds) || 0
        );

    const hours =
        Math.floor(value / 3600);

    const minutes =
        Math.floor(
            (value % 3600) / 60
        );

    const secs =
        Math.floor(value % 60);

    if (hours > 0) {
        return [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(secs).padStart(2, "0")
        ].join(":");
    }

    return [
        String(minutes).padStart(2, "0"),
        String(secs).padStart(2, "0")
    ].join(":");
}


function updateVideoLabels() {
    const time =
        getCurrentTime();

    const frame =
        getCurrentFrame();

    setText(
        filmstripCurrentLabel,
        `Frame ${frame + 1} • ${formatTime(time)}`
    );

    setText(
        filmstripLabel,
        state.videoDuration
            ? `${formatTime(time)} / ${formatTime(state.videoDuration)}`
            : formatTime(time)
    );
}


// ============================================================
// FILMSTRIP
// ============================================================

function getFilmstripCount() {
    if (
        state.mediaType !== "video" ||
        !state.videoDuration
    ) {
        return 0;
    }

    const width =
        filmstripTrack?.clientWidth ||
        800;

    return Math.max(
        6,
        Math.min(
            30,
            Math.round(width / 100)
        )
    );
}


// ============================================================
// GENERATE FILMSTRIP
// ============================================================

export async function generateFilmstrip() {
    if (
        state.mediaType !== "video" ||
        !sourceVideo ||
        !state.videoDuration
    ) {
        return [];
    }

    if (filmstripGenerating) {
        return filmstripImages;
    }

    filmstripGenerating = true;

    const duration =
        state.videoDuration;

    const count =
        getFilmstripCount();

    const frames = [];

    const originalTime =
        Number(sourceVideo.currentTime) || 0;

    const wasPlaying =
        !sourceVideo.paused;

    if (wasPlaying) {
        pauseVideo();
    }

    for (let i = 0; i < count; i += 1) {
        const ratio =
            count === 1
                ? 0
                : i / (count - 1);

        const time =
            duration * ratio;

        const image =
            await captureThumbnail(time);

        if (image) {
            frames.push({
                time,
                image
            });
        }
    }

    filmstripImages = frames;

    try {
        await captureVideoFrame(
            originalTime
        );
    } catch (_) {
        // Ignore.
    }

    filmstripGenerating = false;

    renderFilmstrip();

    updateFilmstripPosition();

    if (wasPlaying) {
        playVideo();
    }

    return frames;
}


// ============================================================
// CAPTURE THUMBNAIL
// ============================================================

function captureThumbnail(time) {
    return new Promise((resolve) => {
        if (
            !sourceVideo ||
            !sourceVideo.videoWidth ||
            !sourceVideo.videoHeight
        ) {
            resolve(null);
            return;
        }

        const width =
            120;

        const ratio =
            sourceVideo.videoHeight /
            sourceVideo.videoWidth;

        const height =
            Math.max(
                1,
                Math.round(width * ratio)
            );

        const thumb =
            document.createElement(
                "canvas"
            );

        thumb.width = width;

        thumb.height = height;

        const thumbnailCtx =
            thumb.getContext("2d");

        if (!thumbnailCtx) {
            resolve(null);
            return;
        }

        const oldTime =
            Number(sourceVideo.currentTime) || 0;

        const onSeeked = () => {
            sourceVideo.removeEventListener(
                "seeked",
                onSeeked
            );

            try {
                thumbnailCtx.drawImage(
                    sourceVideo,
                    0,
                    0,
                    width,
                    height
                );

                const image =
                    thumb.toDataURL(
                        "image/jpeg",
                        0.75
                    );

                try {
                    sourceVideo.currentTime =
                        oldTime;
                } catch (_) {
                    // Ignore.
                }

                resolve(image);
            } catch (_) {
                resolve(null);
            }
        };

        sourceVideo.addEventListener(
            "seeked",
            onSeeked
        );

        try {
            sourceVideo.currentTime =
                Math.max(
                    0,
                    Math.min(
                        time,
                        state.videoDuration
                    )
                );
        } catch (_) {
            sourceVideo.removeEventListener(
                "seeked",
                onSeeked
            );

            resolve(null);
        }
    });
}


// ============================================================
// RENDER FILMSTRIP
// ============================================================

function renderFilmstrip() {
    if (!filmstripTrack) return;

    filmstripTrack.innerHTML = "";

    if (!filmstripImages.length) {
        showElement(
            filmstripBar,
            false
        );

        return;
    }

    showElement(
        filmstripBar,
        true
    );

    filmstripImages.forEach(
        (item, index) => {
            const button =
                document.createElement(
                    "button"
                );

            button.type = "button";

            button.className =
                "filmstrip-frame";

            button.dataset.index =
                String(index);

            button.dataset.time =
                String(item.time);

            const image =
                document.createElement(
                    "img"
                );

            image.src = item.image;

            image.alt =
                `Video frame ${index + 1}`;

            image.draggable = false;

            button.appendChild(image);

            button.addEventListener(
                "click",
                () => {
                    seekVideoFrame(
                        item.time,
                        {
                            isTime: true
                        }
                    );
                }
            );

            filmstripTrack.appendChild(
                button
            );
        }
    );
}


// ============================================================
// FILMSTRIP POSITION
// ============================================================

function updateFilmstripPosition() {
    if (!filmstripTrack) return;

    const buttons =
        filmstripTrack.querySelectorAll(
            ".filmstrip-frame"
        );

    if (!buttons.length) return;

    const duration =
        state.videoDuration;

    if (!duration) return;

    const current =
        getCurrentTime();

    let closestIndex = 0;

    let closestDistance =
        Infinity;

    buttons.forEach(
        (button, index) => {
            const time =
                Number(
                    button.dataset.time
                );

            const distance =
                Math.abs(
                    time - current
                );

            if (
                distance <
                closestDistance
            ) {
                closestDistance =
                    distance;

                closestIndex =
                    index;
            }

            button.classList.remove(
                "active"
            );
        }
    );

    const active =
        buttons[closestIndex];

    if (active) {
        active.classList.add(
            "active"
        );
    }
}


// ============================================================
// UPDATE FILMSTRIP
// ============================================================

export function updateFilmstrip() {
    if (
        state.mediaType !== "video"
    ) {
        showElement(
            filmstripBar,
            false
        );

        return;
    }

    generateFilmstrip();
}


// ============================================================
// FILMSTRIP CLICK/DRAG SUPPORT
// ============================================================

function bindFilmstripControls() {
    if (!filmstripTrack) return;

    filmstripTrack.addEventListener(
        "wheel",
        (event) => {
            if (
                filmstripTrack.scrollWidth <=
                filmstripTrack.clientWidth
            ) {
                return;
            }

            event.preventDefault();

            filmstripTrack.scrollLeft +=
                event.deltaY ||
                event.deltaX;
        },
        {
            passive: false
        }
    );
}


// ============================================================
// FRAME SLIDER
// ============================================================

function getFrameSlider() {
    return (
        $("frameSlider") ||
        $("videoFrameSlider") ||
        $("timelineSlider")
    );
}


function bindFrameSlider() {
    const slider =
        getFrameSlider();

    if (!slider) return;

    slider.addEventListener(
        "input",
        () => {
            if (
                state.mediaType !== "video"
            ) {
                return;
            }

            const value =
                Number(slider.value);

            if (
                Number.isFinite(value)
            ) {
                seekVideoFrame(
                    value
                );
            }
        }
    );
}


function updateFrameSlider() {
    const slider =
        getFrameSlider();

    if (!slider) return;

    if (
        state.mediaType !== "video"
    ) {
        slider.disabled = true;
        return;
    }

    slider.disabled = false;

    slider.min = "0";

    slider.max =
        String(
            Math.max(
                0,
                state.totalFrames - 1
            )
        );

    slider.step = "1";

    slider.value =
        String(
            getCurrentFrame()
        );
}


// ============================================================
// PLAYBACK BUTTONS
// ============================================================

function bindPlaybackButtons() {
    const playButton =
        $("playVideo") ||
        $("playButton") ||
        $("videoPlayButton");

    const pauseButton =
        $("pauseVideo") ||
        $("pauseButton") ||
        $("videoPauseButton");

    const toggleButton =
        $("playPauseVideo") ||
        $("playPauseButton") ||
        $("videoPlayPause");

    const nextButton =
        $("nextFrame") ||
        $("nextFrameButton");

    const previousButton =
        $("previousFrame") ||
        $("prevFrame") ||
        $("previousFrameButton");

    if (playButton) {
        playButton.addEventListener(
            "click",
            playVideo
        );
    }

    if (pauseButton) {
        pauseButton.addEventListener(
            "click",
            pauseVideo
        );
    }

    if (toggleButton) {
        toggleButton.addEventListener(
            "click",
            toggleVideoPlayback
        );
    }

    if (nextButton) {
        nextButton.addEventListener(
            "click",
            nextFrame
        );
    }

    if (previousButton) {
        previousButton.addEventListener(
            "click",
            previousFrame
        );
    }
}


// ============================================================
// KEYBOARD VIDEO CONTROLS
// ============================================================

function bindVideoKeyboardControls() {
    document.addEventListener(
        "keydown",
        (event) => {
            if (
                state.mediaType !== "video"
            ) {
                return;
            }

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

                if (event.shiftKey) {
                    seekVideoFrame(
                        Math.min(
                            state.totalFrames - 1,
                            getCurrentFrame() + 10
                        )
                    );
                } else {
                    nextFrame();
                }
            }

            else if (
                event.key === "ArrowLeft"
            ) {
                event.preventDefault();

                if (event.shiftKey) {
                    seekVideoFrame(
                        Math.max(
                            0,
                            getCurrentFrame() - 10
                        )
                    );
                } else {
                    previousFrame();
                }
            }

            else if (
                event.key === " "
            ) {
                event.preventDefault();

                toggleVideoPlayback();
            }

            else if (
                event.key === "Home"
            ) {
                event.preventDefault();

                firstFrame();
            }

            else if (
                event.key === "End"
            ) {
                event.preventDefault();

                lastFrame();
            }
        }
    );
}


// ============================================================
// VIDEO FRAME SAVE BEFORE CHANGE
// ============================================================

function saveCurrentVideoFrame() {
    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    try {
        saveFrame(
            getCurrentFrame()
        );
    } catch (_) {
        // Ignore.
    }
}


// ============================================================
// CANVAS RESIZE OBSERVER
// ============================================================

function setupResizeObserver() {
    if (
        typeof ResizeObserver ===
        "undefined"
    ) {
        return;
    }

    const workspace =
        $("canvasWorkspace") ||
        $("coworkerWorkbench") ||
        annotationCanvas?.parentElement;

    if (!workspace) return;

    try {
        resizeObserver =
            new ResizeObserver(
                () => {
                    render();
                }
            );

        resizeObserver.observe(
            workspace
        );
    } catch (_) {
        // Ignore.
    }
}


// ============================================================
// WINDOW RESIZE
// ============================================================

function bindWindowResize() {
    window.addEventListener(
        "resize",
        () => {
            if (
                state.mediaType
            ) {
                render();
            }
        }
    );
}


// ============================================================
// MEDIA DROP FROM EXTERNAL EVENTS
// ============================================================

window.addEventListener(
    "annotation:loadMedia",
    (event) => {
        const file =
            event.detail?.file;

        if (file) {
            loadMediaFile(file);
        }
    }
);


// ============================================================
// PUBLIC GLOBAL COMPATIBILITY
// ============================================================

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

window.playVideo =
    playVideo;

window.pauseVideo =
    pauseVideo;

window.toggleVideoPlayback =
    toggleVideoPlayback;

window.stopVideoPlayback =
    stopVideoPlayback;

window.updateFilmstrip =
    updateFilmstrip;

window.generateFilmstrip =
    generateFilmstrip;

window.resizeCanvasToMedia =
    resizeCanvasToMedia;


// ============================================================
// INITIALIZATION
// ============================================================

export function initializeMedia() {
    bindMediaInput();
    bindDragAndDrop();
    bindVideoEvents();
    bindFilmstripControls();
    bindFrameSlider();
    bindPlaybackButtons();
    bindVideoKeyboardControls();
    bindWindowResize();
    setupResizeObserver();

    updateVideoLabels();
    updateFrameSlider();

    emit("mediaReady");
}


// ============================================================
// KEEP FRAME SLIDER SYNCHRONIZED
// ============================================================

setInterval(
    () => {
        if (
            state.mediaType === "video"
        ) {
            updateFrameSlider();
            updateVideoLabels();
            updateFilmstripPosition();
        }
    },
    250
);


// ============================================================
// MODULE READY
// ============================================================

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


// ============================================================
// END PART 3
// ============================================================
