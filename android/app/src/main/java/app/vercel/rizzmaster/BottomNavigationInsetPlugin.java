package app.vercel.rizzmaster;

import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
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
        JSObject result = new JSObject();
        // The installed AdMob plugin already adds this inset on Android 15+.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            result.put("inset", 0);
            call.resolve(result);
            return;
        }

        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
        int bottomPx = 0;
        if (insets != null) {
            Insets navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            bottomPx = navigation.bottom;
        }
        float density = getContext().getResources().getDisplayMetrics().density;
        result.put("inset", Math.round(bottomPx / density));
        call.resolve(result);
    }

    @PluginMethod
    public void getTopInset(PluginCall call) {
        JSObject result = new JSObject();
        // The installed AdMob plugin already adds this inset on Android 15+.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            result.put("inset", 0);
            call.resolve(result);
            return;
        }

        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
        int topPx = 0;
        if (insets != null) {
            Insets status = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            topPx = status.top;
        }
        float density = getContext().getResources().getDisplayMetrics().density;
        result.put("inset", Math.round(topPx / density));
        call.resolve(result);
    }

    private ViewGroup getBannerParent() {
        ViewGroup content = getActivity().findViewById(android.R.id.content);
        if (content == null || content.getChildCount() == 0 || !(content.getChildAt(0) instanceof ViewGroup)) return null;
        return (ViewGroup) content.getChildAt(0);
    }

    private int getAdMobTopInset() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return 0;
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
        return insets == null ? 0 : insets.getSystemWindowInsetTop();
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
        getActivity().runOnUiThread(() -> {
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
            // AdMob 8 adds its own status-bar inset on API 35+. Account for it
            // once, relative to the actual WebView and native parent origins.
            result.put("webViewOffsetDp", (webViewLocation[1] - parentLocation[1] - getAdMobTopInset()) / density);
            result.put("bottomInsetDp", bottomPx / density);
            // Match the community AdMob plugin's adaptive size calculation,
            // before requesting the ad so loading cannot displace the form.
            int widthDp = (int) (getContext().getResources().getDisplayMetrics().widthPixels / density);
            AdView adView = getBannerView(parent);
            AdSize cachedSize = adView == null ? null : adView.getAdSize();
            // A keyboard may change available height, but an already loaded
            // banner keeps its size until the window width actually changes.
            AdSize size = cachedSize != null && cachedSize.getWidth() == widthDp
                ? cachedSize
                : AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(getContext(), widthDp);
            result.put("widthDp", size.getWidth());
            result.put("heightDp", size.getHeight());
            result.put("bannerVisible", adView != null && adView.isShown());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void setBannerPosition(PluginCall call) {
        final int margin = Math.max(0, call.getInt("margin", 0));
        getActivity().runOnUiThread(() -> {
            ViewGroup parent = getBannerParent();
            AdView adView = getBannerView(parent);
            boolean updated = false;
            if (adView != null && adView.getParent() instanceof ViewGroup) {
                ViewGroup container = (ViewGroup) adView.getParent();
                ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) container.getLayoutParams();
                float density = getContext().getResources().getDisplayMetrics().density;
                params.topMargin = Math.round(margin * density) + getAdMobTopInset();
                container.setLayoutParams(params);
                updated = true;
            }
            JSObject result = new JSObject();
            result.put("updated", updated);
            call.resolve(result);
        });
    }
}
