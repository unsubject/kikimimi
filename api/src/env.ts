export interface Env {
  ASSETS: Fetcher;
  AUDIO: R2Bucket;
  HYPERDRIVE: Hyperdrive;

  GENERATION_MODEL: string;
  GRADING_MODEL: string;
  APP_ORIGIN: string;

  APP_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
