# THREATS.md

| Threat | How it could happen | Defence | Test |
|--------|--------------------|---------|------|
| Choosing your own role | Sending role=admin when registering | Server always creates holders | Done manually: registered with role admin, got holder |
| Reading someone else's account | Guessing another account id | Ownership check, 404 for non-owners | Done manually: second user got 404 |
| Double payment | Same request sent twice | Idempotency key unique per user | TODO |
| Overdraw | Two withdrawals at the same moment | Row locks plus balance check in one DB transaction | TODO |
| Editing history | Changing ledger or audit rows | Database triggers block update and delete | TODO |