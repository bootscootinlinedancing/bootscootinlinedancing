import assert from 'node:assert/strict';
import {sundaySessionSelection,sundaySessionProducts} from '../_worker.js';

const price=(selection_code,adult_count,child_5_9_count,child_10_17_count,under_5_count=0)=>sundaySessionSelection({selection_code,adult_count,child_5_9_count,child_10_17_count,under_5_count});
assert.equal(price('INDIVIDUAL',1,0,0).calculated_amount_pence,600);
assert.equal(price('INDIVIDUAL',0,1,0).calculated_amount_pence,300);
assert.equal(price('INDIVIDUAL',0,0,1).calculated_amount_pence,400);
assert.deepEqual([price('FAMILY_1A1C',1,1,0).calculated_amount_pence,price('FAMILY_1A2C',1,2,0).calculated_amount_pence,price('FAMILY_2A1C',2,1,0).calculated_amount_pence,price('FAMILY_2A2C',2,2,0).calculated_amount_pence],[800,1000,1300,1500]);
assert.equal(price('FAMILY_2A2C',2,0,2,1).calculated_amount_pence,1700);
assert.equal(price('FAMILY_2A2C',2,0,2,1).total_people,5,'free under-5 must consume capacity');
assert.throws(()=>price('FAMILY_1A1C',1,2,0),/does not match/);
assert.throws(()=>price('INDIVIDUAL',0,0,0,2),/paid attendee/);
assert.throws(()=>price('INDIVIDUAL',10,0,0,1),/between 1 and 10/);
assert.equal(sundaySessionProducts().length,5);
assert.ok(sundaySessionProducts().every(product=>product.class_pass_eligible===false));
console.log('Sunday Sessions pricing/composition fixtures passed');
