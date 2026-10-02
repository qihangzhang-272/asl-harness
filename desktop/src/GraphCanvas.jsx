import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionMode,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box, ChartNoAxesCombined, Layers3, Minus, Palette, PanelsTopLeft, PenLine, Plus, Puzzle, Scan, Search, Send,
} from 'lucide-react';
import {EDGE_OFFSET, EDGE_RADIUS, HANDLES, LABEL, LIMITS, NODE_SIZE, SHARED, labelScale, labelText, placeLabels} from './graph-model.mjs';

const NODE_ICONS = {Box, Search, Send, Palette, PenLine, ChartNoAxesCombined, PanelsTopLeft, Layers3, Puzzle};
const HANDLE_POSITION = {top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left};
const CanvasActions = createContext(null);
const FIT_VIEW = {padding: 0.12, maxZoom: 1.1};

function NodeIcon({value, color}) {
  if (!value) return null;
  const Icon = NODE_ICONS[value];
  if (Icon) return <Icon size={15} />;
  if (value.startsWith('<svg')) {
    const markup = value.includes('xmlns=') ? value : value.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return <img alt="" width={15} height={15} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup.replaceAll('currentColor', color || '#007aff'))}`} />;
  }
  return <span className="graph-node-emoji" aria-hidden="true">{value}</span>;
}

// One complete skill per node. Four magnetic points; never an execution step.
function SkillNode({id, data, selected, positionAbsoluteX, positionAbsoluteY}) {
  const actions = useContext(CanvasActions);
  const {x,y,zoom}=useViewport();
  const width=useStore(state=>state.width),height=useStore(state=>state.height);
  const center=x+(positionAbsoluteX+NODE_SIZE.width/2)*zoom;
  const bottom=y+(positionAbsoluteY+NODE_SIZE.height)*zoom;
  const toolbarPosition=height-bottom<190 && bottom>height/2?Position.Top:Position.Bottom;
  const toolbarAlign=center<140?'start':center>width-140?'end':'center';
  return (
    <div className={`graph-node${selected ? ' is-selected' : ''}`} data-skill={id}>
      {HANDLES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={HANDLE_POSITION[side]}
          isConnectableStart={!actions?.readOnly}
          isConnectableEnd={!actions?.readOnly}
          className="graph-handle"
          style={data.color ? {borderColor: data.color} : undefined}
          aria-label={`${side} 连接点`}
        />
      ))}
      {data.icon ? <span className="graph-node-icon" style={data.color ? {color: data.color} : undefined}><NodeIcon value={data.icon} color={data.color} /></span> : null}
      <span className="graph-node-text">
        <strong>{data.title}</strong>
        {data.note ? <small>{data.note}</small> : null}
      </span>
      <NodeToolbar isVisible={selected && !actions?.readOnly} position={toolbarPosition} align={toolbarAlign} offset={10}>
        <div className="graph-inline-editor nodrag nopan" onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
          <input aria-label="节点显示名称" autoFocus maxLength={LIMITS.title} value={data.title} onChange={event=>actions.editNode(id,{title:event.target.value},'title')}/>
          <textarea aria-label="节点备注" rows={2} maxLength={LIMITS.note} value={data.note||''} placeholder="备注" onChange={event=>actions.editNode(id,{note:event.target.value},'note')}/>
          <div className="graph-inline-actions"><input aria-label="节点图标" title="图标或 Emoji" placeholder="图标" value={data.icon||''} maxLength={16000} onChange={event=>actions.editNode(id,{icon:event.target.value},'icon')}/>
            <input type="color" aria-label="节点颜色" value={data.color || '#3978e8'} onChange={event=>actions.editNode(id,{color:event.target.value},'color')}/>
            <button onClick={()=>actions.removeNode(id)}>移除</button><button onClick={()=>actions.select(null,null)}>完成</button>
          </div>
        </div>
      </NodeToolbar>
    </div>
  );
}

// Edge label sits on the line and stays clickable. The optional condition gets
// its own small badge so it is readable on the canvas, not only in the inspector.
function SkillEdge({id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd}) {
  const actions = useContext(CanvasActions);
  const {zoom} = useViewport();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: EDGE_RADIUS, offset: EDGE_OFFSET,
  });
  // Zooming out shrinks this text with the diagram; scale it back so the meaning stays readable.
  // Where the box goes is settled once per scope (placeLabels) from the same real anchor. When the
  // box had to leave that anchor, a thin leader and a dot keep the meaning on its own line instead
  // of parked under the nearest node.
  const scale = labelScale(zoom);
  const at = data?.at;
  const label = (data?.label || '').trim();
  const condition = (data?.condition || '').trim();
  const hint = labelText(label, condition) || '添加关联含义';
  return (
    <>
      <BaseEdge id={id} path={path} className="graph-edge-line" markerEnd={markerEnd} interactionWidth={22} />
      <EdgeLabelRenderer>
        {at?.leader ? (
          <svg className="graph-edge-leader" data-edge-id={id} aria-hidden="true">
            <line className="graph-edge-leader-line" x1={at.anchor.x} y1={at.anchor.y} x2={at.leader.x} y2={at.leader.y} />
            <circle className="graph-edge-leader-dot" cx={at.anchor.x} cy={at.anchor.y} r={2.4} />
          </svg>
        ) : null}
        {selected && !actions?.readOnly ? <div className="graph-inline-editor graph-inline-edge nodrag nopan"
          style={{transform:`translate(-50%, 12px) translate(${at ? at.x : labelX}px, ${at ? at.y : labelY}px) scale(${scale})`}}
          onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
          <input autoFocus aria-label="关联含义" placeholder="关联备注" maxLength={LIMITS.label} value={data?.label||''} onChange={event=>actions.editEdge(id,{label:event.target.value},'label')}/>
          <input aria-label="关联选择条件" placeholder="条件（可选）" maxLength={LIMITS.condition} value={data?.condition||''} onChange={event=>actions.editEdge(id,{condition:event.target.value},'condition')}/>
          <div className="graph-inline-actions"><button onClick={()=>actions.removeEdge(id)}>移除连线</button><button onClick={()=>actions.select(null,null)}>完成</button></div>
        </div> : <button
          type="button"
          data-edge-id={id}
          className={`graph-edge-label nodrag nopan${label || condition ? '' : ' is-empty'}${selected ? ' is-selected' : ''}`}
          style={{transform: `translate(-50%, -50%) translate(${at ? at.x : labelX}px, ${at ? at.y : labelY}px) scale(${scale})`, maxWidth: at ? at.width : LABEL.max}}
          title={hint}
          aria-label={label ? `关联含义：${label}${condition ? `；条件：${condition}` : ''}` : condition ? `关联条件：${condition}` : '添加关联含义'}
          onClick={(event) => {
            event.stopPropagation();
            actions?.select('edge', id);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            actions?.open('edge', id);
          }}
          onContextMenu={event=>actions?.contextMenu?.(event,'edge',id)}
        >
          {label ? <span className="graph-edge-text">{label}</span> : condition ? null : <span className="graph-edge-text">+</span>}
          {condition ? <span className="graph-edge-condition" title={condition}>{condition}</span> : null}
        </button>}
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {skill: SkillNode};
const edgeTypes = {skill: SkillEdge};

function mergeSelection(previous, next) {
  const byId = new Map(previous.map((item) => [item.id, item]));
  // Text edits must not discard measured geometry and hide the node for a frame.
  return next.map((item) => {
    const old = byId.get(item.id);
    return {...(old?.measured ? {measured: old.measured} : {}), ...item, selected: !!old?.selected};
  });
}

function Canvas({scopeId, graph, selection, reducedMotion, readOnly=false, onMoveNode, onConnectEdge, onRemoveEdge, onRemoveNode, onEditNode, onEditEdge, onNudge, onSelect, onOpen, onDropSkill}) {
  const flow = useReactFlow();
  const surface=useRef(null);
  const [menu,setMenu]=useState(null);
  function contextMenu(event,kind,id) {
    if(readOnly)return;
    event.preventDefault();event.stopPropagation();onSelect?.(null);
    const bounds=surface.current.getBoundingClientRect();
    setMenu({kind,id,x:Math.max(0,Math.min(event.clientX-bounds.left,bounds.width-152)),y:Math.max(0,Math.min(event.clientY-bounds.top,bounds.height-82))});
  }
  useEffect(()=>{setMenu(null);},[scopeId]);
  const [nodes, setNodes, applyNodes] = useNodesState(graph.nodes);
  const [edges, setEdges, applyEdges] = useEdgesState(graph.edges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const displayedNodes=useMemo(()=>readOnly?nodes.map(node=>({...node,draggable:false})):nodes,[nodes,readOnly]);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const zoom = useStore((state) => state.transform[2]);
  const width=useStore(state=>state.width),height=useStore(state=>state.height);
  // Labels are laid out together: the next one steps around the ones already placed.
  const labelAt = useMemo(() => placeLabels({nodes: displayedNodes, edges, zoom}), [displayedNodes, edges, zoom]);
  const displayEdges = useMemo(
    () => edges.map((edge) => (labelAt[edge.id] ? {...edge, data: {...edge.data, at: labelAt[edge.id]}} : edge)),
    [edges, labelAt],
  );

  useEffect(() => {
    setNodes((current) => mergeSelection(current, graph.nodes));
  }, [graph.nodes, setNodes]);
  useEffect(() => {
    setEdges((current) => mergeSelection(current, graph.edges));
  }, [graph.edges, setEdges]);
  useEffect(() => {
    const nodeId = selection?.kind === 'node' ? selection.id : null;
    const edgeId = selection?.kind === 'edge' ? selection.id : null;
    setNodes(current=>current.some(node=>!!node.selected!==(node.id===nodeId))?current.map(node=>({...node,selected:node.id===nodeId})):current);
    setEdges(current=>current.some(edge=>!!edge.selected!==(edge.id===edgeId))?current.map(edge=>({...edge,selected:edge.id===edgeId})):current);
  }, [selection?.kind,selection?.id,setNodes,setEdges]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => flow.fitView({...FIT_VIEW, duration: reducedMotion ? 0 : 180}));
    return () => cancelAnimationFrame(frame);
  }, [scopeId, width, height, flow, reducedMotion]);

  const fit = useCallback(() => flow.fitView({...FIT_VIEW, duration: reducedMotion ? 0 : 180}), [flow, reducedMotion]);
  const isValidConnection = useCallback((connection) => (
    connection.source !== connection.target
    && !edgesRef.current.some((edge) => edge.source === connection.source && edge.target === connection.target)
  ), []);

  function handleDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }
  function handleDrop(event) {
    if (readOnly) return;
    event.preventDefault();
    const transfer = event.dataTransfer;
    const skillId = transfer?.getData('application/x-asl-skill') || '';
    const source = transfer?.getData('application/x-asl-skill-source') || '';
    const payload = skillId ? {id: skillId} : source ? {source} : null;
    if (!payload) return;
    const point = flow.screenToFlowPosition({x: event.clientX, y: event.clientY});
    onDropSkill(payload, {x: point.x - NODE_SIZE.width / 2, y: point.y - NODE_SIZE.height / 2});
  }
  function handleKeyDown(event) {
    if (readOnly) return;
    if(event.key==='Escape'){setMenu(null);onSelect?.(null);return;}
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('input, textarea, select')) return;
    const selectedEdges = edgesRef.current.filter((edge) => edge.selected);
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdges.length) {
      event.preventDefault();
      for (const edge of selectedEdges) onRemoveEdge(edge.id);
      return;
    }
    const step = {ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]}[event.key];
    const selectedNodes = nodesRef.current.filter((node) => node.selected);
    if ((event.key==='Delete'||event.key==='Backspace') && selectedNodes.length) {
      event.preventDefault();for(const node of selectedNodes)onRemoveNode?.(node.id);return;
    }
    if (step && selectedNodes.length) {
      event.preventDefault();
      const distance = event.shiftKey ? 1 : 8;
      onNudge(selectedNodes.map((node) => node.id), {x: step[0] * distance, y: step[1] * distance});
    }
  }

  return (
    <div ref={surface} className={`graph-canvas${readOnly ? ' is-readonly' : ''}`} onDragOver={readOnly ? undefined : handleDragOver} onDrop={handleDrop} onKeyDown={handleKeyDown}>
      <CanvasActions.Provider value={{readOnly,select: (kind, id) => {setMenu(null);return readOnly ? onOpen?.(kind,id) : onSelect(kind?{kind, id}:null);}, open: onOpen,
        editNode:onEditNode,editEdge:onEditEdge,removeNode:onRemoveNode,removeEdge:onRemoveEdge,contextMenu}}>
        <ReactFlow
          nodes={displayedNodes}
          edges={displayEdges}
          onNodesChange={applyNodes}
          onEdgesChange={applyEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDragStop={(_, node) => {
            if (readOnly) return;
            const positions = {};
            for (const current of nodesRef.current) {
              positions[current.id] = current.id === node.id ? node.position : current.position;
            }
            onMoveNode(positions);
          }}
          onConnect={readOnly ? undefined : onConnectEdge}
          nodesConnectable={!readOnly && scopeId!==SHARED}
          disableKeyboardA11y={!readOnly}
          onNodeClick={(_,node)=>{setMenu(null);readOnly?onOpen?.('node',node.id):onSelect({kind:'node',id:node.id});}}
          onEdgeClick={(_,edge)=>{setMenu(null);readOnly?onOpen?.('edge',edge.id):onSelect({kind:'edge',id:edge.id});}}
          onNodeContextMenu={(event,node)=>contextMenu(event,'node',node.id)}
          onEdgeContextMenu={(event,edge)=>contextMenu(event,'edge',edge.id)}
          onMoveStart={()=>setMenu(null)}
          onNodeDoubleClick={(_, node) => onOpen?.('node', node.id)}
          onEdgeDoubleClick={(_, edge) => onOpen?.('edge', edge.id)}
          onPaneClick={() => {setMenu(null);onSelect?.(null);}}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={28}
          connectionLineStyle={{stroke: '#3978e8', strokeWidth: 1.4}}
          isValidConnection={isValidConnection}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          selectNodesOnDrag={false}
          nodeDragThreshold={1}
          minZoom={0.25}
          maxZoom={2}
          fitView
          fitViewOptions={FIT_VIEW}
          defaultEdgeOptions={{type: 'skill', markerEnd: {type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#b9c6dc'}}}
          proOptions={{hideAttribution: true}}
          className="graph-flow"
          aria-label="工作范式节点画布"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#dde5f2" />
        </ReactFlow>
      </CanvasActions.Provider>
      {menu && <div role="menu" className="graph-context-menu" style={{left:menu.x,top:menu.y}}>
        <button role="menuitem" autoFocus onClick={()=>{onSelect({kind:menu.kind,id:menu.id});setMenu(null);}}>编辑</button>
        <button role="menuitem" onClick={()=>{menu.kind==='edge'?onRemoveEdge(menu.id):onRemoveNode(menu.id);setMenu(null);}}>移除</button>
      </div>}
      <div className="graph-canvas-controls">
        <button type="button" aria-label="缩小" title="缩小" onClick={() => flow.zoomOut({duration: reducedMotion ? 0 : 120})}><Minus size={15} /></button>
        <button type="button" aria-label="适应画布" title="适应画布" onClick={fit}><Scan size={15} /></button>
        <button type="button" aria-label="放大" title="放大" onClick={() => flow.zoomIn({duration: reducedMotion ? 0 : 120})}><Plus size={15} /></button>
      </div>
    </div>
  );
}

export default function GraphCanvas(props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
