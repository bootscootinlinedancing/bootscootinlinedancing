(() => {
  const form = document.getElementById('privateEventForm');
  const message = document.getElementById('privateEventMessage');
  const equipment = document.querySelectorAll('[data-equipment]');
  const agreed = document.getElementById('privateEventConsent');
  if (!form) return;

  equipment.forEach(box => box.addEventListener('change', () => {
    box.closest('.equipment-option')?.classList.toggle('selected', box.checked);
  }));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity() || !agreed?.checked) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.className = 'form-message';
    message.textContent = 'Sending your inquiry securely…';
    const data = Object.fromEntries(new FormData(form));
    for (const key of ['sound_system_provided','microphone_provided','dance_floor_confirmed','power_available','parking_loading_available']) {
      data[key] = form.elements[key]?.checked ? 1 : 0;
    }
    data.guest_count = Number(data.guest_count);
    data.website = String(data.website || ''); // honeypot
    try {
      const response = await fetch('/api/private-events/inquiries', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify(data)
      });
      const output = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(output.error || 'Your inquiry could not be sent.');
      form.hidden = true;
      const success = document.getElementById('privateEventSuccess');
      success.hidden = false;
      success.querySelector('[data-reference]').textContent = output.reference;
      success.querySelector('[data-status-link]').href = output.status_url;
      success.scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) {
      message.classList.add('error');
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
