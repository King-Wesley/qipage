'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { manage, startupScript } = require('../autostart.cjs');

const windowsOnly = { skip: process.platform !== 'win32' };
const launchSource = fs.readFileSync(path.join(__dirname, '..', 'launch.cjs'), 'utf8');
const health = { app: 'qipage-local', version: '0.2.0' };
const psQuote = value => "'" + String(value).replace(/'/g, "''") + "'";

function fixture(t) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qipage-startup-test-'));
  t.after(() => {
    const resolved = path.resolve(temporaryRoot);
    const temporaryParent = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(resolved.startsWith(temporaryParent));
    assert.ok(path.basename(resolved).startsWith('qipage-startup-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const root = path.join(temporaryRoot, "中文 单引号 ' & 空格");
  const startupDirectory = path.join(root, 'isolated-startup');
  fs.mkdirSync(startupDirectory, { recursive: true });
  fs.writeFileSync(path.join(root, 'launch.cjs'),
    "'use strict';\nif (!process.argv.includes('--background')) process.exit(3);\nconsole.log('fixture-background-ready');\n");
  return { root, nodePath: process.execPath, startupDirectory };
}

async function runLauncher({ background = true, responses = [health], chromeExists = false } = {}) {
  const spawned = [];
  const messages = [];
  const errors = [];
  const programFiles = path.join(os.tmpdir(), 'Program Files');
  const chrome = path.join(programFiles, 'Google/Chrome/Application/chrome.exe');
  let requests = 0;
  const fakeHttp = {
    get(url, callback) {
      assert.equal(url, 'http://127.0.0.1:4173/_qipage/health');
      const request = new EventEmitter();
      request.setTimeout = () => request;
      request.destroy = () => {};
      const response = responses[Math.min(requests++, responses.length - 1)];
      queueMicrotask(() => {
        if (!response) {
          request.emit('error', new Error('Simulated offline service'));
          return;
        }
        const stream = new EventEmitter();
        callback(stream);
        stream.emit('data', JSON.stringify(response));
        stream.emit('end');
      });
      return request;
    }
  };
  const fakeProcess = {
    argv: ['node', 'launch.cjs'].concat(background ? ['--background'] : []),
    execPath: process.execPath,
    platform: 'win32',
    env: { PROGRAMFILES: programFiles }
  };
  const context = {
    __dirname: path.join(os.tmpdir(), 'qipage-vm-fixture'),
    process: fakeProcess,
    console: { log: value => messages.push(value), error: value => errors.push(value) },
    require(name) {
      if (name === 'node:http') return fakeHttp;
      if (name === 'node:fs') return { existsSync: file => chromeExists && file === chrome };
      if (name === 'node:child_process') return {
        spawn(file, args, options) {
          const child = new EventEmitter();
          child.unref = () => {};
          spawned.push({ file, args: Array.from(args), options });
          return child;
        }
      };
      if (name === 'node:path') return path;
      throw new Error('Unexpected dependency: ' + name);
    },
    setTimeout,
    clearTimeout
  };
  await vm.runInNewContext(launchSource, context);
  return { spawned, messages, errors, process: fakeProcess, chrome };
}

test('startup script validates actions and retains security policy', () => {
  assert.throws(() => startupScript('unknown'), /install/);
  const script = startupScript('install', {
    root: path.join(os.tmpdir(), "中文 ' & 路径"),
    nodePath: process.execPath,
    startupDirectory: path.join(os.tmpdir(), 'isolated-startup')
  });
  assert.ok(script.includes("中文 '' & 路径"));
  assert.ok(script.includes('--background'));
  assert.ok(script.includes('WindowStyle Hidden'));
  assert.ok(!/ExecutionPolicy|RunAs|Set-ItemProperty/.test(script));
});

test('Windows shortcut supports install, repeat install, status, remove and complex paths', windowsOnly, t => {
  const options = fixture(t);
  assert.equal(manage('status', options).enabled, false);
  const installed = manage('install', options);
  const shortcutPath = path.join(options.startupDirectory, 'Qipage.lnk');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe');
  assert.equal(installed.enabled, true);
  assert.equal(installed.shortcut, shortcutPath);
  assert.equal(installed.workingDirectory, options.root);
  assert.equal(installed.target.toLowerCase(), powershell.toLowerCase());
  assert.ok(installed.arguments.includes("中文 单引号 '' & 空格"));
  assert.ok(installed.arguments.includes('--background'));
  assert.ok(installed.arguments.includes('-NoProfile -NonInteractive -WindowStyle Hidden'));
  assert.equal(manage('install', options).enabled, true);
  assert.equal(manage('status', options).enabled, true);

  // Execute only the harmless fixture launcher; no real service or browser is started.
  const commandStart = installed.arguments.indexOf('-Command "') + '-Command "'.length;
  assert.ok(commandStart >= '-Command "'.length);
  assert.ok(installed.arguments.endsWith('"'));
  const command = installed.arguments.slice(commandStart, -1);
  const invoked = spawnSync(installed.target, ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(invoked.status, 0, invoked.stderr);
  assert.equal(invoked.stdout.trim(), 'fixture-background-ready');

  assert.equal(manage('remove', options).enabled, false);
  assert.equal(fs.existsSync(shortcutPath), false);
  assert.equal(manage('remove', options).enabled, false);
  assert.equal(manage('status', options).enabled, false);
});

test('Windows startup refuses to overwrite or remove an unrelated shortcut', windowsOnly, t => {
  const options = fixture(t);
  const shortcutPath = path.join(options.startupDirectory, 'Qipage.lnk');
  const script = [
    "$ErrorActionPreference='Stop'",
    '$shell=New-Object -ComObject WScript.Shell',
    '$shortcut=$shell.CreateShortcut(' + psQuote(shortcutPath) + ')',
    '$shortcut.TargetPath=' + psQuote(process.execPath),
    "$shortcut.Description='unrelated-startup-shortcut'",
    '$shortcut.Save()'
  ].join(';');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe');
  const created = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(created.status, 0, created.stderr);
  const original = fs.readFileSync(shortcutPath);
  for (const action of ['install', 'remove', 'status']) {
    assert.throws(() => manage(action, options));
    assert.deepEqual(fs.readFileSync(shortcutPath), original);
  }
});

test('background launcher reuses the running service without opening a browser', async () => {
  const result = await runLauncher();
  assert.deepEqual(result.spawned, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.messages, ['Qipage is ready: http://127.0.0.1:4173/']);
  assert.equal(result.process.exitCode, undefined);
});

test('background launcher starts one service when needed and keeps Chrome closed', async () => {
  const result = await runLauncher({ responses: [null, null, health] });
  assert.equal(result.spawned.length, 1);
  assert.equal(result.spawned[0].file, process.execPath);
  assert.deepEqual(result.spawned[0].args,
    [path.join(os.tmpdir(), 'qipage-vm-fixture', 'server.cjs')]);
  assert.equal(result.spawned[0].options.windowsHide, true);
  assert.deepEqual(result.errors, []);
});

test('manual launcher opens Chrome while reusing the existing service', async () => {
  const result = await runLauncher({ background: false, chromeExists: true });
  assert.equal(result.spawned.length, 1);
  assert.equal(result.spawned[0].file, result.chrome);
  assert.deepEqual(result.spawned[0].args, ['http://127.0.0.1:4173/']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.process.exitCode, undefined);
});
test('manual Windows launcher opens the default browser when Chrome is absent', async () => {
  const result = await runLauncher({ background: false, chromeExists: false });
  assert.equal(result.spawned.length, 1);
  assert.equal(result.spawned[0].file, 'explorer.exe');
  assert.deepEqual(result.spawned[0].args, ['http://127.0.0.1:4173/']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.process.exitCode, undefined);
});