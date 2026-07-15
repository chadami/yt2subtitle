# VidLingo website

The multilingual public website for VidLingo.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The root route selects `/en`, `/zh`, or `/ja` from the browser language.

## Production

Create a Vercel project with this directory as its Root Directory and configure:

```text
NEXT_PUBLIC_CHROME_WEB_STORE_URL=https://chromewebstore.google.com/detail/...
```

The value is validated during production builds. Bind `vidlingo.online` as the primary domain and redirect `www.vidlingo.online` to it in Vercel Domains.
