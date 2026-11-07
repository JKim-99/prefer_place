(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const dialog = $('region-dialog');
  const sidoList = $('sido-list');
  const sigunguList = $('sigungu-list');
  const confirm = $('confirm-region');
  const svg = $('region-map');
  const NS = 'http://www.w3.org/2000/svg';
  let features = [], sido = '', district = '', chosen = null;
  let currentView = null, animationFrame = null;
  $('open-picker').disabled = true; $('change-location').disabled = true;

  // 일반구가 있는 시는 시 단위로 선택하고 모든 구를 함께 표시합니다.
  const cityName = (name) => (name.match(/^(.+?시).+구$/) || [null, name])[1];
  const safeStore = {
    get() { try { return JSON.parse(localStorage.getItem('prefer-place-region')); } catch (_) { return null; } },
    set(value) { try { localStorage.setItem('prefer-place-region', JSON.stringify(value)); } catch (_) { /* storage is optional */ } }
  };
  function button(label, active, onClick) {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.className = active ? 'is-selected' : '';
    el.setAttribute('aria-pressed', String(active)); el.addEventListener('click', onClick); return el;
  }
  function renderPicker() {
    sidoList.replaceChildren(); sigunguList.replaceChildren();
    const provinces = [...new Set(features.map((f) => f.properties.sidonm))];
    provinces.forEach((name) => sidoList.append(button(name, name === sido, () => { sido = name; district = ''; renderPicker(); })));
    if (!sido) { const p = document.createElement('p'); p.className = 'list-placeholder'; p.textContent = '먼저 시·도를 선택해 주세요.'; sigunguList.append(p); }
    else {
      const names = [...new Set(features.filter((f) => f.properties.sidonm === sido).map((f) => cityName(f.properties.sggnm)))].sort((a,b) => a.localeCompare(b, 'ko'));
      names.forEach((name) => sigunguList.append(button(name, name === district, () => { district = name; renderPicker(); })));
    }
    confirm.disabled = !district; $('picker-selection').textContent = [sido, district].filter(Boolean).join('  /  ') || '지역을 선택해 주세요';
  }
  function openPicker() { sido = chosen?.sido || ''; district = chosen?.district || ''; renderPicker(); dialog.showModal(); }
  $('open-picker').addEventListener('click', openPicker);
  $('change-location').addEventListener('click', openPicker);
  $('close-picker').addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => { if (!district) return; chosen = { sido, district }; safeStore.set(chosen); renderMap(); dialog.close(); $('explore').scrollIntoView({ behavior: 'smooth' }); });

  function rings(geometry) { return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat(); }
  function renderMap() {
    const selected = features.filter((f) => f.properties.sidonm === chosen.sido && cityName(f.properties.sggnm) === chosen.district);
    if (!selected.length) return;
    $('selected-title').textContent = chosen.district;
    $('selected-subtitle').textContent = `${chosen.sido} · 선택한 지역`;
    $('map-empty').hidden = true; svg.removeAttribute('hidden'); svg.replaceChildren();
    svg.setAttribute('aria-label', `${chosen.sido} 지도에서 ${chosen.district} 강조`);
    const allPoints = selected.flatMap((f) => rings(f.geometry).flat());
    // 단순 원통 투영에서 위도에 따른 가로 축 보정
    const xy = ([x, y]) => [x * Math.cos(36.5 * Math.PI / 180), -y];
    const points = allPoints.map(xy); const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * .35;
    const targetView = [minX-pad, minY-pad, maxX-minX+2*pad, maxY-minY+2*pad];
    const pathFor = (f) => rings(f.geometry).map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${xy(p).join(' ')}`).join(' ') + ' Z').join(' ');
    [...features.filter((f) => !selected.includes(f)), ...selected].forEach((f) => {
      const path = document.createElementNS(NS, 'path'); path.setAttribute('d', pathFor(f)); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('vector-effect', 'non-scaling-stroke'); path.classList.add(selected.includes(f) ? 'region-selected' : 'region-other'); svg.append(path);
    });
    animateView(targetView);
  }
  function animateView(target) {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    const start = currentView;
    if (!start || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentView = target;
      svg.setAttribute('viewBox', target.join(' '));
      return;
    }
    const started = performance.now();
    function step(now) {
      const progress = Math.min((now - started) / 700, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      currentView = start.map((value, i) => value + (target[i] - value) * eased);
      svg.setAttribute('viewBox', currentView.join(' '));
      animationFrame = progress < 1 ? requestAnimationFrame(step) : null;
    }
    animationFrame = requestAnimationFrame(step);
  }
  fetch('assets/data/sigungu.geojson').then((response) => { if (!response.ok) throw new Error('data'); return response.json(); }).then((data) => {
    features = data.features.filter((f) => f.properties?.sidonm && f.properties?.sggnm && f.geometry);
    $('open-picker').disabled = false; $('change-location').disabled = false;
    chosen = safeStore.get(); if (chosen) renderMap();
  }).catch(() => { $('map-error').hidden = false; $('map-error').textContent = '지역 데이터를 불러오지 못했어요. 페이지를 새로고침해 주세요.'; $('open-picker').disabled = true; $('change-location').disabled = true; });
})();
