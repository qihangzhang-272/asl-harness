import {flushSync} from 'react-dom';

let current;
// Keep the navigation frame still; only the changing content participates.
export function navigate(update) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {update();return;}
  current?.skipTransition();
  current=document.startViewTransition(()=>flushSync(update));
  current.finished.catch(()=>{});
}
