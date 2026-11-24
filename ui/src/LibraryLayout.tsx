import React, {useEffect, useRef, useState} from 'react';
import {Icon} from './Icon';

export const editorPanes={
  objects:{id:'objects-pane',contents:'library-contents',label:'Objects',icon:'layers',initial:240,min:200},
  query:{id:'query-pane',contents:'query-contents',label:'Query',icon:'fields',initial:450,min:400},
} as const;
export type EditorPane=keyof typeof editorPanes;
const compactLayout='(max-width: 900px)';
const minimumPreviewWidth=280;
function stored(key:string) { try { return localStorage.getItem('report-builder.library.'+key); } catch {return null;} }
function remember(key:string,value:string) { try { localStorage.setItem('report-builder.library.'+key,value); } catch { /* Private browsing can disable storage. */ } }
const layoutPrefix=(newReport:boolean)=>newReport?'new-report-':'';

export function useEditorPanes(newReport:boolean) {
  const prefix=layoutPrefix(newReport);
  const [compact,setCompact]=useState(()=>window.matchMedia(compactLayout).matches);
  const [drawer,setDrawer]=useState<EditorPane|null>(null);
  const [desktop,setDesktop]=useState(()=>({objects:stored(prefix+'hidden')!=='true',query:true}));
  useEffect(()=>{
    const media=window.matchMedia(compactLayout);
    function change() {setCompact(media.matches);setDrawer(null);}
    media.addEventListener('change',change);
    return ()=>media.removeEventListener('change',change);
  },[]);
  useEffect(()=>{remember(prefix+'hidden',String(!desktop.objects));},[prefix,desktop.objects]);
  function setOpen(pane:EditorPane,open:boolean) {
    if(compact)setDrawer(current=>open?pane:current===pane?null:current);
    else setDesktop(current=>({...current,[pane]:open}));
  }
  return {compact,drawer,setOpen,objectsOpen:compact?drawer==='objects':desktop.objects,
    queryOpen:compact?drawer==='query':desktop.query};
}

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

function PaneHeading({pane,buttonRef,close}:{
  pane:EditorPane;buttonRef:React.Ref<HTMLButtonElement>;close():void;
}) {
  const {id,label,icon,contents}=editorPanes[pane];
  return <div className="builder-pane-heading"><h3 id={id+'-heading'}>
    <button ref={buttonRef} type="button" className="pane-disclosure" title={'Hide '+label} aria-expanded="true"
      aria-controls={contents} onClick={close}>
      <Icon name="chevron" size={16}/><Icon name={icon} size={16}/>{label}
    </button>
  </h3></div>;
}

interface LayoutProps {
  library:React.ReactNode; children:React.ReactNode; newReport:boolean;
  objectsOpen:boolean; queryOpen:boolean; close(pane:EditorPane):void;
  headings:Record<EditorPane,React.Ref<HTMLButtonElement>>;
}
export function LibraryLayout({library,children,newReport,objectsOpen,queryOpen,close,headings}:LayoutProps) {
  const prefix=layoutPrefix(newReport);
  const [preferred,setPreferred]=useState(()=>({
    objects:Math.max(editorPanes.objects.min,Number(stored(prefix+'objects-width'))||editorPanes.objects.initial),
    query:Math.max(editorPanes.query.min,Number(stored(prefix+'query-width'))||editorPanes.query.initial),
  }));
  const [availableWidth,setAvailableWidth]=useState(()=>document.documentElement.clientWidth);
  const layout=useRef<HTMLElement>(null);
  // Give each pane a stable cap so changing its neighbour leaves its width alone.
  const minimumEditorWidth=editorPanes.objects.min+editorPanes.query.min;
  const budget=Math.max(minimumEditorWidth,Math.floor(availableWidth)-minimumPreviewWidth);
  const maxObjects=Math.floor(budget*editorPanes.objects.min/minimumEditorWidth);
  const maxQuery=budget-maxObjects;
  const objectsWidth=Math.min(preferred.objects,maxObjects);
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
  return <section ref={layout} className="build-report" aria-label="Build Report" hidden={!objectsOpen && !queryOpen}>
    <aside id={editorPanes.objects.id} className="builder-pane library-wrap" aria-labelledby="objects-pane-heading"
      hidden={!objectsOpen} style={{'--pane-width':objectsWidth+'px'} as React.CSSProperties}>
      <PaneHeading pane="objects" buttonRef={headings.objects} close={()=>close('objects')}/>
      <div id={editorPanes.objects.contents} className="library-contents">{library}</div>
      <PaneDivider pane="objects" value={objectsWidth} max={maxObjects} onResize={value=>resize('objects',value)}/>
    </aside>
    <section id={editorPanes.query.id} className="builder-pane query-controls" aria-labelledby="query-pane-heading"
      hidden={!queryOpen} style={{'--pane-width':queryWidth+'px'} as React.CSSProperties}>
      <PaneHeading pane="query" buttonRef={headings.query} close={()=>close('query')}/>
      {children}
      <PaneDivider pane="query" value={queryWidth} max={maxQuery} onResize={value=>resize('query',value)}/>
    </section>
  </section>;
}
