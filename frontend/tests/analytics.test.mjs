import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustKnownCashFlows,sectorWeights} from '../src/services/analytics.js';
test('deposit is not investment profit',()=>assert.equal(adjustKnownCashFlows([['2026-10-27',100],['2026-10-28',110]],[{date:'2026-10-28',amount:10}])[1].twr,1));
test('withdrawal is not an investment loss',()=>assert.equal(adjustKnownCashFlows([['2026-10-27',100],['2026-10-28',90]],[{date:'2026-10-28',amount:-10}])[1].twr,1));
test('internal journal cancels in aggregate',()=>assert.equal(adjustKnownCashFlows([['2026-10-27',200],['2026-10-28',200]],[{date:'2026-10-28',amount:10},{date:'2026-10-28',amount:-10}])[1].twr,1));
test('cash-neutral invested weight is distinct from active weight',()=>assert.deepEqual(sectorWeights(40,100,80,50),{actualWeight:40,activeWeight:-10,investedWeight:50}));
test('short exposure is not labeled a long overweight',()=>assert.equal(sectorWeights(-10,100,80,5).activeWeight,-15));
