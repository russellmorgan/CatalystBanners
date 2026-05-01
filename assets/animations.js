/**
 * Reusable GSAP animations for Catalyst Banners
 * Global animation library for consistent, sequenced effects
 */

/**
 * Animate a colored block sliding in from the left, then fade in nested content.
 *
 * Required CSS setup:
 * ```css
 * .color-block {
 *   transform: translateX(-100%);
 * }
 * img {
 *   opacity: 0;
 *   visibility: hidden;
 * }
 * ```
 *
 * HTML structure:
 * ```html
 * <div class="color-block-animation">
 *   <div class="color-block"></div>
 *   <img src="assets/frame.png" alt="Frame content" />
 * </div>
 * ```
 *
 * Usage:
 * ```javascript
 * const container = document.querySelector('.color-block-animation');
 * const animation = createColorBlockWithFadeAnimation(container, {
 *   blockDuration: 1.2,
 *   fadeDuration: 0.8
 * });
 * animation.play(); // or integrate into main timeline
 * ```
 *
 * @param {HTMLElement} container - Parent element containing block and image
 * @param {Object} options - Configuration options
 * @param {string} options.blockSelector - CSS selector for colored block (default: '.color-block')
 * @param {string} options.imageSelector - CSS selector for nested image (default: 'img')
 * @param {number} options.blockDuration - Block slide duration in seconds (default: 1)
 * @param {number} options.fadeDuration - Image fade duration in seconds (default: 0.6)
 * @param {string} options.blockEase - GSAP easing for block animation (default: 'power2.out')
 * @param {string} options.fadeEase - GSAP easing for fade animation (default: 'power1.inOut')
 * @returns {gsap.Timeline|null} Timeline instance or null if elements not found
 */
export function createColorBlockWithFadeAnimation(container, options = {}) {
  const {
    blockSelector = '.color-block',
    imageSelector = 'img',
    blockDuration = 1,
    fadeDuration = 0.6,
    blockEase = 'power2.out',
    fadeEase = 'power1.inOut'
  } = options;

  const block = container.querySelector(blockSelector);
  const img = container.querySelector(imageSelector);

  if (!block || !img) {
    console.warn('[animations.js] createColorBlockWithFadeAnimation: block or image not found', {
      blockFound: !!block,
      imageFound: !!img
    });
    return null;
  }

  const tl = gsap.timeline();

  tl.fromTo(block,
      { xPercent: -100 },
      { xPercent: 0, duration: blockDuration, ease: blockEase }
    )
    .to(img, { autoAlpha: 1, duration: fadeDuration, ease: fadeEase }, `>-${fadeDuration * 0.5}`);

  return tl;
}
