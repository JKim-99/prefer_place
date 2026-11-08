#!/usr/bin/env python3
"""Import the official SBIZ CSV zip into an already migrated local D1 SQLite database.

Example: python3 scripts/import_public_places.py --zip /path/to/download.zip --db /path/to/local.sqlite --version 20260930
The database is local only. Remote D1 imports require a separate provisioned import process.
"""
import argparse
import csv
import io
import re
import sqlite3
import sys
import time
import zipfile


def normalized_region(name):
    name = name.strip()
    match = re.match(r'^(.+?시)\s*.+구$', name)
    return match.group(1) if match else name


def category(row):
    major = row['상권업종대분류명'].strip()
    middle = row['상권업종중분류명'].strip()
    detail = row['상권업종소분류명'].strip()
    if '카페' in detail or '커피' in detail or '커피' in row.get('표준산업분류명', ''):
        return 'cafe'
    if major == '숙박' or '숙박' in middle:
        return 'stay'
    if major == '음식':
        return 'restaurant'
    return 'other'


def rows(path, version):
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            if not entry.filename.lower().endswith('.csv'):
                continue
            print(f'읽는 중: {entry.filename}', file=sys.stderr, flush=True)
            with archive.open(entry) as raw, io.TextIOWrapper(raw, encoding='utf-8-sig', newline='') as text:
                reader = csv.DictReader(text)
                required = {'상가업소번호', '상호명', '시도명', '시군구명', '경도', '위도', '상권업종대분류명', '상권업종중분류명', '상권업종소분류명'}
                if not required.issubset(reader.fieldnames or []):
                    raise ValueError(f'필수 컬럼 누락: {entry.filename}')
                for row in reader:
                    identifier = row['상가업소번호'].strip()
                    name = row['상호명'].strip()
                    province = row['시도명'].strip()
                    district = '세종시' if province == '세종특별자치시' else normalized_region(row['시군구명'])
                    try:
                        lon, lat = float(row['경도']), float(row['위도'])
                    except (ValueError, TypeError):
                        continue
                    if not re.fullmatch(r'[A-Za-z0-9]{1,40}', identifier) or not name or not province or not district or not (124 <= lon <= 132 and 33 <= lat <= 39):
                        continue
                    yield ('biz:' + identifier, name, (row.get('도로명주소') or row.get('지번주소') or '').strip(), category(row), row['상권업종소분류명'].strip(), province, district, lon, lat, version)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zip', required=True)
    parser.add_argument('--db', required=True)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    db = sqlite3.connect(args.db, timeout=60)
    # Upsert; do not remove records from older releases: users' saved places keep working.
    sql = '''INSERT INTO public_places (id,name,address,category,category_name,region_sido,region_district,longitude,latitude,data_version,source_version,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,category=excluded.category,category_name=excluded.category_name,region_sido=excluded.region_sido,region_district=excluded.region_district,longitude=excluded.longitude,latitude=excluded.latitude,data_version=excluded.data_version,source_version=excluded.source_version,is_active=1'''
    count, batch = 0, []
    for row in rows(args.zip, args.version):
        batch.append((*row, args.version[:6]))
        if len(batch) >= 5000:
            db.executemany(sql, batch); db.commit(); count += len(batch); batch.clear()
    if batch:
        db.executemany(sql, batch); db.commit(); count += len(batch)
    if not count:
        raise ValueError('적재할 장소가 없습니다. 기존 검색 기준일은 변경하지 않았습니다.')
    db.execute('INSERT INTO public_catalog_meta (id,data_version,imported_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET data_version=excluded.data_version, imported_at=excluded.imported_at', (args.version, int(time.time())))
    db.execute('DELETE FROM catalog_sync_seen')
    db.execute("INSERT INTO catalog_sync_state (id,status,completed_version) VALUES (1,'idle',?) ON CONFLICT(id) DO UPDATE SET status='idle',completed_version=excluded.completed_version,source_version=NULL,run_token=NULL,region_index=0,code_index=0,page_number=1,expected_code_total=NULL,group_expected_total=0,last_checked_at=NULL", (args.version[:6],))
    db.commit()
    print(f'{count:,}개 장소 반영 완료')
    db.close()

if __name__ == '__main__':
    main()
