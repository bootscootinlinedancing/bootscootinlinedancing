import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const ranch=readFileSync(new URL('../ranch.js',import.meta.url),'utf8'),css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
for(const label of ['Verified SumUp revenue','Paid admissions','Complimentary admissions','Competition entries','Shared event capacity','Ticket inventory','Recent purchases','Action Required'])assert.match(ranch,new RegExp(label));
assert.match(ranch,/paymentProblems/);assert.match(ranch,/emailProblems/);assert.match(ranch,/href="#specialBookings"/);
assert.match(ranch,/item\.status!==['"]WITHDRAWN['"]/,'withdrawn competitors must not count as active');
assert.match(css,/@media\(max-width:520px\)/);assert.match(css,/minmax\(min\(100%,13rem\),1fr\)/);
console.log('Mobile Special Event health overview regression checks passed.');
