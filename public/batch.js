(() => {
  const pathsInput = document.getElementById('batchPathsInput');
  const addCurrent = document.getElementById('batchAddCurrentButton');
  const browse = document.getElementById('batchBrowseButton');
  const queueButton = document.getElementById('batchQueueButton');
  const autoSkip = document.getElementById('batchAutoSkipReview');
  const status = document.getElementById('batchStatus');
  const list = document.getElementById('batchList');
  const escape = value => escapeHtml(value == null ? '' : String(value));
  let batches = [];

  async function request(url, body) {
    const health = await fetch('/api/health').then(response => response.json());
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-E2P-Request-Token': health.requestToken },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Batch request failed.');
    return data;
  }

  function addPath(value) {
    const path = String(value || '').trim();
    if (!path) return;
    const current = pathsInput.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!current.some(item => item.toLowerCase() === path.toLowerCase())) current.push(path);
    pathsInput.value = current.join('\n');
  }

  function render() {
    const openGroups = new Set([...list.querySelectorAll('.batch-group[open]')].map(item => item.dataset.batchId));
    const active = batches.reduce((count, batch) => count + batch.jobs.filter(job => ['queued', 'running', 'awaiting-review'].includes(job.status)).length, 0);
    status.textContent = active ? `${active} pending` : `${batches.length} batch${batches.length === 1 ? '' : 'es'}`;
    list.innerHTML = batches.map(batch => `<details class="batch-group" data-batch-id="${escape(batch.id)}" ${openGroups.has(batch.id) || batch.jobs.some(job => job.status === 'running') ? 'open' : ''}>
      <summary><strong>${escape(new Date(batch.createdAt).toLocaleString())}</strong> · ${batch.jobs.length} project(s) · ${escape(batch.model || batch.provider)} · ${batch.autoSkipBugReview ? 'auto-skip feedback' : 'human feedback required'}</summary>
      <ol class="batch-jobs">${batch.jobs.map(job => `<li class="batch-job" data-status="${escape(job.status)}">
        <div><strong>${escape(job.projectName)}</strong><span class="status-chip">${escape(job.status)}</span></div>
        <small>${escape(job.projectPath)}</small>
        <p>${escape(job.stage)} · ${escape(job.message || '')}</p>
        ${job.summary ? `<p>Test result: ${escape(job.summary.result || job.result || 'unavailable')} · ${job.summary.passed || 0}/${job.summary.total || 0} passed · ${job.summary.failed || 0} failed${job.summary.missing ? ` · ${job.summary.missing} missing` : ''}</p>` : ''}
        ${job.error ? `<p class="batch-error">${escape(job.error)}</p>` : ''}
        <div class="button-row">
          ${job.runId ? `<button class="button button--quiet" type="button" data-batch-open-run="${escape(job.runId)}">Open full run</button><a href="/artifacts/${encodeURIComponent(job.runId)}/run-log.json" download="${escape(job.runId)}-run-log.json">Download run log</a>` : ''}
          ${job.status === 'awaiting-review' ? `<button class="button button--secondary" type="button" data-batch-continue="${escape(batch.id)}" data-job-id="${escape(job.id)}">Continue after review</button>` : ''}
        </div>
      </li>`).join('')}</ol>
    </details>`).join('') || '<p class="muted">No batches queued yet.</p>';
  }

  async function refresh() {
    try { batches = (await request('/api/batches')).batches; render(); }
    catch (error) { status.textContent = error.message; }
  }

  async function queue() {
    const projectPaths = pathsInput.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!projectPaths.length) { status.textContent = 'Add at least one project folder.'; return; }
    queueButton.disabled = true;
    status.textContent = 'Queueing…';
    try {
      await request('/api/batches', { projectPaths, aiConfig: collectAiConfig(), authConfig: collectAuthConfig(),
        autoSkipBugReview: autoSkip.checked });
      pathsInput.value = '';
      await refresh();
    } catch (error) { status.textContent = error.message; }
    finally { queueButton.disabled = false; }
  }

  addCurrent.addEventListener('click', () => addPath(document.getElementById('projectPathInput').value));
  browse.addEventListener('click', async () => {
    browse.disabled = true;
    try { const data = await request('/api/project/select', {}); addPath(data.selectedPath); }
    catch (error) { status.textContent = error.message; }
    finally { browse.disabled = false; }
  });
  queueButton.addEventListener('click', queue);
  list.addEventListener('click', async event => {
    const open = event.target.closest('[data-batch-open-run]');
    if (open) { window.E2PHistory?.openRun(open.dataset.batchOpenRun); return; }
    const button = event.target.closest('[data-batch-continue]');
    if (!button) return;
    button.disabled = true;
    try { await request(`/api/batches/${encodeURIComponent(button.dataset.batchContinue)}/jobs/${encodeURIComponent(button.dataset.jobId)}/continue`, {}); await refresh(); }
    catch (error) { status.textContent = error.message; button.disabled = false; }
  });
  void refresh();
  setInterval(refresh, 2500);
})();
