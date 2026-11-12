/* 태핑 이용 통계 (v1.2, 2026-11-12) — KPI(방문·재방문·넘긴 장수·찜·구매 클릭)용
   · 기기마다 임의 번호(익명)로 Supabase app_events 표에 모아 보낸다. 이름·이메일·IP는 보내지 않음 (로그인 상태면 서버가 회원 번호만 붙임)
   · 끄기: 내 계정 시트 → '익명 이용 통계 보내기' 끄기 / 운영자 기기 표시: 주소 뒤에 ?me=1 한 번 (지표에서 뺌)
   · 표가 아직 없거나(SQL 실행 전) 권한 오류면 이번 방문 동안 조용히 멈춘다. 검색 로봇·자동화 브라우저는 세지 않음 */
window.TP_STATS = (() => {
  'use strict';
  const cfg = window.TAPPING_CONFIG || {};
  const VER = '1.2';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장이 막힌 환경 */ } }
  };
  const rid = () => {
    try { return crypto.randomUUID().replace(/-/g, '').slice(0, 24); }
    catch { return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24); }
  };
  let anon = ls.get('tp_anon');
  if (!anon || anon.length < 8) { anon = rid(); ls.set('tp_anon', anon); }
  // 세션: 30분 넘게 쉬면 새 세션
  const SESSION_GAP = 30 * 60e3;
  let sess = ls.get('tp_sess');
  const isNewSession = !sess || Date.now() - (Number(ls.get('tp_sess_t')) || 0) > SESSION_GAP;
  if (isNewSession) { sess = rid(); ls.set('tp_sess', sess); }
  const touch = () => ls.set('tp_sess_t', String(Date.now()));
  touch();
  const params = new URLSearchParams(location.search);
  if (params.get('me') === '1') ls.set('tp_internal', '1');
  if (params.get('me') === '0') ls.set('tp_internal', '0');
  const ua = navigator.userAgent || '';
  const bot = navigator.webdriver === true || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|kakaotalk-scrap|yeti|daum/i.test(ua);
  const device = /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'pc';
  const standalone = (() => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } })();
  const ref = (() => {
    const u = params.get('utm_source') || params.get('ref');
    if (u) return u.slice(0, 60);
    try { const h = document.referrer && new URL(document.referrer).host; return h && h !== location.host ? h.slice(0, 60) : ''; } catch { return ''; }
  })();
  let internal = ls.get('tp_internal') === '1';
  const on = () => !bot && ls.get('tp_stats') !== '0' && !!(cfg.supabaseUrl && cfg.supabaseKey);

  let dead = false, timer = 0, token = () => null;
  const queue = [];
  function ev(name, f, extra) {
    if (!on() || dead) return;
    touch();
    const row = { anon_id: anon, session_id: sess, ev: name, device, ver: VER, internal };
    if (f) Object.assign(row, { item_id: String(f.id).slice(0, 200), brand: String(f.b || '').slice(0, 120), mall: String(f.m || '').slice(0, 120), cat: f.c || null, price: Math.max(0, Math.min(1e8, Math.round(f.p) || 0)), collab: !!f.x });
    if (extra) Object.assign(row, extra);
    queue.push(row);
    if (queue.length > 300) queue.splice(0, queue.length - 300);
    clearTimeout(timer);
    timer = setTimeout(send, queue.length >= 25 ? 0 : 8000);
  }
  async function post(rows, keep, auth) {
    return fetch(cfg.supabaseUrl + '/rest/v1/app_events', {
      method: 'POST', keepalive: !!keep,
      headers: { apikey: cfg.supabaseKey, Authorization: 'Bearer ' + (auth || cfg.supabaseKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows)
    });
  }
  async function send(keep) {
    clearTimeout(timer);
    if (!queue.length || dead) return;
    const rows = queue.splice(0, 80);
    try {
      let r = await post(rows, keep, token());
      if (r.status === 401 && token()) r = await post(rows, keep, null);   // 로그인 토큰이 만료됐으면 익명으로
      if (r.ok) { if (queue.length) send(keep); return; }
      if ([400, 401, 403, 404].includes(r.status)) { dead = true; queue.length = 0; return; }   // 표 없음·권한 없음: 이번 방문은 멈춤
      queue.unshift(...rows);
    } catch { queue.unshift(...rows); }
  }
  const flush = () => send(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  return {
    ev, flush, isNewSession, standalone,
    enabled: () => ls.get('tp_stats') !== '0',
    setEnabled(v) { ls.set('tp_stats', v ? '1' : '0'); if (!v) queue.length = 0; },
    setInternal(v) { internal = !!v; if (v) ls.set('tp_internal', '1'); },
    useToken(fn) { token = fn; },
    open(loadMs) { ev('open', null, { ref: ref || null, standalone, load_ms: Math.max(0, Math.min(600000, Math.round(loadMs) || 0)) }); }
  };
})();
