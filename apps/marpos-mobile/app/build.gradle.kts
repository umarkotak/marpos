plugins {
    id("com.android.application")
}

android {
    namespace = "com.marpos.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.marpos.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    // 1.2.1 needs Kotlin 2.4; keep the version compatible with AGP 9.0 built-in Kotlin.
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
