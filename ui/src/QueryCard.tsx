import React,{useRef,useState} from 'react';
import {Icon,IconName} from './Icon';
import {Modal} from './Modal';
import {Destination} from './useFieldDrag';

export interface CardDisclosure {
  expanded:boolean;
  setExpanded(value:boolean):void;
}

interface Props {
  title:string; icon:IconName; children:React.ReactNode; status?:string;
  className?:string; dropZone?:Destination; showDropTarget?:boolean;
  disclosure:CardDisclosure;
  help:{title:string; body:React.ReactNode};
}

export function QueryCard({title,icon,children,status,className,dropZone,showDropTarget,disclosure,help}:Props) {
  const {expanded,setExpanded}=disclosure;
  const [helpOpen,setHelpOpen]=useState(false);
  const helpButton=useRef<HTMLButtonElement>(null);
  function closeHelp() {
    setHelpOpen(false);
    requestAnimationFrame(()=>helpButton.current?.focus());
  }
  const open=expanded || Boolean(showDropTarget);
  const id='query-'+title.toLowerCase();
  return <section className={'query-card'+(className?' '+className:'')} aria-labelledby={id+'-heading'}
    data-field-target={showDropTarget || undefined} data-library-zone={open?dropZone:undefined}>
    <header className="query-card-heading">
      <h4 id={id+'-heading'}><button type="button" className="pane-disclosure" aria-expanded={open}
        aria-label={title} aria-describedby={status?id+'-status':undefined}
        aria-controls={id+'-body'} onClick={()=>setExpanded(!expanded)}>
        <Icon name="chevron" size={14}/><Icon name={icon} size={16}/>{title}
        {status && <span className="query-card-status" id={id+'-status'}>{status}</span>}
      </button></h4>
      <button ref={helpButton} type="button" className="icon-button query-help" aria-label={help.title} aria-haspopup="dialog"
        title={help.title} onClick={()=>setHelpOpen(true)}><Icon name="help"/></button>
    </header>
    <div className="query-card-body" id={id+'-body'} hidden={!open}>{children}</div>
    {helpOpen && <Modal title={help.title} className="query-help-dialog" close={closeHelp}>{help.body}</Modal>}
  </section>;
}
