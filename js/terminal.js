import { TerminalEngine, validateData, safeURL } from './filesystem.js';

const input = document.querySelector('#command'), output = document.querySelector('#output'), body = document.querySelector('#terminal-body');
const prompt = document.querySelector('#prompt');
let engine, historyIndex = 0, draft = '';
function promptNodes(path) {
  const user = document.createElement('span'); user.className = 'prompt-user'; user.textContent = `${engine.data.profile.username}@homepage`;
  const directory = document.createElement('span'); directory.className = 'prompt-path'; directory.textContent = path;
  return [user,document.createTextNode(':'),directory,document.createTextNode('$')];
}
function refresh() {
  prompt.replaceChildren(...promptNodes(engine.path));
  document.querySelector('#window-title').textContent = `${engine.data.profile.username}@homepage: ${engine.path}`;
  document.querySelector('#location').textContent = engine.path;

  document.title = `${engine.data.profile.name} — Terminal`;
}
function renderResult(result,container) {
  if (result.results) { result.results.forEach(item => renderResult(item,container)); return; }
  if (result.text) { const text = document.createElement('pre'); text.className = 'result' + (result.table ? ' result-table' : '') + (result.error ? ' error' : ''); text.textContent = result.text; container.append(text); }
  for (const link of result.links || []) {
    const href = safeURL(link.url); if (!href) continue;
    const anchor = document.createElement('a'); anchor.className = 'output-link'; anchor.textContent = `${link.name} ↗  ${link.url}`; anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; container.append(anchor);
  }
}
function clear() { output.replaceChildren(); document.querySelector('#welcome').hidden = true; }
function execute(line) {
  if (!engine || !line.trim()) return;
  const entry = document.createElement('div'); entry.className = 'command-entry';
  const echo = document.createElement('div'); echo.className = 'echo'; echo.append(...promptNodes(engine.path),document.createTextNode(' '+line)); entry.append(echo);
  const result = engine.run(line);
  if (result.clear) clear(); else { renderResult(result,entry); output.append(entry); }
  // Limit DOM growth during long sessions; history remains available.
  while (output.children.length > 300) output.firstElementChild.remove();
  input.value = ''; historyIndex = engine.history.length; draft = ''; refresh();
  body.scrollTop = body.scrollHeight;
  input.focus({preventScroll:true});
}
document.querySelector('#command-form').addEventListener('submit',event => { event.preventDefault(); execute(input.value); });
input.addEventListener('keydown',event => {
  if (!engine || event.isComposing) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault(); if (historyIndex === engine.history.length) draft = input.value;
    historyIndex = Math.max(0,Math.min(engine.history.length,historyIndex+(event.key === 'ArrowUp' ? -1 : 1)));
    input.value = historyIndex === engine.history.length ? draft : engine.history[historyIndex];
    input.setSelectionRange(input.value.length,input.value.length);
  } else if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault(); const matches = engine.complete(input.value);
    if (matches.length === 1) input.value = matches[0];
    else if (matches.length > 1) {
      let common = matches[0]; while (!matches.every(match => match.startsWith(common))) common = common.slice(0,-1);
      if (common.length > input.value.length) input.value = common;
      const entry = document.createElement('div'); entry.className = 'command-entry'; renderResult({text:matches.join('    ')},entry); output.append(entry); body.scrollTop = body.scrollHeight;
    }
  }
});
document.addEventListener('keydown',event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'l' && engine) { event.preventDefault(); clear(); input.focus(); }
});
body.addEventListener('click',event => { if (event.target === body && !window.getSelection().toString()) input.focus(); });

async function init() {
  try {
    const response = await fetch(new URL('../data/site-data.json',import.meta.url),{cache:'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = validateData(await response.json());
    engine = new TerminalEngine(data);
    const education = data.education.map(item =>
      [item.school, item.degree, item.period].filter(Boolean).join(' | ') +
      (item.description ? `\n${item.description}` : '')
    ).join('\n\n');
    document.querySelector('#welcome').textContent =
      `Ubuntu / homepage (tty1)\nhomepage login: ${data.profile.username}\n\nWelcome to ${data.profile.name}'s homepage.\n\n` +
      (education ? `${education}\n\n` : '') +
      " * Type 'help' for available commands.\n";
    refresh(); input.disabled = false; document.querySelector('#session-status').textContent = 'local session';
    if (matchMedia('(pointer: fine)').matches) input.focus({preventScroll:true});
  } catch(error) {
    document.querySelector('#session-status').textContent = 'load failed';
    renderResult({text:`Unable to load site-data.json. ${error.message}\nServe this folder over HTTP (see README), check the JSON, then reload.`,error:true},output);
  }
}
init();
