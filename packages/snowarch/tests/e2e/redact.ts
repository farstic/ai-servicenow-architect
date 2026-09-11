/**
 * The redactor the live suite writes every artefact through.
 *
 * A transcript is the whole point of these cases — "no password appeared" is a claim about bytes —
 * and a transcript is also the artefact most likely to be uploaded, pasted into an issue, or kept.
 * So the values go out as `***` and the ASSERTIONS run on the raw text in memory, never on the
 * redacted copy: redacting first and then searching would be a test that proves its own redaction
 * and nothing else.
 *
 * Both forms of the password are covered: the value, and the base64 of `user:pass` that basic auth
 * puts on the wire. A transcript that leaked the header rather than the prompt would otherwise pass
 * a search for the plain value.
 */
export interface Secrets {
  password?: string | undefined;
  clientSecret?: string | undefined;
  username?: string | undefined;
  url?: string | undefined;
}

/** Every form of a secret that could appear in a transcript, longest first. */
export function secretForms({ password, clientSecret, username, url }: Secrets): string[] {
  const forms: string[] = [];
  for (const value of [password, clientSecret]) {
    if (!value) continue;
    forms.push(value);
    if (username) forms.push(Buffer.from(`${username}:${value}`).toString('base64'));
    forms.push(Buffer.from(value).toString('base64'));
    forms.push(encodeURIComponent(value));
  }
  // The instance URL and the account are not secrets, but they are not product facts either: the
  // run record is committed, and whose PDI this was is nobody's business (the Q-A persona rule).
  if (url) forms.push(url, url.replace(/^https:\/\//, ''));
  if (username) forms.push(username);
  return [...new Set(forms.filter((f) => f.length >= 4))].sort((a, b) => b.length - a.length);
}

export function redact(text: string, secrets: Secrets): string {
  let out = text;
  for (const form of secretForms(secrets)) out = out.split(form).join('***');
  return out;
}

/**
 * Does this text contain any form of the secret? The assertion side, run on RAW text.
 *
 * Returns the form that was found rather than a boolean, so a failure names WHICH form leaked —
 * the plain value and the base64 header are different bugs with different fixes.
 */
export function findSecret(text: string, secrets: Secrets): string | null {
  for (const form of secretForms({
    password: secrets.password, clientSecret: secrets.clientSecret, username: secrets.username,
  })) {
    // The username alone is not a leak: the prompt echoes it and `list` prints it masked.
    if (form === secrets.username) continue;
    if (text.includes(form)) return form;
  }
  return null;
}
