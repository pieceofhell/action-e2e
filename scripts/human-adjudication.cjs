const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { compareReviewers } = require('../src/services/reviewer-agreement');
const { validatePacket } = require('../src/services/agent-review');

const categories = ['defeito-confirmado', 'nao-sustentado', 'inconclusivo'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const rules = [
  'Classifique a alegação específica com a evidência disponível. Registre seu julgamento antes de conversar com o outro avaliador.',
  '`defeito-confirmado` quando o efeito viola uma expectativa fundamentada e a evidência sustenta a relação com a ação.',
  '`nao-sustentado` quando a evidência contradiz a alegação ou indica que o comportamento é o previsto.',
  '`inconclusivo` quando falta evidência da ação, do efeito ou da regra esperada. Use essa categoria também quando só houver título e a trajetória não resolver a questão.',
  'Justifique com um passo, estado, diagnóstico ou trecho do código. Trate as descrições da alegação como material a conferir. Alguns efeitos podem se repetir em mais de um caso.',
].join('\n\n');

function renderCase(item, trace) {
  const blocks = [`## ${item.id}\n\n${item.summary}`];
  if (item.observed) blocks.push(`Observação alegada. ${item.observed}`);
  if (item.expected) blocks.push(`Expectativa alegada. ${item.expected}`);
  if (item.expectationReason) blocks.push(`Fundamento alegado. ${item.expectationReason}`);
  if (item.evidenceStateIds?.length) blocks.push(`Estados citados. ${item.evidenceStateIds.join(', ')}.`);
  if (trace.steps?.length) blocks.push('Passos registrados\n\n' + trace.steps.map(step => {
    const action = step.action || {};
    return `- ${step.step}. ${[action.kind, action.name, action.domId && `#${action.domId}`].filter(Boolean).join(' ')} (${step.status})${step.after ? ` → ${step.after}` : ''}${action.value ? ` · valor ${JSON.stringify(action.value)}` : ''}`;
  }).join('\n'));
  if (trace.states?.length) blocks.push('Estados registrados\n\n' + trace.states.map(state => `- ${state.id}. ${state.visibleText || state.title || 'Sem texto registrado.'}`).join('\n'));
  if (trace.pageErrors?.length) blocks.push('Exceções registradas\n\n' + trace.pageErrors.map(error => `- ${typeof error === 'string' ? error : error.message}`).join('\n'));
  if (trace.context) blocks.push('Conferência de navegador e trechos dos alvos\n\n```json\n' + JSON.stringify(trace.context, null, 2) + '\n```');
  return blocks.join('\n\n');
}

async function prepare(input, directory, keyPath) {
  const original = validatePacket(await read(input));
  const entries = [...original.cases].sort((a, b) => hash(['human-v1', a.id]).localeCompare(hash(['human-v1', b.id])));
  const key = {};
  const cases = entries.map(({ replay, id: originalId, ...evidence }, index) => {
    const id = `H${String(index + 1).padStart(2, '0')}`;
    key[id] = originalId;
    return { id, ...evidence };
  });
  const data = { schemaVersion: 1, sourcePacketSha256: original.evidenceSha256, categories, traces: original.traces, cases };
  const evidenceSha256 = hash(data);
  await fs.mkdir(directory);
  await write(path.join(directory, 'evidencias.json'), { ...data, evidenceSha256 });
  await write(keyPath, { evidenceSha256, key });
  await fs.writeFile(path.join(directory, 'CADERNO.md'), [
    '# Caderno de avaliação de alegações do E2P', rules,
    `São ${cases.length} alegações. Preencha uma cópia de \`respostas.json\`. Use seu código de avaliador e preencha cada rótulo e justificativa.`,
    ...cases.map(item => renderCase(item, original.traces[item.traceId])),
  ].join('\n\n') + '\n', { flag: 'wx' });
  await write(path.join(directory, 'respostas.json'), { reviewer: '', evidenceSha256,
    independentHumanReview: false, labels: cases.map(item => ({ id: item.id, label: '', justification: '' })) });
}

function validateSubmission(review, packet) {
  if (review.independentHumanReview !== true || typeof review.reviewer !== 'string' || !review.reviewer.trim()
      || review.evidenceSha256 !== packet.evidenceSha256 || !Array.isArray(review.labels)) {
    throw new Error('A response must declare independent human review, identify its reviewer and cite this packet hash.');
  }
  const pending = new Set(packet.cases.map(item => item.id));
  for (const item of review.labels) {
    if (!pending.delete(item.id) || !categories.includes(item.label) || typeof item.justification !== 'string' || !item.justification.trim()) {
      throw new Error(`Invalid, duplicate or incomplete response for ${item.id}.`);
    }
  }
  if (pending.size) throw new Error(`Missing responses: ${[...pending].join(', ')}`);
  return { ...review, reviewer: review.reviewer.trim() };
}

async function compare(packetFile, firstFile, secondFile, output) {
  const { evidenceSha256, ...data } = await read(packetFile);
  if (hash(data) !== evidenceSha256) throw new Error('Human review packet hash mismatch.');
  const packet = { ...data, evidenceSha256 };
  const reviews = await Promise.all([firstFile, secondFile].map(async file => validateSubmission(await read(file), packet)));
  if (reviews[0].reviewer.toLowerCase() === reviews[1].reviewer.toLowerCase()) throw new Error('Reviewers must be different people.');
  await write(output, { evidenceSha256, humanReviewDeclaredBySubmitters: true, ...compareReviewers(...reviews) });
}

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === 'prepare' && args.length === 3) return prepare(...args);
  if (operation === 'compare' && args.length === 4) return compare(...args);
  throw new Error('Usage: prepare agent-packet.json review-directory private-key.json | compare evidencias.json review-A.json review-B.json result.json');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
