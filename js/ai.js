// ============================================================
// ANNOTATION AI
// PART 4 — js/ai.js
// AI / HUGGING FACE / AUTO ANNOTATION
// ============================================================

import {
    pipeline,
    env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

import * as Annotation from "./annotation.js";

import {
    APP_CONFIG
} from "./config.js";


// ============================================================
// HUGGING FACE CONFIGURATION
// ============================================================

env.allowLocalModels = false;
env.allowRemoteModels = true;


// ============================================================
// SHARED ANNOTATION API
// ============================================================

const state = Annotation.state;

const render =
    typeof Annotation.render === "function"
        ? Annotation.render
        : () => {};

const updateCounts =
    typeof Annotation.updateCounts === "function"
        ? Annotation.updateCounts
        : () => {};

const updateAnnotationsList =
    typeof Annotation.updateAnnotationsList === "function"
        ? Annotation.updateAnnotationsList
        : () => {};

const pushHistory =
    typeof Annotation.pushHistory === "function"
        ? Annotation.pushHistory
        : () => {};


// ============================================================
// LOCAL APPLICATION EVENT HELPER
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
            "Unable to emit application event:",
            name,
            error
        );
    }
}


// ============================================================
// HUGGING FACE MODEL CONFIGURATION
// ============================================================

const AI_MODELS = {
    detr:
        APP_CONFIG?.aiModels?.detr ||
        "Xenova/detr-resnet-50",

    yolo:
        APP_CONFIG?.aiModels?.yolo ||
        "Xenova/yolov9-c",

    panoptic:
        APP_CONFIG?.aiModels?.panoptic ||
        "Xenova/detr-resnet-50-panoptic"
};


// ============================================================
// MODEL CACHE
// ============================================================

const modelCache = {
    detr: null,
    yolo: null,
    panoptic: null
};


const modelPromises = {
    detr: null,
    yolo: null,
    panoptic: null
};


// ============================================================
// AI RUNTIME STATE
// ============================================================

let aiRunning = false;

let aiCancelled = false;

let currentAIModel = null;

let lastAIError = null;

let aiRunId = 0;


// ============================================================
// LABEL ALIASES
// ============================================================

const LABEL_ALIASES = {
    automobile: "car",
    automobiles: "car",

    vehicle: "car",
    vehicles: "car",

    "motor vehicle": "car",
    "motor vehicles": "car",

    human: "person",
    humans: "person",

    pedestrian: "person",
    pedestrians: "person",

    cyclist: "bicycle",
    cyclists: "bicycle",

    bike: "bicycle",
    bikes: "bicycle",

    motorcycle: "motorcycle",
    motorcycles: "motorcycle",

    auto: "car"
};


// ============================================================
// DEFAULT LABELS
// ============================================================

const DEFAULT_LABELS = [
    "person",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
    "traffic light",
    "stop sign",
    "dog",
    "cat",
    "bird"
];


// ============================================================
// DOM HELPER
// ============================================================

function $(id) {
    return document.getElementById(id);
}


function setText(
    id,
    text
) {
    const element =
        typeof id === "string"
            ? $(id)
            : id;

    if (!element) {
        return;
    }

    element.textContent =
        String(text ?? "");
}


function setDisplay(
    id,
    visible
) {
    const element =
        typeof id === "string"
            ? $(id)
            : id;

    if (!element) {
        return;
    }

    element.style.display =
        visible ? "" : "none";
}


// ============================================================
// AI STATUS ELEMENT
// ============================================================

function getAIStatusElement() {
    return (
        $("aiStatus") ||
        $("aiStatusText") ||
        $("autoAnnotateStatus") ||
        $("cloudStatus")
    );
}


function getAIProgressElement() {
    return (
        $("aiProgress") ||
        $("aiProgressBar") ||
        $("autoAnnotateProgress")
    );
}


// ============================================================
// AI STATUS
// ============================================================

export function setAIStatus(
    message,
    type = "info"
) {
    const element =
        getAIStatusElement();

    if (!element) {
        return;
    }

    element.textContent =
        String(message || "");

    element.dataset.status =
        type;

    element.classList.remove(
        "success",
        "error",
        "warning",
        "loading",
        "info"
    );

    element.classList.add(
        type
    );
}


export function updateAIStatus(
    message,
    type = "info"
) {
    setAIStatus(
        message,
        type
    );
}


// ============================================================
// AI PROGRESS
// ============================================================

function setAIProgress(
    value
) {
    const progress =
        getAIProgressElement();

    if (!progress) {
        return;
    }

    const numeric =
        Math.max(
            0,
            Math.min(
                100,
                Number(value) || 0
            )
        );

    if (
        progress.tagName ===
        "PROGRESS"
    ) {
        progress.value =
            numeric;

        progress.max =
            100;

        return;
    }

    progress.style.width =
        `${numeric}%`;

    progress.dataset.progress =
        String(numeric);
}


// ============================================================
// AI BUTTON STATE
// ============================================================

function setAIButtonState(
    running
) {
    const buttons = [
        $("autoAnnotate"),
        $("runAI"),
        $("runAi"),
        $("aiAnnotateButton")
    ].filter(Boolean);

    const uniqueButtons =
        [...new Set(buttons)];

    for (
        const button of uniqueButtons
    ) {
        button.disabled =
            Boolean(running);

        button.classList.toggle(
            "loading",
            Boolean(running)
        );

        if (
            button.dataset.originalText ===
            undefined
        ) {
            button.dataset.originalText =
                button.textContent;
        }

        if (running) {
            button.textContent =
                "AI Running…";
        } else if (
            button.dataset.originalText
        ) {
            button.textContent =
                button.dataset.originalText;
        }
    }
}


// ============================================================
// AI PERMISSION
// ============================================================

export async function checkAIPermission() {
    if (
        typeof window.canUseAI ===
        "function"
    ) {
        try {
            return Boolean(
                await window.canUseAI()
            );
        } catch (error) {
            console.warn(
                "canUseAI failed:",
                error
            );
        }
    }

    if (
        typeof window.checkAIPermission ===
        "function" &&
        window.checkAIPermission !==
            checkAIPermission
    ) {
        try {
            return Boolean(
                await window.checkAIPermission()
            );
        } catch (error) {
            console.warn(
                "External AI permission check failed:",
                error
            );
        }
    }

    if (
        window.APP_CONFIG &&
        window.APP_CONFIG.aiEnabled === false
    ) {
        return false;
    }

    if (
        APP_CONFIG &&
        APP_CONFIG.aiEnabled === false
    ) {
        return false;
    }

    return true;
}


// ============================================================
// CURRENT MEDIA
// ============================================================

function getCurrentMedia() {
    if (
        state.mediaType === "image" &&
        state.image
    ) {
        return state.image;
    }

    if (
        state.mediaType === "video"
    ) {
        return (
            $("sourceVideo") ||
            null
        );
    }

    return null;
}


// ============================================================
// MEDIA CHECK
// ============================================================

function hasUsableMedia() {
    const media =
        getCurrentMedia();

    if (!media) {
        return false;
    }

    if (
        state.mediaType === "image"
    ) {
        return Boolean(
            media.naturalWidth ||
            media.width
        );
    }

    if (
        state.mediaType === "video"
    ) {
        return Boolean(
            media.videoWidth &&
            media.videoHeight
        );
    }

    return false;
}


// ============================================================
// MODEL NAME
// ============================================================

function normalizeModelName(
    model
) {
    const value =
        String(
            model || "detr"
        )
            .trim()
            .toLowerCase();

    if (
        value === "yolo" ||
        value === "yolov9"
    ) {
        return "yolo";
    }

    if (
        value === "panoptic"
    ) {
        return "panoptic";
    }

    return "detr";
}


// ============================================================
// MODEL TASK
// ============================================================

function getModelTask(
    modelName
) {
    if (
        modelName === "panoptic"
    ) {
        return "image-segmentation";
    }

    return "object-detection";
}


// ============================================================
// LOAD AI MODEL
// ============================================================

export async function loadAIModel(
    model = "detr"
) {
    const modelName =
        normalizeModelName(
            model
        );

    if (
        modelCache[modelName]
    ) {
        currentAIModel =
            modelName;

        return modelCache[
            modelName
        ];
    }

    if (
        modelPromises[modelName]
    ) {
        return modelPromises[
            modelName
        ];
    }

    const modelId =
        AI_MODELS[
            modelName
        ];

    if (!modelId) {
        throw new Error(
            `Unknown AI model: ${modelName}`
        );
    }

    setAIStatus(
        `Loading AI model: ${modelId}`,
        "loading"
    );

    setAIProgress(
        5
    );

    modelPromises[modelName] =
        (async () => {
            try {
                const task =
                    getModelTask(
                        modelName
                    );

                const loaded =
                    await pipeline(
                        task,
                        modelId
                    );

                modelCache[
                    modelName
                ] = loaded;

                currentAIModel =
                    modelName;

                setAIProgress(
                    20
                );

                setAIStatus(
                    `AI model ready: ${modelName}`,
                    "success"
                );

                return loaded;
            } catch (error) {
                lastAIError =
                    error;

                modelPromises[
                    modelName
                ] = null;

                setAIStatus(
                    `AI model failed to load: ${
                        error?.message ||
                        error ||
                        "Unknown error"
                    }`,
                    "error"
                );

                throw error;
            }
        })();

    return modelPromises[
        modelName
    ];
}


// ============================================================
// PRELOAD MODEL
// ============================================================

export async function preloadAIModel(
    model = "detr"
) {
    try {
        return await loadAIModel(
            model
        );
    } catch (error) {
        console.warn(
            "AI preload failed:",
            error
        );

        return null;
    }
}


// ============================================================
// NORMALIZE LABEL
// ============================================================

export function normalizeLabel(
    label
) {
    const original =
        String(
            label ||
            "object"
        )
            .trim()
            .toLowerCase();

    return (
        LABEL_ALIASES[
            original
        ] ||
        original
    );
}


// ============================================================
// NORMALIZE SCORE
// ============================================================

function normalizeScore(
    score
) {
    const value =
        Number(score);

    if (
        !Number.isFinite(value)
    ) {
        return 0;
    }

    if (
        value > 1
    ) {
        return Math.max(
            0,
            Math.min(
                1,
                value / 100
            )
        );
    }

    return Math.max(
        0,
        Math.min(
            1,
            value
        )
    );
}


// ============================================================
// NORMALIZE BOX
// ============================================================

function normalizeBox(
    box
) {
    if (!box) {
        return null;
    }

    let xmin;
    let ymin;
    let xmax;
    let ymax;

    if (
        Array.isArray(box)
    ) {
        [
            xmin,
            ymin,
            xmax,
            ymax
        ] = box;
    } else {
        xmin =
            box.xmin ??
            box.x0 ??
            box.left ??
            box.x;

        ymin =
            box.ymin ??
            box.y0 ??
            box.top ??
            box.y;

        xmax =
            box.xmax ??
            box.x1 ??
            box.right;

        ymax =
            box.ymax ??
            box.y1 ??
            box.bottom;
    }

    xmin =
        Number(xmin);

    ymin =
        Number(ymin);

    xmax =
        Number(xmax);

    ymax =
        Number(ymax);

    if (
        !Number.isFinite(xmin) ||
        !Number.isFinite(ymin) ||
        !Number.isFinite(xmax) ||
        !Number.isFinite(ymax)
    ) {
        return null;
    }

    return {
        xmin:
            Math.min(
                xmin,
                xmax
            ),

        ymin:
            Math.min(
                ymin,
                ymax
            ),

        xmax:
            Math.max(
                xmin,
                xmax
            ),

        ymax:
            Math.max(
                ymin,
                ymax
            )
    };
}


// ============================================================
// NORMALIZE AI PREDICTIONS
// ============================================================

export function normalizeAIPredictions(
    predictions,
    imageWidth,
    imageHeight
) {
    if (!predictions) {
        return [];
    }

    let results;

    if (
        Array.isArray(
            predictions
        )
    ) {
        results =
            predictions;
    } else {
        results =
            predictions.detections ||
            predictions.predictions ||
            predictions.objects ||
            predictions.results ||
            [];
    }

    if (
        !Array.isArray(
            results
        )
    ) {
        return [];
    }

    const width =
        Number(imageWidth) || 1;

    const height =
        Number(imageHeight) || 1;

    const normalized = [];

    for (
        const prediction of results
    ) {
        if (!prediction) {
            continue;
        }

        const label =
            normalizeLabel(
                prediction.label ??
                prediction.class ??
                prediction.name ??
                prediction.category ??
                prediction.class_name
            );

        const score =
            normalizeScore(
                prediction.score ??
                prediction.confidence ??
                prediction.probability ??
                prediction.confidence_score
            );

        const box =
            normalizeBox(
                prediction.box ??
                prediction.bbox ??
                prediction.boundingBox ??
                prediction.bounding_box
            );

        if (!box) {
            continue;
        }

        let {
            xmin,
            ymin,
            xmax,
            ymax
        } = box;

        /*
         * Coordinates between 0 and 1
         * are interpreted as normalized
         * coordinates.
         */

        if (
            xmin >= 0 &&
            ymin >= 0 &&
            xmax <= 1 &&
            ymax <= 1
        ) {
            xmin *= width;
            xmax *= width;

            ymin *= height;
            ymax *= height;
        }

        xmin =
            Math.max(
                0,
                Math.min(
                    width,
                    xmin
                )
            );

        xmax =
            Math.max(
                0,
                Math.min(
                    width,
                    xmax
                )
            );

        ymin =
            Math.max(
                0,
                Math.min(
                    height,
                    ymin
                )
            );

        ymax =
            Math.max(
                0,
                Math.min(
                    height,
                    ymax
                )
            );

        const boxWidth =
            xmax -
            xmin;

        const boxHeight =
            ymax -
            ymin;

        if (
            boxWidth <= 1 ||
            boxHeight <= 1
        ) {
            continue;
        }

        normalized.push({
            label,
            score,

            box: {
                xmin,
                ymin,
                xmax,
                ymax
            },

            width:
                boxWidth,

            height:
                boxHeight,

            raw:
                prediction
        });
    }

    return normalized;
}


// ============================================================
// MEDIA DIMENSIONS
// ============================================================

function getMediaDimensions() {
    const media =
        getCurrentMedia();

    if (!media) {
        return {
            width: 1,
            height: 1
        };
    }

    if (
        state.mediaType === "image"
    ) {
        return {
            width:
                media.naturalWidth ||
                media.width ||
                1,

            height:
                media.naturalHeight ||
                media.height ||
                1
        };
    }

    return {
        width:
            media.videoWidth ||
            1,

        height:
            media.videoHeight ||
            1
    };
}


// ============================================================
// GET AI INPUT MEDIA
// ============================================================

function getAIInputMedia() {
    const media =
        getCurrentMedia();

    if (!media) {
        return null;
    }

    /*
     * Images can be passed directly.
     */

    if (
        state.mediaType === "image"
    ) {
        return media;
    }

    /*
     * For videos, use an offscreen canvas
     * containing the current video frame.
     */

    if (
        state.mediaType === "video"
    ) {
        if (
            !media.videoWidth ||
            !media.videoHeight
        ) {
            return null;
        }

        const offscreen =
            document.createElement(
                "canvas"
            );

        offscreen.width =
            media.videoWidth;

        offscreen.height =
            media.videoHeight;

        const context =
            offscreen.getContext(
                "2d",
                {
                    willReadFrequently:
                        false
                }
            );

        if (!context) {
            return null;
        }

        try {
            context.drawImage(
                media,
                0,
                0,
                media.videoWidth,
                media.videoHeight
            );

            return offscreen;
        } catch (error) {
            console.error(
                "Unable to capture video frame for AI:",
                error
            );

            return null;
        }
    }

    return null;
}


// ============================================================
// CREATE AI ANNOTATION
// ============================================================

export function createAIAnnotation(
    prediction,
    options = {}
) {
    if (!prediction) {
        return null;
    }

    const label =
        prediction.label ||
        "object";

    const score =
        prediction.score ??
        prediction.confidence ??
        0;

    const box =
        prediction.box;

    if (!box) {
        return null;
    }

    const normalizedBox =
        normalizeBox(
            box
        );

    if (!normalizedBox) {
        return null;
    }

    if (
        !state ||
        !Array.isArray(
            state.annotations
        )
    ) {
        return null;
    }

    const nextId =
        Number(
            state.nextId
        ) || 1;

    state.nextId =
        nextId + 1;

    const annotation = {
        id:
            nextId,

        type:
            options.type ||
            "box",

        label:
            normalizeLabel(
                label
            ),

        confidence:
            normalizeScore(
                score
            ),

        x:
            normalizedBox.xmin,

        y:
            normalizedBox.ymin,

        width:
            normalizedBox.xmax -
            normalizedBox.xmin,

        height:
            normalizedBox.ymax -
            normalizedBox.ymin,

        selected:
            false,

        occluded:
            false,

        truncated:
            false,

        source:
            "ai",

        aiGenerated:
            true,

        frame:
            state.mediaType ===
            "video"
                ? Number(
                    state.currentFrame
                ) || 0
                : 0,

        createdAt:
            Date.now()
    };

    if (
        Array.isArray(
            options.polygon
        )
    ) {
        annotation.points =
            options.polygon;

        annotation.type =
            "polygon";
    }

    return annotation;
}


// ============================================================
// IOU
// ============================================================

function intersectionOverUnion(
    a,
    b
) {
    if (
        !a?.box ||
        !b?.box
    ) {
        return 0;
    }

    const ax1 =
        a.box.xmin;

    const ay1 =
        a.box.ymin;

    const ax2 =
        a.box.xmax;

    const ay2 =
        a.box.ymax;

    const bx1 =
        b.box.xmin;

    const by1 =
        b.box.ymin;

    const bx2 =
        b.box.xmax;

    const by2 =
        b.box.ymax;

    const ix1 =
        Math.max(
            ax1,
            bx1
        );

    const iy1 =
        Math.max(
            ay1,
            by1
        );

    const ix2 =
        Math.min(
            ax2,
            bx2
        );

    const iy2 =
        Math.min(
            ay2,
            by2
        );

    const intersectionWidth =
        Math.max(
            0,
            ix2 - ix1
        );

    const intersectionHeight =
        Math.max(
            0,
            iy2 - iy1
        );

    const intersection =
        intersectionWidth *
        intersectionHeight;

    const areaA =
        Math.max(
            0,
            ax2 - ax1
        ) *
        Math.max(
            0,
            ay2 - ay1
        );

    const areaB =
        Math.max(
            0,
            bx2 - bx1
        ) *
        Math.max(
            0,
            by2 - by1
        );

    const union =
        areaA +
        areaB -
        intersection;

    if (
        union <= 0
    ) {
        return 0;
    }

    return (
        intersection /
        union
    );
}


// ============================================================
// REMOVE DUPLICATES
// ============================================================

function removeDuplicatePredictions(
    predictions,
    iouThreshold = 0.85
) {
    if (
        !Array.isArray(
            predictions
        )
    ) {
        return [];
    }

    const sorted =
        [...predictions]
            .sort(
                (a, b) =>
                    normalizeScore(
                        b.score
                    ) -
                    normalizeScore(
                        a.score
                    )
            );

    const output = [];

    for (
        const prediction of sorted
    ) {
        const duplicate =
            output.some(
                existing =>
                    existing.label ===
                        prediction.label &&
                    intersectionOverUnion(
                        existing,
                        prediction
                    ) >=
                        iouThreshold
            );

        if (!duplicate) {
            output.push(
                prediction
            );
        }
    }

    return output;
}


// ============================================================
// ADD AI PREDICTIONS
// ============================================================

export function addAIPredictions(
    predictions,
    options = {}
) {
    if (
        !Array.isArray(
            predictions
        )
    ) {
        return [];
    }

    if (
        !state ||
        !Array.isArray(
            state.annotations
        )
    ) {
        return [];
    }

    const {
        replace = false,
        deduplicate = true
    } = options;

    let items =
        deduplicate
            ? removeDuplicatePredictions(
                predictions
            )
            : predictions;

    if (replace) {
        state.annotations =
            [];

        state.selectedId =
            null;
    }

    const created = [];

    for (
        const prediction of items
    ) {
        const annotation =
            createAIAnnotation(
                prediction,
                options
            );

        if (!annotation) {
            continue;
        }

        state.annotations.push(
            annotation
        );

        created.push(
            annotation
        );
    }

    if (
        created.length
    ) {
        try {
            pushHistory(
                "AI annotations"
            );
        } catch (error) {
            console.warn(
                "Unable to save AI annotation history:",
                error
            );
        }
    }

    try {
        updateCounts();
    } catch (_) {}

    try {
        updateAnnotationsList();
    } catch (_) {}

    try {
        render();
    } catch (_) {}

    emit(
        "aiAnnotationsCreated",
        {
            count:
                created.length,

            annotations:
                created
        }
    );

    return created;
}


// ============================================================
// FALLBACK DETECTION
// ============================================================

export async function fallbackDetection(
    options = {}
) {
    const {
        threshold = 0.5
    } = options;

    try {
        const model =
            await loadAIModel(
                "detr"
            );

        const media =
            getAIInputMedia();

        if (!media) {
            return [];
        }

        const predictions =
            await model(
                media
            );

        const {
            width,
            height
        } =
            getMediaDimensions();

        return normalizeAIPredictions(
            predictions,
            width,
            height
        ).filter(
            item =>
                item.score >=
                threshold
        );
    } catch (error) {
        lastAIError =
            error;

        console.error(
            "Fallback detection failed:",
            error
        );

        return [];
    }
}


// ============================================================
// RUN DETECTION
// ============================================================

export async function runDetection(
    options = {}
) {
    const {
        model = "detr",
        threshold = 0.5
    } = options;

    const modelName =
        normalizeModelName(
            model
        );

    const media =
        getAIInputMedia();

    if (!media) {
        throw new Error(
            "No usable image or video frame is available."
        );
    }

    const aiModel =
        await loadAIModel(
            modelName
        );

    setAIStatus(
        "Running AI detection…",
        "loading"
    );

    setAIProgress(
        30
    );

    const predictions =
        await aiModel(
            media
        );

    setAIProgress(
        75
    );

    const {
        width,
        height
    } =
        getMediaDimensions();

    const normalized =
        normalizeAIPredictions(
            predictions,
            width,
            height
        );

    const filtered =
        normalized.filter(
            prediction =>
                prediction.score >=
                threshold
        );

    setAIProgress(
        90
    );

    return filtered;
}


// ============================================================
// RUN AUTO ANNOTATE
// ============================================================

export async function runAutoAnnotate(
    options = {}
) {
    if (aiRunning) {
        return [];
    }

    const permitted =
        await checkAIPermission();

    if (!permitted) {
        setAIStatus(
            "AI annotation is not available.",
            "warning"
        );

        return [];
    }

    if (!hasUsableMedia()) {
        setAIStatus(
            "Upload an image or video first.",
            "warning"
        );

        return [];
    }

    aiRunning =
        true;

    aiCancelled =
        false;

    const runId =
        ++aiRunId;

    setAIButtonState(
        true
    );

    setAIProgress(
        0
    );

    setAIStatus(
        "Preparing AI annotation…",
        "loading"
    );

    emit(
        "aiStarted",
        {
            runId
        }
    );

    try {
        const {
            model = "detr",
            threshold = 0.5,
            replace = false
        } = options;

        const predictions =
            await runDetection({
                model,
                threshold
            });

        if (
            aiCancelled ||
            runId !== aiRunId
        ) {
            setAIStatus(
                "AI annotation cancelled.",
                "warning"
            );

            return [];
        }

        const created =
            addAIPredictions(
                predictions,
                {
                    replace,
                    deduplicate:
                        true
                }
            );

        setAIProgress(
            100
        );

        setAIStatus(
            created.length
                ? `${created.length} AI annotation${
                    created.length === 1
                        ? ""
                        : "s"
                } created.`
                : "No objects detected.",
            created.length
                ? "success"
                : "info"
        );

        emit(
            "aiCompleted",
            {
                runId,

                count:
                    created.length,

                annotations:
                    created
            }
        );

        return created;
    } catch (error) {
        lastAIError =
            error;

        console.error(
            "AI annotation error:",
            error
        );

        setAIProgress(
            0
        );

        setAIStatus(
            `AI annotation failed: ${
                error?.message ||
                error ||
                "Unknown error"
            }`,
            "error"
        );

        emit(
            "aiError",
            {
                runId,
                error
            }
        );

        /*
         * Fallback to DETR if the
         * selected model fails.
         */

        try {
            if (
                !aiCancelled &&
                runId === aiRunId
            ) {
                setAIStatus(
                    "Trying fallback AI detection…",
                    "loading"
                );

                const fallback =
                    await fallbackDetection({
                        threshold:
                            options.threshold ??
                            0.5
                    });

                if (
                    fallback.length
                ) {
                    const created =
                        addAIPredictions(
                            fallback,
                            {
                                replace:
                                    Boolean(
                                        options.replace
                                    ),
                                deduplicate:
                                    true
                            }
                        );

                    setAIProgress(
                        100
                    );

                    setAIStatus(
                        `${created.length} AI annotation${
                            created.length === 1
                                ? ""
                                : "s"
                        } created using fallback detection.`,
                        "success"
                    );

                    return created;
                }
            }
        } catch (
            fallbackError
        ) {
            console.error(
                "Fallback AI error:",
                fallbackError
            );
        }

        return [];
    } finally {
        aiRunning =
            false;

        setAIButtonState(
            false
        );

        if (
            state &&
            state.mediaType
        ) {
            try {
                render();
            } catch (_) {}
        }

        emit(
            "aiFinished",
            {
                runId
            }
        );
    }
}


// ============================================================
// CANCEL AI
// ============================================================

export function cancelAI() {
    aiCancelled =
        true;

    aiRunId +=
        1;

    aiRunning =
        false;

    setAIButtonState(
        false
    );

    setAIStatus(
        "AI annotation cancelled.",
        "warning"
    );

    emit(
        "aiCancelled"
    );
}


// ============================================================
// AI RUNNING
// ============================================================

export function isAIRunning() {
    return aiRunning;
}


// ============================================================
// CURRENT MODEL
// ============================================================

export function getCurrentAIModel() {
    return currentAIModel;
}


// ============================================================
// LAST ERROR
// ============================================================

export function getLastAIError() {
    return lastAIError;
}


// ============================================================
// CLEAR MODEL CACHE
// ============================================================

export function clearAIModelCache() {
    modelCache.detr =
        null;

    modelCache.yolo =
        null;

    modelCache.panoptic =
        null;

    modelPromises.detr =
        null;

    modelPromises.yolo =
        null;

    modelPromises.panoptic =
        null;

    currentAIModel =
        null;
}


// ============================================================
// MODEL SELECTOR
// ============================================================

function bindAIModelSelector() {
    const selector =
        $("aiModel") ||
        $("aiModelSelect") ||
        $("modelSelect");

    if (!selector) {
        return;
    }

    if (
        selector.dataset.aiModelBound ===
        "true"
    ) {
        return;
    }

    selector.dataset.aiModelBound =
        "true";

    selector.addEventListener(
        "change",
        () => {
            currentAIModel =
                normalizeModelName(
                    selector.value
                );
        }
    );
}


// ============================================================
// THRESHOLD
// ============================================================

function getAIThreshold() {
    const element =
        $("aiThreshold") ||
        $("confidenceThreshold") ||
        $("aiConfidence");

    if (!element) {
        return 0.5;
    }

    let value =
        Number(
            element.value
        );

    if (
        !Number.isFinite(value)
    ) {
        return 0.5;
    }

    if (
        value > 1
    ) {
        value /=
            100;
    }

    return Math.max(
        0,
        Math.min(
            1,
            value
        )
    );
}


// ============================================================
// AUTO ANNOTATE BUTTON
// ============================================================

function bindAutoAnnotateButton() {
    const buttons = [
        $("autoAnnotate"),
        $("runAI"),
        $("runAi"),
        $("aiAnnotateButton")
    ].filter(Boolean);

    const uniqueButtons =
        [...new Set(buttons)];

    for (
        const button of uniqueButtons
    ) {
        if (
            button.dataset.aiBound ===
            "true"
        ) {
            continue;
        }

        button.dataset.aiBound =
            "true";

        button.addEventListener(
            "click",
            async event => {
                event.preventDefault();

                if (aiRunning) {
                    cancelAI();
                    return;
                }

                const selector =
                    $("aiModel") ||
                    $("aiModelSelect") ||
                    $("modelSelect");

                const model =
                    selector?.value ||
                    "detr";

                await runAutoAnnotate({
                    model:
                        normalizeModelName(
                            model
                        ),

                    threshold:
                        getAIThreshold(),

                    replace:
                        false
                });
            }
        );
    }
}


// ============================================================
// AI KEYBOARD SHORTCUT
// ============================================================

function bindAIKeyboardShortcut() {
    if (
        window.__annotationAIKeyboardBound
    ) {
        return;
    }

    window.__annotationAIKeyboardBound =
        true;

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.ctrlKey &&
                event.shiftKey &&
                event.key.toLowerCase() ===
                    "a"
            ) {
                const target =
                    event.target;

                if (
                    target &&
                    (
                        target.tagName ===
                            "INPUT" ||
                        target.tagName ===
                            "TEXTAREA" ||
                        target.tagName ===
                            "SELECT" ||
                        target.isContentEditable
                    )
                ) {
                    return;
                }

                event.preventDefault();

                if (aiRunning) {
                    cancelAI();
                } else {
                    runAutoAnnotate();
                }
            }
        }
    );
}


// ============================================================
// MEDIA LOADED
// ============================================================

function bindMediaLoaded() {
    if (
        window.__annotationAIMediaLoadedBound
    ) {
        return;
    }

    window.__annotationAIMediaLoadedBound =
        true;

    window.addEventListener(
        "annotation:mediaLoaded",
        () => {
            setAIProgress(
                0
            );

            setAIStatus(
                "Ready for AI annotation.",
                "info"
            );
        }
    );
}


// ============================================================
// APPLICATION AI EVENT
// ============================================================

function bindAIEvent() {
    if (
        window.__annotationAIRunEventBound
    ) {
        return;
    }

    window.__annotationAIRunEventBound =
        true;

    window.addEventListener(
        "annotation:runAI",
        () => {
            runAutoAnnotate();
        }
    );
}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.runAutoAnnotate =
    runAutoAnnotate;

window.autoAnnotate =
    runAutoAnnotate;

window.runAI =
    runAutoAnnotate;

window.cancelAI =
    cancelAI;

window.loadAIModel =
    loadAIModel;

window.preloadAIModel =
    preloadAIModel;

window.checkAIPermission =
    checkAIPermission;

window.normalizeAIPredictions =
    normalizeAIPredictions;

window.createAIAnnotation =
    createAIAnnotation;

window.addAIPredictions =
    addAIPredictions;

window.fallbackDetection =
    fallbackDetection;

window.runDetection =
    runDetection;

window.isAIRunning =
    isAIRunning;

window.getCurrentAIModel =
    getCurrentAIModel;

window.getLastAIError =
    getLastAIError;

window.setAIStatus =
    setAIStatus;

window.updateAIStatus =
    updateAIStatus;

window.clearAIModelCache =
    clearAIModelCache;


// ============================================================
// INITIALIZATION
// ============================================================

export function initializeAI() {
    bindAutoAnnotateButton();

    bindAIModelSelector();

    bindAIKeyboardShortcut();

    bindMediaLoaded();

    bindAIEvent();

    setAIProgress(
        0
    );

    if (
        hasUsableMedia()
    ) {
        setAIStatus(
            "Ready for AI annotation.",
            "info"
        );
    }
}


// ============================================================
// DOM INITIALIZATION
// ============================================================

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeAI,
        {
            once: true
        }
    );
} else {
    initializeAI();
}


// ============================================================
// END js/ai.js
// ============================================================
