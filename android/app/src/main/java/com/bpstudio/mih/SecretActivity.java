package com.bpstudio.mih;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
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
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URLEncoder;
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
 * Opened with mihsecret://search?q=<keyword>[&post=<blog post url>][&s=blog], or from the launcher shortcut "시크릿 검색" with an empty box.
 */
public class SecretActivity extends Activity {

    /** MIH blogs (lib/daily-report.ts REPORT_AGENCIES + the old speaker id). Their results get highlighted. */
    private static final String[] MIH_BLOGS = {"mih_agency", "mih_casting", "gdfdhzgfgfhgdj", "kyh620303", "mih_speaker"};
    private static final Pattern POST = Pattern.compile("blog\\.naver\\.com/([A-Za-z0-9_-]+)/(\\d+)");
    private static final int BRAND = Color.parseColor("#1565C0");

    private static boolean dataDirSet;

    private WebView web;
    private EditText box;
    private TextView totalTab;
    private TextView blogTab;
    private ProgressBar progress;
    private String query = "";
    private String postKey = "";
    private String highlightJs;
    private boolean blogSurface;

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
        getWindow().setStatusBarColor(BRAND);
        buildUi();
        readIntent(getIntent());
        open();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readIntent(intent);
        open();
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
        if (uri == null) return;
        String q = uri.getQueryParameter("q");
        query = q == null ? "" : q.trim();
        String post = uri.getQueryParameter("post");
        if (post != null) {
            Matcher m = POST.matcher(post);
            if (m.find()) postKey = m.group(1).toLowerCase() + "/" + m.group(2);
        }
        blogSurface = "blog".equals(uri.getQueryParameter("s"));
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
        if (query.isEmpty()) {
            web.loadUrl("about:blank");
            box.requestFocus();
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            box.post(() -> imm.showSoftInput(box, InputMethodManager.SHOW_IMPLICIT));
            return;
        }
        wipe();
        web.loadUrl(searchUrl(query, blogSurface));
        web.postDelayed(() -> web.clearHistory(), 1500);
    }

    /** Same URLs as lib/naver-search/blog-results.ts mobileSearchUrl(). */
    static String searchUrl(String q, boolean blog) {
        String enc;
        try {
            enc = URLEncoder.encode(q, "UTF-8");
        } catch (Exception e) {
            enc = Uri.encode(q);
        }
        return blog
                ? "https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query=" + enc
                : "https://m.search.naver.com/search.naver?where=m&ssc=tab.m.all&query=" + enc;
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setFitsSystemWindows(true);
        root.setBackgroundColor(Color.WHITE);

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

        setContentView(root);
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
