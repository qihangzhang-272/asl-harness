import {flowchartItems,readLayout} from './mermaid-document.mjs';
import {flowCanvas} from './mermaid-canvas.mjs';
let library;
let counter=0;
export async function renderDiagram(source) {
  if(typeof source!=='string'||!source.trim()||source.length>50000)throw new Error('图内容需为 1–50000 字的 Mermaid 原文');
  const layout=readLayout(source);
  library ||= import('mermaid').then(({default:mermaid})=>{
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:50000,maxEdges:500,
      secure:['securityLevel','startOnLoad','suppressErrorRendering','maxTextSize','maxEdges','themeCSS','htmlLabels'],
      htmlLabels:false,theme:'base',look:'classic',fontFamily:'-apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif',
      themeVariables:{primaryColor:'#ffffff',primaryBorderColor:'#7c828c',primaryTextColor:'#1d1d1f',lineColor:'#747a84',secondaryColor:'#f0f1f3',tertiaryColor:'#f5f5f7',fontSize:'15px',
        actorBkg:'#ffffff',actorBorder:'#7c828c',actorTextColor:'#1d1d1f',signalColor:'#747a84',signalTextColor:'#1d1d1f',
        noteBkgColor:'#f0f1f3',noteBorderColor:'#7c828c',noteTextColor:'#1d1d1f',
        ...Object.fromEntries(Array.from({length:12},(_,i)=>[[`cScale${i}`,['#ffffff','#f0f1f3','#f5f5f7'][i%3]],[`cScaleLabel${i}`,'#1d1d1f'],[`cScaleInv${i}`,'#7c828c']]).flat()),
      },
      themeCSS:'.mindmap-node .label text { text-anchor: middle; } .mindmap-node .node-bkg ~ .label text { text-anchor: start; } .mindmap-node .label-container { stroke: #7c828c; stroke-width: 1px; } [class*="section-edge-"] { stroke: #747a84; stroke-width: 1.5px; }',
      flowchart:{htmlLabels:false,curve:'basis',nodeSpacing:38,rankSpacing:58,padding:18},
    });return mermaid;
  });
  const mermaid=await library;await document.fonts.ready;
  const container=document.createElement('div');
  container.style.cssText='position:absolute;left:-100000px;top:0;width:1400px;visibility:hidden;pointer-events:none';
  document.body.appendChild(container);
  try {
    const {svg}=await mermaid.render(`aslMermaid${++counter}`,source,container);
    const documentSvg=new DOMParser().parseFromString(svg,'image/svg+xml');
    const root=documentSvg.documentElement;
    if(root.localName!=='svg'||documentSvg.querySelector('parsererror'))throw new Error('未产生有效 SVG');
    const box=root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
    if(!box||box.length!==4||box.some(n=>!Number.isFinite(n))||box[2]<=0||box[3]<=0)throw new Error('图的尺寸无效');
    // Mindmap SVG uses numeric IDs. Keep authored identities from Mermaid's own parser, never label guesses.
    if(root.getAttribute('aria-roledescription')==='mindmap'){
      const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);
      const pending=[diagram.db.getMindmap()];
      while(pending.length){
        const node=pending.pop();if(!node)continue;
        const element=[...root.querySelectorAll('g.node')].find(el=>el.id===`node_${node.id}`||el.id.endsWith(`-node_${node.id}`));
        element?.setAttribute('data-asl-node',node.nodeId);
        pending.push(...node.children);
      }
    }
    // Do not activate Mermaid callbacks, external URLs, or user-provided event handlers.
    for(const element of root.querySelectorAll('*')){
      if(['script','iframe','image'].includes(element.localName)){element.remove();continue;}
      for(const attribute of [...element.attributes])if(/^on/i.test(attribute.name)||(/href$/i.test(attribute.name)&&!attribute.value.startsWith('#')))element.removeAttribute(attribute.name);
    }
    if(Object.keys(layout.nodes).length||Object.keys(layout.edges).length){
      container.appendChild(root);flowCanvas(root,flowchartItems(source),layout);
    }
    return new XMLSerializer().serializeToString(root);
  } finally {container.remove();}
}
