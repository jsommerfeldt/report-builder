import React from 'react';

type SaleRow = readonly [state:string,sales:number];

const dollars = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const detailRows:ReadonlyArray<SaleRow>=[['MN',44.50],['MN',55.50],['WI',72.25]];
const totalsByState=new Map<string,number>();
for(const [state,sales] of detailRows)totalsByState.set(state,(totalsByState.get(state)??0)+sales);

function ModeExample({title,description,rows}:{
  title:string; description:React.ReactNode; rows:ReadonlyArray<SaleRow>;
}) {
  const total = rows.reduce((sum, [,sales])=>sum+sales, 0);
  return <section className="mode-example">
    <h3>{title}</h3>
    <p>{description}</p>
    <div className="mode-example-table">
      <table aria-label={title}>
        <thead><tr><th scope="col">Shipping State</th><th scope="col" className="numeric">Sales</th></tr></thead>
        <tbody>{rows.map(([state,sales],i)=><tr key={i}>
          <td>{state}</td>
          <td className="numeric">{dollars.format(sales)}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Grand Total</th>
          <td className="numeric">{dollars.format(total)}</td></tr></tfoot>
      </table>
    </div>
  </section>;
}

export function QueryModeExamples() {
  return <div className="mode-comparison">
    <ModeExample title="Detail rows"
      description={<>Start with <strong>Sales</strong> alone, choose <strong>None</strong>, then add <strong>Shipping State</strong>.</>}
      rows={detailRows}/>
    <ModeExample title="Grouped totals"
      description={<>In a new dataset, add both fields and keep <strong>Sum</strong> on <strong>Sales</strong>.</>}
      rows={[...totalsByState]}/>
  </div>;
}
