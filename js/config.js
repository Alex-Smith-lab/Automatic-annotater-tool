// ============================================================
// ANNOTATION AI
// CONFIGURATION
// File: js/config.js
// ============================================================

export const APP_CONFIG = {

    appName: "ANNOTATION AI",

    version: "1.0.0",

    environment: "production",

    // --------------------------------------------------------
    // Supabase
    // --------------------------------------------------------

    supabaseUrl:
        "https://ozcwfcfcwzjjanxfvico.supabase.co",

    supabaseAnonKey:
        "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ",

    supabaseLegacyAnonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96Y3dmY2Zjd3pqamFueGZ2aWNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NTQzODQsImV4cCI6MjEwNDUzMDM4NH0.GcVi9w-OKTOnIj2vio5v81eJaD5RzpOk1oG9hkazCSY",

    // --------------------------------------------------------
    // Authentication
    // --------------------------------------------------------

    auth: {

        persistSession: true,

        autoRefreshToken: true,

        detectSessionInUrl: true,

        storageKey:
            "annotation-ai-auth",

        flowType: "pkce"
    },

    // --------------------------------------------------------
    // Local session
    // --------------------------------------------------------

    sessionKey:
        "annotationAI_session_v1",

    // --------------------------------------------------------
    // Default role
    // --------------------------------------------------------

    defaultRole:
        "customer",

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    adminEmail:
        "antonymbali96@gmail.com",

    // --------------------------------------------------------
    // Storage
    // --------------------------------------------------------

    storage: {

        avatarBucket:
            "avatars",

        mediaBucket:
            "media",

        taskBucket:
            "tasks"
    },

    // --------------------------------------------------------
    // AI
    // --------------------------------------------------------

    aiModels: {

        detr:
            "Xenova/detr-resnet-50",

        yolo:
            "Xenova/yolov9-c",

        panoptic:
            "Xenova/detr-resnet-50-panoptic"
    },

    // --------------------------------------------------------
    // Annotation
    // --------------------------------------------------------

    annotation: {

        defaultType:
            "box",

        defaultColor:
            "#22c55e",

        minBoxSize:
            3,

        maxHistory:
            100,

        maxAnnotations:
            5000
    },

    // --------------------------------------------------------
    // Upload
    // --------------------------------------------------------

    upload: {

        maxImageSizeMB:
            50,

        maxVideoSizeMB:
            500,

        acceptedImages: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ],

        acceptedVideos: [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/ogg"
        ]
    },

    // --------------------------------------------------------
    // Features
    // --------------------------------------------------------

    features: {

        authentication: true,

        annotations: true,

        video: true,

        image: true,

        ai: true,

        history: true,

        tasks: true,

        admin: true,

        profile: true,

        coworker: true
    }
};


// ============================================================
// ROLE NORMALIZATION
// ============================================================

export function normalizeRole(role) {

    const value =
        String(role || "")
            .trim()
            .toLowerCase();

    const aliases = {

        user:
            "customer",

        customer:
            "customer",

        client:
            "customer",

        annotator:
            "annotator",

        annotation:
            "annotator",

        reviewer:
            "reviewer",

        review:
            "reviewer",

        staff:
            "staff",

        coworker:
            "staff",

        worker:
            "staff",

        admin:
            "admin",

        administrator:
            "admin"
    };

    return (
        aliases[value] ||
        APP_CONFIG.defaultRole
    );
}


// ============================================================
// ROLE CHECKS
// ============================================================

export function isAdminRole(role) {

    return (
        normalizeRole(role) ===
        "admin"
    );
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


export function canAnnotateRole(role) {

    const normalized =
        normalizeRole(role);

    return [
        "customer",
        "annotator",
        "reviewer",
        "staff",
        "admin"
    ].includes(
        normalized
    );
}


// ============================================================
// VALIDATION
// ============================================================

export function validateConfig() {

    const errors = [];

    if (
        !APP_CONFIG.supabaseUrl ||
        APP_CONFIG.supabaseUrl.includes(
            "YOUR_SUPABASE"
        )
    ) {

        errors.push(
            "Supabase project URL is missing."
        );
    }

    if (
        !APP_CONFIG.supabaseAnonKey ||
        APP_CONFIG.supabaseAnonKey.includes(
            "YOUR_SUPABASE"
        )
    ) {

        errors.push(
            "Supabase publishable key is missing."
        );
    }

    if (errors.length) {

        console.error(
            "ANNOTATION AI configuration errors:",
            errors
        );

        return false;
    }

    return true;
}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.APP_CONFIG =
    APP_CONFIG;


// ============================================================
// STARTUP LOG
// ============================================================

if (validateConfig()) {

    console.log(
        `${APP_CONFIG.appName} configuration loaded.`
    );
}
