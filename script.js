// Hero GIF cycling
(function () {
  var gifs = ['Images/Idle.gif', 'Images/Wiring.gif', 'Images/Curl.gif'];
  var img = document.querySelector('.hero-character img');
  if (!img) return;
  var current = 0;
  setInterval(function () {
    img.style.opacity = '0';
    setTimeout(function () {
      current = (current + 1) % gifs.length;
      img.src = gifs[current];
      img.style.opacity = '1';
    }, 300);
  }, 8000);
})();

// Pixel character speech bubble
(function () {
  var messages = [
    "hey, click something!",
    "nice to meet you \uD83D\uDC4B",
    "let's build something cool",
    "you scrolled all the way down?",
    "hire me for co-op maybe?",
    "I also make cool 3D prints",
    "currently tinkering with AI",
    "this site was fun to build"
  ];

  var wrap = document.querySelector('.contact-pixel-wrap');
  var textEl = document.querySelector('.pixel-bubble-text');
  if (!wrap || !textEl) return;

  // Pre-populate so the bubble has a size before first hover
  textEl.textContent = messages[Math.floor(Math.random() * messages.length)];

  wrap.addEventListener('mouseenter', function () {
    textEl.textContent = messages[Math.floor(Math.random() * messages.length)];
  });
})();

// Fade-in on scroll
const fadeEls = document.querySelectorAll('.fade-in');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

fadeEls.forEach((el) => observer.observe(el));

// Smooth scroll for nav links (fallback for browsers that ignore CSS scroll-behavior)
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href');
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Scroll-linked background video
(function () {
  var video = document.getElementById('bg-video');
  if (!video) return;

  var duration   = 0;
  var targetTime = 0;   // updated on scroll
  var dispTime   = 0;   // lerped toward targetTime each rAF
  var unlocked   = false;
  var loopActive = false;

  // Chrome requires play()/pause() before currentTime writes are allowed
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    video.play().then(function () {
      video.pause();
    }).catch(function (err) {
      console.warn('[bg-video] unlock play() failed:', err);
    });
  }

  // rAF loop: lerp dispTime toward targetTime, write to video.currentTime
  function loop() {
    if (duration > 0) {
      var diff = targetTime - dispTime;
      if (Math.abs(diff) > 0.001) {
        dispTime += diff * 0.12;  // ~12% closer each frame (~80ms convergence at 60fps)
        dispTime = Math.min(duration, Math.max(0, dispTime));
        video.currentTime = dispTime;
        console.log('[bg-video] currentTime ' + dispTime.toFixed(3) + ' \u2192 target ' + targetTime.toFixed(3));
      }
    }
    requestAnimationFrame(loop);
  }

  // Scroll handler: update targetTime only
  window.addEventListener('scroll', function () {
    unlock();
    if (duration > 0) {
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      var fraction  = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
      targetTime = fraction * duration;
      console.log('[bg-video] scroll ' + Math.round(fraction * 100) + '%');
    }
  }, { passive: true });

  // Metadata ready: capture duration, start rAF loop
  video.addEventListener('loadedmetadata', function () {
    duration = video.duration;
    console.log('[bg-video] ready, duration:', duration);
    if (!loopActive) {
      loopActive = true;
      requestAnimationFrame(loop);
    }
  });

  video.addEventListener('error', function () {
    console.warn('[bg-video] failed to load, using fallback background');
    video.style.display = 'none';
  });

  // Fetch preload: download full video into memory as Blob for zero-latency seeks
  fetch('Images/0318-scroll.mp4')
    .then(function (res) { return res.blob(); })
    .then(function (blob) {
      console.log('[bg-video] preloaded ' + (blob.size / 1024 / 1024).toFixed(1) + ' MB');
      video.src = URL.createObjectURL(blob);
      video.load();
    })
    .catch(function (err) {
      console.warn('[bg-video] fetch preload failed, using direct src:', err);
      video.src = 'Images/0318-scroll.mp4';
      video.load();
    });
})();
