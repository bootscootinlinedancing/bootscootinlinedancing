import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const migration=read('migrations/0027_halloween_promo_poster.sql');
const worker=read('_worker.js');
const bookings=read('bookings.js');
const ranch=read('ranch.js');
const homepage=read('index.html');
const script=read('script.js');
const css=read('styles.css')+read('repair-v96.4.56.css');

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'boot-halloween-promo-'));
const database=path.join(temporary,'rehearsal.sqlite');
execFileSync('sqlite3',[database,`CREATE TABLE classes(id TEXT PRIMARY KEY,title TEXT NOT NULL,poster_url TEXT); INSERT INTO classes VALUES('4a5fe2de-52ab-44f5-a0c5-187cd58a13a2','Halloween','/media/original.png');`]);
execFileSync('sqlite3',[database],{input:migration});
const result=execFileSync('sqlite3',[database,`SELECT poster_url||'|'||COALESCE(promo_poster_url,'NULL') FROM classes; PRAGMA integrity_check; PRAGMA foreign_key_check;`],{encoding:'utf8'}).trim().split(/\r?\n/);
assert(result[0]==='/media/original.png|NULL','migration must preserve the main poster and add a null promotional poster');
assert(result[1]==='ok','migration integrity check must pass');

assert(worker.includes('c.poster_url,c.promo_poster_url'),'public/admin class responses must expose both poster fields');
assert(worker.includes("hostname.endsWith('.pages.dev')")&&worker.includes('X-Preview-Data-Source'),'unbound Pages previews must proxy only the public production class feed');
assert(worker.includes('poster_url=?,promo_poster_url=?'),'HQ update must store posters independently');
assert(bookings.includes('event-detail-poster-gallery')&&bookings.includes('has-two-posters'),'event details must render the dual gallery');
assert(bookings.includes('target="_blank"')&&bookings.includes('Open ${esc(poster.label)} at full size'),'both posters must open at full size');
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))')&&css.includes('object-fit:contain'),'gallery must remain two-column and uncropped');
assert(ranch.includes('uploadClassPromoPosterIfNeeded')&&ranch.includes("placement','class-promo-poster"),'HQ must upload a separate promotional poster');
assert(homepage.includes('dead-or-dancing-golden-ticket.png')&&homepage.includes('Win 12 free line dancing classes — worth £72!'),'homepage must use the approved campaign artwork and copy');
assert(script.includes("timeZone:'Europe/London'")&&script.includes("londonDate() <= '2026-10-30'"),'campaign must stop after 30 October in London');
assert(script.includes("golden-ticket-popup-open"),'mailing and campaign popups must not overlap');
assert(homepage.includes('bookings.html?event=4a5fe2de-52ab-44f5-a0c5-187cd58a13a2'),'campaign links must target the existing event query parameter');
assert(bookings.includes("new URLSearchParams(location.search).get('event')")&&bookings.includes('openEventDetails(c)'),'event deep links must select and open the matching class');
assert(css.includes('.booking-arrival-card h2{max-width:12ch')&&css.includes('grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr)'),'arrival heading must remain bounded inside a responsive grid');
const deepLink=new URL('https://preview.example/bookings.html?event=4a5fe2de-52ab-44f5-a0c5-187cd58a13a2');
const fixtureClasses=[{id:'4a5fe2de-52ab-44f5-a0c5-187cd58a13a2',title:'Halloween Hoedown'}];
assert(fixtureClasses.find((entry)=>entry.id===deepLink.searchParams.get('event'))?.title==='Halloween Hoedown','representative preview fixture must resolve the Halloween deep link deterministically');

fs.rmSync(temporary,{recursive:true,force:true});
console.log('PASS additive poster migration, main-poster preservation, HQ separation, dual gallery, full-size links and campaign popup safeguards');
