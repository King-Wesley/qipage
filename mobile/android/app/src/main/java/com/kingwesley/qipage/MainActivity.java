package com.kingwesley.qipage;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QipageStorePlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (getBridge() == null) { moveTaskToBack(true); return; }
                getBridge().getWebView().evaluateJavascript("Boolean(document.querySelector('dialog[open]'))", result -> {
                    if ("true".equals(result)) getBridge().getWebView().evaluateJavascript("document.querySelector('dialog[open]').close()", null);
                    else moveTaskToBack(true);
                });
            }
        });
    }
}
