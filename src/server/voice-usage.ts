/** Realtime receipts are token counts, not session duration or a provider invoice. */
export function realtimeUsage(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result: Record<string, number> = {};
  const value = raw as Record<string, unknown>;
  const put = (name: string, number: unknown) => {
    if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1e12) result[name] = number;
  };
  for (const name of ['total_tokens', 'input_tokens', 'output_tokens']) put(name, value[name]);
  for (const direction of ['input', 'output']) {
    const detail = value[`${direction}_token_details`];
    if (!detail || typeof detail !== 'object') continue;
    const record = detail as Record<string, unknown>;
    for (const modality of ['text', 'audio', 'image', 'cached']) put(`${direction}_${modality}_tokens`, record[`${modality}_tokens`]);
  }
  // Actual transcription duration describes input audio, never total call duration.
  if (value.type === 'duration') put('transcription_audio_seconds', value.seconds);
  return Object.keys(result).length ? result : null;
}
