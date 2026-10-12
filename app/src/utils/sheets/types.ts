// The workbook model of the Sheets studio. Dependency-free (tested by
// `npm run test:sheets`). It mirrors what an .xlsx holds: sparse cells keyed by
// A1 address, one deduplicated style table (`cellXfs`), and per-sheet layout.

export type ErrorCode = '#DIV/0!' | '#REF!' | '#NAME?' | '#VALUE!' | '#N/A' | '#SPILL!' | '#NUM!' | '#NULL!' | '#CALC!';
export const ERROR_CODES: ErrorCode[] = ['#DIV/0!', '#REF!', '#NAME?', '#VALUE!', '#N/A', '#SPILL!', '#NUM!', '#NULL!', '#CALC!'];

/** What a cell holds once evaluated. */
export type CellScalar = number | string | boolean;

export interface Cell {
  /** Typed value; for a formula cell this is the last computed result. */
  v?: CellScalar;
  /** Error value (`#DIV/0!` …) when the cell holds one. */
  e?: ErrorCode;
  /** Formula text without the leading `=`. */
  f?: string;
  /** Index into `Workbook.styles`; unset or 0 is the default style. */
  s?: number;
  /** This cell holds a value spilled from the dynamic-array formula at this address. */
  sp?: string;
  /** Number of rows and columns a spilling formula covers (set on the anchor). */
  spill?: { rows: number; cols: number };
}

export type BorderStyle = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double' | 'hair' | 'mediumDashed' | 'dashDot' | 'slantDashDot';

export interface BorderEdge {
  style: BorderStyle;
  color?: string;
}

export interface CellStyle {
  font?: { name?: string; size?: number; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string };
  /** Solid background colour as `#RRGGBB`. */
  fill?: string;
  border?: { left?: BorderEdge; right?: BorderEdge; top?: BorderEdge; bottom?: BorderEdge };
  /** Excel number format code. */
  numFmt?: string;
  align?: {
    h?: 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed';
    v?: 'top' | 'center' | 'bottom' | 'justify' | 'distributed';
    wrap?: boolean;
    indent?: number;
    rotate?: number;
    shrink?: boolean;
    /** 0 context, 1 left-to-right, 2 right-to-left. */
    reading?: 0 | 1 | 2;
  };
  locked?: boolean;
  hidden?: boolean;
}

/** A differential style used by conditional formats. */
export interface Dxf {
  font?: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string };
  fill?: string;
  border?: CellStyle['border'];
  numFmt?: string;
}

export interface ColumnInfo {
  /** Width in characters (Excel's unit). */
  width?: number;
  hidden?: boolean;
  style?: number;
}

export interface RowInfo {
  /** Height in points. */
  height?: number;
  hidden?: boolean;
  style?: number;
}

export type CfOp = 'between' | 'notBetween' | 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual';

export type CfRule =
  | { kind: 'cell'; op: CfOp; a: string; b?: string; dxf: number }
  | { kind: 'text'; op: 'contains' | 'notContains' | 'beginsWith' | 'endsWith'; text: string; dxf: number }
  | { kind: 'expression'; formula: string; dxf: number }
  | { kind: 'blanks' | 'notBlanks' | 'errors' | 'notErrors' | 'duplicates' | 'unique'; dxf: number }
  | { kind: 'top'; n: number; bottom?: boolean; percent?: boolean; dxf: number }
  | { kind: 'aboveAverage'; below?: boolean; dxf: number }
  | { kind: 'colorScale'; colors: string[] }
  | { kind: 'dataBar'; color: string }
  | { kind: 'iconSet'; set: '3Arrows' | '3TrafficLights' | '3Symbols' | '3Flags' | '4Arrows' | '5Arrows' };

export interface CondFormat {
  /** Space separated ranges, e.g. `A1:B9 D1:D9`. */
  sqref: string;
  rule: CfRule;
  stop?: boolean;
}

export interface DataValidation {
  sqref: string;
  type: 'list' | 'whole' | 'decimal' | 'date' | 'time' | 'textLength' | 'custom';
  op?: CfOp;
  a?: string;
  b?: string;
  allowBlank?: boolean;
  showDropdown?: boolean;
  errorTitle?: string;
  error?: string;
  promptTitle?: string;
  prompt?: string;
  /** `stop` blocks the entry, `warning` and `information` let it through. */
  errorStyle?: 'stop' | 'warning' | 'information';
}

export interface SheetTable {
  name: string;
  ref: string;
  columns: string[];
  style?: string;
  header: boolean;
  totals: boolean;
  banded: boolean;
}

export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'combo';

export interface ChartSeries {
  name?: string;
  /** Range of the series name, e.g. `Sheet1!$B$1`. */
  nameRef?: string;
  /** Category labels range (or X values for scatter). */
  cats?: string;
  /** Values range (or Y values for scatter). */
  vals: string;
  color?: string;
  /** For combo charts: draw this series as a line. */
  line?: boolean;
}

export interface ChartDef {
  id: string;
  kind: ChartKind;
  title?: string;
  series: ChartSeries[];
  /** Top-left cell and bottom-right cell of the floating chart (zero based). */
  from: { col: number; row: number };
  to: { col: number; row: number };
  stacked?: boolean;
  percent?: boolean;
  legend?: 'right' | 'bottom' | 'top' | 'left' | 'none';
  xTitle?: string;
  yTitle?: string;
  smooth?: boolean;
  gridlines?: boolean;
  dataLabels?: boolean;
}

export interface Sheet {
  id: string;
  name: string;
  cells: Record<string, Cell>;
  cols: Record<number, ColumnInfo>;
  rows: Record<number, RowInfo>;
  merges: string[];
  freeze?: { rows: number; cols: number };
  autoFilter?: string;
  tables: SheetTable[];
  cf: CondFormat[];
  validations: DataValidation[];
  charts: ChartDef[];
  notes: Record<string, string>;
  links: Record<string, string>;
  tabColor?: string;
  rtl?: boolean;
  zoom?: number;
  gridlines?: boolean;
  headings?: boolean;
  state?: 'visible' | 'hidden' | 'veryHidden';
  defaultColWidth?: number;
  defaultRowHeight?: number;
  /** Package path of the part this sheet was read from; used to keep what we do not model. */
  part?: string;
}

export interface DefinedName {
  name: string;
  /** The reference or formula, e.g. `Sheet1!$A$1:$A$9`. */
  ref: string;
  /** Sheet index when the name is local to a sheet. */
  scope?: number;
}

export interface Workbook {
  sheets: Sheet[];
  styles: CellStyle[];
  dxfs: Dxf[];
  names: DefinedName[];
  activeSheet: number;
  date1904?: boolean;
  /** The workbook's own font (cells without a font choice use it). */
  defaultFont?: { name: string; size: number };
}

export interface Pivot {
  id: string;
  name: string;
  source: string;
  target: string;
  rows: string[];
  columns: string[];
  values: Array<{ field: string; agg: 'sum' | 'count' | 'average' | 'min' | 'max' }>;
  filters?: Array<{ field: string; equals: string[] }>;
  /** Size of the last written output (from the target cell); the next refresh clears exactly this. */
  extent?: { rows: number; cols: number };
}

/** The `width` attribute of an untouched column (64 px, Excel's default). */
export const DEFAULT_COL_WIDTH = 9.140625;
export const DEFAULT_ROW_HEIGHT = 15;
export const MAX_ROWS = 1048576;
export const MAX_COLS = 16384;

let sheetCounter = 0;
export const newSheetId = (): string => {
  sheetCounter += 1;
  return `sh-${Date.now().toString(36)}-${sheetCounter.toString(36)}`;
};

export const emptySheet = (name: string, id = newSheetId()): Sheet => ({
  id,
  name,
  cells: {},
  cols: {},
  rows: {},
  merges: [],
  tables: [],
  cf: [],
  validations: [],
  charts: [],
  notes: {},
  links: {},
});

export const emptyWorkbook = (): Workbook => ({
  sheets: [emptySheet('Sheet1')],
  styles: [{}],
  dxfs: [],
  names: [],
  activeSheet: 0,
});
