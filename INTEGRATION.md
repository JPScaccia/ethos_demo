Ethos should live inside the existing Catholic Text application.

Suggested route:
  /ethos

Catholic Text continues to own:
  authentication
  user accounts
  navigation
  subscriptions/access
  analytics
  site styling
  deployment

Ethos owns:
  query interpretation
  retrieval
  evidence construction
  synthesis
  grounding
  claim auditing
  source construction
###################################################

The main server contract:
  runEthosQuery({
  query,
  grade: 8,
  month: null,
  intent: null
})

Returning

{
  query,
  grade,
  month,
  intent,
  intentConfidence,
  answer,
  sources,
  safeToDisplay,
  qa
}
