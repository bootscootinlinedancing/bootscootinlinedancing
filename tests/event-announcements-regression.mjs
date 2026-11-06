import assert from 'node:assert/strict';
import fs from 'node:fs';
import {announcementIsVisible,londonCalendarDate} from '../_worker.js';

const visible=(starts,status='open',extra={})=>({enabled:1,featured:1,class_status:status,class_starts_at:starts,starts_at:null,expires_at:null,...extra});

assert.equal(announcementIsVisible(visible('2026-10-30T19:00:00.000Z'),new Date('2026-11-01T12:00:00.000Z')),false,'Halloween must be absent on 1 November');
assert.equal(announcementIsVisible(visible('2026-11-06T19:00:00.000Z'),new Date('2026-11-06T23:30:00.000Z')),true,'Anniversary stays visible on 6 November');
assert.equal(announcementIsVisible(visible('2026-11-06T19:00:00.000Z'),new Date('2026-11-07T00:01:00.000Z')),false,'Anniversary disappears on 7 November');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z'),new Date('2026-11-29T22:00:00.000Z')),true,'Sunday Sessions stays visible through 29 November');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z'),new Date('2026-11-30T00:01:00.000Z')),false,'Sunday Sessions disappears on 30 November');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z','draft'),new Date('2026-11-20T12:00:00.000Z')),false,'Draft events are hidden');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z','cancelled'),new Date('2026-11-20T12:00:00.000Z')),false,'Cancelled events are hidden');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z','open',{enabled:0}),new Date('2026-11-20T12:00:00.000Z')),false,'Disabled announcements are hidden');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z','open',{featured:0}),new Date('2026-11-20T12:00:00.000Z')),false,'Unfeatured events are hidden');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z','open',{starts_at:'2026-11-21T00:00:00.000Z'}),new Date('2026-11-20T12:00:00.000Z')),false,'Future announcement starts are respected');
assert.equal(announcementIsVisible(visible('2026-11-29T15:00:00.000Z','open',{expires_at:'2026-11-20T12:00:00.000Z'}),new Date('2026-11-20T12:00:00.000Z')),false,'Explicit expiry is exclusive');
assert.equal(londonCalendarDate('2026-10-25T00:30:00.000Z'),'2026-10-25','DST transition uses Europe/London date');

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
const ticker=index.match(/<aside class="home-promo-strip"[\s\S]*?<\/aside>/)?.[0]||'';
assert.doesNotMatch(ticker,/Halloween Hoedown|Anniversary Party/,'event announcements must not remain hardcoded in the strip');
assert.match(script,/cache:'no-store'/,'announcement fetch must bypass browser cache');
assert.match(script,/data-promo-group/,'the existing ticker groups must be populated without redesigning the strip');

console.log('PASS dynamic event announcement expiry, publication gating, DST, cache and ticker preservation');
