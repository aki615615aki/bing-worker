export default {
  async fetch(request) {
    const url = new URL(request.url);
    const proxyOrigin = url.origin;

    // ===== ターゲットURLの決定 =====
    let targetUrlStr;

    // パスが /https:// または /http:// で始まる場合はそれをターゲットにする
    if (url.pathname.startsWith("/http://") || url.pathname.startsWith("/https://")) {
      targetUrlStr = url.pathname.slice(1) + url.search;
    } else {
      // 通常アクセスはYouTubeに飛ばす
      targetUrlStr = "https://www.youtube.com" + url.pathname + url.search;
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch {
      return new Response("Invalid target URL", { status: 400 });
    }

    // ===== リクエストヘッダー準備 =====
    const headers = new Headers(request.headers);

    // IP・指紋関連ヘッダーを徹底削除
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
      "origin", // オリジンチェック対策で消す場合あり
    ];
    for (const h of removeHeaders) {
      headers.delete(h);
    }

    // User-Agent固定
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // Refererも一応消す（必要ならコメントアウト）
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

    // 邪魔なセキュリティヘッダー削除
    newHeaders.delete("content-security-policy");
    newHeaders.delete("content-security-policy-report-only");
    newHeaders.delete("x-frame-options");
    newHeaders.delete("strict-transport-security");
    newHeaders.delete("x-content-type-options");

    // Set-CookieのDomainを削除（簡易）
    if (newHeaders.has("set-cookie")) {
      const cookies = newHeaders.getSetCookie?.() || [];
      newHeaders.delete("set-cookie");
      for (const cookie of cookies) {
        // Domain=... の部分を削除
        const cleaned = cookie.replace(/;\s*Domain=[^;]*/gi, "");
        newHeaders.append("set-cookie", cleaned);
      }
    }

    // ===== 本文の書き換え対象か判定 =====
    const shouldRewrite =
      contentType.includes("text/html") ||
      contentType.includes("text/css") ||
      contentType.includes("javascript") ||
      contentType.includes("application/json");

    if (!shouldRewrite) {
      // 画像・動画・フォントなどはそのまま返す
      newHeaders.delete("content-length");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // ===== 本文を取得してURL書き換え =====
    let body = await response.text();

    // 書き換える対象ドメイン一覧（YouTube関連）
    const domains = [
      "www.youtube.com",
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtu.be",
      "googlevideo.com",
      "ytimg.com",
      "i.ytimg.com",
      "s.ytimg.com",
      "yt3.ggpht.com",
      "googleusercontent.com",
      "ggpht.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ];

    for (const domain of domains) {
      // https://domain → プロキシ経由
      const re1 = new RegExp(`https?://${domain.replace(/\./g, "\\.")}`, "gi");
      body = body.replace(re1, `${proxyOrigin}/https://${domain}`);

      // //domain （プロトコル相対）
      const re2 = new RegExp(`//${domain.replace(/\./g, "\\.")}`, "gi");
      body = body.replace(re2, `//${url.host}/https://${domain}`);
    }

    // 特殊対応: youtu.be の短縮URLも
    body = body.replace(
      /https?:\/\/youtu\.be\//gi,
      `${proxyOrigin}/https://youtu.be/`
    );

    newHeaders.delete("content-length");

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
