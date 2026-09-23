export const MAX_MESSAGE_LENGTH = 40;
export const RECENT_MESSAGE_LIMIT = 5;
export const MAX_MOBS = 40;

const characters = text => Array.from(text);
const trimMessage = text => characters(text).slice(0, MAX_MESSAGE_LENGTH).join('');
const withoutName = template => template.replaceAll('{name}さん', '').replaceAll('{name}', '').replace(/^[、。！!\s]+/, '').trim();

export function chooseCelebrationMessage(messages, name, recentIds = [], random = Math.random) {
  const displayName = name.trim();
  const safe = messages.map((template, id) => ({id, template})).filter(({template}) => !/\d+歳/.test(template));
  const nameSafe = displayName ? safe : safe.filter(({template}) => !template.includes('{name}'));
  const eligible = nameSafe.filter(({id}) => !recentIds.includes(id));
  const options = eligible.length ? eligible : nameSafe;
  const selected = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  const text = displayName ? selected.template.replaceAll('{name}', displayName) : withoutName(selected.template);
  return {
    id: selected.id,
    text: trimMessage(text),
    recentIds: [...recentIds, selected.id].slice(-RECENT_MESSAGE_LIMIT)
  };
}

export function keepLatestMobs(mobs, additions) {
  return [...mobs, ...additions].slice(-MAX_MOBS);
}
