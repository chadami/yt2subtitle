# VidLingo website

The one-page public website for VidLingo. The privacy and terms pages stay available in English, Chinese, and Japanese.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Old `/en`, `/zh`, `/ja`, and article URLs redirect to the home page.

## Production

Create a Vercel project with this directory as its Root Directory and configure:

```text
NEXT_PUBLIC_MAC_DOWNLOAD_URL=https://github.com/chadami/yt2subtitle/releases/download/...
```

The value is validated during production builds. Bind `vidlingo.online` as the primary domain and redirect `www.vidlingo.online` to it in Vercel Domains.
