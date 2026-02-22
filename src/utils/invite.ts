export function normalizeBotUsername(botUsername: string): string {
  const trimmed = botUsername.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

export function buildInviteLink(botUsername: string, inviteToken: string): string {
  const username = normalizeBotUsername(botUsername);
  return `https://t.me/${username}?start=invite_${inviteToken}`;
}

export function parseInviteStartPayload(match: string): string | null {
  const trimmed = match.trim();
  if (!trimmed.startsWith("invite_")) {
    return null;
  }

  const token = trimmed.slice("invite_".length);
  return token.length > 0 ? token : null;
}
