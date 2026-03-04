package app.vercel.rizzmaster;

import android.content.Intent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {

    @CapacitorPlugin(name = "NativeShare")
    public static class NativeSharePlugin extends Plugin {
        @PluginMethod
        public void share(PluginCall call) {
            try {
                String text = call.getString("text", "");
                String title = call.getString("title", "Share");

                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, text);

                Intent chooser = Intent.createChooser(intent, title);
                // Intents must be started from the Activity context
                getActivity().startActivity(chooser);

                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to share: " + e.getMessage());
            }
        }
    }

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
