import React, {useEffect, useRef, useState} from 'react';
import {Icon} from './Icon';

const min=480, initial=624;
function stored(key:string) { try { return localStorage.getItem('report-builder.library.'+key); } catch {return null;} }
function remember(key:string,value:string) { try { localStorage.setItem('report-builder.library.'+key,value); } catch { /* Private browsing can disable storage. */ } }

export function LibraryLayout({library,children}:{library:React.ReactNode;children:React.ReactNode}) {
  const [hidden,setHidden]=useState(()=>{const pref=stored('hidden');return pref===null?window.matchMedia('(max-width:900px)').matches:pref==='true';});
  const [width,setWidth]=useState(()=>Number(stored('build-width')) || initial);
  const [availableWidth,setAvailableWidth]=useState(()=>document.documentElement.clientWidth);
  const drag=useRef<{x:number; width:number} | null>(null);
  const layout=useRef<HTMLElement>(null);
  const maxWidth=Math.max(min,Math.floor(availableWidth*.72));
  const buildWidth=Math.max(min,Math.min(width,maxWidth));
  const layoutStyle={'--build-width':buildWidth+'px'} as React.CSSProperties;
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setAvailableWidth(entry.contentRect.width));
    const editor=layout.current?.parentElement;
    if(editor)observer.observe(editor);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{remember('build-width',String(width));},[width]);
  useEffect(()=>{remember('hidden',String(hidden));},[hidden]);
  function resize(nextWidth:number) {
    const next=Math.max(min,Math.min(nextWidth,maxWidth));
    if(next!==buildWidth)setWidth(next);
  }
  return <section id="build-report-pane" ref={layout} style={layoutStyle} className={'build-report'+(hidden?' library-hidden':'')} aria-labelledby="build-report-heading">
    <div className="pane-header build-header"><h2 id="build-report-heading">Build Report</h2></div>
    <aside className="library-wrap" aria-labelledby="objects-heading">
      <div className="library-heading">
        <h3 id="objects-heading"><button type="button" className="pane-disclosure" aria-expanded={!hidden}
          aria-controls="library-contents" onClick={()=>setHidden(value=>!value)}>
          <Icon name="chevron" size={16}/><Icon name="layers" size={16}/>Objects
        </button></h3>
      </div>
      <div id="library-contents" hidden={hidden}>{library}</div>
    </aside>
    {children}
    <div className="build-resize" role="separator" tabIndex={0} aria-label="Build Report pane width" aria-controls="build-report-pane"
      aria-orientation="vertical" aria-valuemin={min} aria-valuemax={maxWidth} aria-valuenow={buildWidth}
      title="Drag to resize or use the arrow keys"
      onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,width:buildWidth};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{if(drag.current)resize(drag.current.width+e.clientX-drag.current.x);}}
      onLostPointerCapture={()=>{drag.current=null;}}
      onKeyDown={e=>{const widths:Record<string,number>={ArrowLeft:buildWidth-16,ArrowRight:buildWidth+16,Home:min,End:maxWidth};
        if(e.key in widths){e.preventDefault();resize(widths[e.key]);}}}/>
  </section>;
}
