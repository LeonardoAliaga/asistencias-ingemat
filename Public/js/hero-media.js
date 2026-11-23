(() => {
  const hero = document.getElementById("inicio");
  const photo = document.getElementById("hero-background-photo");
  const videos = [...hero.querySelectorAll(".site-hero-background video")];
  const toggle = document.getElementById("hero-background-toggle");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const unavailable = new Set();
  const photoDuration = 5000;
  let enabled = !motion.matches;
  let inView = false;
  let current;
  let visibleVideo;
  let photoTimer;
  let photoStarted;
  let photoRemaining = photoDuration;

  function updateToggle() {
    toggle.hidden = unavailable.size === videos.length;
    toggle.querySelector("span").textContent = enabled
      ? "Pausar fondo"
      : "Reproducir fondo";
    toggle.querySelector("i").className = enabled
      ? "bi bi-pause-fill"
      : "bi bi-play-fill";
  }

  function mayPlay() {
    return (
      enabled && inView && !document.hidden && unavailable.size < videos.length
    );
  }

  function nextVideo() {
    const start = current ? videos.indexOf(current) + 1 : 0;
    return videos.slice(start).find((video) => !unavailable.has(video));
  }

  function prepare(video) {
    if (video && !video.hasAttribute("src")) {
      video.preload = "auto";
      video.src = video.dataset.src;
    }
  }

  function reveal(video) {
    visibleVideo?.classList.remove("is-visible");
    visibleVideo = video;
    visibleVideo?.classList.add("is-visible");
  }

  function advance() {
    current = nextVideo();
    if (!current) {
      reveal();
      photoRemaining = photoDuration;
    }
    syncPlayback();
  }

  function skip(video) {
    if (unavailable.has(video)) return;
    unavailable.add(video);
    updateToggle();
    if (video === current) advance();
    else syncPlayback();
  }

  function pause() {
    if (photoTimer !== undefined) {
      window.clearTimeout(photoTimer);
      photoTimer = undefined;
      photoRemaining = Math.max(
        0,
        photoRemaining - (performance.now() - photoStarted),
      );
    }
    current?.pause();
  }

  function syncPlayback() {
    if (!mayPlay()) {
      pause();
      return;
    }
    if (!current) {
      if (photoTimer === undefined && photo.complete) {
        prepare(nextVideo());
        photoStarted = performance.now();
        photoTimer = window.setTimeout(() => {
          photoTimer = undefined;
          advance();
        }, photoRemaining);
      }
      return;
    }
    const video = current;
    prepare(video);
    if (!video.paused) return;
    void video.play().catch((error) => {
      if (video !== current || !mayPlay() || error.name === "AbortError")
        return;
      if (error.name === "NotAllowedError") {
        enabled = false;
        updateToggle();
        pause();
      } else {
        skip(video);
      }
    });
  }

  for (const video of videos) {
    video.addEventListener("playing", () => {
      if (video !== current || !mayPlay()) {
        video.pause();
        return;
      }
      reveal(video);
      prepare(nextVideo());
    });
    video.addEventListener("ended", () => {
      if (video === current) advance();
    });
    video.addEventListener("error", () => skip(video));
  }

  for (const event of ["load", "error"])
    photo.addEventListener(event, syncPlayback);
  toggle.addEventListener("click", () => {
    enabled = !enabled;
    updateToggle();
    syncPlayback();
  });
  motion.addEventListener("change", () => {
    if (motion.matches) {
      enabled = false;
      updateToggle();
      pause();
    }
  });
  document.addEventListener("visibilitychange", syncPlayback);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncPlayback();
  }).observe(hero);
  updateToggle();
})();
