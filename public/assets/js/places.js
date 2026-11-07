(function () {
  'use strict';
  const status = document.getElementById('place-status');
  document.querySelectorAll('.place-view').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.place-view').forEach((item) => {
      const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active));
    });
    status.textContent = { mine: '내 장소 기능을 준비하고 있어요.', popular: '많이 방문한 장소 기능을 준비하고 있어요.', anonymous: '공개 장소 탐색 기능을 준비하고 있어요.' }[button.dataset.view];
  }));
  document.getElementById('place-search-open').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.user) { document.getElementById('auth-open').click(); return; }
      status.textContent = '장소 검색 데이터 연결을 준비하고 있어요.';
    } catch { status.textContent = '로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'; }
  });
})();
