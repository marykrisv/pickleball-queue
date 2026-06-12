import React from 'react';
import { useStore, getNextBracket } from '../state.jsx';
import { isSingleLineMode } from '../util.js';

function getNext(state) {
  const single = isSingleLineMode(state.players, state.numCourts);
  if (single) {
    if (state.waiting.length >= 4) return { name: 'Waiting line', detail: `${state.waiting.length} in line` };
    if (state.waiting.length === 0) return { name: 'No one queued', detail: '' };
    return { name: 'Waiting for more...', detail: `${state.waiting.length} in line — need 4` };
  }
  if (state.waiting.length >= 4) return { name: 'Initial', detail: `${state.waiting.length} players waiting` };
  const w = state.winnersQueue.length, l = state.losersQueue.length, wait = state.waiting.length;
  if (w + l + wait === 0) return { name: 'No one queued', detail: '' };
  // Use the alternating preference from state — winners <-> losers <-> winners.
  const nextBracket = getNextBracket(w, l, state.nextBracket);
  const intendedQ = nextBracket === 'winners' ? w : l;
  const label = nextBracket === 'winners' ? 'Winners bracket' : 'Losers bracket';
  if (intendedQ >= 4) return { name: label, detail: `${intendedQ} ready` };
  const total = intendedQ + wait;
  return { name: label, detail: `${total} queued — need 4` };
}

export default function NextUpBar() {
  const { state, dispatch } = useStore();
  const single = isSingleLineMode(state.players, state.numCourts);

  if (!state.started) {
    return (
      <div className="next-up">
        <div>
          <div className="next-up-label">Next bracket up</div>
          <div className="next-up-value">Add players to get started</div>
        </div>
        <button
          className="btn-ghost undo-btn"
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={state.undoStack.length === 0}
          title={state.undoStack.length > 0 ? `Undo: ${state.undoStack[state.undoStack.length - 1].label}` : 'Nothing to undo'}
          style={{ marginLeft: 'auto' }}
        >
          ↶ Undo
        </button>
      </div>
    );
  }

  const next = getNext(state);
  const anyEmpty = state.courts.some((c) => !c.teamA);
  const willAuto = anyEmpty && (
    next.name === 'Initial' ||
    next.name === 'Waiting line' ||
    next.name.startsWith('Winners') ||
    next.name.startsWith('Losers')
  );
  let detail = willAuto ? next.detail + ' — auto-fills as soon as 4 are ready' : next.detail;
  if (single) detail += (detail ? ' • ' : '') + 'Winners stay & split, out after 2-game streak';

  return (
    <div className="next-up">
      <div>
        <div className="next-up-label">Next bracket up</div>
        <div className="next-up-value">{next.name}</div>
      </div>
      <div className="next-up-detail">{detail}</div>
      <span className={`mode-badge ${single ? 'single' : 'brackets'}`}>
        {single ? 'Single Line Mode' : 'W/L Brackets Mode'}
      </span>
      <button
        className="btn-ghost undo-btn"
        onClick={() => dispatch({ type: 'UNDO' })}
        disabled={state.undoStack.length === 0}
        title={
          state.undoStack.length > 0
            ? `Undo: ${state.undoStack[state.undoStack.length - 1].label} (${state.undoStack.length} step${state.undoStack.length === 1 ? '' : 's'})`
            : 'Nothing to undo'
        }
      >
        ↶ Undo
      </button>
    </div>
  );
}
