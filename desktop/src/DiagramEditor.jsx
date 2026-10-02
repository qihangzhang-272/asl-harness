import React,{useEffect,useState} from 'react';
import EditorPage from './EditorPage.jsx';
import Markdown from './Markdown.jsx';
import MermaidEdit from './MermaidEdit.jsx';
import SkillFiles,{SkillPanel} from './SkillFiles.jsx';
import {diagramsIn,replaceDiagram} from './mermaid-document.mjs';
import {modeDiagramDocument,skillNodes} from './mode-diagrams.mjs';

export default function DiagramEditor({mode,skills,onSave,onClose,readFile,saveFile,initialTitle=''}) {
  const [document,setDocument]=useState(()=>modeDiagramDocument(mode,skills));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [sourceView,setSourceView]=useState(true),[index,setIndex]=useState(()=>Math.max(0,diagramsIn(document).findIndex(d=>d.title===initialTitle))),[selected,setSelected]=useState(null);
  const diagrams=diagramsIn(document),currentIndex=Math.min(index,Math.max(0,diagrams.length-1)),diagram=diagrams[currentIndex];
  useEffect(()=>{
    if(document===mode.document)return;
    const guard=event=>{
      if(event.target.closest('.editor-page'))return;
      if(busy||!window.confirm('架构图有未保存的修改，放弃吗？')){event.preventDefault();event.stopImmediatePropagation();}
    };
    const unload=event=>{event.preventDefault();event.returnValue='';};
    window.document.addEventListener('click',guard,true);window.addEventListener('beforeunload',unload);
    return()=>{window.document.removeEventListener('click',guard,true);window.removeEventListener('beforeunload',unload);};
  },[document,mode.document,busy]);
  const nodes=skillNodes(skills.filter(s=>mode.skills.includes(s.id)),mode.architecture?.nodes);
  function close(){if(!busy&&(document===mode.document||window.confirm('有未保存的修改，放弃吗？')))onClose();}
  return <EditorPage title={`${mode.title} · 架构`} onClose={close}>
    <div className="diagram-editor" inert={busy}>
      <nav className="diagram-edit-toolbar"><div className="tabs">{diagrams.map((d,i)=><button key={i} className={currentIndex===i?'active':''} onClick={()=>setIndex(i)}>{d.title}</button>)}</div><button aria-pressed={sourceView} onClick={()=>setSourceView(!sourceView)}>{sourceView?'看图':'原文'}</button></nav>
      <div className={`diagram-edit-body ${sourceView?'has-source':''}`}>
        {sourceView&&<textarea aria-label="Mermaid 与模式说明" spellCheck={false} value={document} onChange={e=>setDocument(e.target.value)}/>}
        <div className="diagram-editor-preview">{diagram?<MermaidEdit key={currentIndex} source={diagram.source} nodes={nodes} onNode={setSelected} onSource={()=>setSourceView(true)} onChange={source=>setDocument(replaceDiagram(document,currentIndex,source))}/>:<Markdown text={document}/>}</div>
        {selected&&readFile&&<SkillFiles key={selected.id} item={selected} Dialog={SkillPanel} embedded onClose={()=>setSelected(null)} readFile={file=>readFile(selected,file)} saveFile={saveFile}/>}
      </div>
    </div>
    {error&&<p role="alert" className="error-text">{error}</p>}
    <div className="dialog-actions"><button disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy||document===mode.document} onClick={async()=>{
      setBusy(true);setError('');
      try{await onSave({operation:'mode.save',id:mode.id,expected:mode.fingerprint,skills:mode.roots,document});}
      catch(e){setError(e.message);}finally{setBusy(false);}
    }}>{busy?'正在验收…':'校验并保存'}</button></div>
  </EditorPage>;
}
