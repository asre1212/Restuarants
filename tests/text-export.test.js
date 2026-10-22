import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readableNotebook} from '../core.js';

const row = (overrides={}) => ({name:'Café 東京 🍜',city:'New York',cuisine:'Japanese · Ramen',rating:4.3,notes:'Broth — 4.123/5.\r\nKeep exact score.\n\n"Great", tasty <script>not markup</script>',tags:['quiet','Visited'],michelinStars:2,address:'1 Test St\nFloor 2',url:'https://example.com/',latitude:0,longitude:0,...overrides});

test('readable export keeps exact saved scores, Unicode, multiline notes and all fields without mutations',()=>{
 const rows=[row()],notes={'["*","Japanese","Ramen"]':'Try next.\nBest broth 🍜'},before=JSON.stringify({rows,notes});
 const text=readableNotebook(rows,notes,'2026-10-22T11:00:00Z');
 for(const expected of ['Café 東京 🍜','New York','Japanese · Ramen','Overall rating: 4.3 / 5','Broth — 4.123/5.\n  Keep exact score.\n  \n  "Great", tasty <script>not markup</script>','Status: Visited','Michelin stars (saved): 2','1 Test St\n  Floor 2','https://example.com/','Coordinates: 0, 0','Tags:\n  quiet\n  Visited','City:\n  All cities','Category:\n  Japanese > Ramen','Try next.\n  Best broth 🍜'])assert.ok(text.includes(expected),expected);
 assert.equal(JSON.stringify({rows,notes}),before);
});

test('To try depends on absent rating; zero remains rated and Trash never leaks',()=>{
 const text=readableNotebook([row({name:'Zero',rating:0}),row({name:'Pending',rating:null}),row({name:'Legacy',rating:undefined}),row({name:'SECRET TRASH',notes:'SECRET NOTE',deletedAt:'2026-10-01'})],{});
 assert.ok(text.includes('Active restaurants: 3'));assert.ok(text.includes('Trash excluded: 1'));
 assert.equal(text.match(/Status: To try/g).length,2);assert.ok(text.includes('Overall rating: 0 / 5'));
 assert.equal(text.includes('SECRET'),false);
});

test('empty notebooks and legacy category notes have explicit, readable output',()=>{
 const empty=readableNotebook([],{});assert.ok(empty.includes('No active restaurants.'));assert.ok(empty.includes('No category notes.'));assert.equal(/undefined|null/.test(empty),false);
 const text=readableNotebook([{rating:null}],{'legacy category':'Old note','[]':'Empty path note','["NYC","French"]':'City-specific','["*","Empty"]':'   '});
 for(const expected of ['(Unnamed restaurant)','(Not specified)','Old note','Empty path note','City-specific'])assert.ok(text.includes(expected));
 assert.equal(text.includes('Category:\n  Empty\n'),false);
});

test('export sorts a copy by city, cuisine and name without dropping duplicate branches',()=>{
 const rows=[row({name:'Z',city:'Zurich'}),row({name:'B',city:'London'}),row({name:'A',city:'London'}),row({name:'A',city:'London',address:'Other branch'})];
 const original=rows.map(r=>r.name);const text=readableNotebook(rows,{});
 assert.deepEqual(rows.map(r=>r.name),original);assert.equal(text.match(/Name:\n  A\n/g).length,2);
 assert.ok(text.indexOf('Name:\n  A')<text.indexOf('Name:\n  B'));assert.ok(text.indexOf('Name:\n  B')<text.indexOf('Name:\n  Z'));
});
