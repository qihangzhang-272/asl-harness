// Edit the rendered label in its original SVG position, not in a separate dialog.
export function editRenderedLabel(element,item,onCommit) {
  const svg=element.closest('svg');if(!svg||svg.querySelector('.mermaid-label-editor'))return;
  const label=element.matches('text,g.label')?element:item.kind==='node'?element.querySelector('g.label'):element.matches('path')?null:element;
  const rect=(label||element).getBoundingClientRect(),matrix=svg.getScreenCTM();if(!matrix)return;
  const inverse=matrix.inverse(),point=new DOMPoint(rect.x,rect.y).matrixTransform(inverse);
  let width=rect.width/Math.abs(matrix.a),height=rect.height/Math.abs(matrix.d);
  if(item.kind==='edge'&&!label){const p=element.getPointAtLength(element.getTotalLength()/2),center=new DOMPoint(p.x,p.y).matrixTransform(element.getScreenCTM()).matrixTransform(inverse);width=160;height=28;point.x=center.x-width/2;point.y=center.y-height/2;}
  const object=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
  object.classList.add('mermaid-label-editor');object.setAttribute('x',point.x-8);object.setAttribute('y',point.y-3);object.setAttribute('width',Math.max(60,width+16));object.setAttribute('height',Math.max(26,height+6));
  const input=document.createElement('div');input.contentEditable='true';input.setAttribute('role','textbox');input.setAttribute('aria-label',item.kind==='node'?'节点文字':'连线文字');input.spellcheck=false;input.textContent=item.label;
  if(label)label.style.visibility='hidden';
  let finished=false;
  const restore=()=>{if(label)label.style.visibility='';object.remove();};
  const finish=save=>{
    if(finished)return;finished=true;const value=input.innerText.trim();
    if(!save||value===item.label){restore();return;}
    // Keep the new text in place until the saved source replaces this SVG.
    input.contentEditable='false';input.removeAttribute('role');input.removeAttribute('aria-label');input.blur();
    Promise.resolve(onCommit(value)).then(accepted=>{if(accepted===false)restore();},restore);
  };
  input.onblur=()=>finish(true);
  input.onkeydown=event=>{event.stopPropagation();if(event.isComposing)return;if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();finish(true);}else if(event.key==='Escape'){event.preventDefault();finish(false);}};
  input.onclick=input.ondblclick=input.oncontextmenu=event=>event.stopPropagation();
  object.appendChild(input);svg.appendChild(object);input.focus();
  const range=document.createRange();range.selectNodeContents(input);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}
