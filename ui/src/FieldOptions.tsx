import React from 'react';
import {Catalog, Entity, Field} from './client';

export const entityOrder: readonly Entity[] = ['sales','customer','product','trip'];

export function FieldOptions({fields,entities}: {fields:Field[];entities:Catalog['entities']}) {
  return <>{entityOrder.map(entity=>{
    const items=fields.filter(field=>field.entity===entity);
    return items.length ? <optgroup key={entity} label={entities[entity]}>
      {items.map(field=><option key={field.id} value={field.id}>{field.label}</option>)}
    </optgroup> : null;
  })}</>;
}
