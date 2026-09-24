import { runCli } from './cli';

runCli(process.argv.slice(2), {
  env: process.env,
  cwd: process.cwd(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
}).then((code) => {
  process.exitCode = code;
});
