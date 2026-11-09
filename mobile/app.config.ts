import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json is the app's configuration. This only adds what the student web
 * app needs when scripts/publish-web.mjs builds it (ICARE_STUDENT_WEB=1): a
 * single-page build served under /student on the web portal. Any other run
 * gets app.json exactly as it is, so native builds and the update runtime
 * (the fingerprint) never see a difference.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.ICARE_STUDENT_WEB !== '1') return config as ExpoConfig;
  return {
    ...config,
    web: { ...config.web, output: 'single' },
    experiments: { ...config.experiments, baseUrl: '/student' },
  } as ExpoConfig;
};
