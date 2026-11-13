(function () {
  'use strict';
  const $ = id => document.getElementById(id), dialog = $('mypage-dialog'), profilePage = document.body.classList.contains('mypage-route') ? $('profile-page') : null;
  const icons = { restaurant: '🍴', cafe: '☕', stay: '🛏', shopping: '🛍', beauty: '💇', medical: '⚕️', culture: '🎭', education: '📚', other: '📍' };
  const labels = { restaurant: '음식점', cafe: '카페·디저트', stay: '숙박', shopping: '쇼핑', beauty: '미용', medical: '의료', culture: '문화', education: '교육', other: '기타' };
  let avatar = null, records = [], category = 'all';
  const drafts = new Map();
  async function api(url, options) {
    const response = await fetch(url, options); const data = await response.json();
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.'); return data;
  }
  const patch = body => api('/api/auth/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  function showAvatar() { $('profile-avatar-preview').hidden = !avatar; $('avatar-placeholder').hidden = !!avatar; if (avatar) $('profile-avatar-preview').src = avatar; else $('profile-avatar-preview').removeAttribute('src'); }
  function fillProfile(user) {
    $('profile-username').value = user.username || ''; $('profile-username').readOnly = !!user.username;
    $('profile-username-hint').textContent = user.username ? '아이디는 변경할 수 없습니다.' : '기존 계정의 새 로그인 아이디를 설정해 주세요. 영문·숫자·밑줄 4~30자';
    $('profile-nickname').value = user.nickname; $('profile-email').value = user.email; $('profile-gender').value = user.gender || '';
    avatar = user.avatar || null; $('profile-avatar').value = ''; showAvatar();
  }
  function selectTab(name) {
    dialog.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === name)));
    ['profile', 'places', 'password'].forEach(tab => { $(`mypage-${tab}`).hidden = tab !== name; });
    if (name === 'places') loadPlaces();
  }
  // The account control is a real anchor to /mypage.html; do not intercept it.
  $('mypage-close')?.addEventListener('click', () => dialog.close());
  dialog?.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  document.addEventListener('place-auth-change', event => {
    if (!event.detail.signedIn) {
      drafts.clear(); records = []; avatar = null;
      if (profilePage) {
        profilePage.hidden = true;
        $('mypage-place-list').replaceChildren();
        $('profile-form').reset(); $('password-form').reset();
        $('place-record-search').value = ''; $('place-visit-filter').value = 'all'; category = 'all';
        dialog.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === 'all')));
        $('profile-status').textContent = ''; $('password-status').textContent = ''; $('mypage-places-status').textContent = '';
        showAvatar();
      }
    }
    if (!event.detail.signedIn && dialog?.open) dialog.close();
    if (profilePage && event.detail.signedIn) { profilePage.hidden = false; fillProfile(event.detail.user); selectTab('profile'); }
  });
  $('profile-avatar')?.addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { $('profile-status').textContent = '5MB 이하의 PNG, JPEG 또는 WebP 이미지를 선택해 주세요.'; event.target.value = ''; return; }
    try {
      const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 192;
      const ctx = canvas.getContext('2d'), size = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 192, 192); bitmap.close();
      avatar = canvas.toDataURL('image/jpeg', .85); showAvatar(); $('profile-status').textContent = '저장하기를 누르면 이미지가 적용됩니다.';
    } catch { $('profile-status').textContent = '이미지를 읽지 못했습니다.'; }
  });
  $('avatar-remove')?.addEventListener('click', () => { avatar = null; if ($('profile-avatar')) $('profile-avatar').value = ''; showAvatar(); });
  $('profile-form')?.addEventListener('submit', async event => {
    event.preventDefault(); const status = $('profile-status'), submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    try { const result = await patch({ action: 'profile', username: $('profile-username').value, nickname: $('profile-nickname').value, gender: $('profile-gender').value, avatar }); window.placeShowUser(result.user); fillProfile(result.user); status.textContent = '내 정보를 저장했습니다.'; }
    catch (error) { status.textContent = error.message; } finally { submit.disabled = false; }
  });
  $('password-form')?.addEventListener('submit', async event => {
    event.preventDefault(); const status = $('password-status'), form = event.currentTarget, data = Object.fromEntries(new FormData(form));
    if (data.newPassword !== data.passwordConfirm) { status.textContent = '새 비밀번호 확인이 일치하지 않습니다.'; return; }
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    try { await patch({ action: 'password', ...data }); form.reset(); status.textContent = '비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.'; }
    catch (error) { status.textContent = error.message; } finally { submit.disabled = false; }
  });
  function renderPlaces() {
    const query = ($('place-record-search')?.value || '').trim().toLocaleLowerCase();
    const filter = $('place-visit-filter')?.value ?? 'all';
    const list = $('mypage-place-list'); list.replaceChildren();
    const visible = records.filter(record => (category === 'all' || record.category === category) && (filter === 'all' || (record.visit_status || '') === filter) && [record.alias, record.name, record.address, record.region_sido, record.region_district, record.note, ...(record.tags || [])].some(value => (value || '').toLocaleLowerCase().includes(query)));
    $('mypage-places-status').textContent = visible.length ? `${visible.length}개의 장소` : (records.length ? '조건에 맞는 장소가 없어요.' : '아직 저장한 장소가 없어요. 지도에서 장소를 추가해 보세요.');
    visible.forEach(record => {
      const li = document.createElement('li'), info = document.createElement('div'), link = document.createElement('a'), region = document.createElement('small'), toggle = document.createElement('button');
      if (/^\d+$/.test(record.place_id)) { link.href = `https://place.map.kakao.com/${encodeURIComponent(record.place_id)}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      link.textContent = `${icons[record.category] || icons.other} ${record.alias || record.name || '기존 카카오 장소 보기'}${record.name ? '' : ' ↗'}`;
      region.textContent = `${record.region_sido} ${record.region_district} · ${labels[record.category] || labels.other}`; info.append(link, region);
      toggle.type = 'button'; toggle.textContent = record.is_public ? '공개' : '비공개'; toggle.setAttribute('aria-pressed', String(!!record.is_public)); toggle.setAttribute('aria-label', `${record.alias || record.name || '장소'} 공개 설정: ${toggle.textContent}`);
      toggle.addEventListener('click', async () => { if (!record.is_public && !window.confirm('이 장소의 이름과 위치가 익명 장소 탐색에 표시될 수 있습니다. 메모, 방문 상태와 태그는 공개되지 않습니다. 공개할까요?')) return; toggle.disabled = true; try { await api('/api/places/records', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placeId: record.place_id, isPublic: !record.is_public }) }); record.is_public = record.is_public ? 0 : 1; toggle.textContent = record.is_public ? '공개' : '비공개'; toggle.setAttribute('aria-pressed', String(!!record.is_public)); toggle.setAttribute('aria-label', `${record.alias || record.name || '장소'} 공개 설정: ${toggle.textContent}`); document.dispatchEvent(new CustomEvent('place-records-change')); } catch (error) { $('mypage-places-status').textContent = error.message; } finally { toggle.disabled = false; } });
      const editor = document.createElement('form'), noteLabel = document.createElement('label'), note = document.createElement('textarea'), visitLabel = document.createElement('label'), visit = document.createElement('select'), tagLabel = document.createElement('label'), tagInput = document.createElement('input'), save = document.createElement('button'), message = document.createElement('p');
      editor.className = 'place-record-editor';
      const draft = drafts.get(record.place_id) || { note: record.note || '', visitStatus: record.visit_status || '', tags: (record.tags || []).join(', ') };
      noteLabel.textContent = '나만의 메모'; note.maxLength = 1000; note.rows = 3; note.value = draft.note; noteLabel.append(note);
      visitLabel.textContent = '방문 상태';
      [['', '선택하지 않음'], ['want', '가보고 싶은 곳'], ['visited', '방문한 곳'], ['again', '다시 가고 싶은 곳']].forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; visit.append(option); });
      visit.value = draft.visitStatus; visitLabel.append(visit); save.type = 'submit'; save.textContent = '기록 저장'; message.setAttribute('role', 'status');
      tagLabel.textContent = '나만의 태그 (쉼표로 구분, 최대 8개)'; tagInput.type = 'text'; tagInput.maxLength = 167; tagInput.placeholder = '예: 조용함, 작업하기 좋은'; tagInput.value = draft.tags; tagLabel.append(tagInput);
      const rememberDraft = () => drafts.set(record.place_id, { note: note.value, visitStatus: visit.value, tags: tagInput.value });
      note.addEventListener('input', rememberDraft); visit.addEventListener('change', rememberDraft); tagInput.addEventListener('input', rememberDraft);
      editor.append(noteLabel, visitLabel, tagLabel, save, message);
      editor.addEventListener('submit', async event => {
        event.preventDefault(); save.disabled = true; message.textContent = '저장 중...';
        const tagText = tagInput.value, saved = { note: note.value, visitStatus: visit.value, tags: tagText.split(',').map(tag => tag.trim()).filter(Boolean) };
        try { await api('/api/places/records', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'details', placeId: record.place_id, ...saved }) }); record.note = saved.note; record.visit_status = saved.visitStatus; record.tags = saved.tags; if (note.value === saved.note && visit.value === saved.visitStatus && tagInput.value === tagText) drafts.delete(record.place_id); message.textContent = '기록을 저장했습니다.'; }
        catch (error) { message.textContent = error.message; } finally { save.disabled = false; }
      });
      const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '메모와 방문 상태'; details.append(summary, editor);
      info.append(details); li.append(info, toggle); list.append(li);
    });
  }
  async function loadPlaces() { $('mypage-places-status').textContent = '불러오는 중...'; try { records = (await api('/api/places/records?mode=mypage')).records || []; renderPlaces(); } catch (error) { $('mypage-places-status').textContent = error.message; } }
  dialog?.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { category = button.dataset.category; dialog.querySelectorAll('[data-category]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderPlaces(); }));
  $('place-record-search')?.addEventListener('input', renderPlaces);
  $('place-visit-filter')?.addEventListener('change', renderPlaces);
})();
