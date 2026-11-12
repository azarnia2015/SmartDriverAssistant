package ir.smartdriver.assistant;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_MIC = 101;
    private static final int REQ_SPEECH_LEGACY = 102;

    private static final String XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private WebView web;
    private TextToSpeech tts;

    private SpeechRecognizer sr;
    private boolean srContinuous = false;
    private boolean srActive = false;
    private int srErrors = 0;
    private boolean pendingListen = false;
    private boolean pendingContinuous = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        try {
            w.setStatusBarColor(0xFFF5EFE3);
            w.setNavigationBarColor(0xFFF5EFE3);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                w.getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        } catch (Exception ignored) {
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        web.setBackgroundColor(0xFFF5EFE3);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            request.grant(request.getResources());
                        } catch (Exception ignored) {
                        }
                    }
                });
            }
        });

        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status != TextToSpeech.SUCCESS || tts == null) return;
                Locale fa = new Locale("fa", "IR");
                int r = tts.setLanguage(fa);
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(new Locale("en", "US"));
                }
                tts.setSpeechRate(0.98f);
                tts.setPitch(1.0f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        js("window.__onSpeakDone && window.__onSpeakDone();");
                    }

                    @Override
                    public void onError(String utteranceId) {
                        js("window.__onSpeakDone && window.__onSpeakDone();");
                    }
                });
            }
        });
    }

    /* -------------------- JS helpers -------------------- */
    private void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript(code, null);
            }
        });
    }

    private void jsSpeech(String text, boolean isFinal) {
        final String t = text == null ? "" : text;
        js("window.__onSpeechResult && window.__onSpeechResult(" + JSONObject.quote(t) + "," + isFinal + ");");
    }

    private void jsState(String state, String msg) {
        js("window.__onSpeechState && window.__onSpeechState(" + JSONObject.quote(state) + ","
                + JSONObject.quote(msg == null ? "" : msg) + ");");
    }

    private void toastUi(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /* -------------------- live speech recognition -------------------- */
    private Intent recognizerIntent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fa-IR");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fa-IR");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        // silent-length tuning (hidden keys, set as strings)
        i.putExtra("android.speech.extras.SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS", 1600L);
        i.putExtra("android.speech.extras.SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS", 1400L);
        i.putExtra("android.speech.extras.SPEECH_INPUT_MINIMUM_LENGTH_MILLIS", 500L);
        return i;
    }

    private String firstResult(Bundle b) {
        if (b == null) return "";
        ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (list != null && !list.isEmpty()) return list.get(0);
        return "";
    }

    private void ensureRecognizer() {
        if (sr != null) return;
        sr = SpeechRecognizer.createSpeechRecognizer(this);
        sr.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                jsState("listening", "");
            }

            @Override
            public void onBeginningOfSpeech() {
            }

            @Override
            public void onRmsChanged(float rmsdB) {
            }

            @Override
            public void onBufferReceived(byte[] buffer) {
            }

            @Override
            public void onEndOfSpeech() {
            }

            @Override
            public void onError(int error) {
                srActive = false;
                srErrors++;
                boolean retryable = error == SpeechRecognizer.ERROR_NO_MATCH
                        || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                        || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY;
                if (srContinuous && retryable && srErrors <= 3) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                sr.cancel();
                                sr.startListening(recognizerIntent());
                                srActive = true;
                            } catch (Exception ignored) {
                            }
                        }
                    });
                } else {
                    jsState("error", mapError(error));
                }
            }

            @Override
            public void onResults(Bundle results) {
                srActive = false;
                srErrors = 0;
                jsSpeech(firstResult(results), true);
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                String t = firstResult(partialResults);
                if (!t.isEmpty()) jsSpeech(t, false);
            }

            @Override
            public void onEvent(int eventType, Bundle params) {
            }
        });
    }

    private String mapError(int e) {
        switch (e) {
            case SpeechRecognizer.ERROR_AUDIO: return "audio";
            case SpeechRecognizer.ERROR_CLIENT: return "client";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "permission";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "network";
            case SpeechRecognizer.ERROR_NO_MATCH: return "no-speech";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "busy";
            case SpeechRecognizer.ERROR_SERVER: return "server";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "silence";
            default: return "error";
        }
    }

    private void startListeningInternal(final boolean continuous) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingListen = true;
                    pendingContinuous = continuous;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                    return;
                }
                if (!SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                    jsState("error", "unsupported");
                    return;
                }
                srContinuous = continuous;
                srErrors = 0;
                ensureRecognizer();
                try {
                    sr.cancel();
                } catch (Exception ignored) {
                }
                try {
                    sr.startListening(recognizerIntent());
                    srActive = true;
                    jsState("listening", "");
                } catch (Exception e) {
                    jsState("error", "start-failed");
                }
            }
        });
    }

    private void stopListeningInternal() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                srContinuous = false;
                srActive = false;
                if (sr != null) {
                    try {
                        sr.cancel();
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MIC) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted && pendingListen) {
                startListeningInternal(pendingContinuous);
            } else {
                jsState("error", "permission");
            }
            pendingListen = false;
        }
    }

    /* legacy dialog recognizer (fallback) */
    private void startSpeechLegacy() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingListen = false;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                    return;
                }
                Intent i = recognizerIntent();
                i.putExtra(RecognizerIntent.EXTRA_PROMPT, "گزارش خود را بگویید…");
                try {
                    startActivityForResult(i, REQ_SPEECH_LEGACY);
                } catch (ActivityNotFoundException e) {
                    jsState("error", "unsupported");
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SPEECH_LEGACY) return;
        String text = "";
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (r != null && !r.isEmpty()) text = r.get(0);
        }
        jsSpeech(text, true);
    }

    /* -------------------- files -------------------- */
    private Uri writeDownloads(String name, byte[] bytes, String mime) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new Exception("no uri");
            OutputStream os = getContentResolver().openOutputStream(uri);
            if (os == null) throw new Exception("no stream");
            os.write(bytes);
            os.close();
            return uri;
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists()) dir.mkdirs();
        File f = new File(dir, name);
        FileOutputStream fos = new FileOutputStream(f);
        fos.write(bytes);
        fos.close();
        return null; // file:// sharing is blocked on API 24+; user can attach manually
    }

    private void shareUri(Uri uri, String mime, String subject) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, subject);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(send, "ارسال به مدیر"));
    }

    /* -------------------- JS bridge -------------------- */
    public class Bridge {

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public void startListening(boolean continuous) {
            startListeningInternal(continuous);
        }

        @JavascriptInterface
        public void stopListening() {
            stopListeningInternal();
        }

        @JavascriptInterface
        public void listen() {
            startListeningInternal(false);
        }

        @JavascriptInterface
        public void legacyListen() {
            startSpeechLegacy();
        }

        @JavascriptInterface
        public void speak(final String text) {
            if (text == null || text.isEmpty() || tts == null) return;
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "drv");
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (tts != null) tts.stop();
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_SUBJECT, "گزارش روزانه راننده");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    try {
                        startActivity(Intent.createChooser(i, "ارسال گزارش"));
                    } catch (Exception e) {
                        toastUi("برنامه‌ای برای ارسال پیدا نشد");
                    }
                }
            });
        }

        @JavascriptInterface
        public void whatsapp(final String text) {
            whatsappTo("", text);
        }

        @JavascriptInterface
        public void whatsappTo(final String number, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String url = "https://wa.me/" + (number == null ? "" : number.replaceAll("[^0-9]", ""))
                            + "?text=" + Uri.encode(text);
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    i.setPackage("com.whatsapp");
                    try {
                        startActivity(i);
                    } catch (Exception e) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        } catch (Exception e2) {
                            toastUi("واتساپ نصب نیست");
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            toastUi(msg);
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(Math.max(5, ms), VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(Math.max(5, ms));
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void saveFile(final String name, final String content) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        writeDownloads(name, content.getBytes("UTF-8"), "text/plain");
                        toastUi("فایل در پوشهٔ Downloads ذخیره شد");
                    } catch (Exception e) {
                        toastUi("ذخیره فایل ممکن نشد");
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void saveExcel(final String base64, final String name) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                        final Uri uri = writeDownloads(name, bytes, XLSX_MIME);
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                toastUi("اکسل ساخته شد: " + name);
                                if (uri != null) {
                                    try {
                                        shareUri(uri, XLSX_MIME, name);
                                    } catch (Exception ignored) {
                                    }
                                }
                            }
                        });
                    } catch (Exception e) {
                        toastUi("ساخت فایل اکسل ممکن نشد");
                    }
                }
            }).start();
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.__back && window.__back()) ? '1' : '0'", new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || !value.contains("1")) finish();
            }
        });
    }

    @Override
    protected void onPause() {
        stopListeningInternal();
        if (tts != null) tts.stop();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (sr != null) {
            try {
                sr.destroy();
            } catch (Exception ignored) {
            }
            sr = null;
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
