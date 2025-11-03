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

const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc'
};

const SIGNIFICANCE_DENOMINATOR = 32;
const SIGNIFICANCE_THRESHOLD = 0.05 / SIGNIFICANCE_DENOMINATOR;

function getDeltaWinRate(feature) {
  if (feature.delta_win_rate_percentage !== undefined && feature.delta_win_rate_percentage !== null) {
    return feature.delta_win_rate_percentage;
  }
  if (feature.win_rate_percentage !== undefined && feature.win_rate_percentage !== null) {
    return feature.win_rate_percentage;
  }
  return null;
}

function formatSignedPercent(value, fractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

function formatSignedValue(value, fractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)}`;
}

function formatPercent(value, fractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(fractionDigits)}%`;
}

function formatNumber(value, fractionDigits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(fractionDigits);
}

function ExampleCard({ example }) {
  if (!example) {
    return null;
  }

  const winnerIsA = example.label === 1;
  const chosenResponse = winnerIsA ? example.response_A : example.response_B;
  const rejectedResponse = winnerIsA ? example.response_B : example.response_A;
  const rawZScore = example.activation_z_score;
  const signedZScore =
    rawZScore !== null && rawZScore !== undefined ? rawZScore * (winnerIsA ? 1 : -1) : null;
  const comparisonText =
    signedZScore === null
      ? 'Feature difference unavailable.'
      : signedZScore > 0
        ? 'Chosen response contains the feature more.'
        : signedZScore < 0
          ? 'Rejected response contains the feature more.'
          : 'Feature appears equally in both responses.';

  return (
    <div className="example-card">
      <div className="example-meta">
        <span className="example-label">Chosen response</span>
        <span className="example-label secondary">Rejected response</span>
      </div>
      <div
        className={clsx(
          'example-delta',
          signedZScore > 0 && 'delta-positive',
          signedZScore < 0 && 'delta-negative',
          signedZScore === 0 && 'delta-neutral'
        )}
      >
        <span className="delta-value">
          Feature z-score: {formatSignedValue(signedZScore, 1)}
        </span>
        <span className="delta-text">{comparisonText}</span>
      </div>
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
    const sorted = [...entries].sort((a, b) => {
      const deltaA = getDeltaWinRate(a) ?? -Infinity;
      const deltaB = getDeltaWinRate(b) ?? -Infinity;
      const diff = deltaA - deltaB;
      return sortDirection === SORT_DIRECTIONS.DESC ? -diff : diff;
    });
    return sorted;
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
          <h3>Inspect feature-level patterns in human preference datasets.</h3>
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
            <h2>Model-Derived Features</h2>
            <p>Click a row to see preference examples.</p>
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
                  <th className="feature-col">Feature Description</th>
                  <th onClick={toggleSort} className="sortable-header">
                    Δ Win Rate {sortDirection === SORT_DIRECTIONS.DESC ? '▲' : '▼'}
                  </th>
                  <th>Prevalence</th>
                  <th>Fidelity</th>
                </tr>
              </thead>
              <tbody>
                {features.map(feature => {
                  const delta = getDeltaWinRate(feature);
                  const pValue = feature.win_rate_p_value;
                  const isSignificant =
                    pValue !== null &&
                    pValue !== undefined &&
                    pValue <= SIGNIFICANCE_THRESHOLD;
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
                <em>{selectedFeature.interpretation}</em>
              </h2>
            ) : (
              <h2>Examples</h2>
            )}
            {selectedFeature && (
              <div className="feature-stats">
                <span className="feature-id">
                  Feature #{selectedFeature.feature_idx}
                </span>
                <span>
                  <strong>{formatSignedPercent(getDeltaWinRate(selectedFeature))}</strong> win rate delta
                </span>
                <span>
                  <strong>{formatPercent(selectedFeature.prevalence_percentage)}</strong> prevalence
                </span>
                <span>
                  <strong>{formatNumber(selectedFeature.fidelity_correlation, 2)}</strong> fidelity
                </span>
              </div>
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
            {selectedFeature?.examples?.top_5_percent?.map((example, index) => (
              <ExampleCard key={index} example={example} />
            )) || (
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
