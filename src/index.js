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

    // ヘッダー（ログイン優先で Origin / Referer は消さない）
    const headers = new Headers(request.headers);
    ["host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
     "x-forwarded-for", "x-real-ip", "x-client-ip", "forwarded", "via"].forEach(h => headers.delete(h));

    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    // リダイレクトは手動
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "manual",
    });

    const newHeaders = new Headers(res.headers);

    // Locationを強制的にプロキシ経由にする
    if (newHeaders.has("location")) {
      let loc = newHeaders.get("location");
      if (loc.startsWith("http")) {
        newHeaders.set("location", proxyOrigin + "/" + loc);
      } else if (loc.startsWith("//")) {
        newHeaders.set("location", proxyOrigin + "/https:" + loc);
      } else if (loc.startsWith("/")) {
        // 相対パスの場合は元のホストを付ける
        newHeaders.set("location", proxyOrigin + "/https://" + targetUrl.host + loc);
      }
    }

    // セキュリティヘッダー全削除
    ["content-security-policy", "content-security-policy-report-only",
     "x-frame-options", "strict-transport-security", "x-content-type-options",
     "cross-origin-opener-policy", "cross-origin-embedder-policy"].forEach(h => newHeaders.delete(h));

    // CookieのDomainを強制削除
    if (newHeaders.has("set-cookie")) {
      const cookies = newHeaders.getSetCookie?.() || [];
      newHeaders.delete("set-cookie");
      for (const c of cookies) {
        let cleaned = c
          .replace(/;\s*Domain=[^;]*/gi, "")
          .replace(/;\s*SameSite=[^;]*/gi, "; SameSite=None")
          .replace(/;\s*Secure/gi, "; Secure");
        newHeaders.append("set-cookie", cleaned);
      }
    }

    const type = res.headers.get("content-type") || "";

    // バイナリはそのまま
    if (type.includes("video/") || type.includes("audio/") || type.includes("image/") || type.includes("font/") || type.includes("application/octet-stream")) {
      newHeaders.delete("content-length");
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // ほぼ全部書き換える（強引）
    const shouldRewrite =
      type.includes("text/") ||
      type.includes("json") ||
      type.includes("javascript") ||
      type.includes("xml");

    if (!shouldRewrite) {
      newHeaders.delete("content-length");
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    let body = await res.text();

    // ログイン関連ドメインを大量投入
    const domains = [
      "accounts.google.com",
      "myaccount.google.com",
      "www.gstatic.com",
      "ssl.gstatic.com",
      "gstatic.com",
      "apis.google.com",
      "www.googleapis.com",
      "oauth2.googleapis.com",
      "www.youtube.com",
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "i.ytimg.com",
      "ytimg.com",
      "googlevideo.com",
      "play.google.com",
      "lh3.googleusercontent.com",
    ];

    domains.sort((a, b) => b.length - a.length);

    // マーカー方式
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
