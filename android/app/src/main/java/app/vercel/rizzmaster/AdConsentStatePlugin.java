package app.vercel.rizzmaster;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.UserMessagingPlatform;

/** Exposes UMP's current permission even when a refresh/form callback failed. */
@CapacitorPlugin(name = "AdConsentState")
public class AdConsentStatePlugin extends Plugin {
    @PluginMethod
    public void getConsentInfo(PluginCall call) {
        ConsentInformation info = UserMessagingPlatform.getConsentInformation(getContext());
        String status;
        switch (info.getConsentStatus()) {
            case ConsentInformation.ConsentStatus.REQUIRED: status = "REQUIRED"; break;
            case ConsentInformation.ConsentStatus.NOT_REQUIRED: status = "NOT_REQUIRED"; break;
            case ConsentInformation.ConsentStatus.OBTAINED: status = "OBTAINED"; break;
            default: status = "UNKNOWN";
        }
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("isConsentFormAvailable", info.isConsentFormAvailable());
        result.put("canRequestAds", info.canRequestAds());
        result.put("privacyOptionsRequirementStatus", info.getPrivacyOptionsRequirementStatus().name());
        call.resolve(result);
    }
}
