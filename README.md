# MiroFish API Documentation

Public, English-language static documentation for the MiroFish API.

The site is intentionally independent from the MiroFish application. It is plain HTML, CSS, and JavaScript so it can be served directly by GitHub Pages. The API reference is rendered from `openapi.yaml` with Redoc in the browser.

## Local preview

From this directory:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://127.0.0.1:4173/`.

## Source of truth

`openapi.yaml` is copied from `mirofish-my/docs/mirofish-api.openapi.yaml`. Update the copy when the API contract changes. Keep all examples free of real credentials.
