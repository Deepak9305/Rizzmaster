package app.vercel.rizzmaster;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.community.admob.AdMob;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AdMob.class);
        registerPlugin(AdsStartupPlugin.class);
        registerPlugin(AdConsentStatePlugin.class);
        registerPlugin(BottomNavigationInsetPlugin.class);
        registerPlugin(RizzCardExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
