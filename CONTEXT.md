# Claim Integrity Context

Shared domain language for the claim-integrity demo. This glossary defines product and workflow terms only; implementation details live in the build docs.

## Language

**Shopee Reviewer**:
An internal Shopee user who reviews buyer refund claims using the triage system.
_Avoid_: Seller, merchant, operator

**Buyer**:
The marketplace customer who submitted a refund claim after receiving an order.
_Avoid_: Account, customer account, claimant

**Refund Claim**:
A buyer's request for refund or remediation, including claim text, reason category, evidence images, and order/product context.
_Avoid_: Ticket, dispute, return request

**Claim Triage**:
The advisory assessment of a Refund Claim into a Risk Score, Risk Band, per-signal evidence, and recommended next action.
_Avoid_: Fraud decision, adjudication, auto-denial

**Risk Score**:
A whole-number 0-100 ordinal score that ranks claim-integrity risk for triage.
_Avoid_: Fraud probability, fraud score, confidence score

**Risk Band**:
The Low, Elevated, or High category derived from the Risk Score.
_Avoid_: Verdict, decision, fraud label

**Webhook-Fed Claim**:
A Refund Claim made available to the system from Shopee/platform data rather than entered manually in this product.
_Avoid_: Manual input, reviewer-created claim, form submission
