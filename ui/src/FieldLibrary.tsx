import React, {useState} from 'react';
import {Catalog, Entity} from './client';
import {entityOrder} from './FieldOptions';
import {DropField, useFieldDrag} from './useFieldDrag';
import {Icon} from './Icon';

export function FieldLibrary({catalog, fields, toggle, drop}: {catalog: Catalog; fields: string[]; toggle(id: string): void;
  drop:DropField}) {
  const {begin,moved}=useFieldDrag(drop);
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Entity[]>(()=>[...entityOrder]);
  const query = search.trim().toLowerCase();
  const found = catalog.fields.filter(f => (catalog.entities[f.entity] + ' ' + f.label).toLowerCase().includes(query));
  return <aside className="library" aria-label="Field library">
    <div className="library-heading"><span className="entity-icon library-icon"><Icon name="layers" /></span><h2>Field library</h2></div>
    <div className="library-body">
      <label className="search"><Icon name="search" size={15}/><input type="search" placeholder="Find a field" aria-label="Find a field" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="field-groups">{entityOrder.map(entity => {
        const items = found.filter(f => f.entity === entity);
        if (!items.length) return null;
        const expanded = Boolean(query) || !closed.includes(entity);
        return <section className={'field-group ' + entity} key={entity}>
          <button className="group-title" aria-expanded={expanded} onClick={() => setClosed(prev =>
            prev.includes(entity) ? prev.filter(x => x !== entity) : [...prev, entity])}>
            <span className="entity-icon"><Icon name={entity} size={16}/></span>
            <strong>{catalog.entities[entity]}</strong><span className="group-count">{items.length}</span>
            <span className={expanded ? 'twist' : 'twist closed'}><Icon name="chevron" size={15}/></span>
          </button>
          {expanded && <div className="field-list">{items.map(f => <label key={f.id} className="field-row"
            onPointerDown={e=>begin(e,f.id)} onClickCapture={e=>{if(moved.current && e.detail>0){e.preventDefault();moved.current=false;}}}>
            <input type="checkbox" checked={fields.includes(f.id)} onChange={() => toggle(f.id)}/>
            <span className="tick"><Icon name="check" size={12}/></span><span>{f.label}</span>
            <span className="field-type" aria-hidden="true">{f.measure ? '#' : f.kind === 'date' ? <Icon name="date" size={13}/> : 'Aa'}</span>
          </label>)}</div>}
        </section>;
      })}{!found.length && <p className="muted search-empty">No matching fields.</p>}</div>
      <div className="library-foot"><Icon name="device" size={16}/><span>Local CSV snapshot</span></div>
    </div>
  </aside>;
}
