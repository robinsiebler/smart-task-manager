const { ensurePool } = require('./db');
const authService = require('../../backend/src/services/auth.service');

// This app's password reset is deliberately dev-only: the real server prints the
// reset token to its own console instead of emailing it (see project decisions).
// Our e2e server runs as a separate OS process, so we can't capture *its* stdout
// here. Instead we call the same service function directly, in this test process,
// and capture the token the same way a human would read it off a console --
// this exercises the real token-generation/hashing code, just not over HTTP.
async function requestResetToken(email) {
  await ensurePool();

  let capturedToken = null;
  const originalLog = console.log;
  console.log = (...args) => {
    const line = args.join(' ');
    const match = line.match(/Token for .*?: (\S+) \(expires/);
    if (match) capturedToken = match[1];
  };

  try {
    await authService.forgotPassword(email);
  } finally {
    console.log = originalLog;
  }

  return capturedToken;
}

module.exports = { requestResetToken };
