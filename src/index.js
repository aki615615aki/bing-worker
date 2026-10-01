export default {
  async fetch(request) {
    const url = new URL(request.url);

    const target = "https://www.bing.com" + url.pathname + url.search;

    const response = await fetch(target, {
      headers: {
        "User-Agent": request.headers.get("User-Agent") || ""
      }
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
};
