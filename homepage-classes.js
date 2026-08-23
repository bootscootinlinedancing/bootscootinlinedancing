(() => {
  const grids = [...document.querySelectorAll('[data-live-home-classes]')];
  if (!grids.length) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[character]);
  const venueLabel = venue => /^(low places bar|low places bar birmingham)$/i.test(String(venue || '').trim())
    ? 'Low Places Bar Birmingham'
    : String(venue || '').trim();
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2
  }).format(Number(value) || 0);
  const dateLabel = value => new Intl.DateTimeFormat('en-GB', {
    weekday:'short', day:'numeric', month:'short'
  }).format(new Date(value));
  const timeLabel = value => new Intl.DateTimeFormat('en-GB', {
    hour:'2-digit', minute:'2-digit'
  }).format(new Date(value));
  const safePoster = value => {
    if (!value) return 'class1.webp';
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : 'class1.webp';
    } catch {
      return 'class1.webp';
    }
  };
  const renderCard = classItem => {
    const remaining = Number(classItem.spaces_remaining || 0);
    const full = remaining < 1;
    const bookingUrl = 'bookings.html';
    const availability = full ? 'Class full · waiting list available' : `${remaining} ${remaining === 1 ? 'space' : 'spaces'} left`;
    return `<article class="home-class-card">
      <img alt="${escapeHtml(classItem.title)}" src="${escapeHtml(safePoster(classItem.poster_url))}" loading="lazy"/>
      <div>
        <span class="day-tag">${escapeHtml(dateLabel(classItem.starts_at))}</span>
        <h3>${escapeHtml(classItem.title)}</h3>
        <p>${escapeHtml(venueLabel(classItem.venue))}</p>
        <p>${escapeHtml(timeLabel(classItem.starts_at))} · ${escapeHtml(money(classItem.price))} · ${escapeHtml(availability)}</p>
        <a href="${escapeHtml(bookingUrl)}">${full ? 'Join waiting list' : 'Book now'}</a>
      </div>
    </article>`;
  };
  const showMessage = message => {
    grids.forEach(grid => {
      grid.innerHTML = `<p class="home-classes-status" role="status">${escapeHtml(message)} <a href="bookings.html">View the booking page →</a></p>`;
    });
  };

  fetch('/api/classes', { headers:{ Accept:'application/json' }, cache:'no-store' })
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error('Classes unavailable');
      return Array.isArray(data) ? data : [];
    })
    .then(classes => classes
      .filter(classItem => classItem && classItem.id && classItem.starts_at && new Date(classItem.starts_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 2))
    .then(classes => {
      if (!classes.length) {
        showMessage('New class dates are being prepared.');
        return;
      }
      const markup = classes.map(renderCard).join('');
      grids.forEach(grid => { grid.innerHTML = markup; });
    })
    .catch(() => showMessage('Live class availability is temporarily unavailable.'));
})();
