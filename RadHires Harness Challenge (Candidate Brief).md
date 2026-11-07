# **RadHires Harness Challenge**

Thanks for getting this far with us. We're genuinely excited to see how you think. This exercise is deliberately open-ended. There is no hidden "correct" answer we're waiting for you to guess. We're far more interested in the problem you choose to solve, the way you reason about it, and the care you put into the people who'll actually use what you build. Please read the whole brief before you start. The **What we're looking for** and **Deliverables** sections tell you how to spend your effort well.

**Invent a problem worth solving inside a business, then build an AI-powered "harness" that solves it. Design the interface that lets an everyday, non-expert user operate that harness and walk away with a polished result.**

That's the whole thing. The problem can live in any function: marketing, sales, support, operations, finance, HR, product, logistics, legal, recruiting, a warehouse floor, whatever you like. You pick the department, you pick the pain, you pick the stack. We intentionally aren't handing you a domain, because *what you choose to work on* tells us as much as how you build it.

### **1\. Find and frame the problem**

Identify a real, specific pain that a person in a business feels today, and write a crisp thesis: who has this problem, what it costs them, and why an AI harness is a good fit for it (and honestly, where it isn't). Narrow is better than broad. A sharp, well-bounded problem beats an ambitious, fuzzy one.

### **2\. Build the harness**

The "harness" is the system that does the actual work — the orchestration around the model(s): prompts, tools, retrieval, control flow, validation, guardrails, evaluation, whatever your solution needs. It should take a messy real-world input or process and reliably produce a desired outcome. You don't need production hardening, but we want to see a working vertical slice, not a diagram of one.

### **3\. Design the interface for everyday users**

Design how a non-technical end user interacts with the harness to get the "polished end result." This is where end-user empathy shows. The person on the other side may not be an engineer and does not care about your model choice; they want a good outcome with minimal friction. Decide what they see, what they type or click, how they know it worked, and what happens when it doesn't. The interface can be a web UI, a chat surface, etc… whatever genuinely fits *that* user in *that* context. Justify the choice.

## 

## **Ground rules**

> * **Any stack, any tools.**

> Use whatever models, frameworks, libraries, and services you think are right. There is no preferred vendor and no bonus for using something trendy. We care about your reasoning far more than your selection.

> * **Use AI assistants freely**

> Copilot, Claude, Cursor, ChatGPT, agents are all fair game and frankly expected. Building fluently with AI tooling *is* the job. We only ask that you understand and can defend everything you submit.

> * **Scope to a vertical slice.**

> One real workflow that works end to end beats five half-built features. It's completely fine to mock or stub the parts that aren't the interesting bit (fake data, a canned data source, a single happy-path integration). Just tell us what you stubbed and why.

> * **Keys and data.**

> Use free tiers, personal keys, synthetic data, or mocks. Never include real secrets in your submission, and don't use anything proprietary or confidential from a current or former employer. **Rad Hires can provide a temporary Claude API key upon request if needed, no Fable access.**

> * **It does not need to be production-ready.**

> We're not grading uptime. We're reading your judgment.

## **What we're looking for**

We evaluate every submission across five dimensions. A strong submission tends to demonstrate:

> * **Problem selection & framing.**

> You chose a real problem, bounded it well, and can articulate who hurts, how much, and why this approach fits.

> * **End-user empathy.**

> You clearly designed for the actual human who'll use this with their context, vocabulary, and tolerance for friction in mind.

> * **Elegance & technical judgment.**

> The solution is right-sized. You reach for the simplest thing that works, handle the ways it can fail, and have some way of knowing whether it's actually any good (evals, checks, a feedback loop).

> * **Tooling choices & rationale.**

> Your stack fits the problem, and you can explain the tradeoffs you weighed, including what you deliberately chose *not* to do.

> * **Thinking & communication.**

> Your reasoning is clear and honest. You're upfront about limitations, what you'd do with more time, and where you're uncertain.

Notice what's not on that list: lines of code, polish, or breadth. We would much rather see a small thing done thoughtfully than a large thing done carelessly.

## **Scope & time**

There's no hard deadline and no stopwatch. We're not measuring how fast you are, and we don't want you clearing your calendar for a week. As a rough guide, most people spend somewhere between a focused half-day and two days on this. Spend what you feel the problem deserves, then **tell us how much time you actually spent** and what you'd tackle next with more of it. Right-sizing your own effort is part of what we're evaluating.

If you can't get everything, that's expected and fine. Scope down deliberately and say so. A candidate who ships a clean, honest slice and names the tradeoffs reads far stronger than one who sprawls.

Please aim to send your submission within about a week of receiving this, or just let us know if you need a different window.

## **Deliverables**

### **1\. A working prototype (code repository)**

A runnable harness in a Git repo (GitHub, GitLab, or a zip if you'd rather). Include a **README** that covers:

> * What the thing does and who it's for, in a couple of sentences.  
> * How to run it — setup steps, dependencies, and any keys or env vars needed. If it's genuinely hard to run locally, a short recorded demo (Loom or similar) is a perfectly good substitute; include the link.  
> * What's real vs. stubbed, and any known limitations.

### **2\. A written design document**

Short is fine. Roughly one to three pages.

> * **The problem thesis** — who has it, what it costs, why an AI harness fits.  
> * **The end user & the interface** — who uses it, what their experience is, and why you chose that interface.  
> * **Architecture & the harness** — how it works, the key components, and how you handle failure and quality.  
> * **Tooling & tradeoffs** — what you chose, why, and what you weighed against it.  
> * **Reflections** — time spent, what you'd do next, and what you're least sure about.

The design doc can live in the repo (as a DESIGN.md) or be a separate document — your call.

## 

## **How to deliver**

Send the following to [**submissions@radhires.com**](mailto:submissions@radhires.com):

> * A link to your repository on Github.  
> * A link to, or copy of, your design document.  
> * Any demo video or run notes, if you have them.

If your repo is private, please share access with **@joniler on Github**.

## 

## **A few common questions**

**Can I really use AI tools to build this?**  
Yes, absolutely, we expect it. Just be ready to explain and defend your choices; we may walk through the submission with you afterward.

**How "done" does it need to be?**  
One workflow working end to end is the target. Stub the rest.

**What if my idea feels too simple?**  
Simple problems solved with real craft consistently score well. Depth beats scope.

**Will I get to talk through it?**  
Usually yes. If we move forward, we'll often spend part of a follow-up conversation exploring your submission together… so build something you're happy to talk about.

Have a question before you start? 

Just reach out to **The Rad Hires Recruitment Team** at [**submissions@radhires.com**](mailto:submissions@radhires.com). We're happy to help.

Have fun with it. We're looking forward to seeing what you choose to build.