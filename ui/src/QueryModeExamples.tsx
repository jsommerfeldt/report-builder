import React from 'react';

interface ExampleProps {
  grouped:boolean;
  description:React.ReactNode;
  columns:string[];
  rows:ReadonlyArray<readonly [values:string[],sales:number]>;
}

const dollars = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});

function ModeExample({grouped,description,columns,rows}:ExampleProps) {
  const id=grouped?'example-grouped':'example-ungrouped';
  const total = rows.reduce((sum, [,sales])=>sum+sales, 0);
  return <section className={'mode-example'+(grouped?' example-grouped':'')}>
    <h3 id={id}>{grouped?'Grouping on':'Grouping off'}</h3>
    <p>{description}</p>
    <div className="mode-example-table">
      <table aria-labelledby={id}>
        <thead><tr>{columns.map(column=><th key={column} scope="col">{column}</th>)}
          <th scope="col" className="numeric">Sales</th></tr></thead>
        <tbody>{rows.map(([values,sales])=><tr key={values.join('|')}>
          {values.map((value,i)=><td key={columns[i]}>{value}</td>)}
          <td className="numeric">{dollars.format(sales)}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row" colSpan={columns.length}>Grand Total</th>
          <td className="numeric">{dollars.format(total)}</td></tr></tfoot>
      </table>
    </div>
  </section>;
}

export function QueryModeExamples() {
  return <div className="mode-comparison">
      <ModeExample grouped={false}
        description={<>Turn off the <strong>Group</strong> switches and clear <strong>Totals only</strong> to show one row per sale.</>}
        columns={['Shipping State','Product Description']}
        rows={[[['MN','Apples'],44.50],[['MN','Carrots'],55.50],[['WI','Apples'],72.25]]}/>
      <ModeExample grouped
        description={<>Turn on <strong>Group</strong> for <strong>Shipping State</strong> and leave it off for <strong>Product Description</strong> to total sales by state.</>}
        columns={['Shipping State']}
        rows={[[['MN'],100],[['WI'],72.25]]}/>
  </div>;
}
