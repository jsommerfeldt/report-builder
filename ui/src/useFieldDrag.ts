import {PointerEvent as ReactPointerEvent,useEffect,useRef} from 'react';
import {ReorderMotion} from './ReorderMotion';

export type Destination='fields'|'filters';
export type DragSource='objects'|Destination;
export type DropField=(id:string,zone:Destination,source:DragSource,anchor?:string,after?:boolean)=>void;

export function useFieldDrag(drop:DropField,dragSource:DragSource,onInteraction?:(field:string|null)=>void,onDrag?:(active:boolean)=>void) {
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
    function leave(settle:boolean) {
      cancelAnimationFrame(scrollFrame);
      motion?.finish(settle);motion=null;
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
      if(hit!==zone){
        leave(false);zone=hit;
        if(zone?.dataset.libraryZone==='fields'){
          const list=zone.querySelector<HTMLElement>('.field-stack')!;
          motion=new ReorderMotion(list,'y',Array.from(list.querySelectorAll('[data-column]')),id,grip);
        }else zone?.classList.add('library-drop-hover');
      }
      motion?.update(x,y);
    }
    function scrollTargets(x:number,y:number) {
      const columns=motion && zone?.querySelector<HTMLElement>('.configuration-scroll');
      const query=document.elementFromPoint(x,y)?.closest<HTMLElement>('.query-scroll');
      if(!scrollNearEdge(columns,x,y) && !scrollNearEdge(query,x,y))return;
      paint(x,y);
      scrollFrame=requestAnimationFrame(()=>scrollTargets(x,y));
    }
    function track(p:PointerEvent) {
      if(p.pointerId!==pointer || (!moved.current && Math.hypot(p.clientX-x,p.clientY-y)<5))return;
      if(!moved.current){
        moved.current=true;
        onDrag?.(true);
      }
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
        onInteraction?.(null);
        onDrag?.(false);
      }
    }
    function cancel() {moved.current=true;cleanup();}
    function cancelPointer(e:PointerEvent) {if(e.pointerId===pointer)cancel();}
    function escape(e:KeyboardEvent) {if(e.key==='Escape')cancel();}
    function finish(p:PointerEvent) {
      if(p.pointerId!==pointer)return;
      track(p);const name=zone?.dataset.libraryZone,slot=motion?.destination();cleanup(false);
      try {
        if(name==='filters')drop(id,'filters',dragSource);
        if(name==='fields' && (slot || dragSource==='filters'))drop(id,'fields',dragSource,slot?.anchor,slot?.after);
      } finally {
        onInteraction?.(null);
        onDrag?.(false);
      }
    }
    stop.current=cleanup;window.addEventListener('pointermove',track);window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',cancelPointer);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);
    if(onInteraction) {
      // Keep the original field press if Query opens during the drag.
      source.setPointerCapture(pointer);
      source.addEventListener('lostpointercapture',cancelPointer);
      onInteraction(id);
    }
  }
  return {begin,moved};
}
