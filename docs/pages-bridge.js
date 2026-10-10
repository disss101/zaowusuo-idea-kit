// The public GitHub Pages copy keeps the exact frontend. The original Site
// remains the only origin with login, AI, database, uploads, and staff APIs.
(function () {
  const live = 'https://zaowusuo-idea-kit.victoriapoter513.chatgpt.site/';
  function forward() {
    const route = location.hash;
    if (!route || route === '#/' || !route.startsWith('#/')) return;
    location.replace(live + route);
  }
  window.addEventListener('hashchange', forward);
  forward();
})();
