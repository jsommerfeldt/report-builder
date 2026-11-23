import React,{useState} from 'react';
import {Field,Order} from './client';
import {Icon} from './Icon';
import {DropField,useFieldDrag} from './useFieldDrag';

interface Props {
  fields:Field[]; order:Order[]; drop:DropField;
  remove(id:string):void; sort(setting:Order):void;
}

export function FieldsPanel({fields,order,drop,remove,sort}:Props) {
  const [expanded,setExpanded]=useState(false);
  const {begin}=useFieldDrag(drop);
  const settings=new Map(order.map(item=>[item.field,item]));
  const priorities=order.filter(item=>item.enabled!==false).map((_,i)=>i+1);
  const visible=expanded?fields:fields.slice(0,3);
  return <section className="selection" aria-labelledby="selected-fields-heading" data-library-zone="fields">
    <div className="selection-head"><div className="panel-heading"><h4 className="query-label" id="selected-fields-heading">Selected fields</h4><span className="count">{fields.length}</span></div></div>
    <div className="configuration-scroll" tabIndex={0} role="group" aria-label="Field order and sorting">
    {fields.length>0 && <><div className="field-control-grid ordering-groups">
      <strong>Column Order</strong><strong>Row Order</strong></div>
      <div className="field-control-grid field-headings" aria-hidden="true">
      <span>Drag to move</span><span>Sort</span><span>Priority</span><span>Direction</span><span/></div></>}
    <div className="field-stack" id="ordered-fields">{visible.map((f,i)=>{
      const setting=settings.get(f.id);
      const enabled=!!setting && setting.enabled!==false;
      const direction=setting?.direction??'asc';
      const desc=direction==='desc';
      return <div className={'field-control-grid field-line '+f.entity} key={f.id} data-column={f.id}>
        <button type="button" className="move-field" aria-label={'Move '+f.label+', column '+(i+1)}
          title={'Drag '+f.label+' or use the up and down arrow keys'}
          onPointerDown={e=>begin(e,f.id)} onKeyDown={e=>{
            const up=e.key==='ArrowUp'||(e.altKey && e.key==='ArrowLeft');
            const down=e.key==='ArrowDown'||(e.altKey && e.key==='ArrowRight');
            if(!up && !down)return;
            e.preventDefault();const next=i+(down?1:-1);
            if(!fields[next])return;
            if(next>=3)setExpanded(true);
            drop(f.id,'fields',fields[next].id,down);
          }}>
          <Icon name="grip" size={13}/><span className="column-ordinal">{i+1}</span>
          <span className="field-name">{f.label}</span></button>
        <button type="button" className="switch field-sort" role="switch" aria-checked={enabled}
          aria-label={'Sort by '+f.label} title={enabled?'Exclude from row sorting':'Include in row sorting'}
          onClick={()=>sort({field:f.id,direction,enabled:!enabled})}><span/></button>
        <select className="field-priority" aria-label={'Sort priority for '+f.label} title="Priority 1 sorts first"
          disabled={!enabled} value={enabled?setting?.priority:''}
          onChange={e=>sort({field:f.id,direction,enabled:true,priority:Number(e.target.value)})}>
          {enabled?priorities.map(n=><option key={n} value={n}>{n}</option>):<option value="">—</option>}
        </select>
        <button type="button" className="field-direction" role="switch" aria-checked={desc} disabled={!enabled}
          aria-label={'Descending order for '+f.label} title={desc?'Descending. Switch to ascending.':'Ascending. Switch to descending.'}
          onClick={()=>sort({field:f.id,direction:desc?'asc':'desc',enabled:true})}>{desc?'↓ Desc':'↑ Asc'}</button>
        <button type="button" className="remove-field" aria-label={'Remove '+f.label} onClick={()=>remove(f.id)}><Icon name="close" size={12}/></button>
      </div>;
    })}{!fields.length && <span className="drop-hint"><Icon name="plus" size={15}/>Select or drop fields here</span>}</div>
    </div>
    {fields.length>3 && <button className="text-action more-fields" aria-expanded={expanded} aria-controls="ordered-fields"
      onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Show more ('+(fields.length-3)+')'}</button>}
  </section>;
}
