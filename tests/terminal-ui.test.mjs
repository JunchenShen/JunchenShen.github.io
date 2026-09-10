// Dependency-free DOM adapter for terminal input and startup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const initial = JSON.parse(await readFile(new URL('../data/site-data.json',import.meta.url)));
class Element {
  constructor(tag='div') { this.tagName=tag; this.children=[]; this.dataset={}; this.handlers={}; this.value=''; }
  append(...items) { for(const item of items) { item.parent=this; this.children.push(item); } }
  replaceChildren(...items) { this.children=[]; this.append(...items); }
  remove() { this.parent.children=this.parent.children.filter(item=>item!==this); }
  addEventListener(name,handler) { this.handlers[name]=handler; }
  async emit(name) { return this.handlers[name]?.({preventDefault(){}}); }
  click() { this.emit('click'); }
  querySelectorAll() { return this.children.flatMap(child=>[...(child.dataset.key?[child]:[]),...child.querySelectorAll()]); }
  reportValidity() { return true; }
  showModal() { this.open=true; }
  close() { this.open=false; this.emit('close'); }
  focus() {}
  setSelectionRange() {}
}
test('terminal input, history draft restoration, Tab, Ctrl+L and published education',async () => {
  const ids=['command','output','terminal-body','prompt','window-title','location','welcome','command-form','session-status'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const documentHandlers={};
  globalThis.document={querySelector:selector=>elements[selector.slice(1)],querySelectorAll:()=>[],createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element(),{textContent:text}),addEventListener:(name,handler)=>documentHandlers[name]=handler,body:new Element()};
  globalThis.localStorage={getItem(){throw new Error('Storage must not be read');},setItem(){throw new Error('Storage must not be written');}};
  globalThis.matchMedia=()=>({matches:false});
  globalThis.window={getSelection:()=>({toString:()=>''})};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(initial)});
  try {
    await import('../js/terminal.js');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(elements.command.disabled,false);
    assert.ok(elements.welcome.textContent.includes(initial.profile.name));
    for (const entry of initial.education) {
      for (const value of Object.values(entry)) assert.ok(elements.welcome.textContent.includes(value));
    }
    assert.doesNotMatch(elements.welcome.textContent,/Type 'edit'/);
    const submit=async line=>{elements.command.value=line;await elements['command-form'].emit('submit');};
    const key=value=>elements.command.handlers.keydown({key:value,preventDefault(){}});
    await submit('cd education');
    const educationOutput = elements.output.children.at(-1).children.at(-1).textContent;
    for (const entry of initial.education) assert.ok(educationOutput.includes(entry.school));
    assert.equal(elements.location.textContent,'~/education');
    await submit('cd ~');
    await submit('ls'); await submit('pwd');
    elements.command.value='unfinished draft'; key('ArrowUp'); assert.equal(elements.command.value,'pwd');
    key('ArrowUp'); assert.equal(elements.command.value,'ls');
    key('ArrowDown'); key('ArrowDown'); assert.equal(elements.command.value,'unfinished draft');
    elements.command.value='he';key('Tab');assert.equal(elements.command.value,'help');
    elements.command.value='cd pro';key('Tab');assert.equal(elements.command.value,'cd projects/');
    await submit(elements.command.value);assert.equal(elements.location.textContent,'~/projects');
    elements.command.value='keep this';
    documentHandlers.keydown({ctrlKey:true,key:'l',preventDefault(){}});
    assert.equal(elements.output.children.length,0);assert.equal(elements.command.value,'keep this');assert.equal(elements.welcome.hidden,true);
    key('ArrowUp');assert.equal(elements.command.value,'cd projects/');
    await submit('clear');assert.equal(elements.output.children.length,0);
  } finally { globalThis.fetch=originalFetch; }
});
