/* 태핑 v0.1 — 원탭 패션 큐레이션 (서버 없이 동작, 기록은 이 브라우저 localStorage에만 저장) */
(() => {
  'use strict';

  const FEED = window.TAPPING_FEED || [];
  const BY_ID = new Map(FEED.map(f => [f.id, f]));
  const $ = id => document.getElementById(id);

  // ---------- 저장소 (사생활 보호 모드 등에서 실패해도 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tp_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tp_' + k, JSON.stringify(v)); } catch { /* ignore */ } }
  };

  const ALL_CATS = ['outer', 'top', 'bottom', 'shoes', 'bag', 'hat', 'accessory'];
  const SETTINGS_VERSION = 2;              // v2: 「전체」 칩 도입 → 이전 설정은 무효화하고 다시 고르게 함
  let settings = store.get('settingsV', 0) === SETTINGS_VERSION ? store.get('settings', null) : null;
  let profile = store.get('profile', { brand: {}, cat: {}, price: {}, mall: {}, collab: {} });
  const seen = new Set(store.get('seen', []));
  const disliked = new Set(store.get('disliked', []));
  let likes = store.get('likes', []);
  let events = store.get('events', []);
  let recent = [];          // 최근 노출 브랜드 (연속 노출 방지)
  let current = null, nextItem = null, shownAt = 0, busy = false;

  const priceBucket = p => (p < 100000 ? 0 : p < 300000 ? 1 : p < 700000 ? 2 : 3);
  const won = (p, est) => (est ? '약 ' : '') + '₩' + Math.round(p).toLocaleString('ko-KR');

  // ---------- 후보군 ----------
  function matches(f, s) {
    if (s.gender === 'men' && f.g === 'women') return false;
    if (s.gender === 'women' && f.g === 'men') return false;
    return s.cats.includes(f.c) && s.prices.includes(priceBucket(f.p));
  }
  function pool() {
    let list = FEED.filter(f => matches(f, settings) && !seen.has(f.id) && !disliked.has(f.id) && f !== current && f !== nextItem);
    if (!list.length) {                       // 한 바퀴 다 봤으면 본 기록만 초기화 (싫어요는 유지)
      seen.clear();
      toast('조건에 맞는 상품을 한 바퀴 다 봤어요');
      list = FEED.filter(f => matches(f, settings) && !disliked.has(f.id) && f !== current);
    }
    return list;
  }

  // ---------- 추천 (1단계: 규칙 기반) ----------
  const W = { brand: 1.0, cat: 0.6, price: 0.5, mall: 0.4, collab: 0.5 };
  const keys = f => ({ brand: f.b, cat: f.c, price: priceBucket(f.p), mall: f.m, collab: f.x });
  const interactions = () => events.filter(e => e.a !== 'skip').length;

  function pick() {
    const list = pool();
    if (!list.length) return null;
    const sample = list.length > 600 ? shuffle(list).slice(0, 600) : list;

    // 콜드 스타트: 처음 10번의 반응 전까지는 카테고리·브랜드를 골고루, 콜라보 우선
    if (interactions() < 10) {
      const shownCats = events.slice(-12).map(e => BY_ID.get(e.id)?.c);
      const catOrder = [...settings.cats].sort((a, b) => count(shownCats, a) - count(shownCats, b));
      for (const c of catOrder) {
        const cand = sample.filter(f => f.c === c && !recent.includes(f.b));
        if (!cand.length) continue;
        const collab = cand.filter(f => f.x);
        return rand(collab.length && Math.random() < 0.7 ? collab : cand);
      }
      return rand(sample);
    }

    // 20%는 새로운 상품 탐색
    if (Math.random() < 0.2) return rand(sample.filter(f => !recent.includes(f.b))) || rand(sample);

    let best = null, bestScore = -Infinity;
    for (const f of sample) {
      const k = keys(f);
      let s = 0;
      for (const dim in W) s += W[dim] * (profile[dim][k[dim]] || 0);
      if (recent.includes(f.b)) s -= 1.2;
      s += Math.random() * 0.6;
      if (s > bestScore) { bestScore = s; best = f; }
    }
    return best;
  }

  function learn(f, delta) {
    const k = keys(f);
    for (const dim in W) {
      const v = (profile[dim][k[dim]] || 0) + delta;
      profile[dim][k[dim]] = Math.max(-5, Math.min(5, +v.toFixed(3)));
    }
    store.set('profile', profile);
  }

  function logEvent(a) {
    if (!current) return;
    events.push({ id: current.id, a, t: Date.now(), dwell: Date.now() - shownAt });
    if (events.length > 3000) events = events.slice(-3000);
    store.set('events', events);
  }

  // ---------- 화면 ----------
  function render(f) {
    current = f;
    shownAt = Date.now();
    if (!f) { $('brand').textContent = '보여 드릴 상품이 없어요'; $('title').textContent = '설정에서 조건을 넓혀 보세요'; $('price').textContent = ''; $('mall').textContent = ''; $('photo').removeAttribute('src'); return; }
    seen.add(f.id);
    store.set('seen', [...seen].slice(-4000));
    recent = [f.b, ...recent].slice(0, 2);
    $('photo').src = f.im;
    $('photo').alt = `${f.b} ${f.t}`;
    $('brand').textContent = f.b;
    $('title').textContent = f.t;
    $('price').textContent = won(f.p, f.e);
    $('mall').textContent = f.m;
    $('collab').hidden = !f.x;
    $('btn-like').classList.toggle('on', likes.includes(f.id));
    $('btn-like').setAttribute('aria-pressed', String(likes.includes(f.id)));
    // 다음 상품 미리 받아 두기
    nextItem = pick();
    if (nextItem) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = nextItem.im; }
  }

  function advance(leaveClass) {
    if (busy) return;
    busy = true;
    const card = $('card');
    card.classList.add(leaveClass);
    setTimeout(() => {
      const f = nextItem && !seen.has(nextItem.id) ? nextItem : pick();
      card.classList.remove(leaveClass);
      card.classList.add('enter');
      render(f);
      void card.offsetWidth;            // 다시 그리기 강제 → 등장 애니메이션
      card.classList.remove('enter');
      busy = false;
    }, 200);
  }

  // ---------- 행동 ----------
  function onSkip() {
    if (!current) return;
    hideCoach();
    logEvent('skip');
    learn(current, -0.15);
    advance('leave-next');
  }
  // 찜은 하트만 켜고 끄며 다음 상품으로 넘어가지 않는다 (넘기기는 화면 탭으로만)
  function onLike() {
    if (!current) return;
    pop('btn-like');
    const liked = likes.includes(current.id);
    if (liked) {
      likes = likes.filter(id => id !== current.id);
      logEvent('unlike');
      learn(current, -1);                 // 찜 취소 시 학습도 되돌림
      toast('찜을 취소했어요');
    } else {
      likes.unshift(current.id);
      logEvent('like');
      learn(current, 1);
      navigator.vibrate?.(12);
      toast('찜 목록에 담았어요');
    }
    store.set('likes', likes);
    updateLikeCount();
    $('btn-like').classList.toggle('on', !liked);
    $('btn-like').setAttribute('aria-pressed', String(!liked));
  }
  function onDislike() {
    if (!current) return;
    pop('btn-dislike');
    disliked.add(current.id);
    store.set('disliked', [...disliked]);
    logEvent('dislike');
    learn(current, -1);
    advance('leave-dislike');
  }
  function onBuy() {
    if (!current) return;
    pop('btn-buy');
    logEvent('buy');
    learn(current, 2);
    window.open(current.u, '_blank', 'noopener');
    toast(`${current.m}(으)로 이동했어요`);
  }

  // ---------- 시작 설정 ----------
  const ALL_PRICES = [0, 1, 2, 3];
  const allOf = key => (key === 'cats' ? ALL_CATS : ALL_PRICES);

  function initOnboard() {
    const s = settings || { gender: 'all', cats: [...ALL_CATS], prices: [...ALL_PRICES] };
    document.querySelectorAll('[data-key]').forEach(group => {
      const key = group.dataset.key;
      const isAll = key !== 'gender' && s[key].length === allOf(key).length;
      group.querySelectorAll('button').forEach(b => {
        let on;
        if (key === 'gender') on = s.gender === b.dataset.v;
        else if (b.dataset.v === 'all') on = isAll;
        else on = !isAll && s[key].includes(key === 'prices' ? Number(b.dataset.v) : b.dataset.v);
        b.setAttribute('aria-pressed', String(on));
      });
    });
    updateCount();
  }
  function readOnboard() {
    const out = { gender: 'all', cats: [], prices: [] };
    document.querySelectorAll('[data-key]').forEach(group => {
      const key = group.dataset.key;
      group.querySelectorAll('button[aria-pressed="true"]').forEach(b => {
        if (key === 'gender') out.gender = b.dataset.v;
        else if (b.dataset.v === 'all') out[key] = [...allOf(key)];
        else out[key].push(key === 'prices' ? Number(b.dataset.v) : b.dataset.v);
      });
    });
    return out;
  }
  function updateCount() {
    const s = readOnboard();
    const n = s.cats.length && s.prices.length ? FEED.filter(f => matches(f, s)).length : 0;
    $('ob-count').textContent = n ? `지금 조건에 맞는 상품 ${n.toLocaleString()}개` : '카테고리와 가격을 하나 이상 골라 주세요';
    $('start').disabled = !n;
  }
  document.querySelectorAll('[data-key]').forEach(group => {
    group.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const btns = [...group.querySelectorAll('button')];
      const allBtn = btns.find(x => x.dataset.v === 'all');
      if (group.hasAttribute('data-single')) {
        btns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      } else if (b === allBtn) {
        // 「전체」를 누르면 개별 선택을 모두 끄고 전체만 켠다
        btns.forEach(x => x.setAttribute('aria-pressed', String(x === allBtn)));
      } else {
        // 개별 칩을 누르면 「전체」는 꺼지고, 그 칩만 켜고 끈다 → 아우터만 누르면 아우터만 선택
        allBtn.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        if (!btns.some(x => x !== allBtn && x.getAttribute('aria-pressed') === 'true')) allBtn.setAttribute('aria-pressed', 'true');
      }
      updateCount();
    });
  });
  $('start').addEventListener('click', () => {
    settings = readOnboard();
    store.set('settings', settings);
    store.set('settingsV', SETTINGS_VERSION);
    showFeed();
  });

  function showFeed() {
    $('onboard').hidden = true;
    $('feed').hidden = false;
    nextItem = null;
    render(pick());
    $('stage').focus({ preventScroll: true });
    if (store.get('coachDone', false)) hideCoach(); else setTimeout(hideCoach, 3500);
  }
  function showOnboard() {
    $('feed').hidden = true;
    $('onboard').hidden = false;
    initOnboard();
  }

  // ---------- 찜 목록 ----------
  function updateLikeCount() {
    const el = $('like-count');
    el.textContent = likes.length ? String(likes.length) : '';
    el.toggleAttribute('data-zero', !likes.length);
  }
  function openLikes() {
    const grid = $('like-grid');
    grid.innerHTML = '';
    const items = likes.map(id => BY_ID.get(id)).filter(Boolean);
    $('likes-empty').hidden = items.length > 0;
    for (const f of items) {
      const a = document.createElement('a');
      a.className = 'like-item'; a.href = f.u; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<div class="ph"><img loading="lazy" referrerpolicy="no-referrer" alt=""></div><div class="tx"><b></b><span class="t"></span><div class="pr"></div></div>';
      a.querySelector('img').src = f.im;
      a.querySelector('b').textContent = f.b;
      a.querySelector('.t').textContent = f.t;
      a.querySelector('.pr').textContent = won(f.p, f.e);
      grid.appendChild(a);
    }
    $('likes').hidden = false;
  }

  // ---------- 보조 ----------
  function hideCoach() { $('coach').classList.add('hide'); store.set('coachDone', true); }
  function pop(id) { const b = $(id); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
  const rand = a => (a && a.length ? a[Math.floor(Math.random() * a.length)] : null);
  const count = (a, v) => a.filter(x => x === v).length;
  function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

  // ---------- 이벤트 연결 ----------
  $('stage').addEventListener('click', onSkip);
  $('btn-like').addEventListener('click', onLike);
  $('btn-dislike').addEventListener('click', onDislike);
  $('btn-buy').addEventListener('click', onBuy);
  $('open-likes').addEventListener('click', openLikes);
  $('close-likes').addEventListener('click', () => { $('likes').hidden = true; });
  $('likes').addEventListener('click', e => { if (e.target === $('likes')) $('likes').hidden = true; });
  $('open-settings').addEventListener('click', showOnboard);
  $('photo').addEventListener('error', () => { if (current) { busy = false; advance('leave-next'); } });
  document.addEventListener('keydown', e => {
    if ($('feed').hidden || !$('likes').hidden) { if (e.key === 'Escape') $('likes').hidden = true; return; }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSkip(); }
    else if (e.key.toLowerCase() === 'l') onLike();
    else if (e.key.toLowerCase() === 'd') onDislike();
    else if (e.key.toLowerCase() === 'b') onBuy();
  });

  // ---------- 시작 ----------
  updateLikeCount();
  if (!FEED.length) { document.body.innerHTML = '<p style="padding:24px">feed.js가 없습니다. pipeline에서 node build_feed.js를 실행해 주세요.</p>'; return; }
  if (settings) showFeed(); else showOnboard();
})();
