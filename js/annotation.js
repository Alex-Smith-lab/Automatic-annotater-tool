// ============================================================
// ANNOTATION AI
// ANNOTATION WORKSPACE MODULE
// PART 2A
// ============================================================

import {
    APP_CONFIG
} from "./config.js";


// ============================================================
// DOM HELPERS
// ============================================================

const ID_ALIASES = {

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
        "deleteSelected",

    uploadPanel:
        "customerUploadPanel"
};


function $(id) {

    return document.getElementById(
        ID_ALIASES[id] || id
    );
}


// ============================================================
// DOM REFERENCES
// ============================================================

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


// ============================================================
// AI MODEL NAMES
// ============================================================

const MODELS = {

    detr:
        "Xenova/detr-resnet-50",

    yolo:
        "Xenova/yolov9-c",

    panoptic:
        "Xenova/detr-resnet-50-panoptic"
};


const LABEL_ALIASES = {

    automobile:
        "car",

    vehicle:
        "car",

    "motor vehicle":
        "car",

    human:
        "person",

    cyclist:
        "bicycle",

    bike:
        "bicycle"
};


// ============================================================
// UTILITY
// ============================================================

function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


function cloneAnnotations(
    annotations
) {

    return JSON.parse(
        JSON.stringify(
            annotations || []
        )
    );
}


function isTypingTarget(
    element
) {

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


    toast.textContent =
        message;


    toastContainer.appendChild(
        toast
    );


    requestAnimationFrame(
        () => {

            toast.classList.add(
                "show"
            );

        }
    );


    setTimeout(
        () => {

            toast.classList.remove(
                "show"
            );


            setTimeout(
                () => toast.remove(),
                250
            );

        },
        duration
    );
}


// ============================================================
// CANVAS RESIZE
// ============================================================

function resizeCanvas() {

    if (
        !canvas ||
        !workspace
    ) {

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
        window.devicePixelRatio ||
        1;


    canvas.width =
        Math.round(
            rect.width *
            ratio
        );


    canvas.height =
        Math.round(
            rect.height *
            ratio
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

    if (
        !canvas ||
        !state.image
    ) {

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
        rect.width /
        imageWidth;


    const scaleY =
        rect.height /
        imageHeight;


    state.scale =
        Math.min(
            scaleX,
            scaleY
        ) *
        0.92;


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
            imageWidth *
            state.scale
        ) /
        2;


    state.offsetY =
        (
            rect.height -
            imageHeight *
            state.scale
        ) /
        2;


    updateZoomUI();
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
        clientX -
        rect.left;


    const y =
        clientY -
        rect.top;


    return {

        x:
            (
                x -
                state.offsetX
            ) /
            state.scale,

        y:
            (
                y -
                state.offsetY
            ) /
            state.scale
    };
}


function imageToScreen(
    x,
    y
) {

    return {

        x:
            state.offsetX +
            x *
            state.scale,

        y:
            state.offsetY +
            y *
            state.scale
    };
}


function getPointerPosition(
    event
) {

    return screenToImage(
        event.clientX,
        event.clientY
    );
}


function distance(
    a,
    b
) {

    const dx =
        a.x -
        b.x;

    const dy =
        a.y -
        b.y;

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
        ) /
        oldScale;


    const imageY =
        (
            centerY -
            state.offsetY
        ) /
        oldScale;


    state.scale =
        newScale;


    state.offsetX =
        centerX -
        imageX *
        newScale;


    state.offsetY =
        centerY -
        imageY *
        newScale;


    updateZoomUI();

    render();
}


function zoomIn() {

    setZoom(
        state.scale *
        1.2
    );
}


function zoomOut() {

    setZoom(
        state.scale /
        1.2
    );
}


function resetZoom() {

    fitView();

    render();
}


function updateZoomUI() {

    const zoomValue =
        $("zoomValue");

    const zoomLabel =
        $("zoomLabel");

    const percentage =
        Math.round(
            state.scale *
            100
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
            percentage;
    }
}


// ============================================================
// MOUSE WHEEL ZOOM
// ============================================================

function handleWheel(
    event
) {

    if (!canvas) {
        return;
    }


    event.preventDefault();


    const rect =
        canvas.getBoundingClientRect();


    const centerX =
        event.clientX -
        rect.left;


    const centerY =
        event.clientY -
        rect.top;


    const factor =
        event.deltaY < 0
            ? 1.12
            : 1 / 1.12;


    setZoom(
        state.scale *
        factor,
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

function normalizeBox(
    start,
    end
) {

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
            end.x -
            start.x
        );


    const height =
        Math.abs(
            end.y -
            start.y
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
            imageWidth -
                box.x
        );


    box.height =
        clamp(
            box.height,
            1,
            imageHeight -
                box.y
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

        type:
            "box",

        label:
            "object",

        class_name:
            "object",

        score:
            null,

        x:
            box.x,

        y:
            box.y,

        width:
            box.width,

        height:
            box.height,

        occlusion:
            0,

        truncation:
            "NONE",

        ai_generated:
            false,

        corrected:
            false,

        export:
            true,

        frame_number:
            state.currentFrame
    };


    state.annotations.push(
        annotation
    );


    state.selectedId =
        annotation.id;


    pushHistory();


    updateCounts();

    updateAnnotationsList();

    render();


    return annotation;
}


// ============================================================
// POLYGON
// ============================================================

function handlePolygonPointerDown(
    point
) {

    if (!state.drawing) {

        state.drawing =
            true;

        state.polygonPoints =
            [
                {
                    x: point.x,
                    y: point.y
                }
            ];

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


    state.polygonPoints.push(
        {
            x: point.x,
            y: point.y
        }
    );


    render();
}


function finishPolygon() {

    if (
        state.polygonPoints.length <
        3
    ) {

        state.drawing =
            false;

        state.polygonPoints =
            [];

        render();

        return;
    }


    const annotation = {

        id:
            `ann-${Date.now()}-${state.nextId++}`,

        type:
            "polygon",

        label:
            "object",

        class_name:
            "object",

        score:
            null,

        points:
            state.polygonPoints.map(
                point => ({
                    x: point.x,
                    y: point.y
                })
            ),

        occlusion:
            0,

        truncation:
            "NONE",

        ai_generated:
            false,

        corrected:
            false,

        export:
            true,

        frame_number:
            state.currentFrame
    };


    state.annotations.push(
        annotation
    );


    state.selectedId =
        annotation.id;


    state.drawing =
        false;


    state.polygonPoints =
        [];


    pushHistory();

    updateCounts();

    updateAnnotationsList();

    render();
}


// ============================================================
// SEGMENTATION
// ============================================================

function handleSegmentationPointerDown(
    point
) {

    /*
     * Segmentation uses the same polygon interaction
     * until a dedicated segmentation model is available.
     */

    handlePolygonPointerDown(
        point
    );
}


// ============================================================
// HIT TEST
// ============================================================

function pointInPolygon(
    point,
    points
) {

    let inside =
        false;


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

            inside =
                !inside;
        }
    }


    return inside;
}


function findAnnotationAtPoint(
    point
) {

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
            Number(
                annotation.x
            ) || 0;

        const y =
            Number(
                annotation.y
            ) || 0;

        const width =
            Number(
                annotation.width
            ) || 0;

        const height =
            Number(
                annotation.height
            ) || 0;


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

    if (
        !state.selectedId
    ) {

        return;
    }


    const index =
        state.annotations.findIndex(
            annotation =>
                annotation.id ===
                state.selectedId
        );


    if (index < 0) {

        state.selectedId =
            null;

        return;
    }


    state.annotations.splice(
        index,
        1
    );


    state.selectedId =
        null;


    pushHistory();

    saveFrame();

    updateCounts();

    updateAnnotationsList();

    hidePopup();

    render();
}


// ============================================================
// EXPORT DELETE
// ============================================================

window.deleteSelectedAnnotation =
    deleteSelectedAnnotation;
// ============================================================
// ANNOTATION TYPE BUTTONS
// ============================================================

function setAnnotationType(
    type
) {

    const allowed = [
        "box",
        "polygon",
        "segmentation"
    ];


    if (
        !allowed.includes(type)
    ) {

        type = "box";
    }


    state.annotationType =
        type;


    state.mode =
        type === "box"
            ? "draw"
            : "draw";


    state.drawing =
        false;

    state.polygonPoints =
        [];

    state.drawStart =
        null;

    state.drawCurrent =
        null;


    document
        .querySelectorAll(
            "[data-annotation-type]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.annotationType ===
                        type
                );
            }
        );


    render();
}


// ------------------------------------------------------------
// Find annotation type buttons by common IDs/classes
// ------------------------------------------------------------

document
    .querySelectorAll(
        "[data-annotation-type]"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    setAnnotationType(
                        button.dataset.annotationType
                    );
                }
            );
        }
    );


// ============================================================
// SELECT / PAN / DRAW TOOLS
// ============================================================

function setMode(
    mode
) {

    const allowed = [
        "select",
        "pan",
        "draw"
    ];


    if (
        !allowed.includes(mode)
    ) {

        return;
    }


    state.mode =
        mode;


    document
        .querySelectorAll(
            "[data-tool]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.tool ===
                        mode
                );
            }
        );


    if (mode !== "draw") {

        state.drawing =
            false;

        state.polygonPoints =
            [];

        state.drawStart =
            null;

        state.drawCurrent =
            null;
    }


    render();
}


document
    .querySelectorAll(
        "[data-tool]"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    setMode(
                        button.dataset.tool
                    );
                }
            );
        }
    );


// ============================================================
// MOVE SELECTED ANNOTATION
// ============================================================

function moveSelectedAnnotation(
    deltaX,
    deltaY
) {

    if (
        !state.selectedId
    ) {

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

            return;
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

        annotation.x =
            clamp(
                (
                    Number(
                        annotation.x
                    ) || 0
                ) +
                deltaX,
                0,
                imageWidth -
                    (
                        Number(
                            annotation.width
                        ) || 0
                    )
            );


        annotation.y =
            clamp(
                (
                    Number(
                        annotation.y
                    ) || 0
                ) +
                deltaY,
                0,
                imageHeight -
                    (
                        Number(
                            annotation.height
                        ) || 0
                    )
            );
    }


    render();
}


// ============================================================
// POINTER DOWN
// ============================================================

function handleCanvasPointerDown(
    event
) {

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
        getPointerPosition(
            event
        );


    state.pointerDown =
        true;


    canvas.setPointerCapture?.(
        event.pointerId
    );


    // --------------------------------------------------------
    // SPACE + POINTER = PAN
    // --------------------------------------------------------

    if (
        state.spacePan ||
        event.button === 1 ||
        state.mode === "pan"
    ) {

        state.panning =
            true;

        state.panStart = {

            x:
                event.clientX,

            y:
                event.clientY,

            offsetX:
                state.offsetX,

            offsetY:
                state.offsetY
        };

        return;
    }


    // --------------------------------------------------------
    // POLYGON
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // BOX DRAW
    // --------------------------------------------------------

    if (
        state.mode === "draw" &&
        state.annotationType ===
            "box"
    ) {

        state.drawing =
            true;

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


    // --------------------------------------------------------
    // SELECT
    // --------------------------------------------------------

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

            state.dragging =
                true;

            state.dragStartImage = {
                x: point.x,
                y: point.y
            };

            state.dragLastImage = {
                x: point.x,
                y: point.y
            };


            showAnnotationPopup(
                hit
            );

        } else {

            state.selectedId =
                null;

            hidePopup();
        }


        updateCounts();

        render();
    }
}


// ============================================================
// POINTER MOVE
// ============================================================

function handleCanvasPointerMove(
    event
) {

    if (
        !canvas
    ) {

        return;
    }


    const point =
        getPointerPosition(
            event
        );


    // --------------------------------------------------------
    // PAN
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // BOX DRAW PREVIEW
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // DRAG SELECTED
    // --------------------------------------------------------

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


        moveSelectedAnnotation(
            deltaX,
            deltaY
        );


        state.dragLastImage = {
            x: point.x,
            y: point.y
        };


        return;
    }


    // --------------------------------------------------------
    // HOVER
    // --------------------------------------------------------

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

function handleCanvasPointerUp(
    event
) {

    if (!canvas) {
        return;
    }


    const point =
        getPointerPosition(
            event
        );


    // --------------------------------------------------------
    // FINISH PAN
    // --------------------------------------------------------

    if (
        state.panning
    ) {

        state.panning =
            false;

        state.panStart =
            null;

        state.pointerDown =
            false;

        canvas.releasePointerCapture?.(
            event.pointerId
        );

        return;
    }


    // --------------------------------------------------------
    // FINISH BOX
    // --------------------------------------------------------

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


        state.drawing =
            false;

        state.drawStart =
            null;

        state.drawCurrent =
            null;


        render();
    }


    // --------------------------------------------------------
    // FINISH DRAG
    // --------------------------------------------------------

    if (
        state.dragging
    ) {

        state.dragging =
            false;

        state.dragStartImage =
            null;

        state.dragLastImage =
            null;


        pushHistory();

        saveFrame();
    }


    state.pointerDown =
        false;


    canvas.releasePointerCapture?.(
        event.pointerId
    );


    render();
}


// ============================================================
// POINTER CANCEL
// ============================================================

function handleCanvasPointerCancel(
    event
) {

    state.pointerDown =
        false;

    state.dragging =
        false;

    state.panning =
        false;

    state.drawing =
        false;

    state.drawStart =
        null;

    state.drawCurrent =
        null;

    state.polygonPoints =
        [];

    state.dragStartImage =
        null;

    state.dragLastImage =
        null;

    state.panStart =
        null;


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


        // ----------------------------------------------------
        // SPACE = PAN
        // ----------------------------------------------------

        if (
            event.code ===
            "Space"
        ) {

            state.spacePan =
                true;

            canvas?.classList.add(
                "space-pan"
            );

            return;
        }


        // ----------------------------------------------------
        // DELETE
        // ----------------------------------------------------

        if (
            event.key ===
                "Delete" ||
            event.key ===
                "Backspace"
        ) {

            event.preventDefault();

            deleteSelectedAnnotation();

            return;
        }


        // ----------------------------------------------------
        // ESCAPE
        // ----------------------------------------------------

        if (
            event.key ===
            "Escape"
        ) {

            state.drawing =
                false;

            state.polygonPoints =
                [];

            state.drawStart =
                null;

            state.drawCurrent =
                null;

            state.dragging =
                false;

            state.panning =
                false;

            hidePopup();

            render();

            return;
        }


        // ----------------------------------------------------
        // CTRL/CMD + Z
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // CTRL/CMD + Y
        // ----------------------------------------------------

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

            return;
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

            state.spacePan =
                false;

            canvas?.classList.remove(
                "space-pan"
            );
        }
    }
);


// ============================================================
// DELETE BUTTON
// ============================================================

$(`
deleteAnnotation
`);


const deleteButton =
    $("deleteAnnotation");

if (deleteButton) {

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

    if (
        !canvas ||
        !ctx
    ) {

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


    // --------------------------------------------------------
    // EMPTY STATE
    // --------------------------------------------------------

    if (
        !state.image
    ) {

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


    // --------------------------------------------------------
    // IMAGE
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // ANNOTATIONS
    // --------------------------------------------------------

    renderAnnotations();


    // --------------------------------------------------------
    // DRAW PREVIEW
    // --------------------------------------------------------

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
        Number(
            annotation.x
        ) || 0;

    const y =
        Number(
            annotation.y
        ) || 0;

    const width =
        Number(
            annotation.width
        ) || 0;

    const height =
        Number(
            annotation.height
        ) || 0;


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


    ctx.strokeStyle =
        selected
            ? "#00e5ff"
            : hovered
                ? "#ffffff"
                : "#00ff88";


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


    ctx.strokeStyle =
        selected
            ? "#00e5ff"
            : hovered
                ? "#ffffff"
                : "#ffc107";


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
