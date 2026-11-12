/* 태핑 v0.7 — 원탭 패션 큐레이션 (브랜드 키트 적용: projects/태핑/design/design_handoff_tapping_brand/README.md)
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
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const COPY = window.TAPPING_COPY;
  const ICON = 'brand/icons/sprite.svg#';
  document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = COPY[el.dataset.copy]; });

  // feed.js v2(압축) → 앱에서 쓰는 객체. v1(객체 배열)도 그대로 받음
  function expandFeed(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const unpackImg = s => { const k = s.indexOf('~'); return k > 0 && k < 3 ? raw.img[+s.slice(0, k)] + s.slice(k + 1) : s; };
    return raw.items.map(([pid, m, b, t, p, e, c, s, g, x, u, im, r, f, bg, cut]) => {
      const [mall, idPrefix, urlPrefix] = raw.malls[m];
      return {
        id: idPrefix + pid, b: raw.brands[b], t, p, e, c, s, g, x, m: mall,
        u: /^https?:/.test(u) ? u : urlPrefix + (u || pid), im: unpackImg(im), r, f, bg: bg ? '#' + bg : '', cut: cut || 0
      };
    });
  }

  // ---------- 누끼 + 크기 통일 ----------
  // 판매처 원본 사진 위에 실루엣 마스크(R2)를 씌워 배경을 지우고, 상품 영역이 칸의 일정 비율을 채우도록 맞춘다
  const MASK_BASE = (window.TAPPING_FEED && window.TAPPING_FEED.maskBase) || '';
  // 마스크 파일 이름: pipeline/lib/feedutil.js maskKey와 같은 계산 (cyrb53)
  function maskKey(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const maskUrl = f => `${MASK_BASE}/${f.mk || (f.mk = maskKey(f.im))}.png`;
  // 마스크를 못 불러오면(서버·CORS 문제) 상품이 통째로 가려지므로 미리 받아 보고, 실패하면 원본 그대로 보여 준다
  const maskState = new Map();          // url → 'ok' | 'fail' | 'loading'
  function preloadMask(f, onDone) {
    if (!MASK_BASE || !f || !f.cut) return;
    const url = maskUrl(f);
    if (maskState.get(url) === 'ok' || maskState.get(url) === 'fail') return onDone && onDone();
    maskState.set(url, 'loading');
    const im = new Image();
    im.crossOrigin = 'anonymous';       // CSS mask도 CORS로 받으므로 같은 조건으로 확인
    im.onload = () => { maskState.set(url, 'ok'); onDone && onDone(); };
    im.onerror = () => { maskState.set(url, 'fail'); onDone && onDone(); };
    im.src = url;
  }
  // 사진 미리 받기: 받아 둔 Image를 잡아 두어 카드에 넣을 때 다시 받지 않는다
  const imgCache = new Map();
  function loadImage(url) {
    const hit = imgCache.get(url);
    if (hit) return hit.done;
    const im = new Image();
    im.referrerPolicy = 'no-referrer';
    const done = new Promise(res => { im.onload = () => res(true); im.onerror = () => res(false); });
    im.src = url;
    imgCache.set(url, { im, done });
    if (imgCache.size > 30) imgCache.delete(imgCache.keys().next().value);
    return done;
  }
  // box: 사진 칸(배경색 담당), img의 부모 .pic: 내용 영역. fill: 상품이 채울 비율, aspect: 칸 가로/세로(모르면 실제 크기로)
  function layoutPhoto(box, img, f, fill, aspect) {
    const cut = !!(MASK_BASE && f && f.cut && maskState.get(maskUrl(f)) !== 'fail');
    box.classList.toggle('is-cut', cut);
    box.dataset.theme = 'light';            // 사진 칸은 다크 모드에서도 항상 흰색
    box.style.backgroundColor = cut || !f ? '' : f.bg;
    if (!cut) { img.removeAttribute('style'); return; }
    const pic = img.parentElement;
    const A = aspect || (pic.clientWidth / Math.max(1, pic.clientHeight)) || 1;
    const [x0, y0, x1, y1, arK] = f.cut, ar = arK / 1000;
    const bw = Math.max(0.05, (x1 - x0) / 1000), bh = Math.max(0.05, (y1 - y0) / 1000);
    // 칸 폭을 1로 두고: 상품 가로가 fill, 또는 상품 세로가 fill×칸 높이 중 먼저 닿는 쪽에 맞춤
    let dw = Math.min(fill / bw, (fill / A) * ar / bh);
    dw = Math.min(dw, Math.min(1, ar / A) * 2.4);     // 아주 작게 찍힌 상품은 2.4배까지만 (흐려지지 않게)
    const dh = dw / ar;
    const left = 0.5 - dw * (x0 + x1) / 2000, top = 0.5 / A - dh * (y0 + y1) / 2000;
    const url = `url("${maskUrl(f)}")`;
    img.style.cssText = `width:${(dw * 100).toFixed(2)}%;height:${(dh * A * 100).toFixed(2)}%;left:${(left * 100).toFixed(2)}%;top:${(top * A * 100).toFixed(2)}%;-webkit-mask-image:${url};mask-image:${url}`;
  }
  const FILL = { feed: 1, thumb: 1, tile: 0.8, art: 0.78 };
  // 전환 시간(ms): CSS 토큰 --tp-dur-peel-*·--tp-dur-nav-*와 맞춘다 (2026-11-12 사용자 요청으로 짧게, 넘김은 대각선)
  const T = { peelPress: 90, peel: 430, nav: 460, navFold: 300, nopeStamp: 180, nope: 470, undo: 460 };   // feed·thumb: 사진 칸의 80% 상자(.pic)를 채움

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
  let current = null, nextItem = null, spare = null, shownAt = 0;   // spare: 그다음 상품 (사진을 미리 받아 둔다)
  let phase = 'idle';                      // Peel 전환: idle → peel(0~140ms) → exit(~620ms) → reset(1프레임) → idle
  let peelGen = 0;                         // 전환 도중 설정을 바꿨을 때 남은 타이머를 무시하기 위한 번호
  let shownCount = 0, poolTotal = 0;       // 카드 왼쪽 위 순번 (이번에 본 장수 / 조건에 맞는 상품 수)
  const makeBody = () => $('tpl-body').content.firstElementChild.cloneNode(true);
  let bodyFront = makeBody(), bodyBack = makeBody();   // 카드 내용: 전환이 끝나면 앞뒤를 맞바꿔 이미지를 다시 받지 않는다
  $('front-face').prepend(bodyFront);
  $('shell-back').append(bodyBack);

  const priceBucket = p => (p < 100000 ? 0 : p < 300000 ? 1 : p < 700000 ? 2 : 3);
  const won = (p, est) => (est ? '약 ' : '') + '₩' + Math.round(p).toLocaleString('ko-KR');

  // ---------- 신상품 · 콜라보 가산점 ----------
  const TODAY = Math.floor((Date.now() + 9 * 36e5) / 864e5);   // 한국 시간 기준 날짜 (build_feed와 같은 계산)
  const ageDays = f => (f.r || f.f ? TODAY - (f.r || f.f) : Infinity);       // 발매일, 없으면 처음 본 날
  const isNew = f => ageDays(f) <= 14;
  const freshness = f => { const a = ageDays(f); return a === Infinity ? 0 : Math.exp(-Math.max(0, a) / 21); };  // 3주마다 1/e
  const prior = f => 1.2 * freshness(f) + 0.6 * (f.x ? 1 : 0);

  // ---------- 후보군 ----------
  // 가격 범위 [최소, 최대(null = 제한 없음)]. 예전 설정(구간 선택)은 양 끝을 범위로 바꿔 읽는다
  const PRICE_EDGE = [0, 100000, 300000, 700000, null];
  function priceRange(s) {
    if (s.price) return s.price;
    const a = [...(s.prices || [0, 1, 2, 3])].sort((x, y) => x - y);
    return [PRICE_EDGE[a[0]], PRICE_EDGE[a[a.length - 1] + 1]];
  }
  function compileMatch(s) {
    const [lo, hi] = priceRange(s), cats = new Set(s.cats), g = s.gender;
    return f => !(g === 'men' && f.g === 'women') && !(g === 'women' && f.g === 'men') && cats.has(f.c) && f.p >= lo && (hi === null || f.p <= hi);
  }
  const matchCache = new WeakMap();
  function matches(f, s) { let ok = matchCache.get(s); if (!ok) matchCache.set(s, ok = compileMatch(s)); return ok(f); }
  // 지금 설정에 맞는 상품 (설정 객체가 바뀔 때만 다시 계산)
  let baseFor = null, baseList = [];
  function base() { if (baseFor !== settings) { baseFor = settings; baseList = settings ? FEED.filter(compileMatch(settings)) : []; } return baseList; }
  // 찜한 상품·싫어요 누른 상품·이미 본 상품은 다시 보여 주지 않는다 (찜은 찜 목록에서 보기)
  function pool() {
    const liked = new Set(likes);
    return base().filter(f => !seen.has(f.id) && !disliked.has(f.id) && !liked.has(f.id) && f !== current && f !== nextItem && f !== spare);
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
    const sample = diverse(list.length > 800 ? sampleN(list, 800) : list);

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
  let saveT = 0, seenDirty = false, stateDirty = false;
  function flushSaves() {
    clearTimeout(saveT); saveT = 0;
    if (seenDirty) { seenDirty = false; store.set('seen', [...seen].slice(-4000)); }
    if (stateDirty) { stateDirty = false; if (me) { saveLocal(); acct.saveState({ likes, disliked: [...disliked].slice(-5000), profile, settings }); } }
  }
  const scheduleSave = () => { if (!saveT) saveT = setTimeout(flushSaves, 700); };
  function persist() { if (!me) return; stateDirty = true; scheduleSave(); }
  const leavePage = () => { flushSaves(); acct.flush && acct.flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leavePage(); });
  window.addEventListener('pagehide', leavePage);

  // ---------- 화면: 카드 2장 (뒤 카드에 다음 상품을 항상 미리 깔아 둔다) ----------
  function fillInfo(root, f) {
    const q = s => root.querySelector(s);
    q('.brand').textContent = f.b;
    q('.p-title').textContent = f.t;
    q('.p-title').title = f.t;
    q('.price').textContent = won(f.p, f.e);
    q('.mall').textContent = f.m;
    q('.tp-badge--collab').hidden = !f.x;
    q('.tp-badge--new').hidden = !isNew(f);
  }
  function fillBody(body, f) {
    const img = body.querySelector('img'), photo = body.querySelector('.photo');
    body._f = f;
    const token = body._t = (body._t || 0) + 1;
    img.classList.remove('is-ready');
    img.removeAttribute('src');                          // 새 사진을 받는 동안 앞 상품 사진이 남아 있지 않게
    img.alt = `${f.b} ${f.t}`;
    layoutPhoto(photo, img, f, FILL.feed);               // 누끼면 크기 통일, 아니면 사진 배경색에 칸을 맞춤
    preloadMask(f, () => { if (body._f === f) layoutPhoto(photo, img, f, FILL.feed); });
    fillInfo(body, f);
    loadImage(f.im).then(ok => {
      if (body._t !== token) return;
      if (!ok) return imageFailed(body, f);
      img.src = f.im;
      const done = () => { if (body._t === token) img.classList.add('is-ready'); };
      if (img.decode) img.decode().then(done, done); else done();
    });
  }
  // 사진을 못 받으면 아직 뒤에 있는 상품만 조용히 바꾼다. 화면에 올라온 상품은 절대 바꾸지 않는다
  function imageFailed(body, f) {
    seen.add(f.id);
    if (body !== bodyBack || nextItem !== f || phase !== 'idle') return;
    nextItem = takeNext();
    $('shell-back').hidden = !nextItem;
    if (nextItem) { fillBody(bodyBack, nextItem); refillSpare(); }
  }
  const takeNext = () => { const f = spare || pick(); spare = null; return f; };
  // 빠르게 넘겨도 사진이 준비되어 있도록 한 장 더 미리 받는다 (다양성 계산은 다음 상품까지 본 것으로)
  function refillSpare() {
    if (spare || !nextItem) return;
    shownLog.push({ b: nextItem.b, m: nextItem.m, s: nextItem.s, c: nextItem.c });
    spare = pick();
    shownLog.pop();
    if (spare) { loadImage(spare.im); preloadMask(spare); }
  }
  function playBadges(root) { const t = root.querySelector('.tags'); t.classList.remove('play'); void t.offsetWidth; t.classList.add('play'); }

  // f를 맨 앞 카드로 (filled: 뒤 카드였던 내용이 이미 채워져 있음)
  function show(f, filled) {
    current = f;
    shownAt = Date.now();
    seen.add(f.id);
    seenDirty = true; scheduleSave();
    shownLog.push({ b: f.b, m: f.m, s: f.s, c: f.c });
    if (shownLog.length > 30) shownLog.shift();
    if (!filled) fillBody(bodyFront, f);
    shownCount++;
    paintSeq();
    playBadges(bodyFront);
    $('sr-now').textContent = `${f.b} ${f.t} ${won(f.p, f.e)}`;
    setLikeBtn(likes.includes(f.id));
    nextItem = takeNext();
    $('shell-back').hidden = !nextItem;
    if (nextItem) { fillBody(bodyBack, nextItem); refillSpare(); }
  }
  function paintSeq() { bodyFront.querySelector('.seq').textContent = `${String(shownCount).padStart(2, '0')} / ${poolTotal < 10 ? '0' + poolTotal : poolTotal.toLocaleString()}`; }
  function setAllSeen(on) {
    $('viewer').classList.toggle('is-empty', on);
    $('allseen').hidden = !on;
    if (on) current = null;
  }
  // 덱을 처음부터: 상품이 하나도 없으면 '한 바퀴 다 봄' 화면
  function startDeck() {
    peelGen++;
    setPhase('idle');
    current = null;
    nextItem = null;
    spare = null;
    const f = pick();
    setAllSeen(!f);
    if (f) show(f);
  }
  function setPhase(p) { phase = p; $('viewer').dataset.phase = p; }

  // ---------- 설정 요약: 전체인 항목은 생략, 카테고리 2개 이상은 "첫 항목 외 N" ----------
  function priceText([lo, hi]) {
    const man = v => (v / 10000).toLocaleString('ko-KR');
    if (!lo && hi === null) return '';
    if (!lo) return `~${man(hi)}만`;
    if (hi === null) return `${man(lo)}만~`;
    return `${man(lo)}~${man(hi)}만`;
  }
  function settingsSummary() {
    const s = settings, parts = [];
    if (s.gender === 'men') parts.push('남성'); else if (s.gender === 'women') parts.push('여성');
    if (s.cats.length < ALL_CATS.length) {
      const c = ALL_CATS.filter(k => s.cats.includes(k));
      parts.push(c.length > 1 ? `${CAT_LABEL[c[0]]} 외 ${c.length - 1}` : CAT_LABEL[c[0]]);
    }
    const money = priceText(priceRange(s));
    if (money) parts.push(money);
    return parts.join(' · ') || COPY.homeAll;
  }

  // ---------- 홈 ↔ 태핑 (4-9, 5-7) ----------
  const feedEl = $('feed');
  let view = 'home', navBusy = false, pendingBack = false, deckReady = false;
  let resumeN = store.get('resume', 0);                  // 이어 볼 순번: 기기에 저장 (비로그인도 동일)
  function saveResume() { resumeN = Math.max(0, shownCount - 1); store.set('resume', resumeN); }
  function setView(v) {
    view = v;
    feedEl.dataset.view = v;
    $('tab-home').setAttribute('aria-current', v === 'home' ? 'page' : 'false');
    $('tab-deck').setAttribute('aria-current', v === 'tap' ? 'page' : 'false');
  }
  const setFold = state => { $('today').dataset.fold = state; };
  const refreshTotal = () => { poolTotal = base().length; };
  function relayoutDeck() { for (const b of [bodyFront, bodyBack]) if (b._f) layoutPhoto(b.querySelector('.photo'), b.querySelector('img'), b._f, FILL.feed); }
  function enterApp() {
    $('onboard').hidden = true;
    $('feed').hidden = false;
    refreshTotal();
    const restore = history.state && history.state.view === 'tap';   // 새로고침은 보던 화면 유지, 앱 실행·첫 설정 직후는 홈
    setView(restore ? 'tap' : 'home');
    setFold('on');
    renderHome();
    if (restore) openDeck();
  }
  function openDeck() {
    if (deckReady) return;
    deckReady = true;
    shownCount = resumeN;
    startDeck();
    armCoach();
  }
  function armCoach() {
    $('coach').textContent = finePointer ? '사진을 클릭하면 다음 상품' : '빈 곳을 탭하면 다음 상품';
    if (store.get('coachDone', false)) hideCoach(); else setTimeout(hideCoach, 3500);
  }
  // 썸네일에서 고른 상품부터 시작
  function startFrom(f) {
    if (!deckReady) { deckReady = true; shownCount = resumeN; armCoach(); }
    peelGen++;
    setPhase('idle');
    current = null; nextItem = null; spare = null;
    setAllSeen(false);
    show(f);
  }
  function goTap(f) {
    if (navBusy || view === 'tap') return;
    history.pushState({ view: 'tap' }, '');
    const instant = reduceMotion.matches;
    if (instant) setView('tap');
    else { navBusy = true; feedEl.dataset.anim = 'to-tap'; setFold('go'); }
    if (f) startFrom(f); else openDeck();
    relayoutDeck();
    if (instant) return;
    setTimeout(() => {
      delete feedEl.dataset.anim;
      setView('tap');
      navBusy = false;
      if (pendingBack) { pendingBack = false; goHome(true); }
    }, T.nav);
  }
  function goHome(fromPop) {
    if (navBusy) { if (fromPop && feedEl.dataset.anim === 'to-tap') pendingBack = true; return; }
    if (view !== 'tap') return;
    hideUndo();
    if (!fromPop) { skipPop = true; history.back(); }
    renderHome();
    if (reduceMotion.matches) { setView('home'); setFold('on'); return; }
    navBusy = true;
    setFold('off');
    feedEl.dataset.anim = 'to-home';
    setTimeout(() => setFold('on'), T.navFold);
    setTimeout(() => { delete feedEl.dataset.anim; setView('home'); navBusy = false; }, T.nav);
  }
  setInterval(() => {                                    // 오늘 카드 모서리: 3200ms마다 들썩
    if (view !== 'home' || navBusy || feedEl.hidden || reduceMotion.matches || $('today').dataset.fold !== 'on') return;
    setFold('up');
    setTimeout(() => { if ($('today').dataset.fold === 'up') setFold('on'); }, 300);
  }, 3200);

  function homeThumb(f, square) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = square ? 'hsq' : 'hthumb';
    btn.setAttribute('aria-label', `${f.b} ${f.t}`);
    const ph = document.createElement('div'), pic = document.createElement('div'), img = document.createElement('img');
    ph.className = 'hph'; pic.className = 'pic';
    img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = f.im;
    pic.appendChild(img); ph.appendChild(pic); btn.appendChild(ph);
    layoutPhoto(ph, img, f, FILL.thumb, square ? 1 : 0.79);
    preloadMask(f, () => layoutPhoto(ph, img, f, FILL.thumb, square ? 1 : 0.79));
    if (square) return btn;
    if (f.x || isNew(f)) {
      const tag = document.createElement('span');
      tag.className = `tp-badge tp-badge--sm hph__tag tp-badge--${f.x ? 'collab' : 'new'}`;
      tag.textContent = f.x ? 'COLLAB' : 'NEW';
      ph.appendChild(tag);
    }
    const name = document.createElement('span'), price = document.createElement('span');
    name.className = 'hthumb__b'; name.textContent = f.b;
    price.className = 'hthumb__p';
    if (f.e) { const est = document.createElement('span'); est.className = 'hthumb__est'; est.textContent = '약 '; price.append(est, won(f.p)); }   // 72px 칸에서는 '약'을 빼야 한 줄에 들어감
    else price.textContent = won(f.p);
    btn.append(name, price);
    return btn;
  }
  function renderHome() {
    const now = new Date(Date.now() + 9 * 36e5), pool = base().filter(f => !disliked.has(f.id));
    const today = pool.filter(f => f.f === TODAY), recent = pool.filter(isNew), n = today.length;
    $('hm-label').textContent = COPY.homeLabel(now.getUTCMonth() + 1, now.getUTCDate());
    $('hm-main').hidden = !n;
    $('hm-zero').hidden = !!n;
    if (n) { $('hm-n').textContent = n.toLocaleString('ko-KR'); $('hm-main').dataset.d = Math.min(5, Math.max(3, String(n).length)); }
    else $('hm-zs').textContent = COPY.homeRecentCount(recent.length.toLocaleString('ko-KR'));
    $('hm-status').textContent = resumeN > 0 ? COPY.homeResume(resumeN.toLocaleString('ko-KR')) : n ? COPY.homeFirst : COPY.homeRecentFirst;
    $('hm-set').textContent = settingsSummary();
    $('today-hit').setAttribute('aria-label', COPY.homeAria(n.toLocaleString('ko-KR')));
    const list = (n ? today : recent).slice().sort((a, b) => prior(b) - prior(a));
    $('hm-list-title').textContent = n ? COPY.homeToday : COPY.homeRecent;
    $('hm-list-count').textContent = COPY.homeCount(list.length.toLocaleString('ko-KR'));
    const row = $('hm-new');
    row.replaceChildren(...list.slice(0, 3).map(f => { const b = homeThumb(f); b.addEventListener('click', () => goTap(f)); return b; }));
    if (list.length > 3) {
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'hmore';
      const a = document.createElement('b'), s = document.createElement('span');
      a.textContent = `+${(list.length - 3).toLocaleString('ko-KR')}`; s.textContent = COPY.homeMore;
      more.append(a, s);
      more.addEventListener('click', () => goTap());
      row.appendChild(more);
    }
    const box = $('hm-likes'), items = likes.map(id => BY_ID.get(id)).filter(Boolean);
    $('hm-all').hidden = !me || !items.length;
    if (!me) {
      const p = document.createElement('p'), b = document.createElement('button');
      p.className = 'hline'; p.textContent = COPY.homeLikesGuest;
      b.type = 'button'; b.className = 'hline__login'; b.textContent = COPY.homeLogin;
      b.addEventListener('click', () => openAuth());
      p.appendChild(b);
      box.replaceChildren(p);
    } else if (!items.length) {
      const p = document.createElement('p');
      p.className = 'hline'; p.textContent = COPY.homeLikesEmpty;
      box.replaceChildren(p);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'hrow';
      wrap.append(...items.slice(0, 3).map(f => { const b = homeThumb(f, true); b.addEventListener('click', openLikes); return b; }));
      if (items.length > 3) {
        const more = document.createElement('button');
        more.type = 'button'; more.className = 'hsq hsq--more'; more.textContent = `+${items.length - 3}`;
        more.addEventListener('click', openLikes);
        wrap.appendChild(more);
      }
      box.replaceChildren(wrap);
    }
  }
  function swapToNext() {
    if (!nextItem) return setAllSeen(true);
    const front = bodyBack, back = bodyFront;
    $('front-face').prepend(front);
    $('shell-back').append(back);
    bodyFront = front;
    bodyBack = back;
    show(nextItem, true);
    saveResume();
  }
  // Peel 전환 (2026-11-12 사용자 요청으로 변경): 모서리 접힘 90ms → 오른쪽 아래에서 왼쪽 위로 대각선으로 빠지며 접힘이 커짐 320ms,
  // 뒤 카드 올라옴 300ms → 430ms에 앞뒤 교체. 전환 중에 다시 누르면 넘기던 장을 바로 끝내고 다음 장을 넘긴다(연타가 사라지지 않게)
  let peelFinish = null;
  function peel() {
    if (phase !== 'idle' || !current) return;
    hideUndo();
    if (reduceMotion.matches) return swapToNext();
    const gen = ++peelGen;
    setPhase('peel');
    setTimeout(() => { if (gen === peelGen) setPhase('exit'); }, T.peelPress);
    const finish = () => {
      if (gen !== peelGen) return;
      peelGen++; peelFinish = null;
      setPhase('reset');
      swapToNext();
      void $('viewer').offsetWidth;       // 전환 없이 원위치한 상태를 확정한 뒤 idle로 (다음 프레임을 기다리지 않음)
      setPhase('idle');
    };
    peelFinish = finish;
    setTimeout(finish, T.peel);
  }

  // ---------- 행동 ----------
  const ready = () => !!current && phase === 'idle';
  const dwell = () => Date.now() - shownAt;
  function onSkip() {
    if (peelFinish && (phase === 'peel' || phase === 'exit')) peelFinish();   // 연타: 넘기던 장을 바로 끝냄
    if (!ready()) return;
    hideCoach();
    const f = current, d = dwell();
    peel();                                                              // 화면 반응이 먼저, 기록은 그 다음
    if (me) record(f, 'skip', -0.15, d); else maybeNudge();
  }
  // 찜은 하트만 켜고 끄며 다음 상품으로 넘어가지 않는다 (넘기기는 화면 탭·클릭으로만)
  let likeTimer;
  function onLike() {
    if (!ready()) return;
    if (!me) return askLogin('like');
    $('btn-like').classList.add('pop');                  // 아이콘 1.16배 튕김, 170ms 뒤 복귀 (5-3)
    clearTimeout(likeTimer);
    likeTimer = setTimeout(() => $('btn-like').classList.remove('pop'), 170);
    const f = current, liked = likes.includes(f.id);
    if (liked) likes = likes.filter(id => id !== f.id); else likes.unshift(f.id);
    setLikeBtn(!liked);
    if (!liked) navigator.vibrate?.(12);
    updateLikeCount();
    record(f, liked ? 'unlike' : 'like', liked ? -1 : 1, dwell());   // 찜 취소 시 학습도 되돌림
  }
  function onDislike() {
    if (!ready()) return;
    if (!me) return askLogin('dislike');
    const f = current;
    disliked.add(f.id);
    record(f, 'dislike', -1, dwell());
    lastDislike = f;
    navigator.vibrate?.(10);
    nope();
  }
  // 별로예요 (5-8): 도장 → 왼쪽으로 빠짐 → 되돌리기 토스트. 다음 상품의 위쪽 Peel과 반대 방향
  function nope() {
    hideUndo(true);
    if (reduceMotion.matches) { swapToNext(); return showUndo(); }
    const gen = ++peelGen, btn = $('btn-dislike');
    btn.classList.add('press');
    setTimeout(() => btn.classList.remove('press'), 180);
    setPhase('nope');
    setTimeout(() => { if (gen === peelGen) setPhase('nope-exit'); }, T.nopeStamp);
    setTimeout(() => {
      if (gen !== peelGen) return;
      setPhase('reset');
      swapToNext();
      void $('viewer').offsetWidth;
      setPhase('idle');
      showUndo();
    }, T.nope);
  }
  let lastDislike = null, undoTimer = 0;
  function showUndo() {
    $('undo-toast').classList.add('on');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 4000);
  }
  function hideUndo(keep) {
    clearTimeout(undoTimer);
    $('undo-toast').classList.remove('on');
    if (keep !== true) lastDislike = null;
  }
  $('undo-btn').addEventListener('click', e => { e.stopPropagation(); undoDislike(); });
  function undoDislike() {
    const f = lastDislike;
    if (!f || phase !== 'idle') return;
    hideUndo();
    disliked.delete(f.id);
    record(f, 'undislike', 1);
    // 지금 상품은 다시 뒤 카드로, 그 뒤 상품은 예비로 돌린다
    spare = nextItem;
    nextItem = current;
    fillBody(bodyBack, f);
    const front = bodyBack, back = bodyFront;
    $('front-face').prepend(front);
    $('shell-back').append(back);
    bodyFront = front;
    bodyBack = back;
    $('shell-back').hidden = false;
    back.querySelector('.tags').classList.remove('play');
    current = f;
    shownAt = Date.now();
    shownCount = Math.max(1, shownCount - 1);
    paintSeq();
    setLikeBtn(likes.includes(f.id));
    saveResume();
    if (reduceMotion.matches) return;
    const gen = ++peelGen;
    setPhase('undo-pre');
    void $('viewer').offsetWidth;
    setPhase('undo');
    setTimeout(() => { if (gen === peelGen) setPhase('idle'); }, T.undo);
  }
  let buyTimer;
  function onBuy() {
    if (!ready()) return;
    record(current, 'buy', 2, dwell());
    const t = $('buy-toast');
    t.hidden = false;
    clearTimeout(buyTimer);
    buyTimer = setTimeout(() => { t.hidden = true; }, 1400);
    window.open(current.u, '_blank', 'noopener');        // 팝업 차단을 피하려고 탭 이벤트 안에서 바로 연다
  }
  function setLikeBtn(on) {
    const b = $('btn-like');
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('use').setAttribute('href', ICON + (on ? 'heart-filled' : 'heart'));
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
    const s = settings || { gender: 'all', cats: [...ALL_CATS], price: [0, null] };
    document.querySelectorAll('[data-key]').forEach(group => {
      const key = group.dataset.key;
      const isAll = key !== 'gender' && s[key].length === allOf(key).length;
      group.querySelectorAll('button').forEach(b => {
        let on;
        if (key === 'gender') on = s.gender === b.dataset.v;
        else if (b.dataset.v === 'all') on = isAll;
        else on = !isAll && s[key].includes(b.dataset.v);
        b.setAttribute('aria-pressed', String(on));
      });
    });
    setPriceUI(priceRange(s));
    updateCount();
    renderArt();
  }
  function readOnboard() {
    const out = { gender: 'all', cats: [], price: readPrice() };
    document.querySelectorAll('[data-key]').forEach(group => {
      const key = group.dataset.key;
      group.querySelectorAll('button[aria-pressed="true"]').forEach(b => {
        if (key === 'gender') out.gender = b.dataset.v;
        else if (b.dataset.v === 'all') out[key] = [...allOf(key)];
        else out[key].push(b.dataset.v);
      });
    });
    return out;
  }
  function updateCount() {
    const s = readOnboard();
    let n = 0, fresh = 0;                                // 한 번만 돌면서 개수와 신상 수를 같이 센다
    if (s.cats.length) { const ok = compileMatch(s); for (const f of FEED) if (ok(f)) { n++; if (isNew(f)) fresh++; } }
    $('ob-count').textContent = n ? `지금 조건에 맞는 상품 ${n.toLocaleString()}개${fresh ? ` · 2주 안에 나온 신상 ${fresh.toLocaleString()}개` : ''}` : (s.cats.length ? COPY.priceNone : COPY.pickCategory);
    $('start').disabled = !n;
  }
  // 가격 (4-10): 0~200만 원, 1만 원 단위. 200 = 상한 없음. 입력칸은 칸을 벗어날 때 반영
  const PR_MAX = 200;
  const prLo = $('pr-lo'), prHi = $('pr-hi'), prMin = $('price-min'), prMax = $('price-max'), prBox = $('pr-slider');
  const priceUI = { lo: 0, hi: PR_MAX };
  const wonText = v => (v >= PR_MAX ? `${PR_MAX}만 원 이상` : `${v}만 원`);
  function paintPrice() {
    const { lo, hi } = priceUI;
    prLo.value = lo; prHi.value = hi;
    prMin.value = lo; prMax.value = hi;
    prBox.style.setProperty('--a', (lo / PR_MAX * 100) + '%');
    prBox.style.setProperty('--b', (hi / PR_MAX * 100) + '%');
    prLo.style.zIndex = lo >= PR_MAX - 1 ? 3 : 1;             // 두 손잡이가 오른쪽 끝에서 겹쳐도 왼쪽 손잡이를 잡을 수 있게
    prLo.setAttribute('aria-valuetext', wonText(lo));
    prHi.setAttribute('aria-valuetext', wonText(hi));
    $('pr-max-unit').textContent = hi >= PR_MAX ? COPY.priceUnitTop : COPY.priceUnit;
    $('pr-sum').textContent = priceText(readPrice()) || COPY.priceAll;
  }
  const clampMan = v => Math.max(0, Math.min(PR_MAX, Math.round(v)));
  function setPriceUI([lo, hi]) {
    priceUI.lo = clampMan((lo || 0) / 10000);
    priceUI.hi = hi === null ? PR_MAX : clampMan(hi / 10000);
    if (priceUI.lo > priceUI.hi) priceUI.lo = priceUI.hi;
    paintPrice();
  }
  function readPrice() { return [priceUI.lo * 10000, priceUI.hi >= PR_MAX ? null : priceUI.hi * 10000]; }
  let priceFrame = 0;
  const priceChanged = () => { paintPrice(); if (!priceFrame) priceFrame = requestAnimationFrame(() => { priceFrame = 0; updateCount(); }); };
  function setHandle(which, v) {
    if (which === 'lo') priceUI.lo = Math.min(clampMan(v), priceUI.hi); else priceUI.hi = Math.max(clampMan(v), priceUI.lo);
    priceChanged();
  }
  prLo.addEventListener('input', () => setHandle('lo', +prLo.value));
  prHi.addEventListener('input', () => setHandle('hi', +prHi.value));
  for (const [el, which] of [[prLo, 'lo'], [prHi, 'hi']]) el.addEventListener('keydown', e => {       // Shift + 화살표 = 10만 원
    if (!e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    setHandle(which, priceUI[which] + (e.key === 'ArrowLeft' ? -10 : 10));
  });
  // 줄을 누르면 가까운 손잡이가 그 자리로
  let prDrag = null;
  const prValue = e => { const r = prBox.getBoundingClientRect(), pad = 14; return clampMan((e.clientX - r.left - pad) / Math.max(1, r.width - pad * 2) * PR_MAX); };
  prBox.addEventListener('pointerdown', e => {
    if (e.target.tagName === 'INPUT') return;
    const v = prValue(e), { lo, hi } = priceUI;
    prDrag = Math.abs(v - lo) < Math.abs(v - hi) || (lo === hi && v < lo) ? 'lo' : 'hi';
    prBox.setPointerCapture(e.pointerId);
    setHandle(prDrag, v);
  });
  prBox.addEventListener('pointermove', e => { if (prDrag) setHandle(prDrag, prValue(e)); });
  for (const t of ['pointerup', 'pointercancel']) prBox.addEventListener(t, () => { prDrag = null; });
  for (const el of [prMin, prMax]) el.addEventListener('change', () => {
    const read = (input, prev) => { const t = input.value.replace(/[^0-9]/g, ''); return t === '' ? prev : clampMan(+t); };
    let lo = read(prMin, priceUI.lo), hi = read(prMax, priceUI.hi);
    if (lo > hi) [lo, hi] = [hi, lo];
    priceUI.lo = lo; priceUI.hi = hi;
    paintPrice();
    updateCount();
  });

  // PC 시작 화면 오른쪽: 신상품·콜라보 위주로 6장 (넓은 화면에서만 보임)
  function renderArt() {
    const art = $('ob-art');
    if (!isPC() || art.childElementCount) return;
    const picks = shuffle(FEED.filter(f => f.x || isNew(f))).slice(0, 60).sort((a, b) => prior(b) - prior(a));
    const used = new Set(), chosen = [];
    for (const f of picks) if (!used.has(f.b) && chosen.length < 6) { used.add(f.b); chosen.push(f); }
    chosen.forEach((f, i) => {
      const fig = document.createElement('figure');
      fig.style.setProperty('--i', i);
      const pic = document.createElement('div');
      pic.className = 'pic';
      const img = document.createElement('img');
      img.src = f.im; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
      pic.appendChild(img);
      fig.appendChild(pic);
      art.appendChild(fig);
      layoutPhoto(fig, img, f, FILL.art, 0.78);                   // 4:5 칸
      preloadMask(f, () => layoutPhoto(fig, img, f, FILL.art, 0.78));
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
    resumeN = 0;
    store.set('resume', 0);
    deckReady = false;
    if (!editing) return enterApp();
    editing = false;
    dropLayer('settings');
    backToFeed();
    refreshTotal();
    renderHome();
    if (view === 'tap') openDeck();
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
    if (top) return top.close();
    if (view === 'tap' || navBusy) goHome(true);  // 태핑에서 뒤로 = 홈 (5-7), 전환 중이면 끝난 뒤 처리
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
  }
  $('ob-back').addEventListener('click', () => { dropLayer('settings'); backToFeed(); });

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
    a.innerHTML = `<div class="ph" data-theme="light"><div class="pic"><img loading="lazy" referrerpolicy="no-referrer" alt=""></div><div class="tile-tags">${f.x ? '<span class="tp-badge tp-badge--sm tp-badge--collab">COLLAB</span>' : ''}${isNew(f) ? '<span class="tp-badge tp-badge--sm tp-badge--new">NEW</span>' : ''}</div></div><div class="tx"><span class="sub"></span><b></b><span class="t"></span><div class="pr"></div></div>`;
    a.querySelector('img').src = f.im;
    const ph = a.querySelector('.ph'), pimg = a.querySelector('img');
    layoutPhoto(ph, pimg, f, FILL.tile, 1);                       // 정사각형 칸
    preloadMask(f, () => layoutPhoto(ph, pimg, f, FILL.tile, 1));
    a.querySelector('.sub').textContent = `${CAT_LABEL[f.c] || ''} · ${f.s || '기타'}`;
    a.querySelector('b').textContent = f.b;
    a.querySelector('.t').textContent = f.t;
    a.querySelector('.pr').textContent = won(f.p, f.e);
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
    if (settings && !$('feed').hidden) renderHome();
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
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200); }
  const count = (a, v) => a.filter(x => x === v).length;
  // 앞에서 n개만 섞어 뽑기 (전체를 섞지 않음, a는 바뀜)
  function sampleN(a, n) { for (let i = 0; i < n; i++) { const j = i + Math.floor(Math.random() * (a.length - i)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a.slice(0, n); }
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
  let suppressClick = false;               // 당기기 직후의 클릭은 '다음'으로 치지 않음
  $('stage').addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } onSkip(); });
  $('reshuffle').addEventListener('click', () => { seen.clear(); store.set('seen', []); shownCount = 0; saveResume(); startDeck(); });
  $('see-likes').addEventListener('click', openLikes);
  $('empty-go').addEventListener('click', () => closeSheet('likes'));
  $('btn-like').addEventListener('click', onLike);
  $('btn-dislike').addEventListener('click', onDislike);
  $('btn-buy').addEventListener('click', onBuy);
  $('open-likes').addEventListener('click', openLikes);
  $('tab-like').addEventListener('click', openLikes);
  $('tab-home').addEventListener('click', () => goHome());
  $('tab-deck').addEventListener('click', () => goTap());
  $('logo-home').addEventListener('click', () => goHome());
  $('today-hit').addEventListener('click', () => goTap());
  document.querySelector('.today__set').addEventListener('click', openSettings);
  document.addEventListener('touchstart', () => {}, { passive: true });   // iOS Safari에서 누르는 순간 :active 반응이 보이게
  $('hm-all').addEventListener('click', openLikes);
  $('likes').addEventListener('close', () => { if (!$('feed').hidden) renderHome(); });
  $('close-likes').addEventListener('click', () => closeSheet('likes'));
  $('open-settings').addEventListener('click', openSettings);
  $('open-account').addEventListener('click', () => openAuth());
  $('ob-login').addEventListener('click', () => openAuth());
  $('close-auth').addEventListener('click', closeAuth);
  document.querySelectorAll('.auth-tabs [data-mode]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
  $('nudge-login').addEventListener('click', () => openAuth('nudge'));
  $('nudge-close').addEventListener('click', () => { $('nudge').hidden = true; });
  // 아이콘 반응 (5-3): 누를 때 1회. 찜 버튼은 자체 튕김을 쓴다
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    const ic = b && b.id !== 'btn-like' && b.querySelector('svg.ico');
    if (!ic) return;
    ic.classList.remove('play');
    void ic.getBoundingClientRect();
    ic.classList.add('play');
  }, true);
  document.addEventListener('animationend', e => { if (e.target.classList && e.target.classList.contains('ico')) e.target.classList.remove('play'); }, true);

  // 기울기 깊이 (5-2): 카드는 기울고 사진은 반대로, 시작 화면 아이콘은 세 겹이 서로 다른 깊이로 움직인다
  const setPair = (el, a, b, x, y) => { el.style.setProperty(a, x.toFixed(3)); el.style.setProperty(b, y.toFixed(3)); };
  const tiltCard = (x, y) => setPair($('viewer'), '--tx', '--ty', x, y);
  const tiltTile = (x, y) => setPair($('ob-tile'), '--dx', '--dy', x, y);
  const followPointer = (area, tilt) => {
    area.addEventListener('pointermove', e => {
      const r = area.getBoundingClientRect();
      tilt((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
    });
    area.addEventListener('pointerleave', () => tilt(0, 0));
  };
  if (finePointer && !reduceMotion.matches) { followPointer($('deck'), tiltCard); followPointer($('onboard'), tiltTile); }

  // 휴대폰은 자이로로: 아이폰은 '시작하기'(재방문이면 첫 탭)에서 허용을 물어보고, 거절하면 다시 묻지 않는다
  const gyro = { on: false, g0: null, b0: null, x: 0, y: 0, raf: 0 };
  const unit = v => Math.max(-1, Math.min(1, v));
  function onOrient(e) {
    if (e.gamma === null || e.beta === null) return;
    if (gyro.g0 === null) { gyro.g0 = e.gamma; gyro.b0 = e.beta; }
    gyro.g0 += (e.gamma - gyro.g0) * .02;     // 기준 자세가 천천히 따라와서 어떤 자세로 들어도 가운데로 돌아온다
    gyro.b0 += (e.beta - gyro.b0) * .02;
    gyro.x = unit((e.gamma - gyro.g0) / 16);
    gyro.y = unit((e.beta - gyro.b0) / 16);
    if (!gyro.raf) gyro.raf = requestAnimationFrame(() => { gyro.raf = 0; tiltCard(gyro.x, gyro.y); tiltTile(gyro.x, gyro.y); });
  }
  function startGyro() {
    const D = window.DeviceOrientationEvent;
    if (gyro.on || !D || finePointer || reduceMotion.matches || store.get('gyroDenied', false)) return;
    const listen = () => { gyro.on = true; window.addEventListener('deviceorientation', onOrient); };
    if (typeof D.requestPermission !== 'function') return listen();
    D.requestPermission().then(s => { if (s === 'granted') listen(); else store.set('gyroDenied', true); }).catch(() => { /* 사용자 동작 밖에서 호출된 경우 */ });
  }
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') startGyro();
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#start, #stage')) startGyro(); }, true);

  // 빈 화면 그림 (5-6): 파일을 그대로 쓰되 접힌 모서리만 따로 움직이도록 문서 안에 펼친다 (실패하면 <img> 그대로)
  const darkScheme = matchMedia('(prefers-color-scheme: dark)');
  function inlineStateArt() {
    const theme = document.documentElement.dataset.theme || (darkScheme.matches ? 'dark' : 'light');
    document.querySelectorAll('[data-art]').forEach(async box => {
      try {
        const res = await fetch(`brand/states/${box.dataset.art}-${theme}.svg`);
        if (!res.ok) return;
        const svg = new DOMParser().parseFromString(await res.text(), 'image/svg+xml').documentElement;
        if (svg.nodeName !== 'svg') return;
        svg.querySelectorAll('metadata').forEach(m => m.remove());
        svg.querySelector('path[d^="M128 112"]')?.classList.add('state__flap');
        box.replaceChildren(document.importNode(svg, true));
      } catch { /* 네트워크 오류면 파일 그림 그대로 */ }
    });
  }
  inlineStateArt();

  // 화면 모드 (4-8): 다크(기본) / 라이트 / 시스템, 기기에 저장하고 누르는 즉시 적용
  const THEME_KEY = 'tapping.theme';
  const readTheme = () => { try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'system' ? t : 'dark'; } catch { return 'dark'; } };
  const syncThemeColor = () => { document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).backgroundColor; };
  function paintThemeSeg() { const t = readTheme(); $('theme-seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t))); }
  function setTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* 저장이 막힌 환경: 이번 화면에만 적용 */ }
    const root = document.documentElement;
    root.classList.add('theme-fade');
    if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
    paintThemeSeg();
    inlineStateArt();
    setTimeout(() => { root.classList.remove('theme-fade'); syncThemeColor(); }, 260);
  }
  $('theme-seg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.t === readTheme()) return;
    setTheme(b.dataset.t);
    const moon = $('theme-moon');
    moon.classList.remove('play');
    void moon.getBoundingClientRect();
    moon.classList.add('play');
  });
  darkScheme.addEventListener('change', () => { if (readTheme() === 'system') { inlineStateArt(); syncThemeColor(); } });
  paintThemeSeg();
  syncThemeColor();

  // 당겨서 새로 섞기 (5-5, 터치): 끌어내리는 만큼 로고 모서리가 접히고, 끝까지 당겼다 놓으면 새 상품으로
  const PULL = { id: null, y0: 0, v: 0, dragging: false, busy: false };
  function setPull(v) {
    PULL.v = v;
    $('viewer').style.setProperty('--pull', v.toFixed(3));
    $('pull-label').textContent = PULL.busy ? COPY.pullBusy : v >= 1 ? COPY.pullRelease : COPY.pullMore;
  }
  function refreshPull() {
    PULL.busy = true;
    setPull(1);
    const reduce = reduceMotion.matches, flap = $('pull-flap');
    if (!reduce && flap.animate) flap.animate([
      { transform: 'scale(1)', easing: 'cubic-bezier(.55,0,.8,.2)' },
      { transform: 'scale(0)', offset: .45 },
      { transform: 'scale(0)', offset: .55, easing: 'cubic-bezier(.16,1,.3,1)' },
      { transform: 'scale(1)' }
    ], { duration: 900, iterations: 2 });
    setTimeout(() => { PULL.busy = false; setPull(0); startDeck(); }, reduce ? 0 : 1800);
  }
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || phase !== 'idle' || PULL.busy || !current) return;
    PULL.id = e.pointerId; PULL.y0 = e.clientY; PULL.dragging = false;
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== PULL.id) return;
    const d = e.clientY - PULL.y0;
    if (!PULL.dragging) {
      if (d < 10) return;
      PULL.dragging = true;
      try { stage.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ }
      $('viewer').setAttribute('data-drag', '');
    }
    setPull(Math.min(1.2, Math.max(0, d) / 140));
  });
  const endPull = e => {
    if (e.pointerId !== PULL.id) return;
    PULL.id = null;
    if (!PULL.dragging) return;
    PULL.dragging = false;
    $('viewer').removeAttribute('data-drag');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60);
    if (PULL.v >= 1) refreshPull(); else setPull(0);
  };
  stage.addEventListener('pointerup', endPull);
  stage.addEventListener('pointercancel', endPull);

  $('stage').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onSkip(); } });
  document.addEventListener('keydown', e => {
    if ($('auth').open || $('likes').open) return;                        // 시트가 열려 있으면 Esc는 시트가 처리
    if ($('feed').hidden) { if (e.key === 'Escape' && editing) $('ob-back').click(); return; }
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (view !== 'tap') return;
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); return goHome(); }
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); onSkip(); }
    else if (e.key.toLowerCase() === 'l') onLike();
    else if (e.key.toLowerCase() === 'd') onDislike();
    else if (e.key.toLowerCase() === 'b') onBuy();
  });
  matchMedia('(min-width: 1024px)').addEventListener('change', () => { if (!$('onboard').hidden) renderArt(); });
  // 창 크기가 바뀌면 사진 칸 비율이 달라지므로 앞뒤 카드를 다시 맞춤
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (view === 'tap') relayoutDeck();
    }, 120);
  });

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
    if (settings) enterApp(); else showOnboard();
    $('boot').classList.add('done');
    setTimeout(() => $('boot').remove(), 400);
  }
  boot();
})();
