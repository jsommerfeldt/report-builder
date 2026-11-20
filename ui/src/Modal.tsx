import React, {useEffect,useRef} from 'react';
import {Icon} from './Icon';

export function Modal({title,close,children,className}:{
  title:string; close():void; children:React.ReactNode; className?:string;
}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current!;
    dialog.showModal();
    return ()=>dialog.close();
  },[]);
  return <dialog ref={ref} className={className} aria-label={title} onCancel={e=>{e.preventDefault();close();}}>
    <header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><Icon name="close"/></button></header>
    {children}
  </dialog>;
}
