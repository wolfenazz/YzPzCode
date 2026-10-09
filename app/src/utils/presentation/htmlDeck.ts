// A standalone HTML deck: one self-contained file with every slide (images
// inlined) and a tiny player — arrow keys, click, fullscreen, the deck's
// transition. Speaker notes are left out. Dependency-free.

import { PX_PER_IN, SLIDE_HEIGHT, slideWidth } from './layouts';
import { slideHtml, type StaticAssets } from './printHtml';
import type { PlanContext } from './render';
import { escapeHtml } from './richText';
import type { Slide, SlideTransition } from './types';

const PLAYER = `
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .frame'));
  var counter = document.getElementById('counter');
  var index = Math.max(0, Math.min(slides.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
  function fit() {
    var deck = document.querySelector('.deck');
    var w = deck.dataset.w, h = deck.dataset.h;
    var scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    slides.forEach(function (s) { s.style.transform = 'translate(-50%, -50%) scale(' + scale + ')'; });
  }
  function show(next, back) {
    next = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach(function (s, i) {
      s.classList.toggle('is-current', i === next);
      s.classList.toggle('is-before', i < next);
      s.classList.toggle('is-back', !!back);
    });
    index = next;
    counter.textContent = (index + 1) + ' / ' + slides.length;
    history.replaceState(null, '', '#' + (index + 1));
  }
  document.addEventListener('keydown', function (e) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].indexOf(e.key) >= 0) { e.preventDefault(); show(index + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].indexOf(e.key) >= 0) { e.preventDefault(); show(index - 1, true); }
    else if (e.key === 'Home') show(0, true);
    else if (e.key === 'End') show(slides.length - 1);
    else if (e.key === 'f' || e.key === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.ui')) show(index + 1); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); show(index - 1, true); });
  document.getElementById('prev').onclick = function () { show(index - 1, true); };
  document.getElementById('next').onclick = function () { show(index + 1); };
  document.getElementById('full').onclick = function () { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };
  window.addEventListener('resize', fit);
  fit();
  show(index);
})();
`;

function transitionCss(transition: SlideTransition): string {
  if (transition === 'slide') {
    return `.deck > .frame { transition: transform 0s, translate 450ms cubic-bezier(.32,.72,0,1), opacity 0s 450ms; translate: 100vw 0; opacity: 0; }
.deck > .frame.is-before { translate: -100vw 0; }
.deck > .frame.is-current { translate: 0 0; opacity: 1; transition: transform 0s, translate 450ms cubic-bezier(.32,.72,0,1), opacity 0s; }`;
  }
  if (transition === 'fade') {
    return `.deck > .frame { opacity: 0; transition: opacity 350ms ease; }
.deck > .frame.is-current { opacity: 1; }`;
  }
  return `.deck > .frame { opacity: 0; }
.deck > .frame.is-current { opacity: 1; }`;
}

export function buildStandaloneDeckHtml(context: PlanContext & { title: string; transition: SlideTransition }, slides: Slide[], assets: StaticAssets): string {
  const width = Math.round(slideWidth(context.size) * PX_PER_IN);
  const height = Math.round(SLIDE_HEIGHT * PX_PER_IN);
  const visible = slides.map((slide, index) => ({ slide, index })).filter(({ slide }) => !slide.hidden);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(context.title)}</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0b0d; font-family: system-ui, sans-serif; }
.deck { position: fixed; inset: 0; }
.deck > .frame { position: absolute; top: 50%; left: 50%; transform-origin: center; pointer-events: none; }
.deck > .frame.is-current { pointer-events: auto; }
.slide p { margin: 0; }
${transitionCss(context.transition)}
.ui { position: fixed; right: 16px; bottom: 14px; display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-radius: 10px; background: rgba(20,20,24,.72); color: #f4f4f5; font-size: 12px; opacity: 0; transition: opacity 200ms ease; }
body:hover .ui { opacity: 1; }
.ui button { border: 0; border-radius: 6px; padding: 5px 9px; background: rgba(255,255,255,.1); color: inherit; font: inherit; cursor: pointer; }
.ui button:hover { background: rgba(255,255,255,.2); }
@media print { .ui { display: none; } }
@media (prefers-reduced-motion: reduce) { .deck > .frame { transition: none !important; } }
</style>
</head>
<body>
<div class="deck" data-w="${width}" data-h="${height}">
${visible.map(({ slide, index }) => `<div class="frame" style="width:${width}px;height:${height}px">${slideHtml(context, slide, index, assets)}</div>`).join('\n')}
</div>
<div class="ui"><button id="prev" aria-label="Previous slide">&#8592;</button><span id="counter"></span><button id="next" aria-label="Next slide">&#8594;</button><button id="full">Fullscreen (F)</button></div>
<script>${PLAYER}</script>
</body>
</html>
`;
}
