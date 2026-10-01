export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 上流URLを構築
    const upstream = new URL(
      url.pathname + url.search,
      "https://www.youtube.com"
    );

    // リクエストヘッダーをコピー
    const headers = new Headers(request.headers);

    // ===== IPを匿名化するために削除するヘッダー =====
    // Cloudflare や一般的なプロキシが付与するクライアントIP関連
    const ipHeadersToRemove = [
      "host",
      "cf-connecting-ip",      // Cloudflareが付与する実クライアントIP
      "cf-ipcountry",          // 国情報
      "cf-ray",
      "cf-visitor",
      "x-forwarded-for",       // 最も一般的な実IPヘッダー
      "x-real-ip",
      "x-client-ip",
      "x-forwarded",
      "forwarded",
      "true-client-ip",        // 一部CDNが使用
      "x-cluster-client-ip",
      "fastly-client-ip",
      "x-azure-clientip",
    ];

    for (const header of ipHeadersToRemove) {
      headers.delete(header);
    }

    // 上流へリクエスト
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });

    // レスポンスヘッダーをコピー
    const responseHeaders = new Headers(response.headers);

    // プロキシを壊しやすいヘッダーを削除（任意）
    responseHeaders.delete("content-security-policy");
    responseHeaders.delete("content-security-policy-report-only");
    responseHeaders.delete("x-frame-options");
    responseHeaders.delete("strict-transport-security");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
