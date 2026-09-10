```js
// ============================================================
// ANNOTATION AI
// CONFIGURATION
// File: js/config.js
// ============================================================

export const APP_CONFIG = {

    // --------------------------------------------------------
    // Application
    // --------------------------------------------------------

    appName: "ANNOTATION AI",

    version: "1.0.0",

    environment: "production",


    // --------------------------------------------------------
    // Supabase
    // --------------------------------------------------------

    supabaseUrl:
        "https://ozcwfcfcwzjjanxfvico.supabase.co",

    // Supabase publishable key.
    //
    // This is safe to use in browser-side Supabase code
    // when Row Level Security (RLS) is correctly configured.
    supabaseAnonKey:
        "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ",

    // Legacy anon key.
    //
    // Kept as a fallback because some Supabase client
    // configurations use the JWT anon key instead of the
    // newer sb_publishable_ key.
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
    // Local application session
    // --------------------------------------------------------

    sessionKey:
        "annotationAI_session_v1",


    // --------------------------------------------------------
    // Default user role
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
    // AI models
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
    // Annotation defaults
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
    // Upload defaults
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
    // Feature switches
    // --------------------------------------------------------

    features: {

        authentication:
            true,

        annotations:
            true,

        video:
            true,

        image:
            true,

        ai:
            true,

        history:
            true,

        tasks:
            true,

        admin:
            true,

        profile:
            true,

        coworker:
            true
    }
};


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
// COMPATIBILITY GLOBAL
// ============================================================

window.APP_CONFIG = APP_CONFIG;


// ============================================================
// STARTUP LOG
// ============================================================

if (validateConfig()) {

    console.log(
        `${APP_CONFIG.appName} configuration loaded.`
    );

}
```
