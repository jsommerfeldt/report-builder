import React from 'react';
import {Field} from './client';
import {CardDisclosure,QueryCard} from './QueryCard';
import {QUERY_MODE_EXAMPLE_TITLE, QueryModeExamples} from './QueryModeExamples';

interface Props {
  columns:Field[];
  grouped:boolean;
  groupBy:string[];
  hasOutput:boolean;
  disclosure:CardDisclosure;
  onModeChange(grouped:boolean):void;
  onGroupByChange(ids:string[]):void;
}

export function GroupingPanel({columns,grouped,groupBy,hasOutput,disclosure,onModeChange,onGroupByChange}:Props) {
  const hint=!grouped?'One row per sale.':
    !hasOutput?'Choose a column to group by or add a measure.':
    !groupBy.length?'One grand total across all matching sales.':
    'One row per group. Unchecked columns are hidden from the results.';
  return <QueryCard title="Grouping" icon="group" disclosure={disclosure}
    help={{title:QUERY_MODE_EXAMPLE_TITLE,body:<QueryModeExamples/>,className:'mode-dialog'}}>
      <label className="grouping-option"><input type="checkbox" checked={grouped} aria-describedby="grouping-description"
        onChange={e=>onModeChange(e.target.checked)}/>Group rows and total measures</label>
      {grouped && columns.length>0 && <fieldset className="grouping-fields" aria-describedby="grouping-description">
        <legend>Group by</legend>
        {columns.map(column=><label key={column.id} className="grouping-option">
          <input type="checkbox" checked={groupBy.includes(column.id)} onChange={e=>onGroupByChange(e.target.checked
            ?[...groupBy,column.id]:groupBy.filter(id=>id!==column.id))}/>{column.label}
        </label>)}
      </fieldset>}
      <p className="hint grouping-description" id="grouping-description">{hint}</p>
  </QueryCard>;
}
