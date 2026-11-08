const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
test('public CSV import normalizes city districts and safely retains previous records', () => {
  const code = `
import tempfile,zipfile,csv,io,sqlite3,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]); tmp=Path(tempfile.mkdtemp()); db=sqlite3.connect(tmp/'db.sqlite')
db.executescript((root/'migrations/0006_public_places.sql').read_text().replace("UPDATE place_records SET category = 'other';", '')+(root/'migrations/0007_public_catalog_version.sql').read_text()+(root/'migrations/0008_catalog_sync.sql').read_text()+(root/'migrations/0009_catalog_sync_integrity.sql').read_text());db.close()
fields=['상가업소번호','상호명','시도명','시군구명','경도','위도','상권업종대분류명','상권업종중분류명','상권업종소분류명','도로명주소']
data=io.StringIO(newline=''); w=csv.DictWriter(data,fieldnames=fields);w.writeheader();w.writerow(dict(zip(fields,['MA123',"카페 오'늘",'충청남도','천안시 서북구','127.1','36.8','음식','비알코올','카페','주소 1'])));w.writerow(dict(zip(fields,['MA456','식당','세종특별자치시','세종특별자치시','127.2','36.5','음식','음식점','한식','주소 2'])))
with zipfile.ZipFile(tmp/'data.zip','w') as z:z.writestr('data.csv',data.getvalue().encode('utf-8-sig'))
subprocess.run([sys.executable,str(root/'scripts/import_public_places.py'),'--zip',str(tmp/'data.zip'),'--db',str(tmp/'db.sqlite'),'--version','20260930'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
db=sqlite3.connect(tmp/'db.sqlite'); assert db.execute("select name,category,region_district from public_places where id='biz:MA123'").fetchone()==("카페 오'늘",'cafe','천안시');assert db.execute("select region_district from public_places where id='biz:MA456'").fetchone()[0]=='세종시';assert db.execute('select data_version from public_catalog_meta').fetchone()[0]=='20260930'
`;
  assert.doesNotThrow(() => execFileSync('python3', ['-c', code, resolve(__dirname, '..')], { encoding: 'utf8' }));
});
