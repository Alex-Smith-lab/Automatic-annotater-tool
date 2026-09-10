// ============================================================
// ANNOTATION AI
// ANNOTATION WORKSPACE MODULE
// ============================================================

import {
    APP_CONFIG
} from "./config.js";


// ============================================================
// DOM HELPERS
// ============================================================

const ID_ALIASES = {
    undoButton: "undoBtn",
    redoButton: "redoBtn",
    runAI: "autoAnnotate",
    annotationCount: "objectCount",
    selectedCount: "selectedObject",
    deleteAnnotation: "deleteSelected",
    uploadPanel: "customerUploadPanel"
};

function $(id) {
    return document.getElementById(
        ID_ALIASES[id] || id
    );
}


// ============================================================
// DOM REFERENCES
// ============================================================

const canvas = $("annotationCanvas");

const ctx = canvas
    ? canvas.getContext("2d")
    : null;

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


// ============================================================
// STATE
// ============================================================

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


// ============================================================
// AI MODEL NAMES
// ============================================================

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


// ============================================================
// UTILITY
// ============================================================

function clamp(value, min, max) {
    return Math.max(
        min,
        Math.min(max, value)
    );
}

function cloneAnnotations(annotations) {
    return JSON.parse(
        JSON.stringify(
            annotations || []
        )
    );
}

function isTypingTarget(element) {
    if (!element) {
        return false;
    }

    const tag =
        element.tagName?.toLowerCase();

    return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        element.isContentEditable
    );
}

function showToast(
    message,
    duration = 3000
) {
    if (!toastContainer) {
        console.log(message);
        return;
    }

    const toast =
        document.createElement("div");

    toast.className = "toast";

    toast.textContent = message;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    setTimeout(() => {
        toast.classList.remove("show");

        setTimeout(() => {
            toast.remove();
        }, 250);
    }, duration);
}


// ============================================================
// EVENT EMITTER
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
            "[Annotation] Event error:",
            error
        );
    }
}


// ============================================================
// CANVAS RESIZE
// ============================================================

function resizeCanvas() {
    if (!canvas || !workspace) {
        return;
    }

    const rect =
        workspace.getBoundingClientRect();

    if (
        rect.width <= 0 ||
        rect.height <= 0
    ) {
        return;
    }

    const ratio =
        window.devicePixelRatio || 1;

    canvas.width =
        Math.round(
            rect.width * ratio
        );

    canvas.height =
        Math.round(
            rect.height * ratio
        );

    canvas.style.width =
        `${rect.width}px`;

    canvas.style.height =
        `${rect.height}px`;

    if (ctx) {
        ctx.setTransform(
            ratio,
            0,
            0,
            ratio,
            0,
            0
        );
    }

    render();
}


// ============================================================
// VIEW TRANSFORM
// ============================================================

function fitView() {
    if (!canvas || !state.image) {
        return;
    }

    const rect =
        canvas.getBoundingClientRect();

    const imageWidth =
        state.image.naturalWidth ||
        state.image.width;

    const imageHeight =
        state.image.naturalHeight ||
        state.image.height;

    if (
        !imageWidth ||
        !imageHeight
    ) {
        return;
    }

    const scaleX =
        rect.width / imageWidth;

    const scaleY =
        rect.height / imageHeight;

    state.scale =
        Math.min(
            scaleX,
            scaleY
        ) * 0.92;

    state.scale =
        Math.max(
            state.minScale,
            Math.min(
                state.maxScale,
                state.scale
            )
        );

    state.offsetX =
        (
            rect.width -
            imageWidth * state.scale
        ) / 2;

    state.offsetY =
        (
            rect.height -
            imageHeight * state.scale
        ) / 2;

    updateZoomUI();

    render();
}


// ============================================================
// COORDINATE HELPERS
// ============================================================

function screenToImage(
    clientX,
    clientY
) {
    if (!canvas) {
        return {
            x: 0,
            y: 0
        };
    }

    const rect =
        canvas.getBoundingClientRect();

    const x =
        clientX - rect.left;

    const y =
        clientY - rect.top;

    return {
        x:
            (
                x -
                state.offsetX
            ) / state.scale,

        y:
            (
                y -
                state.offsetY
            ) / state.scale
    };
}

function imageToScreen(x, y) {
    return {
        x:
            state.offsetX +
            x * state.scale,

        y:
            state.offsetY +
            y * state.scale
    };
}

function getPointerPosition(event) {
    return screenToImage(
        event.clientX,
        event.clientY
    );
}

function distance(a, b) {
    const dx =
        a.x - b.x;

    const dy =
        a.y - b.y;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}


// ============================================================
// ZOOM
// ============================================================

function setZoom(
    newScale,
    centerX = null,
    centerY = null
) {
    if (!canvas) {
        return;
    }

    const oldScale =
        state.scale;

    newScale =
        clamp(
            newScale,
            state.minScale,
            state.maxScale
        );

    if (
        centerX === null ||
        centerY === null
    ) {
        const rect =
            canvas.getBoundingClientRect();

        centerX =
            rect.width / 2;

        centerY =
            rect.height / 2;
    }

    const imageX =
        (
            centerX -
            state.offsetX
        ) / oldScale;

    const imageY =
        (
            centerY -
            state.offsetY
        ) / oldScale;

    state.scale =
        newScale;

    state.offsetX =
        centerX -
        imageX * newScale;

    state.offsetY =
        centerY -
        imageY * newScale;

    updateZoomUI();

    render();
}

function zoomIn() {
    setZoom(
        state.scale * 1.2
    );
}

function zoomOut() {
    setZoom(
        state.scale / 1.2
    );
}

function resetZoom() {
    fitView();
}


// ============================================================
// ZOOM UI
// ============================================================

function updateZoomUI() {
    const zoomValue =
        $("zoomValue");

    const zoomLabel =
        $("zoomLabel");

    const percentage =
        Math.round(
            state.scale * 100
        );

    if (zoomValue) {
        zoomValue.textContent =
            `${percentage}%`;
    }

    if (zoomLabel) {
        zoomLabel.textContent =
            `${percentage}%`;
    }

    const slider =
        $("zoomSlider");

    if (slider) {
        slider.value =
            String(
                percentage
            );
    }
}


// ============================================================
// MOUSE WHEEL ZOOM
// ============================================================

function handleWheel(event) {
    if (!canvas) {
        return;
    }

    event.preventDefault();

    const rect =
        canvas.getBoundingClientRect();

    const centerX =
        event.clientX - rect.left;

    const centerY =
        event.clientY - rect.top;

    const factor =
        event.deltaY < 0
            ? 1.12
            : 1 / 1.12;

    setZoom(
        state.scale * factor,
        centerX,
        centerY
    );
}

if (canvas) {
    canvas.addEventListener(
        "wheel",
        handleWheel,
        {
            passive: false
        }
    );
}


// ============================================================
// NORMALIZE BOX
// ============================================================

function normalizeBox(start, end) {
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

    return {
        x,
        y,
        width,
        height
    };
}


// ============================================================
// CREATE BOX ANNOTATION
// ============================================================

function createBoxAnnotation(
    start,
    end
) {
    if (!state.image) {
        return null;
    }

    if (!start || !end) {
        return null;
    }

    const box =
        normalizeBox(
            start,
            end
        );

    const imageWidth =
        state.image.naturalWidth ||
        state.image.width;

    const imageHeight =
        state.image.naturalHeight ||
        state.image.height;

    box.x =
        clamp(
            box.x,
            0,
            imageWidth
        );

    box.y =
        clamp(
            box.y,
            0,
            imageHeight
        );

    box.width =
        clamp(
            box.width,
            1,
            Math.max(
                1,
                imageWidth - box.x
            )
        );

    box.height =
        clamp(
            box.height,
            1,
            Math.max(
                1,
                imageHeight - box.y
            )
        );

    if (
        box.width < 2 ||
        box.height < 2
    ) {
        return null;
    }

    const annotation = {
        id:
            `ann-${Date.now()}-${state.nextId++}`,

        type: "box",

        label: "object",

        class_name: "object",

        score: null,

        x: box.x,

        y: box.y,

        width: box.width,

        height: box.height,

        occlusion: 0,

        truncation: "NONE",

        ai_generated: false,

        corrected: false,

        export: true,

        frame_number:
            state.currentFrame
    };

    state.annotations.push(
        annotation
    );

    state.selectedId =
        annotation.id;

    pushHistory();

    saveFrame();

    updateCounts();

    updateAnnotationsList();

    render();

    emit(
        "annotation-created",
        {
            annotation
        }
    );

    return annotation;
}


// ============================================================
// POLYGON
// ============================================================

function handlePolygonPointerDown(point) {
    if (!state.drawing) {
        state.drawing = true;

        state.polygonPoints = [
            {
                x: point.x,
                y: point.y
            }
        ];

        state.drawCurrent = {
            x: point.x,
            y: point.y
        };

        render();

        return;
    }

    const first =
        state.polygonPoints[0];

    if (
        first &&
        distance(
            first,
            point
        ) < 10 / state.scale
    ) {
        finishPolygon();
        return;
    }

    state.polygonPoints.push({
        x: point.x,
        y: point.y
    });

    state.drawCurrent = {
        x: point.x,
        y: point.y
    };

    render();
}

function finishPolygon() {
    if (
        state.polygonPoints.length <
        3
    ) {
        state.drawing = false;

        state.polygonPoints = [];

        state.drawCurrent = null;

        render();

        return null;
    }

    const annotation = {
        id:
            `ann-${Date.now()}-${state.nextId++}`,

        type:
            state.annotationType ===
                "segmentation"
                ? "segmentation"
                : "polygon",

        label: "object",

        class_name: "object",

        score: null,

        points:
            state.polygonPoints.map(
                point => ({
                    x: point.x,
                    y: point.y
                })
            ),

        occlusion: 0,

        truncation: "NONE",

        ai_generated: false,

        corrected: false,

        export: true,

        frame_number:
            state.currentFrame
    };

    state.annotations.push(
        annotation
    );

    state.selectedId =
        annotation.id;

    state.drawing = false;

    state.polygonPoints = [];

    state.drawCurrent = null;

    pushHistory();

    saveFrame();

    updateCounts();

    updateAnnotationsList();

    render();

    emit(
        "annotation-created",
        {
            annotation
        }
    );

    return annotation;
}


// ============================================================
// SEGMENTATION
// ============================================================

function handleSegmentationPointerDown(point) {
    handlePolygonPointerDown(point);
}


// ============================================================
// HIT TEST
// ============================================================

function pointInPolygon(
    point,
    points
) {
    let inside = false;

    for (
        let i = 0,
            j = points.length - 1;
        i < points.length;
        j = i++
    ) {
        const xi =
            points[i].x;

        const yi =
            points[i].y;

        const xj =
            points[j].x;

        const yj =
            points[j].y;

        const intersect =
            (
                yi > point.y
            ) !==
            (
                yj > point.y
            ) &&
            point.x <
                (
                    xj - xi
                ) *
                (
                    point.y - yi
                ) /
                (
                    yj - yi
                ) +
                xi;

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

function findAnnotationAtPoint(point) {
    for (
        let i =
            state.annotations.length - 1;
        i >= 0;
        i--
    ) {
        const annotation =
            state.annotations[i];

        if (
            annotation.type ===
                "polygon" ||
            annotation.type ===
                "segmentation"
        ) {
            if (
                Array.isArray(
                    annotation.points
                ) &&
                pointInPolygon(
                    point,
                    annotation.points
                )
            ) {
                return annotation;
            }

            continue;
        }

        const x =
            Number(annotation.x) || 0;

        const y =
            Number(annotation.y) || 0;

        const width =
            Number(annotation.width) || 0;

        const height =
            Number(annotation.height) || 0;

        if (
            point.x >= x &&
            point.x <= x + width &&
            point.y >= y &&
            point.y <= y + height
        ) {
            return annotation;
        }
    }

    return null;
}


// ============================================================
// DELETE SELECTED ANNOTATION
// ============================================================

function deleteSelectedAnnotation() {
    if (!state.selectedId) {
        return;
    }

    const index =
        state.annotations.findIndex(
            annotation =>
                annotation.id ===
                state.selectedId
        );

    if (index < 0) {
        state.selectedId = null;
        return;
    }

    const deleted =
        state.annotations[index];

    state.annotations.splice(
        index,
        1
    );

    state.selectedId = null;

    pushHistory();

    saveFrame();

    updateCounts();

    updateAnnotationsList();

    hidePopup();

    render();

    emit(
        "annotation-deleted",
        {
            annotation: deleted
        }
    );
}

window.deleteSelectedAnnotation =
    deleteSelectedAnnotation;


// ============================================================
// ANNOTATION TYPE
// ============================================================

function setAnnotationType(type) {
    const allowed = [
        "box",
        "polygon",
        "segmentation"
    ];

    if (!allowed.includes(type)) {
        type = "box";
    }

    state.annotationType =
        type;

    state.mode = "draw";

    state.drawing = false;

    state.polygonPoints = [];

    state.drawStart = null;

    state.drawCurrent = null;

    document
        .querySelectorAll(
            "[data-annotation-type]"
        )
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.annotationType ===
                    type
            );
        });

    render();

    emit(
        "annotation-type-changed",
        {
            type
        }
    );
}


// ============================================================
// SELECT / PAN / DRAW TOOLS
// ============================================================

function setMode(mode) {
    const allowed = [
        "select",
        "pan",
        "draw"
    ];

    if (!allowed.includes(mode)) {
        return;
    }

    state.mode = mode;

    document
        .querySelectorAll(
            "[data-tool]"
        )
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.tool ===
                    mode
            );
        });

    if (mode !== "draw") {
        state.drawing = false;

        state.polygonPoints = [];

        state.drawStart = null;

        state.drawCurrent = null;
    }

    render();
}


// ============================================================
// MOVE SELECTED ANNOTATION
// ============================================================

function moveSelectedAnnotation(
    deltaX,
    deltaY
) {
    if (!state.selectedId) {
        return false;
    }

    const annotation =
        state.annotations.find(
            item =>
                item.id ===
                state.selectedId
        );

    if (!annotation) {
        return false;
    }

    const imageWidth =
        state.image?.naturalWidth ||
        state.image?.width ||
        Infinity;

    const imageHeight =
        state.image?.naturalHeight ||
        state.image?.height ||
        Infinity;

    if (
        annotation.type ===
            "polygon" ||
        annotation.type ===
            "segmentation"
    ) {
        if (
            !Array.isArray(
                annotation.points
            )
        ) {
            return false;
        }

        annotation.points.forEach(
            point => {
                point.x =
                    clamp(
                        point.x +
                            deltaX,
                        0,
                        imageWidth
                    );

                point.y =
                    clamp(
                        point.y +
                            deltaY,
                        0,
                        imageHeight
                    );
            }
        );
    } else {
        const width =
            Number(
                annotation.width
            ) || 0;

        const height =
            Number(
                annotation.height
            ) || 0;

        annotation.x =
            clamp(
                (
                    Number(
                        annotation.x
                    ) || 0
                ) + deltaX,
                0,
                Math.max(
                    0,
                    imageWidth -
                        width
                )
            );

        annotation.y =
            clamp(
                (
                    Number(
                        annotation.y
                    ) || 0
                ) + deltaY,
                0,
                Math.max(
                    0,
                    imageHeight -
                        height
                )
            );
    }

    render();

    return true;
}


// ============================================================
// POINTER DOWN
// ============================================================

function handleCanvasPointerDown(event) {
    if (
        !canvas ||
        !state.image
    ) {
        return;
    }

    if (
        event.button !== 0 &&
        event.button !== 1
    ) {
        return;
    }

    const point =
        getPointerPosition(event);

    state.pointerDown = true;

    try {
        canvas.setPointerCapture?.(
            event.pointerId
        );
    } catch (_) {}

    if (
        state.spacePan ||
        event.button === 1 ||
        state.mode === "pan"
    ) {
        state.panning = true;

        state.panStart = {
            x: event.clientX,

            y: event.clientY,

            offsetX:
                state.offsetX,

            offsetY:
                state.offsetY
        };

        return;
    }

    if (
        state.mode === "draw" &&
        (
            state.annotationType ===
                "polygon" ||
            state.annotationType ===
                "segmentation"
        )
    ) {
        if (
            state.annotationType ===
            "polygon"
        ) {
            handlePolygonPointerDown(
                point
            );
        } else {
            handleSegmentationPointerDown(
                point
            );
        }

        return;
    }

    if (
        state.mode === "draw" &&
        state.annotationType ===
            "box"
    ) {
        state.drawing = true;

        state.drawStart = {
            x: point.x,
            y: point.y
        };

        state.drawCurrent = {
            x: point.x,
            y: point.y
        };

        render();

        return;
    }

    if (
        state.mode === "select"
    ) {
        const hit =
            findAnnotationAtPoint(
                point
            );

        if (hit) {
            state.selectedId =
                hit.id;

            const resizeHandle =
                findResizeHandle(
                    point,
                    hit
                );

            if (resizeHandle) {
                state.resizeHandle =
                    resizeHandle;

                state.dragging = true;
            } else {
                state.resizeHandle = null;

                state.dragging = true;
            }

            state.dragStartImage = {
                x: point.x,
                y: point.y
            };

            state.dragLastImage = {
                x: point.x,
                y: point.y
            };

            showAnnotationPopup(hit);
        } else {
            state.selectedId = null;

            state.dragging = false;

            state.resizeHandle = null;

            hidePopup();
        }

        updateCounts();

        updateAnnotationsList();

        render();
    }
}


// ============================================================
// POINTER MOVE
// ============================================================

function handleCanvasPointerMove(event) {
    if (!canvas) {
        return;
    }

    const point =
        getPointerPosition(event);

    if (
        state.panning &&
        state.panStart
    ) {
        state.offsetX =
            state.panStart.offsetX +
            (
                event.clientX -
                state.panStart.x
            );

        state.offsetY =
            state.panStart.offsetY +
            (
                event.clientY -
                state.panStart.y
            );

        render();

        return;
    }

    if (
        state.drawing &&
        state.mode === "draw" &&
        state.annotationType ===
            "box"
    ) {
        state.drawCurrent = {
            x: point.x,
            y: point.y
        };

        render();

        return;
    }

    if (
        state.drawing &&
        state.mode === "draw" &&
        (
            state.annotationType ===
                "polygon" ||
            state.annotationType ===
                "segmentation"
        )
    ) {
        state.drawCurrent = {
            x: point.x,
            y: point.y
        };

        render();

        return;
    }

    if (
        state.dragging &&
        state.selectedId
    ) {
        if (
            !state.dragLastImage
        ) {
            state.dragLastImage = {
                x: point.x,
                y: point.y
            };

            return;
        }

        const deltaX =
            point.x -
            state.dragLastImage.x;

        const deltaY =
            point.y -
            state.dragLastImage.y;

        if (state.resizeHandle) {
            resizeSelectedAnnotation(
                state.resizeHandle,
                point
            );
        } else {
            moveSelectedAnnotation(
                deltaX,
                deltaY
            );
        }

        state.dragLastImage = {
            x: point.x,
            y: point.y
        };

        return;
    }

    const hit =
        findAnnotationAtPoint(
            point
        );

    state.hoveredId =
        hit?.id || null;

    render();
}


// ============================================================
// POINTER UP
// ============================================================

function handleCanvasPointerUp(event) {
    if (!canvas) {
        return;
    }

    const point =
        getPointerPosition(event);

    if (state.panning) {
        state.panning = false;

        state.panStart = null;

        state.pointerDown = false;

        try {
            canvas.releasePointerCapture?.(
                event.pointerId
            );
        } catch (_) {}

        return;
    }

    if (
        state.drawing &&
        state.mode === "draw" &&
        state.annotationType ===
            "box"
    ) {
        state.drawCurrent = {
            x: point.x,
            y: point.y
        };

        createBoxAnnotation(
            state.drawStart,
            state.drawCurrent
        );

        state.drawing = false;

        state.drawStart = null;

        state.drawCurrent = null;

        render();
    }

    if (
        state.dragging
    ) {
        state.dragging = false;

        state.dragStartImage = null;

        state.dragLastImage = null;

        state.resizeHandle = null;

        pushHistory();

        saveFrame();

        updateAnnotationsList();
    }

    state.pointerDown = false;

    try {
        canvas.releasePointerCapture?.(
            event.pointerId
        );
    } catch (_) {}

    render();
}


// ============================================================
// POINTER CANCEL
// ============================================================

function handleCanvasPointerCancel(event) {
    state.pointerDown = false;

    state.dragging = false;

    state.panning = false;

    state.drawing = false;

    state.drawStart = null;

    state.drawCurrent = null;

    state.polygonPoints = [];

    state.dragStartImage = null;

    state.dragLastImage = null;

    state.panStart = null;

    state.resizeHandle = null;

    try {
        canvas?.releasePointerCapture?.(
            event.pointerId
        );
    } catch (_) {}

    render();
}


// ============================================================
// CANVAS EVENTS
// ============================================================

if (canvas) {
    canvas.addEventListener(
        "pointerdown",
        handleCanvasPointerDown
    );

    canvas.addEventListener(
        "pointermove",
        handleCanvasPointerMove
    );

    canvas.addEventListener(
        "pointerup",
        handleCanvasPointerUp
    );

    canvas.addEventListener(
        "pointercancel",
        handleCanvasPointerCancel
    );
}


// ============================================================
// KEYBOARD
// ============================================================

document.addEventListener(
    "keydown",
    event => {
        if (
            isTypingTarget(
                event.target
            )
        ) {
            return;
        }

        if (
            event.code ===
            "Space"
        ) {
            if (!state.spacePan) {
                event.preventDefault();
            }

            state.spacePan = true;

            canvas?.classList.add(
                "space-pan"
            );

            return;
        }

        if (
            event.key === "Delete" ||
            event.key === "Backspace"
        ) {
            event.preventDefault();

            deleteSelectedAnnotation();

            return;
        }

        if (
            event.key === "Escape"
        ) {
            state.drawing = false;

            state.polygonPoints = [];

            state.drawStart = null;

            state.drawCurrent = null;

            state.dragging = false;

            state.panning = false;

            state.resizeHandle = null;

            hidePopup();

            render();

            return;
        }

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            event.key.toLowerCase() ===
                "z"
        ) {
            event.preventDefault();

            if (event.shiftKey) {
                redo();
            } else {
                undo();
            }

            return;
        }

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            event.key.toLowerCase() ===
                "y"
        ) {
            event.preventDefault();

            redo();
        }
    }
);

document.addEventListener(
    "keyup",
    event => {
        if (
            event.code ===
            "Space"
        ) {
            state.spacePan = false;

            canvas?.classList.remove(
                "space-pan"
            );
        }
    }
);


// ============================================================
// ANNOTATION TYPE BUTTON EVENTS
// ============================================================

function bindAnnotationTypeButtons() {
    document
        .querySelectorAll(
            "[data-annotation-type]"
        )
        .forEach(button => {
            if (
                button.dataset.annotationBound ===
                "true"
            ) {
                return;
            }

            button.dataset.annotationBound =
                "true";

            button.addEventListener(
                "click",
                event => {
                    event.preventDefault();

                    setAnnotationType(
                        button.dataset.annotationType
                    );
                }
            );
        });
}


// ============================================================
// TOOL BUTTON EVENTS
// ============================================================

function bindToolButtons() {
    document
        .querySelectorAll(
            "[data-tool]"
        )
        .forEach(button => {
            if (
                button.dataset.toolBound ===
                "true"
            ) {
                return;
            }

            button.dataset.toolBound =
                "true";

            button.addEventListener(
                "click",
                event => {
                    event.preventDefault();

                    setMode(
                        button.dataset.tool
                    );
                }
            );
        });
}


// ============================================================
// DELETE BUTTON
// ============================================================

function bindDeleteButton() {
    const deleteButton =
        $("deleteAnnotation");

    if (
        !deleteButton ||
        deleteButton.dataset.annotationBound ===
            "true"
    ) {
        return;
    }

    deleteButton.dataset.annotationBound =
        "true";

    deleteButton.addEventListener(
        "click",
        event => {
            event.preventDefault();

            deleteSelectedAnnotation();
        }
    );
}


// ============================================================
// RENDER
// ============================================================

function render() {
    if (!canvas || !ctx) {
        return;
    }

    const rect =
        canvas.getBoundingClientRect();

    ctx.clearRect(
        0,
        0,
        rect.width,
        rect.height
    );

    if (!state.image) {
        if (emptyWorkspace) {
            emptyWorkspace.style.display =
                "";
        }

        return;
    }

    if (emptyWorkspace) {
        emptyWorkspace.style.display =
            "none";
    }

    const imageWidth =
        state.image.naturalWidth ||
        state.image.width;

    const imageHeight =
        state.image.naturalHeight ||
        state.image.height;

    if (
        !imageWidth ||
        !imageHeight
    ) {
        return;
    }

    ctx.save();

    ctx.translate(
        state.offsetX,
        state.offsetY
    );

    ctx.scale(
        state.scale,
        state.scale
    );

    ctx.imageSmoothingEnabled =
        true;

    try {
        ctx.drawImage(
            state.image,
            0,
            0,
            imageWidth,
            imageHeight
        );
    } catch (error) {
        console.warn(
            "[Annotation] Unable to draw media:",
            error
        );
    }

    renderAnnotations();

    renderDrawingPreview();

    ctx.restore();
}


// ============================================================
// RENDER ANNOTATIONS
// ============================================================

function renderAnnotations() {
    state.annotations.forEach(
        annotation => {
            if (
                annotation.type ===
                    "polygon" ||
                annotation.type ===
                    "segmentation"
            ) {
                renderPolygonAnnotation(
                    annotation
                );
            } else {
                renderBoxAnnotation(
                    annotation
                );
            }
        }
    );
}


// ============================================================
// RENDER BOX
// ============================================================

function renderBoxAnnotation(
    annotation
) {
    const x =
        Number(annotation.x) || 0;

    const y =
        Number(annotation.y) || 0;

    const width =
        Number(annotation.width) || 0;

    const height =
        Number(annotation.height) || 0;

    const selected =
        annotation.id ===
        state.selectedId;

    const hovered =
        annotation.id ===
        state.hoveredId;

    ctx.save();

    ctx.lineWidth =
        (
            selected
                ? 3
                : hovered
                    ? 2.5
                    : 2
        ) /
        state.scale;

    if (
        state.colorMode ===
        "occlusion"
    ) {
        ctx.strokeStyle =
            getOcclusionColor(
                annotation.occlusion
            );
    } else if (
        state.colorMode ===
        "truncation"
    ) {
        ctx.strokeStyle =
            getTruncationColor(
                annotation.truncation
            );
    } else {
        ctx.strokeStyle =
            selected
                ? "#00e5ff"
                : hovered
                    ? "#ffffff"
                    : "#00ff88";
    }

    ctx.fillStyle =
        selected
            ? "rgba(0,229,255,0.10)"
            : "rgba(0,255,136,0.06)";

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

    renderAnnotationLabel(
        annotation,
        x,
        y,
        width,
        height
    );

    if (selected) {
        renderResizeHandles(
            annotation
        );
    }

    ctx.restore();
}


// ============================================================
// RENDER POLYGON
// ============================================================

function renderPolygonAnnotation(
    annotation
) {
    if (
        !Array.isArray(
            annotation.points
        ) ||
        annotation.points.length <
            2
    ) {
        return;
    }

    const selected =
        annotation.id ===
        state.selectedId;

    const hovered =
        annotation.id ===
        state.hoveredId;

    ctx.save();

    ctx.beginPath();

    annotation.points.forEach(
        (
            point,
            index
        ) => {
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

    ctx.fillStyle =
        selected
            ? "rgba(0,229,255,0.12)"
            : "rgba(255,193,7,0.08)";

    if (
        state.colorMode ===
        "occlusion"
    ) {
        ctx.strokeStyle =
            getOcclusionColor(
                annotation.occlusion
            );
    } else if (
        state.colorMode ===
        "truncation"
    ) {
        ctx.strokeStyle =
            getTruncationColor(
                annotation.truncation
            );
    } else {
        ctx.strokeStyle =
            selected
                ? "#00e5ff"
                : hovered
                    ? "#ffffff"
                    : "#ffc107";
    }

    ctx.lineWidth =
        (
            selected
                ? 3
                : 2
        ) /
        state.scale;

    ctx.fill();

    ctx.stroke();

    const first =
        annotation.points[0];

    if (first) {
        renderAnnotationLabel(
            annotation,
            first.x,
            first.y,
            0,
            0
        );
    }

    ctx.restore();
}


// ============================================================
// ANNOTATION LABEL
// ============================================================

function renderAnnotationLabel(
    annotation,
    x,
    y,
    width = 0,
    height = 0
) {
    const label =
        annotation.label ||
        annotation.class_name ||
        "object";

    const score =
        Number(annotation.score);

    let text =
        String(label);

    if (
        Number.isFinite(score)
    ) {
        text +=
            ` ${Math.round(
                score * 100
            )}%`;
    }

    const fontSize =
        13 / state.scale;

    ctx.save();

    ctx.font =
        `600 ${fontSize}px Arial`;

    const padding =
        5 / state.scale;

    const metrics =
        ctx.measureText(text);

    const boxWidth =
        metrics.width +
        padding * 2;

    const boxHeight =
        fontSize +
        padding * 2;

    const labelX =
        x;

    const labelY =
        Math.max(
            0,
            y - boxHeight
        );

    ctx.fillStyle =
        "rgba(0,0,0,0.78)";

    ctx.fillRect(
        labelX,
        labelY,
        boxWidth,
        boxHeight
    );

    ctx.fillStyle =
        "#ffffff";

    ctx.textBaseline =
        "middle";

    ctx.fillText(
        text,
        labelX + padding,
        labelY +
            boxHeight / 2
    );

    ctx.restore();
}


// ============================================================
// RESIZE HANDLES
// ============================================================

function getResizeHandles(
    annotation
) {
    if (
        !annotation ||
        annotation.type !== "box"
    ) {
        return [];
    }

    const x =
        Number(annotation.x) || 0;

    const y =
        Number(annotation.y) || 0;

    const width =
        Number(annotation.width) || 0;

    const height =
        Number(annotation.height) || 0;

    return [
        {
            name: "nw",
            x,
            y
        },
        {
            name: "n",
            x:
                x + width / 2,
            y
        },
        {
            name: "ne",
            x:
                x + width,
            y
        },
        {
            name: "e",
            x:
                x + width,
            y:
                y + height / 2
        },
        {
            name: "se",
            x:
                x + width,
            y:
                y + height
        },
        {
            name: "s",
            x:
                x + width / 2,
            y:
                y + height
        },
        {
            name: "sw",
            x,
            y:
                y + height
        },
        {
            name: "w",
            x,
            y:
                y + height / 2
        }
    ];
}

function renderResizeHandles(
    annotation
) {
    const handles =
        getResizeHandles(
            annotation
        );

    const size =
        8 / state.scale;

    handles.forEach(
        handle => {
            ctx.save();

            ctx.fillStyle =
                "#ffffff";

            ctx.strokeStyle =
                "#00e5ff";

            ctx.lineWidth =
                1.5 /
                state.scale;

            ctx.beginPath();

            ctx.rect(
                handle.x -
                    size / 2,
                handle.y -
                    size / 2,
                size,
                size
            );

            ctx.fill();

            ctx.stroke();

            ctx.restore();
        }
    );
}


// ============================================================
// FIND RESIZE HANDLE
// ============================================================

function findResizeHandle(
    point,
    annotation
) {
    if (
        !annotation ||
        annotation.type !== "box"
    ) {
        return null;
    }

    const handles =
        getResizeHandles(
            annotation
        );

    const threshold =
        12 / state.scale;

    let closest = null;

    let closestDistance =
        Infinity;

    handles.forEach(
        handle => {
            const d =
                distance(
                    point,
                    handle
                );

            if (
                d <= threshold &&
                d < closestDistance
            ) {
                closest =
                    handle.name;

                closestDistance =
                    d;
            }
        }
    );

    return closest;
}


// ============================================================
// RESIZE SELECTED BOX
// ============================================================

function resizeSelectedAnnotation(
    handle,
    point
) {
    const annotation =
        state.annotations.find(
            item =>
                item.id ===
                state.selectedId
        );

    if (
        !annotation ||
        annotation.type !== "box"
    ) {
        return;
    }

    const imageWidth =
        state.image?.naturalWidth ||
        state.image?.width ||
        Infinity;

    const imageHeight =
        state.image?.naturalHeight ||
        state.image?.height ||
        Infinity;

    let left =
        Number(annotation.x) || 0;

    let top =
        Number(annotation.y) || 0;

    let right =
        left +
        (
            Number(
                annotation.width
            ) || 0
        );

    let bottom =
        top +
        (
            Number(
                annotation.height
            ) || 0
        );

    switch (handle) {
        case "nw":
            left = point.x;
            top = point.y;
            break;

        case "n":
            top = point.y;
            break;

        case "ne":
            right = point.x;
            top = point.y;
            break;

        case "e":
            right = point.x;
            break;

        case "se":
            right = point.x;
            bottom = point.y;
            break;

        case "s":
            bottom = point.y;
            break;

        case "sw":
            left = point.x;
            bottom = point.y;
            break;

        case "w":
            left = point.x;
            break;
    }

    left =
        clamp(
            left,
            0,
            imageWidth
        );

    right =
        clamp(
            right,
            0,
            imageWidth
        );

    top =
        clamp(
            top,
            0,
            imageHeight
        );

    bottom =
        clamp(
            bottom,
            0,
            imageHeight
        );

    const minSize = 2;

    if (
        right - left <
        minSize
    ) {
        if (
            handle.includes("w")
        ) {
            left =
                Math.max(
                    0,
                    right -
                        minSize
                );
        } else {
            right =
                Math.min(
                    imageWidth,
                    left +
                        minSize
                );
        }
    }

    if (
        bottom - top <
        minSize
    ) {
        if (
            handle.includes("n")
        ) {
            top =
                Math.max(
                    0,
                    bottom -
                        minSize
                );
        } else {
            bottom =
                Math.min(
                    imageHeight,
                    top +
                        minSize
                );
        }
    }

    annotation.x =
        Math.max(
            0,
            left
        );

    annotation.y =
        Math.max(
            0,
            top
        );

    annotation.width =
        Math.max(
            minSize,
            right - left
        );

    annotation.height =
        Math.max(
            minSize,
            bottom - top
        );

    render();
}


// ============================================================
// DRAWING PREVIEW
// ============================================================

function renderDrawingPreview() {
    if (!state.drawing) {
        return;
    }

    ctx.save();

    if (
        state.annotationType ===
            "box" &&
        state.drawStart &&
        state.drawCurrent
    ) {
        const box =
            normalizeBox(
                state.drawStart,
                state.drawCurrent
            );

        ctx.strokeStyle =
            "#00e5ff";

        ctx.fillStyle =
            "rgba(0,229,255,0.10)";

        ctx.lineWidth =
            2 /
            state.scale;

        ctx.setLineDash([
            6 / state.scale,
            4 / state.scale
        ]);

        ctx.fillRect(
            box.x,
            box.y,
            box.width,
            box.height
        );

        ctx.strokeRect(
            box.x,
            box.y,
            box.width,
            box.height
        );
    }

    if (
        (
            state.annotationType ===
                "polygon" ||
            state.annotationType ===
                "segmentation"
        ) &&
        state.polygonPoints.length
    ) {
        ctx.strokeStyle =
            "#00e5ff";

        ctx.fillStyle =
            "rgba(0,229,255,0.10)";

        ctx.lineWidth =
            2 /
            state.scale;

        ctx.setLineDash([]);

        ctx.beginPath();

        state.polygonPoints.forEach(
            (
                point,
                index
            ) => {
                if (
                    index === 0
                ) {
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

        if (
            state.drawCurrent
        ) {
            ctx.lineTo(
                state.drawCurrent.x,
                state.drawCurrent.y
            );
        }

        ctx.stroke();

        if (
            state.polygonPoints.length >=
            3
        ) {
            ctx.fill();
        }

        state.polygonPoints.forEach(
            point => {
                ctx.beginPath();

                ctx.fillStyle =
                    "#ffffff";

                ctx.arc(
                    point.x,
                    point.y,
                    4 /
                        state.scale,
                    0,
                    Math.PI * 2
                );

                ctx.fill();
            }
        );
    }

    ctx.restore();
}


// ============================================================
// COUNTS
// ============================================================

function updateCounts() {
    const count =
        state.annotations.length;

    const objectCount =
        $("objectCount");

    if (objectCount) {
        objectCount.textContent =
            String(count);
    }

    const selectedObject =
        $("selectedObject");

    if (selectedObject) {
        selectedObject.textContent =
            state.selectedId
                ? "1"
                : "0";
    }

    const annotationCount =
        $("annotationCount");

    if (annotationCount) {
        annotationCount.textContent =
            String(count);
    }

    const selectedCount =
        $("selectedCount");

    if (selectedCount) {
        selectedCount.textContent =
            state.selectedId
                ? "1"
                : "0";
    }
}


// ============================================================
// ANNOTATION LIST
// ============================================================

function updateAnnotationsList() {
    if (!annotationsList) {
        return;
    }

    annotationsList.innerHTML =
        "";

    if (
        state.annotations.length ===
        0
    ) {
        const empty =
            document.createElement(
                "div"
            );

        empty.className =
            "annotations-empty";

        empty.textContent =
            "No annotations yet.";

        annotationsList.appendChild(
            empty
        );

        return;
    }

    state.annotations.forEach(
        (
            annotation,
            index
        ) => {
            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "annotation-list-item";

            if (
                annotation.id ===
                state.selectedId
            ) {
                item.classList.add(
                    "selected"
                );
            }

            item.dataset.annotationId =
                annotation.id;

            const number =
                document.createElement(
                    "span"
                );

            number.className =
                "annotation-list-number";

            number.textContent =
                String(index + 1);

            const label =
                document.createElement(
                    "span"
                );

            label.className =
                "annotation-list-label";

            label.textContent =
                annotation.label ||
                annotation.class_name ||
                "object";

            const type =
                document.createElement(
                    "span"
                );

            type.className =
                "annotation-list-type";

            type.textContent =
                annotation.type ||
                "box";

            item.appendChild(number);

            item.appendChild(label);

            item.appendChild(type);

            item.addEventListener(
                "click",
                event => {
                    event.preventDefault();

                    state.selectedId =
                        annotation.id;

                    updateAnnotationsList();

                    updateCounts();

                    showAnnotationPopup(
                        annotation
                    );

                    render();
                }
            );

            annotationsList.appendChild(
                item
            );
        }
    );
}


// ============================================================
// POPUP
// ============================================================

function showAnnotationPopup(
    annotation
) {
    if (
        !popupEl ||
        !annotation
    ) {
        return;
    }

    if (popupTitle) {
        popupTitle.textContent =
            annotation.label ||
            annotation.class_name ||
            "Annotation";
    }

    if (popupBody) {
        const score =
            Number(
                annotation.score
            );

        const scoreText =
            Number.isFinite(score)
                ? `${Math.round(
                    score * 100
                )}%`
                : "—";

        popupBody.innerHTML = `
            <div class="annotation-popup-row">
                <span>Type</span>
                <strong>
                    ${escapeHTML(
                        annotation.type ||
                        "box"
                    )}
                </strong>
            </div>

            <div class="annotation-popup-row">
                <span>Label</span>
                <strong>
                    ${escapeHTML(
                        annotation.label ||
                        annotation.class_name ||
                        "object"
                    )}
                </strong>
            </div>

            <div class="annotation-popup-row">
                <span>Confidence</span>
                <strong>
                    ${scoreText}
                </strong>
            </div>

            <div class="annotation-popup-row">
                <span>Source</span>
                <strong>
                    ${
                        annotation.ai_generated
                            ? "AI"
                            : "Manual"
                    }
                </strong>
            </div>
        `;
    }

    popupEl.classList.add(
        "visible"
    );

    popupEl.style.display = "";

    state.popupExpanded = false;

    popupEl.classList.remove(
        "expanded"
    );
}

function hidePopup() {
    if (!popupEl) {
        return;
    }

    popupEl.classList.remove(
        "visible"
    );

    popupEl.style.display =
        "none";
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


// ============================================================
// POPUP EXPAND
// ============================================================

function bindPopup() {
    if (
        !popupExpandBtn ||
        popupExpandBtn.dataset.annotationBound ===
            "true"
    ) {
        return;
    }

    popupExpandBtn.dataset.annotationBound =
        "true";

    popupExpandBtn.addEventListener(
        "click",
        event => {
            event.preventDefault();

            state.popupExpanded =
                !state.popupExpanded;

            popupEl?.classList.toggle(
                "expanded",
                state.popupExpanded
            );
        }
    );
}


// ============================================================
// ANNOTATION PROPERTY EDITING
// ============================================================

function updateSelectedLabel(label) {
    if (!state.selectedId) {
        return;
    }

    const annotation =
        state.annotations.find(
            item =>
                item.id ===
                state.selectedId
        );

    if (!annotation) {
        return;
    }

    const value =
        String(
            label || "object"
        ).trim();

    annotation.label =
        value || "object";

    annotation.class_name =
        annotation.label;

    pushHistory();

    saveFrame();

    updateAnnotationsList();

    render();
}


// ============================================================
// OCCLUSION / TRUNCATION COLORS
// ============================================================

function getOcclusionColor(value) {
    const level =
        Number(value) || 0;

    if (level >= 2) {
        return "#ff3b30";
    }

    if (level >= 1) {
        return "#ffcc00";
    }

    return "#00ff88";
}

function getTruncationColor(value) {
    const normalized =
        String(
            value || "NONE"
        ).toUpperCase();

    if (
        normalized ===
        "HEAVY"
    ) {
        return "#ff3b30";
    }

    if (
        normalized ===
        "PARTIAL"
    ) {
        return "#ffcc00";
    }

    return "#00ff88";
}


// ============================================================
// COLOR MODE
// ============================================================

function setColorMode(mode) {
    const allowed = [
        "normal",
        "occlusion",
        "truncation"
    ];

    if (!allowed.includes(mode)) {
        mode = "normal";
    }

    state.colorMode =
        mode;

    document
        .querySelectorAll(
            "[data-color-mode]"
        )
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.colorMode ===
                    mode
            );
        });

    render();
}

function bindColorModeButtons() {
    document
        .querySelectorAll(
            "[data-color-mode]"
        )
        .forEach(button => {
            if (
                button.dataset.annotationBound ===
                "true"
            ) {
                return;
            }

            button.dataset.annotationBound =
                "true";

            button.addEventListener(
                "click",
                event => {
                    event.preventDefault();

                    setColorMode(
                        button.dataset.colorMode
                    );
                }
            );
        });
}


// ============================================================
// HISTORY
// ============================================================

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

    if (
        state.history.length >
        100
    ) {
        state.history.shift();
    }

    state.historyIndex =
        state.history.length - 1;

    updateHistoryButtons();

    emit(
        "annotation-history-changed"
    );
}

function restoreHistory(snapshot) {
    state.annotations =
        cloneAnnotations(
            snapshot
        );

    state.selectedId = null;

    updateCounts();

    updateAnnotationsList();

    render();

    saveFrame();
}

function undo() {
    if (
        state.historyIndex <=
        0
    ) {
        return;
    }

    state.historyIndex--;

    const snapshot =
        state.history[
            state.historyIndex
        ];

    restoreHistory(
        snapshot
    );

    updateHistoryButtons();
}

function redo() {
    if (
        state.historyIndex >=
        state.history.length - 1
    ) {
        return;
    }

    state.historyIndex++;

    const snapshot =
        state.history[
            state.historyIndex
        ];

    restoreHistory(
        snapshot
    );

    updateHistoryButtons();
}

function updateHistoryButtons() {
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

function bindHistoryButtons() {
    const undoButton =
        $("undoButton");

    if (
        undoButton &&
        undoButton.dataset.annotationBound !==
            "true"
    ) {
        undoButton.dataset.annotationBound =
            "true";

        undoButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                undo();
            }
        );
    }

    const redoButton =
        $("redoButton");

    if (
        redoButton &&
        redoButton.dataset.annotationBound !==
            "true"
    ) {
        redoButton.dataset.annotationBound =
            "true";

        redoButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                redo();
            }
        );
    }
}


// ============================================================
// FRAME ANNOTATIONS
// ============================================================

function frameKey(frameNumber) {
    return Number(
        frameNumber || 0
    );
}

function saveFrame() {
    if (
        state.mediaType !==
        "video"
    ) {
        return;
    }

    state.frameAnnotations.set(
        frameKey(
            state.currentFrame
        ),
        cloneAnnotations(
            state.annotations
        )
    );

    emit(
        "annotation-frame-saved",
        {
            frame:
                state.currentFrame
        }
    );
}

function loadFrame(frameNumber) {
    if (
        state.mediaType !==
        "video"
    ) {
        return;
    }

    saveFrame();

    const key =
        frameKey(frameNumber);

    const saved =
        state.frameAnnotations.get(
            key
        );

    state.annotations =
        cloneAnnotations(
            saved || []
        );

    state.currentFrame =
        key;

    state.selectedId = null;

    state.hoveredId = null;

    state.history = [
        cloneAnnotations(
            state.annotations
        )
    ];

    state.historyIndex = 0;

    updateCounts();

    updateAnnotationsList();

    updateHistoryButtons();

    render();

    emit(
        "annotation-frame-loaded",
        {
            frame: key
        }
    );
}

function clearFrameAnnotations() {
    state.frameAnnotations.clear();

    state.annotations = [];

    state.selectedId = null;

    state.hoveredId = null;

    state.history = [
        []
    ];

    state.historyIndex = 0;

    updateCounts();

    updateAnnotationsList();

    updateHistoryButtons();

    render();

    emit(
        "annotation-frames-cleared"
    );
}


// ============================================================
// INITIAL HISTORY
// ============================================================

function resetHistory() {
    state.history = [
        cloneAnnotations(
            state.annotations
        )
    ];

    state.historyIndex = 0;

    updateHistoryButtons();
}


// ============================================================
// ZOOM BUTTONS
// ============================================================

function bindZoomControls() {
    const zoomInButton =
        $("zoomIn");

    if (
        zoomInButton &&
        zoomInButton.dataset.annotationBound !==
            "true"
    ) {
        zoomInButton.dataset.annotationBound =
            "true";

        zoomInButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                zoomIn();
            }
        );
    }

    const zoomOutButton =
        $("zoomOut");

    if (
        zoomOutButton &&
        zoomOutButton.dataset.annotationBound !==
            "true"
    ) {
        zoomOutButton.dataset.annotationBound =
            "true";

        zoomOutButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                zoomOut();
            }
        );
    }

    const zoomResetButton =
        $("zoomReset");

    if (
        zoomResetButton &&
        zoomResetButton.dataset.annotationBound !==
            "true"
    ) {
        zoomResetButton.dataset.annotationBound =
            "true";

        zoomResetButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                resetZoom();
            }
        );
    }

    const zoomSlider =
        $("zoomSlider");

    if (
        zoomSlider &&
        zoomSlider.dataset.annotationBound !==
            "true"
    ) {
        zoomSlider.dataset.annotationBound =
            "true";

        zoomSlider.addEventListener(
            "input",
            event => {
                const value =
                    Number(
                        event.target.value
                    );

                if (
                    Number.isFinite(
                        value
                    )
                ) {
                    setZoom(
                        value / 100
                    );
                }
            }
        );
    }
}


// ============================================================
// WINDOW RESIZE
// ============================================================

let resizeTimer = null;

function bindWindowEvents() {
    if (
        window.__annotationResizeBound
    ) {
        return;
    }

    window.__annotationResizeBound =
        true;

    window.addEventListener(
        "resize",
        () => {
            clearTimeout(
                resizeTimer
            );

            resizeTimer =
                setTimeout(
                    () => {
                        resizeCanvas();
                    },
                    50
                );
        }
    );
}


// ============================================================
// INITIALIZE ANNOTATION
// ============================================================

function initializeAnnotation() {
    if (
        state.__initialized
    ) {
        return state;
    }

    state.__initialized = true;

    bindAnnotationTypeButtons();

    bindToolButtons();

    bindDeleteButton();

    bindPopup();

    bindColorModeButtons();

    bindHistoryButtons();

    bindZoomControls();

    bindWindowEvents();

    if (canvas) {
        resizeCanvas();
    } else {
        console.warn(
            "[Annotation] Canvas element not found."
        );
    }

    updateCounts();

    updateAnnotationsList();

    resetHistory();

    updateHistoryButtons();

    window.annotationInitialized =
        true;

    emit(
        "annotation-module-ready",
        {
            state
        }
    );

    return state;
}


// ============================================================
// BACKWARD COMPATIBILITY ALIAS
// ============================================================

function initializeAnnotationCanvas() {
    return initializeAnnotation();
}


// ============================================================
// PUBLIC ANNOTATION API
// ============================================================

export {
    state,

    MODELS,

    LABEL_ALIASES,

    render,

    resizeCanvas,

    fitView,

    setZoom,

    zoomIn,

    zoomOut,

    resetZoom,

    updateZoomUI,

    setMode,

    setAnnotationType,

    createBoxAnnotation,

    finishPolygon,

    deleteSelectedAnnotation,

    findAnnotationAtPoint,

    updateCounts,

    updateAnnotationsList,

    showAnnotationPopup,

    hidePopup,

    pushHistory,

    undo,

    redo,

    saveFrame,

    loadFrame,

    clearFrameAnnotations,

    resetHistory,

    updateSelectedLabel,

    setColorMode,

    moveSelectedAnnotation,

    resizeSelectedAnnotation,

    initializeAnnotation,

    initializeAnnotationCanvas,

    emit,

    $,    
    showToast
};


// ============================================================
// GLOBAL COMPATIBILITY API
// ============================================================

window.annotationState =
    state;

window.annotationRender =
    render;

window.annotationResizeCanvas =
    resizeCanvas;

window.annotationFitView =
    fitView;

window.annotationSetZoom =
    setZoom;

window.annotationZoomIn =
    zoomIn;

window.annotationZoomOut =
    zoomOut;

window.annotationResetZoom =
    resetZoom;

window.annotationUndo =
    undo;

window.annotationRedo =
    redo;

window.annotationSaveFrame =
    saveFrame;

window.annotationLoadFrame =
    loadFrame;

window.annotationDeleteSelected =
    deleteSelectedAnnotation;

window.annotationSetMode =
    setMode;

window.annotationSetType =
    setAnnotationType;

window.initializeAnnotation =
    initializeAnnotation;

window.initializeAnnotationCanvas =
    initializeAnnotationCanvas;


// ============================================================
// AUTO INITIALIZE
// ============================================================

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeAnnotation,
        {
            once: true
        }
    );
} else {
    initializeAnnotation();
}
