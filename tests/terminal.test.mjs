import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TerminalEngine, validateData, safeURL, tokenize, formatLocalTime } from '../js/filesystem.js';
const published = JSON.parse(await readFile(new URL('../data/site-data.json',import.meta.url)));
// Stable fixtures let the owner edit their profile without breaking command tests.
const data = {
  version:1,
  profile:{name:'Your Name',username:'guest',about:'Test profile',email:'hello@example.com',github:'https://github.com/example'},
  education:[{school:'Test University',degree:'BSc',period:'2024 — 2028',description:'Computer Science'}],
  projects:[
    {slug:'project-alpha',name:'Project Alpha',description:'Test project',github:'https://github.com/example/alpha',demo:'',tags:[]},
    {slug:'project-beta',name:'Project Beta',description:'Test project',github:'',demo:'',tags:[]}
  ],
  research:{interests:'Computer systems'},links:[]
};
test('current site data is valid',() => assert.equal(validateData(published),published));

test('all primary commands and nested Linux-style paths',() => {
  const t = new TerminalEngine(data);
  assert.match(t.run('help').text,/Ctrl\+L/);
  assert.equal(t.run('pwd').text,'/home/guest');
  assert.match(t.run('ls').text,/about.txt\ncontact.txt\neducation\/\nprojects\/\nresearch\//);
  t.run('cd projects'); assert.equal(t.path,'~/projects');
  assert.match(t.run('cd project-alpha').text,/Project Alpha/);
  t.run('cd ..');
  assert.match(t.run('tree').text,/├── project-alpha\//);
  t.run('cd project-alpha'); t.run('cd ..'); assert.equal(t.path,'~/projects');
  t.run('cd ~'); assert.equal(t.path,'~');
  t.run('cd /home/guest/research'); assert.equal(t.path,'~/research');
  t.run('cd ../../../../'); assert.equal(t.path,'~');
  assert.match(t.run('whoami').text,/Your Name/);
  assert.match(t.run('history').text,/history$/);
  assert.deepEqual(t.run('clear'),{clear:true});
  assert.ok(t.run('edit').error);
  assert.deepEqual(t.complete('ed'),[]);
  assert.doesNotMatch(t.run('help').text,/Customize|project-alpha/);
  assert.equal(t.run('open github').links[0].url,data.profile.github);
  assert.equal(t.run('open projects').links.length,1);
  assert.equal(t.run('open ~/contact.txt').links.length,2);
});
test('errors, quotes, unknown commands and inert shell syntax',() => {
  const t = new TerminalEngine(data);
  for (const line of ['cd missing','cd about.txt','ls missing','cd a b','cat','open','rm -rf /', 'cat "unclosed']) assert.ok(t.run(line).error,line);
  assert.ok(t.run('cat projects').results[0].error);
  const results = t.run('cat missing about.txt').results;
  assert.ok(results[0].error); assert.match(results[1].text,/Your Name/);
  assert.deepEqual(tokenize('cat "about.txt"'),['cat','about.txt']);
  assert.ok(t.run('ls; whoami').error);
  assert.equal(t.path,'~');
});
test('command, directory, file and link completion',() => {
  const t = new TerminalEngine(data);
  assert.deepEqual(t.complete('he'),['help']);
  assert.deepEqual(t.complete('cd pro'),['cd projects/']);
  assert.deepEqual(t.complete('cd ~/projects/project-a'),['cd ~/projects/project-alpha/']);
  assert.deepEqual(t.complete('open git'),['open github']);
  assert.deepEqual(t.complete('cd about'),[]);
  t.run('cd projects'); assert.deepEqual(t.complete('cat ../abo'),['cat ../about.txt']);
});
test('JSON round-trip, schema validation and unsafe link rejection',() => {
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
  for (const value of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd']) assert.equal(safeURL(value),null);
  const invalid = structuredClone(data); invalid.projects.push(invalid.projects[0]); assert.throws(() => validateData(invalid));
  invalid.projects.pop(); invalid.profile.github = 'javascript:alert(1)'; assert.throws(() => validateData(invalid));
  const t = new TerminalEngine(data); t.run('cd projects/project-alpha');
  const updated = structuredClone(data); updated.projects = []; t.update(updated); assert.equal(t.path,'~');
});
test('root and repository-subpath asset URLs resolve within their deployment',async () => {
  const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
  for (const base of ['https://example.github.io/','https://example.github.io/my-homepage/']) {
    for (const [,path] of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)) {
      assert.ok(new URL(path,base).href.startsWith(base));
      await readFile(new URL('../'+path,import.meta.url));
    }
    const script = new URL('./js/terminal.js',base);
    assert.equal(new URL('../data/site-data.json',script).href,base+'data/site-data.json');
  }
});

test('cd automatically reads the sole file while preserving normal directory listings',() => {
  const t = new TerminalEngine(data);
  const education = t.run('cd education');
  assert.match(education.text,/Test University/);
  assert.match(education.text,/BSc/);
  assert.equal(t.path,'~/education');
  assert.equal(t.run('ls').text,'README.md');
  assert.deepEqual(t.run('cat README.md').results[0],education);
  assert.deepEqual(t.complete('cat R'),['cat README.md']);
  assert.match(t.run('cd ~/research').text,/Computer systems/);
  const project = t.run('cd ~/projects/project-alpha');
  assert.match(project.text,/Project Alpha/);
  assert.equal(project.links[0].url,data.projects[0].github);
  assert.equal(t.run('open .').links[0].url,data.projects[0].github);
  assert.deepEqual(t.run('cd ..'),{});
  assert.deepEqual(t.run('cd ~'),{});
  assert.match(t.run('tree').text,/README.md/);
  assert.equal(t.root.children.get('education').children.size,1);
  const extra = {type:'dir',children:new Map([['one.txt',{type:'file',content:'One file',links:[]}]])};
  t.root.children.set('extra',extra);
  assert.equal(t.run('cd extra').text,'One file');
  extra.children.set('two.txt',{type:'file',content:'Two files',links:[]});
  assert.deepEqual(t.run('cd .'),{});
  extra.children.clear();
  assert.deepEqual(t.run('cd .'),{});
  extra.children.set('nested',{type:'dir',children:new Map()});
  assert.deepEqual(t.run('cd .'),{});
});

test('hidden imaginary GPU command runs without appearing in help or completion',() => {
  const t = new TerminalEngine(data);
  const result = t.run('nvidia-smi');
  assert.equal(result.table,true);
  assert.match(result.text,/RTX 9090 COSMIC Ti/);
  assert.match(result.text,/8 PiB/);
  assert.match(result.text,/Simulated GPU/);
  const lines = result.text.split('\n');
  for (const line of lines.filter(line => /^[+|]/.test(line))) assert.equal(line.length,96,line);
  const processRows = lines.filter(line => line.startsWith('|') && /Process name|training_the|finding_a/.test(line));
  const separators = line => [...line.matchAll(/\|/g)].map(match => match.index);
  assert.deepEqual(separators(processRows[1]),separators(processRows[0]));
  assert.deepEqual(separators(processRows[2]),separators(processRows[0]));
  assert.doesNotMatch(t.run('help').text,/nvidia/);
  assert.deepEqual(t.complete('nvidia'),[]);
  assert.ok(t.run('nvidia-smi --real').error);
});

test('GPU timestamp uses local calendar and clock fields',() => {
  assert.equal(formatLocalTime(new Date(2026,8,10,17,8,58)), 'Thu Sep 10 17:08:58 2026');
  assert.equal(formatLocalTime(new Date(2026,0,2,0,3,4)), 'Fri Jan  2 00:03:04 2026');
  const before = formatLocalTime();
  const output = new TerminalEngine(data).run('nvidia-smi').text.split('\n')[0];
  assert.ok([before,formatLocalTime()].includes(output));
});
