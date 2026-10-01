export default {
  async fetch(request) {
    const url = new URL(request.url);
    const proxyOrigin = url.origin;

    // ===== ターゲットURLの決定 =====
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
      return new Response("Invalid target URL", { status: 400 });
    }

    // ===== リクエストヘッダー =====
    const headers = new Headers(request.headers);

    const removeHeaders = [
      "host",
      "cf-connecting-ip",
      "cf-ipcountry",
      "cf-ray",
      "cf-visitor",
      "x-forwarded-for",
      "x-real-ip",
      "x-client-ip",
      "x-forwarded",
      "forwarded",
      "true-client-ip",
      "x-cluster-client-ip",
      "fastly-client-ip",
      "via",
      "x-forwarded-proto",
      "x-forwarded-host",
    ];
    for (const h of removeHeaders) {
      headers.delete(h);
    }

    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    headers.delete("referer");

    // ===== 上流へリクエスト =====
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") || "";
    const newHeaders = new Headers(response.headers);

    newHeaders.delete("content-security-policy");
    newHeaders.delete("content-security-policy-report-only");
    newHeaders.delete("x-frame-options");
    newHeaders.delete("strict-transport-security");
    newHeaders.delete("x-content-type-options");

    // Set-CookieのDomain削除
    if (newHeaders.has("set-cookie")) {
      const cookies = newHeaders.getSetCookie?.() || [];
      newHeaders.delete("set-cookie");
      for (const cookie of cookies) {
        const cleaned = cookie.replace(/;\s*Domain=[^;]*/gi, "");
        newHeaders.append("set-cookie", cleaned);
      }
    }

    const shouldRewrite =
      contentType.includes("text/html") ||
      contentType.includes("text/css") ||
      contentType.includes("javascript") ||
      contentType.includes("application/json");

    if (!shouldRewrite) {
      newHeaders.delete("content-length");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    let body = await response.text();

    // ===== 重要：長いドメインから順に置換する（二重置換防止） =====
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

    for (const domain of domains) {
      // すでにプロキシ経由になっているものは触らない
      const reFull = new RegExp(
        `(?<!${proxyOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/)https?://${domain.replace(/\./g, "\\.")}`,
        "gi"
      );
      body = body.replace(reFull, `${proxyOrigin}/https://${domain}`);

      // プロトコル相対
      const reProto = new RegExp(
        `(?<!${url.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/)//${domain.replace(/\./g, "\\.")}`,
        "gi"
      );
      body = body.replace(reProto, `//${url.host}/https://${domain}`);
    }

    newHeaders.delete("content-length");

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
