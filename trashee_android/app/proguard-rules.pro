# Models are read from JSON by hand, nothing is reflected on.
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# WorkManager (pulled in by the home-screen widget) creates its classes by name and calls their constructors.
# R8 would drop the constructors: the app would crash at start (database) or the widget would stay blank (workers).
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { <init>(); }
-keep class * extends androidx.work.InputMerger { <init>(); }
-keep class * extends androidx.work.ListenableWorker { <init>(android.content.Context, androidx.work.WorkerParameters); }

# Glance creates the widget's button handlers (and the widget itself) by name; their empty constructors must stay.
-keep class * implements androidx.glance.appwidget.action.ActionCallback { <init>(); }
-keep class * extends androidx.glance.appwidget.GlanceAppWidget { <init>(); }
