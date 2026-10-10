package app.vercel.rizzmaster;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import android.content.Context;
import android.content.res.Resources;
import android.os.Handler;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.widget.RelativeLayout;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.community.admob.AdMob;
import com.getcapacitor.community.admob.banner.BannerExecutor;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.initialization.InitializationStatus;
import com.google.android.gms.ads.initialization.OnInitializationCompleteListener;
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;

/** Runs the actual plugin code with deterministic native callbacks and UI queues. */
public class AdMobNativeTest {
    private AppCompatActivity activity;
    private Context context;
    private ViewGroup content;
    private ViewGroup parent;
    private final Map<Long, Runnable> timeouts = new HashMap<>();

    @Before
    public void setUp() {
        activity = mock(AppCompatActivity.class);
        context = mock(Context.class);
        content = mock(ViewGroup.class);
        parent = mock(ViewGroup.class);
        when(activity.findViewById(android.R.id.content)).thenReturn(content);
        when(content.getChildAt(0)).thenReturn(parent);
        when(content.getChildCount()).thenReturn(1);
        doAnswer(invocation -> { invocation.getArgument(0, Runnable.class).run(); return null; })
            .when(activity).runOnUiThread(any());
        Resources resources = mock(Resources.class);
        DisplayMetrics metrics = new DisplayMetrics();
        metrics.density = 2;
        when(resources.getDisplayMetrics()).thenReturn(metrics);
        when(context.getResources()).thenReturn(resources);
    }

    private AdMob plugin() {
        return new AdMob() {
            @Override public AppCompatActivity getActivity() { return activity; }
            @Override public Context getContext() { return context; }
        };
    }

    private MockedConstruction<Handler> handlers() {
        return mockConstruction(Handler.class, (handler, construction) -> {
            when(handler.post(any())).thenAnswer(invocation -> {
                invocation.getArgument(0, Runnable.class).run();
                return true;
            });
            when(handler.postDelayed(any(), anyLong())).thenAnswer(invocation -> {
                timeouts.put(invocation.getArgument(1), invocation.getArgument(0));
                return true;
            });
            doAnswer(invocation -> { timeouts.values().remove(invocation.getArgument(0)); return null; })
                .when(handler).removeCallbacks(any());
        });
    }

    private AtomicReference<OnInitializationCompleteListener> captureSdk(MockedStatic<MobileAds> sdk) {
        AtomicReference<OnInitializationCompleteListener> completion = new AtomicReference<>();
        sdk.when(() -> MobileAds.initialize(any(Context.class), any(OnInitializationCompleteListener.class)))
            .thenAnswer(invocation -> { completion.set(invocation.getArgument(1)); return null; });
        return completion;
    }

    @Test
    public void readinessWaitsForMediationCallbackAndSettlesOnce() {
        try (MockedConstruction<Handler> ignored = handlers(); MockedStatic<MobileAds> sdk = mockStatic(MobileAds.class)) {
            AtomicReference<OnInitializationCompleteListener> completion = captureSdk(sdk);
            PluginCall call = mock(PluginCall.class);
            plugin().initialize(call);
            verify(call, never()).resolve();
            assertNotNull(completion.get());
            completion.get().onInitializationComplete(mock(InitializationStatus.class));
            completion.get().onInitializationComplete(mock(InitializationStatus.class));
            verify(call, times(1)).resolve();
            assertTrue(timeouts.isEmpty());
        }
    }

    @Test
    public void sdkTimeoutRejectsAndIgnoresItsLateCallback() {
        try (MockedConstruction<Handler> ignored = handlers(); MockedStatic<MobileAds> sdk = mockStatic(MobileAds.class)) {
            AtomicReference<OnInitializationCompleteListener> completion = captureSdk(sdk);
            PluginCall call = mock(PluginCall.class);
            plugin().initialize(call);
            timeouts.get(35000L).run();
            completion.get().onInitializationComplete(mock(InitializationStatus.class));
            verify(call).reject("AdMob SDK initialization timed out");
            verify(call, never()).resolve();
        }
    }

    @Test
    public void missingParentCanAppearOnALaterLayoutPass() {
        try (MockedConstruction<Handler> ignored = handlers(); MockedStatic<MobileAds> sdk = mockStatic(MobileAds.class)) {
            AtomicReference<OnInitializationCompleteListener> completion = captureSdk(sdk);
            ViewTreeObserver observer = mock(ViewTreeObserver.class);
            when(observer.isAlive()).thenReturn(true);
            when(content.getViewTreeObserver()).thenReturn(observer);
            when(content.getChildAt(0)).thenReturn(null);
            PluginCall call = mock(PluginCall.class);
            plugin().initialize(call);
            assertNull(completion.get());
            ArgumentCaptor<ViewTreeObserver.OnGlobalLayoutListener> layout = ArgumentCaptor.forClass(ViewTreeObserver.OnGlobalLayoutListener.class);
            verify(observer).addOnGlobalLayoutListener(layout.capture());
            when(content.getChildAt(0)).thenReturn(parent);
            layout.getValue().onGlobalLayout();
            assertNotNull(completion.get());
            completion.get().onInitializationComplete(mock(InitializationStatus.class));
            verify(call).resolve();
            verify(observer).removeOnGlobalLayoutListener(layout.getValue());
        }
    }

    @Test
    public void parentTimeoutCanRetryWithoutCachingNull() {
        try (MockedConstruction<Handler> ignored = handlers(); MockedStatic<MobileAds> sdk = mockStatic(MobileAds.class)) {
            AtomicReference<OnInitializationCompleteListener> completion = captureSdk(sdk);
            ViewTreeObserver observer = mock(ViewTreeObserver.class);
            when(observer.isAlive()).thenReturn(true);
            when(content.getViewTreeObserver()).thenReturn(observer);
            when(content.getChildAt(0)).thenReturn(null);
            AdMob plugin = plugin();
            PluginCall first = mock(PluginCall.class);
            plugin.initialize(first);
            timeouts.get(5000L).run();
            verify(first).reject(contains("parent view never appeared"));
            assertNull(completion.get());
            when(content.getChildAt(0)).thenReturn(parent);
            PluginCall retry = mock(PluginCall.class);
            plugin.initialize(retry);
            completion.get().onInitializationComplete(mock(InitializationStatus.class));
            verify(retry).resolve();
        }
    }

    private BannerExecutor banner() {
        return new BannerExecutor(() -> context, () -> activity, (event, data) -> {}, "Test");
    }

    private static void setField(Object object, String name, Object value) throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }

    @Test
    public void hideAfterLoadFailureRejectsWithoutCrashingOrHanging() throws Exception {
        BannerExecutor banner = banner();
        setField(banner, "mAdView", mock(AdView.class));
        setField(banner, "mAdViewLayout", mock(RelativeLayout.class));
        AtomicReference<Runnable> queued = new AtomicReference<>();
        doAnswer(invocation -> { queued.set(invocation.getArgument(0)); return null; })
            .when(activity).runOnUiThread(any());
        PluginCall call = mock(PluginCall.class);
        banner.hideBanner(call);
        setField(banner, "mAdView", null); // Native load failure before queued hide.
        queued.get().run();
        verify(call).reject("Banner is no longer available to hide");
        verify(call, never()).resolve();
    }

    @Test
    public void resumeWithoutAViewCannotReportSuccess() {
        PluginCall call = mock(PluginCall.class);
        banner().resumeBanner(call);
        verify(call).reject("Banner is no longer available to resume");
        verify(call, never()).resolve();
    }

    @Test
    public void removingBannerSettlesAfterUiCleanupAndCanRepeat() throws Exception {
        BannerExecutor banner = banner();
        AdView ad = mock(AdView.class);
        RelativeLayout layout = mock(RelativeLayout.class);
        setField(banner, "mAdView", ad);
        setField(banner, "mAdViewLayout", layout);
        AtomicReference<Runnable> queued = new AtomicReference<>();
        doAnswer(invocation -> { queued.set(invocation.getArgument(0)); return null; })
            .when(activity).runOnUiThread(any());
        PluginCall call = mock(PluginCall.class);
        banner.removeBanner(call);
        verify(call, never()).resolve();
        queued.get().run();
        verify(ad).destroy();
        verify(layout).removeView(ad);
        verify(call).resolve();
        PluginCall repeat = mock(PluginCall.class);
        banner.removeBanner(repeat);
        queued.get().run();
        verify(repeat).resolve();
        verify(ad, times(1)).destroy();
    }

    @Test
    public void positioningUsesMeasuredCoordinatesAndPreservesCapacitorInsets() {
        Bridge fixtureBridge = mock(Bridge.class);
        WebView webView = mock(WebView.class);
        when(fixtureBridge.getWebView()).thenReturn(webView);
        BottomNavigationInsetPlugin plugin = new BottomNavigationInsetPlugin() {
            @Override public AppCompatActivity getActivity() { return activity; }
            @Override public Context getContext() { return context; }
            @Override public Bridge getBridge() { return fixtureBridge; }
        };
        doAnswer(invocation -> { int[] xy = invocation.getArgument(0); xy[1] = 72; return null; })
            .when(webView).getLocationInWindow(any());
        doAnswer(invocation -> { int[] xy = invocation.getArgument(0); xy[1] = 24; return null; })
            .when(parent).getLocationInWindow(any());
        Window window = mock(Window.class);
        View decor = mock(View.class);
        when(activity.getWindow()).thenReturn(window);
        when(window.getDecorView()).thenReturn(decor);
        AdView ad = mock(AdView.class);
        RelativeLayout container = mock(RelativeLayout.class);
        when(parent.getChildCount()).thenReturn(1);
        when(parent.getChildAt(0)).thenReturn(container);
        when(parent.getWidth()).thenReturn(1080);
        when(container.getChildCount()).thenReturn(1);
        when(container.getChildAt(0)).thenReturn(ad);
        when(ad.getParent()).thenReturn(container);
        ViewGroup.MarginLayoutParams params = new ViewGroup.MarginLayoutParams(640, 100);
        when(container.getLayoutParams()).thenReturn(params);
        try (MockedStatic<ViewCompat> insets = mockStatic(ViewCompat.class);
             MockedStatic<TypedValue> pixels = mockStatic(TypedValue.class)) {
            // The local Android jar stubs dp conversion; supply its real result.
            pixels.when(() -> TypedValue.applyDimension(eq(TypedValue.COMPLEX_UNIT_DIP), anyFloat(), any()))
                .thenAnswer(invocation -> invocation.getArgument(1, Float.class) * invocation.getArgument(2, DisplayMetrics.class).density);
            PluginCall geometry = mock(PluginCall.class);
            plugin.getBannerGeometry(geometry);
            ArgumentCaptor<JSObject> result = ArgumentCaptor.forClass(JSObject.class);
            verify(geometry).resolve(result.capture());
            assertEquals(24.0, result.getValue().getDouble("webViewOffsetDp"), 0.0);
            PluginCall position = mock(PluginCall.class);
            when(position.getInt("margin", 0)).thenReturn(90);
            plugin.setBannerPosition(position);
            assertEquals(180, params.topMargin);
            assertEquals(0, params.bottomMargin);
            assertEquals(220, params.leftMargin);
            verify(decor, never()).setOnApplyWindowInsetsListener(any());
            ArgumentCaptor<View.OnApplyWindowInsetsListener> listener = ArgumentCaptor.forClass(View.OnApplyWindowInsetsListener.class);
            verify(container).setOnApplyWindowInsetsListener(listener.capture());
            WindowInsets keyboardInsets = mock(WindowInsets.class);
            assertSame(keyboardInsets, listener.getValue().onApplyWindowInsets(container, keyboardInsets));
            assertEquals(180, params.topMargin); // No stale SDK margin or second status inset.
        } catch (org.json.JSONException error) {
            throw new AssertionError(error);
        }
    }
}
