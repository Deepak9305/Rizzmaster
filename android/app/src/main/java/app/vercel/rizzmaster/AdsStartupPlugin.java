package app.vercel.rizzmaster;

import android.app.Activity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.MobileAds;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

/** App-owned startup only. Banners and rewards use the unchanged community plugin. */
@CapacitorPlugin(name = "AdsStartup")
public class AdsStartupPlugin extends Plugin {
    private boolean refreshing, refreshed, formOpen, sdkStarting, sdkReady;
    private String error;

    private ConsentInformation consent() {
        return UserMessagingPlatform.getConsentInformation(getContext());
    }

    private JSObject state() {
        JSObject result = new JSObject();
        result.put("canRequestAds", consent().canRequestAds());
        result.put("privacyOptionsRequired", consent().getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        result.put("sdkReady", sdkReady);
        result.put("busy", refreshing || formOpen || sdkStarting);
        result.put("formOpen", formOpen);
        result.put("error", error);
        return result;
    }

    private void publish() { notifyListeners("stateChanged", state(), true); }

    private void initializeIfPermitted() {
        if (!consent().canRequestAds() || sdkReady || sdkStarting) return;
        sdkStarting = true;
        try {
            MobileAds.initialize(getContext(), status -> {
                Activity current = getActivity();
                if (current == null || current.isFinishing() || current.isDestroyed()) {
                    sdkStarting = false;
                    sdkReady = true;
                    return;
                }
                current.runOnUiThread(() -> {
                    sdkStarting = false;
                    sdkReady = true;
                    publish();
                });
            });
        } catch (Exception ex) {
            sdkStarting = false;
            error = ex.getMessage();
            publish();
        }
    }

    private void onUi(PluginCall call, Runnable action) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Ads activity is unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            try { action.run(); } catch (Exception ex) { call.reject("Ads startup failed", ex); }
        });
    }

    @PluginMethod public void getState(PluginCall call) { onUi(call, () -> call.resolve(state())); }

    @PluginMethod public void start(PluginCall call) {
        onUi(call, () -> {
            if (!refreshing && !formOpen && !refreshed) {
                refreshing = true;
                error = null;
                consent().requestConsentInfoUpdate(getActivity(), new ConsentRequestParameters.Builder().build(), () -> {
                    refreshing = false;
                    refreshed = true;
                    formOpen = true;
                    publish();
                    try {
                        UserMessagingPlatform.loadAndShowConsentFormIfRequired(getActivity(), failure -> {
                            formOpen = false;
                            error = failure == null ? null : failure.getMessage();
                            initializeIfPermitted();
                            publish();
                        });
                    } catch (Exception ex) {
                        formOpen = false;
                        refreshed = false;
                        error = ex.getMessage();
                        publish();
                    }
                }, failure -> {
                    refreshing = false;
                    error = failure.getMessage();
                    initializeIfPermitted();
                    publish();
                });
                // Google's returning-user path: update is requested before reading permission.
                initializeIfPermitted();
            } else {
                initializeIfPermitted();
            }
            call.resolve(state());
        });
    }

    @PluginMethod public void showPrivacyOptions(PluginCall call) {
        onUi(call, () -> {
            if (refreshing || formOpen) { call.resolve(state()); return; }
            formOpen = true;
            publish();
            try {
                UserMessagingPlatform.showPrivacyOptionsForm(getActivity(), failure -> {
                    formOpen = false;
                    error = failure == null ? null : failure.getMessage();
                    initializeIfPermitted();
                    publish();
                });
            } catch (Exception ex) {
                formOpen = false;
                error = ex.getMessage();
                publish();
            }
            // Return state immediately; stateChanged signals dismissal, even after JS wait expiry.
            call.resolve(state());
        });
    }
}
