/* ============================================================
   portfolio.js — shared behaviour for every page
   Exports: initReveal(), initSlideshow()
   ============================================================ */

// ── Scroll-reveal observer ─────────────────────────────────
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── Filename → caption ─────────────────────────────────────
//
// Converts an image/video src path to a display caption:
//   "../assets/images/nine-hole-peg/hand_tracking_system.jpg"
//   → "HAND TRACKING SYSTEM"
//
// Rules: strip path + extension, replace _ and - with spaces, uppercase.

function filenameToCaption(src) {
  if (!src) return '';
  const filename = src.split('/').pop().split('?')[0]; // strip path & query
  const noExt    = filename.replace(/\.[^.]+$/, '');   // strip extension
  return noExt.replace(/[_-]+/g, ' ').toUpperCase();
}

// Auto-updates every .masonry-caption whose parent .masonry-item contains
// an <img>. Call this once on page load after images are in the DOM.
function initImageCaptions() {
  document.querySelectorAll('.masonry-item').forEach(item => {
    const img     = item.querySelector('img');
    if (!img) return;
    const caption = item.querySelector('.masonry-caption');
    if (!caption) return;
    const derived = filenameToCaption(img.getAttribute('src'));
    if (derived) caption.textContent = derived;
  });
}

// ── Personal projects grid ─────────────────────────────────
//
// Cycles images inside every .personal-tile and wires up
// the hover-highlight link between .personal-item and .personal-tile
// (matched via their shared data-project="slug" attribute).
//
// To add images to a tile, put them as:
//   <img class="tile-img active" src="..." alt="...">   ← first/visible
//   <img class="tile-img"        src="..." alt="...">   ← subsequent
// inside the <div class="tile-imgs"> of the tile.

function initPersonalTiles() {
  // ── Image cycling per tile ──────────────────────────────
  document.querySelectorAll('.personal-tile').forEach((tile, idx) => {
    const imgs = tile.querySelectorAll('.tile-img');
    if (imgs.length < 2) return;
    let cur = 0;
    // Stagger each tile's start so they don't all flip at the same instant
    setTimeout(() => {
      setInterval(() => {
        imgs[cur].classList.remove('active');
        cur = (cur + 1) % imgs.length;
        imgs[cur].classList.add('active');
      }, 3000);
    }, idx * 450);
  });

  // ── Hover highlight: list item ↔ grid tile ───────────────
  document.querySelectorAll('.personal-item[data-project]').forEach(item => {
    const slug = item.dataset.project;
    const tile = document.querySelector(`.personal-tile[data-project="${slug}"]`);
    if (!tile) return;
    item.addEventListener('mouseenter', () => tile.classList.add('is-highlighted'));
    item.addEventListener('mouseleave', () => tile.classList.remove('is-highlighted'));
  });
}

// ── YouTube helpers ────────────────────────────────────────

// Extract video ID from any common YouTube URL format
function youtubeId(url) {
  const patterns = [
    /[?&]v=([^&#]+)/,        // watch?v=
    /youtu\.be\/([^?&#]+)/,  // youtu.be/
    /\/shorts\/([^?&#]+)/,   // /shorts/
    /\/embed\/([^?&#]+)/,    // /embed/
  ];
  for (const p of patterns) {
    const m = (url || '').match(p);
    if (m) return m[1];
  }
  return null;
}

// Parse the CSV text into [{url, caption}] items
function parseYoutubeCsv(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf(',');
      return {
        url:     idx > -1 ? l.slice(0, idx).trim() : l.trim(),
        caption: idx > -1 ? l.slice(idx + 1).trim() : '',
      };
    })
    .filter(item => youtubeId(item.url));
}

// Build a <div class="slide"> for a YouTube video
function buildYtSlide(item) {
  const vid  = youtubeId(item.url);
  const div  = document.createElement('div');
  div.className        = 'slide';
  div.dataset.ytId     = vid;
  div.dataset.ytCaption = item.caption || '';
  // Store the embed URL in data-src; we set iframe.src only when the slide is active
  const origin = encodeURIComponent(window.location.origin);
  const embedSrc = `https://www.youtube.com/embed/${vid}?rel=0&modestbranding=1&autoplay=1&enablejsapi=1&playsinline=1&origin=${origin}`;
  div.innerHTML = `
    <div class="yt-wrap">
      <iframe
        data-src="${embedSrc}"
        src=""
        frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
        title="${item.caption || 'Project video'}"
      ></iframe>
      ${item.caption ? `<span class="yt-caption">${item.caption}</span>` : ''}
    </div>`;
  return div;
}

// ── Slideshow (images + local videos + YouTube) ────────────
//
// HTML pattern inside the container element:
//
//   <div class="slideshow-section">
//     <div class="slideshow" id="SLIDESHOW_ID">
//       <!-- Image slide -->
//       <div class="slide active">
//         <img src="path/to/image.jpg" alt="Caption">
//       </div>
//       <!-- Local video slide -->
//       <div class="slide">
//         <video muted playsinline>
//           <source src="path/to/video.mp4" type="video/mp4">
//         </video>
//       </div>
//       <!-- Placeholder (until media is added) -->
//       <div class="slide">
//         <div class="placeholder-img"></div>
//       </div>
//     </div>
//     <div class="slideshow-progress" id="PROGRESS_ID"></div>
//     <div class="slideshow-dots"     id="DOTS_ID"></div>
//     <span class="slideshow-counter" id="COUNTER_ID">1 / N</span>
//   </div>
//
// YouTube slides are loaded from csvPath (optional) and
// prepended before the static slides. Video slides (local + YouTube)
// advance when playback ends. Image/placeholder slides advance at 3 s.

async function initSlideshow(slideshowId, dotsId, counterId, progressId, csvPath) {
  const wrapper = document.getElementById(slideshowId);
  if (!wrapper) return;

  // ── 1. Fetch & inject YouTube slides ─────────────────────
  if (csvPath) {
    try {
      const resp = await fetch(csvPath);
      if (resp.ok) {
        const items = parseYoutubeCsv(await resp.text());
        if (items.length) {
          // Deactivate the current first slide
          const prev = wrapper.querySelector('.slide.active');
          if (prev) prev.classList.remove('active');
          // Prepend YouTube slides (insert in reverse so order is preserved)
          const ytSlides = items.map(buildYtSlide);
          ytSlides[0].classList.add('active');
          [...ytSlides].reverse().forEach(s => wrapper.insertBefore(s, wrapper.firstChild));
        }
      }
    } catch (_) {
      // CSV not found or fetch error — silently fall back to static slides
    }
  }

  // ── 2. Collect elements ───────────────────────────────────
  const slides     = wrapper.querySelectorAll('.slide');
  const dotsEl     = document.getElementById(dotsId);
  const counterEl  = document.getElementById(counterId);
  const progressEl = document.getElementById(progressId);
  if (!dotsEl || !counterEl || !progressEl) return;
  const total      = slides.length;
  if (total < 1) return;

  // Single-slide shortcut: just activate it (important for lone YouTube slides)
  if (total === 1) {
    const only = slides[0];
    const iframe = only.querySelector('iframe[data-src]');
    if (iframe) {
      const cur = iframe.getAttribute('src') || '';
      if (cur === '' || cur === 'about:blank') iframe.src = iframe.dataset.src;
    }
    if (counterEl) counterEl.textContent = '1 / 1';
    return;
  }

  let current  = 0;
  let timer    = null;
  let rafId    = null;
  let progressCleanup = null;
  let isPaused = false;
  const ytStates = new Map();

  // Find which slide is initially active
  slides.forEach((s, i) => { if (s.classList.contains('active')) current = i; });

  // ── 3. Build dot indicators ───────────────────────────────
  slides.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.className = 'slideshow-dot' + (i === current ? ' active' : '');
    btn.setAttribute('aria-label', 'Slide ' + (i + 1));
    btn.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(btn);
  });
  counterEl.textContent = (current + 1) + ' / ' + total;

  // ── 4. Side arrows + caption bar (auto-injected) ─────────
  const section = wrapper.closest('.slideshow-section');
  let captionEl = null;
  if (section) {
    const prevArrow = document.createElement('button');
    prevArrow.className = 'slideshow-prev';
    prevArrow.setAttribute('aria-label', 'Previous slide');
    prevArrow.textContent = '←';
    prevArrow.addEventListener('click', () => goTo(current - 1));
    section.appendChild(prevArrow);

    const nextArrow = document.createElement('button');
    nextArrow.className = 'slideshow-next';
    nextArrow.setAttribute('aria-label', 'Next slide');
    nextArrow.textContent = '→';
    nextArrow.addEventListener('click', () => goTo(current + 1));
    section.appendChild(nextArrow);

    captionEl = document.createElement('span');
    captionEl.className = 'slideshow-caption';
    section.appendChild(captionEl);
  }

  function updateCaption(slideEl) {
    if (!captionEl) return;
    const img = slideEl.querySelector('img');
    const vid = slideEl.querySelector('video');
    if (img) {
      captionEl.textContent = filenameToCaption(img.getAttribute('src'));
    } else if (slideEl.dataset.ytCaption) {
      captionEl.textContent = slideEl.dataset.ytCaption.toUpperCase();
    } else if (vid) {
      const src = slideEl.querySelector('source')?.getAttribute('src') || vid.getAttribute('src');
      captionEl.textContent = filenameToCaption(src);
    } else {
      captionEl.textContent = '';
    }
  }

  // ── 5. Helpers ────────────────────────────────────────────
  function getVideo(el)  { return el.querySelector('video'); }
  function getIframe(el) { return el.querySelector('iframe'); }
  function isYt(el)      { return !!el.dataset.ytId || !!el.querySelector('iframe'); }
  function getYtState(iframe) {
    if (!ytStates.has(iframe)) {
      ytStates.set(iframe, {
        duration: 0,
        currentTime: 0,
      });
    }
    return ytStates.get(iframe);
  }
  function postYt(iframe, payload) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
    }
  }
  function trackYt(iframe) {
    if (!iframe) return;
    const state = getYtState(iframe);
    if (state.onLoad) return;
    state.onLoad = () => {
      postYt(iframe, { event: 'listening', id: iframe.id || undefined, channel: 'widget' });
      postYt(iframe, { event: 'command', func: 'addEventListener', args: ['onReady'] });
      postYt(iframe, { event: 'command', func: 'addEventListener', args: ['onStateChange'] });
      postYt(iframe, { event: 'command', func: 'addEventListener', args: ['infoDelivery'] });
    };
    iframe.addEventListener('load', state.onLoad);
    const cur = iframe.getAttribute('src') || '';
    if (cur && cur !== 'about:blank') state.onLoad();
  }

  function stopAll() {
    clearTimeout(timer);         timer = null;
    cancelAnimationFrame(rafId); rafId = null;
    if (progressCleanup) { progressCleanup(); progressCleanup = null; }
  }

  // Activate / deactivate YouTube iframe (set/clear src to play/stop)
  // Use getAttribute('src') because iframe.src (the property) always resolves
  // to a full URL even when the attribute is "" or "about:blank".
  function activateYt(slideEl) {
    const iframe = getIframe(slideEl);
    if (!iframe || !iframe.dataset.src) return;
    const cur = iframe.getAttribute('src') || '';
    if (cur === '' || cur === 'about:blank') {
      iframe.src = iframe.dataset.src;
    }
    trackYt(iframe);
    const state = getYtState(iframe);
    state.currentTime = 0;
    state.duration = 0;
    postYt(iframe, { event: 'command', func: 'playVideo', args: [] });
  }
  function deactivateYt(slideEl) {
    const iframe = getIframe(slideEl);
    if (!iframe) return;
    postYt(iframe, { event: 'command', func: 'pauseVideo', args: [] });
    postYt(iframe, { event: 'command', func: 'seekTo', args: [0, true] });
    iframe.setAttribute('src', 'about:blank');
  }

  // Start the animated progress bar for the current slide
  function startProgress(slideEl, duration, ytSlide) {
    const video = getVideo(slideEl);
    progressEl.classList.remove('running');
    progressEl.style.removeProperty('--progress-dur');
    progressEl.style.width = '';
    cancelAnimationFrame(rafId); rafId = null;
    if (progressCleanup) { progressCleanup(); progressCleanup = null; }

    if (video) {
      // JS-driven: track local video playback progress
      progressEl.style.width = '0%';
      const update = () => {
        const pct = video.duration ? Math.min(100, (video.currentTime / video.duration) * 100) : 0;
        progressEl.style.width = pct + '%';
      };
      ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'play', 'pause'].forEach(evt => {
        video.addEventListener(evt, update);
      });
      progressCleanup = () => {
        ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'play', 'pause'].forEach(evt => {
          video.removeEventListener(evt, update);
        });
      };
      update();
    } else if (ytSlide) {
      // JS-driven: width is updated from YouTube infoDelivery events
      progressEl.style.width = '0%';
    } else {
      // CSS keyframe animation with configurable duration
      progressEl.style.setProperty('--progress-dur', (duration || 3) + 's');
      void progressEl.offsetWidth; // force reflow to restart animation
      progressEl.classList.add('running');
    }
  }

  function onYtMessage(event) {
    if (typeof event.data !== 'string') return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    let matchedIframe = null;
    for (const iframe of ytStates.keys()) {
      if (iframe.contentWindow === event.source) {
        matchedIframe = iframe;
        break;
      }
    }
    if (!matchedIframe) return;

    const state = getYtState(matchedIframe);
    const activeSlide = slides[current];
    const isActive = activeSlide && activeSlide.contains(matchedIframe);

    if (payload.event === 'onReady' && isActive) {
      postYt(matchedIframe, { event: 'command', func: 'playVideo', args: [] });
      return;
    }

    if (payload.event === 'onStateChange' && Number(payload.info) === 0 && isActive && !isPaused) {
      progressEl.style.width = '100%';
      goTo(current + 1);
      return;
    }

    if (payload.event === 'infoDelivery' && payload.info) {
      if (typeof payload.info.duration === 'number' && payload.info.duration > 0) {
        state.duration = payload.info.duration;
      }
      if (typeof payload.info.currentTime === 'number') {
        state.currentTime = payload.info.currentTime;
      }
      if (isActive && state.duration > 0) {
        const pct = Math.min(100, (state.currentTime / state.duration) * 100);
        progressEl.style.width = pct + '%';
      }
    }
  }

  window.addEventListener('message', onYtMessage);

  // ── 5. Core slide activation ──────────────────────────────
  function startSlide(slideEl) {
    const video    = getVideo(slideEl);
    const ytSlide  = isYt(slideEl);
    const duration = 3;

    startProgress(slideEl, duration, ytSlide);

    if (video) {
      // Local video: advance when the video finishes
      video.currentTime = 0;
      video.play().catch(() => {});
      video.onended = () => { if (!isPaused) goTo(current + 1); };
    } else if (ytSlide) {
      // YouTube: load iframe and advance only when playback ends
      activateYt(slideEl);
    } else {
      // Image / placeholder: advance after 3 s
      timer = setTimeout(() => { if (!isPaused) goTo(current + 1); }, 3000);
    }
  }

  function goTo(n) {
    stopAll();

    // --- Deactivate current slide ---
    const prev      = slides[current];
    const prevVideo = getVideo(prev);
    if (prevVideo) { prevVideo.pause(); prevVideo.currentTime = 0; prevVideo.onended = null; }
    deactivateYt(prev);
    prev.classList.remove('active');
    dotsEl.children[current].classList.remove('active');

    // --- Activate next slide ---
    current = ((n % total) + total) % total;
    slides[current].classList.add('active');
    dotsEl.children[current].classList.add('active');
    counterEl.textContent = (current + 1) + ' / ' + total;
    updateCaption(slides[current]);

    if (!isPaused) startSlide(slides[current]);
  }

  // ── 6. Drag / swipe navigation (desktop + touch) ──────────
  if (section) {
    let pointerDown = false;
    let startX = 0;
    let startY = 0;
    const dragThreshold = 45;

    section.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerDown = true;
      startX = e.clientX;
      startY = e.clientY;
    });

    function endPointer(e) {
      if (!pointerDown) return;
      pointerDown = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (Math.abs(dx) < dragThreshold) return;
      if (dx < 0) goTo(current + 1);
      else goTo(current - 1);
    }

    section.addEventListener('pointerup', endPointer);
    section.addEventListener('pointercancel', () => { pointerDown = false; });
  }

  // ── 7. Keyboard navigation (← →) ─────────────────────────
  document.addEventListener('keydown', e => {
    if (!section) return;
    if (e.key === 'ArrowRight') goTo(current + 1);
    if (e.key === 'ArrowLeft')  goTo(current - 1);
  });

  // ── 8. Kick off ───────────────────────────────────────────
  updateCaption(slides[current]);
  startSlide(slides[current]);
}

// ── Lightbox ───────────────────────────────────────────────
//
// Call initLightbox() once per page after the DOM is ready.
// Clicking any .masonry-item opens a full-screen overlay.
// Images are shown full-size; gallery videos play in a 16:9 embed.
// Navigate with ← → buttons, arrow keys, or swipe. Close with ✕ or Esc.

function initLightbox() {
  const items = Array.from(document.querySelectorAll('.masonry-item'));
  if (!items.length) return;

  // ── Build overlay ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <button class="lb-close" aria-label="Close lightbox">✕</button>
    <button class="lb-prev"  aria-label="Previous">←</button>
    <button class="lb-next"  aria-label="Next">→</button>
    <div class="lb-content"></div>
    <span class="lb-caption"></span>
  `;
  document.body.appendChild(overlay);

  const contentEl = overlay.querySelector('.lb-content');
  const captionEl = overlay.querySelector('.lb-caption');
  const closeBtn  = overlay.querySelector('.lb-close');
  const prevBtn   = overlay.querySelector('.lb-prev');
  const nextBtn   = overlay.querySelector('.lb-next');

  let cur = 0;

  function render() {
    contentEl.innerHTML = '';
    const item    = items[cur];
    const img     = item.querySelector('img');
    const vid     = item.querySelector('video');
    const iframe  = item.querySelector('.masonry-video iframe');
    const capSpan = item.querySelector('.masonry-caption');

    if (img) {
      const el  = document.createElement('img');
      el.src    = img.src;
      el.alt    = img.alt || '';
      contentEl.appendChild(el);
    } else if (vid) {
      const el = document.createElement('video');
      el.setAttribute('controls', '');
      el.setAttribute('playsinline', '');
      el.muted = true;
      el.loop = true;
      vid.querySelectorAll('source').forEach(s => {
        const src = document.createElement('source');
        src.src = s.src;
        if (s.type) src.type = s.type;
        el.appendChild(src);
      });
      el.load();
      el.play().catch(() => {});
      contentEl.appendChild(el);
    } else if (iframe) {
      const wrap = document.createElement('div');
      wrap.className = 'lb-video';
      const el = document.createElement('iframe');
      // Reuse the gallery src but add autoplay for the lightbox view
      const base = iframe.src.split('?')[0];
      el.src = base + '?rel=0&modestbranding=1&autoplay=1';
      el.setAttribute('frameborder', '0');
      el.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      el.setAttribute('allowfullscreen', '');
      wrap.appendChild(el);
      contentEl.appendChild(wrap);
    }

    captionEl.textContent = capSpan ? capSpan.textContent : '';
    prevBtn.style.visibility = items.length > 1 ? 'visible' : 'hidden';
    nextBtn.style.visibility = items.length > 1 ? 'visible' : 'hidden';
  }

  function open(idx) {
    cur = idx;
    render();
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    contentEl.innerHTML = ''; // stop any video playback
  }

  function step(dir) {
    cur = ((cur + dir) % items.length + items.length) % items.length;
    render();
  }

  // ── Wire masonry items ─────────────────────────────────────
  items.forEach((item, idx) => {
    item.addEventListener('click', () => open(idx));
  });

  // ── Controls ───────────────────────────────────────────────
  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click',  e => { e.stopPropagation(); step(-1); });
  nextBtn.addEventListener('click',  e => { e.stopPropagation(); step(1);  });

  // Close on backdrop click (not on content click)
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('active')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft')  step(-1);
  });

  // ── Touch / drag swipe inside lightbox ────────────────────
  let lbStartX = 0;
  contentEl.addEventListener('pointerdown', e => { lbStartX = e.clientX; });
  contentEl.addEventListener('pointerup',   e => {
    const dx = e.clientX - lbStartX;
    if (Math.abs(dx) < 50) return;
    step(dx < 0 ? 1 : -1);
  });
}
