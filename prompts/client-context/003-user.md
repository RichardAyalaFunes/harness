# Human answers C1–C20 and UI style reference

Chat: client-context (forked into worktree claude/vibrant-goldstine-051d8a), 2026-11-07. Visible message verbatim, with two attached files.

> The design MD file that I want for this, for the UI, I mean, is this file, which is located on the download folder. But you already created a design.md file, which I think is the planned response that you want to give to the, as an output, right?
> - I added my response here. Go ahead and validate it. Yes, merge that to the main.

Attachment 1: `Downloads/DESIGN.md` is a UI style reference, copied verbatim to `docs/ui-style-reference.md`.
Attachment 2: `Downloads/client-context-answers.json`, verbatim:

```json
{
  "schemaVersion": 1,
  "artifact": "client-context-discovery",
  "source": "prompts/client-context/001-user.md",
  "answers": {
    "C1": "A",
    "C1-notes": "",
    "C2": "A",
    "C2-notes": "",
    "C3-notes": "agree with the proposal",
    "C4": "A",
    "C4-notes": "",
    "C5": "A",
    "C5-notes": "As an additional step for the harness, let's define a chain of thoughts, a chain of thoughts like it was on lang graph, on lang chain, which is a series of steps to confirm. For example, if we learn something new about the role that we are trying to fill, of course, the first step, for example, is confirming if there are any missing information that we have to take as a question. For example, let's say the JD now, the same in the example that you are giving, the senior backend engineer for this startup that has recently raised, we found that has recently founded a Series A. If something changed there, the first step is that the AI must analyze what changed. The second step, for example, is generate the questions. The third step is the answers for those questions. The fourth step is, for example, revalidating and to ensure if they make sense, then a review from the human, then uploading that information to somewhere, could be the ATS if it's connected, could be a shared channel if it's part of the step. But I don't want you to define this as I was saying, I want you to see the example. For example, this is a series of steps that must be checked by the AI. If the AI hasn't completed this step, it cannot be checked because remember, this is a harness engineering. So it means that the AI must behave freedom but with constraints, with definitions step by step and in order to avoid the AI forget any step because the AI can forget, we are, it's important for every, let's say every step, every stage, we define the this kind of harness, this kind of checks. Imagine this, what I said, the example that I gave, the example that I gave, let's imagine it like it was a real change and we need to ensure that every step was made. So the input from the client came, okay, we need to rethink about it. We created the questions, okay, how the AI knows that it created the question? There must be a file with the questions that the AI created. So now it's checked because the AI made the questions. Then does the human review already those questions? Yes, no. How can we know that? Because the answers are already in the file that the AI created. And so, so check that checkbox, that fictional checkbox, okay? It's more like an abstract checkbox, but I want you to think on steps. The AI cannot move, well, can jump some steps depending of course on the scenario, but in order to avoid, and this must be a rule for the agents maybe, in order to avoid losing any step, it's important to behave like a chain of thoughts. So remember what I said from the objective, there is going to be a primary objective and in order to accomplish that, the secondary objective. This is the same. In order to accomplish the objective, you have a series of activities that you have to complete in order to consider that as successful. So that way of thinking I need you to apply. So it's like define the workflow and in order to consider that as done, well, you have to go check by check.",
    "C6": "A",
    "C6-notes": "In a real environment, let's consider also that the AI can access the information that is created, but of course with a hook. Let's say in a real environment with a real transcript on Google Meet, the AI can, let's say five times a day, try to see if there are any relevant information that they need to take or if the human also can trigger this. But of course, this is out of the scope, so we must be tracking also what things we are placing as out of scope, what is not part of this MVP because the limitation of the system that we are not connected to a real tenant.",
    "C7": "A",
    "C7-notes": "Yes, in this case, because those are the client's restrictions, we cannot do anything on that. So, even though this is a bias or whatever, we have to take care that we follow the client's needs.",
    "C8": "A",
    "C8-notes": "",
    "C9": "A",
    "C9-notes": "",
    "C10": "A",
    "C10-notes": "",
    "C11": "A",
    "C11-notes": "Good options. Now let's take I choose the option A, JSONL. Because it's more readable for this assessment. If the recruiters need to evaluate this environment, they can see the information, they can go through that. However, my preferred option in production will be using a real database connection. The other option that I was going to choose was SQLite, but it means that our information is going to be saved on binaries, so for audit, this assessment, it won't work. So that's why I choose keeping on JSONL.",
    "C12": "A",
    "C12-notes": "",
    "C13": "A",
    "C13-notes": "",
    "C14": "A",
    "C14-notes": "",
    "C15": "A",
    "C15-notes": "",
    "C16": "A",
    "C16-notes": "",
    "C17": "A",
    "C17-notes": "",
    "C18": "A",
    "C18-notes": "",
    "C19-notes": "The role that you created, the backend, is right. Then also think of a founding engineer role, which is going to be the first engineer on the role. You can search for similar roles on the internet. Ideally, you should search for that so that way you have sample of data on how the JDs for these roles look like. As you proposed in your example, the backend engineer, yes, because this is a team that is already built. So it means that the team is for a small-medium company size, while the founding engineer is the first engineer in the team. Then you can also simulate an AI agent engineer that is going to sum also to the previous, to the first company, to the backend engineer role, its company. Let's suppose there is a second role open for the AI engineering. So we can create a story there like the team is expanding with more capabilities, that kind of stuff. So it means that we will have two companies, a small one which is starting an early stage startup, while having a second one with two open roles.",
    "C20-notes": "We have a deadline, but I will manage that, so you have to continue. There is no time budget also and any other constraints that I forgot to tell you. If I remember any constraints, I will tell you."
  },
  "exportedAt": "2026-11-07T23:21:38.530Z"
}
```
