import papi, { logger } from '@papi/backend';
import type {
  ExecutionActivationContext,
  ExecutionToken,
  IWebViewProvider,
  SavedWebViewDefinition,
} from '@papi/core';
import type { MotifSpikeChapterResult, MotifSpikeCheckOptions } from 'motif-spike';
import type { SerializedVerseRef } from '@sillsdev/scripture';
import motifSpikeReact from './motif-spike.web-view?inline';
import motifSpikeStyles from './tailwind.css?inline';
import { extractWords, runWords, stopAll, type EngineProcess } from './services/motifHost';

const webViewType = 'motifSpike.main';

const provider: IWebViewProvider = {
  async getWebView(saved: SavedWebViewDefinition) {
    if (saved.webViewType !== webViewType)
      throw new Error(`Unexpected WebView type ${saved.webViewType}`);
    return { ...saved, title: 'Motif spike', content: motifSpikeReact, styles: motifSpikeStyles };
  },
};

/** The PanGloss binary Motif ships, relative to the extension root, for each platform. */
function bundledEngine(platform: string, arch: string): string | undefined {
  if (platform === 'win32') return 'motif/win-x64/pangloss.exe';
  if (platform === 'linux' && arch === 'x64') return 'motif/linux-x64/pangloss';
  if (platform === 'darwin') return `motif/osx-${arch}/pangloss`;
  return undefined;
}

/** Reads an environment variable the dev run sets, since a spike has no settings screen yet. */
function envValue(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[name] || undefined : undefined;
}

export async function activate(context: ExecutionActivationContext) {
  logger.info('Motif spike activating');
  const { createProcess } = context.elevatedPrivileges;
  const executionToken: ExecutionToken = context.executionToken;

  context.registrations.add(
    await papi.webViewProviders.registerWebViewProvider(webViewType, provider),
  );
  context.registrations.add(() => stopAll());

  context.registrations.add(
    await papi.commands.registerCommand(
      'motifSpike.checkChapter',
      async (
        projectId: string,
        verseRef: SerializedVerseRef,
        options?: MotifSpikeCheckOptions,
      ): Promise<MotifSpikeChapterResult> => {
        if (!createProcess) throw new Error('The manifest grants no createProcess');
        const command =
          envValue('MOTIF_SPIKE_ENGINE') ??
          bundledEngine(createProcess.osData.platform, process.arch);
        if (!command) throw new Error(`No engine for ${createProcess.osData.platform}`);
        const grammarPath = options?.grammarPath ?? envValue('MOTIF_SPIKE_GRAMMAR');
        if (!grammarPath) throw new Error('Set MOTIF_SPIKE_GRAMMAR to an .fwdata project path');

        let words = options?.words;
        if (!words) {
          const readStart = Date.now();
          const pdp = await papi.projectDataProviders.get('platformScripture.USFM_Chapter', projectId);
          const usfm = (await pdp.getChapterUSFM(verseRef)) ?? '';
          words = extractWords(usfm);
          logger.info(
            `Motif spike: ${verseRef.book} ${verseRef.chapterNum} has ${words.length} unique words (read in ${Date.now() - readStart} ms)`,
          );
        }
        const run = await runWords({
          launch: (cmd, args) =>
            createProcess.spawn(executionToken, cmd, args, {
              stdio: ['pipe', 'pipe', 'pipe'],
            }) as unknown as EngineProcess,
          command,
          grammarPath,
          words,
          processes: options?.processes ?? Number(envValue('MOTIF_SPIKE_PROCESSES') ?? 4),
          greenBelowMs: options?.greenBelowMs,
          redAboveMs: options?.redAboveMs,
        });
        logger.info(
          `Motif spike: ${words.length} words, ${JSON.stringify(run.counts)}, wall ${run.wallTotalMs} ms, cold start ${run.coldStartMs} ms, ${run.processes} processes`,
        );
        return {
          projectId,
          book: verseRef.book,
          chapter: verseRef.chapterNum,
          wordCount: words.length,
          grammarPath,
          ...run,
        };
      },
    ),
  );

  papi.webViews
    .openWebView(webViewType, undefined, { existingId: '?' })
    .catch((e) => logger.warn(`Motif spike: could not open its WebView: ${String(e)}`));
}

export async function deactivate() {
  stopAll();
  return true;
}
