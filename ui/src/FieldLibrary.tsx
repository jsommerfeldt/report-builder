import React, {useState} from 'react';
import {Catalog, Entity} from './client';
import {entityOrder} from './FieldOptions';
import {DropField, useFieldDrag} from './useFieldDrag';
import {Icon} from './Icon';

export function FieldLibrary({catalog,fields,selectField,drop,onInteraction,searchRef,pickingFilter,cancelPick}: {
  catalog:Catalog; fields:string[]; selectField(id:string):void; drop:DropField; onInteraction(active:boolean):void;
  searchRef:React.RefObject<HTMLInputElement>; pickingFilter:boolean; cancelPick(returnFocus:boolean):boolean;
}) {
  const {begin,moved}=useFieldDrag(drop,onInteraction);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Entity[]>([]);
  const query = search.trim().toLowerCase();
  const found = catalog.fields.filter(f => (catalog.entities[f.entity] + ' ' + f.label).toLowerCase().includes(query));
  return <div className="library-body" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))cancelPick(false);}}
    onKeyDown={e=>{if(e.key==='Escape' && cancelPick(true))e.preventDefault();}}>
      <label className="search library-search"><Icon name="search" size={15}/><input ref={searchRef} type="search" placeholder="Search fields"
        aria-label="Find a field" aria-describedby={pickingFilter?'objects-filter-prompt':undefined} value={search} onChange={e=>setSearch(e.target.value)}/></label>
      {pickingFilter && <p className="hint objects-filter-prompt" id="objects-filter-prompt">Choose a field to filter.</p>}
      <div className="field-groups">{entityOrder.map(entity => {
        const items = found.filter(f => f.entity === entity);
        if (!items.length) return null;
        const expanded = Boolean(query) || open.includes(entity);
        return <section className={'field-group ' + entity} key={entity}>
          <button className="group-title" aria-expanded={expanded} aria-disabled={query?true:undefined}
            onClick={() => {if(!query)setOpen(prev=>prev.includes(entity)?prev.filter(x=>x!==entity):[...prev,entity]);}}>
            <span className="entity-icon"><Icon name={entity} size={16}/></span>
            <strong>{catalog.entities[entity]}</strong><span className="group-count">{items.length}</span>
            <span className={expanded ? 'twist' : 'twist closed'}><Icon name="chevron" size={15}/></span>
          </button>
          {expanded && <div className="field-list">{items.map(f=>{
            const rowEvents={
              onPointerDown:(e:React.PointerEvent<HTMLElement>)=>begin(e,f.id),
              onClickCapture:(e:React.MouseEvent<HTMLElement>)=>{
                if(moved.current && e.detail>0){e.preventDefault();moved.current=false;}
              },
            };
            const caption=<><span className="field-type" aria-hidden="true">{f.measure?'#':f.kind==='date'?<Icon name="date" size={13}/>:
              f.kind==='datetime'?<Icon name="clock" size={13}/>:'ABC'}</span><span>{f.label}</span></>;
            return pickingFilter
              ? <button key={f.id} type="button" className="field-row" {...rowEvents}
                  onClick={e=>{if(!e.defaultPrevented)selectField(f.id);}}>{caption}</button>
              : <label key={f.id} className="field-row" {...rowEvents}>
                  <input type="checkbox" checked={fields.includes(f.id)} onChange={()=>selectField(f.id)}/>
                  {caption}<span className="tick"><Icon name="check" size={12}/></span>
                </label>;
          })}</div>}
        </section>;
      })}{!found.length && <p className="muted search-empty">No matching fields.</p>}</div>
  </div>;
}
