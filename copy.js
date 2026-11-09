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

  coverLabel: (m, d) => `${m}월 ${d}일 · 오늘의 태핑`,
  coverNew: '새로 들어왔어요',
  coverZero: '오늘은 새 상품이\n없어요',
  coverRecent: n => `최근 2주 신상 ${n}개`,
  coverAll: '전체 상품',
  coverAria: n => `오늘 새 상품 ${n}개. 탭하면 첫 상품으로 넘어가요`,

  themeTitle: '화면 모드',
  themeHint: '누르면 바로 바뀌어요',
  themeDark: '다크',
  themeLight: '라이트',
  themeSystem: '시스템'
};
