import {useLayoutEffect,useState} from 'react';

// Reading position only; never cache draft text, secrets or business content here.
function read(key,fallback){try{return JSON.parse(localStorage.getItem(`asl.view.${key}`))??fallback;}catch{return fallback;}}
function write(key,value){try{localStorage.setItem(`asl.view.${key}`,JSON.stringify(value));}catch{}}
export function useViewState(key,fallback){
  const [state,setState]=useState(()=>({key,value:read(key,fallback)}));
  const value=state.key===key?state.value:read(key,fallback);
  if(state.key!==key)setState({key,value});
  return [value,next=>setState(previous=>{
    const value=typeof next==='function'?next(previous.key===key?previous.value:read(key,fallback)):next;
    write(key,value);return {key,value};
  })];
}
export function useScrollMemory(key,ref,ready=true){
  useLayoutEffect(()=>{
    let element=ref.current;if(!element||!ready)return;
    if(!['auto','scroll'].includes(getComputedStyle(element).overflowY)){
      element=element.parentElement;
      while(element&&!['auto','scroll'].includes(getComputedStyle(element).overflowY))element=element.parentElement;
      if(!element)return;
    }
    element.scrollTop=Number(read(`scroll.${key}`,0))||0;
    const save=()=>write(`scroll.${key}`,element.scrollTop);
    element.addEventListener('scroll',save,{passive:true});
    return()=>{save();element.removeEventListener('scroll',save);};
  },[key,ref,ready]);
}
