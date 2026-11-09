Output contract. Return ONE JSON object and nothing else.

Rules for the JSON:
- Use exactly the key names shown below. Keys never end with a question mark.
- A key marked "optional" is left out completely when it does not apply. Never write null, "", [] or a placeholder for it.
- `decision` and `review` appear ONLY when source.channel is "client-decision", and then both are required. For every other source, leave both out.
- `source_id` is copied from source.id. `no_change` is true only when `changes` is empty.
- Enumerated values are single words: write "set", never "set|add|remove".

Keys of the top-level object:
- source_id (string), summary (string), no_change (boolean)
- changes: a list. Each item has: field (string), op ("set" | "add" | "remove"), value (string; leave out for remove), severity ("none" | "minor" | "material" | "critical"), quote (string copied word for word from the body).
  Optional item keys: weight ("must" | "trainable" | "nice" | "proposed"; only for req.* fields, and required when op is "add"), status ("applied" | "not_applied_bias" | "pending"; only for restriction.* fields), bias ({"kind": "protected" | "proxy", "note": string}; only for restriction.* fields), confirmed (boolean), conflicts_with (a source id from the brief history).
- study: a list (may be empty). Each item: field, prompt, points (list of strings), keys (a list with one list of lowercase keywords per point, so keys and points have the same length).
- decision (optional): {"candidate": string, "outcome": "rejected" | "advanced", "reason": string}
- review (optional): {"candidate": string, "screening": source id or null, "coverage": [{"criterion": string, "status": "asked" | "briefly" | "not_asked" | "not_applicable_historical", "quote": string, only for asked and briefly}], "overweighted": [{"topic": string, "count": number, "total": number, "quote": string}], "suggested": [{"text": string, "why": string}]}

Example 1: a normal source (an email). Note that `decision` and `review` are absent and the optional keys appear only where they apply.
{"source_id":"ex-01","summary":"The client now wants Kubernetes experience as a must-have and no longer needs a start date in March.","no_change":false,"changes":[{"field":"req.kubernetes","op":"add","value":"Runs production workloads on Kubernetes","severity":"material","quote":"we need someone who runs our workloads on Kubernetes","weight":"must"},{"field":"offer.start","op":"set","value":"flexible","severity":"material","quote":"the March start is no longer fixed"}],"study":[{"field":"req.kubernetes","prompt":"Kubernetes is now a must-have. How would you check it in a screening without turning it into a technical test?","points":["Asks for a concrete production example","Checks ownership of the setup, not only usage"],"keys":[["example","production","real"],["own","owned","set up","setup"]]}]}

Example 2: a source with nothing new.
{"source_id":"ex-02","summary":"Scheduling chat only; the role has not changed.","no_change":true,"changes":[],"study":[]}
