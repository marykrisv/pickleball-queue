import React from 'react';
import { useStore } from '../state.jsx';

export default function SettingsCard() {
  const { state, dispatch } = useStore();

  const onStart = () => dispatch({ type: 'START_GAMES' });
  const onReset = () => {
    if (!window.confirm('Reset all games and queues? Player stats will also be reset.')) return;
    dispatch({ type: 'RESET_ROUND' });
  };

  return (
    <div className="card">
      <h2>Settings</h2>
      <div className="controls">
        <div className="row">
          <label htmlFor="numCourts">Number of courts</label>
          <input
            id="numCourts"
            type="number"
            min={1}
            max={6}
            value={state.numCourts}
            onChange={(e) => dispatch({ type: 'SET_NUM_COURTS', value: e.target.value })}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn-success"
          style={{ flex: 1 }}
          onClick={onStart}
          disabled={state.players.length < 4 || state.started}
        >
          {state.started ? 'Round In Progress' : 'Start Games'}
        </button>
        <button className="btn-warning" style={{ flex: 1 }} onClick={onReset}>
          Reset Round
        </button>
      </div>
    </div>
  );
}
