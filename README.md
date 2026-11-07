# NETFETTI Audio

Free hosting for the **preview clips** that play on the NETFETTI Big Cartel shop.
Full-length tracks are **not** stored here — they stay in Big Cartel Digital Products,
where buyers download them after checkout. Everything in this repo is public.

```
netfetti-audio/
├── player.js            the player — one script, no dependencies
├── catalog.json         list of tracks and playlists (written by the script)
├── index.html           your library: play clips, copy links and player code
├── play.html            shareable full-page player  (play.html?playlist=ID)
├── previews/            the clips (MP3, ~0.5 MB each)
├── artwork/             cover art pulled from your files
├── tools/make_previews.py   cuts full tracks into clips + updates catalog.json
├── bigcartel/PASTE-INTO-BIG-CARTEL.html   the two snippets for your shop
└── .nojekyll            tells GitHub Pages to serve files as-is
```

---

## 1 · Put it on GitHub (one time, ~5 minutes, all in the browser)

1. Sign in at github.com → click **+** (top right) → **New repository**.
2. Name it **`netfetti-audio`**, set it to **Public**, leave everything else unticked → **Create repository**.
3. On the empty repo page click **uploading an existing file**. Drag in **everything inside** the unzipped
   `netfetti-audio` folder (the files *and* the `previews`, `artwork`, `tools`, `bigcartel` folders).
   > `.nojekyll` is hidden on Mac/Windows. If it doesn't upload, click **Add file › Create new file**,
   > name it `.nojekyll`, leave it empty and commit.
4. Click **Commit changes**.
5. Go to **Settings › Pages**. Under *Build and deployment* choose **Deploy from a branch**,
   branch **main**, folder **/ (root)** → **Save**.
6. After a minute your library is live at
   **`https://netfetti.github.io/netfetti-audio/`**

The three demo clips let you check it works. Delete them once your real clips are up (step 3).

## 2 · Connect Big Cartel (one time)

Open `bigcartel/PASTE-INTO-BIG-CARTEL.html` and follow the two steps in it:
a script tag in the shop's body code, and one line on the product page.
Replace `netfetti` with your username.

## 3 · Add music (every release)

You need [Python](https://www.python.org/downloads/) and [ffmpeg](https://ffmpeg.org/download.html) installed once.
Windows: `winget install ffmpeg`. Mac: `brew install ffmpeg`.

Open a terminal in the `netfetti-audio` folder and run:

```bash
python tools/make_previews.py "PATH/TO/ALBUM FOLDER" --product big-cartel-permalink --album "Album Name"
```

- `--product` is the end of the product's Big Cartel URL
  (`netfetti.com/product/midnight-drive` → `midnight-drive`). That's how the shop page finds its clips.
- `--album` also creates a playlist, so the product page shows a track list.
- Tracks are ordered by file name, so number them (`01 …`, `02 …`) if order matters.
- Every clip gets a spoken **"NETFETTI" tag 12 seconds in**, matched to the track's loudness with the
  music dipping slightly underneath, plus a fade-out at the end. That protects instrumentals: a tagged,
  faded 30-second clip isn't usable in anyone's project.
  - `--tag-at 8,20` plays the tag more than once · `--tag-volume 0.7` makes it quieter
  - `--tag "my-tag.wav"` uses your own recorded tag instead of `tools/netfetti-tag.wav`
- Other options: `--length 45` (clip length), `--start 60` (start point in seconds), `--force` (re-cut).

Then upload the new files in `previews/` and `artwork/` plus the updated `catalog.json` to the repo
(**Add file › Upload files**, drag, commit). Changes go live in about a minute.

**Editing details by hand:** open `catalog.json` on GitHub, click the pencil, change a title, description
or tags, commit. Re-running the script never overwrites what you typed.
Set `"visibility": "private"` to hide a track without deleting it.

**Removing the demo:** delete the three `demo-tape-…` files from `previews/` and `artwork/`, and remove
the demo entries from `catalog.json` (or delete `catalog.json`'s `tracks` and `playlists` contents back to `[]`).

---

## Using clips anywhere else

Every clip has a permanent direct link — copy it from the library page.

```html
<audio controls preload="metadata">
  <source src="https://netfetti.github.io/netfetti-audio/previews/TRACK_ID.mp3" type="audio/mpeg">
</audio>
```

```js
const audio = new Audio("https://netfetti.github.io/netfetti-audio/previews/TRACK_ID.mp3");
audio.play();
```

Or the styled player on any site:

```html
<div data-netfetti-player data-playlist="PLAYLIST_ID"></div>
<script src="https://netfetti.github.io/netfetti-audio/player.js" defer></script>
```

GitHub Pages sends the headers browsers need for this (`Content-Type: audio/mpeg`, range requests for
seeking, and `Access-Control-Allow-Origin: *` so other sites can load the catalog). Works in Chrome,
Safari, Firefox, Edge and mobile browsers.

## Optional · your own address

To use `audio.netfetti.com` instead of the github.io address: in **Settings › Pages › Custom domain** enter
`audio.netfetti.com`, then at your domain registrar add a **CNAME** record `audio` → `netfetti.github.io`.
Tick **Enforce HTTPS** once it appears. This doesn't affect netfetti.com pointing at Big Cartel.
If you do this, update the script tag in Big Cartel to the new address.

## Limits and when to move

- GitHub Pages: site up to **1 GB**, about **100 GB/month** of traffic (soft limit). At ~0.5 MB per
  30-second clip that's roughly 2,000 clips and ~200,000 plays a month. The library page shows how much you've used.
- GitHub says Pages isn't meant to host an online shop. This repo only serves preview clips while
  selling happens on Big Cartel, which is fine to start with — but it's a reason to move if you grow.
- **Moving later:** copy `previews/` and `artwork/` to Cloudflare R2 (10 GB free, no bandwidth fees),
  then set `"base_url"` in `catalog.json` to the R2 address. Every player follows; nothing else changes.

## Security

There are no passwords, keys or upload forms in this repo, so there's nothing to leak. Uploads happen
through your GitHub account. Keep two-factor authentication on (Settings › Password and authentication).
Never put a full-length track or a personal access token in this repo — anything here is public.
