"""Shared source-classification rules for the public CSV importer."""

_MAJOR_CATEGORY = {
    '음식': 'restaurant',
    '숙박': 'stay',
    '소매': 'shopping',
    '수리·개인': 'beauty',
    '보건의료': 'medical',
    '예술·스포츠': 'culture',
    '교육': 'education',
}

_SHOPPING_MIDDLE = ('소매', '판매', '편의점', '슈퍼마켓', '상점', '할인점', '꽃집')
_BEAUTY_DETAIL = ('미용실', '피부 관리', '피부관리', '네일', '이용원', '마사지', '안마', '체형', '비만 관리')
_CAFE_DETAIL = ('카페', '커피', '디저트', '제과', '빵', '도넛', '아이스크림', '빙수', '떡', '한과')
_CULTURE_DETAIL = ('노래방', '영화', '공연', '극장', '박물관', '미술관', '전시', '도서관', 'PC방', '게임장', '오락', '스포츠', '체육', '골프', '당구', '볼링', '수영', '헬스', '요가', '필라테스', '레저', '캠핑')
_EDUCATION_DETAIL = ('학원', '교육', '교습', '학교', '훈련', '독서실', '스터디 카페')


def _contains(value, terms):
    return any(term in value for term in terms)


def categorize_place(major='', middle='', detail='', standard=''):
    major, middle, detail, standard = (str(value or '').strip() for value in (major, middle, detail, standard))

    if _contains(detail, _CAFE_DETAIL) or _contains(standard, ('커피', '제과', '제빵')):
        return 'cafe'
    if _contains(detail, _BEAUTY_DETAIL):
        return 'beauty'
    if major == '음식':
        return 'restaurant'
    if major == '숙박' or '숙박' in middle:
        return 'stay'
    if major == '소매' or _contains(middle, _SHOPPING_MIDDLE):
        return 'shopping'
    if major == '보건의료':
        return 'medical'
    if major == '교육' or _contains(detail, _EDUCATION_DETAIL):
        return 'education'
    if major == '예술·스포츠' or _contains(detail, _CULTURE_DETAIL):
        return 'culture'
    return _MAJOR_CATEGORY.get(major, 'other')


def categorize_legacy_place(major='', middle='', detail=''):
    major, middle, detail = (str(value or '').strip() for value in (major, middle, detail))
    if major == '음식' and not _contains(detail, _CAFE_DETAIL):
        return 'restaurant'
    if major == '숙박' or '숙박' in middle:
        return 'stay'
    if _contains(detail, _CAFE_DETAIL):
        return 'cafe'
    return 'other'