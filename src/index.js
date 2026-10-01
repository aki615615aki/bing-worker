export default {
  async fetch(request) {
    const url = new URL(request.url);

    // アクセスしたい先（ここを変更すれば他のサイトにも使える）
    const targetHost = "https://www.youtube.com";

    const upstream = new URL(url.pathname + url.search, targetHost);

    // ヘッダーをコピー
    const headers = new Headers(request.headers);

    // ===== 実IP・指紋になりやすい情報を徹底削除 =====
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

    // User-Agentを一般的なものに固定（指紋対策の簡易版）
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // リダイレクトをサーバー側で追従（200方式）
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "follow",
    });

    const responseHeaders = new Headers(response.headers);

    // 埋め込みや表示を邪魔するヘッダーを削除
    responseHeaders.delete("content-security-policy");
    responseHeaders.delete("content-security-policy-report-only");
    responseHeaders.delete("x-frame-options");
    responseHeaders.delete("strict-transport-security");
    responseHeaders.delete("x-content-type-options");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
