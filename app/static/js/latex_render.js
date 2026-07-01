/**
 * latex_render.js
 * Initialises MathJax 3 for rendering LaTeX in question/solution content.
 * Content blocks with type="latex" are wrapped in \( ... \) by the template.
 */
window.MathJax = {
  tex: {
    inlineMath:  [['\\(', '\\)']],
    displayMath: [['\\[', '\\]']],
    packages: { '[+]': ['ams', 'boldsymbol'] },
  },
  svg: { fontCache: 'global' },
  options: {
    skipHtmlTags: ['script','noscript','style','textarea','pre'],
  },
  startup: {
    ready() {
      MathJax.startup.defaultReady();
    }
  }
};

function renderMath(element) {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([element || document.body]).catch(console.warn);
  }
}

document.addEventListener('DOMContentLoaded', () => renderMath());

window.AIC = window.AIC || {};
window.AIC.renderMath = renderMath;