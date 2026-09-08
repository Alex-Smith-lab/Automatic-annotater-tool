/*
==============================================================
 CUSTOMER ANNOTATION AI — GitHub Pages / Static Hosting Version
==============================================================
*/

import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

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

    // view
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    minScale: 0.03,
    maxScale: 25,

    // annotation
    annotationType: "box",
    mode: "select",
    annotations: [],
    selectedId: null,
    hoveredId: null,
    nextId: 1,

    // drawing
    drawing: false,
    drawStart: null,
    drawCurrent: null,
    polygonPoints: [],

    // dragging
    pointerDown: false,
    dragging: false,
    panning: false,
    spacePan: false,
    resizeHandle: null,
    dragStartImage: null,
    dragLastImage: null,
    panStart: null,

    // video annotations
    frameAnnotations: new Map(),

    // ui
    rightPanelOpen: true,
    popupExpanded: false,

    // ai
    detr: null,
    yolo: null,
    aiRunning: false
};

const MODELS = {
    detr: "Xenova/detr-resnet-50",
    yolo: "Xenova/yolov9-c"
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
hidePopup();

/* ============================================================
   UPLOAD
============================================================ */

mediaInput.addEventListener("change", async event => {
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

    $("allFramesRow").style.display = state.mediaType === "video" ? "flex" : "none";
    filmstripBar.style.display = state.mediaType === "video" ? "flex" : "none";

    if (state.mediaType === "image") {
        await loadImageFile(file);
    } else {
        await loadVideoFile(file);
    }

    fitView();
    render();
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
            state.totalFrames = Math.max(1, Math.ceil(state.videoDuration * state.fps));

            $("videoControlsPanel").style.display = "block";
            $("totalFrames").textContent = state.totalFrames;
            $("frameSlider").max = state.totalFrames - 1;
            state.currentFrame = 0;

            buildFilmstrip();
            seekVideoFrame(0);
            resolve();
        };

        sourceVideo.onerror = () => {
            reject(new Error("The video could not be loaded by the browser."));
        };
    });
}

/* ============================================================
   VIDEO FRAME SEEK
============================================================ */

async function seekVideoFrame(frame) {
    if (state.mediaType !== "video") return;

    frame = Math.max(0, Math.min(state.totalFrames - 1, Math.round(frame)));
    state.currentFrame = frame;

    const time = Math.min(state.videoDuration, frame / state.fps);
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
    if (!sourceVideo.videoWidth || !sourceVideo.videoHeight) return;
    if (state.frameCaptureBusy) return;

    state.frameCaptureBusy = true;

    try {
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = sourceVideo.videoWidth;
        frameCanvas.height = sourceVideo.videoHeight;

        const frameContext = frameCanvas.getContext("2d");
        frameContext.drawImage(sourceVideo, 0, 0, frameCanvas.width, frameCanvas.height);

        const image = new Image();
        await new Promise(resolve => {
            image.onload = resolve;
            image.src = frameCanvas.toDataURL("image/jpeg", 0.92);
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
    if (sourceVideo.paused) sourceVideo.play();
    else sourceVideo.pause();
}

function pauseVideo() {
    if (!sourceVideo.paused) sourceVideo.pause();
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

    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);

    if (state.mediaType === "video") {
        captureVideoFrame().then(() => {
            state.currentFrame = Math.round(sourceVideo.currentTime * state.fps);
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
});

function startVideoRender() {
    const loop = async () => {
        if (!state.videoPlaying) return;

        state.currentTime = sourceVideo.currentTime;
        state.currentFrame = Math.floor(sourceVideo.currentTime * state.fps);
        updateVideoUI();
        renderLiveVideo();

        state.animationFrame = requestAnimationFrame(loop);
    };
    loop();
}

function renderLiveVideo() {
    const rect = workspace.getBoundingClientRect();
    clearCanvas(rect.width, rect.height);
    if (!sourceVideo.videoWidth) return;

    const imageWidth = sourceVideo.videoWidth;
    const imageHeight = sourceVideo.videoHeight;

    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.scale, state.scale);
    ctx.drawImage(sourceVideo, 0, 0, imageWidth, imageHeight);
    ctx.restore();

    state.annotations.forEach(drawAnnotation);
}

/* ============================================================
   KEYBOARD (automatic pan via Space, Enter completes annotation)
============================================================ */

window.addEventListener("keydown", event => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
    }

    if (event.code === "Space" && state.mediaType !== "video") {
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
        if (state.annotationType === "box") finishBoxDrawing();
        else finalizePolygon();
        return;
    }

    if (event.key === "+" || event.key === "=") zoomCenter(1.20);
    if (event.key === "-" || event.key === "_") zoomCenter(1 / 1.20);
    if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
    if (event.key === "Escape") { cancelDrawing(); hidePopup(); }
});

window.addEventListener("keyup", event => {
    if (event.code === "Space" && state.spacePan) {
        state.spacePan = false;
        updateCursor();
    }
});

/* ============================================================
   ANNOTATION TYPE
   Box = click-drag. Polygon/Segmentation = click each vertex,
   Enter or double-click to finish. Pan (Space/Shift/middle-click)
   and zoom (scroll wheel) work from any tool, any time, mid-draw
   included — no need to leave the annotation tool to reposition.
============================================================ */

document.querySelectorAll(".annotation-type").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".annotation-type").forEach(item => item.classList.remove("active"));
        button.classList.add("active");

        state.annotationType = button.dataset.tool;
        $("annotationMode").textContent = state.annotationType.toUpperCase();

        cancelDrawing();
        setMode("draw");
    });
});

/* ============================================================
   TOOLS
============================================================ */

document.querySelectorAll(".tool-button").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
});

function setMode(mode) {
    state.mode = mode;

    document.querySelectorAll(".tool-button").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === mode);
    });

    $("activeTool").textContent = mode.charAt(0).toUpperCase() + mode.slice(1);

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
    if (state.spacePan || state.mode === "pan") {
        workspace.style.cursor = state.panning ? "grabbing" : "grab";
        return;
    }
    if (state.mode === "erase") { workspace.style.cursor = "not-allowed"; return; }
    if (state.mode === "select") { workspace.style.cursor = "default"; return; }
    workspace.style.cursor = "crosshair";
}

/* ============================================================
   CANVAS RESIZE
============================================================ */

function resizeCanvas() {
    const rect = workspace.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
}

function clearCanvas(width, height) {
    ctx.clearRect(0, 0, width, height);
}

/* ============================================================
   IMAGE <-> SCREEN
============================================================ */

function imageToScreen(x, y) {
    return { x: x * state.scale + state.offsetX, y: y * state.scale + state.offsetY };
}

function screenToImage(x, y) {
    return { x: (x - state.offsetX) / state.scale, y: (y - state.offsetY) / state.scale };
}

/* ============================================================
   FIT / RESET
============================================================ */

function fitView() {
    if (!state.image && state.mediaType !== "video") return;

    const rect = workspace.getBoundingClientRect();
    let width, height;

    if (state.mediaType === "video" && sourceVideo.videoWidth) {
        width = sourceVideo.videoWidth;
        height = sourceVideo.videoHeight;
    } else {
        width = state.image?.naturalWidth || state.image?.width || 1;
        height = state.image?.naturalHeight || state.image?.height || 1;
    }

    const sx = (rect.width - 40) / width;
    const sy = (rect.height - 40) / height;

    state.scale = Math.max(state.minScale, Math.min(state.maxScale, Math.min(sx, sy)));
    state.offsetX = (rect.width - width * state.scale) / 2;
    state.offsetY = (rect.height - height * state.scale) / 2;

    updateZoomUI();
    render();
}

$("fitView").addEventListener("click", fitView);

$("resetView").addEventListener("click", () => {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    updateZoomUI();
    render();
});

/* ============================================================
   ZOOM — scroll wheel works in every mode, mid-draw included,
   with no modifier key required.
============================================================ */

$("zoomIn").addEventListener("click", () => zoomCenter(1.20));
$("zoomOut").addEventListener("click", () => zoomCenter(1 / 1.20));

function zoomCenter(factor) {
    const rect = workspace.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
}

workspace.addEventListener("wheel", event => {
    event.preventDefault();
    const rect = workspace.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(factor, x, y);
}, { passive: false });

function zoomAt(factor, x, y) {
    const imagePoint = screenToImage(x, y);
    state.scale = Math.max(state.minScale, Math.min(state.maxScale, state.scale * factor));
    state.offsetX = x - imagePoint.x * state.scale;
    state.offsetY = y - imagePoint.y * state.scale;
    updateZoomUI();
    render();
}

/* ============================================================
   MAXIMIZE / FULL SCREEN
============================================================ */

$("maximizeWorkspace").addEventListener("click", toggleFullscreen);

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        workspaceRoot.requestFullscreen?.().catch(() => {});
    } else {
        document.exitFullscreen?.();
    }
}

document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === workspaceRoot;
    $("maximizeWorkspace").textContent = active ? "⤢" : "⛶";
    $("maximizeWorkspace").classList.toggle("active", active);
    setTimeout(resizeCanvas, 50);
});

/* ============================================================
   RIGHT PANEL open / close
============================================================ */

$("toggleRightPanel").addEventListener("click", toggleRightPanelVisibility);
$("closeRightPanel").addEventListener("click", closeRightPanelFn);
$("reopenRightPanel").addEventListener("click", openRightPanelFn);

function toggleRightPanelVisibility() {
    state.rightPanelOpen ? closeRightPanelFn() : openRightPanelFn();
}

function closeRightPanelFn() {
    state.rightPanelOpen = false;
    appEl.classList.add("panel-collapsed");
    $("reopenRightPanel").style.display = "block";
    setTimeout(resizeCanvas, 50);
}

function openRightPanelFn() {
    state.rightPanelOpen = true;
    appEl.classList.remove("panel-collapsed");
    $("reopenRightPanel").style.display = "none";
    setTimeout(resizeCanvas, 50);
}

/* ============================================================
   POINTER
============================================================ */

canvas.addEventListener("pointerdown", pointerDown);
canvas.addEventListener("pointermove", pointerMove);
canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerUp);
canvas.addEventListener("dblclick", doubleClick);

function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function pointerDown(event) {
    const p = pointerPosition(event);
    canvas.setPointerCapture(event.pointerId);
    state.pointerDown = true;

    // PAN — automatic from any tool via Space, Shift, or middle-click. Never blocks zoom.
    if (state.mode === "pan" || event.button === 1 || event.shiftKey || state.spacePan) {
        state.panning = true;
        state.panStart = { x: p.x, y: p.y, offsetX: state.offsetX, offsetY: state.offsetY };
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
        // Overlapping annotations are always allowed — no hit-test guard here.
        if (state.annotationType === "box") beginDrawing(p.x, p.y);
        else addPolygonPoint(p.x, p.y);
    }
}

function pointerMove(event) {
    const p = pointerPosition(event);

    if (state.panning) {
        const dx = p.x - state.panStart.x;
        const dy = p.y - state.panStart.y;
        state.offsetX = state.panStart.offsetX + dx;
        state.offsetY = state.panStart.offsetY + dy;
        render();
        return;
    }

    if (state.mode === "select" && state.dragging && state.selectedId) {
        const a = getSelected();
        if (!a) return;

        const current = screenToImage(p.x, p.y);
        const last = state.dragLastImage;

        if (state.resizeHandle && a.type === "box") {
            resizeBox(a, state.resizeHandle, current);
        } else {
            const dx = current.x - last.x;
            const dy = current.y - last.y;
            moveAnnotation(a, dx, dy);
        }

        state.dragLastImage = current;
        a.corrected = true;

        saveFrame();
        render();
        renderPopupBody(a);
        updateAnnotationsList();
        return;
    }

    if (state.mode === "draw" && state.drawing) {
        state.drawCurrent = screenToImage(p.x, p.y);
        render();
    }
}

function pointerUp() {
    // Box finishes on release. Polygon/segmentation stay open until
    // Enter, double-click, or the user presses Escape.
    if (state.mode === "draw" && state.drawing && state.annotationType === "box") {
        finishBoxDrawing();
    }

    state.pointerDown = false;
    state.dragging = false;
    state.panning = false;
    state.resizeHandle = null;

    updateCursor();
}

/* ============================================================
   DRAWING — BOX (click-drag)
============================================================ */

function beginDrawing(x, y) {
    const point = screenToImage(x, y);
    state.drawing = true;
    state.drawStart = point;
    state.drawCurrent = point;
}

function finishBoxDrawing() {
    if (!state.drawing) return;

    const start = state.drawStart;
    const end = state.drawCurrent;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    if (width >= 5 && height >= 5) {
        createAnnotation({ type: "box", x, y, width, height, label: "unknown", score: null, occlusion: 0, truncation: "NONE" });
    }

    state.drawing = false;
    state.drawStart = null;
    state.drawCurrent = null;

    saveFrame();
    updateCounts();
    render();
}

/* ============================================================
   DRAWING — POLYGON / SEGMENTATION (click each vertex)
============================================================ */

function addPolygonPoint(x, y) {
    const point = screenToImage(x, y);

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
    if (state.polygonPoints.length < 3) {
        cancelDrawing();
        return;
    }

    const points = state.polygonPoints.map(p => ({ x: p.x, y: p.y }));
    createAnnotation({ type: state.annotationType, points, label: "unknown", score: null, occlusion: 0, truncation: "NONE" });

    state.drawing = false;
    state.polygonPoints = [];
    state.drawCurrent = null;

    saveFrame();
    render();
}

function doubleClick() {
    if (state.mode !== "draw") return;
    if (state.annotationType === "box") return;
    finalizePolygon();
}

function cancelDrawing() {
    state.drawing = false;
    state.drawStart = null;
    state.drawCurrent = null;
    state.polygonPoints = [];
    render();
}

function createAnnotation(data) {
    const annotation = {
        id: "ann_" + state.nextId++,
        ...data,
        export: true,
        aiGenerated: false,
        corrected: true,
        createdAt: new Date().toISOString()
    };

    state.annotations.push(annotation);
    state.selectedId = annotation.id;

    updateCounts();
    updateSelected();
    updateAnnotationsList();
}

/* ============================================================
   HIT TEST
============================================================ */

function hitTest(sx, sy) {
    const p = screenToImage(sx, sy);

    for (let i = state.annotations.length - 1; i >= 0; i--) {
        const a = state.annotations[i];

        if (a.type === "box") {
            const handle = boxHandle(a, p);
            if (handle) return { id: a.id, handle };

            if (p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.height) {
                return { id: a.id };
            }
        }

        if (a.type === "polygon" || a.type === "segmentation") {
            if (pointInPolygon(p, a.points)) return { id: a.id };
        }
    }

    return null;
}

function boxHandle(a, p) {
    const handles = {
        nw: [a.x, a.y],
        n: [a.x + a.width / 2, a.y],
        ne: [a.x + a.width, a.y],
        e: [a.x + a.width, a.y + a.height / 2],
        se: [a.x + a.width, a.y + a.height],
        s: [a.x + a.width / 2, a.y + a.height],
        sw: [a.x, a.y + a.height],
        w: [a.x, a.y + a.height / 2]
    };

    const tolerance = 12 / state.scale;

    for (const [name, point] of Object.entries(handles)) {
        if (Math.abs(p.x - point[0]) <= tolerance && Math.abs(p.y - point[1]) <= tolerance) return name;
    }

    return null;
}

function resizeBox(a, handle, p) {
    let left = a.x, top = a.y, right = a.x + a.width, bottom = a.y + a.height;

    switch (handle) {
        case "nw": left = p.x; top = p.y; break;
        case "n": top = p.y; break;
        case "ne": right = p.x; top = p.y; break;
        case "e": right = p.x; break;
        case "se": right = p.x; bottom = p.y; break;
        case "s": bottom = p.y; break;
        case "sw": left = p.x; bottom = p.y; break;
        case "w": left = p.x; break;
    }

    if (right <= left + 2) return;
    if (bottom <= top + 2) return;

    a.x = left; a.y = top; a.width = right - left; a.height = bottom - top;
    a.corrected = true;
}

function moveAnnotation(a, dx, dy) {
    if (a.type === "box") { a.x += dx; a.y += dy; return; }
    if (a.points) a.points.forEach(p => { p.x += dx; p.y += dy; });
}

function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = (yi > point.y) !== (yj > point.y) &&
            point.x < ((xj - xi) * (point.y - yi) / (yj - yi)) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/* ============================================================
   DELETE
============================================================ */

$("deleteSelected").addEventListener("click", deleteSelected);

function deleteSelected() {
    if (!state.selectedId) return;

    state.annotations = state.annotations.filter(a => a.id !== state.selectedId);
    state.selectedId = null;

    saveFrame();
    updateCounts();
    hidePopup();
    updateAnnotationsList();
    render();
}

function getSelected() {
    return state.annotations.find(a => a.id === state.selectedId) || null;
}

/* ============================================================
   SELECTION -> POPUP + LIST
============================================================ */

function updateSelected() {
    const a = getSelected();
    $("selectedObject").textContent = a ? (a.label || "unknown") : "None";

    if (a) showPopup(a);
    else hidePopup();

    updateAnnotationsList();
    render();
}

/* ============================================================
   PURPLE POPUP CARD
============================================================ */

function showPopup(a) {
    popupEl.style.display = "block";
    renderPopupBody(a);
    positionPopup(a);
}

function hidePopup() {
    popupEl.style.display = "none";
    state.popupExpanded = false;
}

function positionPopup(a) {
    if (!a || popupEl.style.display === "none") return;

    const rect = workspace.getBoundingClientRect();
    let anchor;

    if (a.type === "box") {
        anchor = imageToScreen(a.x, a.y);
    } else {
        anchor = imageToScreen(a.points[0].x, a.points[0].y);
    }

    const popupW = popupEl.offsetWidth || 230;
    const popupH = popupEl.offsetHeight || 60;

    let left = anchor.x;
    let top = anchor.y - popupH - 10;

    if (top < 8) top = anchor.y + 16;
    if (left + popupW > rect.width - 8) left = rect.width - popupW - 8;
    if (left < 8) left = 8;

    popupEl.style.left = left + "px";
    popupEl.style.top = top + "px";
}

popupExpandBtn.addEventListener("click", () => {
    state.popupExpanded = !state.popupExpanded;
    popupExpandBtn.classList.toggle("expanded", state.popupExpanded);
    const a = getSelected();
    if (a) { renderPopupBody(a); positionPopup(a); }
});

$("annPopupClose").addEventListener("click", () => {
    state.selectedId = null;
    hidePopup();
    updateAnnotationsList();
    render();
});

function renderPopupBody(a) {
    popupTitle.textContent = a.label || "unknown";
    popupExpandBtn.classList.toggle("expanded", state.popupExpanded);

    if (!state.popupExpanded) {
        popupBody.innerHTML = `
            <div class="ann-popup-summary">
                <span class="ann-chip">${escapeHTML(a.type)}</span>
                <span class="ann-chip">Occlusion ${a.occlusion ?? 0}%</span>
                <span class="ann-chip">${escapeHTML(a.truncation || "NONE")}</span>
                <span class="ann-chip">${a.corrected ? "Human corrected" : "AI generated"}</span>
            </div>
        `;
        return;
    }

    popupBody.innerHTML = `
        <div class="class-field">
            <label>OBJECT CLASS</label>
            <input id="popupObjectClass" value="${escapeHTML(a.label || "unknown")}">
        </div>

        <div class="class-field">
            <label>OCCLUSION</label>
            <select id="popupObjectOcclusion">
                <option value="0" ${a.occlusion === 0 ? "selected" : ""}>0% — Fully visible</option>
                <option value="25" ${a.occlusion === 25 ? "selected" : ""}>25% — Slightly occluded</option>
                <option value="50" ${a.occlusion === 50 ? "selected" : ""}>50% — Partially occluded</option>
                <option value="75" ${a.occlusion === 75 ? "selected" : ""}>75% — Heavily occluded</option>
                <option value="100" ${a.occlusion === 100 ? "selected" : ""}>100% — Fully occluded</option>
            </select>
        </div>

        <div class="class-field">
            <label>TRUNCATION</label>
            <select id="popupObjectTruncation">
                <option value="NONE" ${a.truncation === "NONE" ? "selected" : ""}>NONE</option>
                <option value="SLIGHT" ${a.truncation === "SLIGHT" ? "selected" : ""}>SLIGHT</option>
                <option value="PARTIAL" ${a.truncation === "PARTIAL" ? "selected" : ""}>PARTIAL</option>
                <option value="SEVERE" ${a.truncation === "SEVERE" ? "selected" : ""}>SEVERE</option>
            </select>
        </div>

        <div class="class-field">
            <label>INCLUDE IN EXPORT</label>
            <select id="popupObjectExport">
                <option value="true" ${a.export !== false ? "selected" : ""}>YES</option>
                <option value="false" ${a.export === false ? "selected" : ""}>NO — Remove from export</option>
            </select>
        </div>

        <div class="class-buttons">
            <button id="popupSaveClass" class="save" type="button">SAVE</button>
            <button id="popupDeleteClass" type="button">DELETE</button>
        </div>
    `;

    $("popupSaveClass").addEventListener("click", savePopupClassification);
    $("popupDeleteClass").addEventListener("click", deleteSelected);

    $("popupObjectClass").addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); savePopupClassification(); }
    });
}

function savePopupClassification() {
    const a = getSelected();
    if (!a) return;

    showToast("Saving...");

    a.label = $("popupObjectClass").value.trim() || "unknown";
    a.occlusion = Number($("popupObjectOcclusion").value);
    a.truncation = $("popupObjectTruncation").value;
    a.export = $("popupObjectExport").value === "true";
    a.corrected = true;

    saveFrame();
    updateSelected();

    setTimeout(() => showToast("Saved ✓"), 250);
}

/* ============================================================
   TOAST NOTIFICATIONS
============================================================ */

function showToast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
        <span class="toast-msg">${escapeHTML(message)}</span>
        <div class="toast-bar"><div class="toast-bar-fill"></div></div>
    `;
    toastContainer.appendChild(el);

    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 250);
    }, 1500);
}

/* ============================================================
   RIGHT PANEL — ALL ANNOTATIONS LIST
============================================================ */

function updateAnnotationsList() {
    if (!state.annotations.length) {
        annotationsList.innerHTML = `
            <div class="details-empty">
                <div class="details-icon">◫</div>
                <strong>No annotations yet</strong>
                <span>Draw a box, polygon, or run Auto Annotate.</span>
            </div>
        `;
        return;
    }

    annotationsList.innerHTML = state.annotations.map(a => `
        <div class="ann-row ${a.id === state.selectedId ? "selected" : ""}" data-id="${escapeHTML(a.id)}">
            <span class="ann-row-dot"></span>
            <div class="ann-row-main">
                <div class="ann-row-label">${escapeHTML(a.label || "unknown")}</div>
                <div class="ann-row-meta">${escapeHTML(a.type)} • ${a.corrected ? "corrected" : "AI"}</div>
            </div>
            <span class="ann-row-badge">${a.occlusion ?? 0}%</span>
        </div>
    `).join("");

    annotationsList.querySelectorAll(".ann-row").forEach(row => {
        row.addEventListener("click", () => {
            state.selectedId = row.dataset.id;
            updateSelected();
        });
    });
}

/* ============================================================
   COUNTS / CONFIDENCE
============================================================ */

function updateCounts() {
    $("objectCount").textContent = state.annotations.length;
}

$("confidence").addEventListener("input", () => {
    $("confidenceValue").textContent = Math.round(Number($("confidence").value) * 100) + "%";
});

/* ============================================================
   AI — SINGLE FRAME + FULL VIDEO BATCH + DETR/YOLO/BOTH
============================================================ */

$("autoAnnotate").addEventListener("click", runAI);

async function getDetector(engine) {
    if (engine === "detr") {
        if (!state.detr) state.detr = await pipeline("object-detection", MODELS.detr);
        return state.detr;
    }
    if (!state.yolo) state.yolo = await pipeline("object-detection", MODELS.yolo);
    return state.yolo;
}

async function loadEngines(engine) {
    if (engine === "both") {
        const detr = await getDetector("detr");
        const yolo = await getDetector("yolo");
        return { detr, yolo };
    }
    const single = await getDetector(engine);
    return { single };
}

async function runDetection(engines, engine) {
    const threshold = Number($("confidence").value);

    if (engine === "both") {
        const [r1, r2] = await Promise.all([
            engines.detr(state.image.src, { threshold }),
            engines.yolo(state.image.src, { threshold })
        ]);
        const combined = nonMaxSuppress([...(r1 || []), ...(r2 || [])], 0.5);
        return applyRules(combined);
    }

    const results = await engines.single(state.image.src, { threshold });
    return applyRules(results || []);
}

function iou(boxA, boxB) {
    const x1 = Math.max(boxA.xmin, boxB.xmin);
    const y1 = Math.max(boxA.ymin, boxB.ymin);
    const x2 = Math.min(boxA.xmax, boxB.xmax);
    const y2 = Math.min(boxA.ymax, boxB.ymax);

    const interW = Math.max(0, x2 - x1);
    const interH = Math.max(0, y2 - y1);
    const interArea = interW * interH;

    const areaA = Math.max(0, boxA.xmax - boxA.xmin) * Math.max(0, boxA.ymax - boxA.ymin);
    const areaB = Math.max(0, boxB.xmax - boxB.xmin) * Math.max(0, boxB.ymax - boxB.ymin);
    const union = areaA + areaB - interArea;

    return union <= 0 ? 0 : interArea / union;
}

function nonMaxSuppress(detections, iouThreshold) {
    const sorted = detections.filter(d => d && d.box).sort((a, b) => (b.score || 0) - (a.score || 0));
    const kept = [];

    for (const det of sorted) {
        const detLabel = normalizeLabel(det.label);
        const overlaps = kept.some(k => normalizeLabel(k.label) === detLabel && iou(k.box, det.box) > iouThreshold);
        if (!overlaps) kept.push(det);
    }

    return kept;
}

function detectionsToAnnotations(detections) {
    return detections
        .filter(detection => detection.box)
        .map(detection => {
            const box = detection.box;
            return {
                id: "ai_" + state.nextId++,
                type: "box",
                x: Number(box.xmin),
                y: Number(box.ymin),
                width: Number(box.xmax - box.xmin),
                height: Number(box.ymax - box.ymin),
                label: normalizeLabel(detection.label),
                score: detection.score,
                occlusion: 0,
                truncation: "NONE",
                export: true,
                aiGenerated: true,
                corrected: false,
                createdAt: new Date().toISOString()
            };
        });
}

async function runAI() {
    if (!state.image) {
        setAIStatus("Upload a photo or move to a video frame first.");
        return;
    }
    if (state.aiRunning) return;

    const isVideoBatch = state.mediaType === "video" && $("annotateAllFrames").checked;

    if (isVideoBatch) await runAIAllFrames();
    else await runAISingleFrame();
}

async function runAISingleFrame() {
    state.aiRunning = true;
    $("autoAnnotate").disabled = true;
    const engine = $("aiEngine").value;

    try {
        setAIStatus(`Loading ${engine === "both" ? "DETR + YOLO" : engine.toUpperCase()}...`);
        const engines = await loadEngines(engine);

        setAIStatus("Analysing customer image...");
        const detections = await runDetection(engines, engine);

        state.annotations = state.annotations.filter(a => !a.aiGenerated);
        state.annotations.push(...detectionsToAnnotations(detections));

        saveFrame();
        updateCounts();
        render();
        updateAnnotationsList();
        updateFilmstripAnnotated();

        setAIStatus(`${detections.length} objects generated.`);
    } catch (error) {
        console.error("AI ERROR:", error);
        setAIStatus("AI failed: " + error.message);
    } finally {
        state.aiRunning = false;
        $("autoAnnotate").disabled = false;
    }
}

async function runAIAllFrames() {
    state.aiRunning = true;
    $("autoAnnotate").disabled = true;
    pauseVideo();

    const engine = $("aiEngine").value;
    const startFrame = state.currentFrame;
    const total = state.totalFrames;

    $("aiProgressTrack").style.display = "block";
    setProgress(0);

    try {
        setAIStatus(`Loading ${engine === "both" ? "DETR + YOLO" : engine.toUpperCase()}...`);
        const engines = await loadEngines(engine);

        for (let frame = 0; frame < total; frame++) {
            setAIStatus(`Annotating frame ${frame + 1} / ${total}...`);
            setProgress((frame / total) * 100);

            await seekVideoFrame(frame);
            const detections = await runDetection(engines, engine);

            const existing = state.frameAnnotations.get(frame) || [];
            const human = existing.filter(a => !a.aiGenerated);

            state.annotations = [...human, ...detectionsToAnnotations(detections)];
            saveFrame();

            updateFilmstripAnnotated();
        }

        await seekVideoFrame(startFrame);

        setProgress(100);
        setAIStatus(`Done — annotated all ${total} frames.`);
        updateCounts();
        updateAnnotationsList();
        render();
    } catch (error) {
        console.error("AI BATCH ERROR:", error);
        setAIStatus("Batch AI failed: " + error.message);
    } finally {
        state.aiRunning = false;
        $("autoAnnotate").disabled = false;
        setTimeout(() => { $("aiProgressTrack").style.display = "none"; }, 800);
    }
}

function setProgress(percent) {
    $("aiProgressFill").style.width = Math.max(0, Math.min(100, percent)) + "%";
}

/* ============================================================
   RULE ENGINE
============================================================ */

function applyRules(detections) {
    const rules = $("rules").value.split("\n").map(x => x.trim()).filter(Boolean);
    const enabled = $("applyRules").checked;

    if (!enabled) return detections;

    let include = null;
    let exclude = [];
    const rename = {};
    let minimum = Number($("confidence").value);

    for (const line of rules) {
        const lower = line.toLowerCase();

        if (lower.startsWith("include:")) {
            include = line.split(":").slice(1).join(":").split(",").map(normalizeLabel).filter(Boolean);
        }
        if (lower.startsWith("exclude:")) {
            exclude = line.split(":").slice(1).join(":").split(",").map(normalizeLabel).filter(Boolean);
        }
        if (lower.startsWith("rename:")) {
            const values = line.split(":").slice(1).join(":").split(",");
            values.forEach(pair => {
                const pieces = pair.split("=");
                if (pieces.length === 2) rename[normalizeLabel(pieces[0])] = normalizeLabel(pieces[1]);
            });
        }
        if (lower.startsWith("min_confidence:")) {
            const value = Number(line.split(":").slice(1).join(":").trim());
            if (Number.isFinite(value)) minimum = value;
        }
    }

    return detections
        .filter(detection => Number(detection.score) >= minimum)
        .map(detection => {
            let label = normalizeLabel(detection.label);
            if (rename[label]) label = rename[label];
            return { ...detection, label };
        })
        .filter(detection => {
            const label = normalizeLabel(detection.label);
            if (exclude.includes(label)) return false;
            if (include && !include.includes(label)) return false;
            return true;
        });
}

function normalizeLabel(value) {
    const label = String(value || "unknown").trim().toLowerCase();
    return LABEL_ALIASES[label] || label;
}

/* ============================================================
   RENDER
============================================================ */

function render() {
    if (state.videoPlaying) {
        renderLiveVideo();
        return;
    }

    const rect = workspace.getBoundingClientRect();
    clearCanvas(rect.width, rect.height);
    if (!state.image) return;

    const width = state.image.naturalWidth || state.image.width;
    const height = state.image.naturalHeight || state.image.height;

    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.scale, state.scale);
    ctx.drawImage(state.image, 0, 0, width, height);
    ctx.restore();

    state.annotations.forEach(drawAnnotation);

    if (state.drawing && state.polygonPoints.length) drawCurrentPolygon();

    const selected = getSelected();
    if (selected) positionPopup(selected);

    updateZoomUI();
}

function drawAnnotation(a) {
    if (a.type === "box") drawBox(a);
    else drawPolygon(a);
}

function drawBox(a) {
    const p = imageToScreen(a.x, a.y);
    const width = a.width * state.scale;
    const height = a.height * state.scale;
    const selected = a.id === state.selectedId;

    ctx.save();
    ctx.strokeStyle = selected ? "#a78bfa" : "#22c55e";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(p.x, p.y, width, height);

    const label = a.label || "unknown";
    ctx.font = "bold 12px Arial";
    const labelWidth = ctx.measureText(label).width + 12;

    ctx.fillStyle = selected ? "#7c3aed" : "#15803d";
    ctx.fillRect(p.x, Math.max(0, p.y - 20), labelWidth, 20);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, p.x + 6, Math.max(14, p.y - 6));

    if (selected) drawHandles(a);
    ctx.restore();
}

function drawHandles(a) {
    const points = [
        [a.x, a.y], [a.x + a.width / 2, a.y], [a.x + a.width, a.y],
        [a.x + a.width, a.y + a.height / 2], [a.x + a.width, a.y + a.height],
        [a.x + a.width / 2, a.y + a.height], [a.x, a.y + a.height], [a.x, a.y + a.height / 2]
    ];

    points.forEach(point => {
        const p = imageToScreen(point[0], point[1]);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 1.5;
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
        ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
    });
}

function drawPolygon(a) {
    if (!a.points || a.points.length < 2) return;
    const selected = a.id === state.selectedId;

    ctx.save();
    ctx.beginPath();

    a.points.forEach((point, index) => {
        const p = imageToScreen(point.x, point.y);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });

    ctx.closePath();

    if (a.type === "segmentation") {
        ctx.fillStyle = "rgba(139,92,246,.22)";
        ctx.fill();
    }

    ctx.strokeStyle = selected ? "#a78bfa" : "#22c55e";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();

    if (selected) {
        a.points.forEach(point => {
            const p = imageToScreen(point.x, point.y);
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#7c3aed";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    const first = imageToScreen(a.points[0].x, a.points[0].y);
    const label = a.label || "unknown";
    ctx.font = "bold 12px Arial";
    const labelWidth = ctx.measureText(label).width + 12;

    ctx.fillStyle = selected ? "#7c3aed" : "#15803d";
    ctx.fillRect(first.x, Math.max(0, first.y - 20), labelWidth, 20);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, first.x + 6, Math.max(14, first.y - 6));

    ctx.restore();
}

function drawCurrentPolygon() {
    if (state.polygonPoints.length < 1) return;

    ctx.save();
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();

    state.polygonPoints.forEach((point, index) => {
        const p = imageToScreen(point.x, point.y);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });

    if (state.drawCurrent) {
        const p = imageToScreen(state.drawCurrent.x, state.drawCurrent.y);
        ctx.lineTo(p.x, p.y);
    }

    ctx.stroke();
    ctx.restore();

    // Vertex markers so each placed point is visible while building the shape
    ctx.save();
    state.polygonPoints.forEach(point => {
        const p = imageToScreen(point.x, point.y);
        ctx.fillStyle = "#a78bfa";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

/* ============================================================
   VIDEO FRAME ANNOTATIONS
============================================================ */

function saveFrame() {
    if (state.mediaType !== "video") return;
    const copy = JSON.parse(JSON.stringify(state.annotations));
    state.frameAnnotations.set(state.currentFrame, copy);
    updateFilmstripAnnotated();
}

function loadFrameAnnotations() {
    if (state.mediaType !== "video") return;

    const saved = state.frameAnnotations.get(state.currentFrame);
    state.annotations = saved ? JSON.parse(JSON.stringify(saved)) : [];
    state.selectedId = null;

    updateCounts();
    hidePopup();
    updateAnnotationsList();
}

/* ============================================================
   VIDEO FILMSTRIP (bottom of workspace)
============================================================ */

function buildFilmstrip() {
    filmstripTrack.innerHTML = "";

    const frag = document.createDocumentFragment();
    for (let i = 0; i < state.totalFrames; i++) {
        const tick = document.createElement("div");
        tick.className = "filmstrip-tick";
        tick.dataset.frame = i;
        tick.title = `Frame ${i}`;
        tick.addEventListener("click", () => {
            pauseVideo();
            seekVideoFrame(i);
        });
        frag.appendChild(tick);
    }
    filmstripTrack.appendChild(frag);

    updateFilmstripCurrent();
}

function updateFilmstripCurrent() {
    if (state.mediaType !== "video") return;

    filmstripLabel.textContent = `${state.currentFrame} / ${state.totalFrames - 1}`;
    filmstripCurrentLabel.textContent = `Frame ${state.currentFrame}`;

    const ticks = filmstripTrack.children;
    for (let i = 0; i < ticks.length; i++) {
        ticks[i].classList.toggle("current", i === state.currentFrame);
    }

    const activeTick = ticks[state.currentFrame];
    if (activeTick) activeTick.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

function updateFilmstripAnnotated() {
    if (state.mediaType !== "video") return;

    const ticks = filmstripTrack.children;
    for (let i = 0; i < ticks.length; i++) {
        const has = (state.frameAnnotations.get(i) || []).length > 0;
        ticks[i].classList.toggle("has-ann", has);
    }
}

/* ============================================================
   VIDEO UI
============================================================ */

function updateVideoUI() {
    $("currentFrame").textContent = state.currentFrame;
    $("totalFrames").textContent = state.totalFrames;
    $("frameSlider").value = state.currentFrame;
    $("videoTime").textContent = formatTime(state.currentTime);
    updateFilmstripCurrent();
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0") + "." + String(millis).padStart(3, "0");
}

/* ============================================================
   ZOOM UI
============================================================ */

function updateZoomUI() {
    const percent = Math.round(state.scale * 100);
    $("zoomValue").textContent = percent + "%";
    $("footerZoom").textContent = percent + "%";
}

/* ============================================================
   AI STATUS
============================================================ */

function setAIStatus(message) {
    $("aiStatus").textContent = message;
}

/* ============================================================
   EXPORT IMAGE
============================================================ */

$("exportImage").addEventListener("click", exportAnnotatedImage);

function exportAnnotatedImage() {
    if (!state.image) {
        alert("Load an image or video frame first.");
        return;
    }

    const width = state.image.naturalWidth || state.image.width;
    const height = state.image.naturalHeight || state.image.height;

    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const outputContext = output.getContext("2d");

    outputContext.drawImage(state.image, 0, 0, width, height);

    state.annotations.filter(a => a.export !== false).forEach(a => drawExportAnnotation(outputContext, a));

    output.toBlob(blob => downloadBlob(blob, safeFilename("annotated.png")), "image/png");
}

function drawExportAnnotation(context, a) {
    context.save();
    context.strokeStyle = "#00ff55";
    context.fillStyle = "rgba(0,255,85,.18)";
    context.lineWidth = 3;

    if (a.type === "box") {
        context.strokeRect(a.x, a.y, a.width, a.height);
        context.font = "bold 18px Arial";
        context.fillStyle = "#00ff55";
        context.fillText(a.label || "unknown", a.x, Math.max(18, a.y - 5));
    } else {
        context.beginPath();
        a.points.forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
        });
        context.closePath();
        if (a.type === "segmentation") context.fill();
        context.stroke();
    }

    context.restore();
}

/* ============================================================
   TRAINING JSON
============================================================ */

$("exportJSON").addEventListener("click", exportTrainingJSON);

function exportTrainingJSON() {
    if (state.mediaType === "video") {
        saveFrame();

        const frames = [];
        const keys = [...state.frameAnnotations.keys()].sort((a, b) => a - b);

        keys.forEach(frame => {
            const annotations = state.frameAnnotations.get(frame) || [];
            frames.push({ frame, time: frame / state.fps, annotations: exportAnnotations(annotations) });
        });

        const data = {
            version: "1.0",
            mediaType: "video",
            source: $("fileName").textContent,
            fps: state.fps,
            frames
        };

        downloadJSON(data, safeFilename("training-data.json"));
        return;
    }

    const data = {
        version: "1.0",
        mediaType: "image",
        source: $("fileName").textContent,
        annotations: exportAnnotations(state.annotations)
    };

    downloadJSON(data, safeFilename("training-data.json"));
}

$("exportFrameJSON").addEventListener("click", () => {
    const data = {
        source: $("fileName").textContent,
        frame: state.currentFrame,
        time: state.currentTime,
        annotations: exportAnnotations(state.annotations)
    };

    downloadJSON(data, safeFilename(`frame-${state.currentFrame}.json`));
});

function exportAnnotations(annotations) {
    return annotations.filter(a => a.export !== false).map(a => {
        const result = {
            id: a.id,
            type: a.type,
            class: a.label,
            occlusion: a.occlusion ?? 0,
            truncation: a.truncation || "NONE",
            aiGenerated: !!a.aiGenerated,
            corrected: !!a.corrected
        };

        if (a.type === "box") result.box = { x: a.x, y: a.y, width: a.width, height: a.height };
        if (a.points) result.points = a.points.map(p => ({ x: p.x, y: p.y }));

        return result;
    });
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================================
   CLEANUP
============================================================ */

function cleanupMedia() {
    pauseVideo();

    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    if (state.videoURL) URL.revokeObjectURL(state.videoURL);

    state.image = null;
    state.imageURL = null;
    state.videoURL = null;
    state.mediaType = null;
    state.annotations = [];
    state.frameAnnotations.clear();
    state.selectedId = null;
    state.currentFrame = 0;
    state.currentTime = 0;
    state.totalFrames = 0;

    $("videoControlsPanel").style.display = "none";
    filmstripBar.style.display = "none";
    filmstripTrack.innerHTML = "";
    $("allFramesRow").style.display = "none";

    updateCounts();
    hidePopup();
    updateAnnotationsList();
}

/* ============================================================
   HELPERS
============================================================ */

function formatMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
}

function safeFilename(suffix) {
    const base = $("fileName").textContent.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9_-]/gi, "_");
    return (base || "customer") + "_" + suffix;
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ============================================================
   FINAL INITIAL RENDER
============================================================ */

render();
