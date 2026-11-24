import React from 'react';
import {QueryModeExamples} from './QueryModeExamples';

export const columnsHelp={
  title:'Columns Help',
  className:'mode-dialog',
  body:<><div className="query-help-content">
    <p>Choose <strong>Add column</strong> to focus <strong>Objects</strong> and pick your first field. You can also drag fields from <strong>Objects</strong> into <strong>Columns</strong>.</p>
    <dl>
      <div><dt>Column Order</dt><dd>Drag <strong>Shipping State</strong> above <strong>Sales</strong> to show the state first. The up and down arrow keys also move a focused column.</dd></div>
      <div><dt>Copy a field</dt><dd>Hold <strong>Ctrl</strong> while dragging between <strong>Columns</strong> and <strong>Filters</strong> to keep the field in both.</dd></div>
      <div><dt>Numeric calculations</dt><dd>Use the dropdown on a numeric column to choose a calculation. <strong>Count</strong> counts nonblank values. Non-numeric columns group the results by default. When no columns define a group, <strong>Totals only</strong> summarizes all matching rows together.</dd></div>
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
      <div><dt>Build a rule</dt><dd>Choose <strong>Add filter</strong> and select a field in <strong>Objects</strong>, or drag a field into <strong>Filters</strong>. Set <strong>Shipping State</strong> to <strong>is any of</strong> and choose <strong>MN</strong> and <strong>WI</strong> to include sales shipped to either state.</dd></div>
      <div><dt>Copy a field</dt><dd>Hold <strong>Ctrl</strong> while dragging between <strong>Columns</strong> and <strong>Filters</strong> to keep the field in both.</dd></div>
      <div><dt>Apply and manage</dt><dd>Choose <strong>Apply filter</strong>, then <strong>Run preview</strong>. Every active rule must match. Use the switch on a rule to pause or resume it.</dd></div>
      <div><dt>Exclude values</dt><dd><strong>Is not</strong> excludes any of the values you select. <strong>Does not contain</strong> excludes text containing what you enter. Both conditions skip blank values.</dd></div>
      <div><dt>Match case and relative dates</dt><dd><strong>Match case</strong> checks capitalization on text. Relative date and time filters recalculate their range each time the report runs.</dd></div>
    </dl>
  </div>,
};
