# Android Google Auth Setup Guide

Since the native Android files are generated, you must manually add the specific code below to enable Google Login redirection.

## 1. Initialize Android Project
Run these commands in your terminal if you haven't already:

```bash
npm run build
npm install @capacitor/android
npx cap add android
```

## 2. Configure Deep Links (CRITICAL STEP) ⚠️

You need to edit one file to tell Android "If you see a link starting with `com.rizzmaster.app://`, open this app."

1. Open the file: `android/app/src/main/AndroidManifest.xml`
2. Look for the `<activity>` tag that contains `android:name=".MainActivity"`.
3. Inside that `<activity>` tag, **Paste the following code block**:

```xml
<!-- START COPYING HERE -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <!-- Accepts URIs that begin with "com.rizzmaster.app://auth/callback" -->
    <data android:scheme="com.rizzmaster.app" android:host="auth" android:pathPrefix="/callback" />
</intent-filter>
<!-- END COPYING HERE -->
```

It should look like this when you are done:

```xml
<activity android:name=".MainActivity" ... >
    
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- YOUR NEW CODE -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="com.rizzmaster.app" android:host="auth" android:pathPrefix="/callback" />
    </intent-filter>
    <!-- END NEW CODE -->

</activity>
```

## 3. Sync and Run
After editing the XML file, run:

```bash
npx cap sync
npx cap open android
```

This will open Android Studio. From there, press the **Play** button to run the app on your emulator or connected device.
