package com.bpstudio.mih;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Naver mobile search as a logged-out visitor sees it (Owner 2026-10-25).
 *
 * The dashboard is a PWA and Naver answers framed loads with X-Frame-Options: DENY, so the real result page can only
 * be shown by a native WebView. This activity runs in its own process (":secret") with its own WebView data
 * directory, so it never sees the Chrome login, and it wipes cookies/storage/cache on every open and close —
 * every search starts as a brand-new visitor, like an incognito tab.
 *
 * Opened with mihsecret://search?q=<keyword>[&post=<blog post url>][&s=blog][&l=<json [[keyword, post], ...]>&i=<index>]
 * from the dashboard keyword links. Without a keyword it hands over to the dashboard, so the phone only ever shows one
 * MIH app. With l/i (the day's keyword list and where this one sits in it) the card gets ◀ n/N ▶ at the bottom, so the
 * Owner steps through the keywords without closing the popup (Owner 2026-10-27).
 *
 * The 모바일/PC switch shows either Naver surface (PC = search.naver.com with a desktop browser identity, zoomed out to
 * the whole page), and 캡처 복사 puts what the card shows on the clipboard as a PNG (Owner 2026-10-25).
 */
public class SecretActivity extends Activity {

    /** MIH blogs (lib/daily-report.ts REPORT_AGENCIES + the old speaker id). Their results get highlighted. */
    private static final String[] MIH_BLOGS = {"mih_agency", "mih_casting", "gdfdhzgfgfhgdj", "kyh620303", "mih_speaker"};
    private static final Pattern POST = Pattern.compile("blog\\.naver\\.com/([A-Za-z0-9_-]+)/(\\d+)");
    private static final int BRAND = Color.parseColor("#1565C0");
    /** Naver serves the PC result page only to desktop browsers. */
    private static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

    private static boolean dataDirSet;

    private WebView web;
    private EditText box;
    private TextView totalTab;
    private TextView blogTab;
    private TextView mobileTab;
    private TextView pcTab;
    private ProgressBar progress;
    private LinearLayout sheet;
    private String query = "";
    private String postKey = "";
    private String highlightJs;
    private boolean blogSurface;
    /** Kept across searches in this window: once the Owner picks PC, the next keyword opens on PC too. */
    private boolean pc;
    /** The dashboard's keyword list ({keyword, post url}) and the one shown now; empty when opened for one keyword. */
    private final List<String[]> items = new ArrayList<>();
    private int index = -1;
    private LinearLayout nav;
    private TextView prevBtn;
    private TextView nextBtn;
    private TextView counter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must run before the first WebView of this process: gives the secret viewer its own cookie jar and storage.
        if (!dataDirSet) {
            try {
                WebView.setDataDirectorySuffix("secret");
            } catch (IllegalStateException ignored) {
                // Already initialised in this process; the wipe below still clears it.
            }
            dataDirSet = true;
        }
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        readIntent(getIntent());
        if (query.isEmpty()) {
            showDashboard();
            return;
        }
        buildUi();
        open();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readIntent(intent);
        if (query.isEmpty()) {
            showDashboard();
            return;
        }
        open();
    }

    /**
     * One app, not two (Owner 2026-10-25): the secret viewer is only a window of the dashboard, opened from a keyword.
     * Anything that reaches it without a keyword — the v1 "MIH 시크릿" home-screen icon, which pointed straight at this
     * activity and survives the update on Samsung launchers, or its old long-press shortcut — gets the dashboard instead.
     */
    private void showDashboard() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(launch);
        }
        finish();
    }

    @Override
    protected void onDestroy() {
        wipe();
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            finish();
        }
    }

    private void readIntent(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        query = "";
        postKey = "";
        blogSurface = false;
        items.clear();
        index = -1;
        if (uri == null) return;
        String q = uri.getQueryParameter("q");
        query = q == null ? "" : q.trim();
        postKey = postKeyOf(uri.getQueryParameter("post"));
        blogSurface = "blog".equals(uri.getQueryParameter("s"));
        readList(uri);
    }

    /** l = JSON [[keyword, post url], ...], i = position of q in it. Anything malformed just means no ◀ ▶. */
    private void readList(Uri uri) {
        items.clear();
        index = -1;
        String l = uri.getQueryParameter("l");
        if (l == null || l.isEmpty() || query.isEmpty()) return;
        try {
            JSONArray arr = new JSONArray(l);
            for (int k = 0; k < arr.length(); k++) {
                JSONArray it = arr.getJSONArray(k);
                String kw = it.optString(0, "").trim();
                if (kw.isEmpty()) continue;
                items.add(new String[]{kw, it.optString(1, "")});
            }
            int i = -1;
            try {
                i = Integer.parseInt(uri.getQueryParameter("i"));
            } catch (Exception ignored) {
                // Missing index: found by keyword below.
            }
            if (i >= 0 && i < items.size() && items.get(i)[0].equals(query)) {
                index = i;
            } else {
                for (int k = 0; k < items.size(); k++) {
                    if (items.get(k)[0].equals(query)) {
                        index = k;
                        break;
                    }
                }
            }
        } catch (Exception e) {
            items.clear();
        }
        if (index < 0 || items.size() < 2) {
            items.clear();
            index = -1;
        }
    }

    private static String postKeyOf(String post) {
        if (post == null) return "";
        Matcher m = POST.matcher(post);
        return m.find() ? m.group(1).toLowerCase() + "/" + m.group(2) : "";
    }

    /** ◀ ▶: the neighbouring keyword of the dashboard list in this same popup, keeping 통합/블로그 and 모바일/PC. */
    private void step(int delta) {
        int to = index + delta;
        if (items.isEmpty() || to < 0 || to >= items.size()) return;
        index = to;
        query = items.get(to)[0];
        postKey = postKeyOf(items.get(to)[1]);
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(box.getWindowToken(), 0);
        box.clearFocus();
        open();
    }

    private void paintNav() {
        if (nav == null) return;
        if (items.isEmpty()) {
            nav.setVisibility(View.GONE);
            return;
        }
        nav.setVisibility(View.VISIBLE);
        counter.setText((index + 1) + " / " + items.size());
        paintStep(prevBtn, index > 0);
        paintStep(nextBtn, index < items.size() - 1);
    }

    private void paintStep(TextView t, boolean enabled) {
        t.setEnabled(enabled);
        t.setTextColor(enabled ? Color.WHITE : Color.parseColor("#9AA8BA"));
        t.setBackground(round(enabled ? BRAND : Color.parseColor("#E3E9F2"), dp(20)));
    }

    /** Fresh visitor for every search: no cookies, no storage, no cache, no history. */
    private void wipe() {
        CookieManager cookies = CookieManager.getInstance();
        cookies.removeAllCookies(null);
        cookies.flush();
        WebStorage.getInstance().deleteAllData();
        if (web != null) {
            web.clearCache(true);
            web.clearHistory();
            web.clearFormData();
        }
    }

    private void open() {
        box.setText(query);
        paintTabs();
        paintNav();
        if (query.isEmpty()) {
            web.loadUrl("about:blank");
            box.requestFocus();
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            box.post(() -> imm.showSoftInput(box, InputMethodManager.SHOW_IMPLICIT));
            return;
        }
        wipe();
        applySurface();
        web.loadUrl(searchUrl(query, blogSurface, pc));
        web.postDelayed(() -> web.clearHistory(), 1500);
    }

    /** Mobile: same URLs as lib/naver-search/blog-results.ts mobileSearchUrl(). PC: the matching search.naver.com tabs. */
    static String searchUrl(String q, boolean blog, boolean pc) {
        String enc;
        try {
            enc = URLEncoder.encode(q, "UTF-8");
        } catch (Exception e) {
            enc = Uri.encode(q);
        }
        if (pc) {
            return blog
                    ? "https://search.naver.com/search.naver?ssc=tab.blog.all&query=" + enc
                    : "https://search.naver.com/search.naver?where=nexearch&ssc=tab.nx.all&query=" + enc;
        }
        return blog
                ? "https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query=" + enc
                : "https://m.search.naver.com/search.naver?where=m&ssc=tab.m.all&query=" + enc;
    }

    /** PC: desktop identity and a wide layout viewport zoomed out to the page width; pinch to zoom in. */
    private void applySurface() {
        WebSettings s = web.getSettings();
        s.setUserAgentString(pc ? DESKTOP_UA : null);
        s.setUseWideViewPort(pc);
        s.setLoadWithOverviewMode(pc);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    /**
     * Popup over the dashboard (Owner 2026-10-25: "open it like a modal right there"). The window is translucent, so
     * the dashboard stays visible, dimmed, around a rounded card; tapping the dim area, ✕ or back closes it.
     */
    private void buildUi() {
        FrameLayout scrim = new FrameLayout(this);
        scrim.setFitsSystemWindows(true);
        scrim.setBackgroundColor(Color.parseColor("#80000000"));
        scrim.setOnClickListener(v -> finish());

        LinearLayout root = new LinearLayout(this);
        sheet = root;
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackground(round(Color.WHITE, dp(16)));
        root.setClipToOutline(true);
        root.setClickable(true);
        scrim.addView(root, sheetParams());

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BRAND);
        bar.setPadding(dp(4), dp(6), dp(8), dp(6));

        TextView close = new TextView(this);
        close.setText("✕");
        close.setTextColor(Color.WHITE);
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("닫기");
        close.setOnClickListener(v -> finish());
        bar.addView(close, new LinearLayout.LayoutParams(dp(40), dp(40)));

        TextView badge = new TextView(this);
        badge.setText("시크릿");
        badge.setTextColor(BRAND);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setPadding(dp(6), dp(2), dp(6), dp(2));
        badge.setBackground(round(Color.WHITE, dp(4)));
        bar.addView(badge);

        box = new EditText(this);
        box.setSingleLine(true);
        box.setHint("검색어");
        box.setTextColor(Color.WHITE);
        box.setHintTextColor(Color.parseColor("#B3FFFFFF"));
        box.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        box.setBackground(null);
        box.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        box.setPadding(dp(8), 0, dp(4), 0);
        box.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                    && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId != EditorInfo.IME_ACTION_SEARCH && !enter) return false;
            String q = box.getText().toString().trim();
            if (q.isEmpty()) return true;
            query = q;
            postKey = "";
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            imm.hideSoftInputFromWindow(box.getWindowToken(), 0);
            box.clearFocus();
            open();
            return true;
        });
        bar.addView(box, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        totalTab = tab("통합", false);
        blogTab = tab("블로그", true);
        bar.addView(totalTab);
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        gap.leftMargin = dp(4);
        bar.addView(blogTab, gap);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout tools = new LinearLayout(this);
        tools.setOrientation(LinearLayout.HORIZONTAL);
        tools.setGravity(Gravity.CENTER_VERTICAL);
        tools.setBackgroundColor(Color.parseColor("#F1F5FB"));
        tools.setPadding(dp(10), dp(6), dp(10), dp(6));
        mobileTab = surface("모바일", false);
        pcTab = surface("PC", true);
        tools.addView(mobileTab);
        LinearLayout.LayoutParams pcGap = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        pcGap.leftMargin = dp(4);
        tools.addView(pcTab, pcGap);
        tools.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        TextView shot = new TextView(this);
        shot.setText("캡처 복사");
        shot.setTextColor(Color.WHITE);
        shot.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        shot.setTypeface(Typeface.DEFAULT_BOLD);
        shot.setPadding(dp(12), dp(5), dp(12), dp(5));
        shot.setBackground(round(BRAND, dp(14)));
        shot.setContentDescription("화면을 캡처해 클립보드에 복사");
        shot.setOnClickListener(v -> capture());
        tools.addView(shot);
        root.addView(tools, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(false);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                progress.setVisibility(p >= 100 ? View.INVISIBLE : View.VISIBLE);
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // ◀ n/N ▶ at the bottom of the card, where the thumb is (Owner 2026-10-27: move on without closing).
        nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        nav.setBackgroundColor(Color.parseColor("#F1F5FB"));
        nav.setPadding(dp(10), dp(8), dp(10), dp(8));
        prevBtn = stepButton("◀ 이전", -1);
        nextBtn = stepButton("다음 ▶", 1);
        counter = new TextView(this);
        counter.setTextColor(Color.parseColor("#334155"));
        counter.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        counter.setTypeface(Typeface.DEFAULT_BOLD);
        counter.setGravity(Gravity.CENTER);
        nav.addView(prevBtn, new LinearLayout.LayoutParams(0, dp(44), 1f));
        nav.addView(counter, new LinearLayout.LayoutParams(dp(72), ViewGroup.LayoutParams.WRAP_CONTENT));
        nav.addView(nextBtn, new LinearLayout.LayoutParams(0, dp(44), 1f));
        nav.setVisibility(View.GONE);
        root.addView(nav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(scrim);
    }

    /** Card size: a little inset from the screen edges, and no wider than a phone page on an unfolded Fold or tablet. */
    private FrameLayout.LayoutParams sheetParams() {
        float widthDp = getResources().getConfiguration().screenWidthDp;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                widthDp > 640 ? dp(600) : ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM);
        lp.setMargins(dp(10), dp(36), dp(10), dp(10));
        return lp;
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Folding/unfolding does not recreate the activity (configChanges), so resize the card here.
        if (sheet != null) sheet.setLayoutParams(sheetParams());
    }

    private TextView stepButton(String label, int delta) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        t.setContentDescription(delta < 0 ? "이전 키워드" : "다음 키워드");
        t.setOnClickListener(v -> step(delta));
        return t;
    }

    private TextView tab(String label, boolean blog) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setPadding(dp(10), dp(5), dp(10), dp(5));
        t.setOnClickListener(v -> {
            if (blogSurface == blog) return;
            blogSurface = blog;
            String q = box.getText().toString().trim();
            if (!q.isEmpty()) query = q;
            open();
        });
        return t;
    }

    private void paintTabs() {
        paintTab(totalTab, !blogSurface);
        paintTab(blogTab, blogSurface);
        paintSurface(mobileTab, !pc);
        paintSurface(pcTab, pc);
    }

    private TextView surface(String label, boolean wantPc) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setPadding(dp(12), dp(5), dp(12), dp(5));
        t.setOnClickListener(v -> {
            if (pc == wantPc) return;
            pc = wantPc;
            String q = box.getText().toString().trim();
            if (!q.isEmpty()) query = q;
            open();
        });
        return t;
    }

    private void paintSurface(TextView t, boolean on) {
        t.setTextColor(on ? Color.WHITE : BRAND);
        t.setTypeface(on ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        GradientDrawable bg = round(on ? BRAND : Color.WHITE, dp(14));
        if (!on) bg.setStroke(dp(1), Color.parseColor("#B0C4DE"));
        t.setBackground(bg);
    }

    /**
     * Puts what the card shows (the Naver page as it is scrolled, highlights included) on the clipboard as a PNG.
     * PixelCopy reads the window's real pixels, so the hardware-drawn WebView comes out exactly as on screen.
     */
    private void capture() {
        int w = web.getWidth(), h = web.getHeight();
        if (w == 0 || h == 0) return;
        int[] at = new int[2];
        web.getLocationInWindow(at);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Rect area = new Rect(at[0], at[1], at[0] + w, at[1] + h);
        PixelCopy.request(getWindow(), area, bmp, result -> {
            if (result != PixelCopy.SUCCESS) {
                bmp.recycle();
                Toast.makeText(this, "캡처하지 못했어요", Toast.LENGTH_SHORT).show();
                return;
            }
            new Thread(() -> {
                Uri uri = save(bmp);
                runOnUiThread(() -> copy(uri));
            }).start();
        }, new Handler(Looper.getMainLooper()));
    }

    /** Writes the PNG under cache/captures (served by the FileProvider), keeping only the latest few. */
    private Uri save(Bitmap bmp) {
        try {
            File dir = new File(getCacheDir(), "captures");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            File[] old = dir.listFiles();
            if (old != null) {
                java.util.Arrays.sort(old, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                for (int i = 4; i < old.length; i++) old[i].delete();
            }
            File f = new File(dir, "mih-search-" + System.currentTimeMillis() + ".png");
            try (FileOutputStream out = new FileOutputStream(f)) {
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            }
            return FileProvider.getUriForFile(this, getPackageName() + ".captures", f);
        } catch (Exception e) {
            return null;
        } finally {
            bmp.recycle();
        }
    }

    private void copy(Uri uri) {
        if (uri == null) {
            Toast.makeText(this, "캡처를 저장하지 못했어요", Toast.LENGTH_SHORT).show();
            return;
        }
        ClipboardManager clip = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clip.setPrimaryClip(ClipData.newUri(getContentResolver(), "MIH 검색 캡처", uri));
        // Android 13+ shows its own clipboard preview; older versions get a toast.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            Toast.makeText(this, "캡처를 클립보드에 복사했어요", Toast.LENGTH_SHORT).show();
        }
    }

    private void paintTab(TextView t, boolean on) {
        t.setTextColor(on ? BRAND : Color.WHITE);
        t.setTypeface(on ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        GradientDrawable bg = round(on ? Color.WHITE : Color.TRANSPARENT, dp(14));
        if (!on) bg.setStroke(dp(1), Color.parseColor("#80FFFFFF"));
        t.setBackground(bg);
    }

    private static GradientDrawable round(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (url.startsWith("http://") || url.startsWith("https://")) return false;
            // App links (intent:, naversearchapp:, ...) would leave the secret viewer and land in the logged-in
            // Naver app. Follow the web fallback when there is one, otherwise stay put.
            if (url.startsWith("intent:")) {
                try {
                    String fallback = Intent.parseUri(url, Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url");
                    if (!TextUtils.isEmpty(fallback) && fallback.startsWith("http")) view.loadUrl(fallback);
                } catch (Exception ignored) {
                    // Malformed intent link: ignore.
                }
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (url != null && url.contains("search.naver.com")) {
                String js = highlightScript();
                if (!js.isEmpty()) view.evaluateJavascript(js, null);
            }
        }
    }

    /**
     * Highlights MIH blog results on the Naver page — the script lives in assets/highlight.js (tested against the
     * real page with Playwright) and is called with {blogs, post}.
     */
    private String highlightScript() {
        if (highlightJs == null) {
            try (InputStream in = getAssets().open("highlight.js")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                highlightJs = out.toString("UTF-8");
            } catch (Exception e) {
                highlightJs = "";
            }
        }
        if (highlightJs.isEmpty()) return "";
        JSONObject cfg = new JSONObject();
        try {
            cfg.put("blogs", new JSONArray(java.util.Arrays.asList(MIH_BLOGS)));
            cfg.put("post", postKey);
        } catch (Exception ignored) {
            // Constant input.
        }
        return highlightJs.trim() + "(" + cfg + ");";
    }
}
