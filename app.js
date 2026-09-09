import {
    pipeline,
    env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

import {
    createClient
} from "https://esm.sh/@supabase/supabase-js@2";


env.allowLocalModels = false;
env.allowRemoteModels = true;


/* ============================================================
   DOM
============================================================ */

const ID_ALIASES = {

    loginButton:
        "signInBtn",

    signupButton:
        "signUpBtn",

    logoutButton:
        "logoutBtn",

    themeToggle:
        "settingsButton",

    profilePictureInput:
        "avatarInput",

    workHistoryBtn:
        "workHistoryButton",

    workHistory:
        "workHistoryList",

    submitTaskBtn:
        "submitTaskButton",

    skipTaskBtn:
        "skipTaskButton",

    skipTaskModal:
        "skipModal",

    cancelSkipTask:
        "closeSkipModal",

    adminControlBtn:
        "adminCenterButton",

    closeAdminCenter:
        "closeAdminModal",

    adminCenter:
        "adminModal",

    createTaskBtn:
        "createTaskButton",

    newTaskType:
        "taskShape",

    newTaskDuration:
        "taskDuration",

    newTaskPay:
        "taskPay",

    adminTasksTable:
        "adminTasksList",

    adminUsersTable:
        "usersList",

    adminCoworkersTable:
        "coworkersList",

    adminPaymentsTable:
        "paymentsList",

    adminActivityTable:
        "activityList",

    adminExportCSV:
        "copyAdminCSV",

    adminExportHTML:
        "downloadAdminHTML",

    uploadPanel:
        "customerUploadPanel",

    undoButton:
        "undoBtn",

    redoButton:
        "redoBtn",

    runAI:
        "autoAnnotate",

    annotationCount:
        "objectCount",

    selectedCount:
        "selectedObject",

    deleteAnnotation:
        "deleteSelected"
};


const $ = id =>
    document.getElementById(
        ID_ALIASES[id] || id
    );


/* ============================================================
   DOM REFERENCES
============================================================ */

const canvas =
    $("annotationCanvas");

const ctx =
    canvas
        ? canvas.getContext("2d")
        : null;

const workspace =
    $("canvasWorkspace");

const mediaInput =
    $("mediaInput");

const sourceVideo =
    $("sourceVideo");

const emptyWorkspace =
    $("emptyWorkspace");

const appEl =
    document.querySelector(
        ".app"
    );

const workspaceRoot =
    $("workspaceRoot");

const annotationsList =
    $("annotationsList");

const popupEl =
    $("annotationPopup");

const popupTitle =
    $("annPopupTitle");

const popupBody =
    $("annPopupBody");

const popupExpandBtn =
    $("annPopupExpand");

const filmstripBar =
    $("filmstripBar");

const filmstripTrack =
    $("filmstripTrack");

const filmstripLabel =
    $("filmstripLabel");

const filmstripCurrentLabel =
    $("filmstripCurrentLabel");

const toastContainer =
    $("toastContainer");


const SESSION_KEY =
    "annotationAI_session_v1";


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


    annotationType:
        "box",

    mode:
        "select",

    annotations: [],

    selectedId:
        null,

    hoveredId:
        null,

    nextId:
        1,


    drawing:
        false,

    drawStart:
        null,

    drawCurrent:
        null,

    polygonPoints:
        [],


    pointerDown:
        false,

    dragging:
        false,

    panning:
        false,

    spacePan:
        false,

    resizeHandle:
        null,

    dragStartImage:
        null,

    dragLastImage:
        null,

    panStart:
        null,


    frameAnnotations:
        new Map(),


    rightPanelOpen:
        true,

    popupExpanded:
        false,

    colorMode:
        "normal",


    history:
        [],

    historyIndex:
        -1,


    detr:
        null,

    yolo:
        null,

    segmenter:
        null,

    aiRunning:
        false,


    pendingVideoRestore:
        null
};


/* ============================================================
   INITIALIZATION & LAYOUT ADJUSTMENTS
============================================================ */

window.addEventListener(
    "resize",
    resizeCanvas
);

function applyCustomStyleAndLayout() {
    // 1. Inject CSS Rules for header, right-aligned controls, centered items, and full screen admin
    const styleId = "annotation-app-layout-styles";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.innerHTML = `
            /* Header alignment */
            header, .app-header, .top-bar {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                position: relative !important;
                padding: 0 16px !important;
            }

            /* Center Greetings */
            #greetingBanner, .user-greeting, .greeting-text {
                position: absolute !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                margin: 0 !important;
                text-align: center !important;
                font-weight: 600 !important;
            }

            /* Right Header Controls inline row */
            .top-right-controls, .header-right-group {
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                gap: 12px !important;
                margin-left: auto !important;
            }

            /* Center My Work & Work Allocation */
            .center-work-panel, #centerWorkPanel {
                display: flex !important;
                flex-direction: row !important;
                justify-content: center !important;
                align-items: center !important;
                gap: 16px !important;
                width: 100% !important;
                margin: 12px auto !important;
                text-align: center !important;
            }

            /* Full Screen Admin Page */
            .admin-fullscreen-page {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 99999 !important;
                background: var(--bg-color, #0f172a) !important;
                color: var(--text-color, #f8fafc) !important;
                overflow-y: auto !important;
                padding: 24px !important;
                box-sizing: border-box !important;
            }
        `;
        document.head.appendChild(style);
    }

    // 2. Structure Top Right Header Items (Settings, Work History, Sign Out, Profile Picture)
    const headerRight = document.querySelector(".top-right-controls") || document.querySelector(".header-right") || createHeaderRightGroup();
    
    const settingsBtn = $("settingsButton") || $("themeToggle");
    const workHistoryBtn = $("workHistoryButton") || $("workHistoryBtn");
    const logoutBtn = $("logoutBtn") || $("signInBtn");
    const avatarInput = $("avatarInput") || $("profilePictureInput");
    const adminBtn = $("adminCenterButton") || $("adminControlBtn");

    if (headerRight) {
        if (settingsBtn) headerRight.appendChild(settingsBtn);
        if (workHistoryBtn) headerRight.appendChild(workHistoryBtn);
        if (logoutBtn) headerRight.appendChild(logoutBtn);
        if (avatarInput) headerRight.appendChild(avatarInput);

        // Add Export button next to Admin Control Button
        if (adminBtn) {
            let exportBtn = $("adminExportBtnHeader");
            if (!exportBtn) {
                exportBtn = document.createElement("button");
                exportBtn.id = "adminExportBtnHeader";
                exportBtn.className = "btn btn-secondary";
                exportBtn.textContent = "Export";
                exportBtn.addEventListener("click", () => exportCSV());
                adminBtn.parentNode.insertBefore(exportBtn, adminBtn.nextSibling);
            }
        }
    }

    // 3. Center My Work and Work Allocation
    const myWork = $("myWorkPanel") || document.querySelector(".my-work");
    const workAllocation = $("workAllocationPanel") || document.querySelector(".work-allocation");
    
    if (myWork || workAllocation) {
        let centerPanel = $("centerWorkPanel");
        if (!centerPanel) {
            centerPanel = document.createElement("div");
            centerPanel.id = "centerWorkPanel";
            centerPanel.className = "center-work-panel";
            const mainContent = document.querySelector(".main-content") || workspaceRoot || document.body;
            mainContent.insertBefore(centerPanel, mainContent.firstChild);
        }
        if (myWork) centerPanel.appendChild(myWork);
        if (workAllocation) centerPanel.appendChild(workAllocation);
    }
}

function createHeaderRightGroup() {
    const header = document.querySelector("header") || document.querySelector(".app-header");
    if (!header) return null;
    const group = document.createElement("div");
    group.className = "top-right-controls";
    header.appendChild(group);
    return group;
}

/* ============================================================
   ADMIN FULLSCREEN HANDLER
============================================================ */

function setupAdminFullScreen() {
    const adminBtn = $("adminCenterButton") || $("adminControlBtn");
    const adminModal = $("adminModal") || $("adminCenter");
    const closeAdmin = $("closeAdminModal") || $("closeAdminCenter");

    if (adminBtn && adminModal) {
        adminBtn.addEventListener("click", (e) => {
            e.preventDefault();
            adminModal.classList.add("admin-fullscreen-page");
            adminModal.style.display = "block";
            
            // Add a dedicated close/back button if missing
            let backBtn = $("adminFullScreenClose");
            if (!backBtn) {
                backBtn = document.createElement("button");
                backBtn.id = "adminFullScreenClose";
                backBtn.className = "btn btn-danger";
                backBtn.textContent = "← Back to Workspace";
                backBtn.style.position = "absolute";
                backBtn.style.top = "20px";
                backBtn.style.right = "20px";
                backBtn.addEventListener("click", closeAdminPage);
                adminModal.insertBefore(backBtn, adminModal.firstChild);
            }
        });
    }

    if (closeAdmin) {
        closeAdmin.addEventListener("click", closeAdminPage);
    }
}

function closeAdminPage() {
    const adminModal = $("adminModal") || $("adminCenter");
    if (adminModal) {
        adminModal.classList.remove("admin-fullscreen-page");
        adminModal.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    applyCustomStyleAndLayout();
    setupAdminFullScreen();
});


try {
    resizeCanvas();
} catch (error) {
    console.warn("Initial canvas resize skipped:", error);
}

try {
    updateZoomUI();
} catch (error) {
    console.warn("Initial zoom UI skipped:", error);
}

try {
    updateCounts();
} catch (error) {
    console.warn("Initial count update skipped:", error);
}

try {
    updateAnnotationsList();
} catch (error) {
    console.warn("Initial annotation list skipped:", error);
}

try {
    updateUndoRedoButtons();
} catch (error) {
    console.warn("Initial undo/redo update skipped:", error);
}

try {
    updateAIEngineAvailability();
} catch (error) {
    console.warn("Initial AI UI skipped:", error);
}

try {
    updateColorLegend();
} catch (error) {
    console.warn("Initial color legend skipped:", error);
}

try {
    hidePopup();
} catch (error) {
    console.warn("Initial popup hide skipped:", error);
}

try {
    loadSessionOnStartup();
} catch (error) {
    console.warn("Session restore skipped:", error);
}


/* ============================================================
   UPLOAD & CUSTOMER MEDIA
============================================================ */

if (mediaInput) {
    mediaInput.addEventListener("change", async event => {
        if (typeof canUseUpload === "function" && !canUseUpload()) {
            alert("Customer upload is not available for this role.");
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
}

async function loadCustomerMedia(file) {
    cleanupMedia();

    state.mediaType = file.type.startsWith("video/") ? "video" : "image";

    if ($("fileName")) $("fileName").textContent = file.name;
    if ($("mediaInfo")) $("mediaInfo").textContent = `${file.type || "media"} • ${formatMB(file.size)} MB`;
    if (emptyWorkspace) emptyWorkspace.style.display = "none";
    if ($("allFramesRow")) $("allFramesRow").style.display = state.mediaType === "video" ? "flex" : "none";
    if (filmstripBar) filmstripBar.style.display = state.mediaType === "video" ? "flex" : "none";

    if (state.mediaType === "image") {
        await loadImageFile(file);
    } else {
        await loadVideoFile(file);
    }

    fitView();
    render();
    saveSession();
}

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

function loadVideoFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        state.videoURL = url;

        if (!sourceVideo) {
            reject(new Error("Video element is missing from index.html."));
            return;
        }

        sourceVideo.src = url;
        sourceVideo.load();

        sourceVideo.onloadedmetadata = () => {
            state.videoDuration = sourceVideo.duration;
            state.fps = 30;
            state.totalFrames = Math.max(1, Math.ceil(state.videoDuration * state.fps));

            if ($("videoControlsPanel")) $("videoControlsPanel").style.display = "block";
            if ($("totalFrames")) $("totalFrames").textContent = state.totalFrames;
            if ($("frameSlider")) $("frameSlider").max = state.totalFrames - 1;

            state.currentFrame = 0;

            if (state.pendingVideoRestore && state.pendingVideoRestore.fileName === file.name) {
                state.frameAnnotations = new Map(state.pendingVideoRestore.frameAnnotations || []);
                state.pendingVideoRestore = null;
                if ($("sessionBanner")) $("sessionBanner").style.display = "none";
                showToast("Video annotations restored");
            }

            buildFilmstrip();
            seekVideoFrame(0).then(resolve);
        };

        sourceVideo.onerror = () => {
            reject(new Error("The video could not be loaded by the browser."));
        };
    });
}

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
        if (!sourceVideo) {
            resolve();
            return;
        }

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
    if (!sourceVideo || !sourceVideo.videoWidth || !sourceVideo.videoHeight) return;
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
   CANVAS & DRAWING ENGINE
============================================================ */

function resizeCanvas() {
    if (!canvas || !workspace) return;

    const rect = workspace.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    render();
}

function clearCanvas(width, height) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
}

function imageToScreen(x, y) {
    return {
        x: x * state.scale + state.offsetX,
        y: y * state.scale + state.offsetY
    };
}

function screenToImage(x, y) {
    return {
        x: (x - state.offsetX) / state.scale,
        y: (y - state.offsetY) / state.scale
    };
}

function fitView() {
    if (!state.image && state.mediaType !== "video") return;
    if (!workspace) return;

    const rect = workspace.getBoundingClientRect();
    let width = state.mediaType === "video" && sourceVideo && sourceVideo.videoWidth ? sourceVideo.videoWidth : (state.image?.naturalWidth || state.image?.width || 1);
    let height = state.mediaType === "video" && sourceVideo && sourceVideo.videoHeight ? sourceVideo.videoHeight : (state.image?.naturalHeight || state.image?.height || 1);

    const sx = (rect.width - 40) / width;
    const sy = (rect.height - 40) / height;

    state.scale = Math.max(state.minScale, Math.min(state.maxScale, Math.min(sx, sy)));
    state.offsetX = (rect.width - width * state.scale) / 2;
    state.offsetY = (rect.height - height * state.scale) / 2;

    updateZoomUI();
    render();
}

$("fitView")?.addEventListener("click", fitView);
$("resetView")?.addEventListener("click", () => {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    updateZoomUI();
    render();
});

$("zoomIn")?.addEventListener("click", () => zoomCenter(1.20));
$("zoomOut")?.addEventListener("click", () => zoomCenter(1 / 1.20));

function zoomCenter(factor) {
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
}

workspace?.addEventListener("wheel", event => {
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
   POINTER & INTERACTION EVENTS
============================================================ */

canvas?.addEventListener("pointerdown", pointerDown);
canvas?.addEventListener("pointermove", pointerMove);
canvas?.addEventListener("pointerup", pointerUp);
canvas?.addEventListener("pointercancel", pointerUp);
canvas?.addEventListener("dblclick", doubleClick);

function pointerPosition(event) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function pointerDown(event) {
    const p = pointerPosition(event);
    try { canvas.setPointerCapture(event.pointerId); } catch {}

    state.pointerDown = true;

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
        state.offsetX = state.panStart.offsetX + (p.x - state.panStart.x);
        state.offsetY = state.panStart.offsetY + (p.y - state.panStart.y);
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
            moveAnnotation(a, current.x - last.x, current.y - last.y);
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
    const wasDragging = state.mode === "select" && state.dragging && state.selectedId;

    if (state.mode === "draw" && state.drawing && state.annotationType === "box") {
        finishBoxDrawing();
    }

    if (wasDragging) {
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

function beginDrawing(x, y) {
    const point = screenToImage(x, y);
    state.drawing = true;
    state.drawStart = point;
    state.drawCurrent = point;
    render();
}

function finishBoxDrawing() {
    if (!state.drawing || !state.drawStart || !state.drawCurrent) {
        state.drawing = false;
        return;
    }

    const start = state.drawStart;
    const end = state.drawCurrent;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    state.drawing = false;
    state.drawStart = null;
    state.drawCurrent = null;

    if (width < 3 || height < 3) {
        render();
        return;
    }

    createAnnotation({
        type: "box",
        x, y, width, height,
        label: "object", score: 1, occlusion: 0, truncation: "NONE",
        aiGenerated: false, corrected: true
    });

    render();
}

function doubleClick(event) {
    if (state.mode === "draw" && (state.annotationType === "polygon" || state.annotationType === "segmentation")) {
        finishPolygon();
        return;
    }

    const p = pointerPosition(event);
    const hit = hitTest(p.x, p.y);
    if (hit) {
        state.selectedId = hit.id;
        showAnnotationPopup(hit.annotation || getSelected());
    }
}

function finishPolygon() {
    if (state.polygonPoints.length < 3) {
        state.drawing = false;
        state.polygonPoints = [];
        render();
        return;
    }

    const points = state.polygonPoints.map(p => ({ x: p.x, y: p.y }));
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);

    createAnnotation({
        type: state.annotationType,
        x: minX, y: minY,
        width: maxX - minX, height: maxY - minY,
        points, label: "object", score: 1, occlusion: 0, truncation: "NONE",
        aiGenerated: false, corrected: true
    });

    state.drawing = false;
    state.polygonPoints = [];
    render();
}


/* ============================================================
   RENDER HELPERS & ANNOTATION MANAGEMENT
============================================================ */

function render() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    clearCanvas(rect.width, rect.height);

    if (!state.image) return;

    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.scale, state.scale);

    try {
        ctx.drawImage(state.image, 0, 0);
    } catch (error) {
        console.warn("Could not render image:", error);
    }

    state.annotations.forEach(drawAnnotation);
    ctx.restore();
    renderDrawingPreview();
}

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

function createAnnotation(data) {
    const annotation = {
        id: String(state.nextId++),
        type: data.type,
        x: data.x, y: data.y, width: data.width, height: data.height,
        points: data.points ? data.points.map(p => ({ x: p.x, y: p.y })) : undefined,
        label: data.label || "unknown",
        score: data.score ?? null,
        occlusion: Number(data.occlusion ?? 0),
        truncation: data.truncation || "NONE",
        aiGenerated: !!data.aiGenerated,
        corrected: !!data.corrected,
        export: data.export !== false
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

function getSelected() {
    return state.annotations.find(a => a.id === state.selectedId) || null;
}

function updateSelected() {
    updateAnnotationsList();
    const selected = getSelected();
    if (selected) {
        renderPopup(selected);
    } else {
        hidePopup();
    }
    render();
}

function hitTest(screenX, screenY) {
    const point = screenToImage(screenX, screenY);
    for (let i = state.annotations.length - 1; i >= 0; i--) {
        const a = state.annotations[i];
        if (a.type === "box") {
            const handle = getResizeHandle(a, point);
            if (handle) return { id: a.id, handle };
            if (point.x >= a.x && point.x <= a.x + a.width && point.y >= a.y && point.y <= a.y + a.height) {
                return { id: a.id, handle: null };
            }
        } else if (a.points && pointInPolygon(point, a.points)) {
            return { id: a.id, handle: null };
        }
    }
    return null;
}

function getResizeHandle(a, p) {
    if (a.type !== "box") return null;
    const threshold = 8 / state.scale;
    const left = a.x, right = a.x + a.width, top = a.y, bottom = a.y + a.height;

    const nearLeft = Math.abs(p.x - left) <= threshold;
    const nearRight = Math.abs(p.x - right) <= threshold;
    const nearTop = Math.abs(p.y - top) <= threshold;
    const nearBottom = Math.abs(p.y - bottom) <= threshold;

    if (nearLeft && nearTop) return "nw";
    if (nearRight && nearTop) return "ne";
    if (nearLeft && nearBottom) return "sw";
    if (nearRight && nearBottom) return "se";
    if (nearTop) return "n";
    if (nearBottom) return "s";
    if (nearLeft) return "w";
    if (nearRight) return "e";
    return null;
}

function pointInPolygon(point, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function moveAnnotation(a, dx, dy) {
    if (a.type === "box") {
        a.x += dx;
        a.y += dy;
    } else if (a.points) {
        a.points.forEach(p => { p.x += dx; p.y += dy; });
    }
}

function resizeBox(a, handle, point) {
    let left = a.x, right = a.x + a.width, top = a.y, bottom = a.y + a.height;
    if (handle.includes("w")) left = point.x;
    if (handle.includes("e")) right = point.x;
    if (handle.includes("n")) top = point.y;
    if (handle.includes("s")) bottom = point.y;

    if (right < left) [left, right] = [right, left];
    if (bottom < top) [top, bottom] = [bottom, top];

    a.x = left;
    a.y = top;
    a.width = Math.max(1, right - left);
    a.height = Math.max(1, bottom - top);
}

$("deleteAnnotation")?.addEventListener("click", deleteSelected);

function deleteSelected() {
    if (!state.selectedId) return;
    const index = state.annotations.findIndex(a => a.id === state.selectedId);
    if (index === -1) return;

    const id = state.selectedId;
    state.annotations.splice(index, 1);
    state.selectedId = null;

    updateSelected();
    updateCounts();
    pushHistory();
    saveFrame();
    saveSession();
    cloudDeleteAnnotation(id);
    showToast("Annotation deleted");
}

function drawAnnotation(a) {
    ctx.save();
    const selected = a.id === state.selectedId;
    ctx.strokeStyle = selected ? "#a78bfa" : "#00ff55";
    ctx.fillStyle = selected ? "rgba(167,139,250,.18)" : "rgba(0,255,85,.12)";
    ctx.lineWidth = Math.max(1.5, 2 / state.scale);

    if (a.type === "box") {
        ctx.strokeRect(a.x, a.y, a.width, a.height);
        ctx.fillRect(a.x, a.y, a.width, a.height);
        drawBoxLabel(a);
        if (selected) drawResizeHandles(a);
    } else if (a.points && a.points.length >= 2) {
        ctx.beginPath();
        a.points.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        if (a.type === "segmentation") ctx.fill();
        ctx.stroke();
        drawPolygonLabel(a);
    }
    ctx.restore();
}

function drawBoxLabel(a) {
    const text = `${a.label || "unknown"}${a.score != null ? ` ${(a.score * 100).toFixed(0)}%` : ""}`;
    const fontSize = Math.max(10 / state.scale, 12 / state.scale);
    ctx.font = `bold ${fontSize}px Arial`;
    const metrics = ctx.measureText(text);
    const padding = 4 / state.scale;
    const boxHeight = fontSize + padding * 2;
    const labelX = a.x;
    const labelY = Math.max(boxHeight, a.y);

    ctx.fillStyle = "#111";
    ctx.fillRect(labelX, labelY - boxHeight, metrics.width + padding * 2, boxHeight);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, labelX + padding, labelY - padding);
}

function drawPolygonLabel(a) {
    if (!a.points || !a.points.length) return;
    ctx.font = `${12 / state.scale}px Arial`;
    ctx.fillStyle = "#fff";
    ctx.fillText(a.label || "unknown", a.points[0].x, a.points[0].y);
}

function drawResizeHandles(a) {
    const size = 5 / state.scale;
    const points = [[a.x, a.y], [a.x + a.width, a.y], [a.x, a.y + a.height], [a.x + a.width, a.y + a.height]];
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 1 / state.scale;

    points.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.rect(x - size, y - size, size * 2, size * 2);
        ctx.fill();
        ctx.stroke();
    });
}

function renderDrawingPreview() {
    if (!state.drawing) return;
    ctx.save();
    ctx.strokeStyle = "#a78bfa";
    ctx.fillStyle = "rgba(167,139,250,.12)";
    ctx.lineWidth = 2;

    if (state.annotationType === "box") {
        if (!state.drawStart || !state.drawCurrent) { ctx.restore(); return; }
        const start = imageToScreen(state.drawStart.x, state.drawStart.y);
        const current = imageToScreen(state.drawCurrent.x, state.drawCurrent.y);
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        const width = Math.abs(current.x - start.x);
        const height = Math.abs(current.y - start.y);

        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
    } else {
        const points = state.polygonPoints;
        if (!points.length) { ctx.restore(); return; }

        ctx.beginPath();
        points.forEach((p, idx) => {
            const screen = imageToScreen(p.x, p.y);
            idx === 0 ? ctx.moveTo(screen.x, screen.y) : ctx.lineTo(screen.x, screen.y);
        });

        if (state.drawCurrent) {
            const current = imageToScreen(state.drawCurrent.x, state.drawCurrent.y);
            ctx.lineTo(current.x, current.y);
        }
        ctx.stroke();
    }
    ctx.restore();
}


/* ============================================================
   HISTORY & SESSION
============================================================ */

function cloneAnnotations(annotations) {
    return annotations.map(a => ({
        ...a,
        points: a.points ? a.points.map(p => ({ x: p.x, y: p.y })) : undefined
    }));
}

function resetHistory(annotations) {
    state.history = [cloneAnnotations(annotations)];
    state.historyIndex = 0;
    updateUndoRedoButtons();
}

function pushHistory() {
    const snapshot = cloneAnnotations(state.annotations);
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(snapshot);
    state.historyIndex = state.history.length - 1;
    if (state.history.length > 100) {
        state.history.shift();
        state.historyIndex--;
    }
    updateUndoRedoButtons();
}

function undo() {
    if (state.historyIndex <= 0) return;
    state.historyIndex--;
    state.annotations = cloneAnnotations(state.history[state.historyIndex]);
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
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex++;
    state.annotations = cloneAnnotations(state.history[state.historyIndex]);
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
    const undoButton = $("undoButton");
    const redoButton = $("redoButton");
    if (undoButton) undoButton.disabled = state.historyIndex <= 0;
    if (redoButton) redoButton.disabled = state.historyIndex >= state.history.length - 1;
}

$("undoButton")?.addEventListener("click", undo);
$("redoButton")?.addEventListener("click", redo);


/* ============================================================
   POPUP & ANNOTATION LIST
============================================================ */

function renderPopup(a) {
    if (!popupEl) return;
    popupTitle.textContent = a.label || "Annotation";
    popupEl.style.display = "block";
    popupEl.dataset.id = a.id;
    positionPopup(a);
    renderPopupBody(a);
}

function positionPopup(a) {
    if (!popupEl) return;
    let x, y;

    if (a.type === "box") {
        const topLeft = imageToScreen(a.x, a.y);
        x = topLeft.x + Math.max(8, a.width * state.scale);
        y = topLeft.y;
    } else if (a.points && a.points.length) {
        const p = imageToScreen(a.points[0].x, a.points[0].y);
        x = p.x + 15;
        y = p.y;
    } else {
        x = 20; y = 20;
    }

    const rect = workspace.getBoundingClientRect();
    const popupWidth = popupEl.offsetWidth || 220;
    const popupHeight = popupEl.offsetHeight || 200;

    x = Math.max(5, Math.min(x, rect.width - popupWidth - 5));
    y = Math.max(5, Math.min(y, rect.height - popupHeight - 5));

    popupEl.style.left = `${x}px`;
    popupEl.style.top = `${y}px`;
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
            <input id="popupClassInput" value="${escapeHTML(a.label || "unknown")}" placeholder="Object class">
        </div>
        <div class="class-field">
            <label>Occlusion</label>
            <select id="popupOcclusion">
                ${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => `<option value="${v}" ${Number(a.occlusion ?? 0) === v ? "selected" : ""}>${v}%</option>`).join("")}
            </select>
        </div>
        <div class="class-field">
            <label>Truncation</label>
            <select id="popupTruncation">
                ${["NONE", "LEFT", "RIGHT", "TOP", "BOTTOM", "MULTIPLE"].map(v => `<option value="${v}" ${a.truncation === v ? "selected" : ""}>${v}</option>`).join("")}
            </select>
        </div>
        <label class="checkbox-row">
            <input id="popupExport" type="checkbox" ${a.export !== false ? "checked" : ""}> Include in export
        </label>
    `;

    $("popupClassInput")?.addEventListener("change", (e) => {
        a.label = e.target.value.trim() || "unknown";
        a.corrected = true;
        updateAnnotationsList();
        saveFrame(); saveSession(); cloudSaveAnnotation(a); render();
    });

    $("popupOcclusion")?.addEventListener("change", (e) => {
        a.occlusion = Number(e.target.value);
        a.corrected = true;
        updateAnnotationsList();
        saveFrame(); saveSession(); cloudSaveAnnotation(a); render();
    });

    $("popupTruncation")?.addEventListener("change", (e) => {
        a.truncation = e.target.value;
        a.corrected = true;
        updateAnnotationsList();
        saveFrame(); saveSession(); cloudSaveAnnotation(a); render();
    });

    $("popupExport")?.addEventListener("change", (e) => {
        a.export = e.target.checked;
        saveFrame(); saveSession(); cloudSaveAnnotation(a); updateAnnotationsList();
    });

    if (popupEl) positionPopup(a);
}

function hidePopup() {
    if (!popupEl) return;
    popupEl.style.display = "none";
    popupEl.dataset.id = "";
}

function updateAnnotationsList() {
    if (!annotationsList) return;
    if (!state.annotations.length) {
        annotationsList.innerHTML = `
            <div class="details-empty">
                <div class="details-icon">□</div>
                <strong>No annotations yet</strong>
                <span>Draw a box, polygon, or run Auto Annotate.</span>
            </div>`;
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

function updateCounts() {
    if ($("annotationCount")) $("annotationCount").textContent = state.annotations.length;
    if ($("selectedCount")) $("selectedCount").textContent = state.selectedId ? "1 selected" : "0 selected";
    if (state.mediaType === "video") updateFilmstripTicks();
}


/* ============================================================
   EXPORT FUNCTIONS
============================================================ */

function exportCSV() {
    const rows = annotationsToRows();
    if (!rows.length) {
        showToast("There are no annotations to export.");
        return;
    }
    const csv = rowsToCSV(rows);
    const taskId = CLOUD.currentTaskId || "annotation-task";
    downloadText(`${taskId}-annotations.csv`, csv, "text/csv;charset=utf-8");
    showToast("CSV exported successfully");
}

function getExportAnnotations() {
    return state.annotations.filter(a => a.export !== false);
}

function annotationsToRows() {
    return getExportAnnotations().map((a, index) => ({
        id: a.id,
        number: index + 1,
        label: a.label || "unknown",
        type: a.type,
        x: a.x ?? "",
        y: a.y ?? "",
        width: a.width ?? "",
        height: a.height ?? "",
        occlusion: a.occlusion ?? 0,
        truncation: a.truncation || "NONE",
        confidence: a.score ?? "",
        aiGenerated: a.aiGenerated ? "YES" : "NO",
        corrected: a.corrected ? "YES" : "NO"
    }));
}

function rowsToCSV(rows) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    const escapeCSV = val => {
        const text = String(val ?? "");
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [headers.join(","), ...rows.map(row => headers.map(key => escapeCSV(row[key])).join(","))].join("\n");
}

function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showToast(message) {
    let toast = document.querySelector(".app-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "app-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2500);
}


/* ============================================================
   CLOUD & DUMMY STUBS FOR PRESERVATION
============================================================ */

function saveFrame() {}
function saveSession() {}
function loadSessionOnStartup() {}
function cloudSaveAnnotation() {}
function cloudDeleteAnnotation() {}
function cloudSaveAllAnnotations() {}
function updateAIEngineAvailability() {}
function updateColorLegend() {}
function updateZoomUI() {}
function cleanupMedia() {}
function formatMB(bytes) { return (bytes / (1024 * 1024)).toFixed(2); }
const width = Math.abs(current.x - start.x);
        const height = Math.abs(current.y - start.y);

        ctx.strokeRect(x, y, width, height);
        ctx.fillRect(x, y, width, height);
    } else if (state.polygonPoints && state.polygonPoints.length > 0) {
        ctx.beginPath();
        state.polygonPoints.forEach((p, idx) => {
            const screen = imageToScreen(p.x, p.y);
            if (idx === 0) ctx.moveTo(screen.x, screen.y);
            else ctx.lineTo(screen.x, screen.y);
        });

        if (state.drawCurrent) {
            const screen = imageToScreen(state.drawCurrent.x, state.drawCurrent.y);
            ctx.lineTo(screen.x, screen.y);
        }

        ctx.stroke();
    }

    ctx.restore();
}


/* ============================================================
   ANNOTATIONS LIST & UI UPDATES
============================================================ */

function updateAnnotationsList() {
    if (!annotationsList) return;
    annotationsList.innerHTML = "";

    state.annotations.forEach(a => {
        const item = document.createElement("div");
        item.className = `annotation-item ${a.id === state.selectedId ? "selected" : ""}`;
        item.innerHTML = `
            <div class="ann-info">
                <span class="ann-label">${escapeHTML(a.label)}</span>
                <span class="ann-type">${a.type}</span>
            </div>
            <button class="btn-icon delete-btn" data-id="${a.id}">✕</button>
        `;

        item.addEventListener("click", (e) => {
            if (e.target.classList.contains("delete-btn")) {
                const id = e.target.getAttribute("data-id");
                state.selectedId = id;
                deleteSelected();
            } else {
                state.selectedId = a.id;
                updateSelected();
            }
        });

        annotationsList.appendChild(item);
    });
}

function updateCounts() {
    const countEl = $("annotationCount");
    const selectedEl = $("selectedCount");

    if (countEl) countEl.textContent = state.annotations.length;
    if (selectedEl) selectedEl.textContent = state.selectedId ? "1" : "0";
}

function updateZoomUI() {
    const zoomEl = $("zoomLevel") || $("zoomDisplay");
    if (zoomEl) {
        zoomEl.textContent = `${Math.round(state.scale * 100)}%`;
    }
}

function updateUndoRedoButtons() {
    const undoBtn = $("undoButton");
    const redoBtn = $("redoButton");

    if (undoBtn) undoBtn.disabled = state.historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

function updateAIEngineAvailability() {
    const runAIBtn = $("runAI");
    if (runAIBtn) {
        runAIBtn.disabled = state.aiRunning;
    }
}

function updateColorLegend() {
    // Custom color map implementation if needed
}


/* ============================================================
   POPUP CONTROL
============================================================ */

function renderPopup(a) {
    if (!popupEl) return;
    popupEl.style.display = "block";
    if (popupTitle) popupTitle.textContent = `Edit #${a.id} (${a.type})`;
    renderPopupBody(a);
}

function renderPopupBody(a) {
    if (!popupBody) return;
    popupBody.innerHTML = `
        <div class="popup-field">
            <label>Label:</label>
            <input type="text" id="popLabel" value="${escapeHTML(a.label || "")}" />
        </div>
        <div class="popup-field">
            <label>Occlusion:</label>
            <select id="popOcclusion">
                <option value="0" ${a.occlusion === 0 ? "selected" : ""}>0% (None)</option>
                <option value="1" ${a.occlusion === 1 ? "selected" : ""}>Partial</option>
                <option value="2" ${a.occlusion === 2 ? "selected" : ""}>Heavy</option>
            </select>
        </div>
    `;

    $("popLabel")?.addEventListener("input", (e) => {
        a.label = e.target.value;
        a.corrected = true;
        updateAnnotationsList();
        render();
    });

    $("popOcclusion")?.addEventListener("change", (e) => {
        a.occlusion = Number(e.target.value);
        a.corrected = true;
        saveFrame();
    });
}

function showAnnotationPopup(a) {
    if (a) renderPopup(a);
}

function hidePopup() {
    if (popupEl) popupEl.style.display = "none";
}


/* ============================================================
   HISTORY (UNDO / REDO)
============================================================ */

function pushHistory() {
    const snapshot = JSON.stringify(state.annotations);
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(snapshot);
    state.historyIndex = state.history.length - 1;
    updateUndoRedoButtons();
}

function resetHistory(initialAnnotations) {
    state.history = [JSON.stringify(initialAnnotations)];
    state.historyIndex = 0;
    updateUndoRedoButtons();
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.annotations = JSON.parse(state.history[state.historyIndex]);
        state.selectedId = null;
        updateSelected();
        updateCounts();
        saveFrame();
        updateUndoRedoButtons();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.annotations = JSON.parse(state.history[state.historyIndex]);
        state.selectedId = null;
        updateSelected();
        updateCounts();
        saveFrame();
        updateUndoRedoButtons();
    }
}

$("undoButton")?.addEventListener("click", undo);
$("redoButton")?.addEventListener("click", redo);


/* ============================================================
   FRAME & SESSION PERSISTENCE
============================================================ */

function saveFrame() {
    if (state.mediaType === "video") {
        state.frameAnnotations.set(state.currentFrame, JSON.parse(JSON.stringify(state.annotations)));
    }
}

function loadFrameAnnotations() {
    if (state.mediaType === "video") {
        const saved = state.frameAnnotations.get(state.currentFrame);
        state.annotations = saved ? JSON.parse(JSON.stringify(saved)) : [];
        state.selectedId = null;
        resetHistory(state.annotations);
        updateCounts();
        updateAnnotationsList();
    }
}

function saveSession() {
    try {
        const sessionData = {
            mediaType: state.mediaType,
            fileName: $("fileName")?.textContent || "",
            frameAnnotations: Array.from(state.frameAnnotations.entries())
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {
        console.warn("Unable to save session:", e);
    }
}

function loadSessionOnStartup() {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return;
    try {
        const parsed = JSON.parse(data);
        if (parsed.mediaType === "video" && parsed.frameAnnotations) {
            state.pendingVideoRestore = parsed;
        }
    } catch (e) {
        console.warn("Failed to load session:", e);
    }
}


/* ============================================================
   VIDEO & FILMSTRIP HELPERS
============================================================ */

function updateVideoUI() {
    if ($("currentFrame")) $("currentFrame").textContent = state.currentFrame;
    if ($("frameSlider")) $("frameSlider").value = state.currentFrame;
    if (filmstripCurrentLabel) filmstripCurrentLabel.textContent = `Frame: ${state.currentFrame}`;
}

function buildFilmstrip() {
    if (!filmstripTrack) return;
    filmstripTrack.innerHTML = "";
    const count = 10;
    const step = Math.max(1, Math.floor(state.totalFrames / count));

    for (let i = 0; i < state.totalFrames; i += step) {
        const thumb = document.createElement("div");
        thumb.className = "filmstrip-thumb";
        thumb.textContent = i;
        thumb.addEventListener("click", () => seekVideoFrame(i));
        filmstripTrack.appendChild(thumb);
    }
}


/* ============================================================
   CLOUD & UTILS
============================================================ */

function cloudSaveAnnotation(a) {
    // Supabase endpoint placeholder
}

function cloudDeleteAnnotation(id) {
    // Supabase endpoint placeholder
}

function exportCSV() {
    let csv = "id,type,label,x,y,width,height\n";
    state.annotations.forEach(a => {
        csv += `${a.id},${a.type},"${a.label}",${a.x},${a.y},${a.width},${a.height}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "annotations.csv";
    a.click();
    URL.revokeObjectURL(url);
}

function showToast(msg) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function cleanupMedia() {
    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    if (state.videoURL) URL.revokeObjectURL(state.videoURL);
    state.image = null;
    state.imageURL = null;
    state.videoURL = null;
    state.annotations = [];
    state.frameAnnotations.clear();
}

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
