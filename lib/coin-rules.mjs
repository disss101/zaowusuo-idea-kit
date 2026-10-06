export class CoinRuleError extends Error {}

function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new CoinRuleError(`${label}必须是 ${min}–${max} 之间的整数。`);
  }
  return value;
}

export function validateCoinRules(input) {
  if (!input || typeof input !== 'object') throw new CoinRuleError('请先配置造物币规则。');
  const rules = {
    coinsPerYuan: integer(input.coinsPerYuan, '每元兑换币数', 1, 1000),
    aiGenerationCoins: integer(input.aiGenerationCoins, '一次方案生成的币数', 1, 10000),
    minUnlockCoins: integer(input.minUnlockCoins, '最低解锁价', 1, 100000),
    maxUnlockCoins: integer(input.maxUnlockCoins, '最高解锁价', 1, 100000),
    creatorShareBps: integer(input.creatorShareBps, '作者分成基点', 0, 10000),
  };
  if (rules.minUnlockCoins > rules.maxUnlockCoins) throw new CoinRuleError('解锁价范围配置错误。');
  return rules;
}

export function topupCoins(amountFen, input) {
  const rules = validateCoinRules(input);
  integer(amountFen, '充值金额（分）', 100, 1000000);
  // A top-up amount must be an exact number of yuan until fractional rules are defined.
  if (amountFen % 100 !== 0) throw new CoinRuleError('当前仅支持整元充值。');
  return amountFen / 100 * rules.coinsPerYuan;
}

export function generationCharge(input) {
  return validateCoinRules(input).aiGenerationCoins;
}

export function unlockSplit(priceCoins, input) {
  const rules = validateCoinRules(input);
  integer(priceCoins, '作品解锁价', rules.minUnlockCoins, rules.maxUnlockCoins);
  const creatorCoins = Math.floor(priceCoins * rules.creatorShareBps / 10000);
  return { buyerDebit: priceCoins, creatorCredit: creatorCoins, platformCredit: priceCoins - creatorCoins };
}
