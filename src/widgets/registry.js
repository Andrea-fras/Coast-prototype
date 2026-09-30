import { lazy } from 'react';

// The labs Pedro can place in a workshop reply. Each loads only when first used, so lessons
// without labs never download them (Python itself loads only when a code lab runs).
export const WIDGETS = {
  python: { label: 'Python lab', component: lazy(() => import('./labs/CodeLab')) },
  tokens: { label: 'tokenizer lab', component: lazy(() => import('./labs/TokenLab')) },
  temperature: { label: 'temperature lab', component: lazy(() => import('./labs/TemperatureLab')) },
  attention: { label: 'attention lab', component: lazy(() => import('./labs/AttentionLab')) },
  rocket: { label: 'rocket lab', component: lazy(() => import('./labs/RocketLab')) },
  neuron: { label: 'neuron lab', component: lazy(() => import('./labs/NeuronLab')) },
  recall: { label: 'recall test', component: lazy(() => import('./labs/RecallLab')) },
};
