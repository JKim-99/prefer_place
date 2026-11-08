(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const dialog = $('region-dialog');
  const sidoList = $('sido-list');
  const sigunguList = $('sigungu-list');
  const confirm = $('confirm-region');
  const svg = $('region-map');
  const NS = 'http://www.w3.org/2000/svg';
  let features = [], neighborhoods = [], sido = '', district = '', chosen = null;
  let currentView = null, baseView = null, animationFrame = null, featured = null, pressedFeature = null;
  let neighborhoodLabels = [];
  let mapDrag = null;
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
  const project = ([x, y]) => [x * Math.cos(36.5 * Math.PI / 180), -y];
  function neighborhoodCenter(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let best = null;
    for (const polygon of polygons) {
      const ring = polygon[0]; let twiceArea = 0, sumX = 0, sumY = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = project(ring[j]), [x2, y2] = project(ring[i]);
        const cross = x1 * y2 - x2 * y1; twiceArea += cross; sumX += (x1+x2)*cross; sumY += (y1+y2)*cross;
      }
      if (Math.abs(twiceArea) < 1e-12) continue;
      const candidate = { x: sumX / (3 * twiceArea), y: sumY / (3 * twiceArea), area: Math.abs(twiceArea) };
      if (!best || candidate.area > best.area) best = candidate;
    }
    return best;
  }
  function updateNeighborhoodLabels() {
    if (!currentView || !baseView) return;
    const detailed = currentView[2] / baseView[2] <= .75;
    ['region-overview-background', 'region-overview-depth', 'region-overview-selected'].forEach(id => {
      const group = svg.querySelector(`#${id}`); if (group) group.style.display = detailed ? 'none' : '';
    });
    const borders = svg.querySelector('#neighborhood-borders');
    if (borders) borders.style.display = detailed ? '' : 'none';
    const layer = svg.querySelector('#neighborhood-labels'); if (!layer) return;
    const zoomed = currentView[2] / baseView[2] <= .4;
    layer.style.display = zoomed ? '' : 'none'; if (!zoomed) return;
    const rect = svg.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const scale = Math.max(currentView[2] / rect.width, currentView[3] / rect.height);
    const occupied = [];
    neighborhoodLabels.forEach(({ element, x, y }) => {
      const visible = x >= currentView[0] && x <= currentView[0]+currentView[2] && y >= currentView[1] && y <= currentView[1]+currentView[3];
      const crowded = occupied.some(p => Math.abs(p.x-x) < 60*scale && Math.abs(p.y-y) < 19*scale);
      element.style.display = visible && !crowded ? '' : 'none';
      if (visible && !crowded) occupied.push({ x, y });
      element.setAttribute('font-size', String(12 * scale));
    });
  }
  function renderMap() {
    const selected = features.filter((f) => f.properties.sidonm === chosen.sido && cityName(f.properties.sggnm) === chosen.district);
    if (!selected.length) return;
    $('explore-title').textContent = `${chosen.district} 취향지도`;
    $('map-empty').hidden = true; svg.removeAttribute('hidden'); svg.replaceChildren();
    svg.setAttribute('aria-label', `${chosen.sido} 지도에서 ${chosen.district} 강조`);
    const allPoints = selected.flatMap((f) => rings(f.geometry).flat());
    // 단순 원통 투영에서 위도에 따른 가로 축 보정
    const xy = project;
    const points = allPoints.map(xy); const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * .1;
    const targetView = [minX-pad, minY-pad, maxX-minX+2*pad, maxY-minY+2*pad];
    baseView = targetView;
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
    selectedGroup.id = 'region-overview-selected';
    selectedGroup.classList.add('region-selected-group');
    const makePath = (f, className) => {
      const path = document.createElementNS(NS, 'path'); path.setAttribute('d', pathFor(f)); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('class', className);
      return path;
    };
    const background = document.createElementNS(NS, 'g'); background.id = 'region-overview-background';
    features.filter((f) => !selected.includes(f)).forEach((f) => background.append(makePath(f, 'region-other')));
    svg.append(background);
    // Draw the offset silhouettes under the surface to create a shallow visible edge.
    const depth = Math.max(maxX - minX, maxY - minY) * .025;
    const base = document.createElementNS(NS, 'g');
    base.id = 'region-overview-depth';
    base.classList.add('region-depth');
    // The silhouette look comes from the shared SVG drop shadow; one offset
    // rim keeps this detailed map from accumulating oversized dark edges.
    for (let layer = 1; layer >= 1; layer--) {
      selected.forEach((f) => {
        const path = makePath(f, 'region-side');
        path.setAttribute('transform', `translate(0 ${depth * layer / 6})`);
        base.append(path);
      });
    }
    svg.append(base);
    selected.forEach((f) => selectedGroup.append(makePath(f, 'region-selected')));
    svg.append(selectedGroup);
    const borders = document.createElementNS(NS, 'g'); borders.id = 'neighborhood-borders';
    const labels = document.createElementNS(NS, 'g'); labels.id = 'neighborhood-labels'; labels.setAttribute('aria-hidden', 'true');
    const selectedCodes = new Set(selected.map(feature => feature.properties.sgg));
    neighborhoodLabels = [];
    neighborhoods.forEach((feature) => {
      const path = makePath(feature, `neighborhood-border ${selectedCodes.has(feature.properties.sgg) ? 'neighborhood-selected' : 'neighborhood-other'}`); borders.append(path);
      const center = neighborhoodCenter(feature.geometry);
      if (!center || !feature.properties.dong) return;
      const text = document.createElementNS(NS, 'text'); text.setAttribute('x', center.x); text.setAttribute('y', center.y);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle'); text.textContent = feature.properties.dong;
      labels.append(text); neighborhoodLabels.push({ element: text, x: center.x, y: center.y });
    });
    svg.append(borders, labels);
    animateView(targetView);
    document.dispatchEvent(new CustomEvent('place-region-change', { detail: { ...chosen, shapes: selected } }));
  }
  function animateView(target) {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    const start = currentView;
    if (!start || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentView = target;
      svg.setAttribute('viewBox', target.join(' '));
      updateNeighborhoodLabels();
      return;
    }
    const started = performance.now();
    function step(now) {
      const progress = Math.min((now - started) / 700, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      currentView = start.map((value, i) => value + (target[i] - value) * eased);
      svg.setAttribute('viewBox', currentView.join(' '));
      updateNeighborhoodLabels();
      animationFrame = progress < 1 ? requestAnimationFrame(step) : null;
    }
    animationFrame = requestAnimationFrame(step);
  }
  function zoomMap(factor, anchor) {
    if (!currentView || !baseView) return;
    if (animationFrame !== null) { cancelAnimationFrame(animationFrame); animationFrame = null; }
    const ratio = Math.max(.035, Math.min(4, currentView[2] * factor / baseView[2]));
    const width = baseView[2] * ratio, height = baseView[3] * ratio;
    const centerX = anchor?.x ?? currentView[0] + currentView[2] / 2, centerY = anchor?.y ?? currentView[1] + currentView[3] / 2;
    const xFraction = (centerX - currentView[0]) / currentView[2], yFraction = (centerY - currentView[1]) / currentView[3];
    currentView = [centerX - width * xFraction, centerY - height * yFraction, width, height];
    svg.setAttribute('viewBox', currentView.join(' '));
    updateNeighborhoodLabels();
    $('marker-tooltip').hidden = true;
  }
  $('zoom-in').addEventListener('click', () => zoomMap(.8));
  $('zoom-out').addEventListener('click', () => zoomMap(1.25));
  $('zoom-reset').addEventListener('click', () => { if (baseView) animateView(baseView); });
  svg.addEventListener('wheel', event => {
    if (!currentView || !event.deltaY) return;
    const matrix = svg.getScreenCTM(); if (!matrix) return;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const anchor = point.matrixTransform(matrix.inverse());
    event.preventDefault(); zoomMap(event.deltaY < 0 ? .85 : 1 / .85, anchor);
  }, { passive: false });
  function pointerPosition(event) {
    const matrix = svg.getScreenCTM(); if (!matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }
  svg.addEventListener('pointerdown', event => {
    if (!currentView || event.button !== 0 || event.target.closest('.place-marker')) return;
    const point = pointerPosition(event); if (!point) return;
    if (animationFrame !== null) { cancelAnimationFrame(animationFrame); animationFrame = null; }
    mapDrag = { pointerId: event.pointerId, x: point.x, y: point.y };
    svg.setPointerCapture(event.pointerId); svg.classList.add('is-panning');
    $('marker-tooltip').hidden = true; event.preventDefault();
  });
  svg.addEventListener('pointermove', event => {
    if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
    const point = pointerPosition(event); if (!point) return;
    currentView[0] += mapDrag.x - point.x; currentView[1] += mapDrag.y - point.y;
    svg.setAttribute('viewBox', currentView.join(' ')); updateNeighborhoodLabels();
  });
  function endMapDrag(event) {
    if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
    mapDrag = null; svg.classList.remove('is-panning');
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  }
  svg.addEventListener('pointerup', endMapDrag);
  svg.addEventListener('pointercancel', endMapDrag);
  svg.addEventListener('lostpointercapture', endMapDrag);
  window.addEventListener('resize', updateNeighborhoodLabels);
  Promise.all(['assets/data/sigungu.geojson', 'assets/data/emd.geojson'].map(url => fetch(url).then(response => { if (!response.ok) throw new Error('data'); return response.json(); }))).then(([data, dongData]) => {
    features = data.features.filter((f) => f.properties?.sidonm && f.properties?.sggnm && f.geometry);
    neighborhoods = dongData.features.filter(f => f.properties?.dong && f.geometry);
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
