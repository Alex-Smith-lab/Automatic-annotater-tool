import {
    pipeline,
    env,
    RawImage
} from "@huggingface/transformers";


/* =========================================================
   TRANSFORMERS.JS SETTINGS
========================================================= */

env.allowLocalModels = false;
env.allowRemoteModels = true;


/* =========================================================
   DOM
========================================================= */

const canvas =
    document.getElementById("annotationCanvas");

const ctx =
    canvas.getContext("2d");

const workspace =
    document.getElementById("canvasWorkspace");

const mediaInput =
    document.getElementById("mediaInput");

const sourceVideo =
    document.getElementById("sourceVideo");

const emptyWorkspace =
    document.getElementById("emptyWorkspace");

const fileName =
    document.getElementById("fileName");

const objectCount =
    document.getElementById("objectCount");

const annotationMode =
    document.getElementById("annotationMode");

const activeToolLabel =
    document.getElementById("activeTool");

const selectedObjectLabel =
    document.getElementById("selectedObject");

const zoomValue =
    document.getElementById("zoomValue");

const footerZoom =
    document.getElementById("footerZoom");

const classificationCard =
    document.getElementById("classificationCard");

const annotationDetails =
    document.getElementById("annotationDetails");

const aiStatus =
    document.getElementById("aiStatus");

const confidence =
    document.getElementById("confidence");

const confidenceValue =
    document.getElementById("confidenceValue");

const aiEngine =
    document.getElementById("aiEngine");

const rulesInput =
    document.getElementById("rules");


/* =========================================================
   APPLICATION STATE
========================================================= */

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

    isPlaying: false,

    /* -----------------------------------------------------
       View
    ----------------------------------------------------- */

    scale: 1,

    offsetX: 0,

    offsetY: 0,

    minScale: 0.05,

    maxScale: 20,

    /* -----------------------------------------------------
       Tools
    ----------------------------------------------------- */

    annotationType: "box",

    mode: "select",

    selectedId: null,

    hoveredId: null,

    isPointerDown: false,

    isPanning: false,

    isDrawing: false,

    resizeHandle: null,

    dragStart: null,

    polygonPoints: [],

    /* -----------------------------------------------------
       Annotations
    ----------------------------------------------------- */

    annotations: [],

    frameAnnotations: new Map(),

    nextAnnotationId: 1,

    /* -----------------------------------------------------
       AI
    ----------------------------------------------------- */

    detr: null,

    yolo: null,

    aiBusy: false,

    /* -----------------------------------------------------
       Video
    ----------------------------------------------------- */

    videoReady: false,

    videoFrameRequest: null,

    /* -----------------------------------------------------
       Classification
    ----------------------------------------------------- */

    classes: new Set()

};


/* =========================================================
   MODEL CONFIGURATION
========================================================= */

const MODELS = {

    detr:
        "Xenova/detr-resnet-50",

    /*
     * YOLO model supplied through Transformers.js.
     *
     * This is a COCO object detector.
     */
    yolo:
        "Xenova/yolov9-c"

};


/* =========================================================
   COCO LABEL NORMALIZATION
========================================================= */

const LABEL_MAP = {

    automobile: "car",

    "motor vehicle":
        "car",

    vehicle:
        "car",

    "human":
        "person",

    cyclist:
        "bicycle",

    bike:
        "bicycle"

};


/* =========================================================
   INITIALIZE
========================================================= */

resizeCanvas();

window.addEventListener(
    "resize",
    resizeCanvas
);


/* =========================================================
   UPLOAD
========================================================= */

mediaInput.addEventListener(
    "change",
    handleMediaUpload
);


async function handleMediaUpload(event) {

    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }

    resetApplication();

    fileName.textContent =
        file.name;

    const sizeMB =
        (file.size / 1024 / 1024)
        .toFixed(2);

    document.getElementById(
        "mediaInfo"
    ).textContent =
        `${file.type || "media"} • ${sizeMB} MB`;

    state.mediaType =
        file.type.startsWith("video/")
            ? "video"
            : "image";

    const url =
        URL.createObjectURL(file);

    if (state.mediaType === "image") {

        await loadImage(url);

    } else {

        await loadVideo(url);

    }

    emptyWorkspace.style.display =
        "none";

    fitView();

    render();
}


/* =========================================================
   RESET
========================================================= */

function resetApplication() {

    if (state.imageURL) {

        URL.revokeObjectURL(
            state.imageURL
        );

    }

    if (state.videoURL) {

        URL.revokeObjectURL(
            state.videoURL
        );

    }

    state.image = null;

    state.imageURL = null;

    state.videoURL = null;

    state.mediaType = null;

    state.annotations = [];

    state.frameAnnotations.clear();

    state.selectedId = null;

    state.currentFrame = 0;

    state.currentTime = 0;

    state.scale = 1;

    state.offsetX = 0;

    state.offsetY = 0;

    updateCounts();

    renderClassificationCard();

    renderDetails();
}


/* =========================================================
   LOAD IMAGE
========================================================= */

function loadImage(url) {

    return new Promise(
        (resolve, reject) => {

            const image =
                new Image();

            image.onload = () => {

                state.image =
                    image;

                state.imageURL =
                    url;

                resolve();

            };

            image.onerror =
                reject;

            image.src = url;

        }
    );
}


/* =========================================================
   LOAD VIDEO
========================================================= */

function loadVideo(url) {

    return new Promise(
        (resolve, reject) => {

            state.videoURL =
                url;

            sourceVideo.src =
                url;

            sourceVideo.load();

            sourceVideo.onloadedmetadata =
                () => {

                    state.videoReady =
                        true;

                    state.videoDuration =
                        sourceVideo.duration;

                    state.totalFrames =
                        Math.max(
                            1,
                            Math.floor(
                                state.videoDuration *
                                state.fps
                            )
                        );

                    document.getElementById(
                        "videoControlsPanel"
                    ).style.display =
                        "block";

                    document.getElementById(
                        "frameSlider"
                    ).max =
                        state.totalFrames - 1;

                    document.getElementById(
                        "totalFrames"
                    ).textContent =
                        state.totalFrames;

                    seekFrame(0);

                    resolve();

                };

            sourceVideo.onerror =
                reject;

        }
    );
}


/* =========================================================
   VIDEO FRAME NAVIGATION
========================================================= */

document.getElementById(
    "previousFrame"
).addEventListener(
    "click",
    () => stepFrame(-1)
);


document.getElementById(
    "nextFrame"
).addEventListener(
    "click",
    () => stepFrame(1)
);


document.getElementById(
    "playVideo"
).addEventListener(
    "click",
    toggleVideo
);


document.getElementById(
    "frameSlider"
).addEventListener(
    "input",
    event => {

        seekFrame(
            Number(event.target.value)
        );

    }
);


function stepFrame(direction) {

    if (
        state.mediaType !== "video" ||
        !state.videoReady
    ) {
        return;
    }

    stopVideo();

    const next =
        Math.max(
            0,
            Math.min(
                state.totalFrames - 1,
                state.currentFrame + direction
            )
        );

    seekFrame(next);
}


function seekFrame(frame) {

    if (
        state.mediaType !== "video" ||
        !state.videoReady
    ) {
        return;
    }

    frame =
        Math.max(
            0,
            Math.min(
                state.totalFrames - 1,
                frame
            )
        );

    state.currentFrame =
        frame;

    const time =
        frame / state.fps;

    state.currentTime =
        Math.min(
            time,
            state.videoDuration
        );

    sourceVideo.currentTime =
        state.currentTime;

    sourceVideo.onseeked =
        () => {

            captureVideoFrame();

        };

}


function captureVideoFrame() {

    if (
        !state.videoReady
    ) {
        return;
    }

    const frameCanvas =
        document.createElement(
            "canvas"
        );

    frameCanvas.width =
        sourceVideo.videoWidth;

    frameCanvas.height =
        sourceVideo.videoHeight;

    const frameContext =
        frameCanvas.getContext("2d");

    frameContext.drawImage(
        sourceVideo,
        0,
        0,
        frameCanvas.width,
        frameCanvas.height
    );

    const image =
        new Image();

    image.onload =
        () => {

            state.image =
                image;

            state.currentTime =
                sourceVideo.currentTime;

            loadFrameAnnotations();

            updateVideoUI();

            fitView();

            render();

        };

    image.src =
        frameCanvas.toDataURL(
            "image/jpeg",
            0.92
        );
}


function toggleVideo() {

    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    if (
        sourceVideo.paused
    ) {

        sourceVideo.play();

    } else {

        sourceVideo.pause();

    }

}


sourceVideo.addEventListener(
    "play",
    () => {

        state.isPlaying =
            true;

        document.getElementById(
            "playVideo"
        ).textContent =
            "❚❚";

    }
);


sourceVideo.addEventListener(
    "pause",
    () => {

        state.isPlaying =
            false;

        document.getElementById(
            "playVideo"
        ).textContent =
            "▶";

    }
);


sourceVideo.addEventListener(
    "timeupdate",
    () => {

        if (
            state.mediaType !== "video"
        ) {
            return;
        }

        state.currentTime =
            sourceVideo.currentTime;

        state.currentFrame =
            Math.round(
                sourceVideo.currentTime *
                state.fps
            );

        captureVideoFrame();

    }
);


function stopVideo() {

    if (
        !sourceVideo.paused
    ) {

        sourceVideo.pause();

    }

}


function updateVideoUI() {

    document.getElementById(
        "currentFrame"
    ).textContent =
        state.currentFrame;

    document.getElementById(
        "totalFrames"
    ).textContent =
        state.totalFrames;

    document.getElementById(
        "frameSlider"
    ).value =
        state.currentFrame;

    document.getElementById(
        "videoTime"
    ).textContent =
        formatTime(
            state.currentTime
        );

}


function formatTime(seconds) {

    const min =
        Math.floor(
            seconds / 60
        );

    const sec =
        Math.floor(
            seconds % 60
        );

    const ms =
        Math.floor(
            (seconds % 1) * 1000
        );

    return (
        String(min).padStart(2, "0")
        + ":" +
        String(sec).padStart(2, "0")
        + "." +
        String(ms).padStart(3, "0")
    );

}


/* =========================================================
   KEYBOARD FRAME CONTROL
========================================================= */

window.addEventListener(
    "keydown",
    event => {

        const target =
            event.target;

        if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement
        ) {
            return;
        }

        if (
            state.mediaType === "video"
        ) {

            if (
                event.key === "ArrowLeft"
            ) {

                event.preventDefault();

                stepFrame(-1);

                return;

            }

            if (
                event.key === "ArrowRight"
            ) {

                event.preventDefault();

                stepFrame(1);

                return;

            }

            if (
                event.code === "Space"
            ) {

                event.preventDefault();

                toggleVideo();

                return;

            }

        }

        if (
            event.key === "+" ||
            event.key === "="
        ) {

            zoomAtCenter(1.15);

        }

        if (
            event.key === "-" ||
            event.key === "_"
        ) {

            zoomAtCenter(
                1 / 1.15
            );

        }

        if (
            event.key === "Delete" ||
            event.key === "Backspace"
        ) {

            deleteSelected();

        }

        if (
            event.key.toLowerCase() === "escape"
        ) {

            cancelDrawing();

        }

    }
);


/* =========================================================
   ANNOTATION TYPE
========================================================= */

document
    .querySelectorAll(".annotation-type")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                state.annotationType =
                    button.dataset.tool;

                document
                    .querySelectorAll(
                        ".annotation-type"
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

                annotationMode.textContent =
                    state.annotationType
                        .toUpperCase();

                /*
                 * Selecting a different annotation
                 * type automatically changes the
                 * active drawing mode.
                 */
                setMode(
                    state.mode === "select"
                        ? "draw"
                        : state.mode
                );

                cancelDrawing();

            }
        );

    });


/* =========================================================
   TOOLS
========================================================= */

document
    .querySelectorAll(".tool-button")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                setMode(
                    button.dataset.mode
                );

            }
        );

    });


function setMode(mode) {

    state.mode =
        mode;

    document
        .querySelectorAll(
            ".tool-button"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.mode === mode
            );

        });

    activeToolLabel.textContent =
        mode[0].toUpperCase()
        + mode.slice(1);

    /*
     * Important:
     *
     * Only ONE annotation interaction mode
     * can be active at a time.
     *
     * This prevents another annotation type
     * from remaining visually active.
     */

    state.resizeHandle = null;

    state.isDrawing = false;

    state.isPanning = false;

    if (
        mode !== "draw"
    ) {

        state.polygonPoints = [];

    }

    updateCursor();

    render();

}


function updateCursor() {

    if (
        state.mode === "pan"
    ) {

        workspace.style.cursor =
            state.isPanning
                ? "grabbing"
                : "grab";

        return;

    }

    if (
        state.mode === "erase"
    ) {

        workspace.style.cursor =
            "not-allowed";

        return;

    }

    if (
        state.mode === "select"
    ) {

        workspace.style.cursor =
            "default";

        return;

    }

    workspace.style.cursor =
        "crosshair";

}


/* =========================================================
   CANVAS SIZE
========================================================= */

function resizeCanvas() {

    const rect =
        workspace.getBoundingClientRect();

    const dpr =
        window.devicePixelRatio || 1;

    canvas.width =
        rect.width * dpr;

    canvas.height =
        rect.height * dpr;

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


/* =========================================================
   VIEW TRANSFORM
========================================================= */

function imageToScreen(x, y) {

    return {

        x:
            x * state.scale
            + state.offsetX,

        y:
            y * state.scale
            + state.offsetY

    };

}


function screenToImage(x, y) {

    return {

        x:
            (x - state.offsetX)
            / state.scale,

        y:
            (y - state.offsetY)
            / state.scale

    };

}


/* =========================================================
   FIT VIEW
========================================================= */

function fitView() {

    if (
        !state.image
    ) {
        return;
    }

    const rect =
        workspace.getBoundingClientRect();

    const imageWidth =
        state.image.naturalWidth ||
        state.image.width;

    const imageHeight =
        state.image.naturalHeight ||
        state.image.height;

    const scaleX =
        (rect.width - 40)
        / imageWidth;

    const scaleY =
        (rect.height - 40)
        / imageHeight;

    state.scale =
        Math.min(
            scaleX,
            scaleY
        );

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


document
    .getElementById("fitView")
    .addEventListener(
        "click",
        fitView
    );


document
    .getElementById("resetView")
    .addEventListener(
        "click",
        () => {

            state.scale = 1;

            state.offsetX = 0;

            state.offsetY = 0;

            render();

            updateZoomUI();

        }
    );


/* =========================================================
   ZOOM
========================================================= */

document
    .getElementById("zoomIn")
    .addEventListener(
        "click",
        () => zoomAtCenter(1.2)
    );


document
    .getElementById("zoomOut")
    .addEventListener(
        "click",
        () => zoomAtCenter(1 / 1.2)
    );


workspace.addEventListener(
    "wheel",
    event => {

        event.preventDefault();

        const rect =
            workspace.getBoundingClientRect();

        const mouseX =
            event.clientX - rect.left;

        const mouseY =
            event.clientY - rect.top;

        const factor =
            event.deltaY < 0
                ? 1.12
                : 1 / 1.12;

        zoomAt(
            factor,
            mouseX,
            mouseY
        );

    },
    {
        passive: false
    }
);


function zoomAtCenter(factor) {

    const rect =
        workspace.getBoundingClientRect();

    zoomAt(
        factor,
        rect.width / 2,
        rect.height / 2
    );

}


function zoomAt(
    factor,
    screenX,
    screenY
) {

    const before =
        screenToImage(
            screenX,
            screenY
        );

    const newScale =
        Math.max(
            state.minScale,
            Math.min(
                state.maxScale,
                state.scale * factor
            )
        );

    state.scale =
        newScale;

    state.offsetX =
        screenX -
        before.x * state.scale;

    state.offsetY =
        screenY -
        before.y * state.scale;

    updateZoomUI();

    render();

}


function updateZoomUI() {

    const percentage =
        Math.round(
            state.scale * 100
        );

    zoomValue.textContent =
        percentage + "%";

    footerZoom.textContent =
        percentage + "%";

}


/* =========================================================
   CANVAS MOUSE / POINTER EVENTS
========================================================= */

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
    handleDoubleClick
);


function getPointer(event) {

    const rect =
        canvas.getBoundingClientRect();

    return {

        x:
            event.clientX - rect.left,

        y:
            event.clientY - rect.top

    };

}


/* =========================================================
   POINTER DOWN
========================================================= */

function pointerDown(event) {

    const p =
        getPointer(event);

    canvas.setPointerCapture(
        event.pointerId
    );

    state.isPointerDown =
        true;

    state.dragStart =
        p;

    /* -----------------------------------------------------
       PAN
    ----------------------------------------------------- */

    if (
        state.mode === "pan" ||
        event.button === 1 ||
        event.shiftKey
    ) {

        state.isPanning =
            true;

        state.panStart = {

            x:
                p.x,

            y:
                p.y,

            offsetX:
                state.offsetX,

            offsetY:
                state.offsetY

        };

        updateCursor();

        return;

    }


    /* -----------------------------------------------------
       SELECT
    ----------------------------------------------------- */

    if (
        state.mode === "select"
    ) {

        const hit =
            hitTest(
                p.x,
                p.y
            );

        if (
            hit
        ) {

            state.selectedId =
                hit.id;

            /*
             * Determine whether user is
             * grabbing a resize handle.
             */
            if (
                hit.type === "handle"
            ) {

                state.resizeHandle =
                    hit.handle;

            } else {

                state.resizeHandle =
                    null;

            }

            updateSelectedUI();

        } else {

            state.selectedId =
                null;

            updateSelectedUI();

        }

        state.dragStart =
            p;

        render();

        return;

    }


    /* -----------------------------------------------------
       ERASE
    ----------------------------------------------------- */

    if (
        state.mode === "erase"
    ) {

        const hit =
            hitTest(
                p.x,
                p.y
            );

        if (
            hit
        ) {

            state.selectedId =
                hit.id;

            deleteSelected();

        }

        return;

    }


    /* -----------------------------------------------------
       DRAW
    ----------------------------------------------------- */

    if (
        state.mode === "draw"
    ) {

        beginDrawing(
            p.x,
            p.y
        );

    }

}


/* =========================================================
   POINTER MOVE
========================================================= */

function pointerMove(event) {

    const p =
        getPointer(event);

    /* -----------------------------------------------------
       PAN
    ----------------------------------------------------- */

    if (
        state.isPanning
    ) {

        const dx =
            p.x -
            state.panStart.x;

        const dy =
            p.y -
            state.panStart.y;

        state.offsetX =
            state.panStart.offsetX + dx;

        state.offsetY =
            state.panStart.offsetY + dy;

        render();

        return;

    }


    /* -----------------------------------------------------
       SELECT / RESIZE
    ----------------------------------------------------- */

    if (
        state.mode === "select" &&
        state.isPointerDown &&
        state.selectedId
    ) {

        const annotation =
            getSelectedAnnotation();

        if (!annotation) {
            return;
        }

        const current =
            screenToImage(
                p.x,
                p.y
            );

        const start =
            screenToImage(
                state.dragStart.x,
                state.dragStart.y
            );

        const dx =
            current.x - start.x;

        const dy =
            current.y - start.y;

        if (
            state.resizeHandle
        ) {

            resizeAnnotation(
                annotation,
                state.resizeHandle,
                current
            );

        } else {

            moveAnnotation(
                annotation,
                dx,
                dy
            );

        }

        state.dragStart =
            p;

        saveCurrentFrame();

        render();

        renderDetails();

        return;

    }


    /* -----------------------------------------------------
       DRAW
    ----------------------------------------------------- */

    if (
        state.mode === "draw" &&
        state.isDrawing
    ) {

        const current =
            screenToImage(
                p.x,
                p.y
            );

        state.currentDrawPoint =
            current;

        render();

    }


    /* Hover */

    const hit =
        hitTest(
            p.x,
            p.y
        );

    state.hoveredId =
        hit?.id || null;

}


/* =========================================================
   POINTER UP
========================================================= */

function pointerUp(event) {

    if (
        state.mode === "draw" &&
        state.isDrawing
    ) {

        finishDrawing();

    }

    state.isPointerDown =
        false;

    state.isPanning =
        false;

    state.resizeHandle =
        null;

    updateCursor();

}


/* =========================================================
   DRAWING
========================================================= */

function beginDrawing(x, y) {

    const point =
        screenToImage(
            x,
            y
        );

    state.isDrawing =
        true;

    state.drawStart =
        point;

    state.currentDrawPoint =
        point;

    if (
        state.annotationType === "polygon" ||
        state.annotationType === "segmentation"
    ) {

        state.polygonPoints = [
            point
        ];

    }

}


function finishDrawing() {

    if (
        !state.isDrawing
    ) {
        return;
    }

    const start =
        state.drawStart;

    const end =
        state.currentDrawPoint;

    if (
        state.annotationType === "box"
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

    } else {

        /*
         * For polygon/segmentation, clicking points
         * and double-clicking finishes the shape.
         */

        if (
            state.polygonPoints.length >= 3
        ) {

            createAnnotation({

                type:
                    state.annotationType,

                points:
                    [...state.polygonPoints],

                label:
                    "unknown",

                score:
                    null,

                occlusion:
                    0,

                truncation:
                    "NONE"

            });

        }

    }

    state.isDrawing =
        false;

    state.polygonPoints =
        [];

    state.currentDrawPoint =
        null;

    saveCurrentFrame();

    updateCounts();

    render();

}


/* =========================================================
   DOUBLE CLICK POLYGON
========================================================= */

function handleDoubleClick(event) {

    if (
        state.mode !== "draw"
    ) {
        return;
    }

    if (
        state.annotationType !== "polygon" &&
        state.annotationType !== "segmentation"
    ) {
        return;
    }

    if (
        state.polygonPoints.length >= 3
    ) {

        finishDrawing();

    }

}


/* =========================================================
   CREATE ANNOTATION
========================================================= */

function createAnnotation(data) {

    const annotation = {

        id:
            "ann_" +
            state.nextAnnotationId++,

        ...data,

        export:
            true,

        corrected:
            true,

        createdAt:
            new Date().toISOString()

    };

    state.annotations.push(
        annotation
    );

    if (
        annotation.label &&
        annotation.label !== "unknown"
    ) {

        state.classes.add(
            annotation.label
        );

    }

    state.selectedId =
        annotation.id;

    updateCounts();

    updateSelectedUI();

}


/* =========================================================
   HIT TEST
========================================================= */

function hitTest(
    screenX,
    screenY
) {

    const point =
        screenToImage(
            screenX,
            screenY
        );

    /*
     * Reverse order means the top-most
     * annotation gets selected first.
     */

    for (
        let i =
            state.annotations.length - 1;
        i >= 0;
        i--
    ) {

        const a =
            state.annotations[i];

        /* Box */

        if (
            a.type === "box"
        ) {

            if (
                point.x >= a.x &&
                point.x <=
                    a.x + a.width &&
                point.y >= a.y &&
                point.y <=
                    a.y + a.height
            ) {

                const handle =
                    findBoxHandle(
                        a,
                        point
                    );

                if (
                    handle
                ) {

                    return {

                        id: a.id,

                        type: "handle",

                        handle

                    };

                }

                return {

                    id: a.id,

                    type: "annotation"

                };

            }

        }

        /* Polygon */

        if (
            a.type === "polygon" ||
            a.type === "segmentation"
        ) {

            if (
                pointInPolygon(
                    point,
                    a.points
                )
            ) {

                return {

                    id: a.id,

                    type: "annotation"

                };

            }

        }

    }

    return null;

}


/* =========================================================
   BOX HANDLES
========================================================= */

function findBoxHandle(
    a,
    p
) {

    const handles = {

        nw: {
            x: a.x,
            y: a.y
        },

        n: {
            x: a.x + a.width / 2,
            y: a.y
        },

        ne: {
            x: a.x + a.width,
            y: a.y
        },

        e: {
            x: a.x + a.width,
            y:
                a.y +
                a.height / 2
        },

        se: {
            x:
                a.x +
                a.width,

            y:
                a.y +
                a.height
        },

        s: {
            x:
                a.x +
                a.width / 2,

            y:
                a.y +
                a.height
        },

        sw: {
            x: a.x,

            y:
                a.y +
                a.height
        },

        w: {
            x: a.x,

            y:
                a.y +
                a.height / 2
        }

    };

    const tolerance =
        10 / state.scale;

    for (
        const [name, h]
        of Object.entries(handles)
    ) {

        if (
            Math.abs(
                p.x - h.x
            ) <= tolerance &&
            Math.abs(
                p.y - h.y
            ) <= tolerance
        ) {

            return name;

        }

    }

    return null;

}


/* =========================================================
   MOVE ANNOTATION
========================================================= */

function moveAnnotation(
    a,
    dx,
    dy
) {

    if (
        a.type === "box"
    ) {

        a.x += dx;

        a.y += dy;

        return;

    }

    if (
        a.points
    ) {

        a.points.forEach(
            p => {

                p.x += dx;

                p.y += dy;

            }
        );

    }

}


/* =========================================================
   RESIZE BOX
========================================================= */

function resizeAnnotation(
    a,
    handle,
    current
) {

    if (
        a.type !== "box"
    ) {
        return;
    }

    let left =
        a.x;

    let top =
        a.y;

    let right =
        a.x + a.width;

    let bottom =
        a.y + a.height;

    switch (handle) {

        case "nw":

            left =
                current.x;

            top =
                current.y;

            break;

        case "n":

            top =
                current.y;

            break;

        case "ne":

            right =
                current.x;

            top =
                current.y;

            break;

        case "e":

            right =
                current.x;

            break;

        case "se":

            right =
                current.x;

            bottom =
                current.y;

            break;

        case "s":

            bottom =
                current.y;

            break;

        case "sw":

            left =
                current.x;

            bottom =
                current.y;

            break;

        case "w":

            left =
                current.x;

            break;

    }

    if (
        right - left < 3
    ) {

        return;

    }

    if (
        bottom - top < 3
    ) {

        return;

    }

    a.x =
        left;

    a.y =
        top;

    a.width =
        right - left;

    a.height =
        bottom - top;

    a.corrected =
        true;

}


/* =========================================================
   POLYGON POINT EDITING
========================================================= */

canvas.addEventListener(
    "pointerdown",
    event => {

        if (
            state.mode !== "select"
        ) {
            return;
        }

        const p =
            getPointer(event);

        const imagePoint =
            screenToImage(
                p.x,
                p.y
            );

        const selected =
            getSelectedAnnotation();

        if (
            !selected ||
            !selected.points
        ) {
            return;
        }

        let nearest =
            -1;

        let distance =
            Infinity;

        selected.points.forEach(
            (point, index) => {

                const d =
                    Math.hypot(
                        point.x -
                            imagePoint.x,

                        point.y -
                            imagePoint.y
                    );

                if (
                    d <
                    15 / state.scale &&
                    d < distance
                ) {

                    nearest =
                        index;

                    distance =
                        d;

                }

            }
        );

        if (
            nearest >= 0
        ) {

            state.vertexIndex =
                nearest;

        }

    },
    true
);


canvas.addEventListener(
    "pointermove",
    event => {

        if (
            state.mode !== "select" ||
            state.vertexIndex === undefined ||
            state.vertexIndex === null
        ) {
            return;
        }

        if (
            !state.isPointerDown
        ) {
            return;
        }

        const selected =
            getSelectedAnnotation();

        if (
            !selected ||
            !selected.points
        ) {
            return;
        }

        const p =
            getPointer(event);

        const imagePoint =
            screenToImage(
                p.x,
                p.y
            );

        selected.points[
            state.vertexIndex
        ] = imagePoint;

        selected.corrected =
            true;

        saveCurrentFrame();

        render();

    },
    true
);


canvas.addEventListener(
    "pointerup",
    () => {

        state.vertexIndex =
            null;

    },
    true
);


/* =========================================================
   POINT IN POLYGON
========================================================= */

function pointInPolygon(
    point,
    polygon
) {

    let inside = false;

    for (
        let i = 0,
            j = polygon.length - 1;
        i < polygon.length;
        j = i++
    ) {

        const xi =
            polygon[i].x;

        const yi =
            polygon[i].y;

        const xj =
            polygon[j].x;

        const yj =
            polygon[j].y;

        const intersect =
            (
                yi > point.y
            ) !==
            (
                yj > point.y
            )
            &&
            point.x <
                (
                    (xj - xi) *
                    (point.y - yi) /
                    (yj - yi)
                ) +
                xi;

        if (
            intersect
        ) {

            inside =
                !inside;

        }

    }

    return inside;

}


/* =========================================================
   DELETE
========================================================= */

document
    .getElementById(
        "deleteSelected"
    )
    .addEventListener(
        "click",
        deleteSelected
    );


function deleteSelected() {

    if (
        !state.selectedId
    ) {
        return;
    }

    state.annotations =
        state.annotations.filter(
            a =>
                a.id !==
                state.selectedId
        );

    state.selectedId =
        null;

    saveCurrentFrame();

    updateCounts();

    updateSelectedUI();

    render();

}


/* =========================================================
   SELECTED ANNOTATION
========================================================= */

function getSelectedAnnotation() {

    return state.annotations.find(
        a =>
            a.id ===
            state.selectedId
    ) || null;

}


function updateSelectedUI() {

    const selected =
        getSelectedAnnotation();

    selectedObjectLabel.textContent =
        selected
            ? selected.label
            : "None";

    renderClassificationCard();

    renderDetails();

    render();

}


/* =========================================================
   CLASSIFICATION CARD
========================================================= */

function renderClassificationCard() {

    const a =
        getSelectedAnnotation();

    if (!a) {

        classificationCard.innerHTML = `
            <div class="empty-card">
                Select an annotation
            </div>
        `;

        return;

    }

    classificationCard.innerHTML = `
        <div class="class-card">

            <div class="class-title">

                <strong>
                    Object Classification
                </strong>

                <span class="class-id">
                    ${escapeHTML(a.id)}
                </span>

            </div>

            <div class="class-field">

                <label>
                    OBJECT CLASS
                </label>

                <input
                    id="selectedClass"
                    value="${escapeHTML(a.label || "")}"
                    placeholder="car"
                >

            </div>

            <div class="class-field">

                <label>
                    OCCLUSION
                </label>

                <select id="selectedOcclusion">

                    <option value="0"
                        ${a.occlusion === 0 ? "selected" : ""}>
                        0% — Fully visible
                    </option>

                    <option value="25"
                        ${a.occlusion === 25 ? "selected" : ""}>
                        25% — Slightly occluded
                    </option>

                    <option value="50"
                        ${a.occlusion === 50 ? "selected" : ""}>
                        50% — Partially occluded
                    </option>

                    <option value="75"
                        ${a.occlusion === 75 ? "selected" : ""}>
                        75% — Heavily occluded
                    </option>

                    <option value="100"
                        ${a.occlusion === 100 ? "selected" : ""}>
                        100% — Fully occluded
                    </option>

                </select>

            </div>


            <div class="class-field">

                <label>
                    TRUNCATION
                </label>

                <select id="selectedTruncation">

                    <option value="NONE"
                        ${a.truncation === "NONE" ? "selected" : ""}>
                        NONE — Fully inside camera
                    </option>

                    <option value="SLIGHT"
                        ${a.truncation === "SLIGHT" ? "selected" : ""}>
                        SLIGHT — Small part outside
                    </option>

                    <option value="PARTIAL"
                        ${a.truncation === "PARTIAL" ? "selected" : ""}>
                        PARTIAL — Object cut by edge
                    </option>

                    <option value="SEVERE"
                        ${a.truncation === "SEVERE" ? "selected" : ""}>
                        SEVERE — Large part outside
                    </option>

                </select>

            </div>


            <div class="class-field">

                <label>
                    INCLUDE IN EXPORT
                </label>

                <select id="selectedExport">

                    <option value="true"
                        ${a.export !== false ? "selected" : ""}>
                        YES
                    </option>

                    <option value="false"
                        ${a.export === false ? "selected" : ""}>
                        NO — Remove classification from export
                    </option>

                </select>

            </div>


            <div class="class-buttons">

                <button
                    id="saveClassification"
                    class="save"
                >
                    SAVE
                </button>

                <button
                    id="deleteClassification"
                >
                    DELETE
                </button>

            </div>

        </div>
    `;


    document
        .getElementById(
            "saveClassification"
        )
        .addEventListener(
            "click",
            saveClassification
        );


    document
        .getElementById(
            "deleteClassification"
        )
        .addEventListener(
            "click",
            deleteSelected
        );

}


/* =========================================================
   SAVE CLASSIFICATION
========================================================= */

function saveClassification() {

    const a =
        getSelectedAnnotation();

    if (!a) {
        return;
    }

    const classInput =
        document.getElementById(
            "selectedClass"
        );

    const occlusion =
        document.getElementById(
            "selectedOcclusion"
        );

    const truncation =
        document.getElementById(
            "selectedTruncation"
        );

    const exportInput =
        document.getElementById(
            "selectedExport"
        );

    const oldLabel =
        a.label;

    const newLabel =
        classInput.value.trim()
        || "unknown";

    a.label =
        newLabel;

    a.occlusion =
        Number(
            occlusion.value
        );

    a.truncation =
        truncation.value;

    a.export =
        exportInput.value === "true";

    a.corrected =
        true;

    if (
        newLabel !== "unknown"
    ) {

        state.classes.add(
            newLabel
        );

    }

    if (
        oldLabel &&
        oldLabel !== newLabel
    ) {

        /*
         * Do not delete old class globally because
         * another annotation may still use it.
         */

    }

    saveCurrentFrame();

    updateCounts();

    renderClassificationCard();

    renderDetails();

    render();

}


/* =========================================================
   DETAILS
========================================================= */

function renderDetails() {

    const a =
        getSelectedAnnotation();

    if (!a) {

        annotationDetails.innerHTML = `
            <div class="details-empty">

                <div class="details-icon">
                    ◫
                </div>

                <strong>
                    No annotation selected
                </strong>

                <span>
                    Click an object in the workspace
                    to edit its classification.
                </span>

            </div>
        `;

        return;

    }

    annotationDetails.innerHTML = `

        <div class="class-card">

            <div class="class-title">

                <strong>
                    ${escapeHTML(
                        a.label || "unknown"
                    )}
                </strong>

                <span class="class-id">
                    ${escapeHTML(a.id)}
                </span>

            </div>

            <div class="class-field">

                <label>
                    ANNOTATION TYPE
                </label>

                <input
                    value="${escapeHTML(
                        a.type.toUpperCase()
                    )}"
                    disabled
                >

            </div>

            <div class="class-field">

                <label>
                    OCCLUSION
                </label>

                <input
                    value="${a.occlusion || 0}%"
                    disabled
                >

            </div>

            <div class="class-field">

                <label>
                    TRUNCATION
                </label>

                <input
                    value="${escapeHTML(
                        a.truncation || "NONE"
                    )}"
                    disabled
                >

            </div>

            <div class="class-field">

                <label>
                    STATUS
                </label>

                <input
                    value="${
                        a.corrected
                            ? "Human corrected"
                            : "AI generated"
                    }"
                    disabled
                >

            </div>

        </div>

    `;

}


/* =========================================================
   UPDATE COUNT
========================================================= */

function updateCounts() {

    objectCount.textContent =
        state.annotations.length;

}


/* =========================================================
   AI ENGINE
========================================================= */

confidence.addEventListener(
    "input",
    () => {

        const value =
            Number(
                confidence.value
            );

        confidenceValue.textContent =
            Math.round(
                value * 100
            ) + "%";

    }
);


document
    .getElementById(
        "autoAnnotate"
    )
    .addEventListener(
        "click",
        runAIAnnotation
    );


async function runAIAnnotation() {

    if (
        !state.image
    ) {

        setAIStatus(
            "Upload an image or video first."
        );

        return;

    }

    if (
        state.aiBusy
    ) {

        return;

    }

    state.aiBusy =
        true;

    const engine =
        aiEngine.value;

    setAIStatus(
        `Loading ${engine.toUpperCase()}...`
    );


    try {

        let detector;

        if (
            engine === "detr"
        ) {

            if (!state.detr) {

                state.detr =
                    await pipeline(
                        "object-detection",
                        MODELS.detr
                    );

            }

            detector =
                state.detr;

        } else {

            if (!state.yolo) {

                state.yolo =
                    await pipeline(
                        "object-detection",
                        MODELS.yolo
                    );

            }

            detector =
                state.yolo;

        }


        setAIStatus(
            `Running ${engine.toUpperCase()}...`
        );


        /*
         * Important:
         *
         * Pass the image itself / image source,
         * not a plain JS object.
         */

        const output =
            await detector(
                state.image,
                {
                    threshold:
                        Number(
                            confidence.value
                        )
                }
            );


        const filtered =
            applyRules(
                output || []
            );


        /*
         * Replace current AI-generated
         * annotations for this frame.
         *
         * Existing human-corrected annotations
         * are retained.
         */

        const humanAnnotations =
            state.annotations.filter(
                a =>
                    a.corrected === true &&
                    a.aiGenerated !== true
            );


        state.annotations =
            humanAnnotations;


        for (
            const detection
            of filtered
        ) {

            const label =
                normalizeLabel(
                    detection.label
                );

            const box =
                detection.box;

            if (
                !box
            ) {
                continue;
            }

            createAIAnnotation({

                type: "box",

                x:
                    box.xmin,

                y:
                    box.ymin,

                width:
                    box.xmax -
                    box.xmin,

                height:
                    box.ymax -
                    box.ymin,

                label,

                score:
                    detection.score

            });

        }


        /*
         * AI annotations start as NOT corrected.
         *
         * Once the user changes them,
         * corrected becomes true.
         */

        state.annotations.forEach(
            a => {

                if (
                    a.aiGenerated
                ) {

                    a.corrected =
                        false;

                }

            }
        );


        saveCurrentFrame();

        updateCounts();

        render();

        renderClassificationCard();

        renderDetails();


        setAIStatus(
            `${filtered.length} objects generated.`
        );

    } catch (error) {

        console.error(
            "AI annotation error:",
            error
        );

        setAIStatus(
            "AI error: " +
            error.message
        );

    } finally {

        state.aiBusy =
            false;

    }

}


/* =========================================================
   CREATE AI ANNOTATION
========================================================= */

function createAIAnnotation(data) {

    const annotation = {

        id:
            "ai_" +
            state.nextAnnotationId++,

        ...data,

        aiGenerated:
            true,

        corrected:
            false,

        /*
         * Classification defaults.
         */

        occlusion:
            0,

        truncation:
            "NONE",

        export:
            true,

        createdAt:
            new Date().toISOString()

    };

    state.annotations.push(
        annotation
    );

    if (
        annotation.label
    ) {

        state.classes.add(
            annotation.label
        );

    }

}


/* =========================================================
   RULE ENGINE
========================================================= */

function applyRules(
    detections
) {

    const text =
        rulesInput.value || "";

    const minConfidence =
        parseMinConfidence(
            text,
            Number(
                confidence.value
            )
        );

    let include =
        null;

    let exclude =
        [];

    const rename =
        {};


    const lines =
        text
            .split("\n")
            .map(
                line =>
                    line.trim()
            )
            .filter(Boolean);


    for (
        const line
        of lines
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
                    .slice(
                        line.indexOf(":") + 1
                    )
                    .split(",")
                    .map(
                        x =>
                            normalizeLabel(
                                x.trim()
                            )
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
                    .slice(
                        line.indexOf(":") + 1
                    )
                    .split(",")
                    .map(
                        x =>
                            normalizeLabel(
                                x.trim()
                            )
                    )
                    .filter(Boolean);

        }


        if (
            lower.startsWith(
                "rename:"
            )
        ) {

            const pairs =
                line
                    .slice(
                        line.indexOf(":") + 1
                    )
                    .split(",");

            pairs.forEach(
                pair => {

                    const parts =
                        pair.split("=");

                    if (
                        parts.length === 2
                    ) {

                        rename[
                            normalizeLabel(
                                parts[0].trim()
                            )
                        ] =
                            normalizeLabel(
                                parts[1].trim()
                            );

                    }

                }
            );

        }

    }


    return detections
        .filter(
            detection =>
                detection.score >=
                minConfidence
        )
        .map(
            detection => {

                let label =
                    normalizeLabel(
                        detection.label
                    );

                if (
                    rename[label]
                ) {

                    label =
                        rename[label];

                }

                return {

                    ...detection,

                    label

                };

            }
        )
        .filter(
            detection => {

                const label =
                    normalizeLabel(
                        detection.label
                    );

                if (
                    exclude.includes(label)
                ) {

                    return false;

                }

                if (
                    include &&
                    !include.includes(label)
                ) {

                    return false;

                }

                return true;

            }
        );

}


function parseMinConfidence(
    text,
    fallback
) {

    const match =
        text.match(
            /min_confidence\s*:\s*([0-9.]+)/i
        );

    if (!match) {
        return fallback;
    }

    return Math.max(
        0,
        Math.min(
            1,
            Number(match[1])
        )
    );

}


/* =========================================================
   LABEL NORMALIZATION
========================================================= */

function normalizeLabel(
    label
) {

    const clean =
        String(
            label || "unknown"
        )
        .trim()
        .toLowerCase();

    return (
        LABEL_MAP[clean] ||
        clean
    );

}


/* =========================================================
   RENDER
========================================================= */

function render() {

    const rect =
        workspace.getBoundingClientRect();

    /*
     * Canvas is already scaled to device pixel
     * ratio in resizeCanvas().
     */

    ctx.clearRect(
        0,
        0,
        rect.width,
        rect.height
    );


    if (
        !state.image
    ) {

        return;

    }


    const imageWidth =
        state.image.naturalWidth ||
        state.image.width;

    const imageHeight =
        state.image.naturalHeight ||
        state.image.height;


    /*
     * IMAGE
     *
     * Notice that there is deliberately NO
     * boundary clamp here.
     *
     * The user can pan past the camera edge
     * and zoom anywhere.
     */

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
        imageWidth,
        imageHeight
    );

    ctx.restore();


    /*
     * ANNOTATIONS
     */

    state.annotations.forEach(
        annotation => {

            drawAnnotation(
                annotation
            );

        }
    );


    /*
     * Current polygon drawing
     */

    if (
        state.isDrawing &&
        (
            state.annotationType === "polygon" ||
            state.annotationType === "segmentation"
        )
    ) {

        drawCurrentPolygon();

    }


    updateZoomUI();

}


/* =========================================================
   DRAW ANNOTATION
========================================================= */

function drawAnnotation(
    a
) {

    if (
        a.type === "box"
    ) {

        drawBox(a);

        return;

    }

    if (
        a.type === "polygon"
    ) {

        drawPolygon(
            a,
            false
        );

        return;

    }

    if (
        a.type === "segmentation"
    ) {

        drawPolygon(
            a,
            true
        );

    }

}


/* =========================================================
   DRAW BOX
========================================================= */

function drawBox(a) {

    const topLeft =
        imageToScreen(
            a.x,
            a.y
        );

    const width =
        a.width *
        state.scale;

    const height =
        a.height *
        state.scale;


    const selected =
        a.id ===
        state.selectedId;


    /*
     * Selected annotations are purple.
     *
     * AI boxes are green.
     *
     * No percentage is rendered.
     */

    ctx.save();

    ctx.lineWidth =
        selected
            ? 2.5
            : 1.5;

    ctx.strokeStyle =
        selected
            ? "#a78bfa"
            : "#22c55e";

    ctx.strokeRect(
        topLeft.x,
        topLeft.y,
        width,
        height
    );


    /*
     * Label ONLY.
     *
     * No 68%, 98%, etc.
     */

    const label =
        a.label ||
        "unknown";

    ctx.font =
        "bold 12px Arial";

    const textWidth =
        ctx.measureText(
            label
        ).width;

    const labelWidth =
        textWidth + 12;

    const labelHeight =
        20;

    ctx.fillStyle =
        selected
            ? "#7c3aed"
            : "#15803d";

    ctx.fillRect(
        topLeft.x,
        topLeft.y - labelHeight,
        labelWidth,
        labelHeight
    );

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        label,
        topLeft.x + 6,
        topLeft.y - 6
    );


    /*
     * Selected resize handles
     */

    if (
        selected
    ) {

        drawBoxHandles(
            a
        );

    }

    ctx.restore();

}


/* =========================================================
   BOX HANDLES
========================================================= */

function drawBoxHandles(a) {

    const handles = [

        ["nw", a.x, a.y],

        [
            "n",
            a.x + a.width / 2,
            a.y
        ],

        [
            "ne",
            a.x + a.width,
            a.y
        ],

        [
            "e",
            a.x + a.width,
            a.y + a.height / 2
        ],

        [
            "se",
            a.x + a.width,
            a.y + a.height
        ],

        [
            "s",
            a.x + a.width / 2,
            a.y + a.height
        ],

        [
            "sw",
            a.x,
            a.y + a.height
        ],

        [
            "w",
            a.x,
            a.y + a.height / 2
        ]

    ];


    handles.forEach(
        ([name, x, y]) => {

            const p =
                imageToScreen(
                    x,
                    y
                );

            ctx.fillStyle =
                "#ffffff";

            ctx.strokeStyle =
                "#7c3aed";

            ctx.lineWidth =
                1.5;

            ctx.fillRect(
                p.x - 4,
                p.y - 4,
                8,
                8
            );

            ctx.strokeRect(
                p.x - 4,
                p.y - 4,
                8,
                8
            );

        }
    );

}


/* =========================================================
   DRAW POLYGON
========================================================= */

function drawPolygon(
    a,
    segmentation
) {

    if (
        !a.points ||
        a.points.length < 2
    ) {
        return;
    }

    ctx.save();

    ctx.beginPath();

    a.points.forEach(
        (point, index) => {

            const p =
                imageToScreen(
                    point.x,
                    point.y
                );

            if (
                index === 0
            ) {

                ctx.moveTo(
                    p.x,
                    p.y
                );

            } else {

                ctx.lineTo(
                    p.x,
                    p.y
                );

            }

        }
    );

    ctx.closePath();


    if (
        segmentation
    ) {

        ctx.fillStyle =
            "rgba(139,92,246,0.20)";

        ctx.fill();

    }


    const selected =
        a.id ===
        state.selectedId;


    ctx.strokeStyle =
        selected
            ? "#a78bfa"
            : "#22c55e";

    ctx.lineWidth =
        selected
            ? 2.5
            : 1.5;

    ctx.stroke();


    /*
     * Label
     */

    const first =
        imageToScreen(
            a.points[0].x,
            a.points[0].y
        );

    ctx.font =
        "bold 12px Arial";

    const label =
        a.label ||
        "unknown";

    const width =
        ctx.measureText(
            label
        ).width + 12;

    ctx.fillStyle =
        selected
            ? "#7c3aed"
            : "#15803d";

    ctx.fillRect(
        first.x,
        first.y - 20,
        width,
        20
    );

    ctx.fillStyle =
        "#fff";

    ctx.fillText(
        label,
        first.x + 6,
        first.y - 6
    );


    /*
     * Vertex handles
     */

    if (
        selected
    ) {

        a.points.forEach(
            point => {

                const p =
                    imageToScreen(
                        point.x,
                        point.y
                    );

                ctx.fillStyle =
                    "#ffffff";

                ctx.strokeStyle =
                    "#7c3aed";

                ctx.beginPath();

                ctx.arc(
                    p.x,
                    p.y,
                    4,
                    0,
                    Math.PI * 2
                );

                ctx.fill();

                ctx.stroke();

            }
        );

    }

    ctx.restore();

}


/* =========================================================
   CURRENT POLYGON
========================================================= */

function drawCurrentPolygon() {

    if (
        state.polygonPoints.length < 1
    ) {
        return;
    }

    ctx.save();

    ctx.strokeStyle =
        "#a78bfa";

    ctx.lineWidth =
        2;

    ctx.setLineDash(
        [6, 4]
    );

    ctx.beginPath();

    state.polygonPoints.forEach(
        (point, index) => {

            const p =
                imageToScreen(
                    point.x,
                    point.y
                );

            if (
                index === 0
            ) {

                ctx.moveTo(
                    p.x,
                    p.y
                );

            } else {

                ctx.lineTo(
                    p.x,
                    p.y
                );

            }

        }
    );

    if (
        state.currentDrawPoint
    ) {

        const last =
            imageToScreen(
                state.currentDrawPoint.x,
                state.currentDrawPoint.y
            );

        ctx.lineTo(
            last.x,
            last.y
        );

    }

    ctx.stroke();

    ctx.restore();

}


/* =========================================================
   FRAME STORAGE
========================================================= */

function saveCurrentFrame() {

    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    /*
     * Deep clone so changing a future frame
     * does not modify this frame.
     */

    const copy =
        structuredClone(
            state.annotations
        );

    state.frameAnnotations.set(
        state.currentFrame,
        copy
    );

}


function loadFrameAnnotations() {

    if (
        state.mediaType !== "video"
    ) {
        return;
    }

    const saved =
        state.frameAnnotations.get(
            state.currentFrame
        );

    state.annotations =
        saved
            ? structuredClone(saved)
            : [];

    state.selectedId =
        null;

    updateCounts();

    updateSelectedUI();

}


/* =========================================================
   EXPORT IMAGE
========================================================= */

document
    .getElementById(
        "exportImage"
    )
    .addEventListener(
        "click",
        exportAnnotatedImage
    );


function exportAnnotatedImage() {

    if (
        !state.image
    ) {
        return;
    }

    const imageWidth =
        state.image.naturalWidth ||
        state.image.width;

    const imageHeight =
        state.image.naturalHeight ||
        state.image.height;

    const output =
        document.createElement(
            "canvas"
        );

    output.width =
        imageWidth;

    output.height =
        imageHeight;

    const outputContext =
        output.getContext("2d");

    outputContext.drawImage(
        state.image,
        0,
        0,
        imageWidth,
        imageHeight
    );


    state.annotations
        .filter(
            a =>
                a.export !== false
        )
        .forEach(
            a => {

                drawAnnotationExport(
                    outputContext,
                    a
                );

            }
        );


    output.toBlob(
        blob => {

            downloadBlob(
                blob,
                getExportName(
                    "annotated",
                    "png"
                )
            );

        },
        "image/png"
    );

}


/* =========================================================
   EXPORT ANNOTATION
========================================================= */

function drawAnnotationExport(
    context,
    a
) {

    context.save();

    context.strokeStyle =
        "#00ff66";

    context.fillStyle =
        "rgba(0,255,100,.15)";

    context.lineWidth =
        2;


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
            "bold 16px Arial";

        context.fillStyle =
            "#00ff66";

        context.fillText(
            a.label || "unknown",
            a.x,
            Math.max(
                16,
                a.y - 5
            )
        );

    } else {

        context.beginPath();

        a.points.forEach(
            (p, index) => {

                if (
                    index === 0
                ) {

                    context.moveTo(
                        p.x,
                        p.y
                    );

                } else {

                    context.lineTo(
                        p.x,
                        p.y
                    );

                }

            }
        );

        context.closePath();

        if (
            a.type === "segmentation"
        ) {

            context.fill();

        }

        context.stroke();

    }

    context.restore();

}


/* =========================================================
   EXPORT JSON
========================================================= */

document
    .getElementById(
        "exportJSON"
    )
    .addEventListener(
        "click",
        exportTrainingData
    );


function exportTrainingData() {

    const data = {

        version:
            "1.0",

        source:
            fileName.textContent,

        mediaType:
            state.mediaType,

        createdAt:
            new Date().toISOString(),

        annotationPolicy: {

            occlusion:
                [
                    0,
                    25,
                    50,
                    75,
                    100
                ],

            truncation:
                [
                    "NONE",
                    "SLIGHT",
                    "PARTIAL",
                    "SEVERE"
                ]

        },

        frames:
            state.mediaType === "video"
                ? exportAllFrames()
                : [
                    {
                        frame: 0,

                        annotations:
                            exportAnnotations(
                                state.annotations
                            )
                    }
                ]

    };


    downloadJSON(
        data,
        getExportName(
            "training-data",
            "json"
        )
    );

}


function exportAllFrames() {

    const frames = [];

    const keys =
        [...state.frameAnnotations.keys()]
            .sort(
                (a, b) => a - b
            );


    /*
     * Include current frame too.
     */

    const currentCopy =
        structuredClone(
            state.annotations
        );

    state.frameAnnotations.set(
        state.currentFrame,
        currentCopy
    );


    const allKeys =
        [
            ...new Set(
                [
                    ...keys,
                    state.currentFrame
                ]
            )
        ]
        .sort(
            (a, b) => a - b
        );


    allKeys.forEach(
        frame => {

            const annotations =
                state.frameAnnotations.get(
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


    return frames;

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

                id:
                    a.id,

                type:
                    a.type,

                class:
                    a.label,

                occlusion:
                    a.occlusion ?? 0,

                truncation:
                    a.truncation || "NONE",

                corrected:
                    !!a.corrected,

                aiGenerated:
                    !!a.aiGenerated,

                box:
                    a.type === "box"
                        ? {
                            x: a.x,
                            y: a.y,
                            width: a.width,
                            height: a.height
                        }
                        : undefined,

                points:
                    a.points
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


/* =========================================================
   CURRENT FRAME JSON
========================================================= */

document
    .getElementById(
        "exportFrameJSON"
    )
    .addEventListener(
        "click",
        () => {

            const data = {

                source:
                    fileName.textContent,

                frame:
                    state.currentFrame,

                time:
                    state.currentTime,

                annotations:
                    exportAnnotations(
                        state.annotations
                    )

            };

            downloadJSON(
                data,
                getExportName(
                    `frame-${state.currentFrame}`,
                    "json"
                )
            );

        }
    );


/* =========================================================
   DOWNLOAD HELPERS
========================================================= */

function downloadJSON(
    data,
    filename
) {

    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
            }
        );

    downloadBlob(
        blob,
        filename
    );

}


function downloadBlob(
    blob,
    filename
) {

    const url =
        URL.createObjectURL(
            blob
        );

    const a =
        document.createElement(
            "a"
        );

    a.href =
        url;

    a.download =
        filename;

    document.body.appendChild(
        a
    );

    a.click();

    a.remove();

    setTimeout(
        () => {
            URL.revokeObjectURL(
                url
            );
        },
        1000
    );

}


function getExportName(
    prefix,
    extension
) {

    const base =
        fileName.textContent
            .replace(
                /\.[^/.]+$/,
                ""
            )
            .replace(
                /[^a-z0-9_-]/gi,
                "_"
            );

    return (
        base +
        "_" +
        prefix +
        "." +
        extension
    );

}


/* =========================================================
   AI STATUS
========================================================= */

function setAIStatus(
    text
) {

    aiStatus.textContent =
        text;

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
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


/* =========================================================
   INITIAL STATE
========================================================= */

updateZoomUI();

updateCounts();

renderClassificationCard();

renderDetails();

render();
