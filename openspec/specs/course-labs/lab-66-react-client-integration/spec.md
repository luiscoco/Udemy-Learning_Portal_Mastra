# course-labs/lab-66-react-client-integration Specification

## Purpose
Define the React client integration lab (L66): consume agent runs through the typed client SDK against a disposable loopback API built from the real run engine, with learner-controlled stream drops, contract drift and cancellation, and no model keys near the browser.

## Requirements

### Requirement: Lab 66 exercises the typed client against a real run engine
The lab SHALL drive a disposable loopback API built from the real LabRunner through the SDK, with learner-controlled stream drops, contract drift and cancellation, and report every SDK call, event and request.

#### Scenario: Stream dropped and resumed
- **WHEN** the learner drops the stream after three events
- **THEN** the output shows one reconnect with Last-Event-ID and contiguous sequence numbers without duplicates

#### Scenario: No credentials on the wire
- **WHEN** the lab inspects every request the loopback API received
- **THEN** none carries an authorization header, an API key header or a provider-key-like value
