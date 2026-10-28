package app.vercel.rizzmaster;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.Lifecycle;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.initialization.OnInitializationCompleteListener;
import com.google.android.gms.ads.initialization.InitializationStatus;
import com.google.android.ump.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.mockito.MockedStatic;

public class AdMobNativeTest {
    @Test public void presentationRequiresResumedHostAndNativeWindowFocus() throws Exception {
        AppCompatActivity activity = mock(AppCompatActivity.class);
        Lifecycle lifecycle = mock(Lifecycle.class);
        when(activity.getLifecycle()).thenReturn(lifecycle);
        doAnswer(i -> { i.getArgument(0, Runnable.class).run(); return null; }).when(activity).runOnUiThread(any());
        AdsStartupPlugin plugin = new AdsStartupPlugin() {
            @Override public AppCompatActivity getActivity() { return activity; }
        };
        for (Lifecycle.State state : new Lifecycle.State[] {Lifecycle.State.STARTED, Lifecycle.State.RESUMED}) {
            for (boolean focused : new boolean[] {false, true}) {
                when(lifecycle.getCurrentState()).thenReturn(state);
                when(activity.hasWindowFocus()).thenReturn(focused);
                PluginCall call = mock(PluginCall.class);
                plugin.getPresentationState(call);
                org.mockito.ArgumentCaptor<JSObject> result = org.mockito.ArgumentCaptor.forClass(JSObject.class);
                verify(call).resolve(result.capture());
                assertEquals(state == Lifecycle.State.RESUMED && focused, result.getValue().getBoolean("hostInteractive"));
            }
        }
    }
    @Test public void startupWaitsForSdkAndDoesNotRequireBannerLayout() throws Exception {
        AppCompatActivity activity = mock(AppCompatActivity.class);
        Context context = mock(Context.class);
        ConsentInformation consent = mock(ConsentInformation.class);
        when(consent.canRequestAds()).thenReturn(true);
        when(consent.getPrivacyOptionsRequirementStatus()).thenReturn(ConsentInformation.PrivacyOptionsRequirementStatus.NOT_REQUIRED);
        doAnswer(i -> { i.getArgument(0, Runnable.class).run(); return null; }).when(activity).runOnUiThread(any());
        List<JSObject> states = new ArrayList<>();
        AdsStartupPlugin plugin = new AdsStartupPlugin() {
            @Override public AppCompatActivity getActivity() { return activity; }
            @Override public Context getContext() { return context; }
            @Override protected void notifyListeners(String event, JSObject state, boolean retained) { states.add(state); }
        };
        try (MockedStatic<UserMessagingPlatform> ump = mockStatic(UserMessagingPlatform.class);
             MockedStatic<MobileAds> sdk = mockStatic(MobileAds.class)) {
            ump.when(() -> UserMessagingPlatform.getConsentInformation(context)).thenReturn(consent);
            AtomicReference<OnInitializationCompleteListener> callback = new AtomicReference<>();
            sdk.when(() -> MobileAds.initialize(eq(context), any())).thenAnswer(i -> { callback.set(i.getArgument(1)); return null; });
            PluginCall call = mock(PluginCall.class);
            plugin.start(call);
            plugin.start(mock(PluginCall.class));
            sdk.verify(() -> MobileAds.initialize(eq(context), any()), times(1));
            verify(consent, times(1)).requestConsentInfoUpdate(eq(activity), any(), any(), any());
            assertNotNull(callback.get());
            verify(activity, never()).findViewById(anyInt());
            org.mockito.ArgumentCaptor<JSObject> result = org.mockito.ArgumentCaptor.forClass(JSObject.class);
            verify(call).resolve(result.capture());
            assertFalse(result.getValue().getBoolean("sdkReady"));
            callback.get().onInitializationComplete(mock(InitializationStatus.class));
            assertTrue(states.get(states.size()-1).getBoolean("sdkReady"));
        }
    }

    @Test public void deniedPermissionDoesNotInitializeSdkAndRequiredFormIsSerialized() {
        AppCompatActivity activity = mock(AppCompatActivity.class);
        Context context = mock(Context.class);
        ConsentInformation consent = mock(ConsentInformation.class);
        when(consent.getPrivacyOptionsRequirementStatus()).thenReturn(ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        doAnswer(i -> { i.getArgument(0, Runnable.class).run(); return null; }).when(activity).runOnUiThread(any());
        AdsStartupPlugin plugin = new AdsStartupPlugin() {
            @Override public AppCompatActivity getActivity() { return activity; }
            @Override public Context getContext() { return context; }
            @Override protected void notifyListeners(String event, JSObject state, boolean retained) {}
        };
        AtomicReference<ConsentInformation.OnConsentInfoUpdateSuccessListener> success = new AtomicReference<>();
        doAnswer(i -> { success.set(i.getArgument(2)); return null; }).when(consent).requestConsentInfoUpdate(any(), any(), any(), any());
        try (MockedStatic<UserMessagingPlatform> ump = mockStatic(UserMessagingPlatform.class);
             MockedStatic<MobileAds> sdk = mockStatic(MobileAds.class)) {
            ump.when(() -> UserMessagingPlatform.getConsentInformation(context)).thenReturn(consent);
            plugin.start(mock(PluginCall.class));
            success.get().onConsentInfoUpdateSuccess();
            plugin.start(mock(PluginCall.class));
            plugin.showPrivacyOptions(mock(PluginCall.class));
            ump.verify(() -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(eq(activity), any()), times(1));
            ump.verify(() -> UserMessagingPlatform.showPrivacyOptionsForm(any(), any()), never());
            sdk.verifyNoInteractions();
        }
    }

    @Test public void unavailableActivityRejectsWithoutSdkWork() {
        AdsStartupPlugin plugin = new AdsStartupPlugin() {
            @Override public AppCompatActivity getActivity() { return null; }
        };
        PluginCall call = mock(PluginCall.class);
        plugin.start(call);
        verify(call).reject("Ads activity is unavailable");
    }
}
