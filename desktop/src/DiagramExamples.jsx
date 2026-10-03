import React,{useState} from 'react';
import MermaidEdit from './MermaidEdit.jsx';
import {diagramExamples} from './diagram-examples.mjs';

export default function DiagramExamples() {
  const [id,setId]=useState('flow'),[editing,setEditing]=useState(false),[draft,setDraft]=useState({});
  const example=diagramExamples.find(item=>item.id===id),source=draft[id]??example.source;
  return <section className="diagram-examples" aria-label="Mermaid 图示">
    <nav className="tabs" aria-label="图型">{diagramExamples.map(item=><button key={item.id} className={id===item.id?'active':''} onClick={()=>{setId(item.id);setEditing(false);}}>{item.title}</button>)}</nav>
    <MermaidEdit key={id} source={source} onChange={value=>setDraft(previous=>({...previous,[id]:value}))} onSource={()=>setEditing(true)}/>
    {editing&&<><button onClick={()=>setEditing(false)}>返回图示</button><textarea aria-label="图示原文" spellCheck={false} value={source} onChange={event=>setDraft(previous=>({...previous,[id]:event.target.value}))}/></>}
  </section>;
}
