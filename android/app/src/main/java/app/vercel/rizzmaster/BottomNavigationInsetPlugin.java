package app.vercel.rizzmaster;

import android.os.Build;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Reports the visible Android navigation-bar height in dp for banner placement. */
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
}
