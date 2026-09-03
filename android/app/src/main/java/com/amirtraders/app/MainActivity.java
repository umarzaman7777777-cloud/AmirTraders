package com.amirtraders.app;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // FIX (2026-09-02, user report: content still drawing under the status
    // bar / notification pull-down area on a real phone, even after the
    // CSS-only fix in index.html — the app targets SDK 36, and Android 15+
    // makes edge-to-edge display MANDATORY at the OS level, not opt-in.
    // The CSS fix (env(safe-area-inset-top) padding on the topbar and lock
    // screen) depends on the WebView correctly relaying real window insets
    // into that CSS environment — a relay that has genuine compatibility
    // gaps across different Android WebView/Capacitor version combinations,
    // and evidently didn't report a real value on this device, so that
    // padding was silently resolving to its 0px fallback the whole time.
    // This is the reliable fix instead: read the actual system bar insets
    // directly through Android's own API and pad the WebView's container
    // view with them natively — this does not depend on WebView-to-CSS
    // inset relay working at all, so it can't have the same failure mode.
    // The existing CSS safe-area padding in index.html is left in place
    // as a harmless secondary safety net: once this native fix correctly
    // positions the WebView below the status bar, the CSS env() values
    // correctly resolve back to 0 from the WebView's own now-safe
    // viewport, so there's no double-padding — either this fixes it
    // alone, or the two layers agree and nothing is added twice.
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
