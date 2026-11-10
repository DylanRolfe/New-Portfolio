// Keep the painted sky on one phase as the site navigates between documents.
const storageKey='dylan-campsite-sky-clock';
let origin=Date.now();
try {
  const stored=Number(sessionStorage.getItem(storageKey));
  if(Number.isFinite(stored)&&stored>0) origin=stored;
  else sessionStorage.setItem(storageKey,String(origin));
} catch { /* Fall back to a page-local clock when storage is unavailable. */ }

let hiddenAt=document.hidden?Date.now():0;
let hiddenDuration=0;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {
    if(!hiddenAt) hiddenAt=Date.now();
  } else if(hiddenAt) {
    hiddenDuration+=Date.now()-hiddenAt;
    hiddenAt=0;
  }
});

export function skyTime() {
  const now=hiddenAt||Date.now();
  return Math.max(0,(now-origin-hiddenDuration)/1000);
}
