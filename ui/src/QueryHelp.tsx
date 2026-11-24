import React from 'react';
import {QueryModeExamples} from './QueryModeExamples';

export const columnsHelp={
  title:'Columns Help',
  className:'mode-dialog',
  body:<><div className="query-help-content">
    <p>Select fields in <strong>Objects</strong> or drag them into <strong>Columns</strong>.</p>
    <dl>
      <div><dt>Column Order</dt><dd>Drag <strong>Shipping State</strong> above <strong>Sales</strong> to show the state first. The up and down arrow keys also move a focused column.</dd></div>
      <div><dt>Group</dt><dd>Turn on <strong>Group</strong> for each column that defines a group. For each numeric column, choose <strong>Sum</strong>, <strong>Average</strong>, <strong>Minimum</strong>, <strong>Maximum</strong>, or <strong>Count</strong>. Count counts values and skips blanks. With no groups selected, <strong>Totals only</strong> applies the same calculations across all matching rows.</dd></div>
      <div><dt>Sort, Priority, and Direction</dt><dd>Turn on <strong>Sort</strong> for <strong>Sales</strong> and choose <strong>Desc</strong> to show the largest sales first. Priority 1 sorts first. Priority 2 breaks its ties.</dd></div>
    </dl>
  </div>
    <div className="columns-help-examples"><h3>Query Mode Example</h3><QueryModeExamples/></div>
  </>,
};

export const filtersHelp={
  title:'Filters Help',
  body:<div className="query-help-content">
    <p>Filters choose which sales are included before grouping or totaling.</p>
    <dl>
      <div><dt>Build a rule</dt><dd>Choose <strong>Add filter</strong> and select a field, or drag a field into Filters to select it directly. Set <strong>Shipping State</strong> to <strong>is any of</strong> and choose <strong>MN</strong> and <strong>WI</strong> to include sales shipped to either state.</dd></div>
      <div><dt>Apply and manage</dt><dd>Choose <strong>Apply filter</strong>, then <strong>Run preview</strong>. Every active rule must match. Use the switch on a rule to pause or resume it.</dd></div>
      <div><dt>Match case and relative dates</dt><dd><strong>Match case</strong> checks capitalization on text. Relative date and time filters recalculate their range each time the report runs.</dd></div>
    </dl>
  </div>,
};
