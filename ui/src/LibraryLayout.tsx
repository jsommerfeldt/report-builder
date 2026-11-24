import React, {useEffect, useRef, useState} from 'react';
import {Icon} from './Icon';

const editorPanes={
  objects:{id:'objects-pane',label:'Objects',initial:248,min:240},
  query:{id:'query-pane',label:'Query',initial:472,min:456},
} as const;
type EditorPane=keyof typeof editorPanes;
function stored(key:string) { try { return localStorage.getItem('report-builder.library.'+key); } catch {return null;} }
function remember(key:string,value:string) { try { localStorage.setItem('report-builder.library.'+key,value); } catch { /* Private browsing can disable storage. */ } }
const layoutPrefix=(newReport:boolean)=>newReport?'new-report-':'';
const edgeGap=8;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.round(value)));
const resizeEdges={
  'top-left':[-1,-1],top:[0,-1],'top-right':[1,-1],right:[1,0],
  'bottom-right':[1,1],bottom:[0,1],'bottom-left':[-1,1],left:[-1,0],
} as const;
type ResizeEdge=keyof typeof resizeEdges;
type PopupRect={x:number;y:number;width:number;height:number};

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
  library:React.ReactNode; children:React.ReactNode; newReport:boolean; editorSession:number;
  queryVisible:boolean; toggleQuery():void; closeQuery():void;
  objectsCollapsed:boolean; toggleObjects():void;
  queryToggle:React.Ref<HTMLButtonElement>; queryClose:React.Ref<HTMLButtonElement>;
  previewPane:React.RefObject<HTMLElement>;
  previewRun:{run():void; disabled:boolean; busy:boolean; current:boolean};
}
export function LibraryLayout({library,children,newReport,editorSession,queryVisible,toggleQuery,closeQuery,queryToggle,queryClose,
  objectsCollapsed,toggleObjects,previewPane,previewRun}:LayoutProps) {
  const prefix=layoutPrefix(newReport);
  const [preferred,setPreferred]=useState(()=>({
    objects:Math.max(editorPanes.objects.min,Number(stored(prefix+'objects-width'))||editorPanes.objects.initial),
    query:Math.max(editorPanes.query.min,Number(stored(prefix+'query-width'))||editorPanes.query.initial),
  }));
  const [queryHeight,setQueryHeight]=useState(0);
  const [queryPosition,setQueryPosition]=useState<{x:number;y:number}|null>(null);
  const [workspace,setWorkspace]=useState(()=>({
    width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,objectsHeight:0,railWidth:0,previewHeight:0,
  }));
  const layout=useRef<HTMLElement>(null);
  const objects=useRef<HTMLElement>(null);
  const rail=useRef<HTMLDivElement>(null);
  const popup=useRef<HTMLElement>(null);
  const gesture=useRef<(PopupRect & {mode:'move'|ResizeEdge;pointer:number;startX:number;startY:number})|null>(null);
  const compact=workspace.width<=700;
  const maxObjects=Math.max(editorPanes.objects.min,Math.floor(workspace.width*.4));
  const objectsWidth=Math.min(preferred.objects,maxObjects);
  const leftLimit=workspace.railWidth+edgeGap;
  const widthLimit=workspace.width-leftLimit-edgeGap;
  const heightLimit=Math.max(0,workspace.height-2*edgeGap);
  const minWidth=Math.min(editorPanes.query.min,widthLimit);
  const minHeight=Math.min(156,heightLimit);
  const queryWidth=clamp(preferred.query,minWidth,widthLimit);
  const height=queryHeight?clamp(queryHeight,minHeight,heightLimit):Math.min(heightLimit,Math.round(workspace.previewHeight*.8));
  const defaultX=compact?leftLimit:workspace.width-queryWidth-28;
  const defaultY=compact?(objectsCollapsed?52:workspace.objectsHeight+6):workspace.height*.23;
  const x=clamp(queryPosition?.x??defaultX,leftLimit,workspace.width-queryWidth-edgeGap);
  const y=clamp(queryPosition?.y??defaultY,edgeGap,workspace.height-height-edgeGap);
  const maxQueryHeight=workspace.height-y-edgeGap;
  useEffect(()=>setQueryHeight(0),[editorSession]);
  useEffect(()=>{
    const editor=layout.current?.parentElement;
    const objectPane=objects.current;
    const sidebar=rail.current;
    const preview=previewPane.current;
    if(!editor || !objectPane || !sidebar || !preview)return;
    const observer=new ResizeObserver(()=>setWorkspace({
      width:editor.clientWidth,height:editor.clientHeight,objectsHeight:objectPane.offsetHeight,railWidth:sidebar.offsetWidth,
      previewHeight:preview.offsetHeight,
    }));
    observer.observe(editor);
    observer.observe(objectPane);
    observer.observe(sidebar);
    observer.observe(preview);
    return ()=>observer.disconnect();
  },[previewPane]);
  function resize(pane:EditorPane,value:number) {
    if(value===(pane==='objects'?objectsWidth:queryWidth))return;
    setPreferred(current=>({...current,[pane]:value}));
    remember(prefix+pane+'-width',String(value));
  }
  function moveQuery(left:number,top:number,width:number,height:number) {
    setQueryPosition({x:clamp(left,leftLimit,workspace.width-width-edgeGap),
      y:clamp(top,edgeGap,workspace.height-height-edgeGap)});
  }
  function resizeQuery(edge:ResizeEdge,rect:PopupRect,dx:number,dy:number) {
    const [horizontal,vertical]=resizeEdges[edge];
    const right=rect.x+rect.width, bottom=rect.y+rect.height;
    const left=horizontal<0?clamp(rect.x+dx,leftLimit,right-minWidth):rect.x;
    const top=vertical<0?clamp(rect.y+dy,edgeGap,bottom-minHeight):rect.y;
    const nextRight=horizontal>0?clamp(right+dx,left+minWidth,workspace.width-edgeGap):right;
    const nextBottom=vertical>0?clamp(bottom+dy,top+minHeight,workspace.height-edgeGap):bottom;
    setQueryPosition({x:left,y:top});
    if(horizontal)resize('query',nextRight-left);
    if(vertical)setQueryHeight(nextBottom-top);
  }
  function startGesture(mode:'move'|ResizeEdge,e:React.PointerEvent<HTMLElement>) {
    if(!e.isPrimary || e.button!==0 || !popup.current)return;
    const {width,height}=popup.current.getBoundingClientRect();
    gesture.current={mode,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x,y,width,height};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function trackGesture(e:React.PointerEvent<HTMLElement>) {
    const start=gesture.current;
    if(!start || e.pointerId!==start.pointer)return;
    const dx=e.clientX-start.startX, dy=e.clientY-start.startY;
    if(start.mode==='move')moveQuery(start.x+dx,start.y+dy,start.width,start.height);
    else resizeQuery(start.mode,start,dx,dy);
  }
  function stopGesture() {gesture.current=null;}
  function keyboardGesture(mode:'move'|ResizeEdge,e:React.KeyboardEvent<HTMLButtonElement>) {
    const directions:Record<string,[number,number]>={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};
    const delta=directions[e.key];
    if(!popup.current || !delta)return;
    e.preventDefault();
    const {width,height}=popup.current.getBoundingClientRect();
    if(mode==='move')moveQuery(x+delta[0],y+delta[1],width,height);
    else resizeQuery(mode,{x,y,width,height},delta[0],delta[1]);
  }
  const previewStatus=previewRun.busy?'Running preview…':previewRun.current?'Up to date':'Needs refresh';
  return <section ref={layout} className="build-report" aria-label="Build Report">
    <div ref={rail} className="builder-rail" role="group" aria-label="Builder sidebar">
      <button type="button" className="secondary-btn" aria-expanded={!objectsCollapsed}
        aria-controls={editorPanes.objects.id} aria-label={objectsCollapsed?'Expand Objects':'Collapse Objects'}
        title={objectsCollapsed?'Expand Objects':'Collapse Objects'} onClick={toggleObjects}>
        <Icon name="layers" size={16}/>
      </button>
      <button ref={queryToggle} type="button" className="secondary-btn" aria-haspopup="dialog"
        aria-controls={editorPanes.query.id} aria-expanded={queryVisible} aria-label="Query" title="Query" onClick={toggleQuery}>
        <Icon name="fields" size={15}/>
      </button>
      <button type="button" className="primary-btn preview-run" data-current={previewRun.current}
        aria-label="Run preview" aria-describedby="preview-run-status" aria-controls="report-preview"
        aria-busy={previewRun.busy} title={'Run preview · '+previewStatus} disabled={previewRun.disabled}
        onClick={previewRun.run}><Icon name="play" size={16}/></button>
    </div>
    <span className="sr-only" id="preview-run-status" role="status">{previewStatus}</span>
    <aside ref={objects} id={editorPanes.objects.id} className="builder-pane library-wrap" hidden={objectsCollapsed}
      aria-label="Objects" style={{'--pane-width':objectsWidth+'px'} as React.CSSProperties}>
      <div id="library-contents" className="library-contents">{library}</div>
      {!objectsCollapsed && <PaneDivider pane="objects" value={objectsWidth} max={maxObjects} onResize={value=>resize('objects',value)}/>}
    </aside>
    <section ref={popup} id={editorPanes.query.id} className="builder-pane query-controls" role="dialog" aria-labelledby="query-pane-heading"
      hidden={!queryVisible} style={{width:queryWidth,height,maxHeight:maxQueryHeight,insetInlineStart:x,insetBlockStart:y}}>
      <div className="builder-pane-heading">
        <div className="query-title-bar" onPointerDown={e=>startGesture('move',e)} onPointerMove={trackGesture} onLostPointerCapture={stopGesture}>
          <h3 id="query-pane-heading"><Icon name="fields" size={16}/>Query</h3>
          <button type="button" className="icon-button query-move" aria-label="Move Query" title="Move Query using drag or arrow keys"
            onKeyDown={e=>keyboardGesture('move',e)}><Icon name="grip" size={16}/></button>
        </div>
        <button ref={queryClose} type="button" className="icon-button" aria-label="Close Query" title="Close Query" onClick={closeQuery}>
          <Icon name="close" size={16}/>
        </button>
      </div>
      {children}
      {(Object.keys(resizeEdges) as ResizeEdge[]).map(edge=><button key={edge} type="button" className="query-resize-handle"
        data-edge={edge} aria-label={'Resize Query from '+edge.replace('-',' ')} title="Resize Query using drag or arrow keys"
        onPointerDown={e=>startGesture(edge,e)} onPointerMove={trackGesture} onLostPointerCapture={stopGesture}
        onKeyDown={e=>keyboardGesture(edge,e)}>{edge==='bottom-right' && <Icon name="resize" size={14}/>}</button>)}
    </section>
  </section>;
}
