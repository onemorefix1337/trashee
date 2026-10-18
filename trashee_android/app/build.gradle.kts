import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// ./gradlew assembleRelease -PversionName=0.2.0 (the release workflow passes the version from the tag).
val appVersion = (project.findProperty("versionName") as String?) ?: "0.1.0"
// 1.2.3 becomes 10203, so a bigger version is always a bigger code. Same rule as versionCodeOf() in the app.
val appVersionCode = appVersion.substringBefore('-').split('.').let { (major, minor, patch) ->
    major.toInt() * 10_000 + minor.toInt() * 100 + patch.toInt()
}

// The signing key stays out of git: keystore.properties next to this build, or environment variables in CI.
val keystoreProps = Properties().apply {
    rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun signingValue(name: String, env: String): String? = keystoreProps.getProperty(name) ?: System.getenv(env)

// A test can point the app at its own server: ./gradlew assembleDebug -PapiBase=http://10.0.2.2:8787
val apiBase = (project.findProperty("apiBase") as String?) ?: "https://api.music.yandex.net"
val oauthBase = (project.findProperty("oauthBase") as String?) ?: "https://oauth.yandex.ru"
val githubApi = (project.findProperty("githubApi") as String?) ?: "https://api.github.com/repos/onemorefix1337/trashee"

android {
    namespace = "app.trashee"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.trashee"
        minSdk = 29
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersion
        buildConfigField("String", "API_BASE", "\"$apiBase\"")
        buildConfigField("String", "OAUTH_BASE", "\"$oauthBase\"")
        buildConfigField("String", "REPO", "\"onemorefix1337/trashee\"")
        buildConfigField("String", "GITHUB_API", "\"$githubApi\"")
    }

    signingConfigs {
        create("release") {
            signingValue("storeFile", "ANDROID_KEYSTORE_PATH")?.let { storeFile = file(it) }
            storePassword = signingValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
            keyAlias = signingValue("keyAlias", "ANDROID_KEY_ALIAS")
            keyPassword = signingValue("keyPassword", "ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        debug {
            // ./gradlew assembleDebug -PminifyDebug: checks that the shrinker keeps everything the app needs,
            // while still allowing the cleartext test server that release builds refuse.
            if (project.hasProperty("minifyDebug")) {
                isMinifyEnabled = true
                proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            }
        }
        release {
            // Without a key the release stays unsigned; the release workflow refuses to publish that.
            signingConfig = signingConfigs.getByName("release").takeIf { it.storeFile != null }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)
    implementation(libs.media3.datasource.okhttp)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.androidx.palette)

    testImplementation(libs.junit)
}
