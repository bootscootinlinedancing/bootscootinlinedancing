(()=>{
  const section=document.getElementById('homeFeaturedReviews'),grid=document.getElementById('homeFeaturedReviewGrid');
  if(!section||!grid)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const stars=value=>'★'.repeat(Math.max(0,Number(value)||0))+'☆'.repeat(Math.max(0,5-(Number(value)||0)));
  async function load(){
    try{
      const response=await fetch('/api/reviews?featured=1',{cache:'no-store',headers:{Accept:'application/json'}}),type=response.headers.get('content-type')||'';
      if(!response.ok||!type.includes('application/json'))return;
      const data=await response.json(),reviews=Array.isArray(data.reviews)?data.reviews.slice(0,3):[];
      if(!reviews.length)return;
      grid.innerHTML=reviews.map(review=>`<article class="home-featured-review-card"><p class="home-featured-review-stars" aria-label="${Number(review.rating)} out of 5 stars">${stars(review.rating)}</p><blockquote>“${esc(review.review_text)}”</blockquote><footer><strong>${esc(review.display_name||'Boot Scootin’ Dancer')}</strong>${review.verified_dancer?'<span class="verified-dancer"><svg aria-hidden="true" class="western-icon"><use href="western-icons.svg?v=96.4.83#boot"></use></svg>Verified Dancer</span>':''}<a class="home-review-more" href="reviews.html">Read full review</a></footer></article>`).join('');
      section.hidden=false;
    }catch(_){/* Keep this optional homepage section hidden if live reviews are unavailable. */}
  }
  load();
})();
