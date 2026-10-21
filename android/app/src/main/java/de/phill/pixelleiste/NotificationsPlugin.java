package de.phill.pixelleiste;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Forwards notifications from {@link NotificationService} to the web app ("notification" event). */
@CapacitorPlugin(name = "PixelNotifications")
public class NotificationsPlugin extends Plugin {
    private static NotificationsPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    static void emit(String app, String appName, String title, String text) {
        NotificationsPlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("app", app);
        data.put("appName", appName);
        data.put("title", title);
        data.put("text", text);
        p.notifyListeners("notification", data, false);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        ComponentName me = new ComponentName(getContext(), NotificationService.class);
        JSObject ret = new JSObject();
        ret.put("enabled", !TextUtils.isEmpty(flat) && flat.contains(me.flattenToString()));
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
