import React,{useState} from 'react';
import {Aggregation,aggregationLabels,Catalog,ColumnNames,Definition,Field,Order,sourceColumn} from './client';
import {Icon} from './Icon';
import {DropField,useFieldDrag} from './useFieldDrag';
import {CardDisclosure,QueryCard} from './QueryCard';
import {columnsHelp} from './QueryHelp';

const numericOptions:Aggregation[]=['sum','avg','min','max','count'];

interface Props {
  fields:Field[]; outputIds:string[]; order:Order[]; drop:DropField; showDropTarget:boolean; disclosure:CardDisclosure;
  onAdd:React.MouseEventHandler<HTMLButtonElement>;
  columnNames?:ColumnNames; entities:Catalog['entities']; rename(field:Field,trigger:HTMLButtonElement):void;
  remove(id:string):void; sort(setting:Order):void;
  groupBy:string[]; summary:boolean; canSummarize:boolean; aggregations?:Definition['aggregations'];
  onSummaryChange(value:boolean):void;
  onAggregationChange(id:string,value:Aggregation|'none'):void;
}

export function FieldsPanel({fields,outputIds,order,drop,onAdd,remove,sort,showDropTarget,disclosure,columnNames,entities,rename,
  groupBy,summary,canSummarize,onSummaryChange,aggregations,onAggregationChange}:Props) {
  const [expanded,setExpanded]=useState(true);
  const {begin}=useFieldDrag(drop);
  const settings=new Map(order.map(item=>[item.field,item]));
  const priorities=order.filter(item=>item.enabled!==false).map((_,i)=>i+1);
  const visible=expanded?fields:fields.slice(0,3);
  return <QueryCard title="Columns" icon="grid" className="selection" dropZone="fields" showDropTarget={showDropTarget}
    disclosure={disclosure} help={columnsHelp}>
    {fields.length===0 ? <div className="field-stack">
      <button type="button" className="query-add" aria-controls="library-contents" onClick={onAdd}>
        <Icon name="plus" size={14}/>Add column{showDropTarget && <span className="hint" aria-hidden="true">Drop a field here</span>}
      </button>
    </div> : <div className="configuration-scroll" tabIndex={0} role="group" aria-label="Column order, grouping and sorting">
    <div className="field-control-grid field-headings" aria-hidden="true">
      <span>Column Order</span><span/><span>Sort</span><span>Priority</span><span>Direction</span><span/><span/>
    </div>
    <div className="field-stack" id="ordered-fields">{visible.map((f,i)=>{
      const setting=settings.get(f.id);
      const enabled=!!setting && setting.enabled!==false;
      const included=outputIds.includes(f.id);
      const method=aggregations?.[f.id];
      const label=columnNames?.[f.id]??f.label;
      const source=sourceColumn(f,entities);
      const direction=setting?.direction??'asc';
      const desc=direction==='desc';
      return <div className={'field-control-grid field-line '+f.entity} key={f.id} data-column={f.id}>
        <button type="button" className="move-field" aria-label={'Move '+label+', column '+(i+1)}
          title={source}
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
          <span className="field-name"><span className="field-label">{label}</span>
            {!included && <small className="hint field-hidden">Hidden by grouping</small>}</span></button>
        {f.measure ? <select className="field-grouping" aria-label={'Aggregation for '+label}
          title="Choose a calculation or keep this column for detail rows" value={method??'sum'}
          onChange={e=>onAggregationChange(f.id,e.target.value as Aggregation|'none')}>
          <option value="none">None</option>
          {numericOptions.map(value=><option key={value} value={value}>{aggregationLabels[value]}</option>)}
        </select> : <span className="hint">{method && method!=='none'?aggregationLabels[method]:null}</span>}
        <button type="button" className="switch field-sort" role="switch" aria-checked={enabled} disabled={!included}
          aria-label={'Sort by '+label} title={enabled?'Exclude from row sorting':'Include in row sorting'}
          onClick={()=>sort({field:f.id,direction,enabled:!enabled})}><span/></button>
        <select className="field-priority" aria-label={'Sort priority for '+label} title="Priority 1 sorts first"
          disabled={!included || !enabled} value={enabled?setting?.priority:''}
          onChange={e=>sort({field:f.id,direction,enabled:true,priority:Number(e.target.value)})}>
          {enabled?priorities.map(n=><option key={n} value={n}>{n}</option>):<option value="">—</option>}
        </select>
        <button type="button" className="field-direction" role="switch" aria-checked={desc} disabled={!included || !enabled}
          aria-label={'Descending order for '+label} title={desc?'Descending. Switch to ascending.':'Ascending. Switch to descending.'}
          onClick={()=>sort({field:f.id,direction:desc?'asc':'desc',enabled:true})}>{desc?'↓ Desc':'↑ Asc'}</button>
        <button type="button" className="rename-column" title={'Rename '+label} aria-haspopup="dialog"
          aria-label={'Rename '+label} onClick={e=>rename(f,e.currentTarget)}><Icon name="edit" size={12}/></button>
        <button type="button" className="remove-field" aria-label={'Remove '+label} onClick={()=>remove(f.id)}><Icon name="close" size={12}/></button>
      </div>;
    })}</div>
    </div>}
    {fields.length>3 && <button className="text-action more-fields" aria-expanded={expanded} aria-controls="ordered-fields"
      onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Show more ('+(fields.length-3)+')'}</button>}
    {canSummarize && !groupBy.length && <label className="totals-option">
      <input type="checkbox" checked={summary} onChange={e=>onSummaryChange(e.target.checked)}/>Totals only
    </label>}
  </QueryCard>;
}
