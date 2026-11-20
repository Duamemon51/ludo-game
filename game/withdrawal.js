const MIN_WITHDRAWAL = 2000;

function getWithdrawableWinnings(netGameProfit, pendingWithdrawals = 0) {
  const profit = Number(netGameProfit);
  const pending = Number(pendingWithdrawals);
  if (!Number.isFinite(profit) || !Number.isFinite(pending)) return 0;
  return Math.max(0, Math.round((profit - pending + Number.EPSILON) * 100) / 100);
}

module.exports = { MIN_WITHDRAWAL, getWithdrawableWinnings };
