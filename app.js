import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

env.allowLocalModels = false;
env.allowRemoteModels = true;

/* ============================================================
   DOM
============================================================ */

const $ = id => document.getElementById(id);

const canvas = $("annotationCanvas");
const ctx = canvas.getContext("2d");
const workspace = $("canvasWorkspace");
const mediaInput = $("mediaInput");
const sourceVideo = $("sourceVideo");
const emptyWorkspace = $("emptyWorkspace");
const appEl = document.querySelector(".app");
const workspaceRoot = $("workspaceRoot");

const annotationsList = $("annotationsList");

const popupEl = $("annotationPopup");
const popupTitle = $("annPopupTitle");
const popupBody = $("annPopupBody");
const popupExpandBtn = $("annPopupExpand");

const filmstripBar = $("filmstripBar");
const filmstripTrack = $("filmstripTrack");
const filmstripLabel = $("filmstripLabel");
const filmstripCurrentLabel = $("filmstripCurrentLabel");

const toastContainer = $("toastContainer");

const SESSION_KEY = "annotationAI_session_v1";

/* ============================================================
   STATE
============================================================ */

const state = {
    mediaType: null,
    image: null,
    imageURL: null,
    videoURL: null,
    videoDuration: 0,
    fps: 30,
    currentFrame: 0,
    totalFrames: 0,
    currentTime: 0,
    videoPlaying: false,
    videoSeeking: false,
    frameCaptureBusy: false,
    animationFrame: null,

    scale: 1,
    offsetX: 0,
    offsetY: 0,
    minScale: 0.03,
    maxScale: 25,

    annotationType: "box",
    mode: "select",
    annotations: [],
    selectedId: null,
    hoveredId: null,
    nextId: 1,

    drawing: false,
    drawStart: null,
    drawCurrent: null,
    polygonPoints: [],

    pointerDown: false,
    dragging: false,
    panning: false,
    spacePan: false,
    resizeHandle: null,
    dragStartImage: null,
    dragLastImage: null,
    panStart: null,

    frameAnnotations: new Map(),

    rightPanelOpen: true,
    popupExpanded: false,
    colorMode: "normal",

    history: [],
    historyIndex: -1,

    detr: null,
    yolo: null,
    segmenter: null,
    aiRunning: false,

    pendingVideoRestore: null
};

const MODELS = {
    detr: "Xenova/detr-resnet-50",
    yolo: "Xenova/yolov9-c",
    panoptic: "Xenova/detr-resnet-50-panoptic"
};

const LABEL_ALIASES = {
    automobile: "car",
    vehicle: "car",
    "motor vehicle": "car",
    human: "person",
    cyclist: "bicycle",
    bike: "bicycle"
};

/* ============================================================
   INITIALIZATION
============================================================ */

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateZoomUI();
updateCounts();
updateAnnotationsList();
updateUndoRedoButtons();
updateAIEngineAvailability();
updateColorLegend();
hidePopup();
loadSessionOnStartup();

/* ============================================================
   UPLOAD
============================================================ */

mediaInput.addEventListener("change", async event => {
    if (typeof canUseUpload === "function" && !canUseUpload()) {
        alert("Customer upload is available to staff/admin only.");
        event.target.value = "";
        return;
    }

    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
        await loadCustomerMedia(file);
    } catch (error) {
        console.error(error);
        alert("Could not load this media file.\n\n" + error.message);
    }
});

async function loadCustomerMedia(file) {
    cleanupMedia();

    state.mediaType = file.type.startsWith("video/") ? "video" : "image";

    $("fileName").textContent = file.name;
    $("mediaInfo").textContent = `${file.type || "media"} • ${formatMB(file.size)} MB`;
    emptyWorkspace.style.display = "none";

    $("allFramesRow").style.display =
        state.mediaType === "video" ? "flex" : "none";

    filmstripBar.style.display =
        state.mediaType === "video" ? "flex" : "none";

    if (state.mediaType === "image") {
        await loadImageFile(file);
    } else {
        await loadVideoFile(file);
    }

    fitView();
    render();
    saveSession();
}

/* ============================================================
   IMAGE
============================================================ */

function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            state.image = image;
            state.imageURL = url;
            state.annotations = [];
            state.selectedId = null;

            resetHistory(state.annotations);
            updateCounts();
            hidePopup();
            updateAnnotationsList();

            resolve();
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("The image could not be decoded."));
        };

        image.src = url;
    });
}

/* ============================================================
   VIDEO
============================================================ */

function loadVideoFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);

        state.videoURL = url;
        sourceVideo.src = url;
        sourceVideo.load();

        sourceVideo.onloadedmetadata = () => {
            state.videoDuration = sourceVideo.duration;
            state.fps = 30;

            state.totalFrames = Math.max(
                1,
                Math.ceil(state.videoDuration * state.fps)
            );

            $("videoControlsPanel").style.display = "block";
            $("totalFrames").textContent = state.totalFrames;
            $("frameSlider").max = state.totalFrames - 1;
            state.currentFrame = 0;

            if (
                state.pendingVideoRestore &&
                state.pendingVideoRestore.fileName === file.name
            ) {
                state.frameAnnotations = new Map(
                    state.pendingVideoRestore.frameAnnotations || []
                );

                state.pendingVideoRestore = null;
                $("sessionBanner").style.display = "none";

                showToast("Video annotations restored");
            }

            buildFilmstrip();

            seekVideoFrame(0).then(resolve);
        };

        sourceVideo.onerror = () => {
            reject(
                new Error(
                    "The video could not be loaded by the browser."
                )
            );
        };
    });
}

/* ============================================================
   VIDEO FRAME SEEK
============================================================ */

async function seekVideoFrame(frame) {
    if (state.mediaType !== "video") return;

    frame = Math.max(
        0,
        Math.min(
            state.totalFrames - 1,
            Math.round(frame)
        )
    );

    state.currentFrame = frame;

    const time = Math.min(
        state.videoDuration,
        frame / state.fps
    );

    state.currentTime = time;

    updateVideoUI();

    await seekVideoTime(time);
    await captureVideoFrame();

    loadFrameAnnotations();
    fitView();
    render();
}

function seekVideoTime(time) {
    return new Promise(resolve => {
        state.videoSeeking = true;

        const done = () => {
            sourceVideo.removeEventListener("seeked", done);
            state.videoSeeking = false;
            resolve();
        };

        sourceVideo.addEventListener("seeked", done);
        sourceVideo.currentTime = time;
    });
}

async function captureVideoFrame() {
    if (!sourceVideo.videoWidth || !sourceVideo.videoHeight) {
        return;
    }

    if (state.frameCaptureBusy) return;

    state.frameCaptureBusy = true;

    try {
        const frameCanvas = document.createElement("canvas");

        frameCanvas.width = sourceVideo.videoWidth;
        frameCanvas.height = sourceVideo.videoHeight;

        const frameContext = frameCanvas.getContext("2d");

        frameContext.drawImage(
            sourceVideo,
            0,
            0,
            frameCanvas.width,
            frameCanvas.height
        );

        const image = new Image();

        await new Promise(resolve => {
            image.onload = resolve;

            image.src = frameCanvas.toDataURL(
                "image/jpeg",
                0.92
            );
        });

        state.image = image;
        state.currentTime = sourceVideo.currentTime;
    } finally {
        state.frameCaptureBusy = false;
    }
}

/* ============================================================
   VIDEO BUTTONS
============================================================ */

$("previousFrame").addEventListener("click", () => {
    pauseVideo();
    seekVideoFrame(state.currentFrame - 1);
});

$("nextFrame").addEventListener("click", () => {
    pauseVideo();
    seekVideoFrame(state.currentFrame + 1);
});

$("playVideo").addEventListener("click", toggleVideo);
$("filmstripPlay").addEventListener("click", toggleVideo);

$("frameSlider").addEventListener("input", event => {
    pauseVideo();
    seekVideoFrame(Number(event.target.value));
});

function toggleVideo() {
    if (state.mediaType !== "video") return;

    if (sourceVideo.paused) {
        sourceVideo.play();
    } else {
        sourceVideo.pause();
    }
}

function pauseVideo() {
    if (!sourceVideo.paused) {
        sourceVideo.pause();
    }
}

/* ============================================================
   VIDEO PLAYBACK
============================================================ */

sourceVideo.addEventListener("play", () => {
    state.videoPlaying = true;

    $("playVideo").textContent = "❚❚";
    $("filmstripPlay").textContent = "❚❚";

    startVideoRender();
});

sourceVideo.addEventListener("pause", () => {
    state.videoPlaying = false;

    $("playVideo").textContent = "▶";
    $("filmstripPlay").textContent = "▶";

    if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
    }

    if (state.mediaType === "video") {
        captureVideoFrame().then(() => {
            state.currentFrame = Math.round(
                sourceVideo.currentTime * state.fps
            );

            updateVideoUI();
            loadFrameAnnotations();
            render();
        });
    }
});

sourceVideo.addEventListener("ended", () => {
    state.videoPlaying = false;

    $("playVideo").textContent = "▶";
    $("filmstripPlay").textContent = "▶";

    if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
    }
});

function startVideoRender() {
    if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
    }

    const loop = () => {
        if (!state.videoPlaying) return;

        state.currentTime = sourceVideo.currentTime;

        const frame = Math.round(
            sourceVideo.currentTime * state.fps
        );

        if (frame !== state.currentFrame) {
            saveFrame();

            state.currentFrame = Math.max(
                0,
                Math.min(
                    state.totalFrames - 1,
                    frame
                )
            );

            loadFrameAnnotations();
            updateVideoUI();
        }

        render();

        state.animationFrame =
            requestAnimationFrame(loop);
    };

    state.animationFrame =
        requestAnimationFrame(loop);
}

/* ============================================================
   MEDIA CLEANUP
============================================================ */

function cleanupMedia() {
    if (state.imageURL) {
        URL.revokeObjectURL(state.imageURL);
    }

    if (state.videoURL) {
        URL.revokeObjectURL(state.videoURL);
    }

    state.imageURL = null;
    state.videoURL = null;
    state.image = null;

    state.mediaType = null;
    state.videoDuration = 0;
    state.currentFrame = 0;
    state.totalFrames = 0;
    state.currentTime = 0;

    state.annotations = [];
    state.frameAnnotations = new Map();
    state.selectedId = null;
    state.nextId = 1;

    state.drawing = false;
    state.polygonPoints = [];

    $("videoControlsPanel").style.display = "none";
    filmstripBar.style.display = "none";

    if ($("sessionBanner")) {
        $("sessionBanner").style.display = "none";
    }

    if (sourceVideo) {
        sourceVideo.pause();
        sourceVideo.removeAttribute("src");
        sourceVideo.load();
    }

    updateCounts();
    updateAnnotationsList();
    hidePopup();
}

/* ============================================================
   FORMAT HELPERS
============================================================ */

function formatMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
}

function safeFilename(name) {
    return String(name || "export")
        .replace(/[^a-z0-9._-]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 120) || "export";
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function esc(value) {
    return escapeHTML(value);
}

function downloadBlob(blob, filename) {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadJSON(data, filename) {
    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        {
            type: "application/json;charset=utf-8"
        }
    );

    downloadBlob(blob, filename);
}

/* ============================================================
   KEYBOARD
============================================================ */

window.addEventListener("keydown", event => {
    const target = event.target;

    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    ) {
        return;
    }

    if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
    ) {
        event.preventDefault();
        undo();
        return;
    }

    if (
        (event.ctrlKey || event.metaKey) &&
        (
            event.key.toLowerCase() === "y" ||
            (
                event.shiftKey &&
                event.key.toLowerCase() === "z"
            )
        )
    ) {
        event.preventDefault();
        redo();
        return;
    }

    if (
        event.code === "Space" &&
        state.mediaType !== "video"
    ) {
        event.preventDefault();

        if (!state.spacePan) {
            state.spacePan = true;
            updateCursor();
        }

        return;
    }

    if (state.mediaType === "video") {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            pauseVideo();
            seekVideoFrame(state.currentFrame - 1);
            return;
        }

        if (event.key === "ArrowRight") {
            event.preventDefault();
            pauseVideo();
            seekVideoFrame(state.currentFrame + 1);
            return;
        }

        if (event.code === "Space") {
            event.preventDefault();
            toggleVideo();
            return;
        }
    }

    if (event.key === "Enter" && state.drawing) {
        event.preventDefault();

        if (state.annotationType === "box") {
            finishBoxDrawing();
        } else {
            finalizePolygon();
        }

        return;
    }

    if (event.key === "+" || event.key === "=") {
        zoomCenter(1.20);
    }

    if (event.key === "-" || event.key === "_") {
        zoomCenter(1 / 1.20);
    }

    if (
        event.key === "Delete" ||
        event.key === "Backspace"
    ) {
        deleteSelected();
    }

    if (event.key === "Escape") {
        cancelDrawing();
        hidePopup();
    }
});

window.addEventListener("keyup", event => {
    if (
        event.code === "Space" &&
        state.spacePan
    ) {
        state.spacePan = false;
        updateCursor();
    }
});

/* ============================================================
   ANNOTATION TYPE
============================================================ */

document.querySelectorAll(".annotation-type").forEach(button => {
    button.addEventListener("click", () => {
        document
            .querySelectorAll(".annotation-type")
            .forEach(item =>
                item.classList.remove("active")
            );

        button.classList.add("active");

        state.annotationType =
            button.dataset.tool;

        $("annotationMode").textContent =
            state.annotationType.toUpperCase();

        updateAIEngineAvailability();

        cancelDrawing();
        setMode("draw");
    });
});

function updateAIEngineAvailability() {
    const isBox =
        state.annotationType === "box";

    $("aiEngine").disabled = !isBox;

    $("aiEngineNote").style.display =
        isBox ? "none" : "block";

    $("aiEngineNote").textContent = isBox
        ? ""
        : "Polygon/Segmentation uses a real segmentation model (DETR panoptic) automatically — the engine dropdown above is only for box mode.";
}

/* ============================================================
   TOOLS
============================================================ */

document.querySelectorAll(".tool-button").forEach(button => {
    button.addEventListener("click", () => {
        setMode(button.dataset.mode);
    });
});

function setMode(mode) {
    state.mode = mode;

    document
        .querySelectorAll(".tool-button")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.mode === mode
            );
        });

    $("activeTool").textContent =
        mode.charAt(0).toUpperCase() +
        mode.slice(1);

    state.resizeHandle = null;
    state.dragging = false;
    state.panning = false;

    if (mode !== "draw") {
        state.drawing = false;
        state.polygonPoints = [];
    }

    updateCursor();
    render();
}

function updateCursor() {
    if (
        state.spacePan ||
        state.mode === "pan"
    ) {
        workspace.style.cursor =
            state.panning
                ? "grabbing"
                : "grab";

        return;
    }

    if (state.mode === "erase") {
        workspace.style.cursor = "not-allowed";
        return;
    }

    if (state.mode === "select") {
        workspace.style.cursor = "default";
        return;
    }

    workspace.style.cursor = "crosshair";
}

/* ============================================================
   CANVAS RESIZE
============================================================ */

function resizeCanvas() {
    const rect =
        workspace.getBoundingClientRect();

    const dpr =
        window.devicePixelRatio || 1;

    canvas.width = Math.max(
        1,
        Math.floor(rect.width * dpr)
    );

    canvas.height = Math.max(
        1,
        Math.floor(rect.height * dpr)
    );

    canvas.style.width =
        rect.width + "px";

    canvas.style.height =
        rect.height + "px";

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    render();
}

function clearCanvas(width, height) {
    ctx.clearRect(
        0,
        0,
        width,
        height
    );
}

/* ============================================================
   IMAGE <-> SCREEN
============================================================ */

function imageToScreen(x, y) {
    return {
        x:
            x * state.scale +
            state.offsetX,

        y:
            y * state.scale +
            state.offsetY
    };
}

function screenToImage(x, y) {
    return {
        x:
            (x - state.offsetX) /
            state.scale,

        y:
            (y - state.offsetY) /
            state.scale
    };
}

/* ============================================================
   FIT / RESET
============================================================ */

function fitView() {
    if (
        !state.image &&
        state.mediaType !== "video"
    ) {
        return;
    }

    const rect =
        workspace.getBoundingClientRect();

    let width;
    let height;

    if (
        state.mediaType === "video" &&
        sourceVideo.videoWidth
    ) {
        width =
            sourceVideo.videoWidth;

        height =
            sourceVideo.videoHeight;
    } else {
        width =
            state.image?.naturalWidth ||
            state.image?.width ||
            1;

        height =
            state.image?.naturalHeight ||
            state.image?.height ||
            1;
    }

    const sx =
        (rect.width - 40) / width;

    const sy =
        (rect.height - 40) / height;

    state.scale = Math.max(
        state.minScale,
        Math.min(
            state.maxScale,
            Math.min(sx, sy)
        )
    );

    state.offsetX =
        (rect.width -
            width * state.scale) /
        2;

    state.offsetY =
        (rect.height -
            height * state.scale) /
        2;

    updateZoomUI();
    render();
}

$("fitView").addEventListener(
    "click",
    fitView
);

$("resetView").addEventListener(
    "click",
    () => {
        state.scale = 1;
        state.offsetX = 0;
        state.offsetY = 0;

        updateZoomUI();
        render();
    }
);

/* ============================================================
   ZOOM
============================================================ */

$("zoomIn").addEventListener(
    "click",
    () => zoomCenter(1.20)
);

$("zoomOut").addEventListener(
    "click",
    () => zoomCenter(1 / 1.20)
);

function zoomCenter(factor) {
    const rect =
        workspace.getBoundingClientRect();

    zoomAt(
        factor,
        rect.width / 2,
        rect.height / 2
    );
}

workspace.addEventListener(
    "wheel",
    event => {
        event.preventDefault();

        const rect =
            workspace.getBoundingClientRect();

        const x =
            event.clientX -
            rect.left;

        const y =
            event.clientY -
            rect.top;

        const factor =
            event.deltaY < 0
                ? 1.12
                : 1 / 1.12;

        zoomAt(factor, x, y);
    },
    { passive: false }
);

function zoomAt(factor, x, y) {
    const imagePoint =
        screenToImage(x, y);

    state.scale = Math.max(
        state.minScale,
        Math.min(
            state.maxScale,
            state.scale * factor
        )
    );

    state.offsetX =
        x -
        imagePoint.x *
            state.scale;

    state.offsetY =
        y -
        imagePoint.y *
            state.scale;

    updateZoomUI();
    render();
}

/* ============================================================
   MAXIMIZE / FULL SCREEN
============================================================ */

$("maximizeWorkspace").addEventListener(
    "click",
    toggleFullscreen
);

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        workspaceRoot
            .requestFullscreen?.()
            .catch(() => {});
    } else {
        document
            .exitFullscreen?.();
    }
}

document.addEventListener(
    "fullscreenchange",
    () => {
        const active =
            document.fullscreenElement ===
            workspaceRoot;

        $("maximizeWorkspace").textContent =
            active ? "⤢" : "⛶";

        $("maximizeWorkspace")
            .classList.toggle(
                "active",
                active
            );

        setTimeout(
            resizeCanvas,
            50
        );
    }
);

/* ============================================================
   RIGHT PANEL OPEN / CLOSE
============================================================ */

$("toggleRightPanel").addEventListener(
    "click",
    toggleRightPanelVisibility
);

$("closeRightPanel").addEventListener(
    "click",
    closeRightPanelFn
);

$("reopenRightPanel").addEventListener(
    "click",
    openRightPanelFn
);

function toggleRightPanelVisibility() {
    state.rightPanelOpen
        ? closeRightPanelFn()
        : openRightPanelFn();
}

function closeRightPanelFn() {
    state.rightPanelOpen = false;

    appEl.classList.add(
        "panel-collapsed"
    );

    $("reopenRightPanel").style.display =
        "block";

    setTimeout(
        resizeCanvas,
        50
    );
}

function openRightPanelFn() {
    state.rightPanelOpen = true;

    appEl.classList.remove(
        "panel-collapsed"
    );

    $("reopenRightPanel").style.display =
        "none";

    setTimeout(
        resizeCanvas,
        50
    );
}

/* ============================================================
   POINTER
============================================================ */

canvas.addEventListener(
    "pointerdown",
    pointerDown
);

canvas.addEventListener(
    "pointermove",
    pointerMove
);

canvas.addEventListener(
    "pointerup",
    pointerUp
);

canvas.addEventListener(
    "pointercancel",
    pointerUp
);

canvas.addEventListener(
    "dblclick",
    doubleClick
);

function pointerPosition(event) {
    const rect =
        canvas.getBoundingClientRect();

    return {
        x:
            event.clientX -
            rect.left,

        y:
            event.clientY -
            rect.top
    };
}
function pointerDown(event) {
    const p = pointerPosition(event);
    canvas.setPointerCapture(event.pointerId);
    state.pointerDown = true;

    if (state.mode === "pan" || event.button === 1 || event.shiftKey || state.spacePan) {
        state.panning = true;
        state.panStart = {
            x: p.x,
            y: p.y,
            offsetX: state.offsetX,
            offsetY: state.offsetY
        };
        updateCursor();
        return;
    }

    if (state.mode === "select") {
        const hit = hitTest(p.x, p.y);

        if (hit) {
            state.selectedId = hit.id;
            state.resizeHandle = hit.handle || null;

            const imagePoint = screenToImage(p.x, p.y);
            state.dragStartImage = imagePoint;
            state.dragLastImage = imagePoint;
            state.dragging = true;

            updateSelected();
        } else {
            state.selectedId = null;
            updateSelected();
        }

        render();
        return;
    }

    if (state.mode === "erase") {
        const hit = hitTest(p.x, p.y);

        if (hit) {
            state.selectedId = hit.id;
            deleteSelected();
        }

        return;
    }

    if (state.mode === "draw") {
        if (state.annotationType === "box") {
            beginDrawing(p.x, p.y);
        } else {
            addPolygonPoint(p.x, p.y);
        }
    }
}

function pointerMove(event) {
    const p = pointerPosition(event);

    if (state.panning) {
        const dx = p.x - state.panStart.x;
        const dy = p.y - state.panStart.y;

        state.offsetX =
            state.panStart.offsetX + dx;

        state.offsetY =
            state.panStart.offsetY + dy;

        render();
        return;
    }

    if (
        state.mode === "select" &&
        state.dragging &&
        state.selectedId
    ) {
        const a = getSelected();

        if (!a) return;

        const current = screenToImage(p.x, p.y);
        const last = state.dragLastImage;

        if (
            state.resizeHandle &&
            a.type === "box"
        ) {
            resizeBox(
                a,
                state.resizeHandle,
                current
            );
        } else {
            const dx =
                current.x - last.x;

            const dy =
                current.y - last.y;

            moveAnnotation(
                a,
                dx,
                dy
            );
        }

        state.dragLastImage = current;
        a.corrected = true;

        saveFrame();
        render();
        renderPopupBody(a);
        updateAnnotationsList();

        return;
    }

    if (
        state.mode === "draw" &&
        state.drawing
    ) {
        state.drawCurrent =
            screenToImage(
                p.x,
                p.y
            );

        render();
    }
}

function pointerUp() {
    const wasDraggingAnnotation =
        state.mode === "select" &&
        state.dragging &&
        state.selectedId;

    if (
        state.mode === "draw" &&
        state.drawing &&
        state.annotationType === "box"
    ) {
        finishBoxDrawing();
    }

    if (wasDraggingAnnotation) {
        saveFrame();
        pushHistory();
        saveSession();
    }

    state.pointerDown = false;
    state.dragging = false;
    state.panning = false;
    state.resizeHandle = null;

    updateCursor();
}

/* ============================================================
   DRAWING — BOX
============================================================ */

function beginDrawing(x, y) {
    const point =
        screenToImage(x, y);

    state.drawing = true;
    state.drawStart = point;
    state.drawCurrent = point;
}

function finishBoxDrawing() {
    if (!state.drawing) return;

    const start = state.drawStart;
    const end = state.drawCurrent;

    const x =
        Math.min(
            start.x,
            end.x
        );

    const y =
        Math.min(
            start.y,
            end.y
        );

    const width =
        Math.abs(
            end.x - start.x
        );

    const height =
        Math.abs(
            end.y - start.y
        );

    if (
        width >= 5 &&
        height >= 5
    ) {
        createAnnotation({
            type: "box",
            x,
            y,
            width,
            height,
            label: "unknown",
            score: null,
            occlusion: 0,
            truncation: "NONE"
        });
    }

    state.drawing = false;
    state.drawStart = null;
    state.drawCurrent = null;

    saveFrame();
    pushHistory();
    saveSession();
    updateCounts();
    render();
}

/* ============================================================
   DRAWING — POLYGON / SEGMENTATION
============================================================ */

function addPolygonPoint(x, y) {
    const point =
        screenToImage(x, y);

    if (!state.drawing) {
        state.drawing = true;
        state.polygonPoints = [point];
    } else {
        state.polygonPoints.push(point);
    }

    state.drawCurrent = point;
    render();
}

function finalizePolygon() {
    if (
        state.polygonPoints.length < 3
    ) {
        cancelDrawing();
        return;
    }

    const points =
        state.polygonPoints.map(
            p => ({
                x: p.x,
                y: p.y
            })
        );

    createAnnotation({
        type: state.annotationType,
        points,
        label: "unknown",
        score: null,
        occlusion: 0,
        truncation: "NONE"
    });

    state.drawing = false;
    state.polygonPoints = [];
    state.drawCurrent = null;

    saveFrame();
    pushHistory();
    saveSession();
    render();
}

function doubleClick() {
    if (state.mode !== "draw") return;

    if (
        state.annotationType === "box"
    ) {
        return;
    }

    finalizePolygon();
}

function cancelDrawing() {
    state.drawing = false;
    state.drawStart = null;
    state.drawCurrent = null;
    state.polygonPoints = [];

    render();
}

/* ============================================================
   CREATE ANNOTATION
============================================================ */

function createAnnotation(data) {
    const annotation = {
        id: String(state.nextId++),
        type: data.type,

        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,

        points: data.points
            ? data.points.map(p => ({
                x: p.x,
                y: p.y
            }))
            : undefined,

        label: data.label || "unknown",
        score: data.score ?? null,

        occlusion:
            Number(data.occlusion ?? 0),

        truncation:
            data.truncation || "NONE",

        aiGenerated:
            !!data.aiGenerated,

        corrected:
            !!data.corrected,

        export:
            data.export !== false
    };

    state.annotations.push(annotation);
    state.selectedId = annotation.id;

    updateSelected();
    updateAnnotationsList();
    updateCounts();

    pushHistory();
    saveFrame();
    saveSession();

    cloudSaveAnnotation(annotation);

    return annotation;
}

/* ============================================================
   ANNOTATION SELECTION
============================================================ */

function getSelected() {
    return state.annotations.find(
        a => a.id === state.selectedId
    ) || null;
}

function updateSelected() {
    updateAnnotationsList();

    const selected =
        getSelected();

    if (selected) {
        renderPopup(selected);
    } else {
        hidePopup();
    }

    render();
}

/* ============================================================
   HIT TESTING
============================================================ */

function hitTest(screenX, screenY) {
    const point =
        screenToImage(
            screenX,
            screenY
        );

    for (
        let i =
            state.annotations.length - 1;
        i >= 0;
        i--
    ) {
        const a =
            state.annotations[i];

        if (a.type === "box") {
            const handle =
                getResizeHandle(
                    a,
                    point
                );

            if (handle) {
                return {
                    id: a.id,
                    handle
                };
            }

            if (
                point.x >= a.x &&
                point.x <=
                    a.x + a.width &&
                point.y >= a.y &&
                point.y <=
                    a.y + a.height
            ) {
                return {
                    id: a.id,
                    handle: null
                };
            }
        } else if (
            a.points &&
            pointInPolygon(
                point,
                a.points
            )
        ) {
            return {
                id: a.id,
                handle: null
            };
        }
    }

    return null;
}

function getResizeHandle(a, p) {
    if (a.type !== "box") {
        return null;
    }

    const threshold =
        8 / state.scale;

    const left = a.x;
    const right =
        a.x + a.width;

    const top = a.y;
    const bottom =
        a.y + a.height;

    const nearLeft =
        Math.abs(
            p.x - left
        ) <= threshold;

    const nearRight =
        Math.abs(
            p.x - right
        ) <= threshold;

    const nearTop =
        Math.abs(
            p.y - top
        ) <= threshold;

    const nearBottom =
        Math.abs(
            p.y - bottom
        ) <= threshold;

    if (
        nearLeft &&
        nearTop
    ) return "nw";

    if (
        nearRight &&
        nearTop
    ) return "ne";

    if (
        nearLeft &&
        nearBottom
    ) return "sw";

    if (
        nearRight &&
        nearBottom
    ) return "se";

    if (nearTop) return "n";
    if (nearBottom) return "s";
    if (nearLeft) return "w";
    if (nearRight) return "e";

    return null;
}

function pointInPolygon(point, points) {
    let inside = false;

    for (
        let i = 0,
            j = points.length - 1;
        i < points.length;
        j = i++
    ) {
        const xi = points[i].x;
        const yi = points[i].y;

        const xj = points[j].x;
        const yj = points[j].y;

        const intersect =
            ((yi > point.y) !==
                (yj > point.y)) &&
            (
                point.x <
                (xj - xi) *
                    (point.y - yi) /
                    ((yj - yi) || 1e-9) +
                xi
            );

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

/* ============================================================
   MOVE / RESIZE
============================================================ */

function moveAnnotation(a, dx, dy) {
    if (a.type === "box") {
        a.x += dx;
        a.y += dy;
    } else if (a.points) {
        a.points.forEach(p => {
            p.x += dx;
            p.y += dy;
        });
    }
}

function resizeBox(a, handle, point) {
    const oldRight =
        a.x + a.width;

    const oldBottom =
        a.y + a.height;

    let left = a.x;
    let right = oldRight;
    let top = a.y;
    let bottom = oldBottom;

    if (handle.includes("w")) {
        left = point.x;
    }

    if (handle.includes("e")) {
        right = point.x;
    }

    if (handle.includes("n")) {
        top = point.y;
    }

    if (handle.includes("s")) {
        bottom = point.y;
    }

    if (right < left) {
        [left, right] =
            [right, left];
    }

    if (bottom < top) {
        [top, bottom] =
            [bottom, top];
    }

    a.x = left;
    a.y = top;
    a.width =
        Math.max(
            1,
            right - left
        );
    a.height =
        Math.max(
            1,
            bottom - top
        );
}

/* ============================================================
   DELETE
============================================================ */

$("deleteAnnotation").addEventListener(
    "click",
    deleteSelected
);

function deleteSelected() {
    if (!state.selectedId) {
        return;
    }

    const id =
        state.selectedId;

    const index =
        state.annotations.findIndex(
            a => a.id === id
        );

    if (index === -1) {
        return;
    }

    state.annotations.splice(
        index,
        1
    );

    state.selectedId = null;

    updateSelected();
    updateCounts();

    pushHistory();
    saveFrame();
    saveSession();

    cloudDeleteAnnotation(id);

    showToast(
        "Annotation deleted"
    );
}

/* ============================================================
   RENDER
============================================================ */

function render() {
    if (!canvas) return;

    const rect =
        workspace.getBoundingClientRect();

    clearCanvas(
        rect.width,
        rect.height
    );

    if (
        state.mediaType === "video" &&
        state.videoPlaying
    ) {
        renderLiveVideo();
        return;
    }

    if (!state.image) {
        renderDrawingPreview();
        return;
    }

    const width =
        state.image.naturalWidth ||
        state.image.width;

    const height =
        state.image.naturalHeight ||
        state.image.height;

    ctx.save();

    ctx.translate(
        state.offsetX,
        state.offsetY
    );

    ctx.scale(
        state.scale,
        state.scale
    );

    ctx.drawImage(
        state.image,
        0,
        0,
        width,
        height
    );

    ctx.restore();

    state.annotations.forEach(
        drawAnnotation
    );

    renderDrawingPreview();
}

function drawAnnotation(a) {
    ctx.save();

    const selected =
        a.id === state.selectedId;

    const stroke =
        selected
            ? "#a78bfa"
            : "#00ff55";

    const fill =
        selected
            ? "rgba(167,139,250,.18)"
            : "rgba(0,255,85,.12)";

    ctx.strokeStyle =
        stroke;

    ctx.fillStyle =
        fill;

    ctx.lineWidth =
        Math.max(
            1.5,
            2 / state.scale
        );

    if (a.type === "box") {
        ctx.strokeRect(
            a.x,
            a.y,
            a.width,
            a.height
        );

        ctx.fillRect(
            a.x,
            a.y,
            a.width,
            a.height
        );

        drawBoxLabel(
            a
        );

        if (selected) {
            drawResizeHandles(
                a
            );
        }
    } else if (
        a.points &&
        a.points.length >= 2
    ) {
        ctx.beginPath();

        a.points.forEach(
            (point, index) => {
                if (index === 0) {
                    ctx.moveTo(
                        point.x,
                        point.y
                    );
                } else {
                    ctx.lineTo(
                        point.x,
                        point.y
                    );
                }
            }
        );

        ctx.closePath();

        if (
            a.type ===
            "segmentation"
        ) {
            ctx.fill();
        }

        ctx.stroke();

        drawPolygonLabel(
            a
        );
    }

    ctx.restore();
}

function drawBoxLabel(a) {
    const text =
        `${a.label || "unknown"}${a.score != null ? ` ${(a.score * 100).toFixed(0)}%` : ""}`;

    const fontSize =
        Math.max(
            10 / state.scale,
            12 / state.scale
        );

    ctx.font =
        `bold ${fontSize}px Arial`;

    const metrics =
        ctx.measureText(text);

    const padding =
        4 / state.scale;

    const boxHeight =
        fontSize +
        padding * 2;

    const labelX =
        a.x;

    const labelY =
        Math.max(
            boxHeight,
            a.y
        );

    ctx.fillStyle =
        "#111";

    ctx.fillRect(
        labelX,
        labelY - boxHeight,
        metrics.width +
            padding * 2,
        boxHeight
    );

    ctx.fillStyle =
        "#fff";

    ctx.fillText(
        text,
        labelX + padding,
        labelY - padding
    );
}

function drawPolygonLabel(a) {
    if (
        !a.points ||
        !a.points.length
    ) {
        return;
    }

    const p =
        a.points[0];

    ctx.font =
        `${12 / state.scale}px Arial`;

    ctx.fillStyle =
        "#fff";

    ctx.fillText(
        a.label || "unknown",
        p.x,
        p.y
    );
}

function drawResizeHandles(a) {
    const size =
        5 / state.scale;

    const points = [
        [a.x, a.y],
        [a.x + a.width, a.y],
        [a.x, a.y + a.height],
        [
            a.x + a.width,
            a.y + a.height
        ]
    ];

    ctx.fillStyle =
        "#fff";

    ctx.strokeStyle =
        "#a78bfa";

    ctx.lineWidth =
        1 / state.scale;

    points.forEach(
        ([x, y]) => {
            ctx.beginPath();

            ctx.rect(
                x - size,
                y - size,
                size * 2,
                size * 2
            );

            ctx.fill();
            ctx.stroke();
        }
    );
}

function renderDrawingPreview() {
    if (!state.drawing) {
        return;
    }

    ctx.save();

    ctx.strokeStyle =
        "#a78bfa";

    ctx.fillStyle =
        "rgba(167,139,250,.12)";

    ctx.lineWidth = 2;

    if (
        state.annotationType ===
        "box"
    ) {
        if (
            !state.drawStart ||
            !state.drawCurrent
        ) {
            ctx.restore();
            return;
        }

        const start =
            imageToScreen(
                state.drawStart.x,
                state.drawStart.y
            );

        const current =
            imageToScreen(
                state.drawCurrent.x,
                state.drawCurrent.y
            );

        const x =
            Math.min(
                start.x,
                current.x
            );

        const y =
            Math.min(
                start.y,
                current.y
            );

        const width =
            Math.abs(
                current.x -
                start.x
            );

        const height =
            Math.abs(
                current.y -
                start.y
            );

        ctx.fillRect(
            x,
            y,
            width,
            height
        );

        ctx.strokeRect(
            x,
            y,
            width,
            height
        );
    } else {
        const points =
            state.polygonPoints;

        if (
            !points.length
        ) {
            ctx.restore();
            return;
        }

        ctx.beginPath();

        points.forEach(
            (point, index) => {
                const screen =
                    imageToScreen(
                        point.x,
                        point.y
                    );

                if (index === 0) {
                    ctx.moveTo(
                        screen.x,
                        screen.y
                    );
                } else {
                    ctx.lineTo(
                        screen.x,
                        screen.y
                    );
                }
            }
        );

        if (
            state.drawCurrent
        ) {
            const current =
                imageToScreen(
                    state.drawCurrent.x,
                    state.drawCurrent.y
                );

            ctx.lineTo(
                current.x,
                current.y
            );
        }

        ctx.stroke();

        points.forEach(
            point => {
                const screen =
                    imageToScreen(
                        point.x,
                        point.y
                    );

                ctx.beginPath();

                ctx.arc(
                    screen.x,
                    screen.y,
                    4,
                    0,
                    Math.PI * 2
                );

                ctx.fill();
            }
        );
    }

    ctx.restore();
}
/* ============================================================
   HISTORY
============================================================ */

function cloneAnnotations(annotations) {
    return annotations.map(
        a => ({
            ...a,
            points: a.points
                ? a.points.map(
                    p => ({
                        x: p.x,
                        y: p.y
                    })
                )
                : undefined
        })
    );
}

function resetHistory(annotations) {
    state.history = [
        cloneAnnotations(
            annotations
        )
    ];

    state.historyIndex = 0;

    updateUndoRedoButtons();
}

function pushHistory() {
    const snapshot =
        cloneAnnotations(
            state.annotations
        );

    if (
        state.historyIndex <
        state.history.length - 1
    ) {
        state.history =
            state.history.slice(
                0,
                state.historyIndex + 1
            );
    }

    state.history.push(
        snapshot
    );

    state.historyIndex =
        state.history.length - 1;

    if (
        state.history.length > 100
    ) {
        state.history.shift();
        state.historyIndex--;
    }

    updateUndoRedoButtons();
}

function undo() {
    if (
        state.historyIndex <= 0
    ) {
        return;
    }

    state.historyIndex--;

    state.annotations =
        cloneAnnotations(
            state.history[
                state.historyIndex
            ]
        );

    state.selectedId = null;

    updateCounts();
    updateAnnotationsList();
    hidePopup();

    saveFrame();
    saveSession();

    updateUndoRedoButtons();
    render();
}

function redo() {
    if (
        state.historyIndex >=
        state.history.length - 1
    ) {
        return;
    }

    state.historyIndex++;

    state.annotations =
        cloneAnnotations(
            state.history[
                state.historyIndex
            ]
        );

    state.selectedId = null;

    updateCounts();
    updateAnnotationsList();
    hidePopup();

    saveFrame();
    saveSession();

    updateUndoRedoButtons();
    render();
}

function updateUndoRedoButtons() {
    const undoButton =
        $("undoButton");

    const redoButton =
        $("redoButton");

    if (undoButton) {
        undoButton.disabled =
            state.historyIndex <= 0;
    }

    if (redoButton) {
        redoButton.disabled =
            state.historyIndex >=
            state.history.length - 1;
    }
}

$("undoButton")?.addEventListener(
    "click",
    undo
);

$("redoButton")?.addEventListener(
    "click",
    redo
);

/* ============================================================
   ANNOTATION POPUP
============================================================ */

function renderPopup(a) {
    if (!popupEl) return;

    popupTitle.textContent =
        a.label || "Annotation";

    popupEl.style.display =
        "block";

    popupEl.dataset.id =
        a.id;

    positionPopup(a);
    renderPopupBody(a);
}

function positionPopup(a) {
    if (!popupEl) return;

    let x;
    let y;

    if (a.type === "box") {
        const topLeft =
            imageToScreen(
                a.x,
                a.y
            );

        x =
            topLeft.x +
            Math.max(
                8,
                a.width *
                    state.scale
            );

        y =
            topLeft.y;
    } else if (
        a.points &&
        a.points.length
    ) {
        const p =
            imageToScreen(
                a.points[0].x,
                a.points[0].y
            );

        x = p.x + 15;
        y = p.y;
    } else {
        x = 20;
        y = 20;
    }

    const rect =
        workspace.getBoundingClientRect();

    const popupWidth =
        popupEl.offsetWidth || 220;

    const popupHeight =
        popupEl.offsetHeight || 200;

    x = Math.max(
        5,
        Math.min(
            x,
            rect.width -
                popupWidth -
                5
        )
    );

    y = Math.max(
        5,
        Math.min(
            y,
            rect.height -
                popupHeight -
                5
        )
    );

    popupEl.style.left =
        `${x}px`;

    popupEl.style.top =
        `${y}px`;
}

function renderPopupBody(a) {
    if (!popupBody) return;

    popupBody.innerHTML = `
        <div class="ann-popup-summary">
            <span class="ann-chip">${escapeHTML(a.type)}</span>
            <span class="ann-chip">Occlusion ${Number(a.occlusion ?? 0)}%</span>
            <span class="ann-chip">Truncation ${escapeHTML(a.truncation || "NONE")}</span>
            ${a.aiGenerated ? `<span class="ann-chip">AI</span>` : ""}
            ${a.corrected ? `<span class="ann-chip">Corrected</span>` : ""}
        </div>

        <div class="class-field">
            <label>Classification / Class</label>
            <input
                id="popupClassInput"
                value="${escapeHTML(a.label || "unknown")}"
                placeholder="Object class"
            >
        </div>

        <div class="class-field">
            <label>Occlusion</label>
            <select id="popupOcclusion">
                ${[0,10,20,30,40,50,60,70,80,90,100]
                    .map(v =>
                        `<option value="${v}" ${Number(a.occlusion ?? 0) === v ? "selected" : ""}>${v}%</option>`
                    )
                    .join("")}
            </select>
        </div>

        <div class="class-field">
            <label>Truncation</label>
            <select id="popupTruncation">
                ${["NONE","LEFT","RIGHT","TOP","BOTTOM","MULTIPLE"]
                    .map(v =>
                        `<option value="${v}" ${a.truncation === v ? "selected" : ""}>${v}</option>`
                    )
                    .join("")}
            </select>
        </div>

        <label class="checkbox-row">
            <input
                id="popupExport"
                type="checkbox"
                ${a.export !== false ? "checked" : ""}
            >
            Include in export
        </label>
    `;

    const classInput =
        $("popupClassInput");

    const occlusion =
        $("popupOcclusion");

    const truncation =
        $("popupTruncation");

    const exportInput =
        $("popupExport");

    classInput?.addEventListener(
        "change",
        () => {
            a.label =
                classInput.value.trim() ||
                "unknown";

            a.corrected = true;

            updateAnnotationsList();
            saveFrame();
            saveSession();
            cloudSaveAnnotation(a);
            render();
        }
    );

    occlusion?.addEventListener(
        "change",
        () => {
            a.occlusion =
                Number(
                    occlusion.value
                );

            a.corrected = true;

            updateAnnotationsList();
            saveFrame();
            saveSession();
            cloudSaveAnnotation(a);
            render();
        }
    );

    truncation?.addEventListener(
        "change",
        () => {
            a.truncation =
                truncation.value;

            a.corrected = true;

            updateAnnotationsList();
            saveFrame();
            saveSession();
            cloudSaveAnnotation(a);
            render();
        }
    );

    exportInput?.addEventListener(
        "change",
        () => {
            a.export =
                exportInput.checked;

            saveFrame();
            saveSession();
            cloudSaveAnnotation(a);
            updateAnnotationsList();
        }
    );

    if (popupEl) {
        positionPopup(a);
    }
}

popupExpandBtn?.addEventListener(
    "click",
    () => {
        state.popupExpanded =
            !state.popupExpanded;

        popupEl?.classList.toggle(
            "expanded",
            state.popupExpanded
        );

        popupExpandBtn.classList.toggle(
            "expanded",
            state.popupExpanded
        );
    }
);

function hidePopup() {
    if (!popupEl) return;

    popupEl.style.display =
        "none";

    popupEl.dataset.id = "";
}

/* ============================================================
   ANNOTATION LIST
============================================================ */

function updateAnnotationsList() {
    if (!annotationsList) return;

    if (
        !state.annotations.length
    ) {
        annotationsList.innerHTML = `
            <div class="details-empty">
                <div class="details-icon">□</div>
                <strong>No annotations yet</strong>
                <span>Draw a box, polygon, or run Auto Annotate.</span>
            </div>
        `;

        return;
    }

    annotationsList.innerHTML =
        state.annotations.map(
            a => {
                const dotColor =
                    state.colorMode ===
                    "occlusion"
                        ? occlusionColor(
                            a.occlusion
                        )
                        : state.colorMode ===
                          "truncation"
                            ? truncationColor(
                                a.truncation
                            )
                            : null;

                const dotStyle =
                    dotColor
                        ? ` style="background:${dotColor}"`
                        : "";

                return `
                    <div
                        class="ann-row ${a.id === state.selectedId ? "selected" : ""}"
                        data-id="${escapeHTML(a.id)}"
                    >
                        <span
                            class="ann-row-dot"
                            ${dotStyle}
                        ></span>

                        <div class="ann-row-main">
                            <div class="ann-row-label">
                                ${escapeHTML(a.label || "unknown")}
                            </div>

                            <div class="ann-row-meta">
                                ${escapeHTML(a.type)}
                                •
                                ${a.corrected ? "corrected" : "AI"}
                            </div>
                        </div>

                        <span class="ann-row-badge">
                            ${a.occlusion ?? 0}%
                        </span>
                    </div>
                `;
            }
        ).join("");

    annotationsList
        .querySelectorAll(".ann-row")
        .forEach(row => {
            row.addEventListener(
                "click",
                () => {
                    state.selectedId =
                        row.dataset.id;

                    updateSelected();
                }
            );
        });
}

function updateCounts() {
    const count =
        state.annotations.length;

    const annotationCount =
        $("annotationCount");

    if (annotationCount) {
        annotationCount.textContent =
            count;
    }

    const selectedCount =
        $("selectedCount");

    if (selectedCount) {
        selectedCount.textContent =
            state.selectedId
                ? "1 selected"
                : "0 selected";
    }

    if (
        state.mediaType ===
        "video"
    ) {
        updateFilmstripTicks();
    }
}

/* ============================================================
   OCCLUSION / TRUNCATION COLORS
============================================================ */

function occlusionColor(value) {
    const v =
        Number(value ?? 0);

    if (v >= 80) return "#ef4444";
    if (v >= 50) return "#f59e0b";
    if (v >= 20) return "#eab308";

    return "#22c55e";
}

function truncationColor(value) {
    if (
        !value ||
        value === "NONE"
    ) {
        return "#22c55e";
    }

    return "#f97316";
}

/* ============================================================
   COLOR MODE
============================================================ */

$("colorMode")?.addEventListener(
    "change",
    event => {
        state.colorMode =
            event.target.value;

        updateAnnotationsList();
        render();
    }
);

function updateColorLegend() {
    const legend =
        $("colorLegend");

    if (!legend) return;

    legend.innerHTML = `
        <span class="legend-chip">
            <span
                class="legend-dot"
                style="background:#22c55e"
            ></span>
            Clear
        </span>

        <span class="legend-chip">
            <span
                class="legend-dot"
                style="background:#eab308"
            ></span>
            Partial
        </span>

        <span class="legend-chip">
            <span
                class="legend-dot"
                style="background:#ef4444"
            ></span>
            Heavy
        </span>
    `;
}

/* ============================================================
   VIDEO FRAME ANNOTATIONS
============================================================ */

function saveFrame() {
    if (
        state.mediaType !==
        "video"
    ) {
        return;
    }

    state.frameAnnotations.set(
        state.currentFrame,
        cloneAnnotations(
            state.annotations
        )
    );

    updateFilmstripTicks();
    cloudSaveCurrentFrame();
}

function loadFrameAnnotations() {
    if (
        state.mediaType !==
        "video"
    ) {
        return;
    }

    const saved =
        state.frameAnnotations.get(
            state.currentFrame
        );

    state.annotations =
        saved
            ? cloneAnnotations(saved)
            : [];

    state.selectedId = null;

    resetHistory(
        state.annotations
    );

    updateCounts();
    updateAnnotationsList();
    hidePopup();
}

function buildFilmstrip() {
    if (!filmstripTrack) return;

    filmstripTrack.innerHTML = "";

    const total =
        Math.min(
            state.totalFrames || 1,
            1000
        );

    for (
        let i = 0;
        i < total;
        i++
    ) {
        const tick =
            document.createElement(
                "button"
            );

        tick.type = "button";
        tick.className =
            "filmstrip-tick";

        tick.dataset.frame =
            String(i);

        tick.title =
            `Frame ${i}`;

        tick.addEventListener(
            "click",
            () => {
                pauseVideo();
                seekVideoFrame(i);
            }
        );

        filmstripTrack.appendChild(
            tick
        );
    }

    updateFilmstripTicks();
}

function updateFilmstripTicks() {
    if (!filmstripTrack) return;

    const ticks =
        filmstripTrack.querySelectorAll(
            ".filmstrip-tick"
        );

    ticks.forEach(tick => {
        const frame =
            Number(
                tick.dataset.frame
            );

        const anns =
            state.frameAnnotations.get(
                frame
            ) || [];

        tick.classList.toggle(
            "has-ann",
            anns.length > 0
        );

        tick.classList.toggle(
            "current",
            frame ===
                state.currentFrame
        );
    });
}

function updateFilmstripCurrent() {
    if (!filmstripCurrentLabel) {
        return;
    }

    filmstripCurrentLabel.textContent =
        `Frame ${state.currentFrame}`;
}

function updateVideoUI() {
    $("currentFrame").textContent =
        state.currentFrame;

    $("totalFrames").textContent =
        state.totalFrames;

    $("frameSlider").value =
        state.currentFrame;

    $("videoTime").textContent =
        formatTime(
            state.currentTime
        );

    updateFilmstripCurrent();
}

function formatTime(seconds) {
    const minutes =
        Math.floor(
            seconds / 60
        );

    const secs =
        Math.floor(
            seconds % 60
        );

    const millis =
        Math.floor(
            (seconds % 1) * 1000
        );

    return (
        String(minutes).padStart(
            2,
            "0"
        ) +
        ":" +
        String(secs).padStart(
            2,
            "0"
        ) +
        "." +
        String(millis).padStart(
            3,
            "0"
        )
    );
}

/* ============================================================
   ZOOM UI
============================================================ */

function updateZoomUI() {
    const percent =
        Math.round(
            state.scale * 100
        );

    $("zoomValue").textContent =
        percent + "%";

    $("footerZoom").textContent =
        percent + "%";
}

/* ============================================================
   AI STATUS
============================================================ */

function setAIStatus(message) {
    $("aiStatus").textContent =
        message;
}

/* ============================================================
   AI MODEL LOADING
============================================================ */

async function getDetectionPipeline() {
    if (state.detr) {
        return state.detr;
    }

    setAIStatus(
        "Loading AI model…"
    );

    state.detr =
        await pipeline(
            "object-detection",
            MODELS.detr
        );

    setAIStatus(
        "AI model ready"
    );

    return state.detr;
}

async function getYoloPipeline() {
    if (state.yolo) {
        return state.yolo;
    }

    setAIStatus(
        "Loading YOLO model…"
    );

    state.yolo =
        await pipeline(
            "object-detection",
            MODELS.yolo
        );

    setAIStatus(
        "AI model ready"
    );

    return state.yolo;
}

async function getSegmentationPipeline() {
    if (state.segmenter) {
        return state.segmenter;
    }

    setAIStatus(
        "Loading segmentation model…"
    );

    state.segmenter =
        await pipeline(
            "image-segmentation",
            MODELS.panoptic
        );

    setAIStatus(
        "Segmentation model ready"
    );

    return state.segmenter;
}

/* ============================================================
   AI ENGINE
============================================================ */

$("runAI")?.addEventListener(
    "click",
    runAutoAnnotate
);

async function runAutoAnnotate() {
    if (!state.image) {
        showToast(
            "Load an image or video frame first."
        );

        return;
    }

    if (state.aiRunning) {
        return;
    }

    state.aiRunning = true;

    try {
        if (
            state.annotationType ===
            "box"
        ) {
            await runBoxAI();
        } else {
            await runSegmentationAI();
        }
    } catch (error) {
        console.error(error);

        setAIStatus(
            "AI error: " +
            error.message
        );

        showToast(
            "AI annotation failed"
        );
    } finally {
        state.aiRunning = false;
    }
}

/* ============================================================
   BOX AI
============================================================ */

async function runBoxAI() {
    const engine =
        $("aiEngine").value;

    const detector =
        engine === "yolo"
            ? await getYoloPipeline()
            : await getDetectionPipeline();

    const threshold =
        Number(
            $("confidence").value ||
            0.35
        );

    const rules =
        parseAnnotationRules();

    setAIStatus(
        "Running automatic annotation…"
    );

    const results =
        await detector(
            state.image,
            {
                threshold
            }
        );

    let added = 0;

    for (
        const result of results
    ) {
        const label =
            normalizeLabel(
                result.label
            );

        if (
            !passesRules(
                label,
                result.score,
                rules
            )
        ) {
            continue;
        }

        const box =
            result.box;

        const annotation =
            createAnnotation({
                type: "box",

                x: box.xmin,
                y: box.ymin,

                width:
                    box.xmax -
                    box.xmin,

                height:
                    box.ymax -
                    box.ymin,

                label:
                    rules.rename[
                        label
                    ] || label,

                score:
                    result.score,

                occlusion: 0,
                truncation: "NONE",

                aiGenerated: true,
                corrected: false
            });

        added++;

        setAIStatus(
            `AI annotated ${added} object${added === 1 ? "" : "s"}…`
        );
    }

    pushHistory();
    saveFrame();
    saveSession();

    setAIStatus(
        `AI complete — ${added} object${added === 1 ? "" : "s"} added`
    );

    showToast(
        `${added} AI annotation${added === 1 ? "" : "s"} added`
    );
}

/* ============================================================
   SEGMENTATION AI
============================================================ */

async function runSegmentationAI() {
    const segmenter =
        await getSegmentationPipeline();

    const threshold =
        Number(
            $("confidence").value ||
            0.35
        );

    const rules =
        parseAnnotationRules();

    setAIStatus(
        "Running segmentation…"
    );

    const results =
        await segmenter(
            state.image
        );

    let added = 0;

    for (
        const result of results
    ) {
        const label =
            normalizeLabel(
                result.label ||
                result.class ||
                "object"
            );

        const score =
            Number(
                result.score ??
                result.confidence ??
                1
            );

        if (
            score < threshold ||
            !passesRules(
                label,
                score,
                rules
            )
        ) {
            continue;
        }

        const points =
            maskToPolygon(
                result.mask
            );

        if (
            !points ||
            points.length < 3
        ) {
            continue;
        }

        createAnnotation({
            type:
                state.annotationType,

            points,

            label:
                rules.rename[
                    label
                ] || label,

            score,

            occlusion: 0,
            truncation: "NONE",

            aiGenerated: true,
            corrected: false
        });

        added++;
    }

    pushHistory();
    saveFrame();
    saveSession();

    setAIStatus(
        `Segmentation complete — ${added} object${added === 1 ? "" : "s"} added`
    );

    showToast(
        `${added} segmentation annotation${added === 1 ? "" : "s"} added`
    );
}

/* ============================================================
   LABEL / RULE HELPERS
============================================================ */

function normalizeLabel(label) {
    const normalized =
        String(
            label || "unknown"
        )
            .trim()
            .toLowerCase();

    return (
        LABEL_ALIASES[
            normalized
        ] ||
        normalized
    );
}

function parseAnnotationRules() {
    const text =
        $("annotationRules")?.value ||
        "";

    let include = [];
    let exclude = [];
    const rename = {};

    let minimum =
        Number(
            $("confidence").value
        );

    const rules =
        text
            .split(/\r?\n/)
            .map(
                line =>
                    line.trim()
            )
            .filter(Boolean);

    for (
        const line of rules
    ) {
        const lower =
            line.toLowerCase();

        if (
            lower.startsWith(
                "include:"
            )
        ) {
            include =
                line
                    .split(":")
                    .slice(1)
                    .join(":")
                    .split(",")
                    .map(
                        normalizeLabel
                    )
                    .filter(Boolean);
        }

        if (
            lower.startsWith(
                "exclude:"
            )
        ) {
            exclude =
                line
                    .split(":")
                    .slice(1)
                    .join(":")
                    .split(",")
                    .map(
                        normalizeLabel
                    )
                    .filter(Boolean);
        }

        if (
            lower.startsWith(
                "rename:"
            )
        ) {
            const values =
                line
                    .split(":")
                    .slice(1)
                    .join(":")
                    .split(",");

            values.forEach(
                pair => {
                    const pieces =
                        pair.split("=");

                    if (
                        pieces.length ===
                        2
                    ) {
                        rename[
                            normalizeLabel(
                                pieces[0]
                            )
                        ] =
                            normalizeLabel(
                                pieces[1]
                            );
                    }
                }
            );
        }

        if (
            lower.startsWith(
                "min_confidence:"
            )
        ) {
            minimum =
                Number(
                    line
                        .split(":")
                        .slice(1)
                        .join(":")
                );
        }
    }

    return {
        include,
        exclude,
        rename,
        minimum:
            Number.isFinite(
                minimum
            )
                ? minimum
                : 0.35
    };
}

function passesRules(
    label,
    score,
    rules
) {
    if (
        score <
        rules.minimum
    ) {
        return false;
    }

    if (
        rules.include.length &&
        !rules.include.includes(
            label
        )
    ) {
        return false;
    }

    if (
        rules.exclude.includes(
            label
        )
    ) {
        return false;
    }

    return true;
}
/* ============================================================
   MASK → POLYGON
============================================================ */

function maskToPolygon(mask) {
    if (!mask) {
        return null;
    }

    /*
     * Transformers.js may return a mask as:
     * - an HTML canvas
     * - ImageData
     * - nested arrays
     * - an object containing data/width/height
     */

    let width = 0;
    let height = 0;
    let data = null;

    if (
        mask instanceof
        HTMLCanvasElement
    ) {
        width =
            mask.width;

        height =
            mask.height;

        const imageData =
            mask
                .getContext("2d")
                .getImageData(
                    0,
                    0,
                    width,
                    height
                );

        data =
            imageData.data;
    } else if (
        mask instanceof ImageData
    ) {
        width =
            mask.width;

        height =
            mask.height;

        data =
            mask.data;
    } else if (
        mask.data &&
        mask.width &&
        mask.height
    ) {
        width =
            mask.width;

        height =
            mask.height;

        data =
            mask.data;
    }

    if (
        !data ||
        !width ||
        !height
    ) {
        return null;
    }

    const points = [];

    /*
     * Sample the mask at a reasonable interval and
     * generate an approximate boundary.
     */
    const step =
        Math.max(
            1,
            Math.floor(
                Math.min(
                    width,
                    height
                ) / 150
            )
        );

    for (
        let y = 0;
        y < height;
        y += step
    ) {
        for (
            let x = 0;
            x < width;
            x += step
        ) {
            const index =
                (y * width + x) *
                4;

            const alpha =
                data[index + 3] ??
                data[index] ??
                0;

            if (
                alpha > 80
            ) {
                const left =
                    x > 0
                        ? data[
                            (y * width +
                                (x - 1)) *
                                4 +
                            3
                        ] || 0
                        : 0;

                const right =
                    x + 1 < width
                        ? data[
                            (y * width +
                                (x + 1)) *
                                4 +
                            3
                        ] || 0
                        : 0;

                const top =
                    y > 0
                        ? data[
                            ((y - 1) *
                                width +
                                x) *
                                4 +
                            3
                        ] || 0
                        : 0;

                const bottom =
                    y + 1 < height
                        ? data[
                            ((y + 1) *
                                width +
                                x) *
                                4 +
                            3
                        ] || 0
                        : 0;

                if (
                    left <= 80 ||
                    right <= 80 ||
                    top <= 80 ||
                    bottom <= 80
                ) {
                    points.push({
                        x,
                        y
                    });
                }
            }
        }
    }

    /*
     * If no useful boundary was found, return null.
     */
    if (
        points.length < 3
    ) {
        return null;
    }

    /*
     * Scale mask coordinates to original image coordinates.
     */
    const imageWidth =
        state.image?.naturalWidth ||
        state.image?.width ||
        width;

    const imageHeight =
        state.image?.naturalHeight ||
        state.image?.height ||
        height;

    const sx =
        imageWidth / width;

    const sy =
        imageHeight / height;

    return points.map(
        p => ({
            x: p.x * sx,
            y: p.y * sy
        })
    );
}

/* ============================================================
   EXPORT IMAGE
============================================================ */

$("exportImage").addEventListener(
    "click",
    exportAnnotatedImage
);

function exportAnnotatedImage() {
    if (!state.image) {
        alert(
            "Load an image or video frame first."
        );

        return;
    }

    const width =
        state.image.naturalWidth ||
        state.image.width;

    const height =
        state.image.naturalHeight ||
        state.image.height;

    const output =
        document.createElement(
            "canvas"
        );

    output.width =
        width;

    output.height =
        height;

    const outputContext =
        output.getContext(
            "2d"
        );

    outputContext.drawImage(
        state.image,
        0,
        0,
        width,
        height
    );

    state.annotations
        .filter(
            a =>
                a.export !== false
        )
        .forEach(
            a =>
                drawExportAnnotation(
                    outputContext,
                    a
                )
        );

    output.toBlob(
        blob => {
            downloadBlob(
                blob,
                safeFilename(
                    "annotated.png"
                )
            );
        },
        "image/png"
    );
}

function drawExportAnnotation(
    context,
    a
) {
    context.save();

    context.strokeStyle =
        "#00ff55";

    context.fillStyle =
        "rgba(0,255,85,.18)";

    context.lineWidth = 3;

    if (
        a.type === "box"
    ) {
        context.strokeRect(
            a.x,
            a.y,
            a.width,
            a.height
        );

        context.font =
            "bold 18px Arial";

        context.fillStyle =
            "#00ff55";

        context.fillText(
            a.label ||
                "unknown",
            a.x,
            Math.max(
                18,
                a.y - 5
            )
        );
    } else {
        context.beginPath();

        a.points.forEach(
            (point, index) => {
                if (
                    index === 0
                ) {
                    context.moveTo(
                        point.x,
                        point.y
                    );
                } else {
                    context.lineTo(
                        point.x,
                        point.y
                    );
                }
            }
        );

        context.closePath();

        if (
            a.type ===
            "segmentation"
        ) {
            context.fill();
        }

        context.stroke();
    }

    context.restore();
}

/* ============================================================
   TRAINING JSON
============================================================ */

$("exportJSON").addEventListener(
    "click",
    exportTrainingJSON
);

function exportTrainingJSON() {
    if (
        state.mediaType ===
        "video"
    ) {
        saveFrame();

        const frames = [];

        const keys =
            [
                ...state
                    .frameAnnotations
                    .keys()
            ].sort(
                (a, b) =>
                    a - b
            );

        keys.forEach(
            frame => {
                const annotations =
                    state
                        .frameAnnotations
                        .get(
                            frame
                        ) || [];

                frames.push({
                    frame,
                    time:
                        frame /
                        state.fps,
                    annotations:
                        exportAnnotations(
                            annotations
                        )
                });
            }
        );

        const data = {
            version: "1.0",
            mediaType: "video",
            source:
                $("fileName")
                    .textContent,
            fps: state.fps,
            frames
        };

        downloadJSON(
            data,
            safeFilename(
                "training-data.json"
            )
        );

        return;
    }

    const data = {
        version: "1.0",
        mediaType: "image",
        source:
            $("fileName")
                .textContent,
        annotations:
            exportAnnotations(
                state.annotations
            )
    };

    downloadJSON(
        data,
        safeFilename(
            "training-data.json"
        )
    );
}

function exportAnnotations(
    annotations
) {
    return annotations
        .filter(
            a =>
                a.export !== false
        )
        .map(
            a => ({
                id: a.id,
                type: a.type,
                label:
                    a.label ||
                    "unknown",
                score:
                    a.score,
                occlusion:
                    a.occlusion ??
                    0,
                truncation:
                    a.truncation ||
                    "NONE",
                ai_generated:
                    !!a.aiGenerated,
                corrected:
                    !!a.corrected,

                ...(a.type ===
                "box"
                    ? {
                        x: a.x,
                        y: a.y,
                        width:
                            a.width,
                        height:
                            a.height
                    }
                    : {
                        points:
                            a.points
                                ? a.points.map(
                                    p => ({
                                        x:
                                            p.x,
                                        y:
                                            p.y
                                    })
                                )
                                : []
                    })
            })
        );
}

/* ============================================================
   CUSTOMER EXPORTS
============================================================ */

// Customer export — copy directly into Google Sheets,
// plus CSV and HTML report.
$("exportCustomerSheets")?.addEventListener(
    "click",
    exportCustomerToGoogleSheets
);

$("exportCustomerHTML")?.addEventListener(
    "click",
    exportCustomerToHTML
);

async function getCustomerExportRows() {
    const rows = [];

    const source =
        $("fileName")
            ?.textContent ||
        "customer";

    const taskId =
        CLOUD.currentTaskId ||
        "";

    const add =
        (frame, a) =>
            rows.push({
                task_id:
                    taskId,

                source,

                frame,

                annotation_id:
                    a.id || "",

                type:
                    a.type || "",

                class:
                    a.label ||
                    "unknown",

                score:
                    a.score ??
                    "",

                occlusion:
                    a.occlusion ??
                    0,

                truncation:
                    a.truncation ||
                    "NONE",

                ai_generated:
                    !!a.aiGenerated,

                corrected:
                    !!a.corrected,

                export:
                    a.export !==
                    false,

                geometry:
                    a.type === "box"
                        ? JSON.stringify({
                            x: a.x,
                            y: a.y,
                            width:
                                a.width,
                            height:
                                a.height
                        })
                        : JSON.stringify(
                            a.points ||
                            []
                        )
            });

    if (
        state.mediaType ===
        "video"
    ) {
        saveFrame();

        [
            ...state
                .frameAnnotations
                .entries()
        ]
            .sort(
                (a, b) =>
                    a[0] -
                    b[0]
            )
            .forEach(
                ([frame, anns]) =>
                    anns
                        .filter(
                            a =>
                                a.export !==
                                false
                        )
                        .forEach(
                            a =>
                                add(
                                    frame,
                                    a
                                )
                        )
            );
    } else {
        state.annotations
            .filter(
                a =>
                    a.export !==
                    false
            )
            .forEach(
                a =>
                    add(
                        0,
                        a
                    )
            );
    }

    return {
        source,
        taskId,
        rows
    };
}

async function exportCustomerToGoogleSheets() {
    const payload =
        await getCustomerExportRows();

    if (
        !payload.rows.length
    ) {
        showToast(
            "No exportable annotations yet."
        );

        return;
    }

    const headers =
        Object.keys(
            payload.rows[0]
        );

    const tsv = [
        headers.join(
            "\t"
        ),

        ...payload.rows.map(
            r =>
                headers
                    .map(
                        h =>
                            String(
                                r[h] ??
                                ""
                            )
                                .replaceAll(
                                    "\t",
                                    " "
                                )
                                .replaceAll(
                                    "\n",
                                    " "
                                )
                    )
                    .join(
                        "\t"
                    )
        )
    ].join("\n");

    const csv = [
        headers.join(","),
        ...payload.rows.map(
            r =>
                headers
                    .map(
                        h =>
                            `"${String(
                                r[h] ??
                                ""
                            ).replaceAll(
                                '"',
                                '""'
                            )}"`
                    )
                    .join(",")
        )
    ].join("\n");

    try {
        await navigator.clipboard.writeText(
            tsv
        );

        showToast(
            "Copied for Google Sheets ✓ — paste into cell A1"
        );
    } catch {
        const ta =
            document.createElement(
                "textarea"
            );

        ta.value = tsv;

        document.body.appendChild(
            ta
        );

        ta.select();

        document.execCommand(
            "copy"
        );

        ta.remove();

        showToast(
            "Copied for Google Sheets ✓"
        );
    }

    // Also provide a standard CSV file,
    // which Google Sheets can import.
    downloadBlob(
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        ),
        `customer-annotations-${safeName(
            payload.source
        )}.csv`
    );
}

async function exportCustomerToHTML() {
    const payload =
        await getCustomerExportRows();

    if (
        !payload.rows.length
    ) {
        showToast(
            "No exportable annotations yet."
        );

        return;
    }

    const headers =
        Object.keys(
            payload.rows[0]
        );

    const table =
        `<table><thead><tr>${headers
            .map(
                h =>
                    `<th>${esc(h)}</th>`
            )
            .join("")}</tr></thead><tbody>${payload.rows
            .map(
                r =>
                    `<tr>${headers
                        .map(
                            h =>
                                `<td>${esc(
                                    r[h]
                                )}</td>`
                        )
                        .join("")}</tr>`
            )
            .join("")}</tbody></table>`;

    const html =
        `<!doctype html><html><head><meta charset="utf-8"><title>Customer Annotation Report</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{font-size:22px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:7px;text-align:left;vertical-align:top}th{background:#eee}td{max-width:500px;word-break:break-word}</style></head><body><h1>Customer Annotation Report</h1><p><strong>Source:</strong> ${esc(
            payload.source
        )}<br><strong>Task ID:</strong> ${esc(
            payload.taskId ||
                "local-session"
        )}<br><strong>Annotations:</strong> ${
            payload.rows.length
        }<br><strong>Exported:</strong> ${esc(
            new Date().toLocaleString()
        )}</p>${table}</body></html>`;

    downloadBlob(
        new Blob(
            [html],
            {
                type:
                    "text/html;charset=utf-8"
            }
        ),
        `customer-annotations-${safeName(
            payload.source
        )}.html`
    );

    showToast(
        "Customer HTML report exported ✓"
    );
}

function safeName(v) {
    return String(
        v || "export"
    )
        .replace(
            /[^a-z0-9_-]+/gi,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            ""
        )
        .slice(
            0,
            80
        ) || "export";
}

/* ============================================================
   ADMIN TASK CREATION
============================================================ */

// Admin creates customer task from the media currently loaded
// in the workspace.
$("createTaskBtn")?.addEventListener(
    "click",
    createTaskFromCurrentMedia
);

async function createTaskFromCurrentMedia() {
    if (
        !hasAllAccess() ||
        !state.mediaType
    ) {
        return;
    }

    const fileName =
        $("fileName")
            .textContent;

    const blob =
        state.mediaType ===
        "image"
            ? await imageToBlob(
                state.image
            )
            : await videoBlobFromSource();

    const ext =
        fileName.includes(".")
            ? fileName
                .split(".")
                .pop()
            : state.mediaType ===
              "video"
                ? "mp4"
                : "jpg";

    const path =
        `${crypto.randomUUID()}.${ext}`;

    const up =
        await supabase.storage
            .from(
                "task-media"
            )
            .upload(
                path,
                blob,
                {
                    upsert: false,
                    contentType:
                        blob.type ||
                        "application/octet-stream"
                }
            );

    if (up.error) {
        showToast(
            up.error.message
        );

        return;
    }

    const type =
        $("newTaskType")
            .value;

    const mins =
        Number(
            $("newTaskDuration")
                .value ||
            30
        );

    const pay =
        Number(
            $("newTaskPay")
                .value ||
            0
        );

    if (pay <= 0) {
        showToast(
            "Enter the admin payment amount before releasing work."
        );

        return;
    }

    const {
        data,
        error
    } =
        await supabase
            .from("tasks")
            .insert({
                title:
                    fileName,

                source_name:
                    fileName,

                media_type:
                    state.mediaType,

                media_path:
                    path,

                work_type:
                    type,

                work_role:
                    WORK_ROLE[
                        type
                    ],

                expected_minutes:
                    mins,

                pay_amount:
                    pay,

                status:
                    "available",

                released_by:
                    CLOUD.session
                        .user.id
            })
            .select()
            .single();

    if (error) {
        await supabase
            .storage
            .from(
                "task-media"
            )
            .remove([
                path
            ]);

        showToast(
            error.message
        );

        return;
    }

    await supabase
        .from(
            "task_payments"
        )
        .insert({
            task_id:
                data.id,

            user_id:
                null,

            amount:
                pay,

            status:
                "not_paid"
        });

    showToast(
        `Task ${data.id.slice(
            0,
            8
        )} created ✓`
    );

    await refreshMyTasks();
}

function imageToBlob(
    image
) {
    return new Promise(
        resolve => {
            const c =
                document.createElement(
                    "canvas"
                );

            c.width =
                image.naturalWidth ||
                image.width;

            c.height =
                image.naturalHeight ||
                image.height;

            c.getContext(
                "2d"
            ).drawImage(
                image,
                0,
                0
            );

            c.toBlob(
                resolve,
                "image/jpeg",
                0.92
            );
        }
    );
}

async function videoBlobFromSource() {
    const r =
        await fetch(
            state.videoURL
        );

    return await r.blob();
}

/* ============================================================
   ACTIVITY
============================================================ */

async function logActivity(
    type,
    metadata = {}
) {
    try {
        await supabase.rpc(
            "log_activity",
            {
                p_event_type:
                    type,

                p_metadata:
                    metadata
            }
        );
    } catch (e) {
        console.warn(e);
    }
}

/* ============================================================
   THEME
============================================================ */

applyTheme(
    localStorage.getItem(
        "annotation_theme"
    ) || "dark"
);

initCloud();
/* ============================================================
   SUPABASE / CLOUD WORKSPACE
============================================================ */

const SUPABASE_URL =
    "https://ozcwfcfcwzjjanxfvico.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ";

const supabase =
    createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                persistSession:
                    true,

                autoRefreshToken:
                    true,

                detectSessionInUrl:
                    true
            }
        }
    );

const ALL_ROLES = [
    "customer",
    "staff",
    "reviewer",
    "coworker_2d_box",
    "coworker_polygon",
    "coworker_segmentation",
    "admin"
];

const WORK_ROLE = {
    "2d_box":
        "coworker_2d_box",

    polygon:
        "coworker_polygon",

    segmentation:
        "coworker_segmentation"
};

const CLOUD = {
    session: null,
    profile: null,
    currentTaskId: null,
    currentTask: null,
    channel: null,
    ready: false
};

window.CLOUD = CLOUD;

/* ============================================================
   ROLE HELPERS
============================================================ */

function currentRole() {
    return (
        CLOUD.profile?.role ||
        "customer"
    );
}

function hasAllAccess() {
    return (
        currentRole() ===
            "admin" ||
        currentRole() ===
            "staff"
    );
}

function isAdmin() {
    return (
        currentRole() ===
        "admin"
    );
}

function isReviewer() {
    return (
        currentRole() ===
        "reviewer"
    );
}

function isCoworker() {
    return [
        "coworker_2d_box",
        "coworker_polygon",
        "coworker_segmentation"
    ].includes(
        currentRole()
    );
}

function canUseUpload() {
    return hasAllAccess();
}

function coworkerAllowedAnnotationType() {
    switch (
        currentRole()
    ) {
        case "coworker_2d_box":
            return "box";

        case "coworker_polygon":
            return "polygon";

        case "coworker_segmentation":
            return "segmentation";

        default:
            return null;
    }
}

/* ============================================================
   AUTH INITIALIZATION
============================================================ */

async function initCloud() {
    try {
        const {
            data
        } =
            await supabase.auth.getSession();

        await handleSession(
            data.session
        );

        supabase.auth.onAuthStateChange(
            async (
                event,
                session
            ) => {
                if (
                    event ===
                    "SIGNED_OUT"
                ) {
                    CLOUD.session =
                        null;

                    CLOUD.profile =
                        null;

                    CLOUD.ready =
                        false;

                    showAuthGate();

                    return;
                }

                await handleSession(
                    session
                );
            }
        );
    } catch (error) {
        console.error(
            "Cloud initialization failed:",
            error
        );

        showAuthGate();
    }
}

async function handleSession(
    session
) {
    CLOUD.session =
        session;

    if (!session) {
        CLOUD.profile =
            null;

        CLOUD.ready =
            false;

        showAuthGate();

        return;
    }

    await loadCloudProfile();

    CLOUD.ready =
        true;

    hideAuthGate();

    await logActivity(
        "login",
        {
            user_id:
                session.user.id
        }
    );

    enforceRoleUI();

    subscribeRealtime();

    await refreshMyTasks();

    if (
        CLOUD.profile
            ?.must_change_password
    ) {
        openPasswordResetModal();
    }
}

/* ============================================================
   AUTH GATE
============================================================ */

function showAuthGate() {
    const gate =
        $("authGate");

    if (gate) {
        gate.style.display =
            "grid";
    }
}

function hideAuthGate() {
    const gate =
        $("authGate");

    if (gate) {
        gate.style.display =
            "none";
    }
}

$("loginButton")?.addEventListener(
    "click",
    loginUser
);

$("signupButton")?.addEventListener(
    "click",
    signupUser
);

$("forgotPassword")?.addEventListener(
    "click",
    sendPasswordReset
);

$("logoutButton")?.addEventListener(
    "click",
    logoutUser
);

async function loginUser() {
    const email =
        $("authEmail")
            ?.value
            .trim();

    const password =
        $("authPassword")
            ?.value;

    if (!email || !password) {
        setAuthStatus(
            "Enter your email and password."
        );

        return;
    }

    setAuthStatus(
        "Signing in…"
    );

    const {
        error
    } =
        await supabase.auth.signInWithPassword(
            {
                email,
                password
            }
        );

    if (error) {
        setAuthStatus(
            error.message
        );

        return;
    }

    setAuthStatus(
        "Signed in ✓"
    );
}

async function signupUser() {
    const email =
        $("authEmail")
            ?.value
            .trim();

    const password =
        $("authPassword")
            ?.value;

    if (!email || !password) {
        setAuthStatus(
            "Enter an email and password."
        );

        return;
    }

    if (
        password.length < 6
    ) {
        setAuthStatus(
            "Password must be at least 6 characters."
        );

        return;
    }

    setAuthStatus(
        "Creating account…"
    );

    const {
        error
    } =
        await supabase.auth.signUp(
            {
                email,
                password
            }
        );

    if (error) {
        setAuthStatus(
            error.message
        );

        return;
    }

    setAuthStatus(
        "Account created. Check your email if confirmation is required."
    );
}

async function sendPasswordReset() {
    const email =
        $("authEmail")
            ?.value
            .trim();

    if (!email) {
        setAuthStatus(
            "Enter your email first."
        );

        return;
    }

    const {
        error
    } =
        await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo:
                    window.location.href
            }
        );

    setAuthStatus(
        error
            ? error.message
            : "Password reset email sent."
    );
}

async function logoutUser() {
    try {
        await logActivity(
            "logout",
            {}
        );
    } catch {}

    await supabase.auth.signOut();

    CLOUD.session =
        null;

    CLOUD.profile =
        null;

    CLOUD.ready =
        false;

    showAuthGate();
}

function setAuthStatus(
    message
) {
    const el =
        $("authStatus");

    if (el) {
        el.textContent =
            message;
    }
}

/* ============================================================
   PROFILE
============================================================ */

async function loadCloudProfile() {
    if (
        !CLOUD.session
            ?.user
            ?.id
    ) {
        return;
    }

    const {
        data,
        error
    } =
        await supabase
            .from("profiles")
            .select("*")
            .eq(
                "id",
                CLOUD.session
                    .user.id
            )
            .single();

    if (error) {
        console.error(
            error
        );

        return;
    }

    CLOUD.profile =
        data;

    renderProfile();
}

function renderProfile() {
    const profile =
        CLOUD.profile;

    if (!profile) return;

    const name =
        profile.display_name ||
        CLOUD.session
            ?.user
            ?.email
            ?.split("@")[0] ||
        "Worker";

    $("profileName") &&
        ($("profileName")
            .textContent =
            name);

    $("profileRole") &&
        ($("profileRole")
            .textContent =
            formatRole(
                profile.role
            ));

    if (
        profile.avatar_url
    ) {
        const avatar =
            $("profileAvatar");

        if (avatar) {
            avatar.src =
                profile.avatar_url;
        }
    }

    const role =
        $("currentRole");

    if (role) {
        role.textContent =
            formatRole(
                profile.role
            );
    }

    updateGreeting();
}

function formatRole(
    role
) {
    return String(
        role || ""
    )
        .replaceAll(
            "_",
            " "
        )
        .replace(
            /\b\w/g,
            c =>
                c.toUpperCase()
        );
}

/* ============================================================
   GREETING
============================================================ */

function updateGreeting() {
    const hour =
        new Date().getHours();

    let emoji =
        "🌙";

    if (
        hour >= 5 &&
        hour < 12
    ) {
        emoji = "🌅";
    } else if (
        hour >= 12 &&
        hour < 18
    ) {
        emoji = "☀️";
    } else if (
        hour >= 18 &&
        hour < 22
    ) {
        emoji = "🌇";
    }

    const name =
        CLOUD.profile
            ?.display_name ||
        CLOUD.session
            ?.user
            ?.email
            ?.split("@")[0] ||
        "there";

    const greeting =
        $("workspaceGreeting");

    if (greeting) {
        greeting.textContent =
            `${emoji} Welcome, ${name}`;
    }
}

/* ============================================================
   PASSWORD RESET
============================================================ */

$("passwordResetForm")
    ?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            const password =
                $("newPassword")
                    ?.value;

            const confirm =
                $("confirmPassword")
                    ?.value;

            if (
                !password ||
                password.length < 6
            ) {
                $("passwordResetStatus").textContent =
                    "Password must be at least 6 characters.";

                return;
            }

            if (
                password !==
                confirm
            ) {
                $("passwordResetStatus").textContent =
                    "Passwords do not match.";

                return;
            }

            const {
                error
            } =
                await supabase.auth.updateUser(
                    {
                        password
                    }
                );

            if (error) {
                $("passwordResetStatus").textContent =
                    error.message;

                return;
            }

            await supabase
                .from("profiles")
                .update({
                    must_change_password:
                        false
                })
                .eq(
                    "id",
                    CLOUD.session
                        .user.id
                );

            CLOUD.profile.must_change_password =
                false;

            closePasswordResetModal();

            showToast(
                "Password updated ✓"
            );
        }
    );

function openPasswordResetModal() {
    const modal =
        $("passwordResetModal");

    if (modal) {
        modal.style.display =
            "grid";
    }
}

function closePasswordResetModal() {
    const modal =
        $("passwordResetModal");

    if (modal) {
        modal.style.display =
            "none";
    }
}

/* ============================================================
   THEME
============================================================ */

$("themeToggle")?.addEventListener(
    "click",
    () => {
        const light =
            !document.body.classList.contains(
                "light"
            );

        applyTheme(
            light
                ? "light"
                : "dark"
        );
    }
);

function applyTheme(
    theme
) {
    document.body.classList.toggle(
        "light",
        theme === "light"
    );

    localStorage.setItem(
        "annotation_theme",
        theme
    );
}

/* ============================================================
   PROFILE AVATAR
============================================================ */

$("profilePictureInput")
    ?.addEventListener(
        "change",
        uploadAvatar
    );

async function uploadAvatar(event) {
    const file =
        event.target
            .files?.[0];

    if (!file) return;

    if (
        !CLOUD.session
            ?.user
            ?.id
    ) {
        return;
    }

    const extension =
        file.name.includes(".")
            ? file.name
                .split(".")
                .pop()
            : "jpg";

    const path =
        `${CLOUD.session.user.id}/${crypto.randomUUID()}.${extension}`;

    const {
        error: uploadError
    } =
        await supabase.storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    upsert:
                        true,
                    contentType:
                        file.type
                }
            );

    if (uploadError) {
        showToast(
            uploadError.message
        );

        return;
    }

    const {
        data
    } =
        supabase.storage
            .from("avatars")
            .getPublicUrl(
                path
            );

    const avatarUrl =
        data.publicUrl;

    const {
        error
    } =
        await supabase
            .from("profiles")
            .update({
                avatar_url:
                    avatarUrl
            })
            .eq(
                "id",
                CLOUD.session
                    .user.id
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    CLOUD.profile.avatar_url =
        avatarUrl;

    renderProfile();

    showToast(
        "Profile picture updated ✓"
    );
}

/* ============================================================
   TASK QUEUE
============================================================ */

async function refreshMyTasks() {
    if (
        !CLOUD.session
            ?.user
            ?.id
    ) {
        return;
    }

    const role =
        currentRole();

    let query =
        supabase
            .from("tasks")
            .select("*")
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            );

    if (
        role ===
        "coworker_2d_box"
    ) {
        query =
            query.eq(
                "work_role",
                "coworker_2d_box"
            );
    } else if (
        role ===
        "coworker_polygon"
    ) {
        query =
            query.eq(
                "work_role",
                "coworker_polygon"
            );
    } else if (
        role ===
        "coworker_segmentation"
    ) {
        query =
            query.eq(
                "work_role",
                "coworker_segmentation"
            );
    } else if (
        role === "reviewer"
    ) {
        query =
            query.in(
                "status",
                [
                    "review",
                    "in_review"
                ]
            );
    } else if (
        !hasAllAccess()
    ) {
        query =
            query.eq(
                "status",
                "available"
            );
    }

    const {
        data,
        error
    } =
        await query;

    if (error) {
        console.error(
            error
        );

        return;
    }

    renderTaskQueue(
        data || []
    );
}

function renderTaskQueue(
    tasks
) {
    const container =
        $("taskQueue");

    if (!container) {
        return;
    }

    if (!tasks.length) {
        container.innerHTML = `
            <div class="details-empty">
                <div class="details-icon">🔎</div>
                <strong>Oops, looking for more work for you</strong>
                <span>There are no matching tasks available right now.</span>
            </div>
        `;

        return;
    }

    container.innerHTML =
        tasks.map(
            task => `
                <div
                    class="task-card"
                    data-task-id="${escapeHTML(task.id)}"
                >
                    <div class="row">
                        <div>
                            <strong>
                                ${escapeHTML(
                                    task.title ||
                                    task.source_name ||
                                    "Untitled task"
                                )}
                            </strong>

                            <small>
                                ${escapeHTML(
                                    task.work_type ||
                                    ""
                                )}
                                •
                                ${formatRole(
                                    task.work_role
                                )}
                                •
                                ${Number(
                                    task.expected_minutes ||
                                    0
                                )} min
                            </small>

                            <small>
                                Pay:
                                ${formatMoney(
                                    task.pay_amount
                                )}
                                •
                                Status:
                                ${escapeHTML(
                                    task.status
                                )}
                            </small>
                        </div>

                        <button
                            type="button"
                            data-claim-task="${escapeHTML(task.id)}"
                        >
                            Claim
                        </button>
                    </div>
                </div>
            `
        ).join("");

    container
        .querySelectorAll(
            "[data-claim-task]"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () =>
                        claimTask(
                            button.dataset
                                .claimTask
                        )
                );
            }
        );
}

async function claimTask(
    taskId
) {
    const {
        data,
        error
    } =
        await supabase.rpc(
            "claim_task",
            {
                p_task_id:
                    taskId
            }
        );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    CLOUD.currentTaskId =
        taskId;

    CLOUD.currentTask =
        Array.isArray(data)
            ? data[0]
            : data;

    await loadTask(
        taskId
    );

    showToast(
        "Task claimed ✓"
    );

    await refreshMyTasks();
}

/* ============================================================
   LOAD TASK
============================================================ */

async function loadTask(
    taskId
) {
    const {
        data,
        error
    } =
        await supabase
            .from("tasks")
            .select("*")
            .eq(
                "id",
                taskId
            )
            .single();

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    CLOUD.currentTask =
        data;

    CLOUD.currentTaskId =
        data.id;

    await loadTaskMedia(
        data
    );

    await loadCloudAnnotations(
        data.id
    );

    updateTaskBar();
}

async function loadTaskMedia(
    task
) {
    if (!task.media_path) {
        return;
    }

    const {
        data,
        error
    } =
        await supabase.storage
            .from("task-media")
            .createSignedUrl(
                task.media_path,
                3600
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    cleanupMedia();

    $("fileName").textContent =
        task.source_name ||
        task.title ||
        "Task media";

    state.mediaType =
        task.media_type;

    emptyWorkspace.style.display =
        "none";

    if (
        task.media_type ===
        "video"
    ) {
        await loadRemoteVideo(
            data.signedUrl
        );
    } else {
        await loadRemoteImage(
            data.signedUrl
        );
    }

    fitView();
    render();
}

function loadRemoteImage(
    url
) {
    return new Promise(
        (resolve, reject) => {
            const image =
                new Image();

            image.onload =
                () => {
                    state.image =
                        image;

                    resolve();
                };

            image.onerror =
                () =>
                    reject(
                        new Error(
                            "Task image could not be loaded."
                        )
                    );

            image.src =
                url;
        }
    );
}

function loadRemoteVideo(
    url
) {
    return new Promise(
        (resolve, reject) => {
            state.videoURL =
                url;

            sourceVideo.src =
                url;

            sourceVideo.load();

            sourceVideo.onloadedmetadata =
                async () => {
                    state.videoDuration =
                        sourceVideo.duration;

                    state.fps =
                        30;

                    state.totalFrames =
                        Math.max(
                            1,
                            Math.ceil(
                                state.videoDuration *
                                state.fps
                            )
                        );

                    $("videoControlsPanel").style.display =
                        "block";

                    $("frameSlider").max =
                        state.totalFrames -
                        1;

                    buildFilmstrip();

                    await seekVideoFrame(
                        0
                    );

                    resolve();
                };

            sourceVideo.onerror =
                () =>
                    reject(
                        new Error(
                            "Task video could not be loaded."
                        )
                    );
        }
    );
}

/* ============================================================
   CLOUD ANNOTATIONS
============================================================ */

async function loadCloudAnnotations(
    taskId
) {
    const {
        data,
        error
    } =
        await supabase
            .from("annotations")
            .select("*")
            .eq(
                "task_id",
                taskId
            )
            .order(
                "frame_number",
                {
                    ascending:
                        true
                }
            );

    if (error) {
        console.error(
            error
        );

        return;
    }

    state.frameAnnotations =
        new Map();

    if (
        state.mediaType ===
        "video"
    ) {
        const grouped =
            new Map();

        (data || []).forEach(
            row => {
                const frame =
                    Number(
                        row.frame_number ||
                        0
                    );

                if (
                    !grouped.has(
                        frame
                    )
                ) {
                    grouped.set(
                        frame,
                        []
                    );
                }

                grouped
                    .get(frame)
                    .push(
                        cloudRowToAnnotation(
                            row
                        )
                    );
            }
        );

        grouped.forEach(
            (annotations, frame) =>
                state.frameAnnotations.set(
                    frame,
                    annotations
                )
        );

        loadFrameAnnotations();
    } else {
        state.annotations =
            (data || []).map(
                cloudRowToAnnotation
            );

        state.nextId =
            state.annotations.reduce(
                (
                    max,
                    a
                ) =>
                    Math.max(
                        max,
                        Number(
                            a.id
                        ) || 0
                    ),
                0
            ) + 1;

        resetHistory(
            state.annotations
        );

        updateCounts();
        updateAnnotationsList();
    }

    render();
}

function cloudRowToAnnotation(
    row
) {
    return {
        id:
            row.annotation_key ||
            row.id,

        type:
            row.annotation_type ||
            "box",

        x:
            row.x ?? 0,

        y:
            row.y ?? 0,

        width:
            row.width ?? 0,

        height:
            row.height ?? 0,

        points:
            row.points || [],

        label:
            row.class_name ||
            "unknown",

        score:
            row.score,

        occlusion:
            row.occlusion ??
            0,

        truncation:
            row.truncation ||
            "NONE",

        aiGenerated:
            !!row.ai_generated,

        corrected:
            !!row.corrected,

        export:
            row.export_enabled !==
            false
    };
}

/* ============================================================
   CLOUD SAVE ANNOTATION
============================================================ */

async function cloudSaveAnnotation(
    annotation
) {
    if (
        !CLOUD.currentTaskId ||
        !CLOUD.session?.user?.id
    ) {
        return;
    }

    const frame =
        state.mediaType ===
        "video"
            ? state.currentFrame
            : 0;

    const row = {
        task_id:
            CLOUD.currentTaskId,

        annotation_key:
            String(
                annotation.id
            ),

        frame_number:
            frame,

        annotation_type:
            annotation.type,

        class_name:
            annotation.label ||
            "unknown",

        score:
            annotation.score,

        occlusion:
            Number(
                annotation.occlusion ??
                0
            ),

        truncation:
            annotation.truncation ||
            "NONE",

        ai_generated:
            !!annotation.aiGenerated,

        corrected:
            !!annotation.corrected,

        export_enabled:
            annotation.export !==
            false,

        x:
            annotation.x,

        y:
            annotation.y,

        width:
            annotation.width,

        height:
            annotation.height,

        points:
            annotation.points ||
            [],

        user_id:
            CLOUD.session
                .user.id
    };

    const {
        error
    } =
        await supabase
            .from("annotations")
            .upsert(
                row,
                {
                    onConflict:
                        "task_id,annotation_key,frame_number"
                }
            );

    if (error) {
        console.warn(
            "Cloud annotation save failed:",
            error
        );
    }
}

async function cloudDeleteAnnotation(
    annotationId
) {
    if (
        !CLOUD.currentTaskId
    ) {
        return;
    }

    const frame =
        state.mediaType ===
        "video"
            ? state.currentFrame
            : 0;

    await supabase
        .from("annotations")
        .delete()
        .eq(
            "task_id",
            CLOUD.currentTaskId
        )
        .eq(
            "annotation_key",
            String(
                annotationId
            )
        )
        .eq(
            "frame_number",
            frame
        );
}

async function cloudSaveCurrentFrame() {
    if (
        state.mediaType !==
        "video"
    ) {
        return;
    }

    for (
        const annotation of
        state.annotations
    ) {
        await cloudSaveAnnotation(
            annotation
        );
    }
}

/* ============================================================
   TASK BAR
============================================================ */

function updateTaskBar() {
    const task =
        CLOUD.currentTask;

    if (!task) {
        return;
    }

    const title =
        $("activeTaskTitle");

    if (title) {
        title.textContent =
            task.title ||
            task.source_name ||
            "Current task";
    }

    const role =
        $("activeTaskRole");

    if (role) {
        role.textContent =
            formatRole(
                task.work_role
            );
    }

    const status =
        $("activeTaskStatus");

    if (status) {
        status.textContent =
            task.status;
    }

    const pay =
        $("activeTaskPay");

    if (pay) {
        pay.textContent =
            formatMoney(
                task.pay_amount
            );
    }
}

/* ============================================================
   SUBMIT / SKIP
============================================================ */

$("submitTaskBtn")?.addEventListener(
    "click",
    submitCurrentTask
);

$("skipTaskBtn")?.addEventListener(
    "click",
    openSkipTaskModal
);

async function submitCurrentTask() {
    if (
        !CLOUD.currentTaskId
    ) {
        return;
    }

    saveFrame();

    const {
        error
    } =
        await supabase.rpc(
            "submit_task",
            {
                p_task_id:
                    CLOUD.currentTaskId
            }
        );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    showToast(
        "Task submitted ✓"
    );

    CLOUD.currentTaskId =
        null;

    CLOUD.currentTask =
        null;

    await refreshMyTasks();
}

function openSkipTaskModal() {
    const modal =
        $("skipTaskModal");

    if (modal) {
        modal.style.display =
            "grid";
    }
}

$("cancelSkipTask")?.addEventListener(
    "click",
    () => {
        $("skipTaskModal").style.display =
            "none";
    }
);

$("confirmSkipTask")?.addEventListener(
    "click",
    skipCurrentTask
);

async function skipCurrentTask() {
    if (
        !CLOUD.currentTaskId
    ) {
        return;
    }

    const reason =
        $("skipReason")
            ?.value
            .trim();

    if (!reason) {
        showToast(
            "A skip reason is required."
        );

        return;
    }

    const {
        error
    } =
        await supabase.rpc(
            "skip_task",
            {
                p_task_id:
                    CLOUD.currentTaskId,

                p_reason:
                    reason
            }
        );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    $("skipTaskModal").style.display =
        "none";

    $("skipReason").value =
        "";

    CLOUD.currentTaskId =
        null;

    CLOUD.currentTask =
        null;

    showToast(
        "Task skipped."
    );

    await refreshMyTasks();
}

/* ============================================================
   REVIEWER APPROVAL
============================================================ */

$("approveTaskBtn")?.addEventListener(
    "click",
    approveCurrentTask
);

async function approveCurrentTask() {
    if (
        !CLOUD.currentTaskId
    ) {
        return;
    }

    const {
        error
    } =
        await supabase.rpc(
            "approve_task",
            {
                p_task_id:
                    CLOUD.currentTaskId
            }
        );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    showToast(
        "Task approved ✓"
    );

    CLOUD.currentTaskId =
        null;

    CLOUD.currentTask =
        null;

    await refreshMyTasks();
}

/* ============================================================
   REALTIME
============================================================ */

function subscribeRealtime() {
    if (
        CLOUD.channel
    ) {
        try {
            supabase.removeChannel(
                CLOUD.channel
            );
        } catch {}
    }

    CLOUD.channel =
        supabase
            .channel(
                "annotation-workspace"
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "tasks"
                },
                async () => {
                    await refreshMyTasks();
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "annotations"
                },
                async payload => {
                    if (
                        payload.eventType ===
                        "DELETE"
                    ) {
                        return;
                    }

                    if (
                        payload.new
                            ?.task_id ===
                        CLOUD.currentTaskId
                    ) {
                        await loadCloudAnnotations(
                            CLOUD.currentTaskId
                        );
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "profiles"
                },
                async payload => {
                    if (
                        payload.new
                            ?.id ===
                        CLOUD.session
                            ?.user
                            ?.id
                    ) {
                        await loadCloudProfile();
                    }
                }
            )
            .subscribe();
}

/* ============================================================
   ADMIN CONTROL CENTER
============================================================ */

$("adminControlBtn")?.addEventListener(
    "click",
    openAdminCenter
);

$("closeAdminCenter")?.addEventListener(
    "click",
    closeAdminCenter
);

function openAdminCenter() {
    if (!hasAllAccess()) {
        return;
    }

    const modal =
        $("adminCenter");

    if (modal) {
        modal.style.display =
            "grid";
    }

    loadAdminTasks();
}

function closeAdminCenter() {
    const modal =
        $("adminCenter");

    if (modal) {
        modal.style.display =
            "none";
    }
}

document
    .querySelectorAll(
        "[data-admin-tab]"
    )
    .forEach(
        button => {
            button.addEventListener(
                "click",
                () => {
                    document
                        .querySelectorAll(
                            "[data-admin-tab]"
                        )
                        .forEach(
                            b =>
                                b.classList.remove(
                                    "active"
                                )
                        );

                    button.classList.add(
                        "active"
                    );

                    showAdminTab(
                        button.dataset
                            .adminTab
                    );
                }
            );
        }
    );

function showAdminTab(
    tab
) {
    document
        .querySelectorAll(
            "[data-admin-panel]"
        )
        .forEach(
            panel => {
                panel.style.display =
                    panel.dataset
                        .adminPanel ===
                    tab
                        ? "block"
                        : "none";
            }
        );

    if (tab === "tasks") {
        loadAdminTasks();
    }

    if (tab === "users") {
        loadAdminUsers();
    }

    if (tab === "coworkers") {
        loadAdminCoworkers();
    }

    if (tab === "payments") {
        loadAdminPayments();
    }

    if (tab === "activity") {
        loadAdminActivity();
    }
}

/* ============================================================
   ADMIN TASKS
============================================================ */

async function loadAdminTasks() {
    if (!hasAllAccess()) return;

    const {
        data,
        error
    } =
        await supabase
            .from("tasks")
            .select("*")
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    const table =
        $("adminTasksTable");

    if (!table) return;

    table.innerHTML =
        (data || [])
            .map(
                task => `
                    <tr>
                        <td>
                            ${escapeHTML(
                                task.id.slice(
                                    0,
                                    8
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                task.title ||
                                task.source_name ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                task.work_type ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatRole(
                                    task.work_role
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                task.status
                            )}
                        </td>

                        <td>
                            ${formatMoney(
                                task.pay_amount
                            )}
                        </td>

                        <td>
                            <button
                                type="button"
                                data-admin-assign="${escapeHTML(task.id)}"
                            >
                                Assign
                            </button>
                        </td>
                    </tr>
                `
            )
            .join("");

    table
        .querySelectorAll(
            "[data-admin-assign]"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () =>
                        adminAssignPrompt(
                            button.dataset
                                .adminAssign
                        )
                );
            }
        );
}

/* ============================================================
   ADMIN USERS
============================================================ */

async function loadAdminUsers() {
    if (!hasAllAccess()) return;

    const {
        data,
        error
    } =
        await supabase
            .from("profiles")
            .select("*")
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    const table =
        $("adminUsersTable");

    if (!table) return;

    table.innerHTML =
        (data || [])
            .map(
                profile => `
                    <tr>
                        <td>
                            ${escapeHTML(
                                profile.display_name ||
                                "—"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                profile.role
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                profile.created_at ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                profile.last_login_at ||
                                "—"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                profile.last_logout_at ||
                                "—"
                            )}
                        </td>

                        <td>
                            <select
                                data-role-user="${escapeHTML(profile.id)}"
                            >
                                ${ALL_ROLES
                                    .map(
                                        role =>
                                            `<option value="${role}" ${role === profile.role ? "selected" : ""}>${formatRole(role)}</option>`
                                    )
                                    .join("")}
                            </select>

                            <button
                                type="button"
                                data-save-role="${escapeHTML(profile.id)}"
                            >
                                Save
                            </button>

                            <button
                                type="button"
                                class="danger-mini"
                                data-kick-user="${escapeHTML(profile.id)}"
                            >
                                Deactivate
                            </button>
                        </td>
                    </tr>
                `
            )
            .join("");

    table
        .querySelectorAll(
            "[data-save-role]"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () =>
                        adminSaveRole(
                            button.dataset
                                .saveRole
                        )
                );
            }
        );

    table
        .querySelectorAll(
            "[data-kick-user]"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () =>
                        adminKickUser(
                            button.dataset
                                .kickUser
                        )
                );
            }
        );
}

/* ============================================================
   ADMIN ROLE
============================================================ */

async function adminSaveRole(
    userId
) {
    const select =
        document.querySelector(
            `[data-role-user="${CSS.escape(userId)}"]`
        );

    if (!select) return;

    const role =
        select.value;

    const {
        error
    } =
        await supabase.rpc(
            "admin_set_role",
            {
                p_user_id:
                    userId,

                p_role:
                    role
            }
        );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    showToast(
        "Role updated ✓"
    );

    await loadAdminUsers();
}

async function adminKickUser(
    userId
) {
    if (
        !confirm(
            "Deactivate this account and release its active work?"
        )
    ) {
        return;
    }

    const {
        error
    } =
        await supabase.rpc(
            "admin_kick_user",
            {
                p_user_id:
                    userId
            }
        );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    showToast(
        "User deactivated."
    );

    await loadAdminUsers();
    await loadAdminTasks();
}

/* ============================================================
   ADMIN COWORKERS
============================================================ */

async function loadAdminCoworkers() {
    const {
        data,
        error
    } =
        await supabase
            .from("profiles")
            .select("*")
            .in(
                "role",
                [
                    "coworker_2d_box",
                    "coworker_polygon",
                    "coworker_segmentation"
                ]
            )
            .order(
                "role"
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    const table =
        $("adminCoworkersTable");

    if (!table) return;

    table.innerHTML =
        (data || [])
            .map(
                user => `
                    <tr>
                        <td>
                            ${escapeHTML(
                                user.display_name ||
                                "—"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                formatRole(
                                    user.role
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                user.created_at ||
                                ""
                            )}
                        </td>

                        <td>
                            ${user.active
                                ? "Active"
                                : "Inactive"}
                        </td>
                    </tr>
                `
            )
            .join("");
}

/* ============================================================
   ADMIN PAYMENTS
============================================================ */

async function loadAdminPayments() {
    if (!hasAllAccess()) return;

    const {
        data,
        error
    } =
        await supabase
            .from("task_payments")
            .select(
                `
                *,
                tasks (
                    id,
                    title,
                    work_type
                )
                `
            )
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    const table =
        $("adminPaymentsTable");

    if (!table) return;

    table.innerHTML =
        (data || [])
            .map(
                payment => `
                    <tr>
                        <td>
                            ${escapeHTML(
                                payment.tasks?.title ||
                                payment.task_id ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                payment.user_id ||
                                "Unclaimed"
                            )}
                        </td>

                        <td>
                            ${formatMoney(
                                payment.amount
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                payment.status
                            )}
                        </td>

                        <td>
                            ${
                                payment.status !==
                                "paid"
                                    ? `
                                        <button
                                            type="button"
                                            class="success-mini"
                                            data-mark-paid="${escapeHTML(payment.id)}"
                                        >
                                            Mark paid
                                        </button>
                                    `
                                    : `
                                        <span class="status-pill">
                                            Paid
                                        </span>
                                    `
                            }
                        </td>
                    </tr>
                `
            )
            .join("");

    table
        .querySelectorAll(
            "[data-mark-paid]"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () =>
                        markPaymentPaid(
                            button.dataset
                                .markPaid
                        )
                );
            }
        );
}

async function markPaymentPaid(
    paymentId
) {
    const {
        error
    } =
        await supabase
            .from(
                "task_payments"
            )
            .update({
                status:
                    "paid",
                paid_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                paymentId
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    showToast(
        "Payment marked paid ✓"
    );

    await loadAdminPayments();
}

/* ============================================================
   ADMIN ACTIVITY
============================================================ */

async function loadAdminActivity() {
    if (!hasAllAccess()) return;

    const {
        data,
        error
    } =
        await supabase
            .from(
                "activity_logs"
            )
            .select("*")
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            )
            .limit(500);

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    const table =
        $("adminActivityTable");

    if (!table) return;

    table.innerHTML =
        (data || [])
            .map(
                row => `
                    <tr>
                        <td>
                            ${escapeHTML(
                                row.created_at ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.event_type ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.user_id ||
                                ""
                            )}
                        </td>

                        <td>
                            <pre>${escapeHTML(
                                JSON.stringify(
                                    row.metadata ||
                                    {},
                                    null,
                                    2
                                )
                            )}</pre>
                        </td>
                    </tr>
                `
            )
            .join("");
}

/* ============================================================
   ADMIN ASSIGN
============================================================ */

async function adminAssignPrompt(
    taskId
) {
    const email =
        prompt(
            "Enter the coworker's email address:"
        );

    if (!email) return;

    const {
        data,
        error
    } =
        await supabase
            .from("profiles")
            .select("id")
            .eq(
                "email",
                email.trim()
            )
            .single();

    if (error) {
        showToast(
            "User not found."
        );

        return;
    }

    const result =
        await supabase.rpc(
            "admin_assign_task",
            {
                p_task_id:
                    taskId,

                p_user_id:
                    data.id
            }
        );

    if (result.error) {
        showToast(
            result.error.message
        );

        return;
    }

    showToast(
        "Task assigned ✓"
    );

    await loadAdminTasks();
}

/* ============================================================
   ADMIN EXPORT
============================================================ */

$("adminExportCSV")?.addEventListener(
    "click",
    adminExportCSV
);

$("adminExportHTML")?.addEventListener(
    "click",
    adminExportHTML
);

async function getAdminExportData() {
    const [
        users,
        tasks,
        payments,
        activity
    ] = await Promise.all([
        supabase
            .from("profiles")
            .select("*"),

        supabase
            .from("tasks")
            .select("*"),

        supabase
            .from("task_payments")
            .select("*"),

        supabase
            .from("activity_logs")
            .select("*")
    ]);

    return {
        users:
            users.data || [],

        tasks:
            tasks.data || [],

        payments:
            payments.data ||
            [],

        activity:
            activity.data ||
            []
    };
}

async function adminExportCSV() {
    const data =
        await getAdminExportData();

    const sections = [];

    Object.entries(
        data
    ).forEach(
        ([name, rows]) => {
            sections.push(
                name
            );

            if (!rows.length) {
                sections.push(
                    ""
                );

                return;
            }

            const headers =
                Object.keys(
                    rows[0]
                );

            sections.push(
                headers.join(",")
            );

            rows.forEach(
                row => {
                    sections.push(
                        headers
                            .map(
                                h =>
                                    `"${String(
                                        row[h] ??
                                        ""
                                    ).replaceAll(
                                        '"',
                                        '""'
                                    )}"`
                            )
                            .join(",")
                    );
                }
            );

            sections.push(
                ""
            );
        }
    );

    downloadBlob(
        new Blob(
            [
                sections.join(
                    "\n"
                )
            ],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        ),
        "admin-data.csv"
    );

    showToast(
        "Admin CSV exported ✓"
    );
}

async function adminExportHTML() {
    const data =
        await getAdminExportData();

    const tables =
        Object.entries(
            data
        )
            .map(
                ([name, rows]) => {
                    const headers =
                        rows.length
                            ? Object.keys(
                                rows[0]
                            )
                            : [];

                    return `
                        <h2>${escapeHTML(
                            name
                        )}</h2>

                        <table>
                            <thead>
                                <tr>
                                    ${headers
                                        .map(
                                            h =>
                                                `<th>${escapeHTML(h)}</th>`
                                        )
                                        .join("")}
                                </tr>
                            </thead>

                            <tbody>
                                ${rows
                                    .map(
                                        row =>
                                            `<tr>${headers
                                                .map(
                                                    h =>
                                                        `<td>${escapeHTML(
                                                            row[h]
                                                        )}</td>`
                                                )
                                                .join("")}</tr>`
                                    )
                                    .join("")}
                            </tbody>
                        </table>
                    `;
                }
            )
            .join("");

    const html =
        `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Admin Data Export</title>

            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 24px;
                    color: #222;
                }

                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin-bottom: 30px;
                    font-size: 11px;
                }

                th,
                td {
                    border: 1px solid #ccc;
                    padding: 6px;
                    text-align: left;
                    vertical-align: top;
                }

                th {
                    background: #eee;
                }

                td {
                    word-break: break-word;
                }
            </style>
        </head>

        <body>
            <h1>Admin Data Export</h1>
            <p>
                Exported:
                ${escapeHTML(
                    new Date().toLocaleString()
                )}
            </p>

            ${tables}
        </body>
        </html>
        `;

    downloadBlob(
        new Blob(
            [html],
            {
                type:
                    "text/html;charset=utf-8"
            }
        ),
        "admin-data.html"
    );

    showToast(
        "Admin HTML exported ✓"
    );
}

/* ============================================================
   WORK HISTORY
============================================================ */

$("workHistoryBtn")?.addEventListener(
    "click",
    loadWorkHistory
);

async function loadWorkHistory() {
    if (
        !CLOUD.session
            ?.user
            ?.id
    ) {
        return;
    }

    const {
        data,
        error
    } =
        await supabase
            .from(
                "task_payments"
            )
            .select(
                `
                *,
                tasks (
                    id,
                    title,
                    work_type,
                    status,
                    created_at
                )
                `
            )
            .eq(
                "user_id",
                CLOUD.session
                    .user.id
            )
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            );

    if (error) {
        showToast(
            error.message
        );

        return;
    }

    const container =
        $("workHistory");

    if (!container) return;

    if (
        !data?.length
    ) {
        container.innerHTML =
            `
            <div class="details-empty">
                <strong>No work history yet</strong>
                <span>Completed and paid work will appear here.</span>
            </div>
            `;

        return;
    }

    container.innerHTML =
        data.map(
            payment => `
                <div class="task-card">
                    <strong>
                        ${escapeHTML(
                            payment.tasks?.title ||
                            "Task"
                        )}
                    </strong>

                    <small>
                        ${escapeHTML(
                            payment.tasks?.work_type ||
                            ""
                        )}
                    </small>

                    <small>
                        Amount:
                        ${formatMoney(
                            payment.amount
                        )}
                        •
                        ${escapeHTML(
                            payment.status
                        )}
                    </small>
                </div>
            `
        ).join("");
}

/* ============================================================
   MONEY
============================================================ */

function formatMoney(
    amount
) {
    const value =
        Number(
            amount || 0
        );

    return new Intl.NumberFormat(
        undefined,
        {
            style:
                "currency",
            currency:
                "USD"
        }
    ).format(
        value
    );
}

/* ============================================================
   ROLE UI RESTRICTIONS
============================================================ */

function enforceRoleUI() {
    const role =
        currentRole();

    const uploadPanel =
        $("uploadPanel");

    if (
        uploadPanel
    ) {
        uploadPanel.style.display =
            canUseUpload()
                ? ""
                : "none";
    }

    const adminButton =
        $("adminControlBtn");

    if (
        adminButton
    ) {
        adminButton.style.display =
            hasAllAccess()
                ? ""
                : "none";
    }

    const createTask =
        $("createTaskBtn");

    if (
        createTask
    ) {
        createTask.style.display =
            hasAllAccess()
                ? ""
                : "none";
    }

    /*
     * Coworkers should only see their assigned annotation type.
     * AI annotation remains available.
     */
    if (
        isCoworker()
    ) {
        const allowed =
            coworkerAllowedAnnotationType();

        document
            .querySelectorAll(
                ".annotation-type"
            )
            .forEach(
                button => {
                    const type =
                        button.dataset
                            .tool;

                    button.style.display =
                        type ===
                        allowed
                            ? ""
                            : "none";
                }
            );

        state.annotationType =
            allowed;

        document
            .querySelectorAll(
                ".annotation-type"
            )
            .forEach(
                button =>
                    button.classList.toggle(
                        "active",
                        button.dataset
                            .tool ===
                        allowed
                    )
            );
    }

    /*
     * Customers do not receive the coworker annotation-type
     * restrictions. Staff/admin have all access.
     */
    if (
        role ===
        "customer"
    ) {
        // Customer upload UI can remain hidden unless
        // the HTML is being used as a standalone local
        // annotation session.
    }

    updateAIEngineAvailability();
}

/* ============================================================
   SESSION PERSISTENCE
============================================================ */

function saveSession() {
    try {
        const payload = {
            version: 1,

            mediaType:
                state.mediaType,

            fileName:
                $("fileName")
                    ?.textContent ||
                "",

            currentFrame:
                state.currentFrame,

            fps:
                state.fps,

            frameAnnotations:
                [
                    ...state
                        .frameAnnotations
                        .entries()
                ],

            annotations:
                cloneAnnotations(
                    state.annotations
                )
        };

        localStorage.setItem(
            SESSION_KEY,
            JSON.stringify(
                payload
            )
        );
    } catch (error) {
        console.warn(
            "Session save failed:",
            error
        );
    }
}

function loadSessionOnStartup() {
    try {
        const raw =
            localStorage.getItem(
                SESSION_KEY
            );

        if (!raw) return;

        const data =
            JSON.parse(raw);

        if (
            !data ||
            data.version !== 1
        ) {
            return;
        }

        state.pendingVideoRestore =
            data;

        if (
            data.mediaType ===
            "image" &&
            data.annotations
        ) {
            state.annotations =
                cloneAnnotations(
                    data.annotations
                );

            resetHistory(
                state.annotations
            );

            updateCounts();
            updateAnnotationsList();
        }
    } catch (error) {
        console.warn(
            "Session restore failed:",
            error
        );
    }
}

/* ============================================================
   CLOUD AUTOSAVE WRAPPER
============================================================ */

const originalSaveFrame =
    saveFrame;

saveFrame = function () {
    originalSaveFrame();

    /*
     * Save each current annotation asynchronously.
     * This keeps the local UI responsive while Supabase
     * receives the persistent copy.
     */
    if (
        CLOUD.currentTaskId
    ) {
        state.annotations.forEach(
            annotation => {
                cloudSaveAnnotation(
                    annotation
                );
            }
        );
    }
};

/* ============================================================
   GENERIC TOAST
============================================================ */

function showToast(
    message
) {
    if (!toastContainer) {
        console.log(
            message
        );

        return;
    }

    const toast =
        document.createElement(
            "div"
        );

    toast.className =
        "toast";

    toast.innerHTML = `
        <div>
            ${escapeHTML(
                message
            )}
        </div>

        <div class="toast-bar">
            <div class="toast-bar-fill"></div>
        </div>
    `;

    toastContainer.appendChild(
        toast
    );

    requestAnimationFrame(
        () =>
            toast.classList.add(
                "show"
            )
    );

    setTimeout(
        () => {
            toast.classList.remove(
                "show"
            );

            setTimeout(
                () =>
                    toast.remove(),
                250
            );
        },
        1500
    );
}

/* ============================================================
   FINAL ROLE CHECK
============================================================ */

setTimeout(
    () => {
        if (
            CLOUD.ready
        ) {
            enforceRoleUI();
        }
    },
    100
);

/* ============================================================
   GLOBAL ERROR HANDLERS
============================================================ */

window.addEventListener(
    "error",
    event => {
        console.error(
            "Application error:",
            event.error ||
                event.message
        );
    }
);

window.addEventListener(
    "unhandledrejection",
    event => {
        console.error(
            "Unhandled promise rejection:",
            event.reason
        );
    }
);
