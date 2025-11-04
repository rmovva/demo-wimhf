import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import './App.css';

const DATA_URL = `${process.env.PUBLIC_URL || ''}/wimhf_demo.json`;

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

function isFeatureSignificant(feature) {
  const pValue =
    feature.logit_p_value !== undefined && feature.logit_p_value !== null
      ? feature.logit_p_value
      : feature.win_rate_p_value;
  return pValue !== null && pValue !== undefined && pValue <= SIGNIFICANCE_THRESHOLD;
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
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

function formatSignedValue(value, fractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)}`;
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

function getExampleSignedZScore(example) {
  if (!example) {
    return null;
  }
  const winnerIsA = example.label === 1;
  const rawZScore = example.activation_z_score;
  if (rawZScore === null || rawZScore === undefined) {
    return null;
  }
  return rawZScore * (winnerIsA ? 1 : -1);
}

function ExampleCard({ example, interpretation, exampleIndex }) {
  if (!example) {
    return null;
  }

  const winnerIsA = example.label === 1;
  const chosenResponse = winnerIsA ? example.response_A : example.response_B;
  const rejectedResponse = winnerIsA ? example.response_B : example.response_A;
  const signedZScore = getExampleSignedZScore(example);
  const dominantResponse =
    signedZScore === null ? null : signedZScore > 0 ? 'chosen' : signedZScore < 0 ? 'rejected' : 'equal';
  const featurePhrase = interpretation || 'this feature';
  const comparisonText = (() => {
    if (signedZScore === null) {
      return 'Feature difference unavailable.';
    }
    if (dominantResponse === 'equal') {
      return 'Feature appears equally in both responses.';
    }
    const leadingLabel = dominantResponse === 'chosen' ? 'Chosen response' : 'Rejected response';
    const trailingLabel = dominantResponse === 'chosen' ? 'rejected response' : 'chosen response';
    const leadingClass = dominantResponse === 'chosen' ? 'response-label positive' : 'response-label negative';
    const trailingClass = dominantResponse === 'chosen' ? 'response-label negative' : 'response-label positive';
    return (
      <>
        <span className={leadingClass}>{leadingLabel}</span> "{featurePhrase}" more than{' '}
        <span className={trailingClass}>{trailingLabel}</span>.
      </>
    );
  })();

  return (
    <div className="example-card">
      <div className="example-number">Example {exampleIndex + 1}</div>
      <div className="prompt-box">
        <strong>Prompt</strong>
        <div className="prompt-text">{example.prompt}</div>
      </div>
      <div className="responses-row">
        <div
          className={clsx(
            'response-box',
            'response-left',
            'response-positive'
          )}
        >
          <strong>Chosen response</strong>
          <div className="response-text">{chosenResponse}</div>
        </div>
        <div
          className={clsx(
            'response-box',
            'response-right',
            'response-negative'
          )}
        >
          <strong>Rejected response</strong>
          <div className="response-text">{rejectedResponse}</div>
        </div>
      </div>
      <div className="example-delta">
        <span className="delta-value">
          Feature z-score: {formatSignedValue(signedZScore, 1)}
        </span>
        <span className="delta-text">{comparisonText}</span>
      </div>
    </div>
  );
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
        const json = await response.json();
        setData(json);
        const datasetNames = DATASET_ORDER.filter(name => Object.prototype.hasOwnProperty.call(json, name));
        setDatasets(datasetNames);
        if (datasetNames.length > 0) {
          setSelectedDataset(datasetNames[0]);
        }
      } catch (err) {
        setError('Unable to load WIMHF demo data. Please ensure wimhf_demo.json is available.');
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
      const fidelityP = feature.fidelity_p_value;
      if (fidelityP === null || fidelityP === undefined) {
        return true;
      }
      return fidelityP <= SIGNIFICANCE_THRESHOLD;
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
    if (!selectedFeature?.examples?.top_5_percent) {
      return [];
    }
    const items = [...selectedFeature.examples.top_5_percent];
    items.sort((a, b) => {
      const aScore = getExampleSignedZScore(a);
      const bScore = getExampleSignedZScore(b);
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
                  win rate delta
                </span>
                <span>
                  <strong>{formatNumber(selectedFeature.fidelity_correlation, 2)}</strong> fidelity
                </span>
              </div>
            )}
            {selectedFeature && (
              <p className="examples-subhead">Example response pairs with large value of the feature</p>
            )}
            <div className="examples-legend">
              <span className="legend-item">
                Positive z-score → chosen response (left) contains the feature more.
              </span>
              <span className="legend-item">
                Negative z-score → rejected response (right) contains the feature more.
              </span>
            </div>
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
