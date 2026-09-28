import assert from "node:assert/strict";
import test from "node:test";
import { toCsv } from "./report-format.ts";

test("CSV formula injection is neutralized for headers and every string cell", () => {
  const csv = toCsv(
    ["=header", "safe"],
    [["=1+1", "+cmd", "-1+2", "@SUM(A1)", " \t=1", "safe,with comma", -42]],
  );
  assert.equal(
    csv,
    "'=header,safe\r\n'=1+1,'+cmd,'-1+2,'@SUM(A1),' \t=1,\"safe,with comma\",-42",
  );
});

test("CSV escapes quotes and both CR/LF while retaining spreadsheet-safe numeric values", () => {
  assert.equal(
    toCsv(["Name"], [['a,"b"\r\n=1+1']]),
    'Name\r\n"a,""b""\r\n=1+1"',
  );
  assert.equal(toCsv(["Value"], [["\r\n=1+1"]]), 'Value\r\n"\'\r\n=1+1"');
  assert.equal(toCsv(["Amount"], [[-12.5]]), "Amount\r\n-12.5");
});