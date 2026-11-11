declare module 'motif-spike' {
  /** One word's result; colour is derived from wall time and status. */
  export interface MotifSpikeWordRow {
    word: string;
    status: string;
    wallMs: number;
    parseMs?: number;
    workSteps?: number;
    colour: 'green' | 'yellow' | 'red' | 'skipped';
  }

  export interface MotifSpikeChapterResult {
    projectId: string;
    book: string;
    chapter: number;
    wordCount: number;
    coldStartMs: number;
    wallTotalMs: number;
    processes: number;
    grammarPath: string;
    counts: Record<'green' | 'yellow' | 'red' | 'skipped', number>;
    rows: MotifSpikeWordRow[];
  }

  export interface MotifSpikeCheckOptions {
    /** Replaces the chapter's words (stress runs). */
    words?: string[];
    processes?: number;
    grammarPath?: string;
  }
}

declare module 'papi-shared-types' {
  import type { MotifSpikeChapterResult, MotifSpikeCheckOptions } from 'motif-spike';
  import type { SerializedVerseRef } from '@sillsdev/scripture';

  export interface CommandHandlers {
    'motifSpike.checkChapter': (
      projectId: string,
      verseRef: SerializedVerseRef,
      options?: MotifSpikeCheckOptions,
    ) => Promise<MotifSpikeChapterResult>;
  }
}
