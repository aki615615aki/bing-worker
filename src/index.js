export default {
  async fetch(request) {
    const url = new URL(request.url);

    return Response.redirect(
      "https://www.bing.com" + url.pathname + url.search,
      302
    );
  }
};
