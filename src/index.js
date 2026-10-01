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

    // ヘッダー（IP匿名化）
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

    // HTML以外はそのまま返す（軽量化）
    if (!type.includes("text/html")) {
      newHeaders.delete("content-length");
      return new Response(res.body, {
        status: res.status,
        headers: newHeaders,
      });
    }

    // ===== HTMLだけ安全に書き換え（マーカー方式） =====
    let html = await res.text();

    const domains = [
      "www.youtube.com",
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "i.ytimg.com",
      "ytimg.com",
      "googlevideo.com",
    ];

    // 長い順
    domains.sort((a, b) => b.length - a.length);

    // 1. 一時マーカーに置き換え（二重防止）
    domains.forEach((domain, i) => {
      const marker = `__P${i}__`;
      html = html.replace(new RegExp(`https?://${domain.replace(/\./g, "\\.")}`, "gi"), marker);
      html = html.replace(new RegExp(`//${domain.replace(/\./g, "\\.")}`, "gi"), marker);
    });

    // 2. マーカーを正しいURLに戻す
    domains.forEach((domain, i) => {
      const marker = `__P${i}__`;
      html = html.split(marker).join(`${proxyOrigin}/https://${domain}`);
    });

    newHeaders.delete("content-length");
    return new Response(html, {
      status: res.status,
      headers: newHeaders,
    });
  },
};
