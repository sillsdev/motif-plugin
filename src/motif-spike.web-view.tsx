import type { WebViewProps } from '@papi/core';

globalThis.webViewComponent = function MotifSpikeWebView(_props: WebViewProps) {
  return <div className="tw:p-4">Motif spike says hello.</div>;
};
