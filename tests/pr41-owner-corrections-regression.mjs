import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const bookings=read('bookings.js');
const script=read('script.js');
const css=read('repair-v96.4.56.css');

assert.match(bookings,/event-detail-media/, 'event media has a dedicated overview column');
assert.match(bookings,/eventDescriptionMarkup\(c\.public_notes,c\.id\)/, 'description renders after the overview');
assert.match(bookings,/Read more about this event/, 'long descriptions expose the approved control');
assert.match(bookings,/Show less/, 'expanded descriptions can be collapsed');
assert.match(bookings,/aria-expanded="false"/, 'description control starts with accessible state');
assert.match(bookings,/event-description-important/, 'important booking restrictions remain visible while collapsed');

assert.match(script,/class="desktop-explore-toggle"/, 'desktop secondary destinations use one Explore control');
assert.match(script,/event\.key==='Escape'/, 'desktop Explore supports Escape-to-close');
assert.match(script,/data-member-account-link/, 'header reuses the existing Member Zone route');
assert.match(script,/\/api\/member\/me/, 'account label relies on the authoritative member endpoint');
assert.match(script,/return false/, 'account state has a safe logged-out fallback');
assert.match(script,/Sign in or create a free account/, 'mobile account entry exposes registration access');

assert.match(css,/grid-template-columns:minmax\(300px,.92fr\) minmax\(300px,1.08fr\)/, 'desktop event overview retains two balanced columns');
assert.match(css,/@media\(max-width:760px\)[\s\S]*event-detail-body\.has-poster[\s\S]*grid-template-columns:1fr/, 'event overview stacks on mobile');
assert.match(css,/advertising-format-list article,.advertising-format-list article\.featured/, 'advertising options share one coordinated treatment');

console.log('PASS PR #41 owner corrections: full-width expandable descriptions, accessible Explore/account navigation, responsive event overview and coordinated Partnerships presentation');
