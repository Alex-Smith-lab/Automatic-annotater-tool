/* =========================================================
   AI ANNOTATION STUDIO
   Browser-only professional annotation application
   No Supabase
   No database
   No API key
========================================================= */

import {
    pipeline
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {

    /*
     * General object detection model.
     *
     * Transformers.js supports object detection directly
     * inside the browser.
     */
    detectionModel:
        "Xenova/detr-resnet-50",

    /*
     * Panoptic segmentation model.
     */
    segmentationModel:
        "Xenova/detr-resnet-50-panoptic",

    defaultThreshold: 0.50,

    storageKeys: {
        rules: "ai_annotation_rules",
        training: "ai_annotation_training",
        history: "ai_annotation_history"
    }

};


/* =========================================================
   APPLICATION STATE
========================================================= */

const state = {

    image: null,

    imageUrl: null,

    imageName: null,

    imageWidth: 0,

    imageHeight: 0,

    annotationType: "bbox",

    activeTool: "select",

    threshold: 0.50,

    applyRules: true,

    annotations: [],

    selectedId: null,

    history: [],

    redoStack: [],

    undoStack: [],

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
   DOM
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
   INITIALIZATION
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
                        item.classList.remove("active")
                    );

                button.classList.add("active");

                $$(".page")
                    .forEach(item =>
                        item.classList.remove("active-page")
                    );

                const target =
                    $(`#${page}Page`);

                if (target) {
                    target.classList.add("active-page");
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

                    $("#pageTitle").textContent =
                        titles[page][0];

                    $("#pageSubtitle").textContent =
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


function handleImageUpload(event) {

    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {

        showToast(
            "Please select an image file."
        );

        return;
    }

    state.imageName =
        file.name;

    state.imageUrl =
        URL.createObjectURL(file);

    const image =
        new Image();

    image.onload = () => {

        state.image = image;

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

        $("#imageName").textContent =
            state.imageName;

        $("#annotateBtn").disabled =
            false;

        $("#emptyState").style.display =
            "none";

        canvas.style.display =
            "block";

        calculateFitZoom();

        render();

        renderObjects();

        updateCanvasInfo();

        updateQuality([]);

        showToast(
            "Image loaded successfully."
        );

    };

    image.onerror = () => {

        showToast(
            "Could not load image."
        );

    };

    image.src =
        state.imageUrl;

}


/* =========================================================
   ANNOTATION TYPE
========================================================= */

function setupAnnotationTypes() {

    $$(".annotation-type")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    $$(".annotation-type")
                        .forEach(b =>
                            b.classList.remove("active")
                        );

                    button.classList.add("active");

                    state.annotationType =
                        button.dataset.type;

                    render();

                    showToast(
                        `${button.textContent.trim().split("\n")[0]} selected`
                    );

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
                            b.classList.remove("active")
                        );

                    button.classList.add("active");

                    state.activeTool =
                        button.dataset.tool;

                    updateCursor();

                }
            );

        });

}


function updateCursor() {

    if (state.activeTool === "pan") {

        canvas.style.cursor =
            "grab";

    } else if (state.activeTool === "draw") {

        canvas.style.cursor =
            "crosshair";

    } else if (state.activeTool === "erase") {

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
                    Number(event.target.value) / 100;

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
            () => setZoom(
                state.zoom + 0.1
            )
        );


    $("#zoomOut")
        .addEventListener(
            "click",
            () => setZoom(
                state.zoom - 0.1
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
                    .classList.add("hidden");
            }
        );

}


/* =========================================================
   AI ENGINE
========================================================= */

async function loadDetector() {

    if (state.detector) {
        return state.detector;
    }

    setAIStatus(
        "Loading detection model..."
    );

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


async function loadSegmenter() {

    if (state.segmenter) {
        return state.segmenter;
    }

    setAIStatus(
        "Loading segmentation model..."
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

    $("#annotateBtn").disabled =
        true;

    setProcessing(
        "Loading AI model..."
    );

    try {

        saveUndoState();

        let results = [];

        if (
            state.annotationType === "bbox" ||
            state.annotationType === "polygon"
        ) {

            const detector =
                await loadDetector();

            setProcessing(
                "AI is analysing image..."
            );

            results =
                await detector(
                    state.image,
                    {
                        threshold:
                            state.threshold,
                        percentage: false
                    }
                );

            state.annotations =
                convertDetections(
                    results
                );

            if (
                state.annotationType === "polygon"
            ) {

                state.annotations =
                    state.annotations.map(
                        convertBoxToPolygon
                    );

            }

        } else {

            const segmenter =
                await loadSegmenter();

            setProcessing(
                "AI is generating segmentation..."
            );

            results =
                await segmenter(
                    state.image,
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


        if (state.applyRules) {

            state.annotations =
                applyAnnotationRules(
                    state.annotations
                );

        }


        state.annotations =
            state.annotations.map(
                annotation => ({
                    ...annotation,
                    source: "ai"
                })
            );


        state.selectedId =
            state.annotations[0]?.id ||
            null;

        render();

        renderObjects();

        updateQuality(
            state.annotations
        );

        saveTrainingSnapshot();

        saveHistory();

        updateCanvasInfo();

        updateTrainingPage();

        updateHistoryPage();


        $("#processingStatus")
            .textContent =
            `${state.annotations.length} annotations created.`;


        showModal(
            `${state.annotations.length} objects were automatically annotated. Review and correct them before exporting.`
        );

    } catch (error) {

        console.error(error);

        setProcessing(
            "AI failed. Check browser console."
        );

        showToast(
            `AI error: ${error.message}`
        );

    } finally {

        state.isProcessing =
            false;

        $("#annotateBtn").disabled =
            false;

        setAIStatus(
            "Ready"
        );

    }

}


/* =========================================================
   DETECTION CONVERSION
========================================================= */

function convertDetections(results) {

    return results.map(
        item => {

            const box =
                item.box;

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
                        item.score || 0
                    ),

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

                points:
                    null,

                mask:
                    null,

                source:
                    "ai"

            };

        }
    );

}


function convertBoxToPolygon(annotation) {

    return {

        ...annotation,

        type:
            "polygon",

        points: [

            {
                x: annotation.x,
                y: annotation.y
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
                x: annotation.x,

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

async function convertSegments(results) {

    const annotations = [];

    for (
        const item of results
    ) {

        /*
         * RawImage is converted into a usable
         * canvas mask.
         */

        const mask =
            await rawImageToMask(
                item.mask
            );

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
                    item.score || 0
                ),

            x: 0,
            y: 0,

            width:
                state.imageWidth,

            height:
                state.imageHeight,

            points:
                null,

            mask,

            source:
                "ai"

        });

    }

    return annotations;

}


async function rawImageToMask(rawImage) {

    try {

        const blob =
            await rawImage.toBlob();

        const url =
            URL.createObjectURL(blob);

        const img =
            new Image();

        await new Promise(
            (resolve, reject) => {

                img.onload =
                    resolve;

                img.onerror =
                    reject;

                img.src =
                    url;

            }
        );

        const temp =
            document.createElement(
                "canvas"
            );

        temp.width =
            state.imageWidth;

        temp.height =
            state.imageHeight;

        const tctx =
            temp.getContext("2d");

        tctx.drawImage(
            img,
            0,
            0,
            temp.width,
            temp.height
        );

        URL.revokeObjectURL(
            url
        );

        return temp.toDataURL(
            "image/png"
        );

    } catch {

        return null;

    }

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


    return annotations.filter(
        annotation => {

            /*
             * Basic automatic validation.
             *
             * Customer-specific rules can be expanded here.
             */

            if (
                annotation.type === "bbox"
            ) {

                if (
                    annotation.width <= 2 ||
                    annotation.height <= 2
                ) {

                    annotation.review =
                        true;

                }

                if (
                    annotation.x < 0 ||
                    annotation.y < 0
                ) {

                    annotation.review =
                        true;

                }

            }


            if (
                annotation.confidence <
                state.threshold
            ) {

                annotation.review =
                    true;

            }

            return true;

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
        "dblclick",
        canvasDoubleClick
    );

}


function canvasMouseDown(event) {

    if (!state.image) {
        return;
    }

    const p =
        getCanvasPoint(event);

    state.mouse.down =
        true;

    state.mouse.startX =
        p.x;

    state.mouse.startY =
        p.y;


    if (
        state.activeTool === "draw"
    ) {

        saveUndoState();

        if (
            state.annotationType === "bbox"
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
                    p.x,

                y:
                    p.y,

                width:
                    0,

                height:
                    0,

                source:
                    "human"

            };

            state.annotations.push(
                annotation
            );

            state.selectedId =
                annotation.id;

        }

    } else {

        const hit =
            findAnnotationAt(
                p.x,
                p.y
            );

        if (hit) {

            state.selectedId =
                hit.id;

            renderObjects();

        }

    }

}


function canvasMouseMove(event) {

    if (!state.mouse.down) {
        return;
    }

    if (
        state.activeTool !== "draw"
    ) {
        return;
    }

    const p =
        getCanvasPoint(event);

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
        annotation.type === "bbox"
    ) {

        annotation.width =
            p.x -
            state.mouse.startX;

        annotation.height =
            p.y -
            state.mouse.startY;

    }

    render();

}


function canvasMouseUp() {

    state.mouse.down =
        false;

    renderObjects();

    updateCanvasInfo();

}


function canvasDoubleClick(event) {

    const p =
        getCanvasPoint(event);

    const hit =
        findAnnotationAt(
            p.x,
            p.y
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

        render();

        renderObjects();

        saveTrainingSnapshot();

    }

}


/* =========================================================
   CANVAS COORDINATES
========================================================= */

function getCanvasPoint(event) {

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
            (event.clientX -
            rect.left) *
            scaleX,

        y:
            (event.clientY -
            rect.top) *
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

        const a =
            state.annotations[i];

        if (
            a.type === "bbox"
        ) {

            if (
                x >= a.x &&
                x <= a.x + a.width &&
                y >= a.y &&
                y <= a.y + a.height
            ) {

                return a;

            }

        }

        if (
            a.type === "polygon" &&
            a.points
        ) {

            if (
                pointInsidePolygon(
                    x,
                    y,
                    a.points
                )
            ) {

                return a;

            }

        }

    }

    return null;

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
            annotation.type === "bbox"
        ) {

            drawBox(annotation);

        }

        else if (
            annotation.type === "polygon"
        ) {

            drawPolygon(annotation);

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


function drawBox(annotation) {

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


function drawPolygon(annotation) {

    if (
        !annotation.points ||
        annotation.points.length < 3
    ) {

        return;

    }

    const selected =
        annotation.id ===
        state.selectedId;

    ctx.save();

    ctx.beginPath();

    annotation.points.forEach(
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


function drawSegmentation(
    annotation
) {

    if (!annotation.mask) {
        return;
    }

    const mask =
        new Image();

    mask.onload = () => {

        ctx.save();

        ctx.globalAlpha =
            annotation.id ===
            state.selectedId
                ? .45
                : .28;

        ctx.globalCompositeOperation =
            "source-over";

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


function drawLabel(
    label,
    confidence,
    x,
    y
) {

    const text =
        `${label} ${(confidence * 100).toFixed(0)}%`;

    ctx.font =
        "bold 14px Arial";

    const width =
        ctx.measureText(text).width + 10;

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
   POLYGON TEST
========================================================= */

function pointInsidePolygon(
    x,
    y,
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
            inside = !inside;
        }

    }

    return inside;

}


/* =========================================================
   OBJECT LIST
========================================================= */

function renderObjects() {

    const list =
        $("#objectList");

    if (
        state.annotations.length === 0
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
                                ${escapeHtml(annotation.label)}
                            </div>

                            <div class="object-meta">
                                ${annotation.type}
                                ${review}
                            </div>

                        </div>

                        <div class="object-confidence">
                            ${(annotation.confidence * 100).toFixed(0)}%
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
        `${state.annotations.length} object${state.annotations.length === 1 ? "" : "s"}`;

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
        state.annotations.length === 0
    ) {
        return;
    }

    saveUndoState();

    state.annotations = [];

    state.selectedId = null;

    render();

    renderObjects();

    updateCanvasInfo();

    updateQuality([]);

    showToast(
        "Annotations reset."
    );

}


/* =========================================================
   UNDO / REDO
========================================================= */

function saveUndoState() {

    state.undoStack.push(
        JSON.stringify(
            state.annotations
        )
    );

    if (
        state.undoStack.length > 50
    ) {

        state.undoStack.shift();

    }

    state.redoStack = [];

}


function undo() {

    if (
        state.undoStack.length === 0
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


function redo() {

    if (
        state.redoStack.length === 0
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
                event.key.toLowerCase() === "z"
            ) {

                event.preventDefault();

                undo();

            }

            if (
                event.ctrlKey &&
                event.key.toLowerCase() === "y"
            ) {

                event.preventDefault();

                redo();

            }

            if (
                event.key === "Delete"
            ) {

                deleteSelected();

            }

        }
    );

}


/* =========================================================
   ZOOM
========================================================= */

function setZoom(value) {

    state.zoom =
        Math.max(
            0.1,
            Math.min(
                4,
                value
            )
        );

    canvas.style.transform =
        `scale(${state.zoom})`;

    $("#zoomValue")
        .textContent =
        `${Math.round(state.zoom * 100)}%`;

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
   QUALITY ENGINE
========================================================= */

function updateQuality(
    annotations
) {

    if (
        annotations.length === 0
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


    if (reviewCount > 0) {

        score -=
            reviewCount /
            annotations.length *
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
        `${Math.round(score * 100)}%`;


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
   DOWNLOAD
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
        document.createElement("a");

    link.download =
        `${removeExtension(state.imageName)}_annotated.png`;

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
   JSON DOWNLOAD
========================================================= */

function downloadAnnotationJSON() {

    const data = {

        application:
            "AI Annotation Studio",

        version:
            "1.0",

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
        document.createElement("a");

    link.href =
        url;

    link.download =
        `${removeExtension(state.imageName)}_annotations.json`;

    link.click();

    URL.revokeObjectURL(
        url
    );

}


/* =========================================================
   TRAINING DATA
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


    training.push(record);


    /*
     * Keep browser storage manageable.
     */

    const trimmed =
        training.slice(-500);


    saveJSON(
        CONFIG.storageKeys.training,
        trimmed
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
        training.length === 0
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
            .slice(0, 50)
            .map(
                item => `
                    <div class="object-row">

                        <div class="object-info">

                            <div class="object-name">
                                ${escapeHtml(item.image)}
                            </div>

                            <div class="object-meta">
                                ${item.annotations.length}
                                annotations •
                                ${new Date(item.timestamp).toLocaleString()}
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
        training.length === 0
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
        document.createElement("a");

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
   RULE STORAGE
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
        history.length === 0
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
                item => `
                <div class="object-row">

                    <div class="object-info">

                        <div class="object-name">
                            ${escapeHtml(item.image)}
                        </div>

                        <div class="object-meta">
                            ${item.annotationCount}
                            objects •
                            ${item.annotationType} •
                            ${new Date(item.timestamp).toLocaleString()}
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
            3000
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
            .substring(2, 9)
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
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

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
            ) || JSON.stringify(fallback)
        );

    } catch {

        return fallback;

    }

}
