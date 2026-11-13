const has = (value, words) => words.some(word => value.includes(word));
const cafe = ['카페', '커피', '디저트', '제과', '빵', '도넛', '아이스크림', '빙수', '떡', '한과'];
const beauty = ['미용실', '피부 관리', '피부관리', '네일', '이용원', '마사지', '안마', '체형', '비만 관리'];
const culture = ['노래방', '영화', '공연', '극장', '박물관', '미술관', '전시', '도서관', 'PC방', '게임장', '오락', '스포츠', '체육', '골프', '당구', '볼링', '수영', '헬스', '요가', '필라테스', '레저', '캠핑'];
const education = ['학원', '교육', '교습', '학교', '훈련', '독서실', '스터디 카페'];
const retail = ['소매', '판매', '편의점', '슈퍼마켓', '상점', '할인점', '꽃집'];

export function categoryFromFields({ category = '', category_major = '', category_middle = '', category_name = '', category_version = 1 } = {}) {
  const major = String(category_major || '').trim();
  const middle = String(category_middle || '').trim();
  const detail = String(category_name || '').trim();

  if (Number(category_version) === 1 || !major) return legacyCategory(category, major, middle, detail);

  if (has(detail, cafe)) return 'cafe';
  if (has(detail, beauty)) return 'beauty';
  if (major === '음식') return 'restaurant';
  if (major === '숙박' || middle.includes('숙박')) return 'stay';
  if (major === '소매' || has(middle, retail)) return 'shopping';
  if (major === '보건의료') return 'medical';
  if (major === '교육' || has(detail, education)) return 'education';
  if (major === '예술·스포츠' || has(detail, culture)) return 'culture';
  if (major === '수리·개인') return 'other';

  // Maintain the old behavior for rows that have not carried source hierarchy.
  if (category === 'cafe') return 'cafe';
  if (category === 'restaurant') return 'restaurant';
  if (category === 'stay') return 'stay';
  return 'other';
}

function legacyCategory(category, major, middle, detail) {
  if (major === '음식' && !has(detail, cafe)) return 'restaurant';
  if (major === '숙박' || middle.includes('숙박')) return 'stay';
  if (has(detail, cafe)) return 'cafe';
  return category === 'restaurant' || category === 'cafe' || category === 'stay' ? category : 'other';
}