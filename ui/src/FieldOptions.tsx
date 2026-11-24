import React from 'react';
import {Catalog, ColumnNames, Entity, Field} from './client';

export const entityOrder: readonly Entity[] = ['sales','customer','product','trip','warehouse'];

export function FieldOptions({fields,entities,columnNames,disabled}: {
  fields:Field[];entities:Catalog['entities'];columnNames?:ColumnNames;disabled?(field:Field):boolean;
}) {
  return <>{entityOrder.map(entity=>{
    const items=fields.filter(field=>field.entity===entity);
    return items.length ? <optgroup key={entity} label={entities[entity]}>
      {items.map(field=><option key={field.id} value={field.id} disabled={disabled?.(field)}>{columnNames?.[field.id]??field.label}</option>)}
    </optgroup> : null;
  })}</>;
}
