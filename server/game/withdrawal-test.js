const assert = require('node:assert/strict');
const { MIN_WITHDRAWAL, getWithdrawableWinnings } = require('./withdrawal');

assert.equal(MIN_WITHDRAWAL, 2000);
assert.equal(getWithdrawableWinnings(2500, 500), 2000);
assert.equal(getWithdrawableWinnings(1999.99, 0), 1999.99);
assert.equal(getWithdrawableWinnings(3000, 3500), 0);
assert.equal(getWithdrawableWinnings(Number.NaN, 0), 0);
console.log('PASS: withdrawal availability uses net winnings and subtracts pending requests');
