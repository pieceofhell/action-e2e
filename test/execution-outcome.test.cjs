const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlaywrightReport } = require('../src/services/test-runner');
const { buildInsights } = require('../src/services/insight-builder');

const expectedTests = [{ title: 'Expected journey' }];
test('report attachment paths preserve Windows/POSIX conventions and reject traversal or other roots', () => {
  const scenarios = [
    { root: 'C:\\runs\\safe', inside: 'C:\\runs\\safe\\results\\image.png', outside: ['C:\\runs\\safe\\..\\outside.png', 'D:\\runs\\safe\\image.png', 'C:\\runs\\safe-other\\image.png'] },
    { root: '/tmp/runs/safe', inside: '/tmp/runs/safe/results/image.png', outside: ['/tmp/runs/safe/../outside.png', '/etc/passwd', '/tmp/runs/safe-other/image.png'] },
    { root: '\\\\host\\share\\safe', inside: '\\\\host\\share\\safe\\results\\image.png', outside: ['\\\\other\\share\\safe\\image.png', '\\\\host\\share\\safe\\..\\outside.png'] },
  ];
  for (const scenario of scenarios) {
    const parsed = parsePlaywrightReport({ suites: [{ specs: [{ title: 'Evidence', tests: [{ results: [{ status: 'passed', attachments:
      [scenario.inside, ...scenario.outside, 'results/relative.png'].map(file => ({ name: 'screenshot', contentType: 'image/png', path: file })) }] }] }] }],
      stats: { duration: 1 } }, { runDirectory: scenario.root });
    assert.deepEqual(parsed.tests[0].evidence.map(item => item.relativePath), ['results/image.png']);
  }
});
const reportFor = (status, error = null) => ({
  suites: [{ specs: [{ title: 'Expected journey', file: 'journey.spec.cjs', tests: [{
    results: [{ status, duration: 12, ...(error ? { error: { message: error } } : {}) }],
  }] }] }],
  stats: { duration: 12 },
  errors: [],
});

test('missing and malformed Playwright reports are infrastructure errors, never green runs', () => {
  for (const report of [null, {}, { suites: 'not-an-array' }]) {
    const parsed = parsePlaywrightReport(report, { expectedTests, exitCode: 1 });
    assert.equal(parsed.summary.result, 'infrastructure-error');
    assert.equal(parsed.summary.executionState, 'incomplete');
    assert.equal(parsed.summary.passed, 0);
    assert.ok(parsed.summary.issues.length);
  }
});

test('a browser launch error is distinguished from a failed assertion', () => {
  const infrastructure = parsePlaywrightReport({ suites: [], errors: [{ message: 'browserType.launch failed' }] },
    { expectedTests, exitCode: 1 });
  assert.equal(infrastructure.summary.result, 'infrastructure-error');
  const assertion = parsePlaywrightReport(reportFor('failed', 'expect(locator).toHaveText failed'),
    { expectedTests, exitCode: 1 });
  assert.equal(assertion.summary.executionState, 'completed');
  assert.equal(assertion.summary.result, 'assertion-failed');
  assert.equal(assertion.summary.failed, 1);
});

test('a partial suite and a skipped suite are not reported as success', () => {
  const partial = parsePlaywrightReport(reportFor('passed'),
    { expectedTests: [...expectedTests, { title: 'Missing journey' }], exitCode: 0 });
  assert.equal(partial.summary.result, 'infrastructure-error');
  assert.equal(partial.summary.missing, 1);
  const skipped = parsePlaywrightReport(reportFor('skipped'), { expectedTests, exitCode: 0 });
  assert.equal(skipped.summary.result, 'no-verification');
});

test('only a complete, zero-exit suite of expected passing tests is approved', () => {
  const parsed = parsePlaywrightReport(reportFor('passed'), { expectedTests, exitCode: 0 });
  assert.equal(parsed.summary.executionState, 'completed');
  assert.equal(parsed.summary.result, 'passed');
  assert.equal(parsed.summary.verified, 1);
  const inconsistent = parsePlaywrightReport(reportFor('passed'), { expectedTests, exitCode: 2 });
  assert.equal(inconsistent.summary.result, 'infrastructure-error');
});

test('insights do not equate zero tests or incomplete execution with success', () => {
  const report = parsePlaywrightReport(null, { expectedTests, exitCode: 1 });
  const insights = buildInsights({ inspection: { warnings: [], detection: {} }, approvedFlows: expectedTests, report });
  assert.ok(insights.limitations.some(item => /incomplete|missing|unavailable/i.test(item)));
  assert.ok(!insights.insights.some(item => /without a fatal failure/i.test(item)));
});
