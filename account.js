/* 태핑 계정 — Supabase 로그인 · 자동 로그인 · 찜/취향 서버 동기화
   · 로그인 없이도 넘겨 보기는 가능, 찜·싫어요·맞춤 추천은 로그인 후
   · 자동 로그인: 켜면 이 기기(localStorage)에 로그인 유지, 끄면 탭·브라우저를 닫을 때 로그아웃(sessionStorage) */
window.TP_ACCOUNT = (() => {
  'use strict';

  const cfg = window.TAPPING_CONFIG || {};
  const ready = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const remember = () => ls.get('tp_remember') !== '0';

  // 로그인 토큰 저장 위치: 자동 로그인이면 localStorage, 아니면 sessionStorage
  const storage = {
    getItem(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
    setItem(k, v) {
      try {
        const [keep, drop] = remember() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
        keep.setItem(k, v);
        drop.removeItem(k);
      } catch { /* ignore */ }
    },
    removeItem(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } }
  };

  const sb = ready ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { storage, storageKey: 'tp_auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  let user = null, role = 'user';

  async function setUser(u) {
    user = u || null;
    role = 'user';
    if (user) {
      const { data } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
      role = data?.role || 'user';
    }
    return user;
  }

  // ---------- 로그인 ----------
  async function restore() {                 // 자동 로그인: 저장된 세션이 있으면 그대로 이어서
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return setUser(data.session?.user);
  }
  async function signIn(email, password, keep) {
    ls.set('tp_remember', keep ? '1' : '0');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return setUser(data.user);
  }
  async function signUp(email, password, keep) {
    ls.set('tp_remember', keep ? '1' : '0');
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    if (!data.session) return null;          // 메일 인증을 켜 둔 경우: 인증 링크를 누른 뒤 로그인
    return setUser(data.user);
  }
  async function signOut() {
    await flush();
    user = null; role = 'user';
    queue.length = 0; pending = null;
    ['tp_pending', 'tp_dirty'].forEach(ls.del);
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});   // 이 기기만 로그아웃
  }
  // 다른 탭에서 로그아웃했거나 로그인 기간이 끝났을 때
  function onSignedOut(cb) {
    sb?.auth.onAuthStateChange(ev => {
      if (ev === 'SIGNED_OUT' && user) setTimeout(() => { user = null; role = 'user'; cb(); }, 0);
    });
  }

  // ---------- 찜·싫어요·취향 (회원당 1줄) ----------
  async function loadState() {
    const { data, error } = await sb.from('user_state').select('likes,disliked,profile,settings,updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }
  let pending = null, saveTimer = 0;
  function saveState(state) {                // 1.5초 모아서 저장, 실패하면 다음 저장 때 다시
    if (!user) return;
    pending = state;
    ls.set('tp_dirty', 'true');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushState, 1500);
  }
  async function pushState() {
    clearTimeout(saveTimer);
    if (!user || !pending) return;
    const s = pending;
    pending = null;
    const { error } = await sb.from('user_state').upsert({ user_id: user.id, ...s, updated_at: new Date().toISOString() });
    if (error) { pending = pending || s; return; }
    if (!pending) ls.set('tp_dirty', 'false');
  }

  // ---------- 반응 기록 (추천 2·3단계 학습용) ----------
  const queue = (() => { try { return JSON.parse(ls.get('tp_pending') || '[]'); } catch { return []; } })();
  const saveQueue = () => ls.set('tp_pending', JSON.stringify(queue.slice(-3000)));
  let evTimer = 0, flushing = false;
  function track(...rows) {
    if (!user || !rows.length) return;
    queue.push(...rows);
    saveQueue();
    clearTimeout(evTimer);
    if (queue.length >= 20) flushEvents(); else evTimer = setTimeout(flushEvents, 5000);
  }
  async function flushEvents() {
    if (!user || !queue.length || flushing) return;
    flushing = true;
    const rows = queue.slice(0, 500);
    const { error } = await sb.from('events').insert(rows, { defaultToNull: false });   // user_id는 서버가 채움
    flushing = false;
    if (error) return;
    queue.splice(0, rows.length);
    saveQueue();
    if (queue.length) flushEvents();
  }
  async function flush() { await Promise.allSettled([pushState(), flushEvents()]); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // ---------- 관리자 ----------
  async function adminStats() {
    const { data, error } = await sb.rpc('admin_stats');
    if (error) throw error;
    return data;
  }

  // ---------- 오류 문구 ----------
  function message(err) {
    const code = err?.code || '', msg = String(err?.message || '').toLowerCase();
    if (code === 'invalid_credentials' || msg.includes('invalid login')) return '이메일 또는 비밀번호가 맞지 않아요';
    if (code === 'user_already_exists' || msg.includes('already registered')) return '이미 가입된 이메일이에요. 로그인해 주세요';
    if (code === 'email_not_confirmed') return '메일함에서 인증 링크를 먼저 눌러 주세요';
    if (code === 'weak_password' || msg.includes('password should')) return '비밀번호를 더 길고 복잡하게 만들어 주세요';
    if (code === 'email_address_invalid' || code === 'validation_failed' || msg.includes('invalid format')) return '이메일 주소를 다시 확인해 주세요';
    if (code === 'signup_disabled') return '지금은 회원가입을 받지 않아요';
    if (err?.status === 429 || code.startsWith('over_')) return '시도가 너무 많아요. 잠시 후 다시 해 주세요';
    if (msg.includes('fetch') || msg.includes('network')) return '인터넷 연결을 확인해 주세요';
    return '문제가 생겼어요. 잠시 후 다시 시도해 주세요';
  }

  return {
    ready, remember, restore, signIn, signUp, signOut, onSignedOut,
    loadState, saveState, track, flush, adminStats, message,
    get user() { return user; },
    get isAdmin() { return role === 'admin'; }
  };
})();
