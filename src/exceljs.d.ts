declare module "exceljs" {
  interface CellLike {
    value: unknown;
  }

  interface RowLike {
    values: unknown[];
    getCell(index: number): CellLike;
  }

  interface WorksheetLike {
    getRow(index: number): RowLike;
    eachRow(callback: (row: RowLike, rowNumber: number) => void): void;
  }

  export class Workbook {
    xlsx: {
      load(buffer: Buffer): Promise<void>;
    };
    worksheets: WorksheetLike[];
  }

  const ExcelJS: {
    Workbook: typeof Workbook;
  };

  export default ExcelJS;
}
