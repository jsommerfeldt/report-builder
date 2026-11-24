import React, {useRef,useState} from 'react';
import {Catalog, Entity} from './client';
import {entityOrder} from './FieldOptions';
import {DropField, useFieldDrag} from './useFieldDrag';
import {Icon} from './Icon';

export function FieldLibrary({catalog,fields,selectField,drop,onInteraction,onPreviewHover,searchRef,pickingFilter,cancelPick}: {
  catalog:Catalog; fields:string[]; selectField(id:string):void; drop:DropField; onInteraction(field:string|null):void;
  onPreviewHover(active:boolean):void; searchRef:React.RefObject<HTMLInputElement>; pickingFilter:boolean; cancelPick(returnFocus:boolean):boolean;
}) {
  const pressingField=useRef(false);
  const {begin,moved}=useFieldDrag(drop,'objects',field=>{
    pressingField.current=field!==null;
    onInteraction(field);
  },onPreviewHover);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Entity[]>([]);
  const [collapsedMatches,setCollapsedMatches]=useState<Entity[]>([]);
  const query = search.trim().toLowerCase();
  const found = catalog.fields.filter(f => (catalog.entities[f.entity] + ' ' + f.label).toLowerCase().includes(query));
  const groups=entityOrder.map(entity=>({entity,items:found.filter(field=>field.entity===entity)})).filter(group=>group.items.length);
  const isExpanded=(entity:Entity)=>query?!collapsedMatches.includes(entity):open.includes(entity);
  const allExpanded=groups.length>0 && groups.every(group=>isExpanded(group.entity));
  function toggleAll() {
    const entities=groups.map(group=>group.entity);
    if(query)setCollapsedMatches(allExpanded?entities:[]);
    else setOpen(allExpanded?[]:entities);
  }
  function toggleGroup(entity:Entity) {
    const update=query?setCollapsedMatches:setOpen;
    update(previous=>previous.includes(entity)?previous.filter(key=>key!==entity):[...previous,entity]);
  }
  return <div className="library-body" onBlur={e=>{
    if(!e.currentTarget.contains(e.relatedTarget) && (e.relatedTarget || !pressingField.current))cancelPick(false);
  }}
    onKeyDown={e=>{if(e.key==='Escape' && cancelPick(true))e.preventDefault();}}>
      <div className="library-toolbar">
        <label className="search library-search"><Icon name="search" size={15}/><input ref={searchRef} type="search" placeholder="Search fields"
          aria-label="Find a field" value={search}
          onChange={e=>{setSearch(e.target.value);setCollapsedMatches([]);}}/></label>
        <button type="button" className="secondary-btn objects-toggle-all" disabled={!groups.length}
          aria-controls="object-field-groups" onClick={toggleAll}>{allExpanded?'Collapse all':'Expand all'}</button>
      </div>
      <div className="field-groups" id="object-field-groups">{groups.map(({entity,items}) => {
        const expanded = isExpanded(entity);
        return <section className={'field-group ' + entity} key={entity}>
          <button type="button" className="group-title" aria-expanded={expanded} onClick={()=>toggleGroup(entity)}>
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
