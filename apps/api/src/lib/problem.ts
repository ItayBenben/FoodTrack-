/** RFC 9457 problem+json. Every error says what happened, what was kept, what to do (CLAUDE.md rule 7). */
export class HttpProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly type: string,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: { path: string; code: string; message?: string }[],
    public readonly extra?: Record<string, unknown>,
  ) { super(detail ?? title); }
  toJSON() {
    return { type: `https://foodtrack/errors/${this.type}`, title: this.title, status: this.status, detail: this.detail, errors: this.errors, ...this.extra };
  }
}
export const notFound = (what: string) => new HttpProblem(404, 'not_found', `${what} not found`, `No ${what} with that id exists for this account.`);
export const conflict = (type: string, title: string, detail?: string, extra?: Record<string, unknown>) => new HttpProblem(409, type, title, detail, undefined, extra);
export const validation = (title: string, errors: { path: string; code: string; message?: string }[]) =>
  new HttpProblem(422, 'validation', title, errors.map((e) => e.message ?? `${e.path}: ${e.code}`).join('; '), errors);
