import React,{useEffect,useRef,useState} from 'react';

// Layout preference only. No Skill/Mode data is stored in this component.
export default function PanelResize({name,side='right',initial=232,min=210,max=400}) {
  const handle=useRef(null),drag=useRef(null),[width,setWidth]=useState(initial);
  const key=`asl.panel-width.${name}`;
  const property=name==='navigation'?'--sidebar-width':'--skill-panel-width';
  const bound=value=>Math.round(Math.max(min,Math.min(max,window.innerWidth*.42,value)));
  const apply=value=>{const next=bound(value);handle.current.parentElement.style.setProperty(property,`${next}px`);handle.current.setAttribute('aria-valuenow',next);return next;};
  const save=value=>{const next=apply(value);setWidth(next);try{localStorage.setItem(key,String(next));}catch{};};
  useEffect(()=>{
    let saved=initial;try{const value=Number(localStorage.getItem(key));if(Number.isFinite(value)&&value>=min)saved=value;}catch{}
    setWidth(apply(saved));
    const resize=()=>apply(handle.current.parentElement.getBoundingClientRect().width);
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[]);
  return <div ref={handle} className={`panel-resize ${side}`} role="separator" tabIndex={0} aria-label={name==='navigation'?'调整导航栏宽度':'调整技能栏宽度'} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={width}
    onDoubleClick={()=>save(initial)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();const current=handle.current.parentElement.getBoundingClientRect().width;save(event.key==='Home'?initial:current+(event.key==='ArrowRight'?1:-1)*(side==='right'?1:-1)*20);}}}
    onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();drag.current={x:event.clientX,width:handle.current.parentElement.getBoundingClientRect().width};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(drag.current)apply(drag.current.width+(event.clientX-drag.current.x)*(side==='right'?1:-1));}}
    onPointerUp={event=>{if(!drag.current)return;save(drag.current.width+(event.clientX-drag.current.x)*(side==='right'?1:-1));drag.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}
    onPointerCancel={()=>{drag.current=null;}}/>;
}
