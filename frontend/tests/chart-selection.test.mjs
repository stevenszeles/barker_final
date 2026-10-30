import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSelection,dateRange,selectedDefinitions} from '../src/services/chart-selection.js';
const definitions=[{key:'__portfolio__'},{key:'__spx__'},{key:'a',accountName:'013'},{key:'b',accountName:'288'}];
test('clear all removes accounts, aggregate and benchmark in every view',()=>assert.deepEqual(selectedDefinitions(definitions,accountSelection(['013','288'],false)),[]));
test('select all accounts does not add an aggregate or benchmark silently',()=>assert.deepEqual(selectedDefinitions(definitions,accountSelection(['013','288'],true)).map(x=>x.key),['a','b']));
test('single selection has no automatic best/worst accounts',()=>assert.deepEqual(selectedDefinitions(definitions,{accounts:{'288':true}}).map(x=>x.key),['b']));
test('custom dates include boundaries and exclude outside values',()=>assert.deepEqual(dateRange([['2026-10-01',1],['2026-10-15',2],['2026-10-29',3]],'2026-10-15','2026-10-29'),[['2026-10-15',2],['2026-10-29',3]]));
test('inverted date ranges do not show an unrelated period',()=>assert.deepEqual(dateRange([['2026-10-15',2]],'2026-10-29','2026-10-01'),[]));
