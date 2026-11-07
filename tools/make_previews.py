#!/usr/bin/env python3
"""
Cut full tracks into short preview clips and add them to catalog.json.

Needs Python 3.8+ and ffmpeg (https://ffmpeg.org/download.html) on your PATH.

  python tools/make_previews.py "C:/Music/My Album" --product my-album --album "My Album"

What it does, for every .mp3 / .wav / .flac / .m4a / .aiff in the folder:
  * cuts a clip (30 s by default) starting about a third of the way in,
  * fades it in and out, encodes it as 128 kbps MP3 into previews/,
  * pulls embedded cover art into artwork/ (if there is any),
  * adds or updates the track in catalog.json, keeping anything you edited by hand.

Your full-length originals are only read, never changed or copied into the repo.
"""
import argparse
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "catalog.json"
AUDIO_EXT = {".mp3", ".wav", ".flac", ".m4a", ".aif", ".aiff", ".ogg"}


def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or "track"


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    fmt = data.get("format", {})
    tags = {k.lower(): v for k, v in (fmt.get("tags") or {}).items()}
    has_art = any(s.get("codec_type") == "video" for s in data.get("streams", []))
    return float(fmt.get("duration") or 0), tags, has_art


def mean_db(path, start=None, length=None):
    """Average loudness (dB) of a file or a section of it, via ffmpeg volumedetect."""
    cmd = ["ffmpeg", "-v", "info", "-nostats"]
    if start is not None:
        cmd += ["-ss", f"{start:.2f}", "-t", f"{length:.2f}"]
    cmd += ["-i", str(path), "-af", "silenceremove=stop_periods=-1:stop_threshold=-45dB,volumedetect", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", err)
    return float(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser(description="Make preview clips and update catalog.json")
    ap.add_argument("folder", help="folder with your full-length tracks (or a single file)")
    ap.add_argument("--length", type=float, default=30, help="clip length in seconds (default 30)")
    ap.add_argument("--start", type=float, default=None,
                    help="start every clip at this many seconds (default: one third of the way in)")
    ap.add_argument("--bitrate", default="128k", help="preview MP3 bitrate (default 128k)")
    ap.add_argument("--product", default="", help="Big Cartel product permalink these tracks belong to")
    ap.add_argument("--album", default="", help="also create/refresh a playlist with this name")
    ap.add_argument("--artist", default="", help="artist name if the files have no tag")
    ap.add_argument("--category", default="Music")
    ap.add_argument("--force", action="store_true", help="re-cut clips that already exist")
    ap.add_argument("--tag", default=str(Path(__file__).with_name("netfetti-tag.wav")),
                    help="voice tag mixed into every clip (default tools/netfetti-tag.wav)")
    ap.add_argument("--tag-at", default="12",
                    help="seconds into the clip where the tag plays; several allowed, e.g. 8,20 (default 12)")
    ap.add_argument("--tag-volume", type=float, default=1.0, help="tag loudness relative to the music; 1.0 = slightly above it, 0.5 = quieter")
    ap.add_argument("--no-tag", action="store_true", help="make clips without the voice tag")
    args = ap.parse_args()
    tag = None if args.no_tag else Path(args.tag)
    if tag and not tag.exists():
        sys.exit(f"Voice tag not found: {tag}  (add --no-tag to skip it)")
    tag_at = [float(x) for x in str(args.tag_at).split(",") if x.strip()]

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found. Install ffmpeg first: https://ffmpeg.org/download.html")

    src = Path(args.folder).expanduser()
    files = [src] if src.is_file() else sorted(p for p in src.iterdir() if p.suffix.lower() in AUDIO_EXT)
    if not files:
        sys.exit(f"No audio files found in {src}")

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog.setdefault("tracks", [])
    catalog.setdefault("playlists", [])
    by_id = {t["track_id"]: t for t in catalog["tracks"]}
    (ROOT / "previews").mkdir(exist_ok=True)
    (ROOT / "artwork").mkdir(exist_ok=True)
    default_artist = args.artist or catalog.get("defaults", {}).get("artist", "")
    added = []

    for f in files:
        duration, tags, has_art = probe(f)
        title = tags.get("title") or f.stem
        base = slug(f"{args.product}-{title}" if args.product else title)
        track_id = base
        clip = ROOT / "previews" / f"{track_id}.mp3"

        length = min(args.length, duration) if duration else args.length
        start = args.start if args.start is not None else max(0.0, min(duration / 3, duration - length))
        fade_out = min(2.5, length / 4)

        if args.force or not clip.exists():
            fades = f"afade=t=in:d=0.4,afade=t=out:st={length - fade_out:.2f}:d={fade_out:.2f}"
            marks = [t for t in tag_at if t < length - 1] if tag else []
            cmd = ["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", str(f)]
            if marks:
                # Music dips slightly (sidechain) while the tag speaks, so it is clear but not jarring.
                cmd += ["-i", str(tag)]
                n = len(marks)
                # Match the tag to this track's loudness (+2 dB) so it cuts through loud masters and quiet ones alike.
                music_db, tag_db = mean_db(f, start, length), mean_db(tag)
                gain_db = (music_db - tag_db + 2) if (music_db is not None and tag_db is not None) else 0
                gain = 10 ** (gain_db / 20) * args.tag_volume
                g = (f"[0:a:0]aresample=44100,aformat=channel_layouts=stereo,{fades}[m];"
                     f"[1:a]aresample=44100,aformat=channel_layouts=stereo,volume={gain:.3f},asplit={n}"
                     + "".join(f"[t{i}]" for i in range(n)) + ";"
                     + "".join(f"[t{i}]adelay={int(t * 1000)}:all=1[d{i}];" for i, t in enumerate(marks))
                     + "".join(f"[d{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,apad[tags];"
                     "[tags]asplit[tk][tm];"
                     "[m][tk]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=400[duck];"
                     "[duck][tm]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[out]")
                cmd += ["-filter_complex", g, "-map", "[out]"]
            else:
                cmd += ["-map", "0:a:0", "-af", fades]
            subprocess.run(cmd + [
                "-c:a", "libmp3lame", "-b:a", args.bitrate, "-ar", "44100",
                "-map_metadata", "-1", "-metadata", f"title={title} (preview)",
                "-metadata", f"artist={tags.get('artist') or default_artist}",
                str(clip),
            ], check=True)
            print(f"  cut  {clip.relative_to(ROOT)}  ({start:.0f}s -> {start + length:.0f}s of {duration:.0f}s"
                  + (f", tag at {', '.join(f'{t:g}s' for t in marks)}" if marks else ", no tag") + ")")
        else:
            print(f"  skip {clip.relative_to(ROOT)} (exists; use --force to re-cut)")

        art_rel = ""
        art = ROOT / "artwork" / f"{track_id}.jpg"
        if has_art and (args.force or not art.exists()):
            r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(f), "-an", "-frames:v", "1",
                                "-vf", "scale='min(600,iw)':-2", str(art)])
            if r.returncode != 0 and art.exists():
                art.unlink()
        if art.exists():
            art_rel = f"artwork/{art.name}"

        clip_len, _, _ = probe(clip)
        record = by_id.get(track_id, {})
        fresh = {
            "track_id": track_id,
            "title": title,
            "artist": tags.get("artist") or default_artist,
            "description": "",
            "category": args.category,
            "tags": [],
            "album": args.album or tags.get("album", ""),
            "product": args.product,
            "duration": round(clip_len, 1),
            "full_duration": round(duration, 1),
            "file_size": clip.stat().st_size,
            "file_url": f"previews/{clip.name}",
            "artwork_url": art_rel,
            "date_added": dt.date.today().isoformat(),
            "visibility": "public",
        }
        # Keep hand-edited fields; always refresh the measured ones.
        merged = {**fresh, **{k: v for k, v in record.items() if v not in ("", [], None)}}
        for k in ("duration", "full_duration", "file_size", "file_url"):
            merged[k] = fresh[k]
        if art_rel:
            merged["artwork_url"] = record.get("artwork_url") or art_rel
        if track_id not in by_id:
            catalog["tracks"].append(merged)
        else:
            catalog["tracks"][catalog["tracks"].index(record)] = merged
        by_id[track_id] = merged
        added.append(track_id)

    if args.album:
        pid = slug(args.product or args.album)
        lists = {p["playlist_id"]: p for p in catalog["playlists"]}
        pl = lists.get(pid) or {"playlist_id": pid, "description": "", "visibility": "public"}
        pl.update({"name": args.album, "product": args.product, "tracks": added})
        if pid not in lists:
            catalog["playlists"].append(pl)
        print(f"  playlist '{args.album}' -> {len(added)} tracks")

    CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum((ROOT / t["file_url"]).stat().st_size for t in catalog["tracks"] if (ROOT / t["file_url"]).exists())
    print(f"\nDone. catalog.json has {len(catalog['tracks'])} tracks; previews total {total / 1e6:.1f} MB "
          f"(GitHub Pages limit is 1,000 MB).")


if __name__ == "__main__":
    main()
