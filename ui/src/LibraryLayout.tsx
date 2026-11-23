import React, {useEffect, useRef, useState} from 'react';
import {Icon} from './Icon';

const min=200, max=420, initial=272;
function stored(key:string) { try { return localStorage.getItem('report-builder.library.'+key); } catch {return null;} }
function remember(key:string,value:string) { try { localStorage.setItem('report-builder.library.'+key,value); } catch { /* Private browsing can disable storage. */ } }
function constrain(n:number) {return Math.max(min,Math.min(max,n));}

export function LibraryLayout({library,children}:{library:React.ReactNode;children:React.ReactNode}) {
  const [hidden,setHidden]=useState(()=>{const pref=stored('hidden');return pref===null?window.matchMedia('(max-width:900px)').matches:pref==='true';});
  const [width,setWidth]=useState(()=>constrain(Number(stored('width')) || initial));
  const [availableWidth,setAvailableWidth]=useState(()=>document.documentElement.clientWidth);
  const drag=useRef<{x:number; width:number} | null>(null);
  const layout=useRef<HTMLElement>(null);
  const maxWidth=constrain(Math.floor(availableWidth/3));
  const libraryWidth=Math.min(width,maxWidth);
  const layoutStyle={'--library-width':libraryWidth+'px'} as React.CSSProperties;
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setAvailableWidth(entry.contentRect.width));
    const editor=layout.current?.parentElement;
    if(editor)observer.observe(editor);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{remember('width',String(width));},[width]);
  useEffect(()=>{remember('hidden',String(hidden));},[hidden]);
  function resize(nextWidth:number) {
    const next=Math.min(constrain(nextWidth),maxWidth);
    if(next!==libraryWidth)setWidth(next);
  }
  return <section ref={layout} style={layoutStyle} className={'build-report'+(hidden?' library-hidden':'')} aria-labelledby="build-report-heading">
    <div className="pane-header build-header"><h2 id="build-report-heading">Build Report</h2></div>
    <aside className="library-wrap" aria-labelledby="source-fields-heading">
      <div className="library-heading">
        <h3 id="source-fields-heading">Fields</h3>
        <button type="button" className="icon-button library-visibility" aria-label={hidden?'Show fields':'Hide fields'} aria-expanded={!hidden}
          aria-controls="library-contents" title={hidden?'Show fields':'Hide fields'} onClick={()=>setHidden(!hidden)}>
          <Icon name={hidden?'layers':'collapse'} size={16}/></button>
      </div>
      <div id="library-contents" hidden={hidden}>{library}</div>
      {!hidden && <div className="library-resize" role="separator" tabIndex={0} aria-label="Field library width"
        aria-orientation="vertical" aria-valuemin={min} aria-valuemax={maxWidth} aria-valuenow={libraryWidth}
        title="Drag to resize or use the arrow keys"
        onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,width:libraryWidth};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(drag.current)resize(drag.current.width+e.clientX-drag.current.x);}}
        onLostPointerCapture={()=>{drag.current=null;}}
        onKeyDown={e=>{const widths:Record<string,number>={ArrowLeft:libraryWidth-16,ArrowRight:libraryWidth+16,Home:min,End:maxWidth};
          if(e.key in widths){e.preventDefault();resize(widths[e.key]);}}}/>}
    </aside>{children}</section>;
}
