## ADDED Requirements

### Requirement: Structured working memory
Lab 23 SHALL configure Mastra working memory with a strict preferences schema at resource scope and store preferences the agent learns through its `updateWorkingMemory` tool.

#### Scenario: Learned in conversation
- **WHEN** the user says "I'm Ana. I always fly from LIS and I prefer window seats." and then "Also, I'm vegetarian."
- **THEN** the stored working memory contains name Ana, home airport LIS, seat window and dietary vegetarian

### Requirement: Preference survives the next conversation turn
Preferences SHALL be available to the agent in a later turn, including in a new thread for the same user.

#### Scenario: New thread
- **WHEN** the follow-up "Book my next flight…" is sent in a new thread
- **THEN** the answer mentions the stored seat, home airport and dietary preference

### Requirement: Schema rejects bad updates
Invalid updates SHALL be rejected with reasons and SHALL NOT change the stored preferences, whether they come from the agent's tool or from the direct profile API.

#### Scenario: Invalid conversational update
- **WHEN** the user asks to be seated "on the roof"
- **THEN** the tool call fails validation and the stored seat is still window

#### Scenario: Invalid direct updates
- **WHEN** the settings updates `{ "seat": "cockpit" }`, `{ "dietary": ["vegan", "vegan"] }` and `{ "homeAirport": "lisbon" }` are applied
- **THEN** each is rejected with a field-level reason, and the valid update `{ "currency": "EUR" }` is merged into the profile

#### Scenario: Validation turned off
- **WHEN** direct-update validation is disabled
- **THEN** a bad update is stored as-is and replaces the profile, and the `stored-matches-schema` check fails
