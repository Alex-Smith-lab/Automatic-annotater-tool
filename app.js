/* =========================================================
   AI ANNOTATION STUDIO PRO
   GitHub / GitHub Pages
   No Supabase
   ========================================================= */

import {
    pipeline,
    env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";


/* =========================================================
   TRANSFORMERS.JS SETTINGS
   ========================================================= */

/*
 * DETR does NOT need a tokenizer.
 *
 * The model works through the object-detection pipeline.
 *
 * We only show actual errors instead of unnecessary
 * informational messages.
 */

try {
    if (env && env.LogLevel) {
        env.logLevel = env.LogLevel.ERROR;
    }
} catch (e) {
    console.warn(
        "Could not change Transformers logging level.",
        e
    );
}


/* =========================================================
   CONFIGURATION
   ========================================================= */

const CONFIG = {

    detectionModel:
        "Xenova/detr-resnet-50",

    /*
     * Keep null until a proper segmentation model
     * is connected.
     */
    segmentationModel:
        null,

    defaultThreshold:
        0.50,

    maxHistory:
        500,

    maxUndo:
        100,

    storage: {

        rules:
            "ai_annotation_rules",

        training:
            "ai_annotation_training",

        history:
            "ai_annotation_history",

        classifications:
            "ai_annotation_classifications"

    }

};


/* =========================================================
   STATE
   ========================================================= */

const state = {

    image:
        null,

    imageUrl:
        null,

    imageBlob:
        null,

    imageName:
        "",

    imageWidth:
        0,

    imageHeight:
        0,

    annotationType:
        "bbox",

    activeTool:
        "select",

    threshold:
        0.50,

    applyRules:
        true,

    annotations:
        [],

    selectedId:
        null,

    undoStack:
        [],

    redoStack:
        [],

    zoom:
        1,

    minZoom:
        0.10,

    maxZoom:
        8,

    panX:
        0,

    panY:
        0,

    panning:
        false,

    panStartX:
        0,

    panStartY:
        0,

    panOriginX:
        0,

    panOriginY:
        0,

    detector:
        null,

    segmenter:
        null,

    detectorReady:
        false,

    segmenterReady:
        false,

    isProcessing:
        false,

    drag:
        null,

    classifications:
        new Set(),

    excludedClassifications:
        new Set(),

    nextManualClass:
        "object"

};


/* =========================================================
   DOM
   ========================================================= */

const $ =
    selector =>
        document.querySelector(
            selector
        );


const $$ =
    selector =>
        [
            ...document.querySelectorAll(
                selector
            )
        ];


const canvas =
    $("#annotationCanvas");


const ctx =
    canvas.getContext(
        "2d"
    );


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initialize
);


function initialize() {

    loadLocalData();

    ensureClassificationUI();

    setupNavigation();

    setupUpload();

    setupAnnotationTypes();

    setupTools();

    setupControls();

    setupCanvas();

    setupKeyboard();

    render();

    renderObjects();

    renderClassificationManager();

    updateTrainingPage();

    updateHistoryPage();

    updateCursor();

    setAIStatus(
        "Ready"
    );

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

    $$(".nav-item")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const page =
                            button.dataset.page;


                        $$(".nav-item")
                            .forEach(
                                item =>
                                    item.classList.remove(
                                        "active"
                                    )
                            );


                        button.classList.add(
                            "active"
                        );


                        $$(".page")
                            .forEach(
                                item =>
                                    item.classList.remove(
                                        "active-page"
                                    )
                            );


                        const target =
                            $(
                                `#${page}Page`
                            );


                        if (target) {

                            target.classList.add(
                                "active-page"
                            );

                        }


                        const titles = {

                            workspace: [
                                "Annotation Workspace",
                                "Upload an image and let AI create annotations."
                            ],

                            rules: [
                                "Annotation Rules",
                                "Control how customer-specific annotations should be created."
                            ],

                            training: [
                                "Learning Data",
                                "Human corrections become training examples."
                            ],

                            history: [
                                "Annotation History",
                                "Review previous local annotation sessions."
                            ]

                        };


                        if (
                            titles[page]
                        ) {

                            const title =
                                $("#pageTitle");

                            const subtitle =
                                $("#pageSubtitle");


                            if (title) {

                                title.textContent =
                                    titles[page][0];

                            }


                            if (subtitle) {

                                subtitle.textContent =
                                    titles[page][1];

                            }

                        }

                    }
                );

            }
        );

}


/* =========================================================
   UPLOAD
   ========================================================= */

function setupUpload() {

    const input =
        $("#imageInput");


    if (!input) {
        return;
    }


    input.addEventListener(
        "change",
        handleImageUpload
    );

}


async function handleImageUpload(
    event
) {

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
            "Please select a JPG, PNG or WEBP image."
        );

        return;

    }


    try {

        state.imageBlob =
            file;

        state.imageName =
            file.name;


        if (
            state.imageUrl
        ) {

            URL.revokeObjectURL(
                state.imageUrl
            );

        }


        state.imageUrl =
            URL.createObjectURL(
                file
            );


        const image =
            await loadImage(
                state.imageUrl
            );


        state.image =
            image;

        state.imageWidth =
            image.naturalWidth;

        state.imageHeight =
            image.naturalHeight;


        state.annotations =
            [];

        state.selectedId =
            null;

        state.undoStack =
            [];

        state.redoStack =
            [];


        state.panX =
            0;

        state.panY =
            0;


        canvas.width =
            state.imageWidth;

        canvas.height =
            state.imageHeight;


        const imageName =
            $("#imageName");


        if (imageName) {

            imageName.textContent =
                state.imageName;

        }


        const annotateButton =
            $("#annotateBtn");


        if (annotateButton) {

            annotateButton.disabled =
                false;

        }


        const empty =
            $("#emptyState");


        if (empty) {

            empty.style.display =
                "none";

        }


        canvas.style.display =
            "block";


        calculateFitZoom();

        render();

        renderObjects();

        updateCanvasInfo();

        updateQuality(
            []
        );


        setProcessing(
            "Image ready. Choose annotation type and click AUTO ANNOTATE."
        );


        showToast(
            "Image loaded successfully."
        );


    } catch (error) {

        console.error(
            error
        );


        showToast(
            "Could not load image."
        );

    }

}


/* =========================================================
   IMAGE LOADER
   ========================================================= */

function loadImage(
    source
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const image =
                new Image();


            image.onload =
                () =>
                    resolve(
                        image
                    );


            image.onerror =
                () =>
                    reject(
                        new Error(
                            "Image could not be decoded."
                        )
                    );


            image.src =
                source;

        }
    );

}


/* =========================================================
   ANNOTATION TYPE
   ========================================================= */

function setupAnnotationTypes() {

    $$(".annotation-type")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        $$(".annotation-type")
                            .forEach(
                                b =>
                                    b.classList.remove(
                                        "active"
                                    )
                            );


                        button.classList.add(
                            "active"
                        );


                        state.annotationType =
                            button.dataset.type;


                        if (
                            state.annotationType ===
                            "segmentation" &&
                            !CONFIG.segmentationModel
                        ) {

                            showToast(
                                "Segmentation editor is ready, but a true segmentation AI model still needs to be connected."
                            );

                        }

                    }
                );

            }
        );

}


/* =========================================================
   TOOLS
   ========================================================= */

function setupTools() {

    $$(".tool-button")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        $$(".tool-button")
                            .forEach(
                                b =>
                                    b.classList.remove(
                                        "active"
                                    )
                            );


                        button.classList.add(
                            "active"
                        );


                        state.activeTool =
                            button.dataset.tool;


                        updateCursor();

                    }
                );

            }
        );

}


/* =========================================================
   CONTROLS
   ========================================================= */

function setupControls() {

    const confidence =
        $("#confidenceSlider");


    if (confidence) {

        confidence.addEventListener(
            "input",
            event => {

                state.threshold =
                    Number(
                        event.target.value
                    ) / 100;


                const value =
                    $("#thresholdValue");


                if (value) {

                    value.textContent =
                        `${event.target.value}%`;

                }

            }
        );

    }


    const rules =
        $("#autoRules");


    if (rules) {

        rules.addEventListener(
            "change",
            event => {

                state.applyRules =
                    event.target.checked;

            }
        );

    }


    bind(
        "#annotateBtn",
        "click",
        runAIAnnotation
    );


    bind(
        "#downloadBtn",
        "click",
        downloadAnnotatedImage
    );


    bind(
        "#deleteSelected",
        "click",
        deleteSelected
    );


    bind(
        "#resetBtn",
        "click",
        resetAnnotations
    );


    bind(
        "#undoBtn",
        "click",
        undo
    );


    bind(
        "#redoBtn",
        "click",
        redo
    );


    bind(
        "#zoomIn",
        "click",
        () =>
            setZoom(
                state.zoom *
                1.20
            )
    );


    bind(
        "#zoomOut",
        "click",
        () =>
            setZoom(
                state.zoom /
                1.20
            )
    );


    bind(
        "#fitCanvas",
        "click",
        calculateFitZoom
    );


    bind(
        "#saveRules",
        "click",
        saveRules
    );


    bind(
        "#exportTraining",
        "click",
        exportTraining
    );


    bind(
        "#clearHistory",
        "click",
        clearHistory
    );


    bind(
        "#closeModal",
        "click",
        () => {

            const modal =
                $("#annotationModal");


            if (modal) {

                modal.classList.add(
                    "hidden"
                );

            }

        }
    );

}


/* =========================================================
   SAFE BIND
   ========================================================= */

function bind(
    selector,
    event,
    callback
) {

    const element =
        $(selector);


    if (element) {

        element.addEventListener(
            event,
            callback
        );

    }

}


/* =========================================================
   AI MODEL
   ========================================================= */

async function loadDetector() {

    if (
        state.detector
    ) {

        return state.detector;

    }


    setAIStatus(
        "Downloading AI model..."
    );


    /*
     * This is the official Transformers.js
     * usage pattern for this model.
     */

    state.detector =
        await pipeline(
            "object-detection",
            CONFIG.detectionModel,
            {
                dtype:
                    "q8"
            }
        );


    state.detectorReady =
        true;


    setAIStatus(
        "Detection ready"
    );


    return state.detector;

}


/* =========================================================
   AI ANNOTATION
   ========================================================= */

async function runAIAnnotation() {

    if (!state.image) {

        showToast(
            "Upload an image first."
        );

        return;

    }


    if (
        state.isProcessing
    ) {

        return;

    }


    state.isProcessing =
        true;


    const button =
        $("#annotateBtn");


    if (button) {

        button.disabled =
            true;

    }


    try {

        saveUndoState();


        let results =
            [];


        /* -------------------------------------------------
           BOX
        ------------------------------------------------- */

        if (
            state.annotationType ===
            "bbox"
        ) {

            setProcessing(
                "Loading object detection AI..."
            );


            const detector =
                await loadDetector();


            setProcessing(
                "AI is analysing the image..."
            );


            results =
                await detector(
                    state.imageUrl,
                    {
                        threshold:
                            state.threshold
                    }
                );


            state.annotations =
                convertDetections(
                    results
                );

        }


        /* -------------------------------------------------
           POLYGON
        ------------------------------------------------- */

        else if (
            state.annotationType ===
            "polygon"
        ) {

            setProcessing(
                "Detecting objects for editable polygons..."
            );


            const detector =
                await loadDetector();


            results =
                await detector(
                    state.imageUrl,
                    {
                        threshold:
                            state.threshold
                    }
                );


            const boxes =
                convertDetections(
                    results
                );


            state.annotations =
                boxes.map(
                    convertBoxToPolygon
                );

        }


        /* -------------------------------------------------
           SEGMENTATION
        ------------------------------------------------- */

        else if (
            state.annotationType ===
            "segmentation"
        ) {

            if (
                !CONFIG.segmentationModel
            ) {

                /*
                 * Do NOT create fake segmentation.
                 */

                throw new Error(
                    "No true segmentation model is configured yet."
                );

            }


            const segmenter =
                await loadSegmenter();


            results =
                await segmenter(
                    state.imageUrl
                );


            state.annotations =
                await convertSegments(
                    results
                );

        }


        if (
            state.applyRules
        ) {

            state.annotations =
                applyAnnotationRules(
                    state.annotations
                );

        }


        rebuildClassificationSet();


        state.selectedId =
            state.annotations[0]?.id ||
            null;


        render();

        renderObjects();

        renderClassificationManager();

        updateCanvasInfo();

        updateQuality(
            state.annotations
        );


        saveTrainingSnapshot();

        saveHistory();

        updateTrainingPage();

        updateHistoryPage();


        setProcessing(
            `${state.annotations.length} annotations created. Review them before export.`
        );


        showModal(
            `${state.annotations.length} annotation(s) created successfully.`
        );


    } catch (error) {

        console.error(
            "AI ANNOTATION ERROR:",
            error
        );


        let message =
            error?.message ||
            "AI annotation failed.";


        if (
            message.includes(
                "Unsupported input type"
            )
        ) {

            message =
                "The image input was rejected. The system now sends the uploaded image URL to Transformers.js.";

        }


        setProcessing(
            "AI annotation failed."
        );


        showToast(
            message
        );

    } finally {

        state.isProcessing =
            false;


        if (button) {

            button.disabled =
                false;

        }


        setAIStatus(
            "Ready"
        );

    }

}


/* =========================================================
   DETECTION CONVERTER
   ========================================================= */

function convertDetections(
    results
) {

    if (
        !Array.isArray(results)
    ) {

        return [];

    }


    return results
        .filter(
            item =>
                item &&
                item.box
        )
        .map(
            item => {

                const box =
                    item.box;


                const xmin =
                    Number(
                        box.xmin
                    );


                const ymin =
                    Number(
                        box.ymin
                    );


                const xmax =
                    Number(
                        box.xmax
                    );


                const ymax =
                    Number(
                        box.ymax
                    );


                return {

                    id:
                        createId(),

                    type:
                        "bbox",

                    label:
                        normalizeLabel(
                            item.label
                        ),

                    confidence:
                        Number(
                            item.score ||
                            0
                        ),

                    x:
                        clamp(
                            xmin,
                            0,
                            state.imageWidth
                        ),

                    y:
                        clamp(
                            ymin,
                            0,
                            state.imageHeight
                        ),

                    width:
                        Math.max(
                            2,
                            xmax -
                            xmin
                        ),

                    height:
                        Math.max(
                            2,
                            ymax -
                            ymin
                        ),

                    points:
                        null,

                    mask:
                        null,

                    source:
                        "ai",

                    review:
                        false

                };

            }
        );

}


/* =========================================================
   BOX → POLYGON
   ========================================================= */

function convertBoxToPolygon(
    annotation
) {

    return {

        ...annotation,

        type:
            "polygon",

        points: [

            {
                x:
                    annotation.x,

                y:
                    annotation.y
            },

            {
                x:
                    annotation.x +
                    annotation.width,

                y:
                    annotation.y
            },

            {
                x:
                    annotation.x +
                    annotation.width,

                y:
                    annotation.y +
                    annotation.height
            },

            {
                x:
                    annotation.x,

                y:
                    annotation.y +
                    annotation.height
            }

        ]

    };

}


/* =========================================================
   SEGMENTATION
   ========================================================= */

async function loadSegmenter() {

    if (
        state.segmenter
    ) {

        return state.segmenter;

    }


    if (
        !CONFIG.segmentationModel
    ) {

        throw new Error(
            "Segmentation model is not configured."
        );

    }


    state.segmenter =
        await pipeline(
            "image-segmentation",
            CONFIG.segmentationModel,
            {
                dtype:
                    "q8"
            }
        );


    state.segmenterReady =
        true;


    return state.segmenter;

}


async function convertSegments(
    results
) {

    if (
        !Array.isArray(results)
    ) {

        return [];

    }


    const output =
        [];


    for (
        const item
        of results
    ) {

        output.push({

            id:
                createId(),

            type:
                "segmentation",

            label:
                normalizeLabel(
                    item.label
                ),

            confidence:
                Number(
                    item.score ||
                    1
                ),

            x:
                0,

            y:
                0,

            width:
                state.imageWidth,

            height:
                state.imageHeight,

            points:
                null,

            mask:
                null,

            source:
                "ai",

            review:
                false

        });

    }


    return output;

}


/* =========================================================
   RULE ENGINE
   ========================================================= */

function applyAnnotationRules(
    annotations
) {

    return annotations.map(
        annotation => {

            const updated =
                {
                    ...annotation
                };


            updated.review =
                false;


            if (
                updated.confidence <
                state.threshold
            ) {

                updated.review =
                    true;

            }


            if (
                updated.type ===
                "bbox"
            ) {

                if (
                    updated.width <
                    3 ||
                    updated.height <
                    3
                ) {

                    updated.review =
                        true;

                }

            }


            return updated;

        }
    );

}


/* =========================================================
   CANVAS
   ========================================================= */

function setupCanvas() {

    canvas.addEventListener(
        "mousedown",
        canvasMouseDown
    );


    canvas.addEventListener(
        "mousemove",
        canvasMouseMove
    );


    canvas.addEventListener(
        "mouseup",
        canvasMouseUp
    );


    canvas.addEventListener(
        "mouseleave",
        canvasMouseUp
    );


    canvas.addEventListener(
        "wheel",
        canvasWheel,
        {
            passive:
                false
        }
    );


    canvas.addEventListener(
        "dblclick",
        canvasDoubleClick
    );

}


/* =========================================================
   MOUSE DOWN
   ========================================================= */

function canvasMouseDown(
    event
) {

    if (
        !state.image
    ) {

        return;

    }


    /*
     * Middle mouse = pan
     */

    if (
        event.button ===
        1
    ) {

        startPan(
            event
        );

        event.preventDefault();

        return;

    }


    /*
     * Pan tool
     */

    if (
        state.activeTool ===
        "pan"
    ) {

        startPan(
            event
        );

        return;

    }


    const point =
        screenToImage(
            event.clientX,
            event.clientY
        );


    /*
     * DRAW
     */

    if (
        state.activeTool ===
        "draw"
    ) {

        startDrawing(
            point
        );

        return;

    }


    /*
     * ERASE
     */

    if (
        state.activeTool ===
        "erase"
    ) {

        const hit =
            findAnnotationAt(
                point.x,
                point.y
            );


        if (hit) {

            saveUndoState();

            removeAnnotation(
                hit.id
            );

        }


        return;

    }


    /*
     * SELECT
     */

    if (
        state.activeTool ===
        "select"
    ) {

        selectOrResize(
            point
        );

    }

}


/* =========================================================
   MOUSE MOVE
   ========================================================= */

function canvasMouseMove(
    event
) {

    if (
        state.panning
    ) {

        movePan(
            event
        );

        return;

    }


    if (
        !state.drag
    ) {

        return;

    }


    const point =
        screenToImage(
            event.clientX,
            event.clientY
        );


    handleDrag(
        point
    );

}


/* =========================================================
   MOUSE UP
   ========================================================= */

function canvasMouseUp() {

    if (
        state.panning
    ) {

        state.panning =
            false;


        canvas.style.cursor =
            state.activeTool ===
            "pan"
                ? "grab"
                : "default";

    }


    if (
        state.drag
    ) {

        state.drag =
            null;


        render();

        renderObjects();

        updateCanvasInfo();

        saveTrainingSnapshot();

    }

}


/* =========================================================
   PAN
   ========================================================= */

function startPan(
    event
) {

    state.panning =
        true;


    state.panStartX =
        event.clientX;


    state.panStartY =
        event.clientY;


    state.panOriginX =
        state.panX;


    state.panOriginY =
        state.panY;


    canvas.style.cursor =
        "grabbing";

}


function movePan(
    event
) {

    const dx =
        event.clientX -
        state.panStartX;


    const dy =
        event.clientY -
        state.panStartY;


    state.panX =
        state.panOriginX +
        dx;


    state.panY =
        state.panOriginY +
        dy;


    applyCanvasTransform();

}


/* =========================================================
   ZOOM
   ========================================================= */

function canvasWheel(
    event
) {

    event.preventDefault();


    if (
        !state.image
    ) {

        return;

    }


    const oldZoom =
        state.zoom;


    const direction =
        event.deltaY < 0
            ? 1.15
            : 1 / 1.15;


    const newZoom =
        clamp(
            oldZoom *
            direction,
            state.minZoom,
            state.maxZoom
        );


    if (
        newZoom ===
        oldZoom
    ) {

        return;

    }


    /*
     * Zoom around mouse position.
     */

    const rect =
        canvas.getBoundingClientRect();


    const mouseX =
        event.clientX -
        rect.left;


    const mouseY =
        event.clientY -
        rect.top;


    const imageBefore =
        screenToImage(
            event.clientX,
            event.clientY
        );


    state.zoom =
        newZoom;


    state.panX =
        mouseX -
        (
            imageBefore.x *
            state.zoom
        );


    state.panY =
        mouseY -
        (
            imageBefore.y *
            state.zoom
        );


    applyCanvasTransform();

}


/* =========================================================
   SET ZOOM
   ========================================================= */

function setZoom(
    zoom
) {

    state.zoom =
        clamp(
            zoom,
            state.minZoom,
            state.maxZoom
        );


    applyCanvasTransform();

}


/* =========================================================
   FIT
   ========================================================= */

function calculateFitZoom() {

    if (
        !state.image
    ) {

        return;

    }


    const container =
        $("#canvasContainer");


    if (!container) {

        return;

    }


    const availableWidth =
        Math.max(
            100,
            container.clientWidth -
            30
        );


    const availableHeight =
        Math.max(
            100,
            container.clientHeight -
            30
        );


    const xZoom =
        availableWidth /
        state.imageWidth;


    const yZoom =
        availableHeight /
        state.imageHeight;


    state.zoom =
        clamp(
            Math.min(
                xZoom,
                yZoom
            ),
            state.minZoom,
            1
        );


    state.panX =
        0;


    state.panY =
        0;


    applyCanvasTransform();

}


/* =========================================================
   TRANSFORM
   ========================================================= */

function applyCanvasTransform() {

    canvas.style.transform =
        `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;


    const zoomValue =
        $("#zoomValue");


    if (zoomValue) {

        zoomValue.textContent =
            `${Math.round(
                state.zoom *
                100
            )}%`;

    }

}


/* =========================================================
   SCREEN → IMAGE
   ========================================================= */

function screenToImage(
    clientX,
    clientY
) {

    const rect =
        canvas.getBoundingClientRect();


    /*
     * Because getBoundingClientRect()
     * already includes transform, we need to
     * use the transformed top-left.
     */

    const x =
        (
            clientX -
            rect.left
        ) /
        state.zoom;


    const y =
        (
            clientY -
            rect.top
        ) /
        state.zoom;


    return {

        x:
            clamp(
                x,
                0,
                state.imageWidth
            ),

        y:
            clamp(
                y,
                0,
                state.imageHeight
            )

    };

}


/* =========================================================
   START DRAWING
   ========================================================= */

function startDrawing(
    point
) {

    saveUndoState();


    const label =
        state.nextManualClass ||
        "object";


    if (
        state.annotationType ===
        "bbox"
    ) {

        const annotation = {

            id:
                createId(),

            type:
                "bbox",

            label,

            confidence:
                1,

            x:
                point.x,

            y:
                point.y,

            width:
                1,

            height:
                1,

            points:
                null,

            mask:
                null,

            source:
                "human",

            review:
                false

        };


        state.annotations.push(
            annotation
        );


        state.selectedId =
            annotation.id;


        state.drag = {

            mode:
                "draw",

            id:
                annotation.id,

            startX:
                point.x,

            startY:
                point.y

        };


        return;

    }


    if (
        state.annotationType ===
        "polygon"
    ) {

        const annotation = {

            id:
                createId(),

            type:
                "polygon",

            label,

            confidence:
                1,

            x:
                point.x,

            y:
                point.y,

            width:
                0,

            height:
                0,

            points: [

                {
                    x:
                        point.x,

                    y:
                        point.y
                },

                {
                    x:
                        point.x +
                        80,

                    y:
                        point.y
                },

                {
                    x:
                        point.x +
                        80,

                    y:
                        point.y +
                        80
                },

                {
                    x:
                        point.x,

                    y:
                        point.y +
                        80
                }

            ],

            mask:
                null,

            source:
                "human",

            review:
                false

        };


        state.annotations.push(
            annotation
        );


        state.selectedId =
            annotation.id;


        state.drag = {

            mode:
                "move",

            id:
                annotation.id,

            offsetX:
                0,

            offsetY:
                0

        };


        render();

        renderObjects();

        return;

    }


    /*
     * Segmentation is normally edited using
     * a proper mask editor.
     */

    showToast(
        "Use a segmentation model to create masks, then edit/delete them."
    );

}


/* =========================================================
   SELECT / RESIZE
   ========================================================= */

function selectOrResize(
    point
) {

    const selected =
        state.selectedId
            ? state.annotations.find(
                a =>
                    a.id ===
                    state.selectedId
            )
            : null;


    /*
     * First check resize handles.
     */

    if (
        selected &&
        selected.type ===
        "bbox"
    ) {

        const handle =
            getResizeHandle(
                selected,
                point
            );


        if (handle) {

            saveUndoState();


            state.drag = {

                mode:
                    "resize",

                id:
                    selected.id,

                handle,

                original:
                    clone(
                        selected
                    )

            };


            return;

        }

    }


    /*
     * Polygon vertex.
     */

    if (
        selected &&
        selected.type ===
        "polygon"
    ) {

        const vertex =
            getPolygonVertex(
                selected,
                point
            );


        if (
            vertex !==
            -1
        ) {

            saveUndoState();


            state.drag = {

                mode:
                    "vertex",

                id:
                    selected.id,

                vertex

            };


            return;

        }

    }


    /*
     * Object body.
     */

    const hit =
        findAnnotationAt(
            point.x,
            point.y
        );


    if (!hit) {

        state.selectedId =
            null;


        render();

        renderObjects();

        return;

    }


    state.selectedId =
        hit.id;


    saveUndoState();


    if (
        hit.type ===
        "bbox"
    ) {

        state.drag = {

            mode:
                "move",

            id:
                hit.id,

            offsetX:
                point.x -
                hit.x,

            offsetY:
                point.y -
                hit.y

        };

    }


    else if (
        hit.type ===
        "polygon"
    ) {

        state.drag = {

            mode:
                "polygonMove",

            id:
                hit.id,

            startX:
                point.x,

            startY:
                point.y,

            originalPoints:
                clone(
                    hit.points
                )

        };

    }


    render();

    renderObjects();

}


/* =========================================================
   HANDLE DRAG
   ========================================================= */

function handleDrag(
    point
) {

    const drag =
        state.drag;


    if (!drag) {
        return;
    }


    const annotation =
        state.annotations.find(
            a =>
                a.id ===
                drag.id
        );


    if (!annotation) {
        return;
    }


    /*
     * CREATE BOX
     */

    if (
        drag.mode ===
        "draw"
    ) {

        annotation.x =
            Math.min(
                drag.startX,
                point.x
            );


        annotation.y =
            Math.min(
                drag.startY,
                point.y
            );


        annotation.width =
            Math.max(
                2,
                Math.abs(
                    point.x -
                    drag.startX
                )
            );


        annotation.height =
            Math.max(
                2,
                Math.abs(
                    point.y -
                    drag.startY
                )
            );

    }


    /*
     * MOVE BOX
     */

    else if (
        drag.mode ===
        "move"
    ) {

        annotation.x =
            clamp(
                point.x -
                drag.offsetX,
                0,
                state.imageWidth -
                annotation.width
            );


        annotation.y =
            clamp(
                point.y -
                drag.offsetY,
                0,
                state.imageHeight -
                annotation.height
            );


        annotation.source =
            "human";

    }


    /*
     * RESIZE BOX
     */

    else if (
        drag.mode ===
        "resize"
    ) {

        resizeBox(
            annotation,
            drag,
            point
        );


        annotation.source =
            "human";

    }


    /*
     * MOVE POLYGON
     */

    else if (
        drag.mode ===
        "polygonMove"
    ) {

        const dx =
            point.x -
            drag.startX;


        const dy =
            point.y -
            drag.startY;


        annotation.points =
            drag.originalPoints.map(
                p => ({

                    x:
                        clamp(
                            p.x +
                            dx,
                            0,
                            state.imageWidth
                        ),

                    y:
                        clamp(
                            p.y +
                            dy,
                            0,
                            state.imageHeight
                        )

                })
            );


        annotation.source =
            "human";

    }


    /*
     * MOVE POLYGON VERTEX
     */

    else if (
        drag.mode ===
        "vertex"
    ) {

        if (
            annotation.points &&
            annotation.points[
                drag.vertex
            ]
        ) {

            annotation.points[
                drag.vertex
            ] = {

                x:
                    point.x,

                y:
                    point.y

            };


            annotation.source =
                "human";

        }

    }


    render();

}


/* =========================================================
   RESIZE BOX
   ========================================================= */

function resizeBox(
    box,
    drag,
    point
) {

    const minSize =
        4;


    const original =
        drag.original;


    let left =
        original.x;


    let top =
        original.y;


    let right =
        original.x +
        original.width;


    let bottom =
        original.y +
        original.height;


    const handle =
        drag.handle;


    if (
        handle.includes(
            "w"
        )
    ) {

        left =
            Math.min(
                point.x,
                right -
                minSize
            );

    }


    if (
        handle.includes(
            "e"
        )
    ) {

        right =
            Math.max(
                point.x,
                left +
                minSize
            );

    }


    if (
        handle.includes(
            "n"
        )
    ) {

        top =
            Math.min(
                point.y,
                bottom -
                minSize
            );

    }


    if (
        handle.includes(
            "s"
        )
    ) {

        bottom =
            Math.max(
                point.y,
                top +
                minSize
            );

    }


    box.x =
        clamp(
            left,
            0,
            state.imageWidth -
            minSize
        );


    box.y =
        clamp(
            top,
            0,
            state.imageHeight -
            minSize
        );


    box.width =
        clamp(
            right -
            box.x,
            minSize,
            state.imageWidth -
            box.x
        );


    box.height =
        clamp(
            bottom -
            box.y,
            minSize,
            state.imageHeight -
            box.y
        );

}


/* =========================================================
   RESIZE HANDLES
   ========================================================= */

function getResizeHandle(
    box,
    point
) {

    const size =
        12 /
        state.zoom;


    const handles = {

        nw: [
            box.x,
            box.y
        ],

        n: [
            box.x +
            box.width / 2,
            box.y
        ],

        ne: [
            box.x +
            box.width,
            box.y
        ],

        e: [
            box.x +
            box.width,
            box.y +
            box.height / 2
        ],

        se: [
            box.x +
            box.width,
            box.y +
            box.height
        ],

        s: [
            box.x +
            box.width / 2,
            box.y +
            box.height
        ],

        sw: [
            box.x,
            box.y +
            box.height
        ],

        w: [
            box.x,
            box.y +
            box.height / 2
        ]

    };


    for (
        const [
            name,
            position
        ]
        of Object.entries(
            handles
        )
    ) {

        if (
            Math.abs(
                point.x -
                position[0]
            ) <= size &&
            Math.abs(
                point.y -
                position[1]
            ) <= size
        ) {

            return name;

        }

    }


    return null;

}


/* =========================================================
   POLYGON VERTEX
   ========================================================= */

function getPolygonVertex(
    polygon,
    point
) {

    if (
        !polygon.points
    ) {

        return -1;

    }


    const tolerance =
        14 /
        state.zoom;


    for (
        let i = 0;

        i <
        polygon.points.length;

        i++
    ) {

        const p =
            polygon.points[i];


        const distance =
            Math.hypot(
                p.x -
                point.x,
                p.y -
                point.y
            );


        if (
            distance <=
            tolerance
        ) {

            return i;

        }

    }


    return -1;

}


/* =========================================================
   DOUBLE CLICK
   ========================================================= */

function canvasDoubleClick(
    event
) {

    const point =
        screenToImage(
            event.clientX,
            event.clientY
        );


    const hit =
        findAnnotationAt(
            point.x,
            point.y
        );


    if (!hit) {

        return;

    }


    editClassification(
        hit
    );

}


/* =========================================================
   FIND ANNOTATION
   ========================================================= */

function findAnnotationAt(
    x,
    y
) {

    for (
        let i =
            state.annotations.length -
            1;

        i >= 0;

        i--
    ) {

        const annotation =
            state.annotations[i];


        if (
            annotation.type ===
            "bbox"
        ) {

            if (
                x >=
                    annotation.x &&
                x <=
                    annotation.x +
                    annotation.width &&
                y >=
                    annotation.y &&
                y <=
                    annotation.y +
                    annotation.height
            ) {

                return annotation;

            }

        }


        if (
            annotation.type ===
            "polygon"
        ) {

            if (
                pointInsidePolygon(
                    x,
                    y,
                    annotation.points
                )
            ) {

                return annotation;

            }

        }


        if (
            annotation.type ===
            "segmentation"
        ) {

            /*
             * Until actual mask hit testing is
             * connected, use its bounding region.
             */

            if (
                x >=
                    annotation.x &&
                x <=
                    annotation.x +
                    annotation.width &&
                y >=
                    annotation.y &&
                y <=
                    annotation.y +
                    annotation.height
            ) {

                return annotation;

            }

        }

    }


    return null;

}


/* =========================================================
   POLYGON TEST
   ========================================================= */

function pointInsidePolygon(
    x,
    y,
    points
) {

    if (
        !points ||
        points.length <
            3
    ) {

        return false;

    }


    let inside =
        false;


    for (
        let i = 0,
        j =
            points.length - 1;

        i <
        points.length;

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
                yi > y
            ) !==
            (
                yj > y
            ) &&
            x <
                (
                    xj -
                    xi
                ) *
                (
                    y -
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


/* =========================================================
   RENDER
   ========================================================= */

function render() {

    if (
        !state.image
    ) {

        return;

    }


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    ctx.drawImage(
        state.image,
        0,
        0
    );


    for (
        const annotation
        of state.annotations
    ) {

        if (
            annotation.type ===
            "bbox"
        ) {

            drawBox(
                annotation
            );

        }


        else if (
            annotation.type ===
            "polygon"
        ) {

            drawPolygon(
                annotation
            );

        }


        else if (
            annotation.type ===
            "segmentation"
        ) {

            drawSegmentation(
                annotation
            );

        }

    }

}


/* =========================================================
   DRAW BOX
   ========================================================= */

function drawBox(
    annotation
) {

    const selected =
        annotation.id ===
        state.selectedId;


    ctx.save();


    ctx.lineWidth =
        selected
            ? 3
            : 2;


    ctx.strokeStyle =
        selected
            ? "#a78bfa"
            : "#22c55e";


    ctx.fillStyle =
        selected
            ? "rgba(139,92,246,.08)"
            : "rgba(34,197,94,.04)";


    ctx.fillRect(
        annotation.x,
        annotation.y,
        annotation.width,
        annotation.height
    );


    ctx.strokeRect(
        annotation.x,
        annotation.y,
        annotation.width,
        annotation.height
    );


    drawLabel(
        annotation.label,
        annotation.confidence,
        annotation.x,
        annotation.y
    );


    if (
        selected
    ) {

        drawResizeHandles(
            annotation
        );

    }


    ctx.restore();

}


/* =========================================================
   RESIZE HANDLES
   ========================================================= */

function drawResizeHandles(
    box
) {

    const size =
        8 /
        state.zoom;


    const handles = [

        [
            box.x,
            box.y
        ],

        [
            box.x +
            box.width / 2,
            box.y
        ],

        [
            box.x +
            box.width,
            box.y
        ],

        [
            box.x +
            box.width,
            box.y +
            box.height / 2
        ],

        [
            box.x +
            box.width,
            box.y +
            box.height
        ],

        [
            box.x +
            box.width / 2,
            box.y +
            box.height
        ],

        [
            box.x,
            box.y +
            box.height
        ],

        [
            box.x,
            box.y +
            box.height / 2
        ]

    ];


    ctx.fillStyle =
        "#ffffff";


    ctx.strokeStyle =
        "#8b5cf6";


    ctx.lineWidth =
        2 /
        state.zoom;


    handles.forEach(
        position => {

            ctx.beginPath();


            ctx.rect(
                position[0] -
                    size,
                position[1] -
                    size,
                size * 2,
                size * 2
            );


            ctx.fill();

            ctx.stroke();

        }
    );

}


/* =========================================================
   DRAW POLYGON
   ========================================================= */

function drawPolygon(
    annotation
) {

    if (
        !annotation.points ||
        annotation.points.length <
            3
    ) {

        return;

    }


    const selected =
        annotation.id ===
        state.selectedId;


    ctx.save();


    ctx.beginPath();


    annotation.points.forEach(
        (
            point,
            index
        ) => {

            if (
                index ===
                0
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


    ctx.fillStyle =
        selected
            ? "rgba(139,92,246,.20)"
            : "rgba(34,197,94,.12)";


    ctx.strokeStyle =
        selected
            ? "#a78bfa"
            : "#22c55e";


    ctx.lineWidth =
        selected
            ? 3
            : 2;


    ctx.fill();

    ctx.stroke();


    annotation.points.forEach(
        point => {

            ctx.beginPath();


            ctx.arc(
                point.x,
                point.y,
                selected
                    ? 6
                    : 4,
                0,
                Math.PI * 2
            );


            ctx.fillStyle =
                selected
                    ? "#a78bfa"
                    : "#22c55e";


            ctx.fill();

        }
    );


    drawLabel(
        annotation.label,
        annotation.confidence,
        annotation.points[0].x,
        annotation.points[0].y
    );


    ctx.restore();

}


/* =========================================================
   SEGMENTATION
   ========================================================= */

function drawSegmentation(
    annotation
) {

    /*
     * Actual masks will be drawn here when a proper
     * segmentation model is connected.
     */

    if (
        !annotation.mask
    ) {

        return;

    }


    const mask =
        new Image();


    mask.onload =
        () => {

            ctx.save();


            ctx.globalAlpha =
                annotation.id ===
                state.selectedId
                    ? .45
                    : .25;


            ctx.drawImage(
                mask,
                0,
                0,
                canvas.width,
                canvas.height
            );


            ctx.restore();

        };


    mask.src =
        annotation.mask;

}


/* =========================================================
   LABEL
   ========================================================= */

function drawLabel(
    label,
    confidence,
    x,
    y
) {

    const text =
        `${label} ${
            Math.round(
                confidence *
                100
            )
        }%`;


    ctx.font =
        "bold 14px Arial";


    const width =
        ctx.measureText(
            text
        ).width +
        10;


    const height =
        21;


    const top =
        Math.max(
            0,
            y -
            height
        );


    ctx.fillStyle =
        "#111827";


    ctx.fillRect(
        x,
        top,
        width,
        height
    );


    ctx.fillStyle =
        "#ffffff";


    ctx.fillText(
        text,
        x +
            5,
        top +
            15
    );

}


/* =========================================================
   OBJECT LIST
   ========================================================= */

function renderObjects() {

    const list =
        $("#objectList");


    if (!list) {
        return;
    }


    if (
        state.annotations.length ===
        0
    ) {

        list.innerHTML =
            `
            <div class="no-objects">
                No annotations yet.
            </div>
            `;


        updateCanvasInfo();

        return;

    }


    list.innerHTML =
        state.annotations
            .map(
                annotation => {

                    const selected =
                        annotation.id ===
                        state.selectedId
                            ? "selected"
                            : "";


                    const review =
                        annotation.review
                            ? " • REVIEW"
                            : "";


                    return `

                    <div
                        class="object-row ${selected}"
                        data-id="${annotation.id}"
                    >

                        <div class="object-color"></div>

                        <div class="object-info">

                            <div class="object-name">
                                ${escapeHtml(
                                    annotation.label
                                )}
                            </div>

                            <div class="object-meta">
                                ${annotation.type}
                                ${review}
                            </div>

                        </div>

                        <div class="object-confidence">
                            ${Math.round(
                                annotation.confidence *
                                100
                            )}%
                        </div>

                        <button
                            class="object-delete"
                            data-delete-id="${annotation.id}"
                            title="Delete annotation"
                        >
                            ×
                        </button>

                    </div>

                    `;

                }
            )
            .join("");


    list.querySelectorAll(
        ".object-row"
    ).forEach(
        row => {

            row.addEventListener(
                "click",
                event => {

                    if (
                        event.target.closest(
                            ".object-delete"
                        )
                    ) {

                        return;

                    }


                    state.selectedId =
                        row.dataset.id;


                    render();

                    renderObjects();

                }
            );

        }
    );


    list.querySelectorAll(
        ".object-delete"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();


                    saveUndoState();


                    removeAnnotation(
                        button.dataset.deleteId
                    );

                }
            );

        }
    );


    updateCanvasInfo();

}


/* =========================================================
   REMOVE ANNOTATION
   ========================================================= */

function removeAnnotation(
    id
) {

    state.annotations =
        state.annotations.filter(
            annotation =>
                annotation.id !==
                id
        );


    if (
        state.selectedId ===
        id
    ) {

        state.selectedId =
            null;

    }


    rebuildClassificationSet();

    render();

    renderObjects();

    renderClassificationManager();

    updateQuality(
        state.annotations
    );


    updateCanvasInfo();


    saveTrainingSnapshot();


    showToast(
        "Annotation deleted."
    );

}


/* =========================================================
   DELETE SELECTED
   ========================================================= */

function deleteSelected() {

    if (
        !state.selectedId
    ) {

        showToast(
            "Select an annotation first."
        );

        return;

    }


    saveUndoState();


    removeAnnotation(
        state.selectedId
    );

}


/* =========================================================
   RESET
   ========================================================= */

function resetAnnotations() {

    if (
        state.annotations.length ===
        0
    ) {

        return;

    }


    saveUndoState();


    state.annotations =
        [];


    state.selectedId =
        null;


    render();

    renderObjects();

    renderClassificationManager();

    updateQuality(
        []
    );

    updateCanvasInfo();


    showToast(
        "Annotations reset."
    );

}


/* =========================================================
   UNDO
   ========================================================= */

function saveUndoState() {

    state.undoStack.push(
        JSON.stringify(
            state.annotations
        )
    );


    if (
        state.undoStack.length >
        CONFIG.maxUndo
    ) {

        state.undoStack.shift();

    }


    state.redoStack =
        [];

}


function undo() {

    if (
        state.undoStack.length ===
        0
    ) {

        return;

    }


    state.redoStack.push(
        JSON.stringify(
            state.annotations
        )
    );


    state.annotations =
        JSON.parse(
            state.undoStack.pop()
        );


    state.selectedId =
        null;


    rebuildClassificationSet();

    render();

    renderObjects();

    renderClassificationManager();

    updateCanvasInfo();

}


/* =========================================================
   REDO
   ========================================================= */

function redo() {

    if (
        state.redoStack.length ===
        0
    ) {

        return;

    }


    state.undoStack.push(
        JSON.stringify(
            state.annotations
        )
    );


    state.annotations =
        JSON.parse(
            state.redoStack.pop()
        );


    state.selectedId =
        null;


    rebuildClassificationSet();

    render();

    renderObjects();

    renderClassificationManager();

    updateCanvasInfo();

}


/* =========================================================
   KEYBOARD
   ========================================================= */

function setupKeyboard() {

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.ctrlKey &&
                event.key.toLowerCase() ===
                    "z"
            ) {

                event.preventDefault();

                undo();

            }


            if (
                event.ctrlKey &&
                event.key.toLowerCase() ===
                    "y"
            ) {

                event.preventDefault();

                redo();

            }


            if (
                event.key ===
                "Delete"
            ) {

                deleteSelected();

            }


            /*
             * ESC clears selection.
             */

            if (
                event.key ===
                "Escape"
            ) {

                state.selectedId =
                    null;


                state.drag =
                    null;


                render();

                renderObjects();

            }

        }
    );

}


/* =========================================================
   CLASSIFICATION SYSTEM
   ========================================================= */

function ensureClassificationUI() {

    /*
     * If the HTML already has a classification
     * container, use it.
     *
     * Otherwise create one.
     */

    let container =
        $("#classificationManager");


    if (
        container
    ) {

        return;

    }


    container =
        document.createElement(
            "div"
        );


    container.id =
        "classificationManager";


    container.style.cssText = `

        margin-top:20px;
        padding:14px;
        border:1px solid #27273a;
        border-radius:10px;
        background:#0d0d17;
        color:#fff;

    `;


    container.innerHTML = `

        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:10px;
        ">

            <strong>
                CLASSIFICATIONS
            </strong>

            <button
                id="addClassification"
                type="button"
                style="
                    border:0;
                    border-radius:6px;
                    padding:5px 9px;
                    cursor:pointer;
                    background:#7c3aed;
                    color:#fff;
                "
            >
                + Add
            </button>

        </div>


        <div
            id="classificationList"
        ></div>

        <div style="
            margin-top:9px;
            font-size:11px;
            color:#8b8b9a;
        ">
            Remove a class to exclude it from export.
        </div>

    `;


    const sidebar =
        document.querySelector(
            ".sidebar"
        ) ||
        document.querySelector(
            "aside"
        );


    if (
        sidebar
    ) {

        sidebar.appendChild(
            container
        );

    } else {

        document.body.appendChild(
            container
        );

    }


    $("#addClassification")
        .addEventListener(
            "click",
            addClassification
        );

}


function rebuildClassificationSet() {

    state.classifications =
        new Set(
            state.annotations
                .map(
                    annotation =>
                        annotation.label
                )
                .filter(
                    Boolean
                )
        );


    /*
     * Removed classes remain excluded.
     */

}


function renderClassificationManager() {

    ensureClassificationUI();


    const list =
        $("#classificationList");


    if (!list) {
        return;
    }


    const classes =
        [...state.classifications]
            .sort();


    if (
        classes.length ===
        0
    ) {

        list.innerHTML =
            `
            <div style="
                color:#777;
                font-size:12px;
            ">
                No classifications yet.
            </div>
            `;

        return;

    }


    list.innerHTML =
        classes
            .map(
                label => {

                    const excluded =
                        state.excludedClassifications
                            .has(
                                label
                            );


                    const count =
                        state.annotations
                            .filter(
                                annotation =>
                                    annotation.label ===
                                    label
                            )
                            .length;


                    return `

                    <div style="
                        display:flex;
                        gap:6px;
                        align-items:center;
                        margin-bottom:6px;
                    ">

                        <input
                            type="checkbox"
                            class="classification-export"
                            data-class="${escapeAttr(
                                label
                            )}"
                            ${
                                !excluded
                                    ? "checked"
                                    : ""
                            }
                        >

                        <button
                            type="button"
                            class="classification-name"
                            data-edit-class="${escapeAttr(
                                label
                            )}"
                            style="
                                flex:1;
                                text-align:left;
                                border:0;
                                background:transparent;
                                color:${
                                    excluded
                                        ? "#666"
                                        : "#fff"
                                };
                                cursor:pointer;
                            "
                        >
                            ${escapeHtml(
                                label
                            )}
                            <span style="
                                color:#777;
                            ">
                                (${count})
                            </span>
                        </button>

                        <button
                            type="button"
                            class="classification-remove"
                            data-remove-class="${escapeAttr(
                                label
                            )}"
                            title="Remove classification"
                            style="
                                border:0;
                                background:#2a1520;
                                color:#ff6b81;
                                border-radius:5px;
                                cursor:pointer;
                            "
                        >
                            ×
                        </button>

                    </div>

                    `;

                }
            )
            .join("");


    list.querySelectorAll(
        ".classification-export"
    ).forEach(
        checkbox => {

            checkbox.addEventListener(
                "change",
                () => {

                    const label =
                        checkbox.dataset.class;


                    if (
                        checkbox.checked
                    ) {

                        state.excludedClassifications
                            .delete(
                                label
                            );

                    } else {

                        state.excludedClassifications
                            .add(
                                label
                            );

                    }

                }
            );

        }
    );


    list.querySelectorAll(
        ".classification-name"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const label =
                        button.dataset.editClass;


                    const annotation =
                        state.annotations.find(
                            item =>
                                item.label ===
                                label
                        );


                    if (
                        annotation
                    ) {

                        editClassification(
                            annotation
                        );

                    }

                }
            );

        }
    );


    list.querySelectorAll(
        ".classification-remove"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    removeClassification(
                        button.dataset.removeClass
                    );

                }
            );

        }
    );

}


/* =========================================================
   ADD CLASSIFICATION
   ========================================================= */

function addClassification() {

    const name =
        prompt(
            "Enter the new classification name:"
        );


    if (
        !name ||
        !name.trim()
    ) {

        return;

    }


    const label =
        normalizeLabel(
            name
        );


    state.classifications.add(
        label
    );


    state.excludedClassifications
        .delete(
            label
        );


    state.nextManualClass =
        label;


    renderClassificationManager();


    showToast(
        `Classification "${label}" added.`
    );

}


/* =========================================================
   REMOVE CLASSIFICATION
   ========================================================= */

function removeClassification(
    label
) {

    const count =
        state.annotations.filter(
            annotation =>
                annotation.label ===
                label
        ).length;


    const confirmed =
        confirm(
            count > 0
                ? `Remove "${label}" from the project? ${count} annotation(s) will be excluded from export.`
                : `Remove "${label}"?`
        );


    if (
        !confirmed
    ) {

        return;

    }


    state.classifications.delete(
        label
    );


    state.excludedClassifications.add(
        label
    );


    /*
     * Keep annotations visually available
     * for review, but exclude from export.
     */

    renderClassificationManager();


    showToast(
        `"${label}" excluded from export.`
    );

}


/* =========================================================
   EDIT CLASSIFICATION
   ========================================================= */

function editClassification(
    annotation
) {

    const newLabel =
        prompt(
            "Classification:",
            annotation.label
        );


    if (
        !newLabel ||
        !newLabel.trim()
    ) {

        return;

    }


    const label =
        normalizeLabel(
            newLabel
        );


    saveUndoState();


    annotation.label =
        label;


    annotation.source =
        "human";


    state.classifications.add(
        label
    );


    state.excludedClassifications
        .delete(
            label
        );


    render();

    renderObjects();

    renderClassificationManager();

    saveTrainingSnapshot();


    showToast(
        "Classification updated."
    );

}


/* =========================================================
   ADD OBJECT TO SELECTED CLASS
   ========================================================= */

function addObjectWithClassification() {

    const classes =
        [
            ...state.classifications
        ];


    if (
        classes.length ===
        0
    ) {

        showToast(
            "Add a classification first."
        );

        return;

    }


    const label =
        prompt(
            `Classification:\n${classes.join(
                ", "
            )}`,
            classes[0]
        );


    if (
        !label
    ) {

        return;

    }


    state.nextManualClass =
        normalizeLabel(
            label
        );


    state.activeTool =
        "draw";


    updateCursor();


    showToast(
        `Draw a new ${state.nextManualClass} annotation.`
    );

}


/* =========================================================
   EXPORT
   ========================================================= */

function getExportAnnotations() {

    return state.annotations
        .filter(
            annotation =>
                !state.excludedClassifications
                    .has(
                        annotation.label
                    )
        )
        .map(
            annotation =>
                clone(
                    annotation
                )
        );

}


function downloadAnnotatedImage() {

    if (
        !state.image
    ) {

        showToast(
            "Upload an image first."
        );

        return;

    }


    /*
     * Create a dedicated export canvas.
     * This means excluded classifications are
     * not written onto the downloaded image.
     */

    const exportCanvas =
        document.createElement(
            "canvas"
        );


    exportCanvas.width =
        state.imageWidth;


    exportCanvas.height =
        state.imageHeight;


    const exportCtx =
        exportCanvas.getContext(
            "2d"
        );


    exportCtx.drawImage(
        state.image,
        0,
        0
    );


    const exportAnnotations =
        getExportAnnotations();


    drawAnnotationsToContext(
        exportCtx,
        exportAnnotations
    );


    const link =
        document.createElement(
            "a"
        );


    link.download =
        `${removeExtension(
            state.imageName
        )}_annotated.png`;


    link.href =
        exportCanvas.toDataURL(
            "image/png"
        );


    link.click();


    downloadAnnotationJSON(
        exportAnnotations
    );


    showToast(
        "Annotated image and JSON downloaded."
    );

}


/* =========================================================
   EXPORT DRAW
   ========================================================= */

function drawAnnotationsToContext(
    targetCtx,
    annotations
) {

    annotations.forEach(
        annotation => {

            targetCtx.save();


            if (
                annotation.type ===
                "bbox"
            ) {

                targetCtx.strokeStyle =
                    "#22c55e";


                targetCtx.lineWidth =
                    3;


                targetCtx.strokeRect(
                    annotation.x,
                    annotation.y,
                    annotation.width,
                    annotation.height
                );


                drawExportLabel(
                    targetCtx,
                    annotation.label,
                    annotation.confidence,
                    annotation.x,
                    annotation.y
                );

            }


            else if (
                annotation.type ===
                "polygon"
            ) {

                if (
                    !annotation.points ||
                    annotation.points.length <
                        3
                ) {

                    targetCtx.restore();

                    return;

                }


                targetCtx.beginPath();


                annotation.points.forEach(
                    (
                        point,
                        index
                    ) => {

                        if (
                            index ===
                            0
                        ) {

                            targetCtx.moveTo(
                                point.x,
                                point.y
                            );

                        } else {

                            targetCtx.lineTo(
                                point.x,
                                point.y
                            );

                        }

                    }
                );


                targetCtx.closePath();


                targetCtx.fillStyle =
                    "rgba(34,197,94,.15)";


                targetCtx.strokeStyle =
                    "#22c55e";


                targetCtx.lineWidth =
                    3;


                targetCtx.fill();

                targetCtx.stroke();


                drawExportLabel(
                    targetCtx,
                    annotation.label,
                    annotation.confidence,
                    annotation.points[0].x,
                    annotation.points[0].y
                );

            }


            targetCtx.restore();

        }
    );

}


/* =========================================================
   EXPORT LABEL
   ========================================================= */

function drawExportLabel(
    targetCtx,
    label,
    confidence,
    x,
    y
) {

    const text =
        `${label} ${
            Math.round(
                confidence *
                100
            )
        }%`;


    targetCtx.font =
        "bold 18px Arial";


    const width =
        targetCtx.measureText(
            text
        ).width +
        14;


    const height =
        26;


    const top =
        Math.max(
            0,
            y -
            height
        );


    targetCtx.fillStyle =
        "#111827";


    targetCtx.fillRect(
        x,
        top,
        width,
        height
    );


    targetCtx.fillStyle =
        "#ffffff";


    targetCtx.fillText(
        text,
        x +
            7,
        top +
            19
    );

}


/* =========================================================
   JSON EXPORT
   ========================================================= */

function downloadAnnotationJSON(
    annotations
) {

    const data = {

        application:
            "AI Annotation Studio Pro",

        version:
            "2.0",

        image:
            state.imageName,

        imageWidth:
            state.imageWidth,

        imageHeight:
            state.imageHeight,

        annotationType:
            state.annotationType,

        classifications:
            [
                ...state.classifications
            ],

        excludedClassifications:
            [
                ...state.excludedClassifications
            ],

        annotations

    };


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
        `${removeExtension(
            state.imageName
        )}_annotations.json`;


    link.click();


    URL.revokeObjectURL(
        url
    );

}


/* =========================================================
   TRAINING DATA
   ========================================================= */

function saveTrainingSnapshot() {

    if (
        !state.imageName
    ) {

        return;

    }


    const training =
        loadJSON(
            CONFIG.storage.training,
            []
        );


    training.push({

        id:
            createId(),

        timestamp:
            new Date()
                .toISOString(),

        image:
            state.imageName,

        width:
            state.imageWidth,

        height:
            state.imageHeight,

        annotations:
            clone(
                state.annotations
            )

    });


    saveJSON(
        CONFIG.storage.training,
        training.slice(
            -CONFIG.maxHistory
        )
    );

}


function updateTrainingPage() {

    const training =
        loadJSON(
            CONFIG.storage.training,
            []
        );


    const corrections =
        training.reduce(
            (
                total,
                item
            ) =>
                total +
                item.annotations.filter(
                    annotation =>
                        annotation.source ===
                        "human"
                ).length,
            0
        );


    const objects =
        training.reduce(
            (
                total,
                item
            ) =>
                total +
                item.annotations.length,
            0
        );


    setText(
        "#trainingImages",
        training.length
    );


    setText(
        "#trainingCorrections",
        corrections
    );


    setText(
        "#trainingObjects",
        objects
    );


    const list =
        $("#trainingList");


    if (!list) {
        return;
    }


    if (
        training.length ===
        0
    ) {

        list.textContent =
            "No training examples yet.";

        return;

    }


    list.innerHTML =
        training
            .slice()
            .reverse()
            .slice(
                0,
                50
            )
            .map(
                item =>
                    `

                    <div class="object-row">

                        <div class="object-info">

                            <div class="object-name">
                                ${escapeHtml(
                                    item.image
                                )}
                            </div>

                            <div class="object-meta">
                                ${item.annotations.length}
                                annotations •
                                ${new Date(
                                    item.timestamp
                                ).toLocaleString()}
                            </div>

                        </div>

                    </div>

                    `
            )
            .join("");

}


/* =========================================================
   TRAINING EXPORT
   ========================================================= */

function exportTraining() {

    const training =
        loadJSON(
            CONFIG.storage.training,
            []
        );


    if (
        training.length ===
        0
    ) {

        showToast(
            "There is no training data yet."
        );

        return;

    }


    const blob =
        new Blob(
            [
                JSON.stringify(
                    training,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
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
        "annotation_training_data.json";


    link.click();


    URL.revokeObjectURL(
        url
    );


    showToast(
        "Training data exported."
    );

}


/* =========================================================
   RULES
   ========================================================= */

function saveRules() {

    const input =
        $("#rulesInput");


    if (!input) {
        return;
    }


    localStorage.setItem(
        CONFIG.storage.rules,
        input.value.trim()
    );


    showToast(
        "Annotation rules saved."
    );

}


/* =========================================================
   LOCAL DATA
   ========================================================= */

function loadLocalData() {

    const rules =
        localStorage.getItem(
            CONFIG.storage.rules
        );


    const input =
        $("#rulesInput");


    if (
        rules &&
        input
    ) {

        input.value =
            rules;

    }


    const savedClasses =
        loadJSON(
            CONFIG.storage.classifications,
            []
        );


    savedClasses.forEach(
        label =>
            state.classifications.add(
                label
            )
    );

}


/* =========================================================
   HISTORY
   ========================================================= */

function saveHistory() {

    const history =
        loadJSON(
            CONFIG.storage.history,
            []
        );


    history.push({

        id:
            createId(),

        timestamp:
            new Date()
                .toISOString(),

        image:
            state.imageName,

        annotationCount:
            state.annotations.length,

        annotationType:
            state.annotationType

    });


    saveJSON(
        CONFIG.storage.history,
        history.slice(
            -CONFIG.maxHistory
        )
    );

}


function updateHistoryPage() {

    const history =
        loadJSON(
            CONFIG.storage.history,
            []
        );


    const list =
        $("#historyList");


    if (!list) {
        return;
    }


    if (
        history.length ===
        0
    ) {

        list.textContent =
            "No history.";

        return;

    }


    list.innerHTML =
        history
            .slice()
            .reverse()
            .map(
                item =>
                    `

                    <div class="object-row">

                        <div class="object-info">

                            <div class="object-name">
                                ${escapeHtml(
                                    item.image
                                )}
                            </div>

                            <div class="object-meta">
                                ${item.annotationCount}
                                objects •
                                ${item.annotationType} •
                                ${new Date(
                                    item.timestamp
                                ).toLocaleString()}
                            </div>

                        </div>

                    </div>

                    `
            )
            .join("");

}


function clearHistory() {

    if (
        !confirm(
            "Clear annotation history?"
        )
    ) {

        return;

    }


    localStorage.removeItem(
        CONFIG.storage.history
    );


    updateHistoryPage();

}


/* =========================================================
   QUALITY
   ========================================================= */

function updateQuality(
    annotations
) {

    const scoreElement =
        $("#qualityScore");


    const messageElement =
        $("#qualityMessages");


    if (
        annotations.length ===
        0
    ) {

        if (scoreElement) {

            scoreElement.textContent =
                "—";

        }


        if (messageElement) {

            messageElement.textContent =
                "Run annotation to check quality.";

        }


        return;

    }


    let score =
        annotations.reduce(
            (
                total,
                annotation
            ) =>
                total +
                annotation.confidence,
            0
        ) /
        annotations.length;


    const reviewCount =
        annotations.filter(
            annotation =>
                annotation.review
        ).length;


    score =
        clamp(
            score,
            0,
            1
        );


    if (
        scoreElement
    ) {

        scoreElement.textContent =
            `${Math.round(
                score *
                100
            )}%`;

    }


    if (
        messageElement
    ) {

        messageElement.innerHTML =
            `
            ${annotations.length} objects detected.<br>
            ${reviewCount} require review.
            `;

    }

}


/* =========================================================
   STATUS
   ========================================================= */

function setAIStatus(
    text
) {

    const element =
        $("#aiStatus");


    if (element) {

        element.textContent =
            text;

    }

}


function setProcessing(
    text
) {

    const element =
        $("#processingStatus");


    if (element) {

        element.textContent =
            text;

    }

}


function showToast(
    message
) {

    const toast =
        $("#toast");


    const text =
        $("#toastMessage");


    if (
        !toast ||
        !text
    ) {

        console.log(
            message
        );

        return;

    }


    text.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        showToast.timer
    );


    showToast.timer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            4000
        );

}


function showModal(
    message
) {

    const modal =
        $("#annotationModal");


    const text =
        $("#modalMessage");


    if (
        !modal ||
        !text
    ) {

        return;

    }


    text.textContent =
        message;


    modal.classList.remove(
        "hidden"
    );

}


/* =========================================================
   CURSOR
   ========================================================= */

function updateCursor() {

    if (!canvas) {
        return;
    }


    if (
        state.activeTool ===
        "pan"
    ) {

        canvas.style.cursor =
            "grab";

    }


    else if (
        state.activeTool ===
        "draw"
    ) {

        canvas.style.cursor =
            "crosshair";

    }


    else if (
        state.activeTool ===
        "erase"
    ) {

        canvas.style.cursor =
            "not-allowed";

    }


    else {

        canvas.style.cursor =
            "default";

    }

}


/* =========================================================
   CANVAS INFO
   ========================================================= */

function updateCanvasInfo() {

    setText(
        "#objectCount",
        `${state.annotations.length} objects`
    );


    setText(
        "#objectSummary",
        `${state.annotations.length} ${
            state.annotations.length ===
            1
                ? "object"
                : "objects"
        }`
    );

}


/* =========================================================
   UTILITIES
   ========================================================= */

function createId() {

    return (
        Date.now()
            .toString(
                36
            ) +
        Math.random()
            .toString(
                36
            )
            .substring(
                2,
                10
            )
    );

}


function normalizeLabel(
    label
) {

    return String(
        label ||
        "unknown"
    )
        .trim()
        .toLowerCase();

}


function removeExtension(
    filename
) {

    return String(
        filename ||
        "image"
    )
        .replace(
            /\.[^/.]+$/,
            ""
        );

}


function escapeHtml(
    value
) {

    return String(
        value
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


function escapeAttr(
    value
) {

    return escapeHtml(
        value
    );

}


function clone(
    value
) {

    return JSON.parse(
        JSON.stringify(
            value
        )
    );

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


function setText(
    selector,
    value
) {

    const element =
        $(selector);


    if (element) {

        element.textContent =
            value;

    }

}


function saveJSON(
    key,
    value
) {

    localStorage.setItem(
        key,
        JSON.stringify(
            value
        )
    );

}


function loadJSON(
    key,
    fallback
) {

    try {

        return JSON.parse(
            localStorage.getItem(
                key
            ) ||
            JSON.stringify(
                fallback
            )
        );

    } catch {

        return fallback;

    }

}


/* =========================================================
   SAVE CLASSIFICATIONS
   ========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        saveJSON(
            CONFIG.storage.classifications,
            [
                ...state.classifications
            ]
        );

    }
);


/* =========================================================
   EXTRA GLOBAL ACTIONS
   ========================================================= */

window.AnnotationStudio = {

    addClassification,

    addObjectWithClassification,

    deleteSelected,

    undo,

    redo,

    setZoom,

    fit:
        calculateFitZoom,

    getAnnotations:
        () =>
            clone(
                state.annotations
            )

};
