/**
 * `waycine` command dispatch. `main(argv, io)` never throws: it prints errors
 * to standard error and returns the process exit code (0 ok, 1 failure,
 * 2 usage error, 130 interrupted). File system errors (EACCES, ENOSPC,
 * EEXIST, ...) print as one line; stack traces of unexpected errors only with
 * `WAYCINE_DEBUG=1`.
 */
import { readFileSync } from 'node:fs';
import { VERSION } from 'waycine/node';
import { CliError, EXIT_FAILURE, EXIT_USAGE } from './args.js';
import { INFO_HELP, infoCommand } from './commands/info.js';
import { INIT_HELP, initCommand } from './commands/init.js';
import { PARAMS_HELP, paramsCommand } from './commands/params.js';
import { RENDER_HELP, renderCommand } from './commands/render.js';
import { STILL_HELP, stillCommand } from './commands/still.js';
import { VALIDATE_HELP, validateCommand } from './commands/validate.js';
import type { Io } from './io.js';

export const USAGE = `Usage: waycine <command> [options]

Commands:
  render <project.json> -o <out.mp4>          Render a video (needs ffmpeg), clips or PNG frames
  still <project.json> --frame <n> -o <png>   Render one frame to PNG
  info <project.json>                         Show the output format and the timeline
  validate <project.json>                     Check a project file (exit 1 on errors)
  init [--preset <name>] [-o <file>]          Start a project from a bundled preset
  params [--search <text>]                    List every project setting

Options:
  -v, --version   Print the version
  -h, --help      Print this help ("waycine <command> --help" for a command)
`;

type Command = (io: Io, args: readonly string[]) => Promise<number>;

/** A Node system error (`fs`, `child_process`) with its code, such as `EACCES`. */
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string';
}

const COMMANDS: Record<string, { run: Command; help: string }> = {
  render: { run: renderCommand, help: RENDER_HELP },
  still: { run: stillCommand, help: STILL_HELP },
  info: { run: infoCommand, help: INFO_HELP },
  validate: { run: validateCommand, help: VALIDATE_HELP },
  init: { run: initCommand, help: INIT_HELP },
  params: { run: paramsCommand, help: PARAMS_HELP },
};

/** Version of this CLI package. */
export function cliVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version?: string;
  };
  return pkg.version ?? '0.0.0';
}

/** Runs `waycine` with `argv` (without the node and script paths). */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  const [first, ...rest] = argv;
  if (first === '--version' || first === '-v') {
    io.stdout(`waycine ${cliVersion()} (engine ${VERSION})\n`);
    return 0;
  }
  if (first === undefined || first === '--help' || first === '-h') {
    io.stdout(USAGE);
    return 0;
  }
  if (first === 'help') {
    const topic = rest[0] === undefined ? undefined : COMMANDS[rest[0]];
    io.stdout(topic?.help ?? USAGE);
    return 0;
  }
  const command = Object.hasOwn(COMMANDS, first) ? COMMANDS[first] : undefined;
  if (command === undefined) {
    io.stderr(`waycine: unknown command "${first}"\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  try {
    return await command.run(io, rest);
  } catch (error) {
    if (error instanceof CliError) {
      const hint = error.exitCode === EXIT_USAGE ? ` (see "waycine ${first} --help")` : '';
      io.stderr(`waycine ${first}: ${error.message}${hint}\n`);
      return error.exitCode;
    }
    const debug = io.env.WAYCINE_DEBUG === '1';
    if (isErrnoException(error)) {
      io.stderr(`waycine ${first}: ${error.code}: ${error.path ?? error.message}\n`);
      if (debug && error.stack !== undefined) io.stderr(`${error.stack}\n`);
      return EXIT_FAILURE;
    }
    const detail =
      error instanceof Error
        ? debug
          ? (error.stack ?? error.message)
          : error.message
        : String(error);
    const hint = debug ? '' : ' (set WAYCINE_DEBUG=1 for the stack trace)';
    io.stderr(`waycine ${first}: unexpected error: ${detail}${hint}\n`);
    return EXIT_FAILURE;
  }
}
