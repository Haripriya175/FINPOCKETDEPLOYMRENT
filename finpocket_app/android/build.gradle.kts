allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Align the JVM target of EVERY module (the :app module and all Flutter plugin
// subprojects such as flutter_facebook_auth) to Java 17. Without this, plugin
// modules compile their Java with one target (e.g. 11) while Kotlin defaults to
// the JDK running Gradle (e.g. 25), which fails the build with:
//   "Inconsistent JVM Target Compatibility Between Java and Kotlin Tasks".
//
// This runs once in `projectsEvaluated` (after every project has been fully
// configured) so we never call afterEvaluate on an already-evaluated project.
//
// We set the target on the concrete compile tasks with `configureEach` (NOT
// `all`), because `all` would force a task to be realised before AGP has wired
// up its classpath — that strips android.jar off the classpath and breaks
// compilation. `configureEach` defers the write to when each task is realised
// (during the task-graph phase), which is still before Gradle finalises task
// properties. The android DSL extension, by contrast, is already finalised by
// this point, so it cannot be written here.
// Align the JVM target of every module (the :app module and all Flutter plugin
// subprojects such as flutter_facebook_auth). Some plugin modules compile their
// Java with one target (e.g. 11) while Kotlin defaults to another (e.g. 17/25),
// which fails the build with:
//   "Inconsistent JVM Target Compatibility Between Java and Kotlin Tasks".
//
// We ONLY ever write to the KOTLIN side, setting each module's Kotlin target to
// match the Java target its android {} block already declares. We must never
// write to the Java compile tasks: forcing sourceCompatibility there strips
// android.jar off that module's compile classpath (observed on
// flutter_secure_storage) and breaks compilation with "package android.content
// does not exist". Reads of the Android extension are allowed even after AGP
// finalises it — only writes throw.
//
// This runs once in `projectsEvaluated` (after every project is configured) so
// we never call afterEvaluate on an already-evaluated project.
val configuredProjects: List<Project> = rootProject.allprojects.toList()
gradle.projectsEvaluated {
    for (p in configuredProjects) {
        val javaTarget = p.extensions
            .findByType(com.android.build.gradle.BaseExtension::class.java)
            ?.compileOptions
            ?.sourceCompatibility
            ?: continue

        val kotlinTarget = when (javaTarget) {
            JavaVersion.VERSION_1_8 -> org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_1_8
            JavaVersion.VERSION_11 -> org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11
            JavaVersion.VERSION_17 -> org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
            JavaVersion.VERSION_21 -> org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21
            else -> org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
        }

        p.tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
            compilerOptions.jvmTarget.set(kotlinTarget)
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
