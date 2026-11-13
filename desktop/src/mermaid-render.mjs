import {flowchartItems,readLayout} from './mermaid-document.mjs';
import {flowCanvas} from './mermaid-canvas.mjs';
let library;
let counter=0;
export async function renderDiagram(source) {
  if(typeof source!=='string'||!source.trim()||source.length>50000)throw new Error('图内容需为 1–50000 字的 Mermaid 原文');
  const layout=readLayout(source);
  library ||= import('mermaid').then(({default:mermaid})=>{
    // Measure with the same Stitch tokens used by both mounted frontends.
    const style=getComputedStyle(document.querySelector('.asl-ws,.asl-desktop')||document.documentElement);
    const token=(name,fallback)=>style.getPropertyValue(name).trim()||fallback;
    const size=(name,fallback)=>parseFloat(token(name,''))||fallback;
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:50000,maxEdges:500,
      secure:['securityLevel','startOnLoad','suppressErrorRendering','maxTextSize','maxEdges','themeCSS','htmlLabels'],
      htmlLabels:false,theme:'base',look:'classic',fontFamily:style.fontFamily,
      themeVariables:{primaryColor:'#ffffff',primaryBorderColor:'#c5cbd4',primaryTextColor:'#252a34',lineColor:'#a0a9b6',secondaryColor:'#f0f3f7',tertiaryColor:'#f7f8fa',fontSize:'16px',edgeLabelBackground:'#f7f8fa',clusterBkg:'#f1f4f8',clusterBorder:'#dce1e8',
        actorBkg:'#ffffff',actorBorder:'#7c828c',actorTextColor:'#1d1d1f',signalColor:'#747a84',signalTextColor:'#1d1d1f',
        noteBkgColor:'#f0f1f3',noteBorderColor:'#7c828c',noteTextColor:'#1d1d1f',
        ...Object.fromEntries(Array.from({length:12},(_,i)=>[[`cScale${i}`,['#ffffff','#f0f1f3','#f5f5f7'][i%3]],[`cScaleLabel${i}`,'#1d1d1f'],[`cScaleInv${i}`,'#7c828c']]).flat()),
        ...(token('--diagram-font-size','')?{fontSize:token('--diagram-font-size','16px'),primaryColor:token('--node-bg','#ffffff'),primaryTextColor:token('--ink','#1d1d1f'),primaryBorderColor:token('--node-stroke','#c5cbd4'),lineColor:token('--edge-stroke','#a0a9b6'),edgeLabelBackground:token('--edge-label-bg','#f7f8fa'),secondaryColor:token('--surface','#ffffff'),tertiaryColor:token('--surface-muted','#f0f3f7'),clusterBkg:token('--surface','#ffffff'),clusterBorder:token('--line','#dce1e8')}:{}),
      },
      themeCSS:'.node .label { font-weight: 550; } .node > rect.basic { rx: 10px; ry: 10px; } .edgeLabel { font-size: '+token('--diagram-font-size','12px')+'; color: #596579; } .edgeLabel rect { rx: 4px; ry: 4px; } .mindmap-node .label text { text-anchor: middle; } .mindmap-node .node-bkg ~ .label text { text-anchor: start; } .mindmap-node .label-container { stroke: #c5cbd4; stroke-width: 1px; } [class*="section-edge-"] { stroke: #a0a9b6; stroke-width: 1.5px; }',
      flowchart:{htmlLabels:false,curve:'basis',nodeSpacing:size('--diagram-node-spacing',42),rankSpacing:size('--diagram-rank-spacing',64),padding:size('--diagram-padding',14)},
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
