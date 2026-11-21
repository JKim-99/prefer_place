(function () {
  'use strict';
  if (window.location.hostname !== 'prefer-place.pages.dev') return;
  const measurementId = 'G-3D1313ELV5';
  const locations = { '/': '/', '/index.html': '/', '/mypage': '/mypage', '/mypage.html': '/mypage', '/profile': '/profile', '/profile.html': '/profile' };
  const path = locations[window.location.pathname];
  if (!path) return;
  let referrer = '';
  try { if (document.referrer) referrer = new URL(document.referrer).origin + '/'; } catch { /* Referrers are optional. */ }
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', measurementId, {
    page_location: `${window.location.origin}${path}`,
    page_referrer: referrer,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
})();
