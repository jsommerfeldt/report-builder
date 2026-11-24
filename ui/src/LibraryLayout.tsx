import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Icon} from './Icon';

const min=480, initial=624;
const minShare=32, maxShare=54, initialShare=44;
function stored(key:string) { try { return localStorage.getItem('report-builder.library.'+key); } catch {return null;} }
function remember(key:string,value:string) { try { localStorage.setItem('report-builder.library.'+key,value); } catch { /* Private browsing can disable storage. */ } }

interface DividerProps {
  className:string; label:string; controls:string; min:number; max:number; value:number;
  step:number; dragScale?:number; valueText?:string; onResize(value:number):void;
}

function PaneDivider({className,label,controls,min,max,value,step,dragScale=1,valueText,onResize}:DividerProps) {
  const drag=useRef<{x:number; value:number} | null>(null);
  function resize(next:number) {
    onResize(Math.max(min, Math.min(Math.round(next),max)));
  }
  return <div className={className} role="separator" tabIndex={0} aria-label={label} aria-controls={controls}
    aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}
    title="Drag to resize or use the arrow keys"
    onPointerDown={e=>{
      if(e.button!==0 || !e.isPrimary)return;
      drag.current={x:e.clientX,value};
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e=>{if(drag.current)resize(drag.current.value+(e.clientX-drag.current.x)*dragScale);}}
    onLostPointerCapture={()=>{drag.current=null;}}
    onKeyDown={e=>{
      const stops:Record<string,number>={ArrowLeft:value-step,ArrowRight:value+step,Home:min,End:max};
      if(e.key in stops){e.preventDefault();resize(stops[e.key]);}
    }}/>;
}

export function LibraryLayout({library,headerAction,children,newReport,searchRef,focusRequest}:{
  library:React.ReactNode;headerAction:React.ReactNode;children:React.ReactNode;newReport:boolean;
  searchRef:React.RefObject<HTMLInputElement>;focusRequest:{trigger:HTMLButtonElement}|null;
}) {
  const prefix=newReport?'new-report-':'';
  const [hidden,setHidden]=useState(()=>{const pref=stored(prefix+'hidden');return pref===null?window.matchMedia('(max-width:900px)').matches:pref==='true';});
  const [width,setWidth]=useState(()=>Number(stored(prefix+'build-width')) || null);
  const [availableWidth,setAvailableWidth]=useState(()=>document.documentElement.clientWidth);
  const [objectsShare,setObjectsShare]=useState(()=>Math.max(minShare,Math.min(maxShare,Number(stored(prefix+'objects-share')) || (newReport?36:initialShare))));
  const layout=useRef<HTMLElement>(null);
  const maxWidth=Math.max(min,Math.floor(availableWidth*.72));
  const buildWidth=Math.max(min,Math.min(width??(newReport?maxWidth:initial),maxWidth));
  const layoutStyle={
    '--build-width':buildWidth+'px',
    '--objects-share':objectsShare+'fr',
    '--query-share':(100-objectsShare)+'fr',
  } as React.CSSProperties;
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setAvailableWidth(entry.contentRect.width));
    const editor=layout.current?.parentElement;
    if(editor)observer.observe(editor);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{if(width!==null)remember(prefix+'build-width',String(width));},[prefix,width]);
  useEffect(()=>{remember(prefix+'objects-share',String(objectsShare));},[prefix,objectsShare]);
  useEffect(()=>{remember(prefix+'hidden',String(hidden));},[prefix,hidden]);
  useLayoutEffect(()=>{
    if(!focusRequest)return;
    setHidden(false);
    const frame=requestAnimationFrame(()=>{
      searchRef.current?.focus();
      searchRef.current?.select();
    });
    return ()=>cancelAnimationFrame(frame);
  },[focusRequest,searchRef]);
  return <section id="build-report-pane" ref={layout} style={layoutStyle} className={'build-report'+(hidden?' library-hidden':'')} aria-labelledby="build-report-heading">
    <div className="pane-header build-header"><h2 id="build-report-heading">Build Report</h2>{headerAction}</div>
    <aside id="objects-pane" className="library-wrap" aria-labelledby="objects-heading">
      <div className="library-heading">
        <h3 id="objects-heading"><button type="button" className="pane-disclosure" aria-expanded={!hidden}
          aria-controls="library-contents" onClick={()=>setHidden(value=>!value)}>
          <Icon name="chevron" size={16}/><Icon name="layers" size={16}/>Objects
        </button></h3>
      </div>
      <div id="library-contents" hidden={hidden}>{library}</div>
      <PaneDivider className="split-resize" label="Objects and Query split" controls="objects-pane"
        min={minShare} max={maxShare} value={objectsShare} step={1} dragScale={100/(buildWidth-1)}
        valueText={objectsShare+'% Objects, '+(100-objectsShare)+'% Query'} onResize={setObjectsShare}/>
    </aside>
    {children}
    <PaneDivider className="build-resize" label="Build Report pane width" controls="build-report-pane"
      min={min} max={maxWidth} value={buildWidth} step={16} onResize={next=>{if(next!==buildWidth)setWidth(next);}}/>
  </section>;
}
