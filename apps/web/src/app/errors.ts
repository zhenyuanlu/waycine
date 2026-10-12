/** Text for a "Technical details" box: the stack when it includes the message, else name and message. */
export function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.stack?.includes(error.message) ? error.stack : `${error.name}: ${error.message}`;
  }
  return String(error);
}
