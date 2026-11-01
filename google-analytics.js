(() => {
  'use strict';

  if (window.__bootScootinAnalyticsConsent) return;
  window.__bootScootinAnalyticsConsent = true;

  const measurementId = 'G-24PZCYFPKM';
  const storageKey = 'boot-scootin-analytics-consent';
  let analyticsStarted = false;
  const consentState = analyticsStorage => ({
    analytics_storage: analyticsStorage,
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });

  const readChoice = () => {
    try { return localStorage.getItem(storageKey) || ''; } catch (_) { return ''; }
  };
  const saveChoice = value => {
    try { localStorage.setItem(storageKey, value); } catch (_) {}
  };

  function startAnalytics() {
    if (analyticsStarted) return;
    analyticsStarted = true;
    window[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', consentState('granted'));
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    if (!document.querySelector(`script[data-boot-ga4="${measurementId}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.dataset.bootGa4 = measurementId;
      document.head.append(script);
    }
  }

  function stopAnalytics() {
    window[`ga-disable-${measurementId}`] = true;
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', consentState('denied'));
    }
  }

  function installStyles() {
    if (document.getElementById('bootAnalyticsConsentStyles')) return;
    const style = document.createElement('style');
    style.id = 'bootAnalyticsConsentStyles';
    style.textContent = `
      .boot-analytics-consent{position:fixed;z-index:2147482500;left:12px;right:12px;bottom:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;width:min(760px,calc(100% - 24px));margin:auto;padding:14px 16px;border:1px solid #9d3038;background:#100708;color:#fff4e8;box-shadow:0 12px 36px rgba(0,0,0,.58);font:400 15px/1.45 Oswald,Arial,sans-serif}
      .boot-analytics-consent[hidden]{display:none!important}.boot-analytics-consent p{margin:0}.boot-analytics-consent a{color:#f4d9bb}.boot-analytics-actions{display:flex;flex-wrap:wrap;gap:8px}.boot-analytics-actions button,.boot-analytics-settings{min-height:42px;padding:9px 13px;border:1px solid #c43a43;background:#a4262f;color:#fff;font:700 13px/1 Oswald,Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}.boot-analytics-actions button[data-analytics-decline]{background:#160b0c;border-color:#8a5558}.boot-analytics-settings{display:inline-flex;align-items:center;justify-content:center;min-height:32px;margin:14px auto 0;padding:6px 9px;border:0;border-bottom:1px solid #714247;background:transparent;color:#d8c5b8;font-size:11px}.boot-analytics-settings:hover,.boot-analytics-settings:focus-visible{color:#fff4e8;border-color:#c43a43}.boot-analytics-settings[hidden]{display:none!important}
      @media(max-width:600px){.boot-analytics-consent{grid-template-columns:1fr;gap:10px;padding:13px}.boot-analytics-actions{display:grid;grid-template-columns:1fr 1fr}.boot-analytics-actions button{width:100%}}
    `;
    document.head.append(style);
  }

  function installControls() {
    installStyles();
    const panel = document.createElement('section');
    panel.className = 'boot-analytics-consent';
    panel.setAttribute('aria-label', 'Analytics cookie choice');
    panel.innerHTML = `<p>May we use optional Google Analytics to understand how people use the website? It stays off unless you accept. <a href="cookies.html">Cookie policy</a></p><div class="boot-analytics-actions"><button type="button" data-analytics-decline>Decline</button><button type="button" data-analytics-accept>Accept analytics</button></div>`;
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'boot-analytics-settings';
    settings.textContent = 'Cookie settings';
    settings.setAttribute('aria-label', 'Review analytics cookie choice');
    const showPanel = () => { panel.hidden = false; settings.hidden = true; };
    const hidePanel = () => { panel.hidden = true; settings.hidden = false; };
    panel.querySelector('[data-analytics-accept]').addEventListener('click', () => {
      saveChoice('granted'); startAnalytics(); hidePanel();
    });
    panel.querySelector('[data-analytics-decline]').addEventListener('click', () => {
      saveChoice('denied'); stopAnalytics(); hidePanel();
    });
    settings.addEventListener('click', showPanel);
    document.body.append(panel);
    const footer = document.querySelector('footer');
    if (footer) footer.append(settings);
    else document.body.append(settings);
    if (readChoice()) hidePanel(); else showPanel();
  }

  const choice = readChoice();
  if (choice === 'granted') startAnalytics();
  else stopAnalytics();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installControls, { once: true });
  else installControls();
})();
