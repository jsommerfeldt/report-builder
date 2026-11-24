import {PointerEvent as ReactPointerEvent,useEffect,useRef} from 'react';
import {ReorderMotion} from './ReorderMotion';
import {showPreviewInsertionLine} from './previewInsertionLine';

export type Destination='fields'|'filters';
export type DragSource='objects'|Destination;
export type DropField=(id:string,zone:Destination|'preview',source:DragSource,anchor?:string,after?:boolean)=>void;

export function useFieldDrag(drop:DropField,dragSource:DragSource,onInteraction:(field:string|null)=>void,onPreviewHover:(active:boolean)=>void) {
  const stop=useRef<(notify?:boolean)=>void>(()=>{});
  const moved=useRef(false);
  useEffect(()=>()=>stop.current(false),[]);
  function begin(e:ReactPointerEvent<HTMLElement>,id:string) {
    if(e.button!==0 || !e.isPrimary)return;
    stop.current();moved.current=false;
    const x=e.clientX,y=e.clientY,pointer=e.pointerId;
    const source=e.currentTarget;
    const origin=e.currentTarget.closest<HTMLElement>('[data-column]');
    const grip=origin?y-origin.getBoundingClientRect().top:null;
    let zone:HTMLElement|null=null,motion:ReorderMotion|null=null;
    let scrollFrame=0;
    let previewHover=false;
    let insertion:HTMLDivElement|null=null;
    let previewSlot:{anchor:string;after:boolean}|undefined;
    function leave(settle:boolean) {
      cancelAnimationFrame(scrollFrame);
      motion?.finish(settle);motion=null;
      insertion?.remove();insertion=null;previewSlot=undefined;
      zone?.classList.remove('library-drop-hover');zone=null;
    }
    function scrollNearEdge(scroller:HTMLElement|null|undefined,x:number,y:number) {
      if(!scroller)return false;
      const {top,bottom,left,right}=scroller.getBoundingClientRect();
      if(y<top || y>bottom || x<left || x>right)return false;
      const step=y<top+24?-8:y>bottom-24?8:0;
      if(!step)return false;
      const before=scroller.scrollTop;
      scroller.scrollTop+=step;
      return scroller.scrollTop!==before;
    }
    function paint(x:number,y:number) {
      const target=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-library-zone]')??null;
      const hit=dragSource==='filters' && target?.dataset.libraryZone==='filters'?null:target;
      // An open Query must stay available as a field crosses the gap from Objects.
      const query=dragSource==='objects' && hit?.dataset.libraryZone==='preview'
        ? document.querySelector('#query-pane:not([hidden])')?.getBoundingClientRect()
        : undefined;
      const approachingQuery=query && x<=query.right && y<=query.bottom && (x<query.left || y<query.top);
      const nextPreviewHover=hit?.dataset.libraryZone==='preview' && !approachingQuery;
      if(nextPreviewHover!==previewHover){
        previewHover=nextPreviewHover;
        onPreviewHover(previewHover);
      }
      if(hit!==zone){
        leave(false);zone=hit;
        if(zone?.dataset.libraryZone==='fields'){
          const list=zone.querySelector<HTMLElement>('.field-stack')!;
          motion=new ReorderMotion(list,'y',Array.from(list.querySelectorAll('[data-column]')),id,grip);
        }else zone?.classList.add('library-drop-hover');
      }
      motion?.update(x,y);
      if(zone?.dataset.libraryZone==='preview'){
        const scroller=zone.querySelector('.table-scroll');
        const headers=Array.from(scroller?.querySelectorAll<HTMLElement>('th[data-preview-field]')??[])
          .filter(header=>header.dataset.previewField!==id);
        if(!scroller || !headers.length)return;
        const next=headers.find(header=>{const rect=header.getBoundingClientRect();return x<rect.left+rect.width/2;});
        const anchor=next??headers[headers.length-1];
        previewSlot={anchor:anchor.dataset.previewField!,after:!next};
        insertion=showPreviewInsertionLine(insertion,scroller,anchor,!next);
      }
    }
    function scrollTargets(x:number,y:number) {
      const columns=motion && zone?.querySelector<HTMLElement>('.configuration-scroll');
      const query=document.elementFromPoint(x,y)?.closest<HTMLElement>('.query-scroll');
      const preview=zone?.dataset.libraryZone==='preview'?zone.querySelector<HTMLElement>('.table-scroll'):null;
      let scrolled=false;
      if(preview && preview.scrollWidth>preview.clientWidth){
        const bounds=preview.getBoundingClientRect();
        if(x>=bounds.left && x<=bounds.right){
          const before=preview.scrollLeft;
          preview.scrollLeft+=x<bounds.left+24?-12:x>bounds.right-24?12:0;
          scrolled=preview.scrollLeft!==before;
        }
      }
      if(!scrolled && !scrollNearEdge(columns,x,y) && !scrollNearEdge(query,x,y))return;
      paint(x,y);
      scrollFrame=requestAnimationFrame(()=>scrollTargets(x,y));
    }
    function track(p:PointerEvent) {
      if(p.pointerId!==pointer || (!moved.current && Math.hypot(p.clientX-x,p.clientY-y)<5))return;
      moved.current=true;
      paint(p.clientX,p.clientY);
      cancelAnimationFrame(scrollFrame);
      scrollFrame=requestAnimationFrame(()=>scrollTargets(p.clientX,p.clientY));
    }
    function cleanup(notify=true) {
      leave(true);
      window.removeEventListener('pointermove',track);window.removeEventListener('pointerup',finish);
      window.removeEventListener('pointercancel',cancelPointer);window.removeEventListener('blur',cancel);
      source.removeEventListener('lostpointercapture',cancelPointer);
      window.removeEventListener('keydown',escape);stop.current=()=>{};
      if(notify){
        onInteraction(null);
        onPreviewHover(false);
      }
    }
    function cancel() {moved.current=true;cleanup();}
    function cancelPointer(e:PointerEvent) {if(e.pointerId===pointer)cancel();}
    function escape(e:KeyboardEvent) {if(e.key==='Escape')cancel();}
    function finish(p:PointerEvent) {
      if(p.pointerId!==pointer)return;
      track(p);const name=zone?.dataset.libraryZone,slot=motion?.destination(),position=previewSlot;cleanup(false);
      try {
        if(name==='filters')drop(id,'filters',dragSource);
        if(name==='fields' && (slot || dragSource==='filters'))drop(id,'fields',dragSource,slot?.anchor,slot?.after);
        if(name==='preview')drop(id,'preview',dragSource,position?.anchor,position?.after);
      } finally {
        onInteraction(null);
        onPreviewHover(false);
      }
    }
    stop.current=cleanup;window.addEventListener('pointermove',track);window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',cancelPointer);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);
    // Keep tracking the field when a drop target changes the layout.
    source.setPointerCapture(pointer);
    source.addEventListener('lostpointercapture',cancelPointer);
    onInteraction(id);
  }
  return {begin,moved};
}
