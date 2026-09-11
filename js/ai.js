/* =========================================================
   AI ANNOTATION
   File: js/ai.js
   ========================================================= */

import {
  APP_CONFIG
} from "./config.js";

import {
  getCurrentUser,
  getCurrentProfile,
  getRole,
  canAnnotate
} from "./auth.js";

import {
  getSupabase,
  logActivity,
  logWorkflowEvent
} from "./supabase.js";


/* =========================================================
   TRANSFORMERS.JS
   ========================================================= */

const TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

let transformersModule = null;
let transformersLoadingPromise = null;


/* =========================================================
   STATE
   ========================================================= */

const state = {
  initialized: false,

  enabled: true,
  loading: false,
  running: false,

  currentModel: null,
  currentModelType: null,

  detector: null,

  lastResult: null,
  lastError: null,

  progress: 0,

  settings: {
    confidenceThreshold: 0.35,
    maxDetections: 100,
    modelType: "detr"
  }
};


/* =========================================================
   MODEL CONFIGURATION
   ========================================================= */

const MODELS = {
  detr:
    APP_CONFIG.aiModels?.detr ||
    "Xenova/detr-resnet-50",

  yolo:
    APP_CONFIG.aiModels?.yolo ||
    "Xenova/yolov9-c",

  panoptic:
    APP_CONFIG.aiModels?.panoptic ||
    "Xenova/detr-resnet-50-panoptic"
};


/* =========================================================
   LABELS
   ========================================================= */

const LABEL_ALIASES = {
  person: "person",
  people: "person",

  car: "car",
  automobile: "car",

  truck: "truck",
  bus: "bus",

  motorcycle: "motorcycle",
  motorbike: "motorcycle",

  bicycle: "bicycle",
  bike: "bicycle",

  traffic_light: "traffic light",
  "traffic light": "traffic light",

  stop_sign: "stop sign",
  "stop sign": "stop sign",

  fire_hydrant: "fire hydrant",
  "fire hydrant": "fire hydrant",

  dog: "dog",
  cat: "cat",
  bird: "bird",

  backpack: "backpack",
  handbag: "handbag",
  suitcase: "suitcase",

  chair: "chair",
  table: "table",

  "potted plant": "potted plant",
  potted_plant: "potted plant",

  tv: "tv",
  laptop: "laptop",
  keyboard: "keyboard",
  mouse: "mouse",

  phone: "cell phone",
  cell_phone: "cell phone",

  bottle: "bottle",
  cup: "cup",

  food: "food",
  banana: "banana",
  apple: "apple",

  boat: "boat",
  train: "train",
  airplane: "airplane",

  traffic_sign: "traffic sign",
  traffic_signs: "traffic sign"
};


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function numberOr(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function normalizeLabel(label) {
  if (!label) {
    return "object";
  }

  const raw =
    String(label)
      .trim()
      .toLowerCase();

  return (
    LABEL_ALIASES[raw] ||
    raw.replaceAll("_", " ")
  );
}

function showToast(message, type = "info") {
  if (
    typeof window.showToast ===
    "function"
  ) {
    window.showToast(
      message,
      type
    );
    return;
  }

  const container =
    byId("toastContainer");

  if (!container) {
    console.log(message);
    return;
  }

  const toast =
    document.createElement("div");

  toast.className =
    `toast toast-${type}`;

  toast.textContent =
    message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function dispatchAIEvent(
  name,
  detail = {}
) {
  document.dispatchEvent(
    new CustomEvent(
      name,
      {
        detail
      }
    )
  );
}


/* =========================================================
   SUPABASE
   ========================================================= */

function supabaseClient() {
  return (
    getSupabase?.() ||
    window.supabaseClient ||
    null
  );
}


/* =========================================================
   AUTHORIZATION
   ========================================================= */

function canUseAI() {
  const user =
    getCurrentUser();

  if (!user) {
    return false;
  }

  try {
    if (
      typeof canAnnotate ===
      "function"
    ) {
      return canAnnotate();
    }
  } catch {
    // Continue with role fallback.
  }

  const profile =
    getCurrentProfile?.();

  const role =
    profile?.role ||
    getRole?.() ||
    "";

  const normalized =
    String(role)
      .toLowerCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");

  return [
    "coworker_2d_box",
    "coworker_polygon",
    "coworker_segmentation",
    "reviewer",
    "staff",
    "admin"
  ].includes(normalized);
}


/* =========================================================
   SETTINGS
   ========================================================= */

function loadAISettings() {
  try {
    const stored =
      localStorage.getItem(
        "annotation_ai_settings"
      );

    if (!stored) {
      return;
    }

    const parsed =
      JSON.parse(stored);

    if (
      typeof parsed.enabled ===
      "boolean"
    ) {
      state.enabled =
        parsed.enabled;
    }

    if (
      parsed.confidenceThreshold !==
      undefined
    ) {
      state.settings.confidenceThreshold =
        clamp(
          numberOr(
            parsed.confidenceThreshold,
            0.35
          ),
          0,
          1
        );
    }

    if (
      parsed.maxDetections !==
      undefined
    ) {
      state.settings.maxDetections =
        Math.max(
          1,
          Math.floor(
            numberOr(
              parsed.maxDetections,
              100
            )
          )
        );
    }

    if (
      parsed.modelType &&
      MODELS[parsed.modelType]
    ) {
      state.settings.modelType =
        parsed.modelType;
    }
  } catch (error) {
    console.warn(
      "Unable to load AI settings:",
      error
    );
  }
}

function saveAISettings() {
  try {
    localStorage.setItem(
      "annotation_ai_settings",
      JSON.stringify({
        enabled:
          state.enabled,

        confidenceThreshold:
          state.settings
            .confidenceThreshold,

        maxDetections:
          state.settings
            .maxDetections,

        modelType:
          state.settings
            .modelType
      })
    );
  } catch (error) {
    console.warn(
      "Unable to save AI settings:",
      error
    );
  }
}

function setAIEnabled(enabled) {
  state.enabled =
    Boolean(enabled);

  saveAISettings();

  updateAIButtonState();

  dispatchAIEvent(
    "aiEnabledChanged",
    {
      enabled:
        state.enabled
    }
  );

  return state.enabled;
}

function setConfidenceThreshold(
  threshold
) {
  state.settings.confidenceThreshold =
    clamp(
      numberOr(
        threshold,
        0.35
      ),
      0,
      1
    );

  saveAISettings();

  return (
    state.settings
      .confidenceThreshold
  );
}

function setMaxDetections(
  maximum
) {
  state.settings.maxDetections =
    Math.max(
      1,
      Math.floor(
        numberOr(
          maximum,
          100
        )
      )
    );

  saveAISettings();

  return (
    state.settings
      .maxDetections
  );
}

function setModelType(
  modelType
) {
  if (
    !MODELS[modelType]
  ) {
    throw new Error(
      `Unknown AI model: ${modelType}`
    );
  }

  state.settings.modelType =
    modelType;

  /*
   * Force model reload next time
   * auto annotation is requested.
   */
  if (
    state.currentModelType !==
    modelType
  ) {
    state.detector = null;
    state.currentModel = null;
    state.currentModelType = null;
  }

  saveAISettings();

  return modelType;
}


/* =========================================================
   LOAD TRANSFORMERS.JS
   ========================================================= */

async function loadTransformers() {
  if (
    transformersModule
  ) {
    return transformersModule;
  }

  if (
    transformersLoadingPromise
  ) {
    return transformersLoadingPromise;
  }

  transformersLoadingPromise =
    import(
      /* @vite-ignore */
      TRANSFORMERS_URL
    )
      .then(module => {
        transformersModule =
          module;

        /*
         * Match the original application behavior:
         * remote models are allowed and local models
         * are disabled.
         */
        if (
          transformersModule.env
        ) {
          transformersModule.env
            .allowLocalModels = false;

          transformersModule.env
            .allowRemoteModels = true;
        }

        return transformersModule;
      })
      .catch(error => {
        transformersLoadingPromise =
          null;

        throw error;
      });

  return transformersLoadingPromise;
}


/* =========================================================
   LOAD DETECTOR
   ========================================================= */

async function loadDetector(
  modelType =
    state.settings.modelType
) {
  if (
    !MODELS[modelType]
  ) {
    throw new Error(
      `AI model "${modelType}" is not configured.`
    );
  }

  if (
    state.detector &&
    state.currentModelType ===
      modelType
  ) {
    return state.detector;
  }

  state.loading = true;
  state.progress = 0;
  state.lastError = null;

  updateAIButtonState();

  dispatchAIEvent(
    "aiModelLoading",
    {
      modelType,
      model:
        MODELS[modelType]
    }
  );

  try {
    const {
      pipeline
    } = await loadTransformers();

    if (
      typeof pipeline !==
      "function"
    ) {
      throw new Error(
        "Transformers.js pipeline() is unavailable."
      );
    }

    state.progress = 15;
    updateAIProgress();

    /*
     * DETR is the default object detector.
     */
    const task =
      modelType === "panoptic"
        ? "image-segmentation"
        : "object-detection";

    const detector =
      await pipeline(
        task,
        MODELS[modelType],
        {
          progress_callback:
            progress => {
              let value =
                20;

              if (
                typeof progress
                  ?.progress ===
                "number"
              ) {
                value =
                  20 +
                  (
                    progress.progress *
                    0.65
                  );
              }

              state.progress =
                clamp(
                  Math.round(value),
                  20,
                  85
                );

              updateAIProgress();
            }
        }
      );

    state.detector =
      detector;

    state.currentModel =
      MODELS[modelType];

    state.currentModelType =
      modelType;

    state.progress = 90;

    updateAIProgress();

    dispatchAIEvent(
      "aiModelLoaded",
      {
        modelType,
        model:
          MODELS[modelType]
      }
    );

    return detector;
  } catch (error) {
    state.lastError =
      error;

    dispatchAIEvent(
      "aiModelError",
      {
        error,
        modelType
      }
    );

    throw error;
  } finally {
    state.loading = false;

    updateAIButtonState();
  }
}


/* =========================================================
   IMAGE / VIDEO SOURCE
   ========================================================= */

function getAnnotationImage() {
  const image =
    byId("annotationImage");

  if (
    image &&
    image.complete &&
    image.naturalWidth > 0
  ) {
    return image;
  }

  return null;
}

function getAnnotationVideo() {
  const video =
    byId("annotationVideo");

  if (
    video &&
    video.readyState >= 2 &&
    video.videoWidth > 0
  ) {
    return video;
  }

  return null;
}

function getMediaElement() {
  return (
    getAnnotationImage() ||
    getAnnotationVideo()
  );
}

function getCanvasDimensions(
  element
) {
  if (!element) {
    return {
      width: 0,
      height: 0
    };
  }

  if (
    element.tagName ===
    "VIDEO"
  ) {
    return {
      width:
        element.videoWidth ||
        element.clientWidth ||
        0,

      height:
        element.videoHeight ||
        element.clientHeight ||
        0
    };
  }

  return {
    width:
      element.naturalWidth ||
      element.width ||
      element.clientWidth ||
      0,

    height:
      element.naturalHeight ||
      element.height ||
      element.clientHeight ||
      0
  };
}


/* =========================================================
   IMAGE DATA
   ========================================================= */

function createCanvasFromElement(
  element
) {
  const {
    width,
    height
  } =
    getCanvasDimensions(
      element
    );

  if (
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      "Media has no usable dimensions."
    );
  }

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const context =
    canvas.getContext(
      "2d",
      {
        willReadFrequently:
          false
      }
    );

  if (!context) {
    throw new Error(
      "Unable to create drawing context."
    );
  }

  context.drawImage(
    element,
    0,
    0,
    width,
    height
  );

  return canvas;
}

function canvasToDataURL(
  canvas
) {
  return canvas.toDataURL(
    "image/jpeg",
    0.9
  );
}


/* =========================================================
   AI OUTPUT NORMALIZATION
   ========================================================= */

function normalizeBox(
  box,
  sourceWidth,
  sourceHeight
) {
  if (!box) {
    return null;
  }

  /*
   * Transformers.js DETR normally returns:
   * { xmin, ymin, xmax, ymax }
   */
  let xmin =
    numberOr(
      box.xmin ??
      box.x0 ??
      box.left,
      0
    );

  let ymin =
    numberOr(
      box.ymin ??
      box.y0 ??
      box.top,
      0
    );

  let xmax =
    numberOr(
      box.xmax ??
      box.x1 ??
      box.right,
      0
    );

  let ymax =
    numberOr(
      box.ymax ??
      box.y1 ??
      box.bottom,
      0
    );

  /*
   * Some models return normalized
   * 0–1 coordinates.
   */
  if (
    xmin >= 0 &&
    xmin <= 1 &&
    xmax >= 0 &&
    xmax <= 1 &&
    ymin >= 0 &&
    ymin <= 1 &&
    ymax >= 0 &&
    ymax <= 1 &&
    sourceWidth > 2 &&
    sourceHeight > 2
  ) {
    xmin *= sourceWidth;
    xmax *= sourceWidth;
    ymin *= sourceHeight;
    ymax *= sourceHeight;
  }

  xmin =
    clamp(
      xmin,
      0,
      sourceWidth
    );

  xmax =
    clamp(
      xmax,
      0,
      sourceWidth
    );

  ymin =
    clamp(
      ymin,
      0,
      sourceHeight
    );

  ymax =
    clamp(
      ymax,
      0,
      sourceHeight
    );

  if (
    xmax <= xmin ||
    ymax <= ymin
  ) {
    return null;
  }

  return {
    xmin,
    ymin,
    xmax,
    ymax
  };
}

function normalizeDetection(
  detection,
  sourceWidth,
  sourceHeight,
  index
) {
  if (!detection) {
    return null;
  }

  const score =
    numberOr(
      detection.score ??
      detection.confidence ??
      detection.probability,
      0
    );

  if (
    score <
    state.settings
      .confidenceThreshold
  ) {
    return null;
  }

  const box =
    normalizeBox(
      detection.box ||
      detection.bbox ||
      detection,
      sourceWidth,
      sourceHeight
    );

  if (!box) {
    return null;
  }

  const rawLabel =
    detection.label ||
    detection.class ||
    detection.name ||
    `object-${index + 1}`;

  const label =
    normalizeLabel(
      rawLabel
    );

  return {
    id:
      `ai-${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    label,

    originalLabel:
      String(rawLabel),

    classification:
      label,

    confidence:
      clamp(
        score,
        0,
        1
      ),

    score:
      clamp(
        score,
        0,
        1
      ),

    occlusion:
      "unknown",

    truncation:
      "unknown",

    type:
      "box",

    source:
      "ai",

    aiGenerated:
      true,

    box
  };
}


/* =========================================================
   DETECTION PARSING
   ========================================================= */

function parseObjectDetectionOutput(
  output,
  sourceWidth,
  sourceHeight
) {
  if (!Array.isArray(output)) {
    return [];
  }

  const annotations = [];

  for (
    let index = 0;
    index < output.length;
    index++
  ) {
    const normalized =
      normalizeDetection(
        output[index],
        sourceWidth,
        sourceHeight,
        index
      );

    if (normalized) {
      annotations.push(
        normalized
      );
    }

    if (
      annotations.length >=
      state.settings
        .maxDetections
    ) {
      break;
    }
  }

  return annotations;
}


/* =========================================================
   SEGMENTATION OUTPUT
   ========================================================= */

function maskToPolygon(
  mask,
  sourceWidth,
  sourceHeight
) {
  /*
   * Segmentation output formats vary by
   * Transformers.js/model version. This function
   * supports common tensor-like mask objects.
   */
  if (!mask) {
    return null;
  }

  let data =
    mask.data ||
    mask;

  let width =
    numberOr(
      mask.width ??
      mask.shape?.[mask.shape.length - 1],
      0
    );

  let height =
    numberOr(
      mask.height ??
      mask.shape?.[mask.shape.length - 2],
      0
    );

  if (
    !data ||
    !width ||
    !height
  ) {
    return null;
  }

  try {
    /*
     * Convert a binary mask to a simple polygon
     * using its occupied bounding region.
     *
     * This keeps the AI output compatible with the
     * annotation editor without requiring a heavy
     * polygon tracing library.
     */
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    const length =
      Math.min(
        data.length ||
        0,
        width * height
      );

    for (
      let i = 0;
      i < length;
      i++
    ) {
      const value =
        numberOr(
          data[i],
          0
        );

      if (
        value <= 0.5
      ) {
        continue;
      }

      const x =
        i % width;

      const y =
        Math.floor(
          i / width
        );

      minX =
        Math.min(
          minX,
          x
        );

      minY =
        Math.min(
          minY,
          y
        );

      maxX =
        Math.max(
          maxX,
          x
        );

      maxY =
        Math.max(
          maxY,
          y
        );
    }

    if (
      maxX < minX ||
      maxY < minY
    ) {
      return null;
    }

    const scaleX =
      sourceWidth /
      width;

    const scaleY =
      sourceHeight /
      height;

    return [
      {
        x:
          minX *
          scaleX,

        y:
          minY *
          scaleY
      },
      {
        x:
          (maxX + 1) *
          scaleX,

        y:
          minY *
          scaleY
      },
      {
        x:
          (maxX + 1) *
          scaleX,

        y:
          (maxY + 1) *
          scaleY
      },
      {
        x:
          minX *
          scaleX,

        y:
          (maxY + 1) *
          scaleY
      }
    ];
  } catch {
    return null;
  }
}

function parseSegmentationOutput(
  output,
  sourceWidth,
  sourceHeight
) {
  if (!Array.isArray(output)) {
    return [];
  }

  const annotations = [];

  for (
    let index = 0;
    index < output.length;
    index++
  ) {
    const item =
      output[index];

    if (!item) {
      continue;
    }

    const score =
      numberOr(
        item.score ??
        item.confidence,
        0
      );

    if (
      score <
      state.settings
        .confidenceThreshold
    ) {
      continue;
    }

    const label =
      normalizeLabel(
        item.label ||
        item.class ||
        `object-${index + 1}`
      );

    const polygon =
      maskToPolygon(
        item.mask ||
        item.segmentation,
        sourceWidth,
        sourceHeight
      );

    if (
      !polygon ||
      polygon.length < 3
    ) {
      continue;
    }

    annotations.push({
      id:
        `ai-seg-${Date.now()}-${index}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      label,

      classification:
        label,

      confidence:
        clamp(
          score,
          0,
          1
        ),

      score:
        clamp(
          score,
          0,
          1
        ),

      occlusion:
        "unknown",

      truncation:
        "unknown",

      type:
        "segmentation",

      source:
        "ai",

      aiGenerated:
        true,

      polygon
    });

    if (
      annotations.length >=
      state.settings
        .maxDetections
    ) {
      break;
    }
  }

  return annotations;
}


/* =========================================================
   RUN MODEL
   ========================================================= */

async function runDetection(
  element,
  modelType =
    state.settings.modelType
) {
  if (!element) {
    throw new Error(
      "No media is loaded."
    );
  }

  const {
    width,
    height
  } =
    getCanvasDimensions(
      element
    );

  if (
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      "Media is not ready for AI annotation."
    );
  }

  const detector =
    await loadDetector(
      modelType
    );

  state.running = true;
  state.progress = 92;

  updateAIButtonState();
  updateAIProgress();

  try {
    let input =
      element;

    /*
     * Some environments/models handle an image/video
     * element directly. If that fails, retry using a
     * canvas-generated image.
     */
    let output;

    try {
      output =
        await detector(
          input,
          {
            threshold:
              state.settings
                .confidenceThreshold,

            percentage:
              true
          }
        );
    } catch (
      directError
    ) {
      console.warn(
        "Direct AI input failed; retrying through canvas:",
        directError
      );

      const canvas =
        createCanvasFromElement(
          element
        );

      input =
        canvasToDataURL(
          canvas
        );

      output =
        await detector(
          input,
          {
            threshold:
              state.settings
                .confidenceThreshold,

            percentage:
              true
          }
        );
    }

    state.progress = 100;

    updateAIProgress();

    return {
      output,
      width,
      height,
      modelType
    };
  } finally {
    state.running = false;

    updateAIButtonState();
  }
}


/* =========================================================
   CONVERT AI RESULT TO APP ANNOTATIONS
   ========================================================= */

function convertAIResult(
  result
) {
  if (!result) {
    return [];
  }

  const {
    output,
    width,
    height,
    modelType
  } = result;

  if (
    modelType ===
    "panoptic"
  ) {
    return parseSegmentationOutput(
      output,
      width,
      height
    );
  }

  return parseObjectDetectionOutput(
    output,
    width,
    height
  );
}


/* =========================================================
   SEND ANNOTATIONS TO ANNOTATION MODULE
   ========================================================= */

function addToAnnotationWorkspace(
  annotations
) {
  if (
    !Array.isArray(
      annotations
    ) ||
    !annotations.length
  ) {
    return [];
  }

  /*
   * Preferred modular API.
   */
  if (
    window.annotation &&
    typeof window.annotation
      .addAnnotations ===
      "function"
  ) {
    return window.annotation
      .addAnnotations(
        annotations
      );
  }

  if (
    window.annotation &&
    typeof window.annotation
      .addAnnotation ===
      "function"
  ) {
    const added = [];

    for (
      const annotation of
      annotations
    ) {
      const result =
        window.annotation
          .addAnnotation(
            annotation
          );

      if (result) {
        added.push(
          result
        );
      }
    }

    return added;
  }

  /*
   * Event-based fallback.
   */
  dispatchAIEvent(
    "aiAnnotationsReady",
    {
      annotations
    }
  );

  /*
   * Legacy compatibility.
   */
  if (
    typeof window.applyAIAnnotations ===
    "function"
  ) {
    return window.applyAIAnnotations(
      annotations
    );
  }

  return annotations;
}


/* =========================================================
   MAIN AUTO ANNOTATION
   ========================================================= */

async function autoAnnotate(
  options = {}
) {
  if (
    state.running
  ) {
    showToast(
      "AI annotation is already running.",
      "info"
    );

    return [];
  }

  if (
    !state.enabled &&
    options.ignoreDisabled !==
      true
  ) {
    showToast(
      "AI annotation is disabled in settings.",
      "error"
    );

    return [];
  }

  if (!canUseAI()) {
    showToast(
      "Your current role cannot use AI annotation.",
      "error"
    );

    return [];
  }

  const element =
    options.element ||
    getMediaElement();

  if (!element) {
    showToast(
      "Load an image or video frame first.",
      "error"
    );

    return [];
  }

  const modelType =
    options.modelType ||
    state.settings.modelType;

  state.lastError =
    null;

  state.lastResult =
    null;

  dispatchAIEvent(
    "aiStarted",
    {
      modelType
    }
  );

  showToast(
    "AI is analyzing the media...",
    "info"
  );

  try {
    const result =
      await runDetection(
        element,
        modelType
      );

    const annotations =
      convertAIResult(
        result
      );

    state.lastResult = {
      ...result,
      annotations
    };

    if (
      !annotations.length
    ) {
      showToast(
        "AI did not find objects above the confidence threshold.",
        "info"
      );

      dispatchAIEvent(
        "aiCompleted",
        {
          annotations: [],
          result:
            state.lastResult
        }
      );

      return [];
    }

    const added =
      addToAnnotationWorkspace(
        annotations
      );

    const finalAnnotations =
      Array.isArray(added)
        ? added
        : annotations;

    /*
     * Notify tasks.js / annotation.js so the
     * current task can be persisted.
     */
    dispatchAIEvent(
      "aiAnnotationsAdded",
      {
        annotations:
          finalAnnotations,

        count:
          finalAnnotations.length,

        model:
          MODELS[modelType]
      }
    );

    await recordAIActivity(
      finalAnnotations,
      modelType
    );

    showToast(
      `${finalAnnotations.length} AI annotation${
        finalAnnotations.length === 1
          ? ""
          : "s"
      } added.`,
      "success"
    );

    dispatchAIEvent(
      "aiCompleted",
      {
        annotations:
          finalAnnotations,

        result:
          state.lastResult
      }
    );

    return finalAnnotations;
  } catch (error) {
    state.lastError =
      error;

    console.error(
      "AI annotation failed:",
      error
    );

    showToast(
      error?.message ||
      "AI annotation failed.",
      "error"
    );

    dispatchAIEvent(
      "aiError",
      {
        error
      }
    );

    return [];
  } finally {
    state.progress = 0;

    updateAIProgress();

    state.running = false;

    updateAIButtonState();
  }
}


/* =========================================================
   VIDEO FRAME AI
   ========================================================= */

async function autoAnnotateCurrentFrame(
  options = {}
) {
  const video =
    getAnnotationVideo();

  if (!video) {
    showToast(
      "No video frame is loaded.",
      "error"
    );

    return [];
  }

  /*
   * The video element represents the current frame,
   * so the detector receives exactly the frame currently
   * displayed in the annotation workspace.
   */
  return autoAnnotate({
    ...options,
    element:
      video
  });
}


/* =========================================================
   AI ACTIVITY LOG
   ========================================================= */

async function recordAIActivity(
  annotations,
  modelType
) {
  const user =
    getCurrentUser();

  if (!user?.id) {
    return;
  }

  const payload = {
    user_id:
      user.id,

    model:
      MODELS[modelType],

    model_type:
      modelType,

    annotation_count:
      Array.isArray(
        annotations
      )
        ? annotations.length
        : 0,

    confidence_threshold:
      state.settings
        .confidenceThreshold
  };

  try {
    await logWorkflowEvent?.(
      "ai_annotation_completed",
      payload
    );
  } catch (error) {
    console.warn(
      "Workflow event logging failed:",
      error
    );
  }

  try {
    await logActivity?.(
      "ai_annotation_completed",
      payload
    );
  } catch (error) {
    console.warn(
      "Activity logging failed:",
      error
    );
  }
}


/* =========================================================
   AI BUTTON UI
   ========================================================= */

function updateAIButtonState() {
  const button =
    byId("autoAnnotate");

  if (!button) {
    return;
  }

  const disabled =
    !state.enabled ||
    state.loading ||
    state.running;

  /*
   * Do not permanently disable the button for roles here.
   * Workspace/auth controls visibility.
   */
  button.disabled =
    disabled;

  button.classList.toggle(
    "ai-running",
    state.running
  );

  button.classList.toggle(
    "ai-loading",
    state.loading
  );

  if (
    state.running
  ) {
    button.setAttribute(
      "aria-busy",
      "true"
    );

    button.dataset.originalText =
      button.dataset.originalText ||
      button.textContent;

    button.textContent =
      "AI analyzing…";
  } else if (
    state.loading
  ) {
    button.setAttribute(
      "aria-busy",
      "true"
    );

    button.dataset.originalText =
      button.dataset.originalText ||
      button.textContent;

    button.textContent =
      "Loading AI…";
  } else {
    button.removeAttribute(
      "aria-busy"
    );

    if (
      button.dataset.originalText
    ) {
      button.textContent =
        button.dataset.originalText;

      delete button.dataset
        .originalText;
    }
  }

  button.title =
    state.enabled
      ? "Automatically detect objects"
      : "AI annotation is disabled";
}

function updateAIProgress() {
  const progress =
    byId("aiProgress");

  if (progress) {
    progress.value =
      state.progress;

    progress.textContent =
      `${state.progress}%`;
  }

  const progressBar =
    byId("aiProgressBar");

  if (progressBar) {
    progressBar.style.width =
      `${state.progress}%`;
  }

  const progressText =
    byId("aiProgressText");

  if (progressText) {
    progressText.textContent =
      state.progress > 0
        ? `${state.progress}%`
        : "";
  }
}


/* =========================================================
   AI BUTTON BINDING
   ========================================================= */

function bindAutoAnnotateButton() {
  const button =
    byId("autoAnnotate");

  if (!button) {
    return;
  }

  if (
    button.dataset.aiBound ===
    "true"
  ) {
    return;
  }

  button.dataset.aiBound =
    "true";

  button.addEventListener(
    "click",
    async event => {
      event.preventDefault();

      await autoAnnotate();
    }
  );
}


/* =========================================================
   SETTINGS UI
   ========================================================= */

function bindSettingsControls() {
  const toggle =
    byId("aiEnabledToggle");

  if (toggle) {
    /*
     * Handle checkbox and non-checkbox controls.
     */
    if (
      toggle.type ===
      "checkbox"
    ) {
      toggle.checked =
        state.enabled;
    } else if (
      toggle.tagName ===
      "SELECT"
    ) {
      toggle.value =
        state.enabled
          ? "true"
          : "false";
    }

    if (
      toggle.dataset.aiBound !==
      "true"
    ) {
      toggle.dataset.aiBound =
        "true";

      toggle.addEventListener(
        "change",
        () => {
          const enabled =
            toggle.type ===
            "checkbox"
              ? toggle.checked
              : String(
                  toggle.value
                ) === "true";

          setAIEnabled(
            enabled
          );
        }
      );
    }
  }

  const confidence =
    byId(
      "aiConfidenceThreshold"
    );

  if (confidence) {
    confidence.value =
      state.settings
        .confidenceThreshold;

    if (
      confidence.dataset.aiBound !==
      "true"
    ) {
      confidence.dataset.aiBound =
        "true";

      confidence.addEventListener(
        "change",
        () => {
          setConfidenceThreshold(
            confidence.value
          );
        }
      );
    }
  }

  const maximum =
    byId(
      "aiMaxDetections"
    );

  if (maximum) {
    maximum.value =
      state.settings
        .maxDetections;

    if (
      maximum.dataset.aiBound !==
      "true"
    ) {
      maximum.dataset.aiBound =
        "true";

      maximum.addEventListener(
        "change",
        () => {
          setMaxDetections(
            maximum.value
          );
        }
      );
    }
  }

  const model =
    byId(
      "aiModelSelect"
    );

  if (model) {
    model.value =
      state.settings
        .modelType;

    if (
      model.dataset.aiBound !==
      "true"
    ) {
      model.dataset.aiBound =
        "true";

      model.addEventListener(
        "change",
        () => {
          try {
            setModelType(
              model.value
            );
          } catch (
            error
          ) {
            showToast(
              error.message,
              "error"
            );
          }
        }
      );
    }
  }
}


/* =========================================================
   PUBLIC MODEL CONTROL
   ========================================================= */

async function preloadModel(
  modelType =
    state.settings.modelType
) {
  if (!canUseAI()) {
    return false;
  }

  try {
    await loadDetector(
      modelType
    );

    return true;
  } catch (error) {
    console.error(
      "AI preload failed:",
      error
    );

    return false;
  }
}

function unloadModel() {
  state.detector =
    null;

  state.currentModel =
    null;

  state.currentModelType =
    null;

  state.progress =
    0;

  updateAIProgress();
}


/* =========================================================
   INITIALIZE
   ========================================================= */

async function initializeAI() {
  if (
    state.initialized
  ) {
    return state;
  }

  loadAISettings();

  bindAutoAnnotateButton();
  bindSettingsControls();

  updateAIButtonState();
  updateAIProgress();

  state.initialized =
    true;

  return state;
}


/* =========================================================
   AUTH CHANGE
   ========================================================= */

document.addEventListener(
  "authStateChanged",
  () => {
    updateAIButtonState();
  }
);

document.addEventListener(
  "profileUpdated",
  () => {
    updateAIButtonState();
  }
);


/* =========================================================
   MEDIA CHANGE
   ========================================================= */

document.addEventListener(
  "mediaLoaded",
  () => {
    state.lastResult =
      null;

    state.lastError =
      null;

    updateAIButtonState();
  }
);

document.addEventListener(
  "taskSelected",
  () => {
    state.lastResult =
      null;

    state.lastError =
      null;

    updateAIButtonState();
  }
);


/* =========================================================
   LEGACY COMPATIBILITY
   ========================================================= */

window.ai = {
  state,

  initialize:
    initializeAI,

  loadTransformers,
  loadDetector,

  autoAnnotate,
  autoAnnotateCurrentFrame,

  preloadModel,
  unloadModel,

  setEnabled:
    setAIEnabled,

  setConfidenceThreshold,
  setMaxDetections,
  setModelType,

  getMediaElement,

  getImage:
    getAnnotationImage,

  getVideo:
    getAnnotationVideo
};


/* =========================================================
   EXPORTS
   ========================================================= */

export {
  state,

  MODELS,

  initializeAI,

  loadTransformers,
  loadDetector,

  autoAnnotate,
  autoAnnotateCurrentFrame,

  preloadModel,
  unloadModel,

  setAIEnabled,
  setConfidenceThreshold,
  setMaxDetections,
  setModelType,

  getAnnotationImage,
  getAnnotationVideo,
  getMediaElement,

  canUseAI
};
