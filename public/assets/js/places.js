(function () {
  'use strict';
  const $ = id => document.getElementById(id), status = $('place-status'), svg = $('region-map');
  const dialog = $('place-dialog'), searchStatus = $('place-search-status'), results = $('place-search-results');
  const legend = document.querySelector('.place-legend');
  let region = null, mode = 'mine', live = [], records = [], generation = 0;
  const icons = { restaurant: '🍴', cafe: '☕', stay: '🛏', shopping: '🛍', beauty: '💇', medical: '⚕️', culture: '🎭', education: '📚', other: '📍' };
  const category = code => ({ FD6: 'restaurant', CE7: 'cafe', AD5: 'stay', restaurant: 'restaurant', cafe: 'cafe', stay: 'stay', shopping: 'shopping', beauty: 'beauty', medical: 'medical', culture: 'culture', education: 'education', other: 'other' }[code] || 'other');
  const selectedCategories = () => new Set([...legend.querySelectorAll('input:checked')].map(i => i.value));
  const tooltip = $('marker-tooltip'), detail = $('place-detail'), stage = $('map-stage');
  function hideInfo() { tooltip.hidden = true; detail.hidden = true; }
  function showTooltip(marker, place) {
    const box = marker.getBoundingClientRect(), container = stage.getBoundingClientRect();
    tooltip.textContent = place.name; tooltip.hidden = false;
    const half = tooltip.offsetWidth / 2;
    tooltip.style.left = `${Math.max(half + 8, Math.min(container.width - half - 8, box.x - container.x + box.width / 2))}px`;
    tooltip.style.top = `${Math.max(8, box.y - container.y - tooltip.offsetHeight - 8)}px`;
  }
  function showDetail(place) {
    tooltip.hidden = true; $('place-detail-name').textContent = place.name;
    $('place-detail-category').textContent = place.categoryName || '분류 정보 없음';
    $('place-detail-address').textContent = [place.address || '주소 정보 없음', place.dataVersion ? `공공데이터 기준일 ${place.dataVersion}` : ''].filter(Boolean).join(' · ');
    $('place-detail-link').hidden = !place.url; if (place.url) $('place-detail-link').href = place.url;
    detail.hidden = false;
  }
  $('place-detail-close').addEventListener('click', hideInfo);
  function renderMarkers() {
    svg.querySelector('#place-markers')?.remove(); hideInfo();
    if (!region || !live.length) return;
    const vb = svg.viewBox.baseVal, size = Math.max(vb.width, vb.height) * .045;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.id = 'place-markers';
    live.filter(p => selectedCategories().has(category(p.category))).forEach(p => {
      const position = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      position.setAttribute('class', 'place-marker-position');
      position.setAttribute('transform', `translate(${Number(p.x) * Math.cos(36.5*Math.PI/180)} ${-Number(p.y)})`);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      marker.setAttribute('class', 'place-marker');
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      hit.setAttribute('class', 'place-marker-hit'); hit.setAttribute('tabindex', '0'); hit.setAttribute('role', 'button'); hit.setAttribute('aria-label', `${p.name} 장소 정보 보기`);
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hitArea.setAttribute('class', 'place-marker-hit-area'); hitArea.setAttribute('cx', '0'); hitArea.setAttribute('cy', '0'); hitArea.setAttribute('r', String(size * .55));
      hitArea.setAttribute('fill', '#000'); hitArea.setAttribute('fill-opacity', '0');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'marker-icon'); text.setAttribute('x', '0'); text.setAttribute('y', '0');
      text.setAttribute('font-size', size); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central'); text.setAttribute('pointer-events', 'none'); text.textContent = icons[category(p.category)];
      hit.append(hitArea, text); marker.append(hit);
      hit.addEventListener('pointerenter', () => showTooltip(hit, p)); hit.addEventListener('pointerleave', event => {
        const related = event.relatedTarget;
        if (related && (hit.contains(related) || related.closest?.('.place-marker-hit') === hit)) return;
        tooltip.hidden = true;
      });
      hit.addEventListener('focus', () => showTooltip(hit, p)); hit.addEventListener('blur', () => { tooltip.hidden = true; });
      hit.addEventListener('click', () => showDetail(p)); hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDetail(p); } });
      position.append(marker); group.append(position);
    });
    svg.append(group);
  }
  async function api(url, options) {
    const response = await fetch(url, options); let data;
    try { data = await response.json(); } catch {
      if (response.redirected || response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('서버가 API 대신 사이트 페이지를 반환했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      }
      throw new Error('서버 응답을 확인할 수 없습니다.');
    }
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.'); return data;
  }
  function renderRecords() {
    const list = $('saved-places'); list.replaceChildren();
    if (!records.length) { status.textContent = mode === 'popular' ? '공개 기록이 3명 이상인 장소가 아직 없어요.' : mode === 'anonymous' ? '이 지역에 공개된 장소가 아직 없어요.' : '이 지역에 저장한 장소가 없어요.'; return; }
    const allowed = selectedCategories();
    const namedRecords = records.filter(record => allowed.has(category(record.category)) && (record.name || (record.alias && record.alias.trim()) || /^\d+$/.test(record.place_id)));
    status.textContent = !namedRecords.length ? '선택한 장소 종류에 해당하는 기록이 없어요.' : mode === 'popular' ? '공개 저장 사용자 수 기준입니다.' : `${namedRecords.length}개의 장소`;
    namedRecords.forEach(record => {
      const li = document.createElement('li'), isLegacy = /^\d+$/.test(record.place_id), link = document.createElement(isLegacy ? 'a' : 'button');
      if (isLegacy) { link.href = `https://place.map.kakao.com/${record.place_id}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = record.alias || '기존 카카오 장소 보기'; }
      else { link.type = 'button'; link.className = 'saved-place-name'; link.textContent = record.alias || record.name; link.addEventListener('click', () => { const place = live.find(item => item.id === record.place_id); if (place) { showDetail(place); detail.focus(); } }); }
      li.append(link);
      if (mode === 'mine') {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제';
        remove.setAttribute('aria-label', `${record.alias || record.name || '장소'} 삭제`);
        remove.addEventListener('click', async () => { if (!window.confirm('이 장소를 삭제할까요? 저장한 메모와 방문 상태도 함께 삭제됩니다.')) return; remove.disabled = true; try { await api(`/api/places/records?id=${encodeURIComponent(record.place_id)}`, { method: 'DELETE' }); live = live.filter(p => p.id !== record.place_id); renderMarkers(); await loadRecords(); } catch (error) { status.textContent = error.message; remove.disabled = false; } }); li.append(remove);
      }
      list.append(li);
    });
  }
  async function loadRecords() {
    if (!region) return; const version = ++generation;
    try {
      const params = new URLSearchParams({ sido: region.sido, district: region.district, mode });
      const data = await api(`/api/places/records?${params}`); if (version !== generation) return;
      records = data.records || []; live = records.filter(r => r.name && Number.isFinite(Number(r.longitude)) && Number.isFinite(Number(r.latitude))).map(r => ({ id: r.place_id, name: r.alias || r.name, address: r.address, category: r.category, categoryName: r.category_name, categoryMajor: r.category_major, categoryMiddle: r.category_middle, x: r.longitude, y: r.latitude, dataVersion: r.data_version })); renderRecords();
    } catch (error) { if (version !== generation) return; records = []; $('saved-places').replaceChildren(); status.textContent = error.message; }
    renderMarkers();
  }
  document.addEventListener('place-auth-change', event => { if (!event.detail.signedIn) { live = []; records = []; $('saved-places').replaceChildren(); renderMarkers(); } if (region) loadRecords(); });
  document.addEventListener('place-region-change', event => { region = event.detail; live = []; records = []; loadRecords(); });
  document.addEventListener('place-records-change', () => { if (region) loadRecords(); });
  legend.addEventListener('change', () => { renderMarkers(); renderRecords(); });
  document.querySelectorAll('.place-view').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.view;
    document.querySelectorAll('.place-view').forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); });
    loadRecords();
  }));
  let searchTimer, searchVersion = 0, searchAbort = null;
  function cancelSearch() { clearTimeout(searchTimer); searchVersion++; if (searchAbort) searchAbort.abort(); searchAbort = null; }
  function highlightName(element, name, query) {
    const index = name.toLocaleLowerCase('ko').indexOf(query.toLocaleLowerCase('ko'));
    if (index < 0) { element.textContent = name; return; }
    const mark = document.createElement('mark'); mark.textContent = name.slice(index, index + query.length);
    element.append(document.createTextNode(name.slice(0, index)), mark, document.createTextNode(name.slice(index + query.length)));
  }
  $('place-search-open').addEventListener('click', () => {
    searchStatus.textContent = ''; results.replaceChildren(); $('place-query').value = '';
    if (window.placeCurrentUser === null) { $('auth-open').click(); return; }
    dialog.showModal(); $('place-query').focus();
  });
  $('place-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', cancelSearch);
  const queryInput = $('place-query');
  let composing = false;
  function queueSearch() {
    cancelSearch(); results.replaceChildren();
    if (queryInput.value.trim().length < 2) { searchStatus.textContent = '두 글자 이상 입력해 주세요.'; return; }
    searchTimer = setTimeout(runSearch, 500);
  }
  queryInput.addEventListener('compositionstart', () => { composing = true; cancelSearch(); });
  queryInput.addEventListener('compositionend', () => { composing = false; queueSearch(); });
  queryInput.addEventListener('input', event => { if (!composing && !event.isComposing) queueSearch(); });
  $('place-search-form').addEventListener('submit', event => { event.preventDefault(); cancelSearch(); if (queryInput.value.trim().length >= 2) runSearch(); });
  async function runSearch() {
    if (!region || !dialog.open) return; const requestedRegion = region; const query = queryInput.value.trim();
    const version = ++searchVersion; searchAbort = new AbortController();
    results.replaceChildren(); searchStatus.textContent = '검색 중...';
    try {
      let data;
      try {
        const snapshot = await window.searchPublicCatalog(region.sido, region.district, query);
        data = { places: snapshot.places, snapshotVersion: snapshot.version, total: snapshot.total };
      } catch {
        const params = new URLSearchParams({ q: query, sido: region.sido, district: region.district });
        data = await api(`/api/places/search?${params}`, { signal: searchAbort.signal });
      }
      if (requestedRegion !== region || version !== searchVersion || queryInput.value.trim() !== query) return;
      const places = data.places.filter(p => Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
      searchStatus.textContent = places.length ? `공공 상가정보 기준일: ${places[0].data_version}` : data.catalogReady === false ? '장소 데이터가 아직 준비되지 않았어요.' : '이 지역에서 검색 결과를 찾지 못했어요.';
      if (data.snapshotVersion && !places.length) searchStatus.textContent += ` (공공 상가정보 기준일 ${data.snapshotVersion})`;
      if (data.snapshotVersion && places.length) searchStatus.textContent += data.total > places.length ? ` · ${data.total}건 중 ${places.length}건 표시` : ` · ${places.length}건`;
      if (data.snapshotVersion) searchStatus.textContent += ' · 현재 영업 여부와 다를 수 있어요.';
      if (data.catalogPartial) searchStatus.textContent += ' 현재 일부 장소만 제공하므로 검색 결과가 빠질 수 있어요.';
      places.forEach(p => {
        const li = document.createElement('li'); const title = document.createElement('strong'); title.append(document.createTextNode(`${icons[category(p.category)]} `)); const name = document.createElement('span'); highlightName(name, p.name, query); title.append(name);
        const detail = document.createElement('p'); detail.textContent = [p.categoryName, p.address].filter(Boolean).join(' · ');
        const form = document.createElement('form'); form.className = 'place-save-form';
        const save = document.createElement('button'); save.type = 'submit'; save.textContent = '추가'; form.append(save);
        form.addEventListener('submit', async e => {
          e.preventDefault(); save.disabled = true;
          try {
            await api('/api/places/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placeId: p.id, sido: region.sido, district: region.district }) });
            mode = 'mine'; document.querySelector('[data-view="mine"]').click(); dialog.close();
          } catch (error) { searchStatus.textContent = error.message; } finally { save.disabled = false; }
        });
        li.append(title, detail, form); results.append(li);
      });
    } catch (error) { if (error.name !== 'AbortError' && version === searchVersion) searchStatus.textContent = error.message; }
  }
})();
