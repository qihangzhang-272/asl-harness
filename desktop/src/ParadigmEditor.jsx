import React, {useState} from 'react';
import {Plus, X, Network, Puzzle, ArrowRight, Save} from 'lucide-react';

export function Placement({mode,value,onChange,required=true}) {
  if(!mode?.architecture?.paradigms)return null;
  return <label className="field"><span>放在哪种工作方式中</span><select aria-label="工作范式归属" value={value||''} onChange={e=>onChange(e.target.value)} required={required}>
    <option value="">选择工作范式或通用能力</option>
    {mode.architecture.paradigms.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
    <option value="shared">通用能力 · 各场景按需使用</option>
  </select></label>;
}

export default function ParadigmEditor({mode,skills,Dialog,Field,onSave,onClose}) {
  const old=mode.architecture;
  const [value,setValue]=useState(()=>old?.paradigms?structuredClone(old):{nodes:old?.nodes||[],shared:[],paradigms:old?.edges?.length?[{
    id:'existing',title:'原有技能关系',description:'',skills:skills.map(s=>s.id),edges:old.edges}]:[]});
  const [selected,setSelected]=useState(value.paradigms[0]?.id||'shared');
  const [nodeId,setNodeId]=useState(skills[0]?.id||'');
  const initial=JSON.stringify(old);
  const dirty=JSON.stringify(value)!==initial;
  const current=value.paradigms.find(p=>p.id===selected);
  const title=id=>value.nodes.find(n=>n.skill===id)?.title||skills.find(s=>s.id===id)?.title||id;
  const covered=new Set([...value.shared,...value.paradigms.flatMap(p=>p.skills)]);
  const missing=skills.filter(s=>!covered.has(s.id));
  const valid=!missing.length&&value.paradigms.every(p=>p.title.trim()&&p.description.trim()&&p.skills.length&&p.edges.every(e=>e.label?.trim()));
  const node=value.nodes.find(n=>n.skill===nodeId)||{skill:nodeId};
  function close(){if(!dirty||window.confirm('有未保存的工作架构，放弃修改？'))onClose();}
  function update(change){setValue(v=>({...v,paradigms:v.paradigms.map(p=>p.id===selected?{...p,...change}:p)}));}
  function toggle(id,checked){
    if(selected==='shared')setValue(v=>({...v,shared:checked?[...v.shared,id]:v.shared.filter(s=>s!==id),
      paradigms:v.paradigms.map(p=>checked?{...p,skills:p.skills.filter(s=>s!==id),edges:p.edges.filter(e=>e.from!==id&&e.to!==id)}:p)}));
    else update({skills:checked?[...current.skills,id]:current.skills.filter(s=>s!==id),edges:current.edges.filter(e=>checked||e.from!==id&&e.to!==id)});
  }
  return <Dialog title={`工作架构 · ${mode.title}`} onClose={close} wide>
    <div className="paradigm-editor">
      <nav className="paradigm-sidebar" aria-label="范式目录">
        <div className="field-heading"><span>工作范式</span><button className="icon-button" aria-label="新增工作范式" onClick={()=>{
          const id='pattern-'+crypto.randomUUID().slice(0,8);setValue(v=>({...v,paradigms:[...v.paradigms,{id,title:'',description:'',skills:[],edges:[]}]}));setSelected(id);
        }}><Plus size={16}/></button></div>
        {value.paradigms.map((p,i)=><button className={p.id===selected?'active':''} key={p.id} onClick={()=>setSelected(p.id)}><Network size={16}/><span>{p.title||`新范式 ${i+1}`}</span><small>{p.skills.length}</small></button>)}
        <button className={selected==='shared'?'active':''} onClick={()=>setSelected('shared')}><Puzzle size={16}/><span>通用能力</span><small>{value.shared.length}</small></button>
        <div className="paradigm-status">{missing.length?`${missing.length} 个技能待归属`:'全部技能已归属'}</div>
      </nav>
      <div className="paradigm-form">
        {current?<>
          <div className="field-heading"><h2>{current.title||'新工作范式'}</h2><button className="text-button" onClick={()=>{setValue(v=>({...v,paradigms:v.paradigms.filter(p=>p.id!==selected)}));setSelected('shared');}}><X size={15}/>移除范式</button></div>
          <Field label="范式名称"><input aria-label="范式名称" maxLength={80} value={current.title} placeholder="例如：已有成稿的视觉与发布" onChange={e=>update({title:e.target.value})}/></Field>
          <Field label="什么时候用，技能怎样配合"><textarea aria-label="范式说明" maxLength={1200} rows={3} value={current.description} placeholder="说明目的、选择分支或反馈方式。无需规定每次都走完整流程。" onChange={e=>update({description:e.target.value})}/></Field>
        </>:<><h2>通用能力</h2><p className="muted">检索、查证等按需提供支持的能力。它们可以服务这个 Mode 的所有范式，无需重复连线。</p></>}
        <div className="member-grid">{skills.filter(s=>selected==='shared'||!value.shared.includes(s.id)).map(s=><label key={s.id}>
          <input type="checkbox" checked={(current?.skills||value.shared).includes(s.id)} onChange={e=>toggle(s.id,e.target.checked)}/><span title={s.description}>{title(s.id)}</span>
        </label>)}</div>
        {current&&<section className="paradigm-links"><div className="field-heading"><h3>技能怎样衔接</h3><button disabled={current.skills.length<2} onClick={()=>{
          const pair=current.skills.flatMap(a=>current.skills.filter(b=>b!==a).map(b=>[a,b])).find(([a,b])=>!current.edges.some(e=>e.from===a&&e.to===b));
          if(pair)update({edges:[...current.edges,{from:pair[0],to:pair[1],label:''}]});
        }}><Plus size={15}/>添加关系</button></div>
          {!current.edges.length&&<p className="muted">没有固定衔接时可以留空，在上方说明如何按场景选用。</p>}
          {current.edges.map((edge,i)=><div className="paradigm-link" key={i}>
            <select aria-label={`关系 ${i+1} 来源`} value={edge.from} onChange={e=>update({edges:current.edges.map((v,j)=>i===j?{...v,from:e.target.value}:v)})}>{current.skills.filter(s=>s!==edge.to).map(s=><option key={s} value={s}>{title(s)}</option>)}</select><ArrowRight size={15}/>
            <select aria-label={`关系 ${i+1} 目标`} value={edge.to} onChange={e=>update({edges:current.edges.map((v,j)=>i===j?{...v,to:e.target.value}:v)})}>{current.skills.filter(s=>s!==edge.from).map(s=><option key={s} value={s}>{title(s)}</option>)}</select>
            <input aria-label={`关系 ${i+1} 含义`} maxLength={80} value={edge.label||''} placeholder="交付内容、选择条件或反馈" onChange={e=>update({edges:current.edges.map((v,j)=>i===j?{...v,label:e.target.value}:v)})}/>
            <button className="icon-button" aria-label={`移除关系 ${i+1}`} onClick={()=>update({edges:current.edges.filter((_,j)=>j!==i)})}><X size={15}/></button>
          </div>)}
        </section>}
        <details className="node-appearance"><summary>技能显示名称与外观</summary><select aria-label="选择显示节点" value={nodeId} onChange={e=>setNodeId(e.target.value)}>{skills.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select>
          {[['title','显示名称'],['note','备注'],['icon','Emoji / SVG'],['color','颜色']].map(([key,label])=><Field key={key} label={label}><input aria-label={`节点${label}`} type={key==='color'?'color':'text'} value={node[key]||(key==='color'?'#007aff':'')} onChange={e=>{
            const next={...node};if(e.target.value)next[key]=e.target.value;else delete next[key];
            setValue(v=>({...v,nodes:[...v.nodes.filter(n=>n.skill!==nodeId),next]}));
          }}/></Field>)}
        </details>
        {!!missing.length&&<p role="status" className="inline-note">尚未归属：{missing.map(s=>s.title).join('、')}。请选择一个范式加入，或明确列为通用能力。</p>}
      </div>
    </div>
    <div className="dialog-actions"><span className="muted">保存在 mode.yaml · Agent 可用同一规范编辑</span><button onClick={close}>取消</button><button className="primary" disabled={!dirty||!valid} onClick={()=>onSave({operation:'mode.save',id:mode.id,expected:mode.fingerprint,document:mode.document,skills:mode.roots,architecture:value})}><Save size={15}/>保存工作架构</button></div>
  </Dialog>;
}
