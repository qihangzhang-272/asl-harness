import {diagramsIn} from './mermaid-document.mjs';
import {renderDiagram} from './mermaid-render.mjs';
window.validateMermaid=async documents=>{
  const errors=[];let count=0;
  if(!Array.isArray(documents)||documents.length>256)throw new Error('一次最多检查 256 个文档');
  for(const document of documents){
    if(typeof document.file!=='string'||typeof document.text!=='string'||document.text.length>1024*1024)throw new Error('图文档格式或大小无效');
    const diagrams=/\.(mmd|mermaid)$/i.test(document.file)?[{source:document.text,title:document.file,line:1}]:diagramsIn(document.text);
    for(const [index,diagram] of diagrams.entries()){
      count++;
      try{await renderDiagram(diagram.source);}
      catch(error){errors.push({file:document.file,diagram:index+1,title:diagram.title,line:diagram.line,message:error.message,action:'修正 Mermaid 原文，重新提交；不要绕过校验。'});}
    }
  }
  return{ok:!errors.length,rendered:count-errors.length,errors};
};
