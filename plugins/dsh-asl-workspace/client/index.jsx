import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,Input} from '@deepseek-ai/dsh-client-ui-primitives';
import {Layers,Search,X,ArrowLeft,MessageCircle,Save,RefreshCw,PanelLeftClose,PanelLeftOpen,PanelBottomClose,PanelBottomOpen} from 'lucide-react';
import Markdown from '../../../desktop/src/Markdown.jsx';
import MermaidCanvas from './MermaidCanvas.jsx';
import ModePicker from './ModePicker.jsx';
import FileTree from './FileTree.jsx';
import SkillPreview from './SkillPreview.jsx';
import RunPeek from './RunPeek.jsx';
import {openSidebarFile} from './open-sidebar.mjs';
import previewCss from './preview.css';
import css from './workspace.css';
import mermaidCss from '../../../desktop/src/mermaid.css';
import stitchCss from '../../../desktop/src/stitch-theme.css';
import {useTheme} from '../../../desktop/src/useTheme.mjs';
const PANEL='asl-workspace';
const ChatTarget=React.createContext(null);
function NativeChat({renderSlot}){const target=React.useContext(ChatTarget);return target?createPortal(renderSlot('conversation.session',{}),target):null;}
const conversationSlots={views:NativeChat};
async function api(action,args={}){
  const response=await fetch('asl-workspace/api',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'工作区请求失败');return data.result;
}
function ResizeHandle({label,value,onChange,min,max,reverse=false}){
  const drag=useRef(null);
  return <div className={'asl-resize'+(reverse?' left':'')} role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();onChange(Math.max(min,Math.min(max,value+(e.key==='ArrowRight'?20:-20)*(reverse?-1:1))));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,width:value};}} onPointerMove={e=>{if(drag.current)onChange(Math.max(min,Math.min(max,drag.current.width+(e.clientX-drag.current.x)*(reverse?-1:1))));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}/>;
}
export function Workspace({ctx,seats}){
  const theme=useTheme();
  const [catalog,setCatalog]=useState(null),[mode,setMode]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0),[diagramDirty,setDiagramDirty]=useState(false);
  const [skill,setSkill]=useState(''),[file,setFile]=useState(null),[document,setDocument]=useState(''),[editing,setEditing]=useState(false),[fileQuery,setFileQuery]=useState(''),[fileBusy,setFileBusy]=useState(false);
  const [chat,setChat]=useState(false),[session,setSession]=useState(null),[sessionError,setSessionError]=useState(''),[sessionRetry,setSessionRetry]=useState(0),[region,setRegion]=useState(null);
  const [treeOpen,setTreeOpen]=useState(true),[sidebarOpen,setSidebarOpen]=useState(true),[composerOpen,setComposerOpen]=useState(true),[chatWidth,setChatWidth]=useState(360),[treeWidth,setTreeWidth]=useState(230);
  const [goalOpen,setGoalOpen]=useState(false),[goal,setGoal]=useState(''),[recommendation,setRecommendation]=useState('');
  const [canvasContext,setCanvasContext]=useState({diagram:null,selection:[]});
  const [chatTarget,setChatTarget]=useState(null);
  const [preview,setPreview]=useState(null),[inspection,setInspection]=useState(null),[previewDraft,setPreviewDraft]=useState(null);
  const request=useRef(0),pollRevision=useRef(null),contextQueue=useRef(Promise.resolve()),sessionMode=useRef('');
  const fileDirty=!!file&&document!==file.document;
  const view={mode,kind:skill||previewDraft?'skill':'mode',identifier:skill||previewDraft?.identifier||mode,file:skill?file?.file:previewDraft?.file||'MODE.md',dirty:diagramDirty||fileDirty||!!previewDraft?.dirty,...(!skill?{...canvasContext,region,inspection}:{})};
  const viewKey=JSON.stringify(view);
  const live=useRef({});live.current={mode,skill,file,document,session,diagramDirty,previewDraft,preview,view};
  function syncContext(){
    const s=live.current;if(!s.session||sessionMode.current!==s.mode||!s.view.file)return Promise.resolve();
    const args={sessionId:s.session.sessionId,view:s.view};
    const next=contextQueue.current.catch(()=>{}).then(()=>api('setContext',args));contextQueue.current=next;return next;
  }
  const current=catalog?.modes.find(m=>m.id===mode);
  const dirtyCallback=useCallback(value=>setDiagramDirty(value),[]);
  const previewNode=useCallback(ids=>{if(ids.join('|')===live.current.preview?.ids?.join('|'))return;if(ids.length&&(!live.current.previewDraft?.dirty||window.confirm('预览有未保存修改，切换节点会丢弃草稿。继续吗？'))){setPreview({kind:'skill',ids});setInspection(null);}},[]);
  async function run(work){setError('');try{return await work();}catch(e){setError(e.message);}}
  function leave(){const state=live.current;return !(state.previewDraft?.dirty||state.diagramDirty||state.file&&state.document!==state.file.document)||window.confirm('有未保存修改，离开会丢弃修改。继续吗？');}
  function choose(id){if(!leave())return;request.current++;setFileBusy(false);setMode(id);setSkill('');setFile(null);setDiagramDirty(false);setRegion(null);setPreview(null);setInspection(null);setPreviewDraft(null);setCanvasContext({diagram:null,selection:[]});setGoalOpen(false);localStorage.setItem('asl:last-mode',id);}
  useEffect(()=>{let alive=true;run(async()=>{const c=await api('catalog');if(!alive)return;setCatalog(c);const remembered=localStorage.getItem('asl:last-mode');choose(c.modes.find(m=>m.id===remembered)?.id||c.modes.find(m=>m.id==='creator-studio')?.id||c.modes[0]?.id);});return()=>{alive=false;};},[]);
  useEffect(()=>{const handler=e=>{const s=live.current;if(s.previewDraft?.dirty||s.diagramDirty||s.file&&s.document!==s.file.document){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[]);
  useEffect(()=>ctx.slots.onEntryError((key,_entry,cause)=>{if(key.startsWith('asl.workspace.')||key.startsWith('conversation.'))setSessionError(cause instanceof Error?cause.message:String(cause));}),[ctx]);
  useEffect(()=>{let stopped=false,timer;const poll=async()=>{try{await syncContext();const r=await api('changes');if(stopped)return;if(pollRevision.current!==null&&pollRevision.current!==r.revision){const c=await api('catalog');if(stopped)return;setCatalog(c);setRevision(r.revision);const s=live.current;if(s.skill&&s.file&&s.document===s.file.document)await readFile(s.skill,s.file.file,true);}pollRevision.current=r.revision;}catch(e){if(!stopped)setError(e.message);}finally{if(!stopped)timer=setTimeout(poll,900);}};poll();return()=>{stopped=true;clearTimeout(timer);};},[]);
  useEffect(()=>{
    if(!catalog?.cwd||!mode)return;
    let cancelled=false,reference;
    const release=()=>{const held=reference;reference=null;held?.release();};setSession(null);setSessionError('');sessionMode.current='';
    (async()=>{try{const key='asl:session:'+catalog.cwd+':'+mode;let id=localStorage.getItem(key);
      await ctx.sessions.refresh();if(cancelled)return;
      if(!id||!ctx.sessions.list.getSnapshot().byId[id]){id=await ctx.sessions.create({cwd:catalog.cwd});localStorage.setItem(key,id);}
      if(cancelled)return;reference=ctx.sessions.retain(id,{source:'aslWorkspace'});await reference.ready;if(cancelled){release();return;}sessionMode.current=mode;setSession(reference);
    }catch(e){release();if(!cancelled)setSessionError(e.message);}})();
    return()=>{cancelled=true;release();};
  },[mode,catalog?.cwd,sessionRetry]);
  useEffect(()=>{syncContext().catch(e=>setError(e.message));},[session,viewKey]);
  useEffect(()=>()=>{if(session){const next=contextQueue.current.catch(()=>{}).then(()=>api('setContext',{sessionId:session.sessionId,view:null}));contextQueue.current=next;next.catch(()=>{});}},[session]);
  async function readFile(id,path='SKILL.md',discard=false){
    const state=live.current;if(state.previewDraft?.dirty&&!window.confirm('预览有未保存修改，进入完整页面会丢弃草稿。继续吗？'))return;if(!discard&&state.file&&state.document!==state.file.document&&!window.confirm('当前文件有未保存修改，是否放弃？'))return;
    const seq=++request.current;setFileBusy(true);
    try{const f=await api('read',{kind:'skill',identifier:id,file:path});if(seq!==request.current||discard&&live.current.file&&live.current.document!==live.current.file.document)return;setSkill(id);setFile(f);setDocument(f.document);if(!discard){setEditing(false);setFileQuery('');}}finally{if(seq===request.current)setFileBusy(false);}
  }
  async function saveFile(){const seq=++request.current;setFileBusy(true);try{const f=await api('save',{kind:'skill',identifier:skill,file:file.file,expected:file.fingerprint,document});if(seq!==request.current)return;setFile(f);setDocument(f.document);}finally{if(seq===request.current)setFileBusy(false);}}
  function back(){if(fileDirty&&!window.confirm('有未保存修改，返回画板会丢弃它。继续吗？'))return;request.current++;setFileBusy(false);setSkill('');setFile(null);setEditing(false);}
  async function fileAction(action,target){return run(async()=>{
    if(action==='refresh'){if(skill)await readFile(skill,file.file);return;}
    if(action==='edit'){await readFile(target.identifier,target.file);return;}
    if(action==='copyRelative'){await navigator.clipboard.writeText(target.file||target.path||'.');return;}
    const location=target.identifier?await api('fileLocation',target):{path:target.path};
    if(action==='copyAbsolute'){await navigator.clipboard.writeText(location.path);return;}
    if(action==='reveal'){await api(target.identifier?'revealSkill':'revealArtifact',{...target,sessionId:session?.sessionId});return;}
    if(action==='sidebar')await openSidebarFile(ctx,session?.sessionId,location.path,catalog.cwd);
  });}
  const titles=Object.fromEntries((catalog?.skills||[]).map(s=>[s.id,s.title]));
  const {SessionProvider,renderSlot}=seats;
  const sessionNotice=<div className="asl-session-state"><span>{sessionError?'DeepSeek 对话未能显示':'正在连接 DeepSeek 会话…'}</span>{sessionError&&<><Button className="asl-btn" onClick={()=>setSessionRetry(n=>n+1)}>重新连接</Button><details open><summary>查看原因</summary><p>{sessionError}</p>{catalog?.sessionMissing?.length>0&&<p>宿主未就绪：{catalog.sessionMissing.join('、')}</p>}</details></>}</div>;
  const composer=session&&SessionProvider&&!sessionError?<SessionProvider session={session} empty={()=>sessionNotice}>{renderSlot('asl.workspace.composer',{},{fallback:<p className="asl-session-state">原生输入组件尚未加载</p>})}</SessionProvider>:sessionNotice;
  return <ChatTarget.Provider value={chatTarget}><div className="asl-ws" data-asl-theme={theme} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'&&skill){e.preventDefault();if(fileDirty&&!fileBusy)run(saveFile);}if(e.key==='Escape')setGoalOpen(false);}}>
    <style>{mermaidCss+'\n'+css+'\n'+stitchCss+'\n'+previewCss}</style>
    <header className="asl-topbar">
      {skill?<><Button className="asl-btn" onClick={back} aria-label="返回上一级画板"><ArrowLeft size={17}/></Button><span className="asl-crumb">{current?.title}</span><span className="asl-divider">/</span><h1>{titles[skill]||skill}</h1></>:<><Layers size={18}/><ModePicker modes={catalog?.modes||[]} value={mode} onChange={choose}/></>}
      <div className="asl-top-actions">{!skill&&<Button className="asl-btn" onClick={()=>setGoalOpen(!goalOpen)} aria-label="自动选取 Mode"><Search size={15}/><span>按任务选择</span></Button>}<Button className="asl-btn" aria-label={chat?'收起 DeepSeek 对话':'展开 DeepSeek 对话'} aria-pressed={chat} onClick={()=>setChat(!chat)}><MessageCircle size={18}/></Button></div>
    </header>
    {error&&<div className="asl-error" role="alert"><span>{error}</span><Button className="asl-btn" aria-label="关闭错误提示" onClick={()=>setError('')}><X size={14}/></Button></div>}
    {goalOpen&&!skill&&<form className="asl-goal asl-glass" onSubmit={e=>{e.preventDefault();run(async()=>{const r=await api('recommend',{goal});setRecommendation(r.reason);if(r.selected)choose(r.selected);});}}><label>这次想完成什么？<Input value={goal} onChange={e=>setGoal(e.target.value)} placeholder="将投研材料整理为公众号文章" required/></label><Button className="asl-btn is-primary" type="submit" variant="primary">选取 Mode</Button>{recommendation&&<p>{recommendation}</p>}</form>}
    <div className="asl-workarea">
      <main className="asl-mermaid-main" hidden={!!skill}>{current&&<MermaidCanvas key={mode} mode={current} skills={catalog.skills} api={api} refreshKey={revision} onSkill={id=>run(()=>readFile(id))} onPreview={previewNode} onDiscover={selection=>{setRegion(selection);setChat(true);setComposerOpen(true);}} onDirty={dirtyCallback} onContext={setCanvasContext}/>}<RunPeek api={api} sessionId={session?.sessionId} onArtifact={path=>{if(!live.current.previewDraft?.dirty||window.confirm('预览有未保存修改，打开产物会丢弃草稿。继续吗？'))setPreview({kind:'artifact',path});}} onSkill={id=>previewNode([id])} onChat={()=>{setChat(true);setComposerOpen(true);}}/></main>
      {!skill&&preview&&<SkillPreview key={preview.kind==='skill'?preview.ids.join('|'):preview.path} target={preview} skills={catalog?.skills||[]} api={api} sessionId={session?.sessionId} revision={revision} onClose={()=>{if(!live.current.previewDraft?.dirty||window.confirm('有未保存修改，关闭预览会丢弃草稿。继续吗？')){setPreview(null);setInspection(null);}}} onEdit={(id,path)=>run(()=>readFile(id,path))} onAction={fileAction} onInspection={setInspection} onDraftChange={setPreviewDraft}/>}
      {skill&&<main className="asl-detail">
          <aside className={"asl-file-sidebar"+(sidebarOpen?'':' collapsed')} style={{width:sidebarOpen?treeWidth:46}}><div className="asl-file-heading">{sidebarOpen&&<strong>技能文件</strong>}<Button className="asl-btn" aria-label={sidebarOpen?'收起文件目录':'展开文件目录'} onClick={()=>setSidebarOpen(!sidebarOpen)}>{sidebarOpen?<PanelLeftClose size={16}/>:<PanelLeftOpen size={16}/>}</Button></div>{sidebarOpen&&<><Input aria-label="查找技能文件" value={fileQuery} onChange={e=>setFileQuery(e.target.value)} placeholder="查找文件…"/><Button className="asl-btn asl-tree-toggle" onClick={()=>setTreeOpen(!treeOpen)}>{treeOpen?'收起全部文件夹':'展开全部文件夹'}</Button>{file&&<FileTree expanded={treeOpen} files={file.files} selected={file.file} query={fileQuery} onSelect={path=>run(()=>readFile(skill,path))} onAction={(action,entry)=>fileAction(action,{identifier:skill,file:entry.path})}/>}</>}{sidebarOpen&&<ResizeHandle label="调整文件目录宽度" value={treeWidth} onChange={setTreeWidth} min={150} max={360}/>}</aside>
          <section className="asl-document"><header><span>{file?.file||'读取文件…'}</span><div><Button className="asl-btn" aria-label="重新读取文件" disabled={fileBusy} onClick={()=>run(()=>readFile(skill,file.file))}><RefreshCw size={14}/></Button><Button className="asl-btn" disabled={fileBusy||file?.document==null} aria-pressed={editing} onClick={()=>setEditing(!editing)}>{editing?'阅读':'编辑 Markdown'}</Button><Button className="asl-btn is-primary" variant="primary" disabled={!fileDirty||fileBusy} onClick={()=>run(saveFile)}><Save size={14}/>{fileBusy?'保存中':'保存'}</Button></div></header>
            {file?.document==null?<p className="asl-empty">此文件为二进制或超过编辑大小限制，仍保留在技能包内。</p>:editing?<div className="asl-edit-split"><textarea aria-label="Markdown 原文" spellCheck={false} value={document} disabled={fileBusy} onChange={e=>setDocument(e.target.value)}/><div className="asl-markdown"><Markdown text={document} onLink={href=>{if(/^https?:/.test(href)){window.open(href,'_blank','noopener,noreferrer');return true;}}}/></div></div>:<div className="asl-markdown" onDoubleClick={e=>{if(!e.target.closest('a,button,summary'))setEditing(true);}}><Markdown text={document} onLink={href=>{if(/^https?:/.test(href)){window.open(href,'_blank','noopener,noreferrer');return true;}}} onFile={relative=>{const parts=file.file.split('/').slice(0,-1);for(const part of relative.split('/'))if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);const path=parts.join('/');if(file.files.some(f=>f.path===path))run(()=>readFile(skill,path));}}/></div>}
          </section>
      </main>}
      {chat&&<aside className="asl-chat" style={{width:chatWidth}}><ResizeHandle label="调整 DeepSeek 对话宽度" value={chatWidth} onChange={setChatWidth} min={300} max={600} reverse/><header><div><MessageCircle size={17}/><strong>DeepSeek</strong><small>{region&&!skill?'发现与填入技能':'一起处理当前内容'}</small></div><Button className="asl-btn" aria-label="关闭 DeepSeek 对话" onClick={()=>setChat(false)}><X size={16}/></Button></header>{region&&!skill&&<p className="asl-context-note">已选定「{region.diagram}」。描述需要的专业能力，新增技能将逐项填入 Mermaid。</p>}<div className="asl-chat-body" ref={setChatTarget}>{!session&&<p className="asl-empty">会话连接后在此显示回复</p>}</div></aside>}
    </div>
    <footer className={"asl-composer"+(composerOpen?'':' collapsed')}><div className="asl-composer-label"><span className="asl-deepseek-dot"/>DeepSeek<span>{skill?'编辑当前技能文件':region?'为当前分支发现技能':'与当前 Mode 一起工作'}</span><button onClick={()=>setChat(!chat)}>{chat?'收起对话':'查看对话'}</button><Button className="asl-btn" aria-label={composerOpen?'收起输入区':'展开输入区'} onClick={()=>setComposerOpen(!composerOpen)}>{composerOpen?<PanelBottomClose size={15}/>:<PanelBottomOpen size={15}/>}</Button></div><div hidden={!composerOpen}>{composer}</div></footer>
  </div></ChatTarget.Provider>;
}
export const inject=['slots','layout','sessions','conversation'];
export function apply(ctx){
  // The native factory owns conversation slots; declaring them again rejects registration.
  const Composer=({renderFactorySlot})=>renderFactorySlot('conversation.content',{variant:'embedded',phase:'active',hero:false},{slots:conversationSlots});
  ctx.slots.inject('asl.workspace.composer',()=>ctx.slots.register({name:'asl.workspace.composer'},Composer));
  const Page=seats=><Workspace ctx={ctx} seats={seats}/>;
  ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:PANEL,children:{'asl.workspace.composer':{kind:'single',scope:'session'}}},Page));
  ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:PANEL,order:4,label:()=> 'ASL 工作区'},({size})=><Layers size={size}/>));
}
