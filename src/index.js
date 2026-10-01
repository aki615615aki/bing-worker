export default {
  async fetch(request) {
    const url = new URL(request.url);
    const proxyOrigin = url.origin;

    // ===== ターゲット決定 =====
    let target;
    if (url.pathname.startsWith("/http://") || url.pathname.startsWith("/https://")) {
      target = url.pathname.slice(1) + url.search;
    } else {
      // デフォルトはBing
      target = "https://www.bing.com" + url.pathname + url.search;
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    // ===== ヘッダー（IP匿名化） =====
    const headers = new Headers(request.headers);
    ["host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
     "x-forwarded-for", "x-real-ip", "x-client-ip", "forwarded", "via"].forEach(h => headers.delete(h));

    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    // ===== リクエスト =====
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "manual",
    });

    const newHeaders = new Headers(res.headers);

    // Location書き換え
    if (newHeaders.has("location")) {
      let loc = newHeaders.get("location");
      if (loc.startsWith("http")) {
        newHeaders.set("location", proxyOrigin + "/" + loc);
      } else if (loc.startsWith("//")) {
        newHeaders.set("location", proxyOrigin + "/https:" + loc);
      } else if (loc.startsWith("/")) {
        newHeaders.set("location", proxyOrigin + "/https://" + targetUrl.host + loc);
      }
    }

    // セキュリティヘッダー削除
    ["content-security-policy", "content-security-policy-report-only",
     "x-frame-options", "strict-transport-security", "x-content-type-options"].forEach(h => newHeaders.delete(h));

    // Cookie Domain削除
    if (newHeaders.has("set-cookie")) {
      const cookies = newHeaders.getSetCookie?.() || [];
      newHeaders.delete("set-cookie");
      for (const c of cookies) {
        newHeaders.append("set-cookie", c.replace(/;\s*Domain=[^;]*/gi, ""));
      }
    }

    const type = res.headers.get("content-type") || "";

    // バイナリ・動画ストリームはそのまま
    if (
      type.includes("image/") ||
      type.includes("font/") ||
      type.includes("video/") ||
      type.includes("audio/") ||
      type.includes("application/octet-stream")
    ) {
      newHeaders.delete("content-length");
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // テキスト系を書き換え
    const shouldRewrite =
      type.includes("text/html") ||
      type.includes("application/json") ||
      type.includes("text/plain") ||
      type.includes("javascript") ||
      type.includes("text/css");

    if (!shouldRewrite) {
      newHeaders.delete("content-length");
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    let body = await res.text();

    // ===== ドメインリスト（ブロスタ用クラウド＋既存） =====
    const domains = [
      // ===== ブロスタ用クラウドゲーミング =====
      "easyfun.gg",
      "www.easyfun.gg",
      "cloudmoonapp.com",
      "www.cloudmoonapp.com",
      "web.cloudmoonapp.com",
      "now.gg",
      "www.now.gg",
      "nowgg.nl",

      // YouTube関連
      "www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be",
      "youtube-nocookie.com", "i.ytimg.com", "s.ytimg.com", "ytimg.com",
      "yt3.ggpht.com", "ggpht.com", "googlevideo.com", "googleusercontent.com",

      // Bing / Microsoft
      "www.bing.com", "bing.com", "c.bing.com", "r.bing.com", "th.bing.com",
      "tse1.mm.bing.net", "tse2.mm.bing.net", "tse3.mm.bing.net", "tse4.mm.bing.net",
      "www.microsoft.com", "microsoft.com", "login.microsoftonline.com", "login.live.com",
      "msn.com", "www.msn.com", "cdn.msn.com",

      // Google系
      "www.google.com", "google.com", "accounts.google.com",
      "www.gstatic.com", "ssl.gstatic.com", "gstatic.com",
      "apis.google.com", "www.googleapis.com",
    ];

    domains.sort((a, b) => b.length - a.length);

    // マーカー方式で安全置換
    domains.forEach((domain, i) => {
      const marker = `__P${i}__`;
      body = body.replace(new RegExp(`https?://${domain.replace(/\./g, "\\.")}`, "gi"), marker);
      body = body.replace(new RegExp(`//${domain.replace(/\./g, "\\.")}`, "gi"), marker);
    });

    domains.forEach((domain, i) => {
      const marker = `__P${i}__`;
      body = body.split(marker).join(`${proxyOrigin}/https://${domain}`);
    });

    newHeaders.delete("content-length");
    return new Response(body, {
      status: res.status,
      headers: newHeaders,
    });
  },
};
