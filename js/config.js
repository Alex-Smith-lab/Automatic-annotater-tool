/* ============================================================
   CONFIGURATION
   js/config.js
============================================================ */

export const APP_CONFIG = {
    appName: "ANNOTATION AI",

    /*
     * IMPORTANT:
     * Put the SAME Supabase project URL and anon/public key
     * that your original working application uses here.
     *
     * Do NOT put the Supabase service_role key in browser code.
     */

    supabaseUrl:
        window.SUPABASE_URL ||
        "YOUR_SUPABASE_PROJECT_URL",

    supabaseAnonKey:
        window.SUPABASE_ANON_KEY ||
        "YOUR_SUPABASE_ANON_KEY",

    sessionKey:
        "annotationAI_session_v1",

    defaultRole:
        "customer",

    aiModels: {
        detr:
            "Xenova/detr-resnet-50",

        yolo:
            "Xenova/yolov9-c",

        panoptic:
            "Xenova/detr-resnet-50-panoptic"
    },

    aiLabelAliases: {
        automobile:
            "car",

        vehicle:
            "car",

        "motor vehicle":
            "car",

        human:
            "person",

        cyclist:
            "bicycle",

        bike:
            "bicycle"
    }
};


/* ============================================================
   ROLE HELPERS
============================================================ */

export const ROLES = {
    CUSTOMER: "customer",
    COWORKER: "coworker",
    STAFF: "staff",
    REVIEWER: "reviewer",
    ADMIN: "admin"
};


export function normalizeRole(role) {

    if (!role) {
        return ROLES.CUSTOMER;
    }

    return String(role)
        .trim()
        .toLowerCase();
}


export function isAdminRole(role) {

    return normalizeRole(role) ===
        ROLES.ADMIN;
}


export function isReviewerRole(role) {

    const normalized =
        normalizeRole(role);

    return (
        normalized === ROLES.REVIEWER ||
        normalized === ROLES.ADMIN
    );
}


export function isStaffRole(role) {

    const normalized =
        normalizeRole(role);

    return (
        normalized === ROLES.STAFF ||
        normalized === ROLES.REVIEWER ||
        normalized === ROLES.ADMIN
    );
}


export function canAnnotateRole(role) {

    const normalized =
        normalizeRole(role);

    return [
        ROLES.COWORKER,
        ROLES.STAFF,
        ROLES.REVIEWER,
        ROLES.ADMIN
    ].includes(normalized);
}


export function canUseUploadRole(role) {

    const normalized =
        normalizeRole(role);

    /*
     * Keep customer upload available.
     * Higher roles also retain access.
     */

    return [
        ROLES.CUSTOMER,
        ROLES.COWORKER,
        ROLES.STAFF,
        ROLES.REVIEWER,
        ROLES.ADMIN
    ].includes(normalized);
}
