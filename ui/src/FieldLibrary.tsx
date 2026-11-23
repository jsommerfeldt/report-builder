import React, {useState} from 'react';
import {Catalog, Entity} from './client';
import {entityOrder} from './FieldOptions';
import {DropField, useFieldDrag} from './useFieldDrag';
import {Icon} from './Icon';

export function FieldLibrary({catalog,fields,toggle,drop,onInteraction}: {catalog:Catalog; fields:string[]; toggle(id:string):void;
  drop:DropField; onInteraction(active:boolean):void}) {
  const {begin,moved}=useFieldDrag(drop,onInteraction);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Entity[]>([]);
  const query = search.trim().toLowerCase();
  const found = catalog.fields.filter(f => (catalog.entities[f.entity] + ' ' + f.label).toLowerCase().includes(query));
  return <div className="library-body">
      <label className="search library-search"><Icon name="search" size={15}/><input type="search" placeholder="Search fields" aria-label="Find a field" value={search} onChange={e => setSearch(e.target.value)}/></label>
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
          {expanded && <div className="field-list">{items.map(f => <label key={f.id} className="field-row"
            onPointerDown={e=>begin(e,f.id)} onClickCapture={e=>{if(moved.current && e.detail>0){e.preventDefault();moved.current=false;}}}>
            <input type="checkbox" checked={fields.includes(f.id)} onChange={() => toggle(f.id)}/>
            <span className="field-type" aria-hidden="true">{f.measure?'#':f.kind==='date'?<Icon name="date" size={13}/>:
              f.kind==='datetime'?<Icon name="clock" size={13}/>:'ABC'}</span>
            <span>{f.label}</span><span className="tick"><Icon name="check" size={12}/></span>
          </label>)}</div>}
        </section>;
      })}{!found.length && <p className="muted search-empty">No matching fields.</p>}</div>
  </div>;
}
