import React, { useEffect } from 'react';
import { useStore } from './state.jsx';
import SessionCard from './components/SessionCard.jsx';
import PlayersCard from './components/PlayersCard.jsx';
import SettingsCard from './components/SettingsCard.jsx';
import GameHistoryCard from './components/GameHistoryCard.jsx';
import NextUpBar from './components/NextUpBar.jsx';
import CourtsGrid from './components/CourtsGrid.jsx';
import QueuesCard from './components/QueuesCard.jsx';
import LeaderboardCard from './components/LeaderboardCard.jsx';
import PastSessionsModal from './components/PastSessionsModal.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const { dispatch } = useStore();
  const [pastOpen, setPastOpen] = React.useState(false);

  // Cmd/Ctrl+Z anywhere except inside form inputs.
  useEffect(() => {
    const onKey = (e) => {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      if (!isUndo) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      dispatch({ type: 'UNDO' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <div className="app">
      <header>
        <h1>Pickleball Queue</h1>
        <p>Add players, run doubles games, let the queue sort itself out.</p>
      </header>

      <SessionCard onOpenPast={() => setPastOpen(true)} />

      <div className="grid">
        <div>
          <PlayersCard />
          <SettingsCard />
          <GameHistoryCard />
        </div>
        <div>
          <NextUpBar />
          <div className="card">
            <h2>Courts</h2>
            <CourtsGrid />
          </div>
          <QueuesCard />
        </div>
      </div>

      <LeaderboardCard />

      <Toast />

      {pastOpen && <PastSessionsModal onClose={() => setPastOpen(false)} />}
    </div>
  );
}
