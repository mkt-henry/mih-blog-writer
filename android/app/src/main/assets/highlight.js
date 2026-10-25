// Injected into the Naver search page by SecretActivity as `(<this function>)({blogs, post})`.
// Highlights MIH blog results and labels each with its order among blog posts — the same counting as
// lib/naver-search/blog-results.ts parseBlogResults (unique post links that carry text, in page order).
// The post the dashboard row points at gets a stronger yellow mark.
(function (c) {
  if (window.__mih) return;
  window.__mih = 1;
  var RE = /blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/;
  // Widest ancestor that links nowhere but this blog (its profile and this post) — the whole result card,
  // header included. Links back into Naver search (tags, related keywords) don't count.
  function card(a, key) {
    var blog = key.split('/')[0], box = a;
    for (var p = a.parentElement; p && p !== document.body; p = p.parentElement) {
      var ls = p.querySelectorAll('a[href^="http"]'), other = false;
      for (var j = 0; j < ls.length && !other; j++) {
        var h = ls[j].href, n = h.match(RE);
        if (n) other = n[1].toLowerCase() + '/' + n[2] !== key;
        else if (/blog\.naver\.com\//.test(h)) other = h.toLowerCase().indexOf('blog.naver.com/' + blog) < 0;
        else other = !/^https?:\/\/[^\/]*search\.naver\.com\//.test(h);
      }
      if (other) break;
      box = p;
    }
    return box;
  }
  function run() {
    var seen = {}, rank = 0, as = document.querySelectorAll('a[href*="blog.naver.com/"]');
    for (var i = 0; i < as.length; i++) {
      var a = as[i], m = a.href.match(RE);
      if (!m || !(a.textContent || '').trim()) continue;
      var key = m[1].toLowerCase() + '/' + m[2];
      if (!seen[key]) seen[key] = ++rank;
      if (c.blogs.indexOf(m[1].toLowerCase()) < 0) continue;
      // Naver re-renders result blocks as you scroll — mark again whenever our mark is gone.
      if (document.querySelector('[data-mih="' + key + '"]')) continue;
      var box = card(a, key);
      box.setAttribute('data-mih', key);
      var mine = c.post && key === c.post;
      box.style.background = mine ? '#FFF3C4' : '#E8F1FC';
      box.style.boxShadow = 'inset 4px 0 0 ' + (mine ? '#F5B400' : '#1565C0');
      var tag = document.createElement('div');
      tag.textContent = (mine ? '이 글' : '우리 블로그') + ' · 블로그 글 ' + seen[key] + '번째';
      tag.style.cssText = 'display:inline-block;margin:6px 0 2px 12px;padding:2px 8px;border-radius:4px;' +
        'font:bold 12px sans-serif;color:#fff;background:' + (mine ? '#E09E00' : '#1565C0');
      box.insertBefore(tag, box.firstChild);
    }
  }
  run();
  var t;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(run, 300); })
    .observe(document.body, { childList: true, subtree: true });
})
