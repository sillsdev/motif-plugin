import papi, { logger } from '@papi/backend';
import type { ExecutionActivationContext, IWebViewProvider, SavedWebViewDefinition } from '@papi/core';
import motifSpikeReact from './motif-spike.web-view?inline';
import motifSpikeStyles from './tailwind.css?inline';

const webViewType = 'motifSpike.main';

const provider: IWebViewProvider = {
  async getWebView(saved: SavedWebViewDefinition) {
    if (saved.webViewType !== webViewType) throw new Error(`Unexpected WebView type ${saved.webViewType}`);
    return { ...saved, title: 'Motif spike', content: motifSpikeReact, styles: motifSpikeStyles };
  },
};

export async function activate(context: ExecutionActivationContext) {
  logger.info('Motif spike activating');
  context.registrations.add(await papi.webViewProviders.registerWebViewProvider(webViewType, provider));
  await papi.webViews.openWebView(webViewType, undefined, { existingId: '?' });
}

export async function deactivate() {
  return true;
}
