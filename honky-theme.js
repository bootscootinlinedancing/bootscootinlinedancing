/* Boot Scootin' v96.0.0 — icons and contained mobile menus */
(() => {
  const icons = {
    '👢':'<path d="M9 3v9.5c0 2.8-1.6 4.3-4 5.5 1.8 2 4.6 3 8.2 3H20c1.1 0 2-.9 2-2v-2.2c0-.9-.6-1.7-1.5-1.9l-5.5-1.4V3z"/><path d="M9 8h6M9 11h6"/>',
    '🤠':'<path d="M4 12c2.5 1.4 5.1 2 8 2s5.5-.6 8-2"/><path d="M7 11l1.3-5h7.4L17 11"/><path d="M8 15c.5 3 1.9 5 4 5s3.5-2 4-5"/>',
    '🎸':'<path d="M14.5 4.5l5-2-2 5-3 3"/><path d="M13 9c-1.6-1.6-4.3-1.5-6 .2s-1.8 4.4-.2 6 4.3 1.5 6-.2 1.8-4.4.2-6z"/><path d="M10.5 12.5l7-7M6.5 17.5l2-2"/>',
    '🎟':'<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M12 7v10"/>',
    '🎉':'<path d="M4 20l4-10 6 6z"/><path d="M13 5l1-3M17 7l3-2M16 11l4 1"/><path d="M8 10l6 6"/>',
    '📷':'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 6l1.5-2h5L16 6"/><circle cx="12" cy="12.5" r="3.5"/>',
    '📅':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><path d="M8 14h2M14 14h2M8 18h2"/>',
    '📕':'<path d="M5 4h12a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2z"/><path d="M7 4v17M9 8h6"/>',
    '👤':'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.4 3.5-6.5 8-6.5s7.2 2.1 8 6.5"/>',
    '🌵':'<path d="M12 22V7a3 3 0 0 1 6 0v4"/><path d="M12 14H8a3 3 0 0 1-3-3V8"/><path d="M8 22h8"/>',
    '⭐':'<path d="M12 2l2.8 6 6.2.7-4.6 4.2 1.3 6.1L12 16l-5.7 3 1.3-6.1L3 8.7 9.2 8z"/>',
    '🎁':'<rect x="3" y="9" width="18" height="12"/><path d="M12 9v12M3 13h18M7.5 9c-2.5 0-3.5-1.3-3.5-2.6S5 4 6.3 4C9 4 12 9 12 9M16.5 9C19 9 20 7.7 20 6.4S19 4 17.7 4C15 4 12 9 12 9"/>',
    '📍':'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
    '🔒':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    '🏆':'<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 22h8M9 18h6"/>',
    '♥':'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>'
  };

  const makeIcon = (emoji) => {
    const span = document.createElement('span');
    span.className = 'bs-icon';
    span.setAttribute('aria-hidden','true');
    span.innerHTML = `<svg viewBox="0 0 24 24">${icons[emoji]}</svg>`;
    return span;
  };

  document.querySelectorAll('span, a, button, h3, p').forEach(el => {
    if (el.children.length) return;
    const value = el.textContent.trim();
    if (icons[value]) el.replaceChildren(makeIcon(value));
  });

  document.querySelectorAll('.admin-login-link').forEach(el => {
    const text = el.textContent.replace('🔒','').trim();
    el.replaceChildren(makeIcon('🔒'), document.createTextNode(` ${text}`));
  });

})();
