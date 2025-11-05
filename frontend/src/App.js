import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import './App.css';

const DATA_URL = `${process.env.PUBLIC_URL || ''}/feature_data_for_demo.json`;

const DATASET_ORDER = [
  'HH-RLHF',
  'Reddit',
  'PRISM',
  'CommunityAlign',
  'ChatbotArena',
  'PKU',
  'Tulu'
];

const DATASET_DISPLAY_NAMES = {
  'HH-RLHF': 'HH-RLHF',
  Reddit: 'Reddit',
  PRISM: 'PRISM',
  CommunityAlign: 'Community Alignment',
  ChatbotArena: 'Chatbot Arena',
  PKU: 'PKU-SafeRLHF',
  Tulu: 'Tulu 3'
};

const COLUMN_DESCRIPTIONS = {
  interpretation: 'LLM-generated description of response pairs that activate the SAE feature.',
  deltaWinRate: 'Change in win rate when this feature is active.',
  prevalence: 'Percent of response pairs containing the feature.',
  fidelity: 'How well the feature description matches its activations.'
};

const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc'
};

const SIGNIFICANCE_DENOMINATOR = 32;
const SIGNIFICANCE_THRESHOLD = 0.05 / SIGNIFICANCE_DENOMINATOR;
const MIN_FIDELITY = 0.3;
const EXAMPLE_FIELDS = ['top_5_percent', 'top_2_percent', 'top_examples'];

function validateLogitPValues(datasetMap) {
  Object.entries(datasetMap || {}).forEach(([datasetName, features = {}]) => {
    Object.values(features).forEach(feature => {
      getLogitPValue(feature);
    });
  });
}

function getLogitPValue(feature) {
  if (feature.logit_p_value === null || feature.logit_p_value === undefined) {
    throw new Error(`Feature ${feature.feature_idx ?? ''} is missing logit_p_value`);
  }
  return feature.logit_p_value;
}

function isFeatureSignificant(feature) {
  const pValue = getLogitPValue(feature);
  return pValue <= SIGNIFICANCE_THRESHOLD;
}

function getDeltaWinRate(feature) {
  if (feature.delta_win_rate_percentage !== undefined && feature.delta_win_rate_percentage !== null) {
    return feature.delta_win_rate_percentage;
  }
  if (feature.win_rate_percentage !== undefined && feature.win_rate_percentage !== null) {
    return feature.win_rate_percentage;
  }
  return null;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const scaled = Math.abs(value) <= 1 ? value * 100 : value;
  const rounded = Math.round(scaled);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${Math.round(value)}%`;
}

function formatNumber(value, fractionDigits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(fractionDigits);
}

function getExampleActivationScore(example) {
  if (!example) {
    return null;
  }
  const score = example.activation_z_score;
  if (score === null || score === undefined) {
    return null;
  }
  return score;
}

function ExampleCard({ example, interpretation, exampleIndex }) {
  if (!example) {
    return null;
  }

  const winnerIsA = example.label === 1;
  const activationScore = getExampleActivationScore(example);
  const leftResponseIsA = activationScore === null ? true : activationScore >= 0;
  const leftResponse = leftResponseIsA ? example.response_A : example.response_B;
  const rightResponse = leftResponseIsA ? example.response_B : example.response_A;
  const leftResponseId = leftResponseIsA ? 'A' : 'B';
  const rightResponseId = leftResponseIsA ? 'B' : 'A';
  const hasActivationData = activationScore !== null;
  const hasMeaningfulDifference = hasActivationData && activationScore !== 0;
  const activationLabel = hasActivationData ? Math.abs(activationScore).toFixed(1) : '—';
  const featurePhrase = interpretation || 'this feature';
  const comparisonText = (() => {
    if (!hasActivationData) {
      return 'Feature difference unavailable.';
    }
    if (!hasMeaningfulDifference) {
      return 'Feature appears equally in both responses.';
    }
    return (
      <>
        <span className="response-label positive">Response {leftResponseId}</span> shows "{featurePhrase}" more than{' '}
        <span className="response-label negative">Response {rightResponseId}</span>.
      </>
    );
  })();
  const leftHeading = `Response ${leftResponseId}${
    hasMeaningfulDifference ? ' (more of the feature)' : ''
  }`;
  const rightHeading = `Response ${rightResponseId}${
    hasMeaningfulDifference ? ' (less of the feature)' : ''
  }`;
  const preferredSideIsLeft = winnerIsA === leftResponseIsA;

  return (
    <div className="example-card">
      <div className="example-number">
        Example {exampleIndex + 1}: activation {activationLabel}
      </div>
      <div className="example-comparison">{comparisonText}</div>
      <div className="prompt-box">
        <strong>Prompt</strong>
        <div className="prompt-text">{example.prompt}</div>
      </div>
      <div className="responses-row">
        <div
          className={clsx(
            'response-box',
            'response-left',
            hasMeaningfulDifference && 'response-positive'
          )}
        >
          <strong>{leftHeading}</strong>
          <div className="response-text">{leftResponse}</div>
        </div>
        <div
          className={clsx(
            'response-box',
            'response-right',
            hasMeaningfulDifference && 'response-negative'
          )}
        >
          <strong>{rightHeading}</strong>
          <div className="response-text">{rightResponse}</div>
        </div>
      </div>
      <div className="preference-note">
        The response on the <em>{preferredSideIsLeft ? 'left' : 'right'}</em> was preferred by the judge.
      </div>
    </div>
  );
}

function getFeatureExamples(feature) {
  if (!feature?.examples) {
    return [];
  }
  for (const field of EXAMPLE_FIELDS) {
    const list = feature.examples[field];
    if (Array.isArray(list) && list.length) {
      return list;
    }
  }
  return [];
}

function App() {
  const [data, setData] = useState({});
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [sortDirection, setSortDirection] = useState(SORT_DIRECTIONS.DESC);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(DATA_URL);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.toLowerCase().includes('application/json')) {
          throw new Error('Feature data file is missing or invalid JSON.');
        }
        const json = await response.json();
        validateLogitPValues(json);
        setData(json);
        const datasetNames = DATASET_ORDER.filter(name => Object.prototype.hasOwnProperty.call(json, name));
        setDatasets(datasetNames);
        if (datasetNames.length > 0) {
          setSelectedDataset(datasetNames[0]);
        }
      } catch (err) {
        console.error(err);
        setError(err?.message || 'Unable to load feature data. Please ensure feature_data_for_demo.json is available.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const features = useMemo(() => {
    if (!selectedDataset || !data[selectedDataset]) {
      return [];
    }
    const entries = Object.values(data[selectedDataset]);
    const fidelityFiltered = entries.filter(feature => {
      const fidelityScore = feature.fidelity_correlation;
      return fidelityScore !== null && fidelityScore !== undefined && fidelityScore >= MIN_FIDELITY;
    });

    const compareByDelta = (a, b) => {
      const deltaA = getDeltaWinRate(a) ?? -Infinity;
      const deltaB = getDeltaWinRate(b) ?? -Infinity;
      const diff = deltaA - deltaB;
      return sortDirection === SORT_DIRECTIONS.DESC ? -diff : diff;
    };

    const significant = fidelityFiltered.filter(feature => isFeatureSignificant(feature)).sort(compareByDelta);
    const notSignificant = fidelityFiltered
      .filter(feature => !isFeatureSignificant(feature))
      .sort(compareByDelta);

    return [...significant, ...notSignificant];
  }, [data, selectedDataset, sortDirection]);

  useEffect(() => {
    if (features.length === 0) {
      setSelectedFeatureId(null);
      return;
    }

    if (
      selectedFeatureId === null ||
      !features.some(feature => feature.feature_idx === selectedFeatureId)
    ) {
      setSelectedFeatureId(features[0].feature_idx);
    }
  }, [features, selectedFeatureId]);

  const selectedFeature = useMemo(() => {
    if (!features.length) {
      return null;
    }
    return (
      features.find(feature => feature.feature_idx === selectedFeatureId) || features[0]
    );
  }, [features, selectedFeatureId]);

  const sortedExamples = useMemo(() => {
    const exampleList = getFeatureExamples(selectedFeature);
    if (!exampleList.length) {
      return [];
    }
    const items = [...exampleList];
    items.sort((a, b) => {
      const aScore = getExampleActivationScore(a);
      const bScore = getExampleActivationScore(b);
      const aMetric = aScore === null ? -Infinity : Math.abs(aScore);
      const bMetric = bScore === null ? -Infinity : Math.abs(bScore);
      return bMetric - aMetric;
    });
    return items;
  }, [selectedFeature]);

  const handleDatasetSelect = dataset => {
    if (dataset === selectedDataset) {
      return;
    }
    setSelectedDataset(dataset);
    setSelectedFeatureId(null);
  };

  const toggleSort = () => {
    setSortDirection(prev =>
      prev === SORT_DIRECTIONS.DESC ? SORT_DIRECTIONS.ASC : SORT_DIRECTIONS.DESC
    );
  };

  if (isLoading) {
    return (
      <div className="loading-state">
        Loading WIMHF demo…
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        {error}
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="top-header">
        <div className="header-block">
          <strong>Paper:</strong>{' '}
          <a href="https://arxiv.org/abs/2510.26202">
            What&apos;s in My Human Feedback?
          </a>{' '}
          Rajiv Movva, Smitha Milli, Sewon Min, Emma Pierson.
        </div>
        <div className="header-title">
          <h1>What&apos;s In My Human Feedback?</h1>
          <h3>Explain the encoded preferences in feedback data using interpretable sparse autoencoder features.</h3>
        </div>
        <div className="header-block">
          <strong>Repo:</strong>
          <br />
          <a href="https://github.com/rmovva/wimhf">WIMHF on GitHub</a>
        </div>
      </header>

      <section className="dataset-tabs">
        {datasets.map(dataset => (
          <button
            key={dataset}
            type="button"
            className={clsx(
              'tab-button',
              dataset === selectedDataset && 'active'
            )}
            onClick={() => handleDatasetSelect(dataset)}
          >
            {DATASET_DISPLAY_NAMES[dataset] || dataset}
          </button>
        ))}
      </section>

      <main className="main-content">
        <section className="feature-table-section">
          <div className="table-caption">
            <div className="significance-legend">
              <span className="legend-item">
                <span className="legend-swatch legend-positive" />
                increases win rate (significant)
              </span>
              <span className="legend-item">
                <span className="legend-swatch legend-negative" />
                decreases win rate (significant)
              </span>
              <span className="legend-item">
                <span className="legend-swatch legend-neutral" />
                not significant
              </span>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="feature-table">
              <thead>
                <tr>
                  <th className="feature-col">
                    <div className="column-heading">
                      <span>Feature Description</span>
                      <span className="column-subtitle">{COLUMN_DESCRIPTIONS.interpretation}</span>
                    </div>
                  </th>
                  <th onClick={toggleSort} className="sortable-header">
                    <div className="column-heading">
                      <span>
                        Δ Win Rate {sortDirection === SORT_DIRECTIONS.DESC ? '▲' : '▼'}
                      </span>
                      <span className="column-subtitle">{COLUMN_DESCRIPTIONS.deltaWinRate}</span>
                    </div>
                  </th>
                  <th>
                    <div className="column-heading">
                      <span>Prevalence</span>
                      <span className="column-subtitle">{COLUMN_DESCRIPTIONS.prevalence}</span>
                    </div>
                  </th>
                  <th>
                    <div className="column-heading">
                      <span>Fidelity</span>
                      <span className="column-subtitle">{COLUMN_DESCRIPTIONS.fidelity}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map(feature => {
                  const delta = getDeltaWinRate(feature);
                  const isSignificant = isFeatureSignificant(feature);
                  return (
                    <tr
                      key={feature.feature_idx}
                      className={clsx(
                        'feature-row',
                        feature.feature_idx === selectedFeature?.feature_idx && 'selected',
                        isSignificant && delta !== null && delta > 0 && 'row-positive',
                        isSignificant && delta !== null && delta < 0 && 'row-negative',
                        (!isSignificant || delta === null) && 'row-neutral'
                      )}
                      onClick={() => setSelectedFeatureId(feature.feature_idx)}
                    >
                      <td>
                        <div className="feature-interpretation">
                          {feature.interpretation}
                        </div>
                      </td>
                      <td>{formatSignedPercent(delta)}</td>
                      <td>{formatPercent(feature.prevalence_percentage)}</td>
                      <td>{formatNumber(feature.fidelity_correlation, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="examples-section">
          <div className="examples-header">
            {selectedFeature ? (
              <h2>
                <span className="feature-label">Feature {selectedFeature.feature_idx}:</span>{' '}
                <em>{selectedFeature.interpretation}</em>
              </h2>
            ) : (
              <h2>Examples</h2>
            )}
            {selectedFeature && (
              <div className="feature-stats">
                <span>
                  <strong
                    className={clsx(
                      getDeltaWinRate(selectedFeature) > 0 && 'stat-positive',
                      getDeltaWinRate(selectedFeature) < 0 && 'stat-negative'
                    )}
                  >
                    {formatSignedPercent(getDeltaWinRate(selectedFeature))}
                  </strong>{' '}
                  win rate when feature is active
                </span>
                <span>
                  <strong>{formatNumber(selectedFeature.fidelity_correlation, 2)}</strong> fidelity
                </span>
              </div>
            )}
            {selectedFeature && (
              <p className="examples-subhead">Example response pairs with large value of the feature</p>
            )}
          </div>
          <div className="examples-list">
            {sortedExamples.length > 0 ? (
              sortedExamples.map((example, index) => (
                <ExampleCard
                  key={index}
                  example={example}
                  interpretation={selectedFeature?.interpretation}
                  exampleIndex={index}
                />
              ))
            ) : (
              <div className="placeholder">
                Select a feature to see representative examples.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
