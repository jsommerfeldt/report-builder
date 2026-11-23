import React,{useState} from 'react';
import {Icon,IconName} from './Icon';
import {Destination} from './useFieldDrag';

interface Props {
  title:string; icon:IconName; children:React.ReactNode; actions?:React.ReactNode;
  className?:string; dropZone?:Destination; showDropTarget?:boolean;
}

export function QueryCard({title,icon,children,actions,className,dropZone,showDropTarget}:Props) {
  const [expanded,setExpanded]=useState(false);
  const open=expanded || Boolean(showDropTarget);
  const id='query-'+title.toLowerCase();
  return <section className={'query-card'+(className?' '+className:'')} aria-labelledby={id+'-heading'}
    data-field-target={showDropTarget || undefined} data-library-zone={open?dropZone:undefined}>
    <header className="query-card-heading">
      <h4 id={id+'-heading'}><button type="button" className="pane-disclosure" aria-expanded={open}
        aria-controls={id+'-body'} onClick={()=>setExpanded(value=>!value)}>
        <Icon name="chevron" size={14}/><Icon name={icon} size={16}/>{title}
      </button></h4>
      {actions}
    </header>
    <div className="query-card-body" id={id+'-body'} hidden={!open}>{children}</div>
  </section>;
}
