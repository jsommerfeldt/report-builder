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
const objectsRailWidth=48;
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
  library:React.ReactNode; children:React.ReactNode; newReport:boolean;
  queryVisible:boolean; toggleQuery():void; closeQuery():void;
  objectsCollapsed:boolean; toggleObjects():void;
  queryToggle:React.Ref<HTMLButtonElement>; queryClose:React.Ref<HTMLButtonElement>;
}
export function LibraryLayout({library,children,newReport,queryVisible,toggleQuery,closeQuery,queryToggle,queryClose,
  objectsCollapsed,toggleObjects}:LayoutProps) {
  const prefix=layoutPrefix(newReport);
  const [preferred,setPreferred]=useState(()=>({
    objects:Math.max(editorPanes.objects.min,Number(stored(prefix+'objects-width'))||editorPanes.objects.initial),
    query:Math.max(editorPanes.query.min,Number(stored(prefix+'query-width'))||editorPanes.query.initial),
  }));
  const [queryHeight,setQueryHeight]=useState(()=>Number(stored(prefix+'query-height'))||0);
  const [queryPosition,setQueryPosition]=useState<{x:number;y:number}|null>(null);
  const [workspace,setWorkspace]=useState(()=>({
    width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,objectsHeight:0,
  }));
  const layout=useRef<HTMLElement>(null);
  const objects=useRef<HTMLElement>(null);
  const popup=useRef<HTMLElement>(null);
  const gesture=useRef<(PopupRect & {mode:'move'|ResizeEdge;pointer:number;startX:number;startY:number})|null>(null);
  const compact=workspace.width<=700;
  const maxObjects=Math.max(editorPanes.objects.min,Math.floor(workspace.width*.4));
  const objectsWidth=Math.min(preferred.objects,maxObjects);
  const leftLimit=objectsCollapsed?objectsRailWidth+edgeGap:edgeGap;
  const widthLimit=workspace.width-leftLimit-edgeGap;
  const heightLimit=workspace.height-2*edgeGap;
  const minWidth=Math.min(editorPanes.query.min,widthLimit);
  const minHeight=Math.min(156,Math.max(0,heightLimit));
  const queryWidth=clamp(preferred.query,minWidth,widthLimit);
  const height=queryHeight?clamp(queryHeight,minHeight,heightLimit):undefined;
  const defaultX=compact?leftLimit:workspace.width-queryWidth-28;
  const defaultY=compact?(objectsCollapsed?52:workspace.objectsHeight+6):workspace.height*.23;
  const x=clamp(queryPosition?.x??defaultX,leftLimit,workspace.width-queryWidth-edgeGap);
  const y=clamp(queryPosition?.y??defaultY,edgeGap,workspace.height-(height??minHeight)-edgeGap);
  const maxQueryHeight=workspace.height-y-edgeGap;
  useEffect(()=>{
    const editor=layout.current?.parentElement;
    const objectPane=objects.current;
    if(!editor || !objectPane)return;
    const observer=new ResizeObserver(()=>setWorkspace({
      width:editor.clientWidth,height:editor.clientHeight,objectsHeight:objectPane.offsetHeight,
    }));
    observer.observe(editor);
    observer.observe(objectPane);
    return ()=>observer.disconnect();
  },[]);
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
    if(vertical){
      const nextHeight=nextBottom-top;
      setQueryHeight(nextHeight);
      remember(prefix+'query-height',String(nextHeight));
    }
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
  return <section ref={layout} className="build-report" aria-label="Build Report">
    <aside ref={objects} id={editorPanes.objects.id} className={'builder-pane library-wrap'+(objectsCollapsed?' is-collapsed':'')}
      aria-label="Objects" style={{'--pane-width':(objectsCollapsed?objectsRailWidth:objectsWidth)+'px'} as React.CSSProperties}>
      <div className="builder-pane-heading">
        <h3><button type="button" className="objects-toggle" aria-expanded={!objectsCollapsed} aria-controls="library-contents"
          aria-label={objectsCollapsed?'Expand Objects':'Collapse Objects'}
          title={objectsCollapsed?'Expand Objects':'Collapse Objects'} onClick={toggleObjects}>
          <Icon name="layers" size={16}/><span className="objects-label">Objects<Icon name="chevron" size={13}/></span>
        </button></h3>
        <button ref={queryToggle} type="button" className="secondary-btn query-toggle" aria-haspopup="dialog"
          aria-controls={editorPanes.query.id} aria-expanded={queryVisible} aria-label="Query" title="Query" onClick={toggleQuery}>
          <Icon name="fields" size={15}/><span className="objects-label">Query</span>
        </button>
      </div>
      <div id="library-contents" className="library-contents" hidden={objectsCollapsed}>{library}</div>
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
