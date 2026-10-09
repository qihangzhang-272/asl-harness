import React,{useEffect} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft} from 'lucide-react';

// Draft owners share one guard for side navigation, window close and their own Back action.
export function useLeaveGuard(dirty,busy=false,inside='.editor-page, .canvas-menu') {
  const leave=action=>{if(!busy&&(!dirty||window.confirm('有未保存的修改，放弃？')))action();};
  useEffect(()=>{
    const refresh=event=>{if(dirty||busy)event.preventDefault();};
    document.addEventListener('asl:before-content-refresh',refresh);
    document.dispatchEvent(new Event('asl:editor-state'));
    const click=event=>{
      if(event.target.closest(inside)||event.target.closest('[data-confirm-discard]')||!event.target.closest('button,a,summary,[role="button"],[role="tab"]'))return;
      if(busy||!window.confirm('有未保存的修改，放弃？')){event.preventDefault();event.stopImmediatePropagation();}
    };
    const unload=event=>{event.preventDefault();event.returnValue='';};
    if(dirty||busy){document.addEventListener('click',click,true);document.addEventListener('contextmenu',click,true);window.addEventListener('beforeunload',unload);}
    return()=>{document.removeEventListener('asl:before-content-refresh',refresh);document.removeEventListener('click',click,true);document.removeEventListener('contextmenu',click,true);window.removeEventListener('beforeunload',unload);document.dispatchEvent(new Event('asl:editor-state'));};
  },[dirty,busy,inside]);
  return leave;
}

// Same form contract as a dialog, but placed in the main navigation surface.
export default function EditorPage({title,children,onClose}) {
  const target=document.getElementById('editor-page');
  if(!target)return null;
  return createPortal(<section className="editor-page">
    <header className="editor-page-heading"><button onClick={onClose}><ArrowLeft size={17}/>返回</button><h1>{title}</h1></header>
    {children}
  </section>,target);
}
