/* ============================================================
   ANNOTATION.JS
   Annotation canvas, drawing, editing, selection, history,
   frame persistence, labels, zoom and annotation UI.

   Works with:
     - 2D bounding boxes
     - polygons
     - segmentation
     - image/video media
     - classification
     - occlusion
     - truncation
     - undo / redo
     - annotation editing
     - frame-by-frame video annotation
   ============================================================ */

import {
  APP_CONFIG,
  WORK_ROLE,
  normalizeRole,
  annotationTypeForRole,
  roleForWorkType,
  canAnnotateRole,
} from "./config.js";

import {
  getCurrentUser,
  getCurrentProfile,
  getRole,
  isAdmin,
  isStaff,
  isReviewer,
  isCoworker,
} from "./auth.js";

import {
  getSupabase,
  getCurrentUser as getSupabaseUser,
} from "./supabase.js";

/* ============================================================
   DOM HELPERS
   ============================================================ */

const $ = (id) => document.getElementById(id);

const qs = (selector, root = document) => {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
};

const qsa = (selector, root = document) => {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
};

function showElement(el, show = true, display = "") {
  if (!el) return;

  el.hidden = !show;

  if (show) {
    el.style.display = display || "";
  } else {
    el.style.display = "none";
  }
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
}

function showToast(message, type = "info") {
  if (typeof window.showToast === "function") {
    window.showToast(message, type);
    return;
  }

  const container = $("toastContainer");

  if (!container) {
    console.log(`[${type}] ${message}`);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-hide");

    setTimeout(() => {
      toast.remove();
    }, 250);
  }, 3500);
}

/* ============================================================
   EVENTS
   ============================================================ */

function emit(name, detail = {}) {
  try {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail,
      })
    );
  } catch (error) {
    console.warn("Annotation event error:", error);
  }
}

/* ============================================================
   CONSTANTS
   ============================================================ */

export const MODELS = {
  detr: "Xenova/detr-resnet-50",
  yolo: "Xenova/yolov9-c",
  panoptic: "Xenova/detr-resnet-50-panoptic",
};

export const LABEL_ALIASES = {
  car: "car",
  automobile: "car",
  vehicle: "car",
  truck: "truck",
  bus: "bus",
  motorcycle: "motorcycle",
  motorbike: "motorcycle",
  bicycle: "bicycle",
  bike: "bicycle",
  person: "person",
  pedestrian: "person",
  human: "person",
  van: "van",
  pickup: "pickup",
  "pickup truck": "pickup",
  traffic_light: "traffic light",
  "traffic light": "traffic light",
  stop_sign: "stop sign",
  sign: "sign",
  road: "road",
  lane: "lane",
  building: "building",
  tree: "tree",
  pole: "pole",
  bus_stop: "bus stop",
};

/* ============================================================
   ANNOTATION STATE
   ============================================================ */

export const state = {
  canvas: null,
  ctx: null,

  mediaType: "image",

  image: null,
  video: null,

  mediaWidth: 0,
  mediaHeight: 0,

  zoom: 1,
  minZoom: 0.1,
  maxZoom: 8,

  offsetX: 0,
  offsetY: 0,

  fitScale: 1,

  mode: "select",
  annotationType: "box",

  annotations: [],
  selectedId: null,

  drawing: false,
  drawingAnnotation: null,

  polygonPoints: [],

  moving: false,
  resizing: false,

  resizeHandle: null,

  dragStart: null,
  originalAnnotation: null,

  pointer: {
    x: 0,
    y: 0,
    imageX: 0,
    imageY: 0,
  },

  history: [],
  historyIndex: -1,

  frameAnnotations: new Map(),
  currentFrame: 0,

  videoFrameRate: 30,

  initialized: false,
  canvasInitialized: false,

  currentTask: null,

  ai: {
    enabled: true,
    loading: false,
    model: null,
    pipeline: null,
  },

  colorMode: "normal",

  classification: "",
  occlusion: "none",
  truncation: "none",

  lastRenderTime: 0,

  popup: null,

  suppressHistory: false,

  dirty: false,
};

/* Make state available to legacy code if needed. */
window.annotationState = state;

/* ============================================================
   ID / VALUE HELPERS
   ============================================================ */

function makeId(prefix = "ann") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLabel(label) {
  const value = String(label || "").trim();

  if (!value) return "object";

  const lower = value.toLowerCase();

  return LABEL_ALIASES[lower] || value;
}

function normalizeAnnotationType(type) {
  const value = String(type || "").toLowerCase();

  if (
    value === "bbox" ||
    value === "bounding_box" ||
    value === "bounding-box" ||
    value === "rectangle"
  ) {
    return "box";
  }

  if (value === "poly" || value === "polygon") {
    return "polygon";
  }

  if (
    value === "segmentation" ||
    value === "segment" ||
    value === "mask"
  ) {
    return "segmentation";
  }

  return "box";
}

function normalizeMode(mode) {
  const value = String(mode || "").toLowerCase();

  if (value === "drawbox" || value === "draw-box") return "draw-box";
  if (value === "box") return "draw-box";

  if (value === "drawpolygon" || value === "draw-polygon") {
    return "draw-polygon";
  }

  if (value === "polygon") return "draw-polygon";

  if (value === "drawsegmentation" || value === "draw-segmentation") {
    return "draw-segmentation";
  }

  if (value === "segmentation") return "draw-segmentation";

  if (value === "move") return "move";
  if (value === "edit") return "edit";
  if (value === "delete") return "delete";

  return "select";
}

/* ============================================================
   ANNOTATION FACTORIES
   ============================================================ */

function baseAnnotation(type = "box") {
  return {
    id: makeId("annotation"),

    type: normalizeAnnotationType(type),

    label: normalizeLabel(state.classification || "object"),

    classification: state.classification || "",

    occlusion: state.occlusion || "none",

    truncation: state.truncation || "none",

    score: null,

    selected: false,

    visible: true,

    createdAt: new Date().toISOString(),

    updatedAt: new Date().toISOString(),
  };
}

export function createBoxAnnotation(
  x1,
  y1,
  x2,
  y2,
  options = {}
) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  const annotation = {
    ...baseAnnotation("box"),

    x: left,
    y: top,

    width: right - left,
    height: bottom - top,

    ...options,
  };

  annotation.type = "box";

  return annotation;
}

function createPolygonAnnotation(points, options = {}) {
  const normalizedPoints = Array.isArray(points)
    ? points
        .map((point) => ({
          x: normalizeNumber(point.x),
          y: normalizeNumber(point.y),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y)
        )
    : [];

  return {
    ...baseAnnotation("polygon"),

    points: normalizedPoints,

    ...options,

    type: "polygon",
  };
}

function createSegmentationAnnotation(points, options = {}) {
  return {
    ...baseAnnotation("segmentation"),

    points: Array.isArray(points)
      ? points.map((point) => ({
          x: normalizeNumber(point.x),
          y: normalizeNumber(point.y),
        }))
      : [],

    ...options,

    type: "segmentation",
  };
}

function cloneAnnotation(annotation) {
  try {
    return structuredClone(annotation);
  } catch {
    return JSON.parse(JSON.stringify(annotation));
  }
}

function cloneAnnotations(annotations = state.annotations) {
  return annotations.map(cloneAnnotation);
}

/* ============================================================
   CANVAS / COORDINATE SYSTEM
   ============================================================ */

function getCanvasRect() {
  if (!state.canvas) return null;
  return state.canvas.getBoundingClientRect();
}

function imageToCanvas(x, y) {
  return {
    x: state.offsetX + x * state.zoom,
    y: state.offsetY + y * state.zoom,
  };
}

function canvasToImage(x, y) {
  return {
    x: (x - state.offsetX) / state.zoom,
    y: (y - state.offsetY) / state.zoom,
  };
}

function pointerToCanvas(event) {
  const rect = getCanvasRect();

  if (!rect) {
    return {
      x: 0,
      y: 0,
    };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function pointerToImage(event) {
  const canvasPoint = pointerToCanvas(event);
  return canvasToImage(canvasPoint.x, canvasPoint.y);
}

function clampImagePoint(point) {
  return {
    x: clamp(
      point.x,
      0,
      Math.max(0, state.mediaWidth)
    ),

    y: clamp(
      point.y,
      0,
      Math.max(0, state.mediaHeight)
    ),
  };
}

/* ============================================================
   CANVAS RESIZE
   ============================================================ */

export function resizeCanvas() {
  const canvas = state.canvas;

  if (!canvas) return;

  const container =
    $("annotationCanvasContainer") ||
    canvas.parentElement;

  if (!container) return;

  const rect = container.getBoundingClientRect();

  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(240, Math.floor(rect.height));

  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  state.ctx = canvas.getContext("2d");

  if (state.ctx) {
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  if (
    state.mediaWidth > 0 &&
    state.mediaHeight > 0
  ) {
    fitView(false);
  }

  render();
}

export function fitView(recordHistory = false) {
  if (!state.canvas) return;

  if (
    !state.mediaWidth ||
    !state.mediaHeight
  ) {
    state.zoom = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    updateZoomUI();
    return;
  }

  const width =
    state.canvas.clientWidth ||
    state.canvas.width;

  const height =
    state.canvas.clientHeight ||
    state.canvas.height;

  const padding = 20;

  const scaleX =
    (width - padding * 2) /
    state.mediaWidth;

  const scaleY =
    (height - padding * 2) /
    state.mediaHeight;

  const scale = Math.min(scaleX, scaleY);

  state.fitScale = Math.max(0.01, scale);

  state.zoom = clamp(
    state.fitScale,
    state.minZoom,
    state.maxZoom
  );

  state.offsetX =
    (width - state.mediaWidth * state.zoom) / 2;

  state.offsetY =
    (height - state.mediaHeight * state.zoom) / 2;

  updateZoomUI();

  if (recordHistory) {
    pushHistory();
  }

  render();
}

export function setZoom(
  value,
  centerX = null,
  centerY = null
) {
  if (!state.canvas) return;

  const oldZoom = state.zoom;

  const newZoom = clamp(
    normalizeNumber(value, oldZoom),
    state.minZoom,
    state.maxZoom
  );

  if (Math.abs(newZoom - oldZoom) < 0.0001) {
    updateZoomUI();
    return;
  }

  const width = state.canvas.clientWidth;
  const height = state.canvas.clientHeight;

  const cx =
    centerX == null
      ? width / 2
      : centerX;

  const cy =
    centerY == null
      ? height / 2
      : centerY;

  const imagePoint = canvasToImage(cx, cy);

  state.zoom = newZoom;

  state.offsetX =
    cx - imagePoint.x * newZoom;

  state.offsetY =
    cy - imagePoint.y * newZoom;

  updateZoomUI();
  render();
}

export function zoomIn() {
  setZoom(state.zoom * 1.2);
}

export function zoomOut() {
  setZoom(state.zoom / 1.2);
}

export function resetZoom() {
  fitView(false);
}

export function updateZoomUI() {
  const label = $("zoomLabel");

  if (label) {
    setText(
      label,
      `${Math.round(state.zoom * 100)}%`
    );
  }

  const zoomOutButton = $("zoomOutButton");
  const zoomInButton = $("zoomInButton");

  if (zoomOutButton) {
    zoomOutButton.disabled =
      state.zoom <= state.minZoom;
  }

  if (zoomInButton) {
    zoomInButton.disabled =
      state.zoom >= state.maxZoom;
  }
}

/* ============================================================
   MEDIA
   ============================================================ */

function updateMediaDimensions() {
  if (
    state.mediaType === "video" &&
    state.video
  ) {
    state.mediaWidth =
      state.video.videoWidth || 0;

    state.mediaHeight =
      state.video.videoHeight || 0;

    return;
  }

  if (state.image) {
    state.mediaWidth =
      state.image.naturalWidth ||
      state.image.width ||
      0;

    state.mediaHeight =
      state.image.naturalHeight ||
      state.image.height ||
      0;
  }
}

function drawMedia() {
  const ctx = state.ctx;

  if (!ctx) return;

  if (
    !state.mediaWidth ||
    !state.mediaHeight
  ) {
    return;
  }

  const destination = imageToCanvas(0, 0);

  const width =
    state.mediaWidth * state.zoom;

  const height =
    state.mediaHeight * state.zoom;

  try {
    if (
      state.mediaType === "video" &&
      state.video
    ) {
      ctx.drawImage(
        state.video,
        destination.x,
        destination.y,
        width,
        height
      );

      return;
    }

    if (state.image) {
      ctx.drawImage(
        state.image,
        destination.x,
        destination.y,
        width,
        height
      );
    }
  } catch (error) {
    console.warn(
      "Unable to draw media:",
      error
    );
  }
}

function clearCanvas() {
  if (!state.ctx || !state.canvas) return;

  state.ctx.clearRect(
    0,
    0,
    state.canvas.clientWidth ||
      state.canvas.width,
    state.canvas.clientHeight ||
      state.canvas.height
  );
}

/* ============================================================
   RENDERING
   ============================================================ */

function annotationBounds(annotation) {
  if (!annotation) return null;

  if (annotation.type === "box") {
    return {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    };
  }

  const points =
    annotation.points || [];

  if (!points.length) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function annotationCenter(annotation) {
  const bounds =
    annotationBounds(annotation);

  if (!bounds) {
    return {
      x: 0,
      y: 0,
    };
  }

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function getAnnotationStroke(annotation) {
  if (state.colorMode === "occlusion") {
    const value =
      annotation.occlusion ||
      "none";

    if (value === "heavy") {
      return "#e74c3c";
    }

    if (value === "partial") {
      return "#f39c12";
    }

    return "#2ecc71";
  }

  if (state.colorMode === "truncation") {
    const value =
      annotation.truncation ||
      "none";

    if (value === "heavy") {
      return "#e74c3c";
    }

    if (value === "partial") {
      return "#f39c12";
    }

    return "#2ecc71";
  }

  if (annotation.selected) {
    return "#00e5ff";
  }

  return "#ffcc00";
}

function drawBox(annotation) {
  const ctx = state.ctx;

  const topLeft =
    imageToCanvas(
      annotation.x,
      annotation.y
    );

  const width =
    annotation.width *
    state.zoom;

  const height =
    annotation.height *
    state.zoom;

  ctx.save();

  ctx.strokeStyle =
    getAnnotationStroke(annotation);

  ctx.lineWidth =
    annotation.selected
      ? 3
      : 2;

  ctx.setLineDash(
    annotation.selected
      ? []
      : [6, 4]
  );

  ctx.strokeRect(
    topLeft.x,
    topLeft.y,
    width,
    height
  );

  if (annotation.selected) {
    ctx.fillStyle =
      "rgba(0,229,255,0.10)";

    ctx.fillRect(
      topLeft.x,
      topLeft.y,
      width,
      height
    );
  }

  ctx.restore();

  drawLabel(
    annotation,
    topLeft.x,
    topLeft.y
  );

  if (annotation.selected) {
    drawResizeHandles(annotation);
  }
}

function drawPolygon(annotation) {
  const ctx = state.ctx;

  const points =
    annotation.points || [];

  if (points.length < 2) return;

  ctx.save();

  ctx.beginPath();

  points.forEach((point, index) => {
    const p =
      imageToCanvas(
        point.x,
        point.y
      );

    if (index === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  });

  ctx.closePath();

  ctx.strokeStyle =
    getAnnotationStroke(annotation);

  ctx.lineWidth =
    annotation.selected
      ? 3
      : 2;

  ctx.fillStyle =
    annotation.selected
      ? "rgba(0,229,255,0.14)"
      : "rgba(255,204,0,0.10)";

  ctx.fill();
  ctx.stroke();

  ctx.restore();

  const first =
    imageToCanvas(
      points[0].x,
      points[0].y
    );

  drawLabel(
    annotation,
    first.x,
    first.y
  );

  if (annotation.selected) {
    points.forEach((point) => {
      const p =
        imageToCanvas(
          point.x,
          point.y
        );

      drawPointHandle(
        p.x,
        p.y
      );
    });
  }
}

function drawSegmentation(annotation) {
  drawPolygon(annotation);
}

function drawResizeHandles(annotation) {
  const bounds =
    annotationBounds(annotation);

  if (!bounds) return;

  const corners = [
    [bounds.x, bounds.y],
    [
      bounds.x + bounds.width,
      bounds.y,
    ],
    [
      bounds.x + bounds.width,
      bounds.y + bounds.height,
    ],
    [
      bounds.x,
      bounds.y + bounds.height,
    ],
  ];

  corners.forEach(([x, y]) => {
    const p =
      imageToCanvas(x, y);

    drawPointHandle(
      p.x,
      p.y,
      5
    );
  });
}

function drawPointHandle(
  x,
  y,
  size = 4
) {
  const ctx = state.ctx;

  if (!ctx) return;

  ctx.save();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.rect(
    x - size,
    y - size,
    size * 2,
    size * 2
  );

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawLabel(
  annotation,
  canvasX,
  canvasY
) {
  const ctx = state.ctx;

  if (!ctx) return;

  const label =
    annotation.label ||
    annotation.classification ||
    "object";

  const score =
    annotation.score != null
      ? ` ${Math.round(
          Number(annotation.score) * 100
        )}%`
      : "";

  const text =
    `${label}${score}`;

  ctx.save();

  ctx.font =
    "600 12px Arial, sans-serif";

  const metrics =
    ctx.measureText(text);

  const padding = 5;

  const boxWidth =
    metrics.width +
    padding * 2;

  const boxHeight = 20;

  const x =
    Math.max(
      0,
      canvasX
    );

  const y =
    Math.max(
      boxHeight,
      canvasY
    );

  ctx.fillStyle =
    "rgba(0,0,0,0.80)";

  ctx.fillRect(
    x,
    y - boxHeight,
    boxWidth,
    boxHeight
  );

  ctx.fillStyle =
    "#ffffff";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    text,
    x + padding,
    y - boxHeight / 2
  );

  ctx.restore();
}

export function render() {
  const ctx = state.ctx;

  if (!ctx || !state.canvas) return;

  clearCanvas();

  drawMedia();

  state.annotations.forEach(
    (annotation) => {
      if (
        annotation.visible === false
      ) {
        return;
      }

      if (
        annotation.type === "box"
      ) {
        drawBox(annotation);
      } else if (
        annotation.type === "polygon"
      ) {
        drawPolygon(annotation);
      } else if (
        annotation.type === "segmentation"
      ) {
        drawSegmentation(annotation);
      }
    }
  );

  if (
    state.drawing &&
    state.drawingAnnotation
  ) {
    drawTemporaryAnnotation(
      state.drawingAnnotation
    );
  }

  if (
    state.polygonPoints.length
  ) {
    drawTemporaryPolygon();
  }

  state.lastRenderTime =
    performance.now();
}

/* ============================================================
   TEMPORARY DRAWING
   ============================================================ */

function drawTemporaryAnnotation(
  annotation
) {
  if (!annotation) return;

  if (annotation.type === "box") {
    drawBox({
      ...annotation,
      selected: true,
      label:
        state.classification ||
        "object",
    });
  }
}

function drawTemporaryPolygon() {
  const ctx = state.ctx;

  if (!ctx) return;

  const points =
    state.polygonPoints;

  if (!points.length) return;

  ctx.save();

  ctx.strokeStyle =
    "#00e5ff";

  ctx.lineWidth = 2;

  ctx.setLineDash([6, 4]);

  ctx.beginPath();

  points.forEach(
    (point, index) => {
      const p =
        imageToCanvas(
          point.x,
          point.y
        );

      if (index === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
  );

  ctx.stroke();

  ctx.setLineDash([]);

  points.forEach((point) => {
    const p =
      imageToCanvas(
        point.x,
        point.y
      );

    drawPointHandle(
      p.x,
      p.y,
      4
    );
  });

  ctx.restore();
}

/* ============================================================
   SELECTION / HIT TESTING
   ============================================================ */

function pointInBox(
  x,
  y,
  annotation
) {
  return (
    x >= annotation.x &&
    x <=
      annotation.x +
        annotation.width &&
    y >= annotation.y &&
    y <=
      annotation.y +
        annotation.height
  );
}

function pointInPolygon(
  x,
  y,
  points
) {
  let inside = false;

  if (!points || points.length < 3) {
    return false;
  }

  for (
    let i = 0, j = points.length - 1;
    i < points.length;
    j = i++
  ) {
    const xi = points[i].x;
    const yi = points[i].y;

    const xj = points[j].x;
    const yj = points[j].y;

    const intersect =
      yi > y !== yj > y &&
      x <
        ((xj - xi) *
          (y - yi)) /
          ((yj - yi) || 0.000001) +
          xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToSegment(
  px,
  py,
  x1,
  y1,
  x2,
  y2
) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(
      px - x1,
      py - y1
    );
  }

  const t =
    clamp(
      ((px - x1) * dx +
        (py - y1) * dy) /
        (dx * dx + dy * dy),
      0,
      1
    );

  const x =
    x1 + t * dx;

  const y =
    y1 + t * dy;

  return Math.hypot(
    px - x,
    py - y
  );
}

function pointNearPolygon(
  x,
  y,
  points,
  tolerance = 8
) {
  if (!points?.length) {
    return false;
  }

  for (
    let i = 0;
    i < points.length;
    i++
  ) {
    const a = points[i];
    const b =
      points[
        (i + 1) % points.length
      ];

    if (
      distanceToSegment(
        x,
        y,
        a.x,
        a.y,
        b.x,
        b.y
      ) <= tolerance
    ) {
      return true;
    }
  }

  return false;
}

export function findAnnotationAtPoint(
  x,
  y
) {
  for (
    let i = state.annotations.length - 1;
    i >= 0;
    i--
  ) {
    const annotation =
      state.annotations[i];

    if (
      annotation.visible === false
    ) {
      continue;
    }

    if (
      annotation.type === "box" &&
      pointInBox(x, y, annotation)
    ) {
      return annotation;
    }

    if (
      (
        annotation.type ===
          "polygon" ||
        annotation.type ===
          "segmentation"
      ) &&
      (
        pointInPolygon(
          x,
          y,
          annotation.points
        ) ||
        pointNearPolygon(
          x,
          y,
          annotation.points,
          10 / state.zoom
        )
      )
    ) {
      return annotation;
    }
  }

  return null;
}

function findResizeHandle(
  annotation,
  x,
  y
) {
  if (!annotation) return null;

  const bounds =
    annotationBounds(annotation);

  if (!bounds) return null;

  const tolerance =
    10 / state.zoom;

  const handles = [
    {
      name: "nw",
      x: bounds.x,
      y: bounds.y,
    },
    {
      name: "ne",
      x:
        bounds.x +
        bounds.width,
      y: bounds.y,
    },
    {
      name: "se",
      x:
        bounds.x +
        bounds.width,
      y:
        bounds.y +
        bounds.height,
    },
    {
      name: "sw",
      x: bounds.x,
      y:
        bounds.y +
        bounds.height,
    },
  ];

  for (const handle of handles) {
    if (
      Math.hypot(
        x - handle.x,
        y - handle.y
      ) <= tolerance
    ) {
      return handle.name;
    }
  }

  return null;
}

/* ============================================================
   SELECT
   ============================================================ */

function clearSelection() {
  state.annotations.forEach(
    (annotation) => {
      annotation.selected = false;
    }
  );

  state.selectedId = null;

  updateAnnotationsList();
  updateSelectedLabel();
  render();
}

function selectAnnotation(
  annotation
) {
  state.annotations.forEach(
    (item) => {
      item.selected =
        item.id === annotation?.id;
    }
  );

  state.selectedId =
    annotation?.id || null;

  updateAnnotationsList();
  updateSelectedLabel();
  render();

  if (annotation) {
    showAnnotationPopup(
      annotation
    );
  } else {
    hidePopup();
  }

  emit(
    "annotationSelected",
    {
      annotation,
    }
  );
}

/* ============================================================
   DRAWING MODES
   ============================================================ */

export function setMode(mode) {
  const normalized =
    normalizeMode(mode);

  state.mode = normalized;

  const activeToolLabel =
    $("activeToolLabel");

  const labels = {
    select: "Select",
    "draw-box": "Draw box",
    "draw-polygon":
      "Draw polygon",
    "draw-segmentation":
      "Draw segmentation",
    move: "Move",
    edit: "Edit",
    delete: "Delete",
  };

  setText(
    activeToolLabel,
    labels[normalized] ||
      "Select"
  );

  qsa(
    "#editToolsPanel button"
  ).forEach((button) => {
    button.classList.remove(
      "active"
    );
  });

  const toolMap = {
    select: "selectTool",
    "draw-box": "drawBoxTool",
    "draw-polygon":
      "drawPolygonTool",
    "draw-segmentation":
      "drawSegmentationTool",
    move: "moveTool",
    edit: "editTool",
  };

  const activeButton =
    $(toolMap[normalized]);

  if (activeButton) {
    activeButton.classList.add(
      "active"
    );
  }

  if (
    normalized !==
    "draw-polygon"
  ) {
    state.polygonPoints = [];
  }

  render();

  emit(
    "annotationModeChanged",
    {
      mode: normalized,
    }
  );
}

export function setAnnotationType(
  type
) {
  const normalized =
    normalizeAnnotationType(
      type
    );

  state.annotationType =
    normalized;

  const selector =
    $("annotationType");

  if (selector) {
    const matching =
      [...selector.options].find(
        (option) =>
          normalizeAnnotationType(
            option.value
          ) === normalized
      );

    if (matching) {
      selector.value =
        matching.value;
    }
  }

  if (normalized === "box") {
    setMode("draw-box");
  } else if (
    normalized === "polygon"
  ) {
    setMode("draw-polygon");
  } else if (
    normalized === "segmentation"
  ) {
    setMode(
      "draw-segmentation"
    );
  }

  emit(
    "annotationTypeChanged",
    {
      annotationType:
        normalized,
    }
  );
}

/* ============================================================
   CREATE BOX
   ============================================================ */

function startBoxDrawing(point) {
  state.drawing = true;

  state.drawingAnnotation =
    createBoxAnnotation(
      point.x,
      point.y,
      point.x,
      point.y,
      {
        selected: true,
      }
    );

  render();
}

function updateBoxDrawing(point) {
  if (
    !state.drawing ||
    !state.drawingAnnotation
  ) {
    return;
  }

  const start =
    state.drawingAnnotation;

  const x1 = start.x;
  const y1 = start.y;

  state.drawingAnnotation =
    createBoxAnnotation(
      x1,
      y1,
      point.x,
      point.y,
      {
        ...start,
        selected: true,
      }
    );

  render();
}

function finishBoxDrawing() {
  if (
    !state.drawing ||
    !state.drawingAnnotation
  ) {
    return;
  }

  const annotation =
    state.drawingAnnotation;

  state.drawing = false;
  state.drawingAnnotation =
    null;

  const minimumSize =
    2 / Math.max(state.zoom, 0.01);

  if (
    annotation.width <
      minimumSize ||
    annotation.height <
      minimumSize
  ) {
    render();
    return;
  }

  annotation.id =
    makeId("annotation");

  annotation.selected = false;

  state.annotations.push(
    annotation
  );

  selectAnnotation(
    annotation
  );

  pushHistory();

  markDirty();

  updateCounts();
  updateAnnotationsList();

  emit(
    "annotationCreated",
    {
      annotation,
    }
  );

  render();
}

/* ============================================================
   POLYGON
   ============================================================ */

function addPolygonPoint(point) {
  state.polygonPoints.push({
    x: point.x,
    y: point.y,
  });

  render();
}

export function finishPolygon() {
  if (
    state.polygonPoints.length <
    3
  ) {
    return null;
  }

  const points =
    state.polygonPoints.map(
      (point) => ({
        x: point.x,
        y: point.y,
      })
    );

  let annotation;

  if (
    state.annotationType ===
    "segmentation"
  ) {
    annotation =
      createSegmentationAnnotation(
        points
      );
  } else {
    annotation =
      createPolygonAnnotation(
        points
      );
  }

  state.annotations.push(
    annotation
  );

  state.polygonPoints = [];

  selectAnnotation(
    annotation
  );

  pushHistory();

  markDirty();

  updateCounts();
  updateAnnotationsList();

  emit(
    "annotationCreated",
    {
      annotation,
    }
  );

  render();

  return annotation;
}

/* ============================================================
   MOVING
   ============================================================ */

export function moveSelectedAnnotation(
  dx,
  dy
) {
  const annotation =
    getSelectedAnnotation();

  if (!annotation) return;

  if (annotation.type === "box") {
    annotation.x += dx;
    annotation.y += dy;

    annotation.x = clamp(
      annotation.x,
      0,
      Math.max(
        0,
        state.mediaWidth -
          annotation.width
      )
    );

    annotation.y = clamp(
      annotation.y,
      0,
      Math.max(
        0,
        state.mediaHeight -
          annotation.height
      )
    );
  } else {
    annotation.points =
      annotation.points.map(
        (point) => ({
          x: clamp(
            point.x + dx,
            0,
            state.mediaWidth
          ),

          y: clamp(
            point.y + dy,
            0,
            state.mediaHeight
          ),
        })
      );
  }

  annotation.updatedAt =
    new Date().toISOString();

  markDirty();
  render();

  emit(
    "annotationChanged",
    {
      annotation,
    }
  );
}

/* ============================================================
   RESIZE
   ============================================================ */

export function resizeSelectedAnnotation(
  handle,
  x,
  y
) {
  const annotation =
    getSelectedAnnotation();

  if (!annotation) return;

  if (
    annotation.type !== "box"
  ) {
    return;
  }

  let left =
    annotation.x;

  let top =
    annotation.y;

  let right =
    annotation.x +
    annotation.width;

  let bottom =
    annotation.y +
    annotation.height;

  if (handle.includes("w")) {
    left = x;
  }

  if (handle.includes("e")) {
    right = x;
  }

  if (handle.includes("n")) {
    top = y;
  }

  if (handle.includes("s")) {
    bottom = y;
  }

  const minSize =
    1 / Math.max(state.zoom, 0.01);

  if (
    right - left <
    minSize
  ) {
    if (handle.includes("w")) {
      left =
        right - minSize;
    } else {
      right =
        left + minSize;
    }
  }

  if (
    bottom - top <
    minSize
  ) {
    if (handle.includes("n")) {
      top =
        bottom - minSize;
    } else {
      bottom =
        top + minSize;
    }
  }

  left = clamp(
    left,
    0,
    state.mediaWidth
  );

  top = clamp(
    top,
    0,
    state.mediaHeight
  );

  right = clamp(
    right,
    0,
    state.mediaWidth
  );

  bottom = clamp(
    bottom,
    0,
    state.mediaHeight
  );

  annotation.x =
    Math.min(left, right);

  annotation.y =
    Math.min(top, bottom);

  annotation.width =
    Math.abs(right - left);

  annotation.height =
    Math.abs(bottom - top);

  annotation.updatedAt =
    new Date().toISOString();

  markDirty();

  render();

  emit(
    "annotationChanged",
    {
      annotation,
    }
  );
}

/* ============================================================
   DELETE
   ============================================================ */

export function deleteSelectedAnnotation() {
  const selected =
    getSelectedAnnotation();

  if (!selected) {
    return false;
  }

  const index =
    state.annotations.findIndex(
      (annotation) =>
        annotation.id ===
        selected.id
    );

  if (index < 0) {
    return false;
  }

  state.annotations.splice(
    index,
    1
  );

  state.selectedId = null;

  pushHistory();

  markDirty();

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();

  hidePopup();

  emit(
    "annotationDeleted",
    {
      annotation: selected,
    }
  );

  render();

  return true;
}

/* ============================================================
   SELECTED ANNOTATION
   ============================================================ */

function getSelectedAnnotation() {
  if (!state.selectedId) {
    return null;
  }

  return (
    state.annotations.find(
      (annotation) =>
        annotation.id ===
        state.selectedId
    ) || null
  );
}

/* ============================================================
   POINTER EVENTS
   ============================================================ */

function onPointerDown(event) {
  if (
    !state.canvas ||
    event.button !== 0
  ) {
    return;
  }

  const point =
    clampImagePoint(
      pointerToImage(event)
    );

  state.pointer =
    {
      ...state.pointer,
      ...point,
      x: point.x,
      y: point.y,
    };

  if (
    state.mode ===
    "draw-box"
  ) {
    startBoxDrawing(point);

    state.canvas.setPointerCapture?.(
      event.pointerId
    );

    return;
  }

  if (
    state.mode ===
      "draw-polygon" ||
    state.mode ===
      "draw-segmentation"
  ) {
    addPolygonPoint(point);

    state.canvas.setPointerCapture?.(
      event.pointerId
    );

    return;
  }

  const selected =
    getSelectedAnnotation();

  if (
    (
      state.mode ===
        "move" ||
      state.mode ===
        "edit"
    ) &&
    selected
  ) {
    const handle =
      findResizeHandle(
        selected,
        point.x,
        point.y
      );

    state.dragStart = {
      x: point.x,
      y: point.y,
    };

    state.originalAnnotation =
      cloneAnnotation(
        selected
      );

    if (handle) {
      state.resizing = true;
      state.resizeHandle =
        handle;
    } else if (
      findAnnotationAtPoint(
        point.x,
        point.y
      )?.id ===
      selected.id
    ) {
      state.moving = true;
    }

    state.canvas.setPointerCapture?.(
      event.pointerId
    );

    return;
  }

  if (
    state.mode ===
    "delete"
  ) {
    const target =
      findAnnotationAtPoint(
        point.x,
        point.y
      );

    if (target) {
      selectAnnotation(
        target
      );

      deleteSelectedAnnotation();
    }

    return;
  }

  const annotation =
    findAnnotationAtPoint(
      point.x,
      point.y
    );

  if (annotation) {
    selectAnnotation(
      annotation
    );

    const handle =
      findResizeHandle(
        annotation,
        point.x,
        point.y
      );

    if (handle) {
      state.resizing = true;
      state.resizeHandle =
        handle;

      state.dragStart = {
        x: point.x,
        y: point.y,
      };

      state.originalAnnotation =
        cloneAnnotation(
          annotation
        );
    }

    state.canvas.setPointerCapture?.(
      event.pointerId
    );

    return;
  }

  clearSelection();
}

function onPointerMove(event) {
  if (!state.canvas) return;

  const point =
    clampImagePoint(
      pointerToImage(event)
    );

  state.pointer =
    {
      ...state.pointer,
      ...point,
      x: point.x,
      y: point.y,
    };

  if (
    state.drawing &&
    state.drawingAnnotation
  ) {
    updateBoxDrawing(point);
    return;
  }

  if (
    state.resizing &&
    state.resizeHandle
  ) {
    resizeSelectedAnnotation(
      state.resizeHandle,
      point.x,
      point.y
    );

    return;
  }

  if (
    state.moving &&
    state.dragStart
  ) {
    const dx =
      point.x -
      state.dragStart.x;

    const dy =
      point.y -
      state.dragStart.y;

    moveSelectedAnnotation(
      dx,
      dy
    );

    state.dragStart = {
      x: point.x,
      y: point.y,
    };
  }
}

function onPointerUp(event) {
  if (!state.canvas) return;

  if (
    state.drawing
  ) {
    finishBoxDrawing();
  }

  if (
    state.moving ||
    state.resizing
  ) {
    state.moving = false;
    state.resizing = false;
    state.resizeHandle = null;

    state.dragStart = null;
    state.originalAnnotation = null;

    pushHistory();

    markDirty();

    updateCounts();
    updateAnnotationsList();

    emit(
      "annotationEditFinished",
      {}
    );
  }

  try {
    state.canvas.releasePointerCapture?.(
      event.pointerId
    );
  } catch {
    // Ignore pointer capture errors.
  }
}

function onDoubleClick(event) {
  if (
    state.mode !==
      "draw-polygon" &&
    state.mode !==
      "draw-segmentation"
  ) {
    return;
  }

  event.preventDefault();

  finishPolygon();
}

/* ============================================================
   KEYBOARD
   ============================================================ */

function onKeyDown(event) {
  const target =
    event.target;

  const tag =
    target?.tagName?.toLowerCase();

  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  ) {
    return;
  }

  if (
    event.key === "Delete" ||
    event.key === "Backspace"
  ) {
    if (
      getSelectedAnnotation()
    ) {
      event.preventDefault();
      deleteSelectedAnnotation();
    }

    return;
  }

  if (
    event.key === "Escape"
  ) {
    state.drawing = false;
    state.drawingAnnotation =
      null;

    state.polygonPoints = [];

    state.moving = false;
    state.resizing = false;

    render();

    return;
  }

  if (
    event.ctrlKey ||
    event.metaKey
  ) {
    if (
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

    if (
      event.key.toLowerCase() ===
      "y"
    ) {
      event.preventDefault();
      redo();
      return;
    }
  }

  const selected =
    getSelectedAnnotation();

  if (!selected) {
    return;
  }

  const step =
    event.shiftKey
      ? 10 / Math.max(state.zoom, 0.01)
      : 1 / Math.max(state.zoom, 0.01);

  let dx = 0;
  let dy = 0;

  if (event.key === "ArrowLeft") {
    dx = -step;
  }

  if (event.key === "ArrowRight") {
    dx = step;
  }

  if (event.key === "ArrowUp") {
    dy = -step;
  }

  if (event.key === "ArrowDown") {
    dy = step;
  }

  if (dx || dy) {
    event.preventDefault();

    moveSelectedAnnotation(
      dx,
      dy
    );

    pushHistory();
  }
}

/* ============================================================
   HISTORY
   ============================================================ */

function snapshot() {
  return {
    annotations:
      cloneAnnotations(),
    selectedId:
      state.selectedId,
  };
}

export function pushHistory() {
  if (
    state.suppressHistory
  ) {
    return;
  }

  const current =
    snapshot();

  const serialized =
    JSON.stringify(current);

  const last =
    state.history[
      state.historyIndex
    ];

  if (
    last &&
    JSON.stringify(last) ===
      serialized
  ) {
    return;
  }

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
    current
  );

  const maxHistory = 100;

  if (
    state.history.length >
    maxHistory
  ) {
    state.history.shift();
  }

  state.historyIndex =
    state.history.length - 1;

  updateHistoryButtons();
}

function restoreSnapshot(
  snapshotData
) {
  if (!snapshotData) return;

  state.suppressHistory =
    true;

  state.annotations =
    cloneAnnotations(
      snapshotData.annotations ||
        []
    );

  state.selectedId =
    snapshotData.selectedId ||
    null;

  state.annotations.forEach(
    (annotation) => {
      annotation.selected =
        annotation.id ===
        state.selectedId;
    }
  );

  state.suppressHistory =
    false;

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();

  markDirty(false);

  render();
}

export function undo() {
  if (
    state.historyIndex <= 0
  ) {
    return false;
  }

  state.historyIndex--;

  restoreSnapshot(
    state.history[
      state.historyIndex
    ]
  );

  updateHistoryButtons();

  emit(
    "annotationsUndo",
    {}
  );

  return true;
}

export function redo() {
  if (
    state.historyIndex >=
    state.history.length - 1
  ) {
    return false;
  }

  state.historyIndex++;

  restoreSnapshot(
    state.history[
      state.historyIndex
    ]
  );

  updateHistoryButtons();

  emit(
    "annotationsRedo",
    {}
  );

  return true;
}

export function resetHistory() {
  state.history = [];
  state.historyIndex = -1;

  pushHistory();

  updateHistoryButtons();
}

function updateHistoryButtons() {
  const undoButton =
    $("undoBtn");

  const redoButton =
    $("redoBtn");

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

/* ============================================================
   FRAME ANNOTATIONS
   ============================================================ */

function frameKey(frame) {
  return Math.max(
    0,
    Math.floor(
      normalizeNumber(
        frame,
        0
      )
    )
  );
}

export function saveFrame(
  frame = state.currentFrame
) {
  const key =
    frameKey(frame);

  state.frameAnnotations.set(
    key,
    cloneAnnotations()
  );

  emit(
    "frameAnnotationsSaved",
    {
      frame: key,
      annotations:
        cloneAnnotations(),
    }
  );
}

export function loadFrame(
  frame = state.currentFrame
) {
  const key =
    frameKey(frame);

  saveFrame(
    state.currentFrame
  );

  const saved =
    state.frameAnnotations.get(
      key
    );

  state.currentFrame = key;

  state.annotations =
    saved
      ? cloneAnnotations(saved)
      : [];

  state.selectedId = null;

  state.annotations.forEach(
    (annotation) => {
      annotation.selected = false;
    }
  );

  resetHistory();

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();

  render();

  emit(
    "frameAnnotationsLoaded",
    {
      frame: key,
      annotations:
        cloneAnnotations(),
    }
  );

  return state.annotations;
}

export function clearFrameAnnotations(
  frame = state.currentFrame
) {
  const key =
    frameKey(frame);

  state.frameAnnotations.delete(
    key
  );

  if (
    key ===
    state.currentFrame
  ) {
    state.annotations = [];
    state.selectedId = null;

    resetHistory();

    updateCounts();
    updateAnnotationsList();
    updateSelectedLabel();

    render();
  }

  markDirty();

  emit(
    "frameAnnotationsCleared",
    {
      frame: key,
    }
  );
}

function serializeFrameAnnotations() {
  const result = {};

  for (
    const [
      frame,
      annotations,
    ] of state.frameAnnotations.entries()
  ) {
    result[frame] =
      cloneAnnotations(
        annotations
      );
  }

  if (
    state.mediaType === "video"
  ) {
    result[
      state.currentFrame
    ] = cloneAnnotations();
  }

  return result;
}

/* ============================================================
   LABEL / CLASSIFICATION
   ============================================================ */

export function updateSelectedLabel(
  value = null
) {
  const annotation =
    getSelectedAnnotation();

  const labelInput =
    $("annotationLabel");

  const classificationInput =
    $("annotationClassification");

  const occlusionInput =
    $("annotationOcclusion");

  const truncationInput =
    $("annotationTruncation");

  const scoreInput =
    $("annotationScore");

  if (!annotation) {
    if (labelInput) {
      labelInput.value = "";
    }

    if (classificationInput) {
      classificationInput.value =
        "";
    }

    if (occlusionInput) {
      occlusionInput.value =
        "none";
    }

    if (truncationInput) {
      truncationInput.value =
        "none";
    }

    if (scoreInput) {
      scoreInput.value = "";
    }

    return;
  }

  if (value !== null) {
    const label =
      normalizeLabel(value);

    annotation.label = label;
    annotation.classification =
      label;

    state.classification = label;
  }

  if (labelInput) {
    labelInput.value =
      annotation.label || "";
  }

  if (classificationInput) {
    classificationInput.value =
      annotation.classification ||
      annotation.label ||
      "";
  }

  if (occlusionInput) {
    occlusionInput.value =
      annotation.occlusion ||
      "none";
  }

  if (truncationInput) {
    truncationInput.value =
      annotation.truncation ||
      "none";
  }

  if (scoreInput) {
    scoreInput.value =
      annotation.score ?? "";
  }

  render();

  emit(
    "annotationLabelUpdated",
    {
      annotation,
    }
  );
}

function bindAnnotationMetadataInputs() {
  const labelInput =
    $("annotationLabel");

  const classificationInput =
    $("annotationClassification");

  const occlusionInput =
    $("annotationOcclusion");

  const truncationInput =
    $("annotationTruncation");

  const scoreInput =
    $("annotationScore");

  labelInput?.addEventListener(
    "input",
    () => {
      const annotation =
        getSelectedAnnotation();

      if (!annotation) return;

      const value =
        labelInput.value.trim();

      annotation.label =
        value ||
        "object";

      annotation.classification =
        value;

      state.classification =
        value;

      annotation.updatedAt =
        new Date().toISOString();

      markDirty();

      render();
      updateAnnotationsList();

      emit(
        "annotationChanged",
        {
          annotation,
        },
      );
    }
  );

  classificationInput?.addEventListener(
    "change",
    () => {
      const annotation =
        getSelectedAnnotation();

      if (!annotation) return;

      const value =
        classificationInput.value.trim();

      annotation.classification =
        value;

      if (value) {
        annotation.label =
          normalizeLabel(value);
      }

      state.classification =
        value;

      markDirty();

      render();
      updateAnnotationsList();
    }
  );

  occlusionInput?.addEventListener(
    "change",
    () => {
      const annotation =
        getSelectedAnnotation();

      const value =
        occlusionInput.value ||
        "none";

      state.occlusion = value;

      if (!annotation) return;

      annotation.occlusion =
        value;

      annotation.updatedAt =
        new Date().toISOString();

      markDirty();

      setColorMode(
        "occlusion"
      );

      render();
      updateAnnotationsList();
    }
  );

  truncationInput?.addEventListener(
    "change",
    () => {
      const annotation =
        getSelectedAnnotation();

      const value =
        truncationInput.value ||
        "none";

      state.truncation = value;

      if (!annotation) return;

      annotation.truncation =
        value;

      annotation.updatedAt =
        new Date().toISOString();

      markDirty();

      setColorMode(
        "truncation"
      );

      render();
      updateAnnotationsList();
    }
  );

  scoreInput?.addEventListener(
    "change",
    () => {
      const annotation =
        getSelectedAnnotation();

      if (!annotation) return;

      const raw =
        scoreInput.value;

      annotation.score =
        raw === ""
          ? null
          : clamp(
              Number(raw),
              0,
              1
            );

      annotation.updatedAt =
        new Date().toISOString();

      markDirty();

      render();
      updateAnnotationsList();
    }
  );
}

/* ============================================================
   COLOR MODE
   ============================================================ */

export function setColorMode(
  mode = "normal"
) {
  const allowed = [
    "normal",
    "occlusion",
    "truncation",
  ];

  state.colorMode =
    allowed.includes(mode)
      ? mode
      : "normal";

  render();

  emit(
    "annotationColorModeChanged",
    {
      mode: state.colorMode,
    }
  );
}

/* ============================================================
   ANNOTATION COUNTS
   ============================================================ */

export function updateCounts() {
  const count =
    state.annotations.length;

  const objectCount =
    $("objectCount");

  const panelCount =
    $("annotationPanelCount");

  if (objectCount) {
    setText(
      objectCount,
      String(count)
    );
  }

  if (panelCount) {
    setText(
      panelCount,
      `${count} annotation${
        count === 1 ? "" : "s"
      }`
    );
  }

  emit(
    "annotationCountChanged",
    {
      count,
    }
  );
}

/* ============================================================
   ANNOTATION LIST
   ============================================================ */

export function updateAnnotationsList() {
  const list =
    $("annotationList");

  if (!list) return;

  list.innerHTML = "";

  if (!state.annotations.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "annotation-list-empty";

    empty.textContent =
      "No annotations yet.";

    list.appendChild(empty);

    return;
  }

  state.annotations.forEach(
    (annotation, index) => {
      const item =
        document.createElement(
          "button"
        );

      item.type = "button";

      item.className =
        "annotation-list-item";

      if (
        annotation.id ===
        state.selectedId
      ) {
        item.classList.add(
          "active"
        );
      }

      const label =
        annotation.label ||
        annotation.classification ||
        "object";

      const type =
        annotation.type ||
        "box";

      item.innerHTML = `
        <span class="annotation-index">
          ${index + 1}
        </span>
        <span class="annotation-item-main">
          <strong></strong>
          <small></small>
        </span>
      `;

      const strong =
        item.querySelector(
          "strong"
        );

      const small =
        item.querySelector(
          "small"
        );

      if (strong) {
        strong.textContent =
          label;
      }

      if (small) {
        small.textContent =
          `${type} · ${
            annotation.occlusion ||
            "none"
          }`;
      }

      item.addEventListener(
        "click",
        () => {
          selectAnnotation(
            annotation
          );
        }
      );

      list.appendChild(item);
    }
  );
}

/* ============================================================
   POPUP
   ============================================================ */

export function showAnnotationPopup(
  annotation
) {
  if (!annotation) {
    hidePopup();
    return;
  }

  const canvas =
    state.canvas;

  if (!canvas) return;

  let popup =
    state.popup;

  if (!popup) {
    popup =
      document.createElement(
        "div"
      );

    popup.className =
      "annotation-popup";

    popup.innerHTML = `
      <div class="annotation-popup-title"></div>
      <div class="annotation-popup-meta"></div>
    `;

    const container =
      $("annotationCanvasContainer") ||
      canvas.parentElement;

    container?.appendChild(
      popup
    );

    state.popup = popup;
  }

  const title =
    popup.querySelector(
      ".annotation-popup-title"
    );

  const meta =
    popup.querySelector(
      ".annotation-popup-meta"
    );

  if (title) {
    title.textContent =
      annotation.label ||
      "Object";
  }

  if (meta) {
    meta.textContent =
      `${annotation.type || "box"}${
        annotation.occlusion
          ? ` · ${annotation.occlusion}`
          : ""
      }${
        annotation.truncation
          ? ` · ${annotation.truncation}`
          : ""
      }`;
  }

  const center =
    annotationCenter(
      annotation
    );

  const point =
    imageToCanvas(
      center.x,
      center.y
    );

  popup.style.left =
    `${point.x + 12}px`;

  popup.style.top =
    `${point.y + 12}px`;

  popup.hidden = false;
}

export function hidePopup() {
  if (state.popup) {
    state.popup.hidden = true;
  }
}

/* ============================================================
   DIRTY STATE
   ============================================================ */

function markDirty(
  dirty = true
) {
  state.dirty = dirty;

  emit(
    "annotationsDirtyChanged",
    {
      dirty,
    }
  );
}

/* ============================================================
   CLEAR
   ============================================================ */

export function clearAnnotations(
  recordHistory = true
) {
  if (!state.annotations.length) {
    return;
  }

  const previous =
    cloneAnnotations();

  state.annotations = [];
  state.selectedId = null;

  if (recordHistory) {
    pushHistory();
  }

  markDirty();

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();

  hidePopup();

  render();

  emit(
    "annotationsCleared",
    {
      previous,
    }
  );
}

/* ============================================================
   MEDIA INITIALIZATION
   ============================================================ */

export function initializeAnnotationCanvas() {
  const canvas =
    $("annotationCanvas");

  if (!canvas) {
    return false;
  }

  state.canvas =
    canvas;

  state.ctx =
    canvas.getContext(
      "2d"
    );

  if (
    state.canvasInitialized
  ) {
    return true;
  }

  state.canvasInitialized =
    true;

  canvas.style.touchAction =
    "none";

  canvas.addEventListener(
    "pointerdown",
    onPointerDown
  );

  canvas.addEventListener(
    "pointermove",
    onPointerMove
  );

  canvas.addEventListener(
    "pointerup",
    onPointerUp
  );

  canvas.addEventListener(
    "pointercancel",
    onPointerUp
  );

  canvas.addEventListener(
    "dblclick",
    onDoubleClick
  );

  window.addEventListener(
    "resize",
    resizeCanvas
  );

  window.addEventListener(
    "keydown",
    onKeyDown
  );

  bindAnnotationMetadataInputs();

  resizeCanvas();

  return true;
}

export function initializeAnnotation() {
  if (state.initialized) {
    return true;
  }

  const canvas =
    $("annotationCanvas");

  if (!canvas) {
    return false;
  }

  state.initialized = true;

  initializeAnnotationCanvas();

  bindToolButtons();
  bindZoomButtons();
  bindAnnotationTypeSelector();
  bindCanvasShortcuts();

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();
  updateHistoryButtons();

  emit(
    "annotationInitialized",
    {}
  );

  return true;
}

/* ============================================================
   TOOL BUTTONS
   ============================================================ */

function bindToolButtons() {
  $("selectTool")?.addEventListener(
    "click",
    () => setMode("select")
  );

  $("drawBoxTool")?.addEventListener(
    "click",
    () =>
      setMode("draw-box")
  );

  $("drawPolygonTool")?.addEventListener(
    "click",
    () =>
      setMode("draw-polygon")
  );

  $("drawSegmentationTool")?.addEventListener(
    "click",
    () =>
      setMode(
        "draw-segmentation"
      )
  );

  $("moveTool")?.addEventListener(
    "click",
    () => setMode("move")
  );

  $("editTool")?.addEventListener(
    "click",
    () => setMode("edit")
  );

  $("deleteSelected")?.addEventListener(
    "click",
    () =>
      deleteSelectedAnnotation()
  );

  $("clearAnnotationsButton")?.addEventListener(
    "click",
    () => {
      if (
        !state.annotations.length
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Clear all annotations from this frame?"
        );

      if (confirmed) {
        clearAnnotations();
      }
    }
  );
}

/* ============================================================
   ZOOM BUTTONS
   ============================================================ */

function bindZoomButtons() {
  $("zoomInButton")?.addEventListener(
    "click",
    zoomIn
  );

  $("zoomOutButton")?.addEventListener(
    "click",
    zoomOut
  );

  $("zoomLabel")?.addEventListener(
    "dblclick",
    resetZoom
  );
}

/* ============================================================
   ANNOTATION TYPE SELECTOR
   ============================================================ */

function bindAnnotationTypeSelector() {
  const selector =
    $("annotationType");

  if (!selector) return;

  selector.addEventListener(
    "change",
    () => {
      setAnnotationType(
        selector.value
      );
    }
  );
}

/* ============================================================
   CANVAS SHORTCUTS
   ============================================================ */

function bindCanvasShortcuts() {
  const canvas =
    state.canvas;

  if (!canvas) return;

  canvas.addEventListener(
    "wheel",
    (event) => {
      if (
        !event.ctrlKey &&
        !event.metaKey
      ) {
        return;
      }

      event.preventDefault();

      const rect =
        canvas.getBoundingClientRect();

      const x =
        event.clientX -
        rect.left;

      const y =
        event.clientY -
        rect.top;

      const factor =
        event.deltaY < 0
          ? 1.1
          : 0.9;

      setZoom(
        state.zoom * factor,
        x,
        y
      );
    },
    {
      passive: false,
    }
  );
}

/* ============================================================
   MEDIA LOADING
   ============================================================ */

export function setImage(
  image
) {
  state.image = image;
  state.video = null;

  state.mediaType =
    "image";

  updateMediaDimensions();

  state.annotations = [];
  state.selectedId = null;

  resetHistory();

  setTimeout(() => {
    resizeCanvas();
    fitView(false);
    render();
  }, 0);
}

export function setVideo(
  video
) {
  state.video = video;
  state.image = null;

  state.mediaType =
    "video";

  updateMediaDimensions();

  state.annotations = [];
  state.selectedId = null;

  state.currentFrame = 0;

  resetHistory();

  const onLoaded = () => {
    updateMediaDimensions();
    resizeCanvas();
    fitView(false);
    render();
  };

  video.addEventListener(
    "loadedmetadata",
    onLoaded,
    {
      once: true,
    }
  );

  if (video.readyState >= 1) {
    onLoaded();
  }
}

export function clearMedia() {
  state.image = null;
  state.video = null;

  state.mediaWidth = 0;
  state.mediaHeight = 0;

  state.annotations = [];
  state.frameAnnotations =
    new Map();

  state.currentFrame = 0;

  state.selectedId = null;

  resetHistory();

  clearCanvas();

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();
}

/* ============================================================
   VIDEO FRAME SUPPORT
   ============================================================ */

function calculateCurrentFrame() {
  if (
    !state.video
  ) {
    return 0;
  }

  const fps =
    state.videoFrameRate ||
    30;

  return Math.max(
    0,
    Math.round(
      state.video.currentTime *
        fps
    )
  );
}

function syncCurrentVideoFrame() {
  if (
    state.mediaType !==
      "video" ||
    !state.video
  ) {
    return;
  }

  const nextFrame =
    calculateCurrentFrame();

  if (
    nextFrame ===
    state.currentFrame
  ) {
    return;
  }

  saveFrame(
    state.currentFrame
  );

  state.currentFrame =
    nextFrame;

  const saved =
    state.frameAnnotations.get(
      nextFrame
    );

  state.annotations =
    saved
      ? cloneAnnotations(saved)
      : [];

  state.selectedId = null;

  resetHistory();

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();

  render();
}

function bindVideoFrameEvents() {
  const video =
    $("annotationVideo");

  if (!video) return;

  video.addEventListener(
    "loadedmetadata",
    () => {
      state.videoFrameRate =
        normalizeNumber(
          video.dataset.frameRate,
          30
        );

      updateMediaDimensions();

      fitView(false);
    }
  );

  video.addEventListener(
    "timeupdate",
    () => {
      syncCurrentVideoFrame();
    }
  );

  video.addEventListener(
    "seeked",
    () => {
      updateMediaDimensions();
      syncCurrentVideoFrame();
      render();
    }
  );
}

/* ============================================================
   FRAME UI
   ============================================================ */

function updateFrameCounter() {
  const counter =
    $("frameCounter");

  if (!counter) return;

  if (
    state.mediaType !==
    "video"
  ) {
    setText(
      counter,
      "Frame 1"
    );

    return;
  }

  const fps =
    state.videoFrameRate ||
    30;

  const total =
    state.video?.duration
      ? Math.max(
          1,
          Math.ceil(
            state.video.duration *
              fps
          )
        )
      : 0;

  setText(
    counter,
    total
      ? `Frame ${
          state.currentFrame + 1
        } / ${total}`
      : `Frame ${
          state.currentFrame + 1
        }`
  );
}

/* ============================================================
   SAVE / LOAD INTEGRATION
   ============================================================ */

function getSerializableState() {
  return {
    annotations:
      cloneAnnotations(),
    frameAnnotations:
      serializeFrameAnnotations(),
    currentFrame:
      state.currentFrame,
    annotationType:
      state.annotationType,
    mediaType:
      state.mediaType,
  };
}

export function getAnnotations() {
  return cloneAnnotations();
}

export function setAnnotations(
  annotations = [],
  options = {}
) {
  state.suppressHistory =
    true;

  state.annotations =
    Array.isArray(annotations)
      ? cloneAnnotations(
          annotations
        )
      : [];

  state.selectedId =
    options.selectedId ||
    null;

  state.annotations.forEach(
    (annotation) => {
      annotation.type =
        normalizeAnnotationType(
          annotation.type
        );

      annotation.label =
        normalizeLabel(
          annotation.label ||
            annotation.classification
        );

      annotation.classification =
        annotation.classification ||
        annotation.label ||
        "";

      annotation.occlusion =
        annotation.occlusion ||
        "none";

      annotation.truncation =
        annotation.truncation ||
        "none";

      annotation.selected =
        annotation.id ===
        state.selectedId;
    }
  );

  state.suppressHistory =
    false;

  resetHistory();

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();

  markDirty(false);

  render();

  emit(
    "annotationsLoaded",
    {
      annotations:
        cloneAnnotations(),
    }
  );
}

export function getFrameAnnotations() {
  return serializeFrameAnnotations();
}

export function setFrameAnnotations(
  frames = {}
) {
  state.frameAnnotations =
    new Map();

  if (
    frames instanceof Map
  ) {
    frames.forEach(
      (annotations, frame) => {
        state.frameAnnotations.set(
          frameKey(frame),
          cloneAnnotations(
            annotations || []
          )
        );
      }
    );
  } else if (
    frames &&
    typeof frames === "object"
  ) {
    Object.entries(frames).forEach(
      ([frame, annotations]) => {
        state.frameAnnotations.set(
          frameKey(frame),
          cloneAnnotations(
            annotations || []
          )
        );
      }
    );
  }

  const current =
    state.frameAnnotations.get(
      state.currentFrame
    );

  if (current) {
    setAnnotations(
      current
    );
  }
}

/* ============================================================
   AUTO ANNOTATION
   ============================================================ */

function getAIButton() {
  return $("autoAnnotate");
}

function setAILoading(
  loading
) {
  state.ai.loading =
    loading;

  const button =
    getAIButton();

  if (!button) return;

  button.disabled =
    loading;

  setText(
    button,
    loading
      ? "AI working..."
      : "Auto annotate"
  );
}

async function getImageForAI() {
  if (
    state.mediaType ===
      "image" &&
    state.image
  ) {
    return state.image;
  }

  if (
    state.mediaType ===
      "video" &&
    state.video
  ) {
    return state.video;
  }

  return null;
}

function convertAIResultToAnnotations(
  result
) {
  const annotations = [];

  if (!result) {
    return annotations;
  }

  /*
   Transformers.js detection output
   can vary between versions.

   Supported forms:
     result.boxes
     result.detections
     result[0]
   */

  let items = [];

  if (
    Array.isArray(result)
  ) {
    items = result;
  } else if (
    Array.isArray(
      result.detections
    )
  ) {
    items =
      result.detections;
  } else if (
    Array.isArray(
      result.boxes
    )
  ) {
    items =
      result.boxes;
  }

  for (const item of items) {
    const box =
      item.box ||
      item.bbox ||
      item;

    const x1 =
      normalizeNumber(
        box.xmin ??
          box.x1 ??
          box.left ??
          (Array.isArray(box)
            ? box[0]
            : 0)
      );

    const y1 =
      normalizeNumber(
        box.ymin ??
          box.y1 ??
          box.top ??
          (Array.isArray(box)
            ? box[1]
            : 0)
      );

    const x2 =
      normalizeNumber(
        box.xmax ??
          box.x2 ??
          box.right ??
          (Array.isArray(box)
            ? box[2]
            : x1)
      );

    const y2 =
      normalizeNumber(
        box.ymax ??
          box.y2 ??
          box.bottom ??
          (Array.isArray(box)
            ? box[3]
            : y1)
      );

    if (
      x2 <= x1 ||
      y2 <= y1
    ) {
      continue;
    }

    const label =
      normalizeLabel(
        item.label ||
          item.class ||
          item.name ||
          "object"
      );

    const score =
      item.score != null
        ? clamp(
            Number(item.score),
            0,
            1
          )
        : null;

    annotations.push(
      createBoxAnnotation(
        clamp(
          x1,
          0,
          state.mediaWidth
        ),
        clamp(
          y1,
          0,
          state.mediaHeight
        ),
        clamp(
          x2,
          0,
          state.mediaWidth
        ),
        clamp(
          y2,
          0,
          state.mediaHeight
        ),
        {
          label,
          classification:
            label,
          score,
        }
      )
    );
  }

  return annotations;
}

async function runTransformersAI() {
  const media =
    await getImageForAI();

  if (!media) {
    throw new Error(
      "No image or video frame is available for AI annotation."
    );
  }

  const transformerUrl =
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

  const module =
    await import(
      transformerUrl
    );

  const {
    pipeline,
    env,
  } = module;

  env.allowLocalModels =
    false;

  env.allowRemoteModels =
    true;

  const model =
    MODELS.detr;

  if (
    !state.ai.pipeline
  ) {
    state.ai.pipeline =
      await pipeline(
        "object-detection",
        model
      );
  }

  const result =
    await state.ai.pipeline(
      media
    );

  return result;
}

async function autoAnnotate() {
  if (state.ai.loading) {
    return;
  }

  if (!state.mediaWidth) {
    showToast(
      "Load media before using AI annotation.",
      "warning"
    );

    return;
  }

  try {
    setAILoading(true);

    const result =
      await runTransformersAI();

    const generated =
      convertAIResultToAnnotations(
        result
      );

    if (!generated.length) {
      showToast(
        "AI did not find any objects.",
        "info"
      );

      return;
    }

    state.annotations =
      generated;

    state.selectedId =
      null;

    resetHistory();

    markDirty();

    updateCounts();
    updateAnnotationsList();
    updateSelectedLabel();

    render();

    emit(
      "aiAnnotationsCreated",
      {
        annotations:
          cloneAnnotations(
            generated
          ),
      }
    );

    showToast(
      `${generated.length} AI annotation${
        generated.length === 1
          ? ""
          : "s"
      } created.`,
      "success"
    );
  } catch (error) {
    console.error(
      "AI annotation failed:",
      error
    );

    showToast(
      error?.message ||
        "AI annotation failed.",
      "error"
    );

    emit(
      "aiAnnotationError",
      {
        error,
      }
    );
  } finally {
    setAILoading(false);
  }
}

/* ============================================================
   INITIALIZE AI BUTTON
   ============================================================ */

function bindAIButton() {
  getAIButton()?.addEventListener(
    "click",
    autoAnnotate
  );
}

/* ============================================================
   MEDIA ELEMENT CONNECTION
   ============================================================ */

function connectMediaElements() {
  const image =
    $("annotationImage");

  const video =
    $("annotationVideo");

  if (image) {
    image.addEventListener(
      "load",
      () => {
        setImage(image);
      }
    );

    if (image.complete) {
      setImage(image);
    }
  }

  if (video) {
    video.addEventListener(
      "loadedmetadata",
      () => {
        setVideo(video);
      }
    );

    if (
      video.readyState >= 1
    ) {
      setVideo(video);
    }
  }

  bindVideoFrameEvents();
}

/* ============================================================
   MEDIA TYPE LABEL
   ============================================================ */

function updateMediaTypeLabel() {
  const label =
    $("mediaTypeLabel");

  if (!label) return;

  setText(
    label,
    state.mediaType ===
      "video"
      ? "Video"
      : "Image"
  );
}

/* ============================================================
   TASK CONNECTION
   ============================================================ */

function connectTaskEvents() {
  window.addEventListener(
    "taskSelected",
    (event) => {
      const task =
        event.detail?.task ||
        event.detail;

      state.currentTask =
        task || null;

      clearMedia();

      state.frameAnnotations =
        new Map();

      state.currentFrame = 0;

      markDirty(false);

      updateMediaTypeLabel();
    }
  );

  window.addEventListener(
    "taskCleared",
    () => {
      state.currentTask =
        null;

      clearMedia();
      markDirty(false);
    }
  );

  window.addEventListener(
    "taskMediaLoaded",
    (event) => {
      const detail =
        event.detail || {};

      if (
        detail.image
      ) {
        setImage(
          detail.image
        );
      }

      if (
        detail.video
      ) {
        setVideo(
          detail.video
        );
      }

      updateMediaTypeLabel();
    }
  );
}

/* ============================================================
   FRAME NAVIGATION
   ============================================================ */

function seekVideoFrame(
  frame
) {
  if (
    !state.video
  ) {
    return;
  }

  const fps =
    state.videoFrameRate ||
    30;

  const target =
    Math.max(
      0,
      frame
    );

  state.video.currentTime =
    target / fps;

  state.currentFrame =
    target;

  updateFrameCounter();
}

function bindFrameButtons() {
  $("previousFrameButton")?.addEventListener(
    "click",
    () => {
      if (
        !state.video
      ) {
        return;
      }

      saveFrame(
        state.currentFrame
      );

      seekVideoFrame(
        state.currentFrame - 1
      );
    }
  );

  $("nextFrameButton")?.addEventListener(
    "click",
    () => {
      if (
        !state.video
      ) {
        return;
      }

      saveFrame(
        state.currentFrame
      );

      seekVideoFrame(
        state.currentFrame + 1
      );
    }
  );

  $("videoTimeline")?.addEventListener(
    "input",
    (event) => {
      if (
        !state.video
      ) {
        return;
      }

      const value =
        Number(
          event.target.value
        );

      const duration =
        state.video.duration ||
        0;

      state.video.currentTime =
        clamp(
          value,
          0,
          duration
        );
    }
  );
}

/* ============================================================
   VIDEO UI
   ============================================================ */

function bindVideoControls() {
  const video =
    $("annotationVideo");

  const playButton =
    $("videoPlayButton");

  if (
    playButton &&
    video
  ) {
    playButton.addEventListener(
      "click",
      async () => {
        try {
          if (
            video.paused
          ) {
            await video.play();
          } else {
            video.pause();
          }
        } catch (error) {
          console.warn(
            "Video playback error:",
            error
          );
        }
      }
    );

    video.addEventListener(
      "play",
      () => {
        setText(
          playButton,
          "Pause"
        );
      }
    );

    video.addEventListener(
      "pause",
      () => {
        setText(
          playButton,
          "Play"
        );
      }
    );
  }

  if (video) {
    video.addEventListener(
      "timeupdate",
      () => {
        const timeline =
          $("videoTimeline");

        const time =
          $("videoTime");

        if (
          timeline &&
          video.duration
        ) {
          timeline.value =
            video.currentTime;
          timeline.max =
            video.duration;
        }

        if (time) {
          setText(
            time,
            formatTime(
              video.currentTime
            )
          );
        }

        updateFrameCounter();
      }
    );
  }
}

function formatTime(seconds) {
  const value =
    Math.max(
      0,
      normalizeNumber(
        seconds,
        0
      )
    );

  const minutes =
    Math.floor(
      value / 60
    );

  const secs =
    Math.floor(value % 60);

  return `${String(
    minutes
  ).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}`;
}

/* ============================================================
   TOOL ACCESS / ROLE
   ============================================================ */

function enforceRoleTools() {
  const role =
    normalizeRole(
      getRole?.() ||
        state.currentTask?.work_role ||
        ""
    );

  const coworker =
    isCoworker?.() ||
    role.startsWith(
      "coworker_"
    );

  const manualPanel =
    $("manualAnnotationTypePanel");

  if (coworker) {
    showElement(
      manualPanel,
      false
    );
  } else {
    showElement(
      manualPanel,
      true
    );
  }

  const allowed =
    canAnnotateRole(
      role
    );

  if (!allowed) {
    const tools =
      $("editToolsPanel");

    if (tools) {
      tools
        .querySelectorAll(
          "button"
        )
        .forEach(
          (button) => {
            button.disabled =
              true;
          }
        );
    }

    const save =
      $("saveAnnotationsButton");

    const submit =
      $("submitTaskButton");

    if (save) {
      save.disabled = true;
    }

    if (submit) {
      submit.disabled = true;
    }
  }
}

/* ============================================================
   PUBLIC TASK STATE HELPERS
   ============================================================ */

export function getState() {
  return {
    ...state,
    annotations:
      cloneAnnotations(),
    frameAnnotations:
      getFrameAnnotations(),
  };
}

export function resetAnnotationState() {
  state.annotations = [];
  state.selectedId = null;

  state.polygonPoints = [];

  state.drawing = false;
  state.drawingAnnotation =
    null;

  state.moving = false;
  state.resizing = false;

  state.resizeHandle =
    null;

  state.dragStart = null;
  state.originalAnnotation =
    null;

  state.history = [];
  state.historyIndex = -1;

  state.frameAnnotations =
    new Map();

  state.currentFrame = 0;

  state.dirty = false;

  updateCounts();
  updateAnnotationsList();
  updateSelectedLabel();
  updateHistoryButtons();

  render();
}

/* ============================================================
   SAVE BEFORE TASK SWITCH
   ============================================================ */

function saveCurrentFrameBeforeSwitch() {
  if (
    state.mediaType ===
    "video"
  ) {
    saveFrame(
      state.currentFrame
    );
  }
}

/* ============================================================
   EXTERNAL CHANGE EVENTS
   ============================================================ */

function bindExternalAnnotationEvents() {
  window.addEventListener(
    "annotationTypeChangedExternal",
    (event) => {
      const type =
        event.detail?.type;

      if (type) {
        setAnnotationType(
          type
        );
      }
    }
  );

  window.addEventListener(
    "setAnnotationLabel",
    (event) => {
      const label =
        event.detail?.label;

      if (
        label != null
      ) {
        updateSelectedLabel(
          label
        );
      }
    }
  );

  window.addEventListener(
    "clearAnnotations",
    () => {
      clearAnnotations();
    }
  );
}

/* ============================================================
   INITIALIZATION
   ============================================================ */

let initializationPromise =
  null;

export async function initializeAnnotationApp() {
  if (
    initializationPromise
  ) {
    return initializationPromise;
  }

  initializationPromise =
    Promise.resolve().then(
      () => {
        initializeAnnotation();

        connectMediaElements();

        connectTaskEvents();

        bindAIButton();

        bindFrameButtons();

        bindVideoControls();

        bindExternalAnnotationEvents();

        enforceRoleTools();

        updateMediaTypeLabel();

        updateFrameCounter();

        updateZoomUI();

        updateCounts();

        updateAnnotationsList();

        updateHistoryButtons();

        return state;
      }
    );

  return initializationPromise;
}

/* ============================================================
   ALIASES EXPECTED BY OTHER MODULES
   ============================================================ */

export {
  clearSelection,
  getSelectedAnnotation,
  getSerializableState,
  autoAnnotate,
  saveCurrentFrameBeforeSwitch,
};

/* ============================================================
   AUTO INITIALIZATION
   ============================================================ */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      initializeAnnotationApp();
    },
    {
      once: true,
    }
  );
} else {
  initializeAnnotationApp();
}

/* ============================================================
   LEGACY WINDOW COMPATIBILITY
   ============================================================ */

window.annotation = {
  state,

  MODELS,

  LABEL_ALIASES,

  render,

  resizeCanvas,

  fitView,

  setZoom,

  zoomIn,

  zoomOut,

  resetZoom,

  updateZoomUI,

  setMode,

  setAnnotationType,

  createBoxAnnotation,

  finishPolygon,

  deleteSelectedAnnotation,

  findAnnotationAtPoint,

  updateCounts,

  updateAnnotationsList,

  showAnnotationPopup,

  hidePopup,

  pushHistory,

  undo,

  redo,

  saveFrame,

  loadFrame,

  clearFrameAnnotations,

  resetHistory,

  updateSelectedLabel,

  setColorMode,

  moveSelectedAnnotation,

  resizeSelectedAnnotation,

  initializeAnnotation,

  initializeAnnotationCanvas,

  initializeAnnotationApp,

  clearAnnotations,

  getAnnotations,

  setAnnotations,

  getFrameAnnotations,

  setFrameAnnotations,

  getState,

  resetAnnotationState,

  autoAnnotate,
};

console.log(
  "Annotation module loaded."
);
