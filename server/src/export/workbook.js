/**
 * Workbook writer — renders the pure sheet descriptors from `rows.js` into an
 * .xlsx buffer. Deliberately dumb: no business logic lives here.
 *
 * Dates are written as ISO text ("2026-09-14"). That sorts chronologically in a
 * spreadsheet and cannot be shifted by a timezone, which real date cells can be.
 */
import ExcelJS from 'exceljs';
import { buildExportSheets, currencyFormat, exportFileName, resolveMonthIds } from './rows.js';

const HEADER_BG = 'FF111827';
const ZEBRA_BG = 'FFF8FAFC';

function styleSheet(worksheet, sheet, moneyFormat) {
  worksheet.columns = sheet.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 14,
  }));

  const header = worksheet.getRow(1);
  header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 24;

  for (const row of sheet.rows) worksheet.addRow(row);

  sheet.columns.forEach((column, index) => {
    const worksheetColumn = worksheet.getColumn(index + 1);
    if (column.type === 'money') worksheetColumn.numFmt = moneyFormat;
    if (column.type === 'number' || column.type === 'date') {
      worksheetColumn.alignment = { horizontal: 'center' };
    }
  });

  // Re-apply the header alignment last: column-level alignment overwrites row 1.
  header.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };

  if (sheet.rows.length === 0) {
    worksheet.addRow({ [sheet.columns[0].key]: 'Nothing recorded yet.' });
    return;
  }

  for (let index = 0; index < sheet.rows.length; index += 1) {
    if (index % 2 === 1) {
      worksheet.getRow(index + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_BG } };
    }
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Build the .xlsx for a store. `options.months` = 'all' | 'YYYY-MM' | array | csv. */
export async function buildWorkbook(store, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Expense Manager';
  workbook.created = new Date();

  const moneyFormat = currencyFormat(store);
  for (const sheet of buildExportSheets(store, options)) {
    styleSheet(workbook.addWorksheet(sheet.name), sheet, moneyFormat);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    fileName: exportFileName(resolveMonthIds(store, options.months ?? 'all')),
  };
}
