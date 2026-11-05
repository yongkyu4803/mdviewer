const platform = process.argv[2];
const keys = platform === 'macos'
  ? ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']
  : platform === 'windows'
    ? ['WINDOWS_CERTIFICATE', 'WINDOWS_CERTIFICATE_PASSWORD', 'WINDOWS_TIMESTAMP_URL']
    : undefined;
if (!keys) throw new Error('Expected macos or windows.');
const missing = keys.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Signed release blocked. Configure: ${missing.join(', ')}`);
if (platform === 'macos' && !process.env.APPLE_SIGNING_IDENTITY.startsWith('Developer ID Application:')) {
  throw new Error('Distribution requires a Developer ID Application identity.');
}
if (platform === 'windows' && !/^https?:\/\//.test(process.env.WINDOWS_TIMESTAMP_URL)) {
  throw new Error('A certificate-provider timestamp URL is required.');
}
console.log('Required signing configuration is present; credentials were not printed.');
