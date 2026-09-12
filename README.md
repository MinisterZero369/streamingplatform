# Scenez Stream Starter

A Netlify + Supabase + Cloudflare Stream starter for a Netflix-style VOD service.

## Included
- Supabase email/password auth
- Netflix-style responsive catalog
- Featured hero content
- Search + genre filtering
- Cloudflare Stream video playback
- Favorites / My List
- Continue Watching progress
- Admin dashboard
- Cloudflare Library browser: lists videos already in your Stream account and adds them to the catalog
- Resumable TUS uploads directly from browser to Cloudflare Stream
- Secure Netlify Functions: Cloudflare API token never reaches the browser
- Supabase SQL schema + RLS policies

## 1. Supabase
1. Create a Supabase project.
2. Open SQL Editor and run `sql/schema.sql`.
3. In Project Settings/API, copy the Project URL and Publishable key.
4. Put them in `config.js`.
5. Create your account through the app.
6. In SQL Editor run the admin promotion query at the bottom of `schema.sql`, replacing the email.

## 2. Cloudflare Stream
1. Enable Cloudflare Stream.
2. Create an API token with Stream Write permission.
3. Note your Cloudflare Account ID.
4. Find your Stream customer hostname, e.g. `customer-xxxxx.cloudflarestream.com`, and put it in `config.js`.

Cloudflare requires TUS/resumable uploads for files over 200 MB. This starter uses TUS-style PATCH chunks so large movie files can upload directly from the browser without passing through Netlify.

## 3. Netlify environment variables
In Netlify > Site configuration > Environment variables add:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never put the Cloudflare API token or a Supabase service-role key in `config.js`.

## 4. Deploy
Drag this folder/ZIP into Netlify, or connect it to GitHub. The site is static and Netlify automatically deploys the functions in `netlify/functions`.

## Existing Cloudflare videos
1. Log in as an admin and open **Admin**.
2. The **Cloudflare Library** automatically lists videos already in your Cloudflare Stream account.
3. Click **Add to catalog** on any video.
4. Set title, description, genres, poster/backdrop, Featured and Published.
5. The app saves that Cloudflare UID to Supabase and the video appears on Home immediately when Published.

Cloudflare Stream and Supabase are separate systems: uploading a video in the Cloudflare dashboard does not automatically create a Supabase catalog record. The Cloudflare Library feature bridges the two.

## Upload workflow
1. Log in as an admin.
2. Open Admin.
3. Select a video file and fill out metadata.
4. Click Upload.
5. Browser asks the Netlify Function for a one-time Cloudflare upload URL.
6. Browser uploads chunks directly to Cloudflare.
7. The returned Cloudflare UID is saved with the video record in Supabase.
8. Publish the title when ready.

## Production next steps
This starter uses public Cloudflare playback IDs. For paid subscriptions, enable Cloudflare `requireSignedURLs` and add a Netlify playback-token endpoint that checks the customer's subscription before generating a short-lived token.

## v3 Netlify Functions compatibility fix
The serverless functions use Netlify's current Web `Request` / `Response` API. This fixes the runtime error: `Function returned an unsupported value. Accepted types are 'Response' or 'undefined'`.


## v4 homepage merchandising

This version adds Netflix-style horizontal category rows generated from each video's `genre` array, plus a Recently Added row. It also adds a Featured Hero manager in Admin Studio. No new SQL is required: it uses the existing `genre` and `featured` columns. Only one title is selected as the hero through the admin controls.


## v5 — Live Studio + automatic LIVE Hero

This version adds Cloudflare Stream Live Inputs and automatic homepage hero takeover.

### One-time Supabase migration

Run `sql/live-streaming-v5.sql` once in the Supabase SQL Editor after the original schema has already been installed.

### Setup

No new Netlify secrets are required. v5 reuses:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN` (Stream:Edit / Stream Write)
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The public `config.js` still needs `cloudflareCustomerHost`.

### First broadcast

1. Sign into Scenez Stream as an admin.
2. Open **Admin → Live Studio**.
3. Click **Create Scenez Live Input** once. This creates a permanent Cloudflare Live Input configured for automatic recording.
4. Click **Load OBS credentials** whenever you need the RTMPS server and secret Stream Key.
5. In OBS: **Settings → Stream → Service: Custom**. Paste the RTMPS server and Stream Key.
6. Click **Start Streaming** in OBS.
7. The Scenez homepage checks Cloudflare every ~15 seconds. When the input becomes live, the hero changes to **LIVE NOW** and the Play button becomes **Watch Live**.
8. When OBS stops streaming, the homepage automatically restores the manually selected Featured Hero.

Cloudflare recording mode is `automatic`, so completed broadcasts become Stream recordings and can later appear in the Cloudflare Library for catalog import.

Security: the Stream Key is fetched only through the authenticated admin-only Netlify function and is never stored in `config.js` or the public `live_settings` table.

## v6 — direct image uploads

This version replaces manual Poster URL, Backdrop URL and Live Hero Image URL entry with image upload buttons in Admin Studio.

Before using image uploads, run `sql/image-storage-v6.sql` once in the Supabase SQL Editor. It creates a public `scenez-images` Storage bucket with a 10 MB image limit and admin-only upload/update/delete policies. Public image URLs are generated automatically after upload and saved into the existing `poster_url`, `backdrop_url`, and `hero_image_url` fields.

Supported image types: JPG/JPEG, PNG, WebP, GIF.

No new Netlify environment variables are required.
