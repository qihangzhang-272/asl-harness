import React,{useEffect} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft} from 'lucide-react';

// Draft owners share one guard for side navigation, window close and their own Back action.
export function useLeaveGuard(dirty,busy=false,inside='.editor-page, .canvas-menu') {
  const leave=action=>{if(!busy&&(!dirty||window.confirm('有未保存的修改，放弃？')))action();};
  useEffect(()=>{
    if(!dirty)return;
    const click=event=>{
      if(event.target.closest(inside))return;
      if(busy||!window.confirm('有未保存的修改，放弃？')){event.preventDefault();event.stopImmediatePropagation();}
    };
    const unload=event=>{event.preventDefault();event.returnValue='';};
    document.addEventListener('click',click,true);window.addEventListener('beforeunload',unload);
    return()=>{document.removeEventListener('click',click,true);window.removeEventListener('beforeunload',unload);};
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
