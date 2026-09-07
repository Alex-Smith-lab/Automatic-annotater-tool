/* =========================================================
   AI ANNOTATION STUDIO
   CORRECTED VERSION
   Browser / GitHub Pages
   No Supabase
========================================================= */

import {
    pipeline
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";


/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {

    detectionModel:
        "Xenova/detr-resnet-50",

    /*
     * Keep segmentation disabled by default until a
     * compatible segmentation model is selected.
     *
     * The application still supports the segmentation
     * editor/data structure.
     */
    segmentationModel:
        null,

    defaultThreshold: 0.50,

    storageKeys: {
        rules: "ai_annotation_rules",
        training: "ai_annotation_training",
        history: "ai_annotation_history"
    }

};


/* =========================================================
   STATE
========================================================= */

const state = {

    image: null,

    imageUrl: null,

    imageBlob: null,

    imageName: null,

    imageWidth: 0,

    imageHeight: 0,

    annotationType: "bbox",

    activeTool: "select",

    threshold: 0.50,

    applyRules: true,

    annotations: [],

    selectedId: null,

    undoStack: [],

    redoStack: [],

    zoom: 1,

    detector: null,

    segmenter: null,

    detectorReady: false,

    segmenterReady: false,

    isProcessing: false,

    mouse: {
        down: false,
        startX: 0,
        startY: 0
    }

};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = selector =>
    document.querySelector(selector);

const $$ = selector =>
    [...document.querySelectorAll(selector)];


const canvas =
    $("#annotationCanvas");

const ctx =
    canvas.getContext("2d");


/* =========================================================
   START
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initialize
);


function initialize() {

    loadLocalData();

    setupNavigation();

    setupUpload();

    setupAnnotationTypes();

    setupTools();

    setupControls();

    setupCanvas();

    setupKeyboard();

    renderObjects();

    updateTrainingPage();

    updateHistoryPage();

    updateCursor();

    setAIStatus("Ready");

}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

    $$(".nav-item").forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const page =
                    button.dataset.page;

                $$(".nav-item")
                    .forEach(item =>
                        item.classList.remove(
                            "active"
                        )
                    );

                button.classList.add(
                    "active"
                );

                $$(".page")
                    .forEach(item =>
                        item.classList.remove(
                            "active-page"
                        )
                    );

                const target =
                    $(`#${page}Page`);

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

                if (titles[page]) {

                    $("#pageTitle")
                        .textContent =
                        titles[page][0];

                    $("#pageSubtitle")
                        .textContent =
                        titles[page][1];

                }

            }
        );

    });

}


/* =========================================================
   IMAGE UPLOAD
========================================================= */

function setupUpload() {

    $("#imageInput")
        .addEventListener(
            "change",
            handleImageUpload
        );

}


async function handleImageUpload(event) {

    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {

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

        /*
         * IMPORTANT:
         *
         * We keep the Blob and create a URL from it.
         * Transformers.js receives the URL instead
         * of the HTMLImageElement.
         */

        if (state.imageUrl) {

            URL.revokeObjectURL(
                state.imageUrl
            );

        }

        state.imageUrl =
            URL.createObjectURL(file);


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


        state.annotations = [];

        state.selectedId = null;

        state.undoStack = [];

        state.redoStack = [];


        canvas.width =
            state.imageWidth;

        canvas.height =
            state.imageHeight;


        $("#imageName")
            .textContent =
            state.imageName;

        $("#annotateBtn")
            .disabled =
            false;

        $("#emptyState")
            .style.display =
            "none";

        canvas.style.display =
            "block";


        calculateFitZoom();

        render();

        renderObjects();

        updateCanvasInfo();

        updateQuality([]);


        $("#processingStatus")
            .textContent =
            "Image ready. Choose annotation type and click AUTO ANNOTATE.";


        showToast(
            "Image loaded successfully."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Could not load the image."
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
        (resolve, reject) => {

            const image =
                new Image();

            image.onload =
                () => resolve(image);

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
   ANNOTATION TYPES
========================================================= */

function setupAnnotationTypes() {

    $$(".annotation-type")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    $$(".annotation-type")
                        .forEach(b =>
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
                        "segmentation"
                    ) {

                        if (
                            !CONFIG.segmentationModel
                        ) {

                            showToast(
                                "Segmentation AI model is not configured yet. The editor is ready for a compatible segmentation model."
                            );

                        }

                    }

                    render();

                }
            );

        });

}


/* =========================================================
   TOOLS
========================================================= */

function setupTools() {

    $$(".tool-button")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    $$(".tool-button")
                        .forEach(b =>
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

        });

}


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

    } else if (
        state.activeTool ===
        "draw"
    ) {

        canvas.style.cursor =
            "crosshair";

    } else if (
        state.activeTool ===
        "erase"
    ) {

        canvas.style.cursor =
            "not-allowed";

    } else {

        canvas.style.cursor =
            "default";

    }

}


/* =========================================================
   CONTROLS
========================================================= */

function setupControls() {

    $("#confidenceSlider")
        .addEventListener(
            "input",
            event => {

                state.threshold =
                    Number(
                        event.target.value
                    ) / 100;

                $("#thresholdValue")
                    .textContent =
                    `${event.target.value}%`;

            }
        );


    $("#autoRules")
        .addEventListener(
            "change",
            event => {

                state.applyRules =
                    event.target.checked;

            }
        );


    $("#annotateBtn")
        .addEventListener(
            "click",
            runAIAnnotation
        );


    $("#downloadBtn")
        .addEventListener(
            "click",
            downloadAnnotatedImage
        );


    $("#deleteSelected")
        .addEventListener(
            "click",
            deleteSelected
        );


    $("#resetBtn")
        .addEventListener(
            "click",
            resetAnnotations
        );


    $("#undoBtn")
        .addEventListener(
            "click",
            undo
        );


    $("#redoBtn")
        .addEventListener(
            "click",
            redo
        );


    $("#zoomIn")
        .addEventListener(
            "click",
            () =>
                setZoom(
                    state.zoom + .1
                )
        );


    $("#zoomOut")
        .addEventListener(
            "click",
            () =>
                setZoom(
                    state.zoom - .1
                )
        );


    $("#fitCanvas")
        .addEventListener(
            "click",
            calculateFitZoom
        );


    $("#saveRules")
        .addEventListener(
            "click",
            saveRules
        );


    $("#exportTraining")
        .addEventListener(
            "click",
            exportTraining
        );


    $("#clearHistory")
        .addEventListener(
            "click",
            clearHistory
        );


    $("#closeModal")
        .addEventListener(
            "click",
            () => {

                $("#annotationModal")
                    .classList.add(
                        "hidden"
                    );

            }
        );

}


/* =========================================================
   AI MODEL
========================================================= */

async function loadDetector() {

    if (state.detector) {

        return state.detector;

    }


    setAIStatus(
        "Downloading AI model..."
    );


    /*
     * IMPORTANT:
     *
     * This model is downloaded once and then
     * normally cached by the browser.
     */

    state.detector =
        await pipeline(
            "object-detection",
            CONFIG.detectionModel,
            {
                dtype: "q8"
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
   SEGMENTATION MODEL
========================================================= */

async function loadSegmenter() {

    if (
        !CONFIG.segmentationModel
    ) {

        throw new Error(
            "No compatible segmentation model has been configured."
        );

    }


    if (state.segmenter) {

        return state.segmenter;

    }


    setAIStatus(
        "Downloading segmentation model..."
    );


    state.segmenter =
        await pipeline(
            "image-segmentation",
            CONFIG.segmentationModel,
            {
                dtype: "q8"
            }
        );


    state.segmenterReady =
        true;


    setAIStatus(
        "Segmentation ready"
    );


    return state.segmenter;

}


/* =========================================================
   RUN AI
========================================================= */

async function runAIAnnotation() {

    if (!state.image) {

        showToast(
            "Upload an image first."
        );

        return;

    }


    if (state.isProcessing) {

        return;

    }


    state.isProcessing =
        true;

    $("#annotateBtn")
        .disabled =
        true;


    try {

        saveUndoState();


        let results;


        /* ===============================================
           BOX
        =============================================== */

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


            /*
             * FIX:
             *
             * DO NOT send state.image here.
             *
             * Send state.imageUrl instead.
             */

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


        /* ===============================================
           POLYGON
        =============================================== */

        else if (
            state.annotationType ===
            "polygon"
        ) {

            setProcessing(
                "AI is detecting objects for polygon annotation..."
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


            /*
             * Temporary editable polygon.
             *
             * Each detection box becomes an editable
             * four-point polygon.
             *
             * A true segmentation-based polygon
             * should replace this in the next AI upgrade.
             */

            state.annotations =
                boxes.map(
                    convertBoxToPolygon
                );

        }


        /* ===============================================
           SEGMENTATION
        =============================================== */

        else if (
            state.annotationType ===
            "segmentation"
        ) {

            /*
             * We deliberately don't fake segmentation.
             *
             * The previous code attempted to use an
             * incompatible model here.
             */

            if (
                !CONFIG.segmentationModel
            ) {

                throw new Error(
                    "Segmentation model is not configured. Use 2D Box or Polygon for now, or configure a compatible image-segmentation model."
                );

            }


            const segmenter =
                await loadSegmenter();


            setProcessing(
                "AI is generating segmentation masks..."
            );


            results =
                await segmenter(
                    state.imageUrl,
                    {
                        threshold:
                            state.threshold
                    }
                );


            state.annotations =
                await convertSegments(
                    results
                );

        }


        /* ===============================================
           RULES
        =============================================== */

        if (
            state.applyRules
        ) {

            state.annotations =
                applyAnnotationRules(
                    state.annotations
                );

        }


        state.annotations =
            state.annotations.map(
                annotation => ({

                    ...annotation,

                    source:
                        annotation.source ||
                        "ai"

                })
            );


        state.selectedId =
            state.annotations[0]?.id ||
            null;


        render();

        renderObjects();

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
            "Unknown AI error.";


        if (
            message.includes(
                "Unsupported input type"
            )
        ) {

            message =
                "The AI rejected the image input. The corrected version now sends the uploaded image URL instead of the browser Image object.";

        }


        if (
            message.includes(
                "404"
            )
        ) {

            message +=
                " A model or dependency URL may not exist.";

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

        $("#annotateBtn")
            .disabled =
            false;

        setAIStatus(
            "Ready"
        );

    }

}


/* =========================================================
   DETECTION → BOX
========================================================= */

function convertDetections(
    results
) {

    if (!Array.isArray(results)) {

        console.warn(
            "Unexpected detector output:",
            results
        );

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
                        xmin,

                    y:
                        ymin,

                    width:
                        Math.max(
                            0,
                            xmax - xmin
                        ),

                    height:
                        Math.max(
                            0,
                            ymax - ymin
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

async function convertSegments(
    results
) {

    if (!Array.isArray(results)) {

        return [];

    }


    const annotations = [];


    for (
        const item of results
    ) {

        let mask = null;


        if (item.mask) {

            try {

                mask =
                    await rawImageToDataURL(
                        item.mask
                    );

            } catch (
                error
            ) {

                console.warn(
                    "Could not convert mask:",
                    error
                );

            }

        }


        annotations.push({

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
                    0
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

            mask,

            source:
                "ai",

            review:
                false

        });

    }


    return annotations;

}


/* =========================================================
   MASK → DATA URL
========================================================= */

async function rawImageToDataURL(
    rawImage
) {

    if (!rawImage) {

        return null;

    }


    /*
     * Transformers.js RawImage normally provides
     * toBlob(). If available, use it.
     */

    if (
        typeof rawImage.toBlob ===
        "function"
    ) {

        const blob =
            await rawImage.toBlob();


        return await blobToDataURL(
            blob
        );

    }


    /*
     * Some versions expose image data differently.
     * Return null rather than crashing the whole job.
     */

    return null;

}


function blobToDataURL(
    blob
) {

    return new Promise(
        (resolve, reject) => {

            const reader =
                new FileReader();

            reader.onload =
                () =>
                    resolve(
                        reader.result
                    );

            reader.onerror =
                reject;

            reader.readAsDataURL(
                blob
            );

        }
    );

}


/* =========================================================
   RULE ENGINE
========================================================= */

function applyAnnotationRules(
    annotations
) {

    const rules =
        localStorage.getItem(
            CONFIG.storageKeys.rules
        ) || "";


    if (!rules.trim()) {

        return annotations;

    }


    return annotations.map(
        annotation => {

            const updated =
                {
                    ...annotation
                };


            updated.review =
                false;


            /*
             * Very small annotations
             * automatically receive review.
             */

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


            if (
                updated.confidence <
                state.threshold
            ) {

                updated.review =
                    true;

            }


            /*
             * Keep annotation inside image.
             */

            if (
                updated.type ===
                "bbox"
            ) {

                if (
                    updated.x < 0 ||
                    updated.y < 0 ||
                    updated.x +
                    updated.width >
                    state.imageWidth ||
                    updated.y +
                    updated.height >
                    state.imageHeight
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
   CANVAS EVENTS
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
        "dblclick",
        canvasDoubleClick
    );

}


function canvasMouseDown(
    event
) {

    if (!state.image) {

        return;

    }


    const point =
        getCanvasPoint(
            event
        );


    state.mouse.down =
        true;

    state.mouse.startX =
        point.x;

    state.mouse.startY =
        point.y;


    if (
        state.activeTool ===
        "draw"
    ) {

        saveUndoState();


        if (
            state.annotationType ===
            "bbox"
        ) {

            const annotation = {

                id:
                    createId(),

                type:
                    "bbox",

                label:
                    "unknown",

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

        }


        return;

    }


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


            state.annotations =
                state.annotations.filter(
                    item =>
                        item.id !==
                        hit.id
                );


            state.selectedId =
                null;


            render();

            renderObjects();

            updateCanvasInfo();

        }


        return;

    }


    const hit =
        findAnnotationAt(
            point.x,
            point.y
        );


    if (hit) {

        state.selectedId =
            hit.id;

        renderObjects();

        render();

    }

}


function canvasMouseMove(
    event
) {

    if (
        !state.mouse.down
    ) {

        return;

    }


    if (
        state.activeTool !==
        "draw"
    ) {

        return;

    }


    const point =
        getCanvasPoint(
            event
        );


    const annotation =
        state.annotations.find(
            item =>
                item.id ===
                state.selectedId
        );


    if (!annotation) {

        return;

    }


    if (
        annotation.type ===
        "bbox"
    ) {

        annotation.x =
            Math.min(
                state.mouse.startX,
                point.x
            );

        annotation.y =
            Math.min(
                state.mouse.startY,
                point.y
            );

        annotation.width =
            Math.abs(
                point.x -
                state.mouse.startX
            );

        annotation.height =
            Math.abs(
                point.y -
                state.mouse.startY
            );

    }


    render();

}


function canvasMouseUp() {

    state.mouse.down =
        false;


    renderObjects();

    updateCanvasInfo();

}


/* =========================================================
   DOUBLE CLICK EDIT
========================================================= */

function canvasDoubleClick(
    event
) {

    const point =
        getCanvasPoint(
            event
        );


    const hit =
        findAnnotationAt(
            point.x,
            point.y
        );


    if (!hit) {

        return;

    }


    const newLabel =
        prompt(
            "Change object class:",
            hit.label
        );


    if (
        newLabel &&
        newLabel.trim()
    ) {

        saveUndoState();


        hit.label =
            newLabel.trim();


        hit.source =
            "human";


        hit.review =
            false;


        render();

        renderObjects();

        saveTrainingSnapshot();

    }

}


/* =========================================================
   CANVAS COORDINATES
========================================================= */

function getCanvasPoint(
    event
) {

    const rect =
        canvas.getBoundingClientRect();


    const scaleX =
        canvas.width /
        rect.width;


    const scaleY =
        canvas.height /
        rect.height;


    return {

        x:
            (
                event.clientX -
                rect.left
            ) *
            scaleX,

        y:
            (
                event.clientY -
                rect.top
            ) *
            scaleY

    };

}


/* =========================================================
   HIT TEST
========================================================= */

function findAnnotationAt(
    x,
    y
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
            "bbox"
        ) {

            if (
                x >= annotation.x &&
                x <=
                    annotation.x +
                    annotation.width &&
                y >= annotation.y &&
                y <=
                    annotation.y +
                    annotation.height
            ) {

                return annotation;

            }

        }


        if (
            annotation.type ===
            "polygon" &&
            annotation.points
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
                yi > y
            ) !==
            (
                yj > y
            ) &&
            x <
            (
                xj - xi
            ) *
            (
                y - yi
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


/* =========================================================
   RENDER
========================================================= */

function render() {

    if (!state.image) {

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
   BOX
========================================================= */

function drawBox(
    annotation
) {

    const selected =
        annotation.id ===
        state.selectedId;


    ctx.save();


    ctx.lineWidth =
        selected ? 4 : 2;


    ctx.strokeStyle =
        selected
            ? "#a78bfa"
            : "#22c55e";


    ctx.fillStyle =
        selected
            ? "rgba(139,92,246,.10)"
            : "rgba(34,197,94,.05)";


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


    ctx.restore();

}


/* =========================================================
   POLYGON
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


    ctx.fillStyle =
        selected
            ? "rgba(139,92,246,.20)"
            : "rgba(34,197,94,.15)";


    ctx.strokeStyle =
        selected
            ? "#a78bfa"
            : "#22c55e";


    ctx.lineWidth =
        selected ? 4 : 2;


    ctx.fill();

    ctx.stroke();


    /*
     * Editable polygon points.
     */

    annotation.points.forEach(
        point => {

            ctx.beginPath();


            ctx.arc(
                point.x,
                point.y,
                5,
                0,
                Math.PI * 2
            );


            ctx.fillStyle =
                "#a78bfa";


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
                    : .28;


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
                confidence * 100
            )
        }%`;


    ctx.font =
        "bold 14px Arial";


    const width =
        ctx.measureText(
            text
        ).width + 10;


    const height =
        21;


    const top =
        Math.max(
            0,
            y - height
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
        x + 5,
        top + 15
    );

}


/* =========================================================
   OBJECT LIST
========================================================= */

function renderObjects() {

    const list =
        $("#objectList");


    if (
        state.annotations.length ===
        0
    ) {

        list.innerHTML =
            `<div class="no-objects">
                No annotations yet.
            </div>`;


        $("#objectSummary")
            .textContent =
            "No objects";


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
                                annotation.confidence * 100
                            )}%
                        </div>

                    </div>
                    `;

                }
            )
            .join("");


    list.querySelectorAll(
        ".object-row"
    ).forEach(row => {

        row.addEventListener(
            "click",
            () => {

                state.selectedId =
                    row.dataset.id;


                render();

                renderObjects();

            }
        );

    });


    $("#objectSummary")
        .textContent =
        `${state.annotations.length} object${
            state.annotations.length === 1
                ? ""
                : "s"
        }`;

}


/* =========================================================
   DELETE
========================================================= */

function deleteSelected() {

    if (!state.selectedId) {

        showToast(
            "Select an annotation first."
        );

        return;

    }


    saveUndoState();


    state.annotations =
        state.annotations.filter(
            item =>
                item.id !==
                state.selectedId
        );


    state.selectedId =
        null;


    render();

    renderObjects();

    updateCanvasInfo();

    saveTrainingSnapshot();

    showToast(
        "Annotation deleted."
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

    updateCanvasInfo();

    updateQuality(
        []
    );


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
        50
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


    render();

    renderObjects();

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


    render();

    renderObjects();

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

        }
    );

}


/* =========================================================
   ZOOM
========================================================= */

function setZoom(
    value
) {

    state.zoom =
        Math.max(
            .1,
            Math.min(
                4,
                value
            )
        );


    canvas.style.transform =
        `scale(${state.zoom})`;


    $("#zoomValue")
        .textContent =
        `${Math.round(
            state.zoom * 100
        )}%`;

}


function calculateFitZoom() {

    if (!state.image) {

        return;

    }


    const container =
        $("#canvasContainer");


    const horizontal =
        (
            container.clientWidth -
            30
        ) /
        state.imageWidth;


    const vertical =
        (
            container.clientHeight -
            30
        ) /
        state.imageHeight;


    const zoom =
        Math.min(
            horizontal,
            vertical
        );


    setZoom(
        Math.max(
            .1,
            Math.min(
                1,
                zoom
            )
        )
    );

}


/* =========================================================
   QUALITY
========================================================= */

function updateQuality(
    annotations
) {

    if (
        annotations.length ===
        0
    ) {

        $("#qualityScore")
            .textContent =
            "—";


        $("#qualityMessages")
            .textContent =
            "Run annotation to check quality.";


        return;

    }


    let score =
        annotations.reduce(
            (
                total,
                item
            ) =>
                total +
                item.confidence,
            0
        ) /
        annotations.length;


    const reviewCount =
        annotations.filter(
            item =>
                item.review
        ).length;


    if (
        reviewCount > 0
    ) {

        score -=
            (
                reviewCount /
                annotations.length
            ) *
            .2;

    }


    score =
        Math.max(
            0,
            Math.min(
                1,
                score
            )
        );


    $("#qualityScore")
        .textContent =
        `${Math.round(
            score * 100
        )}%`;


    $("#qualityMessages")
        .innerHTML =
        `
        ${annotations.length} objects detected.<br>
        ${reviewCount} require review.<br>
        ${
            reviewCount === 0
                ? "No automatic rule violations."
                : "Review flagged annotations before export."
        }
        `;

}


/* =========================================================
   DOWNLOAD IMAGE
========================================================= */

function downloadAnnotatedImage() {

    if (!state.image) {

        showToast(
            "Upload an image first."
        );

        return;

    }


    render();


    const link =
        document.createElement(
            "a"
        );


    link.download =
        `${removeExtension(
            state.imageName
        )}_annotated.png`;


    link.href =
        canvas.toDataURL(
            "image/png"
        );


    link.click();


    downloadAnnotationJSON();


    showToast(
        "Annotated image and JSON downloaded."
    );

}


/* =========================================================
   DOWNLOAD JSON
========================================================= */

function downloadAnnotationJSON() {

    const data = {

        application:
            "AI Annotation Studio",

        version:
            "1.0.1",

        image:
            state.imageName,

        imageWidth:
            state.imageWidth,

        imageHeight:
            state.imageHeight,

        annotationType:
            state.annotationType,

        rules:
            localStorage.getItem(
                CONFIG.storageKeys.rules
            ) || "",

        annotations:
            state.annotations

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
   TRAINING
========================================================= */

function saveTrainingSnapshot() {

    if (!state.imageName) {

        return;

    }


    const training =
        loadJSON(
            CONFIG.storageKeys.training,
            []
        );


    const record = {

        id:
            createId(),

        timestamp:
            new Date().toISOString(),

        image:
            state.imageName,

        width:
            state.imageWidth,

        height:
            state.imageHeight,

        annotations:
            structuredClone(
                state.annotations
            )

    };


    training.push(
        record
    );


    saveJSON(
        CONFIG.storageKeys.training,
        training.slice(-500)
    );

}


function updateTrainingPage() {

    const training =
        loadJSON(
            CONFIG.storageKeys.training,
            []
        );


    const corrections =
        training.reduce(
            (
                count,
                item
            ) =>
                count +
                item.annotations.filter(
                    a =>
                        a.source ===
                        "human"
                ).length,
            0
        );


    const objects =
        training.reduce(
            (
                count,
                item
            ) =>
                count +
                item.annotations.length,
            0
        );


    $("#trainingImages")
        .textContent =
        training.length;


    $("#trainingCorrections")
        .textContent =
        corrections;


    $("#trainingObjects")
        .textContent =
        objects;


    if (
        training.length ===
        0
    ) {

        $("#trainingList")
            .textContent =
            "No training examples yet.";

        return;

    }


    $("#trainingList")
        .innerHTML =
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
   EXPORT TRAINING
========================================================= */

function exportTraining() {

    const training =
        loadJSON(
            CONFIG.storageKeys.training,
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

    const rules =
        $("#rulesInput")
            .value
            .trim();


    localStorage.setItem(
        CONFIG.storageKeys.rules,
        rules
    );


    showToast(
        "Annotation rules saved."
    );

}


function loadLocalData() {

    const rules =
        localStorage.getItem(
            CONFIG.storageKeys.rules
        );


    if (rules) {

        $("#rulesInput")
            .value =
            rules;

    }

}


/* =========================================================
   HISTORY
========================================================= */

function saveHistory() {

    const history =
        loadJSON(
            CONFIG.storageKeys.history,
            []
        );


    history.push({

        id:
            createId(),

        timestamp:
            new Date().toISOString(),

        image:
            state.imageName,

        annotationCount:
            state.annotations.length,

        annotationType:
            state.annotationType

    });


    saveJSON(
        CONFIG.storageKeys.history,
        history.slice(-200)
    );

}


function updateHistoryPage() {

    const history =
        loadJSON(
            CONFIG.storageKeys.history,
            []
        );


    if (
        history.length ===
        0
    ) {

        $("#historyList")
            .textContent =
            "No history.";

        return;

    }


    $("#historyList")
        .innerHTML =
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
        CONFIG.storageKeys.history
    );


    updateHistoryPage();

}


/* =========================================================
   UI
========================================================= */

function setAIStatus(
    text
) {

    $("#aiStatus")
        .textContent =
        text;

}


function setProcessing(
    text
) {

    $("#processingStatus")
        .textContent =
        text;

}


function showToast(
    message
) {

    const toast =
        $("#toast");


    $("#toastMessage")
        .textContent =
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

    $("#modalMessage")
        .textContent =
        message;


    $("#annotationModal")
        .classList.remove(
            "hidden"
        );

}


function updateCanvasInfo() {

    $("#objectCount")
        .textContent =
        `${state.annotations.length} objects`;

}


/* =========================================================
   UTILITIES
========================================================= */

function createId() {

    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .substring(2, 10)
    );

}


function normalizeLabel(
    label
) {

    if (!label) {

        return "unknown";

    }


    return label
        .toString()
        .trim()
        .toLowerCase();

}


function removeExtension(
    filename
) {

    return filename
        .replace(
            /\.[^/.]+$/,
            ""
        );

}


function escapeHtml(
    value
) {

    return String(value)
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


function saveJSON(
    key,
    value
) {

    localStorage.setItem(
        key,
        JSON.stringify(value)
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
