// Self-hosted pinned libraries; no customer data is sent to a PDF service.
export async function createRegisterPDF(data,{PDFLib,fontkit,fontBytes,orientation='portrait'}={}){
 if(!['portrait','landscape'].includes(orientation))throw Error('Choose A4 portrait or landscape.');
 const doc=await PDFLib.PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});
 const supported=new Set(font.getCharacterSet());
 const clean=value=>{const text=String(value??'').normalize('NFC');for(const ch of text)if(ch!=='\n'&&ch!=='\r'&&!supported.has(ch.codePointAt(0)))throw Error('This register contains characters outside the bundled PDF font. Use Print to preserve the complete names.');return text};
 const [width,height]=orientation==='landscape'?[841.89,595.28]:[595.28,841.89],margin=30,usable=width-margin*2;
 const columns=orientation==='landscape'?[165,110,125,170,75,usable-645]:[112,86,95,113,54,usable-460];
 const wrap=(value,width,size=9)=>{const lines=[];for(const paragraph of clean(value).split(/\r?\n/)){let line='';for(const word of paragraph.split(/\s+/)){const candidate=line?line+' '+word:word;if(font.widthOfTextAtSize(candidate,size)<=width){line=candidate;continue}if(line){lines.push(line);line=''}for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width&&line){lines.push(line);line=char}else line+=char}}lines.push(line)}return lines};
 const label=data.scope==='weekend'?'Full weekend':data.scope==='saturday'?'Saturday 20 February 2027':'Sunday 21 February 2027';
 const generated=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(data.generated_at));
 let page,y,pageNumber=0;
 const draw=(value,x,at,size=9)=>page.drawText(clean(value),{x,y:at,size,font,color:PDFLib.rgb(.1,.1,.1)});
 function newPage(){page=doc.addPage([width,height]);pageNumber++;y=height-margin;draw('BOOT SCOOTIN’ · CHECK-IN REGISTER',margin,y,14);y-=23;draw(`${label} · ${data.event.venue}`,margin,y,11);y-=18;draw(`Johnny Rossato’s UK Debut · 20–21 February 2027`,margin,y,10);y-=17;draw(`Expected: ${data.totals.expected} · Generated: ${generated} (London)`,margin,y,9);y-=16;draw(data.totals.by_day.map(d=>`${d.date}: ${d.checked_in}/${d.expected} checked in`).join('   '),margin,y,9);y-=25;let x=margin;for(const [i,head] of ['Attendee','Booking ref','Ticket / pass','Valid admission','Check-in','Manual notes'].entries()){draw(head,x+5,y,8);x+=columns[i]}y-=10;page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:1,color:PDFLib.rgb(.4,.4,.4)});draw(`Private venue register · Page ${pageNumber} · Keep securely and dispose of securely after use.`,margin,16,8)}
 newPage();
 for(const attendee of data.attendees){
 const values=[attendee.name,attendee.reference,attendee.product,attendee.sessions.map(s=>s.label).join('\n'),'',''];const lines=values.map((v,i)=>wrap(v,columns[i]-10)),rowHeight=Math.max(38,...lines.map(l=>l.length*12+12),attendee.sessions.length*16+12);
 if(rowHeight>height-190)throw Error('An unusually long register entry requires manual print review.');if(y-rowHeight<40)newPage();
 let x=margin;for(let i=0;i<6;i++){for(const [j,line] of lines[i].entries())draw(line,x+5,y-15-j*12);if(i===4){for(const [j,session] of attendee.sessions.entries()){const at=y-18-j*16;page.drawRectangle({x:x+5,y:at,width:8,height:8,borderWidth:.7,borderColor:PDFLib.rgb(.2,.2,.2)});if(session.checked_in){page.drawLine({start:{x:x+6,y:at+4},end:{x:x+8,y:at+2},thickness:1});page.drawLine({start:{x:x+8,y:at+2},end:{x:x+12,y:at+7},thickness:1})}draw(session.date==='2027-02-20'?'Sat':'Sun',x+17,at,7)}}if(i===5){page.drawLine({start:{x:x+5,y:y-rowHeight+12},end:{x:x+columns[i]-5,y:y-rowHeight+12},thickness:.3,color:PDFLib.rgb(.7,.7,.7)})}x+=columns[i]}
 y-=rowHeight;page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:.4,color:PDFLib.rgb(.7,.7,.7)});
 }
 if(!data.attendees.length)draw('No valid paid admissions for this register.',margin,y-22);
 doc.setTitle(`Johnny Rossato check-in register · ${label}`);doc.setCreator('Boot Scootin’ Admin HQ');return doc.save();
}
