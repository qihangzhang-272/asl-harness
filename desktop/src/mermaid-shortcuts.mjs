export const canvasKeys=[
  ['选择 / 平移工具','V / H'],['临时平移','按住空格拖动 / 鼠标中键'],
  ['多选 / 框选','Shift + 单击 / 拖动空白处'],['全选','Ctrl / ⌘ + A'],
  ['改名 / 打开技能','Enter 或 F2 / Ctrl / ⌘ + Enter'],['移动节点','方向键；Shift 加速'],
  ['复制 / 剪切 / 粘贴','Ctrl / ⌘ + C / X / V'],['创建副本','Ctrl / ⌘ + D'],
  ['删除选中内容','Delete / Backspace'],['撤销','Ctrl / ⌘ + Z'],
  ['重做','Ctrl / ⌘ + Shift + Z；Ctrl + Y'],['缩放','+ / −；Ctrl / ⌘ + 滚轮'],
  ['显示全图 / 100%','Shift + 1 / Shift + 0'],['取消 / 快捷键说明','Esc / ?'],
];

// Scoped to the focused canvas. Never consume text-editor or IME commands.
export function canvasShortcut(event){
  if(event.defaultPrevented||event.isComposing||event.altKey||event.target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return null;
  const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;
  if(mod){
    if(key==='z')return event.shiftKey?'redo':'undo';
    if(key==='y')return 'redo';
    return {a:'all',c:'copy',x:'cut',v:'paste',d:'duplicate',enter:'open'}[key]||null;
  }
  if(event.code==='Space'||key===' ')return 'pan-hold';
  if(event.shiftKey&&event.code==='Digit1')return 'fit';
  if(event.shiftKey&&event.code==='Digit0')return 'actual';
  if(key.startsWith('arrow'))return 'nudge';
  return {v:'select-tool',h:'hand-tool',enter:'edit',f2:'edit',delete:'delete',backspace:'delete',escape:'escape','?':'help','+':'zoom-in','=':'zoom-in','-':'zoom-out'}[key]||null;
}
