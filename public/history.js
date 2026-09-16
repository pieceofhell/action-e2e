(() => {
  const dialog = document.getElementById('historyDialog');
  const list = document.getElementById('historyList');
  const detail = document.getElementById('historyDetail');
  const filter = document.getElementById('historyFilter');
  const status = document.getElementById('historyStatus');
  const cache = new Map();
  const labels = { confirmed: 'Confirmed by human', 'expected-behavior': 'Expected behavior / false positive', environment: 'Environment problem', inconclusive: 'Inconclusive' };
  let runs = [];
  let selection = 0;
  const esc = escapeHtml;
  const date = value => new Date(value).toLocaleString();

  async function request(url, body) {
    // A reload or server restart rotates the local token. Resolve it afresh for history operations.
    const health = await fetch('/api/health').then(response => response.json());
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-E2P-Request-Token': health.requestToken },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'History could not be loaded.');
    return data;
  }
  function renderList() {
    const query = filter.value.trim().toLowerCase();
    const filtered = runs.filter(run => `${run.projectName} ${run.projectPath} ${run.id} ${run.model}`.toLowerCase().includes(query));
    status.textContent = `${filtered.length} saved run(s). Open a run to inspect evidence or review hypotheses.`;
    list.innerHTML = filtered.map(run => `<button type="button" class="history-run" data-open-run="${esc(run.id)}">
      <span><strong>${esc(run.projectName)}</strong><small>${esc(date(run.createdAt))} · ${esc(run.model || 'Model not recorded')}</small><small>${esc(run.projectPath || run.id)}</small></span>
      <span>${esc(run.stage)}${run.summary ? ` · ${run.summary.passed || 0}/${run.summary.total || 0} passed` : ''}<small>${run.hypothesisCount} hypotheses · ${run.reviewCount} reviewed</small></span>
    </button>`).join('') || '<p>No matching saved runs.</p>';
  }
  async function openHistory() {
    dialog.showModal();
    document.body.classList.add('has-open-dialog');
    status.textContent = 'Loading saved runs…';
    try { runs = (await request('/api/history')).runs; renderList(); }
    catch (error) { status.textContent = error.message; }
  }
  async function openRun(id) {
    const version = ++selection;
    detail.innerHTML = '<p role="status">Loading run…</p>';
    try {
      const { run } = await request(`/api/history/${encodeURIComponent(id)}`);
      if (version !== selection) return;
      cache.set(id, run);
      const bugs = run.bugReport;
      detail.innerHTML = `<article class="summary-card">
        <h3 tabindex="-1" id="historyRunTitle">${esc(run.projectName)} · ${esc(run.stage)}</h3>
        <p>${esc(run.id)} · ${esc(date(run.createdAt))}</p>
        <p>${esc(run.insights?.overview || 'This run has no final insight report. Available artifacts are shown below.')}</p>
        ${run.qaCoverage ? `<p>QA goals: ${run.qaCoverage.summary?.covered || 0}/${run.qaCoverage.summary?.total || 0} covered</p>` : ''}
        <p>Historical review only. Opening a run does not replace or execute your current project.</p>
      </article>
      ${run.report ? renderEvidenceGallery(run.report.tests, { baseUrl: run.artifactBaseUrl, authMode: run.authMode }) : '<p>No executed test report is available for this run.</p>'}
      ${(run.report?.tests || []).map(test => `<article class="result-card"><strong>${esc(test.title)} · ${esc(test.status)}</strong>${test.error ? `<pre class="code-block">${esc(test.error)}</pre>` : ''}</article>`).join('')}
      <h3>Hypotheses and human review</h3>
      ${bugs?.humanFeedback?.count ? `<p>This analysis consulted ${bugs.humanFeedback.count} previous human review(s).</p><details><summary>Feedback used in this analysis</summary>${bugs.humanFeedback.entries.map(eventHtml).join('')}</details>` : ''}
      ${(bugs?.hypotheses || []).map((hypothesis, index) => renderBugHypothesis(hypothesis, index, id)).join('') || '<p>No retained hypotheses were recorded.</p>'}`;
      document.getElementById('historyRunTitle').focus();
    } catch (error) { if (version === selection) detail.textContent = error.message; }
  }
  function eventsFor(runId, hypothesisId) { return (cache.get(runId)?.reviews || []).filter(review => review.hypothesisId === hypothesisId); }
  function eventHtml(review) {
    return `<div class="review-event"><strong>${esc(labels[review.decision] || review.decision)}</strong> · ${esc(date(review.createdAt))}<p>${esc(review.notes)}</p><small>Source: ${esc(review.runId)}</small></div>`;
  }
  function reviewForm(runId, hypothesis) {
    if (!runId || !hypothesis.id) return '';
    const reviews = eventsFor(runId, hypothesis.id);
    const current = reviews[0];
    return `<details class="human-review" data-review-run="${esc(runId)}" data-hypothesis="${esc(hypothesis.id)}">
      <summary>Human review · ${esc(current ? labels[current.decision] : 'Open to review')}</summary>
      <p>Your decision is saved separately from the model result. Future analyses of this project can consult its reasoning.</p>
      <form class="review-form">
        <label class="field"><span>Decision</span><select name="decision" aria-label="Decision" required><option value="">Choose a decision</option>${Object.entries(labels).map(([value, label]) => `<option value="${value}"${current?.decision === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label class="field"><span>Justification and supporting evidence</span><textarea name="notes" required maxlength="3000" placeholder="Explain what you verified, the expected behavior, and any relevant steps or source references.">${esc(current?.notes || '')}</textarea></label>
        <button class="button" type="submit">Save human review</button>
        <p class="review-status" role="status"></p>
      </form>
      <div class="review-events">${reviews.map(eventHtml).join('')}</div>
    </details>`;
  }
  document.getElementById('historyButton').addEventListener('click', openHistory);
  document.getElementById('closeHistoryButton').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('has-open-dialog'));
  filter.addEventListener('input', renderList);
  list.addEventListener('click', event => { const button = event.target.closest('[data-open-run]'); if (button) openRun(button.dataset.openRun); });
  detail.addEventListener('error', handleEvidenceMediaError, true);
  detail.addEventListener('load', handleEvidenceMediaReady, true);
  detail.addEventListener('loadedmetadata', handleEvidenceMediaReady, true);
  detail.addEventListener('click', handleEvidenceRetry);
  document.addEventListener('toggle', async event => {
    const review = event.target;
    if (!review.matches?.('.human-review') || !review.open || review.dataset.loaded) return;
    review.dataset.loaded = 'true';
    const message = review.querySelector('.review-status');
    const form = review.querySelector('form');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { run } = await request(`/api/history/${encodeURIComponent(review.dataset.reviewRun)}`);
      cache.set(run.id, run);
      const events = eventsFor(run.id, review.dataset.hypothesis);
      review.querySelector('.review-events').innerHTML = events.map(eventHtml).join('');
      if (events[0] && !form.elements.notes.value && !form.elements.decision.value) {
        form.elements.decision.value = events[0].decision;
        form.elements.notes.value = events[0].notes;
      }
      review.querySelector('summary').textContent = `Human review · ${events[0] ? labels[events[0].decision] : 'Not reviewed yet'}`;
    } catch (error) { message.textContent = error.message; delete review.dataset.loaded; }
    finally { button.disabled = false; }
  }, true);
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('.review-form')) return;
    event.preventDefault();
    const block = form.closest('.human-review');
    const button = form.querySelector('button');
    const message = form.querySelector('.review-status');
    button.disabled = true;
    try {
      const { review } = await request(`/api/history/${encodeURIComponent(block.dataset.reviewRun)}/reviews`, {
        hypothesisId: block.dataset.hypothesis, decision: form.elements.decision.value, notes: form.elements.notes.value,
      });
      const run = cache.get(review.runId);
      if (run) run.reviews.unshift(review);
      block.querySelector('summary').textContent = `Human review · ${labels[review.decision]}`;
      block.querySelector('.review-events').insertAdjacentHTML('afterbegin', eventHtml(review));
      message.textContent = 'Saved. Future analyses of this project can consult this feedback.';
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
  window.E2PHistory = { reviewForm };
})();
