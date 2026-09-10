// Content is data, never executable markup or shell code.
export function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function validateData(data) {
  const fail = message => { throw new Error(`Invalid site-data.json: ${message}`); };
  const string = (value, label) => { if (typeof value !== 'string' || value.length > 50000) fail(`${label} must be text (max 50,000 characters).`); };
  const url = (value, label) => { string(value, label); if (value && !/^https?:\/\//i.test(value)) fail(`${label} must use https:// or http://.`); if (value && !safeURL(value)) fail(`${label} is not a valid URL.`); };
  if (!data || data.version !== 1 || !data.profile) fail('expected version 1 and a profile.');
  for (const key of ['name','username','about','email','github']) string(data.profile[key], `profile.${key}`);
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(data.profile.username)) fail('username must contain 1–40 letters, digits, underscores or hyphens.');
  if (!data.profile.name.trim()) fail('name is required.');
  if (data.profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.profile.email)) fail('email is invalid.');
  url(data.profile.github, 'profile.github');
  for (const key of ['education','projects','links']) if (!Array.isArray(data[key]) || data[key].length > 200) fail(`${key} must be a list of at most 200 entries.`);
  data.education.forEach(item => { if (!item) fail('education entry is missing.'); for (const key of ['school','degree','period','description']) string(item[key], `education.${key}`); });
  const slugs = new Set();
  data.projects.forEach(item => {
    if (!item) fail('project entry is missing.');
    for (const key of ['name','slug','description']) string(item[key], `project.${key}`);
    if (!item.name.trim() || !/^[a-z0-9][a-z0-9_-]*$/.test(item.slug) || slugs.has(item.slug)) fail('projects need a name and unique lowercase directory slug.');
    slugs.add(item.slug);
    url(item.github, 'project.github'); url(item.demo, 'project.demo');
    if (!Array.isArray(item.tags) || item.tags.length > 100) fail('project tags must be a list (max 100).');
    item.tags.forEach(tag => string(tag, 'tag'));
  });
  if (!data.research) fail('research is missing.');
  string(data.research.interests, 'research.interests');
  data.links.forEach(item => { if (!item) fail('link is missing.'); string(item.name,'link.name'); url(item.url,'link.url'); });
  return data;
}

export function buildFilesystem(data) {
  validateData(data);
  const file = (content, links = []) => ({ type: 'file', content, links: links.filter(link => safeURL(link.url)) });
  const dir = (children = {}) => ({ type:'dir', children: new Map(Object.entries(children)) });
  const projectNodes = Object.create(null);
  data.projects.forEach(project => {
    const links = [{name:'GitHub',url:project.github},{name:'Demo',url:project.demo}].filter(link => link.url);
    projectNodes[project.slug] = dir({'README.md':file(`${project.name}\n\n${project.description}${project.tags.length ? `\n\nTags: ${project.tags.join(', ')}` : ''}`,links)});
  });
  const contact = [{name:'Email',url:data.profile.email ? `mailto:${data.profile.email}` : ''},{name:'GitHub',url:data.profile.github},...data.links].filter((link,index,array) => link.url && array.findIndex(other => other.url === link.url) === index);
  return dir({
    'about.txt': file(`${data.profile.name}\n\n${data.profile.about}`),
    'contact.txt': file('Let’s connect.',contact),
    education: dir({'README.md':file(data.education.map(item => `${item.school}\n${item.degree}${item.period ? ` | ${item.period}` : ''}\n\n${item.description}`).join('\n\n') || 'No education entries yet.')}),
    projects: dir(projectNodes),
    research: dir({'README.md':file(`Research interests\n\n${data.research.interests}`)})
  });
}

export function resolvePath(input = '~', cwd = []) {
  // / is the virtual Linux root; home is /home/<username> in pwd only.
  const parts = input.startsWith('/') || input === '~' || input.startsWith('~/') ? [] : [...cwd];
  for (const part of input.replace(/^~(?=\/|$)/,'').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return parts;
}
export function getNode(root, path) {
  let node = root;
  for (const part of path) { if (node?.type !== 'dir') return null; node = node.children.get(part); }
  return node || null;
}
export function treeLines(node, prefix = '') {
  if (node.type !== 'dir') return [];
  const entries = [...node.children];
  return entries.flatMap(([name, child], index) => {
    const last = index === entries.length - 1;
    return [`${prefix}${last ? '└── ' : '├── '}${name}${child.type === 'dir' ? '/' : ''}`, ...treeLines(child, prefix + (last ? '    ' : '│   '))];
  });
}
export function tokenize(line) {
  const words = []; let word = '', quote = '', escaped = false, started = false;
  for (const char of line) {
    if (escaped) { word += char; escaped = false; started = true; }
    else if (char === '\\' && quote !== "'") { escaped = true; started = true; }
    else if (quote) { if (char === quote) quote = ''; else word += char; }
    else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) { if (started) words.push(word); word = ''; started = false; }
    else { word += char; started = true; }
  }
  if (quote || escaped) throw new Error('Unclosed quote or unfinished escape.');
  if (started) words.push(word);
  return words;
}

export function formatLocalTime(date = new Date()) {
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()];
  const time = [date.getHours(),date.getMinutes(),date.getSeconds()].map(value => String(value).padStart(2,'0')).join(':');
  return `${day} ${month} ${String(date.getDate()).padStart(2,' ')} ${time} ${date.getFullYear()}`;
}

export const COMMANDS = ['help','ls','cd','pwd','cat','tree','clear','history','whoami','open'];
export class TerminalEngine {
  constructor(data) { this.cwd = []; this.history = []; this.update(data); }
  update(data) { this.root = buildFilesystem(data); this.data = data; if (getNode(this.root,this.cwd)?.type !== 'dir') this.cwd = []; }
  get path() { return '~' + (this.cwd.length ? '/' + this.cwd.join('/') : ''); }
  normalize(path) {
    const home = `/home/${this.data.profile.username}`;
    if (path === home || path?.startsWith(home + '/')) path = '~' + path.slice(home.length);
    return resolvePath(path,this.cwd);
  }
  run(line) {
    if (!line.trim()) return {};
    this.history.push(line);
    try {
      const [command,...args] = tokenize(line);
      const single = () => { if (args.length > 1) throw new Error(`${command}: too many arguments`); };
      const find = path => { const node = getNode(this.root,this.normalize(path)); if (!node) throw new Error(`${command}: ${path}: No such file or directory`); return node; };
      switch (command) {
        case 'help': return {text:'Explore\n  ls [path]          List files and directories\n  cd [path]          Change directory (.., ~ supported)\n  pwd                Print current directory\n  cat <file> [...]   Read a file\n  tree [path]        Show the directory tree\n\nEntering a directory containing exactly one file automatically reads it.\n\nSession\n  whoami             About the current profile\n  history            Show command history\n  clear              Clear the terminal\n  open <link|file>   Show links from a file or directory\n  help               Show this guide\n\nTry: cat about.txt · cd education · cd research\nLinks: open github · open ~/contact.txt\nKeys: Tab complete · ↑/↓ history · Ctrl+L clear\n\nThis is a simulated terminal. No real shell commands run.'};
        case 'nvidia-smi': {
          if (args.length) throw new Error('nvidia-smi: this imaginary GPU needs no flags.');
          const gpuWidths = [40, 24, 22];
          const border = (widths, char = '-') => '+' + widths.map(width => char.repeat(width + 2)).join('+') + '+';
          const row = (widths, values) => '|' + widths.map((width, index) => ' ' + String(values[index] ?? '').padEnd(width) + ' ').join('|') + '|';
          const fullRow = text => row([92], [text]);
          const pair = (left, right, width) => left + right.padStart(width - left.length);
          const processWidths = [4, 3, 3, 6, 4, 47, 13];
          const processRow = (values, header = false) => fullRow(processWidths.map((width, index) => {
            const value = String(values[index] ?? '');
            return !header && [0,1,2,3,6].includes(index) ? value.padStart(width) : value.padEnd(width);
          }).join('  '));
          return {table:true,text:[
            formatLocalTime(),
            border([92]),
            fullRow('NVIDIA-SMI 9999.42          Driver Version: 9999.42          CUDA Version: 42.0'),
            border(gpuWidths),
            row(gpuWidths, [pair('GPU  Name','Persistence-M',40), pair('Bus-Id','Disp.A',24), 'Volatile Uncorr. ECC']),
            row(gpuWidths, [pair('Fan  Temp  Perf','Pwr:Usage/Cap',40), 'Memory-Usage'.padStart(24), 'GPU-Util  Compute M.']),
            row(gpuWidths, ['', '', 'MIG M.'.padStart(22)]),
            border(gpuWidths, '='),
            row(gpuWidths, [pair('0  NVIDIA RTX 9090 COSMIC Ti','On',40), '00000000:42:00.0     Off', '0'.padStart(22)]),
            row(gpuWidths, [pair('0%  -273C  P0','1.21GW / 2.00GW',40), '1 PiB / 8 PiB'.padStart(24), pair('100%','Default',22)]),
            row(gpuWidths, ['', '', 'N/A'.padStart(22)]),
            border(gpuWidths),
            '',
            border([92]),
            fullRow('Processes:'),
            processRow(['GPU','GI','CI','PID','Type','Process name','GPU Memory'], true),
            processRow(['','ID','ID','','','','Usage'], true),
            '|' + '='.repeat(94) + '|',
            processRow(['0','N/A','N/A','42','C','training_the_universe.py','768 TiB']),
            processRow(['0','N/A','N/A','404','C','finding_a_missing_semicolon.py','256 TiB']),
            border([92]),
            '',
            'ECC errors: 0 | Tensor cores: 16,777,216 | ETA: before the Big Bang',
            '[Simulated GPU. Powered by imagination, cooled by liquid spacetime.]'
          ].join('\n')};
        }
        case 'clear': single(); return {clear:true};
        case 'pwd': single(); return {text:`/home/${this.data.profile.username}${this.cwd.length ? '/' + this.cwd.join('/') : ''}`};
        case 'whoami': single(); return {text:`${this.data.profile.username}\n${this.data.profile.name}\n\n${this.data.profile.about}`};
        case 'history': single(); return {text:this.history.map((item,index) => `${String(index+1).padStart(4)}  ${item}`).join('\n')};
        case 'cd': {
          single();
          const path = this.normalize(args[0] || '~');
          const node = find(args[0] || '~');
          if (node.type !== 'dir') throw new Error(`cd: ${args[0]}: Not a directory`);
          this.cwd = path;
          const onlyChild = node.children.size === 1 ? node.children.values().next().value : null;
          return onlyChild?.type === 'file' ? {text:onlyChild.content,links:onlyChild.links} : {};
        }
        case 'ls': { single(); const node = find(args[0] || '.'); return {text:node.type === 'dir' ? [...node.children].map(([name,child]) => name + (child.type === 'dir' ? '/' : '')).join('\n') : args[0]}; }
        case 'tree': { single(); const node = find(args[0] || '.'); return {text:[args[0] || this.path,...treeLines(node)].join('\n')}; }
        case 'cat': {
          if (!args.length) throw new Error('Usage: cat <file> [...]');
          const results = args.map(path => { try { const node = find(path); if (node.type !== 'file') throw new Error(`cat: ${path}: Is a directory`); return {text:node.content,links:node.links}; } catch(error) { return {text:error.message,error:true}; } });
          return {results};
        }
        case 'open': {
          single(); if (!args.length) throw new Error('Usage: open <link name | URL | file | directory>');
          let links = [];
          const alias = [{name:'github',url:this.data.profile.github},{name:'email',url:this.data.profile.email ? `mailto:${this.data.profile.email}` : ''},...this.data.links].find(link => link.name === args[0]);
          if (alias?.url) links = [alias];
          else if (safeURL(args[0])) links = [{name:args[0],url:args[0]}];
          else { const collect = node => { links.push(...(node.links || [])); if (node.type === 'dir') for (const child of node.children.values()) collect(child); }; collect(find(args[0])); }
          return {text:links.length ? 'Choose a link to open:' : 'No links configured here yet.',links};
        }
        default: return {text:`${command}: command not found. Type "help" for available commands.`,error:true};
      }
    } catch(error) { return {text:error.message,error:true}; }
  }
  complete(line) {
    if (!line.includes(' ')) return COMMANDS.filter(command => command.startsWith(line));
    const split = line.lastIndexOf(' ') + 1, before = line.slice(0,split), token = line.slice(split);
    if (token === '~') return [before + '~/'];
    const slash = token.lastIndexOf('/') + 1, base = token.slice(0,slash), fragment = token.slice(slash);
    const node = getNode(this.root,this.normalize(base || '.'));
    const matches = node?.type === 'dir' ? [...node.children].filter(([name,child]) => name.startsWith(fragment) && (!line.startsWith('cd ') || child.type === 'dir')).map(([name,child]) => before + base + name + (child.type === 'dir' ? '/' : '')) : [];
    if (line.startsWith('open ') && !base) matches.push(...['github','email',...this.data.links.map(link => link.name)].filter(name => name.startsWith(fragment)).map(name => before+name));
    return [...new Set(matches)].sort();
  }
}
