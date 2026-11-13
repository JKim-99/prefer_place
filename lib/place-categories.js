export const categories = Object.freeze([
  { id: 'restaurant', label: '음식점', icon: '🍴' },
  { id: 'cafe', label: '카페·디저트', icon: '☕' },
  { id: 'stay', label: '숙박', icon: '🛏' },
  { id: 'shopping', label: '쇼핑', icon: '🛍' },
  { id: 'beauty', label: '미용', icon: '💇' },
  { id: 'medical', label: '의료', icon: '⚕️' },
  { id: 'culture', label: '문화', icon: '🎭' },
  { id: 'education', label: '교육', icon: '📚' },
  { id: 'other', label: '기타', icon: '📍' }
]);

const majorCategory = Object.freeze({
  '음식': 'restaurant',
  '숙박': 'stay',
  '소매': 'shopping',
  '수리·개인': 'beauty',
  '보건의료': 'medical',
  '예술·스포츠': 'culture',
  '교육': 'education'
});

const shoppingMiddle = /소매|판매|편의점|슈퍼마켓|상점|할인점|꽃집/;
const beautyDetail = /미용실|피부 관리|피부관리|네일|이용원|마사지|안마|체형|비만 관리/;
const cafeDetail = /카페|커피|디저트|제과|빵|도넛|아이스크림|빙수|떡|한과/;
const cultureDetail = /노래방|영화|공연|극장|박물관|미술관|전시|도서관|PC방|게임장|오락|스포츠|체육|골프|당구|볼링|수영|헬스|요가|필라테스|레저|캠핑/;
const educationDetail = /학원|교육|교습|학교|훈련|독서실|스터디 카페/;

export function categorizePlace({ major = '', middle = '', detail = '', standard = '' } = {}) {
  const l = String(major).trim(), m = String(middle).trim(), s = String(detail).trim(), k = String(standard).trim();

  // Use specific venue types first: cafés and beauty businesses can share broader source classes.
  if (cafeDetail.test(s) || /커피|제과|제빵/.test(k)) return 'cafe';
  if (beautyDetail.test(s)) return 'beauty';
  if (l === '음식') return 'restaurant';
  if (l === '숙박' || m.includes('숙박')) return 'stay';
  if (l === '소매' || shoppingMiddle.test(m)) return 'shopping';
  if (l === '보건의료') return 'medical';
  if (l === '수리·개인') return 'other';
  if (l === '교육' || educationDetail.test(s)) return 'education';
  if (l === '예술·스포츠' || cultureDetail.test(s)) return 'culture';
  return majorCategory[l] || 'other';
}

export function categorizeLegacyPlace({ major = '', middle = '', detail = '' } = {}) {
  const l = String(major).trim(), m = String(middle).trim(), s = String(detail).trim();
  if (l === '음식' && !cafeDetail.test(s)) return 'restaurant';
  if (l === '숙박' || m.includes('숙박')) return 'stay';
  if (cafeDetail.test(s)) return 'cafe';
  return 'other';
}