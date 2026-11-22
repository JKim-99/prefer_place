(function () {
  'use strict';
  const $ = id => document.getElementById(id), status = $('place-status'), svg = $('region-map');
  const dialog = $('place-dialog'), searchStatus = $('place-search-status'), results = $('place-search-results');
  const legend = document.querySelector('.place-legend');
  let selectedUser = null, region = null, mode = 'popular', live = [], records = [], generation = 0, hasMore = false, nextCursor = null, loadingMore = false;
  let awaitingInitialAuth = false;
  const moreButton = $('load-more-places');
  let markerTargets = [], hoveredMarker = null;
  const icons = { restaurant: '🍴', cafe: '☕', stay: '🛏', shopping: '🛍', beauty: '💇', medical: '⚕️', culture: '🎭', education: '📚', other: '📍' };
  const category = code => ({ FD6: 'restaurant', CE7: 'cafe', AD5: 'stay', restaurant: 'restaurant', cafe: 'cafe', stay: 'stay', shopping: 'shopping', beauty: 'beauty', medical: 'medical', culture: 'culture', education: 'education', other: 'other' }[code] || 'other');
  const selectedCategories = () => new Set([...legend.querySelectorAll('input:checked:not([value=all])')].map(i => i.value));
  const visitLabels = { want:'가보고 싶은 곳', again:'다시 방문할 곳', avoid:'다시 방문하지 않을 곳' };
  const visitFilter = $('map-visit-filter'), tagFilter = $('map-tag-filter');
  let visitIntent = 'again';
  function setVisitIntent(value) { visitIntent = value; visitFilter.querySelectorAll('[data-intent]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.intent === value))); }
  const matchesPersonalFilters = (visitStatus, tags) => {
    if (mode !== 'mine') return true;
    const tag = tagFilter.value.trim().toLocaleLowerCase('ko');
    return (visitIntent === 'all' || visitIntent === (visitStatus || '')) && (!tag || (tags || []).some(value => value.toLocaleLowerCase('ko').includes(tag)));
  };
  const updatePersonalFilters = () => { $('map-tag-filter-label').hidden = mode !== 'mine' || !window.placeCurrentUser; document.querySelector('.login-tip')?.classList.toggle('needs-login', !window.placeCurrentUser); document.querySelector('[data-view="mine"]')?.setAttribute('aria-describedby', window.placeCurrentUser ? '' : 'tip-mine'); };
  const tooltip = $('marker-tooltip'), detail = $('place-detail'), stage = $('map-stage');
  function clearPersonalDetail() { $('place-personal-details').hidden = true; ['place-personal-visit', 'place-personal-note', 'place-personal-tags'].forEach(id => { $(id).textContent = ''; }); }
  function hideInfo() { tooltip.hidden = true; detail.hidden = true; clearPersonalDetail(); }
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
    clearPersonalDetail();
    const profileLink = $('place-profile-link'); profileLink.hidden = !selectedUser || mode !== 'anonymous'; if (!profileLink.hidden) profileLink.href = `/profile.html?id=${encodeURIComponent(selectedUser.id)}`;
    if (mode === 'mine' && window.placeCurrentUser) {
      const visit = [visitLabels[place.visitStatus], place.visitDate ? `방문일 ${place.visitDate}` : ''].filter(Boolean);
      $('place-personal-visit').textContent = visit.join(' · ') || '아직 방문 기록이 없어요.';
      $('place-personal-note').textContent = place.note || '';
      $('place-personal-note').hidden = !place.note;
      $('place-personal-tags').textContent = (place.tags || []).map(tag => `#${tag}`).join('  ');
      $('place-personal-tags').hidden = !(place.tags || []).length;
      $('place-personal-details').hidden = false;
    }
    detail.hidden = false;
  }
  $('place-detail-close').addEventListener('click', hideInfo);
  function renderMarkers() {
    svg.querySelector('#place-markers')?.remove(); markerTargets = []; hoveredMarker = null; hideInfo();
    if (!region || !live.length) return;
    const vb = svg.viewBox.baseVal, size = Math.max(vb.width, vb.height) * .045;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.id = 'place-markers';
    live.filter(p => selectedCategories().has(category(p.category)) && matchesPersonalFilters(p.visitStatus, p.tags)).forEach(p => {
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
      const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      symbol.setAttribute('transform', `scale(${size / 32})`); symbol.setAttribute('pointer-events', 'none');
      const pin = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pin.setAttribute('class', 'marker-icon');
      pin.setAttribute('d', 'M0 -15C-8.3 -15 -15 -8.3 -15 0c0 10.5 15 25 15 25S15 10.5 15 0C15 -8.3 8.3 -15 0 -15Z'); pin.setAttribute('fill', '#285ac1'); pin.setAttribute('pointer-events', 'none'); symbol.append(pin);
      hit.append(hitArea, symbol); marker.append(hit);
      hit.addEventListener('focus', () => showTooltip(hit, p)); hit.addEventListener('blur', () => { tooltip.hidden = true; });
      hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDetail(p); } });
      markerTargets.push({ hit, hitArea, place: p });
      position.append(marker); group.append(position);
    });
    svg.append(group);
  }
  function markerAtPoint(event) {
    return markerTargets.find(({ hitArea }) => {
      const bounds = hitArea.getBoundingClientRect(), x = event.clientX, y = event.clientY;
      return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    });
  }
  svg.addEventListener('pointermove', event => {
    if (event.buttons) { tooltip.hidden = true; hoveredMarker = null; return; }
    const target = markerAtPoint(event);
    hoveredMarker = target; if (target) showTooltip(target.hit, target.place); else tooltip.hidden = true;
  });
  svg.addEventListener('pointerleave', () => { hoveredMarker = null; tooltip.hidden = true; });
  svg.addEventListener('pointerdown', event => { if (markerAtPoint(event)) event.stopImmediatePropagation(); }, true);
  svg.addEventListener('click', event => { const target = markerAtPoint(event); if (target) { event.stopPropagation(); showDetail(target.place); } });
  async function api(url, options) {
    const requestUser = window.placeCurrentUser;
    const response = await fetch(url, options); let data;
    if (response.status === 401 && requestUser && requestUser === window.placeCurrentUser) window.placeShowUser(null);
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
    if (!records.length) { status.textContent = mode === 'mine' && window.placeCurrentUser ? '이 지역에 저장한 장소가 없어요.' : ''; return; }
    const allowed = selectedCategories();
    const namedRecords = records.filter(record => allowed.has(category(record.category)) && matchesPersonalFilters(record.visit_status, record.tags) && (record.name || (record.alias && record.alias.trim()) || /^\d+$/.test(record.place_id)));
    status.textContent = !namedRecords.length ? '선택한 조건에 해당하는 기록이 없어요.' : mode === 'popular' ? '지역 저장자 수를 기준으로 집계합니다.' : `${namedRecords.length}개의 장소`;
    if (hasMore) status.textContent += mode === 'mine' ? ' 더 보기로 나머지 장소를 불러올 수 있어요.' : ' 지역 기록 중 처음 100개만 표시합니다.';
    namedRecords.forEach(record => {
      const li = document.createElement('li'), isLegacy = /^\d+$/.test(record.place_id), link = document.createElement(isLegacy ? 'a' : 'button');
      if (isLegacy) { link.href = `https://place.map.kakao.com/${record.place_id}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = record.alias || '기존 카카오 장소 보기'; }
      else { link.type = 'button'; link.className = 'saved-place-name'; link.textContent = record.alias || record.name; link.addEventListener('click', () => { const place = live.find(item => item.id === record.place_id); if (place) { showDetail(place); detail.focus(); } }); }
      li.append(link);
      if (mode === 'mine') {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제';
        remove.setAttribute('aria-label', `${record.alias || record.name || '장소'} 삭제`);
        remove.addEventListener('click', async () => { if (!window.confirm('이 장소를 삭제할까요? 저장한 메모와 방문 기록, 태그도 함께 삭제됩니다.')) return; remove.disabled = true; try { await api(`/api/places/records?id=${encodeURIComponent(record.place_id)}`, { method: 'DELETE' }); live = live.filter(p => p.id !== record.place_id); renderMarkers(); await loadRecords(); } catch (error) { status.textContent = error.message; remove.disabled = false; } }); li.append(remove);
      }
      list.append(li);
    });
  }
  async function loadRecords({ append = false } = {}) {
    if (!region || (append && (mode !== 'mine' || !nextCursor || loadingMore))) return;
    const cursor = append ? nextCursor : null, version = ++generation;
    if (append) { loadingMore = true; moreButton.disabled = true; }
    else { hasMore = false; nextCursor = null; loadingMore = false; moreButton.hidden = true; moreButton.disabled = false; }
    try {
      const params = new URLSearchParams({ sido: region.sido, district: region.district, mode });
      if (cursor) params.set('cursor', cursor);
      if (mode !== 'mine') params.set('intent', visitIntent);
      if (mode === 'anonymous' && selectedUser) params.set('userId', selectedUser.id);
      const data = await api(`/api/places/records?${params}`); if (version !== generation) return;
      if (mode === 'anonymous') selectedUser = data.user || null;
      const incoming = data.records || [], existing = new Set(records.map(record => record.place_id));
      records = append ? records.concat(incoming.filter(record => !existing.has(record.place_id))) : incoming;
      hasMore = !!data.hasMore; nextCursor = mode === 'mine' && typeof data.nextCursor === 'string' ? data.nextCursor : null;
      live = records.filter(r => r.name && Number.isFinite(Number(r.longitude)) && Number.isFinite(Number(r.latitude))).map(r => ({ id: r.place_id, name: r.alias || r.name, address: r.address, category: r.category, categoryName: r.category_name, categoryMajor: r.category_major, categoryMiddle: r.category_middle, visitStatus: r.visit_status, visitDate: r.visit_date, note: r.note, tags: r.tags, x: r.longitude, y: r.latitude, dataVersion: r.data_version })); renderRecords();
      renderMarkers();
    } catch (error) { if (version !== generation) return; if (!append) { records = []; live = []; hasMore = false; nextCursor = null; $('saved-places').replaceChildren(); renderMarkers(); } status.textContent = append ? `장소를 더 불러오지 못했어요. ${error.message}` : error.message; }
    finally { if (version === generation) { loadingMore = false; moreButton.disabled = false; moreButton.hidden = mode !== 'mine' || !nextCursor; } }
  }
  document.addEventListener('place-auth-change', event => { if (awaitingInitialAuth) { awaitingInitialAuth = false; mode = event.detail.signedIn ? 'mine' : 'popular'; document.querySelectorAll('.place-view').forEach(button => { const active = button.dataset.view === mode; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }); } if (!event.detail.signedIn) { live = []; records = []; hasMore = false; nextCursor = null; moreButton.hidden = true; setVisitIntent('again'); tagFilter.value = ''; if (mode === 'mine') { mode = 'popular'; document.querySelectorAll('.place-view').forEach(button => { const active = button.dataset.view === mode; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }); } $('saved-places').replaceChildren(); renderMarkers(); } updatePersonalFilters(); if (region) loadRecords(); });
  document.addEventListener('place-region-change', event => { selectedUser = null; awaitingInitialAuth = window.placeAuthReady === false; mode = window.placeCurrentUser ? 'mine' : 'popular'; setVisitIntent('again'); document.querySelectorAll('.place-view').forEach(button => { const active = button.dataset.view === mode; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }); updatePersonalFilters(); region = event.detail; live = []; records = []; hasMore = false; nextCursor = null; moreButton.hidden = true; $('saved-places').replaceChildren(); status.textContent = '불러오는 중...'; loadRecords(); });
  document.addEventListener('place-records-change', () => { if (region) loadRecords(); });
  legend.addEventListener('change', event => {
    const all = legend.querySelector('input[value="all"]');
    const items = [...legend.querySelectorAll('input:not([value="all"])')];
    if (event.target === all) items.forEach(input => { input.checked = all.checked; });
    const count = items.filter(input => input.checked).length;
    all.checked = count === items.length; all.indeterminate = count > 0 && count < items.length;
    renderMarkers(); renderRecords();
  });
  visitFilter.querySelectorAll('[data-intent]').forEach(button => button.addEventListener('click', () => { setVisitIntent(button.dataset.intent); if (mode === 'mine') { renderMarkers(); renderRecords(); } else loadRecords(); }));
  tagFilter.addEventListener('input', () => { renderMarkers(); renderRecords(); });
  moreButton.addEventListener('click', () => loadRecords({ append: true }));
  document.querySelectorAll('.view-tip').forEach(wrapper => {
    const button = wrapper.querySelector('.place-view'); let suppressClick = false;
    wrapper.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') wrapper.classList.remove('tip-dismissed'); });
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' && !wrapper.classList.contains('tip-touch-visible')) {
        document.querySelectorAll('.view-tip').forEach(item => item.classList.remove('tip-touch-visible'));
        wrapper.classList.remove('tip-dismissed'); wrapper.classList.add('tip-touch-visible'); suppressClick = true;
      } else { wrapper.classList.remove('tip-touch-visible'); wrapper.classList.add('tip-dismissed'); suppressClick = false; }
    });
    button.addEventListener('click', event => { if (suppressClick) { suppressClick = false; event.stopImmediatePropagation(); } });
    button.addEventListener('keydown', event => { if (event.key === 'Escape') { wrapper.classList.remove('tip-touch-visible'); wrapper.classList.add('tip-dismissed'); } else if (event.key === 'Tab') wrapper.classList.remove('tip-dismissed'); });
    button.addEventListener('focus', () => { if (button.matches(':focus-visible') && !suppressClick) wrapper.classList.remove('tip-dismissed'); });
    button.addEventListener('blur', () => { wrapper.classList.remove('tip-dismissed'); wrapper.classList.remove('tip-touch-visible'); });
  });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.view-tip')) document.querySelectorAll('.view-tip').forEach(item => item.classList.remove('tip-touch-visible')); });
  document.querySelectorAll('.place-view').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.view === 'mine' && !window.placeCurrentUser) { $('auth-open').click(); return; }
    awaitingInitialAuth = false;
    mode = button.dataset.view; selectedUser = null; setVisitIntent('again');
    updatePersonalFilters();
    live = []; records = []; hasMore = false; nextCursor = null; moreButton.hidden = true; $('saved-places').replaceChildren(); renderMarkers(); status.textContent = '불러오는 중...';
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
    if (!window.placeCurrentUser) { $('auth-open').click(); return; }
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
        const intent = document.createElement('select'); intent.required = true; intent.setAttribute('aria-label', '방문 의향'); [['again','다시 방문할 곳'],['want','가보고 싶은 곳'],['avoid','다시 방문하지 않을 곳']].forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; intent.append(option); }); intent.value = 'again'; const save = document.createElement('button'); save.type = 'submit'; save.textContent = '추가'; form.append(intent, save);
        form.addEventListener('submit', async e => {
          e.preventDefault(); save.disabled = true;
          try {
            await api('/api/places/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placeId: p.id, sido: region.sido, district: region.district, visitIntent: intent.value }) });
            mode = 'mine'; document.querySelector('[data-view="mine"]').click(); dialog.close();
          } catch (error) { searchStatus.textContent = error.message; } finally { save.disabled = false; }
        });
        li.append(title, detail, form); results.append(li);
      });
    } catch (error) { if (error.name !== 'AbortError' && version === searchVersion) searchStatus.textContent = error.message; }
  }
})();
