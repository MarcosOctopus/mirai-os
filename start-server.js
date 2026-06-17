const { spawn } = require('child_process');
const key = require('fs').readFileSync('/tmp/mirai_key.txt', 'utf8').trim();
process.env.MIRAI_LLM_API_KEY = key;
const child = spawn('node', ['node_modules/.bin/next', 'start', '-p', '3333'], {
  cwd: '/opt/data/mirai-app',
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stdout.on('data', d => process.stdout.write(d));
child.stderr.on('data', d => process.stderr.write(d));
child.on('exit', code => { console.log('EXIT:', code); process.exit(code); });
