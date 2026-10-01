export default {
  async fetch(request) {
    const url = new URL(request.url);

    const upstream = new URL(
      url.pathname + url.search,
      "https://youtube.com"
    );

    const headers = new Headers(request.headers);
    headers.delete("host");

    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body
    });

    const responseHeaders = new Headers(response.headers);

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  }
};
