import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Button,Input} from '@deepseek-ai/dsh-client-ui-primitives';
import {Code2,Plus,Scan,X,FileText,LoaderCircle,Check} from 'lucide-react';
import MermaidView from '../../../desktop/src/MermaidView.jsx';
import MermaidEdit from '../../../desktop/src/MermaidEdit.jsx';
import {replaceDiagram,editFlowchart,appendDiagramTemplate} from '../../../desktop/src/mermaid-document.mjs';
import {structureItems,editStructure} from '../../../desktop/src/mermaid-structure.mjs';
import {modeDiagramDocument,skillNodes} from '../../../desktop/src/mode-diagrams.mjs';
import {diagramsFor,bindingsFor,referencedSkills} from './diagram-model.mjs';

export default function MermaidCanvas({mode,skills,api,refreshKey,onSkill,onDiscover,onDirty,onContext}){
  const [file,setFile]=useState(null),[document,setDocument]=useState(''),[index,setIndex]=useState(0),[selected,setSelected]=useState('');
  const [sourceOpen,setSourceOpen]=useState(false),[sourceDraft,setSourceDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false),[inlineEditing,setInlineEditing]=useState(false);
  const [adding,setAdding]=useState(false),[title,setTitle]=useState(''),[members,setMembers]=useState([]),[frameMode,setFrameMode]=useState(false),[frame,setFrame]=useState(null);
  const [history,setHistory]=useState([]),[redo,setRedo]=useState([]);
  const [selection,setSelection]=useState([]);
  const root=useRef(null),current=useRef({});current.current={file,document,inlineEditing};
  const saving=useRef(false),sourceDirty=useRef(false),frameStart=useRef(null);
  const diagrams=useMemo(()=>diagramsFor(document,mode,skills),[document,mode,skills]),drawing=diagrams[index];
  const bindings=useMemo(()=>bindingsFor(drawing?.source||'',skills),[drawing?.source,skills]);
  const candidates=useMemo(()=>skillNodes(skills,mode.architecture?.nodes),[skills,mode.architecture?.nodes]);
  const nodes=[...bindings].map(([alias,ids])=>({alias,data:{skills:ids,title:candidates.find(n=>n.data.skill.id===ids[0])?.data.title||ids[0],skill:{id:alias}}}));
  const dirty=!!file&&document!==file.document;
  sourceDirty.current=sourceOpen&&sourceDraft!==drawing?.source;
  useEffect(()=>{if(index>=diagrams.length)setIndex(0);},[index,diagrams.length]);
  useEffect(()=>{onDirty(dirty||sourceDirty.current||inlineEditing);},[dirty,sourceDraft,sourceOpen,inlineEditing]);
  useEffect(()=>{onContext({diagram:{index,title:drawing?.title||''},selection:selection.map(({kind,id,index,from,to})=>({kind,id,index,from,to}))});},[index,drawing?.title,selection,onContext]);
  useEffect(()=>{const changed=()=>setInlineEditing(!!root.current?.querySelector('.mermaid-label-editor'));window.document.addEventListener('asl:editor-state',changed);return()=>window.document.removeEventListener('asl:editor-state',changed);},[]);
  useEffect(()=>{
    let alive=true;
    (async()=>{try{
      const next=await api('read',{kind:'mode',identifier:mode.id,file:'MODE.md'});
      if(!alive||saving.current||current.current.file?.fingerprint===next.fingerprint)return;
      if(current.current.file&&(current.current.document!==current.current.file.document||sourceDirty.current||current.current.inlineEditing)){
        if(next.fingerprint!==current.current.file.fingerprint)setError('画板已由其他编辑更新。当前修改已保留；请先复制或合并，再重新读取。');
        return;
      }
      setFile(next);setDocument(next.document);setHistory([]);setRedo([]);
    }catch(e){if(alive)setError(e.message);}})();
    return()=>{alive=false;};
  },[mode.id,refreshKey]);
  function revise(next){setHistory(old=>[...old.slice(-39),document]);setRedo([]);setDocument(next);setError('');}
  function change(source){revise(replaceDiagram(modeDiagramDocument({...mode,document},skills),index,source));}
  function choose(next){
    if(sourceDirty.current&&!window.confirm('Mermaid 原文尚未应用，离开会丢弃修改。继续吗？'))return;
    setIndex(next);setSelected('');setSelection([]);setSourceOpen(false);setAdding(false);
  }
  function undo(){setRedo(old=>[document,...old]);setDocument(history.at(-1));setHistory(old=>old.slice(0,-1));setError('');}
  function redoChange(){setHistory(old=>[...old,document]);setDocument(redo[0]);setRedo(old=>old.slice(1));setError('');}
  async function save(){
    if(!dirty||saving.current)return;
    saving.current=true;setBusy(true);setError('');
    try{
      const referenced=[...new Set(diagrams.flatMap(d=>referencedSkills(d.source,skills)))];
      const next=await api('save',{kind:'mode',identifier:mode.id,file:'MODE.md',expected:file.fingerprint,document,skills:referenced});
      setFile(next);
      setDocument(latest=>latest===document?next.document:latest);
    }catch(e){setError(e.message);}finally{saving.current=false;setBusy(false);}
  }
  useEffect(()=>{if(!dirty||busy||error)return;const timer=setTimeout(save,750);return()=>clearTimeout(timer);},[document,dirty,busy,error]);
  function selectNode(node){
    const ids=bindings.get(node.id)||[node.id];setSelected(node.id);
    if(ids.length===1&&skills.some(s=>s.id===ids[0]))onSkill(ids[0]);
  }
  function openSource(){if(drawing){setSourceDraft(drawing.source);setSourceOpen(true);}}
  return <section ref={root} className={'asl-diagram-workspace'+(expanded?' asl-diagram-expanded':'')} onKeyDown={e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();if(sourceOpen){change(sourceDraft);setSourceOpen(false);}else save();}
    if(e.key==='Escape'){setAdding(false);setFrameMode(false);setExpanded(false);}
  }}>
    <header className="asl-diagram-toolbar">
      <nav className="asl-paradigm-tabs" aria-label="工作范式">{diagrams.map((d,i)=><button key={i} aria-current={index===i?'page':undefined} onClick={()=>choose(i)}>{d.title}</button>)}</nav>
      <div className="asl-diagram-actions">
        <Button className="asl-btn" aria-label="编辑 Mermaid 原文" aria-pressed={sourceOpen} disabled={!drawing} onClick={()=>{
          if(sourceDirty.current&&!window.confirm('Mermaid 原文尚未应用，关闭会丢弃修改。继续吗？'))return;
          if(sourceOpen)setSourceOpen(false);else openSource();
        }}><Code2 size={16}/></Button>
        <Button className="asl-btn" aria-label="添加技能" disabled={!drawing||sourceOpen} onClick={()=>{setAdding(true);setTitle('');setMembers([]);}}><Plus size={17}/></Button>
        <Button className="asl-btn" aria-label="画框发现技能" aria-pressed={frameMode} disabled={sourceOpen} onClick={()=>setFrameMode(!frameMode)}><Scan size={17}/></Button>
        <span className="asl-diagram-save" role="status" aria-label={busy?'正在保存':dirty||sourceDirty.current?'未保存':'已同步'}>{busy?<LoaderCircle className="asl-spin" size={13}/>:dirty||sourceDirty.current?'未保存':<Check size={13}/>}</span>
      </div>
    </header>
    {error&&<div className="asl-error" role="alert"><span>{error}</span>{dirty&&<Button className="asl-btn" onClick={save}>重试保存</Button>}<Button className="asl-btn" onClick={async()=>{
      if((dirty||sourceDirty.current)&&!window.confirm('重新读取会丢弃本地未保存修改。继续吗？'))return;
      try{const next=await api('read',{kind:'mode',identifier:mode.id,file:'MODE.md'});setFile(next);setDocument(next.document);setSourceOpen(false);setError('');}catch(e){setError(e.message);}
    }}>重新读取</Button></div>}
    <div className="asl-diagram-stage">
      {!file?<div className="asl-empty"><LoaderCircle className="asl-spin"/>正在读取 Mode…</div>:sourceOpen?<div className="asl-mermaid-source">
        <div><textarea aria-label="Mermaid 图原文" spellCheck={false} value={sourceDraft} onChange={e=>setSourceDraft(e.target.value)}/><footer><span>原文是图的唯一来源</span><Button className="asl-btn is-primary" variant="primary" onClick={()=>{change(sourceDraft);setSourceOpen(false);}}>应用修改</Button></footer></div><MermaidView source={sourceDraft}/>
      </div>:<MermaidEdit key={index} source={drawing?.source} empty={!drawing} nodes={nodes} candidates={candidates}
        selectedId={selected} onNode={selectNode} onChange={change} onSource={openSource} onSelection={setSelection}
        onUndo={history.length&&!busy?undo:null} onRedo={redo.length&&!busy?redoChange:null}
        expanded={expanded} onExpand={()=>setExpanded(!expanded)}
        onCreate={type=>{revise(appendDiagramTemplate(modeDiagramDocument({...mode,document},skills),type));setIndex(diagrams.length);setSelected('');}}/>}
      {frameMode&&<div className="asl-frame-layer" onPointerDown={e=>{
        e.currentTarget.setPointerCapture(e.pointerId);const bounds=e.currentTarget.getBoundingClientRect();frameStart.current={x:e.clientX-bounds.left,y:e.clientY-bounds.top};setFrame({...frameStart.current,width:0,height:0});
      }} onPointerMove={e=>{
        if(!frameStart.current)return;const b=e.currentTarget.getBoundingClientRect(),s=frameStart.current,x=e.clientX-b.left,y=e.clientY-b.top;setFrame({x:Math.min(x,s.x),y:Math.min(y,s.y),width:Math.abs(x-s.x),height:Math.abs(y-s.y)});
      }} onPointerUp={()=>{
        if(frame&&frame.width>20&&frame.height>20){onDiscover({diagram:drawing?.title,index,region:frame});setFrameMode(false);setExpanded(false);}frameStart.current=null;setFrame(null);
      }} onPointerCancel={()=>{frameStart.current=null;setFrame(null);}}>{frame&&<div className="asl-discovery-frame" style={{left:frame.x,top:frame.y,width:frame.width,height:frame.height}}/>}</div>}
      {adding&&<form className="asl-node-editor asl-glass" onSubmit={e=>{
        e.preventDefault();const id='skill_'+crypto.randomUUID().replaceAll('-','');const structure=structureItems(drawing.source);change((structure.type?editStructure:editFlowchart)(drawing.source,{kind:'add',id,label:title})+'\n%% asl-bind '+id+' '+JSON.stringify(members));setAdding(false);
      }}><header><h2>添加技能</h2><Button className="asl-btn" aria-label="关闭添加技能" onClick={()=>setAdding(false)}><X size={16}/></Button></header>
        <label>图中名称<Input required value={title} maxLength={150} onChange={e=>setTitle(e.target.value)}/></label>
        <div className="asl-picker-list">{skills.map(s=><label key={s.id}><input type="checkbox" checked={members.includes(s.id)} disabled={!members.includes(s.id)&&members.length===2} onChange={e=>{setMembers(e.target.checked?[...members,s.id]:members.filter(id=>id!==s.id));if(!title)setTitle(s.title);}}/><span>{s.title}<small>{s.id}</small></span></label>)}</div>
        <footer><span>{members.length} / 2 个技能</span><Button className="asl-btn is-primary" type="submit" variant="primary" disabled={!members.length}>加入当前图</Button></footer>
      </form>}
    </div>
    {(bindings.get(selected)||[]).length===2&&<footer className="asl-diagram-footer">{bindings.get(selected).map(id=><Button className="asl-btn" key={id} onClick={()=>onSkill(id)}><FileText size={14}/>{skills.find(s=>s.id===id)?.title||id}</Button>)}</footer>}
  </section>;
}
