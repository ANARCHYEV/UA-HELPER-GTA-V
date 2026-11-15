(() => {
  const body = document.body;
  const motionToggle = document.querySelector('[data-motion-toggle]');
  const wordTargets = [...document.querySelectorAll('[data-reveal-words] span')];
  const topographicSlots = [...document.querySelectorAll('[data-topographic-slot]')];

  motionToggle?.addEventListener('click', () => {
    const paused = body.dataset.motionPaused === 'true';
    body.dataset.motionPaused = String(!paused);
    const label = paused ? 'Призупинити рух тла' : 'Увімкнути рух тла';
    motionToggle.setAttribute('aria-label', label);
    motionToggle.setAttribute('title', label);
    const icon = motionToggle.querySelector('span');
    if (icon) icon.textContent = paused ? 'Ⅱ' : '▶';
  });

  const loadTopographicBackground = async () => {
    if (!topographicSlots.length) return;

    try {
      const response = await fetch('/assets/topographic-source.svg', { cache: 'force-cache' });
      if (!response.ok) return;

      const source = await response.text();
      const topographicEnd = source.indexOf('</svg>');
      if (topographicEnd < 0) return;

      const documentSource = new DOMParser().parseFromString(source.slice(0, topographicEnd + 6), 'image/svg+xml');
      const paths = [...documentSource.querySelectorAll('path')];
      if (!paths.length) return;

      for (const slot of topographicSlots) {
        for (const path of paths) {
          const contour = document.importNode(path, true);
          contour.removeAttribute('stroke');
          contour.removeAttribute('stroke-width');
          slot.append(contour);
        }
      }
      body.dataset.topographyLoaded = 'true';
    } catch {
      // The page remains readable if the decorative asset cannot be loaded.
    }
  };

  loadTopographicBackground();

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && wordTargets.length) {
    const revealWords = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        wordTargets.forEach((word, index) => window.setTimeout(() => word.classList.add('is-visible'), index * 80));
        observer.disconnect();
      }
    }, { threshold: .45 });
    revealWords.observe(wordTargets[0].parentElement);
  }
})();
