package app.vercel.rizzmaster;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.AdSize;

/** Maps the WebView's banner slot to the native AdMob view without guessed offsets. */
@CapacitorPlugin(name = "BottomNavigationInset")
public class BottomNavigationInsetPlugin extends Plugin {
    @PluginMethod
    public void getBottomInset(PluginCall call) {
        getInset(call, WindowInsetsCompat.Type.navigationBars(), false);
    }

    @PluginMethod
    public void getTopInset(PluginCall call) {
        getInset(call, WindowInsetsCompat.Type.statusBars(), true);
    }

    private void getInset(PluginCall call, int type, boolean top) {
        runOnUiThread(call, () -> {
            JSObject result = new JSObject();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            int pixels = insets == null ? 0 : (top ? insets.getInsets(type).top : insets.getInsets(type).bottom);
            float density = getContext().getResources().getDisplayMetrics().density;
            result.put("inset", Math.round(pixels / density));
            call.resolve(result);
        });
    }

    private ViewGroup getBannerParent() {
        ViewGroup content = getActivity().findViewById(android.R.id.content);
        if (content == null || content.getChildCount() == 0 || !(content.getChildAt(0) instanceof ViewGroup)) return null;
        return (ViewGroup) content.getChildAt(0);
    }

    private void runOnUiThread(PluginCall call, Runnable action) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Banner activity is unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                if (activity != getActivity() || activity.isFinishing() || activity.isDestroyed()) {
                    call.reject("Banner activity closed before layout");
                    return;
                }
                action.run();
            } catch (Exception ex) {
                call.reject("Banner layout failed", ex);
            }
        });
    }

    private AdView getBannerView(ViewGroup parent) {
        for (int i = 0; parent != null && i < parent.getChildCount(); i++) {
            View child = parent.getChildAt(i);
            if (!(child instanceof ViewGroup)) continue;
            ViewGroup container = (ViewGroup) child;
            for (int j = 0; j < container.getChildCount(); j++) {
                if (container.getChildAt(j) instanceof AdView) return (AdView) container.getChildAt(j);
            }
        }
        return null;
    }

    @PluginMethod
    public void getBannerGeometry(PluginCall call) {
        runOnUiThread(call, () -> {
            ViewGroup parent = getBannerParent();
            if (parent == null) {
                call.reject("Banner parent is not laid out yet");
                return;
            }
            float density = getContext().getResources().getDisplayMetrics().density;
            int[] webViewLocation = new int[2];
            int[] parentLocation = new int[2];
            getBridge().getWebView().getLocationInWindow(webViewLocation);
            parent.getLocationInWindow(parentLocation);
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            int bottomPx = insets == null ? 0 : insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            JSObject result = new JSObject();
            result.put("density", density);
            // Capacitor owns safe areas. Map actual origins without assuming
            // that a particular Android version adds an extra status inset.
            result.put("webViewOffsetDp", (webViewLocation[1] - parentLocation[1]) / density);
            result.put("bottomInsetDp", bottomPx / density);
            // Reserve the supported compact size before requesting the ad.
            AdView adView = getBannerView(parent);
            AdSize size = AdSize.BANNER;
            result.put("widthDp", size.getWidth());
            result.put("heightDp", size.getHeight());
            result.put("bannerVisible", adView != null && adView.isShown());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void setBannerPosition(PluginCall call) {
        final int margin = Math.max(0, call.getInt("margin", 0));
        runOnUiThread(call, () -> {
            ViewGroup parent = getBannerParent();
            AdView adView = getBannerView(parent);
            boolean updated = false;
            if (adView != null && adView.getParent() instanceof ViewGroup) {
                ViewGroup container = (ViewGroup) adView.getParent();
                if (!(container.getLayoutParams() instanceof ViewGroup.MarginLayoutParams)) {
                    call.reject("Banner container does not support margins");
                    return;
                }
                ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) container.getLayoutParams();
                float density = getContext().getResources().getDisplayMetrics().density;
                params.topMargin = Math.round(margin * density);
                params.bottomMargin = 0;
                // A fixed-size ad only needs recentering after a width change,
                // so reuse it rather than making a new request on rotation.
                int sideMargin = Math.max(0, (parent.getWidth() - AdSize.BANNER.getWidthInPixels(getContext())) / 2);
                params.leftMargin = sideMargin;
                params.rightMargin = sideMargin;
                container.setLayoutParams(params);
                // The measured DOM slot already includes safe-area padding.
                // Override only the ad container's default inset adjustment;
                // never replace Capacitor's decor-view listener. JS remeasures
                // this slot on keyboard/viewport changes and rotation.
                container.setOnApplyWindowInsetsListener((view, insets) -> insets);
                updated = true;
            }
            JSObject result = new JSObject();
            result.put("updated", updated);
            call.resolve(result);
        });
    }
}
