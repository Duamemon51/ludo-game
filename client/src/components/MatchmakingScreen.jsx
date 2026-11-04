export default function MatchmakingScreen({ secondsLeft, onCancel }) {
  return (
    <div className="card center">
      <div className="spinner" />
      <p>Finding players... {secondsLeft}s</p>
      <button className="btn alt" onClick={onCancel}>Cancel</button>
    </div>
  );
}
