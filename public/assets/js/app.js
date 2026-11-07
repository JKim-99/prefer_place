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
  let currentView = null, animationFrame = null, featured = null, pressedFeature = null;
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
    confirm.disabled = !district;
  }
  function openPicker() { sido = chosen?.sido || ''; district = chosen?.district || ''; renderPicker(); dialog.showModal(); }
  $('open-picker').addEventListener('click', openPicker);
  $('change-location').addEventListener('click', openPicker);
  $('close-picker').addEventListener('click', () => dialog.close());
  function showRegion(region) {
    chosen = region; safeStore.set(chosen); renderMap();
    $('welcome').hidden = true; $('explore').hidden = false;
    window.scrollTo(0, 0); $('explore-title').setAttribute('tabindex', '-1');
    $('explore-title').focus({ preventScroll: true });
  }
  confirm.addEventListener('click', () => {
    if (!district) return;
    dialog.close(); showRegion({ sido, district });
  });
  $('featured-link').addEventListener('pointerdown', () => { pressedFeature = featured; });
  $('featured-link').addEventListener('pointercancel', () => { pressedFeature = null; });
  $('featured-link').addEventListener('click', () => {
    const target = pressedFeature || featured; pressedFeature = null;
    if (target) showRegion(target);
  });
  $('back-home').addEventListener('click', () => {
    $('explore').hidden = true; $('welcome').hidden = false;
    window.scrollTo(0, 0); $('open-picker').focus({ preventScroll: true });
  });

  function rings(geometry) { return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat(); }
  function renderMap() {
    const selected = features.filter((f) => f.properties.sidonm === chosen.sido && cityName(f.properties.sggnm) === chosen.district);
    if (!selected.length) return;
    $('explore-title').textContent = `${chosen.district} 취향지도`;
    $('map-empty').hidden = true; svg.removeAttribute('hidden'); svg.replaceChildren();
    svg.setAttribute('aria-label', `${chosen.sido} 지도에서 ${chosen.district} 강조`);
    const allPoints = selected.flatMap((f) => rings(f.geometry).flat());
    // 단순 원통 투영에서 위도에 따른 가로 축 보정
    const xy = ([x, y]) => [x * Math.cos(36.5 * Math.PI / 180), -y];
    const points = allPoints.map(xy); const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * .1;
    const targetView = [minX-pad, minY-pad, maxX-minX+2*pad, maxY-minY+2*pad];
    const pathFor = (f) => rings(f.geometry).map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${xy(p).join(' ')}`).join(' ') + ' Z').join(' ');
    const defs = document.createElementNS(NS, 'defs');
    const gradient = document.createElementNS(NS, 'linearGradient');
    gradient.id = 'selected-gradient';
    gradient.setAttribute('x1', '0'); gradient.setAttribute('y1', '0');
    gradient.setAttribute('x2', '0.8'); gradient.setAttribute('y2', '1');
    [['0%', '#629575'], ['100%', '#3e7252']].forEach(([offset, color]) => {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', offset); stop.setAttribute('stop-color', color); gradient.append(stop);
    });
    defs.append(gradient); svg.append(defs);
    const selectedGroup = document.createElementNS(NS, 'g');
    selectedGroup.classList.add('region-selected-group');
    const makePath = (f, className) => {
      const path = document.createElementNS(NS, 'path'); path.setAttribute('d', pathFor(f)); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('class', className);
      return path;
    };
    features.filter((f) => !selected.includes(f)).forEach((f) => svg.append(makePath(f, 'region-other')));
    // Draw the offset silhouettes under the surface to create a shallow visible edge.
    const depth = Math.max(maxX - minX, maxY - minY) * .025;
    const base = document.createElementNS(NS, 'g');
    base.classList.add('region-depth');
    for (let layer = 6; layer >= 1; layer--) {
      selected.forEach((f) => {
        const path = makePath(f, 'region-side');
        path.setAttribute('transform', `translate(0 ${depth * layer / 6})`);
        base.append(path);
      });
    }
    svg.append(base);
    selected.forEach((f) => selectedGroup.append(makePath(f, 'region-selected')));
    svg.append(selectedGroup);
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
    const regionMap = new Map();
    features.forEach((f) => {
      const region = { sido: f.properties.sidonm, district: cityName(f.properties.sggnm) };
      const key = `${region.sido}|${region.district}`;
      if (!regionMap.has(key)) regionMap.set(key, { region, shapes: [] });
      regionMap.get(key).shapes.push(f);
    });
    const options = [...regionMap.values()];
    let previous = -1;
    function changeFeatured() {
      if (options.length === 0) return;
      let index = Math.floor(Math.random() * options.length);
      if (options.length > 1 && index === previous) index = (index + 1) % options.length;
      previous = index;
      const { region, shapes } = options[index]; featured = region;
      const map = $('featured-map'); map.replaceChildren();
      const xy = ([x, y]) => [x * Math.cos(36.5 * Math.PI / 180), -y];
      const coordinates = shapes.flatMap((f) => rings(f.geometry).flat()).map(xy);
      const xs = coordinates.map((point) => point[0]), ys = coordinates.map((point) => point[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const padding = Math.max(maxX - minX, maxY - minY) * .08;
      map.setAttribute('viewBox', `${minX-padding} ${minY-padding} ${maxX-minX+2*padding} ${maxY-minY+2*padding}`);
      shapes.forEach((shape) => {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', rings(shape.geometry).map((ring) => ring.map((point, i) => `${i ? 'L' : 'M'}${xy(point).join(' ')}`).join(' ') + ' Z').join(' '));
        path.setAttribute('fill-rule', 'evenodd'); map.append(path);
      });
      const label = document.createElement('span'); label.className = 'featured-dial-item';
      const province = document.createElement('strong'); province.textContent = region.sido;
      const place = document.createElement('strong'); place.textContent = region.district;
      label.append(province, document.createTextNode(' '), place, document.createTextNode(' 둘러보기'));
      $('featured-dial').replaceChildren(label); $('featured-link').disabled = false;
    }
    changeFeatured();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(changeFeatured, 3000);
    chosen = safeStore.get(); if (chosen) renderMap();
  }).catch(() => { $('map-error').hidden = false; $('map-error').textContent = '지역 데이터를 불러오지 못했어요. 페이지를 새로고침해 주세요.'; $('open-picker').disabled = true; $('change-location').disabled = true; });
})();
