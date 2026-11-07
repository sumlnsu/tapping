/* 태핑 v0.5 — 원탭 패션 큐레이션
   · 모바일: 빈 곳을 탭하면 다음 / PC(1024px~): 사진을 클릭하면 다음 + 단축키
   · 비로그인: 넘겨 보기 + 구매 링크 (취향 학습 없음) / 로그인: 찜·싫어요·반응 학습 맞춤 추천 (account.js)
   · 추천 점수에 신상품(발매일·처음 본 날)과 콜라보 가산점 */
(() => {
  'use strict';

  const FEED = expandFeed(window.TAPPING_FEED);
  const BY_ID = new Map(FEED.map(f => [f.id, f]));
  const $ = id => document.getElementById(id);
  const acct = window.TP_ACCOUNT;
  const isPC = () => matchMedia('(min-width: 1024px)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // feed.js v2(압축) → 앱에서 쓰는 객체. v1(객체 배열)도 그대로 받음
  function expandFeed(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const unpackImg = s => { const k = s.indexOf('~'); return k > 0 && k < 3 ? raw.img[+s.slice(0, k)] + s.slice(k + 1) : s; };
    return raw.items.map(([pid, m, b, t, p, e, c, s, g, x, u, im, r, f]) => {
      const [mall, idPrefix, urlPrefix] = raw.malls[m];
      return {
        id: idPrefix + pid, b: raw.brands[b], t, p, e, c, s, g, x, m: mall,
        u: /^https?:/.test(u) ? u : urlPrefix + (u || pid), im: unpackImg(im), r, f
      };
    });
  }

  // ---------- 저장소 (사생활 보호 모드 등에서 실패해도 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tp_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tp_' + k, JSON.stringify(v)); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem('tp_' + k); } catch { /* ignore */ } }
  };
  const USER_KEYS = ['likes', 'disliked', 'profile', 'events', 'owner'];   // 로그인한 사람의 기록 → 로그아웃하면 이 기기에서 지움

  const ALL_CATS = ['outer', 'top', 'bottom', 'shoes', 'bag', 'hat', 'accessory'];
  const SETTINGS_VERSION = 2;              // v2: 「전체」 칩 도입 → 이전 설정은 무효화하고 다시 고르게 함
  let settings = store.get('settingsV', 0) === SETTINGS_VERSION ? store.get('settings', null) : null;
  const emptyProfile = () => ({ brand: {}, cat: {}, price: {}, mall: {}, collab: {}, n: 0 });
  let me = null;                           // 로그인한 사용자 (null = 비로그인)
  let profile = emptyProfile();
  const seen = new Set(store.get('seen', []));
  const disliked = new Set();
  let likes = [], events = [];
  let pendingAct = null;                   // 비로그인 때 누른 ❤️/👎 → 로그인 직후 이어서 실행
  const shownLog = [];                     // 이번에 보여 준 상품 기록 (최근 30장: 브랜드·몰·세부 분류 다양성용)
  let current = null, nextItem = null, shownAt = 0, busy = false;

  const priceBucket = p => (p < 100000 ? 0 : p < 300000 ? 1 : p < 700000 ? 2 : 3);
  const won = (p, est) => (est ? '약 ' : '') + '₩' + Math.round(p).toLocaleString('ko-KR');

  // ---------- 신상품 · 콜라보 가산점 ----------
  const TODAY = Math.floor(Date.now() / 864e5);
  const ageDays = f => (f.r || f.f ? TODAY - (f.r || f.f) : Infinity);       // 발매일, 없으면 처음 본 날
  const isNew = f => ageDays(f) <= 14;
  const freshness = f => { const a = ageDays(f); return a === Infinity ? 0 : Math.exp(-Math.max(0, a) / 21); };  // 3주마다 1/e
  const prior = f => 1.2 * freshness(f) + 0.6 * (f.x ? 1 : 0);

  // ---------- 후보군 ----------
  function matches(f, s) {
    if (s.gender === 'men' && f.g === 'women') return false;
    if (s.gender === 'women' && f.g === 'men') return false;
    return s.cats.includes(f.c) && s.prices.includes(priceBucket(f.p));
  }
  // 찜한 상품·싫어요 누른 상품·이미 본 상품은 다시 보여 주지 않는다 (찜은 찜 목록에서 보기)
  function pool() {
    const liked = new Set(likes);
    let list = FEED.filter(f => matches(f, settings) && !seen.has(f.id) && !disliked.has(f.id) && !liked.has(f.id) && f !== current && f !== nextItem);
    if (!list.length) {                       // 한 바퀴 다 봤으면 본 기록만 초기화 (찜·싫어요는 계속 제외)
      seen.clear();
      toast('조건에 맞는 상품을 한 바퀴 다 봤어요');
      list = FEED.filter(f => matches(f, settings) && !disliked.has(f.id) && !liked.has(f.id) && f !== current);
    }
    return list;
  }

  // ---------- 다양성: 같은 브랜드·몰·세부 분류가 연달아 나오지 않게 ----------
  const lastN = (n, key) => shownLog.slice(-n).map(x => x[key]);
  // level 0이 가장 엄격. 후보가 없으면 한 단계씩 풀어 준다
  function allowed(f, level) {
    if (level >= 3) return true;
    if (lastN([5, 3, 1][level], 'b').includes(f.b)) return false;                       // 같은 브랜드: 최근 5장 안에 다시 안 나옴
    const malls = lastN(2, 'm');
    if (level <= 1 && malls.length === 2 && malls.every(m => m === f.m)) return false;   // 같은 몰 3연속 금지
    const subs = lastN(2, 's');
    if (level === 0 && f.s && subs.length === 2 && subs.every(s => s === f.s)) return false;  // 같은 세부 분류 3연속 금지
    return true;
  }
  function diverse(list) {
    for (let level = 0; level < 3; level++) { const l = list.filter(f => allowed(f, level)); if (l.length) return l; }
    return list;
  }
  // 피로도: 최근 20장에 많이 나온 브랜드·몰일수록 감점 → 좋아하는 브랜드도 간격을 두고 다시 나온다
  function fatigue(f) {
    let b = 0, m = 0;
    for (const x of shownLog.slice(-20)) { if (x.b === f.b) b++; if (x.m === f.m) m++; }
    return 0.6 * b + 0.15 * m;
  }
  const sat = v => 2.5 * Math.tanh((v || 0) / 2.5);      // 학습 점수 포화: 한 브랜드가 추천을 독차지하지 않게

  // ---------- 추천 (1단계: 규칙 기반 + 신상품·콜라보 가산, 로그인 사용자만 학습) ----------
  const W = { brand: 1.0, cat: 0.6, price: 0.5, mall: 0.4, collab: 0.5 };
  const W_PRIOR = 0.8;
  const keys = f => ({ brand: f.b, cat: f.c, price: priceBucket(f.p), mall: f.m, collab: f.x });
  const interactions = () => Math.max(profile.n || 0, events.filter(e => e.a !== 'skip').length);

  function pick() {
    const list = pool();
    if (!list.length) return null;
    const sample = diverse(list.length > 800 ? shuffle(list).slice(0, 800) : list);

    // 콜드 스타트(비로그인 포함): 반응 10번 전까지는 카테고리를 돌아가며, 신상품·콜라보일수록 자주
    if (interactions() < 10) {
      const shownCats = lastN(12, 'c');
      const catOrder = [...settings.cats].sort((a, b) => count(shownCats, a) - count(shownCats, b));
      for (const c of catOrder) {
        const cand = sample.filter(f => f.c === c);
        if (cand.length) return weighted(cand, f => (0.15 + prior(f)) * Math.exp(-fatigue(f)));
      }
      return weighted(sample, f => 0.15 + prior(f));
    }

    // 4장 중 1장꼴: 최근 20장에 없던 브랜드에서 새로 발견 (신상품·콜라보 우대)
    if (Math.random() < 0.25) {
      const recent20 = new Set(lastN(20, 'b'));
      const discover = sample.filter(f => !recent20.has(f.b));
      if (discover.length) return weighted(discover, f => 0.3 + prior(f));
    }

    // 취향 점수(포화) + 신상품·콜라보 − 피로도 → 상위 12개 중에서 점수에 비례해 확률적으로 (늘 1등만 고르지 않음)
    const scored = sample.map(f => {
      const k = keys(f);
      let s = W_PRIOR * prior(f) - fatigue(f) + Math.random() * 0.3;
      for (const dim in W) s += W[dim] * sat(profile[dim][k[dim]]);
      return [f, s];
    }).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const top = scored[0][1];
    return weighted(scored, ([, s]) => Math.exp((s - top) / 0.6))[0];
  }

  const clamp = v => Math.max(-5, Math.min(5, +v.toFixed(3)));
  function learn(f, delta) {
    const k = keys(f);
    for (const dim in W) profile[dim][k[dim]] = clamp((profile[dim][k[dim]] || 0) + delta);
  }

  // 로그인 상태의 반응만 기록·학습 → 이 기기 + 서버(찜·취향 1줄, 반응 기록)
  function record(f, a, delta, dwell = 0) {
    if (!me || !f) return;
    learn(f, delta);
    if (a !== 'skip') profile.n = (profile.n || 0) + 1;
    events.push({ id: f.id, a, t: Date.now(), dwell });
    if (events.length > 3000) events = events.slice(-3000);
    acct.track(eventRow(f, a, dwell, Date.now()));
    persist();
  }
  const eventRow = (f, a, dwell, t) => ({ item_id: f.id, ev: a, brand: f.b, cat: f.c, price: Math.round(f.p), dwell_ms: dwell || 0, created_at: new Date(t).toISOString() });
  function saveLocal() {
    store.set('likes', likes);
    store.set('disliked', [...disliked].slice(-5000));
    store.set('profile', profile);
    store.set('events', events);
  }
  function persist() {
    if (!me) return;
    saveLocal();
    acct.saveState({ likes, disliked: [...disliked].slice(-5000), profile, settings });
  }

  // ---------- 화면 ----------
  function render(f) {
    current = f;
    shownAt = Date.now();
    if (!f) {
      $('brand').textContent = '보여 드릴 상품이 없어요'; $('title').textContent = '설정에서 조건을 넓혀 보세요';
      $('price').textContent = ''; $('mall').textContent = ''; $('photo').removeAttribute('src');
      $('collab').hidden = true; $('new').hidden = true;
      return;
    }
    seen.add(f.id);
    store.set('seen', [...seen].slice(-4000));
    shownLog.push({ b: f.b, m: f.m, s: f.s, c: f.c });
    if (shownLog.length > 30) shownLog.shift();
    $('photo').src = f.im;
    $('photo').alt = `${f.b} ${f.t}`;
    $('brand').textContent = f.b;
    $('title').textContent = f.t;
    $('title').title = f.t;
    $('price').textContent = won(f.p, f.e);
    $('mall').textContent = f.m;
    $('collab').hidden = !f.x;
    $('new').hidden = !isNew(f);
    setLikeBtn(likes.includes(f.id));
    // 다음 상품 미리 받아 두기
    nextItem = pick();
    if (nextItem) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = nextItem.im; }
  }

  function advance(leaveClass) {
    if (busy) return;
    busy = true;
    const v = $('viewer');
    v.classList.add(leaveClass);
    setTimeout(() => {
      const f = nextItem && !seen.has(nextItem.id) ? nextItem : pick();
      v.classList.remove(leaveClass);
      v.classList.add('enter');
      render(f);
      void v.offsetWidth;               // 다시 그리기 강제 → 등장 애니메이션
      v.classList.remove('enter');
      busy = false;
    }, 170);
  }

  // ---------- 행동 ----------
  const dwell = () => Date.now() - shownAt;
  function onSkip() {
    if (!current) return;
    hideCoach();
    if (me) record(current, 'skip', -0.15, dwell()); else maybeNudge();
    advance('leave-next');
  }
  // 찜은 하트만 켜고 끄며 다음 상품으로 넘어가지 않는다 (넘기기는 화면 탭·클릭으로만)
  function onLike() {
    if (!current) return;
    if (!me) return askLogin('like');
    pop('btn-like');
    const f = current, liked = likes.includes(f.id);
    if (liked) likes = likes.filter(id => id !== f.id); else likes.unshift(f.id);
    record(f, liked ? 'unlike' : 'like', liked ? -1 : 1, dwell());   // 찜 취소 시 학습도 되돌림
    if (!liked) navigator.vibrate?.(12);
    toast(liked ? '찜을 취소했어요' : '찜 목록에 담았어요');
    updateLikeCount();
    setLikeBtn(!liked);
  }
  function onDislike() {
    if (!current) return;
    if (!me) return askLogin('dislike');
    pop('btn-dislike');
    disliked.add(current.id);
    record(current, 'dislike', -1, dwell());
    advance('leave-dislike');
  }
  function onBuy() {
    if (!current) return;
    pop('btn-buy');
    record(current, 'buy', 2, dwell());
    window.open(current.u, '_blank', 'noopener');
    toast(`${current.m}(으)로 이동했어요`);
  }
  function setLikeBtn(on) {
    const b = $('btn-like');
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('.act__label').textContent = on ? '찜했어요' : '찜하기';
  }

  // 비로그인으로 15장쯤 넘기면 한 번만 로그인 안내
  let guestTaps = 0, nudged = false;
  function maybeNudge() {
    if (nudged || !acct.ready || ++guestTaps < 15) return;
    nudged = true;
    $('nudge').hidden = false;
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
    renderArt();
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
    const fresh = n ? FEED.filter(f => matches(f, s) && isNew(f)).length : 0;
    $('ob-count').textContent = n ? `지금 조건에 맞는 상품 ${n.toLocaleString()}개${fresh ? ` · 2주 안에 나온 신상 ${fresh.toLocaleString()}개` : ''}` : '카테고리와 가격을 하나 이상 골라 주세요';
    $('start').disabled = !n;
  }
  // PC 시작 화면 오른쪽: 신상품·콜라보 위주로 6장 (넓은 화면에서만 보임)
  function renderArt() {
    const art = $('ob-art');
    if (!isPC() || art.childElementCount) return;
    const picks = shuffle(FEED.filter(f => f.x || isNew(f))).slice(0, 60).sort((a, b) => prior(b) - prior(a));
    const used = new Set(), chosen = [];
    for (const f of picks) if (!used.has(f.b) && chosen.length < 6) { used.add(f.b); chosen.push(f); }
    chosen.forEach((f, i) => {
      const fig = document.createElement('figure');
      fig.dataset.theme = 'light';
      fig.style.setProperty('--i', i);
      const img = document.createElement('img');
      img.src = f.im; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
      fig.appendChild(img);
      art.appendChild(fig);
    });
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
    persist();
    if (editing) { editing = false; dropLayer('settings'); }
    showFeed();
  });

  // ---------- 화면 쌓기: 휴대폰 '뒤로' 버튼·제스처로 설정 화면과 시트를 닫는다 ----------
  const layers = [];
  let skipPop = false;
  function pushLayer(name, close) { layers.push({ name, close }); history.pushState({ tp: name }, ''); }
  function dropLayer(name) {               // 화면 안의 버튼으로 닫았을 때: 쌓아 둔 '뒤로' 기록도 하나 지운다
    if (!layers.length || layers[layers.length - 1].name !== name) return;
    layers.pop();
    skipPop = true;
    history.back();
  }
  window.addEventListener('popstate', () => {
    if (skipPop) { skipPop = false; return; }
    const top = layers.pop();
    if (top) top.close();
  });

  // 피드에서 조절 버튼 → 설정 바꾸기 (뒤로 가면 보던 상품 그대로)
  let editing = false;
  function openSettings() {
    editing = true;
    showOnboard();
    pushLayer('settings', backToFeed);
  }
  function backToFeed() {
    editing = false;
    $('onboard').classList.remove('is-edit');
    $('onboard').hidden = true;
    $('feed').hidden = false;
    $('stage').focus({ preventScroll: true });
  }
  $('ob-back').addEventListener('click', () => { dropLayer('settings'); backToFeed(); });

  function showFeed() {
    $('onboard').hidden = true;
    $('feed').hidden = false;
    nextItem = null;
    render(pick());
    $('stage').focus({ preventScroll: true });
    $('coach').textContent = finePointer ? '사진을 클릭하면 다음 상품' : '빈 곳을 탭하면 다음 상품';
    if (store.get('coachDone', false)) hideCoach(); else setTimeout(hideCoach, 3500);
  }
  function showOnboard() {
    const edit = editing && !!settings;        // 처음 시작이 아니라 설정을 바꾸러 온 경우
    $('onboard').classList.toggle('is-edit', edit);
    $('ob-back').hidden = !edit;
    $('start').textContent = edit ? '적용하기' : '시작하기';
    $('feed').hidden = true;
    $('onboard').hidden = false;
    $('onboard').scrollTop = 0;
    initOnboard();
  }

  // ---------- 시트 (DS dialog.sheet) ----------
  function openSheet(id) {
    const d = $(id);
    if (d.open) return;
    d.showModal();
    pushLayer(id, () => { if (d.open) d.close(); });
  }
  function closeSheet(id) { const d = $(id); if (d.open) d.close(); }
  // 어떤 방법으로 닫혀도(X·바깥·Esc) '뒤로' 기록을 맞춘다
  for (const id of ['likes', 'auth']) $(id).addEventListener('close', () => dropLayer(id));
  // 바깥(어두운 배경)을 누르면 닫기
  for (const id of ['likes', 'auth']) {
    $(id).addEventListener('click', e => {
      if (e.target !== $(id)) return;
      const r = $(id).getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet(id);
    });
  }

  // ---------- 찜 목록 ----------
  function updateLikeCount() {
    $('like-count').textContent = likes.length ? String(likes.length) : '';
  }
  // 찜 목록: 카테고리 칩 → 세부 분류 칩 → 묶음(제목+개수)별 카드
  const CAT_LABEL = { outer: '아우터', top: '상의', bottom: '하의', shoes: '신발', bag: '가방', hat: '모자', accessory: '액세서리' };
  const likeView = { cat: 'all', sub: 'all' };

  function openLikes() {
    if (!me) return askLogin('likes');
    likeView.cat = 'all'; likeView.sub = 'all';
    renderLikes();
    openSheet('likes');
  }

  function chip(label, n, active, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'filter'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(active));
    b.innerHTML = '<span></span><em></em>';
    b.querySelector('span').textContent = label;
    b.querySelector('em').textContent = n;
    b.addEventListener('click', onClick);
    return b;
  }

  function groupBy(list, key) {
    const m = new Map();
    for (const f of list) { const k = key(f); if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
    return m;
  }

  function likeCard(f) {
    const a = document.createElement('a');
    a.className = 'like-item'; a.href = f.u; a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = '<div class="ph" data-theme="light"><img loading="lazy" referrerpolicy="no-referrer" alt=""><button type="button" class="unlike" aria-label="찜 빼기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"/></svg></button></div><div class="tx"><span class="sub"></span><b></b><span class="t"></span><div class="pr"></div></div>';
    a.querySelector('img').src = f.im;
    a.querySelector('.sub').textContent = `${CAT_LABEL[f.c] || ''} · ${f.s || '기타'}`;
    a.querySelector('b').textContent = f.b;
    a.querySelector('.t').textContent = f.t;
    a.querySelector('.pr').textContent = won(f.p, f.e);
    a.querySelector('.unlike').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      likes = likes.filter(id => id !== f.id);
      record(f, 'unlike', -1);
      updateLikeCount();
      if (current && current.id === f.id) setLikeBtn(false);
      toast('찜에서 뺐어요');
      renderLikes();
    });
    return a;
  }

  function renderLikes() {
    const items = likes.map(id => BY_ID.get(id)).filter(Boolean);
    $('likes-total').textContent = items.length ? String(items.length) : '';
    $('likes-empty').hidden = items.length > 0;

    // 1) 카테고리 칩 (찜한 카테고리만, 정해진 순서)
    const byCat = groupBy(items, f => f.c);
    if (likeView.cat !== 'all' && !byCat.has(likeView.cat)) { likeView.cat = 'all'; likeView.sub = 'all'; }
    const cats = $('like-cats');
    cats.innerHTML = '';
    cats.hidden = !items.length;
    cats.appendChild(chip('전체', items.length, likeView.cat === 'all', () => { likeView.cat = 'all'; likeView.sub = 'all'; renderLikes(); }));
    for (const c of ALL_CATS) if (byCat.has(c)) cats.appendChild(chip(CAT_LABEL[c], byCat.get(c).length, likeView.cat === c, () => { likeView.cat = c; likeView.sub = 'all'; renderLikes(); }));

    // 2) 세부 분류 칩 (카테고리를 골랐을 때만)
    const subs = $('like-subs');
    subs.innerHTML = '';
    const inCat = likeView.cat === 'all' ? items : byCat.get(likeView.cat) || [];
    const bySub = groupBy(inCat, f => f.s || '기타');
    if (likeView.sub !== 'all' && !bySub.has(likeView.sub)) likeView.sub = 'all';
    subs.hidden = likeView.cat === 'all' || bySub.size < 2;
    if (!subs.hidden) {
      subs.appendChild(chip('전체', inCat.length, likeView.sub === 'all', () => { likeView.sub = 'all'; renderLikes(); }));
      [...bySub.entries()].sort((a, b) => b[1].length - a[1].length)
        .forEach(([s, list]) => subs.appendChild(chip(s, list.length, likeView.sub === s, () => { likeView.sub = s; renderLikes(); })));
    }

    // 3) 묶음: 전체 → 카테고리별, 카테고리 선택 → 세부 분류별, 세부 선택 → 하나의 묶음
    const shown = likeView.sub === 'all' ? inCat : bySub.get(likeView.sub) || [];
    const groups = likeView.cat === 'all'
      ? ALL_CATS.filter(c => byCat.has(c)).map(c => [CAT_LABEL[c], byCat.get(c)])
      : likeView.sub === 'all'
        ? [...groupBy(shown, f => f.s || '기타').entries()].sort((a, b) => b[1].length - a[1].length)
        : [[likeView.sub, shown]];
    const list = $('like-list');
    list.innerHTML = '';
    for (const [title, gItems] of groups) {
      const sec = document.createElement('section');
      sec.className = 'like-group';
      const h = document.createElement('h3');
      h.innerHTML = '<span></span><em></em>';
      h.querySelector('span').textContent = title;
      h.querySelector('em').textContent = gItems.length;
      const grid = document.createElement('div');
      grid.className = 'like-grid';
      gItems.forEach(f => grid.appendChild(likeCard(f)));
      sec.append(h, grid);
      list.appendChild(sec);
    }
  }

  // ---------- 로그인 · 회원가입 · 내 계정 ----------
  const REASON = {
    like: '♥ 찜은 로그인하면 저장돼요',
    dislike: '싫어요를 반영해 비슷한 상품을 덜 보여 드려요. 로그인이 필요해요',
    likes: '찜 목록은 로그인 후 볼 수 있어요',
    nudge: '로그인하면 반응을 학습해 취향에 맞게 추천해요'
  };
  let authMode = 'login';
  const initial = email => (String(email || '?').trim()[0] || '?').toUpperCase();

  function askLogin(reason) {
    pendingAct = (reason === 'like' || reason === 'dislike') && current ? { a: reason, id: current.id } : null;
    openAuth(reason);
  }
  function openAuth(reason) {
    $('nudge').hidden = true;
    renderAccount(reason);
    openSheet('auth');
  }
  function closeAuth() { closeSheet('auth'); }
  $('auth').addEventListener('close', () => { pendingAct = null; });
  function submitLabel() { return authMode === 'login' ? '로그인' : '가입하고 시작하기'; }
  function setAuthMode(m) {
    authMode = m;
    document.querySelectorAll('.auth-tabs [data-mode]').forEach(b => {
      b.setAttribute('aria-selected', String(b.dataset.mode === m));
      b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    });
    $('auth-title').textContent = m === 'login' ? '로그인' : '회원가입';
    $('pw2-field').hidden = m === 'login';
    $('auth-pw').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('auth-pw').placeholder = m === 'login' ? '비밀번호' : '8자 이상';
    $('auth-submit').textContent = submitLabel();
    $('auth-error').textContent = '';
  }

  function renderAccount(reason) {
    $('auth-guest').hidden = !!me;
    $('auth-user').hidden = !me;
    if (!me) {
      setAuthMode(authMode);
      const off = !acct.ready;
      $('auth-reason').textContent = off ? '로그인 기능을 준비하고 있어요. 조금만 기다려 주세요' : REASON[reason] || '';
      $('auth-form').querySelectorAll('input, button').forEach(el => { el.disabled = off; });
      return;
    }
    $('auth-title').textContent = '내 계정';
    $('me-initial').textContent = initial(me.email);
    $('me-email').textContent = me.email || '';
    $('me-admin').hidden = !acct.isAdmin;
    $('me-keep').textContent = acct.remember() ? '이 기기에서 자동 로그인 중' : '브라우저를 닫으면 로그아웃돼요';
    $('me-likes').textContent = likes.length.toLocaleString();
    $('me-reacts').textContent = (profile.n || 0).toLocaleString();
    $('admin').hidden = !acct.isAdmin;
    if (acct.isAdmin) renderAdmin();
  }

  async function renderAdmin() {
    const grid = $('admin-grid'), top = $('admin-top');
    grid.textContent = '불러오는 중…';
    top.innerHTML = '';
    try {
      await acct.flush();
      const s = await acct.adminStats();
      grid.innerHTML = '';
      [['회원', s.users], ['최근 7일 가입', s.users_7d], ['오늘 반응', s.events_today], ['전체 반응', s.events]].forEach(([k, v]) => {
        const d = document.createElement('div');
        d.className = 'stat';
        d.innerHTML = '<span class="stat__value"></span><span class="stat__label"></span>';
        d.querySelector('.stat__value').textContent = Number(v || 0).toLocaleString();
        d.querySelector('.stat__label').textContent = k;
        grid.appendChild(d);
      });
      for (const r of s.top_liked || []) {
        const f = BY_ID.get(r.item_id);
        const li = document.createElement('li');
        li.innerHTML = '<img alt="" referrerpolicy="no-referrer" loading="lazy" data-theme="light"><div class="tt"><b></b><span></span></div><em></em>';
        if (f) li.querySelector('img').src = f.im;
        li.querySelector('b').textContent = f ? f.b : r.item_id;
        li.querySelector('span').textContent = f ? f.t : '피드에서 빠진 상품';
        li.querySelector('em').textContent = `♥ ${r.n}`;
        top.appendChild(li);
      }
      if (!top.children.length) top.innerHTML = '<li class="muted">아직 찜한 회원이 없어요</li>';
    } catch {
      grid.textContent = '통계를 불러오지 못했어요';
    }
  }

  // 로그인 직후: 서버 기록과 이 기기 기록을 합친다
  async function enterUser(u) {
    const local = {
      owner: store.get('owner', null), dirty: store.get('dirty', false),
      likes: store.get('likes', []), disliked: store.get('disliked', []),
      profile: store.get('profile', null), events: store.get('events', [])
    };
    const mine = local.owner === u.id;
    const legacy = !local.owner && !!(local.likes.length || local.disliked.length || local.events.length);  // 로그인 도입 전(v0.3) 이 브라우저 기록
    let server = null;
    try { server = await acct.loadState(); }
    catch (e) { if (!mine) throw e; }                 // 처음 쓰는 기기인데 서버를 못 읽으면 로그인 보류

    let st, upload = false;
    if (mine && (local.dirty || !server)) { st = local; upload = true; }
    else if (legacy) { st = mergeLegacy(local, server); upload = true; }
    else st = server || {};

    me = u;
    likes = st.likes || [];
    disliked.clear();
    (st.disliked || []).forEach(id => disliked.add(id));
    profile = { ...emptyProfile(), ...(st.profile || {}) };
    events = mine || legacy ? local.events : [];
    if (!settings && st.settings) { settings = st.settings; store.set('settings', settings); store.set('settingsV', SETTINGS_VERSION); }
    store.set('owner', u.id);
    if (legacy) acct.track(...local.events.filter(e => BY_ID.has(e.id)).map(e => eventRow(BY_ID.get(e.id), e.a, e.dwell, e.t)));
    if (upload || !server) persist(); else saveLocal();
    updateAccountUI();
    updateLikeCount();
    if (current) setLikeBtn(likes.includes(current.id));
  }
  function mergeLegacy(local, server) {
    const s = server || {};
    const prof = { ...emptyProfile(), ...(s.profile || {}) };
    const lp = local.profile || {};
    for (const dim in W) for (const k in lp[dim] || {}) prof[dim][k] = clamp((prof[dim][k] || 0) + lp[dim][k]);
    prof.n = (prof.n || 0) + local.events.filter(e => e.a !== 'skip').length;
    return {
      likes: [...new Set([...local.likes, ...(s.likes || [])])],
      disliked: [...new Set([...(s.disliked || []), ...local.disliked])],
      profile: prof,
      settings: s.settings
    };
  }
  function leaveUser() {
    me = null;
    USER_KEYS.forEach(k => store.del(k));
    likes = []; events = [];
    disliked.clear();
    profile = emptyProfile();
    updateAccountUI();
    updateLikeCount();
    if (current) setLikeBtn(false);
  }
  function updateAccountUI() {
    const b = $('open-account');
    b.classList.toggle('signed', !!me);
    b.setAttribute('aria-label', me ? '내 계정' : '로그인');
    $('acct-initial').textContent = me ? initial(me.email) : '';
    $('ob-login').hidden = !!me || !acct.ready;
  }

  $('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('auth-email').value.trim(), pw = $('auth-pw').value, keep = $('auth-keep').checked;
    const fail = msg => { $('auth-error').textContent = msg; };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('이메일 주소를 다시 확인해 주세요');
    if (!pw) return fail('비밀번호를 입력해 주세요');
    if (authMode === 'signup' && pw.length < 8) return fail('비밀번호는 8자 이상으로 만들어 주세요');
    if (authMode === 'signup' && pw !== $('auth-pw2').value) return fail('비밀번호 확인이 일치하지 않아요');
    fail('');
    const btn = $('auth-submit');
    btn.disabled = true;
    btn.textContent = '잠시만요…';
    try {
      const u = authMode === 'login' ? await acct.signIn(email, pw, keep) : await acct.signUp(email, pw, keep);
      if (!u) { fail(''); $('auth-reason').textContent = '메일함에서 인증 링크를 누르면 가입이 끝나요'; return; }
      const p = pendingAct;
      await enterUser(u);
      $('auth-pw').value = '';
      $('auth-pw2').value = '';
      closeAuth();
      toast(authMode === 'signup' ? '가입을 환영해요!' : '로그인했어요');
      if (!$('onboard').hidden) initOnboard();
      if (p && current && current.id === p.id) {
        if (p.a === 'dislike') onDislike();
        else if (!likes.includes(p.id)) onLike();
      }
    } catch (ex) {
      fail(acct.message(ex));
    } finally {
      btn.disabled = false;
      btn.textContent = submitLabel();
    }
  });
  $('sign-out').addEventListener('click', async () => {
    $('sign-out').disabled = true;
    await acct.signOut();
    leaveUser();
    $('sign-out').disabled = false;
    closeAuth();
    toast('로그아웃했어요');
  });

  // ---------- 보조 ----------
  function hideCoach() { $('coach').classList.add('hide'); store.set('coachDone', true); }
  function pop(id) { const b = $(id); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200); }
  const rand = a => (a && a.length ? a[Math.floor(Math.random() * a.length)] : null);
  const count = (a, v) => a.filter(x => x === v).length;
  function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
  // 가중치에 비례해 하나 고르기 (신상품·콜라보일수록 잘 뽑힘)
  function weighted(list, w) {
    if (!list || !list.length) return null;
    const ws = list.map(w), total = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) if ((r -= ws[i]) <= 0) return list[i];
    return list[list.length - 1];
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  // ---------- 이벤트 연결 ----------
  $('stage').addEventListener('click', onSkip);
  // 모바일: 사진 아래 정보 칸의 빈 곳을 눌러도 다음 (버튼은 제외). PC는 사진 클릭만
  $('detail').addEventListener('click', e => { if (!isPC() && !e.target.closest('button, a')) onSkip(); });
  $('btn-next').addEventListener('click', onSkip);
  $('btn-like').addEventListener('click', onLike);
  $('btn-dislike').addEventListener('click', onDislike);
  $('btn-buy').addEventListener('click', onBuy);
  $('open-likes').addEventListener('click', openLikes);
  $('close-likes').addEventListener('click', () => closeSheet('likes'));
  $('open-settings').addEventListener('click', openSettings);
  $('open-account').addEventListener('click', () => openAuth());
  $('ob-login').addEventListener('click', () => openAuth());
  $('close-auth').addEventListener('click', closeAuth);
  document.querySelectorAll('.auth-tabs [data-mode]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
  $('nudge-login').addEventListener('click', () => openAuth('nudge'));
  $('nudge-close').addEventListener('click', () => { $('nudge').hidden = true; });
  $('photo').addEventListener('error', () => { if (current) { busy = false; advance('leave-next'); } });
  $('stage').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onSkip(); } });
  document.addEventListener('keydown', e => {
    if ($('auth').open || $('likes').open) return;                        // 시트가 열려 있으면 Esc는 시트가 처리
    if ($('feed').hidden) { if (e.key === 'Escape' && editing) $('ob-back').click(); return; }
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); onSkip(); }
    else if (e.key.toLowerCase() === 'l') onLike();
    else if (e.key.toLowerCase() === 'd') onDislike();
    else if (e.key.toLowerCase() === 'b') onBuy();
  });
  matchMedia('(min-width: 1024px)').addEventListener('change', () => { if (!$('onboard').hidden) renderArt(); });

  // ---------- 시작: 자동 로그인 확인 → 화면 ----------
  async function boot() {
    if (!FEED.length) { document.body.innerHTML = '<p style="padding:24px">feed.js가 없습니다. pipeline에서 node build_feed.js를 실행해 주세요.</p>'; return; }
    if (acct.ready) {
      try {
        const u = await withTimeout(acct.restore(), 6000);
        if (u) await enterUser(u);
      } catch { /* 자동 로그인 실패 → 비로그인으로 시작 */ }
      acct.onSignedOut(() => { leaveUser(); toast('다시 로그인해 주세요'); });
    }
    updateAccountUI();
    updateLikeCount();
    if (settings) showFeed(); else showOnboard();
    $('boot').classList.add('done');
    setTimeout(() => $('boot').remove(), 400);
  }
  boot();
})();
