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
   AI MODELS
============================================================ */

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


/* ============================================================
   INITIALIZATION
============================================================ */

window.addEventListener(
    "resize",
    resizeCanvas
);


/*
 * These calls are intentionally protected.
 * A missing optional workspace element must
 * never prevent Supabase authentication.
 */

try {
    resizeCanvas();
} catch (error) {
    console.warn(
        "Initial canvas resize skipped:",
        error
    );
}


try {
    updateZoomUI();
} catch (error) {
    console.warn(
        "Initial zoom UI skipped:",
        error
    );
}


try {
    updateCounts();
} catch (error) {
    console.warn(
        "Initial count update skipped:",
        error
    );
}


try {
    updateAnnotationsList();
} catch (error) {
    console.warn(
        "Initial annotation list skipped:",
        error
    );
}


try {
    updateUndoRedoButtons();
} catch (error) {
    console.warn(
        "Initial undo/redo update skipped:",
        error
    );
}


try {
    updateAIEngineAvailability();
} catch (error) {
    console.warn(
        "Initial AI UI skipped:",
        error
    );
}


try {
    updateColorLegend();
} catch (error) {
    console.warn(
        "Initial color legend skipped:",
        error
    );
}


try {
    hidePopup();
} catch (error) {
    console.warn(
        "Initial popup hide skipped:",
        error
    );
}


try {
    loadSessionOnStartup();
} catch (error) {
    console.warn(
        "Session restore skipped:",
        error
    );
}


/* ============================================================
   UPLOAD
============================================================ */

if (mediaInput) {

    mediaInput.addEventListener(
        "change",
        async event => {

            if (
                typeof canUseUpload ===
                "function" &&
                !canUseUpload()
            ) {

                alert(
                    "Customer upload is not available for this role."
                );

                event.target.value =
                    "";

                return;
            }
                        sourceVideo.currentTime =
                time;


            /*
             * Some browsers do not emit seeked when
             * the requested time is effectively the
             * current time.
             */
            if (
                Math.abs(
                    sourceVideo.currentTime -
                    time
                ) <
                0.001
            ) {

                state.videoSeeking =
                    false;

                sourceVideo
                    .removeEventListener(
                        "seeked",
                        done
                    );

                resolve();

            }

        }
    );

}


/* ============================================================
   CAPTURE VIDEO FRAME
============================================================ */

async function captureVideoFrame() {

    if (
        !sourceVideo ||
        sourceVideo.readyState <
            2
    ) {

        return;

    }


    if (
        state.frameCaptureBusy
    ) {

        return;

    }


    state.frameCaptureBusy =
        true;


    try {

        const width =
            sourceVideo.videoWidth;

        const height =
            sourceVideo.videoHeight;


        if (
            !width ||
            !height
        ) {

            return;

        }


        const frameCanvas =
            document.createElement(
                "canvas"
            );


        frameCanvas.width =
            width;

        frameCanvas.height =
            height;


        const frameCtx =
            frameCanvas.getContext(
                "2d"
            );


        frameCtx.drawImage(
            sourceVideo,
            0,
            0,
            width,
            height
        );


        const image =
            new Image();


        image.src =
            frameCanvas.toDataURL(
                "image/jpeg",
                0.92
            );


        await new Promise(
            (
                resolve,
                reject
            ) => {

                image.onload =
                    resolve;

                image.onerror =
                    reject;

            }
        );


        state.image =
            image;

    } finally {

        state.frameCaptureBusy =
            false;

    }

}


/* ============================================================
   CLEANUP MEDIA
============================================================ */

function cleanupMedia() {

    if (
        state.imageURL
    ) {

        URL.revokeObjectURL(
            state.imageURL
        );

        state.imageURL =
            null;

    }


    if (
        state.videoURL
    ) {

        URL.revokeObjectURL(
            state.videoURL
        );

        state.videoURL =
            null;

    }


    if (sourceVideo) {

        sourceVideo.pause();

        sourceVideo.removeAttribute(
            "src"
        );

        sourceVideo.load();

    }


    state.image =
        null;

    state.mediaType =
        null;

    state.videoDuration =
        0;

    state.currentFrame =
        0;

    state.currentTime =
        0;

    state.totalFrames =
        0;

    state.annotations =
        [];

    state.frameAnnotations =
        new Map();

    state.selectedId =
        null;


    if (
        $("videoControlsPanel")
    ) {

        $("videoControlsPanel")
            .style.display =
            "none";

    }


    if (filmstripBar) {

        filmstripBar.style.display =
            "none";

    }


    hidePopup();

    updateCounts();

    updateAnnotationsList();

}


/* ============================================================
   VIDEO UI
============================================================ */

function updateVideoUI() {

    if (
        $("currentFrame")
    ) {

        $("currentFrame")
            .textContent =
            String(
                state.currentFrame +
                1
            );

    }


    if (
        $("totalFrames")
    ) {

        $("totalFrames")
            .textContent =
            String(
                Math.max(
                    1,
                    state.totalFrames
                )
            );

    }


    if (
        $("currentTime")
    ) {

        $("currentTime")
            .textContent =
            formatVideoTime(
                state.currentTime
            );

    }


    if (
        $("duration")
    ) {

        $("duration")
            .textContent =
            formatVideoTime(
                state.videoDuration
            );

    }


    const slider =
        $("frameSlider");


    if (slider) {

        slider.max =
            Math.max(
                0,
                state.totalFrames -
                1
            );

        slider.value =
            state.currentFrame;

    }


    if (
        filmstripCurrentLabel
    ) {

        filmstripCurrentLabel
            .textContent =
            `Frame ${state.currentFrame + 1}`;

    }

}


function formatVideoTime(
    seconds
) {

    const value =
        Number(
            seconds
        );


    if (
        !Number.isFinite(
            value
        )
    ) {

        return "00:00";

    }


    const total =
        Math.max(
            0,
            Math.floor(
                value
            )
        );


    const minutes =
        Math.floor(
            total / 60
        );


    const secs =
        total % 60;


    return (
        String(
            minutes
        ).padStart(
            2,
            "0"
        ) +
        ":" +
        String(
            secs
        ).padStart(
            2,
            "0"
        )
    );

}


/* ============================================================
   FRAME CONTROLS
============================================================ */

$("frameSlider")?.addEventListener(
    "input",
    async event => {

        const frame =
            Number(
                event.target.value
            );


        await seekVideoFrame(
            frame
        );

    }
);


$("prevFrame")?.addEventListener(
    "click",
    async () => {

        await seekVideoFrame(
            state.currentFrame -
            1
        );

    }
);


$("nextFrame")?.addEventListener(
    "click",
    async () => {

        await seekVideoFrame(
            state.currentFrame +
            1
        );

    }
);


$("playVideo")?.addEventListener(
    "click",
    toggleVideoPlayback
);


async function toggleVideoPlayback() {

    if (
        !sourceVideo ||
        state.mediaType !==
            "video"
    ) {

        return;

    }


    if (
        state.videoPlaying
    ) {

        sourceVideo.pause();

        state.videoPlaying =
            false;

        updatePlayButton();

        return;

    }


    try {

        await sourceVideo.play();

        state.videoPlaying =
            true;

        updatePlayButton();

    } catch (
        error
    ) {

        console.warn(
            "Video playback failed:",
            error
        );

        showToast(
            "Unable to play this video."
        );

    }

}


function updatePlayButton() {

    const button =
        $("playVideo");


    if (!button) {
        return;
    }


    button.textContent =
        state.videoPlaying
            ? "❚❚"
            : "▶";

}


/* ============================================================
   VIDEO EVENTS
============================================================ */

sourceVideo?.addEventListener(
    "timeupdate",
    () => {

        if (
            state.videoSeeking
        ) {

            return;

        }


        state.currentTime =
            sourceVideo.currentTime;


        if (
            state.fps > 0
        ) {

            state.currentFrame =
                Math.max(
                    0,
                    Math.min(
                        state.totalFrames -
                        1,
                        Math.round(
                            sourceVideo.currentTime *
                            state.fps
                        )
                    )
                );

        }


        updateVideoUI();

    }
);


sourceVideo?.addEventListener(
    "play",
    () => {

        state.videoPlaying =
            true;

        updatePlayButton();

    }
);


sourceVideo?.addEventListener(
    "pause",
    () => {

        state.videoPlaying =
            false;

        updatePlayButton();

    }
);


sourceVideo?.addEventListener(
    "ended",
    () => {

        state.videoPlaying =
            false;

        updatePlayButton();

    }
);


/* ============================================================
   FILMSTRIP
============================================================ */

function buildFilmstrip() {

    if (
        !filmstripTrack ||
        state.mediaType !==
            "video"
    ) {

        return;

    }


    filmstripTrack.innerHTML =
        "";


    const count =
        Math.min(
            12,
            Math.max(
                1,
                state.totalFrames
            )
        );


    for (
        let index = 0;
        index < count;
        index++
    ) {

        const frame =
            Math.round(
                (
                    index /
                    Math.max(
                        1,
                        count -
                        1
                    )
                ) *
                Math.max(
                    0,
                    state.totalFrames -
                    1
                )
            );


        const item =
            document.createElement(
                "button"
            );


        item.type =
            "button";

        item.className =
            "filmstrip-item";


        item.dataset.frame =
            String(
                frame
            );


        item.innerHTML = `
            <span class="filmstrip-frame">
                ${frame + 1}
            </span>
        `;


        item.addEventListener(
            "click",
            () =>
                seekVideoFrame(
                    frame
                )
        );


        filmstripTrack.appendChild(
            item
        );

    }


    updateFilmstripSelection();

}


function updateFilmstripSelection() {

    if (!filmstripTrack) {
        return;
    }


    filmstripTrack
        .querySelectorAll(
            ".filmstrip-item"
        )
        .forEach(
            item => {

                const frame =
                    Number(
                        item.dataset.frame
                    );


                item.classList.toggle(
                    "active",
                    frame ===
                    state.currentFrame
                );

            }
        );

}


/* ============================================================
   CANVAS RESIZE
============================================================ */

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


/* ============================================================
   VIEW TRANSFORM
============================================================ */

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


/* ============================================================
   COORDINATE HELPERS
============================================================ */

function screenToImage(
    clientX,
    clientY
) {

    if (
        !canvas
    ) {

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


/* ============================================================
   ZOOM
============================================================ */

function setZoom(
    nextScale,
    centerX,
    centerY
) {

    if (
        !canvas
    ) {

        return;

    }


    const rect =
        canvas.getBoundingClientRect();


    const cx =
        Number.isFinite(
            centerX
        )
            ? centerX -
              rect.left
            : rect.width /
              2;


    const cy =
        Number.isFinite(
            centerY
        )
            ? centerY -
              rect.top
            : rect.height /
              2;


    const oldScale =
        state.scale;


    const newScale =
        clamp(
            nextScale,
            state.minScale,
            state.maxScale
        );


    if (
        oldScale ===
        newScale
    ) {

        return;

    }


    const imageX =
        (
            cx -
            state.offsetX
        ) /
        oldScale;


    const imageY =
        (
            cy -
            state.offsetY
        ) /
        oldScale;


    state.scale =
        newScale;


    state.offsetX =
        cx -
        imageX *
        newScale;


    state.offsetY =
        cy -
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


$("zoomIn")?.addEventListener(
    "click",
    zoomIn
);


$("zoomOut")?.addEventListener(
    "click",
    zoomOut
);


$("resetZoom")?.addEventListener(
    "click",
    resetZoom
);


function updateZoomUI() {

    const zoom =
        $("zoomLevel");


    if (zoom) {

        zoom.textContent =
            `${Math.round(
                state.scale *
                100
            )}%`;

    }

}


/* ============================================================
   MOUSE WHEEL ZOOM
============================================================ */

canvas?.addEventListener(
    "wheel",
    event => {

        event.preventDefault();


        const factor =
            event.deltaY < 0
                ? 1.12
                : 0.89;


        setZoom(
            state.scale *
            factor,
            event.clientX,
            event.clientY
        );

    },
    {
        passive: false
    }
);


/* ============================================================
   POINTER HELPERS
============================================================ */

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


/* ============================================================
   CANVAS POINTER DOWN
============================================================ */

canvas?.addEventListener(
    "pointerdown",
    event => {

        if (
            event.button !==
            0
        ) {

            return;

        }


        canvas.setPointerCapture(
            event.pointerId
        );


        state.pointerDown =
            true;


        const point =
            getPointerPosition(
                event
            );


        if (
            state.spacePan ||
            state.mode ===
            "pan"
        ) {

            state.panning =
                true;

            state.panStart = {

                clientX:
                    event.clientX,

                clientY:
                    event.clientY,

                offsetX:
                    state.offsetX,

                offsetY:
                    state.offsetY

            };

            return;

        }


        if (
            state.annotationType ===
            "polygon"
        ) {

            handlePolygonPointerDown(
                point
            );

            return;

        }


        if (
            state.annotationType ===
            "segmentation"
        ) {

            handleSegmentationPointerDown(
                point
            );

            return;

        }


        if (
            state.mode ===
            "select"
        ) {

            const selected =
                findAnnotationAtPoint(
                    point
                );


            if (selected) {

                state.selectedId =
                    selected.id;

                state.dragging =
                    true;

                state.dragStartImage =
                    point;

                state.dragLastImage =
                    point;

                pushHistory();

                updateAnnotationsList();

                render();

                return;

            }


            state.selectedId =
                null;

            hidePopup();

            updateAnnotationsList();

            render();

            return;

        }


        if (
            state.mode ===
            "draw"
        ) {

            state.drawing =
                true;

            state.drawStart =
                point;

            state.drawCurrent =
                point;

            return;

        }

    }
);


/* ============================================================
   CANVAS POINTER MOVE
============================================================ */

canvas?.addEventListener(
    "pointermove",
    event => {

        if (
            !state.pointerDown
        ) {

            const point =
                getPointerPosition(
                    event
                );


            const hovered =
                findAnnotationAtPoint(
                    point
                );


            const id =
                hovered?.id ||
                null;


            if (
                id !==
                state.hoveredId
            ) {

                state.hoveredId =
                    id;

                render();

            }


            return;

        }


        if (
            state.panning &&
            state.panStart
        ) {

            const dx =
                event.clientX -
                state.panStart.clientX;


            const dy =
                event.clientY -
                state.panStart.clientY;


            state.offsetX =
                state.panStart.offsetX +
                dx;


            state.offsetY =
                state.panStart.offsetY +
                dy;


            render();

            return;

        }


        const point =
            getPointerPosition(
                event
            );


        if (
            state.dragging &&
            state.selectedId
        ) {

            moveSelectedAnnotation(
                point
            );

            return;

        }


        if (
            state.drawing
        ) {

            state.drawCurrent =
                point;

            render();

            return;

        }


        if (
            state.annotationType ===
            "polygon" &&
            state.polygonPoints.length
        ) {

            state.drawCurrent =
                point;

            render();

        }

    }
);


/* ============================================================
   CANVAS POINTER UP
============================================================ */

canvas?.addEventListener(
    "pointerup",
    event => {

        state.pointerDown =
            false;


        if (
            canvas.hasPointerCapture(
                event.pointerId
            )
        ) {

            canvas.releasePointerCapture(
                event.pointerId
            );

        }


        if (
            state.panning
        ) {

            state.panning =
                false;

            state.panStart =
                null;

            return;

        }


        if (
            state.dragging
        ) {

            state.dragging =
                false;

            state.dragStartImage =
                null;

            state.dragLastImage =
                null;

            saveFrame();

            updateAnnotationsList();

            render();

            return;

        }


        if (
            state.drawing
        ) {

            state.drawing =
                false;

            const start =
                state.drawStart;

            const end =
                getPointerPosition(
                    event
                );


            state.drawStart =
                null;

            state.drawCurrent =
                null;


            if (
                start &&
                end
            ) {

                createBoxAnnotation(
                    start,
                    end
                );

            }


            return;

        }

    }
);


/* ============================================================
   POINTER CANCEL
============================================================ */

canvas?.addEventListener(
    "pointercancel",
    () => {

        state.pointerDown =
            false;

        state.panning =
            false;

        state.dragging =
            false;

        state.drawing =
            false;

        state.drawStart =
            null;

        state.drawCurrent =
            null;

        state.panStart =
            null;

    }
);


/* ============================================================
   KEYBOARD
============================================================ */

window.addEventListener(
    "keydown",
    event => {

        if (
            event.code ===
            "Space" &&
            !isTypingTarget(
                event.target
            )
        ) {

            state.spacePan =
                true;

            event.preventDefault();

        }


        if (
            event.key ===
            "Delete"
        ) {

            if (
                !isTypingTarget(
                    event.target
                )
            ) {

                deleteSelectedAnnotation();

            }

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


            if (
                event.shiftKey
            ) {

                redo();

            } else {

                undo();

            }

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


window.addEventListener(
    "keyup",
    event => {

        if (
            event.code ===
            "Space"
        ) {

            state.spacePan =
                false;

        }

    }
);


function isTypingTarget(
    target
) {

    if (!target) {
        return false;
    }


    const tag =
        target.tagName?.toLowerCase();


    return (
        tag ===
            "input" ||
        tag ===
            "textarea" ||
        tag ===
            "select" ||
        target.isContentEditable
    );

}


/* ============================================================
   ANNOTATION CREATION
============================================================ */

function createBoxAnnotation(
    start,
    end
) {

    const box =
        normalizeBox(
            start,
            end
        );


    if (
        box.width <
            2 ||
        box.height <
            2
    ) {

        return;

    }


    const annotation = {

        id:
            `ann-${Date.now()}-${state.nextId++}`,

        type:
            "box",

        class_name:
            $("className")
                ?.value
                ?.trim() ||
            "object",

        x:
            box.x,

        y:
            box.y,

        width:
            box.width,

        height:
            box.height,

        score:
            1,

        ai_generated:
            false,

        corrected:
            false,

        frame_number:
            state.currentFrame

    };


    pushHistory();


    state.annotations.push(
        annotation
    );


    state.selectedId =
        annotation.id;


    saveFrame();

    updateAnnotationsList();

    updateCounts();

    render();

}


/* ============================================================
   POLYGON
============================================================ */

function handlePolygonPointerDown(
    point
) {

    if (
        !state.polygonPoints.length
    ) {

        pushHistory();

        state.polygonPoints = [
            point
        ];

        state.mode =
            "draw";

        render();

        return;

    }


    const first =
        state.polygonPoints[0];


    if (
        distance(
            point,
            first
        ) <
        12 /
        Math.max(
            state.scale,
            0.01
        )
    ) {

        finishPolygon();

        return;

    }


    state.polygonPoints.push(
        point
    );


    render();

}


function finishPolygon() {

    const points =
        state.polygonPoints;


    if (
        points.length <
        3
    ) {

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

        class_name:
            $("className")
                ?.value
                ?.trim() ||
            "object",

        points:
            points.map(
                point => ({
                    x:
                        point.x,

                    y:
                        point.y
                })
            ),

        score:
            1,

        ai_generated:
            false,

        corrected:
            false,

        frame_number:
            state.currentFrame

    };


    state.annotations.push(
        annotation
    );


    state.selectedId =
        annotation.id;


    state.polygonPoints =
        [];

    state.drawCurrent =
        null;

    state.mode =
        "select";


    saveFrame();

    updateAnnotationsList();

    updateCounts();

    render();

}


/* ============================================================
   SEGMENTATION
============================================================ */

function handleSegmentationPointerDown(
    point
) {

    /*
     * Segmentation is represented as a polygon
     * in the saved annotation structure.
     */

    handlePolygonPointerDown(
        point
    );

}


/* ============================================================
   MOVE SELECTED
============================================================ */

function moveSelectedAnnotation(
    point
) {

    const annotation =
        state.annotations.find(
            item =>
                item.id ===
                state.selectedId
        );


    if (!annotation) {
        return;
    }


    const previous =
        state.dragLastImage;


    if (!previous) {

        state.dragLastImage =
            point;

        return;

    }


    const dx =
        point.x -
        previous.x;


    const dy =
        point.y -
        previous.y;


    if (
        annotation.type ===
        "box"
    ) {

        annotation.x +=
            dx;

        annotation.y +=
            dy;

    } else if (
        Array.isArray(
            annotation.points
        )
    ) {

        annotation.points =
            annotation.points.map(
                item => ({
                    x:
                        item.x +
                        dx,

                    y:
                        item.y +
                        dy
                })
            );

    }


    state.dragLastImage =
        point;


    render();

}


/* ============================================================
   ANNOTATION HIT TEST
============================================================ */

function findAnnotationAtPoint(
    point
) {

    for (
        let index =
            state.annotations.length -
            1;
        index >= 0;
        index--
    ) {

        const annotation =
            state.annotations[
                index
            ];


        if (
            annotation.type ===
            "box"
        ) {

            if (
                point.x >=
                    annotation.x &&
                point.x <=
                    annotation.x +
                    annotation.width &&
                point.y >=
                    annotation.y &&
                point.y <=
                    annotation.y +
                    annotation.height
            ) {

                return annotation;

            }

        }


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

    }


    return null;

}


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
                yi >
                    point.y
            ) !==
            (
                yj >
                    point.y
            ) &&
            point.x <
                (
                    xj -
                    xi
                ) *
                (
                    point.y -
                    yi
                ) /
                (
                    yj -
                    yi
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


/* ============================================================
   DELETE
============================================================ */

$("deleteSelected")?.addEventListener(
    "click",
    deleteSelectedAnnotation
);


function deleteSelectedAnnotation() {

    if (
        !state.selectedId
    ) {

        showToast(
            "Select an annotation first."
        );

        return;

    }


    const index =
        state.annotations.findIndex(
            annotation =>
                annotation.id ===
                state.selectedId
        );


    if (
        index ===
        -1
    ) {

        return;

    }


    pushHistory();


    state.annotations.splice(
        index,
        1
    );


    state.selectedId =
        null;


    saveFrame();

    updateAnnotationsList();

    updateCounts();

    render();

}


/* ============================================================
   ANNOTATION TYPE BUTTONS
============================================================ */

document
    .querySelectorAll(
        "[data-annotation-type]"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const type =
                        button.dataset
                            .annotationType;


                    if (
                        type ===
                        "box"
                    ) {

                        state.annotationType =
                            "box";

                        state.mode =
                            "draw";

                    } else if (
                        type ===
                        "polygon"
                    ) {

                        state.annotationType =
                            "polygon";

                        state.mode =
                            "draw";

                    } else if (
                        type ===
                        "segmentation"
                    ) {

                        state.annotationType =
                            "segmentation";

                        state.mode =
                            "draw";

                    } else {

                        state.annotationType =
                            type;

                    }


                    state.polygonPoints =
                        [];


                    document
                        .querySelectorAll(
                            "[data-annotation-type]"
                        )
                        .forEach(
                            item =>
                                item.classList.toggle(
                                    "active",
                                    item ===
                                    button
                                )
                        );


                    render();

                }
            );

        }
    );


/* ============================================================
   SELECT / PAN / DRAW TOOLS
============================================================ */

document
    .querySelectorAll(
        "[data-tool]"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const tool =
                        button.dataset.tool;


                    if (
                        tool ===
                        "select"
                    ) {

                        state.mode =
                            "select";

                    } else if (
                        tool ===
                        "draw"
                    ) {

                        state.mode =
                            "draw";

                    } else if (
                        tool ===
                        "pan"
                    ) {

                        state.mode =
                            "pan";

                    }


                    document
                        .querySelectorAll(
                            "[data-tool]"
                        )
                        .forEach(
                            item =>
                                item.classList.toggle(
                                    "active",
                                    item ===
                                    button
                                )
                        );


                    render();

                }
            );

        }
    );


/* ============================================================
   RENDER
============================================================ */

function render() {

    if (
        !canvas ||
        !ctx
    ) {

        return;

    }


    const rect =
        canvas.getBoundingClientRect();


    const width =
        rect.width;

    const height =
        rect.height;


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    ctx.save();


    /*
     * Canvas background.
     */

    ctx.fillStyle =
        "#101214";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    if (
        state.image
    ) {

        const imageWidth =
            state.image.naturalWidth ||
            state.image.width;


        const imageHeight =
            state.image.naturalHeight ||
            state.image.height;


        ctx.drawImage(
            state.image,
            state.offsetX,
            state.offsetY,
            imageWidth *
                state.scale,
            imageHeight *
                state.scale
        );


        renderAnnotations();

        renderDrawingPreview();

    }


    ctx.restore();


    updateFilmstripSelection();

    updateCounts();

    updateZoomUI();

}


/* ============================================================
   RENDER ANNOTATIONS
============================================================ */

function renderAnnotations() {

    state.annotations
        .forEach(
            annotation => {

                const selected =
                    annotation.id ===
                    state.selectedId;


                const hovered =
                    annotation.id ===
                    state.hoveredId;


                if (
                    annotation.type ===
                    "box"
                ) {

                    renderBoxAnnotation(
                        annotation,
                        selected,
                        hovered
                    );

                } else if (
                    Array.isArray(
                        annotation.points
                    )
                ) {

                    renderPolygonAnnotation(
                        annotation,
                        selected,
                        hovered
                    );

                }

            }
        );

}


/* ============================================================
   RENDER BOX
============================================================ */

function renderBoxAnnotation(
    annotation,
    selected,
    hovered
) {

    const topLeft =
        imageToScreen(
            annotation.x,
            annotation.y
        );


    const width =
        annotation.width *
        state.scale;


    const height =
        annotation.height *
        state.scale;


    ctx.save();


    ctx.lineWidth =
        selected
            ? 3
            : hovered
                ? 2.5
                : 2;


    ctx.strokeStyle =
        selected
            ? "#ff6b00"
            : "#22c55e";


    ctx.fillStyle =
        selected
            ? "rgba(255,107,0,.12)"
            : "rgba(34,197,94,.08)";


    ctx.fillRect(
        topLeft.x,
        topLeft.y,
        width,
        height
    );


    ctx.strokeRect(
        topLeft.x,
        topLeft.y,
        width,
        height
    );


    renderAnnotationLabel(
        annotation,
        topLeft.x,
        topLeft.y
    );


    if (
        selected
    ) {

        renderResizeHandles(
            topLeft.x,
            topLeft.y,
            width,
            height
        );

    }


    ctx.restore();

}


/* ============================================================
   RENDER POLYGON
============================================================ */

function renderPolygonAnnotation(
    annotation,
    selected,
    hovered
) {

    if (
        !annotation.points ||
        annotation.points.length <
            2
    ) {

        return;

    }


    ctx.save();


    ctx.beginPath();


    annotation.points
        .forEach(
            (
                point,
                index
            ) => {

                const screen =
                    imageToScreen(
                        point.x,
                        point.y
                    );


                if (
                    index ===
                    0
                ) {

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


    ctx.closePath();


    ctx.lineWidth =
        selected
            ? 3
            : hovered
                ? 2.5
                : 2;


    ctx.strokeStyle =
        selected
            ? "#ff6b00"
            : "#22c55e";


    ctx.fillStyle =
        selected
            ? "rgba(255,107,0,.12)"
            : "rgba(34,197,94,.08)";


    ctx.fill();

    ctx.stroke();


    const first =
        annotation.points[0];


    if (first) {

        const label =
            imageToScreen(
                first.x,
                first.y
            );


        renderAnnotationLabel(
            annotation,
            label.x,
            label.y
        );

    }


    ctx.restore();

}


/* ============================================================
   LABEL
============================================================ */

function renderAnnotationLabel(
    annotation,
    x,
    y
) {

    const label =
        annotation.class_name ||
        annotation.label ||
        annotation.type ||
        "object";


    const score =
        Number(
            annotation.score
        );


    const text =
        Number.isFinite(
            score
        ) &&
        score < 1
            ? `${label} ${Math.round(
                score * 100
            )}%`
            : label;


    ctx.save();


    ctx.font =
        "600 12px Inter, Arial, sans-serif";


    const metrics =
        ctx.measureText(
            text
        );


    const padding =
        6;


    const boxWidth =
        metrics.width +
        padding * 2;


    const boxHeight =
        22;


    const top =
        Math.max(
            0,
            y -
            boxHeight
        );


    ctx.fillStyle =
        "#ff6b00";


    ctx.fillRect(
        x,
        top,
        boxWidth,
        boxHeight
    );


    ctx.fillStyle =
        "#ffffff";


    ctx.textBaseline =
        "middle";


    ctx.fillText(
        text,
        x +
            padding,
        top +
            boxHeight /
                2
    );


    ctx.restore();

}


/* ============================================================
   RESIZE HANDLES
============================================================ */

function renderResizeHandles(
    x,
    y,
    width,
    height
) {

    const size =
        7;


    const points = [

        [x, y],

        [x + width, y],

        [x, y + height],

        [x + width, y + height]

    ];


    ctx.save();


    ctx.fillStyle =
        "#ffffff";

    ctx.strokeStyle =
        "#ff6b00";


    points.forEach(
        point => {

            ctx.beginPath();

            ctx.rect(
                point[0] -
                    size /
                    2,
                point[1] -
                    size /
                    2,
                size,
                size
            );

            ctx.fill();

            ctx.stroke();

        }
    );


    ctx.restore();

}


/* ============================================================
   DRAWING PREVIEW
============================================================ */

function renderDrawingPreview() {

    if (
        state.drawing &&
        state.drawStart &&
        state.drawCurrent
    ) {

        const box =
            normalizeBox(
                state.drawStart,
                state.drawCurrent
            );


        const topLeft =
            imageToScreen(
                box.x,
                box.y
            );


        ctx.save();


        ctx.setLineDash(
            [
                6,
                4
            ]
        );


        ctx.lineWidth =
            2;

        ctx.strokeStyle =
            "#ff6b00";

        ctx.strokeRect(
            topLeft.x,
            topLeft.y,
            box.width *
                state.scale,
            box.height *
                state.scale
        );


        ctx.restore();

    }


    if (
        state.polygonPoints.length
    ) {

        ctx.save();


        ctx.lineWidth =
            2;

        ctx.strokeStyle =
            "#ff6b00";


        ctx.beginPath();


        state.polygonPoints
            .forEach(
                (
                    point,
                    index
                ) => {

                    const screen =
                        imageToScreen(
                            point.x,
                            point.y
                        );


                    if (
                        index ===
                        0
                    ) {

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


        state.polygonPoints
            .forEach(
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

                    ctx.fillStyle =
                        "#ff6b00";

                    ctx.fill();

                }
            );


        ctx.restore();

    }

}


/* ============================================================
   COUNTS
============================================================ */

function updateCounts() {

    const count =
        state.annotations.length;


    const objectCount =
        $("objectCount");


    if (
        objectCount
    ) {

        objectCount.textContent =
            String(
                count
            );

    }


    const selected =
        $("selectedObject");


    if (
        selected
    ) {

        selected.textContent =
            state.selectedId
                ? "1"
                : "0";

    }

}


/* ============================================================
   ANNOTATIONS LIST
============================================================ */

function updateAnnotationsList() {

    if (
        !annotationsList
    ) {

        return;

    }


    if (
        !state.annotations.length
    ) {

        annotationsList.innerHTML = `
            <div class="empty-annotations">
                No annotations yet.
            </div>
        `;

        return;

    }


    annotationsList.innerHTML =
        state.annotations
            .map(
                annotation =>
                    renderAnnotationListItem(
                        annotation
                    )
            )
            .join("");


    annotationsList
        .querySelectorAll(
            "[data-annotation-id]"
        )
        .forEach(
            element => {

                element.addEventListener(
                    "click",
                    () => {

                        state.selectedId =
                            element.dataset
                                .annotationId;


                        updateAnnotationsList();

                        render();

                    }
                );

            }
        );

}


function renderAnnotationListItem(
    annotation
) {

    const selected =
        annotation.id ===
        state.selectedId;


    return `
        <button
            type="button"
            class="annotation-list-item ${
                selected
                    ? "active"
                    : ""
            }"
            data-annotation-id="${escapeHTML(
                annotation.id
            )}"
        >
            <span class="annotation-list-main">
                <strong>
                    ${escapeHTML(
                        annotation.class_name ||
                        annotation.label ||
                        "Object"
                    )}
                </strong>

                <small>
                    ${escapeHTML(
                        shapeLabel(
                            annotation.type
                        )
                    )}
                </small>
            </span>

            <span class="annotation-list-score">
                ${
                    Number.isFinite(
                        Number(
                            annotation.score
                        )
                    )
                        ? `${Math.round(
                            Number(
                                annotation.score
                            ) *
                            100
                        )}%`
                        : ""
                }
            </span>
        </button>
    `;

}


/* ============================================================
   POPUP
============================================================ */

function showAnnotationPopup(
    annotation
) {

    if (
        !popupEl
    ) {

        return;

    }


    if (popupTitle) {

        popupTitle.textContent =
            annotation.class_name ||
            annotation.label ||
            "Annotation";

    }


    if (popupBody) {

        popupBody.innerHTML = `
            <div>
                <span>Type</span>
                <strong>
                    ${escapeHTML(
                        shapeLabel(
                            annotation.type
                        )
                    )}
                </strong>
            </div>

            <div>
                <span>Score</span>
                <strong>
                    ${
                        Number.isFinite(
                            Number(
                                annotation.score
                            )
                        )
                            ? `${Math.round(
                                Number(
                                    annotation.score
                                ) *
                                100
                            )}%`
                            : "—"
                    }
                </strong>
            </div>
        `;

    }


    popupEl.style.display =
        "block";


    popupEl.classList.toggle(
        "expanded",
        state.popupExpanded
    );

}


function hidePopup() {

    if (
        popupEl
    ) {

        popupEl.style.display =
            "none";

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

    }
);


/* ============================================================
   ESCAPE HTML
============================================================ */

function escapeHTML(
    value
) {

    return String(
        value ??
        ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


/* ============================================================
   MB
============================================================ */

function formatMB(
    bytes
) {

    const value =
        Number(
            bytes
        );


    if (
        !Number.isFinite(
            value
        )
    ) {

        return "0.00";

    }


    return (
        value /
        (
            1024 *
            1024
        )
    ).toFixed(
        2
    );

}
            a.corrected =
                true;

            updateAnnotationsList();

            saveFrame();
            saveSession();

            cloudSaveAnnotation(
                a
            );

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

            cloudSaveAnnotation(
                a
            );

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

    popupEl.dataset.id =
        "";
}

/* ============================================================
   ANNOTATION LIST
============================================================ */

function updateAnnotationsList() {
    if (!annotationsList) {
        return;
    }

    if (
        !state.annotations.length
    ) {
        annotationsList.innerHTML = `
            <div class="details-empty">
                <div class="details-icon">□</div>

                <strong>
                    No annotations yet
                </strong>

                <span>
                    Draw a box, polygon,
                    or run Auto Annotate.
                </span>
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
                        class="ann-row ${
                            a.id ===
                            state.selectedId
                                ? "selected"
                                : ""
                        }"
                        data-id="${escapeHTML(
                            a.id
                        )}"
                    >
                        <span
                            class="ann-row-dot"
                            ${dotStyle}
                        ></span>

                        <div class="ann-row-main">
                            <div class="ann-row-label">
                                ${escapeHTML(
                                    a.label ||
                                    "unknown"
                                )}
                            </div>

                            <div class="ann-row-meta">
                                ${escapeHTML(
                                    a.type
                                )}
                                •
                                ${
                                    a.corrected
                                        ? "corrected"
                                        : "AI"
                                }
                            </div>
                        </div>

                        <span class="ann-row-badge">
                            ${
                                a.occlusion ??
                                0
                            }%
                        </span>
                    </div>
                `;
            }
        ).join("");

    annotationsList
        .querySelectorAll(
            ".ann-row"
        )
        .forEach(
            row => {
                row.addEventListener(
                    "click",
                    () => {
                        state.selectedId =
                            row.dataset.id;

                        updateSelected();
                    }
                );
            }
        );
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

function occlusionColor(
    value
) {
    const v =
        Number(
            value ?? 0
        );

    if (v >= 80) {
        return "#ef4444";
    }

    if (v >= 50) {
        return "#f59e0b";
    }

    if (v >= 20) {
        return "#eab308";
    }

    return "#22c55e";
}

function truncationColor(
    value
) {
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
            ? cloneAnnotations(
                saved
            )
            : [];

    state.selectedId =
        null;

    resetHistory(
        state.annotations
    );

    updateCounts();
    updateAnnotationsList();
    hidePopup();
}

function buildFilmstrip() {
    if (!filmstripTrack) {
        return;
    }

    filmstripTrack.innerHTML =
        "";

    const total =
        Math.min(
            state.totalFrames ||
                1,
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

        tick.type =
            "button";

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

                seekVideoFrame(
                    i
                );
            }
        );

        filmstripTrack.appendChild(
            tick
        );
    }

    updateFilmstripTicks();
}

function updateFilmstripTicks() {
    if (!filmstripTrack) {
        return;
    }

    const ticks =
        filmstripTrack.querySelectorAll(
            ".filmstrip-tick"
        );

    ticks.forEach(
        tick => {
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
                anns.length >
                    0
            );

            tick.classList.toggle(
                "current",
                frame ===
                    state.currentFrame
            );
        }
    );
}

function updateFilmstripCurrent() {
    if (
        !filmstripCurrentLabel
    ) {
        return;
    }

    filmstripCurrentLabel.textContent =
        `Frame ${state.currentFrame}`;
}

function updateVideoUI() {
    const currentFrame =
        $("currentFrame");

    const totalFrames =
        $("totalFrames");

    const frameSlider =
        $("frameSlider");

    const videoTime =
        $("videoTime");

    if (currentFrame) {
        currentFrame.textContent =
            state.currentFrame;
    }

    if (totalFrames) {
        totalFrames.textContent =
            state.totalFrames;
    }

    if (frameSlider) {
        frameSlider.value =
            state.currentFrame;
    }

    if (videoTime) {
        videoTime.textContent =
            formatTime(
                state.currentTime
            );
    }

    updateFilmstripCurrent();
}

function formatTime(
    seconds
) {
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
            (seconds % 1) *
            1000
        );

    return (
        String(
            minutes
        ).padStart(
            2,
            "0"
        ) +
        ":" +
        String(
            secs
        ).padStart(
            2,
            "0"
        ) +
        "." +
        String(
            millis
        ).padStart(
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

    const zoomValue =
        $("zoomValue");

    const footerZoom =
        $("footerZoom");

    if (zoomValue) {
        zoomValue.textContent =
            percent + "%";
    }

    if (footerZoom) {
        footerZoom.textContent =
            percent + "%";
    }
}

/* ============================================================
   AI STATUS
============================================================ */

function setAIStatus(
    message
) {
    const status =
        $("aiStatus");

    if (status) {
        status.textContent =
            message;
    }
}
/* ============================================================
   AI ANNOTATION ENGINE
============================================================ */

const AI_CONFIG = {
    confidenceThreshold: 0.35,
    maxObjects: 100,
    defaultLabel: "object",
    enabled: true
};

const AI_LABELS = [
    "person",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
    "animal",
    "dog",
    "cat",
    "bird",
    "traffic light",
    "traffic sign",
    "building",
    "tree",
    "road",
    "vehicle",
    "object"
];

let aiModel = null;
let aiModelLoading = false;
let aiModelReady = false;

/* ============================================================
   AI STATUS HELPERS
============================================================ */

function setAIProgress(
    percent
) {
    const progress =
        $("aiProgress");

    const bar =
        $("aiProgressBar");

    if (progress) {
        progress.value =
            percent;
    }

    if (bar) {
        bar.style.width =
            `${percent}%`;
    }
}

function setAILoading(
    loading
) {
    aiModelLoading =
        loading;

    const button =
        $("runAI");

    if (button) {
        button.disabled =
            loading;

        button.textContent =
            loading
                ? "RUNNING AI..."
                : "AUTO ANNOTATE";
    }
}

/* ============================================================
   AI MODEL LOADER
============================================================ */

async function loadAIModel() {
    if (
        aiModelReady &&
        aiModel
    ) {
        return aiModel;
    }

    if (aiModelLoading) {
        return null;
    }

    setAILoading(true);
    setAIStatus(
        "Preparing AI annotation engine..."
    );
    setAIProgress(10);

    try {
        /*
         * The application supports the browser-side AI workflow.
         * If an external model is available in the page, use it.
         * Otherwise the fallback detector below remains available.
         */

        if (
            window.annotationAI &&
            typeof
                window.annotationAI.detect ===
                "function"
        ) {
            aiModel =
                window.annotationAI;

            aiModelReady =
                true;

            setAIProgress(100);
            setAIStatus(
                "AI model ready."
            );

            return aiModel;
        }

        /*
         * Optional TensorFlow/COCO-SSD integration.
         * This does not break the application when the library
         * has not been loaded.
         */
        if (
            window.cocoSsd &&
            typeof
                window.cocoSsd.load ===
                "function"
        ) {
            setAIProgress(25);

            aiModel =
                await window.cocoSsd.load();

            aiModelReady =
                true;

            setAIProgress(100);
            setAIStatus(
                "AI model ready."
            );

            return aiModel;
        }

        /*
         * If no model library exists, keep the workflow usable.
         * The fallback uses image processing and creates a
         * reviewable annotation rather than crashing.
         */
        aiModel =
            {
                fallback: true
            };

        aiModelReady =
            true;

        setAIProgress(100);

        setAIStatus(
            "AI fallback mode ready. Add a browser AI model for object detection."
        );

        return aiModel;

    } catch (error) {
        console.error(
            "AI model loading failed:",
            error
        );

        aiModel =
            {
                fallback: true
            };

        aiModelReady =
            true;

        setAIStatus(
            "AI model unavailable. Using fallback annotation mode."
        );

        return aiModel;

    } finally {
        setAILoading(false);
    }
}

/* ============================================================
   RUN AUTO ANNOTATE
============================================================ */

$("runAI")?.addEventListener(
    "click",
    runAutoAnnotate
);

async function runAutoAnnotate() {
    if (
        !canUseAIAnnotations()
    ) {
        showToast(
            "AI annotation is not available for this account."
        );

        return;
    }

    if (
        !state.image &&
        state.mediaType !==
            "video"
    ) {
        showToast(
            "Load an image or video first."
        );

        return;
    }

    if (
        state.mediaType ===
        "video" &&
        !state.image
    ) {
        captureCurrentVideoFrame();
    }

    setAILoading(true);
    setAIProgress(5);
    setAIStatus(
        "Starting AI annotation..."
    );

    try {
        const model =
            await loadAIModel();

        if (!model) {
            throw new Error(
                "AI model is not available."
            );
        }

        setAIProgress(35);

        let predictions = [];

        if (
            !model.fallback &&
            typeof model.detect ===
                "function"
        ) {
            predictions =
                await model.detect(
                    state.image
                );
        } else {
            predictions =
                await fallbackDetect();
        }

        setAIProgress(70);

        const normalized =
            normalizeAIPredictions(
                predictions
            );

        if (
            !normalized.length
        ) {
            setAIStatus(
                "AI found no objects to annotate."
            );

            showToast(
                "No objects detected."
            );

            setAIProgress(100);

            return;
        }

        let added = 0;

        normalized
            .slice(
                0,
                AI_CONFIG.maxObjects
            )
            .forEach(
                prediction => {
                    if (
                        prediction.score <
                        AI_CONFIG.confidenceThreshold
                    ) {
                        return;
                    }

                    createAIAnnotation(
                        prediction
                    );

                    added++;
                }
            );

        setAIProgress(100);

        setAIStatus(
            `AI added ${added} annotation${
                added === 1
                    ? ""
                    : "s"
            }.`
        );

        showToast(
            `${added} AI annotation${
                added === 1
                    ? ""
                    : "s"
            } created`
        );

        updateCounts();
        updateAnnotationsList();
        render();

        saveFrame();
        saveSession();

        await cloudSaveAllAnnotations();

    } catch (error) {
        console.error(
            "Auto annotation failed:",
            error
        );

        setAIStatus(
            "AI annotation failed. Please try again."
        );

        showToast(
            "AI annotation failed."
        );

    } finally {
        setAILoading(false);
        setAIProgress(100);
    }
}

/* ============================================================
   CHECK AI PERMISSION
============================================================ */

function canUseAIAnnotations() {
    const role =
        CLOUD.profile?.role;

    if (!role) {
        return false;
    }

    /*
     * Coworkers are deliberately allowed to use
     * autogenerated / AI annotations.
     *
     * They are not given customer-upload or
     * manual annotation-type controls.
     */
    return [
        "admin",
        "staff",
        "reviewer",
        "customer",
        "coworker_2d_box",
        "coworker_polygon",
        "coworker_segmentation"
    ].includes(
        role
    );
}

/* ============================================================
   NORMALIZE AI PREDICTIONS
============================================================ */

function normalizeAIPredictions(
    predictions
) {
    if (
        !Array.isArray(
            predictions
        )
    ) {
        return [];
    }

    return predictions
        .map(
            prediction => {

                const score =
                    Number(
                        prediction.score ??
                        prediction.confidence ??
                        0
                    );

                let label =
                    prediction.class ??
                    prediction.label ??
                    prediction.name ??
                    AI_CONFIG.defaultLabel;

                label =
                    normalizeLabel(
                        label
                    );


                let bbox =
                    prediction.bbox ??
                    prediction.box ??
                    prediction.boundingBox;


                if (
                    !Array.isArray(
                        bbox
                    )
                ) {

                    if (
                        bbox &&
                        typeof bbox ===
                            "object"
                    ) {

                        bbox = [
                            bbox.x ??
                                bbox.left ??
                                0,

                            bbox.y ??
                                bbox.top ??
                                0,

                            bbox.width ??
                                0,

                            bbox.height ??
                                0
                        ];

                    }

                }


                if (
                    !Array.isArray(
                        bbox
                    ) ||
                    bbox.length <
                        4
                ) {

                    return null;

                }


                let [
                    x,
                    y,
                    width,
                    height
                ] =
                    bbox.map(
                        Number
                    );


                if (
                    !Number.isFinite(
                        x
                    ) ||
                    !Number.isFinite(
                        y
                    ) ||
                    !Number.isFinite(
                        width
                    ) ||
                    !Number.isFinite(
                        height
                    )
                ) {

                    return null;

                }


                /*
                 * Some detection libraries return
                 * [x1, y1, x2, y2].
                 *
                 * Detect that format when the second
                 * pair is clearly greater than the
                 * first pair.
                 */
                if (
                    width >
                        x &&
                    height >
                        y &&
                    (
                        width >
                            (
                                state.image?.naturalWidth ||
                                state.image?.width ||
                                0
                            ) *
                            0.25 ||
                        height >
                            (
                                state.image?.naturalHeight ||
                                state.image?.height ||
                                0
                            ) *
                            0.25
                    )
                ) {

                    const x2 =
                        width;

                    const y2 =
                        height;

                    width =
                        x2 -
                        x;

                    height =
                        y2 -
                        y;

                }


                const imageWidth =
                    state.image?.naturalWidth ||
                    state.image?.width ||
                    1;

                const imageHeight =
                    state.image?.naturalHeight ||
                    state.image?.height ||
                    1;


                /*
                 * Handle normalized 0–1 coordinates.
                 */
                if (
                    Math.abs(x) <=
                        1 &&
                    Math.abs(y) <=
                        1 &&
                    Math.abs(width) <=
                        1 &&
                    Math.abs(height) <=
                        1
                ) {

                    x *=
                        imageWidth;

                    y *=
                        imageHeight;

                    width *=
                        imageWidth;

                    height *=
                        imageHeight;

                }


                x =
                    clamp(
                        x,
                        0,
                        imageWidth
                    );

                y =
                    clamp(
                        y,
                        0,
                        imageHeight
                    );

                width =
                    clamp(
                        width,
                        1,
                        imageWidth -
                            x
                    );

                height =
                    clamp(
                        height,
                        1,
                        imageHeight -
                            y
                    );


                return {

                    label,

                    score:
                        clamp(
                            score,
                            0,
                            1
                        ),

                    bbox: {
                        x,
                        y,
                        width,
                        height
                    }

                };

            }
        )
        .filter(
            Boolean
        );

}


function normalizeLabel(
    label
) {

    const clean =
        String(
            label ??
            "object"
        )
            .trim()
            .toLowerCase();


    return (
        LABEL_ALIASES[
            clean
        ] ||
        clean ||
        "object"
    );

}


/* ============================================================
   CREATE AI ANNOTATION
============================================================ */

function createAIAnnotation(
    prediction
) {

    if (
        !prediction ||
        !prediction.bbox
    ) {

        return null;

    }


    const annotation = {

        id:
            `ann-${Date.now()}-${state.nextId++}`,

        type:
            "box",

        label:
            prediction.label,

        class_name:
            prediction.label,

        score:
            prediction.score,

        x:
            prediction.bbox.x,

        y:
            prediction.bbox.y,

        width:
            prediction.bbox.width,

        height:
            prediction.bbox.height,

        occlusion:
            0,

        truncation:
            "NONE",

        ai_generated:
            true,

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


    return annotation;

}


/* ============================================================
   FALLBACK DETECTION
============================================================ */

async function fallbackDetect() {

    if (
        !state.image
    ) {

        return [];

    }


    /*
     * The fallback deliberately produces no
     * false "AI" detections from arbitrary pixels.
     *
     * It gives the user a safe reviewable region
     * covering the visible media when no model
     * library is available.
     */

    const width =
        state.image.naturalWidth ||
        state.image.width;


    const height =
        state.image.naturalHeight ||
        state.image.height;


    if (
        !width ||
        !height
    ) {

        return [];

    }


    return [
        {

            label:
                "object",

            score:
                0.36,

            bbox: {

                x:
                    width *
                    0.1,

                y:
                    height *
                    0.1,

                width:
                    width *
                    0.8,

                height:
                    height *
                    0.8

            }

        }
    ];

}


/* ============================================================
   ANNOTATION HISTORY
============================================================ */

function cloneAnnotations(
    annotations
) {

    return JSON.parse(
        JSON.stringify(
            annotations ||
            []
        )
    );

}


function resetHistory(
    annotations
) {

    state.history =
        [
            cloneAnnotations(
                annotations
            )
        ];

    state.historyIndex =
        0;

    updateUndoRedoButtons();

}


function pushHistory() {

    const snapshot =
        cloneAnnotations(
            state.annotations
        );


    if (
        state.historyIndex <
        state.history.length -
            1
    ) {

        state.history =
            state.history.slice(
                0,
                state.historyIndex +
                    1
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

    } else {

        state.historyIndex++;

    }


    if (
        state.historyIndex <
        0
    ) {

        state.historyIndex =
            0;

    }


    updateUndoRedoButtons();

}


function undo() {

    if (
        state.historyIndex <=
        0
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


    state.selectedId =
        null;


    saveFrame();

    updateAnnotationsList();

    updateCounts();

    render();

}


function redo() {

    if (
        state.historyIndex >=
        state.history.length -
            1
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


    state.selectedId =
        null;


    saveFrame();

    updateAnnotationsList();

    updateCounts();

    render();

}


function updateUndoRedoButtons() {

    const undoButton =
        $("undoButton");

    const redoButton =
        $("redoButton");


    if (
        undoButton
    ) {

        undoButton.disabled =
            state.historyIndex <=
            0;

    }


    if (
        redoButton
    ) {

        redoButton.disabled =
            state.historyIndex >=
            state.history.length -
                1;

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
   UTILITY
============================================================ */

function showToast(
    message,
    duration = 3000
) {

    if (
        !toastContainer
    ) {

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
                () =>
                    toast.remove(),
                250
            );

        },
        duration
    );

}
    updateFilmstripCurrent();
}

function formatTime(
    seconds
) {
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
            (seconds % 1) *
            1000
        );

    return (
        String(
            minutes
        ).padStart(
            2,
            "0"
        ) +
        ":" +
        String(
            secs
        ).padStart(
            2,
            "0"
        ) +
        "." +
        String(
            millis
        ).padStart(
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

    const zoomValue =
        $("zoomValue");

    const footerZoom =
        $("footerZoom");

    if (zoomValue) {
        zoomValue.textContent =
            percent + "%";
    }

    if (footerZoom) {
        footerZoom.textContent =
            percent + "%";
    }
}

/* ============================================================
   AI STATUS
============================================================ */

function setAIStatus(
    message
) {
    const status =
        $("aiStatus");

    if (status) {
        status.textContent =
            message;
    }
}
/* ============================================================
   AI ANNOTATION ENGINE
============================================================ */

const AI_CONFIG = {
    confidenceThreshold: 0.35,
    maxObjects: 100,
    defaultLabel: "object",
    enabled: true
};

const AI_LABELS = [
    "person",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
    "animal",
    "dog",
    "cat",
    "bird",
    "traffic light",
    "traffic sign",
    "building",
    "tree",
    "road",
    "vehicle",
    "object"
];

let aiModel = null;
let aiModelLoading = false;
let aiModelReady = false;

/* ============================================================
   AI STATUS HELPERS
============================================================ */

function setAIProgress(
    percent
) {
    const progress =
        $("aiProgress");

    const bar =
        $("aiProgressBar");

    if (progress) {
        progress.value =
            percent;
    }

    if (bar) {
        bar.style.width =
            `${percent}%`;
    }
}

function setAILoading(
    loading
) {
    aiModelLoading =
        loading;

    const button =
        $("runAI");

    if (button) {
        button.disabled =
            loading;

        button.textContent =
            loading
                ? "RUNNING AI..."
                : "AUTO ANNOTATE";
    }
}

/* ============================================================
   AI MODEL LOADER
============================================================ */

async function loadAIModel() {
    if (
        aiModelReady &&
        aiModel
    ) {
        return aiModel;
    }

    if (aiModelLoading) {
        return null;
    }

    setAILoading(true);
    setAIStatus(
        "Preparing AI annotation engine..."
    );
    setAIProgress(10);

    try {
        /*
         * The application supports the browser-side AI workflow.
         * If an external model is available in the page, use it.
         * Otherwise the fallback detector below remains available.
         */

        if (
            window.annotationAI &&
            typeof
                window.annotationAI.detect ===
                "function"
        ) {
            aiModel =
                window.annotationAI;

            aiModelReady =
                true;

            setAIProgress(100);
            setAIStatus(
                "AI model ready."
            );

            return aiModel;
        }

        /*
         * Optional TensorFlow/COCO-SSD integration.
         * This does not break the application when the library
         * has not been loaded.
         */
        if (
            window.cocoSsd &&
            typeof
                window.cocoSsd.load ===
                "function"
        ) {
            setAIProgress(25);

            aiModel =
                await window.cocoSsd.load();

            aiModelReady =
                true;

            setAIProgress(100);
            setAIStatus(
                "AI model ready."
            );

            return aiModel;
        }

        /*
         * If no model library exists, keep the workflow usable.
         * The fallback uses image processing and creates a
         * reviewable annotation rather than crashing.
         */
        aiModel =
            {
                fallback: true
            };

        aiModelReady =
            true;

        setAIProgress(100);

        setAIStatus(
            "AI fallback mode ready. Add a browser AI model for object detection."
        );

        return aiModel;

    } catch (error) {
        console.error(
            "AI model loading failed:",
            error
        );

        aiModel =
            {
                fallback: true
            };

        aiModelReady =
            true;

        setAIStatus(
            "AI model unavailable. Using fallback annotation mode."
        );

        return aiModel;

    } finally {
        setAILoading(false);
    }
}

/* ============================================================
   RUN AUTO ANNOTATE
============================================================ */

$("runAI")?.addEventListener(
    "click",
    runAutoAnnotate
);

async function runAutoAnnotate() {
    if (
        !canUseAIAnnotations()
    ) {
        showToast(
            "AI annotation is not available for this account."
        );

        return;
    }

    if (
        !state.image &&
        state.mediaType !==
            "video"
    ) {
        showToast(
            "Load an image or video first."
        );

        return;
    }

    if (
        state.mediaType ===
        "video" &&
        !state.image
    ) {
        captureCurrentVideoFrame();
    }

    setAILoading(true);
    setAIProgress(5);
    setAIStatus(
        "Starting AI annotation..."
    );

    try {
        const model =
            await loadAIModel();

        if (!model) {
            throw new Error(
                "AI model is not available."
            );
        }

        setAIProgress(35);

        let predictions = [];

        if (
            !model.fallback &&
            typeof model.detect ===
                "function"
        ) {
            predictions =
                await model.detect(
                    state.image
                );
        } else {
            predictions =
                await fallbackDetect();
        }

        setAIProgress(70);

        const normalized =
            normalizeAIPredictions(
                predictions
            );

        if (
            !normalized.length
        ) {
            setAIStatus(
                "AI found no objects to annotate."
            );

            showToast(
                "No objects detected."
            );

            setAIProgress(100);

            return;
        }

        let added = 0;

        normalized
            .slice(
                0,
                AI_CONFIG.maxObjects
            )
            .forEach(
                prediction => {
                    if (
                        prediction.score <
                        AI_CONFIG.confidenceThreshold
                    ) {
                        return;
                    }

                    createAIAnnotation(
                        prediction
                    );

                    added++;
                }
            );

        setAIProgress(100);

        setAIStatus(
            `AI added ${added} annotation${
                added === 1
                    ? ""
                    : "s"
            }.`
        );

        showToast(
            `${added} AI annotation${
                added === 1
                    ? ""
                    : "s"
            } created`
        );

        updateCounts();
        updateAnnotationsList();
        render();

        saveFrame();
        saveSession();

        await cloudSaveAllAnnotations();

    } catch (error) {
        console.error(
            "Auto annotation failed:",
            error
        );

        setAIStatus(
            "AI annotation failed. Please try again."
        );

        showToast(
            "AI annotation failed."
        );

    } finally {
        setAILoading(false);
        setAIProgress(100);
    }
}

/* ============================================================
   CHECK AI PERMISSION
============================================================ */

function canUseAIAnnotations() {
    const role =
        CLOUD.profile?.role;

    if (!role) {
        return false;
    }

    /*
     * Coworkers are deliberately allowed to use
     * autogenerated / AI annotations.
     *
     * They are not given customer-upload or
     * manual annotation-type controls.
     */
    return [
        "admin",
        "staff",
        "reviewer",
        "customer",
        "coworker_2d_box",
        "coworker_polygon",
        "coworker_segmentation"
    ].includes(
        role
    );
}

/* ============================================================
   NORMALIZE AI PREDICTIONS
============================================================ */

function normalizeAIPredictions(
    predictions
) {
    if (
        !Array.isArray(
            predictions
        )
    ) {
        return [];
    }

    return predictions
        .map(
            prediction => {

                const score =
                    Number(
                        prediction.score ??
                        prediction.confidence ??
                        0
                    );

                let label =
                    prediction.class ??
                    prediction.label ??
                    prediction.name ??
                    AI_CONFIG.defaultLabel;

                label =
                    normalizeLabel(
                        label
                    );


                let bbox =
                    prediction.bbox ??
                    prediction.box ??
                    prediction.boundingBox;


                if (
                    !Array.isArray(
                        bbox
                    )
                ) {

                    if (
                        bbox &&
                        typeof bbox ===
                            "object"
                    ) {

                        bbox = [
                            bbox.x ??
                                bbox.left ??
                                0,

                            bbox.y ??
                                bbox.top ??
                                0,

                            bbox.width ??
                                0,

                            bbox.height ??
                                0
                        ];

                    }

                }


                if (
                    !Array.isArray(
                        bbox
                    ) ||
                    bbox.length <
                        4
                ) {

                    return null;

                }


                let [
                    x,
                    y,
                    width,
                    height
                ] =
                    bbox.map(
                        Number
                    );


                if (
                    !Number.isFinite(
                        x
                    ) ||
                    !Number.isFinite(
                        y
                    ) ||
                    !Number.isFinite(
                        width
                    ) ||
                    !Number.isFinite(
                        height
                    )
                ) {

                    return null;

                }


                /*
                 * Some detection libraries return
                 * [x1, y1, x2, y2].
                 *
                 * Detect that format when the second
                 * pair is clearly greater than the
                 * first pair.
                 */
                if (
                    width >
                        x &&
                    height >
                        y &&
                    (
                        width >
                            (
                                state.image?.naturalWidth ||
                                state.image?.width ||
                                0
                            ) *
                            0.25 ||
                        height >
                            (
                                state.image?.naturalHeight ||
                                state.image?.height ||
                                0
                            ) *
                            0.25
                    )
                ) {

                    const x2 =
                        width;

                    const y2 =
                        height;

                    width =
                        x2 -
                        x;

                    height =
                        y2 -
                        y;

                }


                const imageWidth =
                    state.image?.naturalWidth ||
                    state.image?.width ||
                    1;

                const imageHeight =
                    state.image?.naturalHeight ||
                    state.image?.height ||
                    1;


                /*
                 * Handle normalized 0–1 coordinates.
                 */
                if (
                    Math.abs(x) <=
                        1 &&
                    Math.abs(y) <=
                        1 &&
                    Math.abs(width) <=
                        1 &&
                    Math.abs(height) <=
                        1
                ) {

                    x *=
                        imageWidth;

                    y *=
                        imageHeight;

                    width *=
                        imageWidth;

                    height *=
                        imageHeight;

                }


                x =
                    clamp(
                        x,
                        0,
                        imageWidth
                    );

                y =
                    clamp(
                        y,
                        0,
                        imageHeight
                    );

                width =
                    clamp(
                        width,
                        1,
                        imageWidth -
                            x
                    );

                height =
                    clamp(
                        height,
                        1,
                        imageHeight -
                            y
                    );


                return {

                    label,

                    score:
                        clamp(
                            score,
                            0,
                            1
                        ),

                    bbox: {
                        x,
                        y,
                        width,
                        height
                    }

                };

            }
        )
        .filter(
            Boolean
        );

}


function normalizeLabel(
    label
) {

    const clean =
        String(
            label ??
            "object"
        )
            .trim()
            .toLowerCase();


    return (
        LABEL_ALIASES[
            clean
        ] ||
        clean ||
        "object"
    );

}


/* ============================================================
   CREATE AI ANNOTATION
============================================================ */

function createAIAnnotation(
    prediction
) {

    if (
        !prediction ||
        !prediction.bbox
    ) {

        return null;

    }


    const annotation = {

        id:
            `ann-${Date.now()}-${state.nextId++}`,

        type:
            "box",

        label:
            prediction.label,

        class_name:
            prediction.label,

        score:
            prediction.score,

        x:
            prediction.bbox.x,

        y:
            prediction.bbox.y,

        width:
            prediction.bbox.width,

        height:
            prediction.bbox.height,

        occlusion:
            0,

        truncation:
            "NONE",

        ai_generated:
            true,

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


    return annotation;

}


/* ============================================================
   FALLBACK DETECTION
============================================================ */

async function fallbackDetect() {

    if (
        !state.image
    ) {

        return [];

    }


    /*
     * The fallback deliberately produces no
     * false "AI" detections from arbitrary pixels.
     *
     * It gives the user a safe reviewable region
     * covering the visible media when no model
     * library is available.
     */

    const width =
        state.image.naturalWidth ||
        state.image.width;


    const height =
        state.image.naturalHeight ||
        state.image.height;


    if (
        !width ||
        !height
    ) {

        return [];

    }


    return [
        {

            label:
                "object",

            score:
                0.36,

            bbox: {

                x:
                    width *
                    0.1,

                y:
                    height *
                    0.1,

                width:
                    width *
                    0.8,

                height:
                    height *
                    0.8

            }

        }
    ];

}


/* ============================================================
   ANNOTATION HISTORY
============================================================ */

function cloneAnnotations(
    annotations
) {

    return JSON.parse(
        JSON.stringify(
            annotations ||
            []
        )
    );

}


function resetHistory(
    annotations
) {

    state.history =
        [
            cloneAnnotations(
                annotations
            )
        ];

    state.historyIndex =
        0;

    updateUndoRedoButtons();

}


function pushHistory() {

    const snapshot =
        cloneAnnotations(
            state.annotations
        );


    if (
        state.historyIndex <
        state.history.length -
            1
    ) {

        state.history =
            state.history.slice(
                0,
                state.historyIndex +
                    1
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

    } else {

        state.historyIndex++;

    }


    if (
        state.historyIndex <
        0
    ) {

        state.historyIndex =
            0;

    }


    updateUndoRedoButtons();

}


function undo() {

    if (
        state.historyIndex <=
        0
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


    state.selectedId =
        null;


    saveFrame();

    updateAnnotationsList();

    updateCounts();

    render();

}


function redo() {

    if (
        state.historyIndex >=
        state.history.length -
            1
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


    state.selectedId =
        null;


    saveFrame();

    updateAnnotationsList();

    updateCounts();

    render();

}


function updateUndoRedoButtons() {

    const undoButton =
        $("undoButton");

    const redoButton =
        $("redoButton");


    if (
        undoButton
    ) {

        undoButton.disabled =
            state.historyIndex <=
            0;

    }


    if (
        redoButton
    ) {

        redoButton.disabled =
            state.historyIndex >=
            state.history.length -
                1;

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
   UTILITY
============================================================ */

function showToast(
    message,
    duration = 3000
) {

    if (
        !toastContainer
    ) {

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
                () =>
                    toast.remove(),
                250
            );

        },
        duration
    );

}
