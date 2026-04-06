const version = process.env.MACHELPER_LOCAL_VERSION ?? '2.3.19';
const packageUrl = process.env.MACHELPER_LOCAL_PACKAGE_URL ?? 'tensor-code';
const buildTime = process.env.MACHELPER_LOCAL_BUILD_TIME ?? new Date().toISOString();

process.env.MACHELPER_LOCAL_SKIP_REMOTE_PREFETCH ??= '1';

Object.assign(globalThis, {
  MACRO: {
    VERSION: version,
    PACKAGE_URL: packageUrl,
    NATIVE_PACKAGE_URL: packageUrl,
    BUILD_TIME: buildTime,
    FEEDBACK_CHANNEL: 'local',
    VERSION_CHANGELOG: '',
    ISSUES_EXPLAINER: '',
  },
});
