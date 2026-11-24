import React from 'react';
import {QueryModeExamples} from './QueryModeExamples';

export const columnsHelp={
  title:'Columns Help',
  body:<div className="query-help-content">
    <ul className="query-help-list">
      <li>Click a field in <strong>Objects</strong> to add it. Use <strong>Run preview</strong> in the sidebar to load rows.</li>
      <li>Drag a column by its grip to reorder it. Turn on <strong>Sort</strong> to order the rows by that column.</li>
      <li>For totals by state, add <strong>Shipping State</strong> and <strong>Sales</strong> to a new dataset. Keep <strong>Sum</strong> selected on Sales.</li>
    </ul>
    <details className="query-help-more">
      <summary>Compare detail rows and grouped totals</summary>
      <QueryModeExamples/>
    </details>
  </div>,
};

export const filtersHelp={
  title:'Filters Help',
  body:<div className="query-help-content">
    <ol className="query-help-list">
      <li>Choose <strong>Add filter</strong> and pick a field in <strong>Objects</strong>.</li>
      <li>Choose a <strong>Condition</strong>, then select or enter any values it needs.</li>
      <li>Choose <strong>Apply filter</strong>, then <strong>Run preview</strong> in the sidebar.</li>
    </ol>
    <p className="query-help-example">To keep sales shipped to MN or WI, set <strong>Shipping State</strong> to <strong>is any of</strong> and select <strong>MN</strong> and <strong>WI</strong>.</p>
    <details className="query-help-more">
      <summary>More filter tips</summary>
      <ul className="query-help-list">
        <li>Each enabled filter must match. Use the switch on a filter to pause it.</li>
        <li><strong>Is not</strong> excludes selected values. <strong>Does not contain</strong> excludes text containing what you enter. Both skip blanks.</li>
        <li>Use <strong>Match case</strong> for capitalization and <strong>relative to now</strong> for a date range that updates each time you run the dataset.</li>
        <li>Hold <strong>Ctrl</strong> while dragging between <strong>Columns</strong> and <strong>Filters</strong> to keep the field in both.</li>
      </ul>
    </details>
  </div>,
};
