# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# React Native
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}
-keepclassmembers class * {
  @react.bridge.ReactMethod *;
}
-keepclassmembers class * {
  @com.facebook.react.uimanager.annotations.ReactProp *;
}
-keepclassmembers class * {
  @com.facebook.react.uimanager.annotations.ReactPropGroup *;
}

-dontwarn com.facebook.react.**
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.** { *; }

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# Expo
-keepclassmembers class * {
  @expo.modules.core.interfaces.ExpoProp *;
}
-keep @expo.modules.core.interfaces.DoNotStrip class *
-keepclassmembers class * {
  @expo.modules.core.interfaces.DoNotStrip *;
}

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep custom views
-keep public class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
    public void set*(...);
    *** get*();
}

# Keep Parcelables
-keep class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator *;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Keep R class
-keepclassmembers class **.R$* {
    public static <fields>;
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Supabase
-keep class io.supabase.** { *; }
-dontwarn io.supabase.**

# React Native Maps
-keep class com.airbnb.android.react.maps.** { *; }
-keep class com.google.android.gms.maps.** { *; }
-dontwarn com.google.android.gms.**

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# React Native Gesture Handler
-keep class com.swmansion.gesturehandler.** { *; }

# React Native Screens
-keep class com.swmansion.rnscreens.** { *; }

# AsyncStorage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# Expo Location
-keep class expo.modules.location.** { *; }

# Expo Notifications
-keep class expo.modules.notifications.** { *; }

# Expo File System
-keep class expo.modules.filesystem.** { *; }

# Keep line numbers for debugging
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

