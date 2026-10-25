import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const index = read('index.html');
const script = read('script.js');
const bookings = read('bookings.js');
const analytics = read('google-analytics.js');
const repair = read('repair-v96.4.56.css');
const styles = read('styles.css');

assert.match(repair, /max-height:calc\(100dvh - 28px\)/, 'mailing popup is viewport constrained');
assert.match(repair, /@media\(max-height:760px\)/, 'short laptop height receives compact spacing');
assert.doesNotMatch(analytics, /boot-analytics-settings\{position:fixed/, 'persistent cookie launcher is not fixed');
assert.match(analytics, /document\.querySelector\('footer'\)/, 'cookie launcher is placed in the footer');
assert.match(script, /desktop-explore-button/, 'converted desktop headers retain Explore');
assert.match(script, /id="menuButton"/, 'converted headers retain the mobile menu control');
assert.match(script, /window\.BOOT_SCOOTIN_HALLOWEEN_VIDEO_URL = ''/, 'video URL remains intentionally unset');
assert.match(index, /data-halloween-video-feature hidden/, 'homepage feature stays gated without an approved MP4');
assert.match(index, /controls playsinline preload="none"/, 'homepage player is manual, inline and deferred');
assert.doesNotMatch(index, /<video[^>]*autoplay/, 'homepage video never autoplays');
assert.match(bookings, /event-halloween-video/, 'Halloween event player is prepared');
assert.match(bookings, /BOOT_SCOOTIN_HALLOWEEN_VIDEO_URL/, 'event and homepage use the same media source');
assert.match(bookings, /4a5fe2de-52ab-44f5-a0c5-187cd58a13a2/, 'video is scoped to the existing Halloween event');
assert.match(styles, /aspect-ratio:9\/16/, 'both players preserve the portrait aspect ratio');
assert.match(styles, /object-fit:contain/, 'video artwork is not cropped');

console.log('PASS compact mailing popup, footer cookie settings, stable navigation and safely gated Halloween video surfaces');
