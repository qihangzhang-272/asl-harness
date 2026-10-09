import React,{useLayoutEffect,useRef,useState} from 'react';

// Layout preference only. No Skill/Mode data is stored in this component.
export default function PanelResize({name,label='调整导航栏宽度',side='right',initial=232,min=180,max=400}) {
  const handle=useRef(null),drag=useRef(null),preferred=useRef(initial),[width,setWidth]=useState(initial);
  const key=`asl.panel-width.${name}`;
  function apply(value){
    const panel=handle.current.parentElement,available=panel.parentElement.clientWidth;
    if(!available)return;
    const upper=Math.max(0,Math.min(max,available*.42,available-300)),lower=Math.min(min,upper);
    const next=Math.round(Math.max(lower,Math.min(upper,value)));
    panel.style.setProperty('--panel-width',`${next}px`);
    handle.current.setAttribute('aria-valuemin',Math.ceil(lower));handle.current.setAttribute('aria-valuemax',Math.floor(upper));
    setWidth(next);return next;
  }
  const save=value=>{preferred.current=Math.max(min,Math.min(max,value));apply(preferred.current);try{localStorage.setItem(key,String(preferred.current));}catch{}};
  function finish(commit=false){
    const start=drag.current;if(!start)return;
    drag.current=null;delete handle.current.parentElement.dataset.resizing;
    if(commit)save(handle.current.parentElement.getBoundingClientRect().width);else apply(preferred.current);
    if(handle.current.hasPointerCapture(start.id))handle.current.releasePointerCapture(start.id);
  }
  useLayoutEffect(()=>{
    let saved=initial;try{const value=Number(localStorage.getItem(key));if(Number.isFinite(value)&&value>=min)saved=value;}catch{}
    preferred.current=Math.min(max,saved);apply(preferred.current);
    const observer=new ResizeObserver(()=>{if(!drag.current)apply(preferred.current);});
    observer.observe(handle.current.parentElement.parentElement);
    const cancel=()=>finish();window.addEventListener('blur',cancel);
    return()=>{observer.disconnect();window.removeEventListener('blur',cancel);};
  },[]);
  return <div ref={handle} className={`panel-resize ${side}`} role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuenow={width}
    onDoubleClick={()=>save(initial)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();const current=handle.current.parentElement.getBoundingClientRect().width;save(event.key==='Home'?initial:current+(event.key==='ArrowRight'?1:-1)*(side==='right'?1:-1)*20);}}}
    onPointerDown={event=>{if(event.button!==0||drag.current)return;event.preventDefault();drag.current={id:event.pointerId,x:event.clientX,width:handle.current.parentElement.getBoundingClientRect().width};handle.current.parentElement.dataset.resizing='';event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(drag.current?.id===event.pointerId)apply(drag.current.width+(event.clientX-drag.current.x)*(side==='right'?1:-1));}}
    onPointerUp={event=>{if(drag.current?.id===event.pointerId)finish(true);}} onPointerCancel={event=>{if(drag.current?.id===event.pointerId)finish();}} onLostPointerCapture={event=>{if(drag.current?.id===event.pointerId)finish();}}/>;
}
