// Optional browser QA: serve this checkout on localhost, generate the synthetic fixture using
// CHRISTMAS_EVIDENCE=<directory> node tests/christmas-hoedown-regression.mjs, then run with
// CHRISTMAS_CALENDAR_FIXTURE=<directory>/synthetic-calendar.json and Playwright available.
import assert from 'node:assert/strict';import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=JSON.parse(readFileSync(process.env.CHRISTMAS_CALENDAR_FIXTURE,'utf8')),base=process.env.CHRISTMAS_BASE_URL||'http://127.0.0.1:8837';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Browser QA must use localhost, never production');
const browser=await chromium.launch({channel:'chrome',headless:true}),out=process.env.CHRISTMAS_BROWSER_OUTPUT||'/private/tmp/bs-christmas-browser';mkdirSync(out,{recursive:true});const results=[];
try{for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height}});let submissions=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
  if(url.origin!==new URL(base).origin)return route.fulfill({status:204,body:''});
  if(url.pathname==='/api/classes')return route.fulfill({json:fixture});
  if(url.pathname==='/api/class-reservations'){submissions.push(request.postDataJSON());return route.fulfill({status:201,json:{ok:true,checkout_url:base+'/synthetic-provider'}})}
  if(url.pathname==='/synthetic-provider')return route.fulfill({contentType:'text/html',body:'<h1>Synthetic checkout only — no payment created</h1>'});
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:{announcements:[],logged_in:false,can_use_credit:false}});
  return route.continue();
 });
 await page.goto(base+'/bookings.html');await page.locator('.class-card').waitFor();assert.equal(await page.locator('.class-card').count(),1);assert((await page.locator('.class-card').innerText()).includes('£8'));assert((await page.locator('.class-card').innerText()).includes('one hour of tuition'));
 await page.screenshot({path:`${out}/${label}-calendar.png`,fullPage:true});
 await page.locator('.view-event').click();await page.locator('#eventDetailsDialog').waitFor({state:'visible'});assert((await page.locator('#eventDetailsContent').innerText()).includes('Bradley Rivers'));assert((await page.locator('#eventDetailsContent').innerText()).includes('ONE MONTH'));const flyer=page.locator('.event-detail-poster');assert((await flyer.getAttribute('src')).includes('christmas-hoedown-18-december-2026.png'));await flyer.evaluate(img=>img.decode());
 await page.screenshot({path:`${out}/${label}-details.png`});await page.locator('.event-detail-actions .event-book').click();await page.locator('#bookingDialog').waitFor({state:'visible'});
 assert.equal(await page.locator('.ticket-product-card').count(),1);assert((await page.locator('#selectedClassMeta').innerText()).includes('£8'));assert((await page.locator('#selectedClassMeta').innerText()).includes('7:30–8:30'));assert(await page.locator('#promoBox').isHidden());assert(await page.locator('#classCreditOption').isHidden());
 const bounds=await page.locator('#bookingDialog').boundingBox();assert(bounds.width<=width,'No horizontal overflow on booking dialog');await page.screenshot({path:`${out}/${label}-booking.png`});
 const form=page.locator('#bookingForm');await form.locator('[name="name"]').fill('Synthetic Christmas Guest');await form.locator('[name="email"]').fill('synthetic@example.test');await form.locator('[name="quantity"]').selectOption('2');
 await form.locator('[name="terms"]').check();const guestName=form.locator('[name$="[name]"]');if(await guestName.count())await guestName.first().fill('Synthetic Christmas Friend');await page.locator('#bookingSubmit').click();await page.waitForURL('**/synthetic-provider');assert.equal(submissions.length,1);assert.equal(submissions[0].ticket_product_code,'CLASS_SOCIAL');assert.equal(Number(submissions[0].quantity),2);assert(!submissions[0].promo_code);assert.equal(errors.length,0,errors.join('\n'));
 results.push({viewport:label,width,height,calendar:true,original_flyer:true,ticket_options:1,price_pence:800,synthetic_submit:true,page_errors:errors});await page.close();
}writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS desktop and 390px Chromium calendar/details/£8-only booking popup and synthetic checkout submission; all external network requests blocked. Not an iPhone Safari test.');}finally{await browser.close()}
