import React, {useRef,useState} from 'react';
import {Icon} from './Icon';

interface Props {
  name:string;
  source:string;
  onRename(name:string):void;
  dragged?:React.RefObject<boolean>;
  onPointerDown?:React.PointerEventHandler<HTMLButtonElement>;
  onKeyDown?:React.KeyboardEventHandler<HTMLButtonElement>;
}

export function EditableColumnName({name,source,onRename,dragged,onPointerDown,onKeyDown}:Props) {
  const [draft,setDraft]=useState<string|null>(null);
  const restoreFocus=useRef(false);
  function finish(commit:boolean,focus:boolean) {
    const next=draft?.trim();
    if(commit && next && next!==name)onRename(next);
    restoreFocus.current=focus;
    setDraft(null);
  }
  return draft===null ? <button type="button" className="column-name-button" title={source}
    aria-label={'Rename column '+name} aria-keyshortcuts={onKeyDown?'ArrowLeft ArrowRight':undefined}
    ref={button=>{
      if(button && restoreFocus.current){
        restoreFocus.current=false;
        button.focus({preventScroll:true});
      }
    }}
    onPointerDown={onPointerDown} onKeyDown={onKeyDown} onClick={e=>{
      if(!e.detail || !dragged?.current)setDraft(name);
    }}>
    <span>{name}</span><Icon name="edit" size={12}/>
  </button> : <input className="column-name-input" type="text" aria-label={'Column name for '+name} title={source}
    autoFocus maxLength={80} value={draft} onFocus={e=>e.currentTarget.select()}
    onPointerDown={e=>e.stopPropagation()} onChange={e=>setDraft(e.target.value)}
    onBlur={()=>finish(true,false)} onKeyDown={e=>{
      if(e.nativeEvent.isComposing || (e.key!=='Enter' && e.key!=='Escape'))return;
      e.preventDefault();
      e.stopPropagation();
      finish(e.key==='Enter',true);
    }}/>;
}
