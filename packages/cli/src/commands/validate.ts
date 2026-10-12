import { compile, createNodeBackend, outputSize } from 'waycine/node';
import { boolFlag, EXIT_FAILURE, parseCommand, projectArg } from '../args.js';
import type { Io } from '../io.js';
import { formatIssue, loadProjectFile } from '../project.js';

export const VALIDATE_HELP = `Usage: waycine validate <project.json>

Checks a project file: prints every issue (errors and warnings) and exits with
code 1 when there is an error, 0 otherwise. A project without errors is also
compiled once, so a file that validates also renders; texts that still run past
the frame edge at their smallest size are listed as layout warnings.
`;

/** `waycine validate`. */
export async function validateCommand(io: Io, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(args, {});
  if (boolFlag(values, 'help')) {
    io.stdout(VALIDATE_HELP);
    return 0;
  }
  const file = projectArg('validate', positionals);
  const { project, issues } = loadProjectFile(io, file);
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.length - errors.length;
  for (const issue of issues) io.stdout(`${formatIssue(issue)}\n`);

  if (errors.length === 0) {
    try {
      const size = outputSize(project.output);
      const c = compile(project, createNodeBackend(), { width: size.width, height: size.height });
      // Layout warnings: texts that still overflow the frame at their smallest size.
      for (const w of c.warnings) {
        io.stdout(`${'warning'.padEnd(7)} ${w.path}  [${w.code}] ${w.message}\n`);
      }
      io.stdout(
        `${file}: OK, ${warnings + c.warnings.length} warning(s). ${c.stops.length} stops, ${c.timeline.totalFrames} frames at ` +
          `${c.width}x${c.height}, ${project.output.fps} fps.\n`,
      );
      return 0;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      io.stdout(`error   (compile)  ${detail}\n`);
      io.stdout(`${file}: 1 error(s), ${warnings} warning(s).\n`);
      return EXIT_FAILURE;
    }
  }
  io.stdout(`${file}: ${errors.length} error(s), ${warnings} warning(s).\n`);
  return EXIT_FAILURE;
}
