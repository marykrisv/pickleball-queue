import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { uid, shuffle, todayISO, isSingleLineMode } from './util.js';

// ============================================================
// State shape
// ============================================================
function initialState() {
  return {
    sessionName: 'Pickleball Session',
    sessionDate: todayISO(),
    players: [],          // {id, name, wins, losses, gamesPlayed, consecutiveWins, bestStreak, resting}
    waiting: [],          // ids that haven't played yet (or all in single-line mode)
    winnersQueue: [],
    losersQueue: [],
    courts: [],           // {id, teamA, teamB, source, startTime}
    numCourts: 2,
    history: [],          // {court, winners:[names], losers:[names], source, time, durationMs}
    started: false,
    nextBracket: 'winners', // alternates 'winners' -> 'losers' -> 'winners' as bracket courts fill
    undoStack: [],        // [{data: snapshotState, label}]
    toast: null,          // {msg, ts}
  };
}

const MAX_UNDO = 30;

// ============================================================
// Persistence keys
// ============================================================
const LIVE_STATE_KEY = 'pickleball_live_state_v1';
export const SESSIONS_KEY = 'pickleball_sessions_v1';

function loadLiveState() {
  try {
    const raw = localStorage.getItem(LIVE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Revive Date strings on history entries
    if (Array.isArray(parsed.history)) {
      parsed.history.forEach((h) => {
        if (typeof h.time === 'string') h.time = new Date(h.time);
      });
    }
    // Backfill any missing per-player fields
    if (Array.isArray(parsed.players)) {
      parsed.players.forEach((p) => {
        if (p.consecutiveWins == null) p.consecutiveWins = 0;
        if (p.bestStreak == null) p.bestStreak = 0;
        if (p.resting == null) p.resting = false;
      });
    }
    if (parsed.nextBracket !== 'winners' && parsed.nextBracket !== 'losers') {
      parsed.nextBracket = 'winners';
    }
    // Drop undoStack and toast on reload — both are session-local
    delete parsed.undoStack;
    delete parsed.toast;
    return parsed;
  } catch {
    return null;
  }
}

function saveLiveState(state) {
  try {
    const { undoStack, toast, ...rest } = state;
    localStorage.setItem(LIVE_STATE_KEY, JSON.stringify(rest));
  } catch {}
}

export function loadArchivedSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveArchivedSessions(sessions) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Helpers used by the reducer
// ============================================================

// Returns which bracket will fill the next court, given the current `nextBracket`
// preference. Alternates 'winners' -> 'losers' -> 'winners' as courts fill.
// Falls back to the other bracket if the intended one isn't ready (< 4 players).
export function getNextBracket(winnersLen, losersLen, nextBracket = 'winners') {
  const intended = nextBracket === 'losers' ? 'losers' : 'winners';
  const other = intended === 'winners' ? 'losers' : 'winners';
  const intendedLen = intended === 'winners' ? winnersLen : losersLen;
  const otherLen = other === 'winners' ? winnersLen : losersLen;
  if (intendedLen >= 4) return intended;
  if (otherLen >= 4) return other;
  // Neither has 4 yet — keep showing the intended bracket so the UI reflects the
  // upcoming alternation rather than swapping based on transient counts.
  return intended;
}

// In bracket mode, if waiting has < 4 players they can't fill a court alone.
// Move them into the bracket queue that's next up to play.
function distributeWaitingToBrackets(state) {
  if (!state.started) return state;
  if (isSingleLineMode(state.players, state.numCourts)) return state;
  if (state.waiting.length === 0 || state.waiting.length >= 4) return state;

  const target = getNextBracket(state.winnersQueue.length, state.losersQueue.length, state.nextBracket);
  if (target === 'losers') {
    return { ...state, losersQueue: [...state.losersQueue, ...state.waiting], waiting: [] };
  }
  return { ...state, winnersQueue: [...state.winnersQueue, ...state.waiting], waiting: [] };
}
function setupCourts(courts, desired) {
  const existing = courts.slice(0, desired);
  while (existing.length < desired) {
    existing.push({ id: existing.length + 1, teamA: null, teamB: null, source: null, startTime: null });
  }
  return existing.map((c, i) => ({ ...c, id: i + 1 }));
}

function snapshotState(state, label) {
  const { undoStack, toast, ...rest } = state;
  const next = [...undoStack, { data: structuredClone(rest), label: label || 'change' }];
  if (next.length > MAX_UNDO) next.shift();
  return next;
}

// Given 4 player IDs, return them reordered as [a0,a1,b0,b1] so that
// teamA=[a0,a1] and teamB=[b0,b1] minimise previous-partner conflicts.
function splitFromPartners(picked, players) {
  const lastPartnerOf = {};
  for (const p of players) {
    if (p.lastPartner) lastPartnerOf[p.id] = p.lastPartner;
  }
  const [a, b, c, d] = picked;
  const arrangements = [
    [a, b, c, d],
    [a, c, b, d],
    [a, d, b, c],
  ];
  const wasPartner = (x, y) => lastPartnerOf[x] === y || lastPartnerOf[y] === x;
  const scored = arrangements.map((arr) => ({
    arr,
    score: (wasPartner(arr[0], arr[1]) ? 1 : 0) + (wasPartner(arr[2], arr[3]) ? 1 : 0),
  }));
  const min = Math.min(...scored.map((s) => s.score));
  const best = scored.filter((s) => s.score === min);
  return best[Math.floor(Math.random() * best.length)].arr;
}

// Try to fill one court. Returns { court, ...sideEffects } or null if no fill possible.
function tryFillCourt(state, court) {
  if (court.teamA) return null;
  const single = isSingleLineMode(state.players, state.numCourts);
  let source, picked;
  let waiting = state.waiting;
  let winnersQueue = state.winnersQueue;
  let losersQueue = state.losersQueue;
  let nextBracket = state.nextBracket || 'winners';

  if (single) {
    if (waiting.length < 4) return null;
    source = 'waiting';
    picked = waiting.slice(0, 4);
    waiting = waiting.slice(4);
  } else if (waiting.length >= 4) {
    source = 'initial';
    picked = waiting.slice(0, 4);
    waiting = waiting.slice(4);
  } else {
    // Bracket mode: alternate winners <-> losers via `nextBracket`.
    const intended = nextBracket === 'losers' ? 'losers' : 'winners';
    const other = intended === 'winners' ? 'losers' : 'winners';
    const intendedQ = intended === 'winners' ? winnersQueue : losersQueue;
    const otherQ = other === 'winners' ? winnersQueue : losersQueue;

    if (intendedQ.length >= 4) {
      source = intended;
      picked = intendedQ.slice(0, 4);
      if (intended === 'winners') winnersQueue = winnersQueue.slice(4);
      else losersQueue = losersQueue.slice(4);
      // Successfully filled from intended — flip the indicator.
      nextBracket = other;
    } else if (otherQ.length >= 4) {
      // Intended bracket isn't ready; fall back to the other so the court doesn't sit idle.
      // Don't flip — next time we still want to try the originally intended bracket first.
      source = other;
      picked = otherQ.slice(0, 4);
      if (other === 'winners') winnersQueue = winnersQueue.slice(4);
      else losersQueue = losersQueue.slice(4);
    } else {
      return null;
    }
  }

  const ordered = splitFromPartners(shuffle(picked), state.players);
  const newCourt = {
    ...court,
    teamA: [ordered[0], ordered[1]],
    teamB: [ordered[2], ordered[3]],
    source,
    startTime: Date.now(),
  };
  return { court: newCourt, waiting, winnersQueue, losersQueue, nextBracket };
}

function autoFillCourts(state) {
  if (!state.started) return state;
  // Move straggler waiting players (< 4) into the next bracket queue.
  state = distributeWaitingToBrackets(state);
  let courts = [...state.courts];
  let waiting = state.waiting;
  let winnersQueue = state.winnersQueue;
  let losersQueue = state.losersQueue;
  let nextBracket = state.nextBracket || 'winners';
  let filledAny = true;
  while (filledAny) {
    filledAny = false;
    for (let i = 0; i < courts.length; i++) {
      const result = tryFillCourt(
        { ...state, courts, waiting, winnersQueue, losersQueue, nextBracket },
        courts[i]
      );
      if (result) {
        courts[i] = result.court;
        waiting = result.waiting;
        winnersQueue = result.winnersQueue;
        losersQueue = result.losersQueue;
        nextBracket = result.nextBracket;
        filledAny = true;
      }
    }
    // After filling, redistribute any new stragglers and try again.
    if (!filledAny && waiting.length > 0 && waiting.length < 4) {
      const tmp = distributeWaitingToBrackets({ ...state, waiting, winnersQueue, losersQueue, nextBracket });
      if (tmp.waiting.length < waiting.length) {
        waiting = tmp.waiting;
        winnersQueue = tmp.winnersQueue;
        losersQueue = tmp.losersQueue;
        filledAny = true;
      }
    }
  }
  return { ...state, courts, waiting, winnersQueue, losersQueue, nextBracket };
}

// If we drop below the bracket-mode threshold, fold W/L queues back into waiting.
function ensureModeConsistency(state) {
  if (
    isSingleLineMode(state.players, state.numCourts) &&
    (state.winnersQueue.length || state.losersQueue.length)
  ) {
    return {
      ...state,
      waiting: [...state.waiting, ...state.winnersQueue, ...state.losersQueue],
      winnersQueue: [],
      losersQueue: [],
    };
  }
  return state;
}

// ============================================================
// Reducer
// ============================================================
function reducer(state, action) {
  switch (action.type) {
    case 'LOAD': {
      // Hydrate fresh state with whatever we restored from storage.
      const loaded = action.payload || {};
      return { ...state, ...loaded };
    }

    case 'TOAST':
      return { ...state, toast: { msg: action.msg, ts: Date.now() } };

    case 'CLEAR_TOAST':
      return { ...state, toast: null };

    case 'ADD_PLAYER': {
      const name = (action.name || '').trim();
      if (!name) return state;
      if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return { ...state, toast: { msg: `"${name}" is already added`, ts: Date.now() } };
      }
      const newPlayer = {
        id: uid(),
        name,
        wins: 0,
        losses: 0,
        gamesPlayed: 0,
        consecutiveWins: 0,
        bestStreak: 0,
        lastPartner: null,
        resting: false,
      };
      const next = {
        ...state,
        undoStack: snapshotState(state, `add ${name}`),
        players: [...state.players, newPlayer],
        waiting: [...state.waiting, newPlayer.id],
      };
      return autoFillCourts(next);
    }

    case 'BULK_ADD_PLAYERS': {
      const lines = (action.text || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return state;
      const existing = new Set(state.players.map((p) => p.name.toLowerCase()));
      const fresh = [];
      for (const name of lines) {
        const lower = name.toLowerCase();
        if (existing.has(lower)) continue;
        existing.add(lower);
        fresh.push({
          id: uid(),
          name,
          wins: 0,
          losses: 0,
          gamesPlayed: 0,
          consecutiveWins: 0,
          bestStreak: 0,
          lastPartner: null,
          resting: false,
        });
      }
      if (fresh.length === 0) return state;
      const bulkNext = {
        ...state,
        undoStack: snapshotState(state, `bulk add ${fresh.length} players`),
        players: [...state.players, ...fresh],
        waiting: [...state.waiting, ...fresh.map((p) => p.id)],
        toast: { msg: `Added ${fresh.length} player${fresh.length === 1 ? '' : 's'}`, ts: Date.now() },
      };
      return autoFillCourts(bulkNext);
    }

    case 'REMOVE_PLAYER': {
      const id = action.id;
      const player = state.players.find((p) => p.id === id);
      let next = { ...state, undoStack: snapshotState(state, `remove ${player ? player.name : 'player'}`) };
      // If they're on a court, abandon that game and return others to waiting front
      next.courts = next.courts.map((court) => {
        if (court.teamA && (court.teamA.includes(id) || court.teamB.includes(id))) {
          const others = [...court.teamA, ...court.teamB].filter((pid) => pid !== id);
          others.forEach((pid) => {
            if (
              !next.waiting.includes(pid) &&
              !next.winnersQueue.includes(pid) &&
              !next.losersQueue.includes(pid)
            ) {
              next.waiting = [pid, ...next.waiting];
            }
          });
          return { ...court, teamA: null, teamB: null, source: null, startTime: null };
        }
        return court;
      });
      next.players = next.players.filter((p) => p.id !== id);
      next.waiting = next.waiting.filter((pid) => pid !== id);
      next.winnersQueue = next.winnersQueue.filter((pid) => pid !== id);
      next.losersQueue = next.losersQueue.filter((pid) => pid !== id);
      next = ensureModeConsistency(next);
      return autoFillCourts(next);
    }

    case 'TOGGLE_PLAYER_REST': {
      const id = action.id;
      const player = state.players.find((p) => p.id === id);
      if (!player) return state;
      const becomingResting = !player.resting;
      let next = {
        ...state,
        undoStack: snapshotState(state, becomingResting ? `rest ${player.name}` : `resume ${player.name}`),
      };
      next.players = next.players.map((p) =>
        p.id === id ? { ...p, resting: becomingResting, consecutiveWins: becomingResting ? 0 : p.consecutiveWins } : p
      );
      if (becomingResting) {
        // If on a court, abandon the game and return the other 3 to the front of waiting.
        next.courts = next.courts.map((court) => {
          if (court.teamA && (court.teamA.includes(id) || court.teamB.includes(id))) {
            const others = [...court.teamA, ...court.teamB].filter((pid) => pid !== id);
            others.forEach((pid) => {
              if (
                !next.waiting.includes(pid) &&
                !next.winnersQueue.includes(pid) &&
                !next.losersQueue.includes(pid)
              ) {
                next.waiting = [pid, ...next.waiting];
              }
            });
            return { ...court, teamA: null, teamB: null, source: null, startTime: null };
          }
          return court;
        });
        next.waiting = next.waiting.filter((pid) => pid !== id);
        next.winnersQueue = next.winnersQueue.filter((pid) => pid !== id);
        next.losersQueue = next.losersQueue.filter((pid) => pid !== id);
        next.toast = { msg: `${player.name} is resting`, ts: Date.now() };
      } else {
        // Resuming — add to back of waiting; distribution/auto-fill will sort it out.
        next.waiting = [...next.waiting, id];
        next.toast = { msg: `${player.name} is back in the queue`, ts: Date.now() };
      }
      next = ensureModeConsistency(next);
      return autoFillCourts(next);
    }

    case 'CLEAR_ALL': {
      const fresh = initialState();
      return {
        ...fresh,
        undoStack: snapshotState(state, 'clear all'),
      };
    }

    case 'SET_NUM_COURTS': {
      const newCount = Math.max(1, Math.min(6, parseInt(action.value) || 2));
      if (newCount === state.numCourts) return state;
      let next = { ...state, undoStack: snapshotState(state, 'change court count'), numCourts: newCount };
      if (next.started) {
        next.courts = setupCourts(next.courts, newCount);
        next = ensureModeConsistency(next);
        next = autoFillCourts(next);
      }
      return next;
    }

    case 'SET_SESSION_NAME':
      return { ...state, sessionName: action.value };

    case 'SET_SESSION_DATE':
      return { ...state, sessionDate: action.value };

    case 'START_GAMES': {
      const activePlayers = state.players.filter((p) => !p.resting);
      if (activePlayers.length < 4) {
        return { ...state, toast: { msg: 'Need at least 4 active players to start', ts: Date.now() } };
      }
      let next = {
        ...state,
        undoStack: snapshotState(state, 'start games'),
        started: true,
        waiting: shuffle(state.waiting),
        nextBracket: 'winners',
      };
      next.courts = setupCourts(next.courts, next.numCourts);
      return autoFillCourts(next);
    }

    case 'RESET_ROUND': {
      let next = {
        ...state,
        undoStack: snapshotState(state, 'reset round'),
        waiting: state.players.filter((p) => !p.resting).map((p) => p.id),
        winnersQueue: [],
        losersQueue: [],
        nextBracket: 'winners',
        courts: state.courts.map((c) => ({
          ...c,
          teamA: null,
          teamB: null,
          source: null,
          startTime: null,
        })),
        history: [],
        started: false,
        players: state.players.map((p) => ({
          ...p,
          wins: 0,
          losses: 0,
          gamesPlayed: 0,
          consecutiveWins: 0,
          bestStreak: 0,
        })),
      };
      return next;
    }

    case 'RECORD_WIN': {
      const { courtIdx, team } = action;
      const court = state.courts[courtIdx];
      if (!court || !court.teamA) return state;
      const winners = team === 'A' ? court.teamA : court.teamB;
      const losers = team === 'A' ? court.teamB : court.teamA;

      let next = { ...state, undoStack: snapshotState(state, `Court ${court.id} win`) };

      // Update player stats and record last partner
      next.players = next.players.map((p) => {
        const inTeamA = court.teamA.includes(p.id);
        const inTeamB = court.teamB.includes(p.id);
        const partner = inTeamA
          ? court.teamA.find((id) => id !== p.id)
          : inTeamB
          ? court.teamB.find((id) => id !== p.id)
          : undefined;
        const partnerUpdate = partner !== undefined ? { lastPartner: partner } : {};

        if (winners.includes(p.id)) {
          const cw = (p.consecutiveWins || 0) + 1;
          return {
            ...p,
            ...partnerUpdate,
            wins: p.wins + 1,
            gamesPlayed: p.gamesPlayed + 1,
            consecutiveWins: cw,
            bestStreak: Math.max(p.bestStreak || 0, cw),
          };
        }
        if (losers.includes(p.id)) {
          return {
            ...p,
            ...partnerUpdate,
            losses: p.losses + 1,
            gamesPlayed: p.gamesPlayed + 1,
            consecutiveWins: 0,
          };
        }
        return p;
      });

      // Capture history (newest first)
      const endTime = Date.now();
      const durationMs = court.startTime ? endTime - court.startTime : null;
      const nameOf = (id) => next.players.find((p) => p.id === id)?.name || '?';
      next.history = [
        {
          court: court.id,
          winners: winners.map(nameOf),
          losers: losers.map(nameOf),
          source: court.source,
          time: new Date(endTime),
          durationMs,
        },
        ...next.history,
      ];

      const single = isSingleLineMode(next.players, next.numCourts);

      if (single) {
        // King-of-court continuation:
        // - Losers go to back of queue.
        // - Winners stay (split) unless they've already won 2+ in a row.
        let waiting = [...next.waiting, ...losers];
        const staying = [];
        const leaving = [];
        for (const pid of winners) {
          const p = next.players.find((pl) => pl.id === pid);
          if (p && p.consecutiveWins >= 2) {
            leaving.push(pid);
            // Reset their streak on rotation out
            next.players = next.players.map((pl) =>
              pl.id === pid ? { ...pl, consecutiveWins: 0 } : pl
            );
          } else {
            staying.push(pid);
          }
        }
        waiting = [...waiting, ...leaving];

        let updatedCourt = { ...court, teamA: null, teamB: null, source: null, startTime: null };

        if (staying.length === 0 || waiting.length < 4 - staying.length) {
          // Can't immediately field a continuation game; let autoFill handle it
          waiting = [...waiting, ...staying];
        } else {
          const needed = 4 - staying.length;
          const fresh = waiting.slice(0, needed);
          waiting = waiting.slice(needed);
          const shuffledFresh = shuffle(fresh);
          let teamA, teamB;
          const lp = (id) => next.players.find((pl) => pl.id === id)?.lastPartner;
          const wasPartner = (x, y) => lp(x) === y || lp(y) === x;
          if (staying.length === 2) {
            // staying players were partners — split them; pick best fresh assignment
            const [s0, s1] = staying;
            const [f0, f1] = shuffledFresh;
            const c1 = (wasPartner(s0, f0) ? 1 : 0) + (wasPartner(s1, f1) ? 1 : 0);
            const c2 = (wasPartner(s0, f1) ? 1 : 0) + (wasPartner(s1, f0) ? 1 : 0);
            if (c2 < c1) {
              teamA = [s0, f1];
              teamB = [s1, f0];
            } else {
              teamA = [s0, f0];
              teamB = [s1, f1];
            }
          } else {
            // staying.length === 1: stayer anchors teamA, pick best partner from 3 fresh
            const [s0] = staying;
            const [x, y, z] = shuffledFresh;
            const options = [
              { ta: [s0, x], tb: [y, z] },
              { ta: [s0, y], tb: [x, z] },
              { ta: [s0, z], tb: [x, y] },
            ];
            const scored = options.map((o) => ({
              o,
              score: (wasPartner(o.ta[0], o.ta[1]) ? 1 : 0) + (wasPartner(o.tb[0], o.tb[1]) ? 1 : 0),
            }));
            const min = Math.min(...scored.map((s) => s.score));
            const best = scored.filter((s) => s.score === min);
            const chosen = best[Math.floor(Math.random() * best.length)].o;
            teamA = chosen.ta;
            teamB = chosen.tb;
          }
          updatedCourt = {
            ...court,
            teamA,
            teamB,
            source: 'continued',
            startTime: Date.now(),
          };
        }

        next.courts = next.courts.map((c, i) => (i === courtIdx ? updatedCourt : c));
        next.waiting = waiting;
      } else {
        // Bracket mode: winners and losers go to their respective queues.
        next.winnersQueue = [...next.winnersQueue, ...winners];
        next.losersQueue = [...next.losersQueue, ...losers];
        next.courts = next.courts.map((c, i) =>
          i === courtIdx
            ? { ...c, teamA: null, teamB: null, source: null, startTime: null }
            : c
        );
      }

      return autoFillCourts(next);
    }

    case 'EDIT_COURT_PLAYERS': {
      const { courtIdx, teamA, teamB } = action;
      const court = state.courts[courtIdx];
      if (!court || !court.teamA) return state;

      const oldPlayers = [...court.teamA, ...court.teamB];
      const newPlayers = [...teamA, ...teamB];
      const removed = oldPlayers.filter((id) => !newPlayers.includes(id));
      const added = newPlayers.filter((id) => !oldPlayers.includes(id));

      // Remove added players from whichever queue they're in
      let waiting = state.waiting.filter((id) => !added.includes(id));
      let winnersQueue = state.winnersQueue.filter((id) => !added.includes(id));
      let losersQueue = state.losersQueue.filter((id) => !added.includes(id));

      // Return removed players to the front of waiting
      waiting = [...removed, ...waiting];

      const courts = state.courts.map((c, i) =>
        i === courtIdx ? { ...c, teamA, teamB } : c
      );

      return {
        ...state,
        undoStack: snapshotState(state, `Edit Court ${court.id} players`),
        courts,
        waiting,
        winnersQueue,
        losersQueue,
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) {
        return { ...state, toast: { msg: 'Nothing to undo', ts: Date.now() } };
      }
      const stack = [...state.undoStack];
      const top = stack.pop();
      return {
        ...top.data,
        undoStack: stack,
        toast: { msg: `Undid: ${top.label}`, ts: Date.now() },
      };
    }

    case 'NEW_SESSION': {
      const fresh = initialState();
      return { ...fresh, undoStack: snapshotState(state, 'new session') };
    }

    case 'END_SESSION_LOCAL': {
      // After archiving externally, reset local state.
      const fresh = initialState();
      return {
        ...fresh,
        undoStack: snapshotState(state, 'end session'),
        toast: { msg: action.msg || 'Session ended', ts: Date.now() },
      };
    }

    default:
      return state;
  }
}

// ============================================================
// Context + provider
// ============================================================
const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const fresh = initialState();
    const loaded = loadLiveState();
    if (loaded) {
      return {
        ...fresh,
        ...loaded,
        // The session-local fields don't persist across reloads.
        undoStack: [],
        toast:
          loaded.players?.length > 0 || loaded.history?.length > 0
            ? { msg: 'Session restored from your last visit', ts: Date.now() }
            : null,
      };
    }
    return fresh;
  });

  // Auto-save every meaningful state change (debounced trivially via batching)
  const initialSaveRef = useRef(false);
  useEffect(() => {
    // Skip the very first save during initial mount in StrictMode double-invoke
    if (!initialSaveRef.current) {
      initialSaveRef.current = true;
    }
    saveLiveState(state);
  }, [state]);

  // Auto-clear toasts after 1.8s
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 1800);
    return () => clearTimeout(t);
  }, [state.toast]);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
