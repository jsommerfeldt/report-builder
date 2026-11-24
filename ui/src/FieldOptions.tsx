import React from 'react';
import {Catalog, ColumnNames, Entity, Field} from './client';

export const entityOrder: readonly Entity[] = ['sales','customer','product','trip','warehouse'];

export function FieldOptions({fields,entities,columnNames}: {fields:Field[];entities:Catalog['entities'];columnNames?:ColumnNames}) {
  return <>{entityOrder.map(entity=>{
    const items=fields.filter(field=>field.entity===entity);
    return items.length ? <optgroup key={entity} label={entities[entity]}>
      {items.map(field=><option key={field.id} value={field.id}>{columnNames?.[field.id]??field.label}</option>)}
    </optgroup> : null;
  })}</>;
}
