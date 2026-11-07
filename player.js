/*!
 * NETFETTI preview player — v1.0
 * One script, no dependencies. Drop it on any page:
 *
 *   <script src="https://YOUR-NAME.github.io/netfetti-audio/player.js" defer></script>
 *   <div data-netfetti-player data-product="album-permalink"></div>
 *
 * Pick what to play with ONE of:
 *   data-product="big-cartel-permalink"   every track / playlist tagged with that product
 *   data-playlist="playlist_id"           one playlist from catalog.json
 *   data-track="track_id"                 a single track
 *
 * The script finds catalog.json next to itself, so nothing needs configuring.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var HOME = script ? script.src.replace(/[^/]*$/, '') : './';
  var catalogPromise = null;
  var players = [];

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(HOME + 'catalog.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('catalog ' + r.status); return r.json(); });
    }
    return catalogPromise;
  }

  /* Storage abstraction: files are stored as relative paths in catalog.json.
     Leave storage.base_url empty to serve from GitHub Pages; set it to an R2 / S3 / CDN
     address later and every link follows. */
  function resolver(cat) {
    var base = (cat.storage && cat.storage.base_url) || HOME;
    if (base.slice(-1) !== '/') base += '/';
    return function (path) {
      if (!path) return '';
      return /^https?:\/\//.test(path) ? path : base + path.replace(/^\//, '');
    };
  }

  function pickTracks(cat, el) {
    var pub = (cat.tracks || []).filter(function (t) { return t.visibility !== 'private'; });
    var byId = {};
    pub.forEach(function (t) { byId[t.track_id] = t; });
    var lists = (cat.playlists || []).filter(function (p) { return p.visibility !== 'private'; });
    var d = el.dataset;
    var list = null;

    if (d.playlist) list = lists.filter(function (p) { return p.playlist_id === d.playlist; })[0];
    if (!list && d.product) list = lists.filter(function (p) { return p.product === d.product; })[0];
    if (list) return { title: list.name, tracks: list.tracks.map(function (id) { return byId[id]; }).filter(Boolean) };

    if (d.track) return { title: '', tracks: byId[d.track] ? [byId[d.track]] : [] };
    if (d.product) return { title: '', tracks: pub.filter(function (t) { return t.product === d.product; }) };
    return { title: '', tracks: [] };
  }

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
  };

  var CSS = [
    '.nfp{--nfp-ink:var(--ink,#121212);--nfp-ground:var(--ground,#F5F5F2);--nfp-panel:var(--panel,#E9E9E4);--nfp-rule:var(--rule,#D8D8D3);--nfp-muted:var(--muted,#5C5C58);--nfp-accent:var(--accent,#2B3BFF);',
    'font-family:var(--sans,"Instrument Sans","Helvetica Neue",sans-serif);color:var(--nfp-ink);border:1px solid var(--nfp-ink);background:var(--nfp-ground);font-size:15px;line-height:1.4;container-type:inline-size}',
    '.nfp *{box-sizing:border-box}',
    '.nfp button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}',
    '.nfp button:focus-visible,.nfp input:focus-visible{outline:2px solid var(--nfp-accent);outline-offset:2px}',
    '.nfp-head{display:flex;gap:16px;align-items:center;padding:16px}',
    '.nfp-art{width:72px;height:72px;flex:none;background:var(--nfp-panel);overflow:hidden}',
    '.nfp-art img{width:100%;height:100%;object-fit:cover;display:block}',
    '.nfp-meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.nfp-eyebrow{font-family:var(--mono,"IBM Plex Mono",ui-monospace,monospace);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--nfp-muted)}',
    '.nfp-title{font-family:var(--serif,"Instrument Serif",Georgia,serif);font-size:24px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.nfp-artist{font-size:14px;color:var(--nfp-muted)}',
    '.nfp-controls{display:flex;align-items:center;gap:6px;flex:none}',
    '.nfp .nfp-btn{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center}',
    '.nfp .nfp-btn svg{width:18px;height:18px;fill:currentColor}',
    '.nfp .nfp-btn:hover{color:var(--nfp-accent)}',
    '.nfp .nfp-btn[disabled]{opacity:.3;cursor:default;color:inherit}',
    '.nfp .nfp-play{width:52px;height:52px;background:var(--nfp-ink);color:var(--nfp-ground)}',
    '.nfp .nfp-play:hover{background:var(--nfp-accent);color:#fff}',
    '.nfp .nfp-play svg{width:20px;height:20px}',
    '.nfp-bar{display:flex;align-items:center;gap:12px;padding:0 16px 16px;font-family:var(--mono,"IBM Plex Mono",ui-monospace,monospace);font-size:12px;color:var(--nfp-muted)}',
    '.nfp-bar time{min-width:36px;font-variant-numeric:tabular-nums}',
    '.nfp-bar time:last-of-type{text-align:right}',
    '.nfp-range{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:24px;background:transparent;margin:0;cursor:pointer}',
    '.nfp-range::-webkit-slider-runnable-track{height:2px;background:linear-gradient(var(--nfp-ink),var(--nfp-ink)) 0/var(--p,0%) 100% no-repeat,var(--nfp-rule)}',
    '.nfp-range::-moz-range-track{height:2px;background:var(--nfp-rule)}',
    '.nfp-range::-moz-range-progress{height:2px;background:var(--nfp-ink)}',
    '.nfp-range::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:var(--nfp-ink);margin-top:-5px;border:0}',
    '.nfp-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--nfp-ink);border:0}',
    '.nfp-vol{display:flex;align-items:center;gap:4px;flex:none}',
    '.nfp-vol .nfp-range{width:72px;flex:none}',
    '.nfp-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--nfp-rule);max-height:320px;overflow-y:auto}',
    '.nfp-list li+li{border-top:1px solid var(--nfp-rule)}',
    '.nfp .nfp-item{display:flex;width:100%;align-items:center;gap:14px;padding:12px 16px;text-align:left;min-height:48px}',
    '.nfp .nfp-item:hover{background:var(--nfp-panel)}',
    '.nfp-n{font-family:var(--mono,"IBM Plex Mono",ui-monospace,monospace);font-size:12px;color:var(--nfp-muted);width:22px;flex:none}',
    '.nfp-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.nfp-dur{font-family:var(--mono,"IBM Plex Mono",ui-monospace,monospace);font-size:12px;color:var(--nfp-muted)}',
    '.nfp .nfp-item[aria-current="true"]{font-weight:600}',
    '.nfp .nfp-item[aria-current="true"] .nfp-n{color:var(--nfp-accent)}',
    '.nfp-note{padding:16px;font-size:14px;color:var(--nfp-muted)}',
    '@container (max-width:560px){.nfp-head{flex-wrap:wrap}.nfp-meta{flex-basis:calc(100% - 88px)}.nfp-controls{width:100%}.nfp-vol{margin-left:auto}}',
    '@container (max-width:400px){.nfp-art{width:56px;height:56px}.nfp-meta{flex-basis:calc(100% - 72px)}.nfp-title{font-size:21px}}',
    '@media (max-width:520px){.nfp-head{flex-wrap:wrap}.nfp-controls{width:100%}.nfp-vol{margin-left:auto}}',
    '@media (hover:none){.nfp-vol{display:none}}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('nfp-style')) return;
    var s = document.createElement('style');
    s.id = 'nfp-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function build(el, cat) {
    var url = resolver(cat);
    var sel = pickTracks(cat, el);
    var tracks = sel.tracks;
    var defArtist = (cat.defaults && cat.defaults.artist) || '';
    el.classList.add('nfp');

    if (!tracks.length) {
      el.innerHTML = '<p class="nfp-note">Preview coming soon.</p>';
      if (el.dataset.hideEmpty !== undefined) el.hidden = true;
      return;
    }

    var multi = tracks.length > 1;
    el.innerHTML =
      '<div class="nfp-head">' +
        '<div class="nfp-art"></div>' +
        '<div class="nfp-meta"><span class="nfp-eyebrow">Preview' + (sel.title ? ' \u00B7 ' + esc(sel.title) : '') + '</span>' +
        '<span class="nfp-title"></span><span class="nfp-artist"></span></div>' +
        '<div class="nfp-controls">' +
          (multi ? '<button class="nfp-btn nfp-prev" type="button" aria-label="Previous track">' + ICON.prev + '</button>' : '') +
          '<button class="nfp-btn nfp-play" type="button" aria-label="Play preview">' + ICON.play + '</button>' +
          (multi ? '<button class="nfp-btn nfp-next" type="button" aria-label="Next track">' + ICON.next + '</button>' : '') +
          '<span class="nfp-vol"><button class="nfp-btn nfp-mute" type="button" aria-label="Mute">' + ICON.vol + '</button>' +
          '<input class="nfp-range nfp-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></span>' +
        '</div>' +
      '</div>' +
      '<div class="nfp-bar"><time class="nfp-cur">0:00</time>' +
        '<input class="nfp-range nfp-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">' +
        '<time class="nfp-tot">0:00</time></div>' +
      (multi ? '<ol class="nfp-list">' + tracks.map(function (t, i) {
        return '<li><button class="nfp-item" type="button" data-i="' + i + '">' +
          '<span class="nfp-n">' + ('0' + (i + 1)).slice(-2) + '</span>' +
          '<span class="nfp-name">' + esc(t.title) + '</span>' +
          '<span class="nfp-dur">' + (t.duration ? fmt(t.duration) : '') + '</span></button></li>';
      }).join('') + '</ol>' : '');

    var $ = function (c) { return el.querySelector(c); };
    var audio = new Audio();
    audio.preload = 'metadata';
    var idx = 0, seeking = false;
    var playBtn = $('.nfp-play'), seek = $('.nfp-seek'), vol = $('.nfp-volume'), muteBtn = $('.nfp-mute');

    function paint(range) { range.style.setProperty('--p', (range.value / range.max * 100) + '%'); }

    function load(i, autoplay) {
      idx = (i + tracks.length) % tracks.length;
      var t = tracks[idx];
      audio.src = url(t.file_url);
      $('.nfp-title').textContent = t.title || 'Untitled';
      $('.nfp-artist').textContent = t.artist || defArtist;
      var art = t.artwork_url ? url(t.artwork_url) : '';
      $('.nfp-art').innerHTML = art ? '<img src="' + esc(art) + '" alt="" loading="lazy">' : '';
      $('.nfp-tot').textContent = t.duration ? fmt(t.duration) : '0:00';
      $('.nfp-cur').textContent = '0:00';
      seek.value = 0; paint(seek);
      el.querySelectorAll('.nfp-item').forEach(function (b) {
        b.setAttribute('aria-current', String(+b.dataset.i === idx));
      });
      if (autoplay) play();
    }

    function play() {
      players.forEach(function (p) { if (p !== audio) p.pause(); });
      var pr = audio.play();
      if (pr && pr.catch) pr.catch(function () {});
    }

    playBtn.addEventListener('click', function () { audio.paused ? play() : audio.pause(); });
    if (multi) {
      $('.nfp-prev').addEventListener('click', function () {
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }
        load(idx - 1, !audio.paused);
      });
      $('.nfp-next').addEventListener('click', function () { load(idx + 1, !audio.paused); });
      el.querySelectorAll('.nfp-item').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.dataset.i;
          if (i === idx) { audio.paused ? play() : audio.pause(); } else { load(i, true); }
        });
      });
    }

    audio.addEventListener('play', function () { playBtn.innerHTML = ICON.pause; playBtn.setAttribute('aria-label', 'Pause preview'); });
    audio.addEventListener('pause', function () { playBtn.innerHTML = ICON.play; playBtn.setAttribute('aria-label', 'Play preview'); });
    audio.addEventListener('loadedmetadata', function () { $('.nfp-tot').textContent = fmt(audio.duration); });
    audio.addEventListener('timeupdate', function () {
      $('.nfp-cur').textContent = fmt(audio.currentTime);
      if (!seeking && audio.duration) { seek.value = Math.round(audio.currentTime / audio.duration * 1000); paint(seek); }
    });
    audio.addEventListener('ended', function () {
      if (multi && idx < tracks.length - 1) load(idx + 1, true);
      else { audio.currentTime = 0; }
    });
    audio.addEventListener('error', function () { $('.nfp-artist').textContent = 'Preview unavailable'; });

    seek.addEventListener('input', function () {
      seeking = true; paint(seek);
      if (audio.duration) $('.nfp-cur').textContent = fmt(seek.value / 1000 * audio.duration);
    });
    seek.addEventListener('change', function () {
      if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
      seeking = false;
    });

    vol.addEventListener('input', function () { audio.volume = +vol.value; audio.muted = false; paint(vol); });
    muteBtn.addEventListener('click', function () {
      audio.muted = !audio.muted;
      muteBtn.innerHTML = audio.muted ? ICON.mute : ICON.vol;
      muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
    });
    paint(vol);

    players.push(audio);
    load(0, false);
  }

  function init(root) {
    var els = (root || document).querySelectorAll('[data-netfetti-player]:not(.nfp)');
    if (!els.length) return;
    injectCSS();
    loadCatalog().then(function (cat) {
      els.forEach(function (el) { build(el, cat); });
    }).catch(function () {
      els.forEach(function (el) { el.classList.add('nfp'); el.innerHTML = '<p class="nfp-note">Preview unavailable right now.</p>'; });
    });
  }

  window.NetfettiPlayer = { init: init, catalog: loadCatalog, base: HOME };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})();
