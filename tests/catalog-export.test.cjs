const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

test('snapshot export includes public places but never user records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'place-export-'));
  try {
    const db = join(dir, 'test.sqlite'), out = join(dir, 'out');
    const setup = `import sqlite3,sys\nc=sqlite3.connect(sys.argv[1])\nc.executescript("CREATE TABLE public_catalog_meta(id INTEGER,data_version TEXT); INSERT INTO public_catalog_meta VALUES(1,'20260930'); CREATE TABLE public_places(id TEXT,name TEXT,address TEXT,category TEXT,category_name TEXT,region_sido TEXT,region_district TEXT,longitude REAL,latitude REAL,is_active INTEGER); INSERT INTO public_places VALUES('biz:one','공개 장소','주소','cafe','카페','충청남도','천안시',127.0,36.0,1); CREATE TABLE users(secret TEXT); INSERT INTO users VALUES('private-marker-123');")\nc.commit()`;
    const create = spawnSync('python3', ['-c', setup, db], {encoding:'utf8'}); assert.equal(create.status, 0, create.stderr);
    const script = resolve(__dirname, '../scripts/export_catalog_shards.py');
    const result = spawnSync('python3', [script,'--db',db,'--output',out,'--version','20260930'], {encoding:'utf8'}); assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
    assert.equal(manifest.total,1);
    const rows = readFileSync(join(out,manifest.regions['충청남도|천안시']),'utf8');
    assert.match(rows,/공개 장소/); assert.doesNotMatch(rows,/private-marker-123/);
    const repeated = spawnSync('python3', [script,'--db',db,'--output',out,'--version','20260930'], {encoding:'utf8'});
    assert.notEqual(repeated.status,0, 'non-empty output is never overwritten');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
