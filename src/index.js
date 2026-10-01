export default {
  async fetch(request) {
    const url = new URL(request.url);
    const proxyOrigin = url.origin;

    // ターゲットURL
    let target = url.pathname.startsWith("/http")
      ? url.pathname.slice(1) + url.search
      : "https://www.youtube.com" + url.pathname + url.search;

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("Bad URL", { status: 400 });
    }

    // ヘッダー（IP匿名化 + Rangeはそのまま通す）
    const headers = new Headers(request.headers);
    ["host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
     "x-forwarded-for", "x-real-ip", "x-client-ip", "forwarded", "via",
     "origin", "referer"].forEach(h => headers.delete(h));

    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "follow",
    });

    const type = res.headers.get("content-type") || "";
    const newHeaders = new Headers(res.headers);

    ["content-security-policy", "content-security-policy-report-only",
     "x-frame-options", "strict-transport-security"].forEach(h => newHeaders.delete(h));

    // 動画・画像・フォントなどバイナリはそのまま返す（重要）
    if (
      type.includes("video/") ||
      type.includes("audio/") ||
      type.includes("image/") ||
      type.includes("font/") ||
      type.includes("application/octet-stream") ||
      type.includes("application/x-javascript") === false && !type.includes("text/") && !type.includes("json") && !type.includes("javascript")
    ) {
      newHeaders.delete("content-length");
      return new Response(res.body, {
        status: res.status,
        headers: newHeaders,
      });
    }

    // HTML と JSON だけ書き換える
    const shouldRewrite = type.includes("text/html") || type.includes("application/json") || type.includes("text/plain");

    if (!shouldRewrite) {
      newHeaders.delete("content-length");
      return new Response(res.body, {
        status: res.status,
        headers: newHeaders,
      });
    }

    let body = await res.text();

    const domains = [
      "www.youtube.com",
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "i.ytimg.com",
      "ytimg.com",
      "googlevideo.com",
    ];

    domains.sort((a, b) => b.length - a.length);

    // マーカー方式で安全に置換
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
