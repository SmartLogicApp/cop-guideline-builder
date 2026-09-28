import {
  mailFailureCategory, mailFailureExplanation, safeMailMessageId,
  type SendResult,
} from "./resend-mailer.js";

/** Only these allowlisted values may be persisted or shown to an admin. */
export function invitationDeliveryOutcome(result: SendResult, at: Date) {
  if (!result.sent) {
    const category = mailFailureCategory(result);
    return {
      sent: false as const,
      category,
      update: {
        revokedAt: at,
        deliveryStatus: "failed",
        deliveryFailureCategory: category,
        deliveryTransport: result.transport,
        deliveryHttpStatus: result.status ?? null,
      },
      response: { error: mailFailureExplanation[category], category, sent: false as const },
    };
  }
  return {
    sent: true as const,
    update: {
      sentAt: at,
      deliveryStatus: "accepted",
      providerMessageId: safeMailMessageId(result.id),
      deliveryTransport: result.transport,
    },
  };
}