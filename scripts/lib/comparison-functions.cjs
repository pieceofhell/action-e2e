// Evaluation-only oracles. The explorer never receives these snapshots or rules.
const text = (selector, value) => ({ kind: 'text', selector, value });
const count = (selector, value) => ({ kind: 'count', selector, value });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const present = (items, value) => items.some(item => same(item, value));
const tracks = ['hey', 'summer', 'ukulele'];

const reference = {
  'form-validator': ['validate-username-on-submit'],
  'music-player': ['previous-track', 'next-track'],
  'expense-tracker': ['create-with-balance', 'restore-transaction'],
  'memory-cards': ['create-card', 'restore-card'],
};

async function readDomain(page, target) {
  return page.evaluate(target => {
    const node = selector => document.querySelector(selector);
    const value = selector => node(selector)?.value ?? '';
    const content = selector => node(selector)?.textContent.trim() ?? '';
    if (target === 'form-validator') return {
      username: value('#username'), success: Boolean(node('.form-control.success #username')),
      emailError: Boolean(node('.form-control.error #email')),
    };
    if (target === 'music-player') return { track: content('#title'), audio: node('#audio')?.getAttribute('src') };
    if (target === 'expense-tracker') return {
      description: value('#text'), amount: value('#amount'), balance: content('#balance'),
      items: [...document.querySelectorAll('#list > li')].map(row => ({
        description: [...row.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join('').trim(),
        amount: row.querySelector('span')?.textContent.trim(), text: row.textContent.replace(/\s+/g, ' ').trim(),
      })),
    };
    if (target === 'memory-cards') return {
      question: value('#question'), answer: value('#answer'),
      items: [...document.querySelectorAll('#cards-container > .card')].map(card => ({
        question: card.querySelector('.inner-card-front')?.textContent.trim(),
        answer: card.querySelector('.inner-card-back')?.textContent.trim(),
      })),
    };
    throw new Error(`Unrecognized target: ${target}`);
  }, target);
}

function recordEffect(id, step, checks, entity, prerequisite = null) {
  return { id, step: step.step, beforeStateId: step.beforeStateId, afterStateId: step.afterStateId, checks, entity, prerequisite };
}

function rowChecks(target, after, index) {
  if (target === 'expense-tracker') return [count('#list > li', after.items.length), text(`#list > li:nth-child(${index + 1})`, after.items[index].text), text('#balance', after.balance)];
  const card = `#cards-container > .card:nth-child(${index + 1})`;
  return [count('#cards-container > .card', after.items.length), text(`${card} .inner-card-front`, after.items[index].question), text(`${card} .inner-card-back`, after.items[index].answer)];
}

function collectionEffect(target, step, before, after, hits) {
  const expense = target === 'expense-tracker';
  const create = expense ? 'create-with-balance' : 'create-card';
  const { action } = step;
  if (action.kind === 'reload' && before.items.length && same(before.items, after.items)) {
    const prior = hits.find(hit => hit.id === create && present(after.items, hit.entity));
    if (!prior || (expense && before.balance !== after.balance)) return null;
    return recordEffect(expense ? 'restore-transaction' : 'restore-card', step,
      rowChecks(target, after, after.items.findIndex(item => same(item, prior.entity))), prior.entity, prior);
  }
  const isCreateAction = expense ? (action.kind === 'click' && /add transaction/i.test(action.name))
    || (action.kind === 'press' && ['text', 'amount'].includes(action.domId))
    : action.kind === 'click' && action.domId === 'add-card';
  if (!isCreateAction || after.items.length !== before.items.length + 1 || !same(before.items, after.items.slice(0, -1))) return null;
  const entity = after.items.at(-1);
  if (expense) {
    if (!before.description.trim() || !before.amount.trim()) return null;
    const amount = Number(before.amount);
    const expectedBalance = before.items.reduce((sum, item) => sum + Number(item.amount), amount);
    if (entity.description !== before.description.trim() || Number(entity.amount) !== amount || after.balance !== `$${expectedBalance.toFixed(2)}`) return null;
  } else if (!before.question.trim() || !before.answer.trim()
    || entity.question !== before.question.trim() || entity.answer !== before.answer.trim()) return null;
  return recordEffect(create, step, rowChecks(target, after, after.items.length - 1), entity);
}

function judgeEffects(target, steps, observations) {
  const hits = [];
  let before = observations[0];
  for (const step of steps) {
    const after = observations[step.step];
    if (!after) continue;
    let effect = null;
    if (step.status === 'completed') {
      const action = step.action;
      if (target === 'form-validator' && action.kind === 'press' && action.domId === 'username'
        && !before.success && before.username === after.username && after.success && after.emailError) {
        effect = recordEffect('validate-username-on-submit', step, [count('.form-control.success #username', 1), count('.form-control.error #email', 1)], after.username);
      } else if (target === 'music-player' && action.kind === 'click' && ['prev', 'next'].includes(action.domId) && tracks.includes(before.track)) {
        const offset = action.domId === 'prev' ? -1 : 1;
        const expected = tracks[(tracks.indexOf(before.track) + offset + tracks.length) % tracks.length];
        if (after.track === expected && after.audio === `music/${expected}.mp3`) {
          effect = recordEffect(offset < 0 ? 'previous-track' : 'next-track', step,
            [text('#title', expected), count(`#audio[src="music/${expected}.mp3"]`, 1)], expected);
        }
      } else if (['expense-tracker', 'memory-cards'].includes(target)) {
        effect = collectionEffect(target, step, before, after, hits);
      }
    }
    if (effect) hits.push(effect);
    before = after;
  }
  return [...new Map(hits.slice().reverse().map(hit => [hit.id, hit])).values()].sort((a, b) => a.step - b.step);
}

module.exports = { reference, readDomain, judgeEffects };
