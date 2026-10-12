import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;

// The Sheets utilities import each other (and a folder index), so transpile the
// whole tree into node_modules/.cache, where bare imports such as `jszip` still
// resolve, and load it from there.
const sourceDir = fileURLToPath(new URL('../src/utils/sheets/', import.meta.url));
const outDir = fileURLToPath(new URL('../node_modules/.cache/sheets-test/', import.meta.url));
await rm(outDir, { recursive: true, force: true });

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function transpileTree(dir) {
  await mkdir(join(outDir, relative(sourceDir, dir)), { recursive: true });
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await transpileTree(full);
    } else if (entry.name.endsWith('.ts')) {
      const source = await readFile(full, 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
      });
      const parts = [];
      const re = /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g;
      let last = 0;
      let match;
      while ((match = re.exec(outputText))) {
        const target = resolve(dirname(full), match[2]);
        const suffix = (await isDirectory(target)) ? '/index.mjs' : '.mjs';
        parts.push(outputText.slice(last, match.index), `${match[1]}${match[2]}${suffix}${match[3]}`);
        last = match.index + match[0].length;
      }
      parts.push(outputText.slice(last));
      await writeFile(join(outDir, relative(sourceDir, full)).replace(/\.ts$/, '.mjs'), parts.join(''));
    }
  }
}
await transpileTree(sourceDir);
// The one shared helper outside the folder (script detection for alignment).
{
  const source = await readFile(new URL('../src/utils/writing/rtl.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  await mkdir(join(outDir, '../writing'), { recursive: true });
  await writeFile(join(outDir, '../writing/rtl.mjs'), outputText);
}

const load = (name) => import(pathToFileURL(join(outDir, `${name}.mjs`)).href);

const address = await load('address');
const dates = await load('dates');
const numberFormat = await load('numberFormat');
const recalcModule = await load('formula/recalc');
const parseModule = await load('formula/parse');
const refsModule = await load('formula/refs');
const fillModule = await load('fillSeries');
const typesModule = await load('types');
const opsModule = await load('ops');
const opTypes = await load('opTypes');
const chartsModule = await load('charts');
const pivotModule = await load('pivot');
const xlsxRead = await load('xlsxRead');
const gridModel = await load('gridModel');
const displayModule = await load('display');
const csvModule = await load('csv');
const cfModule = await load('cfEngine');
const validationModule = await load('validation');
const xlsxWrite = await load('xlsxWrite');

const { formatNumber, formatValue, parseInput, isDateFormat, editText } = numberFormat;
const { recalculate, evaluateFormula } = recalcModule;

/** A workbook from rows of A1-addressed inputs: numbers, text, or `=formulas`. */
function book(sheets) {
  const wb = typesModule.emptyWorkbook();
  wb.sheets = Object.entries(sheets).map(([name, cells]) => {
    const sheet = typesModule.emptySheet(name);
    for (const [key, input] of Object.entries(cells)) {
      if (typeof input === 'string' && input.startsWith('=')) sheet.cells[key] = { f: input.slice(1) };
      else sheet.cells[key] = { v: input };
    }
    return sheet;
  });
  return recalculate(wb, { now: new Date(2026, 2, 4, 13, 30, 0) });
}

const valueAt = (wb, key, sheet = 0) => {
  const cell = wb.sheets[sheet].cells[key];
  return cell === undefined ? null : cell.e !== undefined ? cell.e : cell.v ?? null;
};

/** Evaluates one formula against a workbook; errors come back as their code. */
const calc = (formula, cells = {}) => {
  const wb = book({ Sheet1: { ...cells, Z99: `=${formula}` } });
  return valueAt(wb, 'Z99');
};

test('addresses convert both ways and ranges normalise', () => {
  assert.equal(address.colName(0), 'A');
  assert.equal(address.colName(25), 'Z');
  assert.equal(address.colName(26), 'AA');
  assert.equal(address.colName(16383), 'XFD');
  assert.equal(address.colIndex('AA'), 26);
  assert.deepEqual(address.parseCell('$B$3'), { row: 2, col: 1 });
  assert.deepEqual(address.parseRange('C5:A1'), { r1: 0, c1: 0, r2: 4, c2: 2 });
  assert.equal(address.rangeText({ r1: 0, c1: 0, r2: 4, c2: 2 }), 'A1:C5');
  assert.equal(address.quoteSheet('My Sheet'), "'My Sheet'");
  assert.equal(address.quoteSheet('Data'), 'Data');
});

test('date serials follow Excel including the 1900 leap-year bug', () => {
  assert.equal(dates.ymdToSerial(1900, 1, 1), 1);
  assert.equal(dates.ymdToSerial(1900, 3, 1), 61);
  assert.equal(dates.ymdToSerial(2026, 3, 4), 46085);
  assert.deepEqual(dates.serialToYmd(46085), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(dates.serialToYmd(60), { y: 1900, m: 2, d: 29 });
  assert.equal(dates.weekdayOf(46085), 4);
  assert.equal(dates.parseDateText('3/4/2026').serial, 46085);
  assert.equal(dates.parseDateText('2026-03-04').serial, 46085);
  assert.equal(dates.parseDateText('4 Mar 2026').serial, 46085);
  assert.equal(dates.parseDateText('13:30').serial, 13.5 / 24);
  assert.equal(dates.parseDateText('hello'), null);
});

test('number formats render like Excel', () => {
  const f = (value, code) => formatNumber(value, code).text;
  assert.equal(f(1234.5, '#,##0.00'), '1,234.50');
  assert.equal(f(0.256, '0.0%'), '25.6%');
  assert.equal(f(-1234.567, '#,##0.0'), '-1,234.6');
  assert.equal(f(5, '000'), '005');
  assert.equal(f(1234567, '#,##0'), '1,234,567');
  assert.equal(f(0.5, '0.00'), '0.50');
  assert.equal(f(1.005, '0.00'), '1.01');
  assert.equal(f(1234.5, '$#,##0.00'), '$1,234.50');
  assert.equal(f(-5, '$#,##0.00'), '-$5.00');
  assert.equal(f(-5, '#,##0.00;(#,##0.00)'), '(5.00)');
  assert.equal(f(0, '#,##0;-#,##0;"zero"'), 'zero');
  assert.equal(f(1500000, '0.0,,"M"'), '1.5M');
  assert.equal(f(1234, '0.00E+00'), '1.23E+03');
  assert.equal(f(0.000123, '0.00E+00'), '1.23E-04');
  assert.equal(f(46085, 'm/d/yyyy'), '3/4/2026');
  assert.equal(f(46085, 'yyyy-mm-dd'), '2026-03-04');
  assert.equal(f(46085, 'dddd, mmmm d, yyyy'), 'Wednesday, March 4, 2026');
  assert.equal(f(46085, 'd-mmm-yy'), '4-Mar-26');
  assert.equal(f(46085.5625, 'h:mm AM/PM'), '1:30 PM');
  assert.equal(f(46085.5625, 'm/d/yyyy h:mm'), '3/4/2026 13:30');
  assert.equal(f(1.5, '[h]:mm'), '36:00');
  assert.equal(f(0.75, '# ?/?'), '3/4');
  assert.equal(f(2.5, '# ?/?'), '2 1/2');
  assert.equal(f(1234.5, 'General'), '1234.5');
  assert.equal(f(12, '0.0'), '12.0');
  assert.equal(f(12, '0.##'), '12');
  assert.equal(f(3.14159, '0.##'), '3.14');
  assert.equal(f(1234567.891, '#,##0.00'), '1,234,567.89');
  assert.equal(formatNumber(-5, '#,##0;[Red]-#,##0').color, '#FF0000');
  assert.equal(formatValue('hi', '@').text, 'hi');
  assert.equal(formatValue('hi', '"Name: "@').text, 'Name: hi');
  assert.equal(isDateFormat('yyyy-mm-dd'), true);
  assert.equal(isDateFormat('0.00'), false);
});

test('typed input becomes a value with the format Excel would pick', () => {
  assert.deepEqual(parseInput('42'), { kind: 'number', value: 42 });
  assert.deepEqual(parseInput('12%'), { kind: 'number', value: 0.12, numFmt: '0%' });
  assert.deepEqual(parseInput('12.5%'), { kind: 'number', value: 0.125, numFmt: '0.0%' });
  assert.deepEqual(parseInput('$1,200'), { kind: 'number', value: 1200, numFmt: '$#,##0' });
  assert.deepEqual(parseInput('$1,200.50'), { kind: 'number', value: 1200.5, numFmt: '$#,##0.00' });
  assert.deepEqual(parseInput('1,234'), { kind: 'number', value: 1234, numFmt: '#,##0' });
  assert.deepEqual(parseInput('3/4/2026'), { kind: 'number', value: 46085, numFmt: 'm/d/yyyy' });
  assert.equal(parseInput('=SUM(A1:A3)').kind, 'formula');
  assert.equal(parseInput('=SUM(A1:A3)').formula, 'SUM(A1:A3)');
  assert.deepEqual(parseInput('TRUE'), { kind: 'bool', value: true });
  assert.deepEqual(parseInput('hello'), { kind: 'text', value: 'hello' });
  assert.deepEqual(parseInput("'007"), { kind: 'text', value: '007' });
  assert.deepEqual(parseInput('007', '@'), { kind: 'text', value: '007' });
  assert.deepEqual(parseInput('٣٤'), { kind: 'number', value: 34 });
  assert.deepEqual(parseInput(''), { kind: 'empty' });
  assert.equal(editText(0.125, undefined, '0.0%'), '12.5%');
  assert.equal(editText(46085, undefined, 'm/d/yyyy'), '3/4/2026');
  assert.equal(editText(5, 'A1+1', undefined), '=A1+1');
});

test('formulas: arithmetic, precedence and errors', () => {
  assert.equal(calc('1+2*3'), 7);
  assert.equal(calc('(1+2)*3'), 9);
  assert.equal(calc('2^3^2'), 64);
  assert.equal(calc('-2^2'), 4);
  assert.equal(calc('10/4'), 2.5);
  assert.equal(calc('50%'), 0.5);
  assert.equal(calc('1/0'), '#DIV/0!');
  assert.equal(calc('"a"+1'), '#VALUE!');
  assert.equal(calc('"3"+1'), 4);
  assert.equal(calc('"a"&"b"&1'), 'ab1');
  assert.equal(calc('1=1'), true);
  assert.equal(calc('"a"="A"'), true);
  assert.equal(calc('2>1'), true);
  assert.equal(calc('NOPE(1)'), '#NAME?');
  assert.equal(calc('A1+B1', { A1: 2, B1: 3 }), 5);
  assert.equal(calc('SQRT(-1)'), '#NUM!');
});

test('formulas: aggregation, conditionals and counting', () => {
  const cells = { A1: 10, A2: 20, A3: 30, A4: 'x', B1: 'a', B2: 'b', B3: 'a', B4: 'a' };
  assert.equal(calc('SUM(A1:A4)', cells), 60);
  assert.equal(calc('AVERAGE(A1:A3)', cells), 20);
  assert.equal(calc('COUNT(A1:A4)', cells), 3);
  assert.equal(calc('COUNTA(A1:A4)', cells), 4);
  assert.equal(calc('MAX(A1:A4)', cells), 30);
  assert.equal(calc('MIN(A1:A4)', cells), 10);
  assert.equal(calc('SUMIF(B1:B4,"a",A1:A4)', cells), 40);
  assert.equal(calc('COUNTIF(B1:B4,"a")', cells), 3);
  assert.equal(calc('COUNTIF(A1:A3,">15")', cells), 2);
  assert.equal(calc('SUMIFS(A1:A4,B1:B4,"a",A1:A4,">10")', cells), 30);
  assert.equal(calc('IF(A1>5,"big","small")', cells), 'big');
  assert.equal(calc('IFERROR(1/0,"oops")', cells), 'oops');
  assert.equal(calc('AND(A1>5,A2>5)', cells), true);
  assert.equal(calc('MEDIAN(A1:A3)', cells), 20);
  assert.equal(calc('ROUND(2.675,2)', cells), 2.68);
  assert.equal(calc('ROUND(-2.5,0)', cells), -3);
  assert.equal(calc('SUMPRODUCT(A1:A3,A1:A3)', cells), 1400);
  assert.equal(calc('LARGE(A1:A3,2)', cells), 20);
  assert.equal(calc('RANK(20,A1:A3)', cells), 2);
  assert.equal(calc('SUM(A1:A3)/COUNT(A1:A3)', cells), 20);
});

test('formulas: text, lookup and date functions', () => {
  const cells = { A1: 'apple', B1: 1, A2: 'banana', B2: 2, A3: 'cherry', B3: 3 };
  assert.equal(calc('UPPER("abc")'), 'ABC');
  assert.equal(calc('LEFT("hello",2)'), 'he');
  assert.equal(calc('MID("hello",2,3)'), 'ell');
  assert.equal(calc('LEN("hello")'), 5);
  assert.equal(calc('TRIM("  a   b ")'), 'a b');
  assert.equal(calc('SUBSTITUTE("a-b-c","-","+")'), 'a+b+c');
  assert.equal(calc('TEXT(0.256,"0.0%")'), '25.6%');
  assert.equal(calc('TEXT(1234.5,"#,##0.00")'), '1,234.50');
  assert.equal(calc('TEXTJOIN(", ",TRUE,A1:A3)', cells), 'apple, banana, cherry');
  assert.equal(calc('VLOOKUP("banana",A1:B3,2,FALSE)', cells), 2);
  assert.equal(calc('VLOOKUP("zzz",A1:B3,2,FALSE)', cells), '#N/A');
  assert.equal(calc('INDEX(B1:B3,MATCH("cherry",A1:A3,0))', cells), 3);
  assert.equal(calc('XLOOKUP("cherry",A1:A3,B1:B3)', cells), 3);
  assert.equal(calc('XLOOKUP("none",A1:A3,B1:B3,"missing")', cells), 'missing');
  assert.equal(calc('DATE(2026,3,4)'), 46085);
  assert.equal(calc('YEAR(46085)'), 2026);
  assert.equal(calc('EOMONTH(DATE(2026,1,15),1)'), 46081);
  assert.equal(calc('EDATE(DATE(2026,1,31),1)'), 46081);
  assert.equal(calc('DATEDIF(DATE(2020,1,15),DATE(2026,3,4),"Y")'), 6);
  assert.equal(calc('WEEKDAY(46085)'), 4);
  assert.equal(calc('NETWORKDAYS(DATE(2026,3,2),DATE(2026,3,6))'), 5);
  assert.equal(calc('TODAY()'), 46085);
  assert.equal(calc('PMT(0.05/12,60,10000)').toFixed(2), '-188.71');
  assert.equal(calc('FV(0.05,10,-100)').toFixed(2), '1257.79');
  assert.equal(calc('ISNUMBER(B1)', cells), true);
  assert.equal(calc('ISBLANK(Q9)'), true);
});

test('formulas: arrays spill and LET/LAMBDA work', () => {
  const wb = book({ Sheet1: { A1: 3, A2: 1, A3: 2, C1: '=SORT(A1:A3)', E1: '=SEQUENCE(3)', G1: '=UNIQUE(H1:H4)', H1: 'a', H2: 'b', H3: 'a', H4: 'c' } });
  assert.deepEqual(['C1', 'C2', 'C3'].map((k) => valueAt(wb, k)), [1, 2, 3]);
  assert.deepEqual(['E1', 'E2', 'E3'].map((k) => valueAt(wb, k)), [1, 2, 3]);
  assert.deepEqual(['G1', 'G2', 'G3'].map((k) => valueAt(wb, k)), ['a', 'b', 'c']);
  assert.equal(wb.sheets[0].cells.C2.sp, 'C1');
  assert.equal(calc('LET(x,5,y,x*2,x+y)'), 15);
  assert.equal(calc('SUM(MAP({1,2,3},LAMBDA(n,n*n)))'), 14);
  assert.equal(calc('SUM(A1:A3*2)', { A1: 1, A2: 2, A3: 3 }), 12);
  assert.equal(calc('SUM(SEQUENCE(4))'), 10);
  assert.equal(calc('INDEX(SORT({3;1;2}),1)'), 1);
});

test('a spill blocked by a value shows #SPILL! and a cycle shows an error', () => {
  const blocked = book({ Sheet1: { A1: '=SEQUENCE(3)', A2: 'in the way' } });
  assert.equal(valueAt(blocked, 'A1'), '#SPILL!');
  const loop = book({ Sheet1: { A1: '=B1', B1: '=A1' } });
  assert.equal(valueAt(loop, 'A1'), '#REF!');
});

test('formulas across sheets and defined names', () => {
  const wb = book({ Data: { A1: 5 }, Sheet1: { A1: "=Data!A1*2", A2: "='Data'!A1+1" } });
  assert.equal(valueAt(wb, 'A1', 1), 10);
  assert.equal(valueAt(wb, 'A2', 1), 6);
});

test('a long dependency chain evaluates without overflowing the stack', () => {
  const cells = { A1: 1 };
  for (let row = 2; row <= 3000; row += 1) cells[`A${row}`] = `=A${row - 1}+1`;
  // Listed bottom-up so the evaluation order is the worst case.
  const reversed = {};
  for (const key of Object.keys(cells).reverse()) reversed[key] = cells[key];
  const wb = book({ Sheet1: reversed });
  assert.equal(valueAt(wb, 'A3000'), 3000);
});

test('reference rewriting for insert, delete and copy', () => {
  const { rewriteRefs, shiftParts, copyFormula } = refsModule;
  const insertRow = (formula) => rewriteRefs(formula, 'Sheet1', (parts) => shiftParts(parts, { axis: 'row', at: 1, count: 1 }));
  assert.equal(insertRow('SUM(A1:A3)+B2'), 'SUM(A1:A4)+B3');
  assert.equal(insertRow('$A$2'), '$A$3');
  const deleteRow = (formula) => rewriteRefs(formula, 'Sheet1', (parts) => shiftParts(parts, { axis: 'row', at: 1, count: -1 }));
  assert.equal(deleteRow('SUM(A1:A3)'), 'SUM(A1:A2)');
  assert.equal(deleteRow('A2+1'), '#REF!+1');
  assert.equal(deleteRow('A3'), 'A2');
  assert.equal(copyFormula('A1+$B$1+C$2', 2, 1), 'B3+$B$1+D$2');
  assert.equal(copyFormula('SUM(Data!A1:B2)', 1, 0), 'SUM(Data!A2:B3)');
  assert.equal(copyFormula('"A1"&A1', 1, 0), '"A1"&A2');
});

test('fill series continues numbers, dates, names and formulas', () => {
  const { fillSeries } = fillModule;
  const values = (cells) => cells.map((cell) => cell.v);
  assert.deepEqual(values(fillSeries([{ v: 1 }, { v: 2 }], 3, { axis: 'row' })), [3, 4, 5]);
  assert.deepEqual(values(fillSeries([{ v: 5 }], 2, { axis: 'row' })), [5, 5]);
  assert.deepEqual(values(fillSeries([{ v: 'Jan' }], 3, { axis: 'row' })), ['Feb', 'Mar', 'Apr']);
  assert.deepEqual(values(fillSeries([{ v: 'Monday' }], 2, { axis: 'row' })), ['Tuesday', 'Wednesday']);
  assert.deepEqual(values(fillSeries([{ v: 'Item 1' }], 2, { axis: 'row' })), ['Item 2', 'Item 3']);
  assert.deepEqual(values(fillSeries([{ v: 'الأحد' }], 2, { axis: 'row' })), ['الاثنين', 'الثلاثاء']);
  assert.deepEqual(fillSeries([{ f: 'A1*2' }], 2, { axis: 'row' }).map((c) => c.f), ['A2*2', 'A3*2']);
  assert.deepEqual(values(fillSeries([{ v: 3 }, { v: 4 }], 2, { axis: 'row', backward: true })), [2, 1]);
  assert.deepEqual(values(fillSeries([{ v: 46085 }, { v: 46086 }], 2, { axis: 'row', dates: true })), [46087, 46088]);
});

test('parse cache returns the same tree and reports syntax errors', () => {
  const { parseFormula, tryParseFormula } = parseModule;
  assert.equal(parseFormula('A1+1'), parseFormula('A1+1'));
  assert.equal(tryParseFormula('SUM(').ok, false);
  assert.equal(tryParseFormula('1+').ok, false);
  assert.equal(tryParseFormula('SUM(A1:B2)').ok, true);
});

const { applyOps } = opsModule;
const { validateOp } = opTypes;

const blank = () => book({ Sheet1: {} });
const run = (wb, ...ops) => {
  const result = applyOps(wb, ops);
  assert.deepEqual(result.warnings, [], `unexpected warnings: ${result.warnings.join('; ')}`);
  return result.wb;
};
const sheetOf = (wb, name = 'Sheet1') => wb.sheets.find((s) => s.name === name);

test('setValues types input like the grid does and recalculates', () => {
  const wb = run(blank(), { op: 'setValues', at: 'A1', values: [['Item', 'Qty', 'Price'], ['Pen', '3', '$1.50'], ['Ink', 2, '12%']] });
  const cells = sheetOf(wb).cells;
  assert.equal(cells.A1.v, 'Item');
  assert.equal(cells.B2.v, 3);
  assert.equal(cells.C2.v, 1.5);
  assert.equal(wb.styles[cells.C2.s].numFmt, '$#,##0.00');
  assert.equal(cells.C3.v, 0.12);
  assert.equal(wb.styles[cells.C3.s].numFmt, '0%');
  const wb2 = run(wb, { op: 'setValues', at: 'D2', values: [['=B2*C2'], ['=B3*5']] });
  assert.equal(valueAt(wb2, 'D2'), 4.5);
  assert.equal(valueAt(wb2, 'D3'), 10);
  const text = run(wb, { op: 'setValues', at: 'E1', values: [['007']], parse: false });
  assert.equal(sheetOf(text).cells.E1.v, '007');
});

test('inverse restores the identical workbook', () => {
  const start = run(blank(), { op: 'setValues', at: 'A1', values: [[1, 2], [3, 4]] });
  const result = applyOps(start, [{ op: 'setValues', at: 'A1', values: [[9]] }, { op: 'insertRows', at: 1 }]);
  assert.notDeepEqual(result.wb.sheets[0].cells, start.sheets[0].cells);
  assert.equal(result.inverse[0].op, 'restore');
  assert.equal(result.inverse[0].workbook, start);
});

test('inserting and deleting rows rewrites formulas, merges, formats and dimensions', () => {
  let wb = run(blank(),
    { op: 'setValues', at: 'A1', values: [[1], [2], [3], ['=SUM(A1:A3)']] },
    { op: 'merge', range: 'B2:C3' },
    { op: 'rowHeight', rows: '3', height: 30 },
    { op: 'conditionalFormat', range: 'A1:A3', rule: { kind: 'cell', op: 'greaterThan', a: '1', style: { fill: '#FFEEEE' } } },
    { op: 'freeze', rows: 1 });
  assert.equal(valueAt(wb, 'A4'), 6);
  wb = run(wb, { op: 'insertRows', at: 2 });
  const sheet = sheetOf(wb);
  assert.equal(sheet.cells.A5.f, 'SUM(A1:A4)');
  assert.equal(valueAt(wb, 'A5'), 6);
  assert.equal(sheet.cells.A2, undefined);
  assert.deepEqual(sheet.merges, ['B3:C4']);
  assert.equal(sheet.rows[3].height, 30);
  assert.equal(sheet.cf[0].sqref, 'A1:A4');
  wb = run(wb, { op: 'deleteRows', at: 2 });
  assert.equal(sheetOf(wb).cells.A4.f, 'SUM(A1:A3)');
  wb = run(wb, { op: 'deleteRows', at: 2 });
  assert.equal(sheetOf(wb).cells.A3.f, 'SUM(A1:A2)');
  assert.equal(valueAt(wb, 'A3'), 4);
  // Deleting a cell a formula points at gives #REF!.
  const ref = run(run(blank(), { op: 'setValues', at: 'A1', values: [[1], [2], ['=A2*2']] }), { op: 'deleteRows', at: 2 });
  assert.equal(valueAt(ref, 'A2'), '#REF!');
});

test('inserting columns moves cells and updates references across sheets', () => {
  let wb = book({ Data: { A1: 5, B1: 6 }, Sheet1: { A1: '=Data!B1+Data!A1' } });
  wb = run(wb, { op: 'insertCols', sheet: 'Data', at: 'A' });
  assert.equal(sheetOf(wb, 'Sheet1').cells.A1.f, 'Data!C1+Data!B1');
  assert.equal(valueAt(wb, 'A1', 1), 11);
  assert.equal(sheetOf(wb, 'Data').cells.B1.v, 5);
});

test('sort keeps rows together and adjusts row-relative formulas', () => {
  let wb = run(blank(), { op: 'setValues', at: 'A1', values: [['Name', 'Score', 'Double'], ['b', 20, '=B2*2'], ['a', 30, '=B3*2'], ['c', 10, '=B4*2']] });
  wb = run(wb, { op: 'sort', range: 'A1:C4', by: [{ column: 'B', order: 'desc' }] });
  const sheet = sheetOf(wb);
  assert.deepEqual(['A2', 'A3', 'A4'].map((k) => sheet.cells[k].v), ['a', 'b', 'c']);
  assert.deepEqual(['C2', 'C3', 'C4'].map((k) => sheet.cells[k].f), ['B2*2', 'B3*2', 'B4*2']);
  assert.deepEqual(['C2', 'C3', 'C4'].map((k) => valueAt(wb, k)), [60, 40, 20]);
});

test('fill extends series and formulas, copy adjusts references, move keeps them pointing', () => {
  let wb = run(blank(), { op: 'setValues', at: 'A1', values: [[1], [2]] }, { op: 'setValues', at: 'B1', values: [['=A1*10']] });
  wb = run(wb, { op: 'fill', source: 'A1:A2', target: 'A1:A5' }, { op: 'fill', source: 'B1', target: 'B1:B5' });
  assert.deepEqual(['A3', 'A4', 'A5'].map((k) => valueAt(wb, k)), [3, 4, 5]);
  assert.deepEqual(['B2', 'B5'].map((k) => sheetOf(wb).cells[k].f), ['A2*10', 'A5*10']);
  assert.equal(valueAt(wb, 'B5'), 50);
  const copied = run(wb, { op: 'copy', range: 'B1:B2', to: 'D1' });
  assert.equal(sheetOf(copied).cells.D1.f, 'C1*10');
  const moved = run(wb, { op: 'move', range: 'A1:A2', to: 'F1' });
  assert.equal(sheetOf(moved).cells.F1.v, 1);
  assert.equal(sheetOf(moved).cells.A1, undefined);
  assert.equal(sheetOf(moved).cells.B1.f, 'F1*10');
  assert.equal(valueAt(moved, 'B1'), 10);
});

test('formats, borders, number formats and merges', () => {
  let wb = run(blank(), { op: 'setValues', at: 'A1', values: [[1234.5, 2]] });
  wb = run(wb,
    { op: 'format', range: 'A1:B1', style: { font: { bold: true, color: '#C00000' }, fill: '#FFF2CC', align: { h: 'center' } } },
    { op: 'numberFormat', range: 'A1', format: '#,##0.00' },
    { op: 'borders', range: 'A1:B1', preset: 'outside', style: 'thin' });
  const sheet = sheetOf(wb);
  const a1 = wb.styles[sheet.cells.A1.s];
  assert.equal(a1.font.bold, true);
  assert.equal(a1.fill, '#FFF2CC');
  assert.equal(a1.numFmt, '#,##0.00');
  assert.equal(a1.border.left.style, 'thin');
  assert.equal(a1.border.right, undefined);
  assert.equal(wb.styles[sheet.cells.B1.s].border.right.style, 'thin');
  // Styles are shared, not copied per cell.
  const bold = run(wb, { op: 'format', range: 'A1:B1', style: { font: { bold: null } } });
  assert.equal(bold.styles[sheetOf(bold).cells.B1.s].font.color, '#C00000');
  assert.equal(bold.styles[sheetOf(bold).cells.B1.s].font.bold, undefined);
});

test('sheets can be added, renamed, moved and removed with formulas following', () => {
  let wb = book({ Sheet1: { A1: 5 }, Other: { A1: '=Sheet1!A1+1' } });
  wb = run(wb, { op: 'renameSheet', sheet: 'Sheet1', name: 'Budget 2026' });
  assert.equal(sheetOf(wb, 'Other').cells.A1.f, "'Budget 2026'!A1+1");
  assert.equal(valueAt(wb, 'A1', 1), 6);
  wb = run(wb, { op: 'addSheet', name: 'Summary' }, { op: 'moveSheet', sheet: 'Summary', index: 0 });
  assert.deepEqual(wb.sheets.map((s) => s.name), ['Summary', 'Budget 2026', 'Other']);
  wb = run(wb, { op: 'deleteSheet', sheet: 'Budget 2026' });
  assert.equal(valueAt(wb, 'A1', 1), '#REF!');
  const lonely = applyOps(book({ Only: {} }), [{ op: 'deleteSheet', sheet: 'Only' }]);
  assert.equal(lonely.warnings.length, 1);
});

test('tables, validation, charts and pivots', () => {
  let wb = run(blank(),
    { op: 'setValues', at: 'A1', values: [['Region', 'Product', 'Sales'], ['North', 'A', 10], ['North', 'B', 20], ['South', 'A', 5], ['South', 'B', 15], ['North', 'A', 7]] },
    { op: 'table', range: 'A1:C6', name: 'Sales' },
    { op: 'validation', range: 'B2:B6', rule: { type: 'list', a: 'A,B' } },
    { op: 'chart', chart: { kind: 'column', title: 'Sales', range: 'A1:C6' } });
  const sheet = sheetOf(wb);
  assert.equal(sheet.tables[0].name, 'Sales');
  assert.deepEqual(sheet.tables[0].columns, ['Region', 'Product', 'Sales']);
  assert.equal(sheet.validations[0].type, 'list');
  const chart = sheet.charts[0];
  assert.equal(chart.kind, 'column');
  assert.equal(chart.series.length, 1);
  assert.equal(chart.series[0].vals, 'Sheet1!$C$2:$C$6');
  assert.equal(chart.series[0].cats, 'Sheet1!$A$2:$A$6');
  const data = chartsModule.resolveChart(wb, chart, 0);
  assert.deepEqual(data.series[0].values, [10, 20, 5, 15, 7]);
  assert.equal(data.series[0].name, 'Sales');
  const svg = chartsModule.chartSvg(chart, data, 480, 300);
  assert.ok(svg.startsWith('<svg') && svg.includes('<rect'));
  // Structured references work against the table.
  wb = run(wb, { op: 'setValues', at: 'E1', values: [['=SUM(Sales[Sales])']] });
  assert.equal(valueAt(wb, 'E1'), 57);
  wb = run(wb, { op: 'pivot', pivot: { source: 'A1:C6', target: 'G1', rows: ['Region'], columns: ['Product'], values: [{ field: 'Sales', agg: 'sum' }] } });
  const p = sheetOf(wb).cells;
  assert.equal(p.G1.v, 'Region');
  assert.equal(p.H1.v, 'A');
  assert.equal(p.I1.v, 'B');
  assert.equal(p.J1.v, 'Grand Total');
  assert.equal(p.G2.v, 'North');
  assert.equal(p.H2.v, 17);
  assert.equal(p.I2.v, 20);
  assert.equal(p.J2.v, 37);
  assert.equal(p.J4.v, 57);
});

test('text to columns splits one column on a delimiter and types the pieces', () => {
  let wb = run(blank(), { op: 'setValues', at: 'A1', values: [['Name', 'Age'], ['Ali Hassan,30', 'x'], ['Sara,25', 'y']] });
  wb = run(wb, { op: 'textToColumns', range: 'A1:A3', delimiter: ',' });
  const cells = sheetOf(wb).cells;
  assert.equal(cells.A1.v, 'Name');
  assert.equal(cells.B1.v, 'Age');
  assert.equal(cells.A2.v, 'Ali Hassan');
  assert.equal(cells.B2.v, 30);
  assert.equal(cells.A3.v, 'Sara');
  assert.equal(cells.B3.v, 25);
  // A custom target leaves the source alone.
  wb = run(blank(), { op: 'setValues', at: 'A1', values: [['a|b|c']] });
  wb = run(wb, { op: 'textToColumns', range: 'A1', delimiter: '|', target: 'C1' });
  assert.equal(sheetOf(wb).cells.A1.v, 'a|b|c');
  assert.equal(sheetOf(wb).cells.C1.v, 'a');
  assert.equal(sheetOf(wb).cells.D1.v, 'b');
  assert.equal(sheetOf(wb).cells.E1.v, 'c');
  // Tab delimiters and validation.
  const tabbed = run(blank(), { op: 'setValues', at: 'A1', values: [['a\tb']] }, { op: 'textToColumns', range: 'A1', delimiter: '\\t' });
  assert.equal(sheetOf(tabbed).cells.B1.v, 'b');
  assert.equal(typeof validateOp({ op: 'textToColumns', range: 'A1', delimiter: '' }), 'string');
  assert.equal(typeof validateOp({ op: 'textToColumns', range: 'A1', delimiter: ',,' }), 'string');
  assert.equal(typeof validateOp({ op: 'textToColumns', range: 'A1' }), 'string');
  assert.equal(validateOp({ op: 'textToColumns', range: 'A1', delimiter: ';' }).op, 'textToColumns');
});

test('pivots honour filters and can be rebuilt from the same definition', () => {
  const data = { op: 'setValues', at: 'A1', values: [['Region', 'Product', 'Sales'], ['North', 'A', 10], ['North', 'B', 20], ['South', 'A', 5]] };
  const spec = { source: 'A1:C4', target: 'E1', rows: ['Region'], values: [{ field: 'Sales', agg: 'sum' }], filters: [{ field: 'Product', equals: ['A'] }] };
  const wb = run(blank(), data, { op: 'pivot', pivot: spec });
  const p = sheetOf(wb).cells;
  assert.equal(p.F2.v, 10);
  assert.equal(p.F3.v, 5);
  // Rebuilding after the data changes gives fresh numbers (what Refresh pivots does).
  const changed = run(wb, { op: 'setValues', at: 'C2', values: [[100]] });
  const rebuilt = run(changed, { op: 'pivot', pivot: spec });
  assert.equal(sheetOf(rebuilt).cells.F2.v, 100);
  const checked = validateOp({ op: 'pivot', pivot: spec });
  assert.equal(checked.op, 'pivot');
  assert.deepEqual(checked.pivot.filters, [{ field: 'Product', equals: ['A'] }]);
});

test('column auto-fit, visibility and names', () => {
  let wb = run(blank(), { op: 'setValues', at: 'A1', values: [['A short one'], ['A considerably longer piece of text']] });
  wb = run(wb, { op: 'colWidth', cols: 'A', width: 'auto' }, { op: 'visibility', rows: '2', hidden: true }, { op: 'name', name: 'Prices', ref: 'A1:A2' });
  const sheet = sheetOf(wb);
  assert.ok(sheet.cols[0].width > 25 && sheet.cols[0].width < 45);
  assert.equal(sheet.rows[1].hidden, true);
  assert.equal(wb.names[0].ref, 'Sheet1!$A$1:$A$2');
  const named = run(wb, { op: 'setValues', at: 'C1', values: [['=COUNTA(Prices)']] });
  assert.equal(valueAt(named, 'C1'), 2);
});

test('AI operations are validated and clamped', () => {
  assert.equal(typeof validateOp({ op: 'rm -rf' }), 'string');
  assert.equal(typeof validateOp({ op: 'setValues', at: 'not a cell', values: [[1]] }), 'string');
  assert.equal(typeof validateOp({ op: 'restore', workbook: {} }), 'string');
  const ok = validateOp({ op: 'setValues', sheet: 'Sheet1', at: 'B2', values: [[1, 'x', null, true]] });
  assert.equal(ok.op, 'setValues');
  assert.deepEqual(ok.values, [[1, 'x', null, true]]);
  const alias = validateOp({ op: 'setFormulas', at: 'A1', values: [['=1+1']] });
  assert.equal(alias.op, 'setValues');
  const big = validateOp({ op: 'setValues', at: 'A1', values: Array.from({ length: 300 }, () => Array.from({ length: 300 }, () => 1)) });
  assert.equal(typeof big, 'string');
  assert.equal(typeof validateOp({ op: 'hyperlink', cell: 'A1', url: 'javascript:alert(1)' }), 'string');
  const link = validateOp({ op: 'hyperlink', cell: 'A1', url: 'https://example.org' });
  assert.equal(link.op, 'hyperlink');
  const style = validateOp({ op: 'format', range: 'A1:B2', style: { font: { bold: true, size: 9999, color: 'red' }, fill: '#abc' } });
  assert.equal(style.style.font.size, 409);
  assert.equal(style.style.font.color, undefined);
  assert.equal(style.style.fill, '#AABBCC');
});

test('AI operations run against a workbook without touching missing sheets', () => {
  const wb = blank();
  const result = applyOps(wb, [
    { op: 'setValues', sheet: 'Nope', at: 'A1', values: [[1]] },
    { op: 'setValues', at: 'A1', values: [[1]] },
  ]);
  assert.equal(result.warnings.length, 1);
  assert.equal(valueAt(result.wb, 'A1'), 1);
});

const { readXlsx } = xlsxRead;
const { writeXlsx, addFunctionPrefixes } = xlsxWrite;
const { stripFunctionPrefixes } = xlsxRead;

/** Writes the workbook and reads it back. */
const roundTrip = async (wb, original) => {
  const bytes = await writeXlsx(wb, original);
  const doc = await readXlsx(bytes);
  return { bytes, ...doc };
};

const richWorkbook = () => {
  let wb = book({ Sheet1: {}, Notes: {} });
  wb = run(wb,
    { op: 'setValues', at: 'A1', values: [['Region', 'Product', 'Sales', 'Share'], ['North', 'A', 10, '=C2/SUM(C$2:C$5)'], ['North', 'B', 20, '=C3/SUM(C$2:C$5)'], ['South', 'A', 5, '=C4/SUM(C$2:C$5)'], ['South', 'B', 15, '=C5/SUM(C$2:C$5)']] },
    { op: 'setValues', at: 'F1', values: [['Total', '=SUM(C2:C5)'], ['Lookup', '=XLOOKUP("South",A2:A5,C2:C5)'], ['Said', 'He said "hi" & <left>']] },
    { op: 'format', range: 'A1:D1', style: { font: { bold: true, color: '#FFFFFF' }, fill: '#1F3A5F', align: { h: 'center' } } },
    { op: 'numberFormat', range: 'D2:D5', format: '0.0%' },
    { op: 'numberFormat', range: 'C2:C5', format: '#,##0.00' },
    { op: 'borders', range: 'A1:D5', preset: 'outside', style: 'medium', color: '#333333' },
    { op: 'merge', range: 'F5:G5' },
    { op: 'colWidth', cols: 'A', width: 18 },
    { op: 'rowHeight', rows: '1', height: 24 },
    { op: 'freeze', rows: 1, cols: 1 },
    { op: 'table', range: 'A1:D5', name: 'SalesTable' },
    { op: 'conditionalFormat', range: 'C2:C5', rule: { kind: 'cell', op: 'greaterThan', a: '12', style: { fill: '#E2F0D9', font: { color: '#375623', bold: true } } } },
    { op: 'conditionalFormat', range: 'D2:D5', rule: { kind: 'dataBar', color: '#638EC6' } },
    { op: 'validation', range: 'B2:B5', rule: { type: 'list', a: 'A,B,C' } },
    { op: 'note', cell: 'C2', text: 'Rounded figures' },
    { op: 'hyperlink', cell: 'F4', url: 'https://example.org/report' },
    { op: 'name', name: 'SalesRange', ref: 'Sheet1!C2:C5' },
    { op: 'sheetProps', sheet: 'Notes', rtl: true, tabColor: '#C00000' },
    { op: 'setValues', sheet: 'Notes', at: 'A1', values: [['ملاحظات'], ['=Sheet1!F1']] },
    { op: 'chart', chart: { kind: 'column', title: 'Sales', range: 'A1:C5', at: 'I2' } });
  return wb;
};

test('xlsx round trip keeps values, formulas, formats, layout and objects', async () => {
  const wb = richWorkbook();
  const { wb: back, warnings } = await roundTrip(wb);
  assert.deepEqual(warnings, []);
  const s = back.sheets[0];
  assert.equal(s.name, 'Sheet1');
  assert.equal(s.cells.A1.v, 'Region');
  assert.equal(s.cells.C3.v, 20);
  assert.equal(s.cells.D2.f, 'C2/SUM(C$2:C$5)');
  assert.equal(s.cells.D2.v, 10 / 50);
  assert.equal(s.cells.G1.f, 'SUM(C2:C5)');
  assert.equal(s.cells.G2.f, 'XLOOKUP("South",A2:A5,C2:C5)');
  assert.equal(s.cells.G2.v, 5);
  assert.equal(s.cells.G3.v, 'He said "hi" & <left>');
  const style = (key) => back.styles[s.cells[key].s ?? 0];
  assert.equal(style('A1').font.bold, true);
  assert.equal(style('A1').font.color, '#FFFFFF');
  assert.equal(style('A1').fill, '#1F3A5F');
  assert.equal(style('A1').align.h, 'center');
  assert.equal(style('D2').numFmt, '0.0%');
  assert.equal(style('C2').numFmt, '#,##0.00');
  assert.equal(style('A1').border.top.style, 'medium');
  assert.equal(style('A1').border.top.color, '#333333');
  assert.deepEqual(s.merges, ['F5:G5']);
  assert.equal(s.cols[0].width, 18);
  assert.equal(s.rows[0].height, 24);
  assert.deepEqual(s.freeze, { rows: 1, cols: 1 });
  assert.equal(s.tables[0].name, 'SalesTable');
  assert.deepEqual(s.tables[0].columns, ['Region', 'Product', 'Sales', 'Share']);
  assert.equal(s.cf.length, 2);
  const cell = s.cf.find((entry) => entry.rule.kind === 'cell');
  assert.equal(cell.rule.op, 'greaterThan');
  assert.equal(back.dxfs[cell.rule.dxf].fill, '#E2F0D9');
  assert.equal(back.dxfs[cell.rule.dxf].font.bold, true);
  assert.equal(s.cf.find((entry) => entry.rule.kind === 'dataBar').rule.color, '#638EC6');
  assert.equal(s.validations[0].type, 'list');
  assert.equal(s.validations[0].a, 'A,B,C');
  assert.equal(s.notes.C2, 'Rounded figures');
  assert.equal(s.links.F4, 'https://example.org/report');
  assert.equal(back.names[0].name, 'SalesRange');
  assert.equal(back.names[0].ref, 'Sheet1!$C$2:$C$5');
  assert.equal(s.charts.length, 1);
  assert.equal(s.charts[0].kind, 'column');
  assert.equal(s.charts[0].title, 'Sales');
  assert.equal(s.charts[0].series[0].vals, 'Sheet1!$C$2:$C$5');
  assert.equal(s.charts[0].series[0].cats, 'Sheet1!$A$2:$A$5');
  assert.deepEqual(s.charts[0].from, { col: 8, row: 1 });
  const notes = back.sheets[1];
  assert.equal(notes.rtl, true);
  assert.equal(notes.tabColor, '#C00000');
  assert.equal(notes.cells.A1.v, 'ملاحظات');
  assert.equal(notes.cells.A2.f, 'Sheet1!F1');
  // Recalculating the file we read gives the same numbers.
  const again = recalculate(back);
  assert.equal(again.sheets[0].cells.D3.v, 20 / 50);
});

test('spilled arrays are written as array formulas and come back', async () => {
  const wb = book({ Sheet1: { A1: 3, A2: 1, A3: 2, C1: '=SORT(A1:A3)' } });
  const { wb: back } = await roundTrip(wb);
  const s = back.sheets[0];
  assert.equal(s.cells.C1.f, 'SORT(A1:A3)');
  assert.deepEqual(s.cells.C1.spill, { rows: 3, cols: 1 });
  assert.equal(s.cells.C2.sp, 'C1');
  assert.deepEqual(['C1', 'C2', 'C3'].map((k) => valueAt(recalculate(back), k)), [1, 2, 3]);
});

test('newer functions are prefixed on write and unprefixed on read', () => {
  assert.equal(addFunctionPrefixes('XLOOKUP(A1,B:B,C:C)+SUM(FILTER(A:A,A:A>1))'), '_xlfn.XLOOKUP(A1,B:B,C:C)+SUM(_xlfn._xlws.FILTER(A:A,A:A>1))');
  assert.equal(addFunctionPrefixes('SUM(A1)+"XLOOKUP("'), 'SUM(A1)+"XLOOKUP("');
  assert.equal(stripFunctionPrefixes('_xlfn.XLOOKUP(A1,B:B,C:C)+SUM(_xlfn._xlws.FILTER(A:A,A:A>1))'), 'XLOOKUP(A1,B:B,C:C)+SUM(FILTER(A:A,A:A>1))');
});

/** A small hand-built workbook the way Excel lays one out. */
async function excelStyleFile() {
  const zip = new JSZip();
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="${main}" xmlns:r="${rel}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Grades" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Grades!$A$1:$C$4</definedName><definedName name="Passing">Grades!$E$1</definedName></definedNames><calcPr calcId="191029"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0"?><styleSheet xmlns="${main}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0&quot; pts&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FFFF0000"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.79998168889431442"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/></styleSheet>`);
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst xmlns="${main}" count="5" uniqueCount="5"><si><t>Student</t></si><si><t>Math</t></si><si><r><t>Ali</t></r><r><t> Hassan</t></r></si><si><t>Sara</t></si><si><t>Total</t></si></sst>`);
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="${main}" xmlns:r="${rel}"><sheetPr><tabColor rgb="FF00B050"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:C4"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="20" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" s="2" t="s"><v>0</v></c><c r="B1" s="2" t="s"><v>1</v></c><c r="C1" s="2" t="s"><v>4</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>17.5</v></c><c r="C2"><f t="shared" ref="C2:C3" si="0">B2*2</f><v>35</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>20</v></c><c r="C3"><f t="shared" si="0"/><v>40</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Inline</t></is></c><c r="B4" t="b"><v>1</v></c><c r="C4" t="e"><v>#DIV/0!</v></c><c r="D4" s="3"><v>46085</v></c><c r="E4"><f>_xlfn.XLOOKUP(A3,A2:A3,B2:B3)</f><v>20</v></c></row></sheetData><pageMargins left="0.5" right="0.5" top="1" bottom="1" header="0.3" footer="0.3"/><pageSetup orientation="landscape" r:id="rId9"/><drawing r:id="rId1"/></worksheet>`);
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/drawing" Target="../drawings/drawing1.xml"/><Relationship Id="rId9" Type="${rel}/printerSettings" Target="../printerSettings/printerSettings1.bin"/></Relationships>`);
  zip.file('xl/printerSettings/printerSettings1.bin', new Uint8Array([1, 2, 3, 4]));
  zip.file('xl/drawings/drawing1.xml', `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${rel}"><xdr:oneCellAnchor><xdr:from><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="952500" cy="952500"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/image" Target="../media/image1.png"/></Relationships>`);
  zip.file('xl/media/image1.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  zip.file('customXml/item1.xml', '<keep>me</keep>');
  return zip.generateAsync({ type: 'uint8array' });
}

test('reads an Excel-style file: shared strings, shared formulas, theme colours, types', async () => {
  const { wb, warnings } = await readXlsx(await excelStyleFile());
  assert.deepEqual(warnings, []);
  const s = wb.sheets[0];
  assert.equal(s.name, 'Grades');
  assert.equal(s.cells.A1.v, 'Student');
  assert.equal(s.cells.A2.v, 'Ali Hassan');
  assert.equal(s.cells.A4.v, 'Inline');
  assert.equal(s.cells.B2.v, 17.5);
  assert.equal(wb.styles[s.cells.B2.s].numFmt, '0.0" pts"');
  assert.equal(s.cells.C2.f, 'B2*2');
  assert.equal(s.cells.C3.f, 'B3*2');
  assert.equal(s.cells.B4.v, true);
  assert.equal(s.cells.C4.e, '#DIV/0!');
  assert.equal(wb.styles[s.cells.D4.s].numFmt, 'm/d/yyyy');
  assert.equal(s.cells.E4.f, 'XLOOKUP(A3,A2:A3,B2:B3)');
  const header = wb.styles[s.cells.A1.s];
  assert.equal(header.font.bold, true);
  assert.equal(header.font.name, 'Arial');
  assert.equal(header.font.size, 12);
  assert.equal(header.font.color, '#FF0000');
  assert.match(header.fill, /^#[0-9A-F]{6}$/);
  assert.notEqual(header.fill, '#4472C4');
  assert.equal(s.rtl, true);
  assert.equal(s.tabColor, '#00B050');
  assert.deepEqual(s.freeze, { rows: 1, cols: 0 });
  assert.equal(s.cols[0].width, 20);
  assert.deepEqual(wb.names.map((n) => n.name), ['Passing']);
  assert.deepEqual(wb.defaultFont, { name: 'Calibri', size: 11 });
});

test('editing a file keeps its pictures, printer settings, page setup and unknown parts', async () => {
  const original = await excelStyleFile();
  const { wb } = await readXlsx(original);
  const edited = run(wb, { op: 'setValues', at: 'B5', values: [[99]] }, { op: 'chart', chart: { kind: 'column', range: 'A1:B3' } });
  const bytes = await writeXlsx(edited, original);
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file('xl/media/image1.png'), 'picture kept');
  assert.ok(zip.file('xl/printerSettings/printerSettings1.bin'), 'printer settings kept');
  assert.ok(zip.file('customXml/item1.xml'), 'unknown part kept');
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheetXml, /<pageSetup[^>]*orientation="landscape"[^>]*r:id="rId9"/);
  assert.match(sheetXml, /<pageMargins left="0.5"/);
  assert.match(sheetXml, /<drawing r:id="/);
  assert.match(sheetXml, /<pageSetUpPr fitToPage="1"\/>/);
  const sheetRels = await zip.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');
  assert.match(sheetRels, /printerSettings/);
  const drawing = await zip.file('xl/drawings/drawing1.xml').async('string');
  assert.match(drawing, /<xdr:pic>|<xdr:pic /);
  assert.match(drawing, /graphicFrame/);
  const types = await zip.file('[Content_Types].xml').async('string');
  assert.match(types, /drawingml\.chart\+xml/);
  const back = await readXlsx(bytes);
  assert.equal(back.wb.sheets[0].cells.B5.v, 99);
  assert.equal(back.wb.sheets[0].charts.length, 1);
  assert.equal(back.wb.sheets[0].cells.C3.f, 'B3*2');
  assert.equal(back.wb.sheets[0].rtl, true);
});

test('deleting a sheet removes its parts and a new sheet gets its own', async () => {
  let wb = richWorkbook();
  const first = await writeXlsx(wb);
  const read = await readXlsx(first);
  let edited = run(read.wb, { op: 'deleteSheet', sheet: 'Notes' }, { op: 'addSheet', name: 'Extra' }, { op: 'setValues', sheet: 'Extra', at: 'A1', values: [['hello']] });
  const bytes = await writeXlsx(edited, first);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((name) => /worksheets\/sheet\d+\.xml$/.test(name));
  assert.equal(names.length, 2);
  const back = await readXlsx(bytes);
  assert.deepEqual(back.wb.sheets.map((s) => s.name), ['Sheet1', 'Extra']);
  assert.equal(back.wb.sheets[1].cells.A1.v, 'hello');
  wb = edited;
});

test('an empty workbook writes a valid file', async () => {
  const bytes = await writeXlsx(typesModule.emptyWorkbook());
  const back = await readXlsx(bytes);
  assert.equal(back.wb.sheets.length, 1);
  assert.equal(back.wb.sheets[0].name, 'Sheet1');
});

const aiContext = await load('ai/context');
const aiParse = await load('ai/parse');
const aiPrompts = await load('ai/prompts');

test('the assistant sees structure, column types, samples and the selection', () => {
  const wb = run(blank(),
    { op: 'setValues', at: 'A1', values: [['Student', 'Math', 'Date'], ['Ali', 80, '2026-01-05'], ['Sara', 92.5, '2026-01-06'], ['Omar', 'absent', '2026-01-07']] },
    { op: 'setValues', at: 'E1', values: [['Average'], ['=AVERAGE(B2:B4)']] },
    { op: 'freeze', rows: 1 });
  const sheet = aiContext.buildContext(wb, { activeSheet: 0, scope: 'sheet', selection: 'B2:B3' });
  assert.match(sheet, /Sheet "Sheet1" \(active, frozen 1 row/);
  assert.match(sheet, /Used range A1:E4/);
  assert.match(sheet, /A "Student": text/);
  assert.match(sheet, /B "Math": (number|mixed)/);
  assert.match(sheet, /C "Date": date/);
  assert.match(sheet, /=AVERAGE\(B2:B4\) → 86\.25/);
  assert.match(sheet, /Selection: "Sheet1"!B2:B3/);
  const selection = aiContext.buildContext(wb, { activeSheet: 0, scope: 'selection', selection: 'A2:B3' });
  assert.match(selection, /Selection: "Sheet1"!A2:B3 \(2 rows × 2 columns\)/);
  assert.match(selection, /Ali \| 80/);
  const read = aiContext.readRequest(wb, 'Sheet1', 'A1:C2', 0);
  assert.match(read, /"Sheet1"!A1:C2/);
  assert.match(aiContext.readRequest(wb, 'Nope', 'A1:C2', 0), /does not exist/);
});

test('large sheets are described within the budget', () => {
  const rows = Array.from({ length: 2000 }, (_, i) => [`Item ${i}`, i, i * 2]);
  const wb = run(blank(), { op: 'setValues', at: 'A1', values: [['Name', 'A', 'B'], ...rows] });
  const text = aiContext.buildContext(wb, { activeSheet: 0, scope: 'sheet', budget: 4000 });
  assert.ok(text.length < 7000, `context was ${text.length} characters`);
  assert.match(text, /of 2001 rows/);
});

test('replies parse prose, fenced operations and read requests; bad operations are dropped', () => {
  const full = aiParse.parseReply('<reply>Added totals.</reply>\n<ops>\n```json\n[{"op":"setValues","at":"D2","values":[["=SUM(B2:C2)"]]},{"op":"explode"},{"op":"format","range":"A1","style":{"font":{"bold":true}}}]\n```\n</ops>');
  assert.equal(full.reply, 'Added totals.');
  assert.equal(full.ops.length, 2);
  assert.equal(full.warnings.length, 1);
  assert.equal(full.hasOps, true);
  const read = aiParse.parseReply('<read>{"sheet":"Data","range":"A1:H200"}</read>');
  assert.deepEqual(read.reads, [{ sheet: 'Data', range: 'A1:H200' }]);
  assert.equal(read.ops.length, 0);
  const plain = aiParse.parseReply('The total is 42.');
  assert.equal(plain.reply, 'The total is 42.');
  assert.equal(plain.hasOps, false);
  const broken = aiParse.parseReply('<reply>ok</reply><ops>[{"op":"setValues"</ops>');
  assert.equal(broken.ops.length, 0);
  assert.equal(broken.warnings.length, 1);
  const lines = aiParse.summarizeOps(full.ops);
  assert.match(lines[0], /Write 1 cell at D2 \(1 formula\)/);
  assert.match(lines[1], /Format A1/);
});

test('the prompt carries workbook, attachments, history and the request', () => {
  const prompt = aiPrompts.buildPrompt({
    context: 'Workbook: 1 sheet', instruction: 'Add a total column', scopeLabel: 'Whole sheet',
    history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }],
    attachments: [{ name: 'grades.csv', kind: 'csv', text: 'a,b' }], pictureNames: ['sheet.jpg'], reads: ['"Sheet1"!A1'],
  });
  for (const part of ['CURRENT WORKBOOK', 'grades.csv', 'sheet.jpg', 'CONVERSATION SO FAR', 'Add a total column', 'SCOPE: Whole sheet', 'CELLS YOU ASKED TO READ']) assert.ok(prompt.includes(part), part);
  assert.match(aiPrompts.SYSTEM_PROMPT, /"op":"setValues"/);
  assert.match(aiPrompts.SYSTEM_PROMPT, /rtl/);
});

test('axes give offsets and hit positions without walking every row', () => {
  const { Axis, sheetAxes, ctrlArrow, usedBounds, currentRegion, stepWithin, mergeAt, expandToMerges } = gridModel;
  const axis = new Axis(20, new Map([[2, 40], [4, 0]]));
  assert.equal(axis.offset(0), 0);
  assert.equal(axis.offset(2), 40);
  assert.equal(axis.offset(3), 80);
  assert.equal(axis.offset(5), 80 + 20 + 0);
  assert.equal(axis.indexAt(0), 0);
  assert.equal(axis.indexAt(45), 2);
  assert.equal(axis.indexAt(80), 3);
  // Index 4 is hidden: its position belongs to the next visible row.
  assert.equal(axis.indexAt(100), 5);
  assert.equal(axis.total(1048576), 1048576 * 20 + 20 - 20);
  const wb = run(blank(), { op: 'colWidth', cols: 'B', width: 20 }, { op: 'rowHeight', rows: '3', height: 30 }, { op: 'visibility', cols: 'C', hidden: true });
  const axes = sheetAxes(wb.sheets[0]);
  assert.equal(axes.cols.size(0), 64);
  assert.equal(axes.cols.size(1), 140);
  assert.equal(axes.cols.size(2), 0);
  assert.equal(axes.rows.size(2), 40);
  assert.equal(axes.rows.size(0), 20);
});

test('Ctrl+arrow, regions and Tab/Enter movement follow Excel', () => {
  const { ctrlArrow, usedBounds, currentRegion, stepWithin, mergeAt, expandToMerges } = gridModel;
  const wb = run(blank(), { op: 'setValues', at: 'B2', values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }, { op: 'setValues', at: 'B6', values: [['far']] }, { op: 'merge', range: 'E2:F3' });
  const sheet = wb.sheets[0];
  assert.deepEqual(usedBounds(sheet), { rows: 6, cols: 4 });
  assert.deepEqual(ctrlArrow(sheet, { row: 1, col: 1 }, 'down'), { row: 3, col: 1 });
  assert.deepEqual(ctrlArrow(sheet, { row: 3, col: 1 }, 'down'), { row: 5, col: 1 });
  assert.deepEqual(ctrlArrow(sheet, { row: 1, col: 1 }, 'right'), { row: 1, col: 3 });
  assert.deepEqual(ctrlArrow(sheet, { row: 1, col: 3 }, 'left'), { row: 1, col: 1 });
  assert.deepEqual(ctrlArrow(sheet, { row: 3, col: 1 }, 'up'), { row: 1, col: 1 });
  assert.deepEqual(currentRegion(sheet, { row: 2, col: 2 }), { r1: 1, c1: 1, r2: 3, c2: 3 });
  assert.deepEqual(stepWithin({ r1: 1, c1: 1, r2: 2, c2: 2 }, { row: 1, col: 2 }, 'next', 'col'), { row: 2, col: 1 });
  assert.deepEqual(stepWithin({ r1: 1, c1: 1, r2: 1, c2: 1 }, { row: 1, col: 1 }, 'next', 'row'), { row: 2, col: 1 });
  assert.equal(mergeAt(sheet, 2, 5).key, 'E2');
  assert.equal(mergeAt(sheet, 0, 0), null);
  assert.deepEqual(expandToMerges(sheet, { r1: 1, c1: 3, r2: 1, c2: 4 }), { r1: 1, c1: 3, r2: 2, c2: 5 });
});

test('display decides text, alignment and colour like Excel', () => {
  const { cellDisplay } = displayModule;
  let wb = run(blank(),
    { op: 'setValues', at: 'A1', values: [['Name', 12.5, true, 'مرحبا', '=1/0', -3]] },
    { op: 'numberFormat', range: 'B1', format: '0.00' },
    { op: 'numberFormat', range: 'F1', format: '#,##0;[Red]-#,##0' },
    { op: 'format', range: 'A1', style: { align: { h: 'center' } } });
  const sheet = wb.sheets[0];
  const at = (col) => cellDisplay(wb, sheet, 0, col);
  assert.deepEqual([at(0).text, at(0).align], ['Name', 'center']);
  assert.deepEqual([at(1).text, at(1).align, at(1).kind], ['12.50', 'right', 'number']);
  assert.deepEqual([at(2).text, at(2).align], ['TRUE', 'center']);
  assert.deepEqual([at(3).align, at(3).rtl], ['right', true]);
  assert.equal(at(4).kind, 'error');
  assert.equal(at(4).text, '#DIV/0!');
  assert.equal(at(5).text, '-3');
  assert.equal(at(5).color, '#FF0000');
  assert.equal(cellDisplay(wb, sheet, 9, 9).kind, 'empty');
  wb = run(wb, { op: 'sheetProps', rtl: true });
  assert.equal(cellDisplay(wb, wb.sheets[0], 0, 1).align, 'left');
  assert.equal(cellDisplay(wb, wb.sheets[0], 0, 7).align, 'left');
});

test('CSV round trips quotes, delimiters and newlines', () => {
  const { parseCsv, sheetToCsv, detectDelimiter } = csvModule;
  assert.deepEqual(parseCsv('a,b,c\n1,"x, y",3\n"he said ""hi""","two\nlines",\n'), [['a', 'b', 'c'], ['1', 'x, y', '3'], ['he said "hi"', 'two\nlines', '']]);
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a\tb\n1\t2'), '\t');
  assert.deepEqual(parseCsv('﻿x,y\r\n1,2'), [['x', 'y'], ['1', '2']]);
  const wb = run(blank(), { op: 'setValues', at: 'A1', values: [['Name', 'Note'], ['Ali', 'a, b'], ['Sara', 'say "x"']] });
  assert.equal(sheetToCsv(wb.sheets[0], wb.styles), 'Name,Note\r\nAli,"a, b"\r\nSara,"say ""x"""\r\n');
});

test('conditional formats: cell rules, scales, bars, expressions and duplicates', () => {
  let wb = run(blank(),
    { op: 'setValues', at: 'A1', values: [[10], [20], [30], [20], ['x']] },
    { op: 'conditionalFormat', range: 'A1:A5', rule: { kind: 'cell', op: 'greaterThan', a: '15', style: { fill: '#FFC7CE', font: { color: '#9C0006', bold: true } } } },
    { op: 'conditionalFormat', range: 'A1:A5', rule: { kind: 'duplicates', style: { fill: '#FFEB9C' } } },
    { op: 'conditionalFormat', range: 'C1:C3', rule: { kind: 'colorScale', colors: ['#000000', '#FFFFFF'] } },
    { op: 'conditionalFormat', range: 'D1:D3', rule: { kind: 'dataBar', color: '#638EC6' } },
    { op: 'conditionalFormat', range: 'E1:E3', rule: { kind: 'expression', formula: 'A1>15', style: { fill: '#C6EFCE' } } },
    { op: 'setValues', at: 'C1', values: [[0, 5, 5], [50, 5, 5], [100, 10, 5]] });
  const ev = new cfModule.CfEvaluator(wb, 0);
  assert.equal(ev.effect(0, 0), null);
  assert.equal(ev.effect(1, 0).fill, '#FFC7CE');
  assert.equal(ev.effect(1, 0).font.bold, true);
  assert.equal(ev.effect(2, 0).fill, '#FFC7CE');
  assert.equal(ev.effect(0, 2).fill, '#000000');
  assert.equal(ev.effect(1, 2).fill, '#808080');
  assert.equal(ev.effect(2, 2).fill, '#FFFFFF');
  assert.equal(ev.effect(2, 3).bar.ratio, 1);
  assert.equal(ev.effect(0, 3).bar.ratio, 0.02);
  // Expression rules are written for the first cell and follow the cell they apply to.
  assert.equal(ev.effect(0, 4), null);
  assert.equal(ev.effect(1, 4).fill, '#C6EFCE');
  assert.equal(ev.effect(2, 4).fill, '#C6EFCE');
});

test('validation finds rules, lists options and checks entries', () => {
  const { validationAt, listOptions, validateEntry } = validationModule;
  let wb = run(blank(),
    { op: 'setValues', at: 'E1', values: [['Yes'], ['No'], ['Maybe']] },
    { op: 'validation', range: 'A1:A5', rule: { type: 'list', a: '=E1:E3', error: 'Pick from the list' } },
    { op: 'validation', range: 'B1:B5', rule: { type: 'whole', op: 'between', a: '1', b: '10', allowBlank: true } },
    { op: 'validation', range: 'C1:C5', rule: { type: 'textLength', op: 'lessThanOrEqual', a: '5', errorStyle: 'warning' } },
    { op: 'validation', range: 'D1:D5', rule: { type: 'list', a: 'Red,Green,Blue' } });
  assert.equal(validationAt(wb, 0, 2, 0).type, 'list');
  assert.equal(validationAt(wb, 0, 2, 5), null);
  assert.deepEqual(listOptions(wb, 0, validationAt(wb, 0, 0, 0)), ['Yes', 'No', 'Maybe']);
  assert.deepEqual(listOptions(wb, 0, validationAt(wb, 0, 0, 3)), ['Red', 'Green', 'Blue']);
  assert.equal(validateEntry(wb, 0, 0, 0, 'yes').ok, true);
  const refused = validateEntry(wb, 0, 0, 0, 'Perhaps');
  assert.equal(refused.ok, false);
  assert.equal(refused.message, 'Pick from the list');
  assert.equal(refused.style, 'stop');
  assert.equal(validateEntry(wb, 0, 0, 1, 5).ok, true);
  assert.equal(validateEntry(wb, 0, 0, 1, 11).ok, false);
  assert.equal(validateEntry(wb, 0, 0, 1, 2.5).ok, false);
  assert.equal(validateEntry(wb, 0, 0, 1, null).ok, true);
  const long = validateEntry(wb, 0, 0, 2, 'far too long');
  assert.equal(long.ok, false);
  assert.equal(long.style, 'warning');
  assert.equal(validateEntry(wb, 0, 7, 7, 'anything').ok, true);
});

test('decimals step up and down on any number format', () => {
  const { adjustDecimals } = numberFormat;
  assert.equal(adjustDecimals('General', 1), '0.0');
  assert.equal(adjustDecimals('0', 1), '0.0');
  assert.equal(adjustDecimals('0.00', -1), '0.0');
  assert.equal(adjustDecimals('0.0', -1), '0');
  assert.equal(adjustDecimals('#,##0', 1), '#,##0.0');
  assert.equal(adjustDecimals('$#,##0.00', -1), '$#,##0.0');
  assert.equal(adjustDecimals('0.0%', 1), '0.00%');
  assert.equal(adjustDecimals('0', -1), '0');
  assert.equal(adjustDecimals('yyyy-mm-dd', 1), 'yyyy-mm-dd');
  assert.equal(adjustDecimals('#,##0.00;[Red](#,##0.00)', -1), '#,##0.0;[Red](#,##0.00)');
});

const findModule = await load('find');
const printModule = await load('printHtml');

test('find locates cells in reading order and replaces text', () => {
  const { findAll, nextHit, replaceIn } = findModule;
  const wb = run(blank(), { op: 'setValues', at: 'A1', values: [['Apple pie', 'apple'], ['Banana', '=CONCAT("Big ","Apple")'], [12, 'Pineapple']] });
  assert.deepEqual(findAll(wb, 'apple', [0]).map((h) => h.key), ['A1', 'B1', 'B2', 'B3']);
  assert.deepEqual(findAll(wb, 'apple', [0], { matchCase: true }).map((h) => h.key), ['B1', 'B3']);
  assert.deepEqual(findAll(wb, 'apple', [0], { entireCell: true }).map((h) => h.key), ['B1']);
  assert.deepEqual(findAll(wb, 'CONCAT', [0], { inFormulas: true }).map((h) => h.key), ['B2']);
  assert.deepEqual(findAll(wb, '12', [0]).map((h) => h.key), ['A3']);
  const hits = findAll(wb, 'apple', [0]);
  assert.equal(nextHit(hits, 0, 0, 0).key, 'B1');
  assert.equal(nextHit(hits, 0, 2, 1).key, 'A1');
  assert.equal(replaceIn('Apple pie, apple', 'apple', 'pear'), 'pear pie, pear');
  assert.equal(replaceIn('Apple', 'apple', 'pear', { matchCase: true }), 'Apple');
});

test('print HTML carries values, styles, merges, RTL and charts', () => {
  const { workbookToHtml, DEFAULT_PRINT } = printModule;
  let wb = run(blank(),
    { op: 'setValues', at: 'A1', values: [['Name', 'Qty'], ['Pens <b>', 3], ['ملاحظة', 5]] },
    { op: 'format', range: 'A1:B1', style: { font: { bold: true }, fill: '#DDDDDD' } },
    { op: 'merge', range: 'D1:E1' },
    { op: 'freeze', rows: 1 },
    { op: 'chart', chart: { kind: 'column', range: 'A1:B3', at: 'G1' } });
  const html = workbookToHtml(wb, { ...DEFAULT_PRINT, sheets: [0], title: 'Report' });
  assert.ok(html.includes('<title>Report</title>'));
  assert.match(html, /Pens &lt;b&gt;/);
  assert.match(html, /font-weight:700/);
  assert.match(html, /background:#DDDDDD/);
  assert.match(html, /<thead>/);
  assert.match(html, /<svg/);
  assert.match(html, /@page { size: A4 landscape/);
  wb = run(wb, { op: 'sheetProps', rtl: true });
  assert.match(workbookToHtml(wb, { ...DEFAULT_PRINT, sheets: [0] }), /dir="rtl"/);
  assert.match(workbookToHtml(wb, { ...DEFAULT_PRINT, sheets: [0], charts: false }), /^((?!<svg).)*$/s);
});

test('saving again keeps the sheet parts of a workbook that was only ever written by the app', async () => {
  const wb = richWorkbook();
  const first = await writeXlsx(wb);
  // The model made in the app has no `part`; the second save finds each sheet by name.
  const second = await writeXlsx(wb, first);
  const zip = await JSZip.loadAsync(second);
  const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort();
  assert.deepEqual(sheets, ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  const back = await readXlsx(second);
  assert.equal(back.wb.sheets[0].cells.D2.f, 'C2/SUM(C$2:C$5)');
  assert.equal(back.wb.sheets[0].charts.length, 1);
});

test('a macro-enabled workbook keeps its content type and its VBA project through a save', async () => {
  const original = await excelStyleFile();
  const zip = await JSZip.loadAsync(original);
  const types = await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml', types.replace('spreadsheetml.sheet.main+xml', 'ms-excel.sheet.macroEnabled.main+xml').replace('</Types>', '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>'));
  zip.file('xl/vbaProject.bin', new Uint8Array([1, 2, 3]));
  const macro = await zip.generateAsync({ type: 'uint8array' });
  const { wb } = await readXlsx(macro);
  const bytes = await writeXlsx(run(wb, { op: 'setValues', at: 'B6', values: [[1]] }), macro);
  const out = await JSZip.loadAsync(bytes);
  assert.match(await out.file('[Content_Types].xml').async('string'), /macroEnabled\.main\+xml/);
  assert.ok(out.file('xl/vbaProject.bin'));
});
