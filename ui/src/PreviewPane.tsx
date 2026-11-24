import React, {useEffect,useRef,useState} from 'react';
import {Aggregation, aggregationLabels, Catalog, ColumnNames, Field, Preview, sourceColumn} from './client';
import {Icon} from './Icon';
import {ReorderMotion} from './ReorderMotion';

const dollars = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const quantity = new Intl.NumberFormat('en-US', {maximumFractionDigits:4});
export function numericResult(field:Field,aggregation?:Aggregation) {
  return field.measure || aggregation==='count' || aggregation==='unique';
}
export function resultCell(value: string | null, field: Field, aggregation?:Aggregation) {
  if (value === null || value === '') return <span className="empty-value" aria-label="Blank">—</span>;
  if (aggregation === 'count' || aggregation === 'unique') return quantity.format(Number(value));
  if (field.kind === 'currency') return dollars.format(Number(value));
  if (field.kind === 'quantity') return quantity.format(Number(value));
  return value;
}
export function resultLabel(field:Field, aggregation?:Aggregation, name?:string) {
  if(name)return name;
  if(aggregation==='unique')return 'Unique count of '+field.label;
  return aggregation && aggregation!=='sum'?aggregationLabels[aggregation]+' of '+field.label:field.label;
}
interface Props { data: Preview | null; byId: Record<string, Field>; stale: boolean; busy: boolean; error:string;
  entities:Catalog['entities']; columnNames?:ColumnNames; run():void;
  canMove:boolean; move(id:string,anchor:string,after:boolean):void;
  hasFields: boolean; hasOutput:boolean; pendingFilterMove:boolean; }
export function PreviewPane({data,byId,entities,columnNames,run,stale,busy,error,hasFields,hasOutput,pendingFilterMove,canMove,move}:Props) {
  const table=useRef<HTMLTableElement>(null);
  const [widths,setWidths]=useState<Record<string,number>>({});
  const drag=useRef<{pointer:number; x:number; id:string; width:number}|null>(null);
  const moving=useRef<{pointer:number;x:number;id:string;grip:number;motion:ReorderMotion|null}|null>(null);
  function cancelMove(){
    moving.current?.motion?.finish(true);moving.current=null;
  }
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancelMove();};
    window.addEventListener('keydown',key);window.addEventListener('blur',cancelMove);
    return ()=>{window.removeEventListener('keydown',key);window.removeEventListener('blur',cancelMove);cancelMove();};
  },[data?.fields,canMove]);
  function trackHeader(e:React.PointerEvent,scrollEdges:boolean) {
    const start=moving.current,t=table.current;
    if(!start || start.pointer!==e.pointerId || !t?.tHead || !t.parentElement)return;
    if(!start.motion && Math.abs(e.clientX-start.x)<5)return;
    const scroll=t.parentElement,bounds=scroll.getBoundingClientRect();
    const heads=Array.from(t.tHead.rows[0].cells);
    const rect=heads[0].getBoundingClientRect();
    if(e.clientY<rect.top || e.clientY>rect.bottom || e.clientX<bounds.left || e.clientX>bounds.right){
      start.motion?.finish(false);start.motion=null;return;
    }
    if(scrollEdges){
      if(e.clientX<bounds.left+24)scroll.scrollLeft-=12;
      else if(e.clientX>bounds.right-24)scroll.scrollLeft+=12;
    }
    if(!start.motion){
      const rows=Array.from(t.tBodies[0].rows).filter(row=>row.cells.length===heads.length);
      start.motion=new ReorderMotion(t.tHead,'x',heads,start.id,start.grip,i=>rows.map(row=>row.cells[i]));
    }
    start.motion.update(e.clientX,e.clientY);
  }
  const ids=data?.fields??[];
  const manual=ids.length>0 && ids.every(id=>widths[id]!==undefined);
  const label=(id:string)=>resultLabel(byId[id],data?.aggregations?.[id],columnNames?.[id]);
  const clamp=(n:number)=>Math.max(72,Math.min(2000,Math.round(n)));
  function measure() {
    const headers=Array.from(table.current?.tHead?.rows[0]?.cells??[]);
    return Object.fromEntries(headers.map((th,i)=>[ids[i],Math.round(th.getBoundingClientRect().width)]));
  }
  function resizeKey(e:React.KeyboardEvent,id:string) {
    if(e.key!=='ArrowRight' && e.key!=='ArrowLeft')return;
    e.preventDefault();
    const current=measure();
    setWidths(prev=>({...prev,...current,[id]:clamp(current[id]+(e.key==='ArrowRight'?16:-16))}));
  }
  return <section className="preview" aria-labelledby="preview-heading" data-library-zone="preview">
    <div className="pane-header preview-head"><h2 id="preview-heading"><Icon name="grid" size={16}/>Preview</h2><div className="preview-actions">
      {data && manual && <button className="text-action" onClick={()=>setWidths({})}>Auto-fit columns</button>}
      {data && <span className="result-count" role="status">{data.rows.length.toLocaleString()} of {data.total.toLocaleString()} rows</span>}
      <button type="button" className="primary-btn" disabled={busy || !hasOutput || pendingFilterMove} onClick={run}>
        <Icon name="play" size={15}/>{busy?'Running…':'Run preview'}
      </button>
    </div></div>
    <div className="result-meta" role="status">{(busy || data || error) && <>
      <span className={'status-dot'+(busy?' loading':stale?' amber':data && !error?' ready':'')}/>
      {busy?'Running preview…':error?'Preview failed':stale?'Report changed. Run preview to update.':'Preview ready'}</>}</div>
    {error && <div className="alert preview-alert" role="alert">{error}{data && ' The table shows the previous preview.'}</div>}
    {data ? <div className="table-scroll" tabIndex={0} aria-label="Preview table"><table ref={table}
      className={manual?'manual-widths':undefined} style={manual?{width:ids.reduce((sum,id)=>sum+widths[id],0)}:undefined}>
      {manual && <colgroup>{ids.map(id=><col key={id} style={{width:widths[id]}}/>)}</colgroup>}<thead><tr>{data.fields.map(id => {
      const field=byId[id];
      const source=sourceColumn(field,entities);
      return <th scope="col" key={id} data-preview-field={id} title={source} className={numericResult(field,data.aggregations?.[id])?'numeric':''}
        onPointerDown={e=>{
          if(!canMove || !e.isPrimary || e.button!==0)return;
          moving.current={pointer:e.pointerId,x:e.clientX,id,grip:e.clientX-e.currentTarget.getBoundingClientRect().left,motion:null};
          e.currentTarget.setPointerCapture(e.pointerId);
        }} onPointerMove={e=>trackHeader(e,true)} onPointerUp={e=>{
          const start=moving.current;
          if(!start || start.pointer!==e.pointerId)return;
          trackHeader(e,false);const slot=start.motion?.destination();
          cancelMove();
          if(canMove && slot?.anchor)move(start.id,slot.anchor,slot.after);
        }} onLostPointerCapture={cancelMove}>
        <button type="button" disabled={!canMove} className="column-label header-grip" aria-label={'Move preview column '+label(id)}
          onKeyDown={e=>{
            if(e.key!=='ArrowLeft' && e.key!=='ArrowRight')return;
            e.preventDefault();const right=e.key==='ArrowRight',other=ids[ids.indexOf(id)+(right?1:-1)];
            if(other)move(id,other,right);
          }}><Icon name="grip" size={12}/>{label(id)}</button>
        <span className="column-resize" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={'Resize '+label(id)}
          aria-valuemin={72} aria-valuemax={2000} aria-valuenow={manual?widths[id]:undefined}
          aria-valuetext={manual?widths[id]+' pixels':'Automatic width'}
          title="Drag to resize, or use the left and right arrow keys" onKeyDown={e=>resizeKey(e,id)}
          onPointerDown={e=>{
            if(e.button!==0 || !e.isPrimary)return;
            e.stopPropagation();e.preventDefault();const current=measure();
            drag.current={pointer:e.pointerId,x:e.clientX,id,width:current[id]};
            e.currentTarget.setPointerCapture(e.pointerId);setWidths(prev=>({...prev,...current}));
          }}
          onPointerMove={e=>{
            const start=drag.current;if(!start || start.pointer!==e.pointerId)return;
            const updated=clamp(start.width+e.clientX-start.x);setWidths(prev=>({...prev,[start.id]:updated}));
          }}
          onLostPointerCapture={()=>{drag.current=null;}}/></th>;
    })}</tr></thead><tbody>{data.total===0 && <tr><td colSpan={data.fields.length}>No rows match the current filters.</td></tr>}{data.rows.map((row,i) => <tr key={i}>{row.map((value,j) => {
      const f=byId[data.fields[j]]; return <td key={f.id} title={value??undefined} className={numericResult(f,data.aggregations?.[f.id])?'numeric':''}>
        {resultCell(value,f,data.aggregations?.[f.id])}</td>;
    })}</tr>)}</tbody></table></div> :
      <div className="empty-preview"><span className="empty-icon"><Icon name="grid" size={26}/></span><strong>{busy?'Running preview':hasFields?'No results to display':'Choose your first field'}</strong>
        {!busy && <span>{hasOutput?'Run preview to see your report.':hasFields?'Choose a column to group by or add a measure.':
          'Select a field in Objects or drag it into Query.'}</span>}</div>}
  </section>;
}
