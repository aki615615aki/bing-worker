```js
export default {
  async fetch(request) {
    const url = new URL(request.url);

    const target =
      "https://www.bing.com" +
      url.pathname +
      url.search;

    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      redirect: "manual"
    });

    const headers = new Headers(response.headers);

    // Bing側がリダイレクトを返した場合、
    // WorkerのURLではなくBingのURLへ飛ばされないようにする
    const location = headers.get("Location");

    if (location) {
      const redirectUrl = new URL(location, "https://www.bing.com");

      headers.set(
        "Location",
        url.origin + redirectUrl.pathname + redirectUrl.search
      );
    }

    return new Response(response.body, {
      status: response.status,
      headers
    });
  }
};
```
