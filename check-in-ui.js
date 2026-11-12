/* Shared in-place check-in controls; no page reloads, customer emails or optimistic attendance. */
(()=>{
  function mount(root,{items,send,apply,onChange=()=>{},filterRows=null,context=()=>'',search=true,expected=null,checked=null}){
    const selected=new Set(),busy=new Set(),operations=new Map();let multi=false;
    const toolbar=document.createElement('div');toolbar.className='checkin-toolbar';
    toolbar.innerHTML=`${search?'<label>Find a person or booking<input type="search" data-checkin-search autocomplete="off"><select data-checkin-filter aria-label="Check-in state"><option value="">All attendees</option><option value="unchecked">Not checked in</option><option value="checked">Checked in</option></select></label>':''}<label class="checkin-mode"><input type="checkbox" data-checkin-mode> Select several people</label><span data-checkin-count aria-live="polite"></span><button type="button" data-checkin-submit disabled>Check in 0 people</button><button type="button" data-checkin-clear>Clear selection</button><p data-checkin-feedback role="status" aria-live="polite"></p>`;
    root.prepend(toolbar);const $=q=>toolbar.querySelector(q);
    function refresh(){
      const all=items(),map=new Map(all.map(x=>[x.id,x]));
      for(const id of selected)if(!map.get(id)?.eligible||map.get(id)?.checked)selected.delete(id);
      root.querySelectorAll('[data-checkin-pick]').forEach(box=>{const x=map.get(box.dataset.checkinPick);box.hidden=!multi;box.disabled=!x?.eligible||x.checked||busy.has(x.id);box.checked=selected.has(x?.id);});
      root.querySelectorAll('[data-checkin-single]').forEach(button=>{const x=map.get(button.dataset.checkinSingle);button.disabled=!x?.eligible||x.checked||busy.has(x.id);button.textContent=busy.has(x?.id)?'Checking in…':x?.checked?'✓ Checked in':'Check in';});
      $('[data-checkin-count]').textContent=`${selected.size} selected · ${checked?checked():all.filter(x=>x.checked).length} / ${expected?expected():all.filter(x=>x.eligible||x.checked).length} checked in`;
      $('[data-checkin-submit]').hidden=!multi;$('[data-checkin-clear]').hidden=!multi;
      $('[data-checkin-submit]').textContent=`Check in ${selected.size} ${selected.size===1?'person':'people'}`;
      $('[data-checkin-submit]').disabled=!selected.size||busy.size>0;
      $('[data-checkin-mode]').disabled=busy.size>0;onChange({busy:busy.size});
    }
    async function check(ids){
      const map=new Map(items().map(x=>[x.id,x]));ids=[...new Set(ids)].filter(id=>map.get(id)?.eligible&&!map.get(id)?.checked&&!busy.has(id));
      if(!ids.length)return;
      if(ids.length>25){$('[data-checkin-feedback]').textContent='Choose up to 25 people at a time.';return;}
      const session=context();if(!session){$('[data-checkin-feedback]').textContent='Choose a single event day before checking in several people.';return;}
      const key=session+':'+ids.slice().sort().join(',');if(!operations.has(key))operations.set(key,crypto.randomUUID());
      const position=()=>({x:window.scrollX,y:window.scrollY});
      const retain=point=>{if(point&&(window.scrollX!==point.x||window.scrollY!==point.y))window.scrollTo({left:point.x,top:point.y,behavior:'instant'});};
      const pendingPosition=position();let completedPosition=null;
      ids.forEach(id=>busy.add(id));refresh();$('[data-checkin-feedback]').textContent='Recording attendance…';retain(pendingPosition);
      try{
        const response=await send(ids,operations.get(key),session);
        if(!root.isConnected||context()!==session)return; // Navigation must never patch another register/day.
        completedPosition=position(); // Includes any scrolling while awaiting the server.
        const results=response.results||[];let succeeded=0;const errors=[];
        for(const id of ids){const result=results.find(x=>x.id===id);if(result?.ok&&!result.error){apply(id,result,session);selected.delete(id);succeeded++;}else{selected.add(id);errors.push(`${map.get(id)?.name||'Attendee'}: ${result?.error||'No confirmed result; retry safely.'}`);}}
        $('[data-checkin-feedback]').textContent=`${succeeded} checked in.${errors.length?' Still selected: '+errors.join(' '):''}`;
        if(!errors.length)operations.delete(key);
      }catch(error){if(root.isConnected&&context()===session){completedPosition=position();ids.forEach(id=>selected.add(id));$('[data-checkin-feedback]').textContent=`Check-in not confirmed. Selection kept; retry safely. ${error.message||''}`;}}
      // Preserve each synchronous update's current view, never a stale tap-time
      // position. This also neutralises browser anchoring when feedback appears.
      finally{ids.forEach(id=>busy.delete(id));if(root.isConnected&&context()===session){refresh();retain(completedPosition);}}
    }
    root.addEventListener('click',event=>{const button=event.target.closest('[data-checkin-single]');if(button&&root.contains(button))check([button.dataset.checkinSingle]);});
    root.addEventListener('change',event=>{const box=event.target.closest('[data-checkin-pick]');if(box){box.checked?selected.add(box.dataset.checkinPick):selected.delete(box.dataset.checkinPick);refresh();}});
    $('[data-checkin-mode]').addEventListener('change',event=>{multi=event.target.checked;refresh();});
    $('[data-checkin-clear]').addEventListener('click',()=>{selected.clear();refresh();});
    $('[data-checkin-submit]').addEventListener('click',()=>check([...selected]));
    const filter=()=>filterRows?.({query:$('[data-checkin-search]')?.value.trim().toLowerCase()||'',status:$('[data-checkin-filter]')?.value||''});
    $('[data-checkin-search]')?.addEventListener('input',filter);$('[data-checkin-filter]')?.addEventListener('change',filter);
    refresh();return {check,refresh,selected,busy};
  }
  globalThis.BootCheckIn={mount};
})();
