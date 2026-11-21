const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');

test('migration preserves records, converts visibility and enforces nickname uniqueness and popularity thresholds', () => {
  execFileSync('python3', ['-c', String.raw`
import glob, sqlite3
c = sqlite3.connect(':memory:')
files = sorted(glob.glob('migrations/*.sql'))
for f in files:
 if '0014_' not in f: c.executescript(open(f).read())
for i in range(11):
 c.execute('INSERT INTO users(id,email,nickname,password_hash) VALUES(?,?,?,?)',(str(i),f'{i}@example.com',f'user{i}','hash'))
 c.execute("INSERT INTO place_records(user_id,place_id,region_sido,region_district,alias,is_public,created_at,visit_status) VALUES(?, 'biz:1','A','B','',?,1,?)",(str(i),int(i<10), ['want','visited','again',''][i%4]))
c.executescript(open('migrations/0014_public_profiles.sql').read())
assert c.execute('SELECT places_public FROM users WHERE id="0"').fetchone()[0] == 1
assert c.execute('SELECT places_public FROM users WHERE id="10"').fetchone()[0] == 0
assert [r[0] for r in c.execute('SELECT visit_intent FROM place_records ORDER BY CAST(user_id AS INTEGER) LIMIT 4')] == ['want','again','again','']
try: c.execute("INSERT INTO users(id,email,nickname,password_hash) VALUES('new','new@example.com',' USER0 ','hash')")
except sqlite3.IntegrityError: pass
else: raise AssertionError('duplicate nickname accepted')
query = '''SELECT count(*) FROM place_records r JOIN users u ON u.id=r.user_id WHERE u.places_public=1 HAVING count(*)>=10 AND sum(CASE WHEN r.visit_intent=? THEN 1 ELSE 0 END)*100>=count(*)*30'''
assert c.execute(query,('want',)).fetchone()[0] == 10
assert c.execute(query,('avoid',)).fetchone() is None
c.execute("UPDATE users SET places_public=0 WHERE id='0'")
assert c.execute(query,('again',)).fetchone() is None
`], { cwd: resolve(__dirname, '..'), stdio: 'pipe' });
});
