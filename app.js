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


            const file =
                event.target.files &&
                event.target.files[0];


            if (!file) {
                return;
            }


            try {

                await loadCustomerMedia(
                    file
                );

            } catch (
                error
            ) {

                console.error(
                    error
                );

                alert(
                    "Could not load this media file.\n\n" +
                    error.message
                );

            }

        }
    );

}


/* ============================================================
   CUSTOMER MEDIA
============================================================ */

async function loadCustomerMedia(
    file
) {

    cleanupMedia();


    state.mediaType =
        file.type.startsWith(
            "video/"
        )
            ? "video"
            : "image";


    if ($("fileName")) {

        $("fileName")
            .textContent =
            file.name;

    }


    if ($("mediaInfo")) {

        $("mediaInfo")
            .textContent =
            `${file.type || "media"} • ${formatMB(file.size)} MB`;

    }


    if (emptyWorkspace) {

        emptyWorkspace.style.display =
            "none";

    }


    if ($("allFramesRow")) {

        $("allFramesRow")
            .style.display =
            state.mediaType ===
            "video"
                ? "flex"
                : "none";

    }


    if (filmstripBar) {

        filmstripBar.style.display =
            state.mediaType ===
            "video"
                ? "flex"
                : "none";

    }


    if (
        state.mediaType ===
        "image"
    ) {

        await loadImageFile(
            file
        );

    } else {

        await loadVideoFile(
            file
        );

    }


    fitView();

    render();

    saveSession();

}


/* ============================================================
   IMAGE
============================================================ */

function loadImageFile(
    file
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const url =
                URL.createObjectURL(
                    file
                );


            const image =
                new Image();


            image.onload = () => {

                state.image =
                    image;

                state.imageURL =
                    url;

                state.annotations =
                    [];

                state.selectedId =
                    null;


                resetHistory(
                    state.annotations
                );


                updateCounts();

                hidePopup();

                updateAnnotationsList();


                resolve();

            };


            image.onerror = () => {

                URL.revokeObjectURL(
                    url
                );

                reject(
                    new Error(
                        "The image could not be decoded."
                    )
                );

            };


            image.src =
                url;

        }
    );

}


/* ============================================================
   VIDEO
============================================================ */

function loadVideoFile(
    file
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const url =
                URL.createObjectURL(
                    file
                );


            state.videoURL =
                url;


            if (!sourceVideo) {

                reject(
                    new Error(
                        "Video element is missing from index.html."
                    )
                );

                return;

            }


            sourceVideo.src =
                url;

            sourceVideo.load();


            sourceVideo.onloadedmetadata =
                () => {

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


                    if (
                        $("videoControlsPanel")
                    ) {

                        $("videoControlsPanel")
                            .style.display =
                            "block";

                    }


                    if (
                        $("totalFrames")
                    ) {

                        $("totalFrames")
                            .textContent =
                            state.totalFrames;

                    }


                    if (
                        $("frameSlider")
                    ) {

                        $("frameSlider")
                            .max =
                            state.totalFrames -
                            1;

                    }


                    state.currentFrame =
                        0;


                    if (
                        state.pendingVideoRestore &&
                        state.pendingVideoRestore.fileName ===
                        file.name
                    ) {

                        state.frameAnnotations =
                            new Map(
                                state
                                    .pendingVideoRestore
                                    .frameAnnotations ||
                                []
                            );


                        state.pendingVideoRestore =
                            null;


                        if (
                            $("sessionBanner")
                        ) {

                            $("sessionBanner")
                                .style.display =
                                "none";

                        }


                        showToast(
                            "Video annotations restored"
                        );

                    }


                    buildFilmstrip();


                    seekVideoFrame(
                        0
                    ).then(
                        resolve
                    );

                };


            sourceVideo.onerror =
                () => {

                    reject(
                        new Error(
                            "The video could not be loaded by the browser."
                        )
                    );

                };

        }
    );

}


/* ============================================================
   VIDEO FRAME SEEK
============================================================ */

async function seekVideoFrame(
    frame
) {

    if (
        state.mediaType !==
        "video"
    ) {

        return;

    }


    frame =
        Math.max(
            0,
            Math.min(
                state.totalFrames -
                1,
                Math.round(
                    frame
                )
            )
        );


    state.currentFrame =
        frame;


    const time =
        Math.min(
            state.videoDuration,
            frame /
                state.fps
        );


    state.currentTime =
        time;


    updateVideoUI();


    await seekVideoTime(
        time
    );


    await captureVideoFrame();


    loadFrameAnnotations();


    fitView();


    render();

}


/* ============================================================
   VIDEO TIME
============================================================ */

function seekVideoTime(
    time
) {

    return new Promise(
        resolve => {

            if (!sourceVideo) {

                resolve();

                return;

            }


            state.videoSeeking =
                true;


            const done = () => {

                sourceVideo
                    .removeEventListener(
                        "seeked",
                        done
                    );


                state.videoSeeking =
                    false;


                resolve();

            };


            sourceVideo
                .addEventListener(
                    "seeked",
                    done
                );


            sourceVideo.currentTime =
                time;

        }
    );

}


/* ============================================================
   CAPTURE VIDEO FRAME
============================================================ */

async function captureVideoFrame() {

    if (
        !sourceVideo ||
        !sourceVideo.videoWidth ||
        !sourceVideo.videoHeight
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

        const frameCanvas =
            document.createElement(
                "canvas"
            );


        frameCanvas.width =
            sourceVideo.videoWidth;

        frameCanvas.height =
            sourceVideo.videoHeight;


        const frameContext =
            frameCanvas.getContext(
                "2d"
            );


        frameContext.drawImage(
            sourceVideo,
            0,
            0,
            frameCanvas.width,
            frameCanvas.height
        );


        const image =
            new Image();


        await new Promise(
            resolve => {

                image.onload =
                    resolve;


                image.src =
                    frameCanvas.toDataURL(
                        "image/jpeg",
                        0.92
                    );

            }
        );


        state.image =
            image;


        state.currentTime =
            sourceVideo.currentTime;


    } finally {

        state.frameCaptureBusy =
            false;

    }

}


/* ============================================================
   CANVAS
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


    const dpr =
        window.devicePixelRatio ||
        1;


    canvas.width =
        Math.max(
            1,
            Math.floor(
                rect.width *
                dpr
            )
        );


    canvas.height =
        Math.max(
            1,
            Math.floor(
                rect.height *
                dpr
            )
        );


    canvas.style.width =
        rect.width +
        "px";


    canvas.style.height =
        rect.height +
        "px";


    if (ctx) {

        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

    }


    render();

}


/* ============================================================
   CLEAR CANVAS
============================================================ */

function clearCanvas(
    width,
    height
) {

    if (!ctx) {
        return;
    }


    ctx.clearRect(
        0,
        0,
        width,
        height
    );

}


/* ============================================================
   IMAGE / SCREEN COORDINATES
============================================================ */

function imageToScreen(
    x,
    y
) {

    return {

        x:
            x *
            state.scale +
            state.offsetX,

        y:
            y *
            state.scale +
            state.offsetY

    };

}


function screenToImage(
    x,
    y
) {

    return {

        x:
            (x -
                state.offsetX) /
            state.scale,

        y:
            (y -
                state.offsetY) /
            state.scale

    };

}


/* ============================================================
   FIT VIEW
============================================================ */

function fitView() {

    if (
        !state.image &&
        state.mediaType !==
        "video"
    ) {

        return;

    }


    if (!workspace) {
        return;
    }


    const rect =
        workspace.getBoundingClientRect();


    let width;

    let height;


    if (
        state.mediaType ===
            "video" &&
        sourceVideo &&
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
        (rect.width - 40) /
        width;


    const sy =
        (rect.height - 40) /
        height;


    state.scale =
        Math.max(
            state.minScale,
            Math.min(
                state.maxScale,
                Math.min(
                    sx,
                    sy
                )
            )
        );


    state.offsetX =
        (
            rect.width -
            width *
                state.scale
        ) /
        2;


    state.offsetY =
        (
            rect.height -
            height *
                state.scale
        ) /
        2;


    updateZoomUI();

    render();

}


/* ============================================================
   FIT BUTTON
============================================================ */

$("fitView")?.addEventListener(
    "click",
    fitView
);


/* ============================================================
   RESET VIEW
============================================================ */

$("resetView")?.addEventListener(
    "click",
    () => {

        state.scale =
            1;

        state.offsetX =
            0;

        state.offsetY =
            0;


        updateZoomUI();

        render();

    }
);


/* ============================================================
   ZOOM BUTTONS
============================================================ */

$("zoomIn")?.addEventListener(
    "click",
    () =>
        zoomCenter(
            1.20
        )
);


$("zoomOut")?.addEventListener(
    "click",
    () =>
        zoomCenter(
            1 / 1.20
        )
);


function zoomCenter(
    factor
) {

    if (!workspace) {
        return;
    }


    const rect =
        workspace.getBoundingClientRect();


    zoomAt(
        factor,
        rect.width / 2,
        rect.height / 2
    );

}


/* ============================================================
   ZOOM WITH MOUSE
============================================================ */

workspace?.addEventListener(
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


        zoomAt(
            factor,
            x,
            y
        );

    },
    {
        passive: false
    }
);


/* ============================================================
   ZOOM AT POINT
============================================================ */

function zoomAt(
    factor,
    x,
    y
) {

    const imagePoint =
        screenToImage(
            x,
            y
        );


    state.scale =
        Math.max(
            state.minScale,
            Math.min(
                state.maxScale,
                state.scale *
                    factor
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
   MAXIMIZE WORKSPACE
============================================================ */

$("maximizeWorkspace")?.addEventListener(
    "click",
    toggleFullscreen
);


function toggleFullscreen() {

    if (
        !document.fullscreenElement
    ) {

        workspaceRoot
            ?.requestFullscreen?.()
            .catch(
                () => {}
            );

    } else {

        document
            .exitFullscreen?.();

    }

}


/* ============================================================
   FULLSCREEN CHANGE
============================================================ */

document.addEventListener(
    "fullscreenchange",
    () => {

        const active =
            document.fullscreenElement ===
            workspaceRoot;


        const button =
            $("maximizeWorkspace");


        if (button) {

            button.textContent =
                active
                    ? "⤢"
                    : "⛶";


            button.classList.toggle(
                "active",
                active
            );

        }


        setTimeout(
            resizeCanvas,
            50
        );

    }
);


/* ============================================================
   RIGHT PANEL
============================================================ */

$("toggleRightPanel")?.addEventListener(
    "click",
    toggleRightPanelVisibility
);


$("closeRightPanel")?.addEventListener(
    "click",
    closeRightPanelFn
);


$("reopenRightPanel")?.addEventListener(
    "click",
    openRightPanelFn
);


function toggleRightPanelVisibility() {

    state.rightPanelOpen
        ? closeRightPanelFn()
        : openRightPanelFn();

}


function closeRightPanelFn() {

    state.rightPanelOpen =
        false;


    appEl?.classList.add(
        "panel-collapsed"
    );


    const button =
        $("reopenRightPanel");


    if (button) {

        button.style.display =
            "block";

    }


    setTimeout(
        resizeCanvas,
        50
    );

}


function openRightPanelFn() {

    state.rightPanelOpen =
        true;


    appEl?.classList.remove(
        "panel-collapsed"
    );


    const button =
        $("reopenRightPanel");


    if (button) {

        button.style.display =
            "none";

    }


    setTimeout(
        resizeCanvas,
        50
    );

}


/* ============================================================
   POINTER EVENTS
============================================================ */

canvas?.addEventListener(
    "pointerdown",
    pointerDown
);


canvas?.addEventListener(
    "pointermove",
    pointerMove
);


canvas?.addEventListener(
    "pointerup",
    pointerUp
);


canvas?.addEventListener(
    "pointercancel",
    pointerUp
);


canvas?.addEventListener(
    "dblclick",
    doubleClick
);


/* ============================================================
   POINTER POSITION
============================================================ */

function pointerPosition(
    event
) {

    if (!canvas) {

        return {
            x: 0,
            y: 0
        };

    }


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


/* ============================================================
   POINTER DOWN
============================================================ */

function pointerDown(
    event
) {

    const p =
        pointerPosition(
            event
        );


    try {

        canvas.setPointerCapture(
            event.pointerId
        );

    } catch {}


    state.pointerDown =
        true;


    if (
        state.mode ===
            "pan" ||
        event.button === 1 ||
        event.shiftKey ||
        state.spacePan
    ) {

        state.panning =
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


    if (
        state.mode ===
        "select"
    ) {

        const hit =
            hitTest(
                p.x,
                p.y
            );


        if (hit) {

            state.selectedId =
                hit.id;


            state.resizeHandle =
                hit.handle ||
                null;


            const imagePoint =
                screenToImage(
                    p.x,
                    p.y
                );


            state.dragStartImage =
                imagePoint;


            state.dragLastImage =
                imagePoint;


            state.dragging =
                true;


            updateSelected();

        } else {

            state.selectedId =
                null;


            updateSelected();

        }


        render();

        return;

    }


    if (
        state.mode ===
        "erase"
    ) {

        const hit =
            hitTest(
                p.x,
                p.y
            );


        if (hit) {

            state.selectedId =
                hit.id;


            deleteSelected();

        }


        return;

    }


    if (
        state.mode ===
        "draw"
    ) {

        if (
            state.annotationType ===
            "box"
        ) {

            beginDrawing(
                p.x,
                p.y
            );

        } else {

            addPolygonPoint(
                p.x,
                p.y
            );

        }

    }

}


/* ============================================================
   POINTER MOVE
============================================================ */

function pointerMove(
    event
) {

    const p =
        pointerPosition(
            event
        );


    if (
        state.panning
    ) {

        const dx =
            p.x -
            state.panStart.x;


        const dy =
            p.y -
            state.panStart.y;


        state.offsetX =
            state.panStart.offsetX +
            dx;


        state.offsetY =
            state.panStart.offsetY +
            dy;


        render();

        return;

    }


    if (
        state.mode ===
            "select" &&
        state.dragging &&
        state.selectedId
    ) {

        const a =
            getSelected();


        if (!a) {
            return;
        }


        const current =
            screenToImage(
                p.x,
                p.y
            );


        const last =
            state.dragLastImage;


        if (
            state.resizeHandle &&
            a.type ===
                "box"
        ) {

            resizeBox(
                a,
                state.resizeHandle,
                current
            );

        } else {

            const dx =
                current.x -
                last.x;


            const dy =
                current.y -
                last.y;


            moveAnnotation(
                a,
                dx,
                dy
            );

        }


        state.dragLastImage =
            current;


        a.corrected =
            true;


        saveFrame();

        render();

        renderPopupBody(
            a
        );

        updateAnnotationsList();

        return;

    }


    if (
        state.mode ===
            "draw" &&
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


/* ============================================================
   POINTER UP
============================================================ */

function pointerUp() {

    const wasDraggingAnnotation =
        state.mode ===
            "select" &&
        state.dragging &&
        state.selectedId;


    if (
        state.mode ===
            "draw" &&
        state.drawing &&
        state.annotationType ===
            "box"
    ) {

        finishBoxDrawing();

    }


    if (
        wasDraggingAnnotation
    ) {

        saveFrame();

        pushHistory();

        saveSession();

    }


    state.pointerDown =
        false;


    state.dragging =
        false;


    state.panning =
        false;


    state.resizeHandle =
        null;


    updateCursor();

}


/* ============================================================
   BOX DRAWING
============================================================ */

function beginDrawing(
    x,
    y
) {

    const point =
        screenToImage(
            x,
            y
        );


    state.drawing =
        true;


    state.drawStart =
        point;


    state.drawCurrent =
        point;


    render();

}


function finishBoxDrawing() {

    if (
        !state.drawing ||
        !state.drawStart ||
        !state.drawCurrent
    ) {

        state.drawing =
            false;

        return;

    }


    const start =
        state.drawStart;


    const end =
        state.drawCurrent;


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


    state.drawing =
        false;


    state.drawStart =
        null;


    state.drawCurrent =
        null;


    if (
        width < 3 ||
        height < 3
    ) {

        render();

        return;

    }


    const annotation =
        createAnnotation({

            type:
                "box",

            x,

            y,

            width,

            height,

            className:
                "object",

            score:
                1,

            occlusion:
                "none",

            truncation:
                "none",

            ai_generated:
                false,

            corrected:
                true

        });


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

}


/* ============================================================
   POLYGON POINT
============================================================ */

function addPolygonPoint(
    x,
    y
) {

    const point =
        screenToImage(
            x,
            y
        );


    if (
        !state.drawing
    ) {

        state.drawing =
            true;

        state.polygonPoints =
            [point];

    } else {

        state.polygonPoints.push(
            point
        );

    }


    render();

}


/* ============================================================
   DOUBLE CLICK
============================================================ */

function doubleClick(
    event
) {

    if (
        state.mode ===
            "draw" &&
        (
            state.annotationType ===
                "polygon" ||
            state.annotationType ===
                "segmentation"
        )
    ) {

        finishPolygon();

        return;

    }


    const p =
        pointerPosition(
            event
        );


    const hit =
        hitTest(
            p.x,
            p.y
        );


    if (hit) {

        state.selectedId =
            hit.id;


        showAnnotationPopup(
            hit.annotation ||
            getSelected()
        );

    }

}


/* ============================================================
   FINISH POLYGON
============================================================ */

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


    const points =
        state.polygonPoints
            .map(
                point => ({
                    x:
                        point.x,

                    y:
                        point.y
                })
            );


    const xs =
        points.map(
            point =>
                point.x
        );


    const ys =
        points.map(
            point =>
                point.y
        );


    const minX =
        Math.min(
            ...xs
        );


    const minY =
        Math.min(
            ...ys
        );


    const maxX =
        Math.max(
            ...xs
        );


    const maxY =
        Math.max(
            ...ys
        );


    const annotation =
        createAnnotation({

            type:
                state.annotationType,

            x:
                minX,

            y:
                minY,

            width:
                maxX -
                minX,

            height:
                maxY -
                minY,

            points,

            className:
                "object",

            score:
                1,

            occlusion:
                "none",

            truncation:
                "none",

            ai_generated:
                false,

            corrected:
                true

        });


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

    saveFrame();

    updateCounts();

    updateAnnotationsList();

    render();

}


/* ============================================================
   KEYBOARD
============================================================ */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.code ===
            "Space" &&
            !event.repeat
        ) {

            state.spacePan =
                true;

            updateCursor();

        }


        if (
            event.key ===
            "Escape"
        ) {

            if (
                state.drawing
            ) {

                state.drawing =
                    false;

                state.polygonPoints =
                    [];

                state.drawStart =
                    null;

                state.drawCurrent =
                    null;

                render();

            }


            hidePopup();

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


document.addEventListener(
    "keyup",
    event => {

        if (
            event.code ===
            "Space"
        ) {

            state.spacePan =
                false;

            updateCursor();

        }

    }
);


/* ============================================================
   CURSOR
============================================================ */

function updateCursor() {

    if (!canvas) {
        return;
    }


    if (
        state.panning ||
        state.mode ===
            "pan" ||
        state.spacePan
    ) {

        canvas.style.cursor =
            "grab";

        return;

    }


    if (
        state.mode ===
        "draw"
    ) {

        canvas.style.cursor =
            "crosshair";

        return;

    }


    if (
        state.mode ===
        "erase"
    ) {

        canvas.style.cursor =
            "not-allowed";

        return;

    }


    canvas.style.cursor =
        "default";

}


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


    clearCanvas(
        rect.width,
        rect.height
    );


    if (
        !state.image
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


    try {

        ctx.drawImage(
            state.image,
            0,
            0
        );

    } catch (
        error
    ) {

        console.warn(
            "Could not render image:",
            error
        );

    }


    drawAnnotations();


    if (
        state.drawing &&
        state.annotationType ===
            "box" &&
        state.drawStart &&
        state.drawCurrent
    ) {

        drawTemporaryBox();

    }


    if (
        state.drawing &&
        (
            state.annotationType ===
                "polygon" ||
            state.annotationType ===
                "segmentation"
        )
    ) {

        drawTemporaryPolygon();

    }


    ctx.restore();

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
            ? data.points.map(
                p => ({
                    x: p.x,
                    y: p.y
                })
            )
            : undefined,

        label:
            data.label ||
            "unknown",

        score:
            data.score ??
            null,

        occlusion:
            Number(
                data.occlusion ??
                0
            ),

        truncation:
            data.truncation ||
            "NONE",

        aiGenerated:
            !!data.aiGenerated,

        corrected:
            !!data.corrected,

        export:
            data.export !== false
    };

    state.annotations.push(
        annotation
    );

    state.selectedId =
        annotation.id;

    updateSelected();
    updateAnnotationsList();
    updateCounts();

    pushHistory();
    saveFrame();
    saveSession();

    cloudSaveAnnotation(
        annotation
    );

    return annotation;
}

/* ============================================================
   ANNOTATION SELECTION
============================================================ */

function getSelected() {
    return state.annotations.find(
        a =>
            a.id ===
            state.selectedId
    ) || null;
}

function updateSelected() {
    updateAnnotationsList();

    const selected =
        getSelected();

    if (selected) {
        renderPopup(
            selected
        );
    } else {
        hidePopup();
    }

    render();
}

/* ============================================================
   HIT TESTING
============================================================ */

function hitTest(
    screenX,
    screenY
) {
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

        if (
            a.type === "box"
        ) {
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

function getResizeHandle(
    a,
    p
) {
    if (
        a.type !== "box"
    ) {
        return null;
    }

    const threshold =
        8 / state.scale;

    const left =
        a.x;

    const right =
        a.x + a.width;

    const top =
        a.y;

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
    ) {
        return "nw";
    }

    if (
        nearRight &&
        nearTop
    ) {
        return "ne";
    }

    if (
        nearLeft &&
        nearBottom
    ) {
        return "sw";
    }

    if (
        nearRight &&
        nearBottom
    ) {
        return "se";
    }

    if (nearTop) {
        return "n";
    }

    if (nearBottom) {
        return "s";
    }

    if (nearLeft) {
        return "w";
    }

    if (nearRight) {
        return "e";
    }

    return null;
}

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
                (yi > point.y) !==
                (yj > point.y)
            ) &&
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
    } else if (
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

function resizeBox(
    a,
    handle,
    point
) {
    const oldRight =
        a.x + a.width;

    const oldBottom =
        a.y + a.height;

    let left =
        a.x;

    let right =
        oldRight;

    let top =
        a.y;

    let bottom =
        oldBottom;

    if (
        handle.includes("w")
    ) {
        left =
            point.x;
    }

    if (
        handle.includes("e")
    ) {
        right =
            point.x;
    }

    if (
        handle.includes("n")
    ) {
        top =
            point.y;
    }

    if (
        handle.includes("s")
    ) {
        bottom =
            point.y;
    }

    if (
        right < left
    ) {
        [
            left,
            right
        ] =
            [
                right,
                left
            ];
    }

    if (
        bottom < top
    ) {
        [
            top,
            bottom
        ] =
            [
                bottom,
                top
            ];
    }

    a.x =
        left;

    a.y =
        top;

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

$("deleteAnnotation")?.addEventListener(
    "click",
    deleteSelected
);

function deleteSelected() {
    if (
        !state.selectedId
    ) {
        return;
    }

    const id =
        state.selectedId;

    const index =
        state.annotations.findIndex(
            a =>
                a.id === id
        );

    if (
        index === -1
    ) {
        return;
    }

    state.annotations.splice(
        index,
        1
    );

    state.selectedId =
        null;

    updateSelected();
    updateCounts();

    pushHistory();
    saveFrame();
    saveSession();

    cloudDeleteAnnotation(
        id
    );

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
        state.mediaType ===
            "video" &&
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
        a.id ===
        state.selectedId;

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

    if (
        a.type === "box"
    ) {
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
        `${a.label || "unknown"}${
            a.score != null
                ? ` ${(a.score * 100).toFixed(0)}%`
                : ""
        }`;

    const fontSize =
        Math.max(
            10 / state.scale,
            12 / state.scale
        );

    ctx.font =
        `bold ${fontSize}px Arial`;

    const metrics =
        ctx.measureText(
            text
        );

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
        a.label ||
            "unknown",
        p.x,
        p.y
    );
}

function drawResizeHandles(a) {
    const size =
        5 / state.scale;

    const points = [
        [
            a.x,
            a.y
        ],
        [
            a.x + a.width,
            a.y
        ],
        [
            a.x,
            a.y + a.height
        ],
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
    if (
        !state.drawing
    ) {
        return;
    }

    ctx.save();

    ctx.strokeStyle =
        "#a78bfa";

    ctx.fillStyle =
        "rgba(167,139,250,.12)";

    ctx.lineWidth =
        2;

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
                    index === 0
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

function cloneAnnotations(
    annotations
) {
    return annotations.map(
        a => ({
            ...a,

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

function resetHistory(
    annotations
) {
    state.history = [
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
        state.history.length >
        100
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

    state.selectedId =
        null;

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

    state.selectedId =
        null;

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
        a.label ||
        "Annotation";

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

    if (
        a.type === "box"
    ) {
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

        x =
            p.x + 15;

        y =
            p.y;
    } else {
        x = 20;
        y = 20;
    }

    const rect =
        workspace.getBoundingClientRect();

    const popupWidth =
        popupEl.offsetWidth ||
        220;

    const popupHeight =
        popupEl.offsetHeight ||
        200;

    x =
        Math.max(
            5,
            Math.min(
                x,
                rect.width -
                    popupWidth -
                    5
            )
        );

    y =
        Math.max(
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
            <span class="ann-chip">
                ${escapeHTML(a.type)}
            </span>

            <span class="ann-chip">
                Occlusion
                ${Number(a.occlusion ?? 0)}%
            </span>

            <span class="ann-chip">
                Truncation
                ${escapeHTML(
                    a.truncation ||
                    "NONE"
                )}
            </span>

            ${
                a.aiGenerated
                    ? `<span class="ann-chip">AI</span>`
                    : ""
            }

            ${
                a.corrected
                    ? `<span class="ann-chip">Corrected</span>`
                    : ""
            }
        </div>

        <div class="class-field">
            <label>
                Classification / Class
            </label>

            <input
                id="popupClassInput"
                value="${escapeHTML(
                    a.label ||
                    "unknown"
                )}"
                placeholder="Object class"
            >
        </div>

        <div class="class-field">
            <label>
                Occlusion
            </label>

            <select id="popupOcclusion">
                ${
                    [
                        0,
                        10,
                        20,
                        30,
                        40,
                        50,
                        60,
                        70,
                        80,
                        90,
                        100
                    ]
                        .map(
                            v =>
                                `<option value="${v}" ${
                                    Number(
                                        a.occlusion ??
                                        0
                                    ) === v
                                        ? "selected"
                                        : ""
                                }>${v}%</option>`
                        )
                        .join("")
                }
            </select>
        </div>

        <div class="class-field">
            <label>
                Truncation
            </label>

            <select id="popupTruncation">
                ${
                    [
                        "NONE",
                        "LEFT",
                        "RIGHT",
                        "TOP",
                        "BOTTOM",
                        "MULTIPLE"
                    ]
                        .map(
                            v =>
                                `<option value="${v}" ${
                                    a.truncation ===
                                    v
                                        ? "selected"
                                        : ""
                                }>${v}</option>`
                        )
                        .join("")
                }
            </select>
        </div>

        <label class="checkbox-row">
            <input
                id="popupExport"
                type="checkbox"
                ${
                    a.export !== false
                        ? "checked"
                        : ""
                }
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

    occlusion?.addEventListener(
        "change",
        () => {
            a.occlusion =
                Number(
                    occlusion.value
                );

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

    truncation?.addEventListener(
        "change",
        () => {
            a.truncation =
                truncation.value;

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
                const bbox =
                    prediction.bbox ||
                    prediction.box ||
                    prediction.boundingBox;

                if (
                    !bbox ||
                    bbox.length < 4
                ) {
                    return null;
                }

                let [
                    x,
                    y,
                    width,
                    height
                ] = bbox;

                /*
                 * Some models return x1,y1,x2,y2.
                 * Detect and normalize those when needed.
                 */
                if (
                    width < x &&
                    height < y
                ) {
                    width =
                        width - x;

                    height =
                        height - y;
                }

                const label =
                    prediction.class ||
                    prediction.label ||
                    prediction.name ||
                    AI_CONFIG.defaultLabel;

                const score =
                    Number(
                        prediction.score ??
                        prediction.confidence ??
                        0
                    );

                return {
                    label:
                        String(
                            label
                        ),

                    score:
                        Number.isFinite(
                            score
                        )
                            ? score
                            : 0,

                    x:
                        Number(x) || 0,

                    y:
                        Number(y) || 0,

                    width:
                        Math.max(
                            1,
                            Number(
                                width
                            ) || 1
                        ),

                    height:
                        Math.max(
                            1,
                            Number(
                                height
                            ) || 1
                        ),

                    segmentation:
                        prediction.segmentation ||
                        prediction.mask ||
                        null
                };
            }
        )
        .filter(Boolean);
}

/* ============================================================
   CREATE AI ANNOTATION
============================================================ */

function createAIAnnotation(
    prediction
) {
    let type =
        state.annotationType ||
        "box";

    /*
     * When a coworker is assigned a specific work role,
     * automatically produce the correct annotation shape.
     */
    const role =
        CLOUD.profile?.role;

    if (
        role ===
        "coworker_polygon"
    ) {
        type =
            "polygon";
    }

    if (
        role ===
        "coworker_segmentation"
    ) {
        type =
            "segmentation";
    }

    if (
        role ===
        "coworker_2d_box"
    ) {
        type =
            "box";
    }

    if (
        type ===
            "polygon" ||
        type ===
            "segmentation"
    ) {
        const points =
            prediction.segmentation
                ? normalizeSegmentation(
                    prediction.segmentation
                )
                : rectangleToPolygon(
                    prediction
                );

        createAnnotation({
            type,
            points,
            label:
                prediction.label,
            score:
                prediction.score,
            occlusion: 0,
            truncation:
                detectTruncation(
                    prediction
                ),
            aiGenerated:
                true,
            corrected:
                false
        });

        return;
    }

    createAnnotation({
        type: "box",

        x:
            prediction.x,

        y:
            prediction.y,

        width:
            prediction.width,

        height:
            prediction.height,

        label:
            prediction.label,

        score:
            prediction.score,

        occlusion: 0,

        truncation:
            detectTruncation(
                prediction
            ),

        aiGenerated:
            true,

        corrected:
            false
    });
}

/* ============================================================
   FALLBACK DETECTION
============================================================ */

async function fallbackDetect() {
    /*
     * This fallback intentionally produces a useful annotation
     * instead of failing when no browser AI model is installed.
     *
     * It detects the visible image area as a candidate object.
     * The annotation is marked AI-generated so a reviewer can
     * correct it.
     */

    if (!state.image) {
        return [];
    }

    const width =
        state.image.naturalWidth ||
        state.image.width;

    const height =
        state.image.naturalHeight ||
        state.image.height;

    if (
        width <= 0 ||
        height <= 0
    ) {
        return [];
    }

    const marginX =
        width * 0.05;

    const marginY =
        height * 0.05;

    return [
        {
            label:
                "object",

            score:
                0.50,

            x:
                marginX,

            y:
                marginY,

            width:
                Math.max(
                    1,
                    width -
                        marginX * 2
                ),

            height:
                Math.max(
                    1,
                    height -
                        marginY * 2
                )
        }
    ];
}

/* ============================================================
   SEGMENTATION HELPERS
============================================================ */

function rectangleToPolygon(
    prediction
) {
    const x =
        Number(
            prediction.x
        ) || 0;

    const y =
        Number(
            prediction.y
        ) || 0;

    const width =
        Number(
            prediction.width
        ) || 1;

    const height =
        Number(
            prediction.height
        ) || 1;

    return [
        {
            x,
            y
        },
        {
            x:
                x + width,
            y
        },
        {
            x:
                x + width,
            y:
                y + height
        },
        {
            x,
            y:
                y + height
        }
    ];
}

function normalizeSegmentation(
    segmentation
) {
    if (
        !segmentation
    ) {
        return [];
    }

    /*
     * Already in [{x,y},...] form.
     */
    if (
        Array.isArray(
            segmentation
        ) &&
        segmentation.every(
            p =>
                p &&
                typeof p ===
                    "object" &&
                "x" in p &&
                "y" in p
        )
    ) {
        return segmentation.map(
            p => ({
                x:
                    Number(
                        p.x
                    ) || 0,

                y:
                    Number(
                        p.y
                    ) || 0
            })
        );
    }

    /*
     * Flat [x,y,x,y,...] form.
     */
    if (
        Array.isArray(
            segmentation
        ) &&
        typeof segmentation[0] ===
            "number"
    ) {
        const points = [];

        for (
            let i = 0;
            i + 1 <
            segmentation.length;
            i += 2
        ) {
            points.push({
                x:
                    Number(
                        segmentation[i]
                    ) || 0,

                y:
                    Number(
                        segmentation[
                            i + 1
                        ]
                    ) || 0
            });
        }

        return points;
    }

    /*
     * COCO-style nested segmentation.
     */
    if (
        Array.isArray(
            segmentation
        ) &&
        Array.isArray(
            segmentation[0]
        )
    ) {
        return normalizeSegmentation(
            segmentation[0]
        );
    }

    return [];
}

/* ============================================================
   TRUNCATION DETECTION
============================================================ */

function detectTruncation(
    box
) {
    if (!state.image) {
        return "NONE";
    }

    const width =
        state.image.naturalWidth ||
        state.image.width;

    const height =
        state.image.naturalHeight ||
        state.image.height;

    const x =
        Number(box.x) || 0;

    const y =
        Number(box.y) || 0;

    const right =
        x +
        (
            Number(
                box.width
            ) || 0
        );

    const bottom =
        y +
        (
            Number(
                box.height
            ) || 0
        );

    const touchesLeft =
        x <= 1;

    const touchesRight =
        right >=
        width - 1;

    const touchesTop =
        y <= 1;

    const touchesBottom =
        bottom >=
        height - 1;

    const sides = [];

    if (touchesLeft) {
        sides.push(
            "LEFT"
        );
    }

    if (touchesRight) {
        sides.push(
            "RIGHT"
        );
    }

    if (touchesTop) {
        sides.push(
            "TOP"
        );
    }

    if (touchesBottom) {
        sides.push(
            "BOTTOM"
        );
    }

    if (!sides.length) {
        return "NONE";
    }

    if (
        sides.length === 1
    ) {
        return sides[0];
    }

    return "MULTIPLE";
}

/* ============================================================
   AI CLEAR
============================================================ */

$("clearAI")?.addEventListener(
    "click",
    clearAIAnnotations
);

function clearAIAnnotations() {
    const before =
        state.annotations.length;

    state.annotations =
        state.annotations.filter(
            a =>
                !a.aiGenerated
        );

    const removed =
        before -
        state.annotations.length;

    if (!removed) {
        showToast(
            "No AI annotations to remove."
        );

        return;
    }

    state.selectedId =
        null;

    pushHistory();
    updateCounts();
    updateAnnotationsList();
    hidePopup();

    saveFrame();
    saveSession();

    cloudSaveAllAnnotations();

    render();

    showToast(
        `${removed} AI annotation${
            removed === 1
                ? ""
                : "s"
        } removed`
    );
}

/* ============================================================
   AI REVIEW / ACCEPT
============================================================ */

$("acceptAI")?.addEventListener(
    "click",
    acceptAIAnnotations
);

function acceptAIAnnotations() {
    let changed = 0;

    state.annotations.forEach(
        annotation => {
            if (
                annotation.aiGenerated &&
                !annotation.corrected
            ) {
                annotation.corrected =
                    true;

                changed++;
            }
        }
    );

    if (!changed) {
        showToast(
            "No AI annotations need accepting."
        );

        return;
    }

    pushHistory();
    updateAnnotationsList();

    saveFrame();
    saveSession();

    cloudSaveAllAnnotations();

    render();

    showToast(
        `${changed} AI annotation${
            changed === 1
                ? ""
                : "s"
        } accepted`
    );
}

/* ============================================================
   CLASSIFICATION PANEL
============================================================ */

function populateClassSelect() {
    const select =
        $("classSelect");

    if (!select) {
        return;
    }

    const existing =
        Array.from(
            select.options
        ).map(
            option =>
                option.value
        );

    AI_LABELS.forEach(
        label => {
            if (
                existing.includes(
                    label
                )
            ) {
                return;
            }

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                label;

            option.textContent =
                label;

            select.appendChild(
                option
            );
        }
    );
}

$("classSelect")?.addEventListener(
    "change",
    event => {
        const annotation =
            getSelected();

        if (!annotation) {
            return;
        }

        annotation.label =
            event.target.value;

        annotation.corrected =
            true;

        updateAnnotationsList();

        saveFrame();
        saveSession();

        cloudSaveAnnotation(
            annotation
        );

        render();
    }
);

/* ============================================================
   APPLY CLASSIFICATION
============================================================ */

$("applyClass")?.addEventListener(
    "click",
    () => {
        const annotation =
            getSelected();

        const select =
            $("classSelect");

        if (
            !annotation ||
            !select
        ) {
            return;
        }

        annotation.label =
            select.value ||
            "unknown";

        annotation.corrected =
            true;

        updateAnnotationsList();

        saveFrame();
        saveSession();

        cloudSaveAnnotation(
            annotation
        );

        render();

        showToast(
            "Classification updated"
        );
    }
);

/* ============================================================
   KEYBOARD CLASSIFICATION
============================================================ */

document.addEventListener(
    "keydown",
    event => {
        if (
            event.target &&
            (
                event.target.tagName ===
                    "INPUT" ||
                event.target.tagName ===
                    "TEXTAREA" ||
                event.target.tagName ===
                    "SELECT"
            )
        ) {
            return;
        }

        if (
            !state.selectedId
        ) {
            return;
        }

        const number =
            Number(
                event.key
            );

        if (
            number >= 1 &&
            number <=
                AI_LABELS.length
        ) {
            const label =
                AI_LABELS[
                    number - 1
                ];

            const annotation =
                getSelected();

            if (!annotation) {
                return;
            }

            annotation.label =
                label;

            annotation.corrected =
                true;

            updateAnnotationsList();

            saveFrame();
            saveSession();

            cloudSaveAnnotation(
                annotation
            );

            render();
        }
    }
);

/* ============================================================
   BULK OCCLUSION / TRUNCATION
============================================================ */

$("applyOcclusion")?.addEventListener(
    "click",
    () => {
        const value =
            Number(
                $("occlusionSelect")
                    ?.value ?? 0
            );

        let changed = 0;

        state.annotations.forEach(
            annotation => {
                if (
                    annotation.id ===
                    state.selectedId
                ) {
                    annotation.occlusion =
                        value;

                    annotation.corrected =
                        true;

                    changed++;
                }
            }
        );

        if (!changed) {
            showToast(
                "Select an annotation first."
            );

            return;
        }

        updateAnnotationsList();

        saveFrame();
        saveSession();

        cloudSaveAllAnnotations();

        render();
    }
);

$("applyTruncation")?.addEventListener(
    "click",
    () => {
        const value =
            $("truncationSelect")
                ?.value ||
            "NONE";

        const annotation =
            getSelected();

        if (!annotation) {
            showToast(
                "Select an annotation first."
            );

            return;
        }

        annotation.truncation =
            value;

        annotation.corrected =
            true;

        updateAnnotationsList();

        saveFrame();
        saveSession();

        cloudSaveAnnotation(
            annotation
        );

        render();
    }
);

/* ============================================================
   UTILITY
============================================================ */

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

function showToast(
    message
) {
    let toast =
        document.querySelector(
            ".app-toast"
        );

    if (!toast) {
        toast =
            document.createElement(
                "div"
            );

        toast.className =
            "app-toast";

        document.body.appendChild(
            toast
        );
    }

    toast.textContent =
        message;

    toast.classList.add(
        "visible"
    );

    clearTimeout(
        showToast.timer
    );

    showToast.timer =
        setTimeout(
            () => {
                toast.classList.remove(
                    "visible"
                );
            },
            2500
        );
}

/* ============================================================
   TASK-SAFE MEDIA CAPTURE
============================================================ */

function captureCurrentVideoFrame() {
    if (
        !sourceVideo ||
        sourceVideo.readyState <
            2
    ) {
        return false;
    }

    const width =
        sourceVideo.videoWidth;

    const height =
        sourceVideo.videoHeight;

    if (
        !width ||
        !height
    ) {
        return false;
    }

    const frameCanvas =
        document.createElement(
            "canvas"
        );

    frameCanvas.width =
        width;

    frameCanvas.height =
        height;

    const frameContext =
        frameCanvas.getContext(
            "2d"
        );

    frameContext.drawImage(
        sourceVideo,
        0,
        0,
        width,
        height
    );

    const image =
        new Image();

    image.onload =
        () => {
            state.image =
                image;

            state.mediaType =
                "video";

            render();
        };

    image.src =
        frameCanvas.toDataURL(
            "image/jpeg",
            0.92
        );

    return true;
}

/* ============================================================
   EXPORT HELPERS
============================================================ */

function getExportAnnotations() {
    return state.annotations
        .filter(
            annotation =>
                annotation.export !==
                false
        )
        .map(
            annotation => ({
                ...annotation,

                points:
                    annotation.points
                        ? annotation.points.map(
                            p => ({
                                x: p.x,
                                y: p.y
                            })
                        )
                        : undefined
            })
        );
}

function annotationsToRows() {
    return getExportAnnotations()
        .map(
            (annotation, index) => ({
                id:
                    annotation.id,

                number:
                    index + 1,

                label:
                    annotation.label ||
                    "unknown",

                type:
                    annotation.type,

                x:
                    annotation.x ??
                    "",

                y:
                    annotation.y ??
                    "",

                width:
                    annotation.width ??
                    "",

                height:
                    annotation.height ??
                    "",

                occlusion:
                    annotation.occlusion ??
                    0,

                truncation:
                    annotation.truncation ||
                    "NONE",

                confidence:
                    annotation.score ??
                    "",

                aiGenerated:
                    annotation.aiGenerated
                        ? "YES"
                        : "NO",

                corrected:
                    annotation.corrected
                        ? "YES"
                        : "NO"
            })
        );
}

function rowsToCSV(
    rows
) {
    if (
        !rows.length
    ) {
        return "";
    }

    const headers =
        Object.keys(
            rows[0]
        );

    const escapeCSV =
        value => {
            const text =
                String(
                    value ?? ""
                );

            if (
                /[",\n]/.test(
                    text
                )
            ) {
                return (
                    '"' +
                    text.replace(
                        /"/g,
                        '""'
                    ) +
                    '"'
                );
            }

            return text;
        };

    return [
        headers.join(","),
        ...rows.map(
            row =>
                headers
                    .map(
                        key =>
                            escapeCSV(
                                row[key]
                            )
                    )
                    .join(",")
        )
    ].join("\n");
}

function downloadText(
    filename,
    content,
    mimeType
) {
    const blob =
        new Blob(
            [content],
            {
                type:
                    mimeType ||
                    "text/plain;charset=utf-8"
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement(
            "a"
        );

    link.href =
        url;

    link.download =
        filename;

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();

    setTimeout(
        () =>
            URL.revokeObjectURL(
                url
            ),
        1000
    );
}

/* ============================================================
   CUSTOMER CSV EXPORT
============================================================ */

$("exportCSV")?.addEventListener(
    "click",
    exportCSV
);

function exportCSV() {
    const rows =
        annotationsToRows();

    if (
        !rows.length
    ) {
        showToast(
            "There are no annotations to export."
        );

        return;
    }

    const csv =
        rowsToCSV(
            rows
        );

    const taskId =
        CLOUD.currentTaskId ||
        "annotation-task";

    downloadText(
        `${taskId}-annotations.csv`,
        csv,
        "text/csv;charset=utf-8"
    );

    showToast(
        "CSV exported successfully"
    );
}

/* ============================================================
   HTML EXPORT
============================================================ */

$("exportHTML")?.addEventListener(
    "click",
    exportHTML
);

function exportHTML() {
    const rows =
        annotationsToRows();

    const taskId =
        CLOUD.currentTaskId ||
        "annotation-task";

    const generated =
        new Date()
            .toISOString();

    const headers =
        rows.length
            ? Object.keys(
                rows[0]
            )
            : [
                "id",
                "number",
                "label",
                "type",
                "x",
                "y",
                "width",
                "height",
                "occlusion",
                "truncation",
                "confidence",
                "aiGenerated",
                "corrected"
            ];

    const html =
        `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHTML(
    taskId
)} - Annotation Export</title>

<style>
body {
    font-family: Arial, sans-serif;
    padding: 30px;
    background: #f6f6f6;
    color: #222;
}

h1 {
    margin-bottom: 5px;
}

.meta {
    color: #666;
    margin-bottom: 20px;
}

table {
    border-collapse: collapse;
    width: 100%;
    background: white;
}

th,
td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
    font-size: 12px;
}

th {
    background: #eee;
}

tr:nth-child(even) {
    background: #fafafa;
}
</style>
</head>

<body>

<h1>Annotation Export</h1>

<div class="meta">
Task: ${escapeHTML(taskId)}<br>
Generated: ${escapeHTML(generated)}<br>
Annotations: ${rows.length}
</div>

<table>
<thead>
<tr>
${headers
    .map(
        header =>
            `<th>${escapeHTML(
                header
            )}</th>`
    )
    .join("")}
</tr>
</thead>

<tbody>
${
    rows
        .map(
            row =>
                `<tr>
${headers
    .map(
        header =>
            `<td>${escapeHTML(
                row[header]
            )}</td>`
    )
    .join("")}
</tr>`
        )
        .join("")
}
</tbody>

</table>

</body>
</html>
`;

    downloadText(
        `${taskId}-annotations.html`,
        html,
        "text/html;charset=utf-8"
    );

    showToast(
        "HTML exported successfully"
    );
}

/* ============================================================
   GOOGLE SHEETS COMPATIBLE EXPORT
============================================================ */

$("exportSheets")?.addEventListener(
    "click",
    exportGoogleSheetsCompatible
);

function exportGoogleSheetsCompatible() {
    const rows =
        annotationsToRows();

    if (
        !rows.length
    ) {
        showToast(
            "There are no annotations to export."
        );

        return;
    }

    /*
     * CSV is directly importable into Google Sheets.
     */
    const csv =
        rowsToCSV(
            rows
        );

    const taskId =
        CLOUD.currentTaskId ||
        "annotation-task";

    downloadText(
        `${taskId}-google-sheets.csv`,
        csv,
        "text/csv;charset=utf-8"
    );

    showToast(
        "Google Sheets-compatible CSV exported"
    );
}

/* ============================================================
   COPY CSV
============================================================ */

$("copyCSV")?.addEventListener(
    "click",
    async () => {
        const rows =
            annotationsToRows();

        if (
            !rows.length
        ) {
            showToast(
                "There are no annotations to copy."
            );

            return;
        }

        const csv =
            rowsToCSV(
                rows
            );

        try {
            await navigator.clipboard.writeText(
                csv
            );

            showToast(
                "CSV copied to clipboard"
            );
        } catch (error) {
            console.error(
                error
            );

            showToast(
                "Clipboard access failed."
            );
        }
    }
);

/* ============================================================
   INITIAL AI UI
============================================================ */

populateClassSelect();
updateColorLegend();
updateCounts();
updateUndoRedoButtons();
setAIProgress(0);
/* ============================================================
   CLOUD / SUPABASE CONFIGURATION
============================================================ */

const SUPABASE_URL =
    "https://ozcwfcfcwzjjanxfvico.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ";

let supabaseClient = null;

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

const ROOT_ADMIN_EMAIL =
    "antonymbali96@gmail.com";

const CLOUD = {
    session: null,
    profile: null,

    currentTaskId:
        null,

    currentTask:
        null,

    channel:
        null,

    ready:
        false
};

window.CLOUD =
    CLOUD;

/* ============================================================
   SUPABASE CLIENT
============================================================ */

function createSupabaseClient() {
    if (supabaseClient) {
        return supabaseClient;
    }

    try {
        supabaseClient = createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );

        return supabaseClient;

    } catch (error) {
        console.error("Could not create Supabase client:", error);
        return null;
    }
}

const supabase = createSupabaseClient();

    try {
        supabaseClient =
            window.supabase.createClient(
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

        return supabaseClient;

    } catch (error) {
        console.error(
            "Could not create Supabase client:",
            error
        );

        return null;
    }
}

/* ============================================================
   CLOUD INITIALIZATION
============================================================ */

async function initCloud() {
    const client =
        createSupabaseClient();

    if (!client) {
        setAuthStatus(
            "Cloud connection is unavailable."
        );

        showAuthGate();

        return;
    }

    try {
        const {
            data,
            error
        } =
            await client.auth.getSession();

        if (error) {
            throw error;
        }

        CLOUD.session =
            data?.session ||
            null;

        if (
            CLOUD.session
        ) {
            await handleSession(
                CLOUD.session,
                false
            );
        } else {
            showAuthGate();
        }

        client.auth.onAuthStateChange(
            async (
                event,
                session
            ) => {
                try {
                    CLOUD.session =
                        session ||
                        null;

                    if (
                        session
                    ) {
                        await handleSession(
                            session,
                            event ===
                                "SIGNED_IN"
                        );
                    } else {
                        await handleSignedOut();
                    }

                } catch (error) {
                    console.error(
                        "Auth state handling error:",
                        error
                    );
                }
            }
        );

        CLOUD.ready =
            true;

    } catch (error) {
        console.error(
            "Cloud initialization failed:",
            error
        );

        setAuthStatus(
            error.message ||
            "Unable to connect to cloud."
        );

        showAuthGate();
    }
}

/* ============================================================
   AUTH GATE
============================================================ */

function showAuthGate() {
    const page =
        $("loginPage");

    const app =
        document.querySelector(
            ".app"
        );

    const loggedOut =
        $("authLoggedOut");

    const loggedIn =
        $("authLoggedIn");

    if (page) {
        page.style.display =
            "grid";
    }

    if (app) {
        app.style.display =
            "none";
    }

    if (loggedOut) {
        loggedOut.style.display =
            "block";
    }

    if (loggedIn) {
        loggedIn.style.display =
            "none";
    }
}

function hideAuthGate() {
    const page =
        $("loginPage");

    const app =
        document.querySelector(
            ".app"
        );

    const loggedOut =
        $("authLoggedOut");

    const loggedIn =
        $("authLoggedIn");

    if (page) {
        page.style.display =
            "none";
    }

    if (app) {
        app.style.display =
            "";
    }

    if (loggedOut) {
        loggedOut.style.display =
            "none";
    }

    if (loggedIn) {
        loggedIn.style.display =
            "block";
    }
}

/* ============================================================
   AUTH STATUS
============================================================ */

function setAuthStatus(
    message,
    isError = false
) {
    const status =
        $("authStatus");

    if (!status) {
        return;
    }

    status.textContent =
        message;

    status.classList.toggle(
        "error",
        !!isError
    );
}

/* ============================================================
   SIGN IN
============================================================ */

$("signInBtn")?.addEventListener(
    "click",
    signIn
);

$("authPassword")?.addEventListener(
    "keydown",
    event => {
        if (
            event.key ===
            "Enter"
        ) {
            signIn();
        }
    }
);

$("authEmail")?.addEventListener(
    "keydown",
    event => {
        if (
            event.key ===
            "Enter"
        ) {
            signIn();
        }
    }
);

async function signIn() {
    const email =
        $("authEmail")
            ?.value
            ?.trim();

    const password =
        $("authPassword")
            ?.value ||
        "";

    if (!email) {
        setAuthStatus(
            "Enter your email address.",
            true
        );

        return;
    }

    if (!password) {
        setAuthStatus(
            "Enter your password.",
            true
        );

        return;
    }

    const button =
        $("signInBtn");

    if (button) {
        button.disabled =
            true;

        button.textContent =
            "SIGNING IN...";
    }

    setAuthStatus(
        "Signing in..."
    );

    try {
        const client =
            createSupabaseClient();

        if (!client) {
            throw new Error(
                "Supabase is unavailable."
            );
        }

        const {
            data,
            error
        } =
            await client.auth.signInWithPassword(
                {
                    email,
                    password
                }
            );

        if (error) {
            throw error;
        }

        if (
            data?.session
        ) {
            CLOUD.session =
                data.session;

            await handleSession(
                data.session,
                true
            );
        }

    } catch (error) {
        console.error(
            "Sign-in error:",
            error
        );

        setAuthStatus(
            friendlyAuthError(
                error
            ),
            true
        );

    } finally {
        if (button) {
            button.disabled =
                false;

            button.textContent =
                "SIGN IN";
        }
    }
}

/* ============================================================
   CREATE ACCOUNT
============================================================ */

$("signUpBtn")?.addEventListener(
    "click",
    signUp
);

async function signUp() {
    const email =
        $("authEmail")
            ?.value
            ?.trim();

    const password =
        $("authPassword")
            ?.value ||
        "";

    if (!email) {
        setAuthStatus(
            "Enter an email address first.",
            true
        );

        return;
    }

    if (
        password.length < 8
    ) {
        setAuthStatus(
            "Password must be at least 8 characters.",
            true
        );

        return;
    }

    const button =
        $("signUpBtn");

    if (button) {
        button.disabled =
            true;

        button.textContent =
            "CREATING...";
    }

    setAuthStatus(
        "Creating account..."
    );

    try {
        const client =
            createSupabaseClient();

        if (!client) {
            throw new Error(
                "Supabase is unavailable."
            );
        }

        const {
            data,
            error
        } =
            await client.auth.signUp(
                {
                    email,
                    password,

                    options: {
                        data: {
                            full_name:
                                email.split(
                                    "@"
                                )[0]
                        }
                    }
                }
            );

        if (error) {
            throw error;
        }

        /*
         * If email confirmation is enabled,
         * Supabase will not immediately provide
         * an authenticated session.
         */
        if (
            data?.session
        ) {
            CLOUD.session =
                data.session;

            await handleSession(
                data.session,
                true
            );

        } else {
            setAuthStatus(
                "Account created. Check your email if confirmation is required."
            );
        }

    } catch (error) {
        console.error(
            "Sign-up error:",
            error
        );

        setAuthStatus(
            friendlyAuthError(
                error
            ),
            true
        );

    } finally {
        if (button) {
            button.disabled =
                false;

            button.textContent =
                "CREATE ACCOUNT";
        }
    }
}

/* ============================================================
   FORGOT PASSWORD
============================================================ */

$("forgotPassword")?.addEventListener(
    "click",
    sendPasswordReset
);

async function sendPasswordReset() {
    const email =
        $("authEmail")
            ?.value
            ?.trim();

    if (!email) {
        setAuthStatus(
            "Enter your email first so we can send the reset link.",
            true
        );

        return;
    }

    try {
        const client =
            createSupabaseClient();

        if (!client) {
            throw new Error(
                "Supabase is unavailable."
            );
        }

        const {
            error
        } =
            await client.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo:
                        window.location.href
                }
            );

        if (error) {
            throw error;
        }

        setAuthStatus(
            "Password reset instructions have been sent."
        );

    } catch (error) {
        console.error(
            "Password reset error:",
            error
        );

        setAuthStatus(
            friendlyAuthError(
                error
            ),
            true
        );
    }
}

/* ============================================================
   SIGN OUT
============================================================ */

$("logoutButton")?.addEventListener(
    "click",
    signOut
);

async function signOut() {
    try {
        await logLogout();

        if (
            CLOUD.channel &&
            supabaseClient
        ) {
            await supabaseClient
                .removeChannel(
                    CLOUD.channel
                );

            CLOUD.channel =
                null;
        }

        if (
            supabaseClient
        ) {
            await supabaseClient.auth.signOut();
        }

    } catch (error) {
        console.error(
            "Sign-out error:",
            error
        );

        /*
         * Even if the activity log fails,
         * clear the local application state.
         */
        CLOUD.session =
            null;

        CLOUD.profile =
            null;

        CLOUD.currentTaskId =
            null;

        CLOUD.currentTask =
            null;

        showAuthGate();
    }
}

async function handleSignedOut() {
    CLOUD.session =
        null;

    CLOUD.profile =
        null;

    CLOUD.currentTaskId =
        null;

    CLOUD.currentTask =
        null;

    if (
        CLOUD.channel &&
        supabaseClient
    ) {
        try {
            await supabaseClient
                .removeChannel(
                    CLOUD.channel
                );
        } catch (_) {}

        CLOUD.channel =
            null;
    }

    showAuthGate();

    clearCloudWorkspace();
}

/* ============================================================
   HANDLE SESSION
============================================================ */

async function handleSession(
    session,
    shouldLogLogin
) {
    if (!session?.user) {
        showAuthGate();

        return;
    }

    CLOUD.session =
        session;

    try {
        await loadCloudProfile();

        if (
            !CLOUD.profile
        ) {
            throw new Error(
                "Your account profile could not be loaded."
            );
        }

        if (
            CLOUD.profile.active ===
            false
        ) {
            await supabaseClient.auth.signOut();

            setAuthStatus(
                "This account has been deactivated.",
                true
            );

            showAuthGate();

            return;
        }

        hideAuthGate();

        updateAccountUI();

        enforceRoleUI();

        if (
            shouldLogLogin
        ) {
            await logLogin();
        }

        await setupRealtime();

        await loadCloudTasks();

        await loadCloudWorkHistory();

        updateWorkspaceGreeting();

        /*
         * Users marked by the administrator for a password
         * change are sent directly to the password reset UI.
         */
        if (
            CLOUD.profile.must_change_password
        ) {
            openPasswordResetModal();
        }

    } catch (error) {
        console.error(
            "Session setup failed:",
            error
        );

        setAuthStatus(
            error.message ||
            "Unable to load your workspace.",
            true
        );

        /*
         * Do not leave a partially authenticated user
         * inside the application.
         */
        showAuthGate();
    }
}

/* ============================================================
   LOAD PROFILE
============================================================ */

async function loadCloudProfile() {
    if (
        !CLOUD.session?.user
    ) {
        return null;
    }

    const userId =
        CLOUD.session.user.id;

    const {
        data,
        error
    } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq(
                "id",
                userId
            )
            .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        /*
         * The database trigger normally creates this row.
         * Give it a short chance to appear before failing.
         */
        await sleep(500);

        const retry =
            await supabaseClient
                .from("profiles")
                .select("*")
                .eq(
                    "id",
                    userId
                )
                .maybeSingle();

        if (retry.error) {
            throw retry.error;
        }

        CLOUD.profile =
            retry.data ||
            null;

    } else {
        CLOUD.profile =
            data;
    }

    return CLOUD.profile;
}

/* ============================================================
   ACCOUNT UI
============================================================ */

function updateAccountUI() {
    const profile =
        CLOUD.profile;

    const user =
        CLOUD.session?.user;

    if (!profile) {
        return;
    }

    const email =
        profile.email ||
        user?.email ||
        "";

    const name =
        profile.full_name ||
        email.split(
            "@"
        )[0] ||
        "User";

    const role =
        profile.role ||
        "customer";

    const nameElements =
        [
            $("userName"),
            $("accountName"),
            $("profileName")
        ];

    nameElements.forEach(
        element => {
            if (element) {
                element.textContent =
                    name;
            }
        }
    );

    const roleElements =
        [
            $("userRole"),
            $("accountRole"),
            $("profileRole")
        ];

    roleElements.forEach(
        element => {
            if (element) {
                element.textContent =
                    roleLabel(
                        role
                    );
            }
        }
    );

    const emailElements =
        [
            $("userEmail"),
            $("accountEmail"),
            $("profileEmail")
        ];

    emailElements.forEach(
        element => {
            if (element) {
                /*
                 * Admin email is intentionally never displayed
                 * to ordinary users. Their own email is fine.
                 */
                element.textContent =
                    email;
            }
        }
    );

    updateAvatar(
        profile.avatar_url
    );
}

function updateAvatar(
    avatarURL
) {
    const image =
        $("profileAvatar");

    const fallback =
        $("profileAvatarFallback");

    if (
        image &&
        avatarURL
    ) {
        image.src =
            avatarURL;

        image.style.display =
            "block";

        if (fallback) {
            fallback.style.display =
                "none";
        }

        return;
    }

    if (image) {
        image.removeAttribute(
            "src"
        );

        image.style.display =
            "none";
    }

    if (fallback) {
        fallback.style.display =
            "flex";

        fallback.textContent =
            getUserInitial();
    }
}

function getUserInitial() {
    const name =
        CLOUD.profile?.full_name ||
        CLOUD.session?.user?.email ||
        "U";

    return (
        name
            .trim()
            .charAt(0)
            .toUpperCase() ||
        "U"
    );
}

/* ============================================================
   ROLE HELPERS
============================================================ */

function roleLabel(
    role
) {
    const labels = {
        customer:
            "Customer",

        staff:
            "Staff",

        reviewer:
            "Reviewer",

        coworker_2d_box:
            "2D Box",

        coworker_polygon:
            "Polygon",

        coworker_segmentation:
            "Segmentation",

        admin:
            "Admin"
    };

    return (
        labels[role] ||
        role ||
        "User"
    );
}

function isAdmin() {
    return (
        CLOUD.profile?.role ===
        "admin"
    );
}

function isStaffOrAdmin() {
    return [
        "staff",
        "admin"
    ].includes(
        CLOUD.profile?.role
    );
}

function hasAllAccess() {
    return [
        "staff",
        "admin",
        "reviewer"
    ].includes(
        CLOUD.profile?.role
    );
}

function isCoworker() {
    return [
        "coworker_2d_box",
        "coworker_polygon",
        "coworker_segmentation"
    ].includes(
        CLOUD.profile?.role
    );
}

/* ============================================================
   ROLE-BASED WORKSPACE
============================================================ */

function enforceRoleUI() {
    const role =
        CLOUD.profile?.role;

    const customerUpload =
        $("uploadPanel");

    const manualType =
        $("annotationTypePanel");

    const adminButton =
        $("adminControlBtn");

    const customerExport =
        $("exportPanel");

    /*
     * Coworkers cannot access customer upload tools.
     */
    if (
        customerUpload
    ) {
        customerUpload.style.display =
            isCoworker()
                ? "none"
                : "";
    }

    /*
     * Coworkers cannot manually select annotation type.
     * Their assigned work role determines the shape.
     */
    if (
        manualType
    ) {
        manualType.style.display =
            isCoworker()
                ? "none"
                : "";
    }

    /*
     * Only admins see the Admin Center button.
     */
    if (
        adminButton
    ) {
        adminButton.style.display =
            isAdmin()
                ? ""
                : "none";
    }

    /*
     * All authenticated users can export their own
     * permitted task results, subject to task ownership.
     */
    if (
        customerExport
    ) {
        customerExport.style.display =
            "";
    }

    /*
     * Staff/admin get all workspace access.
     */
    if (
        role ===
            "staff" ||
        role ===
            "admin"
    ) {
        document.body.classList.add(
            "all-access-user"
        );
    } else {
        document.body.classList.remove(
            "all-access-user"
        );
    }

    updateWorkRoleUI();
}

/* ============================================================
   WORK ROLE UI
============================================================ */

function updateWorkRoleUI() {
    const role =
        CLOUD.profile?.role;

    const roleText =
        $("workRoleText");

    if (roleText) {
        roleText.textContent =
            roleLabel(
                role
            );
    }

    const shape =
        role ===
        "coworker_2d_box"
            ? "box"
            : role ===
              "coworker_polygon"
                ? "polygon"
                : role ===
                  "coworker_segmentation"
                    ? "segmentation"
                    : null;

    if (
        shape &&
        state.annotationType !==
            shape
    ) {
        state.annotationType =
            shape;
    }
}

/* ============================================================
   GREETING / TIME
============================================================ */

function updateWorkspaceGreeting() {
    const greeting =
        $("workspaceGreeting");

    const profile =
        CLOUD.profile;

    if (!greeting) {
        return;
    }

    const hour =
        new Date().getHours();

    let text;

    if (
        hour >= 5 &&
        hour < 12
    ) {
        text =
            "Good morning ☀️";
    } else if (
        hour >= 12 &&
        hour < 17
    ) {
        text =
            "Good afternoon 🌤️";
    } else if (
        hour >= 17 &&
        hour < 21
    ) {
        text =
            "Good evening 🌆";
    } else {
        text =
            "Good night 🌙";
    }

    const name =
        profile?.full_name ||
        profile?.email?.split(
            "@"
        )[0] ||
        "there";

    greeting.textContent =
        `${text}, ${name}`;
}

/* ============================================================
   PROFILE AVATAR UPLOAD
============================================================ */

$("avatarInput")?.addEventListener(
    "change",
    uploadAvatar
);

async function uploadAvatar(
    event
) {
    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }

    if (
        !CLOUD.session?.user
    ) {
        return;
    }

    const allowed =
        [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

    if (
        !allowed.includes(
            file.type
        )
    ) {
        showToast(
            "Use a JPG, PNG, or WebP image."
        );

        return;
    }

    if (
        file.size >
        5 * 1024 * 1024
    ) {
        showToast(
            "Profile image must be smaller than 5 MB."
        );

        return;
    }

    try {
        const userId =
            CLOUD.session.user.id;

        const extension =
            file.name
                .split(".")
                .pop()
                .toLowerCase();

        const path =
            `${userId}/avatar.${extension}`;

        const {
            error:
                uploadError
        } =
            await supabaseClient.storage
                .from("avatars")
                .upload(
                    path,
                    file,
                    {
                        upsert:
                            true,

                        cacheControl:
                            "3600"
                    }
                );

        if (
            uploadError
        ) {
            throw uploadError;
        }

        const {
            data:
                publicData
        } =
            supabaseClient.storage
                .from("avatars")
                .getPublicUrl(
                    path
                );

        const avatarURL =
            publicData?.publicUrl;

        if (!avatarURL) {
            throw new Error(
                "Avatar URL could not be created."
            );
        }

        const {
            error
        } =
            await supabaseClient
                .from("profiles")
                .update(
                    {
                        avatar_url:
                            avatarURL
                    }
                )
                .eq(
                    "id",
                    userId
                );

        if (error) {
            throw error;
        }

        CLOUD.profile.avatar_url =
            avatarURL;

        updateAvatar(
            avatarURL
        );

        showToast(
            "Profile picture updated."
        );

    } catch (error) {
        console.error(
            "Avatar upload failed:",
            error
        );

        showToast(
            "Could not update profile picture."
        );

    } finally {
        event.target.value =
            "";
    }
}

/* ============================================================
   PASSWORD RESET MODAL
============================================================ */

function openPasswordResetModal() {
    const modal =
        $("passwordResetModal");

    if (!modal) {
        return;
    }

    modal.style.display =
        "flex";

    const input =
        $("newPassword");

    if (input) {
        input.value =
            "";

        setTimeout(
            () => input.focus(),
            100
        );
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

$("closePasswordReset")?.addEventListener(
    "click",
    closePasswordResetModal
);

$("saveNewPassword")?.addEventListener(
    "click",
    saveNewPassword
);

async function saveNewPassword() {
    const input =
        $("newPassword");

    const confirm =
        $("confirmPassword");

    const password =
        input?.value ||
        "";

    const confirmation =
        confirm?.value ||
        "";

    if (
        password.length < 8
    ) {
        showToast(
            "Password must be at least 8 characters."
        );

        return;
    }

    if (
        password !==
        confirmation
    ) {
        showToast(
            "Passwords do not match."
        );

        return;
    }

    try {
        const {
            error:
                authError
        } =
            await supabaseClient.auth.updateUser(
                {
                    password
                }
            );

        if (
            authError
        ) {
            throw authError;
        }

        const {
            error
        } =
            await supabaseClient
                .from("profiles")
                .update(
                    {
                        must_change_password:
                            false
                    }
                )
                .eq(
                    "id",
                    CLOUD.session.user.id
                );

        if (error) {
            throw error;
        }

        CLOUD.profile.must_change_password =
            false;

        closePasswordResetModal();

        showToast(
            "Password updated successfully."
        );

    } catch (error) {
        console.error(
            "Password update failed:",
            error
        );

        showToast(
            friendlyAuthError(
                error
            )
        );
    }
}

/* ============================================================
   CLOUD TASK LOADING
============================================================ */

async function loadCloudTasks() {
    if (
        !CLOUD.profile
    ) {
        return [];
    }

    try {
        const {
            data,
            error
        } =
            await supabaseClient
                .from("tasks")
                .select(
                    "*"
                )
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );

        if (error) {
            throw error;
        }

        const tasks =
            data || [];

        renderTaskQueue(
            tasks
        );

        return tasks;

    } catch (error) {
        console.error(
            "Could not load tasks:",
            error
        );

        renderTaskQueue(
            []
        );

        return [];
    }
}

/* ============================================================
   TASK QUEUE
============================================================ */

function renderTaskQueue(
    tasks
) {
    const queue =
        $("taskQueue");

    if (!queue) {
        return;
    }

    const role =
        CLOUD.profile?.role;

    const available =
        tasks.filter(
            task =>
                taskIsAvailableForUser(
                    task,
                    role
                )
        );

    /*
     * Paid tasks disappear from the active queue.
     * Historical records remain in work history.
     */
    const active =
        available.filter(
            task =>
                ![
                    "paid",
                    "approved"
                ].includes(
                    task.status
                )
        );

    if (
        !active.length
    ) {
        queue.innerHTML = `
            <div class="task-empty">
                <strong>
                    Oops, looking for more work for you.
                </strong>

                <span>
                    New tasks will appear here when they are available.
                </span>
            </div>
        `;

        return;
    }

    queue.innerHTML =
        active.map(
            task =>
                renderTaskCard(
                    task
                )
        ).join("");

    queue
        .querySelectorAll(
            "[data-task-id]"
        )
        .forEach(
            element => {
                element.addEventListener(
                    "click",
                    () => {
                        const task =
                            tasks.find(
                                item =>
                                    String(
                                        item.id
                                    ) ===
                                    String(
                                        element.dataset.taskId
                                    )
                            );

                        if (task) {
                            claimAndOpenTask(
                                task
                            );
                        }
                    }
                );
            }
        );
}

function taskIsAvailableForUser(
    task,
    role
) {
    if (!task) {
        return false;
    }

    if (
        [
            "paid",
            "approved"
        ].includes(
            task.status
        )
    ) {
        return false;
    }

    if (
        task.claimed_by &&
        String(
            task.claimed_by
        ) !==
            String(
                CLOUD.session?.user?.id
            )
    ) {
        return false;
    }

    /*
     * Admin and staff have all access.
     */
    if (
        role === "admin" ||
        role === "staff"
    ) {
        return true;
    }

    /*
     * Explicitly assigned tasks.
     */
    if (
        task.assigned_to
    ) {
        return (
            String(
                task.assigned_to
            ) ===
            String(
                CLOUD.session?.user?.id
            )
        );
    }

    /*
     * Role-based routing.
     */
    if (
        task.required_role &&
        task.required_role !==
            role
    ) {
        return false;
    }

    if (
        task.role &&
        task.role !==
            role
    ) {
        return false;
    }

    return true;
}

/* ============================================================
   TASK CARD
============================================================ */

function renderTaskCard(
    task
) {
    const shape =
        task.shape ||
        task.annotation_shape ||
        task.type ||
        "2d_box";

    const role =
        task.required_role ||
        task.role ||
        roleForShape(
            shape
        );

    const duration =
        task.expected_duration_minutes ||
        task.duration_minutes ||
        task.expected_duration ||
        30;

    const annotationCount =
        Number(
            task.annotation_count ??
            task.annotations_count ??
            0
        );

    return `
        <button
            type="button"
            class="task-card"
            data-task-id="${escapeHTML(
                task.id
            )}"
        >
            <div class="task-card-top">
                <strong>
                    ${escapeHTML(
                        task.title ||
                        task.name ||
                        "Annotation task"
                    )}
                </strong>

                <span class="task-count">
                    ${annotationCount} annotations
                </span>
            </div>

            <div class="task-card-info">
                <span>
                    Type:
                    ${escapeHTML(
                        shapeLabel(
                            shape
                        )
                    )}
                </span>

                <span>
                    Role:
                    ${escapeHTML(
                        roleLabel(
                            role
                        )
                    )}
                </span>

                <span>
                    Expected:
                    ${escapeHTML(
                        String(
                            duration
                        )
                    )} min
                </span>
            </div>

            ${
                task.pay != null
                    ? `
                        <div class="task-card-pay">
                            Pay:
                            ${escapeHTML(
                                formatMoney(
                                    task.pay
                                )
                            )}
                        </div>
                    `
                    : ""
            }
        </button>
    `;
}

function roleForShape(
    shape
) {
    if (
        shape ===
            "box" ||
        shape ===
            "2d_box"
    ) {
        return "coworker_2d_box";
    }

    if (
        shape ===
        "polygon"
    ) {
        return "coworker_polygon";
    }

    if (
        shape ===
        "segmentation"
    ) {
        return "coworker_segmentation";
    }

    return null;
}

function shapeLabel(
    shape
) {
    const labels = {
        box:
            "2D Box",

        "2d_box":
            "2D Box",

        polygon:
            "Polygon",

        segmentation:
            "Segmentation"
    };

    return (
        labels[shape] ||
        shape ||
        "Annotation"
    );
}

function formatMoney(
    amount
) {
    const number =
        Number(
            amount
        );

    if (
        !Number.isFinite(
            number
        )
    ) {
        return "";
    }

    return new Intl.NumberFormat(
        undefined,
        {
            style:
                "currency",

            currency:
                "USD"
        }
    ).format(
        number
    );
}

/* ============================================================
   CLAIM TASK
============================================================ */

async function claimAndOpenTask(
    task
) {
    if (!task) {
        return;
    }

    if (
        !CLOUD.session?.user
    ) {
        return;
    }

    try {
        /*
         * Use the database claim function so that two users
         * cannot successfully claim the same task.
         */
        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                "claim_task",
                {
                    p_task_id:
                        task.id
                }
            );

        if (error) {
            throw error;
        }

        const claimedTask =
            Array.isArray(
                data
            )
                ? data[0]
                : data;

        if (
            claimedTask &&
            claimedTask.id
        ) {
            task =
                claimedTask;
        } else {
            const result =
                await supabaseClient
                    .from("tasks")
                    .select("*")
                    .eq(
                        "id",
                        task.id
                    )
                    .single();

            if (
                result.error
            ) {
                throw result.error;
            }

            task =
                result.data;
        }

        if (
            task.claimed_by &&
            String(
                task.claimed_by
            ) !==
                String(
                    CLOUD.session.user.id
                )
        ) {
            showToast(
                "This task has already been claimed."
            );

            await loadCloudTasks();

            return;
        }

        await openCloudTask(
            task
        );

    } catch (error) {
        console.error(
            "Task claim failed:",
            error
        );

        showToast(
            error.message ||
            "Could not claim this task."
        );

        await loadCloudTasks();
    }
}

/* ============================================================
   OPEN CLOUD TASK
============================================================ */

async function openCloudTask(
    task
) {
    CLOUD.currentTask =
        task;

    CLOUD.currentTaskId =
        task.id;

    state.currentTaskId =
        task.id;

    state.taskId =
        task.id;

    const taskType =
        task.shape ||
        task.annotation_shape ||
        task.type ||
        "box";

    if (
        [
            "box",
            "2d_box"
        ].includes(
            taskType
        )
    ) {
        state.annotationType =
            "box";
    } else if (
        taskType ===
        "polygon"
    ) {
        state.annotationType =
            "polygon";
    } else if (
        taskType ===
        "segmentation"
    ) {
        state.annotationType =
            "segmentation";
    }

    updateWorkRoleUI();

    updateCurrentTaskUI();

    await loadTaskAnnotations(
        task.id
    );

    await loadTaskSource(
        task
    );

    await loadCloudTasks();

    logActivity(
        "task_opened",
        {
            task_id:
                task.id
        }
    );
}

/* ============================================================
   CURRENT TASK UI
============================================================ */

function updateCurrentTaskUI() {
    const task =
        CLOUD.currentTask;

    const title =
        $("currentTaskTitle");

    const id =
        $("currentTaskId");

    const role =
        $("currentTaskRole");

    const type =
        $("currentTaskType");

    const duration =
        $("currentTaskDuration");

    const count =
        $("currentTaskAnnotationCount");

    if (!task) {
        return;
    }

    if (title) {
        title.textContent =
            task.title ||
            task.name ||
            "Current task";
    }

    if (id) {
        id.textContent =
            task.id;
    }

    if (role) {
        role.textContent =
            roleLabel(
                task.required_role ||
                task.role ||
                roleForShape(
                    task.shape ||
                    task.annotation_shape ||
                    task.type
                )
            );
    }

    if (type) {
        type.textContent =
            shapeLabel(
                task.shape ||
                task.annotation_shape ||
                task.type
            );
    }

    if (duration) {
        duration.textContent =
            `${task.expected_duration_minutes || task.duration_minutes || 30} min`;
    }

    if (count) {
        count.textContent =
            `${state.annotations.length} annotations`;
    }
}

/* ============================================================
   SLEEP HELPER
============================================================ */

function sleep(
    milliseconds
) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milliseconds
            )
    );
}

function friendlyAuthError(
    error
) {
    const message =
        String(
            error?.message ||
            error ||
            ""
        );

    if (
        /invalid login credentials/i.test(
            message
        )
    ) {
        return "Incorrect email or password.";
    }

    if (
        /email not confirmed/i.test(
            message
        )
    ) {
        return "Please confirm your email before signing in.";
    }

    if (
        /user already registered/i.test(
            message
        )
    ) {
        return "An account with this email already exists.";
    }

    if (
        /password should be at least/i.test(
            message
        )
    ) {
        return "Password does not meet the minimum requirements.";
    }

    return (
        message ||
        "Authentication failed."
    );
}

/* ============================================================
   CLEAR WORKSPACE ON LOGOUT
============================================================ */

function clearCloudWorkspace() {
    CLOUD.currentTaskId =
        null;

    CLOUD.currentTask =
        null;

    state.currentTaskId =
        null;

    state.taskId =
        null;

    state.annotations =
        [];

    state.frameAnnotations =
        new Map();

    state.selectedId =
        null;

    state.image =
        null;

    state.mediaType =
        "image";

    updateCounts();
    updateAnnotationsList();
    hidePopup();

    render();

    const queue =
        $("taskQueue");

    if (queue) {
        queue.innerHTML =
            "";
    }
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
        state.mediaType === "video"
            ? state.currentFrame
            : 0;

    const row = {
        task_id: CLOUD.currentTaskId,

        annotation_key:
            String(annotation.id),

        frame_number: frame,

        annotation_type:
            annotation.type,

        class_name:
            annotation.label || "unknown",

        score:
            annotation.score,

        occlusion:
            Number(annotation.occlusion ?? 0),

        truncation:
            annotation.truncation || "NONE",

        ai_generated:
            !!annotation.aiGenerated,

        corrected:
            !!annotation.corrected,

        export_enabled:
            annotation.export !== false,

        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,

        points:
            annotation.points || [],

        user_id:
            CLOUD.session.user.id
    };

    const { error } =
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
    if (!CLOUD.currentTaskId) {
        return;
    }

    const frame =
        state.mediaType === "video"
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
            String(annotationId)
        )
        .eq(
            "frame_number",
            frame
        );
}

async function cloudSaveCurrentFrame() {
    if (state.mediaType !== "video") {
        return;
    }

    for (
        const annotation of state.annotations
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
    const task = CLOUD.currentTask;
    const bar = $("taskActionBar");

    if (!task) {
        if (bar) {
            bar.style.display = "none";
        }
        return;
    }

    if (bar) {
        bar.style.display = "flex";
    }

    const title =
        $("taskActionTitle");

    if (title) {
        title.textContent =
            task.title ||
            task.source_name ||
            `Task ${String(task.id).slice(0, 8)}`;
    }

    const meta =
        $("taskActionMeta");

    if (meta) {
        meta.textContent = [
            task.work_type || "",
            formatRole(task.work_role),
            `${Number(task.expected_minutes || 0)} min`,
            formatMoney(task.pay_amount),
            `${Number(task.annotation_count || 0)} annotations`,
            task.status || ""
        ]
            .filter(Boolean)
            .join(" • ");
    }

    const submit =
        $("submitTaskBtn");

    const skip =
        $("skipTaskBtn");

    const approve =
        $("approveTaskBtn");

    const reviewerCanApprove =
        isReviewer() &&
        ["review", "in_review"].includes(
            task.status
        ) &&
        task.claimed_by ===
            CLOUD.session?.user?.id;

    if (approve) {
        approve.style.display =
            reviewerCanApprove
                ? ""
                : "none";
    }

    if (submit) {
        submit.style.display =
            reviewerCanApprove
                ? "none"
                : "";
    }

    if (skip) {
        skip.style.display =
            reviewerCanApprove
                ? "none"
                : "";
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
    if (!CLOUD.currentTaskId) {
        return;
    }

    saveFrame();

    const { error } =
        await supabase.rpc(
            "submit_task",
            {
                p_task_id:
                    CLOUD.currentTaskId
            }
        );

    if (error) {
        showToast(error.message);
        return;
    }

    showToast(
        "Task submitted ✓"
    );

    CLOUD.currentTaskId = null;
    CLOUD.currentTask = null;

    await refreshMyTasks();
}

function openSkipTaskModal() {
    const modal =
        $("skipTaskModal");

    if (modal) {
        modal.style.display = "grid";
    }
}

$("cancelSkipTask")?.addEventListener(
    "click",
    () => {
        const modal =
            $("skipTaskModal");

        if (modal) {
            modal.style.display = "none";
        }
    }
);

$("confirmSkipTask")?.addEventListener(
    "click",
    skipCurrentTask
);

async function skipCurrentTask() {
    if (!CLOUD.currentTaskId) {
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

    const { error } =
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
        showToast(error.message);
        return;
    }

    const modal =
        $("skipTaskModal");

    if (modal) {
        modal.style.display = "none";
    }

    if ($("skipReason")) {
        $("skipReason").value = "";
    }

    CLOUD.currentTaskId = null;
    CLOUD.currentTask = null;

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
    if (!CLOUD.currentTaskId) {
        return;
    }

    const { error } =
        await supabase.rpc(
            "approve_task",
            {
                p_task_id:
                    CLOUD.currentTaskId
            }
        );

    if (error) {
        showToast(error.message);
        return;
    }

    showToast(
        "Task approved ✓"
    );

    CLOUD.currentTaskId = null;
    CLOUD.currentTask = null;

    await refreshMyTasks();
}

/* ============================================================
   REALTIME
============================================================ */

function subscribeRealtime() {
    if (CLOUD.channel) {
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
                        payload.new?.task_id ===
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
                        payload.new?.id ===
                        CLOUD.session?.user?.id
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
    if (!isAdmin()) {
        return;
    }

    const modal =
        $("adminCenter");

    if (modal) {
        modal.style.display = "grid";
    }

    loadAdminTasks();
}

function closeAdminCenter() {
    const modal =
        $("adminCenter");

    if (modal) {
        modal.style.display = "none";
    }
}

document
    .querySelectorAll(
        "[data-admin-tab]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                document
                    .querySelectorAll(
                        "[data-admin-tab]"
                    )
                    .forEach(b =>
                        b.classList.remove(
                            "active"
                        )
                    );

                button.classList.add(
                    "active"
                );

                showAdminTab(
                    button.dataset.adminTab
                );
            }
        );
    });

$("refreshAdminTasks")
    ?.addEventListener(
        "click",
        loadAdminTasks
    );

$("refreshUsers")
    ?.addEventListener(
        "click",
        loadAdminUsers
    );

$("refreshCoworkers")
    ?.addEventListener(
        "click",
        loadAdminCoworkers
    );

$("refreshPayments")
    ?.addEventListener(
        "click",
        loadAdminPayments
    );

$("refreshActivity")
    ?.addEventListener(
        "click",
        loadAdminActivity
    );

function showAdminTab(tab) {
    const panelIds = {
        tasks: "adminTasksTab",
        users: "adminUsersTab",
        coworkers: "adminCoworkersTab",
        payments: "adminPaymentsTab",
        activity: "adminActivityTab"
    };

    Object.entries(panelIds)
        .forEach(
            ([name, id]) => {
                const panel =
                    document.getElementById(
                        id
                    );

                if (panel) {
                    panel.style.display =
                        name === tab
                            ? "block"
                            : "none";
                }
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
    if (!hasAllAccess()) {
        return;
    }

    const { data, error } =
        await supabase
            .from("tasks")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

    if (error) {
        showToast(error.message);
        return;
    }

    const table =
        $("adminTasksTable");

    if (!table) {
        return;
    }

    table.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Task</th>
                    <th>Type</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Annotations</th>
                    <th>Assigned / Claimed</th>
                    <th>Pay</th>
                    <th>Action</th>
                </tr>
            </thead>

            <tbody>
                ${(data || [])
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
                                    ${Number(
                                        task.annotation_count ||
                                        0
                                    )}
                                </td>

                                <td>
                                    ${escapeHTML(
                                        task.claimed_by ||
                                        task.assigned_to ||
                                        "Unassigned"
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
                                        data-admin-assign="${escapeHTML(
                                            task.id
                                        )}"
                                    >
                                        Assign
                                    </button>
                                </td>
                            </tr>
                        `
                    )
                    .join("")}
            </tbody>
        </table>
    `;

    table
        .querySelectorAll(
            "[data-admin-assign]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () =>
                    adminAssignPrompt(
                        button.dataset.adminAssign
                    )
            );
        });
}

/* ============================================================
   ADMIN USERS
============================================================ */

async function loadAdminUsers() {
    if (!hasAllAccess()) {
        return;
    }

    const { data, error } =
        await supabase
            .from("profiles")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

    if (error) {
        showToast(error.message);
        return;
    }

    const table =
        $("adminUsersTable");

    if (!table) {
        return;
    }

    table.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Last login</th>
                    <th>Last logout</th>
                    <th>Active</th>
                    <th>Controls</th>
                </tr>
            </thead>

            <tbody>
                ${(data || [])
                    .map(
                        profile => `
                            <tr>
                                <td>
                                    ${escapeHTML(
                                        profile.full_name ||
                                        "—"
                                    )}
                                </td>

                                <td>
                                    ${escapeHTML(
                                        profile.email ||
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
                                    ${
                                        profile.active
                                            ? "Active"
                                            : "Inactive"
                                    }
                                </td>

                                <td>
                                    <select
                                        data-role-user="${escapeHTML(
                                            profile.id
                                        )}"
                                    >
                                        ${ALL_ROLES
                                            .map(
                                                role =>
                                                    `<option value="${role}" ${
                                                        role ===
                                                        profile.role
                                                            ? "selected"
                                                            : ""
                                                    }>${formatRole(
                                                        role
                                                    )}</option>`
                                            )
                                            .join("")}
                                    </select>

                                    <button
                                        type="button"
                                        data-save-role="${escapeHTML(
                                            profile.id
                                        )}"
                                    >
                                        Save
                                    </button>

                                    <button
                                        type="button"
                                        class="danger-mini"
                                        data-kick-user="${escapeHTML(
                                            profile.id
                                        )}"
                                    >
                                        Deactivate
                                    </button>
                                </td>
                            </tr>
                        `
                    )
                    .join("")}
            </tbody>
        </table>
    `;

    table
        .querySelectorAll(
            "[data-save-role]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () =>
                    adminSaveRole(
                        button.dataset.saveRole
                    )
            );
        });

    table
        .querySelectorAll(
            "[data-kick-user]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () =>
                    adminKickUser(
                        button.dataset.kickUser
                    )
            );
        });
}

/* ============================================================
   ADMIN ROLE
============================================================ */

async function adminSaveRole(userId) {
    const select =
        document.querySelector(
            `[data-role-user="${CSS.escape(
                userId
            )}"]`
        );

    if (!select) {
        return;
    }

    const role = select.value;

    const { error } =
        await supabase.rpc(
            "admin_set_role",
            {
                p_user_id: userId,
                p_role: role
            }
        );

    if (error) {
        showToast(error.message);
        return;
    }

    showToast(
        "Role updated ✓"
    );

    await loadAdminUsers();
}

async function adminKickUser(userId) {
    if (
        !confirm(
            "Deactivate this account and release its active work?"
        )
    ) {
        return;
    }

    const { error } =
        await supabase.rpc(
            "admin_kick_user",
            {
                p_user_id: userId
            }
        );

    if (error) {
        showToast(error.message);
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
    const { data, error } =
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
            .order("role");

    if (error) {
        showToast(error.message);
        return;
    }

    const table =
        $("adminCoworkersTable");

    if (!table) {
        return;
    }

    table.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Status</th>
                </tr>
            </thead>

            <tbody>
                ${(data || [])
                    .map(
                        user => `
                            <tr>
                                <td>
                                    ${escapeHTML(
                                        user.full_name ||
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
                                    ${
                                        user.active
                                            ? "Active"
                                            : "Inactive"
                                    }
                                </td>
                            </tr>
                        `
                    )
                    .join("")}
            </tbody>
        </table>
    `;
}

/* ============================================================
   ADMIN ACCOUNT CREATION
============================================================ */

$("createStaffCoworkerBtn")
    ?.addEventListener(
        "click",
        createStaffCoworkerAccount
    );

async function createStaffCoworkerAccount() {
    if (!isAdmin()) {
        return;
    }

    const email =
        $("newWorkerEmail")
            ?.value
            .trim();

    const fullName =
        $("newWorkerName")
            ?.value
            .trim();

    const role =
        $("newWorkerRole")
            ?.value;

    const password =
        $("newWorkerPassword")
            ?.value;

    if (
        !email ||
        !password ||
        password.length < 6
    ) {
        showToast(
            "Enter an email and a temporary password of at least 6 characters."
        );

        return;
    }

    if (
        ![
            "staff",
            "reviewer",
            "coworker_2d_box",
            "coworker_polygon",
            "coworker_segmentation"
        ].includes(role)
    ) {
        showToast(
            "Choose a valid staff/reviewer/coworker role."
        );

        return;
    }

    const tokenResult =
        await supabase.auth.getSession();

    const token =
        tokenResult.data.session
            ?.access_token;

    if (!token) {
        showToast(
            "Admin session expired. Sign in again."
        );

        return;
    }

    const response =
        await fetch(
            `${SUPABASE_URL}/functions/v1/admin-create-user`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`
                },

                body: JSON.stringify({
                    email,
                    full_name:
                        fullName,
                    role,
                    password
                })
            }
        );

    const result =
        await response
            .json()
            .catch(
                () => ({})
            );

    if (!response.ok) {
        showToast(
            result.error ||
            "Unable to create account."
        );

        return;
    }

    $("newWorkerEmail").value = "";
    $("newWorkerName").value = "";
    $("newWorkerPassword").value = "";

    showToast(
        "Account created ✓"
    );

    await loadAdminUsers();
    await loadAdminCoworkers();
}

/* ============================================================
   ADMIN PAYMENTS
============================================================ */

async function loadAdminPayments() {
    if (!isAdmin()) {
        return;
    }

    const { data, error } =
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
                    ascending: false
                }
            );

    if (error) {
        showToast(error.message);
        return;
    }

    const table =
        $("adminPaymentsTable");

    if (!table) {
        return;
    }

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
                                            data-mark-paid="${escapeHTML(
                                                payment.id
                                            )}"
                                        >
                                            Mark paid
                                        </button>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            class="export-button"
                                            data-mark-not-paid="${escapeHTML(
                                                payment.id
                                            )}"
                                        >
                                            Not yet
                                        </button>
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
        .forEach(button => {
            button.addEventListener(
                "click",
                () =>
                    markPaymentPaid(
                        button.dataset.markPaid
                    )
            );
        });

    table
        .querySelectorAll(
            "[data-mark-not-paid]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () =>
                    markPaymentNotPaid(
                        button.dataset.markNotPaid
                    )
            );
        });
}

async function markPaymentPaid(paymentId) {
    if (!isAdmin()) {
        return;
    }

    const { error } =
        await supabase
            .from("task_payments")
            .update({
                status: "paid",
                paid_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                paymentId
            );

    if (error) {
        showToast(error.message);
        return;
    }

    showToast(
        "Payment marked paid ✓"
    );

    await loadAdminPayments();
}

async function markPaymentNotPaid(paymentId) {
    if (!isAdmin()) {
        return;
    }

    const { error } =
        await supabase
            .from("task_payments")
            .update({
                status: "not_paid",
                paid_at: null
            })
            .eq(
                "id",
                paymentId
            );

    if (error) {
        showToast(error.message);
        return;
    }

    showToast(
        "Payment marked not yet paid."
    );

    await loadAdminPayments();
}

/* ============================================================
   ADMIN ACTIVITY
============================================================ */

async function loadAdminActivity() {
    if (!hasAllAccess()) {
        return;
    }

    const { data, error } =
        await supabase
            .from("activity_logs")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(500);

    if (error) {
        showToast(error.message);
        return;
    }

    const table =
        $("adminActivityTable");

    if (!table) {
        return;
    }

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

async function adminAssignPrompt(taskId) {
    const email =
        prompt(
            "Enter the coworker's email address:"
        );

    if (!email) {
        return;
    }

    const { data, error } =
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
                p_task_id: taskId,
                p_user_id: data.id
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

$("adminExportCSV")
    ?.addEventListener(
        "click",
        adminExportCSV
    );

$("adminExportHTML")
    ?.addEventListener(
        "click",
        adminExportHTML
    );

async function getAdminExportData() {
    const [
        users,
        tasks,
        payments,
        activity
    ] =
        await Promise.all([
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
            payments.data || [],

        activity:
            activity.data || []
    };
}

async function adminExportCSV() {
    const data =
        await getAdminExportData();

    const sections = [];

    Object.entries(data)
        .forEach(
            ([name, rows]) => {
                sections.push(name);

                if (!rows.length) {
                    sections.push("");
                    return;
                }

                const headers =
                    Object.keys(
                        rows[0]
                    );

                sections.push(
                    headers.join(",")
                );

                rows.forEach(row => {
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
                });

                sections.push("");
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
        Object.entries(data)
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
                                                `<th>${escapeHTML(
                                                    h
                                                )}</th>`
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
                                                .join(
                                                    ""
                                                )}</tr>`
                                    )
                                    .join("")}
                            </tbody>
                        </table>
                    `;
                }
            )
            .join("");

    const html = `
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
   CUSTOMER EXPORT
============================================================ */

$("exportCSV")
    ?.addEventListener(
        "click",
        exportCurrentCSV
    );

$("exportHTML")
    ?.addEventListener(
        "click",
        exportCurrentHTML
    );

async function exportCurrentCSV() {
    const rows = getExportRows();

    if (!rows.length) {
        showToast(
            "There are no annotations to export."
        );
        return;
    }

    const headers = [
        "task_id",
        "annotation_id",
        "frame",
        "type",
        "class",
        "x",
        "y",
        "width",
        "height",
        "occlusion",
        "truncation",
        "score",
        "ai_generated",
        "corrected"
    ];

    const csv = [
        headers.join(","),
        ...rows.map(row =>
            headers
                .map(key =>
                    csvEscape(
                        row[key]
                    )
                )
                .join(",")
        )
    ].join("\n");

    downloadBlob(
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        ),
        `annotations-${CLOUD.currentTaskId || "export"}.csv`
    );

    showToast(
        "CSV exported ✓"
    );
}

async function exportCurrentHTML() {
    const rows = getExportRows();

    if (!rows.length) {
        showToast(
            "There are no annotations to export."
        );
        return;
    }

    const headers = [
        "task_id",
        "annotation_id",
        "frame",
        "type",
        "class",
        "x",
        "y",
        "width",
        "height",
        "occlusion",
        "truncation",
        "score",
        "ai_generated",
        "corrected"
    ];

    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Annotation Export</title>

<style>
body {
    font-family: Arial, sans-serif;
    padding: 24px;
    color: #222;
}

h1 {
    margin-bottom: 6px;
}

.meta {
    color: #666;
    margin-bottom: 20px;
}

table {
    border-collapse: collapse;
    width: 100%;
    font-size: 11px;
}

th,
td {
    border: 1px solid #ccc;
    padding: 7px;
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

<h1>Annotation Export</h1>

<div class="meta">
Task:
${escapeHTML(
    CLOUD.currentTask?.title ||
    CLOUD.currentTaskId ||
    "Current task"
)}

<br>

Exported:
${escapeHTML(
    new Date().toLocaleString()
)}
</div>

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
        row => `
<tr>
${headers
    .map(
        key =>
            `<td>${escapeHTML(
                row[key]
            )}</td>`
    )
    .join("")}
</tr>
`
    )
    .join("")}
</tbody>
</table>

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
        `annotations-${CLOUD.currentTaskId || "export"}.html`
    );

    showToast(
        "HTML exported ✓"
    );
}

function getExportRows() {
    return state.annotations.map(
        annotation => ({
            task_id:
                CLOUD.currentTaskId ||
                "",

            annotation_id:
                annotation.id ||
                "",

            frame:
                state.mediaType === "video"
                    ? state.currentFrame
                    : 0,

            type:
                annotation.type ||
                "",

            class:
                annotation.label ||
                "",

            x:
                annotation.x ?? "",

            y:
                annotation.y ?? "",

            width:
                annotation.width ?? "",

            height:
                annotation.height ?? "",

            occlusion:
                annotation.occlusion ??
                0,

            truncation:
                annotation.truncation ||
                "NONE",

            score:
                annotation.score ??
                "",

            ai_generated:
                annotation.aiGenerated
                    ? "true"
                    : "false",

            corrected:
                annotation.corrected
                    ? "true"
                    : "false"
        })
    );
}

function csvEscape(value) {
    return `"${String(
        value ?? ""
    ).replaceAll(
        '"',
        '""'
    )}"`;
}

function downloadBlob(blob, filename) {
    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement(
            "a"
        );

    link.href = url;
    link.download = filename;

    document.body.appendChild(
        link
    );

    link.click();
    link.remove();

    setTimeout(
        () =>
            URL.revokeObjectURL(
                url
            ),
        1000
    );
}

/* ============================================================
   PROFILE PICTURE
============================================================ */

$("profilePictureInput")
    ?.addEventListener(
        "change",
        handleAvatarUpload
    );

async function handleAvatarUpload(event) {
    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }

    if (
        !file.type.startsWith(
            "image/"
        )
    ) {
        showToast(
            "Please choose an image."
        );
        return;
    }

    if (
        file.size >
        5 * 1024 * 1024
    ) {
        showToast(
            "Profile image must be smaller than 5 MB."
        );
        return;
    }

    if (!CLOUD.session?.user?.id) {
        showToast(
            "Please sign in first."
        );
        return;
    }

    const userId =
        CLOUD.session.user.id;

    const extension =
        file.name
            .split(".")
            .pop()
            ?.toLowerCase() ||
        "jpg";

    const path =
        `${userId}/avatar.${extension}`;

    const { error } =
        await supabase.storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    upsert: true,
                    contentType:
                        file.type
                }
            );

    if (error) {
        showToast(
            `Avatar upload failed: ${error.message}`
        );
        return;
    }

    const {
        data: publicData
    } =
        supabase.storage
            .from("avatars")
            .getPublicUrl(path);

    const avatarUrl =
        publicData?.publicUrl;

    if (avatarUrl) {
        await supabase
            .from("profiles")
            .update({
                avatar_url:
                    avatarUrl
            })
            .eq(
                "id",
                userId
            );

        applyAvatar(
            avatarUrl
        );
    }

    showToast(
        "Profile picture updated ✓"
    );
}

function applyAvatar(url) {
    document
        .querySelectorAll(
            "[data-avatar]"
        )
        .forEach(element => {
            if (
                element.tagName ===
                "IMG"
            ) {
                element.src = url;
            } else {
                element.style.backgroundImage =
                    `url("${url}")`;
            }
        });

    const img =
        $("profileAvatar");

    if (img) {
        img.src = url;
    }
}

/* ============================================================
   WORK HISTORY
============================================================ */

$("workHistoryBtn")
    ?.addEventListener(
        "click",
        openWorkHistory
    );

async function openWorkHistory() {
    const modal =
        $("workHistory");

    if (modal) {
        modal.style.display = "grid";
    }

    await loadWorkHistory();
}

async function loadWorkHistory() {
    if (!CLOUD.session?.user?.id) {
        return;
    }

    const {
        data,
        error
    } =
        await supabase
            .from("workflow_events")
            .select("*")
            .eq(
                "user_id",
                CLOUD.session.user.id
            )
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            )
            .limit(200);

    if (error) {
        console.warn(
            "Work history:",
            error
        );
        return;
    }

    const list =
        $("workHistory");

    if (!list) {
        return;
    }

    list.innerHTML =
        (data || [])
            .map(
                event => `
                    <div class="history-item">

                        <div class="history-main">
                            <strong>
                                ${escapeHTML(
                                    event.event_type ||
                                    "Work event"
                                )}
                            </strong>

                            <span>
                                ${escapeHTML(
                                    event.task_id ||
                                    ""
                                )}
                            </span>
                        </div>

                        <div class="history-time">
                            ${escapeHTML(
                                formatDateTime(
                                    event.created_at
                                )
                            )}
                        </div>

                    </div>
                `
            )
            .join("") ||
        `
            <div class="empty-state">
                No work history yet.
            </div>
        `;
}

/* ============================================================
   THEME
============================================================ */

$("themeToggle")
    ?.addEventListener(
        "click",
        toggleTheme
    );

function toggleTheme() {
    const root =
        document.documentElement;

    const current =
        root.dataset.theme ||
        "dark";

    const next =
        current === "dark"
            ? "light"
            : "dark";

    root.dataset.theme =
        next;

    localStorage.setItem(
        "annotation-theme",
        next
    );

    updateThemeButton(
        next
    );
}

function restoreTheme() {
    const saved =
        localStorage.getItem(
            "annotation-theme"
        );

    const theme =
        saved === "light"
            ? "light"
            : "dark";

    document.documentElement
        .dataset
        .theme = theme;

    updateThemeButton(
        theme
    );
}

function updateThemeButton(theme) {
    const button =
        $("themeToggle");

    if (!button) {
        return;
    }

    button.title =
        theme === "dark"
            ? "Switch to light theme"
            : "Switch to dark theme";

    button.setAttribute(
        "aria-label",
        button.title
    );
}

/* ============================================================
   TIME-BASED GREETING
============================================================ */

function updateGreeting() {
    const hour =
        new Date().getHours();

    let greeting;

    let emoji;

    if (hour < 12) {
        greeting = "Good morning";
        emoji = "☀️";
    } else if (hour < 18) {
        greeting = "Good afternoon";
        emoji = "🌤️";
    } else {
        greeting = "Good evening";
        emoji = "🌙";
    }

    const name =
        CLOUD.profile?.full_name ||
        CLOUD.session?.user
            ?.email
            ?.split("@")[0] ||
        "there";

    const greetingElement =
        $("workspaceGreeting");

    if (greetingElement) {
        greetingElement.textContent =
            `${emoji} ${greeting}, ${name}`;
    }

    const accountElement =
        $("workspaceAccount");

    if (accountElement) {
        accountElement.textContent =
            CLOUD.session?.user?.email ||
            "";
    }
}

/* ============================================================
   ROLE / ACCESS HELPERS
============================================================ */

function isAdmin() {
    return (
        CLOUD.profile?.role ===
        "admin"
    );
}

function isReviewer() {
    return (
        CLOUD.profile?.role ===
        "reviewer"
    );
}

function hasAllAccess() {
    return [
        "admin",
        "staff"
    ].includes(
        CLOUD.profile?.role
    );
}

function isCoworker() {
    return [
        "coworker_2d_box",
        "coworker_polygon",
        "coworker_segmentation"
    ].includes(
        CLOUD.profile?.role
    );
}

function getRequiredWorkRole() {
    const shape =
        state.annotationMode ||
        state.selectedTool ||
        state.taskType ||
        CLOUD.currentTask
            ?.work_type;

    return (
        WORK_ROLE[shape] ||
        CLOUD.currentTask
            ?.work_role ||
        null
    );
}

function canUseCustomerUpload() {
    return (
        hasAllAccess() ||
        CLOUD.profile?.role ===
            "customer"
    );
}

function canUseManualAnnotation() {
    return (
        hasAllAccess() ||
        CLOUD.profile?.role ===
            "customer"
    );
}

function canUseAIAnnotation() {
    return !!CLOUD.session;
}

/* ============================================================
   ROLE-BASED UI
============================================================ */

function applyRolePermissions() {
    const role =
        CLOUD.profile?.role;

    const adminOnly =
        document.querySelectorAll(
            ".admin-only,[data-admin-only]"
        );

    adminOnly.forEach(
        element => {
            element.style.display =
                role === "admin"
                    ? ""
                    : "none";
        }
    );

    const customerOnly =
        document.querySelectorAll(
            ".customer-only,[data-customer-only]"
        );

    customerOnly.forEach(
        element => {
            element.style.display =
                canUseCustomerUpload()
                    ? ""
                    : "none";
        }
    );

    const manualTools =
        document.querySelectorAll(
            "[data-manual-annotation]"
        );

    manualTools.forEach(
        element => {
            element.style.display =
                canUseManualAnnotation()
                    ? ""
                    : "none";
        }
    );

    const aiTools =
        document.querySelectorAll(
            "[data-ai-annotation]"
        );

    aiTools.forEach(
        element => {
            element.style.display =
                canUseAIAnnotation()
                    ? ""
                    : "none";
        }
    );

    const roleLabel =
        $("currentUserRole");

    if (roleLabel) {
        roleLabel.textContent =
            formatRole(role);
    }
}

/* ============================================================
   AUTH GATE
============================================================ */

function showAuthGate() {
    const loginPage =
        $("loginPage");

    const app =
        document.querySelector(
            ".app"
        );

    if (
        !CLOUD.session
    ) {
        if (loginPage) {
            loginPage.style.display =
                "grid";
        }

        if (app) {
            app.style.display =
                "none";
        }

        return;
    }

    if (loginPage) {
        loginPage.style.display =
            "none";
    }

    if (app) {
        app.style.display =
            "";
    }

    updateGreeting();
    applyRolePermissions();
}

/* ============================================================
   FORCE PASSWORD RESET
============================================================ */

async function enforcePasswordReset() {
    if (
        !CLOUD.profile?.must_change_password
    ) {
        return;
    }

    const password =
        prompt(
            "For security, please choose a new password before continuing:"
        );

    if (!password) {
        return false;
    }

    if (password.length < 8) {
        showToast(
            "Password must contain at least 8 characters."
        );

        return false;
    }

    const {
        error
    } =
        await supabase.auth
            .updateUser({
                password
            });

    if (error) {
        showToast(
            error.message
        );

        return false;
    }

    await supabase
        .from("profiles")
        .update({
            must_change_password:
                false
        })
        .eq(
            "id",
            CLOUD.session.user.id
        );

    CLOUD.profile
        .must_change_password =
        false;

    showToast(
        "Password updated ✓"
    );

    return true;
}

/* ============================================================
   LOGIN / LOGOUT ACTIVITY
============================================================ */

async function recordLogin() {
    if (
        !CLOUD.session?.user?.id
    ) {
        return;
    }

    await supabase
        .from("login_logs")
        .insert({
            user_id:
                CLOUD.session.user.id,

            login_at:
                new Date().toISOString()
        });
}

async function recordLogout() {
    if (
        !CLOUD.session?.user?.id
    ) {
        return;
    }

    await supabase
        .from("profiles")
        .update({
            last_logout_at:
                new Date().toISOString()
        })
        .eq(
            "id",
            CLOUD.session.user.id
        );
}

/* ============================================================
   UTILITY FUNCTIONS
============================================================ */

function formatRole(role) {
    const labels = {
        admin: "Admin",
        staff: "Staff",
        reviewer: "Reviewer",
        coworker_2d_box:
            "2D Box Coworker",
        coworker_polygon:
            "Polygon Coworker",
        coworker_segmentation:
            "Segmentation Coworker",
        customer: "Customer"
    };

    return (
        labels[role] ||
        String(role || "")
            .replaceAll(
                "_",
                " "
            )
            .replace(
                /\b\w/g,
                c =>
                    c.toUpperCase()
            )
    );
}

function formatMoney(value) {
    const amount =
        Number(value || 0);

    return amount.toLocaleString(
        undefined,
        {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2
        }
    );
}

function formatDateTime(value) {
    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return date.toLocaleString();
}

function escapeHTML(value) {
    return String(
        value ?? ""
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
   START SUPABASE CLOUD CONNECTION
============================================================ */

initCloud().catch(error => {
    console.error("Supabase startup error:", error);

    if (typeof setAuthStatus === "function") {
        setAuthStatus(
            error?.message || "Unable to connect to Supabase.",
            true
        );
    }
});
/* ============================================================
   INITIAL UI SETUP
============================================================ */

restoreTheme();
updateGreeting();
updateTaskBar();
applyRolePermissions();

window.addEventListener(
    "beforeunload",
    () => {
        try {
            recordLogout();
        } catch {}
    }
);

/* ============================================================
   END OF PART 6
============================================================ */
