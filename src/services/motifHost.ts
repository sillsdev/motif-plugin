/**
 * Runs the Motif engine's parser (`pangloss serve`, the PanGloss binary Motif ships beside its CLI)
 * as background processes and times every word. Free of Platform.Bible imports so it can be tested
 * with a fake launcher.
 */

/** The parts of a started process this module uses; `createProcess.spawn` results satisfy it. */
export interface EngineProcess {
  stdin: { write(text: string): unknown; end(): unknown };
  stdout: { on(event: 'data', listener: (chunk: unknown) => void): unknown };
  stderr: { on(event: 'data', listener: (chunk: unknown) => void): unknown };
  on(event: 'error' | 'exit', listener: (detail: unknown) => void): unknown;
  kill(): boolean;
}

/** Starts `command` with `args`; main.ts wraps the platform's `createProcess.spawn` in this. */
export type Launcher = (command: string, args: readonly string[]) => EngineProcess;

export type WordColour = 'green' | 'yellow' | 'red' | 'skipped';

export interface WordRow {
  word: string;
  /** PanGloss's status: ok, CAP, TIMEOUT, SKIPPED, or ERROR when the process failed. */
  status: string;
  /** Wall time from sending the word to receiving its answer, in ms. */
  wallMs: number;
  /** The parser's own time for the word, in ms, when the engine reported it. */
  parseMs?: number;
  workSteps?: number;
  colour: WordColour;
}

export interface ChapterRun {
  rows: WordRow[];
  /** From the first spawn until the last process said ready, in ms. */
  coldStartMs: number;
  /** From the first spawn until the last answer, in ms. */
  wallTotalMs: number;
  processes: number;
  counts: Record<WordColour, number>;
}

export const GREEN_BELOW_MS = 500;
export const RED_ABOVE_MS = 5000;

/** Green under 500 ms, yellow up to 5 s, red beyond that or when the engine gave up or failed. */
export function classify(status: string, wallMs: number): WordColour {
  if (status === 'SKIPPED') return 'skipped';
  if (status === 'TIMEOUT' || status === 'CAP' || status === 'ERROR') return 'red';
  if (wallMs > RED_ABOVE_MS) return 'red';
  if (wallMs >= GREEN_BELOW_MS) return 'yellow';
  return 'green';
}

/** The unique lower-case words of a USFM chapter, in first-seen order, without notes or markers. */
export function extractWords(usfm: string): string[] {
  const text = usfm
    .replace(/\\(f|fe|x|ef|ex)\s[\s\S]*?\\\1\*/g, ' ')
    .replace(/^\\(id|h|toc\d|ide|rem|c|cl|cp|ca)\b.*$/gm, ' ')
    .replace(/\\(v|vp)\s+\S+/g, ' ')
    .replace(/\|[^\\]*/g, ' ')
    .replace(/\\\+?[a-z]+\d*\*?/gi, ' ');
  const seen = new Set<string>();
  const words: string[] = [];
  text.split(/[^\p{L}\p{M}'’-]+/u).forEach((raw) => {
    const word = raw.replace(/^['’-]+|['’-]+$/g, '').toLowerCase();
    if (word && !seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  });
  return words;
}

interface Pending {
  word: string;
  sentAt: number;
  resolve: (row: WordRow) => void;
}

/** One `pangloss serve` process; answers one word at a time. */
export class ServeClient {
  private readonly process: EngineProcess;

  private pending: Pending | undefined;

  private buffer = '';

  private dead: string | undefined;

  private readyListener: (() => void) | undefined;

  readonly ready: Promise<number>;

  private nextId = 1;

  constructor(launch: Launcher, command: string, grammarPath: string, wordTimeoutMs: number) {
    this.process = launch(command, [
      'serve',
      '--project',
      grammarPath,
      '--word-timeout-ms',
      String(wordTimeoutMs),
      '--timing',
    ]);
    const startedAt = Date.now();
    this.ready = new Promise<number>((resolve, reject) => {
      this.readyListener = () => resolve(Date.now() - startedAt);
      this.process.on('error', (e) => {
        this.fail(`could not start: ${String(e)}`);
        reject(new Error(`engine could not start: ${String(e)}`));
      });
      this.process.on('exit', (code) => {
        this.fail(`exited with code ${String(code)}`);
        reject(new Error(`engine exited with code ${String(code)} before it was ready`));
      });
    });
    this.ready.catch(() => undefined);
    this.process.stdout.on('data', (chunk) => this.onData(String(chunk)));
    this.process.stderr.on('data', () => undefined);
  }

  private fail(reason: string) {
    this.dead = reason;
    const waiting = this.pending;
    this.pending = undefined;
    if (waiting)
      waiting.resolve({
        word: waiting.word,
        status: 'ERROR',
        wallMs: Date.now() - waiting.sentAt,
        colour: 'red',
      });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onLine(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private onLine(line: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message.type === 'ready') {
      this.readyListener?.();
      return;
    }
    if (message.type === 'fatal') {
      this.fail(`fatal: ${String(message.message)}`);
      return;
    }
    const waiting = this.pending;
    if (!waiting || (message.type !== 'result' && message.type !== 'error')) return;
    this.pending = undefined;
    const wallMs = Date.now() - waiting.sentAt;
    const status = message.type === 'error' ? 'ERROR' : String(message.status ?? 'ERROR');
    const timing = message.timing as { parseMs?: number } | undefined;
    const row: WordRow = {
      word: waiting.word,
      status,
      wallMs,
      parseMs: timing?.parseMs,
      workSteps: typeof message.workSteps === 'number' ? message.workSteps : undefined,
      colour: classify(status, wallMs),
    };
    waiting.resolve(row);
  }

  /** Parses `word`; never rejects: a dead engine yields an ERROR row. */
  parse(word: string): Promise<WordRow> {
    if (this.dead || this.pending)
      return Promise.resolve({ word, status: 'ERROR', wallMs: 0, colour: 'red' });
    return new Promise<WordRow>((resolve) => {
      this.pending = { word, sentAt: Date.now(), resolve };
      const request = JSON.stringify({ id: String(this.nextId), op: 'parse', word });
      this.nextId += 1;
      this.process.stdin.write(`${request}\n`);
    });
  }

  close(): boolean {
    this.pending = undefined;
    this.dead = 'closed';
    return this.process.kill();
  }
}

/** The processes of the running chapter checks, so cancel and deactivate can stop them. */
const active = new Set<ServeClient>();

/** Stops every running check's processes; true so it can be registered as an unsubscriber. */
export function stopAll(): boolean {
  active.forEach((client) => client.close());
  active.clear();
  return true;
}

export interface RunOptions {
  launch: Launcher;
  command: string;
  grammarPath: string;
  words: readonly string[];
  processes?: number;
  wordTimeoutMs?: number;
}

/** Parses every word with `processes` parallel engine processes and times each one. */
export async function runWords(options: RunOptions): Promise<ChapterRun> {
  const { launch, command, grammarPath, words } = options;
  const wordTimeoutMs = options.wordTimeoutMs ?? RED_ABOVE_MS;
  const count = Math.max(1, Math.min(options.processes ?? 4, words.length || 1));
  const startedAt = Date.now();
  const clients = Array.from(
    { length: count },
    () => new ServeClient(launch, command, grammarPath, wordTimeoutMs),
  );
  clients.forEach((c) => active.add(c));
  try {
    const readyTimes = await Promise.all(clients.map((c) => c.ready));
    const coldStartMs = Math.max(...readyTimes);
    const rows: WordRow[] = new Array<WordRow>(words.length);
    let next = 0;
    await Promise.all(
      clients.map(async (client) => {
        while (next < words.length) {
          const index = next;
          next += 1;
          // eslint-disable-next-line no-await-in-loop
          rows[index] = await client.parse(words[index]);
        }
      }),
    );
    const counts: Record<WordColour, number> = { green: 0, yellow: 0, red: 0, skipped: 0 };
    rows.forEach((r) => {
      counts[r.colour] += 1;
    });
    return { rows, coldStartMs, wallTotalMs: Date.now() - startedAt, processes: count, counts };
  } finally {
    clients.forEach((c) => {
      c.close();
      active.delete(c);
    });
  }
}
