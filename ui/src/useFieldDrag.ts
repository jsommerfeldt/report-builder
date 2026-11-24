import {PointerEvent as ReactPointerEvent,useEffect,useRef} from 'react';
import {ReorderMotion} from './ReorderMotion';

export type Destination='fields'|'filters';
export type DropField=(id:string,zone:Destination,anchor?:string,after?:boolean)=>void;

export function useFieldDrag(drop:DropField,onInteraction?:(active:boolean)=>void,onDrag?:(active:boolean)=>void) {
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
    function scrollFields(x:number,y:number) {
      const scroller=zone?.querySelector<HTMLElement>('.configuration-scroll');
      if(!motion || !scroller)return;
      const {top,bottom}=scroller.getBoundingClientRect();
      if(y<top || y>bottom)return;
      const step=y<top+24?-8:y>bottom-24?8:0;
      if(!step)return;
      const before=scroller.scrollTop;
      scroller.scrollTop+=step;
      if(scroller.scrollTop===before)return;
      motion.update(x,y);
      scrollFrame=requestAnimationFrame(()=>scrollFields(x,y));
    }
    function track(p:PointerEvent) {
      if(p.pointerId!==pointer || (!moved.current && Math.hypot(p.clientX-x,p.clientY-y)<5))return;
      if(!moved.current){
        moved.current=true;
        onDrag?.(true);
      }
      const hit=document.elementFromPoint(p.clientX,p.clientY)?.closest<HTMLElement>('[data-library-zone]')??null;
      if(hit!==zone){
        leave(false);zone=hit;
        if(zone?.dataset.libraryZone==='fields'){
          const list=zone.querySelector<HTMLElement>('.field-stack')!;
          motion=new ReorderMotion(list,'y',Array.from(list.querySelectorAll('[data-column]')),id,grip);
        }else zone?.classList.add('library-drop-hover');
      }
      motion?.update(p.clientX,p.clientY);
      cancelAnimationFrame(scrollFrame);
      if(motion)scrollFrame=requestAnimationFrame(()=>scrollFields(p.clientX,p.clientY));
    }
    function cleanup(notify=true) {
      leave(true);
      window.removeEventListener('pointermove',track);window.removeEventListener('pointerup',finish);
      window.removeEventListener('pointercancel',cancelPointer);window.removeEventListener('blur',cancel);
      source.removeEventListener('lostpointercapture',cancelPointer);
      window.removeEventListener('keydown',escape);stop.current=()=>{};
      if(notify){
        onInteraction?.(false);
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
        if(name==='filters')drop(id,'filters');
        if(name==='fields' && slot)drop(id,'fields',slot.anchor,slot.after);
      } finally {
        onInteraction?.(false);
        onDrag?.(false);
      }
    }
    stop.current=cleanup;window.addEventListener('pointermove',track);window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',cancelPointer);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);
    if(onInteraction) {
      // Keep the original field press if Query opens during the drag.
      source.setPointerCapture(pointer);
      source.addEventListener('lostpointercapture',cancelPointer);
      onInteraction(true);
    }
  }
  return {begin,moved};
}
