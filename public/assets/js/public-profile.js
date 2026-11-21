(async function () {
  const $ = id => document.getElementById(id), status = $('status'), list = $('places'), region = $('region');
  const labels = { want: '가보고 싶은 곳', again: '다시 방문할 곳', avoid: '다시 방문하지 않을 곳' };
  try {
    const response = await fetch(`/api/users/public?id=${encodeURIComponent(new URLSearchParams(location.search).get('id') || '')}`, { cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    let nextOffset = data.nextOffset; const more = $('more');
    $('title').textContent = `${data.user.nickname}님의 장소`;
    if (data.user.avatar) { $('avatar').src = data.user.avatar; $('avatar').hidden = false; }
    const groups = [...new Set(data.records.map(r => `${r.region_sido} ${r.region_district}`))];
    function addGroups() { const existing = new Set([...region.options].map(o => o.value)); [...new Set(data.records.map(r => `${r.region_sido} ${r.region_district}`))].filter(group => !existing.has(group)).forEach(group => { const option = document.createElement('option'); option.value = option.textContent = group; region.append(option); }); }
    addGroups();
    function render() { list.replaceChildren(); const records = data.records.filter(r => region.value === 'all' || `${r.region_sido} ${r.region_district}` === region.value); records.forEach(r => { const li = document.createElement('li'); li.textContent = [r.name, r.address, labels[r.visit_status]].filter(Boolean).join(' · '); list.append(li); }); status.textContent = `${records.length}개의 장소${nextOffset !== null ? ' · 더 보기로 추가 장소를 불러오세요.' : ''}`; more.hidden = nextOffset === null; }
    more.addEventListener('click', async () => { more.disabled = true; try { const response = await fetch(`/api/users/public?id=${encodeURIComponent(data.user.id)}&offset=${nextOffset}`, { cache: 'no-store' }); const page = await response.json(); if (!response.ok) throw new Error(page.error); data.records.push(...page.records); nextOffset = page.nextOffset; addGroups(); render(); } catch (error) { status.textContent = error.message || '장소를 불러오지 못했습니다.'; } finally { more.disabled = false; } });
    region.addEventListener('change', render); render();
  } catch (error) { status.textContent = error.message || '프로필을 불러오지 못했습니다.'; region.hidden = true; }
})();
