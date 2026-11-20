import {PointerEvent as ReactPointerEvent,useEffect,useRef} from 'react';
import {ReorderMotion} from './ReorderMotion';

export type Destination='fields'|'filters';
export type DropField=(id:string,zone:Destination,anchor?:string,after?:boolean)=>void;

export function useFieldDrag(drop:DropField) {
  const stop=useRef<()=>void>(()=>{});
  const moved=useRef(false);
  useEffect(()=>()=>stop.current(),[]);
  function begin(e:ReactPointerEvent,id:string) {
    if(e.button!==0 || !e.isPrimary)return;
    stop.current();moved.current=false;
    const x=e.clientX,y=e.clientY,pointer=e.pointerId;
    const origin=e.currentTarget.closest<HTMLElement>('[data-column]');
    const grip=origin?y-origin.getBoundingClientRect().top:null;
    let zone:HTMLElement|null=null,motion:ReorderMotion|null=null;
    function leave(settle:boolean) {
      motion?.finish(settle);motion=null;
      zone?.classList.remove('library-drop-hover');zone=null;
    }
    function track(p:PointerEvent) {
      if(p.pointerId!==pointer || (!moved.current && Math.hypot(p.clientX-x,p.clientY-y)<5))return;
      moved.current=true;
      const hit=document.elementFromPoint(p.clientX,p.clientY)?.closest<HTMLElement>('[data-library-zone]')??null;
      if(hit!==zone){
        leave(false);zone=hit;
        if(zone?.dataset.libraryZone==='fields'){
          const list=zone.querySelector<HTMLElement>('.field-stack')!;
          motion=new ReorderMotion(list,'y',Array.from(list.querySelectorAll('[data-column]')),id,grip);
        }else zone?.classList.add('library-drop-hover');
      }
      motion?.update(p.clientX,p.clientY);
    }
    function cleanup() {
      leave(true);
      window.removeEventListener('pointermove',track);window.removeEventListener('pointerup',finish);
      window.removeEventListener('pointercancel',cleanup);window.removeEventListener('blur',cleanup);
      window.removeEventListener('keydown',escape);stop.current=()=>{};
    }
    function escape(e:KeyboardEvent) {if(e.key==='Escape')cleanup();}
    function finish(p:PointerEvent) {
      if(p.pointerId!==pointer)return;
      track(p);const name=zone?.dataset.libraryZone,slot=motion?.destination();cleanup();
      if(name==='filters')drop(id,'filters');
      if(name==='fields' && slot)drop(id,'fields',slot.anchor,slot.after);
    }
    stop.current=cleanup;window.addEventListener('pointermove',track);window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',cleanup);window.addEventListener('blur',cleanup);window.addEventListener('keydown',escape);
  }
  return {begin,moved};
}
