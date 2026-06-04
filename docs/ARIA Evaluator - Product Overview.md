# ARIA Evaluator

Introducing **ARIA Evaluator**.

A new kind of platform for teams building AI agents that have to do more than sound smart. They have to be safe. Reliable. Ready for the real world. ARIA runs structured conversations against your agents, challenges them with the moments that matter, and scores every answer with the precision of an expert judge. It streams results live. It generates reports instantly. It works from a laptop in Docker or at cloud scale on AWS. This is enterprise AI evaluation, reimagined with clarity, speed, and conviction. For the first time, testing an AI agent feels as modern as building one.

## Intelligent.

ARIA doesn’t just run your tests. It thinks about them.

Every conversation is evaluated by an LLM-as-judge on Amazon Bedrock, scoring safety, quality, escalation, and tone with expert-level consistency. The judge prompt is role-aware, skill-aware, and grounded in ten built-in guardrails that span functional behavior, security, adversarial risk, and edge conditions. We call it better judgment, built in.

## Adversarial.

Real agents don’t fail in perfect demos. They fail under pressure.

ARIA is built to attack your system before someone else does. Prompt injection. Jailbreaks. Social engineering. Indirect injection. Script-based manipulation. The platform includes a dedicated adversarial scenario library with nine focused attack files, so teams can test resilience as rigorously as they test features. Boldly. Repeatedly. On purpose.

## Structured.

Great evaluation starts with great scenarios.

ARIA uses simple, YAML-based conversation definitions to run repeatable tests across functional flows, escalation moments, and difficult edge cases. That means the same scenario can be versioned, reviewed, automated, and trusted. Ten scenario types. One platform. No compromises. Under the hood, those structured traces become consistent evaluation inputs that scale from a single check to a full release gate.

## Everywhere.

Your agents live in different places. ARIA meets them there.

It connects across providers and channels, including Amazon Connect for voice, AWS Lex, Azure Direct Line, OpenAPI HTTP services, WebSocket agents, GitHub Copilot Chat, and Strands or AgentCore deployments. Local or cloud. Prototype or production. ARIA gives teams one evaluation surface for a fragmented AI stack, with deployment options that run cleanly in Docker or on AWS with ECS Fargate and CloudFront.

## Live.

The moment a run starts, the signal starts flowing.

ARIA streams results in real time to a React browser dashboard, turning evaluation from a batch job into an experience. You see transcripts, scores, progress, and failures as they happen. Then you export polished HTML and machine-readable JSON reports for the people who need confidence and the systems that need proof. Fast in the browser. Useful everywhere else.

## Efficient.

Serious evaluation should feel powerful, not wasteful.

ARIA collapses multi-turn traces into a single Bedrock evaluation batch, so one conversation can be judged in one call instead of many. That means lower latency, better token efficiency, and clearer operations at scale. Default judge output stays tuned to 1200 tokens with dynamic scaling, and every call is logged directly in the run terminal with clear **[Xin/Yout]** visibility. Precision you can feel. Efficiency you can measure.

## Aware.

Global systems deserve global intelligence.

ARIA is region-aware from the start. Operators choose the judge AWS region in Settings, including **eu-west-2**, **us-east-1**, **us-west-2**, and **ap-northeast-1**, and the available model list updates live. For newer Bedrock models like Claude 3.5, Claude 4.x, and Nova, ARIA automatically applies the correct geo-prefixed inference profile when required. Region-aware. Inference-profile-ready. Works everywhere Bedrock does.

## Clear.

When evaluation fails, the platform should tell you exactly why.

ARIA surfaces judge errors where teams actually work: in the run terminal UI and in Docker container logs. Empty evaluation dimensions are guarded automatically. Token flow is visible per call. Operational issues stop being mysteries and start becoming decisions. The result is a system that feels crafted not just for testing AI, but for running it responsibly.

## Secure.

Trust starts with the platform itself.

ARIA includes an admin bootstrap flow with a forced first-login password change, because evaluation infrastructure deserves the same discipline as production infrastructure. And it goes further: evaluated transcripts can become training assets through a fine-tuning pipeline that generates Bedrock-ready datasets. Test. Learn. Improve. Then do it again.

## Available today.

ARIA Evaluator brings structure to agent testing, rigor to AI judgment, and elegance to a problem that has felt too messy for too long.

It doesn’t just help teams ship AI. It helps them believe in it.

**Available today.**
