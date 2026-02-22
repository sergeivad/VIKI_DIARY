export const InviteErrorCode = {
  inviteTokenInvalid: "INVITE_TOKEN_INVALID",
  userAlreadyInDiary: "USER_ALREADY_IN_DIARY",
  babyMembershipNotFound: "BABY_MEMBERSHIP_NOT_FOUND",
  ownerRequired: "OWNER_REQUIRED",
  inviteTokenGenerationFailed: "INVITE_TOKEN_GENERATION_FAILED"
} as const;

export type InviteErrorCodeValue = (typeof InviteErrorCode)[keyof typeof InviteErrorCode];

export class InviteDomainError extends Error {
  constructor(
    public readonly code: InviteErrorCodeValue,
    message: string
  ) {
    super(message);
    this.name = "InviteDomainError";
  }
}

export function isInviteDomainError(error: unknown): error is InviteDomainError {
  return error instanceof InviteDomainError;
}
