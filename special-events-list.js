const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const box=document.querySelector('#specialEventList');
try{
  const response=await fetch('/api/special-events',{headers:{accept:'application/json'}}),data=await response.json();
  if(!response.ok)throw new Error(data.error||'Events could not be loaded.');
  box.innerHTML=data.events?.length?data.events.map(event=>`<article class="workshops-event-card">${event.artwork_url?`<img src="${escapeHtml(event.artwork_url)}" alt="${escapeHtml(event.title)} event artwork">`:'<div class="workshops-event-artwork-placeholder" aria-hidden="true">★</div>'}<div><p class="kicker red">Special event</p><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.public_summary||'')}</p><p><strong>${escapeHtml(event.venue_name||'')}</strong></p><a class="button" href="/${encodeURIComponent(event.slug)}">View Event</a></div></article>`).join(''):'<div class="workshops-event-empty"><h3>More special events are being prepared</h3><p>Draft events stay private until every event detail and ticket setting has been approved.</p></div>';
}catch(error){box.innerHTML='<div class="workshops-event-empty"><h3>More special events are being prepared</h3><p>Please check back soon for approved workshop and event announcements.</p></div>';}
