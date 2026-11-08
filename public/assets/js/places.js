(function () {
  'use strict';
  const $ = id => document.getElementById(id), status = $('place-status'), svg = $('region-map');
  const dialog = $('place-dialog'), searchStatus = $('place-search-status'), results = $('place-search-results');
  const legend = document.querySelector('.place-legend');
  let region = null, mode = 'mine', live = [], records = [], generation = 0;
  const icons = { restaurant: '🍴', cafe: '☕', stay: '🛏', other: '📍' };
  const category = code => ({ FD6: 'restaurant', CE7: 'cafe', AD5: 'stay' }[code] || 'other');
  const selectedCategories = () => new Set([...legend.querySelectorAll('input:checked')].map(i => i.value));
  function isInRegion(x, y, shapes) {
    function inRing(ring) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
      }
      return inside;
    }
    return shapes.some(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).some(polygon => inRing(polygon[0]) && !polygon.slice(1).some(inRing)));
  }
  function renderMarkers() {
    svg.querySelector('#place-markers')?.remove();
    if (!region || !live.length || mode !== 'mine') return;
    const vb = svg.viewBox.baseVal, size = Math.max(vb.width, vb.height) * .045;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.id = 'place-markers';
    live.filter(p => selectedCategories().has(category(p.category))).forEach(p => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', Number(p.x) * Math.cos(36.5*Math.PI/180)); text.setAttribute('y', -Number(p.y));
      text.setAttribute('font-size', size); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = p.name; text.append(title, document.createTextNode(icons[category(p.category)])); group.append(text);
    });
    svg.append(group);
  }
  async function api(url, options) {
    const response = await fetch(url, options); let data; try { data = await response.json(); } catch { throw new Error('서버 응답을 확인할 수 없습니다.'); }
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.'); return data;
  }
  function renderRecords() {
    const list = $('saved-places'); list.replaceChildren();
    if (!records.length) { status.textContent = mode === 'popular' ? '공개 기록이 3명 이상인 장소가 아직 없어요.' : mode === 'anonymous' ? '이 지역에 공개된 장소가 아직 없어요.' : '이 지역에 저장한 장소가 없어요.'; return; }
    status.textContent = (mode === 'popular' ? '방문 횟수가 아닌 공개 저장 사용자 수 기준입니다. ' : '') + '저장된 별칭과 카카오맵 링크입니다. 좌표는 저장할 수 없어 지도의 마커는 현재 검색 세션에서만 표시됩니다.';
    records.forEach(record => {
      const li = document.createElement('li'), link = document.createElement('a');
      link.href = `https://place.map.kakao.com/${record.place_id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = record.alias || `카카오 장소 ${record.place_id}${record.count ? ` · ${record.count}명` : ''}`; li.append(link);
      if (mode === 'mine') {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제';
        remove.addEventListener('click', async () => { try { await api(`/api/places/records?id=${encodeURIComponent(record.place_id)}`, { method: 'DELETE' }); live = live.filter(p => p.id !== record.place_id); renderMarkers(); await loadRecords(); } catch (error) { status.textContent = error.message; } }); li.append(remove);
      }
      list.append(li);
    });
  }
  async function loadRecords() {
    if (!region) return; const version = ++generation;
    try {
      const params = new URLSearchParams({ sido: region.sido, district: region.district, mode });
      const data = await api(`/api/places/records?${params}`); if (version !== generation) return;
      records = data.records || []; renderRecords();
    } catch (error) { if (version !== generation) return; records = []; $('saved-places').replaceChildren(); status.textContent = error.message; }
    renderMarkers();
  }
  document.addEventListener('place-region-change', event => { region = event.detail; live = []; records = []; loadRecords(); });
  document.addEventListener('place-auth-change', event => { if (!event.detail.signedIn) live = []; if (region) loadRecords(); });
  legend.addEventListener('change', renderMarkers);
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
  $('place-search-open').addEventListener('click', async () => {
    try {
      const data = await api('/api/auth/me'); if (!data.user) { $('auth-open').click(); return; }
      searchStatus.textContent = ''; results.replaceChildren(); $('place-query').value = ''; dialog.showModal();
    } catch (error) { status.textContent = error.message; }
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
      const params = new URLSearchParams({ q: `${region.sido} ${region.district} ${query}` });
      const data = await api(`/api/places/search?${params}`, { signal: searchAbort.signal }); if (requestedRegion !== region || version !== searchVersion || queryInput.value.trim() !== query) return;
      const places = data.places.filter(p => Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) && isInRegion(Number(p.x), Number(p.y), region.shapes));
      searchStatus.textContent = places.length ? '카카오맵 검색 결과입니다. 별칭은 선택 사항입니다.' : '이 지역에서 검색 결과를 찾지 못했어요.';
      places.forEach(p => {
        const li = document.createElement('li'); const title = document.createElement('strong'); title.append(document.createTextNode(`${icons[category(p.category)]} `)); const name = document.createElement('span'); highlightName(name, p.name, query); title.append(name);
        const detail = document.createElement('p'); detail.textContent = [p.categoryName, p.address].filter(Boolean).join(' · ');
        const form = document.createElement('form'); form.className = 'place-save-form';
        const alias = document.createElement('input'); alias.maxLength = 50; alias.placeholder = '별칭 (선택 사항)'; alias.setAttribute('aria-label', `${p.name}의 별칭`);
        const save = document.createElement('button'); save.type = 'submit'; save.textContent = '추가'; form.append(alias, save);
        form.addEventListener('submit', async e => {
          e.preventDefault(); save.disabled = true;
          try {
            await api('/api/places/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placeId: p.id, sido: region.sido, district: region.district, alias: alias.value, isPublic: false }) });
            live = live.filter(existing => existing.id !== p.id); live.push(p); mode = 'mine'; document.querySelector('[data-view="mine"]').click(); dialog.close();
          } catch (error) { searchStatus.textContent = error.message; } finally { save.disabled = false; }
        });
        li.append(title, detail, form); results.append(li);
      });
    } catch (error) { if (error.name !== 'AbortError' && version === searchVersion) searchStatus.textContent = error.message; }
  }
})();
