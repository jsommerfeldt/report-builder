import React from 'react';
import {Modal} from './Modal';

interface ExampleProps {
  mode: 'Detail'|'Summary';
  description: string;
  rows: ReadonlyArray<readonly [state: string, sales: string]>;
  children?: React.ReactNode;
}

function ModeExample({mode, description, rows, children}: ExampleProps) {
  const id = 'example-' + mode.toLowerCase();
  return <section className={'mode-example '+id}>
    <h3 id={id}>{mode}</h3>
    <p>{description}</p>
    <div className="mode-example-table">
      <table aria-labelledby={id}>
        <thead><tr><th scope="col">Shipping state</th><th scope="col" className="numeric">Sales</th></tr></thead>
        <tbody>{rows.map(([state,sales])=> <tr key={state+sales}>
          <td>{state}</td><td className="numeric">{sales}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {children}
  </section>;
}

export const QUERY_MODE_EXAMPLE_TITLE = 'Query Mode Example';

export function QueryModeExamples({close}:{close():void}) {
  return <Modal title={QUERY_MODE_EXAMPLE_TITLE} className="mode-dialog" close={close}>
    <p className="mode-intro">Both previews use <strong>Shipping state</strong> and <strong>Sales</strong> from the same three sample sales.</p>
    <div className="mode-comparison">
      <ModeExample mode="Detail" description="One row for each sale."
        rows={ [['MN','$44.50'], ['MN','$55.50'], ['WI','$72.25']] }/>
      <ModeExample mode="Summary" description="One row per state with its total sales."
        rows={ [['MN','$100.00'], ['WI','$72.25']] }>
        <p className="mode-equation"><strong>MN</strong> <span>$44.50 + $55.50 = <strong>$100.00</strong></span></p>
      </ModeExample>
    </div>
  </Modal>;
}
