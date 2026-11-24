import React, {useEffect, useRef, useState} from 'react';
import {Icon} from './Icon';

const editorPanes={
  objects:{id:'objects-pane',label:'Objects',initial:240,min:200},
  query:{id:'query-pane',label:'Query',initial:450,min:400},
} as const;
type EditorPane=keyof typeof editorPanes;
function stored(key:string) { try { return localStorage.getItem('report-builder.library.'+key); } catch {return null;} }
function remember(key:string,value:string) { try { localStorage.setItem('report-builder.library.'+key,value); } catch { /* Private browsing can disable storage. */ } }
const layoutPrefix=(newReport:boolean)=>newReport?'new-report-':'';

interface DividerProps {
  pane:EditorPane; max:number; value:number; onResize(value:number):void;
}

function PaneDivider({pane,max,value,onResize}:DividerProps) {
  const {id,label,min}=editorPanes[pane];
  const drag=useRef<{x:number; value:number} | null>(null);
  function resize(next:number) {
    onResize(Math.max(min, Math.min(Math.round(next),max)));
  }
  return <div className="pane-resize" role="separator" tabIndex={0} aria-label={label+' pane width'} aria-controls={id}
    aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={value+' pixels'}
    title="Drag to resize or use the arrow keys"
    onPointerDown={e=>{
      if(e.button!==0 || !e.isPrimary)return;
      drag.current={x:e.clientX,value};
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e=>{if(drag.current)resize(drag.current.value+e.clientX-drag.current.x);}}
    onLostPointerCapture={()=>{drag.current=null;}}
    onKeyDown={e=>{
      const stops:Record<string,number>={ArrowLeft:value-16,ArrowRight:value+16,Home:min,End:max};
      if(e.key in stops){e.preventDefault();resize(stops[e.key]);}
    }}/>;
}

interface LayoutProps {
  library:React.ReactNode; children:React.ReactNode; newReport:boolean;
  queryVisible:boolean; toggleQuery():void; closeQuery():void;
  queryToggle:React.Ref<HTMLButtonElement>; queryClose:React.Ref<HTMLButtonElement>;
}
export function LibraryLayout({library,children,newReport,queryVisible,toggleQuery,closeQuery,queryToggle,queryClose}:LayoutProps) {
  const prefix=layoutPrefix(newReport);
  const [preferred,setPreferred]=useState(()=>({
    objects:Math.max(editorPanes.objects.min,Number(stored(prefix+'objects-width'))||editorPanes.objects.initial),
    query:Math.max(editorPanes.query.min,Number(stored(prefix+'query-width'))||editorPanes.query.initial),
  }));
  const [availableWidth,setAvailableWidth]=useState(()=>document.documentElement.clientWidth);
  const layout=useRef<HTMLElement>(null);
  const maxObjects=Math.max(editorPanes.objects.min,Math.floor(availableWidth*.4));
  const objectsWidth=Math.min(preferred.objects,maxObjects);
  const maxQuery=Math.max(editorPanes.query.min,Math.floor(availableWidth)-objectsWidth-24);
  const queryWidth=Math.min(preferred.query,maxQuery);
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setAvailableWidth(entry.contentRect.width));
    const editor=layout.current?.parentElement;
    if(editor)observer.observe(editor);
    return ()=>observer.disconnect();
  },[]);
  function resize(pane:EditorPane,value:number) {
    if(value===(pane==='objects'?objectsWidth:queryWidth))return;
    setPreferred(current=>({...current,[pane]:value}));
    remember(prefix+pane+'-width',String(value));
  }
  return <section ref={layout} className="build-report" aria-label="Build Report">
    <aside id={editorPanes.objects.id} className="builder-pane library-wrap" aria-labelledby="objects-pane-heading"
      style={{'--pane-width':objectsWidth+'px'} as React.CSSProperties}>
      <div className="builder-pane-heading">
        <h3 id="objects-pane-heading"><Icon name="layers" size={16}/>Objects</h3>
        <button ref={queryToggle} type="button" className="secondary-btn query-toggle" aria-haspopup="dialog"
          aria-controls={editorPanes.query.id} aria-expanded={queryVisible} onClick={toggleQuery}>
          <Icon name="fields" size={15}/>Query
        </button>
      </div>
      <div id="library-contents" className="library-contents">{library}</div>
      <PaneDivider pane="objects" value={objectsWidth} max={maxObjects} onResize={value=>resize('objects',value)}/>
    </aside>
    <section id={editorPanes.query.id} className="builder-pane query-controls" role="dialog" aria-labelledby="query-pane-heading"
      hidden={!queryVisible} style={{'--pane-width':queryWidth+'px'} as React.CSSProperties}>
      <div className="builder-pane-heading">
        <h3 id="query-pane-heading"><Icon name="fields" size={16}/>Query</h3>
        <button ref={queryClose} type="button" className="icon-button" aria-label="Close Query" title="Close Query" onClick={closeQuery}>
          <Icon name="close" size={16}/>
        </button>
      </div>
      {children}
      <PaneDivider pane="query" value={queryWidth} max={maxQuery} onResize={value=>resize('query',value)}/>
    </section>
  </section>;
}
