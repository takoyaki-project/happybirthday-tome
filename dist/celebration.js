export const MAX_MESSAGE_LENGTH = 40;
export const RECENT_MESSAGE_LIMIT = 5;
export const MAX_MOBS = 40;

const characters = text => Array.from(text);
const trimMessage = text => characters(text).slice(0, MAX_MESSAGE_LENGTH).join('');

export function chooseCelebrationMessage(messages, readAloudPrefix, name, recentIds = [], random = Math.random) {
  const displayName = name.trim() || 'あなた';
  const safe = messages.map((template, id) => ({id, template})).filter(({template}) => !/\d+歳/.test(template));
  const eligible = safe.filter(({id}) => !recentIds.includes(id));
  const options = eligible.length ? eligible : safe;
  const selected = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  const prefix = readAloudPrefix.replace('{name}', displayName);
  const text = selected.template.includes('{name}')
    ? selected.template.replaceAll('{name}', displayName)
    : selected.template;
  return {
    id: selected.id,
    text: trimMessage(text),
    speechText: trimMessage(selected.template.includes('{name}') ? text : `${prefix}${text}`),
    recentIds: [...recentIds, selected.id].slice(-RECENT_MESSAGE_LIMIT)
  };
}

export function keepLatestMobs(mobs, additions) {
  return [...mobs, ...additions].slice(-MAX_MOBS);
}
