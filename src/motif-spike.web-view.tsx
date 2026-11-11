import papi from '@papi/frontend';
import type { WebViewProps } from '@papi/core';
import type { MotifSpikeChapterResult } from 'motif-spike';
import { useEffect, useState } from 'react';

const colours: Record<string, string> = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
  skipped: '#9ca3af',
};

interface ProjectChoice {
  id: string;
  name: string;
}

globalThis.webViewComponent = function MotifSpikeWebView({
  projectId: openedProjectId,
  useWebViewScrollGroupScrRef,
}: WebViewProps) {
  const [scrRef] = useWebViewScrollGroupScrRef();
  const [projects, setProjects] = useState<ProjectChoice[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>(openedProjectId);
  const [grammarPath, setGrammarPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<MotifSpikeChapterResult | undefined>();

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt: number) => {
      try {
        const all = await papi.projectLookup.getMetadataForAllProjects();
        const usable = all
          .filter((p) => p.projectInterfaces.includes('platformScripture.USFM_Chapter'))
          .map((p) => ({ id: p.id, name: p.id }));
        if (cancelled) return;
        if (usable.length === 0 && attempt < 60) {
          // Projects load after the window opens, so ask again for a minute.
          setTimeout(() => load(attempt + 1), 1000);
          return;
        }
        setProjects(usable);
        setProjectId((current) => current ?? usable[0]?.id);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, []);

  const check = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await papi.commands.sendCommand('motifSpike.checkChapter', projectId, scrRef, {
          grammarPath: grammarPath.trim() || undefined,
        }),
      );
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  };

  return (
    <div className="tw:p-4 tw:text-sm" data-testid="motif-spike">
      <div className="tw:flex tw:items-center tw:gap-2 tw:mb-3">
        <select
          value={projectId ?? ''}
          onChange={(e) => setProjectId(e.target.value)}
          className="tw:border tw:rounded tw:px-2 tw:py-1"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span>
          {scrRef.book} {scrRef.chapterNum}
        </span>
        <button
          type="button"
          disabled={busy || !projectId}
          onClick={check}
          className="tw:border tw:rounded tw:px-3 tw:py-1"
        >
          {busy ? 'Checking...' : 'Check chapter'}
        </button>
      </div>
      <div className="tw:flex tw:items-center tw:gap-2 tw:mb-3">
        <label htmlFor="motif-grammar">Grammar (.fwdata path)</label>
        <input
          id="motif-grammar"
          data-testid="grammar-path"
          type="text"
          value={grammarPath}
          onChange={(e) => setGrammarPath(e.target.value)}
          placeholder="blank = MOTIF_SPIKE_GRAMMAR"
          className="tw:border tw:rounded tw:px-2 tw:py-1 tw:flex-1"
        />
      </div>
      {error && <p style={{ color: colours.red }}>{error}</p>}
      {result && (
        <>
          <p data-testid="summary" className="tw:mb-3">
            {result.wordCount} words:{' '}
            <b style={{ color: colours.green }}>{result.counts.green} green</b>,{' '}
            <b style={{ color: colours.yellow }}>{result.counts.yellow} yellow</b>,{' '}
            <b style={{ color: colours.red }}>{result.counts.red} red</b>,{' '}
            <b style={{ color: colours.skipped }}>{result.counts.skipped} unreadable</b>. Total{' '}
            {(result.wallTotalMs / 1000).toFixed(2)} s on {result.processes} processes; engine start{' '}
            {(result.coldStartMs / 1000).toFixed(2)} s.
          </p>
          <p data-testid="slowest" className="tw:mb-3">
            Slowest:{' '}
            {[...result.rows]
              .sort((a, b) => b.wallMs - a.wallMs)
              .slice(0, 8)
              .map((r) => `${r.word} ${r.wallMs} ms (${r.status})`)
              .join(', ')}
          </p>
          <div className="tw:flex tw:flex-wrap tw:gap-1">
            {result.rows.map((r) => (
              <span
                key={r.word}
                title={`${r.status}: ${r.wallMs} ms wall, ${r.parseMs ?? '?'} ms parse, ${r.workSteps ?? '?'} steps`}
                style={{ background: colours[r.colour], color: 'white' }}
                className="tw:rounded tw:px-2 tw:py-0.5"
              >
                {r.word}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
