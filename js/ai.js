// ============================================================
// ANNOTATION AI
// PART 4 — js/ai.js
// AI / HUGGING FACE / AUTO ANNOTATION
// ============================================================

import { pipeline, env } from
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

import {
    state,
    emit,
    render,
    updateCounts,
    updateAnnotationsList,
    pushHistory
} from "./annotation.js";

import {
    APP_CONFIG
} from "./config.js";


// ============================================================
// HUGGING FACE CONFIGURATION
// ============================================================

env.allowLocalModels = false;
env.allowRemoteModels = true;


// ============================================================
// AI MODEL CONFIGURATION
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
// AI MODEL CACHE
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
// AI STATE
// ============================================================

let aiRunning = false;

let aiCancelled = false;

let currentAIModel = null;

let lastAIError = null;

let aiRunId = 0;


// ============================================================
// AI LABEL ALIASES
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

    cyclist: "bicycle",
    cyclists: "bicycle",

    bike: "bicycle",
    bikes: "bicycle",

    motorcycle: "motorcycle",
    motorcycles: "motorcycle",

    pedestrian: "person",
    pedestrians: "person",

    auto: "car"
};


// ============================================================
// DEFAULT AI LABELS
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
// DOM HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


function setText(id, text) {
    const element =
        typeof id === "string"
            ? $(id)
            : id;

    if (!element) return;

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

    if (!element) return;

    element.style.display =
        visible ? "" : "none";
}


// ============================================================
// AI STATUS ELEMENTS
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

    if (!element) return;

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

    element.classList.add(type);
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


function setAIProgress(
    value
) {
    const progress =
        getAIProgressElement();

    if (!progress) return;

    const numeric =
        Math.max(
            0,
            Math.min(
                100,
                Number(value) || 0
            )
        );

    if (
        progress.tagName === "PROGRESS"
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
// AI STATUS HELPERS
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

    for (const button of buttons) {
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
// CHECK AI PERMISSION
// ============================================================

export async function checkAIPermission() {
    /*
     * The original application called a permission check
     * before running AI.
     *
     * We deliberately do not invent a database permission
     * table or schema here. If another module exposes an
     * application-level permission function, use it.
     */

    if (
        typeof window.canUseAI ===
        "function"
    ) {
        try {
            return Boolean(
                await window.canUseAI()
            );
        } catch (_) {
            return false;
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
        } catch (_) {
            return false;
        }
    }

    /*
     * AI is available locally through
     * Transformers.js unless the application
     * explicitly disables it.
     */

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
// GET CURRENT MEDIA
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
            document.getElementById(
                "sourceVideo"
            ) || null
        );
    }

    return null;
}


// ============================================================
// CHECK MEDIA
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
        String(model || "detr")
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
// LOAD AI MODEL
// ============================================================

export async function loadAIModel(
    model = "detr"
) {
    const modelName =
        normalizeModelName(model);

    if (
        modelCache[modelName]
    ) {
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
        AI_MODELS[modelName];

    setAIStatus(
        `Loading AI model: ${modelId}`,
        "loading"
    );

    setAIProgress(5);

    modelPromises[modelName] =
        (async () => {
            try {
                let task;

                if (
                    modelName ===
                    "panoptic"
                ) {
                    task =
                        "image-segmentation";
                } else {
                    task =
                        "object-detection";
                }

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

                setAIProgress(20);

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
// PRELOAD AI MODELS
// ============================================================

export async function preloadAIModel(
    model = "detr"
) {
    try {
        return await loadAIModel(
            model
        );
    } catch (_) {
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

    if (value > 1) {
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
    if (!box) return null;

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
            box.left;

        ymin =
            box.ymin ??
            box.y0 ??
            box.top;

        xmax =
            box.xmax ??
            box.x1 ??
            box.right;

        ymax =
            box.ymax ??
            box.y1 ??
            box.bottom;
    }

    xmin = Number(xmin);
    ymin = Number(ymin);
    xmax = Number(xmax);
    ymax = Number(ymax);

    if (
        !Number.isFinite(xmin) ||
        !Number.isFinite(ymin) ||
        !Number.isFinite(xmax) ||
        !Number.isFinite(ymax)
    ) {
        return null;
    }

    return {
        xmin: Math.min(
            xmin,
            xmax
        ),

        ymin: Math.min(
            ymin,
            ymax
        ),

        xmax: Math.max(
            xmin,
            xmax
        ),

        ymax: Math.max(
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

    const results =
        Array.isArray(
            predictions
        )
            ? predictions
            : (
                predictions
                    .detections ||
                predictions
                    .predictions ||
                predictions
                    .objects ||
                []
            );

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
                prediction.category
            );

        const score =
            normalizeScore(
                prediction.score ??
                prediction.confidence ??
                prediction.probability
            );

        const box =
            normalizeBox(
                prediction.box ??
                prediction.bbox ??
                prediction.boundingBox
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
         * Some models return normalized
         * coordinates from 0 to 1.
         */

        if (
            xmax <= 1 &&
            ymax <= 1 &&
            xmin >= 0 &&
            ymin >= 0
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
            xmax - xmin;

        const boxHeight =
            ymax - ymin;

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

            width: boxWidth,
            height: boxHeight
        });
    }

    return normalized;
}


// ============================================================
// DETERMINE IMAGE DIMENSIONS
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
// CREATE AI ANNOTATION
// ============================================================

export function createAIAnnotation(
    prediction,
    options = {}
) {
    if (!prediction) {
        return null;
    }

    const {
        label =
            prediction.label ||
            "object",

        score =
            prediction.score ||
            0,

        box =
            prediction.box
    } = prediction;

    if (!box) {
        return null;
    }

    const normalizedBox =
        normalizeBox(box);

    if (!normalizedBox) {
        return null;
    }

    const annotation = {
        id:
            state.nextId++,

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

        selected: false,

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
                ? state.currentFrame
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
// FALLBACK DETECTION
// ============================================================

export async function fallbackDetection(
    options = {}
) {
    /*
     * Keep fallback detection intentionally
     * conservative. It first attempts DETR.
     */

    const {
        threshold = 0.5
    } = options;

    try {
        const model =
            await loadAIModel(
                "detr"
            );

        const media =
            getCurrentMedia();

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
        getCurrentMedia();

    if (!media) {
        throw new Error(
            "No media is loaded."
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

    setAIProgress(30);

    const predictions =
        await aiModel(
            media
        );

    setAIProgress(75);

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

    setAIProgress(90);

    return filtered;
}


// ============================================================
// REMOVE OVERLAPPING DUPLICATES
// ============================================================

function intersectionOverUnion(
    a,
    b
) {
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

    if (!union) {
        return 0;
    }

    return intersection / union;
}


function removeDuplicatePredictions(
    predictions,
    iouThreshold = 0.85
) {
    const sorted =
        [...predictions]
            .sort(
                (a, b) =>
                    b.score -
                    a.score
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
// ADD PREDICTIONS TO ANNOTATIONS
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
        state.annotations = [];
        state.selectedId = null;
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

    if (created.length) {
        pushHistory(
            "AI annotations"
        );
    }

    updateCounts();

    updateAnnotationsList();

    render();

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
// AI ANNOTATION ENGINE
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

    aiRunning = true;

    aiCancelled = false;

    const runId =
        ++aiRunId;

    setAIButtonState(
        true
    );

    setAIProgress(0);

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

        setAIProgress(100);

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

        setAIProgress(0);

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
         * Try the fallback detector only when
         * the primary model fails.
         */

        try {
            if (
                !aiCancelled
            ) {
                setAIStatus(
                    "Trying fallback AI detection…",
                    "loading"
                );

                const fallback =
                    await fallbackDetection(
                        {
                            threshold:
                                options.threshold ??
                                0.5
                        }
                    );

                if (
                    fallback.length
                ) {
                    const created =
                        addAIPredictions(
                            fallback,
                            {
                                replace:
                                    options.replace ||
                                    false
                            }
                        );

                    setAIProgress(100);

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
        aiRunning = false;

        setAIButtonState(
            false
        );

        if (
            state.mediaType
        ) {
            render();
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
    aiCancelled = true;

    aiRunId += 1;

    aiRunning = false;

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
// CURRENT AI MODEL
// ============================================================

export function getCurrentAIModel() {
    return currentAIModel;
}


// ============================================================
// LAST AI ERROR
// ============================================================

export function getLastAIError() {
    return lastAIError;
}


// ============================================================
// CLEAR AI MODEL CACHE
// ============================================================

export function clearAIModelCache() {
    modelCache.detr = null;
    modelCache.yolo = null;
    modelCache.panoptic = null;

    modelPromises.detr = null;
    modelPromises.yolo = null;
    modelPromises.panoptic = null;

    currentAIModel = null;
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

    /*
     * Avoid binding the same element more
     * than once if multiple compatibility
     * IDs happen to point to the same node.
     */

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
            async () => {
                await runAutoAnnotate();
            }
        );
    }
}


// ============================================================
// AI MODEL SELECTOR
// ============================================================

function bindAIModelSelector() {
    const selector =
        $("aiModel") ||
        $("aiModelSelect") ||
        $("modelSelect");

    if (!selector) {
        return;
    }

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
// AI THRESHOLD SELECTOR
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

    if (value > 1) {
        value /= 100;
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
// ENHANCED AUTO ANNOTATE BINDING
// ============================================================

function bindEnhancedAIButton() {
    const button =
        $("autoAnnotate");

    if (!button) {
        return;
    }

    if (
        button.dataset.aiEnhanced ===
        "true"
    ) {
        return;
    }

    button.dataset.aiEnhanced =
        "true";

    /*
     * The generic binding above is intentionally
     * not used for this button after this point.
     */

    button.onclick =
        async (event) => {
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
        };
}


// ============================================================
// AI KEYBOARD SHORTCUT
// ============================================================

function bindAIKeyboardShortcut() {
    document.addEventListener(
        "keydown",
        (event) => {
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
// MEDIA LOADED EVENT
// ============================================================

function bindMediaLoaded() {
    window.addEventListener(
        "annotation:mediaLoaded",
        () => {
            setAIProgress(0);

            setAIStatus(
                "Ready for AI annotation.",
                "info"
            );
        }
    );
}


// ============================================================
// CUSTOM APPLICATION EVENT
// ============================================================

window.addEventListener(
    "annotation:runAI",
    () => {
        runAutoAnnotate();
    }
);


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

window.fallbackDetection =
    fallbackDetection;

window.isAIRunning =
    isAIRunning;

window.getCurrentAIModel =
    getCurrentAIModel;

window.setAIStatus =
    setAIStatus;


// ============================================================
// INITIALIZATION
// ============================================================

export function initializeAI() {
    bindAutoAnnotateButton();

    bindEnhancedAIButton();

    bindAIModelSelector();

    bindAIKeyboardShortcut();

    bindMediaLoaded();

    setAIProgress(0);

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
// INITIALIZE AFTER DOM
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
// END PART 4
// ============================================================
