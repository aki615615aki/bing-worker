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

    // ヘッダー整理（IP匿名化）
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

    // 邪魔なヘッダー削除
    ["content-security-policy", "content-security-policy-report-only",
     "x-frame-options", "strict-transport-security"].forEach(h => newHeaders.delete(h));

    // HTML以外はそのまま返す（軽量化の肝）
    if (!type.includes("text/html")) {
      newHeaders.delete("content-length");
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // HTMLだけ書き換え
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

    for (const d of domains) {
      const re = new RegExp(`https?://${d.replace(/\./g, "\\.")}`, "gi");
      html = html.replace(re, `${proxyOrigin}/https://${d}`);

      const re2 = new RegExp(`//${d.replace(/\./g, "\\.")}`, "gi");
      html = html.replace(re2, `//${url.host}/https://${d}`);
    }

    newHeaders.delete("content-length");
    return new Response(html, {
      status: res.status,
      headers: newHeaders,
    });
  },
};
