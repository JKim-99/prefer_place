#!/usr/bin/env python3
"""Export a read-only public catalog snapshot into region JSON shards.

Output is public business data, never user records. The directory must be empty.
"""
import argparse
import hashlib
import json
import math
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--db', required=True, help='Source SQLite catalog; opened read-only')
parser.add_argument('--output', required=True, help='Empty output directory')
parser.add_argument('--version', required=True, help='Source data date, YYYYMMDD')
args = parser.parse_args()
if len(args.version) != 8 or not args.version.isdigit():
    parser.error('version must be YYYYMMDD')
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
if any(output.iterdir()):
    parser.error('output directory must be empty')
db = sqlite3.connect(Path(args.db).resolve().as_uri() + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
version = db.execute('SELECT data_version FROM public_catalog_meta WHERE id=1').fetchone()
if not version or version[0] != args.version:
    parser.error('source catalog version does not match --version')
regions = db.execute('SELECT DISTINCT region_sido, region_district FROM public_places WHERE is_active=1 ORDER BY 1,2').fetchall()
if not regions:
    parser.error('source catalog has no active regions')
manifest = {'version': args.version, 'regions': {}}
count = 0
for region in regions:
    sido, district = region
    key = sido + '|' + district
    filename = hashlib.sha256(key.encode()).hexdigest()[:24] + '.json'
    if filename in manifest['regions'].values():
        raise ValueError('regional file name collision')
    rows = db.execute('SELECT id,name,address,category,category_name,longitude,latitude FROM public_places WHERE is_active=1 AND region_sido=? AND region_district=? ORDER BY id', (sido, district))
    path = output / filename
    with path.open('w', encoding='utf-8') as f:
        f.write('[')
        first = True
        for row in rows:
            if not row['id'] or not row['name'] or not all(isinstance(row[key], (int, float)) and math.isfinite(row[key]) for key in ('longitude', 'latitude')):
                raise ValueError(f'invalid public place in {sido} {district}')
            if not first: f.write(',')
            json.dump(list(row), f, ensure_ascii=False, separators=(',', ':'))
            first = False
            count += 1
        f.write(']')
    if path.stat().st_size >= 25 * 1024 * 1024:
        raise ValueError(f'regional shard exceeds Pages file limit: {key}')
    manifest['regions'][key] = filename
manifest['total'] = count
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
(output / '_headers').write_text('/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=3600\n', encoding='utf-8')
print(f'Exported {count} public places in {len(regions)} region shards, version {args.version}.')
