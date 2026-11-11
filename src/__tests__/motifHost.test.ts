import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, extractWords, runWords, type EngineProcess, type Launcher } from '../services/motifHost';

/** A fake `pangloss serve`: answers each parse after the delay its word names, e.g. `w300` takes 300 ms. */
const fakeLauncher: Launcher = () => {
  let onData: ((c: unknown) => void) | undefined;
  const process: EngineProcess = {
    stdin: {
      write(text: string) {
        const request = JSON.parse(text) as { id: string; word: string };
        const delay = Number(/\d+/.exec(request.word)?.[0] ?? 0);
        const status = request.word.startsWith('x') ? 'SKIPPED' : request.word.startsWith('t') ? 'TIMEOUT' : 'ok';
        setTimeout(
          () =>
            onData?.(
              `${JSON.stringify({ id: request.id, type: 'result', status, workSteps: 3, timing: { parseMs: delay } })}\n`,
            ),
          delay,
        );
      },
      end() {},
    },
    stdout: {
      on(_e, l) {
        onData = l;
        setTimeout(() => l('{"type":"ready","protocol":2}\n'), 5);
      },
    },
    stderr: { on() {} },
    on() {},
    kill: () => true,
  };
  return process;
};

test('classify uses 500 ms and 5 s edges and treats failures as red', () => {
  assert.equal(classify('ok', 499), 'green');
  assert.equal(classify('ok', 500), 'yellow');
  assert.equal(classify('ok', 5000), 'yellow');
  assert.equal(classify('ok', 5001), 'red');
  assert.equal(classify('TIMEOUT', 10), 'red');
  assert.equal(classify('ERROR', 10), 'red');
  assert.equal(classify('SKIPPED', 10), 'skipped');
});

test('extractWords drops markers, verse numbers and notes and keeps first-seen unique words', () => {
  const usfm = '\\id GEN\n\\c 1\n\\p\n\\v 1 In the beginning, \\w God|strong="H1"\\w* made it.\\f + \\ft note text\\f* The beginning.\n';
  assert.deepEqual(extractWords(usfm), ['in', 'the', 'beginning', 'god', 'made', 'it']);
});

test('runWords times each word, splits colours and counts them with parallel processes', async () => {
  const run = await runWords({
    launch: fakeLauncher,
    command: 'fake',
    grammarPath: 'g.fwdata',
    words: ['w10', 'w600', 'x1', 't5', 'w20'],
    processes: 2,
  });
  assert.deepEqual(run.rows.map((r) => r.colour), ['green', 'yellow', 'skipped', 'red', 'green']);
  assert.deepEqual(run.counts, { green: 2, yellow: 1, red: 1, skipped: 1 });
  assert.equal(run.processes, 2);
  assert.ok(run.coldStartMs >= 5);
  assert.ok(run.wallTotalMs >= 600);
});
