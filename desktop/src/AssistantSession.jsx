import React,{useEffect,useState} from 'react';
import {Circle,Check,TriangleAlert} from 'lucide-react';
import {watchAssistantSession} from './assistant-status.mjs';

export default function AssistantSession({api,session,name}) {
  const [report,setReport]=useState(session),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    setReport(session);setUnavailable(false);
    if(['ended','failed'].includes(session.status))return;
    return watchAssistantSession({id:session.id,read:id=>api('setupStatus',id),
      onStatus:value=>{setReport(value);setUnavailable(false);},onError:()=>setUnavailable(true)});
  },[api,session.id,session.status]);
  const failed=report.status==='failed',ended=report.status==='ended';
  const Icon=unavailable||failed?TriangleAlert:ended?Check:Circle;
  return <div className="assistant-session" role="status">
    <Icon size={17} aria-hidden="true"/>
    <div><strong>{name.replace(' CLI','')} · {unavailable?'状态暂不可用':failed?'会话未正常结束':ended?'会话已结束':'会话已打开'}</strong>
      <span>{unavailable?'正在重新读取，原会话不受影响。':failed?'请在 Agent 中查看原因，再检查整理结果。':ended?'可以查看整理结果，确认本次更改。':'可直接在 Agent 中对话，结束后这里会自动更新。'}</span>
    </div>
  </div>;
}
