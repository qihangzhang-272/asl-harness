import {useSyncExternalStore} from 'react';

export function readTheme(doc,media){
  if(doc.documentElement.hasAttribute('data-ds-theme-source'))return doc.body.hasAttribute('data-ds-dark-theme')?'dark':'light';
  return media.matches?'dark':'light';
}
function snapshot(){return readTheme(document,window.matchMedia('(prefers-color-scheme: dark)'));}
function subscribe(notify){
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  const observer=new MutationObserver(notify);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-ds-theme-source']});
  observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});
  media.addEventListener('change',notify);
  return()=>{observer.disconnect();media.removeEventListener('change',notify);};
}
export function useTheme(){return useSyncExternalStore(subscribe,snapshot);}
