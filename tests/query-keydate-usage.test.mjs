import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQueryDocument } from '../dist/tools/query.js';

const variable = (id, name, iobj) =>
  `<Qry:subComponents xsi:type="Qry:Variable" id="${id}" technicalName="${name}" infoObject="${iobj}">` +
  `<Qry:description value="${name} text"/><Qry:type>CharacteristicValue</Qry:type></Qry:subComponents>`;

const doc = ({ keyDate = '<Qry:keyDate default="true"/>', main = '', subs = '', description = 'QUERY_NAME text' } = {}) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<Qry:queryResource xmlns:Qry="http://www.sap.com/bw/qry" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:atom="http://www.w3.org/2005/Atom">' +
  `<Qry:mainComponent id="MAINID" technicalName="QUERY_NAME" providerName="PROVIDER">` +
  `<Qry:description value="${description}"/>` +
  '<Qry:entityProperties><atom:link rel="related" href="/sap/bw/modeling/adso/provider/a"/></Qry:entityProperties>' +
  keyDate + main +
  '</Qry:mainComponent>' + subs +
  '</Qry:queryResource>';

const usage = (q, name) => q.variables.find((v) => v.technicalName === name)?.usedIn;

test('the key date defaults to the system date', () => {
  assert.deepEqual(parseQueryDocument(doc(), 'QUERY_NAME').settings.keyDate, { kind: 'systemDate' });
  assert.deepEqual(parseQueryDocument(doc({ keyDate: '<Qry:keyDate/>' }), 'QUERY_NAME').settings.keyDate, { kind: 'systemDate' });
});

test('a key date variable is reported with its name and counted as a use', () => {
  const q = parseQueryDocument(doc({
    keyDate: '<Qry:keyDate default="false"><Qry:value>VAR_KEYDATE</Qry:value><Qry:variable>VARID1</Qry:variable><Qry:type>VariableCIN</Qry:type></Qry:keyDate>',
    subs: variable('VARID1', 'VAR_KEYDATE', '0CALDAY'),
  }), 'QUERY_NAME');
  assert.deepEqual(q.settings.keyDate, { kind: 'variable', variable: 'VAR_KEYDATE', description: 'VAR_KEYDATE text' });
  assert.deepEqual(usage(q, 'VAR_KEYDATE'), ['key date']);
});

test('a fixed key date is reported as a date', () => {
  const q = parseQueryDocument(doc({
    keyDate: '<Qry:keyDate default="false"><Qry:value>20260101</Qry:value></Qry:keyDate>',
  }), 'QUERY_NAME');
  assert.deepEqual(q.settings.keyDate, { kind: 'fixed', date: '20260101' });
});

test('filter, default value, formula and text uses are named; an unused variable has none', () => {
  const q = parseQueryDocument(doc({
    description: 'Report for &VAR_TEXT&',
    main:
      '<Qry:filter id="F1">' +
      '<Qry:selections infoObject="CHAR_A" usageType="restriction"><Qry:tokens xsi:type="Qry:SelectionVariable" variable="VARID2"/></Qry:selections>' +
      '<Qry:selections infoObject="CHAR_B" usageType="asStartValue"><Qry:tokens xsi:type="Qry:SelectionVariable" variable="VARID3"/></Qry:selections>' +
      '</Qry:filter>',
    subs:
      variable('VARID2', 'VAR_FILTER', 'CHAR_A') +
      variable('VARID3', 'VAR_DEFAULT', 'CHAR_B') +
      variable('VARID4', 'VAR_FORMULA', '1KYFNM') +
      variable('VARID5', 'VAR_TEXT', 'CHAR_C') +
      variable('VARID6', 'VAR_UNUSED', 'CHAR_D') +
      '<Qry:subComponents xsi:type="Qry:CalculatedMeasure" id="CKFID" technicalName="CKF_NAME"><Qry:member>' +
      '<Qry:formulaDefinition><Qry:formulaToken xsi:type="Qry:FormulaVariable" variable="VARID4"/></Qry:formulaDefinition>' +
      '</Qry:member></Qry:subComponents>',
  }), 'QUERY_NAME');
  assert.deepEqual(usage(q, 'VAR_FILTER'), ['filter on CHAR_A']);
  assert.deepEqual(usage(q, 'VAR_DEFAULT'), ['default value of CHAR_B']);
  assert.deepEqual(usage(q, 'VAR_FORMULA'), ['CKF CKF_NAME (formula)']);
  assert.deepEqual(usage(q, 'VAR_TEXT'), ['text of query']);
  assert.deepEqual(usage(q, 'VAR_UNUSED'), []);
});
