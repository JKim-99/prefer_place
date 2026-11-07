(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('auth-dialog'), form = $('auth-form'), error = $('auth-error');
  let signup = false;
  function setMode(value) {
    signup = value; error.textContent = ''; form.reset();
    $('auth-title').textContent = signup ? '회원가입' : '로그인';
    $('nickname-field').hidden = !signup; $('auth-nickname').required = signup;
    $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    form.querySelector('.auth-submit').textContent = signup ? '회원가입' : '로그인';
    $('auth-switch-label').textContent = signup ? '이미 계정이 있나요?' : '아직 계정이 없나요?';
    $('auth-switch').textContent = signup ? '로그인' : '회원가입';
  }
  function showUser(user) {
    $('auth-open').hidden = !!user; $('auth-logout').hidden = !user; $('auth-user').hidden = !user;
    $('auth-user').textContent = user ? `${user.nickname}님` : '';
  }
  $('auth-open').addEventListener('click', () => { setMode(false); dialog.showModal(); });
  $('auth-close').addEventListener('click', () => dialog.close());
  $('auth-switch').addEventListener('click', () => setMode(!signup));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); error.textContent = ''; const submit = form.querySelector('.auth-submit'); submit.disabled = true;
    const data = Object.fromEntries(new FormData(form)); if (!signup) delete data.nickname;
    try {
      const response = await fetch(`/api/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
      showUser(result.user); form.reset(); dialog.close();
    } catch (e) { error.textContent = e instanceof SyntaxError ? '로그인 서버에 연결할 수 없습니다.' : e.message || '로그인 서버에 연결할 수 없습니다.'; }
    finally { submit.disabled = false; }
  });
  $('auth-logout').addEventListener('click', async () => {
    try { const response = await fetch('/api/auth/me', { method: 'DELETE' }); if (!response.ok) throw new Error(); showUser(null); }
    catch { alert('로그아웃을 처리하지 못했습니다. 다시 시도해 주세요.'); }
  });
  fetch('/api/auth/me').then(response => response.ok ? response.json() : null).then(data => showUser(data?.user || null)).catch(() => showUser(null));
})();
