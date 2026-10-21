package de.phill.pixelleiste;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
