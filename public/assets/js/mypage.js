(function () {
  'use strict';
  const $ = id => document.getElementById(id), dialog = $('mypage-dialog');
  const icons = { restaurant: '🍴', cafe: '☕', stay: '🛏', other: '📍' };
  const labels = { restaurant: '음식점', cafe: '카페', stay: '숙박', other: '기타' };
  let avatar = null, records = [], category = 'all';
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
  $('auth-user').addEventListener('click', () => { if (!window.placeCurrentUser) return; fillProfile(window.placeCurrentUser); $('profile-status').textContent = ''; $('password-status').textContent = ''; selectTab('profile'); dialog.showModal(); });
  $('mypage-close').addEventListener('click', () => dialog.close());
  dialog.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  document.addEventListener('place-auth-change', event => { if (!event.detail.signedIn && dialog.open) dialog.close(); });
  $('profile-avatar').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { $('profile-status').textContent = '5MB 이하의 PNG, JPEG 또는 WebP 이미지를 선택해 주세요.'; event.target.value = ''; return; }
    try {
      const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 192;
      const ctx = canvas.getContext('2d'), size = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 192, 192); bitmap.close();
      avatar = canvas.toDataURL('image/jpeg', .85); showAvatar(); $('profile-status').textContent = '저장하기를 누르면 이미지가 적용됩니다.';
    } catch { $('profile-status').textContent = '이미지를 읽지 못했습니다.'; }
  });
  $('avatar-remove').addEventListener('click', () => { avatar = null; $('profile-avatar').value = ''; showAvatar(); });
  $('profile-form').addEventListener('submit', async event => {
    event.preventDefault(); const status = $('profile-status'), submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    try { const result = await patch({ action: 'profile', username: $('profile-username').value, nickname: $('profile-nickname').value, gender: $('profile-gender').value, avatar }); window.placeShowUser(result.user); fillProfile(result.user); status.textContent = '내 정보를 저장했습니다.'; }
    catch (error) { status.textContent = error.message; } finally { submit.disabled = false; }
  });
  $('password-form').addEventListener('submit', async event => {
    event.preventDefault(); const status = $('password-status'), form = event.currentTarget, data = Object.fromEntries(new FormData(form));
    if (data.newPassword !== data.passwordConfirm) { status.textContent = '새 비밀번호 확인이 일치하지 않습니다.'; return; }
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    try { await patch({ action: 'password', ...data }); form.reset(); status.textContent = '비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.'; }
    catch (error) { status.textContent = error.message; } finally { submit.disabled = false; }
  });
  function renderPlaces() {
    const list = $('mypage-place-list'); list.replaceChildren(); const visible = records.filter(record => category === 'all' || record.category === category);
    $('mypage-places-status').textContent = visible.length ? `${visible.length}개의 장소` : '이 카테고리에 저장된 장소가 없어요.';
    visible.forEach(record => {
      const li = document.createElement('li'), info = document.createElement('div'), link = document.createElement('a'), region = document.createElement('small'), toggle = document.createElement('button');
      link.href = `https://place.map.kakao.com/${encodeURIComponent(record.place_id)}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = `${icons[record.category] || icons.other} ${record.alias || '카카오맵에서 장소 확인'} ↗`;
      region.textContent = `${record.region_sido} ${record.region_district} · ${labels[record.category] || labels.other}`; info.append(link, region);
      toggle.type = 'button'; toggle.textContent = record.is_public ? '공개' : '비공개'; toggle.setAttribute('aria-pressed', String(!!record.is_public)); toggle.setAttribute('aria-label', `${record.alias || '장소'} 공개 설정: ${toggle.textContent}`);
      toggle.addEventListener('click', async () => { toggle.disabled = true; try { await api('/api/places/records', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placeId: record.place_id, isPublic: !record.is_public }) }); record.is_public = record.is_public ? 0 : 1; renderPlaces(); document.dispatchEvent(new CustomEvent('place-records-change')); } catch (error) { $('mypage-places-status').textContent = error.message; toggle.disabled = false; } });
      li.append(info, toggle); list.append(li);
    });
  }
  async function loadPlaces() { $('mypage-places-status').textContent = '불러오는 중...'; try { records = (await api('/api/places/records?mode=mypage')).records || []; renderPlaces(); } catch (error) { $('mypage-places-status').textContent = error.message; } }
  dialog.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { category = button.dataset.category; dialog.querySelectorAll('[data-category]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderPlaces(); }));
})();
