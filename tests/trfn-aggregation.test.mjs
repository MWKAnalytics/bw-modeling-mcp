import test from 'node:test';
import assert from 'node:assert/strict';
import { setTargetAggregation, targetAggregations } from '../dist/tools/transformation.js';
import { undeclaredArguments } from '../dist/arguments.js';

// The aggregation of a rule is held by the target field of the transformation's target
// segment, not by the rule. Rule steps repeat the same field name without it, so only the
// target segment may be touched.
const xml =
  '<trfn:transformation name="TRFN_X">' +
  '<source id="0" name="SRC" type="ADSO"><segment id="1">' +
  '<element name="KYF_A" aggregationBehavior="SUM"/></segment></source>' +
  '<target id="0" name="TGT" type="TRCS"><segment id="1">' +
  '<element posit="0001" key="true" name="CHAR_A" infoObjectName="CHAR_A">' +
  '<element posit="0002" key="false" aggregationType="MOV" aggregationCanBeOverwritten="true" ' +
  'defaultAggregationType="MOV" name="KYF_A" aggregationBehavior="SUM">' +
  '<element posit="0003" key="false" aggregationType="SUM" aggregationCanBeOverwritten="false" ' +
  'defaultAggregationType="SUM" name="KYF_B">' +
  '</segment></target>' +
  '<group id="2"><rule id="9"><step><output id="1">' +
  '<element name="KYF_A" aggregationBehavior="SUM"/></output></step></rule></group>' +
  '</trfn:transformation>';

test('the aggregation of the target key figures is read from the target segment', () => {
  assert.deepEqual([...targetAggregations(xml)], [['KYF_A', 'MOV'], ['KYF_B', 'SUM']]);
});

test('setting it changes the target field and nothing else', () => {
  const r = setTargetAggregation(xml, 'KYF_A', 'SUM');
  assert.equal(r.previous, 'MOV');
  assert.equal(targetAggregations(r.xml).get('KYF_A'), 'SUM');
  assert.equal(r.xml.replace('aggregationType="SUM" aggregationCanBeOverwritten="true"', ''),
    xml.replace('aggregationType="MOV" aggregationCanBeOverwritten="true"', ''));
});

test('a characteristic, an unknown field and a fixed aggregation are refused', () => {
  assert.match(setTargetAggregation(xml, 'CHAR_A', 'SUM').error, /no aggregation/);
  assert.match(setTargetAggregation(xml, 'NOT_THERE', 'SUM').error, /not a field/);
  assert.match(setTargetAggregation(xml, 'KYF_B', 'MOV').error, /cannot override/);
  // Asking for the value it already has is not a change, and not refused.
  assert.equal(setTargetAggregation(xml, 'KYF_B', 'SUM').previous, 'SUM');
});

test('an argument the tool does not declare is refused with the declared ones', () => {
  const tool = { name: 'bw_tool', inputSchema: { properties: { known_a: {}, known_b: {} } } };
  assert.equal(undeclaredArguments(tool, { known_a: 'x' }), undefined);
  assert.equal(undeclaredArguments(tool, undefined), undefined);
  const msg = undeclaredArguments(tool, { known_a: 'x', invented: 'y', AGGR: 'z' });
  assert.match(msg, /does not take "invented", "AGGR"/);
  assert.match(msg, /nothing was changed/);
  assert.match(msg, /known_a, known_b/);
});
