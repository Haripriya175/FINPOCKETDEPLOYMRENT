# FinPocket release (R8) rules.

# google_mlkit_text_recognition's TextRecognizer references the Chinese /
# Devanagari / Japanese / Korean recognizer option classes, but only the Latin
# model is bundled. R8 flags those references as missing classes — they're
# never invoked at runtime (document recognition uses the default recognizer),
# so the warnings are suppressed rather than pulling in ~40 MB of unused
# language models.
-dontwarn com.google.mlkit.vision.text.chinese.**
-dontwarn com.google.mlkit.vision.text.devanagari.**
-dontwarn com.google.mlkit.vision.text.japanese.**
-dontwarn com.google.mlkit.vision.text.korean.**
