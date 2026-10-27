package com.kingwesley.qipage;

import android.content.Intent;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyStore;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only packaged app content receives this bridge. Never load remote documents into its WebView. */
@CapacitorPlugin(name = "QipageStore")
public class QipageStorePlugin extends Plugin {
    private static final String ALIAS = "qipage-local-v1";
    private static final int MAX_BYTES = 10 * 1024 * 1024;
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private final Object storageLock = new Object();

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private AtomicFile file() { return new AtomicFile(new File(getContext().getNoBackupFilesDir(), "qipage.enc")); }

    @PluginMethod
    public void read(PluginCall call) {
        io.execute(() -> {
            synchronized (storageLock) {
                try {
                    JSObject result = new JSObject();
                    if (!file().getBaseFile().exists()) { result.put("value", "{}"); call.resolve(result); return; }
                    byte[] saved = file().readFully();
                    if (saved.length < 29) throw new IllegalStateException("Invalid encrypted storage");
                    byte[] iv = java.util.Arrays.copyOfRange(saved, 0, 12);
                    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                    cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
                    result.put("value", new String(cipher.doFinal(saved, 12, saved.length - 12), java.nio.charset.StandardCharsets.UTF_8));
                    call.resolve(result);
                } catch (Exception error) { call.reject("无法读取手机上的栖页数据，请重启应用后再试。", "STORAGE_READ"); }
            }
        });
    }
    @PluginMethod
    public void write(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > 16 * 1024 * 1024) { call.reject("保存内容过大。", "STORAGE_SIZE"); return; }
        io.execute(() -> {
            synchronized (storageLock) {
                FileOutputStream stream = null;
                AtomicFile target = file();
                try {
                    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                    cipher.init(Cipher.ENCRYPT_MODE, key());
                    byte[] bytes = cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    stream = target.startWrite();
                    stream.write(cipher.getIV()); stream.write(bytes);
                    target.finishWrite(stream); call.resolve();
                } catch (Exception error) {
                    if (stream != null) target.failWrite(stream);
                    call.reject("手机存储写入失败，请检查剩余空间后重试。", "STORAGE_WRITE");
                }
            }
        });
    }
    @PluginMethod
    public void request(PluginCall call) {
        io.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(call.getString("url", ""));
                String host = url.getHost().toLowerCase(java.util.Locale.ROOT);
                if (!url.getProtocol().equals("https") || url.getUserInfo() != null || (url.getPort() != -1 && url.getPort() != 443)
                    || !(host.equals("api.deepseek.com") || host.equals("bing.com") || host.endsWith(".bing.com"))) {
                    call.reject("不支持的远程地址。", "URL_REJECTED"); return;
                }
                String method = call.getString("method", "GET");
                if (!method.equals("GET") && !method.equals("POST")) { call.reject("请求方法不支持。"); return; }
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000); connection.setReadTimeout(45000);
                connection.setInstanceFollowRedirects(false); connection.setRequestMethod(method);
                connection.setRequestProperty("Accept", "application/json, image/jpeg");
                JSObject headers = call.getObject("headers", new JSObject());
                if (host.equals("api.deepseek.com")) {
                    String authorization = headers.optString("Authorization", "");
                    if (!authorization.isEmpty()) connection.setRequestProperty("Authorization", authorization);
                }
                if (method.equals("POST")) {
                    byte[] body = call.getString("body", "{}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    if (body.length > 512 * 1024) { call.reject("请求内容过大。"); return; }
                    connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                    try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body); }
                }
                int status = connection.getResponseCode();
                if (connection.getContentLength() > MAX_BYTES) throw new IllegalStateException("Too large");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                InputStream response = status < 400 ? connection.getInputStream() : connection.getErrorStream();
                if (response != null) try (InputStream input = response) {
                    byte[] chunk = new byte[16384]; int length;
                    while ((length = input.read(chunk)) != -1) {
                        if (bytes.size() + length > MAX_BYTES) throw new IllegalStateException("Too large");
                        bytes.write(chunk, 0, length);
                    }
                }
                JSObject responseHeaders = new JSObject();
                for (Map.Entry<String,List<String>> header : connection.getHeaderFields().entrySet()) {
                    if (header.getKey() != null) responseHeaders.put(header.getKey(), android.text.TextUtils.join(", ", header.getValue()));
                }
                JSObject result = new JSObject(); result.put("status", status); result.put("headers", responseHeaders);
                result.put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)); call.resolve(result);
            } catch (Exception error) { call.reject("网络请求未完成，请检查网络后重试。", "NETWORK"); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }
    @PluginMethod
    public void openUrl(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null) {
            call.reject("网址无效。"); return;
        }
        try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); call.resolve(); }
        catch (Exception error) { call.reject("未找到可打开网址的浏览器。"); }
    }
    @Override protected void handleOnDestroy() { io.shutdown(); }
}
