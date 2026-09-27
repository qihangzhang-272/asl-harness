import React from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft} from 'lucide-react';

// Same form contract as a dialog, but placed in the main navigation surface.
export default function EditorPage({title,children,onClose}) {
  const target=document.getElementById('editor-page');
  if(!target)return null;
  return createPortal(<section className="editor-page">
    <header className="editor-page-heading"><button onClick={onClose}><ArrowLeft size={17}/>返回</button><h1>{title}</h1></header>
    {children}
  </section>,target);
}
