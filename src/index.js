export default {
  async fetch(request) {
    const url = new URL(request.url);

    const target =
      "https://youtube.com" +
      url.pathname +
      url.search;

    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
};
