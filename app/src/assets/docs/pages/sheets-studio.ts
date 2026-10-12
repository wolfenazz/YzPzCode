export const sheetsStudioContent = `# Sheets Studio

The Sheets studio is a spreadsheet editor with an AI assistant. Open a workbook, edit it on a grid with a ribbon of familiar commands, and ask the assistant to clean data, add totals, make charts, or fix formulas. Changes are saved back to the workbook file.

## Opening a Workbook

Workbooks open in the **Sheets** view. The studio reads .xlsx, .xlsm, .csv, and .tsv files, and older .xls and .ods files through a compatibility reader. Workbooks are written back as .xlsx, which Excel and Google Sheets can open.

## The Grid

- **Select**: click a cell, drag across a range, or Ctrl+click to add cells. Shift+click extends the selection
- **Move**: arrow keys and Tab move between cells. Enter moves down
- **Edit**: type in a cell, or press F2 to edit what is already there. The formula bar above the grid shows the full contents
- **Columns and rows**: drag the header edges to resize. Select headers and use **Insert and delete** to add or remove them

## The Ribbon

The ribbon has five tabs.

- **Home**: undo and redo, clipboard, font, size, bold, italic, underline, strikethrough, colours, alignment, wrap text, merge cells, number formats (percent, thousands separator, more and fewer decimals), cell styles, sort and filter, find and replace, and hiding rows or columns
- **Insert**: insert a chart, a link, a note, rows and columns, and a pivot table
- **Formulas**: insert a function, browse functions, show formulas, recalculate, and manage named ranges
- **Data**: sort, filter, data validation, duplicate removal, text to columns, and freeze panes
- **View**: gridlines, row and column headings, formula view, and right-to-left layout for Arabic and Hebrew sheets

## Formulas and Functions

Type \`=\` to start a formula. The formula bar shows the arguments as you type, and **Browse functions** lists every function with its syntax and an example. Errors appear in the cell, and the assistant can fix them for you.

## Charts and Pivot Tables

- **Chart** builds a chart from the selected range. Charts appear on the sheet and export with it
- **Pivot table** summarises the selected data by rows, columns, and values. Pick the fields in the dialog. The definition is saved with the workbook: after the source data changes, rebuild it from **Data > Refresh pivots** (or the Data panel). Forgetting a pivot in the Data panel only forgets the definition; its cells stay

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save the workbook | \`Ctrl+S\` |
| Undo / Redo | \`Ctrl+Z\` / \`Ctrl+Y\` |
| Copy / Cut / Paste | \`Ctrl+C\` / \`Ctrl+X\` / \`Ctrl+V\` |
| Bold / Italic / Underline | \`Ctrl+B\` / \`Ctrl+I\` / \`Ctrl+U\` |
| Find and replace | \`Ctrl+F\` |
| AutoSum | \`Alt+=\` |

## The Assistant

The assistant is in the side panel. Type what you want in plain language, or pick a quick action:

- **Clean data**: trim spaces, turn text into real numbers and dates, and fix capitalisation
- **Add totals and averages**: a totals row built with formulas
- **Make a chart**: the most useful chart for the selection, placed beside the table
- **Explain formulas**: what the selected formulas do, without changing anything
- **Find and fix errors**: broken or inconsistent formulas
- **Format as a table**: one header style, number formats, column widths, and a frozen header row
- **Fill a column**: from a pattern or a formula
- **Picture to sheet**: transcribe a photo of a table into the workbook
- **Translate**: the text in the selection, with numbers and formulas kept as they are

Choose the scope first: **Selection**, **Sheet**, or **Workbook**. The assistant shows each change as a proposal. Review the proposed changes, then accept or discard them. An accepted change can be undone with \`Ctrl+Z\`.

> **Tip:** Set the scope to **Selection** when you want a change limited to a few cells. Use **Explain formulas** before you change a formula you did not write.

## Saving

Edits are saved automatically after a short pause, and \`Ctrl+S\` saves immediately.

If the app closes before your edits are saved, opening the workbook again offers to restore them.
`;
