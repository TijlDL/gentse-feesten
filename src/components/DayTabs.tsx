import { useApp } from '../appContext';
import { DAYS, DOW } from '../config';
import { vandaagFeestdag } from '../lib/tijd';

export function DayTabs() {
  const { state, set, tijdRef } = useApp();
  const todayFest = vandaagFeestdag();
  return (
    <nav className="days" id="dayTabs" aria-label="Kies een feestdag">
      {DAYS.map(d => (
        <button key={d}
          className={'day' + (d === state.dag ? ' active' : '') + (d === todayFest ? ' today' : '')}
          onClick={() => { tijdRef.current = 'nu'; set({ dag: d }); }}>
          <span className="dow">{DOW[d]}</span><span className="dnum">{d}</span>
        </button>
      ))}
    </nav>
  );
}
