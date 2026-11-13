(function () {
  'use strict';
  const root = 'https://prefer-place-public-catalog.pages.dev/';
  let manifestPromise, cachedKey = '', cachedRows = null, pending = null;
  async function json(url) {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error('검색 데이터를 불러오지 못했습니다.');
    return response.json();
  }
  async function regionRows(sido, district) {
    if (!manifestPromise) manifestPromise = json(`${root}manifest.json`).catch(error => { manifestPromise = null; throw error; });
    const manifest = await manifestPromise;
    const key = `${sido}|${district}`, filename = manifest.regions?.[key];
    if (!/^[a-f0-9]{24}\.json$/.test(filename || '') || !/^\d{8}$/.test(manifest.version || '')) throw new Error('이 지역의 전체 검색 데이터가 아직 준비되지 않았어요.');
    if (cachedKey === key && cachedRows) return { rows: cachedRows, version: manifest.version };
    if (!pending || pending.key !== key) {
      const request = { key, promise: json(root + filename) }; pending = request;
    }
    const request = pending;
    try {
      const rows = await request.promise;
      if (!Array.isArray(rows)) throw new Error('검색 데이터 형식을 확인할 수 없어요.');
      if (pending === request) { cachedKey = key; cachedRows = rows; }
      return { rows, version: manifest.version };
    } finally { if (pending === request) pending = null; }
  }
  window.searchPublicCatalog = async (sido, district, query) => {
    const { rows, version } = await regionRows(sido, district), needle = query.toLocaleLowerCase('ko');
    const matches = rows.filter(row => Array.isArray(row) && typeof row[1] === 'string' && row[1].toLocaleLowerCase('ko').includes(needle));
    matches.sort((a, b) => Number(!a[1].toLocaleLowerCase('ko').startsWith(needle)) - Number(!b[1].toLocaleLowerCase('ko').startsWith(needle)) || a[1].localeCompare(b[1], 'ko'));
    return { version, places: matches.slice(0, 30).map(([id, name, address, category, categoryName, x, y]) => ({ id, name, address, category, categoryName, x, y, data_version: version })) };
  };
})();
