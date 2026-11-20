import React, {useEffect, useRef, useState} from 'react';
import {Icon} from './Icon';

const min=200, max=420, initial=278;
function stored(key:string) { try { return localStorage.getItem('report-builder.library.'+key); } catch {return null;} }
function remember(key:string,value:string) { try { localStorage.setItem('report-builder.library.'+key,value); } catch { /* Private browsing can disable storage. */ } }
function constrain(n:number) {return Math.max(min,Math.min(max,n));}

export function LibraryLayout({library,children}:{library:React.ReactNode;children:React.ReactNode}) {
  const [hidden,setHidden]=useState(()=>{const pref=stored('hidden');return pref===null?window.matchMedia('(max-width:760px)').matches:pref==='true';});
  const [width,setWidth]=useState(()=>constrain(Number(stored('width')) || initial));
  const drag=useRef<{x:number; width:number} | null>(null);
  const layout=useRef<HTMLDivElement>(null);
  useEffect(()=>{layout.current?.style.setProperty('--library-width',width+'px');},[width]);
  useEffect(()=>{remember('width',String(width));},[width]);
  useEffect(()=>{remember('hidden',String(hidden));},[hidden]);
  return <div ref={layout} className={'layout editor-layout'+(hidden?' library-hidden':'')}>
    <div className="library-wrap">
      <button className="library-visibility" aria-label={hidden?'Show field library':'Hide field library'} aria-expanded={!hidden} aria-controls="library-contents"
        title={hidden?'Show field library':'Hide field library'} onClick={()=>setHidden(!hidden)}>
        <Icon name={hidden?'layers':'chevron'} size={16}/><span>{hidden?'Show library':'Hide library'}</span></button>
      <div id="library-contents" hidden={hidden}>{library}</div>
      {!hidden && <div className="library-resize" role="separator" tabIndex={0} aria-label="Field library width"
        aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={width}
        title="Drag to resize or use the arrow keys"
        onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,width};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(drag.current)setWidth(constrain(drag.current.width+e.clientX-drag.current.x));}}
        onLostPointerCapture={()=>{drag.current=null;}}
        onKeyDown={e=>{const widths:Record<string,number>={ArrowLeft:width-16,ArrowRight:width+16,Home:min,End:max};
          if(e.key in widths){e.preventDefault();setWidth(constrain(widths[e.key]));}}}/>}
    </div>{children}</div>;
}
