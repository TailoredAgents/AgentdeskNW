import test from 'node:test';
import assert from 'node:assert/strict';
import {autoTopUpDollars,autoTopUpAmounts} from '../../src/lib/auto-topup-contracts';
test('automatic purchase dollar inputs stay integer cents and preserve a zero cap',()=>{assert.equal(autoTopUpDollars('3.01'),301);assert.equal(autoTopUpDollars('0'),0);assert.equal(autoTopUpDollars('1000.00'),100000);assert.deepEqual(autoTopUpAmounts,[1000,2500,5000,10000]);});
test('automatic purchase inputs reject ambiguous, negative and excessive money',()=>{for(const value of ['','3.001','1,000','$25','-1','Infinity','1e3','1000.01'])assert.throws(()=>autoTopUpDollars(value));});
