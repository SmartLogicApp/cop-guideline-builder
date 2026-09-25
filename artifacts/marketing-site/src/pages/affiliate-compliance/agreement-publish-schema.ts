import { z } from 'zod';

// Match the immutable publish endpoint. Explicit review must originate from
// the user's checked box; neither an initial value nor a submit default is true.
export const agreementPublishSchema = z.object({
  version: z.string().trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'Use 1–64 letters, digits, periods, underscores or hyphens.')
    .refine((version) => !/^SAMPLE(?:-|$)/i.test(version), 'SAMPLE versions cannot be published.'),
  body: z.string().trim().min(100, 'Paste the full agreement (at least 100 characters).').max(150_000),
  confirmedReviewed: z.boolean().refine((checked) => checked === true, 'You must personally confirm review.'),
});

export type AgreementPublishFields = z.infer<typeof agreementPublishSchema>;