import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown,ChevronRight,FileText,Folder,FolderOpen} from 'lucide-react';
import {treeEntries,visibleEntries} from './file-tree.mjs';

export default function FileTree({files,selected,onSelect,query='',expanded=true,onAction}){
  const entries=useMemo(()=>treeEntries(files,query),[files,query]);
  const [opened,setOpened]=useState(new Set()),[active,setActive]=useState(selected),[menu,setMenu]=useState(null);
  const root=useRef(null),menuRef=useRef(null);
  useEffect(()=>{setOpened(new Set(expanded?entries.filter(e=>e.directory).map(e=>e.path):[]));},[expanded]);
  useEffect(()=>{setActive(selected);},[selected]);
  useEffect(()=>{if(menu)menuRef.current?.querySelector('button')?.focus();},[menu]);
  useEffect(()=>{const close=e=>{if(menuRef.current&&!menuRef.current.contains(e.target))setMenu(null);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
  const visible=visibleEntries(entries,opened,query);
  function toggle(path,value){setOpened(old=>{const next=new Set(old);if(value??!next.has(path))next.add(path);else next.delete(path);return next;});}
  function focus(path){setActive(path);root.current?.querySelectorAll('[role=treeitem]').forEach(row=>{if(row.dataset.path===path)row.focus();});}
  function open(entry){setActive(entry.path);if(entry.directory)toggle(entry.path);else onSelect(entry.path);}
  function context(event,entry){event.preventDefault();event.stopPropagation();setActive(entry.path);const rect=event.currentTarget.getBoundingClientRect();setMenu({entry,x:Math.max(4,Math.min(window.innerWidth-230,event.clientX||rect.left)),y:Math.max(4,Math.min(window.innerHeight-270,event.clientY||rect.bottom))});}
  async function action(name){const entry=menu.entry;setMenu(null);if(name==='open'){if(entry.path)open(entry);else setOpened(new Set(entries.filter(e=>e.directory).map(e=>e.path)));}else await onAction?.(name,entry);}
  function key(event,entry){
    const index=visible.findIndex(e=>e.path===entry.path);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();focus(visible[event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)))].path);}
    else if(event.key==='ArrowRight'&&entry.directory){event.preventDefault();if(!opened.has(entry.path))toggle(entry.path,true);else if(visible[index+1]?.parent===entry.path)focus(visible[index+1].path);}
    else if(event.key==='ArrowLeft'){event.preventDefault();if(entry.directory&&opened.has(entry.path))toggle(entry.path,false);else if(entry.parent)focus(entry.parent);}
    else if(['Enter',' '].includes(event.key)){event.preventDefault();open(entry);}
    else if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')context(event,entry);
  }
  return <><nav ref={root} className="asl-tree" role="tree" aria-label="技能文件夹" onContextMenu={e=>context(e,{path:'',name:'技能目录',directory:true})}>
    {visible.map((entry,index)=><button type="button" className="asl-tree-row" role="treeitem" key={entry.path} data-path={entry.path} style={{'--depth':entry.depth}} aria-level={entry.depth+1} aria-selected={active===entry.path} aria-expanded={entry.directory?!!query||opened.has(entry.path):undefined} tabIndex={active===entry.path||!visible.some(e=>e.path===active)&&index===0?0:-1} title={entry.path} onClick={()=>open(entry)} onDoubleClick={()=>{if(!entry.directory)onAction?.('edit',entry);}} onKeyDown={e=>key(e,entry)} onContextMenu={e=>context(e,entry)}>
      {entry.directory?<>{opened.has(entry.path)?<ChevronDown size={12}/>:<ChevronRight size={12}/>}<Folder size={14}/></>:<FileText size={14}/>}<span className="asl-tree-label">{entry.name}</span>
    </button>)}
    {!visible.length&&<p className="asl-preview-empty">没有匹配的文件</p>}
  </nav>{menu&&<div ref={menuRef} className="asl-file-menu is-open" role="menu" aria-label="文件操作" style={{left:menu.x,top:menu.y}} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();setMenu(null);focus(menu.entry.path);}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...menuRef.current.querySelectorAll('button')],at=items.indexOf(document.activeElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}
  }}>
    <button role="menuitem" onClick={()=>action('open')}>{menu.entry.directory?'展开／收起目录':'打开预览'}</button>
    {!menu.entry.directory&&<button role="menuitem" onClick={()=>action('edit')}>在完整页面编辑</button>}
    {!menu.entry.directory&&<button role="menuitem" onClick={()=>action('sidebar')}>在 Sidebar 中打开</button>}
    <button role="menuitem" onClick={()=>action('copyRelative')}>复制相对路径</button>
    <button role="menuitem" onClick={()=>action('copyAbsolute')}>复制绝对路径</button>
    <button role="menuitem" onClick={()=>action('reveal')}><FolderOpen size={14}/>在系统文件夹中显示</button>
    <button role="menuitem" onClick={()=>action('refresh')}>刷新目录</button>
  </div>}</>;
}
