const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
test('recommendations count all regional users without exposing private records', () => {
  execFileSync('python3', ['-c', String.raw`
import glob, sqlite3, re
c=sqlite3.connect(':memory:'); c.row_factory=sqlite3.Row
for f in sorted(glob.glob('migrations/*.sql')): c.executescript(open(f).read())
for i in range(34):
 c.execute('INSERT INTO users(id,email,nickname,password_hash,places_public) VALUES(?,?,?,?,?)',(str(i),f'{i}@test.com',f'nick{i}','hash',int(i%2==0)))
c.execute("INSERT INTO public_places(id,name,address,category,category_name,region_sido,region_district,longitude,latitude,data_version) VALUES('biz:1','Place','Address','other','','A','B',127,37,'1')")
for i in range(33):
 c.execute("INSERT INTO place_records(user_id,place_id,region_sido,region_district,alias,created_at,visit_intent) VALUES(?, ?, 'A','B','',1,?)",(str(i), 'biz:1' if i<10 else 'legacy:'+str(i), 'again' if i<9 else 'want'))
source=open('functions/api/places/records.js').read(); part=source.split("if (mode === 'popular')",1)[1]; query=part.split('prepare('+chr(96),1)[1].split(chr(96)+')',1)[0]
def results(intent): return c.execute(query,('A','B',intent,intent,'A','B')).fetchall()
assert len(results('all'))==1 and results('all')[0]['count']==10  # 10/33 > 30%, including private accounts
assert len(results('again'))==0  # 9/33 < 30%
c.execute("UPDATE place_records SET visit_intent='again' WHERE user_id='9'")
assert len(results('again'))==1  # 10/33 > 30%
c.execute("INSERT INTO place_records(user_id,place_id,region_sido,region_district,alias,created_at,visit_intent) VALUES('33','legacy:33','A','B','',1,'want')")
assert len(results('all'))==0 # 10/34 < 30%
c.execute("DELETE FROM place_records WHERE user_id IN ('30','31','32','33')")
assert len(results('all'))==1 # 10/30 > 30%
c.execute("UPDATE place_records SET visit_intent='want' WHERE user_id='9'")
assert len(results('again'))==1 # 9/30 = 30%
c.execute("DELETE FROM place_records WHERE user_id='9'")
assert len(results('all'))==0 # 9 total savers despite exceeding 30%
assert set(results('again')[0].keys()) if results('again') else True
assert not any(x in query for x in ['r.note','r.tags','r.visit_date','u.nickname','u.id'])
c.execute("UPDATE place_records SET visit_intent='' WHERE user_id='0'")
c.executescript(open('migrations/0015_visit_intent_required.sql').read())
assert c.execute("SELECT visit_intent FROM place_records WHERE user_id='0'").fetchone()[0]=='again'
`], {cwd:resolve(__dirname,'..'),stdio:'pipe'});
});
