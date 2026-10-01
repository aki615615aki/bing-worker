export default {
  async fetch(request) {
    const url = new URL(request.url);
    const proxyOrigin = url.origin;

    // ターゲットURL決定
    let targetUrlStr;
    if (url.pathname.startsWith("/http://") || url.pathname.startsWith("/https://")) {
      targetUrlStr = url.pathname.slice(1) + url.search;
    } else {
      targetUrlStr = "https://www.youtube.com" + url.pathname + url.search;
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    // ヘッダー処理
    const headers = new Headers(request.headers);
    const removeList = [
      "host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
      "x-forwarded-for", "x-real-ip", "x-client-ip", "x-forwarded",
      "forwarded", "true-client-ip", "x-cluster-client-ip", "fastly-client-ip",
      "via", "x-forwarded-proto", "x-forwarded-host", "origin", "referer"
    ];
    for (const h of removeList) headers.delete(h);

    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") || "";
    const newHeaders = new Headers(response.headers);

    // 邪魔なヘッダー削除
    ["content-security-policy", "content-security-policy-report-only", "x-frame-options", "strict-transport-security", "x-content-type-options"].forEach(h => newHeaders.delete(h));

    // CookieのDomain削除
    if (newHeaders.has("set-cookie")) {
      const cookies = newHeaders.getSetCookie?.() || [];
      newHeaders.delete("set-cookie");
      cookies.forEach(c => newHeaders.append("set-cookie", c.replace(/;\s*Domain=[^;]*/gi, "")));
    }

    // 書き換え対象か？
    const isText = contentType.includes("text/html") ||
                   contentType.includes("text/css") ||
                   contentType.includes("javascript") ||
                   contentType.includes("application/json");

    if (!isText) {
      newHeaders.delete("content-length");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    let body = await response.text();

    // ========== ここが重要：二重置換を防ぐ安全な書き換え ==========
    const domains = [
      "www.youtube-nocookie.com",
      "youtube-nocookie.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtube.com",
      "www.youtu.be",
      "youtu.be",
      "i.ytimg.com",
      "s.ytimg.com",
      "ytimg.com",
      "yt3.ggpht.com",
      "ggpht.com",
      "googleusercontent.com",
      "googlevideo.com",
    ];

    // 長い順にソート
    domains.sort((a, b) => b.length - a.length);

    // 1. まず全部を一時マーカーに置き換える（二重を完全防止）
    domains.forEach((domain, i) => {
      const marker = `__PROXY_${i}__`;
      // https://domain
      body = body.replace(new RegExp(`https?://${domain.replace(/\./g, "\\.")}`, "gi"), marker);
      // //domain
      body = body.replace(new RegExp(`//${domain.replace(/\./g, "\\.")}`, "gi"), marker);
    });

    // 2. マーカーを正しいプロキシURLに戻す
    domains.forEach((domain, i) => {
      const marker = `__PROXY_${i}__`;
      body = body.split(marker).join(`${proxyOrigin}/https://${domain}`);
    });

    newHeaders.delete("content-length");

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
