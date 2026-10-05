/*
 * Wheel of Life v2 — deployment configuration.
 *
 * Only values that differ between environments live here.
 * Assessment content (questions, copy) lives in js/data.js.
 */
window.LW2_CONFIG = {
  // Destination of the "stress management course" button.
  // Leave empty until the real URL is approved: the button is then not shown
  // to visitors. Only absolute http(s) URLs or site-relative paths starting
  // with "/" are accepted; anything else is ignored.
  courseUrl: "",

  // Developer-only notes (e.g. "course URL not configured yet") and a disabled
  // placeholder button are shown ONLY when this is true, or when the page URL
  // has the hash #lw2-preview. Keep false in production: with no courseUrl the
  // visitor then simply sees the course card without a button.
  previewMode: false
};
