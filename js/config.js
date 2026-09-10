// ============================================================
// ANNOTATION AI
// APPLICATION CONFIGURATION
// File: js/config.js
// ============================================================

export const APP_CONFIG = {

    // --------------------------------------------------------
    // SUPABASE
    // --------------------------------------------------------

    supabaseUrl:
        "https://ozcwfcfcwzjjanxfvico.supabase.co",

    supabasePublishableKey:
        "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ",

    /*
     * Legacy anon key is retained for compatibility.
     * Do not place a service_role key in browser code.
     */

    supabaseAnonKey:
        "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ",


    // --------------------------------------------------------
    // AUTH
    // --------------------------------------------------------

    defaultRole:
        "customer",

    adminEmail:
        "antonymbali96@gmail.com",

    sessionStorageKey:
        "annotation_ai_session",

    themeStorageKey:
        "annotation_theme",


    // --------------------------------------------------------
    // ROLES
    // --------------------------------------------------------

    roles: [

        "customer",

        "staff",

        "reviewer",

        "coworker_2d_box",

        "coworker_polygon",

        "coworker_segmentation",

        "admin"
    ],


    // --------------------------------------------------------
    // WORK ROLE MAPPING
    // --------------------------------------------------------

    workRoles: {

        "2d_box":
            "coworker_2d_box",

        polygon:
            "coworker_polygon",

        segmentation:
            "coworker_segmentation"
    },


    // --------------------------------------------------------
    // STORAGE
    // --------------------------------------------------------

    buckets: {

        avatars:
            "avatars",

        taskMedia:
            "task-media"
    },


    // --------------------------------------------------------
    // AI
    // --------------------------------------------------------

    ai: {

        models: {

            detr:
                "Xenova/detr-resnet-50",

            yolo:
                "Xenova/yolov9-c",

            panoptic:
                "Xenova/detr-resnet-50-panoptic"
        },

        defaultModel:
            "detr",

        confidence:
            0.35,

        iou:
            0.45,

        maxDetections:
            100
    },


    // --------------------------------------------------------
    // UPLOAD
    // --------------------------------------------------------

    upload: {

        maxImageSizeMB:
            50,

        maxVideoSizeMB:
            500,

        allowedImageTypes: [

            "image/jpeg",

            "image/png",

            "image/webp",

            "image/gif"
        ],

        allowedVideoTypes: [

            "video/mp4",

            "video/webm",

            "video/quicktime",

            "video/x-matroska"
        ]
    },


    // --------------------------------------------------------
    // FEATURES
    // --------------------------------------------------------

    features: {

        aiAnnotations:
            true,

        videoAnnotation:
            true,

        polygonAnnotation:
            true,

        segmentationAnnotation:
            true,

        classification:
            true,

        occlusion:
            true,

        truncation:
            true,

        tracking:
            true,

        taskHistory:
            true,

        payments:
            true,

        admin:
            true,

        coworkerRouting:
            true
    }
};


// ============================================================
// ROLE HELPERS
// ============================================================

export function normalizeRole(
    role
) {

    const value =
        String(
            role ||
            ""
        )
            .trim()
            .toLowerCase();


    if (
        APP_CONFIG.roles.includes(
            value
        )
    ) {

        return value;
    }


    return APP_CONFIG.defaultRole;
}


// ============================================================
// ADMIN
// ============================================================

export function isAdminRole(
    role
) {

    return (
        normalizeRole(role) ===
        "admin"
    );
}


// ============================================================
// STAFF
// ============================================================

export function isStaffRole(
    role
) {

    const normalized =
        normalizeRole(role);


    return (
        normalized ===
            "staff" ||

        normalized ===
            "admin"
    );
}


// ============================================================
// REVIEWER
// ============================================================

export function isReviewerRole(
    role
) {

    const normalized =
        normalizeRole(role);


    return (

        normalized ===
            "reviewer" ||

        normalized ===
            "staff" ||

        normalized ===
            "admin"
    );
}


// ============================================================
// ANNOTATION PERMISSION
// ============================================================

export function canAnnotateRole(
    role
) {

    const normalized =
        normalizeRole(role);


    return [

        "customer",

        "staff",

        "reviewer",

        "coworker_2d_box",

        "coworker_polygon",

        "coworker_segmentation",

        "admin"

    ].includes(
        normalized
    );
}


// ============================================================
// COWORKER ROLE
// ============================================================

export function isCoworkerRole(
    role
) {

    return [

        "coworker_2d_box",

        "coworker_polygon",

        "coworker_segmentation"

    ].includes(
        normalizeRole(role)
    );
}


// ============================================================
// ALL ACCESS
// ============================================================

export function hasAllAccessRole(
    role
) {

    const normalized =
        normalizeRole(role);


    return (

        normalized ===
            "staff" ||

        normalized ===
            "admin"
    );
}


// ============================================================
// ROLE → ANNOTATION TYPE
// ============================================================

export function annotationTypeForRole(
    role
) {

    switch (
        normalizeRole(role)
    ) {

        case "coworker_2d_box":

            return "box";


        case "coworker_polygon":

            return "polygon";


        case "coworker_segmentation":

            return "segmentation";


        default:

            return null;
    }
}


// ============================================================
// ROLE → WORK TYPE
// ============================================================

export function workTypeForRole(
    role
) {

    switch (
        normalizeRole(role)
    ) {

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
