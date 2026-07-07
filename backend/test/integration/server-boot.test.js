const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_ENTRY = path.resolve(__dirname, '../../src/server.js');
const BACKEND_DIR = path.resolve(__dirname, '../..');
const STARTUP_TIMEOUT_MS = 15000;
const SHUTDOWN_TIMEOUT_MS = 15000;

function waitForOutput(stream, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      stream.off('data', onData);
      reject(new Error(`Timed out waiting for ${pattern}. Output so far:\n${buffer}`));
    }, timeoutMs);

    function onData(chunk) {
      buffer += chunk.toString();
      if (pattern.test(buffer)) {
        clearTimeout(timer);
        stream.off('data', onData);
        resolve(buffer);
      }
    }

    stream.on('data', onData);
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not exit in time')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test('server starts, connects to the Oracle pool, and listens', async () => {
  const child = spawn('node', [SERVER_ENTRY], { cwd: BACKEND_DIR });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const output = await waitForOutput(child.stdout, /Server listening on port \d+/, STARTUP_TIMEOUT_MS);
    assert.match(output, /Server listening on port \d+/);
  } catch (err) {
    throw new Error(`${err.message}\nstderr:\n${stderr}`);
  } finally {
    child.kill('SIGINT');
    await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
  }
});

test('server shuts down gracefully on SIGINT, closes the pool, and exits 0', async () => {
  const child = spawn('node', [SERVER_ENTRY], { cwd: BACKEND_DIR });
  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  await waitForOutput(child.stdout, /Server listening on port \d+/, STARTUP_TIMEOUT_MS);

  child.kill('SIGINT');
  const exitCode = await waitForExit(child, SHUTDOWN_TIMEOUT_MS);

  assert.equal(exitCode, 0);
  assert.match(stdout, /SIGINT received, shutting down gracefully/);
});

test('server exits non-zero when required env vars are missing', async () => {
  const child = spawn('node', [SERVER_ENTRY], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DB_USER: '' },
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await waitForExit(child, STARTUP_TIMEOUT_MS);
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /Missing required environment variable: DB_USER/);
});
