// ============================================================
// ANNOTATION AI - CONFIGURATION
// ============================================================

export const APP_CONFIG = {
    appName: "ANNOTATION AI",
    version: "2.0.0",

    // --------------------------------------------------------
    // SUPABASE
    // --------------------------------------------------------
    supabaseUrl:
        "https://ozcwfcfcwzjjanxfvico.supabase.co",

    supabaseAnonKey:
        "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ",

    // Kept for compatibility with older configuration.
    // Do not put a service_role key here.
    supabaseLegacyAnonKey: "",

    // --------------------------------------------------------
    // ADMIN
    // --------------------------------------------------------
    // This is used internally.
    // It is NOT displayed to normal users.
    adminEmail:
        "antonymbali96@gmail.com",

    defaultRole:
        "customer",

    // --------------------------------------------------------
    // AUTHENTICATION
    // --------------------------------------------------------
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,

        storageKey:
            "annotation-ai-auth",

        flowType:
            "pkce"
    },

    // --------------------------------------------------------
    // STORAGE BUCKETS
    // --------------------------------------------------------
    buckets: {
        avatars:
            "avatars",

        taskMedia:
            "task-media"
    },

    // --------------------------------------------------------
    // DATABASE TABLES
    // --------------------------------------------------------
    tables: {
        profiles:
            "profiles",

        tasks:
            "tasks",

        annotations:
            "annotations",

        workflowEvents:
            "workflow_events",

        activityLogs:
            "activity_logs",

        taskSkips:
            "task_skips",

        payRates:
            "pay_rates",

        taskPayments:
            "task_payments"
    },

    // --------------------------------------------------------
    // AI
    // --------------------------------------------------------
    aiEnabled: true,

    aiModels: {
        detr:
            "Xenova/detr-resnet-50",

        yolo:
            "Xenova/yolov9-c",

        panoptic:
            "Xenova/detr-resnet-50-panoptic"
    },

    // --------------------------------------------------------
    // UPLOAD LIMITS
    // --------------------------------------------------------
    upload: {
        maxImageMB: 25,
        maxVideoMB: 250
    }
};


// ============================================================
// ALL APPLICATION ROLES
// ============================================================

export const ALL_ROLES = [
    "customer",

    "coworker_2d_box",

    "coworker_polygon",

    "coworker_segmentation",

    "reviewer",

    "staff",

    "admin"
];


// ============================================================
// WORK TYPE -> WORK ROLE
// ============================================================

export const WORK_ROLE = {

    "2d_box":
        "coworker_2d_box",

    "polygon":
        "coworker_polygon",

    "segmentation":
        "coworker_segmentation"
};


// ============================================================
// NORMALIZE ROLE
// ============================================================

export function normalizeRole(role) {

    if (!role) {
        return "customer";
    }

    const normalized =
        String(role)
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");

    // Legacy aliases
    if (
        normalized === "worker" ||
        normalized === "coworker"
    ) {
        return "coworker_2d_box";
    }

    if (
        normalized === "2d" ||
        normalized === "box" ||
        normalized === "2d_box_worker"
    ) {
        return "coworker_2d_box";
    }

    if (
        normalized === "polygon_worker"
    ) {
        return "coworker_polygon";
    }

    if (
        normalized === "segmentation_worker"
    ) {
        return "coworker_segmentation";
    }

    if (
        normalized === "customer_user"
    ) {
        return "customer";
    }

    if (
        normalized === "administrator"
    ) {
        return "admin";
    }

    if (
        ALL_ROLES.includes(normalized)
    ) {
        return normalized;
    }

    return "customer";
}


// ============================================================
// ROLE CHECKS
// ============================================================

export function isAdminRole(role) {

    return normalizeRole(role) === "admin";
}


export function isStaffRole(role) {

    const normalized =
        normalizeRole(role);

    return (
        normalized === "staff" ||
        normalized === "admin"
    );
}


export function isReviewerRole(role) {

    const normalized =
        normalizeRole(role);

    return (
        normalized === "reviewer" ||
        normalized === "staff" ||
        normalized === "admin"
    );
}


export function isCoworkerRole(role) {

    const normalized =
        normalizeRole(role);

    return (
        normalized === "coworker_2d_box" ||
        normalized === "coworker_polygon" ||
        normalized === "coworker_segmentation"
    );
}


export function canAnnotateRole(role) {

    const normalized =
        normalizeRole(role);

    return (
        isCoworkerRole(normalized) ||
        isReviewerRole(normalized)
    );
}


// ============================================================
// WORK TYPE HELPERS
// ============================================================

export function roleForWorkType(workType) {

    if (!workType) {
        return "coworker_2d_box";
    }

    const normalized =
        String(workType)
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");

    if (
        normalized === "2d_box" ||
        normalized === "2dbox" ||
        normalized === "box" ||
        normalized === "bounding_box"
    ) {
        return WORK_ROLE["2d_box"];
    }

    if (
        normalized === "polygon" ||
        normalized === "polygons"
    ) {
        return WORK_ROLE.polygon;
    }

    if (
        normalized === "segmentation" ||
        normalized === "semantic_segmentation" ||
        normalized === "instance_segmentation"
    ) {
        return WORK_ROLE.segmentation;
    }

    return "coworker_2d_box";
}


// ============================================================
// ANNOTATION TYPE FOR ROLE
// ============================================================

export function annotationTypeForRole(role) {

    const normalized =
        normalizeRole(role);

    switch (normalized) {

        case "coworker_2d_box":
            return "2d_box";

        case "coworker_polygon":
            return "polygon";

        case "coworker_segmentation":
            return "segmentation";

        default:
            return null;
    }
}


// ============================================================
// ROLE LABEL
// ============================================================

export function roleLabel(role) {

    const normalized =
        normalizeRole(role);

    const labels = {

        customer:
            "Customer",

        coworker_2d_box:
            "Coworker — 2D Box",

        coworker_polygon:
            "Coworker — Polygon",

        coworker_segmentation:
            "Coworker — Segmentation",

        reviewer:
            "Reviewer",

        staff:
            "Staff",

        admin:
            "Administrator"
    };

    return (
        labels[normalized] ||
        "Customer"
    );
}


// ============================================================
// WORK TYPE LABEL
// ============================================================

export function workTypeLabel(type) {

    if (!type) {
        return "Annotation";
    }

    const normalized =
        String(type)
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");

    const labels = {

        "2d_box":
            "2D Box",

        "2dbox":
            "2D Box",

        box:
            "2D Box",

        bounding_box:
            "2D Box",

        polygon:
            "Polygon",

        polygons:
            "Polygon",

        segmentation:
            "Segmentation",

        semantic_segmentation:
            "Segmentation",

        instance_segmentation:
            "Segmentation"
    };

    return (
        labels[normalized] ||
        type
    );
}


// ============================================================
// TASK STATUS LABEL
// ============================================================

export function taskStatusLabel(status) {

    if (!status) {
        return "Unknown";
    }

    const normalized =
        String(status)
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");

    const labels = {

        available:
            "Available",

        claimed:
            "In progress",

        in_progress:
            "In progress",

        submitted:
            "Submitted",

        review:
            "Under review",

        approved:
            "Approved",

        completed:
            "Completed",

        skipped:
            "Skipped",

        rejected:
            "Rejected",

        cancelled:
            "Cancelled"
    };

    return (
        labels[normalized] ||
        status
    );
}


// ============================================================
// TIME / DURATION HELPERS
// ============================================================

export function formatDuration(minutes) {

    const value =
        Number(minutes);

    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {
        return "—";
    }

    if (value < 60) {
        return `${Math.round(value)} min`;
    }

    const hours =
        Math.floor(value / 60);

    const remaining =
        Math.round(value % 60);

    if (remaining === 0) {
        return `${hours} hr`;
    }

    return `${hours} hr ${remaining} min`;
}


// ============================================================
// MONEY FORMATTER
// ============================================================

export function formatMoney(
    amount,
    currency = "USD"
) {

    const value =
        Number(amount);

    if (
        !Number.isFinite(value)
    ) {
        return "0.00";
    }

    try {

        return new Intl.NumberFormat(
            undefined,
            {
                style: "currency",
                currency
            }
        ).format(value);

    } catch (error) {

        return value.toFixed(2);
    }
}


// ============================================================
// DEFAULT PAY CURRENCY
// ============================================================

export const DEFAULT_CURRENCY =
    "USD";


// ============================================================
// ROLE ORDER
// Used by admin screens.
// ============================================================

export const ROLE_ORDER = [
    "customer",
    "coworker_2d_box",
    "coworker_polygon",
    "coworker_segmentation",
    "reviewer",
    "staff",
    "admin"
];


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.APP_CONFIG =
    APP_CONFIG;

window.ALL_ROLES =
    ALL_ROLES;

window.WORK_ROLE =
    WORK_ROLE;

window.normalizeRole =
    normalizeRole;

window.isAdminRole =
    isAdminRole;

window.isStaffRole =
    isStaffRole;

window.isReviewerRole =
    isReviewerRole;

window.isCoworkerRole =
    isCoworkerRole;

window.canAnnotateRole =
    canAnnotateRole;

window.roleForWorkType =
    roleForWorkType;

window.annotationTypeForRole =
    annotationTypeForRole;

window.roleLabel =
    roleLabel;

window.workTypeLabel =
    workTypeLabel;

window.taskStatusLabel =
    taskStatusLabel;

window.formatDuration =
    formatDuration;

window.formatMoney =
    formatMoney;

window.DEFAULT_CURRENCY =
    DEFAULT_CURRENCY;

window.ROLE_ORDER =
    ROLE_ORDER;
