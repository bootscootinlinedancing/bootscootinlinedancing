import {reply,enabled,safeError} from './event-management.js';
export async function registerData(env,eventId,scope='weekend'){
 if(!['saturday','sunday','weekend'].includes(scope))throw Error('INVALID_INPUT');
 const event=await env.BOOKINGS_DB.prepare(`SELECT id,title,venue_name FROM special_events WHERE id=?`).bind(eventId).first();if(!event)throw Error('NOT_FOUND');
 const dates={saturday:'2027-02-20',sunday:'2027-02-21'};
 // Explicit SELECT list is the privacy boundary. Never SELECT a.*, b.*, or include credentials.
 const raw=(await env.BOOKINGS_DB.prepare(`SELECT a.id AS grouping_id,a.name,b.reference,b.product_name_snapshot AS product,p.code,p.description AS entitlement,p.includes_saturday_evening,p.is_junior,d.event_date,d.label,x.attended_at IS NOT NULL AS checked_in
 FROM event_effective_attendees a JOIN special_event_bookings b ON b.id=a.booking_id
 JOIN special_event_ticket_products p ON p.id=b.product_id JOIN special_event_attendance x ON x.attendee_id=a.id
 JOIN special_event_days d ON d.id=x.day_id JOIN event_effective_booking_days bd ON bd.booking_id=b.id AND bd.day_id=d.id
 WHERE b.event_id=? AND b.status='PAID' AND p.product_type='ADMISSION' AND bd.places>0 AND (?='weekend' OR d.event_date=?)
 ORDER BY a.name COLLATE NOCASE,b.reference,a.id,d.event_date`).bind(eventId,scope,dates[scope]||'').all()).results||[];
 const mapped=new Map();
 for(const row of raw){let attendee=mapped.get(row.grouping_id);if(!attendee){attendee={name:row.name,reference:row.reference,product:row.product,entitlement:row.entitlement||row.product,sessions:[]};mapped.set(row.grouping_id,attendee)}attendee.sessions.push({date:row.event_date,label:row.code==='SATURDAY_SOCIAL'?'Saturday evening social':`${row.label}${row.is_junior&&row.event_date==='2027-02-20'?' (under 18; leave by 8:30 pm)':''}${row.includes_saturday_evening&&row.event_date==='2027-02-20'?' + evening':''}`,checked_in:!!row.checked_in})}
 const attendees=[...mapped.values()],totals={expected:attendees.length,by_day:[]};
 for(const date of [...new Set(raw.map(r=>r.event_date))].sort()){const entries=attendees.flatMap(a=>a.sessions.filter(s=>s.date===date));totals.by_day.push({date,expected:entries.length,checked_in:entries.filter(s=>s.checked_in).length})}
 return {event:{title:event.title,venue:event.venue_name},scope,generated_at:new Date().toISOString(),attendees,totals};
}
export async function adminRegister(request,env,admin){
 if(!enabled(env,'EVENT_REGISTERS_ENABLED'))return reply({error:'NOT_AVAILABLE'},404);
 if(String(admin.email||'').toLowerCase()!==String(env.ADMIN_EMAIL||'').toLowerCase())return reply({error:'OWNER_REQUIRED'},403);
 if(request.method!=='GET')return reply({error:'GET_ONLY'},405);
 try{const u=new URL(request.url);return reply(await registerData(env,u.searchParams.get('event_id')||'special-event-johnny-rossato-2027',u.searchParams.get('scope')||'weekend'))}catch(error){return safeError(error)}
}
