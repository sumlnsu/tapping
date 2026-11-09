/* 태핑 화면 문구 모음 — 로딩·빈 화면 문구는 임시안(기획 확인 필요)이라 여기만 고치면 전부 바뀝니다 */
window.TAPPING_COPY = {
  loading: '상품을 고르는 중',

  emptyLikesTitle: '아직 찜한 상품이 없어요',
  emptyLikesBody: '마음에 드는 상품에 하트를 눌러 두면 여기에 모여요.',
  emptyLikesCta: '상품 보러 가기',

  allSeenTitle: '새 상품을 모두 봤어요',
  allSeenBody: '처음부터 다시 섞거나, 찜해 둔 상품을 볼 수 있어요.',
  allSeenShuffle: '다시 섞기',
  allSeenLikes: '찜한 상품 보기',

  buyToast: '판매처로 이동해요',

  pullMore: '조금 더 당겨 주세요',
  pullRelease: '놓으면 새로 섞어요',
  pullBusy: '새로 섞는 중',

  homeLabel: (m, d) => `${m}월 ${d}일 · 오늘의 태핑`,
  homeNew: '새로 들어왔어요',
  homeZero: '오늘은 새 상품이\n없어요',
  homeRecentCount: n => `최근 2주 신상 ${n}개`,
  homeAll: '전체 상품',
  homeFirst: '넘겨서 첫 상품부터',
  homeRecentFirst: '넘겨서 최근 신상부터',
  homeResume: n => `${n}개 봤어요 · 이어서 넘기기`,
  homeChange: '바꾸기',
  homeAria: n => `오늘 새 상품 ${n}개. 누르면 태핑을 시작해요`,
  homeToday: '오늘 들어온 상품',
  homeRecent: '최근 2주 신상',
  homeCount: n => `${n}개`,
  homeMore: '이어서 넘기기',
  homeLikes: '찜한 상품',
  homeLikesAll: '전체 보기',
  homeLikesEmpty: '하트를 누른 상품이 여기에 모여요',
  homeLikesGuest: '로그인하면 찜한 상품을 모아 볼 수 있어요',
  homeLogin: '로그인',

  nopeStamp: '별로예요',
  nopeToast: '별로예요로 표시했어요',
  nopeUndo: '되돌리기',

  priceTitle: '가격',
  priceHint: '1만 원 단위',
  priceAll: '전체',
  priceMin: '최소',
  priceMax: '최대',
  priceUnit: '만원',
  priceUnitTop: '만원 이상',
  priceNone: '조건에 맞는 상품이 없어요. 가격 범위를 넓혀 보세요',
  pickCategory: '카테고리를 하나 이상 골라 주세요',

  themeTitle: '화면 모드',
  themeHint: '누르면 바로 바뀌어요',
  themeDark: '다크',
  themeLight: '라이트',
  themeSystem: '시스템'
};
