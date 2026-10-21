import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing. key.properties + the keystore are local-only (gitignored —
// see android/.gitignore). On a fresh clone without them the release build
// falls back to debug signing so `flutter run --release` still works.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.finpocket.finpocket_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.finpocket.finpocket_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        multiDexEnabled = true
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            // Prefer the local release keystore; fall back to debug signing so
            // fresh clones (without key.properties) can still run --release.
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            // Keep rules for release minification (see proguard-rules.pro —
            // ML Kit language-model stubs, etc.).
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")

    // NOTE: We previously forced androidx.camera:* down to 1.4.2 to dodge a
    // JSpecify type-annotation build error from CameraX 1.5.x. That force broke
    // the runtime instead: camera_android_camerax 0.6.x (used by `camera` and
    // `mobile_scanner`) references androidx.camera.camera2.Camera2Config.Companion,
    // which only exists in 1.5.x. Loading against the forced 1.4.2 threw a
    // java.lang.NoSuchFieldError during GeneratedPluginRegistrant.registerWith().
    // Because that is an Error (not an Exception), it escaped the generated
    // `catch (Exception e)` and aborted registration of every plugin declared
    // after `mobile_scanner` — silently killing shared_preferences and
    // url_launcher. That is what made every login (email AND Google) fail with
    // "Something went wrong. Please try again."
    //
    // The JSpecify build issue is a thing of the past now that this project is on
    // AGP 9.1.0 / Gradle 9.3.1 / Kotlin 2.4.0 / compileSdk 36, so the pins are
    // removed and CameraX floats to the version the camera plugins expect.
}

