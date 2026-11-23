import React,{useState} from 'react';
import {Icon,IconName} from './Icon';
import {Destination} from './useFieldDrag';

interface Props {
  title:string; icon:IconName; children:React.ReactNode; actions?:React.ReactNode;
  className?:string; dropZone?:Destination;
}

export function QueryCard({title,icon,children,actions,className,dropZone}:Props) {
  const [expanded,setExpanded]=useState(false);
  const id='query-'+title.toLowerCase();
  return <section className={'query-card'+(className?' '+className:'')} aria-labelledby={id+'-heading'}
    data-library-zone={expanded?dropZone:undefined}>
    <header className="query-card-heading">
      <h4 id={id+'-heading'}><button type="button" className="pane-disclosure" aria-expanded={expanded}
        aria-controls={id+'-body'} onClick={()=>setExpanded(value=>!value)}>
        <Icon name="chevron" size={14}/><Icon name={icon} size={16}/>{title}
      </button></h4>
      {actions}
    </header>
    <div className="query-card-body" id={id+'-body'} hidden={!expanded}>{children}</div>
  </section>;
}
