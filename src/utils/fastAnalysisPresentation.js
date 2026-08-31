const normalizedDecision = value => String(value || 'HOLD').toUpperCase()
const normalizedBias = value => String(value || '').toUpperCase()

export function resolveDecisionLabelKey ({ decision, bias, score } = {}) {
  const action = normalizedDecision(decision)
  if (action === 'BUY') return 'fastAnalysis.outlookBull'
  if (action === 'SELL') return 'fastAnalysis.outlookBear'

  const direction = normalizedBias(bias)
  const numericScore = Number(score)
  const hasScore = Number.isFinite(numericScore)
  if (direction === 'MILD_BULLISH' || direction === 'BULLISH' || (hasScore && numericScore >= 10)) {
    return 'fastAnalysis.outlookMildBull'
  }
  if (direction === 'MILD_BEARISH' || direction === 'BEARISH' || (hasScore && numericScore <= -10)) {
    return 'fastAnalysis.outlookMildBear'
  }
  return 'fastAnalysis.outlookNeutral'
}
