# Product Spec

## Goal

Build an AI-powered developer execution assistant that:

- reads Discord mentions
- converts messages into tasks
- reminds developers about pending work
- explains tasks using local repo context
- helps developers stay aligned and avoid forgetting work

## What this product IS

An **AI execution alignment assistant**. Main value:

- developers stop forgetting work
- developers stay synced
- developers understand tasks clearly

## What this product is NOT

- an AI coding replacement
- an autonomous engineer
- an AGI assistant

**Core principle:** the AI only *suggests*. The developer stays in control at every step.

## MVP scope

### Must have

- Discord integration
- Task extraction
- VS Code extension
- Repo-aware AI explanations
- Reminders
- Daily summaries

### Do NOT build (out of scope for MVP)

- multi-agent systems
- autonomous coding
- Slack / Teams integrations
- billing
- enterprise dashboards
- browser agents
- desktop apps

## The most important UX flow

```
Manager sends a message
        ↓
AI extracts a task
        ↓
VS Code shows a notification
        ↓
AI explains what likely needs to be done
        ↓
AI reminds until completed
        ↓
AI generates a standup summary
```

## UX principles

Optimize for:

- speed
- simplicity
- low friction
- clean notifications

## Success metric

Users say:

> "This actually helps me stay organized and reduces mental overload."

**Not:**

> "Cool AI demo."
