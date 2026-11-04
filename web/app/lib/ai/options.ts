/**
 * What a call to the AI providers can change from the defaults, which suit the
 * short JSON answers most of the app asks for.
 */
export interface AiOptions {
  /** A long answer, such as a whole curriculum, needs more than the default 4096. */
  maxTokens?: number;
  /** Below the default 0.7 when copying from a document rather than writing. */
  temperature?: number;
  /** The Claude model for this call, in place of ANTHROPIC_MODEL. */
  claudeModel?: string;
  /** A PDF as base64, sent for the model to read itself. OpenRouter's free models can't. */
  pdf?: string;
  /** Stops waiting on the provider, for routes with a time limit to stay inside. */
  signal?: AbortSignal;
  /**
   * The prompt carries a student's record, so it goes to Claude on our paid key
   * and nowhere else. Gemini's free tier says not to send it personal data and
   * may have people read what it gets; OpenRouter's free models pass it on to
   * whichever provider is serving them. Check hasAiConsent before calling.
   */
  studentData?: boolean;
}
