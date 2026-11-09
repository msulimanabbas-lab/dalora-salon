import 'server-only';

/**
 * SMS sending. Wire a Saudi provider here (e.g. Unifonic, Taqnyat or Msegat): each needs a
 * registered sender name from the provider before messages reach Saudi numbers.
 * SMS_PROVIDER selects the implementation; until one is configured, login codes are shown on screen.
 */
export async function sendSms(phone: string, text: string): Promise<void> {
  const provider = process.env.SMS_PROVIDER;
  if (!provider) return;
  // Example shape for an HTTP provider. Replace with the provider's documented API.
  const url = process.env.SMS_API_URL, key = process.env.SMS_API_KEY, sender = process.env.SMS_SENDER;
  if (!url || !key || !sender) throw new Error('SMS provider is not fully configured (SMS_API_URL, SMS_API_KEY, SMS_SENDER).');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ to: phone, sender, body: text }),
  });
  if (!res.ok) throw new Error(`SMS failed: ${res.status}`);
}
