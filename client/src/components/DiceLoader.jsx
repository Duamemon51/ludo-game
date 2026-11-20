export default function DiceLoader({ label, showLabel = true }) {
  return (
    <div
      className="dice-loader-status"
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <span className="dice-loader" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span>
      {showLabel && <span>{label}</span>}
    </div>
  );
}
