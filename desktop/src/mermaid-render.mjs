let library;
let counter=0;
export async function renderDiagram(source) {
  if(typeof source!=='string'||!source.trim()||source.length>50000)throw new Error('图内容需为 1–50000 字的 Mermaid 原文');
  library ||= import('mermaid').then(({default:mermaid})=>{
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:50000,maxEdges:500,
      secure:['securityLevel','startOnLoad','suppressErrorRendering','maxTextSize','maxEdges','themeCSS','htmlLabels'],
      htmlLabels:false,theme:'base',look:'classic',fontFamily:'Segoe UI, Microsoft YaHei, sans-serif',
      themeVariables:{primaryColor:'#f2f7ff',primaryBorderColor:'#8ba9d9',primaryTextColor:'#233957',lineColor:'#7c96bd',secondaryColor:'#eaf2ff',tertiaryColor:'#f8faff',fontSize:'15px',
        actorBkg:'#f2f7ff',actorBorder:'#8ba9d9',actorTextColor:'#233957',signalColor:'#7c96bd',signalTextColor:'#233957',
        noteBkgColor:'#eaf2ff',noteBorderColor:'#8ba9d9',noteTextColor:'#233957',
        ...Object.fromEntries(Array.from({length:12},(_,i)=>[[`cScale${i}`,['#f2f7ff','#eaf2ff','#f8faff'][i%3]],[`cScaleLabel${i}`,'#233957'],[`cScaleInv${i}`,'#8ba9d9']]).flat()),
      },
      themeCSS:'.mindmap-node .label text { text-anchor: middle; } .mindmap-node .node-bkg ~ .label text { text-anchor: start; } .mindmap-node .label-container { stroke: #8ba9d9; stroke-width: 1px; } [class*="section-edge-"] { stroke: #7c96bd; stroke-width: 1.5px; }',
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
    return new XMLSerializer().serializeToString(root);
  } finally {container.remove();}
}
