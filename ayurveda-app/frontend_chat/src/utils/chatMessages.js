/** Internal delimiter used by bot-brain for multi-part replies (never shown to users). */
export const BUBBLE_DELIMITER = '---NEXT_BUBBLE---';

/** Split a bot reply into separate chat bubbles. */
export function splitBotBubbleText(text) {
  if (text == null || text === '') return [];
  const raw = String(text);
  if (!raw.includes(BUBBLE_DELIMITER)) {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  return raw
    .split(BUBBLE_DELIMITER)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Drop back-to-back identical bot bubbles (e.g. repeated emergency disclaimer). */
export function dedupeConsecutiveBotMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const msg of messages) {
    if (!msg) continue;
    const prev = out[out.length - 1];
    const text = String(msg.text ?? msg.content ?? '').trim();
    const prevText = prev ? String(prev.text ?? prev.content ?? '').trim() : '';
    if (
      prev
      && prev.role === msg.role
      && (msg.role === 'bot' || msg.role === 'assistant')
      && text
      && text === prevText
    ) {
      continue;
    }
    out.push(msg);
  }
  return out;
}

/** Expand stored messages so each bubble delimiter becomes its own bot message. */
export function expandBotMessages(messages) {
  if (!Array.isArray(messages)) return dedupeConsecutiveBotMessages([]);
  const expanded = [];
  for (const msg of messages) {
    if (!msg) continue;
    const role = msg.role;
    const text = msg.text ?? msg.content ?? '';
    if ((role === 'bot' || role === 'assistant') && String(text).includes(BUBBLE_DELIMITER)) {
      const parts = splitBotBubbleText(text);
      parts.forEach((part, i) => {
        expanded.push({
          ...msg,
          text: part,
          _id: msg._id && parts.length > 1 ? `${msg._id}-b${i}` : msg._id,
        });
      });
    } else {
      expanded.push({ ...msg, text: typeof text === 'string' ? text : String(text) });
    }
  }
  return dedupeConsecutiveBotMessages(expanded);
}

/** Build bot message objects for session state from API reply text. */
export function botMessagesFromReply(text) {
  const parts = splitBotBubbleText(text);
  if (!parts.length) return [{ role: 'bot', text: String(text || '').trim() }];
  return parts.map((part) => ({ role: 'bot', text: part }));
}
