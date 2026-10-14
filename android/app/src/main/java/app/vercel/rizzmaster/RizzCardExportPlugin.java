package app.vercel.rizzmaster;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-selected PNG export through Android's document picker, without storage permissions. */
@CapacitorPlugin(name = "RizzCardExport")
public class RizzCardExportPlugin extends Plugin {
    private static final long MAX_PNG_BYTES = 10 * 1024 * 1024;
    private static final byte[] PNG_SIGNATURE = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
    private final AtomicBoolean saving = new AtomicBoolean(false);

    static File resolveSource(File cacheDir, String uri) throws IOException {
        try {
            File source = new File(new URI(uri)).getCanonicalFile();
            File allowedDir = new File(cacheDir, "rizz-share").getCanonicalFile();
            if (!allowedDir.equals(source.getParentFile()) || !source.isFile() ||
                !source.getName().matches("rizzmaster-[A-Za-z0-9-]+\\.png") ||
                source.length() < 8 || source.length() > MAX_PNG_BYTES) {
                throw new IOException("Invalid card image");
            }
            try (FileInputStream input = new FileInputStream(source)) {
                byte[] signature = new byte[8];
                if (input.read(signature) != 8 || !Arrays.equals(signature, PNG_SIGNATURE)) {
                    throw new IOException("Invalid PNG image");
                }
            }
            return source;
        } catch (IllegalArgumentException | java.net.URISyntaxException error) {
            throw new IOException("Invalid card file URI", error);
        }
    }

    @PluginMethod
    public void savePng(PluginCall call) {
        if (!saving.compareAndSet(false, true)) {
            call.reject("A card export is already in progress");
            return;
        }
        try {
            resolveSource(getContext().getCacheDir(), call.getString("uri", ""));
            String filename = call.getString("filename", "rizzmaster-rizz-card.png");
            if (!filename.matches("rizzmaster-[A-Za-z0-9-]+\\.png")) {
                throw new IOException("Invalid export filename");
            }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/png");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            getActivity().runOnUiThread(() -> {
                try { startActivityForResult(call, intent, "saveResult"); }
                catch (Exception error) {
                    saving.set(false);
                    call.reject("Could not open the save picker", error);
                }
            });
        } catch (Exception error) {
            saving.set(false);
            call.reject("Could not prepare the card for saving", error);
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) { saving.set(false); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            saving.set(false);
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        Uri destination = result.getData().getData();
        execute(() -> {
            try {
                File source = resolveSource(getContext().getCacheDir(), call.getString("uri", ""));
                try (FileInputStream input = new FileInputStream(source);
                     OutputStream output = getContext().getContentResolver().openOutputStream(destination, "w")) {
                    if (output == null) throw new IOException("Save location unavailable");
                    byte[] buffer = new byte[16384];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.flush();
                }
                JSObject response = new JSObject();
                response.put("saved", true);
                call.resolve(response);
            } catch (Exception error) { call.reject("Could not save the PNG", error); }
            finally { saving.set(false); }
        });
    }
}
