(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('auth-dialog'), form = $('auth-form'), error = $('auth-error');
  let signup = false;
  const savedId = () => { try { return localStorage.getItem('prefer-place-login-id') || ''; } catch { return ''; } };
  function setMode(value) {
    if (!form || !error) return;
    signup = value; error.textContent = ''; form.reset();
    $('auth-title').textContent = signup ? '회원가입' : '로그인';
    ['nickname', 'email', 'confirm', 'gender'].forEach(name => { $(`${name}-field`).hidden = !signup; });
    ['auth-nickname', 'auth-email', 'auth-confirm'].forEach(id => { $(id).required = signup; });
    $('remember-field').hidden = signup;
    $('auth-username').maxLength = signup ? 30 : 254;
    if (signup) $('auth-username').pattern = '[A-Za-z0-9_]{4,30}';
    else $('auth-username').removeAttribute('pattern');
    $('auth-username').title = signup ? '영문, 숫자, 밑줄을 사용해 4~30자로 입력해 주세요.' : '';
    if (!signup) { $('auth-username').value = savedId(); $('remember-id').checked = !!savedId(); }
    $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    form.querySelector('.auth-submit').textContent = signup ? '회원가입' : '로그인';
    $('auth-switch-label').textContent = signup ? '이미 계정이 있나요?' : '아직 계정이 없나요?';
    $('auth-switch').textContent = signup ? '로그인' : '회원가입';
  }
  function showUser(user) {
    window.placeCurrentUser = user;
    if ($('auth-open')) $('auth-open').hidden = !!user;
    if ($('auth-logout')) $('auth-logout').hidden = !user;
    if ($('auth-user')) {
      $('auth-user').hidden = !user;
      $('auth-user').textContent = user ? `${user.nickname}님 · 마이페이지` : '';
      if (user) $('auth-user').href = '/mypage.html';
    }
    document.dispatchEvent(new CustomEvent('place-auth-change', { detail: { signedIn: !!user, user } }));
  }
  window.placeShowUser = showUser;
  $('auth-open')?.addEventListener('click', () => { setMode(false); dialog?.showModal(); });
  $('auth-close')?.addEventListener('click', () => dialog?.close());
  $('auth-switch')?.addEventListener('click', () => setMode(!signup));
  form?.addEventListener('submit', async event => {
    event.preventDefault(); if (error) error.textContent = ''; const submit = form.querySelector('.auth-submit');
    const data = Object.fromEntries(new FormData(form));
    if (signup && data.password !== data.passwordConfirm) { error.textContent = '비밀번호 확인이 일치하지 않습니다.'; return; }
    submit.disabled = true;
    try {
      const response = await fetch(`/api/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
      if (!signup) { try { if ($('remember-id').checked) localStorage.setItem('prefer-place-login-id', data.username.trim()); else localStorage.removeItem('prefer-place-login-id'); } catch {} }
      showUser(result.user); form.reset(); dialog?.close();
    } catch (e) { if (error) error.textContent = e instanceof SyntaxError ? '로그인 서버에 연결할 수 없습니다.' : e.message || '로그인 서버에 연결할 수 없습니다.'; }
    finally { submit.disabled = false; }
  });
  $('auth-logout')?.addEventListener('click', async () => {
    try { const response = await fetch('/api/auth/me', { method: 'DELETE' }); if (!response.ok) throw new Error(); showUser(null); if (document.body.classList.contains('mypage-route') && dialog && !dialog.open) { setMode(false); dialog.showModal(); } }
    catch { alert('로그아웃을 처리하지 못했습니다. 다시 시도해 주세요.'); }
  });
  fetch('/api/auth/me').then(response => response.ok ? response.json() : null).then(data => {
    const user = data?.user || null;
    showUser(user);
    const profilePage = $('profile-page');
    if (profilePage && document.body.classList.contains('mypage-route')) {
      profilePage.hidden = !user;
      if (!user && dialog) { setMode(false); dialog.showModal(); }
    }
  }).catch(() => {
    showUser(null);
    const profilePage = $('profile-page');
    if (profilePage) {
      profilePage.hidden = true;
      if (dialog) { setMode(false); dialog.showModal(); }
    }
  });
})();
